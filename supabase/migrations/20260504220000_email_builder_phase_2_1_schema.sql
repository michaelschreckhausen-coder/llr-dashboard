-- File: 20260504220000_email_builder_phase_2_1_schema.sql
-- Block: Phase 2.1 — Email-Builder Foundation
--
-- 3 Tables + 2 Triggers + 4 RPCs + RLS Policies

-- ════════════════════════════════════════════════════════════════
-- 1. email_templates (System-Templates, MJML source)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key    text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text,
  category        text NOT NULL CHECK (category IN ('auth','billing','lifecycle','transactional','marketing')),

  mjml_source     text NOT NULL,
  subject         text NOT NULL,
  preheader       text,

  variable_schema jsonb NOT NULL DEFAULT '{}'::jsonb,

  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  current_version int  NOT NULL DEFAULT 1,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at    timestamptz,
  archived_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_templates_status   ON public.email_templates (status);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON public.email_templates (category);

COMMENT ON TABLE  public.email_templates IS
  'System-Email-Templates (MJML source). Single source of truth. Tenants override via email_tenant_branding only.';

-- ════════════════════════════════════════════════════════════════
-- 2. email_template_versions (Snapshot-History)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_template_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  version         int  NOT NULL,
  mjml_source     text NOT NULL,
  subject         text NOT NULL,
  preheader       text,
  variable_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  change_summary  text,
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_email_template_versions_template
  ON public.email_template_versions (template_id, version DESC);

COMMENT ON TABLE  public.email_template_versions IS
  'Snapshot-history: jeder content-field UPDATE auf email_templates auto-snapshots OLD state hier (Trigger-driven).';

-- ════════════════════════════════════════════════════════════════
-- 3. email_tenant_branding (Variablen-Only Override pro Account)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_tenant_branding (
  account_id          uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,

  logo_url            text,
  primary_color       text CHECK (primary_color IS NULL OR primary_color ~ '^#[A-Fa-f0-9]{6}$'),
  secondary_color     text CHECK (secondary_color IS NULL OR secondary_color ~ '^#[A-Fa-f0-9]{6}$'),

  sender_name         text,
  reply_to_email      text CHECK (reply_to_email IS NULL OR reply_to_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),

  footer_company_name text,
  footer_address     text,
  footer_legal_links  jsonb DEFAULT '{}'::jsonb,

  custom_css          text,

  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  public.email_tenant_branding IS
  'Per-Account Branding-Override. NULL field = use system default. Whitelabel-relevant.';

-- ════════════════════════════════════════════════════════════════
-- 4. Triggers — Snapshot Versioning
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.snapshot_email_template_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.mjml_source     IS DISTINCT FROM NEW.mjml_source) OR
     (OLD.subject         IS DISTINCT FROM NEW.subject)     OR
     (OLD.preheader       IS DISTINCT FROM NEW.preheader)   OR
     (OLD.variable_schema IS DISTINCT FROM NEW.variable_schema) THEN

    INSERT INTO public.email_template_versions (
      template_id, version, mjml_source, subject, preheader, variable_schema,
      created_by, change_summary
    ) VALUES (
      OLD.id, OLD.current_version, OLD.mjml_source, OLD.subject, OLD.preheader, OLD.variable_schema,
      NEW.updated_by, NULL
    )
    ON CONFLICT (template_id, version) DO NOTHING;
    -- Why: AFTER-INSERT writes v1='Initial creation'. First UPDATE has OLD.current_version=1
    -- and would collide on UNIQUE(template_id,version). v1 row already captures initial OLD state,
    -- so ON CONFLICT DO NOTHING is the correct semantic skip.

    NEW.current_version := OLD.current_version + 1;
    NEW.updated_at      := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_templates_version_snapshot ON public.email_templates;
CREATE TRIGGER email_templates_version_snapshot
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_email_template_version();

CREATE OR REPLACE FUNCTION public.snapshot_email_template_initial()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.email_template_versions (
    template_id, version, mjml_source, subject, preheader, variable_schema,
    created_by, change_summary
  ) VALUES (
    NEW.id, 1, NEW.mjml_source, NEW.subject, NEW.preheader, NEW.variable_schema,
    NEW.created_by, 'Initial creation'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_templates_initial_version ON public.email_templates;
CREATE TRIGGER email_templates_initial_version
  AFTER INSERT ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_email_template_initial();

-- ════════════════════════════════════════════════════════════════
-- 5. RPCs
-- ════════════════════════════════════════════════════════════════

-- 5a. update_email_template (admin: edit content + change_summary)
CREATE OR REPLACE FUNCTION public.update_email_template(
  p_template_id     uuid,
  p_mjml_source     text DEFAULT NULL,
  p_subject         text DEFAULT NULL,
  p_preheader       text DEFAULT NULL,
  p_variable_schema jsonb DEFAULT NULL,
  p_change_summary  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template public.email_templates;
  v_is_admin boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false);
BEGIN
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only Leadesk admins can update email templates' USING ERRCODE = '42501';
  END IF;

  UPDATE public.email_templates
    SET mjml_source     = COALESCE(p_mjml_source, mjml_source),
        subject         = COALESCE(p_subject, subject),
        preheader       = CASE WHEN p_preheader IS NOT NULL THEN p_preheader ELSE preheader END,
        variable_schema = COALESCE(p_variable_schema, variable_schema),
        updated_by      = auth.uid()
    WHERE id = p_template_id
    RETURNING * INTO v_template;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id USING ERRCODE = 'P0002';
  END IF;

  IF p_change_summary IS NOT NULL THEN
    UPDATE public.email_template_versions
      SET change_summary = p_change_summary
      WHERE template_id = p_template_id AND version = v_template.current_version - 1;
  END IF;

  RETURN to_jsonb(v_template);
END;
$$;

-- 5b. publish_email_template (admin: draft → published)
CREATE OR REPLACE FUNCTION public.publish_email_template(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_t public.email_templates;
BEGIN
  IF NOT coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Only Leadesk admins' USING ERRCODE = '42501';
  END IF;
  UPDATE public.email_templates
    SET status='published', published_at=now(), updated_by=auth.uid()
    WHERE id=p_template_id RETURNING * INTO v_t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found' USING ERRCODE='P0002'; END IF;
  RETURN to_jsonb(v_t);
END;
$$;

-- 5c. restore_email_template_version (admin: version → current)
CREATE OR REPLACE FUNCTION public.restore_email_template_version(
  p_template_id uuid, p_version int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_v public.email_template_versions;
  v_t public.email_templates;
BEGIN
  IF NOT coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Only Leadesk admins' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_v FROM public.email_template_versions
    WHERE template_id=p_template_id AND version=p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found' USING ERRCODE='P0002'; END IF;

  UPDATE public.email_templates
    SET mjml_source     = v_v.mjml_source,
        subject         = v_v.subject,
        preheader       = v_v.preheader,
        variable_schema = v_v.variable_schema,
        updated_by      = auth.uid()
    WHERE id=p_template_id RETURNING * INTO v_t;

  UPDATE public.email_template_versions
    SET change_summary = format('Restored to version %s', p_version)
    WHERE template_id=p_template_id AND version=v_t.current_version - 1;

  RETURN to_jsonb(v_t);
END;
$$;

-- 5d. set_tenant_branding (account-owner: update branding for own account)
CREATE OR REPLACE FUNCTION public.set_tenant_branding(
  p_account_id          uuid,
  p_logo_url            text DEFAULT NULL,
  p_primary_color       text DEFAULT NULL,
  p_secondary_color     text DEFAULT NULL,
  p_sender_name         text DEFAULT NULL,
  p_reply_to_email      text DEFAULT NULL,
  p_footer_company_name text DEFAULT NULL,
  p_footer_address      text DEFAULT NULL,
  p_footer_legal_links  jsonb DEFAULT NULL,
  p_custom_css          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.email_tenant_branding;
  v_is_owner boolean;
  v_is_admin boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false);
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.accounts WHERE id=p_account_id AND owner_user_id=auth.uid())
    INTO v_is_owner;
  IF NOT (v_is_owner OR v_is_admin) THEN
    RAISE EXCEPTION 'Not account owner' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.email_tenant_branding (
    account_id, logo_url, primary_color, secondary_color, sender_name, reply_to_email,
    footer_company_name, footer_address, footer_legal_links, custom_css, updated_by
  ) VALUES (
    p_account_id, p_logo_url, p_primary_color, p_secondary_color, p_sender_name, p_reply_to_email,
    p_footer_company_name, p_footer_address, p_footer_legal_links, p_custom_css, auth.uid()
  )
  ON CONFLICT (account_id) DO UPDATE SET
    logo_url            = COALESCE(EXCLUDED.logo_url, email_tenant_branding.logo_url),
    primary_color       = COALESCE(EXCLUDED.primary_color, email_tenant_branding.primary_color),
    secondary_color     = COALESCE(EXCLUDED.secondary_color, email_tenant_branding.secondary_color),
    sender_name         = COALESCE(EXCLUDED.sender_name, email_tenant_branding.sender_name),
    reply_to_email      = COALESCE(EXCLUDED.reply_to_email, email_tenant_branding.reply_to_email),
    footer_company_name = COALESCE(EXCLUDED.footer_company_name, email_tenant_branding.footer_company_name),
    footer_address      = COALESCE(EXCLUDED.footer_address, email_tenant_branding.footer_address),
    footer_legal_links  = COALESCE(EXCLUDED.footer_legal_links, email_tenant_branding.footer_legal_links),
    custom_css          = COALESCE(EXCLUDED.custom_css, email_tenant_branding.custom_css),
    updated_at          = now(),
    updated_by          = auth.uid()
  RETURNING * INTO v_b;
  RETURN to_jsonb(v_b);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_email_template          TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_email_template         TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_email_template_version TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_branding            TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 6. RLS-Policies
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.email_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_tenant_branding   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_can_read_published_templates" ON public.email_templates;
CREATE POLICY "auth_can_read_published_templates" ON public.email_templates
  FOR SELECT TO authenticated
  USING (status = 'published' OR coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

DROP POLICY IF EXISTS "leadesk_admin_full_write_templates" ON public.email_templates;
CREATE POLICY "leadesk_admin_full_write_templates" ON public.email_templates
  FOR ALL TO authenticated
  USING (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false))
  WITH CHECK (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

DROP POLICY IF EXISTS "leadesk_admin_full_versions" ON public.email_template_versions;
CREATE POLICY "leadesk_admin_full_versions" ON public.email_template_versions
  FOR ALL TO authenticated
  USING (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

DROP POLICY IF EXISTS "owner_or_admin_branding" ON public.email_tenant_branding;
CREATE POLICY "owner_or_admin_branding" ON public.email_tenant_branding
  FOR ALL TO authenticated
  USING (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false)
    OR account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid())
  );

GRANT SELECT ON public.email_templates         TO authenticated;
GRANT SELECT ON public.email_template_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.email_tenant_branding TO authenticated;
