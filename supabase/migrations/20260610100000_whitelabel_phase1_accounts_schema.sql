-- 20260610100000_whitelabel_phase1_accounts_schema.sql
--
-- Whitelabel Phase 1 (Schema) — accounts-basiertes Whitelabel.
--
-- Entscheidung (2026-06-10): Whitelabel haengt am accounts-Modell (NICHT an den
-- Legacy-Tabellen tenants/whitelabel_settings, die deprecated werden). Steuerung
-- ausschliesslich ueber admin.leadesk.de/accounts. Gate ist ein bewusstes
-- Plan-Flag plans.feature_whitelabel (unabhaengig von is_team_plan/seats).
--
-- Diese Migration:
--   1. accounts: logo_url, subdomain, primary_color + Format-/Reserved-CHECK
--      + Partial-Unique-Index auf subdomain
--   2. plans.feature_whitelabel boolean DEFAULT false
--   3. public branding-Bucket (Logos muessen pre-auth lesbar sein) + Storage-RLS
--      (admin write, public read)
--   4. SECURITY-DEFINER get_branding_by_subdomain(text) — anonym-sichere
--      Aufloesung Subdomain -> Branding (nur logo/color/name, kein sensibler Inhalt)
--
-- Idempotent. Staging-first (Hetzner), nach Freigabe Prod.

BEGIN;

-- ── 1. accounts: Whitelabel-Spalten ─────────────────────────────────────────
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS logo_url      text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS subdomain     text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS primary_color text;

-- Format- + Reserved-Name-CHECK (Defense-in-Depth; einziger Write-Pfad ist die
-- update_account_with_audit-RPC, aber DB-Guard schuetzt vor jedem direkten Write).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='accounts'
      AND constraint_name='accounts_subdomain_format'
  ) THEN
    ALTER TABLE public.accounts ADD CONSTRAINT accounts_subdomain_format CHECK (
      subdomain IS NULL OR (
        subdomain ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'
        AND subdomain NOT IN (
          'app','admin','staging','www','api','supabase','supabase-staging',
          'mail','smtp','ftp','dev','test','status','help','docs','blog'
        )
      )
    );
  END IF;
END $$;

-- Subdomain global eindeutig (nur wo gesetzt).
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_subdomain
  ON public.accounts (subdomain) WHERE subdomain IS NOT NULL;

-- ── 2. plans: Whitelabel-Gate ───────────────────────────────────────────────
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS feature_whitelabel boolean NOT NULL DEFAULT false;

-- ── 3. branding-Bucket (public) + Storage-RLS ───────────────────────────────
-- public=true: Logos werden auf der gebrandeten Login-Seite VOR Auth gerendert,
-- brauchen also eine oeffentlich lesbare URL (kein Signed-URL-Auth-Pfad).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('branding', 'branding', true, 5242880,
        ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Write (insert/update/delete) nur fuer Leadesk-Admins (is_leadesk_admin-Claim).
-- Read laeuft ueber den public-Bucket-Pfad; zusaetzliche SELECT-Policy fuer den
-- authenticated/anon-API-Pfad.
DROP POLICY IF EXISTS branding_storage_read  ON storage.objects;
DROP POLICY IF EXISTS branding_storage_write ON storage.objects;
DROP POLICY IF EXISTS branding_storage_admin ON storage.objects;

CREATE POLICY branding_storage_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'branding');

CREATE POLICY branding_storage_admin ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'branding'
    AND COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false)
  )
  WITH CHECK (
    bucket_id = 'branding'
    AND COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false)
  );

-- ── 4. Anonyme Branding-Aufloesung ──────────────────────────────────────────
-- Gibt NUR Branding-Felder zurueck (kein billing/notes/status-Detail). Gegated auf
-- Plan-Flag + aktiven/trialing Account. SECURITY DEFINER, damit RLS auf accounts
-- NICHT fuer anon geoeffnet werden muss.
CREATE OR REPLACE FUNCTION public.get_branding_by_subdomain(p_subdomain text)
RETURNS TABLE(account_id uuid, app_name text, logo_url text, primary_color text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.name, a.logo_url, a.primary_color
  FROM public.accounts a
  JOIN public.plans p ON p.id = a.plan_id
  WHERE a.subdomain = lower(p_subdomain)
    AND COALESCE(p.feature_whitelabel, false) = true
    AND a.status IN ('active','trialing')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_branding_by_subdomain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_branding_by_subdomain(text) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
