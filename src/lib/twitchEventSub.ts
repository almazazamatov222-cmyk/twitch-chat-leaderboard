export type RequiredEventSubType =
  | 'channel.chat.message'
  | 'stream.online'
  | 'stream.offline';

export interface EventSubRequirement {
  type: RequiredEventSubType;
  version: '1';
  condition: Record<string, string>;
}

export interface EventSubSubscription {
  id: string;
  status: string;
  type: string;
  condition: Record<string, string | undefined>;
  transport?: {
    method?: string;
    callback?: string;
  };
}

export interface EventSubStatus {
  type: RequiredEventSubType;
  status: string;
  id: string | null;
}

export function getEventSubRequirements(twitchId: string): EventSubRequirement[] {
  return [
    {
      type: 'channel.chat.message',
      version: '1',
      condition: {
        broadcaster_user_id: twitchId,
        user_id: twitchId,
      },
    },
    {
      type: 'stream.online',
      version: '1',
      condition: {
        broadcaster_user_id: twitchId,
      },
    },
    {
      type: 'stream.offline',
      version: '1',
      condition: {
        broadcaster_user_id: twitchId,
      },
    },
  ];
}

export function isUsableEventSubStatus(status: string): boolean {
  return status === 'enabled' || status === 'webhook_callback_verification_pending';
}

export function matchesEventSubRequirement(
  subscription: EventSubSubscription,
  requirement: EventSubRequirement,
  callback: string,
): boolean {
  return (
    subscription.type === requirement.type &&
    subscription.transport?.method === 'webhook' &&
    subscription.transport.callback === callback &&
    Object.entries(requirement.condition).every(
      ([key, value]) => subscription.condition?.[key] === value,
    )
  );
}

export function aggregateEventSubStatus(statuses: EventSubStatus[]): string {
  if (statuses.length === 0 || statuses.some(({ status }) => status === 'missing')) {
    return 'missing';
  }

  if (statuses.every(({ status }) => status === 'enabled')) {
    return 'enabled';
  }

  if (statuses.some(({ status }) => status === 'webhook_callback_verification_pending')) {
    return 'webhook_callback_verification_pending';
  }

  return statuses.find(({ status }) => status !== 'enabled')?.status ?? 'unknown';
}
