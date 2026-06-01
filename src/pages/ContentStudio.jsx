// src/pages/ContentStudio.jsx
// Text-Werkstatt — Chat-Interface im ChatGPT/Neuroflash-Style.
//
// Layout:
//   ┌──────────────┬────────────────────────────────────┐
//   │ Chat-Liste   │ Chat-Verlauf (scrollbar)           │
//   │              │                                    │
//   │ + Neuer Chat │   User: ...                        │
//   │              │   Assistant: <Markdown>            │
//   │ Chat 1       │     <beitragstext>...</...>        │
//   │ Chat 2       │     [📋 Zu Beitrag hinzufügen]     │
//   │ Chat 3       │                                    │
//   │              ├────────────────────────────────────┤
//   │              │ [📎] [📚 1] [🎯 ZG] [🌐 Web]       │
//   │              │ [Eingabe-Textarea]      [⏎ Senden] │
//   └──────────────┴────────────────────────────────────┘
//
// URL-Params:
//   ?post_id=X     — von Redaktionsplan kommend (neuer Chat oder existing chat)
//   ?chat_id=X     — bestimmten Chat öffnen
//
// Chats sind BV-scoped via RLS.

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'

const P = 'var(--wl-primary, rgb(49,90,231))'

// ─── Helper: Markdown-light Renderer für Chat-Messages ──────────────────────
function renderMessageContent(content) {
  if (!content) return null
  // Beitragstext-Tags speziell rendern als Card
  const parts = []
  const regex = /<beitragstext>([\s\S]*?)<\/beitragstext>/gi
  let lastIdx = 0
  let m
  let key = 0
  while ((m = regex.exec(content)) !== null) {
    if (m.index > lastIdx) {
      parts.push(<TextSpan key={`t${key++}`} text={content.slice(lastIdx, m.index)} />)
    }
    parts.push(<PostExtractCard key={`p${key++}`} text={m[1].trim()} />)
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < content.length) {
    parts.push(<TextSpan key={`t${key++}`} text={content.slice(lastIdx)} />)
  }
  if (parts.length === 0) return <TextSpan text={content} />
  return parts
}

function TextSpan({ text }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)' }}>
      {text}
    </div>
  )
}

function PostExtractCard({ text }) {
  return (
    <div style={{
      margin: '10px 0', padding: '14px 16px',
      background: '#F8FAFC',
      border: '1.5px solid rgba(49,90,231,0.25)',
      borderRadius: 11,
      position: 'relative',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: P, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        📋 Beitragstext
      </div>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)' }}>
        {text}
      </div>
    </div>
  )
}

function SourcesList({ sources }) {
  if (!sources?.length) return null
  return (
    <div style={{ marginTop: 8, padding: '8px 12px', background: '#F1F5F9', borderRadius: 8, fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>🌐 Quellen</div>
      {sources.map((s, i) => (
        <div key={i} style={{ marginBottom: 2 }}>
          <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: P, textDecoration: 'none' }}>
            {s.title || s.url}
          </a>
        </div>
      ))}
    </div>
  )
}

// ─── Hauptkomponente ────────────────────────────────────────────────────────
export default function ContentStudio({ session }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeTeamId, team, members } = useTeam()
  const { activeBrandVoice } = useBrandVoice()

  // Chat-Listen-State
  const [chats, setChats] = useState([])
  const [chatsLoading, setChatsLoading] = useState(true)
  const [activeChatId, setActiveChatId] = useState(null)

  // Aktiver Chat + Messages
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  // Eingabe-State
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [audiences, setAudiences] = useState([])
  const [selectedAudienceId, setSelectedAudienceId] = useState('')
  const [knowledgeBase, setKnowledgeBase] = useState([])
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState([])
  const [knowOpen, setKnowOpen] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [error, setError] = useState('')

  // Linked Post (wenn Chat aus Beitrag heraus)
  const [linkedPost, setLinkedPost] = useState(null)

  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)

  // ─── Chats der aktiven BV laden ───────────────────────────────────────────
  async function loadChats() {
    if (!activeBrandVoice?.id) { setChats([]); setChatsLoading(false); return }
    setChatsLoading(true)
    const { data } = await supabase.from('content_chats')
      .select('id, title, post_id, created_by, updated_at, created_at')
      .eq('brand_voice_id', activeBrandVoice.id)
      .order('updated_at', { ascending: false })
      .limit(100)
    setChats(data || [])
    setChatsLoading(false)
  }
  useEffect(() => { loadChats() }, [activeBrandVoice?.id])

  // ─── Zielgruppen + Wissensbasis laden ─────────────────────────────────────
  useEffect(() => {
    if (!activeBrandVoice?.id) return
    ;(async () => {
      const [audRes, kbRes] = await Promise.all([
        supabase.from('target_audience_brand_voices')
          .select('target_audiences(id, name, is_default)')
          .eq('brand_voice_id', activeBrandVoice.id),
        supabase.from('knowledge_base').select('id, name, category')
          .eq('team_id', activeTeamId)
          .order('updated_at', { ascending: false }),
      ])
      const audList = (audRes.data || []).map(r => r.target_audiences).filter(Boolean)
      setAudiences(audList)
      if (!selectedAudienceId) {
        const def = audList.find(a => a.is_default)
        if (def) setSelectedAudienceId(def.id)
      }
      setKnowledgeBase(kbRes.data || [])
    })()
  }, [activeBrandVoice?.id, activeTeamId])

  // ─── URL-Params: chat_id öffnen / post_id-Flow ────────────────────────────
  useEffect(() => {
    const cId = searchParams.get('chat_id')
    const pId = searchParams.get('post_id')
    if (cId) {
      openChat(cId)
      return
    }
    if (pId) {
      handlePostIdFlow(pId)
    }
  }, [searchParams, activeBrandVoice?.id])

  async function handlePostIdFlow(postId) {
    // Post laden
    const { data: post } = await supabase.from('content_posts')
      .select('id, title, content, brand_voice_id, text_werkstatt_chat_id')
      .eq('id', postId).maybeSingle()
    if (!post) return
    setLinkedPost(post)
    // Wenn Post bereits einen Chat hat: dorthin
    if (post.text_werkstatt_chat_id) {
      openChat(post.text_werkstatt_chat_id)
      return
    }
    // Sonst: neuen leeren Chat-State, aber NICHT senden — User soll erst Eingabe machen.
    // Seed: wenn Post bereits Text hat, packen wir den als Pre-Fill in den Input,
    // damit User sehen kann wovon ausgegangen wird.
    setActiveChatId(null)
    setActiveChat({ pending: true, post_id: postId })
    setMessages([])
    if ((post.content || '').trim()) {
      setInput('Bitte verbessere den Text des angehängten Beitrags.')
    } else {
      setInput('Bitte schreibe einen Text für den angehängten Beitrag.')
    }
  }

  // ─── Chat öffnen + Messages laden ─────────────────────────────────────────
  async function openChat(chatId) {
    setActiveChatId(chatId)
    setMessages([]); setMessagesLoading(true)
    const { data: c } = await supabase.from('content_chats').select('*').eq('id', chatId).maybeSingle()
    setActiveChat(c)
    if (c?.target_audience_id) setSelectedAudienceId(c.target_audience_id)
    if (c?.post_id) {
      const { data: p } = await supabase.from('content_posts').select('id, title').eq('id', c.post_id).maybeSingle()
      setLinkedPost(p || null)
    } else {
      setLinkedPost(null)
    }
    const { data: msgs } = await supabase.from('content_chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true })
    setMessages(msgs || [])
    setMessagesLoading(false)
    // Scroll-to-bottom (nach Render)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // ─── Neuer Chat: alles reset ──────────────────────────────────────────────
  function newChat() {
    setActiveChatId(null); setActiveChat(null); setMessages([])
    setInput(''); setAttachments([]); setSelectedKnowledgeIds([])
    setLinkedPost(null); setError('')
    // URL-Params clear (post_id raus wenn man manuell neuen Chat will)
    const next = new URLSearchParams(searchParams)
    next.delete('chat_id'); next.delete('post_id')
    setSearchParams(next, { replace: true })
  }

  // ─── Nachricht senden ─────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || sending) return
    if (!activeBrandVoice?.id) { setError('Keine aktive Brand Voice'); return }
    setSending(true); setError('')
    const userMsgText = input.trim()

    // Chat im Frontend anlegen wenn neu — damit er sofort in der Sidebar erscheint
    // (vorher erst nach EF-Response). EF nimmt dann existing chat_id.
    let chatIdForSend = activeChatId
    if (!chatIdForSend) {
      const title = userMsgText.length <= 60 ? userMsgText : userMsgText.slice(0, 57).replace(/\s+\S*$/, '') + '…'
      const { data: newChat, error: chatErr } = await supabase.from('content_chats').insert({
        brand_voice_id: activeBrandVoice.id,
        team_id: activeTeamId,
        created_by: session.user.id,
        target_audience_id: selectedAudienceId || null,
        post_id: linkedPost?.id || activeChat?.post_id || null,
        title: title || 'Neuer Chat',
      }).select().single()
      if (chatErr) {
        setError('Chat-Erstellung fehlgeschlagen: ' + chatErr.message)
        setSending(false)
        return
      }
      chatIdForSend = newChat.id
      setActiveChatId(newChat.id)
      setActiveChat(newChat)
      // Sidebar sofort updaten — neuer Chat oben
      setChats(prev => [newChat, ...prev])
      // Backlink Post → Chat wenn Chat aus Post heraus
      if (newChat.post_id) {
        await supabase.from('content_posts').update({ text_werkstatt_chat_id: newChat.id })
          .eq('id', newChat.post_id).is('text_werkstatt_chat_id', null)
      }
      // URL aktualisieren
      const next = new URLSearchParams(searchParams)
      next.set('chat_id', newChat.id)
      next.delete('post_id')
      setSearchParams(next, { replace: true })
    }

    // Optimistisches User-Render
    const tempUser = { id: 'temp-' + Date.now(), role: 'user', content: userMsgText, metadata: {}, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, tempUser])
    setInput('')
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('text-werkstatt-chat', {
        body: {
          chat_id: chatIdForSend,
          brand_voice_id: activeBrandVoice.id,
          post_id: linkedPost?.id || activeChat?.post_id || undefined,
          target_audience_id: selectedAudienceId || undefined,
          user_message: userMsgText,
          knowledge_resource_ids: selectedKnowledgeIds,
          use_web_search: useWebSearch,
          attachments,
        },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)

      // Reload Messages aus DB für saubere IDs (Temp-User wird ersetzt)
      const { data: msgs } = await supabase.from('content_chat_messages')
        .select('*').eq('chat_id', data.chat_id).order('created_at', { ascending: true })
      setMessages(msgs || [])
      // Chats-Liste refreshen für Titel-Update (Edge Function generiert Auto-Title)
      loadChats()
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (e) {
      setError('Fehler: ' + (e?.message || String(e)))
      // Optimistic Message bleibt sichtbar damit User sie nicht verliert
    } finally {
      setSending(false)
    }
  }

  // ─── Beitragstext zu Post hinzufügen ──────────────────────────────────────
  async function attachToPost(beitragstext, postId) {
    const targetId = postId || linkedPost?.id || activeChat?.post_id
    if (!targetId) {
      // Kein verknüpfter Post: Picker öffnen wäre die nächste Iteration.
      // Für jetzt: erstelle einen neuen Post direkt mit dem Text.
      if (!activeBrandVoice?.id) { alert('Keine aktive Brand Voice'); return }
      if (!activeTeamId) { alert('Kein Team aktiv'); return }
      const title = beitragstext.split('\n')[0].slice(0, 80) || 'Neuer Beitrag'
      const { data: post, error } = await supabase.from('content_posts').insert({
        user_id: session.user.id, team_id: activeTeamId,
        brand_voice_id: activeBrandVoice.id, title, content: beitragstext,
        platform: 'linkedin', status: 'draft',
        text_werkstatt_chat_id: activeChatId,
      }).select().single()
      if (error) { alert('Erstellen fehlgeschlagen: ' + error.message); return }
      // Chat ↔ Post verknüpfen
      await supabase.from('content_chats').update({ post_id: post.id }).eq('id', activeChatId)
      navigate('/redaktionsplan?open=' + post.id)
      return
    }
    // Existing post: Text updaten + Chat-Link sicherstellen
    await supabase.from('content_posts').update({
      content: beitragstext, text_werkstatt_chat_id: activeChatId,
    }).eq('id', targetId)
    // Chat ↔ Post verknüpfen
    if (!activeChat?.post_id) {
      await supabase.from('content_chats').update({ post_id: targetId }).eq('id', activeChatId)
    }
    navigate('/redaktionsplan?open=' + targetId)
  }

  // ─── Attachment-Handling (vereinfacht: Dateien als base64 in Memory) ──────
  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    const out = []
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { alert(f.name + ': max 10 MB'); continue }
      const buf = await f.arrayBuffer()
      let bin = ''
      const arr = new Uint8Array(buf)
      for (let i = 0; i < arr.byteLength; i++) bin += String.fromCharCode(arr[i])
      const base64 = btoa(bin)
      out.push({ name: f.name, type: f.type, size: f.size, base64 })
    }
    setAttachments(prev => [...prev, ...out])
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'calc(100vh - 64px)', background:'var(--page-bg, #FAFBFC)' }}>
      {/* === Sidebar === */}
      <aside style={{ width:260, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'14px 14px 10px' }}>
          <button onClick={newChat}
            style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid var(--border)', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            ✏️ Neuer Chat
          </button>
        </div>
        <div style={{ padding:'4px 12px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
          Chats von {activeBrandVoice?.name || '—'}
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'4px 8px 12px' }}>
          {chatsLoading && <div style={{ padding:'12px 6px', fontSize:12, color:'var(--text-muted)' }}>Lade…</div>}
          {!chatsLoading && chats.length === 0 && <div style={{ padding:'14px 6px', fontSize:12, color:'var(--text-muted)', lineHeight:1.5 }}>Noch keine Chats für diese Brand Voice. Starte unten mit einer Nachricht.</div>}
          {chats.map(c => (
            <button key={c.id} onClick={() => openChat(c.id)}
              style={{
                width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8,
                border:'none', cursor:'pointer', marginBottom:2,
                background: c.id === activeChatId ? 'rgba(49,90,231,0.08)' : 'transparent',
                color: c.id === activeChatId ? P : 'var(--text-primary)',
                fontSize:12.5, lineHeight:1.4, fontFamily:'inherit',
                display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}
              onMouseEnter={e => { if (c.id !== activeChatId) e.currentTarget.style.background = '#F8FAFC' }}
              onMouseLeave={e => { if (c.id !== activeChatId) e.currentTarget.style.background = 'transparent' }}
              title={c.title}>
              {c.post_id && <span style={{ fontSize:11, marginRight:4 }}>📌</span>}
              {c.title}
            </button>
          ))}
        </div>
      </aside>

      {/* === Main === */}
      <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Linked-Post-Banner */}
        {linkedPost && (
          <div style={{ padding:'10px 18px', borderBottom:'1px solid var(--border)', background:'rgba(49,90,231,0.05)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', flexShrink:0 }}>
            <span style={{ fontSize:14 }}>📌</span>
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ fontSize:10, fontWeight:700, color: P, textTransform:'uppercase', letterSpacing:'0.05em' }}>Kontext aus dem Redaktionsplan</div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{linkedPost.title || '(ohne Titel)'}</div>
            </div>
            <button onClick={() => navigate('/redaktionsplan?open=' + linkedPost.id)}
              style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              ← Zurück zum Beitrag
            </button>
          </div>
        )}

        {/* Chat-Verlauf */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px 24px 12px' }}>
          <div style={{ maxWidth:780, margin:'0 auto', display:'flex', flexDirection:'column', gap:18 }}>
            {!activeChatId && messages.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-muted)' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>✍️</div>
                <div style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)', marginBottom:8 }}>Text-Werkstatt</div>
                <div style={{ fontSize:13, lineHeight:1.6, maxWidth:480, margin:'0 auto' }}>
                  Beschreibe unten was du veröffentlichen möchtest — ich schreibe es in der Brand Voice von <strong>{activeBrandVoice?.name || '—'}</strong>.
                  Du kannst Dateien anhängen, Wissensressourcen auswählen, eine Zielgruppe wählen und optional Web-Recherche aktivieren.
                </div>
              </div>
            )}
            {messagesLoading && <div style={{ textAlign:'center', padding:30, fontSize:12, color:'var(--text-muted)' }}>Lade Verlauf…</div>}
            {messages.map(m => (
              <MessageBubble key={m.id} msg={m} onAttachToPost={attachToPost} linkedPostId={linkedPost?.id} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding:'8px 24px', background:'rgba(220,38,38,.08)', borderTop:'1px solid rgba(220,38,38,.2)', color:'#b91c1c', fontSize:12, flexShrink:0 }}>
            {error}
          </div>
        )}

        {/* Eingabe-Bereich */}
        <div style={{ borderTop:'1px solid var(--border)', background:'var(--surface)', padding:'12px 24px 16px', flexShrink:0 }}>
          <div style={{ maxWidth:780, margin:'0 auto' }}>
            {/* Attachment-Strip */}
            {attachments.length > 0 && (
              <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                {attachments.map((a, i) => (
                  <div key={i} style={{ padding:'4px 8px', borderRadius:6, background:'#F1F5F9', fontSize:11, display:'flex', alignItems:'center', gap:6 }}>
                    📎 {a.name.length > 24 ? a.name.slice(0,22) + '…' : a.name}
                    <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                      style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:'#999' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {/* Toolbar */}
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap' }}>
              {/* Datei */}
              <input ref={fileInputRef} type="file" multiple style={{ display:'none' }}
                onChange={e => { handleFiles(e.target.files); e.target.value = '' }}/>
              <button onClick={() => fileInputRef.current?.click()}
                style={ToolBtn(false)} title="Datei anhängen">📎 Datei</button>

              {/* Wissensbasis */}
              <div style={{ position:'relative' }}>
                <button onClick={() => setKnowOpen(o => !o)}
                  style={ToolBtn(selectedKnowledgeIds.length > 0)}
                  title="Wissensressourcen einbinden">
                  📚 Wissen {selectedKnowledgeIds.length > 0 ? `(${selectedKnowledgeIds.length})` : ''}
                </button>
                {knowOpen && (
                  <>
                    <div onClick={() => setKnowOpen(false)} style={{ position:'fixed', inset:0, zIndex:90 }}/>
                    <div style={{ position:'absolute', bottom:'calc(100% + 4px)', left:0, zIndex:91, background:'#fff', border:'1px solid var(--border)', borderRadius:9, boxShadow:'0 10px 30px rgba(0,0,0,.12)', maxHeight:280, overflowY:'auto', padding:6, minWidth:240 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', padding:'6px 8px' }}>Wissensressourcen wählen</div>
                      {knowledgeBase.length === 0 && <div style={{ padding:'8px', fontSize:12, color:'var(--text-muted)' }}>Keine Ressourcen vorhanden.</div>}
                      {knowledgeBase.map(k => {
                        const checked = selectedKnowledgeIds.includes(k.id)
                        return (
                          <label key={k.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', cursor:'pointer', borderRadius:6, fontSize:12, color:'var(--text-primary)' }}>
                            <input type="checkbox" checked={checked}
                              onChange={() => setSelectedKnowledgeIds(prev => checked ? prev.filter(x => x !== k.id) : [...prev, k.id])}/>
                            <span>{k.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Zielgruppe */}
              <select value={selectedAudienceId} onChange={e => setSelectedAudienceId(e.target.value)}
                style={{ ...ToolBtn(!!selectedAudienceId), padding:'7px 10px' }}>
                <option value="">🎯 Zielgruppe (optional)</option>
                {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>

              {/* Web-Suche */}
              <button onClick={() => setUseWebSearch(v => !v)}
                style={ToolBtn(useWebSearch)} title="Web-Suche aktivieren">
                🌐 Web-Suche {useWebSearch ? 'ein' : 'aus'}
              </button>
            </div>

            {/* Textarea + Senden */}
            <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendMessage() } }}
                placeholder="Was möchtest du schreiben? (Cmd/Ctrl+Enter zum Senden)"
                rows={3}
                style={{ flex:1, padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--border)', fontSize:14, fontFamily:'inherit', resize:'vertical', outline:'none' }}/>
              <button onClick={sendMessage} disabled={!input.trim() || sending || !activeBrandVoice?.id}
                style={{ padding:'10px 18px', borderRadius:10, border:'none',
                  background: (!input.trim() || sending || !activeBrandVoice?.id) ? '#CBD5E1' : P,
                  color:'#fff', fontSize:13, fontWeight:700,
                  cursor: (!input.trim() || sending) ? 'not-allowed' : 'pointer' }}>
                {sending ? '⏳' : '↑ Senden'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function ToolBtn(active) {
  return {
    padding:'7px 12px', borderRadius:8,
    border: '1.5px solid ' + (active ? P : 'var(--border)'),
    background: active ? 'rgba(49,90,231,0.06)' : '#fff',
    color: active ? P : 'var(--text-primary)',
    fontSize:12, fontWeight:600, cursor:'pointer',
    display:'inline-flex', alignItems:'center', gap:4,
    fontFamily:'inherit',
  }
}

// ─── MessageBubble ─────────────────────────────────────────────────────────
function MessageBubble({ msg, onAttachToPost, linkedPostId }) {
  const isUser = msg.role === 'user'
  const meta = msg.metadata || {}
  const beitragstext = meta.beitragstext
  const sources = meta.sources || []

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap:6 }}>
      <div style={{
        maxWidth: '92%', padding: '12px 14px', borderRadius: 12,
        background: isUser ? P : '#fff',
        color: isUser ? '#fff' : 'var(--text-primary)',
        border: isUser ? 'none' : '1px solid var(--border)',
        fontSize: 14, lineHeight: 1.6, wordBreak:'break-word',
      }}>
        {isUser ? (
          <div style={{ whiteSpace:'pre-wrap' }}>{msg.content}</div>
        ) : (
          renderMessageContent(msg.content)
        )}
        {!isUser && sources?.length > 0 && <SourcesList sources={sources} />}
      </div>
      {!isUser && beitragstext && (
        <button onClick={() => onAttachToPost(beitragstext, linkedPostId)}
          style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid ' + P, background:'rgba(49,90,231,0.06)', color: P, fontSize:12, fontWeight:700, cursor:'pointer' }}>
          {linkedPostId ? '📋 In Beitrag übernehmen' : '➕ Als neuen Beitrag anlegen'}
        </button>
      )}
    </div>
  )
}
