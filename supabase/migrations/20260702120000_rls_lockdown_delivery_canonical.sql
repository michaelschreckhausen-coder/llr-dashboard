-- RLS-Lockdown DELIVERY — KANONISCH & ENV-UNABHÄNGIG
-- =============================================================================
-- Ersetzt den DO-Loop-Ansatz von 20260701130000_rls_lockdown_delivery.sql.
--
-- WARUM DIESER REWRITE:
--   20260701130000 konvertiert nur BEREITS EXISTIERENDE %_team-Policies
--   (DO-Loop über pg_policies). Auf Prod existieren aber nur 2 der 13
--   pm_-Team-Policies → dort würden 11 pm-Tabellen UNGEGATET bleiben.
--   Effekt Staging (13 Policies) ↔ Prod (2 Policies) wäre nicht identisch.
--
--   Diese Migration erzeugt die 13 kanonischen Delivery-Policies EXPLIZIT
--   (hartkodierte Tabellenlisten) als <tabelle>_team_with_module — inkl.
--   ENABLE RLS + Cross-Table-Grants. Ergebnis ist auf JEDER Umgebung identisch,
--   unabhängig vom Ausgangszustand.
--
-- KANONISCHE USING-BEDINGUNGEN (Quelle, 1:1 übernommen + Modul-Gate):
--   20260423130000_delivery_phase_0_1.sql          (11 Tabellen)
--   20260501120000_delivery_phase_3_time_tracking.sql (pm_activity_types, pm_time_entries)
--
-- WITH CHECK wird bewusst NICHT gesetzt → Postgres nutzt bei FOR ALL die
-- USING-Bedingung auch als WITH CHECK (identisch zu den Original-Policies).
--
-- IDEMPOTENT: droppt sowohl _team als auch _team_with_module vor CREATE.
-- Re-Run = No-op-Effekt (gleiche Policies).
--
-- =============================================================================
-- ⚠️  PROD-APPLY — REIHENFOLGE & GATES (nicht blind ausführen):
--   1. Auf Prod NUR DIESE Migration applien, 20260701130000 ÜBERSPRINGEN
--      (die kanonische ist ein Superset und env-sicher; Hetzner-Apply ist
--       manuell/ungetrackt, daher frei wählbar).
--   2. PRE-CHECK „Accounts ohne delivery-Modul → 0 Rows" (siehe unten) auf
--      PROD laufen lassen. Nicht 0 → Bestandskunden-Aussperrung, STOP.
--   3. OVERWRITE-SCHUTZ: die 2 bestehenden Prod-pm-_team-Policies gegen die
--      kanonischen qual-Ausdrücke hier diffen. Weichen sie ab → erst klären
--      warum (Prod-spezifischer Fix?), sonst überschreibt diese Migration sie.
--   4. ROGUE-POLICY-CHECK: prüfen ob auf den 13 pm-Tabellen weitere permissive
--      Policies (_own/_insert/_select o.ä.) liegen, die den Lockdown umgehen.
--      Diese Migration droppt nur _team + _team_with_module — Rogues müssen
--      separat gedroppt werden (Namen sind envabhängig, daher nicht hartkodiert).
--   5. 24h-Staging-Soak + ausdrückliche Freigabe (RLS_LOCKDOWN_TEMPLATE-Regel).
--
-- PRE-CHECK (read-only, VOR dem Apply auf der Ziel-DB):
--   SELECT a.id, a.name FROM accounts a
--   LEFT JOIN plans p ON p.id = a.plan_id
--   WHERE NOT 'delivery' = ANY(COALESCE(p.modules, '{}'));   -- erwartet: 0 Rows
--
-- ROGUE-/DRIFT-INVENTAR (read-only, VOR dem Apply):
--   SELECT tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE schemaname='public' AND tablename LIKE 'pm\_%' ESCAPE '\'
--   ORDER BY tablename, policyname;
--
-- ROLLBACK: _team_with_module droppen, Original-_team-Policies aus
--   20260423130000 + 20260501120000 erneut ausführen.
-- =============================================================================

begin;

do $$
declare
  t text;
  -- (1) Direkt über eigenes team_id
  direct_tables text[] := array[
    'pm_projects','pm_tasks','pm_columns','pm_activity_types','pm_time_entries'
  ];
  -- (2) Kindertabellen über project_id → pm_projects-Join
  project_tables text[] := array[
    'pm_labels','pm_project_members','pm_activity_log'
  ];
  -- (3) Kindertabellen über task_id → pm_tasks-Join
  task_tables text[] := array[
    'pm_task_labels','pm_checklist_items','pm_comments','pm_attachments','pm_task_assignments'
  ];
begin
  -- (1) Direkt-team_id
  foreach t in array direct_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_team', t);
    execute format('drop policy if exists %I on public.%I', t || '_team_with_module', t);
    execute format(
      'create policy %I on public.%I for all using ('
      || 'team_id in (select team_id from team_members where user_id = auth.uid())'
      || ' and public.i_have_module(''delivery''))',
      t || '_team_with_module', t
    );
  end loop;

  -- (2) project_id-Join
  foreach t in array project_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_team', t);
    execute format('drop policy if exists %I on public.%I', t || '_team_with_module', t);
    execute format(
      'create policy %I on public.%I for all using ('
      || 'exists (select 1 from pm_projects p where p.id = project_id'
      || ' and p.team_id in (select team_id from team_members where user_id = auth.uid()))'
      || ' and public.i_have_module(''delivery''))',
      t || '_team_with_module', t
    );
  end loop;

  -- (3) task_id-Join
  foreach t in array task_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_team', t);
    execute format('drop policy if exists %I on public.%I', t || '_team_with_module', t);
    execute format(
      'create policy %I on public.%I for all using ('
      || 'exists (select 1 from pm_tasks tk where tk.id = task_id'
      || ' and tk.team_id in (select team_id from team_members where user_id = auth.uid()))'
      || ' and public.i_have_module(''delivery''))',
      t || '_team_with_module', t
    );
  end loop;
end $$;

-- Hetzner Self-Host: Cross-Table-Subquery-Policies brauchen explizite Grants
-- (Hard-Rule #3 in CLAUDE.md — sonst laufen die Sub-Queries stumm auf 0 Rows).
grant select on team_members to authenticated;
grant select on teams        to authenticated;
grant select on pm_projects  to authenticated;
grant select on pm_tasks     to authenticated;

commit;

notify pgrst, 'reload schema';
