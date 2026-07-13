// la-account-reconcile — validierte Brücke: unipile_accounts (Authority) + Unipile-Live → la_accounts.
// Behebt stale/Phantom unipile_account_id (z.B. 1_4Gb3… → 404), die "verbunden" zeigen aber dead-lettern.
// Rollen:
//   (1) Repair unipile_accounts: id gegen Unipile validieren; Phantom → per publicIdentifier(Slug)-Match
//       auf den echten connected LINKEDIN-Account korrigieren, sonst status=DISCONNECTED (kein falsches "OK").
//   (2) Sync la_accounts: validierte OK-unipile_accounts → la_accounts (fehlendes V2-Onboarding), + la_accounts-Repair.
// Auth: service-role-Bearer + {all:true} (Repair-Run über alle) ODER User-JWT (nur seine Teams).
// service-role-Writes (RLS-Bypass, Self-Host-GRANT-Falle umgangen). Idempotent. KEIN Send.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const DSN = Deno.env.get("UNIPILE_DSN")!;
const KEY = Deno.env.get("UNIPILE_API_KEY")!;
const uHeaders = { "X-API-KEY": KEY, "accept": "application/json" };

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const nowIso = () => new Date().toISOString();

interface Acct { id: string; status: string; slug: string | null; providerId: string | null; }

// Live-Unipile-LINKEDIN-Accounts: byId + bySlug (publicIdentifier).
async function fetchAccountMap(): Promise<{ byId: Map<string, Acct>; bySlug: Map<string, Acct> }> {
  const r = await fetch(`https://${DSN}/api/v1/accounts`, { headers: uHeaders });
  if (!r.ok) throw new Error(`unipile /accounts ${r.status}`);
  const items: any[] = (await r.json()).items || [];
  const byId = new Map<string, Acct>(); const bySlug = new Map<string, Acct>();
  for (const a of items) {
    if (a?.type !== "LINKEDIN") continue;
    const im = a?.connection_params?.im || {};
    const rec: Acct = { id: a.id, status: (a?.sources?.[0]?.status) || "OK", slug: im.publicIdentifier ?? null, providerId: im.id ?? null };
    byId.set(a.id, rec);
    if (rec.slug) bySlug.set(String(rec.slug).toLowerCase(), rec);
  }
  return { byId, bySlug };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({} as any));
  const auth = req.headers.get("Authorization") || "";
  const isService = auth.includes(SB_SERVICE);

  // Scope: service-role + all → alle Teams; service-role + team_ids → gezielt; sonst JWT-User → seine Teams.
  let teamFilter: string[] | null = null;
  if (isService && body?.all) {
    teamFilter = null;                                   // alle Teams (Breit-Lauf)
  } else if (isService && Array.isArray(body?.team_ids) && body.team_ids.length) {
    teamFilter = body.team_ids as string[];              // gezielter Repair (z.B. ein Team)
  } else {
    const uc = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: tms } = await db.from("team_members").select("team_id").eq("user_id", user.id);
    teamFilter = (tms || []).map((t: any) => t.team_id);
    if (!teamFilter.length) return json({ ok: true, note: "user_has_no_team" });
  }

  let map;
  try { map = await fetchAccountMap(); } catch (e) { return json({ error: String((e as Error).message) }, 502); }
  const { byId, bySlug } = map;
  const rep = { ua_kept: 0, ua_fixed: [] as any[], ua_disconnected: [] as any[], la_synced: [] as any[], la_fixed: [] as any[], la_disconnected: [] as any[] };

  // ── (1) unipile_accounts reparieren ──
  let uq = db.from("unipile_accounts").select("id, team_id, user_id, unipile_account_id, provider_public_id, status");
  if (teamFilter) uq = uq.in("team_id", teamFilter);
  const { data: uaRows } = await uq;
  for (const r of uaRows || []) {
    const valid = byId.get(r.unipile_account_id);
    if (valid && valid.status === "OK") {
      if (r.status !== "OK") await db.from("unipile_accounts").update({ status: "OK", last_status_update: nowIso() }).eq("id", r.id);
      rep.ua_kept++; continue;
    }
    const match = r.provider_public_id ? bySlug.get(String(r.provider_public_id).toLowerCase()) : null;
    if (match && match.status === "OK") {
      const { data: dupe } = await db.from("unipile_accounts").select("id").eq("unipile_account_id", match.id).maybeSingle();
      if (dupe && dupe.id !== r.id) {
        if (r.status === "OK") {   // nur wenn nicht schon disconnected (Idempotenz)
          await db.from("unipile_accounts").update({ status: "DISCONNECTED", last_status_update: nowIso() }).eq("id", r.id);
          rep.ua_disconnected.push({ id: r.id, reason: "dup_of_valid" });
        }
      } else {
        await db.from("unipile_accounts").update({ unipile_account_id: match.id, provider_public_id: match.slug, status: "OK", last_status_update: nowIso() }).eq("id", r.id);
        rep.ua_fixed.push({ id: r.id, old: r.unipile_account_id, new: match.id, slug: match.slug });
      }
    } else if (r.status === "OK") {
      await db.from("unipile_accounts").update({ status: "DISCONNECTED", last_status_update: nowIso() }).eq("id", r.id);
      rep.ua_disconnected.push({ id: r.id, reason: "no_match" });
    }
  }

  // ── (2) la_accounts aus validierten OK-Sessions ABLEITEN — genau EINE connected-Row je Identität ──
  // Authority = unipile_accounts(status OK) ∩ Unipile-live. Canonical je (team, slug) = NEUESTE Session
  // (last_status_update). Alle anderen la_accounts derselben Identität → disconnected; fehlende
  // canonical-Row → insert. Deckt sich mit getUnipileConnection (newest OK) → Send-Routing == Dropdown.
  let uq2 = db.from("unipile_accounts").select("team_id, unipile_account_id, provider_public_id, last_status_update").eq("status", "OK");
  if (teamFilter) uq2 = uq2.in("team_id", teamFilter);
  const { data: okRows } = await uq2;
  const canonical = new Map<string, { unipileId: string; providerId: string | null; slug: string | null; ts: string }>();
  for (const r of okRows || []) {
    const live = byId.get(r.unipile_account_id);
    if (!live || live.status !== "OK") continue;         // muss auch bei Unipile live sein (kein 404)
    const slug = String(live.slug || r.provider_public_id || "").toLowerCase();
    if (!slug) continue;
    const key = `${r.team_id}|${slug}`;
    const ts = r.last_status_update || "";
    const cur = canonical.get(key);
    if (!cur || ts > cur.ts) canonical.set(key, { unipileId: r.unipile_account_id, providerId: live.providerId, slug: live.slug, ts });
  }

  // Bestehende la_accounts gegen canonical abgleichen.
  let laq = db.from("la_accounts").select("id, team_id, unipile_account_id, public_identifier, status");
  if (teamFilter) laq = laq.in("team_id", teamFilter);
  const { data: laRows } = await laq;
  const seen = new Set<string>();                        // canonical-Identitäten mit bereits vorhandener Row
  for (const r of laRows || []) {
    const live = byId.get(r.unipile_account_id);
    const slug = String((live?.slug) || r.public_identifier || "").toLowerCase();
    const canon = slug ? canonical.get(`${r.team_id}|${slug}`) : null;
    if (canon && canon.unipileId === r.unipile_account_id) {
      await db.from("la_accounts").update({ provider_id: canon.providerId, public_identifier: canon.slug, status: "connected", updated_at: nowIso() }).eq("id", r.id);
      if (r.status !== "connected") rep.la_fixed.push({ id: r.id, to: "connected" });
      seen.add(`${r.team_id}|${slug}`);
    } else if (r.status === "connected") {               // andere/ältere/stale Row derselben Identität → disconnected
      await db.from("la_accounts").update({ status: "disconnected", updated_at: nowIso() }).eq("id", r.id);
      rep.la_disconnected.push({ id: r.id, reason: canon ? "superseded_by_newer_session" : "no_live_session" });
    }
  }

  // Fehlende canonical-Rows anlegen (OK-Session ohne la_account).
  for (const [key, canon] of canonical) {
    if (seen.has(key)) continue;
    const teamId = key.split("|")[0];
    const { data: ex } = await db.from("la_accounts").select("id").eq("team_id", teamId).eq("unipile_account_id", canon.unipileId).maybeSingle();
    if (ex) {
      await db.from("la_accounts").update({ provider_id: canon.providerId, public_identifier: canon.slug, status: "connected", updated_at: nowIso() }).eq("id", ex.id);
    } else {
      await db.from("la_accounts").insert({ team_id: teamId, unipile_account_id: canon.unipileId, provider_id: canon.providerId, public_identifier: canon.slug, status: "connected", features: {} });
      rep.la_synced.push({ team_id: teamId, unipile_account_id: canon.unipileId });
    }
  }

  return json({ ok: true, scope: teamFilter ? "teams" : "all", ...rep });
});
