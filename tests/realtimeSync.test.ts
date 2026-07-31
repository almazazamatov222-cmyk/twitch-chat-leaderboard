import assert from 'node:assert/strict';
import test from 'node:test';

import { OBS_STATS_SYNC } from '../src/lib/realtimeSync.ts';

test('uses an always-on OBS-safe polling transport', () => {
  assert.equal(OBS_STATS_SYNC.transport, 'polling');
  assert.ok(OBS_STATS_SYNC.pollIntervalMs <= 2_000);
});
