-- ════════════════════════════════════════════════════════════════
-- 20260716131000_network_upsert_rpc.sql
-- public.network_upsert — Ziel-RPC für import-unipile-relations.
-- Analog sales_nav_upsert_inbox, aber auf linkedin_network.
-- ----------------------------------------------------------------------------
-- Unterschiede zur Inbox-Variante (bewusst):
--   * kein review_status / promoted_lead_id — Netzwerk ist keine Triage.
--   * last_seen_at wird bei JEDEM Lauf gesetzt → wer verschwindet, ist erkennbar.
--   * COALESCE-Merge: ein späterer Lauf mit dünnerem Payload darf bereits
--     angereicherte Felder (job_title/company via unipile-enrich) nicht platt-
--     machen. Gleiche Semantik wie sales_nav_upsert_inbox.
--
-- Dedup-Arbiter-Präzedenz: provider_id vor linkedin_url (Relations liefern
-- provider_id, aber nie sales_nav_id — siehe 20260707190000).
--
-- service_role reicht (Aufruf nur aus der EF). authenticated bekommt EXECUTE
-- für einen künftigen manuellen „Jetzt synchronisieren"-Button.
-- Idempotent (CREATE OR REPLACE — Signatur unverändert bei Re-Run).
-- ════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.network_upsert(
  p_team_id  uuid,
  p_user_id  uuid,
  p_contact  jsonb,
  p_unipile_account_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_provider_id text := NULLIF(p_contact->>'provider_id','');
  v_url         text := NULLIF(p_contact->>'linkedin_url','');
  v_existing    uuid;
  v_id          uuid;
BEGIN
  IF v_provider_id IS NULL AND v_url IS NULL THEN
    RAISE EXCEPTION 'provider_id or linkedin_url required';
  END IF;

  SELECT id INTO v_existing FROM public.linkedin_network
  WHERE team_id = p_team_id
    AND ( (v_provider_id IS NOT NULL AND provider_id  = v_provider_id)
       OR (v_url         IS NOT NULL AND linkedin_url = v_url) )
  ORDER BY (v_provider_id IS NOT NULL AND provider_id = v_provider_id) DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.linkedin_network SET
      provider_id        = COALESCE(v_provider_id, provider_id),
      linkedin_url       = COALESCE(v_url, linkedin_url),
      public_id          = COALESCE(NULLIF(p_contact->>'public_id',''),        public_id),
      name               = COALESCE(NULLIF(p_contact->>'name',''),             name),
      first_name         = COALESCE(NULLIF(p_contact->>'first_name',''),       first_name),
      last_name          = COALESCE(NULLIF(p_contact->>'last_name',''),        last_name),
      headline           = COALESCE(NULLIF(p_contact->>'headline',''),         headline),
      job_title          = COALESCE(NULLIF(p_contact->>'job_title',''),        job_title),
      company            = COALESCE(NULLIF(p_contact->>'company',''),          company),
      location           = COALESCE(NULLIF(p_contact->>'location',''),         location),
      avatar_url         = COALESCE(NULLIF(p_contact->>'avatar_url',''),       avatar_url),
      li_about_summary   = COALESCE(NULLIF(p_contact->>'li_about_summary',''), li_about_summary),
      unipile_account_id = COALESCE(p_unipile_account_id, unipile_account_id),
      raw                = COALESCE(p_contact, raw),
      last_seen_at       = now(),
      updated_at         = now()
    WHERE id = v_existing;
    RETURN jsonb_build_object('id', v_existing, 'inserted', false);
  END IF;

  INSERT INTO public.linkedin_network (
    team_id, user_id, unipile_account_id, provider_id, linkedin_url, public_id,
    name, first_name, last_name, headline, job_title, company, location,
    avatar_url, li_about_summary, source, raw
  ) VALUES (
    p_team_id, p_user_id, p_unipile_account_id, v_provider_id, v_url,
    NULLIF(p_contact->>'public_id',''),
    COALESCE(NULLIF(p_contact->>'name',''), 'Unbekannt'),
    NULLIF(p_contact->>'first_name',''), NULLIF(p_contact->>'last_name',''),
    NULLIF(p_contact->>'headline',''),   NULLIF(p_contact->>'job_title',''),
    NULLIF(p_contact->>'company',''),    NULLIF(p_contact->>'location',''),
    NULLIF(p_contact->>'avatar_url',''), NULLIF(p_contact->>'li_about_summary',''),
    COALESCE(NULLIF(p_contact->>'source',''), 'unipile_relations'),
    p_contact
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'inserted', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.network_upsert(uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.network_upsert(uuid, uuid, jsonb, text) TO service_role, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
