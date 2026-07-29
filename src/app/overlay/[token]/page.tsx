'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSettingsStore, defaultSettings } from '@/store/useSettingsStore';
import LivePreview from '@/components/LivePreview';
import { useTwitchChat } from '@/hooks/useTwitchChat';

export default function OverlayPage({ params }: { params: { token: string } }) {
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [twitchUsername, setTwitchUsername] = useState<string>('');
  
  const setAllSettings = useSettingsStore(state => state.setAllSettings);
  const setPreviewMode = useSettingsStore(state => state.setPreviewMode);

  // Use Twitch Chat for Leader Election and counting
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
      
      // Map to store
      setAllSettings({
        ...defaultSettings,
        titleText: settingData.title_text || defaultSettings.titleText,
        showTitle: settingData.show_title ?? defaultSettings.showTitle,
        topCount: settingData.top_count || defaultSettings.topCount,
        backgroundColor: settingData.background_color || defaultSettings.backgroundColor,
        textColor: settingData.text_color || defaultSettings.textColor,
        fontFamily: settingData.font_family || defaultSettings.fontFamily,
        rowBackground: settingData.row_background || defaultSettings.rowBackground,
        rowRadius: settingData.row_radius ? `${settingData.row_radius}px` : defaultSettings.rowRadius,
        rowGap: settingData.row_gap || defaultSettings.rowGap,
        highlightNew: settingData.highlight_new ?? defaultSettings.highlightNew,
        
        width: settingData.width || defaultSettings.width,
        height: settingData.height || defaultSettings.height,
        scale: settingData.scale || defaultSettings.scale,
        opacity: settingData.opacity || defaultSettings.opacity,
        paddings: settingData.paddings || defaultSettings.paddings,
        alignX: settingData.align_x || defaultSettings.alignX,
        alignY: settingData.align_y || defaultSettings.alignY,
        
        titleFont: settingData.title_font || defaultSettings.titleFont,
        titleSize: settingData.title_size || defaultSettings.titleSize,
        titleColor: settingData.title_color || defaultSettings.titleColor,
        
        positionFont: settingData.position_font || defaultSettings.positionFont,
        positionColor: settingData.position_color || defaultSettings.positionColor,
        positionFormat: settingData.position_format || defaultSettings.positionFormat,
        
        usernameFont: settingData.username_font || defaultSettings.usernameFont,
        usernameColor: settingData.username_color || defaultSettings.usernameColor,
        
        counterFont: settingData.counter_font || defaultSettings.counterFont,
        counterColor: settingData.counter_color || defaultSettings.counterColor,
        counterFormat: settingData.counter_format || defaultSettings.counterFormat,
        
        rowTemplate: settingData.row_template || defaultSettings.rowTemplate,
        animationType: settingData.animation_type || defaultSettings.animationType,
        ignoreCommands: settingData.ignore_commands ?? defaultSettings.ignoreCommands,
        minMessageLength: settingData.min_message_length || defaultSettings.minMessageLength,
      });

      // 2. Subscribe to settings changes
      const settingsSub = supabase.channel(`settings_changes_${crypto.randomUUID()}`)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'settings',
          filter: `overlay_token=eq.${params.token}`
        }, (payload) => {
          const data = payload.new as any;
          setAllSettings({
            ...defaultSettings,
            titleText: data.title_text || defaultSettings.titleText,
            showTitle: data.show_title ?? defaultSettings.showTitle,
            topCount: data.top_count || defaultSettings.topCount,
            backgroundColor: data.background_color || defaultSettings.backgroundColor,
            textColor: data.text_color || defaultSettings.textColor,
            fontFamily: data.font_family || defaultSettings.fontFamily,
            rowBackground: data.row_background || defaultSettings.rowBackground,
            rowRadius: data.row_radius ? `${data.row_radius}px` : defaultSettings.rowRadius,
            rowGap: data.row_gap || defaultSettings.rowGap,
            highlightNew: data.highlight_new ?? defaultSettings.highlightNew,
            width: data.width || defaultSettings.width,
            height: data.height || defaultSettings.height,
            scale: data.scale || defaultSettings.scale,
            opacity: data.opacity || defaultSettings.opacity,
            paddings: data.paddings || defaultSettings.paddings,
            alignX: data.align_x || defaultSettings.alignX,
            alignY: data.align_y || defaultSettings.alignY,
            titleFont: data.title_font || defaultSettings.titleFont,
            titleSize: data.title_size || defaultSettings.titleSize,
            titleColor: data.title_color || defaultSettings.titleColor,
            positionFont: data.position_font || defaultSettings.positionFont,
            positionColor: data.position_color || defaultSettings.positionColor,
            positionFormat: data.position_format || defaultSettings.positionFormat,
            usernameFont: data.username_font || defaultSettings.usernameFont,
            usernameColor: data.username_color || defaultSettings.usernameColor,
            counterFont: data.counter_font || defaultSettings.counterFont,
            counterColor: data.counter_color || defaultSettings.counterColor,
            counterFormat: data.counter_format || defaultSettings.counterFormat,
            rowTemplate: data.row_template || defaultSettings.rowTemplate,
            animationType: data.animation_type || defaultSettings.animationType,
            ignoreCommands: data.ignore_commands ?? defaultSettings.ignoreCommands,
            minMessageLength: data.min_message_length || defaultSettings.minMessageLength,
          });
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
