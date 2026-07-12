-- Fix: add_lead_to_inbox soll einen Kontakt, der schon (aber promoted/dismissed)
-- in der Inbox liegt, WIEDER SICHTBAR machen (review_status='new') — sonst bleibt
-- der Kontakt nach „In LinkedIn Kontakte" unsichtbar (Default-View zeigt nur 'new').
-- Provenienz (source) bleibt erhalten; nur der review_status wird zurückgesetzt.
-- Idempotent (CREATE OR REPLACE).

BEGIN;

CREATE OR REPLACE FUNCTION public.add_lead_to_inbox(p_lead_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_team uuid; v_user uuid; v_fn text; v_ln text; v_comp text; v_url text;
  v_name text; v_existing uuid; v_status text; v_resurfaced boolean := false; v_id uuid;
BEGIN
  SELECT team_id, user_id, first_name, last_name, company, NULLIF(trim(linkedin_url), '')
    INTO v_team, v_user, v_fn, v_ln, v_comp, v_url
    FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;
  IF v_team IS NULL THEN RAISE EXCEPTION 'lead_has_no_team'; END IF;
  IF NOT public.user_in_team(v_team) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_url IS NULL THEN RAISE EXCEPTION 'no_linkedin_url'; END IF;

  SELECT id, review_status INTO v_existing, v_status FROM public.linkedin_inbox
    WHERE team_id = v_team AND linkedin_url = v_url LIMIT 1;
  IF v_existing IS NOT NULL THEN
    -- Schon vorhanden: falls promoted/dismissed → wieder auf 'new' heben (sichtbar machen).
    IF v_status IS DISTINCT FROM 'new' THEN
      UPDATE public.linkedin_inbox SET review_status = 'new', updated_at = now() WHERE id = v_existing;
      v_resurfaced := true;
    END IF;
    RETURN jsonb_build_object('id', v_existing, 'created', false, 'resurfaced', v_resurfaced);
  END IF;

  v_name := NULLIF(trim(coalesce(v_fn, '') || ' ' || coalesce(v_ln, '')), '');
  INSERT INTO public.linkedin_inbox (team_id, user_id, source, name, first_name, last_name, company, linkedin_url)
    VALUES (v_team, v_user, 'crm_lead', COALESCE(v_name, 'Unbekannt'),
            NULLIF(v_fn, ''), NULLIF(v_ln, ''), NULLIF(v_comp, ''), v_url)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'created', true, 'resurfaced', false);
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_existing FROM public.linkedin_inbox WHERE team_id = v_team AND linkedin_url = v_url LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE public.linkedin_inbox SET review_status = 'new', updated_at = now()
      WHERE id = v_existing AND review_status IS DISTINCT FROM 'new';
  END IF;
  RETURN jsonb_build_object('id', v_existing, 'created', false, 'resurfaced', true);
END $fn$;

COMMIT;
