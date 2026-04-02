export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { lead } = req.body || {}
  const authHeader = req.headers.authorization

  const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkaGFqcWdmcnN1b2x1YWVzam4iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc0MjI5NDIxMywiZXhwIjoyMDU3ODcwMjEzfQ.kpMGPKMz8QdjFAmFklAa8RJqrRDVfq6LDpNxOEL5LPY'

  const name = ((lead?.first_name || '') + ' ' + (lead?.last_name || '')).trim() || lead?.name || 'Unbekannt'
  const context = [
    lead?.job_title || lead?.headline || '',
    lead?.company ? `Unternehmen: ${lead.company}` : '',
    lead?.li_connection_status === 'verbunden' ? 'LinkedIn: vernetzt' : '',
    lead?.connection_message ? `Vernetzungsnachricht: ${lead.connection_message}` : '',
    lead?.connection_note ? `Notiz: ${lead.connection_note}` : '',
    lead?.notes ? `Notizen: ${lead.notes}` : '',
    lead?.li_about_summary ? `LinkedIn About: ${lead.li_about_summary}` : '',
    lead?.li_message_summary ? `Nachrichtenverlauf: ${lead.li_message_summary}` : '',
    lead?.li_reply_behavior ? `Antwortverhalten: ${lead.li_reply_behavior}` : '',
  ].filter(Boolean).join('\n')

  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader || ('Bearer ' + SUPABASE_ANON),
        'apikey': SUPABASE_ANON,
      },
      body: JSON.stringify({
        type: 'crm_enrichment',
        prompt: `Analysiere diesen B2B-Lead und gib eine JSON-Antwort zurück.

Lead-Daten:
Name: ${name}
Position: ${lead?.job_title || lead?.headline || 'Unbekannt'}
${context}

Antworte NUR mit diesem JSON-Format (kein Markdown, keine Erklärungen):
{
  "ai_buying_intent": "hoch",
  "ai_need_detected": "Kurze Beschreibung max 100 Zeichen",
  "ai_pain_points": ["Pain Point 1", "Pain Point 2"],
  "ai_use_cases": ["Use Case 1", "Use Case 2"],
  "ai_budget_signal": null,
  "hs_score": 65
}

Mögliche Werte für ai_buying_intent: "hoch", "mittel", "niedrig"
Schätze den hs_score zwischen 0-100 basierend auf: Verbindungsstatus, Position, Unternehmen, Engagement.`
      })
    })

    if (!r.ok) {
      const errText = await r.text()
      // Fallback: rule-based enrichment if edge function unavailable
      const score = Math.min(100, Math.max(0,
        (lead?.icp_match || 0) * 0.6 +
        (lead?.li_connection_status === 'verbunden' ? 20 : 0) +
        (['SQL','MQL'].includes(lead?.status) ? 20 : ['MQN','LQL'].includes(lead?.status) ? 10 : 0)
      ))
      return res.json({
        ai_buying_intent: score >= 70 ? 'hoch' : score >= 40 ? 'mittel' : 'niedrig',
        ai_need_detected: `${lead?.job_title || lead?.headline || 'B2B Lead'} bei ${lead?.company || 'unbekanntem Unternehmen'}`,
        ai_pain_points: [],
        ai_use_cases: [],
        ai_budget_signal: null,
        hs_score: Math.round(score),
        fallback: true
      })
    }

    const data = await r.json()
    const text = (typeof data === 'string' ? data : null) ||
      data?.text || data?.message || data?.content ||
      (Array.isArray(data?.content) ? data.content[0]?.text : null) || '{}'

    const clean = text.replace(/```json|```/g, '').trim()
    let parsed = {}
    try { parsed = JSON.parse(clean) } catch { }

    return res.json({
      ai_buying_intent: parsed.ai_buying_intent || 'niedrig',
      ai_need_detected: parsed.ai_need_detected || null,
      ai_pain_points: parsed.ai_pain_points || [],
      ai_use_cases: parsed.ai_use_cases || [],
      ai_budget_signal: parsed.ai_budget_signal || null,
      hs_score: parsed.hs_score || null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
