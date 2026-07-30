import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
const WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET || '';
const WEBHOOK_CALLBACK = process.env.TWITCH_WEBHOOK_CALLBACK || 'https://twitch-chat-leaderboard.vercel.app/api/webhooks/twitch';

// We need service role key to insert diagnostics
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getAppAccessToken() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token`, {
    method: 'POST',
    body: params,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to get app token');
  return data.access_token;
}

async function saveDiagError(twitchId: string, error: string) {
  try {
    await supabase.from('webhook_diagnostics').upsert({
      twitch_id: twitchId,
      last_webhook_error: error
    });
  } catch (e) {
    console.error('Failed to save diag error', e);
  }
}

export async function POST(req: Request) {
  try {
    const { twitchId, userId } = await req.json();

    if (!twitchId || !userId) {
      return NextResponse.json({ success: false, error: 'Missing twitchId or userId' }, { status: 400 });
    }

    const missingEnvs = [];
    if (!CLIENT_ID) missingEnvs.push('NEXT_PUBLIC_TWITCH_CLIENT_ID');
    if (!CLIENT_SECRET) missingEnvs.push('TWITCH_CLIENT_SECRET');
    if (!WEBHOOK_SECRET) missingEnvs.push('TWITCH_WEBHOOK_SECRET');
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missingEnvs.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnvs.push('SUPABASE_SERVICE_ROLE_KEY');

    if (missingEnvs.length > 0) {
      const err = `Missing environment variables: ${missingEnvs.join(', ')}`;
      await saveDiagError(twitchId, err);
      return NextResponse.json({ success: false, error: err }, { status: 500 });
    }

    const appToken = await getAppAccessToken();

    // 1. Get existing subscriptions
    let allSubs: any[] = [];
    let cursor = '';
    let pageCount = 0;
    
    while (pageCount < 5) {
      const url = `https://api.twitch.tv/helix/eventsub/subscriptions?type=channel.chat.message${cursor ? `&after=${cursor}` : ''}`;
      const subRes = await fetch(url, {
        headers: {
          'Client-ID': CLIENT_ID,
          'Authorization': `Bearer ${appToken}`,
        }
      });
      
      const subData = await subRes.json();
      if (!subRes.ok) {
        const err = `Failed to fetch subscriptions: ${subData.message}`;
        await saveDiagError(twitchId, err);
        return NextResponse.json({ success: false, error: err }, { status: subRes.status });
      }

      if (subData.data && Array.isArray(subData.data)) {
        allSubs = allSubs.concat(subData.data);
      }

      if (subData.pagination && subData.pagination.cursor) {
        cursor = subData.pagination.cursor;
        pageCount++;
      } else {
        break;
      }
    }

    const matchingSubscriptions = allSubs.filter((sub: any) =>
      sub.type === 'channel.chat.message' &&
      sub.condition?.broadcaster_user_id === twitchId &&
      sub.condition?.user_id === twitchId &&
      sub.transport?.method === 'webhook' &&
      sub.transport?.callback === WEBHOOK_CALLBACK
    );

    const existingSub =
      matchingSubscriptions.find((sub: any) => sub.status === 'enabled') ??
      matchingSubscriptions.find(
        (sub: any) => sub.status === 'webhook_callback_verification_pending'
      ) ??
      null;

    let status = 'enabled';
    let subId = existingSub?.id;

    if (!existingSub) {
      // 2. Create subscription
      const createRes = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          'Client-ID': CLIENT_ID,
          'Authorization': `Bearer ${appToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'channel.chat.message',
          version: '1',
          condition: {
            broadcaster_user_id: twitchId,
            user_id: twitchId,
          },
          transport: {
            method: 'webhook',
            callback: WEBHOOK_CALLBACK,
            secret: WEBHOOK_SECRET,
          }
        })
      });

      const createData = await createRes.json();

      if (!createRes.ok) {
        if (createRes.status === 409) {
          // If conflict, another process might have created it recently, or we didn't fetch enough pages.
          // In this case, just return success=true so the client can continue, and polling will catch it up later.
          return NextResponse.json({ success: true, status: 'conflict_pending', id: null });
        }
        const err = `Failed to create subscription: ${createData.message}`;
        await saveDiagError(twitchId, err);
        return NextResponse.json({ success: false, error: err }, { status: createRes.status });
      }

      subId = createData.data[0].id;
      status = createData.data[0].status; // Should be 'webhook_callback_verification_pending'
    }

    // Update DB diagnostics
    await supabase.from('webhook_diagnostics').upsert({
      twitch_id: twitchId,
      subscription_status: status,
      subscription_id: subId,
      last_webhook_error: null
    });

    return NextResponse.json({ success: true, status, id: subId });

  } catch (err: any) {
    console.error('Subscription API Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
