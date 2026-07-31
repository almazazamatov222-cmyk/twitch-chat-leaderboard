'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import LivePreview from '@/components/LivePreview';
import { getOverlayFrameStyle } from '@/lib/overlayLayout';
import { mapSettingsRow } from '@/lib/settingsMapper';
import { supabase } from '@/lib/supabase/client';
import { OBS_STATS_SYNC } from '@/lib/realtimeSync';
import { useSettingsStore } from '@/store/useSettingsStore';

interface OverlayState {
  settings: Record<string, unknown>;
  twitch_id: string | null;
  twitch_username: string | null;
  session_id: string | null;
}

interface StatsDebug {
  statsError: string | null;
  lastStatsFetchAt: string | null;
  rowsCount: number;
  firstUser: { username: string; count: number } | null;
}

function OverlayContent({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === 'true';
  const showDebug = searchParams.get('debug') === 'true';

  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState('INIT');
  const [statsDebug, setStatsDebug] = useState<StatsDebug | null>(null);

  const setAllSettings = useSettingsStore((state) => state.setAllSettings);
  const setPreviewMode = useSettingsStore((state) => state.setPreviewMode);
  const overlayBorderWidth = useSettingsStore(
    (state) => state.settings.overlayBorderWidth,
  );
  const overlayBorderColor = useSettingsStore(
    (state) => state.settings.overlayBorderColor,
  );
  const overlayRadius = useSettingsStore((state) => state.settings.overlayRadius);

  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;

    setPreviewMode(isDemo ? 'demo' : 'real');

    const fetchState = async () => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;

      try {
        const { data, error } = await supabase.rpc('get_overlay_state', {
          p_overlay_token: token,
        });

        if (cancelled) return;
        if (error) {
          setSettingsError(error.message);
          setSettingsLoaded(false);
          setSessionId(null);
          return;
        }

        const state = data as OverlayState | null;
        if (!state?.settings) {
          setSettingsError('Overlay token was not found');
          setSettingsLoaded(false);
          setSessionId(null);
          return;
        }

        setAllSettings(mapSettingsRow(state.settings));
        setSettingsError(null);
        setSettingsLoaded(true);
        setSessionId(state.session_id ?? null);
      } catch (error) {
        if (!cancelled) {
          setSettingsError(error instanceof Error ? error.message : String(error));
          setSessionId(null);
        }
      } finally {
        requestInFlight = false;
        if (!cancelled) setLoading(false);
      }
    };

    void fetchState();
    const interval = setInterval(fetchState, OBS_STATS_SYNC.pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isDemo, setAllSettings, setPreviewMode, token]);

  if (loading) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        minWidth: '100vw',
        minHeight: '100vh',
        overflow: 'hidden',
        boxSizing: 'border-box',
        background: 'transparent',
      }}
    >
      <LivePreview
        sessionId={sessionId}
        overlayToken={token}
        onRealtimeStatusChange={setRealtimeStatus}
        onStatsDebug={setStatsDebug}
      />

      <div
        aria-hidden="true"
        style={getOverlayFrameStyle(
          overlayBorderWidth,
          overlayBorderColor,
          overlayRadius,
        )}
      />

      {showDebug && (
        <div className="pointer-events-none absolute top-4 left-4 z-[999] max-w-sm rounded-lg border border-yellow-500/50 bg-black/80 p-4 font-mono text-xs text-white shadow-2xl backdrop-blur-sm">
          <h3 className="mb-2 border-b border-yellow-500/30 pb-1 font-bold text-yellow-400">
            OVERLAY DEBUG
          </h3>
          <div>Settings: {settingsLoaded ? 'loaded' : 'not loaded'}</div>
          <div>Session ID: {sessionId ?? 'offline'}</div>
          <div>Realtime: {realtimeStatus}</div>
          <div>Safety poll: {OBS_STATS_SYNC.pollIntervalMs} ms</div>
          <div>Stats error: {statsDebug?.statsError ?? 'none'}</div>
          <div>
            Last fetch:{' '}
            {statsDebug?.lastStatsFetchAt
              ? new Date(statsDebug.lastStatsFetchAt).toLocaleTimeString()
              : 'never'}
          </div>
          <div>Rows: {statsDebug?.rowsCount ?? 0}</div>
          {statsDebug?.firstUser && (
            <div>
              Top: {statsDebug.firstUser.username} ({statsDebug.firstUser.count})
            </div>
          )}
          {settingsError && <div className="mt-2 text-red-400">{settingsError}</div>}
        </div>
      )}
    </div>
  );
}

export default function OverlayPage() {
  const params = useParams<{ token: string }>();
  if (!params?.token) return null;

  return (
    <Suspense fallback={null}>
      <OverlayContent token={params.token} />
    </Suspense>
  );
}
