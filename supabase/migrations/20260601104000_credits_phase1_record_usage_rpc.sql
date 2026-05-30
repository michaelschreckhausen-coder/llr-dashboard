-- Credits Phase 1 — record_usage RPC
-- ─────────────────────────────────────────────────────────────────
-- Wird aus jeder AI-Edge-Function NACH erfolgreichem Provider-Call gefeuert.
-- SECURITY DEFINER, EXECUTE nur service_role + postgres.
--
-- Berechnung: Lookup credit_pricing für (provider, model, operation, unit).
-- Token-Modelle: input_tokens/1000 * input_price + output_tokens/1000 * output_price.
-- Per-Call/Image/Minute: units * unit_price.
--
-- Idempotenz: Wenn request_id übergeben + bereits drin → return existing id.
-- Defensive: bei Pricing-Miss → Warning in metadata.warnings, Fallback-Min-Credit=1.
-- Crasht NIE — Top-Fallstrick #12 (silent NULL ist schlimmer als Warning).

BEGIN;

CREATE OR REPLACE FUNCTION public.record_usage(
  p_account_id uuid,
  p_team_id uuid,
  p_user_id uuid,
  p_edge_function text,
  p_operation text,
  p_provider text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL,
  p_output_tokens integer DEFAULT NULL,
  p_units numeric DEFAULT NULL,
  p_unit_type text DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_status text DEFAULT 'success',
  p_extra_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits numeric := 0;
  v_input_price numeric;
  v_output_price numeric;
  v_unit_price numeric;
  v_warnings jsonb := '[]'::jsonb;
  v_existing_id uuid;
  v_id uuid;
  v_metadata jsonb;
BEGIN
  -- Idempotency
  IF p_request_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.credit_usage
    WHERE request_id = p_request_id
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Token-Input
  IF p_input_tokens IS NOT NULL AND p_input_tokens > 0 THEN
    SELECT credits_per_unit INTO v_input_price
    FROM public.credit_pricing
    WHERE provider = p_provider
      AND model = p_model
      AND operation = p_operation
      AND unit = '1k_input_tokens'
      AND is_active = true
    LIMIT 1;
    IF v_input_price IS NOT NULL THEN
      v_credits := v_credits + (p_input_tokens::numeric / 1000.0) * v_input_price;
    ELSE
      v_warnings := v_warnings || jsonb_build_array(
        jsonb_build_object('missing_price','1k_input_tokens','provider',p_provider,'model',p_model)
      );
    END IF;
  END IF;

  -- Token-Output
  IF p_output_tokens IS NOT NULL AND p_output_tokens > 0 THEN
    SELECT credits_per_unit INTO v_output_price
    FROM public.credit_pricing
    WHERE provider = p_provider
      AND model = p_model
      AND operation = p_operation
      AND unit = '1k_output_tokens'
      AND is_active = true
    LIMIT 1;
    IF v_output_price IS NOT NULL THEN
      v_credits := v_credits + (p_output_tokens::numeric / 1000.0) * v_output_price;
    ELSE
      v_warnings := v_warnings || jsonb_build_array(
        jsonb_build_object('missing_price','1k_output_tokens','provider',p_provider,'model',p_model)
      );
    END IF;
  END IF;

  -- Units (image, minute, call)
  IF p_units IS NOT NULL AND p_units > 0 AND p_unit_type IS NOT NULL THEN
    SELECT credits_per_unit INTO v_unit_price
    FROM public.credit_pricing
    WHERE provider = p_provider
      AND model = p_model
      AND operation = p_operation
      AND unit = p_unit_type
      AND is_active = true
    LIMIT 1;
    IF v_unit_price IS NOT NULL THEN
      v_credits := v_credits + p_units * v_unit_price;
    ELSE
      v_warnings := v_warnings || jsonb_build_array(
        jsonb_build_object('missing_price',p_unit_type,'provider',p_provider,'model',p_model)
      );
    END IF;
  END IF;

  -- Fallback: bei success-Status mind. 1 Credit damit es nicht silent ist
  IF v_credits = 0 AND p_status = 'success' THEN
    v_credits := 1;
    v_warnings := v_warnings || jsonb_build_array(
      jsonb_build_object('fallback_min_credit', true)
    );
  END IF;

  -- Metadata zusammenbauen
  v_metadata := COALESCE(p_extra_metadata, '{}'::jsonb);
  IF jsonb_array_length(v_warnings) > 0 THEN
    v_metadata := v_metadata || jsonb_build_object('warnings', v_warnings);
  END IF;

  INSERT INTO public.credit_usage (
    account_id, team_id, user_id,
    edge_function, operation, provider, model,
    credits, input_tokens, output_tokens,
    request_id, status, metadata
  ) VALUES (
    p_account_id, p_team_id, p_user_id,
    p_edge_function, p_operation, p_provider, p_model,
    v_credits, p_input_tokens, p_output_tokens,
    p_request_id, p_status, v_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_usage(
  uuid, uuid, uuid, text, text, text, text,
  integer, integer, numeric, text, text, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_usage(
  uuid, uuid, uuid, text, text, text, text,
  integer, integer, numeric, text, text, text, jsonb
) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_usage(
  uuid, uuid, uuid, text, text, text, text,
  integer, integer, numeric, text, text, text, jsonb
) TO postgres;

COMMIT;
