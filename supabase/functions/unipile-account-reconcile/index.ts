// unipile-account-reconcile — Rueckweg-Abgleich: bringt unipile_accounts.status in
// Einklang mit dem, was Unipile WIRKLICH hat. Schliesst die Luecke, dass eine bei
// Unipile geloeschte/verschwundene Verbindung in Leadesk faelschlich weiter "OK" zeigt
// (dann sagt die App "verbunden", synct aber nichts / zeigt altes Residue).
//
// Gegenstueck zu:
//  - unipile-webhook  (Realtime-Status, aber nur wenn Unipile ein Event schickt)
//  - unipile-account-reap (loescht bei Unipile, was in Leadesk disconnected ist)
//
// Ablauf (service-role / Cron):
//  1. GET /accounts einmal -> Live-Set + je Account die source-status.
//  2. Jede Leadesk-Zeile mit status='OK':
//     - Account NICHT in Live-Set  -> weg bei Unipile -> status='DISCONNECTED'.
//     - Account da, source-status != OK -> auf Unipile-Status spiegeln (z.B. CREDENTIALS).
//  Sicherheits-Guard: schlaegt der Unipile-List-Call fehl ODER liefert 0 Items,
//  wird NICHTS geaendert (verhindert Massen-Fehl-Disconnects bei API-Blip).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DSN = Deno.env.get("UNIPILE_DSN")!;
const UKEY = Deno.env.get("UNIPILE_API_KEY")!;

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.includes(SB_SERVICE)) return new Response("unauthorized", { status: 401 });

  const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // 1. Leadesk-Zeilen, die aktuell als OK gelten
  const { data: okRows, error: dbErr } = await db
    .from("unipile_accounts")
    .select("id, unipile_account_id, status")
    .eq("status", "OK");
  if (dbErr) return new Response(JSON.stringify({ error: "db_error, abort", detail: dbErr.message }), { status: 500 });
  if (!okRows || okRows.length === 0) {
    return new Response(JSON.stringify({ checked: 0, disconnected: 0, downgraded: 0, note: "keine OK-Zeilen" }), { status: 200 });
  }

  // 2. Unipile-Wahrheit holen (einmal)
  const r = await fetch(`https://${DSN}/api/v1/accounts`, { headers: { "X-API-KEY": UKEY, accept: "application/json" } });
  if (!r.ok) return new Response(JSON.stringify({ error: `unipile list ${r.status}, abort (nichts geaendert)` }), { status: 502 });
  const items = ((await r.json())?.items) || [];
  // GUARD: leere Liste = wahrscheinlich API-Blip -> nichts anfassen
  if (items.length === 0) return new Response(JSON.stringify({ error: "unipile list leer, abort (Guard)" }), { status: 502 });

  const live = new Map<string, string>(); // id -> source-status
  for (const a of items) live.set(a.id, (a?.sources?.[0]?.status) || "OK");

  const now = new Date().toISOString();
  const disconnected: any[] = [];
  const downgraded: any[] = [];

  for (const row of okRows) {
    const id = row.unipile_account_id;
    if (!live.has(id)) {
      // Account existiert bei Unipile nicht mehr -> weg
      await db.from("unipile_accounts").update({ status: "DISCONNECTED", last_status_update: now }).eq("id", row.id);
      disconnected.push(id);
    } else {
      const srcStatus = live.get(id)!;
      if (srcStatus !== "OK") {
        // Account da, aber Sitzung gestoert (Checkpoint/Credentials) und Webhook evtl. verpasst
        await db.from("unipile_accounts").update({ status: srcStatus, last_status_update: now }).eq("id", row.id);
        downgraded.push({ id, status: srcStatus });
      }
    }
  }

  return new Response(JSON.stringify({
    checked: okRows.length, unipile_total: items.length,
    disconnected_count: disconnected.length, disconnected,
    downgraded_count: downgraded.length, downgraded,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
