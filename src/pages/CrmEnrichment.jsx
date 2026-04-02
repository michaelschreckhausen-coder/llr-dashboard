import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

const INTENT_COLORS = {
  hoch:     { bg:'#FEF2F2', color:'#ef4444', border:'#FECACA', label:'🔥 Hoch' },
  mittel:   { bg:'#FFFBEB', color:'#f59e0b', border:'#FDE68A', label:'⚡ Mittel' },
  niedrig:  { bg:'#F0FDF4', color:'#22c55e', border:'#BBF7D0', label:'○ Niedrig' },
  unbekannt:{ bg:'#F8FAFC', color:'#94a3b8', border:'#E2E8F0', label:'— Unbekannt' },
}

function ScoreMeter({ score }) {
  const pct = Math.min(score, 100)
  const color = pct >= 70 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#3b82f6'
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
  const [leads, setLeads]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [enriching, setEnriching] = useState({})
  const [bulkRunning, setBulk]    = useState(false)
  const [stats, setStats]         = useState({ done:0, total:0 })
  const [filter, setFilter]       = useState('all') // all | missing | done

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('leads')
      .select('id,first_name,last_name,name,job_title,headline,company,avatar_url,profile_url,notes,status,hs_score,ai_buying_intent,ai_pain_points,ai_use_cases,ai_need_detected,li_connection_status,li_reply_behavior,li_activity_level,li_message_summary,li_about_summary,deal_stage,deal_value,connection_note,connection_message,lifecycle_stage')
      .eq('user_id', session.user.id)
      .order('hs_score', { ascending: false })
    setLeads(data || [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  async function enrichLead(lead) {
    setEnriching(e => ({ ...e, [lead.id]: 'running' }))

    // Build context from existing data
    const context = [
      lead.job_title || lead.headline || '',
      lead.company ? `Unternehmen: ${lead.company}` : '',
      lead.li_connection_status === 'verbunden' ? 'LinkedIn-Verbindung: vernetzt' : '',
      lead.connection_message ? `Vernetzungsnachricht: ${lead.connection_message}` : '',
      lead.connection_note ? `Notiz: ${lead.connection_note}` : '',
      lead.notes ? `Notizen: ${lead.notes}` : '',
      lead.li_about_summary ? `LinkedIn About: ${lead.li_about_summary}` : '',
      lead.li_message_summary ? `Nachrichtenverlauf: ${lead.li_message_summary}` : '',
      lead.li_reply_behavior ? `Antwortverhalten: ${lead.li_reply_behavior}` : '',
    ].filter(Boolean).join('\n')

    try {
      // Call AI via Anthropic API (embedded in artifacts)
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Analysiere diesen B2B-Lead und gib eine JSON-Antwort zurück.

Lead-Daten:
Name: ${fullName(lead)}
Position: ${lead.job_title || lead.headline || 'Unbekannt'}
${context}

Antworte NUR mit diesem JSON-Format (kein Markdown, keine Erklärungen):
{
  "ai_buying_intent": "hoch" | "mittel" | "niedrig",
  "ai_need_detected": "Kurze Beschreibung des erkannten Bedarfs (max 100 Zeichen)",
  "ai_pain_points": ["Pain Point 1", "Pain Point 2"],
  "ai_use_cases": ["Use Case 1", "Use Case 2"],
  "ai_budget_signal": "Kurzes Budget-Signal oder null",
  "hs_score": Zahl zwischen 0-100
}`
          }]
        })
      })

      const data = await response.json()
      const text = data.content?.[0]?.text || '{}'
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      // Save to Supabase
      const updates = {
        ai_buying_intent: parsed.ai_buying_intent || 'niedrig',
        ai_need_detected: parsed.ai_need_detected || null,
        ai_pain_points: parsed.ai_pain_points || [],
        ai_use_cases: parsed.ai_use_cases || [],
        ai_budget_signal: parsed.ai_budget_signal || null,
        ai_summary_updated_at: new Date().toISOString(),
      }
      if (parsed.hs_score) updates.hs_score = Math.max(lead.hs_score || 0, parsed.hs_score)

      await supabase.from('leads').update(updates).eq('id', lead.id)

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
      await new Promise(r => setTimeout(r, 500)) // Rate limiting
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

  return (
    <div style={{ maxWidth:1100, padding:'0 0 40px' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1e3a8a,#3b82f6)', borderRadius:20, padding:'24px 28px', marginBottom:24, color:'#fff' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>CRM AI ENRICHMENT</div>
        <div style={{ fontSize:22, fontWeight:900, marginBottom:6 }}>Lead Intelligence</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)', marginBottom:20 }}>
          AI analysiert LinkedIn-Profildaten, Nachrichten und Notizen und befüllt automatisch Buying Intent, Pain Points, Use Cases und Lead Score.
        </div>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:20 }}>
          {[
            { label:'Gesamt', val:leads.length, color:'rgba(255,255,255,0.9)' },
            { label:'Enriched', val:enrichedCount, color:'#86efac' },
            { label:'🔥 Hot Intent', val:hotCount, color:'#fca5a5' },
            { label:'Ø Score', val:avgScore, color:'#fde68a' },
          ].map(s => (
            <div key={s.label} style={{ background:'rgba(255,255,255,0.15)', borderRadius:12, padding:'10px 18px', textAlign:'center' }}>
              <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button onClick={runBulkEnrichment} disabled={bulkRunning}
            style={{ padding:'10px 24px', borderRadius:10, border:'2px solid rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.2)', color:'#fff', fontWeight:800, fontSize:14, cursor:bulkRunning?'default':'pointer', opacity:bulkRunning?0.7:1, backdropFilter:'blur(4px)' }}>
            {bulkRunning ? `⏳ Enriching… ${stats.done}/${stats.total}` : `✨ Alle ${leads.filter(l=>!l.ai_buying_intent||l.ai_buying_intent==='unbekannt').length} Leads enrichen`}
          </button>
          <button onClick={load} style={{ padding:'10px 16px', borderRadius:10, border:'1px solid rgba(255,255,255,0.3)', background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.9)', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            🔄 Neu laden
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {bulkRunning && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', padding:'14px 20px', marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:700, color:'#374151', marginBottom:8 }}>
            <span>⏳ AI Enrichment läuft…</span>
            <span>{stats.done} / {stats.total} Leads</span>
          </div>
          <div style={{ height:8, background:'#E5E7EB', borderRadius:99, overflow:'hidden' }}>
            <div style={{ height:'100%', width:(stats.total>0?stats.done/stats.total*100:0)+'%', background:'linear-gradient(90deg,#3b82f6,#8b5cf6)', borderRadius:99, transition:'width 0.3s' }}/>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['all','Alle'],['missing','Noch nicht enriched'],['done','Enriched']].map(([key,lbl]) => (
          <button key={key} onClick={() => setFilter(key)} style={{ padding:'7px 16px', borderRadius:8, border:'1.5px solid', borderColor:filter===key?'#3b82f6':'#E5E7EB', background:filter===key?'#EFF6FF':'#fff', color:filter===key?'#1d4ed8':'#64748B', fontSize:13, fontWeight:filter===key?700:400, cursor:'pointer' }}>
            {lbl} {key==='all'?`(${leads.length})`:key==='missing'?`(${leads.filter(l=>!l.ai_buying_intent||l.ai_buying_intent==='unbekannt').length})`:`(${enrichedCount})`}
          </button>
        ))}
      </div>

      {/* Lead Cards */}
      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'#94A3B8' }}>Lade Leads…</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(lead => {
            const status = enriching[lead.id]
            const intent = lead.ai_buying_intent || 'unbekannt'
            const ic = INTENT_COLORS[intent]
            const isEnriched = intent && intent !== 'unbekannt'
            return (
              <div key={lead.id} style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', padding:'16px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                  {/* Avatar */}
                  <div style={{ width:44, height:44, borderRadius:'50%', background:'#3b82f6', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:16, flexShrink:0 }}>
                    {lead.avatar_url
                      ? <img src={lead.avatar_url} alt="" style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover' }}/>
                      : (fullName(lead)||'?').substring(0,2).toUpperCase()
                    }
                  </div>
                  {/* Main info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, fontSize:15, color:'#0F172A' }}>{fullName(lead)}</span>
                      {lead.company && <span style={{ fontSize:12, color:'#3b82f6', fontWeight:600 }}>{lead.company}</span>}
                      <span style={{ padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:ic.bg, color:ic.color, border:'1px solid '+ic.border }}>{ic.label}</span>
                      {lead.li_connection_status === 'verbunden' && <span style={{ fontSize:10, background:'#ECFDF5', color:'#065F46', padding:'1px 7px', borderRadius:99, fontWeight:700 }}>✓ Vernetzt</span>}
                    </div>
                    <div style={{ fontSize:12, color:'#64748B', marginBottom:8 }}>{lead.job_title || lead.headline || '—'}</div>
                    {/* Score */}
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>HubSpot Score</div>
                      <ScoreMeter score={lead.hs_score || 0}/>
                    </div>
                    {/* AI Results */}
                    {isEnriched && (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {lead.ai_need_detected && (
                          <div style={{ fontSize:12, color:'#374151', background:'#F8FAFC', borderRadius:8, padding:'6px 10px' }}>
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
                  {/* Action button */}
                  <div style={{ flexShrink:0 }}>
                    <button onClick={() => enrichLead(lead)} disabled={status === 'running' || bulkRunning}
                      style={{ padding:'8px 16px', borderRadius:10, border:'none', background:status==='done'?'#F0FDF4':status==='error'?'#FEF2F2':status==='running'?'#EFF6FF':'linear-gradient(135deg,#3b82f6,#8b5cf6)', color:status==='done'?'#15803D':status==='error'?'#991B1B':status==='running'?'#1d4ed8':'#fff', fontWeight:700, fontSize:12, cursor:status==='running'||bulkRunning?'default':'pointer', minWidth:100, transition:'all 0.2s' }}>
                      {status === 'running' ? '⏳ Analysiere…'
                        : status === 'done' ? '✅ Enriched'
                        : status === 'error' ? '❌ Fehler'
                        : isEnriched ? '🔄 Re-Analyse'
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
  )
}
