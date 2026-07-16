// Supabase Edge Function: screen-partners (Phase 5, NEED Kap. 13.11)
// ----------------------------------------------------------------------------
// Screent die Website eines Clubs/Netzwerks auf verlinkte Bestandssponsoren,
// leitet je Sponsor eine Branche ab und aggregiert die Branchen-Verteilung.
// Schreibt sponsoring.partner_screenings.
//
// Auth: User-JWT muss Mitglied des Ziel-Teams sein (Insert mit User-Client ->
// RLS user_in_team(team_id)). Extraktion via Haiku.
//
// Body: { team_id: string, source_url: string, model?: string }
//
// Robustheit (2026-06-24 Fix): Root-Cause war max_tokens=1500 -> bei
// sponsorenreichen Seiten (z.B. svww.de) wurde das JSON abgeschnitten
// (stop_reason=max_tokens) -> unparsebar -> hartes 502 "could not parse".
// Jetzt: groesseres Token-Budget + Partner-Cap, robustes Parsing inkl.
// Salvage truncierter Objekte, und Soft-Fail (200 + leeres/erklaerendes
// Ergebnis) statt rotem non-2xx, wenn eine Seite nicht lesbar ist oder keine
// Partner gefunden werden. Echte Fehler (Anthropic/Insert) bleiben non-2xx mit
// aussagekraeftiger Message im Body.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveModel, callText } from "../_shared/llm.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEFAULT_MODEL     = "claude-haiku-4-5";
const MAX_PARTNERS      = 40;
// Realistischer Browser-UA — manche Seiten liefern Bots Blockseiten/403.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Providerübergreifend (ISO 27001: gewähltes Modell entscheidet den Anbieter).
async function callAnthropic(model: string, system: string, user: string) {
  const r = await callText({ model, system, user, maxTokens: 4096, jsonMode: true });
  return { text: r.text, stop_reason: undefined as string | undefined };
}

// JSON aus Modell-Output ziehen — robust gegen ```json-Fences und (best effort)
// gegen abgeschnittene Ausgaben.
function extractJson(text: string): Record<string, unknown> | null {
  let t = (text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  if (start === -1) return null;
  t = t.slice(start);
  try { return JSON.parse(t); } catch { /* weiter unten salvage */ }
  const lastBrace = t.lastIndexOf("}");
  if (lastBrace > 0) { try { return JSON.parse(t.slice(0, lastBrace + 1)); } catch { /* ignore */ } }
  return null;
}

// Aus (auch truncierten) Ausgaben einzelne vollstaendige Partner-Objekte retten.
// Partner-Objekte sind flach ({name,url,industry}) -> kein verschachteltes {}.
function salvagePartners(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const m of (text || "").matchAll(/\{[^{}]*?"name"[^{}]*?\}/g)) {
    try { const o = JSON.parse(m[0]); if (o && typeof o.name === "string" && o.name.trim()) out.push(o); }
    catch { /* skip */ }
  }
  return out;
}

function deriveIndustries(partners: Array<Record<string, unknown>>): Array<{ industry: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const p of partners) {
    const raw = typeof p?.industry === "string" ? (p.industry as string).trim() : "";
    const ind = raw || "Unbekannt";
    counts[ind] = (counts[ind] || 0) + 1;
  }
  return Object.entries(counts).map(([industry, count]) => ({ industry, count })).sort((a, b) => b.count - a.count);
}

// HTML grob auf Linktexte + Hrefs eindampfen (Token-schonend).
function reduceHtml(html: string): string {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => `${m[2].replace(/<[^>]+>/g, "").trim()} -> ${m[1]}`)
    .filter((s) => s.length > 4)
    .slice(0, 200);
  return links.join("\n").slice(0, 12000);
}

const SYSTEM = `Du bist ein Sponsoring-Analyst. Du erhaeltst Links + Linktexte von der
Website eines Sportvereins/Netzwerks. Identifiziere wahrscheinliche BESTANDSSPONSOREN
(verlinkte Unternehmen, keine internen Seiten/Social-Media/Ticket-Shops) und ordne jedem
eine Branche zu. Liste HOECHSTENS ${MAX_PARTNERS} Sponsoren, kompakt, ohne Duplikate.
Antworte AUSSCHLIESSLICH mit gueltigem JSON (kein Markdown, keine Code-Fences):
{"found_partners":[{"name":"","url":"","industry":""}],
 "industries":[{"industry":"","count":0}],
 "summary":"<2-3 Saetze: welche Branchen dominieren, welche TOP-Branchen fehlen (offen)>"}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "missing authorization" }, 401);

    const { team_id, source_url, model } = await req.json();
    if (!team_id || !source_url) return json({ error: "team_id and source_url required" }, 400);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Ergebnis (egal ob voll, leer oder erklaerend) persistieren -> UI liest die Row.
    async function persist(found: Array<Record<string, unknown>>, inds: Array<{ industry: string; count: number }>, summary: string) {
      const { data, error } = await userClient
        .schema("sponsoring")
        .from("partner_screenings")
        .insert({ team_id, source_url, found_partners: found, industries: inds, summary })
        .select()
        .single();
      if (error) {
        console.error("[screen-partners] insert error:", error.message);
        // Insert-Fehler ist ein echter Fehler -> non-2xx mit Message (Frontend reicht durch).
        return json({ ok: false, error: "Speichern fehlgeschlagen: " + error.message }, 400);
      }
      return json({ ok: true, screening: data });
    }

    // Website laden — Soft-Fail bei nicht lesbarer Seite (kein rotes non-2xx).
    let html = "";
    try {
      const r = await fetch(source_url, { headers: { "User-Agent": BROWSER_UA, "Accept": "text/html,application/xhtml+xml" } });
      if (!r.ok) {
        console.error("[screen-partners] target non-200:", r.status, source_url);
        return await persist([], [], `Seite nicht lesbar (HTTP ${r.status}). Bitte URL pruefen oder eine oeffentliche Sponsoren-/Partnerseite angeben.`);
      }
      html = await r.text();
    } catch (e) {
      console.error("[screen-partners] fetch failed:", String((e as Error).message));
      return await persist([], [], "Seite konnte nicht geladen werden (Netzwerkfehler). Bitte URL pruefen.");
    }

    const reduced = reduceHtml(html);
    if (!reduced || reduced.length < 10) {
      // Keine statischen Links (z.B. JS-gerenderte Sponsorenliste).
      return await persist([], [], "Keine verlinkten Sponsoren im statischen HTML gefunden — die Seite ist evtl. JS-gerendert. Bitte eine Seite mit direkt verlinkten Sponsor-Logos/-Namen angeben.");
    }

    const { data: { user: _actUser } } = await userClient.auth.getUser();
    const useModel = (typeof model === "string" && model) ? model : await resolveModel(userClient, [_actUser?.id], DEFAULT_MODEL);
    let llm: { text: string; stop_reason?: string };
    try {
      llm = await callAnthropic(useModel, SYSTEM, "Quelle: " + source_url + "\n\n" + reduced);
    } catch (e) {
      // Anthropic-Fehler ist ein echter Fehler -> non-2xx mit Message.
      console.error("[screen-partners] anthropic error:", String((e as Error).message));
      return json({ ok: false, error: "KI-Analyse fehlgeschlagen: " + String((e as Error).message) }, 502);
    }

    let parsed = extractJson(llm.text);
    let found: Array<Record<string, unknown>> = [];
    let inds: Array<{ industry: string; count: number }> = [];
    let summary = "";

    if (parsed && Array.isArray(parsed.found_partners)) {
      found = parsed.found_partners as Array<Record<string, unknown>>;
      inds = Array.isArray(parsed.industries) && (parsed.industries as unknown[]).length
        ? (parsed.industries as Array<{ industry: string; count: number }>)
        : deriveIndustries(found);
      summary = typeof parsed.summary === "string" ? parsed.summary : "";
    } else {
      // Parse fehlgeschlagen (z.B. trotz groesserem Budget truncated) -> salvage.
      console.error("[screen-partners] parse failed, salvaging. stop_reason:", llm.stop_reason);
      found = salvagePartners(llm.text);
      inds = deriveIndustries(found);
      summary = found.length
        ? "Teilergebnis: Die Sponsorenliste war sehr lang und konnte nur teilweise ausgewertet werden."
        : "Es konnten keine Sponsoren eindeutig erkannt werden. Bitte eine Seite mit klar verlinkten Sponsoren angeben.";
    }

    // Partner-Cap + minimale Bereinigung.
    found = found
      .filter((p) => p && typeof p.name === "string" && (p.name as string).trim())
      .slice(0, MAX_PARTNERS);
    if (!summary) summary = found.length ? "" : "Keine Sponsoren gefunden.";
    if (!Array.isArray(inds) || !inds.length) inds = deriveIndustries(found);

    return await persist(found, inds, summary);
  } catch (e) {
    console.error("[screen-partners] uncaught:", String((e as Error).message || e));
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
