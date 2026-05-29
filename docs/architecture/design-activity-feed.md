# Activity-Feed (Sprint C) — UX-Design-Doc

> Status: **Approved 2026-05-22** — User-Sign-Off durch, Sprint-C-Implementation steht
>
> **Entscheidungen aus Review:**
> - Q1 Field-History-Scope: ✅ Whitelist `status`, `deal_stage`, `owner_id`, `lead_score` — Rest raus
> - Q2 System-Actor-Render: ✅ als „System" mit Icon zeigen, NICHT ausblenden
> - Q3 Implementation: ✅ **Option (1) SQL-View `lead_activity_feed`** (sauberer Endzustand statt Phase-1-Quick-Win)
> - Q4–6 (LinkedIn-Lifecycle / Realtime / Tab-Count-Badge): zu klären während Implementation
>
> Owner: Michael Schreck
>
> Vorgänger: PR 4.5 hat das Activity-Mock auf der LeadDetail-Page durch einen ehrlichen „Bald verfügbar"-Empty-State ersetzt (Commit `9eb5f83` ungefähr). Dieses Doc spezifiziert die echte Implementation.

## Ziel

Auf der **Lead-Detail-Page** (`/leads/:id`) im **Aktivitäten-Tab** (existiert bereits als `ActivityTab` in `src/pages/LeadDetail.jsx:653+`) eine **chronologisch unifizierte Timeline** aller leadbezogenen Events rendern — statt nur der `activities`-Tabelle.

Aktuell zeigt `ActivityTab` ausschließlich `public.activities` (manuelle Logs: Notiz, Anruf, E-Mail-manual, Meeting). Sprint C erweitert auf **6 Source-Tabellen** mit unifiziertem Render-Schema.

## Source-Tabellen

Auf Hetzner-Prod verifiziert (2026-05-22, Spalten via REST `?select=*&limit=1`):

| Tabelle | Rolle | Spalten (Auszug) | FK auf leads | Typische Events |
|---|---|---|---|---|
| `activities` | Generic Log | `id, lead_id, user_id, team_id, type, subject, body, direction, outcome, duration_seconds, occurred_at, created_at` | CASCADE | meeting, call, email-manual, note |
| `lead_field_history` | Audit | `id, lead_id, field_name, old_value, new_value, changed_by, changed_at, change_source` | CASCADE | status_changed, score_changed, deal_stage_changed |
| `lead_tasks` | Tasks | `id, lead_id, team_id, created_by, assigned_to, title, status, priority, due_date, completed_at, created_at` | CASCADE | task_created, task_completed |
| `linkedin_messages` | LinkedIn-Outreach | (RLS hidden für Vorstellung-Account) | (unverified) | linkedin_sent, linkedin_received |
| `vernetzungen` | LinkedIn-Connections | (RLS hidden) | SET NULL | connection_requested, connection_accepted |
| `email_send_log` | Auto-Emails (Postmark) | (RLS hidden) | (unverified) | email_sent_automated |

**Pre-Sprint-Action:** Auf einem Account mit reichen Daten Schema-Introspektion von `linkedin_messages`, `vernetzungen`, `email_send_log` (Spalten + FK-Verhalten zu `lead_id`).

## Unified ActivityItem-Shape

```jsx
{
  id: string,           // Source-Table-PK
  source: string,       // 'activities' | 'field_history' | 'task' | 'linkedin_message' | 'connection' | 'email_log'
  type: string,         // semantic event-type (e.g. 'meeting', 'status_changed', 'task_completed')
  timestamp: string,    // ISO-Datum, primary sort-key
  actor: {              // null bei system-events
    id: string,
    name: string,
    avatar_url: string | null,
  } | null,
  lead_id: string,
  payload: {            // type-specific, im Render-Switch ausgewertet
    title?: string,           // Header-Text
    body?: string,            // Optional Quote-Block
    field_name?: string,      // Bei field_history
    from?: string,            // alter Wert
    to?: string,              // neuer Wert
    direction?: 'in' | 'out', // bei Messages/Emails
    duration_seconds?: number,
    outcome?: string,
  },
}
```

**Sort-Key:** `timestamp` DESC (neueste zuerst).

**Render:** Bestehendes `ACTIVITY_VARIANTS` in `LeadDetail.jsx:84` als Lookup-Map erweitern um neue Types (`status_changed`, `task_created`, `task_completed`, `connection_requested`, `connection_accepted`, `linkedin_message`, `email_automated`). Pattern wie bestehender `DayDivider`-Block beibehalten.

## Implementations-Optionen

### Option (1) — SQL-View `lead_activity_feed`

```sql
CREATE OR REPLACE VIEW public.lead_activity_feed AS
  SELECT 'activities'::text AS source, id, lead_id, ... FROM public.activities
  UNION ALL
  SELECT 'field_history'::text AS source, id, lead_id, ... FROM public.lead_field_history
  UNION ALL
  -- … pro Tabelle ein UNION-Branch
  ORDER BY timestamp DESC;
```

**Pro:**
- Single round-trip: ein `SELECT * FROM lead_activity_feed WHERE lead_id = $1`
- RLS-Vererbung: View erbt RLS-Policies der underlying Tabellen automatisch (Postgres-Standard)
- Kein neuer Backend-Endpoint
- Frontend-Hook kann unverändert weiterverwenden (`from('lead_activity_feed')`)

**Contra:**
- Schema-Drift: jeder neue Source-Tabelle braucht View-Migration
- Field-Mapping ist statisch — `payload`-jsonb-Coercion in Postgres umständlich
- Sortierung über UNION ALL ist kostspielig bei N>10k Rows pro Tabelle (Index-Strategie nötig)

**Aufwand:** 1 Migration (~60 LoC SQL) + Hook-Edit (~20 LoC) + Render-Refactor (~50 LoC)

### Option (2) — Edge-Function `get-lead-activity`

```ts
serve(async (req) => {
  const { lead_id } = await req.json();
  const [a, h, t, l, v, e] = await Promise.all([
    supabase.from('activities').select(...).eq('lead_id', lead_id),
    supabase.from('lead_field_history').select(...).eq('lead_id', lead_id),
    // ...
  ]);
  return new Response(JSON.stringify({
    items: merge(a, h, t, l, v, e).sort(byTimestamp),
  }));
});
```

**Pro:**
- Custom-Logic-Spielraum: Field-History-Aggregation (z.B. 5 Score-Updates innerhalb 1 Min zu „Score: 30 → 60" zusammenfassen)
- Pagination/Cursor server-side möglich
- Type-Mapping in JS einfacher als Postgres-jsonb
- Future-Proof: neue Source-Tabellen ohne DB-Migration

**Contra:**
- Neuer Deploy-Surface — pro Schema-Change Edge-Function-Restart (Top-Fallstrick #11: Deno-Cache)
- Round-Trip-Latenz höher (~150ms statt ~30ms)
- Error-Handling komplexer (6 parallele Supabase-Calls, partial-failure-modes)

**Aufwand:** Edge-Function (~200 LoC) + Hook-Edit (~25 LoC) + Render (~50 LoC) + Deploy-Pipeline

### Option (3) — Client-side 6× parallel-fetch

```jsx
function useLeadActivities(leadId) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    Promise.all([
      supabase.from('activities')...,
      supabase.from('lead_field_history')...,
      // ...
    ]).then(([a, h, ...]) => {
      setItems(merge(a, h, ...).sort(byTimestamp));
    });
  }, [leadId]);
  return items;
}
```

**Pro:**
- Kein Backend-Change
- Schnellste Implementierung (~1 Tag)
- Debug-bar im Browser
- Source-Table-Schema-Drift zeigt sofort im Frontend

**Contra:**
- 6 Round-Trips pro Tab-Open (~6×30ms parallel ≈ 50ms real)
- Sortier-Logic im Client — bei N>500 spürbar
- Pagination muss client-side aggregiert werden (umständlich)
- Bei einer fehlgeschlagenen Sub-Query: Aktivitäts-Feed unvollständig ohne dass User es merkt

**Aufwand:** Hook (~80 LoC) + Render (~50 LoC)

## Empfehlung

**Phase 1 — Quick Win:** Option (3) Client-Merge.

Rationale:
- Sprint C steht seit Wochen auf Backlog, Activity-Feed-Empty-State ist ehrlicher Trust-Bug
- 6 Source-Tabellen liefern jeweils <100 Rows pro Lead (Realistic-Case) → Client-Merge ist performant genug
- Kein Backend-Change = kein Deploy-Risiko = schneller User-sichtbarer Mehrwert
- Iteration zu Option (1) View oder Option (2) Edge-Function ist später möglich wenn Pagination/Aggregation gebraucht wird

**Phase 2 — Wenn Pagination/Aggregation gebraucht:**
- Move zu Option (1) SQL-View wenn Schema-Drift gering bleibt und Reads dominant
- Move zu Option (2) Edge-Function wenn Field-History-Aggregation gewünscht (Score-Spam-Filter)

## UX Mock-Up Skizze

```
┌─ Aktivitäten ─────────────────────────────────────  127 Einträge ─┐
│                                                                    │
│  Heute, 22. Mai                                                    │
│  ───────────────                                                   │
│  ● 14:32   📝 Notiz                                                │
│            Michael Schreck                                         │
│            „Demo-Call vereinbart, Mara ist Decision-Maker"         │
│                                                                    │
│  ● 14:15   ☑ Aufgabe erledigt                                      │
│            Michael Schreck → „Decks zusammenstellen"               │
│                                                                    │
│  ● 13:48   📈 Status                                               │
│            System → MQL → SQL                                      │
│                                                                    │
│  Gestern, 21. Mai                                                  │
│  ────────────────                                                  │
│  ● 16:22   💬 LinkedIn-Nachricht                                   │
│            ← Mara Fuchs (eingehend)                                │
│            „Klingt spannend, wann passt's bei dir?"                │
│                                                                    │
│  ● 11:05   📧 E-Mail                                               │
│            System → Mara Fuchs (Postmark)                          │
│            „Webinar-Bestätigung — 28. Mai 10:00"                   │
│                                                                    │
│  Letzte Woche                                                      │
│  ─────────────                                                     │
│  ● 17. Mai 09:00   🔗 Vernetzungsanfrage akzeptiert                │
│                    Mara Fuchs ist jetzt vernetzt                   │
│                                                                    │
│  [+ Mehr laden]  (zeigt Items 51–100)                              │
└────────────────────────────────────────────────────────────────────┘
```

**Komponenten-Reuse aus existing Code:**
- `DayDivider` (Z.70-72 + groupByDay Z.119-132) ✓ already extracted
- `ACTIVITY_VARIANTS` (Z.84-95) ← erweitern um 5-7 neue Types
- `variantFor(type)` (Z.98) ✓ unverändert
- `activityIconStyle`, `activityTextStyle`, `quoteBlockStyle`, `activityMetaStyle` ✓ alle existing

## Filter & Pagination

**Default-View:** alle Types, 50 neueste, mit „Mehr laden"-Button.

**Filter-Chips** (Phase 1.5, optional):
- „Manuell" (activities-Tabelle)
- „System" (field_history)
- „LinkedIn" (linkedin_messages + vernetzungen)
- „E-Mail" (email_send_log)
- „Aufgaben" (lead_tasks)

**Pagination-Strategie:**
- Client-Merge: erstmal alle Items laden, später Cursor pro Source-Tabelle (created_at-based)
- Bei N>200 Items: dann erst Pagination-Refactor

## Filter-Spam-Prevention (Aggregation-Layer)

Wenn `lead_field_history` Score-Updates spammt (z.B. 5 in 1 Minute durch Algorithm-Trigger), sollte das **nicht** 5 separate Feed-Einträge ergeben. Aggregation-Layer:

```js
function aggregateScoreUpdates(items) {
  // Window 5 Min, gleicher field_name='lead_score' → zu einem Item kollabieren
  // Letzter new_value wins, erster old_value beibehalten
}
```

Phase 1 — ohne Aggregation (sehen ob's überhaupt ein Problem ist). Phase 2 — wenn User klagen.

## Sprint-Reihenfolge (Pflicht per CLAUDE.md)

1. **Doc-Review + Approve** (dieser File) — User-Sign-Off auf Scope, Empfehlung Option-3, Mock-Up
2. **Mock-Up validieren** (optional Screenshot/Skizze in PRs) — bevor Code geschrieben wird
3. **Hook + Merge-Logic** — `useLeadActivities(leadId)` in `src/hooks/`
4. **Render-Refactor** — `ActivityTab` von einzeltabellen-Pattern auf Unified-Items
5. **Smoke auf Staging** — alle 6 Source-Types triggern, Render verifizieren
6. **Cherry-Pick auf main** — Production

## Open Questions (für User-Review)

1. **Scope `lead_field_history`:** Welche `field_name`-Updates sind User-relevant?
   - Klar relevant: `status`, `deal_stage`, `owner_id`, `lead_score` (?)
   - Wahrscheinlich Spam: `updated_at`, `last_action_at`, jede Edit
   - **Vorschlag:** Whitelist von ~5 field_names, Rest weglassen

2. **Anonyme Actors:** Bei `lead_field_history.change_source = 'trigger'` oder `'edge_function'`:
   - Als „System" rendern mit generischem System-Avatar
   - Oder ausblenden falls actor leer

3. **`email_send_log`-Scope:** nur outgoing automated Emails? Oder auch incoming Replies (wenn die Tabelle das hat)?

4. **LinkedIn-Connection-Lifecycle:** `vernetzungen.status` ENUM-Werte unverified — welche Trigger ein „Connection accepted"-Event?

5. **Realtime-Updates:** Wenn ein Team-Member parallel eine Note hinzufügt — soll der Feed live aktualisieren oder erst beim Tab-Refresh? Existing `useLead` hat Realtime, könnte man auf den Feed erweitern.

6. **Tab-Count-Badge:** Soll die `Aktivitäten`-Tab-Zahl (`activity_count`) die unifizierte Summe aller 6 Quellen sein, oder weiter nur `activities`-Count?

## Aufwand-Schätzung

- Pre-Sprint (dieses Doc + User-Sign-Off): **0.5 Tag**
- Hook + Merge-Logic: **0.5 Tag**
- Render-Refactor (ActivityTab erweitern, ACTIVITY_VARIANTS ergänzen): **0.5 Tag**
- Smoke + Bugfixes: **0.5 Tag**
- Cherry-Pick + Prod-Smoke: **0.25 Tag**

**Total: ~2.25 Tage** für Phase 1 (Option 3, Client-Merge, ohne Filter-UI).

Filter-UI + Aggregation: +1 Tag in Phase 1.5 (optional).
