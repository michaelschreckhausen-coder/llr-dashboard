// SponsorPipelineList — wiederverwendbare Sponsoring-Pipeline-Sicht (read-only).
// Unternehmen MIT Sponsoring-Extension (sponsor_profiles ⋈ organizations), Spalten
// Sponsor(=Org-Name)/Branche/Status/Zyklus/Erw.Wert/Fit-Score, sortiert nach
// fit_score desc. Klick auf eine Zeile → Unternehmens-Detail, Tab „Sponsoring".
// Extrahiert aus der früheren Seite /sponsoring/sponsoren (jetzt CRM-Sicht).
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const sp = () => supabase.schema('sponsoring')
const STATUS_LABEL = { lead: 'Lead', contacted: 'Kontaktiert', qualified: 'Qualifiziert', offer: 'Angebot', negotiation: 'Verhandlung', won: 'Gewonnen', lost: 'Verloren' }
function scoreColor(s) { if (s == null) return 'var(--text-muted)'; if (s >= 70) return '#059669'; if (s >= 40) return '#D97706'; return '#DC2626' }

export default function SponsorPipelineList({ onOpen }) {
  const { activeTeamId } = useTeam()
  const navigate = useNavigate()
  const [sponsors, setSponsors] = useState([])   // Extension-Rows angereichert um org_name
  const [stages, setStages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    // Cross-Schema-sicher: KEIN PostgREST-Embed, sondern Client-Join über organization_id.
    const [{ data: ext, error: e }, { data: orgData, error: oErr }, { data: st, error: stErr }] = await Promise.all([
      sp().from('sponsor_profiles').select('*').eq('team_id', activeTeamId)
        .order('fit_score', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
      supabase.from('organizations').select('id, name, industry_slug').eq('team_id', activeTeamId),
      sp().from('sales_cycle_stages').select('*').eq('team_id', activeTeamId).order('stage'),
    ])
    if (e || oErr || stErr) { setError((e || oErr || stErr).message); setLoading(false); return }
    const orgById = new Map((orgData || []).map((o) => [o.id, o]))
    setSponsors((ext || []).map((row) => ({ ...row, org_name: orgById.get(row.organization_id)?.name || '—' })))
    setStages(st || []); setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const stageLabel = (n) => { const s = stages.find((x) => x.stage === n); return s ? `${s.stage} · ${s.label}` : (n != null ? String(n) : '—') }
  const open = (s) => { if (onOpen) onOpen(s); else navigate(`/organizations/${s.organization_id}`, { state: { tab: 'sponsoring' } }) }

  if (error) return <div style={errBox}>{error}</div>
  if (loading) return <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
  if (sponsors.length === 0) return <div style={muted}>Noch keine Sponsoren. Lege ein Unternehmen an und öffne dort den „Sponsoring"-Tab.</div>

  return (
    <div style={tableWrap}>
      <table style={table}>
        <thead><tr style={trHead}>
          <th style={th}>Sponsor</th><th style={th}>Branche</th><th style={th}>Status</th><th style={th}>Zyklus</th><th style={th}>Erw. Wert</th><th style={th}>Fit-Score</th>
        </tr></thead>
        <tbody>
          {sponsors.map((s) => (
            <tr key={s.id} style={{ ...trBody, cursor: 'pointer' }} onClick={() => open(s)}>
              <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{s.org_name}</td>
              <td style={td}>{s.industry || '—'}</td>
              <td style={td}>{STATUS_LABEL[s.status] || s.status}</td>
              <td style={td}>{stageLabel(s.cycle_stage)}</td>
              <td style={td}>{s.expected_value != null ? `${Number(s.expected_value).toLocaleString('de-DE')} €` : '—'}</td>
              <td style={td}><span style={{ fontWeight: 800, color: scoreColor(s.fit_score) }}>{s.fit_score != null ? s.fit_score : '—'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14, padding: '40px 0', justifyContent: 'center' }
const tableWrap = { border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }
const trHead = { background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }
const trBody = { borderTop: '1px solid var(--border)' }
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
