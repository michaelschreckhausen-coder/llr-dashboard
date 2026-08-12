-- ROLLBACK SECFIX #4-1 — stellt den (unsicheren) PUBLIC-Grant wieder her. NICHT empfohlen.
BEGIN;
GRANT EXECUTE ON FUNCTION public.get_app_secret(text) TO PUBLIC;
COMMIT;
