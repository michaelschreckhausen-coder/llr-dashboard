// =====================================================================
// analytics-snapshot — täglicher Reporting-Snapshot (per pg_cron).
// Schreibt je verbundenem Login/Brand einen Tages-Datenpunkt:
//   linkedin_profile_metrics (Personal Brand: Follower/Connections)
//   linkedin_network_metrics (Login: Connections/Follower/offene Einladungen)
//   linkedin_page_metrics    (Company Brand: Follower/Mitarbeiter)
// Nur service_role (Cron). Idempotent je Tag (Unique-Index).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DSN = Deno.env.get("UNIPILE_DSN")!;
const KEY = Deno.env.get("UNIPILE_API_KEY")!;
const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

async function uget(path: string): Promise<any | null> {
  try {
    const r = await fetch(`https://${DSN}${path}`, { headers: { "X-API-KEY": KEY, accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Chats gedeckelt scannen (Cursor-Pagination, max. 3 Seiten à 100) → Inbox-KPIs.
async function scanChats(accountId: string) {
  const now = Date.now();
  let scanned = 0, unreadThreads = 0, unreadMessages = 0, active7d = 0, cursor: string | null = null;
  for (let page = 0; page < 3; page++) {
    const q = `/api/v1/chats?account_id=${encodeURIComponent(accountId)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const d = await uget(q);
    const items: any[] = d?.items ?? [];
    for (const c of items) {
      scanned++;
      const uc = Number(c?.unread_count ?? 0) || 0;
      if (uc > 0) { unreadThreads++; unreadMessages += uc; }
      const ts = c?.timestamp ? new Date(c.timestamp).getTime() : 0;
      if (ts && now - ts < 7 * 86400_000) active7d++;
    }
    cursor = d?.cursor ?? null;
    if (!cursor || items.length === 0) break;
  }
  return { scanned, unreadThreads, unreadMessages, active7d };
}

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${SB_SERVICE}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const today = new Date().toISOString().slice(0, 10);
  let profiles = 0, networks = 0, pages = 0, messaging = 0;
  const errors: string[] = [];

  // Brand-Map (account_type, org-Felder)
  const { data: brands } = await admin.from("brand_voices")
    .select("id, account_type, team_id, linkedin_org_id, linkedin_acting_account_id");
  const brandById = new Map((brands || []).map((b: any) => [b.id, b]));

  // --- Personal-Logins: Profil + Netzwerk ---
  const { data: logins } = await admin.from("unipile_accounts")
    .select("unipile_account_id, provider_public_id, brand_voice_id, team_id")
    .eq("status", "OK").not("unipile_account_id", "is", null);
  const seen = new Set<string>();
  for (const l of (logins || [])) {
    if (!l.unipile_account_id || seen.has(l.unipile_account_id)) continue;
    seen.add(l.unipile_account_id);
    try {
      let follower: number | null = null, connections: number | null = null;
      if (l.provider_public_id) {
        const p = await uget(`/api/v1/users/${encodeURIComponent(l.provider_public_id)}?account_id=${encodeURIComponent(l.unipile_account_id)}`);
        follower = p?.follower_count ?? null;
        connections = p?.connections_count ?? null;
      }
      let outC: number | null = null, inC: number | null = null;
      const s = await uget(`/api/v1/users/invite/sent?account_id=${encodeURIComponent(l.unipile_account_id)}&limit=100`);
      if (s) outC = Array.isArray(s.items) ? s.items.length : null;
      const rc = await uget(`/api/v1/users/invite/received?account_id=${encodeURIComponent(l.unipile_account_id)}&limit=100`);
      if (rc) inC = Array.isArray(rc.items) ? rc.items.length : null;

      await admin.from("linkedin_network_metrics").upsert({
        team_id: l.team_id, unipile_account_id: l.unipile_account_id, brand_voice_id: l.brand_voice_id,
        connections_total: connections, followers_total: follower,
        invites_pending_out: outC, invites_pending_in: inC, captured_on: today,
      }, { onConflict: "unipile_account_id,captured_on" });
      networks++;

      // Messaging/Inbox (gedeckelt gescannt)
      try {
        const ch = await scanChats(l.unipile_account_id);
        await admin.from("linkedin_messaging_metrics").upsert({
          team_id: l.team_id, unipile_account_id: l.unipile_account_id, brand_voice_id: l.brand_voice_id,
          chats_scanned: ch.scanned, unread_threads: ch.unreadThreads,
          unread_messages: ch.unreadMessages, active_7d: ch.active7d, captured_on: today,
        }, { onConflict: "unipile_account_id,captured_on" });
        messaging++;
      } catch (_e) { /* Messaging best-effort */ }

      const b: any = l.brand_voice_id ? brandById.get(l.brand_voice_id) : null;
      if (b && b.account_type !== "company_page") {
        await admin.from("linkedin_profile_metrics").upsert({
          team_id: l.team_id, brand_voice_id: l.brand_voice_id,
          follower_count: follower, connections_count: connections, captured_on: today,
        }, { onConflict: "brand_voice_id,captured_on" });
        profiles++;
      }
    } catch (e) { errors.push(`login ${l.unipile_account_id}: ${String((e as Error)?.message || e).slice(0, 80)}`); }
  }

  // --- Company Pages: Follower/Mitarbeiter ---
  for (const b of (brands || []).filter((x: any) => x.account_type === "company_page" && x.linkedin_org_id && x.linkedin_acting_account_id)) {
    try {
      const c = await uget(`/api/v1/linkedin/company/${encodeURIComponent(b.linkedin_org_id)}?account_id=${encodeURIComponent(b.linkedin_acting_account_id)}`);
      if (c) {
        await admin.from("linkedin_page_metrics").upsert({
          team_id: b.team_id, brand_voice_id: b.id, linkedin_org_id: b.linkedin_org_id,
          followers_count: c?.followers_count ?? null, employee_count: c?.employee_count ?? null, captured_on: today,
        }, { onConflict: "brand_voice_id,captured_on" });
        pages++;
      }
    } catch (e) { errors.push(`page ${b.id}: ${String((e as Error)?.message || e).slice(0, 80)}`); }
  }

  return new Response(JSON.stringify({ ok: true, profiles, networks, pages, messaging, errors }), {
    headers: { "Content-Type": "application/json" },
  });
});
