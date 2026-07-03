-- =====================================================================
-- Asana-Integration — asana_vault_store idempotent machen
-- Repo-Ziel: llr-dashboard/supabase/migrations/
-- Stand: 2026-07-03
--
-- Bug (auf Staging beim ersten Consent gefunden): asana_vault_store nutzte
-- ausschließlich vault.create_secret(secret, name) mit einem FESTEN Namen
-- (asana_access_<team_id> / asana_refresh_<team_id>). Beim wiederholten
-- „Verbinden" (Re-Connect, Retry, oder nachdem der erste Versuch die
-- Secrets bereits angelegt hat) verletzt der gleiche Name die Unique-
-- Constraint `secrets_name_idx`:
--   ERROR: duplicate key value violates unique constraint "secrets_name_idx"
-- Der asana_connections-Upsert ist idempotent (onConflict team_id), der
-- Vault-Store war es nicht — dadurch schlug jeder Re-Connect fehl.
--
-- Fix: Existiert bereits ein Secret mit dem Namen, wird es aktualisiert
-- (vault.update_secret) und dessen ID zurückgegeben; sonst neu angelegt.
-- Damit ist Verbinden beliebig oft wiederholbar (gleiche Secret-IDs bleiben
-- stabil, keine Orphans). Signatur unverändert → keine Edge-Function-
-- Neuauslieferung nötig. Idempotent (create or replace).
-- =====================================================================

create or replace function public.asana_vault_store(p_secret text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    select vault.create_secret(p_secret, p_name) into v_id;
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
  return v_id;
end;
$$;

-- Grants unverändert (nur service_role) — nach create or replace neu setzen.
revoke all on function public.asana_vault_store(text, text) from public, anon, authenticated;
grant execute on function public.asana_vault_store(text, text) to service_role;
