# Deploy-Runbook — Public API (Staging zuerst)

> Wird vom Mac ausgeführt (Sandbox erreicht weder `~/dev` noch Hetzner-SSH).
> Reihenfolge strikt einhalten, zwischen den Schritten verifizieren.

## 0. Dateien ins Repo übernehmen

```bash
cd ~/dev/llr-dashboard
cp "<Projektordner>/public-api/migrations/20260702120000_public_api_foundation.sql" supabase/migrations/
mkdir -p supabase/functions/public-api
cp "<Projektordner>/public-api/functions/public-api/index.ts" supabase/functions/public-api/
```

## 1. Schema-Annahmen gegen echtes Repo verifizieren (Read-only)

Die Migration/EF wurde gegen das **Cloud-Staging-Schema** entworfen. Vor dem
Apply gegen Hetzner-Staging prüfen, dass die Spalten stimmen:

```bash
# gegen Hetzner-Staging (supabase_admin, siehe Memory-Konvention)
ssh root@178.104.210.216 "docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c \
 \"select column_name from information_schema.columns where table_schema='public' and table_name='api_keys' order by 1;\""
```

Insbesondere prüfen: `api_keys` existiert und hat `key_hash, team_id, expires_at`;
`leads/deals/organizations/content_posts/weekly_activity/team_members` vorhanden.
Bei Abweichung Migration anpassen, **nicht blind applien**.

## 2. Deno-Check (Pflicht — Build validiert Deno nicht)

```bash
deno check supabase/functions/public-api/index.ts   # muss exit 0
```

## 3. Migration auf Hetzner-STAGING applien

> Bestätigung einholen — schreibende DDL-Aktion.

```bash
ssh root@178.104.210.216 "docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1" \
  < supabase/migrations/20260702120000_public_api_foundation.sql
```

Verifikation:

```bash
ssh root@178.104.210.216 "docker exec -i supabase-db psql -U supabase_admin -d postgres -c \
 \"select proname from pg_proc where proname in ('create_api_key','create_oauth_client','api_rate_check','revoke_api_key');\""
# 4 Zeilen erwartet
```

## 4. Edge Function auf STAGING deployen

> Bestätigung einholen — Live-Deploy. Deploy-Weg wie bei den übrigen 14 EFs
> (Supabase CLI gegen Self-Host bzw. bestehendes Deploy-Skript).

```bash
supabase functions deploy public-api --project-ref <staging> --no-verify-jwt
```

`--no-verify-jwt` ist wichtig: die Funktion authentifiziert selbst per API-Key/
OAuth, **nicht** per Supabase-JWT. Ohne das Flag blockt der Gateway anonyme Calls.

## 5. Smoke-Test (Staging)

```bash
BASE=https://staging.supabase.leadesk.de/functions/v1/public-api

# 5.1 Testschlüssel erzeugen (als eingeloggtes Team-Mitglied, via SQL)
ssh root@178.104.210.216 "docker exec -i supabase-db psql -U supabase_admin -d postgres -c \
 \"select api_key from create_api_key('<staging-team-uuid>','smoke-test');\""
# ACHTUNG: create_api_key nutzt auth.uid(); direkter psql-Aufruf hat keine.
# Für den Smoke daher entweder aus der App heraus erzeugen ODER temporär
# per direktem INSERT mit vorab gehashtem Key (siehe unten).

KEY=lk_live_…

curl -s "$BASE/v1/contacts?limit=1" -H "X-API-Key: $KEY" | jq
curl -s "$BASE/v1/reports/summary"  -H "X-API-Key: $KEY" | jq
curl -s -X POST "$BASE/v1/contacts" -H "X-API-Key: $KEY" -H "content-type: application/json" \
     -d '{"first_name":"Smoke","last_name":"Test","email":"smoke@example.com","lead_source":"inbound"}' | jq
# ohne Key -> 401
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/v1/contacts"
```

Direkter Key-INSERT für Smoke (umgeht `auth.uid()`):

```sql
-- Klartext lokal wählen, Hash serverseitig bilden:
insert into api_keys (team_id, name, key_hash, key_prefix, scopes, rate_limit)
values ('<staging-team-uuid>', 'smoke',
        encode(digest('lk_live_SMOKEKEY123', 'sha256'), 'hex'),
        'lk_live_SMOK',
        '["contacts:read","contacts:write","deals:read","companies:read","content:read","reports:read"]'::jsonb,
        120);
-- danach mit X-API-Key: lk_live_SMOKEKEY123 testen, hinterher revoken/löschen.
```

## 6. Erst nach grünem Staging-Smoke → Prod

Gleiche Schritte gegen Prod-`db-01` (`128.140.123.163`) + Prod-EF-Deploy.
Changelog-Eintrag via SQL-Insert auf `admin.leadesk.de`-DB (Konvention).

## Rollback

- EF: vorige Version neu deployen bzw. Funktion entfernen.
- Migration ist additiv (nur `add column if not exists` + neue Tabellen). Bei
  Bedarf: neue Tabellen `drop`, hinzugefügte `api_keys`-Spalten `drop column`.
  Keine bestehenden Daten werden verändert.
