'use client';

import { useSettingsStore } from '@/store/useSettingsStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

// Моковые данные для превью
const mockUsers = [
  { id: '1', username: 'Almaz', count: 1250 },
  { id: '2', username: 'StreamSniper', count: 840 },
  { id: '3', username: 'PogChamp_123', count: 620 },
  { id: '4', username: 'KekW_master', count: 410 },
  { id: '5', username: 'RandomViewer', count: 110 },
];

export default function LivePreview() {
  const settings = useSettingsStore(state => state.settings);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Имитация новых сообщений
  useEffect(() => {
    if (!settings.highlightNew) return;
    
    const interval = setInterval(() => {
      const randomId = mockUsers[Math.floor(Math.random() * mockUsers.length)].id;
      setHighlightedId(randomId);
      setTimeout(() => setHighlightedId(null), 1000);
    }, 3000);

    return () => clearInterval(interval);
  }, [settings.highlightNew]);

  return (
    <div 
      className="w-full h-full p-6 flex flex-col"
      style={{ 
        fontFamily: settings.fontFamily,
        color: settings.textColor,
        backgroundColor: settings.backgroundColor 
      }}
    >
      {settings.showTitle && (
        <h2 className="text-2xl font-bold mb-6 text-center tracking-wide" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
          {settings.titleText}
        </h2>
      )}

      <div className="flex-1 overflow-hidden" style={{ gap: `${settings.rowGap}px`, display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence>
          {mockUsers.slice(0, settings.topCount).map((user, index) => {
            const isTop3 = index < 3;
            const isHighlighted = highlightedId === user.id;

            return (
              <motion.div
                key={user.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  scale: isHighlighted ? 1.02 : 1,
                }}
                className={`flex items-center justify-between px-4 py-3 relative overflow-hidden`}
                style={{
                  backgroundColor: settings.rowBackground,
                  borderRadius: `${settings.rowRadius}px`,
                  boxShadow: isHighlighted ? `0 0 15px #9146FF` : '0 4px 6px rgba(0,0,0,0.1)',
                  border: isTop3 ? `1px solid rgba(145, 70, 255, ${0.8 - index * 0.2})` : '1px solid transparent',
                  transition: 'box-shadow 0.3s ease, border 0.3s ease'
                }}
              >
                {/* Эффект подсветки */}
                {isHighlighted && (
                  <motion.div 
                    initial={{ opacity: 0.5, x: '-100%' }}
                    animate={{ opacity: 0, x: '100%' }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0 bg-white/20 skew-x-12"
                  />
                )}

                <div className="flex items-center gap-4 z-10">
                  <span className={`font-bold w-6 text-center ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-amber-600' : 'text-gray-500'}`}>
                    #{index + 1}
                  </span>
                  <span className="font-medium truncate max-w-[150px]">
                    {user.username}
                  </span>
                </div>
                
                <div className="font-bold text-lg z-10 tabular-nums">
                  {user.count.toLocaleString('ru-RU')}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
