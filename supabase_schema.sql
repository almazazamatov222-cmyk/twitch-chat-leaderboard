-- Настройки оверлея
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    twitch_id TEXT,
    twitch_username TEXT,
    overlay_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    title_text TEXT DEFAULT 'Топ чата',
    show_title BOOLEAN DEFAULT true,
    top_count INTEGER DEFAULT 10,
    background_color TEXT DEFAULT 'transparent',
    text_color TEXT DEFAULT '#ffffff',
    font_family TEXT DEFAULT 'Inter',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- Сессии стримов
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    total_messages INTEGER DEFAULT 0
);

-- Статистика сообщений в сессии (реалтайм таблица)
CREATE TABLE IF NOT EXISTS public.message_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    twitch_user_id TEXT NOT NULL,
    twitch_username TEXT NOT NULL,
    messages_count INTEGER DEFAULT 1,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(session_id, twitch_user_id)
);

-- Включаем RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_stats ENABLE ROW LEVEL SECURITY;

-- Политики (Policies) для Settings
CREATE POLICY "Users can view their own settings" ON public.settings
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings" ON public.settings
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings" ON public.settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Анонимный доступ для чтения настроек по overlay_token
CREATE POLICY "Public can view settings by token" ON public.settings
    FOR SELECT USING (true);

-- Политики для Sessions
CREATE POLICY "Users can manage their sessions" ON public.sessions
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public can view active sessions" ON public.sessions
    FOR SELECT USING (true);

-- Политики для Message Stats
CREATE POLICY "Users can manage their message stats" ON public.message_stats
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND user_id = auth.uid())
    );
-- Анонимный доступ для вставки и чтения из оверлея
CREATE POLICY "Public can insert message stats" ON public.message_stats
    FOR ALL USING (true) WITH CHECK (true);

-- Включаем Realtime
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table public.message_stats;
alter publication supabase_realtime add table public.settings;
alter publication supabase_realtime add table public.sessions;
