// src/pages/ProfilAnalyse.jsx
//
// Analyse — „Profil" (brand-scoped). Zusammenlegung von SSI + Wachstum + Profil-Checker
// + NEU Profilbesucher (WVMP über Unipile). Beantwortet: „Wie stark ist mein Auftritt
// und wächst meine Reichweite — und wer schaut sich mein Profil an?"
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Target, TrendingUp, Users, UserPlus, Eye, RefreshCw, CheckCircle2, ExternalLink, Award, Building2, Check,
} from 'lucide-react'
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import PageHeader from '../components/PageHeader'

const PRIMARY = '#315AE7'
const pageOuter = { background:'transparent', minHeight:'100vh', padding:'24px 16px 60px' }
const pageStyle = { width:'100%', maxWidth:1068, margin:'0 auto', display:'flex', flexDirection:'column' }
const card = { background:'var(--surface)', borderRadius:16, border:'1px solid var(--border, #E4E7EC)', boxShadow:'var(--shadow-card)', padding:'18px 20px' }
const kpiTile = { flex:1, minWidth:140, background:'var(--surface)', border:'1px solid var(--border,#E4E7EC)', borderRadius:16, boxShadow:'var(--shadow-card)', padding:'14px 16px' }
const kpiLabel = { fontSize:10, fontWeight:700, color:'var(--text-muted,#6B7280)', textTransform:'uppercase', letterSpacing:'0.06em', display:'flex', alignItems:'center', gap:5 }
const kpiValue = { fontSize:24, fontWeight:800, color:'var(--text-strong,#111827)', marginTop:2, fontVariantNumeric:'tabular-nums', lineHeight:1.1 }
const kpiSub = { fontSize:11, color:'var(--text-muted,#6B7280)', marginTop:3 }
const fmt = n => (n == null ? '–' : Number(n).toLocaleString('de-DE'))
const dDE = s => { try { return new Date(s).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) } catch { return s } }
const SUBSCORES = [
  { key:'build_brand', label:'Marke aufbauen' }, { key:'find_people', label:'Personen finden' },
  { key:'engage_insights', label:'Mit Insights' }, { key:'build_relationships', label:'Beziehungen' },
]

export default function ProfilAnalyse({ session }) {
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const nav = useNavigate()
  const isCompany = activeBrandVoice?.account_type === 'company_page'
  const [uid, setUid] = useState(null)
  const [ssi, setSsi] = useState([])
  const [growth, setGrowth] = useState([])
  const [checks, setChecks] = useState([])
  const [viewers, setViewers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [flash, setFlash] = useState(null)
  const [convert, setConvert] = useState({})

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  const load = useCallback(async () => {
    const bvId = activeBrandVoice?.id || null
    if (!activeTeamId || !bvId) { setLoading(false); return }
    setLoading(true)
    const growthTable = isCompany ? 'linkedin_page_metrics' : 'linkedin_profile_metrics'
    const growthSel = isCompany ? 'followers_count, employee_count, captured_on' : 'follower_count, connections_count, captured_on'
    const [s, g, c, v] = await Promise.all([
      supabase.from('ssi_scores').select('*').eq('brand_voice_id', bvId).order('recorded_at', { ascending: false }).limit(90),
      supabase.from(growthTable).select(growthSel).eq('brand_voice_id', bvId).order('captured_on', { ascending: true }),
      supabase.from('profile_checks').select('score, passed, total, created_at').eq('brand_voice_id', bvId).order('created_at', { ascending: false }).limit(60),
      supabase.from('linkedin_profile_viewers').select('*').eq('brand_voice_id', bvId).order('last_seen_at', { ascending: false }).limit(60),
    ])
    setSsi(s.data || []); setGrowth(g.data || []); setChecks(c.data || []); setViewers(v.data || [])
    setLoading(false)
  }, [activeTeamId, activeBrandVoice?.id, isCompany])
  useEffect(() => { load() }, [load])

  const showFlash = (msg, type='success') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 5000) }

  const refreshAll = async () => {
    if (!activeBrandVoice?.id) return
    setRefreshing(true)
    try {
      await Promise.all([
        supabase.functions.invoke('ssi-refresh', { body: { brand_voice_id: activeBrandVoice.id } }),
        supabase.functions.invoke('profile-viewers-refresh', { body: { brand_voice_id: activeBrandVoice.id } }),
      ])
      await load(); showFlash('Profil-Daten aktualisiert.')
    } catch (e) { showFlash('Aktualisieren fehlgeschlagen: ' + String(e), 'error') }
    finally { setRefreshing(false) }
  }

  const convertViewer = async (v) => {
    setConvert(p => ({ ...p, [v.id]: 'busy' }))
    const url = v.viewer_profile_url
    if (uid && url) {
      const { data: ex } = await supabase.from('leads').select('id').eq('user_id', uid).eq('linkedin_url', url).maybeSingle()
      if (ex?.id) { await supabase.from('linkedin_profile_viewers').update({ converted_lead_id: ex.id }).eq('id', v.id); setConvert(p => ({ ...p, [v.id]: ex.id })); return }
    }
    const { data: ins, error } = await supabase.from('leads').insert({
      user_id: uid, team_id: activeTeamId, name: v.viewer_name || 'Profilbesucher',
      headline: v.viewer_headline ?? null, linkedin_url: url ?? null, profile_url: url ?? null,
      status: 'Lead', source: 'linkedin', lead_source: 'linkedin',
    }).select('id').maybeSingle()
    if (error) { setConvert(p => ({ ...p, [v.id]: undefined })); showFlash('Übernehmen fehlgeschlagen: ' + error.message, 'error'); return }
    if (ins?.id) await supabase.from('linkedin_profile_viewers').update({ converted_lead_id: ins.id }).eq('id', v.id)
    setConvert(p => ({ ...p, [v.id]: ins?.id || 'done' }))
  }

  const latestSsi = ssi[0]
  const gLast = growth[growth.length - 1], gFirst = growth[0]
  const gField = isCompany ? 'followers_count' : 'follower_count'
  const growthDelta = (gLast && gFirst && gLast[gField] != null && gFirst[gField] != null) ? gLast[gField] - gFirst[gField] : null
  const growthSeries = growth.map(r => ({ name: dDE(r.captured_on), Follower: isCompany ? r.followers_count : r.follower_count, ...(isCompany ? {} : { Verbindungen: r.connections_count }) }))
  const latestCheck = checks[0]
  const namedViewers = viewers.filter(v => v.viewer_name)

  return (
    <div style={pageOuter}><div style={pageStyle}>
      <PageHeader overline="LinkedIn · Analyse" title="Profil"
        subtitle="Stärke und Wachstum deines LinkedIn-Auftritts der aktiven Marke — SSI, Reichweite, Profil-Check und wer dein Profil ansieht."
        action={(
          <button className="lk-btn lk-btn-navy" style={{ opacity: refreshing ? 0.6 : 1 }} disabled={refreshing} onClick={refreshAll}>
            {refreshing ? <Loader2 size={15} className="lk-spin" /> : <RefreshCw size={15} />} Aktualisieren
          </button>
        )} />

      {flash && (
        <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:10, fontSize:13, fontWeight:600,
          background: flash.type==='error'?'#FEF2F2':'#EBFAF3', color: flash.type==='error'?'#B91C1C':'#039855',
          border:`1px solid ${flash.type==='error'?'#FECACA':'#C7EFDC'}` }}>{flash.msg}</div>
      )}

      {loading ? (
        <div style={{ ...card, textAlign:'center', color:'var(--text-muted)' }}><Loader2 size={18} className="lk-spin" /> Lädt…</div>
      ) : !activeBrandVoice?.id ? (
        <div style={{ ...card, textAlign:'center', color:'var(--text-muted)', padding:'40px' }}>Wähle oben eine Marke, um ihr Profil zu analysieren.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

          {/* ── SSI ── */}
          <div style={card}>
            <div className="lk-eyebrow"><Target size={12} style={{ verticalAlign:'-2px' }} /> Social Selling Index</div>
            {!latestSsi ? (
              <div style={{ fontSize:13, color:'var(--text-muted)', padding:'16px 0' }}>Noch kein SSI erfasst — klick „Aktualisieren", um ihn live über LinkedIn auszulesen.</div>
            ) : (
              <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'center', marginTop:6 }}>
                <div style={{ textAlign:'center', minWidth:120 }}>
                  <div style={{ fontSize:44, fontWeight:800, color:PRIMARY, lineHeight:1 }}>{Math.round(latestSsi.total_score)}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>/ 100 Gesamt-SSI</div>
                  <div style={{ display:'flex', gap:14, marginTop:12, justifyContent:'center' }}>
                    {latestSsi.industry_rank != null && <div><div style={{ fontSize:15, fontWeight:800 }}>Top {latestSsi.industry_rank}%</div><div style={{ fontSize:10, color:'var(--text-muted)' }}>Branche</div></div>}
                    {latestSsi.network_rank != null && <div><div style={{ fontSize:15, fontWeight:800 }}>Top {latestSsi.network_rank}%</div><div style={{ fontSize:10, color:'var(--text-muted)' }}>Netzwerk</div></div>}
                  </div>
                </div>
                <div style={{ flex:1, minWidth:240, height:200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={SUBSCORES.map(s => ({ pillar: s.label, value: Number(latestSsi[s.key] || 0) }))} outerRadius="70%">
                      <PolarGrid stroke="#E5E7EB" /><PolarAngleAxis dataKey="pillar" tick={{ fontSize:10, fill:'#6B7280' }} />
                      <PolarRadiusAxis domain={[0,25]} tick={{ fontSize:8, fill:'#9CA3AF' }} angle={90} />
                      <Radar dataKey="value" stroke={PRIMARY} fill={PRIMARY} fillOpacity={0.30} />
                      <Tooltip formatter={v => [Number(v).toFixed(1)+' / 25','Score']} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {ssi.length >= 2 && (
              <div style={{ width:'100%', height:150, marginTop:8 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ssi.slice(0,24).reverse().map(e => ({ name: dDE(e.recorded_at), SSI: Math.round(e.total_score) }))} margin={{ top:4, right:12, bottom:4, left:-10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" /><XAxis dataKey="name" tick={{ fontSize:10 }} /><YAxis tick={{ fontSize:10 }} domain={[0,100]} /><Tooltip />
                    <Line type="monotone" dataKey="SSI" stroke={PRIMARY} strokeWidth={2} dot={{ r:2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── Profilbesucher ── */}
          <div style={card}>
            <div className="lk-eyebrow"><Eye size={12} style={{ verticalAlign:'-2px' }} /> Wer hat dein Profil angesehen</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', margin:'6px 0 10px' }}>
              <div style={kpiTile}><div style={kpiLabel}>Erfasste Besucher</div><div style={kpiValue}>{fmt(namedViewers.length)}</div><div style={kpiSub}>mit Namen (letzte)</div></div>
              <div style={kpiTile}><div style={kpiLabel}>Als Lead übernommen</div><div style={kpiValue}>{fmt(namedViewers.filter(v => v.converted_lead_id).length)}</div></div>
            </div>
            {namedViewers.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--text-muted)', padding:'6px 0' }}>Noch keine benannten Profilbesucher. Bei kostenlosem LinkedIn zeigt die API nur bis zu 3 — mit Sales Navigator die volle Liste.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {namedViewers.slice(0,15).map(v => {
                  const cs = convert[v.id]; const done = !!v.converted_lead_id || (cs && cs !== 'busy')
                  const leadId = v.converted_lead_id || (cs && cs !== 'busy' && cs !== 'done' ? cs : null)
                  return (
                    <div key={v.id} style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', padding:'8px 4px', borderTop:'1px solid var(--border-soft,#F1F5F9)' }}>
                      <div style={{ flex:1, minWidth:200 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--text-strong,#111827)' }}>{v.viewer_name}</div>
                        {v.viewer_headline && <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:520 }}>{v.viewer_headline}</div>}
                      </div>
                      <span style={{ fontSize:11, color:'var(--text-muted,#9CA3AF)' }}>{(v.caption || '').replace('Viewed','Gesehen').replace(' ago',' her')}</span>
                      {v.viewer_profile_url && <a href={v.viewer_profile_url} target="_blank" rel="noreferrer" className="lk-btn lk-btn-ghost" style={{ textDecoration:'none' }}>Profil <ExternalLink size={13} /></a>}
                      {done ? (
                        leadId ? <button className="lk-btn lk-btn-ghost" style={{ color:'#039855', borderColor:'#C7EFDC' }} onClick={() => nav(`/leads/${leadId}`)}>im CRM <ExternalLink size={13} /></button>
                          : <span className="lk-btn lk-btn-ghost" style={{ color:'#039855', borderColor:'#C7EFDC', cursor:'default' }}><Check size={14} /> im CRM</span>
                      ) : (
                        <button className="lk-btn lk-btn-navy" style={{ opacity: cs==='busy'?0.6:1 }} disabled={cs==='busy'} onClick={() => convertViewer(v)}>
                          {cs==='busy' ? <Loader2 size={15} className="lk-spin" /> : <UserPlus size={15} />} Als Lead
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Wachstum ── */}
          <div style={card}>
            <div className="lk-eyebrow"><TrendingUp size={12} style={{ verticalAlign:'-2px' }} /> {isCompany ? 'Page-Wachstum' : 'Reichweiten-Wachstum'}</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', margin:'6px 0 8px' }}>
              <div style={kpiTile}><div style={kpiLabel}><Users size={11} /> Follower</div><div style={kpiValue}>{fmt(isCompany ? gLast?.followers_count : gLast?.follower_count)}</div><div style={kpiSub}>{growthDelta != null ? (growthDelta>=0?'+':'')+fmt(growthDelta)+' seit Messbeginn' : 'Wachstum ab jetzt'}</div></div>
              {!isCompany && <div style={kpiTile}><div style={kpiLabel}><UserPlus size={11} /> Verbindungen</div><div style={kpiValue}>{fmt(gLast?.connections_count)}</div></div>}
              {isCompany && <div style={kpiTile}><div style={kpiLabel}><Building2 size={11} /> Mitarbeitende</div><div style={kpiValue}>{fmt(gLast?.employee_count)}</div></div>}
            </div>
            {growthSeries.length >= 2 ? (
              <div style={{ width:'100%', height:220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growthSeries} margin={{ top:8, right:16, bottom:8, left:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" /><XAxis dataKey="name" tick={{ fontSize:11 }} /><YAxis tick={{ fontSize:11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize:12 }} />
                    <Line type="monotone" dataKey="Follower" stroke={PRIMARY} strokeWidth={2} dot={{ r:2 }} />
                    {!isCompany && <Line type="monotone" dataKey="Verbindungen" stroke="#039855" strokeWidth={2} dot={{ r:2 }} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <div style={{ fontSize:12, color:'var(--text-muted)', padding:'16px 0', textAlign:'center' }}>Der Verlauf entsteht aus täglichen Snapshots — ab morgen erste Kurvenpunkte.</div>}
          </div>

          {/* ── Profil-Checker ── */}
          <div style={card}>
            <div className="lk-eyebrow"><CheckCircle2 size={12} style={{ verticalAlign:'-2px' }} /> Profil-Check</div>
            {!latestCheck ? (
              <div style={{ fontSize:13, color:'var(--text-muted)', padding:'8px 0' }}>Noch kein Profil-Check. <a onClick={() => nav('/profil-checker')} style={{ color:PRIMARY, cursor:'pointer' }}>Jetzt prüfen →</a></div>
            ) : (
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:6, alignItems:'center' }}>
                <div style={kpiTile}><div style={kpiLabel}><Award size={11} /> Profil-Score</div><div style={kpiValue}>{latestCheck.score}<span style={{ fontSize:14, color:'var(--text-muted)' }}> / 100</span></div><div style={kpiSub}>{latestCheck.passed}/{latestCheck.total} Kriterien erfüllt</div></div>
                {checks.length >= 2 && (
                  <div style={{ flex:1, minWidth:220, height:120 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={checks.slice(0,20).reverse().map(c => ({ name: dDE(c.created_at), Score: c.score }))} margin={{ top:6, right:12, bottom:4, left:-10 }}>
                        <defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PRIMARY} stopOpacity={0.25} /><stop offset="100%" stopColor={PRIMARY} stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" /><XAxis dataKey="name" tick={{ fontSize:10 }} /><YAxis tick={{ fontSize:10 }} domain={[0,100]} /><Tooltip />
                        <Area type="monotone" dataKey="Score" stroke={PRIMARY} strokeWidth={2} fill="url(#pc)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <button className="lk-btn lk-btn-ghost" onClick={() => nav('/profil-checker')}>Zum Profil-Checker</button>
              </div>
            )}
          </div>

        </div>
      )}
    </div></div>
  )
}
