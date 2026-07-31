const OVERLAY_HEIGHT = 800;
const DEFAULT_ROW_HEIGHT = 40;
const NORMAL_VERTICAL_PADDING = 72;
const COMPACT_VERTICAL_PADDING = 40;

function parsePixels(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getVisibleOverlayBorderWidth(value: string): number {
  const width = Number.parseFloat(value);
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.max(2, width);
}

export function getVisibleOverlayBorderColor(
  value: string,
  width: number,
): string {
  if (width <= 0) return 'transparent';
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized === 'transparent' ||
    /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(normalized)
  ) {
    return '#ff0000';
  }
  return value;
}

export function opacityFromTransparency(value: number): number {
  return 1 - Math.min(1, Math.max(0, value));
}

export function getBackgroundModeForColor(
  value: string,
): 'transparent' | 'color' {
  return value.trim().toLowerCase() === 'transparent' ? 'transparent' : 'color';
}

interface LeaderboardPositionColors {
  top3HighlightEnabled: boolean;
  positionColor: string;
  top1Color: string;
  top2Color: string;
  top3Color: string;
}

export function getLeaderboardPositionColor(
  index: number,
  colors: LeaderboardPositionColors,
): string {
  if (index >= 3) return '#ffffff';
  if (!colors.top3HighlightEnabled) return colors.positionColor;
  if (index === 0) return colors.top1Color;
  if (index === 1) return colors.top2Color;
  return colors.top3Color;
}

interface OverlayFrameSegmentStyle {
  position: 'fixed';
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  width?: number;
  height?: number;
  backgroundColor: string;
  pointerEvents: 'none';
  zIndex: number;
}

export function getOverlayFrameSegments(
  widthValue: string,
  colorValue: string,
): OverlayFrameSegmentStyle[] {
  const width = getVisibleOverlayBorderWidth(widthValue);
  const color = getVisibleOverlayBorderColor(colorValue, width);
  if (width <= 0) return [];

  const base = {
    position: 'fixed' as const,
    backgroundColor: color,
    pointerEvents: 'none' as const,
    zIndex: 2147483647,
  };

  return [
    { ...base, top: 0, left: 0, right: 0, height: width },
    { ...base, bottom: 0, left: 0, right: 0, height: width },
    { ...base, top: 0, bottom: 0, left: 0, width },
    { ...base, top: 0, bottom: 0, right: 0, width },
  ];
}

export function colorWithOpacity(color: string, opacity: number): string {
  const alpha = Math.min(1, Math.max(0, opacity));
  const normalized = color.trim();
  const rgba = normalized.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );

  if (rgba) {
    return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${alpha})`;
  }

  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    const [r, g, b] = normalized
      .slice(1)
      .split('')
      .map((part) => Number.parseInt(part + part, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    const r = Number.parseInt(normalized.slice(1, 3), 16);
    const g = Number.parseInt(normalized.slice(3, 5), 16);
    const b = Number.parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return normalized === 'transparent' ? 'transparent' : color;
}

export interface LeaderboardLayoutInput {
  userCount: number;
  showTitle: boolean;
  titleSize: string;
  rowHeight: string;
  rowGap: number;
}

export interface LeaderboardLayout {
  columns: 1 | 2;
  rowsPerColumn: number;
  compact: boolean;
  availableHeight: number;
  usedHeight: number;
  rowHeight: number;
  rowGap: number;
  textScale: number;
  titleTextScale: number;
  contentPadding: string;
  titleMarginBottom: number;
  columnGap: number;
  itemPadding: string;
  itemContentGap: number;
  positionWidth: number;
}

export function calculateLeaderboardLayout({
  userCount,
  showTitle,
  titleSize,
  rowHeight,
  rowGap,
}: LeaderboardLayoutInput): LeaderboardLayout {
  const safeUserCount = Math.max(0, Math.floor(userCount));
  const columns: 1 | 2 = safeUserCount > 25 ? 2 : 1;
  const rowsPerColumn = Math.ceil(safeUserCount / columns);
  const baseRowHeight = parsePixels(rowHeight, DEFAULT_ROW_HEIGHT);
  const baseGap = Math.max(0, rowGap);
  const rawTitleSize = parsePixels(titleSize, 24);
  const fittedTitleSize = Math.min(rawTitleSize, columns === 2 ? 40 : 56);
  const titleTextScale = rawTitleSize > 0 ? fittedTitleSize / rawTitleSize : 1;
  const titleHeight = showTitle ? fittedTitleSize * 1.2 : 0;
  const normalTitleMargin = showTitle ? 24 : 0;
  const normalAvailableHeight =
    OVERLAY_HEIGHT - NORMAL_VERTICAL_PADDING - titleHeight - normalTitleMargin;
  const normalUsedHeight =
    rowsPerColumn * baseRowHeight + Math.max(0, rowsPerColumn - 1) * baseGap;
  const compact = normalUsedHeight > normalAvailableHeight;
  const titleMarginBottom = compact && showTitle ? 12 : normalTitleMargin;
  const availableHeight = Math.floor(
    OVERLAY_HEIGHT -
      (compact ? COMPACT_VERTICAL_PADDING : NORMAL_VERTICAL_PADDING) -
      titleHeight -
      titleMarginBottom,
  );

  if (!compact || rowsPerColumn === 0) {
    return {
      columns,
      rowsPerColumn,
      compact,
      availableHeight,
      usedHeight: normalUsedHeight,
      rowHeight: baseRowHeight,
      rowGap: baseGap,
      textScale: 1,
      titleTextScale,
      contentPadding: '40px 32px 32px',
      titleMarginBottom,
      columnGap: baseGap,
      itemPadding: '',
      itemContentGap: 16,
      positionWidth: 40,
    };
  }

  const density = Math.min(1, availableHeight / Math.max(1, normalUsedHeight));
  const fittedGap = Math.max(0, Math.min(baseGap, Math.floor(baseGap * density)));
  const fittedRowHeight = Math.max(
    20,
    Math.min(
      baseRowHeight,
      Math.floor(
        (availableHeight - Math.max(0, rowsPerColumn - 1) * fittedGap) /
          rowsPerColumn,
      ),
    ),
  );
  const textScale = Math.max(0.68, Math.min(1, fittedRowHeight / baseRowHeight));
  const usedHeight =
    rowsPerColumn * fittedRowHeight +
    Math.max(0, rowsPerColumn - 1) * fittedGap;

  return {
    columns,
    rowsPerColumn,
    compact,
    availableHeight,
    usedHeight,
    rowHeight: fittedRowHeight,
    rowGap: fittedGap,
    textScale,
    titleTextScale,
    contentPadding: '24px 16px 16px',
    titleMarginBottom,
    columnGap: columns === 2 ? Math.max(6, fittedGap) : 0,
    itemPadding: `${Math.max(1, Math.floor(fittedRowHeight * 0.1))}px ${
      columns === 2 ? 6 : 10
    }px`,
    itemContentGap: columns === 2 ? 6 : 8,
    positionWidth: columns === 2 ? 32 : 30,
  };
}

export function scalePixelValue(
  value: string,
  scale: number,
  maximum?: number,
): string {
  if (scale === 1 && maximum === undefined) return value;
  if (!/^\s*\d+(?:\.\d+)?px\s*$/i.test(value)) return value;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return value;
  const scaled = parsed * scale;
  return `${Math.max(8, maximum === undefined ? scaled : Math.min(maximum, scaled))}px`;
}
