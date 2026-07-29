'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { ArrowLeft, Clock, MessageSquare, Users } from 'lucide-react';

interface Session {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  total_messages: number;
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false });

      if (data) setSessions(data);
      setLoading(false);
    };

    fetchHistory();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link href="/fleeale" className="p-2 hover:bg-gray-800 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-3xl font-bold">История стримов</h1>
        </div>

        {loading ? (
          <div>Загрузка истории...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-20 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
            У вас пока нет сохраненных стримов.
          </div>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <div key={session.id} className="bg-gray-900 border border-gray-800 p-6 rounded-xl flex items-center justify-between hover:border-[#9146FF]/50 transition-colors">
                <div className="space-y-1">
                  <div className="font-semibold text-lg">
                    {new Date(session.started_at).toLocaleDateString('ru-RU', { 
                      day: 'numeric', month: 'long', year: 'numeric' 
                    })}
                  </div>
                  <div className="text-sm text-gray-400 flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {new Date(session.started_at).toLocaleTimeString('ru-RU')}
                    </span>
                    {session.status === 'active' && (
                      <span className="text-green-400 text-xs font-bold uppercase tracking-wider bg-green-400/10 px-2 py-0.5 rounded">
                        В эфире
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#9146FF]">{session.total_messages.toLocaleString()}</div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">Сообщений</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
