import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Zielgruppen({ session }) {
  const nav = useNavigate()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('branchen')

  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from('leads').select('company,job_title,headline,ai_buying_intent,hs_score,deal_stage,deal_value,li_connection_status,industry').eq('user_id', session.user.id)
      .then(({ data }) => { setLeads(data||[]); setLoading(false) })
  }, [session])

  function topN(arr, key, n=8) {
    const counts = {}
    arr.forEach(l => {
      const v = (l[key]||'').trim()
      if (v && v.length > 1) counts[v] = (counts[v]||0) + 1
    })
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,n)
  }

  function topNMulti(arr, keys, n=8) {
    const counts = {}
    arr.forEach(l => {
      keys.forEach(k => {
        const raw = l[k]||''
        const parts = raw.split(/[·|,\/]/).map(s=>s.trim()).filter(s=>s.length>2&&s.length<50)
        parts.slice(0,3).forEach(p => { counts[p] = (counts[p]||0)+1 })
      })
    })
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,n)
  }

  const branchen = topN(leads, 'industry')
  const firmen   = topN(leads, 'company')
  const rollen   = topNMulti(leads, ['job_title','headline'])

  const hotBySegment = (key, val) => leads.filter(l => (l[key]||'')===val && (l.hs_score||0)>=60).length
  const valueBySegment = (key, val) => leads.filter(l => (l[key]||'')===val).reduce((s,l)=>s+(Number(l.deal_value)||0),0)

  const P = 'var(--wl-primary, rgb(49,90,231))'
  const TABS = [
    { id:'branchen', label:'🏭 Branchen' },
    { id:'firmen',   label:'🏢 Top-Firmen' },
    { id:'rollen',   label:'👤 Rollen' },
    { id:'scoring',  label:'📊 Segment-Analyse' },
  ]

  const SegmentBar = ({ label, count, total, hotCount, value }) => {
    const pct = total > 0 ? Math.round(count/total*100) : 0
    const hotRate = count > 0 ? Math.round(hotCount/count*100) : 0
    return (
      <div style={{ background:'white', borderRadius:12, border:'1px solid #E5E7EB', padding:'14px 18px', marginBottom:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)' }}>{label}</div>
            <div style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>{count} Leads · {pct}% des Netzwerks</div>
          </div>
          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            {hotRate > 0 && <span style={{ fontSize:11, fontWeight:700, color:'#ef4444', background:'#FEF2F2', padding:'2px 8px', borderRadius:99 }}>🔥 {hotRate}% Hot</span>}
            {value > 0 && <span style={{ fontSize:11, fontWeight:700, color:'#22c55e', background:'#F0FDF4', padding:'2px 8px', borderRadius:99 }}>€{value>=1000?Math.round(value/1000)+'k':value}</span>}
          </div>
        </div>
        <div style={{ height:6, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${P},#818CF8)`, borderRadius:99, transition:'width 0.5s' }}/>
        </div>
      </div>
    )
  }

  if (loading) return <div style={{ textAlign:'center', padding:'60px', color:'#94A3B8' }}>Lade Zielgruppen…</div>

  return (
    <div style={{ maxWidth:900, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, color:'rgb(20,20,43)', margin:0 }}>🎯 Zielgruppen-Analyse</h1>
          <div style={{ fontSize:13, color:'#64748B', marginTop:6 }}>Basierend auf {leads.length} Leads in deinem Netzwerk</div>
        </div>
        <button onClick={() => nav('/icp')} style={{ padding:'9px 18px', borderRadius:10, border:'none', background:P, color:'white', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 3px 10px rgba(49,90,231,0.3)' }}>
          ⚙️ ICP Verwalten
        </button>
      </div>

      {/* KPI Chips */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label:'Branchen', val: new Set(leads.map(l=>l.industry).filter(Boolean)).size, icon:'🏭', color:'#3b82f6' },
          { label:'Firmen', val: new Set(leads.map(l=>l.company).filter(Boolean)).size, icon:'🏢', color:'#8b5cf6' },
          { label:'Hot-Rate', val: leads.length?Math.round(leads.filter(l=>(l.hs_score||0)>=60).length/leads.length*100)+'%':'—', icon:'🔥', color:'#ef4444' },
          { label:'Ø Score', val: leads.length?Math.round(leads.reduce((s,l)=>s+(l.hs_score||0),0)/leads.length):'—', icon:'⭐', color:'#f59e0b' },
        ].map(k => (
          <div key={k.label} style={{ background:'white', borderRadius:14, border:'1px solid #E5E7EB', padding:'16px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{k.icon} {k.label}</div>
            <div style={{ fontSize:26, fontWeight:800, color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:16, background:'white', padding:6, borderRadius:12, border:'1px solid #E5E7EB', width:'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding:'7px 16px', borderRadius:9, border:'none', fontSize:12, fontWeight:700, cursor:'pointer', transition:'all 0.15s',
              background: activeTab===t.id ? P : 'transparent',
              color: activeTab===t.id ? 'white' : '#64748B' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'branchen' && (
        <div>
          {branchen.length > 0 ? branchen.map(([b, cnt]) => (
            <SegmentBar key={b} label={b} count={cnt} total={leads.length} hotCount={hotBySegment('industry',b)} value={valueBySegment('industry',b)}/>
          )) : (
            <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8', background:'white', borderRadius:14, border:'1px solid #E5E7EB' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🏭</div>
              <div style={{ fontWeight:700, color:'#64748B' }}>Noch keine Branchen-Daten</div>
              <div style={{ fontSize:12, marginTop:4 }}>Füge Branche zu deinen Leads hinzu um diese Analyse zu sehen</div>
            </div>
          )}
          {branchen.length === 0 && leads.length > 0 && (
            <div style={{ marginTop:16, padding:'16px 20px', background:'#FFF7ED', borderRadius:12, border:'1px solid #FDE68A', fontSize:13, color:'#92400E' }}>
              💡 Tipp: Die Analyse nutzt das "Branche"-Feld. Alternativ werden Firmennamen und Jobtitel automatisch ausgewertet.
            </div>
          )}
        </div>
      )}

      {activeTab === 'firmen' && (
        <div>
          {firmen.map(([f, cnt]) => (
            <SegmentBar key={f} label={f} count={cnt} total={leads.length} hotCount={hotBySegment('company',f)} value={valueBySegment('company',f)}/>
          ))}
          {firmen.length === 0 && <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Keine Firmendaten vorhanden</div>}
        </div>
      )}

      {activeTab === 'rollen' && (
        <div>
          {rollen.map(([r, cnt]) => (
            <div key={r} style={{ background:'white', borderRadius:12, border:'1px solid #E5E7EB', padding:'12px 18px', marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:20 }}>👤</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'rgb(20,20,43)' }}>{r}</div>
                <div style={{ fontSize:12, color:'#94A3B8' }}>{cnt} Leads</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ height:6, width:120, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min(cnt/Math.max(...rollen.map(x=>x[1])),1)*100}%`, background:P, borderRadius:99 }}/>
                </div>
              </div>
            </div>
          ))}
          {rollen.length === 0 && <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Keine Rollendaten vorhanden</div>}
        </div>
      )}

      {activeTab === 'scoring' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            {[
              { label:'🔥 Hot Leads', filter: l=>(l.hs_score||0)>=70, color:'#ef4444', bg:'#FEF2F2' },
              { label:'⚡ Warm Leads', filter: l=>(l.hs_score||0)>=40&&(l.hs_score||0)<70, color:'#f59e0b', bg:'#FFFBEB' },
              { label:'❄️ Cold Leads', filter: l=>(l.hs_score||0)<40&&(l.hs_score||0)>0, color:'#3b82f6', bg:'#EFF6FF' },
              { label:'✓ Vernetzt', filter: l=>l.li_connection_status==='verbunden', color:'#22c55e', bg:'#F0FDF4' },
            ].map(seg => {
              const segLeads = leads.filter(seg.filter)
              const val = segLeads.reduce((s,l)=>s+(Number(l.deal_value)||0),0)
              return (
                <div key={seg.label} style={{ background:seg.bg, borderRadius:14, border:`1px solid ${seg.color}22`, padding:'18px 20px' }}>
                  <div style={{ fontSize:14, fontWeight:800, color:seg.color }}>{seg.label}</div>
                  <div style={{ fontSize:32, fontWeight:900, color:'rgb(20,20,43)', margin:'8px 0' }}>{segLeads.length}</div>
                  <div style={{ fontSize:12, color:'#64748B' }}>{leads.length?Math.round(segLeads.length/leads.length*100):0}% des Netzwerks</div>
                  {val > 0 && <div style={{ fontSize:12, fontWeight:700, color:seg.color, marginTop:4 }}>💰 €{val>=1000?Math.round(val/1000)+'k':val} Pipeline</div>}
                </div>
              )
            })}
          </div>
          {/* Top-Segment Empfehlung */}
          <div style={{ background:'linear-gradient(135deg,rgb(49,90,231),#818CF8)', borderRadius:16, padding:'20px 24px', color:'white' }}>
            <div style={{ fontSize:15, fontWeight:800, marginBottom:8 }}>💡 KI-Empfehlung</div>
            <div style={{ fontSize:13, opacity:0.9, lineHeight:1.6 }}>
              {(() => {
                const hot = leads.filter(l=>(l.hs_score||0)>=70).length
                const topFirma = firmen[0]?.[0]
                const topRolle = rollen[0]?.[0]
                if (hot === 0) return 'Noch keine Hot Leads. Fokussiere dich auf Vernetzung und Follow-ups um den Score zu steigern.'
                return `Du hast ${hot} Hot Lead${hot>1?'s':''} mit hohem Abschluss-Potenzial.${topFirma?` Die meisten Leads kommen aus "${topFirma}".`:''}${topRolle?` Hauptzielgruppe: "${topRolle}".`:''} Priorisiere Follow-ups mit Score ≥ 70.`
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
