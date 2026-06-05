-- 2026-06-05 — Daily-Task-Digest Phase 1 + 2: Schema + Aggregation-RPC
--
-- Ziel:
--   Täglich 07:00 Berlin Mail an jeden User mit ihren aktuellen Aufgaben
--   (überfällig + heute fällig), aggregiert über alle 8 Aufgaben-Hub-Sources.
--
-- Bestandteile:
--   1. ALTER user_email_preferences: opted_out_daily_digest bool default false
--   2. INSERT email_templates: 'daily_task_digest' mit MJML-Source
--   3. CREATE FUNCTION get_user_daily_task_digest(uuid, text) -> jsonb
--
-- Architektur-Hinweis: läuft parallel zum existing email_workflows-System
-- (das ist account-scoped + step-basiert für Onboarding-Sequenzen).
-- Daily-Digest ist ein simpler scheduled aggregation+send → eigene EF +
-- pg_cron in Phase 3+4.
--
-- Visibility-Logik in der Aggregation entspricht der RLS-Tightening-Logik
-- aus Migration 20260602190000: User sieht eine Task wenn er Creator oder
-- Assignee/Co-Assignee ist. Team-Owner-Backdoor explizit weg.

BEGIN;

-- ─── Phase 1.1: Opt-Out-Spalte ─────────────────────────────────────────

ALTER TABLE public.user_email_preferences
  ADD COLUMN IF NOT EXISTS opted_out_daily_digest boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_email_preferences.opted_out_daily_digest IS
  'Wenn true, User erhält keine Daily-Task-Digest-Mail (07:00 Berlin). Default false = opt-out-Modell.';

-- ─── Phase 1.2: Email-Template ─────────────────────────────────────────

INSERT INTO public.email_templates (
  template_key,
  name,
  description,
  category,
  subject,
  preheader,
  mjml_source,
  variable_schema,
  status,
  locale
)
VALUES (
  'daily_task_digest',
  'Tägliches Aufgaben-Digest',
  'Täglicher 07:00-Berlin-Versand an User mit überfälligen + heute fälligen Aufgaben aus dem Aufgaben-Hub.',
  'lifecycle',
  'Deine Aufgaben für heute — {{ total_count }} offen',
  'Überfällig: {{ overdue_count }} · Heute fällig: {{ today_count }}',
  $MJML$<mjml>
  <mj-head>
    <mj-title>Deine Aufgaben für heute</mj-title>
    <mj-preview>Überfällig: {{ overdue_count }} · Heute fällig: {{ today_count }}</mj-preview>
    <mj-attributes>
      <mj-all font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" />
      <mj-text line-height="1.5" color="#111827" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F9FAFB">
    <mj-section background-color="#FFFFFF" padding="32px 24px 16px">
      <mj-column>
        <mj-text font-size="20px" font-weight="700" color="#111827">
          Guten Morgen{{#if first_name}}, {{ first_name }}{{/if}}.
        </mj-text>
        <mj-text font-size="14px" color="#6B7280" padding-top="4px">
          Heute, {{ date_label }} · {{ total_count }} Aufgabe{{#unless total_count_singular}}n{{/unless}} auf deinem Tisch
        </mj-text>
      </mj-column>
    </mj-section>

    {{#if overdue_count}}
    <mj-section background-color="#FFFFFF" padding="0 24px 8px">
      <mj-column>
        <mj-text font-size="12px" font-weight="700" color="#DC2626" text-transform="uppercase" letter-spacing="0.06em" padding-bottom="8px">
          ⚠ Überfällig · {{ overdue_count }}
        </mj-text>
        {{#each overdue}}
        <mj-text padding="10px 0" border-bottom="1px solid #F3F4F6" font-size="14px">
          <strong>{{ title }}</strong>
          {{#if lead_name}}<br /><span style="color:#6B7280;font-size:12px;">{{ lead_name }}{{#if lead_company}} · {{ lead_company }}{{/if}}</span>{{/if}}
          <br /><span style="color:#DC2626;font-size:11px;font-weight:600;">{{ source_label }} · überfällig seit {{ due_label }}</span>
        </mj-text>
        {{/each}}
      </mj-column>
    </mj-section>
    {{/if}}

    {{#if today_count}}
    <mj-section background-color="#FFFFFF" padding="16px 24px 8px">
      <mj-column>
        <mj-text font-size="12px" font-weight="700" color="#D97706" text-transform="uppercase" letter-spacing="0.06em" padding-bottom="8px">
          ⚡ Heute fällig · {{ today_count }}
        </mj-text>
        {{#each today}}
        <mj-text padding="10px 0" border-bottom="1px solid #F3F4F6" font-size="14px">
          <strong>{{ title }}</strong>
          {{#if lead_name}}<br /><span style="color:#6B7280;font-size:12px;">{{ lead_name }}{{#if lead_company}} · {{ lead_company }}{{/if}}</span>{{/if}}
          <br /><span style="color:#6B7280;font-size:11px;font-weight:600;">{{ source_label }}</span>
        </mj-text>
        {{/each}}
      </mj-column>
    </mj-section>
    {{/if}}

    <mj-section background-color="#FFFFFF" padding="16px 24px 32px">
      <mj-column>
        <mj-button background-color="rgb(49,90,231)" color="#FFFFFF" font-weight="700" border-radius="10px" href="{{ app_url }}/aufgaben">
          In Leadesk öffnen →
        </mj-button>
      </mj-column>
    </mj-section>

    <mj-section padding="16px 24px 24px">
      <mj-column>
        <mj-text font-size="11px" color="#9CA3AF" align="center">
          Diese Mail kommt jeden Morgen um 7 Uhr. <a href="{{ app_url }}/settings/profil" style="color:#6B7280;">Einstellungen anpassen</a> · <a href="{{ unsubscribe_url }}" style="color:#6B7280;">Abbestellen</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>$MJML$,
  '{"first_name":"text","date_label":"text","total_count":"int","total_count_singular":"bool","overdue_count":"int","today_count":"int","overdue":"array","today":"array","app_url":"text","unsubscribe_url":"text"}'::jsonb,
  'published',
  'de'
)
ON CONFLICT (template_key, locale) DO UPDATE SET
  mjml_source = EXCLUDED.mjml_source,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  variable_schema = EXCLUDED.variable_schema,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = now();

-- ─── Phase 2: Aggregation-RPC ──────────────────────────────────────────

-- SECURITY DEFINER damit der Daily-Digest-EF (via service-role) und manuell
-- (zum Debugging) als auth.uid() laufen können. Visibility-Logik erfolgt
-- explizit in der Query, nicht via RLS-Bypass.

DROP FUNCTION IF EXISTS public.get_user_daily_task_digest(uuid, text);

CREATE OR REPLACE FUNCTION public.get_user_daily_task_digest(
  p_user_id uuid,
  p_tz      text DEFAULT 'Europe/Berlin'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE p_tz)::date;
  v_overdue jsonb;
  v_today_due jsonb;
  v_overdue_count int;
  v_today_count int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'user_id_required');
  END IF;

  -- ─── UNION über alle 8 Sources mit Source-Label + Visibility-Filter ─────────
  -- WITH cte_all AS (...) liefert pro Source Row: title, source, source_label,
  -- lead_name, lead_company, due_date. Filter danach pro overdue/today.

  WITH cte_all AS (
    -- 1. lead_tasks (Multi-Assignee: Creator ODER Junction-Mitglied)
    SELECT
      t.id::text AS task_id,
      t.title,
      'lead_task' AS source,
      'CRM' AS source_label,
      COALESCE(NULLIF(TRIM(CONCAT(l.first_name, ' ', l.last_name)), ''), l.name, l.company) AS lead_name,
      l.company AS lead_company,
      t.due_date
    FROM public.lead_tasks t
    LEFT JOIN public.leads l ON l.id = t.lead_id
    WHERE t.status != 'done'
      AND t.due_date IS NOT NULL
      AND (
        t.created_by = p_user_id
        OR EXISTS (
          SELECT 1 FROM public.lead_task_assignees a
          WHERE a.task_id = t.id AND a.user_id = p_user_id
        )
      )

    UNION ALL

    -- 2. content_posts (assignee_id ODER creator wenn assignee NULL)
    SELECT
      p.id::text,
      COALESCE(p.title, '(ohne Titel)'),
      'content_post',
      'Content',
      NULL, NULL,
      (p.scheduled_at AT TIME ZONE p_tz)::date
    FROM public.content_posts p
    WHERE p.status IN ('idee', 'draft', 'in_review', 'approved')
      AND p.scheduled_at IS NOT NULL
      AND (p.assignee_id = p_user_id OR (p.assignee_id IS NULL AND p.user_id = p_user_id))

    UNION ALL

    -- 3. pm_tasks (über pm_task_assignments)
    SELECT
      pt.id::text,
      pt.title,
      'pm_task',
      'Projekt',
      NULL,
      proj.name,
      pt.due_date
    FROM public.pm_tasks pt
    LEFT JOIN public.pm_projects proj ON proj.id = pt.project_id
    LEFT JOIN public.pm_columns c ON c.id = pt.column_id
    WHERE pt.due_date IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.pm_task_assignments a
        WHERE a.task_id = pt.id AND a.assignee_id = p_user_id
      )
      AND NOT (LOWER(COALESCE(c.name, '')) ~ '(erledigt|done|fertig|completed|geliefert)')

    UNION ALL

    -- 4. deals (Owner oder Creator, expected_close_date)
    SELECT
      d.id::text,
      'Deal: ' || COALESCE(d.title, 'Unbenannt'),
      'deal_followup',
      'Deal',
      COALESCE(NULLIF(TRIM(CONCAT(l.first_name, ' ', l.last_name)), ''), l.name, l.company),
      l.company,
      d.expected_close_date
    FROM public.deals d
    LEFT JOIN public.leads l ON l.id = d.lead_id
    WHERE d.expected_close_date IS NOT NULL
      AND d.stage NOT IN ('gewonnen', 'verloren', 'kein_deal')
      AND (d.owner_id = p_user_id OR d.created_by = p_user_id)

    UNION ALL

    -- 5. leads.next_followup
    SELECT
      l.id::text,
      'Follow-up: ' || COALESCE(NULLIF(TRIM(CONCAT(l.first_name, ' ', l.last_name)), ''), l.name, l.company, 'Kontakt'),
      'lead_followup',
      'Follow-up',
      COALESCE(NULLIF(TRIM(CONCAT(l.first_name, ' ', l.last_name)), ''), l.name, l.company),
      l.company,
      CASE
        WHEN pg_typeof(l.next_followup) = 'date'::regtype THEN l.next_followup::date
        ELSE (l.next_followup AT TIME ZONE p_tz)::date
      END
    FROM public.leads l
    WHERE l.next_followup IS NOT NULL
      AND l.archived = false
      AND (l.owner_id = p_user_id OR l.user_id = p_user_id)

    UNION ALL

    -- 6. Stale Leads (status='Lead' > 7 Tage unverändert)
    SELECT
      l.id::text,
      'Qualifizieren: ' || COALESCE(NULLIF(TRIM(CONCAT(l.first_name, ' ', l.last_name)), ''), l.name, l.company, 'Kontakt'),
      'stale_lead',
      'Stale Lead',
      COALESCE(NULLIF(TRIM(CONCAT(l.first_name, ' ', l.last_name)), ''), l.name, l.company),
      l.company,
      v_today  -- Stale Leads haben kein due_date, behandeln wir als "heute"
    FROM public.leads l
    WHERE l.status = 'Lead'
      AND l.updated_at < (now() - interval '7 days')
      AND l.archived = false
      AND (l.owner_id = p_user_id OR l.user_id = p_user_id)

    UNION ALL

    -- 7. LinkedIn-Unanswered (letzte Message von Lead, direction='in')
    SELECT
      l.id::text,
      'Antwort offen: ' || COALESCE(NULLIF(TRIM(CONCAT(l.first_name, ' ', l.last_name)), ''), l.name, l.company, 'LinkedIn-Kontakt'),
      'linkedin_unanswered',
      'LinkedIn',
      COALESCE(NULLIF(TRIM(CONCAT(l.first_name, ' ', l.last_name)), ''), l.name, l.company),
      l.company,
      v_today  -- Behandeln als "heute"
    FROM public.leads l
    WHERE l.archived = false
      AND (l.owner_id = p_user_id OR l.user_id = p_user_id)
      AND EXISTS (
        SELECT 1 FROM public.linkedin_messages m
        WHERE m.lead_id = l.id
          AND m.direction = 'in'
          AND m.id = (
            SELECT id FROM public.linkedin_messages
            WHERE lead_id = l.id
            ORDER BY COALESCE(sent_at, created_at) DESC
            LIMIT 1
          )
      )

    -- 8. ssi_daily ist synthetisch + kein Lead-Bezug → bewusst NICHT in Digest
  )
  -- Overdue: due_date < today
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'task_id', task_id,
      'title', title,
      'source', source,
      'source_label', source_label,
      'lead_name', lead_name,
      'lead_company', lead_company,
      'due_date', due_date,
      'due_label', to_char(due_date, 'DD.MM.YYYY')
    ) ORDER BY due_date), '[]'::jsonb),
    COUNT(*)::int
  INTO v_overdue, v_overdue_count
  FROM cte_all
  WHERE due_date < v_today;

  -- Today: due_date = today
  WITH cte_all_v2 AS (
    -- Sub-Query nicht erneut definierbar — Workaround: redefine inline
    SELECT * FROM (
      SELECT
        t.id::text AS task_id, t.title, 'lead_task' AS source, 'CRM' AS source_label,
        COALESCE(NULLIF(TRIM(CONCAT(l.first_name, ' ', l.last_name)), ''), l.name, l.company) AS lead_name,
        l.company AS lead_company, t.due_date
      FROM public.lead_tasks t LEFT JOIN public.leads l ON l.id = t.lead_id
      WHERE t.status != 'done' AND t.due_date IS NOT NULL
        AND (t.created_by = p_user_id OR EXISTS (
          SELECT 1 FROM public.lead_task_assignees a WHERE a.task_id = t.id AND a.user_id = p_user_id))
      UNION ALL
      SELECT p.id::text, COALESCE(p.title, '(ohne Titel)'), 'content_post', 'Content', NULL, NULL,
        (p.scheduled_at AT TIME ZONE p_tz)::date
      FROM public.content_posts p
      WHERE p.status IN ('idee','draft','in_review','approved') AND p.scheduled_at IS NOT NULL
        AND (p.assignee_id = p_user_id OR (p.assignee_id IS NULL AND p.user_id = p_user_id))
      UNION ALL
      SELECT pt.id::text, pt.title, 'pm_task', 'Projekt', NULL, proj.name, pt.due_date
      FROM public.pm_tasks pt
      LEFT JOIN public.pm_projects proj ON proj.id = pt.project_id
      LEFT JOIN public.pm_columns c ON c.id = pt.column_id
      WHERE pt.due_date IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.pm_task_assignments a WHERE a.task_id = pt.id AND a.assignee_id = p_user_id)
        AND NOT (LOWER(COALESCE(c.name,'')) ~ '(erledigt|done|fertig|completed|geliefert)')
      UNION ALL
      SELECT d.id::text, 'Deal: ' || COALESCE(d.title,'Unbenannt'), 'deal_followup', 'Deal',
        COALESCE(NULLIF(TRIM(CONCAT(l.first_name,' ',l.last_name)),''),l.name,l.company), l.company, d.expected_close_date
      FROM public.deals d LEFT JOIN public.leads l ON l.id = d.lead_id
      WHERE d.expected_close_date IS NOT NULL AND d.stage NOT IN ('gewonnen','verloren','kein_deal')
        AND (d.owner_id = p_user_id OR d.created_by = p_user_id)
      UNION ALL
      SELECT l.id::text,
        'Follow-up: ' || COALESCE(NULLIF(TRIM(CONCAT(l.first_name,' ',l.last_name)),''),l.name,l.company,'Kontakt'),
        'lead_followup', 'Follow-up',
        COALESCE(NULLIF(TRIM(CONCAT(l.first_name,' ',l.last_name)),''),l.name,l.company), l.company,
        CASE WHEN pg_typeof(l.next_followup) = 'date'::regtype THEN l.next_followup::date
          ELSE (l.next_followup AT TIME ZONE p_tz)::date END
      FROM public.leads l
      WHERE l.next_followup IS NOT NULL AND l.archived = false
        AND (l.owner_id = p_user_id OR l.user_id = p_user_id)
      UNION ALL
      SELECT l.id::text,
        'Qualifizieren: ' || COALESCE(NULLIF(TRIM(CONCAT(l.first_name,' ',l.last_name)),''),l.name,l.company,'Kontakt'),
        'stale_lead', 'Stale Lead',
        COALESCE(NULLIF(TRIM(CONCAT(l.first_name,' ',l.last_name)),''),l.name,l.company), l.company, v_today
      FROM public.leads l
      WHERE l.status = 'Lead' AND l.updated_at < (now() - interval '7 days') AND l.archived = false
        AND (l.owner_id = p_user_id OR l.user_id = p_user_id)
      UNION ALL
      SELECT l.id::text,
        'Antwort offen: ' || COALESCE(NULLIF(TRIM(CONCAT(l.first_name,' ',l.last_name)),''),l.name,l.company,'LinkedIn-Kontakt'),
        'linkedin_unanswered', 'LinkedIn',
        COALESCE(NULLIF(TRIM(CONCAT(l.first_name,' ',l.last_name)),''),l.name,l.company), l.company, v_today
      FROM public.leads l
      WHERE l.archived = false AND (l.owner_id = p_user_id OR l.user_id = p_user_id)
        AND EXISTS (SELECT 1 FROM public.linkedin_messages m
          WHERE m.lead_id = l.id AND m.direction = 'in'
          AND m.id = (SELECT id FROM public.linkedin_messages WHERE lead_id = l.id
            ORDER BY COALESCE(sent_at, created_at) DESC LIMIT 1))
    ) sub
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'task_id', task_id,
      'title', title,
      'source', source,
      'source_label', source_label,
      'lead_name', lead_name,
      'lead_company', lead_company,
      'due_date', due_date,
      'due_label', to_char(due_date, 'DD.MM.YYYY')
    ) ORDER BY due_date), '[]'::jsonb),
    COUNT(*)::int
  INTO v_today_due, v_today_count
  FROM cte_all_v2
  WHERE due_date = v_today;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'tz', p_tz,
    'date', v_today,
    'date_label', to_char(v_today, 'DD.MM.YYYY'),
    'overdue_count', v_overdue_count,
    'today_count', v_today_count,
    'total_count', v_overdue_count + v_today_count,
    'total_count_singular', (v_overdue_count + v_today_count = 1),
    'overdue', v_overdue,
    'today', v_today_due
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_daily_task_digest(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_daily_task_digest(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_daily_task_digest(uuid, text) TO service_role;

-- ─── Verifikation ──────────────────────────────────────────────────────

DO $$
DECLARE
  has_opt_out_col   boolean;
  has_template      boolean;
  has_rpc           boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_email_preferences'
      AND column_name='opted_out_daily_digest'
  ) INTO has_opt_out_col;

  SELECT EXISTS (
    SELECT 1 FROM public.email_templates
    WHERE template_key='daily_task_digest' AND locale='de' AND status='published'
  ) INTO has_template;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_user_daily_task_digest' AND p.prosecdef
  ) INTO has_rpc;

  IF NOT has_opt_out_col THEN RAISE EXCEPTION 'opted_out_daily_digest column missing'; END IF;
  IF NOT has_template    THEN RAISE EXCEPTION 'daily_task_digest template not published'; END IF;
  IF NOT has_rpc         THEN RAISE EXCEPTION 'get_user_daily_task_digest RPC missing'; END IF;

  RAISE NOTICE 'Daily-Task-Digest Phase 1+2 OK: Opt-Out-Spalte + Template + RPC alle present';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
