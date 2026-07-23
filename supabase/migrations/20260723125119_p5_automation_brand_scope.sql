-- P5: Automatisierung (la_*) strikt pro Marke. Kette account→campaign→enrollment→job.
-- Eltern-auflösende Trigger → Runner (la-runner/la-webhook/la-audience-scan) schreibt
-- die Marke automatisch mit, ohne EF-Änderung. Fallback-RLS gegen Datenlücken.

-- 1) Spalten
alter table la_campaigns   add column if not exists brand_voice_id uuid references brand_voices(id);
alter table la_enrollments add column if not exists brand_voice_id uuid references brand_voices(id);
alter table la_audiences   add column if not exists brand_voice_id uuid references brand_voices(id);
alter table la_jobs        add column if not exists brand_voice_id uuid references brand_voices(id);
create index if not exists idx_la_campaigns_bv   on la_campaigns(brand_voice_id);
create index if not exists idx_la_enrollments_bv on la_enrollments(brand_voice_id);
create index if not exists idx_la_audiences_bv   on la_audiences(brand_voice_id);
create index if not exists idx_la_jobs_bv        on la_jobs(brand_voice_id);

-- 2) Backfill entlang der Kette
update la_campaigns c set brand_voice_id = a.brand_voice_id
  from la_accounts a where c.account_id = a.id and a.brand_voice_id is not null and c.brand_voice_id is null;
update la_enrollments e set brand_voice_id = c.brand_voice_id
  from la_campaigns c where e.campaign_id = c.id and c.brand_voice_id is not null and e.brand_voice_id is null;
update la_jobs j set brand_voice_id = e.brand_voice_id
  from la_enrollments e where j.enrollment_id = e.id and e.brand_voice_id is not null and j.brand_voice_id is null;
-- Audiences über die sie nutzenden Kampagnen (eindeutig)
update la_audiences au set brand_voice_id = sub.bv from (
  select audience_id, (array_agg(distinct brand_voice_id))[1] bv
    from la_campaigns where audience_id is not null and brand_voice_id is not null
   group by audience_id having count(distinct brand_voice_id)=1
) sub where au.id = sub.audience_id and au.brand_voice_id is null;

-- 3) Eltern-auflösende Trigger
create or replace function set_la_campaign_brand() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if NEW.brand_voice_id is null and NEW.account_id is not null then
    select brand_voice_id into NEW.brand_voice_id from la_accounts where id = NEW.account_id;
  end if; return NEW;
end $$;
create or replace function set_la_enrollment_brand() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if NEW.brand_voice_id is null and NEW.campaign_id is not null then
    select brand_voice_id into NEW.brand_voice_id from la_campaigns where id = NEW.campaign_id;
  end if; return NEW;
end $$;
create or replace function set_la_job_brand() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if NEW.brand_voice_id is null and NEW.enrollment_id is not null then
    select brand_voice_id into NEW.brand_voice_id from la_enrollments where id = NEW.enrollment_id;
  end if; return NEW;
end $$;
drop trigger if exists trg_bv_autofill on la_campaigns;
create trigger trg_bv_autofill before insert on la_campaigns for each row execute function set_la_campaign_brand();
drop trigger if exists trg_bv_autofill on la_enrollments;
create trigger trg_bv_autofill before insert on la_enrollments for each row execute function set_la_enrollment_brand();
drop trigger if exists trg_bv_autofill on la_jobs;
create trigger trg_bv_autofill before insert on la_jobs for each row execute function set_la_job_brand();

-- 4) RLS brand + Fallback (user_in_team)
do $$ declare t text; begin
  foreach t in array array['la_campaigns','la_enrollments','la_audiences','la_jobs'] loop
    execute format('drop policy if exists %I on %I', t||'_team_all', t);
    execute format('drop policy if exists %I on %I', t||'_brand', t);
    execute format($f$create policy %I on %I for all
      using      (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_in_team(team_id)))
      with check (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_in_team(team_id)))$f$, t||'_brand', t);
    execute format('grant all on %I to authenticated', t);
  end loop;
end $$;
notify pgrst, 'reload schema';
