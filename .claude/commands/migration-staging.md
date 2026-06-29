---
description: Apply the most recent (or specified) migration file to the Hetzner staging DB and verify
argument-hint: [migration-filename] (optional — defaults to most recent in supabase/migrations/)
---

Apply migration to Hetzner staging DB.

If $ARGUMENTS is empty, find the most recent file in `supabase/migrations/` (by filename timestamp) and use it.
If $ARGUMENTS is given, use that filename (looking inside `supabase/migrations/`).

Then:
1. Show the SQL content briefly so I can confirm it's the right one.
2. Apply via:
   ```bash
   ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres' < supabase/migrations/<FILENAME>
   ```
3. Report psql output (errors, NOTICEs, row counts).
4. If the migration touched a table with cross-table RLS subqueries, run a `\dp <table>` check on the referenced tables (`team_members`, `teams`, `pm_projects` etc.) to confirm the `authenticated` role has SELECT.
5. Remind me to add a changelog entry on `app.leadesk.de/admin-logs` with the `db-change` tag.

Do NOT touch the prod (Cloud) DB. That requires explicit confirmation in chat.
