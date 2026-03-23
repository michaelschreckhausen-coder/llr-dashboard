import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ── Icons ── */
const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
  </svg>
)
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)
const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
)
const LinkedInIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="4" fill="#0A66C2"/>
    <path d="M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 8.48H3V21h4V8.48ZM13.32 8.48H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91l.04-1.68Z" fill="white"/>
  </svg>
)
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
)

/* ── Char counter ring ── */
function CharRing({ count, max = 2600 }) {
  const pct = Math.min(count / max, 1)
  const r = 18, c = 2 * Math.PI * r
  const over = count > max
  const warn = count > max * 0.9
  const color = over ? '#EF4444' : warn ? '#F59E0B' : '#10B981'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#E2E8F0" strokeWidth="3"/>
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={c} strokeDashoffset={c - pct * c}
          strokeLinecap="round" transform="rotate(-90 22 22)"
          style={{ transition: 'stroke-dashoffset 0.3s, stroke 0.3s' }}/>
        <text x="22" y="26" textAnchor="middle" fontSize="9" fontWeight="700" fill={over ? '#EF4444' : '#64748B'}>
          {count > 999 ? (count/1000).toFixed(1)+'k' : count}
        </text>
      </svg>
      <div style={{ fontSize: 12, color: '#64748B' }}>
        <div style={{ fontWeight: 600, color: over ? '#EF4444' : '#0F172A' }}>{max - count < 0 ? Math.abs(max - count) + ' zu viel' : max - count + ' übrig'}</div>
        <div style={{ fontSize: 11 }}>Max. {max.toLocaleString()}</div>
      </div>
    </div>
  )
}

/* ── Tone chip ── */
function ToneChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
      border: 'none', background: active ? '#0A66C2' : '#F1F5F9',
      color: active ? '#fff' : '#475569', transition: 'all 0.15s',
    }}>
      {label}
    </button>
  )
}

const VARIANTS = [
  { id: 'professional', label: 'Professionell', desc: 'Klar, seriös, vertrauenswürdig' },
  { id: 'storytelling', label: 'Story-driven', desc: 'Persönlich, emotional, inspirierend' },
  { id: 'results',      label: 'Ergebnisorientiert', desc: 'Zahlen, Fakten, Erfolge' },
  { id: 'thought_leader', label: 'Thought Leader', desc: 'Vision, Meinung, Expertise' },
]

const LENGTHS = [
  { id: 'short',  label: 'Kurz',   desc: '~300 Zeichen' },
  { id: 'medium', label: 'Mittel', desc: '~900 Zeichen' },
  { id: 'long',   label: 'Lang',   desc: '~2000 Zeichen' },
]

const FOCUS_AREAS = [
  'Expertise & Skills', 'Karriereweg', 'Mehrwert für Kunden', 'Persönlichkeit',
  'Mission & Vision', 'Erfolge & Projekte', 'Netzwerk-Einladung', 'Aktuelles Angebot',
]

export default function LinkedInAbout({ session }) {
  /* ── Data ── */
  const [profile,      setProfile]      = useState(null)
  const [brandVoices,  setBrandVoices]  = useState([])
  const [activeBrand,  setActiveBrand]  = useState(null)
  const [loading,      setLoading]      = useState(true)

  /* ── Config ── */
  const [variant,      setVariant]      = useState('professional')
  const [length,       setLength]       = useState('medium')
  const [focusAreas,   setFocusAreas]   = useState(['Expertise & Skills', 'Mehrwert für Kunden'])
  const [extraInfo,    setExtraInfo]    = useState('')
  const [language,     setLanguage]     = useState('de')
  const [selectedBrand,setSelectedBrand]= useState('auto')

  /* ── Output ── */
  const [generating,   setGenerating]   = useState(false)
  const [result,       setResult]       = useState('')
  const [resultHistory,setResultHistory]= useState([])
  const [copied,       setCopied]       = useState(false)
  const [error,        setError]        = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    const { data: bv }   = await supabase.from('brand_voices').select('*').eq('user_id', session.user.id).order('updated_at', { ascending: false })
    setProfile(prof)
    setBrandVoices(bv || [])
    const active = (bv || []).find(v => v.is_active) || (bv || [])[0] || null
    setActiveBrand(active)
    setLoading(false)
  }

  function toggleFocus(area) {
    setFocusAreas(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    )
  }

  const brandForGen = selectedBrand === 'auto'
    ? activeBrand
    : brandVoices.find(b => b.id === selectedBrand) || null

  async function generate() {
    setGenerating(true)
    setError('')

    const lengthMap = { short: '250-350', medium: '800-1000', long: '1800-2100' }
    const chars = lengthMap[length]

    /* ── Build prompt ── */
    const lines = [
      'Schreibe den LinkedIn "Info"-Bereich (About-Sektion) für folgende Person.',
      '',
      '## PROFILDATEN',
      profile?.full_name  ? 'Name: '      + profile.full_name  : '',
      profile?.headline   ? 'Position: '  + profile.headline   : '',
      profile?.company    ? 'Unternehmen: '+ profile.company    : '',
      profile?.bio        ? 'Bisherige Bio:
' + profile.bio    : '',
      '',
      '## ANFORDERUNGEN',
      'Stil:       ' + VARIANTS.find(v => v.id === variant)?.label,
      'Länge:      ' + chars + ' Zeichen',
      'Sprache:    ' + (language === 'de' ? 'Deutsch' : 'Englisch'),
      'Fokus:      ' + focusAreas.join(', '),
      extraInfo   ? 'Zusatzinfos: ' + extraInfo : '',
      '',
    ]

    if (brandForGen) {
      lines.push('## BRAND VOICE')
      if (brandForGen.brand_name)       lines.push('Marke: '           + brandForGen.brand_name)
      if (brandForGen.personality)      lines.push('Persönlichkeit: '  + brandForGen.personality)
      if (brandForGen.tone_attributes?.length) lines.push('Ton: '      + brandForGen.tone_attributes.join(', '))
      if (brandForGen.formality === 'du')      lines.push('Ansprache: Du-Form im Text über sich selbst')
      if (brandForGen.dos)              lines.push('Dos: '             + brandForGen.dos)
      if (brandForGen.donts)            lines.push('Donts: '           + brandForGen.donts)
      if (brandForGen.word_choice)      lines.push('Wortwahl: '        + brandForGen.word_choice)
      if (brandForGen.sentence_style)   lines.push('Satzstil: '        + brandForGen.sentence_style)
      if (brandForGen.ai_summary)       lines.push('\nBrand Summary:\n' + brandForGen.ai_summary)
      lines.push('')
    }

    lines.push(
      '## AUSGABEFORMAT',
      '- Nur den fertigen About-Text, KEIN Kommentar, KEINE Überschrift',
      '- Keine Emojis am Anfang jeder Zeile (nur sparsam und passend)',
      '- Zeilenumbrüche für Lesbarkeit nutzen',
      '- Auf LinkedIn optimiert: erste 2 Zeilen müssen sofort fesseln',
      '- Am Ende optional: Kontaktaufforderung / CTA',
    )

    const prompt = lines.filter(Boolean).join('\n')

    try {
      const { data: { session: ss } } = await supabase.auth.getSession()
      const res = await fetch('https://jdhajqpgfrsuoluaesjn.supabase.co/functions/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ss.access_token },
        body: JSON.stringify({ type: 'linkedin_about', prompt }),
      })
      const data = await res.json()
      const text = data.comment || data.summary || data.text || ''
      if (text) {
        setResult(text)
        setResultHistory(prev => [{ text, variant, length, ts: new Date() }, ...prev.slice(0, 4)])
      } else {
        setError('Keine Antwort vom KI-Service erhalten.')
      }
    } catch (e) {
      setError('Fehler: ' + e.message)
    }
    setGenerating(false)
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* fallback */
      const ta = document.createElement('textarea')
      ta.value = result
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#94A3B8', gap: 10 }}>
      ⏳ Lade Profildaten…
    </div>
  )

  const charCount = result.length

  /* ── Layout: two-column on wide, single on narrow ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>

      {/* ── Page Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0A66C2, #1D4ED8)',
        borderRadius: 16, padding: '24px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 4px 20px rgba(10,102,194,0.25)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <LinkedInIcon size={22}/>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
              LinkedIn Info-Bereich schreiben
            </h1>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
            KI generiert deinen persönlichen About-Text basierend auf Profil & Brand Voice
          </div>
        </div>
        {/* Profile preview pill */}
        {profile?.full_name && (
          <div style={{
            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
            borderRadius: 12, padding: '10px 16px',
            border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{profile.full_name}</div>
            {profile.headline && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{profile.headline}</div>}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ════ LEFT: Configuration ════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Data sources ── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0A66C2" strokeWidth="2.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Datenquellen</span>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Profile status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 9, background: profile?.full_name ? '#F0FDF4' : '#FFF7ED', border: '1px solid ' + (profile?.full_name ? '#A7F3D0' : '#FDE68A') }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: profile?.full_name ? '#10B981' : '#F59E0B' }}/>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>Mein Profil</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      {profile?.full_name
                        ? (profile.headline || profile.company || 'Name hinterlegt')
                        : 'Profil unvollständig — bitte ergänzen'}
                    </div>
                  </div>
                </div>
                <a href="/profile" style={{ fontSize: 11, fontWeight: 700, color: '#0A66C2', textDecoration: 'none', background: '#EFF6FF', padding: '4px 10px', borderRadius: 999, border: '1px solid #BFDBFE' }}>
                  Bearbeiten
                </a>
              </div>

              {/* Brand Voice selector */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>
                  Brand Voice
                </label>
                {brandVoices.length === 0 ? (
                  <div style={{ padding: '10px 14px', borderRadius: 9, background: '#FFF7ED', border: '1px solid #FDE68A', fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Noch keine Brand Voice angelegt</span>
                    <a href="/brand-voice" style={{ fontSize: 11, fontWeight: 700, color: '#0A66C2', textDecoration: 'none' }}>Erstellen →</a>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Auto-select option */}
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                      border: '1.5px solid ' + (selectedBrand === 'auto' ? '#0A66C2' : '#E2E8F0'),
                      background: selectedBrand === 'auto' ? '#EFF6FF' : '#F8FAFC',
                    }}>
                      <input type="radio" name="brand" value="auto" checked={selectedBrand === 'auto'} onChange={() => setSelectedBrand('auto')} style={{ accentColor: '#0A66C2' }}/>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: selectedBrand === 'auto' ? '#0A66C2' : '#0F172A' }}>
                          Automatisch (aktive Brand Voice)
                        </div>
                        {activeBrand && (
                          <div style={{ fontSize: 11, color: '#64748B' }}>{activeBrand.name} · {activeBrand.tone_attributes?.slice(0,3).join(', ')}</div>
                        )}
                      </div>
                    </label>
                    {/* Individual brand voices */}
                    {brandVoices.map(bv => (
                      <label key={bv.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                        border: '1.5px solid ' + (selectedBrand === bv.id ? '#0A66C2' : '#E2E8F0'),
                        background: selectedBrand === bv.id ? '#EFF6FF' : '#F8FAFC',
                      }}>
                        <input type="radio" name="brand" value={bv.id} checked={selectedBrand === bv.id} onChange={() => setSelectedBrand(bv.id)} style={{ accentColor: '#0A66C2' }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: selectedBrand === bv.id ? '#0A66C2' : '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {bv.name}
                            {bv.is_active && <span style={{ fontSize: 9, background: '#DCFCE7', color: '#065F46', padding: '1px 6px', borderRadius: 999, border: '1px solid #A7F3D0' }}>Aktiv</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {bv.tone_attributes?.slice(0,4).join(' · ') || '–'}
                          </div>
                        </div>
                      </label>
                    ))}
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                      border: '1.5px solid ' + (selectedBrand === 'none' ? '#E2E8F0' : '#E2E8F0'),
                      background: selectedBrand === 'none' ? '#F8FAFC' : '#F8FAFC',
                    }}>
                      <input type="radio" name="brand" value="none" checked={selectedBrand === 'none'} onChange={() => setSelectedBrand('none')} style={{ accentColor: '#0A66C2' }}/>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Ohne Brand Voice (neutral)</div>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Style settings ── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0A66C2" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Stil & Format</span>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Variant */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Schreibstil</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  {VARIANTS.map(v => (
                    <button key={v.id} onClick={() => setVariant(v.id)} style={{
                      padding: '10px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                      border: '1.5px solid ' + (variant === v.id ? '#0A66C2' : '#E2E8F0'),
                      background: variant === v.id ? '#EFF6FF' : '#F8FAFC',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: variant === v.id ? '#0A66C2' : '#0F172A' }}>{v.label}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Length */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Länge</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                  {LENGTHS.map(l => (
                    <button key={l.id} onClick={() => setLength(l.id)} style={{
                      padding: '9px 8px', borderRadius: 9, cursor: 'pointer', textAlign: 'center',
                      border: '1.5px solid ' + (length === l.id ? '#0A66C2' : '#E2E8F0'),
                      background: length === l.id ? '#EFF6FF' : '#F8FAFC',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: length === l.id ? '#0A66C2' : '#0F172A' }}>{l.label}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{l.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Sprache</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  {[['de', '🇩🇪 Deutsch'], ['en', '🇬🇧 English']].map(([val, label]) => (
                    <button key={val} onClick={() => setLanguage(val)} style={{
                      padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                      border: '1.5px solid ' + (language === val ? '#0A66C2' : '#E2E8F0'),
                      background: language === val ? '#EFF6FF' : '#F8FAFC',
                      fontSize: 13, fontWeight: language === val ? 700 : 500,
                      color: language === val ? '#0A66C2' : '#475569', transition: 'all 0.15s',
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* ── Focus areas ── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0A66C2" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Schwerpunkte</span>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>({focusAreas.length} gewählt)</span>
            </div>
            <div style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {FOCUS_AREAS.map(area => (
                  <ToneChip key={area} label={area} active={focusAreas.includes(area)} onClick={() => toggleFocus(area)}/>
                ))}
              </div>
            </div>
          </div>

          {/* ── Extra info ── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0A66C2" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Zusätzliche Infos</span>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>optional</span>
            </div>
            <div style={{ padding: '14px 20px' }}>
              <textarea
                value={extraInfo}
                onChange={e => setExtraInfo(e.target.value)}
                rows={4}
                placeholder="Besondere Erfolge, aktuelle Projekte, spezifische Keywords die unbedingt vorkommen sollen, besondere Zielgruppe…"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 9, fontSize: 13, fontFamily: 'Inter,sans-serif', resize: 'vertical', outline: 'none', lineHeight: 1.6, transition: 'border 0.15s', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#0A66C2'}
                onBlur={e => e.target.style.borderColor = '#E2E8F0'}
              />
            </div>
          </div>

          {/* ── Generate button ── */}
          <button
            onClick={generate}
            disabled={generating || !profile?.full_name}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              padding: '14px 28px', borderRadius: 999, border: 'none',
              background: generating ? '#94A3B8' : 'linear-gradient(135deg, #0A66C2, #1D4ED8)',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: generating || !profile?.full_name ? 'not-allowed' : 'pointer',
              boxShadow: generating ? 'none' : '0 4px 16px rgba(10,102,194,0.35)',
              transition: 'all 0.2s', opacity: !profile?.full_name ? 0.6 : 1,
            }}
            onMouseOver={e => { if (!generating && profile?.full_name) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            {generating ? (
              <>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
                Generiere About-Text…
              </>
            ) : (
              <>
                <SparkleIcon/>
                {result ? 'Neu generieren' : 'LinkedIn Info generieren'}
              </>
            )}
          </button>

          {!profile?.full_name && (
            <div style={{ padding: '10px 14px', background: '#FFF7ED', border: '1px solid #FDE68A', borderRadius: 9, fontSize: 12, color: '#92400E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚠️ Bitte zuerst <a href="/profile" style={{ color: '#0A66C2', fontWeight: 700 }}>Profil vervollständigen</a>
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 9, fontSize: 12, color: '#991B1B', fontWeight: 600 }}>
              {error}
            </div>
          )}
        </div>

        {/* ════ RIGHT: Output ════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Result card ── */}
          <div style={{
            background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            minHeight: result ? 'auto' : 360,
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LinkedInIcon size={16}/>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>LinkedIn About-Text</span>
              </div>
              {result && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <CharRing count={charCount}/>
                  <button onClick={generate} disabled={generating}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'transparent', cursor: generating ? 'not-allowed' : 'pointer', color: '#64748B', fontSize: 12, fontWeight: 600, transition: 'all 0.15s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = '#0A66C2'; e.currentTarget.style.color = '#0A66C2'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B'; }}>
                    <RefreshIcon/> Neu
                  </button>
                  <button onClick={copyToClipboard}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, border: 'none', background: copied ? '#DCFCE7' : '#0A66C2', cursor: 'pointer', color: copied ? '#065F46' : '#fff', fontSize: 12, fontWeight: 700, transition: 'all 0.2s' }}>
                    {copied ? <><CheckIcon/> Kopiert!</> : <><CopyIcon/> Kopieren</>}
                  </button>
                </div>
              )}
            </div>

            {result ? (
              <div style={{ padding: '20px', flex: 1 }}>
                {/* LinkedIn preview frame */}
                <div style={{
                  background: '#F3F2EF', borderRadius: 10, padding: '16px',
                  border: '1px solid #E2E8F0', marginBottom: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#0A66C2,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                      {(profile?.full_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{profile?.full_name}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{profile?.headline || ''}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Info</div>
                  <div style={{ fontSize: 13, color: '#0F172A', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{result}</div>
                </div>

                {/* Editable textarea */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>
                    Bearbeiten & anpassen
                  </label>
                  <textarea
                    value={result}
                    onChange={e => setResult(e.target.value)}
                    rows={12}
                    style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #E2E8F0', borderRadius: 9, fontSize: 13, fontFamily: 'Inter,sans-serif', resize: 'vertical', outline: 'none', lineHeight: 1.7, transition: 'border 0.15s', boxSizing: 'border-box', color: '#0F172A' }}
                    onFocus={e => e.target.style.borderColor = '#0A66C2'}
                    onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                  />
                </div>

                {/* Copy CTA */}
                <button onClick={copyToClipboard}
                  style={{ width: '100%', marginTop: 12, padding: '12px', borderRadius: 999, border: 'none', background: copied ? '#DCFCE7' : 'linear-gradient(135deg,#0A66C2,#1D4ED8)', color: copied ? '#065F46' : '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s', boxShadow: copied ? 'none' : '0 2px 8px rgba(10,102,194,0.3)' }}>
                  {copied ? <><CheckIcon/> In die Zwischenablage kopiert!</> : <><CopyIcon/> Text kopieren & in LinkedIn einfügen</>}
                </button>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', color: '#94A3B8', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <LinkedInIcon size={28}/>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Noch kein Text generiert</div>
                <div style={{ fontSize: 13, maxWidth: 280, lineHeight: 1.6 }}>
                  Wähle deinen Stil links und klicke auf „LinkedIn Info generieren" um deinen persönlichen About-Text zu erstellen.
                </div>
              </div>
            )}
          </div>

          {/* ── History ── */}
          {resultHistory.length > 1 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F5F9', fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Letzte Versionen
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {resultHistory.slice(1).map((h, i) => (
                  <button key={i} onClick={() => setResult(h.text)} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderRadius: 8,
                    border: '1px solid #F1F5F9', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
                  }}
                    onMouseOver={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#F1F5F9'; }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#CBD5E1', marginTop: 5, flexShrink: 0 }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>
                        {VARIANTS.find(v => v.id === h.variant)?.label} · {LENGTHS.find(l => l.id === h.length)?.label} · {h.ts.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ fontSize: 12, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.text.substring(0, 80)}…
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Tips card ── */}
          <div style={{ background: 'linear-gradient(135deg, #F0F7FF, #EFF6FF)', borderRadius: 12, border: '1px solid #BFDBFE', padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Tipps für deinen LinkedIn Info-Bereich
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                'Die ersten 2 Zeilen entscheiden — LinkedIn zeigt nur einen Vorschau-Text',
                'Max. 2.600 Zeichen — nutze den Platz gezielt',
                'Ein konkreter CTA am Ende erhöht die Kontaktanfragen',
                'Keywords helfen bei der LinkedIn-Suche',
                'Persönlichkeit schlägt Floskeln — sei authentisch',
              ].map((tip, i) => (
                <li key={i} style={{ fontSize: 12, color: '#1E40AF', lineHeight: 1.5 }}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
