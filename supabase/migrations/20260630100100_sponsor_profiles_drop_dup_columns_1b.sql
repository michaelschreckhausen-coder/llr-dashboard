-- 20260630100100_sponsor_profiles_drop_dup_columns_1b.sql
-- Sponsor = Unternehmen (1:1-Extension), TEIL 1b — DESTRUKTIV.
-- ERST anwenden, NACHDEM Frontend (Sponsoren/Vertraege/Angebote/Kampagnen),
-- EF score-sponsor und RPC get_sponsoring_dashboard den Namen/Website/LinkedIn
-- aus public.organizations (Join) lesen — sonst brechen sie (Spalte fehlt).
-- Gedroppt: name, website, linkedin_url (Werte in 1a nach organizations gemappt;
-- linkedin_url war ohnehin in allen Rows leer).
-- BLEIBEN in der Extension: industry, region, notes + alle sponsoring-Felder.

BEGIN;
ALTER TABLE sponsoring.sponsor_profiles DROP COLUMN IF EXISTS name;
ALTER TABLE sponsoring.sponsor_profiles DROP COLUMN IF EXISTS website;
ALTER TABLE sponsoring.sponsor_profiles DROP COLUMN IF EXISTS linkedin_url;
COMMIT;

NOTIFY pgrst, 'reload schema';
