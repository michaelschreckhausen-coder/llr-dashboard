import { useTeam } from '../context/TeamContext'
import React, { useState, useEffect, useCallback } from 'react'
import { useResponsive } from '../hooks/useResponsive'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Konstanten ───────────────────────────────────────────────────────────────
const SMALL = ['pipeline_value','win_rate','hot_leads','today_active','mql_leads','messages','avg_score','lql_leads']

const CATALOG = [
  { id:'greeting',          label:'Begrüßung',             icon:'👋', desc:'Tagesübersicht mit aktuellen KPIs',  size:'full'   },
  { id:'pipeline_value',    label:'Pipeline Wert',          icon:'💼', desc:'Gesamtwert aller aktiven Deals',    size:'small'  },
  { id:'win_rate',          label:'Win Rate',               icon:'🏆', desc:'Abschlussquote deiner Deals',       size:'small'  },
  { id:'hot_leads',         label:'Hot Leads',              icon:'🔥', desc:'Leads mit Score ≥ 70',              size:'small'  },
  { id:'today_active',      label:'Heute aktiv',            icon:'✅', desc:'Aktivitäten heute',                 size:'small'  },
  { id:'linkedin_leads',    label:'LinkedIn Leads',         icon:'👥', desc:'Gesamt-Leads & Konversionsrate',    size:'medium' },
  { id:'ssi_score',         label:'Social Selling Index',   icon:'📊', desc:'LinkedIn SSI Score',               size:'medium' },
  { id:'mql_leads',         label:'MQL Leads',              icon:'🎯', desc:'Marketing-qualifizierte Leads',    size:'small'  },
  { id:'messages',          label:'Nachrichten',            icon:'💬', desc:'Archivierte Nachrichten',          size:'small'  },
  { id:'avg_score',         label:'Ø Score',                icon:'⭐', desc:'Durchschnittlicher Lead-Score',    size:'small'  },
  { id:'lql_leads',         label:'LQL Leads',              icon:'🔗', desc:'LinkedIn-qualifizierte Leads',     size:'small'  },
  { id:'pipeline_overview', label:'Pipeline Überblick',     icon:'📈', desc:'Verteilung über alle Stages',      size:'medium' },
  { id:'latest_activities', label:'Letzte Aktivitäten',     icon:'⚡', desc:'Live CRM Timeline',               size:'medium' },
  { id:'hot_leads_list',    label:'Hot Leads — Jetzt',      icon:'🔥', desc:'Leads mit Score ≥ 50',            size:'medium' },
  { id:'followup_radar',    label:'Follow-up Radar',        icon:'📅', desc:'Überfällige Follow-ups',          size:'medium' },
  { id:'pipeline_contacts', label:'Pipeline Kontakte',      icon:'🎯', desc:'Aktive vernetzte Leads',          size:'medium' },
  { id:'ssi_teilscores',    label:'SSI Teilscores',         icon:'📉', desc:'4 SSI-Kategorien im Detail',      size:'large'  },
  { id:'closing_soon',      label:'Bald schließende Deals', icon:'⏰', desc:'Deals mit Fälligkeit ≤ 30 Tage', size:'medium' },
  { id:'new_leads',         label:'Neue Leads diese Woche', icon:'🆕', desc:'Leads der letzten 7 Tage',       size:'medium' },
  { id:'weekly_goals',      label:'Wochenziele',            icon:'🎯', desc:'Fortschritt dieser Woche',       size:'medium' },
  { id:'team_overview',     label:'Team Übersicht',         icon:'👥', desc:'Geteilte Leads & Mitglieder',    size:'medium' },
]

const DEFAULT_LAYOUT = [
  'greeting',
  'pipeline_value','win_rate','hot_leads','today_active',
  'linkedin_leads','ssi_score',
  'mql_leads','messages','avg_score','lql_leads',
  'pipeline_overview','latest_activities',
  'team_overview',
]

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function Donut({ value, max, color, size=80, stroke=9 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${pct*c} ${c}`} strokeLinecap="round"/>
    </svg>
  )
}

function relDate(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Gestern'
  return `vor ${diff}d`
}

// ─── Widget Inhalt ────────────────────────────────────────────────────────────
function Widget({ id, data, nav }) {
  const { leads=[], activities=[], ssi=null, msgs=[], greeting='Hallo', firstName='', team=null, members=[] } = data
  const C = { background:'white', borderRadius:16, border:'1px solid #E5E7EB', padding:'18px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', height:'100%', boxSizing:'border-box' }

  const pip = leads.filter(l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage))
  const won = leads.filter(l => l.deal_stage === 'gewonnen')
  const pipVal = pip.reduce((s,l) => s+(Number(l.deal_value)||0), 0)
  const winRate = pip.length ? Math.round(won.length/pip.length*100) : 0
  const hotLeads = leads.filter(l => (l.hs_score||0) >= 70).length
  const todayActs = activities.filter(a => new Date(a.occurred_at).toDateString()===new Date().toDateString()).length
  const weekActs = activities.filter(a => Date.now()-new Date(a.occurred_at)<7*86400000).length
  const conn = leads.filter(l => l.li_connection_status==='verbunden').length
  const sql = leads.filter(l => l.status==='SQL').length
  const avgScore = leads.length ? Math.round(leads.reduce((s,l)=>s+(l.hs_score||0),0)/leads.length) : 0
  const ssiScore = ssi?.total_score ? Math.round(ssi.total_score) : 0

  if (id === 'greeting') {
    const newToday = leads.filter(l => new Date(l.created_at).toDateString()===new Date().toDateString()).length
    const overdue = leads.filter(l => l.next_followup && new Date(l.next_followup)<new Date()).length
    return (
      <div style={C}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontSize:12, color:'#94A3B8', fontWeight:500 }}>
              {new Date().toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
            </div>
            <div style={{ fontSize:24, fontWeight:800, color:'rgb(20,20,43)', marginTop:4 }}>{greeting}, {firstName} 👋</div>
            <div style={{ fontSize:13, color:'#64748B', marginTop:4 }}>Hier ist deine Sales-Übersicht für heute.</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {newToday > 0 && <div style={{ textAlign:'center', background:'#F0F9FF', borderRadius:10, padding:'8px 14px' }}>
              <div style={{ fontSize:20, fontWeight:800, color:'#0369a1' }}>{newToday}</div>
              <div style={{ fontSize:10, color:'#64748B', fontWeight:600 }}>Neue Leads</div>
            </div>}
            {overdue > 0 && <div style={{ textAlign:'center', background:'#FEF2F2', borderRadius:10, padding:'8px 14px' }}>
              <div style={{ fontSize:20, fontWeight:800, color:'#dc2626' }}>{overdue}</div>
              <div style={{ fontSize:10, color:'#64748B', fontWeight:600 }}>Überfällig</div>
            </div>}
            <div style={{ textAlign:'center', background:'#F0FDF4', borderRadius:10, padding:'8px 14px' }}>
              <div style={{ fontSize:20, fontWeight:800, color:'#16a34a' }}>{todayActs}</div>
              <div style={{ fontSize:10, color:'#64748B', fontWeight:600 }}>Aktivitäten</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (id === 'pipeline_value') return (
    <div style={{ ...C, cursor:'pointer' }} onClick={() => nav('/pipeline')}>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>💼 Pipeline Wert</div>
      <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>€{pipVal>=1000?`${Math.round(pipVal/1000)}k`:pipVal.toLocaleString('de-DE')}</div>
      <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>{pip.length} Deals aktiv</div>
    </div>
  )

  if (id === 'win_rate') return (
    <div style={{ ...C, cursor:'pointer' }} onClick={() => nav('/pipeline')}>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>🏆 Win Rate</div>
      <div style={{ fontSize:28, fontWeight:800, color:winRate>=40?'#22c55e':winRate>=20?'#f59e0b':'#ef4444' }}>{winRate}%</div>
      <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>{won.length} gewonnen</div>
    </div>
  )

  if (id === 'hot_leads') return (
    <div style={{ ...C, cursor:'pointer' }} onClick={() => nav('/leads')}>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>🔥 Hot Leads</div>
      <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{hotLeads}</div>
      <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>Score ≥ 70</div>
    </div>
  )

  if (id === 'today_active') return (
    <div style={C}>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>✅ Heute aktiv</div>
      <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{todayActs}</div>
      <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>{weekActs} diese Woche</div>
    </div>
  )

  if (id === 'mql_leads') return (
    <div style={C}>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>🎯 MQL Leads</div>
      <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{sql}</div>
      <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>Marketing qualifiziert</div>
    </div>
  )

  if (id === 'messages') return (
    <div style={{ ...C, cursor:'pointer' }} onClick={() => nav('/messages')}>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>💬 Nachrichten</div>
      <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{msgs.length}</div>
      <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>archiviert</div>
    </div>
  )

  if (id === 'avg_score') return (
    <div style={C}>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>⭐ Ø Score</div>
      <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{avgScore||'—'}</div>
      <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>Ø Lead-Bewertung</div>
    </div>
  )

  if (id === 'lql_leads') return (
    <div style={{ ...C, cursor:'pointer' }} onClick={() => nav('/leads')}>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>🔗 LQL Leads</div>
      <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{conn}</div>
      <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>LinkedIn qualifiziert</div>
    </div>
  )

  if (id === 'linkedin_leads') return (
    <div style={{ borderRadius:16, background:'linear-gradient(135deg,rgb(49,90,231),rgb(80,120,250))', padding:'22px 24px', color:'white', position:'relative', overflow:'hidden', height:'100%', boxSizing:'border-box' }}>
      <div style={{ position:'absolute', top:-40, right:-30, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }}/>
      <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:20 }}>👥</span>
            <span style={{ fontSize:13, fontWeight:600, opacity:0.9 }}>LinkedIn Leads</span>
          </div>
          <div style={{ fontSize:48, fontWeight:800, lineHeight:1 }}>{leads.length}</div>
          <div style={{ fontSize:13, opacity:0.8, marginTop:4 }}>gesamt</div>
          <div style={{ display:'flex', gap:16, marginTop:12 }}>
            <div><div style={{ fontSize:18, fontWeight:700 }}>{leads.length?Math.round(won.length/leads.length*100):0}%</div><div style={{ fontSize:11, opacity:0.7 }}>Konversionsrate</div></div>
            <div><div style={{ fontSize:18, fontWeight:700 }}>{sql}</div><div style={{ fontSize:11, opacity:0.7 }}>SQL Leads</div></div>
          </div>
        </div>
        <div style={{ position:'relative' }}>
          <Donut value={conn} max={Math.max(leads.length,1)} color="rgba(255,255,255,0.9)" size={90} stroke={9}/>
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:15, fontWeight:800 }}>{leads.length?Math.round(conn/leads.length*100):0}%</span>
          </div>
        </div>
      </div>
    </div>
  )

  if (id === 'ssi_score') return (
    <div style={{ borderRadius:16, background:'linear-gradient(135deg,#7C3AED,#9F67FA)', padding:'22px 24px', color:'white', position:'relative', overflow:'hidden', height:'100%', boxSizing:'border-box' }}>
      <div style={{ position:'absolute', top:-30, right:-20, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }}/>
      <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:20 }}>📊</span>
            <span style={{ fontSize:13, fontWeight:600, opacity:0.9 }}>Social Selling Index</span>
          </div>
          {ssi ? (<>
            <div style={{ fontSize:48, fontWeight:800, lineHeight:1 }}>{ssiScore}</div>
            <div style={{ fontSize:13, opacity:0.8, marginTop:4 }}>von 100</div>
            <div style={{ display:'flex', gap:16, marginTop:12 }}>
              {ssi.industry_rank && <div><div style={{ fontSize:16, fontWeight:700 }}>Top {ssi.industry_rank}%</div><div style={{ fontSize:11, opacity:0.7 }}>Branche</div></div>}
              {ssi.network_rank  && <div><div style={{ fontSize:16, fontWeight:700 }}>Top {ssi.network_rank}%</div><div style={{ fontSize:11, opacity:0.7 }}>Netzwerk</div></div>}
            </div>
          </>) : (
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:22, fontWeight:800, opacity:0.5 }}>—</div>
              <div style={{ fontSize:12, opacity:0.7, marginTop:4 }}>nicht erfasst</div>
              <button onClick={() => nav('/linkedin-about')} style={{ marginTop:12, padding:'6px 14px', borderRadius:8, background:'rgba(255,255,255,0.2)', border:'1px solid rgba(255,255,255,0.3)', color:'white', fontSize:12, fontWeight:600, cursor:'pointer' }}>SSI jetzt erfassen</button>
            </div>
          )}
        </div>
        <div style={{ position:'relative' }}>
          <Donut value={ssiScore} max={100} color="rgba(255,255,255,0.9)" size={90} stroke={9}/>
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:15, fontWeight:800 }}>{ssiScore}%</span>
          </div>
        </div>
      </div>
    </div>
  )

  if (id === 'pipeline_overview') {
    const stages = [
      { label:'Neu',         key:'kein_deal',   color:'#CBD5E1' },
      { label:'Kontaktiert', key:'prospect',    color:'#93C5FD' },
      { label:'Gespräch',    key:'opportunity', color:'#6EE7B7' },
      { label:'Angebot',     key:'angebot',     color:'#FCD34D' },
      { label:'Gewonnen',    key:'gewonnen',    color:'#34D399' },
    ]
    const total = leads.length || 1
    return (
      <div style={C}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>Pipeline Überblick</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>{leads.length} Leads verteilt</div>
          </div>
          <button onClick={() => nav('/pipeline')} style={{ fontSize:12, fontWeight:600, color:'var(--wl-primary, rgb(49,90,231))', background:'rgba(49,90,231,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Ansehen →</button>
        </div>
        {stages.map(s => {
          const cnt = leads.filter(l => l.deal_stage === s.key).length
          return (
            <div key={s.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ fontSize:12, color:'#475569', width:90, flexShrink:0, fontWeight:500 }}>{s.label}</div>
              <div style={{ flex:1, height:10, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${Math.max(cnt/total*100, cnt>0?4:0)}%`, background:s.color, borderRadius:99 }}/>
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:'#475569', width:50, textAlign:'right' }}>{cnt} Leads</div>
            </div>
          )
        })}
      </div>
    )
  }

  if (id === 'latest_activities') {
    const ICONS = { call:'📞', email:'📧', linkedin_message:'💬', meeting:'🤝', note:'📝', task:'✅' }
    return (
      <div style={C}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>Letzte Aktivitäten</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>Live CRM Timeline</div>
          </div>
          <button onClick={() => nav('/leads')} style={{ fontSize:12, fontWeight:600, color:'var(--wl-primary, rgb(49,90,231))', background:'rgba(49,90,231,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Alle →</button>
        </div>
        {activities.slice(0,5).map((a,i) => {
          const lead = leads.find(l => l.id === a.lead_id)
          return (
            <div key={a.id} onClick={() => lead && nav(`/leads/${lead.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 0', borderBottom:i<4?'1px solid #F1F5F9':'none', cursor:lead?'pointer':'default' }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{ICONS[a.type]||'📌'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{lead?`${lead.first_name||''} ${lead.last_name||''}`.trim():'Unbekannt'}</div>
                <div style={{ fontSize:11, color:'#94A3B8' }}>{a.subject||a.type}</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
                <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:99, background:a.type==='call'?'#ECFDF5':a.type==='meeting'?'#FFF7ED':'#EFF6FF', color:a.type==='call'?'#16a34a':a.type==='meeting'?'#ea580c':'#3b82f6' }}>{a.type}</span>
                <span style={{ fontSize:10, color:'#94A3B8' }}>{relDate(a.occurred_at)}</span>
              </div>
            </div>
          )
        })}
        {activities.length===0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#CBD5E1', fontSize:13 }}>Noch keine Aktivitäten</div>}
      </div>
    )
  }

  if (id === 'hot_leads_list') {
    const hot = leads.filter(l=>(l.hs_score||0)>=50).sort((a,b)=>(b.hs_score||0)-(a.hs_score||0)).slice(0,5)
    return (
      <div style={C}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>🔥 Hot Leads — Jetzt handeln</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>Score ≥ 50 · Höchstes Potenzial</div>
          </div>
          <button onClick={() => nav('/leads')} style={{ fontSize:12, fontWeight:600, color:'#ef4444', background:'rgba(239,68,68,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Alle →</button>
        </div>
        {hot.map(l => (
          <div key={l.id} onClick={() => nav(`/leads/${l.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 10px', borderRadius:10, cursor:'pointer', marginBottom:4 }}
            onMouseEnter={e=>e.currentTarget.style.background='#FFF7ED'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#f97316,#ef4444)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, fontWeight:700, flexShrink:0 }}>{l.first_name?.[0]||'?'}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{`${l.first_name||''} ${l.last_name||''}`.trim()}</div>
              <div style={{ fontSize:11, color:'#94A3B8' }}>{l.company||l.job_title||''}</div>
            </div>
            <span style={{ fontSize:12, fontWeight:800, color:'#ef4444', background:'#FEF2F2', padding:'2px 8px', borderRadius:99 }}>Score {l.hs_score}</span>
          </div>
        ))}
        {hot.length===0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#CBD5E1', fontSize:13 }}>Keine Hot Leads</div>}
      </div>
    )
  }

  if (id === 'followup_radar') {
    const overdue  = leads.filter(l=>l.next_followup&&new Date(l.next_followup)<new Date()).sort((a,b)=>new Date(a.next_followup)-new Date(b.next_followup))
    const upcoming = leads.filter(l=>l.next_followup&&new Date(l.next_followup)>=new Date()).sort((a,b)=>new Date(a.next_followup)-new Date(b.next_followup)).slice(0,3)
    const all = [...overdue,...upcoming].slice(0,5)
    return (
      <div style={C}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>📅 Follow-up Radar</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>{overdue.length} überfällig</div>
          </div>
          <button onClick={() => nav('/leads')} style={{ fontSize:12, fontWeight:600, color:'#ef4444', background:'rgba(239,68,68,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Alle →</button>
        </div>
        {all.map(l => {
          const diff = Math.round((new Date(l.next_followup)-new Date())/86400000)
          const over = diff < 0
          return (
            <div key={l.id} onClick={() => nav(`/leads/${l.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 10px', borderRadius:10, cursor:'pointer', marginBottom:4 }}
              onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{`${l.first_name||''} ${l.last_name||''}`.trim()}</div>
                <div style={{ fontSize:11, color:'#94A3B8' }}>{l.company||''}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:over?'#ef4444':'#22c55e', background:over?'#FEF2F2':'#F0FDF4', padding:'2px 8px', borderRadius:99, flexShrink:0 }}>
                {over?`${Math.abs(diff)}d über`:diff===0?'Heute':diff===1?'Morgen':`in ${diff}d`}
              </span>
            </div>
          )
        })}
        {all.length===0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#CBD5E1', fontSize:13 }}>Alles auf dem neuesten Stand ✓</div>}
      </div>
    )
  }

  if (id === 'pipeline_contacts') {
    const contacts = leads.filter(l=>l.li_connection_status==='verbunden'&&l.deal_stage&&!['kein_deal','verloren'].includes(l.deal_stage)).slice(0,5)
    return (
      <div style={C}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>🎯 Aktive Pipeline-Kontakte</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>Vernetzt — In Pipeline</div>
          </div>
          <button onClick={() => nav('/pipeline')} style={{ fontSize:12, fontWeight:600, color:'#f59e0b', background:'rgba(245,158,11,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Pipeline →</button>
        </div>
        {contacts.map(l => (
          <div key={l.id} onClick={() => nav(`/leads/${l.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', borderRadius:12, background:'#FFFBEB', border:'1px solid #FDE68A', marginBottom:8, cursor:'pointer' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{`${l.first_name||''} ${l.last_name||''}`.trim()}</div>
              <div style={{ fontSize:11, color:'#94A3B8' }}>{l.deal_stage} · {l.company||''}</div>
            </div>
            {l.deal_value && <span style={{ fontSize:12, fontWeight:700, color:'#22c55e' }}>€{Number(l.deal_value).toLocaleString('de-DE')}</span>}
          </div>
        ))}
        {contacts.length===0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#CBD5E1', fontSize:13 }}>Keine Pipeline-Kontakte</div>}
      </div>
    )
  }

  if (id === 'ssi_teilscores') {
    const cats = [
      { key:'brand_score',    label:'Marke aufbauen',  color:'#3b82f6', max:25 },
      { key:'prospect_score', label:'Personen finden', color:'#22c55e', max:25 },
      { key:'insight_score',  label:'Insights nutzen', color:'#f97316', max:25 },
      { key:'relation_score', label:'Beziehungen',     color:'#8b5cf6', max:25 },
    ]
    return (
      <div style={C}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>📉 SSI Teilscores</div>
            {ssi && <div style={{ fontSize:12, color:'#94A3B8' }}>Letzte Messung: {new Date(ssi.measured_at||ssi.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})}</div>}
          </div>
          <button onClick={() => nav('/linkedin-about')} style={{ fontSize:12, fontWeight:600, color:'#7C3AED', background:'rgba(124,58,237,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Details →</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
          {cats.map(c => {
            const v = ssi?.[c.key]||0
            return (
              <div key={c.key} style={{ textAlign:'center' }}>
                <div style={{ position:'relative', display:'inline-block', marginBottom:8 }}>
                  <Donut value={v} max={c.max} color={c.color} size={76} stroke={7}/>
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:14, fontWeight:800, color:c.color }}>{Math.round(v)}</span>
                  </div>
                </div>
                <div style={{ fontSize:11, fontWeight:600, color:'#475569' }}>{c.label}</div>
                <div style={{ fontSize:10, color:'#94A3B8' }}>/ {c.max}</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (id === 'closing_soon') {
    const closing = leads.filter(l=>l.deal_expected_close&&!['verloren','gewonnen'].includes(l.deal_stage||''))
      .map(l=>({...l,diff:Math.round((new Date(l.deal_expected_close)-new Date())/86400000)}))
      .filter(l=>l.diff<=30).sort((a,b)=>a.diff-b.diff).slice(0,5)
    return (
      <div style={C}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>⏰ Bald schließende Deals</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>{closing.length} Deals in ≤ 30 Tagen</div>
          </div>
          <button onClick={() => nav('/pipeline')} style={{ fontSize:12, fontWeight:600, color:'#f59e0b', background:'rgba(245,158,11,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Pipeline →</button>
        </div>
        {closing.map(l => (
          <div key={l.id} onClick={() => nav(`/leads/${l.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 10px', borderRadius:10, cursor:'pointer', marginBottom:4 }}
            onMouseEnter={e=>e.currentTarget.style.background='#FFFBEB'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{`${l.first_name||''} ${l.last_name||''}`.trim()}</div>
              <div style={{ fontSize:11, color:'#94A3B8' }}>{l.company||''}</div>
            </div>
            {l.deal_value && <span style={{ fontSize:12, fontWeight:700, color:'#22c55e' }}>€{Number(l.deal_value).toLocaleString('de-DE')}</span>}
            <span style={{ fontSize:11, fontWeight:700, flexShrink:0, padding:'2px 8px', borderRadius:99, color:l.diff<0?'#ef4444':l.diff<=7?'#d97706':'#22c55e', background:l.diff<0?'#FEF2F2':l.diff<=7?'#FFFBEB':'#F0FDF4' }}>
              {l.diff<0?`${Math.abs(l.diff)}d über`:l.diff===0?'Heute':l.diff===1?'Morgen':`${l.diff}d`}
            </span>
          </div>
        ))}
        {closing.length===0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#CBD5E1', fontSize:13 }}>Keine bald schließenden Deals</div>}
      </div>
    )
  }

  if (id === 'new_leads') {
    const newL = [...leads].filter(l=>(Date.now()-new Date(l.created_at))<7*86400000).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5)
    return (
      <div style={C}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>🆕 Neue Leads diese Woche</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>{newL.length} neue Leads (7 Tage)</div>
          </div>
          <button onClick={() => nav('/leads')} style={{ fontSize:12, fontWeight:600, color:'var(--wl-primary, rgb(49,90,231))', background:'rgba(49,90,231,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Alle →</button>
        </div>
        {newL.map(l => (
          <div key={l.id} onClick={() => nav(`/leads/${l.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 10px', borderRadius:10, cursor:'pointer', marginBottom:4 }}
            onMouseEnter={e=>e.currentTarget.style.background='#F5F7FF'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,rgb(49,90,231),rgb(100,140,240))', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, fontWeight:700, flexShrink:0 }}>{l.first_name?.[0]||'?'}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{`${l.first_name||''} ${l.last_name||''}`.trim()}</div>
              <div style={{ fontSize:11, color:'#94A3B8' }}>{l.company||l.job_title||''}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
              <span style={{ fontSize:9, fontWeight:700, color:'#22c55e', background:'#F0FDF4', padding:'1px 6px', borderRadius:99 }}>NEU</span>
              <span style={{ fontSize:10, color:'#94A3B8' }}>{relDate(l.created_at)}</span>
            </div>
          </div>
        ))}
        {newL.length===0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#CBD5E1', fontSize:13 }}>Keine neuen Leads diese Woche</div>}
      </div>
    )
  }

  if (id === 'weekly_goals') {
    const thisWeekActs = activities.filter(a => Date.now()-new Date(a.occurred_at)<7*86400000)
    const calls = thisWeekActs.filter(a=>a.type==='call').length
    const meetings = thisWeekActs.filter(a=>a.type==='meeting').length
    const newThisWeek = leads.filter(l=>(Date.now()-new Date(l.created_at))<7*86400000).length
    const wonThisWeek = leads.filter(l=>l.deal_stage==='gewonnen'&&(Date.now()-new Date(l.updated_at))<7*86400000).length
    const [targets, setTargets] = useState({ calls:5, meetings:3, newLeads:10, won:1 })
    const [editTargets, setEditTargets] = useState(false)
    const goals = [
      { key:'calls',    label:'Anrufe',         done:calls,        target:targets.calls,    icon:'📞', color:'#3b82f6' },
      { key:'meetings', label:'Meetings',        done:meetings,     target:targets.meetings, icon:'🤝', color:'#8b5cf6' },
      { key:'newLeads', label:'Neue Leads',      done:newThisWeek,  target:targets.newLeads, icon:'👤', color:'#22c55e' },
      { key:'won',      label:'Deals gewonnen',  done:wonThisWeek,  target:targets.won,      icon:'🏆', color:'#f59e0b' },
    ]
    return (
      <div style={C}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>🎯 Wochenziele</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>Fortschritt diese Woche</div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={() => setEditTargets(v=>!v)} style={{ fontSize:11, fontWeight:600, color:'#64748B', background:'#F1F5F9', border:'none', borderRadius:7, padding:'4px 10px', cursor:'pointer' }}>
              {editTargets ? '✓ Fertig' : '⚙️ Ziele'}
            </button>
            <button onClick={() => nav('/reports')} style={{ fontSize:12, fontWeight:600, color:'var(--wl-primary, rgb(49,90,231))', background:'rgba(49,90,231,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Reports →</button>
          </div>
        </div>
        {editTargets && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14, padding:'12px', background:'#F8FAFC', borderRadius:10, border:'1px solid #E5E7EB' }}>
            {goals.map(g => (
              <div key={g.key} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:14 }}>{g.icon}</span>
                <span style={{ fontSize:11, color:'#64748B', flex:1 }}>{g.label}</span>
                <input type="number" min="1" max="99" value={g.target}
                  onChange={e => setTargets(prev => ({...prev, [g.key]: parseInt(e.target.value)||1}))}
                  style={{ width:46, padding:'3px 6px', borderRadius:6, border:'1.5px solid #E2E8F0', fontSize:12, fontWeight:700, textAlign:'center', outline:'none' }}/>
              </div>
            ))}
          </div>
        )}
        {goals.map(g => {
          const pct = Math.min(Math.round(g.done/g.target*100), 100)
          const done = g.done >= g.target
          return (
            <div key={g.label} style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:14 }}>{g.icon}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:'rgb(20,20,43)' }}>{g.label}</span>
                  {done && <span style={{ fontSize:9, fontWeight:700, color:'#16a34a', background:'#F0FDF4', padding:'1px 6px', borderRadius:99 }}>✓</span>}
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:done?'#16a34a':'#475569' }}>{g.done}/{g.target}</span>
              </div>
              <div style={{ height:6, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:done?'#22c55e':g.color, borderRadius:99, transition:'width 0.5s' }}/>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Team Übersicht ──────────────────────────────────────────────────────────
  if (id === 'team_overview') {
    if (!team) return (
      <div style={{ ...C, textAlign:'center', color:'#94A3B8' }}>
        <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Kein Team</div>
        <div style={{ fontSize:12 }}>Team erstellen unter Einstellungen → Team</div>
      </div>
    )
    return (
      <div style={{ ...C, display:'flex', flexDirection:'column', gap:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)' }}>👥 {team.name}</div>
          <span style={{ fontSize:11, fontWeight:600, color:'#10b981', background:'#ECFDF5', padding:'2px 8px', borderRadius:99 }}>{members.length} Mitglieder</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, flex:1 }}>
          {members.slice(0,5).map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,rgb(49,90,231),#818CF8)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, fontWeight:700, flexShrink:0 }}>
                {(m.profile?.full_name || m.profile?.email || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {m.profile?.full_name || m.profile?.email || '—'}
                </div>
                <div style={{ fontSize:10, color:'#94A3B8', textTransform:'capitalize' }}>{m.role}</div>
              </div>
              {m.role === 'owner' && <span style={{ fontSize:9, fontWeight:700, color:'#d97706', background:'#FEF3C7', padding:'1px 6px', borderRadius:4 }}>Owner</span>}
            </div>
          ))}
        </div>
        <button onClick={() => navigate('/settings/team')} style={{ width:'100%', marginTop:12, padding:'8px', borderRadius:8, border:'1px solid #E5E7EB', background:'#F8FAFC', color:'#475569', fontSize:12, fontWeight:600, cursor:'pointer' }}>
          Team verwalten →
        </button>
      </div>
    )
  }

  if (id === 'team_overview') {
    if (!team) return (
      <div style={{ ...C, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, color:'#94A3B8' }}>
        <div style={{ fontSize:32 }}>👥</div>
        <div style={{ fontWeight:700, fontSize:13 }}>Kein Team</div>
        <div style={{ fontSize:11, textAlign:'center' }}>Erstelle ein Team in den Einstellungen</div>
        <button onClick={() => nav('/settings/team')} style={{ marginTop:4, padding:'5px 14px', borderRadius:8, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#475569', fontSize:11, fontWeight:600, cursor:'pointer' }}>Team erstellen</button>
      </div>
    )
    const sharedLeads = leads.filter(l => l.is_shared)
    return (
      <div style={{ ...C }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:14, fontWeight:800, color:'rgb(20,20,43)' }}>👥 {team.name}</div>
          <span style={{ fontSize:11, fontWeight:600, color:'#10b981', background:'#ECFDF5', padding:'2px 8px', borderRadius:99 }}>{members.length} Mitglieder</span>
        </div>
        {sharedLeads.length > 0 && (
          <div style={{ background:'#F0FDF4', borderRadius:8, padding:'8px 12px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:20 }}>🔗</span>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#065F46' }}>{sharedLeads.length} geteilte Leads</div>
              <div style={{ fontSize:11, color:'#6EE7B7' }}>Alle Mitglieder können bearbeiten</div>
            </div>
          </div>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {members.slice(0,4).map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,rgb(49,90,231),#818CF8)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:12, fontWeight:700, flexShrink:0 }}>
                {(m.profile?.full_name || m.profile?.email || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {m.profile?.full_name || m.profile?.email || '—'}
                </div>
                <div style={{ fontSize:10, color:'#94A3B8', textTransform:'capitalize' }}>{m.role}</div>
              </div>
            </div>
          ))}
          {members.length > 4 && <div style={{ fontSize:11, color:'#94A3B8', paddingLeft:38 }}>+{members.length-4} weitere</div>}
        </div>
        <button onClick={() => nav('/settings/team')} style={{ width:'100%', marginTop:12, padding:'7px', borderRadius:8, border:'1px solid #E5E7EB', background:'#F8FAFC', color:'#475569', fontSize:12, fontWeight:600, cursor:'pointer' }}>
          Team verwalten →
        </button>
      </div>
    )
  }

  return <div style={{ ...C, display:'flex', alignItems:'center', justifyContent:'center', color:'#94A3B8' }}>Widget: {id}</div>
}

// ─── Katalog Panel ────────────────────────────────────────────────────────────
function CatalogPanel({ layout, onAdd, onClose }) {
  const available = CATALOG.filter(w => !layout.includes(w.id))
  const SIZE = { small:'Klein', medium:'Mittel', large:'Groß', full:'Voll' }
  return (
    <div style={{ position:'fixed', inset:0, zIndex:500 }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(3px)' }} onClick={onClose}/>
      <div style={{ position:'absolute', right:0, top:0, bottom:0, width:380, background:'#fff', boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', zIndex:1 }}>
        <div style={{ padding:'20px 20px 14px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'rgb(20,20,43)' }}>Widgets hinzufügen</div>
            <div style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>Klicke + oder ziehe auf die Seite</div>
          </div>
          <button onClick={onClose} style={{ background:'#F1F5F9', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16, color:'#64748B' }}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
          {available.length > 0 && <>
            <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', padding:'4px 0 10px' }}>Verfügbar ({available.length})</div>
            {available.map(w => (
              <div key={w.id} draggable onDragStart={e => { e.dataTransfer.setData('widgetId', w.id); e.dataTransfer.setData('fromCatalog','true') }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, border:'1.5px solid #E5E7EB', background:'#FAFAFA', marginBottom:8, cursor:'grab' }}
                onMouseEnter={e => { e.currentTarget.style.background='#F0F4FF'; e.currentTarget.style.borderColor='var(--wl-primary, rgb(49,90,231))' }}
                onMouseLeave={e => { e.currentTarget.style.background='#FAFAFA'; e.currentTarget.style.borderColor='#E5E7EB' }}>
                <div style={{ fontSize:24, flexShrink:0 }}>{w.icon}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)' }}>{w.label}</div>
                  <div style={{ fontSize:11, color:'#94A3B8', marginTop:1 }}>{w.desc}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                  <span style={{ fontSize:9, fontWeight:700, color:'#7C3AED', background:'#F5F3FF', padding:'2px 6px', borderRadius:99, textTransform:'uppercase' }}>{SIZE[w.size]}</span>
                  <button onClick={() => onAdd(w.id)} style={{ fontSize:12, fontWeight:700, color:'var(--wl-primary, rgb(49,90,231))', background:'rgba(49,90,231,0.1)', border:'none', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>＋</button>
                </div>
              </div>
            ))}
          </>}
          {layout.length > 0 && <>
            <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', padding:'12px 0 8px' }}>Aktiv ({layout.length})</div>
            {CATALOG.filter(w => layout.includes(w.id)).map(w => (
              <div key={w.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:10, background:'#F0F9FF', border:'1px solid #BAE6FD', marginBottom:6 }}>
                <span style={{ fontSize:18 }}>{w.icon}</span>
                <span style={{ fontSize:12, fontWeight:600, color:'#0369a1', flex:1 }}>{w.label}</span>
                <span style={{ fontSize:10, color:'#22c55e', fontWeight:700 }}>✓</span>
              </div>
            ))}
          </>}
          {available.length === 0 && <div style={{ textAlign:'center', padding:'40px 20px', color:'#94A3B8' }}><div style={{ fontSize:32, marginBottom:12 }}>✅</div><div style={{ fontSize:14, fontWeight:600 }}>Alle Widgets aktiv</div></div>}
        </div>
      </div>
    </div>
  )
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function Dashboard({ session }) {
  const nav = useNavigate()
  const { team, members, isMember } = useTeam()
  const { isMobile } = useResponsive()
  const [data, setData]         = useState({ leads:[], activities:[], ssi:null, msgs:[], greeting:'Hallo', firstName:'', team:null, members:[] })
  const [loading, setLoading]   = useState(true)
  const [layout, setLayout]     = useState(null)    // null = wird geladen
  const [editMode, setEditMode] = useState(false)

  // Team-Daten in Widget-Data einbinden
  useEffect(() => {
    setData(prev => ({ ...prev, team, members }))
  }, [team, members])
  const [catalog, setCatalog]   = useState(false)
  const [dragSrc, setDragSrc]   = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [saved, setSaved]       = useState(false)

  // Begrüßung
  useEffect(() => {
    const h = new Date().getHours()
    const g = h<12?'Guten Morgen':h<14?'Guten Tag':h<18?'Guten Nachmittag':'Guten Abend'
    setData(p => ({ ...p, greeting:g }))
  }, [])

  // Daten laden
  const loadData = useCallback(async () => {
    if (!session?.user?.id) return
    const uid = session.user.id
    const meta = session.user.user_metadata||{}
    const name = (meta.full_name||meta.name||session.user.email?.split('@')[0]||'User').split(' ')[0]
    const [l,s,m,a] = await Promise.all([
      supabase.from('leads').select('*').eq('user_id', uid),
      supabase.from('ssi_entries').select('*').eq('user_id', uid).order('measured_at',{ascending:false}).limit(1).then(r => r.data?.length ? r : supabase.from('ssi_scores').select('*').eq('user_id', uid).order('recorded_at',{ascending:false}).limit(1).then(r2 => ({ data: r2.data?.map(s => ({ ...s, total_score: s.total_score, brand_score: s.build_brand, prospect_score: s.find_people, insight_score: s.engage_insights, relation_score: s.build_relationships, industry_rank: s.industry_rank, network_rank: s.network_rank, measured_at: s.recorded_at })) }))),
      supabase.from('messages').select('id').eq('user_id', uid).limit(50),
      supabase.from('activities').select('id,type,subject,occurred_at,lead_id').eq('user_id', uid).order('occurred_at',{ascending:false}).limit(20),
    ])
    setData(p => ({ ...p, leads:l.data||[], activities:a.data||[], ssi:(s.data||[])[0]||null, msgs:m.data||[], firstName:name }))
    setLoading(false)
  }, [session])

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 60000)
    return () => clearInterval(t)
  }, [loadData])

  // Layout aus DB laden
  useEffect(() => {
    if (!session?.user?.id) { setLayout(DEFAULT_LAYOUT); return }
    supabase.from('dashboard_widgets')
      .select('widget_id,position')
      .eq('user_id', session.user.id)
      .eq('visible', true)
      .order('position')
      .then(({ data: d }) => {
        if (d?.length > 0) {
          const seen = new Set()
          const ids = d.map(x => x.widget_id).filter(id => { if (seen.has(id)) return false; seen.add(id); return true })
          setLayout(ids)
        } else {
          setLayout(DEFAULT_LAYOUT)
        }
      })
  }, [session])

  // Layout in DB speichern
  const saveLayout = useCallback(async (ids) => {
    if (!session?.user?.id) return
    const uid = session.user.id
    const seen = new Set()
    const unique = ids.filter(id => { if (seen.has(id)) return false; seen.add(id); return true })
    await supabase.from('dashboard_widgets').upsert(
      unique.map((wid,i) => ({ user_id:uid, widget_id:wid, position:i, visible:true })),
      { onConflict:'user_id,widget_id' }
    )
    const toHide = CATALOG.map(w=>w.id).filter(id=>!unique.includes(id))
    if (toHide.length)
      await supabase.from('dashboard_widgets').upsert(
        toHide.map(wid => ({ user_id:uid, widget_id:wid, position:999, visible:false })),
        { onConflict:'user_id,widget_id' }
      )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [session])

  function addWidget(id) {
    if (!layout || layout.includes(id)) return
    const next = [...layout, id]
    setLayout(next)
    saveLayout(next)
    setCatalog(false)
  }

  function removeWidget(id) {
    const next = layout.filter(x => x !== id)
    setLayout(next)
    saveLayout(next)
  }

  function resetLayout() {
    setLayout(DEFAULT_LAYOUT)
    saveLayout(DEFAULT_LAYOUT)
  }

  // Drag & Drop zwischen Widgets
  function handleDragStart(e, id) {
    setDragSrc(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('widgetId', id)
  }

  function handleDragOver(e, id) {
    e.preventDefault()
    setDragOver(id)
  }

  function handleDrop(e, targetId) {
    e.preventDefault()
    const wid = e.dataTransfer.getData('widgetId')
    const fromCat = e.dataTransfer.getData('fromCatalog') === 'true'
    if (fromCat) {
      addWidget(wid)
    } else if (wid && wid !== targetId && layout) {
      const next = [...layout]
      const fi = next.indexOf(wid)
      const ti = next.indexOf(targetId)
      if (fi >= 0 && ti >= 0) {
        next.splice(fi, 1)
        next.splice(ti, 0, wid)
        setLayout(next)
        saveLayout(next)
      }
    }
    setDragSrc(null)
    setDragOver(null)
  }

  function handleDropZone(e) {
    e.preventDefault()
    const wid = e.dataTransfer.getData('widgetId')
    if (wid && layout && !layout.includes(wid)) addWidget(wid)
    setDragSrc(null)
    setDragOver(null)
  }

  // Grid-Layout: nutze CSS grid-template-areas
  // Kleine Widgets: 1/4 Breite · Mittlere: 1/2 · Große/Volle: 100%
  const renderGrid = () => {
    if (!layout) return null
    const rows = []
    let i = 0
    while (i < layout.length) {
      const id = layout[i]
      if (SMALL.includes(id)) {
        // Sammle bis zu 4 kleine in einer Reihe
        const batch = []
        while (i < layout.length && SMALL.includes(layout[i]) && batch.length < 4) {
          batch.push(layout[i])
          i++
        }
        rows.push({ type:'small', ids: batch, key: `small-${i}` })
      } else {
        // Mittlere: 2 nebeneinander, wenn beide mittel sind
        const next = layout[i+1]
        if (next && !SMALL.includes(next) && next !== 'greeting') {
          rows.push({ type:'pair', ids:[id, next], key:`pair-${i}` })
          i += 2
        } else {
          rows.push({ type:'full', ids:[id], key:`full-${i}` })
          i++
        }
      }
    }

    return rows.map(row => {
      if (row.type === 'small') {
        const cols = isMobile ? Math.min(2, row.ids.length) : row.ids.length
        return (
          <div key={row.key} style={{ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gap: isMobile ? 10 : 14, marginBottom: isMobile ? 10 : 14 }}>
            {row.ids.map(id => renderWidgetWrapper(id))}
          </div>
        )
      }
      if (row.type === 'pair') {
        return (
          <div key={row.key} style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 14, marginBottom: isMobile ? 10 : 14 }}>
            {row.ids.map(id => renderWidgetWrapper(id))}
          </div>
        )
      }
      return (
        <div key={row.key} style={{ marginBottom: isMobile ? 10 : 14 }}>
          {renderWidgetWrapper(row.ids[0])}
        </div>
      )
    })
  }

  function renderWidgetWrapper(id) {
    const isOver = dragOver === id
    const isDragging = dragSrc === id
    return (
      <div key={id}
        draggable={editMode}
        onDragStart={editMode ? e => handleDragStart(e, id) : undefined}
        onDragOver={editMode ? e => handleDragOver(e, id) : undefined}
        onDrop={editMode ? e => handleDrop(e, id) : undefined}
        onDragLeave={editMode ? () => setDragOver(null) : undefined}
        onDragEnd={() => { setDragSrc(null); setDragOver(null) }}
        style={{
          position: 'relative',
          opacity: isDragging ? 0.4 : 1,
          outline: isOver ? '2px dashed rgb(49,90,231)' : editMode ? '2px dashed rgba(49,90,231,0.2)' : 'none',
          borderRadius: 16,
          cursor: editMode ? 'grab' : 'default',
          transition: 'opacity 0.15s',
        }}>
        <Widget id={id} data={data} nav={nav}/>
        {editMode && (
          <button
            onClick={e => { e.stopPropagation(); removeWidget(id) }}
            style={{
              position:'absolute', top:-8, right:-8, zIndex:20,
              width:24, height:24, borderRadius:'50%',
              background:'#ef4444', border:'2px solid white',
              color:'white', fontSize:13, fontWeight:800,
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 2px 8px rgba(0,0,0,0.2)', lineHeight:1,
            }}>
            ×
          </button>
        )}
      </div>
    )
  }

  if (!layout) return <div style={{ textAlign:'center', padding:'80px 0', color:'#94A3B8', fontSize:14 }}>Dashboard wird geladen…</div>

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
        <div style={{ fontSize:12, color:'#94A3B8' }}>
          {editMode && '↕ Ziehen zum Sortieren · × zum Entfernen'}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {editMode && <>
            <button onClick={() => setCatalog(true)}
              style={{ padding:'8px 16px', borderRadius:10, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              ＋ Widget
            </button>
            <button onClick={resetLayout}
              style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#F8FAFC', color:'#64748B', fontSize:12, cursor:'pointer' }}>
              🔄 Standard
            </button>
          </>}
          <button onClick={() => setEditMode(v => !v)}
            style={{ padding:'8px 16px', borderRadius:10, border:'1.5px solid', fontSize:12, fontWeight:700, cursor:'pointer',
              borderColor:editMode?'#22c55e':'#E5E7EB', background:editMode?'#F0FDF4':'#fff', color:editMode?'#16a34a':'#475569' }}>
            {editMode ? '✓ Fertig' : '✏️ Anpassen'}
          </button>
        </div>
      </div>

      {/* Drop-Zone im Edit-Modus */}
      {editMode && (
        <div onDragOver={e => { e.preventDefault(); setDragOver('__zone__') }}
          onDrop={handleDropZone}
          onDragLeave={() => setDragOver(null)}
          style={{ marginBottom:14, padding:'10px', borderRadius:12, textAlign:'center', fontSize:12, color:'#94A3B8', transition:'all 0.15s',
            border:`2px dashed ${dragOver==='__zone__'?'var(--wl-primary, rgb(49,90,231))':'#CBD5E1'}`,
            background: dragOver==='__zone__'?'#EEF2FF':'transparent' }}>
          {dragOver==='__zone__' ? '📥 Hier loslassen' : '← Widget aus dem Katalog hier ablegen'}
        </div>
      )}

      {/* Widget Grid */}
      {loading
        ? <div style={{ textAlign:'center', padding:'60px 0', color:'#94A3B8' }}>Lädt…</div>
        : layout.length === 0
        ? (
          <div style={{ textAlign:'center', padding:'80px 0', color:'#CBD5E1' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🧩</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#94A3B8', marginBottom:8 }}>Keine Widgets aktiv</div>
            <button onClick={() => { setEditMode(true); setCatalog(true) }}
              style={{ padding:'10px 24px', borderRadius:10, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
              + Erstes Widget hinzufügen
            </button>
          </div>
        )
        : renderGrid()
      }

      {/* Katalog Panel */}
      {catalog && <CatalogPanel layout={layout} onAdd={addWidget} onClose={() => setCatalog(false)}/>}

      {/* Gespeichert Toast */}
      {saved && (
        <div style={{ position:'fixed', bottom:24, right:24, background:'rgba(20,20,43,0.85)', color:'#fff', borderRadius:10, padding:'8px 18px', fontSize:12, fontWeight:600, zIndex:999, backdropFilter:'blur(8px)' }}>
          ✓ Layout gespeichert
        </div>
      )}
    </div>
  )
}
