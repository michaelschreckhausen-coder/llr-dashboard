// =====================================================================
// _shared/instagram-unipile.ts — Unipile-Adapter für den INSTAGRAM-Provider.
//
// Warum ein eigener Adapter neben _shared/unipile.ts:
//   _shared/unipile.ts ist auf den LinkedIn-Store public.unipile_accounts
//   verdrahtet (getUnipileConnection filtert NICHT auf Provider). Instagram
//   hat einen eigenen Store (public.instagram_unipile_accounts), damit
//   LinkedIn-Worker strukturell nie eine IG-account_id greifen können.
//   Siehe Migration 20260715100000 + docs/instagram-unipile-rebuild-konzept.md.
//
// Auth-Modell (identisch zu LinkedIn):
//   * EIN globaler API-Key   -> Env UNIPILE_API_KEY
//   * EINE globale DSN       -> Env UNIPILE_DSN  (z.B. api8.unipile.com:13842)
//   * account_id je Session  -> instagram_unipile_accounts.unipile_account_id
//   * account_id IMMER als Query-Param (Unipile-Vorgabe), nie im Body.
//
// Endpunkte laut https://developer.unipile.com/reference — für Instagram sind
// Chats/Messages/Users provider-agnostisch (gleiche Routen wie LinkedIn).
// =====================================================================
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function serviceClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export function userClientFromReq(req: Request): SupabaseClient | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

export async function getAuthenticatedUser(req: Request): Promise<{ userId: string } | null> {
  const c = userClientFromReq(req);
  if (!c) return null;
  const { data, error } = await c.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

/** Addon-Gate. Fallstrick #12: error auslesen → bei Fehler defensiv false. */
export async function hasAddon(userClient: SupabaseClient, slug = "instagram"): Promise<boolean> {
  const { data, error } = await userClient.rpc("i_have_addon", { p_slug: slug });
  if (error) {
    console.warn(`[ig-unipile] i_have_addon(${slug}): ${error.message}`);
    return false;
  }
  return !!data;
}

// ---------------------------------------------------------------------
// Low-level
// ---------------------------------------------------------------------
export class InstagramUnipileError extends Error {
  status: number;
  detail: unknown;
  retryable: boolean;
  constructor(status: number, detail: unknown) {
    super(`Unipile(IG) API ${status}: ${JSON.stringify(detail)?.slice(0, 400)}`);
    this.status = status;
    this.detail = detail;
    // Retry-Klassifikation analog unipile-client.ts: 429 + 5xx + Netzwerk (status 0).
    this.retryable = status === 0 || status === 429 || status >= 500;
  }
  get isRateLimited() {
    return this.status === 429;
  }
}

type Query = Record<string, string | number | undefined | null>;

function baseUrl(): string {
  const dsn = requireEnv("UNIPILE_DSN");
  return dsn.startsWith("http") ? dsn : `https://${dsn}`;
}

function withQuery(url: string, q: Query): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export async function call(
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: { query?: Query; body?: unknown; form?: FormData } = {},
): Promise<any> {
  const url = withQuery(`${baseUrl()}${path}`, opts.query ?? {});
  const isForm = opts.form !== undefined;
  const headers: Record<string, string> = { "X-API-KEY": requireEnv("UNIPILE_API_KEY"), accept: "application/json" };
  // WICHTIG bei multipart: Content-Type NICHT setzen — fetch generiert die boundary.
  if (!isForm) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: isForm ? opts.form : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new InstagramUnipileError(0, { network: String((e as Error)?.message ?? e) });
  }

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) throw new InstagramUnipileError(res.status, parsed);
  return parsed;
}

// ---------------------------------------------------------------------
// Connection-Lookup (IG-Store)
// ---------------------------------------------------------------------
export interface IgConn {
  accountId: string; // unipile_account_id
  rowId: string;     // instagram_unipile_accounts.id
  teamId: string;
  userId: string;
  providerId: string | null;
  username: string | null;
}

/**
 * Aktive IG-Session eines Teams. Cross-Check gegen Unipile: eine lokal als OK
 * geführte Session kann dort längst tot sein (Reconnect → neue account_id).
 * Fallstrick #12: error IMMER auslesen, sonst silent-null bei fehlenden Grants.
 */
export async function getIgConnection(sb: SupabaseClient, teamId: string): Promise<IgConn | null> {
  const { data: rows, error } = await sb
    .from("instagram_unipile_accounts")
    .select("id, unipile_account_id, team_id, user_id, provider_id, username, status, last_status_update")
    .eq("team_id", teamId)
    .eq("status", "OK")
    .not("unipile_account_id", "is", null)
    .order("last_status_update", { ascending: false });

  if (error) {
    console.warn(`[ig-unipile] getIgConnection lookup: ${error.message}`);
    return null;
  }
  if (!rows?.length) return null;

  // Cross-Check gegen die real gültigen Unipile-Accounts. Bei API-Fehler
  // Best-Effort (neueste OK-Zeile) statt hartem Abbruch.
  let validIds: Set<string> | null = null;
  try {
    const res = await call("GET", "/api/v1/accounts");
    validIds = new Set(((res?.items ?? []) as any[]).map((a) => a?.id).filter(Boolean));
  } catch (e) {
    console.warn(`[ig-unipile] accounts cross-check: ${e}`);
  }

  const pick = validIds ? rows.find((r: any) => validIds!.has(r.unipile_account_id)) : rows[0];
  if (!pick) return null;
  return {
    accountId: pick.unipile_account_id as string,
    rowId: pick.id as string,
    teamId: pick.team_id as string,
    userId: pick.user_id as string,
    providerId: (pick.provider_id as string) ?? null,
    username: (pick.username as string) ?? null,
  };
}

// ---------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------
/** GET /accounts/{id} — Rohdaten inkl. type ("INSTAGRAM") + sources[].status. */
export function getAccount(accountId: string): Promise<any> {
  return call("GET", `/api/v1/accounts/${encodeURIComponent(accountId)}`);
}

/** GET /users/me?account_id= — eigenes IG-Profil (provider_id, username). */
export function getOwnProfile(accountId: string): Promise<any> {
  return call("GET", "/api/v1/users/me", { query: { account_id: accountId } });
}

/** GET /users/{identifier}?account_id= — Fremdprofil, löst provider_id auf. */
export function getProfile(accountId: string, identifier: string): Promise<any> {
  return call("GET", `/api/v1/users/${encodeURIComponent(identifier)}`, {
    query: { account_id: accountId },
  });
}

// ---------------------------------------------------------------------
// Chats & Messages (P1 = read)
// ---------------------------------------------------------------------
/** GET /chats?account_id=&cursor=&limit= — Chat-Liste (eine Seite). */
export function listChats(accountId: string, cursor?: string | null, limit = 50): Promise<any> {
  return call("GET", "/api/v1/chats", { query: { account_id: accountId, cursor: cursor ?? undefined, limit } });
}

/** GET /chats/{chat_id}/messages?account_id=&cursor=&limit= — Verlauf (eine Seite). */
export function listChatMessages(
  accountId: string,
  chatId: string,
  cursor?: string | null,
  limit = 50,
): Promise<any> {
  return call("GET", `/api/v1/chats/${encodeURIComponent(chatId)}/messages`, {
    query: { account_id: accountId, cursor: cursor ?? undefined, limit },
  });
}

/** GET /chats/{chat_id}/attendees?account_id= — Teilnehmer eines Chats. */
export function listChatAttendees(accountId: string, chatId: string): Promise<any> {
  return call("GET", `/api/v1/chats/${encodeURIComponent(chatId)}/attendees`, {
    query: { account_id: accountId },
  });
}

// ---------------------------------------------------------------------
// Normalisierung Unipile → DB-Shape
// ---------------------------------------------------------------------
export interface NormalizedAttendee {
  provider_id: string | null;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
}

/** Attendee-Felder sind je Provider/Route leicht unterschiedlich benannt → defensiv mappen. */
export function normalizeAttendee(a: any): NormalizedAttendee {
  return {
    provider_id: a?.provider_id ?? a?.id ?? null,
    username: a?.username ?? a?.public_identifier ?? a?.handle ?? null,
    name: a?.name ?? a?.display_name ?? a?.full_name ?? null,
    avatar_url: a?.profile_picture_url ?? a?.picture_url ?? a?.avatar_url ?? null,
  };
}

/** Unipile-Message → instagram_messages-Row-Shape (ohne team_id/chat_id). */
export function normalizeMessage(m: any, ownProviderId: string | null) {
  const senderId = m?.sender_id ?? m?.sender?.id ?? m?.from?.id ?? null;
  // is_sender ist Unipile-eigen (1/0) und die verlässlichste Quelle; Fallback auf
  // Vergleich mit der eigenen provider_id.
  const isOutbound =
    m?.is_sender === 1 || m?.is_sender === true
      ? true
      : ownProviderId != null && senderId != null
      ? String(senderId) === String(ownProviderId)
      : false;

  const atts = (m?.attachments ?? []).map((x: any) => ({
    id: x?.id ?? null,
    type: x?.type ?? null,
    url: x?.url ?? null,
    filename: x?.file_name ?? x?.filename ?? null,
    mime: x?.mimetype ?? x?.mime_type ?? null,
  }));

  const reactions = (m?.reactions ?? []).map((r: any) => ({
    value: r?.value ?? r?.emoji ?? null,
    sender_provider_id: r?.sender_id ?? null,
  }));

  return {
    unipile_message_id: String(m?.id ?? ""),
    provider_message_id: m?.provider_id ?? null,
    sender_provider_id: senderId != null ? String(senderId) : null,
    is_outbound: isOutbound,
    text: m?.text ?? null,
    attachments: atts,
    reactions,
    is_read: m?.seen === 1 || m?.seen === true || !!m?.is_read,
    sent_at: m?.timestamp ?? m?.date ?? null,
    raw: m,
  };
}
