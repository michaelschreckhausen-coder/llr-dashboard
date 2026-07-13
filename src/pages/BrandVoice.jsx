import { useTranslation } from 'react-i18next'
import React, { useEffect, useState } from 'react'
import { useLocalStorageState, clearDraftsByPrefix } from '../lib/useLocalStorageState'
import { useTabPersistedState, clearTabPersistedKey } from '../lib/useTabPersistedState'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import GenerationLoading from '../components/GenerationLoading'
import { AlertTriangle, BookOpen, BarChart3, Briefcase, Building2, Download, Eye, FileText, Image as ImageIcon, Lightbulb, Loader2, MessageCircle, MessageSquare, Mic, Palette, PartyPopper, PenLine, Plus, RefreshCw, Save, Sparkles, Star, ThumbsDown, ThumbsUp, Trash2, Upload, UserCircle, X } from 'lucide-react'
import { LinkedinIcon } from '../components/icons'
import { getActiveLinkedInIdentity } from '../lib/leadeskExtension'
import { supabase } from '../lib/supabase'
import { sharedEntityIds, scopeByTeamOrShared } from '../lib/teamShares'

// Robustes Extrahieren/Parsen von LLM-JSON: entfernt Markdown-Fences und
// Trailing-Kommas, bevor JSON.parse läuft. (LLMs liefern gelegentlich kein
// strikt valides JSON — z.B. abschließende Kommas oder ```json-Fences.)
function parseLooseJson(text) {
  if (!text) throw new Error('Leere Antwort')
  let t = String(text).trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const m = t.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('Kein JSON in der Antwort')
  let j = m[0].replace(/,(\s*[}\]])/g, '$1')  // Trailing-Kommas entfernen
  return JSON.parse(j)
}
import { resizeImageBeforeUpload } from '../lib/imageResize'
import { uploadBrandFont, listBrandFonts, deleteBrandFont, renameBrandFont, loadBrandFonts, isAllowedFontFile } from '../lib/brandFonts'
import KnowledgeImporter from '../components/KnowledgeImporter'
import SharingPicker from '../components/SharingPicker'
import EmptyHero from '../components/EmptyHero'
import SectionCard from '../components/SectionCard'
import WizardLayout from '../components/WizardLayout'
import TabBar from '../components/TabBar'
import { useModel } from '../context/ModelContext'

const P = 'var(--wl-primary, #0A6FB0)'

// ─── Konstanten ───────────────────────────────────────────────────────────────
const TONES = ['Professionell','Freundlich','Direkt','Inspirierend','Humorvoll','Empathisch','Analytisch','Motivierend','Authentisch','Kreativ','Sachlich','Leidenschaftlich','Mutig','Klar','Visionär']
const FORM  = [{v:'du',l:'Du-Form',d:'Persönlich & nahbar'},{v:'sie',l:'Sie-Form',d:'Formell & distanziert'},{v:'mixed',l:'Gemischt',d:'Je nach Kontext'}]
const GOALS = ['Neue Leads generieren','Netzwerk aufbauen','Thought Leadership etablieren','Recruiting & Employer Branding','Persönliche Marke aufbauen','Produkt / Dienstleistung vermarkten']
// Company Pages haben Follower statt Netzwerk und keine "persönliche Marke"
const GOALS_COMPANY = ['Neue Leads generieren','Follower & Reichweite aufbauen','Thought Leadership etablieren','Recruiting & Employer Branding','Produkt / Dienstleistung vermarkten','Kunden informieren & binden']

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
const HOOK_OPTIONS = ['Abwechslungsreich (variiert)','Provokante Frage','Persönliche Geschichte','Überraschende Statistik','Direkte Aussage','Kontroverse These']
const CTA_OPTIONS = ['Abwechslungsreich (variiert)','Frage ans Netzwerk','Zum Kommentieren einladen','Link/Ressource teilen','Zum Nachdenken anregen','Call-to-Action vermeiden']

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
      border:'1.5px solid '+(focused?'var(--wl-primary, #0A6FB0)':'var(--border, #E5E7EB)'),
      borderRadius:10, fontSize:13.5, boxSizing:'border-box', outline:'none',
      background:'var(--surface, #fff)', color:'var(--text-primary, rgb(20,20,43))',
      boxShadow: focused ? '0 0 0 3px rgba(10,111,176,.10)' : 'none',
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
      border:'1.5px solid '+(focused?'var(--wl-primary, #0A6FB0)':'var(--border, #E5E7EB)'),
      borderRadius:10, fontSize:13.5, lineHeight:1.55, resize:'vertical',
      boxSizing:'border-box', outline:'none',
      background:'var(--surface, #fff)', color:'var(--text-primary, rgb(20,20,43))',
      boxShadow: focused ? '0 0 0 3px rgba(10,111,176,.10)' : 'none',
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
          <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', background:'rgba(10,111,176,0.08)', borderRadius:20, fontSize:12, color:'#0A6FB0' }}>
            {w}
            <button onClick={()=>onChange(items.filter((_,j)=>j!==i))} style={{ background:'none', border:'none', cursor:'pointer', color:'#0A6FB0', fontSize:14, lineHeight:1, padding:0 }}>×</button>
          </span>
        ))}
      </div>
      {items.length < max && (
        <div style={{ display:'flex', gap:6 }}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),add())}
            placeholder="Keyword hinzufügen..." style={{ flex:1, padding:'6px 10px', border:'1.5px solid #dde3ea', borderRadius:6, fontSize:12 }}/>
          <button className="lk-btn lk-btn-primary" onClick={add} >+</button>
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
function QuickSetup({ session, onDone, onSkip, onBack, brandType = 'personal' }) {
  const uid = session.user.id
  const { activeTeamId } = useTeam()
  const bvType = brandType // Typ ist durch die Seite (/personal-brand vs /company-brand) festgelegt
  const isCo = bvType === 'company_page'
  const GOAL_LIST = isCo ? GOALS_COMPANY : GOALS
  // Draft-Keys pro Brand-Typ scopen — sonst leakt ein Company-Entwurf in den Personal-Wizard (und umgekehrt)
  const kSuffix = isCo ? '_co' : ''
  const [step, setStep, clearStep] = useLocalStorageState('bv_w_step_'+uid+kSuffix, 0)
  const { model: selectedModel, setModel: setSelectedModel } = useModel()
  const [name, setName, clearName]       = useLocalStorageState('bv_w_name_'+uid+kSuffix, '')
  const [position, setPos, clearPos]     = useLocalStorageState('bv_w_position_'+uid+kSuffix, '')
  const [company, setCo, clearCo]        = useLocalStorageState('bv_w_company_'+uid+kSuffix, '')
  const [offering, setOffering, clearOff]= useLocalStorageState('bv_w_offering_'+uid+kSuffix, '')
  const [motivation, setMotivation, clearMot] = useLocalStorageState('bv_w_motivation_'+uid+kSuffix, '')
  const [goal, setGoal, clearGoal]       = useLocalStorageState('bv_w_goal_'+uid+kSuffix, GOALS[0])
  const [examples, setEx, clearEx]       = useLocalStorageState('bv_w_examples_'+uid+kSuffix, '')
  const [sliderArr, setSliderArr, clearSl] = useLocalStorageState('bv_w_sliders2_'+uid+kSuffix, SLIDERS.map(sl => ({ label: sl.key, value: sl.default })))
  const [generating, setGen]  = useState(false)
  const [error, setError]     = useState('')
  const [importData, setImportData, clearImp] = useLocalStorageState('bv_w_importData_'+uid+kSuffix, {file_name:'',file_url:'',file_type:'',source_url:''})
  const [importedText, setImportedText, clearTxt] = useLocalStorageState('bv_w_importedText_'+uid+kSuffix, '')
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
        // company wird nicht mehr aus dem Profil geseedet — Unternehmensinfos
        // gehören zum Company Brand (bei Company-Wizard hält das Feld die Branche)
        if (data.bio) setOffering(prev => prev || data.bio)
      })
  }, [])

  function updSlider(i, patch) { setSliderArr(arr => arr.map((x, j) => j === i ? { ...x, ...patch } : x)) }
  function removeSlider(i) { setSliderArr(arr => arr.filter((_, j) => j !== i)) }
  function addSlider() { setSliderArr(arr => arr.length >= 7 ? arr : [...arr, { label: '', value: 50 }]) }

  function handleMetaChange(updates){
    const next = { ...updates }
    if (updates.linkedin_template_url && !updates.linkedin_url) {
      next.linkedin_url = updates.linkedin_template_url
    }
    setImportData(prev=>({...prev,...next}))
  }
  function handleContentExtracted(text, meta){
    console.log('[Leadesk BV] handleContentExtracted called, chars=', text?.length, 'posts=', meta?.posts?.length || 0)
    setImportedText(prev=>prev?(prev+'\n\n---\n\n'+text):text)
    // Gescrapte LinkedIn-Beiträge → Beispieltexte (Schritt 4) vorbefüllen.
    // Nur wenn das Feld noch leer ist — manuelle Eingaben nie überschreiben.
    const posts = Array.isArray(meta?.posts) ? meta.posts : []
    if (posts.length) {
      setEx(prev => prev && prev.trim()
        ? prev
        : posts.slice(0, 3).map(p => p.slice(0, 1200)).join('\n\n---\n\n'))
    }
  }

  async function prefillFromContext() {
    if (!importedText) return
    setPrefilling(true); setPrefillError('')
    try {
      const isCompanyPrefill = bvType === 'company_page'
      const prompt = [
        isCompanyPrefill
          ? 'Analysiere den folgenden Kontext über ein UNTERNEHMEN (LinkedIn Company Page).'
          : 'Analysiere den folgenden Kontext über eine Person oder ein Unternehmen.',
        'Extrahiere die folgenden Informationen:',
        isCompanyPrefill ? '- name (string): Name des Unternehmens' : '- name (string): Vor- und Nachname',
        isCompanyPrefill ? '- position (string): Claim/Tagline des Unternehmens (kurzer Slogan, NICHT die Branche)' : '- position (string): berufliche Position/Headline',
        isCompanyPrefill ? '- company (string): Branche des Unternehmens (z.B. B2B-SaaS, Softwareentwicklung)' : '',
        isCompanyPrefill
          ? '- offering (string, 1-3 Sätze, Wir-Form): Was das Unternehmen anbietet, fuer welche Zielkunden, welche Outcomes — konkret'
          : '- offering (string, 1-3 Sätze, Ich-Form): Was die Person macht und worin sie richtig gut ist — Tätigkeit, Expertise, Kern-Themen. KEIN Verkaufs-Pitch',
        isCompanyPrefill
          ? '- motivation (string, 1-3 Sätze, Wir-Form): Mission, Vision und Werte des Unternehmens'
          : '- motivation (string, 1-3 Sätze, Ich-Form): Warum macht die Person/Firma das, welche Vision, welche Werte stehen dahinter',
        '',
        '- tonality (object): Wähle die FÜNF Tonalitäts-Adjektive, die diese ' + (isCompanyPrefill ? 'Marke' : 'Person') + ' am treffendsten beschreiben (deutsche Einzelwörter wie Authentisch, Direkt, Analytisch, Verspielt, Nahbar, Provokant, Sachlich, Visionär — frei wählbar, KEINE vorgegebene Liste). Key = Adjektiv, Value = Intensität 0-100 (Integer). Leite Auswahl UND Intensität aus Wortwahl, Themen und Stil im Kontext ab.',
        '',
        '- goal (string, GENAU einer dieser Werte): ' + GOAL_LIST.map(g => '"' + g + '"').join(' | '),
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
        const r = parseLooseJson(text)
        // WICHTIG: hart UEBERSCHREIBEN — auch wenn LLM ein Feld leer/nicht
        // zurueckliefert. Sonst leakt das beim Mount vorgeladene User-Profil
        // (z.B. Julians 'Leadesk' als Unternehmen) in eine Brand Voice die
        // eigentlich fuer eine andere Person/Firma erstellt werden soll.
        setName(typeof r.name === 'string' ? r.name : '')
        setPos(typeof r.position === 'string' ? r.position : '')
        setCo(isCompanyPrefill && typeof r.company === 'string' ? r.company : '')
        setOffering(typeof r.offering === 'string' ? r.offering : '')
        setMotivation(typeof r.motivation === 'string' ? r.motivation : '')
        // Tonalitäts-Slider aus Kontext: KI wählt die 5 passendsten Adjektive + Intensitäten
        if (r.tonality && typeof r.tonality === 'object') {
          const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n))))
          const picked = Object.entries(r.tonality)
            .filter(([k, v]) => typeof k === 'string' && k.trim() && Number.isFinite(Number(v)))
            .slice(0, 6)
            .map(([k, v]) => ({ label: k.trim(), value: clamp(v) }))
          if (picked.length >= 3) setSliderArr(picked)
        }
        // LinkedIn-Ziel: exakter Match gegen GOALS, sonst Fuzzy-Match
        if (typeof r.goal === 'string' && r.goal.trim()) {
          const incoming = r.goal.trim()
          const exact = GOAL_LIST.find(g => g === incoming)
          if (exact) {
            setGoal(exact)
          } else {
            const lower = incoming.toLowerCase()
            const fuzzy = GOAL_LIST.find(g => lower.includes(g.toLowerCase().split(' ')[0]))
            if (fuzzy) setGoal(fuzzy)
          }
        }
      }
      setStep(1)
    } catch(e) { setPrefillError('Fehler: ' + e.message) }
    finally { setPrefilling(false) }
  }

  async function generate() {
    if (!name.trim()) { setError(isCo ? 'Bitte den Unternehmensnamen eingeben.' : 'Bitte deinen Namen eingeben.'); return }
    setGen(true); setError('')
    try {
      const isCompany = bvType === 'company_page'
      const prompt = [
        isCompany
          ? 'Erstelle eine vollständige Company Brand Voice für die LinkedIn-Unternehmensseite eines Unternehmens. Schreibe mission/vision in Wir-Form. Antworte NUR mit einem JSON-Objekt, ohne Kommentar.'
          : 'Erstelle eine vollständige Brand Voice für LinkedIn. Antworte NUR mit einem JSON-Objekt, ohne Kommentar.',
        'WICHTIG fürs JSON: Gib AUSSCHLIESSLICH valides JSON zurück. Doppelte Anführungszeichen NUR als String-Begrenzer — innerhalb von Texten KEINE doppelten Anführungszeichen verwenden; wenn du etwas zitierst, nutze einfache Anführungszeichen (\'…\'). Keine Trailing-Kommas, kein Markdown, keine Kommentare.',
        '', isCompany ? '## Unternehmen' : '## Person', 'Name: ' + name,
        position ? (isCompany ? 'Claim/Tagline: ' : 'Position: ') + position : '',
        isCompany && company ? 'Branche: ' + company : '',
        offering ? (isCompany ? 'Was das Unternehmen anbietet (Angebot, Zielkunden, Outcomes):\n' : 'Was die Person macht und worin sie stark ist (Tätigkeit, Expertise, Themen):\n') + offering.slice(0,800) : '',
        motivation ? 'Motivation, Werte, Vision (Warum):\n' + motivation.slice(0,600) : '',
        '', '## Tonalität (vom User vorgegeben, 0-100%)',
        ...sliderArr.filter(sl => sl.label && sl.label.trim()).map(sl => sl.label.trim() + ': ' + sl.value + '%'),
        'Diese Adjektive + Intensitäten BITTE exakt so in dein tonality-Feld übernehmen (gleiche Keys).',
        '', '## LinkedIn-Ziel', goal,
        '', examples ? '## Eigene Texte als Stil-Referenz\n' + examples.slice(0,800) : '',
        '', importedText ? '## Importierter Kontext (LinkedIn-Profil-Sections, Dokumente, Website):\n' + importedText.slice(0,25000) : '',
        '',
        '## Erwartetes JSON-Format — ALLE Felder sind PFLICHT, kein Feld leer lassen:',
        JSON.stringify({
          name: name,
          brand_background: isCompany
            ? '2-4 Sätze: Wer ist das Unternehmen, Markt, Produkte, Kunden — auf Basis von Angebot und Branche'
            : '2-4 Sätze: Wer ist die Person/Marke, Kontext, Erfahrung, Background — auf Basis von Angebot, Position und Unternehmen',
          mission: isCompany
            ? '1-2 Sätze in Wir-Form: konkrete Mission ("Wir helfen X dabei, Y zu erreichen, indem wir Z…")'
            : '1-2 Sätze in 1. Person: konkrete Mission ("Ich helfe X dabei, Y zu erreichen, indem ich Z…")',
          vision:'1-2 Sätze: langfristiges Bild, wofür die Marke langfristig steht',
          values:'3-5 Werte komma-getrennt (z.B. "Klarheit, Pragmatismus, Verantwortung")',
          personality:'1-2 Sätze',
          tone_attributes:['Tag1','Tag2','Tag3','Tag4'],
          formality:'du ODER sie',
          word_choice:'1-2 Sätze: typischer Wortschatz, was vermieden wird — KONKRET aus den Beispieltexten/dem Kontext abgeleitet, zitiere 2-3 typische Formulierungen in einfachen Anführungszeichen. Keine Allgemeinplätze.',
          sentence_style:'1-2 Sätze: Satzlänge, Rhythmus, Strukturmerkmale — beschreibe was die Beispieltexte TATSÄCHLICH tun (z.B. Einwort-Sätze als Stilmittel, Absatz nach jedem Satz). Keine Allgemeinplätze.',
          dos:'3 Dos mit (- ) als Prefix, je 1 Zeile — spezifisch für diese Person/Marke (aus Kontext + Beispieltexten), nichts Generisches wie authentisch sein',
          donts:'3 Donts mit (- ) als Prefix, je 1 Zeile. (- Keine Hashtags) MUSS immer dabei sein (LinkedIn-Best-Practice).',
          tonality: Object.fromEntries(sliderArr.filter(sl => sl.label && sl.label.trim()).map(sl => [sl.label.trim(), sl.value])),
          vocabulary:['keyword1','keyword2','keyword3','keyword4','keyword5'],
          glossary:[{term:'Fachbegriff aus dem Kontext',definition:'Definition in 1 Satz, so wie die Person/Marke den Begriff verwendet'}],
          linkedin_style:{
            hook_style:'EXAKT einer dieser Werte: ' + HOOK_OPTIONS.join(' | ') + ' — wähle einen spezifischen Stil NUR wenn die Beispieltexte ein klar dominantes Muster zeigen (>70% der Posts). Sonst (Abwechslungsreich variiert) — feste Hook-Formeln machen Posts vorhersehbar.',
            cta_style:'EXAKT einer dieser Werte: ' + CTA_OPTIONS.join(' | ') + ' — gleiche Regel: nur bei klar dominantem Muster festlegen, sonst (Abwechslungsreich variiert).',
            emoji_usage:'EXAKT einer dieser Werte: ' + EMOJI_OPTIONS.join(' | ') + ' — zähle die Emojis in den Beispieltexten',
            structure_preference:'1 Satz: Lieblings-Post-Struktur (z.B. Hook → Story → Lesson → CTA), aus den Beispieltexten abgeleitet'
          },
          ai_summary: isCompany
            ? '150-200 Wörter System-Prompt in 2. Person (z.B. Du schreibst als Marke <Unternehmen>…), Wir-Form in den Inhalten, der die Markenstimme auf den Punkt bringt'
            : '150-200 Wörter System-Prompt in 2. Person, der die Voice auf den Punkt bringt'
        })
      ].filter(Boolean).join('\n')

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
        body: { type:'brand_voice_summary', prompt, userId: session.user.id, model: selectedModel }
      })
      if (fnErr) throw fnErr

      let result
      const text = fnData?.text || fnData?.result || ''
      result = parseLooseJson(text)

      const brandVoice = {
        ...E0,
        name: name,
        // brand_name = Anzeigename der Marke: bei Personal der Personenname,
        // bei Company der Unternehmensname. Das company-Feld (=Branche) nie verwenden.
        brand_name: name,
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
        glossary: Array.isArray(result.glossary)
          ? result.glossary.filter(g => g && g.term && g.definition).slice(0, 8)
          : [],
        // LinkedIn-Stil auf die Editor-Dropdown-Optionen snappen — Freitext-Werte
        // würden in den Selects sonst als "leer" erscheinen
        linkedin_style: (() => {
          const ls = result.linkedin_style || {}
          const snap = (val, opts) => {
            if (!val || typeof val !== 'string') return ''
            const exact = opts.find(o => o.toLowerCase() === val.trim().toLowerCase())
            if (exact) return exact
            const fuzzy = opts.find(o => val.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(val.trim().toLowerCase().split(' ')[0]))
            return fuzzy || ''
          }
          return {
            ...ls,
            hook_style:  snap(ls.hook_style,  HOOK_OPTIONS)  || ls.hook_style  || '',
            cta_style:   snap(ls.cta_style,   CTA_OPTIONS)   || ls.cta_style   || '',
            emoji_usage: snap(ls.emoji_usage, EMOJI_OPTIONS) || ls.emoji_usage || '',
          }
        })(),
        user_id: session.user.id,
        account_type: bvType || 'personal',
        ...importData,
        imported_context: importedText || '',
      }

      // team_id ist PFLICHT — ohne aktives Team kann keine Brand Voice erstellt werden
      if (!activeTeamId) throw new Error('Kein aktives Team – bitte zuerst ein Team auswählen.')
      brandVoice.team_id = activeTeamId
      const { data: saved, error: saveErr } = await supabase.from('brand_voices').insert(brandVoice).select().single()
      if (saveErr) throw saveErr
      // Nur die Draft-Keys DIESES Typs löschen — Entwurf des anderen Typs bleibt erhalten
      const draftFields = ['step','name','position','company','offering','motivation','goal','examples','sliders2','importData','importedText']
      draftFields.forEach(f => { try { window.localStorage.removeItem('bv_w_'+f+'_'+uid+kSuffix) } catch(_) {} })
      onDone(saved)
    } catch (err) {
      setError(err.message || 'Fehler bei der Generierung')
    } finally { setGen(false) }
  }

  const WIZARD_STEPS = [
    { label: 'Kontext', sub: 'optional' },
    { label: isCo ? 'Wer seid ihr?' : 'Wer bist du?' },
    { label: isCo ? 'Wie klingt eure Marke?' : 'Wie klingt dein Stil?' },
    { label: 'Beispieltexte', sub: 'optional' },
  ]

  return (
    <WizardLayout
      eyebrow="Branding · Schritt 1 von 3"
      title={brandType==='company_page' ? 'Neue Company Brand mit KI' : 'Neue Personal Brand mit KI'}
      subtitle="In ~2 Minuten zur fertigen Brand. Du kannst alles danach noch verfeinern."
      steps={WIZARD_STEPS}
      currentStep={step + 1}
      onStepClick={(n) => setStep(n - 1)}
      onSkip={onSkip}
      onBack={onBack || onSkip}
    >

      {step===0 && (
        <Sc t="Schritt 1: Kontext importieren (optional)" ch={<>
          <Lb l="Dokument oder Website hochladen"
              h="KI analysiert den Inhalt und füllt deine Angaben automatisch vor — du kannst alles danach noch anpassen"/>
          <KnowledgeImporter
            session={session}
            storagePrefix="brand"
            showLinkedIn={true}
            linkedInMode={brandType==='company_page' ? 'company' : 'profile'}
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
              <button className="lk-btn lk-btn-primary" onClick={prefillFromContext} disabled={prefilling}
                style={{ opacity:prefilling?.6:1 }}>
                {prefilling ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={14} className="lk-spin"/>Analysiere…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={14}/>Felder automatisch befüllen</span>}
              </button>
            )}
            <button className="lk-btn lk-btn-primary" onClick={()=>setStep(1)} disabled={prefilling}
              >
              {importedText ? 'Weiter ohne Analyse →' : '→ Manuell ausfüllen'}
            </button>
          </div>
        </>}/>
      )}

      {step===1 && (
        <Sc t={bvType==='company_page' ? 'Schritt 2: Wer seid ihr?' : 'Schritt 2: Wer bist du?'} ch={<>
          {bvType==='company_page' ? (<>
            <Lb l="Unternehmensname" /><In v={name} fn={setName} ph="Name des Unternehmens"/>
            <Lb l="Claim / Tagline (optional)" /><In v={position} fn={setPos} ph="z.B. „Die LinkedIn-Suite für B2B-Teams“"/>
            <Lb l="Branche" /><In v={company} fn={setCo} ph="z.B. B2B-SaaS, Beratung, Agentur"/>
            <Lb l="Was bietet das Unternehmen an?" h="Produkte, Leistungen, Zielkunden und Outcomes — je präziser, desto besser werden Hintergrund und Mission"/>
            <Tx v={offering} fn={setOffering} r={3} ph="z.B. „Wir helfen B2B-Teams, LinkedIn als planbaren Vertriebskanal aufzubauen — mit KI-gestütztem Content, CRM und Automatisierung aus einer Hand."/>
            <Lb l="Wofür steht das Unternehmen?" h="Mission, Vision, Werte der Marke"/>
            <Tx v={motivation} fn={setMotivation} r={2} ph="z.B. „Wir glauben, dass Vertrieb auf Vertrauen basiert. Substanz schlägt Kaltakquise."/>
          </>) : (<>
          <Lb l="Name" /><In v={name} fn={setName} ph="Dein vollständiger Name"/>
          <Lb l="Position / Headline" /><In v={position} fn={setPos} ph="z.B. Head of Marketing"/>
          {/* KEIN Unternehmen-Feld: Unternehmensinfos leben im Company Brand —
              fürs Schreiben als Ambassador werden Personal + Company Brand kombiniert. */}
          <Lb l="Was machst du — und worin bist du richtig gut?" h="Tätigkeit, Expertise und Themen, zu denen du sprichst — je konkreter, desto besser werden Hintergrund und Mission"/>
          <Tx v={offering} fn={setOffering} r={3} ph="z.B. „Ich baue B2B-SaaS-Unternehmen auf und beschäftige mich täglich mit LinkedIn-Vertrieb, Positionierung und KI im Sales. Meine Stärke: komplexe Themen in umsetzbare Systeme übersetzen. In den letzten 2 Jahren mit 40+ Founders gearbeitet."/>
          <Lb l="Was treibt dich an?" h="Mission, Vision, Werte — warum machst du das, wofür stehst du langfristig"/>
          <Tx v={motivation} fn={setMotivation} r={2} ph="z.B. „Ich glaube, dass die besten Operator unterschätzt werden, weil sie nicht laut genug sind. Klarheit schlägt Hype. Ich will, dass mehr substanzielle Stimmen auf LinkedIn gehört werden."/>
          </>)}
          <button className="lk-btn lk-btn-primary" onClick={()=>setStep(2)} disabled={!name.trim()} style={{ opacity:name.trim()?1:.5, marginTop:8 }}>
            Weiter →
          </button>
        </>}/>
      )}

      {step===2 && (
        <Sc t={isCo ? 'Schritt 3: Wie klingt eure Marke?' : 'Schritt 3: Wie klingt dein Stil?'} ch={<>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12, lineHeight:1.5 }}>
            Die Adjektive sind anpassbar — bei einem Import wählt die KI-Analyse automatisch die 5 passendsten für {isCo ? 'die Marke' : 'dich'} aus.
          </div>
          {sliderArr.map((sl, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6, gap:8 }}>
                <input value={sl.label} onChange={e => updSlider(i, { label: e.target.value })} placeholder="Adjektiv (z.B. Direkt)"
                  style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)', border:'none', borderBottom:'1.5px dashed #dde3ea', background:'transparent', outline:'none', padding:'2px 0', width:200 }}/>
                <span style={{ fontSize:12, color:'var(--text-muted)', display:'inline-flex', alignItems:'center', gap:10 }}>
                  {sl.value}%
                  <button type="button" onClick={() => removeSlider(i)} title="Entfernen"
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#ccc', fontSize:15, lineHeight:1, padding:0 }}>×</button>
                </span>
              </div>
              <input type="range" min={0} max={100} step={5}
                value={sl.value}
                onChange={e => updSlider(i, { value: parseInt(e.target.value, 10) })}
                style={{ width:'100%', accentColor:'var(--wl-primary, #0A6FB0)' }}/>
            </div>
          ))}
          <button type="button" onClick={addSlider}
            style={{ padding:'5px 12px', background:'none', border:'1.5px dashed #dde3ea', borderRadius:6, fontSize:12, color:'#888', cursor:'pointer', marginBottom:12 }}>
            + Tonalität hinzufügen
          </button>
          <Lb l={isCo ? 'Ziel der Company Page' : 'Dein LinkedIn-Ziel'} />
          <select value={goal} onChange={e=>setGoal(e.target.value)} style={{ width:'100%', padding:'8px 11px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:13 }}>
            {GOAL_LIST.map(g => <option key={g}>{g}</option>)}
          </select>
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={()=>setStep(1)} style={{ padding:'10px 24px', background:'#f5f5f5', border:'none', borderRadius:8, fontSize:14, cursor:'pointer' }}>← Zurück</button>
            <button className="lk-btn lk-btn-primary" onClick={()=>setStep(3)} >Weiter →</button>
          </div>
        </>}/>
      )}

      {step===3 && (
        <Sc t="Schritt 4: Beispieltexte (optional)" ch={<>
          <Lb l={isCo ? 'Beiträge der Company Page' : 'Eigene Texte'} h={isCo ? 'Page-Beiträge oder Marketing-Texte — KI lernt den Marken-Stil daraus' : 'LinkedIn-Posts, Artikel — KI lernt deinen Stil daraus'}/>
          <Tx v={examples} fn={setEx} r={6} ph={isCo ? 'Füge hier 1-3 Beiträge eurer Company Page ein...' : 'Füge hier 1-3 eigene LinkedIn-Posts ein...'}/>
          {examples && examples.includes('\n\n---\n\n') && (
            <div style={{ fontSize:11, color:'#22c55e', background:'#f0fdf4', padding:'6px 10px', borderRadius:6, marginTop:4 }}>
              ✓ Mit Beiträgen aus dem LinkedIn-Import vorbefüllt — du kannst sie bearbeiten oder ersetzen
            </div>
          )}
          {error && <div style={{ color:'#e53e3e', fontSize:12 }}>{error}</div>}
          {importedText && (
            <div style={{ fontSize:11, color:'#22c55e', background:'#f0fdf4', padding:'6px 10px', borderRadius:6 }}>
              ✓ {importedText.length.toLocaleString()} Zeichen Kontext aus Schritt 0 fließen in Generierung ein
            </div>
          )}
          {generating && <GenerationLoading title={isCo ? 'Company Brand wird gebaut' : 'Personal Brand wird gebaut'} expectedSeconds={45} />}
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={()=>setStep(2)} disabled={generating} style={{ padding:'10px 24px', background:'#f5f5f5', border:'none', borderRadius:8, fontSize:14, cursor:generating?'not-allowed':'pointer', opacity:generating?.5:1 }}>← Zurück</button>
            <button className="lk-btn lk-btn-cta" onClick={generate} disabled={generating} style={{ opacity:generating?.6:1 }}>
              {generating ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={14} className="lk-spin"/>KI generiert…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={14}/>{isCo ? 'Company Brand generieren' : 'Personal Brand generieren'}</span>}
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
  const [dragOver, setDragOver] = React.useState(false)

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
    <div
      onDragOver={e => { if (edit?.id && paths.length < max) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); if (!edit?.id) return; const imgs = Array.from(e.dataTransfer.files || []).filter(x => x.type.startsWith('image/')); if (imgs.length) uploadImgs(imgs) }}
      style={{ padding:'12px 14px', background: dragOver ? 'rgba(10,111,176,0.06)' : '#FAFAFA', border:'1.5px solid ' + (dragOver ? 'var(--wl-primary, #0A6FB0)' : 'var(--border)'), borderRadius:10, flex:'1 1 320px', minWidth:280, transition:'background .12s, border-color .12s' }}>
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
      {edit?.id && paths.length < max && (
        <div style={{ fontSize:10.5, color:'var(--text-soft, #9CA3AF)', marginTop:8 }}>Mehrere Dateien auf einmal möglich — per Mehrfachauswahl oder Drag &amp; Drop hierher.</div>
      )}
      {!edit?.id && (
        <div style={{ fontSize:11, color:'#92400E', marginTop:8 }}>Speichere die Brand Voice zuerst, dann kannst du hier hochladen.</div>
      )}
    </div>
  )
}

// ─── Markenfarben (brand_colors jsonb mit Rollen, gespiegelt nach visual_color_palette) ─
function BrandColorsEditor({ edit, u }) {
  const bc  = (edit?.brand_colors && typeof edit.brand_colors === 'object' && !Array.isArray(edit.brand_colors)) ? edit.brand_colors : {}
  const pal = Array.isArray(edit?.visual_color_palette) ? edit.visual_color_palette : []
  const primary    = bc.primary    ?? pal[0] ?? ''
  const secondary  = bc.secondary  ?? pal[1] ?? ''
  const accent     = bc.accent     ?? pal[2] ?? ''
  const additional = Array.isArray(bc.additional) ? bc.additional : (pal.slice(3) || [])
  const [draft, setDraft] = React.useState('')

  function commit(next) {
    u('brand_colors', next)
    const flat = [next.primary, next.secondary, next.accent, ...(next.additional || [])].filter(Boolean)
    u('visual_color_palette', flat)
  }
  const base = () => ({ primary, secondary, accent, additional })
  const setRole = (role, hex) => commit({ ...base(), [role]: hex })
  const addExtra = (hex) => { if (additional.includes(hex)) return; commit({ ...base(), additional:[...additional, hex] }) }
  const removeExtra = (i) => commit({ ...base(), additional: additional.filter((_, j) => j !== i) })
  function tryAddDraft() {
    const h = (draft || '').trim()
    if (!/^#?[0-9a-fA-F]{6}$/.test(h)) { alert('Bitte gültigen Hex-Code, z.B. #0A6FB0'); return }
    addExtra(h.startsWith('#') ? h.toUpperCase() : '#' + h.toUpperCase())
    setDraft('')
  }
  const colSlot = (label, role, val) => (
    <div style={{ flex:'1 1 160px', minWidth:150 }}>
      <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', marginBottom:6 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(val || '') ? val : '#FFFFFF'} onChange={e=>setRole(role, e.target.value.toUpperCase())}
          style={{ width:30, height:30, padding:0, border:'1px solid var(--border)', borderRadius:6, background:'#fff', cursor:'pointer', flexShrink:0 }}/>
        <input value={val || ''} onChange={e=>setRole(role, e.target.value)} placeholder="#RRGGBB"
          style={{ flex:1, minWidth:0, padding:'6px 8px', fontSize:12, border:'1px solid var(--border)', borderRadius:6 }}/>
        {val ? <button type="button" onClick={()=>setRole(role,'')} style={{ border:'none', background:'transparent', cursor:'pointer', color:'#ef4444', padding:0, lineHeight:1, flexShrink:0 }}><X size={12} strokeWidth={2}/></button> : null}
      </div>
    </div>
  )
  return (
    <div style={{ padding:'12px 14px', background:'#FAFAFA', border:'1.5px solid var(--border)', borderRadius:10, flex:'1 1 100%', minWidth:280 }}>
      <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}><Palette size={14} strokeWidth={1.75} style={{verticalAlign:'-2px'}}/> Markenfarben</div>
      <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.5, marginBottom:12 }}>Definiere die CI-Farben mit Rolle (Primär zuerst). Fließen als Farbvorgabe in jede Bild-Generierung dieses Brands ein.</div>
      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:4 }}>
        {colSlot('Primärfarbe', 'primary', primary)}
        {colSlot('Sekundärfarbe', 'secondary', secondary)}
        {colSlot('Akzentfarbe', 'accent', accent)}
      </div>
      <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', margin:'10px 0 6px' }}>Weitere Farben (optional)</div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        {additional.map((c, i) => (
          <div key={i} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px 4px 4px', background:'#fff', border:'1px solid var(--border)', borderRadius:8 }}>
            <span style={{ width:22, height:22, borderRadius:6, background:c, border:'1px solid rgba(0,0,0,0.12)', display:'inline-block' }}/>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text-primary)' }}>{c}</span>
            <button type="button" onClick={()=>removeExtra(i)} style={{ border:'none', background:'transparent', cursor:'pointer', color:'#ef4444', padding:0, lineHeight:1 }}><X size={12} strokeWidth={2}/></button>
          </div>
        ))}
        <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft) ? draft : '#E5E7EB'} onChange={e=>setDraft(e.target.value.toUpperCase())}
            style={{ width:30, height:30, padding:0, border:'1px solid var(--border)', borderRadius:6, background:'#fff', cursor:'pointer' }}/>
          <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="#RRGGBB"
            onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); tryAddDraft() } }}
            style={{ width:84, padding:'6px 8px', fontSize:12, border:'1px solid var(--border)', borderRadius:6 }}/>
          <button className="lk-btn lk-btn-primary" type="button" onClick={tryAddDraft} >+</button>
        </div>
      </div>
    </div>
  )
}

// ─── Schriftarten (brand_fonts jsonb {primary, secondary, notes}) ───────────
function BrandFontsEditor({ edit, u }) {
  const fonts = (edit?.brand_fonts && typeof edit.brand_fonts === 'object') ? edit.brand_fonts : {}
  const set = (k, v) => u('brand_fonts', { ...fonts, [k]: v })
  const inputStyle = { width:'100%', padding:'8px 10px', fontSize:12, border:'1px solid var(--border)', borderRadius:8, marginBottom:8, boxSizing:'border-box' }
  return (
    <div style={{ padding:'12px 14px', background:'#FAFAFA', border:'1.5px solid var(--border)', borderRadius:10, flex:'1 1 320px', minWidth:280 }}>
      <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>Aa Schriftarten</div>
      <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.5, marginBottom:10 }}>Typografie der CI — wird bei Visuals mit Text-Overlays als Vorgabe mitgegeben.</div>
      <input style={inputStyle} value={fonts.primary || ''} onChange={e=>set('primary', e.target.value)} placeholder="Primäre Schrift (z.B. Inter Bold — Headlines)"/>
      <input style={inputStyle} value={fonts.secondary || ''} onChange={e=>set('secondary', e.target.value)} placeholder="Sekundäre Schrift (z.B. Inter Regular — Fließtext)"/>
      <input style={{...inputStyle, marginBottom:0}} value={fonts.notes || ''} onChange={e=>set('notes', e.target.value)} placeholder="Hinweise (z.B. nur Kleinschreibung, Letterspacing weit)"/>
    </div>
  )
}

// ─── CI-Booklet (PDF-Upload, ci_booklet_paths) ──────────────────────────────
function BookletEditor({ edit, u, activeTeamId }) {
  const paths = Array.isArray(edit?.ci_booklet_paths) ? edit.ci_booklet_paths : []
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const MAX = 2
  async function uploadPdfs(fileList) {
    const files = Array.from(fileList || []).filter(x => x.type === 'application/pdf' || /\.pdf$/i.test(x.name))
    if (!files.length) return
    if (!edit?.id) { alert('Bitte die Brand Voice zuerst speichern'); return }
    if (!activeTeamId) { alert('Kein Team aktiv — kann nicht hochladen'); return }
    const remaining = MAX - paths.length
    if (remaining <= 0) { alert('Max ' + MAX + ' Dateien'); return }
    const toUpload = files.slice(0, remaining)
    if (files.length > remaining) alert('Max ' + MAX + ' Dateien — es werden nur die ersten ' + remaining + ' hochgeladen')
    setUploading(true)
    const added = []
    try {
      for (const file of toUpload) {
        if (file.size > 25 * 1024 * 1024) { alert('„' + file.name + '" zu groß (max 25 MB) — übersprungen'); continue }
        const newPath = activeTeamId + '/bv-booklet/' + edit.id + '/' + crypto.randomUUID() + '__' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const { error: upErr } = await supabase.storage.from('visuals').upload(newPath, file, { contentType: file.type || 'application/pdf', upsert: false })
        if (upErr) { alert('Upload „' + file.name + '" fehlgeschlagen: ' + upErr.message); continue }
        added.push(newPath)
      }
      if (added.length) {
        const nextPaths = [...paths, ...added]
        const { error: dbErr } = await supabase.from('brand_voices').update({ ci_booklet_paths: nextPaths }).eq('id', edit.id)
        if (dbErr) { alert('DB-Update fehlgeschlagen: ' + dbErr.message); return }
        u('ci_booklet_paths', nextPaths)
      }
    } finally { setUploading(false) }
  }
  async function removePdf(idx) {
    const removed = paths[idx]
    const nextPaths = paths.filter((_, i) => i !== idx)
    const { error: dbErr } = await supabase.from('brand_voices').update({ ci_booklet_paths: nextPaths }).eq('id', edit.id)
    if (dbErr) { alert('DB-Update fehlgeschlagen: ' + dbErr.message); return }
    if (removed) await supabase.storage.from('visuals').remove([removed])
    u('ci_booklet_paths', nextPaths)
  }
  async function download(p) {
    const { data, error } = await supabase.storage.from('visuals').download(p)
    if (error || !data) { alert('Download fehlgeschlagen'); return }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a'); a.href = url; a.download = (p.split('__').pop() || 'ci-booklet.pdf'); a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div
      onDragOver={e => { if (edit?.id && paths.length < MAX) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); if (edit?.id) uploadPdfs(e.dataTransfer.files) }}
      style={{ padding:'12px 14px', background: dragOver ? 'rgba(10,111,176,0.06)' : '#FAFAFA', border:'1.5px solid ' + (dragOver ? 'var(--wl-primary, #0A6FB0)' : 'var(--border)'), borderRadius:10, flex:'1 1 320px', minWidth:280, transition:'background .12s, border-color .12s' }}>
      <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}><FileText size={14} strokeWidth={1.75} style={{verticalAlign:'-2px'}}/> CI-Booklet / Brand Guide</div>
      <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.5, marginBottom:10 }}>Styleguide als PDF (max {MAX}). Dient als Referenz für das Team — Inhalte kannst du zusätzlich über den Import in die Voice einfließen lassen.</div>
      {paths.map((p, i) => (
        <div key={p} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'#fff', border:'1px solid var(--border)', borderRadius:8, marginBottom:6 }}>
          <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(p.split('__').pop() || p)}</span>
          <button className="lk-btn lk-btn-ghost" type="button" onClick={() => download(p)} >Download</button>
          <button type="button" onClick={() => removePdf(i)} style={{ border:'none', background:'transparent', cursor:'pointer', color:'#ef4444', padding:0 }}><X size={14} strokeWidth={2}/></button>
        </div>
      ))}
      {paths.length < MAX && (
        <label style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'1.5px dashed var(--border)', cursor: uploading ? 'wait' : 'pointer', fontSize:12, color:'var(--text-muted)', background:'#fff' }}>
          {uploading ? <Loader2 size={13} className="lk-spin"/> : <Plus size={13}/>} {uploading ? 'Lade…' : 'PDF hochladen (oder hierher ziehen)'}
          <input type="file" multiple accept="application/pdf" onChange={e => { uploadPdfs(e.target.files); e.target.value = '' }} style={{ display:'none' }}/>
        </label>
      )}
      {!edit?.id && <div style={{ fontSize:11, color:'#92400E', marginTop:8 }}>Speichere die Brand Voice zuerst, dann kannst du hier hochladen.</div>}
    </div>
  )
}

// ─── Schriftarten-Upload (eigene Font-Dateien, brand_voices.font_assets) ─────
// Nutzt src/lib/brandFonts.js. Hochgeladene Schriften stehen anschließend im
// Content-Werkstatt-Designer zur Verfügung. Asset = { name, path, format, family }.
function BrandFontUploadEditor({ edit, u, activeTeamId }) {
  const bvId = edit?.id || null
  const assets = Array.isArray(edit?.font_assets) ? edit.font_assets : []
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const [error, setError] = React.useState('')
  const [renamingPath, setRenamingPath] = React.useState(null)
  const [renameValue, setRenameValue] = React.useState('')
  const [previewTick, setPreviewTick] = React.useState(0)

  // Beim Laden der Brand Voice: existierende Fonts aus der DB lesen + per
  // FontFace-API laden, damit die Vorschau-Zeilen in der eigenen Schrift rendern.
  React.useEffect(() => {
    let cancelled = false
    if (!bvId) return
    ;(async () => {
      const { data } = await listBrandFonts(bvId)
      if (cancelled) return
      const list = Array.isArray(data) ? data : []
      // Form-State spiegeln, falls noch nicht vorhanden
      u('font_assets', list)
      await loadBrandFonts(list)
      if (!cancelled) setPreviewTick(t => t + 1)
    })()
    return () => { cancelled = true }
  }, [bvId])

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    if (!bvId) { setError('Bitte die Brand Voice zuerst speichern, dann kannst du Schriften hochladen.'); return }
    if (!activeTeamId) { setError('Kein Team aktiv — kann nicht hochladen.'); return }
    setError('')
    const invalid = files.filter(f => !isAllowedFontFile(f.name))
    if (invalid.length) {
      setError('Nur .woff2, .woff, .ttf oder .otf erlaubt: ' + invalid.map(f => f.name).join(', '))
    }
    const valid = files.filter(f => isAllowedFontFile(f.name))
    if (!valid.length) return
    setUploading(true)
    let latest = null
    try {
      for (const file of valid) {
        const { data, all, error: upErr } = await uploadBrandFont(activeTeamId, bvId, file)
        if (upErr) { setError('Upload „' + file.name + '" fehlgeschlagen: ' + (upErr.message || 'Fehler')); continue }
        if (all) latest = all
        if (data) { try { await loadBrandFonts([data]) } catch (_e) {} }
      }
      if (latest) u('font_assets', latest)
      setPreviewTick(t => t + 1)
    } finally { setUploading(false) }
  }

  async function handleDelete(path) {
    if (!bvId) return
    if (!window.confirm('Diese Schrift wirklich entfernen?')) return
    const { error: delErr, all } = await deleteBrandFont(bvId, path)
    if (delErr) { setError('Löschen fehlgeschlagen: ' + (delErr.message || 'Fehler')); return }
    if (all) u('font_assets', all)
  }

  function startRename(asset) { setRenamingPath(asset.path); setRenameValue(asset.name || asset.family || '') }
  async function commitRename(path) {
    const clean = (renameValue || '').trim()
    if (!bvId || !clean) { setRenamingPath(null); return }
    const { error: renErr, all } = await renameBrandFont(bvId, path, clean)
    if (renErr) { setError('Umbenennen fehlgeschlagen: ' + (renErr.message || 'Fehler')); return }
    if (all) {
      u('font_assets', all)
      try { await loadBrandFonts(all) } catch (_e) {}
      setPreviewTick(t => t + 1)
    }
    setRenamingPath(null)
  }

  return (
    <div
      onDragOver={e => { if (edit?.id) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); if (edit?.id) handleFiles(e.dataTransfer.files) }}
      style={{ padding:'12px 14px', background: dragOver ? 'rgba(10,111,176,0.06)' : '#FAFAFA', border:'1.5px solid ' + (dragOver ? 'var(--wl-primary, #0A6FB0)' : 'var(--border)'), borderRadius:10, flex:'1 1 100%', minWidth:280, transition:'background .12s, border-color .12s' }}>
      <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>Aa Schriftarten</div>
      <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.5, marginBottom:10 }}>Eigene Schrift-Dateien hochladen. Hochgeladene Schriften stehen anschließend im Content-Werkstatt-Designer zur Verfügung.</div>

      {/* Upload-Bereich */}
      <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, padding:'18px 14px', borderRadius:10, border:'1.5px dashed var(--border)', cursor: uploading ? 'wait' : 'pointer', fontSize:12.5, color:'var(--text-muted)', background:'#fff', textAlign:'center' }}>
        {uploading
          ? <span style={{ display:'inline-flex', alignItems:'center', gap:6, color:'var(--text-primary)', fontWeight:600 }}><Loader2 size={15} className="lk-spin"/>Lade hoch…</span>
          : <>
              <Upload size={18} strokeWidth={1.75} style={{ color:'var(--wl-primary, #0A6FB0)' }}/>
              <span style={{ fontWeight:600, color:'var(--text-primary)' }}>Schrift hochladen (.woff2, .woff, .ttf, .otf)</span>
              <span style={{ fontSize:11 }}>Mehrere Dateien möglich · oder hierher ziehen</span>
            </>}
        <input type="file" multiple accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
          disabled={uploading || !edit?.id}
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
          style={{ display:'none' }}/>
      </label>

      {error && <div style={{ color:'#e53e3e', fontSize:12, marginTop:8, lineHeight:1.5 }}>{error}</div>}
      {!edit?.id && <div style={{ fontSize:11, color:'#92400E', marginTop:8 }}>Speichere die Brand Voice zuerst, dann kannst du hier Schriften hochladen.</div>}

      {/* Liste hochgeladener Schriften */}
      {assets.length > 0 ? (
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
          {assets.map((a) => (
            <div key={a.path} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#fff', border:'1px solid var(--border)', borderRadius:8 }}>
              <div style={{ flex:1, minWidth:0 }}>
                {renamingPath === a.path ? (
                  <input autoFocus value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(a.path) } if (e.key === 'Escape') setRenamingPath(null) }}
                    onBlur={() => commitRename(a.path)}
                    style={{ width:'100%', padding:'5px 8px', fontSize:13, fontWeight:600, border:'1.5px solid var(--wl-primary, #0A6FB0)', borderRadius:6, boxSizing:'border-box' }}/>
                ) : (
                  <>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {a.name || a.family} <span style={{ fontSize:10.5, fontWeight:600, color:'var(--text-soft, #9CA3AF)', textTransform:'uppercase', marginLeft:4 }}>{a.format}</span>
                    </div>
                    <div key={previewTick} style={{ fontFamily: a.family, fontSize:19, color:'var(--text-primary)', lineHeight:1.3, marginTop:2 }}>
                      Aa Bb Cc 123
                    </div>
                  </>
                )}
              </div>
              {renamingPath !== a.path && (
                <>
                  <button className="lk-btn lk-btn-ghost" type="button" onClick={() => startRename(a)} title="Umbenennen"
                    >
                    Umbenennen
                  </button>
                  <button type="button" onClick={() => handleDelete(a.path)} title="Entfernen"
                    style={{ border:'none', background:'transparent', cursor:'pointer', color:'#ef4444', padding:0, lineHeight:1 }}>
                    <Trash2 size={15} strokeWidth={1.75}/>
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        edit?.id && !uploading && (
          <div style={{ fontSize:11.5, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
            Noch keine Schriften hochgeladen. Hochgeladene Schriften stehen anschließend im Content-Werkstatt-Designer zur Verfügung.
          </div>
        )
      )}
    </div>
  )
}

// ─── Visuelle Identität — typabhängiger Container ───────────────────────────
// personal     → nur Personen-Bilder (hero_image_paths)
// company_page → Logos (logo_paths) + CI-Bibliothek + Farben + Fonts + CI-Booklet
// other        → Personen-Bilder + CI-Bibliothek (bisheriges Verhalten)
function VisualIdentityEditor({ edit, u, session, activeTeamId }) {
  const type = edit?.account_type || 'personal'
  const hero = (
    <BVImagesEditor edit={edit} u={u} session={session} activeTeamId={activeTeamId}
      field="hero_image_paths" icon={<UserCircle size={14} strokeWidth={1.75} style={{verticalAlign:'-2px'}}/>} label="Bilder von dir / der Person"
      hint="Bis zu 6 Bilder (Headshot, Lifestyle-Aufnahmen). Werden als Identity-Referenz mitgesendet — sorgt für wiedererkennbare Personen in generierten Bildern."
      max={6} folder="bv-hero" fileLabel="Personen-Bilder"/>
  )
  const ci = (
    <BVImagesEditor edit={edit} u={u} session={session} activeTeamId={activeTeamId}
      field="ci_image_paths" icon={<Palette size={18} strokeWidth={1.75}/>} label="CI-Bibliothek"
      hint="Bis zu 8 Markenelemente (Favicons, Farb-Samples, Brand-Patterns, Beispiel-Designs). Werden als Stil-Referenz mitgesendet."
      max={8} folder="bv-ci" fileLabel="CI-Elemente"/>
  )
  if (type === 'company_page') {
    return (
      <div style={{ marginTop:14 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:8 }}>Visuelle Identität</div>
        {/* Reihe 1: Logos | Favicons */}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <BVImagesEditor edit={edit} u={u} session={session} activeTeamId={activeTeamId}
            field="logo_paths" icon={<Building2 size={15} strokeWidth={1.75} style={{verticalAlign:'-2px'}}/>} label="Logos"
            hint="Bis zu 4 Logo-Varianten (primär zuerst; hell/dunkel, Bildmarke). PNG/SVG mit Transparenz ideal — werden bei Bild-Generierungen als Marken-Referenz genutzt."
            max={4} folder="bv-logo" fileLabel="Logos"/>
          <BVImagesEditor edit={edit} u={u} session={session} activeTeamId={activeTeamId}
            field="favicon_paths" icon={<Star size={15} strokeWidth={1.75} style={{verticalAlign:'-2px'}}/>} label="Favicons"
            hint="Quadratisches App-Icon / Favicon der Marke. Wird bei Bild-Generierungen als Marken-Referenz mitgesendet."
            max={4} folder="bv-favicon" fileLabel="Favicons"/>
        </div>
        {/* Reihe 2: Markenfarben über die ganze Breite */}
        <div style={{ display:'flex', gap:12, marginTop:12 }}>
          <BrandColorsEditor edit={edit} u={u}/>
        </div>
        {/* Reihe 2b: Schriftarten-Upload (eigene Font-Dateien für den Designer) */}
        <div style={{ display:'flex', gap:12, marginTop:12 }}>
          <BrandFontUploadEditor edit={edit} u={u} activeTeamId={activeTeamId}/>
        </div>
        {/* Reihe 3: CI-Booklet / Brand Guideline | Beispiel-Designs & Referenzbilder */}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:12 }}>
          <BookletEditor edit={edit} u={u} activeTeamId={activeTeamId}/>
          <BVImagesEditor edit={edit} u={u} session={session} activeTeamId={activeTeamId}
            field="ci_image_paths" icon={<ImageIcon size={15} strokeWidth={1.75} style={{verticalAlign:'-2px'}}/>} label="Beispiel-Designs & Referenzbilder"
            hint="Bis zu 8 Beispiel-Designs, Brand-Patterns oder Referenzbilder. Werden als Stil-Referenz bei Bild-Generierungen mitgesendet."
            max={8} folder="bv-ci" fileLabel="Referenzen"/>
        </div>
      </div>
    )
  }
  if (type === 'personal') {
    return <div style={{ marginTop:14, display:'flex', gap:12, flexWrap:'wrap' }}>{hero}</div>
  }
  return <div style={{ marginTop:14, display:'flex', gap:12, flexWrap:'wrap' }}>{hero}{ci}</div>
}

// Zwei-Spalten-Container für Personen + CI
function HeroImagesEditor({ edit, u, session, activeTeamId }) {
  return (
    <div style={{ marginTop:14, display:'flex', gap:12, flexWrap:'wrap' }}>
      <BVImagesEditor
        edit={edit} u={u} session={session} activeTeamId={activeTeamId}
        field="hero_image_paths"
        icon={<UserCircle size={14} strokeWidth={1.75} style={{verticalAlign:'-2px'}}/>}
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

export default function BrandVoice({ session, brandType = 'personal' }) {
  // Getrennte Seiten: /personal-brand (personal + other + legacy null) vs /company-brand (company_page)
  const isCompanyPage = brandType === 'company_page'
  const TYPE_LABEL = isCompanyPage ? 'Company Brand' : 'Personal Brand'
  const { team, activeTeamId, members } = useTeam()
  const { reload: reloadBVContext, activeBrandVoice, switchBrandVoice } = useBrandVoice()
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
      const suffix = isCompanyPage ? '_co' : ''
      return fields.some(prefix => {
        const v = window.localStorage.getItem(prefix + uid + suffix)
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
  // Typ der gerade bearbeiteten Brand (Editor-Texte hängen daran)
  const editIsCompany = (edit?.account_type || 'personal') === 'company_page'
  const [tab, setTab]         = useState('marke')
  const [genSummary, setGenSummary] = useState(false)
  const { model: selectedModel, setModel: setSelectedModel } = useModel()

  useEffect(() => { loadVoices() }, [session, activeTeamId, brandType])

  // Beim Wechsel Personal<->Company Brand (Sidebar) zur Übersicht zurück, nicht im Editor bleiben
  const prevBrandTypeRef = React.useRef(brandType)
  useEffect(() => {
    if (prevBrandTypeRef.current !== brandType) {
      prevBrandTypeRef.current = brandType
      setView('list'); setEdit(null)
    }
  }, [brandType]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadVoices() {
    setLoading(true)
    // BVs sind team-scoped — User sieht nur BVs des aktiven Teams.
    // Zusätzlich filtert RLS auf Owner/is_shared/Selektiv-Shares.
    if (!activeTeamId) { setVoices([]); setLoading(false); return }
    const _shared = await sharedEntityIds('brand_voices', activeTeamId)
    const { data } = await scopeByTeamOrShared(supabase.from('brand_voices').select('*'), activeTeamId, _shared).order('created_at', { ascending: false })
    const filtered = (data || []).filter(v => isCompanyPage ? v.account_type === 'company_page' : v.account_type !== 'company_page')
    setVoices(filtered)
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
      // team_id ist PFLICHT beim Neuanlegen
      if (!activeTeamId) { alert('Kein aktives Team – bitte zuerst ein Team auswählen.'); return }
      rest.team_id = activeTeamId
      const { data: inserted } = await supabase.from('brand_voices').insert(rest).select('id').single()
      if (inserted?.id) { try { await switchBrandVoice(inserted.id) } catch(_) {} }
    }
    // View-Switch SYNCHRON vor dem Context-Reload, damit
    // re-render durch reloadBVContext den view nicht clobbern kann
    setView('list')
    setEdit(null)
    loadVoices()
    reloadBVContext()
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
    reloadBVContext()
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
  // Popups für Personal-Brand-Header-Buttons (Sichtbarkeit / LinkedIn verbinden)
  const [showLiModal, setShowLiModal] = useState(false)
  const [showVisibilityModal, setShowVisibilityModal] = useState(false)
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
    { v:'marke',      label: isCompanyPage ? 'Marke' : 'Identität', icon: isCompanyPage ? <Building2 size={16} strokeWidth={1.75}/> : <UserCircle size={16} strokeWidth={1.75}/>, color:'blue',   sub: isCompanyPage ? 'Identität & Werte' : 'Über dich & Werte' },
    { v:'tonalitaet', label:'Tonalität',       icon:<BarChart3 size={14} strokeWidth={1.75}/>, color:'green',  sub:'Wie stark, was wie' },
    { v:'sprache',    label:'Sprache',         icon:<PenLine size={14} strokeWidth={1.75}/>, color:'amber',  sub:'Wortwahl & Stil' },
  ]

  // ─── List View ────────────────────────────────────────────────
  if (view === 'list') {
    if (loading) return <div style={{textAlign:'center',color:'var(--text-muted)',padding:60}}>Laden…</div>

    // Empty-State: Hero mit animiertem Logo
    if (voices.length === 0) return (
      <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'12px 16px' }}>
        {hasWizardDraft && (
          <div data-tick={draftCheckTick} style={{ marginTop:14, marginBottom:0, padding:'12px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.30)', borderRadius:10, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <FileText size={18} strokeWidth={1.75} style={{ color:'var(--wl-primary, #0A6FB0)' }}/>
            <div style={{ flex:1, minWidth:220 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#92400E' }}>Du hast einen unfertigen Brand-Entwurf</div>
              <div style={{ fontSize:11, color:'#92400E', opacity:.9 }}>Deine Eingaben sind gespeichert — du kannst dort weitermachen.</div>
            </div>
            <button onClick={()=>setView('wizard')} style={{ padding:'7px 14px', background:P, color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
              <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={14}/>Fortsetzen</span>
            </button>
            <button onClick={()=>{ const draftSuffix = isCompanyPage ? '_co' : ''; ['step','name','position','company','offering','motivation','goal','examples','sliders2','importData','importedText'].forEach(f => { try { window.localStorage.removeItem('bv_w_'+f+'_'+uid+draftSuffix) } catch(_) {} }); setDraftCheckTick(t=>t+1) }} style={{ padding:'7px 14px', background:'transparent', color:'#92400E', border:'1px solid rgba(146,64,14,0.30)', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
              Verwerfen
            </button>
          </div>
        )}
        <EmptyHero
          eyebrow="Schritt 1 · Branding"
          title={isCompanyPage ? 'Lass uns deine Company Brand definieren' : 'Lass uns deine Personal Brand definieren'}
          subtitle={isCompanyPage
            ? 'Die Company Brand steuert Tonalität, Fakten und CI aller Inhalte deiner LinkedIn Company Page — inklusive Logos, Farben und Schriftarten. In ~2 Minuten zur ersten Brand.'
            : 'Deine Personal Brand steuert Tonalität, Wortwahl und Stil aller LinkedIn-Inhalte — vom Profilslogan bis zum nächsten Post. In ~2 Minuten zur ersten Brand.'}
          primaryLabel={isCompanyPage ? 'Neue Company Brand mit KI' : 'Neue Personal Brand mit KI'}
          primaryTourId="brand-new-ai"
          onPrimary={()=>{ const draftSuffix = isCompanyPage ? '_co' : ''; ['step','name','position','company','offering','motivation','goal','examples','sliders2','importData','importedText'].forEach(f => { try { window.localStorage.removeItem('bv_w_'+f+'_'+uid+draftSuffix) } catch(_) {} }); clearTabPersistedKey('ki_tab_brand'); setView('wizard') }}
          secondaryLabel="→ oder manuell erstellen"
          onSecondary={()=>{ setEdit({...E0, user_id:session.user.id, account_type:brandType}); setView('editor'); setTab('marke') }}
          helperText="Nächste Schritte: Zielgruppen definieren und Wissensdatenbank befüllen — alles baut auf der Brand Voice auf."
        />
      </div>
    )

    // List-View mit Inhalten: Journal-Header + Karten
    return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Journal-Style-Header */}
      <div style={{ marginBottom:22 }}>
        <div className="lk-eyebrow" style={{ fontSize:12, fontWeight:700, letterSpacing:'1.6px', textTransform:'uppercase', fontFamily:'Inter, sans-serif', color:'var(--primary, #003060)', marginBottom:6 }}>Branding · Schritt 1 von 3</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>{isCompanyPage ? 'Deine Company Brands.' : 'Deine Personal Brands.'}</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>{isCompanyPage ? 'Die Markenstimme deines Unternehmens — für Page-Content, Profiltexte und CI-konforme Visuals.' : 'Markenstimme, die jeden generierten Text trägt. Eine ist aktiv, weitere als Vorlagen.'}</p>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-start', gap:10, marginBottom:18 }}>
        <button className="lk-btn lk-btn-cta" data-tour-id="brand-new-ai" onClick={()=>{ const draftSuffix = isCompanyPage ? '_co' : ''; ['step','name','position','company','offering','motivation','goal','examples','sliders2','importData','importedText'].forEach(f => { try { window.localStorage.removeItem('bv_w_'+f+'_'+uid+draftSuffix) } catch(_) {} }); clearTabPersistedKey('ki_tab_brand'); setView('wizard') }} >
          {isCompanyPage ? 'Neue Company Brand mit KI' : 'Neue Personal Brand mit KI'}
        </button>
        <button className="lk-btn lk-btn-ghost" onClick={()=>{ setEdit({...E0, user_id:session.user.id, account_type:brandType}); setView('editor'); setTab('marke') }}
          >
          + Manuell erstellen
        </button>
      </div>

      {/* Wizard-Draft-Recovery-Banner */}
      {hasWizardDraft && (
        <div data-tick={draftCheckTick} style={{ marginBottom:16, padding:'12px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.30)', borderRadius:10, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <FileText size={18} strokeWidth={1.75} style={{ color:'var(--wl-primary, #0A6FB0)' }}/>
          <div style={{ flex:1, minWidth:220 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#92400E' }}>Du hast einen unfertigen Brand-Entwurf</div>
            <div style={{ fontSize:11, color:'#92400E', opacity:.9 }}>Deine Eingaben sind gespeichert — du kannst dort weitermachen.</div>
          </div>
          <button onClick={()=>setView('wizard')} style={{ padding:'7px 14px', background:P, color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={14}/>Fortsetzen</span>
          </button>
          <button onClick={()=>{ const draftSuffix = isCompanyPage ? '_co' : ''; ['step','name','position','company','offering','motivation','goal','examples','sliders2','importData','importedText'].forEach(f => { try { window.localStorage.removeItem('bv_w_'+f+'_'+uid+draftSuffix) } catch(_) {} }); setDraftCheckTick(t=>t+1) }} style={{ padding:'7px 14px', background:'transparent', color:'#92400E', border:'1px solid rgba(146,64,14,0.30)', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Verwerfen
          </button>
        </div>
      )}

      {(() => {
        const myVoices     = voices.filter(v => v.user_id === uid)
        const sharedVoices = voices.filter(v => v.user_id !== uid)
        const renderCard = (v) => (
            <div key={v.id} style={{ background:'var(--surface)', borderRadius:12, border: v.id === activeBrandVoice?.id ? `2px solid ${P}` : '1.5px solid #e8ecf0', padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:16, fontWeight:700 }}>{v.name}</span>
                    {v.id === activeBrandVoice?.id && <span style={{ fontSize:10, background:'#e8f5e9', color:'#2e7d32', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>Ausgewählt</span>}
                    {v.tonality && Object.keys(v.tonality).length > 0 && <span style={{ fontSize:10, background:'#e3f2fd', color:'#1565c0', padding:'2px 8px', borderRadius:10 }}>100% vollständig</span>}
                  </div>
                  {v.brand_name && <div style={{ fontSize:12, color:'#888', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}><Briefcase size={12} strokeWidth={1.75}/>{v.brand_name}</div>}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                    {(v.tone_attributes||[]).slice(0,5).map((t,i) => (
                      <span key={i} style={{ padding:'2px 8px', borderRadius:7, fontSize:11, background:'rgba(10,111,176,0.07)', color:P, fontWeight:500 }}>{t}</span>
                    ))}
                  </div>
                  {(v.brand_background || v.personality) && <div style={{ fontSize:12, color:'#666', lineHeight:1.4 }}>{(v.brand_background || v.personality).slice(0,180)}{(v.brand_background || v.personality).length>180?'…':''}</div>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginLeft:12 }}>
                  <button onClick={()=>{ setEdit(v); setView('editor'); setTab('marke') }} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #dde3ea', background:'var(--surface)', fontSize:12, cursor:'pointer' }}>Bearbeiten</button>
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
                  {isCompanyPage ? 'Meine Company Brands' : 'Meine Personal Brands'} ({myVoices.length})
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
    <QuickSetup session={session} brandType={brandType} onDone={(saved) => { loadVoices(); setEdit(saved); setView('editor'); setTab('marke'); setFreshlyCreated(true) }} onSkip={() => { setEdit({...E0, user_id:session.user.id, account_type:brandType}); setView('editor'); setTab('marke') }} onBack={() => { setView('list'); setEdit(null) }}/>
  )

  // ─── Editor View ──────────────────────────────────────────────
  if (!edit) return null
  const ls = edit.linkedin_style || {}

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 0' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:18 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ background:'transparent', border:'1.5px solid var(--border)', borderRadius:10, width:36, height:36, fontSize:16, cursor:'pointer', color:'var(--text-muted)', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="lk-eyebrow" style={{ fontSize:12, fontWeight:700, letterSpacing:'1.6px', textTransform:'uppercase', fontFamily:'Inter, sans-serif', color:'var(--primary, #003060)', marginBottom:2 }}>Branding · Schritt 1 von 3</div>
          <div style={{ fontSize:22, fontWeight:700, letterSpacing:'-.2px', lineHeight:1.2 }}>{editIsCompany ? 'Company Brand bearbeiten' : 'Personal Brand bearbeiten'}</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{editIsCompany ? 'Markenstimme des Unternehmens — für Page-Content, Profiltexte und Visuals' : 'Persönlicher Kommunikationsstil für alle LinkedIn-Inhalte'}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <button type="button" onClick={()=>setShowVisibilityModal(true)} title="Sichtbarkeit anpassen"
            style={{ padding:'10px 16px', background:'var(--surface, #fff)', color:'var(--text-primary)', border:'1.5px solid var(--border)', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7, fontFamily:'inherit' }}>
            <Eye size={15} strokeWidth={1.75}/><span>{edit.is_shared ? 'Geteilt' : 'Sichtbarkeit'}</span>
          </button>
          {!editIsCompany && (
            <button type="button" onClick={()=>setShowLiModal(true)} title="LinkedIn-Profil verbinden"
              style={{ padding:'10px 16px', background: edit.linkedin_member_id ? '#F0FDF4' : 'var(--surface, #fff)', color: edit.linkedin_member_id ? '#166534' : 'var(--text-primary)', border:'1.5px solid '+(edit.linkedin_member_id ? '#BBF7D0' : 'var(--border)'), borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7, fontFamily:'inherit' }}>
              <LinkedinIcon size={15}/><span>{edit.linkedin_member_id ? 'LinkedIn verbunden' : 'LinkedIn verbinden'}</span>
            </button>
          )}
          <button onClick={saveVoice} style={{ padding:'11px 22px', background:P, color:'#fff', border:'none', borderRadius:10, fontSize:13.5, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 10px rgba(10,111,176,.25)', display:'inline-flex', alignItems:'center', gap:8, fontFamily:'inherit', flexShrink:0 }}>
            <span style={{display:'inline-flex'}}><Save size={14}/></span><span>{editIsCompany ? 'Company Brand speichern' : 'Personal Brand speichern'}</span>
          </button>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <input value={edit.name||''} onChange={e=>u('name',e.target.value)} placeholder={editIsCompany ? 'Interner Name der Company Brand (z.B. Leadesk)' : 'Interner Name der Personal Brand (z.B. Max Mustermann)'}
          style={{ flex:1, padding:'10px 14px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:15, fontWeight:600 }}/>
      </div>

        {!editIsCompany && edit.id && !edit.linkedin_member_id && (
          <div style={{ marginBottom:16, padding:'14px 18px', background:'linear-gradient(90deg, rgba(10,111,176,0.10) 0%, rgba(48,160,208,0.08) 100%)', border:'1.5px solid rgba(10,111,176,0.25)', borderRadius:12, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <PartyPopper size={22} strokeWidth={1.75} style={{ color:'#16A34A' }}/>
            <div style={{ flex:1, minWidth:240 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:2 }}>Brand Voice erstellt — jetzt LinkedIn verbinden</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4 }}>Verknüpfe das passende LinkedIn-Profil mit dieser Brand Voice — Voraussetzung für Auto-Publishing, Vernetzungen und Nachrichten.</div>
            </div>
            <button className="lk-btn lk-btn-primary" onClick={connectLinkedIn} disabled={liConnecting}
              >
              {liConnecting ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={14} className="lk-spin"/>…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><LinkedinIcon size={14}/>Mit LinkedIn verbinden</span>}
            </button>
          </div>
        )}
      <TabBar tabs={TABS} active={tab} onChange={setTab} style={{ marginBottom:18 }}/>

      {/* ── Tab: Marke ─────────────────────────────────── */}
      {tab==='marke' && <>
        {editIsCompany ? (<>
          <SectionCard icon={<Building2 size={22} strokeWidth={1.75}/>} color="blue" title="Markenidentität" subtitle="Wer ist das Unternehmen, wofür steht es">
            <Lb l="Unternehmensname" h="Offizieller Name, wie er auf der Company Page steht"/><In v={edit.brand_name} fn={v=>u('brand_name',v)} ph="z.B. Leadesk GmbH"/>
            <Lb l="Hintergrund" h="Was macht das Unternehmen? Markt, Produkte, Kunden"/><Tx v={edit.brand_background} fn={v=>u('brand_background',v)} r={3} ph="Kurze Beschreibung des Unternehmens — was ihr macht, für wen, seit wann..."/>
            <div style={{ display:'flex', gap:12 }}>
              <div style={{ flex:1 }}><Lb l="Mission"/><Tx v={edit.mission} fn={v=>u('mission',v)} r={2} ph="Wofür steht das Unternehmen?"/></div>
              <div style={{ flex:1 }}><Lb l="Vision"/><Tx v={edit.vision} fn={v=>u('vision',v)} r={2} ph="Wo soll das Unternehmen langfristig hin?"/></div>
            </div>
            <Lb l="Werte"/><In v={edit.values} fn={v=>u('values',v)} ph="z.B. Vertrauen, Substanz, Innovation"/>

            {/* Visuelle Identität — Logos, CI, Farben, Fonts, Booklet (eigene Überschrift im Editor) */}
            <div style={{ marginTop:6, paddingTop:16, borderTop:'1px solid var(--border-soft, #F1F5F9)' }}>
              <VisualIdentityEditor edit={edit} u={u} session={session} activeTeamId={activeTeamId}/>
            </div>
          </SectionCard>
        </>) : (<>
          <SectionCard icon={<UserCircle size={22} strokeWidth={1.75}/>} color="blue" title="Identität" subtitle="Wer du bist, wofür du stehst">
            <Lb l="Anzeigename" h="Wie du nach außen auftrittst — meist einfach dein Name"/><In v={edit.brand_name} fn={v=>u('brand_name',v)} ph="z.B. Max Mustermann"/>
            <Lb l="Hintergrund" h="Wer bist du? Rolle, Erfahrung, Fokus"/><Tx v={edit.brand_background} fn={v=>u('brand_background',v)} r={3} ph="Kurzer Background: was du machst, für wen, was dich auszeichnet..."/>
            <div style={{ display:'flex', gap:12 }}>
              <div style={{ flex:1 }}><Lb l="Mission"/><Tx v={edit.mission} fn={v=>u('mission',v)} r={2} ph="Wofür stehst du?"/></div>
              <div style={{ flex:1 }}><Lb l="Vision"/><Tx v={edit.vision} fn={v=>u('vision',v)} r={2} ph="Wo willst du hin?"/></div>
            </div>
            <Lb l="Werte"/><In v={edit.values} fn={v=>u('values',v)} ph="z.B. Klarheit, Pragmatismus, Verantwortung"/>

            {/* Visuelle Identität — Bilder von dir / der Person */}
            <div style={{ marginTop:6, paddingTop:16, borderTop:'1px solid var(--border-soft, #F1F5F9)' }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', display:'inline-flex', alignItems:'center', gap:8 }}><Palette size={16} strokeWidth={1.75}/>Visuelle Identität</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Bilder von dir — werden als Identity-Referenz für generierte Visuals genutzt.</div>
              <VisualIdentityEditor edit={edit} u={u} session={session} activeTeamId={activeTeamId}/>
            </div>
          </SectionCard>
        </>)}
      </>}

      {/* ── Tab: Tonalität ─────────────────────────────── */}
      {tab==='tonalitaet' && <>
        <SectionCard icon={<Mic size={18} strokeWidth={1.75}/>} color="teal" title={editIsCompany ? 'Markenstimme' : 'Stimme'} subtitle={editIsCompany ? 'Wie klingt die Marke — in 1-2 Sätzen' : 'Wie klingst du — in 1-2 Sätzen'}>
          <Lb l="Beschreibung" h={editIsCompany ? 'Wie kommuniziert das Unternehmen? Charakter der Marke in 1-2 Sätzen' : 'Wie würdest du deinen Kommunikationsstil beschreiben?'}/>
          <Tx v={edit.personality} fn={v=>u('personality',v)} r={3} ph={editIsCompany ? 'z.B. Sachkundiger B2B-Partner, der Wissen teilt statt zu verkaufen...' : 'z.B. Pragmatischer Marketing-Technologe, der Wissen teilt statt zu verkaufen...'}/>
        </SectionCard>
        <SectionCard icon={<BarChart3 size={18} strokeWidth={1.75}/>} color="green" title={editIsCompany ? 'Markentonalität' : 'Tonalität'} subtitle="Wie stark sind welche Kommunikationsmerkmale">
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
        <SectionCard icon={<BookOpen size={18} strokeWidth={1.75}/>} color="purple" title="Glossar" subtitle="Fachbegriffe und ihre Definitionen für konsistente Verwendung">
          <Lb l="Fachbegriffe & Definitionen" h="Stelle sicher, dass deine Begriffe korrekt verwendet werden"/>
          <GlossaryEditor items={edit.glossary||[]} onChange={v=>u('glossary',v)}/>
        </SectionCard>
      </>}

      {/* ── Tab: Sprache ───────────────────────────────── */}
      {tab==='sprache' && <>
        <SectionCard icon={<MessageCircle size={18} strokeWidth={1.75}/>} color="teal" title="Ansprache" subtitle={editIsCompany ? 'Du, Sie oder gemischt — wie spricht die Marke ihre Leser an' : 'Du, Sie oder gemischt — wie sprichst du deine Leser an'}>
          <Lb l="Förmlichkeit"/>
          <div style={{ display:'flex', gap:8 }}>
            {FORM.map(f => (
              <button key={f.v} onClick={()=>u('formality',f.v)}
                style={{ flex:1, padding:'10px 12px', borderRadius:8, border: edit.formality===f.v ? `2px solid ${P}` : '1.5px solid #dde3ea', background: edit.formality===f.v ? 'rgba(10,111,176,0.06)':'#fff', cursor:'pointer', textAlign:'left' }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{f.l}</div>
                <div style={{ fontSize:11, color:'#888' }}>{f.d}</div>
              </button>
            ))}
          </div>
        </SectionCard>
        <SectionCard icon={<PenLine size={18} strokeWidth={1.75}/>} color="coral" title="Sprach-Richtlinien" subtitle="Wortwahl, Satzstruktur, Dos und Don'ts">
          <Lb l="Wortwahl" h={editIsCompany ? 'Welche Begriffe nutzt die Marke, was wird vermieden?' : 'Welche Wörter bevorzugst du, was vermeidest du?'}/>
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
          <Lb l="Bevorzugter Hook-Stil" h={editIsCompany ? 'Wie beginnen eure Page-Beiträge typischerweise?' : 'Wie beginnst du typischerweise deine LinkedIn-Posts?'}/>
          <Dd v={ls.hook_style} fn={v=>uLinkedIn('hook_style',v)} opts={HOOK_OPTIONS} ph="Hook-Stil wählen..."/>
          <Lb l="Call-to-Action Stil"/>
          <Dd v={ls.cta_style} fn={v=>uLinkedIn('cta_style',v)} opts={CTA_OPTIONS} ph="CTA-Stil wählen..."/>
          <Lb l="Emoji-Nutzung"/>
          <Dd v={ls.emoji_usage} fn={v=>uLinkedIn('emoji_usage',v)} opts={EMOJI_OPTIONS} ph="Emojis..."/>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            Hashtags werden bei Leadesk grundsaetzlich nicht verwendet — auf LinkedIn senken sie eher die Reichweite. "Keine Hashtags" ist daher fix in den Don'ts hinterlegt.
          </div>
        </SectionCard>
        <SectionCard icon={<FileText size={18} strokeWidth={1.75}/>} color="purple" title="Beispieltexte" subtitle={editIsCompany ? 'Beiträge der Company Page oder Marketing-Texte — die KI lernt den Marken-Stil daraus' : 'Eigene Posts oder Artikel — die KI lernt deinen Stil daraus'}>
          <Lb l="Eigene Texte" h="LinkedIn-Posts oder Artikel — die KI übernimmt Tonfall, Rhythmus und Stil daraus"/>
          <Tx v={edit.example_texts} fn={v=>u('example_texts',v)} r={8} ph="Füge hier eigene LinkedIn-Posts ein..."/>
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
            style={{ padding:'12px 28px', background:P, color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 10px rgba(10,111,176,.25)', display:'inline-flex', alignItems:'center', gap:8, fontFamily:'inherit' }}>
            <span>Weiter</span><span>→</span>
          </button>
        )}
      </div>

      {/* ── Popup: LinkedIn-Profil verbinden ───────────── */}
      {showLiModal && !editIsCompany && (
        <div onClick={()=>setShowLiModal(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:520, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>LinkedIn-Verknüpfung</div>
                <h3 style={{ fontSize:18, fontWeight:700, margin:'4px 0 0', color:'var(--text-primary)' }}>LinkedIn-Profil verbinden</h3>
              </div>
              <button onClick={()=>setShowLiModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0, lineHeight:1 }}><X size={20} strokeWidth={1.75}/></button>
            </div>

            <Lb l="LinkedIn-Profil-URL (optional)" h="Die URL deines persönlichen Profils. Hilft später beim Auto-Publishing."/>
            <In v={edit.linkedin_url || ''} fn={v=>u('linkedin_url', v)} ph="https://www.linkedin.com/in/dein-profil" />

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
                    <button className="lk-btn lk-btn-ghost" type="button" onClick={disconnectLinkedIn} >
                      Trennen
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>Noch nicht verbunden</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>Voraussetzung für Posting, Vernetzungen und Nachrichten aus diesem Auftritt. Du musst auf linkedin.com eingeloggt sein.</div>
                  </div>
                  <button className="lk-btn lk-btn-primary" type="button" onClick={connectLinkedIn} disabled={liConnecting}
                    style={{ flexShrink:0 }}>
                    {liConnecting ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={14} className="lk-spin"/>Lese Session…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><LinkedinIcon size={14}/>Mit LinkedIn verbinden</span>}
                  </button>
                </div>
              )}
              {liError && <div style={{ marginTop:10, padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:8, fontSize:12, color:'#991B1B' }}>{liError}</div>}
              {!edit.id && <div style={{ marginTop:10, fontSize:11, color:'#92400E' }}>Bitte speichere die Personal Brand zuerst, dann kannst du LinkedIn verbinden.</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Popup: Sichtbarkeit ────────────────────────── */}
      {showVisibilityModal && (
        <div onClick={()=>setShowVisibilityModal(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:560, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Sichtbarkeit anpassen</div>
                <h3 style={{ fontSize:18, fontWeight:700, margin:'4px 0 0', color:'var(--text-primary)' }}>{edit.name || '(ohne Name)'}</h3>
              </div>
              <button onClick={()=>setShowVisibilityModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0, lineHeight:1 }}><X size={20} strokeWidth={1.75}/></button>
            </div>
            {edit.id ? (
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
            ) : (
              <div style={{ padding:'12px 14px', background:'#F8FAFC', border:'1.5px solid var(--border)', borderRadius:10, fontSize:12, color:'var(--text-muted)' }}>
                Sichtbarkeits-Einstellungen werden nach dem ersten Speichern verfügbar.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
