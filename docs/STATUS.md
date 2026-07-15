# STATUS.md — Ist-Zustand (Momentaufnahme)

> Gegenstück zum Changelog (der die *Historie* führt). Hier steht, **wie es JETZT ist**. Bei jeder größeren Änderung mitpflegen. Live-Wahrheit für Schema/Routen bleibt `app.leadesk.de/admin-docs`.

**Stand:** 2026-07-15

## Environments

| | Prod | Staging |
|---|---|---|
| App | `app.leadesk.de` (Branch `main`) | `staging.leadesk.de` (Branch `develop`) |
| Supabase (self-hosted Hetzner) | `prod-db-01` `128.140.123.163`, API `supabase.leadesk.de` | `staging-db-01` `178.104.210.216`, API `supabase-staging.leadesk.de` |
| App-Server (Caddy→Kong) | `138.199.163.189` (gemeinsam) | `138.199.163.189` |

Prod und Staging haben **getrennte Datenbanken** — Prod-Daten sind auf Staging nicht vorhanden.
⚠️ Alte Supabase-Cloud (`jdhajqpgfrsuoluaesjn`, Cloud-Staging `swljvgmnxomvcevoupgg`) sind **abgeschaltet**.

## Branch-Realität (wichtig)

`main` und `develop` sind **stark divergiert** (Feature-Entwicklung auf `develop`, CI-Rollout selektiv per Cherry-Pick auf `main`). Deshalb:
- Kein blinder `develop → main`-Merge.
- CI-/Style-Änderungen: erst `develop`, dann gezielt nach `main` cherry-picken.
- Ziel (Working-Agreement): kurze Feature-Branches, um die Divergenz künftig kleinzuhalten.

## Zuletzt live (Highlights)

- **CI-Rollout** (leadesk.de-CI in der App): Inter self-hosted, Navy-Primary + Cyan-Akzent + Verlaufs-CTA, `lk-*`-Klassen, ruhige Hover. Live Prod (13.07., `main c43e83e7`). Details: `docs/DESIGN-SYSTEM.md`.
- **Team-Isolation-Fixes** (Leadly-Briefing + Security-EFs): explizites Team-Scoping, `_shared/tenant.ts`. Live Prod. Details: `docs/SCOPING.md`.
- **Rechtstexte** (Impressum/Datenschutz/AGB/AV-Vertrag): live auf `leadesk.de` (Marketing-Repo `leadesk-marketing`, separat vom App-Repo).

## Bekannte offene Punkte

- `admin.leadesk.de/changelog` ist read-only (Edit-UI nicht migriert) → Changelog-Einträge aktuell per SQL-Insert auf prod-db.
- `develop` läuft der Feature-Arbeit voraus; `main` = Prod-Features + CI.
- WIP-Registry (dev_wip + Admin-View) noch nicht gebaut (Working-Agreement Phase 2).
- Backups Hetzner: noch nicht final eingerichtet (TODO).

## Getrennte Repos

- **App:** `llr-dashboard` (dieses Repo) → `app.leadesk.de` / `staging.leadesk.de`.
- **Admin:** `leadesk-admin` → `admin.leadesk.de`.
- **Marketing:** `leadesk-marketing` → `leadesk.de` (statisch, git-deployt; hier liegen Impressum/Datenschutz/AGB/AV-Vertrag).
