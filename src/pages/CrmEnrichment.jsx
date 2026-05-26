import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const PRIMARY = 'rgb(49,90,231)'

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

const INTENT_COLORS = {
  hoch:     { bg:'#FEF2F2', color:'#ef4444', border:'#FECACA', label:'🔥 Hoch' },
  mittel:   { bg:'#FFFBEB', color:'#f59e0b', border:'#FDE68A', label:'⚡ Mittel' },
  niedrig:  { bg:'#F0FDF4', color:'#22c55e', border:'#BBF7D0', label:'○ Niedrig' },
  unbekannt:{ bg:'#F8FAFC', color:'#94a3b8', border:'#E2E8F0', label:'— Unbekannt' },
}

function ScoreMeter({ score }) {
  const pct = Math.min(score, 100)
  const color = pct >= 70 ? '#ef4444' : pct >= 40 ? '#f59e0b' : PRIMARY
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:6, background:'#E5E7EB', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:pct+'%', background:`linear-gradient(90deg,${color},${color}88)`, borderRadius:99, transition:'width 0.5s ease' }}/>
      </div>
      <span style={{ fontSize:13, fontWeight:800, color, minWidth:28, textAlign:'right' }}>{score}</span>
    </div>
  )
}

export default function CrmEnrichment({ session }) {
  const navigate = useNavigate()
  const { activeTeamId } = useTeam() || {}
  const [leads, setLeads]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [enriching, setEnriching] = useState({})
  const [bulkRunning, setBulk]    = useState(false)
  const [stats, setStats]         = useState({ done:0, total:0 })
  const [filter, setFilter]       = useState('all') // all | missing | done

  const load = useCallback(async () => {
    setLoading(true)
    const uid = session?.user?.id
    // Konsistent mit Leads/Deals/Pipeline: Team-Scope wenn aktiv, sonst nur eigene.
    let q = supabase.from('leads')
      .select('id,first_name,last_name,name,job_title,headline,company,avatar_url,profile_url,notes,status,hs_score,ai_buying_intent,ai_pain_points,ai_use_cases,ai_need_detected,li_connection_status,li_reply_behavior,li_activity_level,li_message_summary,li_about_summary,deal_stage,deal_value,connection_note,connection_message,lifecycle_stage,is_shared,team_id,user_id,archived')
      .eq('archived', false)
      .order('hs_score', { ascending: false, nullsFirst: false })
    // RLS-vertrauend: leads-Policy filtert team-scoped
    const { data, error } = await q
    if (error) console.error('[CrmEnrichment] load:', error.message)
    setLeads(data || [])
    setLoading(false)
  }, [session, activeTeamId])

  useEffect(() => { load() }, [load])

  // Refactored 2026-05-28: rief vorher die alte Vercel-Serverless /api/crm-enrich,
  // ruft jetzt die Sparkles-Edge-Function `analyze-lead` (Single-Source-of-Truth).
  // Edge Function persistiert direkt in leads (ai_last_analysis jsonb +
  // denormalized Mirror in ai_buying_intent/need_detected/use_cases/pain_points),
  // hier nur noch local-state-Sync. force=true bypasst die 24h-Cache (Bulk-Path).
  async function enrichLead(lead) {
    setEnriching(e => ({ ...e, [lead.id]: 'running' }))

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('analyze-lead', {
        body: { lead_id: lead.id, force: true },
      })
      if (invokeErr) throw invokeErr
      if (data?.error) throw new Error(data.error)

      // Edge Function hat bereits in DB persistiert. Lokalen State spiegeln,
      // damit Filter "Enriched / Noch nicht enriched" und Stats sofort umfärben.
      const updates = {
        ai_buying_intent:       data.buying_intent || 'unbekannt',
        ai_need_detected:       data.need_detected || null,
        ai_pain_points:         Array.isArray(data.pain_points) ? data.pain_points : [],
        ai_use_cases:           Array.isArray(data.use_cases)   ? data.use_cases   : [],
        ai_last_analysis:       data,
        ai_last_analysis_at:    data.generated_at,
        ai_last_analysis_model: data.model,
        ai_summary_updated_at:  data.generated_at,
      }

      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...updates } : l))
      setEnriching(e => ({ ...e, [lead.id]: 'done' }))
      setStats(s => ({ ...s, done: s.done + 1 }))
    } catch (err) {
      console.error('Enrichment error:', err)
      setEnriching(e => ({ ...e, [lead.id]: 'error' }))
    }
  }

  async function runBulkEnrichment() {
    const toEnrich = leads.filter(l => !l.ai_buying_intent || l.ai_buying_intent === 'unbekannt')
    setBulk(true)
    setStats({ done: 0, total: toEnrich.length })
    for (const lead of toEnrich) {
      await enrichLead(lead)
      await new Promise(r => setTimeout(r, 500))
    }
    setBulk(false)
  }

  const filtered = leads.filter(l => {
    if (filter === 'missing') return !l.ai_buying_intent || l.ai_buying_intent === 'unbekannt'
    if (filter === 'done') return l.ai_buying_intent && l.ai_buying_intent !== 'unbekannt'
    return true
  })

  const enrichedCount = leads.filter(l => l.ai_buying_intent && l.ai_buying_intent !== 'unbekannt').length
  const hotCount = leads.filter(l => l.ai_buying_intent === 'hoch').length
  const avgScore = leads.length > 0 ? Math.round(leads.reduce((s,l) => s+(l.hs_score||0), 0) / leads.length) : 0
  const missingCount = leads.filter(l => !l.ai_buying_intent || l.ai_buying_intent === 'unbekannt').length

  const kpis = [
    { label:'Gesamt Leads',  value: leads.length,     color: PRIMARY,    bg:'rgba(49,90,231,0.06)' },
    { label:'Enriched',      value: enrichedCount,    color:'#059669',   bg:'#ECFDF5' },
    { label:'🔥 Hot Intent', value: hotCount,         color:'#DC2626',   bg:'#FEF2F2' },
    { label:'Ø Score',       value: avgScore,         color:'#D97706',   bg:'#FFFBEB' },
  ]

  const FILTERS = [
    { id:'all',     label:'Alle',                count: leads.length },
    { id:'missing', label:'Noch nicht enriched', count: missingCount },
    { id:'done',    label:'Enriched',            count: enrichedCount },
  ]

  return (
    <div style={{ background:'var(--surface-canvas, #F8FAFC)', minHeight:'100vh', padding:'24px 24px 60px' }}>
      <div style={{ width:'100%', margin:'0 auto', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, color:'#111827', margin:0 }}>Lead Intelligence</h1>
            <div style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>
              AI analysiert LinkedIn-Profildaten, Nachrichten und Notizen — befüllt Buying Intent, Pain Points, Use Cases und Lead Score.
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={load} style={{ padding:'9px 16px', borderRadius:10, border:'1.5px solid #E4E7EC', background:'var(--surface)', color:'#374151', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              ↻ Neu laden
            </button>
            <button onClick={runBulkEnrichment} disabled={bulkRunning || missingCount === 0}
              style={{ padding:'9px 18px', background: PRIMARY, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:(bulkRunning || missingCount === 0)?'default':'pointer', opacity:(bulkRunning || missingCount === 0)?0.5:1, display:'inline-flex', alignItems:'center', gap:6 }}>
              {bulkRunning ? `⏳ ${stats.done}/${stats.total}` : `✨ Alle ${missingCount} enrichen`}
            </button>
          </div>
        </div>

        {/* KPI-Zeile */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:20 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ background: k.bg, borderRadius:14, padding:'14px 18px', border:`1px solid ${k.color}22` }}>
              <div style={{ fontSize:10, fontWeight:700, color: k.color, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{k.label}</div>
              <div style={{ fontSize:20, fontWeight:800, color: k.color, fontVariantNumeric:'tabular-nums' }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Progress bar während Bulk */}
        {bulkRunning && (
          <div style={{ background:'var(--surface)', borderRadius:12, border:'1.5px solid #E4E7EC', padding:'14px 20px', marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:700, color:'#111827', marginBottom:8 }}>
              <span>⏳ AI Enrichment läuft…</span>
              <span>{stats.done} / {stats.total} Leads</span>
            </div>
            <div style={{ height:8, background:'#E5E7EB', borderRadius:99, overflow:'hidden' }}>
              <div style={{ height:'100%', width:(stats.total>0?stats.done/stats.total*100:0)+'%', background:`linear-gradient(90deg,${PRIMARY},#8b5cf6)`, borderRadius:99, transition:'width 0.3s' }}/>
            </div>
          </div>
        )}

        {/* Filter-Pills */}
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{
                padding:'7px 14px', borderRadius:20,
                border:`1.5px solid ${filter === f.id ? PRIMARY : '#E4E7EC'}`,
                background: filter === f.id ? PRIMARY : 'var(--surface)',
                color: filter === f.id ? '#fff' : '#374151',
                fontSize:12, fontWeight:600, cursor:'pointer',
                display:'inline-flex', alignItems:'center', gap:6,
              }}>
              {f.label}
              {f.count > 0 && (
                <span style={{ background: filter === f.id ? 'rgba(255,255,255,0.3)' : '#F3F4F6', color: filter === f.id ? '#fff' : '#6B7280', borderRadius:99, padding:'0 6px', fontSize:11, fontWeight:700 }}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Lead-Cards */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', fontSize:14 }}>⏳ Lade Leads…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✨</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#374151', marginBottom:6 }}>Keine Leads im aktuellen Filter</div>
            <div style={{ fontSize:13 }}>Wechsle den Filter oder enriche neue Leads.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtered.map(lead => {
              const status = enriching[lead.id]
              const intent = lead.ai_buying_intent || 'unbekannt'
              const ic = INTENT_COLORS[intent]
              const isEnriched = intent && intent !== 'unbekannt'
              return (
                <div key={lead.id}
                  style={{
                    background:'var(--surface)',
                    border:'1.5px solid #E4E7EC',
                    borderRadius:13, padding:'16px 20px',
                    transition:'border-color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#C7D2FE' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4E7EC' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                    {/* Avatar */}
                    <div style={{ width:44, height:44, borderRadius:'50%', background:PRIMARY, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:16, flexShrink:0 }}>
                      {lead.avatar_url
                        ? <img src={lead.avatar_url} alt="" style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover' }}/>
                        : (fullName(lead)||'?').substring(0,2).toUpperCase()
                      }
                    </div>
                    {/* Main info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                        <span style={{ fontWeight:700, fontSize:15, color:'#111827' }}>{fullName(lead)}</span>
                        {lead.company && <span style={{ fontSize:12, color: PRIMARY, fontWeight:600 }}>{lead.company}</span>}
                        <span style={{ padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:ic.bg, color:ic.color, border:'1px solid '+ic.border }}>{ic.label}</span>
                        {lead.li_connection_status === 'verbunden' && (
                          <span style={{ fontSize:10, background:'#ECFDF5', color:'#065F46', padding:'1px 7px', borderRadius:99, fontWeight:700 }}>✓ Vernetzt</span>
                        )}
                      </div>
                      <div style={{ fontSize:12, color:'#6B7280', marginBottom:8 }}>{lead.job_title || lead.headline || '—'}</div>
                      {/* Score */}
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Leadesk Score</div>
                        <ScoreMeter score={lead.hs_score || 0}/>
                      </div>
                      {/* AI Results */}
                      {isEnriched && (
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {lead.ai_need_detected && (
                            <div style={{ fontSize:12, color:'#111827', background:'#F8FAFC', borderRadius:8, padding:'6px 10px' }}>
                              <span style={{ fontWeight:700, color:'#7C3AED' }}>💡 Bedarf: </span>{lead.ai_need_detected}
                            </div>
                          )}
                          {lead.ai_pain_points && lead.ai_pain_points.length > 0 && (
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                              {lead.ai_pain_points.map((p,i) => (
                                <span key={i} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'#FEF2F2', color:'#B91C1C', border:'1px solid #FECACA', fontWeight:600 }}>⚠ {p}</span>
                              ))}
                            </div>
                          )}
                          {lead.ai_use_cases && lead.ai_use_cases.length > 0 && (
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                              {lead.ai_use_cases.map((u,i) => (
                                <span key={i} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'#EFF6FF', color:'#1d4ed8', border:'1px solid #BFDBFE', fontWeight:600 }}>✓ {u}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div style={{ flexShrink:0, display:'flex', flexDirection:'column', gap:6 }}>
                      <button onClick={() => navigate(`/leads/${lead.id}`)}
                        style={{ padding:'6px 12px', borderRadius:8, border:`1.5px solid ${PRIMARY}33`, background:'rgba(49,90,231,0.07)', color: PRIMARY, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                        ↗ Profil
                      </button>
                      <button onClick={() => enrichLead(lead)} disabled={status === 'running' || bulkRunning}
                        style={{
                          padding:'8px 16px', borderRadius:10, border:'none',
                          background: status==='done'?'#ECFDF5'
                                    : status==='error'?'#FEF2F2'
                                    : status==='running'?'#EFF6FF'
                                    : PRIMARY,
                          color: status==='done'?'#059669'
                               : status==='error'?'#B91C1C'
                               : status==='running'?'#1d4ed8'
                               : '#fff',
                          fontWeight:700, fontSize:12,
                          cursor: status==='running'||bulkRunning ? 'default' : 'pointer',
                          minWidth:110, transition:'all 0.2s',
                        }}>
                        {status === 'running' ? '⏳ Analysiere…'
                          : status === 'done' ? '✓ Enriched'
                          : status === 'error' ? '✗ Fehler'
                          : isEnriched ? '↻ Re-Analyse'
                          : '✨ AI Analyse'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
