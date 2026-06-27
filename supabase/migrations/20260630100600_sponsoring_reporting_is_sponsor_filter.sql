-- 20260630100600_sponsoring_reporting_is_sponsor_filter.sql
-- Reporting-RPCs auf is_sponsor-Filter angleichen: Die Sponsoren-Lens zeigt seit der
-- expliziten Markierung nur is_sponsor=true. Die Reporting-Aggregate über
-- sponsoring.sponsor_profiles zählten aber noch alle (auch unmarkierte Glance-Extensions)
-- → Dashboard-Zahlen wichen von der Lens ab.
--
-- Nur die sponsor_profiles-Aggregate werden gefiltert:
--   get_sponsoring_dashboard: Sponsoren-Gesamt + gewonnene Sponsoren + top_partners-Join
--   get_sales_pipeline:       Anzahl + expected_value je cycle_stage
-- Vertrags-/Inventar-/Forecast-/Verlängerungs-KPIs (über contracts/offers/inventory/rights)
-- bleiben UNVERÄNDERT. Basis ist die jeweils aktuelle Live-Definition (org-Join), nur der
-- Filter ist ergänzt. CREATE OR REPLACE erhält Signatur + bestehende GRANTs.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_sponsoring_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sponsoring', 'pg_temp'
AS $function$
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

  -- nur explizit markierte Sponsoren (konsistent mit der Sponsoren-Lens)
  select count(*), count(*) filter (where status = 'won')
    into v_total_sponsors, v_won
  from sponsoring.sponsor_profiles
  where team_id = v_team and is_sponsor = true;

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

  -- top_partners: Name aus organizations (1:1-Extension), nur markierte Sponsoren
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_top
  from (
    select o.name as name, sum(c.total_price) as revenue
    from sponsoring.contracts c
    join sponsoring.sponsor_profiles sp2 on sp2.id = c.sponsor_profile_id
    join public.organizations o on o.id = sp2.organization_id
    where c.team_id = v_team and c.status in ('active','renewed','expiring')
      and sp2.is_sponsor = true
    group by o.name
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
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_pipeline()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sponsoring', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
  v_res jsonb;
begin
  if v_uid is null then return null; end if;
  select t.id into v_team
  from teams t join team_members tm on tm.team_id = t.id
  left join user_preferences up on up.user_id = v_uid
  where tm.user_id = v_uid and (up.active_team_id is null or up.active_team_id = t.id)
  order by (up.active_team_id = t.id) desc nulls last, t.created_at asc limit 1;
  if v_team is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'stage', s.stage, 'label', s.label, 'is_won', s.is_won,
           'sponsors', coalesce(c.cnt,0), 'pipeline_value', coalesce(c.val,0)
         ) order by s.stage), '[]'::jsonb)
    into v_res
  from sponsoring.sales_cycle_stages s
  left join (
    -- nur explizit markierte Sponsoren (konsistent mit der Sponsoren-Lens)
    select cycle_stage, count(*) cnt, coalesce(sum(expected_value),0) val
    from sponsoring.sponsor_profiles
    where team_id = v_team and is_sponsor = true
    group by cycle_stage
  ) c on c.cycle_stage = s.stage
  where s.team_id = v_team;

  return v_res;
end;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
