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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
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
        let oldestTab: { tabId: string, joinedAt: number } | null = null;
        for (const presences of Object.values(state)) {
          const presence = presences[0] as unknown as { tabId: string, joinedAt: number };
          if (!oldestTab || presence.joinedAt < oldestTab.joinedAt) {
            oldestTab = presence;
          }
        }

        // If I am the oldest tab, I am the Master
        const masterStatus = !!oldestTab && oldestTab.tabId === tabId;
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
      if (Object.keys(currentBatch).length === 0) return;
      
      batchRef.current = {}; // Reset immediately

      const batchArray = Object.entries(currentBatch).map(([userId, data]) => ({
        id: userId,
        username: data.username,
        count: data.count
      })).filter(x => x.count > 0);
      
      if (batchArray.length === 0) return;

      try {
        const { error } = await supabase.rpc('increment_message_stat_batch', {
          p_session_id: sessionId,
          p_batch: batchArray,
          p_overlay_token: overlayToken || null
        });
        
        if (error) throw error;
        
        // Highlight broadcast if enabled
        if (settingsRef.current.highlightNew) {
           for (const item of batchArray) {
             supabase.channel(`chat_sync_${twitchUsername}`).send({
               type: 'broadcast',
               event: 'highlight',
               payload: { userId: item.id }
             });
           }
        }
      } catch (err) {
        console.error('Failed to flush message count. Restoring batch...', err);
        // Restore missed messages back into batchRef to prevent data loss
        for (const item of batchArray) {
          if (!batchRef.current[item.id]) {
            batchRef.current[item.id] = { username: item.username, count: 0 };
          }
          batchRef.current[item.id].count += item.count;
        }
      }
    };

    connectChat();
    const flushInterval = setInterval(flushBatches, 2000);

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
