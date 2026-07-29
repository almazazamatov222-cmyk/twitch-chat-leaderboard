'use client';

import { useSettingsStore, OverlaySettings } from '@/store/useSettingsStore';
import { Copy, Check, Save, Monitor, RefreshCw, Type, LayoutTemplate, Palette, Filter, Settings as SettingsIcon, Play, Square, List, ChevronDown, ChevronUp, Image as ImageIcon, Video, UploadCloud } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { FONT_CATEGORIES } from '@/lib/fonts';
import { supabase } from '@/lib/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

export default function SettingsPanel({ overlayToken }: { overlayToken: string }) {
  const { settings, updateSettings, previewMode, setPreviewMode } = useSettingsStore();
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('main');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // Debounce all settings to trigger save
  const debouncedSettings = useDebounce(settings, 600);

  const overlayUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/overlay/${overlayToken}` 
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
      const dbPayload: any = {};
      const keys = Object.keys(currentSettings) as Array<keyof OverlaySettings>;
      for (const key of keys) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        dbPayload[snakeKey] = currentSettings[key];
      }
      
      // Fetch current schema to ONLY send valid columns
      const { data: schemaData } = await supabase.from('settings').select('*').eq('overlay_token', overlayToken).single();
      if (schemaData) {
        const validKeys = Object.keys(schemaData);
        for (const key of Object.keys(dbPayload)) {
          if (!validKeys.includes(key)) {
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
    // Skip initial mount save
    if (Object.keys(debouncedSettings).length > 0 && overlayToken) {
       handleSave(debouncedSettings);
    }
  }, [debouncedSettings, handleSave, overlayToken]);


  const AccordionHeader = ({ id, label, icon: Icon }: any) => (
    <button 
      onClick={() => setActiveSection(activeSection === id ? '' : id)}
      className="w-full flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800 hover:bg-gray-800 transition-colors"
    >
      <div className="flex items-center gap-3">
        <Icon size={18} className={activeSection === id ? "text-[#9146FF]" : "text-gray-400"} />
        <span className={`font-medium ${activeSection === id ? "text-white" : "text-gray-300"}`}>{label}</span>
      </div>
      {activeSection === id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
    </button>
  );

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
          <AccordionHeader id="main" label="Основное" icon={Monitor} />
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
                </select>
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
        <TextSection activeSection={activeSection} settings={settings} updateSettings={updateSettings} />

        {/* Строки */}
        <div>
          <AccordionHeader id="rows" label="Дизайн фона" icon={Palette} />
          {activeSection === 'rows' && (
            <div className="p-4 space-y-5 bg-gray-950 border-b border-gray-800">
               <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-xs text-gray-400">Цвет фона</label>
                     <div className="flex gap-2">
                       <input type="color" value={settings.backgroundColor.slice(0, 7)} onChange={(e) => updateSettings({ backgroundColor: e.target.value })} className="w-8 h-8 rounded border-0 p-0 cursor-pointer" />
                       <input type="text" value={settings.backgroundColor} onChange={(e) => updateSettings({ backgroundColor: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 text-sm" />
                     </div>
                   </div>
                   <div className="space-y-1">
                     <label className="text-xs text-gray-400">Прозрачность фона</label>
                     <input type="range" min="0" max="1" step="0.05" value={settings.backgroundOpacity} onChange={(e) => updateSettings({ backgroundOpacity: Number(e.target.value) })} className="w-full accent-[#9146FF] h-8" />
                   </div>
                 </div>

                 <div className="space-y-2 pt-2 border-t border-gray-800">
                    <label className="text-xs text-gray-400">Изображение (Рекомендуется 500x800)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={settings.backgroundImagePath} 
                        onChange={(e) => updateSettings({ backgroundImagePath: e.target.value })} 
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
                 </div>

                 <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-800">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">Цвет рамки</label>
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
                        Включить рамку
                      </label>
                    </div>
                    {parseInt(settings.rowBorderWidth) > 0 && (
                      <div className="space-y-1 col-span-2">
                        <label className="text-xs text-gray-400">Толщина (px)</label>
                        <input type="number" min="1" value={parseInt(settings.rowBorderWidth) || 1} onChange={(e) => updateSettings({ rowBorderWidth: `${e.target.value}px` })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm" />
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
          <AccordionHeader id="animation" label="Анимация" icon={Play} />
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

function TextSection({ activeSection, settings, updateSettings }: any) {
  const [target, setTarget] = useState<'title' | 'position' | 'username' | 'counter'>('title');

  if (activeSection !== 'text') return null;

  // Helper to map generic keys to specific element keys
  const get = (key: string) => settings[`${target}${key}`];
  const set = (key: string, val: any) => updateSettings({ [`${target}${key}`]: val });

  return (
    <div>
      <div className="w-full flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Type size={18} className="text-[#9146FF]" />
          <span className="font-medium text-white">Текст и Шрифты</span>
        </div>
        <ChevronUp size={16} className="text-gray-400" />
      </div>
      
      <div className="p-4 space-y-4 bg-gray-950 border-b border-gray-800">
        {/* Target Selector */}
        <div className="flex bg-gray-900 p-1 rounded-lg">
          {[
            { id: 'title', label: 'Заголовок' },
            { id: 'position', label: 'Место' },
            { id: 'username', label: 'Ник' },
            { id: 'counter', label: 'Счётчик' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTarget(t.id as any)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                target === t.id 
                  ? 'bg-gray-700 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Unified Controls */}
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Шрифт</label>
            <select 
              value={get('Font')}
              onChange={(e) => set('Font', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[#9146FF] outline-none"
              style={{ fontFamily: get('Font') }}
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
              <label className="text-xs text-gray-400">Размер шрифта</label>
              <input type="text" value={get('Size')} onChange={e => set('Size', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm" placeholder="16px" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Жирность (Weight)</label>
              <select value={get('Weight')} onChange={e => set('Weight', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm">
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="500">500 (Medium)</option>
                <option value="800">800 (Extra Bold)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Цвет текста</label>
              <div className="flex gap-2">
                <input type="color" value={get('Color').slice(0, 7)} onChange={e => set('Color', e.target.value)} className="w-8 h-8 rounded border-0 p-0 cursor-pointer" />
                <input type="text" value={get('Color')} onChange={e => set('Color', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Прозрачность</label>
              <input type="range" min="0" max="1" step="0.05" value={get('Opacity')} onChange={e => set('Opacity', Number(e.target.value))} className="w-full accent-[#9146FF] h-8" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-800">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Цвет обводки</label>
              <input type="color" value={get('StrokeColor').slice(0,7)} onChange={e => set('StrokeColor', e.target.value)} className="w-full h-8 rounded border-0 p-0 cursor-pointer" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Толщина обводки</label>
              <input type="text" value={get('StrokeWidth')} onChange={e => set('StrokeWidth', e.target.value)} placeholder="0px" className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-800">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Цвет тени</label>
              <input type="color" value={get('ShadowColor').slice(0,7)} onChange={e => set('ShadowColor', e.target.value)} className="w-full h-8 rounded border-0 p-0 cursor-pointer" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Отступ тени (X Y Blur)</label>
              <input type="text" value={settings[`${target}ShadowOpacity`] || '2px 2px 0px'} onChange={e => updateSettings({[`${target}ShadowOpacity`]: e.target.value})} placeholder="2px 2px 0px" className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm" />
              <p className="text-[10px] text-gray-500">Пример: 2px 2px 4px</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
