import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Trash2, CalendarPlus, Image as ImageIcon } from 'lucide-react'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { supabase } from '../lib/supabase'
import { listDocuments, createDocument, deleteDocument } from '../lib/contentDocuments'

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function Documents() {
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    if (!activeTeamId || !activeBrandVoice?.id) { setDocs([]); setLoading(false); return }
    setLoading(true)
    const { data } = await listDocuments(activeTeamId, activeBrandVoice.id)
    setDocs(data || []); setLoading(false)
  }, [activeTeamId, activeBrandVoice?.id])

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
    const { data, error } = await createDocument({ teamId: activeTeamId, brandVoiceId: activeBrandVoice?.id })
    setCreating(false)
    if (error) { console.warn('[Documents] createDocument:', error); alert('Dokument konnte nicht angelegt werden: ' + (error.message || error)); return }
    if (data) navigate(`/content-studio?doc=${data.id}`)
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!confirm('Dokument löschen?')) return
    await deleteDocument(id); load()
  }

  // Dokument als Beitrag in den Redaktionsplan übernehmen
  async function addToRedaktionsplan(e, d) {
    e.stopPropagation()
    if (busyId) return
    setBusyId(d.id)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: post, error } = await supabase.from('content_posts').insert({
      user_id: user?.id ?? null,
      team_id: activeTeamId,
      brand_voice_id: activeBrandVoice?.id || d.brand_voice_id || null,
      title: (d.title || 'Aus Dokument').slice(0, 120),
      content: d.content_text || '',
      platform: 'linkedin',
      status: 'draft',
    }).select().single()
    setBusyId(null)
    if (error) { console.warn('[Documents] addToRedaktionsplan:', error); alert('Konnte nicht angelegt werden: ' + (error.message || error)); return }
    navigate('/redaktionsplan?open=' + post.id)
  }

  // Dokument als Referenz für ein Visual nutzen (Text landet im Beitragstextfeld)
  function useAsVisualReference(e, d) {
    e.stopPropagation()
    navigate('/visuals?doc_id=' + d.id)
  }

  return (
    <div style={{ width:'100%', maxWidth:1200, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Header — gleiches Muster wie Medien/Visuals */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:16, marginBottom:22, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Dokumente</div>
          <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Dokumente.</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
            Bearbeitbare Texte aus der Text-Werkstatt{activeBrandVoice?.name ? ` von ${activeBrandVoice.name}` : ''} — öffnen sich zusammen mit dem zugehörigen Chat.
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
              <div style={{ display:'flex', alignItems:'center', gap:2, flexShrink:0 }}>
                <ActionBtn onClick={e => addToRedaktionsplan(e, d)} title="Als Beitrag in den Redaktionsplan" disabled={busyId===d.id}>
                  <CalendarPlus size={16} strokeWidth={1.75}/>
                </ActionBtn>
                <ActionBtn onClick={e => useAsVisualReference(e, d)} title="Als Referenz für ein Visual nutzen">
                  <ImageIcon size={16} strokeWidth={1.75}/>
                </ActionBtn>
                <ActionBtn onClick={e => handleDelete(e, d.id)} title="Löschen" danger>
                  <Trash2 size={16} strokeWidth={1.75}/>
                </ActionBtn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionBtn({ onClick, title, children, danger, disabled }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      style={{ border:'none', background:'transparent', cursor: disabled ? 'default' : 'pointer', color:'var(--text-soft,#94a3b8)', padding:7, display:'inline-flex', borderRadius:8, opacity: disabled ? 0.5 : 1 }}
      onMouseEnter={e => { if (disabled) return; e.currentTarget.style.color = danger ? '#ef4444' : P; e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.08)' : 'rgba(49,90,231,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-soft,#94a3b8)'; e.currentTarget.style.background = 'transparent' }}>
      {children}
    </button>
  )
}
