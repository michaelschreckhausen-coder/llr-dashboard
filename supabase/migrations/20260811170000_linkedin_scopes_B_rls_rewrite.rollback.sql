-- ROLLBACK Slice B — Original-Policies (has_brand_access) wiederherstellen.
-- Stellt exakt den Vor-B-Zustand her (verhaltensneutral zu Slice A).
\set ON_ERROR_STOP on
BEGIN;

-- INBOX
DROP POLICY IF EXISTS linkedin_chats_brand ON public.linkedin_chats;
CREATE POLICY linkedin_chats_brand ON public.linkedin_chats FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));
DROP POLICY IF EXISTS linkedin_chat_messages_via_chat ON public.linkedin_chat_messages;
CREATE POLICY linkedin_chat_messages_via_chat ON public.linkedin_chat_messages FOR ALL
  USING (chat_id IN (SELECT c.id FROM linkedin_chats c WHERE has_brand_access(c.brand_voice_id) OR ((c.brand_voice_id IS NULL) AND user_in_team(c.team_id))))
  WITH CHECK (chat_id IN (SELECT c.id FROM linkedin_chats c WHERE has_brand_access(c.brand_voice_id) OR ((c.brand_voice_id IS NULL) AND user_in_team(c.team_id))));
DROP POLICY IF EXISTS linkedin_messages_brand ON public.linkedin_messages;
CREATE POLICY linkedin_messages_brand ON public.linkedin_messages FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND ((team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = uid())) OR ((team_id IS NULL) AND (user_id = uid())))))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND ((team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = uid())) OR ((team_id IS NULL) AND (user_id = uid())))));
DROP POLICY IF EXISTS linkedin_messaging_metrics_brand_read ON public.linkedin_messaging_metrics;
CREATE POLICY linkedin_messaging_metrics_brand_read ON public.linkedin_messaging_metrics FOR SELECT
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));
DROP POLICY IF EXISTS linkedin_invitations_brand ON public.linkedin_invitations;
CREATE POLICY linkedin_invitations_brand ON public.linkedin_invitations FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())));

-- NETWORK
DROP POLICY IF EXISTS linkedin_inbox_brand ON public.linkedin_inbox;
CREATE POLICY linkedin_inbox_brand ON public.linkedin_inbox FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));
DROP POLICY IF EXISTS linkedin_connections_brand ON public.linkedin_connections;
CREATE POLICY linkedin_connections_brand ON public.linkedin_connections FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())));

-- SEARCH
DROP POLICY IF EXISTS linkedin_searches_brand ON public.linkedin_searches;
CREATE POLICY linkedin_searches_brand ON public.linkedin_searches FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())));

-- AUTOMATION
DROP POLICY IF EXISTS la_campaigns_brand ON public.la_campaigns;
CREATE POLICY la_campaigns_brand ON public.la_campaigns FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));
DROP POLICY IF EXISTS la_steps_brand ON public.la_steps;
CREATE POLICY la_steps_brand ON public.la_steps FOR ALL
  USING (EXISTS (SELECT 1 FROM la_campaigns c WHERE c.id = la_steps.campaign_id AND (has_brand_access(c.brand_voice_id) OR ((c.brand_voice_id IS NULL) AND user_in_team(c.team_id)))))
  WITH CHECK (EXISTS (SELECT 1 FROM la_campaigns c WHERE c.id = la_steps.campaign_id AND (has_brand_access(c.brand_voice_id) OR ((c.brand_voice_id IS NULL) AND user_in_team(c.team_id)))));
DROP POLICY IF EXISTS la_enrollments_brand ON public.la_enrollments;
CREATE POLICY la_enrollments_brand ON public.la_enrollments FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));
DROP POLICY IF EXISTS la_jobs_brand ON public.la_jobs;
CREATE POLICY la_jobs_brand ON public.la_jobs FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));
DROP POLICY IF EXISTS la_audiences_brand ON public.la_audiences;
CREATE POLICY la_audiences_brand ON public.la_audiences FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));
DROP POLICY IF EXISTS la_accounts_brand_select ON public.la_accounts;
CREATE POLICY la_accounts_brand_select ON public.la_accounts FOR SELECT
  USING ((brand_voice_id IS NOT NULL) AND (brand_voice_id IN (SELECT brand_voices.id FROM brand_voices)));

-- ENGAGEMENT
DROP POLICY IF EXISTS linkedin_engagement_brand ON public.linkedin_engagement_jobs;
CREATE POLICY linkedin_engagement_brand ON public.linkedin_engagement_jobs FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())));
DROP POLICY IF EXISTS linkedin_engagers_brand ON public.linkedin_post_engagers;
CREATE POLICY linkedin_engagers_brand ON public.linkedin_post_engagers FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())));

-- ANALYTICS
DROP POLICY IF EXISTS linkedin_network_metrics_brand_read ON public.linkedin_network_metrics;
CREATE POLICY linkedin_network_metrics_brand_read ON public.linkedin_network_metrics FOR SELECT
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));
DROP POLICY IF EXISTS linkedin_page_metrics_brand_read ON public.linkedin_page_metrics;
CREATE POLICY linkedin_page_metrics_brand_read ON public.linkedin_page_metrics FOR SELECT
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));
DROP POLICY IF EXISTS linkedin_profile_metrics_brand_read ON public.linkedin_profile_metrics;
CREATE POLICY linkedin_profile_metrics_brand_read ON public.linkedin_profile_metrics FOR SELECT
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));
DROP POLICY IF EXISTS lpv_brand_read ON public.linkedin_profile_viewers;
CREATE POLICY lpv_brand_read ON public.linkedin_profile_viewers FOR SELECT
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));
DROP POLICY IF EXISTS lpv_brand_write ON public.linkedin_profile_viewers;
CREATE POLICY lpv_brand_write ON public.linkedin_profile_viewers FOR UPDATE
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = uid()))));
DROP POLICY IF EXISTS ssi_brand ON public.ssi_scores;
CREATE POLICY ssi_brand ON public.ssi_scores FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())));
DROP POLICY IF EXISTS pc_brand ON public.profile_checks;
CREATE POLICY pc_brand ON public.profile_checks FOR ALL
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())))
  WITH CHECK (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND (user_id = uid())));

-- CONNECTION
DROP POLICY IF EXISTS unipile_accounts_brand ON public.unipile_accounts;
CREATE POLICY unipile_accounts_brand ON public.unipile_accounts FOR SELECT
  USING (has_brand_access(brand_voice_id) OR ((brand_voice_id IS NULL) AND user_in_team(team_id)));

COMMIT;
NOTIFY pgrst, 'reload schema';
