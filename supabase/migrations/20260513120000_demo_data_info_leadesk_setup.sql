-- =============================================================================
-- Demo-Daten-Seed für info@leadesk.de — Teil 1: Setup + Klein-Inserts
-- =============================================================================
-- Apply-Target: Prod-DB (Hetzner 128.140.123.163)
-- Account: 692eab89-baa8-4cc9-9315-f068b8797609 (Vorstellung Leadesk)
-- Team:    ada0b02b-fb10-4967-b55f-44eeb0c2b663 (Vorstellung Leadesk)
-- User:    2b6b5a17-c6c9-47af-bc57-83825286c0d2 (info@leadesk.de)
--
-- Diese Migration deckt:
--   (a) ALTER TABLEs für is_demo_data-Flag (4 Tabellen ohne notes/description)
--   (b) UPSERT user_preferences (active_team_id) für Demo-User
--   (c) Klein-Inserts: 2 brand_voices, 5 target_audiences, 12 knowledge_base
--   (d) pm_projects + pm_columns-Skeleton (6 Projekte mit Kanban-Boards)
--
-- Volumige Daten (orgs, leads, deals, tasks, content_posts, pm_tasks,
-- ai_usage_log, user_login_log) folgen via scripts/seed-demo-data.mjs.
--
-- Idempotency: jeder Block hat Pre-Check + RAISE NOTICE bei Existenz.
-- Transactional: BEGIN/COMMIT um alle Schreiboperationen.
-- =============================================================================

BEGIN;

-- =============================================================================
-- (a) ALTER TABLEs — is_demo_data-Flag für Tabellen ohne text-Marker-Feld
-- =============================================================================

ALTER TABLE public.ai_usage_log   ADD COLUMN IF NOT EXISTS is_demo_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_login_log ADD COLUMN IF NOT EXISTS is_demo_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.content_posts  ADD COLUMN IF NOT EXISTS is_demo_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS is_demo_data boolean NOT NULL DEFAULT false;

-- Partial index für effizienten Filter im Dashboard (nur Demo-Rows)
CREATE INDEX IF NOT EXISTS ai_usage_log_demo_idx   ON public.ai_usage_log   (created_at DESC) WHERE is_demo_data = true;
CREATE INDEX IF NOT EXISTS user_login_log_demo_idx ON public.user_login_log (logged_in_at DESC) WHERE is_demo_data = true;

-- =============================================================================
-- (b) UPSERT user_preferences für Demo-User
-- =============================================================================
-- Damit der Login-Trigger account_id korrekt snapshotted, plus Frontend-Team-
-- Context korrekt ist. user_id ist UNIQUE in user_preferences.

INSERT INTO public.user_preferences (user_id, active_team_id, updated_at)
VALUES ('2b6b5a17-c6c9-47af-bc57-83825286c0d2', 'ada0b02b-fb10-4967-b55f-44eeb0c2b663', now())
ON CONFLICT (user_id) DO UPDATE
  SET active_team_id = EXCLUDED.active_team_id,
      updated_at     = EXCLUDED.updated_at;

-- =============================================================================
-- (c) Idempotency-Guard + Klein-Inserts
-- =============================================================================

DO $$
DECLARE
  v_team_id     uuid := 'ada0b02b-fb10-4967-b55f-44eeb0c2b663';
  v_user_id     uuid := '2b6b5a17-c6c9-47af-bc57-83825286c0d2';
  v_existing    integer;
  v_bv_active   uuid := gen_random_uuid();
  v_bv_inactive uuid := gen_random_uuid();
  v_project_ids uuid[];
  v_proj_id     uuid;
BEGIN
  -- Idempotency: bestehende Demo-Daten?
  SELECT count(*) INTO v_existing
  FROM public.brand_voices
  WHERE team_id = v_team_id AND name LIKE '[DEMO]%';
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'Demo-Daten existieren bereits (% brand_voices). Abort.', v_existing;
  END IF;

  -- ── 2 brand_voices (1 aktiv, 1 inaktiv) ──────────────────────────────────
  INSERT INTO public.brand_voices (id, user_id, team_id, name, is_active, brand_name,
    personality, tone_attributes, formality, dos, donts, target_audience, ai_summary,
    voice_style, word_choice, created_at, updated_at)
  VALUES
  (v_bv_active, v_user_id, v_team_id,
   '[DEMO] Leadesk Brand Voice — B2B-Sales-Authority',
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
   '[DEMO] Casual Founder-Voice (entwurf)',
   false, 'Leadesk',
   'Lockerer, persönlicher Ton für Founder-zu-Founder-Outreach.',
   ARRAY['locker','persönlich','direkt'],
   'du',
   'Du-Form, eigene Erfahrung teilen, Frage am Ende', 'Keine Verkaufs-Pitches im Erstkontakt',
   'Founders & CEOs früher Stage', 'Entwurf einer alternativen Brand-Voice für Founder-Outreach. Noch nicht final.',
   'erzählend', 'umgangssprachlich', now() - interval '14 days', now() - interval '14 days');

  -- ── 5 target_audiences ───────────────────────────────────────────────────
  INSERT INTO public.target_audiences (user_id, team_id, name, is_active, job_titles, industries,
    company_size, decision_level, region, pain_points, needs_goals, outreach_tips, ai_summary,
    topics_interests, created_at, updated_at)
  VALUES
  (v_user_id, v_team_id, '[DEMO] Head of Sales — SaaS Mid-Market', true,
   'Head of Sales, VP Sales, Sales Director',
   'SaaS, FinTech, MarTech',
   '50-250 Mitarbeiter', 'C-1 (direkter Report an C-Level)', 'DACH',
   'Pipeline-Volume schwankt unkalkulierbar; SDR-Capacity ist Bottleneck; LinkedIn-Outbound zeitintensiv ohne Tooling',
   'Predictable Pipeline; SDR-Output verdoppeln ohne Headcount; LinkedIn als skalierbaren Kanal etablieren',
   'Reichlich Daten aus eigener Pipeline-Analyse mitbringen; konkrete Hebel statt Tool-Demos; klare Cost-per-Lead-Argumentation',
   'Persona für die Mehrheit unserer Best-Customer-Konstellation. Klassischer SaaS-Mid-Market.',
   'Sales-Ops, Outbound-Automation, LinkedIn-Strategie',
   now() - interval '18 days', now() - interval '5 days'),
  (v_user_id, v_team_id, '[DEMO] Geschäftsführer — Mittelstand klassisch', true,
   'Geschäftsführer, CEO, Inhaber',
   'Industrie, Handel, Professional Services',
   '10-50 Mitarbeiter', 'C-Level', 'DACH',
   'Vertrieb läuft "über Kontakte", LinkedIn unterschätzt; keine systematische Lead-Pflege; abhängig von 1-2 Top-Verkäufern',
   'Vertriebs-Skalierung jenseits des Inhaber-Netzwerks; LinkedIn als 2. Standbein; CRM-Disziplin',
   'Mit konkretem Onboarding-Pfad arbeiten; Hands-on-Demo schlägt Feature-Liste; Geduld bei Tech-Skepsis',
   'Klassische Mittelständler die LinkedIn entdecken. Kürzere Onboarding-Phase nötig.',
   'LinkedIn-Outreach, Sales-Coaching, CRM-Basis',
   now() - interval '16 days', now() - interval '4 days'),
  (v_user_id, v_team_id, '[DEMO] CMO — Demand-Gen-Lead', true,
   'CMO, Head of Marketing, VP Marketing, Demand-Gen-Manager',
   'B2B-SaaS, Tech, Consulting',
   '100-500 Mitarbeiter', 'C-1 oder C-Level', 'DACH + EU',
   'Marketing-Qualified-Leads sind oft nicht Sales-Ready; Account-Based-Marketing zu manuell; LinkedIn-Ads zu teuer',
   'Bessere MQL→SQL-Conversion; ABM ohne Stellschraube-Overhead; LinkedIn-Organic als Brand-Channel',
   'Funnel-Math vorbereiten; LinkedIn vs Ads-Argumentation parat haben; Content-Repurposing-Ideen mitbringen',
   'Persona für die ABM-/Content-Marketing-Use-Cases unseres Tools.',
   'ABM, Content-Marketing, MQL-Quality',
   now() - interval '12 days', now() - interval '3 days'),
  (v_user_id, v_team_id, '[DEMO] Founder — Solo-/Early-Stage', false,
   'Founder, Co-Founder, CEO (Early Stage)',
   'Tech, SaaS',
   '1-10 Mitarbeiter', 'Founder direkt', 'DACH + EU',
   'Zeit-Mangel für Outreach; Brand-Awareness null; keine Sales-Org',
   'Erste 50 Customer-Conversations; LinkedIn-Brand aufbauen; ohne Sales-Hire skalieren',
   'Sehr Founder-zentriert; eigene Founder-Story als Hook; klein anfangen mit messbarer Wirkung',
   'Niedrigere Priorität — kommen meist über Friend-Referrals, weniger Cold-Outreach-bereit.',
   'Founder-Sales, LinkedIn-Brand, Lean-Outreach',
   now() - interval '11 days', now() - interval '11 days'),
  (v_user_id, v_team_id, '[DEMO] Head of Customer Success — Expansion-Plays', true,
   'Head of Customer Success, VP CS, CCO',
   'SaaS',
   '100-500 Mitarbeiter', 'C-1', 'DACH',
   'Up-Sell-/Cross-Sell unterhalb Sales-Radar; LinkedIn-Beziehungen zu Champions ungepflegt',
   'CS-driven Expansion-Pipeline; LinkedIn als Beziehungs-Tool für Champions',
   'CS-spezifische Use-Cases zeigen (nicht klassischen Outbound); Expansion-Metriken referenzieren',
   'Sekundäre Persona — relevant für unsere Customer-Success-Outbound-Features.',
   'Expansion-Selling, Champion-Networking, NRR',
   now() - interval '9 days', now() - interval '7 days');

  -- ── 12 knowledge_base entries ────────────────────────────────────────────
  INSERT INTO public.knowledge_base (user_id, team_id, name, description, content, category,
    is_demo_data, created_at, updated_at)
  VALUES
  (v_user_id, v_team_id, '[DEMO] Leadesk Pitch-Deck (Q2 2026)',
   'Aktuelles Master-Deck für Sales-Pitches.',
   'Leadesk ist die LinkedIn-Suite für B2B-Sales-Teams: Kontakte → Vernetzungen → Nachrichten → Pipeline. Kern-USPs: 1) Native CRM, 2) AI-gestützte Outreach-Generierung, 3) Eingebaute Compliance-Layer für DSGVO.',
   'Sales-Material', true, now() - interval '24 days', now() - interval '4 days'),
  (v_user_id, v_team_id, '[DEMO] Onboarding-Playbook (60-Tage-Plan)',
   'Strukturierter Onboarding-Pfad für neue Customer.', NULL,
   'Customer-Success', true, now() - interval '22 days', now() - interval '6 days'),
  (v_user_id, v_team_id, '[DEMO] Objection-Handling: "Wir nutzen schon HubSpot"',
   'Top-Einwand bei HubSpot-Customers — Argumentations-Leitfaden.', NULL,
   'Sales-Material', true, now() - interval '20 days', now() - interval '2 days'),
  (v_user_id, v_team_id, '[DEMO] DSGVO-Whitepaper Leadesk',
   'Wie Leadesk DSGVO-konform arbeitet — Whitepaper für Skeptiker.', NULL,
   'Compliance', true, now() - interval '19 days', now() - interval '19 days'),
  (v_user_id, v_team_id, '[DEMO] LinkedIn-Outreach Best-Practices 2026',
   'Aktuelle Best-Practices zu Connection-Rates, Message-Templates, Timing.', NULL,
   'Outreach', true, now() - interval '17 days', now() - interval '8 days'),
  (v_user_id, v_team_id, '[DEMO] Customer-Case-Studies (3 SaaS-Mid-Market)',
   'Bauer & Schmidt Logistik, Weber B2B Consulting, Krause FinTech — Numbers + Quotes.', NULL,
   'Sales-Material', true, now() - interval '15 days', now() - interval '5 days'),
  (v_user_id, v_team_id, '[DEMO] AI-Prompt-Library für Outreach',
   'Bibliothek der besten Prompts für Erstkontakt, Follow-up, Re-Engagement.', NULL,
   'Outreach', true, now() - interval '13 days', now() - interval '1 day'),
  (v_user_id, v_team_id, '[DEMO] Pricing-Calculator-Tabelle',
   'Internal: wie wir Pricing-Vorschläge je nach Account-Größe kalibrieren.', NULL,
   'Sales-Material', true, now() - interval '11 days', now() - interval '11 days'),
  (v_user_id, v_team_id, '[DEMO] Webinar-Replay: "LinkedIn-Pipeline in 90 Tagen"',
   'Replay-Link + Slide-Deck + Q&A-Doku.', NULL,
   'Marketing', true, now() - interval '10 days', now() - interval '10 days'),
  (v_user_id, v_team_id, '[DEMO] Sales-Process-Doku (5 Stages)',
   'Wie wir intern Deals durch die Pipeline schieben: Lead → LQL → MQL → MQN → SQL.', NULL,
   'Process', true, now() - interval '8 days', now() - interval '3 days'),
  (v_user_id, v_team_id, '[DEMO] ICP-Definition 2026',
   'Refined Ideal Customer Profile basierend auf 50 Closed-Won-Analysen.', NULL,
   'Strategy', true, now() - interval '6 days', now() - interval '6 days'),
  (v_user_id, v_team_id, '[DEMO] Roadmap-Briefing für Customers (Q2/Q3)',
   'Was Customers von uns in den nächsten Quartalen erwarten können.', NULL,
   'Product', true, now() - interval '4 days', now() - interval '4 days');

  -- ── 6 pm_projects + Kanban-Columns pro Projekt ───────────────────────────
  -- pm_projects ist user-scoped (kein team_id), pm_columns ist project+user-scoped.

  v_project_ids := ARRAY[
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
  ];

  INSERT INTO public.pm_projects (id, user_id, name, description, color, created_at, updated_at)
  VALUES
  (v_project_ids[1], v_user_id, '[DEMO] Q2-Pipeline-Push',
   'Fokus-Sprint: Top-10-Accounts in 6 Wochen durch die Pipeline.',
   '#3B82F6', now() - interval '28 days', now() - interval '1 day'),
  (v_project_ids[2], v_user_id, '[DEMO] Website-Relaunch',
   'Neues Marketing-Site mit Customer-Stories + Pricing-Page.',
   '#8B5CF6', now() - interval '25 days', now() - interval '3 days'),
  (v_project_ids[3], v_user_id, '[DEMO] LinkedIn-Content-Q2',
   'Content-Kalender + Repurposing-Workflow für Q2.',
   '#10B981', now() - interval '22 days', now() - interval '2 days'),
  (v_project_ids[4], v_user_id, '[DEMO] Customer-Onboarding-Sprint',
   'Onboarding-Optimierung für 3 neue Customer (Bauer, Weber, Krause).',
   '#F59E0B', now() - interval '18 days', now() - interval '4 days'),
  (v_project_ids[5], v_user_id, '[DEMO] Q1-Retro & Q2-Planning',
   'Retrospektive abgeschlossen, Q2-Ziele formuliert.',
   '#6B7280', now() - interval '40 days', now() - interval '30 days'),
  (v_project_ids[6], v_user_id, '[DEMO] Webinar-Series H1',
   'Monatliche Webinar-Reihe (LinkedIn-Pipeline, Brand-Voice, etc.).',
   '#EC4899', now() - interval '14 days', now() - interval '5 days');

  -- Kanban-Spalten pro Projekt: To Do / In Progress / Review / Done
  FOREACH v_proj_id IN ARRAY v_project_ids LOOP
    INSERT INTO public.pm_columns (project_id, user_id, name, position, color, created_at) VALUES
    (v_proj_id, v_user_id, 'To Do',       0, '#94A3B8', now() - interval '28 days'),
    (v_proj_id, v_user_id, 'In Progress', 1, '#3B82F6', now() - interval '28 days'),
    (v_proj_id, v_user_id, 'Review',      2, '#F59E0B', now() - interval '28 days'),
    (v_proj_id, v_user_id, 'Done',        3, '#10B981', now() - interval '28 days');
  END LOOP;

  RAISE NOTICE 'Demo-Setup-Migration durchgelaufen: 2 brand_voices, 5 target_audiences, 12 knowledge_base, 6 pm_projects (mit 24 pm_columns).';
END $$;

COMMIT;

-- =============================================================================
-- Sanity-Check Counts (READ-ONLY, läuft nach COMMIT)
-- =============================================================================

SELECT 'brand_voices'     AS tbl, count(*) FROM public.brand_voices
  WHERE team_id='ada0b02b-fb10-4967-b55f-44eeb0c2b663' AND name LIKE '[DEMO]%'
UNION ALL SELECT 'target_audiences', count(*) FROM public.target_audiences
  WHERE team_id='ada0b02b-fb10-4967-b55f-44eeb0c2b663' AND name LIKE '[DEMO]%'
UNION ALL SELECT 'knowledge_base',   count(*) FROM public.knowledge_base
  WHERE team_id='ada0b02b-fb10-4967-b55f-44eeb0c2b663' AND is_demo_data = true
UNION ALL SELECT 'pm_projects',      count(*) FROM public.pm_projects
  WHERE user_id='2b6b5a17-c6c9-47af-bc57-83825286c0d2' AND name LIKE '[DEMO]%'
UNION ALL SELECT 'pm_columns',       count(*) FROM public.pm_columns
  WHERE user_id='2b6b5a17-c6c9-47af-bc57-83825286c0d2'
    AND project_id IN (SELECT id FROM public.pm_projects WHERE user_id='2b6b5a17-c6c9-47af-bc57-83825286c0d2' AND name LIKE '[DEMO]%')
UNION ALL SELECT 'user_preferences', count(*) FROM public.user_preferences
  WHERE user_id='2b6b5a17-c6c9-47af-bc57-83825286c0d2' AND active_team_id='ada0b02b-fb10-4967-b55f-44eeb0c2b663';
