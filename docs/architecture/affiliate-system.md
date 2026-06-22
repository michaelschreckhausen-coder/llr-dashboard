# Affiliate-System — Konzept-Spezifikation

> Stand: 2026-06-22 · Status: Konzept (vor Implementation) · Decision-Calls D1–D7 mit User durch

## 1. Ziel

Affiliate-Programm für Leadesk: Externe Partner und Bestandskunden können neue Customers werben und bekommen für 12 Monate eine konfigurierbare Provision (Default 20%) von der MRR. Tracking via Link mit `?ref=CODE` und/oder Code-Eingabe beim Signup. Auszahlung automatisch via Stripe-Connect.

## 2. Architektur

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Customer-Sicht (app.leadesk.de)                                             │
│ ├─ /signup?ref=ABC  → Cookie lk_aff=ABC (90d) + Pre-Fill Code-Feld         │
│ ├─ /signup mit Code-Feld → manueller Eintrag                                │
│ └─ /settings/affiliate → "Werde Affiliate" für Bestandskunden               │
└──────────────────────────┬─────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────┴─────────────────────────────────────────────────┐
│ Affiliate-Sicht (affiliate.leadesk.de — neuer Repo leadesk-affiliate)       │
│ ├─ Login (gleicher Supabase-Auth-Stack wie app.leadesk.de)                  │
│ ├─ Dashboard: Klicks · Conversions · Pending/Confirmed Earnings · Payouts   │
│ ├─ Marketing-Material-Downloads (Banner, UTM-Templates, Email-Snippets)     │
│ └─ Stripe-Connect-Onboarding (OAuth-Link in Settings)                       │
└──────────────────────────┬─────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────┴─────────────────────────────────────────────────┐
│ Admin-Sicht (admin.leadesk.de — Erweiterung)                                │
│ ├─ /affiliates: Liste + Approve/Reject + Provisions-Satz-Override pro Aff.  │
│ ├─ /affiliate-conversions: Anti-Fraud-Dashboard (Self-Referral, Spike-Det.) │
│ └─ /affiliate-payouts: Monthly-Payout-Trigger + Manual-Override             │
└──────────────────────────┬─────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────┴─────────────────────────────────────────────────┐
│ Backend (Supabase, Hetzner)                                                  │
│ Tabellen:                                                                    │
│   affiliates           — Affiliate-Profile + Code + Stripe-Connect-Account  │
│   affiliate_clicks     — Click-Tracking (Hash-IPs, kein PII)                │
│   affiliate_conversions — Customer-Signup-Attribution + Provisions-Status   │
│   affiliate_payouts    — Auszahlungs-Historie                               │
│ RPCs:                                                                        │
│   register_affiliate_click(code, ip_hash, ua_hash)                          │
│   attach_conversion_to_signup(user_id, code_from_cookie_or_field)           │
│   confirm_conversion(conversion_id)  — pg_cron 14d nach Payment             │
│   admin_set_affiliate_commission_rate(affiliate_id, rate_bps, reason)       │
│ Edge Functions:                                                              │
│   stripe-webhook (erweitert): invoice.payment_succeeded + charge.refunded   │
│   affiliate-stripe-connect-oauth                                             │
│   affiliate-payout-monthly (pg_cron-driven, Stripe-Transfer pro Affiliate)  │
└────────────────────────────────────────────────────────────────────────────┘
```

## 3. Decisions (D1–D7 mit User durch)

| D | Frage | Antwort |
|---|---|---|
| D1 | Provisions-Modell | Recurring 12 Monate ab erstem bezahltem Payment |
| D2 | Wer wird Affiliate | Beide — Bestandskunden + externe |
| D3 | Tracking-Mechanik | Beides — Link `?ref` + Code-Feld bei Signup |
| D4 | Auszahlung | Stripe-Connect automatisch |
| D5 | Provisions-Satz | Konfigurierbar pro Affiliate, Default 20% |
| D6 | Conversion-Trigger | Erstes bezahltes Payment nach Trial |
| D7 | Self-Referral | Hart blocken (Email + Stripe-Customer-Match) |

## 4. DB-Schema

```sql
-- 4.1 Affiliates: ein Affiliate = ein Profile + Code + Stripe-Connect-Account
CREATE TABLE public.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Bestandskunden: gleicher User wie app.leadesk.de Account.
    -- Externe: eigener auth.users-Row nur für affiliate.leadesk.de.
  code text NOT NULL UNIQUE,
    -- Auto-generiert (z.B. "leadesk-12abc") oder Custom-pickbar (Admin-Approve).
  status text NOT NULL DEFAULT 'pending',
    -- 'pending' = Admin muss approven (anti-spam)
    -- 'active' = freigegeben
    -- 'suspended' = temporär gesperrt (Fraud-Verdacht)
    -- 'closed' = beendet
  commission_rate_bps int NOT NULL DEFAULT 2000,
    -- 2000 = 20.00% (Default), Admin-override pro Affiliate via RPC
  commission_duration_months int NOT NULL DEFAULT 12,
  stripe_connect_account_id text,
    -- Stripe-Connect Account-ID (z.B. acct_xxxxx), null bis Onboarding done
  stripe_connect_charges_enabled bool DEFAULT false,
  stripe_connect_payouts_enabled bool DEFAULT false,
  total_clicks int DEFAULT 0,
  total_conversions int DEFAULT 0,
  total_earnings_cents bigint DEFAULT 0,
    -- Lebenslange Stats für Dashboard (Aggregat via Trigger oder periodischer Job)
  created_at timestamptz DEFAULT NOW(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_affiliates_code ON affiliates(code) WHERE status = 'active';
CREATE INDEX idx_affiliates_user ON affiliates(user_id);

-- 4.2 Clicks: Click-Tracking, kein PII
CREATE TABLE public.affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  code text NOT NULL,
  -- IP + UA werden gehasht gespeichert für Fraud-Detection ohne PII-Speicherung
  ip_hash text,
  ua_hash text,
  -- UTM-Querystrings vom Affiliate können weiter mitgenommen werden
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landed_at_url text,
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX idx_clicks_affiliate ON affiliate_clicks(affiliate_id, created_at DESC);

-- 4.3 Conversions: Attribution Customer → Affiliate
CREATE TABLE public.affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
    -- Der angeworbene Customer
  account_id uuid REFERENCES accounts(id),
    -- Sein Account (Multi-Account-Safe)
  code_used text NOT NULL,
    -- Welcher Code beim Signup verwendet wurde (Audit)
  signup_at timestamptz NOT NULL DEFAULT NOW(),
  first_paid_at timestamptz,
    -- Timestamp des ersten bezahlten Payments (Trigger für Provisions-Start)
  status text NOT NULL DEFAULT 'pending_payment',
    -- 'pending_payment' = Signup ohne Payment (Trial läuft, oder no-plan)
    -- 'pending_confirm' = First-Paid kam rein, 14d Refund-Window läuft
    -- 'confirmed' = Refund-Window vorbei, Provision auszahlbar
    -- 'refunded' = Customer refundet → Provision-Clawback
    -- 'rejected_self_referral' = Self-Referral-Check fehlgeschlagen
  commission_rate_bps_snapshot int NOT NULL,
    -- Snapshot des Provisions-Satzes bei Conversion (auch wenn affiliate später geändert)
  commission_end_at timestamptz,
    -- first_paid_at + 12 Monate (Provisions-Ende)
  -- Tracking-Helpers
  click_id uuid REFERENCES affiliate_clicks(id),
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX idx_conversions_affiliate ON affiliate_conversions(affiliate_id, status);
CREATE INDEX idx_conversions_user ON affiliate_conversions(user_id);
CREATE UNIQUE INDEX idx_conversions_user_unique ON affiliate_conversions(user_id);
  -- Ein Customer kann nur einmal einem Affiliate zugeordnet werden (First-Touch-or-Cookie)

-- 4.4 Provision-Events (eine Row pro Customer-Payment, das eine Provision generiert)
CREATE TABLE public.affiliate_commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id uuid NOT NULL REFERENCES affiliate_conversions(id),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id),
  stripe_invoice_id text NOT NULL UNIQUE,
    -- Idempotenz: pro Stripe-Invoice nur 1 Commission-Event
  payment_amount_cents bigint NOT NULL,
    -- Customer-Zahlung (z.B. 1900 = 19€)
  commission_amount_cents bigint NOT NULL,
    -- 20% von payment_amount = 380 Cents
  status text NOT NULL DEFAULT 'pending',
    -- 'pending' = noch nicht ausgezahlt
    -- 'paid' = via Stripe-Connect ausgezahlt
    -- 'clawed_back' = wegen Refund storniert
  paid_at timestamptz,
  payout_id uuid REFERENCES affiliate_payouts(id),
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX idx_commission_events_affiliate ON affiliate_commission_events(affiliate_id, status);

-- 4.5 Payouts: Stripe-Connect-Transfer-Historie
CREATE TABLE public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount_cents bigint NOT NULL,
  stripe_transfer_id text UNIQUE,
    -- Stripe-Connect-Transfer-ID (Idempotenz)
  status text NOT NULL DEFAULT 'pending',
    -- 'pending' = berechnet, noch nicht ausgezahlt
    -- 'paid' = Stripe-Transfer durch
    -- 'failed' = Stripe-Transfer-Fehler (z.B. Account-Restriction)
  failure_reason text,
  triggered_by uuid REFERENCES auth.users(id),
    -- null = pg_cron (automatisch), uuid = Admin (manuell)
  created_at timestamptz DEFAULT NOW(),
  paid_at timestamptz
);
```

## 5. Flows

### 5.1 Click → Cookie → Signup

1. Affiliate teilt Link `https://app.leadesk.de/signup?ref=leadesk-12abc&utm_source=youtube`
2. Customer klickt: 
   - Edge-Function `register-affiliate-click` läuft (oder client-seitiges Tracking-Script)
   - Schreibt `affiliate_clicks`-Row mit `ip_hash`, `ua_hash`, UTM-Params
   - Setzt `Set-Cookie: lk_aff=leadesk-12abc; Max-Age=7776000; SameSite=Lax` (90 Tage)
3. Customer navigiert zur Signup-Page:
   - URL-Parameter pre-fillt das Code-Feld
   - Alternativ: Cookie wird beim Submit gelesen wenn Feld leer
4. Signup geht durch normalen `handle_new_user`-Flow + RPC `attach_conversion_to_signup(user_id, code)`:
   - Findet `affiliate_id` aus code
   - Self-Referral-Check: `auth.users.email` matched mit `affiliates.user_id.email`? → reject
   - Wenn ok: `affiliate_conversions`-Row mit status='pending_payment', `commission_rate_bps_snapshot`

### 5.2 First-Paid-Payment → Conversion-Confirm

1. Stripe-Webhook `invoice.payment_succeeded` (Edge-Function `stripe-webhook` erweitern)
2. Finde Customer's `affiliate_conversions.user_id`-Row mit status='pending_payment'
3. Wenn vorhanden:
   - `first_paid_at = NOW()`, status='pending_confirm', `commission_end_at = NOW() + INTERVAL '12 months'`
4. Schreibe `affiliate_commission_events`-Row:
   - `commission_amount_cents = payment_amount * commission_rate_bps_snapshot / 10000`
5. pg_cron-Job (täglich): flippe `affiliate_conversions.status` von `pending_confirm` → `confirmed` wenn `first_paid_at < NOW() - INTERVAL '14 days'` UND keine Refunds.

### 5.3 Refund → Clawback

1. Stripe-Webhook `charge.refunded` 
2. Finde `affiliate_commission_events` mit `stripe_invoice_id` von refundeted charge
3. Status='clawed_back'
4. Falls payment_id schon ausgezahlt: Subtract vom nächsten Payout

### 5.4 Monthly Payout

1. pg_cron `0 9 1 * *` (1. jedes Monats 09:00 Berliner Zeit)
2. EF `affiliate-payout-monthly`:
   - Pro `affiliate` mit `stripe_connect_payouts_enabled=true`:
     - SUM `commission_amount_cents` aus `commission_events` WHERE status='pending' AND conversion.status='confirmed'
     - Wenn Sum >= 25€ (Min-Payout-Schwelle): Stripe-Transfer + Insert `affiliate_payouts`-Row
     - Sonst: skip (Provision sammelt sich zum nächsten Monat)
3. Bei Erfolg: Update `commission_events.status='paid'` + `payout_id`

## 6. Stripe-Connect-Integration

- **OAuth-Flow Affiliate-Seitig:** Affiliate klickt im Dashboard „Stripe-Konto verbinden" → Redirect zu Stripe-Connect-OAuth → Stripe-Callback an EF `affiliate-stripe-connect-oauth` → speichert `stripe_connect_account_id` + setzt `charges_enabled` + `payouts_enabled` per `accounts.retrieve`
- **Account-Status-Check:** Bei jedem Dashboard-Load: prüfe via Stripe-API ob `payouts_enabled=true`, sonst Banner „KYC noch nicht abgeschlossen"
- **Transfer-Methode:** `stripe.transfers.create({ amount, destination: account_id, currency: 'eur' })`
- **Stripe-Fees:** Bei Stripe-Connect-Standard-Account: Affiliate zahlt 0,25€ pro Payout + 0,25% — kommunizieren im Dashboard

## 7. Self-Referral-Detection

Beim Conversion-Create-Trigger:
- Lade `affiliate.user_id` + dessen `auth.users.email`
- Lade neuer Customer `user_id` + email
- Wenn `email` identisch (case-insensitive): status='rejected_self_referral', Audit-Log-Entry
- Plus: wenn `stripe_customer_id` vom Affiliate (als Customer auf Leadesk) === neuer Customer-`stripe_customer_id`: auch reject

## 8. Subdomain-Setup

- **DNS:** `affiliate.leadesk.de` → Vercel-Project `leadesk-affiliate`
- **Repo:** Neuer Repo `leadesk-affiliate` (Pattern wie `leadesk-admin`)
  - React + Vite + Inline-Styles + Supabase-JS
  - Eigener Auth-Storage-Key: `leadesk-affiliate-auth-token`
  - Zeigt auf Prod-Backend (gleiche Supabase-Instance wie app.leadesk.de + admin.leadesk.de)
- **Vercel-Project:** EU-Region `fra1`, Branch `main`

## 9. Phasen-Plan

| Phase | Was | Aufwand |
|---|---|---|
| 0 | Konzept committed (diese Doku → docs/architecture/affiliate-system.md), Pre-Flight | 0.5d |
| 1 | DB-Schema-Migration (5 Tabellen + RPCs + RLS), Staging+Prod | 1d |
| 2 | Tracking-Capture in app.leadesk.de: ?ref-Capture, Cookie, Signup-Code-Feld, Pre-Fill | 1d |
| 3 | Conversion-Trigger: stripe-webhook erweitert (invoice.payment_succeeded + charge.refunded) + Self-Referral-Check | 2d |
| 4 | affiliate.leadesk.de Standalone-Build: Repo + Login + Dashboard + Stats-RPCs | 3d |
| 5 | Stripe-Connect-OAuth-Flow + Account-Linking + Status-Check | 2d |
| 6 | Monthly-Payout-EF + pg_cron + Min-Payout-Schwelle 25€ | 1d |
| 7 | Admin-Surfaces auf admin.leadesk.de: /affiliates (Approve/Override) + /affiliate-conversions + /affiliate-payouts | 2d |
| 8 | Bestandskunden-Pfad: /settings/affiliate „Werde Affiliate"-Wizard | 1d |
| 9 | Marketing-Material-CMS: Banner-Storage-Bucket + Templates-Tabelle + Affiliate-Download-Surface | 1d |
| 10 | E-Mail-Flows (Welcome, Conversion-Notify, Monthly-Earnings, Payout-Confirm) via render-email + send-templated-email | 1d |
| 11 | Smoke + Customer-Mail-Announce (Affiliate-Programm-Launch an Bestandskunden) | 0.5d |

**Total: ~16 Arbeitstage.** Plus pragma — MVP-Cut-Möglichkeit: Phasen 0–7 (ohne Bestandskunden-Self-Onboarding, Marketing-Material und Mails) — ~12 Tage. Plus Phasen 8–10 als Follow-up-Sprint.

## 10. Open Decisions (für späteren Sprint)

- **D8 Code-Format:** Auto-generiert (z.B. `leadesk-12abc`) vs Custom-pickbar (Admin-Approve nötig wegen Brand-Conflict)? **Empfehlung:** Beides — Auto-Default, Custom via Admin-Approve-Workflow.
- **D9 Marketing-Material-Scope:** Banner-PNG/JPG, UTM-Templates, Email-Snippets, Social-Media-Caption-Library? **Empfehlung:** für MVP nur UTM-Templates + 3 statische Banner; rest später.
- **D10 Min-Payout-Schwelle:** 25€ vs 50€ vs konfigurierbar? **Empfehlung:** 25€ fix, schützt vor Mini-Payouts mit hohem Stripe-Fee-Anteil.
- **D11 Anti-Fraud-Spike-Detection:** Soll der Admin automatisch Alerts bekommen bei plötzlichem Click-/Conversion-Spike pro Affiliate? **Empfehlung:** ja, post-MVP — z.B. 10× Tages-Schnitt triggert Sentry-Alert.
- **D12 Refund-Window:** 14 Tage Pending vor Confirmed? Stripe's eigenes Refund-Window ist 60 Tage chargeback-fähig. **Empfehlung:** 14d für MVP (Industry-Standard), bei großen Refund-Quoten auf 30d erhöhen.
- **D13 Cookie-Window:** 90d vs 30d vs lifetime? **Empfehlung:** 90d ist Industry-Standard, balanciert Last-Touch-Faktor vs Customer-Wechsel-Wahrscheinlichkeit.

Siehe auch [[stripe_j3_cutover_complete]] (Stripe-Live-Account-Setup), [[marketplace_sprint_complete]] (Konzept-First-Pattern).
