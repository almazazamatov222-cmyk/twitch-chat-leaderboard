'use client';

import { useSettingsStore } from '@/store/useSettingsStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useMessageStats } from '@/hooks/useMessageStats';
import { useEffect, useState } from 'react';

interface LivePreviewProps {
  sessionId?: string | null;
  onRealtimeStatusChange?: (status: string) => void;
}

export default function LivePreview({ sessionId, onRealtimeStatusChange }: LivePreviewProps) {
  const settings = useSettingsStore(state => state.settings);
  const previewMode = useSettingsStore(state => state.previewMode);
  
  // Real data
  const { sortedUsers: realUsers, realtimeStatus } = useMessageStats(sessionId || null);

  useEffect(() => {
    if (onRealtimeStatusChange) {
      onRealtimeStatusChange(realtimeStatus);
    }
  }, [realtimeStatus, onRealtimeStatusChange]);

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

  const displayUsers = previewMode === 'demo' ? demoUsers : realUsers;
  const topUsers = displayUsers.slice(0, settings.topCount);

  const hexToRgba = (hex: string, opacity: number) => {
    if (!hex || hex === 'transparent') return 'transparent';
    if (hex.startsWith('#')) {
      const h = hex.slice(1);
      let r = 0, g = 0, b = 0, a = opacity;
      if (h.length === 3) {
        r = parseInt(h[0] + h[0], 16);
        g = parseInt(h[1] + h[1], 16);
        b = parseInt(h[2] + h[2], 16);
      } else if (h.length === 6) {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
      } else if (h.length === 8) {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
        a = (parseInt(h.slice(6, 8), 16) / 255) * opacity;
      }
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return hex;
  };

  const getTextStyle = (prefix: 'title' | 'position' | 'username' | 'counter') => {
    const s = settings as any;
    let shadowString = 'none';
    const shadowColor = s[`${prefix}ShadowColor`];
    if (shadowColor && shadowColor !== 'transparent') {
      shadowString = `2px 2px 4px ${hexToRgba(shadowColor, s[`${prefix}ShadowOpacity`] ?? 1)}`;
    }
    return {
      fontFamily: s[`${prefix}Font`],
      fontSize: s[`${prefix}Size`],
      fontWeight: s[`${prefix}Weight`] === 'bold' ? 700 : (s[`${prefix}Weight`] === 'normal' ? 400 : Number(s[`${prefix}Weight`])),
      color: s[`${prefix}Color`],
      letterSpacing: s[`${prefix}LetterSpacing`],
      opacity: s[`${prefix}Opacity`],
      WebkitTextStroke: `${s[`${prefix}StrokeWidth`]} ${s[`${prefix}StrokeColor`]}`,
      textShadow: shadowString,
    };
  };

  const getPositionColor = (index: number) => {
    if (!settings.top3HighlightEnabled) return settings.positionColor;
    if (index === 0) return settings.top1Color;
    if (index === 1) return settings.top2Color;
    if (index === 2) return settings.top3Color;
    return settings.positionColor;
  };

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
      case 'pulse': initial.scale = 0.95; break;
      case 'smooth': initial.y = 10; break;
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

  return (
    <div className="w-full min-h-screen flex items-start justify-center pt-10 relative">
      <div 
        className="flex flex-col box-border relative overflow-hidden"
        style={{ 
          width: settings.rowWidth,
          backgroundColor: settings.backgroundMode === 'transparent' ? 'transparent' : hexToRgba(settings.backgroundColor, settings.backgroundOpacity),
          border: parseInt(settings.rowBorderWidth) > 0 ? `${settings.rowBorderWidth} solid ${settings.rowBorderColor}` : 'none',
          borderRadius: settings.overlayRadius || '0px',
          padding: '32px' // Base padding for the container
        }}
      >
        {settings.backgroundMode === 'image' && settings.backgroundImagePath && (
          <div className="absolute inset-0 z-0">
            <img 
              src={settings.backgroundImagePath} 
              alt="bg"
              style={{
                width: '100%',
                height: '100%',
                objectFit: settings.backgroundImageFit || 'cover',
                objectPosition: settings.backgroundImagePosition || 'center',
                opacity: settings.backgroundImageOpacity,
                filter: settings.backgroundBlur !== '0px' ? `blur(${settings.backgroundBlur})` : 'none'
              }}
            />
            {settings.backgroundOverlayOpacity > 0 && (
              <div 
                className="absolute inset-0" 
                style={{ backgroundColor: `rgba(0,0,0,${settings.backgroundOverlayOpacity})` }}
              />
            )}
          </div>
        )}

        <div className="relative z-10 w-full">
          {settings.showTitle && (
            <h2 
              className="mb-6 text-center"
              style={getTextStyle('title')}
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
                        backgroundColor: hexToRgba(settings.rowColor, settings.rowOpacity),
                        padding: settings.rowPadding || '12px 16px',
                        borderRadius: settings.rowRadius || '8px',
                        boxShadow: settings.rowShadowEnabled ? `0px 4px 12px rgba(0,0,0,0.3)` : 'none',
                        height: settings.rowHeight !== 'auto' ? settings.rowHeight : undefined,
                        minHeight: settings.rowHeight === 'auto' ? '40px' : undefined
                      }}
                    >
                    <div className="flex items-center gap-4 w-full z-10 relative">
                      {/* Position */}
                      {settings.elementShowRank && (
                        <div 
                          style={{ 
                            ...getTextStyle('position'),
                            color: getPositionColor(index),
                            width: '40px',
                            textAlign: 'center',
                          }}
                        >
                          #{index + 1}
                        </div>
                      )}

                      {/* Username */}
                      {settings.elementShowName && (
                        <div 
                          className="flex-1 truncate"
                          style={getTextStyle('username')}
                        >
                          {user.username}
                        </div>
                      )}

                      {/* Counter */}
                      {settings.elementShowCount && (
                        <motion.div 
                          key={`${user.id}-${user.count}`}
                          initial={settings.counterAnimation === 'pop' ? { scale: 1.5, color: settings.highlightColor } : false}
                          animate={{ scale: 1, color: settings.counterColor }}
                          transition={{ duration: 0.3 }}
                          className="whitespace-nowrap"
                          style={{ 
                            ...getTextStyle('counter'),
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {user.count.toLocaleString('ru-RU')}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
