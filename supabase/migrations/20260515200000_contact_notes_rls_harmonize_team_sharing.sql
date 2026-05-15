-- Migration: contact_notes RLS-Harmonisierung — Team-Sharing-Pattern
--
-- Ziel: Staging und Prod auf identisches Team-Sharing-Policy-Pattern bringen.
-- Staging hatte 1 OR-Clause-Policy, Prod hat 7 granulare Policies.
-- Wir spiegeln Prod-Pattern auf Staging (Prod-Apply ist no-op).
--
-- Was diese Migration BEWUSST NICHT macht (separate Issues):
--   • lead_id NOT NULL Constraint — braucht NULL-Row-Audit + Cleanup
--   • deal_id-Spalte ergänzen — separate Schema-Sync
--   • is_pinned/is_private/created_at/updated_at NOT NULL — Defaults defer
--   • Sekundär-Indices

BEGIN;

-- ── Block 1: Helper-Funktion (auf Staging neu, auf Prod CREATE OR REPLACE no-op) ──
CREATE OR REPLACE FUNCTION public.crm_is_team_member(p_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = p_team_id AND user_id = auth.uid()); $$;

-- ── Block 2: team_id-FK ergänzen (Staging hatte FK nicht, Prod hat) ──
DO $$ BEGIN
  ALTER TABLE public.contact_notes
    ADD CONSTRAINT contact_notes_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Block 3: Alte Staging-Policy droppen ──
DROP POLICY IF EXISTS contact_notes_user_team ON public.contact_notes;

-- ── Block 4: 7 Policies (Prod-Pattern), idempotent ──
DROP POLICY IF EXISTS cn_insert         ON public.contact_notes;
DROP POLICY IF EXISTS cn_select         ON public.contact_notes;
DROP POLICY IF EXISTS cn_update         ON public.contact_notes;
DROP POLICY IF EXISTS team_notes_insert ON public.contact_notes;
DROP POLICY IF EXISTS team_notes_select ON public.contact_notes;
DROP POLICY IF EXISTS team_notes_update ON public.contact_notes;
DROP POLICY IF EXISTS team_notes_delete ON public.contact_notes;

CREATE POLICY cn_insert         ON public.contact_notes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY cn_select         ON public.contact_notes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY cn_update         ON public.contact_notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY team_notes_insert ON public.contact_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_team_member(team_id));

CREATE POLICY team_notes_select ON public.contact_notes
  FOR SELECT TO authenticated
  USING (
    public.crm_is_team_member(team_id)
    AND (is_private = false OR user_id = auth.uid())
  );

CREATE POLICY team_notes_update ON public.contact_notes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY team_notes_delete ON public.contact_notes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── Block 5: Grants (Hetzner-Hotfix Pattern, idempotent) ──
GRANT ALL ON public.contact_notes TO authenticated;

COMMIT;
