import { useTranslation } from 'react-i18next'
import React, { useEffect, useState } from 'react'
import { useLocalStorageState, clearDraftsByPrefix } from '../lib/useLocalStorageState'
import { useTabPersistedState, clearTabPersistedKey } from '../lib/useTabPersistedState'
import { useTeam } from '../context/TeamContext'
import GenerationLoading from '../components/GenerationLoading'
import { AlertTriangle, BarChart3, Briefcase, Building2, Download, FileText, Lightbulb, Loader2, MessageCircle, MessageSquare, Palette, PartyPopper, PenLine, Plus, RefreshCw, Save, Sparkles, ThumbsDown, ThumbsUp, Trash2, Upload, X } from 'lucide-react'
import { LinkedinIcon } from '../components/icons'
import { getActiveLinkedInIdentity } from '../lib/leadeskExtension'
import { supabase } from '../lib/supabase'
import { resizeImageBeforeUpload } from '../lib/imageResize'
import KnowledgeImporter from '../components/KnowledgeImporter'
import SharingPicker from '../components/SharingPicker'
import EmptyHero from '../components/EmptyHero'
import SectionCard from '../components/SectionCard'
import WizardLayout from '../components/WizardLayout'
import TabBar from '../components/TabBar'
import { useModel } from '../context/ModelContext'

const P = 'var(--wl-primary, rgb(49,90,231))'

// ─── Konstanten ───────────────────────────────────────────────────────────────
const TONES = ['Professionell','Freundlich','Direkt','Inspirierend','Humorvoll','Empathisch','Analytisch','Motivierend','Authentisch','Kreativ','Sachlich','Leidenschaftlich','Mutig','Klar','Visionär']
const FORM  = [{v:'du',l:'Du-Form',d:'Persönlich & nahbar'},{v:'sie',l:'Sie-Form',d:'Formell & distanziert'},{v:'mixed',l:'Gemischt',d:'Je nach Kontext'}]
const GOALS = ['Neue Leads generieren','Netzwerk aufbauen','Thought Leadership etablieren','Recruiting & Employer Branding','Persönliche Marke aufbauen','Produkt / Dienstleistung vermarkten']

const SLIDERS = [
  { key:'Authentisch',  default:70, hint:'Persönlich, ehrlich, ungeschminkt' },
  { key:'Direkt',       default:60, hint:'Klar, ohne Umschweife, präzise' },
  { key:'Inspirierend', default:55, hint:'Motivierend, energiegeladen, zukunftsorientiert' },
  { key:'Strategisch',  default:65, hint:'Analytisch, fundiert, denkt langfristig' },
  { key:'Empathisch',   default:50, hint:'Mitfühlend, versteht den Leser, warm' },
]

const TONALITY_DEFAULTS = [
  { label:'Authentisch', value:80 },
  { label:'Direkt',      value:70 },
  { label:'Inspirierend',value:60 },
  { label:'Strategisch', value:75 },
  { label:'Empathisch',  value:50 },
]

const EMOJI_OPTIONS = ['Keine Emojis','Minimal (1-2 pro Beitrag)','Gelegentlich','Reichlich']
const HOOK_OPTIONS = ['Provokante Frage','Persönliche Geschichte','Überraschende Statistik','Direkte Aussage','Kontroverse These']
const CTA_OPTIONS = ['Frage ans Netzwerk','Zum Kommentieren einladen','Link/Ressource teilen','Zum Nachdenken anregen','Call-to-Action vermeiden']

const E0 = {name:'',is_active:true,brand_name:'',brand_background:'',mission:'',vision:'',values:'',personality:'',tone_attributes:[],word_choice:'',sentence_style:'',grammar_style:'',jargon_level:'mixed',voice_style:'active',formality:'du',dos:'',donts:'',target_audience:'',example_texts:'',ai_summary:'',tonality:{},vocabulary:[],glossary:[],linkedin_style:{},imported_context:'',file_name:'',file_url:'',file_type:'',source_url:''}

// ─── Helper-Komponenten ────────────────────────────────────────────────────────
// ─── Premium-Form-Primitives (lokal) ────────────────────────────────
function In({v,fn,ph,style={},type='text',disabled}) {
  const [focused, setFocused] = useState(false)
  return <input
    type={type} value={v||''} disabled={disabled}
    onChange={e=>fn(e.target.value)} placeholder={ph}
    onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
    style={{ width:'100%', padding:'11px 14px',
      border:'1.5px solid '+(focused?'var(--wl-primary, rgb(49,90,231))':'var(--border, #E5E7EB)'),
      borderRadius:10, fontSize:13.5, boxSizing:'border-box', outline:'none',
      background:'var(--surface, #fff)', color:'var(--text-primary, rgb(20,20,43))',
      boxShadow: focused ? '0 0 0 3px rgba(49,90,231,.10)' : 'none',
      transition:'border-color .15s, box-shadow .15s',
      fontFamily:'inherit', opacity: disabled?.6:1, ...style }}/>
}

function Tx({v,fn,r=3,ph,disabled}) {
  const [focused, setFocused] = useState(false)
  return <textarea
    value={v||''} disabled={disabled}
    onChange={e=>fn(e.target.value)} rows={r} placeholder={ph}
    onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
    style={{ width:'100%', padding:'11px 14px',
      border:'1.5px solid '+(focused?'var(--wl-primary, rgb(49,90,231))':'var(--border, #E5E7EB)'),
      borderRadius:10, fontSize:13.5, lineHeight:1.55, resize:'vertical',
      boxSizing:'border-box', outline:'none',
      background:'var(--surface, #fff)', color:'var(--text-primary, rgb(20,20,43))',
      boxShadow: focused ? '0 0 0 3px rgba(49,90,231,.10)' : 'none',
      transition:'border-color .15s, box-shadow .15s',
      fontFamily:'inherit', opacity: disabled?.6:1 }}/>
}

const Lb = ({l,h}) => (
  <div style={{marginBottom:12}}>
    <div style={{fontSize:11.5,fontWeight:700,color:'var(--text-muted, #6B7280)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>{l}</div>
    {h&&<div style={{fontSize:12,color:'var(--text-soft, #9CA3AF)',lineHeight:1.5}}>{h}</div>}
  </div>
)

const Sc = ({t,ch}) => (
  <section style={{
    width:'100%',
    boxSizing:'border-box',
    background:'var(--surface, #fff)',
    borderRadius:14,
    border:'1px solid var(--border, #E5E7EB)',
    marginBottom:16,
    overflow:'hidden',
    boxShadow:'0 1px 3px rgba(15,23,42,.04)'
  }}>
    <header style={{padding:'14px 20px',borderBottom:'1px solid var(--border-soft, #F1F5F9)',fontWeight:700,fontSize:14,color:'var(--text-primary)',letterSpacing:'-.1px'}}>{t}</header>
    <div style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:14}}>{ch}</div>
  </section>
)

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

// ─── Stil-Slider (für Wizard) ───────────────────────────────────────
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

// ─── Brand-Voice-Wizard ───────────────────────────────────────────────────
function QuickSetup({ session, onDone, onSkip }) {
  const uid = session.user.id
  const { activeTeamId } = useTeam()
  const [step, setStep, clearStep] = useLocalStorageState('bv_w_step_'+uid, 0)
  const { model: selectedModel, setModel: setSelectedModel } = useModel()
  const [name, setName, clearName]       = useLocalStorageState('bv_w_name_'+uid, '')
  const [position, setPos, clearPos]     = useLocalStorageState('bv_w_position_'+uid, '')
  const [company, setCo, clearCo]        = useLocalStorageState('bv_w_company_'+uid, '')
  const [offering, setOffering, clearOff]= useLocalStorageState('bv_w_offering_'+uid, '')
  const [motivation, setMotivation, clearMot] = useLocalStorageState('bv_w_motivation_'+uid, '')
  const [goal, setGoal, clearGoal]       = useLocalStorageState('bv_w_goal_'+uid, GOALS[0])
  const [examples, setEx, clearEx]       = useLocalStorageState('bv_w_examples_'+uid, '')
  const [sliders, setSliders, clearSl]   = useLocalStorageState('bv_w_sliders_'+uid, Object.fromEntries(SLIDERS.map(s => [s.key, s.default])))
  const [generating, setGen]  = useState(false)
  const [error, setError]     = useState('')
  const [importData, setImportData, clearImp] = useLocalStorageState('bv_w_importData_'+uid, {file_name:'',file_url:'',file_type:'',source_url:''})
  const [importedText, setImportedText, clearTxt] = useLocalStorageState('bv_w_importedText_'+uid, '')
  const [prefilling, setPrefilling] = useState(false)
  const [prefillError, setPrefillError] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('full_name,headline,company,bio').eq('id', session.user.id).single()
      .then(({ data }) => {
        if (!data) return
        // Nur ueberschreiben wenn der aktuelle State (aus localStorage) leer ist —
        // sonst bleibt was der User schon eingegeben hat erhalten.
        setName(prev => prev || data.full_name || '')
        setPos(prev => prev || data.headline || '')
        setCo(prev => prev || data.company || '')
        if (data.bio) setOffering(prev => prev || data.bio)
      })
  }, [])

  function setSlider(key, val) { setSliders(s => ({...s, [key]:val})) }

  function handleMetaChange(updates){
    const next = { ...updates }
    if (updates.linkedin_template_url && !updates.linkedin_url) {
      next.linkedin_url = updates.linkedin_template_url
    }
    setImportData(prev=>({...prev,...next}))
  }
  function handleContentExtracted(text){
    console.log('[Leadesk BV] handleContentExtracted called, chars=', text?.length, 'preview=', (text||'').slice(0,100))
    setImportedText(prev=>prev?(prev+'\n\n---\n\n'+text):text)
  }

  async function prefillFromContext() {
    if (!importedText) return
    setPrefilling(true); setPrefillError('')
    try {
      const prompt = [
        'Analysiere den folgenden Kontext über eine Person oder ein Unternehmen.',
        'Extrahiere die folgenden Informationen:',
        '- name (string): Vor- und Nachname',
        '- position (string): berufliche Position/Headline',
        '- company (string): Firmenname',
        '- offering (string, 1-3 Sätze, Ich-Form): Was die Person/Firma anbietet, fuer welche Probleme, welche Methoden — moeglichst konkret mit Outcomes',
        '- motivation (string, 1-3 Sätze, Ich-Form): Warum macht die Person/Firma das, welche Vision, welche Werte stehen dahinter',
        '',
        '- tonality (object mit fünf Integer-Werten 0-100, Prozent): Wie stark ist jede dieser fünf Tonalitäts-Dimensionen ausgeprägt?',
        '  * Authentisch:  Persönlich, ehrlich, ungeschminkt',
        '  * Direkt:       Klar, ohne Umschweife, präzise',
        '  * Inspirierend: Motivierend, energiegeladen, zukunftsorientiert',
        '  * Strategisch:  Analytisch, fundiert, denkt langfristig',
        '  * Empathisch:   Mitfühlend, versteht den Leser, warm',
        '  Schätze die Intensität jeder Dimension auf einer Skala 0-100% aus Wortwahl, Themen, Tonalität und Branche im Kontext ein.',
        '',
        '- goal (string, GENAU einer dieser Werte): "Neue Leads generieren" | "Netzwerk aufbauen" | "Thought Leadership etablieren" | "Recruiting & Employer Branding" | "Persönliche Marke aufbauen" | "Produkt / Dienstleistung vermarkten"',
        '  Wähle das Ziel, das am besten zur erkennbaren LinkedIn-Strategie passt.',
        '',
        'WICHTIG für deine Analyse: Der Kontext kann mehrere Sections aus einem LinkedIn-Profil enthalten — INFO-BOX, BERUFSERFAHRUNG, AUSBILDUNG, KENNTNISSE & FÄHIGKEITEN, SPRACHEN, LIZENZEN, FEATURED, EHRENAMT, AUSZEICHNUNGEN, AKTIVITÄTEN/LINKEDIN-BEITRÄGE. Werte ALLE Sections aus, nicht nur die Info-Box:',
        '  * AKTIVITÄTEN/BEITRÄGE sind dein bester Stil-Signal — die zeigen tatsächliche Sprache, Hooks, CTAs und Themen-Schwerpunkte.',
        '  * KENNTNISSE & BERUFSERFAHRUNG sagen dir wie fachlich/technisch (technical) und wie etabliert (serious) die Person kommuniziert.',
        '  * Die Berufsgeschichte (Senioritätsgrad, Branchen-Mix) zeigt dir formal vs locker und Tiefe vs Breite des Inhalts.',
        '',
        'Antworte NUR mit diesem JSON, ohne Kommentar oder Markdown:',
        '{"name":"","position":"","company":"","offering":"","motivation":"","tonality":{"Authentisch":70,"Direkt":60,"Inspirierend":55,"Strategisch":65,"Empathisch":50},"goal":"Neue Leads generieren"}',
        '',
        '## Kontext:',
        importedText.slice(0, 25000)
      ].join('\n')
      const { data, error } = await supabase.functions.invoke('generate', {
        body: { type: 'brand_voice_summary', prompt, userId: session.user.id }
      })
      if (error) throw error
      const text = data?.text || data?.result || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const r = JSON.parse(match[0])
        // WICHTIG: hart UEBERSCHREIBEN — auch wenn LLM ein Feld leer/nicht
        // zurueckliefert. Sonst leakt das beim Mount vorgeladene User-Profil
        // (z.B. Julians 'Leadesk' als Unternehmen) in eine Brand Voice die
        // eigentlich fuer eine andere Person/Firma erstellt werden soll.
        setName(typeof r.name === 'string' ? r.name : '')
        setPos(typeof r.position === 'string' ? r.position : '')
        setCo(typeof r.company === 'string' ? r.company : '')
        setOffering(typeof r.offering === 'string' ? r.offering : '')
        setMotivation(typeof r.motivation === 'string' ? r.motivation : '')
        // Tonalitaets-Slider aus Kontext: 0-100 Skala (matched Editor)
        if (r.tonality && typeof r.tonality === 'object') {
          const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n))))
          setSliders(prev => ({
            ...prev,
            ...(Number.isFinite(Number(r.tonality.Authentisch))  ? { Authentisch:  clamp(r.tonality.Authentisch) }  : {}),
            ...(Number.isFinite(Number(r.tonality.Direkt))       ? { Direkt:       clamp(r.tonality.Direkt) }       : {}),
            ...(Number.isFinite(Number(r.tonality.Inspirierend)) ? { Inspirierend: clamp(r.tonality.Inspirierend) } : {}),
            ...(Number.isFinite(Number(r.tonality.Strategisch))  ? { Strategisch:  clamp(r.tonality.Strategisch) }  : {}),
            ...(Number.isFinite(Number(r.tonality.Empathisch))   ? { Empathisch:   clamp(r.tonality.Empathisch) }   : {}),
          }))
        }
        // LinkedIn-Ziel: exakter Match gegen GOALS, sonst Fuzzy-Match
        if (typeof r.goal === 'string' && r.goal.trim()) {
          const incoming = r.goal.trim()
          const exact = GOALS.find(g => g === incoming)
          if (exact) {
            setGoal(exact)
          } else {
            const lower = incoming.toLowerCase()
            const fuzzy = GOALS.find(g => lower.includes(g.toLowerCase().split(' ')[0]))
            if (fuzzy) setGoal(fuzzy)
          }
        }
      }
      setStep(1)
    } catch(e) { setPrefillError('Fehler: ' + e.message) }
    finally { setPrefilling(false) }
  }

  async function generate() {
    if (!name.trim()) { setError('Bitte deinen Namen eingeben.'); return }
    setGen(true); setError('')
    try {
      const prompt = [
        'Erstelle eine vollständige Brand Voice für LinkedIn. Antworte NUR mit einem JSON-Objekt, ohne Kommentar.',
        '', '## Person', 'Name: ' + name,
        position ? 'Position: ' + position : '',
        company ? 'Unternehmen: ' + company : '',
        offering ? 'Was die Person/das Unternehmen anbietet (Angebot, Methoden, Outcomes):\n' + offering.slice(0,800) : '',
        motivation ? 'Motivation, Werte, Vision (Warum):\n' + motivation.slice(0,600) : '',
        '', '## Tonalität (vom User vorgegeben, 0-100%)',
        ...SLIDERS.map(s => s.key + ': ' + sliders[s.key] + '%'),
        'Diese Intensitäten BITTE in dein tonality-Feld übernehmen (gleiche Keys, ggf. minimal anpassen wenn der Kontext eindeutig andere Werte suggeriert).',
        '', '## LinkedIn-Ziel', goal,
        '', examples ? '## Eigene Texte als Stil-Referenz\n' + examples.slice(0,800) : '',
        '', importedText ? '## Importierter Kontext (LinkedIn-Profil-Sections, Dokumente, Website):\n' + importedText.slice(0,25000) : '',
        '',
        '## Erwartetes JSON-Format — ALLE Felder sind PFLICHT, kein Feld leer lassen:',
        JSON.stringify({
          name:'Meine Brand Voice',
          brand_background:'2-4 Sätze: Wer ist die Person/Marke, Kontext, Erfahrung, Background — auf Basis von Angebot, Position und Unternehmen',
          mission:'1-2 Sätze in 1. Person: konkrete Mission ("Ich helfe X dabei, Y zu erreichen, indem ich Z…")',
          vision:'1-2 Sätze: langfristiges Bild, wofür die Marke langfristig steht',
          values:'3-5 Werte komma-getrennt (z.B. "Klarheit, Pragmatismus, Verantwortung")',
          personality:'1-2 Sätze',
          tone_attributes:['Tag1','Tag2','Tag3','Tag4'],
          formality:'du ODER sie',
          word_choice:'1-2 Sätze: typischer Wortschatz, was vermieden wird',
          sentence_style:'1-2 Sätze: Satzlänge, Rhythmus, Strukturmerkmale',
          dos:'3 Dos mit "- " als Prefix, je 1 Zeile',
          donts:'3 Donts mit "- " als Prefix, je 1 Zeile. "- Keine Hashtags" MUSS immer dabei sein (LinkedIn-Best-Practice).',
          tonality:{Authentisch:80,Direkt:70,Inspirierend:60,Strategisch:75,Empathisch:50},
          vocabulary:['keyword1','keyword2','keyword3','keyword4','keyword5'],
          linkedin_style:{
            hook_style:'1-2 Sätze: Welche Art Hook (z.B. provokante These, persönliche Anekdote, konkrete Zahl)',
            cta_style:'1 Satz: bevorzugter CTA-Stil (z.B. offene Frage, konkrete Einladung, Soft-Push)',
            emoji_usage:'Minimal ODER Moderat ODER Reichlich — plus 1 Satz wie eingesetzt',
            structure_preference:'1 Satz: Lieblings-Post-Struktur (z.B. Hook → Story → Lesson → CTA)'
          },
          ai_summary:'150-200 Wörter System-Prompt in 2. Person, der die Voice auf den Punkt bringt'
        })
      ].filter(Boolean).join('\n')

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
        body: { type:'brand_voice_summary', prompt, userId: session.user.id, model: selectedModel }
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
        brand_background: result.brand_background || '',
        mission: result.mission || '',
        vision: result.vision || '',
        values: result.values || '',
        personality: result.personality || '',
        tone_attributes: result.tone_attributes || [],
        formality: result.formality || 'du',
        word_choice: result.word_choice || '',
        sentence_style: result.sentence_style || '',
        dos: result.dos || '',
        donts: (() => {
          let d = result.donts || ''
          if (!/keine\s*hashtags?/i.test(d)) {
            d = (d ? d.replace(/\s*$/, '') + '\n' : '') + '- Keine Hashtags'
          }
          return d
        })(),
        ai_summary: result.ai_summary || '',
        example_texts: examples || '',
        tonality: result.tonality || {},
        vocabulary: result.vocabulary || [],
        linkedin_style: result.linkedin_style || {},
        user_id: session.user.id,
        ...importData,
        imported_context: importedText || '',
      }

      // team_id mit-setzen — fix für team-id-filter regression
      if (!brandVoice.team_id && activeTeamId) brandVoice.team_id = activeTeamId
      const { data: saved, error: saveErr } = await supabase.from('brand_voices').insert(brandVoice).select().single()
      if (saveErr) throw saveErr
      clearDraftsByPrefix('bv_w_')
      onDone(saved)
    } catch (err) {
      setError(err.message || 'Fehler bei der Generierung')
    } finally { setGen(false) }
  }

  const WIZARD_STEPS = [
    { label: 'Kontext', sub: 'optional' },
    { label: 'Wer bist du?' },
    { label: 'Wie klingt dein Stil?' },
    { label: 'Beispieltexte', sub: 'optional' },
  ]

  return (
    <WizardLayout
      eyebrow="Branding · Schritt 1 von 3"
      title="Neue Brand Voice mit KI"
      subtitle="In ~2 Minuten zur ersten Voice. Du kannst alles danach noch verfeinern."
      steps={WIZARD_STEPS}
      currentStep={step + 1}
      onStepClick={(n) => setStep(n - 1)}
      onSkip={onSkip}
      onBack={onSkip}
    >

      {step===0 && (
        <Sc t="Schritt 1: Kontext importieren (optional)" ch={<>
          <Lb l="Dokument oder Website hochladen"
              h="KI analysiert den Inhalt und füllt deine Angaben automatisch vor — du kannst alles danach noch anpassen"/>
          <KnowledgeImporter
            session={session}
            storagePrefix="brand"
            showLinkedIn={true}
            current={{...importData, id:'wizard'}}
            onMetaChange={handleMetaChange}
            onContentExtracted={handleContentExtracted}
            disabled={prefilling}
          />
          {importedText && (
            <div style={{ fontSize:11, color:'#22c55e', background:'#f0fdf4', padding:'6px 10px', borderRadius:6, marginTop:4 }}>
              ✓ {importedText.length.toLocaleString()} Zeichen geladen — bereit zur Analyse
            </div>
          )}
          {prefillError && <div style={{ color:'#e53e3e', fontSize:12, marginTop:4 }}>{prefillError}</div>}
          <div style={{ display:'flex', gap:8, marginTop:12 }}>            {importedText && (
              <button onClick={prefillFromContext} disabled={prefilling}
                style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:prefilling?'not-allowed':'pointer', opacity:prefilling?.6:1 }}>
                {prefilling ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={14} className="lk-spin"/>Analysiere…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={14}/>Felder automatisch befüllen</span>}
              </button>
            )}
            <button onClick={()=>setStep(1)} disabled={prefilling}
              style={{ padding:'10px 24px', background:importedText?'#f5f5f5':P, color:importedText?'#555':'#fff', border:'none', borderRadius:8, fontSize:14, cursor:'pointer' }}>
              {importedText ? 'Weiter ohne Analyse →' : '→ Manuell ausfüllen'}
            </button>
          </div>
        </>}/>
      )}

      {step===1 && (
        <Sc t="Schritt 2: Wer bist du?" ch={<>
          <Lb l="Name" /><In v={name} fn={setName} ph="Dein vollständiger Name"/>
          <Lb l="Position / Headline" /><In v={position} fn={setPos} ph="z.B. Head of Marketing"/>
          <Lb l="Unternehmen" /><In v={company} fn={setCo} ph="Firmenname"/>
          <Lb l="Was bietest du an?" h="Konkrete Angebote, Methoden und Outcomes — je präziser, desto besser werden Hintergrund und Mission der Brand Voice"/>
          <Tx v={offering} fn={setOffering} r={3} ph="z.B. „Ich helfe B2B-SaaS-Gründern, ihre LinkedIn-Pipeline systematisch aufzubauen — durch klare Positionierung, wöchentlichen Content und ein wiederholbares Outreach-System. In den letzten 2 Jahren mit 40+ Founders gearbeitet."/>
          <Lb l="Was treibt dich an?" h="Mission, Vision, Werte — warum machst du das, wofür stehst du langfristig"/>
          <Tx v={motivation} fn={setMotivation} r={2} ph="z.B. „Ich glaube, dass die besten Operator unterschätzt werden, weil sie nicht laut genug sind. Klarheit schlägt Hype. Ich will, dass mehr substanzielle Stimmen auf LinkedIn gehört werden."/>
          <button onClick={()=>setStep(2)} disabled={!name.trim()} style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', opacity:name.trim()?1:.5, marginTop:8 }}>
            Weiter →
          </button>
        </>}/>
      )}

      {step===2 && (
        <Sc t="Schritt 3: Wie klingt dein Stil?" ch={<>
          {SLIDERS.map(s => (
            <div key={s.key} style={{ marginBottom: 14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                <label style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)' }}>{s.key}</label>
                <span style={{ fontSize:12, color:'var(--text-muted)' }}>{sliders[s.key]}%</span>
              </div>
              <input type="range" min={0} max={100} step={5}
                value={sliders[s.key]}
                onChange={e => setSlider(s.key, parseInt(e.target.value, 10))}
                style={{ width:'100%', accentColor:'var(--wl-primary, rgb(49,90,231))' }}/>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>{s.hint}</div>
            </div>
          ))}
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
        <Sc t="Schritt 4: Beispieltexte (optional)" ch={<>
          <Lb l="Eigene Texte" h="LinkedIn-Posts, Artikel — KI lernt deinen Stil daraus"/>
          <Tx v={examples} fn={setEx} r={6} ph="Füge hier 1-3 eigene LinkedIn-Posts ein..."/>
          {error && <div style={{ color:'#e53e3e', fontSize:12 }}>{error}</div>}
          {importedText && (
            <div style={{ fontSize:11, color:'#22c55e', background:'#f0fdf4', padding:'6px 10px', borderRadius:6 }}>
              ✓ {importedText.length.toLocaleString()} Zeichen Kontext aus Schritt 0 fließen in Generierung ein
            </div>
          )}
          {generating && <GenerationLoading title="Brand Voice wird gebaut" expectedSeconds={45} />}
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={()=>setStep(2)} disabled={generating} style={{ padding:'10px 24px', background:'#f5f5f5', border:'none', borderRadius:8, fontSize:14, cursor:generating?'not-allowed':'pointer', opacity:generating?.5:1 }}>← Zurück</button>
            <button onClick={generate} disabled={generating} style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', opacity:generating?.6:1 }}>
              {generating ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={14} className="lk-spin"/>KI generiert…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={14}/>Brand Voice generieren</span>}
            </button>
          </div>
        </>}/>
      )}

    </WizardLayout>
  )
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

// ─── Brand-Voice-Bilder ────────────────────────────────────────────────────
// Splittet in zwei Bereiche:
//   * Personen-Bilder (hero_image_paths)  — Headshots, Lifestyle-Aufnahmen
//   * CI-Bibliothek   (ci_image_paths)    — Logos, Favicons, CI-Materialien
// Beide werden bei jeder Bild-Generierung dieser BV automatisch als
// Stil-Referenzen mitgesendet (wenn der User in Visuals den BV-Toggle aktiv lässt).
//
// Storage: visuals-Bucket, Pfade '<team_id>/bv-hero/<bv_id>/<uuid>.ext'
//                                 '<team_id>/bv-ci/<bv_id>/<uuid>.ext'
function BVImagesEditor({ edit, u, session, activeTeamId, field, label, hint, icon, max, folder, fileLabel }) {
  const initial = Array.isArray(edit?.[field]) ? edit[field] : []
  const [paths, setPaths] = React.useState(initial)
  const [urls, setUrls] = React.useState({})
  const [uploading, setUploading] = React.useState(false)

  React.useEffect(() => {
    const next = Array.isArray(edit?.[field]) ? edit[field] : []
    setPaths(next)
  }, [edit?.[field]])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const nextUrls = {}
      for (const p of paths) {
        const { data } = await supabase.storage.from('visuals').createSignedUrl(p, 60 * 60 * 24)
        if (data?.signedUrl) nextUrls[p] = data.signedUrl
      }
      if (!cancelled) setUrls(nextUrls)
    })()
    return () => { cancelled = true }
  }, [paths])

  async function uploadImgs(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    if (!edit?.id) { alert('Bitte die Brand Voice zuerst speichern'); return }
    if (!activeTeamId) { alert('Kein Team aktiv — kann nicht hochladen'); return }
    const remaining = max - paths.length
    if (remaining <= 0) { alert(`Max ${max} ${fileLabel}`); return }
    let toUpload = files
    if (files.length > remaining) {
      alert(`Max ${max} ${fileLabel} — es werden nur die ersten ${remaining} hochgeladen`)
      toUpload = files.slice(0, remaining)
    }
    setUploading(true)
    const added = []
    try {
      for (let file of toUpload) {
        if (file.size > 20 * 1024 * 1024) { alert(`„${file.name}" zu groß (max 20 MB) — übersprungen`); continue }
        try { file = await resizeImageBeforeUpload(file, 1500, 0.85) } catch (e) { console.warn('[bv-img-resize]', e.message) }
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const safeExt = ['png','jpg','jpeg','webp','svg'].includes(ext) ? ext : 'jpg'
        const newPath = `${activeTeamId}/${folder}/${edit.id}/${crypto.randomUUID()}.${safeExt}`
        const { error: upErr } = await supabase.storage.from('visuals').upload(newPath, file, { contentType: file.type, upsert: false })
        if (upErr) { alert(`Upload „${file.name}" fehlgeschlagen: ` + upErr.message); continue }
        added.push(newPath)
      }
      if (added.length) {
        const nextPaths = [...paths, ...added]
        const { error: dbErr } = await supabase.from('brand_voices').update({ [field]: nextPaths }).eq('id', edit.id)
        if (dbErr) { alert('DB-Update fehlgeschlagen: ' + dbErr.message); return }
        setPaths(nextPaths)
        u(field, nextPaths)
      }
    } finally {
      setUploading(false)
    }
  }

  async function removeImg(idx) {
    if (!edit?.id) return
    const removed = paths[idx]
    const nextPaths = paths.filter((_, i) => i !== idx)
    const { error: dbErr } = await supabase.from('brand_voices').update({ [field]: nextPaths }).eq('id', edit.id)
    if (dbErr) { alert('DB-Update fehlgeschlagen: ' + dbErr.message); return }
    if (removed) await supabase.storage.from('visuals').remove([removed])
    setPaths(nextPaths)
    u(field, nextPaths)
  }

  return (
    <div style={{ padding:'12px 14px', background:'#FAFAFA', border:'1.5px solid var(--border)', borderRadius:10, flex:'1 1 320px', minWidth:280 }}>
      <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.5, marginBottom:10 }}>
        {hint}
      </div>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        {paths.map((p, i) => (
          <div key={p} style={{ position:'relative', width:72, height:72 }}>
            {urls[p] ? (
              <img src={urls[p]} alt="img" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:8, border:'1px solid var(--border)', background:'#fff' }}/>
            ) : (
              <div style={{ width:'100%', height:'100%', borderRadius:8, background:'#E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'var(--text-muted)' }}><Loader2 size={14} className="lk-spin"/></div>
            )}
            <button type="button" onClick={() => removeImg(i)}
              style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', border:'none', background:'#ef4444', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', lineHeight:1 }}><X size={14} strokeWidth={1.75}/></button>
          </div>
        ))}
        {paths.length < max && (
          <label style={{ width:72, height:72, borderRadius:8, border:'1.5px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor: uploading ? 'wait' : 'pointer', flexDirection:'column', gap:2, fontSize:11, color:'var(--text-muted)', background:'#fff' }}>
            {uploading ? <Loader2 size={14} className="lk-spin"/> : <Plus size={14}/>}
            <span style={{ fontSize:9 }}>{uploading ? 'Lade…' : 'Upload'}</span>
            <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => { const fs = e.target.files; if (fs && fs.length) uploadImgs(fs); e.target.value = '' }} style={{ display:'none' }}/>
          </label>
        )}
      </div>
      {!edit?.id && (
        <div style={{ fontSize:11, color:'#92400E', marginTop:8 }}>Speichere die Brand Voice zuerst, dann kannst du hier hochladen.</div>
      )}
    </div>
  )
}

// Zwei-Spalten-Container für Personen + CI
function HeroImagesEditor({ edit, u, session, activeTeamId }) {
  return (
    <div style={{ marginTop:14, display:'flex', gap:12, flexWrap:'wrap' }}>
      <BVImagesEditor
        edit={edit} u={u} session={session} activeTeamId={activeTeamId}
        field="hero_image_paths"
        icon="👤"
        label="Bilder von dir / der Person"
        hint="Bis zu 6 Bilder (Headshot, Lifestyle-Aufnahmen). Werden als Identity-Referenz mitgesendet — sorgt für wiedererkennbare Personen in generierten Bildern."
        max={6}
        folder="bv-hero"
        fileLabel="Personen-Bilder"
      />
      <BVImagesEditor
        edit={edit} u={u} session={session} activeTeamId={activeTeamId}
        field="ci_image_paths"
        icon={<Palette size={18} strokeWidth={1.75}/>}
        label="Logos & CI-Bibliothek"
        hint="Bis zu 8 Markenelemente (Logos, Favicons, Farb-Samples, Brand-Patterns). Werden als Stil-Referenz mitgesendet — sorgt für konsistente Markenoptik."
        max={8}
        folder="bv-ci"
        fileLabel="CI-Elemente"
      />
    </div>
  )
}

export default function BrandVoice({ session }) {
  const { team, activeTeamId, members } = useTeam()
  const uid = session.user.id
  const [voices, setVoices]   = useState([])
  const [sharingModalFor, setSharingModalFor] = useState(null) // BV-Row für die Sharing-Picker geöffnet ist
  // Wizard-Draft-Detection (fuer Banner auf der Liste). Wird beim Mount geprueft,
  // und nach jedem Save/Verwerfen neu evaluiert via key-Bump.
  const [draftCheckTick, setDraftCheckTick] = useState(0)
  const hasWizardDraft = (() => {
    if (typeof window === 'undefined') return false
    try {
      const fields = ['bv_w_name_', 'bv_w_position_', 'bv_w_company_', 'bv_w_offering_', 'bv_w_motivation_', 'bv_w_examples_', 'bv_w_step_']
      return fields.some(prefix => {
        const v = window.localStorage.getItem(prefix + uid)
        if (!v) return false
        try { const p = JSON.parse(v); return p !== '' && p !== null && p !== 0 } catch(e) { return v !== '""' && v !== 'null' && v !== '0' }
      })
    } catch(e) { return false }
  })()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  // view: smarter persist nur ueber Browser-Tab-Wechsel. Bei Sidebar-Nav
  // weg+zurueck = Default. Bei Reload = Default. Recovery-Banner kuemmert
  // sich um unfertige Drafts.
  const [view, setView] = useTabPersistedState('bv_view_'+uid, 'list')
  const [edit, setEdit]       = useState(null)
  const [tab, setTab]         = useState('marke')
  const [genSummary, setGenSummary] = useState(false)
  const { model: selectedModel, setModel: setSelectedModel } = useModel()

  useEffect(() => { loadVoices() }, [session, activeTeamId])

  async function loadVoices() {
    setLoading(true)
    // BVs sind team-scoped — User sieht nur BVs des aktiven Teams.
    // Zusätzlich filtert RLS auf Owner/is_shared/Selektiv-Shares.
    if (!activeTeamId) { setVoices([]); setLoading(false); return }
    const { data } = await supabase.from('brand_voices').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false })
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
      // team_id mit-setzen falls noch nicht gesetzt — fix für team-id-filter regression
      if (!rest.team_id && activeTeamId) rest.team_id = activeTeamId
      await supabase.from('brand_voices').update(rest).eq('id', id)
    } else {
      rest.user_id = session.user.id
      // team_id beim Neuanlegen automatisch auf aktives Team setzen — sonst unsichtbar im UI
      if (!rest.team_id && activeTeamId) rest.team_id = activeTeamId
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
    const v = voices.find(x => x.id === id)
    if (!confirm(`Brand Voice "${v?.name || 'diese'}" wirklich löschen?\n\nAlle zugehörigen Chats, Shares und Knowledge-Base-Verknüpfungen werden mitgelöscht. Beiträge, Visuals und Memory bleiben erhalten (BV-Link wird auf NULL gesetzt).`)) return
    const { error } = await supabase.from('brand_voices').delete().eq('id', id)
    if (error) {
      console.error('[deleteVoice]', error)
      alert('Löschen fehlgeschlagen: ' + error.message)
      return
    }
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
        body: { type:'brand_voice_summary', prompt: JSON.stringify(edit), userId: session.user.id, model: selectedModel }
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

  const [liConnecting, setLiConnecting] = useState(false)
  const [freshlyCreated, setFreshlyCreated] = useState(false)
  const [liError, setLiError] = useState('')
  async function connectLinkedIn() {
    // Phase 1a OAuth-Flow: Init-Edge-Function ruft uns die LinkedIn-Authorize-URL,
    // wir redirecten den User dorthin. Callback landet auf /auth/linkedin/callback.
    setLiConnecting(true); setLiError('')
    try {
      if (!edit?.id) {
        setLiError('Bitte zuerst die Brand Voice speichern, dann LinkedIn verbinden.')
        return
      }
      const { data, error } = await supabase.functions.invoke('linkedin-oauth-init', {
        body: {
          brand_voice_id: edit.id,
          redirect_origin: window.location.origin,
        }
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.authorize_url) throw new Error('Authorize-URL fehlt in Antwort')
      // Same-Tab-Redirect; Callback-Page bringt den User zurück
      window.location.href = data.authorize_url
    } catch (e) {
      setLiError(e?.message || 'Fehler beim Starten des OAuth-Flows')
      setLiConnecting(false)
    }
  }

  // Toast nach OAuth-Return (?li_connected=<bv_id>) oder Error (?li_error=...)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const liConnected = q.get('li_connected')
    const liErrorParam = q.get('li_error')
    if (liConnected) {
      // BV neu laden, damit linkedin_member_id etc. frisch im UI ist.
      // Wichtig: nach OAuth-Return ist das useTabPersistedState-Module-Memory
      // weg (Full-Page-Navigation), also explizit zurück in den Editor switchen
      // und auf den richtigen Tab springen — sonst landet der User auf der
      // BV-Liste statt in der gerade verbundenen BV.
      ;(async () => {
        const { data: bv } = await supabase.from('brand_voices').select('*').eq('id', liConnected).maybeSingle()
        if (bv) {
          setEdit(prev => ({ ...(prev || {}), ...bv }))
          setView('editor')
          setTab('marke')
        }
      })()
      // URL bereinigen
      const url = new URL(window.location.href)
      url.searchParams.delete('li_connected')
      window.history.replaceState({}, '', url.toString())
    }
    if (liErrorParam) {
      setLiError(decodeURIComponent(liErrorParam))
      const url = new URL(window.location.href)
      url.searchParams.delete('li_error')
      window.history.replaceState({}, '', url.toString())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Disconnect: revoked_at setzen + BV-Identity-Felder leeren
  async function disconnectLinkedIn() {
    if (!edit?.id) return
    if (!window.confirm('LinkedIn-Verbindung trennen? Geplante Auto-Posts dieser Brand Voice schlagen dann fehl.')) return
    try {
      await supabase
        .from('linkedin_oauth_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('brand_voice_id', edit.id)
        .is('revoked_at', null)
      await supabase
        .from('brand_voices')
        .update({ linkedin_member_id: null, linkedin_display_name: null, linkedin_avatar_url: null, linkedin_verified_at: null })
        .eq('id', edit.id)
      setEdit(prev => ({ ...prev, linkedin_member_id: null, linkedin_display_name: null, linkedin_avatar_url: null, linkedin_verified_at: null }))
    } catch (e) {
      setLiError('Trennen fehlgeschlagen: ' + (e?.message || 'Unbekannt'))
    }
  }

  // Parse tonality object to array for the editor
  const tonalityArr = edit?.tonality && typeof edit.tonality === 'object' && !Array.isArray(edit.tonality)
    ? Object.entries(edit.tonality).map(([label, value]) => ({ label, value: Number(value) }))
    : TONALITY_DEFAULTS

  const TABS = [
    { v:'marke',      label:'Marke',           icon: <Building2 size={16} strokeWidth={1.75}/>, color:'blue',   sub:'Identität & Werte' },
    { v:'tonalitaet', label:'Tonalität',       icon:<BarChart3 size={14} strokeWidth={1.75}/>, color:'green',  sub:'Wie stark, was wie' },
    { v:'sprache',    label:'Sprache',         icon:<PenLine size={14} strokeWidth={1.75}/>, color:'amber',  sub:'Wortwahl & Stil' },
    { v:'summary',    label:'AI Summary',      icon:<Sparkles size={14} strokeWidth={1.75}/>, color:'brand',  sub:'System-Prompt' },
  ]

  // ─── List View ────────────────────────────────────────────────
  if (view === 'list') {
    if (loading) return <div style={{textAlign:'center',color:'var(--text-muted)',padding:60}}>Laden…</div>

    // Empty-State: Hero mit animiertem Logo
    if (voices.length === 0) return (
      <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'12px 16px' }}>
        {hasWizardDraft && (
          <div data-tick={draftCheckTick} style={{ marginTop:14, marginBottom:0, padding:'12px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.30)', borderRadius:10, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <FileText size={18} strokeWidth={1.75} style={{ color:'var(--wl-primary, rgb(49,90,231))' }}/>
            <div style={{ flex:1, minWidth:220 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#92400E' }}>Du hast einen unfertigen Brand-Voice-Entwurf</div>
              <div style={{ fontSize:11, color:'#92400E', opacity:.9 }}>Deine Eingaben sind gespeichert — du kannst dort weitermachen.</div>
            </div>
            <button onClick={()=>setView('wizard')} style={{ padding:'7px 14px', background:P, color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
              <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={14}/>Fortsetzen</span>
            </button>
            <button onClick={()=>{ clearDraftsByPrefix('bv_w_'); setDraftCheckTick(t=>t+1) }} style={{ padding:'7px 14px', background:'transparent', color:'#92400E', border:'1px solid rgba(146,64,14,0.30)', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
              Verwerfen
            </button>
          </div>
        )}
        <EmptyHero
          eyebrow="Schritt 1 · Branding"
          title="Lass uns deine Brand Voice definieren"
          subtitle="Deine Brand Voice steuert Tonalität, Wortwahl und Stil aller LinkedIn-Inhalte — vom Profilslogan bis zum nächsten Post. In ~2 Minuten zur ersten Voice."
          primaryLabel="Neue Brand Voice mit KI"
          onPrimary={()=>{ clearDraftsByPrefix('bv_w_'); clearTabPersistedKey('ki_tab_brand'); setView('wizard') }}
          secondaryLabel="→ oder manuell erstellen"
          onSecondary={()=>{ setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('marke') }}
          helperText="Nächste Schritte: Zielgruppen definieren und Wissensdatenbank befüllen — alles baut auf der Brand Voice auf."
        />
      </div>
    )

    // List-View mit Inhalten: Journal-Header + Karten
    return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Journal-Style-Header */}
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Branding · Schritt 1 von 3</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Brand Voice.</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>Markenstimme, die jeden generierten Text trägt. Eine ist aktiv, weitere als Vorlagen.</p>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-start', gap:10, marginBottom:18 }}>
        <button onClick={()=>{ clearDraftsByPrefix('bv_w_'); clearTabPersistedKey('ki_tab_brand'); setView('wizard') }} style={{ padding:'10px 20px', background:P, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 8px rgba(49,90,231,.18)' }}>
          Neue Brand Voice mit KI
        </button>
        <button onClick={()=>{ setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('marke') }}
          style={{ padding:'10px 20px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, fontSize:13, cursor:'pointer', color:'var(--text-primary)', fontWeight:500 }}>
          + Manuell erstellen
        </button>
      </div>

      {/* Wizard-Draft-Recovery-Banner */}
      {hasWizardDraft && (
        <div data-tick={draftCheckTick} style={{ marginBottom:16, padding:'12px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.30)', borderRadius:10, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <FileText size={18} strokeWidth={1.75} style={{ color:'var(--wl-primary, rgb(49,90,231))' }}/>
          <div style={{ flex:1, minWidth:220 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#92400E' }}>Du hast einen unfertigen Brand-Voice-Entwurf</div>
            <div style={{ fontSize:11, color:'#92400E', opacity:.9 }}>Deine Eingaben sind gespeichert — du kannst dort weitermachen.</div>
          </div>
          <button onClick={()=>setView('wizard')} style={{ padding:'7px 14px', background:P, color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={14}/>Fortsetzen</span>
          </button>
          <button onClick={()=>{ clearDraftsByPrefix('bv_w_'); setDraftCheckTick(t=>t+1) }} style={{ padding:'7px 14px', background:'transparent', color:'#92400E', border:'1px solid rgba(146,64,14,0.30)', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Verwerfen
          </button>
        </div>
      )}

      {(() => {
        const myVoices     = voices.filter(v => v.user_id === uid)
        const sharedVoices = voices.filter(v => v.user_id !== uid)
        const renderCard = (v) => (
            <div key={v.id} style={{ background:'var(--surface)', borderRadius:12, border: v.is_active ? `2px solid ${P}` : '1.5px solid #e8ecf0', padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:16, fontWeight:700 }}>{v.name}</span>
                    {v.is_active && <span style={{ fontSize:10, background:'#e8f5e9', color:'#2e7d32', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>Aktiv</span>}
                    {v.tonality && Object.keys(v.tonality).length > 0 && <span style={{ fontSize:10, background:'#e3f2fd', color:'#1565c0', padding:'2px 8px', borderRadius:10 }}>100% vollständig</span>}
                  </div>
                  {v.brand_name && <div style={{ fontSize:12, color:'#888', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}><Briefcase size={12} strokeWidth={1.75}/>{v.brand_name}</div>}
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
                  {team && v.user_id === uid && <button onClick={() => setSharingModalFor(v)}
                    style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #dde3ea', background:v.is_shared?'rgba(16,185,129,0.08)':'#fff', fontSize:12, cursor:'pointer' }}>
                    {v.is_shared ? `${team.name}` : 'Sichtbarkeit'}
                  </button>}
                  {v.user_id === uid && <button onClick={()=>deleteVoice(v.id)} style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#991B1B', fontSize:12, cursor:'pointer' }}><Trash2 size={14} strokeWidth={1.75}/></button>}
                </div>
              </div>
            </div>
        )

        return (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {myVoices.length > 0 && (
              <div>
                <h3 style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 10px' }}>
                  Meine Brand Voices ({myVoices.length})
                </h3>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {myVoices.map(renderCard)}
                </div>
              </div>
            )}
            {sharedVoices.length > 0 && (
              <div>
                <h3 style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 10px' }}>
                  🤝 Mit dir geteilt ({sharedVoices.length})
                </h3>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {sharedVoices.map(renderCard)}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Sharing-Modal */}
      {sharingModalFor && (
        <div onClick={() => setSharingModalFor(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:560, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Sichtbarkeit anpassen</div>
                <h3 style={{ fontSize:18, fontWeight:700, margin:'4px 0 0', color:'var(--text-primary)' }}>{sharingModalFor.name || '(ohne Name)'}</h3>
              </div>
              <button onClick={() => setSharingModalFor(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--text-muted)', padding:0, lineHeight:1 }}>×</button>
            </div>
            <SharingPicker
              entityType="brand_voice"
              entityId={sharingModalFor.id}
              entityUserId={sharingModalFor.user_id}
              initialIsShared={!!sharingModalFor.is_shared}
              team={team}
              members={members || []}
              onSaved={({ is_shared, team_id }) => {
                setVoices(p => p.map(bv => bv.id === sharingModalFor.id ? { ...bv, is_shared, team_id } : bv))
                setSharingModalFor(null)
              }}/>
          </div>
        </div>
      )}
    </div>
  )

  // ─── Wizard View ──────────────────────────────────────────────
  }

  if (view === 'wizard') return (
    <QuickSetup session={session} onDone={(saved) => { loadVoices(); setEdit(saved); setView('editor'); setTab('marke'); setFreshlyCreated(true) }} onSkip={() => { setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('marke') }}/>
  )

  // ─── Editor View ──────────────────────────────────────────────
  if (!edit) return null
  const ls = edit.linkedin_style || {}

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 0' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:18 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ background:'transparent', border:'1.5px solid var(--border)', borderRadius:10, width:36, height:36, fontSize:16, cursor:'pointer', color:'var(--text-muted)', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:2 }}>Branding · Schritt 1 von 3</div>
          <div style={{ fontSize:22, fontWeight:700, letterSpacing:'-.2px', lineHeight:1.2 }}>Brand Voice bearbeiten</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Persönlicher Kommunikationsstil für alle LinkedIn-Inhalte</div>
        </div>
        <button onClick={saveVoice} style={{ padding:'11px 22px', background:P, color:'#fff', border:'none', borderRadius:10, fontSize:13.5, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 10px rgba(49,90,231,.25)', display:'inline-flex', alignItems:'center', gap:8, fontFamily:'inherit', flexShrink:0 }}>
          <span style={{display:'inline-flex'}}><Save size={14}/></span><span>Brand Voice speichern</span>
        </button>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <input value={edit.name||''} onChange={e=>u('name',e.target.value)} placeholder="Brand Voice Name"
          style={{ flex:1, padding:'10px 14px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:15, fontWeight:600 }}/>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#666' }}>
          <input type="checkbox" checked={edit.is_active} onChange={e=>u('is_active',e.target.checked)}/> Aktiv
        </label>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} style={{ marginBottom:18 }}/>

      {/* ── Tab: Marke ─────────────────────────────────── */}
      {tab==='marke' && <>
        {freshlyCreated && !edit.linkedin_member_id && (
          <div style={{ marginBottom:16, padding:'14px 18px', background:'linear-gradient(90deg, rgba(49,90,231,0.10) 0%, rgba(48,160,208,0.08) 100%)', border:'1.5px solid rgba(49,90,231,0.25)', borderRadius:12, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <PartyPopper size={22} strokeWidth={1.75} style={{ color:'#16A34A' }}/>
            <div style={{ flex:1, minWidth:240 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:2 }}>Brand Voice erstellt — jetzt LinkedIn verbinden</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4 }}>Verknüpfe das passende LinkedIn-Profil mit dieser Brand Voice — Voraussetzung für Auto-Publishing, Vernetzungen und Nachrichten.</div>
            </div>
            <button onClick={connectLinkedIn} disabled={liConnecting}
              style={{ padding:'9px 18px', borderRadius:9, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor:liConnecting?'wait':'pointer' }}>
              {liConnecting ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={14} className="lk-spin"/>…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><LinkedinIcon size={14}/>Mit LinkedIn verbinden</span>}
            </button>
            <button onClick={() => setFreshlyCreated(false)}
              style={{ padding:'9px 12px', borderRadius:9, border:'1px solid var(--border)', background:'#fff', fontSize:12, color:'var(--text-muted)', cursor:'pointer' }}>
              Später
            </button>
          </div>
        )}
        <SectionCard icon="🎭" color="purple" title="Auftritt" subtitle="Wer spricht hier — privates Profil oder Company-Page">
          <Lb l="Auftritts-Typ" h="Ist diese Brand Voice für ein privates LinkedIn-Profil oder eine Company-Page?"/>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
            {[
              { id:'personal',     label:'Privat-Profil',  desc:'Mein/jemands persönliches LinkedIn-Profil' },
              { id:'company_page', label:'Company Page',  desc:'LinkedIn Unternehmensseite' },
              { id:'other',        label:'Sonstiges',       desc:'Andere Plattform / Mehrere' },
            ].map(opt => {
              const sel = (edit.account_type || 'personal') === opt.id
              return (
                <button key={opt.id} onClick={() => u('account_type', opt.id)}
                  title={opt.desc}
                  style={{
                    padding:'10px 16px', borderRadius:10, border:'1.5px solid ' + (sel ? P : 'var(--border)'),
                    background: sel ? 'rgba(49,90,231,0.07)' : 'var(--surface)',
                    color: sel ? P : 'var(--text-muted)', cursor:'pointer',
                    fontSize:13, fontWeight: sel ? 700 : 500,
                    transition:'all .12s', flex:1, minWidth:160, textAlign:'left',
                  }}>
                  <div>{opt.label}</div>
                  <div style={{ fontSize:11, opacity:.7, marginTop:2, fontWeight:500 }}>{opt.desc}</div>
                </button>
              )
            })}
          </div>
          <Lb l="LinkedIn-URL (optional)" h="Wo postet dieser Auftritt? Hilft später beim Auto-Publishing."/>
          <In v={edit.linkedin_url || ''} fn={v=>u('linkedin_url', v)} ph="https://www.linkedin.com/in/dein-profil oder /company/firma" />

          {/* LinkedIn-Profil verbinden — Extension liest die aktive Session */}
          <div style={{ marginTop:14, padding:'12px 14px', background: edit.linkedin_member_id ? '#F0FDF4' : '#F8FAFC', border:'1.5px solid '+(edit.linkedin_member_id?'#BBF7D0':'var(--border)'), borderRadius:10 }}>
            {edit.linkedin_member_id ? (
              <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'space-between', flexWrap:'wrap' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                  {edit.linkedin_avatar_url ? <img src={edit.linkedin_avatar_url} alt="" style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/> : <Briefcase size={28} strokeWidth={1.75} style={{ color:'var(--text-muted)' }}/>}
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#166534', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{edit.linkedin_display_name || 'LinkedIn-Profil verbunden'}</div>
                    <div style={{ fontSize:11, color:'#059669' }}>linkedin.com/in/{edit.linkedin_member_id}{edit.linkedin_verified_at ? ' · zuletzt geprüft '+new Date(edit.linkedin_verified_at).toLocaleDateString('de-DE') : ''}</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button type="button" onClick={connectLinkedIn} disabled={liConnecting}
                    style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #BBF7D0', background:'#fff', color:'#166534', fontSize:12, fontWeight:600, cursor: liConnecting?'wait':'pointer' }}>
                    {liConnecting ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={12} className="lk-spin"/>Prüfe…</span> : 'Erneut verbinden'}
                  </button>
                  <button type="button" onClick={disconnectLinkedIn} style={{ padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', color:'#991B1B', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    Trennen
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>LinkedIn-Profil verbinden</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>Voraussetzung für Posting, Vernetzungen und Nachrichten aus diesem Auftritt. Du musst auf linkedin.com eingeloggt sein.</div>
                </div>
                <button type="button" onClick={connectLinkedIn} disabled={liConnecting}
                  style={{ padding:'9px 18px', borderRadius:8, border:'none', background: liConnecting ? '#94A3B8' : P, color:'#fff', fontSize:12, fontWeight:700, cursor: liConnecting?'wait':'pointer', flexShrink:0 }}>
                  {liConnecting ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={14} className="lk-spin"/>Lese Session…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><LinkedinIcon size={14}/>Mit LinkedIn verbinden</span>}
                </button>
              </div>
            )}
            {liError && <div style={{ marginTop:10, padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:8, fontSize:12, color:'#991B1B' }}>{liError}</div>}
          </div>

          {/* Hero-Images für visuelle Konsistenz (Phase 2b) */}
          <HeroImagesEditor edit={edit} u={u} session={session} activeTeamId={activeTeamId}/>

          {/* Sichtbarkeit: Privat / Team / Selektiv */}
          {edit.id ? (
            <div style={{ marginTop:14 }}>
              <SharingPicker
                entityType="brand_voice"
                entityId={edit.id}
                entityUserId={edit.user_id || uid}
                initialIsShared={!!edit.is_shared}
                team={team}
                members={members || []}
                onSaved={({ is_shared, team_id }) => {
                  u('is_shared', is_shared)
                  u('team_id', team_id)
                  setVoices(p => p.map(v => v.id === edit.id ? { ...v, is_shared, team_id } : v))
                }}/>
            </div>
          ) : (
            <div style={{ marginTop:14, padding:'12px 14px', background:'#F8FAFC', border:'1.5px solid var(--border)', borderRadius:10, fontSize:12, color:'var(--text-muted)' }}>
              Sichtbarkeits-Einstellungen werden nach dem ersten Speichern verfügbar.
            </div>
          )}
        </SectionCard>
        <SectionCard icon="🏢" color="blue" title="Markenidentität" subtitle="Wer ist deine Marke, wofür stehst du">
          <Lb l="Markenname"/><In v={edit.brand_name} fn={v=>u('brand_name',v)} ph="z.B. entrenous GmbH"/>
          <Lb l="Hintergrund" h="Was macht dein Unternehmen?"/><Tx v={edit.brand_background} fn={v=>u('brand_background',v)} r={3} ph="Kurze Beschreibung deines Unternehmens..."/>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1 }}><Lb l="Mission"/><Tx v={edit.mission} fn={v=>u('mission',v)} r={2} ph="Wofür steht ihr?"/></div>
            <div style={{ flex:1 }}><Lb l="Vision"/><Tx v={edit.vision} fn={v=>u('vision',v)} r={2} ph="Wo wollt ihr hin?"/></div>
          </div>
          <Lb l="Werte"/><In v={edit.values} fn={v=>u('values',v)} ph="z.B. Empathie, Diversität, Innovation"/>
        </SectionCard>
        <SectionCard icon="👤" color="pink" title="Persönlichkeit" subtitle="Wie klingt deine Marke menschlich">
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
        </SectionCard>
      </>}

      {/* ── Tab: Tonalität ─────────────────────────────── */}
      {tab==='tonalitaet' && <>
        <SectionCard icon={<BarChart3 size={18} strokeWidth={1.75}/>} color="green" title="Markentonalität" subtitle="Wie stark sind welche Kommunikationsmerkmale">
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
        </SectionCard>
        <SectionCard icon={<MessageSquare size={18} strokeWidth={1.75}/>} color="amber" title="Wortschatz" subtitle="Begriffe, die in deinen Inhalten vorkommen sollen">
          <Lb l="Keywords & Schlüsselbegriffe" h="Begriffe die in deinen Inhalten vorkommen sollen"/>
          <VocabularyChips items={edit.vocabulary||[]} onChange={v=>u('vocabulary',v)}/>
        </SectionCard>
        <SectionCard icon="📖" color="purple" title="Glossar" subtitle="Fachbegriffe und ihre Definitionen für konsistente Verwendung">
          <Lb l="Fachbegriffe & Definitionen" h="Stelle sicher, dass deine Begriffe korrekt verwendet werden"/>
          <GlossaryEditor items={edit.glossary||[]} onChange={v=>u('glossary',v)}/>
        </SectionCard>
      </>}

      {/* ── Tab: Sprache ───────────────────────────────── */}
      {tab==='sprache' && <>
        <SectionCard icon={<MessageCircle size={18} strokeWidth={1.75}/>} color="teal" title="Ansprache" subtitle="Du, Sie oder gemischt — wie sprichst du deine Leser an">
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
        </SectionCard>
        <SectionCard icon={<PenLine size={18} strokeWidth={1.75}/>} color="coral" title="Sprach-Richtlinien" subtitle="Wortwahl, Satzstruktur, Dos und Don'ts">
          <Lb l="Wortwahl" h="Welche Wörter bevorzugst du, was vermeidest du?"/>
          <Tx v={edit.word_choice} fn={v=>u('word_choice',v)} r={2} ph="z.B. Klare Fachbegriffe aus Marketing-Tech, verständlich erklärt..."/>
          <Lb l="Satzstruktur"/>
          <Tx v={edit.sentence_style} fn={v=>u('sentence_style',v)} r={2} ph="z.B. Mittellange, gut verdauliche Sätze..."/>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1 }}>
              <Lb l="Dos"/>
              <Tx v={edit.dos} fn={v=>u('dos',v)} r={3} ph="- Praxisbeispiele teilen&#10;- Messbare Ergebnisse nennen&#10;- Zum Dialog einladen"/>
            </div>
            <div style={{ flex:1 }}>
              <Lb l="Don'ts"/>
              <Tx v={edit.donts} fn={v=>u('donts',v)} r={3} ph="- Keine Hashtags (LinkedIn-Best-Practice)&#10;- Keine Verkaufs-Pitches&#10;- Nicht akademisch werden"/>
            </div>
          </div>
        </SectionCard>
        <SectionCard icon={<LinkedinIcon size={18} strokeWidth={1.75}/>} color="blue" title="LinkedIn-Stil" subtitle="Hook, CTA und Emoji-Einsatz auf LinkedIn">
          <Lb l="Bevorzugter Hook-Stil" h="Wie beginnst du typischerweise deine LinkedIn-Posts?"/>
          <Dd v={ls.hook_style} fn={v=>uLinkedIn('hook_style',v)} opts={HOOK_OPTIONS} ph="Hook-Stil wählen..."/>
          <Lb l="Call-to-Action Stil"/>
          <Dd v={ls.cta_style} fn={v=>uLinkedIn('cta_style',v)} opts={CTA_OPTIONS} ph="CTA-Stil wählen..."/>
          <Lb l="Emoji-Nutzung"/>
          <Dd v={ls.emoji_usage} fn={v=>uLinkedIn('emoji_usage',v)} opts={EMOJI_OPTIONS} ph="Emojis..."/>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            Hashtags werden bei Leadesk grundsaetzlich nicht verwendet — auf LinkedIn senken sie eher die Reichweite. "Keine Hashtags" ist daher fix in den Don'ts hinterlegt.
          </div>
        </SectionCard>
      </>}
      {/* ── Tab: AI Summary ────────────────────────────── */}
      {tab==='summary' && <>
        <SectionCard icon={<Sparkles size={18} strokeWidth={1.75}/>} color="brand" title="Brand Voice Summary" subtitle="Der zusammengefasste System-Prompt für alle KI-Aufrufe">
          <Lb l="AI Summary" h="Wird automatisch in alle KI-Aufrufe eingebaut"/>
          {edit.ai_summary ? (
            <Tx v={edit.ai_summary} fn={v=>u('ai_summary',v)} r={8}/>
          ) : (
            <div style={{ color:'#F59E0B', fontSize:11, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6 }}><AlertTriangle size={12} strokeWidth={1.75}/>Noch keine KI-Summary — im Editor generieren</div>
          )}
          <div style={{ fontSize:11, color:'#888', background:'#FFFBEB', padding:'8px 12px', borderRadius:8, marginTop:4 }}>
            Diese Summary ist der Kern deiner Brand Voice — je präziser, desto authentischer die KI-Texte.
          </div>        <button onClick={generateSummary} disabled={genSummary} style={{ padding:'8px 16px', background:'#7C3AED', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', opacity:genSummary?.6:1, marginTop:4 }}>
            {genSummary ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={12} className="lk-spin"/>Generiert…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><RefreshCw size={12}/>Neu generieren</span>}
          </button>
        </SectionCard>
        <SectionCard icon={<FileText size={18} strokeWidth={1.75}/>} color="purple" title="Beispieltexte für KI-Analyse" subtitle="Eigene Posts oder Artikel — die KI lernt deinen Stil daraus">
          <Lb l="Eigene Texte" h="LinkedIn-Posts, Artikel — KI lernt deinen Stil daraus"/>
          <Tx v={edit.example_texts} fn={v=>u('example_texts',v)} r={6} ph="Füge hier eigene LinkedIn-Posts ein..."/>
        </SectionCard>
      </>}

      {/* ── Tab-Navigation: Zurueck / Weiter ─────────── */}
      <div style={{ marginTop:24, marginBottom:24, padding:'18px 0 0', borderTop:'1.5px solid var(--border, #E5E7EB)', display:'flex', gap:10, justifyContent:'space-between', alignItems:'center' }}>
        <button onClick={() => {
          const i = TABS.findIndex(t => t.v === tab)
          if (i > 0) setTab(TABS[i-1].v)
        }} disabled={tab === TABS[0].v}
          style={{ padding:'11px 20px', background:'transparent', border:'1.5px solid var(--border, #E5E7EB)', borderRadius:10, fontSize:13.5, cursor:tab===TABS[0].v?'not-allowed':'pointer', color:tab===TABS[0].v?'#CBD5E1':'var(--text-muted)', fontFamily:'inherit', fontWeight:500, opacity:tab===TABS[0].v?.5:1, display:'inline-flex', alignItems:'center', gap:6 }}>
          <span>←</span><span>Zurück</span>
        </button>
        {tab === TABS[TABS.length-1].v ? (
          <button onClick={()=>{ saveVoice(); }}
            style={{ padding:'12px 28px', background:'#22C55E', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 10px rgba(34,197,94,.25)', display:'inline-flex', alignItems:'center', gap:8, fontFamily:'inherit' }}>
            <span>✓</span><span>Fertig & Speichern</span>
          </button>
        ) : (
          <button onClick={() => {
            const i = TABS.findIndex(t => t.v === tab)
            if (i < TABS.length-1) setTab(TABS[i+1].v)
          }}
            style={{ padding:'12px 28px', background:P, color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 10px rgba(49,90,231,.25)', display:'inline-flex', alignItems:'center', gap:8, fontFamily:'inherit' }}>
            <span>Weiter</span><span>→</span>
          </button>
        )}
      </div>
    </div>
  )
}
