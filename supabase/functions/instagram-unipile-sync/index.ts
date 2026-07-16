// instagram-unipile-sync — P1: Chats + Nachrichten von Unipile in den lokalen
// Spiegel (instagram_chats / instagram_messages) holen.
//
// POST { full?: boolean, chat_limit?: number, message_limit?: number }
//   full=false (default) — Inkrement: nur die erste Chat-Seite (neueste zuerst),
//                          pro Chat die letzten `message_limit` Nachrichten.
//   full=true            — Initial-Sync: Chat-Liste über alle Cursor-Seiten.
//
// Re-run-safe: upsert onConflict auf den global eindeutigen Unipile-IDs
// (unipile_chat_id / unipile_message_id).
//
// Rate-Limits (Unipile-Doku, Instagram): 100 Actions/Tag, 10/Stunde gelten für
// Follow/Outreach/Like/Kommentar. Chat-Retrieval ist davon ausgenommen —
// Unipile synchronisiert Inboxen serverseitig ("without limitations via routes
// such as Messages, Chats, and Attendees"). Deshalb kein Stagger nötig.
import {
  serviceClient, userClientFromReq, getAuthenticatedUser, hasAddon,
  getIgConnection, listChats, listChatMessages, normalizeAttendee, normalizeMessage,
} from "../_shared/instagram-unipile.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });
}

const MAX_CHAT_PAGES = 20; // Sicherheitsnetz gegen Endlos-Cursor (max ~1000 Chats)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = await getAuthenticatedUser(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const userClient = userClientFromReq(req)!;
  if (!(await hasAddon(userClient, "instagram"))) {
    return json({ error: "no_addon", message: "Instagram-Addon nicht aktiv" }, 403);
  }

  const body = await req.json().catch(() => ({} as any));
  const full = !!body?.full;
  const chatLimit = Math.min(Number(body?.chat_limit) || 50, 100);
  const messageLimit = Math.min(Number(body?.message_limit) || 30, 100);

  const db = serviceClient();

  const { data: tm, error: tmErr } = await db
    .from("team_members").select("team_id").eq("user_id", auth.userId).limit(1).maybeSingle();
  if (tmErr) return json({ error: tmErr.message }, 500);
  if (!tm?.team_id) return json({ error: "kein Team für User" }, 400);
  const teamId = tm.team_id as string;

  const conn = await getIgConnection(db, teamId);
  if (!conn) return json({ error: "not_connected", message: "Keine aktive Instagram-Verbindung" }, 409);

  // ── 1) Chats einsammeln (Cursor-Pagination) ───────────────────────────────
  const chats: any[] = [];
  let cursor: string | null = null;
  let pages = 0;
  try {
    do {
      const res: any = await listChats(conn.accountId, cursor, chatLimit);
      chats.push(...(res?.items ?? []));
      cursor = res?.cursor ?? null;
      pages++;
    } while (full && cursor && pages < MAX_CHAT_PAGES);
  } catch (e) {
    console.warn(`[ig-sync] listChats: ${e}`);
    return json({ error: "unipile_error", detail: String(e) }, 502);
  }

  let chatsUpserted = 0;
  let messagesUpserted = 0;
  const errors: string[] = [];

  // ── 2) Pro Chat: Row upserten, dann Nachrichten ───────────────────────────
  for (const c of chats) {
    const chatId = String(c?.id ?? "");
    if (!chatId) continue;

    // Gesprächspartner = erster Attendee, der nicht das eigene Konto ist.
    const rawAttendees: any[] = c?.attendees ?? c?.attendee ?? [];
    const others = rawAttendees
      .map(normalizeAttendee)
      .filter((a) => !conn.providerId || String(a.provider_id) !== String(conn.providerId));
    const partner = others[0] ?? normalizeAttendee(rawAttendees[0] ?? {});

    const { data: chatRow, error: cErr } = await db
      .from("instagram_chats")
      .upsert(
        {
          team_id: teamId,
          ig_account_id: conn.rowId,
          unipile_chat_id: chatId,
          provider_chat_id: c?.provider_id ?? null,
          attendee_provider_id: partner.provider_id,
          attendee_username: partner.username,
          attendee_name: partner.name,
          attendee_avatar_url: partner.avatar_url,
          unread_count: Number(c?.unread_count ?? c?.unread ?? 0) || 0,
          is_archived: !!c?.archived,
          raw: c,
        },
        { onConflict: "unipile_chat_id" },
      )
      .select("id")
      .maybeSingle();

    // Fallstrick #12: error auslesen statt stille nulls zu akzeptieren.
    if (cErr) {
      errors.push(`chat ${chatId}: ${cErr.message}`);
      continue;
    }
    if (!chatRow?.id) {
      errors.push(`chat ${chatId}: kein id-Return nach upsert`);
      continue;
    }
    chatsUpserted++;

    // ── 3) Nachrichten des Chats ────────────────────────────────────────────
    let msgs: any[] = [];
    try {
      const res: any = await listChatMessages(conn.accountId, chatId, null, messageLimit);
      msgs = res?.items ?? [];
    } catch (e) {
      errors.push(`messages ${chatId}: ${e}`);
      continue;
    }

    const rows = msgs
      .map((m) => normalizeMessage(m, conn.providerId))
      .filter((m) => m.unipile_message_id)
      .map((m) => ({ ...m, team_id: teamId, chat_id: chatRow.id }));

    if (rows.length) {
      const { error: mErr } = await db
        .from("instagram_messages")
        .upsert(rows, { onConflict: "unipile_message_id" });
      if (mErr) errors.push(`messages-upsert ${chatId}: ${mErr.message}`);
      else messagesUpserted += rows.length;
    }

    // Denormalisierte Chat-Vorschau aus der neuesten Nachricht nachziehen.
    const newest = rows
      .filter((r) => r.sent_at)
      .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0];
    if (newest) {
      const { error: uErr } = await db
        .from("instagram_chats")
        .update({
          last_message_at: newest.sent_at,
          last_message_text: newest.text,
          last_message_is_outbound: newest.is_outbound,
        })
        .eq("id", chatRow.id);
      if (uErr) errors.push(`chat-preview ${chatId}: ${uErr.message}`);
    }
  }

  // ── 4) Sync-Zeitstempel ───────────────────────────────────────────────────
  const { error: sErr } = await db
    .from("instagram_unipile_accounts")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", conn.rowId);
  if (sErr) console.warn(`[ig-sync] last_sync_at: ${sErr.message}`);

  return json({
    ok: true,
    full,
    chats_seen: chats.length,
    chats_upserted: chatsUpserted,
    messages_upserted: messagesUpserted,
    // Teilfehler sichtbar machen statt stillzuschlucken (Fallstrick #12).
    errors: errors.slice(0, 20),
    error_count: errors.length,
  });
});
