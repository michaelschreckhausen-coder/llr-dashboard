-- ============================================================================
-- Phase 4 / Modul 13: GEO & KI-Sichtbarkeit
-- ----------------------------------------------------------------------------
-- Speichert Laeufe, die pruefen, ob ein Sponsor/Verein/Partnerschaft in
-- KI-/Such-Antworten genannt wird. RLS via public.user_in_team.
-- ============================================================================

begin;

create table if not exists sponsoring.geo_visibility_runs (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null,
  subject_type    text check (subject_type in ('sponsor','club','partnership')),
  subject_name    text not null,
  subject_ref     uuid,
  provider        text not null,   -- chatgpt/perplexity/claude/gemini/copilot/google
  prompt          text,
  mentioned       boolean,
  dominant_topics jsonb,
  raw_response    text,
  run_at          timestamptz not null default now()
);

create index if not exists idx_sp_geo_team on sponsoring.geo_visibility_runs(team_id);
create index if not exists idx_sp_geo_subject on sponsoring.geo_visibility_runs(subject_ref);

alter table sponsoring.geo_visibility_runs enable row level security;

drop policy if exists geo_all on sponsoring.geo_visibility_runs;
create policy geo_all on sponsoring.geo_visibility_runs
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

grant select, insert, update, delete on sponsoring.geo_visibility_runs to authenticated;
grant all on sponsoring.geo_visibility_runs to service_role;

-- Aggregierter Sichtbarkeits-Index je Subject (Anteil "mentioned" der letzten Laeufe)
drop view if exists sponsoring.v_geo_visibility;
create view sponsoring.v_geo_visibility
  with (security_invoker = true)
as
select team_id,
       subject_ref,
       subject_name,
       subject_type,
       count(*)                                  as runs,
       count(*) filter (where mentioned)         as mentions,
       round(100.0 * count(*) filter (where mentioned) / nullif(count(*), 0), 0) as visibility_index,
       max(run_at)                               as last_run_at
from sponsoring.geo_visibility_runs
group by team_id, subject_ref, subject_name, subject_type;

grant select on sponsoring.v_geo_visibility to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
