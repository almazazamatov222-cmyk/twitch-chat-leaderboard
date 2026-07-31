import assert from 'node:assert/strict';
import test from 'node:test';

import { getEventSubRequirements } from '../src/lib/twitchEventSub.ts';

test('subscribes to chat plus stream start and end events', () => {
  const requirements = getEventSubRequirements('123');

  assert.deepEqual(
    requirements.map(({ type }) => type),
    ['channel.chat.message', 'stream.online', 'stream.offline'],
  );
  assert.deepEqual(requirements[0].condition, {
    broadcaster_user_id: '123',
    user_id: '123',
  });
});
