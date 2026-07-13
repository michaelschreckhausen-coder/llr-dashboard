// la-audience-scan — B1 Audience-Pre-Scan (Hybrid, cached-first).
// Setzt relation_status pro aktivem Enrollment einer Kampagne, damit das Confirm-Gate die EXAKTE Zahl
// realer Invites (not_connected) statt "bis zu N" zeigen kann. Reihenfolge billigste Quelle zuerst;
// Unipile-Live-Lookup nur für verbleibende Unbekannte, gedrosselt via Cost-Cap.
// WICHTIG: ersetzt NICHT den Runtime-Relation-Gate im la-runner (der bleibt Autorität beim Senden);
// dies ist reine Vorhersage. Idempotent, service-role-Writes. KEIN Send.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getProfile } from "../_shared/unipile-client.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

const FRESH_DAYS = 7;              // prior_scan gilt als frisch
const DEFAULT_CAP = 200;          // max Unipile-Live-Lookups pro Run
const nowIso = () => new Date().toISOString();
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const chunk = <T>(a: T[], n: number): T[][] => { const r: T[][] = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };

// Setzt relation_status für eine ID-Liste (gebatcht).
async function mark(ids: string[], status: string, source: string) {
  for (const c of chunk(ids, 200)) {
    await db.from("la_enrollments").update({ relation_status: status, relation_source: source, scanned_at: nowIso() }).in("id", c);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const campaignId: string | undefined = body?.campaign_id;
  if (!campaignId) return json({ error: "campaign_id_required" }, 400);
  const cap = Number.isInteger(body?.max_unipile) ? body.max_unipile : DEFAULT_CAP;

  const { data: camp } = await db.from("la_campaigns").select("id, team_id, account_id, audience_id").eq("id", campaignId).maybeSingle();
  if (!camp) return json({ error: "campaign_not_found" }, 404);
  const teamId: string = camp.team_id;

  // Auth: service-role-Bearer ODER JWT-User, der Mitglied des Kampagnen-Teams ist.
  const auth = req.headers.get("Authorization") || "";
  if (!auth.includes(SB_SERVICE)) {
    const uc = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: mem } = await db.from("team_members").select("team_id").eq("user_id", user.id).eq("team_id", teamId).maybeSingle();
    if (!mem) return json({ error: "forbidden" }, 403);
  }

  // Kontext: Audience-Kind + verbundene Unipile-Session (für Live-Lookup).
  let kind: string | null = null;
  if (camp.audience_id) { const { data: a } = await db.from("la_audiences").select("kind").eq("id", camp.audience_id).maybeSingle(); kind = a?.kind ?? null; }
  let accountId: string | null = null;
  if (camp.account_id) { const { data: acc } = await db.from("la_accounts").select("unipile_account_id, status").eq("id", camp.account_id).maybeSingle(); if (acc?.status === "connected") accountId = acc.unipile_account_id; }

  // Aktive Enrollments laden; zu (re)scannen: unknown ODER veralteter/kein scanned_at.
  const freshCut = new Date(Date.now() - FRESH_DAYS * 86400000).toISOString();
  const { data: enrs } = await db.from("la_enrollments")
    .select("id, provider_id, public_identifier, relation_status, scanned_at")
    .eq("campaign_id", campaignId).eq("state", "active");
  const all = enrs || [];
  const todo = all.filter((e: any) => e.relation_status === "unknown" || !e.scanned_at || e.scanned_at < freshCut);
  const prior_scan = all.length - todo.length;   // frisch + bekannt → übernommen

  const src = { own_connections: 0, prior_job: 0, inbox: 0, unipile: 0 };
  let used = 0;   // Unipile-Live-Lookups (vor dem relations-Short-Circuit deklariert → kein TDZ in finalize).

  // (2) own_connections: Audience „Eigene Verbindungen" (kind=relations) ⇒ per Definition first_degree.
  if (kind === "relations") {
    await mark(todo.map((e: any) => e.id), "first_degree", "own_connections");
    src.own_connections = todo.length;
    return finalize();
  }

  let remaining = [...todo];
  const pids = (arr: any[]) => arr.map((e) => e.provider_id).filter(Boolean) as string[];

  // (3) prior_job: früher schon invited (done invite) im Team → already_connected-Bucket (pending).
  const priorJobPids = new Set<string>();
  for (const c of chunk(pids(remaining), 200)) {
    const { data } = await db.from("la_jobs")
      .select("action, state, e:la_enrollments!inner(provider_id, team_id)")
      .eq("action", "invite").eq("state", "done").eq("e.team_id", teamId).in("e.provider_id", c);
    for (const r of data || []) { const p = (r as any).e?.provider_id; if (p) priorJobPids.add(p); }
  }
  {
    const hit = remaining.filter((e: any) => e.provider_id && priorJobPids.has(e.provider_id));
    await mark(hit.map((e: any) => e.id), "pending", "prior_job");
    src.prior_job = hit.length;
    remaining = remaining.filter((e: any) => !(e.provider_id && priorJobPids.has(e.provider_id)));
  }

  // (4) inbox: li_connection_status (Enum crm_connection_status) ist die Authority — NICHT bloße Präsenz.
  //   verbunden → first_degree · pending → pending · nicht_verbunden → not_connected (Inbox kennt den Nicht-Status!)
  //   NULL/sonst → KEIN Cache-Hit → fällt an unipile. (Inbox ist Triage-Layer, voll mit Nicht-Verbindungen.)
  const INBOX_MAP: Record<string, string> = { verbunden: "first_degree", pending: "pending", nicht_verbunden: "not_connected" };
  const inboxStatus = new Map<string, string>();
  for (const c of chunk(pids(remaining), 200)) {
    const { data } = await db.from("linkedin_inbox").select("provider_id, li_connection_status").eq("team_id", teamId).in("provider_id", c);
    for (const r of data || []) { const p = (r as any).provider_id; const s = (r as any).li_connection_status; if (p && s) inboxStatus.set(p, s); }
  }
  {
    const buckets: Record<string, string[]> = { first_degree: [], pending: [], not_connected: [] };
    remaining = remaining.filter((e: any) => {
      const mapped = e.provider_id ? INBOX_MAP[inboxStatus.get(e.provider_id) || ""] : undefined;
      if (mapped) { buckets[mapped].push(e.id); return false; }
      return true;   // kein verwertbarer Inbox-Status → weiter an unipile
    });
    await mark(buckets.first_degree, "first_degree", "inbox");
    await mark(buckets.pending, "pending", "inbox");
    await mark(buckets.not_connected, "not_connected", "inbox");
    src.inbox = buckets.first_degree.length + buckets.pending.length + buckets.not_connected.length;
  }

  // (5) unipile: verbleibende Unbekannte live prüfen, gedrosselt via Cap; Ergebnisse laufend schreiben.
  if (accountId) {
    for (const e of remaining) {
      if (used >= cap) break;
      const ident = e.provider_id || e.public_identifier;
      if (!ident) continue;
      used++;
      const p = await getProfile(accountId, ident);
      if (!p.ok) continue;   // Fehler → bleibt unknown (fällt in die "bis zu"-Spanne)
      const nd = (p.data as any)?.network_distance;
      const isRel = (p.data as any)?.is_relationship === true;
      const pend = (p.data as any)?.pending_invitation ?? (p.data as any)?.invitation ?? null;
      const status = (nd === "FIRST_DEGREE" || isRel) ? "first_degree" : (pend ? "pending" : "not_connected");
      await db.from("la_enrollments").update({ relation_status: status, relation_source: "unipile", scanned_at: nowIso() }).eq("id", e.id);
      src.unipile++;
    }
  }

  return finalize();

  async function finalize() {
    // Ist-Verteilung frisch aus der DB (nach den Writes).
    const { data: agg } = await db.from("la_enrollments").select("relation_status").eq("campaign_id", campaignId).eq("state", "active");
    const counts = { first_degree: 0, pending: 0, not_connected: 0, unknown: 0 } as Record<string, number>;
    for (const r of agg || []) counts[(r as any).relation_status] = (counts[(r as any).relation_status] || 0) + 1;
    return json({
      ok: true, campaign_id: campaignId, team_id: teamId,
      total_active: (agg || []).length, prior_scan, scanned_this_run: todo.length,
      by_source: src, unipile_used: used, cap,
      counts, scan_complete: (counts.unknown || 0) === 0,
    });
  }
});
