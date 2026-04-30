# Module-basierte Plan-Freischaltung — Rollout-Plan

Dieser Branch fügt eine **modul-basierte Bereich-Freischaltung pro Plan** hinzu.
Pläne können über das Admin-UI (`/admin/plans`) angelegt werden mit individueller
Auswahl der 6 App-Bereiche: Branding, CRM, LinkedIn, Content, Projektumsetzung,
Reports.

Die Architektur folgt dem bestehenden Account-Modell: **Plan hängt am Account**
(`accounts.plan_id`), nicht parallel an `auth.users`. Begründung siehe Diskussion
im Chat.

## Was kommt in diesem PR

### Neue Files

| Datei | Zweck |
|-------|-------|
| `supabase/migrations/20260502100000_plans_modules.sql` | Spalten `modules`, `is_active`, `is_trial`, `trial_days`, `is_default_trial` auf `plans` + Backfill bestehender Pläne (alle 6 Module) + RLS auf `plans` |
| `supabase/migrations/20260502110000_module_entitlements_rpcs.sql` | RPCs `account_has_module`, `i_have_module`, `get_my_entitlements` |
| `supabase/migrations/RLS_LOCKDOWN_TEMPLATE.sql.template` | Vorlage für späteren RLS-Lockdown — **nicht direkt anwenden** |
| `src/lib/modules.js` | Modul-Konstanten (Keys, Labels, Routen-Map, Sidebar-Divider-Mapping) |
| `src/hooks/useEntitlements.js` | Hook → liest `get_my_entitlements()` |
| `src/components/ModuleGuard.jsx` | Route-Guard-Komponente (noch nicht in App.jsx aktiviert) |
| `src/pages/AdminPlans.jsx` | Admin-UI: Plan-Liste + Editor mit 6 Modul-Toggles |

### Geänderte Files (minimal-invasiv)

| Datei | Änderung |
|-------|----------|
| `src/App.jsx` | Import + Route `/admin/plans` (admin-only) |
| `src/components/Layout.jsx` | Import + `useEntitlements`-Hook + Sidebar-Section-Filter + Admin-Menü-Eintrag „Pläne & Module" |

## Was sich für Bestandsuser ändert

**Funktional gar nichts**, solange du die RLS-Templates nicht aktivierst:

- Backfill setzt alle bestehenden Pläne (`free`, `starter`, `pro`, `enterprise`)
  auf alle 6 Module → keine Sidebar-Gruppe wird ausgeblendet
- ModuleGuard ist gebaut aber in `App.jsx` **nicht** angewendet — Routen sind
  weiter offen wie vorher
- Bestehende `PlanGate`/`KiGate` mit Boolean-Features bleiben unverändert
  funktionsfähig (`feature_brand_voice`/`feature_pipeline`/`feature_reports`/`ai_access`
  werden vom Plan-Editor zukünftig automatisch aus den Modulen abgeleitet)

Das Sichtbar-Werden für User passiert in zwei Schritten, jeweils nach explizitem Go:

1. **Sidebar-Filter aktivieren** (= Module-basiertes Ausblenden in der Sidebar)
   → automatisch sobald ein Plan mit weniger als 6 Modulen einem Account zugewiesen wird
2. **RLS-Lockdown pro Modul** (= echte Datenisolation auf DB-Ebene)
   → manuell pro Modul über die Templates

## Bekannte Vorbedingung — `plan_id`-Typ-Mismatch

Mir ist beim Code-Audit ein Datentyp-Mismatch aufgefallen, den ich hier **nicht
gefixt** habe (außerhalb des Feature-Scopes):

- `public.plans.id` ist `text` (legacy, Migration `20260416000001_staging_schema.sql`)
- `public.accounts.plan_id` ist `uuid` (Migration `20260428200000_accounts_phase1_additive.sql`)

Falls die Account-Phase-1-Migration auf Hetzner durchgelaufen ist, MUSS einer
der beiden Typen zwischenzeitlich harmonisiert worden sein, sonst hätte Postgres
beim FK-Constraint geschrien. Bitte vor Anwendung meiner Migrationen prüfen:

```bash
ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres -c "
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE (table_name = ''plans'' AND column_name = ''id'')
     OR (table_name = ''accounts'' AND column_name = ''plan_id'');
"'
```

Beide Typen sollten identisch sein. Falls nicht: vor meiner Migration einen
Type-Sync durchführen. Falls beide `text` sind (am wahrscheinlichsten), passt alles.

## Anwendungs-Reihenfolge

### 1. Staging — Migrationen anwenden

```bash
# Migration 1: plans-Schema-Erweiterung + Backfill
ssh root@178.104.210.216 \
  'docker exec -i supabase-db psql -U postgres -d postgres' \
  < supabase/migrations/20260502100000_plans_modules.sql

# Migration 2: RPCs
ssh root@178.104.210.216 \
  'docker exec -i supabase-db psql -U postgres -d postgres' \
  < supabase/migrations/20260502110000_module_entitlements_rpcs.sql
```

### 2. Verifikation auf Staging

```sql
-- Beispiel-Checks im psql
\d plans
SELECT id, name, modules, is_active, is_trial, trial_days FROM plans ORDER BY sort_order;

-- RPC als ein User testen (vorher SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = 'USER-UUID';)
SELECT * FROM get_my_entitlements();
SELECT i_have_module('crm');

-- Sollte true liefern für alle 4 Default-Pläne, weil Backfill alle Module setzt
SELECT account_has_module(id, 'crm') FROM accounts LIMIT 5;
```

### 3. Frontend-Push (develop)

```bash
cd <localrepo>
git checkout develop
git pull origin develop
git add supabase/migrations/20260502100000_plans_modules.sql \
        supabase/migrations/20260502110000_module_entitlements_rpcs.sql \
        supabase/migrations/RLS_LOCKDOWN_TEMPLATE.sql.template \
        src/lib/modules.js \
        src/hooks/useEntitlements.js \
        src/components/ModuleGuard.jsx \
        src/pages/AdminPlans.jsx \
        src/App.jsx \
        src/components/Layout.jsx
git commit -m "feat: Module-basierte Plan-Freischaltung — Admin-UI + Hook + Migrationen"
git push origin develop
```

### 4. Staging-Test (`staging.leadesk.de`)

Hard-Refresh (`Cmd+Shift+R`), dann:

1. **Als Admin-User einloggen** → User-Menü öffnen → unter „Admin" → „Pläne & Module"
   sollte sichtbar sein → Klick auf den Eintrag öffnet `/admin/plans`
2. **Plan-Liste**: alle 4 Default-Pläne (free/starter/pro/enterprise) sollten
   gelistet sein, alle mit allen 6 Modul-Chips (weil Backfill)
3. **Neuen Test-Plan anlegen**: „Trial Branding-only", 14 Tage, nur Branding-Modul,
   `is_default_trial = true`
4. **Plan einem Test-Account zuweisen**: per SQL auf Hetzner-DB:
   ```sql
   UPDATE accounts SET plan_id = 'trial-branding-only', status = 'trialing',
                      trial_ends_at = now() + interval '14 days'
   WHERE billing_email = 'TEST-USER-EMAIL';
   ```
5. **Als Test-User einloggen**: in der Sidebar sollten **nur** Branding-Items
   sichtbar sein, plus Always-on (Dashboard, Assistant, Settings, Billing)
6. **Browser-Console** auf Errors prüfen (`useEntitlements`-Logs etc.)

### 5. Changelog-Eintrag (auf `app.leadesk.de/admin-logs`)

- Typ: `feat`
- Tags: `db-change`, `admin`, `plans`, `entitlements`
- Titel: „Module-basierte Plan-Freischaltung"
- Beschreibung: kurze Zusammenfassung was passiert ist + dass RLS-Lockdown
  separat folgt

### 6. Production-Cutover (nach explizitem Go)

Ablaufplan analog zu Staging:

```bash
# Migration 1 — über Supabase Dashboard SQL Editor
# https://supabase.com/dashboard/project/jdhajqpgfrsuoluaesjn/sql
# Inhalt von 20260502100000_plans_modules.sql kopieren und ausführen

# Migration 2 — gleicher Weg
# Inhalt von 20260502110000_module_entitlements_rpcs.sql ausführen

# Frontend: develop → main
git checkout main
git pull origin main
git merge develop
git push origin main
```

### 7. Später: RLS-Lockdown pro Modul (nicht in diesem PR)

Vorlage in `supabase/migrations/RLS_LOCKDOWN_TEMPLATE.sql.template`. Pro Modul:

1. Pre-Check ausführen (sind alle bestehenden Accounts auf einem Plan, der
   das Modul enthält?)
2. Block aus Template kopieren in neue Migration `YYYYMMDDHHMMSS_rls_lockdown_<modul>.sql`
3. Auf Staging anwenden, Smoke-Test je betroffene Tabelle
4. Nach 24h Bake-Time: auf Production anwenden

## Sidebar-Modul-Mapping (für Verifikation)

| Sidebar-Divider | Modul-Key | Ausgeblendet wenn fehlt |
|-----------------|-----------|--------------------------|
| Branding | `branding` | Brand Voice, Zielgruppen, Wissensdatenbank, Profiltexte |
| CRM (oder Sales) | `crm` | Kontakte, Unternehmen, Deals, Aufgaben, Lead Intelligence |
| LinkedIn | `linkedin` | Vernetzung, Nachrichten, Automatisierung |
| Content | `content` | Content Studio, Redaktionsplan |
| Projektumsetzung | `delivery` | Projekte, Zeiten |
| Reporting | `reports` | Reports, SSI-Tracker |

Always-on (nie ausgeblendet): Dashboard, Assistant, Konto/Billing, alle Admin-Routen.
