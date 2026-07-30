-- 20260731_idempotent_offline_sessions.sql

-- 1. Get or create active session (offline or live)
CREATE OR REPLACE FUNCTION get_or_create_active_session(
  p_overlay_token TEXT DEFAULT NULL
)
RETURNS UUID
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_session_id UUID;
BEGIN
  IF p_overlay_token IS NOT NULL THEN
    SELECT user_id INTO v_user_id FROM public.settings WHERE overlay_token = p_overlay_token;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_session_id FROM public.sessions WHERE user_id = v_user_id AND status = 'active' ORDER BY started_at DESC LIMIT 1;
  
  IF v_session_id IS NULL THEN
    INSERT INTO public.sessions (user_id, status, stream_title, category_name)
    VALUES (v_user_id, 'active', 'Оффлайн чат', 'Offline')
    RETURNING id INTO v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_or_create_active_session TO authenticated, anon;


-- 2. Handle stream coming online
CREATE OR REPLACE FUNCTION handle_stream_online(
  p_user_id UUID,
  p_title TEXT,
  p_category TEXT
)
RETURNS void
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions 
  SET status = 'completed', ended_at = now() 
  WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.sessions (user_id, status, stream_title, category_name) 
  VALUES (p_user_id, 'active', p_title, p_category);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION handle_stream_online TO authenticated, anon;


-- 3. Handle stream going offline
CREATE OR REPLACE FUNCTION handle_stream_offline(
  p_user_id UUID
)
RETURNS void
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions 
  SET status = 'completed', ended_at = now() 
  WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.sessions (user_id, status, stream_title, category_name) 
  VALUES (p_user_id, 'active', 'Оффлайн чат', 'Offline');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION handle_stream_offline TO authenticated, anon;


-- 4. Batch increment message stats to avoid dropping messages
CREATE OR REPLACE FUNCTION increment_message_stat_batch(
  p_session_id UUID,
  p_batch JSONB,
  p_overlay_token TEXT DEFAULT NULL
) 
RETURNS void 
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_session_valid BOOLEAN;
  v_item JSONB;
  v_total_increment INTEGER := 0;
BEGIN
  IF p_overlay_token IS NOT NULL THEN
    SELECT user_id INTO v_user_id FROM public.settings WHERE overlay_token = p_overlay_token;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Invalid overlay token';
    END IF;
  ELSE
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE id = p_session_id AND user_id = v_user_id AND status = 'active'
  ) INTO v_session_valid;

  IF NOT v_session_valid THEN
    RAISE EXCEPTION 'Invalid or inactive session';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_batch)
  LOOP
    INSERT INTO public.message_stats (session_id, twitch_user_id, twitch_username, messages_count, last_message_at)
    VALUES (
      p_session_id, 
      v_item->>'id', 
      v_item->>'username', 
      (v_item->>'count')::INTEGER, 
      now()
    )
    ON CONFLICT (session_id, twitch_user_id) 
    DO UPDATE SET 
      messages_count = public.message_stats.messages_count + (v_item->>'count')::INTEGER,
      last_message_at = now();
      
    v_total_increment := v_total_increment + (v_item->>'count')::INTEGER;
  END LOOP;

  UPDATE public.sessions 
  SET total_messages = total_messages + v_total_increment
  WHERE id = p_session_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_message_stat_batch TO authenticated, anon;
