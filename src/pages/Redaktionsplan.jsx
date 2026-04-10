import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Konstanten ──────────────────────────────────────────────────────────────
const PLATFORMS = {
  linkedin: { label: 'LinkedIn', color: '#0A66C2', bg: '#EFF6FF', icon: '💼' },
}

const STATUS = {
  idee:            { label: '💡 Idee',          color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  entwurf:         { label: '✏️ Entwurf',        color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  review:          { label: '👁️ Review',         color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  geplant:         { label: '📅 Geplant',        color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  veroeffentlicht: { label: '✅ Veröffentlicht', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────
function getCalendarDays(year, month) {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const startDow = (first.getDay() + 6) % 7 // Mo=0
  const days = []
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, -startDow + i + 1)
    days.push({ date: d, current: false })
  }
  for (let i = 1; i <= last.getDate(); i++) {
    days.push({ date: new Date(year, month, i), current: true })
  }
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - last.getDate() - startDow + 1)
    days.push({ date: d, current: false })
  }
  return days
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function relativeDate(d) {
  if (!d) return '—'
  const diff = Math.round((new Date(d) - new Date()) / 86400000)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  if (diff === -1) return 'Gestern'
  if (diff > 0) return `in ${diff}d`
  return `vor ${Math.abs(diff)}d`
}

// ─── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({ post, onClick, compact }) {
  const plt = PLATFORMS[post.platform] || PLATFORMS.linkedin
  const sts = STATUS[post.status]      || STATUS.idee
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('postId', post.id)}
      onClick={() => onClick(post)}
      style={{ background:'#fff', borderRadius: compact ? 8 : 12, border:'1px solid #E5E7EB',
        padding: compact ? '6px 10px' : '12px 14px', cursor:'pointer', transition:'all 0.15s',
        borderLeft:`3px solid ${plt.color}`, marginBottom: compact ? 4 : 8,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom: compact ? 2 : 6 }}>
        <span style={{ fontSize: compact ? 11 : 13 }}>{plt.icon}</span>
        <span style={{ fontSize: compact ? 10 : 11, fontWeight:700, color: plt.color }}>{plt.label}</span>
        <span style={{ marginLeft:'auto', fontSize: compact ? 9 : 10, fontWeight:700,
          color: sts.color, background: sts.bg, border:`1px solid ${sts.border}`,
          borderRadius:99, padding:'1px 6px' }}>{sts.label}</span>
      </div>
      <div style={{ fontSize: compact ? 11 : 13, fontWeight:600, color:'rgb(20,20,43)',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        lineHeight:1.4 }}>{post.title || '(Kein Titel)'}</div>
      {!compact && post.scheduled_at && (
        <div style={{ fontSize:10, color:'#94A3B8', marginTop:4 }}>
          📅 {new Date(post.scheduled_at).toLocaleDateString('de-DE', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
          {' · '}<span style={{ color: new Date(post.scheduled_at) < new Date() && post.status !== 'veroeffentlicht' ? '#ef4444' : '#94A3B8' }}>
            {relativeDate(post.scheduled_at)}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── PostModal ────────────────────────────────────────────────────────────────
function PostModal({ post, onClose, onSave, onDelete }) {
  const isNew = !post?.id
  const [form, setForm] = useState({
    title: '', content: '', platform: 'linkedin', status: 'idee',
    scheduled_at: '', tags: '', notes: '',
    ...post,
    tags: Array.isArray(post?.tags) ? post.tags.join(', ') : (post?.tags || ''),
    scheduled_at: post?.scheduled_at ? post.scheduled_at.slice(0,16) : '',
  })
  const [saving, setSaving] = useState(false)
  const [charCount, setCharCount] = useState(form.content?.length || 0)

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const plt = PLATFORMS[form.platform] || PLATFORMS.linkedin

  const CHAR_LIMITS = { linkedin: 3000 }
  const limit = CHAR_LIMITS[form.platform]

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      ...form,
      user_id: user.id,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    }
    delete payload.id
    let result
    if (isNew) {
      result = await supabase.from('content_posts').insert(payload).select().single()
    } else {
      result = await supabase.from('content_posts').update(payload).eq('id', post.id).select().single()
    }
    setSaving(false)
    if (!result.error) onSave(result.data)
  }

  const pltOptions = Object.entries(PLATFORMS)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:20, width:'100%', maxWidth:760, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 0', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:22 }}>{plt.icon}</span>
          <div style={{ flex:1 }}>
            <input value={form.title} onChange={e => upd('title', e.target.value)}
              placeholder="Titel / Thema des Beitrags…"
              style={{ width:'100%', border:'none', outline:'none', fontSize:18, fontWeight:700, color:'rgb(20,20,43)', background:'transparent' }}/>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94A3B8' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:'20px 24px', display:'grid', gridTemplateColumns:'1fr 280px', gap:20 }}>

          {/* Left — Content */}
          <div>
            {/* Platform Pills */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
              {pltOptions.map(([k, v]) => (
                <button key={k} onClick={() => upd('platform', k)}
                  style={{ padding:'5px 12px', borderRadius:99, border:`1.5px solid ${form.platform===k?v.color:'#E5E7EB'}`,
                    background: form.platform===k ? v.bg : '#fff', color: form.platform===k ? v.color : '#64748B',
                    fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>

            {/* Content Textarea */}
            {/* KI-Werkzeuge */}
            <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
              {['🪄 Verbessern','💪 Stärker','✂️ Kürzer','🎯 Hook schärfen'].map(action => (
                <button key={action} disabled={improving || !form.content.trim()}
                  onClick={async () => {
                    if (!form.content.trim()) return
                    setImproving(true)
                    const prompts = {
                      '🪄 Verbessern': `Verbessere diesen LinkedIn-Post. Behalte den Inhalt und Stil, mache ihn aber ansprechender und professioneller. Gib nur den überarbeiteten Text zurück, ohne Erklärung:

${form.content}`,
                      '💪 Stärker': `Mache diesen LinkedIn-Post wirkungsvoller und überzeugender. Stärkere Sprache, klarere Botschaft. Nur der Text:

${form.content}`,
                      '✂️ Kürzer': `Kürze diesen LinkedIn-Post auf das Wesentliche (max. 150 Wörter). Nur der gekürzte Text:

${form.content}`,
                      '🎯 Hook schärfen': `Verbessere nur den ersten Satz/Absatz dieses LinkedIn-Posts zu einem unwiderstehlichen Hook. Behalte den Rest. Nur der vollständige überarbeitete Text:

${form.content}`,
                    }
                    try {
                      const res = await fetch('https://api.anthropic.com/v1/messages', {
                        method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000,
                          messages:[{ role:'user', content: prompts[action] }] })
                      })
                      const data = await res.json()
                      const text = data.content?.[0]?.text
                      if (text) { upd('content', text); setCharCount(text.length) }
                    } catch(e) {}
                    setImproving(false)
                  }}
                  style={{ padding:'4px 10px', borderRadius:7, border:'1.5px solid #E5E7EB',
                    background: improving ? '#F8FAFC' : '#fff', color: improving ? '#CBD5E1' : '#475569',
                    fontSize:11, fontWeight:600, cursor: improving || !form.content.trim() ? 'not-allowed' : 'pointer',
                    opacity: !form.content.trim() ? 0.5 : 1, transition:'all 0.12s' }}
                  onMouseEnter={e => { if (!improving && form.content.trim()) e.currentTarget.style.borderColor='rgb(49,90,231)' }}
                  onMouseLeave={e => e.currentTarget.style.borderColor='#E5E7EB'}>
                  {improving ? '⏳' : action}
                </button>
              ))}
            </div>

            <div style={{ position:'relative' }}>
              <textarea value={form.content}
                onChange={e => { upd('content', e.target.value); setCharCount(e.target.value.length) }}
                placeholder={`${plt.icon} Schreibe deinen ${plt.label}-Beitrag hier…\n\nTipps:\n• Starte mit einem starken Hook\n• Nutze Zeilenumbrüche für Lesbarkeit\n• Füge einen Call-to-Action ein`}
                rows={12}
                style={{ width:'100%', padding:'14px', borderRadius:12, border:'1.5px solid #E5E7EB',
                  fontSize:14, lineHeight:1.7, resize:'vertical', outline:'none', boxSizing:'border-box',
                  fontFamily:'inherit', color:'rgb(20,20,43)', transition:'border 0.15s' }}
                onFocus={e => e.target.style.borderColor = plt.color}
                onBlur={e => e.target.style.borderColor = '#E5E7EB'}/>
              <div style={{ position:'absolute', bottom:10, right:12, fontSize:11, color: charCount > limit ? '#ef4444' : '#94A3B8', fontWeight:600 }}>
                {charCount.toLocaleString()} / {limit === 99999 ? '∞' : limit.toLocaleString()}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginTop:12 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Interne Notizen</label>
              <textarea value={form.notes} onChange={e => upd('notes', e.target.value)}
                placeholder="Recherche-Quellen, Ideen, Anmerkungen…" rows={3}
                style={{ width:'100%', marginTop:4, padding:'10px', borderRadius:10, border:'1.5px solid #E5E7EB',
                  fontSize:13, resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit',
                  color:'rgb(20,20,43)', background:'#FAFAFA' }}/>
            </div>
          </div>

          {/* Right — Metadaten */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Status */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:8 }}>Status</label>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {Object.entries(STATUS).map(([k, v]) => (
                  <button key={k} onClick={() => upd('status', k)}
                    style={{ padding:'8px 12px', borderRadius:10, border:`1.5px solid ${form.status===k?v.color:v.border}`,
                      background: form.status===k ? v.bg : '#fff', color: v.color,
                      fontSize:12, fontWeight: form.status===k ? 700 : 400, cursor:'pointer', textAlign:'left',
                      transition:'all 0.12s' }}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Geplant für */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>📅 Geplant für</label>
              <input type="datetime-local" value={form.scheduled_at} onChange={e => upd('scheduled_at', e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1.5px solid #E5E7EB',
                  fontSize:13, outline:'none', boxSizing:'border-box', color:'rgb(20,20,43)' }}/>
            </div>

            {/* Tags */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>🏷️ Tags</label>
              <input value={form.tags} onChange={e => upd('tags', e.target.value)}
                placeholder="linkedin, b2b, sales (kommagetrennt)"
                style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1.5px solid #E5E7EB',
                  fontSize:13, outline:'none', boxSizing:'border-box', color:'rgb(20,20,43)' }}/>
              {form.tags && (
                <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
                  {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
                      background:'#EFF6FF', color:'#1d4ed8', border:'1px solid #BFDBFE' }}>#{t}</span>
                  ))}
                </div>
              )}
            </div>

            {/* LinkedIn Card Vorschau */}
            {form.content && (
              <div style={{ border:'1px solid #E5E7EB', borderRadius:12, overflow:'hidden', background:'#fff' }}>
                <div style={{ padding:'10px 12px 6px', background:'#F3F2EF', borderBottom:'1px solid #E5E7EB' }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#0A66C2', textTransform:'uppercase', letterSpacing:'0.05em' }}>💼 LinkedIn-Vorschau</span>
                </div>
                <div style={{ padding:'12px 14px' }}>
                  {/* Profil-Zeile */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,rgb(49,90,231),#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:14, flexShrink:0 }}>MS</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)' }}>Michael Schreck</div>
                      <div style={{ fontSize:11, color:'#666' }}>Sales Intelligence · Lead Radar</div>
                      <div style={{ fontSize:10, color:'#999' }}>Jetzt · 🌐</div>
                    </div>
                    <div style={{ marginLeft:'auto', color:'#0A66C2', fontSize:20, fontWeight:300 }}>…</div>
                  </div>
                  {/* Content */}
                  <div style={{ fontSize:13, color:'rgb(20,20,43)', lineHeight:1.65, whiteSpace:'pre-wrap', wordBreak:'break-word', maxHeight:180, overflow:'auto' }}>
                    {form.content.slice(0,600)}{form.content.length > 600 ? '…mehr' : ''}

…mehr' : ''}
                  </div>
                  {/* Reactions */}
                  <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid #E5E7EB', display:'flex', gap:16 }}>
                    {['👍 Gefällt mir','💬 Kommentieren','↗️ Teilen'].map(a => (
                      <span key={a} style={{ fontSize:11, color:'#666', fontWeight:600 }}>{a}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'16px 24px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, alignItems:'center' }}>
          {!isNew && (
            <button onClick={() => { if (window.confirm('Beitrag löschen?')) onDelete(post.id) }}
              style={{ padding:'9px 16px', borderRadius:10, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              🗑 Löschen
            </button>
          )}
          <div style={{ flex:1 }}/>
          {!isNew && (
            <button onClick={async () => {
              const uid = (await supabase.auth.getUser()).data?.user?.id
              const { data: dup } = await supabase.from('content_posts').insert({
                ...form,
                id: undefined,
                user_id: uid,
                title: form.title + ' (Kopie)',
                status: 'idee',
                tags: form.tags.split(',').map(t=>t.trim()).filter(Boolean),
                scheduled_at: null,
              }).select().single()
              if (dup) { onSave(dup); }
            }} style={{ padding:'9px 16px', borderRadius:10, border:'1px solid #BFDBFE', background:'#EFF6FF', color:'#1d4ed8', fontSize:13, cursor:'pointer' }}>
              📋 Duplizieren
            </button>
          )}
          <button onClick={onClose} style={{ padding:'9px 16px', borderRadius:10, border:'1px solid #E5E7EB', background:'#F8FAFC', color:'#64748B', fontSize:13, cursor:'pointer' }}>
            Abbrechen
          </button>
          <button onClick={save} disabled={saving}
            style={{ padding:'9px 20px', borderRadius:10, border:'none', background:'rgb(49,90,231)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? '⏳ Speichere…' : isNew ? '+ Erstellen' : '💾 Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function Redaktionsplan({ session }) {
  const [posts, setPosts]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState('kanban')  // kanban | kalender | liste
  const [modal, setModal]         = useState(null)      // null | {} | post
  const [filter, setFilter]       = useState('all')     // all | platform
  const [calDate, setCalDate]     = useState(new Date())
  const [search, setSearch]       = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [improving, setImproving] = useState(false)

  async function generateIdeas() {
    setGenerating(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:1000,
          messages:[{ role:'user', content:'Generiere 5 kreative LinkedIn-Post-Ideen für einen B2B Sales Professional. Gib nur JSON zurück: [{"title":"...", "hook":"..."}, ...]. Themen: Thought Leadership, Sales Tipps, Networking, Erfahrungsberichte, Branchentrends. Keine anderen Texte, nur JSON.' }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || '[]'
      const clean = text.replace(/```json|```/g,'').trim()
      const ideas = JSON.parse(clean)
      // Erstelle Posts als Ideen
      const uid = (await supabase.auth.getUser()).data?.user?.id
      for (const idea of ideas.slice(0,5)) {
        const { data: post } = await supabase.from('content_posts').insert({
          user_id: uid, title: idea.title, content: idea.hook || '',
          platform: 'linkedin', status: 'idee'
        }).select().single()
        if (post) setPosts(prev => [post, ...prev])
      }
      alert('✅ 5 KI-Ideen wurden als Entwürfe hinzugefügt!')
    } catch(e) {
      alert('Fehler beim Generieren. Bitte nochmal versuchen.')
    }
    setGenerating(false)
  }

  useEffect(() => {
    loadPosts()
    const leadId   = searchParams.get('lead')
    const leadName = searchParams.get('name')
    const company  = searchParams.get('company')
    if (leadId && leadName) {
      openNew({
        title: `Post über ${leadName}${company ? ' – ' + company : ''}`,
        content: `Ich hatte heute ein inspirierendes Gespräch mit ${leadName}${company ? ' von ' + company : ''}.

[Dein Erlebnis / Erkenntnis aus dem Gespräch]

Was mich besonders beeindruckt hat:
→ [Punkt 1]
→ [Punkt 2]

Danke für den Austausch! 🤝`,
        platform: 'linkedin',
        status: 'entwurf',
        lead_id: leadId,
      })
    }
  }, [])

  async function loadPosts() {
    setLoading(true)
    const { data } = await supabase.from('content_posts').select('*').order('created_at', { ascending: false })
    setPosts(data || [])
    setLoading(false)
  }

  function openNew(defaults = {}) { setModal({ ...defaults }) }
  function openEdit(post) { setModal(post) }
  function closeModal() { setModal(null) }

  function handleSave(saved) {
    setPosts(prev => {
      const idx = prev.findIndex(p => p.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [saved, ...prev]
    })
    closeModal()
  }

  async function handleDelete(id) {
    await supabase.from('content_posts').delete().eq('id', id)
    setPosts(prev => prev.filter(p => p.id !== id))
    closeModal()
  }

  // Gefilterte Posts
  const filtered = posts.filter(p => {
    if (filter !== 'all' && p.platform !== filter) return false
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.content.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // KPIs
  const kpis = {
    total: posts.length,
    geplant: posts.filter(p => p.status === 'geplant').length,
    veroeffentlicht: posts.filter(p => p.status === 'veroeffentlicht').length,
    diese_woche: posts.filter(p => {
      if (!p.scheduled_at) return false
      const d = new Date(p.scheduled_at)
      const now = new Date()
      const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7)
      return d >= now && d <= weekEnd
    }).length,
  }

  // ── Kalender ──
  const calYear  = calDate.getFullYear()
  const calMonth = calDate.getMonth()
  const calDays  = getCalendarDays(calYear, calMonth)
  const today    = new Date()

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>

      {/* Header */}
      <div style={{ padding:'0 0 20px', display:'flex', flexDirection:'column', gap:16, flexShrink:0 }}>

        {/* KPI Strip */}
        <div style={{ display:'flex', gap:12 }}>
          {[
            { label:'Gesamt',         val: kpis.total,           icon:'📝', color:'#64748B' },
            { label:'Diese Woche',    val: kpis.diese_woche,     icon:'📅', color:'#2563EB' },
            { label:'Geplant',        val: kpis.geplant,         icon:'🕐', color:'#D97706' },
            { label:'Veröffentlicht', val: kpis.veroeffentlicht, icon:'✅', color:'#059669' },
          ].map(k => (
            <div key={k.label} style={{ background:'#fff', borderRadius:14, padding:'12px 16px', border:'1px solid #E5E7EB',
              flex:1, display:'flex', alignItems:'center', gap:10, boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
              <span style={{ fontSize:20 }}>{k.icon}</span>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color: k.color, lineHeight:1 }}>{k.val}</div>
                <div style={{ fontSize:11, color:'#94A3B8', fontWeight:600 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>

          {/* Search */}
          <div style={{ position:'relative', flex:1, minWidth:200 }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94A3B8', fontSize:14 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Beiträge suchen…"
              style={{ width:'100%', padding:'8px 12px 8px 32px', borderRadius:10, border:'1.5px solid #E5E7EB',
                fontSize:13, outline:'none', boxSizing:'border-box' }}/>
          </div>

          {/* Platform Filter */}
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={() => setFilter('all')}
              style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid', fontSize:12, fontWeight:700, cursor:'pointer',
                borderColor: filter==='all' ? 'rgb(49,90,231)' : '#E5E7EB',
                background: filter==='all' ? 'rgb(49,90,231)' : '#fff',
                color: filter==='all' ? '#fff' : '#64748B' }}>Alle</button>
            {Object.entries(PLATFORMS).map(([k, v]) => (
              <button key={k} onClick={() => setFilter(k)}
                style={{ padding:'6px 10px', borderRadius:8, border:`1.5px solid ${filter===k?v.color:'#E5E7EB'}`,
                  background: filter===k ? v.bg : '#fff', color: filter===k ? v.color : '#64748B',
                  fontSize:12, fontWeight: filter===k ? 700 : 400, cursor:'pointer' }}>
                {v.icon}
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div style={{ display:'flex', background:'#F1F5F9', borderRadius:10, padding:3, gap:2 }}>
            {[['kanban','⊞ Board'],['woche','📆 Woche'],['kalender','📅 Monat'],['liste','☰ Liste']].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding:'6px 12px', borderRadius:8, border:'none', fontSize:12, fontWeight:700, cursor:'pointer',
                  background: view===v ? '#fff' : 'transparent', color: view===v ? 'rgb(49,90,231)' : '#64748B',
                  boxShadow: view===v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition:'all 0.15s' }}>
                {l}
              </button>
            ))}
          </div>

          {/* KI-Ideen Button */}
          <button onClick={generateIdeas} disabled={generating}
            style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid rgba(49,90,231,0.3)', background:'rgba(49,90,231,0.06)', color:'rgb(49,90,231)',
              fontSize:13, fontWeight:600, cursor:generating?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap', opacity:generating?0.7:1 }}>
            {generating ? '⏳ Generiere…' : '✨ KI-Ideen'}
          </button>

          {/* Vorlagen Button */}
          <button onClick={() => setShowTemplates(v => !v)}
            style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid #E5E7EB', background:showTemplates?'#EFF6FF':'#fff', color:showTemplates?'rgb(49,90,231)':'#64748B',
              fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
            📋 Vorlagen
          </button>

          {/* Neu Button */}
          <button onClick={() => openNew()}
            style={{ padding:'8px 18px', borderRadius:10, border:'none', background:'rgb(49,90,231)', color:'#fff',
              fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6,
              boxShadow:'0 2px 8px rgba(49,90,231,0.3)', whiteSpace:'nowrap' }}>
            ✍️ Neuer Beitrag
          </button>
        </div>
      </div>


      {/* ── VORLAGEN PANEL ── */}
      {showTemplates && (
        <div style={{ background:'#fff', border:'1.5px solid #E5E7EB', borderRadius:16, padding:20, marginBottom:16, flexShrink:0 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'rgb(20,20,43)', marginBottom:12 }}>📋 Content-Vorlagen</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:10 }}>
            {[
              { title:'💡 Thought Leadership', platform:'linkedin', content:'Eine Erkenntnis, die meine Perspektive auf [Thema] verändert hat:\n\n[Kernaussage]\n\nWas ich daraus gelernt habe:\n→ [Punkt 1]\n→ [Punkt 2]\n→ [Punkt 3]\n\nDeine Meinung?', status:'idee' },
              { title:'📊 Daten & Insights', platform:'linkedin', content:'[X]% der [Zielgruppe] kämpfen mit [Problem].\n\nHier ist, was hilft:\n\n1. [Lösung 1]\n2. [Lösung 2]\n3. [Lösung 3]\n\nWelche Erfahrung hast du?', status:'idee' },
              { title:'🎯 Problem-Lösung', platform:'linkedin', content:'Das größte Missverständnis über [Thema]:\n\n❌ Was die meisten denken: [Irrglauben]\n✅ Was stimmt: [Wahrheit]\n\nDer Unterschied:\n[Erklärung]\n\nWie siehst du das?', status:'idee' },
              { title:'📖 Story & Erfahrung', platform:'linkedin', content:'Vor [X] Monaten hatte ich ein Gespräch, das alles verändert hat.\n\n[Situation]\n\nDie Lektion:\n[Kernaussage]\n\nSeitdem mache ich es so:\n[Tipp]', status:'idee' },
              { title:'🔥 Kontroverser Hook', platform:'linkedin', content:'Unpopuläre Meinung: [These]\n\nIch weiß, das klingt hart. Aber:\n\n[Begründung 1]\n[Begründung 2]\n[Begründung 3]\n\nBin ich der Einzige?', status:'idee' },
              { title:'📊 Engagement Frage', platform:'linkedin', content:'Eine Frage, die mich beschäftigt:\n\n[Frage]\n\nMeine Meinung: [Deine Perspektive]\n\nWas denkst du? 👇', status:'idee' },
            ].map((tmpl, i) => (
              <div key={i} onClick={() => { openNew(tmpl); setShowTemplates(false) }}
                style={{ padding:'12px 14px', borderRadius:12, border:'1.5px solid #E5E7EB', cursor:'pointer',
                  borderLeft:`3px solid ${(PLATFORMS[tmpl.platform]||PLATFORMS.linkedin).color}`, transition:'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background='#F8FAFC'; e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)', marginBottom:4 }}>{tmpl.title}</div>
                <div style={{ fontSize:11, color:'#94A3B8' }}>{(PLATFORMS[tmpl.platform]||PLATFORMS.linkedin).icon} {(PLATFORMS[tmpl.platform]||PLATFORMS.linkedin).label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── KANBAN VIEW ── */}
      {view === 'kanban' && (
        <div style={{ flex:1, overflowX:'auto', overflowY:'hidden' }}>
          <div style={{ display:'flex', gap:16, height:'100%', minWidth: Object.keys(STATUS).length * 280 + 'px' }}>
            {Object.entries(STATUS).map(([sk, sv]) => {
              const cols = filtered.filter(p => p.status === sk)
              return (
                <div key={sk}
                  onDragOver={e => e.preventDefault()}
                  onDrop={async e => {
                    e.preventDefault()
                    const postId = e.dataTransfer.getData('postId')
                    if (!postId) return
                    await supabase.from('content_posts').update({ status: sk }).eq('id', postId)
                    setPosts(prev => prev.map(p => p.id===postId ? {...p, status:sk} : p))
                  }}
                  style={{ flex:1, minWidth:260, display:'flex', flexDirection:'column', background:'#F8FAFC',
                  borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  {/* Column Header */}
                  <div style={{ padding:'14px 16px', borderBottom:'2px solid #E5E7EB', background:'#fff',
                    display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:13, fontWeight:800, color: sv.color }}>{sv.label}</span>
                      <span style={{ fontSize:11, fontWeight:700, background: sv.bg, border:`1px solid ${sv.border}`,
                        color: sv.color, borderRadius:99, padding:'1px 7px' }}>{cols.length}</span>
                    </div>
                    <button onClick={() => openNew({ status: sk })}
                      style={{ background:'none', border:'none', color:'#94A3B8', cursor:'pointer', fontSize:18,
                        lineHeight:1, borderRadius:6, padding:'2px 6px' }}
                      title="Neuer Beitrag in dieser Spalte"
                      onMouseEnter={e => e.currentTarget.style.color = sv.color}
                      onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}>+</button>
                  </div>
                  {/* Cards */}
                  <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
                    {cols.length === 0 && (
                      <div style={{ textAlign:'center', padding:'30px 0', color:'#CBD5E1', fontSize:12 }}>
                        Keine Beiträge
                      </div>
                    )}
                    {cols.map(p => <PostCard key={p.id} post={p} onClick={openEdit} />)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {/* ── WOCHEN VIEW ── */}
      {view === 'woche' && (() => {
        // Aktuelle Woche Mo-So
        const now = new Date()
        const dow = (now.getDay() + 6) % 7 // Mo=0
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow); weekStart.setHours(0,0,0,0)
        const weekDays = Array.from({length:7}, (_,i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate()+i); return d })
        return (
          <div style={{ flex:1, display:'flex', gap:10, overflowX:'auto', minHeight:0 }}>
            {weekDays.map((day, i) => {
              const dayPosts = filtered.filter(p => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day))
              const isToday  = isSameDay(day, new Date())
              return (
                <div key={i} style={{ flex:1, minWidth:140, display:'flex', flexDirection:'column',
                  background: isToday ? '#EFF6FF' : '#F8FAFC', borderRadius:14,
                  border: isToday ? '2px solid rgb(49,90,231)' : '1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'10px 12px', borderBottom:'1px solid #E5E7EB', background: isToday ? 'rgb(49,90,231)' : '#fff' }}>
                    <div style={{ fontSize:11, fontWeight:800, color: isToday ? 'rgba(255,255,255,0.7)' : '#94A3B8', textTransform:'uppercase' }}>{DAYS[i]}</div>
                    <div style={{ fontSize:18, fontWeight:800, color: isToday ? '#fff' : 'rgb(20,20,43)' }}>{day.getDate()}</div>
                  </div>
                  <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
                    {dayPosts.map(p => <PostCard key={p.id} post={p} onClick={openEdit} compact />)}
                    <button onClick={() => openNew({ scheduled_at: day.toISOString().slice(0,10)+'T09:00' })}
                      style={{ width:'100%', padding:'4px', borderRadius:6, border:'1px dashed #CBD5E1',
                        background:'none', color:'#94A3B8', fontSize:11, cursor:'pointer', marginTop:4 }}>
                      + Beitrag
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── KALENDER VIEW ── */}
      {view === 'kalender' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
          {/* Monat Navigation */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexShrink:0 }}>
            <button onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
              style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:16 }}>‹</button>
            <div style={{ fontSize:18, fontWeight:800, color:'rgb(20,20,43)', flex:1, textAlign:'center' }}>
              {MONTHS[calMonth]} {calYear}
            </div>
            <button onClick={() => setCalDate(new Date())}
              style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}>Heute</button>
            <button onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
              style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:16 }}>›</button>
          </div>

          {/* Wochentage Header */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:2, flexShrink:0 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'#94A3B8', padding:'6px 0', textTransform:'uppercase' }}>{d}</div>
            ))}
          </div>

          {/* Kalender-Grid */}
          <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', gridTemplateRows:`repeat(${calDays.length/7},1fr)`, gap:2, minHeight:0 }}>
            {calDays.map((day, i) => {
              const dayPosts = filtered.filter(p => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day.date))
              const isToday  = isSameDay(day.date, today)
              const isPast   = day.date < today && !isSameDay(day.date, today)
              return (
                <div key={i}
                  style={{ background: !day.current ? '#FAFAFA' : '#fff', borderRadius:10,
                    border: isToday ? '2px solid rgb(49,90,231)' : '1px solid #E5E7EB',
                    padding:'6px', overflow:'hidden', cursor:'pointer', minHeight:80,
                    opacity: !day.current ? 0.5 : 1 }}
                  onClick={() => openNew({ scheduled_at: day.date.toISOString().slice(0,16) })}>
                  <div style={{ fontSize:11, fontWeight: isToday ? 800 : 600,
                    color: isToday ? 'rgb(49,90,231)' : isPast ? '#94A3B8' : 'rgb(20,20,43)',
                    marginBottom:4, display:'flex', alignItems:'center', gap:4 }}>
                    {isToday && <span style={{ width:6, height:6, borderRadius:'50%', background:'rgb(49,90,231)', display:'inline-block' }}/>}
                    {day.date.getDate()}
                  </div>
                  {dayPosts.slice(0,3).map(p => (
                    <div key={p.id} onClick={e => { e.stopPropagation(); openEdit(p) }}
                      style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, marginBottom:2,
                        background: (PLATFORMS[p.platform]||PLATFORMS.linkedin).bg,
                        color: (PLATFORMS[p.platform]||PLATFORMS.linkedin).color,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                      {(PLATFORMS[p.platform]||PLATFORMS.linkedin).icon} {p.title || '(Kein Titel)'}
                    </div>
                  ))}
                  {dayPosts.length > 3 && (
                    <div style={{ fontSize:9, color:'#94A3B8', fontWeight:600 }}>+{dayPosts.length-3} weitere</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── LISTE VIEW ── */}
      {view === 'liste' && (
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading && <div style={{ textAlign:'center', padding:40, color:'#94A3B8' }}>Lädt…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:60, color:'#CBD5E1' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✍️</div>
              <div style={{ fontSize:16, fontWeight:700 }}>Noch keine Beiträge</div>
              <div style={{ fontSize:13, marginTop:8 }}>Erstelle deinen ersten Content-Plan</div>
              <button onClick={() => openNew()}
                style={{ marginTop:16, padding:'10px 20px', borderRadius:10, border:'none',
                  background:'rgb(49,90,231)', color:'#fff', fontWeight:700, cursor:'pointer' }}>
                ✍️ Ersten Beitrag erstellen
              </button>
            </div>
          )}
          {filtered.length > 0 && (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#F8FAFC' }}>
                  {['Plattform','Titel','Status','Geplant für','Tags'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700,
                      color:'#64748B', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'2px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const plt = PLATFORMS[p.platform] || PLATFORMS.linkedin
                  const sts = STATUS[p.status] || STATUS.idee
                  return (
                    <tr key={p.id} onClick={() => openEdit(p)}
                      style={{ borderBottom:'1px solid #F1F5F9', cursor:'pointer', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ fontSize:12, fontWeight:700, color: plt.color, background: plt.bg,
                          padding:'3px 10px', borderRadius:99, border:`1px solid ${plt.color}30` }}>
                          {plt.icon} {plt.label}
                        </span>
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:13, fontWeight:600, color:'rgb(20,20,43)', maxWidth:300 }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {p.title || '(Kein Titel)'}
                        </div>
                        {p.content && <div style={{ fontSize:11, color:'#94A3B8', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.content.slice(0,80)}…</div>}
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, color: sts.color, background: sts.bg,
                          padding:'3px 10px', borderRadius:99, border:`1px solid ${sts.border}` }}>{sts.label}</span>
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:12, color:'#64748B', whiteSpace:'nowrap' }}>
                        {p.scheduled_at ? (
                          <>
                            <span>{new Date(p.scheduled_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</span>
                            <span style={{ marginLeft:6, color: new Date(p.scheduled_at) < new Date() && p.status !== 'veroeffentlicht' ? '#ef4444' : '#94A3B8', fontWeight:600 }}>
                              {relativeDate(p.scheduled_at)}
                            </span>
                          </>
                        ) : <span style={{ color:'#CBD5E1' }}>—</span>}
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {(p.tags||[]).slice(0,3).map(t => (
                            <span key={t} style={{ fontSize:10, padding:'1px 7px', borderRadius:99,
                              background:'#EFF6FF', color:'#1d4ed8', border:'1px solid #BFDBFE', fontWeight:600 }}>#{t}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <PostModal post={modal} onClose={closeModal} onSave={handleSave} onDelete={handleDelete} />
      )}
    </div>
  )
}
