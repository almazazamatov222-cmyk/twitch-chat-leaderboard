'use client';

import { useSettingsStore } from '@/store/useSettingsStore';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

export default function SettingsPanel({ overlayToken }: { overlayToken: string }) {
  const { settings, updateSettings } = useSettingsStore();
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="p-6 space-y-8">
      {/* Управление */}
      <div className="flex gap-4">
        <button 
          onClick={() => window.location.href = '/fleeale/history'}
          className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium transition-colors"
        >
          История стримов
        </button>
      </div>
      {/* Ссылка для OBS */}
      <div className="space-y-2 bg-gray-800/50 p-4 rounded-lg border border-[#9146FF]/30">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Ссылка для OBS</h3>
        <p className="text-xs text-gray-400 mb-2">Скопируйте эту ссылку и вставьте в OBS как Browser Source (Источник "Браузер").</p>
        <div className="flex gap-2">
          <input 
            type="text" 
            readOnly 
            value={overlayUrl}
            className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:outline-none"
          />
          <button 
            onClick={copyToClipboard}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors"
          >
            {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
          </button>
        </div>
      </div>

      {/* Настройки текста */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-gray-800 pb-2">Заголовок</h3>
        
        <label className="flex items-center gap-3 cursor-pointer">
          <input 
            type="checkbox" 
            checked={settings.showTitle}
            onChange={(e) => updateSettings({ showTitle: e.target.checked })}
            className="w-4 h-4 rounded accent-[#9146FF]"
          />
          <span className="text-sm">Показывать заголовок</span>
        </label>

        {settings.showTitle && (
          <div className="space-y-2">
            <label className="text-xs text-gray-400">Текст заголовка</label>
            <input 
              type="text" 
              value={settings.titleText}
              onChange={(e) => updateSettings({ titleText: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:border-[#9146FF] focus:outline-none transition-colors"
            />
          </div>
        )}
      </div>

      {/* Настройки рейтинга */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-gray-800 pb-2">Внешний вид</h3>
        
        <div className="space-y-2">
          <label className="text-xs text-gray-400 flex justify-between">
            <span>Количество участников в топе</span>
            <span className="text-[#9146FF]">{settings.topCount}</span>
          </label>
          <input 
            type="range" 
            min="3" max="20" step="1"
            value={settings.topCount}
            onChange={(e) => updateSettings({ topCount: Number(e.target.value) })}
            className="w-full accent-[#9146FF]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-gray-400">Цвет текста</label>
            <div className="flex gap-2">
              <input 
                type="color" 
                value={settings.textColor}
                onChange={(e) => updateSettings({ textColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0"
              />
              <input 
                type="text" 
                value={settings.textColor}
                onChange={(e) => updateSettings({ textColor: e.target.value })}
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm uppercase"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs text-gray-400">Цвет фона строк</label>
            <input 
              type="text" 
              value={settings.rowBackground}
              onChange={(e) => updateSettings({ rowBackground: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
              placeholder="rgba(0,0,0,0.5)"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-gray-400">Шрифт</label>
          <select 
            value={settings.fontFamily}
            onChange={(e) => updateSettings({ fontFamily: e.target.value })}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:border-[#9146FF] focus:outline-none"
          >
            <option value="Inter">Inter (По умолчанию)</option>
            <option value="Roboto">Roboto</option>
            <option value="Montserrat">Montserrat</option>
            <option value="Oswald">Oswald</option>
            <option value="'Press Start 2P', cursive">Press Start 2P (Пиксельный)</option>
          </select>
        </div>
      </div>
      
      {/* Настройки анимаций */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-gray-800 pb-2">Анимации</h3>
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
  );
}
