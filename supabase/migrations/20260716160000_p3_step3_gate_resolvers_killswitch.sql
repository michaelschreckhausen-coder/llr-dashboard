-- ============================================================================
-- P3 · Schritt 3a — Kill-Switch + team_has_permission + Kill-Switch in Resolver
-- ============================================================================
-- REVIEW-Artefakt. NICHT anwenden, bis die EF-Guard-Diffs einzeln abgenommen sind.
-- Die Resolver bleiben verhaltensneutral bis eine EF sie liest (Schritt 3b/Deploy).
--
-- Enthält: gate_config (Kill-Switch, RLS-abgeriegelt), gate_open() (eine Wahrheit
-- für den Switch), team_has_permission (cron-facing, team-keyed), und den Kill-
-- Switch-Check in alle drei Resolver (i_have_permission / account_has_permission /
-- team_has_permission) -> Parität in jedem Schalterzustand.
-- ============================================================================

BEGIN;

-- ---------- Kill-Switch-Tabelle (Single-Row) ----------
CREATE TABLE IF NOT EXISTS public.gate_config (
  id             boolean PRIMARY KEY DEFAULT true CHECK (id),   -- genau 1 Zeile
  gates_enforced boolean NOT NULL DEFAULT true,                 -- fail-closed Default
  bypass_keys    text[]  NOT NULL DEFAULT '{}'::text[],         -- chirurgisch: Keys immer offen
  updated_at     timestamptz DEFAULT now(),
  updated_by     uuid
);
INSERT INTO public.gate_config(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- RLS: Kunde kann die Zeile NIE lesen/aendern; Resolver lesen sie als SECURITY DEFINER
ALTER TABLE public.gate_config ENABLE ROW LEVEL SECURITY;          -- default-deny, keine authenticated-Policy
REVOKE ALL ON public.gate_config FROM authenticated, anon;
GRANT SELECT, UPDATE ON public.gate_config TO service_role;

-- ---------- gate_open(): eine Wahrheit für den Switch ----------
CREATE OR REPLACE FUNCTION public.gate_open(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
  SELECT NOT COALESCE((SELECT gates_enforced FROM public.gate_config WHERE id), true)   -- Master aus?
      OR p_key = ANY (COALESCE((SELECT bypass_keys FROM public.gate_config WHERE id), '{}'::text[]));
$fn$;

-- ---------- team_has_permission(): cron-facing, team-keyed (NEU) ----------
-- Ergonomie: jede EF-Tabelle trägt team_id (nicht account_id) -> Join hier zentral.
CREATE OR REPLACE FUNCTION public.team_has_permission(p_team_id uuid, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
  SELECT public.gate_open(p_key) OR EXISTS (
    SELECT 1
    FROM public.teams t
    JOIN public.accounts a ON a.id = t.account_id
    JOIN public.plans    p ON p.id = a.plan_id
    WHERE t.id = p_team_id
      AND p.is_active
      AND (p.permissions ? p_key)
      AND a.status IN ('trialing','active')
      AND (a.status <> 'trialing' OR a.trial_ends_at IS NULL OR a.trial_ends_at > now())
  );
$fn$;

-- ---------- i_have_permission(): + Kill-Switch (sonst unveraendert ggü. Schritt 2) ----------
CREATE OR REPLACE FUNCTION public.i_have_permission(p_key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE e jsonb;
BEGIN
  IF public.gate_open(p_key) THEN RETURN true; END IF;          -- <<< Kill-Switch, ganz oben
  e := public.get_my_entitlements();
  IF e IS NULL THEN RETURN false; END IF;
  RETURN COALESCE((e->>'is_active')::boolean, false)
     AND COALESCE(e->'permissions' ? p_key, false);
END $fn$;

-- ---------- account_has_permission(): + Kill-Switch (sonst unveraendert) ----------
CREATE OR REPLACE FUNCTION public.account_has_permission(p_account_id uuid, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
  SELECT public.gate_open(p_key) OR EXISTS (
    SELECT 1 FROM public.accounts a JOIN public.plans p ON p.id = a.plan_id
    WHERE a.id = p_account_id AND p.is_active AND (p.permissions ? p_key)
      AND a.status IN ('trialing','active')
      AND (a.status <> 'trialing' OR a.trial_ends_at IS NULL OR a.trial_ends_at > now())
  );
$fn$;

-- ---------- Admin-Flip-RPC (fürs Admin-UI; is_leadesk_admin-Guard) ----------
CREATE OR REPLACE FUNCTION public.admin_set_gate(p_enforced boolean, p_bypass_keys text[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.gate_config
     SET gates_enforced = p_enforced,
         bypass_keys    = COALESCE(p_bypass_keys, bypass_keys),
         updated_at     = now(),
         updated_by     = auth.uid()
   WHERE id;
END $fn$;

-- ---------- Grants (Self-Host: explizit) ----------
REVOKE ALL ON FUNCTION public.gate_open(text)                   FROM public;
REVOKE ALL ON FUNCTION public.team_has_permission(uuid,text)    FROM public;
REVOKE ALL ON FUNCTION public.admin_set_gate(boolean,text[])    FROM public;
GRANT EXECUTE ON FUNCTION public.gate_open(text)                TO authenticated, service_role;  -- requireSeat ruft direkt
GRANT EXECUTE ON FUNCTION public.team_has_permission(uuid,text) TO service_role;                 -- Crons
GRANT EXECUTE ON FUNCTION public.admin_set_gate(boolean,text[]) TO authenticated;                -- Guard im Body

COMMIT;
