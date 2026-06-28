-- ════════════════════════════════════════════════════════════════
-- 20260703100200_sales_nav_upsert_inbox_rpc.sql
-- Sales-Nav-Ingest schreibt künftig in die Inbox statt direkt nach leads.
-- ----------------------------------------------------------------------------
-- Spiegel von sales_nav_upsert_lead (20260628160000), aber Ziel ist
-- public.linkedin_inbox. Die EF sales-nav-import (handleIngest) ruft ab jetzt
-- diese RPC statt sales_nav_upsert_lead auf.
--
-- RETURNS true = INSERT (neu), false = UPDATE (Re-Sync) — gleiche Semantik wie
-- bisher, damit der inserted/updated-Counter der EF unverändert funktioniert.
--
-- Re-Sync (ON CONFLICT) aktualisiert NUR die Scrape-Felder via COALESCE
-- (überschreibt nie mit NULL) und setzt review_status BEWUSST NICHT zurück —
-- ein bereits promoted/dismissed-Eintrag bleibt in seinem Zustand.
-- name/first_name/last_name INSERT-only (Sales-Nav kürzt Nachnamen).
--
-- sales_nav_upsert_lead bleibt vorerst bestehen (kein DROP) — Rollback der
-- EF-Umstellung bleibt damit ein reiner Code-Revert ohne Migration.
-- ════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.sales_nav_upsert_inbox(
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

  INSERT INTO public.linkedin_inbox (
    team_id, user_id, source, sales_nav_id, name, first_name, last_name,
    job_title, company, location, avatar_url, linkedin_url, headline,
    li_about_summary, raw
  ) VALUES (
    p_team_id, p_user_id, 'sales_nav',
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
    p_lead
  )
  ON CONFLICT (team_id, sales_nav_id) WHERE sales_nav_id IS NOT NULL
  DO UPDATE SET
    -- name/first_name/last_name bewusst NICHT — INSERT-only (Kürzungs-Schutz)
    -- review_status bewusst NICHT — promoted/dismissed bleibt erhalten
    job_title        = COALESCE(EXCLUDED.job_title,        public.linkedin_inbox.job_title),
    company          = COALESCE(EXCLUDED.company,          public.linkedin_inbox.company),
    location         = COALESCE(EXCLUDED.location,         public.linkedin_inbox.location),
    avatar_url       = COALESCE(EXCLUDED.avatar_url,       public.linkedin_inbox.avatar_url),
    linkedin_url     = COALESCE(EXCLUDED.linkedin_url,     public.linkedin_inbox.linkedin_url),
    headline         = COALESCE(EXCLUDED.headline,         public.linkedin_inbox.headline),
    li_about_summary = COALESCE(EXCLUDED.li_about_summary, public.linkedin_inbox.li_about_summary),
    raw              = COALESCE(EXCLUDED.raw,              public.linkedin_inbox.raw)
  RETURNING (xmax = 0) INTO v_inserted;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_nav_upsert_inbox(uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.sales_nav_upsert_inbox(uuid, uuid, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
