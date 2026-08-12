-- trigger_due_linkedin_publishes: LinkedIn IMMER über Unipile (nativen else-Zweig entfernt).
CREATE OR REPLACE FUNCTION public.trigger_due_linkedin_publishes()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  q record; base_url text; service_key text; v_platform text; v_endpoint text; triggered int := 0;
begin
  base_url := current_setting('app.supabase_functions_url', true);
  service_key := current_setting('app.supabase_service_role_key', true);
  if base_url is null or service_key is null then
    raise warning '[publish-cron] app.supabase_functions_url oder app.supabase_service_role_key fehlt'; return 0;
  end if;
  for q in
    update public.post_publish_queue set status='in_progress', last_attempt_at=now(), attempts=attempts+1
    where id in (select id from public.post_publish_queue where status='pending' and scheduled_for<=now() and attempts<3 order by scheduled_for asc limit 10 for update skip locked)
    returning id, post_id
  loop
    select platform into v_platform from public.content_posts where id=q.post_id;
    -- Unipile-only: LinkedIn IMMER über unipile-post-publish; Instagram eigener Endpoint.
    if v_platform='instagram' then v_endpoint := base_url || '/instagram-publish-post';
    else v_endpoint := base_url || '/unipile-post-publish'; end if;
    perform net.http_post(url:=v_endpoint,
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),
      body:=jsonb_build_object('queue_id', q.id, 'post_id', q.post_id));
    triggered := triggered + 1;
  end loop;
  return triggered;
end $function$;
