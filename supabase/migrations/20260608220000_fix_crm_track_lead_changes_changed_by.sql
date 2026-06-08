-- 20260608220000_fix_crm_track_lead_changes_changed_by.sql
--
-- Bugfix: "column user_id of relation lead_field_history does not exist".
--
-- Phase C (20260527110000) hat lead_field_history.user_id -> changed_by
-- umbenannt und team_id gedroppt, aber die Trigger-Funktion NICHT ersetzt.
-- Auf der Live-DB schreibt die alte Version weiterhin user_id + team_id
-- -> jede Aenderung eines getrackten Lead-Feldes crasht.
--
-- WICHTIG: die real verdrahtete Funktion heisst public.track_lead_changes()
-- (Trigger trg_track_lead_changes auf public.leads), NICHT crm_track_lead_changes.
-- Letztere existiert gar nicht — der Dateiname ist historisch, der Fix muss
-- track_lead_changes ersetzen, sonst bleibt der Bug bestehen.
--
-- Fix: kanonische Insert-Spalten (changed_by + change_source statt user_id/team_id),
-- getrackte Felder unveraendert (inkl. next_followup) — reiner Bugfix, kein
-- Verhaltenswechsel. CREATE OR REPLACE: der Trigger referenziert per Name und
-- nutzt automatisch die neue Version.

CREATE OR REPLACE FUNCTION public.track_lead_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  fields text[] := ARRAY['deal_stage','deal_value','lifecycle_stage','li_connection_status','hs_score','next_followup'];
  f text;
  old_val text;
  new_val text;
BEGIN
  FOREACH f IN ARRAY fields LOOP
    old_val := to_jsonb(OLD) ->> f;
    new_val := to_jsonb(NEW) ->> f;
    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO public.lead_field_history (lead_id, changed_by, field_name, old_value, new_value, change_source)
      VALUES (NEW.id, auth.uid(), f, old_val, new_val, 'user');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
