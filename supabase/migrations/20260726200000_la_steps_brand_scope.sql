-- la_steps war als einzige la_-Tabelle noch rein team-basiert (user_in_team(campaign.team)).
-- Regel (Julian): geteilte Marke -> Verbindung/Automatisierung nutzbar durch alle mit Marken-Zugriff.
-- la_steps an die Geschwister-Tabellen angleichen: Zugriff via has_brand_access der ELTERN-Kampagne
-- (Fallback team nur wenn Kampagne keine Marke hat). Keine neue Zugriffsfläche über die Kampagne hinaus.
BEGIN;
DROP POLICY IF EXISTS la_steps_team ON public.la_steps;
DROP POLICY IF EXISTS la_steps_brand ON public.la_steps;
CREATE POLICY la_steps_brand ON public.la_steps FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.la_campaigns c
  WHERE c.id = la_steps.campaign_id
    AND (public.has_brand_access(c.brand_voice_id) OR (c.brand_voice_id IS NULL AND public.user_in_team(c.team_id)))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.la_campaigns c
  WHERE c.id = la_steps.campaign_id
    AND (public.has_brand_access(c.brand_voice_id) OR (c.brand_voice_id IS NULL AND public.user_in_team(c.team_id)))
));
COMMIT;
