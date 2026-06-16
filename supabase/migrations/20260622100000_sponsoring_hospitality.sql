-- ============================================================================
-- Phase 2 / Modul 7: Hospitality-Management
-- ----------------------------------------------------------------------------
-- Assets (VIP-Karten/Business-Seats/Logen/Events) + Gaeste mit Check-in/No-Show.
-- v_hospitality_load liefert Auslastung + No-Show-Rate (security_invoker).
-- RLS via public.user_in_team.
-- ============================================================================

begin;

create table if not exists sponsoring.hospitality_assets (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null,
  name       text not null,
  type       text check (type in ('vip_card','business_seat','loge','event')),
  capacity   int not null default 0 check (capacity >= 0),
  event_date date,
  created_at timestamptz not null default now()
);

create table if not exists sponsoring.hospitality_guests (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  asset_id    uuid not null references sponsoring.hospitality_assets(id) on delete cascade,
  contact_id  uuid,                    -- optional Verknuepfung zu sponsoring.contacts (spaeter)
  guest_name  text not null,
  invited     boolean not null default false,
  checked_in  boolean not null default false,
  no_show     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_sp_hosp_assets_team on sponsoring.hospitality_assets(team_id);
create index if not exists idx_sp_hosp_guests_asset on sponsoring.hospitality_guests(asset_id);

alter table sponsoring.hospitality_assets enable row level security;
alter table sponsoring.hospitality_guests enable row level security;

drop policy if exists ha_all on sponsoring.hospitality_assets;
create policy ha_all on sponsoring.hospitality_assets
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

drop policy if exists hg_all on sponsoring.hospitality_guests;
create policy hg_all on sponsoring.hospitality_guests
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

grant select, insert, update, delete on sponsoring.hospitality_assets to authenticated;
grant select, insert, update, delete on sponsoring.hospitality_guests to authenticated;
grant all on sponsoring.hospitality_assets to service_role;
grant all on sponsoring.hospitality_guests to service_role;

-- Auslastung + No-Show-Rate
drop view if exists sponsoring.v_hospitality_load;
create view sponsoring.v_hospitality_load
  with (security_invoker = true)
as
select a.id,
       a.team_id,
       a.name,
       a.type,
       a.event_date,
       a.capacity,
       count(g.id)                                    as guests,
       count(g.id) filter (where g.invited)           as invited,
       count(g.id) filter (where g.checked_in)        as checked_in,
       count(g.id) filter (where g.no_show)           as no_shows,
       round(100.0 * count(g.id) filter (where g.no_show)
             / nullif(count(g.id) filter (where g.invited), 0), 1) as no_show_rate
from sponsoring.hospitality_assets a
left join sponsoring.hospitality_guests g on g.asset_id = a.id
group by a.id;

grant select on sponsoring.v_hospitality_load to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
