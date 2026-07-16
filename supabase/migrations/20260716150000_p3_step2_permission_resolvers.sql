-- ============================================================================
-- P3 · Schritt 2 — Permission-Resolver-RPCs (member-basiert / B1). ADDITIV.
-- ============================================================================
-- Keine Gates: diese RPCs werden erst in Schritt 3 von EF-Guards aufgerufen.
-- Fassade unveraendert: get_my_entitlements/i_have_addon/i_have_module bleiben.
--
-- Kern-Trick (schliesst B3): BEIDE Pfade leiten aus derselben Wahrheit ab —
--   i_have_permission (USER)  -> get_my_entitlements() (aktives Team->Account->Plan)
--   account_has_permission (CRON) -> Account->Plan direkt
-- ...mit IDENTISCHER Trial-Ablauf-Logik, damit User- und Cron-Pfad fuer dieselbe
-- (Account x Key)-Kombi nie auseinanderdriften (auch bei abgelaufenem Trial).
--
-- B1: member-basiert, KEIN Seat-Zwang (Seats werden erst in P4 load-bearing).
-- ============================================================================

BEGIN;

-- USER-Pfad: predikat ueber die unveraenderte Fassade -> garantierte FE/EF-Paritaet
CREATE OR REPLACE FUNCTION public.i_have_permission(p_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE e jsonb;
BEGIN
  e := public.get_my_entitlements();          -- aktives Team -> Account -> Plan
  IF e IS NULL THEN RETURN false; END IF;
  RETURN COALESCE((e->>'is_active')::boolean, false)   -- kodiert Status + Trial-Ablauf
     AND COALESCE(e->'permissions' ? p_key, false);
END $fn$;

-- CRON/SERVICE-Pfad: account-scoped, kein auth.uid(); Trial-Ablauf EXPLIZIT geprueft
-- (muss get_my_entitlements.is_active exakt spiegeln).
CREATE OR REPLACE FUNCTION public.account_has_permission(p_account_id uuid, p_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.accounts a
    JOIN public.plans   p ON p.id = a.plan_id
    WHERE a.id = p_account_id
      AND p.is_active
      AND (p.permissions ? p_key)
      AND a.status IN ('trialing','active')
      AND (a.status <> 'trialing' OR a.trial_ends_at IS NULL OR a.trial_ends_at > now())
  );
$fn$;

-- Grants (Self-Host: explizit, Top-Fallstrick #3/#12)
REVOKE ALL ON FUNCTION public.i_have_permission(text)            FROM public;
REVOKE ALL ON FUNCTION public.account_has_permission(uuid,text)  FROM public;
GRANT EXECUTE ON FUNCTION public.i_have_permission(text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_has_permission(uuid,text) TO service_role;

COMMIT;
