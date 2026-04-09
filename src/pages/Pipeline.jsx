import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LeadDrawer from '../components/LeadDrawer'

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

// Stage-Farben-Palette (nach Index durchgewechselt)
const STAGE_COLORS = [
  { color:'#64748b', bg:'#F8FAFC', border:'#CBD5E1' },
  { color:'#3b82f6', bg:'#EFF6FF', border:'#BFDBFE' },
  { color:'#8b5cf6', bg:'#F5F3FF', border:'#DDD6FE' },
  { color:'#f59e0b', bg:'#FFFBEB', border:'#FDE68A' },
  { color:'#f97316', bg:'#FFF7ED', border:'#FED7AA' },
  { color:'#10b981', bg:'#ECFDF5', border:'#A7F3D0' },
  { color:'#0891b2', bg:'#ECFEFF', border:'#A5F3FC' },
  { color:'#ec4899', bg:'#FDF2F8', border:'#F9A8D4' },
  { color:'#22c55e', bg:'#F0FDF4', border:'#BBF7D0' },
  { color:'#94a3b8', bg:'#F8FAFC', border:'#E2E8F0' },
]

const STAGE_ORDER = ['kein_deal','prospect','opportunity','angebot','verhandlung','gewonnen','verloren','stage_custom1','stage_custom2','stage_custom3']

// Default STAGE_CONFIG — wird durch user-gespeicherte Labels überschrieben
const DEFAULT_STAGE_CONFIG = {
  kein_deal:   { label:'Neu / Identifiziert', color:'#64748b', bg:'#F8FAFC', border:'#CBD5E1', prob:5  },
  prospect:    { label:'Kontaktiert',          color:'#3b82f6', bg:'#EFF6FF', border:'#BFDBFE', prob:15 },
  opportunity: { label:'Verbunden / Gespräch', color:'#8b5cf6', bg:'#F5F3FF', border:'#DDD6FE', prob:30 },
  angebot:     { label:'Bedarf qualifiziert',  color:'#f59e0b', bg:'#FFFBEB', border:'#FDE68A', prob:50 },
  verhandlung: { label:'Angebot versendet',    color:'#f97316', bg:'#FFF7ED', border:'#FED7AA', prob:70 },
  gewonnen:    { label:'Gewonnen',             color:'#22c55e', bg:'#F0FDF4', border:'#BBF7D0', prob:100 },
  verloren:       { label:'Verloren',             color:'#94a3b8', bg:'#F8FAFC', border:'#E2E8F0', prob:0   },
  stage_custom1:  { label:'Neue Stage 1',          color:'#0891b2', bg:'#ECFEFF', border:'#A5F3FC', prob:25  },
  stage_custom2:  { label:'Neue Stage 2',          color:'#ec4899', bg:'#FDF2F8', border:'#F9A8D4', prob:45  },
  stage_custom3:  { label:'Neue Stage 3',          color:'#6366f1', bg:'#EEF2FF', border:'#C7D2FE', prob:65  },
}

// Lade/Speichere Stage-Labels in localStorage (user-spezifisch)
const LABELS_KEY = 'llr_pipeline_labels'
  const ENABLED_KEY = 'llr_pipeline_enabled'
function loadStageLabels() {
  try { return JSON.parse(localStorage.getItem(LABELS_KEY) || '{}') } catch { return {} }
}
function saveStageLabels(labels) {
  localStorage.setItem(LABELS_KEY, JSON.stringify(labels))
}
function loadStageProbs() {
  try { return JSON.parse(localStorage.getItem('llr_pipeline_probs') || '{}') } catch { return {} }
}
function buildStageConfig(customLabels, customProbs) {
  const probs = customProbs || loadStageProbs()
  const cfg = {}
  STAGE_ORDER.forEach(key => {
    cfg[key] = {
      ...DEFAULT_STAGE_CONFIG[key],
      ...(customLabels[key] ? { label: customLabels[key] } : {}),
      ...(probs[key] !== undefined ? { prob: Number(probs[key]) } : {}),
    }
  })
  return cfg
}

function Avatar({ name, avatar_url, size=36 }) {
  const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#0891b2','#ec4899']
  const bg = colors[(name||'').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
  return <div style={{ width:size, height:size, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:size*0.38, flexShrink:0 }}>{(name||'?').substring(0,2).toUpperCase()}</div>
}

function DealCard({ lead, stage, onOpen, onMove, dragging, onDragStart, onDragEnd, stageConfig }) {
  const STAGE_CONFIG = stageConfig || DEFAULT_STAGE_CONFIG
  const cfg = STAGE_CONFIG[stage]
  const nextStages = STAGE_ORDER.filter(s => s !== stage && s !== 'verloren')
  const dealVal = lead.deal_value ? `€${Number(lead.deal_value).toLocaleString('de-DE')}` : null
  const isDragging = dragging === lead.id

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('leadId', lead.id)
        e.dataTransfer.setData('fromStage', stage)
        onDragStart(lead.id)
      }}
      onDragEnd={onDragEnd}
      onClick={() => !isDragging && onOpen(lead)}
      style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #E5E7EB',
        padding: '12px 14px',
        cursor: 'grab',
        marginBottom: 8,
        transition: 'all 0.15s',
        opacity: isDragging ? 0.4 : 1,
        transform: isDragging ? 'scale(0.97)' : 'scale(1)',
        boxShadow: isDragging ? '0 8px 24px rgba(15,23,42,0.15)' : 'none',
        userSelect: 'none',
      }}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,23,42,0.10)' }}
      onMouseLeave={e => { if (!isDragging) e.currentTarget.style.boxShadow = 'none' }}>
      {/* Drag handle hint */}
      <div style={{ position:'absolute', top:8, right:8, color:'#CBD5E1', fontSize:12, pointerEvents:'none', opacity:0.6 }}>⠿</div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <Avatar name={fullName(lead)} avatar_url={lead.avatar_url} size={34}/>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullName(lead)}</div>
          <div style={{ fontSize:11, color:'#64748B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.job_title || lead.headline || ''}</div>
        </div>
        {dealVal && <span style={{ fontSize:12, fontWeight:800, color:'#22c55e', background:'#F0FDF4', padding:'2px 8px', borderRadius:6, flexShrink:0 }}>{dealVal}</span>}
      </div>
      {lead.company && <div style={{ fontSize:11, fontWeight:600, color:cfg.color, marginBottom:6 }}>{lead.company}</div>}
      {lead.ai_pain_points && lead.ai_pain_points.length > 0 && (
        <div style={{ fontSize:10, color:'#64748B', background:'#F8FAFC', borderRadius:6, padding:'4px 8px', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          💡 {lead.ai_pain_points[0]}
        </div>
      )}
      <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
        {lead.li_connection_status === 'verbunden' && <span style={{ fontSize:10, background:'#F0FDF4', color:'#15803D', border:'1px solid #BBF7D0', padding:'1px 7px', borderRadius:99, fontWeight:600 }}>✓ Vernetzt</span>}
        {lead.ai_buying_intent === 'hoch' && <span style={{ fontSize:10, background:'#FEF2F2', color:'#ef4444', border:'1px solid #FECACA', padding:'1px 7px', borderRadius:99, fontWeight:600 }}>🔥 Heiß</span>}
        {lead.hs_score > 0 && <span style={{ fontSize:10, color:'#94A3B8' }}>Score: {lead.hs_score}</span>}
      </div>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:8 }} onClick={e => e.stopPropagation()}>
        {nextStages.slice(0,3).map(s => (
          <button key={s} onClick={() => onMove(lead.id, s)}
            style={{ fontSize:10, padding:'2px 8px', borderRadius:6, border:'1px solid '+STAGE_CONFIG[s].border, background:STAGE_CONFIG[s].bg, color:STAGE_CONFIG[s].color, cursor:'pointer', fontWeight:700 }}>
            → {STAGE_CONFIG[s].label.split('/')[0].trim()}
          </button>
        ))}
        <button onClick={() => onMove(lead.id, 'verloren')}
          style={{ fontSize:10, padding:'2px 8px', borderRadius:6, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#94a3b8', cursor:'pointer', fontWeight:600 }}>✕</button>
      </div>
    </div>
  )
}

function StageColumn({ stageKey, leads, onOpen, onMove, dragging, onDragStart, onDragEnd, dragOver, onDragOver, onDragLeave, onDrop, stageConfig }) {
  const STAGE_CONFIG = stageConfig || DEFAULT_STAGE_CONFIG
  const cfg = STAGE_CONFIG[stageKey]
  const totalValue = leads.reduce((s, l) => s + (Number(l.deal_value)||0), 0)
  const isOver = dragOver === stageKey

  return (
    <div style={{ minWidth:270, width:280, flexShrink:0, display:'flex', flexDirection:'column' }}>
      {/* Column header */}
      <div style={{ background:cfg.bg, border:'1px solid '+cfg.border, borderRadius:14, padding:'12px 14px', marginBottom:10, transition:'all 0.2s', boxShadow: isOver ? '0 0 0 2px '+cfg.color : 'none' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ fontWeight:800, fontSize:14, color:cfg.color }}>{cfg.label}</span>
          <span style={{ fontSize:12, fontWeight:800, padding:'2px 10px', borderRadius:99, background:'rgba(255,255,255,0.8)', color:cfg.color, border:'1px solid '+cfg.border }}>{leads.length}</span>
        </div>
        <div style={{ display:'flex', gap:12, fontSize:11, color:cfg.color, opacity:0.75 }}>
          <span>{cfg.prob}% Wahrscheinlichkeit</span>
          {totalValue > 0 && <span>€{totalValue.toLocaleString('de-DE')}</span>}
        </div>
        <div style={{ height:3, background:'rgba(255,255,255,0.5)', borderRadius:99, marginTop:8, overflow:'hidden' }}>
          <div style={{ height:'100%', width:cfg.prob+'%', background:cfg.color, borderRadius:99, opacity:0.7 }}/>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; onDragOver(stageKey) }}
        onDragLeave={onDragLeave}
        onDrop={e => { e.preventDefault(); onDrop(e, stageKey) }}
        style={{
          flex: 1,
          overflowY: 'auto',
          borderRadius: 12,
          minHeight: 80,
          padding: isOver ? '4px' : '0',
          background: isOver ? cfg.color+'12' : 'transparent',
          border: isOver ? '2px dashed '+cfg.color : '2px dashed transparent',
          transition: 'all 0.15s',
        }}>
        {[...leads].sort((a,b) => (b.hs_score||0)-(a.hs_score||0)).map(lead => (
          <DealCard
            key={lead.id}
            lead={lead}
            stage={stageKey}
            onOpen={onOpen}
            onMove={onMove}
            dragging={dragging}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            stageConfig={STAGE_CONFIG}
          />
        ))}
        {/* Drop hint when empty column is hovered */}
        {isOver && leads.length === 0 && (
          <div style={{ textAlign:'center', padding:'20px 0', color:cfg.color, fontSize:12, fontWeight:600, opacity:0.7 }}>
            Hier ablegen
          </div>
        )}
      </div>
    </div>
  )
}

function LeadDetailModal({ lead, onClose, onMove, onUpdate, stageConfig }) {
  const STAGE_CONFIG = stageConfig || DEFAULT_STAGE_CONFIG
  const [stage, setStage] = useState(lead.deal_stage || 'kein_deal')
  const [dealValue, setDealValue] = useState(lead.deal_value || '')
  const [notes, setNotes] = useState(lead.notes || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      // ENUM deal_stage separat speichern (vermeidet silent failures)
      if (stage !== lead.deal_stage) {
        const { error: stageErr } = await supabase.from('leads')
          .update({ deal_stage: stage, deal_stage_changed_at: new Date().toISOString() })
          .eq('id', lead.id)
        if (stageErr) throw stageErr
      }
      // Plain-Felder separat
      const { error: plainErr } = await supabase.from('leads')
        .update({ deal_value: dealValue ? Number(dealValue) : null, notes: notes || null })
        .eq('id', lead.id)
      if (plainErr) throw plainErr
      onUpdate({ ...lead, deal_stage: stage, deal_value: dealValue, notes })
      onClose()
    } catch (err) {
      console.error('[Pipeline] Save error:', err)
      setSaveError(err.message || 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:20, width:560, maxWidth:'95vw', maxHeight:'88vh', overflow:'auto', boxShadow:'0 24px 64px rgba(15,23,42,0.2)' }} onClick={e => e.stopPropagation()}>
        {/* Error Banner */}
        {saveError && (
          <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', padding:'8px 16px', fontSize:12, color:'#991B1B', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>❌ {saveError}</span>
            <button onClick={() => setSaveError(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#991B1B', fontSize:16 }}>×</button>
          </div>
        )}
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#1e3a8a,#3b82f6)', padding:'24px', borderRadius:'20px 20px 0 0' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
            <Avatar name={fullName(lead)} avatar_url={lead.avatar_url} size={52}/>
            <div>
              <div style={{ fontWeight:800, fontSize:18, color:'#fff' }}>{fullName(lead)}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)', marginTop:2 }}>{lead.job_title || lead.headline}</div>
              {lead.company && <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', fontWeight:600 }}>{lead.company}</div>}
            </div>
          </div>
          {/* Quick stats */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {lead.li_connection_status === 'verbunden' && <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.2)', color:'#fff' }}>✓ Vernetzt</span>}
            {lead.ai_buying_intent && <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.2)', color:'#fff' }}>🎯 Intent: {lead.ai_buying_intent}</span>}
            {lead.hs_score > 0 && <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.2)', color:'#fff' }}>Score: {lead.hs_score}</span>}
          </div>
        </div>
        <div style={{ padding:'24px' }}>
          {/* Pipeline Stage */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Pipeline Stage</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {STAGE_ORDER.map(s => {
                const c = STAGE_CONFIG[s]
                return (
                  <button key={s} onClick={() => { setStage(s); onMove(lead.id, s) }}
                    style={{ padding:'5px 12px', borderRadius:8, border:'1.5px solid '+(stage===s?c.color:c.border), background:stage===s?c.bg:'#fff', color:c.color, fontSize:11, fontWeight:stage===s?800:500, cursor:'pointer' }}>
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>
          {/* Deal Value */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Potenzieller Wert (€)</div>
            <input type="number" value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="z.B. 12000"
              style={{ padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:14, fontFamily:'Inter,sans-serif', outline:'none', width:'100%', background:'#FAFAFA' }}/>
          </div>
          {/* AI Insights */}
          {(lead.ai_need_detected || (lead.ai_pain_points && lead.ai_pain_points.length > 0)) && (
            <div style={{ marginBottom:20, background:'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(59,130,246,0.08))', borderRadius:12, padding:'14px 16px', border:'1px solid rgba(139,92,246,0.2)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#7C3AED', marginBottom:8 }}>🤖 AI-Erkenntnisse</div>
              {lead.ai_need_detected && <div style={{ fontSize:13, color:'#374151', marginBottom:6 }}><b>Bedarf:</b> {lead.ai_need_detected}</div>}
              {lead.ai_pain_points && lead.ai_pain_points.length > 0 && (
                <div style={{ fontSize:13, color:'#374151' }}><b>Pain Points:</b> {lead.ai_pain_points.join(', ')}</div>
              )}
            </div>
          )}
          {/* Notes */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Notizen</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Deal-Notizen..."
              style={{ padding:'10px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', width:'100%', resize:'vertical', background:'#FAFAFA' }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button onClick={onClose} style={{ padding:'9px 20px', borderRadius:10, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Schließen</button>
            <button onClick={save} disabled={saving} style={{ padding:'9px 24px', borderRadius:10, border:'none', background:'#3b82f6', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
              {saving ? '⏳' : '💾 Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────
   STAGE EDITOR MODAL — Reiter umbenennen & hinzufügen
────────────────────────────────────────────────────── */
function StageEditorModal({ stageLabels, onSave, onClose }) {
  const LABELS_KEY_PROB = 'llr_pipeline_probs'
  const savedProbs = (() => { try { return JSON.parse(localStorage.getItem(LABELS_KEY_PROB)||'{}') } catch { return {} } })()
  const savedEnabled = (() => { try {
    const v = localStorage.getItem(ENABLED_KEY)
    if (!v) return null // null = alle enabled (default)
    return JSON.parse(v)
  } catch { return null } })()

  const [stages, setStages] = useState(() =>
    STAGE_ORDER.map((key, i) => ({
      key,
      label:   stageLabels[key] || DEFAULT_STAGE_CONFIG[key].label,
      prob:    savedProbs[key] !== undefined ? savedProbs[key] : DEFAULT_STAGE_CONFIG[key].prob,
      enabled: savedEnabled ? (savedEnabled[key] !== false) : (key !== 'stage_custom1' && key !== 'stage_custom2' && key !== 'stage_custom3'),
      colorIdx: i % STAGE_COLORS.length,
    }))
  )
  const [editingIdx, setEditingIdx]   = useState(null)
  const [editField, setEditField]     = useState(null) // 'label' | 'prob'

  function update(idx, field, val) {
    setStages(s => s.map((st, i) => i === idx ? { ...st, [field]: val } : st))
  }
  function resetOne(idx) {
    const key = stages[idx].key
    setStages(s => s.map((st, i) => i === idx ? {
      ...st,
      label: DEFAULT_STAGE_CONFIG[key]?.label || st.label,
      prob:  DEFAULT_STAGE_CONFIG[key]?.prob ?? st.prob,
    } : st))
  }
  function handleSave() {
    const labels = {}, probs = {}, enabled = {}
    stages.forEach(st => {
      labels[st.key] = st.label
      probs[st.key]  = Number(st.prob)
      enabled[st.key] = st.enabled
    })
    localStorage.setItem(LABELS_KEY_PROB, JSON.stringify(probs))
    localStorage.setItem(ENABLED_KEY, JSON.stringify(enabled))
    onSave(labels, probs, enabled)
  }

  const startEdit = (idx, field) => { setEditingIdx(idx); setEditField(field) }
  const stopEdit  = () => { setEditingIdx(null); setEditField(null) }

  const inpStyle = { padding:'5px 8px', border:'1.5px solid #3B82F6', borderRadius:7, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:20, width:580, maxWidth:'96vw', maxHeight:'92vh', overflow:'auto', boxShadow:'0 24px 64px rgba(15,23,42,0.2)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:'#0F172A' }}>✏ Pipeline-Reiter bearbeiten</div>
            <div style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>Namen und Wahrscheinlichkeit direkt anklicken und bearbeiten</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:22 }}>×</button>
        </div>

        {/* Tabellen-Header */}
        <div style={{ display:'grid', gridTemplateColumns:'12px 1fr 80px 48px 32px', gap:8, padding:'8px 20px', background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>
          <div/>
          <div>Stage-Name</div>
          <div style={{ textAlign:'center' }}>Abschluss %</div>
          <div style={{ textAlign:'center' }}>Aktiv</div>
          <div/>
        </div>

        {/* Stage-Zeilen */}
        <div style={{ padding:'8px 12px' }}>
          {stages.map((st, idx) => {
            const clr   = STAGE_COLORS[st.colorIdx] || STAGE_COLORS[0]
            const defSt = DEFAULT_STAGE_CONFIG[st.key] || {}
            const labelChanged = st.label !== defSt.label
            const probChanged  = Number(st.prob) !== defSt.prob
            const anyChanged   = labelChanged || probChanged
            const isEditLabel  = editingIdx === idx && editField === 'label'
            const isEditProb   = editingIdx === idx && editField === 'prob'

            return (
              <div key={st.key}
                style={{ display:'grid', gridTemplateColumns:'12px 1fr 80px 48px 32px', gap:8, alignItems:'center', padding:'9px 8px', borderRadius:10, marginBottom:4,
                  background: editingIdx===idx ? clr.bg+'60' : '#fff',
                  border: '1px solid '+(editingIdx===idx ? clr.color+'30' : '#E5E7EB'),
                  transition:'all 0.12s' }}>

                {/* Farb-Dot */}
                <div style={{ width:10, height:10, borderRadius:'50%', background:clr.color }}/>

                {/* Name */}
                {isEditLabel ? (
                  <input autoFocus value={st.label} style={{ ...inpStyle, width:'100%' }}
                    onChange={e => update(idx, 'label', e.target.value)}
                    onBlur={stopEdit}
                    onKeyDown={e => (e.key==='Enter'||e.key==='Escape') && stopEdit()}/>
                ) : (
                  <div onClick={() => startEdit(idx, 'label')}
                    style={{ cursor:'text', display:'flex', alignItems:'center', gap:6, padding:'5px 8px', borderRadius:7, border:'1px solid transparent' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor='#E5E7EB'}
                    onMouseLeave={e => e.currentTarget.style.borderColor='transparent'}>
                    <span style={{ fontWeight:600, fontSize:14, color:'#0F172A' }}>{st.label}</span>
                    {labelChanged && <span style={{ fontSize:10, color:clr.color, fontWeight:700, background:clr.bg, padding:'1px 6px', borderRadius:99 }}>✎</span>}
                    <span style={{ fontSize:10, color:'#D1D5DB', fontFamily:'monospace', marginLeft:'auto' }}>{st.key}</span>
                  </div>
                )}

                {/* Wahrscheinlichkeit */}
                {isEditProb ? (
                  <input autoFocus type="number" min="0" max="100" value={st.prob} style={{ ...inpStyle, width:'100%', textAlign:'center' }}
                    onChange={e => update(idx, 'prob', e.target.value)}
                    onBlur={stopEdit}
                    onKeyDown={e => (e.key==='Enter'||e.key==='Escape') && stopEdit()}/>
                ) : (
                  <div onClick={() => startEdit(idx, 'prob')}
                    style={{ cursor:'text', textAlign:'center', padding:'5px 4px', borderRadius:7, border:'1px solid transparent', display:'flex', alignItems:'center', justifyContent:'center', gap:3 }}
                    onMouseEnter={e => e.currentTarget.style.borderColor='#E5E7EB'}
                    onMouseLeave={e => e.currentTarget.style.borderColor='transparent'}>
                    <span style={{ fontWeight:700, fontSize:13, color: probChanged?clr.color:'#374151' }}>{st.prob}%</span>
                  </div>
                )}

                {/* Aktiv-Toggle */}
                <div style={{ display:'flex', justifyContent:'center' }}>
                  <button onClick={() => setStages(s => s.map((x,i) => i===idx ? {...x, enabled:!x.enabled} : x))}
                    title={st.enabled ? 'Deaktivieren' : 'Aktivieren'}
                    style={{ width:38, height:22, borderRadius:11, border:'none', background:st.enabled?clr.color:'#E5E7EB', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                    <div style={{ width:16, height:16, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:st.enabled?19:3, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                  </button>
                </div>

                {/* Reset */}
                <div style={{ display:'flex', justifyContent:'center' }}>
                  {anyChanged ? (
                    <button onClick={() => resetOne(idx)} title="Zurücksetzen"
                      style={{ width:26, height:26, borderRadius:6, border:'1px solid #FDE68A', background:'#FFFBEB', color:'#92400E', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      ↺
                    </button>
                  ) : (
                    <div style={{ width:26 }}/>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Info */}
        <div style={{ margin:'0 20px 12px', padding:'10px 14px', background:'#F0F9FF', borderRadius:10, border:'1px solid #BAE6FD', display:'flex', gap:8, fontSize:12, color:'#0369A1', lineHeight:1.5 }}>
          <span>ℹ️</span>
          <span>Namen und Wahrscheinlichkeit direkt anklicken zum Bearbeiten. Technische Schlüssel (z.B. <code>prospect</code>) bleiben unverändert — alle Leads bleiben korrekt zugeordnet.</span>
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #F1F5F9' }}>
          <button onClick={() => setStages(s => s.map(st => ({ ...st, label: DEFAULT_STAGE_CONFIG[st.key]?.label||st.label, prob: DEFAULT_STAGE_CONFIG[st.key]?.prob??st.prob })))}
            style={{ padding:'8px 16px', borderRadius:10, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Alle zurücksetzen
          </button>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ padding:'9px 20px', borderRadius:10, border:'1px solid #E5E7EB', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              Abbrechen
            </button>
            <button onClick={handleSave}
              style={{ padding:'9px 24px', borderRadius:10, border:'none', background:'#3b82f6', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              ✓ Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Pipeline({ session }) {
  const navigate = useNavigate()
  const [leads, setLeads]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [openLead, setOpenLead]   = useState(null)
  const [view, setView]           = useState('kanban') // kanban | list
  const [dragging, setDragging]   = useState(null)
  const [dragOver, setDragOver]   = useState(null)
  const [showLost,  setShowLost]  = useState(false) // Verloren in Listen-Ansicht anzeigen
  const [stageLabels, setStageLabels] = useState(loadStageLabels)
  const [stageProbs,   setStageProbs]   = useState(loadStageProbs)
  const [stageEnabled, setStageEnabled] = useState(() => {
    try {
      const v = localStorage.getItem('llr_pipeline_enabled')
      if (!v) return null
      return JSON.parse(v)
    } catch { return null }
  })
  const [editStages, setEditStages]    = useState(false)
  const STAGE_CONFIG = buildStageConfig(stageLabels, stageProbs)
  // Nur aktivierte Stages anzeigen
  const ACTIVE_STAGES = STAGE_ORDER.filter(key => {
    if (stageEnabled === null) {
      // Default: nur die 7 Original-Stages aktiv
      return !['stage_custom1','stage_custom2','stage_custom3'].includes(key)
    }
    return stageEnabled[key] !== false
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('leads')
      .select('id,first_name,last_name,name,job_title,headline,company,avatar_url,deal_stage,deal_value,deal_probability,li_connection_status,ai_buying_intent,ai_pain_points,ai_need_detected,hs_score,notes,lifecycle_stage,email,profile_url')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
    setLeads(data || [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  async function handleMove(leadId, newStage) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, deal_stage: newStage } : l))
    await supabase.from('leads').update({ deal_stage: newStage, deal_stage_changed_at: new Date().toISOString() }).eq('id', leadId)
  }

  function handleUpdate(updated) {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
  }

  const filtered = leads.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return (fullName(l)).toLowerCase().includes(q) || (l.company||'').toLowerCase().includes(q) || (l.job_title||'').toLowerCase().includes(q)
  })

  // KPIs
  const total       = leads.length
  const withDeal    = leads.filter(l => l.deal_stage && l.deal_stage !== 'kein_deal').length
  const won         = leads.filter(l => l.deal_stage === 'gewonnen').length
  const pipelineVal = leads.filter(l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage)).reduce((s,l) => s + (Number(l.deal_value)||0), 0)
  const wonVal      = leads.filter(l => l.deal_stage === 'gewonnen').reduce((s,l) => s + (Number(l.deal_value)||0), 0)
  const winRate     = withDeal > 0 ? Math.round(won / withDeal * 100) : 0

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      {/* Top Bar */}
      <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'14px 20px', marginBottom:16, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
        {/* KPI Pills */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {[
            { label:'Gesamt', val:total, color:'#0F172A' },
            { label:'In Pipeline', val:withDeal, color:'#3b82f6' },
            { label:'Win Rate', val:winRate+'%', color:'#22c55e' },
            { label:'Pipeline Wert', val:pipelineVal > 0 ? '€'+pipelineVal.toLocaleString('de-DE') : '—', color:'#f59e0b' },
            { label:'Gewonnen', val:wonVal > 0 ? '€'+wonVal.toLocaleString('de-DE') : won, color:'#22c55e' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign:'center', padding:'6px 14px', background:'#F8FAFC', borderRadius:10, border:'1px solid #E2E8F0', minWidth:70 }}>
              <div style={{ fontSize:18, fontWeight:800, color }}>{val}</div>
              <div style={{ fontSize:10, color:'#94A3B8', fontWeight:600 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..."
            style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, outline:'none', width:200, fontFamily:'inherit' }}/>
          <button onClick={() => setView(v => v==='kanban'?'list':'kanban')}
            style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', background:'#F8FAFC', fontSize:12, fontWeight:700, cursor:'pointer', color:'#475569' }}>
            {view === 'kanban' ? '☰ Liste' : '⬚ Kanban'}
          </button>
          {view === 'list' && (
            <button onClick={() => setShowLost(v => !v)}
              style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid '+(showLost?'#94a3b8':'#E2E8F0'), background:showLost?'#F8FAFC':'#fff', fontSize:12, fontWeight:700, cursor:'pointer', color:showLost?'#475569':'#94A3B8' }}>
              {showLost ? '✓ Mit Verloren' : '✕ Ohne Verloren'}
            </button>
          )}
          {view === 'kanban' && (
            <button onClick={() => setShowLost(v => !v)}
              style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid '+(showLost?'#94a3b8':'#E2E8F0'), background:showLost?'#F8FAFC':'#fff', fontSize:12, fontWeight:700, cursor:'pointer', color:showLost?'#475569':'#94A3B8' }}>
              {showLost ? '✓ Mit Verloren' : '✕ Ohne Verloren'}
            </button>
          )}
          <button onClick={() => setEditStages(true)}
            title="Pipeline-Reiter umbenennen oder hinzufügen"
            style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', background:'#F8FAFC', fontSize:12, fontWeight:700, cursor:'pointer', color:'#475569', display:'flex', alignItems:'center', gap:5 }}>
            ✏ Reiter
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:64, color:'#94A3B8' }}>Lade Pipeline…</div>
      ) : view === 'kanban' ? (
        /* KANBAN VIEW */
        <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:16, flex:1, minHeight:0, alignItems:'flex-start' }}>
          {ACTIVE_STAGES.filter(k => showLost || k !== 'verloren').map(stageKey => (
            <StageColumn
              key={stageKey}
              stageKey={stageKey}
              leads={filtered.filter(l => (l.deal_stage || 'kein_deal') === stageKey)}
              onOpen={setOpenLead}
              onMove={handleMove}
              dragging={dragging}
              onDragStart={id => setDragging(id)}
              onDragEnd={() => { setDragging(null); setDragOver(null) }}
              dragOver={dragOver}
              onDragOver={stageKey => setDragOver(stageKey)}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e, toStage) => {
                const leadId = e.dataTransfer.getData('leadId')
                const fromStage = e.dataTransfer.getData('fromStage')
                if (leadId && toStage !== fromStage) handleMove(leadId, toStage)
                setDragging(null)
                setDragOver(null)
              }}
              stageConfig={STAGE_CONFIG}
            />
          ))}
        </div>
      ) : (
        /* LIST VIEW */
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'auto', flex:1 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'1px solid #E5E7EB' }}>
                {['Name','Unternehmen','Stage','Wert','Score','Intent','Verbindung'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.filter(l => showLost || (l.deal_stage || 'kein_deal') !== 'verloren').map(lead => {
                const stage = STAGE_CONFIG[lead.deal_stage || 'kein_deal']
                return (
                  <tr key={lead.id} onClick={() => setOpenLead(lead)}
                    style={{ borderBottom:'1px solid #F1F5F9', cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <Avatar name={fullName(lead)} avatar_url={lead.avatar_url} size={32}/>
                        <div>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:'#0F172A' }}>{fullName(lead)}</div>
                            <button onClick={e => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }}
                              title="Profil öffnen"
                              style={{ padding:'2px 8px', borderRadius:6, border:'1px solid rgba(49,90,231,0.25)', background:'rgba(49,90,231,0.07)', color:'rgb(49,90,231)', fontSize:10, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                              ↗ Profil
                            </button>
                          </div>
                          <div style={{ fontSize:11, color:'#64748B' }}>{lead.job_title || lead.headline}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:'#374151', fontWeight:600 }}>{lead.company || '—'}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:stage.bg, color:stage.color, border:'1px solid '+stage.border }}>{stage.label}</span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700, color:'#22c55e' }}>
                      {lead.deal_value ? '€'+Number(lead.deal_value).toLocaleString('de-DE') : '—'}
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:'#374151' }}>{lead.hs_score || 0}</td>
                    <td style={{ padding:'12px 16px', fontSize:12 }}>
                      {lead.ai_buying_intent === 'hoch' ? <span style={{ background:'#FEF2F2', color:'#ef4444', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>🔥 Hoch</span>
                        : lead.ai_buying_intent === 'mittel' ? <span style={{ background:'#FFFBEB', color:'#f59e0b', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>⚡ Mittel</span>
                        : '—'}
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12 }}>
                      {lead.li_connection_status === 'verbunden' ? <span style={{ background:'#F0FDF4', color:'#15803D', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>✓ Vernetzt</span>
                        : lead.li_connection_status === 'pending' ? <span style={{ background:'#FFFBEB', color:'#B45309', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>⏳ Ausstehend</span>
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {openLead && (
        <LeadDrawer
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onUpdate={(updated) => { handleUpdate(updated); setOpenLead(updated) }}
          onDelete={(id) => { setLeads(prev => prev.filter(l => l.id !== id)); setOpenLead(null) }}
        />
      )}

      {/* ── Stage-Editor Modal ── */}
      {editStages && (
        <StageEditorModal
          stageLabels={stageLabels}
          onSave={(labels, probs, enabled) => { saveStageLabels(labels); setStageLabels(labels); if(probs) setStageProbs(probs); if(enabled) { localStorage.setItem('llr_pipeline_enabled', JSON.stringify(enabled)); setStageEnabled(enabled) } setEditStages(false) }}
          onClose={() => setEditStages(false)}
        />
      )}
    </div>
  )
}
