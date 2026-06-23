-- ============================================================================
-- Phase 5 / Querschnitt: Liga-Dimension + cash/barter-Split + Einheiten-Preise
-- ----------------------------------------------------------------------------
-- Schliesst drei mehrfach im Stakeholder-Feedback (Kap. 13) genannte Quer-
-- schnitt-Luecken, die im gebauten Stand (phase0-4) NIRGENDS existieren:
--   1) Liga-Dimension  -> sponsoring.leagues + league_id auf rights/contracts
--   2) cash/barter      -> value_cash/value_barter auf offers + contracts
--   3) Einheiten-Preise -> unit + unit_price auf rights
--
-- Vollstaendig idempotent (CREATE/ALTER ... IF NOT EXISTS) -> unabhaengig davon,
-- ob phase0-4 schon vollstaendig appliert ist.
--
-- Vor Apply (Memory-Disziplin):
--   * psql -v ON_ERROR_STOP=1, User supabase_admin, Staging zuerst.
--   * Pre-Flight: select to_regclass('sponsoring.rights'),
--                        to_regclass('sponsoring.contracts');
--     (beide muessen NOT NULL sein -> phase1 ist appliert).
--   * Self-Host: jede neue Tabelle braucht explizite GRANTs (sonst 42501).
--   * PGRST_DB_SCHEMAS muss public,sponsoring enthalten.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Liga-Stammdaten
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.leagues (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null,
  name       text not null,                 -- z.B. "1. Bundesliga", "Regionalliga"
  short_code text,                           -- z.B. "BL1"
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_sp_leagues_team on sponsoring.leagues(team_id);

alter table sponsoring.leagues enable row level security;
drop policy if exists lg_all on sponsoring.leagues;
create policy lg_all on sponsoring.leagues
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

grant select, insert, update, delete on sponsoring.leagues to authenticated;
grant all on sponsoring.leagues to service_role;

-- ---------------------------------------------------------------------------
-- 2) league_id auf rights (Inventar je Liga) + contracts (Volumen je Liga)
--    on delete set null -> Loeschen einer Liga macht Rechte/Vertraege nicht kaputt.
-- ---------------------------------------------------------------------------
alter table sponsoring.rights
  add column if not exists league_id uuid references sponsoring.leagues(id) on delete set null;
alter table sponsoring.contracts
  add column if not exists league_id uuid references sponsoring.leagues(id) on delete set null;

create index if not exists idx_sp_rights_league    on sponsoring.rights(league_id);
create index if not exists idx_sp_contracts_league on sponsoring.contracts(league_id);

-- ---------------------------------------------------------------------------
-- 3) Einheiten-Preise auf rights (Stueck/Meter/Minute/Pauschal ...)
--    list_price bleibt als Gesamt-/Pauschalpreis erhalten (Rueckwaerts-kompat).
-- ---------------------------------------------------------------------------
alter table sponsoring.rights
  add column if not exists unit       text;                 -- 'Stueck' | 'Meter' | 'Minute' | 'Pauschal' | ...
alter table sponsoring.rights
  add column if not exists unit_price numeric(12,2);        -- Preis je Einheit

-- ---------------------------------------------------------------------------
-- 4) cash/barter-Split auf offers + contracts
--    total_price bleibt als Gesamt (= cash + barter). Default 0, damit
--    Bestandsdaten nicht brechen. App-Logik pflegt beide Teilbetraege.
-- ---------------------------------------------------------------------------
alter table sponsoring.offers
  add column if not exists value_cash   numeric(12,2) not null default 0;
alter table sponsoring.offers
  add column if not exists value_barter numeric(12,2) not null default 0;
alter table sponsoring.contracts
  add column if not exists value_cash   numeric(12,2) not null default 0;
alter table sponsoring.contracts
  add column if not exists value_barter numeric(12,2) not null default 0;

-- Bestandsdaten: bisherigen total_price als cash uebernehmen (best effort, nur
-- wenn cash noch 0 ist und total_price gesetzt). Idempotent genug fuer Re-Run.
update sponsoring.offers
   set value_cash = total_price
 where coalesce(value_cash,0) = 0 and coalesce(value_barter,0) = 0 and total_price is not null;
update sponsoring.contracts
   set value_cash = total_price
 where coalesce(value_cash,0) = 0 and coalesce(value_barter,0) = 0 and total_price is not null;

-- ---------------------------------------------------------------------------
-- 5) Komfort-RPC: Standard-Ligen fuer das aktive Team anlegen (idempotent).
--    Muster wie public.seed_sponsoring_categories() aus phase1.
-- ---------------------------------------------------------------------------
create or replace function public.seed_sponsoring_leagues()
returns integer
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_team_id uuid;
  v_count   int := 0;
  v_row     record;
  v_seed    constant jsonb := '[
    {"name":"1. Bundesliga","short":"BL1","ord":1},
    {"name":"2. Bundesliga","short":"BL2","ord":2},
    {"name":"3. Liga","short":"BL3","ord":3},
    {"name":"Regionalliga","short":"RL","ord":4},
    {"name":"Amateur/Verband","short":"AM","ord":5}
  ]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select t.id into v_team_id
  from public.teams t
  join public.team_members tm on tm.team_id = t.id
  left join public.user_preferences up on up.user_id = v_uid
  where tm.user_id = v_uid
    and (up.active_team_id is null or up.active_team_id = t.id)
  order by (up.active_team_id = t.id) desc nulls last, t.created_at asc
  limit 1;

  if v_team_id is null then
    raise exception 'no team resolvable for user %', v_uid;
  end if;

  for v_row in select * from jsonb_to_recordset(v_seed) as x(name text, short text, ord int) loop
    if not exists (
      select 1 from sponsoring.leagues where team_id = v_team_id and name = v_row.name
    ) then
      insert into sponsoring.leagues (team_id, name, short_code, sort_order)
      values (v_team_id, v_row.name, v_row.short, v_row.ord);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.seed_sponsoring_leagues() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Reporting-View: Volumen je Liga (cash/barter getrennt) aus aktiven Vertraegen.
--    security_invoker=true -> RLS der Basistabelle greift fuer den anfragenden User.
-- ---------------------------------------------------------------------------
drop view if exists sponsoring.v_volume_by_league;
create view sponsoring.v_volume_by_league
  with (security_invoker = true)
as
select c.team_id,
       c.league_id,
       l.name                              as league_name,
       count(*)                            as contracts,
       coalesce(sum(c.value_cash), 0)      as volume_cash,
       coalesce(sum(c.value_barter), 0)    as volume_barter,
       coalesce(sum(c.value_cash + c.value_barter), 0) as volume_total
from sponsoring.contracts c
left join sponsoring.leagues l on l.id = c.league_id
where c.status in ('active','renewed','expiring')
group by c.team_id, c.league_id, l.name;

grant select on sponsoring.v_volume_by_league to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
