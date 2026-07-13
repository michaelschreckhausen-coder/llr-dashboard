// Sponsoring OS — KI-Assistent (Phase 3, Modul 9)
// Chat über die Sponsoring-Daten des Teams (EF sponsoring-assistant).

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'

const SUGGESTIONS = [
  'Welche Sponsoren haben den höchsten Fit-Score?',
  'Wie hoch ist meine Inventar-Auslastung?',
  'Welche Verträge sind am stärksten gefährdet?',
  'Wie viel Forecast steckt in offenen Angeboten?',
]

export default function Assistent() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  async function send(q) {
    const question = (q ?? input).trim()
    if (!question || busy) return
    setError(null)
    const next = [...messages, { role: 'user', content: question }]
    setMessages(next)
    setInput('')
    setBusy(true)
    const { data, error: e } = await supabase.functions.invoke('sponsoring-assistant', {
      body: { question, history: messages },
    })
    if (e || data?.error) {
      setError(e?.message || data?.error)
      setBusy(false)
      return
    }
    setMessages([...next, { role: 'assistant', content: data.answer }])
    setBusy(false)
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <PageHeader
        overline="Sponsoring"
        title="Assistent"
        subtitle="Frag mich zu deinen Sponsoren, Verträgen, Inventar und Kennzahlen."
      />

      {error && <div style={errBox}>{error}</div>}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} style={chip}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
            <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: m.role === 'user' ? 'var(--primary)' : 'var(--surface-muted, #F1F5F9)', color: m.role === 'user' ? '#fff' : PRIMARY }}>
              {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div style={{
              maxWidth: '78%', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? 'var(--primary)' : 'var(--surface)', color: m.role === 'user' ? '#fff' : 'var(--text-strong)',
              border: m.role === 'user' ? 'none' : '1px solid var(--border)',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-muted, #F1F5F9)', color: PRIMARY }}><Bot size={16} /></div>
            <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 14 }}><Loader2 size={15} className="spin" /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send() }} style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Frage stellen…" style={inputStyle} />
        <button type="submit" disabled={busy || !input.trim()} className="lk-btn lk-btn-navy" style={{ opacity: busy || !input.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  )
}

const inputStyle = { flex: 1, padding: '11px 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 14, boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: '50%', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }
const chip = { fontSize: 13, fontWeight: 500, color: 'var(--text-strong)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 999, cursor: 'pointer', textAlign: 'left' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 12 }
