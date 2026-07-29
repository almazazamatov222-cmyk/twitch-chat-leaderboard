-- Create bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('backgrounds', 'backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public reads
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'backgrounds' );

-- Allow authenticated users to upload
CREATE POLICY "Auth Upload" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'backgrounds' AND auth.role() = 'authenticated' );

-- Allow users to update their own uploads
CREATE POLICY "Auth Update" 
ON storage.objects FOR UPDATE 
WITH CHECK ( bucket_id = 'backgrounds' AND auth.role() = 'authenticated' );
