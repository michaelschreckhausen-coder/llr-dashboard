// instagram-unipile-connect — P0: Unipile-Session für Instagram verbinden/verwalten.
//
// Actions (POST { action }):
//   create_link  → Hosted-Auth-URL (providers:["INSTAGRAM"]), notify_url = unipile-webhook
//   status       → aktuelle Verbindung des aktiven Teams aus dem lokalen Store
//   reconcile    → Fallback nach Rückkehr: falls Webhook verzögert/verpasst, den
//                  neuesten ungemappten INSTAGRAM-Account diesem User zuordnen
//   disconnect   → lokale Zeile auf DISCONNECTED (Unipile-Seite bleibt unberührt)
//
// Mapping-Canonical ist der Webhook (wie bei LinkedIn): Unipile ruft notify_url mit
// {status:CREATION_SUCCESS, account_id, name=<user_id>} → unipile-webhook branched
// auf accounts.type und schreibt bei INSTAGRAM in instagram_unipile_accounts.
//
// Hybrid-Hinweis: das hier ist NUR der Unipile-Strang (DM/Outreach). Die Growth-
// Suite-Verbindung (Insights/Publishing) läuft unverändert über instagram-proxy.
//
// user_id kommt aus dem JWT (Härtung — nie aus dem Body).
import {
  serviceClient, userClientFromReq, getAuthenticatedUser, hasAddon, call,
  getOwnProfile, InstagramUnipileError,
} from "../_shared/instagram-unipile.ts";

const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN")!;
const WEBHOOK_SECRET = Deno.env.get("UNIPILE_WEBHOOK_SECRET")!;
const SB_PUBLIC = Deno.env.get("SUPABASE_PUBLIC_URL") || "https://supabase-staging.leadesk.de";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

/** Aktives Team des Users. */
async function teamOf(db: any, userId: string): Promise<string | null> {
  const { data, error } = await db.from("team_members").select("team_id").eq("user_id", userId).limit(1).maybeSingle();
  if (error) {
    console.warn(`[ig-connect] teamOf: ${error.message}`);
    return null;
  }
  return data?.team_id ?? null;
}

const PUBLIC_COLS = "id, unipile_account_id, username, full_name, avatar_url, provider_id, status, connected_at, last_status_update, last_sync_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = await getAuthenticatedUser(req);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const userId = auth.userId;

  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action ?? "status");
  const db = serviceClient();

  const teamId = await teamOf(db, userId);
  if (!teamId) return json({ error: "kein Team für User" }, 400);

  // ── status ────────────────────────────────────────────────────────────────
  if (action === "status") {
    const { data, error } = await db
      .from("instagram_unipile_accounts")
      .select(PUBLIC_COLS)
      .eq("team_id", teamId)
      .neq("status", "DISCONNECTED")
      .order("last_status_update", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ connection: data ?? null });
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  if (action === "disconnect") {
    const { error } = await db
      .from("instagram_unipile_accounts")
      .update({ status: "DISCONNECTED", last_status_update: new Date().toISOString() })
      .eq("team_id", teamId)
      .neq("status", "DISCONNECTED");
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // Ab hier: schreibende/kostenpflichtige Pfade → Addon-Gate.
  const userClient = userClientFromReq(req)!;
  if (!(await hasAddon(userClient, "instagram"))) {
    return json({ error: "no_addon", message: "Instagram-Addon nicht aktiv" }, 403);
  }

  // ── create_link ───────────────────────────────────────────────────────────
  if (action === "create_link") {
    const appBase = (typeof body?.app_base === "string" && body.app_base) || "https://staging.leadesk.de";
    const notifyUrl = `${SB_PUBLIC}/functions/v1/unipile-webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`;
    try {
      const data = await call("POST", "/api/v1/hosted/accounts/link", {
        body: {
          type: "create",
          providers: ["INSTAGRAM"],
          api_url: `https://${UNIPILE_DSN}`,
          expiresOn: new Date(Date.now() + 3600_000).toISOString(),
          name: userId,            // kommt via notify_url zurück → Mapping
          notify_url: notifyUrl,   // Canonical-Pfad
          success_redirect_url: `${appBase}/settings/instagram?unipile=connected`,
        },
      });
      return json(data);
    } catch (e) {
      const err = e as InstagramUnipileError;
      return json({ error: "unipile_error", detail: err.message }, err.status && err.status >= 400 ? 502 : 500);
    }
  }

  // ── reconcile ─────────────────────────────────────────────────────────────
  // Fallback wenn der Webhook verzögert/verpasst wurde. Ordnet den neuesten
  // ungemappten INSTAGRAM-Account diesem Team zu.
  if (action === "reconcile") {
    const { data: existing } = await db
      .from("instagram_unipile_accounts")
      .select(PUBLIC_COLS)
      .eq("team_id", teamId)
      .eq("status", "OK")
      .limit(1)
      .maybeSingle();
    if (existing) return json({ connected: true, connection: existing });

    let accounts: any[] = [];
    try {
      const res = await call("GET", "/api/v1/accounts");
      accounts = res?.items ?? [];
    } catch (e) {
      return json({ error: "unipile_error", detail: String(e) }, 502);
    }

    // NUR Instagram-Accounts — ein LinkedIn-Account darf hier niemals landen.
    const igAccounts = accounts.filter((a) => a?.type === "INSTAGRAM");
    if (!igAccounts.length) return json({ connected: false, reason: "kein Instagram-Account bei Unipile" });

    const { data: mapped, error: mErr } = await db.from("instagram_unipile_accounts").select("unipile_account_id");
    if (mErr) return json({ error: mErr.message }, 500);
    const mappedIds = new Set((mapped ?? []).map((m: any) => m.unipile_account_id));

    const unmapped = igAccounts
      .filter((a) => !mappedIds.has(a.id))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    if (!unmapped.length) return json({ connected: false, reason: "kein neuer Account" });

    const acct = unmapped[0];
    const srcStatus = acct?.sources?.[0]?.status ?? "OK";
    if (srcStatus !== "OK") {
      return json({ connected: false, reason: `Unipile-Status ${srcStatus}` });
    }

    // Profil best-effort nachziehen (username/provider_id für Outreach + Inbox).
    let profile: any = null;
    try {
      profile = await getOwnProfile(acct.id);
    } catch (e) {
      console.warn(`[ig-connect] getOwnProfile(${acct.id}): ${e}`);
    }

    const now = new Date().toISOString();
    const { data: row, error } = await db
      .from("instagram_unipile_accounts")
      .upsert(
        {
          team_id: teamId,
          user_id: userId,
          unipile_account_id: acct.id,
          provider_id: profile?.provider_id ?? profile?.id ?? null,
          username: profile?.username ?? acct?.connection_params?.im?.username ?? null,
          full_name: profile?.name ?? null,
          avatar_url: profile?.profile_picture_url ?? null,
          status: "OK",
          connected_at: now,
          last_status_update: now,
          raw: acct,
        },
        { onConflict: "unipile_account_id" },
      )
      .select(PUBLIC_COLS)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);

    // Account-Hygiene: ältere OK-Sessions desselben Teams ablösen (Reconnect →
    // neue account_id; die alte Zeile bliebe sonst stale-OK).
    await db
      .from("instagram_unipile_accounts")
      .update({ status: "DISCONNECTED", last_status_update: now })
      .eq("team_id", teamId)
      .neq("unipile_account_id", acct.id)
      .eq("status", "OK");

    return json({ connected: true, connection: row });
  }

  return json({ error: `unbekannte action: ${action}` }, 400);
});
