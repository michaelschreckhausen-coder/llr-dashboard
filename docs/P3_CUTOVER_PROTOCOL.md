# P3 — Pricing-Gate-Cutover · Protokoll

Feature-Entitlement zieht von Addon → Plan-Permissions; Gates werden eingezogen.
Basis: P1 (Seat-Fundament live) + P0 (Grandfather-Liste leer). **B1 = member-basiert**
(kein Seat-Zwang in P3; Seats werden erst in P4 load-bearing).

## Reihenfolge (sicherheitskritisch — Permissions VOR Gates)

| Schritt | Inhalt | Status |
|---|---|---|
| 1 | Plan-Permissions auf Ziel-Tier-Sets (`20260716140000`) | ✅ Staging, ⏸ Prod (gebündelt) |
| 2 | Resolver `i_have_permission` + `account_has_permission` + `_shared/permissions.ts` (`20260716150000`) | ✅ Staging, ⏸ Prod (gebündelt) |
| 3 | Gates EF #1–#8 (Guards rufen die Helfer) | offen |
| 4 | Frontend-Gating-Feinschliff + Connect-UX | offen |

**Prod-Cutover-Entscheidung:** Schritt 1 wird NICHT einzeln auf Prod gefahren.
Alle Stufen erst auf Staging fertig + Tier-Test-Matrix grün, dann **ein
koordinierter Prod-Cutover in einem Rutsch** unter Einhaltung der Migrations-
Reihenfolge (Permissions → Helper → Gates).

## Tier-Modell (gelockt)

| Key | Marketing | Sales | All-in | Trial |
|---|---|---|---|---|
| content.calendar | ✅ | — | ✅ | ✅ |
| linkedin.post_analytics | ✅ | — | ✅ | ✅ |
| linkedin.connections | — | ✅ | ✅ | ✅ |
| linkedin.messages | — | ✅ | ✅ | ✅ |
| linkedin.engagement | — | ✅ | ✅ | ✅ |
| linkedin.sales_nav | — | ✅ | ✅ | ✅ |
| linkedin.automation | — | ✅ | ✅ | **— (Variante 2)** |

Trial = All-in minus `linkedin.automation` (Abuse-Schutz gegen Signup-Farmen; Trials
testen alles, automatisierte Ausführung nur im bezahlten Plan). Reversibel per Ein-Key-Flip.

## Parität USER- vs CRON-Pfad (Staging bewiesen 2026-07-16)

`i_have_permission` (get_my_entitlements-Fassade) und `account_has_permission`
(account→plan direkt) müssen für dieselbe (Account × Key)-Kombi identisch auflösen —
sonst driften FE (`hasPermission`) und Cron auseinander. Test: ein Trial-Account durch
alle Tiers + aktiver + **abgelaufener** Trial geswappt, 20 (Szenario × Key)-Fälle,
**0 Mismatches**. Kritisch: abgelaufener Trial → beide `false` (is_active kodiert
Trial-Ablauf exakt wie der Cron-`trial_ends_at`-Check).

## ⚠️ Bewusst-akzeptierte additive FE-Sichtbarkeits-Kanten (Schritt 1)

Das FE liest 4 der 7 Keys schon heute (`routePermissions.js` + `PermissionGuard`
fail-closed). Schritt 1 ist deshalb NICHT FE-inert — er verursacht **2 additive,
tier-korrekte Sichtbarkeits-Änderungen** (kein Zugriffsverlust). Weil das Prod-FE (main)
den Key-Map schon hat, greifen sie, sobald die Permissions auf Prod landen.
**Bekannt, beabsichtigt, additiv — dokumentiert, nicht versteckt:**

1. **`/redaktionsplan` erscheint neu** für **Health Angels** (echter All-in-Kunde —
   eher ein Nachzieh-Fix, sollte es als All-in ohnehin haben) + alle **Trials**
   (content.calendar-ADD). Neue Content-Element-Sicht, berechtigt.
2. **`/automatisierung` erscheint neu** für den **1 Sales-Account** (automation-ADD
   auf Sales-Tier). NICHT für Trials (Variante 2 schließt automation aus).

Die 3 neuen Keys (post_analytics/engagement/sales_nav) sind FE-inert (unmapped) —
sie werden erst in Schritt 3 server-seitig gelesen.

**Cutover-Abnahme:** die 2 Kanten pro echtem Account per Impersonation-Check
verifizieren (Trial-Seite auf Staging bestätigt; Health Angels + Sales beim
Prod-Cutover, da diese Slugs/Accounts auf Staging fehlen).

## Prod-Enforce-Reihenfolge (GELOCKT) — Enforcement beißt erst nach Abnahme

1. **Prod-Apply Permissions** (`20260716140000`). Additiv; die 2 bekannten FE-Kanten erscheinen (s.o.).
2. **Prod-Apply Resolver + `gate_config` + `team_has_permission` + Kill-Switch** (`20260716150000` + `20260716160000`). `gates_enforced=true` (Default), aber **noch importiert KEINE EF die Helfer** → nichts gatet, null Verhaltensänderung.
3. **9-Account-Impersonation-Abnahme mit ECHTER enforced-Logik** (gefahrlos, weil noch keine EF die Resolver liest): pro Account `i_have_permission == true` für jede heute genutzte Fähigkeit + Tier-Spot-Check. Alle grün.
4. **Deploy der 8 EF-Gates** → Enforcement greift ab hier sofort, die 9 bewiesen grün. Kill-Switch griffbereit.
5. **Monitoring-Fenster.** Jeder Fehlblock → `UPDATE gate_config SET gates_enforced=false` (bzw. `admin_set_gate(false)`) in Sekunden, kein Redeploy.

> Wichtig: Die Abnahme (3) läuft VOR dem Gate-Deploy (4) mit `enforced=true` — nur so ist sie aussagekräftig (bei `enforced=false` gibt jeder Resolver trivial `true` zurück). Kein Fenster, in dem Gates greifen, bevor die 9 ab sind.

## Kill-Switch `gate_config` — Sicherheit

- **RLS default-deny**, `REVOKE ALL FROM authenticated, anon`, `GRANT SELECT,UPDATE TO service_role`. Ein Kunde kann die Zeile **nie** lesen/ändern → kann sein eigenes Gate nicht öffnen.
- Resolver lesen `gate_config` als **SECURITY DEFINER** (via `gate_open()`) → RLS umgangen, kein Kunden-Direktzugriff nötig.
- Flip: `admin_set_gate(p_enforced, p_bypass_keys)` (is_leadesk_admin-Guard) fürs Admin-UI, oder direktes `UPDATE` als service_role.
- `bypass_keys[]` = chirurgisch (nur einen Key öffnen), `gates_enforced=false` = Master-Aus.

## Parität-Re-Run nach Kill-Switch-Einbau (vor jedem scharfen Gate)

Die 20-Fälle-Matrix (USER `i_have_permission` vs CRON `team_has_permission`) **zweimal**:
`gates_enforced=true` (muss Tier-Semantik zeigen) UND `=false` (muss überall `true/true` zeigen). Beide 0 Mismatches.

## EF-Gate-Mapping (Schritt 3, Vorschau)

| EF | Kontext | Guard |
|---|---|---|
| #1 connect | user | `requireSeat` (member-basiert) |
| #2 publish | user + cron-auto | `requirePermission('content.calendar')` / `accountHasPermission` |
| #3 monitor · #4 engagement · #5 invitations · #8 relations | cron | `accountHasPermission(acct, …)` (skip statt 403) |
| #6 sales-nav-import · #7 search/enrich | user | `requirePermission(…)` |
| #7 la-runner | cron (Jobs) | `accountHasPermission(job.acct, 'linkedin.automation')` |
