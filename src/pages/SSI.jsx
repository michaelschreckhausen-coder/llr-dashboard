import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/* ── Konstanten ── */
const SSI_LABELS = {
  build_brand:        'Professionelle Marke aufbauen',
  find_people:        'Die richtigen Personen finden',
  engage_insights:    'Durch Insights überzeugen',
  build_relationships:'Beziehungen aufbauen',
}
const SSI_COLORS = {
  build_brand:        '#0A66C2',
  find_people:        '#10B981',
  engage_insights:    '#F59E0B',
  build_relationships:'#8B5CF6',
}
const SSI_ICONS = {
  build_brand:        '🎤',
  find_people:        '🔍',
  engage_insights:    '💡',
  build_relationships:'🤝',
}

/* ── Mini Liniendiagramm ── */
function SparkLine({ data, color, height = 48 }) {
  if (!data || data.length < 2) return null
  const w = 200, h = height
  const vals = data.map(d => d.total_score)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 8) - 4
    return x + ',' + y
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={'0 0 '+w+' '+h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {vals.map((v, i) => {
        const x = (i / (vals.length - 1)) * w
        const y = h - ((v - min) / range) * (h - 8) - 4
        return <circle key={i} cx={x} cy={y} r="3" fill={color}/>
      })}
    </svg>
  )
}

/* ── Score Balken ── */
function ScoreBar({ label, value, color, icon, max = 25 }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ fontSize:16 }}>{icon}</span>
          <span style={{ fontSize:13, fontWeight:600, color:'#475569' }}>{label}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:15, fontWeight:800, color }}>{value}</span>
          <span style={{ fontSize:11, color:'#94A3B8' }}>/ {max}</span>
        </div>
      </div>
      <div style={{ height:8, background:'#F1F5F9', borderRadius:999, overflow:'hidden' }}>
        <div style={{ height:'100%', width:pct+'%', background:color, borderRadius:999, transition:'width 0.6s ease' }}/>
      </div>
    </div>
  )
}

/* ── Verlaufs-Chart ── */
function HistoryChart({ entries }) {
  if (!entries || entries.length < 1) return null
  const sorted = [...entries].sort((a,b) => new Date(a.recorded_at)-new Date(b.recorded_at))
  const w = 600, h = 180, padL = 36, padB = 28, padT = 12, padR = 16
  const iW = w - padL - padR
  const iH = h - padB - padT
  const vals = sorted.map(e => e.total_score)
  const minV = Math.max(0, Math.min(...vals) - 5)
  const maxV = Math.min(100, Math.max(...vals) + 5)
  const range = maxV - minV || 1
  const xOf = i => padL + (i / Math.max(1, sorted.length-1)) * iW
  const yOf = v => padT + iH - ((v-minV)/range)*iH
  const pts = sorted.map((e,i) => xOf(i)+','+yOf(e.total_score)).join(' ')
  const ticks = [0,25,50,75,100].filter(t => t>=minV && t<=maxV)
  return (
    <svg width="100%" viewBox={'0 0 '+w+' '+h} style={{ overflow:'visible' }}>
      {/* Grid */}
      {ticks.map(t => (
        <g key={t}>
          <line x1={padL} y1={yOf(t)} x2={w-padR} y2={yOf(t)} stroke="#F1F5F9" strokeWidth="1"/>
          <text x={padL-4} y={yOf(t)+4} textAnchor="end" fontSize="10" fill="#94A3B8">{t}</text>
        </g>
      ))}
      {/* Area fill */}
      <polygon points={pts+' '+(xOf(sorted.length-1))+','+(padT+iH)+' '+padL+','+(padT+iH)}
        fill="url(#ssiGrad)" opacity="0.15"/>
      <defs>
        <linearGradient id="ssiGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0A66C2"/>
          <stop offset="100%" stopColor="#0A66C2" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Line */}
      <polyline points={pts} fill="none" stroke="#0A66C2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Points + labels */}
      {sorted.map((e, i) => (
        <g key={e.id}>
          <circle cx={xOf(i)} cy={yOf(e.total_score)} r="4" fill="#0A66C2" stroke="#fff" strokeWidth="2"/>
          <text x={xOf(i)} y={yOf(e.total_score)-10} textAnchor="middle" fontSize="10" fill="#0A66C2" fontWeight="700">{Math.round(e.total_score)}</text>
          <text x={xOf(i)} y={h-4} textAnchor="middle" fontSize="9" fill="#94A3B8">
            {new Date(e.recorded_at).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}
          </text>
        </g>
      ))}
    </svg>
  )
}

/* ── Hauptkomponente ── */
export default function SSI({ session }) {
  const [entries,     setEntries]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [flash,       setFlash]       = useState(null)
  const [showForm,    setShowForm]    = useState(false)
  const [scraping,    setScraping]    = useState(false)
  const [form, setForm] = useState({
    total_score: '',
    build_brand: '',
    find_people: '',
    engage_insights: '',
    build_relationships: '',
    industry_rank: '',
    network_rank: '',
    notes: '',
    recorded_at: new Date().toISOString().substring(0,16),
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('ssi_scores')
      .select('*')
      .eq('user_id', session.user.id)
      .order('recorded_at', { ascending: false })
      .limit(90)
    if (!error) setEntries(data || [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  function showFlash(msg, type='success') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  async function handleSave(e) {
    e.preventDefault()
    const total = parseFloat(form.total_score)
    if (isNaN(total) || total < 0 || total > 100) {
      showFlash('Bitte gültigen Gesamtscore (0-100) eingeben.', 'error'); return
    }
    setSaving(true)
    const { error } = await supabase.from('ssi_scores').insert({
      user_id:             session.user.id,
      recorded_at:         form.recorded_at || new Date().toISOString(),
      total_score:         total,
      build_brand:         parseFloat(form.build_brand)||0,
      find_people:         parseFloat(form.find_people)||0,
      engage_insights:     parseFloat(form.engage_insights)||0,
      build_relationships: parseFloat(form.build_relationships)||0,
      industry_rank:       parseInt(form.industry_rank)||null,
      network_rank:        parseInt(form.network_rank)||null,
      notes:               form.notes || null,
      source:              'manual',
    })
    setSaving(false)
    if (error) { showFlash('Fehler: ' + error.message, 'error'); return }
    showFlash('✅ SSI-Score gespeichert!')
    setShowForm(false)
    setForm({ total_score:'', build_brand:'', find_people:'', engage_insights:'', build_relationships:'', industry_rank:'', network_rank:'', notes:'', recorded_at: new Date().toISOString().substring(0,16) })
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Diesen Eintrag löschen?')) return
    await supabase.from('ssi_scores').delete().eq('id', id)
    showFlash('🗑️ Eintrag gelöscht')
    load()
  }

  function handleScrape() {
    setScraping(true)
    showFlash('🔗 LinkedIn SSI-Seite wird geöffnet...', 'info')
    window.open('https://www.linkedin.com/sales/ssi', '_blank')
    setTimeout(() => {
      setScraping(false)
      setShowForm(true)
      showFlash('📋 Trage die Werte aus dem geöffneten LinkedIn-Tab ein.', 'info')
    }, 2000)
  }

  const latest  = entries[0]
  const prev    = entries[1]
  const trend   = latest && prev ? latest.total_score - prev.total_score : null
  const chartData = [...entries].sort((a,b) => new Date(a.recorded_at)-new Date(b.recorded_at))

  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' }

  return (
    <div style={{ maxWidth:860 }}>

      {/* Header */}
      <div style={{ marginBottom:24, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:'-0.02em', color:'#0F172A' }}>
            📈 Social Selling Index
          </h1>
          <p style={{ color:'#64748B', fontSize:13, margin:'4px 0 0', maxWidth:520 }}>
            Tracke deinen LinkedIn SSI-Score über Zeit. Der SSI misst wie effektiv du LinkedIn für Vertrieb nutzt — maximal 100 Punkte.
          </p>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button onClick={handleScrape} disabled={scraping}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', borderRadius:10, border:'1px solid #BFDBFE', background:'#EFF6FF', color:'#0A66C2', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            {scraping ? 'Wird geöffnet...' : 'LinkedIn SSI öffnen'}
          </button>
          <button onClick={() => setShowForm(f => !f)}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0A66C2,#1D4ED8)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(10,102,194,0.3)' }}>
            {showForm ? '✕ Abbrechen' : '+ Werte eintragen'}
          </button>
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div style={{ marginBottom:16, padding:'10px 16px', borderRadius:10, fontSize:13, fontWeight:600,
          background: flash.type==='error'?'#FEF2F2': flash.type==='info'?'#EFF6FF':'#F0FDF4',
          color: flash.type==='error'?'#991B1B': flash.type==='info'?'#1D4ED8':'#065F46',
          border: '1px solid '+(flash.type==='error'?'#FCA5A5': flash.type==='info'?'#BFDBFE':'#A7F3D0') }}>
          {flash.msg}
        </div>
      )}

      {/* Eingabeformular */}
      {showForm && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', padding:'20px 22px', marginBottom:20, boxShadow:'0 2px 8px rgba(15,23,42,0.06)' }}>
          <div style={{ fontSize:15, fontWeight:800, color:'#0F172A', marginBottom:16 }}>Neuen SSI-Wert eintragen</div>
          <form onSubmit={handleSave}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Datum & Uhrzeit</label>
                <input type="datetime-local" value={form.recorded_at} onChange={e=>setForm(f=>({...f,recorded_at:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#0A66C2', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Gesamt-Score (0-100) *</label>
                <input type="number" value={form.total_score} onChange={e=>setForm(f=>({...f,total_score:e.target.value}))} style={{...inp, fontWeight:800, fontSize:18, color:'#0A66C2'}} placeholder="z.B. 72" min="0" max="100" required/>
              </div>
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Teilscores (je 0-25)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              {Object.entries(SSI_LABELS).map(([key, label]) => (
                <div key={key}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:SSI_COLORS[key], textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>
                    {SSI_ICONS[key]} {label}
                  </label>
                  <input type="number" value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inp} placeholder="0-25" min="0" max="25" step="0.1"/>
                </div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Branchenranking</label>
                <input type="number" value={form.industry_rank} onChange={e=>setForm(f=>({...f,industry_rank:e.target.value}))} style={inp} placeholder="z.B. 12 %" min="0" max="100"/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Netzwerkranking</label>
                <input type="number" value={form.network_rank} onChange={e=>setForm(f=>({...f,network_rank:e.target.value}))} style={inp} placeholder="z.B. 8 %" min="0" max="100"/>
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Notizen (optional)</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{...inp, minHeight:60, resize:'vertical'}} placeholder="Was hast du diese Woche besonders gemacht?"/>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button type="submit" disabled={saving}
                style={{ padding:'10px 24px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0A66C2,#1D4ED8)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {saving ? 'Speichert...' : '💾 Speichern'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                style={{ padding:'10px 18px', borderRadius:10, border:'1px solid #E2E8F0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'#94A3B8' }}>⏳ Lade SSI-Daten...</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign:'center', padding:64, background:'#fff', borderRadius:16, border:'1px solid #E2E8F0' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📊</div>
          <div style={{ fontWeight:700, fontSize:16, color:'#0F172A', marginBottom:8 }}>Noch kein SSI-Score erfasst</div>
          <div style={{ fontSize:13, color:'#64748B', maxWidth:380, margin:'0 auto', lineHeight:1.6 }}>
            Öffne LinkedIn SSI über den Button oben, trage dann deine Werte ein um den zeitlichen Verlauf zu tracken.
          </div>
        </div>
      ) : (
        <>
          {/* KPI-Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14, marginBottom:20 }}>
            {/* Aktueller Score */}
            <div style={{ background:'linear-gradient(135deg,#0A66C2,#1D4ED8)', borderRadius:14, padding:'20px 22px', color:'#fff', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', right:-20, top:-20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
              <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.75)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Aktueller SSI</div>
              <div style={{ fontSize:44, fontWeight:800, letterSpacing:'-0.03em', lineHeight:1 }}>{Math.round(latest.total_score)}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginTop:4 }}>von 100 Punkten</div>
              {trend !== null && (
                <div style={{ marginTop:10, fontSize:12, fontWeight:700, color: trend>0?'#A7F3D0':trend<0?'#FCA5A5':'rgba(255,255,255,0.6)' }}>
                  {trend > 0 ? '↑ +' : trend < 0 ? '↓ ' : '→ '}{trend.toFixed(1)} vs. Vorwert
                </div>
              )}
            </div>
            {/* Messzeitpunkt */}
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', padding:'20px 22px', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Letzte Messung</div>
              <div style={{ fontSize:17, fontWeight:800, color:'#0F172A' }}>
                {new Date(latest.recorded_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}
              </div>
              <div style={{ fontSize:13, color:'#64748B', marginTop:4 }}>
                {entries.length} Messung{entries.length!==1?'en':''} insgesamt
              </div>
              {latest.industry_rank && <div style={{ marginTop:8, fontSize:12, color:'#0A66C2', fontWeight:600 }}>Top {latest.industry_rank}% Branche</div>}
              {latest.network_rank && <div style={{ fontSize:12, color:'#10B981', fontWeight:600 }}>Top {latest.network_rank}% Netzwerk</div>}
            </div>
            {/* Trend */}
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', padding:'20px 22px', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Verlauf</div>
              <SparkLine data={chartData} color="#0A66C2"/>
              {entries.length < 2 && <div style={{ fontSize:12, color:'#94A3B8', marginTop:8 }}>Mehr Messungen für Verlauf</div>}
            </div>
          </div>

          {/* Teilscores */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', padding:'20px 22px', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#0F172A', marginBottom:16 }}>Aktuelle Teilscores</div>
              {Object.entries(SSI_LABELS).map(([key, label]) => (
                <ScoreBar key={key} label={label} value={latest[key]||0} color={SSI_COLORS[key]} icon={SSI_ICONS[key]}/>
              ))}
            </div>
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', padding:'20px 22px', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#0F172A', marginBottom:16 }}>Gesamtscore Verlauf</div>
              {chartData.length > 1 ? (
                <HistoryChart entries={chartData}/>
              ) : (
                <div style={{ textAlign:'center', padding:32, color:'#94A3B8', fontSize:13 }}>
                  Mindestens 2 Messungen für Verlaufsdiagramm
                </div>
              )}
            </div>
          </div>

          {/* Tabelle */}
          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', overflow:'hidden', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#0F172A' }}>Alle Messungen</div>
              <div style={{ fontSize:11, color:'#94A3B8' }}>{entries.length} Einträge</div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#F8FAFC' }}>
                    {['Datum','Gesamt','Marke','Personen','Insights','Beziehungen','Branche','Netzwerk','Quelle',''].map((h,i) => (
                      <th key={i} style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', textAlign:i===0?'left':'center', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, idx) => (
                    <tr key={e.id} style={{ borderBottom:'1px solid #F8FAFC', background:idx===0?'#F0F9FF':'#fff' }}>
                      <td style={{ padding:'10px 12px', fontSize:12, color:'#475569', whiteSpace:'nowrap' }}>
                        <div style={{ fontWeight:600 }}>{new Date(e.recorded_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</div>
                        {e.notes && <div style={{ fontSize:10, color:'#94A3B8', marginTop:2, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={e.notes}>{e.notes}</div>}
                      </td>
                      <td style={{ textAlign:'center', padding:'10px 8px' }}>
                        <span style={{ fontSize:15, fontWeight:800, color:'#0A66C2' }}>{Math.round(e.total_score)}</span>
                      </td>
                      {['build_brand','find_people','engage_insights','build_relationships'].map(k => (
                        <td key={k} style={{ textAlign:'center', padding:'10px 8px', fontSize:12, color:SSI_COLORS[k], fontWeight:600 }}>{e[k]||'-'}</td>
                      ))}
                      <td style={{ textAlign:'center', padding:'10px 8px', fontSize:11, color:'#64748B' }}>{e.industry_rank ? 'Top '+e.industry_rank+'%' : '-'}</td>
                      <td style={{ textAlign:'center', padding:'10px 8px', fontSize:11, color:'#64748B' }}>{e.network_rank ? 'Top '+e.network_rank+'%' : '-'}</td>
                      <td style={{ textAlign:'center', padding:'10px 8px' }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:999, background:e.source==='auto'?'#EFF6FF':'#F1F5F9', color:e.source==='auto'?'#0A66C2':'#64748B' }}>
                          {e.source==='auto'?'🤖 Auto':'✏️ Manuell'}
                        </span>
                      </td>
                      <td style={{ textAlign:'center', padding:'10px 8px' }}>
                        <button onClick={() => handleDelete(e.id)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', fontSize:14, padding:2, borderRadius:4 }}
                          title="Löschen">
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
