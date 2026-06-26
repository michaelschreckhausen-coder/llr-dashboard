// Supabase Edge Function: instagram-proxy
//
// Proxy zwischen Leadesk und der Instagram-Growth-Suite-Partner-API.
// Master-Key-Modell: EIN zentraler API-Key (Secret IG_GROWTH_SUITE_API_KEY)
// fuer den gesamten Growth-Suite-Tenant.
//
// Attribution via external_ref = Leadesk-team_id (API-Update 2026-06-26):
//   - Onboarding: POST /connect-links { external_ref: team_id } -> connect_url,
//     den der Endkunde oeffnet. Das dort verbundene Konto wird mit external_ref
//     (= team_id) getaggt.
//   - GET /accounts?external_ref=team_id liefert NUR die Konten dieses Teams.
//     Damit erzwingt der Partner das Team-Scoping (kein manueller Claim noetig).
// public.instagram_connections ist nur noch lokaler Cache fuer schnellen
// Status/Analytics ohne Round-Trip.
//
// Auth: Bearer-JWT (User-Token). getCallerContext verifiziert den User;
// DB-Writes ueber service-role, strikt auf das aktive Team gescopet.
//
// Routing: POST /functions/v1/instagram-proxy  mit { action, ... } im Body.
// Actions:
//   create_connect_link -> Onboarding-Link fuer den Endkunden
//   sync                -> Konten via external_ref ziehen, Cache aktualisieren
//   status              -> aktuelle Verbindung des Teams (Cache)
//   disconnect          -> lokale Team-Verbindung entfernen (Cache)
//   get_analytics       -> Insights/Posts/Demografie des verbundenen Kontos
//   list_leads          -> Instagram-Leads des verbundenen Kontos
//
// Inkrement 2 (spaeter): publish -> POST /accounts/{id}/publish (Redaktionsplan).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCallerContext } from "../_shared/credits.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IG_API_BASE          = Deno.env.get("IG_GROWTH_SUITE_BASE_URL") || "https://instagram-growth-suite.vercel.app";
const IG_API_KEY           = Deno.env.get("IG_GROWTH_SUITE_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Partner-API-Call mit Master-Key ───────────────────────────────────
async function igFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${IG_API_BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": IG_API_KEY,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  let data: unknown = null;
  try { data = await res.json(); } catch (_) { /* leerer Body */ }
  return { ok: res.ok, status: res.status, data };
}

// ── Team des verifizierten Users aufloesen (aktives Team, sonst erstes) ──
async function resolveTeamId(admin: SupabaseClient, userId: string, ctxTeamId: string | null): Promise<string | null> {
  if (ctxTeamId) return ctxTeamId;
  const { data, error } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[instagram-proxy] team_members lookup error:", error.message);
    return null;
  }
  return (data?.team_id as string) || null;
}

interface IgAccount {
  id: string;
  username?: string;
  account_type?: string;
  status?: string;
  external_ref?: string | null;
  connected_at?: string;
}

// Konten eines Teams beim Partner ziehen (external_ref-gescopet).
async function fetchTeamAccounts(teamId: string): Promise<{ ok: boolean; status: number; accounts: IgAccount[] }> {
  const r = await igFetch(`/api/v1/accounts?external_ref=${encodeURIComponent(teamId)}`);
  const accounts = (((r.data as { accounts?: IgAccount[] })?.accounts) || []);
  return { ok: r.ok, status: r.status, accounts };
}

// Lokalen Cache aus der Partner-Antwort aktualisieren; primaere Verbindung zurueck.
async function syncCache(admin: SupabaseClient, teamId: string, accounts: IgAccount[]) {
  if (accounts.length === 0) {
    // Keine Konten mehr beim Partner -> Cache fuer das Team leeren.
    await admin.from("instagram_connections").delete().eq("team_id", teamId);
    return null;
  }
  for (const a of accounts) {
    await admin.from("instagram_connections").upsert({
      team_id:       teamId,
      ig_account_id: a.id,
      username:      a.username || null,
      account_type:  a.account_type || null,
      status:        (a.status || "connected").toLowerCase(),
      connected_at:  a.connected_at || new Date().toISOString(),
      raw:           a,
      updated_at:    new Date().toISOString(),
    }, { onConflict: "ig_account_id" });
  }
  // Bevorzugt das verbundene Konto.
  const primary = accounts.find(a => (a.status || "").toUpperCase() === "CONNECTED") || accounts[0];
  return {
    ig_account_id: primary.id,
    username:      primary.username || null,
    account_type:  primary.account_type || null,
    status:        (primary.status || "connected").toLowerCase(),
    connected_at:  primary.connected_at || null,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "method not allowed" }, 405);

  if (!IG_API_KEY) {
    console.error("[instagram-proxy] IG_GROWTH_SUITE_API_KEY fehlt");
    return json({ error: "Instagram-Integration ist serverseitig nicht konfiguriert." }, 503);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const ctx = await getCallerContext(req, admin);
  if (!ctx) return json({ error: "unauthorized" }, 401);

  const teamId = await resolveTeamId(admin, ctx.user_id, ctx.team_id);
  if (!teamId) return json({ error: "Kein Team aufloesbar — bitte zuerst ein Team anlegen." }, 400);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* leerer Body ok */ }
  const action = String(body.action || "");

  try {
    switch (action) {
      // ── Onboarding-Link fuer den Endkunden ────────────────────────────
      case "create_connect_link": {
        const r = await igFetch("/api/v1/connect-links", {
          method: "POST",
          body: JSON.stringify({ external_ref: teamId }),
        });
        if (!r.ok) return json({ error: "Connect-Link konnte nicht erstellt werden", status: r.status }, 502);
        const d = (r.data as { connect_url?: string; expires_in_hours?: number; token?: string }) || {};
        return json({
          connect_url:      d.connect_url || null,
          expires_in_hours: d.expires_in_hours ?? null,
        });
      }

      // ── Konten via external_ref ziehen + Cache aktualisieren ───────────
      case "sync": {
        const r = await fetchTeamAccounts(teamId);
        if (!r.ok) return json({ error: "Partner-API nicht erreichbar", status: r.status }, 502);
        const connection = await syncCache(admin, teamId, r.accounts);
        return json({ connection });
      }

      // ── Aktuelle Verbindung des Teams (Cache) ──────────────────────────
      case "status": {
        const { data: conn } = await admin
          .from("instagram_connections")
          .select("ig_account_id, username, account_type, status, connected_at")
          .eq("team_id", teamId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return json({ connection: conn || null });
      }

      // ── Lokale Team-Verbindung entfernen (Cache; Partner-Seite unberuehrt) ──
      case "disconnect": {
        const { error: delErr } = await admin
          .from("instagram_connections")
          .delete()
          .eq("team_id", teamId);
        if (delErr) {
          console.warn("[instagram-proxy] disconnect error:", delErr.message);
          return json({ error: "Trennen fehlgeschlagen." }, 500);
        }
        return json({ ok: true });
      }

      // ── Insights/Posts/Demografie ──────────────────────────────────────
      case "get_analytics": {
        const igId = await resolveAccountId(admin, teamId);
        if (!igId) return json({ error: "Kein verbundenes Instagram-Konto." }, 404);
        const r = await igFetch(`/api/v1/accounts/${igId}`);
        if (r.status === 404) return json({ error: "Konto beim Partner nicht gefunden." }, 404);
        if (!r.ok)            return json({ error: "Partner-API nicht erreichbar", status: r.status }, 502);
        return json({ detail: r.data });
      }

      // ── Instagram-Leads des verbundenen Kontos ─────────────────────────
      case "list_leads": {
        const igId = await resolveAccountId(admin, teamId);
        if (!igId) return json({ error: "Kein verbundenes Instagram-Konto." }, 404);
        const r = await igFetch(`/api/v1/accounts/${igId}/leads`);
        if (r.status === 404) return json({ error: "Konto beim Partner nicht gefunden." }, 404);
        if (!r.ok)            return json({ error: "Partner-API nicht erreichbar", status: r.status }, 502);
        const leads = (((r.data as { leads?: unknown[] })?.leads) || []);
        return json({ leads });
      }

      // ── Beitrag veroeffentlichen (Redaktionsplan) ─────────────────────
      case "publish": {
        const mediaUrl  = String(body.media_url || "");
        const caption   = body.caption != null ? String(body.caption) : "";
        const mediaType = String(body.media_type || "IMAGE").toUpperCase();
        if (!mediaUrl) return json({ error: "media_url fehlt — Instagram benoetigt ein Medium." }, 400);
        if (!["IMAGE", "REELS", "VIDEO", "STORY"].includes(mediaType)) {
          return json({ error: `ungueltiger media_type: ${mediaType}` }, 400);
        }

        const igId = await resolveAccountId(admin, teamId);
        if (!igId) return json({ error: "Kein verbundenes Instagram-Konto." }, 404);

        const r = await igFetch(`/api/v1/accounts/${igId}/publish`, {
          method: "POST",
          body: JSON.stringify({ media_url: mediaUrl, caption, media_type: mediaType }),
        });
        // 422 = Instagram hat die Veroeffentlichung abgelehnt (Body { ok:false, error }).
        if (r.status === 422) {
          const d = (r.data as { error?: string }) || {};
          return json({ ok: false, error: d.error || "Instagram hat die Veroeffentlichung abgelehnt." }, 422);
        }
        if (r.status === 404) return json({ error: "Konto beim Partner nicht gefunden." }, 404);
        if (!r.ok)            return json({ error: "Partner-API nicht erreichbar", status: r.status }, 502);
        const d = (r.data as { ok?: boolean; id?: string }) || {};
        return json({ ok: d.ok !== false, id: d.id || null });
      }

      default:
        return json({ error: `unbekannte action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[instagram-proxy] unhandled:", e instanceof Error ? e.message : String(e));
    return json({ error: "interner Fehler" }, 500);
  }
});

// IG-Account-ID des Teams: erst Cache, sonst Live-Sync.
async function resolveAccountId(admin: SupabaseClient, teamId: string): Promise<string | null> {
  const { data: conn } = await admin
    .from("instagram_connections")
    .select("ig_account_id")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conn?.ig_account_id) return conn.ig_account_id as string;
  const r = await fetchTeamAccounts(teamId);
  if (!r.ok) return null;
  const primary = await syncCache(admin, teamId, r.accounts);
  return primary?.ig_account_id || null;
}
