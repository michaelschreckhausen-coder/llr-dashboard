# Handover an Michael — Doku-/Prozess-Konsolidierung (Branch `docs/foundation`)

*Von Julians Cowork-Session, 15.07.2026. Bitte auf dem Branch reviewen, bevor er nach `main` geht.*

## Warum
Wir hatten **drei überlappende, teils widersprüchliche Wissensquellen**: das Cowork-Projektfeld (lädt Julians Session), die repo `CLAUDE.md` (lädt deine Claude-Code-Session) und Julians Projekt-Gedächtnis. Sie liefen auseinander — u.a. nannte `CLAUDE.md` als **Produktion noch die abgeschaltete Supabase-Cloud** (`jdhajqpgfrsuoluaesjn`). Ein Claude Code, der das ernst nimmt, hätte eine Migration gegen die tote DB fahren können. Ziel dieses Branches: **eine kanonische Quelle**, die beide Tools lesen.

## Was ich geändert habe (alles auf `docs/foundation`, nichts auf main)
- **Neu `AGENTS.md`** (Repo-Root, ~54 Z.): schlanker, tool-neutraler Einstieg (Claude Code *und* Cowork lesen `AGENTS.md`). Enthält Bootstrap-Protokoll, Hard-Rules-Kurzfassung, Detaildoc-Karte, Infra-Kurzreferenz.
- **Neu `docs/STATUS.md`**: Ist-Zustand (Environments Hetzner Prod+Staging, main↔develop-Divergenz, was zuletzt live ging, offene Punkte).
- **Neu `docs/SCOPING.md`** ⭐: die Team-Isolation-Regel (explizit team-scopen, Solo-Fallback, Cache-Keys, `_shared/tenant.ts`, by-id-Writes) — kodifiziert den 10.07.-Vorfall.
- **Neu `docs/DESIGN-SYSTEM.md`** ⭐: die CI (Tokens, `lk-*`-Klassen, Verlauf-nur-für-CTA, ruhige Hover, Dropdown-Look) + Codemod-Fallstricke.
- **Neu `docs/WORKING-AGREEMENT.md`**: Branches (kurze Feature-Branches), Definition of Done (Code+Doku zusammen), WIP-Registry (geplant), Commit-Konventionen.
- **`CLAUDE.md` chirurgisch gepatcht** (NICHT ausgeweidet): (1) Zeiger auf `AGENTS.md` oben rein; (2) Tech-Stack-Prod von toter Cloud → Hetzner `prod-db-01`; (3) „Migration auf Prod (Cloud)" → Hetzner-SSH. Rest unangetastet.

## Was noch offen ist / worüber wir entscheiden sollten
1. **`CLAUDE.md` verschlanken:** die lange Release-*Historie* (Zeilen ~455–1046) gehört ins Changelog, nicht in die dauerhafte Referenz. Wollen wir die rausziehen? (Ich hab sie bewusst noch nicht angefasst — dein Terrain.)
2. **WIP-Registry** (`dev_wip`-Tabelle + Ansicht in `admin.leadesk.de`): das ist deine Infra. Wenn OK, baue ich Migration + Admin-View in Phase 2.
3. **Cowork-Projektfeld** auf „lies/pflege `/docs`" schrumpfen (damit es nicht wieder eine 4. Quelle wird) — mache ich, sobald `AGENTS.md` gemerged ist.
4. **Branch-Konvention** (kurze Feature-Branches) als verbindliche Team-Regel — ziehst du mit?

## Bitte
Branch `docs/foundation` reviewen. Wenn passt: mergen. Danach ist `AGENTS.md` der Einstieg für beide, und wir pflegen Wissen nur noch dort + in `docs/*`.
