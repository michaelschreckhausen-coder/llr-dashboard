#!/usr/bin/env bash
#
# promote.sh — develop sauber pushen und gezielt nach main promoten.
# -----------------------------------------------------------------------------
# Behebt die wiederkehrende develop/main-Drift: Der develop-Push schlägt oft fehl,
# weil das Remote weiter ist (Julian o.ä.). Dieses Skript macht IMMER zuerst
# pull --rebase, pusht develop, und übernimmt dann gezielt Dateien per
# `git checkout develop -- <files>` auf main (konfliktfrei, file-scoped).
#
# Nutzung:
#   scripts/promote.sh "Commit-Message" pfad/zu/datei1 [pfad/zu/datei2 ...]
#       → committet die genannten Dateien auf develop (falls noch uncommitted),
#         pusht develop, und promotet exakt diese Dateien auf main.
#
#   scripts/promote.sh --develop-only "Commit-Message" [files...]
#       → nur develop committen+pushen, kein main.
#
#   scripts/promote.sh --main-only "Commit-Message" file1 [file2 ...]
#       → nur die Dateien (aus dem aktuellen develop-Stand) nach main promoten.
#
# Sicherheits-Hinweis: berührt NUR develop und main, keine Prod-DB, kein force-push.
set -euo pipefail

err() { printf '\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()  { printf '\033[0;32m✓ %s\033[0m\n' "$*"; }
info(){ printf '\033[0;34m→ %s\033[0m\n' "$*"; }

[ -d .git ] || err "Bitte im Repo-Root ausführen (kein .git gefunden)."

MODE="both"
case "${1:-}" in
  --develop-only) MODE="develop"; shift ;;
  --main-only)    MODE="main";    shift ;;
esac

MSG="${1:-}"; shift || true
FILES=("$@")
[ -n "$MSG" ] || err "Commit-Message fehlt. Beispiel: scripts/promote.sh \"fix: xyz\" src/foo.jsx"

push_develop() {
  info "Wechsle auf develop"
  git checkout develop
  # Uncommitted Änderungen an den genannten Dateien (oder alle) committen
  if ! git diff --quiet || ! git diff --cached --quiet; then
    if [ "${#FILES[@]}" -gt 0 ]; then git add -- "${FILES[@]}"; else git add -A; fi
    git commit -m "$MSG" || info "Nichts zu committen"
  fi
  info "Rebase auf origin/develop + Push"
  git pull --rebase origin develop
  git push origin develop
  ok "develop gepusht"
}

promote_main() {
  [ "${#FILES[@]}" -gt 0 ] || err "Für main musst du die zu promotenden Dateien angeben."
  info "Wechsle auf main + pull"
  git checkout main
  git pull origin main
  info "Übernehme Dateien aus develop: ${FILES[*]}"
  git checkout develop -- "${FILES[@]}"
  if git diff --cached --quiet && git diff --quiet; then
    info "main bereits aktuell — nichts zu promoten"
  else
    git add -- "${FILES[@]}"
    git commit -m "$MSG"
    git push origin main
    ok "main gepusht (Prod-Deploy startet)"
  fi
  git checkout develop
}

case "$MODE" in
  develop) push_develop ;;
  main)    promote_main ;;
  both)    push_develop; promote_main ;;
esac

ok "Fertig."
