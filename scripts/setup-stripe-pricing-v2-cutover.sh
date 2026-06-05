#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# setup-stripe-pricing-v2-cutover.sh
# Sprint M.3 — Pricing v2 Stripe-Cutover (archive old + create new prices)
# 2026-06-05
# ────────────────────────────────────────────────────────────────────────────
#
# Was es macht:
#   1. PRE-FLIGHT: Listet alle alten aktiven Prices auf den 7 Plans + 9 Topups
#      + Premium-Addon-Sales (falls vorhanden). Gibt zusammengefasste Übersicht.
#   2. EXPLIZITE LIVE-CONFIRMED-Abfrage (Hard-Rule #3)
#   3. ARCHIVE-PHASE: Setzt active=false auf den alten Stripe-Prices (monthly +
#      yearly für Plans, one-time für Topups). Stripe lässt bestehende Subs
#      auf archived Prices weiterlaufen, blockt aber neue.
#   4. DB-RESET: Setzt stripe_*_id auf NULL für die 7+9+1 betroffenen Rows
#      (in derselben TX, atomisch via BEGIN/COMMIT auf Hetzner-psql)
#   5. CREATE-PHASE: Legt 7×2 Plan-Prices + 1×2 Addon-Prices + 9 Topup-Prices
#      = 25 neue Prices an (analog setup-stripe-products.sh, aber ERWEITERT
#      um yearly-Persistence + addons-Tabelle)
#   6. DB-UPDATE: Schreibt neue IDs in plans (monthly+yearly), addons
#      (monthly+yearly), credit_topup_offers
#   7. Erzeugt UPDATE-Migration-File (analog 20260601150000) für Repo-Commit
#
# Was es NICHT macht:
#   - Stripe-Products werden NICHT archiviert (Produkt bleibt aktiv, nur Prices
#     werden ersetzt). Begründung: gleiches Product → Stripe-Dashboard-Historie
#     bleibt kohärent. Optional kann das später manuell gemacht werden.
#   - Bestehende Customer-Subscriptions werden NICHT migriert. Sie bleiben auf
#     alten archived Prices bis zur nächsten Renewal oder bis sie selbst
#     upgraden (Michaels Wahl: "Archive old + neue anlegen").
#   - Webhook bleibt unverändert (URL ist gleich).
#
# Required ENV:
#   STRIPE_SECRET_KEY=sk_live_51TcsDy...   (Stripe LIVE-Key)
#   DB_HOST=178.104.210.216                (default: Staging)
#                                           Prod: 128.140.123.163
#
# Optional ENV:
#   DRY_RUN=1                              (kein Stripe-Call, nur Pre-Flight)
#   LIVE_CONFIRMED=1                       (skip interaktive Confirm-Prompt;
#                                           Hard-Rule #3 setzt voraus dass
#                                           du in der Session explizit
#                                           bestätigt hast)
#
# Usage:
#   # Pre-Flight (DRY_RUN):
#   DRY_RUN=1 STRIPE_SECRET_KEY=sk_live_... bash scripts/setup-stripe-pricing-v2-cutover.sh
#
#   # Live-Cutover (nach Session-Bestätigung):
#   LIVE_CONFIRMED=1 STRIPE_SECRET_KEY=sk_live_... bash scripts/setup-stripe-pricing-v2-cutover.sh
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

: "${STRIPE_SECRET_KEY:?ERROR: STRIPE_SECRET_KEY muss gesetzt sein}"

DB_HOST="${DB_HOST:-178.104.210.216}"
DRY_RUN="${DRY_RUN:-0}"
LIVE_CONFIRMED="${LIVE_CONFIRMED:-0}"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="$(pwd)/stripe-pricing-v2-cutover-${TIMESTAMP}.json"
MIGRATION_FILE="$(pwd)/20260605140000_pricing_v2_stripe_price_ids_live.sql"

echo '{"archived": [], "plans": [], "addons": [], "topups": [], "old_state": {}}' > "$OUT_FILE"

# ─── Helpers ──────────────────────────────────────────────────────────────
DB_EXEC="ssh root@${DB_HOST} docker exec -i supabase-db psql -U supabase_admin -d postgres"

stripe_get() {
  curl -sS "https://api.stripe.com/v1/$1" -u "${STRIPE_SECRET_KEY}:"
}

stripe_post() {
  curl -sS -X POST "https://api.stripe.com/v1/$1" -u "${STRIPE_SECRET_KEY}:" -d "$2"
}

stripe_archive_price() {
  # PATCH /v1/prices/{id} mit active=false
  curl -sS -X POST "https://api.stripe.com/v1/prices/$1" \
    -u "${STRIPE_SECRET_KEY}:" -d "active=false"
}

eur_to_cents() {
  printf "%.0f" "$(echo "$1 * 100" | bc -l)"
}

echo "════════════════════════════════════════════════════════════════════"
echo "Pricing v2 — Stripe-Cutover"
echo "  DB-Host:     $DB_HOST"
echo "  Stripe-Mode: $(echo "$STRIPE_SECRET_KEY" | head -c 8)..."
echo "  DRY_RUN:     $DRY_RUN"
echo "  Out-File:    $OUT_FILE"
echo "  Migration:   $MIGRATION_FILE"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# 1) PRE-FLIGHT — alte Stripe-IDs auflisten
# ════════════════════════════════════════════════════════════════════════════
echo "═══ PRE-FLIGHT: aktuelle Stripe-IDs ═══"
echo ""

PRE_FLIGHT_PLANS=$(echo "SELECT json_agg(p) FROM (
  SELECT slug, name, price_monthly, price_yearly, stripe_price_id, stripe_price_id_yearly
  FROM public.plans
  WHERE slug IN ('sales','marketing','all-in','sales-team','marketing-team','kmu','customized')
  ORDER BY price_monthly
) p;" | $DB_EXEC -t -A)

PRE_FLIGHT_ADDONS=$(echo "SELECT json_agg(a) FROM (
  SELECT slug, name, price_monthly_cents, price_yearly_cents,
         stripe_price_id, stripe_price_id_yearly, stripe_product_id
  FROM public.addons
  WHERE slug = 'premium-models-sales'
) a;" | $DB_EXEC -t -A)

PRE_FLIGHT_TOPUPS=$(echo "SELECT json_agg(t) FROM (
  SELECT slug, label, type, amount, price_eur, is_recurring,
         stripe_product_id, stripe_price_id
  FROM public.credit_topup_offers
  ORDER BY sort_order
) t;" | $DB_EXEC -t -A)

echo "── PLANS (alte stripe_price_ids vor Cutover) ──"
echo "$PRE_FLIGHT_PLANS" | jq -r '.[] | "  \(.slug)\t€\(.price_monthly)/mo  \(.stripe_price_id // "NULL")  €\(.price_yearly // "NULL")/yr  \(.stripe_price_id_yearly // "NULL")"'
echo ""
echo "── ADDONS (premium-models-sales) ──"
echo "$PRE_FLIGHT_ADDONS" | jq -r '.[] | "  \(.slug)\t\(.price_monthly_cents)c/mo  \(.stripe_price_id // "NULL")  \(.price_yearly_cents // "null")c/yr  \(.stripe_price_id_yearly // "NULL")"'
echo ""
echo "── TOP-UPS (alte stripe_price_ids) ──"
echo "$PRE_FLIGHT_TOPUPS" | jq -r '.[] | "  \(.slug)\t€\(.price_eur)  \(.stripe_price_id // "NULL")"'
echo ""

# OUT-File speichern
jq --argjson p "$PRE_FLIGHT_PLANS" --argjson a "$PRE_FLIGHT_ADDONS" --argjson t "$PRE_FLIGHT_TOPUPS" \
   '.old_state = {plans: $p, addons: $a, topups: $t}' "$OUT_FILE" > "$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE"

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN=1 → Pre-Flight done, kein Stripe-Call, kein DB-Write."
  exit 0
fi

# ════════════════════════════════════════════════════════════════════════════
# 2) LIVE-CONFIRMED-Abfrage (Hard-Rule #3)
# ════════════════════════════════════════════════════════════════════════════
if [ "$LIVE_CONFIRMED" != "1" ]; then
  echo ""
  echo "⚠️  HARD-RULE #3: Live-Stripe-Cutover braucht explizite Bestätigung."
  echo "    Re-run mit: LIVE_CONFIRMED=1 bash $0"
  echo ""
  exit 1
fi

# ════════════════════════════════════════════════════════════════════════════
# 3) ARCHIVE-PHASE: Alte Stripe-Prices auf active=false setzen
# ════════════════════════════════════════════════════════════════════════════
echo "═══ ARCHIVE: alte Stripe-Prices ═══"
echo ""

archive_all_for_slug_set() {
  # $1 = JSON-Array von Rows mit Feldern .stripe_price_id, .stripe_price_id_yearly, .slug
  echo "$1" | jq -c '.[]' | while read -r row; do
    SLUG=$(echo "$row" | jq -r .slug)
    PM=$(echo "$row" | jq -r '.stripe_price_id // empty')
    PY=$(echo "$row" | jq -r '.stripe_price_id_yearly // empty')

    if [ -n "$PM" ] && [ "$PM" != "null" ]; then
      echo "  → archive $SLUG monthly $PM"
      RESP=$(stripe_archive_price "$PM")
      ACTIVE=$(echo "$RESP" | jq -r .active)
      if [ "$ACTIVE" != "false" ]; then
        echo "    ⚠️ archive failed for $PM (active=$ACTIVE)"
      fi
      jq --arg id "$PM" --arg slug "$SLUG" --arg interval "monthly" \
         '.archived += [{slug: $slug, interval: $interval, price_id: $id}]' \
         "$OUT_FILE" > "$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE"
    fi
    if [ -n "$PY" ] && [ "$PY" != "null" ]; then
      echo "  → archive $SLUG yearly  $PY"
      RESP=$(stripe_archive_price "$PY")
      ACTIVE=$(echo "$RESP" | jq -r .active)
      if [ "$ACTIVE" != "false" ]; then
        echo "    ⚠️ archive failed for $PY (active=$ACTIVE)"
      fi
      jq --arg id "$PY" --arg slug "$SLUG" --arg interval "yearly" \
         '.archived += [{slug: $slug, interval: $interval, price_id: $id}]' \
         "$OUT_FILE" > "$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE"
    fi
  done
}

archive_all_for_slug_set "$PRE_FLIGHT_PLANS"
archive_all_for_slug_set "$PRE_FLIGHT_ADDONS"
archive_all_for_slug_set "$PRE_FLIGHT_TOPUPS"

echo ""
echo "✓ Archive-Phase done"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# 4) DB-RESET: stripe_*_id auf NULL setzen (für die 7+9+1 Rows)
# ════════════════════════════════════════════════════════════════════════════
echo "═══ DB-RESET: stripe_*_id auf NULL ═══"
echo ""

$DB_EXEC <<'SQL'
BEGIN;
UPDATE public.plans
   SET stripe_price_id = NULL, stripe_price_id_yearly = NULL
 WHERE slug IN ('sales','marketing','all-in','sales-team','marketing-team','kmu','customized');

UPDATE public.addons
   SET stripe_price_id = NULL, stripe_price_id_yearly = NULL, stripe_product_id = NULL
 WHERE slug = 'premium-models-sales';

UPDATE public.credit_topup_offers
   SET stripe_price_id = NULL, stripe_product_id = NULL;
COMMIT;
NOTIFY pgrst, 'reload schema';
SQL

echo "✓ DB-Reset done"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# 5) CREATE-PHASE: 25 neue Stripe-Prices anlegen
# ════════════════════════════════════════════════════════════════════════════
echo "═══ CREATE: neue Stripe-Products + Prices ═══"
echo ""

# ── 5a) Plans (7 × 2 = 14 Prices, customized hat kein yearly = 13)
PLANS_TO_CREATE=$(echo "SELECT json_agg(p) FROM (
  SELECT id, slug, name, price_monthly, COALESCE(price_yearly, 0) AS price_yearly,
         COALESCE(description, '') AS description
  FROM public.plans
  WHERE slug IN ('sales','marketing','all-in','sales-team','marketing-team','kmu','customized')
    AND price_monthly IS NOT NULL AND price_monthly > 0
    AND stripe_price_id IS NULL
    AND is_active = true
  ORDER BY price_monthly
) p;" | $DB_EXEC -t -A)

echo "── Plans ──"
echo "$PLANS_TO_CREATE" | jq -c '.[]' | while read -r plan; do
  SLUG=$(echo "$plan" | jq -r .slug)
  NAME=$(echo "$plan" | jq -r .name)
  DESC=$(echo "$plan" | jq -r .description)
  PRICE_M=$(echo "$plan" | jq -r .price_monthly)
  PRICE_Y=$(echo "$plan" | jq -r .price_yearly)
  PLAN_ID=$(echo "$plan" | jq -r .id)

  echo "→ Plan '$NAME' (slug=$SLUG, €${PRICE_M}/mo, €${PRICE_Y}/yr)"

  PROD_DATA="name=$(jq -rn --arg v "$NAME" '$v|@uri')&description=$(jq -rn --arg v "$DESC" '$v|@uri')&metadata[plan_id]=$PLAN_ID&metadata[slug]=$SLUG&metadata[pricing_version]=v2"
  PROD=$(stripe_post "products" "$PROD_DATA")
  PROD_ID=$(echo "$PROD" | jq -r .id)
  if [ "$PROD_ID" = "null" ]; then
    echo "  ✗ Product-Create fehlgeschlagen:"
    echo "$PROD" | jq . | head -10
    continue
  fi

  PRICE_M_CENTS=$(eur_to_cents "$PRICE_M")
  PRICE_M_OBJ=$(stripe_post "prices" "product=$PROD_ID&unit_amount=$PRICE_M_CENTS&currency=eur&recurring[interval]=month&metadata[plan_id]=$PLAN_ID&metadata[interval]=monthly&metadata[pricing_version]=v2")
  PRICE_M_ID=$(echo "$PRICE_M_OBJ" | jq -r .id)

  PRICE_Y_ID="null"
  if [ "$(echo "$PRICE_Y > 0" | bc -l)" = "1" ]; then
    PRICE_Y_CENTS=$(eur_to_cents "$PRICE_Y")
    PRICE_Y_OBJ=$(stripe_post "prices" "product=$PROD_ID&unit_amount=$PRICE_Y_CENTS&currency=eur&recurring[interval]=year&metadata[plan_id]=$PLAN_ID&metadata[interval]=yearly&metadata[pricing_version]=v2")
    PRICE_Y_ID=$(echo "$PRICE_Y_OBJ" | jq -r .id)
  fi

  # DB-UPDATE (BEIDE Spalten — Fix gegenüber setup-stripe-products.sh)
  if [ "$PRICE_Y_ID" != "null" ]; then
    echo "UPDATE public.plans SET stripe_price_id='$PRICE_M_ID', stripe_price_id_yearly='$PRICE_Y_ID' WHERE id='$PLAN_ID';" | $DB_EXEC > /dev/null
  else
    echo "UPDATE public.plans SET stripe_price_id='$PRICE_M_ID', stripe_price_id_yearly=NULL WHERE id='$PLAN_ID';" | $DB_EXEC > /dev/null
  fi

  echo "  ✓ product=$PROD_ID  monthly=$PRICE_M_ID  yearly=$PRICE_Y_ID"
  jq --arg slug "$SLUG" --arg pid "$PROD_ID" --arg mp "$PRICE_M_ID" --arg yp "$PRICE_Y_ID" \
     '.plans += [{slug: $slug, product: $pid, monthly: $mp, yearly: $yp}]' \
     "$OUT_FILE" > "$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE"
done

# ── 5b) Premium-Addon-Sales (1 Product + 2 Prices)
echo ""
echo "── Addons (premium-models-sales) ──"
ADDON_DATA=$(echo "SELECT json_agg(a) FROM (
  SELECT id, slug, name, COALESCE(short_description, '') AS description,
         price_monthly_cents, price_yearly_cents
  FROM public.addons
  WHERE slug = 'premium-models-sales' AND is_active = true
) a;" | $DB_EXEC -t -A)

echo "$ADDON_DATA" | jq -c '.[]' | while read -r addon; do
  SLUG=$(echo "$addon" | jq -r .slug)
  NAME=$(echo "$addon" | jq -r .name)
  DESC=$(echo "$addon" | jq -r .description)
  PRICE_M_CENTS=$(echo "$addon" | jq -r .price_monthly_cents)
  PRICE_Y_CENTS=$(echo "$addon" | jq -r .price_yearly_cents)
  ADDON_ID=$(echo "$addon" | jq -r .id)

  echo "→ Addon '$NAME' (slug=$SLUG, ${PRICE_M_CENTS}c/mo, ${PRICE_Y_CENTS}c/yr)"

  PROD_DATA="name=$(jq -rn --arg v "$NAME" '$v|@uri')&description=$(jq -rn --arg v "$DESC" '$v|@uri')&metadata[addon_id]=$ADDON_ID&metadata[slug]=$SLUG&metadata[pricing_version]=v2"
  PROD=$(stripe_post "products" "$PROD_DATA")
  PROD_ID=$(echo "$PROD" | jq -r .id)

  PRICE_M_OBJ=$(stripe_post "prices" "product=$PROD_ID&unit_amount=$PRICE_M_CENTS&currency=eur&recurring[interval]=month&metadata[addon_id]=$ADDON_ID&metadata[interval]=monthly&metadata[pricing_version]=v2")
  PRICE_M_ID=$(echo "$PRICE_M_OBJ" | jq -r .id)

  PRICE_Y_OBJ=$(stripe_post "prices" "product=$PROD_ID&unit_amount=$PRICE_Y_CENTS&currency=eur&recurring[interval]=year&metadata[addon_id]=$ADDON_ID&metadata[interval]=yearly&metadata[pricing_version]=v2")
  PRICE_Y_ID=$(echo "$PRICE_Y_OBJ" | jq -r .id)

  echo "UPDATE public.addons SET stripe_product_id='$PROD_ID', stripe_price_id='$PRICE_M_ID', stripe_price_id_yearly='$PRICE_Y_ID' WHERE id='$ADDON_ID';" | $DB_EXEC > /dev/null

  echo "  ✓ product=$PROD_ID  monthly=$PRICE_M_ID  yearly=$PRICE_Y_ID"
  jq --arg slug "$SLUG" --arg pid "$PROD_ID" --arg mp "$PRICE_M_ID" --arg yp "$PRICE_Y_ID" \
     '.addons += [{slug: $slug, product: $pid, monthly: $mp, yearly: $yp}]' \
     "$OUT_FILE" > "$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE"
done

# ── 5c) Top-Ups (9 × 1 = 9 Prices)
echo ""
echo "── Top-Ups ──"
TOPUPS_TO_CREATE=$(echo "SELECT json_agg(t) FROM (
  SELECT id, slug, type, amount, price_eur, label, is_recurring,
         COALESCE(short_description, '') AS short_description
  FROM public.credit_topup_offers
  WHERE stripe_price_id IS NULL
    AND is_active = true
  ORDER BY sort_order
) t;" | $DB_EXEC -t -A)

echo "$TOPUPS_TO_CREATE" | jq -c '.[]' | while read -r topup; do
  SLUG=$(echo "$topup" | jq -r .slug)
  LABEL=$(echo "$topup" | jq -r .label)
  DESC=$(echo "$topup" | jq -r .short_description)
  PRICE=$(echo "$topup" | jq -r .price_eur)
  TOPUP_ID=$(echo "$topup" | jq -r .id)
  TYPE=$(echo "$topup" | jq -r .type)
  RECURRING=$(echo "$topup" | jq -r .is_recurring)

  echo "→ Topup '$LABEL' (type=$TYPE, €${PRICE}, recurring=$RECURRING)"

  PROD_DATA="name=$(jq -rn --arg v "$LABEL" '$v|@uri')&description=$(jq -rn --arg v "$DESC" '$v|@uri')&metadata[topup_id]=$TOPUP_ID&metadata[slug]=$SLUG&metadata[type]=$TYPE&metadata[pricing_version]=v2"
  PROD=$(stripe_post "products" "$PROD_DATA")
  PROD_ID=$(echo "$PROD" | jq -r .id)

  PRICE_CENTS=$(eur_to_cents "$PRICE")
  if [ "$RECURRING" = "true" ]; then
    # Storage- + CRM-Topups: recurring monthly
    PRICE_OBJ=$(stripe_post "prices" "product=$PROD_ID&unit_amount=$PRICE_CENTS&currency=eur&recurring[interval]=month&metadata[topup_id]=$TOPUP_ID&metadata[pricing_version]=v2")
  else
    # Credit-Topups: one-time
    PRICE_OBJ=$(stripe_post "prices" "product=$PROD_ID&unit_amount=$PRICE_CENTS&currency=eur&metadata[topup_id]=$TOPUP_ID&metadata[pricing_version]=v2")
  fi
  PRICE_ID=$(echo "$PRICE_OBJ" | jq -r .id)

  echo "UPDATE public.credit_topup_offers SET stripe_product_id='$PROD_ID', stripe_price_id='$PRICE_ID' WHERE id='$TOPUP_ID';" | $DB_EXEC > /dev/null

  echo "  ✓ product=$PROD_ID  price=$PRICE_ID"
  jq --arg slug "$SLUG" --arg pid "$PROD_ID" --arg p "$PRICE_ID" \
     '.topups += [{slug: $slug, product: $pid, price: $p}]' \
     "$OUT_FILE" > "$OUT_FILE.tmp" && mv "$OUT_FILE.tmp" "$OUT_FILE"
done

# ════════════════════════════════════════════════════════════════════════════
# 6) UPDATE-Migration generieren (für Repo-Commit, falls Re-Apply nötig)
# ════════════════════════════════════════════════════════════════════════════
echo ""
echo "═══ Migration generieren ═══"
echo ""

cat > "$MIGRATION_FILE" <<EOF
-- ════════════════════════════════════════════════════════════════════════════
-- Pricing v2 — UPDATE plans + addons + credit_topup_offers Stripe-IDs (LIVE)
-- Generated $(date +'%Y-%m-%d %H:%M:%S') from setup-stripe-pricing-v2-cutover.sh
-- ════════════════════════════════════════════════════════════════════════════
--
-- Idempotent: UPDATE auf gleiche Werte ist no-op. Re-Apply safe.
--
-- Apply-Pfad:
--   ssh root@${DB_HOST} 'docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' \\
--     < supabase/migrations/$(basename "$MIGRATION_FILE")

BEGIN;

EOF

# Plans-UPDATEs
for row in $(jq -c '.plans[]' "$OUT_FILE"); do
  SLUG=$(echo "$row" | jq -r .slug)
  MO=$(echo "$row" | jq -r .monthly)
  YR=$(echo "$row" | jq -r .yearly)
  if [ "$YR" = "null" ]; then
    printf "UPDATE public.plans\n   SET stripe_price_id        = '%s',\n       stripe_price_id_yearly = NULL\n WHERE slug = '%s';\n\n" "$MO" "$SLUG" >> "$MIGRATION_FILE"
  else
    printf "UPDATE public.plans\n   SET stripe_price_id        = '%s',\n       stripe_price_id_yearly = '%s'\n WHERE slug = '%s';\n\n" "$MO" "$YR" "$SLUG" >> "$MIGRATION_FILE"
  fi
done

# Addon-UPDATEs
for row in $(jq -c '.addons[]' "$OUT_FILE"); do
  SLUG=$(echo "$row" | jq -r .slug)
  PROD=$(echo "$row" | jq -r .product)
  MO=$(echo "$row" | jq -r .monthly)
  YR=$(echo "$row" | jq -r .yearly)
  printf "UPDATE public.addons\n   SET stripe_product_id       = '%s',\n       stripe_price_id         = '%s',\n       stripe_price_id_yearly  = '%s'\n WHERE slug = '%s';\n\n" "$PROD" "$MO" "$YR" "$SLUG" >> "$MIGRATION_FILE"
done

# Topup-UPDATEs
for row in $(jq -c '.topups[]' "$OUT_FILE"); do
  SLUG=$(echo "$row" | jq -r .slug)
  PROD=$(echo "$row" | jq -r .product)
  PR=$(echo "$row" | jq -r .price)
  printf "UPDATE public.credit_topup_offers\n   SET stripe_product_id = '%s',\n       stripe_price_id   = '%s'\n WHERE slug = '%s';\n\n" "$PROD" "$PR" "$SLUG" >> "$MIGRATION_FILE"
done

cat >> "$MIGRATION_FILE" <<'EOF'
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.plans
   WHERE slug IN ('sales','marketing','all-in','sales-team','marketing-team','kmu','customized')
     AND stripe_price_id IS NOT NULL;
  IF v_count != 7 THEN RAISE EXCEPTION 'Pricing v2 Stripe-IDs: expected 7 plans wired, got %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.addons
   WHERE slug = 'premium-models-sales' AND stripe_price_id IS NOT NULL;
  IF v_count != 1 THEN RAISE EXCEPTION 'Pricing v2 Stripe-IDs: premium-models-sales nicht gewired'; END IF;

  SELECT count(*) INTO v_count FROM public.credit_topup_offers
   WHERE stripe_price_id IS NOT NULL;
  IF v_count != 9 THEN RAISE EXCEPTION 'Pricing v2 Stripe-IDs: expected 9 topups wired, got %', v_count; END IF;

  RAISE NOTICE 'Pricing v2 Stripe-IDs verification PASSED: 7 plans + 1 addon + 9 topups wired';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
EOF

echo "✓ Migration-File: $MIGRATION_FILE"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# 7) DONE
# ════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════════════"
echo "DONE — Pricing v2 Stripe-Cutover komplett"
echo ""
echo "Mapping:    $OUT_FILE"
echo "Migration:  $MIGRATION_FILE"
echo ""
echo "Next Steps:"
echo ""
echo "1. Smoke-Test in Browser auf staging.leadesk.de/settings/konto + /marketplace"
echo "   + leadesk.de/pricing (Buy-Now-Anonymous-Flow)"
echo ""
echo "2. Migration-File ins Repo verschieben:"
echo "   mv $MIGRATION_FILE \\"
echo "     /Users/michaelschreck/Documents/llr-dashboard/supabase/migrations/"
echo ""
echo "3. Für Prod-Cutover: DB_HOST=128.140.123.163 + re-run mit gleichem"
echo "   STRIPE_SECRET_KEY (selber Live-Account!)"
echo "════════════════════════════════════════════════════════════════════"
