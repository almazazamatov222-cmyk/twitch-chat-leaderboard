'use client';

import { useSettingsStore, PreviewMode } from '@/store/useSettingsStore';
import { useSession } from '@/hooks/useSession';
import { Copy, Check, Save, Monitor, RefreshCw, Type, LayoutTemplate, Palette, Filter, Settings as SettingsIcon, Play, Square, List } from 'lucide-react';
import { useState, useEffect } from 'react';
import { FONT_CATEGORIES } from '@/lib/fonts';
import { supabase } from '@/lib/supabase/client';

export default function SettingsPanel({ overlayToken }: { overlayToken: string }) {
  const { settings, updateSettings, previewMode, setPreviewMode } = useSettingsStore();
  const { activeSession, loading, startNewSession, endSession, resetSession } = useSession();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // In a real app we'd map settings keys to snake_case for DB
      // For this prototype we assume the backend handles it or we map it
      // Let's do a simple mapping
      const dbPayload = {
        title_text: settings.titleText,
        show_title: settings.showTitle,
        top_count: settings.topCount,
        background_color: settings.backgroundColor,
        text_color: settings.textColor,
        font_family: settings.fontFamily, // We use this as global fallback if needed
        row_background: settings.rowBackground,
        row_radius: settings.rowRadius ? parseInt(settings.rowRadius) : 0,
        row_gap: settings.rowGap,
        highlight_new: settings.highlightNew,
        
        // Advanced
        width: settings.width,
        height: settings.height,
        scale: settings.scale,
        opacity: settings.opacity,
        paddings: settings.paddings,
        align_x: settings.alignX,
        align_y: settings.alignY,
        title_font: settings.titleFont,
        title_size: settings.titleSize,
        title_color: settings.titleColor,
        position_font: settings.positionFont,
        position_color: settings.positionColor,
        position_format: settings.positionFormat,
        username_font: settings.usernameFont,
        username_color: settings.usernameColor,
        counter_font: settings.counterFont,
        counter_color: settings.counterColor,
        counter_format: settings.counterFormat,
        row_template: settings.rowTemplate,
        animation_type: settings.animationType,
        ignore_commands: settings.ignoreCommands,
        min_message_length: settings.minMessageLength,
      };

      await supabase.from('settings').update(dbPayload).eq('overlay_token', overlayToken);
      
    } catch (err) {
      console.error('Failed to save', err);
    } finally {
      setTimeout(() => setIsSaving(false), 1000);
    }
  };

  const FontSelect = ({ label, value, onChange }: any) => (
    <div className="space-y-1">
      <label className="text-xs text-gray-400">{label}</label>
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm focus:border-[#9146FF] focus:outline-none"
        style={{ fontFamily: value }}
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
  );

  return (
    <div className="flex flex-col h-full bg-gray-950 border-l border-gray-800">
      
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <SettingsIcon size={20} className="text-[#9146FF]" />
          Настройки
        </h2>
        <div className="flex gap-2">
          <button 
            onClick={() => window.location.href = '/dashboard/history'}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors"
          >
            История
          </button>
          <button 
            onClick={handleSave}
            className="px-3 py-1.5 bg-[#9146FF] hover:bg-[#7b3be6] rounded text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            Сохранить
          </button>
        </div>
      </div>

      {/* URL OBS */}
      <div className="p-4 border-b border-gray-800 bg-[#9146FF]/5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-[#9146FF] uppercase tracking-wider">URL для OBS</h3>
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

      {/* Session Control */}
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Сессия трансляции</h3>
        
        {loading ? (
          <div className="text-sm text-gray-500 animate-pulse">Загрузка сессии...</div>
        ) : activeSession ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center bg-green-500/10 border border-green-500/20 p-3 rounded-lg">
              <div>
                <div className="text-sm font-medium text-green-400 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Сессия активна
                </div>
                <div className="text-xs text-gray-400 mt-1">Всего сообщений: {activeSession.total_messages}</div>
              </div>
              <button 
                onClick={endSession}
                className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded"
                title="Завершить сессию"
              >
                <Square size={16} />
              </button>
            </div>
            
            <div className="flex gap-2">
              <button onClick={resetSession} className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs rounded">
                Сбросить счётчики
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-gray-500 bg-gray-900 p-3 rounded border border-gray-800">
              Нет активной сессии. Счётчик сообщений остановлен.
            </div>
            <button 
              onClick={startNewSession}
              className="w-full py-2 bg-[#9146FF] hover:bg-[#7b3be6] rounded text-sm font-medium flex items-center justify-center gap-2"
            >
              <Play size={16} /> Начать новую сессию
            </button>
          </div>
        )}
      </div>

      {/* Mode Switch */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex bg-gray-900 p-1 rounded-lg">
          {(['demo', 'simulate', 'real'] as PreviewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setPreviewMode(mode)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                previewMode === mode 
                  ? 'bg-gray-700 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {mode === 'demo' ? 'Демо' : mode === 'simulate' ? 'Симуляция' : 'Live'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-gray-800 hide-scrollbar">
        {[
          { id: 'general', icon: Monitor, label: 'Общие' },
          { id: 'text', icon: Type, label: 'Шрифты' },
          { id: 'layout', icon: LayoutTemplate, label: 'Шаблон' },
          { id: 'filters', icon: Filter, label: 'Фильтры' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id 
                ? 'border-[#9146FF] text-[#9146FF]' 
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {activeTab === 'general' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <label className="text-xs text-gray-400 flex justify-between mb-2">
                <span>Количество в топе</span>
                <span className="text-[#9146FF]">{settings.topCount}</span>
              </label>
              <input 
                type="range" min="3" max="50" step="1"
                value={settings.topCount}
                onChange={(e) => updateSettings({ topCount: Number(e.target.value) })}
                className="w-full accent-[#9146FF]"
              />
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Фон списка</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">Цвет фона строк</label>
                  <input 
                    type="text" 
                    value={settings.rowBackground}
                    onChange={(e) => updateSettings({ rowBackground: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">Скругление (px)</label>
                  <input 
                    type="number" 
                    value={parseInt(settings.rowRadius)}
                    onChange={(e) => updateSettings({ rowRadius: e.target.value + 'px' })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">Отступ между (px)</label>
                  <input 
                    type="number" 
                    value={settings.rowGap}
                    onChange={(e) => updateSettings({ rowGap: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Анимации</h4>
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.highlightNew}
                  onChange={(e) => updateSettings({ highlightNew: e.target.checked })}
                  className="w-4 h-4 rounded accent-[#9146FF]"
                />
                <span className="text-sm">Подсвечивать при новом сообщении</span>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'text' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            
            {/* Title Font */}
            <div className="p-3 bg-gray-900/50 border border-gray-800 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Заголовок</h4>
                <input 
                  type="checkbox" 
                  checked={settings.showTitle}
                  onChange={(e) => updateSettings({ showTitle: e.target.checked })}
                  className="w-4 h-4 accent-[#9146FF]"
                />
              </div>
              {settings.showTitle && (
                <>
                  <input 
                    type="text" 
                    value={settings.titleText}
                    onChange={(e) => updateSettings({ titleText: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm"
                    placeholder="Текст заголовка"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FontSelect label="Шрифт" value={settings.titleFont} onChange={(v: string) => updateSettings({ titleFont: v })} />
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">Цвет</label>
                      <div className="flex gap-2">
                        <input type="color" value={settings.titleColor} onChange={(e) => updateSettings({ titleColor: e.target.value })} className="w-8 h-8 rounded border-0 p-0" />
                        <input type="text" value={settings.titleColor} onChange={(e) => updateSettings({ titleColor: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded px-2 text-sm" />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Position Font */}
            <div className="p-3 bg-gray-900/50 border border-gray-800 rounded-lg space-y-3">
              <h4 className="text-sm font-medium">Место (Позиция)</h4>
              <div className="grid grid-cols-2 gap-3">
                <FontSelect label="Шрифт" value={settings.positionFont} onChange={(v: string) => updateSettings({ positionFont: v })} />
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">Цвет (Топ 4+)</label>
                  <input type="color" value={settings.positionColor} onChange={(e) => updateSettings({ positionColor: e.target.value })} className="w-full h-8 rounded border-0 p-0" />
                </div>
              </div>
            </div>

            {/* Username Font */}
            <div className="p-3 bg-gray-900/50 border border-gray-800 rounded-lg space-y-3">
              <h4 className="text-sm font-medium">Никнейм</h4>
              <div className="grid grid-cols-2 gap-3">
                <FontSelect label="Шрифт" value={settings.usernameFont} onChange={(v: string) => updateSettings({ usernameFont: v })} />
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">Цвет</label>
                  <input type="color" value={settings.usernameColor} onChange={(e) => updateSettings({ usernameColor: e.target.value })} className="w-full h-8 rounded border-0 p-0" />
                </div>
              </div>
            </div>

            {/* Counter Font */}
            <div className="p-3 bg-gray-900/50 border border-gray-800 rounded-lg space-y-3">
              <h4 className="text-sm font-medium">Счётчик</h4>
              <div className="grid grid-cols-2 gap-3">
                <FontSelect label="Шрифт" value={settings.counterFont} onChange={(v: string) => updateSettings({ counterFont: v })} />
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">Цвет</label>
                  <input type="color" value={settings.counterColor} onChange={(e) => updateSettings({ counterColor: e.target.value })} className="w-full h-8 rounded border-0 p-0" />
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'layout' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <label className="text-xs text-gray-400">Шаблон строки</label>
              <input 
                type="text" 
                value={settings.rowTemplate}
                onChange={(e) => updateSettings({ rowTemplate: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-gray-500">Доступные теги: <code className="text-[#9146FF]">{"{position}"}</code>, <code className="text-[#9146FF]">{"{avatar}"}</code>, <code className="text-[#9146FF]">{"{username}"}</code>, <code className="text-[#9146FF]">{"{messages}"}</code></p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-400">Формат числа (Счётчик)</label>
              <input 
                type="text" 
                value={settings.counterFormat}
                onChange={(e) => updateSettings({ counterFormat: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder="{messages} шт."
              />
            </div>
          </div>
        )}

        {activeTab === 'filters' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={settings.ignoreCommands}
                onChange={(e) => updateSettings({ ignoreCommands: e.target.checked })}
                className="w-4 h-4 rounded accent-[#9146FF]"
              />
              <span className="text-sm">Игнорировать команды (начинаются с !)</span>
            </label>

            <div className="space-y-2">
              <label className="text-xs text-gray-400">Минимальная длина сообщения</label>
              <input 
                type="number" 
                min="1"
                value={settings.minMessageLength}
                onChange={(e) => updateSettings({ minMessageLength: parseInt(e.target.value) || 1 })}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
