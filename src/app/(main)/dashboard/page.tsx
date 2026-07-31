'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { useSettingsStore } from '@/store/useSettingsStore';
import { mapSettingsRow } from '@/lib/settingsMapper';
import SettingsPanel from '@/components/SettingsPanel';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [overlayToken, setOverlayToken] = useState<string>('');
  const router = useRouter();
  
  const setAllSettings = useSettingsStore(state => state.setAllSettings);
  const previewMode = useSettingsStore(state => state.previewMode);
  const setPreviewMode = useSettingsStore(state => state.setPreviewMode);
  
  useEffect(() => {
    if (user?.user_metadata?.provider_id && overlayToken) {
      // Create/verify EventSub subscription on Dashboard load
      void fetch('/api/twitch/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twitchId: user.user_metadata.provider_id,
        })
      }).then(async (response) => {
        if (response.ok) return;
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? 'Failed to subscribe');
      }).catch(err => console.error('Failed to subscribe:', err));
    }
  }, [overlayToken, user]);

  useEffect(() => {
    const fetchUserAndSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }
      setUser(user);

      // Fetch or create settings
      const settingsResult = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .single();
      let data = settingsResult.data;
      const error = settingsResult.error;

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
        setAllSettings(mapSettingsRow(data as Record<string, unknown>));
      }
      setLoading(false);
    };

    fetchUserAndSettings();
  }, [setAllSettings, router]);


  if (loading) return <div className="flex h-screen items-center justify-center text-white bg-gray-950">Загрузка...</div>;

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans">
      {/* Левая панель - Настройки */}
      <div className="w-[380px] lg:w-[430px] h-full flex-shrink-0 z-20 shadow-2xl relative">
        <SettingsPanel overlayToken={overlayToken} twitchId={user?.user_metadata?.provider_id || null} />
      </div>

      {/* Правая панель - Предпросмотр 16:9 */}
      <div className="flex-1 relative flex flex-col">
        {/* Canvas Toolbar */}
        <div className="h-12 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between px-4 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
             <span className="text-sm font-medium text-gray-300">Живой предпросмотр</span>
          </div>
          <div className="flex items-center">
            <button 
              onClick={() => setPreviewMode(previewMode === 'demo' ? 'real' : 'demo')}
              className={`px-3 py-1 text-xs rounded transition-colors mr-4 font-bold ${
                previewMode === 'demo' 
                  ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50 hover:bg-yellow-500/30' 
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-white hover:bg-gray-700'
              }`}
            >
              {previewMode === 'demo' ? 'Выключить ДЕМО' : 'Включить ДЕМО'}
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 overflow-y-auto relative flex items-start justify-center p-4 lg:p-8"
          style={{
            backgroundColor: '#0b1120',
            backgroundImage:
              'linear-gradient(rgba(71,85,105,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(71,85,105,.25) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        >
          {/* Container for OBS simulation */}
          <div className="w-full max-w-[500px] min-h-[800px] h-max relative overflow-visible"
               style={{ 
                 containerType: 'size',
               }}
          >
             {previewMode === 'demo' && (
               <div className="absolute -top-12 left-0 right-0 flex justify-center z-50">
                 <div className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-500 px-4 py-1 rounded-full text-xs font-bold shadow-lg animate-pulse">
                   РЕЖИМ ДЕМО ДАННЫХ
                 </div>
               </div>
             )}
             <div className="w-full h-full min-h-[800px] flex items-start justify-center">
               <div className="w-[500px] h-[800px] origin-top relative outline-dashed outline-1 outline-gray-500/30" style={{
                 transform: 'scale(min(100cqi / 500, 1))'
               }}>
                 {overlayToken ? (
                   <iframe 
                     src={`/overlay/${overlayToken}?demo=${previewMode === 'demo'}`} 
                     className="w-full h-full border-0 block pointer-events-none"
                   />
                 ) : (
                   <div className="w-full h-full flex items-center justify-center text-gray-500">
                     Инициализация оверлея...
                   </div>
                 )}
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
