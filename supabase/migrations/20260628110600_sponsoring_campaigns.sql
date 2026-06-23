-- ============================================================================
-- Phase 5 / Kampagnentool (NEED Kap. 13.11)
-- ----------------------------------------------------------------------------
-- Kampagne: Titel, Branche, Persona, EUR-Erwartung, Verantwortlicher, zugeordnete
-- Leads/Kontakte (Verknuepfung Leadesk-CRM lose), KI-Ansprachekonzept (Club-Voice
-- /Zielgruppe via generate-EF -> concept jsonb), Leadlisten-Vorschlag.
-- Idempotent. RLS via public.user_in_team.
-- ============================================================================

begin;

create table if not exists sponsoring.campaigns (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null,
  title             text not null,
  industry          text,
  persona           text,
  expected_value    numeric(12,2),
  responsible       uuid,
  brand_voice_id    uuid,                    -- -> public.brand_voices (lose)
  target_audience_id uuid,                   -- -> public.target_audiences (lose)
  status            text not null default 'draft'
                    check (status in ('draft','active','paused','done')),
  concept           jsonb,                   -- KI-Ansprachekonzept (Aktivierungsidee, Storytelling)
  geo_scope         text,                    -- 'stadt' | 'd' | 'international'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_sp_campaigns_team on sponsoring.campaigns(team_id);

alter table sponsoring.campaigns enable row level security;
drop policy if exists camp_all on sponsoring.campaigns;
create policy camp_all on sponsoring.campaigns
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.campaigns to authenticated;
grant all on sponsoring.campaigns to service_role;

-- Zugeordnete Leads/Kontakte (lose Referenz auf Leadesk-CRM bzw. eigene Sponsoren)
create table if not exists sponsoring.campaign_leads (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null,
  campaign_id        uuid not null references sponsoring.campaigns(id) on delete cascade,
  sponsor_profile_id uuid references sponsoring.sponsor_profiles(id) on delete set null,
  contact_id         uuid,                   -- -> public.contacts (lose)
  lead_id            uuid,                   -- -> public.leads (lose)
  external_name      text,                   -- Vorschlag ausserhalb LinkedIn/CRM
  source             text,                   -- 'linkedin' | 'crm' | 'suggestion'
  created_at         timestamptz not null default now()
);
create index if not exists idx_sp_camplead_campaign on sponsoring.campaign_leads(campaign_id);

alter table sponsoring.campaign_leads enable row level security;
drop policy if exists camplead_all on sponsoring.campaign_leads;
create policy camplead_all on sponsoring.campaign_leads
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.campaign_leads to authenticated;
grant all on sponsoring.campaign_leads to service_role;

commit;

notify pgrst, 'reload schema';
