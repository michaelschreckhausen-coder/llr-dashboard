-- 20260629180000_addon_freepaid_cutover_grandfather_gate.sql
-- Free→Paid-Cutover (Strike2 9€ / Sales-Nav 5€, Stichtag 31.08.2026) — Grandfather-Gate.
--
-- Problem: sobald strike2/sales-nav ein stripe_price_id bekommen (Pattern B → C),
-- müssen Bestandskunden (alle is_grandfathered=true, KEINE stripe_subscription_id)
-- weiter free bleiben UND self-service kündigen können. Heute gaten beide RPCs auf
-- Addon-Ebene → Bestandskunde landet fälschlich im Stripe-Pfad.
--
-- Fix (zwei RPCs, KEIN Schema-Change an Tabellen):
--   get_my_addons()  + is_grandfathered + stripe_subscription_id im Output → Frontend
--     kann pro Slug entscheiden „Kündigen" (free/grandfathered) vs „Verwalten" (Stripe).
--   cancel_addon()   gatet jetzt auf v_aa.stripe_subscription_id (ROW) statt
--     v_addon.stripe_price_id (ADDON) → grandfathered Free-Rows bleiben kündbar,
--     nur echte Stripe-Subs werden auf das Billing-Portal verwiesen.
--
-- Idempotent. Safe auf beiden Envs auch VOR dem Price-Flip (ohne stripe_price_id/
-- stripe_subscription_id ist das Verhalten identisch zu vorher).

BEGIN;

-- get_my_addons: OUT-Signatur ändert sich → DROP vor CREATE.
DROP FUNCTION IF EXISTS public.get_my_addons();

CREATE FUNCTION public.get_my_addons()
 RETURNS TABLE(
   addon_id uuid, slug text, name text, category text, type text,
   status text, activated_at timestamptz, current_period_end timestamptz,
   is_grandfathered boolean, stripe_subscription_id text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id uuid;
BEGIN
  SELECT t.account_id INTO v_account_id
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  LEFT JOIN public.user_preferences up ON up.user_id = auth.uid()
  WHERE tm.user_id = auth.uid()
    AND t.account_id IS NOT NULL
    AND (up.active_team_id IS NULL OR up.active_team_id = t.id)
  ORDER BY (up.active_team_id = t.id) DESC NULLS LAST, t.created_at ASC
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.id, a.slug, a.name, a.category, a.type,
         aa.status, aa.activated_at, aa.current_period_end,
         COALESCE(aa.is_grandfathered, false), aa.stripe_subscription_id
  FROM public.account_addons aa
  JOIN public.addons a ON a.id = aa.addon_id
  WHERE aa.account_id = v_account_id;
END;
$function$;

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

  select * into v_aa
  from public.account_addons
  where account_id = v_account_id and addon_id = v_addon.id;

  if v_aa.id is null then
    raise exception 'no active activation for % on this account', p_slug;
  end if;

  -- Gate auf ROW-Ebene: nur echte Stripe-Subs ans Billing-Portal verweisen.
  -- Grandfathered/Free-Rows (stripe_subscription_id IS NULL) bleiben self-service
  -- kündbar — auch wenn das Addon inzwischen ein stripe_price_id trägt (Cutover).
  if v_aa.stripe_subscription_id is not null then
    raise exception 'stripe-managed activation % — cancel via Stripe billing portal', p_slug;
  end if;

  update public.account_addons
  set status = 'canceled', canceled_at = now(), updated_at = now()
  where id = v_aa.id;

  return jsonb_build_object(
    'ok',          true,
    'account_id',  v_account_id,
    'addon',       p_slug,
    'status',      'canceled',
    'canceled_at', now()
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_addons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_addon(text, boolean) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
