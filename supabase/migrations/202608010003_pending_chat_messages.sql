BEGIN;

CREATE TABLE IF NOT EXISTS public.pending_twitch_messages (
  message_id TEXT PRIMARY KEY,
  broadcaster_user_id TEXT NOT NULL,
  chatter_user_id TEXT NOT NULL,
  chatter_username TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_twitch_messages_user_received_idx
  ON public.pending_twitch_messages (user_id, received_at);

ALTER TABLE public.pending_twitch_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pending_twitch_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pending_twitch_messages TO service_role;

CREATE OR REPLACE FUNCTION public.handle_stream_online(
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
  v_pending RECORD;
  v_inserted INTEGER;
  v_started_at TIMESTAMPTZ := COALESCE(p_started_at, now());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT sessions.id
  INTO v_session_id
  FROM public.sessions
  WHERE sessions.user_id = p_user_id
    AND sessions.twitch_stream_id = p_stream_id
  LIMIT 1;

  IF v_session_id IS NULL THEN
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
      v_started_at,
      NULL,
      'active',
      0,
      COALESCE(NULLIF(p_title, ''), 'Twitch stream'),
      COALESCE(p_category, ''),
      'live',
      p_stream_id
    )
    RETURNING id INTO v_session_id;
  ELSE
    UPDATE public.sessions
    SET
      stream_title = COALESCE(NULLIF(p_title, ''), stream_title),
      category_name = COALESCE(NULLIF(p_category, ''), category_name)
    WHERE id = v_session_id;
  END IF;

  DELETE FROM public.pending_twitch_messages
  WHERE user_id = p_user_id
    AND received_at < v_started_at;

  FOR v_pending IN
    SELECT *
    FROM public.pending_twitch_messages
    WHERE user_id = p_user_id
      AND received_at >= v_started_at
    ORDER BY received_at, message_id
    FOR UPDATE
  LOOP
    INSERT INTO public.processed_twitch_messages (
      message_id,
      broadcaster_user_id,
      chatter_user_id
    )
    VALUES (
      v_pending.message_id,
      v_pending.broadcaster_user_id,
      v_pending.chatter_user_id
    )
    ON CONFLICT (message_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted = 1 THEN
      INSERT INTO public.message_stats (
        session_id,
        twitch_user_id,
        twitch_username,
        messages_count,
        last_message_at
      )
      VALUES (
        v_session_id,
        v_pending.chatter_user_id,
        v_pending.chatter_username,
        1,
        v_pending.received_at
      )
      ON CONFLICT (session_id, twitch_user_id)
      DO UPDATE SET
        messages_count = public.message_stats.messages_count + 1,
        twitch_username = EXCLUDED.twitch_username,
        last_message_at = GREATEST(public.message_stats.last_message_at, EXCLUDED.last_message_at);

      UPDATE public.sessions
      SET total_messages = COALESCE(total_messages, 0) + 1
      WHERE id = v_session_id;
    END IF;

    DELETE FROM public.pending_twitch_messages
    WHERE message_id = v_pending.message_id;
  END LOOP;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_stream_online(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
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
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  UPDATE public.sessions
  SET
    status = 'completed',
    ended_at = COALESCE(ended_at, now())
  WHERE user_id = p_user_id
    AND status = 'active'
    AND session_type = 'live';

  DELETE FROM public.pending_twitch_messages
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_stream_offline(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_stream_offline(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.process_twitch_chat_message_server(
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

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

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
    INSERT INTO public.pending_twitch_messages (
      message_id,
      broadcaster_user_id,
      chatter_user_id,
      chatter_username,
      user_id
    )
    VALUES (
      p_message_id,
      p_broadcaster_user_id,
      p_chatter_user_id,
      p_chatter_username,
      p_user_id
    )
    ON CONFLICT (message_id) DO NOTHING;

    DELETE FROM public.pending_twitch_messages
    WHERE received_at < now() - INTERVAL '6 hours';

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

  DELETE FROM public.pending_twitch_messages
  WHERE message_id = p_message_id;

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

REVOKE ALL ON FUNCTION public.process_twitch_chat_message_server(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_twitch_chat_message_server(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
