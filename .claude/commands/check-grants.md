---
description: Check authenticated-role grants on Hetzner staging — catches the silent-fail trap
argument-hint: [table-name] (optional — without arg, lists all tables and their grants)
---

Check `authenticated`-role grants on the Hetzner staging DB.

If $ARGUMENTS is given (single table name):
```bash
ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres' <<EOF
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
  AND table_name = '$ARGUMENTS'
ORDER BY privilege_type;

-- Also show RLS policies for context
\d+ $ARGUMENTS
EOF
```

If $ARGUMENTS is empty, list ALL tables and their grants:
```bash
ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres' <<'EOF'
SELECT t.table_name,
       string_agg(DISTINCT g.privilege_type, ', ' ORDER BY g.privilege_type) AS grants
FROM information_schema.tables t
LEFT JOIN information_schema.role_table_grants g
       ON g.table_name = t.table_name
      AND g.table_schema = t.table_schema
      AND g.grantee = 'authenticated'
WHERE t.table_schema = 'public'
GROUP BY t.table_name
ORDER BY t.table_name;
EOF
```

Then analyze the output:
- Tables with NULL/empty grants that ARE referenced in cross-table RLS policies → Hetzner-Falle, suggest a `GRANT SELECT ... TO authenticated;` migration
- Specifically check `team_members`, `teams`, `pm_projects`, `profiles` — those are the most common reference targets

Do NOT autonomously add grants on prod. If a fix is needed, propose a new migration file via the supabase-migration agent.
