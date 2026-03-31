import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const TYPES = { outreach:'Erstkontakt', followup:'Follow-up', reply:'Antwort', other:'Sonstiges' }
const TYPE_C = { outreach:'rgb(49,90,231)', followup:'#10B981', reply:'#8B5CF6', other:'#6B7280' }
const TYPE_BG = { outreach:'#EEF2FF', followup:'#ECFDF5', reply:'#F5F3FF', other:'#F9FAFB' }

function Stars({ rating, onChange }) {
  const [hov, setHov] = useState(0)
  return (
    <div style={{ display:'flex', gap:2 }} onMouseLeave={() => setHov(0)}>
      {[1,2,3,4,5].map(n => (
        <span key={n} onClick={() => onChange && onChange(n === rating ? 0 : n)}
          onMouseEnter={() => setHov(n)}
          style={{ fontSize:16, cursor:onChange?'pointer':'default', color:(hov||rating)>=n?'#F59E0B':'#E5E7EB', transition:'color 0.1s', lineHeight:1 }}>
          {(hov||rating)>=n ? '★' : '☆'}
        </span>
      ))}
    </div>
  )
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={e=>{e.stopPropagation();navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)})}}
      style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:8, border:'1px solid '+(copied?'#A7F3D0':'#E5E7EB'), background:copied?'#F0FDF4':'white', color:copied?'#065F46':'#6B7280', fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.2s', whiteSpace:'nowrap' }}>
      {copied ? '✓ Kopiert' : '📋 Kopieren'}
    </button>
  )
}

export default function Messages({ session }) {
  const [msgs,     setMsgs]    = useState([])
  const [loading,  setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]  = useState(false)
  const [flash,    setFlash]   = useState(null)
  const [search,   setSearch]  = useState('')
  const [filterTyp, setFilterTyp] = useState('')
  const [filterRat, setFilterRat] = useState(0)
  const [form, setForm] = useState({ recipient_name:'', recipient_title:'', recipient_company:'', recipient_linkedin_url:'', message_text:'', message_type:'outreach', rating:0, sent_at:new Date().toISOString().substring(0,16), notes:'' })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('linkedin_messages').select('*').eq('user_id', session.user.id).order('sent_at', { ascending: false }).limit(200)
    setMsgs(data || [])
    if (data && data.length > 0 && !selected) setSelected(data[0])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  function showFlash(msg, type='success') { setFlash({msg,type}); setTimeout(()=>setFlash(null),3000) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.message_text.trim() || !form.recipient_name.trim()) { showFlash('Felder ausfullen.','error'); return }
    setSaving(true)
    const { error } = await supabase.from('linkedin_messages').insert({
      user_id: session.user.id, recipient_name: form.recipient_name.trim(),
      recipient_title: form.recipient_title.trim()||null, recipient_company: form.recipient_company.trim()||null,
      recipient_linkedin_url: form.recipient_linkedin_url.trim()||null, message_text: form.message_text.trim(),
      message_type: form.message_type, rating: form.rating||0,
      sent_at: form.sent_at||new Date().toISOString(), notes: form.notes.trim()||null,
    })
    setSaving(false)
    if (error) { showFlash('Fehler: '+error.message,'error'); return }
    showFlash('Nachricht gespeichert!')
    setShowForm(false)
    setForm({ recipient_name:'',recipient_title:'',recipient_company:'',recipient_linkedin_url:'',message_text:'',message_type:'outreach',rating:0,sent_at:new Date().toISOString().substring(0,16),notes:'' })
    load()
  }

  async function handleRate(id, rating) {
    setMsgs(ms => ms.map(m => m.id===id?{...m,rating}:m))
    if (selected?.id===id) setSelected(s=>({...s,rating}))
    await supabase.from('linkedin_messages').update({rating}).eq('id',id)
  }

  async function handleDelete(id) {
    if (!confirm('Loeschen?')) return
    await supabase.from('linkedin_messages').delete().eq('id',id)
    setMsgs(ms => ms.filter(m => m.id!==id))
    if (selected?.id===id) setSelected(null)
    showFlash('Geloescht.')
  }

  const filtered = msgs.filter(m => {
    if (filterRat && m.rating !== filterRat) return false
    if (filterTyp && m.message_type !== filterTyp) return false
    if (search) { const q=search.toLowerCase(); return (m.recipient_name||'').toLowerCase().includes(q)||(m.recipient_company||'').toLowerCase().includes(q)||(m.message_text||'').toLowerCase().includes(q) }
    return true
  })

  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  const avgRat = msgs.filter(m=>m.rating>0).length ? (msgs.filter(m=>m.rating>0).reduce((s,m)=>s+m.rating,0)/msgs.filter(m=>m.rating>0).length).toFixed(1) : '-'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:800, margin:0, letterSpacing:'-0.03em', color:'rgb(20,20,43)' }}>Nachrichten-Archiv</h1>
          <p style={{ color:'#6B7280', fontSize:13, margin:'4px 0 0' }}>Gesendete LinkedIn-Nachrichten bewerten und wiederverwenden.</p>
        </div>
        <button onClick={() => setShowForm(f=>!f)} style={{ padding:'10px 20px', borderRadius:12, border:'none', background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(49,90,231,0.3)', whiteSpace:'nowrap' }}>
          {showForm ? 'Abbrechen' : '+ Nachricht speichern'}
        </button>
      </div>

      {flash && <div style={{ marginBottom:14, padding:'10px 16px', borderRadius:10, fontSize:13, fontWeight:600, background:flash.type==='error'?'#FEF2F2':'#F0FDF4', color:flash.type==='error'?'#991B1B':'#065F46', border:'1px solid '+(flash.type==='error'?'#FCA5A5':'#A7F3D0'), marginTop:-4 }}>{flash.msg}</div>}

      {/* KPI Row */}
      {!loading && msgs.length > 0 && !showForm && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
          {[['Gesamt', msgs.length, 'Nachrichten archiviert', 'rgb(49,90,231)'],['Bewertung', avgRat+' ★', 'Durchschnitt','#F59E0B'],['Top-Nachrichten', msgs.filter(m=>m.rating>=4).length, 'mit 4-5 Sternen','#10B981']].map(([l,v,s,c])=>(
            <div key={l} style={{ background:'white', borderRadius:14, border:'1px solid #E5E7EB', padding:'14px 18px', borderTop:'3px solid '+c }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{l}</div>
              <div style={{ fontSize:26, fontWeight:900, color:c, lineHeight:1 }}>{v}</div>
              <div style={{ fontSize:11, color:'#9CA3AF', marginTop:3 }}>{s}</div>
            </div>
          ))}
        </div>
      )}

      {/* New Message Form */}
      {showForm && (
        <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', padding:'22px 24px', marginBottom:18, boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:16, fontWeight:800, color:'rgb(20,20,43)', marginBottom:18 }}>Neue Nachricht speichern</div>
          <form onSubmit={handleSave}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Empfaenger *</label><input value={form.recipient_name} onChange={e=>setForm(f=>({...f,recipient_name:e.target.value}))} style={inp} placeholder="Max Mustermann" required/></div>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Position</label><input value={form.recipient_title} onChange={e=>setForm(f=>({...f,recipient_title:e.target.value}))} style={inp} placeholder="Head of Sales"/></div>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Unternehmen</label><input value={form.recipient_company} onChange={e=>setForm(f=>({...f,recipient_company:e.target.value}))} style={inp} placeholder="Acme GmbH"/></div>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>LinkedIn URL</label><input value={form.recipient_linkedin_url} onChange={e=>setForm(f=>({...f,recipient_linkedin_url:e.target.value}))} style={inp} placeholder="linkedin.com/in/..."/></div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgb(49,90,231)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Nachrichtentext *</label>
              <textarea value={form.message_text} onChange={e=>setForm(f=>({...f,message_text:e.target.value}))} style={{...inp,minHeight:100,resize:'vertical',lineHeight:1.6}} placeholder="Guten Tag..." required/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:16 }}>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Typ</label><select value={form.message_type} onChange={e=>setForm(f=>({...f,message_type:e.target.value}))} style={{...inp,cursor:'pointer'}}>{Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Gesendet am</label><input type="datetime-local" value={form.sent_at} onChange={e=>setForm(f=>({...f,sent_at:e.target.value}))} style={inp}/></div>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Bewertung</label><div style={{ paddingTop:8 }}><Stars rating={form.rating} onChange={r=>setForm(f=>({...f,rating:r}))}/></div></div>
            </div>
            <div style={{ marginBottom:16 }}><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Notizen</label><input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={inp} placeholder="Reaktion, Feedback..."/></div>
            <div style={{ display:'flex', gap:10 }}>
              <button type="submit" disabled={saving} style={{ padding:'10px 24px', borderRadius:12, border:'none', background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Speichert...':'Speichern'}</button>
              <button type="button" onClick={()=>setShowForm(false)} style={{ padding:'10px 18px', borderRadius:12, border:'1px solid #E5E7EB', background:'white', color:'#6B7280', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      {/* Search + Filter */}
      {!showForm && (
        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ flex:1, minWidth:180, position:'relative' }}>
            <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', fontSize:14 }}>&#128269;</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,paddingLeft:34}} placeholder="Suchen..."/>
          </div>
          <select value={filterTyp} onChange={e=>setFilterTyp(e.target.value)} style={{...inp,width:'auto',cursor:'pointer'}}><option value="">Alle Typen</option>{Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
          <select value={filterRat} onChange={e=>setFilterRat(Number(e.target.value))} style={{...inp,width:'auto',cursor:'pointer'}}><option value={0}>Alle Sterne</option>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} Stern{n!==1?'e':''}</option>)}</select>
        </div>
      )}

      {/* Split View: List + Detail */}
      {!showForm && (
        loading ? <div style={{ textAlign:'center', padding:48, color:'#9CA3AF' }}>Lade...</div> :
        filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, background:'white', borderRadius:18, border:'1px solid #E5E7EB' }}>
            <div style={{ fontSize:40, marginBottom:10 }}>&#9993;</div>
            <div style={{ fontWeight:800, fontSize:16, color:'rgb(20,20,43)', marginBottom:6 }}>{msgs.length===0?'Noch keine Nachrichten':'Keine Treffer'}</div>
            <div style={{ fontSize:13, color:'#6B7280' }}>{msgs.length===0?'Speichere deine erste LinkedIn-Nachricht.':'Andere Suchbegriffe versuchen.'}</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:14, flex:1, minHeight:0, height:500 }}>
            {/* List */}
            <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', overflow:'hidden', display:'flex', flexDirection:'column' }}>
              <div style={{ padding:'12px 14px', borderBottom:'1px solid #F3F4F6', fontSize:12, color:'#9CA3AF', fontWeight:600 }}>{filtered.length} Nachricht{filtered.length!==1?'en':''}</div>
              <div style={{ overflowY:'auto', flex:1 }}>
                {filtered.map(m => (
                  <div key={m.id} onClick={()=>setSelected(m)}
                    style={{ padding:'12px 14px', borderBottom:'1px solid #F9FAFB', cursor:'pointer', background:selected?.id===m.id?'#F5F7FF':'transparent', borderLeft:selected?.id===m.id?'3px solid rgb(49,90,231)':'3px solid transparent', transition:'all 0.15s' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:160 }}>{m.recipient_name}</div>
                      <div style={{ fontSize:10, color:'#9CA3AF', flexShrink:0 }}>{new Date(m.sent_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}</div>
                    </div>
                    {m.recipient_company && <div style={{ fontSize:11, color:'#6B7280', marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.recipient_company}</div>}
                    <div style={{ fontSize:11, color:'#9CA3AF', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:5 }}>{m.message_text.substring(0,60)}...</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:10, padding:'2px 7px', borderRadius:5, background:TYPE_BG[m.message_type]||'#F9FAFB', color:TYPE_C[m.message_type]||'#6B7280', fontWeight:600 }}>{TYPES[m.message_type]}</span>
                      <Stars rating={m.rating||0} onChange={r=>handleRate(m.id,r)}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detail */}
            <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', overflow:'hidden', display:'flex', flexDirection:'column' }}>
              {selected ? (
                <>
                  {/* Detail Header */}
                  <div style={{ padding:'18px 22px', borderBottom:'1px solid #F3F4F6', background:'linear-gradient(135deg, rgb(49,90,231) 0%, rgb(119,161,243) 100%)', color:'white' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:18, fontWeight:800 }}>{selected.recipient_name}</div>
                        <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:2 }}>
                          {[selected.recipient_title, selected.recipient_company].filter(Boolean).join(' bei ')}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <CopyBtn text={selected.message_text}/>
                        {selected.recipient_linkedin_url && (
                          <a href={selected.recipient_linkedin_url.startsWith('http')?selected.recipient_linkedin_url:'https://'+selected.recipient_linkedin_url} target="_blank" rel="noreferrer"
                            style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:8, background:'rgba(255,255,255,0.2)', color:'white', textDecoration:'none', fontSize:11, fontWeight:600 }}>
                            in Profil
                          </a>
                        )}
                        <button onClick={()=>handleDelete(selected.id)} style={{ background:'rgba(255,255,255,0.15)', border:'none', cursor:'pointer', color:'white', padding:'5px 8px', borderRadius:8, fontSize:11 }}>del</button>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:12 }}>
                      <span style={{ fontSize:10, padding:'3px 8px', borderRadius:5, background:'rgba(255,255,255,0.2)', fontWeight:600 }}>{TYPES[selected.message_type]}</span>
                      <span style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>{new Date(selected.sent_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})}</span>
                      <Stars rating={selected.rating||0} onChange={r=>handleRate(selected.id,r)}/>
                    </div>
                  </div>
                  {/* Message Body */}
                  <div style={{ flex:1, overflowY:'auto', padding:'22px', display:'flex', flexDirection:'column', gap:14 }}>
                    <div style={{ background:'#F8F9FF', borderRadius:14, padding:'18px 20px', fontSize:14, color:'rgb(20,20,43)', lineHeight:1.75, whiteSpace:'pre-wrap', wordBreak:'break-word', border:'1px solid rgba(49,90,231,0.08)' }}>
                      {selected.message_text}
                    </div>
                    {selected.notes && (
                      <div style={{ background:'#FFFBEB', borderRadius:12, padding:'12px 16px', border:'1px solid #FDE68A' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#B45309', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Notiz</div>
                        <div style={{ fontSize:13, color:'#92400E' }}>{selected.notes}</div>
                      </div>
                    )}
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <div style={{ background:'white', borderRadius:10, padding:'10px 14px', border:'1px solid #E5E7EB', fontSize:12 }}>
                        <div style={{ color:'#9CA3AF', marginBottom:2 }}>Typ</div>
                        <div style={{ fontWeight:700, color:TYPE_C[selected.message_type] }}>{TYPES[selected.message_type]}</div>
                      </div>
                      <div style={{ background:'white', borderRadius:10, padding:'10px 14px', border:'1px solid #E5E7EB', fontSize:12 }}>
                        <div style={{ color:'#9CA3AF', marginBottom:2 }}>Bewertung</div>
                        <div style={{ fontWeight:700, color:'#F59E0B' }}>{selected.rating>0?selected.rating+' von 5 Sternen':'Nicht bewertet'}</div>
                      </div>
                      <div style={{ background:'white', borderRadius:10, padding:'10px 14px', border:'1px solid #E5E7EB', fontSize:12 }}>
                        <div style={{ color:'#9CA3AF', marginBottom:2 }}>Zeichen</div>
                        <div style={{ fontWeight:700, color:'rgb(20,20,43)' }}>{selected.message_text.length}</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'#9CA3AF' }}>
                  <div style={{ fontSize:40 }}>&#9993;</div>
                  <div style={{ fontSize:14, fontWeight:600 }}>Nachricht auswaehlen</div>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  )
}
