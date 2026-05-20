-- ============================================================
-- Brand Voice ↔ LinkedIn-Profil-Verknüpfung
-- ============================================================
-- Jede Brand Voice repräsentiert einen LinkedIn-Auftritt. Damit Auto-Publishing,
-- Messaging, Vernetzungen und SSI-Tracking pro BV funktionieren, brauchen wir
-- eine eindeutige Verknüpfung zum LinkedIn-Profil. Die Extension scraped die
-- aktive LinkedIn-Session und schreibt member_id + display_name + avatar in
-- die folgenden Spalten.
--
-- Die existierende Spalte `linkedin_url` bleibt als "freier Text" für den Fall,
-- dass kein Connect via Extension möglich ist (Fallback / manuelle Eingabe).

BEGIN;

ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_member_id text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_display_name text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_avatar_url text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_verified_at timestamptz;

COMMENT ON COLUMN public.brand_voices.linkedin_member_id IS
  'LinkedIn member-id (aus aktiver Browser-Session via Extension). Eindeutige Zuordnung BV ↔ LI-Profil.';
COMMENT ON COLUMN public.brand_voices.linkedin_display_name IS
  'Anzeigename des verknüpften LinkedIn-Profils (z.B. "Julian Wolf").';
COMMENT ON COLUMN public.brand_voices.linkedin_avatar_url IS
  'Avatar-URL des verknüpften LinkedIn-Profils.';
COMMENT ON COLUMN public.brand_voices.linkedin_verified_at IS
  'Wann die Verknüpfung zuletzt verifiziert wurde (bei jedem Verbinden-Klick).';

CREATE INDEX IF NOT EXISTS idx_bv_linkedin_member_id ON public.brand_voices(linkedin_member_id)
  WHERE linkedin_member_id IS NOT NULL;

COMMIT;
