-- PROD-DRIFT-NACHHOLUNG (24.07.2026) — un-committete Staging-Objekte. Als supabase_admin.
BEGIN;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS included_unipile_accounts integer NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION public.account_included_unipile(p_account_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT p.included_unipile_accounts FROM public.accounts a
    LEFT JOIN public.plans p ON p.id=a.plan_id WHERE a.id=p_account_id),1); $$;
GRANT EXECUTE ON FUNCTION public.account_included_unipile(uuid) TO authenticated, service_role;
ALTER TABLE public.unipile_accounts ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id);
CREATE INDEX IF NOT EXISTS idx_unipile_accounts_bv ON public.unipile_accounts(brand_voice_id);
DROP POLICY IF EXISTS unipile_accounts_team_select ON public.unipile_accounts;
DROP POLICY IF EXISTS unipile_accounts_brand ON public.unipile_accounts;
CREATE POLICY unipile_accounts_brand ON public.unipile_accounts FOR SELECT
  USING (public.has_brand_access(brand_voice_id) OR (brand_voice_id IS NULL AND public.user_in_team(team_id)));
-- 4 Metrik-Tabellen (network/messaging/profile/page) — siehe Staging-Schema
CREATE TABLE IF NOT EXISTS public.linkedin_network_metrics (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, team_id uuid NOT NULL, unipile_account_id text NOT NULL, brand_voice_id uuid, connections_total int, followers_total int, invites_pending_out int, invites_pending_in int, captured_on date DEFAULT ((now() AT TIME ZONE 'utc'))::date NOT NULL, captured_at timestamptz DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS public.linkedin_messaging_metrics (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, team_id uuid NOT NULL, unipile_account_id text NOT NULL, brand_voice_id uuid, chats_scanned int, unread_threads int, unread_messages int, active_7d int, captured_on date DEFAULT ((now() AT TIME ZONE 'utc'))::date NOT NULL, captured_at timestamptz DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS public.linkedin_profile_metrics (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, team_id uuid NOT NULL, brand_voice_id uuid NOT NULL REFERENCES public.brand_voices(id) ON DELETE CASCADE, follower_count int, connections_count int, captured_on date DEFAULT ((now() AT TIME ZONE 'utc'))::date NOT NULL, captured_at timestamptz DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS public.linkedin_page_metrics (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, team_id uuid NOT NULL, brand_voice_id uuid NOT NULL REFERENCES public.brand_voices(id) ON DELETE CASCADE, linkedin_org_id text NOT NULL, followers_count int, employee_count int, captured_on date DEFAULT ((now() AT TIME ZONE 'utc'))::date NOT NULL, captured_at timestamptz DEFAULT now() NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lnm_acct_day ON public.linkedin_network_metrics(unipile_account_id, captured_on);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lmm_acct_day ON public.linkedin_messaging_metrics(unipile_account_id, captured_on);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lpfm_brand_day ON public.linkedin_profile_metrics(brand_voice_id, captured_on);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lpm_brand_day ON public.linkedin_page_metrics(brand_voice_id, captured_on);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['linkedin_network_metrics','linkedin_messaging_metrics','linkedin_profile_metrics','linkedin_page_metrics'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_brand_read',t);
  EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT USING (public.has_brand_access(brand_voice_id) OR (brand_voice_id IS NULL AND team_id IN (SELECT team_id FROM public.team_members WHERE user_id=auth.uid())))$f$,t||'_brand_read',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t); EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
END LOOP; END $$;
COMMIT;
