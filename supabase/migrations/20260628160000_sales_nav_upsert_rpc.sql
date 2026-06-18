-- 20260628160000_sales_nav_upsert_rpc.sql
-- Phase-4 (Sales-Nav-Bulk): Upsert-RPC + atomarer Job-Counter.
--
-- Warum eine RPC statt supabase-js .upsert():
--   Der partielle Unique-Index leads_team_sales_nav_id_uniq (WHERE sales_nav_id
--   IS NOT NULL) lässt sich von PostgREST NICHT als ON-CONFLICT-Arbiter
--   inferieren (42P10, auf Staging verifiziert 2026-06-18). Hier geben wir den
--   Index-Predicate explizit an → Postgres kann ihn als Arbiter nutzen.
--
-- COALESCE-Update: überschreibt NIE mit NULL. Schützt (a) echte /in/-linkedin_url
-- aus früheren Imports (Sales-Nav liefert linkedin_url=NULL) und (b) bei
-- Saved-Search-Stub-Ingest (nur Name/Headline/Company) die bereits vorhandenen
-- Detail-Felder. Stub-Ingest + späterer Detail-Re-Scrape konvergieren additiv.
--
-- Bewusst NICHT im UPDATE-Set (= User-Edits bleiben): tags, notes, owner_id,
-- status, lead_score, next_followup, is_favorite, is_shared, deal_*, name
-- (Sales-Nav kürzt Nachnamen → "Olivier L."; vollen Namen aus /in/ nicht clobbern).
-- updated_at macht der vorhandene Trigger trg_leads_updated_at.
-- auto_assign_team_id() ist No-op weil team_id explizit (NOT NULL) übergeben wird.

BEGIN;

-- ── Upsert eines einzelnen Sales-Nav-Leads ──────────────────────────
-- RETURNS true = INSERT (neu), false = UPDATE (Re-Sync). xmax=0 → frisch eingefügt.
CREATE OR REPLACE FUNCTION public.sales_nav_upsert_lead(
  p_team_id uuid,
  p_user_id uuid,
  p_lead    jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted boolean;
BEGIN
  IF NULLIF(p_lead->>'sales_nav_id','') IS NULL THEN
    RAISE EXCEPTION 'sales_nav_id required';
  END IF;

  INSERT INTO public.leads (
    team_id, user_id, sales_nav_id, name, first_name, last_name,
    job_title, company, location, avatar_url, linkedin_url, headline,
    li_about_summary, source, status, last_synced_at
  ) VALUES (
    p_team_id, p_user_id,
    p_lead->>'sales_nav_id',
    COALESCE(NULLIF(p_lead->>'name',''), 'Unbekannt'),
    NULLIF(p_lead->>'first_name',''),
    NULLIF(p_lead->>'last_name',''),
    NULLIF(p_lead->>'job_title',''),
    NULLIF(p_lead->>'company',''),
    NULLIF(p_lead->>'location',''),
    NULLIF(p_lead->>'avatar_url',''),
    NULLIF(p_lead->>'linkedin_url',''),
    NULLIF(p_lead->>'headline',''),
    NULLIF(p_lead->>'li_about_summary',''),
    'sales_nav', 'Lead', now()
  )
  ON CONFLICT (team_id, sales_nav_id) WHERE sales_nav_id IS NOT NULL
  DO UPDATE SET
    first_name       = COALESCE(EXCLUDED.first_name,       public.leads.first_name),
    last_name        = COALESCE(EXCLUDED.last_name,        public.leads.last_name),
    job_title        = COALESCE(EXCLUDED.job_title,        public.leads.job_title),
    company          = COALESCE(EXCLUDED.company,          public.leads.company),
    location         = COALESCE(EXCLUDED.location,         public.leads.location),
    avatar_url       = COALESCE(EXCLUDED.avatar_url,       public.leads.avatar_url),
    linkedin_url     = COALESCE(EXCLUDED.linkedin_url,     public.leads.linkedin_url),
    headline         = COALESCE(EXCLUDED.headline,         public.leads.headline),
    li_about_summary = COALESCE(EXCLUDED.li_about_summary, public.leads.li_about_summary),
    last_synced_at   = now()
  RETURNING (xmax = 0) INTO v_inserted;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_nav_upsert_lead(uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.sales_nav_upsert_lead(uuid, uuid, jsonb) TO service_role;

-- ── Atomarer Job-Counter-Vorschub (race-safe bei parallelen Batches) ──
CREATE OR REPLACE FUNCTION public.sales_nav_job_advance(
  p_job_id    uuid,
  p_processed int,
  p_failed    int
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.sales_nav_import_jobs
  SET processed_leads = processed_leads + GREATEST(p_processed, 0),
      failed_leads    = failed_leads    + GREATEST(p_failed, 0),
      current_offset  = current_offset  + GREATEST(p_processed, 0) + GREATEST(p_failed, 0)
  WHERE id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.sales_nav_job_advance(uuid, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.sales_nav_job_advance(uuid, int, int) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
