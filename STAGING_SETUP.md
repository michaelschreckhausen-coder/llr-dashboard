# Staging Setup

## Branches
- `main` → app.leadesk.de (Production)
- `develop` → staging.leadesk.de (Staging)

## Vercel Environment Variables

### Production (main)
- VITE_SUPABASE_URL = https://jdhajqpgfrsuoluaesjn.supabase.co
- VITE_SUPABASE_ANON_KEY = [production key]
- VITE_APP_ENV = production

### Preview (develop)
- VITE_SUPABASE_URL = https://[STAGING_ID].supabase.co
- VITE_SUPABASE_ANON_KEY = [staging key]
- VITE_APP_ENV = staging

## Release-Workflow
1. Entwickle auf `develop`
2. Teste auf staging.leadesk.de
3. Merge develop → main via Pull Request
4. Vercel deployt automatisch auf app.leadesk.de

## Schema-Änderungen
Neue Migrations-SQLs unter supabase/migrations/
Format: YYYYMMDDHHMMSS_beschreibung.sql
