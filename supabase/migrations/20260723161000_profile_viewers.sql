-- Profilbesucher ("Wer hat mein Profil angesehen", WVMP) — brand-scoped.
CREATE TABLE IF NOT EXISTS public.linkedin_profile_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  user_id uuid,
  brand_voice_id uuid,
  unipile_account_id text,
  viewer_name text,
  viewer_headline text,
  viewer_profile_url text,
  viewer_urn text,
  caption text,
  converted_lead_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- Dedup je Marke + Besucher-URN (nur benannte Besucher haben eine URN)
CREATE UNIQUE INDEX IF NOT EXISTS ux_lpv_brand_urn
  ON public.linkedin_profile_viewers (brand_voice_id, viewer_urn) WHERE viewer_urn IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_lpv_brand_seen
  ON public.linkedin_profile_viewers (brand_voice_id, last_seen_at DESC);

ALTER TABLE public.linkedin_profile_viewers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lpv_brand_read ON public.linkedin_profile_viewers;
CREATE POLICY lpv_brand_read ON public.linkedin_profile_viewers FOR SELECT USING (
  has_brand_access(brand_voice_id)
  OR (brand_voice_id IS NULL AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
-- Schreiben/Lead-Übernahme durch eingeloggte Nutzer mit Markenzugriff
DROP POLICY IF EXISTS lpv_brand_write ON public.linkedin_profile_viewers;
CREATE POLICY lpv_brand_write ON public.linkedin_profile_viewers FOR UPDATE USING (
  has_brand_access(brand_voice_id)
  OR (brand_voice_id IS NULL AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
GRANT SELECT, UPDATE ON public.linkedin_profile_viewers TO authenticated;
GRANT ALL ON public.linkedin_profile_viewers TO service_role;
