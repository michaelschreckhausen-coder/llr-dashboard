-- 2026-06-05 — Daily-Task-Digest Template-Vereinfachung
--
-- Bug nach Phase-3-Smoke: render-email-EF macht nur Mustache-Light
-- ({{key}}-Substitution), keine {{#if}}/{{#each}}-Handlebars. Daher die
-- Conditionals + Loops im ersten Template-Entwurf wurden literal angezeigt.
--
-- Fix: Loops + Conditionals werden server-side im send-daily-task-digest EF
-- aufgelöst und als pre-rendered MJML-Strings (overdue_section/today_section)
-- als Variables übergeben. Template ist jetzt minimal: nur simple
-- {{key}}-Substitutionen.

BEGIN;

UPDATE public.email_templates
SET
  mjml_source = $MJML$<mjml>
  <mj-head>
    <mj-title>Deine Aufgaben für heute</mj-title>
    <mj-preview>{{ overdue_count }} überfällig · {{ today_count }} heute fällig</mj-preview>
    <mj-attributes>
      <mj-all font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" />
      <mj-text line-height="1.5" color="#111827" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F9FAFB">
    <mj-section background-color="#FFFFFF" padding="32px 24px 16px">
      <mj-column>
        <mj-text font-size="20px" font-weight="700" color="#111827">
          {{ greeting }}
        </mj-text>
        <mj-text font-size="14px" color="#6B7280" padding-top="4px">
          {{ subtitle }}
        </mj-text>
      </mj-column>
    </mj-section>

    {{ overdue_section }}

    {{ today_section }}

    <mj-section background-color="#FFFFFF" padding="16px 24px 32px">
      <mj-column>
        <mj-button background-color="rgb(49,90,231)" color="#FFFFFF" font-weight="700" border-radius="10px" href="{{ app_url }}/aufgaben">
          In Leadesk öffnen →
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>$MJML$,
  preheader = '{{ overdue_count }} überfällig · {{ today_count }} heute fällig',
  variable_schema = '{"greeting":"text","subtitle":"text","overdue_section":"raw_mjml","today_section":"raw_mjml","total_count":"int","overdue_count":"int","today_count":"int","app_url":"text"}'::jsonb,
  updated_at = now()
WHERE template_key = 'daily_task_digest' AND locale = 'de';

-- Verifikation
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.email_templates
  WHERE template_key = 'daily_task_digest' AND locale = 'de';

  IF v_count != 1 THEN
    RAISE EXCEPTION 'daily_task_digest template not exactly 1, got %', v_count;
  END IF;

  RAISE NOTICE 'Template-Simplify OK: daily_task_digest/de updated';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
