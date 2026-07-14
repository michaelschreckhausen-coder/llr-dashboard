-- UI-Gate für den "Als Kunde einloggen"-Button in leadesk-admin: gibt zurück, ob der eingeloggte Caller
-- die can_impersonate-Capability hat. Defense-in-Depth zusätzlich zum EF-403. RLS-neutral (nur eigener Flag).

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_can_impersonate()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    (SELECT can_impersonate FROM public.leadesk_staff WHERE id = auth.uid() AND is_active),
    false
  );
$fn$;

REVOKE ALL ON FUNCTION public.staff_can_impersonate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_impersonate() TO authenticated;

COMMIT;
