-- ================================================================
-- Leadesk: Schema Alignment Staging ↔ Production
-- ================================================================
--
-- Hintergrund
-- -----------
-- Der Code in src/lib/whitelabel.js, src/context/TenantContext.jsx und
-- src/pages/WhiteLabel.jsx erwartet das Production-Schema der Tabellen
-- tenants, tenant_members und whitelabel_settings. Auf Staging existieren
-- diese Tabellen mit einem älteren, abweichenden Schema:
--
--   tenants              — fehlen: subdomain, custom_domain, owner_user_id,
--                         plan, max_users, max_leads
--                         (Staging hat stattdessen slug, owner_id, plan_id,
--                         settings jsonb — diese bleiben erhalten)
--
--   tenant_members       — fehlen: is_active, joined_at
--
--   whitelabel_settings  — fehlen: accent_color, sidebar_bg, tenant_id,
--                         favicon_url, custom_css, hide_branding,
--                         font_family
--                         (Staging hat team_id statt tenant_id — bleibt,
--                         damit alter Code/Migrations nichts brechen)
--
-- Risiko
-- ------
-- Alle drei Tabellen sind auf Staging leer (Stand 19.04.2026). Migration
-- ist rein additiv und verliert keine Daten. Idempotent via
-- ADD COLUMN IF NOT EXISTS.
--
-- Ausführung
-- ----------
-- NUR auf Staging-Supabase (Projekt-ID swljvgmnxomvcevoupgg). Läuft
-- wiederholt fehlerfrei durch.
-- ================================================================

-- ── tenants ─────────────────────────────────────────────────────

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subdomain text,
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_leads integer DEFAULT 500;

-- plan NOT NULL erzwingen (nach DEFAULT-Setzung sicher)
UPDATE public.tenants SET plan = 'starter' WHERE plan IS NULL;
ALTER TABLE public.tenants ALTER COLUMN plan SET NOT NULL;

UPDATE public.tenants SET max_users = 5 WHERE max_users IS NULL;
ALTER TABLE public.tenants ALTER COLUMN max_users SET NOT NULL;

UPDATE public.tenants SET max_leads = 500 WHERE max_leads IS NULL;
ALTER TABLE public.tenants ALTER COLUMN max_leads SET NOT NULL;

-- Eindeutigkeit der subdomain, damit loadTenantSettings() verlässlich findet
CREATE UNIQUE INDEX IF NOT EXISTS tenants_subdomain_unique
  ON public.tenants (subdomain)
  WHERE subdomain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_custom_domain_unique
  ON public.tenants (custom_domain)
  WHERE custom_domain IS NOT NULL;

-- ── tenant_members ──────────────────────────────────────────────

ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now();

UPDATE public.tenant_members SET is_active = true WHERE is_active IS NULL;
ALTER TABLE public.tenant_members ALTER COLUMN is_active SET NOT NULL;

UPDATE public.tenant_members SET joined_at = COALESCE(created_at, now()) WHERE joined_at IS NULL;
ALTER TABLE public.tenant_members ALTER COLUMN joined_at SET NOT NULL;

-- ── whitelabel_settings ─────────────────────────────────────────

ALTER TABLE public.whitelabel_settings
  ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#8B5CF6',
  ADD COLUMN IF NOT EXISTS sidebar_bg text DEFAULT '#FFFFFF',
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS custom_css text,
  ADD COLUMN IF NOT EXISTS hide_branding boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'Inter';

UPDATE public.whitelabel_settings SET accent_color = '#8B5CF6' WHERE accent_color IS NULL;
ALTER TABLE public.whitelabel_settings ALTER COLUMN accent_color SET NOT NULL;

UPDATE public.whitelabel_settings SET sidebar_bg = '#FFFFFF' WHERE sidebar_bg IS NULL;
ALTER TABLE public.whitelabel_settings ALTER COLUMN sidebar_bg SET NOT NULL;

UPDATE public.whitelabel_settings SET hide_branding = false WHERE hide_branding IS NULL;
ALTER TABLE public.whitelabel_settings ALTER COLUMN hide_branding SET NOT NULL;

-- Foreign-Key tenant_id → tenants(id), damit loadTenantSettings joinen kann
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whitelabel_settings_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.whitelabel_settings
      ADD CONSTRAINT whitelabel_settings_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ein Tenant hat maximal eine whitelabel_settings-Zeile (wird von Code so erwartet)
CREATE UNIQUE INDEX IF NOT EXISTS whitelabel_settings_tenant_unique
  ON public.whitelabel_settings (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- ── RLS Policies nicht angefasst ────────────────────────────────
-- Bestehende Policies bleiben. Wenn eine Policy auf die neuen Spalten
-- zugreifen soll, wird sie in einer Folge-Migration nachgezogen.
--
-- Kein DROP COLUMN! slug, owner_id, plan_id, settings (jsonb) auf tenants
-- und team_id, domain, settings (jsonb), is_active auf whitelabel_settings
-- bleiben erhalten, damit evtl. vorhandener alter Code (andere Branches)
-- nicht crasht. Können in einer späteren Cleanup-Migration entfernt
-- werden, wenn sicher ist, dass kein Code mehr darauf liest.
