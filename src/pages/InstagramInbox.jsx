// InstagramInbox — P1: DM-Postfach (read) auf Basis der Unipile-Verbindung.
//
// Liest den lokalen Spiegel (instagram_chats / instagram_messages), den
// instagram-unipile-sync befüllt. Senden folgt in P2 — das Composer-Feld ist
// bewusst als ehrlicher disabled-State ausgeführt statt als toter Stub
// (Lesson aus dem LeadDetail-Promote 2026-05-18).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, MessageCircle, ExternalLink, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import {
  getUnipileConnection, listChats, listMessages, syncInbox,
} from '../lib/instagramUnipile'

// lucide@1.x kennt kein 'Instagram'-Glyph (Top-Fallstrick #11) → lokales Inline-SVG.
function IcInstagram({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const IG_PINK = '#E1306C'
const C = {
  surface: '#ffffff', border: '#E4E7EC', text1: '#111827',
  text2: '#374151', text3: '#6B7280', canvas: '#F8FAFC',
}

function fmtTime(s) {
  if (!s) return ''
  try {
    const d = new Date(s)
    const today = new Date()
    const sameDay = d.toDateString() === today.toDateString()
    return sameDay
      ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
  } catch (_) { return '' }
}
function fmtFull(s) {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString('de-DE', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch (_) { return '' }
}

function Avatar({ url, name, size = 38 }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  if (url) {
    return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, #F58529, ${IG_PINK}, #833AB4)`,
      color: '#fff', display: 'grid', placeItems: 'center',
      fontSize: size * 0.4, fontWeight: 700,
    }}>{initial}</div>
  )
}

export default function InstagramInbox() {
  const navigate = useNavigate()
  const { activeTeamId } = useTeam() || {}

  const [phase, setPhase]   = useState('loading')  // loading | disconnected | ready | error
  const [conn, setConn]     = useState(null)
  const [chats, setChats]   = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages]     = useState([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [q, setQ]           = useState('')
  const [syncing, setSyncing] = useState(false)
  const [err, setErr]       = useState('')
  const [note, setNote]     = useState('')
  const scrollRef = useRef(null)

  // ── Verbindung + Chats laden ─────────────────────────────────────────────
  async function load() {
    setErr('')
    try {
      const c = await getUnipileConnection()
      if (!c || c.status !== 'OK') { setConn(c); setPhase('disconnected'); return }
      setConn(c)
      setChats(await listChats(activeTeamId))
      setPhase('ready')
    } catch (e) {
      setErr(e.message || 'Fehler beim Laden')
      setPhase('error')
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [activeTeamId])

  // ── Realtime: neue Nachrichten → Chatliste + offener Verlauf aktualisieren ──
  useEffect(() => {
    if (!activeTeamId) return undefined
    const channel = supabase
      .channel(`ig-inbox-${activeTeamId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'instagram_messages', filter: `team_id=eq.${activeTeamId}` },
        () => {
          listChats(activeTeamId).then(setChats).catch(() => {})
          setActiveChat(cur => {
            if (cur) listMessages(cur.id).then(setMessages).catch(() => {})
            return cur
          })
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeTeamId])

  // ── Verlauf beim Chat-Wechsel ────────────────────────────────────────────
  useEffect(() => {
    if (!activeChat) { setMessages([]); return }
    let cancelled = false
    setMsgLoading(true)
    listMessages(activeChat.id)
      .then(m => { if (!cancelled) setMessages(m) })
      .catch(e => { if (!cancelled) setErr(e.message) })
      .finally(() => { if (!cancelled) setMsgLoading(false) })
    return () => { cancelled = true }
  }, [activeChat])

  // Autoscroll ans Ende des Verlaufs.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  async function onSync(full = false) {
    setSyncing(true); setErr(''); setNote('')
    try {
      const r = await syncInbox({ full })
      setChats(await listChats(activeTeamId))
      if (activeChat) setMessages(await listMessages(activeChat.id))
      setNote(`${r.chats_upserted} Chats · ${r.messages_upserted} Nachrichten synchronisiert${r.error_count ? ` · ${r.error_count} Teilfehler` : ''}`)
    } catch (e) {
      setErr(e.message || 'Sync fehlgeschlagen')
    } finally { setSyncing(false) }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return chats
    return chats.filter(c =>
      (c.attendee_name || '').toLowerCase().includes(s) ||
      (c.attendee_username || '').toLowerCase().includes(s) ||
      (c.last_message_text || '').toLowerCase().includes(s))
  }, [chats, q])

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center',
        background: `linear-gradient(135deg, #F58529, ${IG_PINK}, #833AB4)`, color: '#fff',
      }}>
        <IcInstagram size={22} />
      </div>
      <div style={{ flex: 1 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text1 }}>Instagram-Postfach</h1>
        {conn?.username && <div style={{ fontSize: 13, color: C.text3 }}>@{conn.username}</div>}
      </div>
      {phase === 'ready' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onSync(false)} disabled={syncing} style={btnGhost}>
            <RefreshCw size={15} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
            Synchronisieren
          </button>
          <button onClick={() => onSync(true)} disabled={syncing} style={btnGhost} title="Alle Chats über alle Seiten holen">
            Voll-Sync
          </button>
        </div>
      )}
    </div>
  )

  function shell(children) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>
        {header}
        {err && (
          <div style={{
            marginBottom: 14, padding: '12px 16px', borderRadius: 10,
            background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13,
          }}>{err}</div>
        )}
        {note && (
          <div style={{
            marginBottom: 14, padding: '10px 16px', borderRadius: 10,
            background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', fontSize: 13,
          }}>{note}</div>
        )}
        {children}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (phase === 'loading') {
    return shell(<div style={{ color: C.text3, padding: 48, textAlign: 'center' }}>Lädt …</div>)
  }

  if (phase === 'disconnected') {
    return shell(
      <div style={{
        background: C.surface, border: `1px dashed ${C.border}`, borderRadius: 16,
        padding: '40px 28px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text1, marginBottom: 8 }}>
          {conn ? 'Instagram-Verbindung nicht aktiv' : 'Noch kein Instagram-Konto für Nachrichten verbunden'}
        </div>
        <div style={{ color: C.text3, fontSize: 14, maxWidth: 480, margin: '0 auto 20px' }}>
          {conn
            ? `Der Status der Verbindung ist „${conn.status}“. Verbinde das Konto in den Einstellungen neu, um das Postfach zu nutzen.`
            : 'Für das DM-Postfach brauchst du eine Nachrichten-Verbindung. Die ist unabhängig von der Analyse-Verbindung.'}
        </div>
        <button onClick={() => navigate('/settings/instagram')} style={btnPrimary}>
          Zu den Einstellungen
        </button>
      </div>
    )
  }

  if (phase === 'error') {
    return shell(
      <button onClick={load} style={btnGhost}>Erneut versuchen</button>
    )
  }

  // ── ready ─────────────────────────────────────────────────────────────────
  return shell(
    <div style={{
      display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0,
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
      overflow: 'hidden', height: 'calc(100vh - 220px)', minHeight: 460,
    }}>
      {/* Chat-Liste */}
      <div style={{ borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: C.text3 }} />
            <input
              value={q} onChange={e => setQ(e.target.value)} placeholder="Chats durchsuchen"
              style={{
                width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8,
                border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.text3, fontSize: 13 }}>
              {chats.length === 0
                ? 'Noch keine Chats. Klick auf „Synchronisieren“, um dein Postfach zu laden.'
                : 'Keine Treffer.'}
            </div>
          ) : filtered.map(c => {
            const active = activeChat?.id === c.id
            return (
              <button key={c.id} onClick={() => setActiveChat(c)} style={{
                width: '100%', display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left',
                padding: '10px 12px', border: 'none', borderBottom: `1px solid ${C.border}`,
                background: active ? '#F5F3FF' : 'transparent', cursor: 'pointer',
                borderLeft: active ? `3px solid ${IG_PINK}` : '3px solid transparent',
              }}>
                <Avatar url={c.attendee_avatar_url} name={c.attendee_name || c.attendee_username} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <div style={{
                      fontWeight: 700, fontSize: 13, color: C.text1, flex: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.attendee_name || (c.attendee_username ? `@${c.attendee_username}` : 'Unbekannt')}
                    </div>
                    <div style={{ fontSize: 11, color: C.text3, flexShrink: 0 }}>{fmtTime(c.last_message_at)}</div>
                  </div>
                  <div style={{
                    fontSize: 12, color: c.unread_count > 0 ? C.text1 : C.text3,
                    fontWeight: c.unread_count > 0 ? 600 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.last_message_is_outbound ? 'Du: ' : ''}{c.last_message_text || '—'}
                  </div>
                </div>
                {c.unread_count > 0 && (
                  <span style={{
                    background: IG_PINK, color: '#fff', fontSize: 10, fontWeight: 700,
                    borderRadius: 999, padding: '1px 6px', flexShrink: 0,
                  }}>{c.unread_count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Verlauf */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!activeChat ? (
          <div style={{
            flex: 1, display: 'grid', placeItems: 'center', color: C.text3,
            fontSize: 14, gap: 10, textAlign: 'center', padding: 24,
          }}>
            <div>
              <MessageCircle size={30} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 8 }}>Wähle links einen Chat aus.</div>
            </div>
          </div>
        ) : (
          <>
            {/* Chat-Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
              borderBottom: `1px solid ${C.border}`,
            }}>
              <Avatar url={activeChat.attendee_avatar_url} name={activeChat.attendee_name || activeChat.attendee_username} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text1 }}>
                  {activeChat.attendee_name || 'Unbekannt'}
                </div>
                {activeChat.attendee_username && (
                  <div style={{ fontSize: 12, color: C.text3 }}>@{activeChat.attendee_username}</div>
                )}
              </div>
              {activeChat.lead_id && (
                <button onClick={() => navigate(`/leads/${activeChat.lead_id}`)} style={btnGhost}>
                  Kontakt öffnen
                </button>
              )}
              {activeChat.attendee_username && (
                <a href={`https://instagram.com/${activeChat.attendee_username}`} target="_blank" rel="noopener noreferrer"
                  style={{ ...btnGhost, textDecoration: 'none' }}>
                  <ExternalLink size={14} /> Profil
                </a>
              )}
            </div>

            {/* Nachrichten */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, background: C.canvas }}>
              {msgLoading ? (
                <div style={{ color: C.text3, fontSize: 13, textAlign: 'center', padding: 20 }}>Lädt …</div>
              ) : messages.length === 0 ? (
                <div style={{ color: C.text3, fontSize: 13, textAlign: 'center', padding: 20 }}>
                  Keine Nachrichten in diesem Chat.
                </div>
              ) : messages.map(m => (
                <div key={m.id} style={{
                  display: 'flex', justifyContent: m.is_outbound ? 'flex-end' : 'flex-start', marginBottom: 10,
                }}>
                  <div style={{ maxWidth: '68%' }}>
                    <div style={{
                      padding: '8px 12px', borderRadius: 14,
                      background: m.is_outbound ? PRIMARY : C.surface,
                      color: m.is_outbound ? '#fff' : C.text1,
                      border: m.is_outbound ? 'none' : `1px solid ${C.border}`,
                      fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {m.text || <em style={{ opacity: 0.7 }}>(kein Text)</em>}
                      {(m.attachments?.length > 0) && (
                        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>
                          {m.attachments.length} Anhang{m.attachments.length > 1 ? 'e' : ''}
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontSize: 10.5, color: C.text3, marginTop: 3,
                      textAlign: m.is_outbound ? 'right' : 'left',
                    }}>
                      {fmtFull(m.sent_at)}
                      {(m.reactions?.length > 0) && ` · ${m.reactions.map(r => r.value).filter(Boolean).join(' ')}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Composer — P2. Ehrlicher disabled-State statt totem Stub. */}
            <div style={{
              padding: '10px 16px', borderTop: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 8, background: C.surface,
            }}>
              <div style={{
                flex: 1, padding: '9px 12px', borderRadius: 999, border: `1px solid ${C.border}`,
                background: C.canvas, color: C.text3, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 7,
              }}>
                <Lock size={13} /> Antworten direkt aus Leadesk kommt im nächsten Schritt.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff',
  color: C.text2, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnPrimary = {
  padding: '10px 20px', borderRadius: 9, border: 'none', background: PRIMARY,
  color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
