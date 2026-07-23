// src/pages/LinkedInAnalytics.jsx
//
// Feature 4 — LinkedIn Post-Analytics (Monitoring + Lead-Harvest, Frontend).
// Liest team-scoped die vom Worker `unipile-monitor` befüllten Tabellen:
//   - content_post_metrics  → Metrik-Verlauf je Post über days_since_publish
//   - linkedin_post_engagers → Kommentierende je Post (optional als Lead übernehmen)
// „Metriken aktualisieren" ruft ausschließlich supabase.functions.invoke('unipile-monitor').
// Hard Rules: Inline-Styles, var(--wl-primary,…), Deutsch, Hooks oben, error geprüft.

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, RefreshCw, ExternalLink, Users, MessageSquare, Eye, Heart,
  Repeat2, TrendingUp, AlertCircle, CheckCircle2, Loader2, UserPlus, Check, Building2,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ComposedChart, Bar,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import PageHeader from '../components/PageHeader'

const PRIMARY = 'rgb(49,90,231)'
const PRIMARY_VAR = `var(--wl-primary, ${PRIMARY})`

const pageOuterStyle  = { background:'transparent', minHeight:'100vh', padding:'24px 16px 60px' }
const pageStyle       = { width:'100%', maxWidth:1068, margin:'0 auto', display:'flex', flexDirection:'column' }
const headerRowStyle  = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, gap:12, flexWrap:'wrap' }
const titleStyle      = { fontSize:22, fontWeight:800, margin:0, color:'var(--text-strong, #111827)', display:'flex', alignItems:'center', gap:10 }
const subtitleStyle   = { fontSize:13, color:'var(--text-muted, #6B7280)', marginTop:4 }
const cardStyle       = { background:'var(--surface)', borderRadius:16, border:'1px solid var(--border, #E4E7EC)', boxShadow:'var(--shadow-card)', padding:'18px 20px' }
const primaryBtnStyle = { padding:'9px 18px', background:'var(--primary)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
const ghostBtnStyle   = { padding:'7px 12px', background:'var(--surface)', color:'#374151', border:'1.5px solid #E4E7EC', borderRadius:10, fontSize:12, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
const sectionTitle    = { fontSize:12, fontWeight:700, color:'var(--text-strong, #111827)', marginBottom:10, display:'flex', alignItems:'center', gap:6 }
const kpiTile         = { flex:1, minWidth:120, background:'var(--surface)', border:'1px solid var(--border, #E4E7EC)', borderRadius:16, boxShadow:'var(--shadow-card)', padding:'14px 16px' }
const kpiLabel        = { fontSize:10, fontWeight:700, color:'var(--text-muted, #6B7280)', textTransform:'uppercase', letterSpacing:'0.06em', display:'flex', alignItems:'center', gap:4 }
const kpiValue        = { fontSize:22, fontWeight:800, color:'var(--text-strong, #111827)', marginTop:2, fontVariantNumeric:'tabular-nums' }

const fmt = n => (n == null ? '–' : Number(n).toLocaleString('de-DE'))
const postTitle = p => (p.title?.trim() || (p.content ? p.content.slice(0, 60) + (p.content.length > 60 ? '…' : '') : 'Beitrag'))

export default function LinkedInAnalytics() {
  const { activeTeamId } = useTeam()
  const { activeBrandVoice, noBrand } = useBrandVoice()
  const navigate = useNavigate()

  const [uid, setUid]                 = useState(null)
  const [posts, setPosts]             = useState([])
  const [metricsByPost, setMetrics]   = useState({})   // postId -> [{ day, impressions, likes, comments, reshares, rate }]
  const [latestByPost, setLatest]     = useState({})   // postId -> latest metric row
  const [engagersByPost, setEngagers] = useState({})   // postId -> [rows]
  const [selectedId, setSelectedId]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState(false)
  const [flash, setFlash]             = useState(null) // { type, text, action?:{label,to} }
  const [convertState, setConvertState] = useState({}) // engagerId -> { state, leadId }
  const [followers, setFollowers] = useState(null) // aktueller Follower-Stand der Marke (für Reichweiten-Rate)
  const [cpStats, setCpStats] = useState(null)          // Company-Page-KPIs (nur company_page-Brands)
  const [cpStatsLoading, setCpStatsLoading] = useState(false)
  const isCompanyBrand = activeBrandVoice?.account_type === 'company_page'

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  const load = useCallback(async () => {
    if (!activeTeamId || (!noBrand && !activeBrandVoice?.id)) { setPosts([]); setLoading(false); return }
    const bvId = noBrand ? null : (activeBrandVoice?.id || null)
    setLoading(true)
    // Follower-Stand der Marke (neuester Snapshot) — Basis für die Reichweiten-Rate.
    if (bvId) {
      supabase.from('linkedin_network_metrics')
        .select('followers_total, captured_on').eq('brand_voice_id', bvId)
        .order('captured_on', { ascending: false }).limit(1)
        .then(({ data }) => setFollowers(data && data[0] ? data[0].followers_total : null))
    } else { setFollowers(null) }
    // 1) Veröffentlichte Posts mit social_id (team-scoped, Fallstrick #14 expliziter Filter).
    let _pq = supabase
      .from('content_posts')
      .select('id, title, content, type, topic, hook, tags, linkedin_post_url, linkedin_social_id, published_at, last_metrics_sync_at')
      .eq('team_id', activeTeamId)
      .not('linkedin_social_id', 'is', null)
    _pq = bvId ? _pq.eq('brand_voice_id', bvId) : _pq.is('brand_voice_id', null)
    const { data: postRows, error: pErr } = await _pq.order('published_at', { ascending: false })
    if (pErr) { setFlash({ type:'error', text:'Posts laden fehlgeschlagen: ' + pErr.message }); setPosts([]); setLoading(false); return }
    const pList = postRows || []
    setPosts(pList)
    setSelectedId(prev => prev && pList.some(p => p.id === prev) ? prev : (pList[0]?.id ?? null))
    const ids = pList.map(p => p.id)
    if (ids.length === 0) { setMetrics({}); setLatest({}); setEngagers({}); setLoading(false); return }

    // 2) Metrik-Verlauf + 3) Engager parallel.
    const [mRes, eRes] = await Promise.all([
      supabase.from('content_post_metrics')
        .select('post_id, measured_at, days_since_publish, impressions, likes, comments_count, reshares, engagement_rate')
        .eq('team_id', activeTeamId).in('post_id', ids)
        .order('measured_at', { ascending: true }),
      supabase.from('linkedin_post_engagers')
        .select('id, post_id, actor_name, actor_headline, actor_profile_url, comment_text, converted_lead_id, harvested_at')
        .eq('team_id', activeTeamId).in('post_id', ids)
        .order('harvested_at', { ascending: false }),
    ])
    if (mRes.error) console.warn('[linkedin-analytics] metrics:', mRes.error.message)
    if (eRes.error) console.warn('[linkedin-analytics] engagers:', eRes.error.message)

    const series = {}, latest = {}
    for (const m of (mRes.data || [])) {
      (series[m.post_id] ||= []).push({
        day: m.days_since_publish ?? 0,
        impressions: m.impressions, likes: m.likes,
        comments: m.comments_count, reshares: m.reshares,
        rate: m.engagement_rate != null ? Number((m.engagement_rate * 100).toFixed(2)) : null,
      })
      latest[m.post_id] = m   // rows sind measured_at ASC → letzte Zuweisung = aktuellste
    }
    const engMap = {}
    for (const e of (eRes.data || [])) (engMap[e.post_id] ||= []).push(e)

    setMetrics(series); setLatest(latest); setEngagers(engMap)
    setLoading(false)
  }, [activeTeamId, activeBrandVoice?.id, noBrand])

  useEffect(() => { load() }, [load])

  // Company-Page-KPIs laden (Follower/Mitarbeiter/Wachstum) — nur für Company Brands
  useEffect(() => {
    if (!isCompanyBrand || !activeBrandVoice?.id) { setCpStats(null); return }
    let cancelled = false
    setCpStatsLoading(true)
    supabase.functions.invoke('unipile-company-stats', { body: { brand_voice_id: activeBrandVoice.id } })
      .then(({ data }) => { if (!cancelled) setCpStats(data && data.ok ? data : null) })
      .catch(() => { if (!cancelled) setCpStats(null) })
      .finally(() => { if (!cancelled) setCpStatsLoading(false) })
    return () => { cancelled = true }
  }, [isCompanyBrand, activeBrandVoice?.id])

  const syncMetrics = async () => {
    setSyncing(true); setFlash(null)
    const { data, error } = await supabase.functions.invoke('unipile-monitor', { body: { team_id: activeTeamId } })
    if (error) {
      let body = null
      try { body = await error.context?.json?.() } catch { /* Body evtl. konsumiert */ }
      const status = error.context?.status
      if (status === 409) setFlash({ type:'error', text:'Kein aktiver LinkedIn-Account verbunden.', action:{ label:'LinkedIn verbinden', to:'/personal-brand' } })
      else if (status === 429 || body?.rate_limited) setFlash({ type:'error', text:'Rate-Limit erreicht — bitte später erneut.' })
      else setFlash({ type:'error', text: body?.error || ('Aktualisieren fehlgeschlagen: ' + error.message) })
      setSyncing(false); return
    }
    setFlash({ type:'success', text:`Aktualisiert: ${data?.metricsWritten ?? 0} Metriken, ${data?.engagersWritten ?? 0} Engager, ${data?.leadsCreated ?? 0} Leads.` })
    setSyncing(false)
    load()
  }

  // Einen Engager als Lead übernehmen (select-then-insert wg. Partial-Unique-Index),
  // danach converted_lead_id auf der Engager-Zeile setzen.
  const convertEngager = async (e) => {
    const url = e.actor_profile_url
    setConvertState(prev => ({ ...prev, [e.id]: { state:'busy' } }))
    // Dedupe-Guard.
    if (uid && url) {
      const { data: existing } = await supabase.from('leads')
        .select('id').eq('user_id', uid).eq('linkedin_url', url).maybeSingle()
      if (existing?.id) {
        await supabase.from('linkedin_post_engagers').update({ converted_lead_id: existing.id }).eq('id', e.id)
        setConvertState(prev => ({ ...prev, [e.id]: { state:'done', leadId: existing.id } }))
        return
      }
    }
    const { data: inserted, error } = await supabase.from('leads').insert({
      user_id: uid,
      team_id: activeTeamId,               // Multi-Tenant: team_id bei jedem Insert
      name: e.actor_name || 'Unbekannt',
      headline: e.actor_headline ?? null,
      linkedin_url: url ?? null,
      profile_url: url ?? null,
      status: 'Lead',                      // Fallstrick #2: gültiger Lead-Status (Einzel-Insert)
      source: 'post_engagement',
      lead_source: 'linkedin',
    }).select('id').maybeSingle()
    if (error) {   // Fallstrick #12
      console.warn('[linkedin-analytics] lead insert:', error.message)
      setConvertState(prev => ({ ...prev, [e.id]: { state:'idle' } }))
      setFlash({ type:'error', text:'Übernehmen fehlgeschlagen: ' + error.message })
      return
    }
    const leadId = inserted?.id ?? null
    if (leadId) await supabase.from('linkedin_post_engagers').update({ converted_lead_id: leadId }).eq('id', e.id)
    setConvertState(prev => ({ ...prev, [e.id]: { state:'done', leadId } }))
  }

  const selected = posts.find(p => p.id === selectedId) || null
  const selSeries = selectedId ? (metricsByPost[selectedId] || []) : []
  const selEngagers = selectedId ? (engagersByPost[selectedId] || []) : []
  const lastSync = posts.reduce((acc, p) => {
    const t = p.last_metrics_sync_at ? new Date(p.last_metrics_sync_at).getTime() : 0
    return t > acc ? t : acc
  }, 0)

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <PageHeader
          overline="Content · Analytics"
          title="Content-Analytics"
          subtitle={`Reichweite und Engagement deiner über Unipile veröffentlichten LinkedIn-Posts.${lastSync > 0 ? ` · Zuletzt aktualisiert: ${new Date(lastSync).toLocaleString('de-DE')}` : ''}`}
          action={(
            <button className="lk-btn lk-btn-navy" style={{ opacity: syncing ? 0.6 : 1 }} disabled={syncing} onClick={syncMetrics}>
              {syncing ? <Loader2 size={15} className="lk-spin" /> : <RefreshCw size={15} />} Metriken aktualisieren
            </button>
          )}
        />

        {isCompanyBrand && (
          (() => {
            const hist = cpStats?.history || []
            const firstF = hist.find(h => h.followers_count != null)?.followers_count ?? null
            const growth = (cpStats?.followers_count != null && firstF != null) ? (cpStats.followers_count - firstF) : null
            const Kpi = ({ label, value, sub }) => (
              <div style={{ flex:1, minWidth:150, padding:'14px 16px', background:'var(--surface,#fff)', border:'1px solid var(--border,#E5E7EB)', borderRadius:12 }}>
                <div style={{ fontSize:12, color:'var(--text-muted,#6B7280)', fontWeight:600 }}>{label}</div>
                <div style={{ fontSize:24, fontWeight:800, color:'var(--text-strong,#111827)', marginTop:2, lineHeight:1.1 }}>{value}</div>
                {sub && <div style={{ fontSize:11, color:'var(--text-muted,#6B7280)', marginTop:2 }}>{sub}</div>}
              </div>
            )
            return (
              <div className="lk-card" style={{ marginBottom:16, padding:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  {cpStats?.logo ? <img src={cpStats.logo} alt="" style={{ width:40, height:40, borderRadius:8, objectFit:'cover' }}/> : <Building2 size={26} style={{ color:'var(--primary)' }}/>}
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:'var(--text-strong,#111827)' }}>{cpStats?.name || activeBrandVoice?.linkedin_org_name || 'Company Page'}</div>
                    {cpStats?.profile_url && <a href={cpStats.profile_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--primary)', textDecoration:'none' }}>Zur LinkedIn-Seite ↗</a>}
                  </div>
                  {cpStatsLoading && <Loader2 size={15} className="lk-spin" style={{ marginLeft:'auto', color:'var(--text-muted)' }}/>}
                </div>
                {cpStats ? (
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                    <Kpi label="Follower" value={cpStats.followers_count != null ? cpStats.followers_count.toLocaleString('de-DE') : '—'} sub={growth != null ? (growth >= 0 ? '+' : '') + growth + ' seit Beginn der Messung' : 'Wachstum ab jetzt gemessen'} />
                    <Kpi label="Mitarbeitende" value={cpStats.employee_count != null ? cpStats.employee_count.toLocaleString('de-DE') : '—'} sub={cpStats?.insights?.employeesCount?.averageTenure ? 'Ø Zugehörigkeit ' + cpStats.insights.employeesCount.averageTenure : null} />
                    <Kpi label="Snapshots" value={hist.length} sub="Tägliche Follower-Messpunkte" />
                  </div>
                ) : !cpStatsLoading ? (
                  <div style={{ fontSize:13, color:'var(--text-muted,#6B7280)' }}>Noch keine Page-KPIs — verbinde die Company Page im Branding.</div>
                ) : null}
                <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', marginTop:10 }}>Hinweis: LinkedIn/Unipile liefert für Pages keine Impressions-Statistik — Follower & Mitarbeiter kommen live vom Page-Profil, das Follower-Wachstum bauen wir über tägliche Snapshots auf.</div>
              </div>
            )
          })()
        )}

        {flash && (
          <div style={{
            display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'10px 14px', borderRadius:10, fontSize:13, fontWeight:600,
            background: flash.type === 'error' ? '#FEF2F2' : '#EBFAF3',
            color:      flash.type === 'error' ? '#B91C1C' : '#039855',
            border: `1px solid ${flash.type === 'error' ? '#FECACA' : '#C7EFDC'}`,
          }}>
            {flash.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span style={{ flex:1 }}>{flash.text}</span>
            {flash.action && (
              <button onClick={() => navigate(flash.action.to)} className="lk-btn lk-btn-ghost" style={{ padding:'5px 10px' }}>
                {flash.action.label} <ExternalLink size={13} />
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)' }}>
            <Loader2 size={18} className="lk-spin" /> Lädt…
          </div>
        ) : posts.length === 0 ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13, padding:'40px 20px' }}>
            <BarChart3 size={32} color="#CBD5E1" style={{ marginBottom:10 }} />
            <div style={{ fontWeight:700, color:'var(--text-strong, #111827)', marginBottom:4 }}>Noch keine veröffentlichten Posts mit Monitoring</div>
            Veröffentliche einen Post über Unipile (Redaktionsplan → „Über Unipile posten") — danach erscheinen hier Reichweite und Kommentare.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {/* ── Portfolio-Überblick (alle Posts der Marke) ── */}
            {(() => {
              const withM = posts.map(p => ({ p, m: latestByPost[p.id] })).filter(x => x.m)
              const sum = (f) => withM.reduce((a, x) => a + (Number(x.m[f]) || 0), 0)
              const totalImpr = sum('impressions'), totalReact = sum('likes'), totalComm = sum('comments_count'), totalRe = sum('reshares')
              const rates = withM.map(x => x.m.engagement_rate).filter(v => v != null)
              const avgRate = rates.length ? (rates.reduce((a, b) => a + b, 0) / rates.length) : null

              // ── Abgeleitete Kennzahlen (rechnen wir selbst — LinkedIn liefert sie nicht) ──
              const avgImpr = withM.length ? totalImpr / withM.length : null
              const reachRate = (avgImpr != null && followers) ? avgImpr / followers : null      // Ø Impressions / Follower
              const viralRate = totalImpr > 0 ? totalRe / totalImpr : null                        // Reposts / Impressions
              const pubDates = posts.map(p => p.published_at).filter(Boolean).map(d => new Date(d))
              let perWeek = null
              if (pubDates.length >= 2) {
                const span = Math.max(1, (Math.max(...pubDates) - Math.min(...pubDates)) / (1000*60*60*24*7))
                perWeek = pubDates.length / span
              }
              const groupBy = (key) => {
                const g = {}
                for (const x of withM) {
                  const v = (x.p[key] || '').toString().trim(); if (!v) continue
                  ;(g[v] ||= { n:0, impr:0, eng:0 }).n++
                  g[v].impr += Number(x.m.impressions) || 0
                  g[v].eng  += x.m.engagement_rate != null ? x.m.engagement_rate : 0
                }
                return Object.entries(g).map(([k,v]) => ({ k, n:v.n, avgImpr:v.impr/v.n, avgEng:v.eng/v.n }))
                  .sort((a,b) => b.avgEng - a.avgEng)
              }
              const byType = groupBy('type'), byTopic = groupBy('topic'), byHook = groupBy('hook')
              const WD = ['So','Mo','Di','Mi','Do','Fr','Sa']
              const wdMap = {}
              for (const x of withM) {
                if (!x.p.published_at) continue
                const d = new Date(x.p.published_at).getDay()
                ;(wdMap[d] ||= { n:0, eng:0 }).n++
                wdMap[d].eng += x.m.engagement_rate != null ? x.m.engagement_rate : 0
              }
              const wdRanked = Object.entries(wdMap).map(([d,v]) => ({ d:Number(d), avgEng:v.eng/v.n, n:v.n })).sort((a,b)=>b.avgEng-a.avgEng)
              const bestWd = wdRanked[0] || null
              const bd = (title, rows) => rows.length < 2 ? null : (
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted,#6B7280)', marginBottom:6 }}>{title}</div>
                  {rows.slice(0,5).map(r => (
                    <div key={r.k} style={{ display:'flex', justifyContent:'space-between', gap:8, fontSize:12, padding:'4px 0', borderTop:'1px solid var(--border,#F1F5F9)' }}>
                      <span style={{ color:'var(--text-strong,#111827)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.k} <span style={{ color:'var(--text-muted,#9CA3AF)' }}>({r.n})</span></span>
                      <span style={{ fontWeight:700, color:'var(--primary)', flexShrink:0 }}>{(r.avgEng*100).toFixed(2)} %</span>
                    </div>
                  ))}
                </div>
              )
              const chartData = withM
                .filter(x => x.p.published_at)
                .sort((a, b) => new Date(a.p.published_at) - new Date(b.p.published_at))
                .map(x => ({
                  name: new Date(x.p.published_at).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }),
                  Impressions: Number(x.m.impressions) || 0,
                  'Engagement %': x.m.engagement_rate != null ? Number((x.m.engagement_rate * 100).toFixed(2)) : null,
                }))
              const Kpi = ({ icon, label, value }) => (
                <div style={{ flex:1, minWidth:130, ...cardStyle, padding:'12px 14px' }}>
                  <div style={{ fontSize:11, color:'var(--text-muted,#6B7280)', fontWeight:600, display:'inline-flex', alignItems:'center', gap:5 }}>{icon}{label}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'var(--text-strong,#111827)', marginTop:2, lineHeight:1.1 }}>{value}</div>
                </div>
              )
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <Kpi icon={<BarChart3 size={11}/>} label="Posts" value={fmt(withM.length)} />
                    <Kpi icon={<Eye size={11}/>} label="Impressions gesamt" value={fmt(totalImpr)} />
                    <Kpi icon={<Heart size={11}/>} label="Reaktionen" value={fmt(totalReact)} />
                    <Kpi icon={<MessageSquare size={11}/>} label="Kommentare" value={fmt(totalComm)} />
                    <Kpi icon={<Repeat2 size={11}/>} label="Reposts" value={fmt(totalRe)} />
                    <Kpi icon={<TrendingUp size={11}/>} label="Ø Engagement" value={avgRate != null ? (avgRate * 100).toFixed(2) + ' %' : '–'} />
                    {reachRate != null && <Kpi icon={<Eye size={11}/>} label="Reichweiten-Rate" value={(reachRate * 100).toFixed(1) + ' %'} />}
                    {viralRate != null && <Kpi icon={<Repeat2 size={11}/>} label="Viralitäts-Rate" value={(viralRate * 100).toFixed(2) + ' %'} />}
                    {perWeek != null && <Kpi icon={<BarChart3 size={11}/>} label="Posts / Woche" value={perWeek.toFixed(1)} />}
                  </div>
                  {chartData.length > 1 && (
                    <div style={cardStyle}>
                      <div className="lk-eyebrow">Reichweite & Engagement je Post</div>
                      <div style={{ width:'100%', height:280 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} margin={{ top:8, right:16, bottom:8, left:0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                            <XAxis dataKey="name" tick={{ fontSize:11 }} />
                            <YAxis yAxisId="left" tick={{ fontSize:11 }} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11 }} unit="%" />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize:12 }} />
                            <Bar yAxisId="left" dataKey="Impressions" fill={PRIMARY} radius={[4,4,0,0]} maxBarSize={38} />
                            <Line yAxisId="right" type="monotone" dataKey="Engagement %" stroke="#DD2A7B" strokeWidth={2} dot={{ r:2 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {(byType.length >= 2 || byTopic.length >= 2 || byHook.length >= 2 || bestWd) && (
                    <div style={cardStyle}>
                      <div className="lk-eyebrow">Content-Muster · was funktioniert</div>
                      {(byType.length >= 2 || byTopic.length >= 2 || byHook.length >= 2) && (
                        <div style={{ display:'flex', gap:20, flexWrap:'wrap', marginTop:6 }}>
                          {bd('Nach Format', byType)}
                          {bd('Nach Thema', byTopic)}
                          {bd('Nach Hook', byHook)}
                        </div>
                      )}
                      {bestWd && (
                        <div style={{ fontSize:12, color:'var(--text-soft,#4B5563)', marginTop:12 }}>
                          Bester Wochentag nach Ø Engagement: <strong>{WD[bestWd.d]}</strong> ({(bestWd.avgEng * 100).toFixed(2)} % über {bestWd.n} Post{bestWd.n === 1 ? '' : 's'})
                        </div>
                      )}
                      <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', marginTop:8 }}>
                        Nach Ø Engagement-Rate sortiert. Format/Thema/Hook stammen aus dem Redaktionsplan — je mehr Posts getaggt sind, desto aussagekräftiger.
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── Reifekurve (aggregiert) + wiederkehrende Engager ── */}
            {(() => {
              // Reifekurve: Ø Engagement-Rate je Tag-seit-Veröffentlichung über alle Posts
              const byDay = {}
              for (const arr of Object.values(metricsByPost)) {
                for (const m of (arr || [])) {
                  if (m.day == null || m.rate == null) continue
                  ;(byDay[m.day] ||= []).push(m.rate)
                }
              }
              const curve = Object.keys(byDay).map(Number).sort((a,b)=>a-b).slice(0,30)
                .map(d => ({ day: d, 'Ø Engagement %': Number((byDay[d].reduce((a,b)=>a+b,0)/byDay[d].length).toFixed(2)) }))
              // Wiederkehrende Engager: Personen, die auf mehreren Posts reagiert/kommentiert haben
              const byActor = {}
              for (const [pid, list] of Object.entries(engagersByPost)) {
                for (const e of (list || [])) {
                  const k = e.actor_profile_url || e.actor_name
                  if (!k) continue
                  const a = (byActor[k] ||= { name: e.actor_name, headline: e.actor_headline, url: e.actor_profile_url, posts: new Set(), converted: false })
                  a.posts.add(pid); if (e.converted_lead_id) a.converted = true
                }
              }
              const repeat = Object.values(byActor).map(a => ({ ...a, n: a.posts.size })).filter(a => a.n >= 2).sort((a,b)=>b.n-a.n).slice(0,10)
              if (curve.length < 2 && repeat.length === 0) return null
              return (
                <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                  {curve.length >= 2 && (
                    <div style={{ ...cardStyle, flex:1, minWidth:300 }}>
                      <div className="lk-eyebrow">Reifekurve · wann ein Post zündet</div>
                      <div style={{ width:'100%', height:200, marginTop:6 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={curve} margin={{ top:8, right:16, bottom:8, left:0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                            <XAxis dataKey="day" tick={{ fontSize:11 }} label={{ value:'Tage seit Veröffentlichung', position:'insideBottom', offset:-4, fontSize:10 }} />
                            <YAxis tick={{ fontSize:11 }} unit="%" /><Tooltip />
                            <Line type="monotone" dataKey="Ø Engagement %" stroke="#DD2A7B" strokeWidth={2} dot={{ r:2 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', marginTop:6 }}>Über alle Posts gemittelt — zeigt, an welchem Tag nach Veröffentlichung das Engagement im Schnitt am höchsten ist.</div>
                    </div>
                  )}
                  {repeat.length > 0 && (
                    <div style={{ ...cardStyle, flex:1, minWidth:300 }}>
                      <div className="lk-eyebrow">Wiederkehrende Engager · warme Leads</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:6 }}>
                        {repeat.map((a,i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderTop: i? '1px solid var(--border-soft,#F1F5F9)':'none' }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong,#111827)' }}>{a.name || 'Unbekannt'}</div>
                              {a.headline && <div style={{ fontSize:11, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.headline}</div>}
                            </div>
                            <span style={{ fontSize:11, fontWeight:700, color:'var(--primary)', background:'#EEF2FF', padding:'2px 8px', borderRadius:999, flexShrink:0 }}>{a.n} Posts</span>
                            {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="lk-btn lk-btn-ghost" style={{ textDecoration:'none', padding:'4px 8px' }}>Profil <ExternalLink size={12} /></a>}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)', marginTop:8 }}>Personen, die auf mehreren deiner Posts reagiert haben — starke Signale für die Ansprache.</div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Post-Auswahl */}
            <div>
              <div className="lk-eyebrow">Top-Posts</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {posts.map(p => {
                  const m = latestByPost[p.id]
                  const active = p.id === selectedId
                  return (
                    <div key={p.id} onClick={() => setSelectedId(p.id)}
                      style={{ ...cardStyle, cursor:'pointer', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap',
                        borderColor: active ? 'var(--primary)' : 'var(--border, #E4E7EC)', boxShadow: active ? `0 0 0 1px ${PRIMARY_VAR}` : 'none' }}>
                      <div style={{ flex:1, minWidth:200 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--text-strong, #111827)' }}>{postTitle(p)}</div>
                        <div style={{ fontSize:12, color:'var(--text-muted, #6B7280)', marginTop:2 }}>
                          {p.published_at ? new Date(p.published_at).toLocaleDateString('de-DE') : 'unveröffentlicht'}
                          {(engagersByPost[p.id]?.length) ? ` · ${engagersByPost[p.id].length} Kommentierende` : ''}
                        </div>
                      </div>
                      {m ? (
                        <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--text-muted, #6B7280)' }}>
                          <span title="Impressions"><Eye size={12} /> {fmt(m.impressions)}</span>
                          <span title="Reaktionen"><Heart size={12} /> {fmt(m.likes)}</span>
                          <span title="Kommentare"><MessageSquare size={12} /> {fmt(m.comments_count)}</span>
                          <span title="Reposts"><Repeat2 size={12} /> {fmt(m.reshares)}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize:12, color:'var(--text-muted, #9CA3AF)' }}>noch keine Metriken</span>
                      )}
                      {p.linkedin_post_url && (
                        <a href={p.linkedin_post_url} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}
                          className="lk-btn lk-btn-ghost" style={{ textDecoration:'none' }}>
                          Post öffnen <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Detail des gewählten Posts */}
            {selected && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {/* KPI-Kacheln (aktuellster Messwert) */}
                {(() => {
                  const m = latestByPost[selected.id]
                  return (
                    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                      <div style={kpiTile}><div style={kpiLabel}><Eye size={11} /> Impressions</div><div style={kpiValue}>{fmt(m?.impressions)}</div></div>
                      <div style={kpiTile}><div style={kpiLabel}><Heart size={11} /> Reaktionen</div><div style={kpiValue}>{fmt(m?.likes)}</div></div>
                      <div style={kpiTile}><div style={kpiLabel}><MessageSquare size={11} /> Kommentare</div><div style={kpiValue}>{fmt(m?.comments_count)}</div></div>
                      <div style={kpiTile}><div style={kpiLabel}><Repeat2 size={11} /> Reposts</div><div style={kpiValue}>{fmt(m?.reshares)}</div></div>
                      <div style={kpiTile}><div style={kpiLabel}><TrendingUp size={11} /> Engagement</div><div style={kpiValue}>{m?.engagement_rate != null ? (m.engagement_rate * 100).toFixed(2) + ' %' : '–'}</div></div>
                    </div>
                  )
                })()}

                {/* Metrik-Verlauf über days_since_publish */}
                <div style={cardStyle}>
                  <div className="lk-eyebrow">Verlauf nach Veröffentlichung</div>
                  {selSeries.length === 0 ? (
                    <div style={{ fontSize:13, color:'var(--text-muted, #6B7280)', padding:'20px 0', textAlign:'center' }}>
                      Noch kein Metrik-Verlauf — klicke „Metriken aktualisieren".
                    </div>
                  ) : (
                    <div style={{ width:'100%', height:280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={selSeries} margin={{ top:8, right:16, bottom:8, left:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                          <XAxis dataKey="day" tick={{ fontSize:11 }} label={{ value:'Tage seit Veröffentlichung', position:'insideBottom', offset:-4, fontSize:11 }} />
                          <YAxis yAxisId="left" tick={{ fontSize:11 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11 }} unit="%" />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize:12 }} />
                          <Line yAxisId="left" type="monotone" dataKey="impressions" name="Impressions" stroke={PRIMARY} strokeWidth={2} dot={false} />
                          <Line yAxisId="left" type="monotone" dataKey="likes" name="Reaktionen" stroke="#039855" strokeWidth={2} dot={false} />
                          <Line yAxisId="left" type="monotone" dataKey="comments" name="Kommentare" stroke="#D97706" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" dataKey="rate" name="Engagement %" stroke="#DD2A7B" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Engager-Liste */}
                <div>
                  <div className="lk-eyebrow">Kommentierende{selEngagers.length ? ` (${selEngagers.length})` : ''}</div>
                  {selEngagers.length === 0 ? (
                    <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13 }}>
                      Noch keine erfassten Kommentierenden für diesen Post.
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {selEngagers.map(e => {
                        const cs = convertState[e.id]?.state
                        const converted = !!e.converted_lead_id || cs === 'done'
                        const leadId = e.converted_lead_id || convertState[e.id]?.leadId
                        return (
                          <div key={e.id} style={{ ...cardStyle, padding:'12px 16px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                            <div style={{ flex:1, minWidth:200 }}>
                              <div style={{ fontSize:14, fontWeight:700, color:'var(--text-strong, #111827)' }}>{e.actor_name || 'Unbekannt'}</div>
                              {e.actor_headline && <div style={{ fontSize:12, color:'var(--text-muted, #6B7280)', marginTop:2 }}>{e.actor_headline}</div>}
                              {e.comment_text && <div style={{ fontSize:12, color:'var(--text-soft, #4B5563)', marginTop:4, fontStyle:'italic' }}>„{e.comment_text}"</div>}
                            </div>
                            {e.actor_profile_url && (
                              <a href={e.actor_profile_url} target="_blank" rel="noopener noreferrer" className="lk-btn lk-btn-ghost" style={{ textDecoration:'none' }}>
                                Profil <ExternalLink size={13} />
                              </a>
                            )}
                            {converted ? (
                              leadId
                                ? <button className="lk-btn lk-btn-ghost" style={{ color:'#039855', borderColor:'#C7EFDC' }} onClick={() => navigate(`/leads/${leadId}`)}>im CRM öffnen <ExternalLink size={13} /></button>
                                : <span className="lk-btn lk-btn-ghost" style={{ color:'#039855', borderColor:'#C7EFDC', cursor:'default' }}><Check size={14} /> im CRM</span>
                            ) : (
                              <button className="lk-btn lk-btn-navy" style={{ opacity: cs === 'busy' ? 0.6 : 1 }} disabled={cs === 'busy'} onClick={() => convertEngager(e)}>
                                {cs === 'busy' ? <Loader2 size={15} className="lk-spin" /> : <UserPlus size={15} />} Als Lead übernehmen
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
