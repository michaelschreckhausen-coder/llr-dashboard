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
  Repeat2, TrendingUp, AlertCircle, CheckCircle2, Loader2, UserPlus, Check,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const PRIMARY = 'rgb(49,90,231)'
const PRIMARY_VAR = `var(--wl-primary, ${PRIMARY})`

const pageOuterStyle  = { background:'var(--surface-canvas, #F8FAFC)', minHeight:'100vh', padding:'24px 24px 60px' }
const pageStyle       = { width:'100%', maxWidth:1100, margin:'0 auto', display:'flex', flexDirection:'column' }
const headerRowStyle  = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, gap:12, flexWrap:'wrap' }
const titleStyle      = { fontSize:22, fontWeight:800, margin:0, color:'var(--text-strong, #111827)', display:'flex', alignItems:'center', gap:10 }
const subtitleStyle   = { fontSize:13, color:'var(--text-muted, #6B7280)', marginTop:4 }
const cardStyle       = { background:'var(--surface)', borderRadius:12, border:'1px solid var(--border, #E4E7EC)', padding:'16px 18px' }
const primaryBtnStyle = { padding:'9px 18px', background:'var(--primary)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
const ghostBtnStyle   = { padding:'7px 12px', background:'var(--surface)', color:'#374151', border:'1.5px solid #E4E7EC', borderRadius:10, fontSize:12, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
const sectionTitle    = { fontSize:12, fontWeight:700, color:'var(--text-strong, #111827)', marginBottom:10, display:'flex', alignItems:'center', gap:6 }
const kpiTile         = { flex:1, minWidth:90, background:'var(--surface)', border:'1px solid var(--border, #E4E7EC)', borderRadius:10, padding:'10px 12px' }
const kpiLabel        = { fontSize:10, fontWeight:700, color:'var(--text-muted, #6B7280)', textTransform:'uppercase', letterSpacing:'0.06em', display:'flex', alignItems:'center', gap:4 }
const kpiValue        = { fontSize:20, fontWeight:800, color:'var(--text-strong, #111827)', marginTop:2, fontVariantNumeric:'tabular-nums' }

const fmt = n => (n == null ? '–' : Number(n).toLocaleString('de-DE'))
const postTitle = p => (p.title?.trim() || (p.content ? p.content.slice(0, 60) + (p.content.length > 60 ? '…' : '') : 'Beitrag'))

export default function LinkedInAnalytics() {
  const { activeTeamId } = useTeam()
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

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  const load = useCallback(async () => {
    if (!activeTeamId) { setPosts([]); setLoading(false); return }
    setLoading(true)
    // 1) Veröffentlichte Posts mit social_id (team-scoped, Fallstrick #14 expliziter Filter).
    const { data: postRows, error: pErr } = await supabase
      .from('content_posts')
      .select('id, title, content, linkedin_post_url, linkedin_social_id, published_at, last_metrics_sync_at')
      .eq('team_id', activeTeamId)
      .not('linkedin_social_id', 'is', null)
      .order('published_at', { ascending: false })
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
  }, [activeTeamId])

  useEffect(() => { load() }, [load])

  const syncMetrics = async () => {
    setSyncing(true); setFlash(null)
    const { data, error } = await supabase.functions.invoke('unipile-monitor', { body: { team_id: activeTeamId } })
    if (error) {
      let body = null
      try { body = await error.context?.json?.() } catch { /* Body evtl. konsumiert */ }
      const status = error.context?.status
      if (status === 409) setFlash({ type:'error', text:'Kein aktiver LinkedIn-Account verbunden.', action:{ label:'LinkedIn verbinden', to:'/settings/linkedin' } })
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
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}><BarChart3 size={22} color={PRIMARY_VAR} /> Post-Analytics</h1>
            <div style={subtitleStyle}>
              Reichweite und Engagement deiner über Unipile veröffentlichten LinkedIn-Posts.
              {lastSync > 0 && ` · Zuletzt aktualisiert: ${new Date(lastSync).toLocaleString('de-DE')}`}
            </div>
          </div>
          <button style={{ ...primaryBtnStyle, opacity: syncing ? 0.6 : 1 }} disabled={syncing} onClick={syncMetrics}>
            {syncing ? <Loader2 size={15} className="lk-spin" /> : <RefreshCw size={15} />} Metriken aktualisieren
          </button>
        </div>

        {flash && (
          <div style={{
            display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'10px 14px', borderRadius:10, fontSize:13, fontWeight:600,
            background: flash.type === 'error' ? '#FEF2F2' : '#F0FDF4',
            color:      flash.type === 'error' ? '#B91C1C' : '#15803D',
            border: `1px solid ${flash.type === 'error' ? '#FECACA' : '#BBF7D0'}`,
          }}>
            {flash.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span style={{ flex:1 }}>{flash.text}</span>
            {flash.action && (
              <button onClick={() => navigate(flash.action.to)} style={{ ...ghostBtnStyle, padding:'5px 10px' }}>
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
            {/* Post-Auswahl */}
            <div>
              <div style={sectionTitle}><TrendingUp size={14} /> Top-Posts</div>
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
                          style={{ ...ghostBtnStyle, textDecoration:'none' }}>
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
                  <div style={sectionTitle}><TrendingUp size={14} /> Verlauf nach Veröffentlichung</div>
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
                          <Line yAxisId="left" type="monotone" dataKey="likes" name="Reaktionen" stroke="#10B981" strokeWidth={2} dot={false} />
                          <Line yAxisId="left" type="monotone" dataKey="comments" name="Kommentare" stroke="#F59E0B" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" dataKey="rate" name="Engagement %" stroke="#EC4899" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Engager-Liste */}
                <div>
                  <div style={sectionTitle}><Users size={14} /> Kommentierende{selEngagers.length ? ` (${selEngagers.length})` : ''}</div>
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
                              <a href={e.actor_profile_url} target="_blank" rel="noopener noreferrer" style={{ ...ghostBtnStyle, textDecoration:'none' }}>
                                Profil <ExternalLink size={13} />
                              </a>
                            )}
                            {converted ? (
                              leadId
                                ? <button style={{ ...ghostBtnStyle, color:'#15803D', borderColor:'#BBF7D0' }} onClick={() => navigate(`/leads/${leadId}`)}>im CRM öffnen <ExternalLink size={13} /></button>
                                : <span style={{ ...ghostBtnStyle, color:'#15803D', borderColor:'#BBF7D0', cursor:'default' }}><Check size={14} /> im CRM</span>
                            ) : (
                              <button style={{ ...primaryBtnStyle, opacity: cs === 'busy' ? 0.6 : 1 }} disabled={cs === 'busy'} onClick={() => convertEngager(e)}>
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
