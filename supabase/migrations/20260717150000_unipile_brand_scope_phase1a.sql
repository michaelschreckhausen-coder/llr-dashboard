-- Phase 1a der Unipile-Konsolidierung: Unipile-Account an die Brand hängen (additiv, non-breaking).
-- Kontext: Vereinheitlichung aller LinkedIn-Anbindungen auf Unipile, brand-scoped.
-- Diese Migration ändert KEIN Verhalten: brand_voice_id ist zunächst überall NULL,
-- die neue Policy greift daher noch für keine Zeile. Die bestehende team-basierte
-- SELECT-Policy bleibt unverändert bestehen (OR-Semantik).
BEGIN;

-- 1) Brand-Referenz auf dem kanonischen Unipile-Store
ALTER TABLE public.unipile_accounts
  ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.unipile_accounts.brand_voice_id IS
  'Brand, an die dieses verbundene LinkedIn-Profil hängt (Ziel: Routing-Schlüssel statt user_id). Phase 1a: nullable, wird per Backfill gefüllt.';

CREATE INDEX IF NOT EXISTS idx_unipile_accounts_brand_voice
  ON public.unipile_accounts(brand_voice_id) WHERE brand_voice_id IS NOT NULL;

-- 2) Zusätzliche SELECT-Policy: Zugriff, wenn die zugehörige Brand für den User sichtbar ist.
--    Der Subselect auf brand_voices erbt DEREN RLS (inkl. Sharing über bv_team_shared /
--    brand_voice_shares) -> geteilte Teams dürfen den Account nutzen (bewusste Entscheidung).
DROP POLICY IF EXISTS unipile_accounts_brand_select ON public.unipile_accounts;
CREATE POLICY unipile_accounts_brand_select ON public.unipile_accounts
  FOR SELECT USING (
    brand_voice_id IS NOT NULL
    AND brand_voice_id IN (SELECT id FROM public.brand_voices)
  );

COMMIT;
