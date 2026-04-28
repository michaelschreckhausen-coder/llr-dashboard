-- Hetzner-Staging-Kompatibilität: App-Code (post-2fe50d5) erwartet plan/max_seats/is_active
-- als Inline-Spalten auf teams. Auf Cloud-Prod existieren diese, auf Hetzner-Self-Host nicht.
-- Diese Migration fügt sie idempotent ein, damit useTeam() ohne Crash lädt.
-- TODO: Ersetzt durch Accounts-Refactor (siehe 20260428200000) — diese hier wird in Phase 4 gedroppt.

BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS max_seats integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

UPDATE public.teams SET is_active = true WHERE is_active IS NULL;
UPDATE public.team_members SET is_active = true WHERE is_active IS NULL;

-- Falls plan_id existiert: aus plans-Tabelle den text rüberziehen
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teams' AND column_name='plan_id')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='plans') THEN
    UPDATE public.teams t
    SET plan = COALESCE(p.name, 'free')
    FROM public.plans p
    WHERE t.plan_id = p.id AND (t.plan IS NULL OR t.plan = 'free');
  END IF;
END $$;

COMMIT;
