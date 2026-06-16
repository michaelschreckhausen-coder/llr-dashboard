-- ============================================================================
-- Phase 2 / Modul 8: Sponsoring-Reporting RPC
-- ----------------------------------------------------------------------------
-- get_sponsoring_dashboard(): aggregierte KPIs fuer das aktive Team des Users.
-- SECURITY DEFINER + manuelle Team-Aufloesung (wie get_my_entitlements).
-- Muster: SECURITY-DEFINER-Aggregat-RPC wie Trial-Dashboard / Admin-Liste.
-- ============================================================================

create or replace function public.get_sponsoring_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_uid           uuid := auth.uid();
  v_team          uuid;
  v_total_revenue numeric;
  v_forecast      numeric;
  v_active        int;
  v_avg           numeric;
  v_total_sponsors int;
  v_won           int;
  v_renewed       int;
  v_churned       int;
  v_expired       int;
  v_renewal       numeric;
  v_total_slots   bigint;
  v_sold          bigint;
  v_free_rights   int;
  v_top           jsonb;
begin
  if v_uid is null then return null; end if;

  select t.id into v_team
  from teams t
  join team_members tm on tm.team_id = t.id
  left join user_preferences up on up.user_id = v_uid
  where tm.user_id = v_uid
    and (up.active_team_id is null or up.active_team_id = t.id)
  order by (up.active_team_id = t.id) desc nulls last, t.created_at asc
  limit 1;

  if v_team is null then return null; end if;

  select coalesce(sum(total_price), 0)
    into v_total_revenue
  from sponsoring.contracts
  where team_id = v_team and status in ('active','renewed','expiring');

  select coalesce(sum(total_price), 0)
    into v_forecast
  from sponsoring.offers
  where team_id = v_team and status in ('sent','negotiation');

  select count(*), coalesce(avg(total_price), 0)
    into v_active, v_avg
  from sponsoring.contracts
  where team_id = v_team and status in ('active','renewed','expiring');

  select count(*), count(*) filter (where status = 'won')
    into v_total_sponsors, v_won
  from sponsoring.sponsor_profiles
  where team_id = v_team;

  select count(*) filter (where status = 'renewed'),
         count(*) filter (where status = 'churned'),
         count(*) filter (where status = 'expired')
    into v_renewed, v_churned, v_expired
  from sponsoring.contracts
  where team_id = v_team;

  v_renewal := case
    when (v_renewed + v_churned + v_expired) > 0
      then round(100.0 * v_renewed / (v_renewed + v_churned + v_expired), 1)
    else null
  end;

  select coalesce(sum(total_slots), 0), coalesce(sum(sold_slots), 0)
    into v_total_slots, v_sold
  from sponsoring.v_inventory_load
  where team_id = v_team;

  select count(*) into v_free_rights
  from sponsoring.rights
  where team_id = v_team and status = 'free';

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_top
  from (
    select sp2.name as name, sum(c.total_price) as revenue
    from sponsoring.contracts c
    join sponsoring.sponsor_profiles sp2 on sp2.id = c.sponsor_profile_id
    where c.team_id = v_team and c.status in ('active','renewed','expiring')
    group by sp2.name
    order by revenue desc
    limit 5
  ) x;

  return jsonb_build_object(
    'total_revenue',         v_total_revenue,
    'forecast',              v_forecast,
    'active_contracts',      v_active,
    'avg_contract_value',    round(v_avg, 2),
    'total_sponsors',        v_total_sponsors,
    'won_sponsors',          v_won,
    'renewal_quote',         v_renewal,
    'inventory_total_slots', v_total_slots,
    'inventory_sold_slots',  v_sold,
    'inventory_utilization', case when v_total_slots > 0 then round(100.0 * v_sold / v_total_slots, 1) else 0 end,
    'free_rights',           v_free_rights,
    'top_partners',          v_top
  );
end;
$$;

grant execute on function public.get_sponsoring_dashboard() to authenticated;

notify pgrst, 'reload schema';
