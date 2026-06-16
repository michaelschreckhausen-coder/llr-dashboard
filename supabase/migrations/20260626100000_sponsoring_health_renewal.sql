-- ============================================================================
-- Phase 4 / Modul 15 + 14: Sponsor Success (Health Score) & Renewal-Risiko
-- ----------------------------------------------------------------------------
-- health_scores + deterministische Berechnung aus Aktivierung, GEO-Sichtbarkeit,
-- Signalen und Vertragsstatus. recompute-all je Team. v_contract_health = letzter
-- Score je Vertrag. RLS via public.user_in_team.
-- Voraussetzung: Phase 1 (contracts), Phase 2 (activations), Phase 3/4 (signals,
-- v_geo_visibility) — fehlende Quellen werden neutral behandelt.
-- ============================================================================

begin;

create table if not exists sponsoring.health_scores (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  contract_id uuid references sponsoring.contracts(id) on delete cascade,
  score       int check (score between 0 and 100),
  drivers     jsonb,
  computed_at timestamptz not null default now()
);

create index if not exists idx_sp_health_team     on sponsoring.health_scores(team_id);
create index if not exists idx_sp_health_contract on sponsoring.health_scores(contract_id, computed_at desc);

alter table sponsoring.health_scores enable row level security;

drop policy if exists hs_all on sponsoring.health_scores;
create policy hs_all on sponsoring.health_scores
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

grant select, insert, update, delete on sponsoring.health_scores to authenticated;
grant all on sponsoring.health_scores to service_role;

-- Letzter Health-Score je Vertrag
drop view if exists sponsoring.v_contract_health;
create view sponsoring.v_contract_health
  with (security_invoker = true)
as
select distinct on (contract_id)
       contract_id, team_id, score, drivers, computed_at
from sponsoring.health_scores
order by contract_id, computed_at desc;

grant select on sponsoring.v_contract_health to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deterministische Health-Berechnung fuer EINEN Vertrag.
-- ---------------------------------------------------------------------------
create or replace function public.compute_sponsor_health(p_contract_id uuid)
returns int
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_contract sponsoring.contracts;
  v_total    int;
  v_done     int;
  v_act      numeric;
  v_geo      numeric;
  v_sig      int;
  v_score    numeric;
  v_drivers  jsonb;
begin
  select * into v_contract from sponsoring.contracts where id = p_contract_id;
  if v_contract.id is null then raise exception 'contract not found: %', p_contract_id; end if;
  if not public.user_in_team(v_contract.team_id) then raise exception 'not authorized'; end if;

  select count(*), count(*) filter (where status in ('done','reported'))
    into v_total, v_done
  from sponsoring.activations where contract_id = p_contract_id;
  v_act := case when v_total > 0 then v_done::numeric / v_total else 0 end;

  select coalesce(max(visibility_index), 0) / 100.0 into v_geo
  from sponsoring.v_geo_visibility where subject_ref = v_contract.sponsor_profile_id;

  select count(*) into v_sig
  from sponsoring.signals
  where sponsor_profile_id = v_contract.sponsor_profile_id
    and detected_at > now() - interval '180 days';

  -- 50 Basis + Aktivierung(25) + GEO(15) + Signale(10) - Status-Malus
  v_score := 50
    + v_act * 25
    + v_geo * 15
    + least(v_sig, 5) / 5.0 * 10
    + case v_contract.status
        when 'expiring' then -10
        when 'churned'  then -30
        when 'expired'  then -30
        else 0
      end;
  v_score := greatest(0, least(100, round(v_score)));

  v_drivers := jsonb_build_object(
    'activation_ratio',  round(v_act, 2),
    'activations_done',  v_done,
    'activations_total', v_total,
    'geo_visibility',    round(v_geo * 100),
    'signals_180d',      v_sig,
    'contract_status',   v_contract.status
  );

  insert into sponsoring.health_scores (team_id, contract_id, score, drivers)
  values (v_contract.team_id, p_contract_id, v_score, v_drivers);

  return v_score::int;
end;
$$;

grant execute on function public.compute_sponsor_health(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Alle Vertraege des aktiven Teams neu bewerten.
-- (Diese RPC ist auch der Aufhaenger fuer einen spaeteren pg_cron-Job —
--  Renewal Engine: taeglich rechnen + bei Score < 50 Alarm-Mail/Task.)
-- ---------------------------------------------------------------------------
create or replace function public.recompute_sponsor_health_all()
returns int
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_team uuid;
  v_c    record;
  v_n    int := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select t.id into v_team
  from teams t
  join team_members tm on tm.team_id = t.id
  left join user_preferences up on up.user_id = v_uid
  where tm.user_id = v_uid
    and (up.active_team_id is null or up.active_team_id = t.id)
  order by (up.active_team_id = t.id) desc nulls last, t.created_at asc
  limit 1;

  if v_team is null then raise exception 'no team resolvable'; end if;

  for v_c in select id from sponsoring.contracts where team_id = v_team loop
    perform public.compute_sponsor_health(v_c.id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

grant execute on function public.recompute_sponsor_health_all() to authenticated;

commit;

notify pgrst, 'reload schema';
