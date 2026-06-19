-- 20260629160000_admin_waitlist_pipeline_rpcs.sql
-- Phase 4b — Admin-Waitlist-Pipeline (leadesk-admin Marketplace-Waitlist-Tab).
--   admin_get_waitlist_entries(p_addon_slug, p_only_unnotified)
--     → READ: marketplace_waitlist × addons × accounts × auth.users(owner_user_id)
--   admin_mark_waitlist_notified(p_ids uuid[])
--     → Bulk notified_at=now() (idempotent: NUR WHERE notified_at IS NULL, Original-
--       Zeitpunkt bleibt) + Audit-Log pro tatsächlich aktualisierter Row.
-- Gate: is_leadesk_admin-JWT-Claim (CLAUDE.md #9). SECURITY DEFINER, search_path inkl.
-- auth (auth.users-JOIN für owner_email). Owner via accounts.owner_user_id (Prod hat
-- KEIN owner_id). Kein Reason-Modal (Bulk-Send, nicht destruktiv) — Audit-reason ist
-- System-Konstante (admin_audit_log.reason ist NOT NULL).

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_waitlist_entries(
  p_addon_slug text DEFAULT NULL,
  p_only_unnotified boolean DEFAULT false
)
 RETURNS TABLE(
   id uuid, addon_slug text, addon_name text,
   account_id uuid, account_name text, owner_email text,
   created_at timestamptz, notified_at timestamptz
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  RETURN QUERY
  SELECT mw.id, ad.slug, ad.name,
         a.id, a.name, u.email::text,
         mw.created_at, mw.notified_at
  FROM public.marketplace_waitlist mw
  JOIN public.addons ad ON ad.id = mw.addon_id
  JOIN public.accounts a ON a.id = mw.account_id
  LEFT JOIN auth.users u ON u.id = a.owner_user_id
  WHERE (p_addon_slug IS NULL OR ad.slug = p_addon_slug)
    AND (NOT p_only_unnotified OR mw.notified_at IS NULL)
  ORDER BY ad.slug, mw.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_mark_waitlist_notified(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_count    integer;
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  WITH upd AS (
    UPDATE public.marketplace_waitlist mw
    SET notified_at = now()
    WHERE mw.id = ANY(p_ids) AND mw.notified_at IS NULL   -- idempotent: Original-Zeitpunkt bleibt
    RETURNING mw.id, mw.account_id, mw.addon_id
  ),
  ins AS (
    INSERT INTO public.admin_audit_log (
      admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason
    )
    SELECT v_admin_id, 'marketplace_waitlist_notified', 'marketplace_waitlist', upd.id,
           'notified_at',
           jsonb_build_object('notified_at', null),
           jsonb_build_object('notified_at', now(), 'addon_slug', ad.slug, 'account_id', upd.account_id),
           'Waitlist als benachrichtigt markiert (Admin-Bulk)'
    FROM upd JOIN public.addons ad ON ad.id = upd.addon_id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_waitlist_entries(text, boolean) FROM public;
REVOKE ALL ON FUNCTION public.admin_mark_waitlist_notified(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_waitlist_entries(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_waitlist_notified(uuid[]) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
