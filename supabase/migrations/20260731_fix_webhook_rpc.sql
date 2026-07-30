-- 1. Создание таблиц (с проверкой IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.processed_twitch_messages (
    message_id text primary key,
    broadcaster_user_id text not null,
    chatter_user_id text not null,
    received_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS public.webhook_diagnostics (
    twitch_id text primary key,
    subscription_status text,
    subscription_id text,
    last_webhook_received_at timestamptz,
    last_message_id text,
    last_chatter_username text,
    last_db_increment_at timestamptz,
    last_webhook_error text,
    updated_at timestamptz default now()
);

-- 2. Включение RLS и публикация в Realtime
ALTER TABLE public.webhook_diagnostics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own diagnostics" ON public.webhook_diagnostics;
CREATE POLICY "Users can read own diagnostics" ON public.webhook_diagnostics 
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM settings WHERE settings.twitch_id = webhook_diagnostics.twitch_id));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE webhook_diagnostics;

-- 3. Серверные RPC (без auth.uid)
CREATE OR REPLACE FUNCTION public.get_or_create_active_session_server(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_session_id UUID;
BEGIN
    -- Ищем активную сессию
    SELECT id INTO v_session_id
    FROM sessions
    WHERE user_id = p_user_id AND end_time IS NULL
    ORDER BY start_time DESC LIMIT 1;
    
    -- Если нет — создаем офлайн сессию
    IF v_session_id IS NULL THEN
        INSERT INTO sessions (user_id, stream_title, category, is_online)
        VALUES (p_user_id, 'Offline', 'Offline', false)
        RETURNING id INTO v_session_id;
    END IF;
    
    RETURN v_session_id;
END;
$$;
-- Запрет вызова с клиента (разрешаем только service_role)
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_session_server(UUID) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.increment_message_stat_server(
    p_user_id UUID,
    p_session_id UUID,
    p_twitch_user_id TEXT,
    p_twitch_username TEXT,
    p_increment INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- Проверка принадлежности сессии
    IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND user_id = p_user_id) THEN
        RAISE EXCEPTION 'Session does not belong to user';
    END IF;

    -- Инкремент статы
    INSERT INTO message_stats (session_id, twitch_user_id, twitch_username, message_count, updated_at)
    VALUES (p_session_id, p_twitch_user_id, p_twitch_username, p_increment, now())
    ON CONFLICT (session_id, twitch_user_id)
    DO UPDATE SET 
        message_count = message_stats.message_count + EXCLUDED.message_count,
        twitch_username = EXCLUDED.twitch_username,
        updated_at = now();

    -- Обновляем total_messages в сессии
    UPDATE sessions 
    SET total_messages = total_messages + p_increment
    WHERE id = p_session_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.increment_message_stat_server(UUID, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
