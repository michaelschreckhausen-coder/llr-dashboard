// unipile-webhook — Account-Status + (TODO) accepted invite / new message.
// MUSS <30s + 200 zurückgeben, sonst 5 Unipile-Retries.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SECRET = Deno.env.get("UNIPILE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  if (req.headers.get("Unipile-Auth") !== SECRET) return new Response("unauthorized", { status: 401 });
  let evt: any;
  try { evt = await req.json(); } catch { return new Response("ok", { status: 200 }); }

  // Account-Status (OK/CREDENTIALS/ERROR): CREDENTIALS = User muss reconnecten.
  if (evt?.account_id && evt?.status) {
    await db.from("unipile_accounts")
      .update({ status: evt.status, last_status_update: new Date().toISOString() })
      .eq("unipile_account_id", evt.account_id);
  }

  // TODO (am Trial verifizieren): accepted invitation ("new relation") / new message
  //   → linkedin_inbox / leads aktualisieren. evt-Shape gegen
  //   developer.unipile.com/docs/{detecting-accepted-invitations,new-messages-webhook} abgleichen.
  return new Response("ok", { status: 200 });
});
