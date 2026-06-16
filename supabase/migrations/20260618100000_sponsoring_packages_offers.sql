-- ============================================================================
-- Phase 1 / Slice 2: Sponsoren, Pakete & Angebote (Modul 4 + Vorgriff Modul 1/10)
-- ----------------------------------------------------------------------------
-- Voraussetzung: Phase-0-Schema-Baseline + Slice-1 (rights/right_items).
-- RLS via public.user_in_team(uuid). PGRST_DB_SCHEMAS=public,sponsoring.
-- psql -v ON_ERROR_STOP=1, Staging zuerst. Timestamp gegen ~/dev pruefen.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Sponsor-Profil (Angebotsempfaenger). Optional verknuepft mit CRM-organization.
-- fit_score ist KI-autoritativ (Modul 10, EF score-sponsor) → UI read-only.
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.sponsor_profiles (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null,
  organization_id uuid references public.organizations(id) on delete set null,
  name            text not null,
  industry        text,
  revenue_class   text,
  status          text not null default 'lead'
                  check (status in ('lead','contacted','qualified','offer','negotiation','won','lost')),
  fit_score       int check (fit_score between 0 and 100),
  fit_score_reasoning jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pakete (Bronze/Silber/Gold/Platin + custom/dynamisch)
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.packages (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null,
  name       text not null,
  tier       text check (tier in ('bronze','silber','gold','platin','custom')),
  is_dynamic boolean not null default false,
  price      numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists sponsoring.package_rights (
  team_id    uuid not null,
  package_id uuid not null references sponsoring.packages(id) on delete cascade,
  right_id   uuid not null references sponsoring.rights(id) on delete cascade,
  primary key (package_id, right_id)
);

-- ---------------------------------------------------------------------------
-- Angebote
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.offers (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null,
  sponsor_profile_id uuid references sponsoring.sponsor_profiles(id) on delete set null,
  package_id         uuid references sponsoring.packages(id) on delete set null,
  total_price        numeric(12,2),
  discount_pct       numeric(5,2) default 0,
  status             text not null default 'draft'
                     check (status in ('draft','sent','negotiation','accepted','declined')),
  pdf_storage_path   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_sp_sponsors_team on sponsoring.sponsor_profiles(team_id);
create index if not exists idx_sp_packages_team on sponsoring.packages(team_id);
create index if not exists idx_sp_offers_team   on sponsoring.offers(team_id);
create index if not exists idx_sp_pkgrights_pkg on sponsoring.package_rights(package_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table sponsoring.sponsor_profiles enable row level security;
alter table sponsoring.packages         enable row level security;
alter table sponsoring.package_rights   enable row level security;
alter table sponsoring.offers           enable row level security;

drop policy if exists spp_all on sponsoring.sponsor_profiles;
create policy spp_all on sponsoring.sponsor_profiles
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

drop policy if exists pkg_all on sponsoring.packages;
create policy pkg_all on sponsoring.packages
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

drop policy if exists pkgr_all on sponsoring.package_rights;
create policy pkgr_all on sponsoring.package_rights
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

drop policy if exists off_all on sponsoring.offers;
create policy off_all on sponsoring.offers
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

-- GRANTs (explizit; Default-Privileges greifen nur fuer kuenftige Objekte)
grant select, insert, update, delete on sponsoring.sponsor_profiles to authenticated;
grant select, insert, update, delete on sponsoring.packages         to authenticated;
grant select, insert, update, delete on sponsoring.package_rights   to authenticated;
grant select, insert, update, delete on sponsoring.offers           to authenticated;
grant all on sponsoring.sponsor_profiles to service_role;
grant all on sponsoring.packages         to service_role;
grant all on sponsoring.package_rights   to service_role;
grant all on sponsoring.offers           to service_role;

-- ---------------------------------------------------------------------------
-- Paket-Wert-View: Summe der Listenpreise der enthaltenen Rechte.
-- security_invoker=true → RLS der Basistabellen gilt fuer den anfragenden User.
-- ---------------------------------------------------------------------------
drop view if exists sponsoring.v_package_value;
create view sponsoring.v_package_value
  with (security_invoker = true)
as
select p.id,
       p.team_id,
       p.name,
       p.tier,
       p.price,
       count(pr.right_id)                 as rights_count,
       coalesce(sum(r.list_price), 0)     as rights_list_total
from sponsoring.packages p
left join sponsoring.package_rights pr on pr.package_id = p.id
left join sponsoring.rights r          on r.id = pr.right_id
group by p.id;

grant select on sponsoring.v_package_value to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
