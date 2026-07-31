/* eslint-disable */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
const WEBHOOK_CALLBACK = process.env.TWITCH_WEBHOOK_CALLBACK || 'https://twitch-chat-leaderboard.vercel.app/api/webhooks/twitch';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        return NextResponse.json({ success: false, error: 'Failed to fetch subscriptions: ' + subData.message }, { status: 500 });
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
      matchingSubscriptions.find((sub: any) => sub.status === 'webhook_callback_verification_pending') ??
      matchingSubscriptions[0] ??
      null;

    const actualStatus = existingSub ? existingSub.status : 'missing';
    const subscriptionId = existingSub ? existingSub.id : null;
    const errorOrNull = existingSub?.status === 'webhook_callback_verification_failed' ? 'Verification failed' : null;

    await supabase.from('webhook_diagnostics').upsert({
      twitch_id: twitchId,
      subscription_status: actualStatus,
      subscription_id: subscriptionId,
      last_webhook_error: errorOrNull,
      updated_at: new Date().toISOString()
    });

    if (!existingSub) {
      return NextResponse.json({ success: true, status: 'missing', id: null });
    }

    return NextResponse.json({ 
      success: true, 
      status: actualStatus, 
      id: subscriptionId,
      error: errorOrNull
    });

  } catch (err: any) {
    console.error('Status API Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

