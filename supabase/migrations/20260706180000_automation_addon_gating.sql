-- Automation-Addon (Marketplace Paid, 5,99 €/verbundenem Account) + Gating-Helper.
-- Addon-Row is_active=false bis der Stripe-Quantity-Price steht (Prod-Blocker, Sub-Schritt).
-- team_has_addon: service_role-Gating (Runner) — Team → Account → aktives Addon (Status + laufende Periode).
-- Idempotent.

BEGIN;

INSERT INTO public.addons (slug, name, short_description, category, type, price_monthly_cents, currency, activates_modules, is_active, sort_order)
VALUES ('automation', 'LinkedIn-Automatisierung',
        'Vernetzen, Nachrichten, Profilbesuche & Follows — serverseitig über Unipile, ohne Browser.',
        'linkedin', 'feature_unlock', 599, 'eur', '{}', false, 50)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  category = EXCLUDED.category,
  type = EXCLUDED.type,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  currency = EXCLUDED.currency;

CREATE OR REPLACE FUNCTION public.team_has_addon(p_team_id uuid, p_slug text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_addons aa
    JOIN public.addons a ON a.id = aa.addon_id
    JOIN public.teams  t ON t.account_id = aa.account_id
    WHERE t.id = p_team_id
      AND a.slug = p_slug
      AND aa.status = 'active'
      AND (aa.current_period_end IS NULL OR aa.current_period_end > now())
  );
$$;
GRANT EXECUTE ON FUNCTION public.team_has_addon(uuid, text) TO service_role, authenticated;

COMMIT;
