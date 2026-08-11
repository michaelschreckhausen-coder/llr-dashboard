-- ROLLBACK Slice A. Sicher, solange B/C nicht appliziert sind (keine RLS/RPC
-- referenziert die Helper noch). Falls B/C schon live → erst deren Rollback.
BEGIN;
DROP FUNCTION IF EXISTS public.get_brand_linkedin_caps(uuid);
DROP FUNCTION IF EXISTS public.has_brand_linkedin_scope(uuid, text);
DROP FUNCTION IF EXISTS public.has_brand_access_direct(uuid);
-- Backfill-Rows: die Home-Team-Rows entfernen, die NUR durch Slice A entstanden
-- (team_id = Home-Team der Marke, scopes = alle). Cross-Team-Rows bleiben.
DELETE FROM public.brand_voice_team_shares ts
USING public.brand_voices bv
WHERE ts.brand_voice_id = bv.id
  AND ts.team_id = bv.team_id
  AND ts.linkedin_scopes = ARRAY['inbox','network','search','automation','engagement','analytics'];
ALTER TABLE public.brand_voice_team_shares DROP COLUMN IF EXISTS linkedin_scopes;
COMMIT;
NOTIFY pgrst, 'reload schema';
