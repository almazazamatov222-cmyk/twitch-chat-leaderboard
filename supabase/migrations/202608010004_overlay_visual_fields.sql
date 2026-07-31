BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS background_opacity NUMERIC NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS overlay_border_width TEXT NOT NULL DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS overlay_border_color TEXT NOT NULL DEFAULT 'transparent';

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_background_opacity_range;

ALTER TABLE public.settings
  ADD CONSTRAINT settings_background_opacity_range
  CHECK (background_opacity >= 0 AND background_opacity <= 1);

NOTIFY pgrst, 'reload schema';

COMMIT;
