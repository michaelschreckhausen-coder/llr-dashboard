-- Redaktionsplan-Tags (Planner-Stil): team-weite, farbige, umbenennbare Labels + Junction zu Posts
BEGIN;

CREATE TABLE IF NOT EXISTS content_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL,
  name       text NOT NULL DEFAULT '',
  color      text NOT NULL DEFAULT '#3B82F6',
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_post_tags (
  post_id    uuid NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES content_tags(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_content_tags_team      ON content_tags(team_id);
CREATE INDEX IF NOT EXISTS idx_content_post_tags_post ON content_post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_content_post_tags_tag  ON content_post_tags(tag_id);

ALTER TABLE content_tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_post_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_tags_team ON content_tags;
CREATE POLICY content_tags_team ON content_tags FOR ALL
  USING      (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS content_post_tags_team ON content_post_tags;
CREATE POLICY content_post_tags_team ON content_post_tags FOR ALL
  USING      (tag_id IN (SELECT id FROM content_tags WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())))
  WITH CHECK (tag_id IN (SELECT id FROM content_tags WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())));

GRANT ALL ON content_tags      TO authenticated;
GRANT ALL ON content_post_tags TO authenticated;

COMMIT;
