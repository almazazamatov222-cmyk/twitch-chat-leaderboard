import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface UserMessageCount {
  id: string; // Twitch User ID
  username: string;
  count: number;
}

export function useMessageStats(sessionId: string | null, overlayToken?: string | null) {
  const [users, setUsers] = useState<Record<string, UserMessageCount>>({});
  const [realtimeStatus, setRealtimeStatus] = useState<string>('INIT');
  const [statsError, setStatsError] = useState<string | null>(null);
  const [lastStatsFetchAt, setLastStatsFetchAt] = useState<string | null>(null);
  
  useEffect(() => {
    setUsers({});
  }, [sessionId]);

  const isPolling = useRef(false);

  useEffect(() => {
    let subscription: ReturnType<typeof supabase.channel> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    if (!sessionId) {
      setRealtimeStatus('NO_SESSION');
      return;
    }

    const fetchInitial = async () => {
      if (cancelled) return;
      let data, error;
      
      if (overlayToken) {
        const res = await supabase.rpc('get_overlay_message_stats', {
          p_overlay_token: overlayToken
        });
        data = res.data;
        error = res.error;
      } else {
        const res = await supabase
          .from('message_stats')
          .select('twitch_user_id, twitch_username, messages_count')
          .eq('session_id', sessionId)
          .order('messages_count', { ascending: false })
          .limit(100);
        data = res.data;
        error = res.error;
      }

      if (cancelled) return;

      if (error) {
        console.error('Failed to fetch message stats', { sessionId, hasOverlayToken: Boolean(overlayToken), error });
        setStatsError(error.message || 'Unknown error');
        return;
      }

      setStatsError(null);
      setLastStatsFetchAt(new Date().toISOString());

      if (data) {
        const map: Record<string, UserMessageCount> = {};
        data.forEach((row: { twitch_user_id: string; twitch_username: string; messages_count: number }) => {
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
      pollInterval = setInterval(fetchInitial, 3000);
    };

    const stopPolling = () => {
      isPolling.current = false;
      if (pollInterval) clearInterval(pollInterval);
    };

    const init = async () => {
      await fetchInitial();
      if (cancelled) return;

      subscription = supabase
        .channel(`stats_${sessionId}_${crypto.randomUUID()}`)
        .on('postgres_changes', {
          event: '*', 
          schema: 'public',
          table: 'message_stats',
          filter: `session_id=eq.${sessionId}`
        }, (payload) => {
          if (cancelled) return;
          
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { twitch_user_id: string };
            if (oldRow && oldRow.twitch_user_id) {
              setUsers(prev => {
                const next = { ...prev };
                delete next[oldRow.twitch_user_id];
                return next;
              });
            }
          } else {
            const newRow = payload.new as { twitch_user_id: string, twitch_username: string, messages_count: number };
            if (newRow && newRow.twitch_user_id) {
              setUsers(prev => ({
                ...prev,
                [newRow.twitch_user_id]: {
                  id: newRow.twitch_user_id,
                  username: newRow.twitch_username,
                  count: newRow.messages_count
                }
              }));
            }
          }
        })
        .subscribe((status) => {
          if (cancelled) return;
          setRealtimeStatus(status);
          if (status === 'SUBSCRIBED') {
            stopPolling();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            startPolling();
          }
        });
    };

    init();

    return () => {
      cancelled = true;
      stopPolling();
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [sessionId, overlayToken]);

  return {
    users,
    sortedUsers: Object.values(users).sort((a, b) => b.count - a.count),
    realtimeStatus,
    statsError,
    lastStatsFetchAt
  };
}

