-- RLS-Lockdown — Modul DELIVERY (Projektumsetzung). STAGING ZUERST.
-- =============================================================================
-- Verifiziert am 2026-07-01 gegen Staging:
--   • Pre-Check „Accounts ohne delivery-Modul" → 0 Zeilen (keine Aussperrung).
--   • Alle 13 pm_-Tabellen haben genau eine Policy <tabelle>_team (FOR ALL).
--
-- Vorgehen: pro pm_-Tabelle die bestehende _team-Policy einlesen, droppen und als
-- <tabelle>_team_with_module NEU anlegen — mit exakt derselben USING/WITH-CHECK-
-- Bedingung PLUS `AND public.i_have_module('delivery')`. Dadurch bleiben die
-- (teils über Eltern-Tasks/-Projekte joinenden) Bedingungen der Kind-Tabellen
-- unverändert erhalten; es kommt nur der Modul-Gate dazu.
--
-- Idempotent: beim erneuten Lauf matcht `%_team` die bereits umbenannten
-- `_team_with_module`-Policies NICHT mehr → No-op.
--
-- ⚠️  Prod erst nach 24h-Staging-Soak (useEntitlements stabil) + ausdrücklicher Freigabe.
--
-- ROLLBACK: die _team_with_module-Policies droppen und die ursprünglichen _team-
--   Policies aus den Delivery-Migrationen (20260423130000_delivery_phase_0_1.sql
--   u.a.) erneut ausführen.
-- =============================================================================

begin;

do $$
declare
  r record;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename like 'pm\_%' escape '\'
      and policyname like '%\_team' escape '\'
      and qual is not null
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    if r.with_check is not null then
      execute format(
        'create policy %I on public.%I for all using ((%s) and public.i_have_module(%L)) with check ((%s) and public.i_have_module(%L))',
        r.tablename || '_team_with_module', r.tablename, r.qual, 'delivery', r.with_check, 'delivery');
    else
      execute format(
        'create policy %I on public.%I for all using ((%s) and public.i_have_module(%L))',
        r.tablename || '_team_with_module', r.tablename, r.qual, 'delivery');
    end if;
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
