import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface StreamSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'paused' | 'completed';
  total_messages: number;
}

export function useSession() {
  const [activeSession, setActiveSession] = useState<StreamSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveSession();

    // Subscribe to session changes
    const channelId = `session_changes_${crypto.randomUUID()}`;
    const sub = supabase.channel(channelId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sessions'
      }, () => {
        fetchActiveSession();
      })
      .subscribe();

    return () => {
      sub.unsubscribe();
    };
  }, []);

  const fetchActiveSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      setActiveSession(data || null);
    } catch (err) {
      console.error('Error fetching session', err);
    } finally {
      setLoading(false);
    }
  };

  const startNewSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Complete any existing active sessions
      await supabase
        .from('sessions')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('status', 'active');

      // Create new
      const { data } = await supabase
        .from('sessions')
        .insert({ user_id: user.id, status: 'active' })
        .select()
        .single();

      setActiveSession(data);
    } catch (err) {
      console.error('Failed to start session', err);
      alert('Ошибка при создании сессии');
    }
  };

  const endSession = async () => {
    if (!activeSession) return;
    try {
      await supabase
        .from('sessions')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', activeSession.id);
      
      setActiveSession(null);
    } catch (err) {
      console.error('Failed to end session', err);
    }
  };

  const resetSession = async () => {
    if (!activeSession) return;
    if (!confirm('Вы уверены, что хотите сбросить статистику текущей сессии?')) return;
    try {
      await supabase.from('message_stats').delete().eq('session_id', activeSession.id);
      await supabase.from('sessions').update({ total_messages: 0 }).eq('id', activeSession.id);
      fetchActiveSession();
    } catch (err) {
      console.error('Failed to reset session', err);
    }
  };

  return { activeSession, loading, startNewSession, endSession, resetSession };
}
