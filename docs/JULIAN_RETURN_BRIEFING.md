# Julian Return Briefing

> Stand: 2026-05-06 — Welcome back. Hier ist alles was sich seit deinem Urlaub verändert hat. Lies dieses Doc komplett bevor du irgendwas anfasst, dann lies CLAUDE.md im jeweiligen Repo-Root, dann sprich mit Michael über die Arbeitsteilung.

## TL;DR (für Eilige)

- **Multi-Provider-AI** ist live in Prod (alle KI-Features unterstützen Anthropic/OpenAI/Google/Mistral)
- **Block 3.6 v2** Realtime-Plan-Updates für Customer-App ist live (EntitlementsProvider-Pattern)
- **Block 4** Member-Pwd-Reset Hybrid in admin.leadesk.de ist live (Magic-Link + Temp-Pwd)
- **Block 5** läuft gerade (Permission-System mit 25 Sub-Page-Permissions). 5.1-5.4 live, 5.5 in Arbeit (Plan-Editor-UI), 5.6 + 5.7 noch deferred
- **Postmark-Approval** läuft (Sandbox aktiv, ca. 1-2 Werktage Review)
- **Hetzner-Self-Hosted-Supabase** ist live für Customer-App + Admin-App. Supabase Cloud ist für Prod gedroppt.
- Pricing-Page hat 4 Pläne (Starter/Pro/Business/Enterprise), DB hat 5 (zusätzlich Free als Trial-Default)

## Was ist Block 5 und wo stehen wir gerade

**Block 5 = Permission-System**: Jede Sub-Page der Customer-App ist an eine Permission gebunden (z.B. `crm.deals`, `delivery.projects`). Pläne haben jeweils eine Liste von Permissions. Customer sehen in der Sidebar nur was ihr Plan erlaubt; URL-Direct-Access auf nicht-erlaubte Routes redirected zu /billing.

**25 Permissions in 8 Modul-Gruppen** — hardcoded in `src/lib/permissions.js` (PERMISSIONS_REGISTRY).

### Sub-Phasen-Status

| # | Sub-Phase | Status | PR |
|---|---|---|---|
| 5.1 | Schema (`plans.permissions` jsonb-Array + `archived` boolean) + Initial-Matrix | ✅ LIVE Prod | #35 + Hotfix #36 |
| 5.2 | RPC-Layer (5 neue + `get_my_entitlements` ALTER) | ✅ LIVE Prod | #37 |
| 5.3 | useEntitlements + hasPermission-Helper | ✅ LIVE Prod | #38 |
| 5.3.5 | Plan-Lifecycle-Fix Staging (admin_grant_license_v2 + Status-Update) | ✅ Staging only | — |
| 5.4 | PermissionGuard + Route-Map + Sidebar-Filter | ✅ LIVE Prod | #39 |
| Vor-5.5 | `stripe_price_id` + `plan_managed_by` Schema-Migration | ✅ LIVE Prod | #40 |
| **5.5a** | Plans-Liste-Page in admin.leadesk.de | ⏳ Lokal committed (kein Push) | — |
| **5.5b** | PlanEditModal mit Permission-Matrix + admin_update_plan-RPC | ⏳ In Arbeit | — |
| 5.5c | PlanCreateModal + Archive/Unarchive | ⏳ Pending | — |
| 5.5d | Stripe-Pricing-Drift-Fix in Billing.jsx (Hardcode → DB-driven) | ⏳ Pending | — |
| 5.6 | RLS-Lockdown pro Tabelle (sec-kritisch, niedrig-Risk-zuerst) | ⏳ Deferred | — |
| 5.7 | Phase-5C-Cleanup (subscriptions/profiles.plan_id/PlanGate-Wrapper drop) | ⏳ Pending | — |

### Initial-Matrix (Block 5.1)

```
                          Starter  Pro  Business  Enterprise
branding.voice              ✅     ✅    ✅        ✅
branding.audiences          ✅     ✅    ✅        ✅
branding.knowledge          ❌     ✅    ✅        ✅
branding.linkedin_texts     ✅     ✅    ✅        ✅
branding.icp                ❌     ✅    ✅        ✅
crm.contacts                ✅     ✅    ✅        ✅
crm.organizations           ✅     ✅    ✅        ✅
crm.deals                   ✅     ✅    ✅        ✅
crm.tasks                   ✅     ✅    ✅        ✅
crm.enrichment              ❌     ✅    ✅        ✅
linkedin.connections        ✅     ✅    ✅        ✅
linkedin.messages           ✅     ✅    ✅        ✅
linkedin.automation         ❌     ✅    ✅        ✅
linkedin.cloud              ✅     ✅    ✅        ✅
content.studio              ✅     ✅    ✅        ✅
content.calendar            ❌     ✅    ✅        ✅
delivery.projects           ❌     ❌    ✅        ✅
delivery.time_tracking      ❌     ❌    ✅        ✅
reports.sales               ❌     ✅    ✅        ✅
reports.ssi                 ❌     ✅    ✅        ✅
core.integrations           ✅     ✅    ✅        ✅
core.team_management        ❌     ✅    ✅        ✅
core.whitelabel             ❌     ❌    ✅        ✅
core.multi_account          ❌     ❌    ✅        ✅
assistant.basic             ✅     ✅    ✅        ✅
```

Free-Plan kriegt alle 25 Permissions (Trial-Default, kein Funktionsverlust für die 1 existing Free-Account).

Counts: Free=25, Starter=13, Pro=21, Business=25, Enterprise=25.

## Was ist sonst neu seit deinem Urlaub

### Block 3.6 v2 — Realtime-Plan-Updates ✅ LIVE Prod (PR #33)

**Was**: Wenn ein Account-Plan geändert wird (Stripe-Webhook oder Admin-Grant), kriegen aktive Customer-Sessions das Update **sofort über Realtime** via Page-Reload-Aufforderung. Vorher musste User neu einloggen.

**Wie**: `EntitlementsProvider` zentral in App.jsx (siehe `src/contexts/EntitlementsContext.jsx`). Singleton-Subscription auf `accounts`-Realtime-Channel. Vorher waren 6 useEntitlements-Caller jeweils mit eigener Subscription → Multi-Mount-Race auf `/billing`-Page. Refactor löst das.

**Lehre für dich**: Singleton-Subscriptions gehören in Provider, nicht in Hook-Body. Sonst Race-Conditions bei parallelen Mounts.

### Block 4 — Member-Pwd-Reset Hybrid ✅ LIVE admin.leadesk.de Prod

**Was**: Leadesk-Admins können in `admin.leadesk.de` für Account-Members einen Pwd-Reset auslösen. Hybrid: entweder **Magic-Link** (E-Mail an User, User setzt selbst neu) oder **Temp-Password** (Admin generiert, kopiert per Click, gibt manuell weiter).

**Wie**:
- RPC `admin_reset_member_password(p_target_user_id, p_account_id, p_method, p_reason)` (PR #34, llr-dashboard)
- Frontend `MemberPasswordResetModal.jsx` (PR #6 → #7 leadesk-admin) — 3-Stage-Modal, Sandbox-Banner conditional auf @leadesk.de, Click-to-Copy für Temp-Pwd
- Rate-Limit: 3/24h rolling pro Account

**Postmark-Status**: Sandbox aktiv. Approval läuft (1-2 Werktage Review). Bis dahin Magic-Link nur an @leadesk.de-Empfänger zuverlässig.

### Hetzner-Cutover

Production-DB ist seit ein paar Tagen auf Hetzner Self-Hosted Supabase, nicht mehr Supabase Cloud. Two boxes:
- `db-01`: 128.140.123.163 (Postgres + alle Supabase-Services in Docker)
- `app-01`: 138.199.163.189 (Caddy → Kong)

Staging-Stack: db-01 auf 178.104.210.216.

Du hast SSH-Zugang zu beiden via deine bekannten Keys. Migration-Apply-Pattern:
```
ssh root@<IP> 'docker exec -i supabase-db psql -U postgres -d postgres' < migration.sql
```

**Wichtig**: Schema-Drift Staging vs. Prod ist real. **Vor jedem Migration-Write `\d <table>` auf BEIDEN Instanzen vergleichen.** Wir haben das mehrfach gelernt (siehe Migration-Pitfalls).

## CLAUDE.md (Hard-Rules)

`CLAUDE.md` lebt im Root jedes Repos und enthält die Hard-Rules + Top-Fallstricke. **Lies das BEVOR du Claude Code startest.**

Wichtigste Punkte (Stand jetzt):

### Branch-Strategien
- **llr-dashboard**: Branch von `main` (NICHT von `develop`!). `develop` ist 13 Commits ahead von main wegen Multi-Provider-AI-Hold und ist NICHT-anfassbar. Feature-Branches → main, kein develop.
- **leadesk-admin**: Standard `develop` → PR → `main`-Pattern.
- **Hotfixes** auf Prod: PR-basiert (PRs #21-#23-Pattern), sofortige Smoke-Tests, Changelog-Entry.

### Migration-Pitfalls (3 Lehren aus Block 5)
1. **Schema-Drift Staging vs Prod ist real** — `\d <table>` auf BEIDEN Hetzner-Instanzen vergleichen vor Migration-Write. Beispiel: `plans.updated_at` fehlt auf Prod aber existiert auf Staging.
2. **`ADD CONSTRAINT` ist NICHT idempotent** — bei Re-Apply crasht es mit "constraint already exists". Pattern: `DROP CONSTRAINT IF EXISTS xxx;` davor.
3. **Re-Apply-fähig schreiben**: `IF NOT EXISTS` für Spalten, `ON CONFLICT DO NOTHING` für INSERTs, `DO`-Block für conditional Logic.

### GitHub Web Editor Caveat
GitHub Web Editor (CodeMirror6) hat einen Bug: `execCommand('selectAll') + insertText` kann Inhalt **doppelt** einfügen statt zu ersetzen. Resultat: File ist 2× so groß, Build crasht mit "Symbol React has already been declared." Recovery: navigate zu `/blob/` zum Discard, dann Retry. Nutze nach Möglichkeit lokale Editoren statt Web-Editor.

### Sec-Test-0 ist Pflicht
Vor jedem Merge: "App rendert ohne Whitescreen" testen. Block 3.6 v1 hat uns gezeigt was passiert wenn Sec-Test-0 geskippt wird → Whitescreen auf Prod, Revert nötig.

### Permission-Patterns für RPCs
- Alle Admin-RPCs sind `SECURITY DEFINER`
- search_path: `public, auth, extensions, pg_temp` (extensions wichtig für pgcrypto)
- Auth-Gate via `auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'`
- Reason-Field: **>=10 chars** (`admin_audit_log_reason_check`-Constraint)
- Audit-Eintrag mit `before_value`/`after_value` als jsonb

## Active Work (was Michael gerade macht)

**Heute (2026-05-06) Marathon-Tag**: Block 5.5 Plan-Editor-UI in admin.leadesk.de.

- Status: 5.5a + Vor-Migration durch (live Prod)
- 5.5b in Arbeit, paused weil dieses Briefing Priorität hat
- Branch `feat/phase-5-block-5-5-plan-editor` (leadesk-admin) ist lokal committed, **nicht gepusht**. Großer PR kommt nach 5.5d-Fertigstellung.

**Wenn du dich an Block 5.5 beteiligst**: koordiniere mit Michael bevor du den Branch anfasst. Sonst Merge-Konflikte.

## Was du machen könntest (Optionen)

### Option α: Fokus auf nicht-Block-5-Themen (Empfehlung wenn du erstmal warm laufen willst)
- **Postmark-Approval** Status checken, wenn approved → Frontend-Banner-Logic in `MemberPasswordResetModal.jsx` für non-@leadesk.de-Domains entfernen
- **Block 3.7** notifications + time_entries Realtime (analog Block 3.6 v2 für andere Tables)
- **Block 4.5** Force-Pwd-Change-on-next-Login (für Temp-Pwd-User)
- **Phase-4-Cleanup** plans.updated_at Schema-Harmonisierung Prod

### Option β: Pair-Programming mit Michael an Block 5.5c+d
- Michael macht 5.5b fertig, ihr paired für 5.5c (Plan-Create + Archive)
- Anschließend 5.5d (Stripe-Pricing-Drift-Fix in Billing.jsx) gemeinsam

### Option γ: Block 5.6 RLS-Lockdown (sec-kritisch, gehört Pair-Reviewed)
- Frontend-Permissions sind durch (5.4 live), aber Backend-RLS auf Tabellen ist noch offen
- Pro Tabelle eigene RLS-Policy mit `is_permitted(<key>, account_id)`-Helper-RPC (PR #37)
- Sec-Tests pro Tabelle Pflicht
- Reihenfolge: niedrig-Risk-zuerst (delivery → CRM → LinkedIn → Content/Reports)
- ~2-3 Tage Arbeit, sehr gut für Pair (Sec-Review eingebaut)

### Option δ: Eigener Vorschlag
Sprich mit Michael, was am meisten Sinn macht.

## Repo-Übersicht (Stand jetzt)

```
llr-dashboard/                    # Customer-App (app.leadesk.de)
├── src/
│   ├── components/               # PermissionGuard.jsx NEU (Block 5.4)
│   ├── context/                  # EntitlementsContext.jsx NEU (Block 3.6 v2)
│   ├── hooks/                    # useEntitlements.js erweitert (Block 5.3)
│   ├── lib/
│   │   ├── permissions.js        # PERMISSIONS_REGISTRY 25 Keys (Block 5.1)
│   │   └── routePermissions.js   # ROUTE→Permission-Map (Block 5.4)
│   └── pages/                    # Billing.jsx noch hardcoded Pricing (Block 5.5d-TODO)
├── supabase/
│   ├── functions/                # 14 Edge Functions
│   └── migrations/               # ~35 Migrations, jüngste:
│                                 # 20260504201508 Block 5.1 Schema + Hotfix
│                                 # 20260504210311 Block 5.2 RPCs
│                                 # 20260506085354 Block 5.5 Stripe-Cols
│                                 # (Block 5.5b admin_update_plan kommt bald)
└── docs/
    └── JULIAN_RETURN_BRIEFING.md # dieses Dokument

leadesk-admin/                    # Internal Admin-App (admin.leadesk.de)
├── src/
│   ├── components/
│   │   ├── account-detail/
│   │   │   └── MemberPasswordResetModal.jsx  # Block 4 NEU
│   │   └── plan-editor/                       # Block 5.5 in Arbeit
│   │       └── PlanEditModal.jsx              # 5.5b WIP
│   ├── lib/
│   │   └── permissions.js        # 1:1-Copy aus llr-dashboard (E-6=α-Decision Block 5)
│   └── pages/
│       └── Plans.jsx             # NEU Block 5.5a
└── (kein eigener supabase/-Ordner — nutzt llr-dashboards Backend)
```

## Identitäten und Plan-IDs (für Tests)

- michael@leadesk.de: `758b71cf-464f-43c7-bc46-699c141c5db1`, Account "Leadesk Internal" `526cf126-801d-484d-90e8-5d9e33c4e6e1`
- Plan-IDs:
  - Free: `ea98eafd-0e71-4755-a275-982e6f5aaea6`
  - Starter: `7dd9eb1d-…`
  - Pro: `5d68d70a-4c54-4daf-b57b-ae98851851b1`
  - Business: NEU angelegt in 5.1 (UUID dynamisch)
  - Enterprise: `c4c11445-9f97-409a-bfd3-9c9f873c049b` (wichtig: hardcoded in `is_permitted` als Sales-Garantie)

Auf Staging: michael@leadesk.de hat **Pro-Plan** (Block 5.3.5 Test-Setup für 5.4-Coverage). Auf Prod: ursprünglich Enterprise.

## Erste Schritte für dich

1. **Lies dieses Dokument komplett** (du bist gerade dabei)
2. **Lies `CLAUDE.md`** im Repo-Root von llr-dashboard UND leadesk-admin
3. **Checkout main + pull**:
   ```
   cd ~/Documents/llr-dashboard && git checkout main && git pull --ff-only
   cd ~/Documents/leadesk-admin && git checkout main && git pull --ff-only
   ```
4. **Sprich mit Michael** über Arbeitsteilung (siehe Optionen oben)
5. **Wenn Claude Code**: lies CLAUDE.md ZUERST in jeder neuen Session, sonst läufst du in dokumentierte Fallstricke

## Fragen?

Michael ist heute Marathon-Tag (Block 5 komplett durchziehen Vorhaben). Wenn was dringend ist, frag direkt. Sonst: notiere Fragen, klären wir zusammen wenn ich Pause mache.

Welcome back, willkommen im Permission-System-Land.
