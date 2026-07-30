// unipile-account-reconcile — Rueckweg-Abgleich: bringt den Verbindungs-Status in ALLEN
// drei Speichern in Einklang mit dem, was Unipile WIRKLICH hat. Schliesst die Luecke,
// dass eine bei Unipile geloeschte Verbindung in Leadesk weiter "verbunden" aussieht
// (App sagt verbunden, synct aber nichts / zeigt altes Residue).
//
// Ein "verbunden"-Zustand ist an drei Stellen denormalisiert:
//   1. unipile_accounts.status            (Sync/Caps/RPC)
//   2. la_accounts.status                 (Automatisierung)
//   3. brand_voices.linkedin_member_id... (Badge im Marken-Editor)
// Ein echtes "Trennen" raeumt alle drei. Dieser Reconciler tut bei totem Account dasselbe.
//
// Gegenstueck zu unipile-webhook (Realtime, nur bei Event) + unipile-account-reap (Kostenreap).
//
// Guard: Unipile-List-Fehler ODER 0 Items -> NICHTS aendern (kein Massen-Fehl-Disconnect).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DSN = Deno.env.get("UNIPILE_DSN")!;
const UKEY = Deno.env.get("UNIPILE_API_KEY")!;

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.includes(SB_SERVICE)) return new Response("unauthorized", { status: 401 });

  const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // Alle bekannten Unipile-Account-Zeilen (nicht nur OK — auch la/brand-Marker heilen).
  const { data: rows, error: dbErr } = await db
    .from("unipile_accounts")
    .select("id, unipile_account_id, status, brand_voice_id");
  if (dbErr) return new Response(JSON.stringify({ error: "db_error, abort", detail: dbErr.message }), { status: 500 });
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ checked: 0, note: "keine Zeilen" }), { status: 200 });
  }

  // Unipile-Wahrheit (einmal)
  const r = await fetch(`https://${DSN}/api/v1/accounts`, { headers: { "X-API-KEY": UKEY, accept: "application/json" } });
  if (!r.ok) return new Response(JSON.stringify({ error: `unipile list ${r.status}, abort` }), { status: 502 });
  const items = ((await r.json())?.items) || [];
  if (items.length === 0) return new Response(JSON.stringify({ error: "unipile list leer, abort (Guard)" }), { status: 502 });

  const live = new Map<string, string>(); // id -> source-status
  for (const a of items) live.set(a.id, (a?.sources?.[0]?.status) || "OK");

  const now = new Date().toISOString();
  const flippedOk: string[] = [];
  const downgraded: any[] = [];
  const laFixed: string[] = [];
  const brandsCleared: string[] = [];
  const goneBrandIds = new Set<string>();

  for (const row of rows) {
    const id = row.unipile_account_id as string;
    const gone = !live.has(id);

    if (gone) {
      if (row.status === "OK") {
        await db.from("unipile_accounts").update({ status: "DISCONNECTED", last_status_update: now }).eq("id", row.id);
        flippedOk.push(id);
      }
      // la_accounts (Automatisierung) mitziehen
      const { data: laUpd } = await db.from("la_accounts")
        .update({ status: "disconnected", updated_at: now })
        .eq("unipile_account_id", id).neq("status", "disconnected").select("id");
      if (laUpd && laUpd.length) laFixed.push(id);
      if (row.brand_voice_id) goneBrandIds.add(row.brand_voice_id as string);
    } else {
      const src = live.get(id)!;
      if (row.status === "OK" && src !== "OK") {
        await db.from("unipile_accounts").update({ status: src, last_status_update: now }).eq("id", row.id);
        downgraded.push({ id, status: src });
      }
    }
  }

  // brand_voices-Marker leeren — aber nur fuer Marken, die KEINEN lebenden OK-Account mehr haben.
  for (const bvId of goneBrandIds) {
    const { data: okLeft } = await db.from("unipile_accounts")
      .select("unipile_account_id").eq("brand_voice_id", bvId).eq("status", "OK");
    const stillLive = (okLeft || []).some((x: any) => live.has(x.unipile_account_id));
    if (stillLive) continue; // Marke hat noch eine gueltige Verbindung -> Marker behalten
    const { data: bvUpd } = await db.from("brand_voices")
      .update({ linkedin_member_id: null, linkedin_display_name: null, linkedin_avatar_url: null, linkedin_verified_at: null })
      .eq("id", bvId).not("linkedin_member_id", "is", null).select("id");
    if (bvUpd && bvUpd.length) brandsCleared.push(bvId);
  }

  return new Response(JSON.stringify({
    checked: rows.length, unipile_total: items.length,
    disconnected: flippedOk, downgraded, la_accounts_fixed: laFixed, brands_cleared: brandsCleared,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
