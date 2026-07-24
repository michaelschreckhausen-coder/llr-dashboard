-- Prod-Spalten-Parität (24.07.2026): fehlende Staging-Spalten, die das gemergte
-- Frontend braucht (behob "column ... does not exist" auf Content-Analytics u.a.).
-- Alle additiv/nullable. Idempotent.
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS type text DEFAULT 'post';
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS is_shared boolean DEFAULT false;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS avoid_words text[];
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS tone text[];
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS style_keywords text[];
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS example_posts text[];
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS custom_instructions text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_org_verified_at timestamptz;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_acting_account_id text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_org_logo_url text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_org_name text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_org_urn text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_org_id text;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS team_id uuid;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS prompt text;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS result text;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.content_history ADD COLUMN IF NOT EXISTS is_shared boolean DEFAULT false;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.linkedin_connections ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz;
ALTER TABLE public.linkedin_connections ADD COLUMN IF NOT EXISTS lead_id uuid;
ALTER TABLE public.linkedin_connections ADD COLUMN IF NOT EXISTS team_id uuid;
ALTER TABLE public.ssi_scores ADD COLUMN IF NOT EXISTS team_id uuid;
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.target_audiences ADD COLUMN IF NOT EXISTS description text;
