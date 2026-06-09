// src/pages/Messages.jsx
// LinkedIn-Nachrichten-Werkstatt — Drei Modi (Vernetzung / First Message / Sales Pitch)
// im ContentStudio-Layout: Journal-Header, Brand-Voice-Banner mit Ignore-Toggle,
// Pill-Switcher, Generator-Card mit Lead-Autocomplete + Zielgruppen-Selector +
// Kontext-Textarea, Result-Card mit Action-Toolbar, kollabierbarer Verlauf.
//
// Schema-Konventionen (Phase 0 vom 2026-05-29):
//   linkedin_messages: 11 Spalten Conversation-Form, message_type ∈ ('vernetzung'|
//     'first_message'|'sales_pitch'|NULL), team-scoped RLS via team_members-JOIN +
//     Solo-Pfad (team_id IS NULL AND user_id=auth.uid()).
//   activities: Dual-Write-Pattern bei Lead → INSERT mit type='linkedin_message',
//     subject='LinkedIn-Nachricht (gesendet)', body=<content>, direction='outbound'.
//     View lead_activity_feed aggregiert das automatisch in den Lead-Feed.
//   connection_queue: Nur bei Mode=vernetzung + Lead → linkedin_url normalisiert
//     (.split('?')[0] + replace(/\/$/, '')), message=<content>, status='pending'.
//     Extension liest diese Tabelle.
//
// Top-Fallstrick-Awareness:
//   #1  message_type ist text+CHECK — bei Bulk-Updates per-Row-Loop, hier irrelevant (single INSERT)
//   #3  team_members-Subquery in RLS braucht GRANT (in Phase-0-Migration enthalten)
//   #14 useLeads/Lead-Autocomplete mit explizitem team_id-Filter (siehe fetchLeads)

import React, { useState, useEffect, useCallback, useRef } from 'react'
import GenerationLoading from '../components/GenerationLoading'
import TaskSourceIcon from '../components/TaskSourceIcon'
import { X } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { useModel } from '../context/ModelContext'

// ── Konstanten ───────────────────────────────────────────────────────────────
const P = 'var(--wl-primary, rgb(49,90,231))'

// STRICT_FORMAT-Suffix gegen Markdown/Header/Bullet/Meta-Kommentar-Drift der LLM.
// Phase-1-Smoke (2026-05-29) hat gezeigt: ohne expliziten Format-Hard-Stop produziert
// die generate-Edge-Function für connection_request einen "# Cold Email an X" Markdown-
// Block mit Betreff-Zeile + Bullet-Liste statt schlanker Connect-Note.
const STRICT_FORMAT =
  ' WICHTIG: Antworte AUSSCHLIESSLICH mit dem reinen Nachrichtentext, so wie er in das'
  + ' LinkedIn-Nachrichtenfeld eingefügt wird. KEIN Markdown (kein #, kein **fett**, keine'
  + ' Bullet-Listen). KEIN "Betreff:". KEIN Header. KEINE Erklärung. KEINE Meta-Kommentare'
  + ' ("Hier ist der Text:" / "Warum das funktioniert"). KEINE Anführungszeichen um den Text.'
  + ' Nur der Nachrichtentext selbst, ggf. mit Zeilenumbrüchen für Lesbarkeit. Auf Deutsch.'

const MSG_TYPES = {
  vernetzung: {
    label:       'Vernetzung',
    icon:        '🤝',
    desc:        'Connect-Note vor der Vernetzungsanfrage',
    edgeType:    'connection_request',
    contentKind: 'connection_msg',  // konsistent mit Vernetzungen.jsx — triggert das richtige Memory-Lookup-Bucket
    hardCap:     300,
    softTarget:  'max. 300 Zeichen (LinkedIn-Connect-Limit)',
    promptIntent: 'Schreibe eine kurze, persönliche LinkedIn-Vernetzungs-Note (Connect-Note,'
      + ' die VOR der Annahme als Anhang an die Vernetzungsanfrage geht). Maximal 300 Zeichen'
      + ' (LinkedIn-Hard-Limit). Kein Hard-Sell, kein Pitch. Optional ein-Satz-Bezug zur Person'
      + ' oder zum Anlass. Eine neugierige, einladende Eröffnung — keine Verkaufsabsicht.'
      + STRICT_FORMAT,
  },
  first_message: {
    label:       'First Message',
    icon:        '✉️',
    desc:        'Erste DM nach Annahme der Vernetzung',
    edgeType:    'first_message',
    contentKind: 'linkedin_first_message',
    hardCap:     null,
    softTarget:  '~400-800 Zeichen',
    promptIntent: 'Schreibe eine erste LinkedIn-Direkt-Nachricht NACH erfolgreicher Vernetzung.'
      + ' Ziel: Conversation starten ODER konkreten Mehrwert anbieten. Länge 400-800 Zeichen,'
      + ' max. ca. 5 Sätze. Persönlich, authentisch, du-Form je nach Brand Voice. KEIN harter'
      + ' Verkaufs-Pitch. Entweder EINE konkrete Frage stellen ODER EINEN konkreten Mehrwert'
      + ' (Link/Tipp/Beobachtung) anbieten — nicht beides.'
      + STRICT_FORMAT,
  },
  sales_pitch: {
    label:       'Sales Pitch',
    icon:        '🎯',
    desc:        'Konkretes Angebot mit klarem CTA',
    edgeType:    'sales_pitch',
    contentKind: 'linkedin_sales_pitch',
    hardCap:     null,
    softTarget:  '~800-1500 Zeichen',
    promptIntent: 'Schreibe eine LinkedIn-Direkt-Nachricht mit konkretem Angebot oder'
      + ' Service-Pitch. Länge 800-1500 Zeichen. Aufbau: (1) Persönlicher Aufhänger /'
      + ' Bezug zum Empfänger, (2) konkretes Problem das du lösen kannst, (3) klares'
      + ' Angebot mit einem CTA am Ende (z.B. 15-Min-Call, Demo, kurze Reply).'
      + ' Persönlich, nicht generisches Marketing-Bla.'
      + STRICT_FORMAT,
  },
}

// ── Helper ───────────────────────────────────────────────────────────────────
const fullName = l => ((l?.first_name||'') + ' ' + (l?.last_name||'')).trim() || l?.name || 'Unbekannt'

const normalizeLinkedInUrl = url => url ? url.split('?')[0].replace(/\/$/, '') : null

// Achtung: generate Edge-Function ignoriert body.systemPrompt komplett — sie nimmt
// nur body.prompt entgegen und baut den systemPrompt selbst aus DB-Daten auf
// (aktive BV via buildBrandVoicePrompt, aktive Zielgruppe via ai_summary, Few-Shot-
// Examples aus content_generations). Daher packen wir den vollen Mode-Intent +
// Strict-Format + Empfänger-Kontext + optional zusätzliche UI-Zielgruppe in body.prompt.
// Siehe supabase/functions/generate/index.ts Z324, Z334-345.
function buildPrompt(mode, recipient, context, audience, ignoreBV) {
  const cfg = MSG_TYPES[mode]
  const parts = []
  // Mode-Intent + Strict-Format-Hard-Stop kommt zuerst — wichtigster Constraint.
  parts.push(cfg.promptIntent)
  // Optional: BV-Ignore-Hinweis (überschreibt nur partiell, weil EF die BV trotzdem injiziert,
  // aber als zusätzlicher Hint kann es helfen die LLM in den Standard-B2B-Stil zu lenken).
  if (ignoreBV) {
    parts.push('Hinweis: Verwende einen neutralen, professionellen B2B-Stil. Brand-Voice-Anweisungen ignorieren.')
  }
  // Zielgruppe (falls UI-selektiert — überschreibt/ergänzt die globally-active TA der EF)
  if (audience) {
    parts.push(`ZIELGRUPPE: ${audience.name}${audience.description ? ' — ' + audience.description : ''}`)
  }
  // Empfänger-Block
  const recParts = []
  recParts.push(`Name: ${recipient.name || 'unbekannt'}`)
  if (recipient.position) recParts.push(`Position: ${recipient.position}`)
  if (recipient.company)  recParts.push(`Unternehmen: ${recipient.company}`)
  parts.push('EMPFÄNGER:\n' + recParts.join('\n'))
  // Kontext / Anlass (optional)
  if (context && context.trim()) {
    parts.push('ANLASS / KONTEXT:\n' + context.trim())
  }
  return parts.join('\n\n')
}

// ── Field-Primitives (vom ContentStudio-Pattern) ─────────────────────────────
const inp = { width:'100%', padding:'10px 12px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', outline:'none', transition:'border-color .12s' }

function Field({ label, hint, optional, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }}>
        {label}{optional && <span style={{ fontWeight:400, color:'var(--text-muted)', textTransform:'none', marginLeft:6 }}>(optional)</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:5 }}>{hint}</div>}
    </div>
  )
}

// ── Brand-Voice-Banner ───────────────────────────────────────────────────────
function BrandVoiceBanner({ bv, ignoreBV, onToggle }) {
  if (!bv) return (
    <div style={{ padding:'12px 16px', borderRadius:10, background:'#FFFBEB', border:'1px solid #FDE68A', marginBottom:18 }}>
      <span style={{ fontSize:13, fontWeight:700, color:'#92400E' }}>Keine Brand Voice aktiv — </span>
      <a href="/brand-voice" style={{ color:P, fontWeight:700 }}>Brand Voice erstellen</a>
    </div>
  )
  return (
    <div style={{ padding:'12px 16px', borderRadius:10, background: ignoreBV ? 'rgb(238,241,252)' : '#F0FDF4', border:'1px solid ' + (ignoreBV ? '#E5E7EB' : '#BBF7D0'), marginBottom:18, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
        <span style={{ fontSize:18 }}>🎙️</span>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color: ignoreBV ? '#475569' : '#166534', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {ignoreBV ? 'Brand Voice deaktiviert' : 'Brand Voice aktiv: ' + bv.name}
          </div>
          <div style={{ fontSize:11, color: ignoreBV ? '#94A3B8' : '#059669' }}>
            {ignoreBV ? 'Standard B2B-Stil' : 'Nachrichten werden in deiner Brand Voice generiert'}
          </div>
        </div>
      </div>
      <div onClick={onToggle} title={ignoreBV ? 'Brand Voice anwenden' : 'Brand Voice ignorieren'} style={{ width:36, height:20, borderRadius:999, background: ignoreBV ? '#E5E7EB' : '#22C55E', position:'relative', cursor:'pointer', flexShrink:0 }}>
        <div style={{ width:16, height:16, borderRadius:'50%', background:'#fff', position:'absolute', top:2, left: ignoreBV ? 2 : 18, boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Messages({ session }) {
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const { model: selectedModel } = useModel()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // ── Generator-State ──────────────────────────────────────────────────────
  const [mode, setMode] = useState('vernetzung')
  const [ignoreBV, setIgnoreBV] = useState(false)

  // Empfänger
  const [selectedLead, setSelectedLead] = useState(null)
  const [leadSearch, setLeadSearch] = useState('')
  const [leadOptions, setLeadOptions] = useState([])
  const [leadsDropdownOpen, setLeadsDropdownOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualPosition, setManualPosition] = useState('')
  const [manualCompany, setManualCompany] = useState('')

  // Zielgruppe
  const [audiences, setAudiences] = useState([])
  const [selectedAudienceId, setSelectedAudienceId] = useState('')

  // Kontext + Result
  const [context, setContext] = useState('')
  const [result, setResult] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [flash, setFlash] = useState(null)
  const showFlash = (msg, type = 'success') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 3500) }

  // Save-State
  const [savingArchive, setSavingArchive] = useState(false)
  const [savedArchive, setSavedArchive] = useState(false)
  const [savingActivity, setSavingActivity] = useState(false)
  const [savedActivity, setSavedActivity] = useState(false)
  const [queueing, setQueueing] = useState(false)
  const [queued, setQueued] = useState(false)

  // Verlauf
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  // ── Effects ──────────────────────────────────────────────────────────────
  // Leads für Autocomplete laden (team-scoped per Top-Fallstrick #14)
  useEffect(() => {
    let q = supabase
      .from('leads')
      .select('id, first_name, last_name, name, job_title, headline, company, linkedin_url, team_id, user_id')
      .order('created_at', { ascending: false })
      .limit(200)
    if (activeTeamId) {
      q = q.eq('team_id', activeTeamId)
    } else {
      q = q.eq('user_id', session.user.id).is('team_id', null)
    }
    q.then(({ data }) => setLeadOptions(data || []))
  }, [activeTeamId, session.user.id])

  // Lead aus URL-Param ?lead=UUID vorausfüllen (Deep-Link aus LeadDetail/Vernetzungen)
  useEffect(() => {
    const leadId = searchParams.get('lead')
    if (!leadId || leadOptions.length === 0) return
    const found = leadOptions.find(l => l.id === leadId)
    if (found) applyLead(found)
  }, [searchParams, leadOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Zielgruppen für aktive BV laden (analog ContentStudio)
  useEffect(() => {
    if (!activeBrandVoice?.id) { setAudiences([]); setSelectedAudienceId(''); return }
    (async () => {
      const { data, error } = await supabase
        .from('target_audience_brand_voices')
        .select('target_audiences(id, name, description, is_default)')
        .eq('brand_voice_id', activeBrandVoice.id)
      if (error) { console.warn('[audiences]', error); return }
      const list = (data || []).map(r => r.target_audiences).filter(Boolean)
      list.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
      setAudiences(list)
      const def = list.find(a => a.is_default)
      if (def && !selectedAudienceId) setSelectedAudienceId(def.id)
    })()
  }, [activeBrandVoice?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Verlauf laden (team-scoped)
  const loadHistory = useCallback(async () => {
    let q = supabase
      .from('linkedin_messages')
      .select('id, content, message_type, direction, lead_id, brand_voice_id, sent_at, created_at')
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(20)
    if (activeTeamId) q = q.eq('team_id', activeTeamId)
    else q = q.eq('user_id', session.user.id).is('team_id', null)
    const { data } = await q
    setHistory(data || [])
  }, [activeTeamId, session.user.id])
  useEffect(() => { loadHistory() }, [loadHistory])

  // ── Generator-Actions ────────────────────────────────────────────────────
  const filteredLeads = leadOptions.filter(l => {
    const q = leadSearch.toLowerCase()
    return !q || fullName(l).toLowerCase().includes(q) || (l.company||'').toLowerCase().includes(q)
  }).slice(0, 8)

  function applyLead(lead) {
    setSelectedLead(lead)
    setManualName(fullName(lead))
    setManualPosition(lead.job_title || lead.headline || '')
    setManualCompany(lead.company || '')
    setLeadSearch(fullName(lead))
    setLeadsDropdownOpen(false)
  }

  function clearLead() {
    setSelectedLead(null)
    setLeadSearch('')
    setManualName('')
    setManualPosition('')
    setManualCompany('')
  }

  function switchMode(next) {
    if (next === mode) return
    setMode(next)
    // Result + Save-States verwerfen — Mode-Wechsel = neuer Output
    setResult('')
    setSavedArchive(false); setSavedActivity(false); setQueued(false)
  }

  async function generate() {
    const recipientName = manualName.trim() || (selectedLead ? fullName(selectedLead) : '')
    if (!recipientName) {
      showFlash('Bitte einen Lead auswählen oder einen Namen eingeben.', 'error')
      return
    }
    setGenerating(true)
    setResult('')
    setSavedArchive(false); setSavedActivity(false); setQueued(false)

    const cfg = MSG_TYPES[mode]
    const audience = audiences.find(a => a.id === selectedAudienceId) || null
    const fullPrompt = buildPrompt(
      mode,
      { name: recipientName, position: manualPosition.trim(), company: manualCompany.trim() },
      context,
      audience,
      ignoreBV
    )

    try {
      const { data, error } = await supabase.functions.invoke('generate', {
        body: {
          type:           cfg.edgeType,
          prompt:         fullPrompt,             // EF nutzt nur prompt + content_kind (siehe buildPrompt-Kommentar)
          brand_voice_id: activeBrandVoice?.id || null,
          model:          selectedModel,
          content_kind:   cfg.contentKind,
        },
      })
      if (error) throw new Error(error.message || 'Edge-Function-Fehler')
      const text =
        (typeof data === 'string' ? data : null) ||
        data?.text ||
        data?.content ||
        (Array.isArray(data?.content) ? data.content[0]?.text : null) ||
        data?.result ||
        ''
      if (!text) {
        showFlash('KI-Antwort leer: ' + (data?.error || 'unbekannt'), 'error')
      } else {
        setResult(text.trim())
        // recordGeneration optional (best-effort, kein Block bei Fehler)
        try {
          const { recordGeneration } = await import('../lib/contentMemory')
          await recordGeneration({
            userId: session.user.id, teamId: activeTeamId,
            kind: cfg.contentKind, model: selectedModel,
            promptInput: { mode, recipient: recipientName, position: manualPosition, company: manualCompany, audience_id: selectedAudienceId, context, ignoreBV },
            brandVoiceId: activeBrandVoice?.id || null,
            variants: [text.trim()],
          })
        } catch (_) {}
      }
    } catch (e) {
      showFlash('Fehler: ' + (e.message || 'Unbekannt'), 'error')
    }
    setGenerating(false)
  }

  // ── Output-Pfade ─────────────────────────────────────────────────────────
  async function copy() {
    await navigator.clipboard.writeText(result)
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  async function saveToArchive() {
    if (!result.trim()) return
    setSavingArchive(true)
    const row = {
      user_id: session.user.id,
      team_id: activeTeamId || null,
      lead_id: selectedLead?.id || null,
      direction: 'outbound',
      content: result.trim(),
      message_type: mode,
      brand_voice_id: activeBrandVoice?.id || null,
      is_ai_generated: true,
      sent_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('linkedin_messages').insert(row)
    setSavingArchive(false)
    if (error) { showFlash('Archiv-Fehler: ' + error.message, 'error'); return }
    setSavedArchive(true); setTimeout(() => setSavedArchive(false), 2500)
    loadHistory()
  }

  async function saveAsActivity() {
    if (!result.trim() || !selectedLead) return
    setSavingActivity(true)
    const cfg = MSG_TYPES[mode]
    const subjectByMode = {
      vernetzung:    'LinkedIn-Vernetzungs-Note verfasst',
      first_message: 'LinkedIn-Nachricht (gesendet)',
      sales_pitch:   'LinkedIn-Sales-Pitch verfasst',
    }
    const row = {
      lead_id:     selectedLead.id,
      team_id:     selectedLead.team_id || activeTeamId || null,
      user_id:     session.user.id,
      type:        'linkedin_message',
      direction:   'outbound',
      subject:     subjectByMode[mode] || 'LinkedIn-Nachricht',
      body:        result.trim(),
      occurred_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('activities').insert(row)
    setSavingActivity(false)
    if (error) { showFlash('Activity-Fehler: ' + error.message, 'error'); return }
    setSavedActivity(true); setTimeout(() => setSavedActivity(false), 2500)
  }

  async function queueVernetzung() {
    if (!result.trim() || !selectedLead || mode !== 'vernetzung') return
    const liUrl = normalizeLinkedInUrl(selectedLead.linkedin_url)
    if (!liUrl) {
      showFlash('Kein LinkedIn-Profil am Lead hinterlegt.', 'error')
      return
    }
    setQueueing(true)
    const row = {
      user_id:        session.user.id,
      lead_id:        selectedLead.id,
      team_id:        selectedLead.team_id || activeTeamId || null,
      linkedin_url:   liUrl,
      message:        result.trim(),
      brand_voice_id: activeBrandVoice?.id || null,
      status:         'pending',
    }
    const { error } = await supabase.from('connection_queue').insert(row)
    setQueueing(false)
    if (error) { showFlash('Queue-Fehler: ' + error.message, 'error'); return }
    // Lead-Status auf pending setzen (Vernetzungen.jsx-Konvention)
    await supabase.from('leads')
      .update({ li_connection_status: 'pending', li_connection_requested_at: new Date().toISOString() })
      .eq('id', selectedLead.id)
    setQueued(true); setTimeout(() => setQueued(false), 2500)
  }

  async function saveAll() {
    if (!result.trim()) return
    await saveToArchive()
    if (selectedLead) await saveAsActivity()
    if (selectedLead && mode === 'vernetzung') await queueVernetzung()
    showFlash('Alle Speicher-Pfade abgearbeitet.', 'success')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const cfg = MSG_TYPES[mode]
  const charCount = result.length
  const overHardCap = cfg.hardCap && charCount > cfg.hardCap
  const canActivity = !!selectedLead
  const canQueue    = !!selectedLead && mode === 'vernetzung' && !!selectedLead.linkedin_url

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Journal-Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:20, flexWrap:'wrap', marginBottom:22 }}>
        <div style={{ flex:'1 1 auto', minWidth:280 }}>
          <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>LinkedIn · Nachricht</div>
          <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2, color:'var(--text-primary, rgb(20,20,43))' }}>Deine nächste Nachricht.</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6, maxWidth:580 }}>
            Drei Modi für drei Momente: Vernetzungs-Note, First Message, Sales Pitch — in deiner Brand Voice, optional auf Zielgruppe + Lead-Kontext zugeschnitten.
          </p>
        </div>
        <button onClick={() => setShowHistory(h => !h)}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', fontSize:12, fontWeight:600, color:'#475569', cursor:'pointer' }}>
          🕒 Verlauf ({history.length})
        </button>
      </div>

      {/* Brand-Voice-Banner */}
      <BrandVoiceBanner bv={activeBrandVoice} ignoreBV={ignoreBV} onToggle={() => setIgnoreBV(v => !v)}/>

      {/* Flash */}
      {flash && (
        <div style={{ padding:'10px 16px', borderRadius:9, marginBottom:16, fontSize:13, fontWeight:600, background: flash.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: flash.type === 'error' ? '#991B1B' : '#166534', border:'1px solid ' + (flash.type === 'error' ? '#FCA5A5' : '#BBF7D0') }}>
          {flash.type === 'error' ? 'Fehler: ' : ''}{flash.msg}
        </div>
      )}

      {/* Mode-Switcher (Pills) */}
      <div style={{ display:'flex', gap:6, marginBottom:18, padding:5, background:'#F1F5F9', borderRadius:12, width:'fit-content', flexWrap:'wrap' }}>
        {Object.entries(MSG_TYPES).map(([key, m]) => (
          <button key={key} onClick={() => switchMode(key)} title={m.desc}
            style={{
              padding:'9px 16px', borderRadius:9, border:'none', fontSize:13, fontWeight:700, cursor:'pointer',
              background: mode === key ? '#fff' : 'transparent',
              color: mode === key ? P : '#64748B',
              boxShadow: mode === key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition:'all 0.15s',
            }}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* Generator-Card */}
      <section style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'20px 22px', marginBottom:18 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
          <h3 style={{ fontSize:15, fontWeight:700, margin:0, display:'flex', alignItems:'center', gap:8 }}>
            <TaskSourceIcon name={cfg.iconName} size={18} /> {cfg.label}
          </h3>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>{cfg.softTarget}</div>
        </div>

        {/* Empfänger: Lead-Autocomplete */}
        <Field label="Empfänger (Lead)" optional hint={selectedLead ? 'Aus CRM verknüpft — Activity + Vernetzungs-Queue verfügbar.' : 'Optional. Wenn leer, Name/Position/Firma unten manuell setzen.'}>
          <div style={{ position:'relative' }}>
            <input
              value={leadSearch}
              onChange={e => {
                setLeadSearch(e.target.value)
                setLeadsDropdownOpen(true)
                if (selectedLead) setSelectedLead(null)
              }}
              onFocus={() => setLeadsDropdownOpen(true)}
              placeholder="Lead suchen…"
              style={inp}
            />
            {leadsDropdownOpen && leadSearch && filteredLeads.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:99, background:'var(--surface)', border:'1.5px solid #E2E8F0', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', marginTop:4, maxHeight:240, overflowY:'auto' }}>
                {filteredLeads.map(l => (
                  <div key={l.id} onClick={() => applyLead(l)}
                    style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #F9FAFB', display:'flex', alignItems:'center', gap:10 }}
                    onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                    onMouseLeave={e => e.currentTarget.style.background='white'}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background:P, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:12, fontWeight:700, flexShrink:0 }}>
                      {fullName(l).charAt(0)}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)' }}>{fullName(l)}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {l.job_title||l.headline||''}{l.company?' · '+l.company:''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedLead && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6, padding:'6px 10px', background:'rgba(49,90,231,0.05)', borderRadius:8, border:'1px solid rgba(49,90,231,0.15)' }}>
              <span style={{ fontSize:12, color:'var(--text-muted)', flex:1 }}>{fullName(selectedLead)} verknüpft</span>
              <button onClick={() => navigate(`/leads/${selectedLead.id}`)}
                style={{ padding:'3px 10px', borderRadius:6, border:'1px solid rgba(49,90,231,0.3)', background:'rgba(49,90,231,0.08)', color:P, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                ↗ Profil
              </button>
              <button onClick={clearLead}
                style={{ padding:'3px 10px', borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', color:'#475569', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                ✕ Lösen
              </button>
            </div>
          )}
        </Field>

        {/* Manuelle Empfänger-Felder (nur wenn kein Lead oder als Override) */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
          <Field label="Name">
            <input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Max Mustermann" style={inp}/>
          </Field>
          <Field label="Position">
            <input value={manualPosition} onChange={e => setManualPosition(e.target.value)} placeholder="Head of Sales…" style={inp}/>
          </Field>
          <Field label="Unternehmen">
            <input value={manualCompany} onChange={e => setManualCompany(e.target.value)} placeholder="Acme GmbH…" style={inp}/>
          </Field>
        </div>

        {/* Zielgruppe */}
        <Field label="Zielgruppe" optional hint={
          !activeBrandVoice ? 'Brand Voice nötig.'
          : audiences.length === 0 ? <>Keine Zielgruppen für diese BV. Anlegen in <a href="/zielgruppen" style={{ color:P }}>Zielgruppen</a>.</>
          : 'Reichert den Prompt mit Pain-Points / Ansprache der Zielgruppe an.'
        }>
          <select value={selectedAudienceId} onChange={e => setSelectedAudienceId(e.target.value)} style={{ ...inp, cursor:'pointer' }} disabled={!audiences.length}>
            <option value="">Keine spezifische Zielgruppe</option>
            {audiences.map(a => (
              <option key={a.id} value={a.id}>{a.name}{a.is_default ? ' (Default)' : ''}</option>
            ))}
          </select>
        </Field>

        {/* Kontext */}
        <Field label="Kontext / Anlass" optional hint='z.B. „Haben uns auf der SaaStr Konferenz kurz gesprochen…"'>
          <textarea value={context} onChange={e => setContext(e.target.value)} rows={3}
            placeholder={mode === 'vernetzung'
              ? 'z.B. Gemeinsame Connection, gemeinsamer Post-Like, kürzliches Event…'
              : mode === 'first_message'
              ? 'z.B. Worauf willst du dich beziehen? Welche Frage stellen?'
              : 'z.B. Welchen Service pitchen? Welches konkrete Problem lösen?'}
            style={{ ...inp, resize:'vertical', lineHeight:1.6 }}/>
        </Field>

        {generating && <GenerationLoading title="KI-Nachricht wird formuliert" expectedSeconds={20} />}

        <button onClick={generate} disabled={generating}
          style={{
            marginTop:6, width:'100%', padding:'12px', borderRadius:999, border:'none',
            background: generating ? '#94A3B8' : 'linear-gradient(135deg,rgb(49,90,231),#8B5CF6)',
            color:'#fff', fontSize:14, fontWeight:700,
            cursor: generating ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow: generating ? 'none' : '0 4px 14px rgba(49,90,231,0.25)',
          }}>
          {generating ? 'Generiere …' : 'Nachricht generieren'}
        </button>
      </section>

      {/* Result-Card */}
      {result && (
        <section style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden', marginBottom:18 }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#FAFAFA', flexWrap:'wrap', gap:8 }}>
            <div style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              Generierter Text
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:'rgba(49,90,231,0.08)', color:P, border:'1px solid #BFDBFE' }}>
                <TaskSourceIcon name={cfg.iconName}/> {cfg.label}
              </span>
              {activeBrandVoice && !ignoreBV && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:'#F0FDF4', color:'#166534', border:'1px solid #BBF7D0' }}>
                  Brand Voice
                </span>
              )}
              {selectedLead && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:'#FEF3C7', color:'#92400E', border:'1px solid #FDE68A' }}>
                  Lead: {fullName(selectedLead)}
                </span>
              )}
            </div>
            <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
              <button onClick={generate} disabled={generating}
                style={{ padding:'5px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'#475569', fontSize:11, fontWeight:600, cursor:generating?'wait':'pointer', display:'flex', alignItems:'center', gap:5 }}>
                🔄 Neu
              </button>
              <button onClick={copy}
                style={{ padding:'5px 12px', borderRadius:8, border:'1px solid ' + (copied?'#BBF7D0':'#E5E7EB'), background: copied?'#F0FDF4':'#fff', color: copied?'#166534':'#475569', fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                📋 {copied ? 'Kopiert!' : 'Kopieren'}
              </button>
              <button onClick={saveToArchive} disabled={savingArchive || !result.trim() || overHardCap}
                title={overHardCap ? `Text zu lang (${cfg.hardCap}-Zeichen-Limit für ${cfg.label} überschritten)` : ''}
                style={{ padding:'5px 12px', borderRadius:8, border:'1px solid ' + (savedArchive?'#A7F3D0':'rgba(49,90,231,0.3)'), background: savedArchive?'#ECFDF5':'rgba(49,90,231,0.07)', color: savedArchive?'#065F46':P, fontSize:11, fontWeight:700, cursor: (savingArchive||overHardCap)?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:5, opacity: overHardCap ? 0.5 : 1 }}>
                {savingArchive ? 'Speichere…' : savedArchive ? 'Im Archiv' : 'Im Archiv speichern'}
              </button>
              {canActivity && (
                <button onClick={saveAsActivity} disabled={savingActivity || !result.trim() || overHardCap}
                  title={overHardCap ? `Text zu lang (${cfg.hardCap}-Zeichen-Limit)` : ''}
                  style={{ padding:'5px 12px', borderRadius:8, border:'1px solid ' + (savedActivity?'#A7F3D0':'#FDE68A'), background: savedActivity?'#ECFDF5':'#FEF3C7', color: savedActivity?'#065F46':'#92400E', fontSize:11, fontWeight:700, cursor: (savingActivity||overHardCap)?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:5, opacity: overHardCap ? 0.5 : 1 }}>
                  {savingActivity ? '⏳' : savedActivity ? 'Activity' : 'Als Activity am Lead'}
                </button>
              )}
              {canQueue && (
                <button onClick={queueVernetzung} disabled={queueing || !result.trim() || overHardCap}
                  title={overHardCap ? 'Connect-Note ist über 300 Zeichen — LinkedIn lehnt sie ab' : ''}
                  style={{ padding:'5px 12px', borderRadius:8, border:'1px solid ' + (queued?'#A7F3D0':'#A78BFA'), background: queued?'#ECFDF5':'#F5F3FF', color: queued?'#065F46':'#5B21B6', fontSize:11, fontWeight:700, cursor: (queueing||overHardCap)?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:5, opacity: overHardCap ? 0.5 : 1 }}>
                  {queueing ? '⏳' : queued ? 'In Queue' : 'In Vernetzungs-Queue'}
                </button>
              )}
              {selectedLead && (
                <button onClick={saveAll} disabled={savingArchive || savingActivity || queueing || !result.trim() || overHardCap}
                  title={overHardCap ? `Text zu lang (${cfg.hardCap}-Zeichen-Limit überschritten)` : ''}
                  style={{ padding:'5px 12px', borderRadius:8, border:'none', background: overHardCap ? '#94A3B8' : 'linear-gradient(135deg,#10B981,#059669)', color:'#fff', fontSize:11, fontWeight:700, cursor: overHardCap ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', gap:5, opacity: overHardCap ? 0.7 : 1 }}>
                  ⚡ Alles speichern
                </button>
              )}
            </div>
          </div>
          <div style={{ padding:'18px 20px' }}>
            <textarea value={result} onChange={e => setResult(e.target.value)}
              style={{
                width:'100%', minHeight:180, border:'none', outline:'none', fontSize:14, lineHeight:1.7, fontFamily:'inherit', resize:'vertical',
                color: result ? 'rgb(20,20,43)' : '#94A3B8',
                background:'transparent', boxSizing:'border-box',
              }}/>
          </div>
          <div style={{ padding:'8px 16px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #F8FAFC', flexWrap:'wrap', gap:8 }}>
            <span style={{ fontSize:11, color: overHardCap ? '#EF4444' : 'var(--text-muted)', fontWeight: overHardCap ? 700 : 400 }}>
              {charCount} Zeichen{cfg.hardCap ? ` / ${cfg.hardCap} max` : ''} · {result.split(/\s+/).filter(Boolean).length} Wörter
              {overHardCap && ` — ${charCount - cfg.hardCap} zu viel, LinkedIn-Connect-Limit überschritten`}
            </span>
            <button onClick={copy} style={{ fontSize:11, color:P, fontWeight:700, background:'none', border:'none', cursor:'pointer' }}>
              Für LinkedIn kopieren
            </button>
          </div>
        </section>
      )}

      {/* Verlauf */}
      {showHistory && (
        <section style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F5F9', fontWeight:700, fontSize:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>Letzte {history.length} Nachrichten</span>
            <button onClick={() => setShowHistory(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--text-muted)' }}><X size={14} strokeWidth={1.75}/></button>
          </div>
          {history.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Noch keine Nachrichten im Archiv</div>
          ) : (
            <div style={{ maxHeight:480, overflowY:'auto' }}>
              {history.map(h => {
                const m = MSG_TYPES[h.message_type]
                return (
                  <div key={h.id} style={{ padding:'14px 18px', borderBottom:'1px solid #F8FAFC', cursor:'pointer' }}
                    onClick={() => { setResult(h.content || ''); if (h.message_type && MSG_TYPES[h.message_type]) setMode(h.message_type); setShowHistory(false) }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:999, background:'rgba(49,90,231,0.08)', color:P }}>
                        {m ? `${m.icon} ${m.label}` : (h.message_type || '—')}
                      </span>
                      <span style={{ fontSize:11, color:'var(--text-muted)' }}>{h.created_at ? new Date(h.created_at).toLocaleDateString('de-DE') : ''}</span>
                    </div>
                    <div style={{ fontSize:13, color:'#475569', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                      {h.content || ''}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
