// unipile-connect-link — Hosted-Auth-Onboarding für LinkedIn (Unipile).
// Zwei Modi (POST):
//   default        → erzeugt Hosted-Auth-URL (name=user_id, success_redirect zurück in die App).
//   {reconcile:true} → nach Rückkehr: Account bei Unipile finden (name=user_id) + unipile_accounts upserten.
// user_id kommt aus dem JWT des Callers (Härtung — NICHT aus dem Body).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN")!;
const UNIPILE_KEY = Deno.env.get("UNIPILE_API_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const U = `https://${UNIPILE_DSN}/api/v1`;
const uHeaders = { "X-API-KEY": UNIPILE_KEY, "accept": "application/json", "content-type": "application/json" };

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // user aus JWT (Härtung)
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const userId = user.id;

  const body = await req.json().catch(() => ({} as any));
  const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // ── Reconcile: nach Hosted-Auth-Rückkehr, robuster als Webhook (Shape ungetestet) ──
  if (body?.reconcile) {
    const r = await fetch(`${U}/accounts`, { headers: uHeaders });
    if (!r.ok) return json({ error: `accounts ${r.status}` }, 502);
    const list = await r.json();
    // Account, den DIESER User via Hosted-Auth (name=userId) verbunden hat.
    const acct = (list.items || []).find((a: any) => a.name === userId);
    if (!acct) return json({ connected: false, reason: "noch kein Account mit name=user_id" }, 200);

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

  // ── Default: Hosted-Auth-Link erzeugen ──
  const appBase = (typeof body?.app_base === "string" && body.app_base) || "https://staging.leadesk.de";
  const r = await fetch(`${U}/hosted/accounts/link`, {
    method: "POST",
    headers: uHeaders,
    body: JSON.stringify({
      type: "create",
      providers: ["LINKEDIN"],
      api_url: `https://${UNIPILE_DSN}`,
      expiresOn: new Date(Date.now() + 3600_000).toISOString(),
      name: userId, // Mapping zurück auf Leadesk-User (Reconcile)
      success_redirect_url: `${appBase}/settings/linkedin?unipile=connected`,
    }),
  });
  const data = await r.json().catch(() => ({}));
  return json(data, r.status);
});
