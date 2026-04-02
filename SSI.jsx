import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ─── Mini Donut ──────────────────────────────────────────────────────────────
function DonutChart({ value, max = 100, size = 160, stroke = 18, color = 'white', bg = 'rgba(255,255,255,0.2)' }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, Math.max(0, value / max))
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bg} strokeWidth={stroke} strokeLinecap="round"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ - pct * circ}
        style={{ transition: 'stroke-dashoffset 1s ease' }}/>
    </svg>
  )
}

// ─── Sub-Score Arc ────────────────────────────────────────────────────────────
function ScoreArc({ value, max = 25, color, size = 64 }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, value / max)
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={8} strokeLinecap="round"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}/>
    </svg>
  )
}

// ─── Sub-Score Card ───────────────────────────────────────────────────────────
function SubScoreCard({ label, value, max = 25, color }) {
  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '16px 18px', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <ScoreArc value={value} max={max} color={color} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1 }}>{Number(value).toFixed(0)}</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: (value / max * 100) + '%', background: color, borderRadius: 999, transition: 'width 0.8s ease' }}/>
        </div>
        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>{value} / {max}</div>
      </div>
    </div>
  )
}

// ─── Trend Spark-Chart (SVG) ──────────────────────────────────────────────────
function TrendChart({ entries, days = 30 }) {
  const W = 600, H = 120
  const cutoff = Date.now() - days * 86400000
  const data = [...entries]
    .filter(e => new Date(e.recorded_at).getTime() >= cutoff)
    .reverse()
  if (data.length < 2) return (
    <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
      Mindestens 2 Einträge für den Chart erforderlich
    </div>
  )
  const scores = data.map(e => e.total_score)
  const minS = Math.max(0, Math.min(...scores) - 5)
  const maxS = Math.min(100, Math.max(...scores) + 5)
  const xStep = W / (data.length - 1)
  const toY = s => H - 16 - ((s - minS) / (maxS - minS)) * (H - 32)
  const pts = data.map((e, i) => [i * xStep, toY(e.total_score)])
  const pathD = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ')
  const areaD = `${pathD} L${pts[pts.length-1][0]},${H} L0,${H} Z`
  const last = scores[scores.length - 1]
  const first = scores[0]
  const delta = last - first
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 900, color: 'white' }}>{Math.round(last)}</span>
        <span style={{ fontSize: 13, color: delta >= 0 ? '#86efac' : '#fca5a5', fontWeight: 600 }}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)} in {days} Tagen
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        <defs>
          <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="white" stopOpacity="0.02"/>
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#tGrad)"/>
        <path d={pathD} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 5 : 3}
            fill={i === pts.length - 1 ? 'white' : 'rgba(255,255,255,0.5)'}/>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
        <span>{new Date(data[0].recorded_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</span>
        <span>{new Date(data[data.length - 1].recorded_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</span>
      </div>
    </div>
  )
}

// ─── AI Insights ──────────────────────────────────────────────────────────────
function generateInsights(entries) {
  if (!entries.length) return []
  const latest = entries[0]
  const prev = entries[1]
  const insights = []
  const SUBSCORES = [
    { key: 'build_brand',        label: 'Professionelle Marke',  color: '#315AE7' },
    { key: 'find_people',        label: 'Personen finden',        color: '#10B981' },
    { key: 'engage_insights',    label: 'Durch Insights',         color: '#F59E0B' },
    { key: 'build_relationships',label: 'Beziehungen aufbauen',   color: '#8B5CF6' },
  ]
  // Weekly delta
  if (prev) {
    const delta = latest.total_score - prev.total_score
    if (delta > 0) insights.push({ icon: '↑', color: '#10B981', bg: '#F0FDF4', text: `Dein SSI ist seit der letzten Messung um ${delta.toFixed(1)} Punkte gestiegen. Weiter so!` })
    else if (delta < 0) insights.push({ icon: '↓', color: '#EF4444', bg: '#FEF2F2', text: `Dein SSI ist um ${Math.abs(delta).toFixed(1)} Punkte gesunken. Mehr Aktivität auf LinkedIn hilft.` })
    else insights.push({ icon: '→', color: '#6B7280', bg: '#F9FAFB', text: 'Dein Score ist stabil. Poste wöchentlich Inhalte für organisches Wachstum.' })
  }
  // Weakest sub-score
  const sorted = SUBSCORES.map(s => ({ ...s, val: latest[s.key] || 0 })).sort((a, b) => a.val - b.val)
  const weakest = sorted[0]
  const tips = {
    build_brand: 'Veröffentliche 2–3 Artikel pro Woche und optimiere dein LinkedIn-Profil.',
    find_people: 'Nutze die LinkedIn-Suche gezielt und verbinde dich mit 5 neuen Personen täglich.',
    engage_insights: 'Kommentiere täglich 3–5 Beiträge in deiner Branche mit inhaltlichem Mehrwert.',
    build_relationships: 'Schreibe persönliche Nachrichten an bestehende Kontakte und halte Kontakt.'
  }
  insights.push({ icon: '!', color: '#F59E0B', bg: '#FFFBEB', text: `Schwächster Bereich: "${weakest.label}" (${weakest.val}/25). Tipp: ${tips[weakest.key]}` })
  // Top performer
  const best = sorted[sorted.length - 1]
  insights.push({ icon: '★', color: '#315AE7', bg: '#EFF6FF', text: `Stärkster Bereich: "${best.label}" (${best.val}/25). Nutze diesen Vorteil aktiv beim Netzwerken.` })
  // Trend over 30 days
  if (entries.length >= 5) {
    const old = entries[Math.min(entries.length - 1, 4)]
    const growth = latest.total_score - old.total_score
    if (growth > 5) insights.push({ icon: '📈', color: '#10B981', bg: '#F0FDF4', text: `+${growth.toFixed(1)} Punkte in den letzten Messungen — du bist auf dem richtigen Weg!` })
  }
  return insights
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SUBSCORES = [
  { key: 'build_brand',         label: 'Professionelle Marke',  color: '#315AE7' },
  { key: 'find_people',         label: 'Personen finden',        color: '#10B981' },
  { key: 'engage_insights',     label: 'Durch Insights',         color: '#F59E0B' },
  { key: 'build_relationships', label: 'Beziehungen aufbauen',   color: '#8B5CF6' },
]

export default function SSI({ session }) {
  const [entries, setEntries]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [flash, setFlash]             = useState(null)
  const [showForm, setShowForm]       = useState(false)
  const [scraping, setScraping]       = useState(false)
  const [scrapeStatus, setScrapeStatus] = useState('')
  const [chartDays, setChartDays]     = useState(30)
  const [teamData, setTeamData]       = useState([])
  const [form, setForm] = useState({
    total_score: '', build_brand: '', find_people: '',
    engage_insights: '', build_relationships: '',
    industry_rank: '', network_rank: '', notes: '',
    recorded_at: new Date().toISOString().substring(0, 16),
  })

  // ── Load entries ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ssi_scores')
      .select('*')
      .eq('user_id', session.user.id)
      .order('recorded_at', { ascending: false })
      .limit(90)
    setEntries(data || [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  // ── Load team data (other users in same team) ────────────────────────────────
  useEffect(() => {
    async function loadTeam() {
      try {
        // Get current user's team_id from profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('team_id, display_name')
          .eq('id', session.user.id)
          .single()
        if (!profile?.team_id) return

        // Get latest SSI per team member via RPC or direct query
        const { data: teamScores } = await supabase
          .from('ssi_scores')
          .select('user_id, total_score, recorded_at, profiles!inner(display_name, team_id)')
          .eq('profiles.team_id', profile.team_id)
          .order('recorded_at', { ascending: false })

        if (!teamScores) return
        // Deduplicate: keep latest per user
        const seen = {}
        const deduped = []
        for (const row of teamScores) {
          if (!seen[row.user_id]) {
            seen[row.user_id] = true
            deduped.push({
              user_id: row.user_id,
              name: row.profiles?.display_name || 'Teammitglied',
              score: Math.round(row.total_score),
              isMe: row.user_id === session.user.id,
            })
          }
        }
        setTeamData(deduped.sort((a, b) => b.score - a.score))
      } catch (e) { /* Team-Daten optional */ }
    }
    loadTeam()
  }, [session, entries])

  // ── postMessage listener (vom Extension-Popup) ──────────────────────────────
  useEffect(() => {
    async function onMessage(event) {
      if (!event.data || event.data.type !== 'LLR_SSI_SCRAPED') return
      const d = event.data.data
      if (!d || !d.total || d.total <= 0) return

      const { error } = await supabase.from('ssi_scores').insert({
        user_id: session.user.id,
        total_score: d.total,
        build_brand: d.build_brand || 0,
        find_people: d.find_people || 0,
        engage_insights: d.engage_insights || 0,
        build_relationships: d.build_relationships || 0,
        industry_rank: d.industry_rank || null,
        network_rank: d.network_rank || null,
        recorded_at: new Date().toISOString(),
        source: 'extension',
      })
      if (error) { showFlash('Fehler beim Speichern: ' + error.message, 'error'); return }
      setScrapeStatus('✅ SSI Score ' + d.total + ' gespeichert!')
      setScraping(false)
      setTimeout(() => setScrapeStatus(''), 3000)
      load()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [session, load])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function showFlash(msg, type = 'success') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 5000)
  }

  // ── Save manual entry ────────────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault()
    const total = parseFloat(String(form.total_score).replace(',', '.'))
    if (isNaN(total) || total < 0 || total > 100) { showFlash('Score 0–100 eingeben.', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('ssi_scores').insert({
      user_id: session.user.id,
      recorded_at: form.recorded_at || new Date().toISOString(),
      total_score: total,
      build_brand: parseFloat(String(form.build_brand).replace(',', '.')) || 0,
      find_people: parseFloat(String(form.find_people).replace(',', '.')) || 0,
      engage_insights: parseFloat(String(form.engage_insights).replace(',', '.')) || 0,
      build_relationships: parseFloat(String(form.build_relationships).replace(',', '.')) || 0,
      industry_rank: parseInt(form.industry_rank) || null,
      network_rank: parseInt(form.network_rank) || null,
      notes: form.notes || null,
      source: 'manual',
    })
    setSaving(false)
    if (error) { showFlash('Fehler: ' + error.message, 'error'); return }
    showFlash('SSI-Score gespeichert!')
    setShowForm(false)
    setForm({ total_score: '', build_brand: '', find_people: '', engage_insights: '', build_relationships: '', industry_rank: '', network_rank: '', notes: '', recorded_at: new Date().toISOString().substring(0, 16) })
    load()
  }

  // ── Trigger Extension Scrape via scrape_jobs queue ───────────────────────────
  async function handleScrape() {
    if (scraping) return
    setScraping(true)
    setScrapeStatus('🪟 LinkedIn wird geöffnet...')

    // Methode 1: scrape_jobs Queue — Extension holt es im Hintergrund
    try {
      const { error } = await supabase.from('scrape_jobs').insert({
        user_id: session.user.id,
        type: 'ssi',
        url: 'https://www.linkedin.com/sales/ssi',
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      if (!error) {
        setScrapeStatus('⏳ Job in Warteschlange — Extension holt SSI im Hintergrund...')
        // Poll für Ergebnis (max 60s)
        let attempts = 0
        const poll = setInterval(async () => {
          attempts++
          if (attempts > 30) {
            clearInterval(poll)
            setScrapeStatus('⏱ Timeout — bitte Extension prüfen und erneut versuchen.')
            setScraping(false)
            return
          }
          // Check if new entry was added in last 2 min
          const { data } = await supabase
            .from('ssi_scores')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('source', 'extension')
            .gte('recorded_at', new Date(Date.now() - 120000).toISOString())
            .order('recorded_at', { ascending: false })
            .limit(1)
          if (data && data.length > 0) {
            clearInterval(poll)
            setScrapeStatus('✅ SSI Score ' + Math.round(data[0].total_score) + ' von Extension importiert!')
            setScraping(false)
            setTimeout(() => setScrapeStatus(''), 4000)
            load()
          } else {
            setScrapeStatus('🔄 Warte auf Extension... (' + attempts + '/30)')
          }
        }, 2000)
        return
      }
    } catch (e) { /* Fallback zu Popup */ }

    // Methode 2 (Fallback): Popup öffnen + postMessage warten
    setScrapeStatus('🪟 Popup wird geöffnet...')
    const data = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 55000)
      function onMsg(event) {
        if (event.data?.type === 'LLR_SSI_SCRAPED' && event.data?.data?.total > 0) {
          clearTimeout(timeout)
          window.removeEventListener('message', onMsg)
          resolve(event.data.data)
        }
      }
      window.addEventListener('message', onMsg)
      const popup = window.open('https://www.linkedin.com/sales/ssi', 'llr_ssi', 'width=1100,height=700,left=100,top=100')
      if (!popup) { clearTimeout(timeout); window.removeEventListener('message', onMsg); resolve(null) }
      let c = 0
      const interval = setInterval(() => { c++; setScrapeStatus('🔄 Warte auf LinkedIn Score... (' + c + '/27)'); if (c >= 27) clearInterval(interval) }, 2000)
    })
    try { window.open('', 'llr_ssi')?.close() } catch(e) {}
    if (data && data.total > 0) {
      const { error } = await supabase.from('ssi_scores').insert({
        user_id: session.user.id, total_score: data.total,
        build_brand: data.build_brand || 0, find_people: data.find_people || 0,
        engage_insights: data.engage_insights || 0, build_relationships: data.build_relationships || 0,
        industry_rank: data.industry_rank || null, network_rank: data.network_rank || null,
        recorded_at: new Date().toISOString(), source: 'extension',
      })
      if (error) { showFlash('Fehler: ' + error.message, 'error') }
      else { setScrapeStatus('✅ SSI Score ' + data.total + ' gespeichert!'); setTimeout(() => setScrapeStatus(''), 3000); load() }
    } else {
      setScrapeStatus('❌ Kein Score — bitte auf LinkedIn einloggen und erneut versuchen')
      setTimeout(() => setScrapeStatus(''), 8000)
    }
    setScraping(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const latest = entries[0]
  const prev = entries[1]
  const score = latest ? Math.round(latest.total_score) : 0
  const delta = latest && prev ? (latest.total_score - prev.total_score) : null
  const insights = generateInsights(entries)

  const inp = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB',
    borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  return (
    <div style={{ maxWidth: 1000 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={handleScrape} disabled={scraping} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 12,
          border: '1.5px solid rgb(49,90,231)', background: 'white', color: 'rgb(49,90,231)',
          fontSize: 13, fontWeight: 700, cursor: scraping ? 'wait' : 'pointer', opacity: scraping ? 0.7 : 1
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9"/>
          </svg>
          {scraping ? 'Läuft...' : 'SSI Auslesen'}
        </button>

        <button onClick={() => setShowForm(f => !f)} style={{
          padding: '10px 20px', borderRadius: 12, border: 'none',
          background: 'linear-gradient(135deg, rgb(49,90,231), rgb(100,140,240))',
          color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(49,90,231,0.3)'
        }}>
          {showForm ? 'Abbrechen' : '+ Manuell eintragen'}
        </button>

        {scrapeStatus && (
          <div style={{ padding: '8px 14px', background: '#EFF6FF', borderRadius: 10, fontSize: 12, color: '#1D4ED8', fontWeight: 500 }}>
            {scrapeStatus}
          </div>
        )}
      </div>

      {/* ── Flash ── */}
      {flash && (
        <div style={{
          marginBottom: 16, padding: '12px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600,
          background: flash.type === 'error' ? '#FEF2F2' : flash.type === 'info' ? '#EFF6FF' : '#F0FDF4',
          color: flash.type === 'error' ? '#991B1B' : flash.type === 'info' ? '#1D4ED8' : '#065F46',
          border: '1px solid ' + (flash.type === 'error' ? '#FCA5A5' : flash.type === 'info' ? '#BFDBFE' : '#A7F3D0')
        }}>
          {flash.msg}
        </div>
      )}

      {/* ── Manual Form ── */}
      {showForm && (
        <div style={{ background: 'white', borderRadius: 18, border: '1px solid #E5E7EB', padding: '22px 24px', marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'rgb(20,20,43)', marginBottom: 18 }}>SSI-Werte eintragen</div>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Datum</label>
                <input type="datetime-local" value={form.recorded_at} onChange={e => setForm(f => ({ ...f, recorded_at: e.target.value }))} style={inp}/>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgb(49,90,231)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Gesamt-Score *</label>
                <input type="number" value={form.total_score} onChange={e => setForm(f => ({ ...f, total_score: e.target.value }))} style={{ ...inp, fontWeight: 800, fontSize: 20, color: 'rgb(49,90,231)' }} placeholder="z.B. 72" min="0" max="100" required/>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {SUBSCORES.map(s => (
                <div key={s.key}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{s.label}</label>
                  <input type="number" value={form[s.key]} onChange={e => setForm(f => ({ ...f, [s.key]: e.target.value }))} style={inp} placeholder="0–25" min="0" max="25" step="0.1"/>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Branchenranking (%)</label>
                <input type="number" value={form.industry_rank} onChange={e => setForm(f => ({ ...f, industry_rank: e.target.value }))} style={inp} placeholder="z.B. 1" min="0" max="100"/>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Netzwerkranking (%)</label>
                <input type="number" value={form.network_rank} onChange={e => setForm(f => ({ ...f, network_rank: e.target.value }))} style={inp} placeholder="z.B. 2" min="0" max="100"/>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Notizen</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inp, minHeight: 60, resize: 'vertical' }} placeholder="Was hast du diese Woche gemacht?"/>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={saving} style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Speichert...' : 'Speichern'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '10px 18px', borderRadius: 12, border: '1px solid #E5E7EB', background: 'white', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Loading / Empty ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 64, color: '#9CA3AF' }}>Lade SSI-Daten...</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, background: 'white', borderRadius: 20, border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 56, marginBottom: 14 }}>📊</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'rgb(20,20,43)', marginBottom: 8 }}>Noch kein SSI-Score erfasst</div>
          <div style={{ fontSize: 13, color: '#6B7280' }}>Klicke auf "SSI Auslesen" um Werte automatisch von LinkedIn zu importieren.</div>
        </div>
      ) : (
        <div>
          {/* ── Hero Row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

            {/* Left: Score + Donut */}
            <div style={{ background: 'linear-gradient(135deg, rgb(49,90,231) 0%, rgb(119,161,243) 100%)', borderRadius: 20, padding: '24px 28px', color: 'white', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }}/>
              <div style={{ position: 'absolute', bottom: -60, left: -20, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }}/>
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Aktueller SSI</div>
                  <div style={{ fontSize: 68, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>{score}</div>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>von 100 Punkten</div>
                  {delta !== null && (
                    <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '5px 12px' }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>vs. letzte Messung</span>
                    </div>
                  )}
                  {latest.industry_rank && (
                    <div style={{ marginTop: 14, display: 'flex', gap: 16 }}>
                      <div><div style={{ fontSize: 18, fontWeight: 800 }}>Top {latest.industry_rank}%</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Branche</div></div>
                      {latest.network_rank && <div><div style={{ fontSize: 18, fontWeight: 800 }}>Top {latest.network_rank}%</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Netzwerk</div></div>}
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <DonutChart value={score} max={100} size={160} stroke={18} color="white" bg="rgba(255,255,255,0.2)"/>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: 'white', lineHeight: 1 }}>{score}%</span>
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative', zIndex: 1, marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                Letzte Messung: {new Date(latest.recorded_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
                {latest.source === 'extension' && <span style={{ marginLeft: 8, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 999, fontSize: 10 }}>Extension</span>}
              </div>
            </div>

            {/* Right: Sub-Scores */}
            <div style={{ background: 'linear-gradient(135deg, #7C3CAE 0%, #B07AE0 100%)', borderRadius: 20, padding: '24px 28px', color: 'white', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }}/>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Teilscores</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {SUBSCORES.map(s => (
                    <div key={s.key} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 4, lineHeight: 1.3 }}>{s.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{Number(latest[s.key] || 0).toFixed(1)}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>/ 25</div>
                      <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 999 }}>
                        <div style={{ height: '100%', width: ((latest[s.key] || 0) / 25 * 100) + '%', background: 'rgba(255,255,255,0.8)', borderRadius: 999, transition: 'width 0.8s' }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ position: 'relative', zIndex: 1, marginTop: 14, display: 'flex', gap: 8 }}>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700 }}>{entries.length} Messungen</div>
                {entries.length >= 2 && (() => {
                  const diff = (entries[0].total_score - entries[entries.length-1].total_score).toFixed(1)
                  return <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700 }}>{diff >= 0 ? '+' : ''}{diff} Gesamt</div>
                })()}
              </div>
            </div>
          </div>

          {/* ── Sub-Score Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {SUBSCORES.map(s => (
              <SubScoreCard key={s.key} label={s.label} value={Number(latest[s.key] || 0)} color={s.color}/>
            ))}
          </div>

          {/* ── Trend + Insights Row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

            {/* Trend Chart */}
            <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5986 100%)', borderRadius: 20, padding: '22px 24px', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>SSI Verlauf</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[7, 30, 90].map(d => (
                    <button key={d} onClick={() => setChartDays(d)} style={{
                      padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      border: 'none', background: chartDays === d ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                      color: 'white'
                    }}>{d}T</button>
                  ))}
                </div>
              </div>
              <TrendChart entries={entries} days={chartDays}/>
            </div>

            {/* AI Insights */}
            <div style={{ background: 'white', borderRadius: 20, border: '1px solid #E5E7EB', padding: '22px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'rgb(20,20,43)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🤖</span> KI-Empfehlungen
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insights.map((ins, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: ins.bg, borderRadius: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: ins.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white', fontWeight: 700, flexShrink: 0 }}>{ins.icon}</div>
                    <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{ins.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Team Leaderboard (wenn Teamdaten vorhanden) ── */}
          {teamData.length > 1 && (
            <div style={{ background: 'white', borderRadius: 18, border: '1px solid #E5E7EB', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'rgb(20,20,43)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🏆</span> Team-Leaderboard
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
                {teamData.map((m, i) => (
                  <div key={m.user_id} style={{ padding: '12px 16px', borderRadius: 12, background: m.isMe ? '#EFF6FF' : '#F9FAFB', border: m.isMe ? '1.5px solid rgb(49,90,231)' : '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#F59E0B' : i === 1 ? '#9CA3AF' : i === 2 ? '#CD7F32' : '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white' }}>#{i + 1}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: m.isMe ? 'rgb(49,90,231)' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.isMe ? 'Du' : m.name}</div>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: m.isMe ? 'rgb(49,90,231)' : '#1F2937', marginTop: 6, lineHeight: 1 }}>{m.score}</div>
                    <div style={{ height: 3, background: '#E5E7EB', borderRadius: 999, marginTop: 8 }}>
                      <div style={{ height: '100%', width: m.score + '%', background: m.isMe ? 'rgb(49,90,231)' : '#9CA3AF', borderRadius: 999 }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── History Table ── */}
          {entries.length > 1 && (
            <div style={{ background: 'white', borderRadius: 18, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'rgb(20,20,43)' }}>Alle Messungen</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>{entries.length} Einträge</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#F9FAFB' }}>
                    {['Datum', 'Gesamt', 'Marke', 'Personen', 'Insights', 'Beziehungen', 'Branche', 'Netzwerk', 'Quelle', ''].map((h, i) => (
                      <th key={i} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i === 0 ? 'left' : 'center', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {entries.map((e, idx) => {
                      const prevE = entries[idx + 1]
                      const d = prevE ? (e.total_score - prevE.total_score) : null
                      return (
                        <tr key={e.id} style={{ borderBottom: '1px solid #F9FAFB', background: idx === 0 ? '#F5F7FF' : 'white' }}>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: '#374151', fontWeight: 600 }}>
                            {new Date(e.recorded_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 16, fontWeight: 900, color: 'rgb(49,90,231)' }}>{Math.round(e.total_score)}</span>
                              {d !== null && <span style={{ fontSize: 10, color: d > 0 ? '#10B981' : d < 0 ? '#EF4444' : '#9CA3AF' }}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}
                            </div>
                          </td>
                          {['build_brand', 'find_people', 'engage_insights', 'build_relationships'].map((k, i) => (
                            <td key={k} style={{ textAlign: 'center', padding: '12px 8px', fontSize: 13, color: SUBSCORES[i].color, fontWeight: 700 }}>{e[k] || '-'}</td>
                          ))}
                          <td style={{ textAlign: 'center', padding: '12px 8px', fontSize: 11, color: '#6B7280' }}>{e.industry_rank ? 'Top ' + e.industry_rank + '%' : '-'}</td>
                          <td style={{ textAlign: 'center', padding: '12px 8px', fontSize: 11, color: '#6B7280' }}>{e.network_rank ? 'Top ' + e.network_rank + '%' : '-'}</td>
                          <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: e.source === 'extension' ? '#EFF6FF' : '#F9FAFB', color: e.source === 'extension' ? 'rgb(49,90,231)' : '#6B7280', fontWeight: 600 }}>
                              {e.source === 'extension' ? 'Ext.' : 'Manuell'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                            <button onClick={async () => { if (!confirm('Löschen?')) return; await supabase.from('ssi_scores').delete().eq('id', e.id); load() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', fontSize: 13 }}>×</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
