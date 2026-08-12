-- ============================================================================
-- Granulare LinkedIn-Freigabe — SLICE B (RLS-Rewrite). NICHT verhaltensneutral:
-- ab hier gaten die 24 Policies pro Bereich über has_brand_linkedin_scope.
-- Faithful: jeder Qual bleibt identisch, NUR has_brand_access(bv) → has_brand_
-- linkedin_scope(bv,'<area>'); der Null-Brand-Zweig (OR (bv IS NULL AND …))
-- bleibt unverändert. Kind-Tabellen (la_steps, linkedin_chat_messages) resolven
-- den Scope über den Parent-Join. inbox_lists/inbox_list_members NICHT gescoped
-- (P3: Listen-Freigabe ist ein bewusster engerer Grant). unipile_accounts =
-- Zugriff bei >=1 Scope (Veto-Entscheidung).
-- Voraussetzung: Slice A (Helper) appliziert.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- ══════════════ INBOX (Postfach/Kommunikation) ═══════════════════════════════
DROP POLICY IF EXISTS linkedin_chats_brand ON public.linkedin_chats;
CREATE POLICY linkedin_chats_brand ON public.linkedin_chats FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'inbox') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'inbox') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));

DROP POLICY IF EXISTS linkedin_chat_messages_via_chat ON public.linkedin_chat_messages;
CREATE POLICY linkedin_chat_messages_via_chat ON public.linkedin_chat_messages FOR ALL
  USING (chat_id IN (SELECT c.id FROM linkedin_chats c
     WHERE has_brand_linkedin_scope(c.brand_voice_id,'inbox') OR ((c.brand_voice_id IS NULL) AND user_in_team(c.team_id))))
  WITH CHECK (chat_id IN (SELECT c.id FROM linkedin_chats c
     WHERE has_brand_linkedin_scope(c.brand_voice_id,'inbox') OR ((c.brand_voice_id IS NULL) AND user_in_team(c.team_id))));

DROP POLICY IF EXISTS linkedin_messages_brand ON public.linkedin_messages;
CREATE POLICY linkedin_messages_brand ON public.linkedin_messages FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'inbox') OR ((brand_voice_id IS NULL) AND ((team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = uid())) OR ((team_id IS NULL) AND (user_id = uid())))))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'inbox') OR ((brand_voice_id IS NULL) AND ((team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = uid())) OR ((team_id IS NULL) AND (user_id = uid())))));

DROP POLICY IF EXISTS linkedin_messaging_metrics_brand_read ON public.linkedin_messaging_metrics;
CREATE POLICY linkedin_messaging_metrics_brand_read ON public.linkedin_messaging_metrics FOR SELECT
  USING (has_brand_linkedin_scope(brand_voice_id,'inbox') OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));

DROP POLICY IF EXISTS linkedin_invitations_brand ON public.linkedin_invitations;
CREATE POLICY linkedin_invitations_brand ON public.linkedin_invitations FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'inbox') OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'inbox') OR ((brand_voice_id IS NULL) AND (user_id = uid())));

-- ══════════════ NETWORK (Prospects & Verbindungen) ═══════════════════════════
DROP POLICY IF EXISTS linkedin_inbox_brand ON public.linkedin_inbox;
CREATE POLICY linkedin_inbox_brand ON public.linkedin_inbox FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'network') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'network') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));

DROP POLICY IF EXISTS linkedin_connections_brand ON public.linkedin_connections;
CREATE POLICY linkedin_connections_brand ON public.linkedin_connections FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'network') OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'network') OR ((brand_voice_id IS NULL) AND (user_id = uid())));

-- ══════════════ SEARCH (Suche / Sales-Navigator) ════════════════════════════
DROP POLICY IF EXISTS linkedin_searches_brand ON public.linkedin_searches;
CREATE POLICY linkedin_searches_brand ON public.linkedin_searches FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'search') OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'search') OR ((brand_voice_id IS NULL) AND (user_id = uid())));

-- ══════════════ AUTOMATION (Sequenzen) ══════════════════════════════════════
DROP POLICY IF EXISTS la_campaigns_brand ON public.la_campaigns;
CREATE POLICY la_campaigns_brand ON public.la_campaigns FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'automation') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'automation') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));

DROP POLICY IF EXISTS la_steps_brand ON public.la_steps;
CREATE POLICY la_steps_brand ON public.la_steps FOR ALL
  USING (EXISTS (SELECT 1 FROM la_campaigns c WHERE c.id = la_steps.campaign_id
     AND (has_brand_linkedin_scope(c.brand_voice_id,'automation') OR ((c.brand_voice_id IS NULL) AND user_in_team(c.team_id)))))
  WITH CHECK (EXISTS (SELECT 1 FROM la_campaigns c WHERE c.id = la_steps.campaign_id
     AND (has_brand_linkedin_scope(c.brand_voice_id,'automation') OR ((c.brand_voice_id IS NULL) AND user_in_team(c.team_id)))));

DROP POLICY IF EXISTS la_enrollments_brand ON public.la_enrollments;
CREATE POLICY la_enrollments_brand ON public.la_enrollments FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'automation') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'automation') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));

DROP POLICY IF EXISTS la_jobs_brand ON public.la_jobs;
CREATE POLICY la_jobs_brand ON public.la_jobs FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'automation') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'automation') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));

DROP POLICY IF EXISTS la_audiences_brand ON public.la_audiences;
CREATE POLICY la_audiences_brand ON public.la_audiences FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'automation') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'automation') OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));

-- la_accounts: der brand_voices-Subquery-Zweig leakt (P4) → auf Scope umstellen.
-- team_all (user_in_team) bleibt (Owner-Team, kein Shared-Team-Leak).
DROP POLICY IF EXISTS la_accounts_brand_select ON public.la_accounts;
CREATE POLICY la_accounts_brand_select ON public.la_accounts FOR SELECT
  USING ((brand_voice_id IS NOT NULL) AND has_brand_linkedin_scope(brand_voice_id,'automation'));

-- ══════════════ ENGAGEMENT ══════════════════════════════════════════════════
DROP POLICY IF EXISTS linkedin_engagement_brand ON public.linkedin_engagement_jobs;
CREATE POLICY linkedin_engagement_brand ON public.linkedin_engagement_jobs FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'engagement') OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'engagement') OR ((brand_voice_id IS NULL) AND (user_id = uid())));

DROP POLICY IF EXISTS linkedin_engagers_brand ON public.linkedin_post_engagers;
CREATE POLICY linkedin_engagers_brand ON public.linkedin_post_engagers FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'engagement') OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'engagement') OR ((brand_voice_id IS NULL) AND (user_id = uid())));

-- ══════════════ ANALYTICS ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS linkedin_network_metrics_brand_read ON public.linkedin_network_metrics;
CREATE POLICY linkedin_network_metrics_brand_read ON public.linkedin_network_metrics FOR SELECT
  USING (has_brand_linkedin_scope(brand_voice_id,'analytics') OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));

DROP POLICY IF EXISTS linkedin_page_metrics_brand_read ON public.linkedin_page_metrics;
CREATE POLICY linkedin_page_metrics_brand_read ON public.linkedin_page_metrics FOR SELECT
  USING (has_brand_linkedin_scope(brand_voice_id,'analytics') OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));

DROP POLICY IF EXISTS linkedin_profile_metrics_brand_read ON public.linkedin_profile_metrics;
CREATE POLICY linkedin_profile_metrics_brand_read ON public.linkedin_profile_metrics FOR SELECT
  USING (has_brand_linkedin_scope(brand_voice_id,'analytics') OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));

DROP POLICY IF EXISTS lpv_brand_read ON public.linkedin_profile_viewers;
CREATE POLICY lpv_brand_read ON public.linkedin_profile_viewers FOR SELECT
  USING (has_brand_linkedin_scope(brand_voice_id,'analytics') OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));

DROP POLICY IF EXISTS lpv_brand_write ON public.linkedin_profile_viewers;
CREATE POLICY lpv_brand_write ON public.linkedin_profile_viewers FOR UPDATE
  USING (has_brand_linkedin_scope(brand_voice_id,'analytics') OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));

DROP POLICY IF EXISTS ssi_brand ON public.ssi_scores;
CREATE POLICY ssi_brand ON public.ssi_scores FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'analytics') OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'analytics') OR ((brand_voice_id IS NULL) AND (user_id = uid())));

DROP POLICY IF EXISTS pc_brand ON public.profile_checks;
CREATE POLICY pc_brand ON public.profile_checks FOR ALL
  USING (has_brand_linkedin_scope(brand_voice_id,'analytics') OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_linkedin_scope(brand_voice_id,'analytics') OR ((brand_voice_id IS NULL) AND (user_id = uid())));

-- ══════════════ CONNECTION (unipile_accounts = Zugriff bei >=1 Scope) ════════
-- Drift-robust: Prod-Policy heisst unipile_accounts_brand (has_brand_access),
-- Staging unipile_accounts_brand_select (brand_voices-Subquery) — BEIDE droppen,
-- sonst bleibt die leaky Alt-Policy als zweite PERMISSIVE-Policy stehen.
DROP POLICY IF EXISTS unipile_accounts_brand ON public.unipile_accounts;
DROP POLICY IF EXISTS unipile_accounts_brand_select ON public.unipile_accounts;
CREATE POLICY unipile_accounts_brand ON public.unipile_accounts FOR SELECT
  USING (
    (has_brand_linkedin_scope(brand_voice_id,'inbox')
     OR has_brand_linkedin_scope(brand_voice_id,'network')
     OR has_brand_linkedin_scope(brand_voice_id,'search')
     OR has_brand_linkedin_scope(brand_voice_id,'automation')
     OR has_brand_linkedin_scope(brand_voice_id,'engagement')
     OR has_brand_linkedin_scope(brand_voice_id,'analytics'))
    OR ((brand_voice_id IS NULL) AND user_in_team(team_id))
  );

COMMIT;

-- ── Verifikation: KEIN has_brand_access( mehr auf LinkedIn-Daten ─────────────
\echo '--- Verify: verbliebene has_brand_access-Policies auf LinkedIn-Tabellen (erwartet: 0) ---'
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public'
  AND (qual LIKE '%has_brand_access%' OR with_check LIKE '%has_brand_access%')
  AND tablename LIKE ANY(ARRAY['linkedin_%','la_%','ssi_scores','profile_checks','unipile_accounts'])
  AND tablename NOT IN ('inbox_lists','inbox_list_members');
\echo '--- Verify: brand_voices-Subquery-Leak-Rest (erwartet: 0) ---'
SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'
  AND qual LIKE '%SELECT%brand_voices%' AND qual NOT LIKE '%has_brand_linkedin_scope%' AND qual NOT LIKE '%has_brand_access%'
  AND tablename LIKE ANY(ARRAY['linkedin_%','la_%','ssi_scores','unipile_accounts','profile_checks']);

NOTIFY pgrst, 'reload schema';
