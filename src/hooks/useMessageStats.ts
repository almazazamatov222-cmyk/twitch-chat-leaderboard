import { useEffect, useState } from 'react';

import { OBS_STATS_SYNC } from '@/lib/realtimeSync';
import { supabase } from '@/lib/supabase/client';

export interface UserMessageCount {
  id: string;
  username: string;
  count: number;
}

interface MessageStatRow {
  twitch_user_id: string;
  twitch_username: string;
  messages_count: number;
}

interface UsersState {
  sessionId: string | null;
  users: Record<string, UserMessageCount>;
}

function hasSameUsers(
  current: Record<string, UserMessageCount>,
  next: Record<string, UserMessageCount>,
): boolean {
  const currentIds = Object.keys(current);
  const nextIds = Object.keys(next);
  if (currentIds.length !== nextIds.length) return false;
  return nextIds.every((id) =>
    current[id]?.username === next[id]?.username &&
    current[id]?.count === next[id]?.count,
  );
}

export function useMessageStats(
  sessionId: string | null,
  overlayToken?: string | null,
) {
  const [usersState, setUsersState] = useState<UsersState>({
    sessionId: null,
    users: {},
  });
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let requestInFlight = false;

    const fetchStats = async () => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;

      try {
        const result = overlayToken
          ? await supabase.rpc('get_overlay_message_stats', {
              p_overlay_token: overlayToken,
            })
          : await supabase
              .from('message_stats')
              .select('twitch_user_id, twitch_username, messages_count')
              .eq('session_id', sessionId)
              .order('messages_count', { ascending: false })
              .limit(100);

        if (cancelled) return;
        if (result.error) {
          console.error('Failed to fetch message stats', {
            sessionId,
            hasOverlayToken: Boolean(overlayToken),
            error: result.error,
          });
          setStatsError(result.error.message || 'Unknown error');
          return;
        }

        const users: Record<string, UserMessageCount> = {};
        for (const row of (result.data ?? []) as MessageStatRow[]) {
          users[row.twitch_user_id] = {
            id: row.twitch_user_id,
            username: row.twitch_username,
            count: row.messages_count,
          };
        }

        setUsersState((current) =>
          current.sessionId === sessionId && hasSameUsers(current.users, users)
            ? current
            : { sessionId, users },
        );
        setStatsError(null);
      } finally {
        requestInFlight = false;
      }
    };


    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const initialize = async () => {
      await fetchStats();
      if (cancelled) return;
      pollInterval = setInterval(fetchStats, OBS_STATS_SYNC.pollIntervalMs);
    };

    void initialize();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [overlayToken, sessionId]);

  const users = usersState.sessionId === sessionId ? usersState.users : {};

  return {
    users,
    sortedUsers: Object.values(users).sort((first, second) => second.count - first.count),
    realtimeStatus: sessionId ? 'POLLING' : 'NO_SESSION',
    statsError,
  };
}
