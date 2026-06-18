import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Trash2 } from 'lucide-react'
import { useTeam } from '../context/TeamContext'
import { listDocuments, createDocument, deleteDocument } from '../lib/contentDocuments'

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function Documents() {
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!activeTeamId) { setLoading(false); return }
    setLoading(true)
    const { data } = await listDocuments(activeTeamId)
    setDocs(data || []); setLoading(false)
  }, [activeTeamId])

  useEffect(() => { load() }, [load])

  function openDoc(d) {
    const params = new URLSearchParams()
    if (d.source_chat_id) params.set('chat_id', d.source_chat_id)
    params.set('doc', d.id)
    navigate('/content-studio?' + params.toString())
  }

  async function handleNew() {
    if (!activeTeamId || creating) return
    setCreating(true)
    const { data, error } = await createDocument({ teamId: activeTeamId })
    setCreating(false)
    if (error) { console.warn('[Documents] createDocument:', error); alert('Dokument konnte nicht angelegt werden: ' + (error.message || error)); return }
    if (data) navigate(`/content-studio?doc=${data.id}`)
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!confirm('Dokument löschen?')) return
    await deleteDocument(id); load()
  }

  return (
    <div style={{ width:'100%', maxWidth:1200, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Header — gleiches Muster wie Medien/Visuals */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:16, marginBottom:22, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Dokumente</div>
          <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Dokumente.</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
            Bearbeitbare Texte aus der Text-Werkstatt — öffnen sich zusammen mit dem zugehörigen Chat.
          </p>
        </div>
        <button onClick={handleNew} disabled={creating}
          style={{ padding:'9px 16px', borderRadius:9, border:'none', background: creating ? '#94A3B8' : P, color:'#fff', fontSize:13, fontWeight:700, cursor: creating ? 'wait' : 'pointer', whiteSpace:'nowrap', boxShadow: creating ? 'none' : '0 2px 10px rgba(49,90,231,.18)' }}>
          {creating ? 'Lege an…' : 'Neues Dokument'}
        </button>
      </div>

      {loading ? (
        <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)' }}>Lädt…</div>
      ) : docs.length === 0 ? (
        <div style={{ padding:'60px 20px', textAlign:'center', background:'var(--surface)', borderRadius:14, border:'1px dashed var(--border)', color:'var(--text-muted)' }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:14, color:'var(--text-soft,#98a2b3)' }}><FileText size={42} strokeWidth={1.5}/></div>
          <h2 style={{ fontSize:18, fontWeight:700, color:'rgb(20,20,43)', margin:'0 0 6px' }}>Noch keine Dokumente</h2>
          <p style={{ fontSize:13, margin:0, lineHeight:1.5 }}>Erstelle eins oder öffne einen Text aus der Text-Werkstatt im Editor.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {docs.map(d => (
            <div key={d.id} onClick={() => openDoc(d)}
              style={{ background:'var(--surface,#fff)', border:'1px solid var(--border,#E9ECF2)', borderRadius:12, padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:14 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(49,90,231,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border,#E9ECF2)' }}>
              <span style={{ width:38, height:38, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(49,90,231,0.07)', color:P }}>
                <FileText size={18} strokeWidth={1.9}/>
              </span>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary,#0f172a)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {d.title || 'Unbenanntes Dokument'}
                </div>
                <div style={{ fontSize:12.5, color:'var(--text-muted,#64748b)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {(d.content_text || '').slice(0,140) || 'Leer'}
                </div>
              </div>
              <span style={{ fontSize:12, color:'var(--text-soft,#94a3b8)', flexShrink:0, whiteSpace:'nowrap' }}>
                {d.updated_at ? new Date(d.updated_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'}) : ''}
              </span>
              <button onClick={e => handleDelete(e, d.id)} title="Löschen"
                style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-soft,#94a3b8)', padding:6, display:'inline-flex', flexShrink:0, borderRadius:7 }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-soft,#94a3b8)'; e.currentTarget.style.background = 'transparent' }}>
                <Trash2 size={16} strokeWidth={1.75}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
