import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const TWITCH_WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET || '';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  let twitchIdForDiag: string | null = null;
  
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('Twitch-Eventsub-Message-Signature');
    const messageId = req.headers.get('Twitch-Eventsub-Message-Id');
    const messageTimestamp = req.headers.get('Twitch-Eventsub-Message-Timestamp');
    const messageType = req.headers.get('Twitch-Eventsub-Message-Type');

    if (!signature || !messageId || !messageTimestamp) {
      return new NextResponse('Missing headers', { status: 400 });
    }

    // Verify signature safely
    const hmacMessage = messageId + messageTimestamp + rawBody;
    const hmac = crypto.createHmac('sha256', TWITCH_WEBHOOK_SECRET);
    hmac.update(hmacMessage);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;
    
    // timingSafeEqual requires same length buffers
    if (signature.length !== expectedSignature.length || 
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      if (process.env.NODE_ENV === 'production') {
        return new NextResponse('Invalid signature', { status: 403 });
      }
    }

    const body = JSON.parse(rawBody);

    if (messageType === 'webhook_callback_verification') {
      const twitchId = body.subscription?.condition?.broadcaster_user_id;
      const subId = body.subscription?.id;
      if (twitchId) {
        await supabase.from('webhook_diagnostics').upsert({
          twitch_id: twitchId,
          subscription_status: 'verification_received',
          subscription_id: subId
        });
      }
      return new NextResponse(body.challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    if (messageType === 'revocation') {
      // Update diag state
      const twitchId = body.subscription?.condition?.broadcaster_user_id;
      if (twitchId) {
        await supabase.from('webhook_diagnostics').upsert({
          twitch_id: twitchId,
          subscription_status: 'revoked',
          last_webhook_error: 'Subscription revoked by Twitch'
        });
      }
      return new NextResponse('OK', { status: 200 });
    }

    if (messageType === 'notification') {
      const event = body.event;
      const subscriptionType = body.subscription.type;
      const twitchId = event.broadcaster_user_id;
      twitchIdForDiag = twitchId;

      // Update diagnostic: last received
      await supabase.from('webhook_diagnostics').upsert({
        twitch_id: twitchId,
        last_webhook_received_at: new Date().toISOString(),
        last_webhook_error: null
      });

      // Find user_id by twitch_id
      const { data: userData, error: userError } = await supabase
        .from('settings')
        .select('*')
        .eq('twitch_id', twitchId)
        .single();

      if (userError || !userData) {
        throw new Error('User settings not found for twitch_id: ' + twitchId);
      }

      const userId = userData.user_id;

      if (subscriptionType === 'stream.online') {
        await supabase.rpc('handle_stream_online', {
          p_user_id: userId,
          p_title: event.title || 'Live Stream',
          p_category: event.category_name || 'Just Chatting'
        });
      } 
      else if (subscriptionType === 'stream.offline') {
        await supabase.rpc('handle_stream_offline', {
          p_user_id: userId
        });
      }
      else if (subscriptionType === 'channel.chat.message') {
        const msgId = event.message_id;
        const chatterId = event.chatter_user_id;
        const chatterUsername = event.chatter_user_name || event.chatter_user_login;
        const text = event.message.text;
        const subId = body.subscription?.id;

        // Update diag state
        await supabase.from('webhook_diagnostics').upsert({
          twitch_id: twitchId,
          subscription_status: 'enabled',
          subscription_id: subId,
          last_webhook_received_at: new Date().toISOString(),
          last_message_id: msgId,
          last_chatter_username: chatterUsername,
          last_webhook_error: null,
          updated_at: new Date().toISOString()
        });

        // 1. Deduplication
        const { error: dedupError } = await supabase
          .from('processed_twitch_messages')
          .insert({
            message_id: msgId,
            broadcaster_user_id: twitchId,
            chatter_user_id: chatterId
          });

        if (dedupError) {
          if (dedupError.code === '23505') {
            // Already processed
            return new NextResponse('OK (Duplicate)', { status: 200 });
          }
          throw dedupError;
        }

        // 2. Filters
        let shouldCount = true;
        if (userData.ignore_commands && text.startsWith('!')) shouldCount = false;
        if (userData.ignore_streamer && chatterId === twitchId) shouldCount = false;
        if (text.length < (userData.min_message_length || 1)) shouldCount = false;

        if (shouldCount) {
          // 3. Get Active Session
          const { data: sessionData, error: sessionErr } = await supabase
            .rpc('get_or_create_active_session_server', { p_user_id: userId });
            
          if (sessionErr) throw sessionErr;
          
          const sessionId = sessionData;

          // 4. Increment
          const { error: incError } = await supabase.rpc('increment_message_stat_server', {
            p_user_id: userId,
            p_session_id: sessionId,
            p_twitch_user_id: chatterId,
            p_twitch_username: chatterUsername,
            p_increment: 1
          });

          if (incError) throw incError;

          // 5. Update Diagnostics
          await supabase.from('webhook_diagnostics').upsert({
            twitch_id: twitchId,
            last_message_id: msgId,
            last_chatter_username: chatterUsername,
            last_db_increment_at: new Date().toISOString()
          });
        }
      }

      return new NextResponse('OK', { status: 200 });
    }

    return new NextResponse('Event ignored', { status: 200 });

  } catch (err: any) {
    console.error('Webhook processing error:', err);
    if (twitchIdForDiag) {
      await supabase.from('webhook_diagnostics').upsert({
        twitch_id: twitchIdForDiag,
        last_webhook_error: err.message || String(err)
      });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
