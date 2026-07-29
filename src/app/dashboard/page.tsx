'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSettingsStore, defaultSettings } from '@/store/useSettingsStore';
import SettingsPanel from '@/components/SettingsPanel';
import LivePreview from '@/components/LivePreview';
import { useSession } from '@/hooks/useSession';
import { useTwitchChat } from '@/hooks/useTwitchChat';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [overlayToken, setOverlayToken] = useState<string>('');
  const [twitchUsername, setTwitchUsername] = useState<string>('');
  
  const settings = useSettingsStore(state => state.settings);
  const setAllSettings = useSettingsStore(state => state.setAllSettings);
  
  const { activeSession } = useSession();

  // Initialize Twitch chat hook for leader election
  // The hook does nothing if twitchUsername or sessionId is missing
  useTwitchChat(twitchUsername, activeSession?.id ?? null);

  useEffect(() => {
    const fetchUserAndSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUser(user);

      // Fetch or create settings
      let { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!data && error?.code === 'PGRST116') {
        const res = await supabase.from('settings').insert({ 
          user_id: user.id,
          twitch_id: user.user_metadata.provider_id,
          twitch_username: user.user_metadata.preferred_username || user.user_metadata.name
        }).select().single();
        data = res.data;
      }

      if (data) {
        setOverlayToken(data.overlay_token);
        setTwitchUsername(data.twitch_username);
        
        // Map database fields to store settings
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
      }
      setLoading(false);
    };

    fetchUserAndSettings();
  }, [setAllSettings]);

  if (loading) return <div className="flex h-screen items-center justify-center text-white bg-gray-950">Загрузка...</div>;

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans">
      <SettingsPanel overlayToken={overlayToken} />

      {/* Правая панель - Предпросмотр */}
      <div className="flex-1 relative bg-[url('https://transparenttextures.com/patterns/cubes.png')] bg-gray-800/20">
        <div className="absolute top-4 left-4 bg-gray-900/80 px-4 py-2 rounded-lg border border-gray-700 backdrop-blur-sm z-10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Живой предпросмотр
        </div>
        
        <div className="w-full h-full flex items-center justify-center p-8">
          <div 
            className="border-2 border-dashed border-gray-600 rounded-xl relative overflow-hidden transition-all duration-300"
            style={{ 
              width: '400px', 
              height: '600px', 
              backgroundColor: settings.backgroundColor,
              backgroundImage: settings.bgImage ? `url(${settings.bgImage})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            <LivePreview sessionId={activeSession?.id || null} />
          </div>
        </div>
      </div>
    </div>
  );
}
