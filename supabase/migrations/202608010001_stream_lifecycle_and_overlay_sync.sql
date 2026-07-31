BEGIN;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS session_type TEXT,
  ADD COLUMN IF NOT EXISTS twitch_stream_id TEXT;

UPDATE public.sessions
SET session_type = CASE
  WHEN category_name = 'Offline' OR stream_title = '??????? ???' THEN 'offline'
  ELSE 'live'
END
WHERE session_type IS NULL;

ALTER TABLE public.sessions
  ALTER COLUMN session_type SET DEFAULT 'live',
  ALTER COLUMN session_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_session_type_check'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_session_type_check
      CHECK (session_type IN ('live', 'offline', 'manual'));
  END IF;
END
$$;

UPDATE public.sessions
SET
  status = 'completed',
  ended_at = COALESCE(ended_at, now())
WHERE status = 'active'
  AND session_type = 'offline';

WITH duplicate_active AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY started_at DESC, id DESC
    ) AS position
  FROM public.sessions
  WHERE status = 'active'
    AND session_type = 'live'
)
UPDATE public.sessions AS sessions
SET
  status = 'completed',
  ended_at = COALESCE(sessions.ended_at, now())
FROM duplicate_active
WHERE sessions.id = duplicate_active.id
  AND duplicate_active.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_user_stream_id_unique
  ON public.sessions (user_id, twitch_stream_id)
  WHERE twitch_stream_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_active_live_per_user
  ON public.sessions (user_id)
  WHERE status = 'active' AND session_type = 'live';

ALTER TABLE public.settings
  ALTER COLUMN ignore_commands SET DEFAULT false;

UPDATE public.settings
SET ignore_commands = false
WHERE ignore_commands IS DISTINCT FROM false;

DROP POLICY IF EXISTS "Public can view settings by token" ON public.settings;
DROP POLICY IF EXISTS "Public can view active sessions" ON public.sessions;
DROP POLICY IF EXISTS "Public can insert message stats" ON public.message_stats;

CREATE OR REPLACE FUNCTION public.get_active_stream_session(
  p_overlay_token TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_session_id UUID;
BEGIN
  IF p_overlay_token IS NOT NULL THEN
    SELECT settings.user_id
    INTO v_user_id
    FROM public.settings
    WHERE settings.overlay_token = p_overlay_token;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT sessions.id
  INTO v_session_id
  FROM public.sessions
  WHERE sessions.user_id = v_user_id
    AND sessions.status = 'active'
    AND sessions.session_type = 'live'
  ORDER BY sessions.started_at DESC
  LIMIT 1;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_stream_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_stream_session(TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_or_create_active_session(TEXT);

CREATE FUNCTION public.get_or_create_active_session(
  p_overlay_token TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_active_stream_session(p_overlay_token);
$$;

REVOKE ALL ON FUNCTION public.get_or_create_active_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_session(TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.handle_stream_online(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.handle_stream_online(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT);

CREATE FUNCTION public.handle_stream_online(
  p_user_id UUID,
  p_stream_id TEXT,
  p_started_at TIMESTAMPTZ,
  p_title TEXT,
  p_category TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT sessions.id
  INTO v_session_id
  FROM public.sessions
  WHERE sessions.user_id = p_user_id
    AND sessions.twitch_stream_id = p_stream_id
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    UPDATE public.sessions
    SET
      stream_title = COALESCE(NULLIF(p_title, ''), stream_title),
      category_name = COALESCE(NULLIF(p_category, ''), category_name)
    WHERE id = v_session_id;

    RETURN v_session_id;
  END IF;

  UPDATE public.sessions
  SET
    status = 'completed',
    ended_at = COALESCE(ended_at, now())
  WHERE user_id = p_user_id
    AND status = 'active';

  INSERT INTO public.sessions (
    user_id,
    started_at,
    ended_at,
    status,
    total_messages,
    stream_title,
    category_name,
    session_type,
    twitch_stream_id
  )
  VALUES (
    p_user_id,
    COALESCE(p_started_at, now()),
    NULL,
    'active',
    0,
    COALESCE(NULLIF(p_title, ''), 'Twitch stream'),
    COALESCE(p_category, ''),
    'live',
    p_stream_id
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_stream_online(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_stream_online(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_stream_offline(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions
  SET
    status = 'completed',
    ended_at = COALESCE(ended_at, now())
  WHERE user_id = p_user_id
    AND status = 'active'
    AND session_type = 'live';
END;
$$;

REVOKE ALL ON FUNCTION public.handle_stream_offline(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_stream_offline(UUID) TO service_role;

DROP FUNCTION IF EXISTS public.process_twitch_chat_message_server(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER);

CREATE FUNCTION public.process_twitch_chat_message_server(
  p_message_id TEXT,
  p_broadcaster_user_id TEXT,
  p_chatter_user_id TEXT,
  p_chatter_username TEXT,
  p_user_id UUID,
  p_increment INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  IF p_increment <= 0 THEN
    RAISE EXCEPTION 'Increment must be positive';
  END IF;

  SELECT sessions.id
  INTO v_session_id
  FROM public.sessions
  WHERE sessions.user_id = p_user_id
    AND sessions.status = 'active'
    AND sessions.session_type = 'live'
  ORDER BY sessions.started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_session_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.processed_twitch_messages (
    message_id,
    broadcaster_user_id,
    chatter_user_id
  )
  VALUES (
    p_message_id,
    p_broadcaster_user_id,
    p_chatter_user_id
  );

  INSERT INTO public.message_stats (
    session_id,
    twitch_user_id,
    twitch_username,
    messages_count,
    last_message_at
  )
  VALUES (
    v_session_id,
    p_chatter_user_id,
    p_chatter_username,
    p_increment,
    now()
  )
  ON CONFLICT (session_id, twitch_user_id)
  DO UPDATE SET
    messages_count = public.message_stats.messages_count + EXCLUDED.messages_count,
    twitch_username = EXCLUDED.twitch_username,
    last_message_at = now();

  UPDATE public.sessions
  SET total_messages = COALESCE(total_messages, 0) + p_increment
  WHERE id = v_session_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.process_twitch_chat_message_server(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_twitch_chat_message_server(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.get_overlay_state(
  p_overlay_token TEXT
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'settings',
      to_jsonb(settings)
      - ARRAY['id', 'user_id', 'overlay_token', 'created_at', 'updated_at'],
    'twitch_id', settings.twitch_id,
    'twitch_username', settings.twitch_username,
    'session_id', (
      SELECT sessions.id
      FROM public.sessions
      WHERE sessions.user_id = settings.user_id
        AND sessions.status = 'active'
        AND sessions.session_type = 'live'
      ORDER BY sessions.started_at DESC
      LIMIT 1
    )
  )
  FROM public.settings
  WHERE settings.overlay_token = p_overlay_token;
$$;

REVOKE ALL ON FUNCTION public.get_overlay_state(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_overlay_state(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_overlay_message_stats(
  p_overlay_token TEXT
)
RETURNS TABLE (
  session_id UUID,
  twitch_user_id TEXT,
  twitch_username TEXT,
  messages_count INTEGER,
  last_message_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    message_stats.session_id,
    message_stats.twitch_user_id,
    message_stats.twitch_username,
    message_stats.messages_count,
    message_stats.last_message_at
  FROM public.settings
  JOIN public.sessions
    ON sessions.user_id = settings.user_id
   AND sessions.status = 'active'
   AND sessions.session_type = 'live'
  JOIN public.message_stats
    ON message_stats.session_id = sessions.id
  WHERE settings.overlay_token = p_overlay_token
  ORDER BY message_stats.messages_count DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_overlay_message_stats(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_overlay_message_stats(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
