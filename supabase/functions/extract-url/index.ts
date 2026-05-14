// supabase/functions/extract-url/index.ts
// Holt eine URL serverseitig und extrahiert Title, Meta-Description und Haupttext.
// Auth wird manuell validiert (via service role), da Gateway-JWT-Check bei
// ES256-Session-Tokens fehlschlägt. Deshalb hier mit verify_jwt: false deployen.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_HTML_BYTES = 2_500_000;
const MAX_TEXT_CHARS = 50_000;
const FETCH_TIMEOUT_MS = 12_000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractMeta(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*property=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*name=["']${name}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1]).trim();
  }
  return "";
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m && m[1]) return decodeEntities(m[1]).replace(/\s+/g, " ").trim();
  return "";
}

function extractText(html) {
  let s = html;
  const bodyMatch = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) s = bodyMatch[1];
  const killBlocks = [
    /<script[\s\S]*?<\/script>/gi, /<style[\s\S]*?<\/style>/gi,
    /<noscript[\s\S]*?<\/noscript>/gi, /<nav[\s\S]*?<\/nav>/gi,
    /<header[\s\S]*?<\/header>/gi, /<footer[\s\S]*?<\/footer>/gi,
    /<aside[\s\S]*?<\/aside>/gi, /<form[\s\S]*?<\/form>/gi,
    /<svg[\s\S]*?<\/svg>/gi, /<iframe[\s\S]*?<\/iframe>/gi,
    /<!--[\s\S]*?-->/g,
  ];
  for (const re of killBlocks) s = s.replace(re, " ");
  s = s.replace(/<\/(p|div|section|article|h[1-6]|li|br|tr|td|th|pre|blockquote)[^>]*>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/\n[ \t]+/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

// SPA-Fallback: viele moderne Seiten (Next.js, Nuxt, manche Gatsby/SvelteKit) rendern
// im <body> nur einen leeren Mount-Container und schreiben den eigentlichen Inhalt
// in ein __NEXT_DATA__ / __NUXT_DATA__ / __INITIAL_STATE__ JSON-Script. Wenn die
// klassische Text-Extraktion nichts liefert, suchen wir gezielt nach diesen
// Hydration-Skripten und walken das JSON nach "human readable" Strings.
function extractHydrationJson(html) {
  const patterns = [
    /<script id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/,
    /<script id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/,
    /<script[^>]*>\s*window\.__NUXT__\s*=\s*([\s\S]*?)\s*;?\s*<\/script>/,
    /<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)\s*;?\s*<\/script>/,
    /<script[^>]*>\s*window\.__APOLLO_STATE__\s*=\s*([\s\S]*?)\s*;?\s*<\/script>/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      try { return JSON.parse(m[1]); }
      catch { /* manche schreiben Funktionsaufrufe — ueberspringen */ }
    }
  }
  return null;
}

const SKIP_KEYS = new Set([
  "__html","image","images","src","href","url","imageUrl","iconUrl","asPath",
  "locale","locales","runtimeConfig","build","buildId","assetPrefix",
  "axiosConfigData","cmsBinariesUrl","cmsBinariesLogosUrl","cmsBinariesPlayerUrl",
  "cmsRestServiceUrl","cmsBaseUrl","manifest","sitemap","rss","atom",
  "endpoint","endpoints","channel","channels","tracking","analytics",
  "type","layout","template","componentClassName","sharedComponent",
  "stylesheets","scripts","styles","modules","chunks","preloadFonts",
]);

function looksLikeHumanText(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 25) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^data:/.test(t)) return false;
  if (/^\/[\w\-]+\//.test(t) && !/\s/.test(t)) return false;
  if (/^[0-9a-f-]{20,}$/i.test(t)) return false;
  if (/^[A-Z_]{4,}$/.test(t)) return false;
  // class-namen / package-paths (com.foo.bar.Baz, org.x.y, foo::bar)
  if (!/\s/.test(t) && (/\.[A-Z]/.test(t) || /::/.test(t))) return false;
  // image filenames
  if (/\.(jpg|jpeg|png|gif|webp|svg|ico|mp4|webm|pdf|zip|css|js)(\?|$)/i.test(t)) return false;
  // sehr kurze Strings nur akzeptieren wenn mindestens 2 Leerzeichen (= 3+ Woerter)
  if (t.length < 60 && (t.match(/\s/g) || []).length < 2) return false;
  return true;
}

function stripInlineHtml(s) {
  // CMS speichert teilweise HTML als String im JSON — Tags raus, Entities decoden
  let out = s.replace(/<[^>]+>/g, " ");
  out = decodeEntities(out);
  return out.replace(/\s+/g, " ").trim();
}

function collectTextFromJson(obj, out, depth = 0) {
  if (depth > 14) return;
  if (typeof obj === "string") {
    if (looksLikeHumanText(obj)) {
      const cleaned = stripInlineHtml(obj);
      if (cleaned.length >= 25) out.push(cleaned);
    }
  } else if (Array.isArray(obj)) {
    for (const v of obj) collectTextFromJson(v, out, depth + 1);
  } else if (obj && typeof obj === "object") {
    for (const k in obj) {
      if (SKIP_KEYS.has(k)) continue;
      if (k.startsWith("_") && k !== "_") continue;
      collectTextFromJson(obj[k], out, depth + 1);
    }
  }
}

function extractTextViaHydration(html) {
  const data = extractHydrationJson(html);
  if (!data) return "";
  const root = data?.props?.pageProps || data?.props || data?.data || data?.state || data;
  const strings = [];
  collectTextFromJson(root, strings);
  if (strings.length === 0) return "";
  const seen = new Set();
  const uniq = [];
  for (const s of strings) {
    const key = s.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(s);
  }
  return uniq.join("\n\n");
}


async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadeskBot/1.0; +https://leadesk.de)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Manuelle Auth-Validierung via service role (umgeht ES256-Gateway-Problem)
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht autorisiert" }, 401);
  const userToken = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server-Konfiguration unvollständig" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authErr } = await admin.auth.getUser(userToken);
  if (authErr || !user) return json({ error: "Ungültige oder abgelaufene Session" }, 401);

  // Ab hier ist der User authentifiziert
  let body;
  try { body = await req.json(); } catch { return json({ error: "Ungültiger Request-Body" }, 400); }

  const rawUrl = (body?.url || "").trim();
  if (!rawUrl) return json({ error: "URL fehlt" }, 400);

  let target;
  try {
    target = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);
  } catch {
    return json({ error: "Ungültige URL" }, 400);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return json({ error: "Nur http/https-URLs erlaubt" }, 400);
  }
  const host = target.hostname.toLowerCase();
  const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
  if (blocked.includes(host) || host.endsWith(".local") || host.endsWith(".internal") ||
      /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return json({ error: "Interne/private Hosts sind nicht erlaubt" }, 400);
  }

  // LinkedIn blockiert Server-Side-Fetches systematisch (HTTP 999 / Authentication-Wall).
  // Statt einen technischen Fehler zu werfen geben wir sofort einen sprechenden Hint zurueck.
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    return json({
      error: "LinkedIn-Profile lassen sich nicht serverseitig abrufen (LinkedIn blockiert automatisierte Zugriffe). Bitte den Profil-Text manuell unten einfuegen oder eine oeffentliche URL nutzen.",
      sourceUrl: target.toString(),
    });
  }

  let res;
  try {
    res = await fetchWithTimeout(target.toString());
  } catch (e) {
    const msg = (e instanceof Error && e.name === "AbortError")
      ? "Zeitüberschreitung beim Laden der Seite"
      : `Seite konnte nicht geladen werden: ${e.message}`;
    return json({ error: msg, sourceUrl: target.toString() });
  }

  if (!res.ok) {
    const friendlyMsg = res.status === 403 || res.status === 401
      ? `Die Seite verweigert den Zugriff (HTTP ${res.status}). Bitte den Inhalt manuell einfuegen.`
      : res.status === 404
      ? "Die Seite wurde nicht gefunden (HTTP 404)."
      : res.status === 999
      ? "Die Seite blockiert automatisierte Zugriffe (HTTP 999). Bitte den Inhalt manuell einfuegen."
      : `Die Seite konnte nicht geladen werden (HTTP ${res.status}).`;
    return json({ error: friendlyMsg, sourceUrl: target.toString() });
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
    return json({ error: `Nur HTML-Seiten werden unterstuetzt (Content-Type: ${ct || "unbekannt"}). Lade die Datei stattdessen direkt hoch.`, sourceUrl: target.toString() });
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_HTML_BYTES) {
    return json({ error: `Seite zu gross (${Math.round(buf.byteLength/1024)} KB, max ${MAX_HTML_BYTES/1024} KB). Bitte einen Auszug manuell einfuegen.`, sourceUrl: target.toString() });
  }

  const charsetMatch = ct.match(/charset=([^;]+)/);
  const charset = (charsetMatch ? charsetMatch[1] : "utf-8").trim();
  let html;
  try { html = new TextDecoder(charset, { fatal: false }).decode(buf); }
  catch { html = new TextDecoder("utf-8", { fatal: false }).decode(buf); }

  const title = extractTitle(html) || extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
  const description = extractMeta(html, "description") || extractMeta(html, "og:description") || extractMeta(html, "twitter:description");
  let text = extractText(html);

  // SPA-Fallback: leeres / minimales body -> Hydration-Script anzapfen
  if (text.length < 200) {
    const hydrationText = extractTextViaHydration(html);
    if (hydrationText.length > text.length) {
      text = hydrationText;
    }
  }

  let truncated = false;
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
    truncated = true;
  }

  return json({
    sourceUrl: target.toString(),
    title,
    description,
    text,
    truncated,
    textLength: text.length,
  });
});

