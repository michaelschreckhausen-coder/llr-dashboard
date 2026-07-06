// unipile-webhook — Hosted-Auth-Mapping (First-Connect INSERT) + Account-Status-Updates.
// notify_url (Hosted-Auth) liefert {status:CREATION_SUCCESS, account_id, name=user_id} → Zeile anlegen.
// account_status-Webhook (source-registriert) liefert {account_id, status} → Zeile updaten.
// Secret via Header (source-Webhook setzt Unipile-Auth) ODER ?secret-Query (notify_url kann keine Header).
// MUSS <30s + 200 zurückgeben, sonst 5 Unipile-Retries.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SECRET = Deno.env.get("UNIPILE_WEBHOOK_SECRET")!;
const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN")!;
const UNIPILE_KEY = Deno.env.get("UNIPILE_API_KEY")!;

async function fetchPublicId(accountId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://${UNIPILE_DSN}/api/v1/accounts/${accountId}`, { headers: { "X-API-KEY": UNIPILE_KEY, "accept": "application/json" } });
    if (!r.ok) return null;
    const a = await r.json();
    return a?.connection_params?.im?.publicIdentifier ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const authOk = req.headers.get("Unipile-Auth") === SECRET || url.searchParams.get("secret") === SECRET;
  if (!authOk) return new Response("unauthorized", { status: 401 });

  let evt: any;
  try { evt = await req.json(); } catch { return new Response("ok", { status: 200 }); }

  // First-Connect (Hosted-Auth notify_url): name = unsere user_id → Zeile anlegen.
  if (evt?.name && evt?.account_id) {
    const { data: tm } = await db.from("team_members").select("team_id").eq("user_id", evt.name).limit(1).maybeSingle();
    if (tm?.team_id) {
      const pub = await fetchPublicId(evt.account_id);
      await db.from("unipile_accounts").upsert({
        team_id: tm.team_id, user_id: evt.name, unipile_account_id: evt.account_id,
        provider_public_id: pub, status: "OK", last_status_update: new Date().toISOString(),
      }, { onConflict: "unipile_account_id" });
    }
  } else if (evt?.account_id && evt?.status) {
    // Status-Update (OK/CREDENTIALS/ERROR) für bestehende Zeile.
    await db.from("unipile_accounts")
      .update({ status: evt.status, last_status_update: new Date().toISOString() })
      .eq("unipile_account_id", evt.account_id);
  }

  // TODO (am Trial verifizieren): accepted invitation / new message → linkedin_inbox/leads.
  return new Response("ok", { status: 200 });
});
