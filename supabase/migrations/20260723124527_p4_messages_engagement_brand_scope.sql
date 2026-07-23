-- P4: Nachrichten/Engagement brand-scopen. Gleiches sicheres Muster wie P3:
-- brand_voice_id nullable + Auto-Fill-Trigger + Fallback-RLS (nichts verschwindet).

-- 1) Spalten
alter table linkedin_engagement_jobs add column if not exists brand_voice_id uuid references brand_voices(id);
alter table linkedin_post_engagers   add column if not exists brand_voice_id uuid references brand_voices(id);
create index if not exists idx_linkedin_engagement_jobs_bv on linkedin_engagement_jobs(brand_voice_id);
create index if not exists idx_linkedin_post_engagers_bv   on linkedin_post_engagers(brand_voice_id);

-- 2) Backfill
-- 2a) post_engagers: PRÄZISE über den Post → dessen Marke
update linkedin_post_engagers e
   set brand_voice_id = cp.brand_voice_id
  from content_posts cp
 where e.post_id = cp.id and cp.brand_voice_id is not null and e.brand_voice_id is null;
-- 2b) Rest (engagement_jobs + evtl. post_engagers ohne Post-Treffer): User hat genau 1 Marke im Team
with solo as (
  select ua.user_id, ua.team_id, (array_agg(distinct ua.brand_voice_id))[1] as bv
    from unipile_accounts ua where ua.brand_voice_id is not null
   group by ua.user_id, ua.team_id having count(distinct ua.brand_voice_id) = 1
)
update linkedin_engagement_jobs x set brand_voice_id = solo.bv
  from solo where x.user_id = solo.user_id and x.team_id = solo.team_id and x.brand_voice_id is null;
with solo as (
  select ua.user_id, ua.team_id, (array_agg(distinct ua.brand_voice_id))[1] as bv
    from unipile_accounts ua where ua.brand_voice_id is not null
   group by ua.user_id, ua.team_id having count(distinct ua.brand_voice_id) = 1
)
update linkedin_post_engagers x set brand_voice_id = solo.bv
  from solo where x.user_id = solo.user_id and x.team_id = solo.team_id and x.brand_voice_id is null;

-- 3) Auto-Fill-Trigger (reuse set_linkedin_brand_voice)
drop trigger if exists trg_bv_autofill on linkedin_engagement_jobs;
create trigger trg_bv_autofill before insert on linkedin_engagement_jobs for each row execute function set_linkedin_brand_voice();
drop trigger if exists trg_bv_autofill on linkedin_post_engagers;
create trigger trg_bv_autofill before insert on linkedin_post_engagers for each row execute function set_linkedin_brand_voice();
drop trigger if exists trg_bv_autofill on linkedin_messages;
create trigger trg_bv_autofill before insert on linkedin_messages for each row execute function set_linkedin_brand_voice();

-- 4) RLS brand + Fallback
drop policy if exists linkedin_engagement_select on linkedin_engagement_jobs;
drop policy if exists linkedin_engagement_insert on linkedin_engagement_jobs;
drop policy if exists linkedin_engagement_update on linkedin_engagement_jobs;
drop policy if exists linkedin_engagement_delete on linkedin_engagement_jobs;
drop policy if exists linkedin_engagement_brand on linkedin_engagement_jobs;
create policy linkedin_engagement_brand on linkedin_engagement_jobs for all
  using      (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()))
  with check (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()));

drop policy if exists linkedin_engagers_select on linkedin_post_engagers;
drop policy if exists linkedin_engagers_brand on linkedin_post_engagers;
create policy linkedin_engagers_brand on linkedin_post_engagers for all
  using      (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()))
  with check (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()));

drop policy if exists linkedin_messages_team_scoped on linkedin_messages;
drop policy if exists linkedin_messages_brand on linkedin_messages;
create policy linkedin_messages_brand on linkedin_messages for all
  using      (has_brand_access(brand_voice_id) or (brand_voice_id is null and ((team_id in (select tm.team_id from team_members tm where tm.user_id = auth.uid())) or (team_id is null and user_id = auth.uid()))))
  with check (has_brand_access(brand_voice_id) or (brand_voice_id is null and ((team_id in (select tm.team_id from team_members tm where tm.user_id = auth.uid())) or (team_id is null and user_id = auth.uid()))));

grant all on linkedin_engagement_jobs, linkedin_post_engagers, linkedin_messages to authenticated;
notify pgrst, 'reload schema';
