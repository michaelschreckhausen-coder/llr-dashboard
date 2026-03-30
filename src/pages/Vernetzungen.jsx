import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const CONN_STATUS = {
  connected: { label:'✓ Vernetzt',      color:'#065F46', bg:'#ECFDF5', border:'#6EE7B7' },
  pending:   { label:'⏳ Ausstehend',   color:'#92400E', bg:'#FFFBEB', border:'#FCD34D' },
  none:      { label:'— Kein Kontakt',  color:'#475569', bg:'#F8FAFC', border:'#E2E8F0' },
  declined:  { label:'✕ Abgelehnt',     color:'#991B1B', bg:'#FEF2F2', border:'#FECACA' },
}

const LEAD_STATUS_STYLE = {
  Lead: { bg:'#F1F5F9', color:'#475569' },
  LQL:  { bg:'#EFF6FF', color:'#1D4ED8' },
  MQN:  { bg:'#F5F3FF', color:'#6D28D9' },
  MQL:  { bg:'#FFFBEB', color:'#B45309' },
  SQL:  { bg:'#F0FDF4', color:'#15803D' },
}

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'
function initials(n) { return (n||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().substring(0,2) }

/* ── KI-Anfrage Modal ── */
function AnfrageModal({ lead, onClose, onSaved }) {
  const [msg, setMsg]     = useState('')
  const [gen, setGen]     = useState(false)
  const [saving, setSaving] = useState(false)

  async function generate() {
    setGen(true)
    try {
      const name = fullName(lead)
      const pos  = lead.job_title || lead.headline || ''
      const comp = lead.company || ''

      const { data, error } = await supabase.functions.invoke('clever-api', {
        body: {
          action: 'generate',
          prompt: 'Schreibe eine kurze, persoenliche LinkedIn-Vernetzungsanfrage auf Deutsch fuer ' +
            name + (pos ? ' (' + pos + ')' : '') + (comp ? ' bei ' + comp : '') +
            '. Maximal 300 Zeichen. Nur die Nachricht selbst, kein Kommentar.',
          type: 'connection_request',
          name, position: pos, company: comp
        }
      })

      if (error) throw new Error(error.message || JSON.stringify(error))

      console.log('clever-api raw:', JSON.stringify(data))

      let text = null
      if (typeof data === 'string') text = data
      else if (data?.text)    text = data.text
      else if (data?.message) text = data.message
      else if (data?.about)   text = data.about
      else if (data?.content && Array.isArray(data.content)) text = data.content[0]?.text
      else if (typeof data?.content === 'string') text = data.content
      else if (data?.result)  text = data.result
      else if (data?.output)  text = data.output
      else if (data?.response) text = data.response

      if (text) {
        setMsg(text.trim().substring(0, 300))
      } else {
        console.error('clever-api unbekanntes Format:', JSON.stringify(data))
        setMsg('Bitte Nachricht manuell eingeben.')
      }
    } catch(e) {
      console.error('generate Fehler:', e.message)
      setMsg('Fehler: ' + e.message)
    }
    setGen(false)
  }

  async function save() {
    setSaving(true)
    await supabase.from('leads').update({
      connection_status: 'pending',
      connection_message: msg,
      connection_sent_at: new Date().toISOString(),
    }).eq('id', lead.id)
    onSaved(lead.id, 'pending', msg)
    setSaving(false)
    onClose()
  }

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:16,padding:28,width:520,maxWidth:'90vw',boxShadow:'0 20px 60px rgba(0,0,0,.15)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div>
            <div style={{fontWeight:700,fontSize:17,color:'#0F172A'}}>Vernetzungsanfrage</div>
            <div style={{fontSize:13,color:'#64748B',marginTop:2}}>{fullName(lead)} · {lead.company||''}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#94A3B8'}}>✕</button>
        </div>

        <div style={{marginBottom:12,fontSize:13,color:'#475569'}}>Nachricht (max. 300 Zeichen)</div>
        <textarea
          value={msg}
          onChange={e=>setMsg(e.target.value.substring(0,300))}
          maxLength={300}
          rows={5}
          placeholder="Persönliche Nachricht für die Vernetzungsanfrage..."
          style={{width:'100%',boxSizing:'border-box',padding:'10px 12px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:14,resize:'vertical',outline:'none',color:'#0F172A'}}
        />
        <div style={{textAlign:'right',fontSize:11,color:'#94A3B8',marginTop:4}}>{msg.length}/300 Zeichen</div>

        <div style={{display:'flex',gap:10,marginTop:16}}>
          <button onClick={generate} disabled={gen} style={{flex:1,padding:'10px 0',borderRadius:8,border:'1px solid #E2E8F0',background:'#F8FAFC',color:'#1D4ED8',fontWeight:600,fontSize:13,cursor:'pointer'}}>
            {gen ? '⏳ Generiere...' : '✨ KI-Nachricht generieren'}
          </button>
          <button onClick={save} disabled={saving||!msg} style={{flex:1,padding:'10px 0',borderRadius:8,border:'none',background: msg?'#0A66C2':'#E2E8F0',color:'#fff',fontWeight:600,fontSize:13,cursor:msg?'pointer':'not-allowed'}}>
            {saving ? 'Speichere...' : '📤 Anfrage speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Status Modal ── */
function StatusModal({ lead, onClose, onSaved }) {
  const [status, setStatus] = useState(lead.connection_status || 'none')
  const [note,   setNote]   = useState(lead.connection_note   || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const updates = { connection_status: status, connection_note: note }
    if (status === 'connected' && !lead.connected_at) updates.connected_at = new Date().toISOString()
    await supabase.from('leads').update(updates).eq('id', lead.id)
    onSaved(lead.id, status, note)
    setSaving(false)
    onClose()
  }

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:16,padding:28,width:420,boxShadow:'0 20px 60px rgba(0,0,0,.15)'}}>
        <div style={{fontWeight:700,fontSize:17,color:'#0F172A',marginBottom:6}}>Status aktualisieren</div>
        <div style={{fontSize:13,color:'#64748B',marginBottom:20}}>{fullName(lead)}</div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
          {Object.entries(CONN_STATUS).map(([key, cfg]) => (
            <button key={key} onClick={()=>setStatus(key)} style={{
              padding:'10px 14px',borderRadius:8,border:`2px solid ${status===key?cfg.border:'#E2E8F0'}`,
              background:status===key?cfg.bg:'#fff',color:cfg.color,fontWeight:status===key?700:400,
              fontSize:13,cursor:'pointer',textAlign:'left'
            }}>{cfg.label}</button>
          ))}
        </div>

        <div style={{marginBottom:8,fontSize:13,color:'#475569'}}>Notiz (optional)</div>
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3}
          placeholder="Notiz zur Verbindung..."
          style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:13,resize:'vertical',outline:'none'}}/>

        <div style={{display:'flex',gap:10,marginTop:16}}>
          <button onClick={onClose} style={{flex:1,padding:'9px 0',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',color:'#64748B',cursor:'pointer'}}>Abbrechen</button>
          <button onClick={save} disabled={saving} style={{flex:1,padding:'9px 0',borderRadius:8,border:'none',background:'#0A66C2',color:'#fff',fontWeight:600,cursor:'pointer'}}>
            {saving?'Speichere...':'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Haupt-Komponente ── */
export default function Vernetzungen() {
  const [leads, setLeads]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('all')
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState(null)
  const [anfrageModal, setAnfrageModal] = useState(null)
  const [statusModal, setStatusModal]   = useState(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('leads')
      .select('id,first_name,last_name,name,job_title,headline,company,location,linkedin_url,avatar_url,email,phone,connection_status,connection_sent_at,connected_at,connection_note,connection_message,lead_score,icp_match,pipeline_stage,status,created_at')
      .eq('user_id', user.id)
      .order('connected_at', { ascending: false, nullsFirst: false })
    setLeads(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function handleAnfrageSaved(id, newStatus, msg) {
    setLeads(l => l.map(x => x.id===id ? {...x, connection_status:newStatus, connection_message:msg} : x))
  }
  function handleStatusSaved(id, newStatus, note) {
    setLeads(l => l.map(x => x.id===id ? {...x, connection_status:newStatus, connection_note:note} : x))
  }

  const filtered = leads.filter(l => {
    const mf = filter==='all' || l.connection_status===filter
    const ms = !search ||
      fullName(l).toLowerCase().includes(search.toLowerCase()) ||
      (l.company||'').toLowerCase().includes(search.toLowerCase()) ||
      (l.job_title||l.headline||'').toLowerCase().includes(search.toLowerCase())
    return mf && ms
  })

  const stats = {
    connected: leads.filter(l=>l.connection_status==='connected').length,
    pending:   leads.filter(l=>l.connection_status==='pending').length,
    none:      leads.filter(l=>!l.connection_status||l.connection_status==='none').length,
  }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'#64748B',fontSize:14}}>Lade Vernetzungen…</div>

  return (
    <div style={{padding:'32px 40px',maxWidth:1100,margin:'0 auto'}}>
      {/* Modals */}
      {anfrageModal && <AnfrageModal lead={anfrageModal} onClose={()=>setAnfrageModal(null)} onSaved={handleAnfrageSaved}/>}
      {statusModal  && <StatusModal  lead={statusModal}  onClose={()=>setStatusModal(null)}  onSaved={handleStatusSaved}/>}

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#0F172A',margin:0}}>Vernetzungen</h1>
          <p style={{fontSize:14,color:'#64748B',marginTop:4}}>LinkedIn-Kontakte aus deinem CRM verwalten</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          {[
            {label:'Vernetzt',     val:stats.connected, color:'#065F46', bg:'#ECFDF5'},
            {label:'Ausstehend',   val:stats.pending,   color:'#92400E', bg:'#FFFBEB'},
            {label:'Kein Kontakt', val:stats.none,      color:'#475569', bg:'#F8FAFC'},
          ].map(s=>(
            <div key={s.label} style={{background:s.bg,borderRadius:10,padding:'8px 16px',textAlign:'center',minWidth:80}}>
              <div style={{fontSize:22,fontWeight:700,color:s.color}}>{s.val}</div>
              <div style={{fontSize:11,color:s.color,fontWeight:500}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter + Suche */}
      <div style={{display:'flex',gap:10,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Name, Firma oder Jobtitel suchen…"
          style={{flex:1,minWidth:200,padding:'9px 14px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:14,outline:'none',color:'#0F172A'}}/>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {[['all','Alle'],['connected','Vernetzt'],['pending','Ausstehend'],['none','Nicht vernetzt'],['declined','Abgelehnt']].map(([key,lbl])=>(
            <button key={key} onClick={()=>setFilter(key)} style={{
              padding:'7px 14px',borderRadius:8,border:'1px solid',
              borderColor:filter===key?'#3B82F6':'#E2E8F0',
              background:filter===key?'#EFF6FF':'#fff',
              color:filter===key?'#1D4ED8':'#64748B',
              fontSize:13,fontWeight:filter===key?600:400,cursor:'pointer'
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Lead-Liste */}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {filtered.length===0 && (
          <div style={{textAlign:'center',padding:'60px 0',color:'#94A3B8',fontSize:14}}>Keine Vernetzungen gefunden.</div>
        )}
        {filtered.map(lead => {
          const conn  = CONN_STATUS[lead.connection_status||'none']
          const lstat = LEAD_STATUS_STYLE[lead.status] || LEAD_STATUS_STYLE.Lead
          const name  = fullName(lead)
          const isOpen = selected===lead.id
          return (
            <div key={lead.id} style={{background:'#fff',border:'1px solid #E8EDF2',borderRadius:12,overflow:'hidden'}}>
              {/* Zeilen-Header */}
              <div onClick={()=>setSelected(isOpen?null:lead.id)}
                style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',cursor:'pointer'}}>
                {/* Avatar */}
                {lead.avatar_url
                  ? <img src={lead.avatar_url} alt={name} style={{width:44,height:44,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>
                  : <div style={{width:44,height:44,borderRadius:'50%',background:'#6366F1',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:15,fontWeight:700,flexShrink:0}}>{initials(name)}</div>
                }
                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <span style={{fontWeight:600,fontSize:15,color:'#0F172A'}}>{name}</span>
                    {lead.linkedin_url && (
                      <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                        onClick={e=>e.stopPropagation()}
                        style={{fontSize:11,color:'#0A66C2',textDecoration:'none',fontWeight:500}}>LinkedIn ↗</a>
                    )}
                  </div>
                  <div style={{fontSize:13,color:'#64748B',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {lead.job_title||lead.headline||'—'}
                    {lead.company && <span style={{color:'#94A3B8'}}> · {lead.company}</span>}
                  </div>
                </div>
                {/* Badges + Aktionen */}
                <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:6,background:lstat.bg,color:lstat.color}}>{lead.status||'Lead'}</span>
                  <span style={{fontSize:12,fontWeight:500,padding:'4px 10px',borderRadius:8,background:conn.bg,color:conn.color,border:`1px solid ${conn.border}`}}>{conn.label}</span>
                  {(lead.lead_score||0)>0 && <span style={{fontSize:11,color:'#64748B'}}>Score: {lead.lead_score}</span>}
                  {lead.connected_at && <span style={{fontSize:11,color:'#94A3B8'}}>{new Date(lead.connected_at).toLocaleDateString('de-DE')}</span>}
                  {/* Aktions-Buttons */}
                  <button onClick={e=>{e.stopPropagation();setAnfrageModal(lead)}} style={{
                    padding:'6px 10px',borderRadius:7,border:'1px solid #BFDBFE',background:'#EFF6FF',
                    color:'#1D4ED8',fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'
                  }}>✨ Anfrage</button>
                  <button onClick={e=>{e.stopPropagation();setStatusModal(lead)}} style={{
                    padding:'6px 10px',borderRadius:7,border:'1px solid #E2E8F0',background:'#F8FAFC',
                    color:'#475569',fontSize:11,fontWeight:600,cursor:'pointer'
                  }}>⚙ Status</button>
                </div>
              </div>

              {/* Ausgeklapptes Detail */}
              {isOpen && (
                <div style={{padding:'0 18px 16px',borderTop:'1px solid #F1F5F9',paddingTop:14}}>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
                    {[
                      {label:'E-Mail',       val:lead.email},
                      {label:'Telefon',      val:lead.phone},
                      {label:'Standort',     val:lead.location},
                      {label:'Firma',        val:lead.company},
                      {label:'Pipeline',     val:lead.pipeline_stage||'—'},
                      {label:'ICP Match',    val:lead.icp_match!=null?lead.icp_match+'%':null},
                      {label:'Notiz',        val:lead.connection_note},
                      {label:'Nachricht',    val:lead.connection_message},
                      {label:'Kontakt seit', val:lead.connection_sent_at?new Date(lead.connection_sent_at).toLocaleDateString('de-DE'):null},
                    ].filter(f=>f.val).map(f=>(
                      <div key={f.label}>
                        <div style={{fontSize:11,color:'#94A3B8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{f.label}</div>
                        <div style={{fontSize:13,color:'#1E293B',marginTop:2}}>{f.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
