# Leadesk — Claude Code Project Memory

> Diese Datei wird automatisch in jeder Claude-Code-Session als Kontext geladen.
> Single Source of Truth für aktuellen Stand: `app.leadesk.de/admin-docs` und `app.leadesk.de/admin-logs`.

## Projekt

**Leadesk** ist eine Multi-Tenant-LinkedIn-Suite (Web-App + Chrome Extension) als SaaS mit Whitelabel-Support. Bereiche: Startseite, Assistent, Branding, Sales, Communication, Content, Delivery, Reporting, Admin.

## Tech-Stack

- **Frontend:** React 18 + Vite (JSX, **kein TypeScript**, **ausschließlich Inline-Styles**)
- **Backend:** Supabase (Postgres, Auth, Edge Functions, Storage, Realtime)
  - **Production:** Supabase Cloud, Projekt-ID `jdhajqpgfrsuoluaesjn` → `app.leadesk.de`
  - **Staging:** Self-Hosted auf Hetzner → `staging.leadesk.de` / `supabase-staging.leadesk.de`
- **Hosting:** Vercel (`fra1`-Region), ein Projekt mit zwei Environments (`main` → Prod, `develop` → Preview)
- **Repo:** `github.com/michaelschreckhausen-coder/llr-dashboard`

---

## ⚠️ HARD RULES — niemals brechen

### Branches

- **Alle Änderungen IMMER zuerst auf `develop`** — nie direkt auf `main`
- `develop` deployed automatisch auf `staging.leadesk.de` (~30-45s)
- Merge `develop → main` **nur auf explizite Anweisung** des Users („freigeben", „in Produktion", „mergen")
- Vor jedem Commit: `git branch --show-current` prüfen

### Code

- **Inline-Styles only:** `style={{...}}` — kein Tailwind, kein CSS, keine externen Stylesheets
- Primary-Color **immer** als CSS-Variable: `var(--wl-primary, rgb(49,90,231))`
- **UI-Texte auf Deutsch** — alle User-facing Strings
- React Hooks **immer** am Anfang, nie nach `if`/`return`
- **Niemals `useTranslation()` o.ä. innerhalb von `useState()`-Initializer** (build-breaking ReferenceError)
- Standard-Imports:
  ```jsx
  import { supabase } from '../lib/supabase'
  import { useTeam } from '../context/TeamContext'
  ```

### Multi-Tenant

```jsx
const { activeTeamId, team, members } = useTeam()
```
- **Bei JEDEM Insert auf Multi-Tenant-Tabellen `team_id: activeTeamId` mitgeben** — sonst NOT-NULL-Violation
- Multi-Tenant-Tabellen: `pm_*`, `leads`, `deals`, `pm_projects`, `pm_tasks`, `pm_columns` u.v.m.

### Datenbank

- **RLS ist Pflicht** für jede neue Tabelle
- Standard-Felder: `user_id`, `team_id`, `is_shared`, `created_at`, `updated_at`
- Migration-Naming: `supabase/migrations/YYYYMMDDHHMMSS_kurzname.sql`
- Migrationen müssen **idempotent** sein: `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `ADD COLUMN IF NOT EXISTS`
- Trigger die in RLS-Tabellen schreiben → `SECURITY DEFINER`
- **Niemals** Tabellen oder Spalten löschen ohne explizite User-Rücksprache
- Schema-Änderungen **erst auf Staging-DB** (Hetzner via SSH), dann nach Freigabe auf Prod (Supabase Dashboard SQL Editor)

### Edge Functions

```jsx
// ✅ RICHTIG — routet automatisch je nach Environment
const { data, error } = await supabase.functions.invoke('generate', { body: {...} })

// ❌ FALSCH — hardcoded URL bricht zwischen Prod/Staging
fetch('https://jdhajqpgfrsuoluaesjn.supabase.co/functions/v1/generate', ...)
```

---

## 🐛 Top-Fallstricke (alle real aufgetreten)

### 1. ENUM-Felder → Silent Fail bei kombiniertem Update

```jsx
// ❌ FALSCH — ENUM in kombiniertem update() speichert NICHTS, kein Fehler
await supabase.from('leads').update({ deal_stage: 'angebot', name: 'Test' }).eq('id', id)

// ✅ RICHTIG — ENUM separat
await supabase.from('leads').update({ deal_stage: 'angebot' }).eq('id', id)
await supabase.from('leads').update({ name: 'Test' }).eq('id', id)
```

### 2. Stage-Werte sind DEUTSCH in der DB

Gültige Werte: `'gewonnen'`, `'verloren'`, `'angebot'`, `'verhandlung'`, `'prospect'`, `'opportunity'`. **Nie** `'won'`/`'lost'`.

Lead-Status (`leads.status`): `'Lead'`, `'LQL'`, `'MQL'`, `'MQN'`, `'SQL'`. **Nie** `'new'`.

### 3. Hetzner-Staging: Cross-Table-RLS-Subquery braucht GRANT

Self-Host hat keine Default-Grants für `authenticated`. RLS-Policy mit Sub-Query (z.B. `FROM team_members WHERE user_id = auth.uid()`) läuft sonst **stumm** (0 Rows, kein Fehler).

```sql
-- Bei jeder neuen Cross-Table-Policy mitliefern:
GRANT SELECT ON team_members TO authenticated;
GRANT SELECT ON teams        TO authenticated;
```

Migration `20260423150000_delivery_phase_1_hotfix_grants.sql` ist Vorlage. **Für Prod-Cutover ebenfalls beachten.**

### 4. PostgREST-Embed: nur existierende Felder

```jsx
// ❌ leads hat kein 'name'-Feld → 400-Fehler
.select('*, leads(id, name, company)')

// ✅
.select('*, leads(id, first_name, last_name, company)')
```

### 5. PDF-Download aus Storage → Blob, nie window.open

```jsx
// ❌ Chrome blockiert Cross-Origin-PDFs
window.open(signedUrl, '_blank')

// ✅
const { data: blob } = await supabase.storage.from('deal-attachments').download(path)
const url = URL.createObjectURL(blob)
const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
```

### 6. Vercel-Cache nach Deploy

Nach jedem Push: Hard-Refresh (`Cmd+Shift+R`) auf Staging. Konsolen-Errors aus altem Bundle (anderer Hash) erst wegrefreshen, dann debuggen.

### 7. Supabase Env-Vars sind Pflicht

`src/lib/supabase.js` wirft `Error` wenn `VITE_SUPABASE_URL` oder `VITE_SUPABASE_ANON_KEY` fehlen — kein Silent-Fallback. Bei „App lädt nicht": Vercel-Env-Vars für das jeweilige Environment prüfen.

### 8. Hetzner-`plans`-Tabelle weicht vom Repo-Schema ab

Hetzner-Staging-`plans` ist gegenüber dem Repo-Schema-File divergiert. **Frontend folgt Hetzner-Realität, nicht umgekehrt.**

| Hetzner-Realität (verwenden) | Repo-Schema-File (nicht in DB) |
|------------------------------|--------------------------------|
| `price_monthly`, `price_yearly` | `price_eur` |
| `max_team_members` | `seats` |
| `max_vernetzungen_per_day` | `daily_limit` |
| `max_brand_voices`, `max_ai_generations` | — |
| `slug` (text), `features` (jsonb) | — |
| — | `stripe_price_id`, `sort_order` |

Konstant in beiden: `id`, `name`, `description`, `max_leads`, plus die Module-Spalten (`modules`, `is_active`, `is_trial`, `trial_days`, `is_default_trial`) sowie Legacy-Booleans (`feature_brand_voice`, `feature_pipeline`, `feature_reports`, `ai_access`).

`AdminPlans.jsx` (live seit `d0dc73f`) nutzt die Hetzner-Spalten. **Bei neuen Plan-Features keine `price_eur`/`seats`/`daily_limit`/`stripe_price_id`/`sort_order` referenzieren.** Cloud-Prod-Schema beim Cutover spiegeln (siehe TODO Prod-Cutover unten).

---

## Pflicht-Workflow vor jeder Änderung

1. **Aktuellen Code holen** — niemals aus Memory/alter Session arbeiten
   - `git fetch && git checkout develop && git pull origin develop`
   - Bei Web-Fetch: `https://raw.githubusercontent.com/michaelschreckhausen-coder/llr-dashboard/develop/...`
2. **Was hat sich geändert?** Bei Bedarf User auf `app.leadesk.de/admin-logs` (Changelog) und `/admin-docs` (Schema/Routen/Trigger) verweisen
3. **Vor Commit:** `git branch --show-current` → muss `develop` sein

## Pflicht-Workflow nach jeder Änderung

1. Build-Check: `npx vite build` (lokal vor Push)
2. Push auf `develop`, ~30-45s warten
3. Auf `staging.leadesk.de` testen, Hard-Refresh, Console checken
4. **Changelog-Eintrag** erstellen auf `app.leadesk.de/admin-logs` (Typ, Version, Tags, Beschreibung) — Changelog wird beim Staging-Merge gepflegt, nicht erst bei Prod
5. Bei strukturellen Änderungen (neue Tabellen/Routes/Edge Functions) prüfen ob `/admin-docs` aktualisiert werden muss
6. Prod-Merge nur auf explizite User-Anweisung

---

## Datenbank-Workflows

### Migration auf Staging anwenden (Hetzner)

User soll vom eigenen Mac aus laufen lassen — Claude hat keinen SSH-Outbound:

```bash
ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres' < supabase/migrations/XYZ.sql
```

### Migration auf Prod anwenden (Cloud)

User auf `https://supabase.com/dashboard/project/jdhajqpgfrsuoluaesjn/sql` hinweisen → Migration kopieren und ausführen.

### Rollen & RLS-Patterns

- `anon` / `authenticated` → RLS aktiv
- `service_role` → bypassed RLS (nur Edge Functions, nie Client)
- `postgres` → Superuser (psql, Trigger, Migrationen)

Standard-Patterns:
```sql
-- User-scoped
CREATE POLICY "x_own" ON tabelle FOR ALL USING (user_id = auth.uid());

-- Team-scoped (Multi-Tenant)
CREATE POLICY "x_team" ON tabelle FOR ALL USING (
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);
-- ↑ Vergiss nicht: GRANT SELECT ON team_members TO authenticated;
```

---

## Commit-Konventionen

- `feat:` — neues Feature
- `fix:` — Bugfix
- `docs:` — Dokumentation
- `ux:` — UI/UX-Verbesserung
- `refactor:` — Code-Umstrukturierung

---

## Sicherheitsregeln

- Niemals API-Keys, Secrets, Passwörter committen
- `docker-compose.override.yml` mit LLM-Provider-Keys ist bewusst **nicht im Repo**
- RLS-Policies für jede neue Tabelle
- Edge Functions: immer Auth prüfen
- Keine Produktionsdaten in Logs/Fehlermeldungen
- Schema-Änderungen erst Staging, dann Prod

---

## Aktueller Release-Stand (Stand 2026-04-30)

- **`develop` deutlich vor `main`** — enthält Multi-Provider-AI + Delivery-Phase-0/1/3 + Accounts-Refactor Phase 1+2+3 + Admin-Pipeline Phase 1.3/1.4/1.5a + **Plan-Modules-Feature**
- **Multi-Provider-AI-Release weiterhin bewusst zurückgehalten** — kein develop→main-Merge ohne explizite Freigabe des Users
- **Neue Routen:** `/projekte/:id` (ProjektDetail), `/zeiten` (Zeiterfassung), `/admin/plans` (Plan-Modules-Admin-UI, admin-only)
- **Hellmodus ist Default-Theme** (vorher System-Theme)
- **Bekannte Lücke (Phase 1b):** Lead-only-Projekt + nachträglicher Deal-Anlage erlaubt zweites Projekt für denselben Lead. Fix in Phase 2 via Partial Unique Index `pm_projects(lead_id) WHERE deal_id IS NULL AND status != 'archived'`.

### 2026-04-28 — Phase 1b Live + Accounts-Refactor Phase 1+2

- Phase 1b live auf develop (Commits b0a55cd, 13e54be): „🚀 Projekt starten" jetzt aus LeadProfile + Pipeline (Card-Footer Gewonnen-Spalte). End-to-End auf Staging verifiziert (Test-Projekt 97300687-4555-4edc-ab1a-29039151eec5).
- TeamContext-Härtung (d8ab59c, ad30fe8, 55a3513): Layer-B-Auto-Recovery via onAuthStateChange + visibilitychange. Error-Handling im team_members-Fetch statt Silent-Fail.
- Hetzner-Schema-Kompat (6e62c47): plan/max_seats/is_active als Inline-Spalten zurück-ergänzt.
- **Accounts/Teams-Refactor Phase 1+2 LIVE (additiv):** accounts-Tabelle, teams.account_id-FK, user_preferences, RLS, Plan-Authority-Trigger, Daten-Migration durchgelaufen. App unverändert lauffähig.
- Changelog v3.4.0 live auf app.leadesk.de/admin-logs.

### 2026-04-28 — Phase 3 voll: Frontend-Refactor für Account/Team-Trennung

Sechs additive Subblocks live auf develop, alle ohne Breaking Change. Verifiziert durch Live-Tests im Browser, Console clean.

- **3.1 AccountContext** (3da0189): Neuer React Context, lädt Account-Daten via teams.account_id-Embed mit Layer-B-Auto-Recovery (onAuthStateChange + visibilitychange). Bewusst notes_internal/stripe_* nicht selektiert.
- **3.3 Settings-Tabs** (b7702f5): Settings in drei Tabs aufgesplittet — Profil / Team / Konto & Abo. Sub-Routes /settings/profil, /settings/team, /settings/konto. Sidebar konsolidiert.
- **3.4 TeamSwitcher** (d7222d9): Sidebar-Komponente, rendert null bei <2 Teams.
- **3.3.1 PlanCards Move** (5fe8944): Pricing-Karten von Profil-Tab in Konto-Tab verschoben.
- **3.2a TeamContext liest user_preferences** (662d7c1): active_team_id aus DB statt localStorage. Fallback auf erstes Team.
- **3.2b switchTeam persistiert** (67750d9): UPSERT auf user_preferences.active_team_id. Optimistisches UI, Error-Log ohne Rollback.

Changelog v3.5.0 live auf app.leadesk.de/admin-logs.

### 2026-04-29 — Phase 1.3: Audit-Trail-Pipeline für leadesk-admin

Komplette End-to-End-Edit-Pipeline mit DSGVO-konformem Audit-Log für die Admin-App. Defense-in-depth: Frontend → SECURITY-DEFINER-RPC → Auth-Check → Field-Whitelist → Per-Spalte-Cast → Update + Audit-Insert in einer Transaction. Direct UPDATE auf accounts ist seit 1.3c geblockt.

**llr-dashboard (Backend, develop):**
- 1.3a `a3f8b04` — `admin_audit_log`-Tabelle + RLS (nur is_leadesk_admin liest, kein Schreib-Pfad für authenticated)
- 1.3b `1faae43` — RPC `update_account_with_audit` (SECURITY DEFINER)
- 1.3c `59f3238` — RLS-Aufsplittung accounts (kein direct-UPDATE) + REVOKE PUBLIC auf RPC
- 1.3g `661595c` — RPC-Härtung: per-Spalte-Cast (CASE statt #>>) — fixt seat_limit/plan_id/trial_ends_at

**leadesk-admin (Frontend, main):**
- 1.3d `f345c2e` — Edit-Pencils + Reason-Modal + Inline-Confirm für status/plan_managed_by
- 1.3e `e99b11a` — Audit-Log-View pro Account auf Detail-Page (letzte 5 Einträge)

Verifiziert: 4 Audit-Einträge in DB nach Browser-Test (notes_internal + 2x status + seat_limit). Alle JWT-Claim-, RLS- und Cast-Layer greifen.

### 2026-04-29 — Phase 1.4: Admin-Account-Liste mit Filter/Search/Sort/Pagination

Read-only Liste aus Phase 1.1 erweitert zu vollständiger Browse-Surface mit server-side Filter (Status-Multi-Checkbox), Multi-Field-Search (Name, Billing-Email, Notes_internal, Owner-Email), Sort-Whitelist (8 Spalten), und Cursor-loser Pagination (`p_offset` + `total_count` via window function `COUNT(*) OVER ()`). URL-Sync via pushState für Sharing.

**llr-dashboard (Backend, develop):**
- 1.4a `06d878b` — RPC `get_accounts_admin_list` mit JOINs auf `plans` (plan_name) + `auth.users` (owner_email::text), ILIKE-Multi-Field-Search, Sort-Whitelist, Status-Array-Filter
- 1.4c-Backend `76ae7ba` — RPC um `p_offset`-Param + `total_count`-Spalte (`COUNT(*) OVER ()`) erweitert. Page-Size-Default 100→25. Signatur 5→6 Param erfordert `DROP FUNCTION IF EXISTS` vor `CREATE`

**leadesk-admin (Frontend, main):**
- 1.4b `0ef135d` — `AccountsFilterBar.jsx` (debounced Search + Status-Multi-Checkbox + Sort-Dropdown + Direction-Toggle), Tabelle erweitert um Owner-Email-Spalte, Plan-ID durch Plan-Name ersetzt, RPC-Wiring statt direct `.from('accounts').select()`
- 1.4c-Frontend `a2cdfe3` — `AccountsPagination.jsx` (Vor/Zurück + Page-Range "X–Y von N"), URL-Sync via `useSearchParams` + pushState (PAGE_SIZE=25)

URL-Sync ist unidirektional: State→URL via pushState beim State-Change, URL→State nur beim Initial-Mount. Browser-Back/Forward syncs nicht zurück in State (UI bleibt stale, URL aktualisiert sich) — akzeptierte Limitation. Bidirektionaler Sync wäre Phase 2-Polish.

### 2026-04-30 — CRM-/Sidebar-UX-Iteration

Fünf kleinere UX-Commits direkt auf develop, alle live auf Staging:

- `3536b5e` — LeadRow-Komponente: Layout + Handlers refactored
- `3d84847` — CRM-Liste: modernisierte Bulk-Bar, Underline-Tabs, 5-Spalten-Header
- `5e892f1` — Sidebar: Sales-Bereich umsortiert, neuer LinkedIn-Bereich abgespalten
- `43c84ae` — Sidebar-Divider „Sales" → „CRM" (DE-Locale)
- `9814bc6` — Sidebar-Divider „Delivery" → „Projektumsetzung"

Die Divider-Namen sind Pflicht-Eingabe für das Plan-Modules-Sidebar-Mapping (siehe nächster Block).

### 2026-04-30 — Plan-Modules: Module-basierte Plan-Freischaltung

Neuer Branch `feat/plan-modules` in develop gemergt (`d0dc73f` + Merge-Commit `d6db430`). **Inert**: alle bestehenden Pläne haben per Backfill alle 6 Module → keine Sichtbarkeitsänderung für User, bis ein Plan mit weniger Modulen einem Account zugewiesen wird.

**Migrationen (Hetzner-Staging applied, Cloud-Prod pending):**
- `20260502100000_plans_modules.sql` — `plans`-Schema-Erweiterung: `modules text[]`, `is_active`, `is_trial`, `trial_days`, `is_default_trial` + CHECK-Constraints (Modul-Whitelist `branding/crm/linkedin/content/delivery/reports`, Trial-Days-only-if-Trial, Unique-Index 1× Default-Trial) + RLS (read-all-authenticated, write-jwt-admin)
- `20260502110000_module_entitlements_rpcs.sql` — RPCs `account_has_module(uuid, text)`, `get_my_entitlements()` (jsonb), `i_have_module(text)` — alle SECURITY DEFINER

**Frontend (live auf staging.leadesk.de):**
- `src/lib/modules.js` — Modul-Konstanten (Keys, Labels, Routen-Map, Sidebar-Divider-Mapping)
- `src/hooks/useEntitlements.js` — Hook über `get_my_entitlements()`
- `src/components/ModuleGuard.jsx` — Route-Guard-Komponente, **gebaut aber in `App.jsx` noch NICHT angewendet** — Routen sind weiter offen
- `src/pages/AdminPlans.jsx` — Admin-UI auf `/admin/plans`: Plan-Liste + Editor mit 6 Modul-Toggles, Trial-Konfiguration, Hetzner-Spalten (siehe Top-Fallstrick #8)
- `src/components/Layout.jsx` — `useEntitlements` integriert, Sidebar-Section-Filter eingebaut, Admin-Menü-Eintrag „Pläne & Module"
- `src/App.jsx` — Route `/admin/plans` (admin-only)

**Sidebar-Modul-Mapping (für Verifikation, falls Filter aktiv):**

| Sidebar-Divider | Modul-Key | Ausgeblendet wenn fehlt |
|-----------------|-----------|--------------------------|
| Branding | `branding` | Brand Voice, Zielgruppen, Wissensdatenbank, Profiltexte |
| CRM | `crm` | Kontakte, Unternehmen, Deals, Aufgaben, Lead Intelligence |
| LinkedIn | `linkedin` | Vernetzung, Nachrichten, Automatisierung |
| Content | `content` | Content Studio, Redaktionsplan |
| Projektumsetzung | `delivery` | Projekte, Zeiten |
| Reporting | `reports` | Reports, SSI-Tracker |

Always-on (nie ausgeblendet): Dashboard, Assistant, Konto/Billing, alle Admin-Routen.

**Roll-out-Reihenfolge bis User-sichtbarer Effekt:**
1. (✅) Migrationen auf Hetzner-Staging applied
2. (✅) Frontend live auf develop → staging
3. (offen) Cloud-Prod-Migration anwenden (siehe TODO Prod-Cutover)
4. (offen) Sidebar-Filter aktivieren — passiert automatisch sobald ein Plan mit <6 Modulen einem Account zugewiesen wird
5. (offen) RLS-Lockdown pro Modul über `RLS_LOCKDOWN_TEMPLATE.sql.template` — pro Modul eigener Migration-File, Bake-Time 24h

Vollständige Doku: `docs/PLAN_MODULES_ROLLOUT.md`.

### Pending Migrationen auf Prod-DB (Cloud, noch nicht angewendet)

- `20260422120000_add_default_ai_model_to_profiles.sql`
- `20260423130000_delivery_phase_0_1.sql`
- `20260423150000_delivery_phase_1_hotfix_grants.sql`
- `20260424160000_leads_linkedin_url_partial_unique.sql`
- `20260501120000_delivery_phase_3_time_tracking.sql`
- `20260502100000_plans_modules.sql`
- `20260502110000_module_entitlements_rpcs.sql`

### Migrations seit 2026-04-28 (auf Hetzner-Staging applied)

- `20260428100000_hetzner_teams_schema_compat.sql` — plan/max_seats/is_active inline
- `20260428200000_accounts_phase1_additive.sql` — accounts-Tabelle, RLS, Trigger
- `20260428201000_accounts_phase2_data_migration.sql` — Daten-Migration teams→accounts
- `20260429100000_admin_audit_log.sql` — Phase 1.3a
- `20260429110000_update_account_rpc.sql` — Phase 1.3b
- `20260429120000_accounts_rls_split.sql` — Phase 1.3c
- `20260429130000_update_rpc_per_column_cast.sql` — Phase 1.3g
- `20260430100000_get_accounts_admin_list_rpc.sql` — Phase 1.4a
- `20260430110000_get_accounts_admin_list_pagination.sql` — Phase 1.4c
- `20260430120000_get_trial_dashboard_stats_rpc.sql` — Phase 1.5a
- `20260502100000_plans_modules.sql` — Plan-Modules-Schema
- `20260502110000_module_entitlements_rpcs.sql` — Plan-Modules-RPCs

Alle müssen vor Cloud-Prod-Cutover auch dort applied werden.

### TODO Prod-Cutover (Cloud → Hetzner)

1. Drei Migrations vom 2026-04-28 auf Cloud-Prod anwenden (Reihenfolge: 100000 → 200000 → 201000).
2. **Storage-Key-Härtung:** `auth.storageKey: 'leadesk-auth-token'` im Supabase-Client setzen. Verhindert Multi-Token-Drift bei künftigen Backend-Wechseln. Side-Effect: alle bestehenden Sessions invalidiert. Bewusst beim Cutover einplanen.
3. **Schema-Drift Cloud↔Hetzner final auflösen:** Cloud hat teams.plan/max_seats/is_active inline, Hetzner zusätzlich plan_id-FK. Saubere Lösung beim Cutover: useTeam() auf normalisierten plans-Join umstellen, dann Inline-Spalten droppen (= Phase 4 Accounts-Refactor).
4. Phase 3 Frontend-Refactor (TeamContext-Split, AccountContext, Settings-Tabs) — separate Session, kann jederzeit starten.
5. **Phase 1.3 Audit-Trail-Migrations** (in dieser Reihenfolge anwenden):
   1. `20260429100000_admin_audit_log.sql`
   2. `20260429110000_update_account_rpc.sql`
   3. `20260429120000_accounts_rls_split.sql`
   4. `20260429130000_update_rpc_per_column_cast.sql`

   Nach Apply explizit verifizieren, dass `authenticated` NUR `SELECT` auf `admin_audit_log` hat. Der Hetzner-`GRANT ALL ON ALL TABLES TO authenticated`-Hotfix wird via `REVOKE INSERT/UPDATE/DELETE` in Migration 1 kompensiert — auf Cloud-Prod nicht nötig, aber Migration läuft idempotent durch.

6. **Phase 1.4 — Admin-Accounts-List-RPC** (in dieser Reihenfolge anwenden):
   1. `20260430100000_get_accounts_admin_list_rpc.sql`
   2. `20260430110000_get_accounts_admin_list_pagination.sql` (DROP+CREATE wg. Signaturwechsel 5→6 Param)

7. **Phase 1.5a — Trial-Dashboard-Stats-RPC**:
   - `20260430120000_get_trial_dashboard_stats_rpc.sql` — `get_trial_dashboard_stats()` ohne Args, liefert 4 Bigints (`active_count`, `expiring_soon_count`, `expired_count`, `total_count`) via `COUNT(*) FILTER (WHERE …)`. Erste Migration mit UTF-8 (em-dashes, Umlaute, `≤`).

8. **Plan-Modules — Schema + RPCs** (in dieser Reihenfolge):
   1. `20260502100000_plans_modules.sql` — fügt `modules`/`is_active`/`is_trial`/`trial_days`/`is_default_trial` zu `plans`, Backfill setzt alle bestehenden Pläne auf alle 6 Module, RLS read-all/write-jwt-admin
   2. `20260502110000_module_entitlements_rpcs.sql` — RPCs `account_has_module`, `get_my_entitlements`, `i_have_module`

   ⚠️ **Vor Apply prüfen:** Cloud-`plans` muss alle Spalten haben, die `AdminPlans.jsx` schreibt (`price_monthly`, `price_yearly`, `max_team_members`, `max_brand_voices`, `max_ai_generations`, `max_vernetzungen_per_day`, `slug`, `features`). Falls Cloud noch `price_eur`/`seats`/`daily_limit` hat → Cloud-Schema vorher angleichen oder die Migration um eine Schema-Harmonisierung erweitern. Auf Hetzner ist das schon der Fall, sonst hätte das Backfill-Insert nicht funktioniert.

9. **Plan-Modules — Sidebar-Filter & RLS-Lockdown** (nach Cutover, separater Sprint):
   - Sidebar-Filter aktiviert sich automatisch sobald ein Account einen Plan mit <6 Modulen bekommt
   - RLS-Lockdown pro Modul via `RLS_LOCKDOWN_TEMPLATE.sql.template` — pro Modul eigene Migration `YYYYMMDDHHMMSS_rls_lockdown_<modul>.sql`, 24h Bake-Time auf Staging vor Prod-Apply
   - `ModuleGuard.jsx` in `App.jsx` aktivieren, sobald Sidebar-Filter+RLS scharf sind

### Phase 3.5 — localStorage-Cleanup (offen, Folge-Sprint)

Nach Phase 3.2a/b ist user_preferences.active_team_id single source of truth. Folgende Stellen lesen/schreiben aber noch direkt aus localStorage und müssen migriert werden:

- src/components/TeamSwitcher.jsx Z17 — write
- src/pages/TeamSettings.jsx Z183/388 — read+write
- src/pages/Reports.jsx Z132 — read
- src/components/Layout.jsx Z326 — toter useTeam-Destructure (aus 3.4)
- src/components/Layout.jsx Z414 — read von 'leadesk_active_team_id'
- src/context/TeamContext.jsx — STORAGE_KEY-Constant + Dead-Write in switchTeam (mit TODO markiert)

Strategie: alle sechs Stellen in einem Commit migrieren, Live-Test pro Konsument. Eigene Session.

### Offene Bugs (low priority)

- **Pipeline „Gewonnen"-Spalte zeigt 0 Deals** trotz vorhandenem gewonnenem Deal auf Staging. Verdacht: deals.team_id NULL ODER Stage-Casing-Mismatch ODER vergessener Filter in Pipeline.jsx. Nicht blockierend.

### Architektur-Design-Docs

- `docs/architecture/design-accounts-teams-split.md` — Trennung Account-Domäne (Billing) von Team-Domäne (Collaboration). **Phase 1+2+3 umgesetzt** (Schema additiv + Daten + Frontend-Refactor). Phase 4 (Cleanup teams.plan/is_active/owner_id droppen) und Phase 5 (Admin-UI in admin.leadesk.de) offen.
- `docs/architecture/design-admin-app.md` — Separate App auf admin.leadesk.de für Leadesk-interne Account-Verwaltung. MVP ~5.5 Tage. Voraussetzung: Accounts-Phase 1+2 (✅).
- `docs/PLAN_MODULES_ROLLOUT.md` — End-to-End-Doku zum Plan-Modules-Feature: Architektur, Migrations-Reihenfolge, Verifikations-Checks, RLS-Lockdown-Template-Strategie.

---

## Wenn ich (Claude) etwas nicht weiß

- Aktueller Schema-Stand → User auf `app.leadesk.de/admin-docs` verweisen
- Was hat der andere Entwickler geändert? → `app.leadesk.de/admin-logs`
- Edge-Function-Code → `supabase/functions/NAME/index.ts` lesen
- Bei Unsicherheit über Datenbank-Inhalt: User-Migration anfragen, statt zu raten
