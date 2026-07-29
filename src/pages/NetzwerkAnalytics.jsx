// src/pages/NetzwerkAnalytics.jsx
//
// Reporting — Netzwerk & Dialog (Bereich Analyse, BRAND-scoped).
// Quelle: linkedin_network_metrics (tägliche Snapshots je Login, vom
// analytics-snapshot Cron): Verbindungen/Follower/offene Einladungen.
// Brand-scoped über die aktive Marke (brand_voice_id) + RLS. Dialog-Kennzahlen
// aus linkedin_chats/linkedin_chat_messages (echtes Postfach).

import React, { useState, useEffect } from 'react'
import { Users, UserPlus, Send, Inbox, Loader2, BarChart3, Rocket, UserCheck, Clock, MessageSquare, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ComposedChart, Bar,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import PageHeader from '../components/PageHeader'
import TabBar from '../components/TabBar'
import OffeneAnfragen from '../components/OffeneAnfragen'

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
  const { activeBrandVoice } = useBrandVoice()
  const [rows, setRows] = useState([])
  const [brandMap, setBrandMap] = useState({})
  const [camps, setCamps] = useState([])
  const [enr, setEnr] = useState([])
  const [invites, setInvites] = useState([])
  const [msg, setMsg] = useState([])
  const [chats, setChats] = useState([])
  const [dmsgs, setDmsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [ntab, setNtab] = useState('netzwerk')

  useEffect(() => {
    const bvId = activeBrandVoice?.id || null
    if (!activeTeamId || !bvId) { setRows([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        // Brand-scoped: Netzwerk-Analyse zeigt das Profil der aktiven Marke.
        const [{ data: nm }, { data: bv }, { data: cc }, { data: ee }, { data: iv }, { data: mm }, { data: ch }] = await Promise.all([
          supabase.from('linkedin_network_metrics')
            .select('unipile_account_id, brand_voice_id, connections_total, followers_total, invites_pending_out, invites_pending_in, captured_on')
            .eq('brand_voice_id', bvId).order('captured_on', { ascending: true }),
          supabase.from('brand_voices').select('id, name, brand_name'),
          supabase.from('la_campaigns').select('id, name, status').eq('brand_voice_id', bvId),
          supabase.from('la_enrollments').select('campaign_id, state, relation_status').eq('brand_voice_id', bvId),
          supabase.from('linkedin_invitations').select('status, sent_at, responded_at').eq('brand_voice_id', bvId),
          supabase.from('linkedin_messaging_metrics').select('unipile_account_id, unread_threads, unread_messages, active_7d, chats_scanned, captured_on').eq('brand_voice_id', bvId).order('captured_on', { ascending: true }),
          supabase.from('linkedin_chats').select('id, attendee_name, unread_count, last_message_at').eq('brand_voice_id', bvId).order('last_message_at', { ascending: false }),
        ])
        if (cancelled) return
        setRows(nm || [])
        setCamps(cc || [])
        setEnr(ee || [])
        setInvites(iv || [])
        setMsg(mm || [])
        setChats(ch || [])
        let dm = []
        if (ch && ch.length) {
          const ids = ch.map(c => c.id)
          const { data: dmr } = await supabase.from('linkedin_chat_messages')
            .select('chat_id, direction, sent_at').in('chat_id', ids).order('sent_at', { ascending: true })
          dm = dmr || []
        }
        if (!cancelled) setDmsgs(dm)
        const map = {}
        for (const b of (bv || [])) map[b.id] = b.name || b.brand_name || null
        setBrandMap(map)
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [activeTeamId, activeBrandVoice?.id])

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

  // ── Vernetzungs-Annahmequote (aus linkedin_invitations) ──
  const invAccepted = invites.filter(i => i.status === 'accepted')
  const invPending  = invites.filter(i => i.status === 'pending')
  const acceptDen = invAccepted.length + invPending.length
  const acceptRate = acceptDen > 0 ? Math.round((invAccepted.length / acceptDen) * 100) : null
  // Ø Zeit bis Annahme (Tage) aus responded_at - sent_at
  const accDurations = invAccepted
    .filter(i => i.sent_at && i.responded_at)
    .map(i => (new Date(i.responded_at) - new Date(i.sent_at)) / 86400000)
    .filter(d => d >= 0)
  const avgAcceptDays = accDurations.length ? (accDurations.reduce((a,b)=>a+b,0) / accDurations.length) : null
  // Wöchentliche Reihe: gesendet vs. angenommen (nach sent_at-Woche), + Annahmequote je Woche
  const weekKey = (d) => { const x = new Date(d); const day = (x.getUTCDay()+6)%7; x.setUTCDate(x.getUTCDate()-day); x.setUTCHours(0,0,0,0); return x.toISOString().slice(0,10) }
  const invByWeek = {}
  for (const i of invites) {
    if (!i.sent_at) continue
    const k = weekKey(i.sent_at)
    invByWeek[k] ||= { week:k, name: dDE(k), Gesendet:0, Angenommen:0 }
    invByWeek[k].Gesendet++
    if (i.status === 'accepted') invByWeek[k].Angenommen++
  }
  const invWeeks = Object.keys(invByWeek).sort().map(k => { const r = invByWeek[k]; return { ...r, Quote: r.Gesendet>0 ? Math.round((r.Angenommen/r.Gesendet)*100) : 0 } })

  // ── Postfach (aus linkedin_messaging_metrics) ──
  const msgLatest = {}
  for (const r of msg) msgLatest[r.unipile_account_id] = r
  const msgLogins = Object.values(msgLatest)
  const msgSum = (f) => msgLogins.reduce((a, r) => a + (Number(r[f]) || 0), 0)
  const msgByDay = {}
  for (const r of msg) {
    const d = r.captured_on
    msgByDay[d] ||= { name: dDE(d), 'Ungelesene Threads': 0, 'Aktiv (7T)': 0 }
    msgByDay[d]['Ungelesene Threads'] += Number(r.unread_threads) || 0
    msgByDay[d]['Aktiv (7T)'] += Number(r.active_7d) || 0
  }
  const msgSeries = Object.keys(msgByDay).sort().map(d => msgByDay[d])

  // ── Dialog-Metriken (aus linkedin_chats / linkedin_chat_messages) ──
  const byChat = {}
  for (const m of dmsgs) (byChat[m.chat_id] ||= []).push(m)
  let dInbound = 0, dOutbound = 0, chatsWithOut = 0, chatsReplied = 0
  const respHours = []
  for (const c of chats) {
    const ms = (byChat[c.id] || []).slice().sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))
    const hasOut = ms.some(m => m.direction === 'outbound')
    const hasIn = ms.some(m => m.direction === 'inbound')
    for (const m of ms) { if (m.direction === 'inbound') dInbound++; else dOutbound++ }
    if (hasOut) { chatsWithOut++; if (hasIn) chatsReplied++ }
    let lastOut = null
    for (const m of ms) {
      if (m.direction === 'outbound') { if (lastOut == null) lastOut = new Date(m.sent_at) }
      else if (m.direction === 'inbound' && lastOut) { const h = (new Date(m.sent_at) - lastOut) / 3600000; if (h >= 0) respHours.push(h); break }
    }
  }
  const replyRate = chatsWithOut > 0 ? Math.round((chatsReplied / chatsWithOut) * 100) : null
  const avgRespH = respHours.length ? (respHours.reduce((a, b) => a + b, 0) / respHours.length) : null
  const avgRespTxt = avgRespH == null ? '–' : (avgRespH < 48 ? avgRespH.toFixed(1) + ' h' : (avgRespH / 24).toFixed(1) + ' T')
  const unreadChats = chats.filter(c => (c.unread_count || 0) > 0).length
  const activeDialogs = chats.filter(c => { const ms = byChat[c.id] || []; return ms.some(m => m.direction === 'outbound') && ms.some(m => m.direction === 'inbound') }).length
  const personRows = chats
    .map(c => ({ name: c.attendee_name || 'Unbekannt', count: (byChat[c.id] || []).length, unread: c.unread_count || 0, last: c.last_message_at }))
    .sort((a, b) => new Date(b.last || 0) - new Date(a.last || 0)).slice(0, 12)

  const label = (r) => brandMap[r.brand_voice_id] || r.unipile_account_id?.slice(0, 8) || 'Login'

  const isCompany = activeBrandVoice?.account_type === 'company_page'
  const NTABS = [
    { v:'netzwerk',  label:'Übersicht', icon:<Users size={16} strokeWidth={1.75}/>,       color:'blue' },
    { v:'dialog',    label:'Dialog',    icon:<MessageSquare size={16} strokeWidth={1.75}/>,color:'purple' },
    { v:'annahmen',  label:'Annahmen',  icon:<UserCheck size={16} strokeWidth={1.75}/>,    color:'green' },
    { v:'kampagnen', label:'Kampagnen', icon:<Rocket size={16} strokeWidth={1.75}/>,       color:'amber' },
  ]

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <PageHeader
          overline="LinkedIn · Analyse"
          title="Netzwerk & Dialog"
          subtitle="Vernetzung, Automatisierung und Postfach des Profils der aktiven Marke."
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
            <TabBar tabs={NTABS.filter(t => !isCompany || (t.v !== 'annahmen' && t.v !== 'kampagnen'))} active={ntab} onChange={setNtab} style={{ marginBottom:4 }} />
            {ntab==='netzwerk' && (<>
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

            {/* Per-Login-Aufschlüsselung — nur wenn eine Marke ausnahmsweise mehrere Profile hat (brand-scoped = i.d.R. 1) */}
            {logins.length > 1 && (
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
            )}

            <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', lineHeight:1.5 }}>
              Hinweis: LinkedIn liefert nur aktuelle Werte — den Verlauf bauen wir über tägliche Snapshots auf. „Anfragen offen" = ausstehende gesendete/erhaltene Vernetzungsanfragen. „Angenommen/Ausstehend" bei Kampagnen wird durch den Automatisierungs-Runner aktualisiert.
            </div>            </>)}
            {ntab==='dialog' && (<>
            {/* ── Dialog (aus dem Postfach) ── */}
            {(dOutbound + dInbound) > 0 && (
              <div style={cardStyle}>
                <div className="lk-eyebrow"><MessageSquare size={12} style={{ verticalAlign:'-2px' }} /> Dialog</div>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap', margin:'6px 0 4px' }}>
                  <div style={kpiTile}><div style={kpiLabel}><UserCheck size={11}/>Antwortquote</div><div style={{ ...kpiValue, color:'var(--primary)' }}>{replyRate != null ? replyRate + ' %' : '–'}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}><Clock size={11}/>Ø Antwortzeit</div><div style={kpiValue}>{avgRespTxt}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}><MessageSquare size={11}/>Aktive Dialoge</div><div style={kpiValue}>{fmt(activeDialogs)}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}><Inbox size={11}/>Ungelesen</div><div style={{ ...kpiValue, color: unreadChats>0 ? '#B54708' : undefined }}>{fmt(unreadChats)}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}><ArrowUpRight size={11}/>Nachrichten raus</div><div style={kpiValue}>{fmt(dOutbound)}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}><ArrowDownLeft size={11}/>Nachrichten rein</div><div style={kpiValue}>{fmt(dInbound)}</div></div>
                </div>
                {personRows.length > 0 && (
                  <div style={{ marginTop:12, overflowX:'auto' }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--text-strong,#111827)', marginBottom:6 }}>Dialoge nach Kontakt</div>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                      <thead>
                        <tr style={{ textAlign:'left', color:'var(--text-muted,#6B7280)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                          <th style={{ padding:'6px 8px' }}>Kontakt</th>
                          <th style={{ padding:'6px 8px', textAlign:'right' }}>Nachrichten</th>
                          <th style={{ padding:'6px 8px', textAlign:'right' }}>Ungelesen</th>
                          <th style={{ padding:'6px 8px', textAlign:'right' }}>Letzte Aktivität</th>
                        </tr>
                      </thead>
                      <tbody>
                        {personRows.map((p, i) => (
                          <tr key={i} style={{ borderTop:'1px solid #F1F3F5' }}>
                            <td style={{ padding:'7px 8px', color:'var(--text-strong,#111827)', fontWeight:500 }}>{p.name}</td>
                            <td style={{ padding:'7px 8px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(p.count)}</td>
                            <td style={{ padding:'7px 8px', textAlign:'right', fontVariantNumeric:'tabular-nums', color: p.unread>0 ? '#B54708' : '#9CA3AF', fontWeight: p.unread>0 ? 700 : 400 }}>{p.unread > 0 ? p.unread : '–'}</td>
                            <td style={{ padding:'7px 8px', textAlign:'right', color:'var(--text-muted,#6B7280)' }}>{p.last ? dDE(p.last) : '–'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Postfach (Dialog) ── */}
            {msg.length > 0 && (
              <div style={cardStyle}>
                <div className="lk-eyebrow">Postfach · Dialog</div>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap', margin:'6px 0 4px' }}>
                  <div style={kpiTile}><div style={kpiLabel}>Ungelesene Threads</div><div style={{ ...kpiValue, color: msgSum('unread_threads')>0 ? '#B45309' : undefined }}>{fmt(msgSum('unread_threads'))}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}>Ungelesene Nachrichten</div><div style={kpiValue}>{fmt(msgSum('unread_messages'))}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}>Aktive Gespräche (7T)</div><div style={kpiValue}>{fmt(msgSum('active_7d'))}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}>Gescannte Chats</div><div style={kpiValue}>{fmt(msgSum('chats_scanned'))}</div></div>
                </div>
                {msgSeries.length >= 2 && (
                  <div style={{ width:'100%', height:200, marginTop:8 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={msgSeries} margin={{ top:8, right:16, bottom:8, left:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                        <XAxis dataKey="name" tick={{ fontSize:11 }} /><YAxis tick={{ fontSize:11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize:12 }} />
                        <Line type="monotone" dataKey="Ungelesene Threads" stroke="#D97706" strokeWidth={2} dot={{ r:2 }} />
                        <Line type="monotone" dataKey="Aktiv (7T)" stroke={PRIMARY} strokeWidth={2} dot={{ r:2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', marginTop:8 }}>Gescannt werden die zuletzt aktiven Konversationen (gedeckelt). „Ungelesen" = Threads mit ungelesenen Nachrichten, „Aktiv 7T" = Gespräche mit Aktivität in den letzten 7 Tagen.</div>
              </div>
            )}

            </>)}
            {ntab==='annahmen' && !isCompany && (<>
            {/* ── Offene Anfragen verwalten (aus Vernetzung verlagert) ── */}
            <OffeneAnfragen />

            {/* ── Vernetzungs-Annahmequote ── */}
            {invites.length > 0 && (
              <div style={cardStyle}>
                <div className="lk-eyebrow"><UserCheck size={12} style={{ verticalAlign:'-2px' }} /> Vernetzungs-Annahmequote</div>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap', margin:'6px 0 4px' }}>
                  <div style={kpiTile}><div style={kpiLabel}>Annahmequote</div><div style={{ ...kpiValue, color:'var(--primary)' }}>{acceptRate != null ? acceptRate + ' %' : '–'}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}>Angenommen</div><div style={kpiValue}>{fmt(invAccepted.length)}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}>Offen (ausstehend)</div><div style={kpiValue}>{fmt(invPending.length)}</div></div>
                  <div style={kpiTile}><div style={kpiLabel}>Ø Zeit bis Annahme</div><div style={kpiValue}>{avgAcceptDays != null ? avgAcceptDays.toFixed(1) + ' T' : '–'}</div></div>
                </div>
                {invWeeks.length >= 2 && (
                  <div style={{ width:'100%', height:240, marginTop:8 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={invWeeks} margin={{ top:8, right:16, bottom:8, left:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                        <XAxis dataKey="name" tick={{ fontSize:11 }} />
                        <YAxis yAxisId="left" tick={{ fontSize:11 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11 }} unit="%" domain={[0,100]} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize:12 }} />
                        <Bar yAxisId="left" dataKey="Gesendet" fill="#CBD5E1" radius={[4,4,0,0]} maxBarSize={34} />
                        <Bar yAxisId="left" dataKey="Angenommen" fill={PRIMARY} radius={[4,4,0,0]} maxBarSize={34} />
                        <Line yAxisId="right" type="monotone" dataKey="Quote" name="Annahmequote %" stroke="#059669" strokeWidth={2} dot={{ r:2 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', marginTop:8 }}>
                  Anteil angenommener Vernetzungsanfragen (angenommen ÷ (angenommen + offen)). Wochenbalken nach Sende-Woche, Linie = Quote je Woche.
                </div>
              </div>
            )}

            </>)}
            {ntab==='kampagnen' && !isCompany && (<>
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

            </>)}

          </div>
        )}
      </div>
    </div>
  )
}
