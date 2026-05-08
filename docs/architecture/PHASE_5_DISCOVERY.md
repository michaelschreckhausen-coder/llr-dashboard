# Phase 5 Discovery — Abriss /admin/* aus app.leadesk.de

**Stand:** 2026-05-03 abend
**Discovery durch:** Claude (Opus 4.7), read-only, kein Push, kein Commit
**Datenquelle:** llr-dashboard local-main (152 commits hinter origin/main — siehe Loose-Ends), `git show origin/main:` für AdminPlans, leadesk-admin develop @ 1a2e755, Hetzner-Prod-DB live SELECT-only

---

## TL;DR

**Phase 5 ist deutlich kleiner als gedacht.** Vier der sieben Admin-Surfaces (AdminTenants, WhiteLabel, AdminPanel-Licenses-Tab, AdminDocs) verwalten in Prod **0 Live-Rows** und sind gute Kandidaten für ersatzlose Streichung statt Port. Echte Arbeit: AdminUsers (Phase-1.6-Pattern fast da, fehlen 2 Inkremente + 1 sec-kritische RPC), AdminPlans (CRUD-Port), AdminLogs (159 Rows live, aber Michael pflegt persönlich → ggf. nur SELECT-View). **Realistischer Range: 8-25h**, je nach wieviel gestrichen wird.

---

## Loose-Ends (Pre-Flight für Phase 5A)

1. **llr-dashboard local-main 152 commits hinter origin/main** (Stand 2026-05-03). Vor Phase 5A `git fetch origin && git pull --ff-only origin main` im Clone `/Users/michaelschreck/Documents/llr-dashboard`. Heute nicht gepullt, weil Discovery soll keinen Code anfassen. **Konsequenz für diese Discovery:** Datei-Inhalte für 6 von 7 Surfaces sind aus local-main, AdminPlans.jsx aus `git show origin/main:` (existiert nur dort). Falls die 6 anderen Pages auf origin/main inhaltlich anders sind, ist diese Discovery dort minimal stale. Empfehlung: **vor Phase 5A nochmal kurz Inventur abgleichen**.
2. **Untracked `.save`-File:** `supabase/migrations/20260502100000_plans_modules.sql.save` — vermutlich vim-/GitHub-Editor-Backup zu der existierenden `20260502100000_plans_modules.sql`. Nicht von dieser Session. Vor Phase 5A entweder `diff` gegen Original und löschen wenn identisch/unwichtig, oder klären was es ist.
3. **leadesk-admin PR develop→main mit Banner-Commit (1a2e755) noch nicht gemerged** — User klickt manuell, gh-CLI nicht installiert. Block heute hat damit nichts zu tun, aber für saubere Audit-Trail: PR durchklicken.

---

## Surface-Inventur

### 1. AdminPanel.jsx — Route `/admin`

- **LoC:** 361
- **Imports:** React (useState, useEffect), supabase
- **Tabellen (direkter SDK-Zugriff):** `profiles`, `teams`, `licenses` (mit `teams(name)`-Embed), `license_assignments` (mit `licenses + teams`-Embed), `team_members`
- **RPCs:** keine
- **Storage:** keine
- **State:** 15 useState
- **Sub-Components:** keine
- **Modals:** keine (Inline-Tabs `tab='users'/'teams'/'licenses'`)
- **Operations:**
  - INSERT/UPDATE/DELETE auf teams, licenses, team_members, license_assignments
  - Direkt UPDATE auf profiles (`{full_name, email, global_role}`)
- **Hetzner-Prod-Live-Daten:** licenses=**0**, license_assignments=**0**, team_members=7, profiles=6, teams=? (nicht gemessen aber wenig)
- **Komplexität:** **L** (5 Tabellen, viel Inline-CRUD, 3 Tabs in einem File)
- **Port-Aufwand:** Großteil ist **streichbar**:
  - Licenses + license_assignments-Tab: 0 Live-Rows, neue License-Grant-RPC ersetzt das. **Streichen.**
  - Users-Tab (Profile-Edit): redundant zu admin.leadesk.de Members-Tab + Phase-1.6 RPCs. **Streichen.**
  - Teams-Tab: muss geklärt werden — gibt's in admin.leadesk.de schon Teams-View?
- **Realistic effort wenn streichen-statt-port:** 1h (Files weg, Routes weg)

### 2. AdminUsers.jsx — Route `/admin/users`

- **LoC:** 698
- **Imports:** React, supabase
- **Tabellen direkt:** keine (alles via RPC)
- **RPCs:** `admin_list_users`, `admin_list_pending_users`, `admin_create_user`, `admin_set_role`, `admin_delete_user`, `admin_grant_license`, `upsert_subscription`
- **Storage:** keine
- **State:** 17 useState (sehr hoch)
- **Sub-Components:** 5 inner-fns (`function`/`const X = (`)
- **Modals:** 23 Modal-Refs (heaviest in repo)
- **Operations:** User-CRUD via Admin-RPCs, License-Grant, CRM-Delete (`crmDeleteOpts`)
- **Hetzner-Prod-Live-Daten:** profiles=6, von admin.leadesk.de bereits via Members-Tab abgedeckt
- **Komplexität:** **L** (viele RPCs, komplexe Modal-Logic, CRM-Delete-Pfad)
- **Pattern in admin.leadesk.de:** **stark vorhanden** (Phase 1.6: MembersTab + admin_set_global_role + admin_remove_member; Sub-4.3: orphan-users)
- **Was fehlt in admin.leadesk.de:**
  - **Member-Name-Edit** (full_name update für bestehende Member): Pattern wie MemberRoleModal, ~1.5h
  - **Member-Passwort-Reset** (sicherheitskritisch, neue RPC + UI + Audit): ~3-4h
  - **License-Grant-UI** (ersetzt admin_grant_license-Aufruf, schreibt plan_expires_at): ~2-3h, plus optional Account-zentrische Refactor wenn neuer RPC analog Sub-4.3 mit Audit
- **CRM-Delete-Pfad:** unklar ob in admin.leadesk.de gewollt. Frage an Michael.

### 3. WhiteLabel.jsx — Route `/admin/whitelabel`

- **LoC:** 207
- **Imports:** React, supabase, `lib/whitelabel` (loadSettingsByTenantId, saveWhiteLabelSettings, DEFAULT_WL, applyTheme), `useTenant`
- **Tabellen (via lib/whitelabel.js):** `tenants` (read), `whitelabel_settings` (CRUD: select/insert/update mehrere Pfade)
- **RPCs:** keine
- **Storage:** **keine** (logo_url + favicon_url sind URL-Strings, kein Upload — User pastet URL)
- **State:** 6 useState
- **Sub-Components:** keine
- **Modals:** keine
- **lib/whitelabel.js zusätzlich:** 14 named exports, ~150 LoC, applyTheme als Side-Effect-Function (DOM-Manipulation für Live-Preview)
- **Hetzner-Prod-Live-Daten:** **whitelabel_settings = 0 Rows**, **tenants = 0 Rows**
- **Komplexität:** **M** (eine Page + nicht-triviale lib)
- **Pattern in admin.leadesk.de:** **NICHT vorhanden** (grep „whitelabel/primary.color/wl_": 0 Treffer)
- **Port-Aufwand wenn benötigt:** ~6-8h (lib portieren + UI portieren + DOM-Theme-Apply auf admin.leadesk.de-Architektur anpassen)
- **Frage an Michael:** Wird WhiteLabel überhaupt aktiv in der Roadmap genutzt? 0 Live-Rows + 0 Live-Tenants suggeriert: nein. Wenn nein → **streichen**.

### 4. AdminTenants.jsx — Route `/admin/tenants`

- **LoC:** 334
- **Imports:** React, supabase, react-router useNavigate
- **Tabellen direkt:** `tenants` (CRUD: select/insert/update)
- **RPCs:** keine
- **Storage:** keine
- **State:** 7 useState
- **Sub-Components:** keine
- **Modals:** 7 Modal-Refs (CRUD-Modal mit search)
- **Operations:** Tenant-CRUD, is_active-Toggle
- **Hetzner-Prod-Live-Daten:** **tenants = 0 Rows**
- **Komplexität:** **M** (eine Tabelle + Modals)
- **Pattern in admin.leadesk.de:** **NICHT vorhanden** (grep „tenant": 0 Treffer in src/)
- **Aber:** Per CLAUDE.md Phase 1+2+3 wurde `accounts` als neue Domäne eingeführt, mit `teams.account_id`-FK. `accounts` hat 2 Live-Rows in Prod, AccountDetail.jsx existiert. Plausible Hypothese: **`accounts` ist die neue `tenants`** und AdminTenants ist Tech-Debt von alter Architektur.
- **Frage an Michael:** Bestätigung — können wir AdminTenants ersatzlos streichen, weil Tenants-Konzept durch Accounts abgelöst ist? Wenn ja → **streichen, kein Port**. Wenn nein → ~3-4h Port nach admin.leadesk.de.

### 5. AdminPlans.jsx — Route `/admin/plans`

- **LoC:** 595 (aus origin/main, nicht in local-main)
- **Imports:** React, supabase, `lib/modules` (MODULES, MODULE_KEYS)
- **Tabellen direkt:** `plans` (CRUD: select, insert, update)
- **RPCs:** keine
- **Storage:** keine (kein logo_upload o.ä.)
- **State:** 6 useState (verteilt auf zwei Komponenten im File)
- **Sub-Components:** zwei sichtbare Top-Komponenten in einem File (PlanEditor + AdminPlans), 6 inner-fn-Refs
- **Modals:** 6 Modal-Refs (Edit-Editor in Modal-Form)
- **Operations:** Plans-CRUD inkl. Module-Toggle (6 Module: branding/crm/linkedin/content/delivery/reports), is_active-Toggle, is_trial/trial_days/is_default_trial
- **Hetzner-Prod-Live-Daten:** plans = ~4-5 Rows (Free/Starter/Pro/Enterprise per CLAUDE.md, hier nur Spalten-Count gemessen, nicht Rows — aber Plans sind aktiv in Verwendung über `accounts.plan_id`)
- **Komplexität:** **L** (eine Tabelle aber komplexes Schema mit 32 Spalten, Modul-Whitelist, CHECK-Constraints, Trial-Konfig)
- **Pattern in admin.leadesk.de:** **teilweise** — `PlanChangeModal.jsx` existiert (in account-detail/) aber das wechselt Account→Plan, kein Plans-Tabelle-CRUD
- **Port-Aufwand:** ~5-7h (komplettes Editor-UI + Module-Picker + Trial-Konfig + plans-Tabelle-CRUD)

### 6. AdminDocs.jsx — Route `/admin-docs`

- **LoC:** 625
- **Imports:** React (useState, useEffect, useCallback), supabase
- **Tabellen direkt:** `information_schema.columns`, `pg_tables` (DB-Introspection!)
- **RPCs:** `admin_list_users` (nur als ignorierter Connectivity-Probe in catch-Block, nicht echt genutzt)
- **Storage:** keine
- **State:** 4 useState
- **Sub-Components:** 2 inner-fns
- **Modals:** keine
- **Operations:** Schema-Browser mit 5 Tabs (db, tech, pages, enums, triggers) — komplett read-only
- **Hetzner-Prod-Live-Daten:** zeigt Live-Schema, kein eigenes Daten-Modell
- **Komplexität:** **L** (große Datei, aber rein read-only Dev-Tool)
- **Pattern in admin.leadesk.de:** nicht vorhanden
- **Frage an Michael:** Ist AdminDocs ein produktiv-genutztes Tool oder ein „Dev-Hilfsmittel"? Wenn Dev-Hilfsmittel → ersetzbar durch Supabase Studio (Hetzner-self-host hat das). **Streichkandidat.**
- **Port-Aufwand wenn benötigt:** ~4-6h (große File aber simple Logic)

### 7. AdminLogs.jsx — Route `/admin-logs`

- **LoC:** 285
- **Imports:** React (useState, useEffect, useCallback), supabase
- **Tabellen direkt:** `changelog` (CRUD: select, insert, delete)
- **RPCs:** keine
- **Storage:** keine
- **State:** 7 useState
- **Sub-Components:** keine
- **Modals:** keine (Inline-Form via `showForm`-Toggle)
- **Operations:** Changelog-Einträge anlegen/anzeigen/löschen, Filter + Search
- **Felder pro Eintrag:** type, title, description, version, author='Admin', affected (array), commit_sha, is_breaking
- **Hetzner-Prod-Live-Daten:** changelog = **159 Rows** (am stärksten genutzte Admin-Tabelle!)
- **Komplexität:** **M** (eine Tabelle, simple Form, Filter)
- **Pattern in admin.leadesk.de:** **NICHT vorhanden** (es gibt AuditLog.jsx + AuditTab.jsx, aber das ist `admin_audit_log` — eine andere Tabelle, andere Semantik: System-generierte Audit-Events vs. von Hand verfasste Release-Notes)
- **Memory-Notiz:** Michael pflegt Changelog persönlich via UI-Form auf Prod-DB.
- **Frage an Michael:** Reicht read-only Anzeige in admin.leadesk.de, oder wirklich Insert/Delete-Pfad mitportieren? Bei nur read-only: ~2h. Mit Form-Insert: ~4-5h.

---

## Cross-Cutting

### get_my_role()

- **Aufrufer im llr-dashboard:** **genau 1** (`src/App.jsx:123`, Route-Guard)
- **Implementation:** `SELECT global_role::text FROM profiles WHERE id=auth.uid()`, fallback `'user'`
- **In Phase 5C droppbar:** ja, wenn App.jsx die Admin-Routes komplett raus hat ist der einzige Caller weg
- **Risiko:** auf admin.leadesk.de wird `is_leadesk_admin`-JWT-Claim genutzt (anderer Mechanismus). Kein Drift.

### Sidebar-Einträge in Layout.jsx

Alle Admin-Routen-Refs in `src/components/Layout.jsx`:

| Zeile | Eintrag |
|---|---|
| 487 | `'/admin/tenants': 'Tenant-Verwaltung'` (page-title-map) |
| 489 | `'/admin': 'Admin Panel'` (page-title-map) |
| 490 | `'/admin/users': 'Benutzerverwaltung'` |
| 491 | `'/admin-users': 'Benutzerverwaltung'` (vermutlich Legacy-Alias) |
| 954-959 | MenuBtn-Block: Admin Panel, Benutzerverwaltung, Changelog & Logs, Dokumentation, Whitelabel, Tenant-Verwaltung |

→ **Eine zusammenhängende Section in Layout.jsx (Z954-959)** mit Sub-Items. Frontend-Abriss: diese 6 MenuBtns entfernen + 4 Zeilen aus page-title-map. Sehr klein, ~15min.

### Cross-Page-Coupling

Jede der 7 Admin-Pages wird **von genau 1 anderen File** importiert (vermutlich App.jsx-Routes). **Keine Sub-Component-Sharing zwischen Admin-Pages.** → Pages können unabhängig portiert/gestrichen werden, kein Refactor-Domino.

### Edge-Functions auf Hetzner-Prod

Nur **3** im `/opt/supabase/docker/volumes/functions/`-Mount:

| Name | Bewertung |
|---|---|
| `generate` | Customer-Surface (AI-Text-Gen, im Repo getrackt) |
| `hello` | vermutlich Supabase-Default-Demo |
| `main` | vermutlich Supabase-Default-Demo |

**KEINE Edge-Function trägt admin/license/role/audit im Namen.** → Kein Admin-Surface hängt an Edge-Functions, alle Admin-Operations laufen direkt via supabase-js + RPCs.

**Korrektur zur CLAUDE.md:** dort steht „14 deployed", real sind es 3. Empfehlung: CLAUDE.md-Notiz beim nächsten Doku-Sweep korrigieren.

### handle_new_user-Trigger

Body bekannt aus Discovery in dieser Session. Schreibt: `id, email, full_name, avatar_url, company, account_status, trial_ends_at, subscription_status='trialing', plan_id=v_free_plan_id (uuid)`. **Schreibt NICHT `role` und NICHT `global_role`** — beide bleiben auf Default (`'user'::text` bzw. `'user'::user_role`). Das ist gut: Phase 5B kann `profiles.role` ohne Trigger-Anpassung droppen, sobald alle anderen Reader weg sind.

---

## admin.leadesk.de Parität-Check

**Pages-Inventory (`src/pages/`):** AccountDetail, Accounts, AuditLog, Home, Login, Trials.

**Account-Detail-Tabs (`src/components/account-detail/`):** AuditTab, MembersTab, MemberInviteModal, MemberRoleModal, OrphanUsersTab, PlanChangeModal, SubscriptionTab, ActionsTab (Suspend/Delete) — Phase 1.3 / 1.6 / Sub-4.3 voll ausgebaut.

| Surface (llr-dashboard) | Pendant in admin.leadesk.de | Lücke |
|---|---|---|
| AdminPanel | accounts/AccountDetail | Licenses-Tab + Teams-Tab fehlen — wahrscheinlich nicht nötig |
| AdminUsers (User-CRUD via Admin-RPCs) | MembersTab (per-Account) | **Fehlt:** Member-Name-Edit, Member-Passwort-Reset (sec!), License-Grant-UI |
| WhiteLabel | **NICHTS** | Komplett neu wenn benötigt |
| AdminTenants | Accounts.jsx (`accounts`-Tabelle) | Tenants-Tabelle = Legacy, Streichkandidat |
| AdminPlans | PlanChangeModal (nur Account→Plan-Wechsel) | **Fehlt:** Plans-Tabelle-CRUD-Editor |
| AdminDocs | **NICHTS** | Streichkandidat (Supabase Studio) |
| AdminLogs (changelog) | AuditLog.jsx (admin_audit_log — andere Tabelle!) | Changelog-View fehlt; Form-Insert evtl. nötig |

---

## Aufwand-Tabelle (zwei Szenarien)

### Szenario A — Maximal-Streichung (empfohlen für Schnellst-Pfad)

Annahme: AdminTenants, WhiteLabel, AdminPanel, AdminDocs werden ersatzlos gestrichen (0 Live-Rows oder Dev-Tool). AdminLogs als read-only View. Plans-Editor + Member-Name-Edit + Member-Pwd-Reset + License-Grant werden gebaut.

| Surface | Pattern in admin? | Port-h | Neu-Build-h | Total-h |
|---|---|---|---|---|
| AdminPanel (streichen) | n/a | 0 | 0 | 0 |
| AdminUsers — Member-Name-Edit | ja (MemberRoleModal als Vorlage) | 0 | 1.5 | 1.5 |
| AdminUsers — Member-Passwort-Reset (sec!) | nein | 0 | 3-4 | 3-4 |
| AdminUsers — License-Grant-UI (sec!) | teilweise (PlanChangeModal als Vorlage) | 0 | 2-3 | 2-3 |
| WhiteLabel (streichen) | n/a | 0 | 0 | 0 |
| AdminTenants (streichen) | n/a | 0 | 0 | 0 |
| AdminPlans (Plans-CRUD-Editor) | nein | 5 | 0 | 5 |
| AdminDocs (streichen) | n/a | 0 | 0 | 0 |
| AdminLogs (read-only Changelog-View) | nein | 0 | 2 | 2 |
| Frontend-Abriss llr-dashboard (Sidebar + Routes + Files) | n/a | 0 | 0 | 1 |
| Legacy-RPC-Drop Hetzner-Staging+Prod (`admin_set_role`, `admin_list_users`, `admin_create_user`, `admin_grant_license`, `admin_delete_user`, `admin_list_pending_users`, `get_my_role`) | n/a | 0 | 0 | 1 |
| `profiles.role`-Drop + `plan_expires_at`-Drop | n/a | 0 | 0 | 0.5 |
| **GESAMT** |  |  |  | **16-18 h** |

### Szenario B — Voll-Port (alles erhalten)

Annahme: Alle 7 Surfaces werden portiert, nichts gestrichen. WhiteLabel + AdminTenants + AdminPanel kriegen Pendant.

| Surface | Total-h |
|---|---|
| AdminPanel (Teams + Licenses-Tab) | 4-5 |
| AdminUsers (3 Inkremente wie oben) | 6.5-8.5 |
| WhiteLabel (lib + UI + Theme-Apply) | 7-9 |
| AdminTenants (CRUD-UI) | 3-4 |
| AdminPlans | 5 |
| AdminDocs | 4-6 |
| AdminLogs (mit Form-Insert) | 4-5 |
| Frontend-Abriss + RPC-Drop + Schema-Drop | 2 |
| **GESAMT** | **35-43 h** |

**Empfehlung:** Szenario A. Begründung: 0 Live-Rows in 4 Surfaces ist der stärkste „dead code"-Indikator. Doppelter Bau wäre Verschwendung.

---

## Reihenfolge-Empfehlung

**Vorbedingung:** Loose-Ends 1-3 erledigt (pull, .save klären, PR mergen).

### Tag 1 — Klärungsphase (User: ~30min Entscheidungs-Q&A)

Alle Streichkandidaten von Michael freigeben lassen. Konkret 5 Ja/Nein-Entscheidungen:
1. AdminTenants streichen (tenants=0 Rows, accounts hat sie ersetzt)?
2. WhiteLabel streichen (0 Live-Rows, kein Roadmap-Eintrag)?
3. AdminPanel-Licenses-Tab + Teams-Tab streichen?
4. AdminDocs streichen (Supabase Studio reicht)?
5. AdminLogs read-only oder full CRUD?

Ohne diese Klärung lohnt sich kein Code-Schritt — sonst riskiert man verschwendete Ports.

### Tag 2 — Quick Wins mit existierenden Patterns

Reihenfolge nach „Pattern-Existenz" (motiviert + risiko-minimal):

1. **(1.5h) Member-Name-Edit in admin.leadesk.de** — Pattern aus MemberRoleModal kopieren. Frischer Kopf nicht nötig.
2. **(2h) AdminLogs → read-only Changelog-View in admin.leadesk.de** — wenn Streichung-light beschlossen. Simple Read-Page.

### Tag 3 — Plans-Editor (Hauptbrocken, frischer Kopf)

3. **(5h) AdminPlans-Port nach admin.leadesk.de** — neuer PlansEditor.jsx mit Module-Picker. Pattern aus llr-dashboard gut etabliert, aber Port nicht trivial wegen 32 Spalten + 6 Module + Trial-Konfig.

### Tag 4 — Sicherheitskritische Inkremente (frischer Kopf, einzeln getestet)

4. **(2-3h) License-Grant-UI in admin.leadesk.de** — vorzugsweise mit neuer Account-zentrischer RPC analog Sub-4.3 (admin_grant_license_v2 mit Audit, schreibt subscriptions als SoT statt profiles.plan_expires_at). End-to-End-Test gegen Staging-Account.
5. **(3-4h) Member-Passwort-Reset** — neue RPC `admin_reset_member_password` (SECURITY DEFINER, is_leadesk_admin-Claim, schreibt auth.users + admin_audit_log + Initial-Pwd-Display einmalig). End-to-End-Test mit Test-User.

### Tag 5 — Abriss + DB-Cleanup

6. **(1h) Frontend-Abriss llr-dashboard** — auf eigenem Branch von main:
   - Files löschen: 7 Admin-Pages
   - App.jsx: 7 Routes raus, Z123 (`get_my_role`-Call) raus, Z232-239 (role-Guard) raus
   - Layout.jsx: 6 MenuBtns + 4 page-title-map-Einträge raus
   - lib/whitelabel.js: löschen wenn kein anderer Caller
   - PR auf main, NICHT auf develop (Multi-Provider-AI-Hold)
7. **(1h) Legacy-RPC-Drop** — auf Staging dann Prod:
   ```sql
   DROP FUNCTION IF EXISTS admin_set_role(uuid, text);
   DROP FUNCTION IF EXISTS admin_list_users();
   DROP FUNCTION IF EXISTS admin_list_pending_users();
   DROP FUNCTION IF EXISTS admin_create_user(text, text, text, text);
   DROP FUNCTION IF EXISTS admin_grant_license(uuid, text, integer);
   DROP FUNCTION IF EXISTS admin_delete_user(uuid);
   DROP FUNCTION IF EXISTS get_my_role();
   ```
   Voraussetzung: Schritt 6 gemerged, 24h Bake.
8. **(0.5h) profiles-Cleanup** — auf Staging dann Prod:
   ```sql
   ALTER TABLE profiles DROP COLUMN role;
   ALTER TABLE profiles DROP COLUMN plan_expires_at;
   ```

**Reihenfolge-Begründung:**
- Sicherheitskritisch (Pwd-Reset, License-Grant) erst NACHDEM Pattern-Hand mit AdminPlans geübt ist und frischer Kopf da ist
- Frontend-Abriss erst NACHDEM alles in admin.leadesk.de ankommt (sonst lückenhafte Admin-UI live)
- DB-Drops zuletzt mit 24h Bake — sind irreversibel ohne Backup-Restore

---

## Offene Fragen an Michael

**Streich-Entscheidungen (blockierend für Reihenfolge):**

1. **AdminTenants:** Tenants-Konzept durch Accounts abgelöst? Tenants-Tabelle in DB lassen oder mit-droppen?
2. **WhiteLabel:** Roadmap-Position? Wenn aktiv geplant → Port; wenn nicht → streichen plus `whitelabel_settings`-Tabelle droppen?
3. **AdminPanel:** Teams-Tab — gibt's Teams-View-Bedarf in admin.leadesk.de? (Members-Tab ist per Account, nicht globale Teams-Liste.) Licenses-Tab erübrigt sich vermutlich durch neue License-Grant-RPC.
4. **AdminDocs:** ersatzbar durch Supabase Studio oder produktiv-need?
5. **AdminLogs:** read-only Anzeige reicht, oder Form-Insert/Delete weiterhin nötig in admin.leadesk.de? (Memory: Michael pflegt Changelog persönlich.)

**Architektur-Entscheidungen:**

6. **License-Grant-RPC v2:** Account-zentrisch mit Audit (analog Sub-4.3) oder altes `admin_grant_license` (User-zentrisch, kein Audit) belassen und nur frontend-anders aufrufen?
7. **AdminUsers CRM-Delete-Pfad** (`crmDeleteOpts: leads/activities/notes/history`): in admin.leadesk.de mit-portieren oder bewusst weglassen?
8. **`profiles.role` + `plan_expires_at` Drop:** parallel mit Phase 5C oder separater Sprint?

**Doku-Korrekturen (nicht-blockierend):**

9. CLAUDE.md sagt „14 deployed Edge-Functions" — real sind es 3 auf Hetzner-Prod. Beim nächsten Doku-Sweep korrigieren.
10. CLAUDE.md sagt `/admin/tenants` und `/admin-users` (Z491) — letzteres ist vermutlich Legacy-Alias, klären beim Abriss.

---

**Ende Discovery.** Diese Datei nicht committen, nicht pushen — als untracked file im Repo-Root abgelegt für Michaels Lese-Termin morgen.
