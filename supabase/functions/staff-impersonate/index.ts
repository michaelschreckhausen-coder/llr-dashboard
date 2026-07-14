// staff-impersonate — Admin-Impersonation (Weg B: self-signed, kurzlebiges HS256-Kunden-Token).
// Actions: start | renew | end. KEIN Refresh-Token; Session-Leben = Token-exp (15min), harte Obergrenze
// via Session-Row expires_at (60min-Cap). Sicherheits-Invarianten 1–6 sind inline markiert.
// MFA-Bypass bewusst: das self-signed aal1-Token umgeht das MFA-Gate des Kunden (bei Impersonation gewollt,
// im Audit + hier dokumentiert).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://esm.sh/jose@5.9.6";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("JWT_SECRET")!;
const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
const SECRET = new TextEncoder().encode(JWT_SECRET);

const TOKEN_TTL_SEC = 15 * 60;   // pro Token
const CAP_SEC = 60 * 60;         // Gesamt-Session-Cap
const MIN_REASON = 10;
// Invariante 3 — app_metadata-Allow-Liste: NUR diese Keys wandern ins Impersonation-Token. Alles andere
// (inkl. is_leadesk_admin + jedes Admin/Staff-Flag) wird gestrippt. Whitelist, NIE Blind-Copy.
const APP_META_ALLOW = ["provider", "providers"];

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const nowSec = () => Math.floor(Date.now() / 1000);

// Caller-JWT verifizieren (HS256 gegen JWT_SECRET) → sub/iss/aud/is_leadesk_admin.
async function verifyCaller(req: Request) {
  const h = req.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw { status: 401, msg: "no_token" };
  let payload: jose.JWTPayload;
  try { ({ payload } = await jose.jwtVerify(token, SECRET)); } catch { throw { status: 401, msg: "invalid_token" }; }
  return {
    authId: String(payload.sub || ""),
    iss: payload.iss, aud: payload.aud,
    isAdmin: ((payload.app_metadata as Record<string, unknown> | undefined)?.is_leadesk_admin) === true,
  };
}

// Invariante 1 — Staff-Gate: is_leadesk_admin (JWT) + leadesk_staff.is_active. (can_impersonate pro Action.)
async function requireStaff(authId: string, isAdmin: boolean) {
  if (!authId || !isAdmin) throw { status: 403, msg: "not_leadesk_admin" };
  const { data: staff } = await db.from("leadesk_staff").select("id, is_active, can_impersonate").eq("id", authId).maybeSingle();
  if (!staff || !staff.is_active) throw { status: 403, msg: "staff_inactive" };
  return staff as { id: string; is_active: boolean; can_impersonate: boolean };
}

// admin_audit_log.reason ist NOT NULL → reason immer non-null übergeben. Fehler loggen statt still schlucken.
async function audit(staffId: string, action: string, targetId: string, reason: string) {
  const { error } = await db.from("admin_audit_log").insert({ admin_user_id: staffId, action, target_table: "auth.users", target_id: targetId, reason });
  if (error) console.warn(`[staff-impersonate] audit ${action} failed: ${error.message}`);
}

// Signiert das Impersonation-Token nach exakter Claim-Liste. iss/aud aus dem Caller-Token (echte GoTrue-Werte).
async function signToken(target: any, staffId: string, sessionId: string, iss: unknown, aud: unknown, exp: number) {
  const src = (target.app_metadata || {}) as Record<string, unknown>;
  const appMeta: Record<string, unknown> = {};
  for (const k of APP_META_ALLOW) if (k in src) appMeta[k] = src[k];   // STRIP: nur Allow-Liste
  appMeta.is_impersonation = true;
  appMeta.impersonator_staff_id = staffId;
  const iat = nowSec();
  return await new jose.SignJWT({
    aud: (aud as jose.JWTPayload["aud"]) ?? "authenticated",
    role: "authenticated",
    email: target.email ?? undefined,
    phone: target.phone ?? "",
    app_metadata: appMeta,
    user_metadata: (target.user_metadata ?? {}) as Record<string, unknown>,
    session_id: sessionId,
    aal: "aal1",
    amr: [{ method: "impersonation", timestamp: iat }],
    is_anonymous: false,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(target.id))
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setIssuer(iss ? String(iss) : "")
    .sign(SECRET);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: any; try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  try {
    const caller = await verifyCaller(req);
    const staff = await requireStaff(caller.authId, caller.isAdmin);

    if (body?.action === "start") {
      // Invariante 1 (Forts.): can_impersonate zwingend.
      if (!staff.can_impersonate) return json({ error: "no_impersonate_grant" }, 403);
      // Invariante 2: Fail-closed Hook-Guard — aktiver Custom-Access-Token-Hook ⇒ kein Self-Sign.
      const { data: hookActive } = await db.rpc("staff_impersonation_hook_active");
      if (hookActive === true) return json({ error: "impersonation_disabled_hook_active" }, 503);
      const targetId = String(body?.target_user_id || "");
      const reason = String(body?.reason || "").trim();
      if (!targetId) return json({ error: "target_user_id_required" }, 400);
      if (reason.length < MIN_REASON) return json({ error: "reason_too_short", min: MIN_REASON }, 400);
      const { data: tRes, error: tErr } = await db.auth.admin.getUserById(targetId);
      const target = tRes?.user;
      if (tErr || !target) return json({ error: "target_not_found" }, 404);
      // Invariante 5: Ziel darf kein Staff/Admin sein.
      if (((target.app_metadata as Record<string, unknown>)?.is_leadesk_admin) === true) return json({ error: "target_is_admin" }, 403);
      const { data: tStaff } = await db.from("leadesk_staff").select("id").eq("id", targetId).maybeSingle();
      if (tStaff) return json({ error: "target_is_staff" }, 403);
      const { data: pref } = await db.from("user_preferences").select("active_team_id").eq("user_id", targetId).maybeSingle();
      // Session-Row (Cap 60min).
      const { data: sess, error: sErr } = await db.from("staff_impersonation_sessions").insert({
        staff_id: staff.id, target_user_id: targetId, target_team_id: pref?.active_team_id ?? null, reason,
        expires_at: new Date((nowSec() + CAP_SEC) * 1000).toISOString(),
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        user_agent: req.headers.get("user-agent") || null,
      }).select("id, expires_at").single();
      if (sErr || !sess) return json({ error: "session_insert_failed", detail: sErr?.message }, 500);
      await audit(staff.id, "impersonation.start", targetId, reason);
      const exp = Math.min(nowSec() + TOKEN_TTL_SEC, Math.floor(new Date(sess.expires_at).getTime() / 1000));
      const access_token = await signToken(target, staff.id, sess.id, caller.iss, caller.aud, exp);
      return json({ access_token, token_expires_at: exp, session_id: sess.id, session_expires_at: sess.expires_at });
    }

    if (body?.action === "renew") {
      const sessionId = String(body?.session_id || "");
      if (!sessionId) return json({ error: "session_id_required" }, 400);
      const { data: sess } = await db.from("staff_impersonation_sessions").select("*").eq("id", sessionId).eq("staff_id", staff.id).maybeSingle();
      if (!sess) return json({ error: "session_not_found" }, 404);
      if (sess.ended_at) return json({ error: "session_ended" }, 409);
      const cap = Math.floor(new Date(sess.expires_at).getTime() / 1000);
      if (nowSec() >= cap) return json({ error: "session_cap_reached" }, 409);
      const { data: tRes } = await db.auth.admin.getUserById(sess.target_user_id);
      const target = tRes?.user;
      if (!target) return json({ error: "target_not_found" }, 404);
      await audit(staff.id, "impersonation.renew", sess.target_user_id, sess.reason);
      const exp = Math.min(nowSec() + TOKEN_TTL_SEC, cap);
      const access_token = await signToken(target, staff.id, sess.id, caller.iss, caller.aud, exp);
      return json({ access_token, token_expires_at: exp, session_id: sess.id, session_expires_at: sess.expires_at });
    }

    if (body?.action === "end") {
      const sessionId = String(body?.session_id || "");
      if (!sessionId) return json({ error: "session_id_required" }, 400);
      const { data: sess } = await db.from("staff_impersonation_sessions").select("id, target_user_id, reason, ended_at").eq("id", sessionId).eq("staff_id", staff.id).maybeSingle();
      if (!sess) return json({ error: "session_not_found" }, 404);
      if (!sess.ended_at) {
        await db.from("staff_impersonation_sessions").update({ ended_at: new Date().toISOString(), end_reason: "manual" }).eq("id", sessionId);
        await audit(staff.id, "impersonation.end", sess.target_user_id, sess.reason);
      }
      return json({ ok: true, session_id: sessionId });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    const err = e as { status?: number; msg?: string; message?: string };
    if (err?.status) return json({ error: err.msg }, err.status);
    return json({ error: "internal", detail: String(err?.message || e) }, 500);
  }
});
