import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

// ─── Status-Config ─────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  planning:  { label: 'In Planung',  color: '#0891B2', bg: '#CFFAFE' },
  active:    { label: 'Aktiv',       color: '#059669', bg: '#D1FAE5' },
  on_hold:   { label: 'Pausiert',    color: '#D97706', bg: '#FEF3C7' },
  completed: { label: 'Abgeschlossen', color: '#6366F1', bg: '#E0E7FF' },
  archived:  { label: 'Archiviert',  color: '#64748B', bg: '#F1F5F9' }
}

// ─── Tab-Definitionen ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'board',      label: 'Board',      icon: '📋' },
  { id: 'liste',      label: 'Liste',      icon: '📝' },
  { id: 'timeline',   label: 'Timeline',   icon: '📊' },
  { id: 'zeiten',     label: 'Zeiten',     icon: '⏱' },
  { id: 'dateien',    label: 'Dateien',    icon: '📎' },
  { id: 'docs',       label: 'Docs',       icon: '📚' },
  { id: 'rechnungen', label: 'Rechnungen', icon: '💰' }
]

// ─── Hilfs-Formatter ───────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtCurrency(val, currency = 'EUR') {
  if (val === null || val === undefined) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(Number(val))
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────────
export default function ProjektDetail({ session }) {
  const { id: projectId } = useParams()
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()

  const [project, setProject]   = useState(null)
  const [deal, setDeal]         = useState(null)
  const [lead, setLead]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [activeTab, setActiveTab] = useState('board')
  const [statusSaving, setStatusSaving] = useState(false)

  const load = useCallback(async () => {
    if (!projectId || !activeTeamId) return
    setLoading(true); setError(null)

    const { data: p, error: pErr } = await supabase
      .from('pm_projects')
      .select('*')
      .eq('id', projectId)
      .eq('team_id', activeTeamId)
      .maybeSingle()

    if (pErr) { setError(pErr.message); setLoading(false); return }
    if (!p)   { setError('Projekt nicht gefunden oder keine Berechtigung.'); setLoading(false); return }

    setProject(p)

    // Deal + Lead nachladen (optional)
    if (p.deal_id) {
      const { data: d } = await supabase.from('deals').select('id,title,value,currency,stage').eq('id', p.deal_id).maybeSingle()
      if (d) setDeal(d)
    }
    if (p.lead_id) {
      const { data: l } = await supabase.from('leads').select('id,first_name,last_name,company').eq('id', p.lead_id).maybeSingle()
      if (l) setLead(l)
    }

    setLoading(false)
  }, [projectId, activeTeamId])

  useEffect(() => { load() }, [load])

  async function updateStatus(newStatus) {
    if (!project || newStatus === project.status) return
    setStatusSaving(true)
    const patch = { status: newStatus }
    if (newStatus === 'completed' && !project.completed_at) {
      patch.completed_at = new Date().toISOString()
    } else if (newStatus !== 'completed' && project.completed_at) {
      patch.completed_at = null
    }
    const { error: uErr } = await supabase.from('pm_projects').update(patch).eq('id', project.id)
    if (uErr) alert('Fehler: ' + uErr.message)
    else setProject({ ...project, ...patch })
    setStatusSaving(false)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────────
  if (loading) return <div style={{padding:48, textAlign:'center', color:'var(--text-muted)'}}>Lädt Projekt…</div>
  if (error)   return (
    <div style={{padding:48, textAlign:'center'}}>
      <div style={{fontSize:15, color:'#DC2626', marginBottom:16}}>⚠ {error}</div>
      <button onClick={()=>navigate('/projekte')} style={btnSecondary}>← Zurück zur Projektliste</button>
    </div>
  )
  if (!project) return null

  const statusCfg = STATUS_CFG[project.status] || STATUS_CFG.active
  const kundeName = lead ? (`${lead.first_name||''} ${lead.last_name||''}`.trim() || lead.company || '—') : null

  return (
    <div style={{padding:'24px 32px', maxWidth:1400, margin:'0 auto'}}>

      {/* ─── Breadcrumb + Back ───────────────────────────────── */}
      <div style={{fontSize:13, color:'var(--text-muted)', marginBottom:12, display:'flex', gap:6, alignItems:'center'}}>
        <Link to="/projekte" style={{color:'var(--text-muted)', textDecoration:'none'}}>Projekte</Link>
        <span>›</span>
        <span style={{color:'var(--text-strong)', fontWeight:600}}>{project.name}</span>
      </div>

      {/* ─── Header ─────────────────────────────────────────── */}
      <div style={{
        background:'var(--surface)', borderRadius:16, padding:'20px 24px',
        border:'1px solid #E2E8F0', marginBottom:16,
        display:'flex', gap:24, alignItems:'flex-start', flexWrap:'wrap'
      }}>
        <div style={{flex:1, minWidth:260}}>
          <h1 style={{margin:0, fontSize:24, fontWeight:800, color:'var(--text-strong)', lineHeight:1.2}}>
            {project.name}
          </h1>
          {project.description && (
            <div style={{fontSize:13, color:'var(--text-muted)', marginTop:6, lineHeight:1.5}}>
              {project.description}
            </div>
          )}

          <div style={{display:'flex', gap:16, flexWrap:'wrap', marginTop:14, fontSize:12, color:'var(--text-muted)'}}>
            {kundeName && (
              <span>👤 <strong style={{color:'var(--text-primary)'}}>{kundeName}</strong>
                {lead?.company && kundeName !== lead.company && <span style={{marginLeft:4}}>· {lead.company}</span>}
              </span>
            )}
            {deal && (
              <span>💼 Deal: <Link to={`/deals`} style={{color:PRIMARY, textDecoration:'none', fontWeight:600}}>{deal.title}</Link>
                {deal.value && <span style={{marginLeft:6}}>({fmtCurrency(deal.value, deal.currency||'EUR')})</span>}
              </span>
            )}
            {project.start_date && <span>🚀 Start: {fmtDate(project.start_date)}</span>}
            {project.due_date   && <span>🎯 Fällig: {fmtDate(project.due_date)}</span>}
          </div>
        </div>

        {/* Status-Dropdown */}
        <div style={{display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end'}}>
          <label style={{fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:0.5}}>Status</label>
          <select
            disabled={statusSaving}
            value={project.status}
            onChange={e => updateStatus(e.target.value)}
            style={{
              padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:700,
              border:`1.5px solid ${statusCfg.color}44`,
              background:statusCfg.bg, color:statusCfg.color,
              cursor: statusSaving ? 'wait' : 'pointer'
            }}
          >
            {Object.entries(STATUS_CFG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── Budget-Widget (nur wenn gesetzt) ────────────────── */}
      {(project.budget_hours || project.budget_amount) && (
        <div style={{
          background:'var(--surface)', borderRadius:12, padding:'14px 18px',
          border:'1px solid #E2E8F0', marginBottom:16,
          display:'flex', gap:32, flexWrap:'wrap', fontSize:13
        }}>
          {project.budget_amount && (
            <div>
              <div style={{fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase'}}>Budget</div>
              <div style={{fontSize:16, fontWeight:800, color:'var(--text-strong)'}}>{fmtCurrency(project.budget_amount, project.currency||'EUR')}</div>
            </div>
          )}
          {project.budget_hours && (
            <div>
              <div style={{fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase'}}>Zeitbudget</div>
              <div style={{fontSize:16, fontWeight:800, color:'var(--text-strong)'}}>{project.budget_hours} h</div>
            </div>
          )}
          {project.hourly_rate && (
            <div>
              <div style={{fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase'}}>Stundensatz</div>
              <div style={{fontSize:16, fontWeight:800, color:'var(--text-strong)'}}>{fmtCurrency(project.hourly_rate, project.currency||'EUR')}/h</div>
            </div>
          )}
          <div style={{marginLeft:'auto', fontSize:11, color:'var(--text-muted)', alignSelf:'flex-end'}}>
            Zeiterfassung folgt in Kürze
          </div>
        </div>
      )}

      {/* ─── Tab-Bar ───────────────────────────────────────── */}
      <div style={{
        display:'flex', gap:4, borderBottom:'1px solid #E2E8F0', marginBottom:20,
        overflowX:'auto'
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
              style={{
                padding:'10px 16px', background:'none', border:'none',
                borderBottom: isActive ? `2px solid ${PRIMARY}` : '2px solid transparent',
                color: isActive ? PRIMARY : 'var(--text-muted)',
                fontSize:13, fontWeight: isActive ? 700 : 600, cursor:'pointer',
                whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6,
                marginBottom:-1
              }}>
              <span>{tab.icon}</span> {tab.label}
            </button>
          )
        })}
      </div>

      {/* ─── Tab-Content ──────────────────────────────────── */}
      <div style={{minHeight:400}}>
        {activeTab === 'board' && <TabBoard project={project} />}
        {activeTab === 'liste' && <Placeholder title="Liste" />}
        {activeTab === 'timeline' && <Placeholder title="Timeline" />}
        {activeTab === 'zeiten' && <Placeholder title="Zeiterfassung" phase="Phase 3" />}
        {activeTab === 'dateien' && <Placeholder title="Dateien" />}
        {activeTab === 'docs' && <Placeholder title="Docs" phase="Phase 7" />}
        {activeTab === 'rechnungen' && <Placeholder title="Rechnungen" phase="Phase 9" />}
      </div>

    </div>
  )
}

// ─── Tab: Board (vorerst Hinweis + Link zur Kanban-Übersicht) ─────────────
function TabBoard({ project }) {
  return (
    <div style={{
      background:'var(--surface)', borderRadius:12, padding:'40px 32px',
      border:'1px solid #E2E8F0', textAlign:'center'
    }}>
      <div style={{fontSize:40, marginBottom:12}}>📋</div>
      <div style={{fontSize:16, fontWeight:700, color:'var(--text-strong)', marginBottom:8}}>
        Board-Ansicht
      </div>
      <div style={{fontSize:13, color:'var(--text-muted)', marginBottom:20, maxWidth:500, margin:'0 auto 20px'}}>
        Das Kanban-Board für dieses Projekt ist aktuell unter der bestehenden Projektverwaltung erreichbar.
        Die Integration als Tab folgt in Kürze.
      </div>
      <Link to="/projekte" style={{
        display:'inline-block', padding:'10px 20px', borderRadius:8,
        background:PRIMARY, color:'#fff', textDecoration:'none',
        fontSize:13, fontWeight:700
      }}>
        → Zur Board-Übersicht
      </Link>
    </div>
  )
}

// ─── Placeholder für zukünftige Tabs ─────────────────────────────────────
function Placeholder({ title, phase }) {
  return (
    <div style={{
      background:'var(--surface)', borderRadius:12, padding:'40px 32px',
      border:'1px dashed #CBD5E1', textAlign:'center', color:'var(--text-muted)'
    }}>
      <div style={{fontSize:32, marginBottom:8, opacity:0.4}}>🚧</div>
      <div style={{fontSize:15, fontWeight:700, color:'var(--text-strong)', marginBottom:6}}>{title}</div>
      <div style={{fontSize:12}}>Kommt in Kürze{phase ? ` — ${phase}` : ''}.</div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────────
const btnSecondary = {
  padding:'8px 16px', borderRadius:8, border:'1px solid #CBD5E1',
  background:'#fff', color:'var(--text-primary)', fontSize:13, fontWeight:600, cursor:'pointer'
}
