# Leadesk — Interner Changelog

> ⚠️ **INTERN — NICHT VERÖFFENTLICHEN.** Dieses Dokument gehört **nicht** in `public.changelog` / `admin.leadesk.de/changelog` / `app.leadesk.de/admin-logs` (das sind kundennahe Flächen). Es enthält Kundennamen, Security-Vektoren und DSGVO-Cleanup-Details — ein INSERT in die Changelog-Tabelle wäre ein Leak. Ablage: internes Repo-Doc (`docs/internal/…`), kein geteiltes Artifact.
>
> **Intern / team-technisch.** Deckt den Pricing-Rollout Juli 2026 (P1–P4b) plus begleitende Fixes und Bereinigungen ab. Enthält Gate-Mechanik, Security- und Drift-Fixes. Reverse-chronologisch, neueste Änderung oben. Alles gelistete ist auf **Prod live**, sofern nicht anders vermerkt.

---

## 2026-07-22 — P4b-Kern: Seat-striktes Connect-Gate + License-Auto-Provision

**[Feature]** Der Seat ist jetzt *load-bearing* für den Unipile-Connect. `requireSeat` wurde von member-basiert auf seat-strikt umgestellt:

```
alt:  gate_open('connect')  OR   is_active
neu:  gate_open('connect')  OR  (is_active AND has_license())
```

`has_license()` = aktives `license_assignment` (SECURITY DEFINER, RLS-unabhängig). EF-only in `_shared/permissions.ts`, genutzt von `unipile-connect-link`. Seat-lose aktive Member werden am Connect geblockt (`403 need_seat`).

**[Feature]** `grant_seat` provisioniert die Team-Lizenz jetzt **on-demand selbst**, wenn ein Team keine hat (`total_seats = accounts.seat_limit`), dann assigned — schließt die Signup-Lücke (`handle_new_user` legt lizenzlose Accounts an → sonst wäre jeder Neukunde seat-los → Connect-Lockout). Self-healing an jedem Join; kein einmaliger Backfill mehr nötig. Plan-Filter: nur seat-tragende Tiers (Plan grantet `linkedin.*` / `content.calendar`), Free → no-op.

**[Infra]** Neue `UNIQUE(team_id)` auf `licenses` als `ON CONFLICT`-Arbiter (race-sicher bei gleichzeitigen Joins). `seats_chk` blieb wie in P4a relaxed (`used >= 0`), damit computed Overage trägt.

**[Prozess]** Gate-Buffer-Rollout (P3-Muster): Migration/Provision live → lizenzloses Team self-geheilt → Gate geöffnet (fail-open) → `permissions.ts` isoliert deployed (inert) → **Bite-Query = 0 als Pre-Flip-Gate** → Gate geschlossen (Go-Live-Toggle) → Post-Verify. Der scharfe Pfad war nie live, bevor die Neutralität bewiesen war.

**[Verifikation]** Prod-Laufzeittest, echter TS-Pfad, Gate scharf: Seat-Halter → `ALLOW`; seat-los (revoked) → `DENY 403 need_seat` (der Falsch-Allow-Fall, den kein Kill-Switch fängt); `bite = 0`. Zuvor identischer TS-Laufzeittest auf Staging.

**[Notiz]** Erster Gate-Close rollte zurück (`UPDATE; SELECT` in einer TX, SELECT ohne `FROM` warf → ganze TX zurück) → Gate blieb **offen** = fail-safe, kein Kunde betroffen. Danach sauber mit `UPDATE` allein geschlossen. Zwei Prod-Env-Drifts nur im Test-Harness gefangen (`teams.slug NOT NULL`, fehlendes `mint-jwt.js`) — Enforcement-Pfad unberührt.

`develop ee4fad0c`

---

## 2026-07-19 — P4a: Seat-Auto-Assign + Seat-Lifecycle

**[Feature]** Objekte: Core-Fn `grant_seat` (+ `revoke_seat_core`), Trigger-Glue `tg_grant_seat_on_member` / `tg_revoke_seat_on_member`, drei Trigger `trg_seat_grant_insert` / `trg_seat_grant_reactivate` / `trg_seat_revoke_on_leave` (`AFTER INSERT OR UPDATE OF is_active ON team_members`). Vergibt beim Join/Reaktivierung automatisch einen Seat, deckt alle drei Add-Pfade (`admin_invite_member`, Raw-Insert, künftige Signups) an einem Choke-Point. Idempotent per `ON CONFLICT (license_id, user_id) DO UPDATE SET is_active=true` (Reaktivierung = UPSERT der bestehenden Row, kein Dublett, kein Unique-Violation).

**[Feature]** Symmetrischer Revoke-on-Leave: `is_active true→false` gibt den Seat soft frei (`assignment.is_active=false` → `trg_license_seats` zählt `used_seats` −1). Seat-Lifecycle = Membership-Lifecycle. Verhindert `used_seats`-Drift nach oben (sonst Overage über-berechnet).

**[Infra]** `seats_chk` relaxed: `used_seats <= total_seats` → `used_seats >= 0`. Kippt die alte harte Cap-Invariante (Modell a) zugunsten des beschlossenen computed-Overage-Modells (b) — Join bricht nie, Overage = `max(0, used − total)`, Billing folgt in P4c. Sweep bestätigte: nur 3 kosmetische FE-Anzeigen bauten auf `used <= total`, kein Gate.

**[Daten]** Catch-up-Backfill für 3 post-P1-Teams ohne Lizenz (Pucest = internes comped-Test-Konto, + 2 Trials), je `license(total=seat_limit)` + 1 Seat. Kein Overflow.

`Migration 20260719160000_p4a_auto_assign_seats.sql · develop 8eb4a7a1`

---

## 2026-07-18 — Defensive Härtung: `_shared/tenant.ts`

**[Fix]** Zentrales `unwrap` in `tenant.ts`: prüft jetzt `if (res.error) → throw/log laut` statt nur `data` zu destrukturieren. Bisher schluckte der Helper einen Grant-/Permission-Fehler (`42501`) still und gab `null` zurück → „kein Zugriff" statt sichtbarem Fehler. Ab jetzt: leeres `data` bleibt still (legitimer Deny), nur ein echtes `error` wird laut. Schließt die Falsch-Allow-/Silent-Lockout-Richtung, die der GRANT-Fix (unten) nicht abdeckt.

Isolierter Prod-SCP (md5 == develop, `.bak-harden-20260718`), zusätzlich develop.

`develop 60712a2b`

---

## 2026-07-17 — Grant-Drift-Klasse geschlossen (`service_role` SELECT)

**[Fix][Security]** Aktiver Kunden-Lockout: `brand_voice_team_shares` fehlte `GRANT SELECT` für `service_role` → `generate` / `generate-image` / `text-werkstatt-chat` warfen für ein legitimes Team-Mitglied `403` (via `tenant.ts`/`loadBrandVoiceIfAllowed`). Ursache = Self-Host-Cutover-/Migrations-Drift (Top-Fallstrick #12).

**[Fix]** Read-only Grant-Drift-Sweep fand **13 Tabellen** ohne `service_role`-SELECT (9× Cutover-Drift Staging=1/Prod=0, 4× Original-Gap beide=0). Eine additive Migration: `GRANT SELECT … TO service_role` auf allen 13 + `NOTIFY pgrst, 'reload schema'`. SELECT-only (kein Service-Write gefunden), idempotent, staging-verifiziert (reproduce → GRANT → 200 über echten EF-Pfad). Stellt die Staging↔Prod-Parität her.

`Migration 20260717160000 · develop 9f205708`

---

## 2026-07-17 — P3: Pricing-Cutover (Feature-Gates)

**[Feature]** Kern der Preisumstellung: Sales-Navigator und LinkedIn-Automation aus dem `automation`-Addon gelöst und in die Plan-Permissions überführt. Nicht-genestetes 3-Tier-Modell:

| | Marketing | Sales | All-in |
|---|---|---|---|
| `content.calendar` (Redaktionsplan posten) | ✅ | — | ✅ |
| `linkedin.post_analytics` *(neu)* | ✅ | — | ✅ |
| `linkedin.connections` / `messages` | — | ✅ | ✅ |
| `linkedin.engagement` *(neu)* | — | ✅ | ✅ |
| `linkedin.sales_nav` *(neu)* | — | ✅ | ✅ |
| `linkedin.automation` | — | ✅ | ✅ |
| Unipile verbinden | Seat-Besitz (kein Key) — alle Tiers |

Marketing = reiner Content, Sales = reines Outreach, All-in = beides. Marketing **verliert** `linkedin.connections`/`messages` (B3-Pre-Check = 0 Marketing-Accounts vor Apply). **Trial = All-in minus `linkedin.automation`** (6 der 7 All-in-Keys) — bewusster Abuse-Schutz: Trials dürfen vernetzen / sales-nav / posten / analytics testen, aber die *automatisierte Ausführung* bleibt bezahlten Plänen vorbehalten (gegen Signup-Farmen).

**[Feature]** Neue Gate-Architektur: RPC `i_have_permission(key)` (seat-aware), EF-Helper `require_permission` / `requireSeat` in `_shared/permissions.ts` (ein Guard-Punkt statt verstreuter `i_have_addon`-Checks; `403` mit `need_permission` + key → FE-Upgrade-CTA). Gates auf 8 EFs (monitor/engagement/invitations-sync/relations/salesnav/automation-runner/publish/connect).

**[Infra]** Kill-Switch `gate_config` (single-row, `gates_enforced`, `bypass_keys`, fail-closed, RLS auf `service_role`). `admin_set_gate()` als <1s-Toggle.

**[Feature]** Frontend: zentrale `UpgradeRequired`-Komponente, `routePermissions`-Map (vollständiges href↔map-Audit, 5 fehlende Routen ergänzt), `Layout.jsx` Sidebar-Gating (hide→show+lock), `efError.js` (401/403/409/429-Mapping). `redaktionsplan` Publish-Gate auf `post.team_id`.

**[Prozess]** Marketplace-Retire der `automation`/`sales-nav-sync`-Addons (`addons.is_active=false`) — Listing + Kauf-/Aktivier-Pfad; Halter-Rows unangetastet. Rollout Staging-first, Prod je Stufe auf Freigabe, unter Volumen bestätigt (0 Fehl-Blocks).

*Datum oben = Prod-Enforce-Flip (2026-07-17 09:34:30 UTC); die Permissions-Migration lief 07-16.*

`Migrationen 20260716140000 (Permissions) · 150000 (Resolver) · 160000 (gate_config)`

---

## Vorlauf — P1: Seat-Fundament (verhaltensneutral)

**[Infra]** `licenses` / `license_assignments` produktiv befüllt (50 Lic / 67 Seats auf Prod), Trigger `update_license_used_seats`. `requireSeat` zunächst member-basiert (`is_active`), Seat-Panel FE-versteckt (`SHOW_SEAT_UI=false`). Reine Datenvorbereitung, kein Gate las die Seats — Grundlage für P4a/P4b.

---

## Vorlauf — Unipile: Webhook-Race + Cross-Customer-Mapping

**[Security]** `reconcile-fallback` mappte den „neuesten unmapped Account" an den Aufrufer → konnte einen fremden Orphan-Account (Tresor) dem falschen Kunden (E&W) zuordnen. Fix: **fail-closed** — nur einen exakt-1 frischen Account (<2 min) mappen. Cross-Customer-Mapping-Vektor geschlossen.

**[Fix]** `unipile-webhook` / `validateAccount`: Race beim `CREATION_SUCCESS` (Unipile liefert kurz 404 → Account wurde verworfen, kein Retry, `unipile_accounts` blieb leer → User sah „nicht verbunden"). Fix: Retry + Backoff. Isoliert auf Prod (Baseline-SCP, nicht develop→prod).

---

## Vorlauf — Unipile-Connect-Diagnose (schenk@euw.de)

**[Diagnose]** „Edge Function non-2xx" beim Connect → als `401` client-seitig identifiziert (Auth-Pfad byte-identisch zum Backup, **kein** Regress durch unsere Redeploys). Addon war korrekt granted (07:43). Der Webhook-Race-Fix (oben) entsperrt den sauberen Reconnect.

---

## Anfang–Mitte Juli — DSGVO-Bereinigungen (team-scoped, PII-frei, mit Kundenfreigabe)

**[Daten]**
- **Linkedin Consulting** — 590 sales_nav-Testkontakte hart gelöscht (entkoppelt).
- **Health Angels** — LinkedIn-Inbox geleert (erst 500 sales_nav, dann alle 1565).
- **Venue Manager** — 126 CRM-Kontakte dedupliziert → 63, in die LinkedIn-Inbox verschoben.
- **Horizont** — LinkedIn-Inbox geleert (2018 Zeilen) + Unipile-Relations-Sync gestoppt (disconnected).

Jeweils rollback-Dry-Run, kein Backup (auf Kundenwunsch), team-scoped verifiziert.

---

## Anfang Juli — Navigation-Fix

**[Fix]** Zwei fehlende Nav-Links in `app.leadesk.de` — `Layout.jsx` war in einer Wave ausgelassen worden (die 2 Items hingen dran). Surgical Cherry-Pick von 2 Zeilen nach `main`.

`main 63723f10`

---

## Offen / In der Queue (bewusst getrennt, kein Zeitdruck)

- **P4b-2** — Verbindungs-Quota (1/Seat): der zweite Check an der Connect-Stelle (`count(unipile_accounts WHERE user_id) < 1` + Consent + P4c-Billing).
- **Admin-Layer-Cleanup** — `is_admin` / `has_license`-Env-Align (Staging vs. Prod: 22-vs-0 RLS-Policies, 0-vs-2 `global_role`-Admins, divergente Func-Menge). Entscheidung Parität vs. JWT-Refactor mit Staff-Lockout-Bedingung (Claim-Menge ≠ `global_role`-Menge).
- **P4c** — Extra-Connection-Billing: die `automation`-Quantity-Maschinerie re-pointen. Braucht Stripe-Preis + Admin-Consent-Fläche (b1).
- **FN1** — `STRIPE_ADDON_WEBHOOK_SECRET` fehlt im Prod-`compose-functions`-Env (chronischer `stripe-addon-webhook` 500, kein Kundenschaden heute, harte P4c-Voraussetzung).

---

## Kill-Switch-Referenz (Team)

```sql
-- Connect-Gate sofort öffnen (fail-open, <1s, kein Restart):
UPDATE public.gate_config SET bypass_keys = ARRAY['connect'];

-- Wieder scharf schalten:
UPDATE public.gate_config SET bypass_keys = '{}';

-- Master-Aus (alle Gates offen):
UPDATE public.gate_config SET gates_enforced = false;
```

`gate_config` ist RLS-locked auf `service_role`, fail-closed (COALESCE). `gate_open(key)=true` → der scharfe Pfad wird nicht erreicht (allow).
