import { useNavigate, useSearchParams } from 'react-router-dom'
import { useResponsive } from '../hooks/useResponsive'
import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ModelSelector, { useDefaultModel } from '../components/ModelSelector'

// ─── Konstanten ───────────────────────────────────────────────────────────────
const P = 'var(--wl-primary, rgb(49,90,231))'
const MSG_TYPES = {
  outreach:      { label: 'Erstkontakt',       icon: '✉️',  hint: 'Erste Nachricht an einen neuen Kontakt' },
  followup:      { label: 'Follow-up',          icon: '🔄',  hint: 'Erinnerung nach ausgebliebener Antwort' },
  reply:         { label: 'Antwort',            icon: '💬',  hint: 'Antwort auf eine erhaltene Nachricht' },
  reactivation:  { label: 'Reaktivierung',      icon: '🔥',  hint: 'Kontakt nach langer Pause wieder aufwärmen' },
  thanks:        { label: 'Dankesnachricht',     icon: '🙏',  hint: 'Nach einem Gespräch oder einem Kauf' },
  value:         { label: 'Mehrwert-Nachricht',  icon: '💡',  hint: 'Relevanten Inhalt oder Tipp teilen' },
}

const TYPE_C  = { outreach:'var(--wl-primary, rgb(49,90,231))', followup:'#10B981', reply:'#8B5CF6', reactivation:'#EF4444', thanks:'#F59E0B', value:'#0891B2', other:'#6B7280' }
const TYPE_BG = { outreach:'rgba(49,90,231,0.08)', followup:'#ECFDF5', reply:'#F5F3FF', reactivation:'#FEF2F2', thanks:'#FFFBEB', value:'#ECFEFF', other:'#F9FAFB' }

// ─── Helper ───────────────────────────────────────────────────────────────────
function fullName(l) {
  return ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'
}

function Stars({ rating, onChange }) {
  const [hov, setHov] = useState(0)
  return (
    <div style={{ display:'flex', gap:2 }} onMouseLeave={() => setHov(0)}>
      {[1,2,3,4,5].map(n => (
        <span key={n}
          onClick={() => onChange && onChange(n === rating ? 0 : n)}
          onMouseEnter={() => setHov(n)}
          style={{ fontSize:16, cursor:onChange?'pointer':'default',
            color:(hov||rating)>=n?'#F59E0B':'#E5E7EB', transition:'color 0.1s', lineHeight:1 }}>
          {(hov||rating)>=n ? '★' : '☆'}
        </span>
      ))}
    </div>
  )
}

// ─── Brand Voice Banner ───────────────────────────────────────────────────────
function BVBanner({ bv, loading }) {
  if (loading) return (
    <div style={{ padding:'10px 16px', borderRadius:10, background:'rgb(238,241,252)', border:'1px solid var(--border)', marginBottom:16, fontSize:12, color:'var(--text-muted)' }}>
      Lade Brand Voice…
    </div>
  )
  if (!bv) return (
    <div style={{ padding:'12px 16px', borderRadius:10, background:'#FFFBEB', border:'1px solid #FDE68A', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ fontSize:18 }}>🎙️</span>
      <div>
        <span style={{ fontSize:13, fontWeight:700, color:'#92400E' }}>Keine Brand Voice aktiv – </span>
        <a href="/brand-voice" style={{ color:P, fontWeight:700, fontSize:13 }}>Jetzt erstellen</a>
      </div>
      <div style={{ marginLeft:'auto', fontSize:11, color:'#B45309' }}>Nachrichten ohne Stil generiert</div>
    </div>
  )
  return (
    <div style={{ padding:'12px 16px', borderRadius:10, background:'#F0FDF4', border:'1px solid #BBF7D0', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ fontSize:18 }}>🎙️</span>
      <div>
        <div style={{ fontSize:13, fontWeight:700, color:'#166534' }}>Brand Voice aktiv: {bv.name}</div>
        <div style={{ fontSize:11, color:'#059669' }}>Alle Nachrichten werden in deiner Brand Voice generiert</div>
      </div>
      <a href="/brand-voice" style={{ marginLeft:'auto', fontSize:11, color:P, fontWeight:600 }}>Bearbeiten →</a>
    </div>
  )
}

// ─── Generator ────────────────────────────────────────────────────────────────
function Generator({ session, bv, onSaved }) {
  const [msgType, setMsgType] = useState('outreach')
  const [leadSearch, setLeadSearch] = useState('')
  const [searchParams] = useSearchParams()
  const [selectedLead, setSelectedLead] = useState(null)
  const [leads, setLeads] = useState([])
  const [showLeads, setShowLeads] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualCompany, setManualCompany] = useState('')
  const [context, setContext] = useState('')
  const [result, setResult] = useState('')
  const [generating, setGenerating] = useState(false)
  const [selectedModel, setSelectedModel] = useDefaultModel(session)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [flash, setFlash] = useState(null)

  // Leads für Auswahl laden
  useEffect(() => {
    supabase.from('leads')
      .select('id,first_name,last_name,name,job_title,headline,company,li_connection_status,connection_status')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setLeads(data || []))
  }, [session.user.id])

  // Lead aus URL-Parameter vorausfüllen (?lead=UUID) — von Vernetzungen-Button
  useEffect(() => {
    const leadId = searchParams.get('lead')
    if (!leadId || leads.length === 0) return
    const found = leads.find(l => l.id === leadId)
    if (found) {
      setSelectedLead(found)
      const n = [found.first_name, found.last_name].filter(Boolean).join(' ') || found.name || ''
      setManualName(n)
      setManualTitle(found.job_title || found.headline || '')
      setManualCompany(found.company || '')
    }
  }, [leads, searchParams])

  const filteredLeads = leads.filter(l => {
    const q = leadSearch.toLowerCase()
    return !q || fullName(l).toLowerCase().includes(q) || (l.company||'').toLowerCase().includes(q)
  }).slice(0, 8)

  function selectLead(lead) {
    setSelectedLead(lead)
    setManualName(fullName(lead))
    setManualTitle(lead.job_title || lead.headline || '')
    setManualCompany(lead.company || '')
    setLeadSearch(fullName(lead))
    setShowLeads(false)
  }

  function showFlash(msg, type = 'success') {
    setFlash({ msg, type }); setTimeout(() => setFlash(null), 4000)
  }

  function buildPrompt() {
    const name    = manualName    || 'diese Person'
    const title   = manualTitle   || ''
    const company = manualCompany || ''
    const typeInfo = MSG_TYPES[msgType] || MSG_TYPES.outreach

    const parts = [
      `Schreibe eine LinkedIn-${typeInfo.label} an: ${name}`,
      title   ? `Position: ${title}`   : '',
      company ? `Unternehmen: ${company}` : '',
      '',
      `Nachrichtentyp: ${typeInfo.label}`,
      context ? `Kontext / Anlass: ${context}` : '',
      '',
      'Anforderungen:',
      '- Max. 300 Zeichen (LinkedIn-Limit)',
      '- Persönlich und authentisch, kein generischer KI-Ton',
      '- Direkt auf den Punkt kommen',
      '- Keine Floskeln wie "Ich hoffe diese Nachricht erreicht dich gut"',
      '- Klarer Gesprächsöffner oder CTA',
      '',
      'Gib nur den fertigen Nachrichtentext aus, ohne Erklärung oder Anführungszeichen.',
    ].filter(Boolean).join('\n')

    return parts
  }

  async function generate() {
    if (!manualName.trim()) { showFlash('Bitte Empfänger eingeben oder Lead auswählen.', 'error'); return }
    setGenerating(true); setResult('')
    try {
      const { data: d } = await supabase.functions.invoke('generate', { body: { type: 'linkedin_message_' + msgType, prompt: buildPrompt(), model: selectedModel } })
      const text = (d && (d.text || d.comment || d.about)) || ''
      if (text) { setResult(text.trim()) }
      else showFlash('KI-Fehler: ' + (d.error || 'Unbekannt'), 'error')
    } catch(e) { showFlash('Fehler: ' + e.message, 'error') }
    setGenerating(false)
  }

  async function save() {
    if (!result.trim()) return
    setSaving(true)
    const { error } = await supabase.from('linkedin_messages').insert({
      user_id: session.user.id,
      recipient_name: manualName.trim(),
      recipient_title: manualTitle.trim() || null,
      recipient_company: manualCompany.trim() || null,
      recipient_linkedin_url: selectedLead?.linkedin_url || null,
      message_text: result.trim(),
      message_type: msgType,
      rating: 0,
      sent_at: new Date().toISOString(),
      notes: context || null,
    })
    setSaving(false)
    if (error) { showFlash('Fehler: ' + error.message, 'error'); return }
    showFlash('Nachricht gespeichert!')
    onSaved()
    setResult(''); setContext(''); setSelectedLead(null)
    setLeadSearch(''); setManualName(''); setManualTitle(''); setManualCompany('')
  }

  async function copy() {
    await navigator.clipboard.writeText(result)
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  const charCount = result.length
  const charOver = charCount > 300

  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ background:'var(--surface)', borderRadius:18, border:'1px solid var(--border)', overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.05)', marginBottom:20 }}>
      {/* Header */}
      <div style={{ padding:'16px 22px', borderBottom:'1px solid #F1F5F9', background:'linear-gradient(135deg, rgb(49,90,231), rgb(119,161,243))', color:'white' }}>
        <div style={{ fontWeight:800, fontSize:16 }}>✨ Nachricht generieren</div>
        <div style={{ fontSize:12, opacity:0.85, marginTop:2 }}>KI schreibt in deiner Brand Voice – du bearbeitest und sendest</div>
      </div>

      <div style={{ padding:'20px 22px' }}>
        {flash && (
          <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:9, fontSize:13, fontWeight:600,
            background:flash.type==='error'?'#FEF2F2':'#F0FDF4',
            color:flash.type==='error'?'#991B1B':'#166534',
            border:'1px solid '+(flash.type==='error'?'#FCA5A5':'#BBF7D0') }}>
            {flash.msg}
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          {/* Linke Spalte: Empfänger + Typ + Kontext */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Nachrichtentyp */}
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8 }}>Nachrichtentyp</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7 }}>
                {Object.entries(MSG_TYPES).map(([key, cfg]) => (
                  <button key={key} onClick={() => setMsgType(key)} style={{
                    padding:'8px 10px', borderRadius:9, textAlign:'left', cursor:'pointer', fontSize:12,
                    border: msgType===key ? '2px solid '+P : '1.5px solid #E2E8F0',
                    background: msgType===key ? 'rgba(49,90,231,0.08)' : '#fff',
                    color: msgType===key ? P : 'rgb(20,20,43)'
                  }}>
                    <div>{cfg.icon} {cfg.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Lead-Suche */}
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>Empfänger</label>
              <div style={{ position:'relative' }}>
                <input
                  value={leadSearch}
                  onChange={e => { setLeadSearch(e.target.value); setShowLeads(true); setSelectedLead(null); setManualName(e.target.value) }}
                  onFocus={() => setShowLeads(true)}
                  placeholder="Lead suchen oder Name eingeben…"
                  style={inp}
                />
                {showLeads && leadSearch && filteredLeads.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:99, background:'var(--surface)', border:'1.5px solid #E2E8F0', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', marginTop:4, maxHeight:220, overflowY:'auto' }}>
                    {filteredLeads.map(l => (
                      <div key={l.id} onClick={() => selectLead(l)}
                        style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #F9FAFB', display:'flex', alignItems:'center', gap:10 }}
                        onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                        onMouseLeave={e => e.currentTarget.style.background='white'}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background:P, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:12, fontWeight:700, flexShrink:0 }}>
                          {fullName(l).charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)' }}>{fullName(l)}</div>
                          <div style={{ fontSize:11, color:'var(--text-muted)' }}>{l.job_title||l.headline||''}{l.company?' · '+l.company:''}</div>
                        </div>
                      </div>
                    ))}
                    <div onClick={() => { setManualName(leadSearch); setShowLeads(false) }}
                      style={{ padding:'9px 14px', cursor:'pointer', fontSize:12, color:'var(--text-muted)', background:'var(--surface-muted)', borderTop:'1px solid #F1F5F9' }}>
                      „{leadSearch}" manuell verwenden
                    </div>
                  </div>
                )}
              </div>
              {selectedLead && (
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6, padding:'6px 10px', background:'rgba(49,90,231,0.05)', borderRadius:8, border:'1px solid rgba(49,90,231,0.15)' }}>
                  <span style={{ fontSize:12, color:'var(--text-muted)', flex:1 }}>✓ {fullName(selectedLead)} ausgewählt</span>
                  <button onClick={() => navigate(`/leads/${selectedLead.id}`)}
                    style={{ padding:'3px 10px', borderRadius:6, border:'1px solid rgba(49,90,231,0.3)', background:'rgba(49,90,231,0.08)', color:'var(--wl-primary, rgb(49,90,231))', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                    ↗ Profil
                  </button>
                </div>
              )}
            </div>

            {/* Position + Firma (auto-befüllt oder manuell) */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>Position</label>
                <input value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Head of Sales…" style={inp}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>Unternehmen</label>
                <input value={manualCompany} onChange={e => setManualCompany(e.target.value)} placeholder="Acme GmbH…" style={inp}/>
              </div>
            </div>

            {/* Kontext */}
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>
                Kontext / Anlass <span style={{ color:'var(--text-muted)', fontWeight:400 }}>(optional)</span>
              </label>
              <textarea value={context} onChange={e => setContext(e.target.value)} rows={3}
                placeholder={msgType==='followup'
                  ? 'z.B. Hatte vor 1 Woche Nachricht gesendet, keine Antwort…'
                  : msgType==='value'
                  ? 'z.B. Artikel zu LinkedIn-Algorithmus, passt zu deren Fokus…'
                  : 'z.B. Haben uns auf der SaaStr Konferenz kurz gesprochen…'}
                style={{ ...inp, resize:'vertical', lineHeight:1.6 }}/>
            </div>

            <div style={{ marginBottom:8 }}><ModelSelector model={selectedModel} onChange={setSelectedModel} size="small" disabled={generating}/></div>
            <button onClick={generate} disabled={generating} style={{
              padding:'12px', borderRadius:999, border:'none', fontSize:14, fontWeight:700, cursor:generating?'not-allowed':'pointer',
              background:generating ? '#94A3B8' : 'linear-gradient(135deg, rgb(49,90,231), #8B5CF6)',
              color:'white', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              boxShadow:generating?'none':'0 4px 14px rgba(49,90,231,0.35)'
            }}>
              {generating ? '⏳ Generiere…' : '✨ Nachricht generieren'}
            </button>
          </div>

          {/* Rechte Spalte: Ergebnis */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em' }}>Generierter Text</label>
              {result && (
                <span style={{ fontSize:12, fontWeight:700, color: charOver ? '#EF4444' : '#10B981' }}>
                  {charCount} / 300 Zeichen
                </span>
              )}
            </div>
            <textarea value={result} onChange={e => setResult(e.target.value)} rows={9}
              placeholder={generating ? 'Wird generiert…' : 'Hier erscheint die KI-generierte Nachricht. Du kannst sie danach bearbeiten.'}
              style={{ ...inp, resize:'vertical', lineHeight:1.7, minHeight:180, fontSize:14,
                border: charOver ? '1.5px solid #EF4444' : '1.5px solid #E2E8F0',
                color: result ? 'rgb(20,20,43)' : '#94A3B8' }}/>

            {charOver && (
              <div style={{ padding:'8px 12px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FCA5A5', fontSize:12, color:'#991B1B', fontWeight:600 }}>
                {charCount - 300} Zeichen zu lang — bitte kürzen
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={generate} disabled={generating || !result} style={{
                flex:1, padding:'10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)',
                color:'#475569', fontSize:12, fontWeight:600, cursor:'pointer'
              }}>🔄 Neu generieren</button>
              <button onClick={copy} disabled={!result} style={{
                flex:1, padding:'10px', borderRadius:10, border:'1px solid '+(copied?'#BBF7D0':'#E2E8F0'),
                background:copied?'#F0FDF4':'white', color:copied?'#166534':'#475569',
                fontSize:12, fontWeight:600, cursor:'pointer'
              }}>{copied ? '✓ Kopiert!' : '📋 Kopieren'}</button>
              <button onClick={save} disabled={saving || !result || charOver} style={{
                flex:2, padding:'10px', borderRadius:10, border:'none',
                background: (!result||charOver) ? '#E5E7EB' : 'var(--wl-primary, rgb(49,90,231))',
                color: (!result||charOver) ? '#94A3B8' : 'white',
                fontSize:12, fontWeight:700, cursor:(!result||charOver)?'default':'pointer'
              }}>{saving ? '⏳ Speichert…' : '💾 Speichern & Archivieren'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Archiv ───────────────────────────────────────────────────────────────────
function Archiv({ session, reload }) {
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [filterTyp, setFilterTyp] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('linkedin_messages').select('*')
      .eq('user_id', session.user.id).order('sent_at', { ascending: false }).limit(200)
    setMsgs(data || [])
    if (data?.length > 0 && !selected) setSelected(data[0])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load, reload])

  async function handleRate(id, rating) {
    setMsgs(ms => ms.map(m => m.id===id ? {...m, rating} : m))
    if (selected?.id===id) setSelected(s => ({...s, rating}))
    await supabase.from('linkedin_messages').update({ rating }).eq('id', id)
  }

  async function handleDelete(id) {
    if (!confirm('Löschen?')) return
    await supabase.from('linkedin_messages').delete().eq('id', id)
    setMsgs(ms => ms.filter(m => m.id!==id))
    if (selected?.id===id) setSelected(null)
  }

  const filtered = msgs.filter(m => {
    if (filterTyp && m.message_type !== filterTyp) return false
    if (search) {
      const q = search.toLowerCase()
      return (m.recipient_name||'').toLowerCase().includes(q) ||
             (m.recipient_company||'').toLowerCase().includes(q) ||
             (m.message_text||'').toLowerCase().includes(q)
    }
    return true
  })

  const avgRat = msgs.filter(m=>m.rating>0).length
    ? (msgs.filter(m=>m.rating>0).reduce((s,m)=>s+m.rating,0)/msgs.filter(m=>m.rating>0).length).toFixed(1) : '-'

  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }

  if (loading) return <div style={{ textAlign:'center', padding:48, color:'var(--text-muted)' }}>Lade Archiv…</div>

  return (
    <div>
      {/* KPI Row */}
      {msgs.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
          {[
            ['Gesamt', msgs.length, 'Nachrichten archiviert', P],
            ['Bewertung', avgRat+'★', 'Durchschnitt', '#F59E0B'],
            ['Top-Nachrichten', msgs.filter(m=>m.rating>=4).length, 'mit 4-5 Sternen', '#10B981'],
          ].map(([l,v,s,c]) => (
            <div key={l} style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', padding:'14px 18px', borderTop:'3px solid '+c }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{l}</div>
              <div style={{ fontSize:26, fontWeight:900, color:c, lineHeight:1 }}>{v}</div>
              <div style={{ fontSize:11, color:'#9CA3AF', marginTop:3 }}>{s}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ flex:1, minWidth:180, position:'relative' }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', fontSize:14 }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,paddingLeft:34}} placeholder="Suchen…"/>
        </div>
        <select value={filterTyp} onChange={e=>setFilterTyp(e.target.value)} style={{...inp,width:'auto',cursor:'pointer'}}>
          <option value="">Alle Typen</option>
          {Object.entries(MSG_TYPES).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <button onClick={() => {
          const rows = [['Empfänger','Unternehmen','Typ','Betreff','Bewertung','Datum','Nachricht']]
          filtered.forEach(m => rows.push([
            m.recipient_name||'', m.recipient_company||'', m.message_type||'',
            m.subject||'', m.rating||'', m.sent_at?new Date(m.sent_at).toLocaleDateString('de-DE'):'',
            (m.message_text||'').replace(/\n/g,' ').substring(0,200)
          ]))
          const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
          const a = document.createElement('a')
          a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv)
          a.download=`nachrichten-${new Date().toISOString().substring(0,10)}.csv`; a.click()
        }} style={{ padding:'9px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', background:'var(--surface-muted)', color:'#475569', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
          ⬇ CSV ({filtered.length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, background:'var(--surface)', borderRadius:18, border:'1px solid var(--border)' }}>
          <div style={{ fontSize:40, marginBottom:10 }}>✉️</div>
          <div style={{ fontWeight:800, fontSize:16, color:'rgb(20,20,43)', marginBottom:6 }}>{msgs.length===0?'Noch keine Nachrichten':'Keine Treffer'}</div>
          <div style={{ fontSize:13, color:'var(--text-muted)' }}>{msgs.length===0?'Generiere und speichere deine erste Nachricht oben.':'Andere Suchbegriffe versuchen.'}</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:14, height:480 }}>
          {/* Liste */}
          <div style={{ background:'var(--surface)', borderRadius:18, border:'1px solid var(--border)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid #F3F4F6', fontSize:12, color:'#9CA3AF', fontWeight:600 }}>{filtered.length} Nachricht{filtered.length!==1?'en':''}</div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {filtered.map(m => {
                const typCfg = MSG_TYPES[m.message_type] || { label: m.message_type, icon: '✉️' }
                return (
                  <div key={m.id} onClick={() => setSelected(m)} style={{
                    padding:'12px 14px', borderBottom:'1px solid #F9FAFB', cursor:'pointer',
                    background:selected?.id===m.id?'#F5F7FF':'transparent',
                    borderLeft:selected?.id===m.id?'3px solid '+P:'3px solid transparent', transition:'all 0.15s'
                  }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:160 }}>{m.recipient_name}</div>
                      <div style={{ fontSize:10, color:'#9CA3AF', flexShrink:0 }}>{new Date(m.sent_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}</div>
                    </div>
                    {m.recipient_company && <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.recipient_company}</div>}
                    <div style={{ fontSize:11, color:'#9CA3AF', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:5 }}>{m.message_text.substring(0,60)}…</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:10, padding:'2px 7px', borderRadius:5, background:TYPE_BG[m.message_type]||'#F9FAFB', color:TYPE_C[m.message_type]||'#6B7280', fontWeight:600 }}>
                        {typCfg.icon} {typCfg.label}
                      </span>
                      <Stars rating={m.rating||0} onChange={r=>handleRate(m.id,r)}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Detail */}
          <div style={{ background:'var(--surface)', borderRadius:18, border:'1px solid var(--border)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            {selected ? (
              <>
                <div style={{ padding:'18px 22px', borderBottom:'1px solid #F3F4F6', background:'linear-gradient(135deg, rgb(49,90,231), rgb(119,161,243))', color:'white' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontSize:18, fontWeight:800 }}>{selected.recipient_name}</div>
                      <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:2 }}>
                        {[selected.recipient_title, selected.recipient_company].filter(Boolean).join(' bei ')}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => navigator.clipboard.writeText(selected.message_text)} style={{ padding:'5px 12px', borderRadius:8, background:'rgba(255,255,255,0.2)', border:'none', cursor:'pointer', color:'white', fontSize:11, fontWeight:600 }}>📋 Kopieren</button>
                      <button onClick={() => handleDelete(selected.id)} style={{ background:'rgba(255,255,255,0.15)', border:'none', cursor:'pointer', color:'white', padding:'5px 8px', borderRadius:8, fontSize:11 }}>🗑</button>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10 }}>
                    <span style={{ fontSize:10, padding:'3px 8px', borderRadius:5, background:'rgba(255,255,255,0.2)', fontWeight:600 }}>
                      {(MSG_TYPES[selected.message_type]||{}).icon} {(MSG_TYPES[selected.message_type]||{label:selected.message_type}).label}
                    </span>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>{new Date(selected.sent_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})}</span>
                    <Stars rating={selected.rating||0} onChange={r=>handleRate(selected.id,r)}/>
                  </div>
                </div>
                <div style={{ flex:1, overflowY:'auto', padding:22, display:'flex', flexDirection:'column', gap:14 }}>
                  <div style={{ background:'#F8F9FF', borderRadius:14, padding:'18px 20px', fontSize:14, color:'rgb(20,20,43)', lineHeight:1.75, whiteSpace:'pre-wrap', wordBreak:'break-word', border:'1px solid rgba(49,90,231,0.08)' }}>
                    {selected.message_text}
                  </div>
                  {selected.notes && (
                    <div style={{ background:'#FFFBEB', borderRadius:12, padding:'12px 16px', border:'1px solid #FDE68A' }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#B45309', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Kontext</div>
                      <div style={{ fontSize:13, color:'#92400E' }}>{selected.notes}</div>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {[
                      ['Zeichen', selected.message_text.length],
                      ['Bewertung', selected.rating>0?selected.rating+'/5':'–'],
                    ].map(([l,v]) => (
                      <div key={l} style={{ background:'var(--surface)', borderRadius:10, padding:'10px 14px', border:'1px solid var(--border)', fontSize:12 }}>
                        <div style={{ color:'#9CA3AF', marginBottom:2 }}>{l}</div>
                        <div style={{ fontWeight:700, color:'rgb(20,20,43)' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'#9CA3AF' }}>
                <div style={{ fontSize:40 }}>✉️</div>
                <div style={{ fontSize:14, fontWeight:600 }}>Nachricht auswählen</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Messages({ session }) {
  const { isMobile } = useResponsive()
  const [bv, setBv] = useState(null)
  const [bvLoading, setBvLoading] = useState(true)
  const [archivReload, setArchivReload] = useState(0)

  useEffect(() => {
    supabase.from('brand_voices').select('*').eq('user_id', session.user.id).eq('is_active', true).maybeSingle()
      .then(({ data }) => { setBv(data || null); setBvLoading(false) })
  }, [session.user.id])

  return (
    <div style={{ maxWidth:1100 }}>
      <BVBanner bv={bv} loading={bvLoading}/>
      <Generator session={session} bv={bv} onSaved={() => setArchivReload(r => r+1)}/>
      <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)', marginBottom:14 }}>📁 Archiv</div>
      <Archiv session={session} reload={archivReload}/>
    </div>
  )
}
