# Marketplace — Konzept-Spec

> Stand 2026-06-19. Konsolidiert aus dem Marketplace-Audit (Phase 0). Single Source
> für Addon-Lifecycle, Aktivierungs-Pfade, Admin-Surfaces und Addon-Anlage-Playbook.
> Schema-Wahrheit: `app.leadesk.de/admin-docs` + Live-DB. Hier steht das *Konzept*.

## 0. Status quo (verifiziert Prod, 2026-06-19)

- **Katalog** `public.addons` (10 aktiv, 1 inaktiv): strike2-zielgruppen-plus, auralis,
  slack/sevdesk, sales-nav-sync, premium-models-sales, hubspot/salesforce/dynamics365/asana
  (Coming-Soon), `ai-boost` (ausgeblendet).
- **Aktivierungen** `public.account_addons` (**account-scoped**, kein `team_id`): auralis 5,
  sales-nav-sync 2, strike2 1.
- **Free-Pfad** `activate_addon()` / Gate `get_my_addons()` + `i_have_addon()` — alle
  active_team_id-priorisiert (Fix 20260629100000).
- **Paid-Pfad** `create-addon-checkout-session` EF (Prod deployed, live).
- **Waitlist** `public.marketplace_waitlist` (`id, account_id, addon_id, notified_at, created_at`
  — **kein `status`**). Admin zeigt nur Count, kein Drill-down.
- **Admin** (`leadesk-admin`): `/marketplace` (Katalog-CRUD via `AddonEditModal` + Waitlist-Count
  + Integration-Secret-Status). `AccountDetail` zeigt **keine** Addons.

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
> Pattern A → „null Effekt". `ai_quota` braucht einen **eigenen** Pfad (Quota gutschreiben /
> zu Credits-Checkout routen) ODER bleibt ausgeblendet. → Entscheidung D-1.

---

## 2. Surfaces — Ist → Soll → Schema/RPC → offene Entscheidung

### 2.1 Frontend-Card-Lifecycle (Customer, app.leadesk.de/marketplace) — Phase 3
- **Ist:** Aktivierung (A/B/C) funktioniert. Aktive Card = nur `Aktiv`-Pill, **keine Verwaltung**.
- **Soll:** Aktive Card bekommt **„Verwalten / Kündigen"**.
  - Pattern B (free): Cancel → `account_addons.status='canceled'` via neue RPC `cancel_addon(p_slug)`
    (SECURITY DEFINER, active_team_id-Auflösung wie `activate_addon`).
  - Pattern C (paid): „Verwalten" → Stripe-Billing-Portal (`create-billing-portal-session`, existiert).
- **Schema/RPC:** neue `cancel_addon(p_slug)`. Kein Schema-Change.
- **Offene Entscheidung D-2:** Cancel sofort (`canceled`) oder zum Periodenende (`current_period_end`)?

### 2.2 ai_quota-Pfad — Phase 3
- **Ist:** `ai-boost` ausgeblendet (`is_active=false`), kein Aktivierungs-Pfad.
- **Soll (D-1):** entweder (a) ai_quota-Addons → Credits-Checkout-Flow routen (es gibt
  `CreditsTopupSection` + `create-credits-checkout-session`), oder (b) dauerhaft raus
  (Credits laufen ohnehin über die Credits-Top-up-Surface, nicht Marketplace).
- **Empfehlung:** (b) — Credits gehören in die Credits-Surface, Marketplace bleibt Feature/Integration.

### 2.3 Waitlist-Feedback (Customer) — Phase 3
- **Ist:** Klick auf Pattern-A-Card → `joinWaitlist` → schwaches/kein sichtbares Feedback
  („null Effekt"-Gefühl).
- **Soll:** deutlicher In-DOM-Toast „Du stehst auf der Warteliste für X — wir melden uns".
  Idempotenz: doppelter Klick → „Bereits eingetragen".

### 2.4 Admin: Waitlist-Pipeline — Phase 4b
- **Ist:** Admin zeigt nur **Count** pro Addon. Kein Drill-down, keine Aktion.
- **Soll:** Drill-down (welche Accounts/Kontakte), **Notify-Action** (Mail an Interessenten
  wenn Addon live), `notified_at` setzen.
- **Schema:** `marketplace_waitlist.status` (`waiting|notified|converted`) ergänzen ODER
  über `notified_at IS NULL` ableiten (minimal). → Entscheidung D-3.
- **RPC:** `admin_list_waitlist()` + `admin_notify_waitlist(addon_id)`.

### 2.5 Admin: Account-Detail-Addons — Phase 4c
- **Ist:** `AccountDetail.jsx` zeigt **keine** Addons.
- **Soll:** Block „Aktive Add-ons" pro Account (aus `account_addons` + `addons`), mit
  Status/aktiviert-am + Admin-Aktion „entziehen" (`account_addons.status='canceled'`).
- **RPC:** `admin_get_account_addons(account_id)` (is_leadesk_admin-gated, CLAUDE.md #9).

### 2.6 Admin: Stripe-Sub-Sync-Status — Phase 4d
- **Ist:** „Nicht aktuell gesynct"-Hinweis; Integration-Secret-Status via
  `admin_list_addon_integrations`, Stripe-Sub-Status separat.
- **Soll:** Sync-Dashboard — `account_addons.stripe_subscription_id` ↔ Stripe-Live-Status
  abgleichen (past_due/canceled-Drift sichtbar).
- **Offene Entscheidung D-4:** Live-Stripe-Call (EF) vs. Webhook-getriebener Status (Vertrauen
  auf `account_addons.status`)?

---

## 3. Häufige Fallen bei Addon-Anlage

> Diese Sektion ist die Referenz für jede neue Addon-Row. Hat beim 2026-06-19-Seed real gestolpert.

1. **`price_monthly_cents` (Cent-Integer), NICHT `price_eur`.** Die `addons`-Tabelle hat kein
   `price_eur`/`billing_interval` (analog `plans`-Drift, CLAUDE.md #8). 19 € → `1900`.
   `currency` default `'EUR'`. CHECK `price_monthly_cents >= 0` (free = `0`).
2. **`icon` = PascalCase-Lucide-Slug** (wie `'MessageSquare'`, `'Network'`, `'Building2'`).
   Falscher/fehlender Slug → `resolveAddonIcon`-Fallback (kein Crash, aber Platzhalter).
3. **`type`-CHECK**: nur `feature_unlock | integration | ai_quota`. `category` ist Freitext.
4. **Free-Activation braucht `activates_modules` NICHT leer** — sonst fällt das Addon auf den
   Waitlist-Pfad (auch ohne Stripe-Price). Pattern B MUSS ein Modul setzen.
5. **`features` ist `jsonb` NOT NULL default `[]`** — als `'[...]'::jsonb` übergeben.
6. **Account-Auflösung in RPCs immer active_team_id-priorisiert** (`activate_addon`-Muster),
   NIE `LIMIT 1` ohne ORDER BY — sonst Multi-Account-Bug (Fix 20260629100000).
7. **Self-Host-GRANT** für neue Tabellen (CLAUDE.md #3/#12) — bei Schema-Erweiterungen
   (`marketplace_waitlist.status` etc.) `GRANT … TO authenticated` mitliefern.
8. **Katalog-Änderungen als Migration-File** ablegen (Repo-Parität), auch wenn via Admin-UI
   möglich — sonst Drift bei Env-Re-Setup/Rebuild.

---

## 4. Developer-Playbook: neue Integration ohne Code

Eine **Pattern-A-Integration** (Coming-Soon) braucht NUR eine `addons`-Row — kein Frontend-Code:

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
  ARRAY[]::text[],            -- leer → Waitlist-Pfad
  true, 120
) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, /* … */ sort_order=EXCLUDED.sort_order;
```
Card erscheint sofort (katalog-getrieben, kein Deploy). Beispiel-Referenz: Migration
`20260629120000_marketplace_integrations_seed.sql` (HubSpot/Salesforce/Dynamics/Asana).

Für **Pattern B** zusätzlich: `activates_modules` setzen + Modul im Frontend/RLS verdrahten.
Für **Pattern C**: `stripe_price_id` + `stripe_product_id` setzen (Stripe-Produkt anlegen).

---

## 5. Offene Decision-Calls (für Review)

- **D-1** ai_quota: Credits-Checkout-Routing (a) vs. dauerhaft raus (b)? *(Empfehlung b)*
- **D-2** Cancel-Semantik: sofort vs. Periodenende?
- **D-3** Waitlist-Status: neue `status`-Spalte vs. `notified_at`-Ableitung? *(Empfehlung: minimal via notified_at, status nur wenn Conversion-Tracking nötig)*
- **D-4** Stripe-Sync: Live-Call vs. Webhook-Vertrauen?
- **D-5** Reihenfolge der Phasen 3/4b/4c/4d — was zuerst? *(Empfehlung: 3 + 4c zuerst — höchster Customer/Admin-Sichtbarkeitswert)*
