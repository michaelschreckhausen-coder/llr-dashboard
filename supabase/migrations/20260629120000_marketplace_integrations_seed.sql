-- 20260629120000_marketplace_integrations_seed.sql
-- Marketplace-Katalog-Pflege (2026-06-19):
--   1. ai-boost ausblenden (Soft-Delete, kein DROP — Audit-Trail + account_addons bleiben)
--   2. 4 Coming-Soon-Integrationen (HubSpot/Salesforce/Dynamics365/Asana) als Waitlist-
--      Cards (kein activates_modules + kein stripe_price_id → Frontend rendert "Auf
--      Warteliste"; Preis sichtbar). Pattern wie slack/sevdesk.
-- ⚠ addons nutzt price_monthly_cents (Cent-Integer), NICHT price_eur. icon = PascalCase
--   Lucide-Slug (wie slack 'MessageSquare'). Idempotent (ON CONFLICT DO UPDATE).
-- Repo-Record der bereits auf Staging+Prod applied Katalog-Änderung (Repo-Parität).

BEGIN;

UPDATE public.addons SET is_active = false WHERE slug = 'ai-boost';

INSERT INTO public.addons (
  slug, name, short_description, long_description,
  type, category, price_monthly_cents, currency,
  icon, highlight_color, features, activates_modules,
  is_active, sort_order
) VALUES
  ('hubspot-integration', 'HubSpot Integration',
   'Synchronisiere Kontakte, Deals und Aktivitäten mit HubSpot',
   'Bidirektionaler Sync zwischen Leadesk-CRM und HubSpot. Deals, Kontakte und Aktivitäten landen automatisch in beiden Systemen. OAuth-Login.',
   'integration', 'integration', 1900, 'EUR',
   'Network', '#FF7A59',
   '["Bidirektionaler Kontakt-Sync","Deal-Status-Sync","Aktivitäts-Logging","OAuth-Login mit deinem HubSpot-Account"]'::jsonb,
   ARRAY[]::text[], true, 110),

  ('salesforce-integration', 'Salesforce Integration',
   'CRM-Sync mit Salesforce für Enterprise-Workflows',
   'Vollständige bidirektionale Synchronisation von Accounts, Contacts, Opportunities und Activities zwischen Leadesk und Salesforce. SAML-SSO unterstützt.',
   'integration', 'integration', 2900, 'EUR',
   'Cloud', '#00A1E0',
   '["Account + Contact + Opportunity Sync","Activity-Logging","SAML-SSO","Custom-Field-Mapping"]'::jsonb,
   ARRAY[]::text[], true, 111),

  ('dynamics365-integration', 'Dynamics 365 Integration',
   'Microsoft Dynamics 365 Sales-Sync',
   'Bidirektionale Synchronisation von Leads, Accounts und Opportunities mit Microsoft Dynamics 365 Sales. Azure-AD-Login + Power-Automate-kompatibel.',
   'integration', 'integration', 2900, 'EUR',
   'Building2', '#002050',
   '["Lead/Account/Opportunity-Sync","Azure-AD-Login","Power-Automate-Trigger","Custom-Entity-Mapping"]'::jsonb,
   ARRAY[]::text[], true, 112),

  ('asana-integration', 'Asana Integration',
   'Erstelle Asana-Tasks aus Leads, Deals und Notes',
   'Automatisierte Task-Erstellung in Asana basierend auf CRM-Triggern (neuer Lead, Deal-Stage-Wechsel, Follow-up-Termin). Bidirektionaler Status-Sync.',
   'integration', 'integration', 900, 'EUR',
   'CheckSquare', '#F06A6A',
   '["Auto-Task-Erstellung bei CRM-Events","Bidirektionaler Status-Sync","Project-Mapping pro Pipeline","OAuth-Login"]'::jsonb,
   ARRAY[]::text[], true, 113)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  long_description = EXCLUDED.long_description,
  type = EXCLUDED.type,
  category = EXCLUDED.category,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  icon = EXCLUDED.icon,
  highlight_color = EXCLUDED.highlight_color,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

COMMIT;

NOTIFY pgrst, 'reload schema';
