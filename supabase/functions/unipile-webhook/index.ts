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

// Account gegen Unipile VALIDIEREN: muss existieren (kein 404/Phantom), type=LINKEDIN, source-status=OK.
// Gibt {slug, providerId} zurück ODER null (→ nicht persistieren, kein falsches "verbunden").
async function validateAccount(accountId: string): Promise<{ slug: string | null; providerId: string | null } | null> {
  try {
    const r = await fetch(`https://${UNIPILE_DSN}/api/v1/accounts/${accountId}`, { headers: { "X-API-KEY": UNIPILE_KEY, "accept": "application/json" } });
    if (!r.ok) return null;                         // 404 = Phantom-id
    const a = await r.json();
    if (a?.type !== "LINKEDIN") return null;
    if ((a?.sources?.[0]?.status) !== "OK") return null;
    const im = a?.connection_params?.im || {};
    return { slug: im.publicIdentifier ?? null, providerId: im.id ?? null };
  } catch { return null; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const authOk = req.headers.get("Unipile-Auth") === SECRET || url.searchParams.get("secret") === SECRET;
  if (!authOk) return new Response("unauthorized", { status: 401 });

  let evt: any;
  try { evt = await req.json(); } catch { return new Response("ok", { status: 200 }); }

  // First-Connect (Hosted-Auth notify_url): name = brand_voice_id (neu) ODER user_id (legacy).
  if (evt?.name && evt?.account_id) {
    // Auflösung: zuerst als Brand versuchen, sonst als (legacy) User-Onboarding.
    let teamId: string | null = null;
    let ownerUserId: string | null = null;
    let brandVoiceId: string | null = null;
    const { data: bv } = await db.from("brand_voices").select("id, team_id, user_id").eq("id", evt.name).maybeSingle();
    if (bv?.team_id) {
      brandVoiceId = bv.id; teamId = bv.team_id; ownerUserId = bv.user_id;
    } else {
      const { data: tm } = await db.from("team_members").select("team_id").eq("user_id", evt.name).limit(1).maybeSingle();
      if (tm?.team_id) { teamId = tm.team_id; ownerUserId = evt.name; }
    }
    if (teamId) {
      // HÄRTUNG: evt.account_id gegen Unipile validieren — Phantom/404/nicht-LINKEDIN/nicht-OK NICHT persistieren.
      const v = await validateAccount(evt.account_id);
      if (!v) {
        console.warn(`[unipile-webhook] account_id ${evt.account_id} nicht validierbar — NICHT persistiert`);
      } else {
        await db.from("unipile_accounts").upsert({
          team_id: teamId, user_id: ownerUserId, brand_voice_id: brandVoiceId, unipile_account_id: evt.account_id,
          provider_public_id: v.slug, status: "OK", last_status_update: new Date().toISOString(),
        }, { onConflict: "unipile_account_id" });
        // IDENTITY-COLLAPSE: genau 1 OK-Zeile je Brand (falls brand-scoped) bzw. je User+Identität (legacy).
        if (brandVoiceId) {
          await db.from("unipile_accounts")
            .update({ status: "DISCONNECTED", last_status_update: new Date().toISOString() })
            .eq("brand_voice_id", brandVoiceId)
            .neq("unipile_account_id", evt.account_id).eq("status", "OK");
        } else if (v.slug) {
          await db.from("unipile_accounts")
            .update({ status: "DISCONNECTED", last_status_update: new Date().toISOString() })
            .eq("user_id", ownerUserId).eq("provider_public_id", v.slug)
            .neq("unipile_account_id", evt.account_id).eq("status", "OK");
        }
        // la_accounts-Projektion (inkl. brand_voice_id), Identity-Collapse je Team+Identität.
        if (v.slug) {
          await db.from("la_accounts")
            .update({ status: "disconnected", updated_at: new Date().toISOString() })
            .eq("team_id", teamId).eq("public_identifier", v.slug)
            .neq("unipile_account_id", evt.account_id).eq("status", "connected");
        }
        const { data: ex } = await db.from("la_accounts").select("id").eq("team_id", teamId).eq("unipile_account_id", evt.account_id).maybeSingle();
        if (ex) {
          await db.from("la_accounts").update({ provider_id: v.providerId, public_identifier: v.slug, brand_voice_id: brandVoiceId, status: "connected", updated_at: new Date().toISOString() }).eq("id", ex.id);
        } else {
          await db.from("la_accounts").insert({ team_id: teamId, unipile_account_id: evt.account_id, provider_id: v.providerId, public_identifier: v.slug, brand_voice_id: brandVoiceId, status: "connected", features: {} });
        }
      }
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
