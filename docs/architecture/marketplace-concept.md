# Marketplace — Konzept-Spec

> Stand 2026-06-22. Konsolidiert aus dem Marketplace-Audit (Phase 0) und auf den
> Ist-Stand nach Phasen 3 / 3b / 4a–4d gebracht. Single Source für Addon-Lifecycle,
> Aktivierungs-Pfade, Admin-Surfaces und das Addon-Anlage-Playbook.
> Schema-Wahrheit: `app.leadesk.de/admin-docs` + Live-DB. Hier steht das *Konzept*.

## 0. Status quo (verifiziert Prod, 2026-06-22)

- **Katalog** `public.addons`: strike2-zielgruppen-plus, auralis, slack/sevdesk,
  sales-nav-sync, premium-models-sales, hubspot/salesforce/dynamics365/asana
  (Coming-Soon), `ai-boost` (ausgeblendet).
- **Aktivierungen** `public.account_addons` (**account-scoped**, kein `team_id`):
  `status` ∈ `active|past_due|canceled|paused|pending`, plus `stripe_subscription_id`,
  `stripe_subscription_item_id`, `current_period_end`, `is_grandfathered`.
- **Free-Pfad** `activate_addon()` / Gate `get_my_addons()` + `i_have_addon()` — alle
  active_team_id-priorisiert (Fix 20260629100000). Cancel via `cancel_addon(p_slug)`.
- **Paid-Pfad** `create-addon-checkout-session` EF (Prod deployed, live) → Stripe →
  `stripe-addon-webhook` schreibt `account_addons`. Verwalten via `create-billing-portal-session`.
- **Waitlist** `public.marketplace_waitlist` (`id, account_id, addon_id, notified_at, created_at`
  — **kein `status`**, Stand via `notified_at IS NULL`). Customer-Pfad `join_addon_waitlist`.
- **Admin** (`leadesk-admin`): `/marketplace` (Katalog-CRUD via `AddonEditModal` +
  **Per-Row is_active-Toggle** + Waitlist-Count + Integration-Secret-Status),
  `/marketplace-waitlist` (Pipeline + Notify), `/marketplace-stripe-sync` (Drift-Dashboard),
  `AccountDetail` → Tab „Add-ons" (pro-Account-Sicht + entziehen).

---

## 1. Drei Addon-Archetypen (Spec-Patterns)

Jedes Addon fällt in genau einen Archetyp. Der Aktivierungs-Pfad ergibt sich aus
`stripe_price_id` + `activates_modules` (siehe Frontend-Logik `MarketplaceCard.isFreeActivatable`).

| | **A — Coming-Soon Integration** | **B — Free Team-Feature** | **C — Paid Subscription** |
|---|---|---|---|
| Beispiele | HubSpot, Salesforce, Dynamics365, Asana, slack, sevdesk | Strike2, Sales-Nav-Sync | premium-models-sales, auralis |
| `stripe_price_id` | NULL | NULL | gesetzt |
| `activates_modules` | `{}` (leer) | gesetzt (`{linkedin,crm}`, `{strike2_…}`) | optional |
| `price_monthly_cents` | sichtbar (Preview) | 0 / frei | echter Preis |
| CTA | **„Auf Warteliste"** → `joinWaitlist` → `marketplace_waitlist` | **„Kostenlos aktivieren"** → `activate_addon` → `account_addons` | **„Abonnieren"** → `create-addon-checkout-session` → Stripe → Webhook schreibt `account_addons` |
| Scope | account | account (Modul team-wirksam via Entitlement) | account |

**Klassifikations-Regel (Frontend, `MarketplaceCard.jsx`):**
```js
hasStripe        = !!addon.stripe_price_id
isFreeActivatable = !hasStripe && Array.isArray(activates_modules) && activates_modules.length > 0
// hasStripe        → Pattern C (Abonnieren)
// isFreeActivatable → Pattern B (Kostenlos aktivieren)
// sonst (kein Stripe, kein Modul) → Pattern A (Auf Warteliste)
```
> ⚠️ Daraus folgt der Phase-0-Bug: `ai-boost` (ai_quota, **kein Modul**, kein Stripe) fiel in
> Pattern A → „null Effekt". `ai_quota` braucht einen **eigenen** Pfad ODER bleibt ausgeblendet
> (siehe D-1, de-facto: ausgeblendet).

---

## 2. Surfaces — Ist-Stand (Phasen 3 / 4b / 4c / 4d gebaut)

### 2.1 Frontend-Card-Lifecycle (Customer) — ✅ Phase 3 Live
- Aktivierung A/B/C funktioniert. Aktive Card → `Aktiv`-Pill + Kebab-Menü:
  - Pattern B (free): „Kündigen" → `cancel_addon(p_slug)` (sofort `status='canceled'`, D-2).
  - Pattern C (paid): „Abonnement verwalten" → Stripe-Billing-Portal (`create-billing-portal-session`).
- Verdrahtet in `useAddons.js` (`activateAddon`/`cancelAddon`/`joinWaitlist`) + `Marketplace.jsx`.

### 2.2 ai_quota-Pfad — ⏸ deferred (D-1, Empfehlung b)
- `ai-boost` bleibt `is_active=false`. Credits laufen über die Credits-Top-up-Surface
  (`CreditsTopupSection` + `create-credits-checkout-session`), nicht über den Marketplace.

### 2.3 Waitlist-Feedback (Customer) — ✅ Phase 3 Live
- Klick auf Pattern-A-Card → `joinWaitlist(slug)` → `join_addon_waitlist`-RPC, Feedback
  über den Response (idempotent: doppelter Klick = bereits eingetragen).

### 2.4 Admin: Waitlist-Pipeline — ✅ Phase 4b Live
- `/marketplace-waitlist`: Drill-down (Account + Owner-Email pro Addon), Bulk-Notify
  + CSV-Export. RPCs `admin_get_waitlist_entries` / `admin_mark_waitlist_notified`
  (Migration 20260629160000). Stand via `notified_at` (D-3, kein `status`-Spalte).

### 2.5 Admin: Account-Detail-Addons — ✅ Phase 4c Live
- `AccountDetail` → Tab „Add-ons": aktive Add-ons pro Account (Status/aktiviert-am)
  + Admin-Aktion „entziehen" (Reason ≥10). RPCs `admin_get_account_addons` /
  `admin_revoke_account_addon` (Migration 20260629140000, is_leadesk_admin-gated).

### 2.6 Admin: Stripe-Sync-Status — ✅ Phase 4d Live
- `/marketplace-stripe-sync`: on-demand-Abgleich `account_addons.stripe_subscription_id`
  ↔ Stripe-Live-Status via EF `admin-stripe-sync-audit` (D-4: **Live-Call, on-demand**,
  kein Cron). Drift-Klassen:
  - `none` — DB ≈ Stripe
  - `orange` — DB active, Stripe canceled/past_due/incomplete/unpaid/paused
  - `unlinked` — Pattern-C-Row OHNE `stripe_subscription_id` (manueller Grant, nie verknüpft) — grau
  - `red` — DB canceled & Stripe active (Webhook-Loss) **oder** Stripe-404 für vorhandene sub_id
- Heal pro Row: `admin_heal_addon_sync(id, new_status, reason≥10)` → setzt DB auf
  Stripe-Wahrheit + `admin_audit_log` (`action='stripe_drift_healed'`). Migration 20260629170000.

---

## 3. Häufige Fallen bei Addon-Anlage

> Referenz für jede neue Addon-Row. Hat beim 2026-06-19-Seed real gestolpert.

1. **`price_monthly_cents` (Cent-Integer), NICHT `price_eur`.** Die `addons`-Tabelle hat kein
   `price_eur`/`billing_interval` (analog `plans`-Drift, CLAUDE.md #8). 19 € → `1900`.
   `currency` default `'EUR'`. CHECK `price_monthly_cents >= 0` (free = `0`).
2. **`icon` = PascalCase-Lucide-Slug** (`'MessageSquare'`, `'Network'`, `'Building2'`).
   Falscher/fehlender Slug → `resolveAddonIcon`-Fallback (kein Crash, aber Platzhalter).
3. **`type`-CHECK**: nur `feature_unlock | integration | ai_quota`. `category` ist Freitext.
4. **Free-Activation braucht `activates_modules` NICHT leer** — sonst fällt das Addon auf den
   Waitlist-Pfad (auch ohne Stripe-Price). Pattern B MUSS ein Modul setzen.
5. **`features` ist `jsonb` NOT NULL default `[]`** — als `'[...]'::jsonb` übergeben.
6. **Account-Auflösung in RPCs immer active_team_id-priorisiert** (`activate_addon`-Muster),
   NIE `LIMIT 1` ohne ORDER BY — sonst Multi-Account-Bug (Fix 20260629100000).
7. **Self-Host-GRANT** für neue Tabellen (CLAUDE.md #3/#12) — bei Schema-Erweiterungen
   `GRANT … TO authenticated` mitliefern.
8. **Katalog via Admin-UI ist OK** (RLS `addons_write_leadesk_admin`) — für **Repo-Parität**
   die Coming-Soon-Vier o.ä. zusätzlich als Migration-File ablegen, sonst Drift bei Env-Re-Setup.
9. **Pattern-C ohne `stripe_subscription_id`** = im Stripe-Sync-Dashboard `unlinked` (grau),
   NICHT rot. Entsteht bei manuellem Admin-Grant eines Stripe-Addons (kein Checkout durchlaufen).

---

## 4. Developer-Playbook: neues Addon anlegen

### 4.1 Decision-Tree — welcher Pattern / welche Felder?

```
Neues Addon?
│
├─ Soll der Kunde dafür ZAHLEN (Stripe-Abo)?
│   └─ JA  → PATTERN C (Paid)
│            • Stripe-Produkt + Price vorab im Stripe-Dashboard anlegen
│            • stripe_price_id (+ stripe_product_id) setzen
│            • type = integration | feature_unlock
│            • price_monthly_cents = echter Preis
│            → CTA „Abonnieren" → Checkout → Webhook schreibt account_addons
│
├─ NEIN: Schaltet es JETZT ein Feature/Modul frei (gratis)?
│   └─ JA  → PATTERN B (Free-Feature)
│            • stripe_price_id = NULL
│            • activates_modules = {…}   ← MUSS gesetzt sein, sonst Pattern A!
│            • type = feature_unlock
│            • price_monthly_cents = 0
│            → CTA „Kostenlos aktivieren" → activate_addon → account_addons
│            • Modul zusätzlich im Frontend/RLS verdrahten (Entitlement)
│
└─ NEIN: nur Interesse sammeln (noch nicht buchbar) → PATTERN A (Coming-Soon)
         • stripe_price_id = NULL
         • activates_modules = {}   ← LEER lassen!
         • type = integration
         • price_monthly_cents = Preview-Preis (oder 0)
         → CTA „Auf Warteliste" → join_addon_waitlist → marketplace_waitlist
```

### 4.2 Wie lege ich ein neues Addon an? (Admin-UI, **ohne Migration**)

Der Normalweg seit Phase 4a — kein SQL, kein Deploy:

1. `admin.leadesk.de/marketplace` → **„+ Neuer Add-on"**.
2. Felder ausfüllen: Name (→ Slug auto), Kategorie, **Typ** (siehe Decision-Tree),
   Kurz-/Lang-Beschreibung, **Preis pro Monat**, Icon (Lucide-Slug).
3. Pattern bestimmt nur **zwei** Felder:
   - **Stripe Price ID** → gesetzt = Pattern C, leer = A/B.
   - **Module** (nur bei Typ `feature_unlock` sichtbar) → gesetzt = Pattern B, leer = A.
4. Speichern → die Card erscheint **sofort** im Customer-Marketplace (katalog-getrieben).
5. In der Liste: **is_active-Toggle** schaltet die Sichtbarkeit, „Schlüssel" hinterlegt
   Integration-Secrets (`admin_set_addon_integration`), „Bearbeiten" öffnet das Edit-Modal.

> Repo-Parität (Falle #8): für dauerhaft wichtige Katalog-Einträge die Row zusätzlich als
> Migration-File ablegen — Vorbild `20260629120000_marketplace_integrations_seed.sql`.

### 4.3 SQL-Fallback (Pattern A, falls Migration-File gewünscht)

```sql
INSERT INTO public.addons (
  slug, name, short_description, long_description,
  type, category, price_monthly_cents, currency,
  icon, highlight_color, features, activates_modules, is_active, sort_order
) VALUES (
  'my-integration', 'My Integration', 'Kurzbeschreibung', 'Lange Beschreibung…',
  'integration', 'integration', 1900, 'EUR',
  'Plug', '#1234AB',
  '["Feature 1","Feature 2"]'::jsonb,
  ARRAY[]::text[],            -- leer → Waitlist-Pfad (Pattern A)
  true, 120
) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, /* … */ sort_order=EXCLUDED.sort_order;
```

### 4.4 Stripe-Felder × Customer-CTA-Pille

| `stripe_price_id` | `activates_modules` | Pattern | CTA-Pille (nicht aktiv) | CTA wenn aktiv |
|---|---|---|---|---|
| NULL | `{}` leer | **A** Coming-Soon | „Auf Warteliste" (Hourglass) | „Auf Warteliste" (disabled) |
| NULL | gesetzt | **B** Free-Feature | „Kostenlos aktivieren" | „Aktiv" → Kebab → „Kündigen" |
| gesetzt | egal | **C** Paid | „Abonnieren" | „Aktiv" → Kebab → „Abonnement verwalten" |

> Quelle: `MarketplaceCard.renderCta()`. Reihenfolge der Checks: `isSubscribed` →
> `isFreeActivatable` → `isWaitlisted` → `hasStripe` → Fallback Waitlist. `isFreeActivatable`
> hat **Vorrang vor** Waitlist (wer vor der Free-Schaltung waitlisted hatte, kann trotzdem aktivieren).

---

## 5. Decision-Calls — Stand 2026-06-22

- **D-1** ai_quota: ⏸ **deferred** → `ai-boost` bleibt `is_active=false`, Credits laufen über
  die Credits-Surface (Empfehlung b umgesetzt de-facto; formaler „raus"-Call offen).
- **D-2** Cancel-Semantik: ✅ **entschieden — sofort** (`cancel_addon` setzt direkt
  `status='canceled'` für Pattern B; Pattern C kündigt über das Stripe-Billing-Portal).
- **D-3** Waitlist-Status: ✅ **entschieden — minimal via `notified_at`** (keine `status`-Spalte;
  4b leitet `waiting|notified` daraus ab).
- **D-4** Stripe-Sync: ✅ **entschieden — Live-Call, on-demand** (EF `admin-stripe-sync-audit`,
  kein Cron; Webhook bleibt primärer Schreibpfad, das Dashboard ist der Drift-Abgleich).
- **D-5** Phasen-Reihenfolge: ✅ **obsolet** — 3 / 3b / 4a / 4b / 4c / 4d alle gebaut.
  Offen nur noch Phase 5 (dieses Dokument) + Minor-Polish (Heal-Success-Toast im Sync-Tab).
