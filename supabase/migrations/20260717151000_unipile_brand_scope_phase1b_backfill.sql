-- Phase 1b: Backfill der Brand-Zuordnung + la_accounts an den kanonischen Store koppeln.
-- unipile_accounts ist die Single Source of Truth für Identität+Brand; la_accounts ist
-- eine Automation-Runtime-Projektion, die brand_voice_id daraus ableitet.
-- Backfill-Regel ist prod-sicher (nur wo eine LinkedIn-Identität am Brand hinterlegt ist);
-- alles Ambige bleibt NULL und wird künftig in der UI zugeordnet.
BEGIN;

-- 1) la_accounts bekommt ebenfalls brand_voice_id (Projektion)
ALTER TABLE public.la_accounts
  ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.la_accounts.brand_voice_id IS
  'Abgeleitet aus unipile_accounts (kanonisch) über unipile_account_id. Nicht eigenständig pflegen.';
CREATE INDEX IF NOT EXISTS idx_la_accounts_brand_voice
  ON public.la_accounts(brand_voice_id) WHERE brand_voice_id IS NOT NULL;

-- 2) Backfill unipile_accounts.brand_voice_id per LinkedIn-Identitäts-Match (nur eindeutige Fälle)
UPDATE public.unipile_accounts ua
SET brand_voice_id = bv.id
FROM public.brand_voices bv
WHERE ua.brand_voice_id IS NULL
  AND bv.team_id = ua.team_id
  AND ua.provider_public_id IS NOT NULL
  AND (
    bv.linkedin_member_id = ua.provider_public_id
    OR bv.linkedin_url ILIKE '%/in/' || ua.provider_public_id
    OR bv.linkedin_url ILIKE '%/in/' || ua.provider_public_id || '/%'
  );

-- 3) la_accounts.brand_voice_id aus dem kanonischen Store ableiten
UPDATE public.la_accounts la
SET brand_voice_id = ua.brand_voice_id
FROM public.unipile_accounts ua
WHERE la.brand_voice_id IS NULL
  AND ua.unipile_account_id = la.unipile_account_id
  AND ua.brand_voice_id IS NOT NULL;

-- 4) Brand-access SELECT-Policy für la_accounts (spiegelt Brand-Sichtbarkeit inkl. Sharing)
DROP POLICY IF EXISTS la_accounts_brand_select ON public.la_accounts;
CREATE POLICY la_accounts_brand_select ON public.la_accounts
  FOR SELECT USING (
    brand_voice_id IS NOT NULL
    AND brand_voice_id IN (SELECT id FROM public.brand_voices)
  );

COMMIT;
