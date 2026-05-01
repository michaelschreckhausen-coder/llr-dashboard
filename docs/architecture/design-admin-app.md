# Design-Doc: admin.leadesk.de — Leadesk-interne Admin-App

**Status:** Entwurf — Diskussionsgrundlage
**Autor:** Claude (im Dialog mit Michael)
**Datum:** 2026-04-28
**Reviewer:** Julian Wolf
**Zugehörig:** `design-accounts-teams-split.md` (Voraussetzung)

---

## 1. Entscheidung (aus Vorgespräch)

Separate Subdomain `admin.leadesk.de` mit **eigener Frontend-App**, gleicher Supabase-Backend. Begründung:

- **Defense-in-Depth:** Customer-Bundle enthält keinen Admin-Code, kein `notes_internal`, keine Stripe-IDs
- **Operational Klarheit:** Admin-Pflege passiert in fokussierter Mini-App, nicht als Sub-Section einer wachsenden Customer-App
- **Compliance-Argumentation:** „5 Leadesk-Mitarbeiter haben Zugang auf admin.leadesk.de" ist sauberer als „theoretisch alle User der Haupt-App, aber Role-gefiltert"

## 2. Verhältnis zum Accounts/Teams-Refactor

Die Admin-App ist der **direkte Konsument** der neuen `accounts`-Tabelle. Sie kann erst sinnvoll existieren, wenn diese da ist. Reihenfolge:

```
1. Accounts/Teams-Schema-Refactor Phase 1+2 (additiv, neue Tabellen + Daten-Migration)
   ↓
2. Admin-App MVP auf admin.leadesk.de
   ↓
3. Frontend-Refactor Phase 3+4 in app.leadesk.de
```

Die Admin-App **vor** dem Customer-Frontend-Refactor zu bauen ist okay — sie liest/schreibt nur die `accounts`-Tabelle, bricht nichts in der Customer-App.

## 3. Repo- & Deployment-Setup

### Optionen

**Option I: Separates Repo `leadesk-admin`**
- Eigenes GitHub-Repo, eigenes Vercel-Projekt
- Komplette Trennung, eigener CI/CD
- Code-Sharing mit Haupt-App via npm-Packages oder Copy

**Option II: Monorepo mit Workspaces**
- `llr-dashboard` wird zu `apps/main` + `apps/admin` + `packages/shared`
- Ein Repo, zwei Vercel-Projekte (jedes pointet auf eigenen Apps-Subfolder)
- Code-Sharing trivial (z.B. shared Supabase-Client, shared UI-Komponenten)

**Empfehlung:** Option II (Monorepo). Begründung:
- Shared types, shared Supabase-Client-Config, shared `lib/supabase.js` ohne npm-Publish-Hassle
- Beide Apps werden eh oft parallel angepasst (z.B. neue Account-Spalte → beide Apps müssen sie kennen)
- Pflege eines `package.json` pro App ist auch ohne Workspace-Tools (npm/pnpm/yarn workspaces) machbar

**Aber:** Falls Monorepo sich als zu disruptiv anfühlt für laufendes Business, ist Option I (separates Repo) auch okay — initial mit Code-Duplikation leben, später konsolidieren.

### Vercel-Projekt-Setup (Option II)

```
github.com/michaelschreckhausen-coder/llr-dashboard  (Monorepo)
├── apps/
│   ├── main/         → Vercel-Projekt 1: app.leadesk.de
│   │                    Build: cd apps/main && vite build
│   │                    Output: apps/main/dist
│   └── admin/        → Vercel-Projekt 2: admin.leadesk.de
│                        Build: cd apps/admin && vite build
│                        Output: apps/admin/dist
└── packages/
    ├── supabase/     → shared Supabase-Client + Types
    └── ui/           → shared Komponenten (Buttons, Modals etc.)
```

Beide Vercel-Projekte zeigen auf denselben `develop`/`main`-Branch, deployen unabhängig.

### Domain-Setup

| Subdomain | Vercel-Projekt | Branch (Prod) |
|---|---|---|
| `app.leadesk.de` | leadesk-main | `main` |
| `staging.leadesk.de` | leadesk-main | `develop` |
| `admin.leadesk.de` | leadesk-admin | `main` |
| `staging-admin.leadesk.de` | leadesk-admin | `develop` |

DNS-Einträge in Cloudflare (oder wo immer leadesk.de gehostet ist) ergänzen.

## 4. Tech-Stack

Bewusst **gleich wie Haupt-App**, mit zwei Einschränkungen:

| Bereich | Wahl | Begründung |
|---|---|---|
| Framework | React 18 + Vite + JSX, kein TypeScript | Konsistent zur Haupt-App, Leadesk-Team kennt's |
| Styling | Inline-Styles only | Gleiche Regel wie Haupt-App |
| Backend | Gleicher Supabase (Hetzner-Staging, Cloud-Prod) | Eine DB, zwei Frontend-Konsumenten |
| Auth | Supabase Auth, mit Restrictions (siehe §5) | Nutzt vorhandene Infrastruktur |
| Routing | React Router | Konsistent |
| **Anti-Pattern: keine Animations-Bibliotheken**, keine Charts (Admin-App ist Tabellen + Forms), keine LinkedIn-Integration | | Admin ist Daten-Tool, kein UX-Showcase |

Bundle-Größe-Ziel: **< 300 KB gzipped**. Die Customer-App ist größer (1.4 MB), aber Admin-App ist drastisch kleiner im Scope.

## 5. Auth-Modell

### Einschränkungen auf Login-Ebene

```jsx
// apps/admin/src/lib/supabase.js (vereinfacht)
const ALLOWED_DOMAIN = '@leadesk.de'

export async function adminSignIn(email, password) {
  if (!email.endsWith(ALLOWED_DOMAIN)) {
    throw new Error('Nur @leadesk.de-Adressen sind für die Admin-App zugelassen.')
  }
  return supabase.auth.signInWithPassword({ email, password })
}
```

**Wichtig:** Das ist nur die Frontend-Hürde. Backend-Härtung muss zusätzlich:

1. **RLS-Policy auf `accounts`** prüft `auth.jwt() ->> 'email'` LIKE `'%@leadesk.de'` ODER User hat Custom-Claim `is_leadesk_admin = true`
2. Custom-Claim setzen via Postgres-Function, die beim `handle_new_user`-Trigger feuert für Email-Domain `@leadesk.de`

```sql
-- Beispiel-Policy:
CREATE POLICY "accounts_admin_all" ON accounts FOR ALL
USING (
  (auth.jwt() ->> 'email') LIKE '%@leadesk.de'
  AND coalesce((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true
);
```

### MFA-Pflicht

Nicht im Code erzwingbar (Supabase Auth hat begrenzte MFA-Granularität), aber:

- **Per Policy:** Admin-User-Accounts manuell mit MFA-Setup-Pflicht initialisieren
- **Per Audit:** monatlicher Check, alle `is_leadesk_admin = true`-User haben aktive MFA-Faktoren

### Session-Timeout

Aggressiv: 1 Stunde Auto-Logout. Konfiguration in Supabase-Auth:

```js
const supabase = createClient(URL, KEY, {
  auth: {
    storageKey: 'leadesk-admin-auth-token',  // explizit getrennt von Customer-App!
    autoRefreshToken: true,
    persistSession: true
    // jwtExpiry → in Supabase-Project-Settings auf 3600s
  }
})
```

**Wichtig: separater `storageKey`** — verhindert Token-Drift (genau das Problem das wir heute hatten). Damit kann ein User parallel in Haupt-App und Admin-App eingeloggt sein, ohne dass die Tokens sich gegenseitig überschreiben.

### IP-Allowlist (optional)

Falls Leadesk fixe Office-IPs hat: Cloudflare-Rule oder Vercel-Edge-Middleware blockiert alle Nicht-Office-IPs. Pro: zusätzliche Hürde für leaked Credentials. Contra: Remote-Arbeit wird unbequem (VPN-Pflicht). Aktuell **nicht empfohlen**, später evaluieren.

## 6. MVP-Features (Phase 1)

Was die Admin-App vom Tag 1 an können muss:

### Account-Liste

- Tabelle aller Accounts mit Spalten: Name, Owner-Email, Plan, Status, Trial-Ende, Letzter Login (latest aus team_members.joined_at)
- Filter: Status (active/trialing/suspended/canceled), Plan, Trial-läuft-ab-bald (in 7 Tagen)
- Search: Account-Name, Billing-Email, Owner-Email
- Sortierung: Default `created_at desc`

### Account-Detail

- Alle Felder editierbar **mit Audit** (siehe §7):
  - Plan ändern (Dropdown aus `plans`-Tabelle)
  - Seat-Limit anpassen
  - `plan_managed_by` umstellen ('stripe' ↔ 'leadesk')
  - Trial-Ende verlängern
  - Status setzen (active/suspended/canceled)
  - `notes_internal` editieren
- Read-only: Stripe-Subscription-ID, mit Verlinkung ins Stripe-Dashboard
- Read-only: Liste aller Teams im Account, mit Member-Count

### Trial-Übersicht (Dashboard)

- Auflistung aller Accounts in Trial mit Tagen bis Ende
- Quick-Action: Trial verlängern, Trial in Paid umwandeln

### Team-Membership-View (read-only)

- Pro Account: welche Teams gibt's, welche User sind Member, welche Rolle
- Kein Edit-Recht für Leadesk — Customer pflegt seine eigene Team-Membership selbst (DSGVO!)

## 7. Audit-Log (Pflicht ab Tag 1)

**Begründung:** Sobald Leadesk-Mitarbeiter Customer-Daten ändern können, muss nachvollziehbar sein wer wann was geändert hat. Das ist DSGVO-relevant und für interne Compliance unverzichtbar.

```sql
CREATE TABLE admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,                   -- 'plan.change', 'trial.extend', 'status.suspend', 'notes.edit'
  target_table text NOT NULL,             -- 'accounts', 'teams', 'team_members'
  target_id uuid NOT NULL,
  before_value jsonb,                     -- Vorzustand
  after_value jsonb,                      -- Nachzustand
  reason text,                            -- optional, vom Admin eingegeben
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
```

Schreiben über Trigger-Funktionen oder Edge-Function-Wrapper, sodass es **nicht umgangen werden kann** — selbst wenn jemand direkt SQL macht (über die Admin-App passiert das aber eh nicht).

UI: In der Admin-App ein Reiter „Audit-Log" mit Filter pro Account.

## 8. Was die Admin-App explizit NICHT kann

Bewusst aus dem Scope, aus Compliance- und Sicherheitsgründen:

- **Customer-Daten lesen** (Leads, Deals, Notizen, Aktivitäten) — auch nicht „nur zur Diagnose". Wer Customer-Support macht, der Customer-Daten braucht, geht über `psql` mit Audit, oder fragt den Customer.
- **Customer-Sessions impersonieren** — verlockend, aber Compliance-Hölle. Wenn Support nötig: Screen-Sharing mit dem Customer, nicht Login als Customer.
- **DB-Schema-Änderungen** — Migrations laufen über `supabase/migrations/` im Haupt-Repo, nicht über die Admin-App.
- **Email-Versand an Customer** — nicht aus der Admin-App raus. Kommunikation läuft über bestehende Channels (Mail-Tool, etc.).
- **Whitelabel-Pflege** für Customer — macht der Customer selbst. Admin-App zeigt nur read-only an, was eingestellt ist.

## 9. UI-Skizze (Wireframe-Level)

```
┌──────────────────────────────────────────────────────────┐
│ Leadesk Admin     [Suche…]              michael@leadesk  │
│                                          [Logout]         │
├────────────┬─────────────────────────────────────────────┤
│ Accounts   │  Account: Acme Corp                          │
│ Trials     │  ─────────────────────────────────────────   │
│ Audit-Log  │  Status:        [active ▼]                   │
│            │  Plan:          [Pro ▼]    Seats: [10]       │
│            │  Managed by:    ( ) Stripe   (•) Leadesk     │
│            │  Trial Ende:    2026-05-15                   │
│            │  Stripe:        cus_abc123 ↗ (Stripe Dashb.) │
│            │                                               │
│            │  Notes (intern):                              │
│            │  ┌─────────────────────────────────────────┐ │
│            │  │ Großkunde, Verlängerung ab Q3 2026...   │ │
│            │  └─────────────────────────────────────────┘ │
│            │                                               │
│            │  Teams (3):                                   │
│            │  • Acme Vertrieb    (5 Members)              │
│            │  • Acme Marketing   (3 Members)              │
│            │  • Acme Geschäftsf. (1 Member)               │
│            │                                               │
│            │  Audit (letzte 5):                            │
│            │  • 28.04 Plan Pro→Enterprise (michael@...)    │
│            │  • 15.04 Trial verlängert    (julian@...)     │
│            │                                               │
│            │  [💾 Speichern]   [Audit komplett anzeigen]   │
└────────────┴─────────────────────────────────────────────┘
```

Bewusst **funktional, nicht hübsch**. Inline-Styles, ein einziges Font-Set, klare Tabellen, keine Animationen. Schnell zu bauen, schnell zu nutzen.

## 10. Phasen-Plan

### Phase 0: Vorarbeit (im Repo, ohne Deploy)

- Monorepo-Umstellung (oder zweites Repo aufsetzen)
- DNS für `admin.leadesk.de` und `staging-admin.leadesk.de`
- Vercel-Projekt anlegen, mit gleichen Env-Vars wie Haupt-App (außer `storageKey`)
- Custom-Claim `is_leadesk_admin` für Test-Account setzen

### Phase 1: MVP (Account-Liste + Detail + Audit-Log)

- Login-Page mit `@leadesk.de`-Restriction
- Account-Liste (read+filter)
- Account-Detail (read+update der pflegbaren Felder)
- Audit-Log auto-write bei jedem Update
- Audit-Log-View pro Account

Aufwand: 2-3 Tage konzentrierte Arbeit, vorausgesetzt Phase 1+2 des Accounts/Teams-Refactor sind durch.

### Phase 2: Erweiterungen

- Trial-Dashboard
- Team-Membership-Read-Only-View
- Stripe-Webhook-Status-Anzeige
- Email-Domain-Restriction um eine Allowlist erweitert (mehrere erlaubte Domains, falls Leadesk z.B. mit Sub-Brands arbeitet)

### Phase 3: Härtung

- IP-Allowlist (falls gewünscht)
- MFA-Audit-Cron-Job
- Audit-Log-Export (CSV) für Compliance-Reports
- Session-Timeout-Hardening

## 11. Open Questions für Julian

1. **Monorepo vs. separates Repo:** I oder II? Hat Auswirkungen auf alle weiteren Workflows. Lieber jetzt entscheiden.
2. **Initial-Admin-User:** Wer kriegt zuerst Zugang? Nur Michael + Julian? Oder gleich auch `support@leadesk.de`-Sammelaccount?
3. **Custom-Claim oder eigene `admin_users`-Tabelle?** Custom-Claim ist eleganter, aber JWT-basierte Claims sind static (refresh nötig nach Änderung). Eigene Tabelle ist flexibler aber bedeutet mehr DB-Calls.
4. **Auth-getrennt oder geteilt?** Heute: ein Supabase-Auth für beide Apps. Customer michael@example.com und Admin michael@leadesk.de wären zwei separate Auth-Accounts. Das ist okay — aber wenn jemand sowohl Customer-Login als auch Admin-Login braucht (unwahrscheinlich, aber möglich), wird's verwirrend. Variante: separate Supabase-Projekte für Customer und Admin? **Ich tendiere zu „nein, gleiches Backend"**, aber Open für Diskussion.
5. **Tracking/Analytics:** Soll die Admin-App selbst Analytics haben (welcher Mitarbeiter macht wie oft was)? DSGVO-mäßig kompliziert, aber nützlich für interne Nachvollziehbarkeit. Wenn ja: separates Schema, separater Audit-Pfad.
6. **Notfall-Zugang:** Was passiert wenn Supabase-Auth ausfällt und Leadesk an einen Customer ran muss? Direkter `psql`-Zugang ist Last-Resort, aber dann fehlt das Audit-Log. Brauchen wir einen Break-Glass-Mechanismus mit nachträglichem Audit-Eintrag?

## 12. Was nicht in diesem Doc steckt

Bewusst raus:

- **Customer-Support-Tooling** (Live-Chat-Integration, Ticket-System) — separates Thema, nicht Admin-App
- **Onboarding-Workflow für neue Customer** (Trial-Setup, Welcome-E-Mail) — gehört eher in die Customer-App oder einen Onboarding-Flow
- **Reporting/BI** (Wachstumszahlen, MRR-Tracking) — wäre nice-to-have, aber separates Tool (Metabase, Grafana, oder Stripe-internal-Dashboard reicht initial)
- **Public Status-Page** — orthogonal

## 13. Empfohlene nächste Schritte

1. **Diese Doku** mit Julian besprechen, parallel mit dem Accounts/Teams-Refactor-Doc — sie hängen zusammen.
2. **Monorepo-Entscheidung** treffen (Option I vs. II) — bevor Code geschrieben wird.
3. **DNS-Setup** für `admin.leadesk.de` und `staging-admin.leadesk.de` als Vorbereitung.
4. **Phase 1 des Accounts/Teams-Refactor** anstoßen (Schema-Setup auf Hetzner-Staging) — Voraussetzung für alle Admin-App-Arbeit.
5. **Erst dann:** MVP der Admin-App bauen, mit Audit-Log von Tag 1 an.

---

## Anhang: Geschätzter Gesamtaufwand

| Item | Aufwand |
|---|---|
| Monorepo-Setup oder Repo-Anlage | 0.5 Tag |
| DNS + Vercel-Projekt | 0.5 Tag |
| Auth + RLS + Custom-Claim-Setup | 1 Tag |
| MVP Account-Liste + Detail | 1.5 Tage |
| Audit-Log (Trigger + UI) | 1 Tag |
| Polishing + Test | 1 Tag |
| **Gesamt MVP** | **~5.5 Tage konzentrierte Arbeit** |

Plus die ~6 Wochen für den Accounts/Teams-Refactor davor.
