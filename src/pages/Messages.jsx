// Messages.jsx — „Nachrichten": zwei Reiter.
//  • Verfassen (zentral): Kategorie (Vernetzungsanfrage / erste Nachricht / Sales-Pitch /
//    Nachfassen / frei) → Kontakt waehlen → mit Markenstimme+Modell generieren → direkt
//    senden (Invite via unipile-invite-send ODER DM via unipile-message-send).
//  • Postfach: echtes LinkedIn-Postfach (Threads lesen, antworten, KI-Antwort, aktualisieren).
// Brand-scoped, CI-konform (lk-btn/lk-card/CSS-Vars), volle Breite.
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { useModel } from '../context/ModelContext'
import PageHeader from '../components/PageHeader'
import TabBar from '../components/TabBar'
import {
  MessageSquare, PenLine, Send, RefreshCw, Sparkles, Search, Loader2, Inbox as InboxIcon,
  Handshake, Mail, Target, Reply, ExternalLink, Plus, Check, X, UserPlus,
} from 'lucide-react'

const P = 'var(--primary, rgb(0,48,96))'

const STRICT = ' WICHTIG: Antworte AUSSCHLIESSLICH mit dem reinen Nachrichtentext (kein Markdown, kein "Betreff:", kein Header, keine Meta-Kommentare, keine Anfuehrungszeichen). Nur der Text, ggf. mit Zeilenumbruechen. Auf Deutsch.'
const CATS = [
  { key: 'vernetzung',    label: 'Vernetzungsanfrage', icon: Handshake, action: 'invite', kind: 'connection_msg',        cap: 300,
    intent: 'Schreibe eine kurze, persoenliche LinkedIn-Vernetzungs-Note (geht als Notiz an die Vernetzungsanfrage, vor der Annahme). Max. 300 Zeichen, kein Pitch, einladende Eroeffnung mit optionalem Bezug zur Person.' + STRICT },
  { key: 'first_message', label: 'Erste Nachricht',    icon: Mail,      action: 'dm',     kind: 'linkedin_first_message', cap: null,
    intent: 'Schreibe eine erste LinkedIn-Direktnachricht NACH erfolgreicher Vernetzung. 400-800 Zeichen, max. ~5 Saetze, persoenlich, kein harter Pitch. Entweder EINE konkrete Frage ODER EINEN konkreten Mehrwert.' + STRICT },
  { key: 'sales_pitch',   label: 'Sales-Pitch',        icon: Target,    action: 'dm',     kind: 'linkedin_sales_pitch',  cap: null,
    intent: 'Schreibe eine LinkedIn-Direktnachricht mit konkretem Angebot. 800-1500 Zeichen: (1) persoenlicher Aufhaenger, (2) Problem das du loest, (3) klares Angebot mit einem CTA. Persoenlich, kein Marketing-Bla.' + STRICT },
  { key: 'nachfassen',    label: 'Nachfassen',         icon: Reply,     action: 'dm',     kind: 'linkedin_first_message', cap: null,
    intent: 'Schreibe eine freundliche Nachfass-Nachricht, die unaufdringlich an den letzten Kontakt anknuepft und zu einer Reaktion einlaedt. Kurz, natuerlich.' + STRICT },
  { key: 'frei',          label: 'Frei',               icon: PenLine,   action: 'dm',     kind: 'linkedin_first_message', cap: null,
    intent: 'Schreibe eine passende, persoenliche LinkedIn-Direktnachricht auf Basis des angegebenen Anlasses.' + STRICT },
]

function initials(n) { return (n || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() }
function Avatar({ name, url, size = 40 }) {
  return url
    ? <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--surface-tint,#EFF4F9)', color: P, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.36, flexShrink: 0 }}>{initials(name)}</div>
}
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  const same = d.toDateString() === now.toDateString()
  return same ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
const contactName = c => c?.name || ((c?.first_name || '') + ' ' + (c?.last_name || '')).trim() || 'Kontakt'

// zentrale CI-Bausteine
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card, 16px)', boxShadow: 'var(--shadow-card)' }
const inputStyle = { width: '100%', border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', background: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }
const label = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7, display: 'block' }

export default function Messages() {
  const { activeBrandVoice } = useBrandVoice()
  const { model: selectedModel } = useModel()
  const bvId = activeBrandVoice?.id || null
  const brandName = activeBrandVoice?.brand_name || activeBrandVoice?.name || ''
  const [tab, setTab] = useState('verfassen')

  // ── geteilt: Kontakte ──
  const [contacts, setContacts] = useState([])
  const loadContacts = useCallback(async () => {
    if (!bvId) { setContacts([]); return }
    const { data } = await supabase.from('linkedin_inbox')
      .select('provider_id, name, first_name, last_name, headline, avatar_url')
      .eq('brand_voice_id', bvId).not('provider_id', 'is', null).order('name').limit(500)
    setContacts(data || [])
  }, [bvId])
  useEffect(() => { loadContacts() }, [loadContacts])

  if (!bvId) return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 20px' }}>
      <PageHeader overline="LinkedIn · Netzwerk" title="Nachrichten" subtitle="Nachrichten & Vernetzungsanfragen erstellen und dein LinkedIn-Postfach verwalten." />
      <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', padding: '48px 20px' }}>
        <InboxIcon size={34} color={P} /><div style={{ marginTop: 10, fontSize: 14 }}>Bitte oben eine Marke mit verbundenem LinkedIn-Profil waehlen.</div>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 20px 48px', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 40px)' }}>
      <PageHeader
        overline="LinkedIn · Netzwerk"
        title="Nachrichten"
        subtitle={`Nachrichten & Vernetzungsanfragen erstellen und das Postfach der Marke ${brandName} verwalten — direkt aus Leadesk.`}
      />
      <TabBar
        tabs={[
          { v: 'verfassen', label: 'Verfassen', icon: <PenLine size={16} strokeWidth={1.75} />, color: 'blue' },
          { v: 'postfach',  label: 'Postfach',  icon: <MessageSquare size={16} strokeWidth={1.75} />, color: 'purple' },
        ]}
        active={tab} onChange={setTab} style={{ marginBottom: 18 }}
      />
      {tab === 'verfassen'
        ? <Verfassen bvId={bvId} model={selectedModel} contacts={contacts} onOpenPostfach={() => setTab('postfach')} />
        : <Postfach bvId={bvId} brandName={brandName} contacts={contacts} reloadContacts={loadContacts} goCompose={() => setTab('verfassen')} />}
    </div>
  )
}

/* ─────────────────────────── Reiter: VERFASSEN ─────────────────────────── */
function ContactPicker({ contacts, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const filtered = contacts.filter(c => !q || contactName(c).toLowerCase().includes(q.toLowerCase()))
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="lk-dd-trigger" onClick={() => setOpen(o => !o)} style={{ width: '100%', justifyContent: 'flex-start', minHeight: 44 }}>
        {value
          ? <><Avatar name={contactName(value)} url={value.avatar_url} size={24} /><span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contactName(value)}</span></>
          : <><Search size={14} color="#9CA3AF" /><span style={{ flex: 1, textAlign: 'left', color: 'var(--text-muted)' }}>Kontakt aus deinen LinkedIn-Kontakten waehlen…</span></>}
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 60, top: 'calc(100% + 4px)', left: 0, right: 0, ...card, boxShadow: '0 14px 34px rgba(15,23,42,.16)', padding: 6, maxHeight: 320, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: '1px solid var(--border-soft)' }}>
            <Search size={14} color="#9CA3AF" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Suchen…" style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 13, color: 'var(--text-primary)' }} />
          </div>
          {contacts.length === 0 ? <div style={{ padding: 18, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Keine anschreibbaren Kontakte fuer diese Marke.</div>
            : filtered.length === 0 ? <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Kein Treffer.</div>
            : filtered.slice(0, 100).map(c => (
              <button key={c.provider_id} className="lk-dd-opt" onClick={() => { onChange(c); setOpen(false); setQ('') }}
                style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', border: 'none', background: 'transparent', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>
                <Avatar name={contactName(c)} url={c.avatar_url} size={30} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contactName(c)}</span>
                  {c.headline && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.headline}</span>}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

function Verfassen({ bvId, model, contacts, onOpenPostfach }) {
  const [catKey, setCatKey] = useState('vernetzung')
  const [target, setTarget] = useState(null)
  const [context, setContext] = useState('')
  const [text, setText] = useState('')
  const [gen, setGen] = useState(false)
  const [sending, setSending] = useState(false)
  const [flash, setFlash] = useState(null) // {type,msg}
  const cat = CATS.find(c => c.key === catKey)
  const overCap = cat.cap && text.length > cat.cap

  const generate = async () => {
    if (!target || gen) return
    setGen(true); setFlash(null)
    const parts = [cat.intent]
    parts.push('EMPFAENGER:\nName: ' + contactName(target) + (target.headline ? '\nHeadline: ' + target.headline : ''))
    if (context.trim()) parts.push('ANLASS / KONTEXT:\n' + context.trim())
    const { data, error } = await supabase.functions.invoke('generate', {
      body: { prompt: parts.join('\n\n'), brand_voice_id: bvId, model, content_kind: cat.kind }
    })
    setGen(false)
    if (error || data?.error) { setFlash({ type: 'error', msg: data?.error || error?.message || 'Generierung fehlgeschlagen' }); return }
    const out = ((typeof data === 'string' ? data : null) || data?.text || (typeof data?.content === 'string' ? data.content : null) || (Array.isArray(data?.content) ? data.content[0]?.text : null) || data?.result || '').trim()
    if (out) setText(out); else setFlash({ type: 'error', msg: 'Leere Antwort vom Modell.' })
  }

  const send = async () => {
    const t = text.trim()
    if (!target || !t || sending || overCap) return
    setSending(true); setFlash(null)
    const fn = cat.action === 'invite' ? 'unipile-invite-send' : 'unipile-message-send'
    const body = cat.action === 'invite'
      ? { brand_voice_id: bvId, attendee_provider_id: target.provider_id, note: t }
      : { brand_voice_id: bvId, attendee_provider_id: target.provider_id, text: t }
    const { data, error } = await supabase.functions.invoke(fn, { body })
    setSending(false)
    if (error || data?.error) { setFlash({ type: 'error', msg: data?.error || error?.message || 'Senden fehlgeschlagen' }); return }
    setFlash({ type: 'success', msg: cat.action === 'invite' ? 'Vernetzungsanfrage gesendet.' : 'Nachricht gesendet.', showPostfach: cat.action === 'dm' })
    setText('')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 18, alignItems: 'start' }}>
      {/* Komponieren */}
      <div style={{ ...card, padding: 18 }}>
        <div className="lk-eyebrow" style={{ marginBottom: 14 }}>Komponieren</div>

        <div style={label}>Art der Nachricht</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {CATS.map(c => {
            const on = c.key === catKey
            const Icon = c.icon
            return (
              <button key={c.key} onClick={() => { setCatKey(c.key); setText(''); setFlash(null) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: '1.5px solid ' + (on ? P : 'var(--border)'), background: on ? 'var(--primary-soft, rgba(0,48,96,.08))' : 'var(--surface)', color: on ? P : 'var(--text-primary)' }}>
                <Icon size={14} strokeWidth={1.9} /> {c.label}
              </button>
            )
          })}
        </div>

        <div style={label}>Empfaenger</div>
        <div style={{ marginBottom: 16 }}><ContactPicker contacts={contacts} value={target} onChange={setTarget} /></div>

        <div style={label}>Anlass / Kontext <span style={{ textTransform: 'none', fontWeight: 500, color: '#9CA3AF' }}>(optional)</span></div>
        <textarea value={context} onChange={e => setContext(e.target.value)} rows={3} placeholder="z. B. gemeinsames Event, konkreter Aufhaenger, Angebot…"
          style={{ ...inputStyle, resize: 'vertical', marginBottom: 16 }} />

        <button className="lk-btn lk-btn-navy lk-btn-block" onClick={generate} disabled={!target || gen}>
          {gen ? <Loader2 size={15} className="lk-spin" /> : <Sparkles size={15} />} Text generieren
        </button>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>{cat.desc || (cat.action === 'invite' ? 'Note wird an die Vernetzungsanfrage angehaengt (max. 300 Zeichen).' : 'Wird als Direktnachricht an den Kontakt gesendet.')}</div>
      </div>

      {/* Ergebnis / Senden */}
      <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="lk-eyebrow">Nachricht</div>
          {cat.cap && <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: overCap ? '#B91C1C' : 'var(--text-muted)' }}>{text.length} / {cat.cap}</span>}
        </div>

        {flash && (
          <div style={{ fontSize: 12.5, fontWeight: 500, padding: '9px 12px', borderRadius: 10, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
            background: flash.type === 'error' ? '#FEF2F2' : '#ECFDF5', border: '1px solid ' + (flash.type === 'error' ? '#FECACA' : '#A7F3D0'), color: flash.type === 'error' ? '#991B1B' : '#065F46' }}>
            {flash.type === 'success' ? <Check size={15} /> : <X size={15} />}
            <span style={{ flex: 1 }}>{flash.msg}</span>
            {flash.showPostfach && <button className="lk-btn lk-btn-ghost lk-btn-sm" onClick={onOpenPostfach}>Im Postfach oeffnen</button>}
          </div>
        )}

        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={target ? 'Text generieren oder selbst schreiben…' : 'Waehle links einen Empfaenger und eine Art.'}
          style={{ ...inputStyle, flex: 1, minHeight: 240, resize: 'vertical', lineHeight: 1.55 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          {target && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', flex: 1, minWidth: 0 }}>
            <Avatar name={contactName(target)} url={target.avatar_url} size={26} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>an <strong style={{ color: 'var(--text-primary)' }}>{contactName(target)}</strong></span>
          </div>}
          <button className="lk-btn lk-btn-cta" onClick={send} disabled={!target || !text.trim() || sending || overCap} style={{ marginLeft: target ? 0 : 'auto' }}>
            {sending ? <Loader2 size={15} className="lk-spin" /> : cat.action === 'invite' ? <UserPlus size={15} /> : <Send size={15} />}
            {cat.action === 'invite' ? 'Anfrage senden' : 'Nachricht senden'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────── Reiter: POSTFACH ─────────────────────────── */
function Postfach({ bvId, contacts, goCompose }) {
  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [selId, setSelId] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [err, setErr] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const { model: selectedModel } = useModel()
  const bottomRef = useRef(null)

  const loadChats = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('linkedin_chats')
      .select('id, attendee_name, attendee_headline, attendee_avatar_url, attendee_profile_url, last_message_at, last_message_text, unread_count')
      .eq('brand_voice_id', bvId).order('last_message_at', { ascending: false, nullsFirst: false }).limit(200)
    setChats(data || []); setLoading(false)
  }, [bvId])
  useEffect(() => { loadChats(); setSelId(null); setMsgs([]) }, [loadChats])

  const loadMsgs = useCallback(async (id) => {
    setMsgLoading(true)
    const { data } = await supabase.from('linkedin_chat_messages').select('id, direction, text, sent_at').eq('chat_id', id).order('sent_at', { ascending: true }).limit(500)
    setMsgs(data || []); setMsgLoading(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 60)
  }, [])
  const selChat = c => { setSelId(c.id); setErr(''); loadMsgs(c.id) }

  const doSend = async () => {
    const t = text.trim(); if (!t || !selId || sending) return
    setSending(true); setErr('')
    const { data, error } = await supabase.functions.invoke('unipile-message-send', { body: { chat_id: selId, text: t } })
    if (error || data?.error) { setErr(data?.error || error?.message || 'Senden fehlgeschlagen'); setSending(false); return }
    setText(''); setSending(false)
    setMsgs(m => [...m, { id: 'tmp' + Date.now(), direction: 'outbound', text: t, sent_at: new Date().toISOString() }])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    loadChats()
  }
  const doSync = async () => {
    if (syncing) return
    setSyncing(true); setErr('')
    const { data } = await supabase.rpc('request_inbox_sync', { p_brand_voice_id: bvId })
    if (data?.error) { setErr(data.error === 'no_connection' ? 'Keine LinkedIn-Verbindung fuer diese Marke.' : data.error); setSyncing(false); return }
    setTimeout(async () => { await loadChats(); if (selId) await loadMsgs(selId); setSyncing(false) }, 4500)
  }
  const genReply = async () => {
    const c = chats.find(x => x.id === selId); if (!c || aiLoading) return
    setAiLoading(true); setErr('')
    const name = c.attendee_name || 'der Kontakt'
    const transcript = msgs.slice(-12).map(m => (m.direction === 'outbound' ? 'Ich' : name) + ': ' + (m.text || '').replace(/\s+/g, ' ')).join('\n') || '(noch keine Nachrichten)'
    const prompt = 'Du antwortest im Namen der Marke in einem LinkedIn-Dialog mit ' + name + '.\n\nVerlauf (alt zu neu):\n' + transcript + '\n\nAufgabe: Schreibe die naechste passende Antwort. NUR reiner Text, kurz, natuerlich, auf Deutsch.'
    const { data, error } = await supabase.functions.invoke('generate', { body: { prompt, brand_voice_id: bvId, model: selectedModel, content_kind: 'linkedin_first_message' } })
    setAiLoading(false)
    if (error || data?.error) { setErr(data?.error || error?.message || 'KI-Antwort fehlgeschlagen'); return }
    const out = ((typeof data === 'string' ? data : null) || data?.text || (typeof data?.content === 'string' ? data.content : null) || (Array.isArray(data?.content) ? data.content[0]?.text : null) || data?.result || '').trim()
    if (out) setText(out)
  }

  const sel = chats.find(c => c.id === selId)
  const filtered = chats.filter(c => !search || (c.attendee_name || '').toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ ...card, flex: 1, display: 'grid', gridTemplateColumns: '360px 1fr', overflow: 'hidden', minHeight: 560 }}>
      {/* Thread-Liste */}
      <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={15} color="#9CA3AF" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Kontakt suchen…" style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, background: 'transparent', color: 'var(--text-primary)' }} />
          <button className="lk-btn lk-btn-ghost lk-btn-sm" onClick={doSync} disabled={syncing} title="Postfach aktualisieren">{syncing ? <Loader2 size={13} className="lk-spin" /> : <RefreshCw size={13} />}</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}><Loader2 size={18} className="lk-spin" /></div>
            : filtered.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Noch keine Konversationen. Klicke oben auf Aktualisieren.</div>
            : filtered.map(c => {
              const on = c.id === selId
              return (
                <div key={c.id} onClick={() => selChat(c)} style={{ display: 'flex', gap: 10, padding: '11px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-soft)', background: on ? 'var(--surface-tint,#EFF4F9)' : c.unread_count > 0 ? 'var(--surface-muted,#F6F7FB)' : 'transparent' }}>
                  <Avatar name={c.attendee_name} url={c.attendee_avatar_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: c.unread_count > 0 ? 800 : 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.attendee_name || 'Unbekannt'}</span>
                      <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{fmtTime(c.last_message_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: c.unread_count > 0 ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{(c.last_message_text || '').replace(/\s+/g, ' ')}</div>
                  </div>
                  {c.unread_count > 0 && <span style={{ alignSelf: 'center', minWidth: 18, height: 18, borderRadius: 9, background: P, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{c.unread_count}</span>}
                </div>
              )
            })}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
          <button className="lk-btn lk-btn-ghost lk-btn-block" onClick={goCompose}><Plus size={15} /> Neue Nachricht verfassen</button>
        </div>
      </div>

      {/* Konversation */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!sel ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 14, gap: 10 }}>
            <MessageSquare size={30} color="#CBD5E1" /> Waehle links eine Konversation.
          </div>
          : <>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={sel.attendee_name} url={sel.attendee_avatar_url} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{sel.attendee_name || 'Unbekannt'}</div>
                {sel.attendee_headline && <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel.attendee_headline}</div>}
              </div>
              {sel.attendee_profile_url && <a href={sel.attendee_profile_url} target="_blank" rel="noreferrer" className="lk-btn lk-btn-ghost lk-btn-sm" style={{ textDecoration: 'none' }}>Profil <ExternalLink size={13} /></a>}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-muted,#F6F7FB)' }}>
              {msgLoading ? <div style={{ textAlign: 'center', color: '#9CA3AF' }}><Loader2 size={18} className="lk-spin" /></div>
                : msgs.map(m => {
                  const out = m.direction === 'outbound'
                  return (
                    <div key={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '74%' }}>
                      <div style={{ padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: out ? P : 'var(--surface)', color: out ? '#fff' : 'var(--text-primary)', border: out ? 'none' : '1px solid var(--border)', borderBottomRightRadius: out ? 4 : 14, borderBottomLeftRadius: out ? 14 : 4 }}>{m.text}</div>
                      <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 3, textAlign: out ? 'right' : 'left' }}>{fmtTime(m.sent_at)}</div>
                    </div>
                  )
                })}
              <div ref={bottomRef} />
            </div>
            {err && <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', borderTop: '1px solid #FECACA', padding: '8px 12px' }}>{err}</div>}
            <div style={{ borderTop: '1px solid var(--border)', padding: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doSend() }} rows={2} placeholder="Nachricht schreiben…  (Cmd/Ctrl+Enter zum Senden)"
                  style={{ ...inputStyle, flex: 1, resize: 'none' }} />
                <button className="lk-btn lk-btn-ghost" onClick={genReply} disabled={aiLoading} title="KI-Antwort" style={{ height: 42 }}>{aiLoading ? <Loader2 size={15} className="lk-spin" /> : <Sparkles size={15} />}</button>
                <button className="lk-btn lk-btn-navy" onClick={doSend} disabled={sending || !text.trim()} style={{ height: 42 }}>{sending ? <Loader2 size={15} className="lk-spin" /> : <Send size={15} />} Senden</button>
              </div>
            </div>
          </>}
      </div>
    </div>
  )
}
