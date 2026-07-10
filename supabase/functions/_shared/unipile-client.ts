// _shared/unipile-client.ts — zentraler Unipile-Adapter für die la_*-Greenfield-Automation.
// Kapselt ALLE Unipile-Calls an einer Stelle. Base-URL/Key aus Env (UNIPILE_DSN, UNIPILE_API_KEY —
// Namen aus der Staging-.env). Endpunkt-Form gegen die bestehende EF + https://developer.unipile.com:
//   GET  /api/v1/users/{identifier}?account_id=   (Profil, liefert provider_id)
//   POST /api/v1/users/invite  { account_id, provider_id, message? }   (Vernetzungsanfrage)
// Fehler typisiert: retryable (Netzwerk/Timeout/429/5xx) vs terminal (4xx). P1 nutzt den Staging-Kontext
// (geteilter Key); Env-Key-Split kommt in P6.

const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN");
const UNIPILE_API_KEY = Deno.env.get("UNIPILE_API_KEY");

const BASE = `https://${UNIPILE_DSN}/api/v1`;
const HEADERS = {
  "X-API-KEY": UNIPILE_API_KEY ?? "",
  "accept": "application/json",
  "content-type": "application/json",
};

export type UnipileOk<T> = { ok: true; data: T };
export type UnipileErr = { ok: false; retryable: boolean; status: number | null; type: string | null; detail: string };
export type UnipileResult<T> = UnipileOk<T> | UnipileErr;

// Retry-Klassifikation: Netzwerk/Timeout (status=null), 429 (Rate-/Wochenlimit) und 5xx sind retrybar
// (Runner macht Backoff bis max_attempts → dann dead). Alle anderen 4xx sind terminal (400/401/403/404/422 …).
function isRetryable(status: number | null): boolean {
  if (status === null) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<UnipileResult<T>> {
  if (!UNIPILE_DSN || !UNIPILE_API_KEY) {
    return { ok: false, retryable: false, status: null, type: "config", detail: "UNIPILE_DSN/UNIPILE_API_KEY fehlen im Env" };
  }
  let r: Response;
  try {
    r = await fetch(`${BASE}${path}`, {
      method,
      headers: HEADERS,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, retryable: true, status: null, type: "network", detail: String((e as Error)?.message ?? e) };
  }
  const txt = await r.text();
  if (!r.ok) {
    let type: string | null = null;
    try { type = JSON.parse(txt)?.type ?? null; } catch { /* nicht-JSON */ }
    return { ok: false, retryable: isRetryable(r.status), status: r.status, type, detail: txt.slice(0, 300) };
  }
  let data: T;
  try { data = txt ? (JSON.parse(txt) as T) : ({} as T); } catch { data = ({} as T); }
  return { ok: true, data };
}

// ── Öffentliche P1-Oberfläche ────────────────────────────────────────────────
export interface UnipileProfile { provider_id?: string; public_identifier?: string; name?: string; [k: string]: unknown; }
export interface InvitationSent { object?: string; invitation_id?: string; [k: string]: unknown; }

/** GET /users/{identifier}?account_id= — identifier = public_identifier (Slug) ODER provider_id. Löst provider_id auf. */
export function getProfile(account_id: string, identifier: string): Promise<UnipileResult<UnipileProfile>> {
  return call<UnipileProfile>("GET", `/users/${encodeURIComponent(identifier)}?account_id=${encodeURIComponent(account_id)}`);
}

/** POST /users/invite — Vernetzungsanfrage. note = optionale Notiz (LinkedIn-Limit 300 Zeichen). */
export function sendInvitation(account_id: string, provider_id: string, note?: string): Promise<UnipileResult<InvitationSent>> {
  const body: Record<string, unknown> = { account_id, provider_id };
  if (note) body.message = note;
  return call<InvitationSent>("POST", "/users/invite", body);
}

export interface ChatStarted { object?: string; chat_id?: string; message_id?: string; [k: string]: unknown; }

/** POST /chats (multipart) — startet/findet den Chat mit provider_id und sendet Text (message/follow_up). */
export async function sendMessage(account_id: string, provider_id: string, text: string): Promise<UnipileResult<ChatStarted>> {
  if (!UNIPILE_DSN || !UNIPILE_API_KEY) {
    return { ok: false, retryable: false, status: null, type: "config", detail: "UNIPILE_DSN/UNIPILE_API_KEY fehlen im Env" };
  }
  const form = new FormData();
  form.append("account_id", account_id);
  form.append("text", text);
  form.append("attendees_ids", provider_id);
  let r: Response;
  try {
    r = await fetch(`${BASE}/chats`, { method: "POST", headers: { "X-API-KEY": UNIPILE_API_KEY, "accept": "application/json" }, body: form });
  } catch (e) {
    return { ok: false, retryable: true, status: null, type: "network", detail: String((e as Error)?.message ?? e) };
  }
  const txt = await r.text();
  if (!r.ok) {
    let type: string | null = null;
    try { type = JSON.parse(txt)?.type ?? null; } catch { /* nicht-JSON */ }
    return { ok: false, retryable: isRetryable(r.status), status: r.status, type, detail: txt.slice(0, 300) };
  }
  let data: ChatStarted;
  try { data = txt ? (JSON.parse(txt) as ChatStarted) : ({} as ChatStarted); } catch { data = ({} as ChatStarted); }
  return { ok: true, data };
}

// ── Audiences (P3): Suche + Relations. Rückgabe normalisiert auf Person. ──────
export interface Person {
  provider_id: string | null; public_identifier: string | null;
  name: string | null; headline: string | null; profile_url: string | null; raw: unknown;
}
export interface Page { items: Person[]; cursor: string | null; }

const KIND_TO_API: Record<string, string> = {
  search_classic: "classic", search_salesnav: "sales_navigator", search_recruiter: "recruiter",
};

function normalizePerson(it: any): Person {
  const public_identifier = it?.public_identifier ?? it?.public_id ?? null;
  const profile_url = it?.public_profile_url ?? it?.profile_url
    ?? (public_identifier ? `https://www.linkedin.com/in/${public_identifier}` : null);
  const name = it?.name ?? ([it?.first_name, it?.last_name].filter(Boolean).join(" ") || null);
  return {
    provider_id: it?.provider_id ?? it?.member_id ?? null,   // relations: member_id; search(classic): provider_id
    public_identifier, name, headline: it?.headline ?? null, profile_url, raw: it,
  };
}

/** POST /linkedin/search — People (classic/sales_navigator/recruiter). Eine Seite (Cursor-Pagination im Caller). */
export async function search(
  account_id: string,
  opts: { kind: string; params?: Record<string, unknown>; search_url?: string; cursor?: string | null; limit?: number },
): Promise<UnipileResult<Page>> {
  const api = KIND_TO_API[opts.kind] ?? "classic";
  const body: Record<string, unknown> = { api, category: "people" }; // P3 = People-Suche (via params überschreibbar)
  if (opts.search_url) body.url = opts.search_url;
  if (opts.params) Object.assign(body, opts.params);
  const limit = opts.limit ?? 50;
  const path = `/linkedin/search?account_id=${encodeURIComponent(account_id)}&limit=${limit}`
    + (opts.cursor ? `&cursor=${encodeURIComponent(opts.cursor)}` : "");
  const r = await call<any>("POST", path, body);
  if (!r.ok) return r;
  return { ok: true, data: { items: (r.data?.items ?? []).map(normalizePerson), cursor: r.data?.cursor ?? null } };
}

/** GET /users/relations — eigene Verbindungen. Eine Seite (Cursor-Pagination im Caller). */
export async function getRelations(account_id: string, cursor?: string | null, limit = 100): Promise<UnipileResult<Page>> {
  const path = `/users/relations?account_id=${encodeURIComponent(account_id)}&limit=${limit}`
    + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
  const r = await call<any>("GET", path);
  if (!r.ok) return r;
  return { ok: true, data: { items: (r.data?.items ?? []).map(normalizePerson), cursor: r.data?.cursor ?? null } };
}

// ── P4: restliche Actions (Endpunkte gegen developer.unipile.com verifiziert) ──
export interface PostList { items: any[]; cursor: string | null; }

/** DELETE /users/invite/sent/{invitation_id} — withdraw (invitation_id = provider_ref des invite-Jobs). */
export function cancelInvitationSent(account_id: string, invitation_id: string): Promise<UnipileResult<any>> {
  return call<any>("DELETE", `/users/invite/sent/${encodeURIComponent(invitation_id)}?account_id=${encodeURIComponent(account_id)}`);
}

/** POST /posts/reaction — react (type z.B. 'like'). */
export function sendPostReaction(account_id: string, post_id: string, type = "like"): Promise<UnipileResult<any>> {
  return call<any>("POST", "/posts/reaction", { account_id, post_id, reaction_type: type });
}

/** POST /posts/{post_id}/comments — comment (ÖFFENTLICH!). */
export function sendPostComment(account_id: string, post_id: string, text: string): Promise<UnipileResult<any>> {
  return call<any>("POST", `/posts/${encodeURIComponent(post_id)}/comments`, { account_id, text });
}

/** GET /users/{provider_id}/posts — Posts der Person (Ziel-Auflösung für react/comment). identifier = provider_id. */
export async function getAllPosts(account_id: string, provider_id: string, limit = 5): Promise<UnipileResult<PostList>> {
  const r = await call<any>("GET", `/users/${encodeURIComponent(provider_id)}/posts?account_id=${encodeURIComponent(account_id)}&limit=${limit}`);
  if (!r.ok) return r;
  return { ok: true, data: { items: r.data?.items ?? [], cursor: r.data?.cursor ?? null } };
}

/** follow — Raw-Voyager-Passthrough (kein dedizierter Unipile-Endpoint; fragil, wie im Alt-Runner dokumentiert). */
export function followProfile(account_id: string, provider_id: string): Promise<UnipileResult<any>> {
  return call<any>("POST", "/linkedin", {
    account_id, method: "POST", encoding: false,
    body: { patch: { $set: { following: true } } },
    request_url: `https://www.linkedin.com/voyager/api/feed/dash/followingStates/urn:li:fsd_followingState:urn:li:fsd_profile:${provider_id}`,
  });
}

/** inmail — Sales-Nav-Message an Nicht-Verbundene (multipart, inmail-Flag). Ohne sales_nav-Feature → Unipile-Fehler (Runner: skipped). */
export async function sendInMail(account_id: string, provider_id: string, text: string): Promise<UnipileResult<ChatStarted>> {
  if (!UNIPILE_DSN || !UNIPILE_API_KEY) return { ok: false, retryable: false, status: null, type: "config", detail: "UNIPILE_DSN/UNIPILE_API_KEY fehlen im Env" };
  const form = new FormData();
  form.append("account_id", account_id); form.append("text", text); form.append("attendees_ids", provider_id);
  form.append("linkedin[api]", "classic"); form.append("linkedin[inmail]", "true");
  let r: Response;
  try { r = await fetch(`${BASE}/chats`, { method: "POST", headers: { "X-API-KEY": UNIPILE_API_KEY, "accept": "application/json" }, body: form }); }
  catch (e) { return { ok: false, retryable: true, status: null, type: "network", detail: String((e as Error)?.message ?? e) }; }
  const txt = await r.text();
  if (!r.ok) { let type: string | null = null; try { type = JSON.parse(txt)?.type ?? null; } catch { /* */ } return { ok: false, retryable: isRetryable(r.status), status: r.status, type, detail: txt.slice(0, 300) }; }
  let data: ChatStarted; try { data = txt ? (JSON.parse(txt) as ChatStarted) : ({} as ChatStarted); } catch { data = ({} as ChatStarted); }
  return { ok: true, data };
}
