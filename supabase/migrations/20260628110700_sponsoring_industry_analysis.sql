-- ============================================================================
-- Phase 5 / Bestandspartner-/Branchenanalyse + Akquise-Branchenfilter (Kap.13.11)
-- ----------------------------------------------------------------------------
-- Screening der Club-Website auf verlinkte Sponsoren -> offene Branchen, TOP-3-
-- Ebenen-Analyse; Akquise-Filter: Boombranchen, FIT zu Sportart/Club.
-- Befuellung via EF (Block B). Idempotent. RLS via public.user_in_team.
-- ============================================================================

begin;

-- Ergebnis eines Website-/Partnerlisten-Screenings
create table if not exists sponsoring.partner_screenings (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  source_url  text,
  found_partners jsonb,                       -- [{name, url, industry, tier}]
  industries  jsonb,                          -- aggregierte Branchen-Verteilung
  summary     text,
  run_at      timestamptz not null default now()
);
create index if not exists idx_sp_screen_team on sponsoring.partner_screenings(team_id);

alter table sponsoring.partner_screenings enable row level security;
drop policy if exists screen_all on sponsoring.partner_screenings;
create policy screen_all on sponsoring.partner_screenings
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.partner_screenings to authenticated;
grant all on sponsoring.partner_screenings to service_role;

-- Branchen-Klassifikation fuer Akquise-Filter (Boombranche + FIT zu Sportart/Club)
create table if not exists sponsoring.acquisition_industries (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  industry    text not null,
  is_boom     boolean not null default false,
  fits_sport  boolean not null default false,
  open_at_club boolean not null default true,  -- Branche beim Club noch unbesetzt
  note        text,
  created_at  timestamptz not null default now(),
  unique (team_id, industry)
);
create index if not exists idx_sp_acqind_team on sponsoring.acquisition_industries(team_id);

alter table sponsoring.acquisition_industries enable row level security;
drop policy if exists acqind_all on sponsoring.acquisition_industries;
create policy acqind_all on sponsoring.acquisition_industries
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.acquisition_industries to authenticated;
grant all on sponsoring.acquisition_industries to service_role;

commit;

notify pgrst, 'reload schema';
