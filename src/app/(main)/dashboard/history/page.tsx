'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  Gamepad2,
  MessageSquare,
  Radio,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  formatStreamDuration,
  formatStreamTime,
  getStreamTitle,
  groupSessionsByDay,
  type StreamSession,
} from '@/lib/sessionHistory';

const PAGE_SIZE = 1000;
const ACTIVE_SESSION_REFRESH_MS = 30_000;

export default function HistoryPage() {
  const [sessions, setSessions] = useState<StreamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const historyRequestInFlight = useRef(false);
  const activeRequestInFlight = useRef(false);
  const dayGroups = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  const totalMessages = useMemo(
    () => sessions.reduce((sum, session) => sum + session.total_messages, 0),
    [sessions],
  );
  const activeSessionId = sessions.find((session) => session.status === 'active')?.id;

  const fetchHistory = useCallback(async () => {
      if (historyRequestInFlight.current) return;
      historyRequestInFlight.current = true;

      try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Не удалось определить пользователя. Войдите в аккаунт заново.');
        setLoading(false);
        return;
      }

      const allSessions: StreamSession[] = [];
      let offset = 0;

      while (true) {
        const { data, error: historyError } = await supabase
          .from('sessions')
          .select('id, started_at, ended_at, status, total_messages, stream_title, category_name, session_type')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (historyError) {
          setError('Не удалось загрузить историю стримов.');
          setLoading(false);
          return;
        }

        const page = (data ?? []) as StreamSession[];
        allSessions.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      setError('');
      setSessions(allSessions);
      setLoading(false);
      } catch {
        setError('Не удалось загрузить историю стримов.');
        setLoading(false);
      } finally {
        historyRequestInFlight.current = false;
      }
  }, []);

  const refreshActiveSession = useCallback(async (sessionId: string) => {
    if (activeRequestInFlight.current) return;
    activeRequestInFlight.current = true;

    try {
      const { data } = await supabase
        .from('sessions')
        .select('id, started_at, ended_at, status, total_messages, stream_title, category_name, session_type')
        .eq('id', sessionId)
        .single();

      if (!data) return;
      const updatedSession = data as StreamSession;
      setSessions((current) => current.map((item) => (
        item.id === updatedSession.id ? updatedSession : item
      )));

      if (updatedSession.status !== 'active') {
        void fetchHistory();
      }
    } finally {
      activeRequestInFlight.current = false;
    }
  }, [fetchHistory]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchHistory(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchHistory]);

  useEffect(() => {
    if (!activeSessionId) return;
    const interval = window.setInterval(
      () => void refreshActiveSession(activeSessionId),
      ACTIVE_SESSION_REFRESH_MS,
    );
    return () => window.clearInterval(interval);
  }, [activeSessionId, refreshActiveSession]);

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-6 text-white md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-full p-2 transition-colors hover:bg-gray-800"
            aria-label="Вернуться в настройки"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">История стримов</h1>
            <p className="mt-1 text-sm text-gray-400">Все стримы и статистика чата по дням</p>
          </div>
        </header>

        {!loading && !error && sessions.length > 0 && (
          <section className="grid grid-cols-3 gap-3" aria-label="Общая статистика">
            <SummaryCard label="Дней" value={dayGroups.length.toLocaleString('ru-RU')} />
            <SummaryCard label="Стримов" value={sessions.length.toLocaleString('ru-RU')} />
            <SummaryCard label="Сообщений" value={totalMessages.toLocaleString('ru-RU')} />
          </section>
        )}

        {loading ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-gray-400">
            Загрузка истории...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-900/70 bg-red-950/30 p-6 text-red-300">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void fetchHistory();
              }}
              className="mt-4 rounded-lg bg-red-400/15 px-4 py-2 text-sm font-semibold transition-colors hover:bg-red-400/25"
            >
              Повторить
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-800 py-20 text-center text-gray-500">
            История пока пуста. Первая запись появится при начале стрима.
          </div>
        ) : (
          <div className="space-y-8">
            {dayGroups.map((group) => (
              <section key={group.key} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold capitalize text-gray-300">
                  <CalendarDays size={17} className="text-[#9146FF]" />
                  {group.label}
                  <span className="font-normal text-gray-600">· {group.sessions.length}</span>
                </div>

                <div className="space-y-3">
                  {group.sessions.map((session) => (
                    <SessionCard key={session.id} session={session} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
      <div className="text-xl font-bold text-[#a970ff] md:text-2xl">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wider text-gray-500 md:text-xs">{label}</div>
    </div>
  );
}

function SessionCard({ session }: { session: StreamSession }) {
  const isActive = session.status === 'active';

  return (
    <Link
      href={`/dashboard/history/${session.id}`}
      className="group grid gap-4 rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-[#9146FF]/60 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
    >
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold">{getStreamTitle(session)}</h2>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
            isActive ? 'bg-green-400/10 text-green-400' : 'bg-gray-800 text-gray-400'
          }`}>
            {isActive ? 'В эфире' : 'Завершён'}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-400">
          <span className="flex items-center gap-1.5">
            <Clock3 size={15} />
            {formatStreamTime(session.started_at)}–{session.ended_at ? formatStreamTime(session.ended_at) : 'сейчас'}
          </span>
          <span className="flex items-center gap-1.5">
            <Radio size={15} />
            {formatStreamDuration(session.started_at, session.ended_at)}
          </span>
          <span className="flex items-center gap-1.5">
            <Gamepad2 size={15} />
            {session.category_name || 'Категория не указана'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-5 border-t border-gray-800 pt-4 md:border-0 md:pt-0">
        <div className="text-right">
          <div className="flex items-center gap-2 text-xl font-bold text-[#a970ff]">
            <MessageSquare size={18} />
            {session.total_messages.toLocaleString('ru-RU')}
          </div>
          <div className="text-xs text-gray-500">сообщений</div>
        </div>
        <ChevronRight className="text-gray-600 transition-transform group-hover:translate-x-1 group-hover:text-[#a970ff]" />
      </div>
    </Link>
  );
}
