#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# setup-auralis-stripe-price.sh
# Sprint N — Auralis "KI-Sichtbarkeit" Add-on: Stripe-Produkt + €9/Monat-Price
# ────────────────────────────────────────────────────────────────────────────
#
# Was es macht:
#   1. Liest die addons-Row slug='auralis' aus der Ziel-DB (id, name, Preis,
#      bestehende stripe_price_id).
#   2. Idempotenz: ist stripe_price_id schon gesetzt → Abbruch (außer FORCE=1).
#   3. PRE-FLIGHT-Ausgabe + (außer DRY_RUN/LIVE_CONFIRMED) interaktive
#      LIVE-Bestätigung (Hard-Rule #3).
#   4. Legt in Stripe ein Product an + einen recurring monthly EUR-Price mit
#      unit_amount = addons.price_monthly_cents (900 = 9 €).
#   5. UPDATE public.addons SET stripe_product_id, stripe_price_id WHERE slug='auralis'.
#
# WICHTIG zu Envs:
#   Stripe-Objekte sind account-gebunden, nicht env-gebunden. Führe das Skript
#   pro Environment mit dem PASSENDEN Key + DB_HOST aus:
#     - Prod:    STRIPE_SECRET_KEY=sk_live_…  DB_HOST=128.140.123.163
#     - Staging: STRIPE_SECRET_KEY=<staging-key>  DB_HOST=178.104.210.216
#   (Wenn Staging denselben Live-Account nutzt, kann dieselbe price_id in beide
#    DBs — dann das Skript mit demselben Key + jeweils anderem DB_HOST laufen.)
#
# Required ENV:
#   STRIPE_SECRET_KEY     Stripe-Key des Ziel-Accounts (sk_live_… / sk_test_…)
#
# Optional ENV:
#   DB_HOST               default 178.104.210.216 (Staging); Prod 128.140.123.163
#   DRY_RUN=1             nur Pre-Flight, kein Stripe-Call, kein DB-Write
#   LIVE_CONFIRMED=1      überspringt die interaktive Confirm-Prompt
#   FORCE=1              überschreibt eine bereits gesetzte stripe_price_id
#                         (alte wird NICHT in Stripe archiviert — das musst du
#                          ggf. manuell tun)
#
# Usage:
#   # Pre-Flight:
#   DRY_RUN=1 STRIPE_SECRET_KEY=sk_live_… DB_HOST=128.140.123.163 \
#     bash scripts/setup-auralis-stripe-price.sh
#
#   # Live (nach Session-Bestätigung):
#   LIVE_CONFIRMED=1 STRIPE_SECRET_KEY=sk_live_… DB_HOST=128.140.123.163 \
#     bash scripts/setup-auralis-stripe-price.sh
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

: "${STRIPE_SECRET_KEY:?ERROR: STRIPE_SECRET_KEY muss gesetzt sein}"

DB_HOST="${DB_HOST:-178.104.210.216}"
DRY_RUN="${DRY_RUN:-0}"
LIVE_CONFIRMED="${LIVE_CONFIRMED:-0}"
FORCE="${FORCE:-0}"
SLUG="auralis"

DB_EXEC="ssh root@${DB_HOST} docker exec -i supabase-db psql -U supabase_admin -d postgres"

stripe_post() {
  # $1 = path (z.B. "products"), $2 = data
  curl -sS -X POST "https://api.stripe.com/v1/$1" -u "${STRIPE_SECRET_KEY}:" -d "$2"
}

echo "════════════════════════════════════════════════════════════════════"
echo "Auralis Stripe-Price Setup"
echo "  DB-Host:  $DB_HOST"
echo "  Slug:     $SLUG"
echo "  Key:      ${STRIPE_SECRET_KEY:0:12}…"
echo "  DRY_RUN:  $DRY_RUN   LIVE_CONFIRMED: $LIVE_CONFIRMED   FORCE: $FORCE"
echo "════════════════════════════════════════════════════════════════════"

# ─── 1. Addon-Row laden ──────────────────────────────────────────────────────
ADDON_SQL="SELECT json_agg(a) FROM (
  SELECT id, name, price_monthly_cents, currency,
         COALESCE(stripe_price_id, '')   AS stripe_price_id,
         COALESCE(stripe_product_id, '') AS stripe_product_id
  FROM public.addons WHERE slug = '${SLUG}'
) a;"
ADDON_JSON=$(echo "$ADDON_SQL" | $DB_EXEC -t -A)

if [ -z "$ADDON_JSON" ] || [ "$ADDON_JSON" = "null" ]; then
  echo "✗ Addon '$SLUG' nicht gefunden auf $DB_HOST. Migration N.1 appliziert?"
  exit 1
fi

ROW=$(echo "$ADDON_JSON" | jq -c '.[0]')
ADDON_ID=$(echo "$ROW" | jq -r .id)
ADDON_NAME=$(echo "$ROW" | jq -r .name)
PRICE_CENTS=$(echo "$ROW" | jq -r .price_monthly_cents)
CURRENCY=$(echo "$ROW" | jq -r '.currency // "EUR"' | tr '[:upper:]' '[:lower:]')
EXISTING_PRICE=$(echo "$ROW" | jq -r .stripe_price_id)

echo ""
echo "── Pre-Flight ──"
echo "  Addon:    $ADDON_NAME ($ADDON_ID)"
echo "  Preis:    ${PRICE_CENTS}c / Monat ($CURRENCY)"
echo "  Bestehende stripe_price_id: ${EXISTING_PRICE:-<keine>}"
echo ""

if [ -n "$EXISTING_PRICE" ] && [ "$FORCE" != "1" ]; then
  echo "✓ stripe_price_id ist bereits gesetzt ($EXISTING_PRICE) — nichts zu tun."
  echo "  (Mit FORCE=1 würde ein neuer Price angelegt; die alte ID NICHT archiviert.)"
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN=1 → es würde ein Stripe-Product + €$(echo "scale=2; $PRICE_CENTS/100" | bc) recurring-monthly-Price angelegt und in addons geschrieben. Kein Call ausgeführt."
  exit 0
fi

# ─── 2. Live-Bestätigung (Hard-Rule #3) ──────────────────────────────────────
if [ "$LIVE_CONFIRMED" != "1" ]; then
  echo "⚠  LIVE-Aktion gegen Stripe-Account ${STRIPE_SECRET_KEY:0:12}… + DB $DB_HOST."
  read -r -p "    Fortfahren? Tippe 'JA' zum Bestätigen: " CONFIRM
  [ "$CONFIRM" = "JA" ] || { echo "Abgebrochen."; exit 1; }
fi

# ─── 3. Stripe Product ───────────────────────────────────────────────────────
echo "→ Lege Stripe-Product an…"
PROD_DATA="name=$(jq -rn --arg v "$ADDON_NAME (Auralis)" '$v|@uri')&description=$(jq -rn --arg v "KI-Sichtbarkeits-Add-on — Auralis-Anbindung im Branding-Bereich" '$v|@uri')&metadata[addon_id]=$ADDON_ID&metadata[slug]=$SLUG"
PROD=$(stripe_post "products" "$PROD_DATA")
PROD_ID=$(echo "$PROD" | jq -r .id)
if [ "$PROD_ID" = "null" ] || [ -z "$PROD_ID" ]; then
  echo "  ✗ Product-Create fehlgeschlagen:"; echo "$PROD" | jq . | head -20; exit 1
fi
echo "  ✓ product = $PROD_ID"

# ─── 4. Stripe Price (recurring monthly) ─────────────────────────────────────
echo "→ Lege recurring monthly Price an ($PRICE_CENTS $CURRENCY)…"
PRICE_OBJ=$(stripe_post "prices" "product=$PROD_ID&unit_amount=$PRICE_CENTS&currency=$CURRENCY&recurring[interval]=month&metadata[addon_id]=$ADDON_ID&metadata[slug]=$SLUG&metadata[interval]=monthly")
PRICE_ID=$(echo "$PRICE_OBJ" | jq -r .id)
if [ "$PRICE_ID" = "null" ] || [ -z "$PRICE_ID" ]; then
  echo "  ✗ Price-Create fehlgeschlagen:"; echo "$PRICE_OBJ" | jq . | head -20; exit 1
fi
echo "  ✓ price = $PRICE_ID"

# ─── 5. DB-Update ────────────────────────────────────────────────────────────
echo "→ Schreibe IDs in public.addons (slug=$SLUG) auf $DB_HOST…"
echo "UPDATE public.addons SET stripe_product_id='$PROD_ID', stripe_price_id='$PRICE_ID', updated_at=now() WHERE slug='$SLUG';" | $DB_EXEC -v ON_ERROR_STOP=1
echo "NOTIFY pgrst, 'reload schema';" | $DB_EXEC > /dev/null 2>&1 || true

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "✓ FERTIG"
echo "  product:   $PROD_ID"
echo "  price:     $PRICE_ID"
echo "  addon:     $SLUG → stripe_price_id gesetzt auf $DB_HOST"
echo ""
echo "  Marketplace-Card rendert jetzt 'Abonnieren' statt 'Auf Warteliste'."
echo "  Stripe-Webhook (stripe-addon-webhook) ist generisch — kein weiterer Schritt."
echo "════════════════════════════════════════════════════════════════════"
