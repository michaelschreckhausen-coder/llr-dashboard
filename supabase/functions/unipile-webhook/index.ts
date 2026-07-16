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

// Account gegen Unipile VALIDIEREN: muss existieren (kein 404/Phantom), source-status=OK.
// Gibt {type, slug, providerId, username, raw} zurück ODER null (→ nicht persistieren,
// kein falsches "verbunden").
//
// 2026-07-15 (Instagram-Rebuild P0): der Typ wird jetzt ZURÜCKGEGEBEN statt hart auf
// LINKEDIN gefiltert — der Handler branched darauf. Grund: derselbe notify_url bedient
// jetzt LINKEDIN (→ public.unipile_accounts) und INSTAGRAM (→ public.instagram_unipile_accounts).
// Die Stores sind BEWUSST getrennt: unipile_accounts hat keine provider-Spalte und
// _shared/unipile.ts getUnipileConnection() filtert nicht auf Provider — ein dort
// abgelegter IG-Account würde von LinkedIn-Workern gegriffen. Siehe Migration
// 20260715100000 + docs/instagram-unipile-rebuild-konzept.md.
// Das Typ-Gate ist damit nicht schwächer, nur verschoben: unbekannte Typen werden
// im Handler verworfen.
async function validateAccount(accountId: string): Promise<
  { type: string | null; slug: string | null; providerId: string | null; username: string | null; raw: any } | null
> {
  try {
    const r = await fetch(`https://${UNIPILE_DSN}/api/v1/accounts/${accountId}`, { headers: { "X-API-KEY": UNIPILE_KEY, "accept": "application/json" } });
    if (!r.ok) return null;                         // 404 = Phantom-id
    const a = await r.json();
    if ((a?.sources?.[0]?.status) !== "OK") return null;
    const im = a?.connection_params?.im || {};
    return {
      type: a?.type ?? null,
      slug: im.publicIdentifier ?? null,
      providerId: im.id ?? null,
      username: im.username ?? null,
      raw: a,
    };
  } catch { return null; }
}

// Unipile-Status → CHECK-Constraint von instagram_unipile_accounts.
// Unbekannte Werte NICHT durchreichen, sonst 23514-Violation im Webhook (der dann
// !=200 zurückgibt → 5 Unipile-Retries).
const IG_STATUS = new Set(["PENDING", "CHECKPOINT", "OK", "CREDENTIALS", "ERROR", "DISCONNECTED"]);
function igStatus(raw: unknown): string {
  const s = String(raw ?? "").toUpperCase();
  if (IG_STATUS.has(s)) return s;
  console.warn(`[unipile-webhook] unbekannter IG-Status "${raw}" → ERROR`);
  return "ERROR";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const authOk = req.headers.get("Unipile-Auth") === SECRET || url.searchParams.get("secret") === SECRET;
  if (!authOk) return new Response("unauthorized", { status: 401 });

  let evt: any;
  try { evt = await req.json(); } catch { return new Response("ok", { status: 200 }); }

  // First-Connect (Hosted-Auth notify_url): name = unsere user_id → Zeile anlegen.
  if (evt?.name && evt?.account_id) {
    // Fallstrick #12: error auslesen. Ohne das geht ein First-Connect bei fehlenden
    // Grants/RLS-Problem STILL verloren (tm=undefined → Block übersprungen → trotzdem 200).
    const { data: tm, error: tmErr } = await db.from("team_members").select("team_id").eq("user_id", evt.name).limit(1).maybeSingle();
    if (tmErr) {
      console.warn(`[unipile-webhook] team_members-Lookup für user ${evt.name}: ${tmErr.message}`);
    } else if (!tm?.team_id) {
      console.warn(`[unipile-webhook] kein Team für user ${evt.name} — account ${evt.account_id} NICHT gemappt`);
    }
    if (tm?.team_id) {
      // HÄRTUNG: evt.account_id gegen Unipile validieren — Phantom/404/nicht-OK NICHT persistieren.
      // Typ-Gate danach im Branch: LINKEDIN → unipile_accounts, INSTAGRAM → instagram_unipile_accounts,
      // alles andere verworfen. Die Stores sind bewusst getrennt (Migration 20260715100000).
      const v = await validateAccount(evt.account_id);
      if (!v) {
        console.warn(`[unipile-webhook] account_id ${evt.account_id} nicht validierbar (Phantom/404/nicht OK) — NICHT persistiert`);
      } else if (v.type === "INSTAGRAM") {
        // ── Instagram-Zweig (Rebuild P0) — eigener Store, siehe validateAccount-Kommentar.
        const now = new Date().toISOString();
        const { error: igErr } = await db.from("instagram_unipile_accounts").upsert({
          team_id: tm.team_id, user_id: evt.name, unipile_account_id: evt.account_id,
          provider_id: v.providerId, username: v.username, status: "OK",
          connected_at: now, last_status_update: now, raw: v.raw,
        }, { onConflict: "unipile_account_id" });
        if (igErr) {
          console.warn(`[unipile-webhook][IG] upsert ${evt.account_id}: ${igErr.message}`);
        } else {
          // Account-Hygiene analog LinkedIn: Reconnect legt eine neue account_id an;
          // ältere OK-Sessions desselben Teams sonst stale-OK → getIgConnection greift
          // eine tote id. Scope team_id (ein IG-Konto je Team, UNIQUE auf ig_account_id
          // im Growth-Suite-Store spiegelt dieselbe Annahme).
          const { error: hErr } = await db.from("instagram_unipile_accounts")
            .update({ status: "DISCONNECTED", last_status_update: now })
            .eq("team_id", tm.team_id)
            .neq("unipile_account_id", evt.account_id)
            .eq("status", "OK");
          if (hErr) console.warn(`[unipile-webhook][IG] Hygiene: ${hErr.message}`);
        }
      } else if (v.type !== "LINKEDIN") {
        console.warn(`[unipile-webhook] account_id ${evt.account_id} hat nicht unterstützten type "${v.type}" — NICHT persistiert`);
      } else {
        await db.from("unipile_accounts").upsert({
          team_id: tm.team_id, user_id: evt.name, unipile_account_id: evt.account_id,
          provider_public_id: v.slug, status: "OK", last_status_update: new Date().toISOString(),
        }, { onConflict: "unipile_account_id" });
        // DURABLE ACCOUNT-HYGIENE: Reconnect legt eine neue unipile_account_id an, die alte OK-Zeile bleibt
        // sonst stale-OK → getUnipileConnection greift eine tote id (404/409) → alle Unipile-Worker liegen lahm.
        // Fix: ältere OK-Sessions DERSELBEN Identität (slug, andere id) → DISCONNECTED (superseded).
        // Scope user_id+provider_public_id (nicht nur user_id) → ein legitimer 2. LinkedIn-Account bleibt OK.
        // Ergebnis: nach jedem Reconnect genau 1 OK-Zeile je Identität, deterministisch, ohne manuellen Sync.
        if (v.slug) {
          await db.from("unipile_accounts")
            .update({ status: "DISCONNECTED", last_status_update: new Date().toISOString() })
            .eq("user_id", evt.name).eq("provider_public_id", v.slug)
            .neq("unipile_account_id", evt.account_id).eq("status", "OK");
        }
        // Connect-Zeit-Sync in la_accounts (V2-Onboarding: Hosted-Auth → Builder sieht Account).
        // IDENTITY-COLLAPSE: der eben verbundene Account ist die NEUESTE Session dieser LinkedIn-Identität.
        // Andere connected-Rows derselben Identität (gleicher public_identifier, andere id) → disconnected,
        // sonst legt "Neu verbinden" (neue Unipile-id für dieselbe Person) eine zweite connected-Row an
        // → Dublette im Builder-Dropdown. Ziel: genau EINE connected-Row je Identität.
        if (v.slug) {
          await db.from("la_accounts")
            .update({ status: "disconnected", updated_at: new Date().toISOString() })
            .eq("team_id", tm.team_id).eq("public_identifier", v.slug)
            .neq("unipile_account_id", evt.account_id).eq("status", "connected");
        }
        const { data: ex } = await db.from("la_accounts").select("id").eq("team_id", tm.team_id).eq("unipile_account_id", evt.account_id).maybeSingle();
        if (ex) {
          await db.from("la_accounts").update({ provider_id: v.providerId, public_identifier: v.slug, status: "connected", updated_at: new Date().toISOString() }).eq("id", ex.id);
        } else {
          await db.from("la_accounts").insert({ team_id: tm.team_id, unipile_account_id: evt.account_id, provider_id: v.providerId, public_identifier: v.slug, status: "connected", features: {} });
        }
      }
    }
  } else if (evt?.account_id && evt?.status) {
    // Status-Update (OK/CREDENTIALS/ERROR) für bestehende Zeile.
    const now = new Date().toISOString();
    await db.from("unipile_accounts")
      .update({ status: evt.status, last_status_update: now })
      .eq("unipile_account_id", evt.account_id);
    // Instagram-Store mitziehen. Die beiden Stores sind disjunkt (eine account_id
    // liegt immer nur in genau einem) → das hier trifft 0 oder 1 Zeile, nie beide.
    // Status defensiv mappen (CHECK-Constraint, anders als bei unipile_accounts).
    const { error: igErr } = await db.from("instagram_unipile_accounts")
      .update({ status: igStatus(evt.status), last_status_update: now })
      .eq("unipile_account_id", evt.account_id);
    if (igErr) console.warn(`[unipile-webhook][IG] Status-Update ${evt.account_id}: ${igErr.message}`);
  }

  // TODO (am Trial verifizieren): accepted invitation / new message → linkedin_inbox/leads.
  return new Response("ok", { status: 200 });
});
