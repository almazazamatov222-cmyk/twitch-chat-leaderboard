import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSettingsStore } from '@/store/useSettingsStore';

export interface UserMessageCount {
  id: string; // Twitch User ID
  username: string;
  count: number;
}

export function useMessageStats(sessionId: string | null) {
  const { settings } = useSettingsStore();
  const [users, setUsers] = useState<Record<string, UserMessageCount>>({});
  const [realtimeStatus, setRealtimeStatus] = useState<string>('INIT');
  
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsers({});
  }, [sessionId]);

  const isPolling = useRef(false);

  useEffect(() => {
    let subscription: ReturnType<typeof supabase.channel> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    if (!sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRealtimeStatus('NO_SESSION');
      return;
    }

    const fetchInitial = async () => {
      if (cancelled) return;
      const { data, error } = await supabase
        .from('message_stats')
        .select('twitch_user_id, twitch_username, messages_count')
        .eq('session_id', sessionId)
        .order('messages_count', { ascending: false })
        .limit(100);

      if (!error && data && !cancelled) {
        const map: Record<string, UserMessageCount> = {};
        data.forEach(row => {
          map[row.twitch_user_id] = {
            id: row.twitch_user_id,
            username: row.twitch_username,
            count: row.messages_count
          };
        });
        setUsers(map);
      }
    };

    const startPolling = () => {
      if (isPolling.current) return;
      isPolling.current = true;
      // We keep a 5-second resilient fallback polling
      pollInterval = setInterval(fetchInitial, 5000);
    };

    const stopPolling = () => {
      isPolling.current = false;
      if (pollInterval) clearInterval(pollInterval);
    };

    fetchInitial();
    startPolling(); // Always run fallback polling

    subscription = supabase
      .channel(`stats_${sessionId}_${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*', 
        schema: 'public',
        table: 'message_stats',
        filter: `session_id=eq.${sessionId}`
      }, (payload) => {
        const newRow = payload.new as { twitch_user_id: string, twitch_username: string, messages_count: number };
        if (!newRow.twitch_user_id) return;
        
        setUsers(prev => ({
          ...prev,
          [newRow.twitch_user_id]: {
            id: newRow.twitch_user_id,
            username: newRow.twitch_username,
            count: newRow.messages_count
          }
        }));
      })
      .subscribe((status, err) => {
        if (cancelled) return;
        setRealtimeStatus(status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (err) console.error('Realtime error in message_stats:', err);
        }
      });

    return () => {
      cancelled = true;
      stopPolling();
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [sessionId]);

  const sortedUsers = Object.values(users)
    .sort((a, b) => b.count - a.count)
    .slice(0, settings.topCount);

  return { sortedUsers, realtimeStatus };
}
