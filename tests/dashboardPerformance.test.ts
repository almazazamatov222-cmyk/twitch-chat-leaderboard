import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { OBS_SETTINGS_SYNC, OBS_STATS_SYNC } from '../src/lib/realtimeSync.ts';

const dashboardSource = readFileSync(
  new URL('../src/app/(main)/dashboard/page.tsx', import.meta.url),
  'utf8',
);
const settingsPanelSource = readFileSync(
  new URL('../src/components/SettingsPanel.tsx', import.meta.url),
  'utf8',
);
const livePreviewSource = readFileSync(
  new URL('../src/components/LivePreview.tsx', import.meta.url),
  'utf8',
);

test('uses low-frequency safety polling instead of repainting every second', () => {
  assert.ok(OBS_STATS_SYNC.pollIntervalMs >= 2_000);
  assert.ok(OBS_SETTINGS_SYNC.pollIntervalMs >= 5_000);
});

test('removes heavy dashboard diagnostics and extra canvas themes', () => {
  assert.doesNotMatch(dashboardSource, /DiagnosticPanel|useDiagnostics/);
  assert.doesNotMatch(dashboardSource, /canvasBg|Светлый|Тёмный|Игра/);
});

test('removes the custom bot settings block', () => {
  assert.doesNotMatch(settingsPanelSource, /Дополнительные боты|mycustombot/);
});

test('does not run the demo animation loop while the stream is offline', () => {
  assert.doesNotMatch(livePreviewSource, /previewMode === 'demo' \|\| !sessionId/);
});
