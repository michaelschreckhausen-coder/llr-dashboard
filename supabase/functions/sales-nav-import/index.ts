// Supabase Edge Function: sales-nav-import (Phase 4 — Sales-Nav-Bulk-Sync)
//
// SKELETT — Endpoint-Signaturen + Auth/Routing/Team-Guard stehen; die mit
// [TODO-REVIEW] markierten Stellen (Upsert-Mechanik, Counter-Atomicity) werden
// im Code-Review-Block VOR dem Deploy finalisiert.
//
// Zentralisiert für den Sidepanel-Worker:
//   - Job-Lifecycle (sales_nav_import_jobs) mit Cap MAX_LEADS_PER_JOB
//   - Upsert in leads mit EXPLIZITER UPDATE-Spaltenliste (User-Edits bleiben)
//   - Team-Security: service_role bypassed RLS → Membership wird HIER manuell
//     erzwungen (sonst könnte ein User in fremde Team-Jobs/Leads schreiben).
//
// Routing: POST /functions/v1/sales-nav-import  mit { action, ... } im Body.
// Actions: create | ingest | status | control | list
//
// Auth: Bearer-JWT im Authorization-Header (User-Token). getCallerContext
// verifiziert den User; alle Writes laufen über den service-role-Client, aber
// strikt gescopet auf die Teams des verifizierten Users.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCallerContext } from "../_shared/credits.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_LEADS_PER_JOB = 500;

// Spalten, die ein Re-Sync überschreiben DARF. Bewusst NICHT dabei:
// tags, notes, owner_id, status, lead_score, next_followup, is_favorite,
// is_shared, deal_* — das sind User-Edits und bleiben erhalten.
const UPDATE_COLS = [
  "first_name", "last_name", "job_title", "company", "location",
  "avatar_url", "linkedin_url", "headline", "li_about_summary",
  "last_synced_at",
] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Lead-Shape, das der Sidepanel-Worker schickt (aus scrapeSavedSearch) ──
interface IncomingLead {
  sales_nav_id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string | null;
  company?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  linkedin_url?: string | null;
  headline?: string | null;
  li_about_summary?: string | null;
}

// ── Team-Guard: gibt die Team-IDs des verifizierten Users zurück ──────
async function getUserTeamIds(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  if (error) {
    console.warn("[sales-nav-import] team_members lookup error:", error.message);
    return [];
  }
  return (data || []).map((r: { team_id: string }) => r.team_id);
}

async function loadJobForUser(
  admin: SupabaseClient, jobId: string, teamIds: string[],
): Promise<{ job: Record<string, unknown> | null; forbidden: boolean }> {
  const { data, error } = await admin
    .from("sales_nav_import_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error || !data) return { job: null, forbidden: false };
  if (!teamIds.includes(data.team_id as string)) return { job: null, forbidden: true };
  return { job: data, forbidden: false };
}

// ─────────────────────────────────────────────────────────────────────
// Endpoint 1 — create: Job anlegen, total_leads auf MAX_LEADS_PER_JOB cappen
// Body: { action:'create', team_id, source_type, source_url, source_id?, total_scraped }
// Resp: { job_id, total_leads, capped }
// ─────────────────────────────────────────────────────────────────────
async function handleCreate(
  admin: SupabaseClient, userId: string, teamIds: string[], body: Record<string, any>,
): Promise<Response> {
  const teamId = body.team_id as string;
  if (!teamId || !teamIds.includes(teamId)) return json({ error: "team_forbidden" }, 403);

  const scraped = Math.max(0, Number(body.total_scraped) || 0);
  const capped = scraped > MAX_LEADS_PER_JOB;
  const total = Math.min(scraped, MAX_LEADS_PER_JOB);

  const { data, error } = await admin.from("sales_nav_import_jobs").insert([{
    team_id: teamId,
    user_id: userId,
    source_type: body.source_type || "saved_search",
    source_url: body.source_url || "",
    source_id: body.source_id || null,
    status: "running",
    total_leads: total,
  }]).select("id").single();
  if (error) return json({ error: error.message }, 400);

  return json({ job_id: data.id, total_leads: total, capped });
}

// ─────────────────────────────────────────────────────────────────────
// Endpoint 2 — ingest: Batch von Leads upserten + Job-Counter fortschreiben
// Body: { action:'ingest', job_id, leads: IncomingLead[] }
// Resp: { processed, inserted, updated, failed }
// ─────────────────────────────────────────────────────────────────────
async function handleIngest(
  admin: SupabaseClient, _userId: string, teamIds: string[], body: Record<string, any>,
): Promise<Response> {
  const jobId = body.job_id as string;
  const leads = (body.leads || []) as IncomingLead[];
  const { job, forbidden } = await loadJobForUser(admin, jobId, teamIds);
  if (forbidden) return json({ error: "team_forbidden" }, 403);
  if (!job) return json({ error: "job_not_found" }, 404);
  if (job.status === "cancelled") return json({ error: "job_cancelled" }, 409);

  // Upsert über SECURITY-DEFINER-RPC sales_nav_upsert_lead — COALESCE-Update
  // (überschreibt nie mit NULL), gibt true=INSERT / false=UPDATE zurück.
  // (Migration 20260628160000_sales_nav_upsert_rpc.sql)
  let inserted = 0, updated = 0, failed = 0;
  for (const lead of leads) {
    if (!lead || !lead.sales_nav_id) { failed++; continue; }
    const { data, error } = await admin.rpc("sales_nav_upsert_lead", {
      p_team_id: job.team_id, p_user_id: job.user_id, p_lead: lead,
    });
    if (error) {
      console.warn("[sales-nav-import] upsert error:", error.message);
      failed++;
      continue;
    }
    if (data === true) inserted++; else updated++;
  }
  const processed = inserted + updated;

  // Counter atomar fortschreiben (race-safe bei parallelen Batches)
  const { error: advErr } = await admin.rpc("sales_nav_job_advance", {
    p_job_id: jobId, p_processed: processed, p_failed: failed,
  });
  if (advErr) console.warn("[sales-nav-import] job_advance error:", advErr.message);

  return json({ processed, inserted, updated, failed });
}

// ─────────────────────────────────────────────────────────────────────
// Endpoint 3 — status: Job-Zustand lesen (für Resume nach Sidepanel-Reload)
// Body: { action:'status', job_id }
// Resp: { job }
// ─────────────────────────────────────────────────────────────────────
async function handleStatus(
  admin: SupabaseClient, _userId: string, teamIds: string[], body: Record<string, any>,
): Promise<Response> {
  const { job, forbidden } = await loadJobForUser(admin, body.job_id as string, teamIds);
  if (forbidden) return json({ error: "team_forbidden" }, 403);
  if (!job) return json({ error: "job_not_found" }, 404);
  return json({ job });
}

// ─────────────────────────────────────────────────────────────────────
// Endpoint 4 — control: pause | resume | cancel
// Body: { action:'control', job_id, op:'pause'|'resume'|'cancel' }
// Resp: { job_id, status }
// ─────────────────────────────────────────────────────────────────────
async function handleControl(
  admin: SupabaseClient, _userId: string, teamIds: string[], body: Record<string, any>,
): Promise<Response> {
  const { job, forbidden } = await loadJobForUser(admin, body.job_id as string, teamIds);
  if (forbidden) return json({ error: "team_forbidden" }, 403);
  if (!job) return json({ error: "job_not_found" }, 404);

  const map: Record<string, string> = { pause: "paused", resume: "running", cancel: "cancelled" };
  const next = map[body.op as string];
  if (!next) return json({ error: "bad_op" }, 400);

  const { error } = await admin.from("sales_nav_import_jobs")
    .update({ status: next }).eq("id", body.job_id);
  if (error) return json({ error: error.message }, 400);
  return json({ job_id: body.job_id, status: next });
}

// ─────────────────────────────────────────────────────────────────────
// Endpoint 5 — list: jüngste Jobs des Teams (für Job-Historie im Sidepanel)
// Body: { action:'list', team_id, limit? }
// Resp: { jobs: [...] }
// ─────────────────────────────────────────────────────────────────────
async function handleList(
  admin: SupabaseClient, _userId: string, teamIds: string[], body: Record<string, any>,
): Promise<Response> {
  const teamId = body.team_id as string;
  if (!teamId || !teamIds.includes(teamId)) return json({ error: "team_forbidden" }, 403);
  const limit = Math.min(Number(body.limit) || 10, 50);
  const { data, error } = await admin.from("sales_nav_import_jobs")
    .select("*").eq("team_id", teamId).order("created_at", { ascending: false }).limit(limit);
  if (error) return json({ error: error.message }, 400);
  return json({ jobs: data || [] });
}

// ── Router ────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Auth: User-JWT verifizieren
  const ctx = await getCallerContext(req, admin);
  if (!ctx?.user_id) return json({ error: "unauthorized" }, 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const teamIds = await getUserTeamIds(admin, ctx.user_id);

  switch (body.action) {
    case "create":  return handleCreate(admin, ctx.user_id, teamIds, body);
    case "ingest":  return handleIngest(admin, ctx.user_id, teamIds, body);
    case "status":  return handleStatus(admin, ctx.user_id, teamIds, body);
    case "control": return handleControl(admin, ctx.user_id, teamIds, body);
    case "list":    return handleList(admin, ctx.user_id, teamIds, body);
    default:        return json({ error: "unknown_action" }, 400);
  }
});
