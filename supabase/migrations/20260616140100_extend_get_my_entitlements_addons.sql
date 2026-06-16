-- ============================================================================
-- Phase 0 / Migration 2: get_my_entitlements um aktive Marketplace-Addons
-- erweitern.
-- ----------------------------------------------------------------------------
-- Ziel: Aktive Addon-Module (z.B. 'sponsoring') werden in das zurueckgegebene
-- modules[] gemerged. Dadurch funktionieren ModuleGuard, Sidebar-Gating und
-- hasModule() unveraendert — sie wissen nicht, ob ein Modul aus dem Plan oder
-- aus einem Addon stammt.
--
-- HAND-MERGE (2026-06-16): Diese Datei wurde NICHT 1:1 aus dem Drop-in
-- uebernommen. Das Drop-in-Original war gegen die aeltere Definition
-- (20260504081417) geschrieben und kannte die Felder `permissions` und
-- `is_enterprise` NICHT. Die LIVE-Definition auf Staging (Block 5.2) hat beide.
-- Hier ist die AKTUELLE Live-Funktion 1:1 uebernommen und NUR der Addon-Merge
-- (modules[] = plan.modules ∪ account_active_addon_modules) ergaenzt — alle
-- uebrigen Felder (permissions, is_enterprise, …) bleiben unveraendert.
--
-- ABHAENGIGKEIT: Migration 20260616140000 (account_active_addon_modules,
-- returns text[]) muss vorher applied sein. plans.modules ist text[] (_text).
-- ============================================================================

create or replace function public.get_my_entitlements()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id       uuid := auth.uid();
  v_account_id    uuid;
  v_plan          record;
  v_account       record;
  v_is_active     boolean;
  v_days_left     integer;
  v_is_ent        boolean;
  v_addon_modules text[];
  v_all_modules   text[];
begin
  if v_user_id is null then
    return null;
  end if;

  -- Account des Users über aktives Team finden.
  select t.account_id into v_account_id
  from teams t
  join team_members tm on tm.team_id = t.id
  left join user_preferences up on up.user_id = v_user_id
  where tm.user_id = v_user_id
    and t.account_id is not null
    and (up.active_team_id is null or up.active_team_id = t.id)
  order by (up.active_team_id = t.id) desc nulls last,
           t.created_at asc
  limit 1;

  if v_account_id is null then
    return null;
  end if;

  -- Aktive Addon-Module einmal aufloesen (auch fuer den inaktiv-Plan-Fall).
  v_addon_modules := public.account_active_addon_modules(v_account_id);

  select a.id, a.plan_id, a.status, a.trial_ends_at, a.seat_limit,
         a.plan_expires_at, a.granted_via, a.plan_managed_by
    into v_account
  from accounts a
  where a.id = v_account_id;

  if v_account is null then
    return null;
  end if;

  -- Plan-Lookup erweitert um permissions (Block 5.2 Q6=B)
  select p.id, p.name, p.modules, p.is_trial, p.trial_days, p.is_active, p.permissions
    into v_plan
  from plans p
  where p.id = v_account.plan_id;

  -- Enterprise-Check via Plan-ID-Konstante (Q2)
  v_is_ent := (v_account.plan_id = 'c4c11445-9f97-409a-bfd3-9c9f873c049b'::uuid);

  -- Falls Plan unauffindbar oder deaktiviert: Plan-Module leer, aber Addon-Module
  -- (und die neuen Felder) trotzdem mitgeben.
  if v_plan is null or v_plan.is_active = false then
    v_all_modules := array(select distinct unnest(coalesce(v_addon_modules, '{}'::text[])));
    return jsonb_build_object(
      'account_id',      v_account.id,
      'plan_id',         v_account.plan_id,
      'plan_name',       null,
      'modules',         to_jsonb(v_all_modules),
      'is_trial',        (v_account.status = 'trialing'),
      'trial_ends_at',   v_account.trial_ends_at,
      'trial_days_left', null,
      'account_status',  v_account.status,
      'is_active',       false,
      'plan_expires_at', v_account.plan_expires_at,
      'granted_via',     v_account.granted_via,
      'plan_managed_by', v_account.plan_managed_by,
      -- Block 5.2 (Q6=B):
      'permissions',     '[]'::jsonb,
      'is_enterprise',   v_is_ent
    );
  end if;

  v_is_active := v_account.status in ('trialing','active')
    and (
      v_account.status <> 'trialing'
      or v_account.trial_ends_at is null
      or v_account.trial_ends_at > now()
    );

  v_days_left := case
    when v_account.trial_ends_at is null then null
    else greatest(0, extract(day from v_account.trial_ends_at - now())::integer)
  end;

  -- modules = plan.modules ∪ addon.modules (dedupliziert). plans.modules ist text[].
  v_all_modules := array(
    select distinct unnest(
      coalesce(v_plan.modules, '{}'::text[]) || coalesce(v_addon_modules, '{}'::text[])
    )
  );

  return jsonb_build_object(
    'account_id',      v_account.id,
    'plan_id',         v_plan.id,
    'plan_name',       v_plan.name,
    'modules',         to_jsonb(v_all_modules),
    'is_trial',        v_plan.is_trial or v_account.status = 'trialing',
    'trial_ends_at',   v_account.trial_ends_at,
    'trial_days_left', v_days_left,
    'account_status',  v_account.status,
    'is_active',       v_is_active,
    'plan_expires_at', v_account.plan_expires_at,
    'granted_via',     v_account.granted_via,
    'plan_managed_by', v_account.plan_managed_by,
    -- Block 5.2 (Q6=B):
    'permissions',     coalesce(v_plan.permissions, '[]'::jsonb),
    'is_enterprise',   v_is_ent
  );
end;
$$;

comment on function public.get_my_entitlements is
  'Phase 0 Marketplace (Hand-Merge): modules[] = plan.modules ∪ aktive Addon-Module (account_active_addon_modules). Behaelt permissions + is_enterprise (Block 5.2).';

notify pgrst, 'reload schema';
