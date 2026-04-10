import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

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
    <div style={{ background:'white', borderRadius:16, padding:'16px 18px', border:'1px solid rgba(0,0,0,0.06)', display:'flex', alignItems:'center', gap:14, boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ position:'relative', flexShrink:0 }}>
        <ScoreArc value={value} max={max} color={color}/>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:11, fontWeight:700, color, lineHeight:1 }}>{Number(value).toFixed(0)}</span>
        </div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, color:'#6B7280', marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</div>
        <div style={{ height:4, background:'rgba(0,0,0,0.06)', borderRadius:999, overflow:'hidden' }}>
          <div style={{ height:'100%', width:(value/max*100)+'%', background:color, borderRadius:999, transition:'width 0.8s ease' }}/>
        </div>
        <div style={{ fontSize:10, color:'#9CA3AF', marginTop:3 }}>{value} / {max}</div>
      </div>
    </div>
  )
}

const SUBSCORES = [
  { key:'build_brand',         label:'Professionelle Marke', color:'#315AE7', icon:'B' },
  { key:'find_people',         label:'Personen finden',      color:'#10B981', icon:'P' },
  { key:'engage_insights',     label:'Durch Insights',       color:'#F59E0B', icon:'I' },
  { key:'build_relationships', label:'Beziehungen aufbauen', color:'#8B5CF6', icon:'R' },
]

export default function SSI({ session }) {
  const [entries,  setEntries]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [flash,    setFlash]    = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [scrapeStatus, setScrapeStatus] = useState('')
  const [form, setForm] = useState({
    total_score:'', build_brand:'', find_people:'',
    engage_insights:'', build_relationships:'',
    industry_rank:'', network_rank:'', notes:'',
    recorded_at: new Date().toISOString().substring(0,16),
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('ssi_scores').select('*')
      .eq('user_id', session.user.id)
      .order('recorded_at', { ascending: false }).limit(90)
    setEntries(data || [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function checkScrape() {
      try {
        const raw = localStorage.getItem(SCRAPE_KEY)
        if (!raw) return
        const d = JSON.parse(raw)
        if (Date.now() - d.ts > 120000) { localStorage.removeItem(SCRAPE_KEY); return }
        localStorage.removeItem(SCRAPE_KEY)
        setForm(f => ({ ...f, total_score:String(d.total||''), build_brand:String(d.build_brand||''), find_people:String(d.find_people||''), engage_insights:String(d.engage_insights||''), build_relationships:String(d.build_relationships||''), industry_rank:String(d.industry_rank||''), network_rank:String(d.network_rank||''), recorded_at:new Date().toISOString().substring(0,16) }))
        setShowForm(true); setScraping(false)
        showFlash('Werte eingelesen! Bitte pruefen.', 'info')
      } catch(e) {}
    }
    window.addEventListener('focus', checkScrape)
    return () => window.removeEventListener('focus', checkScrape)
  }, [])

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 5000) }

  async function handleSave(e) {
    e.preventDefault()
    const total = parseFloat(String(form.total_score).replace(',','.'))
    if (isNaN(total)||total<0||total>100) { showFlash('Score 0-100 eingeben.','error'); return }
    setSaving(true)
    const { error } = await supabase.from('ssi_scores').insert({
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

  async function handleScrape() {
    if (scraping) return
    setScraping(true)
    setScrapeStatus('🪟 LinkedIn wird geöffnet...')
    try {
      let data = null

      // Warte auf postMessage vom content.js (LLR_SSI_SCRAPED)
      data = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 55000)

        function onMessage(event) {
          if (event.data && event.data.type === 'LLR_SSI_SCRAPED' && event.data.data && event.data.data.total > 0) {
            clearTimeout(timeout)
            window.removeEventListener('message', onMessage)
            resolve(event.data.data)
          }
        }
        window.addEventListener('message', onMessage)

        // Popup öffnen — content.js sendet postMessage ans opener
        const popup = window.open('https://www.linkedin.com/sales/ssi', 'llr_ssi', 'width=1100,height=700,left=100,top=100')
        if (!popup) {
          clearTimeout(timeout)
          window.removeEventListener('message', onMessage)
          resolve(null)
        }

        // Status-Updates während Warten
        let count = 0
        const interval = setInterval(() => {
          count++
          setScrapeStatus('🔄 Warte auf LinkedIn Score... (' + count + '/27)')
          if (count >= 27) clearInterval(interval)
        }, 2000)

        // Cleanup beim resolve
        const origResolve = resolve
        resolve = (val) => { clearInterval(interval); origResolve(val) }
      })

      // Popup schließen falls noch offen
      try { const p = window.open('', 'llr_ssi'); if (p) p.close() } catch(e) {}

      if (data && data.total > 0) {
        const { error } = await supabase.from('ssi_scores').insert({
          user_id:             session.user.id,
          total_score:         data.total,
          build_brand:         data.build_brand || 0,
          find_people:         data.find_people || 0,
          engage_insights:     data.engage_insights || 0,
          build_relationships: data.build_relationships || 0,
          industry_rank:       data.industry_rank || null,
          network_rank:        data.network_rank  || null,
          recorded_at:         new Date().toISOString(),
          source:              'extension'
        })
        if (error) throw new Error(error.message)
        setForm(f => ({
          ...f,
          total_score:         String(data.total),
          build_brand:         String(data.build_brand || ''),
          find_people:         String(data.find_people || ''),
          engage_insights:     String(data.engage_insights || ''),
          build_relationships: String(data.build_relationships || ''),
          industry_rank:       String(data.industry_rank || ''),
          network_rank:        String(data.network_rank  || ''),
          recorded_at:         new Date().toISOString().slice(0,16)
        }))
        setScrapeStatus('✅ SSI Score ' + data.total + ' gespeichert!')
        setShowForm(false)
        setTimeout(() => { setScrapeStatus(''); loadEntries() }, 2000)
      } else {
        setScrapeStatus('❌ Kein Score — bitte auf LinkedIn einloggen und erneut versuchen')
        setTimeout(() => setScrapeStatus(''), 8000)
      }
    } catch(err) {
      setScrapeStatus('❌ Fehler: ' + err.message)
      setTimeout(() => setScrapeStatus(''), 6000)
    } finally {
      setScraping(false)
    }
  }

  const latest = entries[0]
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  const score = latest ? Math.round(latest.total_score) : 0
  const prevEntry = entries[1]
  const trend = latest && prevEntry ? Math.round(latest.total_score) - Math.round(prevEntry.total_score) : null

  return (
    <div style={{ maxWidth:960 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom:24, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={handleScrape} disabled={scraping} style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 18px', borderRadius:12, border:'1.5px solid rgb(49,90,231)', background:'white', color:'rgb(49,90,231)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9"/></svg>
            {scraping ? 'Warte...' : 'Auslesen'}
          </button>
          {scrapeStatus && <div style={{marginTop:8,padding:'8px 12px',background:'#EFF6FF',borderRadius:8,fontSize:12,color:'#1D4ED8',fontWeight:500}}>{scrapeStatus}</div>}
          <button onClick={() => setShowForm(f=>!f)} style={{ padding:'10px 20px', borderRadius:12, border:'none', background:'linear-gradient(135deg, rgb(49,90,231), rgb(100,140,240))', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(49,90,231,0.3)' }}>
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
        <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', padding:'22px 24px', marginBottom:24, boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:16, fontWeight:800, color:'rgb(20,20,43)', marginBottom:18 }}>SSI-Werte eintragen</div>
          <form onSubmit={handleSave}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Datum</label>
                <input type="datetime-local" value={form.recorded_at} onChange={e=>setForm(f=>({...f,recorded_at:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgb(49,90,231)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Gesamt-Score *</label>
                <input type="number" value={form.total_score} onChange={e=>setForm(f=>({...f,total_score:e.target.value}))} style={{...inp, fontWeight:800, fontSize:20, color:'rgb(49,90,231)'}} placeholder="z.B. 72" min="0" max="100" required/>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              {SUBSCORES.map(s => (
                <div key={s.key}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>{s.label}</label>
                  <input type="number" value={form[s.key]} onChange={e=>setForm(f=>({...f,[s.key]:e.target.value}))} style={inp} placeholder="0-25" min="0" max="25" step="0.1"/>
                </div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Branchenranking (%)</label><input type="number" value={form.industry_rank} onChange={e=>setForm(f=>({...f,industry_rank:e.target.value}))} style={inp} placeholder="z.B. 1" min="0" max="100"/></div>
              <div><label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Netzwerkranking (%)</label><input type="number" value={form.network_rank} onChange={e=>setForm(f=>({...f,network_rank:e.target.value}))} style={inp} placeholder="z.B. 2" min="0" max="100"/></div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Notizen</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{...inp,minHeight:60,resize:'vertical'}} placeholder="Was hast du diese Woche gemacht?"/>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button type="submit" disabled={saving} style={{ padding:'10px 24px', borderRadius:12, border:'none', background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving?'Speichert...':'Speichern'}</button>
              <button type="button" onClick={()=>setShowForm(false)} style={{ padding:'10px 18px', borderRadius:12, border:'1px solid #E5E7EB', background:'white', color:'#6B7280', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:64, color:'#9CA3AF' }}>Lade SSI-Daten...</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign:'center', padding:80, background:'white', borderRadius:20, border:'1px solid #E5E7EB' }}>
          <div style={{ fontSize:56, marginBottom:14 }}>📊</div>
          <div style={{ fontWeight:800, fontSize:18, color:'rgb(20,20,43)', marginBottom:8 }}>Noch kein SSI-Score erfasst</div>
          <div style={{ fontSize:13, color:'#6B7280' }}>Klicke auf "Auslesen" um Werte von LinkedIn zu importieren.</div>
        </div>
      ) : (
        <div>
          {/* Hero: Big Donut like Waalaxy */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

            {/* Left: LinkedIn-style gradient card with Donut */}
            <div style={{ background:'linear-gradient(135deg, rgb(49,90,231) 0%, rgb(119,161,243) 100%)', borderRadius:20, padding:'24px 28px', color:'white', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-40, right:-40, width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
              <div style={{ position:'absolute', bottom:-60, left:-20, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }}/>
              <div style={{ position:'relative', zIndex:1, display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.75)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Aktueller SSI</div>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ fontSize:68, fontWeight:900, letterSpacing:'-0.04em', lineHeight:1 }}>{score}</div>
                    {trend !== null && trend !== 0 && (
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                        <span style={{ fontSize:22, fontWeight:900, color:trend>0?'#4ade80':'#f87171' }}>{trend>0?'↑':'↓'}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:trend>0?'#4ade80':'#f87171' }}>{trend>0?'+':''}{trend}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize:14, color:'rgba(255,255,255,0.7)', marginTop:6 }}>von 100 Punkten</div>
                  {latest.industry_rank && <div style={{ marginTop:14, display:'flex', gap:16 }}>
                    <div><div style={{ fontSize:18, fontWeight:800 }}>Top {latest.industry_rank}%</div><div style={{ fontSize:11, color:'rgba(255,255,255,0.65)' }}>Branche</div></div>
                    {latest.network_rank && <div><div style={{ fontSize:18, fontWeight:800 }}>Top {latest.network_rank}%</div><div style={{ fontSize:11, color:'rgba(255,255,255,0.65)' }}>Netzwerk</div></div>}
                  </div>}
                </div>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <DonutChart value={score} max={100} size={160} stroke={18} color="white" bg="rgba(255,255,255,0.2)"/>
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
                    <span style={{ fontSize:22, fontWeight:900, color:'white', lineHeight:1 }}>{score}%</span>
                  </div>
                </div>
              </div>
              <div style={{ position:'relative', zIndex:1, marginTop:16, fontSize:11, color:'rgba(255,255,255,0.6)' }}>
                Letzte Messung: {new Date(latest.recorded_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})}
              </div>
            </div>

            {/* Right: Purple SSI Rankings card */}
            <div style={{ background:'linear-gradient(135deg, #7C3CAE 0%, #B07AE0 100%)', borderRadius:20, padding:'24px 28px', color:'white', position:'relative', overflow:'hidden', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
              <div style={{ position:'absolute', top:-30, right:-30, width:140, height:140, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
              <div style={{ position:'relative', zIndex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.75)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>Teilscores</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  {SUBSCORES.map(s => (
                    <div key={s.key} style={{ background:'rgba(255,255,255,0.12)', borderRadius:12, padding:'10px 12px' }}>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginBottom:4, lineHeight:1.3 }}>{s.label}</div>
                      <div style={{ fontSize:22, fontWeight:800, lineHeight:1 }}>{Number(latest[s.key]||0).toFixed(1)}</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>/ 25</div>
                      <div style={{ marginTop:6, height:3, background:'rgba(255,255,255,0.2)', borderRadius:999 }}>
                        <div style={{ height:'100%', width:((latest[s.key]||0)/25*100)+'%', background:'rgba(255,255,255,0.8)', borderRadius:999, transition:'width 0.8s' }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ position:'relative', zIndex:1, marginTop:14, display:'flex', gap:8 }}>
                {entries.length >= 2 && (() => {
                  const prev = entries[1]
                  const diff = (latest.total_score - prev.total_score).toFixed(1)
                  const up = diff >= 0
                  return <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'8px 12px', fontSize:13, fontWeight:700 }}>{up?'+':''}{diff} vs. Vorwert</div>
                })()}
                <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'8px 12px', fontSize:13, fontWeight:700 }}>{entries.length} Messungen</div>
              </div>
            </div>
          </div>

          {/* Sub Score Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
            {SUBSCORES.map(s => (
              <SubScoreCard key={s.key} label={s.label} value={Number(latest[s.key]||0)} color={s.color}/>
            ))}
          </div>

          {/* History Table */}
          {entries.length > 1 && (
            <div style={{ background:'white', borderRadius:18, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:14, fontWeight:800, color:'rgb(20,20,43)' }}>Alle Messungen</div>
                <div style={{ fontSize:11, color:'#9CA3AF' }}>{entries.length} Eintraege</div>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr style={{ background:'#F9FAFB' }}>
                    {['Datum','Gesamt','Marke','Personen','Insights','Beziehungen','Branche','Netzwerk',''].map((h,i)=>(
                      <th key={i} style={{ padding:'8px 14px', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em', textAlign:i===0?'left':'center', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {entries.map((e,idx)=>(
                      <tr key={e.id} style={{ borderBottom:'1px solid #F9FAFB', background:idx===0?'#F5F7FF':'white' }}>
                        <td style={{ padding:'12px 14px', fontSize:12, color:'#374151', fontWeight:600 }}>{new Date(e.recorded_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}</td>
                        <td style={{ textAlign:'center', padding:'12px 8px' }}><span style={{ fontSize:16, fontWeight:900, color:'rgb(49,90,231)' }}>{Math.round(e.total_score)}</span></td>
                        {['build_brand','find_people','engage_insights','build_relationships'].map((k,i)=>(
                          <td key={k} style={{ textAlign:'center', padding:'12px 8px', fontSize:13, color:SUBSCORES[i].color, fontWeight:700 }}>{e[k]||'-'}</td>
                        ))}
                        <td style={{ textAlign:'center', padding:'12px 8px', fontSize:11, color:'#6B7280' }}>{e.industry_rank?'Top '+e.industry_rank+'%':'-'}</td>
                        <td style={{ textAlign:'center', padding:'12px 8px', fontSize:11, color:'#6B7280' }}>{e.network_rank?'Top '+e.network_rank+'%':'-'}</td>
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
