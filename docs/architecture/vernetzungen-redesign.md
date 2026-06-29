# Vernetzungen — Redesign

> Stand: 2026-06-29 · Status: Konzept (zur Freigabe) · Autor: Michael Schreck

## 1. Ziel

Die Seite `/vernetzungen` (heute `src/pages/Vernetzungen.jsx`, 600 Zeilen) wird neu gedacht. Sie soll der Ort sein, an dem ein Kontakt **nach** dem Eintreffen in der Import-Inbox vernetzt und bis zur Annahme nachverfolgt wird — in zwei klaren Pfaden (Auto-Vernetzen über die Extension **oder** nur Nachricht formulieren), mit **automatischer Annahme-Erkennung** durch Scraping der LinkedIn-Connections-Seite, im aktuellen Layout („Personal Brand"-Stil).

## 2. Abgrenzung der drei LinkedIn-Surfaces

Alle drei lesen heute aus `linkedin_inbox` — die Rollen müssen sauber getrennt sein:

| Surface | Rolle |
|---|---|
| **Import-Inbox** (`LinkedInInbox.jsx`) | Eingang: neue Prospects landen hier (Sales-Nav-Import). Triage: als CRM-Kontakt übernehmen (`promote`) oder verwerfen. |
| **Vernetzungen** (diese Seite) | Vernetzen + Tracking: pro Kontakt auto-vernetzen oder Nachricht formulieren, Status bis „angenommen" nachverfolgen. |
| **Automatisierung** (`Automatisierung.jsx`) | Mehrstufige Sequenzen/Kampagnen über mehrere Kontakte (Connect → Wait → Message …). |

Vernetzungen = **1:1- und Bulk-Einzelvernetzung + Annahme-Tracking**. Automatisierung = **Sequenz-Kampagnen**. Inbox = **Eingang/Triage**.

## 3. Funktions-Inventar: behalten / ersetzen / entfernen

| Funktion (heute) | Entscheidung |
|---|---|
| AnfrageModal: KI-Nachricht (Brand Voice) + Auto-Vernetzen (`connection_queue`) | **Behalten** (Kernpfad „Auto-vernetzen") |
| AnfrageModal: „nur Status/manuell senden" | **Behalten & schärfen** als Pfad „nur Nachricht formulieren" |
| Bulk-Vernetzen (mehrere `connection_queue`-Jobs) | **Behalten** |
| Stats (Vernetzt / Ausstehend / Kein Kontakt / Antwortquote) | **Behalten**, ins neue Layout |
| Antwortverhalten (`li_reply_behavior`: schnell/langsam/keine Antwort) | **Behalten** |
| StatusModal: Verbindungsstatus **manuell** setzen | **Ersetzen** durch Scrape-Automatik; manuelles Setzen nur noch als kleiner Fallback |
| ReactivateModal: Lead-Reaktivierungs-Follow-up | **Entfernen** (gehört zu CRM/Messages) |

## 4. Neues Layout (wie „Personal Brand")

Umstellung auf die bestehenden, wiederverwendbaren Komponenten:

- `PageHeader` — Eyebrow („LinkedIn · Vernetzungen"), Titel, Primär-Aktion „Verbindungen abgleichen", Sekundär-Aktion „Import-Inbox".
- `TabBar` — Tabs nach Status: **Offen** (nicht_verbunden + sinnvoll vernetzbar), **Ausstehend** (Anfrage raus, noch nicht angenommen), **Vernetzt**, **Abgelehnt**.
- `SectionCard` — Gruppierung (z. B. KPI-Leiste, Kontaktliste).
- Zentrierter Container `maxWidth:1100, margin:0 auto`, Inline-Styles, CSS-Variablen (`var(--wl-primary…)`), deutsche Texte — gemäß CLAUDE.md-Regeln.

Pro Kontakt-Karte zwei klar getrennte Aktionen:

1. **Auto-vernetzen (Extension)** — schreibt `connection_queue`-Job (wie heute), Status → `pending`.
2. **Nur Nachricht formulieren** — KI-Entwurf (Brand Voice) zum Kopieren/manuell Senden, ohne Extension-Job.

## 5. Annahme-Erkennung via Connections-Scrape (neu)

Heute wird „angenommen?" **manuell** im StatusModal gesetzt. Neu: automatisch über die Connections-Seite.

### Mechanik (Vorlage: bestehender SSI-Scraper in `background.js`)

1. Nutzer ist auf `https://www.linkedin.com/mynetwork/invite-connect/connections/` **oder** klickt in der Web-App „Verbindungen abgleichen".
2. Die Web-App schickt der Extension `BRIDGE_SCRAPE_CONNECTIONS` (analog `BRIDGE_SCRAPE_LINKEDIN`). Die Extension öffnet die Connections-Seite (falls nötig minimiert), führt `scrapeConnectionsPage()` via `chrome.scripting.executeScript` aus, scrollt für Nachladen, schließt den Tab.
3. `scrapeConnectionsPage()` liefert eine Liste `[{ name, profile_url, connected_label }]` (mit Login-/„noch nicht geladen"-Guards wie beim SSI-Scraper).
4. **Matching in der Web-App** (RLS-Kontext): Abgleich der gescrapten `profile_url` (normalisiert, ohne Query/Trailing-Slash) gegen `linkedin_inbox`-Zeilen mit `li_connection_status='pending'`. Treffer → `li_connection_status='verbunden'`, `li_accepted_at=now()`. Fallback-Match über Namen, wenn keine URL.
5. UI zeigt „X neue Annahmen erkannt", Liste/KPIs aktualisieren sich.

### Warum Matching in der Web-App (nicht in der Extension)

Die Extension liefert nur Rohdaten zurück (wie der bestehende Profil-Scraper). Matching + DB-Update laufen in der App mit User-Session/RLS — saubere Team-Scopes, keine Service-Key-Logik in der Extension.

## 6. Datenmodell

`linkedin_inbox` hat bereits: `li_connection_status` (nicht_verbunden/pending/verbunden/abgelehnt), `li_connection_requested_at`, `li_reply_behavior`.

**Neue Spalten** (idempotente Migration, Staging-first):

```sql
ALTER TABLE public.linkedin_inbox
  ADD COLUMN IF NOT EXISTS li_accepted_at         timestamptz,
  ADD COLUMN IF NOT EXISTS li_connection_checked_at timestamptz;
-- Parität dual-track (Leads), falls dort ebenfalls getrackt:
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS li_accepted_at         timestamptz,
  ADD COLUMN IF NOT EXISTS li_connection_checked_at timestamptz;
```

Kein Schema-Drop. RLS bleibt unverändert (Tabellen existieren bereits team-gescoped).

## 7. Betroffene Stellen

**Frontend (`llr-dashboard`, develop):**
- `src/pages/Vernetzungen.jsx` — Rewrite auf PageHeader/TabBar/SectionCard, Doppelpfad-Karten, ReactivateModal raus, StatusModal → Mini-Fallback, „Verbindungen abgleichen"-Button + Match-Logik. **team_id-Scope explizit** sicherstellen (Fallstrick #14).
- ggf. kleine Helper in `src/lib/` für URL-Normalisierung + Connections-Matching.

**Extension (`chrome-extension`):**
- `background.js` — `scrapeConnectionsPage()` + Handler `BRIDGE_SCRAPE_CONNECTIONS` (Open-Scrape-Close-Routine, Muster: SSI-Scraper).
- `bridge.js` — Bridge-Nachrichtentyp durchreichen.
- `manifest.json` — Host-Permission `linkedin.com/*` deckt `/mynetwork/` ab (prüfen, ggf. ergänzen).

**Migration (`supabase/migrations`):**
- `YYYYMMDDHHMMSS_linkedin_inbox_accepted_at.sql` — die zwei/vier Spalten oben.

## 8. Phasen

1. **Migration** (Staging-first via SSH) — neue Spalten.
2. **Layout-Port + Doppelpfad** — Vernetzungen auf neues Layout, ReactivateModal raus, Auto-vernetzen/Nachricht geschärft, Bulk behalten.
3. **Connections-Scraper** — Extension-Funktion + Bridge-Handler.
4. **Abgleich-UI** — „Verbindungen abgleichen"-Button, Matching, Status-Auto-Update, KPIs.
5. **Verifikation** — Build, Staging-Smoke (vernetzen → abgleichen → Status springt auf „verbunden"), Changelog-Eintrag.

## 9. Risiken / offene Punkte

- **LinkedIn-DOM-Brüchigkeit**: Selektoren der Connections-Seite ändern sich gelegentlich (gilt schon für den SSI-Scraper). Defensive Guards + Fallback auf Namens-Match.
- **Rate-Limits / ToS**: Scraping der eigenen Connections ist niedrig-risiko (eigene Daten), aber Frequenz begrenzen (z. B. „Abgleich" manuell oder max. 1×/Tag automatisch).
- **Profil-URL-Verfügbarkeit**: Falls die Connections-Seite keine stabilen `/in/`-URLs liefert, ist Namens-Match die zweite Wahl (unschärfer bei Namensgleichheit).
- **Automatisierung-Drift (Fallstrick #13)**: `connection_queue` bleibt der ausführende Pfad für Einzel-Vernetzen — bewusst nicht auf `automation_jobs` umgestellt (das ist ein eigener Sprint).
