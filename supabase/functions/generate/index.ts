// Supabase Edge Function: generate (Multi-Provider + Multi-Modal)
//
// Routet auf Anthropic / OpenAI / Google / Mistral je nach model-Prefix.
// Few-Shot-Injection aus content_generations (nur wenn user_preferences.memory_enabled=true).
// Multi-Modal: referenceMediaPaths aus body werden aus Storage geladen und als
// content blocks an den Provider übergeben (Bilder + PDFs; Videos nur Text-Hinweis).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.214.0/encoding/base64.ts";
import { getCallerContext, checkCredits, recordUsage, estimateCredits } from "../_shared/credits.ts";
import { buildBrandPrompt, buildBrandCorpus, HUMAN_STYLE_GUIDE, stripEmDashes } from "../_shared/brandPrompt.ts";

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
  if (model.startsWith('mistral') || model.startsWith('magistral') || model.startsWith('open-mixtral') || model.startsWith('codestral')) return 'mistral';
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
      const ext = (path.split('.').pop() || '').toLowerCase();
      const mediaType = meta.media_type || (
        /\.(png|jpe?g|webp|gif|svg)$/i.test(path) ? 'image'
        : /\.pdf$/i.test(path) ? 'document'
        : /\.(mp4|mov|webm|avi)$/i.test(path) ? 'video'
        : 'image'
      );
      // MIME-Type ableiten: erst meta, sonst aus Datei-Endung (Anthropic prüft
      // echten MIME vs deklarierten — falsche Angabe -> 400)
      const extMimeMap: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
        mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/x-msvideo',
        pdf: 'application/pdf',
      };
      const mime = meta.mime_type
        || extMimeMap[ext]
        || (mediaType === 'image' ? 'image/jpeg'
            : mediaType === 'video' ? 'video/mp4'
            : 'application/pdf');
      const filename = meta.original_filename || path.split('/').pop() || 'file';

      if (mediaType === 'video') {
        videoHints.push(`Video „${filename}" (${(meta.file_size_bytes || 0) / 1024 / 1024 | 0} MB) — Inhalt nicht maschinen-lesbar, bitte nutze die Brand-Voice-Stilkenntnisse für die Tonalität`);
        continue;
      }

      const dlStart = Date.now();
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from('visuals').download(path);
      if (dlErr || !blob) { skipped.push(filename + ' (Storage-Download)'); continue; }

      const buf = await blob.arrayBuffer();
      const size = buf.byteLength;
      console.log(`[generate] downloaded ${filename} ${(size/1024/1024).toFixed(1)}MB in ${Date.now()-dlStart}ms`);
      if (mediaType === 'image' && size > MAX_IMAGE_BYTES) { skipped.push(filename + ' (Bild > 5 MB)'); continue; }
      if (mediaType === 'document' && size > MAX_PDF_BYTES) { skipped.push(filename + ' (PDF > 32 MB)'); continue; }

      const bytes = new Uint8Array(buf);
      // Magic-Bytes-Check: bestätigt den tatsächlichen Datei-Typ.
      // Anthropic vergleicht deklarierten MIME mit echtem Inhalt → falsche Angabe → 400.
      let detectedMime = mime;
      if (mediaType === 'image') {
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) detectedMime = 'image/png';
        else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) detectedMime = 'image/jpeg';
        else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
              && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) detectedMime = 'image/webp';
        else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) detectedMime = 'image/gif';
      } else if (mediaType === 'document') {
        if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) detectedMime = 'application/pdf';
      }
      if (detectedMime !== mime) {
        console.log(`[generate] mime-correction ${filename}: declared=${mime} -> actual=${detectedMime}`);
      }

      // Effizientes base64-Encoding via Deno std (typed-array optimiert)
      const encStart = Date.now();
      const base64 = encodeBase64(bytes);
      console.log(`[generate] base64 ${filename} in ${Date.now()-encStart}ms`);

      parts.push({ type: mediaType === 'document' ? 'document' : 'image', mime: detectedMime, base64, filename, size });
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

    // anthropic-beta-Header nur wenn wir PDFs schicken (sonst kann Claude
    // den Header als unerwartet ablehnen je nach Modell-Generation)
    const hasPdfs = mediaParts.some(m => m.type === 'document');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    };
    if (hasPdfs) headers['anthropic-beta'] = 'pdfs-2024-09-25';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const responseText = await res.text();
    let d: any;
    try { d = JSON.parse(responseText); } catch { d = { error: { message: responseText.slice(0, 500) } }; }
    if (!res.ok) {
      const msg = d.error?.message || ('Anthropic HTTP ' + res.status + ': ' + responseText.slice(0, 300));
      throw new Error(msg);
    }
    return d.content?.[0]?.text || '';
  }

  if (provider === 'openai') {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY nicht konfiguriert.');
    // OpenAI Vision + Document (seit Feb 2025): content als Array mit image_url
    // bzw. file-blocks (file_data als data-URL). Funktioniert mit gpt-4o, gpt-4o-mini,
    // gpt-5* und neueren. Ältere Modelle ignorieren PDF-Blocks bzw. erroren.
    const userContent: any[] = [];
    for (const m of mediaParts) {
      if (m.type === 'image') {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${m.mime};base64,${m.base64}` },
        });
      } else if (m.type === 'document') {
        userContent.push({
          type: 'file',
          file: {
            filename: m.filename,
            file_data: `data:application/pdf;base64,${m.base64}`,
          },
        });
      }
    }
    userContent.push({ type: 'text', text: userPrompt });

    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userContent.length > 1 ? userContent : userPrompt });

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

// ─── Request Handler ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // Auth + account/team-Resolution via credits-Helper
    const ctx = await getCallerContext(req, supabaseAdmin);
    if (!ctx) return json({ error: "Nicht angemeldet" }, 401);
    const userId = ctx.user_id;
    const teamId = ctx.team_id;

    const body = await req.json();
    const { type, prompt, model: reqModel } = body;
    const referenceMediaPaths = (body.referenceMediaPaths as string[]) || [];

    let model = reqModel || 'claude-sonnet-4-6';
    if (!reqModel) {
      const { data: prof } = await supabaseAdmin.from('profiles').select('default_ai_model').eq('id', userId).single();
      if (prof?.default_ai_model) model = prof.default_ai_model;
    }

    // Brand wird über die globale Topbar-Auswahl bestimmt (body.brand_voice_id),
    // Fallback: user_preferences.active_brand_voice_id. Kein is_active-Flag mehr.
    let activeBV: any = null;
    const reqBvId = (body.brand_voice_id as string) || null;
    if (reqBvId) {
      activeBV = (await supabaseAdmin.from('brand_voices').select('*').eq('id', reqBvId).maybeSingle()).data;
    }
    if (!activeBV) {
      const { data: prefs } = await supabaseAdmin.from('user_preferences').select('active_brand_voice_id').eq('user_id', userId).maybeSingle();
      if (prefs?.active_brand_voice_id) {
        activeBV = (await supabaseAdmin.from('brand_voices').select('*').eq('id', prefs.active_brand_voice_id).maybeSingle()).data;
      }
    }
    // Zielgruppe & Wissen werden NICHT automatisch injiziert — nur über explizite
    // Dropdown-Auswahl der jeweiligen UI (als Teil von body.prompt bzw. in text-werkstatt-chat).

    let systemPrompt = '';
    if (type !== 'brand_voice_summary' && type !== 'target_audience') {
      systemPrompt += HUMAN_STYLE_GUIDE + '\n\n';
      if (activeBV) systemPrompt += buildBrandPrompt(activeBV) + '\n\n';

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
            const corpus = await buildBrandCorpus(supabaseAdmin, brandVoiceId);
            if (corpus) systemPrompt += '\n\n' + corpus + '\n\n';
          }
        } catch (e) { console.warn('[memory] few-shot lookup failed:', (e as Error).message); }
      }
    }

    // Multi-Modal: Referenz-Medien laden
    const reqStart = Date.now();
    console.log(`[generate] start model=${model} provider=${getProvider(model)} mediaPaths=${referenceMediaPaths.length}`);
    const { parts: mediaParts, videoHints, skipped } = await loadReferenceMedia(referenceMediaPaths);
    console.log(`[generate] media loaded: ${mediaParts.length} parts, ${videoHints.length} video hints, ${skipped.length} skipped, total=${Date.now()-reqStart}ms`);
    let effectivePrompt = prompt || '';
    if (videoHints.length) effectivePrompt += '\n\n' + videoHints.map(h => '(' + h + ')').join('\n');
    if (skipped.length)    console.warn('[generate] skipped media:', skipped.join(', '));

    // Pre-Call Credits-Gate
    const provider = getProvider(model);
    const estimated = await estimateCredits(provider, model, 'text_generate', {
      input_chars: systemPrompt.length + effectivePrompt.length,
      max_output_tokens: 4096,
    }, supabaseAdmin);
    const check = await checkCredits(ctx.account_id, estimated, supabaseAdmin);
    if (!check.allowed) {
      const userMsg = check.reason === 'monthly_budget_exceeded'
        ? 'Monatliches Credit-Budget aufgebraucht. Bitte Top-Up kaufen oder Plan upgraden.'
        : check.reason === 'daily_cap_exceeded'
        ? 'Tägliches Limit erreicht (25% des Monats-Budgets). Bitte später erneut versuchen.'
        : check.reason === 'no_account'
        ? 'Kein aktiver Account/Plan zugeordnet.'
        : 'Credit-Check fehlgeschlagen.';
      return json({
        error: userMsg,
        code: 'credits_exhausted',
        reason: check.reason,
        remaining: check.remaining,
        estimated,
        daily_remaining: check.daily_remaining,
        daily_cap: check.daily_cap,
      }, 402);
    }

    const llmStart = Date.now();
    let text = '';
    try {
      text = await callLLM(model, systemPrompt, effectivePrompt, mediaParts);
      if (type !== 'brand_voice_summary' && type !== 'target_audience') text = stripEmDashes(text);
      console.log(`[generate] LLM done in ${Date.now()-llmStart}ms, text-len=${text.length}`);
    } catch (llmErr) {
      const errMsg = llmErr instanceof Error ? llmErr.message : String(llmErr);
      console.error(`[generate] LLM error after ${Date.now()-llmStart}ms, model=${model}, mediaParts=${mediaParts.length}: ${errMsg}`);
      // Defensive: record error-status für Audit (kein Credits-Abzug)
      await recordUsage(ctx, {
        edge_function: 'generate',
        operation: 'text_generate',
        provider, model,
        status: 'error',
        extra_metadata: { error: errMsg.slice(0, 200) },
      }, supabaseAdmin).catch(() => null);
      throw llmErr;
    }

    // Post-Call: record_usage (Token-Counts approximiert via chars/4 Heuristik —
    // Provider liefern exakte usage-stats, aber die zu extrahieren wäre Provider-
    // spezifischer Refactor in callLLM. Phase 1 pragmatic.)
    const input_tokens = Math.ceil((systemPrompt.length + effectivePrompt.length) / 4);
    const output_tokens = Math.ceil(text.length / 4);
    await recordUsage(ctx, {
      edge_function: 'generate',
      operation: 'text_generate',
      provider, model,
      input_tokens, output_tokens,
      status: 'success',
      extra_metadata: { media_parts: mediaParts.length, video_hints: videoHints.length },
    }, supabaseAdmin).catch(() => null);

    return json({
      text, about: text, comment: text, summary: text,
      brandVoiceApplied: !!activeBV,
      brandVoiceName: activeBV?.name || null,
      senderContext: false,
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
