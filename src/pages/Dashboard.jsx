import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────
function DonutChart({ value, max, color, size = 80, stroke = 10 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${pct*circ} ${circ}`} strokeLinecap="round"/>
    </svg>
  )
}

function relDate(iso) {
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Gestern'
  if (diff < 7) return `vor ${diff}d`
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'short' })
}

// ─── Widget Katalog ───────────────────────────────────────────────────────────
const WIDGET_CATALOG = [
  { id:'greeting',          label:'Begrüßung',            icon:'👋', desc:'Persönliche Tagesübersicht',    size:'full'   },
  { id:'pipeline_value',    label:'Pipeline Wert',         icon:'💼', desc:'Gesamtwert aller aktiven Deals', size:'small'  },
  { id:'win_rate',          label:'Win Rate',              icon:'🏆', desc:'Abschlussquote deiner Deals',   size:'small'  },
  { id:'hot_leads',         label:'Hot Leads',             icon:'🔥', desc:'Leads mit Score ≥ 70',          size:'small'  },
  { id:'today_active',      label:'Heute aktiv',           icon:'✅', desc:'Aktivitäten heute vs. Woche',   size:'small'  },
  { id:'linkedin_leads',    label:'LinkedIn Leads',        icon:'👥', desc:'Gesamt-Leads & Konversionsrate', size:'medium' },
  { id:'ssi_score',         label:'Social Selling Index',  icon:'📊', desc:'LinkedIn SSI Score Überblick',  size:'medium' },
  { id:'mql_leads',         label:'MQL Leads',             icon:'🎯', desc:'Marketing-qualifizierte Leads', size:'small'  },
  { id:'messages',          label:'Nachrichten',           icon:'💬', desc:'Archivierte Nachrichten',       size:'small'  },
  { id:'avg_score',         label:'Ø Score',               icon:'⭐', desc:'Durchschnittlicher Lead-Score', size:'small'  },
  { id:'lql_leads',         label:'LQL Leads',             icon:'🔗', desc:'LinkedIn-qualifizierte Leads',  size:'small'  },
  { id:'pipeline_overview', label:'Pipeline Überblick',    icon:'📈', desc:'Verteilung über alle Stages',   size:'medium' },
  { id:'latest_activities', label:'Letzte Aktivitäten',    icon:'⚡', desc:'Live CRM Timeline',             size:'medium' },
  { id:'hot_leads_list',    label:'Hot Leads — Jetzt',     icon:'🔥', desc:'Leads mit Score ≥ 50',          size:'medium' },
  { id:'followup_radar',    label:'Follow-up Radar',       icon:'📅', desc:'Überfällige Follow-ups',        size:'medium' },
  { id:'pipeline_contacts', label:'Pipeline Kontakte',     icon:'🎯', desc:'Aktive vernetzte Leads',        size:'medium' },
  { id:'ssi_teilscores',    label:'SSI Teilscores',        icon:'📉', desc:'4 SSI-Kategorien im Detail',    size:'large'  },
]

const DEFAULT_LAYOUT = [
  'greeting',
  'pipeline_value', 'win_rate', 'hot_leads', 'today_active',
  'linkedin_leads', 'ssi_score',
  'mql_leads', 'messages', 'avg_score', 'lql_leads',
  'pipeline_overview', 'latest_activities',
]

const SMALL_WIDGETS = ['pipeline_value','win_rate','hot_leads','today_active','mql_leads','messages','avg_score','lql_leads']

// ─── Widget Renderer ──────────────────────────────────────────────────────────
function WidgetRenderer({ id, data, navigate }) {
  const { leads=[], activities=[], ssi=null, msgs=[], greeting='Hallo', firstName='' } = data

  const totalLeads    = leads.length
  const connected     = leads.filter(l => l.li_connection_status === 'verbunden').length
  const hotLeads      = leads.filter(l => (l.hs_score||0) >= 70).length
  const todayActs     = activities.filter(a => new Date(a.occurred_at).toDateString() === new Date().toDateString()).length
  const weekActs      = activities.filter(a => (Date.now()-new Date(a.occurred_at))<7*86400000).length
  const inPipeline    = leads.filter(l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage)).length
  const won           = leads.filter(l => l.deal_stage === 'gewonnen').length
  const pipelineValue = leads.filter(l => l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage)).reduce((s,l) => s+(Number(l.deal_value)||0), 0)
  const winRate       = inPipeline > 0 ? Math.round((won/inPipeline)*100) : 0
  const avgScore      = leads.length > 0 ? Math.round(leads.reduce((s,l)=>s+(l.hs_score||0),0)/leads.length) : 0
  const sqlLeads      = leads.filter(l => l.status === 'SQL').length
  const ssiScore      = ssi?.total_score ? Math.round(ssi.total_score) : 0

  const card = { background:'white', borderRadius:16, border:'1px solid #E5E7EB', padding:'18px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', height:'100%', boxSizing:'border-box', overflow:'hidden' }

  switch(id) {
    case 'greeting':
      return (
        <div style={{ ...card }}>
          <div style={{ fontSize:12, color:'#94A3B8', fontWeight:500 }}>{new Date().toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
          <div style={{ fontSize:26, fontWeight:800, color:'rgb(20,20,43)', marginTop:4 }}>{greeting}, {firstName} 👋</div>
          <div style={{ fontSize:13, color:'#64748B', marginTop:4 }}>Hier ist deine Sales-Übersicht für heute.</div>
        </div>
      )

    case 'pipeline_value':
      return (
        <div style={{ ...card, cursor:'pointer' }} onClick={() => navigate('/pipeline')}>
          <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>💼 Pipeline Wert</div>
          <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>€{pipelineValue>=1000?`${Math.round(pipelineValue/1000)}k`:pipelineValue.toLocaleString('de-DE')}</div>
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>{inPipeline} Deals aktiv</div>
        </div>
      )

    case 'win_rate':
      return (
        <div style={{ ...card, cursor:'pointer' }} onClick={() => navigate('/pipeline')}>
          <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>🏆 Win Rate</div>
          <div style={{ fontSize:28, fontWeight:800, color:winRate>=40?'#22c55e':winRate>=20?'#f59e0b':'#ef4444' }}>{winRate}%</div>
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>{won} gewonnen</div>
        </div>
      )

    case 'hot_leads':
      return (
        <div style={{ ...card, cursor:'pointer' }} onClick={() => navigate('/leads')}>
          <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>🔥 Hot Leads</div>
          <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{hotLeads}</div>
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>Score ≥ 70</div>
        </div>
      )

    case 'today_active':
      return (
        <div style={card}>
          <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>✅ Heute aktiv</div>
          <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{todayActs}</div>
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>{weekActs} diese Woche</div>
        </div>
      )

    case 'mql_leads':
      return (
        <div style={card}>
          <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>🎯 MQL Leads</div>
          <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{sqlLeads}</div>
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>Marketing qualifiziert</div>
        </div>
      )

    case 'messages':
      return (
        <div style={{ ...card, cursor:'pointer' }} onClick={() => navigate('/messages')}>
          <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>💬 Nachrichten</div>
          <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{msgs.length}</div>
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>archiviert</div>
        </div>
      )

    case 'avg_score':
      return (
        <div style={card}>
          <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>⭐ Ø Score</div>
          <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{avgScore||'—'}</div>
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>Ø Lead-Bewertung</div>
        </div>
      )

    case 'lql_leads':
      return (
        <div style={{ ...card, cursor:'pointer' }} onClick={() => navigate('/leads')}>
          <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>🔗 LQL Leads</div>
          <div style={{ fontSize:28, fontWeight:800, color:'rgb(20,20,43)' }}>{connected}</div>
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>LinkedIn qualifiziert</div>
        </div>
      )

    case 'linkedin_leads':
      return (
        <div style={{ borderRadius:16, background:'linear-gradient(135deg, rgb(49,90,231) 0%, rgb(80,120,250) 100%)', padding:'22px 24px', color:'white', position:'relative', overflow:'hidden', height:'100%', boxSizing:'border-box' }}>
          <div style={{ position:'absolute', top:-40, right:-30, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }}/>
          <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <span style={{ fontSize:20 }}>👥</span>
                <span style={{ fontSize:13, fontWeight:600, opacity:0.9 }}>LinkedIn Leads</span>
              </div>
              <div style={{ fontSize:48, fontWeight:800, lineHeight:1 }}>{totalLeads}</div>
              <div style={{ fontSize:13, opacity:0.8, marginTop:4 }}>gesamt</div>
              <div style={{ display:'flex', gap:16, marginTop:12 }}>
                <div><div style={{ fontSize:18, fontWeight:700 }}>{totalLeads>0?Math.round(won/totalLeads*100):0}%</div><div style={{ fontSize:11, opacity:0.7 }}>Konversionsrate</div></div>
                <div><div style={{ fontSize:18, fontWeight:700 }}>{sqlLeads}</div><div style={{ fontSize:11, opacity:0.7 }}>SQL Leads</div></div>
              </div>
            </div>
            <div style={{ position:'relative' }}>
              <DonutChart value={connected} max={Math.max(totalLeads,1)} color="rgba(255,255,255,0.9)" size={90} stroke={9}/>
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:16, fontWeight:800 }}>{totalLeads>0?Math.round(connected/totalLeads*100):0}%</span>
              </div>
            </div>
          </div>
        </div>
      )

    case 'ssi_score':
      return (
        <div style={{ borderRadius:16, background:'linear-gradient(135deg, #7C3AED 0%, #9F67FA 100%)', padding:'22px 24px', color:'white', position:'relative', overflow:'hidden', height:'100%', boxSizing:'border-box' }}>
          <div style={{ position:'absolute', top:-30, right:-20, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }}/>
          <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <span style={{ fontSize:20 }}>📊</span>
                <span style={{ fontSize:13, fontWeight:600, opacity:0.9 }}>Social Selling Index</span>
              </div>
              {ssi ? (
                <>
                  <div style={{ fontSize:48, fontWeight:800, lineHeight:1 }}>{ssiScore}</div>
                  <div style={{ fontSize:13, opacity:0.8, marginTop:4 }}>von 100</div>
                  <div style={{ display:'flex', gap:16, marginTop:12 }}>
                    {ssi.industry_rank && <div><div style={{ fontSize:16, fontWeight:700 }}>Top {ssi.industry_rank}%</div><div style={{ fontSize:11, opacity:0.7 }}>Branche</div></div>}
                    {ssi.network_rank  && <div><div style={{ fontSize:16, fontWeight:700 }}>Top {ssi.network_rank}%</div><div style={{ fontSize:11, opacity:0.7 }}>Netzwerk</div></div>}
                  </div>
                </>
              ) : (
                <div style={{ marginTop:8 }}>
                  <div style={{ fontSize:22, fontWeight:800, opacity:0.5 }}>—</div>
                  <div style={{ fontSize:12, opacity:0.7, marginTop:4 }}>nicht erfasst</div>
                  <button onClick={() => navigate('/linkedin-about')} style={{ marginTop:12, padding:'6px 14px', borderRadius:8, background:'rgba(255,255,255,0.2)', border:'1px solid rgba(255,255,255,0.3)', color:'white', fontSize:12, fontWeight:600, cursor:'pointer' }}>SSI jetzt erfassen</button>
                </div>
              )}
            </div>
            <div style={{ position:'relative' }}>
              <DonutChart value={ssiScore} max={100} color="rgba(255,255,255,0.9)" size={90} stroke={9}/>
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:16, fontWeight:800 }}>{ssiScore}%</span>
              </div>
            </div>
          </div>
        </div>
      )

    case 'pipeline_overview': {
      const stages = [
        { label:'Neu',          key:'kein_deal',   color:'#CBD5E1' },
        { label:'Kontaktiert',  key:'prospect',    color:'#93C5FD' },
        { label:'Gespräch',     key:'opportunity', color:'#6EE7B7' },
        { label:'Angebot',      key:'angebot',     color:'#FCD34D' },
        { label:'Gewonnen',     key:'gewonnen',    color:'#34D399' },
      ]
      const total = leads.length || 1
      return (
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div><div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>Pipeline Überblick</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>{leads.length} Leads verteilt</div></div>
            <button onClick={() => navigate('/pipeline')} style={{ fontSize:12, fontWeight:600, color:'rgb(49,90,231)', background:'rgba(49,90,231,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Ansehen →</button>
          </div>
          {stages.map(s => {
            const c = leads.filter(l => l.deal_stage === s.key).length
            return (
              <div key={s.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ fontSize:12, color:'#475569', width:90, flexShrink:0, fontWeight:500 }}>{s.label}</div>
                <div style={{ flex:1, height:10, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.max((c/total)*100,c>0?4:0)}%`, background:s.color, borderRadius:99 }}/>
                </div>
                <div style={{ fontSize:12, fontWeight:700, color:'#475569', width:50, textAlign:'right' }}>{c} Leads</div>
              </div>
            )
          })}
        </div>
      )
    }

    case 'latest_activities': {
      const ACT_ICONS = { call:'📞', email:'📧', linkedin_message:'💬', meeting:'🤝', note:'📝', task:'✅', other:'📌' }
      return (
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div><div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>Letzte Aktivitäten</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>Live CRM Timeline</div></div>
            <button onClick={() => navigate('/leads')} style={{ fontSize:12, fontWeight:600, color:'rgb(49,90,231)', background:'rgba(49,90,231,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Alle →</button>
          </div>
          {activities.slice(0,5).map((a,i) => {
            const lead = leads.find(l => l.id === a.lead_id)
            return (
              <div key={a.id} onClick={() => lead && navigate(`/leads/${lead.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 0', borderBottom:i<4?'1px solid #F1F5F9':'none', cursor:lead?'pointer':'default' }}>
                <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg, rgb(49,90,231), rgb(100,140,240))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                  {ACT_ICONS[a.type] || '📌'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{lead ? `${lead.first_name||''} ${lead.last_name||''}`.trim() : 'Unbekannt'}</div>
                  <div style={{ fontSize:11, color:'#94A3B8' }}>{a.subject || a.type}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:99, background:a.type==='call'?'#ECFDF5':a.type==='meeting'?'#FFF7ED':'#EFF6FF', color:a.type==='call'?'#16a34a':a.type==='meeting'?'#ea580c':'#3b82f6' }}>{a.type}</span>
                  <span style={{ fontSize:10, color:'#94A3B8' }}>{relDate(a.occurred_at)}</span>
                </div>
              </div>
            )
          })}
          {activities.length === 0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#CBD5E1', fontSize:13 }}>Noch keine Aktivitäten</div>}
        </div>
      )
    }

    case 'hot_leads_list': {
      const hot = leads.filter(l => (l.hs_score||0) >= 50).sort((a,b) => (b.hs_score||0)-(a.hs_score||0)).slice(0,5)
      return (
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div><div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>🔥 Hot Leads — Jetzt handeln</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>Score ≥ 50 · Höchstes Abschluss-Potenzial</div></div>
            <button onClick={() => navigate('/leads')} style={{ fontSize:12, fontWeight:600, color:'#ef4444', background:'rgba(239,68,68,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Alle →</button>
          </div>
          {hot.map((l) => (
            <div key={l.id} onClick={() => navigate(`/leads/${l.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 10px', borderRadius:10, cursor:'pointer', marginBottom:4 }}
              onMouseEnter={e=>e.currentTarget.style.background='#FFF7ED'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg, #f97316, #ef4444)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, fontWeight:700, flexShrink:0 }}>
                {l.first_name?.[0]||'?'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{`${l.first_name||''} ${l.last_name||''}`.trim()}</div>
                <div style={{ fontSize:11, color:'#94A3B8' }}>{l.company||l.job_title||''}</div>
              </div>
              <span style={{ fontSize:12, fontWeight:800, color:'#ef4444', background:'#FEF2F2', padding:'2px 8px', borderRadius:99 }}>Score {l.hs_score}</span>
            </div>
          ))}
          {hot.length === 0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#CBD5E1', fontSize:13 }}>Keine Hot Leads</div>}
        </div>
      )
    }

    case 'followup_radar': {
      const overdue  = leads.filter(l => l.next_followup && new Date(l.next_followup) < new Date()).sort((a,b) => new Date(a.next_followup)-new Date(b.next_followup))
      const upcoming = leads.filter(l => l.next_followup && new Date(l.next_followup) >= new Date()).sort((a,b) => new Date(a.next_followup)-new Date(b.next_followup)).slice(0,3)
      const all = [...overdue, ...upcoming].slice(0,5)
      return (
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div><div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>📅 Follow-up Radar</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>{overdue.length} überfällig · {upcoming.length} bald</div></div>
            <button onClick={() => navigate('/leads')} style={{ fontSize:12, fontWeight:600, color:'#ef4444', background:'rgba(239,68,68,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Alle →</button>
          </div>
          {all.map((l) => {
            const diff = Math.round((new Date(l.next_followup)-new Date())/86400000)
            const isOver = diff < 0
            return (
              <div key={l.id} onClick={() => navigate(`/leads/${l.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 10px', borderRadius:10, cursor:'pointer', marginBottom:4 }}
                onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{`${l.first_name||''} ${l.last_name||''}`.trim()}</div>
                  <div style={{ fontSize:11, color:'#94A3B8' }}>{l.company||''}</div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:isOver?'#ef4444':'#22c55e', background:isOver?'#FEF2F2':'#F0FDF4', padding:'2px 8px', borderRadius:99, flexShrink:0 }}>
                  {isOver ? `${Math.abs(diff)}d über` : diff===0?'Heute':diff===1?'Morgen':`in ${diff}d`}
                </span>
              </div>
            )
          })}
          {all.length === 0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#CBD5E1', fontSize:13 }}>Alles auf dem neuesten Stand ✓</div>}
        </div>
      )
    }

    case 'pipeline_contacts': {
      const contacts = leads.filter(l => l.li_connection_status==='verbunden' && l.deal_stage && !['kein_deal','verloren'].includes(l.deal_stage)).slice(0,5)
      return (
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div><div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>🎯 Aktive Pipeline-Kontakte</div>
            <div style={{ fontSize:12, color:'#94A3B8' }}>Vernetzt — In Pipeline</div></div>
            <button onClick={() => navigate('/pipeline')} style={{ fontSize:12, fontWeight:600, color:'#f59e0b', background:'rgba(245,158,11,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Pipeline →</button>
          </div>
          {contacts.map((l) => (
            <div key={l.id} onClick={() => navigate(`/leads/${l.id}`)} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', borderRadius:12, background:'#FFFBEB', border:'1px solid #FDE68A', marginBottom:8, cursor:'pointer' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{`${l.first_name||''} ${l.last_name||''}`.trim()}</div>
                <div style={{ fontSize:11, color:'#94A3B8' }}>{l.deal_stage} · {l.company||''}</div>
              </div>
              {l.deal_value && <span style={{ fontSize:12, fontWeight:700, color:'#22c55e' }}>€{Number(l.deal_value).toLocaleString('de-DE')}</span>}
              <span style={{ fontSize:11, fontWeight:700, color:'#1d4ed8', background:'#EFF6FF', padding:'2px 8px', borderRadius:99 }}>Score {l.hs_score||0}</span>
            </div>
          ))}
          {contacts.length === 0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#CBD5E1', fontSize:13 }}>Keine Pipeline-Kontakte</div>}
        </div>
      )
    }

    case 'ssi_teilscores': {
      const cats = [
        { key:'brand_score',    label:'Marke aufbauen',  color:'#3b82f6', max:25 },
        { key:'prospect_score', label:'Personen finden', color:'#22c55e', max:25 },
        { key:'insight_score',  label:'Insights nutzen', color:'#f97316', max:25 },
        { key:'relation_score', label:'Beziehungen',     color:'#8b5cf6', max:25 },
      ]
      return (
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div><div style={{ fontSize:15, fontWeight:800, color:'rgb(20,20,43)' }}>📉 SSI Teilscores</div>
            {ssi && <div style={{ fontSize:12, color:'#94A3B8' }}>Letzte Messung: {new Date(ssi.measured_at||ssi.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})}</div>}</div>
            <button onClick={() => navigate('/linkedin-about')} style={{ fontSize:12, fontWeight:600, color:'#7C3AED', background:'rgba(124,58,237,0.08)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>Details →</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
            {cats.map(c => {
              const v = ssi?.[c.key] || 0
              return (
                <div key={c.key} style={{ textAlign:'center' }}>
                  <div style={{ position:'relative', display:'inline-block', marginBottom:8 }}>
                    <DonutChart value={v} max={c.max} color={c.color} size={76} stroke={7}/>
                    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', transform:'rotate(90deg) rotateY(180deg)' }}>
                      <span style={{ fontSize:15, fontWeight:800, color:c.color, transform:'rotate(90deg) scaleX(-1)' }}>{Math.round(v)}</span>
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

    default:
      return <div style={{ ...card, display:'flex', alignItems:'center', justifyContent:'center', color:'#94A3B8' }}>Widget: {id}</div>
  }
}

// ─── Widget Katalog Panel ─────────────────────────────────────────────────────
function WidgetCatalogPanel({ activeIds, onAdd, onClose }) {
  const available = WIDGET_CATALOG.filter(w => !activeIds.includes(w.id))
  const SIZE_LABEL = { small:'Klein', medium:'Mittel', large:'Groß', full:'Voll' }
  return (
    <div style={{ position:'fixed', inset:0, zIndex:500 }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.4)', backdropFilter:'blur(2px)' }} onClick={onClose}/>
      <div style={{ position:'absolute', right:0, top:0, bottom:0, width:380, background:'#fff', boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', zIndex:1 }}>
        <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'rgb(20,20,43)' }}>Widgets hinzufügen</div>
            <div style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>Ziehe auf die Seite oder klick "+"</div>
          </div>
          <button onClick={onClose} style={{ background:'#F1F5F9', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16, color:'#64748B', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
          {available.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', padding:'4px 0 10px' }}>Verfügbar ({available.length})</div>
              {available.map(w => (
                <div key={w.id}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('widgetId', w.id); e.dataTransfer.setData('fromCatalog','true') }}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, border:'1.5px solid #E5E7EB', background:'#FAFAFA', marginBottom:8, cursor:'grab' }}
                  onMouseEnter={e => { e.currentTarget.style.background='#F0F4FF'; e.currentTarget.style.borderColor='rgb(49,90,231)' }}
                  onMouseLeave={e => { e.currentTarget.style.background='#FAFAFA'; e.currentTarget.style.borderColor='#E5E7EB' }}>
                  <div style={{ fontSize:24, flexShrink:0 }}>{w.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)' }}>{w.label}</div>
                    <div style={{ fontSize:11, color:'#94A3B8', marginTop:1 }}>{w.desc}</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                    <span style={{ fontSize:9, fontWeight:700, color:'#7C3AED', background:'#F5F3FF', padding:'2px 6px', borderRadius:99, textTransform:'uppercase' }}>{SIZE_LABEL[w.size]}</span>
                    <button onClick={() => onAdd(w.id)} style={{ fontSize:11, fontWeight:700, color:'rgb(49,90,231)', background:'rgba(49,90,231,0.1)', border:'none', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>＋</button>
                  </div>
                </div>
              ))}
            </>
          )}
          {activeIds.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', padding:'12px 0 8px' }}>Aktiv ({activeIds.length})</div>
              {WIDGET_CATALOG.filter(w => activeIds.includes(w.id)).map(w => (
                <div key={w.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:10, background:'#F0F9FF', border:'1px solid #BAE6FD', marginBottom:6 }}>
                  <span style={{ fontSize:18 }}>{w.icon}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:'#0369a1', flex:1 }}>{w.label}</span>
                  <span style={{ fontSize:10, color:'#22c55e', fontWeight:700 }}>✓</span>
                </div>
              ))}
            </>
          )}
          {available.length === 0 && <div style={{ textAlign:'center', padding:'40px 20px', color:'#94A3B8' }}><div style={{ fontSize:32, marginBottom:12 }}>✅</div><div style={{ fontSize:14, fontWeight:600 }}>Alle Widgets aktiv</div></div>}
        </div>
      </div>
    </div>
  )
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function Dashboard({ session }) {
  const navigate = useNavigate()
  const [data, setData]           = useState({ leads:[], activities:[], ssi:null, msgs:[], greeting:'Hallo', firstName:'' })
  const [loading, setLoading]     = useState(true)
  const [layout, setLayout]       = useState(null)
  const [editMode, setEditMode]   = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const [dragOver, setDragOver]   = useState(null)
  const [dragging, setDragging]   = useState(null)
  const [saved, setSaved]         = useState(false)

  // Greeting
  useEffect(() => {
    const h = new Date().getHours()
    const g = h<12?'Guten Morgen':h<14?'Guten Tag':h<18?'Guten Nachmittag':'Guten Abend'
    setData(prev => ({ ...prev, greeting:g }))
  }, [])

  // Daten laden
  useEffect(() => {
    if (!session?.user?.id) return
    const uid  = session.user.id
    const meta = session.user.user_metadata || {}
    const userName = meta.full_name || meta.name || session.user.email?.split('@')[0] || 'User'
    const firstName = userName.split(' ')[0]

    Promise.all([
      supabase.from('leads').select('*').eq('user_id', uid),
      supabase.from('ssi_entries').select('*').eq('user_id', uid).order('measured_at',{ascending:false}).limit(1),
      supabase.from('messages').select('id').eq('user_id', uid).limit(50),
      supabase.from('activities').select('id,type,subject,occurred_at,lead_id').eq('user_id', uid).order('occurred_at',{ascending:false}).limit(20),
    ]).then(([l,s,m,a]) => {
      setData(prev => ({ ...prev, leads:l.data||[], activities:a.data||[], ssi:(s.data||[])[0]||null, msgs:m.data||[], firstName }))
      setLoading(false)
    })
  }, [session])

  // Layout laden
  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from('dashboard_widgets').select('widget_id,position').eq('user_id',session.user.id).eq('visible',true).order('position')
      .then(({ data: d }) => setLayout(d?.length>0 ? d.map(x=>x.widget_id) : DEFAULT_LAYOUT))
  }, [session])

  async function saveLayout(next) {
    if (!session?.user?.id) return
    const uid = session.user.id
    await supabase.from('dashboard_widgets').upsert(
      next.map((wid,i) => ({ user_id:uid, widget_id:wid, position:i, visible:true })),
      { onConflict:'user_id,widget_id' }
    )
    const removed = WIDGET_CATALOG.map(w=>w.id).filter(id=>!next.includes(id))
    if (removed.length>0)
      await supabase.from('dashboard_widgets').upsert(
        removed.map(wid => ({ user_id:uid, widget_id:wid, position:999, visible:false })),
        { onConflict:'user_id,widget_id' }
      )
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  function addWidget(wid) {
    const next = [...(layout||[]), wid]
    setLayout(next); saveLayout(next); setShowCatalog(false)
  }

  function removeWidget(wid) {
    const next = (layout||[]).filter(id=>id!==wid)
    setLayout(next); saveLayout(next)
  }

  function resetLayout() { setLayout(DEFAULT_LAYOUT); saveLayout(DEFAULT_LAYOUT) }

  function handleDrop(e, targetId) {
    e.preventDefault()
    const wid = e.dataTransfer.getData('widgetId')
    const fromCatalog = e.dataTransfer.getData('fromCatalog') === 'true'
    if (fromCatalog) { addWidget(wid); }
    else if (wid && wid !== targetId) {
      const next = [...(layout||[])]
      const fi = next.indexOf(wid), ti = next.indexOf(targetId)
      if (fi>=0 && ti>=0) { next.splice(fi,1); next.splice(ti,0,wid); setLayout(next); saveLayout(next) }
    }
    setDragging(null); setDragOver(null)
  }

  function handleDropZone(e) {
    e.preventDefault()
    const wid = e.dataTransfer.getData('widgetId')
    if (wid && !(layout||[]).includes(wid)) addWidget(wid)
    setDragOver(null); setDragging(null)
  }

  const renderWidget = (id) => {
    const isDragOver = dragOver === id
    const isDraggingThis = dragging === id
    return (
      <div key={id}
        draggable={editMode}
        onDragStart={editMode ? e => { setDragging(id); e.dataTransfer.setData('widgetId',id); e.dataTransfer.effectAllowed='move' } : undefined}
        onDragOver={editMode ? e => { e.preventDefault(); setDragOver(id) } : undefined}
        onDrop={editMode ? e => handleDrop(e, id) : undefined}
        onDragLeave={() => setDragOver(null)}
        style={{ position:'relative', opacity:isDraggingThis?0.4:1, outline:isDragOver?'2px dashed rgb(49,90,231)':'none', borderRadius:16, cursor:editMode?'grab':'default', transition:'opacity 0.15s' }}>
        <WidgetRenderer id={id} data={data} navigate={navigate}/>
        {editMode && (
          <div style={{ position:'absolute', inset:0, borderRadius:16, background:'rgba(49,90,231,0.03)', border:'2px dashed rgba(49,90,231,0.25)', pointerEvents:'none' }}>
            <button style={{ pointerEvents:'all', position:'absolute', top:8, right:8, background:'rgba(239,68,68,0.9)', border:'none', borderRadius:8, width:26, height:26, color:'white', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10 }}
              onClick={e => { e.stopPropagation(); removeWidget(id) }}>✕</button>
            <div style={{ position:'absolute', top:8, left:10, fontSize:11, fontWeight:600, color:'rgba(49,90,231,0.6)' }}>⠿ ziehen</div>
          </div>
        )}
      </div>
    )
  }

  const renderGrid = () => {
    if (!layout) return null
    const result = []
    let i = 0
    while (i < layout.length) {
      const id = layout[i]
      const small = SMALL_WIDGETS.includes(id)
      if (small) {
        const row = []
        while (i < layout.length && SMALL_WIDGETS.includes(layout[i]) && row.length < 4) { row.push(layout[i]); i++ }
        result.push(<div key={`r${i}`} style={{ display:'grid', gridTemplateColumns:`repeat(${row.length},1fr)`, gap:14, marginBottom:14 }}>{row.map(renderWidget)}</div>)
      } else {
        const next = layout[i+1]
        const nextSmall = next ? SMALL_WIDGETS.includes(next) : true
        if (!nextSmall && next) {
          result.push(<div key={`r${i}`} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>{renderWidget(id)}{renderWidget(next)}</div>)
          i += 2
        } else {
          result.push(<div key={`r${i}`} style={{ marginBottom:14 }}>{renderWidget(id)}</div>)
          i++
        }
      }
    }
    return result
  }

  if (!layout) return <div style={{ textAlign:'center', padding:'60px 0', color:'#94A3B8' }}>Lade Dashboard…</div>

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
        <div style={{ fontSize:13, color:'#94A3B8' }}>
          {editMode && '↕️ Ziehen zum Sortieren · ✕ zum Entfernen'}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {editMode && (
            <>
              <button onClick={() => setShowCatalog(true)} style={{ padding:'8px 16px', borderRadius:10, border:'none', background:'rgb(49,90,231)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                ＋ Widget
              </button>
              <button onClick={resetLayout} style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#F8FAFC', color:'#64748B', fontSize:12, cursor:'pointer' }}>
                🔄 Standard
              </button>
            </>
          )}
          <button onClick={() => setEditMode(v=>!v)} style={{ padding:'8px 16px', borderRadius:10, border:'1.5px solid', fontSize:12, fontWeight:700, cursor:'pointer', borderColor:editMode?'#22c55e':'#E5E7EB', background:editMode?'#F0FDF4':'#fff', color:editMode?'#16a34a':'#475569' }}>
            {editMode ? '✓ Fertig' : '✏️ Anpassen'}
          </button>
        </div>
      </div>

      {/* Drop Zone im Edit-Modus */}
      {editMode && (
        <div onDragOver={e=>{e.preventDefault();setDragOver('__zone__')}} onDrop={handleDropZone} onDragLeave={()=>setDragOver(null)}
          style={{ marginBottom:14, padding:'10px', borderRadius:12, border:`2px dashed ${dragOver==='__zone__'?'rgb(49,90,231)':'#CBD5E1'}`, background:dragOver==='__zone__'?'#EEF2FF':'transparent', textAlign:'center', fontSize:12, color:'#94A3B8', transition:'all 0.15s' }}>
          {dragOver==='__zone__' ? '📥 Hier loslassen' : '← Widget aus dem Katalog hier ablegen'}
        </div>
      )}

      {/* Widgets */}
      {loading ? <div style={{ textAlign:'center', padding:'60px 0', color:'#94A3B8' }}>Lädt…</div> : renderGrid()}

      {/* Leer */}
      {!loading && layout.length===0 && (
        <div style={{ textAlign:'center', padding:'80px 0', color:'#CBD5E1' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🧩</div>
          <div style={{ fontSize:18, fontWeight:700, color:'#94A3B8', marginBottom:8 }}>Keine Widgets aktiv</div>
          <button onClick={()=>{setEditMode(true);setShowCatalog(true)}} style={{ padding:'10px 24px', borderRadius:10, border:'none', background:'rgb(49,90,231)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
            + Erstes Widget hinzufügen
          </button>
        </div>
      )}

      {/* Katalog */}
      {showCatalog && <WidgetCatalogPanel activeIds={layout} onAdd={addWidget} onClose={()=>setShowCatalog(false)}/>}

      {/* Gespeichert Toast */}
      {saved && <div style={{ position:'fixed', bottom:24, right:24, background:'rgba(20,20,43,0.85)', color:'#fff', borderRadius:10, padding:'8px 18px', fontSize:12, fontWeight:600, zIndex:999, backdropFilter:'blur(8px)' }}>✓ Layout gespeichert</div>}
    </div>
  )
}
