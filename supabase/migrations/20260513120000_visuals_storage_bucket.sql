-- Visuals Storage-Bucket + Team-RLS-Policies
-- Bucket-Strategie: User-Folder im Bucket = team_id (ermoeglicht Multi-Tenant ohne JOIN)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('visuals', 'visuals', false, 10485760, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS visuals_storage_read  ON storage.objects;
DROP POLICY IF EXISTS visuals_storage_write ON storage.objects;

CREATE POLICY visuals_storage_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'visuals' AND (storage.foldername(name))[1]::uuid IN (
    SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
  )
);
CREATE POLICY visuals_storage_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'visuals' AND (storage.foldername(name))[1]::uuid IN (
    SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
  )
);
