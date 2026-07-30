import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
const WEBHOOK_CALLBACK = process.env.TWITCH_WEBHOOK_CALLBACK || 'https://twitch-chat-leaderboard.vercel.app/api/webhooks/twitch';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const twitchId = searchParams.get('twitchId');

    if (!twitchId) {
      return NextResponse.json({ success: false, error: 'Missing twitchId' }, { status: 400 });
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return NextResponse.json({ success: false, error: 'Missing Twitch credentials in env' }, { status: 500 });
    }

    // Get App Access Token
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    });
    
    const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token`, {
      method: 'POST',
      body: tokenParams,
    });
    
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return NextResponse.json({ success: false, error: 'Failed to get app token: ' + tokenData.message }, { status: 500 });
    }
    const appToken = tokenData.access_token;

    // Get subscriptions
    const subRes = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?type=channel.chat.message`, {
      headers: {
        'Client-ID': CLIENT_ID,
        'Authorization': `Bearer ${appToken}`,
      }
    });
    
    const subData = await subRes.json();
    if (!subRes.ok) {
      return NextResponse.json({ success: false, error: 'Failed to fetch subscriptions: ' + subData.message }, { status: 500 });
    }

    let existingSub = null;
    if (subData.data && Array.isArray(subData.data)) {
      existingSub = subData.data.find((sub: any) => 
        sub.condition.broadcaster_user_id === twitchId &&
        sub.transport.callback === WEBHOOK_CALLBACK
      );
    }

    if (!existingSub) {
      return NextResponse.json({ success: true, status: 'missing', id: null });
    }

    return NextResponse.json({ 
      success: true, 
      status: existingSub.status, 
      id: existingSub.id,
      error: existingSub.status === 'webhook_callback_verification_failed' ? 'Verification failed' : null
    });

  } catch (err: any) {
    console.error('Status API Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
