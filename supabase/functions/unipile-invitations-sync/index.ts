// =====================================================================
// Feature 5 — Invitation-Housekeeping (Worker)
// Cron-getriggert. Pro verbundenem Unipile-Account:
//   a) Gesendete (pending) Invites listen -> linkedin_invitations spiegeln
//   b) Nicht mehr gelistete pending-Invites -> als 'accepted' markieren
//      und leads.li_connection_status='verbunden' setzen (Reconcile, kanonisches ENUM)
//   c) Opt-in: pending-Invites älter als user_preferences.linkedin_withdraw_after_days (>0)
//      zurückziehen (mit la_*-Ausschluss: keine Person in aktiver Greenfield-Sequenz).
//      Kein Default -> ohne Setting wird NICHTS zurückgezogen.
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  getAuthenticatedUser,
  listSentInvitations,
  serviceClient,
  UnipileConn,
  UnipileError,
  withdrawInvitation,
} from "../_shared/unipile.ts";
import { teamHasPermission } from "../_shared/permissions.ts";

// Janitor (Weg A): KEIN Invite-Send. Nur Reconcile (accepted -> li_connection_status='verbunden')
// + Auto-Withdraw veralteter pending-Invites mit la_*-Ausschluss. Send macht Julians Greenfield.
// Auto-Withdraw ist strikt OPT-IN pro User (user_preferences.linkedin_withdraw_after_days > 0);
// KEIN Default -> ohne Setting wird NICHTS zurückgezogen.

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const sb = serviceClient();
    const input = await req.json().catch(() => ({}));

    // ── Auth-Gate (Pflicht): zwei Pfade (Muster wie unipile-post-publish) ──
    // Cron (service-role-Bearer): verarbeitet ALLE OK-Accounts (Background-Worker).
    // Frontend (JWT): NUR die OK-Accounts des verifizierten Users (kein body.user_id-Trust).
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return jsonResponse({ error: "unauthorized" }, 401);
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let scopeUserId: string | null = null;
    if (!isServiceRole) {
      const auth = await getAuthenticatedUser(req);
      if (!auth) return jsonResponse({ error: "unauthorized" }, 401);
      scopeUserId = auth.userId;   // Scope kommt aus dem JWT, NICHT aus dem Body
    }

    // Aktive Unipile-Accounts (Authority: unipile_accounts, status='OK'). Pro Account eine
    // eigene LinkedIn-Session -> jeder Account einzeln (Multi-Account-safe). JWT-Pfad: nur eigene.
    let acctQuery = sb
      .from("unipile_accounts")
      .select("user_id, team_id, unipile_account_id, status")
      .eq("status", "OK")
      .not("unipile_account_id", "is", null);
    if (!isServiceRole && scopeUserId) acctQuery = acctQuery.eq("user_id", scopeUserId);
    const { data: accts, error } = await acctQuery;
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!accts || accts.length === 0) return jsonResponse({ ok: true, accounts: 0 });

    const filtered = accts;

    let synced = 0, accepted = 0, withdrawn = 0;

    for (const c of filtered) {
      // P3 #5: Vernetzungen-Gate (c.team_id direkt). Skip, kein 403. Kill-Switch im Resolver.
      if (!c.team_id || !(await teamHasPermission(sb, c.team_id, "linkedin.connections"))) continue;
      const conn: UnipileConn = {
        accountId: c.unipile_account_id,
        dsn: null,                       // globales UNIPILE_DSN-Env
        connectionId: "",
        teamId: c.team_id,
        userId: c.user_id,
      };

      // withdraw_after_days pro User — STRIKT OPT-IN (kein Default!): nur > 0 aktiviert Auto-Withdraw.
      // manueller Override via input.withdraw_after_days, sonst user_preferences; NULL/0/fehlt = AUS.
      let withdrawAfter = 0;
      {
        if (input.withdraw_after_days != null) {
          withdrawAfter = Number(input.withdraw_after_days) || 0;
        } else {
          const { data: pref, error: prefErr } = await sb.from("user_preferences")
            .select("linkedin_withdraw_after_days").eq("user_id", c.user_id).maybeSingle();
          if (prefErr) console.warn(`[unipile-invitations-sync] user_preferences: ${prefErr.message}`);
          if (pref?.linkedin_withdraw_after_days != null) withdrawAfter = Number(pref.linkedin_withdraw_after_days) || 0;
        }
      }

      try {
        // ── 1) Gesendete (pending) Invites listen + linkedin_invitations spiegeln ──
        // Reale Shape (gecaptured): { object:"InvitationList", items:[{ id, invited_user (Name-String),
        //   invited_user_id (provider_id), invited_user_public_id, parsed_datetime, invitation_text }], cursor }
        const resp = await listSentInvitations(conn);
        const items: any[] = resp?.items ?? resp?.data ?? [];
        const stillPendingIds = new Set<string>();
        // Kandidaten für Auto-Withdraw sammeln (Alter geprüft), danach EINE la_*-Ausschluss-Query.
        const withdrawCandidates: { invitationId: string; providerId: string | null; publicId: string | null }[] = [];

        for (const inv of items) {
          const invitationId = inv.id ?? inv.invitation_id ?? null;
          if (!invitationId) continue;
          stillPendingIds.add(String(invitationId));
          const providerId: string | null = inv.invited_user_id ?? null;
          const publicId: string | null = inv.invited_user_public_id ?? null;
          const name: string | null = (typeof inv.invited_user === "string" && inv.invited_user) || null;
          const url = publicId ? `https://www.linkedin.com/in/${publicId}` : null;
          const sentAt: string | null = inv.parsed_datetime ?? null;

          // Lead-Zuordnung best effort (leads.linkedin_url = https://www.linkedin.com/in/<public_id>)
          let leadId: string | null = null;
          if (url) {
            const { data: lead, error: lErr } = await sb.from("leads")
              .select("id").eq("user_id", c.user_id).eq("linkedin_url", url).maybeSingle();
            if (lErr) console.warn(`[unipile-invitations-sync] lead lookup: ${lErr.message}`);
            leadId = lead?.id ?? null;
          }

          const { error: upErr } = await sb.from("linkedin_invitations").upsert({
            user_id: c.user_id,
            team_id: c.team_id,          // team_id aus unipile_accounts
            unipile_account_id: conn.accountId,
            invitation_id: String(invitationId),
            provider_id: providerId,
            lead_id: leadId,
            invitee_name: name,
            invitee_url: url,
            status: "pending",
            message: inv.invitation_text ?? null,
            sent_at: sentAt,
            last_checked_at: new Date().toISOString(),
          }, { onConflict: "user_id,invitation_id" });
          if (!upErr) synced++;
          else console.warn(`[unipile-invitations-sync] upsert: ${upErr.message}`);

          // Withdraw-Kandidat, wenn älter als withdrawAfter.
          if (withdrawAfter > 0 && sentAt) {
            const ageDays = (Date.now() - new Date(sentAt).getTime()) / 86400_000;
            if (ageDays >= withdrawAfter) withdrawCandidates.push({ invitationId: String(invitationId), providerId, publicId });
          }
        }

        // ── 2) Auto-Withdraw mit la_*-Ausschluss VOR dem Withdraw ──
        // Ausschluss = Person in aktiver Greenfield-Sequenz: enrollment.state='active'
        //   + campaign.status IN ('active','paused'). NUR LESEN auf la_* (niemals schreiben).
        if (withdrawCandidates.length > 0) {
          const provIds = withdrawCandidates.map((w) => w.providerId).filter(Boolean) as string[];
          const pubIds = withdrawCandidates.map((w) => w.publicId).filter(Boolean) as string[];
          const excludedProviders = new Set<string>();
          const excludedPublics = new Set<string>();
          const orParts: string[] = [];
          if (provIds.length) orParts.push(`provider_id.in.(${provIds.join(",")})`);
          if (pubIds.length) orParts.push(`public_identifier.in.(${pubIds.join(",")})`);
          if (orParts.length) {
            const { data: activeEnr, error: enrErr } = await sb.from("la_enrollments")
              .select("provider_id, public_identifier, la_campaigns!inner(status)")
              .eq("state", "active")
              .in("la_campaigns.status", ["active", "paused"])
              .or(orParts.join(","));
            if (enrErr) console.warn(`[unipile-invitations-sync] la_* exclusion: ${enrErr.message}`);
            for (const e of activeEnr ?? []) {
              if (e.provider_id) excludedProviders.add(String(e.provider_id));
              if (e.public_identifier) excludedPublics.add(String(e.public_identifier));
            }
          }

          for (const w of withdrawCandidates) {
            // Ausschluss: Person steckt in aktiver Sequenz -> NICHT withdrawen (Greenfield sendet/sequenziert).
            if ((w.providerId && excludedProviders.has(w.providerId)) ||
                (w.publicId && excludedPublics.has(w.publicId))) continue;
            try {
              await withdrawInvitation(conn, w.invitationId);
              const { error: wErr } = await sb.from("linkedin_invitations").update({
                status: "withdrawn", withdrawn_at: new Date().toISOString(),
              }).eq("user_id", c.user_id).eq("invitation_id", w.invitationId);
              if (wErr) console.warn(`[unipile-invitations-sync] withdraw update: ${wErr.message}`);
              withdrawn++;
            } catch (e) {
              if (e instanceof UnipileError && e.isRateLimited) throw e; // 429 -> break (Account-Loop)
              console.warn(`[unipile-invitations-sync] withdraw ${w.invitationId}: ${e}`);
            }
          }
        }

        // ── 3) Reconcile-by-Absence: war pending, jetzt nicht mehr gelistet -> accepted ──
        const { data: prevPending, error: ppErr } = await sb.from("linkedin_invitations")
          .select("id, invitation_id, lead_id")
          .eq("user_id", c.user_id).eq("status", "pending");
        if (ppErr) console.warn(`[unipile-invitations-sync] prevPending: ${ppErr.message}`);
        for (const pv of prevPending ?? []) {
          if (stillPendingIds.has(String(pv.invitation_id))) continue;
          // withdrawn-Zeilen sind schon nicht mehr 'pending' -> hier landen echte accepted.
          const { error: accErr } = await sb.from("linkedin_invitations").update({
            status: "accepted", responded_at: new Date().toISOString(),
          }).eq("id", pv.id);
          if (accErr) { console.warn(`[unipile-invitations-sync] accept: ${accErr.message}`); continue; }
          if (pv.lead_id) {
            // Kanonisch: li_connection_status (ENUM crm_connection_status) = 'verbunden'.
            // Fallstrick #1: ENUM STRIKT allein updaten, li_connected_at in separatem Update.
            const { error: e1 } = await sb.from("leads")
              .update({ li_connection_status: "verbunden" }).eq("id", pv.lead_id);
            if (e1) console.warn(`[unipile-invitations-sync] li_connection_status: ${e1.message}`);
            const { error: e2 } = await sb.from("leads")
              .update({ li_connected_at: new Date().toISOString() }).eq("id", pv.lead_id);
            if (e2) console.warn(`[unipile-invitations-sync] li_connected_at: ${e2.message}`);
          }
          accepted++;
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
