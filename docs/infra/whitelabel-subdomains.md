# Whitelabel-Subdomains — Infrastruktur & Roll-out

Pro Account eigenes Branding (Logo, Primärfarbe, Subdomain), freigeschaltet über das
Plan-Flag `plans.feature_whitelabel`. Gesteuert über `admin.leadesk.de/accounts`.

## Bausteine

| # | Baustein | Status (2026-06-11) | Ort |
|---|----------|---------------------|-----|
| 1 | DB-Schema `accounts.{logo_url,subdomain,primary_color}` + `plans.feature_whitelabel` | ✅ Staging + Prod | Migrationen `20260610100000`/`110000`/`120000` |
| 2 | Anon-sichere RPC `get_branding_by_subdomain(subdomain)` (nur logo/color/name, gegated auf feature_whitelabel + active/trialing) | ✅ Staging + Prod | `20260610100000` |
| 3 | Public Storage-Bucket `branding` (Logos pre-auth lesbar) | ✅ Staging + Prod | `20260610100000` |
| 4 | Admin-UI: Whitelabel-Tab (Subdomain/Logo/Farbe) + Plan-Toggle | ✅ Prod | Repo `leadesk-admin`, Commit `b6a7bda` |
| 5 | Customer-Resolver `loadTenantSettings()` → RPC | ✅ Staging + Prod | `src/lib/whitelabel.js` |
| 6 | Auth-Redirects Subdomain-erhaltend (`authRedirect()`) | ✅ Prod | `src/lib/authRedirect.js`, Login/Settings |
| 7 | GoTrue Redirect-Allowlist `*.leadesk.de` | ✅ Staging + Prod | Host-`.env` (NICHT im Repo) — siehe `docs/auth/gotrue-redirect-allowlist.md` |
| 8 | **Wildcard-DNS `*.leadesk.de` → App** | ⏳ **OFFEN** | DNS-Provider + Vercel-Domain/Routing |

## Was noch fehlt: Wildcard-DNS

`*.leadesk.de` muss auf die App (Vercel) zeigen, sonst laden gebrandete Subdomains
gar nicht. Bis dahin sind alle anderen Bausteine zwar live, aber ohne erreichbare
Subdomain wirkungslos. Reserved-Subdomains (app/admin/staging/www/api/… — siehe
`RESERVED_SUBDOMAINS` in `whitelabel.js` und die CHECK-Constraint in der Migration)
bekommen immer Default-Branding und dürfen nicht als Tenant-Subdomain vergeben werden.

## Sicherheits-Hinweise

- `get_branding_by_subdomain` ist SECURITY DEFINER, gibt NUR Branding-Felder zurück
  (kein billing/notes/status) und ist an `anon` gegrantet (pre-auth Login-Seite).
- `branding`-Bucket ist `public=true` (Logos vor Auth lesbar); Write nur für
  `is_leadesk_admin`.
- Subdomain wird serverseitig validiert (lowercase + Format-Regex + Reserved-Liste +
  Plan-Gate + Uniqueness) sowohl per DB-CHECK als auch in `update_account_with_audit`.
