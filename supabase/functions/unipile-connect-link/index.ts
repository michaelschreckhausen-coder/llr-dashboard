// unipile-connect-link — Hosted-Auth-Onboarding für LinkedIn (Unipile).
// Modi (POST): default → Hosted-Auth-URL (name=user_id, notify_url=Webhook, success_redirect zurück).
//              {reconcile:true} → Fallback nach Rückkehr: falls Webhook verzögert, neuesten
//                                  ungemappten Account diesem User zuordnen.
// Mapping-Canonical: Unipile ruft notify_url mit {status:CREATION_SUCCESS, account_id, name=user_id}
//   auf → unipile-webhook legt die Zeile an. GET /accounts.name = Profilname (NICHT user_id!).
// user_id kommt aus dem JWT (Härtung).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const body = await req.json().catch(() => ({} as any));
  const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // Brand-Scoping: Connect erfolgt AUS einer Brand heraus. brand_voice_id ist Pflicht
  // für den neuen Flow; Zugriff wird über die RLS des userClient geprüft (sieht der User
  // die Brand nicht, existiert sie für ihn nicht -> 403). name im Hosted-Auth = brand_voice_id.
  const brandVoiceId: string | null = (typeof body?.brand_voice_id === "string" && body.brand_voice_id) || null;

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
    const unmapped = accounts.filter((a: any) => !mappedIds.has(a.id))
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
    if (!unmapped.length) return json({ connected: false, reason: "kein neuer Account" }, 200);

    const acct = unmapped[0];
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

  // ── Brand-Scoping (bevorzugt): falls brand_voice_id gesetzt, Zugriff via RLS prüfen.
  //    Ohne brand_voice_id: Legacy-Pfad (name=user_id) — hält staging.leadesk.de am Leben,
  //    bis das Frontend die Brand mitschickt. Webhook versteht beide.
  if (brandVoiceId) {
    const { data: bvRow, error: bvErr } = await userClient
      .from("brand_voices").select("id, team_id").eq("id", brandVoiceId).maybeSingle();
    if (bvErr || !bvRow) return json({ error: "brand_forbidden", message: "Kein Zugriff auf diese Brand" }, 403);
  }

  // ── Mengen-Gate: 1 Profil je Lizenz inklusive; jedes weitere nur mit aktivem automation-Addon ──
  const { data: allow } = await userClient.rpc("unipile_allowance");
  if (allow && allow.can_add === false) {
    return json({ error: "limit_reached",
      message: "Profil-Limit erreicht — zusätzliches Profil im Marketplace buchen (5€/Monat).",
      allowance: allow }, 402);
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
      name: brandVoiceId || userId, // brand_voice_id (neu) ODER user_id (legacy) → Webhook mappt beide
      notify_url: notifyUrl,        // Canonical: Unipile ruft das bei CREATION_SUCCESS
      success_redirect_url: `${appBase}/settings/linkedin?unipile=connected`,
    }),
  });
  const data = await r.json().catch(() => ({}));
  return json(data, r.status);
});
