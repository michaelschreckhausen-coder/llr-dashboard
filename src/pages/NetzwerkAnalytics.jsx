// src/pages/NetzwerkAnalytics.jsx
//
// Reporting — Netzwerk-Analytics (Bereich Netzwerk, TEAM-scoped).
// Quelle: linkedin_network_metrics (tägliche Snapshots je Login, vom
// analytics-snapshot Cron): Verbindungen/Follower/offene Einladungen.
// Team-scoped über activeTeamId + RLS. Kein Brand-Umschalter.

import React, { useState, useEffect } from 'react'
import { Users, UserPlus, Send, Inbox, Loader2, BarChart3, Rocket, UserCheck, Clock } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import PageHeader from '../components/PageHeader'

const PRIMARY = 'rgb(49,90,231)'
const pageOuterStyle = { background:'transparent', minHeight:'100vh', padding:'24px 16px 60px' }
const pageStyle = { width:'100%', maxWidth:1068, margin:'0 auto', display:'flex', flexDirection:'column' }
const cardStyle = { background:'var(--surface)', borderRadius:16, border:'1px solid var(--border, #E4E7EC)', boxShadow:'var(--shadow-card)', padding:'18px 20px' }
const kpiTile = { flex:1, minWidth:150, background:'var(--surface)', border:'1px solid var(--border, #E4E7EC)', borderRadius:16, boxShadow:'var(--shadow-card)', padding:'14px 16px' }
const kpiLabel = { fontSize:10, fontWeight:700, color:'var(--text-muted, #6B7280)', textTransform:'uppercase', letterSpacing:'0.06em', display:'flex', alignItems:'center', gap:5 }
const kpiValue = { fontSize:24, fontWeight:800, color:'var(--text-strong, #111827)', marginTop:2, fontVariantNumeric:'tabular-nums', lineHeight:1.1 }

const fmt = n => (n == null ? '–' : Number(n).toLocaleString('de-DE'))
const dDE = s => { try { return new Date(s).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) } catch { return s } }

export default function NetzwerkAnalytics() {
  const { activeTeamId } = useTeam()
  const [rows, setRows] = useState([])
  const [brandMap, setBrandMap] = useState({})
  const [camps, setCamps] = useState([])
  const [enr, setEnr] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeTeamId) { setRows([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [{ data: nm }, { data: bv }, { data: cc }, { data: ee }] = await Promise.all([
          supabase.from('linkedin_network_metrics')
            .select('unipile_account_id, brand_voice_id, connections_total, followers_total, invites_pending_out, invites_pending_in, captured_on')
            .eq('team_id', activeTeamId).order('captured_on', { ascending: true }),
          supabase.from('brand_voices').select('id, name, brand_name'),
          supabase.from('la_campaigns').select('id, name, status').eq('team_id', activeTeamId).is('archived_at', null),
          supabase.from('la_enrollments').select('campaign_id, state, relation_status').eq('team_id', activeTeamId),
        ])
        if (cancelled) return
        setRows(nm || [])
        setCamps(cc || [])
        setEnr(ee || [])
        const map = {}
        for (const b of (bv || [])) map[b.id] = b.name || b.brand_name || null
        setBrandMap(map)
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [activeTeamId])

  // Neueste Zeile je Login
  const latestByAcct = {}
  for (const r of rows) latestByAcct[r.unipile_account_id] = r
  const logins = Object.values(latestByAcct)
  const sum = (f) => logins.reduce((a, r) => a + (Number(r[f]) || 0), 0)

  // Team-Summe je Tag (Verbindungen/Follower) für die Kurve
  const byDay = {}
  for (const r of rows) {
    const d = r.captured_on
    byDay[d] ||= { name: dDE(d), Verbindungen: 0, Follower: 0 }
    byDay[d].Verbindungen += Number(r.connections_total) || 0
    byDay[d].Follower += Number(r.followers_total) || 0
  }
  const series = Object.keys(byDay).sort().map(d => byDay[d])

  const label = (r) => brandMap[r.brand_voice_id] || r.unipile_account_id?.slice(0, 8) || 'Login'

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <PageHeader
          overline="LinkedIn · Netzwerk"
          title="Netzwerk-Analytics"
          subtitle="Verbindungen, Follower und offene Einladungen deines Teams — je verbundenem LinkedIn-Profil."
        />

        {loading ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)' }}>
            <Loader2 size={18} className="lk-spin" /> Lädt…
          </div>
        ) : logins.length === 0 ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13, padding:'40px 20px' }}>
            <BarChart3 size={32} color="#CBD5E1" style={{ marginBottom:10 }} />
            <div style={{ fontWeight:700, color:'var(--text-strong, #111827)', marginBottom:4 }}>Noch keine Netzwerkdaten</div>
            Sobald ein LinkedIn-Profil verbunden ist, erfasst der tägliche Snapshot Verbindungen, Follower und offene Einladungen.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* KPI-Reihe (Team-Summe) */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <div style={kpiTile}><div style={kpiLabel}><Users size={11}/>Verbindungen</div><div style={kpiValue}>{fmt(sum('connections_total'))}</div></div>
              <div style={kpiTile}><div style={kpiLabel}><UserPlus size={11}/>Follower</div><div style={kpiValue}>{fmt(sum('followers_total'))}</div></div>
              <div style={kpiTile}><div style={kpiLabel}><Send size={11}/>Anfragen offen (raus)</div><div style={kpiValue}>{fmt(sum('invites_pending_out'))}</div></div>
              <div style={kpiTile}><div style={kpiLabel}><Inbox size={11}/>Anfragen offen (rein)</div><div style={kpiValue}>{fmt(sum('invites_pending_in'))}</div></div>
              <div style={kpiTile}><div style={kpiLabel}><BarChart3 size={11}/>Verbundene Profile</div><div style={kpiValue}>{fmt(logins.length)}</div></div>
            </div>

            {/* Wachstumskurve */}
            <div style={cardStyle}>
              <div className="lk-eyebrow">Netzwerk-Wachstum</div>
              {series.length < 2 ? (
                <div style={{ fontSize:13, color:'var(--text-muted, #6B7280)', padding:'24px 0', textAlign:'center' }}>
                  Der Verlauf entsteht aus täglichen Snapshots — ab morgen erscheinen hier erste Kurvenpunkte.
                </div>
              ) : (
                <div style={{ width:'100%', height:280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top:8, right:16, bottom:8, left:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                      <XAxis dataKey="name" tick={{ fontSize:11 }} />
                      <YAxis tick={{ fontSize:11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize:12 }} />
                      <Line type="monotone" dataKey="Verbindungen" stroke={PRIMARY} strokeWidth={2} dot={{ r:2 }} />
                      <Line type="monotone" dataKey="Follower" stroke="#039855" strokeWidth={2} dot={{ r:2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Per-Login-Aufschlüsselung */}
            <div style={cardStyle}>
              <div className="lk-eyebrow">Je Profil</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'flex', fontSize:11, fontWeight:700, color:'var(--text-muted,#6B7280)', textTransform:'uppercase', letterSpacing:'0.05em', padding:'0 4px' }}>
                  <span style={{ flex:2, minWidth:120 }}>Profil</span>
                  <span style={{ flex:1, textAlign:'right' }}>Verbindungen</span>
                  <span style={{ flex:1, textAlign:'right' }}>Follower</span>
                  <span style={{ flex:1, textAlign:'right' }}>Anfr. raus</span>
                  <span style={{ flex:1, textAlign:'right' }}>Anfr. rein</span>
                </div>
                {logins.map(r => (
                  <div key={r.unipile_account_id} style={{ display:'flex', alignItems:'center', fontSize:13, padding:'8px 4px', borderTop:'1px solid var(--border-soft,#F1F5F9)' }}>
                    <span style={{ flex:2, minWidth:120, fontWeight:600, color:'var(--text-strong,#111827)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label(r)}</span>
                    <span style={{ flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.connections_total)}</span>
                    <span style={{ flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.followers_total)}</span>
                    <span style={{ flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.invites_pending_out)}</span>
                    <span style={{ flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.invites_pending_in)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Automatisierung (Kampagnen-Reporting) ── */}
            {camps.length > 0 && (() => {
              const byCampaign = {}
              for (const e of enr) { (byCampaign[e.campaign_id] ||= []).push(e) }
              const activeCamps = camps.filter(c => c.status === 'active').length
              const totalTargets = enr.length
              const connected = enr.filter(e => e.relation_status === 'connected').length
              const pending = enr.filter(e => e.relation_status === 'pending').length
              const A = ({ icon, label, value }) => (
                <div style={kpiTile}><div style={kpiLabel}>{icon}{label}</div><div style={kpiValue}>{fmt(value)}</div></div>
              )
              return (
                <>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:4 }}>
                    <A icon={<Rocket size={11}/>} label="Aktive Kampagnen" value={activeCamps} />
                    <A icon={<Users size={11}/>} label="Ziele gesamt" value={totalTargets} />
                    <A icon={<UserCheck size={11}/>} label="Angenommen" value={connected} />
                    <A icon={<Clock size={11}/>} label="Ausstehend" value={pending} />
                  </div>
                  <div style={cardStyle}>
                    <div className="lk-eyebrow">Automatisierung · Kampagnen</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ display:'flex', fontSize:11, fontWeight:700, color:'var(--text-muted,#6B7280)', textTransform:'uppercase', letterSpacing:'0.05em', padding:'0 4px' }}>
                        <span style={{ flex:2, minWidth:140 }}>Kampagne</span>
                        <span style={{ flex:1, textAlign:'right' }}>Status</span>
                        <span style={{ flex:1, textAlign:'right' }}>Ziele</span>
                        <span style={{ flex:1, textAlign:'right' }}>Angenommen</span>
                        <span style={{ flex:1, textAlign:'right' }}>Ausstehend</span>
                      </div>
                      {camps.slice().sort((a,b)=>(byCampaign[b.id]?.length||0)-(byCampaign[a.id]?.length||0)).map(c => {
                        const list = byCampaign[c.id] || []
                        const conn = list.filter(e => e.relation_status === 'connected').length
                        const pend = list.filter(e => e.relation_status === 'pending').length
                        return (
                          <div key={c.id} style={{ display:'flex', alignItems:'center', fontSize:13, padding:'8px 4px', borderTop:'1px solid var(--border-soft,#F1F5F9)' }}>
                            <span style={{ flex:2, minWidth:140, fontWeight:600, color:'var(--text-strong,#111827)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name || 'Kampagne'}</span>
                            <span style={{ flex:1, textAlign:'right', color:'var(--text-muted,#6B7280)', fontSize:12 }}>{c.status}</span>
                            <span style={{ flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(list.length)}</span>
                            <span style={{ flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(conn)}</span>
                            <span style={{ flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(pend)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )
            })()}

            <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', lineHeight:1.5 }}>
              Hinweis: LinkedIn liefert nur aktuelle Werte — den Verlauf bauen wir über tägliche Snapshots auf. „Anfragen offen" = ausstehende gesendete/erhaltene Vernetzungsanfragen. „Angenommen/Ausstehend" bei Kampagnen wird durch den Automatisierungs-Runner aktualisiert.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
