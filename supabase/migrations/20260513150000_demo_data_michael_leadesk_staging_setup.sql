-- =============================================================================
-- Demo-Daten-Seed für michael@leadesk.de (STAGING) — Teil 1: Setup
-- =============================================================================
-- Apply-Target: Staging-DB (Hetzner 178.104.210.216)
-- User:    185fa300-9e29-4ecb-a230-afbe1e876b59 (michael@leadesk.de)
-- Account: c5d85d50-d6eb-4aa4-b74a-c949650ed555 (Leadesk Staging)
-- Team:    f622df91-d68f-4ca5-bd95-5b458f0d5f29 (Leadesk Staging)
--
-- Parallel-Migration zur Prod-Variante 20260513120000_demo_data_info_leadesk_setup.sql
-- Bewusste Duplikation für Audit-Trail-Klarheit (welche Daten in welchem Env).
--
-- Volumige Daten folgen via scripts/seed-demo-data.mjs mit DEMO_USER_EMAIL-Env-Var.
-- =============================================================================

BEGIN;

-- (a) is_demo_data-Flags (IF NOT EXISTS — falls Phase-A-Migration auf Staging
-- noch nicht durch oder von Prod-Apply nachgezogen werden muss)
ALTER TABLE public.ai_usage_log   ADD COLUMN IF NOT EXISTS is_demo_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_login_log ADD COLUMN IF NOT EXISTS is_demo_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.content_posts  ADD COLUMN IF NOT EXISTS is_demo_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS is_demo_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ai_usage_log_demo_idx   ON public.ai_usage_log   (created_at DESC) WHERE is_demo_data = true;
CREATE INDEX IF NOT EXISTS user_login_log_demo_idx ON public.user_login_log (logged_in_at DESC) WHERE is_demo_data = true;

-- (b) user_preferences-UPSERT für Michael (sollte schon stehen, aber sicher-ist-sicher)
INSERT INTO public.user_preferences (user_id, active_team_id, updated_at)
VALUES ('185fa300-9e29-4ecb-a230-afbe1e876b59', 'f622df91-d68f-4ca5-bd95-5b458f0d5f29', now())
ON CONFLICT (user_id) DO UPDATE
  SET active_team_id = EXCLUDED.active_team_id,
      updated_at     = EXCLUDED.updated_at;

-- (c) Klein-Inserts — Idempotency-Guarded
DO $$
DECLARE
  v_team_id     uuid := 'f622df91-d68f-4ca5-bd95-5b458f0d5f29';
  v_user_id     uuid := '185fa300-9e29-4ecb-a230-afbe1e876b59';
  v_existing    integer;
  v_bv_active   uuid := gen_random_uuid();
  v_bv_inactive uuid := gen_random_uuid();
  v_project_ids uuid[];
  v_proj_id     uuid;
BEGIN
  SELECT count(*) INTO v_existing
  FROM public.brand_voices
  WHERE team_id = v_team_id AND name LIKE '[DEMO]%';
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'Demo-Daten existieren bereits (% brand_voices). Abort.', v_existing;
  END IF;

  -- ── 2 brand_voices ──
  INSERT INTO public.brand_voices (id, user_id, team_id, name, is_active, brand_name,
    personality, tone_attributes, formality, dos, donts, target_audience, ai_summary,
    voice_style, word_choice, created_at, updated_at)
  VALUES
  (v_bv_active, v_user_id, v_team_id,
   '[DEMO] Leadesk Brand Voice — B2B-Sales-Authority (Staging)',
   true, 'Leadesk',
   'Sachlich, kompetent, direkt — wir helfen B2B-Sales-Teams schneller zu skalieren ohne den Personal-Touch zu verlieren.',
   ARRAY['professionell','klar','vertrauensvoll','pragmatisch'],
   'sie',
   'Konkrete Zahlen statt Marketing-Phrasen; Use-Cases statt Buzzwords; LinkedIn als primärer Kanal nennen',
   'Keine Übertreibungen, kein "revolutionär", keine Buzzword-Stapelung; keine generischen Sales-Floskeln',
   'B2B-Sales-Leadership (Head of Sales, VP Sales, Geschäftsführung) bei DACH-Mid-Market',
   'Leadesk ist die LinkedIn-Suite für B2B-Sales-Teams die ihre Pipeline ohne Adfatigue füllen wollen. Brand-Voice ist sachlich-kompetent, deutsch-Sie-Form, Use-Case-getrieben.',
   'beratend-erklärend mit konkreten Beispielen', 'fachlich präzise, vermeidet Anglizismen wo deutsche Begriffe natürlich klingen',
   now() - interval '21 days', now() - interval '2 days'),
  (v_bv_inactive, v_user_id, v_team_id,
   '[DEMO] Casual Founder-Voice (entwurf, Staging)',
   false, 'Leadesk',
   'Lockerer, persönlicher Ton für Founder-zu-Founder-Outreach.',
   ARRAY['locker','persönlich','direkt'],
   'du',
   'Du-Form, eigene Erfahrung teilen, Frage am Ende', 'Keine Verkaufs-Pitches im Erstkontakt',
   'Founders & CEOs früher Stage', 'Entwurf einer alternativen Brand-Voice für Founder-Outreach.',
   'erzählend', 'umgangssprachlich', now() - interval '14 days', now() - interval '14 days');

  -- ── 5 target_audiences ──
  INSERT INTO public.target_audiences (user_id, team_id, name, is_active, job_titles, industries,
    company_size, decision_level, region, pain_points, needs_goals, outreach_tips, ai_summary,
    topics_interests, created_at, updated_at) VALUES
  (v_user_id, v_team_id, '[DEMO] Head of Sales — SaaS Mid-Market (Staging)', true,
   'Head of Sales, VP Sales, Sales Director', 'SaaS, FinTech, MarTech',
   '50-250 Mitarbeiter', 'C-1', 'DACH',
   'Pipeline-Volume schwankt unkalkulierbar; SDR-Capacity Bottleneck; LinkedIn-Outbound zeitintensiv',
   'Predictable Pipeline; SDR-Output verdoppeln; LinkedIn als skalierbaren Kanal',
   'Pipeline-Analyse-Daten mitbringen; konkrete Hebel statt Tool-Demos',
   'Persona für die Mehrheit unserer Best-Customer-Konstellation.',
   'Sales-Ops, Outbound-Automation, LinkedIn-Strategie',
   now() - interval '18 days', now() - interval '5 days'),
  (v_user_id, v_team_id, '[DEMO] Geschäftsführer — Mittelstand klassisch (Staging)', true,
   'Geschäftsführer, CEO, Inhaber', 'Industrie, Handel, Professional Services',
   '10-50 Mitarbeiter', 'C-Level', 'DACH',
   'Vertrieb über Kontakte; LinkedIn unterschätzt; keine systematische Lead-Pflege',
   'Vertriebs-Skalierung jenseits Inhaber-Netzwerk; LinkedIn als 2. Standbein',
   'Onboarding-Pfad zeigen; Hands-on-Demo; Geduld bei Tech-Skepsis',
   'Klassische Mittelständler die LinkedIn entdecken.',
   'LinkedIn-Outreach, Sales-Coaching, CRM-Basis',
   now() - interval '16 days', now() - interval '4 days'),
  (v_user_id, v_team_id, '[DEMO] CMO — Demand-Gen-Lead (Staging)', true,
   'CMO, Head of Marketing, VP Marketing', 'B2B-SaaS, Tech, Consulting',
   '100-500 Mitarbeiter', 'C-1 oder C-Level', 'DACH + EU',
   'MQLs nicht Sales-Ready; ABM zu manuell; LinkedIn-Ads zu teuer',
   'Bessere MQL→SQL-Conversion; ABM ohne Overhead; LinkedIn-Organic',
   'Funnel-Math vorbereiten; LinkedIn vs Ads-Argumentation',
   'Persona für ABM-/Content-Marketing-Use-Cases.',
   'ABM, Content-Marketing, MQL-Quality',
   now() - interval '12 days', now() - interval '3 days'),
  (v_user_id, v_team_id, '[DEMO] Founder — Solo-/Early-Stage (Staging)', false,
   'Founder, Co-Founder, CEO', 'Tech, SaaS',
   '1-10 Mitarbeiter', 'Founder direkt', 'DACH + EU',
   'Zeit-Mangel; Brand-Awareness null; keine Sales-Org',
   'Erste 50 Customer-Conversations; LinkedIn-Brand aufbauen',
   'Founder-zentriert; eigene Founder-Story',
   'Niedrigere Priorität.', 'Founder-Sales, LinkedIn-Brand',
   now() - interval '11 days', now() - interval '11 days'),
  (v_user_id, v_team_id, '[DEMO] Head of CS — Expansion-Plays (Staging)', true,
   'Head of Customer Success, VP CS, CCO', 'SaaS',
   '100-500 Mitarbeiter', 'C-1', 'DACH',
   'Up-Sell unterhalb Sales-Radar; LinkedIn-Beziehungen zu Champions ungepflegt',
   'CS-driven Expansion-Pipeline; LinkedIn als Beziehungs-Tool',
   'CS-spezifische Use-Cases', 'Sekundäre Persona.',
   'Expansion-Selling, Champion-Networking, NRR',
   now() - interval '9 days', now() - interval '7 days');

  -- ── 12 knowledge_base entries ──
  INSERT INTO public.knowledge_base (user_id, team_id, name, description, category,
    is_demo_data, created_at, updated_at) VALUES
  (v_user_id, v_team_id, '[DEMO] Leadesk Pitch-Deck (Q2 2026, Staging)', 'Master-Deck für Sales-Pitches.', 'Sales-Material', true, now() - interval '24 days', now() - interval '4 days'),
  (v_user_id, v_team_id, '[DEMO] Onboarding-Playbook (60-Tage)', 'Onboarding-Pfad für neue Customer.', 'Customer-Success', true, now() - interval '22 days', now() - interval '6 days'),
  (v_user_id, v_team_id, '[DEMO] Objection: "Wir nutzen schon HubSpot"', 'Top-Einwand bei HubSpot-Customers.', 'Sales-Material', true, now() - interval '20 days', now() - interval '2 days'),
  (v_user_id, v_team_id, '[DEMO] DSGVO-Whitepaper Leadesk', 'Whitepaper für Skeptiker.', 'Compliance', true, now() - interval '19 days', now() - interval '19 days'),
  (v_user_id, v_team_id, '[DEMO] LinkedIn-Outreach Best-Practices 2026', 'Connection-Rates, Templates, Timing.', 'Outreach', true, now() - interval '17 days', now() - interval '8 days'),
  (v_user_id, v_team_id, '[DEMO] Customer-Case-Studies (3 SaaS-Mid-Market)', 'Numbers + Quotes.', 'Sales-Material', true, now() - interval '15 days', now() - interval '5 days'),
  (v_user_id, v_team_id, '[DEMO] AI-Prompt-Library für Outreach', 'Beste Prompts für Erstkontakt + Follow-up.', 'Outreach', true, now() - interval '13 days', now() - interval '1 day'),
  (v_user_id, v_team_id, '[DEMO] Pricing-Calculator-Tabelle', 'Internal: Pricing-Vorschläge.', 'Sales-Material', true, now() - interval '11 days', now() - interval '11 days'),
  (v_user_id, v_team_id, '[DEMO] Webinar-Replay LinkedIn-Pipeline', 'Replay + Slide-Deck + Q&A.', 'Marketing', true, now() - interval '10 days', now() - interval '10 days'),
  (v_user_id, v_team_id, '[DEMO] Sales-Process-Doku (5 Stages)', 'Lead → LQL → MQL → MQN → SQL.', 'Process', true, now() - interval '8 days', now() - interval '3 days'),
  (v_user_id, v_team_id, '[DEMO] ICP-Definition 2026', 'Refined ICP basierend auf Closed-Won-Analysen.', 'Strategy', true, now() - interval '6 days', now() - interval '6 days'),
  (v_user_id, v_team_id, '[DEMO] Roadmap-Briefing Q2/Q3', 'Customer-Roadmap.', 'Product', true, now() - interval '4 days', now() - interval '4 days');

  -- ── 6 pm_projects + Kanban-Columns ──
  v_project_ids := ARRAY[
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
  ];

  -- pm_projects auf Staging hat team_id NOT NULL (Schema-Drift gegenüber Prod).
  INSERT INTO public.pm_projects (id, user_id, team_id, name, description, color, created_at, updated_at) VALUES
  (v_project_ids[1], v_user_id, v_team_id, '[DEMO] Q2-Pipeline-Push (Staging)',           'Fokus-Sprint: Top-10-Accounts.', '#3B82F6', now() - interval '28 days', now() - interval '1 day'),
  (v_project_ids[2], v_user_id, v_team_id, '[DEMO] Website-Relaunch (Staging)',           'Marketing-Site mit Stories + Pricing.', '#8B5CF6', now() - interval '25 days', now() - interval '3 days'),
  (v_project_ids[3], v_user_id, v_team_id, '[DEMO] LinkedIn-Content-Q2 (Staging)',        'Content-Kalender Q2.', '#10B981', now() - interval '22 days', now() - interval '2 days'),
  (v_project_ids[4], v_user_id, v_team_id, '[DEMO] Customer-Onboarding-Sprint (Staging)', 'Onboarding für 3 neue Customer.', '#F59E0B', now() - interval '18 days', now() - interval '4 days'),
  (v_project_ids[5], v_user_id, v_team_id, '[DEMO] Q1-Retro & Q2-Planning (Staging)',     'Retro + Q2-Ziele.', '#6B7280', now() - interval '40 days', now() - interval '30 days'),
  (v_project_ids[6], v_user_id, v_team_id, '[DEMO] Webinar-Series H1 (Staging)',          'Monatliche Webinar-Reihe.', '#EC4899', now() - interval '14 days', now() - interval '5 days');

  -- pm_columns auf Staging hat team_id NOT NULL (gleicher Drift).
  FOREACH v_proj_id IN ARRAY v_project_ids LOOP
    INSERT INTO public.pm_columns (project_id, user_id, team_id, name, position, color, created_at) VALUES
    (v_proj_id, v_user_id, v_team_id, 'To Do',       0, '#94A3B8', now() - interval '28 days'),
    (v_proj_id, v_user_id, v_team_id, 'In Progress', 1, '#3B82F6', now() - interval '28 days'),
    (v_proj_id, v_user_id, v_team_id, 'Review',      2, '#F59E0B', now() - interval '28 days'),
    (v_proj_id, v_user_id, v_team_id, 'Done',        3, '#10B981', now() - interval '28 days');
  END LOOP;

  RAISE NOTICE 'michael@leadesk.de Staging-Demo-Setup durch: 2 brand_voices, 5 target_audiences, 12 knowledge_base, 6 pm_projects (mit 24 pm_columns).';
END $$;

COMMIT;

SELECT 'brand_voices' AS tbl, count(*) FROM public.brand_voices WHERE team_id='f622df91-d68f-4ca5-bd95-5b458f0d5f29' AND name LIKE '[DEMO]%'
UNION ALL SELECT 'target_audiences', count(*) FROM public.target_audiences WHERE team_id='f622df91-d68f-4ca5-bd95-5b458f0d5f29' AND name LIKE '[DEMO]%'
UNION ALL SELECT 'knowledge_base', count(*) FROM public.knowledge_base WHERE team_id='f622df91-d68f-4ca5-bd95-5b458f0d5f29' AND is_demo_data=true
UNION ALL SELECT 'pm_projects', count(*) FROM public.pm_projects WHERE user_id='185fa300-9e29-4ecb-a230-afbe1e876b59' AND name LIKE '[DEMO]%'
UNION ALL SELECT 'pm_columns', count(*) FROM public.pm_columns WHERE user_id='185fa300-9e29-4ecb-a230-afbe1e876b59' AND project_id IN (SELECT id FROM public.pm_projects WHERE user_id='185fa300-9e29-4ecb-a230-afbe1e876b59' AND name LIKE '[DEMO]%');
