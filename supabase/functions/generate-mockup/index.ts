// Supabase Edge Function: generate-mockup (Phase 5, MockUp-Tool LED-Bande)
// ----------------------------------------------------------------------------
// Orchestriert die Logo-auf-Bande-Montage: laedt Stadion-Vorlage + Sponsorlogo
// aus dem Storage, ruft die BESTEHENDE Bild-Pipeline (generate-image-EF) im
// Edit/Composite-Modus und legt das Ergebnis in Bucket 'sponsoring-mockups' ab.
// Schreibt sponsoring.mockups.result_path + status.
//
// WICHTIG / Integrationspunkt: Die genaue Signatur der generate-image-EF ist
// hier nicht verifiziert (EF lebt manuell auf Hetzner-Prod, Memory
// generate_image_ef_manual_deploy_branch_divergence). Der Aufruf in
// callImageEdit() ist als anzupassender Adapter markiert.
//
// Body: { mockup_id: string }  (Row muss vorab mit stadium_template_id + logo_path existieren)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---- ADAPTER an die reale generate-image-EF -------------------------------
// generate-image liest Referenzbilder NUR aus dem 'visuals'-Bucket und braucht
// ein User-JWT (getCallerContext). Wir bruecken daher: Stadion+Logo nach
// 'visuals' kopieren, generate-image mit dem Caller-JWT + referenceImagePaths
// rufen, das Ergebnis aus 'visuals' (resp.visuals[0].storage_path) zurueckladen.
// Rueckgabe: die fertigen Bild-Bytes (PNG).
async function callImageEdit(p: {
  authHeader: string; teamId: string; mockupId: string;
  stadiumPath: string; logoPath: string; placement: string;
}): Promise<Uint8Array> {
  const dl = async (bucket: string, path: string): Promise<Uint8Array> => {
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error || !data) throw new Error(`download ${bucket}/${path}: ${error?.message || "no data"}`);
    return new Uint8Array(await data.arrayBuffer());
  };
  const stadiumBytes = await dl("sponsoring-stadium", p.stadiumPath);
  const logoBytes = await dl("sponsoring-mockups", p.logoPath);

  // Quellbilder temporaer in den visuals-Bucket (erste Pfad-Ebene = team_id → RLS)
  const srcStadium = `${p.teamId}/_mockup-src/${p.mockupId}-stadium.png`;
  const srcLogo = `${p.teamId}/_mockup-src/${p.mockupId}-logo.png`;
  for (const [path, bytes] of [[srcStadium, stadiumBytes], [srcLogo, logoBytes]] as [string, Uint8Array][]) {
    const up = await supabaseAdmin.storage.from("visuals").upload(path, bytes, { contentType: "image/png", upsert: true });
    if (up.error) throw new Error("visuals upload: " + up.error.message);
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": p.authHeader },
    body: JSON.stringify({
      prompt: `Platziere das Sponsorenlogo (zweites Referenzbild) fotorealistisch auf der Flaeche "${p.placement}" `
        + `des ersten Referenzbildes (Stadion/Bande). Perspektive, Beleuchtung und Verzerrung der Flaeche exakt `
        + `beibehalten, den Rest des Bildes unveraendert lassen.`,
      referenceImagePaths: [srcStadium, srcLogo],
      aspectRatio: "16:9",
      variants: 1,
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("generate-image failed: " + res.status + " " + JSON.stringify(out).slice(0, 200));
  const v = out?.visuals?.[0];
  if (!v?.storage_path) throw new Error("generate-image returned no visual");
  const resultBytes = await dl("visuals", v.storage_path);
  // temp-Quellen aufraeumen (fire-and-forget)
  supabaseAdmin.storage.from("visuals").remove([srcStadium, srcLogo]).catch(() => {});
  return resultBytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "missing authorization" }, 401);
    const { mockup_id } = await req.json();
    if (!mockup_id) return json({ error: "mockup_id required" }, 400);

    // Read mit User-JWT -> RLS beweist Team-Zugehoerigkeit
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: m, error: readErr } = await userClient
      .schema("sponsoring").from("mockups").select("*").eq("id", mockup_id).maybeSingle();
    if (readErr) return json({ error: readErr.message }, 400);
    if (!m) return json({ error: "not found or not authorized" }, 403);

    // Stadion-Vorlage laden
    const { data: tpl } = await supabaseAdmin
      .schema("sponsoring").from("stadium_templates").select("*").eq("id", m.stadium_template_id).maybeSingle();
    if (!tpl) {
      await supabaseAdmin.schema("sponsoring").from("mockups")
        .update({ status: "failed", error: "stadium_template missing" }).eq("id", mockup_id);
      return json({ error: "stadium_template missing" }, 400);
    }

    // Montage (Bridge ueber visuals-Bucket, Caller-JWT durchreichen)
    const resultBytes = await callImageEdit({
      authHeader, teamId: m.team_id, mockupId: mockup_id,
      stadiumPath: tpl.storage_path, logoPath: m.logo_path,
      placement: tpl.placement || "LED-Bande",
    });

    // Ergebnis ablegen (Pfad-Konvention: <team_id>/<mockup_id>.png -> RLS greift)
    const resultPath = `${m.team_id}/${mockup_id}.png`;
    const up = await supabaseAdmin.storage.from("sponsoring-mockups")
      .upload(resultPath, resultBytes, { contentType: "image/png", upsert: true });
    if (up.error) throw new Error(up.error.message);

    await supabaseAdmin.schema("sponsoring").from("mockups")
      .update({ status: "done", result_path: resultPath, error: null }).eq("id", mockup_id);

    return json({ ok: true, result_path: resultPath });
  } catch (e) {
    await supabaseAdmin.schema("sponsoring").from("mockups")
      .update({ status: "failed", error: String((e as Error).message || e) }).eq("id", (await req.clone().json().catch(() => ({})))?.mockup_id ?? "");
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
