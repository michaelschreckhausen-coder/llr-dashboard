-- Fix: admin_grant_addon warf duplicate key auf account_addons_accountwide_uniq beim Re-Grant
-- eines gecancelten Addons (Soft-Cancel lässt die Zeile stehen; der Partial-Index deckt alle Status ab).
-- Lösung: find-or-update — bestehende (ggf. gecancelte) Zeile pro (account, addon, scope) REAKTIVIEREN
-- statt Duplikat einzufügen. Beide Scopes (account-weit member NULL / member-level), NULL-safe Match.
-- Additiv (CREATE OR REPLACE), Indexe unverändert (verhindern korrekt doppelte Zeilen pro Scope).

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_grant_addon(p_account_id uuid, p_addon_key text, p_member_user_id uuid, p_billing_type text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_admin uuid := auth.uid(); v_addon_id uuid; v_id uuid; v_existing uuid; v_reactivated boolean := false;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN RAISE EXCEPTION 'Reason required (min 10 Zeichen)'; END IF;
  IF p_billing_type NOT IN ('comped','external') THEN RAISE EXCEPTION 'billing_type muss comped oder external sein'; END IF;
  SELECT id INTO v_addon_id FROM public.addons WHERE slug = p_addon_key;
  IF v_addon_id IS NULL THEN RAISE EXCEPTION 'Addon not found: %', p_addon_key; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF p_member_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = p_member_user_id AND t.account_id = p_account_id
  ) THEN RAISE EXCEPTION 'Member gehört nicht zum Account'; END IF;

  -- Bestehende Zeile für (account, addon, scope) — JEDER Status (Soft-Cancel lässt Zeile stehen).
  -- Scope-Match NULL-safe: p_member NULL → account-weite Zeile, sonst die Member-Zeile.
  SELECT id INTO v_existing FROM public.account_addons
  WHERE account_id = p_account_id AND addon_id = v_addon_id
    AND member_user_id IS NOT DISTINCT FROM p_member_user_id
  ORDER BY (status = 'active') DESC, activated_at DESC NULLS LAST
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- Re-Grant: bestehende (ggf. gecancelte) Zeile reaktivieren statt Duplikat (analog upsert_account_addon_from_stripe).
    UPDATE public.account_addons
    SET status = 'active', billing_type = p_billing_type, is_grandfathered = false,
        granted_by = v_admin, grant_reason = p_reason, canceled_at = NULL,
        activated_at = now(), updated_at = now()
    WHERE id = v_existing RETURNING id INTO v_id;
    v_reactivated := true;
  ELSE
    INSERT INTO public.account_addons (account_id, addon_id, member_user_id, status, billing_type, is_grandfathered, granted_by, grant_reason, activated_at)
    VALUES (p_account_id, v_addon_id, p_member_user_id, 'active', p_billing_type, false, v_admin, p_reason, now())
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, after_value, reason)
  VALUES (v_admin, CASE WHEN v_reactivated THEN 'grant_addon_reactivate' ELSE 'grant_addon' END, 'account_addons', v_id,
    jsonb_build_object('account_id', p_account_id, 'addon', p_addon_key, 'member_user_id', p_member_user_id, 'billing_type', p_billing_type, 'reactivated', v_reactivated), p_reason);
  RETURN jsonb_build_object('id', v_id, 'ok', true, 'reactivated', v_reactivated);
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_grant_addon(uuid, text, uuid, text, text) TO authenticated;

COMMIT;
