// Supabase Edge Function: generate (Multi-Provider + Multi-Modal)
//
// Routet auf Anthropic / OpenAI / Google / Mistral je nach model-Prefix.
// Few-Shot-Injection aus content_generations (nur wenn user_preferences.memory_enabled=true).
// Multi-Modal: referenceMediaPaths aus body werden aus Storage geladen und als
// content blocks an den Provider übergeben (Bilder + PDFs; Videos nur Text-Hinweis).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;
const OPENAI_API_KEY       = Deno.env.get("OPENAI_API_KEY") || '';
const GOOGLE_API_KEY       = Deno.env.get("GOOGLE_API_KEY") || '';
const MISTRAL_API_KEY      = Deno.env.get("MISTRAL_API_KEY") || '';
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Multi-Modal-Limits (provider-side)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5 MB pro Bild
const MAX_PDF_BYTES   = 32 * 1024 * 1024;  // 32 MB pro PDF
const MAX_MEDIA_ITEMS = 8;                 // safe-Default für Token-Budget

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" }});
}

function getProvider(model: string): 'anthropic' | 'openai' | 'google' | 'mistral' {
  if (model.startsWith('claude'))  return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('mistral') || model.startsWith('open-mixtral') || model.startsWith('codestral')) return 'mistral';
  return 'anthropic';
}

// ─── Reference-Media Loader ────────────────────────────────────────────────
type MediaPart = {
  type: 'image' | 'document' | 'video';
  mime: string;
  base64: string;
  filename: string;
  size: number;
};

async function loadReferenceMedia(paths: string[]): Promise<{ parts: MediaPart[]; videoHints: string[]; skipped: string[] }> {
  const parts: MediaPart[] = [];
  const videoHints: string[] = [];
  const skipped: string[] = [];
  if (!paths || !paths.length) return { parts, videoHints, skipped };

  const trimmedPaths = paths.slice(0, MAX_MEDIA_ITEMS);

  // Metadata aus visuals-Tabelle (media_type + mime_type + original_filename)
  const { data: visualsRows } = await supabaseAdmin
    .from('visuals')
    .select('storage_path, media_type, mime_type, original_filename, file_size_bytes')
    .in('storage_path', trimmedPaths);
  const metaByPath = new Map<string, any>();
  (visualsRows || []).forEach(r => metaByPath.set(r.storage_path, r));

  for (const path of trimmedPaths) {
    try {
      const meta = metaByPath.get(path) || {};
      const mediaType = meta.media_type || (
        /\.(png|jpe?g|webp|gif)$/i.test(path) ? 'image'
        : /\.pdf$/i.test(path) ? 'document'
        : /\.(mp4|mov|webm|avi)$/i.test(path) ? 'video'
        : 'image'
      );
      const mime = meta.mime_type || (
        mediaType === 'image' ? 'image/jpeg'
        : mediaType === 'video' ? 'video/mp4'
        : 'application/pdf'
      );
      const filename = meta.original_filename || path.split('/').pop() || 'file';

      if (mediaType === 'video') {
        videoHints.push(`Video „${filename}" (${(meta.file_size_bytes || 0) / 1024 / 1024 | 0} MB) — Inhalt nicht maschinen-lesbar, bitte nutze die Brand-Voice-Stilkenntnisse für die Tonalität`);
        continue;
      }

      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from('visuals').download(path);
      if (dlErr || !blob) { skipped.push(filename + ' (Storage-Download)'); continue; }

      const buf = await blob.arrayBuffer();
      const size = buf.byteLength;
      if (mediaType === 'image' && size > MAX_IMAGE_BYTES) { skipped.push(filename + ' (Bild > 5 MB)'); continue; }
      if (mediaType === 'document' && size > MAX_PDF_BYTES) { skipped.push(filename + ' (PDF > 32 MB)'); continue; }

      // base64 (Deno Buffer-Trick)
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const base64 = btoa(binary);

      parts.push({ type: mediaType === 'document' ? 'document' : 'image', mime, base64, filename, size });
    } catch (e) {
      skipped.push(path.split('/').pop() + ' (' + (e as Error).message + ')');
    }
  }
  return { parts, videoHints, skipped };
}

// ─── LLM Call (Multi-Modal) ────────────────────────────────────────────────
async function callLLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  mediaParts: MediaPart[],
): Promise<string> {
  const provider = getProvider(model);

  if (provider === 'anthropic') {
    // Claude: content kann Array sein mit image/document/text blocks.
    // Docs: image base64 source + document base64 (claude-3-5-sonnet+).
    const contentBlocks: any[] = [];
    for (const m of mediaParts) {
      if (m.type === 'image') {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: m.mime, data: m.base64 },
        });
      } else if (m.type === 'document') {
        contentBlocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: m.base64 },
        });
      }
    }
    contentBlocks.push({ type: 'text', text: userPrompt });

    const body: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: contentBlocks.length > 1 ? contentBlocks : userPrompt }],
    };
    if (systemPrompt) body.system = systemPrompt;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        // PDF-Support für Claude-3.5+/4+
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Anthropic error ' + res.status);
    return d.content?.[0]?.text || '';
  }

  if (provider === 'openai') {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY nicht konfiguriert.');
    // OpenAI Vision (gpt-4o, gpt-4o-mini, gpt-5*): content als Array mit image_url-data-URLs.
    // PDFs werden NICHT direkt unterstützt → nur Bilder verarbeiten, PDFs als Hinweis im Text.
    const userContent: any[] = [];
    const pdfHints: string[] = [];
    for (const m of mediaParts) {
      if (m.type === 'image') {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${m.mime};base64,${m.base64}` },
        });
      } else if (m.type === 'document') {
        pdfHints.push(`(PDF „${m.filename}" wurde als Referenz hochgeladen, kann von diesem Modell aber nicht direkt gelesen werden.)`);
      }
    }
    const fullText = (pdfHints.length ? pdfHints.join(' ') + '\n\n' : '') + userPrompt;
    userContent.push({ type: 'text', text: fullText });

    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userContent.length > 1 ? userContent : fullText });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_API_KEY },
      body: JSON.stringify({ model, messages }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'OpenAI error ' + res.status);
    return d.choices?.[0]?.message?.content || '';
  }

  if (provider === 'google') {
    if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY nicht konfiguriert.');
    // Gemini: parts mit inlineData (mimeType + data). PDF via application/pdf direkt.
    const parts: any[] = [];
    for (const m of mediaParts) {
      parts.push({ inlineData: { mimeType: m.type === 'document' ? 'application/pdf' : m.mime, data: m.base64 } });
    }
    parts.push({ text: userPrompt });

    const contents: any[] = [];
    if (systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
      contents.push({ role: 'model', parts: [{ text: 'Verstanden.' }] });
    }
    contents.push({ role: 'user', parts });

    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + GOOGLE_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Google Gemini error ' + res.status);
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (provider === 'mistral') {
    if (!MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY nicht konfiguriert.');
    // Mistral: kein Multi-Modal (text-only). Medien werden im Prompt als Hinweis erwähnt.
    const mediaNote = mediaParts.length
      ? `(Hinweis: ${mediaParts.length} Referenz-${mediaParts.length === 1 ? 'medium wurde' : 'medien wurden'} hochgeladen (${mediaParts.map(m => m.type === 'image' ? 'Bild' : 'PDF').join(', ')}), aber dieses Modell kann sie nicht direkt verarbeiten.)\n\n`
      : '';
    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: mediaNote + userPrompt });
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MISTRAL_API_KEY },
      body: JSON.stringify({ model, messages }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Mistral error ' + res.status);
    return d.choices?.[0]?.message?.content || '';
  }

  throw new Error('Unbekannter Provider fuer Modell: ' + model);
}

function buildBrandVoicePrompt(bv: Record<string, unknown>): string {
  const parts = [
    bv.ai_summary as string || "",
    bv.personality ? "Persoenlichkeit: " + bv.personality : "",
    Array.isArray(bv.tone_attributes) && bv.tone_attributes.length
      ? "Ton: " + (bv.tone_attributes as string[]).join(", ") : "",
    bv.formality === "du" ? "Ansprache: Du-Form"
      : bv.formality === "sie" ? "Ansprache: Sie-Form" : "",
    bv.word_choice    ? "Wortwahl: "     + bv.word_choice    : "",
    bv.sentence_style ? "Satzstruktur: " + bv.sentence_style : "",
    bv.grammar_style  ? "Grammatik: "    + bv.grammar_style  : "",
    bv.dos  ? "Dos: "   + bv.dos  : "",
    bv.donts ? "Donts: " + bv.donts : "",
    bv.target_audience ? "Zielgruppe: " + bv.target_audience : "",
  ];
  return parts.filter(Boolean).join("\n");
}

// ─── Request Handler ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Nicht angemeldet" }, 401);

    const accessToken = authHeader.slice("Bearer ".length);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData?.user) return json({ error: "Nicht angemeldet" }, 401);
    const userId = authData.user.id;

    let teamId: string | null = null;
    try {
      const { data: pref } = await supabaseAdmin
        .from('user_preferences').select('active_team_id').eq('user_id', userId).maybeSingle();
      teamId = pref?.active_team_id ?? null;
    } catch (_) {}

    const body = await req.json();
    const { type, prompt, model: reqModel } = body;
    const referenceMediaPaths = (body.referenceMediaPaths as string[]) || [];

    let model = reqModel || 'claude-sonnet-4-6';
    if (!reqModel) {
      const { data: prof } = await supabaseAdmin.from('profiles').select('default_ai_model').eq('id', userId).single();
      if (prof?.default_ai_model) model = prof.default_ai_model;
    }

    const [bvResult, taResult] = await Promise.all([
      supabaseAdmin.from('brand_voices').select('*').eq('user_id', userId).eq('is_active', true).single(),
      supabaseAdmin.from('target_audiences').select('*').eq('user_id', userId).eq('is_active', true).single(),
    ]);
    const activeBV = bvResult?.data;
    const activeTA = taResult?.data;

    let systemPrompt = '';
    if (type !== 'brand_voice_summary' && type !== 'target_audience') {
      if (activeBV) systemPrompt += '## Aktive Brand Voice\n' + buildBrandVoicePrompt(activeBV) + '\n\n';
      if (activeTA?.ai_summary) systemPrompt += '## Aktive Zielgruppe\n' + activeTA.ai_summary + '\n\n';

      const brandVoiceId = (body.brand_voice_id as string) || null;
      if (userId && brandVoiceId) {
        try {
          const { data: prefs } = await supabaseAdmin
            .from('user_preferences').select('memory_enabled').eq('user_id', userId).maybeSingle();
          if (prefs?.memory_enabled === true) {
            const contentKind = (body.content_kind as string) || null;
            let sameKindExamples: any[] = [];
            if (contentKind) {
              const { data } = await supabaseAdmin
                .from('content_generations')
                .select('variants, picked_variant_index, kind, created_at')
                .eq('brand_voice_id', brandVoiceId).eq('kind', contentKind)
                .not('picked_variant_index', 'is', null)
                .order('created_at', { ascending: false }).limit(2);
              sameKindExamples = data || [];
            }
            let crossKindQ = supabaseAdmin
              .from('content_generations')
              .select('variants, picked_variant_index, kind, created_at')
              .eq('brand_voice_id', brandVoiceId)
              .not('picked_variant_index', 'is', null)
              .order('created_at', { ascending: false }).limit(8);
            if (contentKind) crossKindQ = crossKindQ.not('kind', 'eq', contentKind);
            const { data: crossData } = await crossKindQ;
            const crossKindExamples = (crossData || []).slice(0, 2);
            const allExamples = [...sameKindExamples, ...crossKindExamples];
            if (allExamples.length > 0) {
              systemPrompt += '## Beispiele aus deinen vorherigen Texten (Stil-Inspiration, NICHT 1:1 kopieren):\n';
              allExamples.forEach((g: any, i: number) => {
                const v = g.variants?.[g.picked_variant_index];
                const text = typeof v === 'string' ? v : (v?.text || '');
                if (text) {
                  const kindLabel = (g.kind === contentKind) ? g.kind + ' (gleicher Typ)' : g.kind + ' (anderer Typ — nur Stil/Tonalität übernehmen)';
                  systemPrompt += '### Beispiel ' + (i + 1) + ' [' + kindLabel + ']\n' + text.slice(0, 600) + '\n\n';
                }
              });
            }
          }
        } catch (e) { console.warn('[memory] few-shot lookup failed:', (e as Error).message); }
      }
    }

    // Multi-Modal: Referenz-Medien laden
    const { parts: mediaParts, videoHints, skipped } = await loadReferenceMedia(referenceMediaPaths);
    let effectivePrompt = prompt || '';
    if (videoHints.length) effectivePrompt += '\n\n' + videoHints.map(h => '(' + h + ')').join('\n');
    if (skipped.length)    console.warn('[generate] skipped media:', skipped.join(', '));

    const text = await callLLM(model, systemPrompt, effectivePrompt, mediaParts);

    return json({
      text, about: text, comment: text, summary: text,
      brandVoiceApplied: !!activeBV,
      brandVoiceName: activeBV?.name || null,
      senderContext: !!activeTA,
      modelUsed: model,
      provider: getProvider(model),
      mediaProcessed: mediaParts.length,
      videosSkipped: videoHints.length,
      mediaSkipped: skipped.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
