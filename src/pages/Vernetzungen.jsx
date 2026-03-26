import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ── Status Konfiguration ── */
const STATUS_CONFIG = {
  draft:       { label:'Entwurf',       color:'#64748B', bg:'#F1F5F9', icon:'📝' },
  sent:        { label:'Gesendet',      color:'#0A66C2', bg:'#EFF6FF', icon:'📤' },
  accepted:    { label:'Angenommen',    color:'#065F46', bg:'#ECFDF5', icon:'✅' },
  declined:    { label:'Abgelehnt',     color:'#991B1B', bg:'#FEF2F2', icon:'❌' },
  no_response: { label:'Keine Antwort', color:'#92400E', bg:'#FFFBEB', icon:'⏳' },
}

/* ── Icons ── */
const LiIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
const CopyIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const SparkIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
const PlusIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const XIcon    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const EditIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const StarIcon = ({ filled }) => <svg width="16" height="16" viewBox="0 0 24 24" fill={filled?"#F59E0B":"none"} stroke="#F59E0B" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>

/* ── Avatar ── */
function Avatar({ name, url, size=40 }) {
  const colors=['#0A66C2','#10B981','#F59E0B','#8B5CF6','#EC4899']
  const bg=colors[(name||'?').charCodeAt(0)%colors.length]
  const initials=(name||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().substring(0,2)
  if(url) return <img src={url} alt={name} style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>
  return <div style={{width:size,height:size,borderRadius:'50%',background:'linear-gradient(135deg,'+bg+','+bg+'BB)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.35,fontWeight:800,color:'#fff',flexShrink:0}}>{initials}</div>
}

/* ── Import-Panel (LinkedIn Profil einlesen) ── */
function ImportPanel({ onImport, onClose }) {
  const [mode, setMode] = useState('manual') // 'manual' | 'paste'
  const [form, setForm] = useState({ li_name:'', li_headline:'', li_company:'', li_position:'', li_location:'', li_about:'', li_url:'', li_skills:'' })
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState(false)

  async function parseFromText() {
    if (!pasteText.trim()) return
    setParsing(true)
    // Simple parsing: try to extract name from first line, etc.
    const lines = pasteText.split('\n').map(l=>l.trim()).filter(Boolean)
    const parsed = {
      li_name: lines[0] || '',
      li_headline: lines[1] || '',
      li_company: '',
      li_position: '',
      li_location: '',
      li_about: pasteText,
      li_url: (pasteText.match(/linkedin\.com\/in\/[\w-]+/) || [''])[0] ? 'https://www.' + pasteText.match(/linkedin\.com\/in\/[\w-]+/)[0] : '',
      li_skills: '',
    }
    // Try to find location (often has city, country pattern)
    const locMatch = pasteText.match(/([A-Z][a-zäöü]+(?:,\s*[A-Z][a-zäöü]+)+)/)
    if (locMatch) parsed.li_location = locMatch[1]
    setForm(parsed)
    setMode('manual')
    setParsing(false)
  }

  function handleSubmit() {
    if (!form.li_name) return
    onImport({
      ...form,
      li_skills: form.li_skills ? form.li_skills.split(',').map(s=>s.trim()).filter(Boolean) : []
    })
  }

  const inp = { width:'100%', padding:'8px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', background:'#FAFAFA', boxSizing:'border-box' }
  const lbl = { fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:4 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, width:560, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto', boxShadow:'0 24px 64px rgba(15,23,42,0.18)' }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:'#0F172A', display:'flex', alignItems:'center', gap:8 }}><LiIcon/> LinkedIn Profil importieren</div>
            <div style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>Profildaten der Zielperson eingeben oder einfügen</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8' }}><XIcon/></button>
        </div>

        {/* Mode Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid #E2E8F0', padding:'0 24px' }}>
          {[['manual','Manuell eingeben'],['paste','Profil einfügen']].map(([m,lbl2])=>(
            <button key={m} onClick={()=>setMode(m)} style={{ padding:'10px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:mode===m?700:500, color:mode===m?'#0A66C2':'#64748B', borderBottom:mode===m?'2px solid #0A66C2':'2px solid transparent' }}>{lbl2}</button>
          ))}
        </div>

        <div style={{ padding:'20px 24px' }}>
          {mode === 'paste' ? (
            <div>
              <label style={lbl}>LinkedIn Profil-Text einfügen</label>
              <div style={{ fontSize:12, color:'#94A3B8', marginBottom:8 }}>
                📋 Gehe auf das LinkedIn Profil → alles markieren (Strg+A) → kopieren → hier einfügen
              </div>
              <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)} rows={8}
                placeholder="Name der Person&#10;Position bei Unternehmen&#10;Standort&#10;&#10;Über mich:&#10;..."
                style={{ ...inp, resize:'vertical', lineHeight:1.5 }}/>
              <button onClick={parseFromText} disabled={parsing || !pasteText.trim()}
                style={{ marginTop:12, width:'100%', padding:'10px', borderRadius:8, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:!pasteText.trim()?0.5:1 }}>
                {parsing ? '⏳ Verarbeite...' : '🔍 Profil analysieren'}
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Extension Hinweis */}
              <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:10, padding:'12px 14px', display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:20 }}>🔌</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0369A1' }}>LinkedIn Extension aktiv?</div>
                  <div style={{ fontSize:11, color:'#0284C7', marginTop:2 }}>
                    Wenn du die Lead Radar Extension im Chrome installiert hast und auf einem LinkedIn Profil bist, werden die Felder automatisch befüllt. Sonst fülle sie manuell aus.
                  </div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><label style={lbl}>Name *</label><input value={form.li_name} onChange={e=>setForm(f=>({...f,li_name:e.target.value}))} style={inp} placeholder="Max Mustermann"/></div>
                <div><label style={lbl}>Unternehmen</label><input value={form.li_company} onChange={e=>setForm(f=>({...f,li_company:e.target.value}))} style={inp} placeholder="ACME GmbH"/></div>
              </div>
              <div><label style={lbl}>Position / Headline</label><input value={form.li_headline} onChange={e=>setForm(f=>({...f,li_headline:e.target.value}))} style={inp} placeholder="CEO | Founder | Sales Manager"/></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><label style={lbl}>Standort</label><input value={form.li_location} onChange={e=>setForm(f=>({...f,li_location:e.target.value}))} style={inp} placeholder="Berlin, Deutschland"/></div>
                <div><label style={lbl}>LinkedIn URL</label><input value={form.li_url} onChange={e=>setForm(f=>({...f,li_url:e.target.value}))} style={inp} placeholder="linkedin.com/in/..."/></div>
              </div>
              <div><label style={lbl}>Über mich / Bio</label><textarea value={form.li_about} onChange={e=>setForm(f=>({...f,li_about:e.target.value}))} rows={3} style={{ ...inp, resize:'vertical', lineHeight:1.5 }} placeholder="Beschreibung aus dem LinkedIn Profil..."/></div>
              <div><label style={lbl}>Skills (kommagetrennt)</label><input value={form.li_skills} onChange={e=>setForm(f=>({...f,li_skills:e.target.value}))} style={inp} placeholder="Sales, B2B, LinkedIn, Marketing"/></div>
            </div>
          )}
        </div>

        {mode === 'manual' && (
          <div style={{ padding:'12px 24px 20px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ padding:'8px 18px', borderRadius:8, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            <button onClick={handleSubmit} disabled={!form.li_name} style={{ padding:'8px 22px', borderRadius:8, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:!form.li_name?0.5:1 }}>
              Profil übernehmen →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Detail / Edit Modal ── */
function VernetzungModal({ item, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ ...item })
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('msg') // 'msg' | 'tracking'

  const cfg = STATUS_CONFIG[form.status] || STATUS_CONFIG.draft

  async function generate() {
    setGenerating(true)
    try {
      // OpenAI GPT direkt aufrufen — kein Server-Proxy nötig
      const openaiKey = import.meta.env.VITE_OPENAI_API_KEY
      if (!openaiKey) throw new Error('VITE_OPENAI_API_KEY fehlt — bitte in Vercel Environment Variables eintragen')

      const skillsStr = Array.isArray(form.li_skills) ? form.li_skills.join(', ') : (form.li_skills || '')
      const prompt = [
        'Du bist ein LinkedIn-Experte für professionelles Networking auf Deutsch.',
        '',
        'Generiere eine persönliche LinkedIn Vernetzungsanfrage-Nachricht (max. 300 Zeichen) für folgende Zielperson:',
        '',
        'Name: ' + form.li_name,
        'Position: ' + (form.li_headline || 'unbekannt'),
        'Unternehmen: ' + (form.li_company || 'unbekannt'),
        'Standort: ' + (form.li_location || 'unbekannt'),
        'Über sich: ' + String(form.li_about || 'keine Angaben').substring(0, 300),
        'Skills: ' + (skillsStr || 'keine'),
        form.context_notes ? ('Kontext: ' + form.context_notes) : '',
        '',
        'Regeln:',
        '- Persönlich und authentisch, kein generisches "Ich würde mich gerne vernetzen"',
        '- Konkreter Bezug auf etwas Spezifisches aus dem Profil',
        '- Professionell aber warm',
        '- Nur Deutsch',
        '- Maximal 300 Zeichen',
        '- Nur die fertige Nachricht, kein Kommentar drumherum',
      ].filter(Boolean).join('\n')

      const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + openaiKey,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 200,
          messages: [
            { role: 'system', content: 'Du generierst kurze, persönliche LinkedIn Vernetzungsnachrichten auf Deutsch.' },
            { role: 'user', content: prompt }
          ],
        })
      })
      if (!apiRes.ok) {
        const errData = await apiRes.json()
        throw new Error('OpenAI Fehler: ' + (errData.error?.message || apiRes.status))
      }
      const apiData = await apiRes.json()
      const msg = apiData.choices?.[0]?.message?.content?.trim() || ''
      setForm(f=>({...f, generated_msg: msg, final_msg: msg}))
    } catch(e) {
      console.error(e)
      // Fehler als Nachricht anzeigen damit User informiert wird
      const errMsg = e.message || 'Unbekannter Fehler'
      if (errMsg.includes('quota') || errMsg.includes('billing')) {
        setForm(f=>({...f, generated_msg:'⚠️ OpenAI Guthaben aufgebraucht. Bitte unter platform.openai.com/settings/billing aufladen.'}))
      } else if (errMsg.includes('API_KEY') || errMsg.includes('Unauthorized') || errMsg.includes('401')) {
        setForm(f=>({...f, generated_msg:'⚠️ OpenAI API Key ungültig. Bitte in Vercel Environment Variables prüfen.'}))
      } else {
        setForm(f=>({...f, generated_msg:'⚠️ Fehler: ' + errMsg}))
      }
    }
    setGenerating(false)
  }

  function copyMsg() {
    navigator.clipboard.writeText(form.final_msg || form.generated_msg || '')
    setCopied(true)
    setTimeout(()=>setCopied(false), 2000)
  }

  const inp = { width:'100%', padding:'8px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', background:'#FAFAFA', boxSizing:'border-box' }
  const lbl = { fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:4 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, width:600, maxWidth:'95vw', maxHeight:'92vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(15,23,42,0.18)' }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#0A66C2,#0A66C299)', padding:'18px 22px 14px', flexShrink:0 }}>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            <Avatar name={form.li_name} url={form.li_avatar_url} size={48}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:800, fontSize:16, color:'#fff' }}>{form.li_name}</div>
              {form.li_headline && <div style={{ fontSize:12, color:'rgba(255,255,255,0.85)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{form.li_headline}</div>}
              {form.li_company && <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', fontWeight:600, marginTop:1 }}>{form.li_company}</div>}
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {form.li_url && <a href={form.li_url.startsWith('http')?form.li_url:'https://'+form.li_url} target="_blank" rel="noreferrer" style={{ padding:'4px 10px', borderRadius:999, background:'rgba(255,255,255,0.2)', color:'#fff', fontSize:11, fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}><LiIcon/> Profil</a>}
              <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, width:28, height:28, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}><XIcon/></button>
            </div>
          </div>
          {/* Status Pills */}
          <div style={{ display:'flex', gap:6, marginTop:12, flexWrap:'wrap' }}>
            {Object.entries(STATUS_CONFIG).map(([s,c])=>(
              <button key={s} onClick={()=>setForm(f=>({...f,status:s}))}
                style={{ padding:'3px 10px', borderRadius:999, fontSize:10, fontWeight:700, border:'1.5px solid '+(form.status===s?'rgba(255,255,255,0.8)':'rgba(255,255,255,0.3)'), background:form.status===s?'rgba(255,255,255,0.25)':'transparent', color:'#fff', cursor:'pointer' }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid #E2E8F0', flexShrink:0 }}>
          {[['msg','💬 Nachricht'],['tracking','📊 Tracking']].map(([t,lbl2])=>(
            <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:'10px', border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:tab===t?700:500, color:tab===t?'#0A66C2':'#64748B', borderBottom:tab===t?'2px solid #0A66C2':'2px solid transparent' }}>{lbl2}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>

          {tab === 'msg' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Profil-Info */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, background:'#F8FAFC', borderRadius:10, padding:'12px 14px' }}>
                {[['Standort',form.li_location],['Skills', Array.isArray(form.li_skills)?form.li_skills.join(', '):(form.li_skills||'')]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k}><div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>{k}</div><div style={{ fontSize:12, color:'#475569' }}>{v}</div></div>
                ))}
              </div>

              {/* Kontext-Notizen */}
              <div>
                <label style={lbl}>Kontext für KI (optional)</label>
                <input value={form.context_notes||''} onChange={e=>setForm(f=>({...f,context_notes:e.target.value}))} style={inp} placeholder="z.B. Wir haben uns auf der DMEXCO getroffen, gemeinsames Interesse an AI..."/>
              </div>

              {/* KI-Generierung */}
              <button onClick={generate} disabled={generating}
                style={{ width:'100%', padding:'11px', borderRadius:999, border:'none', background:'linear-gradient(135deg,#0A66C2,#8B5CF6)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:generating?0.7:1 }}>
                {generating ? '⏳ Generiere...' : <><SparkIcon/> KI-Nachricht generieren</>}
              </button>

              {/* Generierte / Finale Nachricht */}
              {(form.generated_msg || form.final_msg) && (
                <div>
                  <label style={lbl}>Vernetzungsnachricht</label>
                  <div style={{ position:'relative' }}>
                    <textarea value={form.final_msg||form.generated_msg||''} onChange={e=>setForm(f=>({...f,final_msg:e.target.value}))} rows={5}
                      style={{ ...inp, resize:'vertical', lineHeight:1.6, paddingRight:40 }}/>
                    <button onClick={copyMsg} title="Kopieren"
                      style={{ position:'absolute', top:8, right:8, background:copied?'#ECFDF5':'#F1F5F9', border:'1px solid '+(copied?'#A7F3D0':'#E2E8F0'), borderRadius:6, width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:copied?'#065F46':'#64748B' }}>
                      {copied ? '✓' : <CopyIcon/>}
                    </button>
                  </div>
                  <div style={{ fontSize:11, color: (form.final_msg||form.generated_msg||'').length > 300 ? '#EF4444' : '#94A3B8', marginTop:4, textAlign:'right' }}>
                    {(form.final_msg||form.generated_msg||'').length} / 300 Zeichen
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'tracking' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Datum */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><label style={lbl}>Gesendet am</label><input type="date" value={form.sent_at?(new Date(form.sent_at)).toISOString().split('T')[0]:''} onChange={e=>setForm(f=>({...f,sent_at:e.target.value?new Date(e.target.value).toISOString():null}))} style={inp}/></div>
                <div><label style={lbl}>Antwort am</label><input type="date" value={form.responded_at?(new Date(form.responded_at)).toISOString().split('T')[0]:''} onChange={e=>setForm(f=>({...f,responded_at:e.target.value?new Date(e.target.value).toISOString():null}))} style={inp}/></div>
              </div>

              {/* Bewertung */}
              <div>
                <label style={lbl}>Nachricht-Qualität bewerten</label>
                <div style={{ display:'flex', gap:6, marginTop:4 }}>
                  {[1,2,3,4,5].map(n=>(
                    <button key={n} onClick={()=>setForm(f=>({...f,rating:n}))}
                      style={{ background:'none', border:'none', cursor:'pointer', padding:'2px' }}>
                      <StarIcon filled={(form.rating||0)>=n}/>
                    </button>
                  ))}
                  {form.rating && <span style={{ fontSize:12, color:'#F59E0B', fontWeight:600, marginLeft:4 }}>{['','Schlecht','Mäßig','Gut','Sehr gut','Ausgezeichnet'][form.rating]}</span>}
                </div>
              </div>

              {/* Ergebnis-Notizen */}
              <div>
                <label style={lbl}>Ergebnis / Notizen</label>
                <textarea value={form.outcome_notes||''} onChange={e=>setForm(f=>({...f,outcome_notes:e.target.value}))} rows={4}
                  style={{ ...inp, resize:'vertical', lineHeight:1.5 }} placeholder="Hat die Vernetzung funktioniert? Was war der nächste Schritt?..."/>
              </div>

              {/* Status-Karte */}
              <div style={{ background:cfg.bg, borderRadius:10, padding:'12px 14px', border:'1px solid '+cfg.color+'44' }}>
                <div style={{ fontSize:12, fontWeight:700, color:cfg.color }}>{cfg.icon} Status: {cfg.label}</div>
                {form.sent_at && <div style={{ fontSize:11, color:cfg.color, marginTop:4, opacity:0.8 }}>Gesendet: {new Date(form.sent_at).toLocaleDateString('de-DE')}</div>}
                {form.responded_at && <div style={{ fontSize:11, color:cfg.color, opacity:0.8 }}>Antwort: {new Date(form.responded_at).toLocaleDateString('de-DE')}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 22px 16px', borderTop:'1px solid #F1F5F9', display:'flex', justifyContent:'space-between', flexShrink:0, background:'#FAFAFA' }}>
          <button onClick={()=>{ if(window.confirm('Vernetzung löschen?')) onDelete(item.id) }}
            style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#EF4444', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            Löschen
          </button>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:12, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            <button onClick={()=>onSave(form)} style={{ padding:'7px 20px', borderRadius:8, border:'none', background:'#0A66C2', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>✓ Speichern</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   HAUPTSEITE VERNETZUNGEN
══════════════════════════════════════════ */
export default function Vernetzungen({ session }) {
  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showImport,  setShowImport]  = useState(false)
  const [openItem,    setOpenItem]    = useState(null)
  const [filterStatus,setFilterStatus]= useState('all')
  const [search,      setSearch]      = useState('')
  const [flash,       setFlash]       = useState(null)

  useEffect(()=>{ loadItems() }, [])

  // Chrome Extension: Auf Profil-Import Nachrichten hören
  useEffect(()=>{
    function onExtMsg(event) {
      // Sicherheitscheck: nur vom gleichen Origin
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'LLR_PROFILE_IMPORT' && event.data?.profile) {
        handleExtensionImport(event.data.profile);
      }
    }
    window.addEventListener('message', onExtMsg);

    // Chrome Extension: direkte Nachricht via chrome.runtime
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage && chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'LLR_PROFILE_IMPORT' && msg.profile) {
          handleExtensionImport(msg.profile);
        }
      });
    }

    return () => window.removeEventListener('message', onExtMsg);
  }, [])

  async function handleExtensionImport(profile) {
    // Fehlende Felder normalisieren
    const normalized = {
      li_name:     profile.li_name     || '',
      li_headline: profile.li_headline || '',
      li_company:  profile.li_company  || '',
      li_position: profile.li_position || '',
      li_location: profile.li_location || '',
      li_about:    profile.li_about    || '',
      li_url:      profile.li_url      || '',
      li_avatar_url: profile.li_avatar_url || '',
      li_skills:   Array.isArray(profile.li_skills) ? profile.li_skills : [],
    }
    if (!normalized.li_name) return;

    const { data, error } = await supabase.from('vernetzungen').insert({
      ...normalized,
      user_id: session.user.id,
      status: 'draft'
    }).select().single()

    if (error) { showFlash(error.message, 'error'); return }
    setItems(prev=>[data,...prev])
    setOpenItem(data)
    showFlash('✅ Profil von ' + normalized.li_name + ' importiert!')
  }

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase.from('vernetzungen').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false})
    setItems(data || [])
    setLoading(false)
  }

  function showFlash(msg,type='success') { setFlash({msg,type}); setTimeout(()=>setFlash(null),3000) }

  async function handleImport(profileData) {
    const { data, error } = await supabase.from('vernetzungen').insert({
      ...profileData,
      user_id: session.user.id,
      status: 'draft'
    }).select().single()
    if (error) { showFlash(error.message,'error'); return }
    setItems(prev=>[data,...prev])
    setShowImport(false)
    setOpenItem(data)
    showFlash('Profil importiert — Nachricht generieren!')
  }

  async function handleSave(updated) {
    const { error } = await supabase.from('vernetzungen').update({
      ...updated, updated_at: new Date().toISOString()
    }).eq('id',updated.id)
    if (error) { showFlash(error.message,'error'); return }
    setItems(prev=>prev.map(i=>i.id===updated.id?updated:i))
    setOpenItem(null)
    showFlash('Gespeichert!')
  }

  async function handleDelete(id) {
    await supabase.from('vernetzungen').delete().eq('id',id)
    setItems(prev=>prev.filter(i=>i.id!==id))
    setOpenItem(null)
    showFlash('Gelöscht')
  }

  /* ── Filter ── */
  const filtered = items.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (i.li_name||'').toLowerCase().includes(q) || (i.li_company||'').toLowerCase().includes(q) || (i.li_headline||'').toLowerCase().includes(q)
    }
    return true
  })

  /* ── Stats ── */
  const stats = {
    total: items.length,
    sent: items.filter(i=>i.status==='sent'||i.status==='accepted'||i.status==='declined'||i.status==='no_response').length,
    accepted: items.filter(i=>i.status==='accepted').length,
    rate: items.length ? Math.round(items.filter(i=>i.status==='accepted').length / Math.max(items.filter(i=>i.status!=='draft').length,1) * 100) : 0,
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Top Bar */}
      <div style={{ padding:'14px 24px', borderBottom:'1px solid #E2E8F0', background:'#fff', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0, display:'flex', alignItems:'center', gap:8 }}><LiIcon/> Vernetzungen</h1>
            <div style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>LinkedIn Vernetzungsnachrichten generieren & tracken</div>
          </div>
          <button onClick={()=>setShowImport(true)}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 20px', borderRadius:999, background:'#0A66C2', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 1px 4px rgba(10,102,194,0.3)' }}>
            <PlusIcon/> Profil importieren
          </button>
        </div>

        {/* Stats */}
        <div style={{ display:'flex', gap:12 }}>
          {[
            { label:'Gesamt',       value:stats.total,    color:'#475569', bg:'#F8FAFC' },
            { label:'Gesendet',     value:stats.sent,     color:'#0A66C2', bg:'#EFF6FF' },
            { label:'Angenommen',   value:stats.accepted, color:'#065F46', bg:'#ECFDF5' },
            { label:'Akzeptanzrate',value:stats.rate+'%', color:'#5B21B6', bg:'#F5F3FF' },
          ].map(s=>(
            <div key={s.label} style={{ padding:'8px 14px', background:s.bg, borderRadius:10, border:'1px solid #E2E8F0' }}>
              <div style={{ fontSize:18, fontWeight:900, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:10, color:'#94A3B8', fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ padding:'10px 24px', borderBottom:'1px solid #F1F5F9', display:'flex', gap:10, alignItems:'center', background:'#FAFAFA', flexShrink:0 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Suchen..."
          style={{ flex:1, maxWidth:260, padding:'7px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', background:'#fff' }}/>
        <div style={{ display:'flex', gap:6 }}>
          {[['all','Alle'],...Object.entries(STATUS_CONFIG).map(([s,c])=>[s,c.icon+' '+c.label])].map(([s,lbl2])=>(
            <button key={s} onClick={()=>setFilterStatus(s)}
              style={{ padding:'5px 12px', borderRadius:999, fontSize:11, fontWeight:filterStatus===s?700:500, border:'1px solid '+(filterStatus===s?'#0A66C2':'#E2E8F0'), background:filterStatus===s?'#EFF6FF':'#fff', color:filterStatus===s?'#0A66C2':'#64748B', cursor:'pointer' }}>
              {lbl2}
            </button>
          ))}
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:flash.type==='error'?'#EF4444':'#0F172A', color:'#fff', padding:'8px 20px', borderRadius:999, fontSize:13, fontWeight:600, zIndex:999, boxShadow:'0 4px 16px rgba(15,23,42,0.2)' }}>
          {flash.type==='error'?'❌':'✓'} {flash.msg}
        </div>
      )}

      {/* Liste */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 24px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:56, color:'#94A3B8' }}>⏳ Lade Vernetzungen...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:56 }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🤝</div>
            <div style={{ fontWeight:700, fontSize:16, color:'#475569' }}>{items.length===0 ? 'Noch keine Vernetzungen' : 'Keine Ergebnisse'}</div>
            <div style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>{items.length===0 ? 'Importiere ein LinkedIn Profil um zu starten' : 'Andere Filter versuchen'}</div>
            {items.length===0 && <button onClick={()=>setShowImport(true)} style={{ marginTop:16, padding:'9px 22px', borderRadius:999, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>+ Profil importieren</button>}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
            {filtered.map(item => {
              const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft
              const hasMsg = item.final_msg || item.generated_msg
              return (
                <div key={item.id} onClick={()=>setOpenItem(item)}
                  style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', padding:'16px', cursor:'pointer', transition:'all 0.15s', boxShadow:'0 1px 3px rgba(15,23,42,0.05)', borderLeft:'4px solid '+cfg.color }}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(15,23,42,0.1)'}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow='0 1px 3px rgba(15,23,42,0.05)'}>

                  <div style={{ display:'flex', gap:12, marginBottom:10 }}>
                    <Avatar name={item.li_name} url={item.li_avatar_url} size={44}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.li_name}</div>
                      {item.li_headline && <div style={{ fontSize:11, color:'#64748B', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.li_headline}</div>}
                      {item.li_company && <div style={{ fontSize:11, color:'#0A66C2', fontWeight:600, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.li_company}</div>}
                    </div>
                    <span style={{ padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:700, background:cfg.bg, color:cfg.color, height:'fit-content', whiteSpace:'nowrap' }}>{cfg.icon} {cfg.label}</span>
                  </div>

                  {hasMsg && (
                    <div style={{ background:'#F8FAFC', borderRadius:8, padding:'8px 10px', fontSize:11, color:'#475569', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', marginBottom:10 }}>
                      "{item.final_msg || item.generated_msg}"
                    </div>
                  )}

                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:10, color:'#94A3B8' }}>{new Date(item.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</div>
                    <div style={{ display:'flex', gap:4 }}>
                      {item.rating && [1,2,3,4,5].map(n=><span key={n} style={{ fontSize:11, color:n<=item.rating?'#F59E0B':'#E2E8F0' }}>★</span>)}
                      {!hasMsg && <span style={{ fontSize:10, color:'#F59E0B', fontWeight:700 }}>✏️ Nachricht fehlt</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showImport && <ImportPanel onImport={handleImport} onClose={()=>setShowImport(false)}/>}
      {openItem && <VernetzungModal item={openItem} onClose={()=>setOpenItem(null)} onSave={handleSave} onDelete={handleDelete}/>}
    </div>
  )
}
