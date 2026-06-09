// src/pages/ContentStudio.jsx
// Text-Werkstatt v2 — Clean Hero + einklappbare Sidebar + Plus-Menü + Loading.
//
// State-Machine:
//   - viewMode = 'clean' wenn keine Messages UND kein Chat geladen → Hero/Banner + zentrales Eingabefeld
//   - viewMode = 'chat'  wenn Chat aktiv (Messages geladen oder gesendet) → klassisches Chat-Layout
//
// Sidebar:
//   - Standard eingeklappt
//   - Toggle-Button oben links bleibt sichtbar
//   - Beim ersten Send im Clean-Modus → Sidebar klappt automatisch auf

import React, { useState, useEffect, useRef } from 'react'
import { Globe } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'

const P = 'var(--wl-primary, rgb(49,90,231))'
const ACCENT = '#30A0D0'

// Minimal inline-Markdown-Parser: **bold**, *italic*. Lässt Listen/Linebreaks
// dem whiteSpace:pre-wrap unten.
function parseInline(text) {
  if (!text) return text
  const parts = []
  const regex = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*)/g
  let last = 0
  let m, key = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2]) parts.push(<strong key={'b' + (key++)}>{m[2]}</strong>)
    else if (m[3]) parts.push(<em key={'i' + (key++)}>{m[3]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : text
}

// ─── Markdown-light Render: Beitragstext als Card extrahieren ───────────────
function renderMessageContent(content) {
  if (!content) return null
  const parts = []
  const regex = /<beitragstext>([\s\S]*?)<\/beitragstext>/gi
  let lastIdx = 0
  let m, key = 0
  while ((m = regex.exec(content)) !== null) {
    if (m.index > lastIdx) parts.push(<TextSpan key={`t${key++}`} text={content.slice(lastIdx, m.index)} />)
    parts.push(<PostExtractCard key={`p${key++}`} text={m[1].trim()} />)
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < content.length) parts.push(<TextSpan key={`t${key++}`} text={content.slice(lastIdx)} />)
  if (parts.length === 0) return <TextSpan text={content} />
  return parts
}

function TextSpan({ text }) {
  return (
    <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:14, lineHeight:1.6, color:'var(--text-primary)' }}>
      {parseInline(text)}
    </div>
  )
}

function PostExtractCard({ text }) {
  return (
    <div style={{
      margin:'10px 0', padding:'14px 16px',
      background:'#F8FAFC', border:'1.5px solid rgba(49,90,231,0.25)', borderRadius:11, position:'relative',
    }}>
      <div style={{ fontSize:11, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>
        📋 Beitragstext
      </div>
      <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:14, lineHeight:1.6, color:'var(--text-primary)' }}>
        {parseInline(text)}
      </div>
    </div>
  )
}

function SourcesList({ sources }) {
  if (!sources?.length) return null
  return (
    <div style={{ marginTop:8, padding:'8px 12px', background:'#F1F5F9', borderRadius:8, fontSize:11 }}>
      <div style={{ fontWeight:700, color:'var(--text-muted)', marginBottom:4 }}>Quellen</div>
      {sources.map((s, i) => (
        <div key={i} style={{ marginBottom:2 }}>
          <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color:P, textDecoration:'none' }}>
            {s.title || s.url}
          </a>
        </div>
      ))}
    </div>
  )
}

// ─── Typing-Indicator ──────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'12px 14px', background:'#fff', border:'1px solid var(--border)', borderRadius:12, width:'fit-content' }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background: P, animation: 'tw-blink 1.4s infinite ease-in-out', animationDelay:'0s' }}/>
      <span style={{ width:7, height:7, borderRadius:'50%', background: P, animation: 'tw-blink 1.4s infinite ease-in-out', animationDelay:'0.2s' }}/>
      <span style={{ width:7, height:7, borderRadius:'50%', background: P, animation: 'tw-blink 1.4s infinite ease-in-out', animationDelay:'0.4s' }}/>
      <style>{`@keyframes tw-blink { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }`}</style>
    </div>
  )
}

// ─── Hauptkomponente ────────────────────────────────────────────────────────
export default function ContentStudio({ session }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()

  // Sidebar State (persistiert)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('tw_sidebar_open') === '1' } catch { return false }
  })
  useEffect(() => { try { localStorage.setItem('tw_sidebar_open', sidebarOpen ? '1' : '0') } catch {} }, [sidebarOpen])

  // Chat-Listen-State
  const [chats, setChats] = useState([])
  const [chatsLoading, setChatsLoading] = useState(true)
  const [activeChatId, setActiveChatId] = useState(null)
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
  const [plusOpen, setPlusOpen] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [error, setError] = useState('')

  // Linked Post
  const [linkedPost, setLinkedPost] = useState(null)

  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)

  // ─── ViewMode: clean wenn kein Chat aktiv und keine Messages ──────────────
  const viewMode = (activeChatId || messages.length > 0) ? 'chat' : 'clean'

  // ─── Chats laden für aktive BV ────────────────────────────────────────────
  async function loadChats() {
    if (!activeBrandVoice?.id) { setChats([]); setChatsLoading(false); return }
    setChatsLoading(true)
    const { data } = await supabase.from('content_chats')
      .select('id, title, post_id, updated_at')
      .eq('brand_voice_id', activeBrandVoice.id)
      .order('updated_at', { ascending: false })
      .limit(100)
    setChats(data || [])
    setChatsLoading(false)
  }
  useEffect(() => { loadChats() }, [activeBrandVoice?.id])

  // ─── Audiences + Knowledge Base laden ─────────────────────────────────────
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

  // ─── URL-Param-Handler ────────────────────────────────────────────────────
  useEffect(() => {
    const cId = searchParams.get('chat_id')
    const pId = searchParams.get('post_id')
    if (cId) { openChat(cId); return }
    if (pId) { handlePostIdFlow(pId); return }
    // Kein Param → leerer Clean-State
    setActiveChatId(null); setActiveChat(null); setMessages([]); setLinkedPost(null)
  }, [searchParams, activeBrandVoice?.id])

  async function handlePostIdFlow(postId) {
    const { data: post } = await supabase.from('content_posts')
      .select('id, title, content, brand_voice_id, text_werkstatt_chat_id')
      .eq('id', postId).maybeSingle()
    if (!post) return
    setLinkedPost(post)
    // Wenn schon ein Chat existiert → öffne ihn (Sidebar geht auf für Chat-View)
    if (post.text_werkstatt_chat_id) {
      setSidebarOpen(true)
      openChat(post.text_werkstatt_chat_id)
      return
    }
    // Sonst: Clean-View mit Standard-Input
    setActiveChatId(null); setActiveChat(null); setMessages([])
    if ((post.content || '').trim()) {
      setInput('Bitte verbessere den Text des angehängten Beitrags.')
    } else {
      setInput('Bitte schreibe einen Text für den angehängten Beitrag.')
    }
  }

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
    const { data: msgs } = await supabase.from('content_chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending:true })
    setMessages(msgs || [])
    setMessagesLoading(false)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
  }

  function newChat() {
    setActiveChatId(null); setActiveChat(null); setMessages([])
    setInput(''); setAttachments([]); setSelectedKnowledgeIds([])
    setLinkedPost(null); setError('')
    const next = new URLSearchParams(searchParams)
    next.delete('chat_id'); next.delete('post_id')
    setSearchParams(next, { replace:true })
  }

  // ─── Senden ───────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || sending) return
    if (!activeBrandVoice?.id) { setError('Keine aktive Brand Voice'); return }
    setSending(true); setError('')
    const userMsgText = input.trim()
    const wasClean = viewMode === 'clean'

    // Wenn Sidebar zu war und wir im Clean-Modus senden → aufklappen
    if (wasClean && !sidebarOpen) setSidebarOpen(true)

    // Chat im Frontend anlegen wenn neu
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
        setSending(false); return
      }
      chatIdForSend = newChat.id
      setActiveChatId(newChat.id)
      setActiveChat(newChat)
      setChats(prev => [newChat, ...prev])
      if (newChat.post_id) {
        await supabase.from('content_posts').update({ text_werkstatt_chat_id: newChat.id })
          .eq('id', newChat.post_id).is('text_werkstatt_chat_id', null)
      }
      const next = new URLSearchParams(searchParams)
      next.set('chat_id', newChat.id); next.delete('post_id')
      setSearchParams(next, { replace:true })
    }

    // User-Bubble optimistisch
    const tempUser = { id:'temp-' + Date.now(), role:'user', content:userMsgText, metadata:{}, created_at:new Date().toISOString() }
    setMessages(prev => [...prev, tempUser])
    setInput('')
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }), 30)

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

      const { data: msgs } = await supabase.from('content_chat_messages')
        .select('*').eq('chat_id', data.chat_id).order('created_at', { ascending:true })
      setMessages(msgs || [])
      loadChats()
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
    } catch (e) {
      setError('Fehler: ' + (e?.message || String(e)))
    } finally {
      setSending(false)
    }
  }

  // ─── Beitragstext → Beitrag attachen ──────────────────────────────────────
  async function attachToPost(beitragstext, postId) {
    const targetId = postId || linkedPost?.id || activeChat?.post_id
    if (!targetId) {
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
      await supabase.from('content_chats').update({ post_id: post.id }).eq('id', activeChatId)
      navigate('/redaktionsplan?open=' + post.id)
      return
    }
    await supabase.from('content_posts').update({
      content: beitragstext, text_werkstatt_chat_id: activeChatId,
    }).eq('id', targetId)
    if (!activeChat?.post_id) {
      await supabase.from('content_chats').update({ post_id: targetId }).eq('id', activeChatId)
    }
    navigate('/redaktionsplan?open=' + targetId)
  }

  // ─── Datei-Handling ───────────────────────────────────────────────────────
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
      out.push({ name:f.name, type:f.type, size:f.size, base64 })
    }
    setAttachments(prev => [...prev, ...out])
    setPlusOpen(false)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'calc(100vh - 64px)', background:'var(--page-bg, #FAFBFC)' }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside style={{ width:260, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'14px 14px 10px', display:'flex', gap:8 }}>
            <button onClick={() => setSidebarOpen(false)} title="Sidebar einklappen"
              style={{ padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', fontSize:14, cursor:'pointer' }}>
              ☰
            </button>
            <button onClick={newChat}
              style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
              ✏️ Neuer Chat
            </button>
          </div>
          <div style={{ padding:'4px 12px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
            Chats von {activeBrandVoice?.name || '—'}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'4px 8px 12px' }}>
            {chatsLoading && <div style={{ padding:'12px 6px', fontSize:12, color:'var(--text-muted)' }}>Lade…</div>}
            {!chatsLoading && chats.length === 0 && <div style={{ padding:'14px 6px', fontSize:12, color:'var(--text-muted)', lineHeight:1.5 }}>Noch keine Chats für diese Brand Voice.</div>}
            {chats.map(c => (
              <button key={c.id} onClick={() => openChat(c.id)}
                style={{
                  width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8, border:'none', cursor:'pointer', marginBottom:2,
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
      )}

      {/* Main */}
      <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>
        {/* Floating Sidebar-Toggle wenn zu */}
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} title="Sidebar öffnen"
            style={{ position:'absolute', top:14, left:14, zIndex:10, padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', fontSize:14, cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
            ☰
          </button>
        )}

        {viewMode === 'clean' ? (
          // === CLEAN VIEW ===
          <CleanView
            linkedPost={linkedPost}
            activeBrandVoice={activeBrandVoice}
            input={input} setInput={setInput}
            sending={sending}
            attachments={attachments} setAttachments={setAttachments}
            plusOpen={plusOpen} setPlusOpen={setPlusOpen}
            knowledgeBase={knowledgeBase}
            selectedKnowledgeIds={selectedKnowledgeIds} setSelectedKnowledgeIds={setSelectedKnowledgeIds}
            audiences={audiences} selectedAudienceId={selectedAudienceId} setSelectedAudienceId={setSelectedAudienceId}
            useWebSearch={useWebSearch} setUseWebSearch={setUseWebSearch}
            handleFiles={handleFiles}
            fileInputRef={fileInputRef}
            sendMessage={sendMessage}
            navigate={navigate}
          />
        ) : (
          // === CHAT VIEW ===
          <ChatView
            linkedPost={linkedPost}
            messages={messages}
            messagesLoading={messagesLoading}
            sending={sending}
            messagesEndRef={messagesEndRef}
            attachToPost={attachToPost}
            input={input} setInput={setInput}
            attachments={attachments} setAttachments={setAttachments}
            plusOpen={plusOpen} setPlusOpen={setPlusOpen}
            knowledgeBase={knowledgeBase}
            selectedKnowledgeIds={selectedKnowledgeIds} setSelectedKnowledgeIds={setSelectedKnowledgeIds}
            audiences={audiences} selectedAudienceId={selectedAudienceId} setSelectedAudienceId={setSelectedAudienceId}
            useWebSearch={useWebSearch} setUseWebSearch={setUseWebSearch}
            handleFiles={handleFiles}
            fileInputRef={fileInputRef}
            sendMessage={sendMessage}
            navigate={navigate}
            error={error}
          />
        )}

        {/* Globaler hidden file input — wird vom Plus-Menü getriggert */}
        <input ref={fileInputRef} type="file" multiple style={{ display:'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}/>
      </main>
    </div>
  )
}

// ─── CLEAN VIEW (Hero oder Post-Banner + zentrales Eingabefeld) ──────────────
function CleanView({
  linkedPost, activeBrandVoice,
  input, setInput, sending,
  attachments, setAttachments,
  plusOpen, setPlusOpen,
  knowledgeBase, selectedKnowledgeIds, setSelectedKnowledgeIds,
  audiences, selectedAudienceId, setSelectedAudienceId,
  useWebSearch, setUseWebSearch,
  handleFiles, fileInputRef, sendMessage, navigate,
}) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 24px', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:680 }}>
        {linkedPost ? (
          // Banner statt Hero wenn aus Post heraus
          <div style={{
            marginBottom:24, padding:'14px 18px',
            background:'rgba(49,90,231,0.06)', border:'1.5px solid rgba(49,90,231,0.20)', borderRadius:12,
            display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
          }}>
            <span style={{ fontSize:18 }}>📌</span>
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ fontSize:10, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.05em' }}>Kontext aus dem Redaktionsplan</div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{linkedPost.title || '(ohne Titel)'}</div>
            </div>
            <button onClick={() => navigate('/redaktionsplan?open=' + linkedPost.id)}
              style={{ padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              ← Zurück zum Beitrag
            </button>
          </div>
        ) : (
          // Hero
          <div style={{ textAlign:'center', marginBottom:32 }}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
              <img src="/Leadesk_Favicon (1).png" alt="Leadesk" width={88} height={88} style={{ display:'block' }}/>
            </div>
            <div style={{ fontSize:18, color: ACCENT, fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Text</div>
            <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2, color:'var(--text-primary)' }}>Text Werkstatt</h1>
            <p style={{ fontSize:13, color:'var(--text-muted)', margin:'10px auto 0', lineHeight:1.6, maxWidth:520 }}>
              Beschreibe was du veröffentlichen willst — ich schreibe es in der Brand Voice von <strong>{activeBrandVoice?.name || '—'}</strong>.
              Du kannst Dateien anhängen, Wissensressourcen einbinden, eine Zielgruppe wählen oder eine Web-Recherche aktivieren.
            </p>
          </div>
        )}

        <ChatInput
          input={input} setInput={setInput} sending={sending}
          attachments={attachments} setAttachments={setAttachments}
          plusOpen={plusOpen} setPlusOpen={setPlusOpen}
          knowledgeBase={knowledgeBase} selectedKnowledgeIds={selectedKnowledgeIds} setSelectedKnowledgeIds={setSelectedKnowledgeIds}
          audiences={audiences} selectedAudienceId={selectedAudienceId} setSelectedAudienceId={setSelectedAudienceId}
          useWebSearch={useWebSearch} setUseWebSearch={setUseWebSearch}
          handleFiles={handleFiles} fileInputRef={fileInputRef}
          sendMessage={sendMessage}
          enabled={!!activeBrandVoice?.id}
        />
      </div>
    </div>
  )
}

// ─── CHAT VIEW (klassisches Layout) ─────────────────────────────────────────
function ChatView({
  linkedPost, messages, messagesLoading, sending, messagesEndRef, attachToPost,
  input, setInput,
  attachments, setAttachments,
  plusOpen, setPlusOpen,
  knowledgeBase, selectedKnowledgeIds, setSelectedKnowledgeIds,
  audiences, selectedAudienceId, setSelectedAudienceId,
  useWebSearch, setUseWebSearch,
  handleFiles, fileInputRef, sendMessage, navigate, error,
}) {
  return (
    <>
      {/* Banner wenn aus Post */}
      {linkedPost && (
        <div style={{ padding:'10px 18px 10px 52px', borderBottom:'1px solid var(--border)', background:'rgba(49,90,231,0.05)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', flexShrink:0 }}>
          <span style={{ fontSize:14 }}>📌</span>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:10, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.05em' }}>Kontext aus dem Redaktionsplan</div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{linkedPost.title || '(ohne Titel)'}</div>
          </div>
          <button onClick={() => navigate('/redaktionsplan?open=' + linkedPost.id)}
            style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            ← Zurück zum Beitrag
          </button>
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto', padding:'24px 24px 12px' }}>
        <div style={{ maxWidth:780, margin:'0 auto', display:'flex', flexDirection:'column', gap:18 }}>
          {messagesLoading && <div style={{ textAlign:'center', padding:30, fontSize:12, color:'var(--text-muted)' }}>Lade Verlauf…</div>}
          {messages.map(m => (
            <MessageBubble key={m.id} msg={m} onAttachToPost={attachToPost} linkedPostId={linkedPost?.id} />
          ))}
          {/* Loading-Indicator wenn letzter Turn user war */}
          {sending && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
            <div style={{ alignSelf:'flex-start' }}>
              <TypingIndicator />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {error && (
        <div style={{ padding:'8px 24px', background:'rgba(220,38,38,.08)', borderTop:'1px solid rgba(220,38,38,.2)', color:'#b91c1c', fontSize:12, flexShrink:0 }}>
          {error}
        </div>
      )}

      <div style={{ borderTop:'1px solid var(--border)', background:'var(--surface)', padding:'12px 24px 16px', flexShrink:0 }}>
        <div style={{ maxWidth:780, margin:'0 auto' }}>
          <ChatInput
            input={input} setInput={setInput} sending={sending}
            attachments={attachments} setAttachments={setAttachments}
            plusOpen={plusOpen} setPlusOpen={setPlusOpen}
            knowledgeBase={knowledgeBase} selectedKnowledgeIds={selectedKnowledgeIds} setSelectedKnowledgeIds={setSelectedKnowledgeIds}
            audiences={audiences} selectedAudienceId={selectedAudienceId} setSelectedAudienceId={setSelectedAudienceId}
            useWebSearch={useWebSearch} setUseWebSearch={setUseWebSearch}
            handleFiles={handleFiles} fileInputRef={fileInputRef}
            sendMessage={sendMessage}
            enabled={true}
          />
        </div>
      </div>
    </>
  )
}

// ─── ChatInput-Komponente (wird sowohl in Clean als auch Chat genutzt) ──────
function ChatInput({
  input, setInput, sending,
  attachments, setAttachments,
  plusOpen, setPlusOpen,
  knowledgeBase, selectedKnowledgeIds, setSelectedKnowledgeIds,
  audiences, selectedAudienceId, setSelectedAudienceId,
  useWebSearch, setUseWebSearch,
  handleFiles, fileInputRef, sendMessage, enabled,
}) {
  return (
    <div style={{ border:'1.5px solid var(--border)', borderRadius:14, background:'#fff', padding:'12px 14px 10px', boxShadow:'0 1px 3px rgba(15,23,42,.04)' }}>
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

      {/* Knowledge-Selected-Strip */}
      {selectedKnowledgeIds.length > 0 && (
        <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
          {selectedKnowledgeIds.map(id => {
            const k = knowledgeBase.find(x => x.id === id)
            return (
              <div key={id} style={{ padding:'4px 8px', borderRadius:6, background:'#EFF6FF', fontSize:11, color: P, display:'flex', alignItems:'center', gap:6, fontWeight:600 }}>
                📚 {k?.name || id.slice(0,8)}
                <button onClick={() => setSelectedKnowledgeIds(prev => prev.filter(x => x !== id))}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:0, color: P }}>×</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Textarea */}
      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendMessage() } }}
        placeholder={enabled ? "Was möchtest du schreiben? (Cmd/Ctrl+Enter zum Senden)" : "Wähle erst oben eine Brand Voice…"}
        disabled={!enabled}
        rows={3}
        style={{ width:'100%', padding:'4px 4px 8px', border:'none', fontSize:14, fontFamily:'inherit', resize:'none', outline:'none', background:'transparent', boxSizing:'border-box' }}/>

      {/* Bottom Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          {/* Plus-Button: Datei + Wissen */}
          <div style={{ position:'relative' }}>
            <button onClick={() => setPlusOpen(o => !o)} title="Datei oder Wissen hinzufügen"
              style={IconBtn(plusOpen)}>
              <span style={{ fontSize:18, lineHeight:1 }}>+</span>
            </button>
            {plusOpen && (
              <>
                <div onClick={() => setPlusOpen(false)} style={{ position:'fixed', inset:0, zIndex:80 }}/>
                <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:0, zIndex:81, background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:260, padding:6 }}>
                  <button onClick={() => { setPlusOpen(false); fileInputRef.current?.click() }}
                    style={PlusItem}>
                    <span style={{ fontSize:16 }}>📎</span>
                    <span>Datei hochladen</span>
                  </button>
                  <div style={{ height:1, background:'var(--border)', margin:'4px 0' }}/>
                  <div style={{ padding:'8px 10px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' }}>
                    Aus Wissensdatenbank
                  </div>
                  {knowledgeBase.length === 0 && <div style={{ padding:'4px 10px 8px', fontSize:12, color:'var(--text-muted)' }}>Noch keine Einträge</div>}
                  <div style={{ maxHeight:200, overflowY:'auto' }}>
                    {knowledgeBase.map(k => {
                      const checked = selectedKnowledgeIds.includes(k.id)
                      return (
                        <label key={k.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', cursor:'pointer', fontSize:12, color:'var(--text-primary)' }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => setSelectedKnowledgeIds(prev => checked ? prev.filter(x => x !== k.id) : [...prev, k.id])}/>
                          <span>{k.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Zielgruppe */}
          <select value={selectedAudienceId} onChange={e => setSelectedAudienceId(e.target.value)}
            style={{ ...IconBtn(!!selectedAudienceId), padding:'7px 10px', fontFamily:'inherit', fontSize:12, fontWeight:500 }}>
            <option value="">Zielgruppe</option>
            {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          {/* Web-Suche */}
          <button onClick={() => setUseWebSearch(v => !v)} title="Web-Suche aktivieren"
            style={IconBtn(useWebSearch)}>
            <span style={{display:"inline-flex",alignItems:"center",gap:6}}><Globe size={13} strokeWidth={1.75}/>Web-Suche</span>
          </button>
        </div>

        {/* Senden */}
        <button onClick={sendMessage} disabled={!input.trim() || sending || !enabled}
          style={{
            padding:'8px 14px', borderRadius:9, border:'none',
            background: (!input.trim() || sending || !enabled) ? '#CBD5E1' : P,
            color:'#fff', fontSize:14, fontWeight:700,
            cursor: (!input.trim() || sending) ? 'not-allowed' : 'pointer',
            minWidth:44, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:4,
          }}>
          {sending ? '⏳' : '↑'}
        </button>
      </div>
    </div>
  )
}

const PlusItem = {
  display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px',
  background:'transparent', border:'none', cursor:'pointer', borderRadius:7,
  fontSize:13, color:'var(--text-primary)', textAlign:'left', fontFamily:'inherit',
}

function IconBtn(active) {
  return {
    padding:'6px 10px', borderRadius:8,
    border: '1.5px solid ' + (active ? P : 'var(--border)'),
    background: active ? 'rgba(49,90,231,0.06)' : '#fff',
    color: active ? P : 'var(--text-primary)',
    fontSize:12.5, fontWeight:600, cursor:'pointer',
    display:'inline-flex', alignItems:'center', gap:4, fontFamily:'inherit',
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
        maxWidth:'92%', padding:'12px 14px', borderRadius:12,
        background: isUser ? P : '#fff',
        color: isUser ? '#fff' : 'var(--text-primary)',
        border: isUser ? 'none' : '1px solid var(--border)',
        fontSize:14, lineHeight:1.6, wordBreak:'break-word',
      }}>
        {isUser ? <div style={{ whiteSpace:'pre-wrap' }}>{msg.content}</div> : renderMessageContent(msg.content)}
        {!isUser && sources?.length > 0 && <SourcesList sources={sources} />}
      </div>
      {!isUser && beitragstext && (
        <button onClick={() => onAttachToPost(beitragstext, linkedPostId)}
          style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid ' + P, background:'rgba(49,90,231,0.06)', color:P, fontSize:12, fontWeight:700, cursor:'pointer' }}>
          {linkedPostId ? 'In Beitrag übernehmen' : 'Als neuen Beitrag anlegen'}
        </button>
      )}
    </div>
  )
}
