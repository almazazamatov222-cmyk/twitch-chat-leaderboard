'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSettingsStore } from '@/store/useSettingsStore';
import SettingsPanel from '@/components/SettingsPanel';
import LivePreview from '@/components/LivePreview';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [overlayToken, setOverlayToken] = useState<string>('');
  const settings = useSettingsStore(state => state.settings);

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
        // Create settings if not exists
        const res = await supabase.from('settings').insert({ 
          user_id: user.id,
          twitch_id: user.user_metadata.provider_id,
          twitch_username: user.user_metadata.preferred_username || user.user_metadata.name
        }).select().single();
        data = res.data;
      }

      if (data) {
        setOverlayToken(data.overlay_token);
        useSettingsStore.getState().setAllSettings({
          titleText: data.title_text,
          showTitle: data.show_title,
          topCount: data.top_count,
          backgroundColor: data.background_color,
          textColor: data.text_color,
          fontFamily: data.font_family,
          rowBackground: data.row_background || 'rgba(0,0,0,0.5)',
          rowRadius: data.row_radius || 8,
          rowGap: data.row_gap || 8,
          highlightNew: data.highlight_new ?? true,
        });
      }
      setLoading(false);
    };

    fetchUserAndSettings();
  }, []);

  const handleSave = async () => {
    if (!user) return;
    await supabase.from('settings').update({
      title_text: settings.titleText,
      show_title: settings.showTitle,
      top_count: settings.topCount,
      background_color: settings.backgroundColor,
      text_color: settings.textColor,
      font_family: settings.fontFamily,
      row_background: settings.rowBackground,
      row_radius: settings.rowRadius,
      row_gap: settings.rowGap,
      highlight_new: settings.highlightNew,
    }).eq('user_id', user.id);
    alert('Настройки сохранены!');
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-white">Загрузка...</div>;

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Левая панель - Настройки */}
      <div className="w-[450px] border-r border-gray-800 bg-gray-900 flex flex-col h-full z-10 shadow-xl overflow-y-auto">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900 sticky top-0 z-20">
          <h1 className="text-2xl font-bold">Управление</h1>
          <button 
            onClick={handleSave}
            className="px-4 py-2 bg-[#9146FF] hover:bg-[#772ce8] rounded font-medium text-sm transition-colors"
          >
            Сохранить
          </button>
        </div>
        
        <SettingsPanel overlayToken={overlayToken} />
      </div>

      {/* Правая панель - Предпросмотр */}
      <div className="flex-1 relative bg-[url('https://transparenttextures.com/patterns/cubes.png')] bg-gray-800/20">
        <div className="absolute top-4 left-4 bg-gray-900/80 px-4 py-2 rounded-lg border border-gray-700 backdrop-blur-sm z-10">
          Живой предпросмотр
        </div>
        
        <div className="w-full h-full flex items-center justify-center p-8">
          <div 
            className="border-2 border-dashed border-gray-600 rounded-xl relative overflow-hidden transition-all duration-300"
            style={{ width: '400px', height: '600px', backgroundColor: settings.backgroundColor }}
          >
            <LivePreview />
          </div>
        </div>
      </div>
    </div>
  );
}
