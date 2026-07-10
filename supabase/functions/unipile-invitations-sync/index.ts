// =====================================================================
// Feature 5 — Invitation-Housekeeping (Worker)
// Cron-getriggert. Pro verbundenem Unipile-Account:
//   a) Gesendete (pending) Invites listen -> linkedin_invitations spiegeln
//   b) Nicht mehr gelistete pending-Invites -> als 'accepted' markieren
//      und leads.connection_status='connected' setzen (Reconcile)
//   c) Optional: pending-Invites älter als WITHDRAW_AFTER_DAYS zurückziehen
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  listSentInvitations,
  serviceClient,
  UnipileConn,
  UnipileError,
  withdrawInvitation,
} from "../_shared/unipile.ts";

const WITHDRAW_AFTER_DAYS = 21; // veraltete Invites zurückziehen (0 = aus)

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const sb = serviceClient();
    const input = await req.json().catch(() => ({}));
    const withdrawAfter: number = input.withdraw_after_days ?? WITHDRAW_AFTER_DAYS;

    // Alle aktiven Unipile-Accounts (Authority: unipile_accounts, status='OK').
    // Pro Account eine eigene LinkedIn-Session -> jeder Account einzeln verarbeitet
    // (ein User kann mehrere Accounts haben; kein Collapse auf "neuester" wie in
    // getUnipileConnection).
    const { data: accts, error } = await sb
      .from("unipile_accounts")
      .select("user_id, team_id, unipile_account_id, status")
      .eq("status", "OK")
      .not("unipile_account_id", "is", null);
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!accts || accts.length === 0) return jsonResponse({ ok: true, accounts: 0 });

    // Optional auf einen User beschränken (user-invoke).
    const filtered = input.user_id ? accts.filter((a) => a.user_id === input.user_id) : accts;

    let synced = 0, accepted = 0, withdrawn = 0;

    for (const c of filtered) {
      const conn: UnipileConn = {
        accountId: c.unipile_account_id,
        dsn: null,                       // globales UNIPILE_DSN-Env
        connectionId: "",
        teamId: c.team_id,
        userId: c.user_id,
      };

      try {
        const resp = await listSentInvitations(conn);
        const items: any[] = resp?.items ?? resp?.data ?? [];
        const stillPendingIds = new Set<string>();

        for (const inv of items) {
          const invitationId = inv.invitation_id ?? inv.id ?? null;
          if (!invitationId) continue;
          stillPendingIds.add(String(invitationId));
          const invitee = inv.invitee ?? inv.recipient ?? {};
          const url = invitee.public_profile_url ?? invitee.profile_url ?? null;

          // Lead-Zuordnung best effort
          let leadId: string | null = null;
          if (url) {
            const { data: lead } = await sb.from("leads")
              .select("id").eq("user_id", c.user_id).eq("linkedin_url", url).maybeSingle();
            leadId = lead?.id ?? null;
          }

          await sb.from("linkedin_invitations").upsert({
            user_id: c.user_id,
            team_id: c.team_id,          // team_id von Anfang an (aus unipile_accounts)
            unipile_account_id: conn.accountId,
            invitation_id: String(invitationId),
            provider_id: invitee.provider_id ?? invitee.id ?? null,
            lead_id: leadId,
            invitee_name: invitee.name ?? null,
            invitee_url: url,
            status: "pending",
            sent_at: inv.sent_at ?? inv.created_at ?? null,
            last_checked_at: new Date().toISOString(),
          }, { onConflict: "user_id,invitation_id" });
          synced++;

          // c) Auto-Withdraw veralteter pending-Invites
          if (withdrawAfter > 0 && (inv.sent_at ?? inv.created_at)) {
            const ageDays = (Date.now() - new Date(inv.sent_at ?? inv.created_at).getTime()) / 86400_000;
            if (ageDays >= withdrawAfter) {
              try {
                await withdrawInvitation(conn, String(invitationId));
                await sb.from("linkedin_invitations").update({
                  status: "withdrawn", withdrawn_at: new Date().toISOString(),
                }).eq("user_id", c.user_id).eq("invitation_id", String(invitationId));
                withdrawn++;
              } catch (_) { /* best effort */ }
            }
          }
        }

        // b) Reconcile: früher pending, jetzt nicht mehr gelistet -> accepted
        const { data: prevPending } = await sb.from("linkedin_invitations")
          .select("id, invitation_id, lead_id")
          .eq("user_id", c.user_id).eq("status", "pending");
        for (const pv of prevPending ?? []) {
          if (!stillPendingIds.has(String(pv.invitation_id))) {
            await sb.from("linkedin_invitations").update({
              status: "accepted", responded_at: new Date().toISOString(),
            }).eq("id", pv.id);
            if (pv.lead_id) {
              await sb.from("leads").update({
                connection_status: "connected",
                connected_at: new Date().toISOString(),
                vernetzung_status: "vernetzt",
              }).eq("id", pv.lead_id);
            }
            accepted++;
          }
        }
      } catch (e) {
        if (e instanceof UnipileError && e.isRateLimited) break;
        console.warn(`[unipile-invitations-sync] user ${c.user_id}: ${e}`);
      }
    }

    return jsonResponse({ ok: true, accounts: filtered.length, synced, accepted, withdrawn });
  } catch (e) {
    console.error(`[unipile-invitations-sync] ${e}`);
    return jsonResponse({ error: String(e) }, 500);
  }
});
