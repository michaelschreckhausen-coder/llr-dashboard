-- ROLLBACK Slice D — set_brand_linkedin_scopes entfernen.
BEGIN;
DROP FUNCTION IF EXISTS public.set_brand_linkedin_scopes(uuid, uuid, text[]);
COMMIT;
