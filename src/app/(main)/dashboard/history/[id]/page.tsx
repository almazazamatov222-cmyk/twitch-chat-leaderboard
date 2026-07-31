'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Clock3,
  Download,
  Gamepad2,
  MessageSquare,
  Radio,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  formatStreamDuration,
  getStreamTitle,
  type StreamSession,
} from '@/lib/sessionHistory';

const PAGE_SIZE = 1000;
const ACTIVE_SESSION_REFRESH_MS = 30_000;

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
  const [session, setSession] = useState<StreamSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const detailsRequestInFlight = useRef(false);
  const activeRequestInFlight = useRef(false);
  const countedMessages = useMemo(
    () => stats.reduce((sum, stat) => sum + stat.messages_count, 0),
    [stats],
  );

  const fetchDetails = useCallback(async () => {
      if (detailsRequestInFlight.current) return;
      detailsRequestInFlight.current = true;

      try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Не удалось определить пользователя. Войдите в аккаунт заново.');
        setLoading(false);
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('id, started_at, ended_at, status, total_messages, stream_title, category_name, session_type')
        .eq('id', params.id)
        .eq('user_id', user.id)
        .single();

      if (sessionError) {
        if (sessionError.code === 'PGRST116') {
          setSession(null);
          setError('');
        } else {
          setError('Не удалось загрузить информацию о стриме.');
        }
        setLoading(false);
        return;
      }

      const allStats: MessageStat[] = [];
      let offset = 0;

      while (true) {
        const { data: statsData, error: statsError } = await supabase
          .from('message_stats')
          .select('id, twitch_user_id, twitch_username, messages_count, last_message_at')
          .eq('session_id', params.id)
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (statsError) {
          setError('Не удалось загрузить статистику участников.');
          setLoading(false);
          return;
        }

        const page = (statsData ?? []) as MessageStat[];
        allStats.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      setError('');
      setSession(sessionData as StreamSession);
      setStats(allStats.sort((left, right) => (
        right.messages_count - left.messages_count || left.id.localeCompare(right.id)
      )));
      setLoading(false);
      } catch {
        setError('Не удалось загрузить статистику стрима.');
        setLoading(false);
      } finally {
        detailsRequestInFlight.current = false;
      }
  }, [params.id]);

  const refreshActiveSession = useCallback(async () => {
    if (activeRequestInFlight.current) return;
    activeRequestInFlight.current = true;

    try {
      const { data } = await supabase
        .from('sessions')
        .select('id, started_at, ended_at, status, total_messages, stream_title, category_name, session_type')
        .eq('id', params.id)
        .single();

      if (!data) return;
      const updatedSession = data as StreamSession;
      setSession(updatedSession);

      if (updatedSession.status !== 'active') {
        void fetchDetails();
      }
    } finally {
      activeRequestInFlight.current = false;
    }
  }, [fetchDetails, params.id]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchDetails(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchDetails]);

  useEffect(() => {
    if (session?.status !== 'active') return;
    const interval = window.setInterval(() => void refreshActiveSession(), ACTIVE_SESSION_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [refreshActiveSession, session?.status]);

  const downloadFile = (content: string, type: string, extension: string) => {
    if (!session) return;

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stream_stats_${new Date(session.started_at).toISOString().split('T')[0]}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!stats.length) return;

    const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = stats.map((stat) => [
      stat.twitch_user_id,
      stat.twitch_username,
      stat.messages_count,
      new Date(stat.last_message_at).toISOString(),
    ]);
    const csv = [
      ['Twitch User ID', 'Username', 'Messages Count', 'Last Message At'],
      ...rows,
    ].map((row) => row.map(escapeCell).join(',')).join('\n');

    downloadFile(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'csv');
  };

  const exportJSON = () => {
    if (!stats.length) return;
    downloadFile(JSON.stringify({ session, participants: stats }, null, 2), 'application/json', 'json');
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-950 p-8 text-white">Загрузка...</div>;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-8 text-white">
        <div className="max-w-md rounded-xl border border-red-900/70 bg-red-950/30 p-6 text-center text-red-300">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchDetails();
            }}
            className="mt-4 rounded-lg bg-red-400/15 px-4 py-2 text-sm font-semibold transition-colors hover:bg-red-400/25"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-950 p-8 text-center text-red-400">
        Сессия не найдена. <Link href="/dashboard/history" className="underline">Вернуться к истории</Link>
      </div>
    );
  }

  const isActive = session.status === 'active';

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-6 text-white md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <Link
              href="/dashboard/history"
              className="mt-1 rounded-full p-2 transition-colors hover:bg-gray-800"
              aria-label="Вернуться к истории"
            >
              <ArrowLeft size={24} />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{getStreamTitle(session)}</h1>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                  isActive ? 'bg-green-400/10 text-green-400' : 'bg-gray-800 text-gray-400'
                }`}>
                  {isActive ? 'В эфире' : 'Завершён'}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-400">
                {new Date(session.started_at).toLocaleString('ru-RU')}
                {session.ended_at && ` — ${new Date(session.ended_at).toLocaleString('ru-RU')}`}
              </p>
            </div>
          </div>

          <div className="flex gap-2 pl-11 md:pl-0">
            <ExportButton label="CSV" onClick={exportCSV} disabled={!stats.length} />
            <ExportButton label="JSON" onClick={exportJSON} disabled={!stats.length} primary />
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Информация о стриме">
          <InfoCard icon={MessageSquare} label="Сообщений" value={session.total_messages.toLocaleString('ru-RU')} />
          <InfoCard icon={Users} label="Участников" value={stats.length.toLocaleString('ru-RU')} />
          <InfoCard icon={Radio} label="Длительность" value={formatStreamDuration(session.started_at, session.ended_at)} />
          <InfoCard icon={Gamepad2} label="Категория" value={session.category_name || 'Не указана'} />
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          {isActive && (
            <div className="border-b border-yellow-700/40 bg-yellow-500/10 px-5 py-3 text-sm text-yellow-200">
              Статистика участников и экспорт — снимок на момент открытия. Полный список автоматически обновится после завершения стрима.
            </div>
          )}
          <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
            <h2 className="font-semibold">Участники чата</h2>
            <span className="text-xs text-gray-500">
              {isActive ? 'Снимок на момент открытия' : 'По количеству сообщений'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-gray-800/50 text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-5 py-4 font-medium">#</th>
                  <th className="px-5 py-4 font-medium">Пользователь</th>
                  <th className="px-5 py-4 text-right font-medium">Сообщений</th>
                  <th className="px-5 py-4 text-right font-medium">Доля</th>
                  <th className="px-5 py-4 text-right font-medium">Последнее сообщение</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {stats.map((stat, index) => (
                  <tr key={stat.id} className="transition-colors hover:bg-gray-800/30">
                    <td className="px-5 py-4 font-mono text-gray-500">{index + 1}</td>
                    <td className="px-5 py-4 font-medium">{stat.twitch_username}</td>
                    <td className="px-5 py-4 text-right font-bold text-[#a970ff]">
                      {stat.messages_count.toLocaleString('ru-RU')}
                    </td>
                    <td className="px-5 py-4 text-right text-gray-400">
                      {countedMessages > 0 ? `${((stat.messages_count / countedMessages) * 100).toFixed(1)}%` : '0%'}
                    </td>
                    <td className="px-5 py-4 text-right text-gray-500">
                      {new Date(stat.last_message_at).toLocaleString('ru-RU')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.length === 0 && (
            <div className="p-12 text-center text-gray-500">В этой сессии сообщений не было.</div>
          )}
        </section>
      </div>
    </main>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500">
        <Icon size={15} />
        {label}
      </div>
      <div className="mt-2 truncate font-semibold text-gray-100" title={value}>{value}</div>
    </div>
  );
}

function ExportButton({
  label,
  onClick,
  disabled,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary ? 'bg-[#9146FF] hover:bg-[#7b3be6]' : 'bg-gray-800 hover:bg-gray-700'
      }`}
    >
      <Download size={16} /> {label}
    </button>
  );
}
