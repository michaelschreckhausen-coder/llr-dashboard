export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, position, company } = req.body || {};
  const authHeader = req.headers.authorization;

  // Rufe Supabase generate Edge Function auf - die hat den ANTHROPIC_API_KEY
  const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkaGFqcWdmcnN1b2x1YWVzam4iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc0MjI5NDIxMywiZXhwIjoyMDU3ODcwMjEzfQ.kpMGPKMz8QdjFAmFklAa8RJqrRDVfq6LDpNxOEL5LPY';

  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader || ('Bearer ' + SUPABASE_ANON),
        'apikey': SUPABASE_ANON,
      },
      body: JSON.stringify({
        type: 'connection_request',
        name: name || 'diese Person',
        position: position || '',
        company: company || '',
      })
    });

    const data = await r.json();

    // 'generate' gibt {about, plan, tokensUsed} zurueck
    // Nehme den ersten Absatz des 'about'-Textes als Vernetzungsnachricht
    let text = data?.about || data?.text || data?.message || '';
    if (text) {
      // Kuerze auf ersten Absatz, max 300 Zeichen
      text = text.split('\n\n')[0].replace(/^#+\s*[^\n]+\n+/, '').trim();
      if (text.length > 300) text = text.substring(0, 297) + '...';
    }

    return res.status(200).json({ text: text || 'Bitte Nachricht manuell eingeben.' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
