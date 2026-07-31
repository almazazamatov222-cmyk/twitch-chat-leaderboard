import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateLeaderboardLayout,
  getVisibleOverlayBorderWidth,
  scalePixelValue,
} from '../src/lib/overlayLayout.ts';

test('keeps a configured overlay border visible in a scaled OBS preview', () => {
  assert.equal(getVisibleOverlayBorderWidth('0px'), 0);
  assert.equal(getVisibleOverlayBorderWidth('1px'), 2);
  assert.equal(getVisibleOverlayBorderWidth('4px'), 4);
});

test('fits all 50 leaderboard rows inside a 500x800 overlay', () => {
  const layout = calculateLeaderboardLayout({
    userCount: 50,
    showTitle: true,
    titleSize: '24px',
    rowHeight: 'auto',
    rowGap: 8,
  });

  assert.equal(layout.columns, 2);
  assert.equal(layout.rowsPerColumn, 25);
  assert.ok(layout.rowHeight >= 20);
  assert.ok(layout.usedHeight <= layout.availableHeight);
});

test('does not compact the common top-10 layout', () => {
  const layout = calculateLeaderboardLayout({
    userCount: 10,
    showTitle: true,
    titleSize: '24px',
    rowHeight: 'auto',
    rowGap: 8,
  });

  assert.equal(layout.columns, 1);
  assert.equal(layout.compact, false);
  assert.equal(layout.rowHeight, 40);
  assert.equal(layout.rowGap, 8);
});

test('preserves non-pixel font values and caps oversized compact text', () => {
  assert.equal(scalePixelValue('1.5rem', 0.7, 14), '1.5rem');
  assert.equal(scalePixelValue('100px', 0.7, 14), '14px');
});
