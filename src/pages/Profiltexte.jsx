import { useTranslation } from 'react-i18next'
import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

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
  <div style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',overflow:'hidden',boxShadow:'0 1px 3px rgba(15,23,42,0.06)',marginBottom:14,...style}}>
    {children}
  </div>
)
const CardHead = ({children}) => (
  <div style={{padding:'13px 18px',borderBottom:'1px solid #F1F5F9'}}>{children}</div>
)
const CardBody = ({children, style={}}) => (
  <div style={{padding:'16px 18px',...style}}>{children}</div>
)
const Label = ({children}) => (
  <label style={{fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:7,display:'block'}}>{children}</label>
)
const Sub = ({children}) => (
  <div style={{fontSize:11,color:'#94A3B8',marginBottom:10}}>{children}</div>
)

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
      {sub ? <div style={{fontSize:10,color:'#94A3B8',marginTop:2}}>{sub}</div> : null}
    </button>
  )
}

function Pill({children, active, onClick, tone='default'}) {
  const colors = {
    default:{bg: active?'rgba(49,90,231,0.1)':'#F1F5F9', fg: active?P:'#475569', br: active?P:'#E2E8F0'},
    danger: {bg: active?'rgba(220,38,38,0.1)':'#F1F5F9', fg: active?'#DC2626':'#475569', br: active?'#DC2626':'#E2E8F0'}
  }
  const c = colors[tone] || colors.default
  return (
    <button onClick={onClick} style={{
      padding:'5px 11px',borderRadius:999,fontSize:12,fontWeight:600,
      border:'1px solid '+c.br,background:c.bg,color:c.fg,cursor:'pointer',
      whiteSpace:'nowrap'
    }}>{children}</button>
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

  // ─── All-three state ─────────────────────────
  const [allAusrichtung, setAllAusrichtung] = useState('professional')
  const [allExtra, setAllExtra] = useState('')
  const [allResult, setAllResult] = useState({headline:'', about:'', position:''})
  const [allLoading, setAllLoading] = useState(false)
  const [allError, setAllError] = useState('')
  const [allRefineH, setAllRefineH] = useState('')
  const [allRefineA, setAllRefineA] = useState('')
  const [allRefineP, setAllRefineP] = useState('')

  // Flash/toast
  const [flash, setFlash] = useState('')

  // ─── Load data ───────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const uid = session.user.id
    const [profRes, bvRes, audRes, kbRes, histRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('brand_voices').select('*').eq('user_id', uid).order('updated_at',{ascending:false}),
      supabase.from('target_audiences').select('*').eq('user_id', uid).order('updated_at',{ascending:false}),
      supabase.from('knowledge_base').select('*').eq('user_id', uid).order('updated_at',{ascending:false}),
      supabase.from('content_history').select('*').eq('user_id', uid)
        .in('template_label',['Profilslogan','Info-Box','Positionsbeschreibung','Profiltexte (alle)'])
        .order('created_at',{ascending:false}).limit(30),
    ])
    const prof = profRes.data
    setProfile(prof)
    setBrandVoices(bvRes.data || [])
    setAudiences(audRes.data || [])
    setKnowledgeItems(kbRes.data || [])
    setHistory(histRes.data || [])

    // Defaults
    if (prof && prof.headline && !pTitle) setPTitle(prof.headline)
    if (prof && prof.company && !pCompany) setPCompany(prof.company)

    // Auto-select active audiences
    const activeAud = (audRes.data || []).filter(a => a.is_active).map(a => a.id)
    if (activeAud.length > 0 && selectedAudiences.length === 0) setSelectedAudiences(activeAud)

    setLoading(false)
  }, [session.user.id]) // intentional: run only on session change

  useEffect(() => { loadData() }, [loadData])

  // ─── Helpers ─────────────────────────────────
  function getBrandVoice() {
    if (selectedBrandVoice === 'auto') return brandVoices.find(b => b.is_active) || brandVoices[0] || null
    if (selectedBrandVoice === 'none') return null
    return brandVoices.find(b => b.id === selectedBrandVoice) || null
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
      parts.push('')
      parts.push('## ZIELGRUPPE(N)')
      selAud.forEach((a, i) => {
        parts.push('— Zielgruppe ' + (i+1) + ': ' + (a.name || 'Unbenannt'))
        if (a.job_titles)       parts.push('  Positionen: ' + a.job_titles)
        if (a.industries)       parts.push('  Branchen: ' + a.industries)
        if (a.decision_level)   parts.push('  Entscheider-Level: ' + a.decision_level)
        if (a.pain_points)      parts.push('  Pain Points: ' + a.pain_points)
        if (a.needs_goals)      parts.push('  Bedürfnisse/Ziele: ' + a.needs_goals)
        if (a.topics_interests) parts.push('  Themen/Interessen: ' + a.topics_interests)
        if (a.ai_summary)       parts.push('  Kurzprofil: ' + a.ai_summary)
      })
    }

    const selKB = knowledgeItems.filter(k => selectedKnowledge.includes(k.id))
    if (selKB.length > 0) {
      parts.push('')
      parts.push('## WISSENSRESSOURCEN (Inhalt, Referenzen, Fakten)')
      selKB.forEach((k, i) => {
        parts.push('— ' + (k.name || 'Ressource ' + (i+1)) + ' [' + (k.category||'sonstiges') + ']')
        if (k.description) parts.push('  ' + k.description)
        if (k.content) {
          const c = k.content.length > 600 ? k.content.slice(0, 600) + '…' : k.content
          parts.push('  Inhalt: ' + c)
        }
      })
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
    const { data: { session: ss } } = await supabase.auth.getSession()
    const res = await fetch('https://jdhajqpgfrsuoluaesjn.supabase.co/functions/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ss.access_token },
      body: JSON.stringify({ type: type, systemPrompt: SYSTEM_PROMPT, prompt: userPrompt })
    })
    const d = await res.json()
    return d.text || d.content || d.comment || d.about || ''
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
    const { data } = await supabase.from('content_history').select('*').eq('user_id', session.user.id)
      .in('template_label',['Profilslogan','Info-Box','Positionsbeschreibung','Profiltexte (alle)'])
      .order('created_at',{ascending:false}).limit(30)
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
    const targetLen = hLength === 'concise' ? '100–150 Zeichen' : '180–220 Zeichen'
    const visibleHint = hLength === 'concise'
      ? 'Bei 100–150 Zeichen ist der gesamte Text überall sichtbar (auch in Search & Connection Requests).'
      : 'Die ersten ~60 Zeichen sind auf Mobile, die ersten ~120 auf Desktop in Search/Comments sichtbar — dort MUSS der Kern stehen. Rest für SEO.'

    const prompt = [
      buildBaseContext(),
      '',
      '## AUFGABE: Erstelle einen LinkedIn-Profilslogan (Headline)',
      'Ziellänge: ' + targetLen,
      'Ausrichtung: ' + aus.label + ' — ' + aus.desc,
      '',
      'LINKEDIN-REGELN FÜR HEADLINES:',
      '- ' + visibleHint,
      '- Struktur-Empfehlung: [Rolle/Titel] | [Wem du hilfst] | [Wie + Differenzierung]',
      '- Pipe-Separator "|" für Lesbarkeit (alternativ "•")',
      '- Zahlen/Metriken wo glaubwürdig möglich (z.B. „+500 begleitete Kund:innen")',
      '- Keine Standard-Floskeln wie „Passionate about…" oder „Results-driven…"',
      '- 2–4 relevante Keywords natürlich einbauen',
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
        await saveHistory('Profilslogan', {
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
    const lenMap = { short:'800–1000', medium:'1400–1800', long:'2000–2400' }

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
      '## AUFGABE: Erstelle eine LinkedIn Info-Box („Über mich"-Abschnitt)',
      'Ziellänge: ' + lenMap[aLength] + ' Zeichen inkl. Leerzeichen',
      'Ausrichtung: ' + aus.label + ' — ' + aus.desc,
      '',
      'LINKEDIN-REGELN FÜR INFO-BOX:',
      '- Nur die ersten ~300 Zeichen (≈3 Zeilen) sind vor „…mehr anzeigen" sichtbar. Diese 3 Zeilen sind alles.',
      '- Erste Person (ich/wir), nicht dritte Person.',
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
        await saveHistory('Info-Box', {
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
      '- Headline max. 220 Zeichen, erste ~60 tragen den Kern.',
      '- Info-Box 1400–1800 Zeichen, Hook in den ersten 3 Zeilen (~300 Zeichen).',
      '- Positionsbeschreibung 800–1200 Zeichen, Outcomes als Bullets.',
      '- Konsistente Terminologie und Tonalität über alle 3 Texte.',
      '- Kein Markdown, keine **Fett**-Formatierung, keine #-Überschriften.',
      '- Erste Person in Info-Box.',
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
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300,color:'#94A3B8',fontSize:14}}>
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

  // ─── Tabs ────────────────────────────────────
  const TABS = [
    { id:'headline', label:'Profilslogan',          sub:'Headline, 220 Zeichen' },
    { id:'about',    label:'Info-Box',              sub:'Über mich, 2.600 Zeichen' },
    { id:'position', label:'Positionsbeschreibung', sub:'Aktuelle Rolle' },
    { id:'all',      label:'Alle drei',             sub:'Aus einem Guss' },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20,maxWidth:1100}}>

      {/* Flash */}
      {flash && (
        <div style={{position:'fixed',top:20,right:20,background:P,color:'#fff',padding:'10px 16px',borderRadius:8,fontSize:13,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',zIndex:1000}}>
          {flash}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 style={{fontSize:24,fontWeight:700,color:'rgb(20,20,43)',margin:0,marginBottom:4}}>Profiltexte</h1>
        <div style={{fontSize:13,color:'#64748B'}}>
          Erstelle Profilslogan, Info-Box und Positionsbeschreibung für dein LinkedIn-Profil —
          auf Basis deiner Brand Voice, Zielgruppen und Wissensdatenbank.
        </div>
      </div>

      {/* Empty-state hints */}
      {emptyHints.length > 0 && (
        <Card style={{background:'#FFFBEB',border:'1px solid #FCD34D'}}>
          <CardBody>
            <div style={{fontSize:12,fontWeight:700,color:'#92400E',marginBottom:6}}>Für bessere Texte empfohlen:</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {emptyHints.map(h => (
                <a key={h.href} href={h.href} style={{fontSize:12,color:'#92400E',textDecoration:'underline',padding:'4px 0'}}>
                  → {h.label}
                </a>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Base selectors */}
      <Card>
        <CardHead>
          <div style={{fontSize:14,fontWeight:700,color:'rgb(20,20,43)'}}>Grundlage</div>
          <div style={{fontSize:11,color:'#94A3B8',marginTop:2}}>Wird als Kontext in jeden generierten Text injiziert.</div>
        </CardHead>
        <CardBody>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:18}}>

            {/* Brand Voice */}
            <div>
              <Label>Brand Voice</Label>
              <select
                value={selectedBrandVoice}
                onChange={e => setSelectedBrandVoice(e.target.value)}
                style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,background:'#fff'}}
              >
                <option value="auto">Automatisch (aktive Brand Voice)</option>
                {brandVoices.map(b => (
                  <option key={b.id} value={b.id}>{b.brand_name || 'Unbenannt'}{b.is_active?' (aktiv)':''}</option>
                ))}
                <option value="none">Keine Brand Voice nutzen</option>
              </select>
              {bvForGen && (
                <div style={{fontSize:11,color:'#64748B',marginTop:6,lineHeight:1.4}}>
                  {bvForGen.personality && <div>· {bvForGen.personality.slice(0,80)}{bvForGen.personality.length>80?'…':''}</div>}
                  {bvForGen.tone_attributes && bvForGen.tone_attributes.length > 0 && <div>· Ton: {bvForGen.tone_attributes.join(', ')}</div>}
                </div>
              )}
              {!bvForGen && selectedBrandVoice !== 'none' && (
                <div style={{fontSize:11,color:'#DC2626',marginTop:6}}>⚠ Keine Brand Voice gefunden. Erstelle eine unter Brand Voice.</div>
              )}
            </div>

            {/* Audiences */}
            <div>
              <Label>Zielgruppe(n) — Multi</Label>
              {audiences.length === 0 && <div style={{fontSize:11,color:'#94A3B8'}}>Noch keine Zielgruppen angelegt.</div>}
              <div style={{maxHeight:140,overflowY:'auto',border:'1px solid #E5E7EB',borderRadius:8,padding:6}}>
                {audiences.map(a => {
                  const on = selectedAudiences.includes(a.id)
                  return (
                    <label key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 6px',cursor:'pointer',fontSize:12,borderRadius:6,background:on?'rgba(49,90,231,0.06)':'transparent'}}>
                      <input type="checkbox" checked={on} onChange={() => {
                        setSelectedAudiences(on ? selectedAudiences.filter(x=>x!==a.id) : [...selectedAudiences, a.id])
                      }} style={{accentColor:P,cursor:'pointer'}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,color:on?P:'rgb(20,20,43)',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
                          {a.name || 'Unbenannt'}{a.is_active?' ·':''}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div style={{fontSize:11,color:'#94A3B8',marginTop:4}}>{selectedAudiences.length} gewählt</div>
            </div>

            {/* Knowledge */}
            <div>
              <Label>Wissensressourcen — optional</Label>
              {knowledgeItems.length === 0 && <div style={{fontSize:11,color:'#94A3B8'}}>Noch keine Wissensressourcen hinterlegt.</div>}
              <div style={{maxHeight:140,overflowY:'auto',border:'1px solid #E5E7EB',borderRadius:8,padding:6}}>
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
                        <div style={{fontSize:10,color:'#94A3B8'}}>{k.category || 'sonstiges'}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div style={{fontSize:11,color:'#94A3B8',marginTop:4}}>{selectedKnowledge.length} gewählt</div>
            </div>

          </div>
        </CardBody>
      </Card>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,borderBottom:'2px solid #E2E8F0',marginBottom:-14}}>
        {TABS.map(t => {
          const on = activeTab === t.id
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding:'11px 18px',border:'none',background:'transparent',cursor:'pointer',
              borderBottom:'2px solid ' + (on ? P : 'transparent'),
              marginBottom:-2,fontSize:13,fontWeight:on?700:500,
              color:on?P:'#64748B',transition:'all 0.15s',textAlign:'left'
            }}>
              {t.label}
              <div style={{fontSize:10,fontWeight:500,color:on?P:'#94A3B8',marginTop:2}}>{t.sub}</div>
            </button>
          )
        })}
      </div>

      {/* ─── Tab: Headline ──────────────────────── */}
      {activeTab === 'headline' && (
        <Card>
          <CardBody>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginBottom:16}}>
              <div>
                <Label>Ausrichtung</Label>
                {AUSRICHTUNGEN.map(v => (
                  <OptButton key={v.id} active={hAusrichtung===v.id} onClick={()=>setHAusrichtung(v.id)} main={v.label} sub={v.desc}/>
                ))}
              </div>
              <div>
                <Label>Länge</Label>
                {HEADLINE_LENGTHS.map(v => (
                  <OptButton key={v.id} active={hLength===v.id} onClick={()=>setHLength(v.id)} main={v.label} sub={v.desc}/>
                ))}
                <div style={{marginTop:14}}>
                  <Label>Keyword-Wünsche (optional)</Label>
                  <input
                    value={hKeywords}
                    onChange={e=>setHKeywords(e.target.value)}
                    placeholder="z.B. Personal Branding, LinkedIn, B2B-SaaS"
                    style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box'}}
                  />
                </div>
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <Label>Zusatzkontext (optional)</Label>
              <textarea
                value={hExtra}
                onChange={e=>setHExtra(e.target.value)}
                placeholder="z.B. neue Position, bestimmter Schwerpunkt, Metrik die rein soll, Event/Buchprojekt…"
                rows={2}
                style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical'}}
              />
            </div>
            <button onClick={genHeadline} disabled={hLoading} style={{
              padding:'10px 20px',background:hLoading?'#94A3B8':P,color:'#fff',border:'none',borderRadius:8,
              fontSize:13,fontWeight:600,cursor:hLoading?'wait':'pointer'
            }}>
              {hLoading ? 'Generiere…' : 'Profilslogan generieren'}
            </button>

            {hError && <div style={{marginTop:12,padding:10,background:'#FEE2E2',color:'#991B1B',borderRadius:8,fontSize:12}}>{hError}</div>}

            {hResult && (
              <div style={{marginTop:20,padding:16,background:'#F8FAFC',borderRadius:10,border:'1px solid #E2E8F0'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em'}}>Ergebnis</div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:11,color:hResult.length>220?'#DC2626':hResult.length>180?'#D97706':'#64748B'}}>
                      {hResult.length} / 220 Zeichen
                    </span>
                    <button onClick={()=>copy(hResult, setHCopied)} style={{padding:'5px 11px',background:hCopied?'#059669':'#fff',color:hCopied?'#fff':'rgb(20,20,43)',border:'1px solid #E2E8F0',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      {hCopied ? 'Kopiert ✓' : 'Kopieren'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={hResult}
                  onChange={e => setHResult(e.target.value)}
                  readOnly={hLoading}
                  rows={3}
                  style={{width:'100%',padding:'10px 12px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:14,color:'rgb(20,20,43)',lineHeight:1.5,background:'#fff',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                />
                <div style={{fontSize:10,color:'#94A3B8',marginTop:4}}>Bearbeite den Text direkt oder nutze die KI-Nachbesserung unten.</div>
              </div>
            )}

            {hResult && (
              <div style={{marginTop:12,padding:14,background:'#F8FAFC',borderRadius:10,border:'1px dashed #CBD5E1'}}>
                <Label>KI-Nachbesserung</Label>
                <div style={{fontSize:11,color:'#64748B',marginBottom:8}}>Beschreibe, was die KI am Text anpassen soll. Brand Voice, Zielgruppen und Wissensressourcen bleiben weiterhin aktiv.</div>
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
                  {hLoading ? 'Überarbeite…' : '✎ Text mit KI nachbessern'}
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
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:18,marginBottom:16}}>
              <div>
                <Label>Ausrichtung</Label>
                {AUSRICHTUNGEN.map(v => (
                  <OptButton key={v.id} active={aAusrichtung===v.id} onClick={()=>setAAusrichtung(v.id)} main={v.label} sub={v.desc}/>
                ))}
              </div>
              <div>
                <Label>Länge</Label>
                {ABOUT_LENGTHS.map(v => (
                  <OptButton key={v.id} active={aLength===v.id} onClick={()=>setALength(v.id)} main={v.label} sub={v.desc}/>
                ))}
              </div>
              <div>
                <Label>Struktur</Label>
                {ABOUT_STRUCTURES.map(v => (
                  <OptButton key={v.id} active={aStructure===v.id} onClick={()=>setAStructure(v.id)} main={v.label} sub={v.desc}/>
                ))}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <Label>Zusatzkontext (optional)</Label>
              <textarea
                value={aExtra}
                onChange={e=>setAExtra(e.target.value)}
                placeholder="z.B. Proof-Points die rein sollen, aktuelles Projekt, konkreter CTA-Wunsch, Ton-Anmerkungen…"
                rows={3}
                style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical'}}
              />
            </div>
            <button onClick={genAbout} disabled={aLoading} style={{
              padding:'10px 20px',background:aLoading?'#94A3B8':P,color:'#fff',border:'none',borderRadius:8,
              fontSize:13,fontWeight:600,cursor:aLoading?'wait':'pointer'
            }}>
              {aLoading ? 'Generiere…' : 'Info-Box generieren'}
            </button>

            {aError && <div style={{marginTop:12,padding:10,background:'#FEE2E2',color:'#991B1B',borderRadius:8,fontSize:12}}>{aError}</div>}

            {aResult && (
              <div style={{marginTop:20,padding:16,background:'#F8FAFC',borderRadius:10,border:'1px solid #E2E8F0'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em'}}>Ergebnis</div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:11,color:aResult.length>2600?'#DC2626':aResult.length>2400?'#D97706':'#64748B'}}>
                      {aResult.length} / 2.600 Zeichen
                    </span>
                    <button onClick={()=>copy(aResult, setACopied)} style={{padding:'5px 11px',background:aCopied?'#059669':'#fff',color:aCopied?'#fff':'rgb(20,20,43)',border:'1px solid #E2E8F0',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      {aCopied ? 'Kopiert ✓' : 'Kopieren'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={aResult}
                  onChange={e => setAResult(e.target.value)}
                  readOnly={aLoading}
                  rows={14}
                  style={{width:'100%',padding:'12px 14px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:13,color:'rgb(20,20,43)',lineHeight:1.55,background:'#fff',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                />
                <div style={{fontSize:10,color:'#94A3B8',marginTop:4}}>Bearbeite den Text direkt oder nutze die KI-Nachbesserung unten.</div>
              </div>
            )}

            {aResult && (
              <div style={{marginTop:12,padding:14,background:'#F8FAFC',borderRadius:10,border:'1px dashed #CBD5E1'}}>
                <Label>KI-Nachbesserung</Label>
                <div style={{fontSize:11,color:'#64748B',marginBottom:8}}>Beschreibe, was die KI an der Info-Box verändern soll.</div>
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
                  {aLoading ? 'Überarbeite…' : '✎ Text mit KI nachbessern'}
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
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
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
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:18,marginBottom:16}}>
              <div>
                <Label>Ausrichtung</Label>
                {AUSRICHTUNGEN.map(v => (
                  <OptButton key={v.id} active={pAusrichtung===v.id} onClick={()=>setPAusrichtung(v.id)} main={v.label} sub={v.desc}/>
                ))}
              </div>
              <div>
                <Label>Länge</Label>
                {POSITION_LENGTHS.map(v => (
                  <OptButton key={v.id} active={pLength===v.id} onClick={()=>setPLength(v.id)} main={v.label} sub={v.desc}/>
                ))}
              </div>
              <div>
                <Label>Fokus</Label>
                {POSITION_FOCUS.map(v => (
                  <OptButton key={v.id} active={pFocus===v.id} onClick={()=>setPFocus(v.id)} main={v.label} sub={v.desc}/>
                ))}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <Label>Zusatzkontext (optional)</Label>
              <textarea
                value={pExtra}
                onChange={e=>setPExtra(e.target.value)}
                placeholder="z.B. konkrete Erfolge mit Zahlen, KPI-Verantwortung, verantwortete Teams/Budgets, laufende Projekte…"
                rows={3}
                style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical'}}
              />
            </div>
            <button onClick={genPosition} disabled={pLoading} style={{
              padding:'10px 20px',background:pLoading?'#94A3B8':P,color:'#fff',border:'none',borderRadius:8,
              fontSize:13,fontWeight:600,cursor:pLoading?'wait':'pointer'
            }}>
              {pLoading ? 'Generiere…' : 'Positionsbeschreibung generieren'}
            </button>

            {pError && <div style={{marginTop:12,padding:10,background:'#FEE2E2',color:'#991B1B',borderRadius:8,fontSize:12}}>{pError}</div>}

            {pResult && (
              <div style={{marginTop:20,padding:16,background:'#F8FAFC',borderRadius:10,border:'1px solid #E2E8F0'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em'}}>Ergebnis</div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:11,color:pResult.length>2000?'#DC2626':pResult.length>1800?'#D97706':'#64748B'}}>
                      {pResult.length} / 2.000 Zeichen
                    </span>
                    <button onClick={()=>copy(pResult, setPCopied)} style={{padding:'5px 11px',background:pCopied?'#059669':'#fff',color:pCopied?'#fff':'rgb(20,20,43)',border:'1px solid #E2E8F0',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      {pCopied ? 'Kopiert ✓' : 'Kopieren'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={pResult}
                  onChange={e => setPResult(e.target.value)}
                  readOnly={pLoading}
                  rows={12}
                  style={{width:'100%',padding:'12px 14px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:13,color:'rgb(20,20,43)',lineHeight:1.55,background:'#fff',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                />
                <div style={{fontSize:10,color:'#94A3B8',marginTop:4}}>Bearbeite den Text direkt oder nutze die KI-Nachbesserung unten.</div>
              </div>
            )}

            {pResult && (
              <div style={{marginTop:12,padding:14,background:'#F8FAFC',borderRadius:10,border:'1px dashed #CBD5E1'}}>
                <Label>KI-Nachbesserung</Label>
                <div style={{fontSize:11,color:'#64748B',marginBottom:8}}>Beschreibe, was die KI an der Positionsbeschreibung verändern soll.</div>
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
                  {pLoading ? 'Überarbeite…' : '✎ Text mit KI nachbessern'}
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
            <div style={{padding:12,background:'#EFF6FF',borderRadius:8,marginBottom:16,fontSize:12,color:'#1E40AF',lineHeight:1.5}}>
              Erstellt alle drei Texte in einem Durchgang — gleiche Tonalität, gleiche Keywords, konsistente Terminologie. Ergebnisse werden anschließend auch in die Einzel-Tabs übernommen, damit du dort weiter feinschleifen kannst.
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginBottom:16}}>
              <div>
                <Label>Ausrichtung (für alle drei)</Label>
                {AUSRICHTUNGEN.map(v => (
                  <OptButton key={v.id} active={allAusrichtung===v.id} onClick={()=>setAllAusrichtung(v.id)} main={v.label} sub={v.desc}/>
                ))}
              </div>
              <div>
                <Label>Position / Titel</Label>
                <input
                  value={pTitle}
                  onChange={e=>setPTitle(e.target.value)}
                  placeholder="z.B. Senior Product Manager"
                  style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',marginBottom:10}}
                />
                <Label>Unternehmen</Label>
                <input
                  value={pCompany}
                  onChange={e=>setPCompany(e.target.value)}
                  placeholder="z.B. entrenous GmbH"
                  style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',marginBottom:10}}
                />
                <Label>Zusatzkontext (optional)</Label>
                <textarea
                  value={allExtra}
                  onChange={e=>setAllExtra(e.target.value)}
                  placeholder="Gilt für alle drei Texte — konkrete Proof-Points, Kern-Message, Ton-Anmerkungen…"
                  rows={3}
                  style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',resize:'vertical'}}
                />
              </div>
            </div>

            <button onClick={genAll} disabled={allLoading} style={{
              padding:'10px 20px',background:allLoading?'#94A3B8':P,color:'#fff',border:'none',borderRadius:8,
              fontSize:13,fontWeight:600,cursor:allLoading?'wait':'pointer'
            }}>
              {allLoading ? 'Generiere alle drei…' : 'Alle drei generieren'}
            </button>

            {allError && <div style={{marginTop:12,padding:10,background:'#FEE2E2',color:'#991B1B',borderRadius:8,fontSize:12}}>{allError}</div>}

            {(allResult.headline || allResult.about || allResult.position) && (
              <div style={{marginTop:20,display:'flex',flexDirection:'column',gap:14}}>
                {allResult.headline && (
                  <div style={{padding:16,background:'#F8FAFC',borderRadius:10,border:'1px solid #E2E8F0'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em'}}>Profilslogan · {allResult.headline.length} / 220</div>
                      <button onClick={()=>copy(allResult.headline, ()=>showFlash('Profilslogan kopiert'))} style={{padding:'4px 10px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Kopieren</button>
                    </div>
                    <textarea
                      value={allResult.headline}
                      onChange={e=>setAllResult({...allResult, headline:e.target.value})}
                      readOnly={allLoading}
                      rows={3}
                      style={{width:'100%',padding:'10px 12px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:14,color:'rgb(20,20,43)',lineHeight:1.5,background:'#fff',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                    />
                    <div style={{marginTop:10,padding:10,background:'#fff',borderRadius:8,border:'1px dashed #CBD5E1'}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#64748B',marginBottom:5}}>KI-Nachbesserung</div>
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
                        {allLoading ? 'Überarbeite…' : '✎ Mit KI nachbessern'}
                      </button>
                    </div>
                  </div>
                )}
                {allResult.about && (
                  <div style={{padding:16,background:'#F8FAFC',borderRadius:10,border:'1px solid #E2E8F0'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em'}}>Info-Box · {allResult.about.length} / 2.600</div>
                      <button onClick={()=>copy(allResult.about, ()=>showFlash('Info-Box kopiert'))} style={{padding:'4px 10px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Kopieren</button>
                    </div>
                    <textarea
                      value={allResult.about}
                      onChange={e=>setAllResult({...allResult, about:e.target.value})}
                      readOnly={allLoading}
                      rows={12}
                      style={{width:'100%',padding:'12px 14px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:13,color:'rgb(20,20,43)',lineHeight:1.55,background:'#fff',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                    />
                    <div style={{marginTop:10,padding:10,background:'#fff',borderRadius:8,border:'1px dashed #CBD5E1'}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#64748B',marginBottom:5}}>KI-Nachbesserung</div>
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
                        {allLoading ? 'Überarbeite…' : '✎ Mit KI nachbessern'}
                      </button>
                    </div>
                  </div>
                )}
                {allResult.position && (
                  <div style={{padding:16,background:'#F8FAFC',borderRadius:10,border:'1px solid #E2E8F0'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.07em'}}>Positionsbeschreibung · {allResult.position.length} / 2.000</div>
                      <button onClick={()=>copy(allResult.position, ()=>showFlash('Position kopiert'))} style={{padding:'4px 10px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Kopieren</button>
                    </div>
                    <textarea
                      value={allResult.position}
                      onChange={e=>setAllResult({...allResult, position:e.target.value})}
                      readOnly={allLoading}
                      rows={10}
                      style={{width:'100%',padding:'12px 14px',border:'1px solid #CBD5E1',borderRadius:8,fontSize:13,color:'rgb(20,20,43)',lineHeight:1.55,background:'#fff',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
                    />
                    <div style={{marginTop:10,padding:10,background:'#fff',borderRadius:8,border:'1px dashed #CBD5E1'}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#64748B',marginBottom:5}}>KI-Nachbesserung</div>
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
                        {allLoading ? 'Überarbeite…' : '✎ Mit KI nachbessern'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ─── History ────────────────────────────── */}
      {history.length > 0 && (
        <Card>
          <CardHead>
            <div style={{fontSize:14,fontWeight:700,color:'rgb(20,20,43)'}}>Letzte Generierungen</div>
            <div style={{fontSize:11,color:'#94A3B8',marginTop:2}}>Die jüngsten 30 Generierungen dieser Seite.</div>
          </CardHead>
          <CardBody style={{padding:0}}>
            <div style={{maxHeight:320,overflowY:'auto'}}>
              {history.map(h => (
                <div key={h.id} style={{padding:'11px 18px',borderBottom:'1px solid #F1F5F9',fontSize:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span style={{padding:'2px 8px',borderRadius:999,background:'rgba(49,90,231,0.1)',color:P,fontSize:10,fontWeight:700}}>{h.template_label}</span>
                      <span style={{color:'#94A3B8',fontSize:11}}>{new Date(h.created_at).toLocaleString('de-DE')}</span>
                    </div>
                    <button onClick={()=>{copy(h.generated_text, ()=>showFlash('Kopiert'))}} style={{padding:'3px 9px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:6,fontSize:10,fontWeight:600,cursor:'pointer'}}>Kopieren</button>
                  </div>
                  <div style={{color:'#475569',lineHeight:1.5,whiteSpace:'pre-wrap',maxHeight:90,overflow:'hidden',position:'relative'}}>
                    {h.generated_text.slice(0, 350)}{h.generated_text.length > 350 ? '…' : ''}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

    </div>
  )
}
