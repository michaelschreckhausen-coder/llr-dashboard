// supabase/functions/generate-image/index.ts
// Generiert ein Bild via Google Gemini 2.5 Flash Image ("Nano Banana").
// Speichert Output in Storage-Bucket 'visuals', insertet Row in 'visuals'-Tabelle.
// Auth manuell via service role (analog zu extract-url, generate).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ASPECT_TO_SIZE: Record<string, { w: number; h: number }> = {
  "1:1":    { w: 1024, h: 1024 },
  "4:5":    { w: 1024, h: 1280 },
  "1.91:1": { w: 1456, h: 762  },
  "4:1":    { w: 1792, h: 448  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function buildResolvedPrompt(userPrompt: string, brandVoice: any, aspect: string): string {
  const lines: string[] = [];
  if (brandVoice?.visual_style_description) {
    lines.push(`Style: ${brandVoice.visual_style_description}`);
  }
  if (Array.isArray(brandVoice?.visual_color_palette) && brandVoice.visual_color_palette.length) {
    lines.push(`Color palette: ${brandVoice.visual_color_palette.join(", ")}`);
  }
  if (Array.isArray(brandVoice?.visual_keywords) && brandVoice.visual_keywords.length) {
    lines.push(`Mood keywords: ${brandVoice.visual_keywords.join(", ")}`);
  }
  lines.push(`Subject: ${userPrompt}`);
  if (brandVoice?.visual_negative_prompt) {
    lines.push(`Avoid: ${brandVoice.visual_negative_prompt}`);
  }
  lines.push(`Aspect ratio: ${aspect}`);
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  // Auth
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht autorisiert" }, 401);
  const userToken = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const googleKey   = Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GEMINI_API_KEY");

  if (!supabaseUrl || !serviceKey) return json({ error: "Server-Konfiguration unvollständig (SB)" }, 500);
  if (!googleKey)                  return json({ error: "Google-API-Key fehlt im Server-Env" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authErr } = await admin.auth.getUser(userToken);
  if (authErr || !user) return json({ error: "Ungültige oder abgelaufene Session" }, 401);

  // Body
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Ungültiger Request-Body" }, 400); }

  const prompt        = (body?.prompt || "").toString().trim();
  const aspectRatio   = (body?.aspectRatio || "1:1").toString();
  const brandVoiceId  = body?.brandVoiceId || null;
  const postId        = body?.postId       || null;
  const variantsCount = Math.min(Math.max(parseInt(body?.variants || 1, 10), 1), 4);
  const model         = body?.model || "gemini-2.5-flash-image";

  if (!prompt) return json({ error: "Prompt fehlt" }, 400);
  if (!ASPECT_TO_SIZE[aspectRatio]) return json({ error: "Ungültiges Aspect-Ratio" }, 400);

  // Team-id ermitteln (erstes team_members-Match — Multi-Team-Support kommt später)
  const { data: tm } = await admin.from("team_members").select("team_id").eq("user_id", user.id).limit(1).single();
  const teamId = tm?.team_id;
  if (!teamId) return json({ error: "Kein Team gefunden" }, 400);

  // Brand Voice laden (falls gewählt)
  let brandVoice: any = null;
  if (brandVoiceId) {
    const { data: bv } = await admin.from("brand_voices").select("visual_style_description, visual_color_palette, visual_keywords, visual_negative_prompt").eq("id", brandVoiceId).single();
    brandVoice = bv;
  }

  const resolvedPrompt = buildResolvedPrompt(prompt, brandVoice, aspectRatio);

  // Google Gemini 2.5 Flash Image — generateContent mit responseModalities=["IMAGE","TEXT"]
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`;

  const generatedVisuals: any[] = [];

  for (let i = 0; i < variantsCount; i++) {
    const reqBody = {
      contents: [{ parts: [{ text: resolvedPrompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: { aspectRatio: aspectRatio },
      },
    };

    let res: Response;
    try {
      res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
    } catch (e: any) {
      return json({ error: `Gemini-Anfrage fehlgeschlagen: ${e.message}` }, 502);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return json({ error: `Gemini ${res.status}: ${errText.slice(0, 400)}` }, res.status);
    }

    const data = await res.json();
    // Suche inline_data mit MIME image/*
    let base64Data: string | null = null;
    let mimeType  = "image/png";
    for (const cand of data?.candidates || []) {
      for (const part of cand?.content?.parts || []) {
        const inline = part?.inline_data || part?.inlineData;
        if (inline?.data && (inline.mime_type || inline.mimeType)?.startsWith("image/")) {
          base64Data = inline.data;
          mimeType   = inline.mime_type || inline.mimeType;
          break;
        }
      }
      if (base64Data) break;
    }

    if (!base64Data) return json({ error: "Gemini hat kein Bild zurückgegeben" }, 502);

    // Decode + Upload to Storage
    const binary = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const ext = mimeType.split("/")[1] || "png";
    const visualId = crypto.randomUUID();
    const storagePath = `${teamId}/${visualId}.${ext}`;

    const { error: uploadErr } = await admin.storage
      .from("visuals")
      .upload(storagePath, binary, { contentType: mimeType, upsert: false });

    if (uploadErr) {
      return json({ error: `Storage-Upload fehlgeschlagen: ${uploadErr.message}` }, 500);
    }

    // Insert Row
    const { data: visualRow, error: insertErr } = await admin
      .from("visuals")
      .insert({
        id: visualId,
        user_id: user.id,
        team_id: teamId,
        brand_voice_id: brandVoiceId,
        prompt,
        resolved_prompt: resolvedPrompt,
        aspect_ratio: aspectRatio,
        model,
        storage_path: storagePath,
        post_id: postId,
      })
      .select()
      .single();

    if (insertErr) {
      return json({ error: `DB-Insert fehlgeschlagen: ${insertErr.message}` }, 500);
    }

    // Signed URL fuer Client (24h)
    const { data: signed } = await admin.storage.from("visuals").createSignedUrl(storagePath, 60 * 60 * 24);
    generatedVisuals.push({
      ...visualRow,
      signed_url: signed?.signedUrl || null,
    });
  }

  return json({ visuals: generatedVisuals, model });
});
