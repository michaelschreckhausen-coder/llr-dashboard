-- Proaktiver Annahme-Reconcile: erkennt akzeptierte Vernetzungen unabhängig vom
-- trägen Unipile-new_relation-Webhook (Polling ≤8h). Ein Cron ruft die EF
-- la-accept-reconcile (~alle 10 Min); die prüft pro wartendem if_accepted-Enrollment
-- per Unipile is_relationship und ruft bei Treffer la_mark_accepted.
BEGIN;

-- Kandidaten: aktive Enrollments, noch nicht als angenommen markiert, deren
-- aktueller Schritt condition='if_accepted' ist, auf aktiven Kampagnen/Konten.
CREATE OR REPLACE FUNCTION public.la_pending_accept_checks(p_limit integer DEFAULT 60)
RETURNS TABLE(enrollment_id uuid, unipile_account_id text, provider_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT e.id, acc.unipile_account_id, e.provider_id
  FROM public.la_enrollments e
  JOIN public.la_campaigns c ON c.id = e.campaign_id
  JOIN public.la_accounts  acc ON acc.id = c.account_id
  JOIN public.la_steps     s ON s.campaign_id = e.campaign_id AND s.position = e.current_position
  WHERE e.state = 'active'
    AND e.accepted_at IS NULL
    AND s.condition = 'if_accepted'
    AND c.status = 'active'
    AND c.archived_at IS NULL
    AND acc.unipile_account_id IS NOT NULL
    AND e.provider_id IS NOT NULL
  ORDER BY e.updated_at
  LIMIT GREATEST(p_limit, 0);
$$;

-- Markiert als angenommen + materialisiert den if_accepted-Schritt (idempotent).
CREATE OR REPLACE FUNCTION public.la_mark_accepted(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res jsonb;
BEGIN
  UPDATE public.la_enrollments
     SET accepted_at = now(), relation_status = 'first_degree', updated_at = now()
   WHERE id = p_enrollment_id AND accepted_at IS NULL;
  SELECT public.la_materialize_accepted(p_enrollment_id) INTO v_res;
  RETURN jsonb_build_object('marked', p_enrollment_id, 'materialize', v_res);
END $$;

-- Cron-Trigger: feuert die EF (service-role) via net.http_post.
CREATE OR REPLACE FUNCTION public.trigger_la_accept_reconcile()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE base_url text := current_setting('app.supabase_functions_url', true);
        service_key text := current_setting('app.service_role_key', true);
BEGIN
  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING '[la-accept-reconcile] GUCs fehlen'; RETURN;
  END IF;
  PERFORM net.http_post(
    url     := base_url || '/la-accept-reconcile',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || service_key),
    body    := jsonb_build_object('max', 80)
  );
END $$;

COMMIT;
-- Cron als supabase_admin anlegen (idempotent):
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='la-accept-reconcile') THEN
    PERFORM cron.unschedule('la-accept-reconcile');
  END IF;
  PERFORM cron.schedule('la-accept-reconcile', '*/10 * * * *', 'SELECT public.trigger_la_accept_reconcile()');
END $$;
