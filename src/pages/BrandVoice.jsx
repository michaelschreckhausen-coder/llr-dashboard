import React, { useEffect, useState } from 'react'
import { useTeam } from '../context/TeamContext'
import { supabase } from '../lib/supabase'

const P = 'rgb(49,90,231)'

// ─── Konstanten ───────────────────────────────────────────────────────────────
const TONES = ['Professionell','Freundlich','Direkt','Inspirierend','Humorvoll','Empathisch','Analytisch','Motivierend','Authentisch','Kreativ','Sachlich','Leidenschaftlich','Mutig','Klar','Visionär']
const FORM  = [{v:'du',l:'Du-Form',d:'Persönlich & nahbar'},{v:'sie',l:'Sie-Form',d:'Formell & distanziert'},{v:'mixed',l:'Gemischt',d:'Je nach Kontext'}]
const GOALS = ['Neue Leads generieren','Netzwerk aufbauen','Thought Leadership etablieren','Recruiting & Employer Branding','Persönliche Marke aufbauen','Produkt / Dienstleistung vermarkten']

const SLIDERS = [
  { key:'formal',    left:'Locker',      right:'Formell',     default:2 },
  { key:'direct',    left:'Nahbar',      right:'Direkt',      default:3 },
  { key:'length',    left:'Kurz',        right:'Ausführlich', default:2 },
  { key:'technical', left:'Einfach',     right:'Fachlich',    default:3 },
  { key:'serious',   left:'Humorvoll',   right:'Seriös',      default:4 },
]

const E0 = {name:'',is_active:true,brand_name:'',brand_background:'',mission:'',vision:'',values:'',personality:'',tone_attributes:[],word_choice:'',sentence_style:'',grammar_style:'',jargon_level:'mixed',voice_style:'active',formality:'du',dos:'',donts:'',target_audience:'',example_texts:'',ai_summary:''}

// ─── Helper-Komponenten ────────────────────────────────────────────────────────
const In  = ({v,fn,ph,style={}}) => <input  value={v||''} onChange={e=>fn(e.target.value)} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none',...style}}/>
const Tx  = ({v,fn,r=3,ph})     => <textarea value={v||''} onChange={e=>fn(e.target.value)} rows={r} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,resize:'vertical',boxSizing:'border-box',outline:'none'}}/>
const Lb  = ({l,h})             => <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}}>{l}</div>{h&&<div style={{fontSize:11,color:'#aaa',marginBottom:4}}>{h}</div>}</div>
const Sc  = ({t,ch})            => <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8ecf0',marginBottom:14}}><div style={{padding:'11px 16px',borderBottom:'1px solid #f0f0f0',fontWeight:700,fontSize:13}}>{t}</div><div style={{padding:'15px 16px',display:'flex',flexDirection:'column',gap:11}}>{ch}</div></div>

// ─── Stil-Slider ──────────────────────────────────────────────────────────────
function StyleSlider({ label, left, right, value, onChange }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:600, color:'#475569', marginBottom:6 }}>
        <span>{left}</span><span>{right}</span>
      </div>
      <input type="range" min={1} max={5} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width:'100%', accentColor:P }}/>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#94A3B8', marginTop:2 }}>
        {[1,2,3,4,5].map(n => <span key={n} style={{fontWeight:n===value?800:400,color:n===value?P:'#94A3B8'}}>{n}</span>)}
      </div>
    </div>
  )
}

// ─── KI-Schnellstart Wizard ───────────────────────────────────────────────────
function QuickSetup({ session, onDone, onSkip }) {
  const [step, setStep] = useState(1)
  const [name, setName]       = useState('')
  const [position, setPos]    = useState('')
  const [company, setCo]      = useState('')
  const [bio, setBio]         = useState('')
  const [goal, setGoal]       = useState(GOALS[0])
  const [examples, setEx]     = useState('')
  const [sliders, setSliders] = useState(() => Object.fromEntries(SLIDERS.map(s => [s.key, s.default])))
  const [generating, setGen]  = useState(false)
  const [error, setError]     = useState('')

  // Profil auto-fill
  useEffect(() => {
    supabase.from('profiles').select('full_name,headline,company,bio').eq('id', session.user.id).single()
      .then(({ data }) => {
        if (data) {
          setName(data.full_name || '')
          setPos(data.headline || '')
          setCo(data.company || '')
          setBio(data.bio || '')
        }
      })
  }, [])

  function setSlider(key, val) { setSliders(s => ({...s, [key]:val})) }

  async function generate() {
    if (!name.trim()) { setError('Bitte deinen Namen eingeben.'); return }
    setGen(true); setError('')
    try {
      const prompt = [
        'Erstelle eine vollständige Brand Voice für LinkedIn. Antworte NUR mit einem JSON-Objekt, ohne Kommentar.',
        '',
        '## Person',
        'Name: ' + name,
        position ? 'Position: ' + position : '',
        company  ? 'Unternehmen: ' + company  : '',
        bio      ? 'Über mich: ' + bio.slice(0,300) : '',
        '',
        '## Stil-Präferenzen (Skala 1–5)',
        ...SLIDERS.map(s => s.left + '(1) vs ' + s.right + '(5): ' + sliders[s.key]),
        '',
        '## LinkedIn-Ziel',
        goal,
        '',
        examples ? '## Eigene Texte als Stil-Referenz\n' + examples.slice(0,800) : '',
        '',
        '## Erwartetes JSON-Format:',
        JSON.stringify({
          name: 'Meine Brand Voice',
          personality: '1-2 Sätze Persönlichkeitsbeschreibung',
          tone_attributes: ['Tag1','Tag2','Tag3','Tag4'],
          formality: 'du ODER sie',
          word_choice: '1-2 Sätze zur Wortwahl',
          sentence_style: '1-2 Sätze zur Satzstruktur',
          dos: '3 konkrete Dos (mit - eingeleitet)',
          donts: '3 konkrete Donts (mit - eingeleitet)',
          target_audience: '1-2 Sätze zur Zielgruppe',
          ai_summary: '150-200 Wörter System-Prompt-Anweisung in 2. Person ("Schreibe..."), direkt verwendbar'
        }, null, 2),
      ].filter(Boolean).join('\n')

      const { data: { session: ss } } = await supabase.auth.getSession()
      const res = await fetch('https://jdhajqpgfrsuoluaesjn.supabase.co/functions/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+ss.access_token },
        body: JSON.stringify({ type:'brand_voice_summary', prompt })
      })
      const d = await res.json()
      const raw = d.text || d.comment || d.about || d.summary || ''
      if (!raw) throw new Error(d.error || 'Keine Antwort')

      // JSON aus Antwort extrahieren
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Kein JSON in Antwort')
      const bv = JSON.parse(jsonMatch[0])

      // Brand Voice speichern
      const { error: saveErr } = await supabase.from('brand_voices').insert({
        user_id: session.user.id,
        name: bv.name || (name + 's Brand Voice'),
        is_active: true,
        brand_name: company || name,
        personality: bv.personality || '',
        tone_attributes: Array.isArray(bv.tone_attributes) ? bv.tone_attributes : [],
        formality: bv.formality || 'du',
        word_choice: bv.word_choice || '',
        sentence_style: bv.sentence_style || '',
        dos: bv.dos || '',
        donts: bv.donts || '',
        target_audience: bv.target_audience || '',
        example_texts: examples || '',
        ai_summary: bv.ai_summary || '',
      })
      if (saveErr) throw saveErr
      onDone()
    } catch(e) {
      setError('Fehler: ' + e.message)
    }
    setGen(false)
  }

  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ background:'white', borderRadius:20, border:'2px solid '+P, boxShadow:'0 8px 32px rgba(49,90,231,0.12)', overflow:'hidden', marginBottom:24 }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg, rgb(49,90,231), #8B5CF6)', padding:'22px 28px', color:'white' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>✨ Brand Voice in 3 Schritten erstellen</div>
            <div style={{ fontSize:13, opacity:0.85 }}>KI analysiert deinen Stil und erstellt eine vollständige Brand Voice — sofort einsatzbereit</div>
          </div>
          <button onClick={onSkip} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, color:'white', fontSize:12, fontWeight:600, padding:'6px 14px', cursor:'pointer' }}>
            Manuell erstellen →
          </button>
        </div>
        {/* Step Indicator */}
        <div style={{ display:'flex', gap:8, marginTop:18 }}>
          {['1 Profil','2 Stil','3 Ziel'].map((s,i) => (
            <div key={i} onClick={() => i+1 < step && setStep(i+1)} style={{
              padding:'5px 14px', borderRadius:999, fontSize:12, fontWeight:700, cursor:i+1<step?'pointer':'default',
              background: step===i+1 ? 'white' : 'rgba(255,255,255,0.2)',
              color: step===i+1 ? P : 'white',
            }}>{s}</div>
          ))}
        </div>
      </div>

      <div style={{ padding:'24px 28px' }}>
        {error && <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:9, background:'#FEF2F2', border:'1px solid #FCA5A5', fontSize:13, color:'#991B1B', fontWeight:600 }}>{error}</div>}

        {/* Schritt 1: Profil */}
        {step === 1 && (
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', marginBottom:4 }}>Wer bist du?</div>
            <div style={{ fontSize:13, color:'#64748B', marginBottom:20 }}>Wir haben dein Profil vorausgefüllt — prüfe und ergänze die Daten.</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>Name *</label>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="Max Mustermann" style={inp}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>Unternehmen</label>
                <input value={company} onChange={e=>setCo(e.target.value)} placeholder="Firma GmbH" style={inp}/>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>Position / Headline</label>
              <input value={position} onChange={e=>setPos(e.target.value)} placeholder="CEO | Sales Consultant | Marketing Manager" style={inp}/>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>Über mich (optional)</label>
              <textarea value={bio} onChange={e=>setBio(e.target.value)} rows={3} placeholder="Kurze Beschreibung deiner Arbeit, Expertise..." style={{ ...inp, resize:'vertical', lineHeight:1.6 }}/>
            </div>
            <button onClick={() => { if (!name.trim()) { setError('Bitte deinen Namen eingeben.'); return } setError(''); setStep(2) }}
              style={{ width:'100%', padding:'12px', borderRadius:999, border:'none', background:'linear-gradient(135deg, rgb(49,90,231), #8B5CF6)', color:'white', fontSize:14, fontWeight:700, cursor:'pointer' }}>
              Weiter → Stil definieren
            </button>
          </div>
        )}

        {/* Schritt 2: Stil */}
        {step === 2 && (
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', marginBottom:4 }}>Wie klingt dein Stil?</div>
            <div style={{ fontSize:13, color:'#64748B', marginBottom:20 }}>Ziehe die Regler auf die Werte die am besten zu dir passen.</div>
            {SLIDERS.map(s => (
              <StyleSlider key={s.key} left={s.left} right={s.right} value={sliders[s.key]} onChange={v => setSlider(s.key, v)}/>
            ))}
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={() => setStep(1)} style={{ flex:1, padding:'11px', borderRadius:999, border:'1.5px solid #E2E8F0', background:'white', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>← Zurück</button>
              <button onClick={() => setStep(3)} style={{ flex:2, padding:'11px', borderRadius:999, border:'none', background:'linear-gradient(135deg, rgb(49,90,231), #8B5CF6)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>Weiter → Ziel & Texte</button>
            </div>
          </div>
        )}

        {/* Schritt 3: Ziel + Beispiele */}
        {step === 3 && (
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', marginBottom:4 }}>Dein LinkedIn-Ziel</div>
            <div style={{ fontSize:13, color:'#64748B', marginBottom:16 }}>Was möchtest du auf LinkedIn erreichen?</div>
            <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:20 }}>
              {GOALS.map(g => (
                <button key={g} onClick={() => setGoal(g)} style={{
                  padding:'10px 14px', borderRadius:10, textAlign:'left', cursor:'pointer', fontSize:13,
                  border: goal===g ? '2px solid '+P : '1.5px solid #E2E8F0',
                  background: goal===g ? 'rgba(49,90,231,0.08)' : '#fff',
                  color: goal===g ? P : 'rgb(20,20,43)', fontWeight: goal===g ? 700 : 400
                }}>{g}</button>
              ))}
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>
                Eigene Texte als Referenz <span style={{ color:'#94A3B8', fontWeight:400 }}>(optional, aber empfohlen)</span>
              </label>
              <textarea value={examples} onChange={e=>setEx(e.target.value)} rows={5}
                placeholder="Füge 1-3 eigene LinkedIn-Posts oder Texte ein. Die KI analysiert deinen Schreibstil und übernimmt ihn in die Brand Voice..."
                style={{ ...inp, resize:'vertical', lineHeight:1.6 }}/>
              <div style={{ fontSize:11, color:'#94A3B8', marginTop:4 }}>Je mehr eigene Texte, desto authentischer das Ergebnis</div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setStep(2)} style={{ flex:1, padding:'12px', borderRadius:999, border:'1.5px solid #E2E8F0', background:'white', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>← Zurück</button>
              <button onClick={generate} disabled={generating} style={{
                flex:2, padding:'12px', borderRadius:999, border:'none', fontSize:14, fontWeight:700, cursor:generating?'not-allowed':'pointer',
                background:generating ? '#94A3B8' : 'linear-gradient(135deg, rgb(49,90,231), #8B5CF6)',
                color:'white', display:'flex', alignItems:'center', justifyContent:'center', gap:8
              }}>
                {generating ? '⏳ KI analysiert deinen Stil…' : '✨ Brand Voice generieren'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Detaillierter Editor ─────────────────────────────────────────────────────
function Editor({ session, voice, onDone }) {
  const [form, setForm] = useState(voice ? {...voice} : {...E0})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [ai, setAi]         = useState(false)
  const [tab, setTab]       = useState('id')

  const s  = k => v => setForm(f => ({...f, [k]:v}))
  const tog = t => setForm(f => { const a=f.tone_attributes||[]; return {...f, tone_attributes: a.includes(t)?a.filter(x=>x!==t):[...a,t]} })

  async function genSummary() {
    setAi(true)
    const { data: { session: ss } } = await supabase.auth.getSession()
    const p = ['Erstelle eine präzise Brand Voice Anweisung (max 200 Wörter) als direkten System-Prompt.']
    if (form.brand_name)               p.push('Marke: ' + form.brand_name)
    if (form.personality)              p.push('Persönlichkeit: ' + form.personality)
    if (form.tone_attributes?.length)  p.push('Ton: ' + form.tone_attributes.join(', '))
    if (form.formality === 'du')       p.push('Ansprache: Du-Form')
    if (form.formality === 'sie')      p.push('Ansprache: Sie-Form')
    if (form.word_choice)              p.push('Wortwahl: ' + form.word_choice)
    if (form.sentence_style)           p.push('Satzstruktur: ' + form.sentence_style)
    if (form.dos)                      p.push('Dos: ' + form.dos)
    if (form.donts)                    p.push('Donts: ' + form.donts)
    if (form.target_audience)          p.push('Zielgruppe: ' + form.target_audience)
    if (form.example_texts)            p.push('Beispiele:\n' + form.example_texts.slice(0,500))
    try {
      const r = await fetch('https://jdhajqpgfrsuoluaesjn.supabase.co/functions/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+ss.access_token },
        body: JSON.stringify({ type:'brand_voice_summary', prompt: p.join('\n') })
      })
      const d = await r.json()
      const text = d.text || d.summary || d.comment || d.about || ''
      if (text) { setForm(f => ({...f, ai_summary:text})); setTab('sum') }
    } catch(e) { console.error(e) }
    setAi(false)
  }

  async function save() {
    if (!form.name?.trim()) return
    setSaving(true)
    const payload = { ...form, user_id: session.user.id }
    if (!voice) await supabase.from('brand_voices').insert(payload)
    else        await supabase.from('brand_voices').update(payload).eq('id', voice.id)
    setSaving(false); setSaved(true); setTimeout(() => { setSaved(false); onDone() }, 1500)
  }

  const TABS = [{id:'id',l:'Marke'},{id:'lang',l:'Sprache'},{id:'aud',l:'Zielgruppe'},{id:'sum',l:'AI Summary'}]

  return (
    <div style={{ maxWidth:800 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <button onClick={onDone} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#888' }}>←</button>
        <div>
          <h1 style={{ fontSize:19, fontWeight:800, margin:0 }}>{!voice ? 'Neue Brand Voice' : 'Brand Voice bearbeiten'}</h1>
          <p style={{ fontSize:12, color:'#888', margin:0 }}>Persönlicher Kommunikationsstil für alle LinkedIn-Inhalte</p>
        </div>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center' }}>
        <In v={form.name} fn={s('name')} ph="Name (z.B. Meine Brand Voice)"/>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#555', cursor:'pointer', whiteSpace:'nowrap' }}>
          <input type="checkbox" checked={form.is_active} onChange={e=>s('is_active')(e.target.checked)}/>Aktiv
        </label>
      </div>

      <div style={{ display:'flex', gap:4, borderBottom:'2px solid #eee', marginBottom:14 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'7px 14px', border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight:600,
            color:tab===t.id?P:'#888', borderBottom:tab===t.id?'2px solid '+P:'2px solid transparent', marginBottom:-2
          }}>{t.l}</button>
        ))}
      </div>

      {tab==='id'&&<>
        <Sc t="Markenidentität" ch={<>
          <div><Lb l="Markenname"/><In v={form.brand_name} fn={s('brand_name')} ph="z.B. LinkedIn Consulting GmbH"/></div>
          <div><Lb l="Hintergrund"/><Tx v={form.brand_background} fn={s('brand_background')} r={2} ph="Was tust du / bietet die Marke?"/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><Lb l="Mission"/><Tx v={form.mission} fn={s('mission')} r={2} ph="Wir helfen..."/></div>
            <div><Lb l="Vision"/><Tx v={form.vision} fn={s('vision')} r={2} ph="Unsere Vision ist..."/></div>
          </div>
          <div><Lb l="Werte"/><In v={form.values} fn={s('values')} ph="Ehrlichkeit, Innovation, Klarheit..."/></div>
        </>}/>
        <Sc t="Persönlichkeit" ch={<>
          <div><Lb l="Beschreibung"/><Tx v={form.personality} fn={s('personality')} r={2} ph="Wir kommunizieren direkt und auf Augenhöhe..."/></div>
          <div><Lb l="Ton-Attribute (3-6 wählen)"/>
            <div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:4}}>
              {TONES.map(t => { const on=(form.tone_attributes||[]).includes(t); return (
                <button key={t} onClick={()=>tog(t)} style={{padding:'4px 12px',borderRadius:14,fontSize:12,fontWeight:600,cursor:'pointer',border:'none',background:on?P:'#f0f0f0',color:on?'#fff':'#555'}}>{t}</button>
              )})}
            </div>
          </div>
        </>}/>
      </>}

      {tab==='lang'&&<>
        <Sc t="Ansprache" ch={<>
          <div><Lb l="Förmlichkeit"/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
              {FORM.map(o => (
                <button key={o.v} onClick={()=>s('formality')(o.v)} style={{padding:'9px 12px',borderRadius:9,cursor:'pointer',textAlign:'left',border:form.formality===o.v?'2px solid '+P:'1.5px solid #dde3ea',background:form.formality===o.v?'rgba(49,90,231,0.08)':'#fff'}}>
                  <div style={{fontWeight:700,fontSize:13,color:form.formality===o.v?P:'#333'}}>{o.l}</div>
                  <div style={{fontSize:11,color:'#888'}}>{o.d}</div>
                </button>
              ))}
            </div>
          </div>
        </>}/>
        <Sc t="Sprach-Richtlinien" ch={<>
          <div><Lb l="Wortwahl" h="Welche Wörter bevorzugst du, was vermeidest du?"/><Tx v={form.word_choice} fn={s('word_choice')} r={2} ph="Bevorzugt: klar, konkret, aktiv. Vermeiden: Buzzwords, Passiv..."/></div>
          <div><Lb l="Satzstruktur"/><Tx v={form.sentence_style} fn={s('sentence_style')} r={2} ph="Kurze, prägnante Sätze. Max. 15 Wörter pro Satz..."/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><Lb l="✅ Dos"/><Tx v={form.dos} fn={s('dos')} r={4} ph="- Konkrete Beispiele nutzen\n- Fragen stellen\n- Eigene Meinung vertreten"/></div>
            <div><Lb l="❌ Don'ts"/><Tx v={form.donts} fn={s('donts')} r={4} ph="- Keine Floskeln\n- Nicht übertreiben\n- Keine Fremdwörter"/></div>
          </div>
        </>}/>
      </>}

      {tab==='aud'&&<>
        <Sc t="Zielgruppe" ch={<div><Lb l="Wer liest deine Inhalte?" h="Je spezifischer, desto besser passt der Ton"/><Tx v={form.target_audience} fn={s('target_audience')} r={4} ph="B2B-Entscheider im DACH-Raum, Geschäftsführer von KMU, 35-55 Jahre, Fokus auf..."/></div>}/>
        <Sc t="Beispieltexte für KI-Analyse" ch={<>
          <div><Lb l="Eigene Texte" h="LinkedIn-Posts, Artikel — KI lernt deinen Stil daraus"/><Tx v={form.example_texts} fn={s('example_texts')} r={7} ph="Füge hier 2-3 eigene Texte ein die deinen Stil zeigen..."/></div>
          <button onClick={genSummary} disabled={ai} style={{padding:'9px 18px',background:'linear-gradient(135deg,#7c3aed,#a855f7)',color:'#fff',border:'none',borderRadius:18,fontSize:13,fontWeight:700,cursor:'pointer',alignSelf:'flex-start'}}>
            {ai ? '⏳ Analysiere...' : '✨ KI-Summary generieren'}
          </button>
        </>}/>
      </>}

      {tab==='sum'&&<Sc t="Brand Voice Summary" ch={<>
        <div><Lb l="AI Summary" h="Wird automatisch in alle KI-Aufrufe eingebaut"/><Tx v={form.ai_summary} fn={s('ai_summary')} r={9} ph="Noch keine Summary. Gehe zum Tab 'Zielgruppe' und klicke auf 'KI-Summary generieren'."/></div>
        <div style={{padding:'9px 12px',background:'rgba(49,90,231,0.06)',borderRadius:7,fontSize:12,color:P}}>💡 Diese Summary ist der Kern deiner Brand Voice — je präziser, desto authentischer die KI-Texte.</div>
        <button onClick={genSummary} disabled={ai} style={{padding:'8px 16px',background:'linear-gradient(135deg,#7c3aed,#a855f7)',color:'#fff',border:'none',borderRadius:18,fontSize:12,fontWeight:700,cursor:'pointer',alignSelf:'flex-start'}}>
          {ai ? '⏳ Generiere...' : '🔄 Neu generieren'}
        </button>
      </>}/>}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 0',borderTop:'1px solid #f0f0f0',marginTop:8}}>
        <button onClick={onDone} style={{padding:'8px 18px',borderRadius:18,background:'#f0f0f0',border:'none',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {saved && <span style={{color:'#057642',fontSize:13,fontWeight:600}}>✅ Gespeichert!</span>}
          <button onClick={save} disabled={saving||!form.name?.trim()} style={{padding:'8px 22px',borderRadius:18,background:'linear-gradient(135deg,'+P+',rgb(100,140,240))',color:'#fff',border:'none',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            {saving ? '⏳ Speichert...' : '💾 Brand Voice speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BrandVoice({ session }) {
  const { team, shareBrandVoiceWithTeam } = useTeam()
  const [voices, setVoices]   = useState([])
  const [view,   setView]     = useState('list') // 'list' | 'quick' | 'editor'
  const [editVoice, setEdit]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('brand_voices').select('*').eq('user_id', session.user.id).order('updated_at', { ascending: false })
    setVoices(data || [])
    setLoading(false)
  }

  async function activate(id) {
    await supabase.from('brand_voices').update({ is_active: false }).eq('user_id', session.user.id)
    await supabase.from('brand_voices').update({ is_active: true  }).eq('id', id)
    await load()
  }

  async function deleteVoice(id) {
    if (!confirm('Brand Voice wirklich löschen?')) return
    await supabase.from('brand_voices').delete().eq('id', id)
    await load()
  }

  function onDone() { setView('list'); setEdit(null); load() }

  // Editor-View
  if (view === 'editor') return <Editor session={session} voice={editVoice} onDone={onDone}/>

  // Haupt-View
  return (
    <div style={{ maxWidth:800 }}>
      {/* Quick Setup - immer sichtbar wenn keine Voice, optional als Button wenn Voices vorhanden */}
      {view === 'quick' ? (
        <QuickSetup session={session} onDone={onDone} onSkip={() => { setEdit(null); setView('editor') }}/>
      ) : (
        <>
          {/* Action Bar */}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginBottom:22 }}>
            <button onClick={() => setView('quick')} style={{ padding:'9px 18px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+P+',#8B5CF6)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:7, boxShadow:'0 4px 14px rgba(49,90,231,0.3)' }}>
              ✨ KI-Schnellstart
            </button>
            <button onClick={() => { setEdit(null); setView('editor') }} style={{ padding:'9px 18px', borderRadius:12, border:'1.5px solid #E2E8F0', background:'white', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              + Manuell erstellen
            </button>
          </div>

          {/* Voice Liste oder Leer-State */}
          {loading ? (
            <div style={{ textAlign:'center', padding:48, color:'#94A3B8' }}>Lade Brand Voices…</div>
          ) : voices.length === 0 ? (
            <div style={{ textAlign:'center', padding:'56px 20px', background:'#fff', borderRadius:14, border:'2px dashed #dde3ea' }}>
              <div style={{ fontSize:44, marginBottom:14 }}>🎙️</div>
              <div style={{ fontSize:17, fontWeight:700, marginBottom:7 }}>Noch keine Brand Voice definiert</div>
              <p style={{ color:'#888', fontSize:13, marginBottom:20 }}>Erstelle in 3 Schritten deine persönliche Brand Voice — die KI übernimmt die schwere Arbeit.</p>
              <button onClick={() => setView('quick')} style={{ padding:'11px 28px', borderRadius:999, border:'none', background:'linear-gradient(135deg,'+P+',#8B5CF6)', color:'white', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(49,90,231,0.35)' }}>
                ✨ Jetzt mit KI erstellen
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              {voices.map(v => (
                <div key={v.id} style={{ background:'#fff', borderRadius:14, border: v.is_active ? '2px solid '+P : '1.5px solid #eee', padding:'18px 20px', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:6 }}>
                        <span style={{ fontWeight:800, fontSize:15 }}>{v.name || 'Unbenannte Brand Voice'}</span>
                        {v.is_active && <span style={{ padding:'2px 9px', borderRadius:9, fontSize:10, fontWeight:700, background:'rgba(49,90,231,0.1)', color:P }}>✓ Aktiv</span>}
                        {(() => {
                          const fields = [v.brand_name,v.mission,v.vision,v.values,v.personality,v.target_audience,v.ai_summary,v.tone_attributes?.length>0?'ok':null,v.dos,v.donts]
                          const filled = fields.filter(Boolean).length
                          const pct = Math.round(filled/fields.length*100)
                          const color = pct>=80?'#22c55e':pct>=50?'#f59e0b':'#ef4444'
                          return <span style={{ padding:'2px 9px', borderRadius:9, fontSize:10, fontWeight:700, background:color+'18', color }}>{pct}% vollständig</span>
                        })()}
                      </div>
                      {v.brand_name && <div style={{ fontSize:12, color:'#666', marginBottom:5 }}>🏢 {v.brand_name}</div>}
                      {v.tone_attributes?.length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
                          {v.tone_attributes.slice(0,5).map(t => <span key={t} style={{ padding:'2px 8px', borderRadius:7, fontSize:11, background:'rgba(49,90,231,0.07)', color:P, fontWeight:600 }}>{t}</span>)}
                        </div>
                      )}
                      {v.ai_summary ? (
                        <div style={{ fontSize:12, color:'#64748B', background:'#F8F9FF', borderRadius:8, padding:'8px 11px', lineHeight:1.5, border:'1px solid rgba(49,90,231,0.08)' }}>
                          {v.ai_summary.slice(0,180)}{v.ai_summary.length>180?'…':''}
                        </div>
                      ) : (
                        <div style={{ fontSize:11, color:'#F59E0B', fontWeight:600 }}>⚠️ Noch keine KI-Summary — im Editor generieren</div>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:7, marginLeft:16, flexShrink:0, flexDirection:'column', alignItems:'flex-end' }}>
                      {!v.is_active && (
                        <button onClick={() => activate(v.id)} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid '+P, background:'rgba(49,90,231,0.08)', color:P, fontSize:12, fontWeight:700, cursor:'pointer' }}>Aktivieren</button>
                      )}
                      <button onClick={() => { setEdit(v); setView('editor') }} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'white', color:'#475569', fontSize:12, fontWeight:600, cursor:'pointer' }}>Bearbeiten</button>
                      <button onClick={() => deleteVoice(v.id)} style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#991B1B', fontSize:12, cursor:'pointer' }}>🗑</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
