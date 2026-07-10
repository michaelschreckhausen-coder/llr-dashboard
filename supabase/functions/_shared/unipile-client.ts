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
