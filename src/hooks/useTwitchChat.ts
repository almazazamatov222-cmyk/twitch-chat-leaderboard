import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { ChatClient } from '@twurple/chat';
import { useSettingsStore } from '@/store/useSettingsStore';

interface MessageBatch {
  [userId: string]: { username: string; count: number };
}

export function useTwitchChat(twitchUsername: string, sessionId: string | null, overlayToken?: string) {
  const [isMaster, setIsMaster] = useState(false);
  const chatClientRef = useRef<ChatClient | null>(null);
  const channelRef = useRef<any>(null);
  
  const settings = useSettingsStore(state => state.settings);
  const settingsRef = useRef(settings);
  
  const batchRef = useRef<MessageBatch>({});
  
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Handle Master Election using Supabase Presence
  useEffect(() => {
    if (!twitchUsername || !sessionId) return;

    const channelName = `chat_sync_${twitchUsername}`;
    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    // Generate a unique ID for this browser tab
    const tabId = crypto.randomUUID();
    const joinedAt = Date.now();

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        
        // Find the oldest tab
        let oldestTab: any = null;
        for (const [key, presences] of Object.entries(state)) {
          const presence = (presences as any)[0];
          if (!oldestTab || presence.joinedAt < oldestTab.joinedAt) {
            oldestTab = presence;
          }
        }

        // If I am the oldest tab, I am the Master
        const masterStatus = oldestTab && oldestTab.tabId === tabId;
        setIsMaster(masterStatus);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ tabId, joinedAt });
        }
      });

    return () => {
      channel.unsubscribe();
      setIsMaster(false);
    };
  }, [twitchUsername, sessionId]);

  // Master connects to Chat and handles messages
  useEffect(() => {
    if (!isMaster || !twitchUsername || !sessionId) {
      // If we are not master, disconnect if connected
      if (chatClientRef.current) {
        chatClientRef.current.quit();
        chatClientRef.current = null;
      }
      return;
    }

    let isMounted = true;
    let flushInterval: any;

    const connectChat = async () => {
      const client = new ChatClient();
      chatClientRef.current = client;

      client.onMessage((channel, user, text, msg) => {
        if (!isMounted) return;
        
        const s = settingsRef.current;
        const channelName = channel.replace('#', '').toLowerCase();

        // Filters
        if (s.ignoreCommands && text.startsWith('!')) return;
        if (s.ignoreStreamer && msg.userInfo.displayName.toLowerCase() === channelName) return;
        if (text.length < (s.minMessageLength || 1)) return;
        
        const userId = msg.userInfo.userId;
        const displayName = msg.userInfo.displayName;

        // Batch update
        if (!batchRef.current[userId]) {
          batchRef.current[userId] = { username: displayName, count: 0 };
        }
        batchRef.current[userId].count += 1;
      });

      await client.connect();
      await client.join(twitchUsername);
    };

    const flushBatches = async () => {
      const currentBatch = { ...batchRef.current };
      batchRef.current = {}; // Reset immediately

      for (const [userId, data] of Object.entries(currentBatch)) {
        if (data.count > 0) {
          try {
            await supabase.rpc('increment_message_stat', {
              p_session_id: sessionId,
              p_twitch_user_id: userId,
              p_twitch_username: data.username,
              p_increment: data.count,
              p_overlay_token: overlayToken || null
            });
            
            // Highlight broadcast if enabled
            if (settingsRef.current.highlightNew) {
               supabase.channel(`chat_sync_${twitchUsername}`).send({
                 type: 'broadcast',
                 event: 'highlight',
                 payload: { userId }
               });
            }
          } catch (err) {
            console.error('Failed to flush message count', err);
          }
        }
      }
    };

    connectChat();
    flushInterval = setInterval(flushBatches, 2000);

    return () => {
      isMounted = false;
      clearInterval(flushInterval);
      if (chatClientRef.current) {
        chatClientRef.current.quit();
        chatClientRef.current = null;
      }
    };
  }, [isMaster, twitchUsername, sessionId, overlayToken]);

  return { isMaster };
}
