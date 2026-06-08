-- 20260608140000_addon_integration_config.sql
-- Sprint N.2 — Zentrale Add-on-Integration-Secrets, verwaltet über admin.leadesk.de
--
-- Bisher lag der zentrale Auralis-Enterprise-Key als .env-Secret auf der
-- Edge-Runtime (umständlich, SSH/nano-Editieren). Stattdessen: eine generische
-- Tabelle, in der pro Add-on (slug) ein Secret + nicht-sensible Config liegt,
-- gepflegt im Marketplace-Bereich der Admin-App. Erweiterbar für ALLE künftigen
-- Marketplace-Add-ons.
--
-- Sicherheits-Modell:
--   - RLS aktiv, KEINE select/all-Policy für authenticated → direkter Zugriff
--     auf das Klartext-Secret ist für Customer-Sessions unmöglich.
--   - Lese-/Schreibzugriff ausschließlich über SECURITY-DEFINER-RPCs:
--       get_addon_secret(slug)         → nur service_role (EF-Pfad)
--       admin_list_addon_integrations  → is_leadesk_admin, liefert NUR last4
--       admin_set_addon_integration    → is_leadesk_admin, schreibt Secret/Config
--   - service_role-GRANT für den EF-Pfad (Top-Fallstrick #12).
--
-- Auth-Pattern: is_leadesk_admin-JWT-Claim (Top-Fallstrick #9), NICHT profiles.role.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS,
-- CREATE OR REPLACE FUNCTION.
--
-- Apply (Staging zuerst):
--   ssh root@178.104.210.216 'docker exec -i supabase-db psql -U supabase_admin \
--     -d postgres -v ON_ERROR_STOP=1' < supabase/migrations/20260608140000_addon_integration_config.sql

BEGIN;

-- ─── Tabelle ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.addon_integration_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id    uuid NOT NULL UNIQUE REFERENCES public.addons(id) ON DELETE CASCADE,
  secret      text,                                  -- sensibel: zentraler Key/Token
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,    -- nicht-sensible Settings
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

ALTER TABLE public.addon_integration_config ENABLE ROW LEVEL SECURITY;

-- BEWUSST keine Policy für authenticated → kein Klartext-Secret-Leak an Customer.
-- Aller Zugriff läuft über die SECURITY-DEFINER-RPCs unten.
DROP POLICY IF EXISTS "addon_integration_config_no_authenticated" ON public.addon_integration_config;

-- service_role-Grant (Top-Fallstrick #12) für den EF-Lesepfad via RPC.
GRANT SELECT, INSERT, UPDATE ON public.addon_integration_config TO service_role;

-- ─── RPC: get_addon_secret (nur service_role — EF-Pfad) ──────────────────────
CREATE OR REPLACE FUNCTION public.get_addon_secret(p_slug text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.secret
  FROM public.addon_integration_config c
  JOIN public.addons a ON a.id = c.addon_id
  WHERE a.slug = p_slug;
$function$;

COMMENT ON FUNCTION public.get_addon_secret(text) IS
  'Sprint N.2: Liefert das zentrale Secret eines Add-ons (z.B. Auralis-Enterprise-Key) an den EF-Pfad. NUR service_role.';

REVOKE EXECUTE ON FUNCTION public.get_addon_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_addon_secret(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_addon_secret(text) TO service_role;

-- ─── RPC: admin_list_addon_integrations (is_leadesk_admin) ────────────────────
-- Liefert ALLE aktiven Add-ons + Konfig-Status. Secret NIE im Klartext,
-- nur is_configured + secret_last4 für die UI.
CREATE OR REPLACE FUNCTION public.admin_list_addon_integrations()
RETURNS TABLE (
  addon_id      uuid,
  slug          text,
  name          text,
  type          text,
  is_configured boolean,
  secret_last4  text,
  config        jsonb,
  updated_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  RETURN QUERY
  SELECT a.id, a.slug, a.name, a.type,
         (c.secret IS NOT NULL AND length(c.secret) > 0)                            AS is_configured,
         CASE WHEN c.secret IS NOT NULL AND length(c.secret) >= 4
              THEN right(c.secret, 4) ELSE NULL END                                 AS secret_last4,
         COALESCE(c.config, '{}'::jsonb)                                            AS config,
         c.updated_at
  FROM public.addons a
  LEFT JOIN public.addon_integration_config c ON c.addon_id = a.id
  WHERE a.is_active = true
  ORDER BY a.sort_order, a.name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_list_addon_integrations() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_list_addon_integrations() TO authenticated;

-- ─── RPC: admin_set_addon_integration (is_leadesk_admin) ──────────────────────
-- p_secret-Semantik:
--   NULL  → Secret unverändert lassen (nur Config-Update)
--   ''    → Secret löschen
--   sonst → Secret setzen
-- p_config NULL → Config unverändert lassen.
CREATE OR REPLACE FUNCTION public.admin_set_addon_integration(
  p_slug   text,
  p_secret text DEFAULT NULL,
  p_config jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_addon_id uuid;
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  SELECT id INTO v_addon_id FROM public.addons WHERE slug = p_slug;
  IF v_addon_id IS NULL THEN
    RAISE EXCEPTION 'addon not found: %', p_slug;
  END IF;

  INSERT INTO public.addon_integration_config (addon_id, secret, config, updated_at, updated_by)
  VALUES (
    v_addon_id,
    NULLIF(p_secret, ''),               -- '' → NULL (Clear), NULL → NULL (initial leer)
    COALESCE(p_config, '{}'::jsonb),
    now(),
    auth.uid()
  )
  ON CONFLICT (addon_id) DO UPDATE
    SET secret = CASE
                   WHEN p_secret IS NULL THEN public.addon_integration_config.secret  -- unverändert
                   ELSE NULLIF(p_secret, '')                                          -- setzen/clearen
                 END,
        config = COALESCE(p_config, public.addon_integration_config.config),
        updated_at = now(),
        updated_by = auth.uid();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_set_addon_integration(text, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_addon_integration(text, text, jsonb) TO authenticated;

-- ─── Verifikation ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_has_grant boolean;
BEGIN
  PERFORM 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'addon_integration_config';
  IF NOT FOUND THEN RAISE EXCEPTION 'N.2 verify: Tabelle addon_integration_config fehlt'; END IF;

  PERFORM 1 FROM pg_proc WHERE proname = 'get_addon_secret' AND pronamespace = 'public'::regnamespace;
  IF NOT FOUND THEN RAISE EXCEPTION 'N.2 verify: get_addon_secret fehlt'; END IF;
  PERFORM 1 FROM pg_proc WHERE proname = 'admin_set_addon_integration' AND pronamespace = 'public'::regnamespace;
  IF NOT FOUND THEN RAISE EXCEPTION 'N.2 verify: admin_set_addon_integration fehlt'; END IF;

  SELECT has_function_privilege('service_role', 'public.get_addon_secret(text)', 'EXECUTE') INTO v_has_grant;
  IF NOT v_has_grant THEN RAISE EXCEPTION 'N.2 verify: service_role darf get_addon_secret nicht ausführen'; END IF;

  RAISE NOTICE 'Sprint N.2 (addon_integration_config) verification PASSED';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
