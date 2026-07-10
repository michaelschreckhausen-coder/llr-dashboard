-- P5 · Builder-Support: la_steps für authenticated les-/schreibbar (via Kampagnen-Team). service_role unberührt.
BEGIN;
DROP POLICY IF EXISTS la_steps_team ON public.la_steps;
CREATE POLICY la_steps_team ON public.la_steps
  USING      (EXISTS (SELECT 1 FROM public.la_campaigns c WHERE c.id = campaign_id AND public.user_in_team(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.la_campaigns c WHERE c.id = campaign_id AND public.user_in_team(c.team_id)));
COMMIT;
