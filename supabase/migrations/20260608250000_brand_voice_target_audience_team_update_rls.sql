-- 20260608250000_brand_voice_target_audience_team_update_rls.sql
--
-- Gleicher Bug wie bei knowledge_base (20260608240000): brand_voices und
-- target_audiences hatten owner-only UPDATE-Policies (aus 20260529170000),
-- d.h. Team-Mitglieder sahen team-geteilte Brand Voices / Zielgruppen, konnten
-- sie aber nicht aendern -> Update traf 0 Zeilen, ohne Fehler.
--
-- Fix: UPDATE-Policy je Tabelle auf das Visibility-Modell erweitern
-- (Owner OR team-shared im eigenen Team OR explizit geteilt). WITH CHECK identisch.
--
-- Idempotent. Setzt 20260529170000_selective_sharing voraus
-- (brand_voice_shares / target_audience_shares existieren).

BEGIN;

-- ── brand_voices ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS brand_voices_owner_update ON public.brand_voices;
DROP POLICY IF EXISTS brand_voices_team_update  ON public.brand_voices;
CREATE POLICY brand_voices_team_update ON public.brand_voices FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (is_shared = true AND team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()))
    OR id IN (SELECT brand_voice_id FROM public.brand_voice_shares WHERE user_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (is_shared = true AND team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()))
    OR id IN (SELECT brand_voice_id FROM public.brand_voice_shares WHERE user_id = auth.uid())
  );

-- ── target_audiences ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS target_audiences_owner_update ON public.target_audiences;
DROP POLICY IF EXISTS target_audiences_team_update  ON public.target_audiences;
CREATE POLICY target_audiences_team_update ON public.target_audiences FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (is_shared = true AND team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()))
    OR id IN (SELECT target_audience_id FROM public.target_audience_shares WHERE user_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (is_shared = true AND team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()))
    OR id IN (SELECT target_audience_id FROM public.target_audience_shares WHERE user_id = auth.uid())
  );

GRANT SELECT ON public.team_members TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
