#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Wendet NEU hinzugekommene SQL-Migrationen auf einen Hetzner-Supabase-Stack an.
# Läuft im GitHub-Actions-Runner. Erwartet einen SSH-Key unter ~/.ssh/deploy_key.
#
# Env:
#   HOST      Ziel-IP (Staging oder Prod)
#   ENVLABEL  STAGING | PROD (nur für Logs)
#   BEFORE    git SHA vor dem Push (github.event.before)
#   AFTER     git SHA nach dem Push (github.sha)
#
# Es werden nur Dateien angewandt, die in diesem Push NEU dazugekommen sind
# (diff-filter=A), in Dateinamen-Reihenfolge = chronologisch (Timestamp-Präfix).
# Migrationen sind per Konvention idempotent (CREATE … IF NOT EXISTS etc.).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HOST="${HOST:?HOST fehlt}"
ENVLABEL="${ENVLABEL:-?}"
BEFORE="${BEFORE:-}"
AFTER="${AFTER:?AFTER fehlt}"

# Neue Migrationsdateien ermitteln
if [ -z "$BEFORE" ] || [ "$BEFORE" = "0000000000000000000000000000000000000000" ]; then
  FILES=$(git diff-tree --no-commit-id --name-only -r "$AFTER" | grep '^supabase/migrations/.*\.sql$' || true)
else
  FILES=$(git diff --name-only --diff-filter=A "$BEFORE" "$AFTER" -- 'supabase/migrations/*.sql' || true)
fi
FILES=$(printf '%s\n' "$FILES" | grep -v '^$' | sort || true)

if [ -z "$FILES" ]; then
  echo "Keine neuen Migrationen in diesem Push — nichts zu tun."
  exit 0
fi

echo "Ziel: $ENVLABEL ($HOST)"
echo "Neue Migrationen:"
printf '  %s\n' $FILES

ssh-keyscan -H "$HOST" >> ~/.ssh/known_hosts 2>/dev/null || true
SSH="ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=accept-new root@$HOST"

while IFS= read -r f; do
  [ -z "$f" ] && continue
  echo "→ wende an: $f"
  $SSH "docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1" < "$f"
done <<< "$FILES"

echo "→ PostgREST Schema-Cache neu laden"
$SSH "docker exec -i supabase-db psql -U supabase_admin -d postgres -c \"NOTIFY pgrst, 'reload schema';\""

echo "✓ Fertig ($ENVLABEL)."
