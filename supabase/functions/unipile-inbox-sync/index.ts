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
          for (const m of mr.data.items) {
            if (!m.id) continue;
            const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
            if (ts > newestTs) { newestTs = ts; newestText = m.text ?? null; }
            const row = {
              team_id: acct.team_id, chat_id: chatId,
              unipile_message_id: m.id,
              direction: (m.is_sender === 1 || m.is_sender === true) ? "outbound" : "inbound",
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
        }
      }
    }
    cursor = cr.data.cursor;
    if (!cursor || cr.data.items.length === 0) break;
  }
  return json({ ok: true, unipile_account_id, scanned, chats: upChats, messages: upMsgs });
});
