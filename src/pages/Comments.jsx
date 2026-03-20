import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Comments({ session }) {
  const [comments, setComments] = useState([])
  const [leads,    setLeads]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: cm }, { data: ld }] = await Promise.all([
      supabase.from('saved_comments').select('*, leads(name)').eq('user_id', session.user.id)
        .order('created_at', { ascending: false }),
      supabase.from('leads').select('id, name').eq('user_id', session.user.id)
    ])
    setComments(cm || [])
    setLeads(ld || [])
    setLoading(false)
  }

  async function toggleUsed(id, used) {
    await supabase.from('saved_comments').update({ used: !used }).eq('id', id)
    setComments(c => c.map(x => x.id === id ? {...x, used: !used} : x))
  }

  async function deleteComment(id) {
    if (!confirm('Kommentar löschen?')) return
    await supabase.from('saved_comments').delete().eq('id', id)
    setComments(c => c.filter(x => x.id !== id))
  }

  async function assignLead(id, lead_id) {
    await supabase.from('saved_comments').update({ lead_id: lead_id || null }).eq('id', id)
    setComments(c => c.map(x => x.id === id ? {...x, lead_id} : x))
  }

  const filtered = comments.filter(c => {
    if (filter === 'used'   && !c.used) return false
    if (filter === 'unused' &&  c.used) return false
    if (search && !c.comment_text.toLowerCase().includes(search.toLowerCase()) &&
        !(c.post_author||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:22,fontWeight:700,marginBottom:4}}>Gespeicherte Kommentare</h1>
        <div style={{color:'#888',fontSize:14}}>{comments.length} Kommentare · {comments.filter(c=>c.used).length} verwendet</div>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Kommentar durchsuchen..." style={{flex:1,minWidth:200}}/>
        <div style={{display:'flex',gap:6}}>
          {[['all','Alle'],['unused','Ungenutzt'],['used','Verwendet']].map(([v,l])=>(
            <button key={v} className={`btn btn-sm ${filter===v?'btn-primary':'btn-secondary'}`}
              onClick={()=>setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <div style={{color:'#aaa',padding:20}}>⏳ Lade Kommentare...</div> :
       filtered.length === 0 ? (
        <div className="card" style={{padding:40,textAlign:'center',color:'#aaa'}}>
          {comments.length === 0
            ? '💬 Noch keine gespeicherten Kommentare.\nGeneriere Kommentare über die Chrome Extension!'
            : 'Keine Treffer.'}
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {filtered.map(c => (
            <div key={c.id} className="card" style={{padding:'16px 20px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:10}}>
                <div style={{flex:1}}>
                  {c.post_author && (
                    <div style={{fontSize:12,color:'#888',marginBottom:6}}>
                      📝 Kommentar für <strong>{c.post_author}</strong>
                    </div>
                  )}
                  <div style={{fontSize:14,color:'#1a1a1a',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{c.comment_text}</div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button onClick={()=>navigator.clipboard.writeText(c.comment_text)}
                    className="btn btn-sm btn-secondary" title="Kopieren">📋</button>
                  <button onClick={()=>deleteComment(c.id)}
                    className="btn btn-sm btn-danger" title="Löschen">🗑</button>
                </div>
              </div>

              {c.post_text && (
                <div style={{fontSize:11,color:'#888',background:'#f8f8f8',borderRadius:6,padding:'8px 10px',marginBottom:10,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                  Post: {c.post_text}
                </div>
              )}

              <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                <button onClick={()=>toggleUsed(c.id, c.used)}
                  className={`btn btn-sm ${c.used?'btn-secondary':'btn-primary'}`}>
                  {c.used ? '✓ Verwendet' : '○ Als verwendet markieren'}
                </button>

                <select value={c.lead_id||''} onChange={e=>assignLead(c.id, e.target.value)}
                  style={{fontSize:12,padding:'4px 8px',borderRadius:8,color:'#555'}}>
                  <option value="">– Lead zuweisen –</option>
                  {leads.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                </select>

                {c.leads?.name && <span style={{fontSize:12,color:'#0a66c2'}}>👤 {c.leads.name}</span>}

                <span style={{fontSize:11,color:'#aaa',marginLeft:'auto'}}>
                  {new Date(c.created_at).toLocaleDateString('de-DE', {day:'numeric',month:'short',year:'numeric'})}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
