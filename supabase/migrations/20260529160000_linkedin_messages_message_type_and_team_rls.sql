-- 20260529160000_linkedin_messages_message_type_and_team_rls.sql
--
-- Phase 0 des Messages-Redesign-Sprints (2026-05-29).
--
-- Zwei Änderungen an public.linkedin_messages:
--
--   1) message_type text (NULL-able) + CHECK-Constraint auf Whitelist
--      ('vernetzung' | 'first_message' | 'sales_pitch'). NULL-able weil
--      direction='inbound'-Rows (Extension-Imports von LinkedIn-DMs) keinen
--      dieser drei Outbound-Typen besitzen. Frontend setzt den Wert nur für
--      neue Outbound-Gens.
--
--   2) RLS-Refactor: alle 5 Legacy-Policies (msg_select/insert/update/delete
--      + linkedin_messages_own) werden gedroppt und durch eine einzige
--      team-scoped Policy ersetzt. Solo-Pfad (team_id IS NULL AND
--      user_id = auth.uid()) bleibt erhalten für User ohne Team-Membership.
--      Plus GRANT SELECT ON team_members TO authenticated (Top-Fallstrick #3)
--      damit die Sub-Query nicht stumm 0 Rows zurückgibt.
--
-- Idempotenz:
--   - ADD COLUMN IF NOT EXISTS
--   - DROP CONSTRAINT IF EXISTS vor jedem ADD
--   - DROP POLICY IF EXISTS vor CREATE POLICY
--   - CREATE INDEX IF NOT EXISTS
--   - GRANTs sind grundsätzlich idempotent
--
-- Pre-Flight: nicht nötig, alle Statements sind non-destructive für Daten.
-- Bestehende Rows (0 auf beiden Envs aktuell) bekommen message_type=NULL,
-- was die CHECK-Constraint explizit erlaubt.

BEGIN;

-- ─── 1) message_type-Spalte ──────────────────────────────────────────────────
ALTER TABLE public.linkedin_messages
  ADD COLUMN IF NOT EXISTS message_type text;

-- CHECK-Constraint (idempotent via DROP + ADD)
ALTER TABLE public.linkedin_messages
  DROP CONSTRAINT IF EXISTS linkedin_messages_type_check;

ALTER TABLE public.linkedin_messages
  ADD CONSTRAINT linkedin_messages_type_check
  CHECK (
    message_type IS NULL
    OR message_type IN ('vernetzung', 'first_message', 'sales_pitch')
  );

-- Partial Index für Type-Filter im Verlauf (team_id + type)
CREATE INDEX IF NOT EXISTS idx_linkedin_messages_team_type
  ON public.linkedin_messages (team_id, message_type)
  WHERE team_id IS NOT NULL AND message_type IS NOT NULL;

-- ─── 2) RLS-Refactor ─────────────────────────────────────────────────────────

-- 2a) Legacy-Policies droppen (msg_* aus Prod, linkedin_messages_own aus beiden)
DROP POLICY IF EXISTS msg_select            ON public.linkedin_messages;
DROP POLICY IF EXISTS msg_insert            ON public.linkedin_messages;
DROP POLICY IF EXISTS msg_update            ON public.linkedin_messages;
DROP POLICY IF EXISTS msg_delete            ON public.linkedin_messages;
DROP POLICY IF EXISTS linkedin_messages_own ON public.linkedin_messages;

-- 2b) Neue team-scoped Policy (mit Solo-Fallback für team-lose User)
CREATE POLICY linkedin_messages_team_scoped
  ON public.linkedin_messages
  FOR ALL
  USING (
    team_id IN (
      SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
    OR (team_id IS NULL AND user_id = auth.uid())
  )
  WITH CHECK (
    team_id IN (
      SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
    OR (team_id IS NULL AND user_id = auth.uid())
  );

-- ─── 3) Grant-Hygiene (Top-Fallstricke #3 + #12) ────────────────────────────
-- team_members für Cross-Table-RLS-Sub-Query
GRANT SELECT ON public.team_members TO authenticated;

-- linkedin_messages selbst für authenticated (App) + service_role (Edge Functions)
GRANT ALL ON public.linkedin_messages TO authenticated;
GRANT ALL ON public.linkedin_messages TO service_role;

-- ─── 4) PostgREST schema cache reload ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
