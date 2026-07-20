// LinkedInAutomationNeu — Greenfield la_*-Automation UI (Builder + Funnel-Monitor). Hinter Feature-Flag.
// Berührt NICHT das Altsystem (/automatisierung, automation_*). Liest RLS-scoped (Team-Policies P1) +
// funnel-RPC (la_campaign_funnel) + health-View (la_runner_health). 0 reale Sends aus dem UI (Runner sendet
// nur bei aktiver Kampagne + fälligem Job; die "ehrliche UI" zeigt genau das an).
import PillSelect from '../components/PillSelect'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { useTeam } from '../context/TeamContext'
import { Plus, Zap, Play, Pause, Square, RefreshCw, Users, AlertTriangle, Activity, Archive, RotateCcw, Trash2, X } from 'lucide-react'

const PRIMARY = '#0A6FB0'
const PRIMARY_VAR = `var(--wl-primary, ${PRIMARY})`
const pageOuterStyle = { background: 'transparent', minHeight: '100vh', padding: '24px 16px 60px' }
const pageStyle = { width: '100%', maxWidth: 1100, margin: '0 auto' }
const headerRowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }
const titleStyle = { fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text-strong, #111827)' }
const subtitleStyle = { fontSize: 13, color: 'var(--text-muted, #6B7280)', marginTop: 4 }
const cardStyle = { background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border, #E4E7EC)', boxShadow: 'var(--shadow-card)', padding: '18px 20px' }
const primaryBtn = { padding: '9px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }
const ghostBtn = { padding: '7px 12px', background: 'var(--surface)', color: '#374151', border: '1.5px solid #E4E7EC', borderRadius: 10, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }
const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E4E7EC', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--surface)' }
const labelStyle = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }
const statusColor = { draft: '#94A3B8', active: '#039855', paused: '#D97706', completed: '#0A6FB0' }
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
  const [inboxLists, setInboxLists] = useState([])   // Import-Inbox-Listen = kanonische Zielgruppen-Quelle
  const [health, setHealth] = useState(null)
  const [sel, setSel] = useState(null)          // ausgewählte Kampagne
  const [steps, setSteps] = useState([])
  const [funnel, setFunnel] = useState(null)
  const [flash, setFlash] = useState(null)
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)   // Listen-Tab Aktiv/Archiviert
  const [deleteModal, setDeleteModal] = useState(null)       // Kampagne im Confirm-Dialog
  const [activateModal, setActivateModal] = useState(false)  // Aktivieren-Confirm-Gate (draft/paused → active)
  const [stepsDirty, setStepsDirty] = useState(false)        // ungespeicherte Sequenz-Änderungen
  const stepsDirtyRef = useRef(false)                        // Poll darf lokale Edits nicht überschreiben
  const markStepsDirty = () => { stepsDirtyRef.current = true; setStepsDirty(true) }

  const show = (msg, err) => { setFlash({ msg, err }); setTimeout(() => setFlash(null), 3500) }

  const load = useCallback(async () => {
    if (!activeTeamId) return
    const [c, a, au, h, il] = await Promise.all([
      supabase.from('la_campaigns').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      supabase.from('la_accounts').select('*').eq('team_id', activeTeamId).eq('status', 'connected'),
      supabase.from('la_audiences').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      supabase.from('la_runner_health').select('*').maybeSingle(),
      supabase.from('inbox_lists').select('id, name').eq('team_id', activeTeamId).order('created_at', { ascending: true }),
    ])
    setCampaigns(c.data || []); setAccounts(a.data || []); setAudiences(au.data || []); setHealth(h.data || null)
    setInboxLists(il.data || [])
  }, [activeTeamId])
  useEffect(() => { load() }, [load])

  // Detail (Steps + Funnel) für die ausgewählte Kampagne, mit Polling.
  const loadDetail = useCallback(async (campId) => {
    if (!campId) { setSteps([]); setFunnel(null); return }
    const [s, f] = await Promise.all([
      supabase.from('la_steps').select('*').eq('campaign_id', campId).order('position', { ascending: true }),
      supabase.rpc('la_campaign_funnel', { p_campaign_id: campId }),
    ])
    // Poll: lokale, ungespeicherte Sequenz-Edits NICHT überschreiben (nur Funnel aktualisieren).
    if (!stepsDirtyRef.current) setSteps(s.data || [])
    setFunnel(f.data && !f.data.error ? f.data : null)
  }, [])
  useEffect(() => { stepsDirtyRef.current = false; setStepsDirty(false); loadDetail(sel?.id) }, [sel?.id, loadDetail])
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

  // Aktivieren-Confirm-Gate: erst nach expliziter Bestätigung aktivieren (draft/paused → active).
  async function confirmActivate() {
    setActivateModal(false)
    await setStatus('active')
  }

  async function setArchived(archived) {
    if (!sel) return
    const { error } = await supabase.rpc('la_campaign_set_archived', { p_campaign_id: sel.id, p_archived: archived })
    if (error) { show(error.message, true); return }
    show(archived ? 'Kampagne archiviert' : 'Kampagne wiederhergestellt')
    setSel(archived ? null : { ...sel, archived_at: null })
    load()
  }

  async function deleteCampaign() {
    const c = deleteModal
    if (!c) return
    const { data, error } = await supabase.rpc('la_campaign_delete', { p_campaign_id: c.id })
    setDeleteModal(null)
    if (error) {
      show(error.message.includes('active') ? 'Erst stoppen — aktive Kampagne kann nicht gelöscht werden' : error.message, true)
      return
    }
    show(`Gelöscht: ${data?.deleted_enrollments ?? 0} Enrollments, ${data?.deleted_jobs ?? 0} Jobs`)
    if (sel?.id === c.id) setSel(null)
    load()
  }

  // Sequenz-Edits sind lokal gepuffert (kein Direkt-Write mehr → kein FK-Bruch, kein
  // Positions-Gap). Persistiert erst „Sequenz speichern" atomar via RPC.
  function saveStep(idx, patch) {
    setSteps(steps.map((s, i) => i === idx ? { ...s, ...patch } : s)); markStepsDirty()
  }
  function addStep() {
    setSteps([...steps, { _key: `new-${Date.now()}-${steps.length}`, action: 'message', condition: 'if_accepted', template: {} }]); markStepsDirty()
  }
  function delStep(idx) { setSteps(steps.filter((_, i) => i !== idx)); markStepsDirty() }

  async function saveSteps() {
    if (!sel) return
    const payload = steps.map(st => ({
      ...(st.id ? { id: st.id } : {}),
      action: st.action, condition: st.condition, template: st.template || {},
    }))
    const { data, error } = await supabase.rpc('la_campaign_save_steps', { p_campaign_id: sel.id, p_steps: payload })
    if (error) { show(error.message.includes('active') ? 'Erst pausieren — aktive Kampagne kann die Sequenz nicht ändern' : error.message, true); return }
    stepsDirtyRef.current = false; setStepsDirty(false)
    const rm = data?.rematerialized || 0, cp = data?.completed || 0
    show(`Sequenz gespeichert${(rm || cp) ? ` · ${rm} Jobs neu materialisiert, ${cp} abgeschlossen` : ''}`)
    loadDetail(sel.id)
  }

  async function createAudience(kind) {
    const initialQuery = kind === 'list' ? { list_id: null } : kind.startsWith('search') ? { keywords: '' } : null
    const { data, error } = await supabase.from('la_audiences').insert({ team_id: activeTeamId, kind, query: initialQuery }).select().single()
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
    const aud = audiences.find(a => a.id === sel.audience_id)
    if (aud?.kind === 'list' && !aud.query?.list_id) { show('Bitte zuerst eine Liste wählen', true); return }
    show('Audience wird ausgeführt…')
    const { data, error } = await supabase.functions.invoke('la-audience', { body: { audience_id: sel.audience_id, campaign_id: sel.id } })
    if (error) { show('Fehler: ' + error.message, true); return }
    show(`${data?.inserted ?? 0} neu, ${data?.deduped ?? 0} bekannt${data?.more_available ? ' (mehr verfügbar)' : ''}`)
    loadDetail(sel.id); load()
  }
  // B1 Pre-Scan: relation_status je Ziel cachen → Confirm-Gate zeigt exakte Zahl statt „bis zu N".
  async function runAudienceScan() {
    if (!sel?.id) return
    show('Audience wird gescannt…')
    const { data, error } = await supabase.functions.invoke('la-audience-scan', { body: { campaign_id: sel.id } })
    if (error) { show('Scan-Fehler: ' + error.message, true); return }
    const c = data?.counts || {}
    const offen = c.not_connected || 0
    const vernetzt = (c.first_degree || 0) + (c.pending || 0)
    const uni = data?.unipile_used || 0
    const cache = Math.max(0, (data?.scanned_this_run || 0) - uni)
    show(`${offen} offen · ${vernetzt} vernetzt · ${uni} Unipile / ${cache} Cache`)
    loadDetail(sel.id)
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
      <PageHeader
        overline="LinkedIn · Automatisierung"
        title="Automatisierung"
        subtitle="Kampagnen-Builder + Funnel-Monitor."
        action={<button className="lk-btn lk-btn-navy" onClick={createCampaign} disabled={creating}><Plus size={16} /> Neue Kampagne</button>}
      />

      {/* Runner-Health-Leiste */}
      {health && (
        <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><Activity size={15} color={health.heartbeat_age_s > 180 ? '#DC2626' : '#039855'} /> Runner</span>
          <span>Heartbeat: <b style={{ color: health.heartbeat_age_s > 180 ? '#DC2626' : 'inherit' }}>{health.heartbeat_age_s}s</b></span>
          <span>pending fällig: <b>{health.pending_due}</b> / gesamt {health.pending_total}</span>
          <span>Dead-Letter: <b style={{ color: health.dead_total > 0 ? '#DC2626' : 'inherit' }}>{health.dead_total}</b></span>
          <button style={{ ...ghostBtn, marginLeft: 'auto' }} onClick={() => { load(); loadDetail(sel?.id) }}><RefreshCw size={13} /> Aktualisieren</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Kampagnen-Liste */}
        <div style={{ ...cardStyle, padding: 8 }}>
          {/* Tabs Aktiv / Archiviert */}
          {(() => {
            const activeC = campaigns.filter(c => !c.archived_at)
            const archivedC = campaigns.filter(c => c.archived_at)
            const visible = showArchived ? archivedC : activeC
            const tabStyle = on => ({ flex: 1, padding: '6px 8px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center', border: 'none', background: on ? PRIMARY_VAR + '18' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)' })
            return (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  <button style={tabStyle(!showArchived)} onClick={() => setShowArchived(false)}>Aktiv ({activeC.length})</button>
                  <button style={tabStyle(showArchived)} onClick={() => setShowArchived(true)}>Archiviert ({archivedC.length})</button>
                </div>
                {visible.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>{showArchived ? 'Keine archivierten Kampagnen.' : 'Noch keine Kampagne. Lege eine an.'}</div>}
                {visible.map(c => (
                  <div key={c.id} onClick={() => setSel(c)} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: sel?.id === c.id ? PRIMARY_VAR + '12' : 'transparent', border: sel?.id === c.id ? `1.5px solid ${PRIMARY_VAR}55` : '1.5px solid transparent', marginBottom: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{c.archived_at && <Archive size={12} color="var(--text-muted)" />}{c.name}</span><Pill status={c.status} />
                    </div>
                  </div>
                ))}
              </>
            )
          })()}
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
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {sel.status !== 'active' && <button className="lk-btn lk-btn-navy" onClick={() => { loadDetail(sel.id); setActivateModal(true) }}><Play size={14} /> Aktivieren</button>}
                  {sel.status === 'active' && <button style={ghostBtn} onClick={() => setStatus('paused')}><Pause size={13} /> Pausieren</button>}
                  <button style={ghostBtn} onClick={() => setStatus('completed')}><Square size={13} /> Stoppen</button>
                  {sel.archived_at
                    ? <button style={ghostBtn} onClick={() => setArchived(false)}><RotateCcw size={13} /> Wiederherstellen</button>
                    : <button style={ghostBtn} onClick={() => setArchived(true)}><Archive size={13} /> Archivieren</button>}
                  <button
                    style={{ ...ghostBtn, color: sel.status === 'active' ? '#9CA3AF' : '#DC2626', borderColor: sel.status === 'active' ? '#E4E7EC' : '#FECACA', cursor: sel.status === 'active' ? 'not-allowed' : 'pointer' }}
                    disabled={sel.status === 'active'}
                    title={sel.status === 'active' ? 'Erst stoppen' : 'Kampagne löschen'}
                    onClick={() => setDeleteModal(sel)}>
                    <Trash2 size={13} /> Löschen
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {funnelStages.map((s, i) => (
                  <div key={s.k} style={{ flex: 1, textAlign: 'center', padding: '12px 6px', background: 'var(--surface-canvas, #F8FAFC)', borderRadius: 10, position: 'relative' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: i === 0 ? 'var(--primary)' : 'var(--text-strong)' }}>{s.n}</div>
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
                  <PillSelect value={sel.account_id} onChange={v => saveCampaign({ account_id: v })} neutral options={[...accounts.map((a) => ({ value: a.id, label: `${a.public_identifier || a.unipile_account_id} (${a.status})` }))]} buttonStyle={{ minWidth: 140 }} />
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
                    {selAudience.kind === 'list' && (
                      <div style={{ flex: 1, minWidth: 220 }}><label style={labelStyle}>Liste</label>
                        <PillSelect value={selAudience.query?.list_id || ''} onChange={v => saveAudience({ query: { ...(selAudience.query || {}), list_id: v || null } })} neutral options={[{ value: '', label: `— Liste wählen —` }, ...inboxLists.map((l) => ({ value: l.id, label: l.name }))]} buttonStyle={{ minWidth: 140 }} />
                        {inboxLists.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Noch keine Listen — unter „LinkedIn Kontakte" anlegen.</div>}
                      </div>
                    )}
                    <button className="lk-btn lk-btn-navy" onClick={runAudience}><Zap size={14} /> Audience ausführen</button>
                    <button style={ghostBtn} onClick={runAudienceScan}><Users size={14} /> Audience scannen</button>
                    {selAudience.last_run_at && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>zuletzt: {new Date(selAudience.last_run_at).toLocaleString('de-DE')}</span>}
                  </div>
                )}
              </div>

              {/* Steps */}
              {(() => {
                const seqLocked = sel.status === 'active'   // aktive Kampagne: kein Sequenz-Edit mitten im Versand
                return (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Sequenz</label>
                      {stepsDirty && !seqLocked && <span style={{ fontSize: 11, color: '#B45309', fontWeight: 700 }}>● ungespeichert</span>}
                    </div>
                    {seqLocked && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                        <AlertTriangle size={14} /> Kampagne läuft — zum Bearbeiten der Sequenz erst pausieren.
                      </div>
                    )}
                    {steps.map((st, i) => (
                      <div key={st.id || st._key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ width: 22, height: 22, borderRadius: 6, background: PRIMARY_VAR + '18', color: PRIMARY_VAR, fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                        <PillSelect value={st.action} onChange={__lkv => saveStep(i, { action: __lkv })} neutral disabled={seqLocked} options={[...ACTIONS.map((a) => ({ value: a, label: a }))]} buttonStyle={{ minWidth: 140 }} />
                        <PillSelect value={st.condition} onChange={__lkv => saveStep(i, { condition: __lkv })} neutral disabled={seqLocked} options={[...CONDITIONS.map(([c, l]) => ({ value: c, label: l }))]} buttonStyle={{ minWidth: 140 }} />
                        {(st.action === 'message' || st.action === 'follow_up' || st.action === 'inmail' || st.action === 'comment') && (
                          <input disabled={seqLocked} style={{ ...inputStyle, flex: 1, minWidth: 180 }} defaultValue={st.template?.text || ''} placeholder={st.action === 'comment' ? 'Kommentartext (öffentlich!)…' : 'Nachrichtentext…'} onBlur={e => saveStep(i, { template: { ...(st.template || {}), text: e.target.value } })} />
                        )}
                        {st.action === 'react' && (
                          <PillSelect value={st.template?.reaction_type || 'like'} onChange={__lkv => saveStep(i, { template: { ...(st.template || {}), reaction_type: __lkv } })} neutral disabled={seqLocked} options={[...['like', 'celebrate', 'support', 'love', 'insightful', 'funny'].map((t) => ({ value: t, label: t }))]} buttonStyle={{ minWidth: 140 }} />
                        )}
                        {!seqLocked && <button style={{ ...ghostBtn, padding: '6px 8px' }} onClick={() => delStep(i)}>✕</button>}
                      </div>
                    ))}
                    {!seqLocked && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button style={ghostBtn} onClick={addStep}><Plus size={13} /> Schritt</button>
                        <button className="lk-btn lk-btn-navy" style={{ opacity: stepsDirty ? 1 : 0.5, cursor: stepsDirty ? 'pointer' : 'default' }} disabled={!stepsDirty} onClick={saveSteps}>Sequenz speichern</button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Caps */}
              <div style={{ marginTop: 18, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div><label style={labelStyle}>Invites/Tag</label><input type="number" style={{ ...inputStyle, width: 100 }} defaultValue={sel.caps?.invite?.per_day ?? 20} onBlur={e => saveCampaign({ caps: { ...(sel.caps || {}), invite: { per_day: Number(e.target.value) } } })} /></div>
                <div><label style={labelStyle}>Nachrichten/Tag</label><input type="number" style={{ ...inputStyle, width: 100 }} defaultValue={sel.caps?.message?.per_day ?? 30} onBlur={e => saveCampaign({ caps: { ...(sel.caps || {}), message: { per_day: Number(e.target.value) } } })} /></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Aktivieren-Confirm-Gate (eigenes Modal, kein window.confirm) — zeigt die reale Sofort-Send-Zahl */}
      {activateModal && sel && (() => {
        const acct = accounts.find(a => a.id === sel.account_id)
        const acctLabel = acct?.public_identifier || acct?.unipile_account_id || 'unbekannt'
        const firstAction = steps[0]?.action || 'invite'
        const cap = sel.caps?.[firstAction]?.per_day ?? sel.caps?.invite?.per_day ?? '—'
        const dueNow = funnel?.due_now || 0
        const pendingTotal = funnel?.jobs?.pending || 0
        const actionWord = firstAction === 'invite' ? 'LinkedIn-Invites' : 'LinkedIn-Aktionen'
        // B1 Pre-Scan-Prognose (abwärtskompatibel: fehlt das Feld — z.B. Prod vor RPC-Cutover — → alter „bis zu N"-Text).
        const hasScan = funnel && typeof funnel.real_invites === 'number'
        const realInvites = funnel?.real_invites || 0
        const alreadyConnected = funnel?.already_connected || 0
        const unknownCnt = funnel?.unknown || 0
        const scanComplete = !!funnel?.scan_complete
        return (
          <div onClick={() => setActivateModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface, #fff)', borderRadius: 14, padding: 24, width: 460, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Play size={18} color={PRIMARY_VAR} /><b style={{ fontSize: 16 }}>Kampagne aktivieren?</b>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', marginBottom: 14 }}>
                <span>Kampagne:</span><b style={{ color: 'var(--text-strong)' }}>{sel.name}</b>
                <span>Account:</span><b style={{ color: 'var(--text-strong)' }}>{acctLabel}</b>
                <span>Erste Aktion:</span><b style={{ color: 'var(--text-strong)' }}>{firstAction}</b>
                <span>Cap/Tag:</span><b style={{ color: 'var(--text-strong)' }}>{cap}</b>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  {hasScan && scanComplete
                    ? <>Beim Aktivieren gehen <b>{realInvites} reale {actionWord}</b> von <b>{acctLabel}</b> raus — <b>{alreadyConnected}</b> bereits vernetzt/ausstehend werden übersprungen.</>
                    : hasScan
                      ? <>Beim Aktivieren gehen <b>mind. {realInvites}, bis zu {realInvites + unknownCnt} reale {actionWord}</b> von <b>{acctLabel}</b> raus · <b>{unknownCnt}</b> noch nicht gescannt — „Audience scannen" für die exakte Zahl.</>
                      : <>Beim Aktivieren gehen <b>bis zu {dueNow} reale {actionWord}</b> von <b>{acctLabel}</b> sofort raus{pendingTotal > dueNow ? ` (${pendingTotal} insgesamt geplant, gestaffelt)` : ''}. Bereits vernetzte Kontakte werden übersprungen.</>}
                  {' '}Das sind echte Anfragen an echte Personen. Fortfahren?
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button style={ghostBtn} onClick={() => setActivateModal(false)}>Abbrechen</button>
                <button className="lk-btn lk-btn-navy" onClick={confirmActivate}><Play size={14} /> Ja, aktivieren &amp; senden</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Löschen-Confirm-Dialog (eigenes Modal, kein window.confirm) */}
      {deleteModal && (() => {
        const enr = funnel?.enrollment_total || 0
        const pending = funnel?.jobs?.pending || 0
        const sent = Object.values(funnel?.done_by_action || {}).reduce((a, b) => a + b, 0)
        return (
          <div onClick={() => setDeleteModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface, #fff)', borderRadius: 14, padding: 24, width: 440, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Trash2 size={18} color="#DC2626" /><b style={{ fontSize: 16 }}>Kampagne löschen?</b></div>
                <button style={{ ...ghostBtn, padding: 6 }} onClick={() => setDeleteModal(null)}><X size={15} /></button>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--text-strong)', margin: '0 0 12px' }}>
                „<b>{deleteModal.name}</b>" wird endgültig gelöscht — inklusive <b>{enr} Enrollments</b> und <b>{pending} offener Jobs</b>. Das kann nicht rückgängig gemacht werden.
              </p>
              {sent > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span><b>{sent} bereits gesendete Aktionen</b> (Invites/Nachrichten) bleiben bei LinkedIn bestehen — das Löschen entfernt nur die Kampagnen-Daten hier, zieht nichts bei LinkedIn zurück.</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button style={ghostBtn} onClick={() => setDeleteModal(null)}>Abbrechen</button>
                <button className="lk-btn lk-btn-danger" onClick={deleteCampaign}><Trash2 size={14} /> Endgültig löschen</button>
              </div>
            </div>
          </div>
        )
      })()}

      {flash && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: flash.err ? '#DC2626' : '#111827', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 100 }}>{flash.msg}</div>}
    </div></div>
  )
}
