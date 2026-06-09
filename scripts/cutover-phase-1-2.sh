#!/usr/bin/env bash
# ============================================================================
# Leadesk Cutover — Phase 1+2: Hetzner-Prod-Reset + Migrations
# ============================================================================
#
# Was passiert:
#   Phase 1.1  pg_dump-Backup auf prod-db-01 (im Container, unter /root/)
#   Phase 1.2  TRUNCATE aller public.*-Tabellen (CASCADE)
#   Phase 2    14 Migrations in fixer Reihenfolge applien
#   Phase 2.V  Verifikations-EXISTS-Checks
#
# Aufruf:
#   bash scripts/cutover-phase-1-2.sh              # Dry-Run (zeigt nur Plan)
#   bash scripts/cutover-phase-1-2.sh --confirm    # Live-Ausführung
#
# Voraussetzung:
#   - aus llr-dashboard repo-root ausgeführt
#   - lokaler git-Branch = develop (alle 14 Migration-Files lokal)
#   - SSH-Key auf prod-db-01 (root@128.140.123.163) eingerichtet
#
# Idempotent: Migrations laufen alle mit IF NOT EXISTS / DROP IF EXISTS.
#             Backup bekommt einen Timestamp, überschreibt nichts.
#
# Bei Fehler stoppt das Skript sofort (set -e + ON_ERROR_STOP).
# ============================================================================

set -euo pipefail

# --- Konfiguration ----------------------------------------------------------

PROD_DB_HOST="root@128.140.123.163"
PROD_CONTAINER="supabase-db"
DB_USER="postgres"
DB_NAME="postgres"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="/root/cutover-backup-${TIMESTAMP}.sql"

# Migrations in fester Apply-Reihenfolge.
# NICHT umsortieren — Reihenfolge ist semantisch (Account vor Audit-Log,
# Schema-Harmonisierung vor plans_modules etc.)
MIGRATIONS=(
  "20260424160000_leads_linkedin_url_partial_unique.sql"
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

# --- Argumente --------------------------------------------------------------

DRY_RUN=true
if [[ "${1:-}" == "--confirm" ]]; then
  DRY_RUN=false
fi

# --- Sanity-Checks ----------------------------------------------------------

if [[ ! -d "supabase/migrations" ]]; then
  echo "ERROR: bitte aus llr-dashboard repo-root ausführen (kein supabase/migrations/ gefunden)"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git nicht im PATH"
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
  echo "ERROR: nicht auf develop (aktuell: '$CURRENT_BRANCH')"
  echo "       checkout develop und git pull, dann nochmal."
  exit 1
fi

# --- Plan ausgeben ----------------------------------------------------------

echo ""
echo "============================================================"
echo "  Leadesk Cutover — Phase 1+2"
if $DRY_RUN; then
  echo "  Modus: DRY RUN (zeigt Plan, ändert nichts)"
else
  echo "  Modus: LIVE (führt destruktive Operationen aus)"
fi
echo "============================================================"
echo ""
echo "Ziel:           $PROD_DB_HOST → docker exec $PROD_CONTAINER"
echo "DB:             $DB_USER@$DB_NAME"
echo "Backup-Pfad:    $BACKUP_PATH (auf prod-db-01)"
echo "Migrations:     ${#MIGRATIONS[@]} Stück"
echo ""

# --- Migration-Files lokal verifizieren ------------------------------------

echo "==> Prüfe lokale Migration-Files:"
MISSING=0
for m in "${MIGRATIONS[@]}"; do
  if [[ -f "supabase/migrations/$m" ]]; then
    echo "  ✓ $m"
  else
    echo "  ✗ FEHLT: supabase/migrations/$m"
    MISSING=$((MISSING+1))
  fi
done
if [[ $MISSING -gt 0 ]]; then
  echo ""
  echo "ERROR: $MISSING Migration(s) fehlen lokal. Erst git pull, dann nochmal."
  exit 1
fi
echo ""

if $DRY_RUN; then
  echo "==> Dry-Run abgeschlossen. Alles bereit."
  echo "==> Zum Ausführen: bash scripts/cutover-phase-1-2.sh --confirm"
  echo ""
  exit 0
fi

# --- LIVE: Letzte Bestätigung ----------------------------------------------

echo "============================================================"
echo "  ACHTUNG — destruktive Operationen folgen:"
echo "  - pg_dump-Backup auf prod-db-01"
echo "  - TRUNCATE aller public.*-Tabellen auf prod-db-01"
echo "  - 14 Migrations applien"
echo "============================================================"
echo ""
read -r -p "Tippe 'cutover' zum Bestätigen: " CONFIRM
if [[ "$CONFIRM" != "cutover" ]]; then
  echo "Abgebrochen."
  exit 1
fi
echo ""

# --- Phase 1.1: Backup ------------------------------------------------------

echo "==> [1/3] Phase 1.1 — pg_dump-Backup"
ssh "$PROD_DB_HOST" "docker exec $PROD_CONTAINER pg_dump -U $DB_USER -d $DB_NAME -n public > $BACKUP_PATH && wc -l $BACKUP_PATH"
echo "  ✓ Backup: $PROD_DB_HOST:$BACKUP_PATH"
echo ""

# --- Phase 1.2: TRUNCATE ----------------------------------------------------

echo "==> [2/3] Phase 1.2 — TRUNCATE public.* (CASCADE)"
ssh "$PROD_DB_HOST" "docker exec -i $PROD_CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1" <<'SQL'
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public') LOOP
    EXECUTE 'TRUNCATE TABLE public.'||quote_ident(r.tablename)||' CASCADE';
  END LOOP;
END $$;
SQL
echo "  ✓ public.* leer"
echo ""

# --- Phase 2: 14 Migrations -------------------------------------------------

echo "==> [3/3] Phase 2 — Migrations applien"
echo ""
for i in "${!MIGRATIONS[@]}"; do
  m="${MIGRATIONS[$i]}"
  num=$((i+1))
  printf "  [%2d/14] %s ... " "$num" "$m"
  cat "supabase/migrations/$m" \
    | ssh "$PROD_DB_HOST" "docker exec -i $PROD_CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -q" \
    > /tmp/cutover-out-$$.log 2>&1 \
    && echo "✓" \
    || { echo "✗ FEHLER"; cat /tmp/cutover-out-$$.log; rm -f /tmp/cutover-out-$$.log; exit 1; }
  rm -f /tmp/cutover-out-$$.log
done
echo ""

# --- Verifikation -----------------------------------------------------------

echo "==> Verifikation — alle erwarteten Strukturen müssen 't' sein:"
ssh "$PROD_DB_HOST" "docker exec $PROD_CONTAINER psql -U $DB_USER -d $DB_NAME" <<'SQL'
\x on
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='default_ai_model') AS multi_provider_ai,
  EXISTS(SELECT 1 FROM information_schema.tables  WHERE table_name='accounts'         AND table_schema='public') AS accounts,
  EXISTS(SELECT 1 FROM information_schema.tables  WHERE table_name='user_preferences' AND table_schema='public') AS user_preferences,
  EXISTS(SELECT 1 FROM information_schema.tables  WHERE table_name='admin_audit_log'  AND table_schema='public') AS admin_audit_log,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_accounts_admin_list')   AS rpc_admin_list,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_trial_dashboard_stats') AS rpc_trial_stats,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='update_account_with_audit') AS rpc_update_account,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='plans'    AND column_name='price_monthly') AS plans_harmonized,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='plans'    AND column_name='modules')       AS plan_modules,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_my_entitlements')       AS rpc_entitlements;
SQL

echo ""
echo "============================================================"
echo "  Phase 1+2 abgeschlossen."
echo "  Backup:  $PROD_DB_HOST:$BACKUP_PATH"
echo "  Schema:  Hetzner-Prod auf develop-Stand"
echo "  Daten:   leer (auth.users + alle public.*-Tabellen)"
echo ""
echo "  Nächster Schritt: Phase 3 (Plans seeden) — separater Lauf."
echo "============================================================"
