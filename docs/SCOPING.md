# SCOPING.md ⭐ — Nutzerdaten, Teams & Brands richtig eingrenzen

> Der teuerste wiederkehrende Fehlertyp bei Leadesk: Daten eines Mandanten tauchen bei einem anderen auf. Am 10.07.2026 hat Leadly einem Multi-Team-User Aufgaben **fremder Teams** angezeigt („Teufelsküche"). Dieses Dokument ist die verbindliche Regel, damit das nie wieder passiert. **Vor jeder Query, die Nutzerdaten liest, hier reinschauen.**

## Die drei Ebenen

- **User** (`auth.uid()`) — die eingeloggte Person. Kann in **mehreren Teams** sein (Michael ist z.B. in 9 Teams, inkl. Kundenteams).
- **Team** (`team_id`) — der Mandant. **Aktives Team** kommt aus `user_preferences.active_team_id` (via `TeamContext` → `useTeam().activeTeamId`). Team-Wechsel = **Hard-Reload** (`window.location.reload()`), kein Soft-Switch.
- **Brand / Brand Voice** (`brand_voice_id`) — innerhalb eines Teams. Fallback-Kaskade: prefs → eigene aktive → eigene → geteilte → `NO_BRAND`-Sentinel.

## Die goldene Regel

**RLS ist ein Sicherheitsnetz, kein Aktiv-Team-Filter.** Die RLS-Policies erlauben dem User **alle** seine Teams. Wer sich nur auf RLS verlässt, bekommt bei Multi-Team-Usern **vermischte** Daten. Deshalb: **immer explizit auf das aktive Team filtern** — mit Solo-Fallback.

```js
// RICHTIG — explizit, mit else-Zweig für Solo/kein-Team:
teamId
  ? q.eq('team_id', teamId)
  : q.eq(ownerCol, userId).is('team_id', null)

// FALSCH — kippt bei fehlender teamId in "ungefiltert":
if (teamId) q = q.eq('team_id', teamId)   // ← kein else → Leak
// FALSCH — nackt auf RLS vertrauen:
supabase.from('leads').select('*')         // ← liefert ALLE Teams des Users
```

**Owner-Spalten** (für den Solo-Fallback wichtig, sie sind uneinheitlich):
| Tabelle | Owner-Spalte |
|---|---|
| `leads`, `content_posts` | `user_id` |
| `lead_tasks`, `deals` | `created_by` |
| `pm_*` (Delivery) | `team_id` NOT NULL (kein Solo-Fall) |

## Caches & Aggregate

Alles Vorberechnete **muss `team_id` im Schlüssel tragen** — sonst wird das Ergebnis von Team A in Team B angezeigt (genau der Briefing-Cache-Bug). Betrifft Briefings, Snapshots, Dashboards, In-Memory-Caches im Frontend (Cache-Key inkl. `activeTeamId`).

Nullable `team_id` im Unique-Index: `COALESCE(team_id,'0000…')`-Expression-Index → PostgREST-`onConflict` funktioniert damit **nicht** → manueller select→update/insert-Upsert.

## Edge Functions (der gefährlichste Fall)

EFs mit **`service_role` bypassen RLS komplett.** Eine EF, die IDs aus dem Request-Body lädt (Brand Voice, Knowledge, Storage-Pfade), muss die **Ownership selbst prüfen** — sonst RLS-Bypass by-id. Nutze die Helfer in `supabase/functions/_shared/tenant.ts`:
- `getCallerTeamIds(userJwt)` — Teams des Aufrufers.
- `loadBrandVoiceIfAllowed(id)` — nur wenn Owner | Team | geteilt, sonst `403 brand_forbidden`.
- `filterOwnedIds(...)`, `filterOwnedStoragePaths(...)` — Media/Referenzen filtern.

Muster: Body-IDs **nie** blind mit dem Admin-Client laden → immer durch die Ownership-Prüfung.

## Schreib-Tools by-id (Aktiv-Team ≠ nur Mitgliedschaft)

Ein User kann Mitglied vieler Teams sein. Ein `complete_task(id)` darf nicht schon deshalb durchgehen, weil der User *irgendwo* Mitglied ist — es zählt die Zugehörigkeit der `id` zum **aktiven** Team. Bei by-id-Writes die Team-Zugehörigkeit der Ziel-Row prüfen.

## Checkliste für jede neue Query / EF

1. Filtere ich **explizit** auf `activeTeamId` (mit Solo-`else`)?
2. Trägt jeder Cache/jedes Aggregat `team_id` im Key?
3. Lädt eine EF Body-IDs? → durch `_shared/tenant.ts`, nicht Admin-Client direkt.
4. Ist es ein by-id-Write? → gehört die id zum **aktiven** Team?
5. Neue Tabelle? → RLS-Policy **und** `authenticated`-Grants (sonst 403 / Silent-Fail).

## Bekannte, bewusst offene Punkte (Stand 10.07.)

`automation_campaigns/jobs` sind aktuell **user-scoped** (nicht team-scoped) — bewusst, kein Cross-User-Leak, aber Multi-Team-Kampagnen nicht getrennt. `send-daily-task-digest` ist user-scoped (eigene Tasks) → vertretbar. Bei Änderungen an diesen Stellen: Team-Modell mitdenken.
