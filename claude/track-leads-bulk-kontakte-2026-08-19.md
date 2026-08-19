# Leads-Bulk „In LinkedIn-Kontakte" (2026-08-19)

> **Zwei Ablagen, keine vollständig.** Dieses Verzeichnis enthält nur die Tracks, die aus
> einer Claude-Code-Session ins Repo geschrieben wurden. Im claude.ai-Projekt liegen
> weitere Track-Dokumente (u. a. `track-cockpit-label-fix-2026-08-18`,
> `sync-coverage-befund`, `webhook-cross-env-befund`, `promote-sh-fix`,
> `briefing-juni-august`, `ONBOARDING-entwickler`) samt Projektbeschreibung. Wer nur das
> Repo klont, sieht die Hälfte. Umgekehrt sieht das Projekt die Repo-Tracks nicht.

Alle Zahlen gemessen, nicht abgeleitet. Ersatz für das fehlende Migrations-Ledger.

## Ziel

Auf `/leads` mehrere Leads in einem Zug als LinkedIn-Kontakte der **aktiven Marke**
übernehmen — alle mit LinkedIn-Profil. Mengenbasiert, nicht eine RPC pro Lead.

## Ausgangsbefund (Prod, 2026-08-19, read-only)

| Frage | Antwort |
|---|---|
| `source='crm_lead'`-Zeilen | **0** — der Einzel-Button hat noch nie eine Zeile erzeugt |
| Setzt `add_lead_to_inbox` die Marke? | **Nein** (an der laufenden Funktion geprüft, nicht am Migrations-File) |
| Leads gesamt / mit URL | VfL Bochum 1.027 / **1.024 aktiv mit URL**, dahinter M4Energy 143, Linkedin Consulting 85 … |
| Schon in der Team-Inbox | **1.102** Treffer, davon **23 ohne Marke**, über 8 Marken |

Die Null erklärt sich nicht durch Scheitern: für die probierten Leads existierte jeweils
schon eine Zeile aus einer anderen Quelle, also lief die Funktion in den
„schon vorhanden"-Zweig. Die Markenlücke ist real, hätte sich aber erst mit dem Bulk-Weg
gezeigt — dann sofort und in großer Zahl.

Nebenbefund, **eigener Track, nicht angefasst**: dieselbe Lücke haben `manual` (64 Zeilen,
0 mit Marke), `sales_nav` (77/9) und `extension_import` (46/5), während `linkedin_search`
(208/208) und `unipile_relations` (41.445/36.961) sauber sind. Der Brand-Scoping-Sweep vom
23.07. (`20260724203000`) hat mehrere Pfade nicht erfasst.

## Die RPC

`public.add_leads_to_inbox(p_brand_voice_id uuid, p_lead_ids uuid[] DEFAULT NULL,
p_dry_run boolean DEFAULT false) RETURNS jsonb`, `SECURITY DEFINER`,
`REVOKE ALL FROM public, anon` + `GRANT EXECUTE TO authenticated, service_role`.

Zähler: `total_candidates, created, brand_backfilled, resurfaced, skipped_no_url,
already_same_brand, already_other_brand, duplicate_url_in_batch, dry_run`.
`p_lead_ids = NULL` heißt: alle nicht archivierten Team-Leads mit URL, **server-seitig**
bestimmt — bewusst unabhängig davon, was `useLeads` geladen hat (PostgREST kappt, „alles
auswählen" ist nicht alles).

## Nicht offensichtliche Design-Entscheidungen

**1 · Zwei mengenbasierte Statements statt eines Upserts.**
`linkedin_inbox_team_url_uniq` ist **partiell**:
`(team_id, linkedin_url) WHERE linkedin_url IS NOT NULL AND sales_nav_id IS NULL`.
Zeilen **mit** `sales_nav_id` deckt er nicht ab. Ein reiner `ON CONFLICT`-Upsert hätte
neben einer bestehenden Sales-Navigator-Zeile mit derselben URL eine **zweite** Zeile
angelegt. Deshalb: ein `UPDATE … FROM` für vorhandene, ein `INSERT … SELECT` für neue,
`ON CONFLICT DO NOTHING` nur als Race-Guard. Die fachliche Dedup steckt im `NOT EXISTS`.
Es gibt auf der Tabelle noch zwei weitere Unique-Indizes (`team_snid_uniq`,
`team_provider_uniq`), die für diesen Pfad nicht greifen.

**2 · `DISTINCT ON (team_id, url)`.** Zwei Leads mit identischem Profil-Link träfen im
selben Statement zweimal dieselbe Konfliktzeile → „cannot affect row a second time".
Der Zähler `duplicate_url_in_batch` macht sichtbar, wie viele zusammengefasst wurden
(auf Staging real: 7 von 119).

**3 · Der Dedup-Key ist team-weit, nicht markenweit.** Daraus folgt die wichtigste Regel:
liegt der Kontakt schon unter einer **anderen** Marke im Team, bleibt er unangetastet
(`already_other_brand`). Ein Umschreiben würde ihn der Nachbarmarke wegnehmen. **Nur**
`brand_voice_id IS NULL` wird auf die Zielmarke nachgetragen — das ist die Reparatur der
Altlast. Resurface (promoted/dismissed → `new`) wie in `20260710240000`.

**4 · Guard ohne Scope-OR.** Geschrieben wird nur in Leads eigener Teams
(`get_my_team_ids()`), für die Marke gilt `has_brand_access`. **Kein**
automation/network-Scope-OR: die Begründung aus `20260811190000_linkedin_scopes_C2_rpc_scope`
gilt unverändert — ein geteiltes Team dürfte sonst in eine **fremde** Inbox schreiben.
Bewusst **nicht** zusätzlich `bv.team_id = lead.team_id` verlangt; das bräche den
dokumentierten Agentur-Fall (Kontakte und Marke in verschiedenen Teams). Das Schreibziel
bleibt in jedem Fall das eigene Team.

**5 · `GET DIAGNOSTICS` für `created`.** Im Schreiblauf wird der aus dem Vorzustand
geschätzte Wert durch die tatsächlich geschriebene Zeilenzahl ersetzt; im Dry-Run bleibt
die Schätzung stehen — genau das zeigt der Dialog an.

**6 · `DROP TABLE IF EXISTS` vor den TEMP TABLEs.** `ON COMMIT DROP` räumt erst beim
Commit auf; zwei Aufrufe in **derselben** Transaktion scheiterten an „relation `_cand`
already exists". Im Frontend sind Dry-Run und Schreiblauf getrennte Requests, im
psql-Test nicht — und ein Aufrufer darf das dürfen. Gleiches Muster wie
`la_campaign_save_steps` mit `_la_remat`.

**7 · Namens-Ableitung.** Vor+Nachname → `leads.name` → `'Unbekannt'`. Die alte
`add_lead_to_inbox` kannte nur `first_name`/`last_name` und schrieb für Leads, die ihren
Namen nur in `leads.name` tragen, sichtbar „Unbekannt" in die Kontakte-Liste.

## Beide Fehler wurden erst im Staging-Test gefunden

Punkt 6 und Punkt 7 sind keine Vorab-Überlegungen, sondern Ergebnisse des Testlaufs.
Ohne den Test wären beide auf Prod gegangen: der eine als Fehlschlag bei doppeltem
Aufruf, der andere als „Unbekannt" in der Kontakte-Liste jedes so übernommenen Leads.

## Testfallstrick: `has_brand_access`

Der erste Testlauf scheiterte mit `forbidden` — **kein Fehler der Funktion**.
`has_brand_access` verlangt „Team-Mitglied **und** (Eigentümer **oder** `is_shared`)".
Auf Staging gehört die Marke „Michael Schreck" (`a994019e`) laut `brand_voices.user_id`
dem User **julian@leadesk.de** und ist `is_shared = false`. Michael ist im selben Team,
aber nicht Eigentümer → korrekt abgelehnt. Getestet wurde daraufhin als Julian.
Wer diese RPC testet, muss Aufrufer und Zielmarke zusammenpassend wählen.

## Staging-Verifikation (Team „Leadesk Staging", impersoniert)

| Test | Dry-Run | Schreiblauf | zweiter Lauf |
|---|---|---|---|
| ein Lead | created 1 | identisch | **created 0**, already_same_brand 1 |
| Auswahl aus 4 | created 1, resurfaced 1, skipped_no_url 1, already_same_brand 2, total 4 | identisch | created 0, already_same_brand 3 |
| fremde Marke | — | already_other_brand 1, created 0 | — |
| `p_lead_ids = NULL` | total 119 → created 107, resurfaced 1, skipped_no_url 1, already_same_brand 4, duplicate_url_in_batch 7 | identisch | **created 0**, already_same_brand 111 |

Summe geht auf: 107 + 4 + 7 + 1 = 119.

Drei Nachweise: (1) 109 `crm_lead`-Zeilen, davon **109 mit Marke** und **109 mit
`review_status='new'`**; (2) die Zeile einer fremden Marke trug `a994019e` **vor und nach**
dem Lauf; (3) `inbox_feed(marke,'kontakte')` liefert unter Impersonation 271 Zeilen,
davon 109 `crm_lead` — die Query, an der die Kontakte-Liste hängt.

## Staging-Rückstände

Die **109** `crm_lead`-Zeilen bleiben in Stagings Kontakte-Liste und zählen bei künftigen
Coverage-Messungen mit. Eine davon heißt „Unbekannt" (vor dem Namens-Fix geschrieben).
Schonender Weg zum Aufräumen: `review_status='dismissed'` statt `DELETE` — dann
verschwinden sie aus der Ansicht und der Dedup-Pfad bleibt intakt. **Wartet auf ein
Scope-Wort.**

## Offener Prod-Ablauf

1. **`los prod-apply`** → `20260819090000_leads_bulk_to_inbox.sql` auf `128.140.123.163`,
   `psql -U supabase_admin -v ON_ERROR_STOP=1`. Verify: Signatur, `prosecdef`, ACL ohne
   PUBLIC, `add_lead_to_inbox` unverändert vorhanden.
2. **`freigeben`** → file-scoped Promote per `scripts/promote.sh --main-only` von
   `src/pages/Leads.jsx`, `src/pages/LeadDetail.jsx` und den **beiden** Migrations-Dateien.
   Danach Prod-Bundle-Marker prüfen.
3. **Changelog** auf Prod-Hetzner, vorbereitet als `~/changelog-leads-bulk-PENDING.sql`:
   `type='feat'` (jüngster Feature-Typ im Bestand, 12.08.; `feature` seit 30.07. unbenutzt),
   `affected={Kontakte,CRM,LinkedIn}` (`{Kontakte,CRM}` existiert 8× im Bestand),
   `author='Claude (Session)'`, 8-stelliger Kurz-SHA, `version` leer,
   `WHERE NOT EXISTS`-Guard.
4. **Der erste echte Bulk-Lauf gehört in die Oberfläche, nicht in psql.** Die RPC nimmt
   die Marke als UUID-Parameter — eine getippte oder kopierte UUID ist genau die Stelle,
   an der 1.024 Kontakte in der falschen Marke landen, und das Aufräumen wären 1.024
   Zeilen. In der UI wählt die aktive Marke sich selbst, der Dialog zeigt die Zahl, und
   beides wird zusammen bestätigt. **Auf Prod läuft die RPC vorher nicht — auch nicht als
   Dry-Run.**

Erwartung für „Alle mit LinkedIn-Profil" bei VfL Bochum: rund **1.024** Kandidaten. Weicht
die Zahl im Dialog deutlich ab, ist das ein Grund abzubrechen, nicht durchzuklicken.

## Nicht angefasst

`useLeads` (falls dort ein serverseitiges Limit auffällt: melden, nicht fixen),
`add_lead_to_inbox` (bleibt in der DB, wird nur nicht mehr gerufen — `git grep` findet nur
noch Kommentare), die Markenlücke in `manual`/`sales_nav`/`extension_import`,
`linkedin_inbox_team_url_uniq`. Kein neuer Index, keine Tabellen-Änderung.

## Commits (alle auf `develop`)

- `819f796c` — Feature: RPC-Migration + Rollback, BulkBar-Aktion, Dialog, Ergebnis-Karte,
  Einzel-Button auf dieselbe RPC
- `d03cd695` — Kommentar in `LeadDetail.jsx` nachgezogen
- `b1e3e073` — TEMP-TABLE-Guard + Namens-Ableitung (beide aus dem Staging-Test)
