-- 20260611100000_leads_team_visibility_relax_is_shared.sql
--
-- Team-Sichtbarkeit von Leads: is_shared-Requirement aus leads_team_select +
-- leads_team_update entfernen. Team-Mitgliedschaft allein gewaehrt jetzt
-- Sichtbarkeit + Edit (get_my_team_ids() ist SECURITY DEFINER -> recursion-safe).
--
-- Hintergrund: Die Phase-G-Policy (20260527150000) verlangte is_shared=true fuer
-- Team-Member-Sichtbarkeit. Leads werden aber mit is_shared=false angelegt ->
-- systemisches Sichtbarkeits-Loch (Team-Member sahen Team-Leads nicht; ~97 aktive
-- Leads ueber 5 Teams unsichtbar). Auf Prod (128.140.123.163) direkt am
-- 2026-06-10 relaxed; diese Migration ist der Repo-Record + bringt Staging auf
-- denselben Stand.
--
-- Idempotent: guarded ALTER POLICY (IF EXISTS) + Assertion (is_shared darf danach
-- in keinem USING-Praedikat mehr stehen, sonst Rollback). Beruehrt NICHT die
-- redundanten Policies leads_owner/own_leads oder die team_members-Dupes.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.leads'::regclass AND polname='leads_team_select') THEN
    ALTER POLICY leads_team_select ON public.leads
      USING ( user_id = auth.uid() OR team_id = ANY (get_my_team_ids()) );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.leads'::regclass AND polname='leads_team_update') THEN
    ALTER POLICY leads_team_update ON public.leads
      USING ( user_id = auth.uid() OR team_id = ANY (get_my_team_ids()) );
  END IF;
END $$;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM pg_policy
  WHERE polrelid='public.leads'::regclass
    AND polname IN ('leads_team_select','leads_team_update')
    AND pg_get_expr(polqual, polrelid) ILIKE '%is_shared%';
  IF bad > 0 THEN RAISE EXCEPTION 'is_shared noch in % Policy-Praedikaten -> Rollback', bad; END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
