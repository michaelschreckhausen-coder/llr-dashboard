-- ============================================================================
-- Phase 5 / MockUp-Tool LED-Bande (NEED Kap. 13.11)
-- ----------------------------------------------------------------------------
-- Stadion-Standardbilder (Vorlage mit LED-Bande) + generierte Mockups (KI setzt
-- Sponsorenlogo auf die Bande). Generierung via EF generate-mockup (Block B,
-- andockend an bestehende generate-image-EF). Idempotent.
-- ============================================================================

begin;

-- Stadion-Vorlagen (Bild im Bucket 'sponsoring-stadium')
create table if not exists sponsoring.stadium_templates (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null,
  name         text not null,                -- z.B. "Haupttribuene LED Mittellinie"
  placement    text,                         -- 'led_bande' | 'trikot' | 'banner' ...
  storage_path text not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_sp_stadium_team on sponsoring.stadium_templates(team_id);

alter table sponsoring.stadium_templates enable row level security;
drop policy if exists stadium_all on sponsoring.stadium_templates;
create policy stadium_all on sponsoring.stadium_templates
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.stadium_templates to authenticated;
grant all on sponsoring.stadium_templates to service_role;

-- Generierte Mockups
create table if not exists sponsoring.mockups (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null,
  stadium_template_id uuid references sponsoring.stadium_templates(id) on delete set null,
  sponsor_profile_id  uuid references sponsoring.sponsor_profiles(id) on delete set null,
  logo_path           text,                  -- Input-Logo (Bucket 'sponsoring-mockups')
  result_path         text,                  -- Ergebnis-Bild (Bucket 'sponsoring-mockups')
  status              text not null default 'pending'
                      check (status in ('pending','done','failed')),
  error               text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_sp_mockups_team on sponsoring.mockups(team_id);

alter table sponsoring.mockups enable row level security;
drop policy if exists mockup_all on sponsoring.mockups;
create policy mockup_all on sponsoring.mockups
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.mockups to authenticated;
grant all on sponsoring.mockups to service_role;

commit;

notify pgrst, 'reload schema';
