# Block 3.5 Discovery — Drift-Fix app.leadesk.de auf accounts.plan_id

**Stand:** 2026-05-04
**Discovery durch:** Claude (Opus 4.7), read-only, kein Push, kein Commit
**Datenquelle:** Hetzner-Prod-DB live SELECT-only, llr-dashboard local-main (sync `488cc04`)

---

## TL;DR

`subscriptions` ist **komplett leer auf Prod (0 Rows)**, alle 5 User haben `plan_managed_by='leadesk'`. Die Account-zentrische Infrastruktur existiert bereits (`get_my_entitlements`-RPC + `useEntitlements`-Hook + `AccountContext`) — sie wird nur **noch nicht von den Read-Sites benutzt**. 5 Files in app.leadesk.de lesen veraltete `profiles.plan_id`/`profiles.subscription_status`/`profiles.trial_ends_at` direkt; eine konsistente Migration auf `useEntitlements()` + Erweiterung von AccountContext um zwei Spalten wäre ein Big-Bang-PR à 3-4h.

---

## Live-Drift (Daten)

### Aggregat
- **Total user_account_pairs:** 5
- **Distinct Users:** 5
- **Users mit Subscription:** 0
- **Users ohne Subscription:** 5
- **Account managed_by 'stripe':** 0
- **Account managed_by 'leadesk':** 5
- **Orphan-User (kein team_members):** 1
- **Multi-Account-User:** 0

### Top-5-Drift-Beispiele (alle Live-User auf Prod)

| email | account_name | account_plan | sub_plan | sub_status | granted_via | plan_managed_by | plan_expires_at |
|---|---|---|---|---|---|---|---|
| michael@linkedinconsulting.digital | Linkedin Consulting | enterprise | NULL | — | stripe | leadesk | NULL |
| michael@leadesk.de | Leadesk Internal | enterprise | NULL | — | manual | leadesk | 2026-05-31 |
| michael.schreck@salesplay.digital | Linkedin Consulting | enterprise | NULL | — | stripe | leadesk | NULL |
| claude-smoketest-mode2@example.org | Linkedin Consulting | enterprise | NULL | — | stripe | leadesk | NULL |
| smoketest-421@example.org | Linkedin Consulting | enterprise | NULL | — | stripe | leadesk | NULL |

**Drift-Klasse:** Alle 5 User haben `accounts.plan_id=Enterprise` aber `subscriptions=NULL`. Das ist 100% Drift (jeder User wird in app.leadesk.de mit „Free + Trial" gezeigt obwohl Enterprise).

**Sec-Beobachtung:** Niedrig. User sehen einen *kleineren* Plan als sie tatsächlich haben (False-Negative-Anzeige), nicht umgekehrt. Modul-Filter blockt zwar zu viel Funktionalität — kein Sicherheitsproblem, aber UX-defekt.

### Beobachtung zu michael@leadesk.de
`plan_expires_at=2026-05-31` und `granted_via=manual` deuten auf einen real applied admin_grant_license_v2-Call (vermutlich nicht von Block-2-Smoke da der via ROLLBACK lief — könnte ein late-Test sein). **Kein Risiko**, aber Block-2-Spalten sind „in Wild use".

---

## Code-Read-Sites (llr-dashboard)

### Hauptproblem-Sites

| File | Zeile | Pattern | Drift-Risiko | Was tun |
|---|---|---|---|---|
| `src/components/Layout.jsx` | 327, 366, 369 | `useState('free')` + `supabase.from('profiles').select('full_name,plan_id,global_role,avatar_url')` → setPlanId | **HOCH** — Plan in Sidebar/Header falsch | Auf `useEntitlements().planName/planId` umstellen, profiles-Read auf nur `full_name,global_role,avatar_url` reduzieren |
| `src/components/TrialBanner.jsx` | 12, 26, 34, 39-48 | `select('subscription_status,trial_ends_at,plan_id')` aus profiles + `if (p.plan_id === 'enterprise') hide` (text-Match auf uuid → matcht NIE!) | **HOCH** — falsche Trial-Anzeige für ALLE User mit Enterprise | Komplett auf `useEntitlements().{is_trial, trial_ends_at, trial_days_left, account_status, plan_name}` umstellen + neue Banner-Logik (siehe Q1) |
| `src/pages/Billing.jsx` | 81, 102, 166-171 | 2x `from('profiles').select('plan_id,subscription_status,trial_ends_at')` + `trialDaysLeft` aus profile | **HOCH** — /billing zeigt falschen Plan + Trial-Days | Auf `useEntitlements()` + `useAccount()` umstellen, profiles-Reads weg |
| `src/pages/SettingsKonto.jsx` | 22, 23, 102 | `account?.plan_id` (gut!) + `<PlanCards currentPlanId={sub?.plan_id} periodEnd={sub?.period_end} />` (legacy) | **MITTEL** — hybrid, Plan-Display ok, PlanCards-Highlight falsch | PlanCards mit `account.plan_id` befüllen statt `sub.plan_id`; periodEnd auf `account.plan_expires_at` |
| `src/pages/Profile.jsx` | 246 | `profile?.plan_id || 'free'` als Display-Wert | **MITTEL** — Profile-Anzeige falsch | Auf `useEntitlements().planName` umstellen |

### Hilfsstellen

| File | Zeile | Pattern | Drift-Risiko | Was tun |
|---|---|---|---|---|
| `src/lib/useSubscription.js` | 14, 46, 56 | Stub mit `plan_id:'free'` Default + `PLANS[sub.plan_id]` Lookup + `isAtLeast(planId)` | **NIEDRIG** — nur SettingsKonto nutzt es | Bleibt als Legacy-Stub oder wird ganz weggeworfen wenn SettingsKonto migriert ist |
| `src/components/PlanCards.jsx` | 44, 58 | nimmt `currentPlanId` als Prop | NIEDRIG — Display-Komponente | Bleibt unverändert, Caller passt Prop-Wert an |
| `src/pages/AdminUsers.jsx` | viele | Plan-Reads in Admin-Surface | **IRRELEVANT** | Phase 5A hat Route disabled — File wird in Phase 5C komplett gelöscht |

### Bereits richtig

| File | Status |
|---|---|
| `src/context/AccountContext.jsx` | ✓ Liest accounts via teams.account_id (Account-zentrisch). Lädt: id, name, billing_email, plan_id, seat_limit, plan_managed_by, status, settings, trial_ends_at, created_at, updated_at. **Fehlt: plan_expires_at, granted_via** (Block-2-Spalten) |
| `src/hooks/useEntitlements.js` | ✓ Konsumiert `get_my_entitlements`-RPC. Liefert account_id, plan_id, plan_name, modules[], is_trial, trial_ends_at, trial_days_left, account_status, is_active. **Fehlt: plan_expires_at, granted_via** (RPC-Response müsste erweitert werden) |
| `get_my_entitlements`-RPC (DB) | ✓ Account-zentrisch (`teams.account_id` via team_members + user_preferences.active_team_id). Returns RPC-Response oben |
| `src/components/Layout.jsx` Z334+651 | ✓ Sidebar-Filter nutzt `useEntitlements().hasModule` — automatisch korrekt sobald RPC stimmt (was sie tut) |
| `src/components/ModuleGuard.jsx` | ✓ Nutzt useEntitlements |

---

## Trial-Banner-Logik (Quelle + Heuristik)

### Aktuell (`src/components/TrialBanner.jsx`)

```js
.from('profiles').select('subscription_status, trial_ends_at, plan_id')
if (p.plan_id === 'enterprise') hide  // ← Bug: profiles.plan_id ist uuid, matcht 'enterprise' nie
if (p.subscription_status === 'trialing' && p.trial_ends_at > now) → "Noch X Tage Trial"
if (p.subscription_status === 'expired' || expired-trial) → "Expired"-Banner
```

**Bugs:**
1. plan_id-Match auf String 'enterprise' matcht uuid-Wert nie → Banner wird NIE versteckt
2. profiles.subscription_status ist Legacy (default `'free'`), wird nicht aus accounts gepflegt
3. profiles.trial_ends_at ist user-zentrisch, bei Account-Sharing aber Account-zentrisch sinnvoller

### Billing-Trial-Calc (`src/pages/Billing.jsx:166`)

```js
trialDaysLeft = Math.ceil((profile.trial_ends_at - Date.now()) / (1000*60*60*24))
```

Hängt am gleichen profiles-Read.

### Architektur-Frage Q1 (siehe unten)

---

## Schema-relevant

### accounts (Plan-Spalten)

| Spalte | Typ | Nullable | Default |
|---|---|---|---|
| plan_id | uuid | YES | (FK plans) |
| plan_managed_by | text | NO | 'leadesk' (CHECK 'stripe'\|'leadesk') |
| plan_expires_at | timestamptz | YES | (Block-2-add) |
| granted_via | text | NO | 'stripe' (CHECK 'stripe'\|'manual'\|'trial', Block-2-add) |
| trial_ends_at | timestamptz | YES | |
| status | text | NO | 'trialing' (CHECK trialing\|active\|past_due\|suspended\|canceled) |

### plans (4 Rows, alle Module aktiv)

| id | slug | name | modules |
|---|---|---|---|
| ea98… | free | Free | branding, crm, linkedin, content, delivery, reports |
| 7dd9… | starter | Starter | branding, crm, linkedin, content, delivery, reports |
| 5d68… | pro | Pro | branding, crm, linkedin, content, delivery, reports |
| c4c1… | enterprise | Enterprise | branding, crm, linkedin, content, delivery, reports |

→ Aktuell sind alle Pläne modul-identisch (per Plan-Modules-Backfill). Modul-Filter feuert nur, wenn Plan-Curation aktiviert wird.

### subscriptions

**0 Rows. Effektiv tot.** 12 Spalten (id, user_id UNIQUE, plan_id, status, wix_*, current_period_*, cancelled_at, …) — wird nur noch von Wix-Webhook geschrieben (nicht aktiv) und von obigen 5 Frontend-Sites gelesen.

### team_members (account_members existiert NICHT)

User → Account-Mapping geht über `team_members.user_id → teams.account_id → accounts`. Pattern ist konsistent in `get_my_entitlements`-RPC und `AccountContext`.

---

## Refactor-Strategien

### Strategie A — Big Bang (empfohlen)

**Was:** alle 5 Read-Sites in einem PR auf `useAccount()` + `useEntitlements()` umstellen. Neue Trial-Banner-Logik. AccountContext-SELECT um `plan_expires_at, granted_via` erweitern. RPC-Erweiterung optional (siehe unten).

**Files:**
- EDIT `src/context/AccountContext.jsx` (SELECT-Liste +2 Spalten)
- EDIT `src/components/TrialBanner.jsx` (komplett auf useEntitlements + neue Logik)
- EDIT `src/components/Layout.jsx` (planId-State + profiles-Read aufräumen)
- EDIT `src/pages/Billing.jsx` (2 profiles-Reads weg, trialDaysLeft auf entitlements)
- EDIT `src/pages/SettingsKonto.jsx` (PlanCards-Prop auf account.plan_id)
- EDIT `src/pages/Profile.jsx` (planId-Display auf useEntitlements.planName)
- Optional EDIT `src/lib/useSubscription.js` (löschen wenn keine Caller mehr)
- Optional MIGRATION: `get_my_entitlements`-RPC um `plan_expires_at, granted_via` in Response erweitern

**Aufwand:** 3-4h (Code: 2h, manuelles Testen je Page: 1-2h)
**Pro:** sauber, eine konsistente Wahrheit, Banner-Bug nebenbei gefixt
**Contra:** 5-7 Files in einem Diff, Reviewer-Last

### Strategie B — Strangler (2-3 PRs)

**PR1 (HOCH-Risiko-Sites):** TrialBanner.jsx + Layout.jsx + Billing.jsx → ~2h
**PR2 (MITTEL-Risiko):** SettingsKonto.jsx + Profile.jsx + AccountContext-SELECT → ~1h
**PR3 (Cleanup):** useSubscription.js löschen, RPC erweitern, Banner-Polishing → ~1h

**Aufwand:** 4-5h verteilt
**Pro:** kleinere Reviews, jeweils revertbar
**Contra:** doppelte Code-Pfade während Übergang, keine echte Race-Condition (alle Read-Calls sind unabhängig)

### Strategie C — Adapter

**Nicht möglich.** Die 5 Read-Sites haben keinen gemeinsamen Hook der internal swap-bar wäre. `useSubscription.js` ist nur in einem Caller. profiles-direkt-Reads sind verstreut.

### Empfehlung: **Strategie A**

Begründung:
1. Read-Site-Count ≤7, alle in einer Domäne → Big Bang ist überschaubar
2. Account-zentrische Infrastruktur existiert bereits — Migration ist „swap reads" nicht „neue Architektur"
3. Plus-Wert: Trial-Banner-Bug (text-Match auf uuid) wird nebenbei gefixt
4. Strangler-PR1 hätte schon 3 von 5 Files → kein echter Vorteil gegenüber Big Bang

---

## Offene Architektur-Q für Michael

### Q1 — Trial-Banner-Logik post-Refactor

useEntitlements (post-RPC-Erweiterung) liefert: `account_status, is_trial, trial_ends_at, trial_days_left, granted_via, plan_expires_at, plan_name`.

Vorschlag-Tabelle:

| account_status | granted_via | plan_expires_at / trial_ends_at | Banner |
|---|---|---|---|
| trialing | (any) | trial_ends_at > now | „Noch X Tage Trial — `<plan_name>`" |
| trialing | (any) | trial_ends_at ≤ now | „Trial abgelaufen — bitte Plan wählen" |
| active | manual | plan_expires_at > now | „Lizenz läuft am `<date>` ab — `<plan_name>`" |
| active | manual | plan_expires_at NULL | Kein Banner (permanente Lizenz) |
| active | stripe | (any) | Kein Banner (Stripe-managed) |
| active | trial | (any) | Edge-Case — Banner-Logik klären |
| past_due | (any) | (any) | „Zahlung überfällig" (Stripe-managed) |
| suspended/canceled | (any) | (any) | „Account gesperrt — kontaktiere Admin" |

**Frage an Michael:**
- Stimmt die Tabelle? Welche Banner-Texte exakt?
- Sollen wir ein Dismiss-Verhalten haben (per-day localStorage)?
- Was bei `active + trial` (rare)?

### Q2 — Multi-Account-User

0 Multi-Account-User auf Prod heute. RPC nutzt schon `user_preferences.active_team_id` als pickup-Mechanismus (Bevorzugt + Fallback). Falls Multi-Account-Use-Case kommt, müsste TeamSwitcher in Layout sicherstellen, dass active_team_id beim Switch aktualisiert wird (existiert per CLAUDE.md ja schon, Phase 3.2b).

**Frage:** keine sofortige Aktion nötig — nur Code-Review-Check beim Refactor, dass `useEntitlements`-Reload bei Team-Switch greift.

### Q3 — Orphan-User (1 auf Prod)

`get_my_entitlements` returns NULL → useEntitlements liefert EMPTY → `is_active=false` → `hasModule=false` → keine Module sichtbar. Layout würde leere Sidebar zeigen.

**Frage:** Brauchen wir eine UX-Behandlung („Bitte Admin kontaktieren — kein Account zugewiesen") oder ist die leere Sidebar akzeptabel als „erkennbar broken"?

### Q4 — Caching / Live-Update bei License-Grant

Aktuell:
- `get_my_entitlements` ist per useEntitlements-Mount gecached
- AccountContext hat reload() via auth-state-change + visibilitychange

Szenario: Admin grantet via admin.leadesk.de eine neue Lizenz → User in app.leadesk.de sieht sie nicht sofort, erst nach Tab-Switch oder Reload.

**Optionen:**
- (a) Realtime-Subscribe auf accounts (via Supabase-Realtime) → Overhead für seltene Aktion
- (b) Polling alle 60s → zusätzlicher RPC-Call pro User pro Minute
- (c) NextVisibility-Reload (existiert schon) → User muss Tab wechseln
- (d) Manueller Reload-Button („Plan aktualisieren") in Settings/Billing → User-driven

**Empfehlung:** (c) reicht für heute. (d) als nice-to-have. Realtime wenn License-Grant-Frequenz steigt.

---

## Aufwand-Schätzung

| Strategie | Code | Test | Total |
|---|---|---|---|
| A — Big Bang | 2h | 1.5h | 3.5h |
| B — Strangler (3 PRs) | 2.5h | 2h | 4.5h |
| C — Adapter | n/a | n/a | nicht möglich |

**Plus optional:**
- RPC-Erweiterung `get_my_entitlements` um `plan_expires_at + granted_via`: 0.5h (1 Migration mit `CREATE OR REPLACE`)
- AccountContext-SELECT-Erweiterung: 5min
- useSubscription.js löschen wenn keine Caller mehr: 5min

**Daten-Cleanup:**
- Keine Daten-Migration nötig (subscriptions ist 0 rows, profiles bleibt unangetastet bis Phase 5C)

---

## Sicherheits-Beobachtung

**Nicht-blocking, aber zu erwähnen:** Die 5 Drift-Cases zeigen User mit *kleinerem* Plan an als sie tatsächlich haben. Modul-Filter (Sidebar) blockt zu viel Funktionalität für die Customer (negative UX). **Kein Sec-Risiko**, weil DB-RLS-Policies separat sind und auf accounts.id basieren — User können Modul-Routes manuell aufrufen, würden aber durch RLS gegen accounts-Joins blockiert. Zu prüfen aber nicht hier.

---

**Ende Discovery.** Datei nicht committed, nicht gepusht — als untracked file im Repo-Root abgelegt für Michaels Lese-Termin.
