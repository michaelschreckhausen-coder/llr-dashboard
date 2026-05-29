-- 20260521140000_webinar_registrations.sql
--
-- Webinar-Anmeldungen vom Marketing-Site (leadesk.de).
--
-- Eine Tabelle (Leadesk-intern, nicht Multi-Tenant — gehört keinem Customer-Account):
--   webinar_registrations
--
-- Auth-Modell:
--   - INSERT: NUR über Edge Function `webinar-register` (service_role, bypasst RLS).
--     Kein authenticated/anon-INSERT — sonst kann jeder Spam-Anmeldungen aus dem
--     Browser an PostgREST schicken.
--   - SELECT/UPDATE/DELETE: nur is_leadesk_admin-JWT-Claim via RPCs.
--
-- Top-Fallstrick #12 (service_role-Grants explizit für Hetzner) berücksichtigt.
-- Top-Fallstrick #3 (cross-table RLS subquery) nicht relevant (keine FK-Subqueries).
--
-- Workflow:
--   1. Staging-Apply:
--        ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres' \
--          < supabase/migrations/20260521140000_webinar_registrations.sql
--   2. NOTIFY pgrst, 'reload schema';
--   3. Smoke (als is_leadesk_admin):
--        SELECT * FROM public.get_webinar_registrations('2026-06-05-leadesk');
--   4. Erst nach Bestätigung: gleicher Apply auf Prod (128.140.123.163).

BEGIN;

-- ─── Tabelle ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webinar_registrations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_slug        text        NOT NULL,
  first_name          text        NOT NULL,
  last_name           text        NOT NULL,
  email               text        NOT NULL,
  consent_marketing   boolean     NOT NULL DEFAULT false,
  source              text,                              -- z.B. 'leadesk.de-banner'
  ip                  text,                              -- inet wäre nice-to-have, text reicht
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT webinar_registrations_first_name_len
    CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 100),
  CONSTRAINT webinar_registrations_last_name_len
    CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 100),
  CONSTRAINT webinar_registrations_email_shape
    CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT webinar_registrations_email_len
    CHECK (char_length(email) <= 254),
  CONSTRAINT webinar_registrations_slug_shape
    CHECK (webinar_slug ~ '^[a-z0-9][a-z0-9-]{0,80}$')
);

-- Case-insensitive Dedup (eine Anmeldung pro Webinar pro E-Mail)
CREATE UNIQUE INDEX IF NOT EXISTS webinar_registrations_slug_email_uidx
  ON public.webinar_registrations (webinar_slug, lower(email));

CREATE INDEX IF NOT EXISTS webinar_registrations_slug_created_idx
  ON public.webinar_registrations (webinar_slug, created_at DESC);

COMMENT ON TABLE  public.webinar_registrations IS
  'Leadesk-Webinar-Anmeldungen vom Marketing-Site. Schreib-Pfad nur via Edge Function. Lese-Pfad nur via is_leadesk_admin-RPCs.';
COMMENT ON COLUMN public.webinar_registrations.webinar_slug IS
  'Stabile Webinar-Kennung, z.B. ''2026-06-05-leadesk'' (lowercase, kebab-case).';

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.webinar_registrations ENABLE ROW LEVEL SECURITY;

-- Alle authenticated/anon-Operationen blocken. Keine Policy = kein Zugriff
-- (RLS-Default). Wir nehmen ALLE expliziten Privs für die beiden Rollen weg —
-- Hetzner-Default-Grants greifen sonst.

REVOKE ALL ON public.webinar_registrations FROM anon;
REVOKE ALL ON public.webinar_registrations FROM authenticated;

-- service_role bypasst RLS, braucht aber explizite Grants (Top-Fallstrick #12).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_registrations TO service_role;

-- ─── RPC: get_webinar_registrations ─────────────────────────────────────────
-- is_leadesk_admin-only Read-Pfad. Liefert alle Anmeldungen, optional gefiltert.

DROP FUNCTION IF EXISTS public.get_webinar_registrations(text);

CREATE OR REPLACE FUNCTION public.get_webinar_registrations(p_webinar_slug text DEFAULT NULL)
RETURNS TABLE (
  id                uuid,
  webinar_slug      text,
  first_name        text,
  last_name         text,
  email             text,
  consent_marketing boolean,
  source            text,
  ip                text,
  user_agent        text,
  created_at        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  RETURN QUERY
    SELECT  r.id, r.webinar_slug, r.first_name, r.last_name, r.email,
            r.consent_marketing, r.source, r.ip, r.user_agent, r.created_at
    FROM    public.webinar_registrations r
    WHERE   (p_webinar_slug IS NULL OR r.webinar_slug = p_webinar_slug)
    ORDER BY r.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_webinar_registrations(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_webinar_registrations(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_webinar_registrations(text) IS
  'Liefert Webinar-Anmeldungen. Auth: is_leadesk_admin-JWT-Claim. NULL-Slug = alle Webinare.';

-- ─── RPC: list_webinars ──────────────────────────────────────────────────────
-- Übersicht aller Webinare mit Anmeldungs-Count und letzter Anmeldung.

DROP FUNCTION IF EXISTS public.list_webinars();

CREATE OR REPLACE FUNCTION public.list_webinars()
RETURNS TABLE (
  webinar_slug         text,
  registration_count   bigint,
  first_registration   timestamptz,
  last_registration    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  RETURN QUERY
    SELECT  r.webinar_slug,
            count(*)::bigint        AS registration_count,
            min(r.created_at)       AS first_registration,
            max(r.created_at)       AS last_registration
    FROM    public.webinar_registrations r
    GROUP BY r.webinar_slug
    ORDER BY max(r.created_at) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_webinars() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_webinars() TO authenticated, service_role;

COMMENT ON FUNCTION public.list_webinars() IS
  'Liste aller Webinare mit Anmeldungs-Count. Auth: is_leadesk_admin-JWT-Claim.';

-- ─── RPC: delete_webinar_registration ───────────────────────────────────────
-- Single-Row-Delete für DSGVO-Right-to-Erasure-Anfragen.

DROP FUNCTION IF EXISTS public.delete_webinar_registration(uuid);

CREATE OR REPLACE FUNCTION public.delete_webinar_registration(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  DELETE FROM public.webinar_registrations WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_webinar_registration(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_webinar_registration(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_webinar_registration(uuid) IS
  'DSGVO-Right-to-Erasure-Delete einer einzelnen Anmeldung. Auth: is_leadesk_admin-JWT-Claim.';

-- ─── Schema-Reload-Notify ───────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;
