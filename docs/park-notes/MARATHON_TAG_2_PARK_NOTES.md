# Marathon Tag 2 — Park-Notes für 2026-05-09

> Erstellt 2026-05-08 nach ~14h Marathon. Alle offenen Items + Kontext-Brücken.

## ⚠️ Sofort-Action morgen früh

**leadesk-admin PR `feat/email-fix-3-account-create-invite-flow` zu `main` mergen.**
- Backend ist bereits LIVE auf Hetzner-Prod (PR llr-dashboard `feat/email-fix-3-bridge-pattern`)
- Frontend-Refactor wartet auf Production-Deploy
- Vercel-Preview-Build ist READY (`af1ca06ca7ac84614b314967ee584704ba305b04`)
- Nach Merge: ~30s Vercel-Alias-Switch → admin.leadesk.de auf neuer Code
- Browser-Smoke: `/accounts` → "+ Neuer Account" → echte Test-Mail → Modal-Submit → Mail-Empfang verify

## Offene Items nach Priorität

### P1 — Email-Builder Phase 2.3c Vorschau-Bug
- **Symptom**: PreviewPane in EmailTemplateEditModal rendert empty `<div>`, Modal kollabiert auf Mini-Höhe
- **Hypothese-Order** (siehe Marathon-Diskussion):
  1. mjml-browser dynamic-import-fail in Vite-prod-Build (Vite + cheerio external-dep packaging-issue)
  2. mjml2html() returnt result.html=''
  3. State-Race in useEffect mit StrictMode-double-Run
- **Diagnose-Pfad**: F12-Console auf admin.leadesk.de/email-templates während Modal+Vorschau-Tab → Errors lesen
- **Schnellfix-Option**: dynamic import → static import (300kb mehr eager bundle, aber funktioniert garantiert)

### P2 — v1 admin_create_account RPC droppen
- Sobald Frontend-Refactor live (siehe Sofort-Action), gibt's keinen Caller mehr für v1
- DROP FUNCTION public.admin_create_account(text, text, uuid, ..., 15-param-Sig)
- Nicht zeitkritisch — kann auch eine Woche stehen bleiben

### P3 — Phase 2.3d Versions-Tab + Restore
- ~45min Sub-Phase
- Versions-Tab in EmailTemplateEditModal functional machen
- SELECT email_template_versions WHERE template_id ORDER BY version DESC
- "Wiederherstellen"-Button → restore_email_template_version-RPC

### P4 — Stripe Phase 5+6 (Live-Mode Aktivierung)
- ~30min eigener Sprint
- 3 Stripe-Products + Prices in Live-Dashboard anlegen (starter 29€, pro 79€, business 199€)
- DB: UPDATE plans SET stripe_price_id, plan_managed_by='stripe' WHERE slug IN (...)
- Smoke: Stripe-CLI `stripe trigger` ODER Real-Karte
- Cloud-Test-Mode-Webhook später disablen

### P5 — Changelog v3.8.3-v3.8.7 Catch-up
- Lückenpunkte: Stripe-Code-Phase, Phase 2.1, Phase 2.2, Phase 2.3a-c, EmailFix-3
- ~20min via SQL-INSERT ins changelog-Table (siehe Memory #14)

### P6 — llr-dashboard PR mergen (Source-Tracking)
- Code ist live auf Hetzner, PR ist nur für Repo-Sync
- develop oder main, nicht zeitkritisch

## Marathon-Lessons (in Memory persisted)

- **#21 — pg_net + sync-poll in TX = unmöglich** (MVCC-Constraint)
- **#22 — D2-Bridge-Pattern für sync-HTTP-aus-RPC**: Edge-Function statt pg_net

## Failed-Mahnmal (in Repo)

`supabase/migrations/20260508103000_admin_create_account_v2_invite_flow.sql` — mit Header-Comment dokumentiert, NIE applien. Lesson für nächste Sessions.

## Was heute live deployed wurde (Tag 2 Marathon)

| Item | Wo |
|------|-----|
| Stripe RPC v2 accounts-basiert | Hetzner-Prod |
| 3 Stripe Edge-Functions | Hetzner-Prod |
| Stripe Webhook Live-Mode | Stripe-Dashboard |
| Phase 2.1 Email-Builder Schema | Hetzner-Prod |
| Phase 2.2 5 MJML-Templates | Hetzner-Prod |
| Phase 2.3a-c Email-Builder UI | Vercel-Prod (admin.leadesk.de PR #12) |
| EmailFix-3 RPCs + Edge-Function | Hetzner-Prod |
| EmailFix-3 Frontend-Refactor | **Vercel-Preview** (PR pending main-Merge) |

## Cleanup-Done (heute)

- 2 accounts (d2a-smoke, d2b-smoke) DELETED
- 2 teams + 2 team_members DELETED
- 2 auth.users (test-invite-smoke, ef-2-smoke-kong) DELETED
- Audit-Logs preserved für History

## Cleanup-Pending (low-prio)

3 ältere Smoke-Users aus Stand 2026-05-03 (claude-smoketest+inc4, claude-smoketest-mode2, smoketest-421) — können gelassen werden, FK-Risk auf email_template_versions.created_by minimal.

## Token-Hygiene

User-JWT michael@leadesk.de wurde im Marathon-Smoke verwendet (Logout/Login morgens für Token-Rotation).
Stripe-Tokens sk_live_ + sk_test_ sind gerotated (zwei Vorfälle Marathon Tag 2 dokumentiert).
