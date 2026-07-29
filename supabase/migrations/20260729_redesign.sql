-- Migration for full redesign

-- 1. Add fields for new background features
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS background_mode TEXT DEFAULT 'transparent',
  ADD COLUMN IF NOT EXISTS background_image_path TEXT,
  ADD COLUMN IF NOT EXISTS background_image_fit TEXT DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS background_image_position TEXT DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS background_image_opacity NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS background_blur TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS background_overlay_opacity NUMERIC DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS overlay_radius TEXT DEFAULT '0px',
  
  -- 2. Add fields for rows
  ADD COLUMN IF NOT EXISTS row_height TEXT DEFAULT 'auto',
  -- row_padding already exists from previous migration
  -- row_border_color, row_border_width exist
  ADD COLUMN IF NOT EXISTS row_shadow_enabled BOOLEAN DEFAULT false,
  -- highlight_color, highlight_duration exist
  
  -- 3. Element specific text fields (Ensuring all elements have the uniform set)
  -- Position
  ADD COLUMN IF NOT EXISTS position_weight TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS position_stroke_width TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS position_stroke_color TEXT DEFAULT 'transparent',
  ADD COLUMN IF NOT EXISTS position_shadow_color TEXT DEFAULT 'rgba(0,0,0,0.5)',
  ADD COLUMN IF NOT EXISTS position_shadow_opacity NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS position_opacity NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS position_letter_spacing TEXT DEFAULT 'normal',

  -- Username
  ADD COLUMN IF NOT EXISTS username_stroke_width TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS username_stroke_color TEXT DEFAULT 'transparent',
  ADD COLUMN IF NOT EXISTS username_shadow_color TEXT DEFAULT 'rgba(0,0,0,0.5)',
  ADD COLUMN IF NOT EXISTS username_shadow_opacity NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS username_opacity NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS username_letter_spacing TEXT DEFAULT 'normal',

  -- Counter
  ADD COLUMN IF NOT EXISTS counter_weight TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS counter_stroke_width TEXT DEFAULT '0px',
  ADD COLUMN IF NOT EXISTS counter_stroke_color TEXT DEFAULT 'transparent',
  ADD COLUMN IF NOT EXISTS counter_shadow_color TEXT DEFAULT 'rgba(0,0,0,0.5)',
  ADD COLUMN IF NOT EXISTS counter_shadow_opacity NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS counter_opacity NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS counter_letter_spacing TEXT DEFAULT 'normal',

  -- Title
  ADD COLUMN IF NOT EXISTS title_shadow_color TEXT DEFAULT 'rgba(0,0,0,0.5)',
  ADD COLUMN IF NOT EXISTS title_shadow_opacity NUMERIC DEFAULT 1.0,
  
  -- 4. Toggles for elements (instead of templates)
  ADD COLUMN IF NOT EXISTS element_show_rank BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS element_show_name BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS element_show_count BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS top3_highlight_enabled BOOLEAN DEFAULT true,
  
  -- 5. Animations
  -- animation_type and animation_duration exist, but let's add counter_animation
  ADD COLUMN IF NOT EXISTS counter_animation TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS rank_animation_enabled BOOLEAN DEFAULT true;


-- Create Storage bucket for backgrounds
INSERT INTO storage.buckets (id, name, public) 
VALUES ('backgrounds', 'backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for backgrounds bucket
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'backgrounds' );

CREATE POLICY "Authenticated users can upload backgrounds" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'backgrounds' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update their own backgrounds" 
ON storage.objects FOR UPDATE 
USING (
  bucket_id = 'backgrounds' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete their own backgrounds" 
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'backgrounds' 
  AND auth.role() = 'authenticated'
);
