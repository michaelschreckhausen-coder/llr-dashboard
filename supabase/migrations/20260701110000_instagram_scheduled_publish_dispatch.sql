-- ============================================================================
-- Plattform-aware Publish-Dispatcher (Instagram-Scheduling, IK2.1)
-- ----------------------------------------------------------------------------
-- Bisher routete trigger_due_linkedin_publishes() ALLE faelligen
-- post_publish_queue-Rows pauschal an /linkedin-publish-post. Mit Instagram
-- als zweiter Plattform muss pro Row nach content_posts.platform geroutet werden:
--   instagram -> /instagram-publish-post
--   sonst     -> /linkedin-publish-post (unveraendert)
--
-- CREATE OR REPLACE behaelt Funktionsname + bestehenden pg_cron-Job
-- (process-linkedin-publish-queue, */5). Kein Re-Schedule noetig.
-- Idempotent. Voraussetzung: app.supabase_functions_url + app.supabase_service_role_key
-- sind als DB-Settings gesetzt (siehe 20260526150000, manueller Post-Deploy-Schritt).
-- ============================================================================

begin;

create or replace function public.trigger_due_linkedin_publishes()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  q record;
  base_url     text;
  service_key  text;
  v_platform   text;
  v_endpoint   text;
  triggered    int := 0;
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
    -- Plattform der Row bestimmen -> Endpoint waehlen.
    select platform into v_platform
    from public.content_posts
    where id = q.post_id;

    if v_platform = 'instagram' then
      v_endpoint := base_url || '/instagram-publish-post';
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
  'Plattform-aware Publish-Dispatcher: routet faellige post_publish_queue-Rows nach content_posts.platform an /instagram-publish-post bzw. /linkedin-publish-post (IK2.1, 2026-07-01).';

commit;
