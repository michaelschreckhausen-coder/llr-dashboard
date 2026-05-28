#!/usr/bin/env node
/* eslint-disable no-console */
//
// scripts/schema-check.js
//
// Parst alle supabase.from('TABLE').select('a, b, c')-Calls aus src/,
// validiert die selektierten Spalten gegen einen Hetzner-Schema-Snapshot
// (scripts/hetzner-schema-snapshot.json). Schreit pre-commit über
// Schema-Drifts wie:
//   - lead_tasks.user_id (gedroppt seit Phase A 2026-05-27)
//   - profiles.first_name (existiert auf Hetzner nicht, nur full_name)
//   - deals.expected_close (canonical ist expected_close_date)
//
// Diese 4 Drifts haben am 2026-05-29 jeweils einen Hotfix-Commit gekostet.
// Das Tool fängt sie statisch ab.
//
// Usage:
//   node scripts/schema-check.js              # Validate gegen Snapshot
//   node scripts/schema-check.js --extract    # Nur SELECT-Calls listen
//   node scripts/schema-check.js --json       # Maschinen-Output
//
// Snapshot updaten (manuell vor Schema-Check-Run nach Migrations):
//   ssh root@<hetzner-prod> "docker exec -i supabase-db psql -U supabase_admin -d postgres -c \\
//     \"COPY (SELECT json_agg(t) FROM (SELECT table_name, column_name FROM information_schema.columns \\
//     WHERE table_schema='public' ORDER BY table_name, column_name) t) TO STDOUT\"" \\
//     > scripts/hetzner-schema-snapshot.json
//
// Exit-Code:
//   0 = OK (oder Snapshot fehlt → Warnung statt Fail)
//   1 = mind. 1 unbekannte Spalte gefunden

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const SNAPSHOT = path.join(__dirname, 'hetzner-schema-snapshot.json');

// ─── CLI args ────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
const MODE_EXTRACT = args.has('--extract');
const MODE_JSON = args.has('--json');

// ─── Walk src/ recursive ─────────────────────────────────────────────────
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '_legacy') continue;
      out.push(...walk(p));
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

// ─── Extract supabase.from('TABLE').select('cols') ───────────────────────
//
// Match-Pattern:
//   supabase.from('TABLE').select('col1, col2, ...')
//
// Auch akzeptiert:
//   - .select(`backtick template literal`) — wir parsen den raw String
//   - .select() ohne args → skip (default *)
//   - .select('*') → skip (matched alles)
//   - PostgREST-Embeds wie `leads(first_name, last_name)` → werden als
//     nested-select erkannt, geparsed und der parent.col als Spalte weggelassen
//     (die parent-Tabelle hat eine FK auf 'leads', nicht eine Spalte 'leads')
//
// Limitations:
//   - dynamische SELECT-Strings (z.B. `${VAR}`) werden geskipped
//   - Multi-line SELECTs werden via /[\s\S]/-Regex erfasst
//   - false negative wenn .select() nicht direkt nach .from() steht
//     (z.B. via .upsert().select() in zwei Statements)

const FROM_RE = /supabase\s*\.\s*from\s*\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)\s*\n?\s*\.\s*select\s*\(\s*[`'"]([\s\S]*?)[`'"]\s*\)/gi;

function extractFromFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const calls = [];
  let m;
  while ((m = FROM_RE.exec(src)) !== null) {
    const table = m[1];
    const selectRaw = m[2].trim();
    if (!selectRaw || selectRaw === '*') continue;
    // Skip dynamische SELECTs
    if (selectRaw.includes('${')) continue;
    const cols = parseSelectColumns(selectRaw);
    if (cols.length === 0) continue;
    // Line-Nummer berechnen
    const lineNum = src.slice(0, m.index).split('\n').length;
    calls.push({ file: path.relative(ROOT, filePath), line: lineNum, table, cols });
  }
  return calls;
}

// Parse PostgREST-SELECT-String → Liste von Spalten-Namen für die *primary*
// Tabelle. Nested Embeds (z.B. "leads(first_name)") werden weggelassen weil
// die Spaltennamen dann zu einer ANDEREN Tabelle gehören.
function parseSelectColumns(s) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') { depth++; buf += c; continue; }
    if (c === ')') { depth--; buf += c; continue; }
    if (c === ',' && depth === 0) {
      pushCol(buf, out);
      buf = '';
      continue;
    }
    buf += c;
  }
  pushCol(buf, out);
  return out;
}

function pushCol(raw, out) {
  let s = raw.trim();
  if (!s) return;
  // Alias-Embed: `alias:other_table(...)` → diese Zeile referenziert eine
  // OTHER table, nicht die primary, also Spalte weglassen.
  // Auch ungetaggte Embeds: `other_table(...)`.
  if (/\([^)]*\)/.test(s)) return;
  // Alias-Renaming: `col:server_name` → server_name ist die echte Spalte
  if (s.includes(':')) {
    const parts = s.split(':');
    s = parts[parts.length - 1].trim();
  }
  // Strip count/operator-Modifier wie `tags::text` oder `id.eq.xxx`
  s = s.split('::')[0].split('.')[0].trim();
  // Skip wildcards
  if (s === '*' || !/^[a-z_][a-z0-9_]*$/i.test(s)) return;
  out.push(s);
}

// ─── Load schema snapshot ────────────────────────────────────────────────
function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const map = new Map();
    for (const row of raw) {
      if (!map.has(row.table_name)) map.set(row.table_name, new Set());
      map.get(row.table_name).add(row.column_name);
    }
    return map;
  } catch (e) {
    console.error('[schema-check] failed to parse snapshot:', e.message);
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────
function main() {
  const files = walk(SRC);
  const allCalls = [];
  for (const f of files) {
    allCalls.push(...extractFromFile(f));
  }

  if (MODE_EXTRACT) {
    if (MODE_JSON) {
      console.log(JSON.stringify(allCalls, null, 2));
    } else {
      console.log(`Found ${allCalls.length} supabase.from(...).select(...) calls:\n`);
      for (const c of allCalls) {
        console.log(`${c.file}:${c.line}  ${c.table}  ${c.cols.join(', ')}`);
      }
    }
    process.exit(0);
  }

  const snapshot = loadSnapshot();
  if (!snapshot) {
    console.warn('[schema-check] hetzner-schema-snapshot.json fehlt.');
    console.warn('  → Snapshot generieren (siehe Header-Kommentar im Script).');
    console.warn(`  → Würde ${allCalls.length} SELECT-Calls aus ${files.length} Files validieren.`);
    process.exit(0);
  }

  const issues = [];
  const skipped = [];
  for (const c of allCalls) {
    const tableCols = snapshot.get(c.table);
    if (!tableCols) {
      // Tabelle nicht im Snapshot — kann RPC-View, Edge-Function-Embed, oder
      // Drop sein. Notieren aber nicht failen.
      skipped.push({ ...c, reason: `table '${c.table}' not in snapshot` });
      continue;
    }
    for (const col of c.cols) {
      if (!tableCols.has(col)) {
        issues.push({ ...c, missingCol: col });
      }
    }
  }

  if (MODE_JSON) {
    console.log(JSON.stringify({ issues, skipped, totalCalls: allCalls.length }, null, 2));
    process.exit(issues.length > 0 ? 1 : 0);
  }

  console.log(`\nSchema-Check: ${allCalls.length} SELECT-Calls geprüft (${files.length} Files).\n`);

  if (skipped.length > 0) {
    console.log(`⚠️  ${skipped.length} Calls übersprungen (Tabelle nicht im Snapshot):`);
    const skippedTables = new Set(skipped.map(s => `${s.table}`));
    for (const t of [...skippedTables].slice(0, 10)) {
      console.log(`     - ${t}`);
    }
    if (skippedTables.size > 10) console.log(`     … +${skippedTables.size - 10} weitere`);
    console.log();
  }

  if (issues.length === 0) {
    console.log('✅ Keine Schema-Drifts gefunden.');
    process.exit(0);
  }

  console.log(`❌ ${issues.length} Schema-Drift(s) gefunden:\n`);
  for (const i of issues) {
    console.log(`  ${i.file}:${i.line}`);
    console.log(`    Tabelle: ${i.table}`);
    console.log(`    Unbekannte Spalte: ${i.missingCol}`);
    console.log();
  }
  process.exit(1);
}

main();
