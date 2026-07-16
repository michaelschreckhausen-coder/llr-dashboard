# Runbook — LinkedIn-Netzwerk aus der Inbox lösen

> Sprint 2026-07-16 · betrifft **alle Teams mit Unipile-Anbindung**

## Was war das Problem

`import-unipile-relations` schrieb das **komplette 1st-degree-Netzwerk** jedes verbundenen
LinkedIn-Accounts nach `linkedin_inbox` mit `review_status='new'` — also in die Triage-Queue,
die eigentlich „das hier musst du bewerten" bedeutet.

Der Cron wurde am **07.07.** angelegt (`20260707200000`) und feuerte **ungegatet** für jeden
`status='OK'`-Account. Das Addon-Gate kam erst am **08.07. 12:00** (`20260708120000`) — also
**nach** dem 04:10-Lauf desselben Tages. Dieser eine Lauf reichte: bis zu 5000 Kontakte pro
Account in die Inbox, ohne dass jemand etwas angeklickt hat.

Dass in Horizonts Inbox „genau 500" standen, war zusätzlich irreführend — das ist der
`.limit(500)` in `LinkedInInbox.jsx:139`, nicht die echte Zahl.

## Was sich ändert

| | vorher | nachher |
|---|---|---|
| Ziel des Relations-Imports | `linkedin_inbox` (Triage) | `linkedin_network` (eigene Tabelle) |
| Menüpunkt | — (versteckt in der Inbox) | „Netzwerk" im LinkedIn-Bereich |
| Cron-Schedule | `'10 4 * * *'` (täglich) | `'0 * * * *'` (stündlich) |
| Addon-Gate | ja (seit 08.07.) | ja, unverändert |

### Der Cron-Schedule-Bug nebenbei

`20260708120000` baute eine Hash-Stunden-Staffelung ein:

```sql
AND (abs(hashtext(ua.unipile_account_id)) % 24) = extract(hour FROM now())::int
```

Das braucht einen **stündlichen** Cron. Geplant war weiter täglich 04:10. Effekt: Die Bedingung
ist nur für Accounts mit Hash-Stunde 4 erfüllt. Die Staffelung, die Last verteilen sollte, wurde
zum Filter. `20260716133000` korrigiert das.

**Verifiziert auf Prod 2026-07-16 — es war schlimmer als „1 von 24":** Die sieben OK-Accounts
haben die Hash-Stunden **5, 7, 15, 6, 21, 14, 7**. Hash-Stunde 4 hat **keiner**. Mit dem
`'10 4 * * *'`-Cron synkte also **kein einziger Account** — nicht einer von 24. Der
Relations-Import war seit dem 08.07. vollständig tot. Das erklärt, warum nach dem einen
ungegateten Lauf am 07.07. nichts mehr nachfloss: Die 10.765 Zeilen in den Inboxen stammen
sämtlich aus diesem einen Lauf.

**Folge für die Dringlichkeit:** Es fließt aktuell nichts nach. Der Rollout ist nicht eilig.

**Folge für den Prod-Effekt:** Nach dem Fix syncen **5 von 7** Accounts (zwei sind durch das
`automation`-Addon-Gate zu). Das ist ein Sprung von 0 auf 5 — der erste Lauf nach dem
Re-Enable zieht pro Account bis zu 5000 Relations. Verteilt über die Hash-Stunden 5, 6, 7, 14, 15
(zwei Accounts teilen sich Stunde 7). Kein DB-Problem, aber ein realer Unipile-API-Burst.

---

## Apply-Reihenfolge

> ⚠️ Die Reihenfolge ist nicht kosmetisch. Wird der Cron nicht **zuerst** gestoppt, füllt der
> nächste Lauf die Inbox wieder auf, während die Move-Migration läuft.

Alles zuerst auf **Staging**, dann Prod.

### 1 — Cron stoppen

```bash
ssh leadesk-staging 'docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' \
  < supabase/migrations/20260716120000_stop_relations_auto_import.sql
```

Kontrolle — muss 0 Rows liefern:
```sql
SELECT jobname, schedule FROM cron.job WHERE jobname='import-unipile-relations';
```

### 2 — Tabelle + RPC

```bash
ssh leadesk-staging 'docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' \
  < supabase/migrations/20260716130000_linkedin_network_table.sql
ssh leadesk-staging 'docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' \
  < supabase/migrations/20260716131000_network_upsert_rpc.sql
```

Pre-Flight vorher (Migration setzt `user_in_team` voraus):
```sql
SELECT proname FROM pg_proc WHERE proname='user_in_team';
```

### 3 — Backup, dann Daten verschieben

```bash
# Backup ZUERST — Schritt 3 löscht Rows.
ssh leadesk-staging "docker exec supabase-db pg_dump -U supabase_admin -d postgres \
  -t public.linkedin_inbox --data-only" > linkedin_inbox-backup-$(date +%Y%m%d-%H%M).sql

ssh leadesk-staging 'docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' \
  < supabase/migrations/20260716132000_migrate_relations_inbox_to_network.sql
```

**Was gelöscht wird:** nur `source='unipile_relations'` + `review_status='new'` + kein
`promoted_lead_id` + **kein** Outreach/Listen-Bezug.

**Warum so eng:** `linkedin_inbox` hängt an vier Tabellen mit `ON DELETE CASCADE` —
`connection_queue`, `automation_campaign_leads`, `automation_jobs`, `inbox_list_members`.
Ein pauschales `DELETE` reißt laufende Kampagnen und kuratierte Listen still mit. Was der User
angefasst hat, bleibt in der Inbox stehen und existiert zusätzlich im Netzwerk. Die Verifikations-
Queries am Ende der Migration listen jede Ausnahme mit Grund.

`linkedin_inbox.promoted_lead_id → leads(id) ON DELETE SET NULL` — das Löschen läuft **nicht**
in die `leads`-Tabelle. Leads bleiben unangetastet.

### 4 — Edge Function deployen

```bash
scp -r supabase/functions/import-unipile-relations \
  leadesk-staging:/opt/supabase/docker/volumes/functions/

# Pflicht — Top-Fallstrick #11. Strukturelle Änderung (anderer RPC, andere Signatur)
# → Deno hält sonst die alte compiled Version im Isolate-Cache.
ssh leadesk-staging "docker restart supabase-edge-functions"
```

### 5 — Testlauf gegen EINEN Account

```sql
-- Kandidat holen:
SELECT unipile_account_id, team_id FROM public.unipile_accounts
WHERE status='OK' AND team_id IS NOT NULL LIMIT 1;
```

```bash
curl -X POST https://supabase-staging.leadesk.de/functions/v1/import-unipile-relations \
  -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" \
  -d '{"unipile_account_id":"<ID>","max_pages":1}'
```

Danach **beide** prüfen:
```sql
SELECT count(*) FROM public.linkedin_network;                                  -- > 0 erwartet
SELECT count(*) FROM public.linkedin_inbox
WHERE source='unipile_relations' AND review_status='new';                      -- muss 0 BLEIBEN
```

Die zweite Query ist die wichtige: Sie beweist, dass der neue Code wirklich läuft und nicht der
gecachte alte.

### 6 — Erst jetzt Cron wieder an

```bash
ssh leadesk-staging 'docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' \
  < supabase/migrations/20260716133000_relations_cron_hourly_reenable.sql
```

> ⚠️ **Auf Staging danach wieder abschalten.** Der Staging-Unipile-Account
> (`NyMclY_XRz-Nh2FvYwTM8g`, Hash-Stunde 14) ist **dieselbe reale LinkedIn-Identität** wie ein
> Prod-Account — verifiziert 2026-07-16. Bleibt der Staging-Cron scharf, ziehen nach dem
> Prod-Re-Enable **zwei Umgebungen täglich dieselbe LinkedIn-Identität** über dieselbe
> Unipile-account_id. Doppelter API-Verbrauch, und LinkedIn sieht den Traffic als eine Identität.
>
> Für den Test reicht:
> ```sql
> -- Schedule prüfen, Lauf abwarten (Hash-Stunde 14 UTC), Ergebnis prüfen, dann:
> SELECT cron.unschedule('import-unipile-relations');
> ```
> Der Verifikationswert von Schritt 6 auf Staging ist ohnehin gering — er beweist nur, dass die
> Schedule-Zeile korrekt steht. Den echten Beweis liefert Schritt 5.

### 7 — Frontend

`develop` pushen → Staging (~30-45 s) → Hard-Refresh (`Cmd+Shift+R`) → `/linkedin-netzwerk`.

Prod-Merge nur auf explizite Anweisung.

---

## Offene Punkte

- **`.limit(500)` in `LinkedInInbox.jsx:139`** bleibt bestehen. Nach dem Cleanup fällt es nicht
  mehr auf, weg ist es nicht: Sobald eine Inbox echt >500 Einträge hat, ist der Rest unerreichbar
  — ohne jeden Hinweis in der UI. Eigener Fix (server-side Pagination wie in der neuen
  Netzwerk-Seite).
- **Anreicherung:** Relations liefern nur `provider_id`, `linkedin_url`, Name, Headline. Kein
  `job_title`/`company`/`location`. Die Netzwerk-Seite zeigt darum meist die Headline.
  `unipile-enrich` könnte das füllen — eigener Sprint. Der `COALESCE`-Merge in `network_upsert`
  ist bereits so gebaut, dass ein späterer dünner Sync-Lauf angereicherte Felder nicht platt macht.
- **`last_seen_at`** wird bei jedem Lauf gesetzt. Wer nicht mehr auftaucht, hat die Verbindung
  entfernt — als Signal auswertbar, aktuell ungenutzt.
- **Changelog-Eintrag** via SQL-Insert in `public.changelog` auf Hetzner-Prod nicht vergessen.
