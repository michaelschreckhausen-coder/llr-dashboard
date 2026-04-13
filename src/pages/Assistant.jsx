import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// System-Prompt wird server-seitig in der Supabase Edge Function verwaltet

function formatName(lead) {
  return `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.name || 'Unbekannt'
}

function formatCurrency(val) {
  if (!val) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
}

function renderMessage(text) {
  // Markdown-ähnliches Rendering: **bold**, \n → <br>
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} style={{ background:'#F1F5F9', padding:'1px 5px', borderRadius:4, fontSize:12, fontFamily:'monospace' }}>{part.slice(1,-1)}</code>
    if (part === '\n') return <br key={i}/>
    return part
  })
}

export default function Assistant({ session }) {
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [leads, setLeads]         = useState([])
  const [leadsLoaded, setLeadsLoaded] = useState(false)
  const [suggestions]             = useState([
    'Wer hat den höchsten Deal-Wert?',
    'Welche Leads sind Hot Intent?',
    'Wie ist die Telefonnummer von Knut Döring?',
    'Wie hoch ist der gesamte Pipeline-Wert?',
    'Welche Follow-ups sind diese Woche fällig?',
    'Welche Leads sind noch nicht vernetzt?',
  ])
  const endRef = useRef(null)
  const inputRef = useRef(null)

  // Leads laden
  useEffect(() => {
    async function loadLeads() {
      const { data } = await supabase
        .from('leads')
        .select('id,first_name,last_name,name,company,job_title,email,phone,deal_value,deal_stage,deal_expected_close,deal_probability,hs_score,next_followup,ai_buying_intent,li_connection_status,notes,tags,city,country,is_favorite,ai_need_detected,ai_pain_points')
        .eq('user_id', session.user.id)
        .order('hs_score', { ascending: false })
        .limit(200)
      setLeads(data || [])
      setLeadsLoaded(true)
    }
    loadLeads()
  }, [session])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (leadsLoaded && messages.length === 0) {
      const pipelineLeads = leads.filter(l => l.deal_stage && l.deal_stage !== 'kein_deal' && l.deal_stage !== 'verloren')
      const totalPipeline = leads.reduce((s, l) => s + (Number(l.deal_value) || 0), 0)
      const hot = leads.filter(l => l.ai_buying_intent === 'hoch').length
      setMessages([{
        role: 'assistant',
        content: `Hallo! Ich bin dein Leadesk-Assistent. 👋\n\nIch habe Zugriff auf **${leads.length} Leads** in deiner Datenbank.\n\n📊 **Schnellübersicht:**\n• Pipeline-Wert gesamt: **${formatCurrency(totalPipeline)}**\n• Leads in Pipeline: **${pipelineLeads.length}**\n• 🔥 Hot Intent: **${hot} Leads**\n\nWas möchtest du wissen?`,
      }])
    }
  }, [leadsLoaded])

  async function sendMessage(text) {
    if (!text.trim() || loading) return

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      // Leads-Kontext als kompaktes JSON
      const leadsContext = leads.map(l => ({
        name: formatName(l),
        firma: l.company,
        position: l.job_title,
        email: l.email,
        tel: l.phone,
        deal: l.deal_value ? Math.round(l.deal_value) : null,
        stage: l.deal_stage,
        score: l.hs_score,
        intent: l.ai_buying_intent,
        followup: l.next_followup ? l.next_followup.split('T')[0] : null,
        vernetzt: l.li_connection_status,
        favorit: l.is_favorite,
        stadt: l.city,
        notiz: l.ai_need_detected,
      }))

      // Sicherer Aufruf über Supabase Edge Function — OpenAI Key bleibt server-seitig
      const { data: { session: sess } } = await supabase.auth.getSession()
      const response = await fetch(
        'https://jdhajqpgfrsuoluaesjn.supabase.co/functions/v1/ai-assistant',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sess?.access_token}`,
          },
          body: JSON.stringify({
            messages: newMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
            leads: leadsContext,
          }),
        }
      )

      let data
      try { data = await response.json() } catch { data = {} }
      
      if (response.status === 401) throw new Error('Nicht autorisiert — bitte neu einloggen')
      if (response.status === 500 && data.error?.includes('API Key')) {
        throw new Error('OpenAI API Key fehlt in Supabase Secrets. Bitte OPENAI_API_KEY in den Edge Function Secrets setzen.')
      }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      const reply = data.reply || 'Entschuldigung, keine Antwort erhalten.'

      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      const msg = err.message === 'Failed to fetch'
        ? 'Verbindung zur Edge Function fehlgeschlagen. Bitte OPENAI_API_KEY in den Supabase Edge Function Secrets setzen.'
        : err.message
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ ' + msg }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 80px)', maxWidth:780, margin:'0 auto' }}>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'8px 0 16px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display:'flex', gap:12, marginBottom:20, flexDirection: msg.role==='user' ? 'row-reverse' : 'row' }}>

            {/* Avatar */}
            {msg.role === 'assistant' ? (
              <div style={{ width:34, height:34, borderRadius:10, background:'var(--wl-primary, rgb(49,90,231))', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              </div>
            ) : (
              <div style={{ width:34, height:34, borderRadius:10, background:'#E0E7FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:13, fontWeight:700, color:'var(--wl-primary, rgb(49,90,231))', marginTop:2 }}>
                {(session.user.user_metadata?.full_name || session.user.email || 'U')[0].toUpperCase()}
              </div>
            )}

            {/* Bubble */}
            <div style={{
              maxWidth:'78%',
              background: msg.role === 'user' ? 'var(--wl-primary, rgb(49,90,231))' : '#fff',
              color:       msg.role === 'user' ? '#fff' : '#0F172A',
              border:      msg.role === 'user' ? 'none' : '1px solid #E5E7EB',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              padding: '10px 14px',
              fontSize: 13,
              lineHeight: 1.6,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              {renderMessage(msg.content)}
            </div>
          </div>
        ))}

        {/* Loading */}
        {loading && (
          <div style={{ display:'flex', gap:12, marginBottom:20 }}>
            <div style={{ width:34, height:34, borderRadius:10, background:'var(--wl-primary, rgb(49,90,231))', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            </div>
            <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:'16px 16px 16px 4px', padding:'12px 16px', display:'flex', gap:4, alignItems:'center' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#CBD5E1', animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite` }}/>
              ))}
            </div>
          </div>
        )}

        <div ref={endRef}/>
      </div>

      {/* Suggestions (nur am Anfang) */}
      {messages.length <= 1 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => sendMessage(s)}
              style={{ padding:'6px 12px', borderRadius:99, border:'1px solid #E2E8F0', background:'#F8FAFC', fontSize:12, color:'#475569', cursor:'pointer', transition:'all 0.15s', whiteSpace:'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.background='#EEF2FF'; e.currentTarget.style.borderColor='var(--wl-primary, rgb(49,90,231))'; e.currentTarget.style.color='var(--wl-primary, rgb(49,90,231))' }}
              onMouseLeave={e => { e.currentTarget.style.background='#F8FAFC'; e.currentTarget.style.borderColor='#E2E8F0'; e.currentTarget.style.color='#475569' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ background:'#fff', border:'1.5px solid #E2E8F0', borderRadius:14, padding:'10px 12px', display:'flex', gap:10, alignItems:'flex-end', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', transition:'border-color 0.15s' }}
        onFocusCapture={e => e.currentTarget.style.borderColor='var(--wl-primary, rgb(49,90,231))'}
        onBlurCapture={e => e.currentTarget.style.borderColor='#E2E8F0'}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Frag mich nach Leads, Deal-Werten, Telefonnummern…"
          rows={1}
          style={{ flex:1, border:'none', outline:'none', resize:'none', fontSize:13, lineHeight:1.5, color:'#0F172A', background:'transparent', fontFamily:'inherit', maxHeight:120, overflowY:'auto' }}
          onInput={e => { e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight, 120)+'px' }}
        />
        <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
          style={{ width:34, height:34, borderRadius:8, border:'none', background: (input.trim() && !loading) ? 'var(--wl-primary, rgb(49,90,231))' : '#E5E7EB', color:'#fff', cursor:(input.trim()&&!loading)?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/></svg>
        </button>
      </div>

      {/* Disclaimer + Neues Gespräch */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
        <div style={{ fontSize:10, color:'#CBD5E1' }}>
          Leadesk Assistent · GPT-4o mini · Nur deine Daten
        </div>
        {messages.length > 1 && (
          <button onClick={() => {
            setMessages([])
            setInput('')
            // Begrüßung neu auslösen
            const pipelineLeads = leads.filter(l => l.deal_stage && l.deal_stage !== 'kein_deal' && l.deal_stage !== 'verloren')
            const totalPipeline = leads.reduce((s, l) => s + (Number(l.deal_value) || 0), 0)
            const hot = leads.filter(l => l.ai_buying_intent === 'hoch').length
            setMessages([{
              role: 'assistant',
              content: `Neues Gespräch gestartet! Ich habe Zugriff auf **${leads.length} Leads**.

📊 **Schnellübersicht:**
• Pipeline-Wert: **${formatCurrency(totalPipeline)}**
• In Pipeline: **${pipelineLeads.length}**
• 🔥 Hot Intent: **${hot} Leads**

Was möchtest du wissen?`
            }])
          }} style={{ fontSize:11, color:'#94A3B8', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
            Neues Gespräch
          </button>
        )}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
