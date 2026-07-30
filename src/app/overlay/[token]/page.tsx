'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSettingsStore, defaultSettings, OverlaySettings } from '@/store/useSettingsStore';
import LivePreview from '@/components/LivePreview';
import { useTwitchChat } from '@/hooks/useTwitchChat';
import { useSearchParams } from 'next/navigation';

function OverlayContent({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [twitchUsername, setTwitchUsername] = useState<string>('');
  
  const setAllSettings = useSettingsStore(state => state.setAllSettings);
  const setPreviewMode = useSettingsStore(state => state.setPreviewMode);
  
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === 'true';

  useTwitchChat(twitchUsername, sessionId, token);

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
      
      currentUserId = settingData.user_id;
      if (!cancelled) {
        setTwitchUsername(settingData.twitch_username);
        setAllSettings(mapSettings(settingData));
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
      <LivePreview sessionId={sessionId} />
    </div>
  );
}

export default function OverlayPage({ params }: { params: { token: string } }) {
  return (
    <Suspense fallback={null}>
      <OverlayContent token={params.token} />
    </Suspense>
  );
}
