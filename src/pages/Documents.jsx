import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeam } from '../context/TeamContext'
import { listDocuments, createDocument, deleteDocument } from '../lib/contentDocuments'

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

  async function handleNew() {
    if (!activeTeamId || creating) return
    setCreating(true)
    const { data, error } = await createDocument({ teamId: activeTeamId })
    setCreating(false)
    if (!error && data) navigate(`/dokumente/${data.id}`)
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!confirm('Dokument löschen?')) return
    await deleteDocument(id); load()
  }

  return (
    <div style={{ maxWidth: 920, margin:'0 auto', padding:'24px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'var(--text-primary,#0f172a)', margin:0 }}>Dokumente</h1>
          <div style={{ fontSize:13, color:'var(--text-muted,#64748b)', marginTop:4 }}>Bearbeitbare Texte aus der Text-Werkstatt.</div>
        </div>
        <button onClick={handleNew} disabled={creating}
          style={{ padding:'9px 18px', borderRadius:10, border:'none', background:'var(--primary,#315AE7)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          {creating ? 'Lege an…' : '+ Neues Dokument'}
        </button>
      </div>

      {loading ? (
        <div style={{ color:'var(--text-muted,#64748b)', fontSize:14 }}>Lädt…</div>
      ) : docs.length === 0 ? (
        <div style={{ background:'var(--surface,#fff)', border:'1px solid var(--border,#e5e7eb)', borderRadius:12, padding:'32px', textAlign:'center', color:'var(--text-muted,#64748b)', fontSize:14 }}>
          Noch keine Dokumente. Erstelle eins oder öffne einen Text aus der Text-Werkstatt im Editor.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {docs.map(d => (
            <div key={d.id} onClick={() => navigate(`/dokumente/${d.id}`)}
              style={{ background:'var(--surface,#fff)', border:'1px solid var(--border,#e5e7eb)', borderRadius:12, padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary,#0f172a)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {d.title || 'Unbenanntes Dokument'}
                </div>
                <div style={{ fontSize:12.5, color:'var(--text-muted,#64748b)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {(d.content_text || '').slice(0,120) || 'Leer'}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
                <span style={{ fontSize:12, color:'var(--text-soft,#94a3b8)' }}>
                  {d.updated_at ? new Date(d.updated_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'}) : ''}
                </span>
                <button onClick={e => handleDelete(e, d.id)} title="Löschen"
                  style={{ border:'none', background:'transparent', cursor:'pointer', color:'#ef4444', fontSize:14, padding:4 }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
