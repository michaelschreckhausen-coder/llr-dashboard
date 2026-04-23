-- Fix: Brand Voice & Zielgruppen Erstellung auf Self-Hosted Staging
-- Behebt 3 Probleme:
--   1) ai_summary Spalte fehlt in brand_voices + target_audiences (Schema-Drift)
--   2) knowledge-files Storage Bucket fehlt
--   3) RLS Policies für Storage

-- 1) Fehlende ai_summary-Spalten (idempotent)
ALTER TABLE public.brand_voices
  ADD COLUMN IF NOT EXISTS ai_summary text;

ALTER TABLE public.target_audiences
  ADD COLUMN IF NOT EXISTS ai_summary text;

-- 2) knowledge-files Storage Bucket anlegen
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-files',
  'knowledge-files',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 3) RLS Policies für knowledge-files Bucket
-- Path-Format: {prefix}/{user_id}/{timestamp}_{filename}
DROP POLICY IF EXISTS "knowledge_files_select_own" ON storage.objects;
CREATE POLICY "knowledge_files_select_own" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'knowledge-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "knowledge_files_insert_own" ON storage.objects;
CREATE POLICY "knowledge_files_insert_own" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'knowledge-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "knowledge_files_update_own" ON storage.objects;
CREATE POLICY "knowledge_files_update_own" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'knowledge-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "knowledge_files_delete_own" ON storage.objects;
CREATE POLICY "knowledge_files_delete_own" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'knowledge-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 4) PostgREST Schema-Cache reloaden
NOTIFY pgrst, 'reload schema';
