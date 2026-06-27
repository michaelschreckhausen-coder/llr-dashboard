-- 20260630100400_geo_visibility_subject_name_backfill.sql
-- Sponsor=Unternehmen-Nachzug: historische geo_visibility_runs vom Typ 'sponsor'
-- behalten ihren damals gespeicherten subject_name. Backfill auf den aktuellen
-- organizations.name (via sponsor_profiles.organization_id). Idempotent
-- (nur wo abweichend). 'club'-Runs (Verein/Team selbst) bleiben unangetastet.

BEGIN;

UPDATE sponsoring.geo_visibility_runs r
SET subject_name = o.name
FROM sponsoring.sponsor_profiles sp
JOIN public.organizations o ON o.id = sp.organization_id
WHERE r.subject_type = 'sponsor'
  AND sp.id = r.subject_ref
  AND r.subject_name IS DISTINCT FROM o.name;

COMMIT;
