-- ============================================================================
-- Unipile-Publish-Routing (Phase 2a) — Staging zuerst.
-- ----------------------------------------------------------------------------
-- 1) content_posts.publish_channel: 'native' (Julians LinkedIn-OAuth-Route,
--    /linkedin-publish-post) | 'unipile' (/unipile-post-publish, mit Monitoring).
-- 2) Dispatcher trigger_due_linkedin_publishes() um die Unipile-Route erweitern.
--    1:1 aus 20260701110000_instagram_scheduled_publish_dispatch.sql uebernommen,
--    NUR der Endpoint-Routing-Zweig ergaenzt (+ publish_channel ins SELECT).
--    Gleicher Jobname/Schedule/Claim-Mechanismus (FOR UPDATE SKIP LOCKED,
--    attempts<3). Damit bleibt der Dispatcher der EINZIGE Queue-Consumer ->
--    kein Doppel-Publish (unipile-post-publish scannt die Queue nicht mehr selbst).
-- Idempotent.
-- ============================================================================

begin;

-- 1) Routing-Discriminator auf content_posts
alter table public.content_posts
  add column if not exists publish_channel text not null default 'native';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'content_posts_publish_channel_check'
  ) then
    alter table public.content_posts
      add constraint content_posts_publish_channel_check
      check (publish_channel in ('native','unipile'));
  end if;
end $$;

-- 2) Dispatcher erweitern (CREATE OR REPLACE; Funktionsname + pg_cron-Job
--    process-linkedin-publish-queue + Schedule bleiben unveraendert).
create or replace function public.trigger_due_linkedin_publishes()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  q record;
  base_url          text;
  service_key       text;
  v_platform        text;
  v_publish_channel text;
  v_endpoint        text;
  triggered         int := 0;
begin
  base_url    := current_setting('app.supabase_functions_url', true);
  service_key := current_setting('app.supabase_service_role_key', true);

  if base_url is null or service_key is null then
    raise warning '[publish-cron] app.supabase_functions_url oder app.supabase_service_role_key fehlt';
    return 0;
  end if;

  for q in
    update public.post_publish_queue
    set status = 'in_progress',
        last_attempt_at = now(),
        attempts = attempts + 1
    where id in (
      select id from public.post_publish_queue
      where status = 'pending'
        and scheduled_for <= now()
        and attempts < 3
      order by scheduled_for asc
      limit 10
      for update skip locked
    )
    returning id, post_id
  loop
    -- Plattform + Publish-Channel der Row bestimmen -> Endpoint waehlen.
    select platform, publish_channel
      into v_platform, v_publish_channel
    from public.content_posts
    where id = q.post_id;

    if v_platform = 'instagram' then
      v_endpoint := base_url || '/instagram-publish-post';
    elsif v_publish_channel = 'unipile' then
      v_endpoint := base_url || '/unipile-post-publish';
    else
      v_endpoint := base_url || '/linkedin-publish-post';
    end if;

    perform net.http_post(
      url     := v_endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body    := jsonb_build_object('queue_id', q.id, 'post_id', q.post_id)
    );
    triggered := triggered + 1;
  end loop;

  return triggered;
end $fn$;

comment on function public.trigger_due_linkedin_publishes is
  'Plattform-/Channel-aware Publish-Dispatcher: routet faellige post_publish_queue-Rows nach content_posts.platform (instagram) bzw. publish_channel (unipile) an /instagram-publish-post, /unipile-post-publish oder /linkedin-publish-post (Phase 2a, 2026-07-10).';

commit;
