'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSettingsStore, defaultSettings, OverlaySettings } from '@/store/useSettingsStore';
import LivePreview from '@/components/LivePreview';
import DiagnosticPanel from '@/components/DiagnosticPanel';
import { useDiagnostics } from '@/hooks/useDiagnostics';
import { useSearchParams } from 'next/navigation';

function OverlayContent({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [twitchUsername, setTwitchUsername] = useState<string>('');
  const [twitchId, setTwitchId] = useState<string>('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  
  const setAllSettings = useSettingsStore(state => state.setAllSettings);
  const setPreviewMode = useSettingsStore(state => state.setPreviewMode);
  
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === 'true';
  const showDebug = searchParams.get('debug') === 'true';

  const [realtimeStatus, setRealtimeStatus] = useState<string>('INIT');
  const diag = useDiagnostics(twitchId || null);

  useEffect(() => {
    document.documentElement.classList.add('overlay-page');
    document.body.classList.add('overlay-page');
    return () => {
      document.documentElement.classList.remove('overlay-page');
      document.body.classList.remove('overlay-page');
    };
  }, []);

  useEffect(() => {
    setPreviewMode(isDemo ? 'demo' : 'real');

    let settingsSub: any;
    let sessionSub: any;
    let cancelled = false;
    let pollInterval: any;
    let isPolling = false;
    let currentUserId: string | null = null;

    const mapSettings = (data: any) => {
      const loadedSettings = { ...defaultSettings };
      const keys = Object.keys(defaultSettings) as Array<keyof OverlaySettings>;
      for (const key of keys) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        if (data[snakeKey] !== undefined && data[snakeKey] !== null) {
          (loadedSettings as any)[key] = data[snakeKey];
        }
      }
      let rawRowColor = data.row_background || defaultSettings.rowColor;
      if (rawRowColor.startsWith('rgba')) {
        const match = rawRowColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
          rawRowColor = '#' + [match[1], match[2], match[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
        }
      }
      loadedSettings.rowColor = rawRowColor;
      loadedSettings.rowGap = data.row_gap ?? defaultSettings.rowGap;
      return loadedSettings;
    };

    const fetchAll = async () => {
      if (cancelled) return;
      
      const { data: settingData } = await supabase
        .from('settings')
        .select('*')
        .eq('overlay_token', token)
        .single();
        
      if (!settingData) {
        if (!cancelled) setLoading(false);
        return;
      }
      
      if (settingData) {
        setTwitchUsername(settingData.twitch_username);
        setTwitchId(settingData.twitch_id);
        currentUserId = settingData.user_id;
        const loadedSettings = mapSettings(settingData);
        setAllSettings(loadedSettings);
        setSettingsLoaded(true);
      }

      const { data: sessionId, error: rpcError } = await supabase.rpc('get_or_create_active_session', { p_overlay_token: token });
      
      if (rpcError) {
        console.error('RPC Error in overlay:', rpcError);
        if (!cancelled) setSessionId(null);
      } else {
        if (!cancelled) setSessionId(sessionId || null);
      }
      
      if (!cancelled) setLoading(false);
    };

    const startPolling = () => {
      if (isPolling) return;
      isPolling = true;
      pollInterval = setInterval(fetchAll, 3000);
    };

    const stopPolling = () => {
      isPolling = false;
      if (pollInterval) clearInterval(pollInterval);
    };

    const init = async () => {
      await fetchAll();
      if (cancelled || !currentUserId) return;

      settingsSub = supabase.channel(`settings_changes_${crypto.randomUUID()}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings', filter: `overlay_token=eq.${token}` }, (payload) => {
          setAllSettings(mapSettings(payload.new));
        })
        .subscribe((status, err) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') stopPolling();
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') startPolling();
        });

      sessionSub = supabase.channel(`session_changes_${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `user_id=eq.${currentUserId}` }, () => {
          fetchAll();
        })
        .subscribe((status, err) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') stopPolling();
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') startPolling();
        });
    };
    
    init();

    return () => {
      cancelled = true;
      stopPolling();
      if (settingsSub) supabase.removeChannel(settingsSub);
      if (sessionSub) supabase.removeChannel(sessionSub);
    };
  }, [token, setAllSettings, setPreviewMode, isDemo]);

  if (loading) return null;

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <LivePreview sessionId={sessionId} onRealtimeStatusChange={setRealtimeStatus} />
      {showDebug && (
        <div className="absolute top-4 left-4 z-[999] bg-black/80 text-white p-4 rounded-lg border border-yellow-500/50 shadow-2xl text-xs font-mono max-w-sm pointer-events-none backdrop-blur-sm">
          <h3 className="text-yellow-400 font-bold mb-2 border-b border-yellow-500/30 pb-1">OVERLAY DEBUG</h3>
          <div>Token: {token}</div>
          <div>Settings Loaded: {settingsLoaded ? 'Yes' : 'No'}</div>
          <div>Session ID: {sessionId || 'None'}</div>
          {settingsError && <div className="text-red-400 mt-2">Error: {settingsError}</div>}
        </div>
      )}
      {showDebug && (
        <DiagnosticPanel 
          twitchUsername={twitchUsername}
          sessionId={sessionId}
          realtimeStatus={realtimeStatus}
          diag={diag}
        />
      )}
    </div>
  );
}

import { useParams } from 'next/navigation';

export default function OverlayPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  if (!token) {
    return null; // Or a debug message if you prefer, but null matches requirements
  }

  return (
    <Suspense fallback={null}>
      <OverlayContent token={token} />
    </Suspense>
  );
}
