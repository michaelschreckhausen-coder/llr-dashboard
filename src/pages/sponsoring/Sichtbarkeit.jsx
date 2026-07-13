// Sponsoring OS — GEO & KI-Sichtbarkeit (Phase 4, Modul 13)
// Misst über mehrere KI-Provider, ob ein Sponsor/Verein in den Antworten genannt
// wird. Sichtbarkeits-Index aus v_geo_visibility. Schema 'sponsoring'.

import PillSelect from '../../components/PillSelect'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { Eye, Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const sp = () => supabase.schema('sponsoring')

function indexColor(i) {
  if (i == null) return 'var(--text-muted)'
  if (i >= 66) return '#059669'
  if (i >= 33) return '#D97706'
  return '#DC2626'
}

export default function Sichtbarkeit() {
  const { activeTeamId } = useTeam()
  const [sponsors, setSponsors] = useState([])
  const [orgs, setOrgs] = useState([])
  const [agg, setAgg] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [subjectType, setSubjectType] = useState('club')
  const [clubName, setClubName] = useState('')
  const [sponsorId, setSponsorId] = useState('')

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [s, v, r, o] = await Promise.all([
      sp().from('sponsor_profiles').select('id, organization_id').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('v_geo_visibility').select('*').eq('team_id', activeTeamId),
      sp().from('geo_visibility_runs').select('*').eq('team_id', activeTeamId).order('run_at', { ascending: false }).limit(30),
      supabase.from('organizations').select('id, name').eq('team_id', activeTeamId),
    ])
    if (s.error || v.error || r.error || o.error) { setError((s.error || v.error || r.error || o.error).message); setLoading(false); return }
    setSponsors(s.data || []); setAgg(v.data || []); setRuns(r.data || []); setOrgs(o.data || [])
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Sponsor-Name kommt aus organizations.name (sponsor_profiles ist 1:1-Extension).
  const orgName = useMemo(() => Object.fromEntries(orgs.map((o) => [o.id, o.name])), [orgs])
  // Sponsoren clientseitig alphabetisch nach aufgelöstem Org-Namen sortieren (vorher .order('name')).
  const sortedSponsors = useMemo(
    () => [...sponsors].sort((a, b) => (orgName[a.organization_id] || '').localeCompare(orgName[b.organization_id] || '')),
    [sponsors, orgName],
  )

  async function runCheck() {
    setBusy(true); setError(null)
    const payload = subjectType === 'sponsor'
      ? (() => {
          const s = sponsors.find((x) => x.id === sponsorId)
          const name = s ? orgName[s.organization_id] : null
          return s && name ? { subject_type: 'sponsor', subject_name: name, subject_ref: s.id } : null
        })()
      : (clubName.trim() ? { subject_type: 'club', subject_name: clubName.trim() } : null)

    if (!payload) { setError('Bitte Subjekt wählen/eingeben.'); setBusy(false); return }

    const { data, error: e } = await supabase.functions.invoke('geo-visibility-check', {
      body: { team_id: activeTeamId, ...payload },
    })
    if (e || data?.error) { setError(e?.message || data?.error); setBusy(false); return }
    await fetchAll(); setBusy(false)
  }

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="Sponsoring"
        title="KI-Sichtbarkeit"
        subtitle="Wird dein Verein/Sponsor in KI-Antworten (ChatGPT, Claude, Perplexity …) genannt? Der Index zeigt den Anteil der Nennungen."
        action={<button onClick={fetchAll} title="Aktualisieren" style={iconBtn}><RefreshCw size={16} /></button>}
      />

      {error && <div style={errBox}>{error}</div>}

      <div style={{ ...card, marginBottom: 24, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Subjekt-Typ">
          <PillSelect value={subjectType} onChange={setSubjectType} neutral options={[{ value: 'club', label: `Verein` }, { value: 'sponsor', label: `Sponsor` }]} buttonStyle={{ minWidth: 140 }} />
        </Field>
        {subjectType === 'sponsor' ? (
          <Field label="Sponsor">
            <PillSelect value={sponsorId} onChange={setSponsorId} neutral options={[{ value: '', label: `— wählen —` }, ...sortedSponsors.map((s) => ({ value: s.id, label: orgName[s.organization_id] || '—' }))]} buttonStyle={{ minWidth: 140 }} />
          </Field>
        ) : (
          <Field label="Vereinsname">
            <input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="z.B. SV Musterstadt" style={{ ...input, minWidth: 240 }} />
          </Field>
        )}
        <button onClick={runCheck} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} Sichtbarkeit prüfen
        </button>
      </div>

      {/* Aggregierter Index */}
      <h2 style={h2}>Sichtbarkeits-Index</h2>
      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : agg.length === 0 ? (
        <div style={{ ...muted, marginBottom: 26 }}>Noch keine Messungen.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 26 }}>
          {agg.map((a) => (
            <div key={(a.subject_ref || a.subject_name)} style={card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{a.subject_name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>{a.subject_type === 'club' ? 'Verein' : a.subject_type}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: indexColor(a.visibility_index) }}>{a.visibility_index ?? 0}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ 100</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>{a.mentions}/{a.runs} Nennungen</div>
            </div>
          ))}
        </div>
      )}

      {/* Letzte Läufe */}
      <h2 style={h2}>Letzte Läufe</h2>
      {runs.length === 0 ? (
        <div style={muted}>—</div>
      ) : (
        <div style={tableWrap}>
          <table style={table}>
            <thead><tr style={trHead}><th style={th}>Subjekt</th><th style={th}>Provider</th><th style={th}>Genannt</th><th style={th}>Zeitpunkt</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={trBody}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{r.subject_name}</td>
                  <td style={td}>{r.provider}</td>
                  <td style={td}>
                    <span style={{ fontWeight: 700, color: r.mentioned ? '#059669' : '#DC2626' }}>{r.mentioned ? 'Ja' : 'Nein'}</span>
                  </td>
                  <td style={td}>{new Date(r.run_at).toLocaleString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

const card = { border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }
const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }
const h2 = { fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 12px' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const tableWrap = { border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }
const trHead = { background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }
const trBody = { borderTop: '1px solid var(--border)' }
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
