import React, { useEffect, useState } from 'react'
import GenerationLoading from '../components/GenerationLoading'
import { AlertTriangle, BarChart3, Briefcase, Download, FileText, Lightbulb, Link2, Loader2, MessageCircle, RefreshCw, Save, Sparkles, Target, Trash2, Zap } from 'lucide-react'
import { LinkedinIcon } from '../components/icons'
import { useLocalStorageState, clearDraftsByPrefix } from '../lib/useLocalStorageState'
import { useTabPersistedState, clearTabPersistedKey } from '../lib/useTabPersistedState'
import BrandVoiceMultiSelect, { persistBrandVoiceLinks } from '../components/BrandVoiceMultiSelect'
import EmptyHero from '../components/EmptyHero'
import SectionCard from '../components/SectionCard'
import TabBar from '../components/TabBar'
import { useTeam } from '../context/TeamContext'
import { supabase } from '../lib/supabase'
import KnowledgeImporter from '../components/KnowledgeImporter'
import SharingPicker from '../components/SharingPicker'
import { useModel } from '../context/ModelContext'

const P = 'var(--wl-primary, rgb(49,90,231))'

const DECISION_LEVELS = ['C-Level / Geschäftsführung','VP / Director','Head of / Abteilungsleitung','Mid-Management / Teamlead','Fachkraft / Spezialist','Freelancer / Selbstständig']
const COMPANY_SIZES = ['1-10 (Startup)','11-50 (Klein)','51-200 (Mittel)','201-1000 (Groß)','1000+ (Enterprise)','Egal']

const E0 = {name:'',is_active:true,job_titles:'',industries:'',company_size:'',decision_level:'',region:'',pain_points:'',needs_goals:'',topics_interests:'',trigger_events:'',outreach_tips:'',ai_summary:'',hobbies:'',imported_context:'',file_name:'',file_url:'',file_type:'',source_url:'',linkedin_template_url:''}

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

// ─── Wizard für Zielgruppen (erweitert) ──────────────────────────────
function QuickSetup({ session, onDone, onSkip, onBack }) {
  const uid = session.user.id
  const { activeTeamId } = useTeam()
  const { model: selectedModel, setModel: setSelectedModel } = useModel()
  const [position, setPosition] = useLocalStorageState('aud_w_position_'+uid, '')
  const [needs, setNeeds] = useLocalStorageState('aud_w_needs_'+uid, '')
  const [painPoints, setPainPoints] = useLocalStorageState('aud_w_painPoints_'+uid, '')
  const [hobbies, setHobbies] = useLocalStorageState('aud_w_hobbies_'+uid, '')
  const [importData, setImportData] = useLocalStorageState('aud_w_importData_'+uid, {file_name:'',file_url:'',file_type:'',source_url:'',linkedin_template_url:''})
  const [importedText, setImportedText] = useLocalStorageState('aud_w_importedText_'+uid, '')
  const [prefilling, setPrefilling] = useState(false)
  const [prefillError, setPrefillError] = useState('')
  const [generating, setGen] = useState(false)
  const [error, setError] = useState('')

  async function prefillFromContext() {
    if (!importedText && !importData.linkedin_template_url) return
    setPrefilling(true); setPrefillError('')
    try {
      const prompt = [
        'Du analysierst ein LinkedIn-Profil ALS BEISPIEL/VORLAGE einer Zielgruppe — NICHT als Steckbrief dieser einen Person.',
        'Ziel: Daraus eine VERALLGEMEINERTE Zielgruppen-Beschreibung ableiten, die auf diese Person UND auf vergleichbare Personen mit ähnlicher Position passt.',
        '',
        'WICHTIG — Anonymisierung & Abstraktion:',
        '- Verwende NIEMALS den Eigennamen der Person.',
        '- Verwende KEINE konkreten Arbeitgeber-, Universitäts- oder Ortsnamen (statt "arbeitet bei XY GmbH in München" → "arbeitet in mittelständischen B2B-Unternehmen im DACH-Raum").',
        '- Formuliere alles im Plural / generisch ("Personen in dieser Rolle…", "typischerweise…").',
        '- Generalisiere zu Job-Titel, Branche, Verantwortungsbereich, Seniority — NICHT zu einer Einzelperson.',
        '- Pain Points & Bedürfnisse: ableiten aus Rolle, Branche, Karrierephase — nicht aus konkreten Einzel-Erfahrungen.',
        '',
        'Antworte NUR mit diesem JSON, ohne Kommentar oder Markdown:',
        '{"position":"","needs":"","painPoints":"","hobbies":""}',
        '',
        '## Beispiel-Profil (als Vorlage für die Zielgruppe):',
        importedText.slice(0, 6000)
      ].join('\n')
      const { data, error } = await supabase.functions.invoke('generate', {
        body: { type: 'target_audience', prompt, userId: session.user.id, model: selectedModel }
      })
      if (error) throw error
      const text = data?.text || data?.result || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const r = JSON.parse(match[0])
        if (r.position) setPosition(r.position)
        if (r.needs) setNeeds(r.needs)
        if (r.painPoints) setPainPoints(r.painPoints)
        if (r.hobbies) setHobbies(r.hobbies)
      }
    } catch(e) { setPrefillError('Fehler: ' + e.message) }
    finally { setPrefilling(false) }
  }

  async function generate() {
    if (!position.trim() && !needs.trim() && !painPoints.trim() && !importedText && !importData.linkedin_template_url) {
      setError('Bitte mindestens ein Feld ausfüllen (Position, Bedürfnisse, Pain Points oder Kontext-Import).')
      return
    }
    setGen(true); setError('')
    try {
      const prompt = [
        'Erstelle ein LinkedIn-Zielgruppenprofil für B2B. Antworte NUR mit einem JSON-Objekt, ohne Kommentar.',
        '',
        'WICHTIG — Wenn ein importiertes LinkedIn-Profil im Kontext steht, ist das eine VORLAGE/EIN ARCHETYP, nicht die Zielgruppe selbst:',
        '- Beschreibe die Zielgruppe so, dass diese eine Person UND viele ähnliche Personen reinpassen.',
        '- Verwende NIEMALS den Eigennamen, konkrete Arbeitgeber, Universitäten, Ortschaften oder andere persönliche Identifikatoren der Vorlage-Person.',
        '- Generalisiere zu Job-Titel, Seniority, Branche, Unternehmensgröße, Region (DACH / EU / international).',
        '- Pain Points & Trigger Events ableiten aus der Rolle/Branche, nicht aus konkreten Einzel-Erfahrungen der Person.',
        '- Formuliere alles im Plural ("Diese Zielgruppe…", "Typischerweise…", "Personen in dieser Rolle…").',
        '- Das "name"-Feld ist ein generischer ZIELGRUPPEN-Name (z.B. "B2B-Marketing-Leads im Mittelstand"), NIEMALS der Personenname.',
        '- Das "ai_summary"-Feld beschreibt die abstrakte Zielgruppe — KEIN Namen, KEINE persönlichen Details der Vorlage.',
        '',
        '## Angaben zur Zielgruppe:',
        position ? 'Position / Rolle: ' + position : '',
        needs ? 'Bedürfnisse / Ziele: ' + needs : '',
        painPoints ? 'Pain Points: ' + painPoints : '',
        hobbies ? 'Hobbies / Interessen: ' + hobbies : '',
        importData.linkedin_template_url ? 'LinkedIn-Profil (Vorlage, NICHT 1:1 uebernehmen!): ' + importData.linkedin_template_url : '',
        '',
        importedText ? '## Vorlage-Profil (anonymisieren + verallgemeinern!):\n' + importedText.slice(0, 8000) : '',
        '',
        '## Erwartetes JSON-Format:',
        JSON.stringify({
          name:'Name der Zielgruppe (kurz)',
          job_titles:'Komma-getrennte Job-Titel',
          industries:'Komma-getrennte Branchen',
          company_size:'Unternehmensgröße',
          decision_level:'Entscheidungsebene',
          region:'Region/Markt',
          pain_points:'- Pain Point 1\n- Pain Point 2\n- Pain Point 3',
          needs_goals:'- Bedürfnis/Ziel 1\n- Bedürfnis/Ziel 2\n- Bedürfnis/Ziel 3',
          topics_interests:'Komma-getrennte Themen',
          trigger_events:'- Trigger 1\n- Trigger 2\n- Trigger 3',
          outreach_tips:'- Tipp 1\n- Tipp 2\n- Tipp 3',
          hobbies:'Komma-getrennte Hobbies/Interessen außerhalb des Berufs',
          ai_summary:'100-150 Wörter Zusammenfassung für KI-Kontext'
        })
      ].filter(Boolean).join('\n')

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
        body: { type:'target_audience', prompt, userId: session.user.id }
      })
      if (fnErr) throw fnErr

      const text = fnData?.text || fnData?.result || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Kein JSON in der Antwort')
      const result = JSON.parse(jsonMatch[0])

      const audience = {
        ...E0,
        ...result,
        ...importData,
        imported_context: importedText || '',
        user_id: session.user.id
      }
      // team_id mit-setzen — fix für team-id-filter regression
      if (!audience.team_id && activeTeamId) audience.team_id = activeTeamId
      const { data: saved, error: saveErr } = await supabase.from('target_audiences').insert(audience).select().single()
      if (saveErr) throw saveErr
      clearDraftsByPrefix('aud_w_')
      onDone(saved)
    } catch (err) {
      setError(err.message || 'Fehler bei der Generierung')
    } finally { setGen(false) }
  }

  function handleMetaChange(updates) { setImportData(prev => ({ ...prev, ...updates })) }
  function handleContentExtracted(text) { setImportedText(prev => prev ? (prev + '\n\n---\n\n' + text) : text) }

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'28px 16px 40px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:26 }}>
        <button onClick={onBack || onSkip} aria-label="Zurueck"
          style={{ background:'transparent', border:'1.5px solid var(--border)', borderRadius:10, width:36, height:36, fontSize:16, cursor:'pointer', color:'var(--text-muted)', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          ←
        </button>
        <div style={{ flex:1, minWidth:0, maxWidth:720 }}>
          <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Branding · Schritt 2 von 3</div>
          <h1 style={{ fontSize:28, fontWeight:700, margin:0, letterSpacing:'-0.4px', lineHeight:1.15, color:'var(--text-primary)' }}>Neue Zielgruppe mit KI</h1>
          <p style={{ fontSize:14, color:'var(--text-muted)', margin:'10px 0 0', lineHeight:1.6 }}>Beschreibe deine Wunsch-Zielgruppe — die KI erstellt das vollständige Profil in ~2 Minuten.</p>
        </div>
      </div>

      <SectionCard icon={<Download size={18} strokeWidth={1.75}/>} color="brand" title="Kontext importieren" subtitle="Datei, Website oder LinkedIn-Profil — die KI analysiert und befüllt die Felder unten">
        <Lb l="Dokument, Website oder LinkedIn-Profil hochladen"
            h="KI analysiert den Inhalt und füllt die Felder darunter automatisch vor"/>
        <KnowledgeImporter
          session={session}
          storagePrefix="audience"
          showLinkedIn={true}
          current={{...importData, id:'wizard'}}
          onMetaChange={handleMetaChange}
          onContentExtracted={handleContentExtracted}
          disabled={prefilling || generating}
        />
        {importedText && (
          <div style={{ fontSize:11, color:'var(--success-text)', background:'var(--success-soft)', padding:'6px 10px', borderRadius:6, marginTop:4 }}>
            ✓ {importedText.length.toLocaleString()} Zeichen geladen
          </div>
        )}
        {(importedText || importData.linkedin_template_url) && (
          <button onClick={prefillFromContext} disabled={prefilling}
            style={{ marginTop:8, padding:'9px 20px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:prefilling?'not-allowed':'pointer', opacity:prefilling?.6:1 }}>
            {prefilling ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={14} className="lk-spin"/>Analysiere…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={14}/>Felder automatisch befüllen</span>}
          </button>
        )}
        {prefillError && <div style={{ color:'var(--danger)', fontSize:12, marginTop:4 }}>{prefillError}</div>}
      </SectionCard>

      <SectionCard icon="👤" color="blue" title="Wer ist deine Zielgruppe?" subtitle="Beschreibe Position, Bedürfnisse, Pain Points — die KI baut daraus das Profil">
        <Lb l="Position / Rolle" h="Welche Position hat deine Zielgruppe im Unternehmen?"/>
        <In v={position} fn={setPosition} ph="z.B. Head of Marketing, CMO, Marketing Manager"/>
        <Lb l="Bedürfnisse / Ziele" h="Was will diese Zielgruppe erreichen?"/>
        <Tx v={needs} fn={setNeeds} r={3} ph="z.B. mehr qualifizierte Inbound-Leads, Thought Leadership aufbauen, ROI-messbare Marketing-Strategie"/>
        <Lb l="Pain Points" h="Welche Probleme und Herausforderungen beschäftigen sie?"/>
        <Tx v={painPoints} fn={setPainPoints} r={3} ph="z.B. schwache Lead-Qualität, hoher CPL, fehlende Sichtbarkeit, keine klare Content-Strategie"/>
        <Lb l="Hobbies / Interessen (optional)" h="Hilft der KI, authentische Hooks zu finden"/>
        <In v={hobbies} fn={setHobbies} ph="z.B. Bergsteigen, Slow-Food, Philosophie-Podcasts"/>
      </SectionCard>


      {error && <div style={{ color:'var(--danger)', fontSize:12, marginBottom:12, padding:'10px 14px', background:'rgba(220,38,38,.06)', borderRadius:10, border:'1px solid rgba(220,38,38,.20)' }}>{error}</div>}

      {generating && <GenerationLoading title="Zielgruppe wird analysiert" expectedSeconds={30} />}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, marginTop:16, flexWrap:'wrap' }}>        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <button onClick={onSkip} disabled={generating} style={{ padding:'12px 22px', background:'transparent', border:'1.5px solid var(--border)', borderRadius:10, fontSize:13.5, color:'var(--text-muted)', cursor:generating?'not-allowed':'pointer', fontFamily:'inherit', fontWeight:500 }}>
            Manuell erstellen
          </button>
          <button onClick={generate} disabled={generating} style={{ padding:'13px 28px', background:generating?'#94A3B8':P, color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:generating?'not-allowed':'pointer', opacity:generating?.7:1, boxShadow:generating?'none':'0 2px 10px rgba(49,90,231,.25)', display:'inline-flex', alignItems:'center', gap:8, fontFamily:'inherit' }}>
            <span style={{display:'inline-flex'}}>{generating ? <Loader2 size={14} className="lk-spin"/> : <Target size={14}/>}</span>
            <span>{generating ? 'KI generiert…' : 'Zielgruppe generieren'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function Zielgruppen({ session }) {
  const { team, activeTeamId, members } = useTeam()
  const [sharingModalFor, setSharingModalFor] = useState(null)
  const uid = session.user.id
  const [items, setItems] = useState([])
  const [draftCheckTick, setDraftCheckTick] = useState(0)
  const hasWizardDraft = (() => {
    if (typeof window === 'undefined') return false
    void draftCheckTick // re-evaluate on tick change
    try {
      const fields = ['aud_w_position_', 'aud_w_needs_', 'aud_w_painPoints_', 'aud_w_hobbies_']
      return fields.some(prefix => {
        const v = window.localStorage.getItem(prefix + uid)
        if (!v) return false
        try { const pv = JSON.parse(v); return pv !== '' && pv !== null && pv !== 0 } catch(e) { return v !== '""' && v !== 'null' }
      })
    } catch(e) { return false }
  })()
  const [loading, setLoading] = useState(true)
  // view: smarter persist nur ueber Browser-Tab-Wechsel.
  const [view, setView] = useTabPersistedState('aud_view_'+uid, 'list')
  const [edit, setEdit] = useState(null)
  const [linkedBvIds, setLinkedBvIds] = useState([])
  const [tab, setTab]   = useState('grundlagen')
  const [genSummary, setGenSummary] = useState(false)
  const { model: selectedModel, setModel: setSelectedModel } = useModel()

  useEffect(() => { load() }, [session, activeTeamId])

  async function load() {
    setLoading(true)
    if (!activeTeamId) { setItems([]); setLoading(false); return }
    // Team-scoped — User sieht nur Zielgruppen des aktiven Teams.
    // RLS filtert zusaetzlich auf Owner/is_shared/Selektiv-Shares.
    const { data } = await supabase.from('target_audiences').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  async function save() {
    const { id, created_at, ...rest } = edit
    rest.updated_at = new Date().toISOString()
    if (id) {
      // team_id mit-setzen falls noch nicht gesetzt — fix für team-id-filter regression
      if (!rest.team_id && activeTeamId) rest.team_id = activeTeamId
      await supabase.from('target_audiences').update(rest).eq('id', id)
      await persistBrandVoiceLinks({ entityType: 'target_audience', entityId: id, teamId: activeTeamId, selectedBvIds: linkedBvIds })
    } else {
      rest.user_id = session.user.id
      // team_id beim Neuanlegen automatisch setzen
      if (!rest.team_id && activeTeamId) rest.team_id = activeTeamId
      const { data: ins } = await supabase.from('target_audiences').insert(rest).select().single()
      if (ins?.id) await persistBrandVoiceLinks({ entityType: 'target_audience', entityId: ins.id, teamId: activeTeamId, selectedBvIds: linkedBvIds })
    }
    await load()
    setView('list')
    setEdit(null)
  }

  async function remove(id) {
    if (!confirm('Zielgruppe wirklich löschen?')) return
    await supabase.from('target_audiences').delete().eq('id', id)
    load()
  }

  async function activate(id) {
    await supabase.from('target_audiences').update({ is_active: false }).eq('user_id', session.user.id)
    await supabase.from('target_audiences').update({ is_active: true }).eq('id', id)
    load()
  }

  async function generateSummary() {
    if (!edit) return
    setGenSummary(true)
    try {
      const summaryPrompt = [
        'Schreibe eine 100-150 Woerter AI-Summary fuer diese Zielgruppe (KI-Kontext fuer spaetere Generierungen).',
        '',
        'WICHTIG — Anonymisierung:',
        '- Verwende KEINE Eigennamen von Personen, konkrete Firmennamen, Universitaeten oder Ortschaften aus dem Quell-Profil.',
        '- Formuliere die Summary als Beschreibung einer ZIELGRUPPE (Plural / generisch), nicht als Steckbrief einer Einzelperson.',
        '- Falls in den Feldern ein Name oder konkreter Arbeitgeber auftaucht: ignorieren, abstrahieren zu Rolle/Branche/Region.',
        '',
        '## Zielgruppen-Felder:',
        JSON.stringify(edit, null, 2)
      ].join('\n')
      const { data, error } = await supabase.functions.invoke('generate', {
        body: { type:'target_audience_summary', prompt: summaryPrompt, userId: session.user.id }
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

  const TABS = [
    { v:'grundlagen',         label:'Grundlagen',         icon:<Briefcase size={14} strokeWidth={1.75}/>, color:'blue',   sub:'Profil & Pain Points' },
    { v:'herausforderungen',  label:'Herausforderungen',  icon:<Target size={14} strokeWidth={1.75}/>, color:'green',  sub:'Ziele & Trigger' },
    { v:'linkedin',           label:'LinkedIn-Kontext',   icon:<LinkedinIcon size={14} strokeWidth={1.75}/>, color:'purple', sub:'Themen & Ansprache' },
    { v:'summary',            label:'AI Summary',         icon:<Sparkles size={14} strokeWidth={1.75}/>, color:'brand',  sub:'System-Prompt' },
  ]

  if (view === 'list') {
    if (loading) return <div style={{textAlign:'center',color:'var(--text-muted)',padding:60}}>Laden…</div>

    // Empty-State: Hero
    if (items.length === 0) return (
      <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'12px 16px' }}>
        {hasWizardDraft && (
          <div data-tick={draftCheckTick} style={{ marginTop:14, padding:'12px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.30)', borderRadius:10, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <FileText size={18} strokeWidth={1.75} style={{ color:'var(--wl-primary, rgb(49,90,231))' }}/>
            <div style={{ flex:1, minWidth:220 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#92400E' }}>Du hast einen unfertigen Zielgruppen-Entwurf</div>
              <div style={{ fontSize:11, color:'#92400E', opacity:.9 }}>Deine Eingaben sind gespeichert — du kannst dort weitermachen.</div>
            </div>
            <button onClick={()=>setView('wizard')} style={{ padding:'7px 14px', background:P, color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}><span style={{display:"inline-flex",alignItems:"center",gap:6}}><Target size={12}/>Fortsetzen</span></button>
            <button onClick={()=>{ clearDraftsByPrefix('aud_w_'); setDraftCheckTick(t=>t+1) }} style={{ padding:'7px 14px', background:'transparent', color:'#92400E', border:'1px solid rgba(146,64,14,0.30)', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>Verwerfen</button>
          </div>
        )}
        <EmptyHero
          eyebrow="Schritt 2 · Branding"
          title="Wem schreibst du eigentlich?"
          subtitle="Definiere deine Zielgruppen — wen willst du erreichen, was bewegt sie, wo holst du sie ab. Die KI nutzt diese Profile bei jedem Text, der für sie gedacht ist."
          primaryLabel="Neue Zielgruppe mit KI"
          onPrimary={()=>{ clearDraftsByPrefix('aud_w_'); clearTabPersistedKey('ki_tab_audience'); setView('wizard') }}
          secondaryLabel="→ oder manuell erstellen"
          onSecondary={()=>{ setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('grundlagen') }}
          helperText="Du kannst mehrere Zielgruppen anlegen und sie pro Content-Stück gezielt auswählen."
        />
      </div>
    )

    // List-View mit Inhalten
    return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Branding · Schritt 2 von 3</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Zielgruppen.</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>Wer hört zu, wenn du etwas postest. Aktive Zielgruppen fließen in jeden generierten Text ein.</p>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:18 }}>
        <button onClick={()=>{ clearDraftsByPrefix('aud_w_'); clearTabPersistedKey('ki_tab_audience'); setView('wizard') }} style={{ padding:'10px 20px', background:P, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 8px rgba(49,90,231,.18)' }}><span style={{display:"inline-flex",alignItems:"center",gap:6}}><Target size={14}/>Neue Zielgruppe mit KI</span></button>
        <button onClick={()=>{ setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('grundlagen') }}
          style={{ padding:'10px 20px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, fontSize:13, cursor:'pointer', color:'var(--text-primary)', fontWeight:500 }}>+ Manuell erstellen</button>
      </div>

      {hasWizardDraft && (
        <div data-tick={draftCheckTick} style={{ marginBottom:16, padding:'12px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.30)', borderRadius:10, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <FileText size={18} strokeWidth={1.75} style={{ color:'var(--wl-primary, rgb(49,90,231))' }}/>
          <div style={{ flex:1, minWidth:220 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#92400E' }}>Du hast einen unfertigen Zielgruppen-Entwurf</div>
            <div style={{ fontSize:11, color:'#92400E', opacity:.9 }}>Deine Eingaben sind gespeichert — du kannst dort weitermachen.</div>
          </div>
          <button onClick={()=>setView('wizard')} style={{ padding:'7px 14px', background:P, color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}><span style={{display:"inline-flex",alignItems:"center",gap:6}}><Target size={12}/>Fortsetzen</span></button>
          <button onClick={()=>{ clearDraftsByPrefix('aud_w_'); setDraftCheckTick(t=>t+1) }} style={{ padding:'7px 14px', background:'transparent', color:'#92400E', border:'1px solid rgba(146,64,14,0.30)', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}>Verwerfen</button>
        </div>
      )}

      {(() => {
        const myItems     = items.filter(v => v.user_id === session.user.id)
        const sharedItems = items.filter(v => v.user_id !== session.user.id)
        const renderCard = (v) => (
            <div key={v.id} style={{ background:'var(--surface)', borderRadius:12, border: v.is_active ? `2px solid ${P}` : '1.5px solid var(--border)', padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)' }}>{v.name || 'Neue Zielgruppe'}</span>
                    {v.is_active && <span style={{ fontSize:10, background:'var(--success-soft)', color:'var(--success-text)', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>Aktiv</span>}
                    {v.linkedin_template_url && <span style={{ fontSize:10, background:'#ede9fe', color:'#6d28d9', padding:'2px 8px', borderRadius:10, display:'inline-flex', alignItems:'center', gap:4 }}><LinkedinIcon size={10} strokeWidth={1.75}/>LinkedIn</span>}
                    {v.source_url && <span style={{ fontSize:10, background:'#e0f2fe', color:'#0369a1', padding:'2px 8px', borderRadius:10, display:'inline-flex', alignItems:'center', gap:4 }}><Link2 size={10} strokeWidth={1.75}/>URL</span>}
                    {v.file_name && <span style={{ fontSize:10, background:'#fef3c7', color:'#92400e', padding:'2px 8px', borderRadius:10 }}>Datei</span>}
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6 }}>
                    {v.job_titles && <span style={{ fontSize:11, color:'var(--text-muted)', background:'var(--surface-muted)', padding:'2px 8px', borderRadius:6 }}>{v.job_titles.slice(0,60)}{v.job_titles.length>60?'…':''}</span>}
                    {v.industries && <span style={{ fontSize:11, color:'var(--text-muted)', background:'var(--surface-muted)', padding:'2px 8px', borderRadius:6 }}>{v.industries.slice(0,40)}{v.industries.length>40?'…':''}</span>}
                    {v.region && <span style={{ fontSize:11, color:'var(--text-muted)', background:'var(--surface-muted)', padding:'2px 8px', borderRadius:6 }}>{v.region}</span>}
                    {v.decision_level && <span style={{ fontSize:11, color:'var(--text-muted)', background:'var(--surface-muted)', padding:'2px 8px', borderRadius:6, display:'inline-flex', alignItems:'center', gap:4 }}><BarChart3 size={10} strokeWidth={1.75}/>{v.decision_level}</span>}
                  </div>
                  {v.ai_summary && <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4 }}>{v.ai_summary.slice(0,150)}{v.ai_summary.length>150?'…':''}</div>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginLeft:12 }}>
                  <button onClick={()=>{ setEdit(v); setView('editor'); setTab('grundlagen') }} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid var(--border)', background:'var(--surface)', fontSize:12, cursor:'pointer', color:'var(--text-primary)' }}>Bearbeiten</button>
                  {!v.is_active && <button onClick={()=>activate(v.id)} style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${P}`, background:'var(--primary-soft)', color:P, fontSize:12, cursor:'pointer' }}>Aktivieren</button>}
                  {team && v.user_id === session.user.id && <button onClick={() => setSharingModalFor(v)}
                    style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid var(--border)', background: v.is_shared ? 'rgba(16,185,129,0.08)' : 'var(--surface)', fontSize:12, cursor:'pointer', color:'var(--text-primary)' }}>
                    {v.is_shared ? `${team.name || 'Team'}` : 'Sichtbarkeit'}
                  </button>}
                  {v.user_id === session.user.id && <button onClick={()=>remove(v.id)} style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'var(--danger-soft)', color:'var(--danger-text)', fontSize:12, cursor:'pointer' }}><Trash2 size={14} strokeWidth={1.75}/></button>}
                </div>
              </div>
            </div>
        )

        return (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {myItems.length > 0 && (
              <div>
                <h3 style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 10px' }}>
                  Meine Zielgruppen ({myItems.length})
                </h3>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>{myItems.map(renderCard)}</div>
              </div>
            )}
            {sharedItems.length > 0 && (
              <div>
                <h3 style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 10px' }}>
                  🤝 Mit dir geteilt ({sharedItems.length})
                </h3>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>{sharedItems.map(renderCard)}</div>
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
              entityType="target_audience"
              entityId={sharingModalFor.id}
              entityUserId={sharingModalFor.user_id}
              initialIsShared={!!sharingModalFor.is_shared}
              team={team}
              members={members || []}
              onSaved={({ is_shared, team_id }) => {
                setItems(prev => prev.map(it => it.id === sharingModalFor.id ? { ...it, is_shared, team_id } : it))
                setSharingModalFor(null)
              }}/>
          </div>
        </div>
      )}
    </div>
  )

  }

  if (view === 'wizard') return (
    <QuickSetup session={session} onDone={(saved) => { load(); setEdit(saved); setView('editor'); setTab('grundlagen') }} onSkip={() => { setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('grundlagen') }} onBack={() => { setView('list'); setEdit(null) }}/>
  )

  if (!edit) return null

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 0' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:18 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ background:'transparent', border:'1.5px solid var(--border)', borderRadius:10, width:36, height:36, fontSize:16, cursor:'pointer', color:'var(--text-muted)', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:2 }}>Branding · Schritt 2 von 3</div>
          <div style={{ fontSize:22, fontWeight:700, letterSpacing:'-.2px', lineHeight:1.2, color:'var(--text-primary)' }}>Zielgruppe bearbeiten</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Definiere dein LinkedIn-Zielpublikum</div>
        </div>
        <button onClick={save} style={{ padding:'11px 22px', background:P, color:'#fff', border:'none', borderRadius:10, fontSize:13.5, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 10px rgba(49,90,231,.25)', display:'inline-flex', alignItems:'center', gap:8, fontFamily:'inherit', flexShrink:0 }}>
          <span style={{display:'inline-flex'}}><Save size={14}/></span><span>Zielgruppe speichern</span>
        </button>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <input value={edit.name||''} onChange={e=>u('name',e.target.value)} placeholder="Zielgruppen-Name"
          style={{ flex:1, padding:'10px 14px', border:'1.5px solid var(--border)', borderRadius:8, fontSize:15, fontWeight:600, background:'var(--surface)', color:'var(--text-primary)' }}/>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-muted)' }}>
          <input type="checkbox" checked={edit.is_active} onChange={e=>u('is_active',e.target.checked)}/> Aktiv
        </label>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} style={{ marginBottom:18 }}/>

      {tab==='grundlagen' && <>
        <SectionCard icon="🎭" color="purple" title="Welche Auftritte sprechen diese Zielgruppe an?" subtitle="Mehrfach-Auswahl — die Zielgruppe taucht dann bei der entsprechenden Brand Voice auf">
          <BrandVoiceMultiSelect
            entityType="target_audience"
            entityId={edit.id || null}
            onSelectionChange={setLinkedBvIds}
          />
        </SectionCard>
        <SectionCard icon={<Briefcase size={18} strokeWidth={1.75}/>} color="blue" title="Berufliches Profil" subtitle="Position, Branche und Unternehmensumfeld">
          <Lb l="Job-Titel & Rollen" h="Welche Positionen hat deine Zielgruppe?"/>
          <Tx v={edit.job_titles} fn={v=>u('job_titles',v)} r={2} ph="z.B. Head of Marketing, CMO, Marketing Manager, Growth Lead"/>
          <Lb l="Branchen" h="In welchen Branchen arbeitet deine Zielgruppe?"/>
          <Tx v={edit.industries} fn={v=>u('industries',v)} r={2} ph="z.B. SaaS, E-Commerce, FinTech, Beratung"/>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1 }}>
              <Lb l="Unternehmensgröße"/>
              <In v={edit.company_size} fn={v=>u('company_size',v)} ph="z.B. 50-500 MA, Mittelstand, Enterprise"/>
            </div>
            <div style={{ flex:1 }}>
              <Lb l="Entscheidungsebene"/>
              <In v={edit.decision_level} fn={v=>u('decision_level',v)} ph="z.B. C-Level, VP, Director, Manager"/>
            </div>
          </div>
          <Lb l="Region / Markt"/>
          <In v={edit.region} fn={v=>u('region',v)} ph="z.B. DACH, Deutschland, Europa"/>
          <Lb l="Hobbies / Interessen (optional)" h="Hilft der KI, authentische Hooks zu finden"/>
          <In v={edit.hobbies} fn={v=>u('hobbies',v)} ph="z.B. Bergsteigen, Slow-Food, Philosophie-Podcasts"/>
        </SectionCard>
      </>}

      {tab==='herausforderungen' && <>
        <SectionCard icon={<AlertTriangle size={18} strokeWidth={1.75}/>} color="coral" title="Pain Points" subtitle="Welche Probleme und Herausforderungen plagen sie">
          <Lb l="Probleme & Herausforderungen" h="Welche Probleme beschäftigen diese Zielgruppe?"/>
          <Tx v={edit.pain_points} fn={v=>u('pain_points',v)} r={5} ph="- Schwierigkeit, qualifizierte Leads zu generieren&#10;- Hoher CPL bei bezahlten Kampagnen&#10;- Mangelnde Sichtbarkeit der Marke&#10;- Keine klare Content-Strategie"/>
        </SectionCard>
        <SectionCard icon={<Target size={18} strokeWidth={1.75}/>} color="green" title="Bedürfnisse & Ziele" subtitle="Was wollen sie erreichen — beruflich wie persönlich">
          <Lb l="Was will diese Zielgruppe erreichen?" h="Prioritäten, Erwartungen, Wünsche"/>
          <Tx v={edit.needs_goals} fn={v=>u('needs_goals',v)} r={5} ph="- Mehr qualifizierte Inbound-Leads&#10;- Thought Leadership aufbauen&#10;- ROI-messbare Marketing-Strategie"/>
        </SectionCard>
      </>}

      {tab==='linkedin' && <>
        <SectionCard icon={<Lightbulb size={18} strokeWidth={1.75}/>} color="amber" title="Themen & Interessen" subtitle="Wofür interessieren sie sich, wo holen sie sich Input">
          <Lb l="Welche Themen bewegen diese Zielgruppe auf LinkedIn?" h="Content-Themen, Trends, Diskussionen"/>
          <Tx v={edit.topics_interests} fn={v=>u('topics_interests',v)} r={3} ph="z.B. B2B Marketing, Lead Generation, Account-Based Marketing, Marketing Automation, Content Marketing"/>
        </SectionCard>
        <SectionCard icon={<Zap size={18} strokeWidth={1.75}/>} color="purple" title="Trigger-Events" subtitle="Welche Ereignisse machen sie offen für dein Angebot">
          <Lb l="Wann ist diese Zielgruppe besonders ansprechbar?" h="Karriere-Events, Unternehmensentwicklungen, Marktveränderungen"/>
          <Tx v={edit.trigger_events} fn={v=>u('trigger_events',v)} r={4} ph="- Neuer Job / Beförderung&#10;- Firmenwachstum / Funding-Runde&#10;- Neues Quartal / Budget-Planung"/>
        </SectionCard>
        <SectionCard icon={<MessageCircle size={18} strokeWidth={1.75}/>} color="teal" title="Ansprache-Tipps" subtitle="Wie kommunizierst du auf Augenhöhe mit dieser Zielgruppe">
          <Lb l="Wie spricht man diese Zielgruppe am besten an?" h="Kommunikationsstil, Dos & Don'ts für den Erstkontakt"/>
          <Tx v={edit.outreach_tips} fn={v=>u('outreach_tips',v)} r={4} ph="- Auf konkrete Herausforderungen eingehen&#10;- Keine generischen Pitches&#10;- Gemeinsame Connections erwähnen"/>
        </SectionCard>
      </>}
      {tab==='summary' && <>
        <SectionCard icon={<Sparkles size={18} strokeWidth={1.75}/>} color="brand" title="Zielgruppen-Summary" subtitle="Der zusammengefasste Kontext für KI-Aufrufe">
          <Lb l="AI Summary" h="Wird als Kontext in KI-Generierungen verwendet"/>
          {edit.ai_summary ? (
            <Tx v={edit.ai_summary} fn={v=>u('ai_summary',v)} r={6}/>
          ) : (
            <div style={{ color:'var(--warm)', fontSize:11, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6 }}><AlertTriangle size={12} strokeWidth={1.75}/>Noch keine KI-Summary — generiere eine für bessere Ergebnisse</div>
          )}
          <button onClick={generateSummary} disabled={genSummary} style={{ padding:'8px 16px', background:'#7C3AED', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', opacity:genSummary?.6:1 }}>
            {genSummary ? <span style={{display:"inline-flex",alignItems:"center",gap:6}}><Loader2 size={12} className="lk-spin"/>Generiert…</span> : <span style={{display:"inline-flex",alignItems:"center",gap:6}}><RefreshCw size={12}/>Summary generieren</span>}
          </button>
        </SectionCard>
      </>}

      <div style={{ marginTop:24, marginBottom:24, padding:'18px 0 0', borderTop:'1.5px solid var(--border, #E5E7EB)', display:'flex', gap:10, justifyContent:'space-between', alignItems:'center' }}>
        <button onClick={() => {
          const i = TABS.findIndex(t => t.v === tab)
          if (i > 0) setTab(TABS[i-1].v)
        }} disabled={tab === TABS[0].v}
          style={{ padding:'11px 20px', background:'transparent', border:'1.5px solid var(--border, #E5E7EB)', borderRadius:10, fontSize:13.5, cursor:tab===TABS[0].v?'not-allowed':'pointer', color:tab===TABS[0].v?'#CBD5E1':'var(--text-muted)', fontFamily:'inherit', fontWeight:500, opacity:tab===TABS[0].v?.5:1, display:'inline-flex', alignItems:'center', gap:6 }}>
          <span>←</span><span>Zurück</span>
        </button>
        {tab === TABS[TABS.length-1].v ? (
          <button onClick={()=>{ save(); }}
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
