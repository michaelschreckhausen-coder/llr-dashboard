// supabase/functions/generate-image/index.ts
// Multi-Provider Bild-Generierung (Mai 2026).
//
// Routing per model-Prefix:
//   gemini*    → Google Gemini 2.5 Flash Image ("Nano Banana") — $0.039/Bild
//   gpt-image* → OpenAI gpt-image-1 / gpt-image-1-mini — $0.005-0.17/Bild
//
// Reference-Images (Phase 2a+2b, 2026-05-27):
//   * referenceImagePaths im body → 1-14 Storage-Pfade aus 'visuals'-Bucket
//   * Plus: alle BV-Hero-Images (brand_voices.hero_image_paths) automatisch
//   * Nur Nano Banana unterstützt Reference-Images. OpenAI ignoriert sie.
//
// Speichert Output in Storage-Bucket 'visuals', insertet Row in 'visuals'-Tabelle.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCallerContext, checkCredits, recordUsage, estimateCredits } from "../_shared/credits.ts";
import { coverCropToSize } from "./imageCropDeno.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Aspect-Ratio Whitelist (Neuroflash-Style erweitert + Legacy LinkedIn-Ratios)
const ASPECT_TO_SIZE: Record<string, { w: number; h: number }> = {
  "1:1":    { w: 1024, h: 1024 },
  "3:2":    { w: 1536, h: 1024 },
  "2:3":    { w: 1024, h: 1536 },
  "4:3":    { w: 1344, h: 1008 },
  "3:4":    { w: 1008, h: 1344 },
  "5:4":    { w: 1280, h: 1024 },
  "4:5":    { w: 1024, h: 1280 },
  "21:9":   { w: 1792, h: 768  },
  "16:9":   { w: 1536, h: 864  },
  "9:16":   { w: 864,  h: 1536 },
  // Legacy (LinkedIn-spezifische Formate für Posts die vorher angelegt wurden)
  "1.91:1": { w: 1456, h: 762  },
  "4:1":    { w: 1792, h: 448  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function buildResolvedPrompt(userPrompt: string, brandVoice: any, aspect: string, companyVoice: any = null): string {
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
  // Ambassador: CI-Vorgaben des Company Brands (Farben/Fonts haben Vorrang fürs Branding,
  // die Personen-Identity kommt weiterhin aus den Hero-Referenzbildern)
  if (companyVoice) {
    const cname = companyVoice.brand_name || companyVoice.name;
    if (cname) lines.push(`Brand context: created on behalf of the company "${cname}" — follow its corporate identity.`);
    if (companyVoice.visual_style_description) lines.push(`Company visual style: ${companyVoice.visual_style_description}`);
    if (Array.isArray(companyVoice.visual_color_palette) && companyVoice.visual_color_palette.length) {
      lines.push(`Company brand colors (use these for branding accents): ${companyVoice.visual_color_palette.join(", ")}`);
    }
    if (companyVoice.brand_fonts && (companyVoice.brand_fonts.primary || companyVoice.brand_fonts.secondary)) {
      const f = [companyVoice.brand_fonts.primary, companyVoice.brand_fonts.secondary].filter(Boolean).join(" / ");
      lines.push(`Typography (for any text overlays): ${f}${companyVoice.brand_fonts.notes ? " — " + companyVoice.brand_fonts.notes : ""}`);
    }
    if (Array.isArray(companyVoice.visual_keywords) && companyVoice.visual_keywords.length) {
      lines.push(`Company mood keywords: ${companyVoice.visual_keywords.join(", ")}`);
    }
  }
  lines.push(`Subject: ${userPrompt}`);
  if (brandVoice?.visual_negative_prompt) {
    lines.push(`Avoid: ${brandVoice.visual_negative_prompt}`);
  }
  if (companyVoice?.visual_negative_prompt) {
    lines.push(`Avoid (company): ${companyVoice.visual_negative_prompt}`);
  }
  lines.push(`Aspect ratio: ${aspect}`);
  return lines.join("\n");
}


function getProvider(model: string): "google" | "openai" {
  if (model.startsWith("gemini")) return "google";
  if (model.startsWith("gpt-image") || model.startsWith("dall-e")) return "openai";
  return "openai"; // Default seit Mai 2026 (Google Free-Tier blockt Nano Banana)
}

// OpenAI gpt-image: aspect-ratio → fixe size-Optionen (OpenAI hat nur 3 sizes)
// Wir mappen jeden Aspect-Ratio auf die nächstbeste OpenAI-Size.
const OPENAI_SIZE_MAP: Record<string, string> = {
  "1:1":    "1024x1024",
  "3:2":    "1536x1024",
  "2:3":    "1024x1536",
  "4:3":    "1536x1024",
  "3:4":    "1024x1536",
  "5:4":    "1536x1024",
  "4:5":    "1024x1536",
  "21:9":   "1536x1024",
  "16:9":   "1536x1024",
  "9:16":   "1024x1536",
  // Legacy
  "1.91:1": "1536x1024",
  "4:1":    "1536x1024",
};

async function generateWithOpenAI(
  prompt: string,
  aspectRatio: string,
  model: string,
  quality: string,
  apiKey: string,
  referenceImagesB64: { mimeType: string; data: string }[] = [],
): Promise<{ base64: string; mimeType: string } | { error: string }> {
  const size = OPENAI_SIZE_MAP[aspectRatio] || "1024x1024";

  // Mit References: /v1/images/edits (multipart/form-data, bis zu 16 image[]-Files)
  if (referenceImagesB64.length > 0) {
    const fd = new FormData();
    fd.append("model", model);
    fd.append("prompt", prompt);
    fd.append("size", size);
    fd.append("quality", quality);
    fd.append("n", "1");
    // input_fidelity: 'high' damit OpenAI Identity/Style stärker preserved.
    // ABER: gpt-image-1-mini unterstützt input_fidelity nicht (nur gpt-image-1 Standard/Premium).
    if (model !== "gpt-image-1-mini") {
      fd.append("input_fidelity", "high");
    }
    // Mehrere Image-Files als image[]-Array
    for (let i = 0; i < referenceImagesB64.length; i++) {
      const ref = referenceImagesB64[i];
      const bytes = Uint8Array.from(atob(ref.data), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: ref.mimeType });
      const ext = ref.mimeType.split("/")[1] || "png";
      fd.append("image[]", blob, `ref${i}.${ext}`);
    }

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey },
      body: fd,
    });
    const rawText = await res.text();
    console.error("[openai-edits] status:", res.status, "body-preview:", rawText.slice(0, 500));
    let data: any = null;
    try { data = JSON.parse(rawText); } catch {}
    if (!res.ok || !data?.data?.[0]?.b64_json) {
      return { error: data?.error?.message || ("OpenAI edits HTTP " + res.status + ": " + rawText.slice(0, 400)) };
    }
    return { base64: data.data[0].b64_json, mimeType: "image/png" };
  }

  // Ohne References: klassisches /v1/images/generations
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ model, prompt, n: 1, size, quality }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.data?.[0]?.b64_json) {
    return { error: data?.error?.message || ("OpenAI HTTP " + res.status + ": " + JSON.stringify(data).slice(0, 200)) };
  }
  return { base64: data.data[0].b64_json, mimeType: "image/png" };
}

async function generateWithGoogle(
  prompt: string,
  aspectRatio: string,
  model: string,
  apiKey: string,
  referenceImagesB64: { mimeType: string; data: string }[] = [],
): Promise<{ base64: string; mimeType: string } | { error: string }> {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  // Bei Reference-Images: explizite Instruktion VOR den Bildern, damit das Modell
  // versteht dass die Bilder als Identity/Style-Anker zu verwenden sind.
  const parts: any[] = [];
  if (referenceImagesB64.length > 0) {
    parts.push({
      text: `Die folgenden ${referenceImagesB64.length} Referenzbild(er) zeigen die Person und/oder den visuellen Stil, den du im generierten Bild beibehalten sollst. Achte besonders auf: Gesicht/Identität der Person, Markenfarben, visuelle Tonalität. Übernimm diese Elemente konsistent. Nach den Referenzbildern folgt die eigentliche Bild-Beschreibung.`
    });
  }
  for (const ref of referenceImagesB64) {
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
  }
  parts.push({ text: prompt });
  const reqBody = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      imageConfig: { aspectRatio },
    },
  };

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { error: `Gemini HTTP ${res.status}: ${errText.slice(0, 300)}` };
  }
  const data = await res.json();
  let base64Data: string | null = null;
  let mimeType = "image/png";
  for (const cand of data?.candidates || []) {
    for (const part of cand?.content?.parts || []) {
      const inline = part?.inline_data || part?.inlineData;
      if (inline?.data && (inline.mime_type || inline.mimeType)?.startsWith("image/")) {
        base64Data = inline.data;
        mimeType = inline.mime_type || inline.mimeType;
        break;
      }
    }
    if (base64Data) break;
  }
  if (!base64Data) return { error: "Gemini hat kein Bild zurückgegeben" };
  return { base64: base64Data, mimeType };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  // Auth
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const googleKey   = Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GEMINI_API_KEY");

  if (!supabaseUrl || !serviceKey) return json({ error: "Server-Konfiguration unvollständig (SB)" }, 500);
  if (!googleKey)                  return json({ error: "Google-API-Key fehlt im Server-Env" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const ctx = await getCallerContext(req, admin);
  if (!ctx) return json({ error: "Nicht autorisiert oder Session abgelaufen" }, 401);
  const user = { id: ctx.user_id };

  // Body
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Ungültiger Request-Body" }, 400); }

  const prompt        = (body?.prompt || "").toString().trim();
  const aspectRatio   = (body?.aspectRatio || "1:1").toString();
  const brandVoiceId  = body?.brandVoiceId || null;
  const companyVoiceId = body?.companyVoiceId || null; // Ambassador: CI eines Company Brands zusätzlich
  const postId        = body?.postId       || null;
  const variantsCount = Math.min(Math.max(parseInt(body?.variants || 1, 10), 1), 4);
  const model         = body?.model || "gpt-image-1-mini";
  // Quality kommt aus body, default-Mapping: mini → low, sonst medium
  const quality       = (body?.quality as string) || (model.includes("mini") ? "low" : "medium");
  // Ziel-px fuer exakten cover-Crop nach der Generierung (optional).
  const targetWidth   = parseInt(body?.targetWidth, 10)  || null;
  const targetHeight  = parseInt(body?.targetHeight, 10) || null;

  if (!prompt) return json({ error: "Prompt fehlt" }, 400);
  if (!ASPECT_TO_SIZE[aspectRatio]) return json({ error: "Ungültiges Aspect-Ratio" }, 400);

  // Team-id ermitteln (erstes team_members-Match — Multi-Team-Support kommt später)
  const { data: tm } = await admin.from("team_members").select("team_id").eq("user_id", user.id).limit(1).single();
  const teamId = tm?.team_id;
  if (!teamId) return json({ error: "Kein Team gefunden" }, 400);

  // Brand Voice + Hero/CI-Images laden (falls gewählt)
  // useBrandVoiceRefs steuert, ob die BV-Refs überhaupt mitgesendet werden.
  // Default = true (Rückwärtskompatibilität für alte Clients).
  const useBVRefs: boolean = body?.useBrandVoiceRefs !== false;
  let brandVoice: any = null;
  let bvHeroImagePaths: string[] = [];
  let bvCIImagePaths: string[] = [];
  if (brandVoiceId) {
    const { data: bv } = await admin.from("brand_voices").select("visual_style_description, visual_color_palette, visual_keywords, visual_negative_prompt, hero_image_paths, ci_image_paths").eq("id", brandVoiceId).single();
    brandVoice = bv;
    if (useBVRefs) {
      bvHeroImagePaths = Array.isArray(bv?.hero_image_paths) ? bv.hero_image_paths : [];
      bvCIImagePaths   = Array.isArray(bv?.ci_image_paths)   ? bv.ci_image_paths   : [];
    }
  }

  // Ambassador: Company Brand laden — CI (Logos, Farben, Stil) fließt zusätzlich ein
  let companyVoice: any = null;
  let companyRefPaths: string[] = [];
  if (companyVoiceId && companyVoiceId !== brandVoiceId) {
    const { data: cv } = await admin.from("brand_voices").select("brand_name, name, visual_style_description, visual_color_palette, visual_keywords, visual_negative_prompt, logo_paths, ci_image_paths, brand_fonts").eq("id", companyVoiceId).single();
    companyVoice = cv;
    if (useBVRefs && cv) {
      const logos = Array.isArray(cv.logo_paths) ? cv.logo_paths : [];
      const ci    = Array.isArray(cv.ci_image_paths) ? cv.ci_image_paths : [];
      companyRefPaths = [...logos, ...ci];
    }
  }

  // Reference-Images: BV-Hero (Personen) + BV-CI (Logos/CI) + Company-CI + Custom-Refs
  // Reihenfolge: erst Personen (höchste Identity-Priorität), dann CI, dann Custom
  const userRefPaths: string[] = Array.isArray(body?.referenceImagePaths) ? body.referenceImagePaths : [];
  const parentVisualId: string | null = (body?.parentVisualId as string) || null;
  const allReferencePaths: string[] = [...bvHeroImagePaths, ...bvCIImagePaths, ...companyRefPaths, ...userRefPaths].slice(0, 14); // Nano Banana max 14

  // Reference-Images aus Storage downloaden + base64-encoden
  const referenceImagesB64: { mimeType: string; data: string }[] = [];
  for (const refPath of allReferencePaths) {
    const { data: blob, error: dlErr } = await admin.storage.from("visuals").download(refPath);
    if (dlErr || !blob) {
      console.warn(`[generate-image] reference image download failed: ${refPath} - ${dlErr?.message}`);
      continue;
    }
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    const mime = (refPath.endsWith(".png") ? "image/png" : refPath.endsWith(".webp") ? "image/webp" : "image/jpeg");
    referenceImagesB64.push({ mimeType: mime, data: b64 });
  }

  const resolvedPrompt = buildResolvedPrompt(prompt, brandVoice, aspectRatio, companyVoice);

  // Provider-spezifische Generierung — pro Variante einzeln aufrufen
  const provider = getProvider(model);

  // Pre-Call Credits-Gate: total cost = variantsCount × per-image
  const perImageEstimate = await estimateCredits(provider, model, 'image_generate', {
    image_count: 1,
  }, admin);
  const totalEstimate = perImageEstimate * variantsCount;
  const check = await checkCredits(ctx.account_id, totalEstimate, admin);
  if (!check.allowed) {
    return json({
      error: check.reason === 'monthly_budget_exceeded'
        ? 'Monatliches Credit-Budget reicht nicht für die Anzahl Varianten.'
        : check.reason === 'daily_cap_exceeded'
        ? 'Tägliches Limit erreicht.'
        : 'Credit-Check fehlgeschlagen.',
      code: 'credits_exhausted',
      reason: check.reason,
      remaining: check.remaining,
      estimated: totalEstimate,
      per_image: perImageEstimate,
      variants: variantsCount,
    }, 402);
  }

  const generatedVisuals: any[] = [];

  for (let i = 0; i < variantsCount; i++) {
    // 1) Bild generieren
    let imgResult: { base64: string; mimeType: string } | { error: string };
    if (provider === "openai") {
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) return json({ error: "OPENAI_API_KEY fehlt im Server-Env" }, 500);
      imgResult = await generateWithOpenAI(resolvedPrompt, aspectRatio, model, quality, openaiKey, referenceImagesB64);
    } else {
      // Google ist Default für gemini-* Modelle
      imgResult = await generateWithGoogle(resolvedPrompt, aspectRatio, model, googleKey, referenceImagesB64);
    }
    if ("error" in imgResult) {
      return json({ error: `Bild ${i+1}/${variantsCount}: ${imgResult.error}` }, 200);
    }

    // 2) Decode (+ optional exakter cover-Crop auf Ziel-px) + Upload zu Storage
    const binary = Uint8Array.from(atob(imgResult.base64), c => c.charCodeAt(0));
    let uploadBytes = binary;
    let uploadMime = imgResult.mimeType;
    if (targetWidth && targetHeight) {
      const cropped = await coverCropToSize(binary, targetWidth, targetHeight);
      uploadBytes = cropped.bytes;
      uploadMime = cropped.mimeType;   // 'image/png'
    }
    const ext = uploadMime.split("/")[1] || "png";
    const visualId = crypto.randomUUID();
    const storagePath = `${teamId}/${visualId}.${ext}`;

    const { error: uploadErr } = await admin.storage
      .from("visuals")
      .upload(storagePath, uploadBytes, { contentType: uploadMime, upsert: false });
    if (uploadErr) {
      return json({ error: `Storage-Upload fehlgeschlagen: ${uploadErr.message}` }, 500);
    }

    // 3) Insert visuals-Row
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
        parent_visual_id: parentVisualId,
      })
      .select()
      .single();
    if (insertErr) {
      return json({ error: `DB-Insert fehlgeschlagen: ${insertErr.message}` }, 500);
    }

    // 4) Signed-URL für Client (24h)
    //    createSignedUrl returnt eine URL mit dem internen Kong-Hostname (http://kong:8000)
    //    weil der Edge-Function-Container das als SUPABASE_URL kennt. Vom Browser aus
    //    ist das nicht erreichbar — wir mappen auf den Public-Host via SUPABASE_PUBLIC_URL
    //    (oder Fallback aus dem Request-Origin-Header).
    const { data: signed } = await admin.storage.from("visuals").createSignedUrl(storagePath, 60 * 60 * 24);
    let signedUrl = signed?.signedUrl || null;
    if (signedUrl) {
      const publicHost = Deno.env.get("SUPABASE_PUBLIC_URL") || req.headers.get("origin") || "";
      if (publicHost) {
        // Internal-Host (http://kong:8000) durch publicHost ersetzen
        signedUrl = signedUrl.replace(/^https?:\/\/[^\/]+/, publicHost.replace(/\/$/, ""));
      }
    }
    generatedVisuals.push({
      ...visualRow,
      signed_url: signedUrl,
    });

    // Post-Call: record_usage pro Variante (defensive, fire-and-forget)
    await recordUsage(ctx, {
      edge_function: 'generate-image',
      operation: 'image_generate',
      provider, model,
      units: 1,
      unit_type: 'image',
      status: 'success',
      extra_metadata: { aspect_ratio: aspectRatio, variant_index: i, references_used: referenceImagesB64.length },
    }, admin).catch(() => null);
  }

  return json({ visuals: generatedVisuals, model, provider, references_used: referenceImagesB64.length });
});
