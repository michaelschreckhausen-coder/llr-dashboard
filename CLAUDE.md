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

### 9. `is_leadesk_admin`-JWT-Claim ist die Authority für Leadesk-interne Admin-Funktionen

Pattern aus Phase 1.3b (`update_account_with_audit`) und Phase 1.6 (admin-RPC-Suite). Im RPC-Body:

```sql
IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
  RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
END IF;
```

**NICHT** auf `profiles.role = 'admin'` prüfen — das ist Customer-Admin-Tier (Team-Owner-Rolle), nicht Leadesk-intern. Defense-in-Depth: ein Customer mit `profiles.role='admin'` kann sonst via direkter `supabase-js`-Call Leadesk-Admin-RPCs feuern.

`profiles.role` (text Legacy auf Prod, user_role enum auf Staging) ist ohnehin Tech-Debt — neuere Funktionen lesen `profiles.global_role` (user_role enum auf beiden Envs).

`upsert_subscription` ist explizit ausgenommen — wird aus Wix/Stripe-Webhooks aufgerufen, hat eigene Signatur-Verifikation, kein JWT-Auth.

### 10. Hetzner-Staging-DB hat 0 Plan-Rows → handle_new_user-Trigger crashed bei jedem Sign-Up

Phase-3-Plans-Seed (4 Pläne free/starter/pro/enterprise) wurde **nur auf Hetzner-Prod** durchgeführt, **nicht auf Staging**. Folge: `handle_new_user`-Trigger findet keinen Free-Plan via `WHERE LOWER(name) = 'free'` → Exception → jeder INSERT INTO auth.users (auch via `admin_create_user`-RPC) crashed mit:

```
ERROR: No "Free" plan found in plans table — handle_new_user cannot proceed
```

Plus: `scripts/seed-default-plans.sql` ist NICHT direkt auf Staging anwendbar — schreibt 12 Spalten die Staging-plans-Schema nicht hat (description, sort_order, price_eur, seats, daily_limit, max_lists, leads_monthly, ai_calls_monthly, feature_pipeline, feature_brand_voice, feature_reports, ai_access). Schema-Drift Prod (32 cols) ↔ Staging (18 cols).

Lösungspfade siehe Tech-Debt-Block „2026-05-02 Staging-Plans-Lücke".

### 12. service_role-Grants auf älteren Hetzner-Tabellen fehlen → Silent-NULL bei Edge-Function-Lookups

Auf Hetzner Self-Host existiert der `GRANT ALL ON ALL TABLES TO authenticated`-Hotfix seit Cutover-Phase-1+2, der die Default-Grant-Lücke für authenticated schließt. **Dieser Hotfix deckt aber `service_role` NICHT ab.**

Konsequenz: jede Edge-Function die ältere Tabellen (`user_preferences`, `teams`, `accounts`, etc. — alles was vor 2026-05-12 angelegt wurde) via service-role-Client liest, läuft in **silent permission-deny**:

- `supabase.from('user_preferences').select(...).maybeSingle()` → `{ data: null, error: 'permission denied' }`
- Wenn der Code nur `data` ausliest und `error` ignoriert → kommt einfach null zurück, ohne Throw

**Symptom:** Function läuft, Logs zeigen "serving the request" ohne Errors, aber Lookup-Werte sind unerwartet NULL. Schwer zu diagnostizieren wenn niemand das error-Feld checkt.

**Fix:** explizite `GRANT SELECT ON public.<table> TO service_role` für jede neue Lookup-Tabelle. Für die Activity-Phase-A waren das `user_preferences` + `teams` — siehe Migration `20260513090000_user_activity_service_role_grants.sql`.

**Defensive Code-Konvention (zur Vermeidung künftiger Silent-NULLs):** Edge-Functions sollten `error`-Field aus supabase-js immer auslesen und entweder loggen (`console.warn`) oder ins Audit-Log mit `[CTX]`-Prefix protokollieren — nicht stille `null`-Returns akzeptieren.

Entdeckt 2026-05-13 beim Phase-A-Activity-Tracking-Smoke. Gehört in dieselbe Klasse wie der pm-Grant-Stolperer (Top-Fallstrick #3).

### 11. Deno-Cache auf Hetzner Edge-Runtime → `docker restart` bei strukturellen Änderungen

Bei Volume-mounted Edge-Functions (`/opt/supabase/docker/volumes/functions/<name>/`) reicht der Auto-Reload-Mechanismus **nur für triviale Edits** (z.B. String-Konstanten, Body-Logik in derselben Funktion-Signatur). Bei strukturellen Änderungen — neue/entfernte Lookup-Queries, geänderte Helper-Imports, andere Schema-Annahmen — hält Deno die alte compiled Version im Isolate-Cache.

**Symptom:** Code grep't korrekt auf dem Volume, `md5sum` zeigt neue File, aber Behavior bleibt unverändert. Function-Logs zeigen "serving the request" aber keine der neuen Log-Spuren.

**Lösung:** nach jedem Function-Deploy mit struktureller Änderung:
```bash
ssh root@<staging-or-prod> "docker restart supabase-edge-functions"
```

Triggert Deno-Cache-Clear + Recompile beim nächsten Call. ~3 Sekunden Downtime auf der Function (akzeptabel für Staging, bei Prod ggf. Maintenance-Window). Entdeckt 2026-05-12 beim Phase-A-AI-Activity-Tracking-Smoke.

---

## Process-Conventions

### „los X-Y" Apply-Workflow (Convention seit 2026-05-02)

Vermeidung von Verfahrensbrüchen bei DB-Mutationen:

- **„los"** alleine = „weiter mit Plan, ohne automatische DB-Mutation"
- **„los apply"** / **„los staging-apply"** / **„los prod-apply"** mit Scope-Wort = explizite Authorisierung für DB-Operation
- Bei Unsicherheit fragt Claude vor dem Apply nochmal nach

Andere Operationen (Commits, Pushes, File-Edits, lokale Builds, Read-only-Diagnose-Queries) brauchen kein Scope-Wort.

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

## Aktueller Release-Stand (Stand 2026-05-18)

- **Multi-Provider-AI-Release: bereits LIVE auf main** — Memory-Annahme "13+ Commits held" stimmte nicht mit Repo-State überein (entdeckt 2026-05-13 beim Phase-A-Prod-Cutover, develop war nur 7 Commits ahead von main mit allen Phase-A-Commits + 1 Wizard-UI). Lesson für künftige Roll-out-Planung: Repo-State (`git log origin/main..origin/develop`) ist Source-of-Truth bei Konflikten mit Memory-Annahmen.
- **User-Activity-Tracking Phase A** (Backend): **LIVE auf Prod seit 2026-05-13.** Migrations auf 128.140.123.163 applied (4 stück: schema + login-trigger + admin-RPCs + service_role-grants), generate-Edge-Function deployed mit logAiUsage + JWT-userId + [CTX]-Error-Logging. Verifiziert per Browser-Smoke (Login + AI-Call, account_id+team_id korrekt populated).
- **User-Activity-Dashboard Phase B** (Frontend): **LIVE auf Prod seit 2026-05-13.** leadesk-admin main mergte feat/user-activity-dashboard-phase-b → Vercel auto-deployed admin.leadesk.de. Globale Route `/activity` + neuer Tab "Aktivität" in AccountDetail. recharts ^3.8.1 als Dep.
- **Hetzner-Prod**: live seit 2026-04-30 (Cloud→Hetzner-Cutover). 19 User auf Prod (Stand 2026-05-13), 15 Teams, alle Migrations applied incl. Activity-Tracking.
- **Hetzner-Staging hat 0 Plans** (Phase 3 wurde nur auf Prod geseedet) → handle_new_user-Trigger crashed bei jedem Sign-Up auf Staging. Siehe Top-Fallstrick #10.
- **Neue Routen:** `/projekte/:id` (ProjektDetail), `/zeiten` (Zeiterfassung), `/admin/plans` (Plan-Modules-Admin-UI, admin-only). Plus auf admin.leadesk.de: `/activity` + AccountDetail-Tab "Aktivität".
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
- `20260518120000_leads_is_favorite.sql` — Star-Feature für LeadDetail (auch auf Hetzner-Prod applied 2026-05-18; Column war dort schon angelegt, Index wurde idempotent nachgezogen)

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

### 2026-05-02 — Admin-RPC-Suite Phase 1 (Hetzner-Staging applied, Frontend NICHT angefangen)

Ziel: Migration der `/admin/users`-Funktionalität von app.leadesk.de nach admin.leadesk.de mit Account-zentrischer Tab-Struktur.

**5 Migrations applied auf Hetzner-Staging** (Commit `3f6fbf4`, gepusht auf `develop`, Vercel-Build grün):

1. `20260502160000_admin_rpcs_jwt_claim_lockdown.sql` — Auth-Pattern-Lockdown von `profiles.role='admin'` auf `is_leadesk_admin`-JWT-Claim für 6 RPCs (admin_list_users, admin_list_pending_users, admin_create_user, admin_set_role, admin_grant_license, admin_delete_user). `upsert_subscription` bleibt unangetastet (Webhook-Pfad).
2. `20260502161000_admin_account_set_plan.sql` — neue RPC für Account-zentrischen Plan-Wechsel mit Audit-Trail (Reason ≥10 Zeichen).
3. `20260502162000_admin_account_delete.sql` — neue Cascade-Delete-RPC mit Hybrid-FK-Discovery (FK-Pfad + Column-Name-Fallback für knowledge_base/target_audiences), Solo-User-Detection, p_delete_auth_user-Opt-In, path-basiertem Storage-Cleanup.
4. `20260502163000_get_account_members.sql` — neue Read-RPC, Cross-Schema-Join. Verwendet `profiles.global_role` (user_role enum) statt Legacy `profiles.role`.
5. `20260502164000_get_orphan_users.sql` — Read-only Diagnose-Sicht für User ohne accounts/team_members.

**Smoketest-Ergebnis** (alle gegen Hetzner-Staging):
- Auth-Lockdown: **10/10** RPCs werfen „Not authorized" ohne is_leadesk_admin-Claim ✓
- 4 NEW RPCs (set_plan, delete, members, orphan): funktional korrekt ✓
- 4 LEGACY RPCs aufgedeckt als pre-existing broken durch Schema-Drift (siehe Tech-Debt unten)

**get_orphan_users zeigt 2 echte Orphan-User auf Staging** — Diagnose-Material für die handle_new_user-Trigger-Session.

**Frontend in leadesk-admin: NICHT angefangen.** Nur Branch `develop` angelegt (gepusht). AccountDetail.jsx-Tab-Refactor + 4 neue Components (MembersTab, SubscriptionTab, ActionsTab, OrphanUsersTab) liegen vor uns.

### 2026-05-02 — Tech-Debt aus Admin-RPC-Suite Phase 1 (offen)

#### Schema-Drift in Legacy-Admin-RPCs (post-Cutover broken)

Aufgedeckt durch Phase-1-Smoketest. **NICHT durch Lockdown-Migration verursacht** — Bugs existierten pre-Lockdown, nur niemand hat die RPCs nach Cutover aufgerufen.

| RPC | Bug | Status |
|-----|-----|--------|
| `admin_list_users` | `COALESCE(s.plan_id, 'free')::text` — `subscriptions.plan_id` ist seit Cutover uuid, text-Literal 'free' ist ungültiger uuid-Cast | **Bewusst nicht gefixt**: wird in admin.leadesk.de nicht aufgerufen, Account-Liste ersetzt das. RPC ist effektiv tot. |
| `admin_create_user` | `INSERT/UPDATE profiles (..., role) VALUES (..., p_role)` — profiles.role auf Staging ist user_role enum, p_role ist text → fehlender Cast. **Plus**: `handle_new_user`-Trigger crashed davor (siehe Top-Fallstrick #10). | **Drift-Fix-Migration vorbereitet** (siehe „Drift-Fix-Migration auf Disk" unten), nicht applied. End-to-End-Funktionalität blockiert durch Plans-Lücke. |
| `admin_set_role` | `UPDATE profiles SET role = new_role` — gleiche Cast-Problem. | **Drift-Fix-Migration vorbereitet** (selbe Datei wie admin_create_user-Fix), nicht applied. |
| `admin_grant_license` | `UPDATE profiles SET ... plan_expires_at = ...` — Spalte `profiles.plan_expires_at` existiert auf Staging gar nicht. | **Bewusst nicht gefixt**: Schema-Klärung nötig (war beim Cutover gedroppt? nie migriert?). RPC selten gerufen. Eigene Frage. |

**pg_proc-Audit bestätigt**: nur 2 Funktionen (admin_create_user + admin_set_role) schreiben auf profiles.role. Drift-Fix mit 100% Writer-Coverage möglich.

#### Drift-Fix-Migration applied (2026-05-02 abend)

- File: `supabase/migrations/20260502170000_admin_rpcs_post_cutover_drift_fix.sql`
- md5: `51c69bb585a01f5e91b707b20a007f4a`
- 185 Zeilen
- Commit: `72e3bc7` auf `develop`, Apply auf Hetzner-Staging sauber (BEGIN/CREATE FUNCTION ×2/COMMIT)
- Switcht admin_create_user + admin_set_role von `profiles.role` (Legacy text/enum drift) auf `profiles.global_role` (user_role enum, kanonisch) mit explizitem `::user_role`-Cast

**Smoketest-Bilanz** (gegen Hetzner-Staging, admin user 185fa300-... = michael@leadesk.de):

| Test | Outcome |
|------|---------|
| Phase A — admin_set_role + admin_create_user ohne is_leadesk_admin-claim | ✓ beide „Not authorized: is_leadesk_admin claim required" |
| Phase B1 — admin_set_role mit admin claim, real user, valid_role=`admin` | ✓ UPDATE durchgelaufen, global_role: user→admin |
| Phase B2 — admin_set_role mit admin claim, real user, invalid_role=`foobar` | ✓ Cast Exception „invalid input value for enum user_role" |
| Phase ROLLBACK | ✓ global_role zurück auf 'user', kein permanenter Schaden |
| Phase D — admin_create_user mit admin claim, neuer Email | ✗ blockiert durch upstream `profiles_plan_id_check` (NICHT durch unsere Migration — RPC-Body-Fix selbst ist korrekt, Trigger crashed davor) |

**Resultat**: admin_set_role end-to-end funktional ✓. admin_create_user-Code korrekt, aber end-to-end blockiert durch separaten upstream Bug (siehe `profiles.plan_id`-Drift unten).

#### Staging-Plans-Seed applied (2026-05-02 abend)

- File: `scripts/seed-staging-plans-from-prod.sql`
- md5: `7d91ce55fefd54c7bad743d3d696d2fa`
- Commit: `84374dd` auf `develop`, Apply auf Hetzner-Staging sauber (`INSERT 0 4`)
- Pfad-Wahl: **(A) Prod-Replikat** mit hardcoded UUIDs (Cross-Env-Konsistenz beim Debugging)
- Schreibt nur die 14 Common-Spalten zwischen Prod (32) und Staging (18); Legacy-Spalten (`price_eur`, `seats`, `daily_limit` etc.) weggelassen weil Staging sie nicht hat
- `ON CONFLICT (id) DO NOTHING` — Re-Run-safe

Hetzner-Staging-plans hat jetzt 4 Rows mit identischen UUIDs zu Prod (free/starter/pro/enterprise). handle_new_user-Trigger findet Free-Plan via `WHERE LOWER(name)='free'` ✓.

**Prod-plans-IDs für Referenz** (auch identisch auf Staging):
- Free: `ea98eafd-0e71-4755-a275-982e6f5aaea6`
- Starter: `7dd9eb1d-6c4c-4564-9098-e82389fde433`
- Pro: `5d68d70a-4c54-4daf-b57b-ae98851851b1`
- Enterprise: `c4c11445-9f97-409a-bfd3-9c9f873c049b`

#### profiles.plan_id text-uuid-CHECK-Drift (2026-05-02 entdeckt, NICHT gefixt)

Dritte Schicht Schema-Drift, aufgedeckt durch admin_create_user-Smoketest nach Plans-Seed + Drift-Fix-Apply.

**Drei nested Drifts**:
1. `profiles.plan_id` ist `text` (Legacy von vor Cutover) — andere plan_id-Spalten (`accounts`, `subscriptions`, `stripe_subscriptions`) sind seit Cutover Phase 1+2 `uuid`
2. `profiles_plan_id_check` enthält Old-Cloud-Naming-Whitelist:
   ```sql
   CHECK (plan_id IN ('free','starter','professional','business','enterprise'))
   ```
   `'professional'`/`'business'` sind altes Naming, neue Konvention ist `'pro'`/`'enterprise'`
3. `handle_new_user`-Trigger schreibt jetzt uuid (gefunden via `WHERE LOWER(name)='free'` aus seedeten plans-Rows) in profiles.plan_id → auto-Cast uuid→text → String `'ea98eafd-...'` matched keine Whitelist-Werte → CHECK-Constraint-Fail

**Konsequenz**: Sign-Ups auf Staging weiterhin blockiert (auch via `admin_create_user`). Auf Prod gleiche Konstellation, aber dort wurden noch keine Sign-Ups versucht post-Cutover.

**Drei Lösungspfade** (Entscheidung in eigener Session, alpha-fix vermutlich okay falls Frontend nicht profiles.plan_id liest):
- **(α)** `ALTER TABLE profiles DROP CONSTRAINT profiles_plan_id_check;` — 1-Zeilen-Migration, sofort funktional. Aber: profiles.plan_id bleibt text mit uuid-String-Werten. Frontend, das plan_id als uuid liest, würde brechen.
- **(β)** `profiles.plan_id` von text→uuid migrieren + FK auf plans(id) + CHECK drop. Sauberster Endzustand, Phase-4-typisch. Größere Migration mit Daten-Konversion (bestehende text-Werte auf uuid-Lookup mappen).
- **(γ)** `handle_new_user`-Trigger anpassen: schreibt slug='free' (text) statt uuid in profiles.plan_id, Whitelist um 'pro'/'enterprise' erweitern. **Funktional korrekt aber verfestigt Tech-Debt. NICHT empfohlen für Phase 4.**

**Empfehlung (β)**: gehört in dieselbe Refactor-Session wie `profiles.role` vs `profiles.global_role` (Phase 4 Schema-Cleanup, siehe Top-Fallstrick #9). Beide sind text/enum-Spalten-Drifts mit Legacy-Last und betreffen das gleiche Tabelle.

#### profiles.id → auth.users.id FK fehlt (2026-05-11 entdeckt, NICHT gefixt)

- `profiles.id` hat **keinen FK auf `auth.users(id)`** auf Hetzner-Prod
- **Folge:** PostgREST-Embed-Pattern `table:profiles!fk_name(...)` resolvet nicht — kein transitive FK-Chain über `auth.users`
- Aufgedeckt bei Leads-Redesign-PR 2 (useLeads.js LEADS_SELECT) — Owner-Join deferred auf PR 3
- **Workaround in Code (PR 3, deployed):** `src/hooks/useProfiles.js` — batched `.in('id', ownerIds)`-Query auf profiles mit Module-Level-Cache + Missing-ID-Null-Cache. Komponenten konsumieren `lead.owner_id` (raw uuid) + `profilesById.get(id)` als Lookup-Map. Einträge im Tracker bleiben weil **DB-Fix ausstehend** (FK selbst existiert immer noch nicht).
- **Fix (für Phase-4-Schema-Cleanup-Sprint, nicht ad-hoc):**
  ```sql
  -- Vorher prüfen ob Orphan-Profiles existieren:
  SELECT count(*) FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);
  -- Wenn 0 → safe zu applien:
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id)
    REFERENCES auth.users(id) ON DELETE CASCADE;
  ```
- Gehört in dieselbe Refactor-Session wie `profiles.plan_id` text→uuid (β) und `profiles.role` vs `global_role` (Top-Fallstrick #9) — alles betrifft die profiles-Tabelle und sollte als ein Sprint angefasst werden

#### Icon-Convention-Drift: lucide-react vs IcXxx-Inline-SVG (Status 2026-05-11, PR 4.5 — Hybrid etabliert)

- **Bestehende Codebase-Konvention:** Inline-SVG-Icons (`IcUsers`, `IcKey`, `IcBrain` etc.) in `src/components/Layout.jsx`, zero-dep
- **Neu in PR 2 (Leads-Redesign Beta):** `lucide-react@^1.14.0` als Dependency, 30+ Icons in den neuen Components
- **PR 4.5 (Pre-Promote-Cleanup):** Hybrid-Konvention finalisiert
  - lucide-react bleibt als Default für Generic-Icons (Calendar, Mail, Phone, Plus, Target, etc.)
  - Brand-/Custom-Glyphs die in lucide@1.14.0 fehlen → lokales `IcXxx`-Inline-SVG pro Component (Pattern: `src/components/leads/IcLinkedin.jsx`)
  - Begründung: 30-Icon-Migration auf IcXxx-Set wäre 1-2 h Sourcing-Aufwand für minimalen Konsistenz-Gewinn — ein Brand-Glyph als Inline-Komponente kostet 20 Zeilen und ist zero-risk
- **Folge-Decisions (optional, nicht blocking):**
  - lucide-react Upgrade auf neuere Major (≥0.3xx hat `Linkedin` und mehr Brand-Icons)? Hat Risiko für andere Icon-Renames, lohnt sich nur wenn mehrere Brand-Icons gebraucht werden
  - Falls weitere Brand-Glyphs auftauchen (X, GitHub, Slack etc.) → einfach jeweils ein `IcXxx`-File anlegen, kein Sprint-Aufwand

#### Phase-1-Status (Stand 2026-05-02 abend)

- ✓ 5 RPC-Migrations applied auf Hetzner-Staging (Lockdown + admin_account_set_plan + admin_account_delete + get_account_members + get_orphan_users)
- ✓ 1 Drift-Fix-Migration applied (admin_set_role + admin_create_user, post-cutover Schema-Drift)
- ✓ 1 Plans-Seed angewendet (4 Pläne auf Staging mit Prod-UUIDs)
- ○ Frontend-Migration in admin.leadesk.de: develop-Branch angelegt + gepusht, eigentliches Coding noch nicht angefangen
- ⚠ Bekannte Restriktion: kein End-to-End Sign-Up-Test möglich bis profiles_plan_id_check geklärt (admin_set_role ist verifiziert, admin_create_user nur RPC-intern verifiziert)

### 2026-05-11 — Leads-Redesign Cutover (PR 5)

**Cutover-Punkt:** `/leads-v2` ist der Default-Pfad geworden.

**File-Renames (git-tracked):**
- `src/pages/Leads.jsx` (alt, 200-Spalten-Liste mit LeadDrawer + OrganizationPicker) → `src/pages/_legacy/Leads.legacy.jsx`
- `src/pages/LeadRow.jsx` (alt, Sub-Component nur von Leads.jsx benutzt) → `src/pages/_legacy/LeadRow.legacy.jsx`
- `src/pages/Leads.v2.jsx` → `src/pages/Leads.jsx` (Promote)

**Routes (App.jsx):**
- `/leads` → neue Leads-Page (war /leads-v2)
- `/leads/:id` → neue LeadDetail-Page (war /leads-v2/:id, vorher LeadProfile)
- `/leads-v2` → `Navigate to /leads` (id-preserving Übergangs-Redirect)
- `/leads-v2/:id` → `LeadV2DetailRedirect` (useParams → /leads/:id)

**Übergangs-Redirects entfernen in PR 6** nach 7d Prod-Smoke (Beta-Bookmarks der Test-User sind dann veraltet).

**Orphan-Codes nach PR 5 (PR-6-Cleanup-Material):**
- ~~`src/pages/LeadProfile.jsx`~~ — **PR 5.1 reanimiert** als Handler für den Magic-Path `/leads/new` (Create-Form). Route `<Route path="/leads/new" element={<LeadProfile />}>` steht VOR `/leads/:id` damit der String-Match zuerst greift. LeadProfile.jsx ist damit kein Orphan mehr, sondern aktiv. Eigene moderne Create-Form-Migration → Phase 6.
- `src/lib/featureFlags.js`-Flag `leadsV2` — deprecated, kein Reader mehr. localStorage-Werte aufräumen optional.
- Diverse Mock-Konstanten in LeadDetail.jsx (`noteInputWrapStyle`, `noteInputStyle`, `Paperclip`/`Smile`-Imports) — werden bei Phase-6-Activity-Hook wiederverwendet, bewusst behalten.

**PR-6-Scope-Vorschlag:**
1. `/leads-v2*` Routes + `LeadV2DetailRedirect`-Component löschen
2. `src/pages/_legacy/` komplett löschen (Leads.legacy.jsx + LeadRow.legacy.jsx)
3. `src/pages/LeadProfile.jsx` → moderne Create-Form migrieren (eigener Mini-Sprint, Phase 6), danach LeadProfile.jsx löschen + `/leads/new`-Route auf neue Component zeigen
4. `src/lib/featureFlags.js` `leadsV2`-Deprecation-Kommentar wegräumen wenn kein neuer Flag in den Slot kommt

**Hotfix-Tracker:**
- **PR 5.1 (2026-05-11):** `/leads/new` hatte gecrashed mit "column leads.location does not exist" — LeadProfile.jsx in App.jsx wieder importiert, neue Route `/leads/new → LeadProfile` VOR `/leads/:id` eingefügt damit der String-Match priorisiert wird. Magic-Path-Reanimation, bis Create-Form in Phase 6 modernisiert wird.

### 2026-05-11 — Phase 6 Activity-Feed Backlog

`useLeadActivities(leadId)` — eigener Sprint mit UX-Design-Doc-First. PR 4.5 hat das Activity-Mock-Card auf der LeadDetail-Page durch einen ehrlichen "Bald verfügbar"-Empty-State ersetzt, damit der Trust-Bug bei Promote (PR 5) entfällt.

**6 Source-Tabellen-Discovery (Hetzner-Prod, 2026-05-11):**
- `activities` (primary): generic, FK leads.id CASCADE — meeting, call, email-manual, note
- `lead_field_history`: audit, FK leads.id CASCADE — status_changes, score_changes
- `linkedin_messages`: outreach
- `vernetzungen`: FK leads.id SET NULL — connection_accepted/sent
- `lead_tasks`: FK leads.id CASCADE — task_created/completed
- `email_send_log`: auto-emails

**Unified ActivityItem-Shape (Design-Vorschlag):**
```
{ id, type, timestamp, actor (profile), payload, lead_id }
```
Render via `ACTIVITY_VARIANTS` (icon + color pro type), wie im Pre-PR-4.5-Mock.

**Implementations-Optionen:**
- Server-side: SQL-View `lead_activity_feed` ODER Edge-Function für die Union (single round-trip)
- Client-side: 6× parallel-fetch via `useLeadActivities` + merge + sort by timestamp DESC (mehr Latenz aber kein neuer Backend-Endpoint)

**Pre-Sprint:** UX-Design-Doc + Mock-Up klären:
- Was zählt als "Activity"? (Field-History-Spam vs. echte User-Actions trennen)
- Wer ist der `actor` bei system-generated events (z.B. ai-score-bump)?
- Filter pro Type sinnvoll? (Default-View vs. "Alle anzeigen")
- Pagination/Cursor bei N>50 Activities?

Ohne Design verkommt der Feed zu einer messy Liste. Sprint-Reihenfolge: Mock-Up → Approve → Hook+View → Render. Nicht Hook-First.

**Pre-PR-4.5-Mock-Block** (für späteren Vergleich): hat ACTIVITY_VARIANTS mit `meeting`/`score`/`message`/`connection`, DayDivider-Pattern, optional quote-block. Ist im Git-History bei Commit `9eb5f83` (PR 4) noch sichtbar.

### 2026-05-18 — LeadDetail Edit-Pipeline (Inline-Edit + Star + Picker)

**Was war kaputt:** Die LeadDetail-Page aus dem PR-5-Promote (2026-05-11) war ein Static-Layout — fast alle interaktiven Slots hatten **keinen `onClick`-Handler**. LinkedIn-Button tot, Star-Button tot, Status-Pill `onClick={() => {}}` Stub, Tags read-only inkl. „+Tag"-Pill, ContactRows read-only, Hero (Name/Job/Company) nicht editierbar, Metrics (Score/Followup/Deal-Wert/Source) nicht editierbar, Owner-Picker fehlt. Vom User entdeckt 2026-05-18 beim Lead-Detail-Workflow.

**Lesson für künftige Redesign-Promotes:** Nach Layout-Heavy-Redesign-PRs immer eine Edit-Pipeline-Verification machen — Layout-Stubs sind leicht zu missen, weil das UI „fertig aussieht". Ein Pre-Promote-Smoke „jeder Button / jeder Cursor:pointer / jeder Input macht etwas Sinnvolles" hätte das vor PR 5 gefangen.

**Was jetzt live ist (Prod, Commit `af07a0f`):**

- LinkedIn-Button → `window.open(linkedin_url)` mit `https://`-Fallback
- Star-Button toggelt `leads.is_favorite` (neue Column, team-weit sichtbar, kein Per-User)
- Status-Pill → Popover mit allen 5 CRM-Werten; `status` separat updaten (Top-Fallstrick #1)
- Tags: add via Pill+Input mit Enter, remove via X auf Pill
- Owner: Avatar / „+"-Button öffnet `OwnerPicker` mit `team_members`-Liste + Suche + „Niemand"-Option
- Inline-Edit auf: Name (Hero, Composite split first/last), Job-Title, Company, Notes (multiline), Score, Nächste Aktion (date), Deal-Wert, Quelle, Email, Telefon, LinkedIn-URL, Ort
- Sparkles + 3-Punkte-Menü als `disabled` mit „(demnächst)"-Tooltip — eigene Sprints

**Neue Bausteine in `src/components/leads/`:**
- `InlineEditField.jsx` — universell, text/number/date + multiline-Variante, Hover-Pencil, Enter speichert, Escape verwirft
- `TagEditor.jsx` — Tags-CRUD-Pills
- `OwnerPicker.jsx` — Modal mit Member-Liste + Suche
- `StatusPicker.jsx` — Popover unter der Pill, outside-click-close

**Hook-Update:** `useLead.js` exportiert jetzt `updateLead(patch)` mit Optimistic-Update + Rollback-via-Refetch bei Fehler. `LEADS_SELECT` in `useLeads.js` um `is_favorite` ergänzt.

**Migration:** `20260518120000_leads_is_favorite.sql` — `ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false` + partial index `idx_leads_favorite (team_id, is_favorite) WHERE is_favorite = true`. Idempotent. Auf Hetzner-Staging **und** Hetzner-Prod (128.140.123.163) applied 2026-05-18, mit `NOTIFY pgrst, 'reload schema'`. Interessanter Fund: Column war auf Prod schon angelegt (vermutlich altes manuelles SQL-Editor-Setup ohne Index) — Migration hat den Index als komplettierenden Teil sauber nachgezogen.

**Cherry-Pick-Pfad:** `61c69bd` (develop) → `af07a0f` (main) clean, no conflicts. Hard-Rule #1 respektiert (kein `git merge develop`).

**Offene Folge-Sprints aus dieser Iteration:**
- Sparkles-Button → KI-Analyse für einen einzelnen Lead (vermutlich Edge-Function-Call analog `generate` mit lead-spezifischem Prompt)
- 3-Punkte-Menü → Dropdown mit „Archivieren / Löschen / Duplizieren" o.ä.
- Status-Pill könnte den Picker invariant per Keyboard öffnen lassen (Enter auf der Pill) — aktuell nur Click

### Offene Bugs (low priority)

- **Pipeline „Gewonnen"-Spalte zeigt 0 Deals** trotz vorhandenem gewonnenem Deal auf Staging. Verdacht: deals.team_id NULL ODER Stage-Casing-Mismatch ODER vergessener Filter in Pipeline.jsx. Nicht blockierend.
- **Frontend Model-Dropdown-Drift `gpt-5.5`** (entdeckt 2026-05-12 beim Phase-A-Smoke): Im UI auswählbar, aber OpenAI hat das Modell nicht → API-call gibt "model not found" → Edge-Function loggt sauber als `status='error'` (kein Datenkorruption-Risiko). Schema-Drift zwischen UI-Model-Constants und tatsächlich-OpenAI-supported Liste. Ticket-würdig: UI-Modell-Liste mit Provider-API sync'en oder aus pricing-tabelle ableiten.

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
