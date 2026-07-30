'use client';

import { useSettingsStore } from '@/store/useSettingsStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useMessageStats } from '@/hooks/useMessageStats';
import { useEffect, useState } from 'react';

interface LivePreviewProps {
  sessionId?: string | null;
}

export default function LivePreview({ sessionId }: LivePreviewProps) {
  const settings = useSettingsStore(state => state.settings);
  const previewMode = useSettingsStore(state => state.previewMode);
  
  // Real data
  const { sortedUsers: realUsers } = useMessageStats(sessionId || null);

  // Demo data generator
  const [demoUsers, setDemoUsers] = useState<{id: string, username: string, count: number}[]>([]);
  
  useEffect(() => {
    if (previewMode === 'demo' || !sessionId) {
      // Generate some fake users
      const users = Array.from({ length: 50 }).map((_, i) => ({
        id: `demo-${i}`,
        username: `StreamUser_${Math.floor(Math.random() * 1000)}`,
        count: Math.floor(Math.random() * 500) + 10
      })).sort((a, b) => b.count - a.count);
      setDemoUsers(users);

      // Randomly update demo data every 2 seconds
      const interval = setInterval(() => {
        setDemoUsers(prev => {
          const newUsers = [...prev];
          const index = Math.floor(Math.random() * 5);
          if (newUsers[index]) {
            newUsers[index] = { ...newUsers[index], count: newUsers[index].count + Math.floor(Math.random() * 5) + 1 };
          }
          return newUsers.sort((a, b) => b.count - a.count);
        });
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [previewMode, sessionId]);

  const displayUsers = (previewMode === 'demo' || !sessionId) ? demoUsers : realUsers;
  const topUsers = displayUsers.slice(0, settings.topCount);

  // Helper for text styles
  const getTextStyle = (prefix: 'title' | 'position' | 'username' | 'counter') => {
    const s = settings as any;
    return {
      fontFamily: s[`${prefix}Font`],
      fontSize: s[`${prefix}Size`],
      fontWeight: s[`${prefix}Weight`] === 'bold' ? 700 : (s[`${prefix}Weight`] === 'normal' ? 400 : Number(s[`${prefix}Weight`])),
      color: s[`${prefix}Color`],
      letterSpacing: s[`${prefix}LetterSpacing`],
      opacity: s[`${prefix}Opacity`],
      WebkitTextStroke: `${s[`${prefix}StrokeWidth`]} ${s[`${prefix}StrokeColor`]}`,
      textShadow: s[`${prefix}ShadowColor`] !== 'transparent' ? s[`${prefix}ShadowOpacity`] : 'none', // We stored the whole shadow string in Opacity field for simplicity in UI, wait, the UI mapped X Y Blur to ShadowOpacity
    };
  };

  const getPositionColor = (index: number) => {
    if (!settings.top3HighlightEnabled) return settings.positionColor;
    if (index === 0) return settings.top1Color;
    if (index === 1) return settings.top2Color;
    if (index === 2) return settings.top3Color;
    return settings.positionColor;
  };

  // Build row animation variants
  const getVariants = () => {
    const type = settings.animationType;
    if (type === 'none') return { initial: false, animate: false, exit: false };
    
    let initial: any = { opacity: 0 };
    let animate: any = { opacity: 1, scale: 1, x: 0, y: 0 };
    let exit: any = { opacity: 0 };
    
    switch (type) {
      case 'fade': break;
      case 'slide-left': initial.x = -50; exit.x = 50; break;
      case 'slide-up': initial.y = 50; exit.y = -50; break;
      case 'zoom': initial.scale = 0.5; exit.scale = 0.5; break;
      case 'spring': initial.scale = 0.8; initial.y = 20; break;
    }

    return {
      initial,
      animate,
      exit,
      transition: { 
        duration: settings.animationDuration, 
        type: type === 'spring' ? 'spring' : 'tween',
        bounce: type === 'spring' ? 0.4 : undefined
      }
    };
  };

  const variants = getVariants();

  const hexToRgba = (hex: string, opacity: number) => {
    if (!hex) return 'transparent';
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  return (
    <div className="w-full min-h-screen flex items-start justify-center pt-10">
      <div 
        className="flex flex-col box-border relative overflow-hidden rounded-xl p-8"
        style={{ 
          width: settings.rowWidth,
          backgroundColor: hexToRgba(settings.backgroundColor, settings.backgroundOpacity),
          backgroundImage: settings.backgroundImagePath ? `url(${settings.backgroundImagePath})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          border: parseInt(settings.rowBorderWidth) > 0 ? `${settings.rowBorderWidth} solid ${settings.rowBorderColor}` : 'none',
        }}
      >

        {settings.showTitle && (
          <h2 
            className="mb-6 text-center"
            style={{ 
              ...getTextStyle('title'),
              textShadow: settings.titleShadowColor !== 'transparent' ? `2px 2px 4px ${settings.titleShadowColor}` : 'none'
            }}
          >
            {settings.titleText}
          </h2>
        )}

      <div 
        className="flex flex-col relative w-full" 
        style={{ gap: `${settings.rowGap}px` }}
      >
        <AnimatePresence mode="popLayout">
          {topUsers.map((user, index) => {
            const isTop3 = index < 3 && settings.top3HighlightEnabled;
            
            return (
                <motion.div
                  key={user.id}
                  layout={settings.rankAnimationEnabled}
                  initial={variants.initial}
                  animate={variants.animate}
                  exit={variants.exit}
                  transition={variants.transition as any}
                  className={`flex items-center justify-between relative overflow-hidden`}
                  style={{
                    backgroundColor: 'transparent',
                    padding: '12px 24px',
                    boxShadow: settings.rowShadowEnabled ? `0px 4px 12px rgba(0,0,0,0.3)` : 'none',
                    height: settings.rowHeight !== 'auto' ? settings.rowHeight : undefined,
                    minHeight: settings.rowHeight === 'auto' ? '40px' : undefined
                  }}
                >
                <div className="flex items-center gap-4 w-full z-10 relative">
                  {/* Position */}
                  <div 
                    style={{ 
                      ...getTextStyle('position'),
                      color: getPositionColor(index),
                      width: '40px',
                      textAlign: 'center',
                      textShadow: settings.positionShadowColor !== 'transparent' ? `${settings.positionShadowOpacity} ${settings.positionShadowColor}` : 'none'
                    }}
                  >
                    #{index + 1}
                  </div>

                  {/* Username */}
                  <div 
                    className="flex-1 truncate"
                    style={{ 
                      ...getTextStyle('username'),
                      textShadow: settings.usernameShadowColor !== 'transparent' ? `${settings.usernameShadowOpacity} ${settings.usernameShadowColor}` : 'none'
                    }}
                  >
                    {user.username}
                  </div>

                  {/* Counter */}
                  <motion.div 
                    key={`${user.id}-${user.count}`}
                    initial={settings.counterAnimation === 'pop' ? { scale: 1.5, color: settings.highlightColor } : false}
                    animate={{ scale: 1, color: settings.counterColor }}
                    transition={{ duration: 0.3 }}
                    className="whitespace-nowrap"
                    style={{ 
                      ...getTextStyle('counter'),
                      fontVariantNumeric: 'tabular-nums',
                      textShadow: settings.counterShadowColor !== 'transparent' ? `${settings.counterShadowOpacity} ${settings.counterShadowColor}` : 'none'
                    }}
                  >
                    {user.count.toLocaleString('ru-RU')}
                  </motion.div>
                </div>
                
                {/* Optional highlight flash overlay could go here */}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      </div>
    </div>
  );
}
