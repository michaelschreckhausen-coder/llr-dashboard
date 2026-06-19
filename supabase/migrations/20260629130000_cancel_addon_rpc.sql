-- 20260629130000_cancel_addon_rpc.sql
-- cancel_addon(p_slug, p_at_period_end) — Self-Service-Kündigung für Customer.
-- Account-Auflösung active_team_id-priorisiert (wie activate_addon/get_my_entitlements).
--   Pattern B (Free, stripe_price_id NULL): sofort status='canceled' + canceled_at=now()
--     (p_at_period_end wird ignoriert — bei Free gibt es keine Stripe-Periode).
--   Pattern C (Paid, stripe_price_id gesetzt): NICHT hier kündigen — das Frontend
--     leitet zum Stripe-Billing-Portal (create-billing-portal-session). Wird die RPC
--     trotzdem für ein Paid-Addon gerufen → Exception mit klarer Anweisung.
-- Audit-Trail: account_addons.canceled_at + updated_at (Row bleibt erhalten, kein DELETE).

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_addon(p_slug text, p_at_period_end boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid        uuid := auth.uid();
  v_account_id uuid;
  v_addon      public.addons;
  v_aa         public.account_addons;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_addon from public.addons where slug = p_slug;
  if v_addon.id is null then
    raise exception 'addon not found: %', p_slug;
  end if;

  -- Account über aktives Team auflösen (identisch zu activate_addon)
  select t.account_id into v_account_id
  from public.teams t
  join public.team_members tm on tm.team_id = t.id
  left join public.user_preferences up on up.user_id = v_uid
  where tm.user_id = v_uid
    and t.account_id is not null
    and (up.active_team_id is null or up.active_team_id = t.id)
  order by (up.active_team_id = t.id) desc nulls last, t.created_at asc
  limit 1;

  if v_account_id is null then
    raise exception 'no account resolvable for user %', v_uid;
  end if;

  -- Paid-Addons werden NICHT hier gekündigt → Stripe-Billing-Portal
  if v_addon.stripe_price_id is not null then
    raise exception 'paid addon % — cancel via Stripe billing portal, not cancel_addon', p_slug;
  end if;

  select * into v_aa
  from public.account_addons
  where account_id = v_account_id and addon_id = v_addon.id;

  if v_aa.id is null then
    raise exception 'no active activation for % on this account', p_slug;
  end if;

  update public.account_addons
  set status = 'canceled', canceled_at = now(), updated_at = now()
  where id = v_aa.id;

  return jsonb_build_object(
    'ok',         true,
    'account_id', v_account_id,
    'addon',      p_slug,
    'status',     'canceled',
    'canceled_at', now()
  );
end;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
