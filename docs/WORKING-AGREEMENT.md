# WORKING-AGREEMENT.md — Zusammenarbeit (Julian & Michael)

> Zwei Entwickler, ein Codebase, zwei Arbeitsweisen (Julian: Cowork · Michael: Claude Code im Terminal). Beide gleichberechtigt (`is_leadesk_admin`, SSH überall, dürfen überall arbeiten). Koordination läuft **nicht** über Rechte, sondern über die folgenden Absprachen.

## Branches

- **Kurze Feature-Branches** (max. 1–2 Tage), Namensschema `feat/…`, `fix/…`, `docs/…`, `ux/…`. Schnell zurück nach `develop`/`main` — damit die main↔develop-Divergenz nicht wieder wächst.
- Echter Kleinkram darf nach WIP-Check main-/develop-direkt.
- **`main` = Prod.** Push/Merge auf `main` **nur mit expliziter Freigabe** pro Change (gilt nicht pauschal für Folge-Changes).
- Vor jedem Commit: `git branch --show-current` prüfen.

## Definition of Done

Eine Änderung ist erst fertig, wenn:
1. Code **und** betroffene Doku im selben Zug aktualisiert sind (STATUS/SCOPING/DESIGN-SYSTEM/architecture je nach Thema).
2. Auf Staging getestet + Browser-Konsole fehlerfrei (bei DB-Änderungen: Migration idempotent, erst Staging).
3. Changelog-Eintrag geschrieben (User-facing Sprache).

## WIP-Registry (geplant, Phase 2 — mit Michael)

Ziel: Echtzeit-„wer macht gerade was". Umsetzung: Supabase-Tabelle `dev_wip` (wer, Bereich, Branch, seit wann) + Ansicht in `admin.leadesk.de`. Agent setzt/räumt Einträge je Session und **warnt bei Überschneidung**. Bis das steht: vor Arbeit kurz Changelog + `git log` prüfen, ob der/die andere denselben Bereich angefasst hat.

## Konfliktvermeidung (bis WIP live ist)

1. Vor Arbeit: Changelog lesen — was hat der/die andere zuletzt geändert?
2. Hat der/die andere kürzlich dieselbe Datei angefasst? → im Chat/Commit-Message ansprechen, nicht drüberbügeln.
3. Immer aktuellste Version vom richtigen Branch holen — nie aus dem Gedächtnis arbeiten.

## Commit-Konventionen

`feat:` / `fix:` / `docs:` / `ux:` / `refactor:` — Präfix pflicht. Autonome Cowork-Sessions committen als `Claude (Session) <claude-session@leadesk.de>` (pusher = Entwickler-Account), damit in der History erkennbar.

## Doku-Pflege

- `AGENTS.md` = Einstieg, schlank halten (<~150 Z.), nur Verweise + Kernregeln.
- Dauerhaftes Wissen → das passende `docs/*`-Doc. Entscheidungen mit Tragweite → `docs/decisions/NNNN-*.md` (ADR, kurz).
- Release-*Historie* gehört ins Changelog, nicht in die Referenzdocs.
