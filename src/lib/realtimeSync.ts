export const OBS_STATS_SYNC = Object.freeze({
  transport: 'polling' as const,
  pollIntervalMs: 2_000,
});

export const OBS_SETTINGS_SYNC = Object.freeze({
  transport: 'polling' as const,
  pollIntervalMs: 5_000,
});
