'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSettingsStore, defaultSettings, OverlaySettings } from '@/store/useSettingsStore';
import LivePreview from '@/components/LivePreview';

import { useTwitchChat } from '@/hooks/useTwitchChat';

export default function OverlayPage({ params }: { params: { token: string } }) {
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [twitchUsername, setTwitchUsername] = useState<string>('');
  
  const setAllSettings = useSettingsStore(state => state.setAllSettings);
  const setPreviewMode = useSettingsStore(state => state.setPreviewMode);

  useTwitchChat(twitchUsername, sessionId, params.token);

  useEffect(() => {
    // Overlay is always in real mode
    setPreviewMode('real');

    const init = async () => {
      // 1. Fetch settings by token
      const { data: settingData } = await supabase
        .from('settings')
        .select('*')
        .eq('overlay_token', params.token)
        .single();
        
      if (!settingData) {
        setLoading(false);
        return;
      }
      
      setTwitchUsername(settingData.twitch_username);
      
      const mapSettings = (data: any) => {
        const loadedSettings = { ...defaultSettings };
        const keys = Object.keys(defaultSettings) as Array<keyof OverlaySettings>;
        for (const key of keys) {
          const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          if (data[snakeKey] !== undefined && data[snakeKey] !== null) {
            (loadedSettings as any)[key] = data[snakeKey];
          }
        }
        loadedSettings.rowColor = data.row_background || defaultSettings.rowColor;
        loadedSettings.rowGap = data.row_gap ?? defaultSettings.rowGap;
        return loadedSettings;
      };

      setAllSettings(mapSettings(settingData));

      // 2. Subscribe to settings changes
      const settingsSub = supabase.channel(`settings_changes_${crypto.randomUUID()}`)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'settings',
          filter: `overlay_token=eq.${params.token}`
        }, (payload) => {
          setAllSettings(mapSettings(payload.new));
        })
        .subscribe();

      // 3. Fetch active session
      const fetchSession = async () => {
        const { data: sessionData } = await supabase
          .from('sessions')
          .select('id')
          .eq('user_id', settingData.user_id)
          .eq('status', 'active')
          .single();
        
        if (sessionData) {
          setSessionId(sessionData.id);
        } else {
          setSessionId(null);
        }
      };
      
      await fetchSession();

      const sessionSub = supabase.channel(`session_changes_${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `user_id=eq.${settingData.user_id}` }, () => {
          fetchSession();
        })
        .subscribe();

      setLoading(false);

      return () => {
        settingsSub.unsubscribe();
        sessionSub.unsubscribe();
      };
    };
    
    init();
  }, [params.token, setAllSettings, setPreviewMode]);

  if (loading) return null; // OBS doesn't need a loading spinner
  
  // If no session, show nothing to avoid cluttering OBS
  if (!sessionId) return null;

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <LivePreview sessionId={sessionId} />
    </div>
  );
}
