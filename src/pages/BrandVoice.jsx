import { useTranslation } from 'react-i18next'
import React, { useEffect, useState } from 'react'
import { useTeam } from '../context/TeamContext'
import { supabase } from '../lib/supabase'
import KnowledgeImporter from '../components/KnowledgeImporter'

const P = 'var(--wl-primary, rgb(49,90,231))'

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

const TONALITY_DEFAULTS = [
  { label:'Authentisch', value:80 },
  { label:'Direkt',      value:70 },
  { label:'Inspirierend',value:60 },
  { label:'Strategisch', value:75 },
  { label:'Empathisch',  value:50 },
]

const EMOJI_OPTIONS = ['Keine Emojis','Minimal (1-2 pro Beitrag)','Gelegentlich','Reichlich']
const HASHTAG_OPTIONS = ['Keine Hashtags','1-3 gezielte','3-5 thematische','5+ für Reichweite']
const HOOK_OPTIONS = ['Provokante Frage','Persönliche Geschichte','Überraschende Statistik','Direkte Aussage','Kontroverse These']
const CTA_OPTIONS = ['Frage ans Netzwerk','Zum Kommentieren einladen','Link/Ressource teilen','Zum Nachdenken anregen','Call-to-Action vermeiden']

const E0 = {name:'',is_active:true,brand_name:'',brand_background:'',mission:'',vision:'',values:'',personality:'',tone_attributes:[],word_choice:'',sentence_style:'',grammar_style:'',jargon_level:'mixed',voice_style:'active',formality:'du',dos:'',donts:'',target_audience:'',example_texts:'',ai_summary:'',tonality:{},vocabulary:[],glossary:[],linkedin_style:{},imported_context:'',file_name:'',file_url:'',file_type:'',source_url:''}

// ─── Helper-Komponenten ────────────────────────────────────────────────────────
const In = ({v,fn,ph,style={}}) => <input value={v||''} onChange={e=>fn(e.target.value)} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none',...style}}/>
const Tx = ({v,fn,r=3,ph}) => <textarea value={v||''} onChange={e=>fn(e.target.value)} rows={r} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,resize:'vertical',boxSizing:'border-box',outline:'none'}}/>
const Lb = ({l,h}) => <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}}>{l}</div>{h&&<div style={{fontSize:11,color:'#aaa',marginBottom:4}}>{h}</div>}</div>
const Sc = ({t,ch}) => <div style={{background:'var(--surface)',borderRadius:12,border:'1px solid #e8ecf0',marginBottom:14}}><div style={{padding:'11px 16px',borderBottom:'1px solid #f0f0f0',fontWeight:700,fontSize:13}}>{t}</div><div style={{padding:'15px 16px',display:'flex',flexDirection:'column',gap:11}}>{ch}</div></div>

// ─── Tonalitäts-Slider (Neuroflash-Style mit %) ──────────────────────────────
function TonalitySlider({ label, value, onChange, onLabelChange, onRemove }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
      <input value={label} onChange={e=>onLabelChange(e.target.value)}
        style={{ width:130, padding:'5px 8px', border:'1.5px solid #dde3ea', borderRadius:6, fontSize:12, fontWeight:600 }}/>
      <input type="range" min={0} max={100} value={value} onChange={e=>onChange(Number(e.target.value))}
        style={{ flex:1, accentColor:P }}/>
      <span style={{ fontSize:12, fontWeight:600, color:P, minWidth:36, textAlign:'right' }}>{value}%</span>
      <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:'#ccc', fontSize:16 }}>×</button>
    </div>
  )
}

// ─── Stil-Slider (für KI-Schnellstart) ───────────────────────────────────────
function StyleSlider({ label, left, right, value, onChange }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:600, color:'#475569', marginBottom:6 }}>
        <span>{left}</span><span>{right}</span>
      </div>
      <input type="range" min={1} max={5} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width:'100%', accentColor:P }}/>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text-muted)', marginTop:2 }}>
        {[1,2,3,4,5].map(n => <span key={n} style={{fontWeight:n===value?800:400,color:n===value?P:'#94A3B8'}}>{n}</span>)}
      </div>
    </div>
  )
}

// ─── Keyword-Chips (Wortschatz) ───────────────────────────────────────────────
function VocabularyChips({ items, onChange, max=30 }) {
  const [input, setInput] = useState('')
  const add = () => {
    const w = input.trim()
    if (w && items.length < max && !items.includes(w)) { onChange([...items, w]); setInput('') }
  }
  return (
    <div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
        {items.map((w,i) => (
          <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', background:'rgba(49,90,231,0.08)', borderRadius:20, fontSize:12, color:'#315AE7' }}>
            {w}
            <button onClick={()=>onChange(items.filter((_,j)=>j!==i))} style={{ background:'none', border:'none', cursor:'pointer', color:'#315AE7', fontSize:14, lineHeight:1, padding:0 }}>×</button>
          </span>
        ))}
      </div>
      {items.length < max && (
        <div style={{ display:'flex', gap:6 }}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),add())}
            placeholder="Keyword hinzufügen..." style={{ flex:1, padding:'6px 10px', border:'1.5px solid #dde3ea', borderRadius:6, fontSize:12 }}/>
          <button onClick={add} style={{ padding:'6px 12px', background:P, color:'#fff', border:'none', borderRadius:6, fontSize:12, cursor:'pointer' }}>+</button>
        </div>
      )}
      <div style={{ fontSize:10, color:'#aaa', marginTop:4 }}>{items.length}/{max} Keywords</div>
    </div>
  )
}

// ─── Glossar (Begriff + Definition) ───────────────────────────────────────────
function GlossaryEditor({ items, onChange }) {
  const add = () => onChange([...items, { term:'', definition:'' }])
  const update = (i, field, val) => onChange(items.map((g,j) => j===i ? {...g, [field]:val} : g))
  const remove = (i) => onChange(items.filter((_,j) => j!==i))
  return (
    <div>
      {items.map((g,i) => (
        <div key={i} style={{ display:'flex', gap:8, marginBottom:6, alignItems:'center' }}>
          <input value={g.term} onChange={e=>update(i,'term',e.target.value)} placeholder="Begriff"
            style={{ width:140, padding:'6px 8px', border:'1.5px solid #dde3ea', borderRadius:6, fontSize:12, fontWeight:600 }}/>
          <input value={g.definition} onChange={e=>update(i,'definition',e.target.value)} placeholder="Definition"
            style={{ flex:1, padding:'6px 8px', border:'1.5px solid #dde3ea', borderRadius:6, fontSize:12 }}/>
          <button onClick={()=>remove(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'#ccc', fontSize:16 }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ padding:'5px 12px', background:'none', border:'1.5px dashed #dde3ea', borderRadius:6, fontSize:12, color:'#888', cursor:'pointer', width:'100%' }}>
        + Begriff hinzufügen
      </button>
    </div>
  )
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────
function Dd({ v, fn, opts, ph }) {
  return (
    <select value={v||''} onChange={e=>fn(e.target.value)}
      style={{ width:'100%', padding:'8px 11px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:13, background:'var(--surface)', outline:'none' }}>
      {ph && <option value="">{ph}</option>}
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
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

  useEffect(() => {
    supabase.from('profiles').select('full_name,headline,company,bio').eq('id', session.user.id).single()
      .then(({ data }) => {
        if (data) { setName(data.full_name||''); setPos(data.headline||''); setCo(data.company||''); setBio(data.bio||'') }
      })
  }, [])

  function setSlider(key, val) { setSliders(s => ({...s, [key]:val})) }

  async function generate() {
    if (!name.trim()) { setError('Bitte deinen Namen eingeben.'); return }
    setGen(true); setError('')
    try {
      const prompt = [
        'Erstelle eine vollständige Brand Voice für LinkedIn. Antworte NUR mit einem JSON-Objekt, ohne Kommentar.',
        '', '## Person', 'Name: ' + name,
        position ? 'Position: ' + position : '', company ? 'Unternehmen: ' + company : '',
        bio ? 'Über mich: ' + bio.slice(0,300) : '',
        '', '## Stil-Präferenzen (Skala 1–5)',
        ...SLIDERS.map(s => s.left + '(1) vs ' + s.right + '(5): ' + sliders[s.key]),
        '', '## LinkedIn-Ziel', goal,
        '', examples ? '## Eigene Texte als Stil-Referenz\n' + examples.slice(0,800) : '',
        '', '## Erwartetes JSON-Format:',
        JSON.stringify({
          name:'Meine Brand Voice', personality:'1-2 Sätze', tone_attributes:['Tag1','Tag2','Tag3','Tag4'],
          formality:'du ODER sie', word_choice:'1-2 Sätze', sentence_style:'1-2 Sätze',
          dos:'3 Dos mit -', donts:'3 Donts mit -',
          tonality:{Authentisch:80,Direkt:70,Inspirierend:60,Strategisch:75,Empathisch:50},
          vocabulary:['keyword1','keyword2','keyword3','keyword4','keyword5'],
          linkedin_style:{hook_style:'bevorzugter Hook',cta_style:'bevorzugter CTA',emoji_usage:'Minimal',hashtag_usage:'1-3 gezielte'},
          ai_summary:'150-200 Wörter System-Prompt in 2. Person'
        })
      ].filter(Boolean).join('\n')

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
        body: { type:'brand_voice_summary', prompt, userId: session.user.id }
      })
      if (fnErr) throw fnErr

      let result
      const text = fnData?.text || fnData?.result || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) result = JSON.parse(jsonMatch[0])
      else throw new Error('Kein JSON in der Antwort')

      const brandVoice = {
        ...E0,
        name: result.name || (name + ' LinkedIn Brand Voice'),
        brand_name: company || name,
        personality: result.personality || '',
        tone_attributes: result.tone_attributes || [],
        formality: result.formality || 'du',
        word_choice: result.word_choice || '',
        sentence_style: result.sentence_style || '',
        dos: result.dos || '',
        donts: result.donts || '',
        ai_summary: result.ai_summary || '',
        example_texts: examples || '',
        tonality: result.tonality || {},
        vocabulary: result.vocabulary || [],
        linkedin_style: result.linkedin_style || {},
        user_id: session.user.id,
      }

      const { data: saved, error: saveErr } = await supabase.from('brand_voices').insert(brandVoice).select().single()
      if (saveErr) throw saveErr
      onDone(saved)
    } catch (err) {
      setError(err.message || 'Fehler bei der Generierung')
    } finally { setGen(false) }
  }

  const stepStyle = (n) => ({ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, background: step>=n ? P : '#eee', color: step>=n ? '#fff' : '#aaa', transition:'all .2s' })

  return (
    <div style={{ maxWidth:560, margin:'0 auto', padding:'24px 0' }}>
      <div style={{ textAlign:'center', marginBottom:24 }}>
        <div style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>✨ KI-Schnellstart</div>
        <div style={{ fontSize:13, color:'#888' }}>3 Schritte zu deiner LinkedIn Brand Voice</div>
        <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:12 }}>
          {[1,2,3].map(n => <div key={n} style={stepStyle(n)}>{n}</div>)}
        </div>
      </div>

      {step===1 && (
        <Sc t="Schritt 1: Wer bist du?" ch={<>
          <Lb l="Name" /><In v={name} fn={setName} ph="Dein vollständiger Name"/>
          <Lb l="Position / Headline" /><In v={position} fn={setPos} ph="z.B. Head of Marketing"/>
          <Lb l="Unternehmen" /><In v={company} fn={setCo} ph="Firmenname"/>
          <Lb l="Über dich (optional)" /><Tx v={bio} fn={setBio} r={3} ph="Kurze Bio oder LinkedIn-Zusammenfassung"/>
          <button onClick={()=>setStep(2)} disabled={!name.trim()} style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', opacity:name.trim()?1:.5, marginTop:8 }}>
            Weiter →
          </button>
        </>}/>
      )}

      {step===2 && (
        <Sc t="Schritt 2: Wie klingt dein Stil?" ch={<>
          {SLIDERS.map(s => <StyleSlider key={s.key} label={s.key} left={s.left} right={s.right} value={sliders[s.key]} onChange={v=>setSlider(s.key,v)}/>)}
          <Lb l="Dein LinkedIn-Ziel" />
          <select value={goal} onChange={e=>setGoal(e.target.value)} style={{ width:'100%', padding:'8px 11px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:13 }}>
            {GOALS.map(g => <option key={g}>{g}</option>)}
          </select>
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={()=>setStep(1)} style={{ padding:'10px 24px', background:'#f5f5f5', border:'none', borderRadius:8, fontSize:14, cursor:'pointer' }}>← Zurück</button>
            <button onClick={()=>setStep(3)} style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' }}>Weiter →</button>
          </div>
        </>}/>
      )}

      {step===3 && (
        <Sc t="Schritt 3: Beispieltexte (optional)" ch={<>
          <Lb l="Eigene Texte" h="LinkedIn-Posts, Artikel — KI lernt deinen Stil daraus"/>
          <Tx v={examples} fn={setEx} r={6} ph="Füge hier 1-3 eigene LinkedIn-Posts ein..."/>
          {error && <div style={{ color:'#e53e3e', fontSize:12 }}>{error}</div>}
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={()=>setStep(2)} style={{ padding:'10px 24px', background:'#f5f5f5', border:'none', borderRadius:8, fontSize:14, cursor:'pointer' }}>← Zurück</button>
            <button onClick={generate} disabled={generating} style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', opacity:generating?.6:1 }}>
              {generating ? '⏳ KI generiert...' : '✨ Brand Voice generieren'}
            </button>
          </div>
        </>}/>
      )}

      <div style={{ textAlign:'center', marginTop:16 }}>
        <button onClick={onSkip} style={{ background:'none', border:'none', color:'#888', cursor:'pointer', fontSize:12, textDecoration:'underline' }}>
          + Manuell erstellen
        </button>
      </div>
    </div>
  )
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function BrandVoice({ session }) {
  const { team } = useTeam()
  const [voices, setVoices]   = useState([])
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [view, setView]       = useState('list')    // list | wizard | editor
  const [edit, setEdit]       = useState(null)
  const [tab, setTab]         = useState('marke')
  const [genSummary, setGenSummary] = useState(false)

  useEffect(() => { loadVoices() }, [session])

  async function loadVoices() {
    setLoading(true)
    const { data } = await supabase.from('brand_voices').select('*')
      .or(`user_id.eq.${session.user.id},is_shared.eq.true`)
      .order('created_at', { ascending: false })
    setVoices(data || [])
    setLoading(false)
  }

  async function saveVoice() {
    const { id, created_at, ...rest } = edit
    rest.updated_at = new Date().toISOString()
    // Ensure new fields have proper types
    if (!rest.tonality || typeof rest.tonality !== 'object') rest.tonality = {}
    if (!Array.isArray(rest.vocabulary)) rest.vocabulary = []
    if (!Array.isArray(rest.glossary)) rest.glossary = []
    if (!rest.linkedin_style || typeof rest.linkedin_style !== 'object') rest.linkedin_style = {}

    if (id) {
      await supabase.from('brand_voices').update(rest).eq('id', id)
    } else {
      rest.user_id = session.user.id
      await supabase.from('brand_voices').insert(rest)
    }
    await loadVoices()
    setView('list')
    setEdit(null)
  }

  async function activate(id) {
    await supabase.from('brand_voices').update({ is_active:false }).eq('user_id', session.user.id)
    await supabase.from('brand_voices').update({ is_active:true }).eq('id', id)
    loadVoices()
  }

  async function deleteVoice(id) {
    if (!confirm('Brand Voice wirklich löschen?')) return
    await supabase.from('brand_voices').delete().eq('id', id)
    loadVoices()
  }

  async function shareBrandVoiceWithTeam(id) {
    if (!team) return
    await supabase.from('brand_voices').update({ is_shared: true, team_id: team.id }).eq('id', id)
    loadVoices()
  }

  async function generateSummary() {
    if (!edit) return
    setGenSummary(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate', {
        body: { type:'brand_voice_summary', prompt: JSON.stringify(edit), userId: session.user.id }
      })
      if (!error && data) {
        const text = data.text || data.result || ''
        setEdit(prev => ({ ...prev, ai_summary: text }))
      }
    } catch(e) { console.error(e) }
    setGenSummary(false)
  }

  function u(field, val) { setEdit(prev => ({...prev, [field]:val})) }
  function uMulti(updates) { setEdit(prev => ({...prev, ...updates})) }
  function uTonality(arr) { 
    const obj = {}; arr.forEach(t => { obj[t.label] = t.value }); 
    setEdit(prev => ({...prev, tonality: obj})) 
  }
  function uLinkedIn(field, val) { setEdit(prev => ({...prev, linkedin_style: {...(prev.linkedin_style||{}), [field]:val}})) }

  // Parse tonality object to array for the editor
  const tonalityArr = edit?.tonality && typeof edit.tonality === 'object' && !Array.isArray(edit.tonality)
    ? Object.entries(edit.tonality).map(([label, value]) => ({ label, value: Number(value) }))
    : TONALITY_DEFAULTS

  const tabBtn = (key, label) => (
    <button key={key} onClick={()=>setTab(key)}
      style={{ padding:'8px 16px', fontSize:13, fontWeight:tab===key?700:400, color:tab===key?P:'#888', borderBottom:tab===key?`2px solid ${P}`:'2px solid transparent', background:'none', border:'none', borderBottom:tab===key?`2.5px solid ${P}`:'2.5px solid transparent', cursor:'pointer' }}>
      {label}
    </button>
  )

  // ─── List View ────────────────────────────────────────────────
  if (view === 'list') return (
    <div style={{ maxWidth:840, margin:'0 auto', padding:'20px 16px' }}>
      <div style={{ display:'flex', justifyContent:'center', gap:12, marginBottom:24 }}>
        <button onClick={()=>setView('wizard')} style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' }}>
          ✨ KI-Schnellstart
        </button>
        <button onClick={()=>{ setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('marke') }}
          style={{ padding:'10px 24px', background:'var(--surface)', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:14, cursor:'pointer' }}>
          + Manuell erstellen
        </button>
      </div>

      {loading ? <div style={{textAlign:'center',color:'#888'}}>Laden...</div> : voices.length === 0 ? (
        <div style={{ textAlign:'center', color:'#888', padding:40 }}>
          Noch keine Brand Voice erstellt. Starte mit dem KI-Schnellstart!
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {voices.map(v => (
            <div key={v.id} style={{ background:'var(--surface)', borderRadius:12, border: v.is_active ? `2px solid ${P}` : '1.5px solid #e8ecf0', padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:16, fontWeight:700 }}>{v.name}</span>
                    {v.is_active && <span style={{ fontSize:10, background:'#e8f5e9', color:'#2e7d32', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>✓ Aktiv</span>}
                    {v.tonality && Object.keys(v.tonality).length > 0 && <span style={{ fontSize:10, background:'#e3f2fd', color:'#1565c0', padding:'2px 8px', borderRadius:10 }}>100% vollständig</span>}
                  </div>
                  {v.brand_name && <div style={{ fontSize:12, color:'#888', marginBottom:6 }}>💼 {v.brand_name}</div>}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                    {(v.tone_attributes||[]).slice(0,5).map((t,i) => (
                      <span key={i} style={{ padding:'2px 8px', borderRadius:7, fontSize:11, background:'rgba(49,90,231,0.07)', color:P, fontWeight:500 }}>{t}</span>
                    ))}
                  </div>
                  {v.ai_summary && <div style={{ fontSize:12, color:'#666', lineHeight:1.4 }}>{v.ai_summary.slice(0,180)}{v.ai_summary.length>180?'…':''}</div>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginLeft:12 }}>
                  <button onClick={()=>{ setEdit(v); setView('editor'); setTab('marke') }} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #dde3ea', background:'var(--surface)', fontSize:12, cursor:'pointer' }}>Bearbeiten</button>
                  {!v.is_active && <button onClick={()=>activate(v.id)} style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${P}`, background:`rgba(49,90,231,0.08)`, color:P, fontSize:12, cursor:'pointer' }}>Aktivieren</button>}
                  {team && <button onClick={async()=>{
                    if(v.is_shared){await supabase.from('brand_voices').update({team_id:null,is_shared:false}).eq('id',v.id);setVoices(p=>p.map(bv=>bv.id===v.id?{...bv,is_shared:false,team_id:null}:bv))}
                    else{await shareBrandVoiceWithTeam(v.id);setVoices(p=>p.map(bv=>bv.id===v.id?{...bv,is_shared:true,team_id:team.id}:bv))}
                  }} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #dde3ea', background:v.is_shared?'rgba(16,185,129,0.08)':'#fff', fontSize:12, cursor:'pointer' }}>
                    {v.is_shared ? `👥 ${team.name}` : '👤 Teilen'}
                  </button>}
                  <button onClick={()=>deleteVoice(v.id)} style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#991B1B', fontSize:12, cursor:'pointer' }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ─── Wizard View ──────────────────────────────────────────────
  if (view === 'wizard') return (
    <QuickSetup session={session} onDone={(saved) => { loadVoices(); setEdit(saved); setView('editor'); setTab('marke') }} onSkip={() => { setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('marke') }}/>
  )

  // ─── Editor View ──────────────────────────────────────────────
  if (!edit) return null
  const ls = edit.linkedin_style || {}

  return (
    <div style={{ maxWidth:840, margin:'0 auto', padding:'20px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer' }}>←</button>
        <span style={{ fontSize:18, fontWeight:700 }}>Brand Voice bearbeiten</span>
        <span style={{ fontSize:12, color:'#888' }}>Persönlicher Kommunikationsstil für alle LinkedIn-Inhalte</span>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <input value={edit.name||''} onChange={e=>u('name',e.target.value)} placeholder="Brand Voice Name"
          style={{ flex:1, padding:'10px 14px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:15, fontWeight:600 }}/>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#666' }}>
          <input type="checkbox" checked={edit.is_active} onChange={e=>u('is_active',e.target.checked)}/> Aktiv
        </label>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, borderBottom:'1.5px solid #eee', marginBottom:16 }}>
        {tabBtn('marke','Marke')}
        {tabBtn('tonalitaet','Tonalität')}
        {tabBtn('sprache','Sprache')}
        {tabBtn('import','Kontext-Import')}
        {tabBtn('summary','AI Summary')}
      </div>

      {/* ── Tab: Marke ─────────────────────────────────── */}
      {tab==='marke' && <>
        <Sc t="Markenidentität" ch={<>
          <Lb l="Markenname"/><In v={edit.brand_name} fn={v=>u('brand_name',v)} ph="z.B. entrenous GmbH"/>
          <Lb l="Hintergrund" h="Was macht dein Unternehmen?"/><Tx v={edit.brand_background} fn={v=>u('brand_background',v)} r={3} ph="Kurze Beschreibung deines Unternehmens..."/>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1 }}><Lb l="Mission"/><Tx v={edit.mission} fn={v=>u('mission',v)} r={2} ph="Wofür steht ihr?"/></div>
            <div style={{ flex:1 }}><Lb l="Vision"/><Tx v={edit.vision} fn={v=>u('vision',v)} r={2} ph="Wo wollt ihr hin?"/></div>
          </div>
          <Lb l="Werte"/><In v={edit.values} fn={v=>u('values',v)} ph="z.B. Empathie, Diversität, Innovation"/>
        </>}/>
        <Sc t="Persönlichkeit" ch={<>
          <Lb l="Beschreibung" h="Wie würdest du deinen Kommunikationsstil beschreiben?"/>
          <Tx v={edit.personality} fn={v=>u('personality',v)} r={3} ph="z.B. Pragmatischer Marketing-Technologe, der Wissen teilt..."/>
          <Lb l="Ton-Attribute (3-6 wählen)"/>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {TONES.map(t => {
              const sel = (edit.tone_attributes||[]).includes(t)
              return <button key={t} onClick={()=>u('tone_attributes', sel ? (edit.tone_attributes||[]).filter(x=>x!==t) : [...(edit.tone_attributes||[]),t])}
                style={{ padding:'5px 12px', borderRadius:20, border: sel?`1.5px solid ${P}`:'1.5px solid #dde3ea', background:sel?P:'#fff', color:sel?'#fff':'#666', fontSize:12, cursor:'pointer', fontWeight:sel?600:400 }}>
                {t}
              </button>
            })}
          </div>
        </>}/>
      </>}

      {/* ── Tab: Tonalität ─────────────────────────────── */}
      {tab==='tonalitaet' && <>
        <Sc t="Markentonalität" ch={<>
          <Lb l="Tonalitäts-Slider" h="Definiere die Intensität deiner Kommunikationsmerkmale (0-100%)"/>
          {tonalityArr.map((t,i) => (
            <TonalitySlider key={i} label={t.label} value={t.value}
              onChange={v => { const arr=[...tonalityArr]; arr[i]={...arr[i],value:v}; uTonality(arr) }}
              onLabelChange={l => { const arr=[...tonalityArr]; arr[i]={...arr[i],label:l}; uTonality(arr) }}
              onRemove={() => { const arr=tonalityArr.filter((_,j)=>j!==i); uTonality(arr) }}/>
          ))}
          <button onClick={()=>uTonality([...tonalityArr, {label:'Neu',value:50}])}
            style={{ padding:'5px 12px', background:'none', border:'1.5px dashed #dde3ea', borderRadius:6, fontSize:12, color:'#888', cursor:'pointer' }}>
            + Tonalität hinzufügen
          </button>
        </>}/>
        <Sc t="Wortschatz" ch={<>
          <Lb l="Keywords & Schlüsselbegriffe" h="Begriffe die in deinen Inhalten vorkommen sollen"/>
          <VocabularyChips items={edit.vocabulary||[]} onChange={v=>u('vocabulary',v)}/>
        </>}/>
        <Sc t="Glossar" ch={<>
          <Lb l="Fachbegriffe & Definitionen" h="Stelle sicher, dass deine Begriffe korrekt verwendet werden"/>
          <GlossaryEditor items={edit.glossary||[]} onChange={v=>u('glossary',v)}/>
        </>}/>
      </>}

      {/* ── Tab: Sprache ───────────────────────────────── */}
      {tab==='sprache' && <>
        <Sc t="Ansprache" ch={<>
          <Lb l="Förmlichkeit"/>
          <div style={{ display:'flex', gap:8 }}>
            {FORM.map(f => (
              <button key={f.v} onClick={()=>u('formality',f.v)}
                style={{ flex:1, padding:'10px 12px', borderRadius:8, border: edit.formality===f.v ? `2px solid ${P}` : '1.5px solid #dde3ea', background: edit.formality===f.v ? 'rgba(49,90,231,0.06)':'#fff', cursor:'pointer', textAlign:'left' }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{f.l}</div>
                <div style={{ fontSize:11, color:'#888' }}>{f.d}</div>
              </button>
            ))}
          </div>
        </>}/>
        <Sc t="Sprach-Richtlinien" ch={<>
          <Lb l="Wortwahl" h="Welche Wörter bevorzugst du, was vermeidest du?"/>
          <Tx v={edit.word_choice} fn={v=>u('word_choice',v)} r={2} ph="z.B. Klare Fachbegriffe aus Marketing-Tech, verständlich erklärt..."/>
          <Lb l="Satzstruktur"/>
          <Tx v={edit.sentence_style} fn={v=>u('sentence_style',v)} r={2} ph="z.B. Mittellange, gut verdauliche Sätze..."/>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1 }}>
              <Lb l="✅ Dos"/>
              <Tx v={edit.dos} fn={v=>u('dos',v)} r={3} ph="- Praxisbeispiele teilen&#10;- Messbare Ergebnisse nennen&#10;- Zum Dialog einladen"/>
            </div>
            <div style={{ flex:1 }}>
              <Lb l="❌ Don'ts"/>
              <Tx v={edit.donts} fn={v=>u('donts',v)} r={3} ph="- Keine Verkaufs-Pitches&#10;- Nicht akademisch werden&#10;- Keine Selbstbeweihräucherung"/>
            </div>
          </div>
        </>}/>
        <Sc t="LinkedIn-Stil" ch={<>
          <Lb l="Bevorzugter Hook-Stil" h="Wie beginnst du typischerweise deine LinkedIn-Posts?"/>
          <Dd v={ls.hook_style} fn={v=>uLinkedIn('hook_style',v)} opts={HOOK_OPTIONS} ph="Hook-Stil wählen..."/>
          <Lb l="Call-to-Action Stil"/>
          <Dd v={ls.cta_style} fn={v=>uLinkedIn('cta_style',v)} opts={CTA_OPTIONS} ph="CTA-Stil wählen..."/>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1 }}>
              <Lb l="Emoji-Nutzung"/>
              <Dd v={ls.emoji_usage} fn={v=>uLinkedIn('emoji_usage',v)} opts={EMOJI_OPTIONS} ph="Emojis..."/>
            </div>
            <div style={{ flex:1 }}>
              <Lb l="Hashtag-Strategie"/>
              <Dd v={ls.hashtag_usage} fn={v=>uLinkedIn('hashtag_usage',v)} opts={HASHTAG_OPTIONS} ph="Hashtags..."/>
            </div>
          </div>
        </>}/>
      </>}

      {/* ── Tab: Kontext-Import ────────────────────────── */}
      {tab==='import' && <>
        <Sc t="📥 Kontext importieren" ch={<>
          <Lb l="Datei oder Website" h="Lade Brand-Dokumente (PDF, Excel, CSV, Bilder) hoch oder importiere Website-Texte"/>
          <KnowledgeImporter
            session={session}
            storagePrefix="brand-voice"
            showLinkedIn={false}
            current={edit}
            onMetaChange={uMulti}
            onContentExtracted={(text) => u('imported_context', (edit.imported_context ? edit.imported_context+'\n\n---\n\n' : '')+text)}
          />
        </>}/>
        <Sc t="Importierter Kontext" ch={<>
          <Lb l="Extrahierter Text" h="Fließt automatisch in KI-Generierungen ein"/>
          <Tx v={edit.imported_context} fn={v=>u('imported_context',v)} r={10} ph="Noch kein Kontext importiert. Datei hochladen oder URL angeben..."/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text-soft)'}}>
            <span>{(edit.imported_context||'').length.toLocaleString()} Zeichen</span>
          </div>
        </>}/>
      </>}

      {/* ── Tab: AI Summary ────────────────────────────── */}
      {tab==='summary' && <>
        <Sc t="Brand Voice Summary" ch={<>
          <Lb l="AI Summary" h="Wird automatisch in alle KI-Aufrufe eingebaut"/>
          {edit.ai_summary ? (
            <Tx v={edit.ai_summary} fn={v=>u('ai_summary',v)} r={8}/>
          ) : (
            <div style={{ color:'#F59E0B', fontSize:11, fontWeight:600 }}>⚠️ Noch keine KI-Summary — im Editor generieren</div>
          )}
          <div style={{ fontSize:11, color:'#888', background:'#FFFBEB', padding:'8px 12px', borderRadius:8, marginTop:4 }}>
            💡 Diese Summary ist der Kern deiner Brand Voice — je präziser, desto authentischer die KI-Texte.
          </div>
          <button onClick={generateSummary} disabled={genSummary} style={{ padding:'8px 16px', background:'#7C3AED', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', opacity:genSummary?.6:1, marginTop:4 }}>
            {genSummary ? '⏳ Generiert...' : '🔄 Neu generieren'}
          </button>
        </>}/>
        <Sc t="Beispieltexte für KI-Analyse" ch={<>
          <Lb l="Eigene Texte" h="LinkedIn-Posts, Artikel — KI lernt deinen Stil daraus"/>
          <Tx v={edit.example_texts} fn={v=>u('example_texts',v)} r={6} ph="Füge hier eigene LinkedIn-Posts ein..."/>
        </>}/>
      </>}

      {/* ── Footer Buttons ───────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:20, paddingBottom:20 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ padding:'10px 24px', background:'none', border:'none', fontSize:14, cursor:'pointer', color:'#888' }}>Abbrechen</button>
        <button onClick={saveVoice} style={{ padding:'10px 28px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' }}>
          💾 Brand Voice speichern
        </button>
      </div>
    </div>
  )
}
