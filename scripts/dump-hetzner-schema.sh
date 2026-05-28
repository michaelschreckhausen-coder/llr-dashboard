#!/usr/bin/env bash
#
# scripts/dump-hetzner-schema.sh
#
# Generiert scripts/hetzner-schema-snapshot.json aus Hetzner-Prod-DB.
# Wird von scripts/schema-check.js gelesen um SELECT-Calls zu validieren.
#
# Vom lokalen Mac aus ausführen (Claude hat keinen SSH-Outbound im Sandbox).
# Nach jeder Migration die Schema-Cols ändert: re-run.
#
# Usage:
#   bash scripts/dump-hetzner-schema.sh          # Prod
#   PROD=0 bash scripts/dump-hetzner-schema.sh   # Staging
#
# Exit-Code: 0 = OK, sonst SSH/psql-Error

set -euo pipefail

PROD="${PROD:-1}"
if [ "$PROD" = "1" ]; then
  HOST="root@128.140.123.163"
  ENV_LABEL="prod"
else
  HOST="root@178.104.210.216"
  ENV_LABEL="staging"
fi

OUT="$(dirname "$0")/hetzner-schema-snapshot.json"

echo "→ Dumping Hetzner $ENV_LABEL schema from $HOST ..."

# COPY (...) TO STDOUT mit JSON-Aggregation. Schema = public, nur tatsächliche Tabellen
# (information_schema lässt Views + Materialized Views automatisch drin — das ist OK,
# weil PostgREST kann auch Views via .from() lesen).
ssh "$HOST" "docker exec -i supabase-db psql -U supabase_admin -d postgres -t -A -c \"
  SELECT json_agg(t ORDER BY t.table_name, t.column_name)
  FROM (
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  ) t
\"" > "$OUT.tmp"

# Cleanup whitespace + validate JSON
node -e "
  const fs = require('fs');
  const raw = fs.readFileSync('$OUT.tmp', 'utf8').trim();
  const data = JSON.parse(raw);
  fs.writeFileSync('$OUT', JSON.stringify(data, null, 0));
  console.log('  ✓ Snapshot: ' + data.length + ' (table, column) pairs');
" && rm "$OUT.tmp"

echo "  → $OUT (env=$ENV_LABEL)"
echo ""
echo "Next: node scripts/schema-check.js"
