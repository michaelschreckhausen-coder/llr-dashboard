# P3 Prod-Cutover — Runbook (REVIEW-DOC, kein Startschuss)

> **Status:** Review. Nichts hier wird ausgeführt, bevor Michael pro Phase ein explizites
> **„los prod-apply"** gibt. Der Cutover ist die **erste verhaltensändernde Prod-Aktion des
> ganzen Pricing-Projekts** — er wird bewusst, beobachtet und begleitet gefahren, in einem
> ruhigen Zeitfenster mit Michael dabei. Nicht unbeaufsichtigt, nicht auf Zuruf.
>
> Erstellt 2026-07-17. Basis: develop `ca2e118b`, prod `main` `907bb1a6`.

---

## 0. Was scharfgeschaltet wird (und was nicht)

Nach dem Cutover greifen **Permission-Gates für echte Kunden**: Features außerhalb des
gebuchten Tiers (Marketing €79 / Sales €39 / All-in €119, parallel, nicht genestet) werden
in FE **und** EF verweigert. Bis dahin ist der gesamte P3-Stack **inert** (Staging-verifiziert,
`main` unberührt, Prod-`gate_config` existiert noch nicht).

**Nicht Teil dieses Cutovers** (bewusst ausgeklammert):
- **P4** — Seat-Quota-Enforcement + Seat-Assignment-UI (Seats sind in P3 *nicht* load-bearing; B1 = member-based).
- **P2** — VfL-Bochum member-private `la_*` — **nicht gebaut, Gap offen aber dormant** (0 Kampagnen,
  1 geteilter Account, Within-Customer). Unabhängig, eigener späterer Auftrag. Siehe §7.
- **Unipile-Orphans VKtD/bTga** (Tresor) — **NIEMALS** anfassen/reconcilen.

---

## 1. Die drei zwingenden Sicherheits-Prinzipien

Diese drei Dinge sind der Kern des Runbooks — sie sind die Session-langen Footguns, gegen die
wir jede Phase absichern.

### Prinzip A — FE = chirurgischer Cherry-pick, KEIN Merge
`develop` ist **394 Commits vor `main`** (Julians paralleler Content-/Designer-Track). Auf `main`
kommen **ausschließlich die 5 P3-Step-4-Commits**, nichts von Julian:

| Commit | Inhalt |
|---|---|
| `108f1f46` | Gr.1 — `UpgradeRequired`-Kernzustand (neue Datei) + `PermissionGuard`-Redirect→Upsell |
| `d1ad6413` | Gr.2 — Sidebar-Upsell (`Layout.jsx`) + neue Keys (`permissions.js`, `routePermissions.js`) |
| `e253090c` | Gr.2 Nachtrag — href↔Map-Lücken (`routePermissions.js`) |
| `7980af0d` | Gr.3 — Publish-Affordance auf `post.team_id` (`Redaktionsplan.jsx`) |
| `ca2e118b` | Gr.4 — zentraler EF-Fehler-Mapper (`efError.js` neu) + Sales-Nav-Disable + Consumer |

**Empirisch verifiziert (2026-07-17, Dry-run auf Worktree von `origin/main`):**
Alle 5 applizieren **sauber in Sequenz** — **0 Code-Konflikte**. Der **einzige** Konflikt ist
`docs/P3_CUTOVER_PROTOCOL.md` (develop-only Doc) → develop-Version nehmen (`git checkout --theirs`)
oder den Doc-Hunk droppen. Die 394 Commits Divergenz erzeugen **keine** Code-Konflikte, weil die
P3-Änderungen additiv an Hunks liegen, die Julian nicht berührt hat.
→ Beleg-Pflicht im Cutover: `git log origin/main..HEAD` auf dem Cutover-Branch zeigt **genau diese
5 Commits, kein sechster** (kein Fremd-Commit auf main), + `git diff --stat` = nur die erwarteten
P3-Dateien.

### Prinzip B — EF-Deploy isoliert, per Diff gegen Prod-Baseline belegt
Die **12 Gate-EFs + `_shared/permissions.ts`** gehen per **SCP** aufs Prod-Volume (nicht
`supabase functions deploy`), danach `docker compose restart functions`. Für **jede** EF gilt:
**Diff develop-Version vs. laufende Prod-Baseline zeigt NUR die erwartete P3-Gate-Änderung** —
keine divergente develop-Änderung reist mit (kein Julian-IG-Zweig o.ä.). Das ist exakt die
Isolation, die beim Unipile-Webhook-Fix einen P3+IG-Leak verhindert hat.

**Sonderfall `unipile-connect-link`:** Prod-Baseline hat bereits den reconcile-fail-closed-Fix
(2026-07-17 appliziert), aber **noch nicht** das P3-`requireSeat`. develop's Version hat **beide**.
→ Der Diff muss **genau die `requireSeat`-Ergänzung** zeigen und den reconcile-Block **unverändert**
lassen. Wenn der Diff mehr zeigt → STOP, isolieren.

Die 12 EFs:
```
la-runner  process-automation-jobs  unipile-search  unipile-enrich
unipile-connect-link  unipile-monitor  unipile-engagement  unipile-invitations-sync
import-unipile-relations  linkedin-publish-post  unipile-post-publish  import-unipile-salesnav
+ _shared/permissions.ts
```

### Prinzip C — gelockte Enforce-Reihenfolge mit STOP-Gates
Enforcement wird **nicht** durch den EF-Deploy scharf, sondern durch einen **separaten,
letzten Flag-Flip** `gate_config.gates_enforced = true` — mit Kill-Switch griffbereit. Die
9-Account-Impersonation-Abnahme läuft **vor** dem EF-Deploy bei `enforced=true`-aber-kein-EF-liest
(echte Resolver-Logik, gefahrlos, weil kein EF sie noch aufruft). Details in §3.

---

## 2. Vorbedingungen (Pre-Flight, read-only, kein „go" nötig)

- [ ] **B3-Guard grün:** 0 Accounts auf einem Marketing-Plan auf Prod (Step-1-Migration bricht sonst
      absichtlich ab). Check: `SELECT count(*) FROM accounts a JOIN plans p ON p.id=a.plan_id WHERE p.name ILIKE '%marketing%';` → 0.
- [ ] **Prod-Plan-Namen** matchen die Migration-`WHERE`-Klauseln (Marketing/Sales/All-in/Trial). Kurz gegenprüfen.
- [ ] **Backups**: `.bak-precutover-<datum>` aller 12 EFs auf dem Prod-Volume, bevor irgendeine EF überschrieben wird.
- [ ] **Kill-Switch-Handgriff steht bereit** (§5) und ist getestet (Staging).
- [ ] **Zeitfenster** abgestimmt, Michael dabei, Monitoring-Terminal offen.
- [ ] Prod-EF-Baselines der 12 EFs frisch gezogen (`scp` vom Volume) für die Diff-Gegenchecks (Prinzip B).

---

## 3. Ablauf — Phasen mit STOP-Gates

Jede Phase = **eigenes explizites „los prod-apply"**. Zwischen den Phasen wird geprüft, nicht durchgezogen.

### Phase 1 — DB: Permissions-Daten (`20260716140000`)
Setzt `plans.permissions` auf die Tier-Zielmengen (Marketing/Sales/All-in + Trial = All-in minus
`linkedin.automation`, Variant 2). **Rein Daten, keine Gates greifen** (kein Resolver liest sie noch
scharf, kein EF gated). B3-Guard eingebaut.
- **Verify:** `SELECT name, permissions FROM plans ORDER BY name;` == erwartete Zielmengen.
- **Rollback:** Migration ist idempotent; Zurücksetzen = alte Permission-Arrays via umgekehrtem UPDATE
  (Snapshot der `plans.permissions` **vor** Phase 1 ziehen und ablegen).

### Phase 2 — DB: Resolver + `gate_config` + Kill-Switch (`20260716150000`, `20260716160000`)
Legt `i_have_permission`, `account_has_permission`, `team_has_permission`, `gate_open`,
`gate_config` (seed **`gates_enforced=true`**, `bypass_keys={}`), `admin_set_gate` an. RLS
default-deny auf `gate_config`, GRANT nur `service_role`.
- **Wichtig:** `gates_enforced=true` ab Seed — **aber kein EF ruft die Resolver auf** (EFs noch nicht
  deployed) → **nichts gated**. Das ist genau der Zustand, in dem die Abnahme gefahrlos echt ist.
- **Verify:** Resolver existieren; `SELECT * FROM gate_config;` = 1 Zeile, enforced=true.
- **Rollback:** `DROP FUNCTION` der 5 Resolver + `DROP TABLE gate_config` (additiv, nichts hängt dran,
  solange keine EF deployed ist).

### 🛑 STOP-GATE α — 9-Account-Impersonation-Abnahme (vor EF-Deploy)
**Der wichtigste Prüfpunkt.** Bei `enforced=true`, kein EF liest → wir testen die **echte
Resolver-Logik** ohne Kundenrisiko. Für jeden der 9 P0-Referenz-Accounts (je Tier + Trial +
Edge-Cases) per `set_config('request.jwt.claims', …)` → `i_have_permission(key)` für **jede**
Capability durchspielen:
- Marketing-Account → `content.*`=true, `linkedin.*`=false.
- Sales-Account → `linkedin.outreach/connections/…`=true, `content.calendar`=false.
- All-in → beide=true, außer was tier-spezifisch ausgeschlossen ist.
- Trial → All-in **minus `linkedin.automation`** (=false), Rest=true.
- Abgelaufener Trial → alles false (`is_active=false`).
- **Abnahme-Kriterium:** Ist-Matrix == Soll-Matrix aus `P3_CUTOVER_PROTOCOL.md`, **9/9 grün**.
- **Bei Rot:** STOP. Kein EF-Deploy. Ursache klären (Plan-Permissions vs. Resolver), Phase 1/2
  korrigieren, α wiederholen.

### Phase 3 — Enforce vorübergehend ÖFFNEN (`gates_enforced=false`)
Damit der EF-Deploy **inert** landet: `SELECT admin_set_gate(false, '{}');` → Gates offen.
Jetzt lesen die gleich deployten EFs zwar die Resolver, aber `gate_open()` → alles passiert.
**Kein Kundenimpact durch den Deploy selbst.**

### Phase 4 — FE: chirurgischer Cherry-pick `develop`→`main` (Prinzip A)
1. Worktree von `origin/main`, die 5 Commits **in Reihenfolge** cherry-picken.
2. Doc-Konflikt (`P3_CUTOVER_PROTOCOL.md`) auflösen (develop-Version) — **einziger** erwarteter Konflikt.
3. **Beleg:** `git log --oneline origin/main..HEAD` = **genau 5 Commits**; `git diff --stat origin/main`
   = nur erwartete P3-Dateien (kein Fremd-Commit, keine Julian-Datei).
4. `npm ci && vite build` **grün** (lokal im Worktree).
5. Push `main` → **Vercel-Deploy `READY`** abwarten. FE zeigt jetzt Lock-Badges/Upsell — **aber**
   die EFs sind offen (Phase 3) → FE-Gating ist kosmetisch sichtbar, blockt aber noch nichts hart.
- **Rollback:** `git revert` der 5 Commits auf main + Vercel-Redeploy (FE ist zustandslos, sauber reversibel).

### Phase 5 — EF-Deploy isoliert (Prinzip B)
Für jede der 12 EFs + `_shared/permissions.ts`:
1. **Diff** develop-Version vs. gezogene Prod-Baseline → **nur erwartete Gate-Änderung** (bei
   `unipile-connect-link`: nur `requireSeat`, reconcile-Block unverändert). Mehr → STOP + isolieren.
2. SCP aufs Volume, `md5` Volume == Repo-Version verifizieren.
3. Nach allen 12: **einmal** `docker compose restart functions`.
4. **Smoke:** jede EF lädt ohne Boot-Fehler (`docker compose logs functions | grep -iE 'error|boot'`),
   + eine Wiring-Probe mit gültigem JWT → 200 (Gates offen aus Phase 3, also erwartbar durch).
- **Rollback:** `.bak-precutover`-Version je EF zurück-SCPen + `restart functions`.

### 🛑 STOP-GATE β — Enforcement-Vorschau bei offenen Gates
Bevor scharfgeschaltet wird: bestätigen, dass die EFs **die Resolver tatsächlich aufrufen** (nicht
nur geladen sind). Kurzer Test mit `bypass_keys` oder gezieltem Impersonation-JWT, dass ein
Sales-User bei einer Marketing-EF **den 403-Pfad *erreichen würde*** — das lässt sich bei
`enforced=false` daran ablesen, dass `team_has_permission` in den EF-Logs mit dem richtigen Key
aufgerufen wird. Ziel: beweisen, dass §5-Kill-Switch beim Scharfschalten auch wirklich greift.

### Phase 6 — Marketplace-Retire: `automation` + `sales-nav-sync` nicht mehr kaufbar
Verkauf der zwei künftig tier-gebündelten Addons **zumachen, bevor** die Gates permission-basiert
scharf gehen — so gibt es kein Fenster „im Marktplatz kaufbar, aber Feature schon tot".

**Hebel (Discovery 2026-07-17):** die **einzige** Kaufbarkeits-Spalte in `addons` ist `is_active`
(kein `is_purchasable`/`status`/`visible` etc.; kein Schema-Drift Prod↔Staging). Exakte Slugs:
**`automation`** + **`sales-nav-sync`** (nicht `sales-nav`).

```sql
UPDATE addons SET is_active = false WHERE slug IN ('automation','sales-nav-sync');
-- andere Addons unberührt; nur diese zwei Katalog-Zeilen.
```

**Warum das den Kauf-Pfad WIRKLICH schließt (nicht nur FE-Kosmetik)** — beide Kauf-Einstiege
re-validieren `is_active` server-seitig gegen den Slug, vertrauen keiner Client-Angabe:
- **Paid:** `create-addon-checkout-session` (`index.ts:93-103`) → `.eq('slug', addonSlug).eq('is_active', true).maybeSingle()` → `addon_not_found` (404).
- **Free:** RPC `activate_addon` (SECURITY DEFINER) → `where slug = p_slug and is_active = true` → `raise 'addon not found or inactive'`.
  **Prod-`sales-nav-sync` läuft über DIESEN Free-Pfad** (leere `stripe_price_id`) — der `activate_addon`-Guard ist dort der relevante; Staging-`sales-nav-sync` ist paid → Checkout-EF. Beide gaten auf `is_active`, also schließt der **eine** UPDATE beide Mechanismen je Env.
- **Webhook** `stripe-addon-webhook` prüft `is_active` nicht selbst, ist aber nur über eine von der Checkout-EF gemintete `metadata.flow='marketplace_addon'`-Subscription erreichbar → kein kundenerreichbarer Direkt-Kaufpfad.

**Bestehende Halter unberührt** (Pflicht): `is_active` sitzt nur auf der `addons`-Katalogzeile.
`get_my_addons` und `get_my_entitlements` joinen `account_addons → addons` **ohne** `addons.is_active`-Filter
(gaten nur auf `account_addons.status='active'`) → die **18 Prod-Halter** behalten Rows + Module
(`{linkedin,crm}` bei sales-nav). Retire ist für sie unsichtbar. **`account_addons`-Rows NICHT anfassen.**

**Staging-first verifizieren (3 Checks):**
1. Beide tauchen im Marktplatz **nicht mehr als kaufbar** auf (`useAddons` `.eq('is_active',true)` → `useAddons.js:31`).
2. Ein **bestehender Halter merkt nichts** — `get_my_entitlements`/`get_my_addons` für einen Halter byte-gleich vor/nach.
3. **Direct-Call-Kauf abgelehnt** — Checkout-EF mit `addon_slug` → 404 `addon_not_found`; `activate_addon('sales-nav-sync')` → Exception.

**Dann Prod als eigene Phase** (dieses UPDATE) **vor** dem Enforce-Flip (Phase 7).
- **Rollback:** `UPDATE addons SET is_active = true WHERE slug IN ('automation','sales-nav-sync');` — sofort wieder kaufbar.

### Phase 7 — 🔴 SCHARFSCHALTEN: `gates_enforced=true` (separater, letzter Schritt)
**Der eine verhaltensändernde Moment.** `SELECT admin_set_gate(true, '{}');` — beobachtet, Michael
dabei, Monitoring offen, Kill-Switch-Befehl **vorbereitet in der Zwischenablage**.
- Ab jetzt: Out-of-Tier-Capabilities → 403 in EF, Upsell in FE. Die 9 Abnahme-Accounts sind bereits
  grün bewiesen (STOP-Gate α), das Kundenverhalten ist also vorhergesagt.

### 🛑 STOP-GATE γ — Monitoring-Fenster (aktiv beobachtet)
- EF-Logs auf **unerwartete 403** watchen (`docker compose logs -f functions | grep -iE '403|need_permission'`).
- Cron-Läufe (la-runner/process-automation-jobs): keine Massen-`fail`/Skip auf legitimen Teams.
- **False-Block-Kriterium:** ein Account, der laut Tier Zugriff haben MUSS, bekommt 403 → sofort §5.
- Fenster: mind. 1 vollständiger Cron-Zyklus + aktive Kundennutzung beobachtet.

---

## 4. Reihenfolge-Logik auf einen Blick

```
Phase 1  Permissions-Daten        (enforced n/a, nichts gated)
Phase 2  Resolver + gate_config   (enforced=TRUE, aber kein EF liest → nichts gated)
   🛑 α  9-Account-Abnahme         (echte Logik, gefahrlos, MUSS 9/9 grün)
Phase 3  admin_set_gate(false)     (Gates ÖFFNEN, damit Deploy inert)
Phase 4  FE Cherry-pick → main     (Lock-Badges sichtbar, blockt noch nicht)
Phase 5  EF-Deploy isoliert        (EFs lesen Resolver, aber gate_open → alles durch)
   🛑 β  Enforcement-Vorschau      (beweisen: Resolver werden aufgerufen)
Phase 6  Marketplace-Retire        (addons.is_active=false für automation+sales-nav-sync;
                                     Kauf ZU vor dem Enforce, Halter unberührt)
Phase 7  admin_set_gate(true)      🔴 SCHARF — separater letzter Flip, beobachtet
   🛑 γ  Monitoring-Fenster        (false-blocks → sofort Kill-Switch)
```

Warum α **vor** dem Öffnen (Phase 3) läuft: nur bei `enforced=true` testet die Impersonation die
echte Gate-Entscheidung. Danach öffnen wir bewusst für einen risikofreien Deploy und schließen erst
im letzten, beobachteten Schritt.

---

## 5. Kill-Switch (in jeder Phase ab 5 griffbereit)

**Ein Befehl, Wirkung in <1s, kein Deploy nötig** (Resolver lesen `gate_config` live):
```sql
SELECT admin_set_gate(false, '{}');   -- ALLE Gates sofort offen (Vollrücknahme Enforcement)
```
Gezielter (einzelne Capability entschärfen, Rest scharf lassen):
```sql
SELECT admin_set_gate(true, ARRAY['linkedin.sales_nav']);  -- bypass_keys: diese Keys offen
```
Verifikation nach Kill: `SELECT * FROM gate_config;` + eine betroffene EF erneut → 200.
FE/EF ziehen beide aus `get_my_entitlements`/`gate_open` → **eine** Rücknahme wirkt überall.

---

## 6. Rollback-Matrix (pro Phase, sauber reversibel)

| Phase | Rückweg | Reversibel? |
|---|---|---|
| 1 Permissions | umgekehrtes UPDATE aus Vor-Snapshot | ✅ voll |
| 2 Resolver+gate_config | DROP FUNCTION/TABLE (additiv) | ✅ voll |
| 3 open | `admin_set_gate(true,…)` | ✅ Flag |
| 4 FE | `git revert` 5 Commits + Vercel-Redeploy | ✅ voll |
| 5 EF-Deploy | `.bak-precutover` zurück + restart | ✅ voll |
| 6 Marketplace-Retire | `UPDATE addons SET is_active=true WHERE slug IN (…)` | ✅ Flag |
| 7 scharf | `admin_set_gate(false,…)` (Kill-Switch) | ✅ Flag, <1s |

Es gibt in diesem Cutover **keinen** nahe-irreversiblen Schritt — jede Phase kann einzeln
zurückgenommen werden, ohne die vorherige anzufassen.

---

## 7. Offener Nebenpunkt: P2 (VfL-Bochum member-private `la_*`)

Read-only-Befund 2026-07-17: **nicht gebaut, nirgends** (kein Commit/Branch). `la_accounts`/
`la_campaigns` sind by-design team-scoped (`user_in_team(team_id)`, keine `user_id`-Spalte). Prod ==
Staging. VfL Bochum = 1 Team, 3 Members, **0 Kampagnen**, **1 geteilter** `la_account` (`joshua-kadel`).
→ **Within-Customer Member-Privacy-Gap, aktuell dormant** (kein aktiver Cross-Customer-Leak).
**Blockt den P3-Cutover nicht.** Eigener späterer Auftrag; braucht erst eine `user_id`/`owner_id`-Spalte
auf `la_accounts` + Backfill, bevor die RLS member-privat werden kann. Hier nur als offener Punkt
festgehalten, damit er vor „Gesamtprojekt abgeschlossen" nicht verloren geht.

---

## 8. Was der Cutover-Ausführende NICHT tut

- **Kein Merge** develop→main (nur die 5 Cherry-picks).
- **Kein** `supabase functions deploy` (nur SCP + `restart functions`).
- **Kein** Anfassen der Unipile-Orphans VKtD/bTga.
- **Keine** Phase ohne explizites „los prod-apply".
- **Kein** Scharfschalten (Phase 7), solange STOP-Gate α nicht 9/9 grün war.
- **Kein** Anfassen bestehender `account_addons`-Halter-Rows beim Marketplace-Retire (nur der Katalog-Flag).
