// import-unipile-relations — Unipile-Kontakte-Import (1st-degree Relations) → linkedin_network.
// Paginiert GET /users/relations: liefert member_id (=provider_id ACoAA…) + public_profile_url
// (=linkedin_url) INLINE → network_upsert(source='unipile_relations'). Idempotent (Dedup provider_id).
// Import ist FREI (kein Addon-Gate) — nur der Automatisierungs-Runner ist gated (Entscheidung 2026-07-07).
// Input: { unipile_account_id, max_pages? }. Aufruf: pg_cron (gestaffelt) ODER On-Demand-Button.
//
// ⚠️ 2026-07-16 — Ziel-Tabelle gewechselt: linkedin_inbox → linkedin_network.
// Grund: das eigene Netzwerk ist kein Triage-Material. Der Schreibpfad in die
// Inbox hat bei ALLEN Unipile-Teams die Triage-Queue mit hunderten ungefragten
// Rows geflutet (Cron lief 07./08.07. ungegatet). Netzwerk hat jetzt eine eigene
// Tabelle + einen eigenen Menüpunkt „Netzwerk".
// Ripple bei Deploy: Top-Fallstrick #11 — strukturelle Änderung (anderer RPC,
// andere Signatur) → Deno-Isolate-Cache hält sonst die alte Version:
//   ssh root@<host> "docker restart supabase-edge-functions"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN")!;
const UNIPILE_KEY = Deno.env.get("UNIPILE_API_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const U = `https://${UNIPILE_DSN}/api/v1`;
const uHeaders = { "X-API-KEY": UNIPILE_KEY, "accept": "application/json" };
const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

const PAGE = 100;
const DEFAULT_MAX_PAGES = 50; // Runaway-Schutz: max 5000 Kontakte/Lauf (idempotent → nächster Lauf holt Rest)

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  const { unipile_account_id, max_pages } = await req.json().catch(() => ({} as any));
  if (!unipile_account_id) return json({ error: "unipile_account_id required" }, 400);
  const maxPages = Math.min(Number(max_pages) || DEFAULT_MAX_PAGES, DEFAULT_MAX_PAGES);

  // Unipile-Account → Leadesk user_id + team_id (nur Status OK).
  const { data: acct, error: aerr } = await db.from("unipile_accounts")
    .select("user_id, team_id, status").eq("unipile_account_id", unipile_account_id).maybeSingle();
  if (aerr) return json({ error: "acct lookup: " + aerr.message }, 500);
  if (!acct) return json({ error: "unipile_account not found" }, 404);
  if (acct.status !== "OK") return json({ skipped: "account_status:" + acct.status });
  if (!acct.team_id) return json({ skipped: "no_team" });

  let cursor: string | null = null;
  let pages = 0, inserted = 0, updated = 0, failed = 0, seen = 0;
  do {
    const url: string = `${U}/users/relations?account_id=${encodeURIComponent(unipile_account_id)}&limit=${PAGE}`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const r: Response = await fetch(url, { headers: uHeaders });
    if (!r.ok) {
      return json({ error: `relations ${r.status}: ${(await r.text()).slice(0, 200)}`, pages, inserted, updated, failed }, 502);
    }
    const body: any = await r.json();
    const items: any[] = body.items ?? [];
    cursor = body.cursor ?? null;
    pages++;

    for (const it of items) {
      seen++;
      const provider_id: string | null = it.member_id ?? null;
      const public_id: string | null = it.public_identifier ?? null;
      const linkedin_url: string | null = it.public_profile_url
        || (public_id ? `https://www.linkedin.com/in/${public_id}` : null);
      if (!provider_id && !linkedin_url) { failed++; continue; } // ohne Handle nicht automatisierbar

      const contact = {
        provider_id, linkedin_url,
        public_id,
        name: [it.first_name, it.last_name].filter(Boolean).join(" ") || null,
        first_name: it.first_name ?? null,
        last_name: it.last_name ?? null,
        headline: it.headline ?? null,
        source: "unipile_relations",
      };
      const { data: ins, error: uerr } = await db.rpc("network_upsert", {
        p_team_id: acct.team_id, p_user_id: acct.user_id, p_contact: contact,
        p_unipile_account_id: unipile_account_id,
      });
      // Fehler nicht schlucken — Top-Fallstrick #12: stille permission-denies
      // sehen sonst aus wie "lief durch, 0 Kontakte".
      if (uerr) { failed++; console.warn(`[relations] network_upsert: ${uerr.message}`); continue; }
      (ins as any)?.inserted ? inserted++ : updated++; // RPC gibt jetzt jsonb {id, inserted}
    }
  } while (cursor && pages < maxPages);

  return json({
    unipile_account_id, team_id: acct.team_id,
    pages, seen, inserted, updated, failed,
    more_available: !!cursor && pages >= maxPages,
  });
});
