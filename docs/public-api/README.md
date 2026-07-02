# Leadesk Public API — Entwickler-Doku

Externe REST-Schnittstelle für Leadesk. Damit binden Fremdsysteme (Formulare,
Enrichment-Tools, Zapier/n8n, eigene Backends) Leadesk-CRM-Daten an.

- **Base-URL (Prod):** `https://supabase.leadesk.de/functions/v1/public-api`
- **Base-URL (Staging):** `https://staging.supabase.leadesk.de/functions/v1/public-api` *(URL ggf. anpassen)*
- **Version:** alle Endpoints unter `/v1/…`
- **Format:** JSON. Fehler immer als `{ "error": { "code", "message", "details" } }`.
- **Multi-Tenant:** jedes Credential gehört zu genau einem Team und sieht nur dessen Daten.

Maschinenlesbare Spec: [`openapi.yaml`](./openapi.yaml).

---

## 1. Authentifizierung

Zwei Verfahren, beide werden unterstützt:

### a) API-Key (empfohlen für Server-zu-Server / einfache Integrationen)

Key wird per RPC im Kontext eines Team-Mitglieds erzeugt und **nur einmal** im
Klartext zurückgegeben (danach nur noch der SHA-256-Hash gespeichert):

```sql
select * from create_api_key(
  p_team_id   => '<team-uuid>',
  p_name      => 'Zapier Prod',
  p_scopes    => '["contacts:read","contacts:write","deals:read"]'::jsonb,
  p_rate_limit=> 120
);
-- -> id | api_key = lk_live_xxxx…  (JETZT kopieren) | key_prefix = lk_live_xxxx
```

Verwendung — eine der beiden Header-Varianten:

```
X-API-Key: lk_live_xxxx…
Authorization: Bearer lk_live_xxxx…
```

Widerrufen: `select revoke_api_key('<key-uuid>');`

### b) OAuth2 Client-Credentials (für Integrationspartner)

Client erzeugen:

```sql
select * from create_oauth_client(
  p_team_id => '<team-uuid>',
  p_name    => 'Partner XY',
  p_scopes  => '["contacts:read","deals:read"]'::jsonb
);
-- -> id | client_id = lk_client_… | client_secret = lk_secret_…  (JETZT kopieren)
```

Token holen (gültig 1 h):

```bash
curl -X POST "$BASE/v1/oauth/token" \
  -H "content-type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"lk_client_…","client_secret":"lk_secret_…"}'
# -> { "access_token":"lk_at_…", "token_type":"Bearer", "expires_in":3600, "scope":"…" }
```

Dann: `Authorization: Bearer lk_at_…`

### Scopes

`contacts:read` · `contacts:write` · `companies:read` · `companies:write` ·
`deals:read` · `deals:write` · `content:read` · `content:write` · `reports:read`

Wildcard `*` erlaubt alles. Fehlt der Scope → `403 forbidden`.

---

## 2. Ressourcen

| Ressource | Tabelle | Endpoints |
|---|---|---|
| `contacts` | `leads` | list / create / get / patch / delete |
| `companies` | `organizations` | list / create / get / patch / delete |
| `deals` | `deals` | list / create / get / patch / delete |
| `content` | `content_posts` | list / create / get / patch / delete |
| `reports` | Aggregat | `GET /v1/reports/summary` |

### Listing, Pagination & Filter

`GET /v1/contacts?limit=50&offset=0&q=müller&status=connected`

- `limit` (Default 50, max 200), `offset` (Default 0)
- `q`: Volltext (contacts: name/email/company, companies: name, deals: title)
- `status` (contacts), `stage` (deals)

Antwort:

```json
{ "data": [ … ], "pagination": { "limit": 50, "offset": 0, "total": 231 } }
```

### Beispiele

Kontakt anlegen:

```bash
curl -X POST "$BASE/v1/contacts" \
  -H "X-API-Key: $KEY" -H "content-type: application/json" \
  -d '{"first_name":"Anna","last_name":"Müller","email":"anna@acme.de",
       "company":"ACME","lead_source":"website","status":"new",
       "tags":["inbound","webinar"]}'
```

Deal aktualisieren:

```bash
curl -X PATCH "$BASE/v1/deals/<id>" \
  -H "X-API-Key: $KEY" -H "content-type: application/json" \
  -d '{"stage":"verhandlung","probability":60,"value":12000}'
```

Report:

```bash
curl "$BASE/v1/reports/summary" -H "X-API-Key: $KEY"
```

---

## 3. Erlaubte Felder & Enums

**Schreibbare Felder** (alles andere wird ignoriert):

- **contacts:** `first_name, last_name, name, email, phone, linkedin_url, profile_url, headline, job_title, company, industry, city, country, status, lifecycle_stage, lead_source, tags, notes, organization_id`
  - **Hinweis `status`:** Das API-Feld `status` (Enum unten) wird auf die DB-Spalte `lead_status` gemappt (Lese- **und** Schreibweg). Die separate deutsche Qualifizierungsstufe (`Lead/LQL/MQL/MQN/SQL`) kommt in Lese-Antworten als **read-only** Feld `qualification` zurück und ist über diese API nicht schreibbar.
- **companies:** `name`(Pflicht)`, website, linkedin_company_url, email_central, phone_central, street, zip, city, state, country, industry_slug, notes`
- **deals:** `title`(Pflicht)`, description, value, currency, stage, probability, expected_close_date, lead_id, organization_id, custom_fields`
- **content:** `title, content, type, status, scheduled_at, published_at, platform, metadata`

**Enum-Werte:**

- `contacts.status`: `new, open, in_progress, open_deal, unqualified, attempted_to_contact, connected, bad_timing`
- `contacts.lead_source`: `linkedin, website, referral, cold_outreach, event, import, inbound, paid_social, organic_search, other`
- `contacts.lifecycle_stage`: `subscriber, lead, marketing_qualified, sales_qualified, opportunity, customer, evangelist, other`
- `deals.stage`: `kein_deal, prospect, opportunity, angebot, verhandlung, gewonnen, verloren, stage_custom1, stage_custom2, stage_custom3`

Ungültiger Enum-Wert → `422 validation_error`.

---

## 4. Rate Limiting

Pro Credential, fixes 60-Sekunden-Fenster, Default **120 Req/min** (pro Key
konfigurierbar). Header bei jeder Antwort:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 118
X-RateLimit-Reset: 1751457600   # Unix-Sekunden
```

Überschreitung → `429 rate_limited`.

---

## 5. Fehler-Codes

| HTTP | `code` | Bedeutung |
|---|---|---|
| 400 | `invalid_request` | fehlerhafte Anfrage / fehlende id |
| 401 | `unauthorized` | Credential fehlt/ungültig/abgelaufen |
| 403 | `forbidden` | Scope fehlt |
| 404 | `not_found` | Ressource oder Route unbekannt |
| 405 | `method_not_allowed` | Methode auf Ressource nicht erlaubt |
| 422 | `validation_error` | Pflichtfeld/Enum ungültig |
| 429 | `rate_limited` | Rate Limit überschritten |
| 500 | `internal_error` / `db_error` | Serverfehler |

---

## 6. Versionierung & Audit

- Breaking Changes nur über neuen Pfad-Präfix (`/v2/…`). `/v1` bleibt stabil.
- Jeder Request wird in `api_request_log` protokolliert (Credential, Team,
  Methode, Pfad, Status, IP) — für Debugging und Missbrauchserkennung.
- `api_keys.last_used_at` / `oauth_clients.last_used_at` zeigen letzte Nutzung.
