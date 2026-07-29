import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSettingsStore } from '@/store/useSettingsStore';
import { staticDemoUsers } from '@/lib/demoData';

export interface UserMessageCount {
  id: string; // Twitch User ID
  username: string;
  count: number;
}

export function useMessageStats(sessionId: string | null) {
  const { settings, previewMode } = useSettingsStore();
  const [users, setUsers] = useState<Record<string, UserMessageCount>>({});

  useEffect(() => {
    if (previewMode === 'demo') {
      const demoMap: Record<string, UserMessageCount> = {};
      staticDemoUsers.forEach(u => {
        demoMap[u.id] = { id: u.id, username: u.username, count: u.count };
      });
      setUsers(demoMap);
      return;
    }



    if (!sessionId) {
      setUsers({});
      return;
    }

    // 1. Fetch initial data
    const fetchInitial = async () => {
      const { data } = await supabase
        .from('message_stats')
        .select('twitch_user_id, twitch_username, messages_count')
        .eq('session_id', sessionId)
        .order('messages_count', { ascending: false })
        .limit(100);

      if (data) {
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

    fetchInitial();

    // 2. Subscribe to realtime updates
    const subscription = supabase
      .channel(`stats_${sessionId}_${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*', // INSERT or UPDATE
        schema: 'public',
        table: 'message_stats',
        filter: `session_id=eq.${sessionId}`
      }, (payload) => {
        const newRow = payload.new as any;
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
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId, previewMode]);



  const sortedUsers = Object.values(users)
    .sort((a, b) => b.count - a.count)
    .slice(0, settings.topCount);

  return { sortedUsers };
}
