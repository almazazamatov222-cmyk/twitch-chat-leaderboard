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

ALTER PUBLICATION supabase_realtime ADD TABLE webhook_diagnostics;

-- 3. Атомарная RPC для обработки сообщения
CREATE OR REPLACE FUNCTION public.process_twitch_chat_message_server(
    p_message_id TEXT,
    p_broadcaster_user_id TEXT,
    p_chatter_user_id TEXT,
    p_chatter_username TEXT,
    p_user_id UUID,
    p_increment INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_session_id UUID;
BEGIN
    -- 1. Дедупликация (вставка message_id)
    -- Если уже существует, выбросит unique_violation, транзакция прервётся, и вебхук вернет успех (через обработку 23505 на клиенте).
    INSERT INTO processed_twitch_messages (message_id, broadcaster_user_id, chatter_user_id)
    VALUES (p_message_id, p_broadcaster_user_id, p_chatter_user_id);

    -- 2. Получить или создать active session
    SELECT id INTO v_session_id
    FROM sessions
    WHERE user_id = p_user_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;
    
    IF v_session_id IS NULL THEN
        INSERT INTO sessions (user_id, status, stream_title, category_name, total_messages)
        VALUES (p_user_id, 'active', 'Оффлайн чат', 'Offline', 0)
        RETURNING id INTO v_session_id;
    END IF;

    -- 3. Увеличить message_stats
    INSERT INTO message_stats (session_id, twitch_user_id, twitch_username, messages_count, last_message_at)
    VALUES (v_session_id, p_chatter_user_id, p_chatter_username, p_increment, now())
    ON CONFLICT (session_id, twitch_user_id)
    DO UPDATE SET 
        messages_count = message_stats.messages_count + EXCLUDED.messages_count,
        twitch_username = EXCLUDED.twitch_username,
        last_message_at = now();

    -- 4. Увеличить sessions.total_messages
    UPDATE sessions 
    SET total_messages = COALESCE(total_messages, 0) + p_increment
    WHERE id = v_session_id;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_twitch_chat_message_server(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_twitch_chat_message_server(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER) TO service_role;
