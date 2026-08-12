// supabase/functions/linkedin-publish-post/index.ts
// DEPRECATED (12.08.2026): Native LinkedIn-Posts-API abgeschaltet.
// Leadesk veröffentlicht LinkedIn ausschließlich über Unipile (unipile-post-publish).
// Diese Funktion antwortet bewusst mit 410, damit kein Altpfad mehr nativ posten kann.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  return new Response(JSON.stringify({
    error: "linkedin-publish-post ist abgeschaltet. LinkedIn-Veröffentlichung läuft ausschließlich über Unipile (unipile-post-publish).",
    deprecated: true,
  }), { status: 410, headers: { ...CORS, "Content-Type": "application/json" } });
});
