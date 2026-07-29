'use client';

import { useSettingsStore } from '@/store/useSettingsStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useMessageStats } from '@/hooks/useMessageStats';
import { useEffect, useState } from 'react';

interface LivePreviewProps {
  sessionId: string | null;
}

export default function LivePreview({ sessionId }: LivePreviewProps) {
  const settings = useSettingsStore(state => state.settings);
  const { sortedUsers } = useMessageStats(sessionId);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // In a real implementation, highlightedId comes from useTwitchChat broadcast.
  // For the preview, useMessageStats also doesn't trigger individual highlights unless we wire it.
  // We'll just rely on framer-motion layout animations for changes.

  const parseTemplate = (template: string, position: number, username: string, messages: number) => {
    let result = template;
    result = result.replace('{position}', `<span class="pos-${position}">#${position}</span>`);
    result = result.replace('{username}', `<span class="username">${username}</span>`);
    result = result.replace('{messages}', `<span class="messages">${settings.counterFormat.replace('{messages}', messages.toString())}</span>`);
    // Avatar is ignored for now or rendered as a placeholder
    result = result.replace('{avatar}', '');
    return result;
  };

  const getPositionColor = (index: number) => {
    if (index === 0) return settings.top1Color;
    if (index === 1) return settings.top2Color;
    if (index === 2) return settings.top3Color;
    return settings.positionColor;
  };

  return (
    <div 
      className="w-full h-full flex flex-col box-border"
      style={{ 
        fontFamily: settings.fontFamily,
        color: settings.textColor,
        padding: settings.paddings,
      }}
    >
      {settings.showTitle && (
        <h2 
          className="mb-6"
          style={{ 
            fontFamily: settings.titleFont,
            fontSize: settings.titleSize,
            fontWeight: settings.titleWeight === 'bold' ? 700 : 400,
            fontStyle: settings.titleItalic ? 'italic' : 'normal',
            color: settings.titleColor,
            textAlign: settings.titleAlign as any,
            marginTop: settings.titleMarginTop,
            marginBottom: settings.titleMarginBottom,
          }}
        >
          {settings.titleText}
        </h2>
      )}

      <div 
        className="flex-1 overflow-hidden" 
        style={{ 
          display: 'flex', 
          flexDirection: settings.layoutDirection === 'vertical' ? 'column' : 'row', 
          gap: `${settings.rowGap}px` 
        }}
      >
        <AnimatePresence mode="popLayout">
          {sortedUsers.map((user, index) => {
            const isTop3 = index < 3;
            
            // Generate animation based on settings.animationType
            const animationProps = {
              initial: { opacity: 0, y: settings.animationType === 'slide' ? 20 : 0, scale: settings.animationType === 'scale' ? 0.9 : 1 },
              animate: { opacity: 1, y: 0, scale: 1 },
              exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
              transition: { duration: settings.animationDuration, type: 'spring' as const, bounce: 0.3 }
            };

            return (
              <motion.div
                key={user.id}
                layout
                {...animationProps}
                className={`flex items-center justify-between relative overflow-hidden`}
                style={{
                  backgroundColor: settings.rowBackground,
                  borderRadius: settings.rowRadius,
                  padding: settings.rowPadding,
                  border: isTop3 ? `1px solid rgba(145, 70, 255, ${0.8 - index * 0.2})` : '1px solid transparent',
                  boxShadow: settings.rowShadow,
                  minHeight: settings.rowMinHeight !== 'auto' ? settings.rowMinHeight : undefined,
                }}
              >
                <div className="flex items-center gap-3 w-full">
                  {/* Position */}
                  {settings.showPosition && (
                    <div 
                      style={{ 
                        fontFamily: settings.positionFont, 
                        color: getPositionColor(index),
                        fontSize: settings.positionSize,
                        width: settings.positionWidth,
                        textAlign: 'center',
                        fontWeight: 'bold'
                      }}
                    >
                      {settings.positionFormat.replace('{position}', (index + 1).toString())}
                    </div>
                  )}

                  {/* Username */}
                  {settings.showUsername && (
                    <div 
                      className="flex-1 truncate"
                      style={{ 
                        fontFamily: settings.usernameFont, 
                        color: settings.usernameColor,
                        fontSize: settings.usernameSize,
                      }}
                    >
                      {user.username}
                    </div>
                  )}

                  {/* Counter */}
                  {settings.showCounter && (
                    <div 
                      className="whitespace-nowrap"
                      style={{ 
                        fontFamily: settings.counterFont, 
                        color: settings.counterColor,
                        fontSize: settings.counterSize,
                        fontWeight: 'bold',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {settings.counterFormat.replace('{messages}', user.count.toLocaleString('ru-RU'))}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
