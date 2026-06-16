-- ============================================================================
-- Phase 1 / Migration: Rechte- & Inventar-Management (Modul 2 + 3, Kern)
-- ----------------------------------------------------------------------------
-- Tabellen im Schema sponsoring. RLS via BESTEHENDE public.user_in_team(uuid).
-- Voraussetzung: Phase-0-Migrationen (Schema sponsoring + Default-Privileges).
--
-- Vor Apply:
--   * Reihenfolge/Timestamp gegen ~/dev/llr-dashboard pruefen (mounted = stale).
--   * Pre-Flight: select proname from pg_proc where proname='user_in_team';
--   * psql -v ON_ERROR_STOP=1, User supabase_admin, zuerst Staging.
--   * PGRST_DB_SCHEMAS muss public,sponsoring enthalten (sonst 404 ueber API).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Rechte-Kategorien (Stadion / Trikot / Hospitality / Digital / ...)
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.rights_categories (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null,
  name       text not null,
  parent_id  uuid references sponsoring.rights_categories(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rechte (Inventar-Stammdaten)
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.rights (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null,
  category_id   uuid references sponsoring.rights_categories(id) on delete set null,
  name          text not null,
  description   text,
  list_price    numeric(12,2),
  min_term_months int,
  season        text,
  total_slots   int not null default 1 check (total_slots >= 0),
  status        text not null default 'free'
                check (status in ('free','reserved','offered','sold','expired')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Einzelne Inventar-Slots eines Rechts (fuer feingranulare Auslastung)
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.right_items (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  right_id    uuid not null references sponsoring.rights(id) on delete cascade,
  label       text,
  status      text not null default 'free'
              check (status in ('free','reserved','offered','sold','expired')),
  contract_id uuid,
  created_at  timestamptz not null default now()
);

create index if not exists idx_sp_rights_team        on sponsoring.rights(team_id);
create index if not exists idx_sp_rights_category    on sponsoring.rights(category_id);
create index if not exists idx_sp_right_items_right  on sponsoring.right_items(right_id);
create index if not exists idx_sp_categories_team    on sponsoring.rights_categories(team_id);

-- ---------------------------------------------------------------------------
-- RLS (Team-Mandant; bestehende public.user_in_team)
-- ---------------------------------------------------------------------------
alter table sponsoring.rights_categories enable row level security;
alter table sponsoring.rights            enable row level security;
alter table sponsoring.right_items       enable row level security;

drop policy if exists rc_all on sponsoring.rights_categories;
create policy rc_all on sponsoring.rights_categories
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

drop policy if exists r_all on sponsoring.rights;
create policy r_all on sponsoring.rights
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

drop policy if exists ri_all on sponsoring.right_items;
create policy ri_all on sponsoring.right_items
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

-- GRANTs (Default-Privileges aus Phase 0 greifen nur fuer NACH dem ALTER DEFAULT
-- angelegte Objekte → hier zur Sicherheit explizit).
grant select, insert, update, delete on sponsoring.rights_categories to authenticated;
grant select, insert, update, delete on sponsoring.rights            to authenticated;
grant select, insert, update, delete on sponsoring.right_items       to authenticated;
grant all on sponsoring.rights_categories to service_role;
grant all on sponsoring.rights            to service_role;
grant all on sponsoring.right_items       to service_role;

-- ---------------------------------------------------------------------------
-- Auslastungs-View (Modul 3). WICHTIG: security_invoker=true, damit die RLS der
-- Basistabellen gegen den ANFRAGENDEN User greift (sonst wuerde die View die
-- RLS umgehen → fremde Team-Daten sichtbar).
-- ---------------------------------------------------------------------------
drop view if exists sponsoring.v_inventory_load;
create view sponsoring.v_inventory_load
  with (security_invoker = true)
as
select r.id,
       r.team_id,
       r.name,
       r.category_id,
       r.total_slots,
       count(ri.id) filter (where ri.status = 'sold') as sold_slots,
       r.total_slots - count(ri.id) filter (where ri.status = 'sold') as free_slots,
       round(100.0 * count(ri.id) filter (where ri.status = 'sold')
             / nullif(r.total_slots, 0), 1) as utilization_pct
from sponsoring.rights r
left join sponsoring.right_items ri on ri.right_id = r.id
group by r.id;

grant select on sponsoring.v_inventory_load to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Komfort-RPC: Standard-Kategorien fuer das aktive Team anlegen (idempotent).
-- ---------------------------------------------------------------------------
create or replace function public.seed_sponsoring_categories()
returns integer
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_team_id uuid;
  v_count   int := 0;
  v_name    text;
  v_names   text[] := array['Stadion','Trikot','Hospitality','Digital','Aktivierung','Content'];
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

  foreach v_name in array v_names loop
    if not exists (
      select 1 from sponsoring.rights_categories
      where team_id = v_team_id and name = v_name
    ) then
      insert into sponsoring.rights_categories (team_id, name, sort_order)
      values (v_team_id, v_name, array_position(v_names, v_name));
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.seed_sponsoring_categories() to authenticated;

commit;

notify pgrst, 'reload schema';
