-- 20260628170000_addon_activation_backend_prod_parity.sql
-- Phase 7 Prerequisite: Self-Service-Addon-Activation auf Prod nachziehen
-- (war Staging-only). Ohne das wäre ein Addon-Gate ein Lockout-Bug: i_have_addon
-- (Gate) existiert auf Prod, aber activate_addon (Aktivierung) fehlte → niemand
-- könnte sich freischalten.
--
-- Pre-Flight verifiziert (Prod, 2026-06-18):
--   - addons.stripe_price_id existiert (RPC-Body referenziert es)
--   - account_addons_account_id_addon_id_key UNIQUE (account_id, addon_id) (ON CONFLICT)
--   - account_addons.status-CHECK: active|past_due|canceled|paused|pending
--   - is_grandfathered fehlt auf Prod (Staging hat es) → hier ergänzt
--   - activate_addon fehlt auf Prod → hier 1:1 von Staging
-- Idempotent.

BEGIN;

-- 1. Parität: is_grandfathered (Free-Activation-Marker). Bestehende Rows (z.B.
--    auralis via Admin/Stripe-Pfad) bleiben false — korrekt, die sind nicht grandfathered.
ALTER TABLE public.account_addons
  ADD COLUMN IF NOT EXISTS is_grandfathered boolean NOT NULL DEFAULT false;

-- 2. activate_addon — 1:1 von Staging. Free-Activation NUR für Addons ohne
--    stripe_price_id (bezahlte laufen über Checkout+Webhook). Account via aktives
--    Team aufgelöst (gleiche Logik wie get_my_entitlements). Setzt status='active'
--    + is_grandfathered=true.
CREATE OR REPLACE FUNCTION public.activate_addon(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid        uuid := auth.uid();
  v_account_id uuid;
  v_addon      public.addons;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_addon
  from public.addons
  where slug = p_slug and is_active = true;

  if v_addon.id is null then
    raise exception 'addon not found or inactive: %', p_slug;
  end if;

  -- Free-Activation nur fuer Preview-Addons (ohne Stripe-Preis). Bezahlte
  -- Addons laufen ueber create-addon-checkout-session + Stripe-Webhook.
  if v_addon.stripe_price_id is not null then
    raise exception 'addon % requires checkout (not free)', p_slug;
  end if;

  -- Account ueber aktives Team aufloesen (gleiche Logik wie get_my_entitlements).
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

  insert into public.account_addons (account_id, addon_id, status, is_grandfathered, activated_at)
  values (v_account_id, v_addon.id, 'active', true, now())
  on conflict (account_id, addon_id)
  do update set status = 'active', canceled_at = null, updated_at = now();

  return jsonb_build_object(
    'ok',         true,
    'account_id', v_account_id,
    'addon',      v_addon.slug,
    'modules',    to_jsonb(v_addon.activates_modules),
    'billing',    'free'
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.activate_addon(text) FROM public;
GRANT EXECUTE ON FUNCTION public.activate_addon(text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
