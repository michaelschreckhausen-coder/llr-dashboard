import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const VARIANTS = [
  { id: 'professional',  label: 'Professionell',      desc: 'Klar, serioes, vertrauenswuerdig' },
  { id: 'storytelling',  label: 'Story-driven',        desc: 'Persoenlich, emotional, inspirierend' },
  { id: 'results',       label: 'Ergebnisorientiert',  desc: 'Zahlen, Fakten, Erfolge' },
  { id: 'thought_leader',label: 'Thought Leader',      desc: 'Vision, Meinung, Expertise' },
]

const LENGTHS = [
  { id: 'short',  label: 'Kurz',   desc: '~300 Zeichen' },
  { id: 'medium', label: 'Mittel', desc: '~900 Zeichen' },
  { id: 'long',   label: 'Lang',   desc: '~2000 Zeichen' },
]

const FOCUS_AREAS = [
  'Expertise & Skills', 'Karriereweg', 'Mehrwert fuer Kunden', 'Persoenlichkeit',
  'Mission & Vision', 'Erfolge & Projekte', 'Netzwerk-Einladung', 'Aktuelles Angebot',
]

function SectionCard({ title, children }) {
  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', overflow:'hidden', boxShadow:'0 1px 3px rgba(15,23,42,0.06)', marginBottom:14 }}>
      <div style={{ padding:'13px 18px', borderBottom:'1px solid #F1F5F9' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>{title}</span>
      </div>
      <div style={{ padding:'16px 18px' }}>
        {children}
      </div>
    </div>
  )
}

function Label({ children }) {
  return <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:7 }}>{children}</div>
}

export default function LinkedInAbout({ session }) {
  const [profile,       setProfile]       = useState(null)
  const [brandVoices,   setBrandVoices]   = useState([])
  const [activeBrand,   setActiveBrand]   = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [variant,       setVariant]       = useState('professional')
  const [length,        setLength]        = useState('medium')
  const [focusAreas,    setFocusAreas]    = useState(['Expertise & Skills', 'Mehrwert fuer Kunden'])
  const [extraInfo,     setExtraInfo]     = useState('')
  const [language,      setLanguage]      = useState('de')
  const [selectedBrand, setSelectedBrand] = useState('auto')
  const [generating,    setGenerating]    = useState(false)
  const [result,        setResult]        = useState('')
  const [history,       setHistory]       = useState([])
  const [copied,        setCopied]        = useState(false)
  const [error,         setError]         = useState('')

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
    setFocusAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])
  }

  const brandForGen = selectedBrand === 'auto'
    ? activeBrand
    : selectedBrand === 'none' ? null
    : brandVoices.find(b => b.id === selectedBrand) || null

  async function generate() {
    setGenerating(true)
    setError('')
    const lengthMap = { short: '250-350', medium: '800-1000', long: '1800-2100' }

    const parts = [
      'Schreibe den LinkedIn Info-Bereich (About-Sektion) fuer folgende Person.',
      '',
      '## PROFILDATEN',
      profile?.full_name  ? 'Name: ' + profile.full_name : '',
      profile?.headline   ? 'Position: ' + profile.headline : '',
      profile?.company    ? 'Unternehmen: ' + profile.company : '',
      profile?.bio        ? 'Bisherige Bio: ' + profile.bio : '',
      '',
      '## ANFORDERUNGEN',
      'Stil: ' + (VARIANTS.find(v => v.id === variant)?.label || variant),
      'Laenge: ' + lengthMap[length] + ' Zeichen',
      'Sprache: ' + (language === 'de' ? 'Deutsch' : 'Englisch'),
      'Fokus: ' + focusAreas.join(', '),
      extraInfo ? 'Zusatzinfos: ' + extraInfo : '',
    ]

    if (brandForGen) {
      parts.push('', '## BRAND VOICE')
      if (brandForGen.brand_name)              parts.push('Marke: '           + brandForGen.brand_name)
      if (brandForGen.personality)             parts.push('Persoenlichkeit: ' + brandForGen.personality)
      if (brandForGen.tone_attributes?.length) parts.push('Ton: '             + brandForGen.tone_attributes.join(', '))
      if (brandForGen.formality === 'du')      parts.push('Ansprache: Du-Form')
      if (brandForGen.dos)                     parts.push('Dos: '             + brandForGen.dos)
      if (brandForGen.donts)                   parts.push('Donts: '           + brandForGen.donts)
      if (brandForGen.ai_summary)              parts.push('Brand Summary: '   + brandForGen.ai_summary)
    }

    parts.push(
      '', '## FORMAT',
      '- Nur den fertigen Text, ohne Ueberschrift oder Kommentar',
      '- Erste 2 Zeilen muessen sofort fesseln',
      '- Zeilenumbrueche fuer Lesbarkeit',
      '- Optional am Ende: Kontaktaufforderung'
    )

    const prompt = parts.filter(Boolean).join('
')

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
        setHistory(prev => [{ text, variant, length, ts: new Date() }, ...prev.slice(0, 3)])
      } else {
        setError('Keine Antwort vom KI-Service erhalten.')
      }
    } catch (e) {
      setError('Fehler: ' + e.message)
    }
    setGenerating(false)
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(result)
    } catch (e) {
      const ta = document.createElement('textarea')
      ta.value = result
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const charCount = result.length
  const charMax   = 2600
  const charOver  = charCount > charMax
  const charWarn  = charCount > charMax * 0.9

  const optBtn = (active, onClick, main, sub) => (
    <button onClick={onClick} style={{
      padding: '9px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', width: '100%',
      border: '1.5px solid ' + (active ? '#0A66C2' : '#E2E8F0'),
      background: active ? '#EFF6FF' : '#F8FAFC', transition: 'all 0.15s', display: 'block',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: active ? '#0A66C2' : '#0F172A' }}>{main}</div>
      {sub && <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
    </button>
  )

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'#94A3B8', fontSize:14, gap:10 }}>
      Lade Profildaten...
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, maxWidth:1100 }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0A66C2, #1D4ED8)', borderRadius:16,
        padding: '22px 28px', display:'flex', alignItems:'center', justifyContent:'space-between',
        boxShadow: '0 4px 20px rgba(10,102,194,0.25)',
      }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:'-0.02em', marginBottom:4 }}>
            LinkedIn Info-Bereich schreiben
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)' }}>
            KI generiert deinen About-Text basierend auf Profil und Brand Voice
          </div>
        </div>
        {profile?.full_name && (
          <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'10px 16px', border:'1px solid rgba(255,255,255,0.2)', flexShrink:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{profile.full_name}</div>
            {profile.headline && <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginTop:2 }}>{profile.headline}</div>}
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

        {/* LEFT: Config */}
        <div>

          {/* Profile status */}
          <SectionCard title="Datenquellen">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 12px', borderRadius:9, background: profile?.full_name ? '#F0FDF4' : '#FFF7ED', border:'1px solid ' + (profile?.full_name ? '#A7F3D0' : '#FDE68A'), marginBottom:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: profile?.full_name ? '#10B981' : '#F59E0B' }}/>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0F172A' }}>Mein Profil</div>
                  <div style={{ fontSize:11, color:'#64748B' }}>{profile?.full_name ? (profile.headline || profile.company || 'Profil hinterlegt') : 'Profil unvollstaendig'}</div>
                </div>
              </div>
              <a href="/profile" style={{ fontSize:11, fontWeight:700, color:'#0A66C2', textDecoration:'none', background:'#EFF6FF', padding:'3px 10px', borderRadius:999, border:'1px solid #BFDBFE' }}>Bearbeiten</a>
            </div>

            <Label>Brand Voice</Label>
            {brandVoices.length === 0 ? (
              <div style={{ padding:'9px 12px', borderRadius:9, background:'#FFF7ED', border:'1px solid #FDE68A', fontSize:12, color:'#92400E', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Noch keine Brand Voice</span>
                <a href="/brand-voice" style={{ fontSize:11, fontWeight:700, color:'#0A66C2', textDecoration:'none' }}>Erstellen</a>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 11px', borderRadius:9, cursor:'pointer', border:'1.5px solid ' + (selectedBrand==='auto'?'#0A66C2':'#E2E8F0'), background:selectedBrand==='auto'?'#EFF6FF':'#F8FAFC' }}>
                  <input type="radio" name="brand" value="auto" checked={selectedBrand==='auto'} onChange={()=>setSelectedBrand('auto')} style={{ accentColor:'#0A66C2' }}/>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:selectedBrand==='auto'?'#0A66C2':'#0F172A' }}>Automatisch (aktive Voice)</div>
                    {activeBrand && <div style={{ fontSize:11, color:'#64748B' }}>{activeBrand.name}</div>}
                  </div>
                </label>
                {brandVoices.map(bv => (
                  <label key={bv.id} style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 11px', borderRadius:9, cursor:'pointer', border:'1.5px solid ' + (selectedBrand===bv.id?'#0A66C2':'#E2E8F0'), background:selectedBrand===bv.id?'#EFF6FF':'#F8FAFC' }}>
                    <input type="radio" name="brand" value={bv.id} checked={selectedBrand===bv.id} onChange={()=>setSelectedBrand(bv.id)} style={{ accentColor:'#0A66C2' }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:selectedBrand===bv.id?'#0A66C2':'#0F172A', display:'flex', alignItems:'center', gap:5 }}>
                        {bv.name}
                        {bv.is_active && <span style={{ fontSize:9, background:'#DCFCE7', color:'#065F46', padding:'1px 6px', borderRadius:999 }}>Aktiv</span>}
                      </div>
                      <div style={{ fontSize:11, color:'#94A3B8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(bv.tone_attributes||[]).slice(0,3).join(' · ')}</div>
                    </div>
                  </label>
                ))}
                <label style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 11px', borderRadius:9, cursor:'pointer', border:'1.5px solid ' + (selectedBrand==='none'?'#0A66C2':'#E2E8F0'), background:selectedBrand==='none'?'#EFF6FF':'#F8FAFC' }}>
                  <input type="radio" name="brand" value="none" checked={selectedBrand==='none'} onChange={()=>setSelectedBrand('none')} style={{ accentColor:'#0A66C2' }}/>
                  <div style={{ fontSize:12, fontWeight:600, color:'#64748B' }}>Ohne Brand Voice</div>
                </label>
              </div>
            )}
          </SectionCard>

          {/* Style */}
          <SectionCard title="Stil und Format">
            <Label>Schreibstil</Label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:14 }}>
              {VARIANTS.map(v => optBtn(variant===v.id, ()=>setVariant(v.id), v.label, v.desc))}
            </div>

            <Label>Laenge</Label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7, marginBottom:14 }}>
              {LENGTHS.map(l => optBtn(length===l.id, ()=>setLength(l.id), l.label, l.desc))}
            </div>

            <Label>Sprache</Label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
              {optBtn(language==='de', ()=>setLanguage('de'), 'Deutsch', '')}
              {optBtn(language==='en', ()=>setLanguage('en'), 'English', '')}
            </div>
          </SectionCard>

          {/* Focus */}
          <SectionCard title={'Schwerpunkte (' + focusAreas.length + ' gewaehlt)'}>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {FOCUS_AREAS.map(area => (
                <button key={area} onClick={() => toggleFocus(area)} style={{
                  padding:'4px 12px', borderRadius:999, fontSize:12, fontWeight:600, cursor:'pointer',
                  border:'none', background:focusAreas.includes(area)?'#0A66C2':'#F1F5F9',
                  color:focusAreas.includes(area)?'#fff':'#475569', transition:'all 0.15s',
                }}>{area}</button>
              ))}
            </div>
          </SectionCard>

          {/* Extra */}
          <SectionCard title="Zusaetzliche Infos (optional)">
            <textarea
              value={extraInfo}
              onChange={e => setExtraInfo(e.target.value)}
              rows={4}
              placeholder="Besondere Erfolge, Keywords, aktuelle Projekte..."
              style={{ width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, fontFamily:'Inter,sans-serif', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box', transition:'border 0.15s' }}
              onFocus={e => e.target.style.borderColor='#0A66C2'}
              onBlur={e => e.target.style.borderColor='#E2E8F0'}
            />
          </SectionCard>

          {/* Generate button */}
          <button onClick={generate} disabled={generating || !profile?.full_name} style={{
            width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            padding:'13px 24px', borderRadius:999, border:'none',
            background: generating ? '#94A3B8' : '#0A66C2',
            color:'#fff', fontSize:14, fontWeight:700,
            cursor: generating || !profile?.full_name ? 'not-allowed' : 'pointer',
            boxShadow: generating ? 'none' : '0 4px 14px rgba(10,102,194,0.35)',
            transition:'all 0.2s', opacity: !profile?.full_name ? 0.6 : 1,
          }}>
            {generating ? 'Generiere...' : (result ? 'Neu generieren' : 'LinkedIn Info generieren')}
          </button>

          {!profile?.full_name && (
            <div style={{ marginTop:10, padding:'9px 14px', background:'#FFF7ED', border:'1px solid #FDE68A', borderRadius:9, fontSize:12, color:'#92400E', fontWeight:600 }}>
              Bitte zuerst <a href="/profile" style={{ color:'#0A66C2' }}>Profil ausfuellen</a>
            </div>
          )}
          {error && (
            <div style={{ marginTop:10, padding:'9px 14px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:9, fontSize:12, color:'#991B1B', fontWeight:600 }}>{error}</div>
          )}
        </div>

        {/* RIGHT: Output */}
        <div>
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(15,23,42,0.06)', overflow:'hidden', marginBottom:14 }}>
            <div style={{ padding:'13px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>LinkedIn About-Text</span>
              {result && (
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:12, fontWeight:700, color: charOver?'#EF4444':charWarn?'#F59E0B':'#10B981' }}>
                    {charCount} / {charMax}
                  </span>
                  <button onClick={generate} disabled={generating} style={{ padding:'5px 12px', borderRadius:8, border:'1px solid #E2E8F0', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:600, color:'#64748B' }}>
                    Neu
                  </button>
                  <button onClick={copyText} style={{ padding:'5px 14px', borderRadius:8, border:'none', background:copied?'#DCFCE7':'#0A66C2', cursor:'pointer', fontSize:12, fontWeight:700, color:copied?'#065F46':'#fff', transition:'all 0.2s' }}>
                    {copied ? 'Kopiert!' : 'Kopieren'}
                  </button>
                </div>
              )}
            </div>

            {result ? (
              <div style={{ padding:18 }}>
                {/* LinkedIn preview */}
                <div style={{ background:'#F3F2EF', borderRadius:10, padding:14, border:'1px solid #E2E8F0', marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:10 }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#0A66C2,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>
                      {(profile?.full_name||'?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>{profile?.full_name}</div>
                      <div style={{ fontSize:11, color:'#64748B' }}>{profile?.headline||''}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:7 }}>Info</div>
                  <div style={{ fontSize:13, color:'#0F172A', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{result}</div>
                </div>

                {/* Zeichen-Status */}
                {charOver && (
                  <div style={{ marginBottom:10, padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:8, fontSize:12, color:'#991B1B', fontWeight:600 }}>
                    Text ist {charCount - charMax} Zeichen zu lang. Bitte kuerzen.
                  </div>
                )}

                {/* Editable textarea */}
                <Label>Bearbeiten und anpassen</Label>
                <textarea
                  value={result}
                  onChange={e => setResult(e.target.value)}
                  rows={10}
                  style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, fontFamily:'Inter,sans-serif', resize:'vertical', outline:'none', lineHeight:1.7, boxSizing:'border-box', color:'#0F172A', transition:'border 0.15s' }}
                  onFocus={e => e.target.style.borderColor='#0A66C2'}
                  onBlur={e => e.target.style.borderColor='#E2E8F0'}
                />

                {/* Copy CTA */}
                <button onClick={copyText} style={{ width:'100%', marginTop:10, padding:'11px', borderRadius:999, border:'none', background:copied?'#DCFCE7':'#0A66C2', color:copied?'#065F46':'#fff', fontSize:14, fontWeight:700, cursor:'pointer', transition:'all 0.2s', boxShadow:copied?'none':'0 2px 8px rgba(10,102,194,0.3)' }}>
                  {copied ? 'In die Zwischenablage kopiert!' : 'Text kopieren und in LinkedIn einfuegen'}
                </button>
              </div>
            ) : (
              <div style={{ padding:'56px 24px', textAlign:'center', color:'#94A3B8' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>✍️</div>
                <div style={{ fontSize:15, fontWeight:700, color:'#475569', marginBottom:6 }}>Noch kein Text generiert</div>
                <div style={{ fontSize:13, maxWidth:280, margin:'0 auto', lineHeight:1.6 }}>
                  Konfiguriere deinen Stil links und klicke auf "LinkedIn Info generieren".
                </div>
              </div>
            )}
          </div>

          {/* History */}
          {history.length > 1 && (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(15,23,42,0.06)', overflow:'hidden', marginBottom:14 }}>
              <div style={{ padding:'11px 18px', borderBottom:'1px solid #F1F5F9', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em' }}>Letzte Versionen</div>
              <div style={{ padding:'8px 12px', display:'flex', flexDirection:'column', gap:4 }}>
                {history.slice(1).map((h, i) => (
                  <button key={i} onClick={() => setResult(h.text)} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 12px', borderRadius:8, border:'1px solid #F1F5F9', background:'transparent', cursor:'pointer', textAlign:'left' }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#CBD5E1', marginTop:5, flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, color:'#64748B', marginBottom:2 }}>
                        {VARIANTS.find(v => v.id===h.variant)?.label} · {LENGTHS.find(l => l.id===h.length)?.label} · {h.ts.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}
                      </div>
                      <div style={{ fontSize:12, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.text.substring(0,80)}...</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          <div style={{ background:'linear-gradient(135deg,#F0F7FF,#EFF6FF)', borderRadius:12, border:'1px solid #BFDBFE', padding:'14px 18px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', marginBottom:9 }}>Tipps fuer deinen LinkedIn Info-Bereich</div>
            <ul style={{ margin:0, paddingLeft:16, display:'flex', flexDirection:'column', gap:5 }}>
              {[
                'Die ersten 2 Zeilen entscheiden - LinkedIn zeigt nur einen Vorschau-Text',
                'Max. 2.600 Zeichen - nutze den Platz gezielt',
                'Ein konkreter CTA am Ende erhoeht die Kontaktanfragen',
                'Keywords helfen bei der LinkedIn-Suche',
                'Persoenlichkeit schlaegt Floskeln - sei authentisch',
              ].map((tip, i) => <li key={i} style={{ fontSize:12, color:'#1E40AF', lineHeight:1.5 }}>{tip}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
