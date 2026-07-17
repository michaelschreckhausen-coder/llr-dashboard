-- Slice 4: Publish-Dispatcher auf Kanal-Routing umstellen.
-- Abstraktion (Julian): offizielle LinkedIn-API bleibt technisch verfügbar, ist aber
-- vorerst NICHT der Default -> LinkedIn-Posts laufen über Unipile, außer publish_channel='official'.
-- Rückweg zur offiziellen API später = publish_channel eines Posts/Accounts auf 'official' setzen.
BEGIN;

-- Default neuer Posts: Unipile
ALTER TABLE public.content_posts ALTER COLUMN publish_channel SET DEFAULT 'unipile';

CREATE OR REPLACE FUNCTION public.trigger_due_linkedin_publishes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  q record; base_url text; service_key text;
  v_platform text; v_channel text; v_endpoint text; triggered int := 0;
BEGIN
  base_url    := current_setting('app.supabase_functions_url', true);
  service_key := current_setting('app.supabase_service_role_key', true);
  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING '[publish-cron] app.supabase_functions_url/service_role_key fehlt'; RETURN 0;
  END IF;

  FOR q IN
    UPDATE public.post_publish_queue
       SET status='in_progress', last_attempt_at=now(), attempts=attempts+1
     WHERE id IN (SELECT id FROM public.post_publish_queue
                   WHERE status='pending' AND scheduled_for<=now() AND attempts<3
                   ORDER BY scheduled_for ASC LIMIT 10 FOR UPDATE SKIP LOCKED)
    RETURNING id, post_id
  LOOP
    SELECT platform, publish_channel INTO v_platform, v_channel
      FROM public.content_posts WHERE id = q.post_id;

    IF v_platform = 'instagram' THEN
      v_endpoint := base_url || '/instagram-publish-post';
    ELSIF v_channel = 'official' THEN
      v_endpoint := base_url || '/linkedin-publish-post';   -- offizielle API (Rückweg)
    ELSE
      v_endpoint := base_url || '/unipile-post-publish';    -- Default: Unipile
    END IF;

    PERFORM net.http_post(
      url     := v_endpoint,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),
      body    := jsonb_build_object('queue_id', q.id, 'post_id', q.post_id));
    triggered := triggered + 1;
  END LOOP;
  RETURN triggered;
END $fn$;

COMMENT ON FUNCTION public.trigger_due_linkedin_publishes IS
  'Kanal-aware Publish-Dispatcher: instagram->instagram-publish-post, publish_channel=official->linkedin-publish-post (offizielle API), sonst->unipile-post-publish (Default). Slice 4, 2026-07-17.';

COMMIT;
