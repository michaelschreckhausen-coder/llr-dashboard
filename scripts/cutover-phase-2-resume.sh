#!/usr/bin/env bash
# ============================================================================
# Leadesk Cutover — Phase 2 RESUME nach Schema-Fix
# ============================================================================
#
# Setzt fort wo cutover-phase-1-2.sh wegen plans.id-Type-Mismatch crashte.
# Phase 1 (Backup + TRUNCATE) und Migration 1/14 sind bereits durch.
#
# Diese Variante:
#   - KEIN TRUNCATE (war schon)
#   - KEIN neues Backup (existiert auf prod-db-01)
#   - Startet mit Pre-Migration plans_id_text_to_uuid
#   - Dann Migrations 2-14 aus der Original-Liste
#
# Aufruf:
#   bash scripts/cutover-phase-2-resume.sh              # Dry-Run
#   bash scripts/cutover-phase-2-resume.sh --confirm    # Live
# ============================================================================

set -euo pipefail

PROD_DB_HOST="root@128.140.123.163"
PROD_CONTAINER="supabase-db"
DB_USER="postgres"
DB_NAME="postgres"

# Pre-Migration + 13 verbleibende aus Original-Liste (1/14 ist durch)
MIGRATIONS=(
  "20260428195959_plans_id_text_to_uuid.sql"
  "20260428200000_accounts_phase1_additive.sql"
  "20260428201000_accounts_phase2_data_migration.sql"
  "20260429100000_admin_audit_log.sql"
  "20260429110000_update_account_rpc.sql"
  "20260429120000_accounts_rls_split.sql"
  "20260429130000_update_rpc_per_column_cast.sql"
  "20260430100000_get_accounts_admin_list_rpc.sql"
  "20260430110000_get_accounts_admin_list_pagination.sql"
  "20260430120000_get_trial_dashboard_stats_rpc.sql"
  "20260430140000_plans_schema_harmonization.sql"
  "20260501120000_delivery_phase_3_time_tracking.sql"
  "20260502100000_plans_modules.sql"
  "20260502110000_module_entitlements_rpcs.sql"
)

DRY_RUN=true
[[ "${1:-}" == "--confirm" ]] && DRY_RUN=false

[[ -d "supabase/migrations" ]] || { echo "ERROR: aus Repo-Root ausführen"; exit 1; }
[[ "$(git branch --show-current 2>/dev/null)" == "develop" ]] || { echo "ERROR: nicht auf develop"; exit 1; }

echo ""
echo "============================================================"
echo "  Cutover Phase 2 RESUME"
$DRY_RUN && echo "  Modus: DRY RUN" || echo "  Modus: LIVE"
echo "  Migrations: ${#MIGRATIONS[@]} Stück"
echo "============================================================"
echo ""

echo "==> Lokale Migration-Files:"
MISSING=0
for m in "${MIGRATIONS[@]}"; do
  if [[ -f "supabase/migrations/$m" ]]; then
    echo "  ✓ $m"
  else
    echo "  ✗ FEHLT: $m"
    MISSING=$((MISSING+1))
  fi
done
[[ $MISSING -gt 0 ]] && { echo ""; echo "ERROR: $MISSING Files fehlen"; exit 1; }
echo ""

if $DRY_RUN; then
  echo "==> Dry-Run OK. Live: bash scripts/cutover-phase-2-resume.sh --confirm"
  exit 0
fi

echo "ACHTUNG: appliziert ${#MIGRATIONS[@]} Migrations auf $PROD_DB_HOST"
read -r -p "Tippe 'resume' zum Bestätigen: " CONFIRM
[[ "$CONFIRM" == "resume" ]] || { echo "Abgebrochen."; exit 1; }
echo ""

for i in "${!MIGRATIONS[@]}"; do
  m="${MIGRATIONS[$i]}"
  num=$((i+1))
  total="${#MIGRATIONS[@]}"
  printf "  [%2d/%d] %s ... " "$num" "$total" "$m"
  cat "supabase/migrations/$m" \
    | ssh "$PROD_DB_HOST" "docker exec -i $PROD_CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -q" \
    > /tmp/cutover-resume-$$.log 2>&1 \
    && echo "✓" \
    || { echo "✗ FEHLER"; cat /tmp/cutover-resume-$$.log; rm -f /tmp/cutover-resume-$$.log; exit 1; }
  rm -f /tmp/cutover-resume-$$.log
done
echo ""

echo "==> Verifikation:"
ssh "$PROD_DB_HOST" "docker exec $PROD_CONTAINER psql -U $DB_USER -d $DB_NAME" <<'SQL'
\x on
SELECT
  (SELECT data_type FROM information_schema.columns WHERE table_name='plans' AND column_name='id')                AS plans_id_type,
  EXISTS(SELECT 1 FROM information_schema.tables  WHERE table_name='accounts'         AND table_schema='public')   AS accounts,
  EXISTS(SELECT 1 FROM information_schema.tables  WHERE table_name='user_preferences' AND table_schema='public')   AS user_preferences,
  EXISTS(SELECT 1 FROM information_schema.tables  WHERE table_name='admin_audit_log'  AND table_schema='public')   AS admin_audit_log,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_accounts_admin_list')   AS rpc_admin_list,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_trial_dashboard_stats') AS rpc_trial_stats,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='update_account_with_audit') AS rpc_update_account,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='plans'    AND column_name='price_monthly') AS plans_harmonized,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='plans'    AND column_name='modules')       AS plan_modules,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_my_entitlements')       AS rpc_entitlements;
SQL

echo ""
echo "============================================================"
echo "  Phase 2 RESUME abgeschlossen."
echo "  plans_id_type sollte 'uuid' sein, alle anderen 't'."
echo "============================================================"
