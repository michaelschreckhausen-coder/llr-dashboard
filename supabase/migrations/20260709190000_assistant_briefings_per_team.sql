-- Team-Isolation: Briefing-Cache war nur (user_id, briefing_date)-eindeutig.
-- Ein in Team A generiertes Briefing wurde dadurch in Team B angezeigt und
-- blockierte die Generierung eines team-korrekten Briefings am selben Tag.
BEGIN;
ALTER TABLE public.assistant_briefings DROP CONSTRAINT IF EXISTS assistant_briefings_user_date_unique;
DROP INDEX IF EXISTS assistant_briefings_user_date_unique;
CREATE UNIQUE INDEX IF NOT EXISTS assistant_briefings_user_team_date_unique
  ON public.assistant_briefings (user_id, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid), briefing_date);
COMMIT;
