-- ROLLBACK zu 20260810170000_lead_avatars_bucket.sql
-- Entfernt Policy + Bucket. Objekte im Bucket müssen vorher leer sein (oder mit-löschen).
BEGIN;
DROP POLICY IF EXISTS lead_avatars_public_read ON storage.objects;
DELETE FROM storage.objects WHERE bucket_id = 'lead-avatars';  -- Kopien wegwerfen (reversibel: EF/Backfill neu laufen lassen)
DELETE FROM storage.buckets WHERE id = 'lead-avatars';
COMMIT;
-- Hinweis: leads.avatar_url, das auf Storage-URLs zeigt, wird NICHT zurückgesetzt
-- (Backfill-Script rollback_leads_avatar_to_source.sql falls nötig — licdn-Originale
--  sind aber i.d.R. bereits abgelaufen).
