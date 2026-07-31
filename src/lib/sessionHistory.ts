export interface StreamSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  total_messages: number;
  stream_title: string | null;
  category_name: string | null;
  session_type: string | null;
}

export interface SessionDayGroup {
  key: string;
  label: string;
  sessions: StreamSession[];
}

const dayFormatter = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function groupSessionsByDay(sessions: StreamSession[]): SessionDayGroup[] {
  const groups = new Map<string, SessionDayGroup>();

  for (const session of sessions) {
    const date = new Date(session.started_at);
    const key = [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
    const existing = groups.get(key);

    if (existing) {
      existing.sessions.push(session);
      continue;
    }

    groups.set(key, {
      key,
      label: dayFormatter.format(date),
      sessions: [session],
    });
  }

  return Array.from(groups.values());
}

export function formatStreamTime(value: string): string {
  return new Date(value).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatStreamDuration(
  startedAt: string,
  endedAt: string | null,
  now = new Date(),
): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : now.getTime();
  const totalMinutes = Math.max(0, Math.floor((end - start) / 60_000));

  if (totalMinutes < 1) return '< 1 мин';

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

export function getStreamTitle(session: StreamSession): string {
  if (session.stream_title) return session.stream_title;
  if (session.session_type === 'offline') return 'Оффлайн-чат';
  return 'Стрим без названия';
}
