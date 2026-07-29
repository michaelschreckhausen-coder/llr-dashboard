// unipile-message-send — sendet eine LinkedIn-DM (oder InMail) ueber Unipile und
// spiegelt sie als outbound in linkedin_chat_messages. User-JWT (Brand-Zugriff via RLS).
// Input: { chat_id, text, inmail? }  ODER  { brand_voice_id, attendee_provider_id, text, inmail? }
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser, serviceClient, userClientFromReq } from "../_shared/unipile.ts";
import { sendMessage, sendInMail } from "../_shared/unipile-client.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req); if (pre) return pre;
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) return jsonResponse({ error: "unauthorized" }, 401);
    const uc = userClientFromReq(req);
    if (!uc) return jsonResponse({ error: "unauthorized" }, 401);
    const sb = serviceClient();
    const input = await req.json().catch(() => ({} as any));
    const text = String(input.text ?? "").trim();
    if (!text) return jsonResponse({ error: "text_required" }, 400);
    const useInmail = !!input.inmail;

    let accountId = "", providerId = "", brandVoiceId: string | null = null, teamId = "", chatId: string | null = input.chat_id ?? null;

    if (chatId) {
      const { data: c } = await uc.from("linkedin_chats")
        .select("id, unipile_account_id, attendee_provider_id, brand_voice_id, team_id").eq("id", chatId).maybeSingle();
      if (!c || !c.unipile_account_id || !c.attendee_provider_id) return jsonResponse({ error: "chat_not_found_or_incomplete" }, 404);
      accountId = c.unipile_account_id; providerId = c.attendee_provider_id; brandVoiceId = c.brand_voice_id; teamId = c.team_id;
    } else {
      brandVoiceId = input.brand_voice_id ?? null;
      providerId = String(input.attendee_provider_id ?? "");
      if (!brandVoiceId || !providerId) return jsonResponse({ error: "brand_and_attendee_required" }, 400);
      const { data: acc } = await uc.from("unipile_accounts").select("unipile_account_id, team_id").eq("brand_voice_id", brandVoiceId).eq("status", "OK").maybeSingle();
      if (!acc) return jsonResponse({ error: "no_connection_for_brand" }, 409);
      accountId = acc.unipile_account_id; teamId = acc.team_id;
    }

    const res = useInmail ? await sendInMail(accountId, providerId, text) : await sendMessage(accountId, providerId, text);
    if (!res.ok) return jsonResponse({ error: "send_failed", detail: (res as any).detail, status: (res as any).status }, 502);
    const nowIso = new Date().toISOString();
    const realChatId = (res.data as any)?.chat_id ?? null;
    const msgId = (res.data as any)?.message_id ?? null;

    if (!chatId) {
      const { data: up } = await sb.from("linkedin_chats").upsert({
        team_id: teamId, brand_voice_id: brandVoiceId, unipile_account_id: accountId,
        unipile_chat_id: realChatId ?? `pending:${accountId}:${providerId}`,
        attendee_provider_id: providerId, last_message_at: nowIso, last_message_text: text, updated_at: nowIso,
      }, { onConflict: "unipile_account_id,unipile_chat_id" }).select("id").maybeSingle();
      chatId = up?.id ?? null;
    } else {
      await sb.from("linkedin_chats").update({ last_message_at: nowIso, last_message_text: text, updated_at: nowIso }).eq("id", chatId);
    }
    if (chatId) {
      await sb.from("linkedin_chat_messages").insert({
        team_id: teamId, chat_id: chatId, unipile_message_id: msgId,
        direction: "outbound", text, seen: true, sent_at: nowIso,
      });
    }
    return jsonResponse({ ok: true, chat_id: chatId });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
