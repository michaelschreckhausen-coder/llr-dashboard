// Messages.jsx — LinkedIn-Postfach (Umbau P2): Zwei-Spalten-Inbox aus dem lokalen
// Unipile-Spiegel (linkedin_chats/linkedin_chat_messages). Brand-scoped. Senden ueber
// EF unipile-message-send (DM/InMail), Aktualisieren ueber RPC request_inbox_sync.
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { Send, RefreshCw, ExternalLink, Loader2, Inbox as InboxIcon, Search, MessageSquare } from 'lucide-react'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const card = { background: 'var(--surface)', border: '1px solid var(--border, #E4E7EC)', borderRadius: 12 }

function initials(n) { return (n || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() }
function Avatar({ name, url, size = 42 }) {
  return url
    ? <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: '#EEF2FF', color: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>{initials(name)}</div>
}
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export default function Messages() {
  const { activeBrandVoice } = useBrandVoice()
  const bvId = activeBrandVoice?.id || null

  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [selId, setSelId] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [inmail, setInmail] = useState(false)
  const [search, setSearch] = useState('')
  const [err, setErr] = useState('')
  const bottomRef = useRef(null)

  const loadChats = useCallback(async () => {
    if (!bvId) { setChats([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('linkedin_chats')
      .select('id, attendee_name, attendee_headline, attendee_avatar_url, attendee_profile_url, last_message_at, last_message_text, unread_count, archived')
      .eq('brand_voice_id', bvId).order('last_message_at', { ascending: false, nullsFirst: false }).limit(200)
    if (error) setErr(error.message)
    setChats(data || []); setLoading(false)
  }, [bvId])
  useEffect(() => { loadChats(); setSelId(null); setMsgs([]) }, [loadChats])

  const loadMsgs = useCallback(async (chatId) => {
    setMsgLoading(true)
    const { data } = await supabase.from('linkedin_chat_messages')
      .select('id, direction, text, sent_at').eq('chat_id', chatId).order('sent_at', { ascending: true }).limit(500)
    setMsgs(data || []); setMsgLoading(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 60)
  }, [])
  const selChat = (c) => { setSelId(c.id); setErr(''); loadMsgs(c.id) }

  const doSend = async () => {
    const t = text.trim(); if (!t || !selId || sending) return
    setSending(true); setErr('')
    const { data, error } = await supabase.functions.invoke('unipile-message-send', { body: { chat_id: selId, text: t, inmail } })
    if (error || data?.error) { setErr(data?.error || error?.message || 'Senden fehlgeschlagen'); setSending(false); return }
    setText(''); setSending(false)
    setMsgs(m => [...m, { id: 'tmp' + Date.now(), direction: 'outbound', text: t, sent_at: new Date().toISOString() }])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    loadChats()
  }

  const doSync = async () => {
    if (!bvId || syncing) return
    setSyncing(true); setErr('')
    const { data } = await supabase.rpc('request_inbox_sync', { p_brand_voice_id: bvId })
    if (data?.error) { setErr(data.error === 'no_connection' ? 'Keine LinkedIn-Verbindung fuer diese Marke.' : data.error); setSyncing(false); return }
    setTimeout(async () => { await loadChats(); if (selId) await loadMsgs(selId); setSyncing(false) }, 4500)
  }

  const sel = chats.find(c => c.id === selId)
  const filtered = chats.filter(c => !search || (c.attendee_name || '').toLowerCase().includes(search.toLowerCase()))

  if (!bvId) return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted,#6B7280)' }}>
      <InboxIcon size={40} color={PRIMARY} /><h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong,#111827)', margin: '12px 0 6px' }}>Postfach</h1>
      <div style={{ fontSize: 14 }}>Bitte oben eine Marke mit verbundenem LinkedIn-Profil waehlen.</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '4px 8px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 90px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text-strong,#111827)', display: 'flex', alignItems: 'center', gap: 10 }}><MessageSquare size={22} color={PRIMARY} /> Postfach</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted,#6B7280)', marginTop: 2 }}>LinkedIn-Nachrichten deiner Marke {activeBrandVoice?.brand_name || activeBrandVoice?.name || ''} — direkt aus Leadesk.</div>
        </div>
        <button className="lk-btn lk-btn-ghost" onClick={doSync} disabled={syncing}>
          {syncing ? <Loader2 size={15} className="lk-spin" /> : <RefreshCw size={15} />} Aktualisieren
        </button>
      </div>
      {err && <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>{err}</div>}

      <div style={{ ...card, flex: 1, display: 'grid', gridTemplateColumns: '340px 1fr', overflow: 'hidden' }}>
        {/* Thread-Liste */}
        <div style={{ borderRight: '1px solid var(--border,#E4E7EC)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border,#E4E7EC)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={15} color="#9CA3AF" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Kontakt suchen…" style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, background: 'transparent', color: 'var(--text-strong,#111827)' }} />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}><Loader2 size={18} className="lk-spin" /></div>
              : filtered.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Noch keine Konversationen. Klicke „Aktualisieren", um dein LinkedIn-Postfach zu laden.</div>
              : filtered.map(c => {
                const active = c.id === selId
                return (
                  <div key={c.id} onClick={() => selChat(c)} style={{ display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #F3F4F6', background: active ? '#EEF2FF' : c.unread_count > 0 ? '#FBFCFF' : 'transparent' }}>
                    <Avatar name={c.attendee_name} url={c.attendee_avatar_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 13.5, fontWeight: c.unread_count > 0 ? 800 : 600, color: 'var(--text-strong,#111827)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.attendee_name || 'Unbekannt'}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{fmtTime(c.last_message_at)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: c.unread_count > 0 ? 'var(--text-strong,#111827)' : '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{(c.last_message_text || '').replace(/\s+/g, ' ')}</div>
                    </div>
                    {c.unread_count > 0 && <span style={{ alignSelf: 'center', minWidth: 18, height: 18, borderRadius: 9, background: PRIMARY, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{c.unread_count}</span>}
                  </div>
                )
              })}
          </div>
        </div>

        {/* Konversation */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!sel ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 14 }}>Waehle links eine Konversation.</div>
            : <>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border,#E4E7EC)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={sel.attendee_name} url={sel.attendee_avatar_url} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong,#111827)' }}>{sel.attendee_name || 'Unbekannt'}</div>
                  {sel.attendee_headline && <div style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel.attendee_headline}</div>}
                </div>
                {sel.attendee_profile_url && <a href={sel.attendee_profile_url} target="_blank" rel="noreferrer" className="lk-btn lk-btn-ghost" style={{ textDecoration: 'none' }}>Profil <ExternalLink size={13} /></a>}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 8, background: '#FafBff' }}>
                {msgLoading ? <div style={{ textAlign: 'center', color: '#9CA3AF' }}><Loader2 size={18} className="lk-spin" /></div>
                  : msgs.map(m => {
                    const out = m.direction === 'outbound'
                    return (
                      <div key={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
                        <div style={{ padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: out ? PRIMARY : '#fff', color: out ? '#fff' : 'var(--text-strong,#111827)', border: out ? 'none' : '1px solid #E4E7EC', borderBottomRightRadius: out ? 4 : 14, borderBottomLeftRadius: out ? 14 : 4 }}>{m.text}</div>
                        <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 3, textAlign: out ? 'right' : 'left' }}>{fmtTime(m.sent_at)}</div>
                      </div>
                    )
                  })}
                <div ref={bottomRef} />
              </div>

              <div style={{ borderTop: '1px solid var(--border,#E4E7EC)', padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doSend() }} rows={2} placeholder={inmail ? 'InMail schreiben…' : 'Nachricht schreiben…  (Cmd/Ctrl+Enter zum Senden)'} style={{ flex: 1, resize: 'none', border: '1.5px solid #E4E7EC', borderRadius: 10, padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', background: 'var(--surface)' }} />
                  <button className="lk-btn lk-btn-navy" onClick={doSend} disabled={sending || !text.trim()} style={{ height: 40 }}>
                    {sending ? <Loader2 size={15} className="lk-spin" /> : <Send size={15} />} Senden
                  </button>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#6B7280', marginTop: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={inmail} onChange={e => setInmail(e.target.checked)} /> Als InMail senden (fuer Nicht-Verbundene, benoetigt Sales Navigator)
                </label>
              </div>
            </>}
        </div>
      </div>
    </div>
  )
}
