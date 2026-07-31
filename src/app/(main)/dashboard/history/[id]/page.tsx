'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';

interface Session {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  total_messages: number;
  stream_title: string | null;
  category_name: string | null;
}

interface MessageStat {
  id: string;
  twitch_user_id: string;
  twitch_username: string;
  messages_count: number;
  last_message_at: string;
}

export default function SessionDetailsPage() {
  const params = useParams<{ id: string }>();
  const [stats, setStats] = useState<MessageStat[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', params.id)
        .eq('user_id', user.id)
        .single();
      
      if (sessionData) {
        setSession(sessionData);

        const { data: statsData } = await supabase
          .from('message_stats')
          .select('*')
          .eq('session_id', params.id)
          .order('messages_count', { ascending: false });

        if (statsData) setStats(statsData);
      }
      
      setLoading(false);
    };

    fetchDetails();
  }, [params.id]);

  const exportCSV = () => {
    if (!stats.length || !session) return;
    
    const headers = ['Twitch User ID', 'Username', 'Messages Count', 'Last Message At'];
    const rows = stats.map(s => [
      s.twitch_user_id,
      s.twitch_username,
      s.messages_count,
      new Date(s.last_message_at).toISOString()
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stream_stats_${new Date(session.started_at).toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportJSON = () => {
    if (!stats.length || !session) return;
    
    const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stream_stats_${new Date(session.started_at).toISOString().split('T')[0]}.json`;
    link.click();
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-950 text-white p-8 flex items-center justify-center">Загрузка...</div>;
  }

  if (!session) {
    return <div className="min-h-screen bg-gray-950 text-white p-8 text-center text-red-500">Сессия не найдена</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/history" className="p-2 hover:bg-gray-800 rounded-full transition-colors">
              <ArrowLeft size={24} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Статистика стрима</h1>
              <p className="text-gray-400 text-sm">
                {new Date(session.started_at).toLocaleString('ru-RU')}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              <Download size={16} /> CSV
            </button>
            <button 
              onClick={exportJSON}
              className="flex items-center gap-2 px-4 py-2 bg-[#9146FF] hover:bg-[#7b3be6] rounded-lg text-sm transition-colors"
            >
              <Download size={16} /> JSON
            </button>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">#</th>
                <th className="px-6 py-4 font-medium">Пользователь</th>
                <th className="px-6 py-4 font-medium text-right">Сообщений</th>
                <th className="px-6 py-4 font-medium text-right">Последнее сообщение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {stats.map((stat, index) => (
                <tr key={stat.id} className="hover:bg-gray-800/20 transition-colors">
                  <td className="px-6 py-4 text-gray-500 font-mono">{index + 1}</td>
                  <td className="px-6 py-4 font-medium">{stat.twitch_username}</td>
                  <td className="px-6 py-4 text-right font-bold text-[#9146FF]">{stat.messages_count.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-gray-500">
                    {new Date(stat.last_message_at).toLocaleTimeString('ru-RU')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.length === 0 && (
            <div className="p-12 text-center text-gray-500">
              В этой сессии сообщений не было.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
