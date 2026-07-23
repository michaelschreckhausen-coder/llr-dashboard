// sync-automation-quantity — setzt die Stripe-Item-Quantity des 'automation'-Addons
// auf die AKTUELLE Anzahl verbundener unipile_accounts (status OK) eines Accounts.
// SET-TO-ACTUAL-COUNT (idempotent, kein Delta) → race-sicher, 0-Fall sauber.
// Grandfathered / kein Sub / nicht aktiv → skip (keine Belastung).
// Aufruf: DB-Trigger auf unipile_accounts (Connect/Disconnect) via net.http_post mit {account_id}.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  const { account_id } = await req.json().catch(() => ({} as any));
  if (!account_id) return json({ error: "account_id required" }, 400);

  // Nur ZAHLENDE (billing_type=stripe, aktiv, mit Item) syncen.
  // comped/external/grandfathered (jede Ebene) → kein Stripe-Charge, überspringen.
  const { data: aa } = await db.from("account_addons")
    .select("status, billing_type, stripe_subscription_item_id, addons!inner(slug)")
    .eq("account_id", account_id).eq("addons.slug", "automation").eq("billing_type", "stripe").eq("status", "active")
    .limit(1).maybeSingle();

  if (!aa) return json({ skipped: "kein_stripe_addon" });
  if (!aa.stripe_subscription_item_id) return json({ skipped: "no_stripe_item" });

  // SET-TO-ACTUAL-COUNT: # verbundene unipile_accounts (status OK) des Accounts.
  const { data: cnt } = await db.rpc("account_billable_unipile", { p_account_id: account_id });
  const qty = Number(cnt ?? 0);   // 0-Fall wird sauber gesetzt (Stripe berechnet dann nichts)

  const r = await fetch(`https://api.stripe.com/v1/subscription_items/${aa.stripe_subscription_item_id}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${STRIPE_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ quantity: String(qty), proration_behavior: "create_prorations" }).toString(),
  });
  const data = await r.json().catch(() => ({}));
  return json({ account_id, quantity: qty, stripe_ok: r.ok, stripe_status: r.status, error: r.ok ? undefined : (data as any)?.error?.message });
});
