import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  ensureSubscriptions,
  getAppAccessToken,
  getMissingTwitchEnvironment,
  saveDiagnostic,
  summarizeSubscriptions,
  syncCurrentStream,
} from '@/lib/twitchEventSub.server';

export async function POST(request: Request) {
  let twitchIdForDiagnostic: string | null = null;

  try {
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

    const body = (await request.json()) as { twitchId?: string };
    if (!body.twitchId) {
      return NextResponse.json({ success: false, error: 'Missing twitchId' }, { status: 400 });
    }
    twitchIdForDiagnostic = body.twitchId;

    const { data: settings, error: settingsError } = await authClient
      .from('settings')
      .select('twitch_id')
      .eq('user_id', user.id)
      .single();

    if (settingsError || settings?.twitch_id !== body.twitchId) {
      return NextResponse.json(
        { success: false, error: 'Twitch account does not belong to this user' },
        { status: 403 },
      );
    }

    const appToken = await getAppAccessToken();
    const statuses = await ensureSubscriptions(appToken, body.twitchId);
    await syncCurrentStream(appToken, body.twitchId, user.id);

    const summary = summarizeSubscriptions(statuses);
    await saveDiagnostic(body.twitchId, {
      subscription_status: summary.status,
      subscription_id: summary.id,
      last_webhook_error: null,
    });

    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Subscription API error:', error);

    if (twitchIdForDiagnostic) {
      await saveDiagnostic(twitchIdForDiagnostic, {
        last_webhook_error: message,
      });
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
