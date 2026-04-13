import React, { useState } from 'react'

const P = 'var(--wl-primary, rgb(49,90,231))'

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })
  })
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

const SECTIONS = [
  { id: 'headline', label: 'Headline', icon: '✍️', desc: 'Dein erstes Aushängeschild — max. 220 Zeichen' },
  { id: 'about',    label: 'About / Über mich', icon: '📝', desc: 'Dein persönlicher Pitch — max. 2600 Zeichen' },
  { id: 'keywords', label: 'Keywords', icon: '🔑', desc: 'Wichtigste Begriffe für bessere Sichtbarkeit' },
  { id: 'cta',      label: 'Call-to-Action', icon: '📣', desc: 'Was sollen Besucher als nächstes tun?' },
]

export default function LinkedInProfiloptimierer() {
  const [form, setForm] = useState({
    name: '',
    role: '',
    target: '',
    problem: '',
    result: '',
    tone: 'professionell',
    current_headline: '',
    current_about: '',
  })
  const [activeSection, setActiveSection] = useState('headline')
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState({})
  const [copied, setCopied] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function generate(section) {
    if (!form.role || !form.target) return
    setLoading(l => ({ ...l, [section]: true }))

    const base = `Du bist ein LinkedIn-Experte. Erstelle optimierten Content für ${form.name || 'den User'}.\n\nPosition: ${form.role}\nZielgruppe: ${form.target}\nProblem das gelöst wird: ${form.problem || 'nicht angegeben'}\nErgebnisse/Erfolge: ${form.result || 'nicht angegeben'}\nTon: ${form.tone}`

    let prompt = ''
    if (section === 'headline') {
      prompt = `${base}\n${form.current_headline ? `Aktuelle Headline: "${form.current_headline}"\n` : ''}\nErstelle 3 verschiedene LinkedIn Headlines (max. 220 Zeichen je). Nummeriert. Jede in einer neuen Zeile. Keine Erklärungen davor/danach — nur die Headlines.`
    } else if (section === 'about') {
      prompt = `${base}\n\nErstelle einen überzeugenden LinkedIn "Über mich"-Text (ca. 1500-2000 Zeichen). Struktur:\n1. Hook (erste Zeile die neugierig macht)\n2. Problem das du löst\n3. Wie du es löst\n4. Ergebnisse/Social Proof\n5. Call-to-Action\n\nAuf Deutsch, Ton: ${form.tone}. Direkt den Text, keine Einleitung.`
    } else if (section === 'keywords') {
      prompt = `${base}\n\nErstelle eine Liste von 15-20 relevanten LinkedIn-Keywords für diese Person. Formatiert als kommagetrennte Liste. Nur die Keywords, keine Erklärungen.`
    } else if (section === 'cta') {
      prompt = `${base}\n\nErstelle 3 verschiedene Call-to-Action Texte für das Ende des LinkedIn-Profils (je 1-2 Sätze). Nummeriert. Direkt, klar, handlungsorientiert.`
    }

    try {
      const text = await callClaude(prompt)
      setResults(r => ({ ...r, [section]: text }))
    } catch (e) {
      setResults(r => ({ ...r, [section]: '⚠️ Fehler beim Generieren. Bitte versuche es erneut.' }))
    }
    setLoading(l => ({ ...l, [section]: false }))
  }

  function copy(text) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(null), 2000)
  }

  const inp = { padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }
  const ready = form.role && form.target

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'rgb(20,20,43)', margin: 0 }}>🚀 LinkedIn Profiloptimierer</h1>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>KI-gestützte Optimierung deines LinkedIn-Profils</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
        {/* Linke Spalte — Eingaben */}
        <div>
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E5E7EB', padding: '20px', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'rgb(20,20,43)', marginBottom: 14 }}>📋 Deine Angaben</div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Dein Name</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Michael Schreck" style={inp}/>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Deine Position / Rolle *</label>
              <input value={form.role} onChange={e => set('role', e.target.value)} placeholder="z.B. Sales Consultant, Founder, Coach" style={{ ...inp, borderColor: !form.role ? '#FECACA' : '#E2E8F0' }}/>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Deine Zielgruppe *</label>
              <input value={form.target} onChange={e => set('target', e.target.value)} placeholder="z.B. B2B Entscheider in DACH, Startups, KMUs" style={{ ...inp, borderColor: !form.target ? '#FECACA' : '#E2E8F0' }}/>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Welches Problem löst du?</label>
              <textarea value={form.problem} onChange={e => set('problem', e.target.value)} placeholder="z.B. Zu wenige qualifizierte Leads über LinkedIn" rows={2} style={{ ...inp, resize: 'vertical' }}/>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Ergebnisse / Erfolge</label>
              <textarea value={form.result} onChange={e => set('result', e.target.value)} placeholder="z.B. 3x mehr Meetings, 50+ Kunden, 20% höhere Abschlussrate" rows={2} style={{ ...inp, resize: 'vertical' }}/>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Ton</label>
              <select value={form.tone} onChange={e => set('tone', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                <option value="professionell">Professionell & seriös</option>
                <option value="persönlich">Persönlich & nahbar</option>
                <option value="direkt">Direkt & selbstbewusst</option>
                <option value="inspirierend">Inspirierend & motivierend</option>
              </select>
            </div>

            {!ready && (
              <div style={{ fontSize: 11, color: '#f59e0b', background: '#FFFBEB', padding: '8px 12px', borderRadius: 8, border: '1px solid #FDE68A' }}>
                ⚠️ Fülle Rolle und Zielgruppe aus um zu starten
              </div>
            )}
          </div>

          {/* Aktuelles Profil optional */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E5E7EB', padding: '20px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'rgb(20,20,43)', marginBottom: 4 }}>📄 Aktuelles Profil (optional)</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12 }}>Für noch bessere Optimierungen</div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Aktuelle Headline</label>
              <input value={form.current_headline} onChange={e => set('current_headline', e.target.value)} placeholder="Deine aktuelle Headline einfügen" style={inp}/>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>Aktuelle About-Sektion</label>
              <textarea value={form.current_about} onChange={e => set('current_about', e.target.value)} placeholder="Deinen aktuellen About-Text einfügen" rows={3} style={{ ...inp, resize: 'vertical' }}/>
            </div>
          </div>
        </div>

        {/* Rechte Spalte — Ergebnisse */}
        <div>
          {/* Section Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  borderColor: activeSection === s.id ? P : '#E2E8F0',
                  background: activeSection === s.id ? 'rgba(49,90,231,0.08)' : 'white',
                  color: activeSection === s.id ? P : '#64748B' }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          {SECTIONS.filter(s => s.id === activeSection).map(section => (
            <div key={section.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #E5E7EB', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'rgb(20,20,43)' }}>{section.icon} {section.label}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{section.desc}</div>
                </div>
                <button onClick={() => generate(section.id)} disabled={!ready || loading[section.id]}
                  style={{ padding: '9px 18px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed',
                    background: ready ? `linear-gradient(135deg,${P},#818CF8)` : '#E5E7EB',
                    color: ready ? 'white' : '#94A3B8',
                    boxShadow: ready ? '0 3px 10px rgba(49,90,231,0.28)' : 'none',
                    opacity: loading[section.id] ? 0.7 : 1 }}>
                  {loading[section.id] ? '⏳ Generiere…' : '✨ Mit KI generieren'}
                </button>
              </div>

              {results[section.id] ? (
                <div>
                  <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px', border: '1px solid #E5E7EB', marginTop: 14, minHeight: 120,
                    fontSize: 13, color: 'rgb(20,20,43)', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                    {results[section.id]}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => copy(results[section.id])}
                      style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: copied ? '#F0FDF4' : 'white',
                        color: copied ? '#16a34a' : '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {copied ? '✓ Kopiert!' : '📋 Kopieren'}
                    </button>
                    <button onClick={() => generate(section.id)}
                      style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      🔄 Neu generieren
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#CBD5E1' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>{section.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8' }}>
                    {ready ? `Klicke "Mit KI generieren" um deinen ${section.label} zu optimieren` : 'Fülle zuerst Rolle und Zielgruppe aus'}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Tipps */}
          <div style={{ background: 'linear-gradient(135deg,rgba(49,90,231,0.06),rgba(129,140,248,0.06))', borderRadius: 14, border: '1px solid rgba(49,90,231,0.12)', padding: '16px 18px', marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: P, marginBottom: 8 }}>💡 Profi-Tipps</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
              • <strong>Headline</strong>: Nutze Variante 1 für professionelle Netzwerke, Variante 2 für mehr Sichtbarkeit<br/>
              • <strong>Keywords</strong>: Integriere die Top-5 Keywords natürlich in Headline + About<br/>
              • <strong>About</strong>: Beginne mit einer Frage oder provokanten Aussage um Aufmerksamkeit zu erzeugen<br/>
              • <strong>CTA</strong>: Nur EIN klarer Call-to-Action am Ende des Profils
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
