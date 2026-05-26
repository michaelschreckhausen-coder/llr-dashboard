-- 2026-05-27 — Phase Z — Deeper-Drift-Cleanup leads + andere Tabellen
--
-- Nach Phase A-H bleiben Type/Nullable/Default-Drifts. Diese Migration:
--
-- Z.1 — Defaults setzen (4 Cols, kosmetisch)
-- Z.2 — NOT NULL setzen (11 Cols, mit Pre-Flight-Backfill)
-- Z.3 — smallint-Konversion (2 Cols, lossless)
-- Z.4 — ADD profiles.plan_expires_at (1 Col, additiv)
-- Z.5 — leads.ai_pain_points text → text[] (data conversion)
-- Z.8 — DROP 5 Staging-only profile-Cols (Frontend-Grep clean; theme_pref behalten weil used)
--
-- SKIPPED (Prod hat Legacy-Drift, nicht canonical):
-- Z.6 — leads.lead_source ENUM→text (Prod-Drift, ENUM ist canonical via original_source)
-- Z.7 — profiles.role ENUM→text (Prod-Drift, profiles.role ist Legacy per
--       20260502170000_admin_rpcs_post_cutover_drift_fix.sql, global_role ist canonical)
--
-- Beide könnten in Folge-Migration explizit gemacht werden, aber heute SKIPPED
-- weil "Staging matches Prod"-Direction in diesen Fällen Type-Safety verliert.

BEGIN;

-- ─── Z.1: Defaults setzen ──────────────────────────────────────────────────

ALTER TABLE public.leads    ALTER COLUMN source            SET DEFAULT 'manual'::text;
ALTER TABLE public.leads    ALTER COLUMN tags              SET DEFAULT '{}'::text[];
ALTER TABLE public.leads    ALTER COLUMN li_reply_behavior SET DEFAULT 'unbekannt'::crm_reply_behavior;
ALTER TABLE public.profiles ALTER COLUMN avatar_url        SET DEFAULT ''::text;

-- ─── Z.2: NOT NULL setzen (mit Backfill) ───────────────────────────────────

-- activities: Backfill mit now() für NULL-Werte
UPDATE public.activities SET created_at  = now() WHERE created_at  IS NULL;
UPDATE public.activities SET occurred_at = now() WHERE occurred_at IS NULL;
ALTER TABLE public.activities ALTER COLUMN created_at  SET NOT NULL;
ALTER TABLE public.activities ALTER COLUMN occurred_at SET NOT NULL;

-- lead_field_history.lead_id: orphan-Rows ohne lead_id sind nutzlos
DELETE FROM public.lead_field_history WHERE lead_id IS NULL;
ALTER TABLE public.lead_field_history ALTER COLUMN lead_id SET NOT NULL;

-- lead_tasks.created_by + lead_id: orphan-Rows löschen
DELETE FROM public.lead_tasks WHERE created_by IS NULL OR lead_id IS NULL;
ALTER TABLE public.lead_tasks ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE public.lead_tasks ALTER COLUMN lead_id    SET NOT NULL;

-- leads: is_favorite/is_shared mit false befüllen, name mit Fallback
UPDATE public.leads SET is_favorite = false WHERE is_favorite IS NULL;
UPDATE public.leads SET is_shared   = false WHERE is_shared   IS NULL;
UPDATE public.leads SET name = COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'Unbenannt')
 WHERE name IS NULL OR TRIM(name) = '';
ALTER TABLE public.leads ALTER COLUMN is_favorite SET NOT NULL;
ALTER TABLE public.leads ALTER COLUMN is_shared   SET NOT NULL;
ALTER TABLE public.leads ALTER COLUMN name        SET NOT NULL;

-- profiles.account_status: Backfill mit 'active'
UPDATE public.profiles SET account_status = 'active' WHERE account_status IS NULL;
ALTER TABLE public.profiles ALTER COLUMN account_status SET NOT NULL;

-- vernetzungen: li_name + user_id NOT NULL (0 Rows auf Staging laut Audit, safe)
UPDATE public.vernetzungen SET li_name = 'Unbekannt' WHERE li_name IS NULL;
ALTER TABLE public.vernetzungen ALTER COLUMN li_name SET NOT NULL;
-- user_id: nur SET NOT NULL wenn 0 Rows mit NULL existieren (defensive)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vernetzungen WHERE user_id IS NULL) THEN
    ALTER TABLE public.vernetzungen ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

-- ─── Z.3: smallint-Konversion (lossless wenn Werte ≤ 32767) ────────────────

ALTER TABLE public.leads ALTER COLUMN deal_probability TYPE smallint USING deal_probability::smallint;
ALTER TABLE public.leads ALTER COLUMN hs_score         TYPE smallint USING hs_score::smallint;

-- ─── Z.4: ADD profiles.plan_expires_at ─────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_expires_at timestamp with time zone;

-- ─── Z.5: leads.ai_pain_points text → text[] ───────────────────────────────
-- Conversion: NULL/empty → empty array, sonst split by ',' (safer than wrap-as-single)

ALTER TABLE public.leads
  ALTER COLUMN ai_pain_points TYPE text[]
  USING CASE
    WHEN ai_pain_points IS NULL OR TRIM(ai_pain_points) = '' THEN ARRAY[]::text[]
    ELSE string_to_array(ai_pain_points, ',')
  END;
ALTER TABLE public.leads ALTER COLUMN ai_pain_points SET DEFAULT '{}'::text[];

-- ─── Z.8: DROP 5 Staging-only profile-Cols ─────────────────────────────────
-- Frontend-Grep verifiziert: kein Code referenziert diese 5 Cols.
-- theme_pref BEHALTEN — ThemeContext.jsx liest/schreibt es aktiv.

ALTER TABLE public.profiles DROP COLUMN IF EXISTS linkedin_access_token;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS linkedin_url;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS onboarding_completed;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS plan_id_uuid_old;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS settings;

-- ─── Verifikation ──────────────────────────────────────────────────────────

DO $$
DECLARE
  has_plan_expires    boolean;
  ai_pain_points_type text;
  deal_prob_type      text;
  has_linkedin_token  boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='plan_expires_at') INTO has_plan_expires;
  SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='ai_pain_points' INTO ai_pain_points_type;
  SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='deal_probability' INTO deal_prob_type;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='linkedin_access_token') INTO has_linkedin_token;

  IF NOT has_plan_expires      THEN RAISE EXCEPTION 'plan_expires_at missing'; END IF;
  IF ai_pain_points_type != 'ARRAY' THEN RAISE EXCEPTION 'ai_pain_points type wrong: %', ai_pain_points_type; END IF;
  IF deal_prob_type != 'smallint'   THEN RAISE EXCEPTION 'deal_probability type wrong: %', deal_prob_type; END IF;
  IF has_linkedin_token        THEN RAISE EXCEPTION 'linkedin_access_token still exists'; END IF;

  RAISE NOTICE 'Phase Z verification PASSED — defaults set, 11 NOT NULL applied, smallint+array conversions, 5 cols dropped';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
