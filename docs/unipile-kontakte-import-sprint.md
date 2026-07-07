# Unipile-Kontakte-Import-Sprint — Design-/Migrations-Plan

> Kickoff-Input für eine frische Cowork-Session. Staging zuerst, Schritt für Schritt.
> Erstellt 2026-07-07 (Vorbereitung; Build in eigener Session).

## Leitidee
Pipeline `linkedin_inbox → promote → leads` bleibt. Nur der **Ingest** wandert Extension → Unipile-API.
**Kernentscheidung: `provider_id` + `linkedin_url` schon beim Ingest setzen** (Fix B am Ursprung) →
die Enrichment-Lücke (die für Team Horizont 2026-07-07 nachträglich gebackfillt werden musste,
siehe `~/dev/leadesk-backups/horizont-2026-07-07/` + [[project_leadesk_sales_nav_sync]]) entsteht gar nicht erst.

## Schritt 0 — Klärungen
### Read-only BEANTWORTET 2026-07-07 (beide günstig):
1. **✅ `/users/relations` liefert ALLES inline, paginiert per `cursor`:** `member_id` (= provider_id ACoAA…),
   `public_identifier`, `public_profile_url` (= fertige linkedin_url), first/last_name, headline, member_urn.
   → **KEIN N+1-Resolve nötig** → Relations-Auto-Sync ist billig (ein paginierter Durchlauf).
2. **✅ Unipile Sales-Nav-Search existiert:** `POST /api/v1/linkedin/search?account_id=X` mit Body
   `{"api":"sales_navigator","category":"people",...}` → HTTP 200, Items mit `id` (= ACwAA sales_nav_id, matcht
   Dedup-Index), `public_identifier`, `public_profile_url` (= linkedin_url), `profile_url` (sales/lead-URL).
   → **URL wird am Ursprung gesetzt, kein Enrichment mehr in KEINER Quelle.** (`/linkedin/search/parameters`
   existiert auch für Filter-Definitionen.) Nuance: Sales-Nav-`id` ist ACwAA (nicht ACoAA); provider_id für Fix B
   ggf. via `GET /users/{public_identifier}` nachziehen ODER Runner nutzt public_id (Fix A, URL ist ja da).

### Entscheidungen getroffen 2026-07-07 (Michael):
3. **Gating: Import FREI, Automatisierung bleibt gated.** Import (Relations-Sync + Sales-Nav) befüllt nur
   Inbox/CRM = Basis-Feature ohne Gate; das Handeln (visit/connect via Unipile-Runner) bleibt hinter dem
   automation-Addon (bestehender Gate `team_member_has_addon`/`i_have_addon`, unverändert). → Die Import-EFs
   bekommen KEINEN Addon-Gate.
4. **Extension-Import-Pfade: koexistieren (vorerst).** Unipile-Import additiv neben Extension-Single/-Sales-Nav.
   Kein Deprecate jetzt; später wenn Unipile sich bewährt.

## 1) Migration (additiv, Staging zuerst)
- `ALTER TABLE linkedin_inbox ADD COLUMN IF NOT EXISTS provider_id text` (ACoAA…). **Bestätigt fehlend 2026-07-07.**
- Partieller Unique-Index `(team_id, provider_id) WHERE provider_id IS NOT NULL` — neuer Dedup-Arbiter (analog snid/url).
- `source`-CHECK erweitern um `'unipile_relations'`, `'unipile_salesnav'` (falls CHECK existiert).
- 2. Migration evtl.: `leads.provider_id` (Promote-Zielspalte, damit der Runner Fix B nutzt).
- Kein Drop/Change an bestehenden Spalten/Indexen.

## 2) RPCs — wiederverwenden / minimal erweitern
| RPC | Rolle | Aktion |
|---|---|---|
| `sales_nav_upsert_inbox` | Inbox-Upsert (INSERT→review_status='new', UPDATE preserved promoted/dismissed) | **Erweitern** um `p_linkedin_url` + `p_provider_id` (COALESCE, nie NULL-Clobber). Ein Dedup-Pfad statt Schwester-RPC. |
| Promote-RPC (inbox→leads) | Promote | **Verifizieren**, dass sie linkedin_url + (neu) provider_id auf den Lead durchträgt. |
| `get_my_team_ids()` / `user_in_team()` | RLS/Team-Guard in EFs | wiederverwenden (Prod-bestätigt). |

## 3) EFs (SCP + `docker compose restart functions` — Service heißt `functions`)
- **`import-unipile-relations`**: `GET /users/relations?account_id=&cursor=` paginiert → Upsert mit
  url+provider_id, `source='unipile_relations'`. (Kosten je nach Schritt-0-Punkt 1.)
- **`import-unipile-salesnav`**: nur falls Unipile-Sales-Nav-Search existiert (Schritt-0-Punkt 2) → gleicher Ingest,
  url+provider_id am Ursprung. Sonst Extension-Hybrid.

## 4) Trigger
- **Relations:** pg_cron 1×/Tag, Wrapper-Fn (GUC + `net.http_post`, Muster `trigger_process_automation_jobs`),
  Accounts **gestaffelt** (LinkedIn-Limits), idempotent via Dedup-Indexe.
- **Sales-Nav/neue Kontakte:** On-Demand-Button (Frontend → EF-invoke).

## Build-Reihenfolge (nach Schritt 0)
Migration → `sales_nav_upsert_inbox` erweitern → EF Relations → Trigger → EF Sales-Nav. Jeder scharfe Schritt einzeln verifiziert, Staging→Prod.

## Referenzen
- Enrichment-Präzedenz + Unipile-Auflösung (`GET /users/{sales_nav_id}` → provider_id + public_identifier): [[project_leadesk_sales_nav_sync]]
- Unipile-Runner/Architektur: [[project_leadesk_unipile_automation]]
- EF-Deploy: [[feedback_hetzner_ef_deploy_pattern]]
