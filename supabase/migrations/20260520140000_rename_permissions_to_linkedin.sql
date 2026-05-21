-- ============================================================
-- Permission-Rename: Profiltexte + SSI von Branding/Reports nach LinkedIn
-- ============================================================
-- Konsistent mit der UI-Restruktur (886d836): Profiltexte und SSI-Tracker
-- sind in der Sidebar unter "LinkedIn". Die Permission-Keys werden jetzt
-- ebenfalls in den linkedin-Namespace gezogen:
--
--   branding.linkedin_texts → linkedin.profile_texts
--   reports.ssi             → linkedin.ssi_tracker
--
-- Wirkt auf plans.permissions (jsonb-Array von Strings). Idempotent —
-- ersetzt nur wenn alter Key vorhanden, ignoriert wenn neuer schon da.

BEGIN;

-- 1) branding.linkedin_texts → linkedin.profile_texts
UPDATE public.plans
SET permissions = (
  SELECT jsonb_agg(
    CASE WHEN value::text = '"branding.linkedin_texts"'
      THEN to_jsonb('linkedin.profile_texts'::text)
      ELSE value
    END
  )
  FROM jsonb_array_elements(permissions) AS value
)
WHERE permissions @> '"branding.linkedin_texts"'::jsonb;

-- 2) reports.ssi → linkedin.ssi_tracker
UPDATE public.plans
SET permissions = (
  SELECT jsonb_agg(
    CASE WHEN value::text = '"reports.ssi"'
      THEN to_jsonb('linkedin.ssi_tracker'::text)
      ELSE value
    END
  )
  FROM jsonb_array_elements(permissions) AS value
)
WHERE permissions @> '"reports.ssi"'::jsonb;

COMMIT;

-- Verifikation
SELECT name,
       permissions @> '"linkedin.profile_texts"'::jsonb AS has_profile_texts,
       permissions @> '"linkedin.ssi_tracker"'::jsonb   AS has_ssi_tracker,
       permissions @> '"branding.linkedin_texts"'::jsonb AS still_old_profile,
       permissions @> '"reports.ssi"'::jsonb            AS still_old_ssi
FROM public.plans
ORDER BY sort_order;
