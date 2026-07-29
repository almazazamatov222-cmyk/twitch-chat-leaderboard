import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// The webhook secret you'll configure in Twitch API when subscribing
const TWITCH_WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET || '';

// We need service role key to insert sessions securely without user token
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('Twitch-Eventsub-Message-Signature');
    const messageId = req.headers.get('Twitch-Eventsub-Message-Id');
    const messageTimestamp = req.headers.get('Twitch-Eventsub-Message-Timestamp');
    const messageType = req.headers.get('Twitch-Eventsub-Message-Type');

    if (!signature || !messageId || !messageTimestamp) {
      return new NextResponse('Missing headers', { status: 400 });
    }

    // Verify signature
    const hmacMessage = messageId + messageTimestamp + rawBody;
    const hmac = crypto.createHmac('sha256', TWITCH_WEBHOOK_SECRET);
    hmac.update(hmacMessage);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    if (signature !== expectedSignature) {
      // For local testing without secrets you might want to bypass this conditionally
      // but in production it's critical.
      if (process.env.NODE_ENV === 'production') {
        return new NextResponse('Invalid signature', { status: 403 });
      }
    }

    // Parse JSON
    const body = JSON.parse(rawBody);

    // Handle verification challenge
    if (messageType === 'webhook_callback_verification') {
      return new NextResponse(body.challenge, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    // Handle notifications
    if (messageType === 'notification') {
      const event = body.event;
      const subscriptionType = body.subscription.type;
      
      const twitchId = event.broadcaster_user_id;

      // Find user_id by twitch_id
      const { data: userData, error: userError } = await supabase
        .from('settings')
        .select('user_id')
        .eq('twitch_id', twitchId)
        .single();

      if (userError || !userData) {
        console.error('Webhook: User not found for twitch_id', twitchId);
        return new NextResponse('User not found', { status: 404 });
      }

      const userId = userData.user_id;

      if (subscriptionType === 'stream.online') {
        // Close existing active sessions first
        await supabase
          .from('sessions')
          .update({ status: 'completed', ended_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('status', 'active');

        // Create new session
        await supabase
          .from('sessions')
          .insert({
            user_id: userId,
            status: 'active',
            stream_title: event.title || null,
            category_name: event.category_name || null
          });
      } 
      else if (subscriptionType === 'stream.offline') {
        // Complete the session
        await supabase
          .from('sessions')
          .update({ status: 'completed', ended_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('status', 'active');
      }

      return new NextResponse('OK', { status: 200 });
    }

    return new NextResponse('Event ignored', { status: 200 });

  } catch (err: any) {
    console.error('Webhook processing error:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
