# Migrations-CI — Einmalige Einrichtung

Der Workflow `.github/workflows/db-migrations.yml` wendet neue `supabase/migrations/*.sql`
automatisch an: **develop → Staging** (automatisch), **main → Prod** (hinter Freigabe-Gate).
Damit entfällt das manuelle SSH/psql. Folgende Einrichtung ist **einmal** nötig.

## 1. Dedizierten Deploy-Key erzeugen (auf Michaels Mac)

Eigener Key nur für die CI — getrennt von persönlichen Keys, ohne Passphrase:

```
ssh-keygen -t ed25519 -f ~/.ssh/leadesk-deploy -C "gh-actions-migrations" -N ""
```

Ergibt `~/.ssh/leadesk-deploy` (privat) + `~/.ssh/leadesk-deploy.pub` (öffentlich).

## 2. Public-Key auf BEIDE Server eintragen

Der Runner muss sich an Staging **und** Prod als `root` anmelden können.

```
# Staging (Michael, Key ist dort schon autorisiert):
cat ~/.ssh/leadesk-deploy.pub | ssh leadesk-db-01 'cat >> ~/.ssh/authorized_keys'

# Prod (Julian, hat Prod-Zugang):
cat ~/.ssh/leadesk-deploy.pub | ssh root@128.140.123.163 'cat >> ~/.ssh/authorized_keys'
```

## 3. Privaten Key als GitHub-Secret hinterlegen

**Niemals** in den Code/Chat — nur als Repo-Secret. Per GitHub-CLI:

```
gh secret set HETZNER_DEPLOY_KEY < ~/.ssh/leadesk-deploy
```

oder im Browser: Repo → **Settings → Secrets and variables → Actions → New repository secret**,
Name `HETZNER_DEPLOY_KEY`, Inhalt = kompletter privater Key (inkl. `-----BEGIN/END-----`).

## 4. Prod-Freigabe-Gate einrichten (Hard-Rule!)

Repo → **Settings → Environments → New environment → `production`** →
unter **Protection rules** „**Required reviewers**" aktivieren und Michael (+Julian) eintragen → speichern.

Damit pausiert jede Prod-Migration im Actions-Tab, bis ein Reviewer auf **„Review deployments → Approve"** klickt — das ist die explizite Bestätigung gemäß CLAUDE.md. **Ohne dieses Environment würde die Prod-Migration automatisch laufen** — also unbedingt einrichten.

## 5. Fertig — so läuft es ab

- Migration als `supabase/migrations/YYYYMMDDHHMMSS_*.sql` committen, auf **develop** pushen
  → Staging-Job wendet automatisch nur die **neu hinzugekommenen** Dateien an + lädt den PostgREST-Cache neu.
- Beim Promote auf **main** wartet der Prod-Job auf deine Freigabe im Actions-Tab, dann wendet er dieselben Migrationen auf Prod an.

Es werden je Push nur die in diesem Push **neu** hinzugefügten Migrationsdateien angewandt
(`git diff --diff-filter=A`), chronologisch sortiert. Bestehende Migrationen werden nicht erneut ausgeführt.

## Hinweis

Damit der **main**-Trigger greift, muss der Workflow auch auf `main` liegen — er kommt über den
normalen Merge/Cherry-Pick-Flow dorthin. Auf `develop` ist er sofort aktiv.
