-- support_tickets: vom Assistenten (Leadly) eskalierte technische Probleme.
-- Team-scoped RLS + user-Fallback. Admins/Team können sie sichten.
BEGIN;
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  team_id     uuid,
  account_id  uuid,
  summary     text NOT NULL,
  details     text,
  area        text,
  status      text NOT NULL DEFAULT 'open',
  source      text NOT NULL DEFAULT 'assistant',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_team ON public.support_tickets(team_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_tickets_access ON public.support_tickets;
CREATE POLICY support_tickets_access ON public.support_tickets FOR ALL
  USING (user_id = auth.uid() OR team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() OR team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
COMMIT;
