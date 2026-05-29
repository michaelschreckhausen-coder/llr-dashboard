-- Phase 2f — visuals.is_favorite für die Library-Filter
BEGIN;
ALTER TABLE public.visuals
  ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_visuals_favorite ON public.visuals(team_id, is_favorite) WHERE is_favorite = true;
COMMIT;
