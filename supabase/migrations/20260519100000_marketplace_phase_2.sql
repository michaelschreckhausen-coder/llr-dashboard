-- 20260519100000_marketplace_phase_2.sql
--
-- Marketplace Phase 2 — Stripe-Anbindung für Add-on-Subscriptions.
--
-- Drei Stücke:
--   1. account_addons.is_grandfathered boolean (Variante II, orthogonal zum status)
--   2. RPC upsert_account_addon_from_stripe — vom Webhook (service_role) gerufen
--   3. Grandfathering-Backfill für bestehende sevDesk-Verbindungen
--
-- Status-Wertebereich bleibt unverändert (active/past_due/canceled/paused/pending) —
-- grandfathered ist semantisch ein "active mit besonderer Herkunft".
--
-- Workflow:
--   1. Auf Hetzner-Staging applien:
--        ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres' \
--          < supabase/migrations/20260519100000_marketplace_phase_2.sql
--   2. NOTIFY pgrst, 'reload schema'
--   3. Smoke:
--        SELECT count(*) FROM account_addons WHERE is_grandfathered = true;
--   4. Erst nach Bestätigung: gleicher Apply auf Prod (128.140.123.163).

BEGIN;

-- ─── 1) Grandfathering-Marker ─────────────────────────────────────────────
ALTER TABLE public.account_addons
  ADD COLUMN IF NOT EXISTS is_grandfathered boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_account_addons_grandfathered
  ON public.account_addons (addon_id)
  WHERE is_grandfathered = true;

-- ─── 2) RPC: upsert_account_addon_from_stripe ─────────────────────────────
-- Wird vom stripe-addon-webhook via service_role-Client gerufen.
-- Idempotent: erst-Insert oder Status-Update bei wiederholten Events.
--
-- Auth-Check entfällt — service_role bypasst RLS und ruft das aus dem
-- Webhook-Container. Die Signatur-Verifikation passiert im Webhook-Code,
-- nicht hier.

CREATE OR REPLACE FUNCTION public.upsert_account_addon_from_stripe(
  p_account_id                 uuid,
  p_addon_id                   uuid,
  p_status                     text,
  p_stripe_subscription_id     text,
  p_stripe_subscription_item_id text,
  p_current_period_end         timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.account_addons (
    account_id, addon_id, status,
    stripe_subscription_id, stripe_subscription_item_id,
    current_period_end, activated_at,
    canceled_at, is_grandfathered
  )
  VALUES (
    p_account_id, p_addon_id, p_status,
    p_stripe_subscription_id, p_stripe_subscription_item_id,
    p_current_period_end, now(),
    CASE WHEN p_status = 'canceled' THEN now() ELSE NULL END,
    false
  )
  ON CONFLICT (account_id, addon_id) DO UPDATE
    SET status                       = EXCLUDED.status,
        stripe_subscription_id       = COALESCE(EXCLUDED.stripe_subscription_id, public.account_addons.stripe_subscription_id),
        stripe_subscription_item_id  = COALESCE(EXCLUDED.stripe_subscription_item_id, public.account_addons.stripe_subscription_item_id),
        current_period_end           = EXCLUDED.current_period_end,
        canceled_at                  = CASE WHEN EXCLUDED.status = 'canceled' THEN now() ELSE public.account_addons.canceled_at END,
        updated_at                   = now(),
        -- Wenn Grandfathered-User Stripe abonniert: Marker fällt weg.
        is_grandfathered             = false
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_account_addon_from_stripe(uuid, uuid, text, text, text, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.upsert_account_addon_from_stripe(uuid, uuid, text, text, text, timestamptz) TO service_role;

-- ─── 3) Grandfathering-Backfill: sevDesk ──────────────────────────────────
-- Alle integrations-Rows mit provider='sevdesk' und is_active=true bekommen
-- einen account_addons-Eintrag mit status='active', is_grandfathered=true.
-- stripe_subscription_id bleibt NULL → keine Stripe-Logik berührt sie.
--
-- Account-Lookup via teams.account_id-Brücke:
--   - integrations.team_id → teams.account_id (primärer Pfad)
--   - Falls integrations.team_id NULL: via user_id → team_members → team → account
-- Edge-Cases mit NULL-account_id werden geskippt (keine Backfill-Row),
-- müssen manuell nachjustiert werden.

WITH sevdesk_addon AS (
  SELECT id FROM public.addons WHERE slug = 'sevdesk-integration' LIMIT 1
),
sevdesk_accounts AS (
  -- Primärer Pfad: über integrations.team_id
  SELECT DISTINCT t.account_id, MIN(i.created_at) AS first_seen
  FROM public.integrations i
  JOIN public.teams t ON t.id = i.team_id
  WHERE i.provider = 'sevdesk'
    AND i.is_active = true
    AND t.account_id IS NOT NULL
  GROUP BY t.account_id

  UNION

  -- Fallback: integrations.team_id NULL → über user_id → erstes Team
  SELECT DISTINCT t.account_id, MIN(i.created_at) AS first_seen
  FROM public.integrations i
  JOIN public.team_members tm ON tm.user_id = i.user_id
  JOIN public.teams t ON t.id = tm.team_id
  WHERE i.provider = 'sevdesk'
    AND i.is_active = true
    AND i.team_id IS NULL
    AND t.account_id IS NOT NULL
  GROUP BY t.account_id
)
INSERT INTO public.account_addons (account_id, addon_id, status, is_grandfathered, activated_at)
SELECT sa.account_id, sd.id, 'active', true, sa.first_seen
FROM sevdesk_accounts sa
CROSS JOIN sevdesk_addon sd
ON CONFLICT (account_id, addon_id) DO NOTHING;

COMMIT;
