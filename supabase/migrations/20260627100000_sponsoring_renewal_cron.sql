-- ============================================================================
-- Phase 4 / Modul 14: Renewal Engine — täglicher pg_cron-Job
-- ----------------------------------------------------------------------------
-- Rechnet Health team-übergreifend (Service-Kontext, ohne auth.uid) und legt
-- Renewal-Alerts an (Score < 50 ODER Vertragsende ≤ 30 Tage). Die Alerts speisen
-- die Risiko-Liste und sind der Aufhänger für den E-Mail-Alarm (siehe unten).
--
-- Voraussetzung: 20260626100000 (compute_sponsor_health / health_scores).
-- pg_cron muss verfügbar sein (Hetzner-Self-Host: extension installieren).
-- Als supabase_admin ausführen.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Alerts-Tabelle
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.renewal_alerts (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  contract_id uuid not null references sponsoring.contracts(id) on delete cascade,
  reason      text not null check (reason in ('low_health','ending_soon')),
  score       int,
  days_left   int,
  notified_at timestamptz,            -- gesetzt sobald E-Mail/Task raus ist
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (contract_id, reason, resolved)
);

alter table sponsoring.renewal_alerts enable row level security;

drop policy if exists ra_all on sponsoring.renewal_alerts;
create policy ra_all on sponsoring.renewal_alerts
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

grant select, insert, update, delete on sponsoring.renewal_alerts to authenticated;
grant all on sponsoring.renewal_alerts to service_role;

-- ---------------------------------------------------------------------------
-- Service-Variante der Health-Berechnung (OHNE user_in_team-Check) —
-- nur fuer Cron/Service, daher execute NICHT an authenticated.
-- ---------------------------------------------------------------------------
create or replace function public.compute_sponsor_health_svc(p_contract_id uuid)
returns int
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_c sponsoring.contracts;
  v_total int; v_done int; v_act numeric; v_geo numeric; v_sig int; v_score numeric;
begin
  select * into v_c from sponsoring.contracts where id = p_contract_id;
  if v_c.id is null then return null; end if;

  select count(*), count(*) filter (where status in ('done','reported')) into v_total, v_done
  from sponsoring.activations where contract_id = p_contract_id;
  v_act := case when v_total > 0 then v_done::numeric / v_total else 0 end;

  select coalesce(max(visibility_index), 0) / 100.0 into v_geo
  from sponsoring.v_geo_visibility where subject_ref = v_c.sponsor_profile_id;

  select count(*) into v_sig from sponsoring.signals
  where sponsor_profile_id = v_c.sponsor_profile_id and detected_at > now() - interval '180 days';

  v_score := greatest(0, least(100, round(
    50 + v_act*25 + v_geo*15 + least(v_sig,5)/5.0*10
    + case v_c.status when 'expiring' then -10 when 'churned' then -30 when 'expired' then -30 else 0 end
  )));

  insert into sponsoring.health_scores (team_id, contract_id, score, drivers)
  values (v_c.team_id, p_contract_id, v_score,
          jsonb_build_object('activation_ratio', round(v_act,2), 'activations_done', v_done,
                             'activations_total', v_total, 'geo_visibility', round(v_geo*100),
                             'signals_180d', v_sig, 'contract_status', v_c.status, 'source', 'cron'));
  return v_score::int;
end;
$$;

revoke all on function public.compute_sponsor_health_svc(uuid) from public;
grant execute on function public.compute_sponsor_health_svc(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Cron-Job-Funktion: alle Vertraege rechnen + Alerts anlegen.
-- ---------------------------------------------------------------------------
create or replace function public.sponsoring_renewal_cron()
returns void
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_c    record;
  v_days int;
begin
  -- 1) Health neu rechnen (alle aktiven/auslaufenden Vertraege)
  for v_c in
    select id from sponsoring.contracts
    where status in ('active','expiring','renewed')
  loop
    perform public.compute_sponsor_health_svc(v_c.id);
  end loop;

  -- 2) Alerts: niedriger Health
  insert into sponsoring.renewal_alerts (team_id, contract_id, reason, score)
  select h.team_id, h.contract_id, 'low_health', h.score
  from sponsoring.v_contract_health h
  join sponsoring.contracts c on c.id = h.contract_id and c.status in ('active','expiring')
  where h.score < 50
  on conflict (contract_id, reason, resolved) do nothing;

  -- 3) Alerts: Vertragsende <= 30 Tage
  insert into sponsoring.renewal_alerts (team_id, contract_id, reason, days_left)
  select c.team_id, c.id, 'ending_soon', (c.ends_on - current_date)
  from sponsoring.contracts c
  where c.status in ('active','expiring')
    and c.ends_on is not null
    and c.ends_on <= current_date + 30
    and c.ends_on >= current_date
  on conflict (contract_id, reason, resolved) do nothing;

  -- 4) OPTIONAL E-Mail-Alarm (auskommentiert — pro Env aktivieren):
  --    Voraussetzung: extension pg_net + Edge Function send-templated-email.
  --    Pro nicht-benachrichtigtem Alert eine Mail ausloesen, dann notified_at setzen.
  --
  -- perform net.http_post(
  --   url     := 'https://supabase.leadesk.de/functions/v1/send-templated-email',
  --   headers := jsonb_build_object('Content-Type','application/json',
  --                                 'Authorization','Bearer ' || current_setting('app.service_role_key', true)),
  --   body    := jsonb_build_object('template','renewal_alert','alert_ids', (select jsonb_agg(id) from sponsoring.renewal_alerts where notified_at is null))
  -- );
  -- update sponsoring.renewal_alerts set notified_at = now() where notified_at is null;
end;
$$;

revoke all on function public.sponsoring_renewal_cron() from public;
grant execute on function public.sponsoring_renewal_cron() to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Cron-Registrierung (separat, da pg_cron-Extension noetig).
-- Auf Hetzner-Self-Host ggf. zuerst:  create extension if not exists pg_cron;
-- Danach (idempotent — vorher evtl. vorhandenen Job entfernen):
-- ---------------------------------------------------------------------------
-- select cron.unschedule('sponsoring-renewal-daily')
--   where exists (select 1 from cron.job where jobname = 'sponsoring-renewal-daily');
-- select cron.schedule('sponsoring-renewal-daily', '0 6 * * *',
--                      $$ select public.sponsoring_renewal_cron(); $$);

notify pgrst, 'reload schema';
