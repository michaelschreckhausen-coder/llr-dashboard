-- ============================================================================
-- Bucket lead-avatars: dauerhafte Kopien der LinkedIn-Profilbilder von CRM-Kontakten.
-- licdn-URLs laufen ~30 Tage ab (?e=…) → wir laden sie server-seitig (EF
-- lead-avatar-store) einmal herunter und legen sie hier ab; leads.avatar_url
-- zeigt dann auf die stabile Storage-URL.
-- public-read (Avatare unkritisch, einfachstes <img>-Rendering); Writes NUR über
-- die EF via service_role (umgeht Storage-RLS) → keine authenticated-write-Policy nötig.
-- ============================================================================
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lead-avatars', 'lead-avatars', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- public read (scoped auf den Bucket)
DROP POLICY IF EXISTS lead_avatars_public_read ON storage.objects;
CREATE POLICY lead_avatars_public_read ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'lead-avatars');

COMMIT;

NOTIFY pgrst, 'reload schema';
