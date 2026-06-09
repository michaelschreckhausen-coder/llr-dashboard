# Design-Doc: Instagram-Integration in Leadesk

**Status:** Entwurf — Machbarkeitsprüfung, Diskussionsgrundlage
**Autor:** Claude (im Dialog mit Michael)
**Datum:** 2026-05-20
**Reviewer:** Julian Wolf
**Ziel:** Klären, in welchem Umfang Instagram-Funktionen direkt gegen die offizielle Meta-API gebaut werden können — ohne Third-Party-Aggregator (Phyllo, LeadSync etc.) — und mit welchem Aufwand/Risiko.

---

## 1. Scope (aus Vorgespräch)

Drei Funktionsbereiche sollen abgedeckt werden:

1. **Instagram-Kontakte ins CRM importieren** — Quellen kombiniert: DMs, Kommentare, @-Mentions
2. **Leads aus Meta Ads importieren** — primär Facebook/Instagram Lead Ads (Lead-Gen-Form-Submits)
3. **Analyse-Daten vom Instagram-Profil** — Reichweite, Engagement, Demographics, Followers

Account-Scope aus dem Vorgespräch war „alle drei Account-Typen" (Business/Creator, Public Discovery, Personal). **Korrektur nach Recherche:** Personal Accounts sind seit dem endgültigen Shutdown der Instagram Basic Display API am **4. Dezember 2024** nicht mehr per offizieller API erreichbar. Wer Leadesk nutzen will, muss seinen IG-Account auf **Business oder Creator** umgestellt haben. Das ist kein Showstopper, aber muss in der UX kommuniziert werden.

**Architektur-Modus: Bring-Your-Own-App (BYOA).** Festgelegt 2026-05-20. Jeder Leadesk-Kunde legt seine **eigene Meta-App** im Meta Developer Dashboard an, durchläuft eigene Business Verification + App Review und übergibt App-ID + App-Secret an Leadesk. Konsequenz: Leadesk braucht **keine eigene Meta-App**, kein zentrales App Review, keine eigene Business Verification. Whitelabel ist automatisch gelöst (OAuth-Consent-Screen zeigt den Kundennamen). Tradeoff: höhere Onboarding-Friction pro Kunde (4–8 Wochen Lead-Time bis vollumfänglich nutzbar). Sektion 9 + 13 beschreiben das Onboarding im Detail.

**Login-Modi: beide parallel.** Festgelegt 2026-05-20. Wir unterstützen sowohl Facebook Login for Business (IG mit FB-Page) als auch Business Login for Instagram (IG ohne FB-Page). Lead-Ads-Feature wird nur bei FB-Login-Variante freigeschaltet, weil Lead Ads zwingend eine FB-Page brauchen. Login-Modus wird pro Connection in `pm_instagram_accounts.login_mode` gespeichert.

## 2. Meta-API-Landschaft (Stand Mai 2026)

Für Leadesk relevant sind vier API-Surfaces:

| Surface | Wofür | Login-Flow | Pflicht-FB-Page |
|---|---|---|---|
| **Instagram API with Facebook Login** | Vollumfänglich: Content, Comments, Insights, Messaging (via Messenger Platform), Lead Ads (via Marketing API) | Facebook Login for Business | **Ja** — IG-Account muss an FB-Page geknüpft sein |
| **Instagram API with Instagram Login** | Content, Comments, Messaging, Insights (begrenzt) — ohne FB-Page-Zwang | Business Login for Instagram | Nein |
| **Marketing API + `leadgen`-Webhook** | Lead-Ads-Form-Submits in Echtzeit empfangen | Facebook Login for Business | **Ja** — Lead Ads laufen über die FB-Page |
| **Business Discovery API** | Öffentliche Daten zu fremden Business-/Creator-Accounts (Username, Follower-Count, recent Media) | Über einen vom Kunden authentifizierten IG-Account | Indirekt (mind. ein authentifizierter Business-Account nötig) |

**Konsequenz für Leadesk:** Wir wollen beide Login-Flows unterstützen, weil Lead Ads zwingend Facebook Login + FB-Page brauchen, während Kunden, die nur Instagram nutzen und keine FB-Page anlegen wollen, über Instagram Login wenigstens den DM/Comment-Pfad nutzen können. Wir vergeben pro Kunde ein **Connection-Profil**, das den Login-Modus speichert und je nach Modus unterschiedliche Features in der UI freischaltet.

## 3. Permissions-Matrix

| Lead-/Analyse-Quelle | FB-Login-Flow | IG-Login-Flow | App Review |
|---|---|---|---|
| DMs lesen/senden | `instagram_basic` + `instagram_manage_messages` + `pages_*` | `instagram_business_basic` + `instagram_business_manage_messages` | Advanced Access nötig — Screencast pro Permission |
| Comments lesen/moderieren | `instagram_basic` + `instagram_manage_comments` + `pages_*` | `instagram_business_basic` + `instagram_business_manage_comments` | Advanced Access |
| @-Mentions | im `comments`-Webhook enthalten (FB) / separates `mentions`-Feld (IG-Login) | im `comments`-Webhook enthalten | Advanced Access |
| Account-Insights | `instagram_basic` + `instagram_manage_insights` + `pages_read_engagement` | `instagram_business_basic` + `instagram_business_manage_insights` | Advanced Access |
| Lead-Ads | `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `leads_retrieval`, `ads_management` | — (nicht verfügbar ohne FB-Page) | Advanced Access + Business Verification |
| Business Discovery (fremde Profile) | im Token des authentifizierten Accounts enthalten | im Token enthalten | Standard Access reicht für eigene Tests; Advanced für Produktion |

**„Human Agent"-Feature:** wenn DMs nach mehr als 24h beantwortet werden müssen, brauchen wir zusätzlich das `human_agent`-Tag (separates Review-Feature, kein Permission im klassischen Sinn). Bis 7 Tage nach letzter User-Message möglich.

## 4. Detailbild der drei Lead-Quellen

### 4.1 DMs als Lead-Quelle

**Mechanik:** Webhook-Feld `messages` (+ optional `message_reactions`, `message_echoes` für Outbound-Sync, `messaging_seen` für Read-Receipts). Meta liefert Notifications binnen 1–8 s nach Eingang.

**Payload-Felder relevant:**
- `sender.id` — Instagram-scoped User ID (stabil pro App + IG-Account-Paar)
- `recipient.id` — eigene IG-Account-ID
- `message.text` / `message.attachments`
- `timestamp` (UNIX, ms)
- `message.mid` — Message-ID für Dedup

**Was wir tun:**
1. Webhook-Receiver legt einen Lead in `leads` an (oder findet den existierenden über `instagram_scoped_user_id`).
2. Conversation wird in neue Tabelle `pm_instagram_conversations` + `pm_instagram_messages` gespiegelt.
3. Lead-Source = `'instagram-dm'`, mit Verlinkung auf die Conversation.

**Antwort-Pfad:** über die Send API. **Kritisches Window:** 24 h nach letzter Nachricht des Users freie Antwort, danach nur noch via `human_agent`-Tag (7d) — UI muss das Window prominent anzeigen, sonst läuft Customer in Policy-Verstöße.

**Rate Limits:** 2 calls/s Conversations, 100 calls/s Send (Text), 10 calls/s Send (Media), 200 DMs/h pro IG-Account (Meta-2026-Limit für automatisierte Sends).

### 4.2 Comments & Mentions als Lead-Quelle

**Mechanik:** Webhook-Feld `comments`. Account muss **public** sein, sonst keine Notifications. Im IG-Login-Flow sind Mentions im `comments`-Webhook enthalten; im FB-Login-Flow gibt es zusätzlich ein separates `mentions`-Feld.

**Payload-Felder:**
- `value.from.id` / `value.from.username`
- `value.text`
- `value.media.id`
- `value.id` (Comment-ID)

**Was wir tun:**
1. Comment-Webhook → Lead anlegen mit `source = 'instagram-comment'`, Verlinkung auf Post/Reel/Story.
2. Speichern in `pm_instagram_comments` mit FK auf Lead + auf Media-Object.
3. Optional: Auto-Reply / Private Reply (Comment → DM-Switch über die Private-Replies-API, 750 calls/h Limit).

**Limitation:** Comments auf **Live-Media** kommen nur während der Live-Broadcast-Phase. Album-IDs sind in der Notification nicht enthalten — müssen via Comment-ID nachgezogen werden.

### 4.3 Lead Ads (Marketing API)

**Mechanik:** `leadgen`-Webhook auf Page-Objekt. Liefert in Real-Time bei jedem Form-Submit.

**Payload-Felder:**
- `leadgen_id` — primary key für GET-Call zum Abruf der Form-Felder
- `form_id`, `page_id`, `ad_id`, `adgroup_id`
- `created_time`

**Was wir tun:**
1. Webhook empfangen → mit `leads_retrieval`-Permission via `GET /{leadgen_id}` die echten Form-Field-Values holen (Name, Email, Phone, Custom-Fields).
2. Lead in `leads` anlegen mit `source = 'meta-lead-ad'`, Verlinkung auf `pm_instagram_lead_ads_forms.form_id`.
3. Form-Field-Mapping pro Form vom Kunden konfigurierbar (welches Form-Feld → welches Leadesk-Lead-Feld).

**Voraussetzung:** Kunde muss FB-Page haben, Page muss unsere App abonniert haben, `leads_retrieval` + `ads_management` müssen approved sein.

**Fallback-Strategie:** Wenn Webhook ausfällt (Meta retried 36h, danach verloren) → periodischer Pull über `GET /{form_id}/leads` als Sicherungsnetz, einmal pro Stunde. Idempotent gegen `leadgen_id`.

## 5. Insights / Analytics

Was die Instagram-API **heute noch** liefert (relevante Deprecations 2025 berücksichtigt):

### 5.1 Account-Level-Metriken (`/{ig_user_id}/insights`)

**Interaction-Metriken (period: day):**
`views` (ersetzt `impressions` seit v22.0, April 2025), `reach`, `accounts_engaged`, `total_interactions`, `likes`, `comments`, `shares`, `saves`, `reposts`, `replies`, `profile_links_taps`, `follows_and_unfollows`.

**Demographic-Metriken (period: lifetime, timeframe-basiert):**
`follower_demographics` und `engaged_audience_demographics` mit Breakdowns nach `age`, `city`, `country`, `gender`.

**Harte Limits:**
- Demographic-Metriken nur bei **≥ 100 Followern**, sonst leere Response.
- `online_followers` nur für letzte 30 Tage.
- Datenverzögerung bis zu **48 h** — Dashboard muss das kommunizieren.

### 5.2 Media-Level-Metriken (`/{media_id}/insights`)

Pro Post/Reel/Story einzeln: Engagement-Counts, Reach, Profile-Visits-from-Media, Story-Replies. Wird beim Backfill und beim Webhook auf neue Posts erhoben.

### 5.3 Business Discovery (fremde Accounts)

Begrenzt auf öffentliche Felder von **Business/Creator-Accounts**: `username`, `followers_count`, `follows_count`, `media_count`, `biography`, `name`, `profile_picture_url`, `media{}` (recent Media inkl. caption/timestamp/like_count/comments_count). Kein Engagement-Detail, keine Story-Daten.

**Wofür nutzbar:** Wettbewerber-Übersicht, Influencer-Sourcing, Top-of-Funnel-Insights. **Nicht für Personal Accounts.**

### 5.4 Was nicht (mehr) geht

Folgende Metriken sind ab März 2025 (Graph API v22.0) deprecated und liefern entweder Fehler oder werden ignoriert:
- `impressions` (alle Surfaces — durch `views` ersetzt)
- `reel_plays`, `reel_replays`, `reel_initial_plays`
- `story_impressions`, `carousel_album_impressions`, `profile_impressions`
- `video_views` (für Nicht-Reels-Content)
- `email_contacts` (time series), `website_clicks`, `phone_call_clicks`, `text_message_clicks`

Wir müssen unser Reporting **ausschließlich auf die neuen Metric-Namen** stützen.

## 6. App Review + Business Verification — Wer macht was

**Im BYOA-Modell macht Leadesk weder Business Verification noch App Review.** Beides liegt beim Kunden. Unsere Verantwortung ist:

1. **Wizard-UX** mit Schritt-für-Schritt-Anleitung durch beide Prozesse (siehe Sektion 13)
2. **Use-Case-Vorlagen** für jede Permission (Text-Bausteine, die der Kunde bei seinem App Review einreichen kann)
3. **Screencast-Anleitung** mit konkreten Klick-Pfaden in Leadesk, die der Kunde abfilmen kann
4. **Test-Endpoints**, die der Meta-Reviewer in der Kunden-Leadesk-Instanz nutzen kann (Test-Lead anlegen, Test-DM senden)

**Was der Kunde durchlaufen muss:**

Business Verification:
- Gewerbeanmeldung / Handelsregister-Auszug (DE) bzw. Equivalent
- Steuer-ID (DE: USt-IdNr.) bzw. EIN/VAT/ABN
- Proof of Business Address (Rechnung, Bank-Statement)
- Domain-Ownership-TXT-Record auf der eigenen Domain
- Authorisierte Person für Ad-Management

App Review:
- Pro Permission separates Screencast (Use-Case-Demo in Leadesk)
- Test-User-Credentials für den Reviewer
- Schriftliche Use-Case-Beschreibung pro Permission

**Timeline pro Kunde:** Business Verification 5–15 Werktage + App Review 5–15 Werktage pro Permission-Submission, in der Praxis 2–3 Review-Runden bei `instagram_manage_messages`. Realistisch **4–8 Wochen vom Kunden-Onboarding-Start bis zur produktiven Nutzung aller Features**.

**Während dieser Wartezeit** kann Leadesk dem Kunden bereits eingeschränkten Standard-Access bieten — der Kunde kann die Verbindung mit seiner eigenen IG-Account-ID (die er als App-Admin selbst-autorisieren kann) testen, ohne dass Advanced Access nötig ist. Das ist die „Sandbox-Phase" im Onboarding.

## 7. Auth + Token-Lifecycle

```
User klickt "Instagram verbinden" in Leadesk
    ↓
Meta OAuth-Dialog (Login + Permission-Consent)
    ↓
Redirect zu uns mit ?code=...    (Code lebt 1 h)
    ↓
Edge Function tauscht Code → Short-Lived Access Token (1 h)
    ↓
Server-side Exchange → Long-Lived Token (60 d)
    ↓
Speichern (encrypted) in pm_instagram_accounts
    ↓
Cron-Refresh alle 30 d (Long-Lived lässt sich nach >24 h Alter refreshen)
```

**Hard Constraints:**
- Long-Lived-Token-Exchange braucht `app_secret` → ausschließlich server-side, niemals Frontend
- Token, die **60 d nicht refreshed** wurden, sind permanent tot — User muss neu authentifizieren
- Best-Practice: Refresh-Job alle **30–45 d** (Sicherheits-Puffer)

**Storage:** Token gehören verschlüsselt in die DB. Vorschlag: separate Spalte `access_token_encrypted` mit Postgres `pgcrypto`-Symmetric-Encryption (Key in Edge-Function-ENV). Alternativ: Vault. Für Phase 1 reicht pgcrypto, falls Compliance es zulässt.

## 8. Architektur-Vorschlag für Leadesk

### 8.1 Modul-Position

Instagram wird als neues **Plan-Modul** hinzugefügt (zur bestehenden 6er-Liste aus `docs/PLAN_MODULES_ROLLOUT.md`):

| Sidebar-Divider | Modul-Key |
|---|---|
| ~~LinkedIn~~ → Social | `linkedin`, neu auch `instagram` |

Alternative: eigener Sidebar-Block „Instagram" zwischen LinkedIn und Content. Entscheidung in eigener UX-Session.

### 8.2 DB-Schema (additiv)

```sql
-- 1 Account ↔ 1 Connection (Multi-IG pro Account erst v2, vorerst Unique-Index pro Account)
-- BYOA-Modell: jeder Account bringt seine eigene Meta-App-Credentials mit.
CREATE TABLE pm_instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  -- BYOA: Customer-eigene Meta-App-Credentials
  meta_app_id text NOT NULL,                  -- Customer-eigene Meta-App-ID
  meta_app_secret_encrypted bytea NOT NULL,   -- via pgcrypto verschlüsselt
  webhook_verify_token text NOT NULL,         -- random pro Connection, vom Kunden in seiner Meta-App eingetragen
  -- IG-API
  ig_account_id text NOT NULL,                -- Instagram Professional Account ID
  ig_username text NOT NULL,
  login_mode text NOT NULL CHECK (login_mode IN ('facebook','instagram')),
  fb_page_id text,                            -- nur bei login_mode='facebook'
  fb_page_access_token_encrypted bytea,       -- nur bei login_mode='facebook'
  ig_access_token_encrypted bytea NOT NULL,
  token_expires_at timestamptz NOT NULL,
  token_last_refreshed_at timestamptz,
  -- Permissions die der User tatsächlich gewährt hat (Subset des Possible)
  granted_permissions text[] NOT NULL DEFAULT '{}',
  -- Webhook-Subscription-State
  subscribed_fields text[] NOT NULL DEFAULT '{}',
  webhook_verified_at timestamptz,
  -- Onboarding-State (Wizard-Tracking, siehe Sektion 13)
  onboarding_step text NOT NULL DEFAULT 'meta_app_created'
    CHECK (onboarding_step IN ('meta_app_created','redirect_configured','webhook_configured','oauth_completed','business_verification_pending','app_review_pending','live')),
  business_verification_status text,          -- 'pending','approved','rejected'
  app_review_status jsonb DEFAULT '{}',       -- {permission: 'pending'/'approved'/'rejected'}
  -- Meta
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Constraints
  UNIQUE (account_id),                        -- Phase 1: 1 IG ↔ 1 Account
  UNIQUE (ig_account_id),                     -- ein IG-Account nicht doppelt verbinden
  UNIQUE (meta_app_id, ig_account_id)         -- Sanity
);

CREATE TABLE pm_instagram_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id text NOT NULL,                -- FK über pm_instagram_accounts.ig_account_id
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ig_thread_id text NOT NULL,                 -- conversation-id von Meta
  participant_scoped_id text NOT NULL,        -- Instagram-scoped User ID
  participant_username text,
  lead_id uuid REFERENCES leads(id),          -- nullable falls noch nicht gemapt
  last_inbound_at timestamptz,                -- für 24h-Window-Tracking
  last_outbound_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ig_account_id, ig_thread_id)
);

CREATE TABLE pm_instagram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES pm_instagram_conversations(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ig_message_id text NOT NULL,                -- für Dedup
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  text text,
  attachments jsonb DEFAULT '[]',
  sent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, ig_message_id)
);

CREATE TABLE pm_instagram_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id text NOT NULL,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id),
  ig_comment_id text NOT NULL UNIQUE,
  ig_media_id text NOT NULL,
  parent_comment_id text,
  from_username text,
  from_scoped_id text,
  text text,
  is_mention boolean NOT NULL DEFAULT false,
  posted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pm_meta_lead_ads_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  form_id text NOT NULL,
  form_name text,
  field_mapping jsonb NOT NULL DEFAULT '{}',  -- {meta_field: leadesk_field}
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, form_id)
);

CREATE TABLE pm_instagram_insights_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id text NOT NULL,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  metric text NOT NULL,
  period text NOT NULL,                       -- day/week/lifetime
  breakdown jsonb,                            -- z.B. {follow_type: 'FOLLOWER'}
  value bigint,
  measured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Multi-Tenant-Korrektheit:** `team_id` ist Pflicht auf jeder Tabelle (siehe CLAUDE.md Top-Fallstrick „bei jedem Insert team_id mitgeben"). RLS-Policies analog zu `pm_projects`-Pattern (team-scoped). Bei Webhook-Inserts läuft Edge Function als `service_role` (RLS bypass), aber explizit `GRANT SELECT/INSERT/UPDATE TO service_role` auf jede neue Tabelle (Top-Fallstrick #12).

**Erweiterung am `leads`-Schema:**

```sql
ALTER TABLE leads
  ADD COLUMN instagram_username text,
  ADD COLUMN instagram_scoped_id text,        -- für Cross-Lookup
  ADD COLUMN meta_lead_ad_form_id text;       -- für Lead-Ads-Provenance

CREATE INDEX leads_instagram_scoped_id_idx ON leads(instagram_scoped_id)
  WHERE instagram_scoped_id IS NOT NULL;

-- Source-Whitelist erweitern, falls als CHECK-Constraint existiert
-- (im Repo nicht eindeutig — beim Apply prüfen)
```

### 8.3 Edge Functions

| Funktion | Trigger | Aufgabe |
|---|---|---|
| `instagram-oauth-callback` | HTTP (Redirect) | Code → Short-Lived → Long-Lived Token tauschen, in DB schreiben, Webhook-Subscription aktivieren |
| `instagram-webhook-receiver` | HTTP (Meta) | Verify (GET) + Event (POST). SHA256-Signatur via `X-Hub-Signature-256` validieren. Payload in DB schreiben, Lead-Erzeugung/Update triggern |
| `instagram-token-refresh` | Cron (alle 24 h) | Long-Lived-Tokens älter als 30 d refreshen |
| `instagram-leadgen-poller` | Cron (stündlich) | Fallback-Pull für Lead-Ads-Forms, idempotent gegen `leadgen_id` |
| `instagram-insights-collector` | Cron (täglich) | Account- und Media-Insights für alle aktiven Accounts pullen, in `pm_instagram_insights_snapshots` schreiben |
| `instagram-send-message` | RPC-Call vom Frontend | Outbound-DM via Send API. 24h-Window-Check + automatische `human_agent`-Tag-Logik |

### 8.4 Webhook-Endpoint

Eine einzige öffentliche URL — Meta erlaubt nur **einen Callback pro App** pro Object-Type:

```
https://supabase-prod.leadesk.de/functions/v1/instagram-webhook-receiver
```

Dispatcht intern nach `entry[].field` auf interne Handler:
- `messages` → MessageHandler
- `comments` (inkl. mentions) → CommentHandler
- `story_insights` → InsightHandler
- (Page-Webhook für Lead-Ads: separater Callback unter `meta-leadgen-webhook` — getrennte App-Subscription für `leadgen`-Field auf Page-Object)

**Pflicht-Validierung:** SHA256-HMAC mit App-Secret prüfen (`X-Hub-Signature-256`), sonst Reject. Sample-Code in der Meta-Doku.

### 8.5 mTLS für Webhooks (optional, aber empfohlen)

Meta unterstützt mTLS für Webhook-Delivery — wir verifizieren Meta serverseitig anhand des Client-Zertifikats (`client.webhooks.fbclientcerts.com`, signiert von Meta-CA). Bei uns auf Hetzner via Caddy konfigurierbar. Erhöht Sicherheitsniveau, ist aber nicht zwingend für Funktion — Phase-2-Härtung.

## 9. BYOA-Architektur — Multi-App-aware Backend

Im BYOA-Modell läuft auf der Leadesk-Seite **eine einzige Codebase**, die mit **N verschiedenen Meta-Apps** parallel spricht — eine pro Kunden-Connection. Architektonisch bedeutet das:

### 9.1 Multi-App-Lookup pro Request

Jeder OAuth-Callback und jedes Webhook-Event muss zur korrekten Customer-Connection auflösen, **bevor** wir das Secret zum Validieren laden können. Zwei Pfade:

**OAuth-Callback:**
```
GET /instagram-oauth-callback?code=<...>&state=<connection_id>
```
Wir generieren beim Wizard-Start ein `state`-Token (UUID), das Connection-ID und CSRF-Schutz in einem ist. Im Callback lookupen wir die Connection, holen `meta_app_secret_encrypted`, entschlüsseln, tauschen Code → Long-Lived-Token.

**Webhook-Receiver:**
```
POST /instagram-webhook-receiver/<connection_id>
```
URL-Segment `<connection_id>` ist Teil des Pfades, den der Kunde in seiner Meta-App als Callback-URL einträgt. Wir lookupen die Connection, holen das `meta_app_secret_encrypted`, validieren damit das `X-Hub-Signature-256`-Header der Notification, **dann** erst verarbeiten. Ungültige Signaturen → 401 + Audit-Log.

### 9.2 Webhook-Verify-Token pro Connection

Meta-Webhook-Subscriptions verlangen einen statischen `verify_token`-String, der beim Subscribe in der Meta-App eingetragen wird. Wir generieren beim Connection-Erstellen ein zufälliges 32-Byte-Token, zeigen es im Wizard an, der Kunde fügt es in seiner Meta-App-Webhook-Config ein. Beim Verify-Handshake matcht unser Endpoint das Token aus der DB.

### 9.3 Whitelabel ist „gratis"

Weil jeder Kunde seine eigene Meta-App betreibt, sieht der OAuth-Consent-Screen **automatisch** den Kundennamen. Keine spezielle Leadesk-Branding-Konfiguration nötig.

### 9.4 Was Leadesk operationell nicht mehr macht

- Keine eigene Meta-App registrieren
- Keine Business Verification durchlaufen
- Kein App Review einreichen
- Keine Domain-Verification auf `leadesk.de` für Meta
- Keine Datenschutzerklärung mit Meta-spezifischen Datenflüssen (Kunde haftet selbst, Leadesk ist Auftragsverarbeiter)

**Was Leadesk dafür liefern muss:** den Customer-Onboarding-Wizard (Sektion 13) und die Use-Case-Vorlagen + Screencast-Anleitungen für App Review (Sektion 6).

### 9.5 Sicherheits-Note

Das `meta_app_secret` ist eine hochsensible Customer-Secret-Daten. Speichern: pgcrypto-Symmetric-Encryption mit Master-Key aus Edge-Function-ENV. Niemals im Klartext, nie in Logs, nie im Frontend. Bei Audit-Trail nur `meta_app_id` (öffentlich) erwähnen, nie das Secret.

## 10. DSGVO + Datenschutz

DM-Inhalte ins CRM zu speichern ist **personenbezogene Datenverarbeitung Dritter** (= der User, die dem IG-Kunden geschrieben haben). Drei Pflichten:

1. **Rechtsgrundlage:** Auftragsverarbeitung gegenüber dem IG-Account-Owner (= Leadesk-Kunde). AVV ist im bestehenden Leadesk-MSA bereits abgedeckt — gegenchecken mit Legal.
2. **Aufklärung:** IG-Account-Owner muss seinen Endusern transparent machen, dass DMs in einem CRM landen. Privacy-Policy-Erweiterung im Onboarding mitliefern (Template).
3. **Recht auf Löschung:** Endusers können über den Kunden eine Löschung verlangen → Operation muss `pm_instagram_messages` + `pm_instagram_comments` gezielt per `participant_scoped_id` durchsuchen können. Index liegt vor.

**Audit-Trail:** alle Lead-Erzeugungen aus IG-Quellen sollen das bestehende `admin_audit_log`-Pattern (Phase 1.3) konsumieren. `source = 'instagram-dm/comment/lead-ad'` als Audit-Reason.

## 11. Risiken & Open Questions

| # | Risiko | Mitigation / Open Question |
|---|---|---|
| 1 | App Review für `instagram_manage_messages` ist historisch zickig (Privacy-sensible Daten) | Pro Permission separater Submission, mit klarem CRM-Use-Case und „Unsend"-Logik in Screencast. Frühzeitig anfangen. |
| 2 | Token-Expiry-Stille — wenn Refresh-Cron Fehler frisst, läuft Kunde 60d stumm und merkt es nicht | Refresh-Failure → `admin_audit_log`-Eintrag + Toast/Email an Kunden. Token-Health-Widget im Settings-Tab. |
| 3 | 24h-Messaging-Window — Kunde antwortet zu spät, Meta blockt Send → schlechte UX | UI muss verbleibendes Window prominent anzeigen + bei <2h Warnung. `human_agent`-Tag als Fallback automatisch nur mit Audit-Eintrag (sonst Policy-Risiko). |
| 4 | Lead Ads brechen, wenn Kunde FB-Page wechselt oder App-Verknüpfung entfernt | Page-Subscription-Status täglich pollen, bei Drop → Alarmierung. |
| 5 | Webhook-Verlust nach 36h Retry → Lead verloren | `instagram-leadgen-poller` als Fallback, idempotent. Für DMs ggf. zusätzlicher `GET /me/conversations`-Backfill nach Webhook-Reconnect. |
| 6 | Whitelabel ↔ App-Review-Namensbindung | Erste Iteration: Single-App-Modell. Klärung pro Enterprise-Kunde individuell. |
| 7 | Personal Accounts gehen API-seitig nicht — Erwartungs-Management | Onboarding-Check: „Hast du einen Business- oder Creator-Account?" → wenn nein, klare Anleitung zur Umstellung (innerhalb IG-App, kostenlos). |
| 8 | Account-Token-Storage encrypted: pgcrypto vs Vault | Phase 1: pgcrypto in Hetzner-DB (Key in Edge-Function-ENV). Phase 2 nach Bewertung: Vault, falls SOC-2-Vorbereitung das verlangt. |
| 9 | Insights-Daten-Verzögerung bis 48h — Reporting wirkt langsam | UI muss "Daten vom <Datum>" anzeigen, nicht "Live". Kunden-Erwartung managen. |
| 10 | Multi-IG-Account pro Leadesk-Account (z.B. Agentur mit 10 Kundenprofilen) | Aktuell `UNIQUE (ig_account_id)` global. Erst Phase 2: pro Account multiple Accounts erlauben. |

## 12. Phasenplan

| Phase | Inhalt | Aufwand | Lead-Time-Constraint |
|---|---|---|---|
| **Phase 0** | Meta Developer App erstellen, Business Verification einreichen, Datenschutz-Texte ergänzen | ~3 PT Coding + 2–4 Wochen Wartezeit | Verification-Wartezeit blockt App Review |
| **Phase 1** | OAuth + Token-Storage + Webhook-Endpoint Skeleton + Refresh-Cron | ~8 PT | — |
| **Phase 2** | `messages`-Webhook + DM-Inbox-UI + Lead-Mapping + 24h-Window-Logic | ~10 PT | — |
| **Phase 3** | `comments` + `mentions` + Auto-Lead-Erzeugung | ~5 PT | — |
| **Phase 4** | Lead Ads (FB-Page-Subscription + `leadgen`-Webhook + Form-Field-Mapping-UI) | ~7 PT | Lead Ads = nur FB-Login-Flow |
| **Phase 5** | Insights-Collector + Dashboard (Account + Media-Level) | ~8 PT | — |
| **Phase 6** | Meta App Review für alle Permissions | ~3 PT pro Permission Screencast + Wartezeit | 4–8 Wochen Total |
| **Phase 7** | Business Discovery (fremde Profile) als Bonus-Feature | ~3 PT | — |

**Summe Engineering:** ca. 50 PT Coding + 6–10 Wochen sequenzielle Review-Lead-Time. Bei paralleler Bearbeitung von Phase 0 (Business Verification) und Phase 1+2 sollten ca. **8–10 Wochen Gesamtdauer** realistisch sein bis erstes Customer-Onboarding möglich ist.

## 13. Customer-Onboarding-Wizard (BYOA-Pfad)

Der Wizard begleitet den Kunden durch alle Schritte, die er bei Meta selbst erledigen muss, und sammelt am Ende seine App-Credentials. Implementierung als Multi-Step-Form in Leadesk Settings → „Instagram verbinden".

### 13.1 Step-by-Step

| # | Wizard-Step | Was sieht der Kunde | Was passiert technisch |
|---|---|---|---|
| 1 | Voraussetzungs-Check | „Hast du einen IG-Business- oder Creator-Account?" + Anleitung zur Umstellung falls nein | Keine API-Aktion, nur UI-Confirm |
| 2 | Meta Business Manager anlegen | Link zu `business.facebook.com` + Anleitung | Connection-Row mit `onboarding_step='meta_app_created'` anlegen, generiere `state`-UUID + `webhook_verify_token` |
| 3 | Meta-App erstellen | Schritt-für-Schritt-Screencast mit Klick-Pfaden im Meta Developer Dashboard | — |
| 4 | Redirect-URI + Webhook-URL eintragen | Wir zeigen die spezifischen URLs für **diese Connection** an, der Kunde kopiert sie in seine Meta-App-Config | `redirect_uri = https://supabase-prod.leadesk.de/functions/v1/instagram-oauth-callback`, `webhook_url = https://supabase-prod.leadesk.de/functions/v1/instagram-webhook-receiver/{connection_id}`, `verify_token = {webhook_verify_token}` |
| 5 | App-ID + App-Secret eingeben | Zwei Input-Felder + Help-Text wo der Kunde das in seinem Dashboard findet | Wir speichern `meta_app_id` im Klartext, `meta_app_secret_encrypted` via pgcrypto. `onboarding_step='redirect_configured'` |
| 6 | Permissions wählen | Multi-Select: DMs / Comments / Mentions / Lead Ads / Insights | Speichert die geplante Permission-Liste in `granted_permissions` (initial empty, wird bei OAuth befüllt) |
| 7 | OAuth-Connect | Button „Mit Instagram verbinden" → Redirect zu Meta-OAuth-Dialog der **Kunden-App** | Meta zeigt Customer-App-Name im Consent. Bei Erfolg: Callback mit `code` → Token-Exchange → in DB. `onboarding_step='oauth_completed'` |
| 8 | Webhook-Subscribe | Automatischer `POST /me/subscribed_apps?subscribed_fields=...` mit dem frischen Token | `subscribed_fields` befüllt, `webhook_verified_at` gesetzt |
| 9 | Business Verification anstoßen | Anleitung + Dokumenten-Checkliste für die eigene Submission im Meta Dashboard | `onboarding_step='business_verification_pending'` |
| 10 | App Review pro Permission | Pro Permission ein Modal mit Use-Case-Text-Vorlage + Screencast-Anleitung | `app_review_status` jsonb wird pro Permission gepflegt |
| 11 | „Live"-Switch | Kunde markiert seine App in Meta als „Live" | `onboarding_step='live'`, alle Features in Leadesk-UI freigeschaltet |

### 13.2 Sandbox-Phase

Schritte 1–8 reichen für **Standard Access auf den eigenen Account** (Owner kann seine eigene Daten lesen, ohne Advanced Access). Damit kann der Kunde Leadesk **sofort produktiv für seinen eigenen IG-Account nutzen**, während Schritt 9–11 (Verification + Review) im Hintergrund laufen. Wichtige Friction-Reduktion.

Limitation: ohne Advanced Access kann der Kunde keine **dritten** IG-Accounts anbinden (z.B. Agentur-Use-Case mit Kunden-Accounts). Phase 1 = nur eigener Account → daher mit Standard Access sofort lauffähig.

### 13.3 Was Leadesk bereitstellen muss

1. **Markdown-Templates** für die App-Review-Submissions pro Permission, in `docs/customer-templates/meta-app-review/{permission}.md`
2. **Screencast-Anleitungen** (1 Loom pro Permission, oder eingebettete Video-Tour im Wizard)
3. **Support-Ticket-Workflow** für Kunden, die im App Review scheitern (Use-Case-Refinement)
4. **Status-Widget im Customer-Dashboard:** Onboarding-Progress + verbleibende Schritte

Die Templates + Screencasts können iterativ entstehen — Wizard kann mit Platzhalter-Links live gehen, sobald Schritt 1–8 funktionieren.

## 14. Entscheidungsstand + Restoffene Punkte

**Entschieden (2026-05-20):**

| Frage | Entscheidung |
|---|---|
| App-Modell | **BYOA** (jeder Kunde eigene Meta-App) |
| Login-Modi | **Beide parallel** (Facebook Login + Instagram Login) |
| Multi-IG pro Account | **1:1 in Phase 1**, N:1 als Phase-2-Erweiterung (additiv migrierbar) |
| Token-Storage | **pgcrypto** in Postgres, später ggf. Vault |

**Noch offen (kann nach Phase-1-Code-Start parallel geklärt werden):**

1. **Plan-Modul-Granularität:** Ein gemeinsames `instagram`-Modul, oder feinkörnig (`instagram-dm`, `instagram-comments`, `meta-lead-ads`, `instagram-insights`)? Empfehlung: ein Modul `instagram`, weil die einzelnen Sub-Features für den Customer-Wert nur in Summe Sinn machen.
2. **Sidebar-Platzierung:** Eigener Block „Instagram" neben „LinkedIn" oder gemeinsamer „Social"-Block? UX-Entscheidung, blockt keinen Code.
3. **Support-Modell für scheiternde App Reviews:** Wie viel Hand-Holding bietet Leadesk an? Affects pricing/SLA, nicht den Code.
4. **DSGVO-Texte:** Wer verfasst die Auftragsverarbeitung-Klauseln für Customer-AVV-Erweiterung? Legal, nicht Engineering.
5. **mTLS für Webhooks:** Phase 2 oder Phase 1? Empfehlung Phase 2 (zusätzliche Härtung, nicht funktional kritisch).

Die offenen Punkte 1–5 blocken Phase-1-Engineering **nicht**. Migration + Edge Functions + Wizard können direkt starten.

---

## Quellen

- [Overview - Instagram Platform - Meta for Developers](https://developers.facebook.com/docs/instagram-platform/overview/)
- [Webhooks - Instagram Platform - Meta for Developers](https://developers.facebook.com/docs/instagram-platform/webhooks/)
- [Instagram Account Insights API Reference](https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights/)
- [Refresh Access Token - Instagram Platform](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token/)
- [App Review - Instagram Platform](https://developers.facebook.com/docs/instagram-platform/app-review/)
- [Lead Ads - Marketing API](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/)
- [Webhooks for Leadgen - Meta Developer Documentation](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/)
- [Business Discovery - Instagram Platform](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery/)
- [Instagram API Changes in 2026 / Basic Display API Deprecation](https://storrito.com/resources/instagram-api-2026/)
- [Instagram Messaging API 24-Hour Window Policy 2026](https://www.keyapi.ai/blog/instagram-messaging-api-policy)
