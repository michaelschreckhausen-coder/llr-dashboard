// supabase/functions/stock-photos/index.ts
// Proxy für die Pexels-Foto-Suche (Content-Werkstatt-Designer → Kategorie "Bilder").
// Der Pexels-API-Key bleibt serverseitig (PEXELS_API_KEY via docker-compose.override.yml).
// Ohne Key liefert die Function einen sauberen Hinweis (missingKey:true), damit das
// Frontend "Bilder-Suche noch nicht konfiguriert" anzeigen kann statt zu crashen.
//
// Request (POST):  { query?: string, page?: number, perPage?: number, orientation?: 'landscape'|'portrait'|'square' }
// Response:        { photos: [{ id, alt, photographer, photographerUrl, width, height,
//                               src: { tiny, medium, large, original } }], total, page, missingKey? , error? }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Pexels ist vom Server aus gelegentlich flaky (transiente Connection-Timeouts /
// vereinzelte 5xx). Ein einzelner fetch ohne Timeout lässt dann eine ganze
// Bild-Suche (bzw. im Moodboard eine von mehreren) sofort scheitern. Deshalb:
// kurzer Per-Versuch-Timeout + bis zu 3 Versuche mit kleinem Backoff.
async function fetchPexels(url: string, key: string, attempts = 3): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const r = await fetch(url, { headers: { Authorization: key }, signal: ctrl.signal });
      clearTimeout(timer);
      // 5xx / 429 sind transient → nochmal versuchen. 4xx (z.B. schlechte Query) sofort zurück.
      if ((r.status >= 500 || r.status === 429) && i < attempts - 1) {
        lastErr = new Error(`Pexels ${r.status}`);
        await new Promise((res) => setTimeout(res, 350 * (i + 1)));
        continue;
      }
      return r;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e; // AbortError (Timeout) oder Netzfehler → retry
      if (i < attempts - 1) {
        await new Promise((res) => setTimeout(res, 350 * (i + 1)));
        continue;
      }
    }
  }
  throw lastErr || new Error("Pexels nicht erreichbar");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Light-Auth: nur eingeloggte App-User dürfen proxen (Bearer-Token muss vorhanden sein).
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Nicht autorisiert" }, 401);
  }

  const KEY = Deno.env.get("PEXELS_API_KEY") || "";
  if (!KEY) {
    return json({ photos: [], total: 0, page: 1, missingKey: true,
      error: "Bilder-Suche ist noch nicht konfiguriert (PEXELS_API_KEY fehlt)." });
  }

  let body: any = {};
  try { body = await req.json(); } catch (_e) { body = {}; }

  const query = String(body?.query || "").trim();
  const page = Math.max(1, Math.min(50, parseInt(String(body?.page || 1), 10) || 1));
  const perPage = Math.max(1, Math.min(80, parseInt(String(body?.perPage || 30), 10) || 30));
  const orientation = ["landscape", "portrait", "square"].includes(body?.orientation) ? body.orientation : "";

  // Ohne Suchbegriff → kuratierte Pexels-Auswahl (curated endpoint)
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  let url: string;
  if (query) {
    params.set("query", query);
    if (orientation) params.set("orientation", orientation);
    url = `https://api.pexels.com/v1/search?${params.toString()}`;
  } else {
    url = `https://api.pexels.com/v1/curated?${params.toString()}`;
  }

  try {
    const resp = await fetchPexels(url, KEY);
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return json({ photos: [], total: 0, page,
        error: `Pexels-Fehler (${resp.status})${txt ? ": " + txt.slice(0, 140) : ""}` }, 200);
    }
    const data = await resp.json();
    const photos = (data?.photos || []).map((p: any) => ({
      id: p.id,
      alt: p.alt || "",
      photographer: p.photographer || "",
      photographerUrl: p.photographer_url || "",
      width: p.width,
      height: p.height,
      avgColor: p.avg_color || "#eef1f5",
      src: {
        tiny: p?.src?.tiny || p?.src?.small || "",
        medium: p?.src?.medium || p?.src?.large || "",
        large: p?.src?.large2x || p?.src?.large || "",
        original: p?.src?.original || p?.src?.large2x || p?.src?.large || "",
      },
    }));
    return json({ photos, total: data?.total_results ?? photos.length, page, perPage });
  } catch (e) {
    return json({ photos: [], total: 0, page,
      error: "Bilder-Suche fehlgeschlagen: " + (e?.message || String(e)) }, 200);
  }
});
