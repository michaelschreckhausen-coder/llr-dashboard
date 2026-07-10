// la-webhook — empfängt Unipile-Webhooks (JWT-los, verify_jwt=false), verifiziert das Shared-Secret,
// schreibt roh nach la_events, dann Dispatch. MUSS schnell 200 zurückgeben (sonst Unipile-Retries).
// Secret NIE loggen. Event-Payload-Formen defensiv extrahiert (roh in la_events → Shape später anpassbar).
//   new_relation  (akzeptierte Einladung, ≤8h-Polling, NICHT realtime) → la_materialize_accepted
//   new_message   (Lead antwortet)                                     → la_reply_stop (Reply-Stop)
//   account_status (OK/CREDENTIALS/DISCONNECTED)                        → la_accounts.status (+ Kampagnen paused)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SECRET = Deno.env.get("UNIPILE_WEBHOOK_SECRET")!;

function pick(obj: any, paths: string[]): string | null {
  for (const p of paths) {
    const v = p.split(".").reduce((o: any, k) => (o == null ? o : o[k]), obj);
    if (v) return String(v);
  }
  return null;
}

// Enrollment über Account (unipile) + Person (provider_id ODER public_identifier) finden.
async function findEnrollment(unipileAccountId: string | null, providerId: string | null, publicId: string | null) {
  if (!unipileAccountId) return null;
  const { data: acc } = await db.from("la_accounts").select("id").eq("unipile_account_id", unipileAccountId).maybeSingle();
  if (!acc) return null;
  const { data: camps } = await db.from("la_campaigns").select("id").eq("account_id", acc.id);
  const campIds = (camps ?? []).map((c: any) => c.id);
  if (!campIds.length) return null;
  let q = db.from("la_enrollments").select("id, state").in("campaign_id", campIds);
  if (providerId) q = q.eq("provider_id", providerId);
  else if (publicId) q = q.eq("public_identifier", publicId);
  else return null;
  const { data: enr } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return enr;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const authOk = req.headers.get("Unipile-Auth") === SECRET
    || req.headers.get("x-unipile-secret") === SECRET
    || url.searchParams.get("secret") === SECRET;
  if (!authOk) return new Response("unauthorized", { status: 401 });

  let evt: any;
  try { evt = await req.json(); } catch { return new Response("ok", { status: 200 }); }

  const type = String(evt.event ?? evt.type ?? evt.name ?? "").trim();
  const accountId: string | null = evt.account_id ?? evt.account ?? null;

  // roh nach la_events (kein Secret im Payload)
  let laAccountId: string | null = null;
  if (accountId) { const { data: acc } = await db.from("la_accounts").select("id").eq("unipile_account_id", accountId).maybeSingle(); laAccountId = acc?.id ?? null; }
  const { data: ev } = await db.from("la_events").insert({ account_id: laAccountId, type: type || "unknown", payload: evt }).select("id").maybeSingle();

  let dispatch: unknown = "none";
  try {
    if (/relation/i.test(type)) {
      const providerId = pick(evt, ["provider_id", "user_provider_id", "member_id", "relation.provider_id", "user.provider_id"]);
      const publicId = pick(evt, ["public_identifier", "user_public_identifier", "relation.public_identifier", "user.public_identifier"]);
      const enr = await findEnrollment(accountId, providerId, publicId);
      if (enr) { const { data: m } = await db.rpc("la_materialize_accepted", { p_enrollment_id: enr.id }); dispatch = { new_relation: enr.id, result: m }; }
      else dispatch = "new_relation:no_enrollment";

    } else if (/message/i.test(type)) {
      const providerId = pick(evt, ["sender.provider_id", "from.provider_id", "sender_id", "attendee_provider_id", "provider_id"]);
      const publicId = pick(evt, ["sender.public_identifier", "from.public_identifier", "public_identifier"]);
      const enr = await findEnrollment(accountId, providerId, publicId);
      if (enr) { const { data: m } = await db.rpc("la_reply_stop", { p_enrollment_id: enr.id }); dispatch = { new_message: enr.id, result: m }; }
      else dispatch = "new_message:no_enrollment";

    } else if (/status/i.test(type) || (accountId && evt.status)) {
      const status: string | null = evt.status ?? evt.account_status ?? null;
      if (status && laAccountId) {
        await db.from("la_accounts").update({ status, updated_at: new Date().toISOString() }).eq("id", laAccountId);
        if (/disconnect|error|credential/i.test(status)) {
          await db.from("la_campaigns").update({ status: "paused", updated_at: new Date().toISOString() })
            .eq("account_id", laAccountId).eq("status", "active");
        }
        dispatch = `account_status:${status}`;
      }
    }
  } catch (e) { dispatch = "error:" + String((e as Error)?.message ?? e); }

  if (ev?.id) await db.from("la_events").update({ processed_at: new Date().toISOString() }).eq("id", ev.id);
  return new Response(JSON.stringify({ ok: true, type, dispatch }), { status: 200, headers: { "content-type": "application/json" } });
});
