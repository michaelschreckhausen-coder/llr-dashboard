-- 1) Erwähnung -> Benachrichtigung (bisher schrieb nichts in notifications).
CREATE OR REPLACE FUNCTION public.notify_content_mention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_title text; v_actor text;
BEGIN
  IF NEW.user_id = NEW.created_by THEN RETURN NEW; END IF;   -- keine Selbst-Benachrichtigung
  SELECT title INTO v_title FROM content_posts WHERE id = NEW.post_id;
  SELECT COALESCE(NULLIF(btrim(p.full_name),''), p.email, 'Ein Teammitglied') INTO v_actor FROM profiles p WHERE p.id = NEW.created_by;
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    NEW.user_id, 'content_mention', 'Du wurdest in einem Beitrag erwähnt',
    COALESCE(v_actor,'Jemand') || ' hat dich in „' || COALESCE(NULLIF(v_title,''),'einem Beitrag') || '" erwähnt.',
    jsonb_build_object('post_id', NEW.post_id, 'team_id', NEW.team_id, 'created_by', NEW.created_by, 'kind','content_mention')
  );
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_notify_content_mention ON public.content_post_mentions;
CREATE TRIGGER trg_notify_content_mention
  AFTER INSERT ON public.content_post_mentions
  FOR EACH ROW EXECUTE FUNCTION public.notify_content_mention();

-- 2) Alle User mit Zugriff auf eine Brand (Owner + is_shared-Team + Direkt-Shares + Team-Shares).
CREATE OR REPLACE FUNCTION public.content_brand_members(p_brand_voice_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  WITH acc AS (
    SELECT bv.user_id AS uid FROM brand_voices bv WHERE bv.id = p_brand_voice_id
    UNION
    SELECT tm.user_id FROM brand_voices bv JOIN team_members tm ON tm.team_id = bv.team_id
      WHERE bv.id = p_brand_voice_id AND bv.is_shared = true
    UNION
    SELECT s.user_id FROM brand_voice_shares s WHERE s.brand_voice_id = p_brand_voice_id
    UNION
    SELECT tm.user_id FROM brand_voice_team_shares ts JOIN team_members tm ON tm.team_id = ts.team_id
      WHERE ts.brand_voice_id = p_brand_voice_id
  )
  SELECT DISTINCT a.uid, p.full_name, p.email, p.avatar_url
  FROM acc a LEFT JOIN profiles p ON p.id = a.uid
  WHERE a.uid IS NOT NULL AND public.has_brand_access(p_brand_voice_id);
$fn$;

GRANT EXECUTE ON FUNCTION public.content_brand_members(uuid) TO authenticated;
