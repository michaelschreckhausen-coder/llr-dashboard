# LinkedIn-Integrationen — Konzept & Struktur

> Stand: 2026-06-30 · Status: Konzept (genehmigt, Implementierung offen)

## Problem

LinkedIn ist an drei Stellen „verbindbar", alle heißen ähnlich („verknüpfen/verbinden/connect"),
sind aber **drei technisch völlig verschiedene Integrationen** mit eigenem Mechanismus, eigenem
Speicherort und eigenem Funktionsumfang. Nutzer können nicht erkennen, was welche Verbindung
freischaltet — insbesondere dass die Verknüpfung in den Einstellungen nur Login ist.

## Die drei Verbindungen (Ist-Zustand)

| # | Zweck | Mechanik | Scope / Token | Speicher | Heutiger Ort |
|---|-------|----------|---------------|----------|--------------|
| 1 | **Anmelden** (Login) | LinkedIn-OIDC über Supabase/GoTrue (`signInWithOAuth` / `linkIdentity`) | `openid profile email` | GoTrue-Identities (`auth.users.identities`) | Account-Anlage + `/settings/profil` „LinkedIn-Konto verknüpfen" |
| 2 | **Veröffentlichen** (Posts) | Eigener OAuth: `linkedin-oauth-init` → Callback `linkedin-oauth-callback` → EF `linkedin-publish-post` (offizielle Posts-API `api.linkedin.com/rest/posts`) | `w_member_social` | `linkedin_oauth_tokens`, **gebunden an `brand_voice_id`** | `/personal-brand` (BrandVoice `connectLinkedIn()`) |
| 3 | **Automatisieren & Importieren** | Leadesk Chrome-Extension hängt sich an die im Browser eingeloggte LinkedIn-Session (kein offizielles API) | — (Browser-Session) | `linkedin_connections` (+ `scrape_jobs`) | `/linkedin-connect` („LinkedIn Cloud") |

**Wichtige Eigenschaften:**
- #1 schaltet **weder Posten noch Automatisierung** frei — reine Anmeldung + Basis-Profildaten (Name/Avatar/E-Mail).
- #2 ist **pro Brand Voice** (Personal- und Company-Marke brauchen je eine eigene Verbindung).
- #3 treibt: Vernetzungs-Automatisierung, Nachrichten, Connections-Import, Sales-Nav-Scraping und das Profil-Scraping für die Brand Voice.

## Soll-Zustand (genehmigt)

Leitprinzip: **Der Nutzer entscheidet frei**, welche der drei Verbindungen er aktiviert — jede ist
unabhängig opt-in, einzeln verbind-/trennbar. Benannt wird nach **Zweck**, nicht nach Technik.

### Zentraler Hub: `/settings/linkedin`

Eine Settings-Seite mit drei klar getrennten Karten. Jede Karte zeigt:
- **Status** (verbunden / nicht verbunden, ggf. „zuletzt synct"/Token-Ablauf)
- **Was es freischaltet** (1 Satz Klartext)
- **Verbinden / Trennen**

| Karte | Titel (UI) | Unter-Text |
|-------|-----------|------------|
| 1 | **Mit LinkedIn anmelden** | „Schnell einloggen mit LinkedIn statt Passwort. Übernimmt Name & Profilbild." |
| 2 | **Veröffentlichen über LinkedIn** | „Beiträge direkt aus dem Redaktionsplan posten. Pro Marke (Personal/Company) je eine Verbindung." |
| 3 | **Automatisieren & Importieren** | „Vernetzen, Nachrichten, Kontakte-Import & Sales-Navigator — über die Leadesk Chrome-Extension." |

### Kontextuelle Einstiege (bleiben, zeigen denselben Status)

- **Veröffentlichen** weiterhin direkt aus `/personal-brand` / Content erreichbar — aber mit klarem Scope-Hinweis und Verweis auf den Hub.
- **Automatisieren** weiterhin aus dem Outreach-/Vernetzungs-Bereich.
- **Anmelden** nur noch im Hub (raus aus dem generischen Profil-Tab, wo es „mehr verspricht").

### Umbenennungen (Klarheit)

- `/settings/profil` „LinkedIn-Konto verknüpfen" → entfällt dort; wandert als **„Mit LinkedIn anmelden"** in den Hub.
- `/linkedin-connect` „LinkedIn Cloud" → **„Automatisieren & Importieren (Chrome-Extension)"**.
- `/personal-brand` Connect → **„Veröffentlichen über LinkedIn verbinden"** (pro Marke).

## Offene Sub-Entscheidung

- **Publishing-Granularität:** bleibt **pro Brand Voice** (Ist-Zustand, am wenigsten invasiv) oder
  wird zu **einer** konto-/profilweiten Posting-Verbindung? Empfehlung: vorerst pro Brand Voice
  belassen, im Hub aber transparent als „je Marke eine Verbindung" darstellen. Umbau auf
  Konto-Ebene wäre ein eigener Sprint (Schema + EF-Anpassung `linkedin_oauth_tokens`).

## Implementierungs-Phasen (Vorschlag)

1. **Hub-Seite `/settings/linkedin`** bauen (neuer Settings-Tab) — aggregiert die drei Status aus
   GoTrue-Identities / `linkedin_oauth_tokens` / `linkedin_connections`; Connect/Disconnect je Karte
   ruft die bestehenden Flows (linkIdentity / linkedin-oauth-init / Extension-Bridge) auf.
   → reine Frontend-Arbeit, keine Migration.
2. **Settings/profil entschlacken:** „LinkedIn-Konto verknüpfen" raus → Hinweis/Link auf den Hub.
3. **Kontextuelle Einstiege angleichen:** personal-brand & linkedin-connect zeigen Hub-Status +
   konsistente Benennung; Deep-Link in den Hub.
4. **(optional, eigener Sprint)** Publishing-Granularität konto-weit, falls gewünscht.

## Betroffene Stellen (Code)

- `src/pages/Settings.jsx` (LinkedIn-Verknüpfung-Block raus)
- `src/pages/BrandVoice.jsx` (`connectLinkedIn`, `linkedin-oauth-init`)
- `src/pages/LinkedInConnect.jsx` (`linkedin_connections`, `scrape_jobs`)
- `src/pages/auth/LinkedInCallback.jsx` (`linkedin-oauth-callback`)
- `src/components/SettingsTabs.jsx` (neuer Tab „LinkedIn")
- EFs: `linkedin-oauth-init`, `linkedin-oauth-callback`, `linkedin-publish-post`
- Tabellen: `auth.users.identities`, `linkedin_oauth_tokens` (brand_voice_id), `linkedin_connections`
