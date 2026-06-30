-- Sponsoring OS — Kampagne als CRM-Klammer (Partner-Feedback 2026-06-27, K2).
-- n:m-Verknüpfung der BESTEHENDEN CRM-Datensätze (keine Duplikate): analog zur
-- bereits existierenden sponsoring.campaign_leads ergänzen wir campaign_deals +
-- campaign_organizations. Referenzen sind lose uuids auf public.deals/organizations
-- (gleiches Muster wie campaign_leads.lead_id), Cascade nur auf campaign_id.
-- Additiv + idempotent.

-- ── Deals ──────────────────────────────────────────────────────────────────
create table if not exists sponsoring.campaign_deals (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  campaign_id uuid not null references sponsoring.campaigns(id) on delete cascade,
  deal_id     uuid not null,            -- -> public.deals (lose, echter Datensatz)
  created_at  timestamptz not null default now(),
  unique (campaign_id, deal_id)
);
create index if not exists idx_sp_campdeal_campaign on sponsoring.campaign_deals(campaign_id);
create index if not exists idx_sp_campdeal_team     on sponsoring.campaign_deals(team_id);

alter table sponsoring.campaign_deals enable row level security;
drop policy if exists campdeal_all on sponsoring.campaign_deals;
create policy campdeal_all on sponsoring.campaign_deals
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.campaign_deals to authenticated;
grant all on sponsoring.campaign_deals to service_role;

-- ── Organisationen / Unternehmen ───────────────────────────────────────────
create table if not exists sponsoring.campaign_organizations (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null,
  campaign_id     uuid not null references sponsoring.campaigns(id) on delete cascade,
  organization_id uuid not null,        -- -> public.organizations (lose, echter Datensatz)
  created_at      timestamptz not null default now(),
  unique (campaign_id, organization_id)
);
create index if not exists idx_sp_camporg_campaign on sponsoring.campaign_organizations(campaign_id);
create index if not exists idx_sp_camporg_team     on sponsoring.campaign_organizations(team_id);

alter table sponsoring.campaign_organizations enable row level security;
drop policy if exists camporg_all on sponsoring.campaign_organizations;
create policy camporg_all on sponsoring.campaign_organizations
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.campaign_organizations to authenticated;
grant all on sponsoring.campaign_organizations to service_role;

notify pgrst, 'reload schema';
