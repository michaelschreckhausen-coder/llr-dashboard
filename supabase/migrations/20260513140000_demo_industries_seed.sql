-- =============================================================================
-- Industries-Reference-Data — Seed für Prod
-- =============================================================================
-- public.industries war auf Prod leer (0 rows). organizations.industry_slug
-- hat FK auf industries(slug), daher braucht jeder Insert mit industry_slug
-- eine korrespondierende industries-Row.
--
-- Diese 10 Slugs decken die häufigsten DACH-B2B-Industrien ab und werden vom
-- Demo-Seed-Script (scripts/seed-demo-data.mjs INDUSTRIES-Array) referenziert.
-- Idempotent via ON CONFLICT DO NOTHING.
-- =============================================================================

INSERT INTO public.industries (slug, label_de, label_en, sort_order) VALUES
  ('saas',             'SaaS',                  'SaaS',                  10),
  ('industrie',        'Industrie',             'Industrial',            20),
  ('consulting',       'Consulting',            'Consulting',            30),
  ('fintech',          'FinTech',               'FinTech',               40),
  ('martech',          'MarTech',               'MarTech',               50),
  ('logistik',         'Logistik',              'Logistics',             60),
  ('engineering',      'Engineering',           'Engineering',           70),
  ('medtech',          'MedTech',               'MedTech',               80),
  ('cloud-services',   'Cloud-Services',        'Cloud Services',        90),
  ('b2b-marketplace',  'B2B-Marketplace',       'B2B Marketplace',      100)
ON CONFLICT (slug) DO NOTHING;
