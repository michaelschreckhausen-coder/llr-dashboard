import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const P = 'var(--wl-primary, rgb(49,90,231))'
const STEP_TYPES = {
  visit_profile: { label: 'Profil besuchen',       icon: '👁',  color: '#2563eb', bg: '#EFF6FF', desc: 'Besucht das LinkedIn-Profil' },
  send_connect:  { label: 'Vernetzung senden',      icon: '🤝',  color: '#16a34a', bg: '#F0FDF4', desc: 'Sendet eine Vernetzungsanfrage' },
  send_message:  { label: 'Nachricht senden',       icon: '💬',  color: '#c2410c', bg: '#FFF7ED', desc: 'Sendet eine LinkedIn-Nachricht' },
  import_profile: { label: 'Lead importieren',     icon: '⬇',  color: '#7c3aed', bg: '#F5F3FF', desc: 'Importiert Profil als Lead' },
}

const DEFAULT_SEQUENCE = [
  { type: 'visit_profile', delay_min: 5,    delay_max: 15,   message: '' },
  { type: 'send_connect',  delay_min: 1440, delay_max: 2880, message: 'Hallo {{first_name}}, ich bin auf dein Profil gestoßen und würde mich gerne mit dir vernetzen.' },
  { type: 'send_message',  delay_min: 2880, delay_max: 4320, message: 'Hallo {{first_name}}, danke für die Vernetzung! Ich wollte kurz Kontakt aufnehmen...' },
]

export default function Automatisierung({ session }) {
  const navigate = useNavigate()
  const [tab, setTab]                 = useState('campaigns')
  const [campaigns, setCampaigns]     = useState([])
  const [jobs, setJobs]               = useState([])
  const [leads, setLeads]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [showNew, setShowNew]         = useState(false)
  const [flash, setFlash]             = useState(null)

  // Neue Kampagne State
  const [newCamp, setNewCamp] = useState({
    name: '', description: '', sequence: JSON.parse(JSON.stringify(DEFAULT_SEQUENCE)),
    settings: { daily_limit: 20, working_hours_start: 8, working_hours_end: 20 }
  })
  const [selectedLeads, setSelectedLeads] = useState([])

  const uid = session?.user?.id

  const load = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    const [c, j, l] = await Promise.all([
      supabase.from('automation_campaigns').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('automation_jobs').select('*').eq('user_id', uid)
        .in('status', ['pending','claimed','running']).order('scheduled_at', { ascending: true }).limit(50),
      supabase.from('leads').select('id,first_name,last_name,company,job_title,linkedin_url,hs_score,li_connection_status')
        .eq('user_id', uid).not('linkedin_url', 'is', null).order('hs_score', { ascending: false }).limit(200),
    ])
    setCampaigns(c.data || [])
    setJobs(j.data || [])
    setLeads(l.data || [])
    setLoading(false)
  }, [uid])

  useEffect(() => { load() }, [load])

  // Polling für Job-Status
  useEffect(() => {
    const interval = setInterval(() => {
      if (tab === 'queue') load()
    }, 10000)
    return () => clearInterval(interval)
  }, [tab, load])

  function showFlash(msg, type = 'ok') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  async function createCampaign() {
    if (!newCamp.name.trim()) return
    const { data, error } = await supabase.from('automation_campaigns').insert({
      user_id: uid,
      name: newCamp.name.trim(),
      description: newCamp.description,
      sequence: newCamp.sequence,
      settings: newCamp.settings,
      leads_total: selectedLeads.length,
      status: 'draft'
    }).select().single()

    if (error) { showFlash(error.message, 'err'); return }

    // Leads der Kampagne zuweisen + erste Jobs einplanen
    if (selectedLeads.length && data) {
      const now = new Date()
      const clInserts = selectedLeads.map((leadId, idx) => ({
        campaign_id: data.id,
        lead_id: leadId,
        user_id: uid,
        status: 'queued',
        current_step: 0,
        next_action_at: new Date(now.getTime() + idx * 2 * 60000).toISOString() // 2min Versatz
      }))
      await supabase.from('automation_campaign_leads').insert(clInserts)

      // Erste Jobs (visit_profile oder erstes Step) einplanen
      const firstStep = newCamp.sequence[0]
      if (firstStep) {
        const jobInserts = []
        for (let i = 0; i < selectedLeads.length; i++) {
          const lead = leads.find(l => l.id === selectedLeads[i])
          if (!lead?.linkedin_url) continue
          jobInserts.push({
            user_id: uid,
            campaign_id: data.id,
            lead_id: lead.id,
            type: firstStep.type,
            payload: { linkedin_url: lead.linkedin_url, message: firstStep.message || '' },
            status: 'pending',
            priority: 5,
            scheduled_at: new Date(now.getTime() + i * 3 * 60000).toISOString()
          })
        }
        if (jobInserts.length) await supabase.from('automation_jobs').insert(jobInserts)
      }
    }

    showFlash(`Kampagne "${data.name}" erstellt ✓`)
    setShowNew(false)
    setSelectedLeads([])
    setNewCamp({ name: '', description: '', sequence: JSON.parse(JSON.stringify(DEFAULT_SEQUENCE)), settings: { daily_limit: 20, working_hours_start: 8, working_hours_end: 20 } })
    load()
  }

  async function toggleCampaign(c) {
    const newStatus = c.status === 'active' ? 'paused' : 'active'
    await supabase.from('automation_campaigns').update({ status: newStatus }).eq('id', c.id)
    setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: newStatus } : x))
  }

  async function deleteCampaign(id) {
    if (!confirm('Kampagne und alle Jobs löschen?')) return
    await supabase.from('automation_campaigns').delete().eq('id', id)
    setCampaigns(prev => prev.filter(x => x.id !== id))
    showFlash('Kampagne gelöscht')
  }

  async function cancelJob(id) {
    await supabase.from('automation_jobs').update({ status: 'cancelled' }).eq('id', id)
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  function addStep() {
    setNewCamp(prev => ({
      ...prev,
      sequence: [...prev.sequence, { type: 'send_message', delay_min: 1440, delay_max: 2880, message: '' }]
    }))
  }

  function removeStep(idx) {
    setNewCamp(prev => ({ ...prev, sequence: prev.sequence.filter((_, i) => i !== idx) }))
  }

  function updateStep(idx, key, val) {
    setNewCamp(prev => {
      const seq = [...prev.sequence]
      seq[idx] = { ...seq[idx], [key]: val }
      return { ...prev, sequence: seq }
    })
  }

  const statusColor = { draft: '#94A3B8', active: '#22c55e', paused: '#f59e0b', completed: '#2563eb', archived: '#94A3B8' }
  const statusLabel = { draft: 'Entwurf', active: 'Aktiv', paused: 'Pausiert', completed: 'Abgeschlossen', archived: 'Archiviert' }
  const jobTypeInfo = { visit_profile: '👁 Besuch', send_connect: '🤝 Vernetzen', send_message: '💬 Nachricht', import_profile: '⬇ Import', scrape_connections: '👥 Scrape' }

  const inp = { padding:'8px 12px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'inherit', background:'#fff' }

  return (
    <div style={{ maxWidth:900 }}>

      {/* Flash */}
      {flash && (
        <div style={{ position:'fixed', top:16, right:24, zIndex:999, padding:'10px 20px', borderRadius:10, fontSize:13, fontWeight:600, background: flash.type==='err'?'#FEF2F2':'#ECFDF5', color: flash.type==='err'?'#dc2626':'#059669', border:`1px solid ${flash.type==='err'?'#FECACA':'#A7F3D0'}`, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:'#0F172A' }}>Automatisierung</div>
          <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>LinkedIn-Kampagnen · Profil-Import · Vernetzungen</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <div style={{ padding:'7px 12px', borderRadius:8, background:'#EEF2FF', border:`1px solid ${P}`, fontSize:12, fontWeight:600, color:P, display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background: jobs.length ? '#22c55e' : '#CBD5E1', display:'inline-block' }}/>
            Extension {jobs.length ? 'aktiv' : 'idle'}
          </div>
          <button onClick={() => setShowNew(true)}
            style={{ padding:'8px 18px', borderRadius:8, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            + Kampagne
          </button>
        </div>
      </div>

      {/* Extension-Hinweis wenn keine Jobs */}
      <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:12, color:'#92400E', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:18 }}>⚡</span>
        <div>
          <strong>Chrome Extension erforderlich</strong> — Die Automatisierung läuft über die Leadesk Browser Extension.
          Sie verbindet sich automatisch mit deinem Leadesk-Account (kein separater Login nötig).
        </div>
        <a href="https://github.com/michaelschreckhausen-coder/llr-dashboard/tree/main/chrome-extension"
          target="_blank"
          style={{ marginLeft:'auto', padding:'5px 12px', background:'#fff', border:'1px solid #FDE68A', borderRadius:6, fontSize:12, fontWeight:600, color:'#92400E', textDecoration:'none', whiteSpace:'nowrap' }}>
          Extension herunterladen
        </a>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16, background:'#F1F5F9', padding:4, borderRadius:10, width:'fit-content' }}>
        {[['campaigns','🎯 Kampagnen'], ['queue','📋 Warteschlange']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:'7px 16px', borderRadius:7, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
              background: tab===id ? '#fff' : 'transparent',
              color: tab===id ? '#0F172A' : '#64748B',
              boxShadow: tab===id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── KAMPAGNEN ── */}
      {tab === 'campaigns' && (
        <div>
          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:'#94A3B8', fontSize:13 }}>Lade...</div>
          ) : campaigns.length === 0 ? (
            <div style={{ textAlign:'center', padding:48, background:'#fff', borderRadius:12, border:'1px solid #E5E7EB' }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🎯</div>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>Noch keine Kampagnen</div>
              <div style={{ fontSize:13, color:'#64748B', marginBottom:20 }}>Erstelle deine erste LinkedIn-Automatisierungskampagne</div>
              <button onClick={() => setShowNew(true)}
                style={{ padding:'10px 24px', borderRadius:8, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                + Erste Kampagne erstellen
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {campaigns.map(c => {
                const progress = c.leads_total > 0 ? Math.round((c.leads_done / c.leads_total) * 100) : 0
                return (
                  <div key={c.id} style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', padding:'16px 18px' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                      {/* Status-Toggle */}
                      <div onClick={() => toggleCampaign(c)}
                        style={{ width:36, height:20, borderRadius:99, background: c.status==='active' ? '#22c55e' : '#E5E7EB', cursor:'pointer', flexShrink:0, marginTop:2, position:'relative', transition:'background 0.2s' }}>
                        <div style={{ width:16, height:16, borderRadius:'50%', background:'#fff', position:'absolute', top:2, left: c.status==='active' ? 18 : 2, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                      </div>

                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:14, fontWeight:700, color:'#0F172A' }}>{c.name}</span>
                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background: c.status==='active' ? '#DCFCE7' : '#F1F5F9', color: statusColor[c.status] || '#64748B' }}>
                            {statusLabel[c.status] || c.status}
                          </span>
                        </div>
                        {c.description && <div style={{ fontSize:12, color:'#64748B', marginBottom:8 }}>{c.description}</div>}

                        {/* Sequence Steps */}
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:10 }}>
                          {(c.sequence || []).map((step, i) => {
                            const s = STEP_TYPES[step.type]
                            return (
                              <React.Fragment key={i}>
                                <span style={{ fontSize:11, padding:'3px 9px', borderRadius:6, background: s?.bg || '#F1F5F9', color: s?.color || '#475569', fontWeight:600 }}>
                                  {s?.icon} {s?.label || step.type}
                                </span>
                                {i < (c.sequence?.length || 0) - 1 && <span style={{ color:'#CBD5E1', fontSize:12, marginTop:2 }}>→</span>}
                              </React.Fragment>
                            )
                          })}
                        </div>

                        {/* Progress */}
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ flex:1, height:5, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ width: progress + '%', height:'100%', background:P, borderRadius:99, transition:'width 0.3s' }}/>
                          </div>
                          <span style={{ fontSize:11, color:'#64748B', whiteSpace:'nowrap' }}>
                            {c.leads_done}/{c.leads_total} Leads · {c.leads_replied || 0} Antworten
                          </span>
                        </div>
                      </div>

                      {/* Aktionen */}
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => deleteCampaign(c.id)}
                          style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #FECACA', background:'#FEF2F2', color:'#dc2626', fontSize:11, cursor:'pointer' }}>
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── WARTESCHLANGE ── */}
      {tab === 'queue' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontSize:13, color:'#64748B' }}>{jobs.length} ausstehende Jobs</span>
            <button onClick={load} style={{ padding:'6px 12px', borderRadius:7, border:'1px solid #E2E8F0', background:'#fff', fontSize:12, cursor:'pointer', color:'#475569' }}>
              ↻ Aktualisieren
            </button>
          </div>

          {jobs.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', color:'#94A3B8', fontSize:13 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
              Keine Jobs in der Warteschlange — Extension ist bereit
            </div>
          ) : (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'120px 1fr 100px 130px 60px', padding:'8px 16px', background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', gap:8 }}>
                <div>Typ</div><div>Details</div><div>Status</div><div>Geplant</div><div></div>
              </div>
              {jobs.map((job, i) => (
                <div key={job.id} style={{ display:'grid', gridTemplateColumns:'120px 1fr 100px 130px 60px', padding:'10px 16px', borderBottom: i < jobs.length-1 ? '1px solid #F1F5F9' : 'none', alignItems:'center', gap:8, fontSize:12 }}>
                  <div style={{ fontWeight:600, color:'#475569' }}>{jobTypeInfo[job.type] || job.type}</div>
                  <div style={{ color:'#64748B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {job.payload?.linkedin_url?.replace('https://www.linkedin.com/in/', '@') || JSON.stringify(job.payload).substring(0,40)}
                  </div>
                  <div>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, fontWeight:700,
                      background: job.status==='running' ? '#DCFCE7' : job.status==='claimed' ? '#FEF3C7' : '#EFF6FF',
                      color: job.status==='running' ? '#16a34a' : job.status==='claimed' ? '#d97706' : '#2563eb'
                    }}>{job.status}</span>
                  </div>
                  <div style={{ color:'#64748B' }}>
                    {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}
                  </div>
                  <div>
                    {job.status === 'pending' && (
                      <button onClick={() => cancelJob(job.id)}
                        style={{ padding:'3px 8px', borderRadius:5, border:'1px solid #FECACA', background:'#FEF2F2', color:'#dc2626', fontSize:10, cursor:'pointer' }}>
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── NEUE KAMPAGNE MODAL ── */}
      {showNew && (
        <div onClick={() => setShowNew(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'#fff', borderRadius:16, padding:28, width:680, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.18)' }}>
            
            <div style={{ fontSize:16, fontWeight:800, marginBottom:20 }}>🎯 Neue Kampagne</div>

            {/* Name + Beschreibung */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              <div>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Kampagnenname *</label>
                <input value={newCamp.name} onChange={e => setNewCamp(p => ({...p, name:e.target.value}))}
                  style={inp} placeholder="z.B. Outreach Q2 Entscheider" autoFocus />
              </div>
              <div>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Beschreibung</label>
                <input value={newCamp.description} onChange={e => setNewCamp(p => ({...p, description:e.target.value}))}
                  style={inp} placeholder="Optional" />
              </div>
            </div>

            {/* Limits */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
              <div>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Tages-Limit</label>
                <input type="number" value={newCamp.settings.daily_limit}
                  onChange={e => setNewCamp(p => ({...p, settings:{...p.settings, daily_limit:Number(e.target.value)}}))}
                  style={{...inp, width:'auto'}} min="1" max="50" />
              </div>
              <div>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Arbeit ab (Uhr)</label>
                <input type="number" value={newCamp.settings.working_hours_start}
                  onChange={e => setNewCamp(p => ({...p, settings:{...p.settings, working_hours_start:Number(e.target.value)}}))}
                  style={{...inp, width:'auto'}} min="6" max="12" />
              </div>
              <div>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Arbeit bis (Uhr)</label>
                <input type="number" value={newCamp.settings.working_hours_end}
                  onChange={e => setNewCamp(p => ({...p, settings:{...p.settings, working_hours_end:Number(e.target.value)}}))}
                  style={{...inp, width:'auto'}} min="15" max="22" />
              </div>
            </div>

            {/* Sequenz */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#0F172A', marginBottom:10 }}>📋 Sequenz</div>
              {newCamp.sequence.map((step, i) => {
                const s = STEP_TYPES[step.type]
                return (
                  <div key={i} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', marginBottom:8, border:'1px solid #E5E7EB', position:'relative' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:step.type !== 'visit_profile' ? 10 : 0 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:s?.color || '#475569', background:s?.bg || '#F1F5F9', padding:'3px 9px', borderRadius:6 }}>
                        {i+1}. {s?.icon} {s?.label}
                      </span>
                      <select value={step.type} onChange={e => updateStep(i, 'type', e.target.value)}
                        style={{ ...inp, width:'auto', padding:'4px 8px', fontSize:12 }}>
                        {Object.entries(STEP_TYPES).map(([k,v]) => (
                          <option key={k} value={k}>{v.icon} {v.label}</option>
                        ))}
                      </select>
                      <div style={{ display:'flex', alignItems:'center', gap:4, marginLeft:'auto' }}>
                        <span style={{ fontSize:11, color:'#64748B' }}>Warten min.</span>
                        <input type="number" value={step.delay_min} onChange={e => updateStep(i, 'delay_min', Number(e.target.value))}
                          style={{ ...inp, width:70, padding:'4px 8px', fontSize:12 }} min="1" />
                        <span style={{ fontSize:11, color:'#64748B' }}>max.</span>
                        <input type="number" value={step.delay_max} onChange={e => updateStep(i, 'delay_max', Number(e.target.value))}
                          style={{ ...inp, width:70, padding:'4px 8px', fontSize:12 }} min="1" />
                        <span style={{ fontSize:11, color:'#64748B' }}>Min.</span>
                        {newCamp.sequence.length > 1 && (
                          <button onClick={() => removeStep(i)}
                            style={{ marginLeft:4, padding:'3px 7px', borderRadius:6, border:'1px solid #FECACA', background:'#FEF2F2', color:'#dc2626', fontSize:12, cursor:'pointer' }}>✕</button>
                        )}
                      </div>
                    </div>
                    {(step.type === 'send_connect' || step.type === 'send_message') && (
                      <textarea value={step.message} onChange={e => updateStep(i, 'message', e.target.value)}
                        rows={2} placeholder={`Nachrichtentext... Variablen: {{first_name}} {{last_name}} {{company}}`}
                        style={{ ...inp, resize:'vertical', fontSize:12, marginTop:0 }} />
                    )}
                  </div>
                )
              })}
              <button onClick={addStep}
                style={{ padding:'8px 16px', borderRadius:8, border:'1px dashed #CBD5E1', background:'transparent', color:'#64748B', fontSize:12, cursor:'pointer', width:'100%', marginTop:4 }}>
                + Schritt hinzufügen
              </button>
            </div>

            {/* Lead-Auswahl */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#0F172A', marginBottom:8 }}>
                👥 Leads auswählen ({selectedLeads.length}/{leads.length})
              </div>
              <div style={{ maxHeight:200, overflowY:'auto', border:'1px solid #E2E8F0', borderRadius:8 }}>
                {leads.filter(l => l.linkedin_url).map(lead => (
                  <label key={lead.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderBottom:'1px solid #F1F5F9', cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <input type="checkbox" checked={selectedLeads.includes(lead.id)}
                      onChange={e => setSelectedLeads(prev => e.target.checked ? [...prev, lead.id] : prev.filter(x => x !== lead.id))}
                      style={{ accentColor:P }} />
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:13, fontWeight:500 }}>{lead.first_name} {lead.last_name}</span>
                      <span style={{ fontSize:11, color:'#94A3B8', marginLeft:8 }}>{lead.company || ''}</span>
                    </div>
                    <span style={{ fontSize:11, padding:'2px 7px', borderRadius:99, background:'#EEF2FF', color:P, fontWeight:600 }}>⚡{lead.hs_score || 0}</span>
                  </label>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, marginTop:6 }}>
                <button onClick={() => setSelectedLeads(leads.filter(l=>l.linkedin_url).map(l=>l.id))}
                  style={{ fontSize:11, color:P, background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
                  Alle auswählen
                </button>
                <button onClick={() => setSelectedLeads([])}
                  style={{ fontSize:11, color:'#94A3B8', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
                  Auswahl aufheben
                </button>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={() => setShowNew(false)}
                style={{ padding:'8px 18px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', color:'#64748B', fontSize:13, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button onClick={createCampaign} disabled={!newCamp.name.trim()}
                style={{ padding:'8px 24px', borderRadius:8, border:'none', background:newCamp.name.trim()?P:'#E5E7EB', color:'#fff', fontSize:13, fontWeight:700, cursor:newCamp.name.trim()?'pointer':'default' }}>
                🎯 Kampagne erstellen ({selectedLeads.length} Leads)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
