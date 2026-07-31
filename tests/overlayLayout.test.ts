import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateLeaderboardLayout,
  colorWithOpacity,
  getVisibleOverlayBorderWidth,
  getVisibleOverlayBorderColor,
  opacityFromTransparency,
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

test('keeps two-digit ranks separated from usernames in two columns', () => {
  const layout = calculateLeaderboardLayout({
    userCount: 30,
    showTitle: true,
    titleSize: '24px',
    rowHeight: 'auto',
    rowGap: 8,
  });

  assert.ok(layout.positionWidth >= 32);
  assert.ok(layout.itemContentGap >= 6);
});

test('maps user-facing transparency to CSS opacity', () => {
  assert.equal(opacityFromTransparency(0), 1);
  assert.equal(opacityFromTransparency(0.25), 0.75);
  assert.equal(opacityFromTransparency(1), 0);
});

test('applies row opacity to both hex and rgba colors', () => {
  assert.equal(colorWithOpacity('#000000', 0), 'rgba(0, 0, 0, 0)');
  assert.equal(colorWithOpacity('rgba(10, 20, 30, 1)', 0.25), 'rgba(10, 20, 30, 0.25)');
});

test('uses a visible fallback for an enabled transparent overlay border', () => {
  assert.equal(getVisibleOverlayBorderColor('transparent', 2), '#ff0000');
  assert.equal(getVisibleOverlayBorderColor('#00ff00', 2), '#00ff00');
  assert.equal(getVisibleOverlayBorderColor('transparent', 0), 'transparent');
});
