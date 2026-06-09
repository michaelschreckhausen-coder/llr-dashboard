#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# setup-stripe-products.sh
# Phase 3 — Stripe Products + Prices + Webhook-Endpoint Setup
# 2026-05-31
# ────────────────────────────────────────────────────────────────────────────
#
# Was es macht:
#   1. Liest 14 Plans + 9 credit_topup_offers aus Staging-DB (Hetzner)
#   2. Für jeden Plan ohne stripe_price_id: erstellt Stripe Product + 2 Prices
#      (monthly + yearly), schreibt monthly-Price-ID in plans.stripe_price_id
#   3. Für jeden Topup-Offer ohne stripe_price_id: erstellt Stripe Product +
#      One-Time-Price, schreibt IDs in credit_topup_offers
#   4. Registriert Webhook-Endpoint mit 6 Subscription-Events
#   5. Schreibt komplettes Mapping (Plans + Topups + Webhook-Secret) in
#      JSON-OUT-File im aktuellen Verzeichnis
#
# Required ENV:
#   STRIPE_SECRET_KEY=sk_test_...   (Stripe API-Key, test- oder live-mode)
#   WEBHOOK_URL=https://...         (z.B. https://supabase-staging.leadesk.de/
#                                    functions/v1/stripe-subscription-webhook)
#
# Optional ENV:
#   DB_HOST=178.104.210.216         (default: Staging; für Prod: 128.140.123.163)
#
# Idempotenz: Plans/Topups MIT bereits gesetztem stripe_price_id werden
# übersprungen → script kann sicher re-run werden.
#
# Usage:
#   export STRIPE_SECRET_KEY=sk_test_...
#   export WEBHOOK_URL=https://supabase-staging.leadesk.de/functions/v1/stripe-subscription-webhook
#   cd ~/Documents  # OUT-File landet hier
#   bash ~/Documents/llr-dashboard/scripts/setup-stripe-products.sh
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── 0. Required ENV ──────────────────────────────────────────────────────
: "${STRIPE_SECRET_KEY:?ERROR: STRIPE_SECRET_KEY muss gesetzt sein}"
: "${WEBHOOK_URL:?ERROR: WEBHOOK_URL muss gesetzt sein}"

DB_HOST="${DB_HOST:-178.104.210.216}"

OUT_FILE="$(pwd)/stripe-setup-out-$(date +%Y%m%d-%H%M%S).json"
echo '{"plans": [], "topups": [], "webhook": {}}' > "$OUT_FILE"

echo "════════════════════════════════════════════════════════════════════"
echo "Stripe Setup — Phase 3"
echo "  DB-Host:    $DB_HOST"
echo "  Webhook:    $WEBHOOK_URL"
echo "  Out-File:   $OUT_FILE"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# ─── 1. Helpers ───────────────────────────────────────────────────────────
DB_EXEC="ssh root@${DB_HOST} docker exec -i supabase-db psql -U supabase_admin -d postgres"

stripe_post() {
  # $1 = path (z.B. "products"), $2 = data
  curl -sS -X POST "https://api.stripe.com/v1/$1" \
    -u "${STRIPE_SECRET_KEY}:" \
    -d "$2"
}

eur_to_cents() {
  # Float-EUR in Integer-Cents. 29.00 → 2900, 159 → 15900
  printf "%.0f" "$(echo "$1 * 100" | bc -l)"
}

out_append() {
  # $1 = jq-expression
  jq "$1" "$OUT_FILE" > "$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE"
}

# ─── 2. Plans → Stripe Products + Monthly + Yearly Prices ─────────────────
echo "═══ PLANS → STRIPE ═══"
echo ""

PLANS_SQL="SELECT json_agg(p) FROM (
  SELECT id, slug, name, price_monthly, COALESCE(price_yearly, 0) AS price_yearly,
         COALESCE(description, '') AS description
  FROM public.plans
  WHERE price_monthly IS NOT NULL AND price_monthly > 0
    AND stripe_price_id IS NULL
    AND is_active = true
  ORDER BY price_monthly
) p;"

PLANS_JSON=$(echo "$PLANS_SQL" | $DB_EXEC -t -A)

if [ -z "$PLANS_JSON" ] || [ "$PLANS_JSON" = "null" ]; then
  echo "✓ Keine Plans zu seeden (alle haben stripe_price_id oder price_monthly=NULL/0)"
else
  echo "$PLANS_JSON" | jq -c '.[]' | while read -r plan; do
    SLUG=$(echo "$plan" | jq -r .slug)
    NAME=$(echo "$plan" | jq -r .name)
    DESC=$(echo "$plan" | jq -r .description)
    PRICE_M=$(echo "$plan" | jq -r .price_monthly)
    PRICE_Y=$(echo "$plan" | jq -r .price_yearly)
    PLAN_ID=$(echo "$plan" | jq -r .id)

    echo "→ Plan '$NAME' (slug=$SLUG, €${PRICE_M}/mo, €${PRICE_Y}/yr)"

    # 2a. Product
    PROD_DATA="name=$(jq -rn --arg v "$NAME" '$v|@uri')&description=$(jq -rn --arg v "$DESC" '$v|@uri')&metadata[plan_id]=$PLAN_ID&metadata[slug]=$SLUG"
    PROD=$(stripe_post "products" "$PROD_DATA")
    PROD_ID=$(echo "$PROD" | jq -r .id)
    if [ "$PROD_ID" = "null" ]; then
      echo "  ✗ Product-Create fehlgeschlagen:"
      echo "$PROD" | jq . | head -10
      continue
    fi

    # 2b. Monthly Price
    PRICE_M_CENTS=$(eur_to_cents "$PRICE_M")
    PRICE_M_OBJ=$(stripe_post "prices" "product=$PROD_ID&unit_amount=$PRICE_M_CENTS&currency=eur&recurring[interval]=month&metadata[plan_id]=$PLAN_ID&metadata[interval]=monthly")
    PRICE_M_ID=$(echo "$PRICE_M_OBJ" | jq -r .id)

    # 2c. Yearly Price (nur wenn > 0)
    PRICE_Y_ID="null"
    if [ "$(echo "$PRICE_Y > 0" | bc -l)" = "1" ]; then
      PRICE_Y_CENTS=$(eur_to_cents "$PRICE_Y")
      PRICE_Y_OBJ=$(stripe_post "prices" "product=$PROD_ID&unit_amount=$PRICE_Y_CENTS&currency=eur&recurring[interval]=year&metadata[plan_id]=$PLAN_ID&metadata[interval]=yearly")
      PRICE_Y_ID=$(echo "$PRICE_Y_OBJ" | jq -r .id)
    fi

    # 2d. DB-UPDATE (monthly als default stripe_price_id)
    echo "UPDATE public.plans SET stripe_price_id='$PRICE_M_ID' WHERE id='$PLAN_ID';" | $DB_EXEC > /dev/null

    echo "  ✓ product=$PROD_ID  monthly=$PRICE_M_ID  yearly=$PRICE_Y_ID"

    jq --arg slug "$SLUG" --arg name "$NAME" --arg pid "$PROD_ID" \
       --arg mp "$PRICE_M_ID" --arg yp "$PRICE_Y_ID" \
       '.plans += [{slug: $slug, name: $name, product: $pid, monthly: $mp, yearly: $yp}]' \
       "$OUT_FILE" > "$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE"
  done
fi

echo ""
echo "═══ CREDIT-TOPUP-OFFERS → STRIPE ═══"
echo ""

TOPUPS_SQL="SELECT json_agg(t) FROM (
  SELECT id, slug, type, amount, price_eur, label,
         COALESCE(short_description, '') AS short_description
  FROM public.credit_topup_offers
  WHERE stripe_price_id IS NULL
    AND is_active = true
  ORDER BY price_eur
) t;"

TOPUPS_JSON=$(echo "$TOPUPS_SQL" | $DB_EXEC -t -A)

if [ -z "$TOPUPS_JSON" ] || [ "$TOPUPS_JSON" = "null" ]; then
  echo "✓ Keine Topup-Offers zu seeden"
else
  echo "$TOPUPS_JSON" | jq -c '.[]' | while read -r topup; do
    SLUG=$(echo "$topup" | jq -r .slug)
    LABEL=$(echo "$topup" | jq -r .label)
    DESC=$(echo "$topup" | jq -r .short_description)
    PRICE=$(echo "$topup" | jq -r .price_eur)
    TOPUP_ID=$(echo "$topup" | jq -r .id)
    TYPE=$(echo "$topup" | jq -r .type)

    echo "→ Topup '$LABEL' (type=$TYPE, €${PRICE})"

    # 3a. Product
    PROD_DATA="name=$(jq -rn --arg v "$LABEL" '$v|@uri')&description=$(jq -rn --arg v "$DESC" '$v|@uri')&metadata[topup_id]=$TOPUP_ID&metadata[slug]=$SLUG&metadata[type]=$TYPE"
    PROD=$(stripe_post "products" "$PROD_DATA")
    PROD_ID=$(echo "$PROD" | jq -r .id)
    if [ "$PROD_ID" = "null" ]; then
      echo "  ✗ Product-Create fehlgeschlagen:"
      echo "$PROD" | jq . | head -10
      continue
    fi

    # 3b. One-Time Price (kein recurring)
    PRICE_CENTS=$(eur_to_cents "$PRICE")
    PRICE_OBJ=$(stripe_post "prices" "product=$PROD_ID&unit_amount=$PRICE_CENTS&currency=eur&metadata[topup_id]=$TOPUP_ID")
    PRICE_ID=$(echo "$PRICE_OBJ" | jq -r .id)

    # 3c. DB-UPDATE
    echo "UPDATE public.credit_topup_offers SET stripe_product_id='$PROD_ID', stripe_price_id='$PRICE_ID' WHERE id='$TOPUP_ID';" | $DB_EXEC > /dev/null

    echo "  ✓ product=$PROD_ID  price=$PRICE_ID"

    jq --arg slug "$SLUG" --arg label "$LABEL" --arg pid "$PROD_ID" --arg p "$PRICE_ID" \
       '.topups += [{slug: $slug, label: $label, product: $pid, price: $p}]' \
       "$OUT_FILE" > "$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE"
  done
fi

# ─── 4. Webhook-Endpoint ──────────────────────────────────────────────────
echo ""
echo "═══ WEBHOOK-ENDPOINT REGISTRIEREN ═══"
echo ""

EVENTS=(
  "checkout.session.completed"
  "customer.subscription.created"
  "customer.subscription.updated"
  "customer.subscription.deleted"
  "invoice.payment_succeeded"
  "invoice.payment_failed"
)

WEBHOOK_DATA="url=$(jq -rn --arg v "$WEBHOOK_URL" '$v|@uri')"
for e in "${EVENTS[@]}"; do
  WEBHOOK_DATA="${WEBHOOK_DATA}&enabled_events[]=$e"
done

WEBHOOK_OBJ=$(stripe_post "webhook_endpoints" "$WEBHOOK_DATA")
WEBHOOK_ID=$(echo "$WEBHOOK_OBJ" | jq -r .id)
WEBHOOK_SECRET=$(echo "$WEBHOOK_OBJ" | jq -r .secret)

if [ "$WEBHOOK_ID" = "null" ]; then
  echo "✗ Webhook-Create fehlgeschlagen:"
  echo "$WEBHOOK_OBJ" | jq .
  echo ""
  echo "(Plans + Topups sind trotzdem im OUT-File. Webhook manuell anlegen.)"
else
  echo "✓ Webhook erstellt: $WEBHOOK_ID"
  echo "  URL:     $WEBHOOK_URL"
  echo "  Events:  ${#EVENTS[@]} subscribed"
  echo "  Secret:  $WEBHOOK_SECRET"

  jq --arg id "$WEBHOOK_ID" --arg secret "$WEBHOOK_SECRET" --arg url "$WEBHOOK_URL" \
     '.webhook = {id: $id, secret: $secret, url: $url}' \
     "$OUT_FILE" > "$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE"
fi

# ─── 5. Done — Next Steps ─────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "DONE — komplettes Mapping in: $OUT_FILE"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Next Steps:"
echo ""
echo "1. STRIPE_WEBHOOK_SECRET auf Staging ersetzen + Container neu instanziieren:"
echo ""
echo "   ssh root@${DB_HOST} \"sed -i 's|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET}|' /opt/supabase/docker/.env\""
echo "   ssh root@${DB_HOST} 'cd /opt/supabase/docker && docker compose up -d functions'"
echo ""
echo "2. Smoke-Test ein Checkout-Flow von app.staging.leadesk.de/pricing"
echo ""
echo "3. Für Prod-Cutover: DB_HOST=128.140.123.163 + neuer STRIPE_SECRET_KEY (live-mode)"
echo "   + neuer WEBHOOK_URL=https://supabase.leadesk.de/functions/v1/... → re-run script"
