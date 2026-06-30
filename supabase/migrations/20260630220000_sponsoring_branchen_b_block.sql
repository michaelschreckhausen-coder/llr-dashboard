-- ============================================================================
-- Sponsoring OS — B-Block (Branchenanalyse-Erweiterung), Partner-Feedback 27.06.
-- ----------------------------------------------------------------------------
-- B2: KI-Aktivierungskonzept je Akquise-Branche (aus Brand Voice + Zielgruppe +
--     Wissensdatenbank via generate-EF) → in acquisition_industries gespeichert.
-- B3/B4: KI-Zielunternehmen-Vorschläge je Branche + Region (regional/national/
--        international); übernehmbar als Unternehmen (organization_id) und einer
--        Kampagne zuordenbar (campaign_id). Neue Tabelle target_companies.
-- Idempotent. RLS via public.user_in_team. Grants explizit (Self-Host).
-- ============================================================================

begin;

-- B2 ------------------------------------------------------------------------
alter table sponsoring.acquisition_industries
  add column if not exists activation_concept text;

-- B3/B4 ---------------------------------------------------------------------
create table if not exists sponsoring.target_companies (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null,
  industry        text,
  region          text not null default 'regional',   -- regional|national|international
  name            text not null,
  rationale       text,                                -- KI-Begründung (warum passend)
  website         text,
  status          text not null default 'vorschlag',   -- vorschlag|uebernommen|verworfen
  organization_id uuid,                                -- nach Übernahme → public.organizations
  campaign_id     uuid,                                -- B4 → sponsoring.campaigns
  created_at      timestamptz not null default now()
);
create index if not exists idx_sp_tc_team     on sponsoring.target_companies(team_id);
create index if not exists idx_sp_tc_industry on sponsoring.target_companies(industry);
create index if not exists idx_sp_tc_campaign on sponsoring.target_companies(campaign_id);

alter table sponsoring.target_companies enable row level security;
drop policy if exists tc_all on sponsoring.target_companies;
create policy tc_all on sponsoring.target_companies
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.target_companies to authenticated;
grant all on sponsoring.target_companies to service_role;

commit;

notify pgrst, 'reload schema';
