# Phase 5 — Streich-Entscheidungen + offene Architektur-Q

**Stand:** 2026-05-03 abend
**Basis:** `PHASE_5_DISCOVERY.md` (gleiches Verzeichnis)

---

## Surface-Entscheidungen (final)

| Surface | Entscheidung |
|---|---|
| AdminTenants | **Streichen** (tenants=0 Live-Rows, Konzept durch accounts abgelöst) |
| AdminPanel-Tabs | **Streichen** (Lizenzen-Tab + Teams-Tab; licenses=0 Live-Rows) |
| WhiteLabel | **Port nach admin.leadesk.de** (später) |
| AdminDocs | **Port nach admin.leadesk.de** (später) |
| AdminLogs | **Port nach admin.leadesk.de** als Top-Level-Surface (später) |
| AdminUsers | **Port nach admin.leadesk.de** — Member-Name-Edit + Pwd-Reset (sec-krit, morgen) |
| AdminPlans | **Port nach admin.leadesk.de** — Plans-Editor (CRUD) |

---

## Konsequenz für heute Abend (Phase 5A)

- Branch `feat/phase-5a-route-disable` (von `main`, nicht `develop`).
- Route-Guard in `App.jsx`: `get_my_role()`-Aufruf auskommentiert, role hardcoded auf `'user'`, alle 7 `/admin*`-Routes auskommentiert.
- Sidebar in `Layout.jsx`: `{isAdmin && (<>…</>)}`-Block deaktiviert via `false &&` short-circuit + Erklär-Comment.
- **Page-Files bleiben liegen** (reversibel falls Streich-Calls morgen revidiert werden).
- **Keine DB-Änderung, keine sec-krit RPC, kein File-Delete.**

---

## Offen für morgen

### Architektur-Q1: License-RPC v2

`admin_grant_license` (Legacy) ist User-zentrisch und schreibt sowohl `profiles.plan_expires_at` als auch `subscriptions.current_period_end` (Doppel-Schreibung). SoT-Klärung steht aus.

**Optionen:**
- (a) Account-zentrische `admin_grant_license_v2` analog Sub-4.3 (Audit-Pattern, schreibt `subscriptions` als alleinige SoT)
- (b) Legacy-RPC behalten, nur Frontend-Caller anpassen
- (c) Stripe-Sync mit-bedenken — kommt License-Grant via Stripe-Webhook auch an?

Siehe Discovery-Block „License-Grant-RPC v2".

### Architektur-Q2: CRM-Delete-Verhalten beim Port

`AdminUsers.jsx` hat `crmDeleteOpts: { leads, activities, notes, history }` als Cleanup-Cascade beim User-Delete. Verhalten beim Port nach admin.leadesk.de:

- (a) Cascade mitportieren (4 Optionen, opt-in pro Surface)
- (b) Soft-Delete-Default (markiere als gelöscht, kein Datenverlust)
- (c) Komplett weglassen, separate Cleanup-RPC

### Architektur-Q3: profiles.role-Drop-Timing

- (a) Sofort nach Phase 5A-Merge (RPCs lesen schon global_role, kein blocker)
- (b) Erst nach allen Ports + Phase 5C (Frontend-Abriss komplett)
- (c) Mit `plan_expires_at`-Drop in einer Migration bündeln

### Sec-kritische RPCs (morgen, frischer Kopf)

- `admin_set_user_password` für Member-Pwd-Reset (auth.users-Update, Audit-Trail, einmalige Display des neuen Passworts)
- `admin_grant_license_v2` für License mit Audit-Trail (siehe Q1)

### Reihenfolge-Vorschlag (aus Discovery, zur Erinnerung)

1. Tag 1 — Klärungsphase (Architektur-Q1-3, ~30min)
2. Tag 2 — Quick Wins (Member-Name-Edit ~1.5h, AdminLogs read-only ~2h)
3. Tag 3 — AdminPlans-Port (~5h, Hauptbrocken)
4. Tag 4 — Sec-kritisch (License-Grant ~2-3h, Pwd-Reset ~3-4h)
5. Tag 5 — Frontend-Abriss + DB-Drops (~2.5h)

**Gesamt Szenario A (Maximal-Streichung):** 16-18h verteilt auf 5 Tage.
