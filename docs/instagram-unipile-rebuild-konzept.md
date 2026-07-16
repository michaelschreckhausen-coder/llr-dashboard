# Instagram-Modul – Neuaufbau auf Unipile (Konzept)

> Stand: 2026-07-10 · Autor: Analyse für Michael
> Referenz: https://developer.unipile.com/docs/getting-started · Feature-Matrix `list-provider-features` · `provider-limits-and-restrictions`

## 0. Kernaussage (TL;DR)

Das **heutige** Instagram-Modul und die **Unipile-Instagram-API** sind zwei grundverschiedene Dinge:

| | Heutiges Modul (Growth Suite / Meta Graph) | Unipile-Instagram |
|---|---|---|
| Charakter | **Analytics + Publishing** | **Messaging + Outreach** (session-basiert) |
| Auth | Connect-Link zum Partner-Tenant | IG-Username/Passwort + 2FA-Checkpoint (wie Session-Login) |
| Kann | Follower/Reichweite/Demografie, Post-Insights, Beitrag veröffentlichen, eingehende DM-Leads | DMs senden/lesen, Chats, Profile, Follow, Kommentare/Reaktionen, Posts lesen/erstellen, Kontakte/Relations |
| Kann **nicht** | Outreach, DM-Automation, Follow, Kommentieren | **Insights/Demografie** (Follower-Zahlen, Reichweite, Saves – das ist Meta Graph API) |

**Folge:** Wenn wir das Modul auf Unipile neu bauen, wird aus einem **Content-/Analytics-Modul** ein **Sales-/Communication-/Outreach-Modul** – exakt gespiegelt zu eurer bestehenden LinkedIn-Unipile-Automation (`la_*`, `unipile-*` Edge Functions, `automation_jobs`). Das ist die eigentliche strategische Entscheidung dieses Rebuilds, nicht die Technik – die Technik ist zu 80 % schon da.

**Wichtigste Konsequenz zum bewusst Entscheiden:** Unipile liefert für Instagram **keine Insights/Demografie**. Der heutige Analytics-Dashboard (Follower-Entwicklung, Zielgruppen-Demografie, Post-Reichweite/Saves) lässt sich mit Unipile **nicht** nachbauen. → Siehe §5 „Hybrid vs. Full-Unipile".

---

## 1. Bestandsaufnahme – was beim „gedanklichen Löschen" wegfällt

Das aktuelle Modul (`slug='instagram'`, Add-on, `activates_modules={instagram}`) besteht aus:

- **Frontend:** `src/pages/Instagram.jsx` (Analytics-Dashboard), `src/pages/SettingsInstagram.jsx` (Connect-Flow), `src/lib/instagram.js` (Proxy-Helper)
- **Backend:** `instagram-proxy` (Master-Key-Proxy zur Growth Suite), `instagram-publish-post`
- **Schema:** `instagram_connections` (Team ↔ `ig_account_id`), Scheduled-Publish-Dispatch (`20260701110000`)
- **Feature-Set:** Connect-Link · Insights (Follower/Follows/Media-Count/Reach) · Demografie (Alter/Geschlecht/Land/Stadt) · Post-Insights (Likes/Kommentare/Saves/Reach) · Publish aus Redaktionsplan · eingehende DM-Leads

Beim Rebuild auf Unipile **entfällt** funktional: die gesamte **Insights-/Demografie-Ebene** (kein Graph-API-Zugang mehr). **Erhalten/ersetzbar** über Unipile: Connect (anders), Publish (via Unipile `create post`), DM-Leads (jetzt vollwertige Inbox statt nur „Leads").

Was **neu dazukommt** (heute gar nicht vorhanden): DM-Inbox mit Verlauf, DM-Outreach-Sequenzen, Follow-Automation, Kommentar-/Like-Engagement, Profil-Enrichment, Kontakt-Import.

---

## 2. Was Unipile für Instagram kann (vollständige Matrix)

Aus der offiziellen Feature-Liste, IG-Spalte:

**Messaging (alle 🟢)**
- Account-Connection: Hosted Auth **und** Custom Auth (Username/Passwort → 2FA-Checkpoint, 5-Min-Intent)
- Nachrichten senden / beantworten (DMs)
- Chats auflisten, Nachrichten auflisten, Attendees auflisten, History synchronisieren
- Reaktionen auflisten, Lesebestätigungen (read receipts)
- Anhänge: Dateien senden **und** empfangen, **Sprachnachrichten senden**
- *(Nicht für IG: „embed video" – nur WhatsApp/LinkedIn)*

**Profile**
- Fremdprofile abrufen (Visit & Retrieve) → liefert `provider_id`
- Eigenes Profil abrufen
- **Kontakte/Relations auflisten** (Follower/Following als „relations")

**Social Actions**
- **Following someone** (jemandem folgen)
- Posts von Usern auflisten, Post abrufen, **Post erstellen**
- Reaktion auf Post/Kommentar hinzufügen (Like)
- Kommentar senden, Post-Kommentare auflisten, Post-Reaktionen auflisten

**Suche (🟠 = eingeschränkt)**
- People-Suche (partial), Post-Suche (partial)

**Inbox**
- Classic (Senden + Empfangen in Echtzeit)

**Webhooks (🟢)**
- Account-Status, neue Nachricht, neue Reaktion/gelesen/Event

**Was Unipile für IG NICHT kann** (relevant für Erwartungsmanagement):
- **Keine Insights/Demografie/Reichweite** (Meta Graph API, nicht Unipile)
- **Kein „Invite/Connection Request"** (das gibt es nur auf LinkedIn; IG-Äquivalent = Follow + DM)
- Keine InMails, keine Outreach-Sequence-Primitive (LinkedIn-only), keine Company-Profile, kein Job-Posting

---

## 3. Bestehende Architektur, auf der wir aufsetzen (zu ~80 % schon da)

Die LinkedIn-Seite läuft **bereits über Unipile** und liefert die komplette Blaupause. Instagram ist bei Unipile derselbe Account-/Chat-/Webhook-Layer – nur `provider="INSTAGRAM"` statt LinkedIn und ein paar andere Endpunkte.

Wiederverwendbar:

- **`_shared/unipile-client.ts`** – zentraler Adapter (`getProfile`, `sendMessage`, `getRelations`, `search`, Retry-Klassifikation). `sendMessage` via `POST /chats` ist **provider-agnostisch** → funktioniert für IG identisch.
- **`unipile-webhook`** – Echtzeit-Eingang für neue Nachrichten/Status. IG-Webhooks haben dasselbe Schema.
- **`automation_jobs` + `process-automation-jobs` / `la-runner`** – Job-Queue mit `type`-Handlern, Rate-Limit-Stagger, Backoff. IG-Actions sind neue `type`-Werte.
- **`linkedin_inbox` (Triage → promote-to-lead)** – Muster 1:1 für ein `instagram_inbox`.
- **`LinkedInInbox.jsx` / `Messages.jsx`** – UI-Vorlage für die DM-Inbox.
- **`unipile-enrich`, `unipile-engagement`, `unipile-connect-link`, `unipile-monitor`** – direkt spiegelbar.
- **Account-Connection-Modell** – Unipile Hosted-Auth-Wizard existiert bereits für LinkedIn (`unipile-connect-link`).

> **Achtung Architektur-Drift (CLAUDE.md #13):** Heute schreibt das Frontend in `automation_jobs`, die Extension liest teils `connection_queue`. Für IG gibt es **keine** Chrome-Extension – IG-Actions laufen **rein serverseitig über Unipile**. Das ist sogar sauberer als LinkedIn: kein Extension-Job-Runner-Split, der Runner spricht direkt Unipile.

---

## 4. Was wir in Leadesk abbilden können – gemappt auf Module

### 4.1 Communication / Inbox (das Herzstück – neu)
Vollwertige **Instagram-DM-Inbox** analog `LinkedInInbox`:
- Chats + Verlauf synchronisieren (`list chats`, `list messages`, `sync history`)
- Senden/Antworten inkl. Anhänge + Sprachnachrichten
- Reaktionen, Lesebestätigungen
- **Echtzeit** via `new message`-Webhook → `unipile-webhook`
- Eingehende DMs → `instagram_inbox` → „Übernehmen" erzeugt `leads`-Row (mit `provider_id`, Username, Verlauf)
- **Compliance-Freifahrt:** eingehende Nachrichten dürfen unbegrenzt beantwortet werden (nur Outbound ist limitiert)

### 4.2 Sales / Outreach-Automation (mirror `Automatisierung` / `la_*`)
IG-Sequenzen als `automation_jobs`-`type`-Handler, serverseitig über Unipile:
- `ig_follow` – Profil folgen
- `ig_dm` – Erstnachricht / Follow-up
- `ig_like_post` – Reaktion auf einen Post
- `ig_comment` – Kommentar unter einen Post
- `ig_visit_profile` – Profil abrufen (Enrichment/Trigger)
- `wait` – zeitliche Staffelung (existiert schon)

Typische Sequenz: **Follow → (warten) → DM → (bei Antwort) Inbox**. Kein „Connection Request" nötig – IG kennt das nicht.

### 4.3 CRM / Lead-Anreicherung
- IG-Profil abrufen → `provider_id`, Name, Bio, Avatar in `leads` (analog `unipile-enrich`)
- **Kontakt-Import:** eigene Follower/Following (`get relations`) → `instagram_inbox` → promote zu `leads` (analog `import-unipile-relations`)
- Multi-Tenant: `team_id` an jeder Row (CLAUDE.md #14 – expliziter Team-Filter, nicht nur RLS)

### 4.4 Content (bleibt, wird verschlankt)
- **Beitrag veröffentlichen** via Unipile `create post` statt Growth Suite → Redaktionsplan-Anbindung bleibt, anderer Backend-Pfad
- **Engagement auf Zielposts:** fremde Posts auflisten, liken, kommentieren (Overlap mit 4.2)
- Offen: Unipile-`create post` deckt Bild-Feed ab; Reels/Stories/Carousel prüfen (nicht in der Matrix garantiert)

### 4.5 Reporting
- **Aktivitäts-Reports:** durchgeführte Actions, Antwortquoten, Sequenz-Performance (aus `automation_jobs` + Inbox) – analog SSI/Activity-Tracking
- **Nicht möglich:** Audience-Demografie / Follower-Wachstum / Reichweite (kein Graph-API-Zugang über Unipile)

---

## 5. Die kritische Entscheidung: Hybrid vs. Full-Unipile

Weil Unipile die **Insights/Demografie nicht** liefert, gibt es zwei saubere Wege:

**(A) Full-Unipile (echtes „löschen & neu bauen")**
Modul wird zum Sales-/Communication-Tool. Analytics-Dashboard + Demografie entfallen ersatzlos. Publishing läuft über Unipile. Ein Backend, ein Auth-Modell, konsistent mit LinkedIn. Add-on-Beschreibung müsste umgetextet werden (heute wirbt sie explizit mit „Follower, Reichweite, Posts, Demografie").

**(B) Hybrid (empfohlen, wenn Analytics wertvoll bleibt)**
- Growth Suite / Graph API bleibt **nur** für Insights + Publishing
- Unipile kommt **zusätzlich** für Inbox + Outreach + Follow + Enrichment + Kontakt-Import
- Zwei Connections pro Team (Graph-Connect + Unipile-Connect), im UI als ein Modul zusammengeführt
- Preis-/Positionierungs-Story stärker („Analysen **und** Vertrieb")

> Empfehlung: **(B) Hybrid**, sofern euch die Demografie-/Reichweiten-Insights im Verkauf etwas wert sind – sie sind der einzige Teil, den Unipile prinzipbedingt nicht kann, und ihr habt sie schon. Der Unipile-Teil ist additiv und reitet auf der LinkedIn-Infra. Reines Full-Unipile nur, wenn ihr Analytics ohnehin nie ernst genutzt habt.

Das ist die eine Frage, die du beantworten solltest, bevor der Rebuild geplant wird.

---

## 6. Rate-Limits & Compliance (Unipile-IG)

- **Max. 100 Actions/Tag, max. 10/Stunde** für Follow/Outreach/Like/Kommentar
- Eingehende DMs **unbegrenzt** beantwortbar
- Neue/inaktive Accounts: niedrig starten, langsam hochfahren
- Actions **zufällig** staffeln (nicht getaktet) → euer `la-runner`-Stagger-Pattern deckt das ab
- IG zeigt ggf. „We suspect automated behavior" – laut Unipile ohne Folgen ignorierbar, aber die Limits ernst nehmen
- Session-basiert (Username/Passwort) → 2FA-Checkpoint-Handling nötig (202-Response → Code-Solve in 5 Min)

---

## 7. Vorgeschlagener Neuaufbau in Phasen (analog `la_*`)

1. **P0 – Connect:** Unipile-Account-Connection für `provider=INSTAGRAM` (Hosted-Auth wiederverwenden) + 2FA-Checkpoint-Flow. Neue/erweiterte `instagram_connections` um `unipile_account_id`.
2. **P1 – Inbox (read):** Chats/Messages sync + `unipile-webhook`-IG-Zweig + `instagram_inbox`-Tabelle (Muster `linkedin_inbox`) + Inbox-UI.
3. **P2 – Inbox (write):** DM senden/antworten, Anhänge, Reaktionen aus dem UI.
4. **P3 – Enrichment + Kontakt-Import:** Profil-Abruf + Relations-Import → promote-to-lead.
5. **P4 – Outreach-Automation:** `ig_follow` / `ig_dm` / `ig_like_post` / `ig_comment` als `automation_jobs`-Handler im Runner, mit IG-Rate-Limits.
6. **P5 – Content:** Publish über Unipile `create post` (falls Full-Unipile) **oder** Graph-API behalten (Hybrid).
7. **P6 – Reporting:** Aktivitäts-/Antwort-Reports.

**Schema-Skizze (neu, additiv):** `instagram_inbox` (Triage, wie `linkedin_inbox`), `instagram_messages`/`instagram_chats` (oder generischer `unipile_inbox` mit `provider`-Spalte – prüfen, ob LinkedIn-Inbox verallgemeinerbar ist), `instagram_connections` + `unipile_account_id`. Alles `team_id`-scoped, RLS via `user_in_team`, Self-Host-GRANTs (CLAUDE.md #3).

---

## 8. Offene Punkte / vor Umsetzung klären

1. **Hybrid oder Full-Unipile?** (§5) – bestimmt alles Weitere.
2. **Add-on-Positionierung/Preis** – heutige Beschreibung wirbt mit Analytics; bei Full-Unipile umtexten.
3. **Reels/Stories/Carousel** beim Publishing – deckt Unipile `create post` das ab? (nicht garantiert)
4. **Inbox verallgemeinern?** – Lohnt ein generischer `unipile_inbox`/`unipile_messages`-Layer (LinkedIn + IG + künftig WhatsApp/Telegram), statt pro Provider Tabellen? Unipile ist explizit Multi-Provider.
5. **Ein Unipile-Account-Pool oder pro Kunde eigene Credentials?** – heute nutzt ihr einen geteilten Staging-Key (`unipile-client.ts`-Kommentar, „Env-Key-Split kommt in P6").
6. **Whitelabel/DSGVO:** Session-Login mit Kunden-IG-Credentials über Unipile (EU?) sauber dokumentieren.

---

## 9. Ein-Satz-Empfehlung

Baue das IG-Modul **nicht** als isoliertes Analytics-Tool neu, sondern als **zweiten Provider deiner bestehenden Unipile-Communication-/Outreach-Engine** (Inbox + Follow/DM/Comment-Automation + Enrichment), und **behalte Graph API nur für die Insights/Publishing-Ebene** (Hybrid) – so verlierst du nichts und gewinnst DM-Vertrieb auf Instagram mit ~80 % wiederverwendeter LinkedIn-Infrastruktur.
