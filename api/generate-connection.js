export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Versuche alle moeglichen Key-Namen
  const key = process.env.ANTHROPIC_API_KEY
    || process.env.VITE_ANTHROPIC_KEY
    || process.env.ANTHROPIC_KEY
    || process.env.CLAUDE_API_KEY;

  if (!key) {
    // Debug: zeige welche env vars verfuegbar sind (ohne Werte)
    const envKeys = Object.keys(process.env).filter(k =>
      k.includes('ANTHROP') || k.includes('CLAUDE') || k.includes('API')
    );
    return res.status(500).json({ error: 'No API key found', availableKeys: envKeys });
  }

  const { name, position, company } = req.body || {};
  const prompt = 'Schreibe eine kurze persoenliche LinkedIn-Vernetzungsanfrage auf Deutsch fuer ' +
    (name || 'diese Person') +
    (position ? ' (' + position + ')' : '') +
    (company ? ' bei ' + company : '') +
    '. Maximal 300 Zeichen. Nur die Nachricht.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await r.json();
    const text = data?.content?.[0]?.text || '';
    return res.status(200).json({ text });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
