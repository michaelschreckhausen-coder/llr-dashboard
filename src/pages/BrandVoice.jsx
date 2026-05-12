import { useTranslation } from 'react-i18next'
import React, { useEffect, useState } from 'react'
import { useLocalStorageState, clearDraftsByPrefix } from '../lib/useLocalStorageState'
import { useTabPersistedState, clearTabPersistedKey } from '../lib/useTabPersistedState'
import { useTeam } from '../context/TeamContext'
import { supabase } from '../lib/supabase'
import KnowledgeImporter from '../components/KnowledgeImporter'
import EmptyHero from '../components/EmptyHero'
import SectionCard from '../components/SectionCard'
import WizardLayout from '../components/WizardLayout'
import TabBar from '../components/TabBar'
import BrainButton, { useDefaultModel } from '../components/BrainButton'

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
  const [step, setStep, clearStep] = useLocalStorageState('bv_w_step_'+uid, 0)
  const [selectedModel, setSelectedModel] = useDefaultModel(session)
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

  function handleMetaChange(updates){setImportData(prev=>({...prev,...updates}))}
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
        'Extrahiere die folgenden Informationen, jeweils 1-3 Sätze, in Ich-Form falls Person:',
        '- name: Vor- und Nachname',
        '- position: berufliche Position/Headline',
        '- company: Firmenname',
        '- offering: Was die Person/Firma anbietet, fuer welche Probleme, welche Methoden — moeglichst konkret mit Outcomes',
        '- motivation: Warum macht die Person/Firma das, welche Vision, welche Werte stehen dahinter',
        'Antworte NUR mit diesem JSON, ohne Kommentar oder Markdown:',
        '{"name":"","position":"","company":"","offering":"","motivation":""}',
        '',
        '## Kontext:',
        importedText.slice(0, 6000)
      ].join('\n')
      const { data, error } = await supabase.functions.invoke('generate', {
        body: { type: 'brand_voice_summary', prompt, userId: session.user.id }
      })
      if (error) throw error
      const text = data?.text || data?.result || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const r = JSON.parse(match[0])
        if (r.name) setName(r.name)
        if (r.position) setPos(r.position)
        if (r.company) setCo(r.company)
        if (r.offering) setOffering(r.offering)
        if (r.motivation) setMotivation(r.motivation)
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
        '', '## Stil-Präferenzen (Skala 1–5)',
        ...SLIDERS.map(s => s.left + '(1) vs ' + s.right + '(5): ' + sliders[s.key]),
        '', '## LinkedIn-Ziel', goal,
        '', examples ? '## Eigene Texte als Stil-Referenz\n' + examples.slice(0,800) : '',
        '', importedText ? '## Importierter Kontext (Dokumente/Website):\n' + importedText.slice(0,4000) : '',
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
      onSkip={onSkip}
      onBack={onSkip}
    >

      {step===0 && (
        <Sc t="📥 Schritt 1: Kontext importieren (optional)" ch={<>
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
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <div style={{ marginBottom:8 }}><BrainButton model={selectedModel} onChange={setSelectedModel} size="small" disabled={prefilling}/></div>
            {importedText && (
              <button onClick={prefillFromContext} disabled={prefilling}
                style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:prefilling?'not-allowed':'pointer', opacity:prefilling?.6:1 }}>
                {prefilling ? '⏳ Analysiere...' : '✨ Felder automatisch befüllen'}
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
        <Sc t="Schritt 1: Wer bist du?" ch={<>
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
          {importedText && (
            <div style={{ fontSize:11, color:'#22c55e', background:'#f0fdf4', padding:'6px 10px', borderRadius:6 }}>
              ✓ {importedText.length.toLocaleString()} Zeichen Kontext aus Schritt 0 fließen in Generierung ein
            </div>
          )}
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={()=>setStep(2)} style={{ padding:'10px 24px', background:'#f5f5f5', border:'none', borderRadius:8, fontSize:14, cursor:'pointer' }}>← Zurück</button>
            <button onClick={generate} disabled={generating} style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', opacity:generating?.6:1 }}>
              {generating ? '⏳ KI generiert...' : '✨ Brand Voice generieren'}
            </button>
          </div>
        </>}/>
      )}

    </WizardLayout>
  )
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function BrandVoice({ session }) {
  const { team } = useTeam()
  const uid = session.user.id
  const [voices, setVoices]   = useState([])
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
  const [selectedModel, setSelectedModel] = useDefaultModel(session)

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

  // Parse tonality object to array for the editor
  const tonalityArr = edit?.tonality && typeof edit.tonality === 'object' && !Array.isArray(edit.tonality)
    ? Object.entries(edit.tonality).map(([label, value]) => ({ label, value: Number(value) }))
    : TONALITY_DEFAULTS

  const TABS = [
    { v:'marke',      label:'Marke',      icon:'🏢', color:'blue',   sub:'Identität & Werte' },
    { v:'tonalitaet', label:'Tonalität',  icon:'📊', color:'green',  sub:'Wie stark, was wie' },
    { v:'sprache',    label:'Sprache',    icon:'✍️', color:'amber',  sub:'Wortwahl & Stil' },
    { v:'summary',    label:'AI Summary', icon:'✨', color:'brand',  sub:'System-Prompt' },
  ]

  // ─── List View ────────────────────────────────────────────────
  if (view === 'list') {
    if (loading) return <div style={{textAlign:'center',color:'var(--text-muted)',padding:60}}>Laden…</div>

    // Empty-State: Hero mit animiertem Logo
    if (voices.length === 0) return (
      <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'12px 16px' }}>
        {hasWizardDraft && (
          <div data-tick={draftCheckTick} style={{ marginTop:14, marginBottom:0, padding:'12px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.30)', borderRadius:10, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <span style={{ fontSize:18 }}>📝</span>
            <div style={{ flex:1, minWidth:220 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#92400E' }}>Du hast einen unfertigen Brand-Voice-Entwurf</div>
              <div style={{ fontSize:11, color:'#92400E', opacity:.9 }}>Deine Eingaben sind gespeichert — du kannst dort weitermachen.</div>
            </div>
            <button onClick={()=>setView('wizard')} style={{ padding:'7px 14px', background:P, color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
              ✨ Fortsetzen
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
          primaryLabel="✨ Neue Brand Voice mit KI"
          onPrimary={()=>setView('wizard')}
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
        <button onClick={()=>{ clearTabPersistedKey('ki_tab_brand'); setView('wizard') }} style={{ padding:'10px 20px', background:P, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 8px rgba(49,90,231,.18)' }}>
          ✨ Neue Brand Voice mit KI
        </button>
        <button onClick={()=>{ setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('marke') }}
          style={{ padding:'10px 20px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, fontSize:13, cursor:'pointer', color:'var(--text-primary)', fontWeight:500 }}>
          + Manuell erstellen
        </button>
      </div>

      {/* Wizard-Draft-Recovery-Banner */}
      {hasWizardDraft && (
        <div data-tick={draftCheckTick} style={{ marginBottom:16, padding:'12px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.30)', borderRadius:10, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:18 }}>📝</span>
          <div style={{ flex:1, minWidth:220 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#92400E' }}>Du hast einen unfertigen Brand-Voice-Entwurf</div>
            <div style={{ fontSize:11, color:'#92400E', opacity:.9 }}>Deine Eingaben sind gespeichert — du kannst dort weitermachen.</div>
          </div>
          <button onClick={()=>setView('wizard')} style={{ padding:'7px 14px', background:P, color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
            ✨ Fortsetzen
          </button>
          <button onClick={()=>{ clearDraftsByPrefix('bv_w_'); setDraftCheckTick(t=>t+1) }} style={{ padding:'7px 14px', background:'transparent', color:'#92400E', border:'1px solid rgba(146,64,14,0.30)', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Verwerfen
          </button>
        </div>
      )}

      {(
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
  }

  if (view === 'wizard') return (
    <QuickSetup session={session} onDone={(saved) => { loadVoices(); setEdit(saved); setView('editor'); setTab('marke') }} onSkip={() => { setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('marke') }}/>
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
          <span>💾</span><span>Brand Voice speichern</span>
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
        <SectionCard icon="📊" color="green" title="Markentonalität" subtitle="Wie stark sind welche Kommunikationsmerkmale">
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
        <SectionCard icon="💬" color="amber" title="Wortschatz" subtitle="Begriffe, die in deinen Inhalten vorkommen sollen">
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
        <SectionCard icon="🗣️" color="teal" title="Ansprache" subtitle="Du, Sie oder gemischt — wie sprichst du deine Leser an">
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
        <SectionCard icon="✍️" color="coral" title="Sprach-Richtlinien" subtitle="Wortwahl, Satzstruktur, Dos und Don'ts">
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
              <Tx v={edit.donts} fn={v=>u('donts',v)} r={3} ph="- Keine Hashtags (LinkedIn-Best-Practice)&#10;- Keine Verkaufs-Pitches&#10;- Nicht akademisch werden"/>
            </div>
          </div>
        </SectionCard>
        <SectionCard icon="💼" color="blue" title="LinkedIn-Stil" subtitle="Hook, CTA und Emoji-Einsatz auf LinkedIn">
          <Lb l="Bevorzugter Hook-Stil" h="Wie beginnst du typischerweise deine LinkedIn-Posts?"/>
          <Dd v={ls.hook_style} fn={v=>uLinkedIn('hook_style',v)} opts={HOOK_OPTIONS} ph="Hook-Stil wählen..."/>
          <Lb l="Call-to-Action Stil"/>
          <Dd v={ls.cta_style} fn={v=>uLinkedIn('cta_style',v)} opts={CTA_OPTIONS} ph="CTA-Stil wählen..."/>
          <Lb l="Emoji-Nutzung"/>
          <Dd v={ls.emoji_usage} fn={v=>uLinkedIn('emoji_usage',v)} opts={EMOJI_OPTIONS} ph="Emojis..."/>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            💡 Hashtags werden bei Leadesk grundsaetzlich nicht verwendet — auf LinkedIn senken sie eher die Reichweite. "Keine Hashtags" ist daher fix in den Don'ts hinterlegt.
          </div>
        </SectionCard>
      </>}
      {/* ── Tab: AI Summary ────────────────────────────── */}
      {tab==='summary' && <>
        <SectionCard icon="✨" color="brand" title="Brand Voice Summary" subtitle="Der zusammengefasste System-Prompt für alle KI-Aufrufe">
          <Lb l="AI Summary" h="Wird automatisch in alle KI-Aufrufe eingebaut"/>
          {edit.ai_summary ? (
            <Tx v={edit.ai_summary} fn={v=>u('ai_summary',v)} r={8}/>
          ) : (
            <div style={{ color:'#F59E0B', fontSize:11, fontWeight:600 }}>⚠️ Noch keine KI-Summary — im Editor generieren</div>
          )}
          <div style={{ fontSize:11, color:'#888', background:'#FFFBEB', padding:'8px 12px', borderRadius:8, marginTop:4 }}>
            💡 Diese Summary ist der Kern deiner Brand Voice — je präziser, desto authentischer die KI-Texte.
          </div>
          <div style={{ marginBottom:8 }}><BrainButton model={selectedModel} onChange={setSelectedModel} size="small" disabled={genSummary}/></div>
        <button onClick={generateSummary} disabled={genSummary} style={{ padding:'8px 16px', background:'#7C3AED', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', opacity:genSummary?.6:1, marginTop:4 }}>
            {genSummary ? '⏳ Generiert...' : '🔄 Neu generieren'}
          </button>
        </SectionCard>
        <SectionCard icon="📝" color="purple" title="Beispieltexte für KI-Analyse" subtitle="Eigene Posts oder Artikel — die KI lernt deinen Stil daraus">
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
