export interface TwitchChatBadge {
  set_id?: string;
  id?: string;
}

export interface ChatMessageFilterInput {
  broadcasterUserId: string;
  chatterUserId: string;
  chatterUsername: string;
  messageText?: string;
  badges?: TwitchChatBadge[];
  additionalBotUsernames?: string[];
}

const KNOWN_TWITCH_BOTS = new Set([
  'botrixoficial',
  'fossabot',
  'moobot',
  'nightbot',
  'own3d',
  'restreambot',
  'sery_bot',
  'soundalerts',
  'streamavatars',
  'streamelements',
  'streamlabs',
  'wizebot',
]);

export function getChatMessageFilterReason(
  input: ChatMessageFilterInput,
): 'broadcaster' | 'bot' | 'command' | null {
  if (input.chatterUserId === input.broadcasterUserId) return 'broadcaster';
  if (input.messageText?.trimStart().startsWith('!')) return 'command';

  const hasBotBadge = input.badges?.some((badge) => {
    const setId = badge.set_id?.toLowerCase();
    const badgeId = badge.id?.toLowerCase();
    return setId === 'bot' || badgeId === 'bot';
  });
  if (hasBotBadge) return 'bot';

  const normalizedUsername = input.chatterUsername.trim().toLowerCase();
  const configuredBots = new Set(
    input.additionalBotUsernames?.map((username) =>
      username.trim().toLowerCase(),
    ),
  );

  return KNOWN_TWITCH_BOTS.has(normalizedUsername) ||
    configuredBots.has(normalizedUsername)
    ? 'bot'
    : null;
}
