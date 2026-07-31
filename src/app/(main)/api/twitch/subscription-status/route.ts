import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  getAppAccessToken,
  getMissingTwitchEnvironment,
  getSubscriptionStatuses,
  saveDiagnostic,
  summarizeSubscriptions,
} from '@/lib/twitchEventSub.server';

export async function GET(request: Request) {
  try {
    const twitchId = new URL(request.url).searchParams.get('twitchId');
    if (!twitchId) {
      return NextResponse.json({ success: false, error: 'Missing twitchId' }, { status: 400 });
    }

    const missingEnvironment = getMissingTwitchEnvironment();
    if (missingEnvironment.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing environment variables: ' + missingEnvironment.join(', '),
        },
        { status: 500 },
      );
    }

    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: settings, error: settingsError } = await authClient
      .from('settings')
      .select('twitch_id')
      .eq('user_id', user.id)
      .single();

    if (settingsError || settings?.twitch_id !== twitchId) {
      return NextResponse.json(
        { success: false, error: 'Twitch account does not belong to this user' },
        { status: 403 },
      );
    }

    const appToken = await getAppAccessToken();
    const statuses = await getSubscriptionStatuses(appToken, twitchId);
    const summary = summarizeSubscriptions(statuses);
    const failed = statuses.find(
      ({ status }) =>
        status !== 'enabled' && status !== 'webhook_callback_verification_pending',
    );

    await saveDiagnostic(twitchId, {
      subscription_status: summary.status,
      subscription_id: summary.id,
      last_webhook_error: failed ? failed.type + ': ' + failed.status : null,
    });

    return NextResponse.json({
      success: true,
      ...summary,
      error: failed ? failed.type + ': ' + failed.status : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Subscription status API error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
