import { useTranslation } from 'react-i18next'
import React, { useEffect, useState, useCallback } from 'react'
import GenerationLoading from '../components/GenerationLoading'
import { Briefcase, FileText, Sparkles, X, IdCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { sharedEntityIds, scopeByTeamOrShared } from '../lib/teamShares'
import { buildAudiencePrompt, buildStrike2AudiencePrompt, buildKnowledgePrompt } from '../lib/audiencePrompt'
import { useTeam } from '../context/TeamContext'
import { useModel } from '../context/ModelContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import AccentActionButton from '../components/AccentActionButton'
import TabBar from '../components/TabBar'
import PageShell from '../components/PageShell'

// ─── Constants ────────────────────────────────────────────────────────────────
const P = 'var(--wl-primary, rgb(49,90,231))'

const AUSRICHTUNGEN = [
  { id: 'professional',   label: 'Professionell',     desc: 'Klar, seriös, vertrauenswürdig' },
  { id: 'storytelling',   label: 'Story-driven',      desc: 'Persönlich, emotional, inspirierend' },
  { id: 'results',        label: 'Ergebnisorientiert',desc: 'Zahlen, Fakten, Erfolge' },
  { id: 'thought_leader', label: 'Thought Leader',    desc: 'Vision, Meinung, Expertise' },
]

const HEADLINE_LENGTHS = [
  { id: 'full',    label: 'Vollständig (180–220)', desc: 'SEO-optimiert, alle Keywords' },
  { id: 'concise', label: 'Prägnant (100–150)',    desc: 'Mobil sichtbar, auf den Punkt' },
]
// Company Page: Tagline-Limit 120 Zeichen
const HEADLINE_LENGTHS_COMPANY = [
  { id: 'full',    label: 'Vollständig (100–120)', desc: 'Volle Tagline-Länge' },
  { id: 'concise', label: 'Prägnant (60–90)',      desc: 'Kurz und einprägsam' },
]

const ABOUT_LENGTHS = [
  { id: 'short',  label: 'Kurz (800–1000)',   desc: 'Knackig, schnell lesbar' },
  { id: 'medium', label: 'Mittel (1400–1800)',desc: 'Sweet-Spot für Engagement' },
  { id: 'long',   label: 'Lang (2000–2400)',  desc: 'Maximaler SEO-Effekt' },
]

const ABOUT_STRUCTURES = [
  { id: 'hpsc',  label: 'Hook → Problem → Lösung → CTA', desc: 'Klassische Struktur, hohe Conversion' },
  { id: 'story', label: 'Story-basiert',                 desc: 'Anekdote → Learnings → Angebot' },
]

const POSITION_LENGTHS = [
  { id: 'compact',  label: 'Kompakt (800–1200)', desc: 'Überblick mit Kern-Outcomes' },
  { id: 'detailed', label: 'Ausführlich (1500–2000)', desc: 'Maximale Tiefe, mehr Keywords' },
]

const POSITION_FOCUS = [
  { id: 'impact',          label: 'Impact & Outcomes', desc: 'Ergebnisse, Zahlen, Wirkung' },
  { id: 'responsibilities',label: 'Verantwortlichkeiten & Erfolge', desc: 'Aufgaben + Erfolge' },
]

// ─── UI Helpers ───────────────────────────────────────────────────────────────
const Card = ({children, style={}}) => (
  <div style={{background:'var(--surface)',borderRadius:12,border:'1px solid var(--border)',overflow:'hidden',boxShadow:'0 1px 3px rgba(15,23,42,0.06)',marginBottom:14,...style}}>
    {children}
  </div>
)
const CardHead = ({children}) => (
  <div style={{padding:'13px 18px',borderBottom:'1px solid #F1F5F9'}}>{children}</div>
)
const CardBody = ({children, style={}}) => (
  <div style={{padding:'16px 18px',...style}}>{children}</div>
)
const Label = ({children, style={}}) => (
  <label style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:7,display:'block',...style}}>{children}</label>
)
const Sub = ({children}) => (
  <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:10}}>{children}</div>
)

// Compact pill-row used for Ausrichtung / Länge / Struktur / Fokus
function PillRow({options, value, onChange}) {
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
      {options.map(o => {
        const on = value === o.id
        return (
          <button
            key={o.id}
            onClick={()=>onChange(o.id)}
            title={o.desc}
            style={{
              padding:'7px 13px',borderRadius:999,fontSize:12.5,fontWeight:on?700:600,
              border:'1.5px solid '+(on?P:'#E2E8F0'),
              background:on?'rgba(49,90,231,0.08)':'#fff',
              color:on?P:'#475569',cursor:'pointer',whiteSpace:'nowrap',
              transition:'all 0.15s'
            }}
          >{o.label}</button>
        )
      })}
    </div>
  )
}

// Collapsible section with a clickable header row
function Collapsible({title, summary, defaultOpen=false, children, danger=false}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{border:'1px solid var(--border)',borderRadius:10,background:'var(--surface)',marginBottom:open?14:10}}>
      <button
        onClick={()=>setOpen(!open)}
        style={{
          width:'100%',padding:'11px 14px',background:'transparent',border:'none',cursor:'pointer',
          display:'flex',alignItems:'center',gap:10,textAlign:'left',
          borderBottom:open?'1px solid #F1F5F9':'none'
        }}
      >
        <span style={{fontSize:11,color:'#64748B',width:14,display:'inline-block'}}>{open?'▾':'▸'}</span>
        <span style={{fontSize:13,fontWeight:700,color:danger?'#DC2626':'rgb(20,20,43)'}}>{title}</span>
        {summary && (
          <span style={{fontSize:12,color:'var(--text-muted)',marginLeft:'auto'}}>{summary}</span>
        )}
      </button>
      {open && <div style={{padding:'14px 16px'}}>{children}</div>}
    </div>
  )
}

function OptButton({active, onClick, main, sub, compact}) {
  return (
    <button onClick={onClick} style={{
      padding: compact ? '7px 10px' : '9px 12px',
      borderRadius: 9, cursor: 'pointer', textAlign: 'left', width: '100%', display: 'block',
      border: '1.5px solid ' + (active ? P : '#E5E7EB'),
      background: active ? 'rgba(49,90,231,0.08)' : 'rgb(238,241,252)',
      transition: 'all 0.15s', marginBottom: 6
    }}>
      <div style={{fontSize:12,fontWeight:700,color:active?P:'rgb(20,20,43)'}}>{main}</div>
      {sub ? <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{sub}</div> : null}
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Profiltexte({ session }) {
  const { t } = useTranslation()
  const { activeTeamId, team } = useTeam()

  // Shared data
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [brandVoices, setBrandVoices] = useState([])
  const [audiences, setAudiences] = useState([])
  const [knowledgeItems, setKnowledgeItems] = useState([])
  const [history, setHistory] = useState([])

  // Base selectors (grundlage)
  const [selectedBrandVoice, setSelectedBrandVoice] = useState('auto') // 'auto' | 'none' | <uuid>
  const [selectedAudiences, setSelectedAudiences] = useState([]) // [uuid, ...]
  const [selectedKnowledge, setSelectedKnowledge] = useState([]) // [uuid, ...]

  // Tabs
  const { model: selectedModel, setModel: setSelectedModel } = useModel()
  const { activeBrandVoice } = useBrandVoice()
  // Company Brand: Page-Profiltexte haben andere Struktur + Limits (Tagline 120 / About 2.000 / Spezialgebiete 256)
  const isCompany = activeBrandVoice?.account_type === 'company_page'
  const [activeTab, setActiveTab] = useState('headline') // headline | about | position | all

  // ─── Headline state ──────────────────────────
  const [hAusrichtung, setHAusrichtung] = useState('professional')
  const [hLength, setHLength] = useState('full')
  const [hKeywords, setHKeywords] = useState('')
  const [hExtra, setHExtra] = useState('')
  const [hResult, setHResult] = useState('')
  const [hLoading, setHLoading] = useState(false)
  const [hError, setHError] = useState('')
  const [hCopied, setHCopied] = useState(false)
  const [hRefine, setHRefine] = useState('')
  const [hRefineOpen, setHRefineOpen] = useState(false)

  // ─── About state ─────────────────────────────
  const [aAusrichtung, setAAusrichtung] = useState('professional')
  const [aLength, setALength] = useState('medium')
  const [aStructure, setAStructure] = useState('hpsc')
  const [aExtra, setAExtra] = useState('')
  const [aResult, setAResult] = useState('')
  const [aLoading, setALoading] = useState(false)
  const [aError, setAError] = useState('')
  const [aCopied, setACopied] = useState(false)
  const [aRefine, setARefine] = useState('')
  const [aRefineOpen, setARefineOpen] = useState(false)

  // ─── Position state ──────────────────────────
  const [pTitle, setPTitle] = useState('')
  const [pCompany, setPCompany] = useState('')
  const [pAusrichtung, setPAusrichtung] = useState('results')
  const [pLength, setPLength] = useState('compact')
  const [pFocus, setPFocus] = useState('impact')
  const [pExtra, setPExtra] = useState('')
  const [pResult, setPResult] = useState('')
  const [pLoading, setPLoading] = useState(false)
  const [pError, setPError] = useState('')
  const [pCopied, setPCopied] = useState(false)
  const [pRefine, setPRefine] = useState('')
  const [pRefineOpen, setPRefineOpen] = useState(false)

  // ─── All-three state ─────────────────────────
  const [allAusrichtung, setAllAusrichtung] = useState('professional')
  const [allExtra, setAllExtra] = useState('')
  const [allResult, setAllResult] = useState({headline:'', about:'', position:''})
  const [allLoading, setAllLoading] = useState(false)
  const [allError, setAllError] = useState('')
  const [allRefineH, setAllRefineH] = useState('')
  const [allRefineA, setAllRefineA] = useState('')
  const [allRefineP, setAllRefineP] = useState('')
  const [allRefineHOpen, setAllRefineHOpen] = useState(false)
  const [allRefineAOpen, setAllRefineAOpen] = useState(false)
  const [allRefinePOpen, setAllRefinePOpen] = useState(false)

  // Flash/toast
  const [flash, setFlash] = useState('')

  // ─── Load data ───────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const uid = session.user.id
    const [profRes, bvRes, audRes, kbRes, histRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      // BVs und Zielgruppen sind team-scoped — nur Items des aktiven Teams laden
      activeTeamId
        ? (async () => scopeByTeamOrShared(supabase.from('brand_voices').select('*'), activeTeamId, await sharedEntityIds('brand_voices', activeTeamId)).order('updated_at',{ascending:false}))()
        : Promise.resolve({ data: [] }),
      activeTeamId
        ? (async () => scopeByTeamOrShared(supabase.from('target_audiences').select('*'), activeTeamId, await sharedEntityIds('target_audiences', activeTeamId)).order('updated_at',{ascending:false}))()
        : Promise.resolve({ data: [] }),
      supabase.from('knowledge_base').select('*').eq('user_id', uid).order('updated_at',{ascending:false}),
      (async () => {
        let q = supabase.from('content_history').select('*').eq('user_id', uid)
          .in('template_label',['Profilslogan','Info-Box','Positionsbeschreibung','Profiltexte (alle)','Tagline','Über uns (Page)','Spezialgebiete (Page)'])
          .order('created_at',{ascending:false}).limit(30)
        // BV-Filter
        if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
        return q
      })(),
    ])
    const prof = profRes.data
    setProfile(prof)
    setBrandVoices(bvRes.data || [])
    let _s2aud = []
    if (activeTeamId) {
      try {
        const { data: s2d } = await supabase.from('strike2_personas').select('id, name, persona_grunddaten, antworten').eq('team_id', activeTeamId).order('updated_at', { ascending: false })
        _s2aud = (s2d || []).filter(pp => pp && ((pp.antworten && Object.keys(pp.antworten).length > 0) || (pp.persona_grunddaten && Object.keys(pp.persona_grunddaten).length > 1)))
          .map(pp => ({ id: 's2:' + pp.id, name: pp.name || 'Strike2 Zielgruppe', kind: 'strike2', __strike2: pp }))
      } catch (_e) {}
    }
    setAudiences([...(audRes.data || []), ..._s2aud])
    setKnowledgeItems(kbRes.data || [])
    setHistory(histRes.data || [])

    // Defaults
    if (prof && prof.headline && !pTitle) setPTitle(prof.headline)
    if (prof && prof.company && !pCompany) setPCompany(prof.company)

    // Auto-select active audiences
    const activeAud = (audRes.data || []).filter(a => a.is_active).map(a => a.id)
    if (activeAud.length > 0 && selectedAudiences.length === 0) setSelectedAudiences(activeAud)

    setLoading(false)
  }, [session.user.id, activeTeamId])

  useEffect(() => { loadData() }, [loadData])

  // ─── Helpers ─────────────────────────────────
  function getBrandVoice() {
    return activeBrandVoice || null
  }

  function showFlash(msg) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  function buildBaseContext() {
    const parts = []
    if (profile) {
      parts.push('## PERSON')
      if (profile.full_name) parts.push('Name: ' + profile.full_name)
      if (profile.headline)  parts.push('Aktuelle Position: ' + profile.headline)
      if (profile.company)   parts.push('Unternehmen: ' + profile.company)
      if (profile.bio)       parts.push('Kurzbio: ' + profile.bio)
    }

    const bv = getBrandVoice()
    if (bv) {
      parts.push('')
      parts.push('## BRAND VOICE (Tonalität & Stil)')
      if (bv.brand_name)   parts.push('Marke: ' + bv.brand_name)
      if (bv.personality)  parts.push('Persönlichkeit: ' + bv.personality)
      if (bv.tone_attributes && bv.tone_attributes.length) parts.push('Ton: ' + bv.tone_attributes.join(', '))
      if (bv.formality === 'du') parts.push('Ansprache: Du-Form')
      if (bv.formality === 'sie') parts.push('Ansprache: Sie-Form')
      if (bv.dos)          parts.push('Dos: ' + bv.dos)
      if (bv.donts)        parts.push("Don'ts: " + bv.donts)
      if (bv.ai_summary)   parts.push('Zusammenfassung: ' + bv.ai_summary)
    }

    const selAud = audiences.filter(a => selectedAudiences.includes(a.id))
    if (selAud.length > 0) {
      selAud.forEach(a => { parts.push(''); parts.push(a.kind === 'strike2' ? buildStrike2AudiencePrompt(a.__strike2) : buildAudiencePrompt(a)) })
    }

    const selKB = knowledgeItems.filter(k => selectedKnowledge.includes(k.id))
    if (selKB.length > 0) {
      parts.push('')
      parts.push(buildKnowledgePrompt(selKB))
    }
    return parts.join('\n')
  }

  const SYSTEM_PROMPT = `Du bist ein deutschsprachiger LinkedIn-Profil-Experte. Du kombinierst Positionierung, Copywriting und LinkedIn-SEO. Dein Stil: klar, strukturiert, pragmatisch — aber warm, menschlich und verständlich.

REGELN (hart):
- Keine allgemeinen Phrasen wie „leidenschaftlich", „ergebnisorientiert", „innovativ" ohne Beleg.
- Kein Marketing-Blabla. Keine Buzzwords ohne Substanz.
- Emojis sparsam: max. 4 insgesamt pro Text, max. 1 pro Zeile.
- Kein Markdown: keine Sternchen, keine **Fett**-Formatierung, keine #-Überschriften. LinkedIn unterstützt das nicht im Profil.
- Stattdessen: Zeilenumbrüche und Bulletpoints mit "•" oder "—".
- Keine erfundenen Zahlen/Referenzen. Wenn Social Proof fehlt, nutze Platzhalter in eckigen Klammern wie [Referenz/Case], [Messbares Ergebnis].
- Schreibe so, dass es direkt in LinkedIn kopiert werden kann — ohne jede Nachbearbeitung.
- Keywords natürlich integrieren, kein Keyword-Stuffing.
- Brand Voice ist führend: folge ihrer Tonalität und ihren Dos/Don'ts strikt.
- Zielgruppen-Wissen nutzen, um Pain Points und Sprache zu treffen.
- Wissensressourcen nutzen, um konkret und glaubwürdig zu argumentieren.`

  async function callGenerate(userPrompt, type) {
    const _kindMapPre = { 'linkedin_headline': 'profile_slogan', 'linkedin_about': 'profile_about', 'linkedin_position': 'profile_position' }
    const { data: d } = await supabase.functions.invoke('generate', { body: { type, systemPrompt: SYSTEM_PROMPT, prompt: userPrompt, model: selectedModel, brand_voice_id: activeBrandVoice?.id || null, content_kind: _kindMapPre[type] || null } })
    // Memory: Generation cross-domain loggen
    if (d?.text || d?.result || d?.content) {
      const kindMap = { 'linkedin_headline': 'profile_slogan', 'linkedin_about': 'profile_about', 'linkedin_position': 'profile_position' }
      const kind = kindMap[type]
      if (kind) {
        try {
          const { recordGeneration } = await import('../lib/contentMemory')
          await recordGeneration({
            userId: session.user.id, teamId: activeTeamId,
            kind, model: selectedModel,
            promptInput: inputFields || {},
            brandVoiceId: activeBrandVoice?.id || null,
            variants: [d.text || d.result || d.content],
          })
        } catch (_) {}
      }
    }
    return (d && (d.text || d.content || d.comment || d.about)) || ''
  }

  async function saveHistory(label, inputFields, generatedText) {
    const bv = getBrandVoice()
    await supabase.from('content_history').insert({
      user_id: session.user.id,
      template_label: label,
      input_fields: inputFields,
      generated_text: generatedText,
      brand_voice_id: bv ? bv.id : null,
      brand_voice_snapshot: bv ? bv.ai_summary : null,
      ignored_brand_voice: !bv,
    })
    // Refresh history
    let q = supabase.from('content_history').select('*').eq('user_id', session.user.id)
      .in('template_label',['Profilslogan','Info-Box','Positionsbeschreibung','Profiltexte (alle)','Tagline','Über uns (Page)','Spezialgebiete (Page)'])
      .order('created_at',{ascending:false}).limit(30)
    // BV-Filter
    if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
    const { data } = await q
    setHistory(data || [])
  }

  // ─── Refine: generic helper for text editing via KI ───
  async function refine({type, currentText, instruction, setResult, setLoading, setError, historyLabel, inputFields, refineSetter}) {
    if (!currentText || !currentText.trim()) { setError('Kein Text zum Überarbeiten vorhanden.'); return }
    if (!instruction || !instruction.trim()) { setError('Bitte beschreibe, was verändert werden soll.'); return }
    setLoading(true); setError('')
    const typeLimits = { linkedin_headline: '220', linkedin_about: '2.600', linkedin_position: '2.000' }
    const typeNames  = { linkedin_headline: 'Profilslogan (Headline)', linkedin_about: 'Info-Box', linkedin_position: 'Positionsbeschreibung' }
    const prompt = [
      buildBaseContext(),
      '',
      '## AUFGABE: Überarbeite folgenden LinkedIn-' + typeNames[type],
      '',
      'AKTUELLER TEXT:',
      '---',
      currentText,
      '---',
      '',
      'ÄNDERUNGSWÜNSCHE:',
      instruction,
      '',
      'REGELN:',
      '- Behalte die grundsätzliche Tonalität, Brand Voice und Struktur bei',
      '- Setze nur die konkret angefragten Änderungen um, lasse den Rest wie er ist',
      '- Halte das Zeichenlimit ein: max. ' + typeLimits[type] + ' Zeichen',
      '- Kein Markdown, keine Erklärungen davor/danach',
      '',
      'AUSGABE: Nur der überarbeitete Text, sofort copy-paste-fertig.'
    ].join('\n')
    try {
      const text = await callGenerate(prompt, type)
      if (text) {
        const clean = text.trim()
        setResult(clean)
        if (refineSetter) refineSetter('')
        await saveHistory(historyLabel + ' (überarbeitet)', inputFields, clean)
      } else { setError('Keine Antwort vom KI-Service erhalten.') }
    } catch (e) { setError('Fehler: ' + e.message) }
    setLoading(false)
  }

  // ─── Generate: Headline ──────────────────────
  async function genHeadline() {
    setHLoading(true); setHError('')
    const aus = AUSRICHTUNGEN.find(v => v.id === hAusrichtung)
    const len = HEADLINE_LENGTHS.find(v => v.id === hLength)
    const targetLen = isCompany
      ? (hLength === 'concise' ? '60–90 Zeichen' : '100–120 Zeichen')
      : (hLength === 'concise' ? '100–150 Zeichen' : '180–220 Zeichen')
    const visibleHint = hLength === 'concise'
      ? 'Bei 100–150 Zeichen ist der gesamte Text überall sichtbar (auch in Search & Connection Requests).'
      : 'Die ersten ~60 Zeichen sind auf Mobile, die ersten ~120 auf Desktop in Search/Comments sichtbar — dort MUSS der Kern stehen. Rest für SEO.'

    const companyTaglineRules = [
      'LINKEDIN-REGELN FÜR COMPANY-PAGE-TAGLINES:',
      '- HARTES LIMIT: max. 120 Zeichen (LinkedIn-Page-Tagline-Limit).',
      '- Die Tagline steht direkt unter dem Logo — Value Proposition auf den Punkt.',
      '- Struktur-Empfehlung: [Was das Unternehmen tut] für [wen] — [Differenzierung].',
      '- Keine Buzzword-Ketten („innovativ, dynamisch, kundenorientiert"), keine Superlative ohne Beleg.',
      '- 1–2 relevante Keywords natürlich einbauen (Page-SEO).',
    ]
    const prompt = [
      buildBaseContext(),
      '',
      isCompany ? '## AUFGABE: Erstelle eine Tagline für eine LinkedIn Company Page' : '## AUFGABE: Erstelle einen LinkedIn-Profilslogan (Headline)',
      'Ziellänge: ' + targetLen,
      'Ausrichtung: ' + aus.label + ' — ' + aus.desc,
      '',
      ...(isCompany ? companyTaglineRules : [
      'LINKEDIN-REGELN FÜR HEADLINES:',
      '- ' + visibleHint,
      '- Struktur-Empfehlung: [Rolle/Titel] | [Wem du hilfst] | [Wie + Differenzierung]',
      '- Pipe-Separator "|" für Lesbarkeit (alternativ "•")',
      '- Zahlen/Metriken wo glaubwürdig möglich (z.B. „+500 begleitete Kund:innen")',
      '- Keine Standard-Floskeln wie „Passionate about…" oder „Results-driven…"',
      '- 2–4 relevante Keywords natürlich einbauen',
      ]),
      hKeywords ? 'Keyword-Wünsche: ' + hKeywords : '',
      hExtra ? '' : '',
      hExtra ? 'ZUSATZKONTEXT: ' + hExtra : '',
      '',
      'AUSGABE: Nur die fertige Headline als reinen Text, kein Kommentar, keine Anführungszeichen, keine Erklärung davor/danach. Ein einziger String, sofort copy-paste-fertig.'
    ].filter(Boolean).join('\n')

    try {
      const text = await callGenerate(prompt, 'linkedin_headline')
      if (text) {
        const clean = text.trim().replace(/^["„'»]+|["'"«]+$/g, '')
        setHResult(clean)
        await saveHistory(isCompany ? 'Tagline' : 'Profilslogan', {
          ausrichtung: hAusrichtung, length: hLength, keywords: hKeywords, extra: hExtra,
          audiences: selectedAudiences, knowledge: selectedKnowledge
        }, clean)
      } else {
        setHError('Keine Antwort vom KI-Service erhalten.')
      }
    } catch (e) { setHError('Fehler: ' + e.message) }
    setHLoading(false)
  }

  // ─── Generate: About ─────────────────────────
  async function genAbout() {
    setALoading(true); setAError('')
    const aus = AUSRICHTUNGEN.find(v => v.id === aAusrichtung)
    const len = ABOUT_LENGTHS.find(v => v.id === aLength)
    const struct = ABOUT_STRUCTURES.find(v => v.id === aStructure)
    const lenMap = isCompany
      ? { short:'600–900', medium:'1200–1600', long:'1700–2000' }
      : { short:'800–1000', medium:'1400–1800', long:'2000–2400' }

    const structurePrompt = aStructure === 'hpsc' ? [
      'STRUKTUR (Hook → Problem → Lösung → CTA):',
      '1. HOOK (erste 2–3 Zeilen, ~250 Zeichen): muss zum Klick auf „…mehr anzeigen" bewegen. Eine präzise Beobachtung, eine überraschende These oder eine scharfe Frage. Kein „Willkommen auf meinem Profil".',
      '2. PROBLEM (2–3 Sätze): Für wen, welches konkrete Problem, warum ist es relevant.',
      '3. LÖSUNG (3–5 Bulletpoints mit „•"): Was du konkret lieferst. Outcomes, keine Aufgaben.',
      '4. MOTIVATION (1–2 Sätze): Warum du das machst — echte Motivation, keine Platitüde.',
      '5. CTA (1 Satz): Was der/die Leser:in als nächstes tun soll.',
    ] : [
      'STRUKTUR (Story-basiert):',
      '1. HOOK (erste 2–3 Zeilen): Eine konkrete Szene, ein Moment, eine Beobachtung. Kein „Als ich angefangen habe…".',
      '2. KONFLIKT/LEARNING (4–6 Sätze): Was ist passiert, was hast du dabei gelernt.',
      '3. WAS DARAUS WURDE (3–5 Bulletpoints): Wie das heute deinen Kund:innen hilft. Mit Outcomes.',
      '4. ANGEBOT (2–3 Sätze): Was du heute anbietest, für wen.',
      '5. CTA (1 Satz): Einladung zum nächsten Schritt.',
    ]

    const prompt = [
      buildBaseContext(),
      '',
      isCompany ? '## AUFGABE: Erstelle die „Über uns"-Sektion einer LinkedIn Company Page' : '## AUFGABE: Erstelle eine LinkedIn Info-Box („Über mich"-Abschnitt)',
      'Ziellänge: ' + lenMap[aLength] + ' Zeichen inkl. Leerzeichen',
      'Ausrichtung: ' + aus.label + ' — ' + aus.desc,
      '',
      isCompany ? 'LINKEDIN-REGELN FÜR PAGE-ABOUT:' : 'LINKEDIN-REGELN FÜR INFO-BOX:',
      isCompany ? '- HARTES LIMIT: 2.000 Zeichen (LinkedIn-Page-About-Limit). Die ersten ~150 Zeichen erscheinen in der Google-/LinkedIn-Vorschau.' : '- Nur die ersten ~300 Zeichen (≈3 Zeilen) sind vor „…mehr anzeigen" sichtbar. Diese 3 Zeilen sind alles.',
      isCompany ? '- Wir-Form (nicht dritte Person, nicht ich).' : '- Erste Person (ich/wir), nicht dritte Person.',
      '- Short paragraphs (1–3 Sätze) für Mobile-Lesbarkeit.',
      '- Kein Markdown-Bold, keine Headlines mit #. Absätze durch Zeilenumbrüche.',
      '- Weißraum zwischen Abschnitten.',
      '',
      ...structurePrompt,
      '',
      aExtra ? 'ZUSATZKONTEXT: ' + aExtra : '',
      '',
      'AUSGABE: Nur den fertigen Text, sofort copy-paste-fertig. Kein Kommentar, keine Erklärung, kein „Hier ist dein Text:".'
    ].filter(Boolean).join('\n')

    try {
      const text = await callGenerate(prompt, 'linkedin_about')
      if (text) {
        setAResult(text.trim())
        await saveHistory(isCompany ? 'Über uns (Page)' : 'Info-Box', {
          ausrichtung: aAusrichtung, length: aLength, structure: aStructure, extra: aExtra,
          audiences: selectedAudiences, knowledge: selectedKnowledge
        }, text.trim())
      } else { setAError('Keine Antwort vom KI-Service erhalten.') }
    } catch (e) { setAError('Fehler: ' + e.message) }
    setALoading(false)
  }

  // ─── Generate: Position ──────────────────────
  async function genPosition() {
    setPLoading(true); setPError('')
    const aus = AUSRICHTUNGEN.find(v => v.id === pAusrichtung)
    const len = POSITION_LENGTHS.find(v => v.id === pLength)
    const focus = POSITION_FOCUS.find(v => v.id === pFocus)
    const lenMap = { compact:'800–1200', detailed:'1500–2000' }

    const focusPrompt = pFocus === 'impact' ? [
      'FOKUS: Impact & Outcomes',
      '- Jeder Bulletpoint ein messbares Ergebnis oder eine konkrete Wirkung.',
      '- Keine Verantwortlichkeiten („Zuständig für…"). Stattdessen: was kam dabei raus.',
      '- Zahlen, Prozente, Zeiträume wo glaubwürdig — sonst [Platzhalter].',
    ] : [
      'FOKUS: Verantwortlichkeiten & Erfolge',
      '- Erst Verantwortlichkeitsbereiche kurz anreißen, dann konkrete Erfolge.',
      '- Bullets mit Verben starten („Aufgebaut…", „Skaliert…", „Etabliert…").',
      '- Zahlen wo möglich — sonst [Platzhalter/Messbares Ergebnis].',
    ]

    if (isCompany) {
      const sPrompt = [
        buildBaseContext(),
        '',
        '## AUFGABE: Erstelle die Spezialgebiete (Specialties) einer LinkedIn Company Page',
        '',
        'LINKEDIN-REGELN FÜR SPECIALTIES:',
        '- HARTES LIMIT: max. 256 Zeichen gesamt (inkl. Kommas).',
        '- Kommagetrennte Liste aus 8–15 prägnanten Begriffen (Keywords, keine Sätze).',
        '- Begriffe nach denen die Zielgruppe sucht — Leistungen, Methoden, Branchenbegriffe.',
        '- Keine Duplikate, keine Füllwörter, kein Punkt am Ende.',
        pExtra ? 'ZUSATZKONTEXT: ' + pExtra : '',
        '',
        'AUSGABE: Nur die kommagetrennte Liste, sofort copy-paste-fertig. Kein Kommentar.',
      ].filter(Boolean).join('\n')
      try {
        const text = await callGenerate(sPrompt, 'linkedin_position')
        if (text) {
          setPResult(text.trim())
          await saveHistory('Spezialgebiete (Page)', { extra: pExtra, audiences: selectedAudiences, knowledge: selectedKnowledge }, text.trim())
        } else { setPError('Keine Antwort vom KI-Service erhalten.') }
      } catch (e) { setPError('Fehler: ' + e.message) }
      setPLoading(false)
      return
    }

    const prompt = [
      buildBaseContext(),
      '',
      '## AUFGABE: Erstelle eine LinkedIn-Positionsbeschreibung',
      'Position: ' + (pTitle || profile?.headline || '(nicht angegeben)'),
      'Unternehmen: ' + (pCompany || profile?.company || '(nicht angegeben)'),
      'Ziellänge: ' + lenMap[pLength] + ' Zeichen',
      'Ausrichtung: ' + aus.label + ' — ' + aus.desc,
      '',
      'LINKEDIN-REGELN FÜR POSITIONSBESCHREIBUNGEN:',
      '- Max. 2.000 Zeichen pro Position.',
      '- Struktur: 1 Satz Kontext → 4–6 Bulletpoints → Fokus-Keywords am Ende.',
      '- Bullets mit „•" beginnen.',
      '- Kein Markdown.',
      '',
      ...focusPrompt,
      '',
      'FORMAT (strikt einhalten):',
      '<1 Satz Kontext zur Position>',
      '',
      '• <Outcome 1>',
      '• <Outcome 2>',
      '• <Outcome 3>',
      '• <Outcome 4>',
      '• <Outcome 5 (optional)>',
      '• <Outcome 6 (optional)>',
      '',
      'Fokus: <5–8 Keywords kommagetrennt>',
      '',
      pExtra ? 'ZUSATZKONTEXT: ' + pExtra : '',
      '',
      'AUSGABE: Nur der fertige Text, sofort copy-paste-fertig. Kein Kommentar davor/danach.'
    ].filter(Boolean).join('\n')

    try {
      const text = await callGenerate(prompt, 'linkedin_position')
      if (text) {
        setPResult(text.trim())
        await saveHistory('Positionsbeschreibung', {
          title: pTitle, company: pCompany, ausrichtung: pAusrichtung,
          length: pLength, focus: pFocus, extra: pExtra,
          audiences: selectedAudiences, knowledge: selectedKnowledge
        }, text.trim())
      } else { setPError('Keine Antwort vom KI-Service erhalten.') }
    } catch (e) { setPError('Fehler: ' + e.message) }
    setPLoading(false)
  }

  // ─── Generate: All three ─────────────────────
  async function genAll() {
    setAllLoading(true); setAllError('')
    const aus = AUSRICHTUNGEN.find(v => v.id === allAusrichtung)

    const prompt = [
      buildBaseContext(),
      '',
      '## AUFGABE: Erstelle alle drei LinkedIn-Profiltexte konsistent aus einem Guss.',
      'Ausrichtung (für alle 3): ' + aus.label + ' — ' + aus.desc,
      'Position: ' + (pTitle || profile?.headline || '(nicht angegeben)'),
      'Unternehmen: ' + (pCompany || profile?.company || '(nicht angegeben)'),
      allExtra ? 'Zusatzkontext: ' + allExtra : '',
      '',
      'LINKEDIN-REGELN:',
      ...(isCompany ? [
      '- Es geht um eine COMPANY PAGE (nicht ein persönliches Profil). Wir-Form.',
      '- PROFILSLOGAN = Page-Tagline: max. 120 Zeichen, Value Proposition unter dem Logo.',
      '- INFO-BOX = „Über uns"-Sektion: max. 2.000 Zeichen, erste ~150 Zeichen tragen den Kern.',
      '- POSITION = Spezialgebiete: kommagetrennte Keyword-Liste, max. 256 Zeichen gesamt.',
      ] : [
      '- Headline max. 220 Zeichen, erste ~60 tragen den Kern.',
      '- Info-Box 1400–1800 Zeichen, Hook in den ersten 3 Zeilen (~300 Zeichen).',
      '- Positionsbeschreibung 800–1200 Zeichen, Outcomes als Bullets.',
      '- Erste Person in Info-Box.',
      ]),
      '- Konsistente Terminologie und Tonalität über alle 3 Texte.',
      '- Kein Markdown, keine **Fett**-Formatierung, keine #-Überschriften.',
      '',
      'AUSGABEFORMAT (strikt einhalten, Trennzeilen exakt so):',
      '=== PROFILSLOGAN ===',
      '<Headline-Text>',
      '',
      '=== INFO-BOX ===',
      '<Info-Box-Text mit Hook → Problem → Lösung → CTA Struktur>',
      '',
      '=== POSITION ===',
      '<1 Satz Kontext>',
      '',
      '• <Outcome 1>',
      '• <Outcome 2>',
      '• <Outcome 3>',
      '• <Outcome 4>',
      '',
      'Fokus: <Keywords>',
      '',
      'WICHTIG: Nur das Ausgabeformat, nichts drumherum. Keine Erklärungen, keine Einleitung.',
    ].filter(Boolean).join('\n')

    try {
      const raw = await callGenerate(prompt, 'linkedin_all')
      if (!raw) { setAllError('Keine Antwort vom KI-Service erhalten.'); setAllLoading(false); return }
      // Parse sections
      const h = (raw.match(/=== PROFILSLOGAN ===\s*([\s\S]*?)(?====)/) || [])[1]?.trim() || ''
      const i = (raw.match(/=== INFO-BOX ===\s*([\s\S]*?)(?====)/) || [])[1]?.trim() || ''
      const p = (raw.match(/=== POSITION ===\s*([\s\S]*?)$/) || [])[1]?.trim() || ''
      setAllResult({headline: h, about: i, position: p})
      // Sync to individual tabs so user can iterate from there
      if (h) setHResult(h)
      if (i) setAResult(i)
      if (p) setPResult(p)
      await saveHistory('Profiltexte (alle)', {
        ausrichtung: allAusrichtung, extra: allExtra,
        title: pTitle, company: pCompany,
        audiences: selectedAudiences, knowledge: selectedKnowledge
      }, raw)
    } catch (e) { setAllError('Fehler: ' + e.message) }
    setAllLoading(false)
  }

  async function copy(text, setCopied) {
    try { await navigator.clipboard.writeText(text) }
    catch (e) {
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  // ─── Render: Loading ─────────────────────────
  if (loading) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300,color:'var(--text-muted)',fontSize:14}}>
        Lade Profildaten, Brand Voices, Zielgruppen & Wissensdatenbank…
      </div>
    )
  }

  // ─── Render: Empty states ────────────────────
  const needsBrandVoice = brandVoices.length === 0
  const emptyHints = []
  if (needsBrandVoice) emptyHints.push({ href:'/brand-voice', label:'Brand Voice anlegen', desc:'Empfohlen — steuert Tonalität aller Texte' })
  if (audiences.length === 0) emptyHints.push({ href:'/zielgruppen', label:'Zielgruppe anlegen', desc:'Empfohlen — schärft Ansprache' })
  if (knowledgeItems.length === 0) emptyHints.push({ href:'/wissensdatenbank', label:'Wissensdatenbank befüllen', desc:'Optional — liefert Fakten & Referenzen' })

  const bvForGen = getBrandVoice()

  // Grundlage-Summary
  const baseSummaryParts = []
  if (bvForGen) baseSummaryParts.push('Brand Voice: ' + (bvForGen.name || bvForGen.brand_name || 'aktiv'))
  else baseSummaryParts.push('Keine Brand Voice')
  baseSummaryParts.push(selectedAudiences.length + ' ' + (selectedAudiences.length === 1 ? 'Zielgruppe' : 'Zielgruppen'))
  baseSummaryParts.push(selectedKnowledge.length + ' ' + (selectedKnowledge.length === 1 ? 'Ressource' : 'Ressourcen'))
  const baseSummary = baseSummaryParts.join(' · ')

  // ─── Tabs ────────────────────────────────────
  const TABS = [
    ...(isCompany ? [
    { v:'headline', label:'Tagline',        icon:<IdCard size={14} strokeWidth={1.75}/>, color:'blue',   sub:'Page-Tagline · 120 Zeichen' },
    { v:'about',    label:'Über uns',       icon:<FileText size={14} strokeWidth={1.75}/>, color:'pink',   sub:'Page-About · 2.000 Z.' },
    { v:'position', label:'Spezialgebiete', icon:<Briefcase size={14} strokeWidth={1.75}/>, color:'purple', sub:'Specialties · 256 Z.' },
    ] : [
    { v:'headline', label:'Profilslogan',          icon:<IdCard size={14} strokeWidth={1.75}/>, color:'blue',   sub:'Headline · 220 Zeichen' },
    { v:'about',    label:'Info-Box',              icon:<FileText size={14} strokeWidth={1.75}/>, color:'pink',   sub:'Über mich · 2.600 Z.' },
    { v:'position', label:'Positionsbeschreibung', icon:<Briefcase size={14} strokeWidth={1.75}/>, color:'purple', sub:'Aktuelle Rolle' },
    ]),
    { v:'all',      label:'Alle drei',             icon:<Sparkles size={14} strokeWidth={1.75}/>, color:'brand',  sub:'Aus einem Guss' },
  ]

  return (
    <PageShell>
    <div style={{display:'flex',flexDirection:'column',gap:18}}>

      {/* Flash */}
      {flash && (
        <div style={{position:'fixed',top:20,right:20,background:P,color:'#fff',padding:'10px 16px',borderRadius:8,fontSize:13,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',zIndex:1000}}>
          {flash}
        </div>
      )}

      {/* Journal-Style-Header + prominenter ModelSelector als Chip */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:20,flexWrap:'wrap',marginBottom:8}}>
        <div style={{flex:'1 1 auto',minWidth:280}}>
          <div style={{fontSize:20,color:'#30A0D0',fontFamily:'"Caveat", cursive',fontWeight:600,marginBottom:6}}>Branding · LinkedIn-Profil</div>
          <h1 style={{fontSize:26,fontWeight:700,color:'var(--text-primary, rgb(20,20,43))',margin:0,letterSpacing:'-0.3px',lineHeight:1.2}}>Deine Profiltexte.</h1>
          <p style={{fontSize:13,color:'var(--text-muted)',margin:'8px 0 0',lineHeight:1.6,maxWidth:560}}>
            {isCompany ? 'Tagline, Über-uns-Sektion und Spezialgebiete deiner Company Page — auf Basis des Company Brands, Zielgruppen und Wissensdatenbank.' : 'Profilslogan, Info-Box und Positionsbeschreibung — auf Basis deiner Brand Voice, Zielgruppen und Wissensdatenbank.'}
          </p>
        </div>
      </div>

      {/* Grundlage — kollabierbar mit Summary */}
      <Collapsible title="Grundlage" summary={baseSummary} defaultOpen={false}>
        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:14}}>Wird als Kontext in jeden generierten Text injiziert.</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:18}}>

          {/* Brand Voice — info-only, gesteuert vom globalen Switcher oben rechts */}
          <div>
            <Label>Brand Voice</Label>
            {activeBrandVoice ? (
              <div style={{padding:'10px 12px',background:'rgba(49,90,231,0.05)',border:'1px solid rgba(49,90,231,0.18)',borderRadius:8,fontSize:12,color:'var(--text-primary)',lineHeight:1.4}}>
                <div style={{fontWeight:700}}>{activeBrandVoice.name || activeBrandVoice.brand_name || 'Aktiv'}</div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Über den Switcher oben rechts wechseln</div>
              </div>
            ) : (
              <div style={{padding:'14px 12px',background:'var(--surface-muted)',border:'1px dashed var(--border)',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8,lineHeight:1.5}}>Noch keine Brand Voice — steuert Tonalität aller Texte.</div>
                <a href="/brand-voice" style={{display:'inline-block',padding:'6px 12px',background:P,color:'#fff',borderRadius:6,fontSize:12,fontWeight:600,textDecoration:'none'}}>→ Brand Voice anlegen</a>
              </div>
            )}
          </div>

          {/* Audiences */}
          <div>
            <Label>Zielgruppe(n) — Multi</Label>
            {audiences.length === 0 ? (
              <div style={{padding:'14px 12px',background:'var(--surface-muted)',border:'1px dashed var(--border)',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8,lineHeight:1.5}}>Noch keine Zielgruppen — schärft die Ansprache.</div>
                <a href="/zielgruppen" style={{display:'inline-block',padding:'6px 12px',background:P,color:'#fff',borderRadius:6,fontSize:12,fontWeight:600,textDecoration:'none'}}>→ Zielgruppe anlegen</a>
              </div>
            ) : (<>
              <div style={{maxHeight:140,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8,padding:6}}>
                {audiences.map(a => {
                  const on = selectedAudiences.includes(a.id)
                  return (
                    <label key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 6px',cursor:'pointer',fontSize:12,borderRadius:6,background:on?'rgba(49,90,231,0.06)':'transparent'}}>
                      <input type="checkbox" checked={on} onChange={() => {
                        setSelectedAudiences(on ? selectedAudiences.filter(x=>x!==a.id) : [...selectedAudiences, a.id])
                      }} style={{accentColor:P,cursor:'pointer'}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,color:on?P:'rgb(20,20,43)',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',display:'flex',alignItems:'center',gap:6}}>
                          {a.kind === 'strike2' && <span style={{width:7,height:7,borderRadius:'50%',background:'#F97316',flexShrink:0}} title="Strike2 Zielgruppe"/>}
                          <span style={{overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{a.name || 'Unbenannt'}{a.kind!=='strike2' && a.is_active?' ·':''}</span>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{selectedAudiences.length} gewählt</div>
            </>)}
          </div>

          {/* Knowledge */}
          <div>
            <Label>Wissensressourcen — optional</Label>
            {knowledgeItems.length === 0 ? (
              <div style={{padding:'14px 12px',background:'var(--surface-muted)',border:'1px dashed var(--border)',borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8,lineHeight:1.5}}>Noch nichts — liefert Fakten &amp; Referenzen.</div>
                <a href="/wissensdatenbank" style={{display:'inline-block',padding:'6px 12px',background:P,color:'#fff',borderRadius:6,fontSize:12,fontWeight:600,textDecoration:'none'}}>→ Wissen hinzufügen</a>
              </div>
            ) : (<>
              <div style={{maxHeight:140,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8,padding:6}}>
                {knowledgeItems.map(k => {
                  const on = selectedKnowledge.includes(k.id)
                  return (
                    <label key={k.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 6px',cursor:'pointer',fontSize:12,borderRadius:6,background:on?'rgba(49,90,231,0.06)':'transparent'}}>
                      <input type="checkbox" checked={on} onChange={() => {
                        setSelectedKnowledge(on ? selectedKnowledge.filter(x=>x!==k.id) : [...selectedKnowledge, k.id])
                      }} style={{accentColor:P,cursor:'pointer'}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,color:on?P:'rgb(20,20,43)',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
                          {k.name || 'Unbenannt'}
                        </div>
                        <div style={{fontSize:10,color:'var(--text-muted)'}}>{k.category || 'sonstiges'}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{selectedKnowledge.length} gewählt</div>
            </>)}
          </div>

        </div>
      </Collapsible>

      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab}/>

      {/* ─── Tab: Headline ──────────────────────── */}
      {activeTab === 'headline' && (
        <Card>
          <CardBody>
            <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:16}}>
              <div>
                <Label>Ausrichtung</Label>
                <PillRow options={AUSRICHTUNGEN} value={hAusrichtung} onChange={setHAusrichtung}/>
              </div>
              <div>
                <Label>Länge</Label>
                <PillRow options={isCompany ? HEADLINE_LENGTHS_COMPANY : HEADLINE_LENGTHS} value={hLength} onChange={setHLength}/>
              </div>
            </div>

            <Collapsible title="Erweiterte Optionen" summary={(hKeywords||hExtra)?'gefüllt':'optional'} defaultOpen={false}>
              <Label>Keyword-Wünsche</Label>
              <input
                value={hKeywords}
                onChange={e=>setHKeywords(e.target.value)}
                placeholder="z.B. Personal Branding, LinkedIn, B2B-SaaS"
                style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',marginBottom:14}}
              />
              <Label>Zusatzkontext</Label>
              <textarea
                value={hExtra}
                onChange={e=>setHExtra(e.target.value)}
                placeholder="z.B. neue Position, bestimmter Schwerpunkt, Metrik die rein soll, Event/Buchprojekt…"
                rows={2}
                style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical'}}
              />
            </Collapsible>

            
            {hLoading && <GenerationLoading title="Profilslogan wird formuliert" expectedSeconds={15} />}

            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:4}}>              <button onClick={genHeadline} disabled={hLoading} style={{
                padding:'10px 22px',background:hLoading?'#94A3B8':P,color:'#fff',border:'none',borderRadius:8,
                fontSize:13,fontWeight:600,cursor:hLoading?'wait':'pointer'
              }}>
                {hLoading ? 'Generiere…' : (isCompany ? 'Tagline generieren' : 'Profilslogan generieren')}
              </button>
            </div>

            {hError && <div style={{marginTop:12,padding:10,background:'#FEE2E2',color:'#991B1B',borderRadius:8,fontSize:12}}>{hError}</div>}

            {hResult && (
              <div style={{marginTop:20,padding:16,background:'var(--surface-muted)',borderRadius:10,border:'1px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>Ergebnis</div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontSize:11,color:hResult.length>(isCompany?120:220)?'#DC2626':hResult.length>(isCompany?100:180)?'#D97706':'#64748B'}}>
                      {hResult.length} / {isCompany?120:220} Zeichen
                    </span>
<button onClick={()=>copy(hResult, setHCopied)} style={{padding:'6px 12px',background:hCopied?'#059669':'#fff',color:hCopied?'#fff':'var(--text-primary)',border:'1.5px solid var(--border)',borderRadius:7,fontSize:11.5,fontWeight:600,cursor:'pointer'}}>
                      {hCopied ? 'Kopiert ✓' : 'Kopieren'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={hResult}
                  onChange={e => setHResult(e.target.value)}
                  readOnly={hLoading}
                  rows={3}
                  style={{width:'100%',padding:'10px 12px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:14,color:'rgb(20,20,43)',lineHeight:1.5,background:'var(--surface)',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                />
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:6,marginBottom:12}}>Du kannst den Text direkt im Feld bearbeiten.</div>
                {!hRefineOpen && <AccentActionButton icon="✎" label="Text mit KI verbessern" sublabel="Brand Voice, Zielgruppen und Wissen bleiben aktiv" onClick={()=>setHRefineOpen(true)}/>}
              </div>
            )}

            {hResult && hRefineOpen && (
              <div style={{marginTop:12,padding:14,background:'var(--surface-muted)',borderRadius:10,border:'1px dashed #CBD5E1'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <Label style={{marginBottom:0}}>KI-Nachbesserung</Label>
                  <button onClick={()=>{setHRefineOpen(false);setHRefine('')}} style={{background:'none',border:'none',color:'#94A3B8',cursor:'pointer',fontSize:11}}>Schließen ✕</button>
                </div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>Brand Voice, Zielgruppen und Wissensressourcen bleiben aktiv.</div>
                <textarea
                  value={hRefine}
                  onChange={e=>setHRefine(e.target.value)}
                  placeholder={'z.B. „Mach ihn kürzer und weg mit der Metrik" oder „Füge einen klaren CTA am Ende hinzu"'}
                  rows={2}
                  style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}
                />
                <button onClick={() => refine({type:'linkedin_headline',currentText:hResult,instruction:hRefine,setResult:setHResult,setLoading:setHLoading,setError:setHError,historyLabel:'Profilslogan',inputFields:{ausrichtung:hAusrichtung,length:hLength,keywords:hKeywords,audiences:selectedAudiences,knowledge:selectedKnowledge,refineInstruction:hRefine},refineSetter:setHRefine})} disabled={hLoading || !hRefine.trim()} style={{
                  marginTop:8,padding:'8px 16px',background:hLoading?'#94A3B8':(!hRefine.trim()?'#CBD5E1':P),color:'#fff',border:'none',borderRadius:8,
                  fontSize:12,fontWeight:600,cursor:hLoading?'wait':(!hRefine.trim()?'not-allowed':'pointer')
                }}>
                  {hLoading ? 'Überarbeite…' : 'Text mit KI nachbessern'}
                </button>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ─── Tab: About ─────────────────────────── */}
      {activeTab === 'about' && (
        <Card>
          <CardBody>
            <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:16}}>
              <div>
                <Label>Ausrichtung</Label>
                <PillRow options={AUSRICHTUNGEN} value={aAusrichtung} onChange={setAAusrichtung}/>
              </div>
              <div>
                <Label>Länge</Label>
                <PillRow options={ABOUT_LENGTHS} value={aLength} onChange={setALength}/>
              </div>
            </div>

            <Collapsible title="Erweiterte Optionen" summary={aExtra?'gefüllt':'optional'} defaultOpen={false}>
              <Label>Zusatzkontext</Label>
              <textarea
                value={aExtra}
                onChange={e=>setAExtra(e.target.value)}
                placeholder="z.B. Proof-Points die rein sollen, aktuelles Projekt, konkreter CTA-Wunsch, Ton-Anmerkungen…"
                rows={3}
                style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical'}}
              />
            </Collapsible>

            
            {aLoading && <GenerationLoading title="Info-Box wird gestaltet" expectedSeconds={25} />}

            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:4}}>              <button onClick={genAbout} disabled={aLoading} style={{
                padding:'10px 22px',background:aLoading?'#94A3B8':P,color:'#fff',border:'none',borderRadius:8,
                fontSize:13,fontWeight:600,cursor:aLoading?'wait':'pointer'
              }}>
                {aLoading ? 'Generiere…' : 'Info-Box generieren'}
              </button>
            </div>

            {aError && <div style={{marginTop:12,padding:10,background:'#FEE2E2',color:'#991B1B',borderRadius:8,fontSize:12}}>{aError}</div>}

            {aResult && (
              <div style={{marginTop:20,padding:16,background:'var(--surface-muted)',borderRadius:10,border:'1px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>Ergebnis</div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontSize:11,color:aResult.length>(isCompany?2000:2600)?'#DC2626':aResult.length>(isCompany?1800:2400)?'#D97706':'#64748B'}}>
                      {aResult.length} / {isCompany?'2.000':'2.600'} Zeichen
                    </span>
<button onClick={()=>copy(aResult, setACopied)} style={{padding:'6px 12px',background:aCopied?'#059669':'#fff',color:aCopied?'#fff':'var(--text-primary)',border:'1.5px solid var(--border)',borderRadius:7,fontSize:11.5,fontWeight:600,cursor:'pointer'}}>
                      {aCopied ? 'Kopiert ✓' : 'Kopieren'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={aResult}
                  onChange={e => setAResult(e.target.value)}
                  readOnly={aLoading}
                  rows={14}
                  style={{width:'100%',padding:'12px 14px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:13,color:'rgb(20,20,43)',lineHeight:1.55,background:'var(--surface)',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                />
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:6,marginBottom:12}}>Du kannst den Text direkt im Feld bearbeiten.</div>
                {!aRefineOpen && <AccentActionButton icon="✎" label="Text mit KI verbessern" sublabel="Brand Voice, Zielgruppen und Wissen bleiben aktiv" onClick={()=>setARefineOpen(true)}/>}
              </div>
            )}

            {aResult && aRefineOpen && (
              <div style={{marginTop:12,padding:14,background:'var(--surface-muted)',borderRadius:10,border:'1px dashed #CBD5E1'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <Label style={{marginBottom:0}}>KI-Nachbesserung</Label>
                  <button onClick={()=>{setARefineOpen(false);setARefine('')}} style={{background:'none',border:'none',color:'#94A3B8',cursor:'pointer',fontSize:11}}>Schließen ✕</button>
                </div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>Beschreibe, was die KI an der Info-Box verändern soll.</div>
                <textarea
                  value={aRefine}
                  onChange={e=>setARefine(e.target.value)}
                  placeholder={'z.B. „Hook schärfer machen, konkretere Zahl rein" oder „CTA am Ende klarer formulieren"'}
                  rows={2}
                  style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}
                />
                <button onClick={() => refine({type:'linkedin_about',currentText:aResult,instruction:aRefine,setResult:setAResult,setLoading:setALoading,setError:setAError,historyLabel:'Info-Box',inputFields:{ausrichtung:aAusrichtung,length:aLength,structure:aStructure,audiences:selectedAudiences,knowledge:selectedKnowledge,refineInstruction:aRefine},refineSetter:setARefine})} disabled={aLoading || !aRefine.trim()} style={{
                  marginTop:8,padding:'8px 16px',background:aLoading?'#94A3B8':(!aRefine.trim()?'#CBD5E1':P),color:'#fff',border:'none',borderRadius:8,
                  fontSize:12,fontWeight:600,cursor:aLoading?'wait':(!aRefine.trim()?'not-allowed':'pointer')
                }}>
                  {aLoading ? 'Überarbeite…' : 'Text mit KI nachbessern'}
                </button>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ─── Tab: Position ──────────────────────── */}
      {activeTab === 'position' && (
        <Card>
          <CardBody>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <Label>Position / Titel</Label>
                <input
                  value={pTitle}
                  onChange={e=>setPTitle(e.target.value)}
                  placeholder="z.B. Senior Product Manager"
                  style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box'}}
                />
              </div>
              <div>
                <Label>Unternehmen</Label>
                <input
                  value={pCompany}
                  onChange={e=>setPCompany(e.target.value)}
                  placeholder="z.B. entrenous GmbH"
                  style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box'}}
                />
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:16}}>
              <div>
                <Label>Ausrichtung</Label>
                <PillRow options={AUSRICHTUNGEN} value={pAusrichtung} onChange={setPAusrichtung}/>
              </div>
              <div>
                <Label>Länge</Label>
                <PillRow options={POSITION_LENGTHS} value={pLength} onChange={setPLength}/>
              </div>
              <div>
                <Label>Fokus</Label>
                <PillRow options={POSITION_FOCUS} value={pFocus} onChange={setPFocus}/>
              </div>
            </div>

            <Collapsible title="Erweiterte Optionen" summary={pExtra?'gefüllt':'optional'} defaultOpen={false}>
              <Label>Zusatzkontext</Label>
              <textarea
                value={pExtra}
                onChange={e=>setPExtra(e.target.value)}
                placeholder="z.B. konkrete Erfolge mit Zahlen, KPI-Verantwortung, verantwortete Teams/Budgets, laufende Projekte…"
                rows={3}
                style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical'}}
              />
            </Collapsible>

            
            {pLoading && <GenerationLoading title="Positionsbeschreibung wird verfasst" expectedSeconds={20} />}

            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:4}}>              <button onClick={genPosition} disabled={pLoading} style={{
                padding:'10px 22px',background:pLoading?'#94A3B8':P,color:'#fff',border:'none',borderRadius:8,
                fontSize:13,fontWeight:600,cursor:pLoading?'wait':'pointer'
              }}>
                {pLoading ? 'Generiere…' : 'Positionsbeschreibung generieren'}
              </button>
            </div>

            {pError && <div style={{marginTop:12,padding:10,background:'#FEE2E2',color:'#991B1B',borderRadius:8,fontSize:12}}>{pError}</div>}

            {pResult && (
              <div style={{marginTop:20,padding:16,background:'var(--surface-muted)',borderRadius:10,border:'1px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>Ergebnis</div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontSize:11,color:pResult.length>(isCompany?256:2000)?'#DC2626':pResult.length>(isCompany?220:1800)?'#D97706':'#64748B'}}>
                      {pResult.length} / {isCompany?'256':'2.000'} Zeichen
                    </span>
<button onClick={()=>copy(pResult, setPCopied)} style={{padding:'6px 12px',background:pCopied?'#059669':'#fff',color:pCopied?'#fff':'var(--text-primary)',border:'1.5px solid var(--border)',borderRadius:7,fontSize:11.5,fontWeight:600,cursor:'pointer'}}>
                      {pCopied ? 'Kopiert ✓' : 'Kopieren'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={pResult}
                  onChange={e => setPResult(e.target.value)}
                  readOnly={pLoading}
                  rows={12}
                  style={{width:'100%',padding:'12px 14px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:13,color:'rgb(20,20,43)',lineHeight:1.55,background:'var(--surface)',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                />
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:6,marginBottom:12}}>Du kannst den Text direkt im Feld bearbeiten.</div>
                {!pRefineOpen && <AccentActionButton icon="✎" label="Text mit KI verbessern" sublabel="Brand Voice, Zielgruppen und Wissen bleiben aktiv" onClick={()=>setPRefineOpen(true)}/>}
              </div>
            )}

            {pResult && pRefineOpen && (
              <div style={{marginTop:12,padding:14,background:'var(--surface-muted)',borderRadius:10,border:'1px dashed #CBD5E1'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <Label style={{marginBottom:0}}>KI-Nachbesserung</Label>
                  <button onClick={()=>{setPRefineOpen(false);setPRefine('')}} style={{background:'none',border:'none',color:'#94A3B8',cursor:'pointer',fontSize:11}}>Schließen ✕</button>
                </div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>Beschreibe, was die KI an der Positionsbeschreibung verändern soll.</div>
                <textarea
                  value={pRefine}
                  onChange={e=>setPRefine(e.target.value)}
                  placeholder={'z.B. „Outcomes mit Zahlen konkretisieren" oder „Kontext-Satz um die Branche erweitern"'}
                  rows={2}
                  style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}
                />
                <button onClick={() => refine({type:'linkedin_position',currentText:pResult,instruction:pRefine,setResult:setPResult,setLoading:setPLoading,setError:setPError,historyLabel:'Positionsbeschreibung',inputFields:{title:pTitle,company:pCompany,ausrichtung:pAusrichtung,length:pLength,focus:pFocus,audiences:selectedAudiences,knowledge:selectedKnowledge,refineInstruction:pRefine},refineSetter:setPRefine})} disabled={pLoading || !pRefine.trim()} style={{
                  marginTop:8,padding:'8px 16px',background:pLoading?'#94A3B8':(!pRefine.trim()?'#CBD5E1':P),color:'#fff',border:'none',borderRadius:8,
                  fontSize:12,fontWeight:600,cursor:pLoading?'wait':(!pRefine.trim()?'not-allowed':'pointer')
                }}>
                  {pLoading ? 'Überarbeite…' : 'Text mit KI nachbessern'}
                </button>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ─── Tab: All three ─────────────────────── */}
      {activeTab === 'all' && (
        <Card>
          <CardBody>
            <div style={{padding:'10px 12px',background:'#EFF6FF',borderRadius:8,marginBottom:14,fontSize:12,color:'#1E40AF',lineHeight:1.5}}>
              Erstellt alle drei Texte in einem Durchgang — gleiche Tonalität, gleiche Keywords, konsistente Terminologie. Die Ergebnisse werden auch in die Einzel-Tabs übernommen, damit du dort weiter feinschleifen kannst.
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:14}}>
              <div>
                <Label>Ausrichtung (für alle drei)</Label>
                <PillRow options={AUSRICHTUNGEN} value={allAusrichtung} onChange={setAllAusrichtung}/>
              </div>
            </div>

            <Collapsible title="Erweiterte Optionen" summary={allExtra?'gefüllt':'optional'} defaultOpen={false}>
              <Label>Zusatzkontext (gilt für alle drei)</Label>
              <textarea
                value={allExtra}
                onChange={e=>setAllExtra(e.target.value)}
                placeholder="Konkrete Proof-Points, Kern-Message, Ton-Anmerkungen…"
                rows={3}
                style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical'}}
              />
            </Collapsible>

            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:4}}>              <button onClick={genAll} disabled={allLoading} style={{
                padding:'10px 22px',background:allLoading?'#94A3B8':P,color:'#fff',border:'none',borderRadius:8,
                fontSize:13,fontWeight:600,cursor:allLoading?'wait':'pointer'
              }}>
                {allLoading ? 'Generiere alle drei…' : 'Alle drei generieren'}
              </button>
            </div>

            {allError && <div style={{marginTop:12,padding:10,background:'#FEE2E2',color:'#991B1B',borderRadius:8,fontSize:12}}>{allError}</div>}

            {(allResult.headline || allResult.about || allResult.position) && (
              <div style={{marginTop:20,display:'flex',flexDirection:'column',gap:14}}>
                {allResult.headline && (
                  <div style={{padding:16,background:'var(--surface-muted)',borderRadius:10,border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>Profilslogan · {allResult.headline.length} / 220</div>
                      <button onClick={()=>copy(allResult.headline, ()=>showFlash('Profilslogan kopiert'))} style={{padding:'4px 10px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Kopieren</button>
                    </div>
                    <textarea
                      value={allResult.headline}
                      onChange={e=>setAllResult({...allResult, headline:e.target.value})}
                      readOnly={allLoading}
                      rows={3}
                      style={{width:'100%',padding:'10px 12px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:14,color:'rgb(20,20,43)',lineHeight:1.5,background:'var(--surface)',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                    />
                    <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                      {!allRefineHOpen && (
                        <button onClick={()=>setAllRefineHOpen(true)} style={{padding:'4px 10px',background:'#fff',color:P,border:'1px solid '+P,borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>
                          ✎ Nachbessern
                        </button>
                      )}
                    </div>
                    {allRefineHOpen && (
                      <div style={{marginTop:8,padding:10,background:'var(--surface)',borderRadius:8,border:'1px dashed #CBD5E1'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                          <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)'}}>KI-Nachbesserung</div>
                          <button onClick={()=>{setAllRefineHOpen(false);setAllRefineH('')}} style={{background:'none',border:'none',color:'#94A3B8',cursor:'pointer',fontSize:11}}><X size={14} strokeWidth={1.75}/></button>
                        </div>
                        <textarea
                          value={allRefineH}
                          onChange={e=>setAllRefineH(e.target.value)}
                          placeholder="Was soll an diesem Profilslogan geändert werden?"
                          rows={2}
                          style={{width:'100%',padding:'7px 10px',border:'1.5px solid #dde3ea',borderRadius:7,fontSize:12,boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}
                        />
                        <button onClick={() => refine({type:'linkedin_headline',currentText:allResult.headline,instruction:allRefineH,setResult:(t)=>setAllResult(prev=>({...prev,headline:t})),setLoading:setAllLoading,setError:setAllError,historyLabel:'Profilslogan',inputFields:{audiences:selectedAudiences,knowledge:selectedKnowledge,refineInstruction:allRefineH},refineSetter:setAllRefineH})} disabled={allLoading || !allRefineH.trim()} style={{
                          marginTop:6,padding:'6px 12px',background:allLoading?'#94A3B8':(!allRefineH.trim()?'#CBD5E1':P),color:'#fff',border:'none',borderRadius:7,
                          fontSize:11,fontWeight:600,cursor:allLoading?'wait':(!allRefineH.trim()?'not-allowed':'pointer')
                        }}>
                          {allLoading ? 'Überarbeite…' : 'Mit KI nachbessern'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {allResult.about && (
                  <div style={{padding:16,background:'var(--surface-muted)',borderRadius:10,border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>Info-Box · {allResult.about.length} / 2.600</div>
                      <button onClick={()=>copy(allResult.about, ()=>showFlash('Info-Box kopiert'))} style={{padding:'4px 10px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Kopieren</button>
                    </div>
                    <textarea
                      value={allResult.about}
                      onChange={e=>setAllResult({...allResult, about:e.target.value})}
                      readOnly={allLoading}
                      rows={12}
                      style={{width:'100%',padding:'12px 14px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:13,color:'rgb(20,20,43)',lineHeight:1.55,background:'var(--surface)',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                    />
                    <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                      {!allRefineAOpen && (
                        <button onClick={()=>setAllRefineAOpen(true)} style={{padding:'4px 10px',background:'#fff',color:P,border:'1px solid '+P,borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>
                          ✎ Nachbessern
                        </button>
                      )}
                    </div>
                    {allRefineAOpen && (
                      <div style={{marginTop:8,padding:10,background:'var(--surface)',borderRadius:8,border:'1px dashed #CBD5E1'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                          <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)'}}>KI-Nachbesserung</div>
                          <button onClick={()=>{setAllRefineAOpen(false);setAllRefineA('')}} style={{background:'none',border:'none',color:'#94A3B8',cursor:'pointer',fontSize:11}}><X size={14} strokeWidth={1.75}/></button>
                        </div>
                        <textarea
                          value={allRefineA}
                          onChange={e=>setAllRefineA(e.target.value)}
                          placeholder="Was soll an dieser Info-Box geändert werden?"
                          rows={2}
                          style={{width:'100%',padding:'7px 10px',border:'1.5px solid #dde3ea',borderRadius:7,fontSize:12,boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}
                        />
                        <button onClick={() => refine({type:'linkedin_about',currentText:allResult.about,instruction:allRefineA,setResult:(t)=>setAllResult(prev=>({...prev,about:t})),setLoading:setAllLoading,setError:setAllError,historyLabel:'Info-Box',inputFields:{audiences:selectedAudiences,knowledge:selectedKnowledge,refineInstruction:allRefineA},refineSetter:setAllRefineA})} disabled={allLoading || !allRefineA.trim()} style={{
                          marginTop:6,padding:'6px 12px',background:allLoading?'#94A3B8':(!allRefineA.trim()?'#CBD5E1':P),color:'#fff',border:'none',borderRadius:7,
                          fontSize:11,fontWeight:600,cursor:allLoading?'wait':(!allRefineA.trim()?'not-allowed':'pointer')
                        }}>
                          {allLoading ? 'Überarbeite…' : 'Mit KI nachbessern'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {allResult.position && (
                  <div style={{padding:16,background:'var(--surface-muted)',borderRadius:10,border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>Positionsbeschreibung · {allResult.position.length} / 2.000</div>
                      <button onClick={()=>copy(allResult.position, ()=>showFlash('Position kopiert'))} style={{padding:'4px 10px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Kopieren</button>
                    </div>
                    <textarea
                      value={allResult.position}
                      onChange={e=>setAllResult({...allResult, position:e.target.value})}
                      readOnly={allLoading}
                      rows={10}
                      style={{width:'100%',padding:'12px 14px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:13,color:'rgb(20,20,43)',lineHeight:1.55,background:'var(--surface)',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                    />
                    <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                      {!allRefinePOpen && (
                        <button onClick={()=>setAllRefinePOpen(true)} style={{padding:'4px 10px',background:'#fff',color:P,border:'1px solid '+P,borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>
                          ✎ Nachbessern
                        </button>
                      )}
                    </div>
                    {allRefinePOpen && (
                      <div style={{marginTop:8,padding:10,background:'var(--surface)',borderRadius:8,border:'1px dashed #CBD5E1'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                          <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)'}}>KI-Nachbesserung</div>
                          <button onClick={()=>{setAllRefinePOpen(false);setAllRefineP('')}} style={{background:'none',border:'none',color:'#94A3B8',cursor:'pointer',fontSize:11}}><X size={14} strokeWidth={1.75}/></button>
                        </div>
                        <textarea
                          value={allRefineP}
                          onChange={e=>setAllRefineP(e.target.value)}
                          placeholder="Was soll an dieser Positionsbeschreibung geändert werden?"
                          rows={2}
                          style={{width:'100%',padding:'7px 10px',border:'1.5px solid #dde3ea',borderRadius:7,fontSize:12,boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}
                        />
                        <button onClick={() => refine({type:'linkedin_position',currentText:allResult.position,instruction:allRefineP,setResult:(t)=>setAllResult(prev=>({...prev,position:t})),setLoading:setAllLoading,setError:setAllError,historyLabel:'Positionsbeschreibung',inputFields:{title:pTitle,company:pCompany,audiences:selectedAudiences,knowledge:selectedKnowledge,refineInstruction:allRefineP},refineSetter:setAllRefineP})} disabled={allLoading || !allRefineP.trim()} style={{
                          marginTop:6,padding:'6px 12px',background:allLoading?'#94A3B8':(!allRefineP.trim()?'#CBD5E1':P),color:'#fff',border:'none',borderRadius:7,
                          fontSize:11,fontWeight:600,cursor:allLoading?'wait':(!allRefineP.trim()?'not-allowed':'pointer')
                        }}>
                          {allLoading ? 'Überarbeite…' : 'Mit KI nachbessern'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ─── History ────────────────────────────── */}
      {history.length > 0 && (
        <Collapsible title="Letzte Generierungen" summary={history.length + ' Einträge'} defaultOpen={false}>
          <div style={{maxHeight:320,overflowY:'auto',margin:'-14px -16px'}}>
            {history.map(h => (
              <div key={h.id} style={{padding:'11px 16px',borderBottom:'1px solid #F1F5F9',fontSize:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{padding:'2px 8px',borderRadius:999,background:'rgba(49,90,231,0.1)',color:P,fontSize:10,fontWeight:700}}>{h.template_label}</span>
                    <span style={{color:'var(--text-muted)',fontSize:11}}>{new Date(h.created_at).toLocaleString('de-DE')}</span>
                  </div>
                  <button onClick={()=>{copy(h.generated_text, ()=>showFlash('Kopiert'))}} style={{padding:'3px 9px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,fontSize:10,fontWeight:600,cursor:'pointer'}}>Kopieren</button>
                </div>
                <div style={{color:'#475569',lineHeight:1.5,whiteSpace:'pre-wrap',maxHeight:90,overflow:'hidden',position:'relative'}}>
                  {h.generated_text.slice(0, 350)}{h.generated_text.length > 350 ? '…' : ''}
                </div>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

    </div>
    </PageShell>
  )
}
