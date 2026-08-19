#!/usr/bin/env bash
#
# promote.sh — develop sauber pushen und gezielt nach main promoten.
# -----------------------------------------------------------------------------
# Behebt die wiederkehrende develop/main-Drift: Der develop-Push schlägt oft fehl,
# weil das Remote weiter ist (Julian o.ä.). Dieses Skript macht IMMER zuerst
# pull --rebase, pusht develop, und übernimmt dann gezielt Dateien per
# `git checkout origin/develop -- <files>` auf main (konfliktfrei, file-scoped).
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
#       → nur die Dateien nach main promoten. Quelle ist **origin/develop** (der
#         Remote-Stand), NICHT der lokale develop-Branch. Fehlt eine der Dateien in
#         origin/develop, bricht das Skript ab BEVOR es auf main wechselt — es
#         entsteht also kein halber Zustand.
#       → Läuft auch aus einem git-worktree. Ist main dort in einem anderen Worktree
#         ausgecheckt, sagt das Skript das und nennt den Ausweg (eigener Worktree).
#
# Sicherheits-Hinweis: berührt NUR develop und main, keine Prod-DB, kein force-push.
set -euo pipefail

err() { printf '\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()  { printf '\033[0;32m✓ %s\033[0m\n' "$*"; }
info(){ printf '\033[0;34m→ %s\033[0m\n' "$*"; }

# NICHT [ -d .git ] prüfen: in einem git-worktree ist .git eine DATEI, nicht ein Verzeichnis —
# das Skript hat dort bisher sofort mit „kein .git gefunden" abgebrochen, obwohl alles in Ordnung
# war (2026-08-18 aufgefallen, als der Promote aus einem Worktree laufen sollte).
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || err "Kein Git-Repo — bitte im Repo oder in einem Worktree ausführen."
cd "$ROOT"

MODE="both"
case "${1:-}" in
  --develop-only) MODE="develop"; shift ;;
  --main-only)    MODE="main";    shift ;;
esac

MSG="${1:-}"; shift || true
FILES=("$@")
[ -n "$MSG" ] || err "Commit-Message fehlt. Beispiel: scripts/promote.sh \"fix: xyz\" src/foo.jsx"

# Startpunkt merken, damit wir am Ende dorthin zurückkehren statt blind auf develop zu
# springen — in einem Worktree ist develop oft gar nicht auscheckbar (siehe promote_main).
START_REF="$(git symbolic-ref --quiet --short HEAD || git rev-parse HEAD)"
restore_start() { git checkout --quiet "$START_REF" 2>/dev/null || info "Bleibe auf $(git rev-parse --abbrev-ref HEAD)"; }

push_develop() {
  info "Wechsle auf develop"
  git checkout develop || err "Kann nicht auf develop wechseln (anderer Worktree? dirty tree?). Für einen reinen Prod-Promote: scripts/promote.sh --main-only \"msg\" <dateien>"
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
  info "Fetch origin (develop + main)"
  git fetch origin develop main

  # Quelle ist IMMER origin/develop, NIE der lokale develop-Branch.
  # 2026-08-18 gelernt: der lokale develop lag auf einem Stand vom 14.07., die zu
  # promotenden Migrations-Dateien existierten dort nicht. Bei `git checkout develop -- …`
  # heißt das im besten Fall Abbruch (fehlende Datei), im schlechtesten still den Juli-Stand
  # einer vorhandenen Datei nach Prod. Deshalb: Remote-Stand als Quelle + Vorab-Prüfung.
  local missing=""
  for f in "${FILES[@]}"; do
    git cat-file -e "origin/develop:$f" 2>/dev/null || missing="$missing $f"
  done
  [ -z "$missing" ] || err "Nicht in origin/develop vorhanden:$missing — erst develop pushen oder Pfad prüfen."

  info "Wechsle auf main + pull"
  git checkout main || err "Kann nicht auf main wechseln (anderer Worktree? dirty tree?). Dann in einem eigenen Worktree arbeiten: git worktree add ../wt-prod-main origin/main"
  git pull origin main

  info "Übernehme Dateien aus origin/develop: ${FILES[*]}"
  git checkout origin/develop -- "${FILES[@]}"
  if git diff --cached --quiet && git diff --quiet; then
    info "main bereits aktuell — nichts zu promoten"
  else
    git add -- "${FILES[@]}"
    git commit -m "$MSG"
    git push origin main
    ok "main gepusht (Prod-Deploy startet)"
  fi
  restore_start
}

case "$MODE" in
  develop) push_develop ;;
  main)    promote_main ;;
  both)    push_develop; promote_main ;;
esac

ok "Fertig."
