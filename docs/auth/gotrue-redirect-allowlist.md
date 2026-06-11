# GoTrue Redirect-Allowlist (Whitelabel-Subdomains)

Damit OAuth (LinkedIn), Passwort-Reset und Identity-Linking nach dem GoTrue-Roundtrip
auf der **richtigen** (ggf. gebrandeten) Origin landen, muss die Ziel-URL in der GoTrue
Redirect-Allowlist stehen. Andernfalls fällt GoTrue auf die Default-`SITE_URL`
(`app.leadesk.de`) zurück — der User verliert die Tenant-Subdomain.

## Zwei Seiten

1. **Frontend:** alle `redirectTo` über den Helper `src/lib/authRedirect.js`
   (`authRedirect(path)` → `${window.location.origin}${path}`) bauen. Nie eine fixe
   Domain hardcoden — sonst ist Whitelabel kaputt.
2. **Backend (GoTrue):** `ADDITIONAL_REDIRECT_URLS` in der jeweiligen
   `/opt/supabase/docker/.env` auf dem Hetzner-Host. **Diese Config liegt NICHT im
   Repo** — ein `.env`-Rebuild verliert die Wildcards und bricht Whitelabel-OAuth.

## Aktuelle Werte (Stand 2026-06-11)

| Host | `ADDITIONAL_REDIRECT_URLS` |
|------|----------------------------|
| Prod (`128.140.123.163`) | `https://app.leadesk.de,https://app.leadesk.de/**,https://admin.leadesk.de,https://admin.leadesk.de/**,https://*.leadesk.de,https://*.leadesk.de/**` |
| Staging (`178.104.210.216`) | `https://app.leadesk.de/**,https://admin.leadesk.de/**,https://*.leadesk.de/**` |

`*` matcht ein Subdomain-Label, `**` einen beliebigen Pfad (GoTrue-Glob).

## Ändern

```bash
ssh root@<HOST> '
  cd /opt/supabase/docker && cp .env .env.bak.$(date +%s) &&
  grep -n ADDITIONAL_REDIRECT_URLS .env &&
  sed -i "s#^ADDITIONAL_REDIRECT_URLS=.*#ADDITIONAL_REDIRECT_URLS=<NEUER_WERT>#" .env &&
  grep -n ADDITIONAL_REDIRECT_URLS .env &&
  docker compose up -d auth   # Service-Key "auth" / Container "supabase-auth" — kurzer Auth-Downtime
'
```

Danach: `docker ps --filter name=supabase-auth` → `Up (healthy)`. Raw-curl auf
`/auth/v1/health` gibt `401` (Kong-apikey-Gate) — kein Fehler; der Container-Healthcheck
ist maßgeblich.

## Offene Voraussetzung

Branded-Subdomains funktionieren erst end-to-end, wenn **Wildcard-DNS** (`*.leadesk.de`)
auf die App routet — siehe `docs/infra/whitelabel-subdomains.md`.
