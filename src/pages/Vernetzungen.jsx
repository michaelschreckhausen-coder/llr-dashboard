import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const E0 = { name:'', industries:'', job_titles:'', company_sizes:'', locations:'', keywords:'', pain_points:'', buying_signals:'', is_default:false }
function a2s(a){ return Array.isArray(a)?a.join(', '):(a||'') }

function TagInput({ label, value, onChange, placeholder }) {
  const [v,setV] = useState('')
  const tags = value ? value.split(',').map(t=>t.trim()).filter(Boolean) : []
  const add = () => { if(!v.trim()) return; onChange([...tags,v.trim()].join(', ')); setV('') }
  const rm = i => onChange(tags.filter((_,j)=>j!==i).join(', '))
  return (
    <div style={{marginBottom:14}}>
      <label style={{fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:5}}>{label}</label>
      <div style={{display:'flex',flexWrap:'wrap',gap:5,padding:'7px 10px',border:'1.5px solid #E2E8F0',borderRadius:9,minHeight:38,background:'#fff'}}>
        {tags.map((t,i)=>(
          <span key={i} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 8px',background:'#EFF6FF',color:'#0A66C2',borderRadius:999,fontSize:12,fontWeight:600}}>
            {t}<span onClick={()=>rm(i)} style={{cursor:'pointer',fontSize:14,lineHeight:1,marginLeft:2}}>x</span>
          </span>
        ))}
        <input value={v} onChange={e=>setV(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'||e.key===','){ e.preventDefault(); add() }}}
          placeholder={tags.length===0?placeholder:'+ add'}
          style={{border:'none',outline:'none',fontSize:12,minWidth:100,flex:1,background:'transparent'}}/>
      </div>
    </div>
  )
}

export default function ICP({ session }) {
  const [icps,setIcps]       = useState([])
  const [editing,setEditing] = useState(null)
  const [form,setForm]       = useState(E0)
  const [saving,setSaving]   = useState(false)
  const [saved,setSaved]     = useState(false)
  const [matchTest,setMT]    = useState(null)
  const [matchLoading,setML] = useState(false)

  const load = useCallback(async()=>{
    const{data}=await supabase.from('icp_profiles').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false})
    setIcps(data||[])
  },[session.user.id])
  useEffect(()=>{ load() },[load])

  const sf = k => w => setForm(f=>({...f,[k]:w}))

  async function save(){
    if(!form.name?.trim()) return
    setSaving(true)
    const ta = s => s?s.split(',').map(t=>t.trim()).filter(Boolean):[]
    const p={...form,user_id:session.user.id,industries:ta(form.industries),job_titles:ta(form.job_titles),company_sizes:ta(form.company_sizes),locations:ta(form.locations),keywords:ta(form.keywords)}
    if(editing==='new') await supabase.from('icp_profiles').insert(p)
    else await supabase.from('icp_profiles').update(p).eq('id',editing.id)
    await load(); setSaving(false); setSaved(true)
    setTimeout(()=>{ setSaved(false); setEditing(null) },1500)
  }

  async function setDefault(id){
    await supabase.from('icp_profiles').update({is_default:false}).eq('user_id',session.user.id)
    await supabase.from('icp_profiles').update({is_default:true}).eq('id',id)
    load()
  }

  async function testMatch(icpId){
    setML(true); setMT(null)
    const{data:leads}=await supabase.from('leads').select('id,name,headline,location,lead_score').eq('user_id',session.user.id).limit(25)
    const icp=icps.find(i=>i.id===icpId)
    if(!leads||!icp){ setML(false); return }
    const res=leads.map(lead=>{
      let sc=0
      const hl=(lead.headline||'').toLowerCase(),lo=(lead.location||'').toLowerCase()
      if((icp.industries||[]).some(i=>hl.includes(i.toLowerCase()))) sc+=25
      if((icp.job_titles||[]).some(t=>hl.includes(t.toLowerCase())))  sc+=30
      if((icp.locations||[]).some(l=>lo.includes(l.toLowerCase())))   sc+=20
      if((icp.keywords||[]).some(k=>(hl+lo).includes(k.toLowerCase()))) sc+=15
      return{...lead,matchScore:sc}
    }).sort((a,b)=>b.matchScore-a.matchScore)
    setMT({icp,results:res}); setML(false)
  }

  const inp={width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:9,fontSize:13,fontFamily:'inherit',boxSizing:'border-box',outline:'none'}

  if(editing!==null) return(
    <div style={{maxWidth:700}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:22}}>
        <button onClick={()=>setEditing(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#888'}}>&#8592;</button>
        <div><h1 style={{fontSize:19,fontWeight:800,margin:0}}>{editing==='new'?'Neues ICP':'ICP bearbeiten'}</h1>
        <p style={{fontSize:12,color:'#888',margin:0}}>Ideal Customer Profile fuer Lead Scoring</p></div>
      </div>
      <div style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:'22px 24px'}}>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:5}}>Name *</label>
          <input value={form.name} onChange={e=>sf('name')(e.target.value)} placeholder="z.B. DACH B2B Entscheider" style={inp}/>
        </div>
        <TagInput label="Branchen" value={form.industries} onChange={sf('industries')} placeholder="SaaS, Marketing"/>
        <TagInput label="Job-Titel" value={form.job_titles} onChange={sf('job_titles')} placeholder="CEO, CMO, VP"/>
        <TagInput label="Unternehmensgroessen" value={form.company_sizes} onChange={sf('company_sizes')} placeholder="startup, smb, enterprise"/>
        <TagInput label="Standorte" value={form.locations} onChange={sf('locations')} placeholder="Deutschland, DACH, Berlin"/>
        <TagInput label="Keywords" value={form.keywords} onChange={sf('keywords')} placeholder="B2B, LinkedIn, Sales"/>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:5}}>Pain Points</label>
          <textarea value={form.pain_points||''} onChange={e=>sf('pain_points')(e.target.value)} rows={2} placeholder="Herausforderungen der Zielgruppe" style={{...inp,resize:'vertical'}}/>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,fontWeight:600,color:'#475569',marginBottom:20}}>
          <input type="checkbox" checked={form.is_default||false} onChange={e=>sf('is_default')(e.target.checked)}/>
          Als Standard-ICP verwenden
        </label>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',padding:'14px 0',marginTop:8}}>
        <button onClick={()=>setEditing(null)} style={{padding:'8px 18px',borderRadius:18,background:'#F1F5F9',border:'none',fontSize:13,cursor:'pointer'}}>Abbrechen</button>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {saved&&<span style={{color:'#057642',fontSize:13,fontWeight:600}}>Gespeichert!</span>}
          <button onClick={save} disabled={saving||!form.name?.trim()} style={{padding:'9px 24px',borderRadius:18,background:'linear-gradient(135deg,#0A66C2,#8B5CF6)',color:'#fff',border:'none',fontSize:13,fontWeight:700,cursor:'pointer'}}>{saving?'...':'Speichern'}</button>
        </div>
      </div>
    </div>
  )

  return(
    <div style={{maxWidth:820}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:800,margin:0}}>Zielgruppen (ICP)</h1>
          <p style={{color:'#64748B',fontSize:13,margin:'4px 0 0'}}>Ideal Customer Profiles - fuer automatisches Lead Scoring</p>
        </div>
        <button onClick={()=>{ setForm(E0); setEditing('new') }}
          style={{padding:'9px 18px',borderRadius:9,background:'linear-gradient(135deg,#0A66C2,#8B5CF6)',color:'#fff',border:'none',fontSize:13,fontWeight:700,cursor:'pointer'}}>
          + Neues ICP
        </button>
      </div>
      {icps.length===0?(
        <div style={{textAlign:'center',padding:'56px 20px',background:'#fff',borderRadius:14,border:'2px dashed #E2E8F0'}}>
          <div style={{fontSize:44,marginBottom:14}}>&#127919;</div>
          <div style={{fontSize:17,fontWeight:700,marginBottom:7}}>Noch kein ICP definiert</div>
          <p style={{color:'#888',fontSize:13,marginBottom:20}}>Erstelle ein ICP um automatisches Lead Scoring zu aktivieren.</p>
          <button onClick={()=>{ setForm(E0); setEditing('new') }}
            style={{padding:'10px 24px',borderRadius:18,background:'linear-gradient(135deg,#0A66C2,#8B5CF6)',color:'#fff',border:'none',fontSize:13,fontWeight:700,cursor:'pointer'}}>ICP erstellen</button>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {icps.map(icp=>(
            <div key={icp.id} style={{background:'#fff',borderRadius:12,border:icp.is_default?'2px solid #0A66C2':'1.5px solid #E2E8F0',padding:'18px 20px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:8}}>
                    <span style={{fontWeight:800,fontSize:15}}>{icp.name}</span>
                    {icp.is_default&&<span style={{padding:'2px 9px',borderRadius:9,fontSize:10,fontWeight:700,background:'#EFF6FF',color:'#0A66C2'}}>Standard</span>}
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:6}}>
                    {(icp.job_titles||[]).slice(0,4).map(t=><span key={t} style={{padding:'2px 8px',borderRadius:999,fontSize:11,background:'#F0FDF4',color:'#166534'}}>{t}</span>)}
                    {(icp.industries||[]).slice(0,4).map(t=><span key={t} style={{padding:'2px 8px',borderRadius:999,fontSize:11,background:'#EFF6FF',color:'#0A66C2'}}>{t}</span>)}
                    {(icp.locations||[]).slice(0,3).map(t=><span key={t} style={{padding:'2px 8px',borderRadius:999,fontSize:11,background:'#FFFBEB',color:'#92400E'}}>{t}</span>)}
                  </div>
                  {icp.pain_points&&<div style={{fontSize:11,color:'#64748B',fontStyle:'italic'}}>"{icp.pain_points.substring(0,100)}{icp.pain_points.length>100?'...':''}"</div>}
                </div>
                <div style={{display:'flex',gap:6,marginLeft:14,flexShrink:0,flexWrap:'wrap'}}>
                  <button onClick={()=>testMatch(icp.id)} disabled={matchLoading}
                    style={{padding:'6px 11px',borderRadius:7,border:'1px solid #E2E8F0',background:'#F8FAFC',fontSize:11,fontWeight:600,cursor:'pointer',color:'#475569'}}>
                    {matchLoading?'...':'Test Match'}
                  </button>
                  {!icp.is_default&&<button onClick={()=>setDefault(icp.id)} style={{padding:'6px 11px',borderRadius:7,border:'1px solid #E2E8F0',background:'#F8FAFC',fontSize:11,cursor:'pointer',color:'#475569'}}>Aktivieren</button>}
                  <button onClick={()=>{ setForm({...icp,industries:a2s(icp.industries),job_titles:a2s(icp.job_titles),company_sizes:a2s(icp.company_sizes),locations:a2s(icp.locations),keywords:a2s(icp.keywords)}); setEditing(icp) }}
                    style={{padding:'6px 11px',borderRadius:7,border:'1px solid #E2E8F0',background:'#F8FAFC',fontSize:11,cursor:'pointer',color:'#475569'}}>Bearbeiten</button>
                  <button onClick={async()=>{ if(window.confirm('Loeschen?')){ await supabase.from('icp_profiles').delete().eq('id',icp.id); load() }}}
                    style={{padding:'6px 11px',borderRadius:7,border:'1px solid #FCA5A5',background:'#FEF2F2',fontSize:11,cursor:'pointer',color:'#DC2626'}}>x</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {matchTest&&(
        <div style={{marginTop:24,background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:700,fontSize:14}}>Match Test: {matchTest.icp.name}</div>
            <button onClick={()=>setMT(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#94A3B8',fontSize:18}}>x</button>
          </div>
          <div style={{maxHeight:400,overflowY:'auto'}}>
            {matchTest.results.map(lead=>(
              <div key={lead.id} style={{padding:'11px 18px',borderBottom:'1px solid #F8FAFC',display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:34,height:34,borderRadius:'50%',background:lead.matchScore>=50?'#22C55E':lead.matchScore>=25?'#F59E0B':'#E2E8F0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:lead.matchScore>=25?'#fff':'#94A3B8',flexShrink:0}}>{lead.matchScore}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13}}>{lead.name}</div>
                  <div style={{fontSize:11,color:'#94A3B8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.headline}</div>
                </div>
                <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999,
                  background:lead.matchScore>=50?'#F0FDF4':lead.matchScore>=25?'#FFFBEB':'#F8FAFC',
                  color:lead.matchScore>=50?'#166534':lead.matchScore>=25?'#92400E':'#94A3B8'}}>
                  {lead.matchScore>=50?'MATCH':lead.matchScore>=25?'TEILMATCH':'KEIN MATCH'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
