import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface DiagnosticData {
  twitch_id: string;
  subscription_status: string | null;
  subscription_id: string | null;
  last_webhook_received_at: string | null;
  last_message_id: string | null;
  last_chatter_username: string | null;
  last_db_increment_at: string | null;
  last_webhook_error: string | null;
}

export function useDiagnostics(twitchId: string | null) {
  const [data, setData] = useState<DiagnosticData | null>(null);

  useEffect(() => {
    if (!twitchId) return;

    let mounted = true;

    const fetchInitial = async () => {
      const { data: res } = await supabase
        .from('webhook_diagnostics')
        .select('*')
        .eq('twitch_id', twitchId)
        .single();
      if (mounted && res) setData(res);
    };

    fetchInitial();

    const sub = supabase
      .channel(`diag_${twitchId}`)
      .on('postgres_changes', {
        event: '*', 
        schema: 'public',
        table: 'webhook_diagnostics',
        filter: `twitch_id=eq.${twitchId}`
      }, (payload) => {
        setData(payload.new as DiagnosticData);
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(sub);
    };
  }, [twitchId]);

  return data;
}
