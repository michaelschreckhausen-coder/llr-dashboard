-- Migration: visuals.media_type + Metadaten
-- Bisher: visuals hielt nur AI-generierte Bilder.
-- Neu: auch direkte Uploads (Videos, Dokumente, externe Bilder).

BEGIN;

ALTER TABLE public.visuals
  ADD COLUMN IF NOT EXISTS media_type        text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS file_size_bytes   bigint,
  ADD COLUMN IF NOT EXISTS mime_type         text,
  ADD COLUMN IF NOT EXISTS duration_seconds  integer,    -- für Video
  ADD COLUMN IF NOT EXISTS page_count        integer,    -- für PDF
  ADD COLUMN IF NOT EXISTS thumbnail_path    text;       -- optional: Thumbnail für Video/PDF

-- CHECK-Constraint für media_type (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visuals_media_type_check'
  ) THEN
    ALTER TABLE public.visuals
      ADD CONSTRAINT visuals_media_type_check
      CHECK (media_type IN ('image', 'video', 'document'));
  END IF;
END $$;

COMMENT ON COLUMN public.visuals.media_type IS
  'image = AI-generiert oder Bild-Upload; video = Video-Upload; document = PDF/Dokument-Upload.';

NOTIFY pgrst, 'reload schema';

COMMIT;
