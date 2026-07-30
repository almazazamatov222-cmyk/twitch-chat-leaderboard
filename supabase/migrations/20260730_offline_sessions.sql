-- Add new Postgres functions to handle sessions

-- Get or create active session (offline or live)
CREATE OR REPLACE FUNCTION get_or_create_active_session(
  p_overlay_token TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_session_id UUID;
BEGIN
  IF p_overlay_token IS NOT NULL THEN
    -- Try to authenticate via overlay token
    SELECT user_id INTO v_user_id FROM public.settings WHERE overlay_token = p_overlay_token;
  ELSE
    -- Authenticate via auth.uid()
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- try to get active session
  SELECT id INTO v_session_id FROM public.sessions WHERE user_id = v_user_id AND status = 'active' ORDER BY started_at DESC LIMIT 1;
  
  -- if none, create one (Offline mode)
  IF v_session_id IS NULL THEN
    INSERT INTO public.sessions (user_id, status, stream_title, category_name)
    VALUES (v_user_id, 'active', 'Оффлайн чат', 'Offline')
    RETURNING id INTO v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Handle stream coming online
CREATE OR REPLACE FUNCTION handle_stream_online(
  p_user_id UUID,
  p_title TEXT,
  p_category TEXT
)
RETURNS void AS $$
BEGIN
  -- Close any existing active sessions
  UPDATE public.sessions 
  SET status = 'completed', ended_at = now() 
  WHERE user_id = p_user_id AND status = 'active';

  -- Create new live session
  INSERT INTO public.sessions (user_id, status, stream_title, category_name) 
  VALUES (p_user_id, 'active', p_title, p_category);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Handle stream going offline
CREATE OR REPLACE FUNCTION handle_stream_offline(
  p_user_id UUID
)
RETURNS void AS $$
BEGIN
  -- Close the live session
  UPDATE public.sessions 
  SET status = 'completed', ended_at = now() 
  WHERE user_id = p_user_id AND status = 'active';

  -- Immediately create an offline session
  INSERT INTO public.sessions (user_id, status, stream_title, category_name) 
  VALUES (p_user_id, 'active', 'Оффлайн чат', 'Offline');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
