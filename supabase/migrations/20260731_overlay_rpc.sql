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
        ms.session_id,
        ms.twitch_user_id,
        ms.twitch_username,
        ms.messages_count,
        ms.last_message_at
    FROM public.settings s
    JOIN LATERAL (
        SELECT sess.id
        FROM public.sessions sess
        WHERE sess.user_id = s.user_id
          AND sess.status = 'active'
        ORDER BY sess.started_at DESC
        LIMIT 1
    ) active_session ON TRUE
    JOIN public.message_stats ms
      ON ms.session_id = active_session.id
    WHERE s.overlay_token = p_overlay_token
    ORDER BY ms.messages_count DESC
    LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_overlay_message_stats(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_overlay_message_stats(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
