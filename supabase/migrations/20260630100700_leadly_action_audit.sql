-- 20260630100700_leadly_action_audit.sql
-- Audit-Log für von Leadly AUSGEFÜHRTE (bestätigte) schreibende Aktionen.
-- Phase 1 Guardrail: keine schreibende/außenwirksame Aktion ohne explizite
-- Bestätigung — jede bestätigte Ausführung wird hier protokolliert (wer/was/wann).
-- Insert läuft service-role-seitig aus der leadly-Edge-Function; Lesen team-scoped.

BEGIN;

CREATE TABLE IF NOT EXISTS public.leadly_action_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  team_id     uuid,
  account_id  uuid,
  tool_name   text NOT NULL,
  tool_input  jsonb,
  result      jsonb,
  ok          boolean,
  confirmed   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leadly_action_audit ENABLE ROW LEVEL SECURITY;

-- Lesen: eigene Einträge ODER Einträge des aktiven Teams. Kein Insert/Update/Delete
-- für authenticated (nur die EF via service_role schreibt).
DROP POLICY IF EXISTS leadly_audit_select ON public.leadly_action_audit;
CREATE POLICY leadly_audit_select ON public.leadly_action_audit
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

-- Self-Host: explizite Grants (RLS allein reicht ohne Default-Grant nicht).
GRANT SELECT ON public.leadly_action_audit TO authenticated;
GRANT ALL    ON public.leadly_action_audit TO service_role;
-- Cross-Table-Policy braucht Lesezugriff auf team_members (Top-Fallstrick #3).
GRANT SELECT ON public.team_members TO authenticated;

CREATE INDEX IF NOT EXISTS idx_leadly_audit_team_created
  ON public.leadly_action_audit (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leadly_audit_user_created
  ON public.leadly_action_audit (user_id, created_at DESC);

COMMIT;

NOTIFY pgrst, 'reload schema';
