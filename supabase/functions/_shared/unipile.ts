// =====================================================================
// Unipile-API-Client + Supabase-Service-Helfer für die LinkedIn-Erweiterung.
//
// Auth-Modell (Unipile):
//   * EIN globaler API-Key pro Unipile-Subscription  -> Env UNIPILE_API_KEY
//   * EINE globale DSN (subdomain.unipile.com:port)   -> Env UNIPILE_DSN
//     (kein Per-Account-DSN im realen Setup — unipile_accounts hat keine DSN-Spalte)
//   * account_id je verbundenem LinkedIn-Login        -> unipile_accounts.unipile_account_id
//
// ANSCHLUSS AN DAS REALE REPO-SETUP (2026-07): Der Account-/Verbindungs-Store ist
// public.unipile_accounts (angelegt in 20260706150000_unipile_integration.sql),
// befüllt von unipile-webhook / unipile-connect-link. NICHT linkedin_connections
// (das ist der alte Chrome-Extension-Store ohne team_id/unipile_account_id).
//
// Alle Requests: Header "X-API-KEY", account_id IMMER als Query-Param
// (nicht im Body — Unipile-Vorgabe).
// =====================================================================
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function unipileConfig() {
  return {
    apiKey: requireEnv("UNIPILE_API_KEY"),
    dsn: requireEnv("UNIPILE_DSN"), // z.B. api8.unipile.com:13842
  };
}

/** Basis-URL bauen; erlaubt DSN-Override pro Verbindung. */
function baseUrl(dsnOverride?: string | null): string {
  const dsn = (dsnOverride && dsnOverride.trim()) || unipileConfig().dsn;
  return dsn.startsWith("http") ? dsn : `https://${dsn}`;
}

/** Supabase-Client mit Service-Role (umgeht RLS — nur serverseitig!). */
export function serviceClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

/** Leadesk-JWT verifizieren -> User-ID (für user-getriggerte Functions). */
export async function getAuthenticatedUser(
  req: Request,
): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const anon = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data, error } = await anon.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

/** Supabase-Client mit dem User-JWT aus dem Request (für RLS-/SECURITY-DEFINER-RPCs
 *  wie i_have_addon, die auth.uid() auswerten). Null wenn kein Authorization-Header. */
export function userClientFromReq(req: Request): SupabaseClient | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
}

/** Addon-Gate: prüft via RPC i_have_addon({p_slug}) ob das aktive Konto das
 *  Addon aktiv hat. Gleiche Autorität wie unipile-connect-link (Addon 'automation').
 *  Fallstrick #12: error prüfen -> bei Fehler defensiv false (kein Zugriff). */
export async function hasAddon(
  userClient: SupabaseClient,
  slug = "automation",
): Promise<boolean> {
  const { data, error } = await userClient.rpc("i_have_addon", { p_slug: slug });
  if (error) {
    console.warn(`[unipile] i_have_addon(${slug}): ${error.message}`);
    return false;
  }
  return !!data;
}

// ---------------------------------------------------------------------
// Verbindungs-Lookup: aktiver Unipile-Account für einen Leadesk-User.
// ---------------------------------------------------------------------
export interface UnipileConn {
  accountId: string;
  dsn: string | null;       // real immer null -> globales UNIPILE_DSN-Env (kein Per-Account-DSN)
  connectionId: string;     // unipile_accounts.id
  teamId: string;           // unipile_accounts.team_id (für team_id in allen Inserts)
  userId: string;           // Besitzer des LinkedIn-Accounts
}

export async function getUnipileConnection(
  sb: SupabaseClient,
  userId: string,
): Promise<UnipileConn | null> {
  // ALLE OK-Zeilen des Users (neueste zuerst) — nicht nur die neueste, weil die
  // bei Unipile längst ungültig sein kann (Reconnect -> neue account_id).
  const { data: rows, error } = await sb
    .from("unipile_accounts")
    .select("id, unipile_account_id, team_id, user_id, status, last_status_update")
    .eq("user_id", userId)
    .eq("status", "OK")                          // nur funktionierende LinkedIn-Session
    .not("unipile_account_id", "is", null)
    .order("last_status_update", { ascending: false }); // neueste OK-Session zuerst
  // Fallstrick #12: error immer prüfen (silent-null bei fehlenden Grants).
  if (error) {
    console.warn(`[unipile] getUnipileConnection lookup: ${error.message}`);
    return null;
  }
  if (!rows || rows.length === 0) return null;

  // Durable Cross-Check: EINMAL die real bei Unipile gültigen account_ids holen und
  // nur eine OK-Zeile zurückgeben, deren unipile_account_id dort existiert. Sonst
  // liefert der Worker eine tote ID -> "Account not found" statt sauberem null/409.
  let validIds: Set<string> | null = null;
  try {
    const res = await call("GET", "/api/v1/accounts");
    const items: any[] = res?.items ?? [];
    validIds = new Set(items.map((a: any) => a?.id).filter(Boolean));
  } catch (e) {
    console.warn(`[unipile] getUnipileConnection accounts cross-check: ${e}`);
    // Bei API-Fehler NICHT hart abbrechen: nimm die neueste OK-Zeile (Best-Effort,
    // Verhalten wie vor dem Cross-Check).
    validIds = null;
  }

  const pick = validIds
    ? rows.find((r: any) => validIds!.has(r.unipile_account_id as string))
    : rows[0];
  if (!pick) return null;   // keine der OK-Zeilen ist bei Unipile real gültig
  return {
    accountId: pick.unipile_account_id as string,
    dsn: null,
    connectionId: pick.id as string,
    teamId: pick.team_id as string,
    userId: pick.user_id as string,
  };
}

// ---------------------------------------------------------------------
// Low-level Request-Helfer
// ---------------------------------------------------------------------
type Query = Record<string, string | number | undefined>;

function withQuery(url: string, q: Query): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function call(
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: { dsn?: string | null; query?: Query; body?: unknown; form?: FormData } = {},
): Promise<any> {
  const { apiKey } = unipileConfig();
  const url = withQuery(`${baseUrl(opts.dsn)}${path}`, opts.query ?? {});
  // Multipart-Zweig: wenn opts.form gesetzt ist, sendet fetch multipart/form-data.
  // WICHTIG: Content-Type NICHT manuell setzen — fetch generiert die boundary selbst.
  // (Unipile POST /posts erwartet multipart, nicht JSON.)
  const isForm = opts.form !== undefined;
  const headers: Record<string, string> = { "X-API-KEY": apiKey, accept: "application/json" };
  if (!isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isForm
      ? opts.form
      : (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new UnipileError(res.status, parsed);
  }
  return parsed;
}

export class UnipileError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(`Unipile API ${status}: ${JSON.stringify(detail)?.slice(0, 400)}`);
    this.status = status;
    this.detail = detail;
  }
  /** 429 = Rate-Limit von LinkedIn/Unipile — Worker sollte zurückstellen. */
  get isRateLimited() {
    return this.status === 429;
  }
}

// ---------------------------------------------------------------------
// Feature-spezifische Endpunkte
// (Pfade laut Unipile-Doku; bei API-Version-Drift im README verlinkt.)
// ---------------------------------------------------------------------

// -- Feature 1: Suche -------------------------------------------------
// POST /api/v1/linkedin/search?account_id=...&cursor=...
export async function linkedinSearch(
  conn: UnipileConn,
  body: Record<string, unknown>,
  cursor?: string,
): Promise<any> {
  return await call("POST", "/api/v1/linkedin/search", {
    dsn: conn.dsn,
    query: { account_id: conn.accountId, cursor },
    body,
  });
}

// Freitext → LinkedIn-Parameter-ID auflösen (LOCATION/INDUSTRY/COMPANY/SCHOOL/…).
// GET /api/v1/linkedin/search/parameters?account_id=&type=&keywords= → erstes Match.
// Nötig weil Classic-People location/industry/company als Array<ID-String> erwartet,
// NIE Freitext (sonst 400 invalid_parameters / anyOf-Bruch). Kein Match → null (Filter weglassen).
export async function resolveSearchParameter(
  conn: UnipileConn,
  type: "LOCATION" | "INDUSTRY" | "COMPANY" | "SCHOOL" | "SERVICE",
  keywords: string,
): Promise<string | null> {
  const res = await call("GET", "/api/v1/linkedin/search/parameters", {
    dsn: conn.dsn,
    query: { account_id: conn.accountId, type, keywords },
  });
  const items: any[] = res?.items ?? [];
  return items.length ? String(items[0].id) : null;
}

// -- Feature 2: Post veröffentlichen ---------------------------------
// POST /api/v1/posts — multipart/form-data (NICHT JSON!).
// Erfolg: 201 -> { object: "PostCreated", post_id: "<numerisch>" }.
export interface CreatePostExtra {
  /** Bilder/Files als multipart-`attachments` (aus dem visuals-Storage-Bucket). */
  attachments?: Blob[];
  /** @-Mentions: Text nutzt {{index}}, hier die zugehörigen Profile. */
  mentions?: { name: string; profile_id: string }[];
  // as_organization?: string;  // Phase 2b — Company-Page-Targeting (hier bewusst NICHT verdrahtet)
}
export async function createPost(
  conn: UnipileConn,
  text: string,
  extra: CreatePostExtra = {},
): Promise<any> {
  const fd = new FormData();
  fd.append("account_id", conn.accountId); // Default: account_id als Form-Feld
  fd.append("text", text);
  const attachments = extra.attachments ?? [];
  for (let i = 0; i < attachments.length; i++) {
    const file = attachments[i];
    const name = (file as unknown as { name?: string }).name ?? `attachment_${i}`;
    fd.append("attachments", file, name);
  }
  const mentions = extra.mentions ?? [];
  if (mentions.length > 0) fd.append("mentions", JSON.stringify(mentions));
  return await call("POST", "/api/v1/posts", {
    dsn: conn.dsn,
    query: { account_id: conn.accountId }, // Query-Fallback (Unipile akzeptiert account_id auch als Query)
    form: fd,
  });
}

// -- Feature 3: Engagement -------------------------------------------
// POST /api/v1/posts/reaction  { account_id, post_id, reaction_type }
export async function addReaction(
  conn: UnipileConn,
  socialId: string,
  reactionType = "like",
): Promise<any> {
  return await call("POST", "/api/v1/posts/reaction", {
    dsn: conn.dsn,
    body: { account_id: conn.accountId, post_id: socialId, reaction_type: reactionType },
  });
}
// POST /api/v1/posts/{social_id}/comments  { account_id, text }
export async function sendComment(
  conn: UnipileConn,
  socialId: string,
  text: string,
): Promise<any> {
  return await call("POST", `/api/v1/posts/${encodeURIComponent(socialId)}/comments`, {
    dsn: conn.dsn,
    body: { account_id: conn.accountId, text },
  });
}

// -- Feature 4: Monitoring -------------------------------------------
// GET /api/v1/posts/{social_id}?account_id=...   (Metriken/Reaktionen)
export async function getPost(conn: UnipileConn, socialId: string): Promise<any> {
  return await call("GET", `/api/v1/posts/${encodeURIComponent(socialId)}`, {
    dsn: conn.dsn,
    query: { account_id: conn.accountId },
  });
}
// GET /api/v1/posts/{social_id}/comments?account_id=...&cursor=...
export async function listPostComments(
  conn: UnipileConn,
  socialId: string,
  cursor?: string,
): Promise<any> {
  return await call("GET", `/api/v1/posts/${encodeURIComponent(socialId)}/comments`, {
    dsn: conn.dsn,
    query: { account_id: conn.accountId, cursor },
  });
}

// -- Feature 5: Invitations ------------------------------------------
// GET /api/v1/users/invite/sent?account_id=...   (pending invitations)
export async function listSentInvitations(
  conn: UnipileConn,
  cursor?: string,
): Promise<any> {
  return await call("GET", "/api/v1/users/invite/sent", {
    dsn: conn.dsn,
    query: { account_id: conn.accountId, cursor },
  });
}
// DELETE /api/v1/users/invite/sent/{invitation_id}?account_id=...  (withdraw; das /sent/-Segment ist Pflicht -> sonst 404)
export async function withdrawInvitation(
  conn: UnipileConn,
  invitationId: string,
): Promise<any> {
  return await call("DELETE", `/api/v1/users/invite/sent/${encodeURIComponent(invitationId)}`, {
    dsn: conn.dsn,
    query: { account_id: conn.accountId },
  });
}

// -- Feature 6: Enrichment -------------------------------------------
// GET /api/v1/users/{identifier}?account_id=...&linkedin_sections=*
export async function getProfile(
  conn: UnipileConn,
  identifier: string,
): Promise<any> {
  return await call("GET", `/api/v1/users/${encodeURIComponent(identifier)}`, {
    dsn: conn.dsn,
    query: { account_id: conn.accountId, linkedin_sections: "*" },
  });
}
// GET /api/v1/linkedin/company/{identifier}?account_id=...
export async function getCompany(
  conn: UnipileConn,
  identifier: string,
): Promise<any> {
  return await call("GET", `/api/v1/linkedin/company/${encodeURIComponent(identifier)}`, {
    dsn: conn.dsn,
    query: { account_id: conn.accountId },
  });
}

// ---------------------------------------------------------------------
// Utility: LinkedIn-URL -> identifier (public_identifier / letzter Pfadteil)
// ---------------------------------------------------------------------
export function identifierFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/(?:in|company)\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

// ---------------------------------------------------------------------
// Utility: Post-URL / URN / nackte id -> LinkedIn-Post-URN.
// Erkennt ugcPost / activity / share (native ugcPosts vs. Unipile-activity).
// ---------------------------------------------------------------------
export function postUrnFromUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  const urn = s.match(/urn:li:(activity|ugcPost|share):(\d+)/i);
  if (urn) return `urn:li:${urn[1]}:${urn[2]}`;
  const slug = s.match(/(ugcPost|activity|share)[-:](\d{6,})/i); // …ugcPost-<id>…
  if (slug) return `urn:li:${slug[1]}:${slug[2]}`;
  const num = s.match(/(\d{15,})/); // nackte numerische id (Default activity)
  if (num) return `urn:li:activity:${num[1]}`;
  return null;
}

// Robust: baut die URN aus der URL und prüft via getPost gegen; bei 404 die
// jeweils andere Form (activity <-> ugcPost). Gibt die real auflösende social_id
// zurück oder null (dann Job-Error "kein Post-Identifier ableitbar").
export async function resolvePostSocialId(
  conn: UnipileConn,
  input: string | null | undefined,
): Promise<string | null> {
  const primary = postUrnFromUrl(input);
  if (!primary) return null;
  // Alle drei Formen als Kandidaten (primary zuerst): welche getPost real auflöst,
  // ist die social_id. Deckt share->activity/ugcPost mit ab.
  const num = primary.match(/:(\d+)$/)?.[1];
  const candidates = num
    ? [primary, ...["activity", "ugcPost", "share"]
        .map((t) => `urn:li:${t}:${num}`).filter((c) => c !== primary)]
    : [primary];
  for (const c of candidates) {
    try {
      await getPost(conn, c);
      return c;
    } catch (e) {
      if (!(e instanceof UnipileError) || e.status !== 404) throw e;
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Utility: einfacher Tages-Rate-Guard je Aktionstyp und User.
// Zählt erledigte Jobs "heute" in der übergebenen Tabelle/Spalte.
// ---------------------------------------------------------------------
export async function dailyCount(
  sb: SupabaseClient,
  table: string,
  userId: string,
  tsColumn: string,
): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte(tsColumn, since.toISOString());
  if (error) {
    console.warn(`[unipile] dailyCount(${table}): ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

// ---------------------------------------------------------------------
// Social Selling Index (SSI) — via Unipile "Get Raw Data" (Magic) Route.
// LinkedIn liefert SSI nur point-in-time; wir holen es serverseitig (kein
// Extension-Scrape mehr) und bauen den Verlauf über tägliche Snapshots.
// Endpoint (laut Unipile-Doku): GET https://www.linkedin.com/sales-api/salesApiSsi
// Antwort: memberScore.overall + subScores[PROFESSIONAL_BRAND/FIND_RIGHT_PEOPLE/
// INSIGHT_ENGAGEMENT/STRONG_RELATIONSHIP], groupScore[INDUSTRY|NETWORK].rank.
// ---------------------------------------------------------------------
export interface SsiResult {
  total: number | null;
  build_brand: number | null;
  find_people: number | null;
  engage_insights: number | null;
  build_relationships: number | null;
  industry_rank: number | null;
  network_rank: number | null;
  active_seat: boolean;
}

export async function getSocialSellingIndex(
  accountId: string,
  dsn?: string | null,
): Promise<SsiResult> {
  const res = await call("POST", "/api/v1/linkedin", {
    dsn,
    query: { account_id: accountId },
    body: {
      account_id: accountId,
      request_url: "https://www.linkedin.com/sales-api/salesApiSsi",
      force_api: true,
      method: "GET",
    },
  });
  const d: any = res?.data ?? res ?? {};
  const sub: any[] = d?.memberScore?.subScores ?? [];
  const grp: any[] = d?.groupScore ?? [];
  const pillar = (name: string): number | null => {
    const p = sub.find((x) => x?.pillar === name);
    return p && p.score != null ? Number(p.score) : null;
  };
  const rankOf = (t: string): number | null => {
    const g = grp.find((x) => x?.groupType === t);
    return g && g.rank != null ? Number(g.rank) : null;
  };
  return {
    total: d?.memberScore?.overall != null ? Number(d.memberScore.overall) : null,
    build_brand: pillar("PROFESSIONAL_BRAND"),
    find_people: pillar("FIND_RIGHT_PEOPLE"),
    engage_insights: pillar("INSIGHT_ENGAGEMENT"),
    build_relationships: pillar("STRONG_RELATIONSHIP"),
    industry_rank: rankOf("INDUSTRY"),
    network_rank: rankOf("NETWORK"),
    active_seat: !!d?.activeSeat,
  };
}
