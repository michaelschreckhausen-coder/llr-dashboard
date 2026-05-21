// Supabase Edge Function: webinar-register
//
// Annahme-Endpoint für Webinar-Anmeldungen vom Marketing-Site leadesk.de.
//
// Aufruf-Pfad:
//   POST https://<supabase>/functions/v1/webinar-register
//   Body: { webinar_slug, first_name, last_name, email, consent_marketing?, source?, hp? }
//   Header: apikey: <anon-key>           (Supabase verlangt das für Function-Calls)
//   Optional: Authorization: Bearer ...  (nicht gebraucht — Function läuft anonym)
//
// Sicherheit:
//   - Schreibt mit service_role → bypasst RLS, anon/authenticated haben keinen
//     direkten Insert auf public.webinar_registrations.
//   - CORS auf leadesk.de + www.leadesk.de gewhitelistet (+ Staging-Subdomain).
//   - Honeypot-Field `hp` — wenn gefüllt, 200 OK ohne DB-Insert.
//   - Input-Validation: Trim + Length-Caps + Email-Regex (DB-CHECK fängt zusätzlich).
//   - Soft-Rate-Limit per IP: max 5 Anmeldungen / 10min / IP (in-memory, best-effort).
//   - Dedup-Conflict → 200 OK mit { already_registered: true } (kein Leak).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Allowed Origins — explizite Whitelist statt '*', weil die Function Daten
// persistiert und keine offene API sein soll.
const ALLOWED_ORIGINS = new Set([
  "https://leadesk.de",
  "https://www.leadesk.de",
  "https://staging.leadesk.de",      // falls Marketing-Staging existiert
  "http://localhost:3000",            // lokales Dev des Marketing-Sites
  "http://localhost:4173",            // Vite preview
  "http://127.0.0.1:3000",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://leadesk.de";
  return {
    "Access-Control-Allow-Origin":  allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── In-Memory-Rate-Limit (best effort; Edge-Function-Worker-lokal) ──────────
// Edge-Functions auf Hetzner laufen i.d.R. in einem einzigen Container — daher
// reicht ein Map. Bei mehreren Workern: Bypass möglich, aber Spam-Schutz ist
// Defense-in-Depth (Honeypot + DB-Unique-Constraint kompensieren).
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_PER_IP = 5;
const rateBuckets = new Map<string, number[]>();

function rateLimitHit(ip: string): boolean {
  if (!ip) return false;
  const now = Date.now();
  const bucket = (rateBuckets.get(ip) || []).filter(ts => now - ts < RATE_WINDOW_MS);
  if (bucket.length >= RATE_MAX_PER_IP) {
    rateBuckets.set(ip, bucket);
    return true;
  }
  bucket.push(now);
  rateBuckets.set(ip, bucket);
  return false;
}

// ─── Input-Sanitizer ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SLUG_RE  = /^[a-z0-9][a-z0-9-]{0,80}$/;

function trimOrEmpty(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim();
}

interface RegisterInput {
  webinar_slug: string;
  first_name: string;
  last_name: string;
  email: string;
  consent_marketing: boolean;
  source: string | null;
  hp: string;
}

function parseInput(raw: unknown): { ok: true; value: RegisterInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid body" };
  const o = raw as Record<string, unknown>;

  const webinar_slug = trimOrEmpty(o.webinar_slug).toLowerCase();
  const first_name   = trimOrEmpty(o.first_name);
  const last_name    = trimOrEmpty(o.last_name);
  const email        = trimOrEmpty(o.email).toLowerCase();
  const consent_marketing = o.consent_marketing === true;
  const source       = typeof o.source === "string" ? o.source.slice(0, 200) : null;
  const hp           = typeof o.hp === "string" ? o.hp : "";

  if (!SLUG_RE.test(webinar_slug)) return { ok: false, error: "Webinar nicht erkannt." };
  if (first_name.length < 1 || first_name.length > 100) return { ok: false, error: "Vorname fehlt oder zu lang." };
  if (last_name.length  < 1 || last_name.length  > 100) return { ok: false, error: "Nachname fehlt oder zu lang." };
  if (email.length > 254 || !EMAIL_RE.test(email))      return { ok: false, error: "E-Mail-Adresse ungültig." };

  return { ok: true, value: { webinar_slug, first_name, last_name, email, consent_marketing, source, hp } };
}

// ─── Handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const parsed = parseInput(body);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400, origin);
  }
  const input = parsed.value;

  // Honeypot — Bots füllen "hp" mit Müll, normale User sehen das Feld nicht.
  if (input.hp.length > 0) {
    // Vortäuschen, dass es geklappt hat — keine DB-Schreibung, kein Hinweis an den Bot.
    return json({ ok: true }, 200, origin);
  }

  // Rate-Limit
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip  = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  if (rateLimitHit(ip)) {
    return json({ error: "Zu viele Anmeldungen von dieser IP. Bitte später erneut versuchen." }, 429, origin);
  }

  const user_agent = (req.headers.get("user-agent") || "").slice(0, 500);

  // DB-Insert
  const { error: insertError } = await supabase
    .from("webinar_registrations")
    .insert({
      webinar_slug:      input.webinar_slug,
      first_name:        input.first_name,
      last_name:         input.last_name,
      email:             input.email,
      consent_marketing: input.consent_marketing,
      source:            input.source,
      ip:                ip || null,
      user_agent:        user_agent || null,
    });

  if (insertError) {
    // Unique-Constraint = bereits angemeldet → User-friendly success
    if (insertError.code === "23505") {
      return json({ ok: true, already_registered: true }, 200, origin);
    }
    console.error("[webinar-register] insert error:", insertError);
    return json({ error: "Speichern fehlgeschlagen. Bitte später erneut versuchen." }, 500, origin);
  }

  return json({ ok: true }, 200, origin);
});
