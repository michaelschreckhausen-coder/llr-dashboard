-- ============================================================================
-- Phase 5 / Vertriebszyklus + Leadesk-Deal-Verschmelzung + Rechte ins Angebot
-- ----------------------------------------------------------------------------
-- Feedback Kap. 13.4: Vertriebszyklus 0..x (0=kein Kontakt .. x=Vertrag) inkl.
-- EUR-Pipeline je Zyklus; Verschmelzung mit Leadesk-Deals/Leads; einzelne Rechte
-- ins Angebot einpflegen (Preis + Verfuegbarkeit aus WaWi); PDF-Versand (Page).
-- Idempotent. RLS via public.user_in_team.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Konfigurierbare Vertriebszyklus-Stufen (0..x) je Team. Seed via RPC unten.
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.sales_cycle_stages (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  stage       int  not null,                 -- 0 = kein Kontakt ... x = Vertrag
  label       text not null,
  is_won      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (team_id, stage)
);
create index if not exists idx_sp_cycle_team on sponsoring.sales_cycle_stages(team_id);

alter table sponsoring.sales_cycle_stages enable row level security;
drop policy if exists cyc_all on sponsoring.sales_cycle_stages;
create policy cyc_all on sponsoring.sales_cycle_stages
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.sales_cycle_stages to authenticated;
grant all on sponsoring.sales_cycle_stages to service_role;

-- Sponsor: aktuelle Zyklusstufe + erwarteter Wert + Verschmelzung mit Leadesk-CRM
-- (lose Referenzen ohne FK: public.deals/public.leads liegen in anderem Schema
--  und sollen das sponsoring-Modul nicht hart koppeln).
alter table sponsoring.sponsor_profiles add column if not exists cycle_stage    int not null default 0;
alter table sponsoring.sponsor_profiles add column if not exists expected_value numeric(12,2);
alter table sponsoring.sponsor_profiles add column if not exists deal_id        uuid;   -- -> public.deals.id (lose)
alter table sponsoring.sponsor_profiles add column if not exists lead_id        uuid;   -- -> public.leads.id (lose)
create index if not exists idx_sp_sponsor_cycle on sponsoring.sponsor_profiles(cycle_stage);

-- ---------------------------------------------------------------------------
-- Einzelne Rechte direkt im Angebot (statt nur Paket). Preis-Snapshot + Liga.
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.offer_rights (
  id        uuid primary key default gen_random_uuid(),
  team_id   uuid not null,
  offer_id  uuid not null references sponsoring.offers(id) on delete cascade,
  right_id  uuid not null references sponsoring.rights(id) on delete restrict,
  qty       int  not null default 1 check (qty > 0),
  unit_price numeric(12,2),                  -- Snapshot bei Angebotserstellung
  created_at timestamptz not null default now(),
  unique (offer_id, right_id)
);
create index if not exists idx_sp_offerrights_offer on sponsoring.offer_rights(offer_id);

alter table sponsoring.offer_rights enable row level security;
drop policy if exists offr_all on sponsoring.offer_rights;
create policy offr_all on sponsoring.offer_rights
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.offer_rights to authenticated;
grant all on sponsoring.offer_rights to service_role;

-- ---------------------------------------------------------------------------
-- Seed Standard-Zyklus 0..6 fuer das aktive Team (idempotent).
-- ---------------------------------------------------------------------------
create or replace function public.seed_sponsoring_cycle()
returns integer
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_team uuid;
  v_cnt  int := 0;
  v_row  record;
  v_seed constant jsonb := '[
    {"stage":0,"label":"Kein Kontakt","won":false},
    {"stage":1,"label":"Erstkontakt","won":false},
    {"stage":2,"label":"Qualifiziert","won":false},
    {"stage":3,"label":"Angebot","won":false},
    {"stage":4,"label":"Verhandlung","won":false},
    {"stage":5,"label":"Muendliche Zusage","won":false},
    {"stage":6,"label":"Vertrag abgeschlossen","won":true}
  ]'::jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select t.id into v_team
  from teams t join team_members tm on tm.team_id = t.id
  left join user_preferences up on up.user_id = v_uid
  where tm.user_id = v_uid and (up.active_team_id is null or up.active_team_id = t.id)
  order by (up.active_team_id = t.id) desc nulls last, t.created_at asc limit 1;
  if v_team is null then raise exception 'no team'; end if;

  for v_row in select * from jsonb_to_recordset(v_seed) as x(stage int, label text, won boolean) loop
    if not exists (select 1 from sponsoring.sales_cycle_stages where team_id=v_team and stage=v_row.stage) then
      insert into sponsoring.sales_cycle_stages (team_id, stage, label, is_won)
      values (v_team, v_row.stage, v_row.label, v_row.won);
      v_cnt := v_cnt + 1;
    end if;
  end loop;
  return v_cnt;
end;
$$;
grant execute on function public.seed_sponsoring_cycle() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: EUR-Pipeline je Zyklusstufe (erwarteter Wert offener Sponsoren je Stage).
-- ---------------------------------------------------------------------------
create or replace function public.get_sales_pipeline()
returns jsonb
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
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
    select cycle_stage, count(*) cnt, coalesce(sum(expected_value),0) val
    from sponsoring.sponsor_profiles
    where team_id = v_team
    group by cycle_stage
  ) c on c.cycle_stage = s.stage
  where s.team_id = v_team;

  return v_res;
end;
$$;
grant execute on function public.get_sales_pipeline() to authenticated;

commit;

notify pgrst, 'reload schema';
