#!/usr/bin/env bash
# ============================================================================
# Leadesk Cutover — Phase 3: Default-Plans seeden
# ============================================================================
#
# Seedet 4 Plans (free/starter/pro/enterprise) auf Hetzner-Prod.
# Pre-Check: plans-Tabelle muss leer sein, sonst Abbruch.
#
# Aufruf:
#   bash scripts/cutover-phase-3-seed.sh              # Dry-Run
#   bash scripts/cutover-phase-3-seed.sh --confirm    # Live
# ============================================================================

set -euo pipefail

PROD_DB_HOST="root@128.140.123.163"
PROD_CONTAINER="supabase-db"
DB_USER="postgres"
DB_NAME="postgres"
SEED_FILE="scripts/seed-default-plans.sql"

DRY_RUN=true
[[ "${1:-}" == "--confirm" ]] && DRY_RUN=false

[[ -f "$SEED_FILE" ]] || { echo "ERROR: $SEED_FILE fehlt — aus Repo-Root ausführen"; exit 1; }
[[ "$(git branch --show-current 2>/dev/null)" == "develop" ]] || { echo "ERROR: nicht auf develop"; exit 1; }

echo ""
echo "============================================================"
echo "  Cutover Phase 3 — Default-Plans seed"
$DRY_RUN && echo "  Modus: DRY RUN" || echo "  Modus: LIVE"
echo "  Ziel:  $PROD_DB_HOST"
echo "  Seed:  $SEED_FILE"
echo "============================================================"
echo ""

# Pre-Check via SSH: ist plans wirklich leer?
# -n verhindert dass ssh stdin der Parent-Shell konsumiert — sonst kommt
# Pipe-Input (`echo seed | bash …`) nie beim read-Prompt unten an.
echo "==> Pre-Check: ist plans-Tabelle leer auf Prod?"
ROW_COUNT=$(ssh -n "$PROD_DB_HOST" "docker exec $PROD_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc 'SELECT count(*) FROM public.plans;'")
echo "  Aktuell: $ROW_COUNT Rows"
if [[ "$ROW_COUNT" != "0" ]]; then
  echo "ERROR: plans ist nicht leer. Seed bricht ab. Manuell prüfen."
  exit 1
fi
echo "  ✓ plans ist leer, Seed kann laufen"
echo ""

if $DRY_RUN; then
  echo "==> Dry-Run OK. Live: bash scripts/cutover-phase-3-seed.sh --confirm"
  exit 0
fi

read -r -p "Tippe 'seed' zum Bestätigen: " CONFIRM
[[ "$CONFIRM" == "seed" ]] || { echo "Abgebrochen."; exit 1; }
echo ""

echo "==> Seeding 4 Plans (free, starter, pro, enterprise)..."
cat "$SEED_FILE" \
  | ssh "$PROD_DB_HOST" "docker exec -i $PROD_CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1" \
  > /tmp/seed-out-$$.log 2>&1 \
  && echo "  ✓ ok" \
  || { echo "  ✗ FEHLER"; cat /tmp/seed-out-$$.log; rm -f /tmp/seed-out-$$.log; exit 1; }
rm -f /tmp/seed-out-$$.log
echo ""

echo "==> Verifikation:"
ssh "$PROD_DB_HOST" "docker exec $PROD_CONTAINER psql -U $DB_USER -d $DB_NAME -c \"
SELECT slug, name, price_monthly::int AS monthly, price_yearly::int AS yearly, max_team_members AS seats, max_leads, array_length(modules,1) AS module_count, is_active, is_trial
FROM public.plans
ORDER BY sort_order;
\""

echo ""
echo "============================================================"
echo "  Phase 3 abgeschlossen."
echo "  Erwartet: 4 Rows, alle mit module_count=6."
echo "============================================================"
