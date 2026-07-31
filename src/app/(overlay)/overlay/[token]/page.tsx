'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import LivePreview from '@/components/LivePreview';
import { colorWithOpacity, getOverlayFrameSegments } from '@/lib/overlayLayout';
import { mapSettingsRow } from '@/lib/settingsMapper';
import { supabase } from '@/lib/supabase/client';
import { OBS_SETTINGS_SYNC } from '@/lib/realtimeSync';
import { useSettingsStore } from '@/store/useSettingsStore';

interface OverlayState {
  settings: Record<string, unknown>;
  twitch_id: string | null;
  twitch_username: string | null;
  session_id: string | null;
}

function OverlayContent({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === 'true';

  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const settingsSignatureRef = useRef('');

  const setAllSettings = useSettingsStore((state) => state.setAllSettings);
  const setPreviewMode = useSettingsStore((state) => state.setPreviewMode);
  const overlayBorderWidth = useSettingsStore(
    (state) => state.settings.overlayBorderWidth,
  );
  const overlayBorderColor = useSettingsStore(
    (state) => state.settings.overlayBorderColor,
  );
  const overlayRadius = useSettingsStore((state) => state.settings.overlayRadius);
  const backgroundMode = useSettingsStore((state) => state.settings.backgroundMode);
  const backgroundColor = useSettingsStore((state) => state.settings.backgroundColor);
  const backgroundOpacity = useSettingsStore(
    (state) => state.settings.backgroundOpacity,
  );
  const overlayFrameSegments = getOverlayFrameSegments(
    overlayBorderWidth,
    overlayBorderColor,
  );

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
          setSessionId(null);
          return;
        }

        const state = data as OverlayState | null;
        if (!state?.settings) {
          setSessionId(null);
          return;
        }

        const nextSettings = mapSettingsRow(state.settings);
        const nextSignature = JSON.stringify(nextSettings);
        if (settingsSignatureRef.current !== nextSignature) {
          settingsSignatureRef.current = nextSignature;
          setAllSettings(nextSettings);
        }
        setSessionId(state.session_id ?? null);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load overlay state:', error);
          setSessionId(null);
        }
      } finally {
        requestInFlight = false;
        if (!cancelled) setLoading(false);
      }
    };

    void fetchState();
    const interval = setInterval(fetchState, OBS_SETTINGS_SYNC.pollIntervalMs);

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
        borderRadius: overlayRadius || '0px',
        boxSizing: 'border-box',
        backgroundColor:
          backgroundMode === 'color'
            ? colorWithOpacity(backgroundColor, backgroundOpacity)
            : 'transparent',
      }}
    >
      <LivePreview
        sessionId={sessionId}
        overlayToken={token}
      />
      {overlayFrameSegments.map((style, index) => (
        <div key={index} aria-hidden="true" style={style} />
      ))}
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
