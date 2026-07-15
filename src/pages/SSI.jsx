import { useTranslation } from 'react-i18next'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { EXTENSION_WEBSTORE_URL } from '../lib/leadeskExtension'

// ─── Waalaxy-style Donut Chart ────────────────────────────────────────────────
function DonutChart({ value, max=100, size=180, stroke=16, color='white', bg='rgba(255,255,255,0.2)' }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, Math.max(0, value / max))
  const dash = pct * circ
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bg} strokeWidth={stroke} strokeLinecap="round"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ - dash}
        style={{ transition:'stroke-dashoffset 1s ease' }}/>
    </svg>
  )
}

// ─── Score Arc (small colored arc) ───────────────────────────────────────────
function ScoreArc({ value, max=25, color, size=64 }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, value / max)
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={8} strokeLinecap="round"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ*(1-pct)}
        style={{ transition:'stroke-dashoffset 0.8s ease' }}/>
    </svg>
  )
}

// ─── Sub Score Card ────────────────────────────────────────────────────────────
function SubScoreCard({ label, value, max=25, color, icon }) {
  return (
    <div style={{ background:'var(--surface)', borderRadius:16, padding:'16px 18px', border:'1px solid rgba(0,0,0,0.06)', display:'flex', alignItems:'center', gap:14, boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ position:'relative', flexShrink:0 }}>
        <ScoreArc value={value} max={max} color={color}/>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:11, fontWeight:700, color, lineHeight:1 }}>{Number(value).toFixed(0)}</span>
        </div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</div>
        <div style={{ height:4, background:'rgba(0,0,0,0.06)', borderRadius:999, overflow:'hidden' }}>
          <div style={{ height:'100%', width:(value/max*100)+'%', background:color, borderRadius:999, transition:'width 0.8s ease' }}/>
        </div>
        <div style={{ fontSize:10, color:'#9CA3AF', marginTop:3 }}>{value} / {max}</div>
      </div>
    </div>
  )
}

// ─── Reports-Stil Verlaufschart (Linien-Graph, cleane Karte) ─────────────────
function SsiTrend({ entries }) {
  const primary = 'var(--wl-primary, #0A6FB0)'
  // entries: neuste zuerst → chronologisch, letzte 24
  const data = entries.slice(0, 24).reverse().map(e => ({
    score: Math.round(e.total_score),
    label: new Date(e.recorded_at).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }),
  }))
  if (data.length < 2) return null
  const W = 800, H = 180, padL = 30, padR = 14, padT = 12, padB = 8
  const scores = data.map(d => d.score)
  const hi = Math.min(100, Math.ceil((Math.max(...scores) + 4) / 5) * 5)
  const lo = Math.max(0, Math.floor((Math.min(...scores) - 4) / 5) * 5)
  const span = Math.max(1, hi - lo)
  const x = i => padL + (i / (data.length - 1)) * (W - padL - padR)
  const y = v => padT + (1 - (v - lo) / span) * (H - padT - padB)
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.score).toFixed(1)}`)
  const linePath = 'M' + pts.join(' L')
  const areaPath = `M${x(0).toFixed(1)},${(H - padB).toFixed(1)} L${pts.join(' L')} L${x(data.length - 1).toFixed(1)},${(H - padB).toFixed(1)} Z`
  const grid = [hi, Math.round((hi + lo) / 2), lo]
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, boxShadow:'var(--shadow-card)', padding:18, marginBottom:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <h3 style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', margin:0 }}>SSI-Verlauf</h3>
        <span style={{ fontSize:11, color:'#9CA3AF' }}>letzte {data.length} Messungen · Gesamt-Score</span>
      </div>
      <svg width="100%" height="180" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display:'block' }}>
        <defs>
          <linearGradient id="ssiArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primary} stopOpacity="0.16"/>
            <stop offset="100%" stopColor={primary} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="#F3F4F6" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
            <text x={padL - 6} y={y(g) + 3} fontSize="9" textAnchor="end" fill="#9CA3AF">{g}</text>
          </g>
        ))}
        <path d={areaPath} fill="url(#ssiArea)"/>
        <path d={linePath} fill="none" stroke={primary} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
      </svg>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, paddingLeft:22, fontSize:9, color:'#9CA3AF' }}>
        <span>{data[0].label}</span>
        {data.length > 2 && <span>{data[Math.floor((data.length - 1) / 2)].label}</span>}
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  )
}

const SUBSCORES = [
  { key:'build_brand',         label:'Professionelle Marke', color:'#0A6FB0', icon:'B' },
  { key:'find_people',         label:'Personen finden',      color:'#10B981', icon:'P' },
  { key:'engage_insights',     label:'Durch Insights',       color:'#F59E0B', icon:'I' },
  { key:'build_relationships', label:'Beziehungen aufbauen', color:'#0A6FB0', icon:'R' },
]

export default function SSI({ session }) {
  const { activeBrandVoice } = useBrandVoice()
  const [entries,  setEntries]  = useState([])
  const { t } = useTranslation()
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [flash,    setFlash]    = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    total_score:'', build_brand:'', find_people:'',
    engage_insights:'', build_relationships:'',
    industry_rank:'', network_rank:'', notes:'',
    recorded_at: new Date().toISOString().substring(0,16),
  })

  const load = useCallback(async () => {
    setLoading(true)
    // SSI ist account-weit (eine LinkedIn-Kennzahl pro Account), NICHT pro
    // Brand Voice — daher kein brand_voice_id-Filter. (Vorher: beim Mount alle
    // geladen, dann nach BV-Resolve gefiltert -> Score verschwand wieder.)
    const { data } = await supabase.from('ssi_scores').select('*')
      .eq('user_id', session.user.id)
      .order('recorded_at', { ascending: false }).limit(90)
    setEntries(data || [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 5000) }

  async function handleSave(e) {
    e.preventDefault()
    const total = parseFloat(String(form.total_score).replace(',','.'))
    if (isNaN(total)||total<0||total>100) { showFlash('Score 0-100 eingeben.','error'); return }
    setSaving(true)
    const { error } = await supabase.from('ssi_scores').insert({
      brand_voice_id: activeBrandVoice?.id || null,
      user_id: session.user.id, recorded_at: form.recorded_at || new Date().toISOString(),
      total_score: total,
      build_brand: parseFloat(String(form.build_brand).replace(',','.'))||0,
      find_people: parseFloat(String(form.find_people).replace(',','.'))||0,
      engage_insights: parseFloat(String(form.engage_insights).replace(',','.'))||0,
      build_relationships: parseFloat(String(form.build_relationships).replace(',','.'))||0,
      industry_rank: parseInt(form.industry_rank)||null,
      network_rank: parseInt(form.network_rank)||null,
      notes: form.notes||null, source:'manual',
    })
    setSaving(false)
    if (error) { showFlash('Fehler: '+error.message,'error'); return }
    showFlash('SSI-Score gespeichert!')
    setShowForm(false)
    setForm({ total_score:'',build_brand:'',find_people:'',engage_insights:'',build_relationships:'',industry_rank:'',network_rank:'',notes:'',recorded_at:new Date().toISOString().substring(0,16) })
    load()
  }


  const latest = entries[0]
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  const score = latest ? Math.round(latest.total_score) : 0
  const prevEntry = entries[1]
  const trend = latest && prevEntry ? Math.round(latest.total_score) - Math.round(prevEntry.total_score) : null

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>

      {/* ── Journal-Header (analog /messages, /automatisierung) ── */}
      <div style={{ marginBottom:22, display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:20, flexWrap:'wrap' }}>

        <div style={{ flex:'1 1 auto', minWidth:280 }}>
          <div className="lk-eyebrow" style={{ fontSize:12, fontWeight:700, letterSpacing:'1.6px', textTransform:'uppercase', fontFamily:'Inter, sans-serif', color:'var(--primary, #003060)', marginBottom:6 }}>LinkedIn · SSI</div>
          <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2, color:'var(--text-primary, rgb(20,20,43))' }}>Dein Social Selling Index.</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6, maxWidth:600 }}>
            Dein LinkedIn-SSI im Blick — automatisch über die Extension ausgelesen oder manuell erfasst.
          </p>
        </div>

        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <a href={EXTENSION_WEBSTORE_URL} target="_blank" rel="noopener noreferrer"
            title="Der SSI wird automatisch über die Leadesk Chrome-Extension ausgelesen"
            style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 18px', borderRadius:12, border:'1.5px solid #0A6FB0', background:'var(--surface)', color:'var(--wl-primary, #0A6FB0)', fontSize:13, fontWeight:700, cursor:'pointer', textDecoration:'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
            SSI per Extension auslesen
          </a>
          <button className="lk-btn lk-btn-primary" onClick={() => setShowForm(f=>!f)} >
            {showForm ? 'Abbrechen' : '+ Eintragen'}
          </button>
        </div>
      </div>

      {flash && (
        <div style={{ marginBottom:16, padding:'12px 18px', borderRadius:12, fontSize:13, fontWeight:600, background:flash.type==='error'?'#FEF2F2':flash.type==='info'?'#EFF6FF':'#F0FDF4', color:flash.type==='error'?'#991B1B':flash.type==='info'?'#1D4ED8':'#065F46', border:'1px solid '+(flash.type==='error'?'#FCA5A5':flash.type==='info'?'#BFDBFE':'#A7F3D0') }}>
          {flash.msg}
        </div>
      )}

      {showForm && (
        <div style={{ background:'var(--surface)', borderRadius:18, border:'1px solid var(--border)', padding:'22px 24px', marginBottom:24, boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:16, fontWeight:800, color:'rgb(20,20,43)', marginBottom:18 }}>SSI-Werte eintragen</div>
          <form onSubmit={handleSave}>
            <div className="col-2" style={{ gap:14, marginBottom:14 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Datum</label>
                <input type="datetime-local" value={form.recorded_at} onChange={e=>setForm(f=>({...f,recorded_at:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--wl-primary, #0A6FB0)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Gesamt-Score *</label>
                <input type="number" value={form.total_score} onChange={e=>setForm(f=>({...f,total_score:e.target.value}))} style={{...inp, fontWeight:800, fontSize:20, color:'var(--wl-primary, #0A6FB0)'}} placeholder="z.B. 72" min="0" max="100" required/>
              </div>
            </div>
            <div className="col-2" style={{ gap:12, marginBottom:14 }}>
              {SUBSCORES.map(s => (
                <div key={s.key}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>{s.label}</label>
                  <input type="number" value={form[s.key]} onChange={e=>setForm(f=>({...f,[s.key]:e.target.value}))} style={inp} placeholder="0-25" min="0" max="25" step="0.1"/>
                </div>
              ))}
            </div>
            <div className="col-2" style={{ gap:12, marginBottom:14 }}>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Branchenranking (%)</label><input type="number" value={form.industry_rank} onChange={e=>setForm(f=>({...f,industry_rank:e.target.value}))} style={inp} placeholder="z.B. 1" min="0" max="100"/></div>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Netzwerkranking (%)</label><input type="number" value={form.network_rank} onChange={e=>setForm(f=>({...f,network_rank:e.target.value}))} style={inp} placeholder="z.B. 2" min="0" max="100"/></div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Notizen</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{...inp,minHeight:60,resize:'vertical'}} placeholder="Was hast du diese Woche gemacht?"/>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="lk-btn lk-btn-cta" type="submit" disabled={saving} >{saving?'Speichert...':'Speichern'}</button>
              <button className="lk-btn lk-btn-ghost" type="button" onClick={()=>setShowForm(false)} >Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:64, color:'#9CA3AF' }}>Lade SSI-Daten...</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign:'center', padding:80, background:'var(--surface)', borderRadius:20, border:'1px solid var(--border)' }}>
          <div style={{ fontSize:56, marginBottom:14 }}>📊</div>
          <div style={{ fontWeight:800, fontSize:18, color:'rgb(20,20,43)', marginBottom:8 }}>Noch kein SSI-Score erfasst</div>
          <div style={{ fontSize:13, color:'var(--text-muted)' }}>Lass deinen SSI per Leadesk Chrome-Extension auslesen oder trage die Werte über „+ Eintragen" manuell ein.</div>
        </div>
      ) : (
        <div>
          {/* Hero — Reports-Karten-Layout (clean, kein Gradient) */}
          <div className="col-2" style={{ gap:16, marginBottom:16 }}>

            {/* Aktueller SSI — cleaner Donut + Score + Trend + Ranking */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, boxShadow:'var(--shadow-card)', padding:18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <h3 style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', margin:0 }}>Aktueller SSI</h3>
                <span style={{ fontSize:11, color:'#9CA3AF' }}>{new Date(latest.recorded_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:22 }}>
                <div style={{ position:'relative', flexShrink:0, width:120, height:120 }}>
                  <DonutChart value={score} max={100} size={120} stroke={12} color="var(--wl-primary, #0A6FB0)" bg="#F3F4F6"/>
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
                    <span style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)', lineHeight:1 }}>{score}</span>
                    <span style={{ fontSize:10, color:'#9CA3AF' }}>/ 100</span>
                  </div>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                    <span style={{ fontSize:13, color:'#6B7280' }}>Gesamt-Score</span>
                    {trend !== null && trend !== 0 && (
                      <span style={{ fontSize:13, fontWeight:700, color:trend>0?'#059669':'#DC2626' }}>{trend>0?'↑ +':'↓ '}{trend}</span>
                    )}
                  </div>
                  {(latest.industry_rank || latest.network_rank) && (
                    <div style={{ marginTop:14, display:'flex', gap:24 }}>
                      {latest.industry_rank && <div><div style={{ fontSize:18, fontWeight:800, color:'rgb(20,20,43)' }}>Top {latest.industry_rank}%</div><div style={{ fontSize:11, color:'#9CA3AF' }}>Branche</div></div>}
                      {latest.network_rank && <div><div style={{ fontSize:18, fontWeight:800, color:'rgb(20,20,43)' }}>Top {latest.network_rank}%</div><div style={{ fontSize:11, color:'#9CA3AF' }}>Netzwerk</div></div>}
                    </div>
                  )}
                  <div style={{ marginTop:14, fontSize:11, color:'#9CA3AF' }}>{entries.length} Messungen erfasst</div>
                </div>
              </div>
            </div>

            {/* Teilscores — Reports-BarRows */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, boxShadow:'var(--shadow-card)', padding:18 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', margin:'0 0 14px' }}>Teilscores</h3>
              {SUBSCORES.map(s => {
                const v = Number(latest[s.key] || 0)
                const pct = Math.min(100, v / 25 * 100)
                return (
                  <div key={s.key} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:5 }}>
                      <span style={{ fontSize:13, color:'#374151', fontWeight:500 }}>{s.label}</span>
                      <span style={{ fontSize:12, color:'#6B7280' }}><strong style={{ color:'rgb(20,20,43)' }}>{v.toFixed(1)}</strong> / 25</span>
                    </div>
                    <div style={{ height:6, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:pct+'%', height:'100%', background:s.color, transition:'width 0.5s' }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Verlaufs-Chart (Reports-Stil) */}
          <SsiTrend entries={entries} />

          {/* History Table */}
          {entries.length > 1 && (
            <div style={{ background:'var(--surface)', borderRadius:18, border:'1px solid var(--border)', overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:14, fontWeight:800, color:'rgb(20,20,43)' }}>Alle Messungen</div>
                <div style={{ fontSize:11, color:'#9CA3AF' }}>{entries.length} Eintraege</div>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr style={{ background:'var(--surface-muted)' }}>
                    {['Datum','Gesamt','Marke','Personen','Insights','Beziehungen','Branche','Netzwerk',''].map((h,i)=>(
                      <th key={i} style={{ padding:'8px 14px', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', textAlign:i===0?'left':'center', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {entries.map((e,idx)=>(
                      <tr key={e.id} style={{ borderBottom:'1px solid #F9FAFB', background:idx===0?'#F5F7FF':'white' }}>
                        <td style={{ padding:'12px 14px', fontSize:12, color:'var(--text-primary)', fontWeight:600 }}>{new Date(e.recorded_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</td>
                        <td style={{ textAlign:'center', padding:'12px 8px' }}><span style={{ fontSize:16, fontWeight:900, color:'var(--wl-primary, #0A6FB0)' }}>{Math.round(e.total_score)}</span></td>
                        {['build_brand','find_people','engage_insights','build_relationships'].map((k,i)=>(
                          <td key={k} style={{ textAlign:'center', padding:'12px 8px', fontSize:13, color:SUBSCORES[i].color, fontWeight:700 }}>{e[k]||'-'}</td>
                        ))}
                        <td style={{ textAlign:'center', padding:'12px 8px', fontSize:11, color:'var(--text-muted)' }}>{e.industry_rank?'Top '+e.industry_rank+'%':'-'}</td>
                        <td style={{ textAlign:'center', padding:'12px 8px', fontSize:11, color:'var(--text-muted)' }}>{e.network_rank?'Top '+e.network_rank+'%':'-'}</td>
                        <td style={{ textAlign:'center', padding:'12px 8px' }}>
                          <button onClick={async()=>{if(!confirm('Loeschen?'))return;await supabase.from('ssi_scores').delete().eq('id',e.id);load()}} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:13 }}>del</button>
                        </td>
                      </tr>
                    ))}
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
