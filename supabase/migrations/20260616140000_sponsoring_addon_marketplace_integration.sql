-- ============================================================================
-- Phase 0 (Option A / Hand-Merge 2026-06-16): Sponsoring OS als Addon im
-- BESTEHENDEN Marktplatz (public.addons / public.account_addons aus
-- 20260518140000_marketplace_phase_0.sql).
-- ----------------------------------------------------------------------------
-- Das urspruengliche Cowork-Drop-in baute ein PARALLELES System
-- (public.marketplace_addons + eigenes account_addons-Design + module_key),
-- das mit dem bereits vorhandenen Stripe-Addon-System kollidierte
-- (account_addons existierte schon mit anderem Schema, FK -> addons).
--
-- Diese Version integriert stattdessen in den vorhandenen Katalog:
--   * Sponsoring als Zeile in public.addons (activates_modules = {sponsoring}).
--   * Free-Activation ueber den bestehenden account_addons (is_grandfathered=true,
--     status='active') — nur fuer Addons OHNE stripe_price_id (Free-Preview).
--   * Entitlements-Merge liest addons.activates_modules (siehe Folge-Migration
--     20260616140100_extend_get_my_entitlements_addons.sql).
--
-- Idempotent (create or replace / on conflict): auf einer DB, die addons +
-- account_addons bereits hat (Staging UND Prod), gefahrlos wiederholbar.
-- KEIN marketplace_addons mehr, KEINE neue account_addons-Tabelle, KEINE
-- zusaetzliche RLS-Policy auf account_addons (account_addons_own existiert).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: aktive Addon-Module eines Accounts aus addons.activates_modules.
-- (Gleiches Muster wie public.get_effective_model_tiers fuer promotes_model_tiers.)
-- ---------------------------------------------------------------------------
create or replace function public.account_active_addon_modules(p_account_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct m), '{}')
  from public.account_addons aa
  join public.addons ad on ad.id = aa.addon_id
  cross join lateral unnest(ad.activates_modules) as m
  where aa.account_id = p_account_id
    and aa.status = 'active'
    and ad.is_active = true
    and ad.activates_modules is not null;
$$;

grant execute on function public.account_active_addon_modules(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: Free-Activation (kein Stripe). Nur fuer Addons ohne stripe_price_id.
-- Schreibt in den bestehenden account_addons (status='active',
-- is_grandfathered=true). Direkte Writes sind per RLS gesperrt -> SECURITY DEFINER.
-- ---------------------------------------------------------------------------
create or replace function public.activate_addon(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

grant execute on function public.activate_addon(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Addon deaktivieren (setzt status='canceled').
-- ---------------------------------------------------------------------------
create or replace function public.deactivate_addon(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_account_id uuid;
  v_addon_id   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select id into v_addon_id from public.addons where slug = p_slug;
  if v_addon_id is null then
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

  update public.account_addons
     set status = 'canceled', canceled_at = now(), updated_at = now()
   where account_id = v_account_id and addon_id = v_addon_id;

  return jsonb_build_object('ok', true, 'account_id', v_account_id, 'addon', p_slug, 'status', 'canceled');
end;
$$;

grant execute on function public.deactivate_addon(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: Sponsoring OS in den bestehenden Katalog (Free-Preview: stripe_price_id
-- bleibt NULL -> activate_addon erlaubt die kostenlose Aktivierung).
-- ---------------------------------------------------------------------------
insert into public.addons (
  slug, name, short_description, long_description,
  category, type, price_monthly_cents, currency,
  activates_modules, is_active, is_featured, sort_order
)
values (
  'sponsoring-os',
  'Sponsoring OS',
  'Sponsoring Revenue OS: Rechte/Inventar, Pakete, Angebote, Vertraege, Aktivierung & Hospitality, KI-Scoring und GEO/KI-Sichtbarkeit.',
  'Sponsoring Revenue Operating System: Rechte- & Inventar-Management, Paket-/Angebots-Builder, Vertraege, Aktivierung & Hospitality, KI-Scoring, Leadgenerierung und GEO/KI-Sichtbarkeit. Waehrend der Preview kostenlos aktivierbar.',
  'sponsoring',
  'feature_unlock',
  2900,
  'EUR',
  array['sponsoring'],
  true,
  true,
  50
)
on conflict (slug) do update
  set activates_modules = excluded.activates_modules,
      is_active         = true,
      type              = excluded.type,
      name              = excluded.name,
      short_description = excluded.short_description;

notify pgrst, 'reload schema';
