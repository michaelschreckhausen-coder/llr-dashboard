// =====================================================================
// public-api  —  Leadesk external REST API (v1)
//
// Auth:   X-API-Key: lk_live_...           (API key)
//    or   Authorization: Bearer lk_live_... (API key)
//    or   Authorization: Bearer <oauth>     (OAuth2 client-credentials token)
//         POST /v1/oauth/token issues OAuth tokens.
//
// All data is scoped by the credential's team_id. The function runs with
// the service_role key and enforces team scoping in code (not via RLS).
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

// ---- enum whitelists (from DB, keep in sync) -------------------------
const ENUM = {
  lead_status: ["new","open","in_progress","open_deal","unqualified","attempted_to_contact","connected","bad_timing"],
  lead_source: ["linkedin","website","referral","cold_outreach","event","import","inbound","paid_social","organic_search","other"],
  lifecycle_stage: ["subscriber","lead","marketing_qualified","sales_qualified","opportunity","customer","evangelist","other"],
  deal_stage: ["kein_deal","prospect","opportunity","angebot","verhandlung","gewonnen","verloren","stage_custom1","stage_custom2","stage_custom3"],
};

// ---- writable field whitelists per resource --------------------------
const WRITABLE = {
  contacts: ["first_name","last_name","name","email","phone","linkedin_url","profile_url","headline","job_title","company","industry","city","country","status","lifecycle_stage","lead_source","tags","notes","organization_id"],
  companies: ["name","website","linkedin_company_url","email_central","phone_central","street","zip","city","state","country","industry_slug","notes"],
  deals: ["title","description","value","currency","stage","probability","expected_close_date","lead_id","organization_id","custom_fields"],
  content: ["title","content","type","status","scheduled_at","published_at","platform","metadata"],
};

// resource -> table
const TABLE: Record<string, string> = {
  contacts: "leads",
  companies: "organizations",
  deals: "deals",
  content: "content_posts",
};

// ---- helpers ---------------------------------------------------------
function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...extra },
  });
}
function err(code: string, message: string, status: number, details?: unknown) {
  return json({ error: { code, message, details } }, status);
}
async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function scopeArr(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  try { return JSON.parse(String(v || "[]")); } catch { return []; }
}
function pick(body: Record<string, unknown>, allowed: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) out[k] = body[k];
  return out;
}

// leads has TWO status columns on the live schema:
//   status      text, CHECK (Lead|LQL|MQL|MQN|SQL)  -> German qualification stage
//   lead_status crm_lead_status enum (new|open|...) -> the API's "status" field
// The API exposes lead_status as `status` and the German stage as `qualification`.
function shape(resource: string, row: Record<string, unknown> | null) {
  if (row && resource === "contacts") {
    row.qualification = row.status;
    row.status = row.lead_status;
  }
  return row;
}

interface Cred {
  id: string;
  kind: "api_key" | "oauth";
  team_id: string;
  scopes: string[];
  rate_limit: number;
}

// Resolve a credential from the request. Returns null if unauthenticated.
async function authenticate(req: Request): Promise<Cred | "invalid" | null> {
  const apiKeyHeader = req.headers.get("x-api-key");
  const authz = req.headers.get("authorization") || "";
  const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
  const raw = apiKeyHeader || bearer;
  if (!raw) return null;

  const hash = await sha256(raw);

  // API key path (prefix lk_live_) or fall through to try both.
  if (raw.startsWith("lk_live_")) {
    const { data } = await db.from("api_keys")
      .select("id, team_id, scopes, rate_limit, expires_at, revoked_at")
      .eq("key_hash", hash).maybeSingle();
    if (!data) return "invalid";
    if (data.revoked_at) return "invalid";
    if (data.expires_at && new Date(data.expires_at) < new Date()) return "invalid";
    // touch last_used_at (throttled)
    db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
    return { id: data.id, kind: "api_key", team_id: data.team_id, scopes: scopeArr(data.scopes), rate_limit: data.rate_limit ?? 120 };
  }

  // OAuth access token path
  const { data } = await db.from("oauth_access_tokens")
    .select("id, client_id, team_id, scopes, expires_at")
    .eq("token_hash", hash).maybeSingle();
  if (!data) return "invalid";
  if (new Date(data.expires_at) < new Date()) return "invalid";
  const { data: client } = await db.from("oauth_clients").select("rate_limit, revoked_at").eq("id", data.client_id).maybeSingle();
  if (client?.revoked_at) return "invalid";
  return { id: data.client_id, kind: "oauth", team_id: data.team_id, scopes: scopeArr(data.scopes), rate_limit: client?.rate_limit ?? 120 };
}

function requireScope(cred: Cred, scope: string): boolean {
  return cred.scopes.includes(scope) || cred.scopes.includes("*");
}

// ---- OAuth2 client-credentials token endpoint ------------------------
async function handleOAuthToken(req: Request): Promise<Response> {
  let clientId = "", clientSecret = "";
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const b = await req.json().catch(() => ({}));
    clientId = b.client_id ?? ""; clientSecret = b.client_secret ?? "";
    if (b.grant_type && b.grant_type !== "client_credentials")
      return err("unsupported_grant_type", "only client_credentials is supported", 400);
  } else {
    const f = new URLSearchParams(await req.text());
    if (f.get("grant_type") && f.get("grant_type") !== "client_credentials")
      return err("unsupported_grant_type", "only client_credentials is supported", 400);
    clientId = f.get("client_id") ?? ""; clientSecret = f.get("client_secret") ?? "";
  }
  if (!clientId || !clientSecret) return err("invalid_request", "client_id and client_secret required", 400);

  const { data: client } = await db.from("oauth_clients")
    .select("id, team_id, scopes, client_secret_hash, revoked_at").eq("client_id", clientId).maybeSingle();
  if (!client || client.revoked_at) return err("invalid_client", "unknown or revoked client", 401);
  if (await sha256(clientSecret) !== client.client_secret_hash)
    return err("invalid_client", "bad client secret", 401);

  const token = "lk_at_" + crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const expiresIn = 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await db.from("oauth_access_tokens").insert({
    client_id: client.id, team_id: client.team_id, token_hash: await sha256(token),
    scopes: client.scopes, expires_at: expiresAt,
  });
  db.from("oauth_clients").update({ last_used_at: new Date().toISOString() }).eq("id", client.id).then(() => {});

  return json({ access_token: token, token_type: "Bearer", expires_in: expiresIn, scope: scopeArr(client.scopes).join(" ") });
}

// ---- resource CRUD ---------------------------------------------------
function validateEnums(resource: string, body: Record<string, unknown>): string | null {
  if (resource === "contacts") {
    if (body.status !== undefined && !ENUM.lead_status.includes(String(body.status))) return `invalid status (allowed: ${ENUM.lead_status.join(", ")})`;
    if (body.lead_source !== undefined && !ENUM.lead_source.includes(String(body.lead_source))) return `invalid lead_source`;
    if (body.lifecycle_stage !== undefined && !ENUM.lifecycle_stage.includes(String(body.lifecycle_stage))) return `invalid lifecycle_stage`;
  }
  if (resource === "deals") {
    if (body.stage !== undefined && !ENUM.deal_stage.includes(String(body.stage))) return `invalid stage (allowed: ${ENUM.deal_stage.join(", ")})`;
  }
  return null;
}

async function handleResource(resource: string, id: string | null, req: Request, cred: Cred, url: URL): Promise<Response> {
  const table = TABLE[resource];
  const scopeBase = resource === "content" ? "content" : resource; // contacts/companies/deals/content
  const method = req.method;

  // --- reads ---
  if (method === "GET") {
    if (!requireScope(cred, `${scopeBase}:read`)) return err("forbidden", `missing scope ${scopeBase}:read`, 403);
    if (id) {
      const { data, error } = await db.from(table).select("*").eq("team_id", cred.team_id).eq("id", id).maybeSingle();
      if (error) return err("db_error", error.message, 500);
      if (!data) return err("not_found", "resource not found", 404);
      return json({ data: shape(resource, data) });
    }
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
    let q = db.from(table).select("*", { count: "exact" }).eq("team_id", cred.team_id);
    // simple filters
    if (url.searchParams.get("q")) {
      if (resource === "contacts") q = q.or(`name.ilike.%${url.searchParams.get("q")}%,email.ilike.%${url.searchParams.get("q")}%,company.ilike.%${url.searchParams.get("q")}%`);
      else if (resource === "companies") q = q.ilike("name", `%${url.searchParams.get("q")}%`);
      else if (resource === "deals") q = q.ilike("title", `%${url.searchParams.get("q")}%`);
    }
    if (resource === "contacts" && url.searchParams.get("status")) q = q.eq("lead_status", url.searchParams.get("status"));
    if (resource === "deals" && url.searchParams.get("stage")) q = q.eq("stage", url.searchParams.get("stage"));
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) return err("db_error", error.message, 500);
    const shaped = (data ?? []).map((r) => shape(resource, r as Record<string, unknown>));
    return json({ data: shaped, pagination: { limit, offset, total: count ?? null } });
  }

  // --- writes ---
  if (method === "POST" || method === "PATCH") {
    if (!requireScope(cred, `${scopeBase}:write`)) return err("forbidden", `missing scope ${scopeBase}:write`, 403);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return err("invalid_request", "JSON body required", 400);
    const enumErr = validateEnums(resource, body as Record<string, unknown>);
    if (enumErr) return err("validation_error", enumErr, 422);
    const payload = pick(body as Record<string, unknown>, WRITABLE[resource as keyof typeof WRITABLE]);
    if (resource === "contacts" && "status" in payload) { payload.lead_status = payload.status; delete payload.status; }

    if (method === "POST") {
      if (resource === "companies" && !payload.name) return err("validation_error", "name is required", 422);
      if (resource === "deals" && !payload.title) return err("validation_error", "title is required", 422);
      payload.team_id = cred.team_id;
      const { data, error } = await db.from(table).insert(payload).select("*").single();
      if (error) return err("db_error", error.message, 400);
      return json({ data: shape(resource, data) }, 201);
    }
    // PATCH
    if (!id) return err("invalid_request", "id required for update", 400);
    if (Object.keys(payload).length === 0) return err("invalid_request", "no writable fields in body", 400);
    payload.updated_at = new Date().toISOString();
    const { data, error } = await db.from(table).update(payload).eq("team_id", cred.team_id).eq("id", id).select("*").maybeSingle();
    if (error) return err("db_error", error.message, 400);
    if (!data) return err("not_found", "resource not found", 404);
    return json({ data: shape(resource, data) });
  }

  if (method === "DELETE") {
    if (!requireScope(cred, `${scopeBase}:write`)) return err("forbidden", `missing scope ${scopeBase}:write`, 403);
    if (!id) return err("invalid_request", "id required", 400);
    const { error, count } = await db.from(table).delete({ count: "exact" }).eq("team_id", cred.team_id).eq("id", id);
    if (error) return err("db_error", error.message, 400);
    if (!count) return err("not_found", "resource not found", 404);
    return new Response(null, { status: 204, headers: CORS });
  }

  return err("method_not_allowed", `${method} not allowed on ${resource}`, 405);
}

async function handleReports(sub: string, cred: Cred): Promise<Response> {
  if (!requireScope(cred, "reports:read")) return err("forbidden", "missing scope reports:read", 403);
  if (sub !== "summary") return err("not_found", "unknown report", 404);

  const [{ data: leads }, { data: deals }, { data: weekly }] = await Promise.all([
    db.from("leads").select("lead_status").eq("team_id", cred.team_id),
    db.from("deals").select("stage, value").eq("team_id", cred.team_id),
    db.from("weekly_activity").select("week_start, new_connections, messages_sent, posts_published, profile_views").eq("team_id", cred.team_id).order("week_start", { ascending: false }).limit(8),
  ]);
  const statusCounts: Record<string, number> = {};
  for (const l of leads ?? []) statusCounts[l.lead_status ?? "unknown"] = (statusCounts[l.lead_status ?? "unknown"] || 0) + 1;

  const stageCounts: Record<string, number> = {};
  let pipelineValue = 0;
  for (const d of deals ?? []) {
    stageCounts[d.stage ?? "unknown"] = (stageCounts[d.stage ?? "unknown"] || 0) + 1;
    if (!["gewonnen", "verloren", "kein_deal"].includes(d.stage)) pipelineValue += Number(d.value || 0);
  }

  return json({
    data: {
      contacts: { total: leads?.length ?? 0, by_status: statusCounts },
      deals: { total: deals?.length ?? 0, by_stage: stageCounts, open_pipeline_value: pipelineValue },
      weekly_activity: weekly ?? [],
    },
  });
}

// ---- entrypoint ------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  // strip everything up to and including the function name
  const parts = url.pathname.split("/").filter(Boolean);
  const fnIdx = parts.indexOf("public-api");
  const seg = fnIdx >= 0 ? parts.slice(fnIdx + 1) : parts;   // e.g. ["v1","contacts","<id>"]
  const version = seg[0];
  if (version !== "v1") return err("not_found", "unknown API version, use /v1", 404);
  const resource = seg[1];
  const rest = seg[2] ?? null;

  // OAuth token endpoint is unauthenticated (uses client creds in body)
  if (resource === "oauth" && rest === "token") {
    if (req.method !== "POST") return err("method_not_allowed", "use POST", 405);
    return handleOAuthToken(req);
  }

  // authenticate
  const cred = await authenticate(req);
  if (cred === null) return err("unauthorized", "provide X-API-Key or Bearer token", 401);
  if (cred === "invalid") return err("unauthorized", "invalid or expired credential", 401);

  // rate limit
  const { data: rl } = await db.rpc("api_rate_check", { p_credential_id: cred.id, p_limit: cred.rate_limit });
  const row = Array.isArray(rl) ? rl[0] : rl;
  const rlHeaders: Record<string, string> = row ? {
    "X-RateLimit-Limit": String(cred.rate_limit),
    "X-RateLimit-Remaining": String(row.remaining),
    "X-RateLimit-Reset": String(Math.floor(new Date(row.reset_at).getTime() / 1000)),
  } : {};
  if (row && row.allowed === false) {
    // log + 429
    db.from("api_request_log").insert({ credential_id: cred.id, credential_kind: cred.kind, team_id: cred.team_id, method: req.method, path: url.pathname, status: 429, ip: req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") }).then(() => {});
    return json({ error: { code: "rate_limited", message: "rate limit exceeded" } }, 429, rlHeaders);
  }

  let res: Response;
  try {
    if (resource === "reports") res = await handleReports(rest ?? "summary", cred);
    else if (resource in TABLE) res = await handleResource(resource, rest, req, cred, url);
    else res = err("not_found", `unknown resource '${resource ?? ""}'`, 404);
  } catch (e) {
    res = err("internal_error", String(e instanceof Error ? e.message : e), 500);
  }

  // attach rate headers + log
  for (const [k, v] of Object.entries(rlHeaders)) res.headers.set(k, v);
  db.from("api_request_log").insert({ credential_id: cred.id, credential_kind: cred.kind, team_id: cred.team_id, method: req.method, path: url.pathname, status: res.status, ip: req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") }).then(() => {});
  return res;
});
