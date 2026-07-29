'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSettingsStore, defaultSettings, OverlaySettings } from '@/store/useSettingsStore';
import SettingsPanel from '@/components/SettingsPanel';
import LivePreview from '@/components/LivePreview';
import { useTwitchChat } from '@/hooks/useTwitchChat';
import { useSession } from '@/hooks/useSession';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [overlayToken, setOverlayToken] = useState<string>('');
  const [twitchUsername, setTwitchUsername] = useState<string>('');
  
  const setAllSettings = useSettingsStore(state => state.setAllSettings);
  const { activeSession } = useSession();

  // Dashboard can also participate in master election and listen to chat
  useTwitchChat(twitchUsername, activeSession?.id ?? null, overlayToken);

  
  // 16:9 Canvas Background modes
  const [canvasBg, setCanvasBg] = useState<'grid' | 'light' | 'dark' | 'game'>('grid');
  const [isTwitchConnected, setIsTwitchConnected] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsTwitchConnected(localStorage.getItem('twitch_connected') === 'true');
    }
  }, []);

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
        const loadedSettings = { ...defaultSettings };
        
        // We do a smart mapping
        const keys = Object.keys(defaultSettings) as Array<keyof OverlaySettings>;
        for (const key of keys) {
          // camelCase to snake_case mapping for DB lookup
          const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          if (data[snakeKey] !== undefined && data[snakeKey] !== null) {
            (loadedSettings as any)[key] = data[snakeKey];
          }
        }
        
        // Manual fallbacks for legacy data mappings
        loadedSettings.rowColor = data.row_background || defaultSettings.rowColor;
        loadedSettings.rowGap = data.row_gap ?? defaultSettings.rowGap;

        setAllSettings(loadedSettings);
      }
      setLoading(false);
    };

    fetchUserAndSettings();
  }, [setAllSettings]);

  if (loading) return <div className="flex h-screen items-center justify-center text-white bg-gray-950">Загрузка...</div>;

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans">
      {/* Левая панель - Настройки */}
      <div className="w-[380px] lg:w-[430px] h-full flex-shrink-0 z-20 shadow-2xl relative">
        <SettingsPanel overlayToken={overlayToken} />
      </div>

      {/* Правая панель - Предпросмотр 16:9 */}
      <div className="flex-1 relative flex flex-col">
        {/* Canvas Toolbar */}
        <div className="h-12 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between px-4 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
             <span className="text-sm font-medium text-gray-300">Живой предпросмотр</span>
          </div>
          <div className="flex gap-2 items-center">
            {!isTwitchConnected && (
              <button 
                onClick={async () => {
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    
                    const res = await fetch('/api/twitch/subscribe', { 
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${session?.access_token || ''}`
                      }
                    });
                    const data = await res.json();
                    if (data.success || data.details?.online === 'already_exists') {
                      localStorage.setItem('twitch_connected', 'true');
                      setIsTwitchConnected(true);
                      alert('Успешно подключено к Twitch! Теперь сессии будут запускаться автоматически при начале стрима.');
                    } else {
                      alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
                    }
                  } catch (e) {
                    alert('Ошибка сети.');
                  }
                }}
                className="px-3 py-1 text-xs rounded transition-colors bg-[#9146FF]/20 text-[#9146FF] hover:bg-[#9146FF]/40 font-bold border border-[#9146FF]/30 mr-4"
              >
                Подключить Twitch Автоматизацию
              </button>
            )}
            <button onClick={() => setCanvasBg('grid')} className={`px-3 py-1 text-xs rounded transition-colors ${canvasBg === 'grid' ? 'bg-[#9146FF] text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Сетка</button>
            <button onClick={() => setCanvasBg('light')} className={`px-3 py-1 text-xs rounded transition-colors ${canvasBg === 'light' ? 'bg-[#9146FF] text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Светлый</button>
            <button onClick={() => setCanvasBg('dark')} className={`px-3 py-1 text-xs rounded transition-colors ${canvasBg === 'dark' ? 'bg-[#9146FF] text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Тёмный</button>
            <button onClick={() => setCanvasBg('game')} className={`px-3 py-1 text-xs rounded transition-colors ${canvasBg === 'game' ? 'bg-[#9146FF] text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Игра</button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 overflow-hidden relative flex items-center justify-center p-4 lg:p-8"
          style={{
            background: canvasBg === 'grid' ? 'url(https://transparenttextures.com/patterns/cubes.png) rgba(31, 41, 55, 0.2)' :
                       canvasBg === 'light' ? '#f3f4f6' : 
                       canvasBg === 'dark' ? '#111827' :
                       'url(https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop) center/cover no-repeat',
            backgroundColor: canvasBg === 'grid' ? 'rgba(31, 41, 55, 0.2)' : undefined
          }}
        >
          {/* 16:9 Aspect Ratio Container for OBS simulation */}
          <div className="w-full max-w-[500px] h-[800px] border border-gray-600/50 shadow-2xl relative overflow-hidden rounded shadow-black/50"
               style={{ 
                 containerType: 'size',
               }}
          >
             <div className="absolute inset-0 w-full h-full flex items-center justify-center">
               <div className="w-[500px] h-[800px] origin-center relative pointer-events-none" style={{
                 transform: 'scale(min(100cqi / 500, 100cqb / 800))'
               }}>
                 <LivePreview />
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
