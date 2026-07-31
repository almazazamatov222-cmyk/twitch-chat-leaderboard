import { createClient } from '@supabase/supabase-js';

import {
  aggregateEventSubStatus,
  getEventSubRequirements,
  isUsableEventSubStatus,
  matchesEventSubRequirement,
  type EventSubRequirement,
  type EventSubStatus,
  type EventSubSubscription,
} from '@/lib/twitchEventSub';

const CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET ?? '';
const WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
    : 'https://twitch-chat-leaderboard.vercel.app')
).replace(/[/]$/, '');

export const WEBHOOK_CALLBACK =
  process.env.TWITCH_WEBHOOK_CALLBACK ?? SITE_URL + '/api/webhooks/twitch';

interface TwitchApiError {
  message?: string;
}

interface TwitchTokenResponse extends TwitchApiError {
  access_token?: string;
}

interface TwitchSubscriptionsResponse extends TwitchApiError {
  data?: EventSubSubscription[];
  pagination?: {
    cursor?: string;
  };
}

interface TwitchStream {
  id: string;
  title?: string;
  game_name?: string;
  started_at?: string;
}

export function getMissingTwitchEnvironment(): string[] {
  return [
    !CLIENT_ID && 'NEXT_PUBLIC_TWITCH_CLIENT_ID',
    !CLIENT_SECRET && 'TWITCH_CLIENT_SECRET',
    !WEBHOOK_SECRET && 'TWITCH_WEBHOOK_SECRET',
    !SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
    !SUPABASE_SERVICE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((value): value is string => Boolean(value));
}

export function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getAppAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
  });
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: params,
    cache: 'no-store',
  });
  const body = (await response.json()) as TwitchTokenResponse;

  if (!response.ok || !body.access_token) {
    throw new Error(body.message ?? 'Twitch did not return an app access token');
  }

  return body.access_token;
}

async function fetchSubscriptions(
  appToken: string,
  requirement: EventSubRequirement,
): Promise<EventSubSubscription[]> {
  const subscriptions: EventSubSubscription[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 50; page += 1) {
    const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions');
    url.searchParams.set('type', requirement.type);
    if (cursor) url.searchParams.set('after', cursor);

    const response = await fetch(url, {
      headers: {
        'Client-ID': CLIENT_ID,
        Authorization: 'Bearer ' + appToken,
      },
      cache: 'no-store',
    });
    const body = (await response.json()) as TwitchSubscriptionsResponse;

    if (!response.ok) {
      throw new Error(body.message ?? 'Failed to list ' + requirement.type + ' subscriptions');
    }

    subscriptions.push(...(body.data ?? []));
    cursor = body.pagination?.cursor;
    if (!cursor) break;
  }

  return subscriptions;
}

function findMatchingSubscription(
  subscriptions: EventSubSubscription[],
  requirement: EventSubRequirement,
): EventSubSubscription | null {
  const matches = subscriptions.filter((subscription) =>
    matchesEventSubRequirement(subscription, requirement, WEBHOOK_CALLBACK),
  );

  return (
    matches.find(({ status }) => status === 'enabled') ??
    matches.find(({ status }) => isUsableEventSubStatus(status)) ??
    matches[0] ??
    null
  );
}

async function createSubscription(
  appToken: string,
  requirement: EventSubRequirement,
): Promise<EventSubSubscription> {
  const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      'Client-ID': CLIENT_ID,
      Authorization: 'Bearer ' + appToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...requirement,
      transport: {
        method: 'webhook',
        callback: WEBHOOK_CALLBACK,
        secret: WEBHOOK_SECRET,
      },
    }),
  });
  const body = (await response.json()) as TwitchSubscriptionsResponse;

  if (!response.ok || !body.data?.[0]) {
    throw new Error(body.message ?? 'Failed to create ' + requirement.type + ' subscription');
  }

  return body.data[0];
}

export async function getSubscriptionStatuses(
  appToken: string,
  twitchId: string,
): Promise<EventSubStatus[]> {
  const statuses: EventSubStatus[] = [];

  for (const requirement of getEventSubRequirements(twitchId)) {
    const subscriptions = await fetchSubscriptions(appToken, requirement);
    const subscription = findMatchingSubscription(subscriptions, requirement);
    statuses.push({
      type: requirement.type,
      status: subscription?.status ?? 'missing',
      id: subscription?.id ?? null,
    });
  }

  return statuses;
}

export async function ensureSubscriptions(
  appToken: string,
  twitchId: string,
): Promise<EventSubStatus[]> {
  const statuses: EventSubStatus[] = [];

  for (const requirement of getEventSubRequirements(twitchId)) {
    const subscriptions = await fetchSubscriptions(appToken, requirement);
    const existing = findMatchingSubscription(subscriptions, requirement);

    if (existing && isUsableEventSubStatus(existing.status)) {
      statuses.push({
        type: requirement.type,
        status: existing.status,
        id: existing.id,
      });
      continue;
    }

    try {
      const created = await createSubscription(appToken, requirement);
      statuses.push({
        type: requirement.type,
        status: created.status,
        id: created.id,
      });
    } catch (error) {
      const refreshed = await fetchSubscriptions(appToken, requirement);
      const concurrent = findMatchingSubscription(refreshed, requirement);
      if (!concurrent || !isUsableEventSubStatus(concurrent.status)) throw error;

      statuses.push({
        type: requirement.type,
        status: concurrent.status,
        id: concurrent.id,
      });
    }
  }

  return statuses;
}

export function summarizeSubscriptions(statuses: EventSubStatus[]) {
  const chat = statuses.find(({ type }) => type === 'channel.chat.message');
  return {
    status: aggregateEventSubStatus(statuses),
    id: chat?.id ?? null,
    subscriptions: statuses,
  };
}

export async function syncCurrentStream(
  appToken: string,
  twitchId: string,
  userId: string,
): Promise<void> {
  const url = new URL('https://api.twitch.tv/helix/streams');
  url.searchParams.set('user_id', twitchId);
  const response = await fetch(url, {
    headers: {
      'Client-ID': CLIENT_ID,
      Authorization: 'Bearer ' + appToken,
    },
    cache: 'no-store',
  });
  const body = (await response.json()) as { data?: TwitchStream[]; message?: string };

  if (!response.ok) {
    throw new Error(body.message ?? 'Failed to read current stream status');
  }

  const service = getServiceClient();
  const liveStream = body.data?.[0];

  if (liveStream) {
    const { error } = await service.rpc('handle_stream_online', {
      p_user_id: userId,
      p_stream_id: liveStream.id,
      p_started_at: liveStream.started_at ?? new Date().toISOString(),
      p_title: liveStream.title ?? 'Twitch stream',
      p_category: liveStream.game_name ?? '',
    });
    if (error) throw error;
    return;
  }

  const { error } = await service.rpc('handle_stream_offline', {
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function saveDiagnostic(
  twitchId: string,
  values: Record<string, string | null>,
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  await getServiceClient().from('webhook_diagnostics').upsert({
    twitch_id: twitchId,
    ...values,
    updated_at: new Date().toISOString(),
  });
}
