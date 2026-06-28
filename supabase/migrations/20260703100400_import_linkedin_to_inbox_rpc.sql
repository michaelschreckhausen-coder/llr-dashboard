-- ════════════════════════════════════════════════════════════════
-- 20260703100400_import_linkedin_to_inbox_rpc.sql
-- Regulärer LinkedIn-Einzel-Import (Extension "In Leadesk importieren") →
-- landet ab jetzt in der Import-Inbox statt direkt in leads.
-- ----------------------------------------------------------------------------
-- Bisher: chrome-extension/sidepanel.js importLead() POSTet direkt nach
-- public.leads (on_conflict user_id,linkedin_url, source='extension_import').
-- Künftig: die Extension ruft diese RPC; Überführung ins CRM erst per
-- promote_inbox_contact (1-Klick in /linkedin-inbox).
--
-- Warum RPC statt direktem PostgREST-Upsert auf linkedin_inbox:
-- der Dedup-Index linkedin_inbox_team_url_uniq ist PARTIELL
-- (WHERE linkedin_url IS NOT NULL AND sales_nav_id IS NULL) → PostgREST kann
-- ihn nicht als ON-CONFLICT-Arbiter inferieren (42P10, vgl. sales_nav). Hier
-- geben wir das Index-Predicate explizit an.
--
-- RETURNS true = INSERT (neu in Inbox), false = UPDATE (Re-Sync).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- source-CHECK um 'extension_import' erweitern (Provenienz-Treue: regulärer
-- Import behält sein Label end-to-end; promote setzt leads.source ebenso).
ALTER TABLE public.linkedin_inbox DROP CONSTRAINT IF EXISTS linkedin_inbox_source_check;
ALTER TABLE public.linkedin_inbox ADD CONSTRAINT linkedin_inbox_source_check
  CHECK (source IN ('sales_nav','linkedin_scrape','extension_import','manual'));

CREATE OR REPLACE FUNCTION public.import_linkedin_to_inbox(
  p_team_id uuid,
  p_user_id uuid,
  p_profile jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted boolean;
  v_url      text;
BEGIN
  v_url := COALESCE(NULLIF(p_profile->>'linkedin_url',''), NULLIF(p_profile->>'profile_url',''));
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'linkedin_url required';
  END IF;
  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'team_id required';
  END IF;

  -- Team-Guard (Definer bypasst RLS → manuell prüfen, auth.uid() ist der Caller).
  IF NOT public.user_in_team(p_team_id) THEN
    RAISE EXCEPTION 'forbidden: caller not in team %', p_team_id;
  END IF;

  INSERT INTO public.linkedin_inbox (
    team_id, user_id, source, linkedin_url, name, first_name, last_name,
    headline, job_title, company, location, avatar_url, li_about_summary, raw
  ) VALUES (
    p_team_id, COALESCE(p_user_id, auth.uid()), 'extension_import', v_url,
    COALESCE(NULLIF(p_profile->>'name',''), 'Unbekannt'),
    NULLIF(p_profile->>'first_name',''),
    NULLIF(p_profile->>'last_name',''),
    NULLIF(p_profile->>'headline',''),
    NULLIF(p_profile->>'job_title',''),
    NULLIF(p_profile->>'company',''),
    NULLIF(p_profile->>'location',''),
    NULLIF(p_profile->>'avatar_url',''),
    NULLIF(p_profile->>'li_about_summary',''),
    p_profile
  )
  ON CONFLICT (team_id, linkedin_url) WHERE linkedin_url IS NOT NULL AND sales_nav_id IS NULL
  DO UPDATE SET
    -- name/first_name/last_name INSERT-only (kein Kürzungs-Risiko überschreiben)
    -- review_status bewusst NICHT — promoted/dismissed bleibt erhalten
    headline         = COALESCE(EXCLUDED.headline,         public.linkedin_inbox.headline),
    job_title        = COALESCE(EXCLUDED.job_title,        public.linkedin_inbox.job_title),
    company          = COALESCE(EXCLUDED.company,          public.linkedin_inbox.company),
    location         = COALESCE(EXCLUDED.location,         public.linkedin_inbox.location),
    avatar_url       = COALESCE(EXCLUDED.avatar_url,       public.linkedin_inbox.avatar_url),
    li_about_summary = COALESCE(EXCLUDED.li_about_summary, public.linkedin_inbox.li_about_summary),
    raw              = COALESCE(EXCLUDED.raw,              public.linkedin_inbox.raw)
  RETURNING (xmax = 0) INTO v_inserted;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.import_linkedin_to_inbox(uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.import_linkedin_to_inbox(uuid, uuid, jsonb) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
