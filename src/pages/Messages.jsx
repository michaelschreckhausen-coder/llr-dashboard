import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const TYPE_LABELS = { outreach:'Erstkontakt', followup:'Follow-up', reply:'Antwort', other:'Sonstiges' }
const TYPE_COLORS = { outreach:'#0A66C2', followup:'#10B981', reply:'#8B5CF6', other:'#64748B' }
const TYPE_BG    = { outreach:'#EFF6FF', followup:'#F0FDF4', reply:'#F5F3FF', other:'#F8FAFC' }

function Stars({ rating, onChange, readonly }) {
  const [hov, setHov] = useState(0)
  return (
    <div style={{ display:'flex', gap:2 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n}
          onClick={() => !readonly && onChange && onChange(n === rating ? 0 : n)}
          onMouseEnter={() => !readonly && setHov(n)}
          onMouseLeave={() => !readonly && setHov(0)}
          style={{ fontSize:18, cursor:readonly?'default':'pointer', color:(hov||rating)>=n?'#F59E0B':'#E2E8F0', lineHeight:1, transition:'color 0.1s' }}>
          {(hov||rating)>=n ? '★' : '☆'}
        </span>
      ))}
    </div>
  )
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  function doCopy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(()=>setCopied(false), 2000) })
  }
  return (
    <button onClick={doCopy} title="Text kopieren"
      style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:7, border:'1px solid '+(copied?'#A7F3D0':'#E2E8F0'), background:copied?'#F0FDF4':'#fff', color:copied?'#065F46':'#475569', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.2s' }}>
      {copied
        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
      {copied ? 'Kopiert!' : 'Kopieren'}
    </button>
  )
}

export default function Messages({ session }) {
  const [msgs,      setMsgs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [flash,     setFlash]     = useState(null)
  const [search,    setSearch]    = useState('')
  const [filterRat, setFilterRat] = useState(0)
  const [filterTyp, setFilterTyp] = useState('')
  const [expanded,  setExpanded]  = useState({})
  const [form, setForm] = useState({
    recipient_name:'', recipient_title:'', recipient_company:'',
    recipient_linkedin_url:'', message_text:'', message_type:'outreach',
    rating:0, sent_at: new Date().toISOString().substring(0,16), notes:''
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('linkedin_messages')
      .select('*').eq('user_id', session.user.id)
      .order('sent_at', { ascending: false }).limit(200)
    setMsgs(data || [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  function showFlash(msg, type='success') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3000)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.message_text.trim()) { showFlash('Nachrichtentext fehlt.','error'); return }
    if (!form.recipient_name.trim()) { showFlash('Empfaenger fehlt.','error'); return }
    setSaving(true)
    const { error } = await supabase.from('linkedin_messages').insert({
      user_id: session.user.id,
      recipient_name: form.recipient_name.trim(),
      recipient_title: form.recipient_title.trim()||null,
      recipient_company: form.recipient_company.trim()||null,
      recipient_linkedin_url: form.recipient_linkedin_url.trim()||null,
      message_text: form.message_text.trim(),
      message_type: form.message_type,
      rating: form.rating||0,
      sent_at: form.sent_at||new Date().toISOString(),
      notes: form.notes.trim()||null,
    })
    setSaving(false)
    if (error) { showFlash('Fehler: '+error.message,'error'); return }
    showFlash('Nachricht gespeichert!')
    setShowForm(false)
    setForm({ recipient_name:'',recipient_title:'',recipient_company:'',recipient_linkedin_url:'',message_text:'',message_type:'outreach',rating:0,sent_at:new Date().toISOString().substring(0,16),notes:'' })
    load()
  }

  async function handleRate(id, rating) {
    setMsgs(ms => ms.map(m => m.id===id ? {...m, rating} : m))
    await supabase.from('linkedin_messages').update({ rating }).eq('id', id)
  }

  async function handleDelete(id) {
    if (!confirm('Nachricht loeschen?')) return
    await supabase.from('linkedin_messages').delete().eq('id', id)
    setMsgs(ms => ms.filter(m => m.id !== id))
    showFlash('Geloescht.')
  }

  const filtered = msgs.filter(m => {
    if (filterRat && m.rating !== filterRat) return false
    if (filterTyp && m.message_type !== filterTyp) return false
    if (search) {
      const q = search.toLowerCase()
      return m.recipient_name?.toLowerCase().includes(q) ||
             m.recipient_company?.toLowerCase().includes(q) ||
             m.message_text?.toLowerCase().includes(q)
    }
    return true
  })

  const avgRating = msgs.length ? (msgs.reduce((s,m)=>s+(m.rating||0),0)/msgs.filter(m=>m.rating>0).length||0).toFixed(1) : '0'
  const topRated  = msgs.filter(m => m.rating >= 4).length
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' }

  return (
    <div style={{ maxWidth:900 }}>

      <div style={{ marginBottom:22, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:'-0.02em', color:'#0F172A' }}>Nachrichten-Archiv</h1>
          <p style={{ color:'#64748B', fontSize:13, margin:'4px 0 0' }}>Gesendete LinkedIn-Nachrichten speichern, bewerten und wiederverwenden.</p>
        </div>
        <button onClick={() => setShowForm(f=>!f)}
          style={{ padding:'9px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0A66C2,#1D4ED8)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(10,102,194,0.25)', whiteSpace:'nowrap' }}>
          {showForm ? 'x Abbrechen' : '+ Nachricht speichern'}
        </button>
      </div>

      {flash && (
        <div style={{ marginBottom:14, padding:'10px 16px', borderRadius:10, fontSize:13, fontWeight:600,
          background:flash.type==='error'?'#FEF2F2':'#F0FDF4', color:flash.type==='error'?'#991B1B':'#065F46',
          border:'1px solid '+(flash.type==='error'?'#FCA5A5':'#A7F3D0') }}>
          {flash.msg}
        </div>
      )}

      {showForm && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', padding:'20px 22px', marginBottom:20, boxShadow:'0 2px 10px rgba(15,23,42,0.07)' }}>
          <div style={{ fontSize:15, fontWeight:800, color:'#0F172A', marginBottom:16 }}>Neue Nachricht speichern</div>
          <form onSubmit={handleSave}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Empfaenger *</label>
                <input value={form.recipient_name} onChange={e=>setForm(f=>({...f,recipient_name:e.target.value}))} style={inp} placeholder="Max Mustermann" required/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Position</label>
                <input value={form.recipient_title} onChange={e=>setForm(f=>({...f,recipient_title:e.target.value}))} style={inp} placeholder="Head of Sales"/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Unternehmen</label>
                <input value={form.recipient_company} onChange={e=>setForm(f=>({...f,recipient_company:e.target.value}))} style={inp} placeholder="Acme GmbH"/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>LinkedIn-Profil URL</label>
                <input value={form.recipient_linkedin_url} onChange={e=>setForm(f=>({...f,recipient_linkedin_url:e.target.value}))} style={inp} placeholder="linkedin.com/in/..."/>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#0A66C2', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Nachrichtentext *</label>
              <textarea value={form.message_text} onChange={e=>setForm(f=>({...f,message_text:e.target.value}))} style={{...inp, minHeight:120, resize:'vertical', fontFamily:'Inter,sans-serif', lineHeight:1.6}} placeholder="Guten Tag Herr Mustermann, ich bin auf Ihr Profil gestossen..." required/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:14 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Typ</label>
                <select value={form.message_type} onChange={e=>setForm(f=>({...f,message_type:e.target.value}))} style={{...inp, cursor:'pointer'}}>
                  {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Gesendet am</label>
                <input type="datetime-local" value={form.sent_at} onChange={e=>setForm(f=>({...f,sent_at:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Bewertung</label>
                <div style={{ paddingTop:8 }}>
                  <Stars rating={form.rating} onChange={r=>setForm(f=>({...f,rating:r}))}/>
                </div>
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Notizen</label>
              <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={inp} placeholder="Reaktion, Feedback, Nachfassen am..."/>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button type="submit" disabled={saving} style={{ padding:'10px 24px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0A66C2,#1D4ED8)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {saving ? 'Speichert...' : 'Speichern'}
              </button>
              <button type="button" onClick={()=>setShowForm(false)} style={{ padding:'10px 18px', borderRadius:10, border:'1px solid #E2E8F0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {!loading && msgs.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:18 }}>
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', padding:'14px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Gesamt</div>
            <div style={{ fontSize:28, fontWeight:800, color:'#0F172A' }}>{msgs.length}</div>
            <div style={{ fontSize:12, color:'#64748B' }}>Nachrichten archiviert</div>
          </div>
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', padding:'14px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Bewertung</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:28, fontWeight:800, color:'#F59E0B' }}>{isNaN(avgRating)?'–':avgRating}</span>
              <span style={{ fontSize:16, color:'#F59E0B' }}>★</span>
            </div>
            <div style={{ fontSize:12, color:'#64748B' }}>Durchschnitt</div>
          </div>
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', padding:'14px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Top-Nachrichten</div>
            <div style={{ fontSize:28, fontWeight:800, color:'#10B981' }}>{topRated}</div>
            <div style={{ fontSize:12, color:'#64748B' }}>mit 4-5 Sternen</div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ flex:1, minWidth:200, position:'relative' }}>
          <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94A3B8' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e=>setSearch(e.target.value)} style={{...inp, paddingLeft:32}} placeholder="Suchen nach Name, Firma, Text..."/>
        </div>
        <select value={filterTyp} onChange={e=>setFilterTyp(e.target.value)} style={{...inp, width:'auto', cursor:'pointer'}}>
          <option value="">Alle Typen</option>
          {Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterRat} onChange={e=>setFilterRat(Number(e.target.value))} style={{...inp, width:'auto', cursor:'pointer'}}>
          <option value={0}>Alle Sterne</option>
          {[5,4,3,2,1].map(n=><option key={n} value={n}>{n} Stern{n!==1?'e':''}</option>)}
        </select>
        {(search||filterTyp||filterRat>0) && (
          <button onClick={()=>{setSearch('');setFilterTyp('');setFilterRat(0);}} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #E2E8F0', background:'#fff', color:'#64748B', fontSize:12, cursor:'pointer' }}>
            Filter loeschen
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'#94A3B8' }}>Lade Nachrichten...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, background:'#fff', borderRadius:16, border:'1px solid #E2E8F0' }}>
          <div style={{ fontSize:40, marginBottom:10 }}>✉</div>
          <div style={{ fontWeight:700, fontSize:15, color:'#0F172A', marginBottom:6 }}>
            {msgs.length === 0 ? 'Noch keine Nachrichten gespeichert' : 'Keine Treffer'}
          </div>
          <div style={{ fontSize:13, color:'#64748B' }}>
            {msgs.length === 0 ? 'Speichere deine ersten LinkedIn-Nachrichten um sie zu bewerten und wiederzuverwenden.' : 'Probiere andere Suchbegriffe oder Filter.'}
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(m => {
            const isExp = expanded[m.id]
            const preview = m.message_text.length > 180 && !isExp ? m.message_text.substring(0,180)+'...' : m.message_text
            return (
              <div key={m.id} style={{ background:'#fff', borderRadius:13, border:'1px solid #E2E8F0', padding:'16px 18px', boxShadow:'0 1px 4px rgba(15,23,42,0.05)', transition:'box-shadow 0.15s' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, marginBottom:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                      <span style={{ fontWeight:800, fontSize:14, color:'#0F172A' }}>{m.recipient_name}</span>
                      {m.recipient_title && <span style={{ fontSize:12, color:'#64748B' }}>{m.recipient_title}</span>}
                      {m.recipient_company && <span style={{ fontSize:12, fontWeight:600, color:'#475569' }}>bei {m.recipient_company}</span>}
                      {m.recipient_linkedin_url && (
                        <a href={m.recipient_linkedin_url.startsWith('http')?m.recipient_linkedin_url:'https://'+m.recipient_linkedin_url} target="_blank" rel="noreferrer"
                          style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11, color:'#0A66C2', textDecoration:'none', padding:'1px 6px', borderRadius:4, background:'#EFF6FF' }}
                          onClick={e=>e.stopPropagation()}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                          Profil
                        </a>
                      )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:TYPE_BG[m.message_type]||'#F8FAFC', color:TYPE_COLORS[m.message_type]||'#64748B', fontWeight:700 }}>
                        {TYPE_LABELS[m.message_type]||m.message_type}
                      </span>
                      <span style={{ fontSize:11, color:'#94A3B8' }}>
                        {new Date(m.sent_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}
                      </span>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                    <Stars rating={m.rating||0} onChange={r=>handleRate(m.id,r)}/>
                    <CopyBtn text={m.message_text}/>
                    <button onClick={()=>handleDelete(m.id)} title="Loeschen"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', padding:'4px', borderRadius:6, fontSize:14, lineHeight:1 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </div>
                </div>
                <div style={{ background:'#F8FAFC', borderRadius:8, padding:'12px 14px', fontSize:13, color:'#334155', lineHeight:1.65, fontFamily:'Inter,sans-serif', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                  {preview}
                </div>
                {m.message_text.length > 180 && (
                  <button onClick={()=>setExpanded(e=>({...e,[m.id]:!isExp}))}
                    style={{ marginTop:6, background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#0A66C2', fontWeight:600, padding:0 }}>
                    {isExp ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                  </button>
                )}
                {m.notes && (
                  <div style={{ marginTop:8, fontSize:12, color:'#64748B', fontStyle:'italic', borderTop:'1px solid #F1F5F9', paddingTop:8 }}>
                    Notiz: {m.notes}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
