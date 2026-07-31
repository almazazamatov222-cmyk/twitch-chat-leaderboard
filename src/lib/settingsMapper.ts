import {
  defaultSettings,
  type OverlaySettings,
} from '@/store/useSettingsStore';

export function mapSettingsRow(row: Record<string, unknown>): OverlaySettings {
  const mapped: Record<string, unknown> = { ...defaultSettings };

  for (const key of Object.keys(defaultSettings) as Array<keyof OverlaySettings>) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase());
    if (row[snakeKey] !== undefined && row[snakeKey] !== null) {
      mapped[key] = row[snakeKey];
    }
  }

  let rawRowColor =
    typeof row.row_background === 'string'
      ? row.row_background
      : defaultSettings.rowColor;

  if (rawRowColor.startsWith('rgba')) {
    const match = rawRowColor.match(/rgba?[(]([0-9]+),[ ]*([0-9]+),[ ]*([0-9]+)/);
    if (match) {
      rawRowColor =
        '#' +
        [match[1], match[2], match[3]]
          .map((value) => Number.parseInt(value, 10).toString(16).padStart(2, '0'))
          .join('');
    }
  }

  mapped.rowColor = rawRowColor;
  mapped.rowGap =
    typeof row.row_gap === 'number' ? row.row_gap : defaultSettings.rowGap;

  return mapped as unknown as OverlaySettings;
}
