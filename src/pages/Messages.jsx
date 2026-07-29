// Messages.jsx — LinkedIn-Postfach (Umbau P2): Zwei-Spalten-Inbox aus dem lokalen
// Unipile-Spiegel (linkedin_chats/linkedin_chat_messages). Brand-scoped. Senden ueber
// EF unipile-message-send (DM/InMail), Aktualisieren ueber RPC request_inbox_sync.
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { useModel } from '../context/ModelContext'
import { Send, RefreshCw, ExternalLink, Loader2, Inbox as InboxIcon, Search, MessageSquare, Sparkles, Plus } from 'lucide-react'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const card = { background: 'var(--surface)', border: '1px solid var(--border, #E4E7EC)', borderRadius: 12 }
const REPLY_INTENTS = [
  { key: 'reply',    label: 'Passende Antwort',   instr: 'Antworte passend und hilfreich auf die letzte Nachricht und bringe den Dialog natuerlich weiter.' },
  { key: 'followup', label: 'Freundlich nachfassen', instr: 'Fasse freundlich nach, ohne aufdringlich zu wirken, und lade zu einer Reaktion ein.' },
  { key: 'meeting',  label: 'Gespraech vorschlagen', instr: 'Schlage unaufdringlich ein kurzes Kennenlern-Gespraech (Call) vor und frage nach Verfuegbarkeit.' },
  { key: 'close',    label: 'Freundlich abschliessen', instr: 'Bedanke dich und schliesse den Dialog freundlich und offen ab.' },
]

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
  const { model: selectedModel } = useModel()
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMenu, setAiMenu] = useState(false)
  const [contacts, setContacts] = useState([])
  const [contactSearch, setContactSearch] = useState('')
  const [newMsgOpen, setNewMsgOpen] = useState(false)
  const [draftTarget, setDraftTarget] = useState(null)

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
    const t = text.trim(); if (!t || sending) return
    if (!selId && !draftTarget) return
    setSending(true); setErr('')
    const body = selId
      ? { chat_id: selId, text: t, inmail }
      : { brand_voice_id: bvId, attendee_provider_id: draftTarget.provider_id, text: t, inmail }
    const { data, error } = await supabase.functions.invoke('unipile-message-send', { body })
    if (error || data?.error) {
      const e = data?.error
      setErr(e === 'no_connection_for_brand' ? 'Keine LinkedIn-Verbindung fuer diese Marke.' : (e || error?.message || 'Senden fehlgeschlagen'))
      setSending(false); return
    }
    setText(''); setSending(false)
    const newChatId = data?.chat_id || null
    if (!selId && newChatId) {
      setDraftTarget(null); await loadChats(); setSelId(newChatId); loadMsgs(newChatId); return
    }
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

  const loadContacts = useCallback(async () => {
    if (!bvId) return
    const { data } = await supabase.from('linkedin_inbox')
      .select('provider_id, name, first_name, last_name, headline, avatar_url')
      .eq('brand_voice_id', bvId).not('provider_id', 'is', null).order('name').limit(400)
    setContacts(data || [])
  }, [bvId])
  const openNewMsg = () => { setNewMsgOpen(true); setContactSearch(''); loadContacts() }
  const pickContact = (ct) => {
    const nm = ct.name || ((ct.first_name || '') + ' ' + (ct.last_name || '')).trim() || 'Kontakt'
    setDraftTarget({ provider_id: ct.provider_id, name: nm, headline: ct.headline, avatar_url: ct.avatar_url })
    setSelId(null); setMsgs([]); setNewMsgOpen(false); setText(''); setErr('')
  }

  const genReply = async (intent) => {
    setAiMenu(false)
    if (aiLoading) return
    const c = chats.find(x => x.id === selId) || (draftTarget ? { attendee_name: draftTarget.name, attendee_headline: draftTarget.headline } : null)
    if (!c) return
    setAiLoading(true); setErr('')
    const name = c.attendee_name || 'der Kontakt'
    const transcript = msgs.slice(-12).map(m => (m.direction === 'outbound' ? 'Ich' : name) + ': ' + (m.text || '').replace(/\s+/g, ' ')).join('\n') || '(noch keine Nachrichten im Verlauf)'
    const prompt = 'Du antwortest im Namen der Marke in einem laufenden LinkedIn-Dialog mit ' + name + (c.attendee_headline ? ' (' + c.attendee_headline + ')' : '') + '.\n\n'
      + 'Bisheriger Verlauf (alt zu neu):\n' + transcript + '\n\n'
      + 'Aufgabe: ' + intent.instr + '\n\nSchreibe NUR die naechste Nachricht als reinen Text — kein Betreff, keine Meta-Kommentare, keine Anfuehrungszeichen. Kurz, natuerlich, auf Deutsch, passend zum Verlauf.'
    const { data, error } = await supabase.functions.invoke('generate', {
      body: { prompt, brand_voice_id: bvId, model: selectedModel, content_kind: 'linkedin_first_message' }
    })
    setAiLoading(false)
    if (error || data?.error) { setErr(data?.error || error?.message || 'KI-Antwort fehlgeschlagen'); return }
    const out = ((typeof data === 'string' ? data : null) || data?.text || (typeof data?.content === 'string' ? data.content : null) || (Array.isArray(data?.content) ? data.content[0]?.text : null) || data?.result || '').trim()
    if (out) setText(out)
  }

  const sel = chats.find(c => c.id === selId)
  const conv = sel || (draftTarget ? { attendee_name: draftTarget.name, attendee_headline: draftTarget.headline, attendee_avatar_url: draftTarget.avatar_url, attendee_profile_url: null } : null)
  const contactsFiltered = contacts.filter(c => { const n = (c.name || ((c.first_name||'')+' '+(c.last_name||''))).toLowerCase(); return !contactSearch || n.includes(contactSearch.toLowerCase()) })
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="lk-btn lk-btn-ghost" onClick={doSync} disabled={syncing}>
            {syncing ? <Loader2 size={15} className="lk-spin" /> : <RefreshCw size={15} />} Aktualisieren
          </button>
          <button className="lk-btn lk-btn-navy" onClick={openNewMsg}><Plus size={15} /> Neue Nachricht</button>
        </div>
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
          {!conv ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 14 }}>Waehle links eine Konversation oder starte eine neue Nachricht.</div>
            : <>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border,#E4E7EC)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={conv.attendee_name} url={conv.attendee_avatar_url} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong,#111827)' }}>{conv.attendee_name || 'Unbekannt'}</div>
                  {conv.attendee_headline && <div style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.attendee_headline}</div>}
                </div>
                {conv.attendee_profile_url && <a href={conv.attendee_profile_url} target="_blank" rel="noreferrer" className="lk-btn lk-btn-ghost" style={{ textDecoration: 'none' }}>Profil <ExternalLink size={13} /></a>}
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
                {draftTarget && !sel && msgs.length === 0 && !msgLoading && <div style={{ margin: 'auto', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Neue Konversation mit {draftTarget.name} — schreibe die erste Nachricht.</div>}
                <div ref={bottomRef} />
              </div>

              <div style={{ borderTop: '1px solid var(--border,#E4E7EC)', padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doSend() }} rows={2} placeholder={inmail ? 'InMail schreiben…' : 'Nachricht schreiben…  (Cmd/Ctrl+Enter zum Senden)'} style={{ flex: 1, resize: 'none', border: '1.5px solid #E4E7EC', borderRadius: 10, padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', background: 'var(--surface)' }} />
                  <div style={{ position: 'relative' }}>
                    <button className="lk-btn lk-btn-ghost" onClick={() => setAiMenu(v => !v)} disabled={aiLoading} style={{ height: 40 }} title="KI-Antwort vorschlagen">
                      {aiLoading ? <Loader2 size={15} className="lk-spin" /> : <Sparkles size={15} />} KI-Antwort
                    </button>
                    {aiMenu && (
                      <div style={{ position: 'absolute', bottom: 46, right: 0, ...card, boxShadow: '0 8px 28px rgba(0,0,0,.14)', padding: 6, zIndex: 30, minWidth: 210 }}>
                        {REPLY_INTENTS.map(it => (
                          <div key={it.key} onClick={() => genReply(it)} style={{ padding: '9px 11px', fontSize: 13, borderRadius: 8, cursor: 'pointer', color: 'var(--text-strong,#111827)' }} onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{it.label}</div>
                        ))}
                      </div>
                    )}
                  </div>
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

      {newMsgOpen && (
        <div onClick={() => setNewMsgOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: 460, maxWidth: '100%', maxHeight: '78vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border,#E4E7EC)', fontWeight: 800, fontSize: 16, color: 'var(--text-strong,#111827)' }}>Neue Nachricht</div>
            <div style={{ padding: 10, borderBottom: '1px solid var(--border,#E4E7EC)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={15} color="#9CA3AF" />
              <input autoFocus value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Kontakt aus deinen LinkedIn-Kontakten suchen…" style={{ border: 'none', outline: 'none', fontSize: 13.5, flex: 1, background: 'transparent', color: 'var(--text-strong,#111827)' }} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {contacts.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Keine anschreibbaren Kontakte fuer diese Marke.</div>
                : contactsFiltered.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Kein Treffer.</div>
                : contactsFiltered.map(ct => {
                  const nm = ct.name || ((ct.first_name || '') + ' ' + (ct.last_name || '')).trim() || 'Kontakt'
                  return (
                    <div key={ct.provider_id} onClick={() => pickContact(ct)} style={{ display: 'flex', gap: 10, padding: '9px 14px', cursor: 'pointer', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <Avatar name={nm} url={ct.avatar_url} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong,#111827)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nm}</div>
                        {ct.headline && <div style={{ fontSize: 11.5, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ct.headline}</div>}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
