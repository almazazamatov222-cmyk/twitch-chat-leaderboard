'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { ChatClient } from '@twurple/chat';
import { motion, AnimatePresence } from 'framer-motion';
import { OverlaySettings } from '@/store/useSettingsStore';

interface UserMessageCount {
  id: string; // Twitch User ID
  username: string;
  count: number;
}

export default function OverlayPage({ params }: { params: { token: string } }) {
  const [settings, setSettings] = useState<OverlaySettings | null>(null);
  const [twitchUsername, setTwitchUsername] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const [users, setUsers] = useState<Record<string, UserMessageCount>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  
  const usersRef = useRef(users);
  usersRef.current = users;

  // 1. Fetch settings and active session
  useEffect(() => {
    const init = async () => {
      // Fetch settings by token
      const { data: settingData } = await supabase
        .from('settings')
        .select('*')
        .eq('overlay_token', params.token)
        .single();
        
      if (!settingData) return;
      
      setTwitchUsername(settingData.twitch_username);
      setSettings({
        titleText: settingData.title_text,
        showTitle: settingData.show_title,
        topCount: settingData.top_count,
        backgroundColor: settingData.background_color,
        textColor: settingData.text_color,
        fontFamily: settingData.font_family,
        rowBackground: settingData.row_background || 'rgba(0,0,0,0.5)',
        rowRadius: settingData.row_radius || 8,
        rowGap: settingData.row_gap || 8,
        highlightNew: settingData.highlight_new ?? true,
      });

      // Subscribe to settings changes (Realtime)
      const settingsSub = supabase.channel('settings_changes')
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'settings',
          filter: `overlay_token=eq.${params.token}`
        }, (payload) => {
          const newData = payload.new;
          setSettings(prev => prev ? {
            ...prev,
            titleText: newData.title_text,
            showTitle: newData.show_title,
            topCount: newData.top_count,
            backgroundColor: newData.background_color,
            textColor: newData.text_color,
            fontFamily: newData.font_family,
            rowBackground: newData.row_background,
            rowRadius: newData.row_radius,
            rowGap: newData.row_gap,
            highlightNew: newData.highlight_new,
          } : null);
        })
        .subscribe();

      // For simplicity, we just use local state for counting in this prototype.
      // A robust solution would fetch the current active session and initial counts from Supabase.
      
      return () => {
        settingsSub.unsubscribe();
      };
    };
    
    init();
  }, [params.token]);

  // 2. Connect to Twitch Chat
  useEffect(() => {
    if (!twitchUsername) return;

    const chatClient = new ChatClient({ channels: [twitchUsername] });

    chatClient.connect();

    chatClient.onMessage((channel, user, text, msg) => {
      const userId = msg.userInfo.userId;
      const displayName = msg.userInfo.displayName;

      // Filter bot commands
      if (text.startsWith('!')) return;

      setUsers(prev => {
        const currentCount = prev[userId]?.count || 0;
        return {
          ...prev,
          [userId]: {
            id: userId,
            username: displayName,
            count: currentCount + 1
          }
        };
      });

      if (settings?.highlightNew) {
        setHighlightedId(userId);
        setTimeout(() => {
          setHighlightedId(prev => prev === userId ? null : prev);
        }, 1000);
      }
    });

    return () => {
      chatClient.quit();
    };
  }, [twitchUsername, settings?.highlightNew]);

  if (!settings) return null;

  const sortedUsers = Object.values(users)
    .sort((a, b) => b.count - a.count)
    .slice(0, settings.topCount);

  return (
    <div 
      className="w-screen h-screen overflow-hidden p-6 flex flex-col"
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

      <div className="flex-1" style={{ gap: `${settings.rowGap}px`, display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence>
          {sortedUsers.map((user, index) => {
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
                exit={{ opacity: 0, scale: 0.9 }}
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
                  <span className="font-medium truncate max-w-[200px]">
                    {user.username}
                  </span>
                </div>
                
                <div className="font-bold text-xl z-10 tabular-nums">
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
