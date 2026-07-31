BEGIN;

ALTER TABLE public.webhook_diagnostics
  ADD COLUMN IF NOT EXISTS last_lifecycle_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_subscription_sync_at TIMESTAMPTZ;

UPDATE public.sessions
SET
  status = 'completed',
  ended_at = COALESCE(ended_at, now())
WHERE status = 'active'
  AND session_type = 'live'
  AND twitch_stream_id IS NULL;

CREATE OR REPLACE FUNCTION public.claim_twitch_lifecycle_sync(
  p_twitch_id TEXT,
  p_min_interval_seconds INTEGER DEFAULT 900
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_min_interval_seconds < 1 THEN
    RAISE EXCEPTION 'Sync interval must be positive';
  END IF;

  UPDATE public.webhook_diagnostics
  SET last_lifecycle_sync_at = now()
  WHERE twitch_id = p_twitch_id
    AND (
      last_lifecycle_sync_at IS NULL
      OR last_lifecycle_sync_at <= now() - make_interval(secs => p_min_interval_seconds)
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_twitch_lifecycle_sync(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_twitch_lifecycle_sync(TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_twitch_subscription_sync(
  p_twitch_id TEXT,
  p_min_interval_seconds INTEGER DEFAULT 900
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_min_interval_seconds < 1 THEN
    RAISE EXCEPTION 'Sync interval must be positive';
  END IF;

  UPDATE public.webhook_diagnostics
  SET last_subscription_sync_at = now()
  WHERE twitch_id = p_twitch_id
    AND (
      last_subscription_sync_at IS NULL
      OR last_subscription_sync_at <= now() - make_interval(secs => p_min_interval_seconds)
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_twitch_subscription_sync(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_twitch_subscription_sync(TEXT, INTEGER) TO service_role;

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
    'settings', (
      SELECT COALESCE(jsonb_object_agg(entry.key, entry.value), '{}'::JSONB)
      FROM jsonb_each(to_jsonb(settings)) AS entry
      WHERE entry.key = ANY (ARRAY[
        'top_count', 'show_title', 'title_text',
        'element_show_rank', 'element_show_name', 'element_show_count',
        'ignore_commands', 'ignore_streamer', 'min_message_length',
        'title_font', 'title_size', 'title_weight', 'title_color',
        'title_stroke_width', 'title_stroke_color', 'title_shadow_color',
        'title_shadow_opacity', 'title_opacity', 'title_letter_spacing',
        'position_font', 'position_size', 'position_weight', 'position_color',
        'position_stroke_width', 'position_stroke_color', 'position_shadow_color',
        'position_shadow_opacity', 'position_opacity', 'position_letter_spacing',
        'username_font', 'username_size', 'username_weight', 'username_color',
        'username_stroke_width', 'username_stroke_color', 'username_shadow_color',
        'username_shadow_opacity', 'username_opacity', 'username_letter_spacing',
        'counter_font', 'counter_size', 'counter_weight', 'counter_color',
        'counter_stroke_width', 'counter_stroke_color', 'counter_shadow_color',
        'counter_shadow_opacity', 'counter_opacity', 'counter_letter_spacing',
        'row_background', 'row_color', 'row_opacity', 'row_radius', 'row_height',
        'row_padding', 'row_gap', 'row_width', 'row_border_color',
        'row_border_width', 'row_shadow_enabled', 'top3_highlight_enabled',
        'top1_color', 'top2_color', 'top3_color', 'background_mode',
        'background_color', 'background_opacity', 'background_image_path',
        'background_image_fit', 'background_image_position',
        'background_image_opacity', 'background_blur',
        'background_overlay_opacity', 'overlay_radius', 'overlay_border_color',
        'overlay_border_width', 'animation_type', 'animation_duration',
        'rank_animation_enabled', 'counter_animation', 'highlight_new',
        'highlight_color', 'highlight_duration'
      ])
    ),
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

NOTIFY pgrst, 'reload schema';

COMMIT;
