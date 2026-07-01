-- Hilfsfunktion, um die MFA-Faktoren eines Users serverseitig zu entfernen.
-- Wird von der Edge Function `mfa-recovery` (service_role) genutzt:
--   - Self-Service: nach gültigem Backup-Code
--   - Admin-Reset:  durch Leadesk-Admin in admin.leadesk.de
--
-- SECURITY DEFINER, weil das auth-Schema sonst nicht schreibbar ist.
-- Nur service_role darf ausführen (kein anon/authenticated).

create or replace function public.admin_delete_mfa(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n integer;
begin
  -- offene Challenges der Faktoren dieses Users zuerst entfernen
  delete from auth.mfa_challenges c
    using auth.mfa_factors f
   where c.factor_id = f.id and f.user_id = p_user;
  -- dann die Faktoren
  delete from auth.mfa_factors where user_id = p_user;
  get diagnostics n = row_count;
  -- zugehörige Backup-Codes ebenfalls aufräumen
  delete from public.mfa_backup_codes where user_id = p_user;
  return n;
end $$;

revoke all on function public.admin_delete_mfa(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_mfa(uuid) to service_role;

notify pgrst, 'reload schema';
