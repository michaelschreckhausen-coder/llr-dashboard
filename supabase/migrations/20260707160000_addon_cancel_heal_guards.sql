-- Fast-Follows zum manuellen-Grant-Feature: zwei Wege schließen, auf denen ein Grant fälschlich wegfliegt.
-- (1) cancel_addon (Kunden-App „Kündigen"): admin-zugewiesene Grants (granted_by gesetzt) NICHT self-service kündbar.
--     War der 08:02-Cancel-Pfad (Kunde kündigte grandfathered automation). Re-grantete Rows haben granted_by → geschützt.
-- (2) admin_heal_addon_sync (Stripe-Sync-Heal): nur billing_type='stripe' angleichbar; grandfathered/comped/external
--     haben keine Stripe-Wahrheit → ein Heal würde sie fälschlich canceln.
-- Additiv (CREATE OR REPLACE), keine Signatur-/Schema-Änderung.

BEGIN;

-- (1) cancel_addon: + granted_by-Guard (nach dem Stripe-Check)
CREATE OR REPLACE FUNCTION public.cancel_addon(p_slug text, p_at_period_end boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
declare
  v_uid        uuid := auth.uid();
  v_account_id uuid;
  v_addon      public.addons;
  v_aa         public.account_addons;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_addon from public.addons where slug = p_slug;
  if v_addon.id is null then raise exception 'addon not found: %', p_slug; end if;

  select t.account_id into v_account_id
  from public.teams t
  join public.team_members tm on tm.team_id = t.id
  left join public.user_preferences up on up.user_id = v_uid
  where tm.user_id = v_uid and t.account_id is not null
    and (up.active_team_id is null or up.active_team_id = t.id)
  order by (up.active_team_id = t.id) desc nulls last, t.created_at asc
  limit 1;
  if v_account_id is null then raise exception 'no account resolvable for user %', v_uid; end if;

  select * into v_aa from public.account_addons where account_id = v_account_id and addon_id = v_addon.id;
  if v_aa.id is null then raise exception 'no active activation for % on this account', p_slug; end if;

  -- Nur echte Stripe-Subs ans Billing-Portal verweisen.
  if v_aa.stripe_subscription_id is not null then
    raise exception 'stripe-managed activation % — cancel via Stripe billing portal', p_slug;
  end if;

  -- NEU: admin-zugewiesene Grants (comped/external, oder re-grantete) sind NICHT self-service kündbar.
  if v_aa.granted_by is not null then
    raise exception 'Dieses Addon wurde von Leadesk zugewiesen und kann nicht selbst gekündigt werden. Bitte wende dich an den Support.';
  end if;

  update public.account_addons
  set status = 'canceled', canceled_at = now(), updated_at = now()
  where id = v_aa.id;

  return jsonb_build_object('ok', true, 'account_id', v_account_id, 'addon', p_slug, 'status', 'canceled', 'canceled_at', now());
end;
$function$;

-- (2) admin_heal_addon_sync: + billing_type='stripe'-Guard (nach dem Row-Fetch)
CREATE OR REPLACE FUNCTION public.admin_heal_addon_sync(p_account_addon_id uuid, p_new_status text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','pg_temp' AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_aa       public.account_addons%ROWTYPE;
  v_slug     text;
  v_new_canceled_at timestamptz;
BEGIN
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)'; END IF;
  IF p_new_status IS NULL OR p_new_status NOT IN ('active','past_due','canceled','paused','pending') THEN
    RAISE EXCEPTION 'Invalid status %, allowed: active/past_due/canceled/paused/pending', p_new_status; END IF;

  SELECT * INTO v_aa FROM public.account_addons WHERE id = p_account_addon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_addon % not found', p_account_addon_id; END IF;

  -- NEU: nur Stripe-Addons an Stripe-Wahrheit angleichen. grandfathered/comped/external haben keine Stripe-Sub
  -- → ein Heal würde legitime manuelle/Bestandsgrants fälschlich canceln.
  IF v_aa.billing_type IS DISTINCT FROM 'stripe' THEN
    RAISE EXCEPTION 'Nur Stripe-Addons sind via Sync-Heal angleichbar (billing_type=% ist manuell/grandfathered — kein Stripe-Drift).', v_aa.billing_type;
  END IF;

  IF v_aa.status = p_new_status THEN RAISE EXCEPTION 'account_addon % already has status %', p_account_addon_id, p_new_status; END IF;

  SELECT slug INTO v_slug FROM public.addons WHERE id = v_aa.addon_id;
  v_new_canceled_at := CASE WHEN p_new_status = 'canceled' THEN now() ELSE NULL END;

  UPDATE public.account_addons SET status = p_new_status, canceled_at = v_new_canceled_at, updated_at = now() WHERE id = v_aa.id;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (v_admin_id, 'stripe_drift_healed', 'account_addons', v_aa.id, 'status',
    jsonb_build_object('status', v_aa.status, 'addon_slug', v_slug, 'account_id', v_aa.account_id),
    jsonb_build_object('status', p_new_status, 'addon_slug', v_slug, 'account_id', v_aa.account_id), p_reason);

  RETURN jsonb_build_object('ok', true, 'account_addon_id', v_aa.id, 'before_status', v_aa.status, 'after_status', p_new_status);
END;
$function$;

COMMIT;
