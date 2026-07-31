import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

export interface StreamSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'paused' | 'completed';
  total_messages: number;
  stream_title: string | null;
  category_name: string | null;
  session_type: 'live' | 'offline' | 'manual';
  twitch_stream_id: string | null;
}

export function useSession() {
  const [activeSession, setActiveSession] = useState<StreamSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;

    const fetchActiveSession = async () => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) setActiveSession(null);
          return;
        }

        const { data, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .eq('session_type', 'live')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!cancelled) setActiveSession((data as StreamSession | null) ?? null);
      } catch (error) {
        console.error('Failed to fetch active stream session:', error);
      } finally {
        requestInFlight = false;
        if (!cancelled) setLoading(false);
      }
    };

    void fetchActiveSession();
    const interval = setInterval(fetchActiveSession, 3_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { activeSession, loading };
}