import crypto from 'node:crypto';

import { after, NextResponse } from 'next/server';

import {
  ensureSubscriptions,
  getAppAccessToken,
  getServiceClient,
  syncCurrentStream,
} from '@/lib/twitchEventSub.server';

const TWITCH_WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const STREAM_STATUS_RECOVERY_INTERVAL_SECONDS = 5;
const SUBSCRIPTION_RECONCILE_INTERVAL_SECONDS = 15 * 60;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

interface EventSubBody {
  challenge?: string;
  subscription?: {
    id?: string;
    type?: string;
    status?: string;
    condition?: {
      broadcaster_user_id?: string;
    };
  };
  event?: {
    id?: string;
    started_at?: string;
    broadcaster_user_id?: string;
    message_id?: string;
    chatter_user_id?: string;
    chatter_user_name?: string;
    chatter_user_login?: string;
    message?: {
      text?: string;
    };
  };
}

function verifyEventSubSignature(
  rawBody: string,
  messageId: string,
  timestamp: string,
  signature: string,
): boolean {
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return false;
  if (Math.abs(Date.now() - timestampMs) > MAX_MESSAGE_AGE_MS) return false;

  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', TWITCH_WEBHOOK_SECRET)
      .update(messageId + timestamp + rawBody)
      .digest('hex');

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

async function updateDiagnostic(
  twitchId: string,
  values: Record<string, string | null>,
): Promise<void> {
  try {
    await getServiceClient().from('webhook_diagnostics').upsert({
      twitch_id: twitchId,
      ...values,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to update Twitch webhook diagnostics:', error);
  }
}

export async function POST(request: Request) {
  let twitchIdForDiagnostic: string | null = null;

  try {
    if (!TWITCH_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return new NextResponse('Webhook is not configured', { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get('Twitch-Eventsub-Message-Signature');
    const messageId = request.headers.get('Twitch-Eventsub-Message-Id');
    const messageTimestamp = request.headers.get('Twitch-Eventsub-Message-Timestamp');
    const messageType = request.headers.get('Twitch-Eventsub-Message-Type');

    if (!signature || !messageId || !messageTimestamp || !messageType) {
      return new NextResponse('Missing EventSub headers', { status: 400 });
    }

    if (!verifyEventSubSignature(rawBody, messageId, messageTimestamp, signature)) {
      return new NextResponse('Invalid or expired signature', { status: 403 });
    }

    const body = JSON.parse(rawBody) as EventSubBody;

    if (messageType === 'webhook_callback_verification') {
      const twitchId = body.subscription?.condition?.broadcaster_user_id;
      if (twitchId) {
        await updateDiagnostic(twitchId, {
          subscription_status: 'verification_received',
          subscription_id: body.subscription?.id ?? null,
          last_webhook_error: null,
        });
      }

      if (!body.challenge) {
        return new NextResponse('Missing challenge', { status: 400 });
      }

      return new NextResponse(body.challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    if (messageType === 'revocation') {
      const twitchId = body.subscription?.condition?.broadcaster_user_id;
      if (twitchId) {
        await updateDiagnostic(twitchId, {
          subscription_status: body.subscription?.status ?? 'revoked',
          subscription_id: body.subscription?.id ?? null,
          last_webhook_error: 'Subscription revoked by Twitch',
        });
      }
      return new NextResponse('OK', { status: 200 });
    }

    if (messageType !== 'notification' || !body.event || !body.subscription?.type) {
      return new NextResponse('Event ignored', { status: 200 });
    }

    const event = body.event;
    const subscriptionType = body.subscription.type;
    const twitchId = event.broadcaster_user_id;

    if (!twitchId) {
      return new NextResponse('Missing broadcaster id', { status: 400 });
    }
    twitchIdForDiagnostic = twitchId;

    const service = getServiceClient();
    await updateDiagnostic(twitchId, {
      last_webhook_received_at: new Date().toISOString(),
      last_webhook_error: null,
    });

    const { data: settings, error: settingsError } = await service
      .from('settings')
      .select('user_id')
      .eq('twitch_id', twitchId)
      .single();

    if (settingsError || !settings) {
      throw new Error('User settings not found for Twitch id ' + twitchId);
    }

    if (subscriptionType === 'stream.online') {
      if (!event.id) throw new Error('stream.online event has no stream id');

      const { error } = await service.rpc('handle_stream_online', {
        p_user_id: settings.user_id,
        p_stream_id: event.id,
        p_started_at: event.started_at ?? new Date().toISOString(),
        p_title: 'Twitch stream',
        p_category: '',
      });
      if (error) throw error;

      return new NextResponse('OK', { status: 200 });
    }

    if (subscriptionType === 'stream.offline') {
      const { error } = await service.rpc('handle_stream_offline', {
        p_user_id: settings.user_id,
      });
      if (error) throw error;

      return new NextResponse('OK', { status: 200 });
    }

    if (subscriptionType !== 'channel.chat.message') {
      return new NextResponse('Event ignored', { status: 200 });
    }

    const chatMessageId = event.message_id;
    const chatterId = event.chatter_user_id;
    const chatterUsername = event.chatter_user_name ?? event.chatter_user_login;

    if (!chatMessageId || !chatterId || !chatterUsername) {
      throw new Error('Chat event is missing message or chatter fields');
    }

    await updateDiagnostic(twitchId, {
      subscription_status: 'enabled',
      subscription_id: body.subscription.id ?? null,
      last_message_id: chatMessageId,
      last_chatter_username: chatterUsername,
      last_webhook_error: null,
    });

    const { data: shouldEnsureSubscriptions, error: subscriptionClaimError } =
      await service.rpc('claim_twitch_subscription_sync', {
        p_twitch_id: twitchId,
        p_min_interval_seconds: SUBSCRIPTION_RECONCILE_INTERVAL_SECONDS,
      });

    if (subscriptionClaimError) throw subscriptionClaimError;

    if (shouldEnsureSubscriptions) {
      after(async () => {
        try {
          const appToken = await getAppAccessToken();
          await ensureSubscriptions(appToken, twitchId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('EventSub reconciliation error:', error);
          await updateDiagnostic(twitchId, {
            last_webhook_error: 'EventSub reconciliation: ' + message,
          });
        }
      });
    }

    const processMessage = async (): Promise<'counted' | 'duplicate' | 'offline'> => {
      const { data, error } = await service.rpc('process_twitch_chat_message_server', {
        p_message_id: chatMessageId,
        p_broadcaster_user_id: twitchId,
        p_chatter_user_id: chatterId,
        p_chatter_username: chatterUsername,
        p_user_id: settings.user_id,
        p_increment: 1,
      });

      if (error) {
        if (error.code === '23505') return 'duplicate';
        throw error;
      }
      return data ? 'counted' : 'offline';
    };

    let outcome = await processMessage();

    if (outcome === 'offline') {
      const { data: shouldSyncStream, error: lifecycleClaimError } = await service.rpc(
        'claim_twitch_lifecycle_sync',
        {
          p_twitch_id: twitchId,
          p_min_interval_seconds: STREAM_STATUS_RECOVERY_INTERVAL_SECONDS,
        },
      );
      if (lifecycleClaimError) throw lifecycleClaimError;

      if (shouldSyncStream) {
        const appToken = await getAppAccessToken();
        await syncCurrentStream(appToken, twitchId, settings.user_id);
        outcome = await processMessage();
      }

    }
    if (outcome === 'counted') {
      await updateDiagnostic(twitchId, {
        last_db_increment_at: new Date().toISOString(),
        last_webhook_error: null,
      });
      return new NextResponse('OK', { status: 200 });
    }

    if (outcome === 'duplicate') {
      return new NextResponse('OK (Duplicate)', { status: 200 });
    }

    return new NextResponse('OK (Queued until live)', { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Webhook processing error:', error);

    if (twitchIdForDiagnostic) {
      await updateDiagnostic(twitchIdForDiagnostic, {
        last_webhook_error: message,
      });
    }

    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
