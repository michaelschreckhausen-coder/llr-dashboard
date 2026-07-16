// Zentrale Modell-Auflösung + provider-übergreifender Text-Dispatch.
// ⚠️ ISO 27001 / Datenresidenz: JEDE Funktion nutzt das vom Nutzer GEWÄHLTE Modell
// (profiles.default_ai_model) — NIE ein hardcodiertes. resolveModel liefert das Modell
// des handelnden Users (oder eines übergebenen Owner-Users als Fallback für Batch-Jobs).

export function getProvider(model: string): 'anthropic' | 'openai' | 'google' | 'mistral' {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('mistral') || model.startsWith('open-mixtral') || model.startsWith('codestral')) return 'mistral';
  return 'anthropic';
}

const FALLBACK_MODEL = 'claude-sonnet-4-6';

// Löst das gewählte Modell auf: erster userId mit gesetztem default_ai_model gewinnt
// (Reihenfolge = Priorität: handelnder User, dann Account-Owner). Nur wenn KEINER ein
// Modell gesetzt hat, greift der Fallback.
export async function resolveModel(admin: any, userIds: (string | null | undefined)[], fallback = FALLBACK_MODEL): Promise<string> {
  for (const uid of userIds) {
    if (!uid) continue;
    try {
      const { data } = await admin.from('profiles').select('default_ai_model').eq('id', uid).maybeSingle();
      if (data?.default_ai_model) return data.default_ai_model as string;
    } catch (_e) { /* ignore, nächster */ }
  }
  return fallback;
}

type CallOpts = { model: string; system: string; user: string; maxTokens?: number; jsonMode?: boolean };

export async function callText(opts: CallOpts): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const { model, system, user } = opts;
  const maxTokens = opts.maxTokens ?? 2048;
  const jsonMode = !!opts.jsonMode;
  const provider = getProvider(model);
  const K = {
    anthropic: Deno.env.get('ANTHROPIC_API_KEY') || '',
    openai: Deno.env.get('OPENAI_API_KEY') || '',
    google: Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GEMINI_API_KEY') || '',
    mistral: Deno.env.get('MISTRAL_API_KEY') || '',
  };
  if (provider === 'anthropic') {
    if (!K.anthropic) throw new Error('ANTHROPIC_API_KEY fehlt');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': K.anthropic, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error?.message || 'Anthropic ' + res.status);
    return { text: d?.content?.[0]?.text || '', inputTokens: d?.usage?.input_tokens || 0, outputTokens: d?.usage?.output_tokens || 0 };
  }
  if (provider === 'openai') {
    if (!K.openai) throw new Error('OPENAI_API_KEY fehlt');
    const body: any = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (jsonMode) body.response_format = { type: 'json_object' };
    if (/^(gpt-5|o[0-9])/.test(model)) body.max_completion_tokens = maxTokens; else body.max_tokens = maxTokens;
    const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + K.openai }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error?.message || 'OpenAI ' + res.status);
    return { text: d?.choices?.[0]?.message?.content || '', inputTokens: d?.usage?.prompt_tokens || 0, outputTokens: d?.usage?.completion_tokens || 0 };
  }
  if (provider === 'google') {
    if (!K.google) throw new Error('GOOGLE_API_KEY fehlt');
    const gc: any = { maxOutputTokens: maxTokens };
    if (jsonMode) gc.responseMimeType = 'application/json';
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + K.google, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: system }] }, { role: 'model', parts: [{ text: 'Verstanden.' }] }, { role: 'user', parts: [{ text: user }] }], generationConfig: gc }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error?.message || 'Google ' + res.status);
    return { text: d?.candidates?.[0]?.content?.parts?.[0]?.text || '', inputTokens: d?.usageMetadata?.promptTokenCount || 0, outputTokens: d?.usageMetadata?.candidatesTokenCount || 0 };
  }
  if (provider === 'mistral') {
    if (!K.mistral) throw new Error('MISTRAL_API_KEY fehlt');
    const body: any = { model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (jsonMode) body.response_format = { type: 'json_object' };
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + K.mistral }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error?.message || 'Mistral ' + res.status);
    return { text: d?.choices?.[0]?.message?.content || '', inputTokens: d?.usage?.prompt_tokens || 0, outputTokens: d?.usage?.completion_tokens || 0 };
  }
  throw new Error('Unbekannter Provider für Modell: ' + model);
}
