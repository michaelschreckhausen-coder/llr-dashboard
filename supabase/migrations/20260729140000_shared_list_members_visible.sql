-- Bugfix: geteilte LinkedIn-Kontakte-Listen zeigten beim anderen Brand nur die LEERE
-- Liste — die Mitglieder-Kontakte (linkedin_inbox) blieben per brand-scope RLS unsichtbar.
-- Fix: Kontakte, die Mitglied einer team-weit geteilten Liste sind, werden fuer alle
-- Team-Mitglieder lesbar (zusaetzliche SELECT-Policy; Schreibrechte bleiben brand-scoped).
CREATE OR REPLACE FUNCTION public.inbox_in_shared_list(p_inbox_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inbox_list_members m
    JOIN public.inbox_lists il ON il.id = m.list_id
    WHERE m.inbox_id = p_inbox_id
      AND il.is_shared = true
      AND il.team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  );
$$;
GRANT EXECUTE ON FUNCTION public.inbox_in_shared_list(uuid) TO authenticated;

DROP POLICY IF EXISTS linkedin_inbox_shared_list_read ON public.linkedin_inbox;
CREATE POLICY linkedin_inbox_shared_list_read ON public.linkedin_inbox
  FOR SELECT USING (public.inbox_in_shared_list(id));
