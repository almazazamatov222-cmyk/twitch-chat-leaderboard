import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { ChatClient } from '@twurple/chat';
import { useSettingsStore } from '@/store/useSettingsStore';

interface MessageBatch {
  [userId: string]: {
    username: string;
    count: number;
  };
}

export function useTwitchChat(
  twitchUsername: string,
  sessionId: string | null,
  overlayToken?: string
) {
  const { settings, previewMode } = useSettingsStore();
  const [isMaster, setIsMaster] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const batchRef = useRef<MessageBatch>({});
  const isMasterRef = useRef(false);
  const chatClientRef = useRef<ChatClient | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Leader Election via Supabase Presence
  useEffect(() => {
    if (!sessionId || previewMode !== 'real') return;

    const channelId = `chat_sync_${sessionId}`;
    const channel = supabase.channel(channelId);

    const presenceId = crypto.randomUUID();

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ joinedAt: number }>();
        
        // Find the oldest presence
        let oldestId: string | null = null;
        let oldestTime = Infinity;

        for (const [key, presences] of Object.entries(state)) {
          if (presences.length > 0) {
            const time = presences[0].joinedAt;
            if (time < oldestTime) {
              oldestTime = time;
              oldestId = key;
            }
          }
        }

        const iAmMaster = oldestId === presenceId;
        setIsMaster(iAmMaster);
        isMasterRef.current = iAmMaster;
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ joinedAt: Date.now() });
        }
      });

    return () => {
      channel.unsubscribe();
      isMasterRef.current = false;
      setIsMaster(false);
    };
  }, [sessionId, previewMode]);

  // 2. Connect to Twitch Chat IF master
  useEffect(() => {
    if (!twitchUsername || !isMaster || previewMode !== 'real') {
      if (chatClientRef.current) {
        chatClientRef.current.quit();
        chatClientRef.current = null;
      }
      return;
    }

    const client = new ChatClient({ channels: [twitchUsername] });
    chatClientRef.current = client;

    client.connect();

    client.onMessage(async (channel, user, text, msg) => {
      // Filtering logic
      if (settings.ignoreCommands && text.startsWith('!')) return;
      if (settings.ignoreStreamer && msg.userInfo.displayName.toLowerCase() === twitchUsername.toLowerCase()) return;
      if (settings.ignoreMods && msg.userInfo.isMod) return;
      if (settings.ignoreVips && msg.userInfo.isVip) return;
      if (text.length < settings.minMessageLength) return;
      if (settings.excludedUsers.includes(msg.userInfo.displayName.toLowerCase())) return;
      if (settings.botUsers.includes(msg.userInfo.displayName.toLowerCase())) return;

      const userId = msg.userInfo.userId;
      const displayName = msg.userInfo.displayName;

      // Add to batch
      if (!batchRef.current[userId]) {
        batchRef.current[userId] = { username: displayName, count: 0 };
      }
      batchRef.current[userId].count += 1;

      // Trigger highlight locally for the master (other clients will get it via DB update if they listen, or we can broadcast via Realtime)
      // Actually, to make highlights instantaneous across all clients, master should broadcast it via the same channel
      if (settings.highlightNew) {
        supabase.channel(`chat_sync_${sessionId}`).send({
          type: 'broadcast',
          event: 'highlight',
          payload: { userId }
        });
      }
    });

    return () => {
      client.quit();
      chatClientRef.current = null;
    };
  }, [twitchUsername, isMaster, previewMode, settings, sessionId]);

  // 3. Batch insert to Supabase every 2 seconds
  useEffect(() => {
    if (!isMaster || previewMode !== 'real' || !sessionId) return;

    const interval = setInterval(async () => {
      const batch = batchRef.current;
      if (Object.keys(batch).length === 0) return;

      // Reset batch
      batchRef.current = {};

      for (const [userId, data] of Object.entries(batch)) {
        try {
          await supabase.rpc('increment_message_stat', {
            p_session_id: sessionId,
            p_twitch_user_id: userId,
            p_twitch_username: data.username,
            p_increment: data.count,
            p_overlay_token: overlayToken || null
          });
        } catch (err) {
          console.error('Failed to increment stat', err);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isMaster, previewMode, sessionId, overlayToken]);

  // 4. Listen for highlight broadcasts from master
  useEffect(() => {
    if (!sessionId || previewMode !== 'real') return;

    const channel = supabase.channel(`chat_sync_${sessionId}`);
    channel.on('broadcast', { event: 'highlight' }, (payload) => {
      if (settings.highlightNew) {
        const userId = payload.payload.userId;
        setHighlightedId(userId);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), settings.highlightDuration * 1000);
      }
    });

    // We don't subscribe here because the presence effect already subscribes to this channel.
    // Wait, multiple `supabase.channel(id)` calls return the SAME channel instance if it exists!
    // So calling .on here just adds a listener.

    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [sessionId, previewMode, settings.highlightNew, settings.highlightDuration]);

  return { isMaster, highlightedId };
}
