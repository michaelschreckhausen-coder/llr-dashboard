import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import GenerationLoading from '../components/GenerationLoading'
import { AlertTriangle, BarChart3, BookOpen, Brain, Briefcase, Calendar, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Copy, Target, Trash2, Eye, FileText, Flame, Hammer, Image as ImageIcon, LayoutGrid, Lightbulb, List, Loader2, MessageCircle, MessageSquare, Paperclip, PenLine, Pencil, Plus, Rocket, Save, Scissors, Search, Share2, Sparkles, ThumbsUp as ThumbsUpIcon, User, Wand2, X, Zap } from 'lucide-react'
import { LinkedinIcon } from '../components/icons'
import { useModel } from '../context/ModelContext'
import { useResponsive } from '../hooks/useResponsive'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sharedEntityIds, sharedBrandVoiceIds, scopeByTeamOrShared, scopeContentByTeamOrSharedBV } from '../lib/teamShares'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { fetchCompanyPromptBlock, fetchCompanyPromptBlocks } from '../lib/companyVoice'
import CompanyMultiSelect from '../components/CompanyMultiSelect'
import PillSelect from '../components/PillSelect'
import { buildAudiencePrompt, buildKnowledgePrompt } from '../lib/audiencePrompt'
import { publishToInstagram } from '../lib/instagram'

// ─── Konstanten ──────────────────────────────────────────────────────────────
const PLATFORMS = {
  linkedin:  { label: 'LinkedIn',  color: '#0A66C2', bg: '#EFF6FF', icon: 'linkedin' },
  instagram: { label: 'Instagram', color: '#E1306C', bg: '#FFF1F7', icon: '📸' },
}

const STATUS = {
  idee:      { label: 'Idee',           color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', bucket: 'ideen' },
  draft:     { label: 'Entwurf',        color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', bucket: 'in_arbeit' },
  in_review: { label: 'Review',         color: '#003060', bg: '#F5F3FF', border: '#DDD6FE', bucket: 'in_arbeit' },
  approved:  { label: 'Freigegeben',    color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', bucket: 'in_arbeit' },
  scheduled: { label: 'Eingeplant',     color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', bucket: 'eingeplant' },
  published: { label: 'Veröffentlicht', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', bucket: 'veroeffentlicht' },
  analyzed:  { label: 'Analysiert',     color: '#7C2D12', bg: '#FEF3C7', border: '#FCD34D', bucket: 'veroeffentlicht' },
  failed:    { label: 'Fehler',         color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', bucket: 'in_arbeit' },
}

const BUCKETS = [
  { key: 'ideen',           label: 'Ideen',           status_default: 'idee',      desc: 'Noch zu entwickeln' },
  { key: 'in_arbeit',       label: 'In Arbeit',       status_default: 'draft',     desc: 'Entwurf, Review, freigegeben' },
  { key: 'eingeplant',      label: 'Eingeplant',      status_default: 'scheduled', desc: 'Auto-Publish wartet auf Termin' },
  { key: 'veroeffentlicht', label: 'Veröffentlicht',  status_default: 'published', desc: 'Live auf LinkedIn' },
]

// (Workspace-Switch entfernt 2026-05-29 — alle Posts laufen unter workspace='personal')

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

// ─── PDF-Icon (eigenes SVG damit es überall gleich aussieht) ───────────────
function PdfDocIcon({ size = 56 }) {
  const h = Math.round(size * 1.28)
  return (
    <svg width={size} height={h} viewBox="0 0 100 128" xmlns="http://www.w3.org/2000/svg" style={{ display:'block' }}>
      {/* Schatten */}
      <rect x="6" y="10" width="84" height="112" rx="6" fill="rgba(0,0,0,0.08)"/>
      {/* Papier */}
      <path d="M4 8 C4 4 7 1 11 1 L72 1 L96 25 L96 117 C96 121 93 124 89 124 L11 124 C7 124 4 121 4 117 Z" fill="#fff" stroke="#E5E7EB" strokeWidth="1"/>
      {/* Eselsohr */}
      <path d="M72 1 L96 25 L72 25 Z" fill="#F1F5F9"/>
      <path d="M72 1 L96 25 L72 25 Z" fill="none" stroke="#E5E7EB" strokeWidth="1"/>
      {/* Roter PDF-Stripe unten */}
      <rect x="14" y="74" width="72" height="28" rx="3" fill="#DC2626"/>
      <text x="50" y="94" textAnchor="middle" fontFamily="-apple-system, system-ui, sans-serif" fontSize="18" fontWeight="800" fill="#fff" letterSpacing="1">PDF</text>
      {/* Zeilen-Andeutung */}
      <rect x="18" y="40" width="54" height="3" rx="1.5" fill="#CBD5E1"/>
      <rect x="18" y="50" width="44" height="3" rx="1.5" fill="#CBD5E1"/>
      <rect x="18" y="60" width="50" height="3" rx="1.5" fill="#CBD5E1"/>
    </svg>
  )
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────
function getCalendarDays(year, month) {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const startDow = (first.getDay() + 6) % 7 // Mo=0
  const days = []
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, -startDow + i + 1)
    days.push({ date: d, current: false })
  }
  for (let i = 1; i <= last.getDate(); i++) {
    days.push({ date: new Date(year, month, i), current: true })
  }
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - last.getDate() - startDow + 1)
    days.push({ date: d, current: false })
  }
  return days
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function relativeDate(d) {
  if (!d) return '—'
  const diff = Math.round((new Date(d) - new Date()) / 86400000)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  if (diff === -1) return 'Gestern'
  if (diff > 0) return `in ${diff}d`
  return `vor ${Math.abs(diff)}d`
}

// ─── Simple Status-Buckets für die UI ─────────────────────────────────────
// DB-Status bleibt unverändert (8 Werte), Anzeige mappt auf 4 simple Buckets.
const STATUS_SIMPLE = {
  idee:      { label: 'Idee',           color: '#64748B', dot: '#94A3B8' },
  draft:     { label: 'Entwurf',        color: '#9A7B0A', dot: '#F59E0B' },
  in_review: { label: 'Entwurf',        color: '#9A7B0A', dot: '#F59E0B' },
  approved:  { label: 'Entwurf',        color: '#9A7B0A', dot: '#F59E0B' },
  scheduled: { label: 'Eingeplant',     color: '#1d4ed8', dot: '#3B82F6' },
  published: { label: 'Veröffentlicht', color: '#047857', dot: '#10B981' },
  analyzed:  { label: 'Veröffentlicht', color: '#047857', dot: '#10B981' },
  failed:    { label: 'Fehler',         color: '#b91c1c', dot: '#EF4444' },
}

// Standard-Tag-Farben (Planner-Stil) — beim ersten Öffnen als leere, umbenennbare Kategorien angelegt.
const DEFAULT_TAG_COLORS = ['#EF4444','#F59E0B','#EAB308','#10B981','#06B6D4','#3B82F6','#0A6FB0','#EC4899']
// Erweiterte Palette für „+ Tag hinzufügen" (die ersten 8 sind die Defaults).
const TAG_PALETTE = ['#EF4444','#F59E0B','#EAB308','#10B981','#06B6D4','#3B82F6','#0A6FB0','#EC4899','#F97316','#84CC16','#14B8A6','#0EA5E9','#0A6FB0','#A855F7','#D946EF','#F43F5E','#64748B','#78716C','#DC2626','#0891B2']

// Kompaktes Tag-Dropdown (rechts neben Status). Fixed positioniert (Modal-overflow schneidet sonst ab).
function TagPicker({ tags = [], selTagIds = [], onToggle, onRename, onPersist, onAddTag }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const ref = useRef(null)
  const btnRef = useRef(null)
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const selected = tags.filter(t => selTagIds.includes(t.id))
  const openMenu = () => {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) {
        const menuH = Math.min(340, 80 + tags.length * 34)
        const below = window.innerHeight - r.bottom
        const up = below < menuH + 12 && r.top > below
        setCoords({ left: Math.max(8, Math.min(r.left, window.innerWidth - 258)), width: Math.max(238, r.width), ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) })
      }
    }
    setOpen(o => !o)
  }
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button className="lk-dd-trigger" ref={btnRef} type="button" onClick={openMenu}
        style={{ width:'100%', minHeight:40, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, boxSizing:'border-box' }}>
        {selected.length === 0
          ? <span style={{ fontSize:13, color:'var(--text-primary)', flex:1, textAlign:'left' }}>Tags wählen…</span>
          : <span style={{ display:'flex', flexWrap:'wrap', gap:4, flex:1, minWidth:0 }}>
              {selected.slice(0, 3).map(t => (
                <span key={t.id} style={{ display:'inline-flex', alignItems:'center', height:16, padding: t.name ? '0 6px' : '0 5px', borderRadius:5, background: t.color + '22', color: t.color, fontSize:10, fontWeight:700, border:'1px solid ' + t.color + '55', maxWidth:78, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.name || <span style={{ width:12, height:5, borderRadius:3, background:t.color, display:'inline-block' }}/>}</span>
              ))}
              {selected.length > 3 && <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', alignSelf:'center' }}>+{selected.length - 3}</span>}
            </span>}
        <ChevronDown size={14} strokeWidth={2} style={{ opacity:0.5, flexShrink:0, marginLeft:'auto' }}/>
      </button>
      {open && coords && (
        <div style={{ position:'fixed', zIndex:1000, left: coords.left, width: coords.width, ...(coords.top != null ? { top: coords.top } : { bottom: coords.bottom }), maxHeight:340, overflowY:'auto', background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 12px 32px rgba(15,23,42,0.16)', padding:6 }}>
          {tags.map(t => {
            const on = selTagIds.includes(t.id)
            return (
              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px', borderRadius:7, background: on ? (t.color + '14') : 'transparent' }}>
                <button type="button" onClick={() => onToggle(t.id)} title={on ? 'Zugewiesen — klick zum Entfernen' : 'Diesem Beitrag zuweisen'}
                  style={{ width:18, height:18, flexShrink:0, borderRadius:5, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', border:'1.5px solid ' + t.color, background: on ? t.color : '#fff', padding:0 }}>
                  {on && <Check size={12} strokeWidth={3} color="#fff" />}
                </button>
                <span style={{ width:12, height:12, borderRadius:4, background:t.color, flexShrink:0 }} />
                <input value={t.name} onChange={e => onRename(t.id, e.target.value)} onBlur={() => onPersist(t.id)}
                  placeholder="Kategorie benennen…"
                  style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', fontSize:12.5, color:'var(--text-primary)', fontFamily:'inherit', padding:'2px 0' }} />
              </div>
            )
          })}
          <button type="button" onClick={onAddTag} className="lk-btn lk-btn-ghost lk-btn-sm" style={{ width:'100%', marginTop:4 }}>
            <Plus size={14} strokeWidth={2} />Tag hinzufügen
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Leadesk-Datepicker (statt hässlichem nativen datetime-local) ────────────
const _DTP_WD = ['Mo','Di','Mi','Do','Fr','Sa','So']
const _DTP_MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
const _dtpNav = { width:30, height:30, borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--text-secondary,#475467)' }
const _dtpLink = { background:'transparent', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12.5, fontWeight:600, padding:'4px 6px' }
function DateTimePicker({ value = '', onChange = () => {} }) {
  const P = 'var(--wl-primary, #0A6FB0)'
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const ref = useRef(null); const btnRef = useRef(null)
  const parsed = value ? new Date(value) : null
  const vp = parsed && !isNaN(parsed) ? parsed : null
  const [view, setView] = useState(() => { const d = vp || new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [time, setTime] = useState(vp ? `${String(vp.getHours()).padStart(2,'0')}:${String(vp.getMinutes()).padStart(2,'0')}` : '09:00')
  useEffect(() => {
    function onDoc(e){ if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const openMenu = () => {
    if (!open) {
      const d = vp || new Date()
      setView({ y: d.getFullYear(), m: d.getMonth() })
      if (vp) setTime(`${String(vp.getHours()).padStart(2,'0')}:${String(vp.getMinutes()).padStart(2,'0')}`)
      const r = btnRef.current?.getBoundingClientRect()
      if (r) {
        const menuH = 360; const below = window.innerHeight - r.bottom
        const up = below < menuH + 12 && r.top > below
        setCoords({ left: Math.max(8, Math.min(r.left, window.innerWidth - 300)), ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) })
      }
    }
    setOpen(o => !o)
  }
  const emit = (y, m, d, t) => {
    const [hh, mm] = (t || '09:00').split(':')
    onChange(`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(parseInt(hh)||0).padStart(2,'0')}:${String(parseInt(mm)||0).padStart(2,'0')}`)
  }
  const pickDay = (d) => emit(view.y, view.m, d, time)
  const changeTime = (t) => { setTime(t); if (vp) emit(vp.getFullYear(), vp.getMonth(), vp.getDate(), t) }
  const prevM = () => setView(v => { const m = v.m - 1; return m < 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m } })
  const nextM = () => setView(v => { const m = v.m + 1; return m > 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m } })
  const firstWd = (new Date(view.y, view.m, 1).getDay() + 6) % 7
  const dim = new Date(view.y, view.m + 1, 0).getDate()
  const today = new Date()
  const isToday = (d) => today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d
  const isSel = (d) => vp && vp.getFullYear() === view.y && vp.getMonth() === view.m && vp.getDate() === d
  const label = vp ? (vp.toLocaleString('de-DE', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) + ' Uhr') : ''
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button className="lk-dd-trigger" ref={btnRef} type="button" onClick={openMenu}
        style={{ width:'100%', minHeight:40, fontFamily:'inherit', display:'flex', alignItems:'center', gap:8, boxSizing:'border-box' }}>
        <Calendar size={14} strokeWidth={1.9} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
        <span style={{ flex:1, minWidth:0, textAlign:'left', fontSize:13, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label || 'Datum & Uhrzeit'}</span>
        <ChevronDown size={14} strokeWidth={2} style={{ opacity:0.5, flexShrink:0 }}/>
      </button>
      {open && coords && (
        <div style={{ position:'fixed', zIndex:1000, left: coords.left, width:284, ...(coords.top != null ? { top: coords.top } : { bottom: coords.bottom }), background:'#fff', border:'1px solid var(--border)', borderRadius:14, boxShadow:'0 16px 40px rgba(15,23,42,0.18)', padding:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <button type="button" onClick={prevM} style={_dtpNav}><ChevronLeft size={16} strokeWidth={2.2}/></button>
            <span style={{ fontSize:13.5, fontWeight:700, color:'var(--text-primary)' }}>{_DTP_MONTHS[view.m]} {view.y}</span>
            <button type="button" onClick={nextM} style={_dtpNav}><ChevronRight size={16} strokeWidth={2.2}/></button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
            {_DTP_WD.map(w => <div key={w} style={{ textAlign:'center', fontSize:10.5, fontWeight:700, color:'var(--text-muted)' }}>{w}</div>)}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
            {Array.from({ length: firstWd }).map((_, i) => <div key={'e' + i} />)}
            {Array.from({ length: dim }).map((_, i) => { const d = i + 1; const sel = isSel(d); const td = isToday(d); return (
              <button key={d} type="button" onClick={() => pickDay(d)}
                style={{ height:32, borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:12.5, fontWeight: sel ? 700 : 500,
                  border: td && !sel ? '1.5px solid ' + P : '1.5px solid transparent',
                  background: sel ? 'var(--primary)' : 'transparent', color: sel ? '#fff' : 'var(--text-primary)' }}>{d}</button>
            )})}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)' }}>
            <Clock size={14} strokeWidth={1.9} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
            <input type="time" value={time} onChange={e => changeTime(e.target.value)}
              style={{ flex:1, height:34, padding:'0 10px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', outline:'none', color:'var(--text-primary)', boxSizing:'border-box' }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:10 }}>
            <button type="button" onClick={() => { onChange(''); setOpen(false) }} style={{ ..._dtpLink, color:'#b91c1c' }}>Löschen</button>
            <button type="button" onClick={() => setOpen(false)} style={{ ..._dtpLink, color:P, fontWeight:700 }}>Übernehmen</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({ post, onClick, compact, showBVBadge, tagMap = {} }) {
  const sts = STATUS_SIMPLE[post.status] || STATUS_SIMPLE.idee
  const plt = PLATFORMS[post.platform] || PLATFORMS.linkedin
  const hasContent = !!(post.content || '').trim()
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('postId', post.id)}
      onClick={() => onClick(post)}
      style={{
        background:'var(--surface,#fff)',
        borderRadius: compact ? 8 : 12,
        border:'1px solid var(--border,#E5E7EB)',
        padding: compact ? '8px 12px' : '14px 16px',
        cursor:'pointer', transition:'all 0.15s', marginBottom: compact ? 6 : 10,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.06)'; e.currentTarget.style.borderColor = 'rgba(10,111,176,0.25)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border,#E5E7EB)' }}>
      {/* Status + Plattform + Tags in einer Reihe */}
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:6, marginBottom: compact ? 4 : 6 }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background: sts.dot, flexShrink:0 }}/>
          <span style={{ fontSize:11, fontWeight:600, color: sts.color }}>{sts.label}</span>
        </span>
        <span style={{ fontSize:10, fontWeight:700, color: plt.color, background: plt.bg, padding:'2px 7px', borderRadius:5, whiteSpace:'nowrap' }}>{plt.label}</span>
        {Array.isArray(post.tag_ids) && post.tag_ids.map(id => { const t = tagMap[id]; if (!t) return null; return (
          <span key={id} title={t.name || 'Tag'} style={{ display:'inline-flex', alignItems:'center', height:16, padding: t.name ? '0 7px' : '0 6px', borderRadius:5, background: t.color + '22', color: t.color, fontSize:10, fontWeight:700, border:'1px solid ' + t.color + '55', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {t.name || <span style={{ width:14, height:6, borderRadius:3, background:t.color, display:'inline-block' }}/>}
          </span>
        )})}
        {showBVBadge && post.bv_name && (
          <span style={{ marginLeft:'auto', fontSize:10, fontWeight:600, color:'var(--text-muted)', background:'#F1F5F9', padding:'2px 7px', borderRadius:5, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {post.bv_name}
          </span>
        )}
      </div>
      {/* Datum + Uhrzeit direkt unter der Meta-Reihe */}
      {!compact && post.scheduled_at && (
        <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8 }}>
          {new Date(post.scheduled_at).toLocaleDateString('de-DE', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
          {' · '}<span style={{ color: new Date(post.scheduled_at) < new Date() && post.status !== 'published' ? '#ef4444' : 'var(--text-muted)' }}>
            {relativeDate(post.scheduled_at)}
          </span>
        </div>
      )}
      {/* Titel */}
      <div style={{
        fontSize: compact ? 13 : 14, fontWeight:600, color:'rgb(20,20,43)',

        lineHeight:1.35, overflow:'hidden', textOverflow:'ellipsis',
        display:'-webkit-box', WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient:'vertical',
      }}>{post.title || '(Kein Titel)'}</div>
      {/* Content-Preview (klein, nur wenn vorhanden) */}
      {!compact && hasContent && (
        <div style={{
          fontSize:12, color:'var(--text-muted)', marginTop:6, lineHeight:1.5,
          overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box',
          WebkitLineClamp:2, WebkitBoxOrient:'vertical',
        }}>{post.content}</div>
      )}
      {/* Queue-Status nur wenn aktiv */}
      {!compact && post.publish_queue_status && ['pending','in_progress','failed'].includes(post.publish_queue_status) && (
        <div style={{ fontSize:10, marginTop:6, fontWeight:600, color:
            post.publish_queue_status === 'pending'     ? '#9A7B0A' :
            post.publish_queue_status === 'in_progress' ? '#1d4ed8' :
            '#b91c1c' }}>
          {post.publish_queue_status === 'pending'     && <span style={{display:'inline-flex',alignItems:'center',gap:4}}><Loader2 size={11} className='lk-spin'/>Auto-Publish geplant</span>}
          {post.publish_queue_status === 'in_progress' && <span style={{display:'inline-flex',alignItems:'center',gap:4}}><Rocket size={11} strokeWidth={1.75}/>Wird gepostet…</span>}
          {post.publish_queue_status === 'failed'      && <span style={{display:'inline-flex',alignItems:'center',gap:4}}><AlertTriangle size={11} strokeWidth={1.75}/>Auto-Publish fehlgeschlagen</span>}
        </div>
      )}
    </div>
  )
}

// ─── PostModal ────────────────────────────────────────────────────────────────
function PostModal({ post, onClose, onSave, onDelete, session, activeTeamId, members, workspace, selectedModel, activeBrandVoice, navigate, teamTags = [], onTagsChanged = () => {} }) {
  const { isMobile } = useResponsive()
  const { brandVoices: __allBVs } = useBrandVoice()
  const companyVoices = (__allBVs || []).filter(v => v.account_type === 'company_page')
  // Tags (Planner-Stil): team-weite Farb-Labels + Zuweisung pro Post
  const [tags, setTags] = useState(teamTags)
  useEffect(() => { setTags(teamTags) }, [teamTags])
  const [selTagIds, setSelTagIds] = useState(Array.isArray(post?.tag_ids) ? post.tag_ids : [])
  const toggleTag = (id) => setSelTagIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const renameTagLocal = (id, name) => setTags(prev => prev.map(t => t.id === id ? { ...t, name } : t))
  async function persistTag(id) {
    const t = tags.find(x => x.id === id); if (!t) return
    await supabase.from('content_tags').update({ name: t.name, updated_at: new Date().toISOString() }).eq('id', id)
    onTagsChanged()
  }
  async function syncTags(postId) {
    if (!postId) return
    await supabase.from('content_post_tags').delete().eq('post_id', postId)
    if (selTagIds.length) await supabase.from('content_post_tags').insert(selTagIds.map(tid => ({ post_id: postId, tag_id: tid })))
  }
  async function addTag() {
    const used = new Set(tags.map(t => t.color))
    const nextColor = TAG_PALETTE.find(c => !used.has(c)) || ('#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'))
    const { data, error } = await supabase.from('content_tags').insert({ team_id: activeTeamId, name: '', color: nextColor, position: tags.length }).select().single()
    if (!error && data) { setTags(prev => [...prev, data]); setSelTagIds(prev => [...prev, data.id]); onTagsChanged() }
  }
  const isNew = !post?.id
  const [form, setForm] = useState({
    title: '', content: '', platform: 'linkedin', status: 'idee',
    notes: '', assignee_id: '', reviewer_id: '',
    // brand_voice_id ist NOT NULL in DB — fallback auf aktive BV bei neuen Posts
    brand_voice_id: post?.brand_voice_id || activeBrandVoice?.id || '',
    target_audience_id: '', hook: '', topic: '',
    company_voice_id: post?.company_voice_id || '',
    company_voice_ids: post?.company_voice_ids || (post?.company_voice_id ? [post.company_voice_id] : []),
    workspace: workspace,
    team_id: activeTeamId,
    ...post,
    tags: Array.isArray(post?.tags) ? post.tags.join(', ') : (post?.tags || ''),
    scheduled_at: post?.scheduled_at ? post.scheduled_at.slice(0,16) : '',
  })
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Phase 2a: Person-Posts optional über Unipile veröffentlichen (statt Julians nativer
  // LinkedIn-OAuth-Route) — schaltet Reichweiten-Monitoring frei. Default AUS.
  const [viaUnipile, setViaUnipile] = useState(false)
  const [generatingVisual, setGeneratingVisual] = useState(false)
  // Multi-Visual: Array statt Singular. Jedes Element: { id (visual_id), signed_url, prompt, position }
  const [postVisuals, setPostVisuals] = useState([])
  const [originalVisualIds, setOriginalVisualIds] = useState([])  // beim Load gesetzt, für Save-Diff
  const [visualPickerOpen, setVisualPickerOpen] = useState(false)
  const [libraryVisuals, setLibraryVisuals] = useState([])
  const [libraryVisualsLoading, setLibraryVisualsLoading] = useState(false)

  // Lade Post-Visuals via Junction-Tabelle. Fallback: content_posts.visual_id
  useEffect(() => {
    if (!post?.id) { setPostVisuals([]); setOriginalVisualIds([]); return }
    ;(async () => {
      // 1) Junction laden
      const { data: junction } = await supabase
        .from('content_post_visuals')
        .select('visual_id, position, visuals(*)')
        .eq('post_id', post.id)
        .order('position', { ascending: true })
      let rows = (junction || []).filter(r => r.visuals).map(r => ({
        ...r.visuals,
        position: r.position,
      }))
      // 2) Legacy: wenn Junction leer aber content_posts.visual_id gesetzt — fallback
      if (rows.length === 0 && post?.visual_id) {
        const { data: v } = await supabase.from('visuals').select('*').eq('id', post.visual_id).maybeSingle()
        if (v) rows = [{ ...v, position: 0 }]
      }
      // 3) Signed-URLs holen
      const withUrls = await Promise.all(rows.map(async (v) => {
        const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24)
        return { ...v, signed_url: signed?.signedUrl }
      }))
      setPostVisuals(withUrls)
      setOriginalVisualIds(withUrls.map(v => v.id))
    })()
  }, [post?.id, post?.visual_id])

  // Sync Visuals nach Save: Diff zwischen original und current
  async function syncVisuals(postId) {
    if (!postId) return
    const currentIds = postVisuals.map(v => v.id)
    const toAdd    = currentIds.filter(id => !originalVisualIds.includes(id))
    const toRemove = originalVisualIds.filter(id => !currentIds.includes(id))
    if (toAdd.length) {
      const rows = toAdd.map(id => {
        const v = postVisuals.find(x => x.id === id)
        const idx = postVisuals.findIndex(x => x.id === id)
        return {
          post_id: postId, visual_id: id, team_id: activeTeamId,
          position: idx, created_by: session.user.id,
        }
      })
      const { error } = await supabase.from('content_post_visuals').insert(rows)
      if (error) console.warn('[visual-insert]', error)
    }
    if (toRemove.length) {
      const { error } = await supabase.from('content_post_visuals')
        .delete()
        .eq('post_id', postId)
        .in('visual_id', toRemove)
      if (error) console.warn('[visual-delete]', error)
    }
    // Position-Updates für bleibende Visuals
    for (let i = 0; i < postVisuals.length; i++) {
      const v = postVisuals[i]
      if (originalVisualIds.includes(v.id)) {
        await supabase.from('content_post_visuals')
          .update({ position: i })
          .eq('post_id', postId)
          .eq('visual_id', v.id)
      }
    }
    // content_posts.visual_id auf das Cover-Visual (Position 0) setzen
    const coverVisualId = postVisuals[0]?.id || null
    await supabase.from('content_posts').update({ visual_id: coverVisualId }).eq('id', postId)
    setOriginalVisualIds(currentIds)
  }

  function moveVisual(idx, direction) {
    setPostVisuals(prev => {
      const next = [...prev]
      const newIdx = idx + direction
      if (newIdx < 0 || newIdx >= next.length) return prev
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
  }
  function removeVisualFromPost(visualId) {
    setPostVisuals(prev => prev.filter(v => v.id !== visualId))
  }

  // Hover-State pro Bild (für Download/Bearbeiten-Overlay)
  const [hoveredVisualId, setHoveredVisualId] = useState(null)
  // Lightbox-Index für LinkedIn-Vorschau-Click-through (null = closed)
  const [previewLightboxIdx, setPreviewLightboxIdx] = useState(null)
  // Notizen + Kommentare zusammen ausklappbar (default eingeklappt)
  const [notesAndCommentsOpen, setNotesAndCommentsOpen] = useState(false)
  // Keyboard-Nav für die Lightbox
  useEffect(() => {
    if (previewLightboxIdx === null) return
    function onKey(e) {
      if (e.key === 'Escape') setPreviewLightboxIdx(null)
      else if (e.key === 'ArrowLeft')  setPreviewLightboxIdx(i => i > 0 ? i - 1 : i)
      else if (e.key === 'ArrowRight') setPreviewLightboxIdx(i => i < postVisuals.length - 1 ? i + 1 : i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewLightboxIdx, postVisuals.length])

  // Direkt-Download (Blob, wie in Visuals.jsx)
  async function downloadPostVisual(v) {
    try {
      if (!v?.storage_path) { alert('Kein Storage-Pfad'); return }
      const { data: blob, error } = await supabase.storage.from('visuals').download(v.storage_path)
      if (error || !blob) { alert('Download fehlgeschlagen: ' + (error?.message || '')); return }
      const ext = (v.storage_path.split('.').pop() || 'png').toLowerCase()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `leadesk-visual-${v.id}.${ext}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (e) { alert('Download-Fehler: ' + (e.message || '')) }
  }

  // Navigation in die Visual-Werkstatt mit direktem Edit-Modal für dieses Bild
  function openVisualInEditor(v) {
    if (!navigate) return
    navigate('/visuals?edit=' + v.id)
    onClose()
  }

  // ─── Datei-Upload (Bilder, Videos, PDFs) ──────────────────────────────────
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const fileInputRef = useRef(null)
  async function uploadMediaFiles(files) {
    // Resilienter Fallback: form.brand_voice_id, sonst activeBrandVoice.id
    const bvId = form.brand_voice_id || activeBrandVoice?.id
    console.log('[uploadMediaFiles] start', JSON.stringify({
      fileCount: files?.length,
      activeTeamId,
      formBV: form.brand_voice_id,
      ctxBV: activeBrandVoice?.id,
      resolvedBV: bvId,
    }))
    if (!files?.length) { console.warn('[uploadMediaFiles] STOP no files'); return }
    if (!activeTeamId)  {
      console.error('[uploadMediaFiles] STOP no team')
      alert('Kein Team aktiv — bitte oben rechts ein Team wählen')
      return
    }
    if (!bvId) {
      console.error('[uploadMediaFiles] STOP no brand voice', { formBV: form.brand_voice_id, ctxBV: activeBrandVoice?.id })
      alert('Keine Brand Voice aktiv — bitte oben rechts eine Brand Voice wählen')
      return
    }
    console.log('[uploadMediaFiles] validation OK, continuing')
    setUploadingMedia(true)
    try {
      let resizeFn
      try { resizeFn = (await import('../lib/imageResize')).resizeImageBeforeUpload } catch {}
      const newOnes = []
      for (const file of Array.from(files)) {
        console.log('[uploadMediaFiles] processing file', { name: file.name, type: file.type, size: file.size })
        if (file.size > 500 * 1024 * 1024) { alert(`${file.name}: max 500 MB`); continue }
        let mediaType = 'document'
        if (file.type.startsWith('image/')) mediaType = 'image'
        else if (file.type.startsWith('video/')) mediaType = 'video'
        else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) mediaType = 'document'
        else if (/\.(mp4|mov|webm|avi)$/i.test(file.name)) mediaType = 'video'
        else if (/\.(png|jpe?g|webp|svg)$/i.test(file.name)) mediaType = 'image'
        console.log('[uploadMediaFiles] media-type detected:', mediaType)
        // Bild-Resize
        let uploadFile = file
        if (mediaType === 'image' && resizeFn) {
          try { uploadFile = await resizeFn(file, 1500, 0.85) } catch (e) { console.warn('[upload-resize]', e.message) }
        }
        // Storage-Path + content-type (mit Fallback wenn file.type leer)
        const ext = (file.name.split('.').pop() || (mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'pdf')).toLowerCase()
        const contentType = file.type
          || (mediaType === 'document' ? 'application/pdf'
              : mediaType === 'video' ? `video/${ext === 'mov' ? 'quicktime' : ext}`
              : `image/${ext === 'jpg' ? 'jpeg' : ext}`)
        const visualId = crypto.randomUUID()
        const path = `${activeTeamId}/uploads/${visualId}.${ext}`
        console.log('[uploadMediaFiles] uploading to storage', { path, contentType, size: uploadFile.size })
        const { error: upErr } = await supabase.storage.from('visuals').upload(path, uploadFile, { contentType, upsert: false })
        if (upErr) {
          console.error('[uploadMedia] storage error', file.name, upErr)
          alert(`Upload ${file.name} fehlgeschlagen: ${upErr.message}`)
          continue
        }
        console.log('[uploadMediaFiles] storage upload OK', path)
        // DB-Insert in visuals
        const { data: visualRow, error: insErr } = await supabase.from('visuals').insert({
          id: visualId,
          user_id: session.user.id,
          team_id: activeTeamId,
          brand_voice_id: bvId,
          prompt: file.name,
          resolved_prompt: file.name,
          aspect_ratio: '1:1',
          model: 'upload',
          storage_path: path,
          media_type: mediaType,
          original_filename: file.name,
          file_size_bytes: file.size,
          mime_type: file.type,
        }).select().single()
        if (insErr) { console.warn('[upload-insert]', insErr); continue }
        // Signed-URL für lokale Anzeige
        const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(path, 60 * 60 * 24)
        newOnes.push({ ...visualRow, signed_url: signed?.signedUrl || null })
      }
      if (newOnes.length) setPostVisuals(prev => [...prev, ...newOnes])
    } finally {
      setUploadingMedia(false)
    }
  }

  // Library-Visuals laden für den Picker
  async function openVisualPicker() {
    setVisualPickerOpen(true)
    setLibraryVisualsLoading(true)
    const _sharedBv = await sharedBrandVoiceIds(activeTeamId)
    let q = scopeContentByTeamOrSharedBV(supabase.from('visuals').select('*'), activeTeamId, _sharedBv)
      .eq('is_archived', false)
      .order('is_favorite', { ascending: false })
      .order('created_at',  { ascending: false })
      .limit(60)
    if (form.brand_voice_id) q = q.eq('brand_voice_id', form.brand_voice_id)
    const { data } = await q
    const withUrls = await Promise.all((data || []).map(async (v) => {
      const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24)
      return { ...v, signed_url: signed?.signedUrl }
    }))
    setLibraryVisuals(withUrls)
    setLibraryVisualsLoading(false)
  }
  function addVisualToPost(visual) {
    if (postVisuals.some(v => v.id === visual.id)) return
    setPostVisuals(prev => [...prev, visual])
  }

  async function generateVisualForPost() {
    if (!form.content?.trim() || !activeTeamId) return
    setGeneratingVisual(true)
    try {
      const { data: promptData } = await supabase.functions.invoke('generate', {
        body: { type: 'visual_prompt', prompt: 'Extrahiere aus diesem LinkedIn-Post einen kurzen Visual-Prompt fuer einen Bildgenerator. Beschreibe was visuell zu sehen ist (Personen, Szenerie, Stimmung, Komposition). Max 50 Wörter, kein Vorwort, kein Anfuehrungszeichen, einfach den Prompt:\n\n' + form.content.slice(0, 2000), userId: session.user.id }
      })
      const visualPrompt = (promptData?.text || promptData?.result || form.content.slice(0, 200)).trim()
      const { data: imgData, error: imgErr } = await supabase.functions.invoke('generate-image', {
        body: { prompt: visualPrompt, aspectRatio: '1:1', variants: 1, brandVoiceId: form.brand_voice_id || activeBrandVoice?.id, companyVoiceIds: form.company_voice_ids || [], postId: post?.id || null }
      })
      if (imgErr) throw imgErr
      const v = imgData?.visuals?.[0]
      if (v) setPostVisuals(prev => [...prev, v])
    } catch (e) {
      console.error('[generateVisualForPost]', e)
      alert('Fehler bei Bild-Generierung: ' + (e.message || 'Unbekannt'))
    } finally {
      setGeneratingVisual(false)
    }
  }

  // Load Comments
  useEffect(() => {
    if (!post?.id) return
    setCommentsLoading(true)
    supabase.from('content_post_comments').select('*').eq('post_id', post.id).order('created_at', { ascending: true }).then(({ data }) => {
      setComments(data || [])
      setCommentsLoading(false)
    })
  }, [post?.id])

  // Kommentar-Mentions: wer in der Comment-Textarea per @ getaggt wurde
  // → wird beim Senden des Kommentars in content_post_mentions persistiert
  // (gleiche Tabelle wie Post-Mentions, damit CRM/Aufgaben-Sicht alles auf einmal sieht)
  const [commentMentions, setCommentMentions] = useState([])
  const [commentMentionPickerOpen, setCommentMentionPickerOpen] = useState(false)

  function addCommentMention(member) {
    if (commentMentions.some(x => x.user_id === member.user_id)) {
      setCommentMentionPickerOpen(false); return
    }
    const label = memberLabel(member)
    setCommentMentions(prev => [...prev, { user_id: member.user_id, label }])
    const insert = '@' + label.replace(/\s+/g, '')
    const sep = (newComment || '').endsWith(' ') || !newComment ? '' : ' '
    setNewComment((newComment || '') + sep + insert + ' ')
    setCommentMentionPickerOpen(false)
  }

  async function addComment() {
    if (!newComment.trim() || !post?.id) return
    const { data } = await supabase.from('content_post_comments').insert({
      post_id: post.id, user_id: session.user.id, team_id: activeTeamId,
      body: newComment.trim()
    }).select().single()
    if (data) { setComments(p => [...p, data]); setNewComment('') }
    // Aus dem Kommentar getaggte User auch in content_post_mentions persistieren
    // (Idempotent dank Unique-Constraint auf post_id+user_id)
    if (commentMentions.length) {
      const rows = commentMentions
        .filter(cm => !originalMentionUserIds.includes(cm.user_id) && !mentions.some(m => m.user_id === cm.user_id))
        .map(cm => ({ post_id: post.id, user_id: cm.user_id, team_id: activeTeamId, created_by: session.user.id }))
      if (rows.length) {
        const { error } = await supabase.from('content_post_mentions').insert(rows)
        if (!error) {
          // Lokale Mentions-Liste mitnachziehen, damit sie als zugeordnete Team-Mitglieder erscheinen
          setMentions(prev => [...prev, ...commentMentions.filter(cm => !prev.some(p => p.user_id === cm.user_id))])
          setOriginalMentionUserIds(ids => [...ids, ...rows.map(r => r.user_id)])
        }
      }
      setCommentMentions([])
    }
  }

  const [saving, setSaving] = useState(false)
  const [improving, setImproving] = useState(false)
  const [charCount, setCharCount] = useState(form.content?.length || 0)
  // LinkedIn-Vorschau hinter Toggle + BV-Daten (kein hardcoded "Michael Schreck")
  const [showPreview, setShowPreview] = useState(false)
  const [previewBV, setPreviewBV] = useState(null)
  // Scheduling/Publishing + Company-Auswahl nur bei Personal Brands (Company-Posting technisch noch nicht)
  const isPersonalPost = (previewBV ? previewBV.account_type !== 'company_page' : activeBrandVoice?.account_type !== 'company_page')
  // BV-Profil laden basierend auf form.brand_voice_id (für LinkedIn-Vorschau)
  useEffect(() => {
    if (!form.brand_voice_id) { setPreviewBV(null); return }
    supabase.from('brand_voices')
      .select('id, name, account_type, linkedin_display_name, linkedin_avatar_url, linkedin_url, linkedin_member_id')
      .eq('id', form.brand_voice_id).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('[preview-bv]', error)
        setPreviewBV(data || null)
      })
  }, [form.brand_voice_id])

  // LinkedIn-Verbindung der Brand prüfen (für „posten/planen"-Buttons)
  const [liConnected, setLiConnected] = useState(false)
  useEffect(() => {
    if (!form.brand_voice_id) { setLiConnected(false); return }
    let cancelled = false
    supabase.rpc('bv_linkedin_connected', { bv_id: form.brand_voice_id })
      .then(({ data }) => { if (!cancelled) setLiConnected(!!data) })
      .catch(() => { if (!cancelled) setLiConnected(false) })
    return () => { cancelled = true }
  }, [form.brand_voice_id])

  // ─── Mentions (@-Erwähnungen von Team-Membern) ──────────────────────────
  // Lokale UI-Liste; wird beim Save in content_post_mentions gesynct.
  // Shape: [{ user_id, label }]
  const [mentions, setMentions] = useState([])
  const [originalMentionUserIds, setOriginalMentionUserIds] = useState([])  // beim Load gesetzt
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false)

  // Privacy-Filter: nur wenn die Post-BV mit dem Team geteilt ist (is_shared=true)
  // sollen Team-Member als Mentions auswählbar sein. Bei privater BV sieht das Team
  // den Post sowieso nicht (RLS), daher wäre eine Mention nutzlos und verwirrend.
  const [postBVShared, setPostBVShared] = useState(null) // null = unklar, true/false = bekannt
  useEffect(() => {
    const bvId = form.brand_voice_id
    if (!bvId) { setPostBVShared(false); return }
    // Cache-Hit: aktive BV im Context entspricht der Post-BV
    if (activeBrandVoice?.id === bvId && typeof activeBrandVoice.is_shared !== 'undefined') {
      setPostBVShared(!!activeBrandVoice.is_shared)
      return
    }
    // Sonst frisch aus DB ziehen
    ;(async () => {
      const { data } = await supabase.from('brand_voices').select('is_shared').eq('id', bvId).maybeSingle()
      setPostBVShared(!!data?.is_shared)
    })()
  }, [form.brand_voice_id, activeBrandVoice])

  // Mention-Member-Liste:
  // - BV mit Team geteilt   → alle Team-Member (inkl. self)
  // - BV NICHT geteilt      → nur self (Owner kann sich selbst markieren, andere sehen
  //                            den Post wegen RLS sowieso nicht)
  const mentionableMembers = postBVShared
    ? (members || [])
    : (members || []).filter(m => m.user_id === session?.user?.id)
  function memberLabel(m) {
    // TeamContext liefert m.profile = { full_name, email, avatar_url }
    return m.profile?.full_name?.trim()
      || m.profile?.email
      || m.email
      || m.user_id?.slice(0, 8)
      || '?'
  }
  function memberAvatarUrl(m) {
    return m.profile?.avatar_url || null
  }
  function memberInitials(m) {
    const label = memberLabel(m)
    return label.split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  }

  // Load existing mentions wenn Post bekannt ist
  useEffect(() => {
    if (!post?.id) { setMentions([]); setOriginalMentionUserIds([]); return }
    ;(async () => {
      const { data } = await supabase.from('content_post_mentions')
        .select('user_id')
        .eq('post_id', post.id)
      const ids = (data || []).map(r => r.user_id)
      setOriginalMentionUserIds(ids)
      // Zugehörige Labels aus members-Liste
      const list = ids.map(uid => {
        const m = (members || []).find(x => x.user_id === uid)
        return { user_id: uid, label: m ? memberLabel(m) : uid.slice(0, 8) }
      })
      setMentions(list)
    })()
  }, [post?.id, members?.length])

  function addMention(member) {
    if (mentions.some(x => x.user_id === member.user_id)) return
    const label = memberLabel(member)
    setMentions(prev => [...prev, { user_id: member.user_id, label }])
    // Im Textfeld @Name anfügen
    const insert = '@' + label.replace(/\s+/g, '')
    const sep = (form.content || '').endsWith(' ') || !form.content ? '' : ' '
    upd('content', (form.content || '') + sep + insert + ' ')
    setMentionPickerOpen(false)
  }
  function removeMention(userId) {
    setMentions(prev => prev.filter(x => x.user_id !== userId))
  }

  // Helper: Post speichern (falls neu/dirty) → Navigate zu Textwerkstatt
  // mode: 'auto' | 'improve' — mode-Param wird in der URL übergeben
  async function jumpToTextStudio(mode = 'auto') {
    let postId = post?.id
    if (!postId) {
      if (!form.title?.trim()) { alert('Titel zuerst ausfüllen.'); return }
      setSaving(true)
      const { data: newPost, error } = await supabase.from('content_posts').insert({
        user_id: session.user.id,
        team_id: form.team_id || activeTeamId,
        workspace: form.workspace || workspace,
        brand_voice_id: activeBrandVoice?.noBrand ? null : (form.brand_voice_id || activeBrandVoice?.id || null),
        no_brand: !!activeBrandVoice?.noBrand,
        title: form.title.trim(),
        content: form.content || '',
        platform: 'linkedin',
        status: form.status || 'idee',
      }).select().single()
      setSaving(false)
      if (error) { alert('Speichern fehlgeschlagen: ' + error.message); return }
      postId = newPost.id
      if (onSave) onSave(newPost)
    } else if (form.content !== post.content || form.title !== post.title) {
      await supabase.from('content_posts').update({
        title: form.title, content: form.content,
      }).eq('id', postId)
    }
    const params = new URLSearchParams({ post_id: postId })
    if (mode === 'improve') params.set('mode', 'improve')
    if (navigate) navigate('/content-studio?' + params.toString())
    onClose()
  }

  // Mention-Sync nach Save: Diff zwischen original und current Mentions
  async function syncMentions(postId) {
    if (!postId) return
    const currentIds = mentions.map(m => m.user_id)
    const toAdd    = currentIds.filter(uid => !originalMentionUserIds.includes(uid))
    const toRemove = originalMentionUserIds.filter(uid => !currentIds.includes(uid))
    if (toAdd.length) {
      const rows = toAdd.map(uid => ({
        post_id: postId, user_id: uid, team_id: activeTeamId, created_by: session.user.id,
      }))
      const { error } = await supabase.from('content_post_mentions').insert(rows)
      if (error) console.warn('[mention-insert]', error)
    }
    if (toRemove.length) {
      const { error } = await supabase.from('content_post_mentions')
        .delete()
        .eq('post_id', postId)
        .in('user_id', toRemove)
      if (error) console.warn('[mention-delete]', error)
    }
    setOriginalMentionUserIds(currentIds)
  }

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const plt = PLATFORMS[form.platform] || PLATFORMS.linkedin

  const CHAR_LIMITS = { linkedin: 3000 }
  const limit = CHAR_LIMITS[form.platform]

  async function save() {
    setSaving(true)
    const user = session.user

    // Whitelist: nur Felder die tatsächlich auf content_posts existieren.
    // Verhindert Schema-Cache-Fehler bei Legacy-Feldern (z.B. lead_id) und
    // bei UI-only Embed-Feldern (publish_queue_status, bv_name etc.).
    const ALLOWED_FIELDS = [
      'user_id','team_id','workspace','brand_voice_id','target_audience_id','company_voice_id','company_voice_ids',
      'assignee_id','reviewer_id','parent_idea_id','visual_id',
      'title','content','notes','platform','status','topic','hook',
      'scheduled_at','published_at','linkedin_post_url','tags',
    ]
    const payload = {}
    for (const k of ALLOWED_FIELDS) {
      if (form[k] !== undefined) payload[k] = form[k]
    }
    // Defaults / Pflichtfelder
    payload.user_id        = user.id
    payload.team_id        = form.team_id || activeTeamId
    payload.workspace      = form.workspace || workspace
    payload.brand_voice_id = activeBrandVoice?.noBrand ? null : (form.brand_voice_id || activeBrandVoice?.id || null)
    payload.no_brand = !!activeBrandVoice?.noBrand
    payload.platform       = form.platform || 'linkedin'
    payload.status         = form.status || 'idee'
    payload.tags           = typeof form.tags === 'string'
      ? form.tags.split(',').map(t => t.trim()).filter(Boolean)
      : (Array.isArray(form.tags) ? form.tags : [])
    payload.scheduled_at   = form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null
    // Empty-String FK-Felder zu null
    ;['assignee_id','reviewer_id','target_audience_id','parent_idea_id','visual_id','company_voice_id'].forEach(k => {
      if (payload[k] === '' || payload[k] === undefined) payload[k] = null
    })
    payload.company_voice_ids = Array.isArray(form.company_voice_ids) ? form.company_voice_ids : []
    payload.company_voice_id  = payload.company_voice_ids[0] || null

    // Hard-Stopps (FK NOT NULL)
    if (!payload.brand_voice_id) {
      setSaving(false)
      alert('Keine aktive Brand Voice. Bitte oben rechts eine Brand Voice auswählen.')
      return
    }
    if (!payload.team_id) {
      setSaving(false)
      alert('Kein aktives Team — bitte einloggen / Team-Setup prüfen.')
      return
    }

    let result
    if (isNew) {
      result = await supabase.from('content_posts').insert(payload).select().single()
    } else {
      result = await supabase.from('content_posts').update(payload).eq('id', post.id).select().single()
    }
    setSaving(false)
    if (result.error) {
      console.error('[postmodal-save]', result.error, payload)
      alert('Speichern fehlgeschlagen: ' + result.error.message)
      return
    }
    await syncMentions(result.data.id)
    await syncVisuals(result.data.id)
    await syncTags(result.data.id)
    // tag_ids sind nicht im .select() der content_posts-Row → für die Board-Karte manuell anhängen,
    // sonst verschwinden die Tags nach dem Speichern (handleSave überschreibt den Post ohne tag_ids).
    onSave({ ...result.data, tag_ids: [...selTagIds] })
  }

  const pltOptions = Object.entries(PLATFORMS)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--surface)', borderRadius:20, width:'100%', maxWidth:920, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 0', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1 }}>
            <input value={form.title} onChange={e => upd('title', e.target.value)}
              placeholder="Titel / Thema des Beitrags…"
              style={{ width:'100%', border:'none', outline:'none', fontSize:18, fontWeight:700, color:'rgb(20,20,43)', background:'transparent' }}/>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-muted)' }}><X size={14} strokeWidth={1.75}/></button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding: isMobile ? '16px' : '20px 24px', display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: isMobile ? 16 : 20 }}>

          {/* Left — Content */}
          <div>
            <div style={{ position:'relative' }}>
              <textarea value={form.content}
                onChange={e => { upd('content', e.target.value); setCharCount(e.target.value.length) }}
                placeholder={(form.content?.trim() ? '' : `Schreibe deinen ${plt.label}-Beitrag hier…\n\nTipps:\n• Starte mit einem starken Hook\n• Nutze Zeilenumbrüche für Lesbarkeit\n• Füge einen Call-to-Action ein`)}
                rows={12}
                style={{ width:'100%', padding:'14px', paddingTop: form.content?.trim() ? 48 : 14, borderRadius:12, border:'1.5px solid #E5E7EB',
                  fontSize:14, lineHeight:1.7, resize:'vertical', outline:'none', boxSizing:'border-box',
                  fontFamily:'inherit', color:'rgb(20,20,43)', transition:'border 0.15s' }}
                onFocus={e => e.target.style.borderColor = plt.color}
                onBlur={e => e.target.style.borderColor = '#E5E7EB'}/>

              {/* Inline Textwerkstatt-Buttons */}
              {!form.content?.trim() ? (
                /* Empty-State: prominenter Button-Overlay UNTERHALB der Tipps */
                <div style={{ position:'absolute', bottom:30, left:'50%', transform:'translateX(-50%)', pointerEvents:'none', display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'12px 16px', background:'rgba(255,255,255,0.95)', borderRadius:14, boxShadow:'0 4px 18px rgba(15,23,42,0.08)', maxWidth:'88%' }}>
                  <button className="lk-btn lk-btn-navy" type="button" onClick={() => jumpToTextStudio('auto')}
                    style={{ pointerEvents:'auto', display:'inline-flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={13}/>In Content-Werkstatt schreiben →</span>
                  </button>
                  <div style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', lineHeight:1.4 }}>
                    oder direkt hier tippen
                  </div>
                </div>
              ) : (
                /* Has-Text: nur Text-verbessern-Button oben rechts im Textfeld */
                <div style={{ position:'absolute', top:8, right:10, display:'flex', gap:6, zIndex:2 }}>
                  <button type="button" onClick={() => jumpToTextStudio('improve')}
                    title="Text in der Content-Werkstatt verbessern" className="lk-btn lk-btn-ghost lk-btn-sm">
                    <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Wand2 size={13}/>Text verbessern</span>
                  </button>
                </div>
              )}
              <div style={{ position:'absolute', bottom:8, right:10, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                {/* Fortschrittsbalken */}
                {charCount > 0 && (() => {
                  const pct = Math.min(charCount / limit * 100, 100)
                  const ideal = charCount >= 800 && charCount <= 1500
                  const tooShort = charCount < 300
                  const tooLong = charCount > 2200
                  const color = tooLong ? '#ef4444' : ideal ? '#22c55e' : '#f59e0b'
                  return (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                      <div style={{ width:80, height:4, background:'#E5E7EB', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:pct+'%', background:color, borderRadius:99, transition:'width 0.2s,background 0.2s' }}/>
                      </div>
                      <div style={{ fontSize:10, fontWeight:700, color }}>
                        {tooShort ? <span style={{display:'inline-flex',alignItems:'center',gap:4}}><Zap size={11}/>Zu kurz</span> : tooLong ? <span style={{display:'inline-flex',alignItems:'center',gap:4}}><Scissors size={11}/>Zu lang</span> : ideal ? <span style={{display:'inline-flex',alignItems:'center',gap:4}}><Check size={11}/>Ideal</span> : <span style={{display:'inline-flex',alignItems:'center',gap:4}}><ThumbsUpIcon size={11}/>OK</span>} · {charCount.toLocaleString()}
                      </div>
                    </div>
                  )
                })()}
                {charCount === 0 && <div style={{ fontSize:10, color:'#CBD5E1' }}>0 / 3.000</div>}
              </div>
            </div>

            {/* Medien zum Post (Bilder, Videos, PDFs) */}
            <div style={{ marginTop:18 }}>
              {(() => {
                const mediaTypes = [...new Set(postVisuals.map(v => v.media_type || 'image'))]
                const isMixed = mediaTypes.length > 1
                const primaryType = postVisuals[0]?.media_type || 'image'
                const typeBadge = primaryType === 'video' ? 'Video' : primaryType === 'document' ? 'Dokument' : (postVisuals.length > 1 ? 'Carousel' : null)
                return (
                  <>
                    <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>
                      Medien zum Post {postVisuals.length > 0 && <span style={{ fontWeight:400 }}>({postVisuals.length}{typeBadge ? ' — ' + typeBadge : ''})</span>}
                    </label>
                    {isMixed && (
                      <div style={{ marginBottom:8, padding:'8px 10px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, fontSize:11, color:'#92400E', lineHeight:1.4 }}>
                        <span style={{display:'inline-flex',alignItems:'flex-start',gap:6}}><AlertTriangle size={12} strokeWidth={1.75} style={{flexShrink:0,marginTop:1}}/>Gemischte Medien-Typen — LinkedIn lässt pro Post nur einen Typ zu (Carousel ODER Video ODER Dokument). Beim Posten wird nur das Cover verwendet.</span>
                      </div>
                    )}
                  </>
                )
              })()}
              {postVisuals.length > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:8, marginBottom:8 }}>
                  {postVisuals.map((v, idx) => {
                    const isHovered = hoveredVisualId === v.id
                    return (
                      <div key={v.id}
                        onMouseEnter={() => setHoveredVisualId(v.id)}
                        onMouseLeave={() => setHoveredVisualId(prev => prev === v.id ? null : prev)}
                        style={{ position:'relative', borderRadius:8, overflow:'hidden', border:'1px solid var(--border)', aspectRatio:'1/1', background:'#F1F5F9' }}>
                        {/* Media-Type-spezifisches Tile-Render */}
                        {v.media_type === 'video' ? (
                          <div style={{ position:'relative', width:'100%', height:'100%', background:'#000' }}>
                            {v.signed_url && <video src={v.signed_url} muted preload="metadata" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>}
                            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                              <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(255,255,255,0.92)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.3)' }}>
                                <span style={{ fontSize:14, color:'#1A1A2E', marginLeft:2 }}>▶</span>
                              </div>
                            </div>
                          </div>
                        ) : v.media_type === 'document' ? (
                          <div style={{ width:'100%', height:'100%', background:'linear-gradient(180deg, #F8FAFC 0%, #E5E7EB 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5, padding:8 }}>
                            <PdfDocIcon size={48}/>
                            <div style={{ fontSize:9, fontWeight:600, color:'rgb(20,20,43)', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%', lineHeight:1.2 }}>
                              {v.original_filename || 'Dokument.pdf'}
                            </div>
                          </div>
                        ) : (
                          v.signed_url && <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                        )}
                        {/* Position-Indicator */}
                        <div style={{ position:'absolute', top:5, left:5, padding:'2px 6px', background:'rgba(0,0,0,0.6)', color:'#fff', fontSize:10, fontWeight:700, borderRadius:4, zIndex:2 }}>
                          {idx + 1}{idx === 0 && ' · Cover'}
                        </div>
                        {/* Pfeil + Remove */}
                        <div style={{ position:'absolute', top:4, right:4, display:'flex', gap:3, zIndex:3 }}>
                          {idx > 0 && (
                            <button onClick={() => moveVisual(idx, -1)} title="Nach links"
                              style={{ width:22, height:22, borderRadius:4, border:'none', background:'rgba(0,0,0,0.6)', color:'#fff', cursor:'pointer', fontSize:11, lineHeight:1 }}>←</button>
                          )}
                          {idx < postVisuals.length - 1 && (
                            <button onClick={() => moveVisual(idx, 1)} title="Nach rechts"
                              style={{ width:22, height:22, borderRadius:4, border:'none', background:'rgba(0,0,0,0.6)', color:'#fff', cursor:'pointer', fontSize:11, lineHeight:1 }}>→</button>
                          )}
                          <button onClick={() => removeVisualFromPost(v.id)} title="Aus Beitrag entfernen"
                            style={{ width:22, height:22, borderRadius:4, border:'none', background:'rgba(220,38,38,0.85)', color:'#fff', cursor:'pointer', fontSize:11, lineHeight:1, fontWeight:700 }}><X size={14} strokeWidth={1.75}/></button>
                        </div>
                        {/* Hover-Overlay mit Download + Bearbeiten */}
                        {isHovered && (
                          <div style={{
                            position:'absolute', inset:0, background:'rgba(0,0,0,0.55)',
                            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                            gap:8, padding:8, zIndex:1,
                            animation:'pmFade .12s ease-out',
                          }}>
                            <button onClick={(e) => { e.stopPropagation(); downloadPostVisual(v) }}
                              style={{ padding:'6px 12px', borderRadius:7, border:'none', background:'#fff', color:'var(--text-primary, rgb(20,20,43))', fontSize:11, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                              ⬇ Download
                            </button>
                            <button className="lk-btn lk-btn-navy" onClick={(e) => { e.stopPropagation(); openVisualInEditor(v) }}
                              style={{ display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                              <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Pencil size={12}/>Bild bearbeiten</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button className="lk-btn lk-btn-ghost" type="button"
                  onClick={() => {
                    console.log('[upload-btn] clicked', { hasRef: !!fileInputRef.current, uploadingMedia })
                    if (uploadingMedia) return
                    fileInputRef.current?.click()
                  }}
                  disabled={uploadingMedia}
                  style={{ flex:'1 1 auto', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                  {uploadingMedia ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={12} className='lk-spin'/>Lade hoch…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Paperclip size={12}/>Datei hochladen</span>}
                </button>
                <input ref={fileInputRef} type="file" multiple
                  accept=".png,.jpg,.jpeg,.webp,.svg,.mp4,.mov,.webm,.avi,.pdf,image/*,video/*,application/pdf"
                  onChange={e => {
                    // WICHTIG: erst FileList in Array kopieren, DANN value resetten.
                    // FileList ist live mit input.value verknüpft — wird leer wenn
                    // value='' VOR der Übergabe gesetzt wird.
                    const files = Array.from(e.target.files || [])
                    console.log('[input.onChange] files:', files.length, files.map(f => f.name + ' ' + f.type))
                    e.target.value = ''
                    uploadMediaFiles(files)
                  }}
                  style={{ position:'absolute', left:'-9999px', width:1, height:1, opacity:0, pointerEvents:'none' }}/>
                <button className="lk-btn lk-btn-ghost" onClick={openVisualPicker}
                  style={{ flex:'1 1 auto', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:6}}><BookOpen size={12}/>Aus Bibliothek</span>
                </button>
                <button className="lk-btn lk-btn-ghost" onClick={() => { if (navigate) navigate('/content-studio?post_id=' + post.id + '&gen=image'); onClose() }}
                  style={{ flex:'1 1 auto', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Wand2 size={12}/>KI-Bild generieren</span>
                </button>
              </div>
              {postVisuals.length > 1 && (
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:6, lineHeight:1.4 }}>
                  <span style={{display:'inline-flex',alignItems:'flex-start',gap:6}}><Lightbulb size={12} style={{flexShrink:0,marginTop:1}}/>Carousel-Reihenfolge: 1 = Cover. Mit ← → kannst du die Slides sortieren.</span>
                </div>
              )}
            </div>

          </div>

          {/* Right — Metadaten */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Kanal (Plattform) — oben rechts, gleiches Button-Design */}
            {pltOptions.length > 1 && (
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>Kanal</label>
                <div style={{ display:'flex', gap:8 }}>
                  {pltOptions.map(([k, v]) => (
                    <button key={k} onClick={() => upd('platform', k)}
                      style={{ flex:1, padding:'9px 12px', borderRadius:10, border:`1.5px solid ${form.platform===k?v.color:'var(--border)'}`,
                        background: form.platform===k ? v.bg : '#fff', color: form.platform===k ? v.color : 'var(--text-primary)',
                        fontSize:13, fontWeight:600, cursor:'pointer', boxSizing:'border-box', transition:'all .12s' }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Unternehmen + Geplant für nebeneinander (über Status/Tags) */}
            {((companyVoices.length > 0 && (previewBV ? previewBV.account_type !== 'company_page' : activeBrandVoice?.account_type !== 'company_page')) || isPersonalPost) && (
              <div style={{ display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
                {companyVoices.length > 0 && (previewBV ? previewBV.account_type !== 'company_page' : activeBrandVoice?.account_type !== 'company_page') && (
                  <div style={{ flex:1, minWidth:150 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>Für Unternehmen</label>
                    <CompanyMultiSelect companies={companyVoices} value={form.company_voice_ids || []} onChange={(ids)=>upd('company_voice_ids', ids)} label="Kein Unternehmen" buttonStyle={{ width:'100%', maxWidth:'none', padding:'9px 12px', minHeight:40, boxSizing:'border-box', fontSize:13 }} />
                  </div>
                )}
                {isPersonalPost && (
                  <div style={{ flex:1, minWidth:150 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>Geplant für</label>
                    <DateTimePicker value={form.scheduled_at} onChange={(v) => upd('scheduled_at', v)} />
                  </div>
                )}
              </div>
            )}

            {/* Status + Tags nebeneinander */}
            <div style={{ display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
            {/* Status — 3 Board-Phasen (Idee / In Arbeit / Veröffentlicht) */}
            <div style={{ flex:1, minWidth:130 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>Status</label>
              {(() => {
                // Mapper: DB-Status → Board-Phase
                const bucket = form.status === 'idee' ? 'idee'
                  : ['published','analyzed'].includes(form.status) ? 'published'
                  : form.status === 'scheduled' ? 'scheduled'
                  : 'draft'  // draft, in_review, approved, failed → In Arbeit
                const opts = isPersonalPost ? [
                  { value: 'idee',      label: 'Idee' },
                  { value: 'draft',     label: 'In Arbeit' },
                  { value: 'scheduled', label: 'Eingeplant' },
                  { value: 'published', label: 'Veröffentlicht' },
                ] : [
                  { value: 'idee',  label: 'Idee' },
                  { value: 'draft', label: 'In Arbeit' },
                ]
                const palette = {
                  idee:      { border:'#E2E8F0', bg:'#F8FAFC', color:'#64748B' },
                  draft:     { border:'#FDE68A', bg:'#FFFBEB', color:'#9A7B0A' },
                  scheduled: { border:'#BFDBFE', bg:'#EFF6FF', color:'#1d4ed8' },
                  published: { border:'#A7F3D0', bg:'#ECFDF5', color:'#047857' },
                }
                const { border:borderColor, bg, color } = palette[bucket] || palette.draft
                return (
                  <>
                    <PillSelect value={bucket} onChange={v => upd('status', v)} neutral options={[...opts.map((o) => ({ value: o.value, label: o.label }))]} buttonStyle={{ minWidth: 140 }} />
                    {form.status === 'scheduled' && form.scheduled_at && (
                      <div style={{ fontSize:11, color:'#1d4ed8', marginTop:6, lineHeight:1.4 }}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Calendar size={12}/>Auto-Publish geplant für {new Date(form.scheduled_at).toLocaleString('de-DE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}.</span>
                      </div>
                    )}
                    {form.status === 'scheduled' && !form.scheduled_at && (
                      <div style={{ fontSize:11, color:'#9A7B0A', marginTop:6, lineHeight:1.4 }}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:6}}><AlertTriangle size={12}/>Eingeplant — aber kein Datum gesetzt. Setze rechts ein Datum + klick "Auto-Publish einplanen".</span>
                      </div>
                    )}
                    {form.status === 'failed' && (
                      <div style={{ fontSize:11, color:'#b91c1c', marginTop:6, lineHeight:1.4 }}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:6}}><AlertTriangle size={12}/>Letztes Posten fehlgeschlagen — siehe Console / Edge-Function-Log.</span>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Tags — kompaktes Dropdown (rechts neben Status) */}
            <div style={{ flex:1, minWidth:130 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>Tags</label>
              <TagPicker tags={tags} selTagIds={selTagIds} onToggle={toggleTag} onRename={renameTagLocal} onPersist={persistTag} onAddTag={addTag} />
            </div>
            </div>

            {/* Zugeordnete Team-Mitglieder */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Zugeordnete Team-Mitglieder</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:8 }}>
                {mentions.length === 0 && (
                  <span style={{ fontSize:11, color:'var(--text-muted)', fontStyle:'italic' }}>Niemand zugeordnet</span>
                )}
                {mentions.map(m => (
                  <span key={m.user_id} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 8px', borderRadius:99, fontSize:11, fontWeight:600, background:'rgba(10,111,176,0.08)', color:'var(--wl-primary, #0A6FB0)', border:'1px solid rgba(10,111,176,0.2)' }}>
                    @{m.label}
                    <button type="button" onClick={() => removeMention(m.user_id)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', fontSize:11, padding:0, lineHeight:1 }}><X size={14} strokeWidth={1.75}/></button>
                  </span>
                ))}
              </div>
              {/* Hinweis wenn BV nicht geteilt aber Team da ist */}
              {postBVShared === false && (
                <div style={{ padding:'8px 10px', marginBottom:8, borderRadius:8, background:'#FFFBEB', border:'1px solid #FCD34D', fontSize:11, color:'#92400E', lineHeight:1.5 }}>
                  🔒 Diese Brand Voice ist privat — Team-Mitglieder können den Beitrag nicht sehen.
                  Um andere zu markieren, teile die Brand Voice im Bereich <strong>Branding</strong>.
                </div>
              )}
              <div style={{ position:'relative' }}>
                <button className="lk-btn lk-btn-ghost" type="button" onClick={() => setMentionPickerOpen(o => !o)}
                  disabled={mentionableMembers.length === 0}
                  style={{ width:'100%', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                  {mentionableMembers.length === 0 ? 'Keine Team-Mitglieder verfügbar' : '+ Mitglied zuordnen'}
                </button>
                {mentionPickerOpen && mentionableMembers.length > 0 && (
                  <>
                    <div onClick={() => setMentionPickerOpen(false)} style={{ position:'fixed', inset:0, zIndex:90 }}/>
                    <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:91, background:'#fff', border:'1px solid var(--border)', borderRadius:9, boxShadow:'0 10px 30px rgba(0,0,0,.12)', maxHeight:240, overflowY:'auto', padding:5 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', padding:'6px 8px 2px' }}>Team-Mitglied wählen</div>
                      {mentionableMembers.map(m => {
                        const already = mentions.some(x => x.user_id === m.user_id)
                        const avatar = memberAvatarUrl(m)
                        return (
                          <button key={m.user_id} type="button" disabled={already}
                            onClick={() => addMention(m)}
                            style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, cursor: already ? 'default' : 'pointer', fontSize:12, color: already ? 'var(--text-muted)' : 'var(--text-primary)', background:'transparent', border:'none', textAlign:'left' }}
                            onMouseEnter={e => { if (!already) e.currentTarget.style.background='#F8FAFC' }}
                            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                            {avatar ? (
                              <img src={avatar} alt={memberLabel(m)} style={{ width:22, height:22, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                            ) : (
                              <span style={{ width:22, height:22, borderRadius:'50%', background:'linear-gradient(135deg, #0A6FB0, #8b5cf6)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0 }}>{memberInitials(m)}</span>
                            )}
                            <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{memberLabel(m)}{m.user_id === session.user.id ? ' (du)' : ''}</span>
                            {already && <span style={{ fontSize:10, color:'#94A3B8' }}>✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Tags entfernt — Karten waren überladen */}

            {/* Notizen + Kommentare zusammen ausklappbar (default zu) */}
            {(() => {
              const hasNotes = (form.notes || '').trim().length > 0
              const noteCount = hasNotes ? 1 : 0
              const totalBadge = noteCount + (comments?.length || 0)
              return (
                <div style={{ border:'1px solid var(--border)', borderRadius:10, background:'#fff' }}>
                  <button type="button" onClick={() => setNotesAndCommentsOpen(o => !o)}
                    style={{ width:'100%', padding:'9px 12px', display:'flex', alignItems:'center', gap:8, background:'transparent', border:'none', cursor:'pointer', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span style={{ fontSize:13, transition:'transform .15s', transform: notesAndCommentsOpen ? 'rotate(90deg)' : 'rotate(0)' }}>▸</span>
                    <span style={{display:'inline-flex',alignItems:'center',gap:6}}><FileText size={14} strokeWidth={1.75}/>Notizen &amp; Kommentare</span>
                    {totalBadge > 0 && (
                      <span style={{ marginLeft:'auto', padding:'1px 7px', borderRadius:99, background:'rgba(10,111,176,0.1)', color:'var(--wl-primary, #0A6FB0)', fontSize:10, fontWeight:700 }}>
                        {totalBadge}
                      </span>
                    )}
                  </button>
                  {notesAndCommentsOpen && (
                    <div style={{ padding:'4px 12px 12px', display:'flex', flexDirection:'column', gap:14 }}>
                      {/* Notizen */}
                      <div>
                        <label style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'inline-flex', alignItems:'center', gap:6, marginBottom:5 }}><FileText size={10}/>Notizen</label>
                        <textarea value={form.notes || ''} onChange={e => upd('notes', e.target.value)}
                          placeholder="Recherche-Quellen, Ideen, Anmerkungen…" rows={3}
                          style={{ width:'100%', padding:'9px 10px', borderRadius:8, border:'1.5px solid #E5E7EB',
                            fontSize:12, resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit',
                            color:'rgb(20,20,43)', background:'#FAFAFA' }}/>
                      </div>

            {/* Team-Kommentare — nur für existing posts */}
            {!isNew && (
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'inline-flex', alignItems:'center', gap:6, marginBottom:6 }}><MessageCircle size={11}/>Team-Kommentare ({comments.length})</label>
                <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:200, overflowY:'auto', marginBottom:8 }}>
                  {commentsLoading && <div style={{ fontSize:11, color:'var(--text-muted)' }}>Lade…</div>}
                  {!commentsLoading && comments.length === 0 && (
                    <div style={{ fontSize:11, color:'var(--text-muted)', fontStyle:'italic', padding:'8px 10px', background:'#F8FAFC', borderRadius:7 }}>
                      Noch keine Kommentare. Stell eine Frage ans Team oder bitte um Feedback.
                    </div>
                  )}
                  {comments.map(c => {
                    const author = (members || []).find(m => m.user_id === c.user_id)
                    const authorLabel = author ? memberLabel(author) : (c.user_id?.slice(0,8) || '?')
                    return (
                      <div key={c.id} style={{ padding:'8px 10px', background:'#F8FAFC', borderRadius:7, borderLeft:'3px solid rgba(10,111,176,0.3)' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', marginBottom:3 }}>
                          {authorLabel}
                          {' · '}
                          {new Date(c.created_at).toLocaleString('de-DE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                        </div>
                        <div style={{ fontSize:12, color:'rgb(20,20,43)', lineHeight:1.45, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{c.body}</div>
                      </div>
                    )
                  })}
                </div>
                {/* Kommentar-Eingabe mit @-Picker */}
                <div style={{ position:'relative' }}>
                  <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                    placeholder="Kommentar ans Team — nutze @ um jemanden zu erwähnen…"
                    rows={2}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1.5px solid #E5E7EB', fontSize:12, resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
                  <div style={{ display:'flex', gap:6, marginTop:6, alignItems:'center', flexWrap:'wrap' }}>
                    <div style={{ position:'relative' }}>
                      <button className="lk-btn lk-btn-ghost" type="button" onClick={() => setCommentMentionPickerOpen(o => !o)}
                        disabled={mentionableMembers.length === 0}
                        >
                        @ erwähnen
                      </button>
                      {commentMentionPickerOpen && (
                        <>
                          <div onClick={() => setCommentMentionPickerOpen(false)} style={{ position:'fixed', inset:0, zIndex:90 }}/>
                          <div style={{ position:'absolute', bottom:'calc(100% + 4px)', left:0, zIndex:91, background:'#fff', border:'1px solid var(--border)', borderRadius:9, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:220, maxHeight:200, overflowY:'auto', padding:5 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', padding:'6px 8px 2px' }}>Person erwähnen</div>
                            {mentionableMembers.map(m => {
                              const avatar = memberAvatarUrl(m)
                              return (
                                <button key={m.user_id} type="button" onClick={() => addCommentMention(m)}
                                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, cursor:'pointer', fontSize:12, color:'var(--text-primary)', background:'transparent', border:'none', textAlign:'left' }}
                                  onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                  {avatar ? (
                                    <img src={avatar} alt={memberLabel(m)} style={{ width:20, height:20, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                                  ) : (
                                    <span style={{ width:20, height:20, borderRadius:'50%', background:'linear-gradient(135deg, #0A6FB0, #8b5cf6)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0 }}>{memberInitials(m)}</span>
                                  )}
                                  <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{memberLabel(m)}{m.user_id === session.user.id ? ' (du)' : ''}</span>
                                </button>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                    <button className="lk-btn lk-btn-primary" onClick={addComment} disabled={!newComment.trim()}
                      style={{ marginLeft:'auto', whiteSpace:'nowrap' }}>
                      Senden
                    </button>
                  </div>
                </div>
              </div>
            )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Team & Kontext — nur advanced und wenn Team > 1 */}
            {showAdvanced && (members?.length || 0) > 1 && <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Team & Kontext</label>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
<PillSelect value={form.assignee_id || ''} onChange={v => upd('assignee_id', v)} neutral options={[{ value: '', label: `Assignee wählen…` }, ...members || [].map((m) => ({ value: m.user_id, label: m.email || m.user_id }))]} buttonStyle={{ minWidth: 140 }} />
                <PillSelect value={form.reviewer_id || ''} onChange={v => upd('reviewer_id', v)} neutral options={[{ value: '', label: `Reviewer wählen…` }, ...members || [].map((m) => ({ value: m.user_id, label: m.email || m.user_id }))]} buttonStyle={{ minWidth: 140 }} />
              </div>
            </div>}

            {/* LinkedIn-Vorschau hinter Toggle, mit BV-Daten */}
            {form.content && (() => {
              const dispName = previewBV?.linkedin_display_name || previewBV?.name || 'Brand Voice'
              const avatarUrl = previewBV?.linkedin_avatar_url || null
              const headline  = previewBV?.headline || previewBV?.name || ''
              const initials = (dispName || 'BV').split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'BV'
              return (
                <div>
                  <button className="lk-btn lk-btn-ghost" onClick={() => setShowPreview(s => !s)}
                    style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    {showPreview ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><ChevronUp size={12}/>Vorschau verbergen</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Eye size={12}/>LinkedIn-Vorschau anzeigen</span>}
                  </button>
                  {showPreview && (
                    <div style={{ marginTop:8, border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', background:'var(--surface)' }}>
                      <div style={{ padding:'10px 12px 6px', background:'#F3F2EF', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:10, fontWeight:700, color:'#0A66C2', textTransform:'uppercase', letterSpacing:'0.05em', display:'inline-flex', alignItems:'center', gap:6 }}><LinkedinIcon size={11}/>LinkedIn-Vorschau</span>
                      </div>
                      <div style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={dispName} style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                          ) : (
                            <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg,#0A6FB0,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:14, flexShrink:0 }}>{initials}</div>
                          )}
                          <div style={{ minWidth:0, flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dispName}</div>
                            {headline && <div style={{ fontSize:11, color:'#666', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{headline}</div>}
                            <div style={{ fontSize:10, color:'#999' }}>
                              {form.scheduled_at ? new Date(form.scheduled_at).toLocaleString('de-DE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Jetzt'} · 🌐
                            </div>
                          </div>
                          <div style={{ color:'#0A66C2', fontSize:20, fontWeight:300 }}>…</div>
                        </div>
                        <div style={{ fontSize:13, color:'rgb(20,20,43)', lineHeight:1.65, whiteSpace:'pre-wrap', wordBreak:'break-word', maxHeight:200, overflow:'auto', marginBottom: postVisuals.length ? 10 : 0 }}>
                          {form.content.slice(0,1200)}{form.content.length > 1200 ? '…mehr' : ''}
                        </div>
                        {/* Medien im LinkedIn-Look — Typ-spezifisch (Image/Video/Document) */}
                        {postVisuals.length > 0 && (() => {
                          const primary = postVisuals[0]
                          const primaryType = primary?.media_type || 'image'
                          const containerHeight = 340
                          const gap = 2
                          const onClickAt = (idx) => () => setPreviewLightboxIdx(idx)

                          // VIDEO-POST
                          if (primaryType === 'video') {
                            return (
                              <div onClick={onClickAt(0)} style={{ position:'relative', borderRadius:6, overflow:'hidden', border:'1px solid var(--border)', background:'#000', cursor:'pointer' }}>
                                <video src={primary.signed_url} muted preload="metadata"
                                  style={{ width:'100%', maxHeight:containerHeight, objectFit:'cover', display:'block' }}/>
                                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                                  <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid rgba(255,255,255,0.95)' }}>
                                    <span style={{ fontSize:22, color:'#fff', marginLeft:3 }}>▶</span>
                                  </div>
                                </div>
                                <div style={{ position:'absolute', bottom:8, left:8, padding:'3px 8px', background:'rgba(0,0,0,0.7)', color:'#fff', fontSize:11, fontWeight:600, borderRadius:4 }}>
                                  Video
                                </div>
                              </div>
                            )
                          }
                          // DOCUMENT-POST
                          if (primaryType === 'document') {
                            return (
                              <div onClick={onClickAt(0)} style={{ borderRadius:6, overflow:'hidden', border:'1px solid var(--border)', background:'#fff', cursor:'pointer' }}>
                                <div style={{ background:'linear-gradient(180deg, #F8FAFC 0%, #E5E7EB 100%)', padding:'30px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:14, minHeight:240 }}>
                                  <PdfDocIcon size={96}/>
                                  <div style={{ textAlign:'center', maxWidth:'90%' }}>
                                    <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                      {primary.original_filename || 'Dokument.pdf'}
                                    </div>
                                    <div style={{ fontSize:11, color:'#666' }}>
                                      PDF{primary.page_count ? ` · ${primary.page_count} Seiten` : ''}{primary.file_size_bytes ? ` · ${(primary.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ padding:'8px 12px', background:'#F3F2EF', borderTop:'1px solid var(--border)', fontSize:11, color:'#0A66C2', fontWeight:600, textAlign:'center' }}>
                                  Anzeigen
                                </div>
                              </div>
                            )
                          }

                          // IMAGE-POSTS — Collage je nach Anzahl
                          const tileImg = (v, extraStyle = {}) => (
                            <img src={v.signed_url} alt={v.prompt}
                              style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', cursor:'pointer', ...extraStyle }}/>
                          )

                          if (postVisuals.length === 1) {
                            return (
                              <div onClick={onClickAt(0)} style={{ borderRadius:6, overflow:'hidden', border:'1px solid var(--border)', background:'#000', cursor:'pointer' }}>
                                <img src={postVisuals[0].signed_url} alt={postVisuals[0].prompt}
                                  style={{ width:'100%', display:'block', maxHeight:containerHeight, objectFit:'cover' }}/>
                              </div>
                            )
                          }
                          if (postVisuals.length === 2) {
                            return (
                              <div style={{ borderRadius:6, overflow:'hidden', border:'1px solid var(--border)', background:'#000', display:'grid', gridTemplateColumns:'1fr 1fr', gap, height: containerHeight }}>
                                <div onClick={onClickAt(0)} style={{ overflow:'hidden' }}>{tileImg(postVisuals[0])}</div>
                                <div onClick={onClickAt(1)} style={{ overflow:'hidden' }}>{tileImg(postVisuals[1])}</div>
                              </div>
                            )
                          }
                          if (postVisuals.length === 3) {
                            return (
                              <div style={{ borderRadius:6, overflow:'hidden', border:'1px solid var(--border)', background:'#000', display:'grid', gridTemplateColumns:'2fr 1fr', gap, height: containerHeight }}>
                                <div onClick={onClickAt(0)} style={{ overflow:'hidden' }}>{tileImg(postVisuals[0])}</div>
                                <div style={{ display:'grid', gridTemplateRows:'1fr 1fr', gap }}>
                                  <div onClick={onClickAt(1)} style={{ overflow:'hidden' }}>{tileImg(postVisuals[1])}</div>
                                  <div onClick={onClickAt(2)} style={{ overflow:'hidden' }}>{tileImg(postVisuals[2])}</div>
                                </div>
                              </div>
                            )
                          }
                          // 4+: 1 großes links + 3 rechts gestapelt, letztes Tile mit "+N"-Overlay falls 5+
                          const extraCount = postVisuals.length - 4
                          return (
                            <div style={{ borderRadius:6, overflow:'hidden', border:'1px solid var(--border)', background:'#000', display:'grid', gridTemplateColumns:'2fr 1fr', gap, height: containerHeight }}>
                              <div onClick={onClickAt(0)} style={{ overflow:'hidden' }}>{tileImg(postVisuals[0])}</div>
                              <div style={{ display:'grid', gridTemplateRows:'1fr 1fr 1fr', gap }}>
                                <div onClick={onClickAt(1)} style={{ overflow:'hidden' }}>{tileImg(postVisuals[1])}</div>
                                <div onClick={onClickAt(2)} style={{ overflow:'hidden' }}>{tileImg(postVisuals[2])}</div>
                                <div onClick={onClickAt(3)} style={{ position:'relative', overflow:'hidden' }}>
                                  {tileImg(postVisuals[3])}
                                  {extraCount > 0 && (
                                    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, lineHeight:1.2 }}>
                                      +{extraCount} mehr
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                        <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid var(--border)', display:'flex', gap:16 }}>
                          {[{i:<ThumbsUpIcon size={13} strokeWidth={1.75}/>,t:'Gefällt mir'},{i:<MessageCircle size={13} strokeWidth={1.75}/>,t:'Kommentieren'},{i:<Share2 size={13} strokeWidth={1.75}/>,t:'Teilen'}].map((a, idx) => (
                            <span key={idx} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:'#666', fontWeight:600 }}>{a.i}{a.t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

{/* Vorschau-Lightbox (Carousel-Durchklicken) */}
        {previewLightboxIdx !== null && postVisuals[previewLightboxIdx] && (
          <div onClick={() => setPreviewLightboxIdx(null)}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            {/* Close */}
            <button onClick={(e) => { e.stopPropagation(); setPreviewLightboxIdx(null) }}
              style={{ position:'absolute', top:18, right:24, width:36, height:36, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.15)', color:'#fff', cursor:'pointer', fontSize:18, lineHeight:1 }}><X size={14} strokeWidth={1.75}/></button>
            {/* Prev */}
            {previewLightboxIdx > 0 && (
              <button onClick={(e) => { e.stopPropagation(); setPreviewLightboxIdx(i => i - 1) }}
                style={{ position:'absolute', left:24, top:'50%', transform:'translateY(-50%)', width:44, height:44, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.15)', color:'#fff', cursor:'pointer', fontSize:20, lineHeight:1 }}>←</button>
            )}
            {/* Next */}
            {previewLightboxIdx < postVisuals.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); setPreviewLightboxIdx(i => i + 1) }}
                style={{ position:'absolute', right:24, top:'50%', transform:'translateY(-50%)', width:44, height:44, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.15)', color:'#fff', cursor:'pointer', fontSize:20, lineHeight:1 }}>→</button>
            )}
            {/* Medium */}
            {(() => {
              const v = postVisuals[previewLightboxIdx]
              if (v.media_type === 'video') {
                return (
                  <video onClick={e => e.stopPropagation()}
                    src={v.signed_url} controls autoPlay
                    style={{ maxWidth:'92vw', maxHeight:'82vh', borderRadius:8, boxShadow:'0 20px 60px rgba(0,0,0,0.5)', background:'#000' }}/>
                )
              }
              if (v.media_type === 'document') {
                // PDFs koennen nicht in <iframe> embedded werden wegen X-Frame-Options
                // vom Storage. Stattdessen: Card mit "Im neuen Tab oeffnen" + Download.
                return (
                  <div onClick={e => e.stopPropagation()}
                    style={{ background:'#fff', borderRadius:14, padding:'32px 36px', maxWidth:480, width:'92vw', textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
                    <div style={{ display:'flex', justifyContent:'center', marginBottom:18 }}>
                      <PdfDocIcon size={140}/>
                    </div>
                    <div style={{ fontSize:16, fontWeight:700, color:'rgb(20,20,43)', marginBottom:6, wordBreak:'break-word' }}>
                      {v.original_filename || 'Dokument.pdf'}
                    </div>
                    <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:22 }}>
                      PDF{v.page_count ? ` · ${v.page_count} Seiten` : ''}{v.file_size_bytes ? ` · ${(v.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
                    </div>
                    <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                      <button className="lk-btn lk-btn-cta" onClick={() => window.open(v.signed_url, '_blank', 'noopener')}
                        style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                        📄 Im neuen Tab öffnen
                      </button>
                      <button className="lk-btn lk-btn-ghost" onClick={() => downloadPostVisual(v)}
                        style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                        ⬇ Download
                      </button>
                    </div>
                  </div>
                )
              }
              return (
                <img onClick={e => e.stopPropagation()}
                  src={v.signed_url} alt={v.prompt}
                  style={{ maxWidth:'92vw', maxHeight:'82vh', objectFit:'contain', borderRadius:8, boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}/>
              )
            })()}
            {/* Position-Indicator + Caption */}
            <div style={{ position:'absolute', bottom:18, left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div style={{ padding:'5px 12px', background:'rgba(0,0,0,0.65)', color:'#fff', fontSize:12, fontWeight:700, borderRadius:99 }}>
                {previewLightboxIdx + 1} / {postVisuals.length}
              </div>
              {postVisuals[previewLightboxIdx].prompt && (
                <div style={{ maxWidth:'70vw', textAlign:'center', padding:'4px 10px', color:'#E5E7EB', fontSize:11, lineHeight:1.4, opacity:0.85 }}>
                  {postVisuals[previewLightboxIdx].prompt.slice(0, 200)}
                </div>
              )}
            </div>
          </div>
        )}

{/* Visual-Picker-Modal */}
        {visualPickerOpen && (
          <div onClick={e => e.target === e.currentTarget && setVisualPickerOpen(false)}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:1100 }}>
            <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:760, padding:20, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'85vh', display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexShrink:0 }}>
                <div>
                  <h3 style={{ fontSize:17, fontWeight:700, margin:0, display:'inline-flex', alignItems:'center', gap:8 }}><ImageIcon size={17} strokeWidth={1.75}/>Bild aus Bibliothek wählen</h3>
                  <p style={{ fontSize:12, color:'var(--text-muted)', margin:'4px 0 0' }}>
                    Mehrfachauswahl möglich für Carousel-Posts.{form.brand_voice_id ? ' Gefiltert nach Brand Voice.' : ''}
                  </p>
                </div>
                <button onClick={() => setVisualPickerOpen(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-muted)' }}><X size={14} strokeWidth={1.75}/></button>
              </div>
              <div style={{ overflowY:'auto', flex:1, minHeight:0 }}>
                {libraryVisualsLoading && <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)' }}>Lade…</div>}
                {!libraryVisualsLoading && libraryVisuals.length === 0 && (
                  <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--text-muted)', fontSize:13, background:'#F8FAFC', borderRadius:10 }}>
                    Noch keine Bilder in der Bibliothek dieser Brand Voice. Erstelle eines in <strong>Visuals</strong>.
                  </div>
                )}
                {!libraryVisualsLoading && libraryVisuals.length > 0 && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:8 }}>
                    {libraryVisuals.map(v => {
                      const isAttached = postVisuals.some(x => x.id === v.id)
                      return (
                        <button key={v.id} onClick={() => addVisualToPost(v)}
                          disabled={isAttached}
                          style={{ position:'relative', padding:0, borderRadius:8, overflow:'hidden', border: isAttached ? '2px solid var(--wl-primary, #0A6FB0)' : '1px solid var(--border)', background:'#F1F5F9', aspectRatio:'1/1', cursor: isAttached ? 'default' : 'pointer' }}>
                          {v.signed_url && <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>}
                          {isAttached && (
                            <div style={{ position:'absolute', inset:0, background:'rgba(10,111,176,0.35)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <span style={{ background:'#fff', color:'var(--wl-primary, #0A6FB0)', padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700 }}>Hinzugefügt</span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)', flexShrink:0 }}>
                <button className="lk-btn lk-btn-ghost" onClick={() => setVisualPickerOpen(false)}
                  >
                  Fertig
                </button>
              </div>
            </div>
          </div>
        )}

{/* Footer */}
        <div style={{ padding:'16px 24px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          {/* LINKS: Löschen · Abbrechen · Duplizieren — alle als neutrale Ghost-Buttons */}
          {(() => {
            const ghost = { display:'inline-flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:10, border:'1px solid var(--border, #E5E7EB)', background:'#fff', color:'var(--text-primary, rgb(20,20,43))', fontSize:13, fontWeight:600, cursor:'pointer' }
            return (
              <>
                {!isNew && (
                  <button onClick={() => { if (window.confirm('Beitrag löschen?')) onDelete(post.id) }} className="lk-btn lk-btn-ghost">
                    <Trash2 size={14} strokeWidth={1.75}/>Löschen
                  </button>
                )}
                <button onClick={onClose} className="lk-btn lk-btn-ghost">
                  <X size={14} strokeWidth={1.75}/>Abbrechen
                </button>
                {!isNew && (
                  <button onClick={async () => {
                    const uid = session.user.id
                    const { data: dup } = await supabase.from('content_posts').insert({
                      ...form,
                      id: undefined,
                      user_id: uid,
                      title: form.title + ' (Kopie)',
                      status: 'idee',
                      tags: Array.isArray(form.tags) ? form.tags : (typeof form.tags === 'string' ? form.tags.split(',').map(t=>t.trim()).filter(Boolean) : []),
                      scheduled_at: null,
                    }).select().single()
                    if (dup) { onSave(dup); }
                  }} className="lk-btn lk-btn-ghost">
                    <Copy size={14} strokeWidth={1.75}/>Duplizieren
                  </button>
                )}
              </>
            )
          })()}

          {/* SPACER */}
          <div style={{ flex:1 }}/>

          {/* "Post öffnen"-Link wenn bereits publiziert */}
          {form.linkedin_post_url && (
            <a href={form.linkedin_post_url} target="_blank" rel="noreferrer"
              style={{ padding:'9px 14px', borderRadius:10, border:'1px solid #BBF7D0', background:'#F0FDF4', color:'#065F46', fontSize:13, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, textDecoration:'none' }}>
              ✓ Post öffnen
            </a>
          )}

          {/* RECHTS: Speichern · Auf LinkedIn posten / planen — gleiche Brand-Primary-Farbe */}
          <button className="lk-btn lk-btn-cta" onClick={save} disabled={saving}
            style={{ opacity: saving ? 0.7 : 1, display:'inline-flex', alignItems:'center', gap:5 }}>
            {saving ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={12} className='lk-spin'/>Speichere…</span> : isNew ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Plus size={12}/>Erstellen</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Save size={12}/>Speichern</span>}
          </button>
          {/* Phase 2a: Unipile-Route-Schalter (nur Person-Posts) — schaltet Monitoring frei */}
          {isPersonalPost && form.platform !== 'instagram' && form.content && form.status !== 'published' && (
            <label
              title="Veröffentlicht über die Unipile-Server-Automation statt der nativen LinkedIn-API — ermöglicht Reichweiten-Monitoring (Impressions, Reaktionen, Kommentare). Erfordert einen verbundenen Unipile-LinkedIn-Account."
              style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color:'var(--text-muted, #6B7280)', cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={viaUnipile} onChange={e => setViaUnipile(e.target.checked)}
                style={{ accentColor:'var(--wl-primary, #0A6FB0)', cursor:'pointer' }} />
              Über Unipile posten (Monitoring)
            </label>
          )}
          {isPersonalPost && form.platform !== 'instagram' && form.content && form.status !== 'published' && (() => {
            const hasSchedule = !!form.scheduled_at
            const future = hasSchedule && new Date(form.scheduled_at) > new Date()
            return (
              <button className="lk-btn lk-btn-cta" onClick={async () => {
                // ── Phase 2a: Unipile-Route (mit Monitoring) ──
                if (viaUnipile) {
                  if (!post?.id) { alert('Bitte zuerst speichern.'); return }
                  setSaving(true)
                  try {
                    // publish_channel='unipile' SEPARAT setzen (CHECK-Constraint, Fallstrick #1)
                    const { error: chErr } = await supabase.from('content_posts')
                      .update({ publish_channel: 'unipile' }).eq('id', post.id)
                    if (chErr) throw chErr
                    if (future) {
                      if (!window.confirm(`Auto-Publish über Unipile einplanen für ${new Date(form.scheduled_at).toLocaleString('de-DE')}? Der Dispatcher postet dann automatisch.`)) { setSaving(false); return }
                      await supabase.from('post_publish_queue').delete().eq('post_id', post.id).eq('status', 'pending')
                      const { error: qErr } = await supabase.from('post_publish_queue').insert({
                        post_id: post.id, team_id: activeTeamId,
                        scheduled_for: new Date(form.scheduled_at).toISOString(), status: 'pending',
                      })
                      if (qErr) throw qErr
                      const scheduledIso = new Date(form.scheduled_at).toISOString()
                      const { data: updated, error: upErr } = await supabase.from('content_posts')
                        .update({ status: 'scheduled', scheduled_at: scheduledIso }).eq('id', post.id).select().single()
                      if (upErr) throw upErr
                      upd('status', 'scheduled')
                      if (updated && onSave) onSave(updated)
                    } else {
                      if (!window.confirm('Jetzt sofort über Unipile auf LinkedIn posten?\n\nMit Reichweiten-Monitoring (Impressions/Reaktionen/Kommentare).')) { setSaving(false); return }
                      const { data, error } = await supabase.functions.invoke('unipile-post-publish', { body: { post_id: post.id } })
                      if (error) {
                        let body = null; try { body = await error.context?.json?.() } catch { /* Body evtl. schon konsumiert */ }
                        if (error.context?.status === 409) throw new Error('Kein aktiver Unipile-LinkedIn-Account verbunden. Bitte unter Einstellungen → LinkedIn verbinden.')
                        throw new Error(body?.error || error.message)
                      }
                      if (data?.error) throw new Error(data.error)
                      if (data?.success) {
                        upd('status', 'published')
                        upd('published_at', new Date().toISOString())
                        if (data.published_url) upd('linkedin_post_url', data.published_url)
                        const { data: fresh } = await supabase.from('content_posts').select('*').eq('id', post.id).maybeSingle()
                        if (fresh && onSave) onSave(fresh)
                        alert('Live auf LinkedIn (über Unipile)!')
                      } else {
                        alert('Posten fehlgeschlagen: ' + (data?.error || 'Unbekannte Antwort'))
                      }
                    }
                  } catch (e) {
                    alert('Unipile-Publishing fehlgeschlagen: ' + (e.message || 'Unbekannt'))
                  } finally { setSaving(false) }
                  return
                }
                if (!liConnected) {
                  if (activeBrandVoice?.noBrand || !form.brand_voice_id) {
                    alert('Auf LinkedIn posten oder planen geht nur im Redaktionsplan einer Marke. Wechsle oben von „Ohne Brand" zu einer Brand (mit verknüpftem LinkedIn-Profil), um diesen Beitrag zu veröffentlichen.')
                  } else {
                    alert('Um auf LinkedIn zu posten oder zu planen, verknüpfe zuerst ein LinkedIn-Profil in dieser Brand (Branding → Personal Brand → LinkedIn verbinden).')
                  }
                  return
                }
                if (!post?.id) { alert('Bitte zuerst speichern.'); return }
                if (future) {
                  if (!window.confirm(`Auto-Publish einplanen für ${new Date(form.scheduled_at).toLocaleString('de-DE')}? Der Worker postet dann automatisch.`)) return
                  setSaving(true)
                  try {
                    await supabase.from('post_publish_queue').delete().eq('post_id', post.id).eq('status', 'pending')
                    const { error: qErr } = await supabase.from('post_publish_queue').insert({
                      post_id: post.id,
                      team_id: activeTeamId,
                      scheduled_for: new Date(form.scheduled_at).toISOString(),
                      status: 'pending',
                    })
                    if (qErr) throw qErr
                    // Status DIREKT auf content_posts updaten — kein Closure-Roundtrip via save()
                    // (vorheriger Bug: upd() ist async + setTimeout(save) hatte alte form-Closure)
                    const scheduledIso = new Date(form.scheduled_at).toISOString()
                    const { data: updated, error: upErr } = await supabase.from('content_posts')
                      .update({ status: 'scheduled', scheduled_at: scheduledIso })
                      .eq('id', post.id)
                      .select()
                      .single()
                    if (upErr) throw upErr
                    upd('status', 'scheduled')
                    if (updated && onSave) onSave(updated)  // damit Board-Karte sofort wandert
                  } catch (e) {
                    alert('Einplanen fehlgeschlagen: ' + (e.message || 'Unbekannt'))
                  } finally { setSaving(false) }
                  return
                }
                if (!window.confirm('Jetzt sofort auf LinkedIn posten?\n\nText wird über die offizielle LinkedIn-Posts-API veröffentlicht.')) return
                setSaving(true)
                try {
                  const { data, error } = await supabase.functions.invoke('linkedin-publish-post', { body: { post_id: post.id } })
                  if (error) throw error
                  if (data?.error) throw new Error(data.error)
                  if (data?.success && data?.linkedin_post_url) {
                    // Edge-Function setzt status='published' selbst, hier nur State syncen
                    upd('status', 'published')
                    upd('published_at', new Date().toISOString())
                    upd('linkedin_post_url', data.linkedin_post_url)
                    // Frische Row vom Server holen (Edge-Function-Updates inklusive)
                    const { data: fresh } = await supabase.from('content_posts').select('*').eq('id', post.id).maybeSingle()
                    if (fresh && onSave) onSave(fresh)
                    alert('Live auf LinkedIn!')
                  } else {
                    alert('Posten fehlgeschlagen: ' + (data?.error || 'Unbekannte Antwort'))
                  }
                } catch (e) {
                  alert('Posten fehlgeschlagen: ' + (e.message || 'Unbekannt'))
                } finally { setSaving(false) }
              }} disabled={saving} title={(!liConnected && !viaUnipile) ? ((activeBrandVoice?.noBrand || !form.brand_voice_id) ? 'Nur im Redaktionsplan einer Marke möglich' : 'Kein LinkedIn-Profil mit dieser Brand verknüpft — erst verbinden') : undefined} style={{ display:'flex', alignItems:'center', gap:5, opacity: (!liConnected && !viaUnipile) ? 0.9 : 1 }}>
                {future
                  ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Calendar size={13}/>{viaUnipile ? 'Über Unipile einplanen' : 'Auto-Publish einplanen'}</span>
                  : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Rocket size={13}/>{viaUnipile ? 'Jetzt über Unipile posten' : 'Jetzt auf LinkedIn posten'}</span>}
              </button>
            )
          })()}
          {/* Instagram — Sofort-Veröffentlichung ODER Auto-Publish einplanen (Bild-Pflicht) */}
          {isPersonalPost && form.platform === 'instagram' && form.status !== 'published' && (() => {
            const future = !!form.scheduled_at && new Date(form.scheduled_at) > new Date()
            return (
              <button onClick={async () => {
                if (!post?.id) { alert('Bitte zuerst speichern.'); return }
                const cover = postVisuals[0]
                if (!cover?.signed_url) { alert('Instagram benötigt ein Bild oder Video. Bitte zuerst ein Visual hinzufügen.'); return }
                // ── Zukünftiger Termin → Auto-Publish einplanen (Cron-Worker) ──
                if (future) {
                  if (!window.confirm(`Auto-Publish einplanen für ${new Date(form.scheduled_at).toLocaleString('de-DE')}? Der Worker postet dann automatisch auf Instagram.`)) return
                  setSaving(true)
                  try {
                    await supabase.from('post_publish_queue').delete().eq('post_id', post.id).eq('status', 'pending')
                    const { error: qErr } = await supabase.from('post_publish_queue').insert({
                      post_id: post.id, team_id: activeTeamId,
                      scheduled_for: new Date(form.scheduled_at).toISOString(), status: 'pending',
                    })
                    if (qErr) throw qErr
                    const scheduledIso = new Date(form.scheduled_at).toISOString()
                    const { data: updated, error: upErr } = await supabase.from('content_posts')
                      .update({ status: 'scheduled', scheduled_at: scheduledIso }).eq('id', post.id).select().single()
                    if (upErr) throw upErr
                    upd('status', 'scheduled')
                    if (updated && onSave) onSave(updated)
                  } catch (e) {
                    alert('Einplanen fehlgeschlagen: ' + (e.message || 'Unbekannt'))
                  } finally { setSaving(false) }
                  return
                }
                // ── Sofort veröffentlichen ──
                if (!window.confirm('Jetzt auf Instagram veröffentlichen?\n\nDas Cover-Visual wird über die offizielle Instagram-API gepostet.')) return
                setSaving(true)
                try {
                  const ext = (cover.storage_path?.split('.').pop() || '').toLowerCase()
                  const mediaType = ['mp4','mov','m4v'].includes(ext) ? 'REELS' : 'IMAGE'
                  const res = await publishToInstagram({ mediaUrl: cover.signed_url, caption: form.content || '', mediaType })
                  if (res?.ok) {
                    const nowIso = new Date().toISOString()
                    const { data: updated } = await supabase.from('content_posts')
                      .update({ status: 'published', published_at: nowIso })
                      .eq('id', post.id).select().maybeSingle()
                    upd('status', 'published')
                    upd('published_at', nowIso)
                    if (updated && onSave) onSave(updated)
                    alert('Live auf Instagram!')
                  } else {
                    alert('Veröffentlichung abgelehnt: ' + (res?.error || 'Unbekannt'))
                  }
                } catch (e) {
                  alert('Veröffentlichen fehlgeschlagen: ' + (e.message || 'Unbekannt'))
                } finally { setSaving(false) }
              }} disabled={saving} style={{ padding:'9px 16px', borderRadius:10, border:'none', background: saving ? '#94A3B8' : '#E1306C', color:'#fff', fontSize:13, fontWeight:700, cursor: saving ? 'wait' : 'pointer', display:'flex', alignItems:'center', gap:5 }}>
                {future
                  ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Calendar size={13}/>Auto-Publish einplanen</span>
                  : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Rocket size={13}/>Jetzt auf Instagram posten</span>}
              </button>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function Redaktionsplan({ session }) {
  const { isMobile } = useResponsive()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const { activeTeamId, members } = useTeam()
  const { activeBrandVoice, brandVoices, switchBrandVoice, noBrand } = useBrandVoice()
  const brainstormCompanyVoices = (brandVoices || []).filter(v => v.account_type === 'company_page')
  const [posts, setPosts]         = useState([])
  const [teamTags, setTeamTags]   = useState([])
  const tagMap = useMemo(() => Object.fromEntries((teamTags || []).map(t => [t.id, t])), [teamTags])
  async function loadTeamTags() {
    if (!activeTeamId) { setTeamTags([]); return }
    let { data } = await supabase.from('content_tags').select('*').eq('team_id', activeTeamId).order('position', { ascending: true })
    if (!data || data.length === 0) {
      const seed = DEFAULT_TAG_COLORS.map((c, i) => ({ team_id: activeTeamId, name: '', color: c, position: i }))
      await supabase.from('content_tags').insert(seed)
      const r = await supabase.from('content_tags').select('*').eq('team_id', activeTeamId).order('position', { ascending: true })
      data = r.data
    }
    setTeamTags(data || [])
  }
  useEffect(() => { loadTeamTags() }, [activeTeamId])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState('kanban')  // kanban | kalender | liste
  const [modal, setModal]         = useState(null)      // null | {} | post
  const [workspace, setWorkspace] = useState('personal') // personal | company | team_support
  const [calDate, setCalDate]     = useState(new Date())
  const [search, setSearch]       = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [improving, setImproving] = useState(false)
  const [showBrainstorm, setShowBrainstorm] = useState(false)
  const { model: selectedModel, setModel: setSelectedModel } = useModel()

  // BV-Multi-Picker: Default nur die aktive BV; User kann mehrere ankreuzen
  const [availableBVs, setAvailableBVs]   = useState([])
  const [selectedBVIds, setSelectedBVIds] = useState([])
  const [bvPickerOpen, setBvPickerOpen]   = useState(false)

  // Verfügbare BVs des Users laden (für den Multi-Picker)
  useEffect(() => {
    if (!session?.user?.id || !activeTeamId) return
    ;(async () => {
      const _shared = await sharedEntityIds('brand_voices', activeTeamId)
      const { data } = await scopeByTeamOrShared(supabase.from('brand_voices').select('id, name'), activeTeamId, _shared)
        .order('updated_at', { ascending: false })
      setAvailableBVs(data || [])
    })()
  }, [session?.user?.id, activeTeamId])

  // Wenn aktive BV wechselt → Selection auf diese eine zurücksetzen
  useEffect(() => {
    if (activeBrandVoice?.id) setSelectedBVIds([activeBrandVoice.id])
  }, [activeBrandVoice?.id])

  const [brainstormIdeas, setBrainstormIdeas] = useState([])
  const [brainstormTopic, setBrainstormTopic] = useState('')
  const [brainstormSelected, setBrainstormSelected] = useState(new Set())
  const [brainstormCount, setBrainstormCount]       = useState(6)
  const [brainstormCompanyIds, setBrainstormCompanyIds] = useState([])
  const [brainstormAudienceId, setBrainstormAudienceId] = useState('')
  const [brainstormKnowledgeIds, setBrainstormKnowledgeIds] = useState([])
  const [brainstormAudiences, setBrainstormAudiences] = useState([])
  const [brainstormKnowledge, setBrainstormKnowledge] = useState([])
  const [showBsKnowledge, setShowBsKnowledge] = useState(false)

  // Zielgruppen + Wissen fürs Brainstorm-Dropdown laden (team-scoped via RLS)
  useEffect(() => {
    if (!activeTeamId) return
    ;(async () => {
      const [_taS, _kbS] = await Promise.all([
        sharedEntityIds('target_audiences', activeTeamId),
        sharedEntityIds('knowledge_base', activeTeamId),
      ])
      const [aRes, kRes] = await Promise.all([
        scopeByTeamOrShared(supabase.from('target_audiences').select('*'), activeTeamId, _taS).order('name', { ascending: true }),
        scopeByTeamOrShared(supabase.from('knowledge_base').select('*'), activeTeamId, _kbS).order('updated_at', { ascending: false }),
      ])
      setBrainstormAudiences(aRes.data || [])
      setBrainstormKnowledge(kRes.data || [])
    })()
  }, [activeTeamId])

  async function generateIdeas(customTopic = '') {
    setGenerating(true)
    setBrainstormIdeas([])
    setBrainstormSelected(new Set())
    try {
      // Brand-Voice-Kontext kommt vollständig serverseitig (generate injiziert die in
      // der Topbar gewählte Brand). Hier nur noch: bisherige Top-Posts als Few-Shot.
      const bvId = activeBrandVoice?.id || null
      let bvPosts = []
      if (bvId) {
        const { data: posts } = await supabase.from('content_posts')
          .select('title, content, status')
          .eq('brand_voice_id', bvId)
          .in('status', ['published','approved','scheduled','draft'])
          .not('content', 'is', null)
          .order('created_at', { ascending: false })
          .limit(6)
        bvPosts = (posts || []).filter(p => (p.content || '').length > 50)
      }

      // Prompt-Aufbau: striktes Headline-Only-Schema. Brand-Voice kommt serverseitig.
      let prompt = ''

      // Zielgruppe & Wissen nur wenn per Dropdown gewählt
      const bsAud = brainstormAudiences.find(a => a.id === brainstormAudienceId)
      if (bsAud) prompt += buildAudiencePrompt(bsAud) + `\n\n`
      const bsKb = brainstormKnowledge.filter(k => brainstormKnowledgeIds.includes(k.id))
      if (bsKb.length) prompt += buildKnowledgePrompt(bsKb) + `\n\n`

      if (bvPosts.length) {
        prompt += `BISHERIGE POSTS DIESER BRAND VOICE (NUR als Stil-Referenz, NICHT kopieren — neue Ideen müssen sich anders anfühlen):\n`
        bvPosts.forEach((p, i) => {
          prompt += `\nPost ${i+1}:\n`
          if (p.title) prompt += `Titel: ${p.title}\n`
          prompt += `${(p.content || '').slice(0, 400)}\n`
        })
        prompt += `\n`
      }

      if (brainstormCompanyIds.length) {
        const companyBlock = await fetchCompanyPromptBlocks(brainstormCompanyIds)
        if (companyBlock) prompt += companyBlock + `\n`
      }

      prompt += `AUFGABE:\nGeneriere ${brainstormCount} LinkedIn-Post-Themen, exakt in dieser Brand-Voice (nicht generisch, nicht "Sales-Berater"-Floskeln). Nur Themen-Headlines — keine ausgearbeiteten Texte, keine Strategie-Briefings.\n\n`

      if (customTopic) prompt += `SCHWERPUNKT: ${customTopic}\n\n`

      prompt += `Mische diese Themen-Arten:\n`
      prompt += `- Persönliche Story/Erfahrung\n- Kontroverse These\n- Konkreter Praxis-Tipp\n- Beobachtung aus der Branche\n- Reframing einer verbreiteten Meinung\n- Lernmoment / Fehler-Aha\n\n`

      prompt += `Antworte NUR mit JSON-Array (kein Markdown, kein Kommentar drumherum):\n`
      prompt += `[{"title":"Die Post-Headline (max 80 Zeichen, im Brand-Voice-Stil)","hook":"Optional 1-Satz-Aufhänger (max 120 Zeichen)"}]\n`
      prompt += `\nKEIN angle-Feld, KEINE Strategie-Texte, KEINE Erklärungen. Nur title + hook.`

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
        body: { type: 'content_brainstorm', prompt, userId: session.user.id, model: selectedModel, brand_voice_id: activeBrandVoice?.id || null }
      })
      if (fnErr) throw fnErr
      const text = fnData?.text || fnData?.result || '[]'
      const clean = text.replace(/```json|```/g,'').trim()
      const m = clean.match(/\[[\s\S]*\]/)
      const ideas = JSON.parse(m ? m[0] : clean)
      // Strip alle Felder ausser title + hook, falls Modell sich verschluckt
      const cleaned = (ideas || []).slice(0, brainstormCount).map(idea => ({
        title: (idea.title || idea.headline || '').toString().trim(),
        hook:  (idea.hook  || '').toString().trim(),
      })).filter(i => i.title)
      setBrainstormIdeas(cleaned)
      // Memory: protokolliere die Brainstorm-Generation
      try {
        const { recordGeneration } = await import('../lib/contentMemory')
        await recordGeneration({
          userId: session.user.id, teamId: activeTeamId,
          kind: 'brainstorm', model: selectedModel, brand_voice_id: activeBrandVoice?.id || null,
          promptInput: { topic: customTopic || null, hasBV: !!bvId, bvPostsUsed: bvPosts.length },
          resolvedPrompt: prompt,
          brandVoiceId: bv?.id || null,
          variants: cleaned,
        })
      } catch (memErr) { console.warn('[brainstorm-memory]', memErr.message) }
    } catch(e) {
      setBrainstormIdeas([{ title:'Fehler beim Generieren', hook: e.message || 'Bitte nochmal versuchen.' }])
    }
    setGenerating(false)
  }

  async function adoptSelectedIdeas() {
    const uid = session.user.id
    const toCreate = brainstormIdeas.filter((_, i) => brainstormSelected.has(i))
    if (!activeBrandVoice?.id) { alert('Keine aktive Brand Voice — bitte oben rechts auswählen.'); return }
    if (!activeTeamId)         { alert('Kein Team aktiv'); return }
    const created = []
    for (const idea of toCreate) {
      // Leere Idee-Karte: NUR title, content komplett leer, kein hook/angle übernommen
      const { data: post, error: insErr } = await supabase.from('content_posts').insert({
        user_id: uid, team_id: activeTeamId, workspace,
        brand_voice_id: activeBrandVoice.id,
        company_voice_id: brainstormCompanyIds[0] || null,
        company_voice_ids: brainstormCompanyIds,
        title: idea.title || 'Neue Idee',
        content: '',
        platform: 'linkedin', status: 'idee',
      }).select().single()
      if (insErr) { console.error('[adopt-idea]', insErr); continue }
      if (post) { setPosts(prev => [post, ...prev]); created.push(post) }
    }
    setShowBrainstorm(false)
    setBrainstormIdeas([])
    setBrainstormSelected(new Set())
    setBrainstormTopic('')
  }

  useEffect(() => {
    if (activeTeamId) loadPosts()
    const leadId   = searchParams.get('lead')
    const leadName = searchParams.get('name')
    const company  = searchParams.get('company')
    if (leadId && leadName) {
      openNew({
        title: `Post über ${leadName}${company ? ' – ' + company : ''}`,
        content: `Ich hatte heute ein inspirierendes Gespräch mit ${leadName}${company ? ' von ' + company : ''}.

[Dein Erlebnis / Erkenntnis aus dem Gespräch]

Was mich besonders beeindruckt hat:
→ [Punkt 1]
→ [Punkt 2]

Danke für den Austausch! 🤝`,
        platform: 'linkedin',
        status: 'draft',
      })
    }
  }, [])

  // ?open=POST_ID öffnet das PostModal direkt — für Closed-Loop aus
  // Text-Werkstatt / Visuals / Medien zurück zum konkreten Beitrag.
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId) return
    ;(async () => {
      const { data: p } = await supabase.from('content_posts').select('*').eq('id', openId).maybeSingle()
      if (p) {
        // Damit auch BV-Filter passt: wenn der Post in einer anderen BV ist als
        // aktuell selektiert, BV-Selection auf seine BV setzen
        if (p.brand_voice_id && p.brand_voice_id !== activeBrandVoice?.id) {
          try { switchBrandVoice(p.brand_voice_id) } catch (_) {}
        }
        setModal(p)
      }
    })()
  }, [searchParams])

  async function loadPosts() {
    setLoading(true)
    if (!activeTeamId) { setPosts([]); setLoading(false); return }
    const _sharedBv = await sharedBrandVoiceIds(activeTeamId)
    let q = scopeContentByTeamOrSharedBV(supabase.from('content_posts')
      .select('*, post_publish_queue ( status, scheduled_for, attempts, error_message, last_response_status, created_at ), content_post_tags ( tag_id )'), activeTeamId, _sharedBv)
      .order('created_at', { ascending: false })
    // BV-Multi-Filter: ausgewaehlte BVs
    if (noBrand) q = q.eq('no_brand', true).eq('user_id', session.user.id)
    else if (selectedBVIds.length > 0) q = q.in('brand_voice_id', selectedBVIds)
    const { data } = await q
    const bvNameMap = Object.fromEntries((availableBVs || []).map(b => [b.id, b.name]))
    const flattened = (data || []).map(p => {
      const queue = Array.isArray(p.post_publish_queue) ? p.post_publish_queue : []
      const latest = queue.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      return {
        ...p,
        publish_queue_status: latest?.status || null,
        publish_queue_error: latest?.error_message || null,
        publish_queue_attempts: latest?.attempts || 0,
        bv_name: bvNameMap[p.brand_voice_id] || null,
        tag_ids: Array.isArray(p.content_post_tags) ? p.content_post_tags.map(x => x.tag_id) : [],
      }
    })
    setPosts(flattened)
    setLoading(false)
  }

  // Re-load wenn sich BV-Selection / Team / Workspace / BV-Liste ändert
  useEffect(() => { if (activeTeamId && (noBrand || selectedBVIds.length > 0)) loadPosts() }, [selectedBVIds.join(','), noBrand, activeTeamId, workspace, availableBVs.length])

    function openNew(defaults = {}) { setModal({ ...defaults }) }
  function openEdit(post) { setModal(post) }
  function closeModal() { setModal(null) }

  function handleSave(saved) {
    setPosts(prev => {
      const idx = prev.findIndex(p => p.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [saved, ...prev]
    })
    closeModal()
  }

  async function handleDelete(id) {
    await supabase.from('content_posts').delete().eq('id', id)
    setPosts(prev => prev.filter(p => p.id !== id))
    closeModal()
  }

  // Gefilterte Posts (nur noch Suche)
  const filtered = posts.filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    return (p.title || '').toLowerCase().includes(s) || (p.content || '').toLowerCase().includes(s)
  })

  // Sind mehrere BVs ausgewählt? Dann BV-Badges auf Karten anzeigen.
  const showBVBadges = selectedBVIds.length > 1

  // ── Kalender ──
  const calYear  = calDate.getFullYear()
  const calMonth = calDate.getMonth()
  const calDays  = getCalendarDays(calYear, calMonth)
  const today    = new Date()

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>

      {/* Header */}
      <div style={{ padding:'0 0 20px', display:'flex', flexDirection:'column', gap:16, flexShrink:0 }}>

        {/* Toolbar — BV-Picker + Brainstorm + Neu IMMER sichtbar (auch im Empty-State).
            Search + View-Toggle nur wenn Posts existieren. */}
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>

          {/* Search — nur bei vorhandenen Posts */}
          {posts.length > 0 && (
            <div style={{ position:'relative', flex:1, minWidth:200 }}>
              <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', display:'inline-flex' }}><Search size={14} strokeWidth={1.75}/></span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Beiträge suchen…"
                style={{ width:'100%', padding:'8px 12px 8px 32px', borderRadius:10, border:'1.5px solid #E5E7EB',
                  fontSize:13, outline:'none', boxSizing:'border-box' }}/>
            </div>
          )}
          {/* Spacer im Empty-State damit BV-Picker und Buttons rechts gegroupt sind */}
          {posts.length === 0 && <div style={{ flex:1 }}/>}

          {/* View Toggle — nur wenn Posts existieren */}
          {posts.length > 0 && (
            <div data-tour-id="rp-views" style={{ display:'flex', background:'#F1F5F9', borderRadius:10, padding:3, gap:2 }}>
              {[['kanban','Board',<LayoutGrid size={12} strokeWidth={1.75}/>],['woche','Woche',<CalendarRange size={12} strokeWidth={1.75}/>],['kalender','Monat',<Calendar size={12} strokeWidth={1.75}/>],['liste','Liste',<List size={12} strokeWidth={1.75}/>]].map(([v,l,ic]) => (
                <button key={v} onClick={() => setView(v)}
                  style={{ padding:'6px 12px', borderRadius:8, border:'none', fontSize:12, fontWeight:700, cursor:'pointer',
                    background: view===v ? '#fff' : 'transparent', color: view===v ? 'var(--wl-primary, #0A6FB0)' : '#64748B',
                    boxShadow: view===v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition:'all 0.15s' }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* Brainstorm Button (Primary CTA) */}
          <button data-tour-id="rp-brainstorm" className="lk-btn lk-btn-ghost" onClick={() => setShowBrainstorm(true)}
            style={{ display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Brain size={13}/>Brainstormen</span>
          </button>

          {/* Neu Button */}
          <button className="lk-btn lk-btn-navy" data-tour-id="rp-new-post" onClick={() => openNew()}
            style={{ display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6}}><PenLine size={13}/>Neuer Beitrag</span>
          </button>
        </div>
      </div>


      {/* ── VORLAGEN PANEL ── */}
      {showTemplates && (
        <div style={{ background:'var(--surface)', border:'1.5px solid #E5E7EB', borderRadius:16, padding:20, marginBottom:16, flexShrink:0 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'rgb(20,20,43)', marginBottom:12 }}>Content-Vorlagen</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:10 }}>
            {[
              { title:'Thought Leadership', platform:'linkedin', content:'Eine Erkenntnis, die meine Perspektive auf [Thema] verändert hat:\n\n[Kernaussage]\n\nWas ich daraus gelernt habe:\n→ [Punkt 1]\n→ [Punkt 2]\n→ [Punkt 3]\n\nDeine Meinung?', status:'idee' },
              { title:'Daten & Insights', platform:'linkedin', content:'[X]% der [Zielgruppe] kämpfen mit [Problem].\n\nHier ist, was hilft:\n\n1. [Lösung 1]\n2. [Lösung 2]\n3. [Lösung 3]\n\nWelche Erfahrung hast du?', status:'idee' },
              { title:'Problem-Lösung', platform:'linkedin', content:'Das größte Missverständnis über [Thema]:\n\n❌ Was die meisten denken: [Irrglauben]\n✅ Was stimmt: [Wahrheit]\n\nDer Unterschied:\n[Erklärung]\n\nWie siehst du das?', status:'idee' },
              { title:'Story & Erfahrung', platform:'linkedin', content:'Vor [X] Monaten hatte ich ein Gespräch, das alles verändert hat.\n\n[Situation]\n\nDie Lektion:\n[Kernaussage]\n\nSeitdem mache ich es so:\n[Tipp]', status:'idee' },
              { title:'Kontroverser Hook', platform:'linkedin', content:'Unpopuläre Meinung: [These]\n\nIch weiß, das klingt hart. Aber:\n\n[Begründung 1]\n[Begründung 2]\n[Begründung 3]\n\nBin ich der Einzige?', status:'idee' },
              { title:'Engagement Frage', platform:'linkedin', content:'Eine Frage, die mich beschäftigt:\n\n[Frage]\n\nMeine Meinung: [Deine Perspektive]\n\nWas denkst du? 👇', status:'idee' },
            ].map((tmpl, i) => (
              <div key={i} onClick={() => { openNew(tmpl); setShowTemplates(false) }}
                style={{ padding:'12px 14px', borderRadius:12, border:'1.5px solid #E5E7EB', cursor:'pointer',
                  borderLeft:`3px solid ${(PLATFORMS[tmpl.platform]||PLATFORMS.linkedin).color}`, transition:'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background='#F8FAFC'; e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)', marginBottom:4 }}>{tmpl.title}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{(PLATFORMS[tmpl.platform]||PLATFORMS.linkedin).icon} {(PLATFORMS[tmpl.platform]||PLATFORMS.linkedin).label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EMPTY-STATE HERO (wenn keine Posts existieren) ── */}
      {!loading && posts.length === 0 && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          textAlign: 'center',
          minHeight: 480,
        }}>
          <div style={{ marginBottom: 20, display:'inline-flex', color:'var(--text-muted)' }}><Calendar size={56} strokeWidth={1.5}/></div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: 'rgb(20,20,43)', margin: '0 0 10px', lineHeight: 1.25 }}>
            Plane deinen ersten LinkedIn-Post
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 480, lineHeight: 1.6, margin: '0 0 28px' }}>
            Hier wird dein Redaktionsplan aufgebaut. Lass dir Ideen von der KI vorschlagen oder leg direkt mit einem ersten Entwurf los.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="lk-btn lk-btn-primary" onClick={() => setShowBrainstorm(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Brain size={18} strokeWidth={1.75} style={{ color:'var(--wl-primary, #0A6FB0)' }}/>
              Mit KI brainstormen
            </button>
            <button className="lk-btn lk-btn-ghost" onClick={() => openNew()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <PenLine size={14} strokeWidth={1.75}/>
              Manuell anlegen
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 32, maxWidth: 420 }}>
            <span style={{display:'inline-flex',alignItems:'flex-start',gap:6}}><Lightbulb size={13} style={{flexShrink:0,marginTop:1}}/>Tipp: Die KI nutzt deine Brand Voice + bisherige Top-Posts und schlägt dir 6 personalisierte Ideen vor.</span>
          </p>
        </div>
      )}

      {/* ── KANBAN VIEW (nur wenn Posts existieren) ── */}
      {!loading && posts.length > 0 && view === 'kanban' && (
        <div style={{ flex:1, overflowX:'auto', overflowY:'hidden' }}>
          <div data-tour-id="rp-board" style={{ display:'flex', gap:16, height:'100%', minWidth: BUCKETS.length * 320 + 'px' }}>
            {BUCKETS.map(b => {
              const statusKeys = Object.entries(STATUS).filter(([k, v]) => v.bucket === b.key).map(([k]) => k)
              const cols = filtered.filter(p => statusKeys.includes(p.status))
              const bucketColor = b.key === 'ideen' ? '#64748B'
                : b.key === 'in_arbeit'  ? '#D97706'
                : b.key === 'eingeplant' ? '#2563EB'
                : '#059669'
              return (
                <div key={b.key}
                  onDragOver={e => e.preventDefault()}
                  onDrop={async e => {
                    e.preventDefault()
                    const postId = e.dataTransfer.getData('postId')
                    if (!postId) return
                    await supabase.from('content_posts').update({ status: b.status_default }).eq('id', postId)
                    setPosts(prev => prev.map(p => p.id===postId ? {...p, status:b.status_default} : p))
                  }}
                  style={{ flex:1, minWidth:300, display:'flex', flexDirection:'column', background:'var(--surface-muted)',
                  borderRadius:16, border:'1px solid var(--border)', overflow:'hidden' }}>
                  {/* Bucket Header */}
                  <div style={{ padding:'14px 16px', borderBottom:'2px solid #E5E7EB', background:'var(--surface)',
                    display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:14, fontWeight:800, color: bucketColor }}>{b.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, background: bucketColor + '20', color: bucketColor, borderRadius:99, padding:'1px 8px' }}>{cols.length}</span>
                      </div>
                      <span style={{ fontSize:10, color:'var(--text-muted)' }}>{b.desc}</span>
                    </div>
                    <button onClick={() => openNew({ status: b.status_default })}
                      style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:18,
                        lineHeight:1, borderRadius:6, padding:'2px 6px' }}
                      title="Neuer Beitrag"
                      onMouseEnter={e => e.currentTarget.style.color = bucketColor}
                      onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}>+</button>
                  </div>
                  {/* Cards */}
                  <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
                    {cols.length === 0 && (
                      <div style={{ textAlign:'center', padding:'30px 12px', color:'#CBD5E1', fontSize:12 }}>
                        Noch nichts hier
                      </div>
                    )}
                    {cols.map(p => <PostCard key={p.id} post={p} onClick={openEdit} showBVBadge={showBVBadges} tagMap={tagMap} />)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {/* ── WOCHEN VIEW ── */}
      {!loading && posts.length > 0 && view === 'woche' && (() => {
        // Aktuelle Woche Mo-So
        const now = new Date()
        const dow = (now.getDay() + 6) % 7 // Mo=0
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow); weekStart.setHours(0,0,0,0)
        const weekDays = Array.from({length:7}, (_,i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate()+i); return d })
        return (
          <div style={{ flex:1, display:'flex', gap:10, overflowX:'auto', minHeight:0 }}>
            {weekDays.map((day, i) => {
              const dayPosts = filtered.filter(p => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day))
              const isToday  = isSameDay(day, new Date())
              return (
                <div key={i} style={{ flex:1, minWidth:140, display:'flex', flexDirection:'column',
                  background: isToday ? '#EFF6FF' : '#F8FAFC', borderRadius:14,
                  border: isToday ? '2px solid #0A6FB0' : '1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', background: isToday ? 'var(--wl-primary, #0A6FB0)' : '#fff' }}>
                    <div style={{ fontSize:11, fontWeight:800, color: isToday ? 'rgba(255,255,255,0.7)' : '#94A3B8', textTransform:'uppercase' }}>{DAYS[i]}</div>
                    <div style={{ fontSize:18, fontWeight:800, color: isToday ? '#fff' : 'rgb(20,20,43)' }}>{day.getDate()}</div>
                  </div>
                  <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
                    {dayPosts.map(p => <PostCard key={p.id} post={p} onClick={openEdit} compact showBVBadge={showBVBadges} tagMap={tagMap} />)}
                    <button onClick={() => openNew({ scheduled_at: day.toISOString().slice(0,10)+'T09:00' })}
                      style={{ width:'100%', padding:'4px', borderRadius:6, border:'1px dashed #CBD5E1',
                        background:'none', color:'var(--text-muted)', fontSize:11, cursor:'pointer', marginTop:4 }}>
                      + Beitrag
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── KALENDER VIEW ── */}
      {!loading && posts.length > 0 && view === 'kalender' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
          {/* Monat Navigation */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexShrink:0 }}>
            <button className="lk-btn lk-btn-ghost" onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
              >‹</button>
            <div style={{ fontSize:18, fontWeight:800, color:'rgb(20,20,43)', flex:1, textAlign:'center' }}>
              {MONTHS[calMonth]} {calYear}
            </div>
            <button className="lk-btn lk-btn-ghost" onClick={() => setCalDate(new Date())}
              >Heute</button>
            <button className="lk-btn lk-btn-ghost" onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
              >›</button>
          </div>

          {/* ── MOBILE: Agenda-Liste statt 7-Spalten-Raster ── */}
          {isMobile && (() => {
            const monthPosts = filtered
              .filter(p => p.scheduled_at)
              .map(p => ({ p, d: new Date(p.scheduled_at) }))
              .filter(({ d }) => d.getFullYear() === calYear && d.getMonth() === calMonth)
              .sort((a, b) => a.d - b.d)
            if (monthPosts.length === 0) {
              return (
                <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:'40px 16px', color:'var(--text-muted)', textAlign:'center' }}>
                  <div style={{ fontSize:14 }}>Keine Beiträge im {MONTHS[calMonth]} {calYear}.</div>
                  <button className="lk-btn lk-btn-cta" onClick={() => openNew()}
                    >
                    Beitrag planen
                  </button>
                </div>
              )
            }
            const groups = []
            let curKey = null
            monthPosts.forEach(({ p, d }) => {
              const key = d.toDateString()
              if (key !== curKey) { groups.push({ date: d, posts: [] }); curKey = key }
              groups[groups.length - 1].posts.push(p)
            })
            return (
              <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:16, paddingBottom:24 }}>
                {groups.map((g, gi) => {
                  const isToday = isSameDay(g.date, today)
                  return (
                    <div key={gi}>
                      <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:8 }}>
                        <span style={{ fontSize:16, fontWeight:800, color: isToday ? 'var(--wl-primary, #0A6FB0)' : 'rgb(20,20,43)' }}>
                          {g.date.getDate()}. {MONTHS[g.date.getMonth()]}
                        </span>
                        <span style={{ fontSize:12, color:'var(--text-muted)', textTransform:'capitalize' }}>
                          {g.date.toLocaleDateString('de-DE', { weekday:'long' })}
                        </span>
                        {isToday && (
                          <span style={{ fontSize:10, fontWeight:700, color:'#fff', background:'var(--primary)', padding:'1px 8px', borderRadius:999 }}>Heute</span>
                        )}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {g.posts.map(p => {
                          const plt = PLATFORMS[p.platform] || PLATFORMS.linkedin
                          return (
                            <div key={p.id} onClick={() => openEdit(p)}
                              style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer' }}>
                              <span style={{ fontSize:17, flexShrink:0 }}>{plt.icon}</span>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {p.title || '(Kein Titel)'}
                                </div>
                                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                                  {new Date(p.scheduled_at).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })} Uhr · {plt.label}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* ── DESKTOP/TABLET: 7-Spalten-Monatsraster ── */}
          {!isMobile && (<>
          {/* Wochentage Header */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:2, flexShrink:0 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--text-muted)', padding:'6px 0', textTransform:'uppercase' }}>{d}</div>
            ))}
          </div>

          {/* Kalender-Grid */}
          <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', gridTemplateRows:`repeat(${calDays.length/7},1fr)`, gap:2, minHeight:0 }}>
            {calDays.map((day, i) => {
              const dayPosts = filtered.filter(p => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day.date))
              const isToday  = isSameDay(day.date, today)
              const isPast   = day.date < today && !isSameDay(day.date, today)
              return (
                <div key={i}
                  style={{ background: !day.current ? '#FAFAFA' : (()=>{ const d=day.date.getDay(); return (d===2||d===3||d===4)?'#FAFFF4':'#fff' })(), borderRadius:10,
                    border: isToday ? '2px solid #0A6FB0' : (()=>{ const d=day.date.getDay(); return (d===2||d===3||d===4)?'1px solid #A7F3D0':'1px solid #E5E7EB' })(),
                    padding:'6px', overflow:'hidden', cursor:'pointer', minHeight:80,
                    opacity: !day.current ? 0.5 : 1 }}
                  onClick={() => openNew({ scheduled_at: day.date.toISOString().slice(0,16) })}>
                  <div style={{ fontSize:11, fontWeight: isToday ? 800 : 600,
                    color: isToday ? 'var(--wl-primary, #0A6FB0)' : isPast ? '#94A3B8' : 'rgb(20,20,43)',
                    marginBottom:4, display:'flex', alignItems:'center', gap:4 }}>
                    {isToday && <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--primary)', display:'inline-block' }}/>}
                    {day.date.getDate()}
                  </div>
                  {dayPosts.slice(0,3).map(p => (
                    <div key={p.id} onClick={e => { e.stopPropagation(); openEdit(p) }}
                      style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, marginBottom:2,
                        background: (PLATFORMS[p.platform]||PLATFORMS.linkedin).bg,
                        color: (PLATFORMS[p.platform]||PLATFORMS.linkedin).color,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                      {(PLATFORMS[p.platform]||PLATFORMS.linkedin).icon} {p.title || '(Kein Titel)'}
                    </div>
                  ))}
                  {dayPosts.length > 3 && (
                    <div style={{ fontSize:9, color:'var(--text-muted)', fontWeight:600 }}>+{dayPosts.length-3} weitere</div>
                  )}
                </div>
              )
            })}
          </div>
          </>)}
        </div>
      )}

      {/* ── LISTE VIEW ── */}
      {!loading && posts.length > 0 && view === 'liste' && (
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading && <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Lädt…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:60, color:'#CBD5E1' }}>
              <div style={{ marginBottom:12, display:'inline-flex', color:'var(--wl-primary, #0A6FB0)' }}><PenLine size={40} strokeWidth={1.5}/></div>
              <div style={{ fontSize:16, fontWeight:700 }}>Noch keine Beiträge</div>
              <div style={{ fontSize:13, marginTop:8 }}>Erstelle deinen ersten Content-Plan</div>
              <button className="lk-btn lk-btn-navy" onClick={() => openNew()}
                style={{ marginTop:16 }}>
                <span style={{display:'inline-flex',alignItems:'center',gap:6}}><PenLine size={13}/>Ersten Beitrag erstellen</span>
              </button>
            </div>
          )}
          {filtered.length > 0 && (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--surface-muted)' }}>
                  {['Plattform','Titel','Status','Geplant für','Tags'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700,
                      color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'2px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const plt = PLATFORMS[p.platform] || PLATFORMS.linkedin
                  const sts = STATUS[p.status] || STATUS.idee
                  return (
                    <tr key={p.id} onClick={() => openEdit(p)}
                      style={{ borderBottom:'1px solid #F1F5F9', cursor:'pointer', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ fontSize:12, fontWeight:700, color: plt.color, background: plt.bg,
                          padding:'3px 10px', borderRadius:99, border:`1px solid ${plt.color}30` }}>
                          {plt.icon} {plt.label}
                        </span>
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:13, fontWeight:600, color:'rgb(20,20,43)', maxWidth:300 }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {p.title || '(Kein Titel)'}
                        </div>
                        {p.content && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.content.slice(0,80)}…</div>}
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, color: sts.color, background: sts.bg,
                          padding:'3px 10px', borderRadius:99, border:`1px solid ${sts.border}` }}>{sts.label}</span>
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                        {p.scheduled_at ? (
                          <>
                            <span>{new Date(p.scheduled_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</span>
                            <span style={{ marginLeft:6, color: new Date(p.scheduled_at) < new Date() && p.status !== 'published' ? '#ef4444' : '#94A3B8', fontWeight:600 }}>
                              {relativeDate(p.scheduled_at)}
                            </span>
                          </>
                        ) : <span style={{ color:'#CBD5E1' }}>—</span>}
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {(p.tags||[]).slice(0,3).map(t => (
                            <span key={t} style={{ fontSize:10, padding:'1px 7px', borderRadius:99,
                              background:'#EFF6FF', color:'#1d4ed8', border:'1px solid #BFDBFE', fontWeight:600 }}>#{t}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <PostModal post={modal} onClose={closeModal} onSave={handleSave} onDelete={handleDelete} session={session} activeTeamId={activeTeamId} members={members} workspace={workspace} selectedModel={selectedModel} activeBrandVoice={activeBrandVoice} navigate={navigate} teamTags={teamTags} onTagsChanged={loadTeamTags} />
      )}

      {/* ── BRAINSTORM-MODAL ── */}
      {showBrainstorm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => e.target === e.currentTarget && setShowBrainstorm(false)}>
          <div style={{ background:'var(--surface)', borderRadius:18, width:'100%', maxWidth:780, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding:'18px 22px 14px', background:'linear-gradient(135deg, rgba(10,111,176,.08), rgba(0,48,96,.06))' }}>
              <div style={{ fontSize:11, color:'var(--wl-primary, #0A6FB0)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'inline-flex', alignItems:'center', gap:6 }}><Brain size={12} strokeWidth={1.75}/>Brainstorming-Session</div>
              <h2 style={{ fontSize:22, fontWeight:700, color:'rgb(20,20,43)', margin:0 }}>Was möchtest du heute posten?</h2>
              <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.5 }}>
                Lass dir Ideen passend zu deiner Brand Voice generieren. Die KI nutzt deinen Markenkontext und deine bisherigen Top-Posts.
              </p>
              <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:10 }}>
                <input value={brainstormTopic} onChange={e => setBrainstormTopic(e.target.value)}
                  placeholder="Schwerpunkt-Thema (optional, z.B. 'Vertrauen aufbauen', 'KI im Sales')"
                  style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:9, border:'1.5px solid var(--border)', fontSize:13, outline:'none', background:'var(--surface)' }}/>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <PillSelect icon={Lightbulb} neutral value={brainstormCount} onChange={setBrainstormCount}
                  options={[3,6,9,12].map(n => ({ value:n, label:`${n} Ideen` }))} title="Anzahl Ideen" buttonStyle={{ width:108, height:38, boxSizing:'border-box' }} />
                {brainstormCompanyVoices.length > 0 && activeBrandVoice?.account_type !== 'company_page' && (
                  <CompanyMultiSelect companies={brainstormCompanyVoices} value={brainstormCompanyIds} onChange={setBrainstormCompanyIds} buttonStyle={{ padding:'9px 10px', fontSize:13, fontWeight:600, width:168, height:38, boxSizing:'border-box' }} />
                )}
                {brainstormAudiences.length > 0 && (
                  <PillSelect icon={Target} value={brainstormAudienceId} onChange={setBrainstormAudienceId} placeholder="Zielgruppe" title="Optional: Zielgruppe für diese Ideen" buttonStyle={{ width:150, height:38, boxSizing:'border-box' }}
                    options={[{ value:'', label:'Zielgruppe' }, ...brainstormAudiences.map(a => ({ value:a.id, label:a.name || 'Unbenannt' }))]} />
                )}
                {brainstormKnowledge.length > 0 && (
                  <div style={{ position:'relative' }}>
                    <button type="button" onClick={() => setShowBsKnowledge(v => !v)}
                      title="Optional: Wissensressourcen einbeziehen"
                      style={{ display:'inline-flex', alignItems:'center', gap:6, width:120, height:38, boxSizing:'border-box', padding:'0 10px', borderRadius:9, border:'1.5px solid '+(brainstormKnowledgeIds.length?'var(--wl-primary, #0A6FB0)':'var(--border)'), fontSize:13, fontWeight:600, background:'var(--surface)', color: brainstormKnowledgeIds.length?'var(--wl-primary, #0A6FB0)':'var(--text-primary)', cursor:'pointer', fontFamily:'inherit' }}>
                      <BookOpen size={13} strokeWidth={1.75} style={{ flexShrink:0 }}/>
                      <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', textAlign:'left' }}>Wissen{brainstormKnowledgeIds.length ? ` (${brainstormKnowledgeIds.length})` : ''}</span>
                      <ChevronDown size={13} strokeWidth={2} style={{ opacity:0.5, flexShrink:0 }}/>
                    </button>
                    {showBsKnowledge && (
                      <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:30, background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.15)', padding:6, minWidth:230, maxHeight:240, overflowY:'auto' }}>
                        {brainstormKnowledge.map(k => {
                          const checked = brainstormKnowledgeIds.includes(k.id)
                          return (
                            <label key={k.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, cursor:'pointer', fontSize:12.5, color:'var(--text-primary)' }}>
                              <input type="checkbox" checked={checked} onChange={() => setBrainstormKnowledgeIds(prev => checked ? prev.filter(x => x !== k.id) : [...prev, k.id])}/>
                              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{k.name || 'Ressource'}{k.category ? ` · ${k.category}` : ''}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                <button className="lk-btn lk-btn-cta" onClick={() => generateIdeas(brainstormTopic.trim())} disabled={generating}
                  style={{ height:38, boxSizing:'border-box', whiteSpace:'nowrap', display:'inline-flex', alignItems:'center' }}>
                  {generating ? <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Loader2 size={12} className='lk-spin'/>Generiere…</span> : <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Wand2 size={12}/>Generieren</span>}
                </button>
                </div>
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'14px 22px' }}>
              {brainstormIdeas.length === 0 && !generating && (
                <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                  <span style={{display:'inline-flex',alignItems:'flex-start',gap:6}}><Lightbulb size={13} style={{flexShrink:0,marginTop:1}}/>Klick auf <strong>"Generieren"</strong> oben für {brainstormCount} frische Post-Ideen.</span>
                </div>
              )}
              {generating && brainstormIdeas.length === 0 && (
                <GenerationLoading title="Post-Ideen werden gebraintstormt" expectedSeconds={15} />
              )}
              {brainstormIdeas.map((idea, i) => {
                const selected = brainstormSelected.has(i)
                return (
                  <div key={i} onClick={() => {
                      setBrainstormSelected(prev => {
                        const s = new Set(prev)
                        if (s.has(i)) s.delete(i); else s.add(i)
                        return s
                      })
                    }}
                    style={{ marginBottom:10, padding:'12px 14px', borderRadius:12,
                      border: '2px solid ' + (selected ? 'var(--wl-primary, #0A6FB0)' : 'var(--border)'),
                      background: selected ? 'rgba(10,111,176,.04)' : 'var(--surface)',
                      cursor:'pointer', transition:'all .15s', display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ width:24, height:24, borderRadius:6, border: '2px solid ' + (selected ? 'var(--wl-primary, #0A6FB0)' : 'var(--border)'), background: selected ? 'var(--wl-primary, #0A6FB0)' : 'transparent', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0, marginTop:2 }}>
                      {selected ? '✓' : ''}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', marginBottom:4, lineHeight:1.35 }}>{idea.title}</div>
                      {idea.hook && <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5 }}>{idea.hook}</div>}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>
                {brainstormSelected.size} von {brainstormIdeas.length} ausgewählt
              </span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setShowBrainstorm(false)}
                  style={{ padding:'9px 16px', borderRadius:9, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:13, cursor:'pointer' }}>
                  Abbrechen
                </button>
                <button onClick={adoptSelectedIdeas} disabled={brainstormSelected.size === 0}
                  style={{ padding:'9px 18px', borderRadius:9, border:'none', background: brainstormSelected.size === 0 ? '#CBD5E1' : 'var(--wl-primary, #0A6FB0)', color:'#fff', fontSize:13, fontWeight:700, cursor: brainstormSelected.size === 0 ? 'not-allowed' : 'pointer' }}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Lightbulb size={13}/>{brainstormSelected.size > 0 ? brainstormSelected.size + ' Idee' + (brainstormSelected.size === 1 ? '' : 'n') + ' übernehmen' : 'Auswählen'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
