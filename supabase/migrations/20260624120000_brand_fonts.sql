-- Brand-Fonts: eigene Schriftarten je Company Brand (visuelle Identität),
-- nutzbar im Content-Werkstatt-Designer.
-- Idempotent / BEGIN-COMMIT-gewrappt.

BEGIN;

-- 1) Spalte für hochgeladene Schriften: Array von { name, path, format }
ALTER TABLE public.brand_voices
  ADD COLUMN IF NOT EXISTS font_assets jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Storage-Bucket (privat, team-scoped über Pfad-Präfix <team_id>/)
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-fonts', 'brand-fonts', false)
ON CONFLICT (id) DO NOTHING;

-- 3) RLS-Policies auf storage.objects für den Bucket (Spiegel von visuals)
DROP POLICY IF EXISTS brand_fonts_storage_read   ON storage.objects;
DROP POLICY IF EXISTS brand_fonts_storage_write  ON storage.objects;
DROP POLICY IF EXISTS brand_fonts_storage_update ON storage.objects;
DROP POLICY IF EXISTS brand_fonts_storage_delete ON storage.objects;

CREATE POLICY brand_fonts_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'brand-fonts'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT team_members.team_id FROM team_members WHERE team_members.user_id = auth.uid()
    )
  );

CREATE POLICY brand_fonts_storage_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brand-fonts'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT team_members.team_id FROM team_members WHERE team_members.user_id = auth.uid()
    )
  );

CREATE POLICY brand_fonts_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'brand-fonts'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT team_members.team_id FROM team_members WHERE team_members.user_id = auth.uid()
    )
  );

CREATE POLICY brand_fonts_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'brand-fonts'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT team_members.team_id FROM team_members WHERE team_members.user_id = auth.uid()
    )
  );

COMMIT;
