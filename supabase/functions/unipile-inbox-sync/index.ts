// unipile-inbox-sync — spiegelt Unipile-LinkedIn-Chats + Nachrichten in
// linkedin_chats / linkedin_chat_messages. Input: { unipile_account_id, max_chats? }.
// Service-role (Cron ODER on-demand-Trigger). Inkrementell: Nachrichten nur bei
// neuem/veraendertem Chat. Attendee (Gegenueber) nur bei neuem Chat.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getChats, getChatMessages, getChatAttendees } from "../_shared/unipile-client.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SB_URL, SB_SERVICE);
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

// ── Reply-Cockpit: eingehende Antwort einem Kampagnen-Kontakt zuordnen ──────
// Ordnet die neueste Inbound-Nachricht eines Chats einem aktiven/beantworteten
// la_enrollments-Kontakt zu (Profil-Identität provider_id + Marke). Setzt Status
// 'replied', chat_id (Deep-Link) und last_reply_*, und reiht die Enrollment für die
// KI-Sentiment-Klassifikation ein. Idempotent über last_reply_msg_id (kein Status-
// Flip / keine Doppel-Klassifikation), manuelles Sentiment wird nie überschrieben.
async function detectReply(
  brandId: string | null, providerId: string | null, chatId: string,
  msgId: string, msgText: string | null, msgTs: number, queue: string[],
): Promise<void> {
  if (!brandId || !providerId || !msgId) return;
  // Prefilter: nur wenn der Absender überhaupt ein Kampagnen-Kontakt dieser Marke ist.
  const { data: enrs } = await admin.from("la_enrollments")
    .select("id, state, last_reply_msg_id, sentiment_source")
    .eq("brand_voice_id", brandId).eq("provider_id", providerId)
    .in("state", ["active", "replied"]);
  if (!enrs || !enrs.length) return; // kein Kampagnen-Kontakt → keine Arbeit, keine KI
  const at = msgTs ? new Date(msgTs).toISOString() : new Date().toISOString();
  const excerpt = ((msgText || "").trim().slice(0, 240)) || null;
  for (const e of enrs) {
    if (e.last_reply_msg_id === msgId) continue; // Idempotenz: diese Antwort schon verarbeitet
    const patch: Record<string, unknown> = {
      state: e.state === "active" ? "replied" : e.state,
      chat_id: chatId, last_reply_at: at, last_reply_excerpt: excerpt,
      last_reply_msg_id: msgId, updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("la_enrollments").update(patch).eq("id", e.id);
    if (error) { console.warn("[inbox-sync] reply-detect:", error.message); continue; }
    // KI-Sentiment nur, wenn nicht manuell gesetzt (bei neuer Antwort neu bewerten).
    if (e.sentiment_source !== "manuell" && excerpt) queue.push(e.id);
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${SB_SERVICE}`) return json({ error: "unauthorized" }, 401);
  const { unipile_account_id, max_chats } = await req.json().catch(() => ({} as any));
  if (!unipile_account_id) return json({ error: "unipile_account_id required" }, 400);

  const { data: acct } = await admin.from("unipile_accounts")
    .select("team_id, brand_voice_id, status").eq("unipile_account_id", unipile_account_id).maybeSingle();
  if (!acct) return json({ error: "account_not_found" }, 404);
  if (acct.status !== "OK") return json({ skipped: "status:" + acct.status });

  const cap = Math.min(Math.max(Number(max_chats) || 50, 1), 200);
  let scanned = 0, upChats = 0, upMsgs = 0, cursor: string | null = null;
  const sentimentQueue: string[] = []; // Reply-Cockpit: neu erkannte Antworten → KI-Sentiment

  outer:
  for (let page = 0; page < 5; page++) {
    const cr = await getChats(unipile_account_id, cursor, 50);
    if (!cr.ok) return json({ error: "getChats", detail: (cr as any).detail }, 502);
    for (const c of cr.data.items) {
      if (scanned >= cap) break outer;
      scanned++;
      const lastAt = c.timestamp ? new Date(c.timestamp).toISOString() : null;

      const { data: existing } = await admin.from("linkedin_chats")
        .select("id, last_message_at, attendee_avatar_url, attendee_name").eq("unipile_account_id", unipile_account_id).eq("unipile_chat_id", c.id).maybeSingle();

      let att: any = null;
      // Attendee-Details holen bei neuen Chats ODER wenn Avatar/Name fehlt (Backfill bestehender Chats)
      if (!existing || !existing.attendee_avatar_url || !existing.attendee_name) {
        const ar = await getChatAttendees(c.id);
        if (ar.ok) att = (ar.data.items || []).find((a: any) => !a.is_self) || null;
      }
      const chatRow: any = {
        team_id: acct.team_id, brand_voice_id: acct.brand_voice_id,
        unipile_account_id, unipile_chat_id: c.id,
        attendee_provider_id: c.attendee_provider_id ?? null,
        unread_count: Number(c.unread_count ?? 0) || 0,
        archived: !!c.archived,
        last_message_at: lastAt,
        updated_at: new Date().toISOString(),
      };
      if (att) {
        chatRow.attendee_name = att.name ?? existing?.attendee_name ?? null;
        chatRow.attendee_avatar_url = att.picture_url ?? null;
        chatRow.attendee_profile_url = att.profile_url ?? null;
        chatRow.attendee_headline = att.specifics?.occupation ?? att.specifics?.headline ?? null;
      }
      // Fallback: Avatar/Name aus linkedin_inbox (Netzwerk-Import), wenn Unipile kein Bild liefert
      const _pid = chatRow.attendee_provider_id;
      if (_pid && !chatRow.attendee_avatar_url) {
        const { data: _inb } = await admin.from("linkedin_inbox")
          .select("avatar_url, name").eq("brand_voice_id", acct.brand_voice_id).eq("provider_id", _pid)
          .not("avatar_url", "is", null).limit(1).maybeSingle();
        if (_inb?.avatar_url) {
          chatRow.attendee_avatar_url = _inb.avatar_url;
          if (!chatRow.attendee_name) chatRow.attendee_name = _inb.name ?? null;
        }
      }
      const { data: up, error: ue } = await admin.from("linkedin_chats")
        .upsert(chatRow, { onConflict: "unipile_account_id,unipile_chat_id" }).select("id").maybeSingle();
      if (ue) { console.warn("[inbox-sync] chat upsert:", ue.message); continue; }
      const chatId = up?.id ?? existing?.id;
      if (!chatId) continue;
      upChats++;

      const changed = !existing || (lastAt && existing.last_message_at !== lastAt);
      if (changed) {
        const mr = await getChatMessages(c.id, null, 30);
        if (mr.ok) {
          let newestText: string | null = null, newestTs = 0;
          let newInId: string | null = null, newInText: string | null = null, newInTs = 0;
          for (const m of mr.data.items) {
            if (!m.id) continue;
            const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
            const outbound = (m.is_sender === 1 || m.is_sender === true);
            if (ts > newestTs) { newestTs = ts; newestText = m.text ?? null; }
            if (!outbound && ts >= newInTs) { newInTs = ts; newInId = m.id; newInText = m.text ?? null; }
            const row = {
              team_id: acct.team_id, chat_id: chatId,
              unipile_message_id: m.id,
              direction: outbound ? "outbound" : "inbound",
              sender_provider_id: m.sender_id ?? null,
              text: m.text ?? null,
              seen: (m.seen === 1 || m.seen === true),
              sent_at: m.timestamp ? new Date(m.timestamp).toISOString() : null,
            };
            const { error: me } = await admin.from("linkedin_chat_messages")
              .upsert(row, { onConflict: "unipile_message_id" });
            if (!me) upMsgs++;
          }
          if (newestText !== null) await admin.from("linkedin_chats").update({ last_message_text: newestText }).eq("id", chatId);
          // Reply-Cockpit: neueste Inbound-Antwort einem Kampagnen-Kontakt zuordnen (+ Sentiment einreihen).
          if (newInId && _pid) await detectReply(acct.brand_voice_id, _pid, chatId, newInId, newInText, newInTs, sentimentQueue);
        }
      }
    }
    cursor = cr.data.cursor;
    if (!cursor || cr.data.items.length === 0) break;
  }
  // Reply-Cockpit: KI-Sentiment für neu erkannte Antworten anstoßen (best effort).
  const uniq = [...new Set(sentimentQueue)];
  if (uniq.length) {
    await Promise.allSettled(uniq.map((id) =>
      fetch(`${SB_URL}/functions/v1/classify-reply-sentiment`, {
        method: "POST",
        headers: { "content-type": "application/json", "Authorization": `Bearer ${SB_SERVICE}` },
        body: JSON.stringify({ enrollment_id: id }),
      }).catch((e) => console.warn("[inbox-sync] sentiment trigger:", String((e as any)?.message || e)))
    ));
  }

  return json({ ok: true, unipile_account_id, scanned, chats: upChats, messages: upMsgs, replies_detected: uniq.length });
});
