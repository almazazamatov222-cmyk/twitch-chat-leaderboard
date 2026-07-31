'use client';

import { useSettingsStore, OverlaySettings } from '@/store/useSettingsStore';
import { Copy, Check, Monitor, RefreshCw, Type, Palette, Settings as SettingsIcon, Play, ChevronDown, ChevronUp, UploadCloud } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { FONT_CATEGORIES } from '@/lib/fonts';
import { supabase } from '@/lib/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import {
  getBackgroundModeForColor,
  opacityFromTransparency,
} from '@/lib/overlayLayout';

interface AccordionHeaderProps {
  id: string;
  label: string;
  icon: LucideIcon;
  activeSection: string;
  onToggle: (id: string) => void;
}

interface TwitchConnectionStatus {
  status?: string;
  error?: string | null;
}

function AccordionHeader({ id, label, icon: Icon, activeSection, onToggle }: AccordionHeaderProps) {
  return (
    <button 
      onClick={() => onToggle(id)}
      className="w-full flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800 hover:bg-gray-800 transition-colors"
    >
      <div className="flex items-center gap-3">
        <Icon size={18} className={activeSection === id ? "text-[#9146FF]" : "text-gray-400"} />
        <span className={`font-medium ${activeSection === id ? "text-white" : "text-gray-300"}`}>{label}</span>
      </div>
      {activeSection === id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
    </button>
  );
}

export default function SettingsPanel({ overlayToken, twitchId }: { overlayToken: string, twitchId?: string | null }) {
  const { settings, updateSettings } = useSettingsStore();
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('main');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [twitchStatus, setTwitchStatus] = useState<TwitchConnectionStatus | null>(null);
  const [twitchStatusLoading, setTwitchStatusLoading] = useState(false);
  const schemaKeysRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!twitchId) return;
    let isMounted = true;
    let pollInterval: NodeJS.Timeout | null = null;
    
    const checkStatus = async () => {
      if (isMounted) setTwitchStatusLoading(true);
      try {
        const res = await fetch(`/api/twitch/subscription-status?twitchId=${twitchId}`);
        const data = await res.json();
        if (data.success && isMounted) {
          setTwitchStatus((prev) => ({
            ...prev,
            status: data.status,
            error: data.error
          }));
        }
      } catch (err) {
        console.error('Failed to fetch status', err);
      } finally {
        if (isMounted) setTwitchStatusLoading(false);
      }
    };

    checkStatus();

    // Subscribe to DB changes
    const channel = supabase.channel(`twitch_connection_${twitchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'webhook_diagnostics', filter: `twitch_id=eq.${twitchId}` },
        (payload) => {
          if (isMounted && payload.new) {
            const diagnostic = payload.new as Record<string, unknown>;
            setTwitchStatus({
              status:
                typeof diagnostic.subscription_status === 'string'
                  ? diagnostic.subscription_status
                  : 'unknown',
              error: typeof diagnostic.last_webhook_error === 'string' ? diagnostic.last_webhook_error : null,
            });
          }
        }
      ).subscribe();

    // Polling logic
    pollInterval = setInterval(() => {
      setTwitchStatus((currentStatus) => {
        if (!currentStatus?.status || ['missing', 'unknown', 'verification_received', 'pending', 'webhook_callback_verification_pending'].includes(currentStatus.status)) {
          checkStatus();
        }
        return currentStatus;
      });
    }, 30_000);

    return () => { 
      isMounted = false; 
      if (pollInterval) clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [twitchId]);
  
  // Debounce all settings to trigger save
  const debouncedSettings = useDebounce(settings, 600);

  const [urlVersion] = useState('obs');
  const overlayUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/overlay/${overlayToken}?v=${urlVersion}` 
    : '';

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleSave = useCallback(async (currentSettings: OverlaySettings) => {
    if (!overlayToken) return;
    setSaveStatus('saving');
    try {
      // Map back to snake_case
      const dbPayload: Record<string, unknown> = {};
      const keys = Object.keys(currentSettings) as Array<keyof OverlaySettings>;
      for (const key of keys) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        dbPayload[snakeKey] = currentSettings[key];
      }
      
      // Cache the schema once instead of downloading the whole row on every save.
      if (!schemaKeysRef.current) {
        const { data: schemaData } = await supabase
          .from('settings')
          .select('*')
          .eq('overlay_token', overlayToken)
          .single();
        if (schemaData) schemaKeysRef.current = new Set(Object.keys(schemaData));
      }
      if (schemaKeysRef.current) {
        for (const key of Object.keys(dbPayload)) {
          if (!schemaKeysRef.current.has(key)) {
            delete dbPayload[key];
          }
        }
      }
      
      const { error } = await supabase.from('settings').update(dbPayload).eq('overlay_token', overlayToken);
      if (error) {
         console.error("Supabase Save Error:", error);
         alert("Ошибка сохранения: " + error.message);
         throw error;
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to save', err);
      setSaveStatus('error');
    }
  }, [overlayToken]);

  // Auto-save effect
  useEffect(() => {
    const isHydrated = useSettingsStore.getState().isSettingsHydrated;
    if (isHydrated && Object.keys(debouncedSettings).length > 0 && overlayToken) {
       // eslint-disable-next-line react-hooks/set-state-in-effect
       handleSave(debouncedSettings);
    }
  }, [debouncedSettings, handleSave, overlayToken]);

  const toggleSection = (id: string) => {
    setActiveSection(activeSection === id ? '' : id);
  };

  const parseRgba = (rgbaStr: string) => {
    if (!rgbaStr) return { hex: '#000000', opacity: 1 };
    if (rgbaStr.startsWith('#')) return { hex: rgbaStr, opacity: 1 };
    const match = rgbaStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      const hex = '#' + [match[1], match[2], match[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
      return { hex, opacity: match[4] ? parseFloat(match[4]) : 1 };
    }
    return { hex: '#000000', opacity: 1 };
  };

  const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 border-r border-gray-800">
      
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <SettingsIcon size={20} className="text-[#9146FF]" />
          Настройки
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {saveStatus === 'saving' && 'Сохраняется...'}
            {saveStatus === 'saved' && <span className="text-green-400">Сохранено</span>}
            {saveStatus === 'error' && <span className="text-red-400">Ошибка</span>}
          </span>
        </div>
      </div>

      {/* URL OBS */}
      <div className="p-4 border-b border-gray-800 bg-[#9146FF]/5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-[#9146FF] uppercase tracking-wider">URL для OBS (рекомендуется 500x800)</h3>
        </div>
        <div className="flex gap-2">
          <input 
            type="text" 
            readOnly 
            value={overlayUrl}
            className="flex-1 bg-black/50 border border-[#9146FF]/30 rounded px-3 py-1.5 text-sm text-gray-300 focus:outline-none"
          />
          <button 
            onClick={copyToClipboard}
            className="px-3 py-1.5 bg-[#9146FF]/20 hover:bg-[#9146FF]/40 text-[#9146FF] rounded transition-colors"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      {/* Accordion Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar pb-20">
        
        {/* Основное */}
        <div>
          <AccordionHeader id="main" label="Основное" icon={Monitor} activeSection={activeSection} onToggle={toggleSection} />
          {activeSection === 'main' && (
            <div className="p-4 space-y-5 bg-gray-950 border-b border-gray-800">
              <div className="space-y-2">
                <label className="text-xs text-gray-400">Количество участников в топе</label>
                <select 
                  value={settings.topCount}
                  onChange={(e) => updateSettings({ topCount: Number(e.target.value) })}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[#9146FF] outline-none"
                >
                  <option value={3}>Топ 3</option>
                  <option value={5}>Топ 5</option>
                  <option value={10}>Топ 10</option>
                  <option value={15}>Топ 15</option>
                  <option value={20}>Топ 20</option>
                  <option value={30}>Топ 30</option>
                  <option value={40}>Топ 40</option>
                  <option value={50}>Топ 50</option>
                </select>
                <p className="text-[11px] leading-relaxed text-gray-500">
                  До 25 участников — одна колонка. Для топа 30–50 включаются две
                  колонки, а строки и отступы автоматически уменьшаются под 500×800.
                </p>
              </div>

              <div className="pt-4 border-t border-gray-800">
                {twitchStatusLoading && !twitchStatus ? (
                  <div className="text-sm text-gray-400">Проверяем подключение Twitch...</div>
                ) : twitchStatus?.status === 'enabled' ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-sm text-green-400 font-medium flex items-center gap-2">
                      <Check size={16} /> Twitch-чат подключён
                    </div>
                    <button
                      onClick={async () => {
                        await supabase.auth.signInWithOAuth({
                          provider: 'twitch',
                          options: {
                            redirectTo: `${window.location.origin}/auth/callback`,
                            scopes: 'user:read:chat user:bot channel:bot',
                            queryParams: { force_verify: 'true' }
                          }
                        });
                      }}
                      className="text-xs text-gray-500 hover:text-white transition-colors self-start"
                    >
                      Переподключить
                    </button>
                  </div>
                ) : (twitchStatus?.status === 'webhook_callback_verification_pending' || twitchStatus?.status === 'verification_received') ? (
                  <div className="text-sm text-yellow-400 font-medium animate-pulse">
                    Проверяем подключение Twitch (ожидание вебхука)...
                  </div>
                ) : (
                  <div>
                    {twitchStatus?.error && (
                      <div className="text-xs text-red-400 mb-2">Ошибка: {twitchStatus.error}</div>
                    )}
                    <button
                      onClick={async () => {
                        await supabase.auth.signInWithOAuth({
                          provider: 'twitch',
                          options: {
                            redirectTo: `${window.location.origin}/auth/callback`,
                            scopes: 'user:read:chat user:bot channel:bot',
                            queryParams: { force_verify: 'true' }
                          }
                        });
                      }}
                      className="w-full bg-[#9146FF] hover:bg-[#772ce8] text-white py-2 px-4 rounded font-medium transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(145,70,255,0.4)] hover:shadow-[0_0_25px_rgba(145,70,255,0.6)]"
                    >
                      <RefreshCw size={16} />
                      Подключить Twitch-чат
                    </button>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      Необходимо для выдачи прав чтения чата серверу (EventSub).
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-800">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Заголовок</label>
                  <input type="checkbox" checked={settings.showTitle} onChange={(e) => updateSettings({ showTitle: e.target.checked })} className="accent-[#9146FF]" />
                </div>
                {settings.showTitle && (
                  <input type="text" value={settings.titleText} onChange={(e) => updateSettings({ titleText: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[#9146FF] outline-none" placeholder="Например: Топ чата" />
                )}
              </div>


            </div>
          )}
        </div>

        {/* Текст */}
        <div>
          <AccordionHeader id="text" label="Текст и Шрифты" icon={Type} activeSection={activeSection} onToggle={toggleSection} />
          {activeSection === 'text' && (
            <TextSection settings={settings} updateSettings={updateSettings} />
          )}
        </div>

        {/* Строки */}
        <div>
          <AccordionHeader id="rows" label="Дизайн фона" icon={Palette} activeSection={activeSection} onToggle={toggleSection} />
          {activeSection === 'rows' && (
            <div className="p-4 space-y-5 bg-gray-950 border-b border-gray-800">
               <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-xs text-gray-400">Фон строк (за ником)</label>
                     <input
                       type="color"
                       value={parseRgba(settings.rowColor).hex}
                       onChange={(e) => updateSettings({ rowColor: e.target.value })}
                       className="w-full h-8 rounded border-0 p-0 cursor-pointer"
                     />
                   </div>
                   <div className="space-y-1">
                     <label className="text-xs text-gray-400">Прозрачность строк</label>
                     <input
                       type="range"
                       min="0"
                       max="1"
                       step="0.05"
                       value={1 - settings.rowOpacity}
                       onChange={(e) => updateSettings({
                         rowOpacity: opacityFromTransparency(Number(e.target.value)),
                       })}
                       className="w-full accent-[#9146FF] h-8"
                     />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-xs text-gray-400">Цвет фона</label>
                     <div className="flex gap-2">
                       <input type="color" value={settings.backgroundColor.slice(0, 7)} onChange={(e) => updateSettings({ backgroundColor: e.target.value, backgroundMode: 'color' })} className="w-8 h-8 rounded border-0 p-0 cursor-pointer" />
                       <input type="text" value={settings.backgroundColor} onChange={(e) => updateSettings({ backgroundColor: e.target.value, backgroundMode: getBackgroundModeForColor(e.target.value) })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 text-sm" />
                     </div>
                   </div>
                   <div className="space-y-1">
                     <label className="text-xs text-gray-400">Прозрачность фона</label>
                     <input 
                       type="range" 
                       min="0" 
                       max="1" 
                       step="0.05" 
                       value={1 - settings.backgroundOpacity} 
                       onChange={(e) => updateSettings({
                         backgroundOpacity: opacityFromTransparency(Number(e.target.value)),
                         backgroundMode: getBackgroundModeForColor(settings.backgroundColor),
                       })}
                       className="w-full accent-[#9146FF] h-8" 
                     />
                   </div>
                 </div>

                 <div className="space-y-2 pt-2 border-t border-gray-800">
                    <label className="text-xs text-gray-400">Изображение (Рекомендуется 500x800)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={settings.backgroundImagePath} 
                        onChange={(e) => updateSettings({
                          backgroundImagePath: e.target.value,
                          backgroundMode: e.target.value.trim()
                            ? 'image'
                            : getBackgroundModeForColor(settings.backgroundColor),
                        })}
                        placeholder="https://..." 
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
                      />
                      <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-3 py-1.5 flex items-center justify-center transition-colors">
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const fileExt = file.name.split('.').pop();
                            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
                            const { error: uploadError } = await supabase.storage.from('backgrounds').upload(fileName, file);
                            if (uploadError) throw uploadError;
                            const { data } = supabase.storage.from('backgrounds').getPublicUrl(fileName);
                            updateSettings({ backgroundImagePath: data.publicUrl, backgroundMode: 'image' });
                          } catch (err) {
                            console.error(err);
                            alert('Ошибка при загрузке изображения');
                          }
                        }} />
                        <UploadCloud size={16} className="text-gray-300" />
                      </label>
                    </div>
                    {settings.backgroundMode === 'image' && (
                      <div className="space-y-1 mt-3 border-t border-gray-800 pt-3">
                        <label className="text-xs text-gray-400">Прозрачность изображения</label>
                        <input 
                          type="range" 
                          min="0" 
                          max="1" 
                          step="0.05" 
                          value={1 - settings.backgroundImageOpacity} 
                          onChange={(e) => updateSettings({ backgroundImageOpacity: 1 - Number(e.target.value) })} 
                          className="w-full accent-[#9146FF] h-8" 
                        />
                      </div>
                    )}
                 </div>

                 <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-800">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">Цвет рамки строк</label>
                      <input 
                        type="color" 
                        value={parseRgba(settings.rowBorderColor).hex} 
                        onChange={(e) => updateSettings({ rowBorderColor: hexToRgba(e.target.value, 1) })} 
                        className="w-full h-8 rounded border-0 p-0 cursor-pointer" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400 flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={parseInt(settings.rowBorderWidth) > 0}
                          onChange={(e) => updateSettings({ rowBorderWidth: e.target.checked ? '1px' : '0px' })}
                          className="accent-[#9146FF]"
                        />
                        Рамка строк
                      </label>
                    </div>
                    {parseInt(settings.rowBorderWidth) > 0 && (
                      <div className="space-y-1 col-span-2">
                        <label className="text-xs text-gray-400">Толщина рамки строк (px)</label>
                        <input type="number" min="1" value={parseInt(settings.rowBorderWidth) || 1} onChange={(e) => updateSettings({ rowBorderWidth: `${e.target.value}px` })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm" />
                      </div>
                    )}
                 </div>

                 <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-800">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">Цвет рамки оверлея (OBS)</label>
                      <input 
                        type="color" 
                        value={parseRgba(settings.overlayBorderColor).hex} 
                        onChange={(e) => updateSettings({ overlayBorderColor: hexToRgba(e.target.value, 1) })} 
                        className="w-full h-8 rounded border-0 p-0 cursor-pointer" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400 flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={parseInt(settings.overlayBorderWidth) > 0}
                          onChange={(e) => updateSettings({
                            overlayBorderWidth: e.target.checked ? '2px' : '0px',
                            ...(e.target.checked && settings.overlayBorderColor === 'transparent'
                              ? { overlayBorderColor: '#ff0000' }
                              : {}),
                          })}
                          className="accent-[#9146FF]"
                        />
                        Рамка оверлея
                      </label>
                    </div>
                    {parseInt(settings.overlayBorderWidth) > 0 && (
                      <div className="space-y-1 col-span-2">
                        <label className="text-xs text-gray-400">Толщина рамки оверлея (минимум 2 px)</label>
                        <input type="number" min="2" value={Math.max(2, parseInt(settings.overlayBorderWidth) || 2)} onChange={(e) => updateSettings({ overlayBorderWidth: `${Math.max(2, Number(e.target.value) || 2)}px` })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm" />
                      </div>
                    )}
                 </div>

                 <div className="pt-3 border-t border-gray-800 space-y-3">
                   <div className="flex items-center justify-between">
                     <label className="text-sm font-medium text-[#ffd700]">Выделение Топ-3 цветом</label>
                     <input type="checkbox" checked={settings.top3HighlightEnabled} onChange={(e) => updateSettings({ top3HighlightEnabled: e.target.checked })} className="accent-[#9146FF]" />
                   </div>
                   {settings.top3HighlightEnabled && (
                     <div className="grid grid-cols-3 gap-2">
                       <div className="space-y-1">
                         <label className="text-[10px] text-gray-400 uppercase">1 место</label>
                         <input type="color" value={settings.top1Color} onChange={(e) => updateSettings({ top1Color: e.target.value })} className="w-full h-8 rounded border-0 p-0" />
                       </div>
                       <div className="space-y-1">
                         <label className="text-[10px] text-gray-400 uppercase">2 место</label>
                         <input type="color" value={settings.top2Color} onChange={(e) => updateSettings({ top2Color: e.target.value })} className="w-full h-8 rounded border-0 p-0" />
                       </div>
                       <div className="space-y-1">
                         <label className="text-[10px] text-gray-400 uppercase">3 место</label>
                         <input type="color" value={settings.top3Color} onChange={(e) => updateSettings({ top3Color: e.target.value })} className="w-full h-8 rounded border-0 p-0" />
                       </div>
                     </div>
                   )}
                 </div>
               </div>
            </div>
          )}
        </div>


        {/* Анимация */}
        <div>
          <AccordionHeader id="animation" label="Анимация" icon={Play} activeSection={activeSection} onToggle={toggleSection} />
          {activeSection === 'animation' && (
            <div className="p-4 space-y-5 bg-gray-950 border-b border-gray-800">
               <div className="space-y-2">
                 <label className="text-xs text-gray-400">Появление строк</label>
                 <select 
                   value={settings.animationType}
                   onChange={(e) => updateSettings({ animationType: e.target.value })}
                   className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[#9146FF] outline-none"
                 >
                   <option value="none">Без анимации</option>
                   <option value="fade">Плавное появление (Fade)</option>
                   <option value="slide-left">Выезд слева</option>
                   <option value="slide-up">Выезд снизу</option>
                   <option value="zoom">Увеличение (Zoom)</option>
                   <option value="spring">Пружина (Spring)</option>
                 </select>
               </div>
               
               <div className="space-y-2">
                 <label className="text-xs text-gray-400">Анимация счётчика</label>
                 <select 
                   value={settings.counterAnimation}
                   onChange={(e) => updateSettings({ counterAnimation: e.target.value })}
                   className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[#9146FF] outline-none"
                 >
                   <option value="none">Без анимации</option>
                   <option value="pop">Подпрыгивание (Pop)</option>
                   <option value="pulse">Пульсация (Pulse)</option>
                   <option value="smooth">Плавная прокрутка числа</option>
                 </select>
               </div>

               <div className="space-y-2 pt-2 border-t border-gray-800">
                 <label className="flex items-center gap-3 cursor-pointer">
                   <input type="checkbox" checked={settings.rankAnimationEnabled} onChange={(e) => updateSettings({ rankAnimationEnabled: e.target.checked })} className="accent-[#9146FF] w-4 h-4 rounded" />
                   <span className="text-sm text-gray-300">Плавное перемещение строк при изменении позиции</span>
                 </label>
               </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// Extract complex sub-sections to components for readability

function TextSection({ settings, updateSettings }: { settings: OverlaySettings, updateSettings: (value: Partial<OverlaySettings>) => void }) {
  return (
    <div className="p-4 space-y-4 bg-gray-950 border-b border-gray-800">
      <div className="space-y-1">
        <label className="text-xs text-gray-400">Шрифт</label>
        <select 
          value={settings.titleFont}
          onChange={(e) => updateSettings({ 
            titleFont: e.target.value, 
            positionFont: e.target.value, 
            usernameFont: e.target.value, 
            counterFont: e.target.value 
          })}
          className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[#9146FF] outline-none"
          style={{ fontFamily: settings.titleFont }}
        >
          {FONT_CATEGORIES.map(cat => (
            <optgroup key={cat.name} label={cat.name}>
              {cat.fonts.map(font => (
                <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Размер заголовка</label>
          <input type="text" value={settings.titleSize} onChange={e => updateSettings({ titleSize: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm" placeholder="24px" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Цвет заголовка</label>
          <div className="flex gap-2">
            <input type="color" value={settings.titleColor.slice(0, 7)} onChange={e => updateSettings({ titleColor: e.target.value })} className="w-8 h-8 rounded border-0 p-0 cursor-pointer" />
            <input type="text" value={settings.titleColor} onChange={e => updateSettings({ titleColor: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-800">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Размер текста (Строки)</label>
          <input type="text" value={settings.usernameSize} onChange={e => updateSettings({ 
            usernameSize: e.target.value,
            positionSize: e.target.value,
            counterSize: e.target.value
          })} className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm" placeholder="16px" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Цвет текста (Строки)</label>
          <div className="flex gap-2">
            <input type="color" value={settings.usernameColor.slice(0, 7)} onChange={e => updateSettings({ 
              usernameColor: e.target.value,
              positionColor: e.target.value,
              counterColor: e.target.value
            })} className="w-8 h-8 rounded border-0 p-0 cursor-pointer" />
            <input type="text" value={settings.usernameColor} onChange={e => updateSettings({ 
              usernameColor: e.target.value,
              positionColor: e.target.value,
              counterColor: e.target.value
            })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-800">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Жирность (Weight)</label>
          <select 
            value={settings.titleWeight} 
            onChange={e => updateSettings({ 
              titleWeight: e.target.value,
              positionWeight: e.target.value,
              usernameWeight: e.target.value,
              counterWeight: e.target.value
            })} 
            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm"
          >
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
            <option value="500">500 (Medium)</option>
            <option value="800">800 (Extra Bold)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Тень (Цвет)</label>
          <input type="color" value={settings.titleShadowColor.slice(0,7)} onChange={e => updateSettings({ 
            titleShadowColor: e.target.value,
            positionShadowColor: e.target.value,
            usernameShadowColor: e.target.value,
            counterShadowColor: e.target.value
          })} className="w-full h-8 rounded border-0 p-0 cursor-pointer" />
        </div>
      </div>
    </div>
  );
}
