-- ════════════════════════════════════════════════════════════════
-- 20260628100000_sales_nav_sync_schema.sql
-- Phase 0 Sales-Nav-Sync — Schema-Vorbereitung
-- Idempotent (IF NOT EXISTS / DROP ... IF EXISTS); mit ON_ERROR_STOP=1 ausführen.
--
-- Gating-Modell A (entschieden 2026-06-17): Feature ist addon-exklusiv via
--   i_have_addon('sales-nav-sync'). KEIN neues Modul — addons.activates_modules
--   bleibt {linkedin,crm} unverändert (kein addon-UPDATE in dieser Migration).
--
-- Voraussetzung: public.get_my_team_ids() (Staging vorhanden; vor Prod-Apply
--   verifizieren — auf Prod nicht bestätigt, siehe CLAUDE.md Phase-G-Note).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. leads.sales_nav_id + Dedup-Index (pro Team) ─────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sales_nav_id TEXT;

COMMENT ON COLUMN public.leads.sales_nav_id IS
  'Sales-Navigator-Lead-ID aus /sales/lead/[id]. Für Dedup gegen Re-Import. NULL bei /in/-Importen.';

-- Gleicher Sales-Nav-Lead in Team A und B ist OK, aber nicht 2× in Team A.
CREATE UNIQUE INDEX IF NOT EXISTS leads_team_sales_nav_id_uniq
  ON public.leads (team_id, sales_nav_id)
  WHERE sales_nav_id IS NOT NULL;

-- ─── 2. sales_nav_import_jobs ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_nav_import_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES public.teams(id)    ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,

  source_type      TEXT NOT NULL CHECK (source_type IN ('single','saved_search','list')),
  source_url       TEXT NOT NULL,
  source_id        TEXT,  -- savedSearchId / listId aus der URL

  status           TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','running','paused','done','failed','cancelled')),

  total_leads      INTEGER NOT NULL DEFAULT 0,
  processed_leads  INTEGER NOT NULL DEFAULT 0,
  failed_leads     INTEGER NOT NULL DEFAULT 0,
  current_offset   INTEGER NOT NULL DEFAULT 0,

  rate_limit_until TIMESTAMPTZ,
  error_message    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_nav_import_jobs_team_status_idx
  ON public.sales_nav_import_jobs (team_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_sales_nav_import_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_nav_import_jobs_touch ON public.sales_nav_import_jobs;
CREATE TRIGGER sales_nav_import_jobs_touch
  BEFORE UPDATE ON public.sales_nav_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_sales_nav_import_jobs_updated_at();

-- ─── 3. RLS (rein team-scoped; team_id NOT NULL → keine Solo-Branch) ─
ALTER TABLE public.sales_nav_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_nav_jobs_team_select ON public.sales_nav_import_jobs;
CREATE POLICY sales_nav_jobs_team_select
  ON public.sales_nav_import_jobs FOR SELECT
  USING (team_id = ANY(get_my_team_ids()));

DROP POLICY IF EXISTS sales_nav_jobs_team_insert ON public.sales_nav_import_jobs;
CREATE POLICY sales_nav_jobs_team_insert
  ON public.sales_nav_import_jobs FOR INSERT
  WITH CHECK (user_id = auth.uid() AND team_id = ANY(get_my_team_ids()));

DROP POLICY IF EXISTS sales_nav_jobs_team_update ON public.sales_nav_import_jobs;
CREATE POLICY sales_nav_jobs_team_update
  ON public.sales_nav_import_jobs FOR UPDATE
  USING (team_id = ANY(get_my_team_ids()))
  WITH CHECK (team_id = ANY(get_my_team_ids()));

DROP POLICY IF EXISTS sales_nav_jobs_team_delete ON public.sales_nav_import_jobs;
CREATE POLICY sales_nav_jobs_team_delete
  ON public.sales_nav_import_jobs FOR DELETE
  USING (user_id = auth.uid() AND team_id = ANY(get_my_team_ids()));

-- ─── 4. GRANTs (Self-Host-Pflicht — sonst 42501 trotz RLS) ──────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_nav_import_jobs TO authenticated;
GRANT ALL ON public.sales_nav_import_jobs TO service_role;

-- ─── Gating A: KEIN Schritt 5 ───────────────────────────────────
-- addons.activates_modules bleibt {linkedin,crm}. Feature-Gate erfolgt im
-- Frontend/EF via i_have_addon('sales-nav-sync'). Kein neues Modul.

COMMIT;

-- public liegt bereits in PGRST_DB_SCHEMAS → nur Schema-Cache neu laden,
-- damit die neue Tabelle sofort über die API erreichbar ist.
NOTIFY pgrst, 'reload schema';
