-- Add new settings fields to public.settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS width TEXT DEFAULT '100%',
  ADD COLUMN IF NOT EXISTS height TEXT DEFAULT '100%',
  ADD COLUMN IF NOT EXISTS scale NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS opacity NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS paddings TEXT DEFAULT '24px',
  ADD COLUMN IF NOT EXISTS align_x TEXT DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS align_y TEXT DEFAULT 'top',
  ADD COLUMN IF NOT EXISTS bg_gradient TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS bg_image TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bg_blur TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS border_width TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS border_color TEXT DEFAULT 'transparent',
  ADD COLUMN IF NOT EXISTS border_radius TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS box_shadow TEXT DEFAULT 'none',
  
  -- Title specific
  ADD COLUMN IF NOT EXISTS title_font TEXT DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS title_size TEXT DEFAULT '24px',
  ADD COLUMN IF NOT EXISTS title_weight TEXT DEFAULT 'bold',
  ADD COLUMN IF NOT EXISTS title_italic BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS title_color TEXT DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS title_opacity NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS title_gradient TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS title_stroke_width TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS title_stroke_color TEXT DEFAULT 'transparent',
  ADD COLUMN IF NOT EXISTS title_shadow TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS title_letter_spacing TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS title_line_height TEXT DEFAULT '1.2',
  ADD COLUMN IF NOT EXISTS title_align TEXT DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS title_margin_top TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS title_margin_bottom TEXT DEFAULT '24px',
  
  -- Position specific
  ADD COLUMN IF NOT EXISTS show_position BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS position_format TEXT DEFAULT '#{position}',
  ADD COLUMN IF NOT EXISTS position_size TEXT DEFAULT '16px',
  ADD COLUMN IF NOT EXISTS position_color TEXT DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS position_font TEXT DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS position_stroke TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS position_width TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS top1_color TEXT DEFAULT '#ffd700',
  ADD COLUMN IF NOT EXISTS top2_color TEXT DEFAULT '#c0c0c0',
  ADD COLUMN IF NOT EXISTS top3_color TEXT DEFAULT '#cd7f32',
  
  -- Username specific
  ADD COLUMN IF NOT EXISTS show_username BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS username_font TEXT DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS username_size TEXT DEFAULT '16px',
  ADD COLUMN IF NOT EXISTS username_weight TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS username_color TEXT DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS username_stroke TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS username_shadow TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS username_max_length INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS username_transform TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS show_avatar BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_size TEXT DEFAULT '24px',
  ADD COLUMN IF NOT EXISTS avatar_radius TEXT DEFAULT '50%',
  
  -- Counter specific
  ADD COLUMN IF NOT EXISTS show_counter BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS counter_font TEXT DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS counter_size TEXT DEFAULT '16px',
  ADD COLUMN IF NOT EXISTS counter_color TEXT DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS counter_stroke TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS counter_shadow TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS counter_format TEXT DEFAULT '{messages}',
  
  -- Rows specific
  ADD COLUMN IF NOT EXISTS row_width TEXT DEFAULT '100%',
  ADD COLUMN IF NOT EXISTS row_min_height TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS row_max_height TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS row_padding TEXT DEFAULT '12px 16px',
  ADD COLUMN IF NOT EXISTS row_gradient TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS row_border_width TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS row_border_color TEXT DEFAULT 'transparent',
  ADD COLUMN IF NOT EXISTS row_shadow TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS row_inner_gap TEXT DEFAULT '16px',
  ADD COLUMN IF NOT EXISTS row_even_bg TEXT DEFAULT 'transparent',
  ADD COLUMN IF NOT EXISTS row_odd_bg TEXT DEFAULT 'transparent',
  
  -- Layout specific
  ADD COLUMN IF NOT EXISTS layout_direction TEXT DEFAULT 'vertical',
  ADD COLUMN IF NOT EXISTS layout_reverse BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS row_template TEXT DEFAULT '{position} {avatar} {username} {messages}',
  
  -- Animation specific
  ADD COLUMN IF NOT EXISTS animation_type TEXT DEFAULT 'fade',
  ADD COLUMN IF NOT EXISTS animation_duration NUMERIC DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS animation_delay NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS animation_easing TEXT DEFAULT 'easeOut',
  ADD COLUMN IF NOT EXISTS animation_intensity NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS highlight_duration NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS highlight_color TEXT DEFAULT 'rgba(255,255,255,0.2)',
  
  -- Filter specific
  ADD COLUMN IF NOT EXISTS ignore_commands BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ignore_streamer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ignore_mods BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ignore_vips BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_users TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bot_users TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS min_message_length INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS spam_protection BOOLEAN DEFAULT false;

-- Add new fields to public.sessions
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS stream_title TEXT,
  ADD COLUMN IF NOT EXISTS category_name TEXT,
  ADD COLUMN IF NOT EXISTS unique_viewers INTEGER DEFAULT 0;

-- Drop insecure public policy on message_stats
DROP POLICY IF EXISTS "Public can insert message stats" ON public.message_stats;

-- Create secure RPC function for updating message stats via overlay token or auth
CREATE OR REPLACE FUNCTION increment_message_stat(
  p_session_id UUID,
  p_twitch_user_id TEXT,
  p_twitch_username TEXT,
  p_increment INTEGER DEFAULT 1,
  p_overlay_token TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_user_id UUID;
  v_session_valid BOOLEAN;
BEGIN
  IF p_overlay_token IS NOT NULL THEN
    -- Verify overlay token exists and get user_id
    SELECT user_id INTO v_user_id FROM public.settings WHERE overlay_token = p_overlay_token;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Invalid overlay token';
    END IF;
  ELSE
    -- Use authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
  END IF;

  -- Verify session belongs to user and is active
  SELECT EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE id = p_session_id AND user_id = v_user_id AND status = 'active'
  ) INTO v_session_valid;

  IF NOT v_session_valid THEN
    RAISE EXCEPTION 'Invalid or inactive session';
  END IF;

  -- Upsert message stat
  INSERT INTO public.message_stats (session_id, twitch_user_id, twitch_username, messages_count, last_message_at)
  VALUES (p_session_id, p_twitch_user_id, p_twitch_username, p_increment, now())
  ON CONFLICT (session_id, twitch_user_id) 
  DO UPDATE SET 
    messages_count = public.message_stats.messages_count + p_increment,
    last_message_at = now();

  -- Update total_messages on session
  UPDATE public.sessions 
  SET total_messages = total_messages + p_increment
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
