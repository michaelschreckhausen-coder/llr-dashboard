import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Trash2, CalendarPlus, Image as ImageIcon, X, MessageSquare, Plus } from 'lucide-react'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { supabase } from '../lib/supabase'
import { listDocuments, createDocument, deleteDocument, listChatsForDocument, addDocumentToChat } from '../lib/contentDocuments'

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function Documents({ embedded = false }) {
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [chatCounts, setChatCounts] = useState({}) // docId -> Anzahl zugeordneter Chats
  // Chat-Auswahldialog beim Öffnen eines Dokuments
  const [chooseDoc, setChooseDoc] = useState(null)
  const [docChats, setDocChats] = useState([])
  const [chatsLoading, setChatsLoading] = useState(false)
  const [showOther, setShowOther] = useState(false)
  const [brandChats, setBrandChats] = useState([])
  const [chatSearch, setChatSearch] = useState('')
  // Neues-Dokument-Dialog (Chat-Auswahl beim Anlegen)
  const [newDocOpen, setNewDocOpen] = useState(false)
  const [newDocPick, setNewDocPick] = useState(false)
  // Beitrag-Auswahl beim „In Beitrag": neuer oder bestehender Beitrag
  const [postPickDoc, setPostPickDoc] = useState(null)
  const [existingPosts, setExistingPosts] = useState([])
  const [postsLoading, setPostsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!activeTeamId || !activeBrandVoice?.id) { setDocs([]); setLoading(false); return }
    setLoading(true)
    const { data } = await listDocuments(activeTeamId, activeBrandVoice.id)
    setDocs(data || []); setLoading(false)
    const ids = (data || []).map(d => d.id)
    if (ids.length) {
      const { data: links } = await supabase.from('content_document_chats').select('document_id').in('document_id', ids)
      const counts = {}; (links || []).forEach(l => { counts[l.document_id] = (counts[l.document_id] || 0) + 1 })
      setChatCounts(counts)
    } else setChatCounts({})
  }, [activeTeamId, activeBrandVoice?.id])

  useEffect(() => { load() }, [load])

  async function openDoc(d) {
    setChooseDoc(d); setShowOther(false); setChatSearch(''); setBrandChats([]); setChatsLoading(true)
    const { data } = await listChatsForDocument(d.id)
    setDocChats(data || []); setChatsLoading(false)
  }
  async function openWith(chatId) {
    if (!chooseDoc) return
    await addDocumentToChat(chooseDoc.id, chatId)  // zuordnen + Aktualität bumpen
    navigate(`/content-studio?chat_id=${chatId}&doc=${chooseDoc.id}`)
  }
  function openWithoutChat() {
    if (!chooseDoc) return
    navigate(`/content-studio?doc=${chooseDoc.id}`)
  }
  async function loadBrandChats() {
    setShowOther(true)
    const { data } = await supabase.from('content_chats')
      .select('id, title, updated_at').eq('brand_voice_id', activeBrandVoice?.id)
      .order('updated_at', { ascending: false }).limit(100)
    setBrandChats(data || [])
  }

  function handleNew() {
    if (!activeTeamId) return
    setNewDocOpen(true); setNewDocPick(false); setChatSearch(''); setBrandChats([])
  }
  async function createInNewChat() {
    if (creating) return
    setCreating(true)
    const { data, error } = await createDocument({ teamId: activeTeamId, brandVoiceId: activeBrandVoice?.id })
    setCreating(false); setNewDocOpen(false)
    if (error || !data) { alert('Dokument konnte nicht angelegt werden: ' + (error?.message || error)); return }
    navigate(`/content-studio?doc=${data.id}`)  // Clean-View; Chat entsteht + bindet bei 1. Nachricht
  }
  async function createInExistingChat(chatId) {
    if (creating) return
    setCreating(true)
    const { data, error } = await createDocument({ teamId: activeTeamId, brandVoiceId: activeBrandVoice?.id, sourceChatId: chatId })
    setCreating(false); setNewDocOpen(false)
    if (error || !data) { alert('Dokument konnte nicht angelegt werden: ' + (error?.message || error)); return }
    navigate(`/content-studio?chat_id=${chatId}&doc=${data.id}`)
  }
  async function loadBrandChatsForNew() {
    setNewDocPick(true)
    const { data } = await supabase.from('content_chats')
      .select('id, title, updated_at').eq('brand_voice_id', activeBrandVoice?.id)
      .order('updated_at', { ascending: false }).limit(100)
    setBrandChats(data || [])
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!confirm('Dokument löschen?')) return
    await deleteDocument(id); load()
  }

  // Dokument in einen Beitrag übernehmen — erst fragen: neu oder bestehend
  async function addToRedaktionsplan(e, d) {
    e.stopPropagation()
    if (busyId) return
    setPostPickDoc(d); setExistingPosts([]); setPostsLoading(true)
    const { data } = await supabase.from('content_posts')
      .select('id, title, status, updated_at')
      .eq('brand_voice_id', activeBrandVoice?.id)
      .order('updated_at', { ascending: false }).limit(50)
    setExistingPosts(data || []); setPostsLoading(false)
  }
  // „+ Als neuen Beitrag anlegen"
  async function createPostFromDoc(d) {
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
    setBusyId(null); setPostPickDoc(null)
    if (error) { console.warn('[Documents] createPostFromDoc:', error); alert('Konnte nicht angelegt werden: ' + (error.message || error)); return }
    navigate('/redaktionsplan?open=' + post.id)
  }
  // „Zu bestehendem Beitrag" — Dokumenttext in den gewählten Beitrag übernehmen
  async function addDocToExistingPost(d, postId) {
    if (busyId) return
    setBusyId(d.id)
    const { error } = await supabase.from('content_posts').update({ content: d.content_text || '' }).eq('id', postId)
    setBusyId(null); setPostPickDoc(null)
    if (error) { console.warn('[Documents] addDocToExistingPost:', error); alert('Konnte nicht übernommen werden: ' + (error.message || error)); return }
    navigate('/redaktionsplan?open=' + postId)
  }

  // Dokument als Referenz für die Bilderstellung in der Content-Werkstatt nutzen
  function useAsVisualReference(e, d) {
    e.stopPropagation()
    navigate('/content-studio?refdoc=' + d.id)
  }

  return (
    <div style={embedded ? { width:'100%' } : { width:'100%', maxWidth:1200, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Header — gleiches Muster wie Medien/Visuals */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent: embedded ? 'flex-end' : 'space-between', gap:16, marginBottom: embedded ? 12 : 22, flexWrap:'wrap' }}>
        {!embedded && (
        <div>
          <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Dokumente</div>
          <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Dokumente.</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
            Bearbeitbare Texte aus der Content-Werkstatt{activeBrandVoice?.name ? ` von ${activeBrandVoice.name}` : ''} — öffnen sich zusammen mit dem zugehörigen Chat.
          </p>
        </div>
        )}
        {!embedded && (
        <button onClick={handleNew} disabled={creating}
          style={{ padding:'9px 16px', borderRadius:9, border:'none', background: creating ? '#94A3B8' : P, color:'#fff', fontSize:13, fontWeight:700, cursor: creating ? 'wait' : 'pointer', whiteSpace:'nowrap', boxShadow: creating ? 'none' : '0 2px 10px rgba(49,90,231,.18)' }}>
          {creating ? 'Lege an…' : 'Neues Dokument'}
        </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)' }}>Lädt…</div>
      ) : docs.length === 0 ? (
        <div style={{ padding:'60px 20px', textAlign:'center', background:'var(--surface)', borderRadius:14, border:'1px dashed var(--border)', color:'var(--text-muted)' }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:14, color:'var(--text-soft,#98a2b3)' }}><FileText size={42} strokeWidth={1.5}/></div>
          <h2 style={{ fontSize:18, fontWeight:700, color:'rgb(20,20,43)', margin:'0 0 6px' }}>Noch keine Dokumente</h2>
          <p style={{ fontSize:13, margin:0, lineHeight:1.5 }}>Erstelle eins oder öffne einen Text aus der Content-Werkstatt im Editor.</p>
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
                {chatCounts[d.id] > 0 && (
                  <span title="Diesem Dokument zugeordnete Chats" style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:6, fontSize:11, fontWeight:600, color:P, background:'rgba(49,90,231,0.07)', borderRadius:6, padding:'2px 8px' }}>
                    <MessageSquare size={11} strokeWidth={2}/> In {chatCounts[d.id]} {chatCounts[d.id] === 1 ? 'Chat' : 'Chats'}
                  </span>
                )}
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

      {/* Chat-Auswahldialog: mit welchem Chat soll das Dokument geöffnet werden? */}
      {chooseDoc && (
        <div onClick={() => setChooseDoc(null)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(2px)', zIndex:400, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'12vh' }}>
          <div onClick={e => e.stopPropagation()} style={{ width:460, maxWidth:'92vw', maxHeight:'72vh', display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(16,24,40,0.28)', overflow:'hidden', textAlign:'left' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, padding:'16px 16px 6px' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:800, color:'var(--text-primary)' }}>Mit welchem Chat öffnen?</div>
                <div style={{ fontSize:12.5, color:'var(--text-muted)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{chooseDoc.title || 'Unbenanntes Dokument'}</div>
              </div>
              <button onClick={() => setChooseDoc(null)} style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', padding:4, display:'inline-flex', flexShrink:0 }}><X size={18}/></button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px 14px 14px' }}>
              {chatsLoading ? (
                <div style={{ padding:14, fontSize:12.5, color:'var(--text-muted)', textAlign:'center' }}>Lädt…</div>
              ) : (
                <>
                  {docChats.length > 0 && !showOther && (
                    <>
                      <button onClick={() => openWith(docChats[0].id)}
                        style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'11px 12px', borderRadius:10, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
                        <MessageSquare size={15} strokeWidth={2}/><span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Zuletzt bearbeitender Chat · {docChats[0].title || 'Chat'}</span>
                      </button>
                      <div style={{ fontSize:10.5, fontWeight:700, color:'var(--text-soft,#98a2b3)', textTransform:'uppercase', letterSpacing:'0.06em', padding:'2px 2px 6px' }}>Zugeordnete Chats</div>
                      {docChats.map(c => (
                        <button key={c.id} onClick={() => openWith(c.id)}
                          style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit' }}
                          onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <span style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(49,90,231,0.07)', color:P }}><MessageSquare size={15} strokeWidth={1.9}/></span>
                          <span style={{ minWidth:0, flex:1, fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.title || 'Unbenannter Chat'}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {docChats.length === 0 && !showOther && (
                    <div style={{ padding:'4px 4px 12px', fontSize:12.5, color:'var(--text-muted)', lineHeight:1.5 }}>Dieses Dokument ist noch keinem Chat zugeordnet.</div>
                  )}

                  {showOther && (
                    <>
                      <input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Chats durchsuchen…" autoFocus
                        style={{ width:'100%', boxSizing:'border-box', border:'1px solid var(--border)', borderRadius:9, padding:'8px 11px', fontSize:13, outline:'none', fontFamily:'inherit', color:'var(--text-primary)', marginBottom:8 }}/>
                      {brandChats.filter(c => { const q=chatSearch.trim().toLowerCase(); return !q || (c.title||'').toLowerCase().includes(q) }).map(c => (
                        <button key={c.id} onClick={() => openWith(c.id)}
                          style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit' }}
                          onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <span style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(49,90,231,0.07)', color:P }}><MessageSquare size={15} strokeWidth={1.9}/></span>
                          <span style={{ minWidth:0, flex:1, fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.title || 'Unbenannter Chat'}</span>
                        </button>
                      ))}
                      {brandChats.length === 0 && <div style={{ padding:12, fontSize:12.5, color:'var(--text-muted)', textAlign:'center' }}>Keine Chats für diese Brand.</div>}
                    </>
                  )}

                  <div style={{ borderTop:'1px solid var(--border)', marginTop:10, paddingTop:10, display:'flex', flexDirection:'column', gap:4 }}>
                    {!showOther && (
                      <button onClick={loadBrandChats}
                        style={{ width:'100%', textAlign:'left', padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:600, color:P, fontFamily:'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(49,90,231,0.07)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        + Anderen Chat wählen…
                      </button>
                    )}
                    {showOther && (
                      <button onClick={() => setShowOther(false)}
                        style={{ width:'100%', textAlign:'left', padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--text-muted)', fontFamily:'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        ← Zurück
                      </button>
                    )}
                    <button onClick={openWithoutChat}
                      style={{ width:'100%', textAlign:'left', padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--text-muted)', fontFamily:'inherit' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      Ohne Chat öffnen
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Beitrag-Auswahl: neuen Beitrag anlegen ODER zu bestehendem hinzufügen */}
      {postPickDoc && (
        <div onClick={() => setPostPickDoc(null)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(2px)', zIndex:400, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'12vh' }}>
          <div onClick={e => e.stopPropagation()} style={{ width:460, maxWidth:'92vw', maxHeight:'72vh', display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(16,24,40,0.28)', overflow:'hidden', textAlign:'left' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, padding:'16px 16px 6px' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:800, color:'var(--text-primary)' }}>In welchen Beitrag übernehmen?</div>
                <div style={{ fontSize:12.5, color:'var(--text-muted)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{postPickDoc.title || 'Unbenanntes Dokument'}</div>
              </div>
              <button onClick={() => setPostPickDoc(null)} style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', padding:4, display:'inline-flex', flexShrink:0 }}><X size={18}/></button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px 14px 14px' }}>
              <button onClick={() => createPostFromDoc(postPickDoc)} disabled={busyId===postPickDoc.id}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'11px 12px', borderRadius:10, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor: busyId===postPickDoc.id ? 'wait' : 'pointer', fontFamily:'inherit', marginBottom:10 }}>
                <Plus size={15} strokeWidth={2.4}/>Als neuen Beitrag anlegen
              </button>
              <div style={{ fontSize:10.5, fontWeight:700, color:'var(--text-soft,#98a2b3)', textTransform:'uppercase', letterSpacing:'0.06em', padding:'2px 2px 6px' }}>Zu bestehendem Beitrag</div>
              {postsLoading ? (
                <div style={{ padding:14, fontSize:12.5, color:'var(--text-muted)', textAlign:'center' }}>Lädt…</div>
              ) : existingPosts.length === 0 ? (
                <div style={{ padding:'4px 4px 8px', fontSize:12.5, color:'var(--text-muted)' }}>Noch keine Beiträge vorhanden.</div>
              ) : existingPosts.map(pp => (
                <button key={pp.id} onClick={() => addDocToExistingPost(postPickDoc, pp.id)} disabled={busyId===postPickDoc.id} title={pp.title || '(ohne Titel)'}
                  style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit' }}
                  onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <span style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(49,90,231,0.07)', color:P }}><CalendarPlus size={15} strokeWidth={1.9}/></span>
                  <span style={{ minWidth:0, flex:1, fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pp.title || '(ohne Titel)'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Neues-Dokument-Dialog: in neuem Chat ODER bestehendem Chat anlegen */}
      {newDocOpen && (
        <div onClick={() => setNewDocOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(2px)', zIndex:400, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'12vh' }}>
          <div onClick={e => e.stopPropagation()} style={{ width:460, maxWidth:'92vw', maxHeight:'72vh', display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(16,24,40,0.28)', overflow:'hidden', textAlign:'left' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, padding:'16px 16px 6px' }}>
              <div style={{ fontSize:15, fontWeight:800, color:'var(--text-primary)' }}>Neues Dokument anlegen</div>
              <button onClick={() => setNewDocOpen(false)} style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', padding:4, display:'inline-flex', flexShrink:0 }}><X size={18}/></button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px 14px 14px' }}>
              {!newDocPick ? (
                <>
                  <button onClick={createInNewChat} disabled={creating}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'11px 12px', borderRadius:10, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor: creating ? 'wait' : 'pointer', fontFamily:'inherit', marginBottom:8 }}>
                    <Plus size={15} strokeWidth={2.4}/>In neuem Chat
                  </button>
                  <button onClick={loadBrandChatsForNew} disabled={creating}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'11px 12px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--text-primary)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}
                    onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <MessageSquare size={15} strokeWidth={1.9}/>Bestehendem Chat zuweisen…
                  </button>
                </>
              ) : (
                <>
                  <input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Chats durchsuchen…" autoFocus
                    style={{ width:'100%', boxSizing:'border-box', border:'1px solid var(--border)', borderRadius:9, padding:'8px 11px', fontSize:13, outline:'none', fontFamily:'inherit', color:'var(--text-primary)', marginBottom:8 }}/>
                  {brandChats.filter(c => { const q=chatSearch.trim().toLowerCase(); return !q || (c.title||'').toLowerCase().includes(q) }).map(c => (
                    <button key={c.id} onClick={() => createInExistingChat(c.id)} disabled={creating}
                      style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <span style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(49,90,231,0.07)', color:P }}><MessageSquare size={15} strokeWidth={1.9}/></span>
                      <span style={{ minWidth:0, flex:1, fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.title || 'Unbenannter Chat'}</span>
                    </button>
                  ))}
                  {brandChats.length === 0 && <div style={{ padding:12, fontSize:12.5, color:'var(--text-muted)', textAlign:'center' }}>Keine Chats für diese Brand.</div>}
                  <div style={{ borderTop:'1px solid var(--border)', marginTop:10, paddingTop:10 }}>
                    <button onClick={() => setNewDocPick(false)}
                      style={{ width:'100%', textAlign:'left', padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--text-muted)', fontFamily:'inherit' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      ← Zurück
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
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
