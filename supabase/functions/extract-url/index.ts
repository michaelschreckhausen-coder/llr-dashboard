// supabase/functions/extract-url/index.ts
// Holt eine URL serverseitig und extrahiert Title, Meta-Description und Haupttext.
// JWT-Auth wird über Supabase verify_jwt automatisch erzwungen.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_HTML_BYTES = 2_500_000;   // 2.5 MB Rohgrenze — verhindert OOM bei riesigen Seiten
const MAX_TEXT_CHARS = 50_000;      // Output-Limit für extrahierten Text
const FETCH_TIMEOUT_MS = 12_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractMeta(html: string, name: string): string {
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

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m && m[1]) return decodeEntities(m[1]).replace(/\s+/g, " ").trim();
  return "";
}

function extractText(html: string): string {
  let s = html;
  const bodyMatch = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) s = bodyMatch[1];
  const killBlocks = [
    /<script[\s\S]*?<\/script>/gi,
    /<style[\s\S]*?<\/style>/gi,
    /<noscript[\s\S]*?<\/noscript>/gi,
    /<nav[\s\S]*?<\/nav>/gi,
    /<header[\s\S]*?<\/header>/gi,
    /<footer[\s\S]*?<\/footer>/gi,
    /<aside[\s\S]*?<\/aside>/gi,
    /<form[\s\S]*?<\/form>/gi,
    /<svg[\s\S]*?<\/svg>/gi,
    /<iframe[\s\S]*?<\/iframe>/gi,
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
  s = s.trim();
  return s;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadeskBot/1.0; +https://leadesk.de)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { url?: string };
  try { body = await req.json(); } catch { return json({ error: "Ungültiger Request-Body" }, 400); }

  const rawUrl = (body?.url || "").trim();
  if (!rawUrl) return json({ error: "URL fehlt" }, 400);

  let target: URL;
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

  let res: Response;
  try {
    res = await fetchWithTimeout(target.toString());
  } catch (e) {
    const msg = (e instanceof Error && e.name === "AbortError")
      ? "Zeitüberschreitung beim Laden der Seite"
      : `Seite konnte nicht geladen werden: ${(e as Error).message}`;
    return json({ error: msg }, 502);
  }

  if (!res.ok) {
    return json({ error: `HTTP ${res.status} beim Abruf der Seite` }, 502);
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
    return json({ error: `Nur HTML-Seiten werden unterstützt (Content-Type: ${ct || "unbekannt"})` }, 415);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_HTML_BYTES) {
    return json({ error: `Seite zu groß (${Math.round(buf.byteLength/1024)} KB, max ${MAX_HTML_BYTES/1024} KB)` }, 413);
  }
  const charsetMatch = ct.match(/charset=([^;]+)/);
  const charset = (charsetMatch ? charsetMatch[1] : "utf-8").trim();
  let html: string;
  try {
    html = new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }

  const title = extractTitle(html) || extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
  const description = extractMeta(html, "description") || extractMeta(html, "og:description") || extractMeta(html, "twitter:description");
  let text = extractText(html);

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
