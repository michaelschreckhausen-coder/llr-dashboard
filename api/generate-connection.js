export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { name, position, company } = req.body || {};
  const prompt = 'Schreibe eine kurze, persoenliche LinkedIn-Vernetzungsanfrage auf Deutsch fuer ' +
    (name || 'diese Person') +
    (position ? ' (' + position + ')' : '') +
    (company ? ' bei ' + company : '') +
    '. Maximal 300 Zeichen. Nur die Nachricht selbst, kein Kommentar.';
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 150, messages: [{ role: 'user', content: prompt }] })
  });
  const data = await r.json();
  const text = data?.content?.[0]?.text || '';
  return res.status(200).json({ text });
}
