// la-webhook — empfängt Unipile-Webhooks (JWT-los, verify_jwt=false), verifiziert das Shared-Secret,
// schreibt roh nach la_events, dann Dispatch. MUSS schnell 200 zurückgeben (sonst Unipile-Retries).
// Secret NIE loggen. Event-Payload-Formen defensiv extrahiert (roh in la_events → Shape später anpassbar).
//   new_relation     (akzeptierte Einladung, ≤8h-Polling, NICHT realtime) → la_materialize_accepted
//   message_received (Nachricht in einem Chat, ein- ODER ausgehend)       → Postfach-Spiegel + la_reply_stop
//   account_status   (OK/CREDENTIALS/DISCONNECTED)                       → la_accounts.status (+ Kampagnen paused)
// Der Typ heisst message_received; frueher stand hier new_message — den Namen gibt es in
// la_events nicht (0 Zeilen, 2026-08-18 geprueft). Der Dispatch-Regex /message/i trifft beides
// und bleibt deshalb unveraendert.
//
// Postfach-Spiegel (2026-08-18): unipile-inbox-sync hat keinen Cron-Job und laeuft nur, wenn
// ein Mensch die App oeffnet (dann max_chats=50 fuer EINEN Account pro Marke). Gemessen fehlten
// dadurch 1.176 Nachrichten in 907 Chats, die linkedin_chats gar nicht kannte, obwohl der
// Webhook sie laengst gemeldet hatte. Das Payload traegt alles Notwendige, deshalb schreibt
// diese Function den Spiegel jetzt selbst — ohne einen einzigen Unipile-Call.
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

// Postfach-Spiegel fuer ein message_received-Event. Zeilenform bewusst identisch zu
// unipile-inbox-sync — beide Writer bedienen dieselben Tabellen, divergierende Formen waeren
// ein Datenriss. Kein Unipile-Call: chat_id, message_id, message, timestamp, is_sender,
// sender.attendee_provider_id und attendees[0] stehen im Payload (alle 1.537 Events geprueft).
// Gibt einen kurzen Status zurueck (nie Nachrichtentext), der in der Response landet.
async function mirrorMessageEvent(evt: any, unipileAccountId: string | null): Promise<unknown> {
  const chatUid: string | null = evt.chat_id ?? null;
  const msgUid: string | null  = evt.message_id ?? null;
  if (!unipileAccountId || !chatUid || !msgUid) return "mirror:incomplete_payload";

  // team_id/brand_voice_id kommen aus unipile_accounts (NICHT la_accounts — das ist die
  // Automations-Seite). Status wird NICHT gefiltert: das Event ist schon da, und Daten
  // wegzuwerfen, weil die Verbindung gerade klemmt, waere Verlust ohne Gewinn.
  const { data: acct } = await db.from("unipile_accounts")
    .select("team_id, brand_voice_id, status").eq("unipile_account_id", unipileAccountId).maybeSingle();
  if (!acct) return "mirror:no_unipile_account";

  const tsIso: string | null = evt.timestamp ? new Date(evt.timestamp).toISOString() : null; // Unipile liefert ISO-8601
  const outbound = evt.is_sender === 1 || evt.is_sender === true;
  const text: string | null = evt.message ?? null;      // Textfeld heisst 'message'; ein 'text' gibt es nicht
  const attendee: any = Array.isArray(evt.attendees) ? evt.attendees[0] : null; // immer der Gegenpart
  const counterpartId: string | null = attendee?.attendee_provider_id ?? null;

  const { data: existing } = await db.from("linkedin_chats")
    .select("id, last_message_at, attendee_name, attendee_profile_url")
    .eq("unipile_account_id", unipileAccountId).eq("unipile_chat_id", chatUid).maybeSingle();

  // Kein Rueckwaertsschreiben: last_message_* nur, wenn dieses Event neuer ist als der
  // gespeicherte Stand — ein spaet eintrudelndes altes Event darf den Chat nicht altern.
  const isNewer = !!tsIso && (!existing?.last_message_at || new Date(tsIso) > new Date(existing.last_message_at));

  const chatRow: any = {
    team_id: acct.team_id, brand_voice_id: acct.brand_voice_id,
    unipile_account_id: unipileAccountId, unipile_chat_id: chatUid,
    updated_at: new Date().toISOString(),
  };
  if (counterpartId) chatRow.attendee_provider_id = counterpartId;
  if (isNewer) {
    chatRow.last_message_at = tsIso;
    if (text !== null) chatRow.last_message_text = text;
  }
  // Name/Profil nur FUELLEN, nie ueberschreiben — der Sync holt reichere Attendee-Daten
  // (Headline, Avatar). attendee_avatar_url liegt nicht im Payload und bleibt bewusst leer.
  if (!existing?.attendee_name && attendee?.attendee_name) chatRow.attendee_name = attendee.attendee_name;
  if (!existing?.attendee_profile_url && attendee?.attendee_profile_url) chatRow.attendee_profile_url = attendee.attendee_profile_url;

  const { data: up, error: ce } = await db.from("linkedin_chats")
    .upsert(chatRow, { onConflict: "unipile_account_id,unipile_chat_id" }).select("id").maybeSingle();
  if (ce) { console.warn("[la-webhook] chat upsert:", ce.message); return "mirror:chat_upsert_failed"; }
  const chatId: string | null = up?.id ?? existing?.id ?? null;
  if (!chatId) return "mirror:no_chat_id";

  // 'seen' steht nicht im Payload: eigene Nachrichten gelten als gelesen, eingehende nicht.
  const { error: me } = await db.from("linkedin_chat_messages").upsert({
    team_id: acct.team_id, chat_id: chatId,
    unipile_message_id: msgUid,
    direction: outbound ? "outbound" : "inbound",
    sender_provider_id: evt.sender?.attendee_provider_id ?? null,
    text, seen: outbound, sent_at: tsIso,
  }, { onConflict: "unipile_message_id" });
  if (me) { console.warn("[la-webhook] message upsert:", me.message); return "mirror:message_upsert_failed"; }

  return { chat: chatId, direction: outbound ? "outbound" : "inbound", chat_new: !existing, chat_touched: isNewer };
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

  // Spiegel-Write VOR dem Dispatch, aber vollstaendig gekapselt: der Roh-Insert oben bleibt
  // das Sicherheitsnetz, und was hier scheitert, heilt der Replay aus la_events nach
  // (scripts/replay-la-events-to-mirror.sql). Der 200er darf nie gefaehrdet werden — sonst
  // retried Unipile. Deshalb try/catch ohne Rethrow, Log ohne Secret und ohne Nachrichtentext.
  let mirror: unknown = "n/a";
  if (/message/i.test(type)) {
    try {
      mirror = await mirrorMessageEvent(evt, accountId);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      console.warn("[la-webhook] mirror:", msg);
      mirror = "error:" + msg;
    }
  }

  let dispatch: unknown = "none";
  try {
    if (/relation/i.test(type)) {
      const providerId = pick(evt, ["provider_id", "user_provider_id", "member_id", "relation.provider_id", "user.provider_id"]);
      const publicId = pick(evt, ["public_identifier", "user_public_identifier", "relation.public_identifier", "user.public_identifier"]);
      const enr = await findEnrollment(accountId, providerId, publicId);
      if (enr) { await db.from("la_enrollments").update({ accepted_at: new Date().toISOString() }).eq("id", enr.id); const { data: m } = await db.rpc("la_materialize_accepted", { p_enrollment_id: enr.id }); dispatch = { new_relation: enr.id, result: m }; }
      else dispatch = "new_relation:no_enrollment";

    } else if (/message/i.test(type)) {
      // Unipile-Shape ist sender.attendee_provider_id / sender.attendee_public_identifier
      // (verifiziert 2026-08-10: 944/1261 message_received matchen damit, 0 mit den alten Keys →
      //  la_reply_stop feuerte nie, state='replied' global 0). Additiv als Superset, damit
      //  künftige Payload-Varianten nicht wieder still durchfallen.
      const providerId = pick(evt, ["sender.attendee_provider_id", "sender.provider_id", "from.provider_id", "sender_id", "attendee_provider_id", "provider_id"]);
      const publicId = pick(evt, ["sender.attendee_public_identifier", "sender.public_identifier", "from.public_identifier", "public_identifier"]);
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
  return new Response(JSON.stringify({ ok: true, type, dispatch, mirror }), { status: 200, headers: { "content-type": "application/json" } });
});
