# Anweisung für Michaels Claude Code — Prozess-Fundament reviewen & mergen

*Michael: diesen Text einfach an deinen Claude Code geben. Julians Cowork-Session hat auf dem Branch `docs/foundation` ein Doku-/Prozess-Fundament gebaut (reines Markdown, kein Code) und die veraltete/gefährliche Prod-Angabe in `CLAUDE.md` gefixt. Bitte reviewen und, wenn ok, mergen.*

---

## Kontext (warum das gemacht wurde)
Es gab drei auseinanderlaufende Wissensquellen: das Cowork-Projektfeld (Julians Session), die repo `CLAUDE.md` (deine Claude-Code-Session) und Julians Projekt-Gedächtnis. `CLAUDE.md` nannte als **Produktion noch die abgeschaltete Supabase-Cloud** `jdhajqpgfrsuoluaesjn` — riskant, weil eine Migration gegen die tote DB laufen könnte. Ziel: **eine kanonische Quelle** (`AGENTS.md`), die beide Tools lesen.

## Aufgabe 1 — Branch holen und Diff ansehen
```bash
git fetch origin
git checkout docs/foundation
git log --oneline -1
git diff --stat main...docs/foundation
```
Erwartet: 6 neue Dateien (`AGENTS.md`, `docs/STATUS.md`, `docs/SCOPING.md`, `docs/DESIGN-SYSTEM.md`, `docs/WORKING-AGREEMENT.md`, `docs/HANDOVER_Michael_Prozess.md`, plus diese Anweisung) und **eine** geänderte Datei: `CLAUDE.md`.

## Aufgabe 2 — Die CLAUDE.md-Änderung prüfen (der einzige Nicht-Neu-Diff)
```bash
git diff main...docs/foundation -- CLAUDE.md
```
Es sind bewusst nur **drei chirurgische** Änderungen, sonst nichts angetastet:
1. Zeiger-Header oben: „Kanonischer Einstieg ist jetzt AGENTS.md".
2. Tech-Stack Prod: Supabase-Cloud `jdhajqpgfrsuoluaesjn` → Hetzner `prod-db-01` (`128.140.123.163`, API `supabase.leadesk.de`) + Warnhinweis, dass die Cloud abgeschaltet ist.
3. „Migration auf Prod anwenden (Cloud)" → „(Hetzner)" mit SSH-Befehl auf `128.140.123.163`.

Bitte gegenchecken, dass die Prod-Angaben deinem Stand entsprechen (Hetzner prod-db-01 = 128.140.123.163). Wenn eine IP/URL abweicht: korrigieren, bevor gemergt wird.

## Aufgabe 3 — Kurz-Review der neuen Docs
- `AGENTS.md` — schlanker Einstieg (Bootstrap-Protokoll, Hard-Rules-Kurzfassung, Detaildoc-Karte, Infra). Prüfen, ob die Hard Rules zu eurer gelebten Praxis passen (v.a. Branch-Regeln).
- `docs/STATUS.md` — Ist-Zustand. Falls etwas nicht stimmt (was gerade live/in Arbeit ist), anpassen.
- `docs/SCOPING.md` / `docs/DESIGN-SYSTEM.md` — die zwei inhaltlichen Kern-Docs (Team-Isolation bzw. CI). Fachlich gegenlesen.
- `docs/WORKING-AGREEMENT.md` — Branch-/DoD-/WIP-Absprachen.

## Aufgabe 4 — Mergen (nach OK)
Reine Doku, keine Build-Auswirkung. Merge nach `main`:
```bash
git checkout main && git pull
git merge --no-ff docs/foundation -m "docs: Prozess-Fundament (AGENTS.md + docs/*) + CLAUDE.md Prod-Fix"
git push origin main
```
Damit `AGENTS.md` auch auf `develop` liegt (sonst driftet's sofort wieder), zusätzlich:
```bash
git checkout develop && git pull
git merge --no-ff docs/foundation -m "docs: Prozess-Fundament nach develop ziehen"
git push origin develop
```
> Hinweis: Der Merge auf `main` triggert einen Vercel-Prod-Deploy. Da nur `.md`-Dateien betroffen sind, ändert sich an der App nichts — der Build ist identisch. Trotzdem kurz den Deploy grün abwarten.

## Aufgabe 5 — Danach an Julian zurückmelden
Eine Zeile: „docs/foundation gemergt, AGENTS.md ist jetzt der Einstieg." Dann macht Julians Session die Folgeschritte (Cowork-Projektfeld auf „lies /docs" schrumpfen).

---

## Offene Punkte, die DU (mit Michael) entscheiden solltest — nicht auto-ausführen
1. **`CLAUDE.md` verschlanken:** Die lange Release-*Historie* (ca. Zeilen 455–1046) gehört ins Changelog, nicht in die Dauer-Referenz. Vorschlag: rausziehen und durch einen Verweis aufs Changelog ersetzen. **Erst nach Michaels OK.**
2. **WIP-Registry** (`dev_wip`-Tabelle + Ansicht in `admin.leadesk.de`): „wer arbeitet gerade woran". Wenn gewünscht, als eigener Sprint (Migration erst Staging, dann Prod).
3. **Branch-Konvention** (kurze Feature-Branches) als verbindliche Team-Regel bestätigen — steht in `docs/WORKING-AGREEMENT.md`.

Bei keiner dieser Aufgaben etwas Destruktives ohne Rückfrage an Michael.
