import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
const WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET || '';
const WEBHOOK_CALLBACK = 'https://twitch-chat-leaderboard.vercel.app/api/webhooks/twitch';

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

export async function POST(req: Request) {
  try {
    const { twitchId, userId } = await req.json();

    if (!twitchId || !userId) {
      return new NextResponse('Missing twitchId or userId', { status: 400 });
    }

    const appToken = await getAppAccessToken();

    // 1. Get existing subscriptions
    const subRes = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?type=channel.chat.message&status=enabled`, {
      headers: {
        'Client-ID': CLIENT_ID,
        'Authorization': `Bearer ${appToken}`,
      }
    });
    const subData = await subRes.json();

    let existingSub = null;
    if (subData.data && Array.isArray(subData.data)) {
      existingSub = subData.data.find((sub: any) => 
        sub.condition.broadcaster_user_id === twitchId &&
        sub.transport.callback === WEBHOOK_CALLBACK
      );
    }

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
        console.error('Failed to create subscription:', createData);
        return NextResponse.json({ success: false, error: createData.message }, { status: 400 });
      }

      subId = createData.data[0].id;
      status = createData.data[0].status; // Should be 'webhook_callback_verification_pending'
    }

    // Update DB diagnostics
    await supabase.from('webhook_diagnostics').upsert({
      twitch_id: twitchId,
      subscription_status: status,
      subscription_id: subId,
    });

    return NextResponse.json({ success: true, status, id: subId });

  } catch (err: any) {
    console.error('Subscription API Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
