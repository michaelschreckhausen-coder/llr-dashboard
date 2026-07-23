// unipile-connect-link — Hosted-Auth-Onboarding für LinkedIn (Unipile).
// Modi (POST): default → Hosted-Auth-URL (name=user_id, notify_url=Webhook, success_redirect zurück).
//              {reconcile:true} → Fallback nach Rückkehr: falls Webhook verzögert, neuesten
//                                  ungemappten Account diesem User zuordnen.
// Mapping-Canonical: Unipile ruft notify_url mit {status:CREATION_SUCCESS, account_id, name=user_id}
//   auf → unipile-webhook legt die Zeile an. GET /accounts.name = Profilname (NICHT user_id!).
// user_id kommt aus dem JWT (Härtung).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireSeat } from "../_shared/permissions.ts";

const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN")!;
const UNIPILE_KEY = Deno.env.get("UNIPILE_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("UNIPILE_WEBHOOK_SECRET")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_PUBLIC = Deno.env.get("SUPABASE_PUBLIC_URL") || "https://supabase-staging.leadesk.de";
const U = `https://${UNIPILE_DSN}/api/v1`;
const uHeaders = { "X-API-KEY": UNIPILE_KEY, "accept": "application/json", "content-type": "application/json" };

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const userId = user.id;

  // P3 #1: Connect = Seat-Besitz (member-basiert, B1). GANZ OBEN → deckt auch den reconcile-Branch. Kill-Switch via gate_open('connect').
  const seatDenied = await requireSeat(userClient);
  if (seatDenied) return seatDenied;

  const body = await req.json().catch(() => ({} as any));
  const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // ── Reconcile-Fallback (Webhook ist der Canonical-Pfad; das hier fängt Verzögerung/Verpasst) ──
  if (body?.reconcile) {
    // schon gemappt?
    const { data: existing } = await db.from("unipile_accounts")
      .select("unipile_account_id,provider_public_id,status").eq("user_id", userId).limit(1).maybeSingle();
    if (existing) return json({ connected: true, ...existing }, 200);

    // neuesten NOCH NICHT gemappten Account diesem User zuordnen (er hat gerade verbunden)
    const r = await fetch(`${U}/accounts`, { headers: uHeaders });
    if (!r.ok) return json({ error: `accounts ${r.status}` }, 502);
    const accounts = (await r.json()).items || [];
    const { data: mapped } = await db.from("unipile_accounts").select("unipile_account_id");
    const mappedIds = new Set((mapped || []).map((m: any) => m.unipile_account_id));
    // SECURITY (Cross-Customer-Mapping-Fix): fail-closed. Der alte "nimm den neuesten
    // global-ungemappten Account"-Pfad konnte einen FREMDEN Orphan (andere Person, andere
    // Kunde) an den Aufrufer mappen — Live-Isolationsloch. Wir übernehmen nur EINEN
    // ungemappten Account, der EINDEUTIG in dieser Session frisch verbunden wurde.
    // created_at-Frische ist ein Proxy, kein Beweis → bei 0 ODER >1 frischen Kandidaten
    // NICHT mappen (im Zweifel: erneut verbinden). Enges Fenster, weil der Webhook-Retry
    // (Race-Fix) den Persist ohnehin fast immer canonical erledigt.
    const FRESH_MS = 2 * 60 * 1000;   // 2 Minuten
    const nowMs = Date.now();
    const freshUnmapped = accounts.filter((a: any) => {
      if (mappedIds.has(a.id)) return false;
      const t = Date.parse(a.created_at);
      return Number.isFinite(t) && (nowMs - t) >= 0 && (nowMs - t) <= FRESH_MS;   // frisch, keine Zukunft
    });
    if (freshUnmapped.length !== 1) {
      return json({ connected: false, reason: "reconnect_needed", message: "Verbindung konnte nicht eindeutig zugeordnet werden — bitte erneut verbinden." }, 200);
    }

    const acct = freshUnmapped[0];
    const { data: tm } = await db.from("team_members").select("team_id").eq("user_id", userId).limit(1).maybeSingle();
    if (!tm?.team_id) return json({ error: "kein Team für User" }, 400);
    const pub = acct?.connection_params?.im?.publicIdentifier ?? null;
    const status = acct?.sources?.[0]?.status ?? "OK";
    const { error } = await db.from("unipile_accounts").upsert({
      team_id: tm.team_id, user_id: userId, unipile_account_id: acct.id,
      provider_public_id: pub, status, last_status_update: new Date().toISOString(),
    }, { onConflict: "unipile_account_id" });
    if (error) return json({ error: error.message }, 500);
    return json({ connected: true, unipile_account_id: acct.id, public: pub, status }, 200);
  }

  // ── Allowance-Gate (Lizenz = User): 1 Verknüpfung inkl., weitere nur mit Automation-Addon ──
  {
    const { data: connected } = await db.rpc("count_user_unipile", { p_user_id: userId });
    let accId: string | null = null;
    const { data: acc } = await db.from("accounts").select("id").eq("owner_user_id", userId).maybeSingle();
    accId = acc?.id ?? null;
    if (!accId) {
      const { data: tmA } = await db.from("team_members").select("teams!inner(account_id)").eq("user_id", userId).limit(1).maybeSingle();
      accId = (tmA as any)?.teams?.account_id ?? null;
    }
    let included = 1;
    if (accId) { const { data: inc } = await db.rpc("account_included_unipile", { p_account_id: accId }); included = Number(inc ?? 1); }
    let addonActive = false;
    if (accId) {
      const { data: ad } = await db.from("account_addons").select("id, addons!inner(slug)").eq("account_id", accId).eq("addons.slug", "automation").eq("status", "active").maybeSingle();
      addonActive = !!ad;
    }
    const canAdd = (Number(connected ?? 0) < included) || addonActive;
    if (!canAdd) {
      return json({ blocked: true, reason: "allowance", message: "Verknüpfungs-Limit deiner Lizenz erreicht — bitte im Marketplace eine weitere Account-Verknüpfung (Automatisierung) zubuchen." }, 402);
    }
  }

  // ── Default: Hosted-Auth-Link erzeugen (mit notify_url = Canonical-Mapping) ──
  const appBase = (typeof body?.app_base === "string" && body.app_base) || "https://staging.leadesk.de";
  const notifyUrl = `${SB_PUBLIC}/functions/v1/unipile-webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`;
  const r = await fetch(`${U}/hosted/accounts/link`, {
    method: "POST",
    headers: uHeaders,
    body: JSON.stringify({
      type: "create",
      providers: ["LINKEDIN"],
      api_url: `https://${UNIPILE_DSN}`,
      expiresOn: new Date(Date.now() + 3600_000).toISOString(),
      name: userId,                 // kommt via notify_url zurück → Mapping
      notify_url: notifyUrl,        // Canonical: Unipile ruft das bei CREATION_SUCCESS
      success_redirect_url: `${appBase}/settings/linkedin?unipile=connected`,
    }),
  });
  const data = await r.json().catch(() => ({}));
  return json(data, r.status);
});
