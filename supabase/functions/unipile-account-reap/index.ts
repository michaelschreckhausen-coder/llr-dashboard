// unipile-account-reap — Kosten-Hygiene: löscht auf Unipile jeden Account, der in
// Leadesk NICHT mehr aktiv verbunden ist (status='DISCONNECTED' oder Orphan/unbekannt).
// So zahlen wir nie für Verbindungen, die in Leadesk aufgelöst wurden.
// Läuft als Cron (service-role). Sicherheits-Guards:
//  - DB-Query-Fehler → Abbruch (nichts löschen).
//  - KEEP-Set = alle unipile_accounts mit status != 'DISCONNECTED' (OK/CREDENTIALS/CHECKPOINT/PENDING bleiben).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DSN = Deno.env.get("UNIPILE_DSN")!;
const UKEY = Deno.env.get("UNIPILE_API_KEY")!;

Deno.serve(async (req) => {
  // Nur service-role (Cron) darf reapen
  const auth = req.headers.get("Authorization") || "";
  if (!auth.includes(SB_SERVICE)) return new Response("unauthorized", { status: 401 });

  const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // KEEP: alles was in Leadesk NICHT disconnected ist (live-ish)
  const { data: keepRows, error: dbErr } = await db
    .from("unipile_accounts").select("unipile_account_id, status").neq("status", "DISCONNECTED");
  if (dbErr) {
    return new Response(JSON.stringify({ error: "db_error, abort (nichts geloescht)", detail: dbErr.message }), { status: 500 });
  }
  const keep = new Set((keepRows || []).map((r: any) => r.unipile_account_id));

  // Unipile-Accounts listen
  const r = await fetch(`https://${DSN}/api/v1/accounts`, { headers: { "X-API-KEY": UKEY, accept: "application/json" } });
  if (!r.ok) return new Response(JSON.stringify({ error: `unipile list ${r.status}` }), { status: 502 });
  const items = ((await r.json()).items) || [];

  const results: any[] = [];
  for (const a of items) {
    if (keep.has(a.id)) continue;                 // aktiv in Leadesk → behalten
    const del = await fetch(`https://${DSN}/api/v1/accounts/${a.id}`, {
      method: "DELETE", headers: { "X-API-KEY": UKEY, accept: "application/json" },
    });
    results.push({ id: a.id, name: a.name || null, deleted: del.ok, status: del.status });
  }
  return new Response(JSON.stringify({ unipile_total: items.length, kept: items.length - results.length, deleted: results.length, results }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
