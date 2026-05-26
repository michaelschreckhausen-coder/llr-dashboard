-- 2026-05-27 — Phase E — email_send_log CREATE auf Staging
--
-- Staging hatte die Tabelle gar nicht ("Error counting email_send_log:
-- relation does not exist"). Prod hat sie mit 1 row + 2 RLS-Policies.
-- 16 Cols für Postmark-Audit-Trail.
--
-- Migration legt Tabelle + Policies idempotent an. Niedriges Risiko
-- (Tabelle wird neu, kein Data-Migrations-Pfad nötig).
--
-- Frontend-Impact: Tabelle wird vom send-email-Edge-Function geschrieben
-- (service_role-Bypass). Frontend liest nur über is_leadesk_admin-Admin-Tools.
-- Keine direkten REST-Calls aus dem Customer-Frontend.

BEGIN;

-- ─── Step 1: CREATE TABLE ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  triggered_by_user   uuid,
  triggered_by_role   text,
  recipient           text NOT NULL,
  sender              text NOT NULL,
  subject             text NOT NULL,
  template_key        text,
  template_variables  jsonb,
  postmark_message_id text,
  postmark_error_code integer,
  postmark_response   jsonb,
  status              text NOT NULL DEFAULT 'pending'::text,
  failed_reason       text,
  tag                 text,
  metadata            jsonb
);

-- ─── Step 2: RLS aktivieren ────────────────────────────────────────────────

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

-- ─── Step 3: Grants für authenticated-Role (Hetzner-Convention) ────────────
-- Per CLAUDE.md: Hetzner-Self-Host braucht explizite Grants pro neuer Tabelle.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_send_log TO authenticated;
GRANT SELECT ON public.email_send_log TO service_role;

-- ─── Step 4: RLS-Policies (Prod-Style: 2 SELECT-Policies) ──────────────────

DROP POLICY IF EXISTS leadesk_admin_full_read ON public.email_send_log;
CREATE POLICY leadesk_admin_full_read ON public.email_send_log
  FOR SELECT USING (
    COALESCE(
      (((auth.jwt() -> 'app_metadata'::text) ->> 'is_leadesk_admin'::text))::boolean,
      false
    ) = true
  );

DROP POLICY IF EXISTS user_own_sends_read ON public.email_send_log;
CREATE POLICY user_own_sends_read ON public.email_send_log
  FOR SELECT USING (triggered_by_user = auth.uid());

-- ─── Step 5: Verifikation ──────────────────────────────────────────────────

DO $$
DECLARE
  has_table      boolean;
  has_rls        boolean;
  policy_count   integer;
  col_count      integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_send_log') INTO has_table;
  SELECT relrowsecurity FROM pg_class WHERE relname='email_send_log' AND relnamespace='public'::regnamespace INTO has_rls;
  SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='email_send_log' INTO policy_count;
  SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='email_send_log' INTO col_count;

  IF NOT has_table     THEN RAISE EXCEPTION 'email_send_log table missing'; END IF;
  IF NOT has_rls       THEN RAISE EXCEPTION 'RLS not enabled'; END IF;
  IF policy_count != 2 THEN RAISE EXCEPTION 'expected 2 policies, got %', policy_count; END IF;
  IF col_count != 16   THEN RAISE EXCEPTION 'expected 16 cols, got %', col_count; END IF;

  RAISE NOTICE 'Phase E verification PASSED — email_send_log created with % cols + 2 policies', col_count;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
