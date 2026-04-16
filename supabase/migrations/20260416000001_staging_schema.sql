-- ================================================================
-- Leadesk Staging Schema Migration
-- Vollständiges Schema aus Production exportiert
-- Datum: April 2026
-- ================================================================

-- ── Extensions ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUM Types ───────────────────────────────────────────────────
CREATE TYPE public.crm_activity_level AS ENUM ('hoch', 'mittel', 'niedrig', 'inaktiv', 'unbekannt');
CREATE TYPE public.crm_buying_intent AS ENUM ('hoch', 'mittel', 'niedrig', 'unbekannt');
CREATE TYPE public.crm_company_size AS ENUM ('1', '2-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+');
CREATE TYPE public.crm_connection_status AS ENUM ('nicht_verbunden', 'pending', 'verbunden', 'abgelehnt', 'blockiert');
CREATE TYPE public.crm_deal_stage AS ENUM ('kein_deal', 'prospect', 'opportunity', 'angebot', 'verhandlung', 'gewonnen', 'verloren', 'stage_custom1', 'stage_custom2', 'stage_custom3');
CREATE TYPE public.crm_lead_source AS ENUM ('linkedin', 'website', 'referral', 'cold_outreach', 'event', 'import', 'inbound', 'paid_social', 'organic_search', 'other');
CREATE TYPE public.crm_lead_status AS ENUM ('new', 'open', 'in_progress', 'open_deal', 'unqualified', 'attempted_to_contact', 'connected', 'bad_timing');
CREATE TYPE public.crm_lifecycle_stage AS ENUM ('subscriber', 'lead', 'marketing_qualified', 'sales_qualified', 'opportunity', 'customer', 'evangelist', 'other');
CREATE TYPE public.crm_reply_behavior AS ENUM ('schnell', 'langsam', 'keine_antwort', 'unbekannt');
CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE public.license_status AS ENUM ('active', 'expired', 'revoked', 'pending');
CREATE TYPE public.user_role AS ENUM ('admin', 'team_member', 'user', 'member', 'owner');

-- ── Sequences ────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS usage_id_seq;

-- ── Tables ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  email text,
  plan_id text DEFAULT 'free',
  plan_expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  tone_profile text,
  output_language text DEFAULT 'auto',
  role text DEFAULT 'user' NOT NULL,
  full_name text DEFAULT '',
  company text DEFAULT '',
  headline text DEFAULT '',
  bio text DEFAULT '',
  avatar_url text DEFAULT '',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text DEFAULT 'free',
  trial_ends_at timestamptz,
  deleted_at timestamptz,
  global_role user_role DEFAULT 'user',
  account_status text DEFAULT 'active' NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plans (
  id text NOT NULL PRIMARY KEY,
  name text NOT NULL,
  daily_limit integer NOT NULL,
  price_eur numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  description text,
  max_leads integer DEFAULT 50,
  max_lists integer DEFAULT 3,
  ai_access boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  wix_plan_id text,
  wix_plan_name text,
  feature_pipeline boolean DEFAULT false,
  feature_brand_voice boolean DEFAULT false,
  feature_reports boolean DEFAULT false,
  ai_calls_monthly integer DEFAULT 50,
  leads_monthly integer DEFAULT 100,
  seats integer DEFAULT 1,
  stripe_price_id text,
  features jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_id uuid,
  plan text DEFAULT 'free',
  max_seats integer DEFAULT 1,
  billing_email text,
  stripe_customer_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role user_role DEFAULT 'user' NOT NULL,
  joined_at timestamptz DEFAULT now(),
  invited_by uuid,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  role user_role DEFAULT 'user' NOT NULL,
  token text DEFAULT encode(gen_random_bytes(32), 'hex') NOT NULL UNIQUE,
  invited_by uuid,
  status invite_status DEFAULT 'pending',
  expires_at timestamptz DEFAULT (now() + '7 days'::interval),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  subdomain text,
  custom_domain text,
  owner_user_id uuid,
  plan text DEFAULT 'starter' NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  max_users integer DEFAULT 5 NOT NULL,
  max_leads integer DEFAULT 500 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text DEFAULT 'member' NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  joined_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whitelabel_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  app_name text DEFAULT 'Lead Radar' NOT NULL,
  logo_url text,
  primary_color text DEFAULT '#0A66C2' NOT NULL,
  secondary_color text DEFAULT '#10B981' NOT NULL,
  accent_color text DEFAULT '#8B5CF6' NOT NULL,
  sidebar_bg text DEFAULT '#FFFFFF' NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  tenant_id uuid,
  favicon_url text,
  custom_css text,
  hide_branding boolean DEFAULT false NOT NULL,
  font_family text DEFAULT 'Inter'
);

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  name text NOT NULL,
  headline text,
  company text,
  profile_url text,
  avatar_url text,
  notes text,
  tags text[] DEFAULT '{}',
  status text DEFAULT 'Lead',
  source text DEFAULT 'manual',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_activity_date timestamptz,
  recommended_action text,
  lead_score integer DEFAULT 0,
  email text,
  phone text,
  linkedin_url text,
  location text,
  campaign_id uuid,
  last_action_at timestamptz,
  connection_status text DEFAULT 'none',
  connection_sent_at timestamptz,
  connected_at timestamptz,
  connection_note text,
  connection_message text,
  pipeline_stage text,
  pipeline_entered_at timestamptz,
  next_followup timestamptz,
  last_activity_at timestamptz,
  deal_value numeric,
  lead_source text DEFAULT 'linkedin',
  first_name text,
  last_name text,
  company_address text,
  icp_match integer DEFAULT 0,
  job_title text,
  vernetzung_status text DEFAULT 'nicht_vernetzt',
  industry text,
  company_size crm_company_size,
  company_website text,
  city text,
  country text,
  li_about_summary text,
  li_activity_level crm_activity_level DEFAULT 'unbekannt',
  li_connection_status crm_connection_status DEFAULT 'nicht_verbunden',
  li_connection_requested_at timestamptz,
  li_connected_at timestamptz,
  li_message_summary text,
  li_last_interaction_at timestamptz,
  li_reply_behavior crm_reply_behavior DEFAULT 'unbekannt',
  deal_stage crm_deal_stage DEFAULT 'kein_deal',
  deal_stage_changed_at timestamptz,
  deal_lost_reason text,
  deal_expected_close date,
  deal_probability smallint DEFAULT 0,
  ai_need_detected text,
  ai_pain_points text[] DEFAULT '{}',
  ai_use_cases text[] DEFAULT '{}',
  ai_budget_signal text,
  ai_buying_intent crm_buying_intent DEFAULT 'unbekannt',
  ai_summary_updated_at timestamptz,
  owner_id uuid,
  lifecycle_stage crm_lifecycle_stage DEFAULT 'lead',
  lead_status crm_lead_status DEFAULT 'new',
  original_source crm_lead_source DEFAULT 'linkedin',
  original_source_detail text,
  hs_score smallint DEFAULT 0,
  is_unsubscribed boolean DEFAULT false NOT NULL,
  unsubscribed_at timestamptz,
  persona text,
  timezone text,
  preferred_language char(2) DEFAULT 'de',
  do_not_contact boolean DEFAULT false NOT NULL,
  gdpr_consent boolean DEFAULT false NOT NULL,
  gdpr_consent_at timestamptz,
  first_contacted_at timestamptz,
  num_contacts integer DEFAULT 0 NOT NULL,
  num_replies integer DEFAULT 0 NOT NULL,
  last_reply_at timestamptz,
  days_to_close integer,
  created_by uuid,
  updated_by uuid,
  archived boolean DEFAULT false NOT NULL,
  archived_at timestamptz,
  custom_fields jsonb DEFAULT '{}' NOT NULL,
  li_follower_count integer,
  li_post_count integer,
  deal_currency char(3) DEFAULT 'EUR',
  ai_next_best_action text,
  gdpr_consent_ip inet,
  is_favorite boolean DEFAULT false NOT NULL,
  team_id uuid,
  is_shared boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.deals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  team_id uuid,
  owner_id uuid,
  pipeline_stage_id uuid,
  title text NOT NULL,
  value numeric,
  currency char(3) DEFAULT 'EUR',
  stage crm_deal_stage DEFAULT 'prospect' NOT NULL,
  probability smallint DEFAULT 0,
  expected_close_date date,
  closed_at timestamptz,
  lost_reason text,
  next_step text,
  description text,
  custom_fields jsonb DEFAULT '{}' NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.deal_attachments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid,
  name text NOT NULL,
  position smallint DEFAULT 0 NOT NULL,
  color text DEFAULT '#6366f1',
  probability smallint DEFAULT 0,
  is_won boolean DEFAULT false NOT NULL,
  is_lost boolean DEFAULT false NOT NULL,
  is_default boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  user_id uuid,
  team_id uuid,
  type text NOT NULL,
  direction text,
  subject text,
  body text,
  outcome text,
  duration_seconds integer,
  occurred_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.contact_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  user_id uuid,
  team_id uuid,
  content text NOT NULL,
  is_pinned boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  is_private boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lead_field_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  changed_by uuid,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_at timestamptz DEFAULT now() NOT NULL,
  change_source text DEFAULT 'user' NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lead_lists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  name text NOT NULL,
  description text,
  color text DEFAULT '#0a66c2',
  created_at timestamptz DEFAULT now(),
  team_id uuid,
  is_shared boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lead_list_members (
  list_id uuid NOT NULL REFERENCES public.lead_lists(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (list_id, lead_id)
);

CREATE TABLE IF NOT EXISTS public.lead_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  team_id uuid,
  created_by uuid NOT NULL,
  assigned_to uuid,
  title text NOT NULL,
  description text,
  due_date date,
  priority text DEFAULT 'normal',
  status text DEFAULT 'open',
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_scoring_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  field text NOT NULL,
  operator text NOT NULL,
  value text,
  score_delta integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ssi_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  recorded_at timestamptz DEFAULT now() NOT NULL,
  total_score numeric NOT NULL,
  build_brand numeric DEFAULT 0,
  find_people numeric DEFAULT 0,
  engage_insights numeric DEFAULT 0,
  build_relationships numeric DEFAULT 0,
  industry_rank integer,
  network_rank integer,
  notes text,
  source text DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_voices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  name text DEFAULT 'Meine Brand Voice' NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  brand_name text,
  brand_background text,
  mission text,
  vision text,
  values text,
  personality text,
  tone_attributes text[],
  word_choice text,
  grammar_style text,
  sentence_style text,
  jargon_level text,
  perspective text,
  voice_style text,
  formality text,
  dos text,
  donts text,
  target_audience text,
  example_texts text,
  ai_summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  version integer DEFAULT 1,
  team_id uuid,
  is_shared boolean DEFAULT false NOT NULL,
  tonality jsonb DEFAULT '{}',
  vocabulary text[] DEFAULT '{}',
  glossary jsonb DEFAULT '[]',
  linkedin_style jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.target_audiences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  team_id uuid,
  is_shared boolean DEFAULT false NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  job_titles text DEFAULT '',
  industries text DEFAULT '',
  company_size text DEFAULT '',
  decision_level text DEFAULT '',
  region text DEFAULT '',
  pain_points text DEFAULT '',
  needs_goals text DEFAULT '',
  topics_interests text DEFAULT '',
  trigger_events text DEFAULT '',
  outreach_tips text DEFAULT '',
  ai_summary text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.icp_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  industries text[] DEFAULT '{}',
  job_titles text[] DEFAULT '{}',
  company_sizes text[] DEFAULT '{}',
  locations text[] DEFAULT '{}',
  keywords text[] DEFAULT '{}',
  pain_points text,
  buying_signals text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  team_id uuid,
  is_shared boolean DEFAULT false NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  content text DEFAULT '',
  category text DEFAULT 'unternehmen' NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  file_url text DEFAULT '',
  file_type text DEFAULT '',
  file_name text DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.content_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  title text DEFAULT '' NOT NULL,
  content text DEFAULT '',
  platform text DEFAULT 'linkedin',
  status text DEFAULT 'idee',
  scheduled_at timestamptz,
  published_at timestamptz,
  tags text[] DEFAULT '{}',
  media_urls text[] DEFAULT '{}',
  notes text DEFAULT '',
  lead_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  template_id text,
  template_label text,
  input_fields jsonb,
  generated_text text,
  brand_voice_id uuid,
  brand_voice_snapshot text,
  ignored_brand_voice boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  content_type text DEFAULT 'linkedin_post'
);

CREATE TABLE IF NOT EXISTS public.prompt_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  name text NOT NULL,
  category text NOT NULL,
  system_prompt text,
  user_prompt text NOT NULL,
  variables jsonb DEFAULT '[]',
  is_global boolean DEFAULT false,
  version integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vernetzungen (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  li_name text NOT NULL,
  li_headline text,
  li_company text,
  li_position text,
  li_location text,
  li_about text,
  li_url text,
  li_avatar_url text,
  li_skills text[],
  generated_msg text,
  final_msg text,
  context_notes text,
  status text DEFAULT 'draft',
  sent_at timestamptz,
  responded_at timestamptz,
  outcome_notes text,
  rating integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.connection_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  linkedin_url text NOT NULL,
  message text,
  status text DEFAULT 'pending' NOT NULL,
  error text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  name text NOT NULL,
  description text,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text,
  delay integer DEFAULT 0,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text DEFAULT 'draft' NOT NULL,
  sequence jsonb DEFAULT '[]' NOT NULL,
  settings jsonb DEFAULT '{}' NOT NULL,
  leads_total integer DEFAULT 0,
  leads_done integer DEFAULT 0,
  leads_replied integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_campaign_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.automation_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text DEFAULT 'queued' NOT NULL,
  current_step integer DEFAULT 0,
  next_action_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  error_msg text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  campaign_id uuid,
  action text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  target_url text NOT NULL,
  target_name text,
  payload jsonb DEFAULT '{}',
  result jsonb,
  error text,
  scheduled_at timestamptz DEFAULT now(),
  executed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  job_id uuid,
  action text NOT NULL,
  target_url text,
  target_name text,
  success boolean DEFAULT true,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  title text NOT NULL,
  type text NOT NULL,
  target_value integer DEFAULT 1 NOT NULL,
  current_value integer DEFAULT 0 NOT NULL,
  completed boolean DEFAULT false NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text DEFAULT 'info' NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage (
  id bigint DEFAULT nextval('usage_id_seq') PRIMARY KEY,
  user_id uuid,
  action text NOT NULL,
  tokens_used integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  action_category text DEFAULT 'ai_generation'
);

CREATE TABLE IF NOT EXISTS public.usage_monthly (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  month_year text NOT NULL,
  ai_calls integer DEFAULT 0,
  leads_imported integer DEFAULT 0,
  vernetzungen integer DEFAULT 0,
  content_pieces integer DEFAULT 0,
  tokens_used bigint DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  action text NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  count integer DEFAULT 0,
  daily_limit integer DEFAULT 20,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  plan_id text DEFAULT 'free',
  status text DEFAULT 'active' NOT NULL,
  wix_order_id text,
  wix_plan_id text,
  wix_member_id text,
  current_period_start timestamptz DEFAULT now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  plan_id text DEFAULT 'free' NOT NULL,
  status text DEFAULT 'free' NOT NULL,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.licenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  subscription_id uuid,
  feature_key text DEFAULT 'full_access' NOT NULL,
  total_seats integer DEFAULT 1 NOT NULL,
  used_seats integer DEFAULT 0 NOT NULL,
  status license_status DEFAULT 'active',
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  team_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz DEFAULT now(),
  revoked_at timestamptz,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  scopes text[] DEFAULT '{read,write}',
  last_used_at timestamptz,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid,
  actor_id uuid,
  action text NOT NULL,
  target_id uuid,
  target_type text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.changelog (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  version text,
  type text DEFAULT 'update' NOT NULL,
  title text NOT NULL,
  description text,
  author text DEFAULT 'System',
  affected text[],
  commit_sha text,
  is_breaking boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  widget_id text NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  col integer DEFAULT 0 NOT NULL,
  visible boolean DEFAULT true NOT NULL,
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scrape_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  url text,
  params jsonb DEFAULT '{}',
  result jsonb,
  leads_found integer DEFAULT 0,
  error text,
  priority integer DEFAULT 5,
  scheduled_at timestamptz DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.extension_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  action text NOT NULL,
  lead_url text,
  lead_name text,
  campaign_step_id uuid,
  error text,
  metadata jsonb,
  timestamp timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.extension_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  poll_token text DEFAULT encode(gen_random_bytes(32), 'hex') NOT NULL,
  version text,
  browser text,
  last_ping timestamptz DEFAULT now(),
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.linkedin_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  status text DEFAULT 'disconnected' NOT NULL,
  connected_at timestamptz,
  last_active timestamptz,
  last_sync timestamptz,
  profile_name text,
  profile_url text,
  profile_image text,
  headline text,
  connections_count integer DEFAULT 0,
  extension_version text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.linkedin_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  recipient_name text NOT NULL,
  recipient_title text,
  recipient_company text,
  recipient_linkedin_url text,
  message_text text NOT NULL,
  message_type text DEFAULT 'outreach',
  rating smallint DEFAULT 0,
  sent_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saved_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  lead_id uuid,
  post_text text,
  comment_text text NOT NULL,
  post_author text,
  post_url text,
  used boolean DEFAULT false,
  rating integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_activity (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  week_start date NOT NULL,
  comments integer DEFAULT 0 NOT NULL,
  leads_added integer DEFAULT 0 NOT NULL,
  tasks_done integer DEFAULT 0 NOT NULL,
  messages integer DEFAULT 0 NOT NULL,
  posts integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text DEFAULT 'wix' NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  processed boolean DEFAULT false,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wix_plan_mapping (
  wix_plan_id text NOT NULL PRIMARY KEY,
  wix_plan_name text,
  plan_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  color text DEFAULT '#0A66C2',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_columns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  color text DEFAULT '#64748B',
  created_at timestamptz DEFAULT now(),
  wip_limit integer
);

CREATE TABLE IF NOT EXISTS public.pm_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  column_id uuid NOT NULL REFERENCES public.pm_columns(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  priority text DEFAULT 'medium',
  due_date date,
  tags text[] DEFAULT '{}',
  media_urls text[] DEFAULT '{}',
  position integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  cover_color text,
  wip_limit integer,
  estimated_hours numeric,
  assignee_name text
);

CREATE TABLE IF NOT EXISTS public.pm_labels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  name text DEFAULT '' NOT NULL,
  color text DEFAULT '#61BD4F' NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_task_labels (
  task_id uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.pm_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

CREATE TABLE IF NOT EXISTS public.pm_checklist_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  done boolean DEFAULT false,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_attachments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  size integer,
  mime_type text,
  created_at timestamptz DEFAULT now(),
  storage_path text
);

CREATE TABLE IF NOT EXISTS public.pm_task_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  assignee_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_project_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text DEFAULT 'member',
  added_by uuid,
  added_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_activity_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  detail text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  team_id uuid,
  provider text NOT NULL,
  api_key text,
  settings jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integration_sync_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  synced_at timestamptz DEFAULT now(),
  records_found integer DEFAULT 0,
  records_created integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  error text,
  details jsonb DEFAULT '{}'
);

-- ── RLS aktivieren ───────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whitelabel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_field_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssi_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vernetzungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wix_plan_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies (user-scoped) ────────────────────────────────────

-- profiles: jeder sieht nur eigenes
CREATE POLICY "profiles_own" ON public.profiles FOR ALL USING (auth.uid() = id);

-- plans: alle lesen
CREATE POLICY "plans_read" ON public.plans FOR SELECT USING (true);

-- teams: Mitglieder sehen ihr Team
CREATE POLICY "teams_member" ON public.teams FOR ALL USING (
  owner_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = id AND tm.user_id = auth.uid() AND tm.is_active)
);

-- team_members
CREATE POLICY "team_members_own" ON public.team_members FOR ALL USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
);

-- invites
CREATE POLICY "invites_team" ON public.invites FOR ALL USING (
  invited_by = auth.uid() OR
  EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
);

-- Leads: eigene + geteilte
CREATE POLICY "leads_own_or_shared" ON public.leads FOR ALL USING (
  user_id = auth.uid() OR is_shared = true OR
  (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.team_members tm 
    WHERE tm.team_id = leads.team_id AND tm.user_id = auth.uid() AND tm.is_active
  ))
);

-- Deals: über lead_id oder direkt
CREATE POLICY "deals_own" ON public.deals FOR ALL USING (
  created_by = auth.uid() OR owner_id = auth.uid() OR
  (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.team_id = deals.team_id AND tm.user_id = auth.uid() AND tm.is_active
  ))
);

-- deal_attachments: über deal
CREATE POLICY "deal_attachments_own" ON public.deal_attachments FOR ALL USING (uploaded_by = auth.uid());

-- Standard user_id policies für alle anderen Tabellen
CREATE POLICY "activities_own" ON public.activities FOR ALL USING (user_id = auth.uid());
CREATE POLICY "contact_notes_own" ON public.contact_notes FOR ALL USING (user_id = auth.uid());
CREATE POLICY "lead_field_history_own" ON public.lead_field_history FOR ALL USING (changed_by = auth.uid());
CREATE POLICY "lead_lists_own" ON public.lead_lists FOR ALL USING (user_id = auth.uid() OR is_shared = true);
CREATE POLICY "lead_list_members_own" ON public.lead_list_members FOR ALL USING (
  EXISTS (SELECT 1 FROM public.lead_lists ll WHERE ll.id = list_id AND ll.user_id = auth.uid())
);
CREATE POLICY "lead_tasks_own" ON public.lead_tasks FOR ALL USING (created_by = auth.uid() OR assigned_to = auth.uid());
CREATE POLICY "lead_scoring_rules_own" ON public.lead_scoring_rules FOR ALL USING (user_id = auth.uid());
CREATE POLICY "ssi_scores_own" ON public.ssi_scores FOR ALL USING (user_id = auth.uid());
CREATE POLICY "brand_voices_own" ON public.brand_voices FOR ALL USING (user_id = auth.uid() OR is_shared = true);
CREATE POLICY "target_audiences_own" ON public.target_audiences FOR ALL USING (user_id = auth.uid() OR is_shared = true);
CREATE POLICY "icp_profiles_own" ON public.icp_profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY "knowledge_base_own" ON public.knowledge_base FOR ALL USING (user_id = auth.uid() OR is_shared = true);
CREATE POLICY "content_posts_own" ON public.content_posts FOR ALL USING (user_id = auth.uid());
CREATE POLICY "content_history_own" ON public.content_history FOR ALL USING (user_id = auth.uid());
CREATE POLICY "prompt_templates_own" ON public.prompt_templates FOR ALL USING (user_id = auth.uid() OR is_global = true);
CREATE POLICY "vernetzungen_own" ON public.vernetzungen FOR ALL USING (user_id = auth.uid());
CREATE POLICY "connection_queue_own" ON public.connection_queue FOR ALL USING (user_id = auth.uid());
CREATE POLICY "campaigns_own" ON public.campaigns FOR ALL USING (user_id = auth.uid());
CREATE POLICY "steps_own" ON public.steps FOR ALL USING (
  EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid())
);
CREATE POLICY "automation_campaigns_own" ON public.automation_campaigns FOR ALL USING (user_id = auth.uid());
CREATE POLICY "automation_campaign_leads_own" ON public.automation_campaign_leads FOR ALL USING (user_id = auth.uid());
CREATE POLICY "automation_jobs_own" ON public.automation_jobs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "automation_logs_own" ON public.automation_logs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "tasks_own" ON public.tasks FOR ALL USING (user_id = auth.uid());
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (user_id = auth.uid());
CREATE POLICY "usage_own" ON public.usage FOR ALL USING (user_id = auth.uid());
CREATE POLICY "usage_monthly_own" ON public.usage_monthly FOR ALL USING (user_id = auth.uid());
CREATE POLICY "rate_limits_own" ON public.rate_limits FOR ALL USING (user_id = auth.uid());
CREATE POLICY "subscriptions_own" ON public.subscriptions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "stripe_subscriptions_own" ON public.stripe_subscriptions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "licenses_team" ON public.licenses FOR ALL USING (
  EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
);
CREATE POLICY "license_assignments_own" ON public.license_assignments FOR ALL USING (user_id = auth.uid());
CREATE POLICY "api_keys_own" ON public.api_keys FOR ALL USING (user_id = auth.uid());
CREATE POLICY "audit_logs_team" ON public.audit_logs FOR SELECT USING (actor_id = auth.uid());
CREATE POLICY "changelog_read" ON public.changelog FOR SELECT USING (true);
CREATE POLICY "changelog_write" ON public.changelog FOR INSERT WITH CHECK (true);
CREATE POLICY "dashboard_widgets_own" ON public.dashboard_widgets FOR ALL USING (user_id = auth.uid());
CREATE POLICY "scrape_jobs_own" ON public.scrape_jobs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "extension_logs_own" ON public.extension_logs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "extension_sessions_own" ON public.extension_sessions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "linkedin_connections_own" ON public.linkedin_connections FOR ALL USING (user_id = auth.uid());
CREATE POLICY "linkedin_messages_own" ON public.linkedin_messages FOR ALL USING (user_id = auth.uid());
CREATE POLICY "saved_comments_own" ON public.saved_comments FOR ALL USING (user_id = auth.uid());
CREATE POLICY "weekly_activity_own" ON public.weekly_activity FOR ALL USING (user_id = auth.uid());
CREATE POLICY "webhook_events_service" ON public.webhook_events FOR ALL USING (true);
CREATE POLICY "wix_plan_mapping_read" ON public.wix_plan_mapping FOR SELECT USING (true);
CREATE POLICY "pm_projects_own" ON public.pm_projects FOR ALL USING (user_id = auth.uid());
CREATE POLICY "pm_columns_own" ON public.pm_columns FOR ALL USING (user_id = auth.uid());
CREATE POLICY "pm_tasks_own" ON public.pm_tasks FOR ALL USING (user_id = auth.uid());
CREATE POLICY "pm_labels_own" ON public.pm_labels FOR ALL USING (
  EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id = project_id AND p.user_id = auth.uid())
);
CREATE POLICY "pm_task_labels_own" ON public.pm_task_labels FOR ALL USING (
  EXISTS (SELECT 1 FROM public.pm_tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
);
CREATE POLICY "pm_checklist_items_own" ON public.pm_checklist_items FOR ALL USING (user_id = auth.uid());
CREATE POLICY "pm_comments_own" ON public.pm_comments FOR ALL USING (user_id = auth.uid());
CREATE POLICY "pm_attachments_own" ON public.pm_attachments FOR ALL USING (user_id = auth.uid());
CREATE POLICY "pm_task_assignments_own" ON public.pm_task_assignments FOR ALL USING (assignee_id = auth.uid());
CREATE POLICY "pm_project_members_own" ON public.pm_project_members FOR ALL USING (user_id = auth.uid());
CREATE POLICY "pm_activity_log_own" ON public.pm_activity_log FOR ALL USING (user_id = auth.uid());
CREATE POLICY "integrations_own" ON public.integrations FOR ALL USING (user_id = auth.uid());
CREATE POLICY "integration_sync_log_own" ON public.integration_sync_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.integrations i WHERE i.id = integration_id AND i.user_id = auth.uid())
);
CREATE POLICY "whitelabel_settings_own" ON public.whitelabel_settings FOR ALL USING (user_id = auth.uid());
CREATE POLICY "tenants_own" ON public.tenants FOR ALL USING (owner_user_id = auth.uid());
CREATE POLICY "tenant_members_own" ON public.tenant_members FOR ALL USING (user_id = auth.uid());
CREATE POLICY "pipeline_stages_team" ON public.pipeline_stages FOR ALL USING (
  team_id IS NULL OR
  EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = pipeline_stages.team_id AND tm.user_id = auth.uid())
);

-- ── Trigger Funktionen ───────────────────────────────────────────

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), now(), now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at auto-update
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER brand_voices_updated_at BEFORE UPDATE ON public.brand_voices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Bidirektionaler Leads <-> Deals Sync
CREATE OR REPLACE FUNCTION sync_deal_to_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (NEW.stage IS DISTINCT FROM OLD.stage) OR (NEW.value IS DISTINCT FROM OLD.value) OR
     (NEW.probability IS DISTINCT FROM OLD.probability) OR (NEW.expected_close_date IS DISTINCT FROM OLD.expected_close_date) THEN
    UPDATE leads SET
      deal_stage        = NEW.stage,
      deal_value        = NEW.value,
      deal_probability  = NEW.probability,
      deal_expected_close = NEW.expected_close_date,
      updated_at        = now()
    WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_deal_to_lead
  AFTER UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION sync_deal_to_lead();

CREATE OR REPLACE FUNCTION sync_lead_to_deal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (NEW.deal_stage IS DISTINCT FROM OLD.deal_stage) OR
     (NEW.deal_value IS DISTINCT FROM OLD.deal_value) OR
     (NEW.deal_probability IS DISTINCT FROM OLD.deal_probability) OR
     (NEW.deal_expected_close IS DISTINCT FROM OLD.deal_expected_close) THEN
    UPDATE deals SET
      stage               = COALESCE(NEW.deal_stage, 'prospect')::crm_deal_stage,
      value               = NEW.deal_value,
      probability         = COALESCE(NEW.deal_probability, 0),
      expected_close_date = NEW.deal_expected_close,
      updated_at          = now()
    WHERE lead_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_lead_to_deal
  AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION sync_lead_to_deal();

-- Lead Field History Tracking
CREATE OR REPLACE FUNCTION public.crm_track_lead_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  fields text[] := ARRAY['deal_stage','lifecycle_stage','li_connection_status','hs_score','deal_value'];
  f text;
BEGIN
  FOREACH f IN ARRAY fields LOOP
    IF (to_jsonb(NEW) ->> f) IS DISTINCT FROM (to_jsonb(OLD) ->> f) THEN
      INSERT INTO public.lead_field_history (lead_id, changed_by, field_name, old_value, new_value, change_source)
      VALUES (NEW.id, auth.uid(), f, to_jsonb(OLD) ->> f, to_jsonb(NEW) ->> f, 'user');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_track_lead_changes
  AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_track_lead_changes();

-- License seat counter
CREATE OR REPLACE FUNCTION public.update_license_used_seats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.licenses SET
    used_seats = (SELECT COUNT(*) FROM public.license_assignments WHERE license_id = COALESCE(NEW.license_id, OLD.license_id) AND is_active = true)
  WHERE id = COALESCE(NEW.license_id, OLD.license_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_license_seats
  AFTER INSERT OR UPDATE OR DELETE ON public.license_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_license_used_seats();

-- ── Storage Buckets ───────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('deal-attachments', 'deal-attachments', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-base', 'knowledge-base', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', false) ON CONFLICT DO NOTHING;

-- Storage Policies
CREATE POLICY "avatars_public" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "deal_attachments_own" ON storage.objects FOR ALL USING (bucket_id = 'deal-attachments' AND auth.uid() IS NOT NULL);
CREATE POLICY "knowledge_base_own" ON storage.objects FOR ALL USING (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);
CREATE POLICY "brand_assets_own" ON storage.objects FOR ALL USING (bucket_id = 'brand-assets' AND auth.uid() IS NOT NULL);

-- ── Seed-Daten: Plans ────────────────────────────────────────────
INSERT INTO public.plans (id, name, daily_limit, price_eur, max_leads, max_lists, ai_access, feature_pipeline, feature_brand_voice, feature_reports, ai_calls_monthly, leads_monthly, seats, sort_order) VALUES
  ('free',     'Free',     5,   0,    50,   3,  false, false, false, false, 50,   100,  1, 0),
  ('basic',    'Basic',    20,  29,   500,  10, true,  true,  true,  false, 200,  500,  1, 1),
  ('pro',      'Pro',      50,  79,   2000, 25, true,  true,  true,  true,  1000, 2000, 3, 2),
  ('business', 'Business', 100, 199,  -1,   -1, true,  true,  true,  true,  5000, -1,   10, 3)
ON CONFLICT (id) DO NOTHING;

