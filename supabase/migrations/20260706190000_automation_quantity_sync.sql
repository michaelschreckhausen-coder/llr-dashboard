-- Automation-Quantity-Sync: bei Connect/Disconnect eines unipile_accounts die
-- Stripe-Item-Quantity des 'automation'-Addons auf die aktuelle Zahl setzen.
-- Trigger (unipile_accounts) → Wrapper (net.http_post) → sync-automation-quantity EF.
-- Idempotent.

BEGIN;

-- # verbundene unipile_accounts (status OK) eines Accounts.
CREATE OR REPLACE FUNCTION public.count_account_unipile(p_account_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int
  FROM public.unipile_accounts ua
  JOIN public.teams t ON t.id = ua.team_id
  WHERE t.account_id = p_account_id AND ua.status = 'OK';
$$;
GRANT EXECUTE ON FUNCTION public.count_account_unipile(uuid) TO service_role, authenticated;

-- Feuert die sync-automation-quantity EF für einen Account (GUC-Pattern, fire-and-forget).
CREATE OR REPLACE FUNCTION public.trigger_sync_automation_quantity(p_account_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  base_url    text := current_setting('app.supabase_functions_url', true);
  service_key text := current_setting('app.supabase_service_role_key', true);
BEGIN
  IF p_account_id IS NULL OR base_url IS NULL OR service_key IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url     := base_url || '/sync-automation-quantity',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body    := jsonb_build_object('account_id', p_account_id)
  );
END $$;

-- Trigger: Connect (INSERT) / Disconnect (DELETE) / Status-Änderung (UPDATE OF status).
CREATE OR REPLACE FUNCTION public.unipile_accounts_quantity_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_account uuid;
BEGIN
  SELECT account_id INTO v_account FROM public.teams WHERE id = COALESCE(NEW.team_id, OLD.team_id);
  PERFORM public.trigger_sync_automation_quantity(v_account);
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_unipile_accounts_quantity_sync ON public.unipile_accounts;
CREATE TRIGGER trg_unipile_accounts_quantity_sync
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.unipile_accounts
  FOR EACH ROW EXECUTE FUNCTION public.unipile_accounts_quantity_sync();

COMMIT;
