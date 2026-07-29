ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS counter_weight TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS counter_stroke_width TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS counter_stroke_color TEXT DEFAULT 'transparent',
  ADD COLUMN IF NOT EXISTS counter_shadow_color TEXT DEFAULT 'rgba(0,0,0,0.5)',
  ADD COLUMN IF NOT EXISTS counter_shadow_opacity NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS counter_opacity NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS counter_letter_spacing TEXT DEFAULT 'normal';
