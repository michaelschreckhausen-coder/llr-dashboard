-- Grandfathering: bestehende Automatisierungs-Nutzer bekommen das 'automation'-Addon GRATIS.
-- Linie: Accounts mit >=1 nicht-gecancelter automation_campaign (linkedin_connections = Lead-CRM, NICHT Extension → RAUS).
-- is_grandfathered=true, status=active, KEIN Stripe-Sub → Quantity-Sync skippt sie (Quantity 0, kein Charge).
-- MANUELLES Script — KEIN nummerierter Migrations-Auto-Run (läuft sonst beim Prod-Apply ungefragt mit).
-- Pro Env: erst AUDIT (read-only) → Count/Freigabe → dann APPLY.

-- ============ AUDIT (read-only) ============
SELECT DISTINCT t.account_id
FROM public.teams t
JOIN public.team_members tm ON tm.team_id = t.id
WHERE t.account_id IS NOT NULL
  AND tm.user_id IN (SELECT user_id FROM public.automation_campaigns WHERE status IS DISTINCT FROM 'cancelled');

-- ============ APPLY (nach Freigabe) ============
BEGIN;
INSERT INTO public.account_addons (account_id, addon_id, status, is_grandfathered, activated_at)
SELECT DISTINCT t.account_id, a.id, 'active', true, now()
FROM public.teams t
JOIN public.team_members tm ON tm.team_id = t.id
CROSS JOIN (SELECT id FROM public.addons WHERE slug = 'automation') a
WHERE t.account_id IS NOT NULL
  AND tm.user_id IN (SELECT user_id FROM public.automation_campaigns WHERE status IS DISTINCT FROM 'cancelled')
  AND NOT EXISTS (SELECT 1 FROM public.account_addons aa WHERE aa.account_id = t.account_id AND aa.addon_id = a.id);
COMMIT;
