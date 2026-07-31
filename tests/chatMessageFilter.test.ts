import assert from 'node:assert/strict';
import test from 'node:test';

import { getChatMessageFilterReason } from '../src/lib/chatMessageFilter.ts';

const normalMessage = {
  broadcasterUserId: 'channel-1',
  chatterUserId: 'viewer-1',
  chatterUsername: 'RealViewer',
  messageText: 'hello',
  badges: [],
};

test('counts a normal viewer message', () => {
  assert.equal(getChatMessageFilterReason(normalMessage), null);
});

test('filters the channel owner and command messages', () => {
  assert.equal(
    getChatMessageFilterReason({ ...normalMessage, chatterUserId: 'channel-1' }),
    'broadcaster',
  );
  assert.equal(
    getChatMessageFilterReason({ ...normalMessage, messageText: '  !uptime' }),
    'command',
  );
});

test('filters bot badges and common Twitch bots', () => {
  assert.equal(
    getChatMessageFilterReason({
      ...normalMessage,
      badges: [{ set_id: 'bot', id: '1' }],
    }),
    'bot',
  );
  assert.equal(
    getChatMessageFilterReason({ ...normalMessage, chatterUsername: 'WizeBot' }),
    'bot',
  );
  assert.equal(
    getChatMessageFilterReason({
      ...normalMessage,
      chatterUsername: 'StreamElements',
    }),
    'bot',
  );
  assert.equal(
    getChatMessageFilterReason({
      ...normalMessage,
      chatterUsername: 'MyCustomBot',
      additionalBotUsernames: ['mycustombot'],
    }),
    'bot',
  );
});
