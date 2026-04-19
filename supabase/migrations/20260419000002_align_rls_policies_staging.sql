-- ================================================================
-- Leadesk: RLS-Policy Alignment Staging ↔ Production
-- ================================================================
--
-- Hintergrund
-- -----------
-- Staging hat engere RLS-Policies auf tenants und whitelabel_settings
-- als Production. Folge: Der Leadesk-Staging-Tenant (Navy-Theme) kann
-- von der App nicht gelesen werden, weil:
--   • `tenants_admin` erlaubt nur Admin-Rollen SELECT — anonyme User bekommen
--     nichts zu sehen. Production erlaubt `is_active = true` allen.
--   • `whitelabel_settings_own` prüft `user_id = auth.uid()` — unser
--     Haupt-Tenant-Record hat aber `user_id = NULL` und identifiziert sich
--     über `tenant_id`. Production erlaubt allen Authenticated Users SELECT.
--
-- Lösung
-- ------
-- Alte Policies droppen, dann exakt dieselben Policy-Namen und Regeln wie
-- auf Production anlegen. Idempotent durch `DROP POLICY IF EXISTS`.
--
-- Ausführung
-- ----------
-- NUR auf Staging (swljvgmnxomvcevoupgg). Auf Production nicht nötig
-- (Policies sind dort bereits korrekt).
-- ================================================================

-- ── tenants ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenants_admin ON public.tenants;
DROP POLICY IF EXISTS tenant_public_read ON public.tenants;
DROP POLICY IF EXISTS tenant_owner_write ON public.tenants;

CREATE POLICY tenant_public_read ON public.tenants
  FOR SELECT
  USING (is_active = true);

CREATE POLICY tenant_owner_write ON public.tenants
  FOR ALL
  USING (owner_user_id = auth.uid());

-- ── whitelabel_settings ─────────────────────────────────────────

DROP POLICY IF EXISTS whitelabel_settings_own ON public.whitelabel_settings;
DROP POLICY IF EXISTS wl_select ON public.whitelabel_settings;
DROP POLICY IF EXISTS wl_insert ON public.whitelabel_settings;
DROP POLICY IF EXISTS wl_update ON public.whitelabel_settings;
DROP POLICY IF EXISTS wl_delete ON public.whitelabel_settings;

CREATE POLICY wl_select ON public.whitelabel_settings
  FOR SELECT
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY wl_insert ON public.whitelabel_settings
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY wl_update ON public.whitelabel_settings
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (
      tenant_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id = whitelabel_settings.tenant_id
          AND t.owner_user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.global_role = 'admin'::user_role
    )
  );

CREATE POLICY wl_delete ON public.whitelabel_settings
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.global_role = 'admin'::user_role
    )
  );
