import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
const TWITCH_WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET || '';

// Initialize Supabase with service role to bypass RLS if needed, though for auth check we use anon
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(req: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') || '',
        },
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !TWITCH_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Missing Twitch API credentials in environment' }, { status: 500 });
    }

    // Get the broadcaster's Twitch ID
    const broadcasterId = user.user_metadata.provider_id;
    
    // Determine the webhook URL based on the request host
    // (Ensure it uses https in production)
    const host = req.headers.get('host') || '';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${protocol}://${host}/api/webhooks/twitch`;

    // 1. Get App Access Token
    const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, {
      method: 'POST',
    });
    
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return NextResponse.json({ error: 'Failed to get Twitch access token', details: errText }, { status: 500 });
    }

    const { access_token: appAccessToken } = await tokenRes.json();

    // 2. Function to subscribe to a specific event type
    const subscribeToEvent = async (type: string) => {
      const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${appAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: type,
          version: '1',
          condition: {
            broadcaster_user_id: broadcasterId
          },
          transport: {
            method: 'webhook',
            callback: webhookUrl,
            secret: TWITCH_WEBHOOK_SECRET
          }
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.message === 'subscription already exists') {
          return { status: 'already_exists' };
        }
        throw new Error(JSON.stringify(errorData));
      }
      return { status: 'created' };
    };

    // 3. Subscribe to both online and offline events
    const onlineRes = await subscribeToEvent('stream.online');
    const offlineRes = await subscribeToEvent('stream.offline');

    return NextResponse.json({ 
      success: true, 
      message: 'Successfully subscribed to Twitch EventSub webhooks',
      details: {
        online: onlineRes.status,
        offline: offlineRes.status,
        webhookUrl
      }
    });

  } catch (error: any) {
    console.error('Subscription error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
