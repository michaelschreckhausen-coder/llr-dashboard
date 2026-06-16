-- ============================================================================
-- Phase 2 / Modul 6: Sponsorenaktivierung
-- ----------------------------------------------------------------------------
-- Aktivierungsmassnahmen je Vertrag mit Status-Workflow
-- (geplant -> in Umsetzung -> abgeschlossen -> reportet).
-- Voraussetzung: Phase 1 (contracts). RLS via public.user_in_team.
-- ============================================================================

begin;

create table if not exists sponsoring.activations (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null,
  contract_id   uuid references sponsoring.contracts(id) on delete cascade,
  title         text not null,
  type          text check (type in ('social_post','video','interview','hospitality','event','newsletter','content','other')),
  status        text not null default 'planned'
                check (status in ('planned','in_progress','done','reported')),
  scheduled_for date,
  responsible   uuid,
  proof_url     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_sp_act_team     on sponsoring.activations(team_id);
create index if not exists idx_sp_act_contract on sponsoring.activations(contract_id);

alter table sponsoring.activations enable row level security;

drop policy if exists act_all on sponsoring.activations;
create policy act_all on sponsoring.activations
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

grant select, insert, update, delete on sponsoring.activations to authenticated;
grant all on sponsoring.activations to service_role;

commit;

notify pgrst, 'reload schema';
