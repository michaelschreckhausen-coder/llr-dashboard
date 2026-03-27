import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_CONFIG = {
  draft:       { label:'Entwurf',      color:'#64748B', bg:'#F1F5F9', icon:'📝' },
  sent:        { label:'Gesendet',     color:'#0A66C2', bg:'#EFF6FF', icon:'📤' },
  accepted:    { label:'Angenommen',   color:'#065F46', bg:'#ECFDF5', icon:'✅' },
  declined:    { label:'Abgelehnt',    color:'#991B1B', bg:'#FEF2F2', icon:'❌' },
  no_response: { label:'Keine Antwort',color:'#92400E', bg:'#FFFBEB', icon:'⏳' },
}

const LiIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
const XIcon    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const SparkIcon= () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
const CopyIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>

function Avatar({ name, url, size=40 }) {
  const colors = ['#0A66C2','#10B981','#F59E0B','#8B5CF6','#EC4899']
  const bg = colors[(name||'?').charCodeAt(0) % colors.length]
  const initials = (name||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().substring(0,2)
  if (url) return <img src={url} alt={name} style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>
  return <div style={{width:size,height:size,borderRadius:'50%',background:'linear-gradient(135deg,'+bg+','+bg+'BB)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.35,fontWeight:800,color:'#fff',flexShrink:0}}>{initials}</div>
}

/* ── Lead → Vernetzung Modal ── */
function LeadVernetzungModal({ lead, onClose, onCreated }) {
  const [msg, setMsg]       = useState('')
  const [saving, setSaving] = useState(false)
  const [gen, setGen]       = useState(false)
  const [copied, setCopied] = useState(false)
  const inp = { width:'100%', padding:'8px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#FAFAFA', boxSizing:'border-box' }

  async function generate() {
    setGen(true)
    try {
      const { data: { session: ss } } = await supabase.auth.getSession()
      const prompt = 'Generiere eine persönliche LinkedIn Vernetzungsanfrage (max. 300 Zeichen) auf Deutsch für:\nName: ' + lead.name + '\nPosition: ' + (lead.headline||'') + '\nUnternehmen: ' + (lead.company||'') + '\nNur die fertige Nachricht.'
      const r = await fetch('https://jdhajqpgfrsuoluaesjn.supabase.co/functions/v1/generate', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+ss.access_token}, body:JSON.stringify({type:'comment',prompt}) })
      const d = await r.json()
      setMsg(d.text || d.comment || '')
    } catch(e) { setMsg('⚠️ '+e.message) }
    setGen(false)
  }

  async function save() {
    setSaving(true)
    const { data: vData, error } = await supabase.from('vernetzungen').insert({
      user_id: lead.user_id, lead_id: lead.id,
      li_name: lead.name, li_headline: lead.headline||'', li_company: lead.company||'',
      li_location: lead.location||'', li_url: lead.profile_url||lead.linkedin_url||'',
      li_about:'', li_skills:[], status:'draft', final_msg: msg, generated_msg: msg,
    }).select().single()
    if (error) { alert(error.message); setSaving(false); return }
    await supabase.from('leads').update({ connection_status:'pending' }).eq('id', lead.id)
    setSaving(false)
    onCreated(vData)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={onClose}>
      <div style={{background:'#fff',borderRadius:16,width:540,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto',boxShadow:'0 24px 64px rgba(15,23,42,0.18)'}} onClick={e=>e.stopPropagation()}>
        <div style={{background:'linear-gradient(135deg,#0A66C2,#0A66C299)',padding:'18px 22px 14px'}}>
          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            <Avatar name={lead.name} size={48}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:16,color:'#fff'}}>{lead.name}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,0.85)',marginTop:1}}>{lead.headline}</div>
              {lead.company && <div style={{fontSize:11,color:'rgba(255,255,255,0.7)',fontWeight:600,marginTop:1}}>{lead.company}</div>}
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:8,width:28,height:28,cursor:'pointer',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}><XIcon/></button>
          </div>
          <div style={{marginTop:8,fontSize:11,color:'rgba(255,255,255,0.75)',display:'flex',gap:12'}}>
            {lead.location && <span>📍 {lead.location}</span>}
            {lead.lead_score > 0 && <span>⭐ Score {lead.lead_score}</span>}
          </div>
        </div>
        <div style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:14}}>
          <button onClick={generate} disabled={gen} style={{width:'100%',padding:'11px',borderRadius:999,border:'none',background:'linear-gradient(135deg,#0A66C2,#8B5CF6)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,opacity:gen?0.7:1}}>
            {gen ? '⏳ Generiere...' : <><SparkIcon/> KI-Vernetzungsnachricht generieren</>}
          </button>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>Vernetzungsnachricht (optional, max. 300 Zeichen)</div>
            <div style={{position:'relative'}}>
              <textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={4} placeholder="Hallo [Name], ich bin auf Ihr Profil gestoßen..." style={{...inp,resize:'vertical',lineHeight:1.6,paddingRight:40}}/>
              {msg && <button onClick={()=>{navigator.clipboard.writeText(msg);setCopied(true);setTimeout(()=>setCopied(false),2000)}} style={{position:'absolute',top:8,right:8,background:copied?'#ECFDF5':'#F1F5F9',border:'1px solid '+(copied?'#A7F3D0':'#E2E8F0'),borderRadius:6,width:28,height:28,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:copied?'#065F46':'#64748B'}}>{copied?'✓':<CopyIcon/>}</button>}
            </div>
            {msg && <div style={{fontSize:11,color:msg.length>300?'#EF4444':'#94A3B8',textAlign:'right',marginTop:4}}>{msg.length}/300</div>}
          </div>
          {(lead.profile_url||lead.linkedin_url) && (
            <a href={lead.profile_url||lead.linkedin_url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:8,background:'#EFF6FF',border:'1px solid #BFDBFE',color:'#0A66C2',fontSize:12,fontWeight:700,textDecoration:'none'}}>
              <LiIcon/> LinkedIn-Profil öffnen
            </a>
          )}
        </div>
        <div style={{padding:'12px 22px 18px',borderTop:'1px solid #F1F5F9',display:'flex',justifyContent:'flex-end',gap:10}}>
          <button onClick={onClose} style={{padding:'8px 18px',borderRadius:8,border:'1px solid #E2E8F0',background:'transparent',color:'#64748B',fontSize:13,fontWeight:600,cursor:'pointer'}}>Abbrechen</button>
          <button onClick={save} disabled={saving} style={{padding:'8px 22px',borderRadius:8,border:'none',background:'#0A66C2',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving?0.6:1}}>
            {saving ? '⏳ Erstelle...' : '🤝 Vernetzung erstellen →'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Bestehende Vernetzung Modal ── */
function VernetzungModal({ item, onClose, onSave, onDelete }) {
  const [form, setForm]   = useState({...item})
  const [gen, setGen]     = useState(false)
  const [copied, setCopied] = useState(false)
  const cfg = STATUS_CONFIG[form.status] || STATUS_CONFIG.draft
  const inp = { width:'100%', padding:'8px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#FAFAFA', boxSizing:'border-box' }

  async function generate() {
    setGen(true)
    try {
      const { data: { session: ss } } = await supabase.auth.getSession()
      const prompt = 'Generiere eine persönliche LinkedIn Vernetzungsanfrage (max. 300 Zeichen) auf Deutsch.\nName: '+form.li_name+'\nPosition: '+(form.li_headline||'')+'\nUnternehmen: '+(form.li_company||'')+(form.context_notes?'\nKontext: '+form.context_notes:'')+'\nNur die fertige Nachricht.'
      const r = await fetch('https://jdhajqpgfrsuoluaesjn.supabase.co/functions/v1/generate', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+ss.access_token}, body:JSON.stringify({type:'comment',prompt}) })
      const d = await r.json()
      setForm(f=>({...f, generated_msg:d.text||d.comment||'', final_msg:d.text||d.comment||''}))
    } catch(e) { setForm(f=>({...f,generated_msg:'⚠️ '+e.message})) }
    setGen(false)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.5)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={onClose}>
      <div style={{background:'#fff',borderRadius:16,width:580,maxWidth:'95vw',maxHeight:'92vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(15,23,42,0.18)'}} onClick={e=>e.stopPropagation()}>
        <div style={{background:'linear-gradient(135deg,#0A66C2,#0A66C299)',padding:'18px 22px 14px',flexShrink:0}}>
          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            <Avatar name={form.li_name} url={form.li_avatar_url} size={48}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:800,fontSize:16,color:'#fff'}}>{form.li_name}</div>
              {form.li_headline && <div style={{fontSize:12,color:'rgba(255,255,255,0.85)',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{form.li_headline}</div>}
              {form.li_company && <div style={{fontSize:11,color:'rgba(255,255,255,0.7)',fontWeight:600,marginTop:1}}>{form.li_company}</div>}
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {form.li_url && <a href={form.li_url.startsWith('http')?form.li_url:'https://'+form.li_url} target="_blank" rel="noreferrer" style={{padding:'4px 10px',borderRadius:999,background:'rgba(255,255,255,0.2)',color:'#fff',fontSize:11,fontWeight:700,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}><LiIcon/> Profil</a>}
              <button onClick={onClose} style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:8,width:28,height:28,cursor:'pointer',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}><XIcon/></button>
            </div>
          </div>
          <div style={{display:'flex',gap:6,marginTop:12,flexWrap:'wrap'}}>
            {Object.entries(STATUS_CONFIG).map(([s,c])=>(
              <button key={s} onClick={()=>setForm(f=>({...f,status:s}))} style={{padding:'3px 10px',borderRadius:999,fontSize:10,fontWeight:700,border:'1.5px solid '+(form.status===s?'rgba(255,255,255,0.8)':'rgba(255,255,255,0.3)'),background:form.status===s?'rgba(255,255,255,0.25)':'transparent',color:'#fff',cursor:'pointer'}}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'18px 22px',display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>Kontext für KI</div>
            <input value={form.context_notes||''} onChange={e=>setForm(f=>({...f,context_notes:e.target.value}))} style={inp} placeholder="z.B. gemeinsames Interesse..."/>
          </div>
          <button onClick={generate} disabled={gen} style={{width:'100%',padding:'11px',borderRadius:999,border:'none',background:'linear-gradient(135deg,#0A66C2,#8B5CF6)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,opacity:gen?0.7:1}}>
            {gen ? '⏳ Generiere...' : <><SparkIcon/> KI-Nachricht generieren</>}
          </button>
          {(form.generated_msg||form.final_msg) && (
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>Vernetzungsnachricht</div>
              <div style={{position:'relative'}}>
                <textarea value={form.final_msg||form.generated_msg||''} onChange={e=>setForm(f=>({...f,final_msg:e.target.value}))} rows={5} style={{...inp,resize:'vertical',lineHeight:1.6,paddingRight:40}}/>
                <button onClick={()=>{navigator.clipboard.writeText(form.final_msg||form.generated_msg||'');setCopied(true);setTimeout(()=>setCopied(false),2000)}} style={{position:'absolute',top:8,right:8,background:copied?'#ECFDF5':'#F1F5F9',border:'1px solid '+(copied?'#A7F3D0':'#E2E8F0'),borderRadius:6,width:28,height:28,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:copied?'#065F46':'#64748B'}}>{copied?'✓':<CopyIcon/>}</button>
              </div>
              <div style={{fontSize:11,color:(form.final_msg||form.generated_msg||'').length>300?'#EF4444':'#94A3B8',marginTop:4,textAlign:'right'}}>{(form.final_msg||form.generated_msg||'').length}/300</div>
            </div>
          )}
        </div>
        <div style={{padding:'12px 22px 16px',borderTop:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',flexShrink:0,background:'#FAFAFA'}}>
          <button onClick={()=>{if(window.confirm('Löschen?')) onDelete(item.id)}} style={{padding:'7px 14px',borderRadius:8,border:'1.5px solid #FCA5A5',background:'#FEF2F2',color:'#EF4444',fontSize:12,fontWeight:700,cursor:'pointer'}}>Löschen</button>
          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} style={{padding:'7px 14px',borderRadius:8,border:'1px solid #E2E8F0',background:'transparent',color:'#64748B',fontSize:12,fontWeight:600,cursor:'pointer'}}>Abbrechen</button>
            <button onClick={()=>onSave(form)} style={{padding:'7px 20px',borderRadius:8,border:'none',background:'#0A66C2',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>✓ Speichern</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══ HAUPTSEITE ══ */
export default function Vernetzungen({ session }) {
  const [vernetzungen, setVernetzungen] = useState([])
  const [offeneLeads,  setOffeneLeads]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [openItem,     setOpenItem]     = useState(null)
  const [openLead,     setOpenLead]     = useState(null)
  const [activeTab,    setActiveTab]    = useState('offen')
  const [filterStatus, setFilter]       = useState('all')
  const [search,       setSearch]       = useState('')
  const [flash,        setFlash]        = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const uid = session.user.id
    const [{ data: vData }, { data: lData }] = await Promise.all([
      supabase.from('vernetzungen').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
      supabase.from('leads').select('*').eq('user_id',uid).order('lead_score',{ascending:false}),
    ])
    const vList = vData || []
    const lList = lData || []
    const vernetzteUrls = new Set(vList.map(v=>v.li_url).filter(Boolean))
    const vernetzteIds  = new Set(vList.map(v=>v.lead_id).filter(Boolean))
    const offen = lList.filter(l =>
      !vernetzteIds.has(l.id) &&
      !vernetzteUrls.has(l.profile_url) &&
      !vernetzteUrls.has(l.linkedin_url)
    )
    setVernetzungen(vList)
    setOffeneLeads(offen)
    setLoading(false)
  }, [session.user.id])

  useEffect(()=>{ load() },[load])

  useEffect(()=>{
    function check() {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        chrome.storage.local.get(['llr_profile','llr_ts'],data=>{
          if (!data.llr_profile||Date.now()-(data.llr_ts||0)>300000) return
          chrome.storage.local.remove(['llr_profile','llr_ts'])
          importExt(data.llr_profile)
        })
      }
    }
    check(); const t=setTimeout(check,1000)
    const onMsg=e=>{if((e.data?.type==='LLR_IMPORT'||e.data?.type==='LLR_PROFILE_IMPORT')&&e.data?.profile)importExt(e.data.profile)}
    window.addEventListener('message',onMsg)
    return ()=>{ clearTimeout(t); window.removeEventListener('message',onMsg) }
  },[])

  async function importExt(profile) {
    const p={li_name:profile.li_name||'',li_headline:profile.li_headline||'',li_company:profile.li_company||'',li_position:profile.li_position||'',li_location:profile.li_location||'',li_about:profile.li_about||'',li_url:profile.li_url||'',li_avatar_url:profile.li_avatar_url||'',li_skills:Array.isArray(profile.li_skills)?profile.li_skills:[]}
    if (!p.li_name) return
    const {data,error}=await supabase.from('vernetzungen').insert({...p,user_id:session.user.id,status:'draft'}).select().single()
    if(error){showFlash(error.message,'error');return}
    setVernetzungen(prev=>[data,...prev]); setOpenItem(data)
    showFlash('✅ '+p.li_name+' importiert'); load()
  }

  async function handleSave(updated) {
    const {error}=await supabase.from('vernetzungen').update({...updated,updated_at:new Date().toISOString()}).eq('id',updated.id)
    if(error){showFlash(error.message,'error');return}
    if(updated.lead_id){
      const cs=updated.status==='accepted'?'connected':updated.status==='sent'||updated.status==='no_response'?'pending':updated.status==='declined'?'declined':'none'
      await supabase.from('leads').update({connection_status:cs}).eq('id',updated.lead_id)
    }
    setVernetzungen(prev=>prev.map(i=>i.id===updated.id?updated:i))
    setOpenItem(null); showFlash('Gespeichert!')
  }

  async function handleDelete(id) {
    const item=vernetzungen.find(v=>v.id===id)
    await supabase.from('vernetzungen').delete().eq('id',id)
    if(item?.lead_id) await supabase.from('leads').update({connection_status:'none'}).eq('id',item.lead_id)
    setVernetzungen(prev=>prev.filter(i=>i.id!==id)); setOpenItem(null)
    showFlash('Gelöscht'); load()
  }

  async function handleLeadCreated(v) {
    setOpenLead(null)
    setVernetzungen(prev=>[v,...prev])
    showFlash('✅ Vernetzung für '+v.li_name+' erstellt!')
    load(); setActiveTab('aktionen')
  }

  function showFlash(msg,type='success'){setFlash({msg,type});setTimeout(()=>setFlash(null),3500)}

  const filtV = vernetzungen.filter(i=>{
    if(filterStatus!=='all'&&i.status!==filterStatus)return false
    if(search){const q=search.toLowerCase();return(i.li_name||'').toLowerCase().includes(q)||(i.li_company||'').toLowerCase().includes(q)}
    return true
  })
  const filtL = offeneLeads.filter(l=>{
    if(!search)return true; const q=search.toLowerCase()
    return(l.name||'').toLowerCase().includes(q)||(l.company||'').toLowerCase().includes(q)||(l.headline||'').toLowerCase().includes(q)
  })

  const stats={
    offen:      offeneLeads.length,
    gesamt:     vernetzungen.length,
    gesendet:   vernetzungen.filter(i=>['sent','accepted','declined','no_response'].includes(i.status)).length,
    angenommen: vernetzungen.filter(i=>i.status==='accepted').length,
    rate:       vernetzungen.length?Math.round(vernetzungen.filter(i=>i.status==='accepted').length/Math.max(vernetzungen.filter(i=>i.status!=='draft').length,1)*100):0,
  }

  const tabSt = active => ({
    padding:'9px 20px',border:'none',background:active?'#fff':'transparent',
    color:active?'#0A66C2':'#64748B',fontWeight:active?700:500,fontSize:13,cursor:'pointer',
    borderBottom:active?'2px solid #0A66C2':'2px solid transparent',
  })

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'14px 24px',borderBottom:'1px solid #E2E8F0',background:'#fff',flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div>
            <h1 style={{fontSize:20,fontWeight:800,color:'#0F172A',margin:0,display:'flex',alignItems:'center',gap:8}}><LiIcon/> Vernetzungen</h1>
            <div style={{fontSize:12,color:'#94A3B8',marginTop:2}}>LinkedIn Vernetzungsnachrichten generieren & tracken</div>
          </div>
          <button onClick={()=>setActiveTab('offen')} style={{display:'flex',alignItems:'center',gap:7,padding:'9px 20px',borderRadius:999,background:'#0A66C2',color:'#fff',border:'none',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 1px 4px rgba(10,102,194,0.3)'}}>
            + Profil importieren
          </button>
        </div>
        <div style={{display:'flex',gap:10}}>
          {[
            {label:'Nicht vernetzt', value:stats.offen,      color:'#DC2626', bg:'#FEF2F2'},
            {label:'Aktionen',       value:stats.gesamt,     color:'#475569', bg:'#F8FAFC'},
            {label:'Gesendet',       value:stats.gesendet,   color:'#0A66C2', bg:'#EFF6FF'},
            {label:'Angenommen',     value:stats.angenommen, color:'#065F46', bg:'#ECFDF5'},
            {label:'Akzeptanzrate',  value:stats.rate+'%',   color:'#5B21B6', bg:'#F5F3FF'},
          ].map(s=>(
            <div key={s.label} style={{padding:'8px 14px',background:s.bg,borderRadius:10,border:'1px solid #E2E8F0'}}>
              <div style={{fontSize:18,fontWeight:900,color:s.color}}>{s.value}</div>
              <div style={{fontSize:10,color:'#94A3B8',fontWeight:600}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:0,padding:'0 24px',background:'#F8FAFC',borderBottom:'1px solid #E2E8F0',flexShrink:0}}>
        <button style={tabSt(activeTab==='offen')} onClick={()=>setActiveTab('offen')}>
          🔴 Nicht vernetzt <span style={{background:'#FEF2F2',color:'#DC2626',borderRadius:999,padding:'1px 7px',fontSize:11,fontWeight:800,marginLeft:6}}>{stats.offen}</span>
        </button>
        <button style={tabSt(activeTab==='aktionen')} onClick={()=>setActiveTab('aktionen')}>
          📋 Aktionen <span style={{background:'#EFF6FF',color:'#0A66C2',borderRadius:999,padding:'1px 7px',fontSize:11,fontWeight:800,marginLeft:6}}>{stats.gesamt}</span>
        </button>
      </div>

      {/* Filter */}
      <div style={{padding:'10px 24px',borderBottom:'1px solid #F1F5F9',display:'flex',gap:10,alignItems:'center',background:'#FAFAFA',flexShrink:0}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Suchen..."
          style={{flex:1,maxWidth:260,padding:'7px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#fff'}}/>
        {activeTab==='aktionen' && (
          <div style={{display:'flex',gap:6}}>
            {[['all','Alle'],...Object.entries(STATUS_CONFIG).map(([s,c])=>[s,c.icon+' '+c.label])].map(([s,l])=>(
              <button key={s} onClick={()=>setFilter(s)} style={{padding:'5px 12px',borderRadius:999,fontSize:11,fontWeight:filterStatus===s?700:500,border:'1px solid '+(filterStatus===s?'#0A66C2':'#E2E8F0'),background:filterStatus===s?'#EFF6FF':'#fff',color:filterStatus===s?'#0A66C2':'#64748B',cursor:'pointer'}}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {flash && <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:flash.type==='error'?'#EF4444':'#0F172A',color:'#fff',padding:'8px 20px',borderRadius:999,fontSize:13,fontWeight:600,zIndex:999,boxShadow:'0 4px 16px rgba(15,23,42,0.2)'}}>{flash.type==='error'?'❌':'✓'} {flash.msg}</div>}

      {/* Content */}
      <div style={{flex:1,overflowY:'auto',padding:'16px 24px'}}>
        {loading ? (
          <div style={{textAlign:'center',padding:56,color:'#94A3B8'}}>⏳ Lade...</div>
        ) : activeTab==='offen' ? (
          filtL.length===0 ? (
            <div style={{textAlign:'center',padding:56}}>
              <div style={{fontSize:48,marginBottom:12}}>🎉</div>
              <div style={{fontWeight:700,fontSize:16,color:'#475569'}}>Alle Leads wurden bearbeitet!</div>
              <div style={{fontSize:13,color:'#94A3B8',marginTop:4}}>Keine Leads ohne Vernetzungsaktion vorhanden.</div>
            </div>
          ) : (
            <div>
              <div style={{fontSize:13,color:'#64748B',marginBottom:14}}>
                {filtL.length} importierte Leads ohne LinkedIn-Vernetzung — klicke auf einen Lead um eine Vernetzungsanfrage zu erstellen:
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {filtL.map(lead=>{
                  const score=lead.lead_score||0
                  const sCol=score>=75?'#059669':score>=50?'#D97706':'#94A3B8'
                  const sBg =score>=75?'#F0FDF4':score>=50?'#FFFBEB':'#F8FAFC'
                  return (
                    <div key={lead.id} onClick={()=>setOpenLead(lead)}
                      style={{background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',padding:'14px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:14,transition:'all 0.15s',boxShadow:'0 1px 3px rgba(15,23,42,0.05)'}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor='#0A66C2';e.currentTarget.style.boxShadow='0 4px 16px rgba(10,102,194,0.1)'}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor='#E2E8F0';e.currentTarget.style.boxShadow='0 1px 3px rgba(15,23,42,0.05)'}}>
                      <Avatar name={lead.name} size={44}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:14,color:'#0F172A'}}>{lead.name}</div>
                        {lead.headline && <div style={{fontSize:12,color:'#64748B',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.headline}</div>}
                        {lead.company  && <div style={{fontSize:12,color:'#0A66C2',fontWeight:600,marginTop:1}}>{lead.company}</div>}
                        {lead.location && <div style={{fontSize:11,color:'#94A3B8',marginTop:2}}>📍 {lead.location}</div>}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,flexShrink:0}}>
                        {score>0 && <div style={{fontSize:12,fontWeight:800,color:sCol,background:sBg,padding:'2px 8px',borderRadius:6}}>⭐ {score}</div>}
                        <div style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999,background:'#FEF2F2',color:'#DC2626'}}>🔴 Nicht vernetzt</div>
                        <div style={{fontSize:11,color:'#0A66C2',fontWeight:600}}>+ Vernetzen →</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        ) : (
          filtV.length===0 ? (
            <div style={{textAlign:'center',padding:56}}>
              <div style={{fontSize:48,marginBottom:12}}>🤝</div>
              <div style={{fontWeight:700,fontSize:16,color:'#475569'}}>{vernetzungen.length===0?'Noch keine Vernetzungen':'Keine Ergebnisse'}</div>
              <div style={{fontSize:13,color:'#94A3B8',marginTop:4}}>{vernetzungen.length===0?'Wähle einen Lead im Tab "Nicht vernetzt" um zu starten':'Andere Filter versuchen'}</div>
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
              {filtV.map(item=>{
                const cfg=STATUS_CONFIG[item.status]||STATUS_CONFIG.draft
                const hasMsg=item.final_msg||item.generated_msg
                return (
                  <div key={item.id} onClick={()=>setOpenItem(item)}
                    style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:'16px',cursor:'pointer',transition:'all 0.15s',boxShadow:'0 1px 3px rgba(15,23,42,0.05)',borderLeft:'4px solid '+cfg.color}}
                    onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(15,23,42,0.1)'}
                    onMouseLeave={e=>e.currentTarget.style.boxShadow='0 1px 3px rgba(15,23,42,0.05)'}>
                    <div style={{display:'flex',gap:12,marginBottom:10}}>
                      <Avatar name={item.li_name} url={item.li_avatar_url} size={44}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:14,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.li_name}</div>
                        {item.li_headline && <div style={{fontSize:11,color:'#64748B',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.li_headline}</div>}
                        {item.li_company  && <div style={{fontSize:11,color:'#0A66C2',fontWeight:600,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.li_company}</div>}
                      </div>
                      <span style={{padding:'2px 8px',borderRadius:999,fontSize:10,fontWeight:700,background:cfg.bg,color:cfg.color,height:'fit-content',whiteSpace:'nowrap'}}>{cfg.icon} {cfg.label}</span>
                    </div>
                    {hasMsg && <div style={{background:'#F8FAFC',borderRadius:8,padding:'8px 10px',fontSize:11,color:'#475569',lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',marginBottom:10}}>"{item.final_msg||item.generated_msg}"</div>}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{fontSize:10,color:'#94A3B8'}}>{new Date(item.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</div>
                      {!hasMsg && <span style={{fontSize:10,color:'#F59E0B',fontWeight:700}}>✏️ Nachricht fehlt</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {openLead && <LeadVernetzungModal lead={openLead} onClose={()=>setOpenLead(null)} onCreated={handleLeadCreated}/>}
      {openItem && <VernetzungModal item={openItem} onClose={()=>setOpenItem(null)} onSave={handleSave} onDelete={handleDelete}/>}
    </div>
  )
}
