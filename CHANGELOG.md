# Leadesk Changelog

---

## [v0.9] — 13. April 2026

### 🤖 KI-Assistent (neu)

**Neue Seite `/assistant`** — Chat-Interface ähnlich wie ChatGPT, direkt in Leadesk integriert:

- Lädt beim Start alle Leads aus der eigenen Datenbank (max. 200)
- Begrüßungsnachricht mit Live-Daten: Pipeline-Wert, Anzahl Leads, Hot-Intent-Count
- 6 Vorschlags-Chips für häufige Fragen (Telefonnummer, Deal-Wert, Follow-ups...)
- Textarea mit Auto-Resize, Enter zum Senden, Shift+Enter für Zeilenumbruch
- 3-Punkte-Ladeanimation während Antwort generiert wird
- „Neues Gespräch" Button — löscht Chat-History und startet neu
- Markdown-Rendering: **fett**, `code`, Zeilenumbrüche
- Primärfarbe vollständig via CSS-Vars (Whitelabel-kompatibel)

**Technische Umsetzung:**
- Supabase Edge Function `ai-assistant` (Anthropic Claude Haiku) — API-Key nie im Browser
- JWT-Authentifizierung via Service Role Key (wie die bestehende `generate`-Function)
- Message-Validierung: user-first, alternierend user/assistant, Deduplication
- Robustes Error-Handling mit verständlichen Fehlermeldungen auf Deutsch

**Dashboard-Widget:**
- Neue Gradient-Kachel auf der Startseite → direkter Link zum Assistenten
- Zeigt Lead-Anzahl, Hot-Intent-Count und Pipeline-Wert als Quick-Stats

---

### 🎨 Whitelabel / Multi-Tenant System (neu)

**Phase 1 — Fundament:**
- Neue DB-Tabellen: `tenants`, `tenant_members`, `whitelabel_settings` (erweitert)
- Subdomain-Erkennung beim App-Start: `salesplay.leadesk.de` → SALESPLAY-Branding
- CSS-Variablen-Injection: `--wl-primary`, `--wl-secondary`, `--wl-accent`, `--wl-sidebar-bg`, `--wl-font`
- Favicon, Page-Title und Custom CSS werden pro Tenant automatisch gesetzt
- `TenantContext` — lädt Theme beim App-Start, `useTenant()` Hook überall nutzbar
- Sofort-Aktualisierung: Sidebar-Logo und Farben wechseln nach dem Speichern ohne Reload

**Phase 2 — Admin-Panel:**
- Neue Seite `/admin/tenants` — vollständiges CRUD für Whitelabel-Kunden
- Tabelle: Name, Subdomain, Custom Domain, Plan (Starter/Pro/Enterprise), Max Leads, Max User
- Farbige Plan-Pills, grüner/grauer Status-Dot
- Modal zum Anlegen/Bearbeiten: Subdomain auto-sanitized, DNS-Hinweis bei Custom Domain
- 🎨-Button je Tenant → direkt zu den WhiteLabel-Einstellungen
- Onboarding-Hinweis für den ersten Kunden (Step-by-Step)
- „─ Tenant-Verwaltung" im Admin-Dropdown der Sidebar

**Phase 3 — Vollständiges Theming:**
- 134 hardcodierte Primärfarben `rgb(49,90,231)` → `var(--wl-primary, rgb(49,90,231))` in 26 Dateien
- Alle rgba-Varianten für Hover, Glow, Border ebenfalls auf CSS-Vars umgestellt
- Betrifft: Leads, Pipeline, Dashboard, LeadProfile, Reports, Vernetzungen, Redaktionsplan, TeamSettings, Login, Messages, BrandVoice, ContentStudio, CrmEnrichment, SSI, AdminPanel, AdminTenants, WhiteLabel, LinkedInAbout, LinkedInConnect, Layout

---

### 🗂 Leads — Komplett-Redesign

**Neue Tabellenstruktur:**
- Grid: `36px 36px 1fr 140px 100px 100px 56px` (Checkbox · Avatar · Name+Meta · Stage · Score · Follow-up · Menü)
- Farbige Initialen-Avatare (erste Buchstaben Name) oder echtes Profilbild wenn vorhanden
- Stage-Pills direkt in der Tabelle
- Score-Balken + Zahl nebeneinander
- Follow-up: relative Anzeige — „Heute", „Morgen", „in 3T", „2T über" statt Datum
- Überfällige Follow-ups rot mit ⚠-Symbol
- Hover-State: Zeile wird grau, Border links wechselt zu hellblau
- Header-Checkbox: indeterminate (—) wenn teilweise ausgewählt

**Custom Dropdowns:**
- Listen-Dropdown: blauer Punkt + Listen-Name + Anzahl, „+ Neue Liste erstellen"
- Sort-Dropdown: Filter-Icon + Sortierfeld + Pfeil, 6 Sortieroptionen

**··· Aktionsmenü pro Lead:**
- 📞 Anruf loggen → direkt in Timeline
- 📅 Follow-up Schnellauswahl: Heute / Morgen / In 3 Tagen / In 7 Tagen / In 14 Tagen + „Löschen"
- ⭐ Favorit setzen/entfernen
- 📋 Liste zuweisen (mit Checkmark für aktive Liste)
- 👥 Mit Team teilen / aufheben
- ↗ In LinkedIn öffnen
- 🗑 Lead löschen (mit Bestätigung)

**Filter-Chips:** 🔥 Hot · 💼 Pipeline · ⭐ Favoriten · 📅 Fehlt · 👥 Team

---

### 🧩 LeadDrawer — Komplett-Redesign

**Neuer Header (hell, strukturiert):**
- Avatar mit abgerundeten Ecken + Name / Job / Firma-Tag
- 3 KPI-Kacheln: Leadesk Score (Balken) · Pipeline Stage · Deal-Wert
- 4 Quick-Action Buttons: 📞 Anruf · 📅 Follow-up · ✏ Notiz · ↗ Profil
- Follow-up öffnet Schnellauswahl direkt darunter
- Header-Buttons: 👥 Team teilen · ⭐ Favorit · × Schließen

**3 Tabs statt 4:**
- **Übersicht** — Pipeline Stage (autosave), Verbindung + Lifecycle, Deal Details (Speichern nur wenn geändert), KI-Einschätzung, Allgemeine Notiz
- **Aktivität** — Aktivität loggen (Typ-Buttons), Notizen-Liste (mit 🗑), Timeline (mit 🗑)
- **Profil** — Kontakt, Unternehmen, LinkedIn, Tags, Löschen-Button dezent unten

**Weitere Verbesserungen:**
- Notizen und Aktivitäten einzeln löschbar (🗑 mit Hover-Rot)
- ENUM-Felder (deal_stage, lifecycle_stage, li_connection_status) werden einzeln gespeichert (kein Batch-Update)
- `formDirty`-State: Speichern-Button nur sichtbar wenn etwas geändert wurde

---

### 👥 Team-Sharing

- Lead-Sharing: Leads für das gesamte Team sichtbar machen (Toggle im LeadDrawer-Header)
- TeamContext mit `useTeam()` Hook überall nutzbar
- TeamSettings Seite: Tab „Geteilt" zeigt alle geteilten Leads
- Dashboard Team-Widget: Mitglieder + geteilte Leads auf einen Blick
- Vernetzungen: Batch-Nachrichten an Teams senden
- Alle Seiten (Leads, Pipeline, Vernetzungen, LeadProfile) berücksichtigen Team-Kontext

---

### 🏷 Umbenennung

- „HubSpot Score" → **„Leadesk Score"** (CrmEnrichment, LeadProfile, Dashboard)
- „CRM Enrichment" → **„Lead Intelligence"** (Sidebar-Menü, Seite, Doku)

---

## [v0.8] — 12. April 2026

### 📱 Mobile-Optimierung

- Burger-Menü für iPhone 17 (393px Breite)
- Leads-Tabelle responsiv für Notebook (< 1280px)
- Pipeline Kanban auf Mobile repariert (Flex-Kette, isMobile-Fix)
- Alle Sales-Seiten (Vernetzungen, CrmEnrichment, LeadProfile) mobiloptimiert
- White-Screen-Bugs durch fehlende Imports behoben

### 🌐 Domain-Migration

- App von `llr-dashboard.vercel.app` auf **`app.leadesk.de`** umgezogen
- Alle internen Links und Redirects angepasst
- Demo-Login überspringt Onboarding und landet direkt im Dashboard

---

## [v0.7] — 9.–10. April 2026

### 🗃 Sidebar-Navigation

- Menü als aufklappbares Accordion mit Bereichen: Branding · Sales · Content · Projektmanagement · Reporting
- Accordion-Header visuell identisch zu NavItems (Icon links, Text, Pfeil dreht sich)
- Neuer Bereich „Content" mit Content Studio
- „Automatisierung" als Coming-Soon-Seite unter Sales
- „Interessenten" → „CRM" umbenannt
- Team-Link ins Benutzer-Dropdown verschoben

### 📊 Reporting & SSI

- SSI Tracker in Reporting-Bereich integriert
- „Reports" → „Sales Reporting" umbenannt

### 📋 Projektmanagement

- Kanban Board (vollständige Trello-Features): Spalten, Karten, Drag & Drop
- Team-Zuweisung für Tasks
- Dashboard-Widget „Meine Aufgaben" (PM-Tasks die mir zugewiesen sind)

### 🐛 Bug-Fixes

- Dashboard Hook-Reihenfolge korrigiert (React Rules of Hooks)
- `getUser()` Race Conditions in 7+ Dateien behoben → `session.user.id` direkt
- LeadProfile White Screen (scoreTrend undefiniert) gefixt
- White Screen durch fehlende Imports in mehreren Seiten behoben

---

## Technische Verbesserungen (übergreifend)

**Datenbank:**
- 15 Performance-Indexes auf Foreign Keys
- RLS-Policies für `whitelabel_settings`: wl_select, wl_insert, wl_update, wl_delete
- `SECURITY DEFINER` auf Trigger-Funktionen (RLS-Bypass für system-interne Writes)
- `team_id` nullable in activities, contact_notes, deals, pipeline_stages
- `crm_auto_score` Trigger: hs_score wird bei relevanten Feldänderungen automatisch neu berechnet

**Performance:**
- Leads: Batch-Aktivitäts-Lade (ein Query für alle Leads statt N Queries)
- TenantContext: `useCallback` für loadTheme, verhindert unnötige Re-Renders
- Bundle: 117 Module, Build in ~5–6s

**Sicherheit:**
- OpenAI/Anthropic API-Keys nur noch in Supabase Edge Function Secrets (nie im Browser-Bundle)
- Admin-Routen warten auf Role-Load vor dem Rendern (kein vorzeitiger Redirect auf `/`)
