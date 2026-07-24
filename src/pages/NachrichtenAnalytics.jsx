// src/pages/NachrichtenAnalytics.jsx
//
// Reporting — Nachrichten/Inbox-Analytics (Bereich Netzwerk, TEAM-scoped).
// Quelle: linkedin_messaging_metrics (tägliche Snapshots je Login, gedeckelter
// Chat-Scan via analytics-snapshot Cron): ungelesene Threads, aktive Gespräche.

import React, { useState, useEffect } from 'react'
import { Mail, MailOpen, MessageSquare, Zap, Loader2, BarChart3 } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
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

export default function NachrichtenAnalytics() {
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const [rows, setRows] = useState([])
  const [brandMap, setBrandMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const bvId = activeBrandVoice?.id || null
    if (!activeTeamId || !bvId) { setRows([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        // Brand-scoped: Nachrichten-Analyse zeigt das Postfach des Profils der aktiven Marke.
        const [{ data: mm }, { data: bv }] = await Promise.all([
          supabase.from('linkedin_messaging_metrics')
            .select('unipile_account_id, brand_voice_id, chats_scanned, unread_threads, unread_messages, active_7d, captured_on')
            .eq('brand_voice_id', bvId).order('captured_on', { ascending: true }),
          supabase.from('brand_voices').select('id, name, brand_name'),
        ])
        if (cancelled) return
        setRows(mm || [])
        const map = {}
        for (const b of (bv || [])) map[b.id] = b.name || b.brand_name || null
        setBrandMap(map)
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [activeTeamId, activeBrandVoice?.id])

  const latestByAcct = {}
  for (const r of rows) latestByAcct[r.unipile_account_id] = r
  const logins = Object.values(latestByAcct)
  const sum = (f) => logins.reduce((a, r) => a + (Number(r[f]) || 0), 0)

  const byDay = {}
  for (const r of rows) {
    const d = r.captured_on
    byDay[d] ||= { name: dDE(d), 'Ungelesene Threads': 0, 'Aktiv (7T)': 0 }
    byDay[d]['Ungelesene Threads'] += Number(r.unread_threads) || 0
    byDay[d]['Aktiv (7T)'] += Number(r.active_7d) || 0
  }
  const series = Object.keys(byDay).sort().map(d => byDay[d])
  const label = (r) => brandMap[r.brand_voice_id] || r.unipile_account_id?.slice(0, 8) || 'Login'

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <PageHeader
          overline="LinkedIn · Netzwerk"
          title="Nachrichten-Analytics"
          subtitle="Ungelesene Threads und aktive Gespräche im Postfach der aktiven Marke."
        />

        {loading ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)' }}>
            <Loader2 size={18} className="lk-spin" /> Lädt…
          </div>
        ) : logins.length === 0 ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13, padding:'40px 20px' }}>
            <BarChart3 size={32} color="#CBD5E1" style={{ marginBottom:10 }} />
            <div style={{ fontWeight:700, color:'var(--text-strong, #111827)', marginBottom:4 }}>Noch keine Inbox-Daten</div>
            Sobald ein LinkedIn-Profil verbunden ist, erfasst der tägliche Snapshot ungelesene Threads und aktive Gespräche.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <div style={kpiTile}><div style={kpiLabel}><Mail size={11}/>Ungelesene Threads</div><div style={kpiValue}>{fmt(sum('unread_threads'))}</div></div>
              <div style={kpiTile}><div style={kpiLabel}><MessageSquare size={11}/>Ungelesene Nachrichten</div><div style={kpiValue}>{fmt(sum('unread_messages'))}</div></div>
              <div style={kpiTile}><div style={kpiLabel}><Zap size={11}/>Aktive Gespräche (7 T)</div><div style={kpiValue}>{fmt(sum('active_7d'))}</div></div>
              <div style={kpiTile}><div style={kpiLabel}><MailOpen size={11}/>Gescannte Chats</div><div style={kpiValue}>{fmt(sum('chats_scanned'))}</div></div>
            </div>

            <div style={cardStyle}>
              <div className="lk-eyebrow">Inbox-Verlauf</div>
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
                      <YAxis tick={{ fontSize:11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize:12 }} />
                      <Line type="monotone" dataKey="Ungelesene Threads" stroke="#D97706" strokeWidth={2} dot={{ r:2 }} />
                      <Line type="monotone" dataKey="Aktiv (7T)" stroke={PRIMARY} strokeWidth={2} dot={{ r:2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {logins.length > 1 && (
            <div style={cardStyle}>
              <div className="lk-eyebrow">Je Profil</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'flex', fontSize:11, fontWeight:700, color:'var(--text-muted,#6B7280)', textTransform:'uppercase', letterSpacing:'0.05em', padding:'0 4px' }}>
                  <span style={{ flex:2, minWidth:120 }}>Profil</span>
                  <span style={{ flex:1, textAlign:'right' }}>Ungelesen</span>
                  <span style={{ flex:1, textAlign:'right' }}>Aktiv (7T)</span>
                  <span style={{ flex:1, textAlign:'right' }}>Chats</span>
                </div>
                {logins.map(r => (
                  <div key={r.unipile_account_id} style={{ display:'flex', alignItems:'center', fontSize:13, padding:'8px 4px', borderTop:'1px solid var(--border-soft,#F1F5F9)' }}>
                    <span style={{ flex:2, minWidth:120, fontWeight:600, color:'var(--text-strong,#111827)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label(r)}</span>
                    <span style={{ flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.unread_threads)}</span>
                    <span style={{ flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.active_7d)}</span>
                    <span style={{ flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.chats_scanned)}</span>
                  </div>
                ))}
              </div>
            </div>
            )}

            <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', lineHeight:1.5 }}>
              Hinweis: Gescannt werden die zuletzt aktiven Konversationen (gedeckelt). „Ungelesen" = Threads mit ungelesenen Nachrichten, „Aktiv (7 T)" = Konversationen mit Aktivität in den letzten 7 Tagen.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
