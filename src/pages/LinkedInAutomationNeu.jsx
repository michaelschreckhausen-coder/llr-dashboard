// LinkedInAutomationNeu — Greenfield la_*-Automation UI (Builder + Funnel-Monitor). Hinter Feature-Flag.
// Berührt NICHT das Altsystem (/automatisierung, automation_*). Liest RLS-scoped (Team-Policies P1) +
// funnel-RPC (la_campaign_funnel) + health-View (la_runner_health). 0 reale Sends aus dem UI (Runner sendet
// nur bei aktiver Kampagne + fälligem Job; die "ehrliche UI" zeigt genau das an).
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { Plus, Zap, Play, Pause, Square, RefreshCw, Users, AlertTriangle, Activity } from 'lucide-react'

const PRIMARY = 'rgb(49,90,231)'
const PRIMARY_VAR = `var(--wl-primary, ${PRIMARY})`
const pageOuterStyle = { background: 'var(--surface-canvas, #F8FAFC)', minHeight: '100vh', padding: '24px 24px 60px' }
const pageStyle = { width: '100%', maxWidth: 1180, margin: '0 auto' }
const headerRowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }
const titleStyle = { fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text-strong, #111827)' }
const subtitleStyle = { fontSize: 13, color: 'var(--text-muted, #6B7280)', marginTop: 4 }
const cardStyle = { background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border, #E4E7EC)', padding: '16px 18px' }
const primaryBtn = { padding: '9px 18px', background: PRIMARY_VAR, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }
const ghostBtn = { padding: '7px 12px', background: 'var(--surface)', color: '#374151', border: '1.5px solid #E4E7EC', borderRadius: 10, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }
const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E4E7EC', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--surface)' }
const labelStyle = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }
const statusColor = { draft: '#94A3B8', active: '#22c55e', paused: '#f59e0b', completed: '#2563eb' }
const statusLabel = { draft: 'Entwurf', active: 'Laufend', paused: 'Pausiert', completed: 'Gestoppt' }

const ACTIONS = ['visit', 'invite', 'message', 'follow_up', 'withdraw', 'follow', 'react', 'comment', 'inmail']
const CONDITIONS = [['always', 'immer'], ['if_accepted', 'wenn akzeptiert'], ['if_no_reply', 'wenn keine Antwort']]
const KINDS = [['search_classic', 'Suche (Classic)'], ['search_salesnav', 'Sales Navigator'], ['search_recruiter', 'Recruiter'], ['relations', 'Eigene Verbindungen'], ['list', 'Liste']]

function Pill({ status }) {
  const c = statusColor[status] || '#94A3B8'
  return <span style={{ padding: '3px 9px', borderRadius: 6, background: c + '22', color: c, fontSize: 11, fontWeight: 700 }}>{statusLabel[status] || status}</span>
}

export default function LinkedInAutomationNeu({ session }) {
  const { activeTeamId } = useTeam() || {}
  const uid = session?.user?.id
  const [campaigns, setCampaigns] = useState([])
  const [accounts, setAccounts] = useState([])
  const [audiences, setAudiences] = useState([])
  const [health, setHealth] = useState(null)
  const [sel, setSel] = useState(null)          // ausgewählte Kampagne
  const [steps, setSteps] = useState([])
  const [funnel, setFunnel] = useState(null)
  const [flash, setFlash] = useState(null)
  const [creating, setCreating] = useState(false)

  const show = (msg, err) => { setFlash({ msg, err }); setTimeout(() => setFlash(null), 3500) }

  const load = useCallback(async () => {
    if (!activeTeamId) return
    const [c, a, au, h] = await Promise.all([
      supabase.from('la_campaigns').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      supabase.from('la_accounts').select('*').eq('team_id', activeTeamId),
      supabase.from('la_audiences').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      supabase.from('la_runner_health').select('*').maybeSingle(),
    ])
    setCampaigns(c.data || []); setAccounts(a.data || []); setAudiences(au.data || []); setHealth(h.data || null)
  }, [activeTeamId])
  useEffect(() => { load() }, [load])

  // Detail (Steps + Funnel) für die ausgewählte Kampagne, mit Polling.
  const loadDetail = useCallback(async (campId) => {
    if (!campId) { setSteps([]); setFunnel(null); return }
    const [s, f] = await Promise.all([
      supabase.from('la_steps').select('*').eq('campaign_id', campId).order('position', { ascending: true }),
      supabase.rpc('la_campaign_funnel', { p_campaign_id: campId }),
    ])
    setSteps(s.data || []); setFunnel(f.data && !f.data.error ? f.data : null)
  }, [])
  useEffect(() => { loadDetail(sel?.id) }, [sel?.id, loadDetail])
  useEffect(() => {
    if (!sel?.id) return
    const t = setInterval(() => { loadDetail(sel.id); load() }, 8000)
    return () => clearInterval(t)
  }, [sel?.id, loadDetail, load])

  async function createCampaign() {
    if (accounts.length === 0) { show('Kein verbundener Unipile-Account — bitte zuerst verbinden', true); return }
    setCreating(true)
    const { data, error } = await supabase.from('la_campaigns').insert({
      team_id: activeTeamId, account_id: accounts[0].id, name: 'Neue Kampagne', status: 'draft',
      caps: { invite: { per_day: 20 }, message: { per_day: 30 } }, schedule: {},
    }).select().single()
    setCreating(false)
    if (error) { show(error.message, true); return }
    await supabase.from('la_steps').insert({ campaign_id: data.id, position: 0, action: 'invite', condition: 'always', template: {} })
    await load(); setSel(data)
  }

  async function saveCampaign(patch) {
    if (!sel) return
    const { error } = await supabase.from('la_campaigns').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', sel.id)
    if (error) { show(error.message, true); return }
    setSel({ ...sel, ...patch }); load()
  }

  async function setStatus(status) { await saveCampaign({ status }); show(`Kampagne → ${statusLabel[status]}`) }

  async function saveStep(idx, patch) {
    const st = steps[idx]
    const { error } = await supabase.from('la_steps').update(patch).eq('id', st.id)
    if (error) { show(error.message, true); return }
    setSteps(steps.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }
  async function addStep() {
    const pos = steps.length
    const { data, error } = await supabase.from('la_steps').insert({ campaign_id: sel.id, position: pos, action: 'message', condition: 'if_accepted', template: {} }).select().single()
    if (error) { show(error.message, true); return }
    setSteps([...steps, data])
  }
  async function delStep(idx) { const st = steps[idx]; await supabase.from('la_steps').delete().eq('id', st.id); loadDetail(sel.id) }

  async function createAudience(kind) {
    const { data, error } = await supabase.from('la_audiences').insert({ team_id: activeTeamId, kind, query: kind.startsWith('search') ? { keywords: '' } : null }).select().single()
    if (error) { show(error.message, true); return }
    await supabase.from('la_campaigns').update({ audience_id: data.id }).eq('id', sel.id)
    setSel({ ...sel, audience_id: data.id }); load()
  }
  async function saveAudience(patch) {
    const aud = audiences.find(a => a.id === sel.audience_id); if (!aud) return
    await supabase.from('la_audiences').update(patch).eq('id', aud.id); load()
  }
  async function runAudience() {
    if (!sel?.audience_id) { show('Keine Audience gewählt', true); return }
    show('Audience wird ausgeführt…')
    const { data, error } = await supabase.functions.invoke('la-audience', { body: { audience_id: sel.audience_id, campaign_id: sel.id } })
    if (error) { show('Fehler: ' + error.message, true); return }
    show(`${data?.inserted ?? 0} neu, ${data?.deduped ?? 0} bekannt${data?.more_available ? ' (mehr verfügbar)' : ''}`)
    loadDetail(sel.id); load()
  }

  const selAudience = audiences.find(a => a.id === sel?.audience_id)

  // Ehrliche Warnungen
  const warnings = []
  if (funnel) {
    const jp = funnel.jobs?.pending || 0, jd = funnel.jobs?.dead || 0
    if (sel?.status === 'active' && (funnel.jobs ? Object.keys(funnel.jobs).length === 0 : true)) warnings.push('Aktiv, aber 0 Jobs materialisiert — Audience ausführen?')
    if (funnel.oldest_pending && new Date(funnel.oldest_pending) < new Date(Date.now() - 6 * 3600e3) && sel?.status === 'active') warnings.push('Ältester pending-Job > 6h alt')
    if (jd > 0) warnings.push(`${jd} Dead-Letter-Jobs (dauerhaft fehlgeschlagen)`)
  }
  if (health) {
    if (health.heartbeat_age_s > 180) warnings.push(`Runner-Heartbeat altert (${health.heartbeat_age_s}s) — läuft der Cron?`)
    if (health.dead_total > 0) warnings.push(`System-Dead-Letter: ${health.dead_total}`)
  }
  const acctDisconnected = accounts.some(a => /disconnect|error|credential/i.test(a.status || ''))
  if (acctDisconnected) warnings.push('Ein Account ist getrennt — Reconnect nötig, sonst pausiert der Runner')

  const f = funnel || {}
  const funnelStages = [
    { k: 'enrolled', label: 'Enrolled', n: f.enrollment_total || 0 },
    { k: 'invited', label: 'Invited', n: f.done_by_action?.invite || 0 },
    { k: 'accepted', label: 'Accepted', n: (f.enrollments?.replied || 0) + (f.done_by_action?.message || 0) },
    { k: 'messaged', label: 'Messaged', n: f.done_by_action?.message || 0 },
    { k: 'replied', label: 'Replied', n: f.enrollments?.replied || 0 },
  ]

  return (
    <div style={pageOuterStyle}><div style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>Automatisierung <span style={{ fontSize: 12, color: PRIMARY_VAR, border: `1px solid ${PRIMARY_VAR}`, borderRadius: 6, padding: '2px 6px', verticalAlign: 'middle' }}>Beta · Unipile</span></h1>
          <p style={subtitleStyle}>Greenfield-Engine (la_*) — Builder + ehrlicher Funnel-Monitor. Getrennt vom Altsystem.</p>
        </div>
        <button style={primaryBtn} onClick={createCampaign} disabled={creating}><Plus size={16} /> Neue Kampagne</button>
      </div>

      {/* Runner-Health-Leiste */}
      {health && (
        <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><Activity size={15} color={health.heartbeat_age_s > 180 ? '#ef4444' : '#22c55e'} /> Runner</span>
          <span>Heartbeat: <b style={{ color: health.heartbeat_age_s > 180 ? '#ef4444' : 'inherit' }}>{health.heartbeat_age_s}s</b></span>
          <span>pending fällig: <b>{health.pending_due}</b> / gesamt {health.pending_total}</span>
          <span>Dead-Letter: <b style={{ color: health.dead_total > 0 ? '#ef4444' : 'inherit' }}>{health.dead_total}</b></span>
          <button style={{ ...ghostBtn, marginLeft: 'auto' }} onClick={() => { load(); loadDetail(sel?.id) }}><RefreshCw size={13} /> Aktualisieren</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Kampagnen-Liste */}
        <div style={{ ...cardStyle, padding: 8 }}>
          {campaigns.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Noch keine Kampagne. Lege eine an.</div>}
          {campaigns.map(c => (
            <div key={c.id} onClick={() => setSel(c)} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: sel?.id === c.id ? PRIMARY_VAR + '12' : 'transparent', border: sel?.id === c.id ? `1.5px solid ${PRIMARY_VAR}55` : '1.5px solid transparent', marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</span><Pill status={c.status} />
              </div>
            </div>
          ))}
        </div>

        {/* Detail: Monitor + Builder */}
        {!sel ? (
          <div style={{ ...cardStyle, color: 'var(--text-muted)', fontSize: 13 }}>Wähle links eine Kampagne oder lege eine neue an.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Warnungen */}
            {warnings.length > 0 && (
              <div style={{ ...cardStyle, borderColor: '#FDE68A', background: '#FFFBEB' }}>
                {warnings.map((w, i) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#B45309', padding: '2px 0' }}><AlertTriangle size={14} /> {w}</div>)}
              </div>
            )}

            {/* Monitor: Funnel + Controls */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><b style={{ fontSize: 15 }}>{sel.name}</b><Pill status={sel.status} /></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {sel.status !== 'active' && <button style={primaryBtn} onClick={() => setStatus('active')}><Play size={14} /> Aktivieren</button>}
                  {sel.status === 'active' && <button style={ghostBtn} onClick={() => setStatus('paused')}><Pause size={13} /> Pausieren</button>}
                  <button style={ghostBtn} onClick={() => setStatus('completed')}><Square size={13} /> Stoppen</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {funnelStages.map((s, i) => (
                  <div key={s.k} style={{ flex: 1, textAlign: 'center', padding: '12px 6px', background: 'var(--surface-canvas, #F8FAFC)', borderRadius: 10, position: 'relative' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: i === 0 ? PRIMARY_VAR : 'var(--text-strong)' }}>{s.n}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {funnel && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>Jobs: {Object.entries(funnel.jobs || {}).map(([k, v]) => `${v} ${k}`).join(' · ') || '—'}</span>
                  {funnel.oldest_pending && <span>ältester pending: {new Date(funnel.oldest_pending).toLocaleString('de-DE')}</span>}
                </div>
              )}
            </div>

            {/* Builder */}
            <div style={cardStyle}>
              <b style={{ fontSize: 14 }}>Konfiguration</b>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div><label style={labelStyle}>Name</label><input style={inputStyle} defaultValue={sel.name} onBlur={e => e.target.value !== sel.name && saveCampaign({ name: e.target.value })} /></div>
                <div><label style={labelStyle}>Account</label>
                  <select style={inputStyle} value={sel.account_id} onChange={e => saveCampaign({ account_id: e.target.value })}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.public_identifier || a.unipile_account_id} ({a.status})</option>)}
                  </select>
                </div>
              </div>

              {/* Audience */}
              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>Zielgruppe (Audience)</label>
                {!selAudience ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {KINDS.map(([k, l]) => <button key={k} style={ghostBtn} onClick={() => createAudience(k)}><Users size={13} /> {l}</button>)}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 160 }}><label style={labelStyle}>Art</label><div style={{ fontSize: 13, fontWeight: 600, padding: '8px 0' }}>{KINDS.find(k => k[0] === selAudience.kind)?.[1]}</div></div>
                    {selAudience.kind?.startsWith('search') && (
                      <div style={{ flex: 1, minWidth: 200 }}><label style={labelStyle}>Keywords</label>
                        <input style={inputStyle} defaultValue={selAudience.query?.keywords || ''} onBlur={e => saveAudience({ query: { ...(selAudience.query || {}), keywords: e.target.value } })} placeholder="z.B. growth marketing berlin" /></div>
                    )}
                    <button style={primaryBtn} onClick={runAudience}><Zap size={14} /> Audience ausführen</button>
                    {selAudience.last_run_at && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>zuletzt: {new Date(selAudience.last_run_at).toLocaleString('de-DE')}</span>}
                  </div>
                )}
              </div>

              {/* Steps */}
              <div style={{ marginTop: 18 }}>
                <label style={labelStyle}>Sequenz</label>
                {steps.map((st, i) => (
                  <div key={st.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: PRIMARY_VAR + '18', color: PRIMARY_VAR, fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    <select style={{ ...inputStyle, width: 130 }} value={st.action} onChange={e => saveStep(i, { action: e.target.value })}>{ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}</select>
                    <select style={{ ...inputStyle, width: 170 }} value={st.condition} onChange={e => saveStep(i, { condition: e.target.value })}>{CONDITIONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
                    {(st.action === 'message' || st.action === 'follow_up' || st.action === 'inmail') && (
                      <input style={{ ...inputStyle, flex: 1, minWidth: 180 }} defaultValue={st.template?.text || ''} placeholder="Nachrichtentext…" onBlur={e => saveStep(i, { template: { ...(st.template || {}), text: e.target.value } })} />
                    )}
                    <button style={{ ...ghostBtn, padding: '6px 8px' }} onClick={() => delStep(i)}>✕</button>
                  </div>
                ))}
                <button style={ghostBtn} onClick={addStep}><Plus size={13} /> Schritt</button>
              </div>

              {/* Caps */}
              <div style={{ marginTop: 18, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div><label style={labelStyle}>Invites/Tag</label><input type="number" style={{ ...inputStyle, width: 100 }} defaultValue={sel.caps?.invite?.per_day ?? 20} onBlur={e => saveCampaign({ caps: { ...(sel.caps || {}), invite: { per_day: Number(e.target.value) } } })} /></div>
                <div><label style={labelStyle}>Nachrichten/Tag</label><input type="number" style={{ ...inputStyle, width: 100 }} defaultValue={sel.caps?.message?.per_day ?? 30} onBlur={e => saveCampaign({ caps: { ...(sel.caps || {}), message: { per_day: Number(e.target.value) } } })} /></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {flash && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: flash.err ? '#DC2626' : '#111827', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 100 }}>{flash.msg}</div>}
    </div></div>
  )
}
