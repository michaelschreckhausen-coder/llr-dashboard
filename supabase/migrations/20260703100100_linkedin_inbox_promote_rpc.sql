-- ════════════════════════════════════════════════════════════════
-- 20260703100100_linkedin_inbox_promote_rpc.sql
-- Promotion: Inbox-Kontakt → echter CRM-Lead (1-Klick).
-- ----------------------------------------------------------------------------
-- promote_inbox_contact(uuid)      → einzelner Eintrag, RETURNS lead_id
-- promote_inbox_contacts(uuid[])   → Bulk, per-Row-Loop (partial-failure-safe)
--
-- SECURITY DEFINER, weil die Funktion sowohl linkedin_inbox als auch leads
-- schreibt — der Team-Guard wird HIER manuell via user_in_team(auth.uid())
-- erzwungen (Definer bypassed RLS).
--
-- Dedup gegen leads (INKL. archivierter Rows!):
--   1. sales_nav_id-Match (stärkster Schlüssel)
--   2. sonst linkedin_url-Match
--   Treffer → COALESCE-Merge der Scrape-Felder + Reaktivierung (archived=false).
--   Das ist die Rückseite des Backfills (20260703100300): rückgeführte Leads
--   liegen archiviert in leads und werden beim Promote reaktiviert statt
--   dupliziert.
--   Kein Treffer → neuer Lead (status='Lead', lead_status='new',
--   original_source='linkedin').
--
-- COALESCE-Merge überschreibt NIE gepflegte Lead-Daten mit NULL und respektiert
-- name/first_name/last_name als INSERT-only-bei-Reaktivierung NICHT — bei einem
-- bestehenden (nicht-archivierten) Lead bleiben dessen Namen unangetastet; nur
-- leere Felder werden befüllt.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── Einzel-Promotion ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.promote_inbox_contact(p_inbox_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row     public.linkedin_inbox;
  v_lead_id uuid;
BEGIN
  SELECT * INTO v_row FROM public.linkedin_inbox WHERE id = p_inbox_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inbox row % not found', p_inbox_id;
  END IF;

  IF NOT public.user_in_team(v_row.team_id) THEN
    RAISE EXCEPTION 'forbidden: caller not in team %', v_row.team_id;
  END IF;

  -- Idempotenz: bereits promoted → bestehenden Lead zurückgeben.
  IF v_row.review_status = 'promoted' AND v_row.promoted_lead_id IS NOT NULL THEN
    RETURN v_row.promoted_lead_id;
  END IF;

  -- Dedup gegen leads (inkl. archivierter). Nicht-archivierte bevorzugt.
  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE team_id = v_row.team_id
    AND (
      (v_row.sales_nav_id IS NOT NULL AND sales_nav_id = v_row.sales_nav_id)
      OR (v_row.sales_nav_id IS NULL AND v_row.linkedin_url IS NOT NULL
          AND linkedin_url = v_row.linkedin_url)
    )
  ORDER BY archived ASC
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    -- Bestehenden (ggf. archivierten) Lead anreichern + reaktivieren.
    UPDATE public.leads SET
      first_name       = COALESCE(first_name,       v_row.first_name),
      last_name        = COALESCE(last_name,        v_row.last_name),
      name             = COALESCE(NULLIF(name, ''), NULLIF(v_row.name, '')),
      job_title        = COALESCE(job_title,        v_row.job_title),
      company          = COALESCE(company,          v_row.company),
      location         = COALESCE(location,         v_row.location),
      avatar_url       = COALESCE(avatar_url,       v_row.avatar_url),
      linkedin_url     = COALESCE(linkedin_url,     v_row.linkedin_url),
      headline         = COALESCE(headline,         v_row.headline),
      li_about_summary = COALESCE(li_about_summary, v_row.li_about_summary),
      sales_nav_id     = COALESCE(sales_nav_id,     v_row.sales_nav_id),
      archived         = false,
      archived_at      = NULL
    WHERE id = v_lead_id;
  ELSE
    -- Neuer Lead.
    INSERT INTO public.leads (
      team_id, user_id, source, sales_nav_id, name, first_name, last_name,
      job_title, company, location, avatar_url, linkedin_url, headline,
      li_about_summary, status, lead_status, original_source, last_synced_at
    ) VALUES (
      v_row.team_id, v_row.user_id, v_row.source, v_row.sales_nav_id,
      COALESCE(NULLIF(v_row.name, ''), 'Unbekannt'),
      v_row.first_name, v_row.last_name, v_row.job_title, v_row.company,
      v_row.location, v_row.avatar_url, v_row.linkedin_url, v_row.headline,
      v_row.li_about_summary, 'Lead', 'new', 'linkedin', now()
    )
    RETURNING id INTO v_lead_id;
  END IF;

  UPDATE public.linkedin_inbox
     SET review_status = 'promoted', promoted_lead_id = v_lead_id
   WHERE id = p_inbox_id;

  RETURN v_lead_id;
END;
$$;

-- ── Bulk-Promotion (per-Row, partial-failure-safe) ──────────────────
-- Loop mit Einzel-RPC pro Row → eine fehlschlagende Row killt nicht den Batch
-- (vgl. leads_status_bulk_silent_fail / per-Row .eq()-Pattern).
CREATE OR REPLACE FUNCTION public.promote_inbox_contacts(p_inbox_ids uuid[])
RETURNS TABLE (inbox_id uuid, lead_id uuid, ok boolean, err text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  FOREACH v_id IN ARRAY COALESCE(p_inbox_ids, ARRAY[]::uuid[]) LOOP
    BEGIN
      inbox_id := v_id;
      lead_id  := public.promote_inbox_contact(v_id);
      ok       := true;
      err      := NULL;
    EXCEPTION WHEN OTHERS THEN
      inbox_id := v_id;
      lead_id  := NULL;
      ok       := false;
      err      := SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ── Privilegien: Client darf promoten (Team-Guard steckt in der Funktion) ──
REVOKE ALL ON FUNCTION public.promote_inbox_contact(uuid)    FROM public;
REVOKE ALL ON FUNCTION public.promote_inbox_contacts(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.promote_inbox_contact(uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_inbox_contacts(uuid[]) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
