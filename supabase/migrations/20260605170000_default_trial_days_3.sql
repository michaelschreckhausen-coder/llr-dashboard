-- Trial-Dauer des Default-Trial-Plans auf 3 Tage (Doc-Spec)
-- ─────────────────────────────────────────────────────────────────
-- Korrigiert die EINE Quelle, aus der sowohl die echte Trial-Länge
-- als auch die Welcome-Mail-Anzeige gespeist werden:
--   - handle_new_user(): trial_ends_at = now() + plans.trial_days
--   - Welcome-Mail (welcome_trial_start): {{trial_days_remaining}} = plans.trial_days
-- Vorher abweichend (Verdacht: 7), Ziel laut Doc-Spec: 3.
--
-- NICHT betroffen: GoTrue-"Confirm signup"-Template (liegt in der
-- GoTrue-Server-Config auf Hetzner, separat anzupassen).
--
-- Idempotent: WHERE-Guard auf is_default_trial=true + DISTINCT-Check,
-- re-run-safe. Reihenfolge: zuerst Hetzner-Staging, nach Verifikation Prod.

BEGIN;

UPDATE public.plans
   SET trial_days = 3
 WHERE is_default_trial = true
   AND trial_days IS DISTINCT FROM 3;

COMMIT;

-- Verifikation nach Apply:
--   SELECT id, name, slug, is_default_trial, is_active, trial_days
--   FROM public.plans WHERE is_default_trial = true;
