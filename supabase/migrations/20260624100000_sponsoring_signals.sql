-- ============================================================================
-- Phase 3 / Modul 11: Leadgenerierung — Sponsoring-Signale
-- ----------------------------------------------------------------------------
-- Erkannte Signale (neuer GF, Expansion, Investition, Marketingoffensive, ...)
-- je Organisation/Sponsor, mit Einfluss auf den Fit-Score (score_delta).
-- RLS via public.user_in_team.
-- ============================================================================

begin;

create table if not exists sponsoring.signals (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null,
  sponsor_profile_id uuid references sponsoring.sponsor_profiles(id) on delete cascade,
  organization_id    uuid,
  source             text check (source in ('linkedin','web','press','news','jobs','event','manual')),
  signal_type        text,   -- new_ceo / expansion / new_location / new_product / investment / marketing_push / hiring / other
  summary            text not null,
  url                text,
  score_delta        int not null default 0,
  raw                jsonb,
  detected_at        timestamptz not null default now()
);

create index if not exists idx_sp_signals_team    on sponsoring.signals(team_id);
create index if not exists idx_sp_signals_sponsor on sponsoring.signals(sponsor_profile_id);

alter table sponsoring.signals enable row level security;

drop policy if exists sig_all on sponsoring.signals;
create policy sig_all on sponsoring.signals
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

grant select, insert, update, delete on sponsoring.signals to authenticated;
grant all on sponsoring.signals to service_role;

commit;

notify pgrst, 'reload schema';
