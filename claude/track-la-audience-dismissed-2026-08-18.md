# Aussortierte Kontakte in Listen-Zielgruppen (2026-08-18)

Ersatz für das fehlende Migrations-Ledger. Alle Zahlen gemessen, nicht abgeleitet.

Ausgelöst von Michaels Frage: „Die Liste zeigt in der Automatisierung 35 Datensätze,
obwohl sie nur noch 23 hat — woran liegt das?"

## Befund

Keine Inkonsistenz, zwei Populationen derselben Liste
(„Local Hero >51 Umkreis Arena", `2bfa9972-3584-47f8-aa05-af3d01554602`, Team FSV
Frankfurt 1899):

| `review_status` | Anzahl | wer nutzt das |
|---|---|---|
| `new` | 23 | `/linkedin-inbox` (`inbox_feed` filtert darauf) |
| `dismissed` | 8 | — in der Sichtung aussortiert |
| `promoted` | 4 | — ins CRM übernommen |
| Summe = `inbox_list_members` | **35** | die Automatisierung (`la-audience`, `kind='list'`) |

Die Mitgliedschaft überlebt die Sichtung absichtlich: wer eine Liste abarbeitet, soll sie
nicht schrumpfen sehen. `snoozed` existiert global 2×, in Listen 0× — gegenstandslos.

Fehler dahinter: `la-audience` löste `kind='list'` über **alle** Mitglieder auf, ohne
`review_status` anzusehen. Eine Kampagne auf diese Liste hätte die 8 bewusst
Aussortierten angeschrieben.

## Fix (Code)

`supabase/functions/la-audience/index.ts`: `.neq("review_status","dismissed")` **in jeder
Chunk-Iteration**. `promoted` bleibt drin — ein CRM-Lead ist ein legitimes Outreach-Ziel.
`review_status` ist `text NOT NULL DEFAULT 'new'` (gegen **beide laufenden DBs** geprüft,
nicht gegen das Migrations-File) → `.neq()` verschluckt keine NULL-Zeilen.

Wirkung per SQL belegt, ohne Live-Lauf: FSV-Liste **35 → 27**. Über alle 22
Listen-Zielgruppen: 3.937 Mitglieds-Zeilen, **−32**, ausschließlich FSV. Keine aktive
Kampagne ändert sich.

**Datei-Drift (zweite Runde am selben Tag):** `la-audience/index.ts` war auf `main` weiter
als auf `develop` — Prod hatte die gechunkte Variante (HTTP-414-Fix bei >120 IDs).
Reihenfolge daher: erst `git checkout origin/main -- <datei>`, dann filtern. Ohne das
hätte ein file-scoped Promote den 414-Fix zurückgedreht; die drei größten Listen-
Zielgruppen haben 782, 658 und 520 Mitglieder und hätten still 0 Personen geliefert.

Commit: `f65b3c6c` auf `develop`. **Noch nicht deployed** (weder Staging noch Prod) —
auf Prod gilt bis zum Deploy weiterhin die 35.

## Datenkorrektur auf Prod (128.140.123.163)

Ein Zielgruppen-Lauf **vor** dem Filter hatte alle 35 eingeschrieben. 7 der 8
Aussortierten waren darunter, alle `state='active'` mit je einem `pending` `invite`-Job
(frühester fällig 2026-08-18 20:41 UTC) — inert nur, weil `la_claim_jobs` auf
`c.status='active'` filtert und die Kampagne `draft` ist.

Verifiziert vorab:
- `la_claim_jobs` prüft `j.state='pending'`, `j.scheduled_at <= now()`, `c.status='active'`
  und **nicht** `e.state`. Ein Enrollment auf `stopped` zu setzen verhindert den Versand
  also nicht; wirksam ist ausschließlich `la_jobs.state='skipped'`.
- `la_jobs_state_check` erlaubt `'skipped'` bereits, `la_enrollments_state_check` erlaubt
  `'stopped'` → kein DDL.
- `la-audience` dedupt gegen alle bestehenden Enrollments ohne State-Filter, die
  gestoppten also mit. Ein Zielgruppen-Lauf schreibt sie nicht neu ein.

Freigabe Michael am 2026-08-18 (`los prod-apply` + `ok` nach Zeilen-Preview). Ausgeführt
in **einer** Transaktion, Zielmenge in `TEMP TABLE ... ON COMMIT DROP` materialisiert,
mit Abbruch-Guard bei ≠ 7 Zeilen, beide UPDATEs mit Zustands-Guard:

```sql
UPDATE la_jobs        SET state='skipped', updated_at=now() WHERE enrollment_id IN (…) AND state='pending';
UPDATE la_enrollments SET state='stopped', updated_at=now() WHERE id            IN (…) AND state='active';
```

Ergebnis: `UPDATE 7` / `UPDATE 7`. Kampagne „Neue Kampagne" (`draft`): **35 Enrollments,
28 aktiv, 7 gestoppt, 28 pending Jobs** (vorher 35/35/0/35). Gegenprobe nach dem COMMIT,
unabhängig von der TEMP TABLE: 7 Zeilen, alle `stopped` / `skipped`. Zweiter Lauf:
`UPDATE 0` / `UPDATE 0` → idempotent. Nichts gelöscht, keine Kampagne gestartet, kein
`la-audience`-Testlauf (der schriebe Enrollments und materialisierte Jobs).

Skript: `~/prod-skip-dismissed-2026-08-18.sql` (leitet die Menge selbst ab, keine
hardcodierten IDs).

## Offen

- **Der achte Aussortierte bleibt eingeschrieben.** Bei ihm lässt sich aus `linkedin_url`
  keine passende `public_identifier` ableiten, der Match greift nicht. Von den 28 aktiven
  Enrollments ist damit eines ein aussortierter Kontakt. Braucht einen zweiten
  Identifikator (Name oder Profil-URL), nicht raten.
- **Deploy `la-audience`** steht aus: SCP nach
  `/opt/supabase/docker/volumes/functions/la-audience/`, danach
  `docker compose restart functions` (Service-Key `functions`, **nicht** der
  container_name `supabase-edge-functions`; Fallstrick #11, die Query-Struktur ändert
  sich). Wartet auf `los staging-apply` / `freigeben`.
- Bereits eingeschriebene `dismissed` in anderen Kampagnen: durch die Gesamtmessung
  (−32 ausschließlich bei FSV) ausgeschlossen.

## Korrektur einer Fehlmessung

Meine erste Zählung ergab **0** bereits eingeschriebene Verworfene und war methodisch
falsch: Join über `provider_id`, aber die Enrollments dieser Kampagne tragen 0×
`provider_id` und 35× `public_identifier`, während `linkedin_inbox` gar keine
`public_identifier`-Spalte hat. Erst der Match über die aus `linkedin_url` abgeleitete ID
(`substring(… from '/in/([^/?#]+)')`, dieselbe Logik wie `publicIdFromUrl` in der
Function) trifft. Korrigiert **vor** der Entscheidung; die Entscheidungsgrundlage war
richtig.

Der in der Berichterstattung zitierte Satz „es ist noch nichts eingeschrieben" steht
**nicht** in `f65b3c6c` — die Commit-Message sagt dort „Keine aktive Kampagne ist
betroffen", was zutrifft (die betroffene Kampagne ist `draft`).
