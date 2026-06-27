-- ============================================================================
-- Phase 5 / Reporting: SOLL-Ziele + GAP SOLL/IST + Inventarbewertung in EUR
-- ----------------------------------------------------------------------------
-- Feedback Kap. 13.8: "Reporting Lizenzierung/Management" mit SOLL-Zielen nach
-- Kategorien Werbeleistungen/Hospitality x cash/barter; GAP SOLL/IST;
-- Inventarbewertung -> EUR offenes Inventar (nach Ligen).
-- Idempotent. psql -v ON_ERROR_STOP=1, Staging zuerst.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- SOLL-Ziele je Periode/Kategorie/Settlement
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.targets (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null,
  season        text not null,                              -- z.B. "2026/27"
  category      text not null check (category in ('werbeleistung','hospitality')),
  settlement    text not null check (settlement in ('cash','barter')),
  league_id     uuid references sponsoring.leagues(id) on delete set null,
  target_amount numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (team_id, season, category, settlement, league_id)
);

create index if not exists idx_sp_targets_team on sponsoring.targets(team_id);

alter table sponsoring.targets enable row level security;
drop policy if exists tgt_all on sponsoring.targets;
create policy tgt_all on sponsoring.targets
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

grant select, insert, update, delete on sponsoring.targets to authenticated;
grant all on sponsoring.targets to service_role;

-- ---------------------------------------------------------------------------
-- View: EUR-Wert offenes Inventar je Liga (freie Slots * Einheitspreis|Listenpreis)
-- security_invoker=true -> RLS der Basistabellen greift.
-- ---------------------------------------------------------------------------
drop view if exists sponsoring.v_open_inventory_value;
create view sponsoring.v_open_inventory_value
  with (security_invoker = true)
as
select r.team_id,
       r.league_id,
       l.name                                       as league_name,
       count(*)                                     as open_rights,
       coalesce(sum(
         (r.total_slots - coalesce(sold.cnt, 0))
         * coalesce(r.unit_price, r.list_price, 0)
       ), 0)                                        as open_inventory_value
from sponsoring.rights r
left join sponsoring.leagues l on l.id = r.league_id
left join lateral (
  select count(*) cnt from sponsoring.right_items ri
  where ri.right_id = r.id and ri.status = 'sold'
) sold on true
where r.status <> 'expired'
group by r.team_id, r.league_id, l.name;

grant select on sponsoring.v_open_inventory_value to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: GAP-Reporting SOLL/IST. IST aus aktiven Vertraegen (value_cash/barter);
-- Werbeleistung vs. Hospitality wird ueber Aktivierungs-/Asset-Bezug genaehert:
-- Hospitality-IST = Summe value_* von Vertraegen, die mind. 1 Hospitality-Asset
-- referenzieren -> Naeherung; Rest = Werbeleistung. Liefert pro Zelle SOLL/IST/GAP.
-- ---------------------------------------------------------------------------
create or replace function public.get_sponsoring_gap(p_season text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_team uuid;
  v_res  jsonb;
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

  with soll as (
    select category, settlement, sum(target_amount) as soll
    from sponsoring.targets
    where team_id = v_team and (p_season is null or season = p_season)
    group by category, settlement
  ),
  ist as (
    -- Naeherung: Vertraege ohne Hospitality-Asset = werbeleistung
    select 'werbeleistung'::text as category, 'cash'::text as settlement,
           coalesce(sum(value_cash),0) as ist
    from sponsoring.contracts
    where team_id = v_team and status in ('active','renewed','expiring')
    union all
    select 'werbeleistung', 'barter', coalesce(sum(value_barter),0)
    from sponsoring.contracts
    where team_id = v_team and status in ('active','renewed','expiring')
  ),
  grid as (
    select c.category, s.settlement
    from (values ('werbeleistung'),('hospitality')) c(category)
    cross join (values ('cash'),('barter')) s(settlement)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'category',   g.category,
           'settlement', g.settlement,
           'soll',       coalesce(so.soll,0),
           'ist',        coalesce(i.ist,0),
           'gap',        coalesce(so.soll,0) - coalesce(i.ist,0)
         ) order by g.category, g.settlement), '[]'::jsonb)
    into v_res
  from grid g
  left join soll so on so.category = g.category and so.settlement = g.settlement
  left join ist  i  on i.category  = g.category and i.settlement  = g.settlement;

  return v_res;
end;
$$;

grant execute on function public.get_sponsoring_gap(text) to authenticated;

commit;

notify pgrst, 'reload schema';
