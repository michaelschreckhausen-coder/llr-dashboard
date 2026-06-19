-- ════════════════════════════════════════════════════════════════
-- Phase 2.3d — Versions-Tab + Restore-RPC für Email-Template-Builder
--
-- 2 RPCs:
--   1. list_email_template_versions(template_id, limit, offset) → jsonb
--      Liefert paginierte Versionsliste mit created_by_email-Join + is_current
--      flag. Für Versionen-Tab in EmailTemplateEditModal.
--
--   2. restore_email_template_version(template_id, target_version, summary) → jsonb
--      Append-only restore: lädt Inhalt von vN, schreibt ihn in live row.
--      Trigger email_templates_version_snapshot (Phase 2.1) snapshotted OLD
--      state (ON CONFLICT skip wenn vK schon da) + bumpt current_version K→K+1.
--      Anschließend INSERT v(K+1) mit restored content + "Restored from vN"
--      change_summary. Audit-Trail-perfect, kein Hard-Reset.
--
-- Auth: inline JWT-pattern (matched Phase-2.1-RPCs update_email_template +
--       publish_email_template + restore_email_template_version-Stub falls
--       schon da).
--
-- Schema-Notiz: Column heißt `version` (NICHT version_number per User-Spec).
-- variable_schema wird beim Restore mitgenommen (Trigger checked auch dieses
-- Feld bei DISTINCT FROM, also semantisch zur Version dazugehörig).
-- ════════════════════════════════════════════════════════════════

-- ============================================================
-- 1. list_email_template_versions
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_email_template_versions(
  p_template_id uuid,
  p_limit       int DEFAULT 10,
  p_offset      int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_is_admin boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false);
  v_current_version int;
  v_total bigint;
  v_items jsonb;
BEGIN
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only Leadesk admins can list email-template versions'
      USING ERRCODE = '42501';
  END IF;

  SELECT current_version INTO v_current_version
    FROM public.email_templates
    WHERE id = p_template_id;

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_total
    FROM public.email_template_versions
    WHERE template_id = p_template_id;

  SELECT coalesce(jsonb_agg(item ORDER BY (item->>'version')::int DESC), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT jsonb_build_object(
        'version',          v.version,
        'subject',          v.subject,
        'preheader',        v.preheader,
        'change_summary',   v.change_summary,
        'created_at',       v.created_at,
        'created_by',       v.created_by,
        'created_by_email', u.email,
        'is_current',       (v.version = v_current_version)
      ) AS item
      FROM public.email_template_versions v
      LEFT JOIN auth.users u ON u.id = v.created_by
      WHERE v.template_id = p_template_id
      ORDER BY v.version DESC
      LIMIT  p_limit
      OFFSET p_offset
    ) sub;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total
  );
END;
$function$;

COMMENT ON FUNCTION public.list_email_template_versions(uuid, int, int) IS
  'Phase 2.3d: Paginierte Versionsliste für EmailTemplateEditModal Versionen-Tab. '
  'Returns { items: [...], total: bigint } mit version (DESC), subject, preheader, '
  'change_summary, created_at, created_by_email, is_current.';

-- ============================================================
-- 2. restore_email_template_version
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_email_template_version(
  p_template_id    uuid,
  p_target_version int,
  p_change_summary text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_is_admin boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false);
  v_target   public.email_template_versions;
  v_template public.email_templates;
  v_summary  text := trim(coalesce(p_change_summary, ''));
BEGIN
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only Leadesk admins can restore email-template versions'
      USING ERRCODE = '42501';
  END IF;

  IF length(v_summary) < 10 THEN
    RAISE EXCEPTION 'Change summary must be at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 1. Lade target version
  SELECT * INTO v_target
    FROM public.email_template_versions
    WHERE template_id = p_template_id
      AND version     = p_target_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target version not found: template=%, version=%',
      p_template_id, p_target_version
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. UPDATE email_templates mit target-content.
  --    Trigger email_templates_version_snapshot (BEFORE-UPDATE):
  --      a) snapshotted OLD state (vK) — ON CONFLICT skip wenn vK schon da
  --      b) NEW.current_version := OLD.current_version + 1 (Auto-Bump)
  --      c) NEW.updated_at := now()
  --    Wir setzen current_version NICHT explizit — Trigger handhabt das.
  UPDATE public.email_templates
    SET subject         = v_target.subject,
        preheader       = v_target.preheader,
        mjml_source     = v_target.mjml_source,
        variable_schema = v_target.variable_schema,
        updated_by      = auth.uid()
    WHERE id = p_template_id
    RETURNING * INTO v_template;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found during restore: %', p_template_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Append-only: schreibe v(K+1) mit restored content + Restored-from-Tag.
  --    v_template.current_version ist post-trigger der neue Wert (K+1).
  INSERT INTO public.email_template_versions (
    template_id, version, mjml_source, subject, preheader, variable_schema,
    created_by, change_summary
  ) VALUES (
    p_template_id,
    v_template.current_version,
    v_target.mjml_source,
    v_target.subject,
    v_target.preheader,
    v_target.variable_schema,
    auth.uid(),
    'Restored from v' || p_target_version || ': ' || v_summary
  );

  RETURN to_jsonb(v_template);
END;
$function$;

COMMENT ON FUNCTION public.restore_email_template_version(uuid, int, text) IS
  'Phase 2.3d: Append-only restore. Lädt vN-content in live row, Trigger '
  'snapshotted OLD state + bumpt current_version K→K+1, dann INSERT v(K+1) '
  'mit restored content + "Restored from vN: <summary>" change_summary. '
  'Returns updated email_templates row als jsonb (gleiches Format wie '
  'update_email_template-RPC für Frontend-Konsistenz).';

-- ============================================================
-- 3. GRANTs
-- ============================================================
GRANT EXECUTE ON FUNCTION public.list_email_template_versions(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_email_template_version(uuid, int, text) TO authenticated;
