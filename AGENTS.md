# AGENTS.md — Leadesk (kanonischer Einstieg)

> **Diese Datei lesen beide:** Claude Code (Terminal, Michael) **und** Cowork (Julian). Sie ist der *eine* Einstieg. Details stehen in verlinkten Dokumenten, nicht hier. Wenn etwas hier im Widerspruch zu einer anderen Quelle steht, gilt: **AGENTS.md + `docs/STATUS.md` + `app.leadesk.de/admin-docs`** (live) zuerst.

Leadesk = Multi-Tenant-LinkedIn-Suite (Web-App + Chrome Extension), SaaS mit Whitelabel. React 18 + Vite (JSX, **kein TS, nur Inline-Styles**), Supabase **self-hosted auf Hetzner** (Prod + Staging), Vercel-Hosting.

---

## Bootstrap-Protokoll (jede Session)

**VOR der Arbeit:**
1. `git pull` (aktuellen Stand holen).
2. `docs/STATUS.md` lesen — was ist gerade live / in Arbeit.
3. WIP-Registry prüfen (sobald live, Phase 2): arbeitet der/die andere gerade im selben Bereich? → **warnen, nicht blind weitermachen.** Bis dahin: kurz im Changelog schauen, was zuletzt geändert wurde.
4. Das themenrelevante Detaildoc lesen (siehe Karte unten).
5. Eigenen WIP-Eintrag setzen (sobald live).

**NACH der Arbeit:**
1. **Code + Doku im selben Zug ändern** — das ist die Definition of Done. Wer Verhalten/Schema/CI ändert, zieht das passende Doc mit.
2. Changelog-Eintrag + ggf. `docs/STATUS.md` aktualisieren.
3. WIP-Eintrag räumen.

---

## Hard Rules (Kurzfassung — Details in CLAUDE.md)

- **Branches:** Standard = Feature-Branch oder `develop` → Staging testen. **Nie `main` ohne explizite Freigabe** (main = Prod-Deploy). Freigaben gelten pro Change, nicht pauschal.
- **Kurze Branches:** Feature-Branches max. 1–2 Tage, schnell zurück — verhindert die main↔develop-Divergenz.
- **Multi-Tenant:** jede Query, die Nutzerdaten liest, **explizit team-scopen** — nie nur auf RLS verlassen. Regeln: `docs/SCOPING.md`.
- **Styling/CI:** nur Inline-Styles; neue Buttons/Dropdowns über die `lk-*`-Klassen (Inline kann kein `:hover`). Regeln: `docs/DESIGN-SYSTEM.md`.
- **DB:** Migrationen idempotent, **erst Staging, dann Prod**, neue Tabellen brauchen `authenticated`-Grants + RLS.
- **Destruktiv** (DROP/DELETE/rm -rf/force-push/Container-Stop): **immer vorher rückfragen** — auch mit SSH-Zugang.
- **Secrets** nie committen (`.claude_ssh_key`, `docker-compose.override.yml` sind bewusst nicht im Repo).

## Detaildoc-Karte

| Ich arbeite an … | lies zuerst |
|---|---|
| Stand/Environments/„was ist live" | `docs/STATUS.md` |
| Nutzerdaten, Teams, Brands, Isolation | `docs/SCOPING.md` ⭐ |
| UI, Farben, Buttons, Dropdowns, CI | `docs/DESIGN-SYSTEM.md` ⭐ |
| Zusammenarbeit, Branches, WIP, Changelog | `docs/WORKING-AGREEMENT.md` |
| Architektur/Feature-Konzepte | `docs/architecture/*.md` |
| Hard Rules + alle 16 Fallstricke + Historie | `CLAUDE.md` (Detail-Anhang) |
| **Schema/Routen live** | `app.leadesk.de/admin-docs` |
| **Release-Historie live** | `admin.leadesk.de/changelog` |

## Infra-Kurzreferenz

- **Prod:** Hetzner `prod-db-01` `128.140.123.163`, API `supabase.leadesk.de`, App `app.leadesk.de` (Branch `main`).
- **Staging:** Hetzner `staging-db-01` `178.104.210.216`, API `supabase-staging.leadesk.de`, App `staging.leadesk.de` (Branch `develop`).
- **App-Server (Caddy→Kong, Prod+Staging):** `138.199.163.189`.
- ⚠️ Alte Supabase-**Cloud** (`jdhajqpgfrsuoluaesjn`) ist **abgeschaltet** — nicht mehr verwenden.
- SQL: `ssh root@IP 'docker exec -i supabase-db psql -U postgres -d postgres'`.
