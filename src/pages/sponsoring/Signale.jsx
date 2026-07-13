// Sponsoring OS — Leadgen-Signale (Phase 3, Modul 11)
// Signal-Feed je Sponsor. KI-Extraktion aus eingefügtem Text (detect-signals EF)
// oder manuelle Erfassung. Schema 'sponsoring'.

import PillSelect from '../../components/PillSelect'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { Radar, Sparkles, Plus, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const sp = () => supabase.schema('sponsoring')

const TYPE_LABEL = {
  new_ceo: 'Neuer GF', expansion: 'Expansion', new_location: 'Standort', new_product: 'Neues Produkt',
  investment: 'Investition', marketing_push: 'Marketingoffensive', hiring: 'Einstellungen', other: 'Sonstiges',
}

export default function Signale() {
  const { activeTeamId } = useTeam()
  const [sponsors, setSponsors] = useState([])
  const [orgs, setOrgs] = useState([])
  const [signals, setSignals] = useState([])
  const [selSponsor, setSelSponsor] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [s, sig, o] = await Promise.all([
      sp().from('sponsor_profiles').select('id, organization_id').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('signals').select('*').eq('team_id', activeTeamId).order('detected_at', { ascending: false }),
      supabase.from('organizations').select('id, name').eq('team_id', activeTeamId),
    ])
    if (s.error || sig.error || o.error) { setError((s.error || sig.error || o.error).message); setLoading(false); return }
    setSponsors(s.data || []); setSignals(sig.data || []); setOrgs(o.data || [])
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Sponsor-Name kommt aus organizations.name (sponsor_profiles ist 1:1-Extension).
  const orgName = useMemo(() => Object.fromEntries(orgs.map((o) => [o.id, o.name])), [orgs])
  const sponsorName = useMemo(
    () => Object.fromEntries(sponsors.map((s) => [s.id, orgName[s.organization_id] || '—'])),
    [sponsors, orgName],
  )
  // Sponsoren clientseitig alphabetisch nach aufgelöstem Org-Namen sortieren (vorher .order('name')).
  const sortedSponsors = useMemo(
    () => [...sponsors].sort((a, b) => (orgName[a.organization_id] || '').localeCompare(orgName[b.organization_id] || '')),
    [sponsors, orgName],
  )

  async function detect() {
    if (!selSponsor || !text.trim()) return
    setBusy(true); setError(null); setNote(null)
    const { data, error: e } = await supabase.functions.invoke('detect-signals', {
      body: { sponsor_profile_id: selSponsor, text: text.trim(), source: 'manual' },
    })
    if (e || data?.error) { setError(e?.message || data?.error); setBusy(false); return }
    setNote(`${data.inserted} Signal(e) erkannt.`)
    setText(''); await fetchAll(); setBusy(false)
  }

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="Sponsoring"
        title="Signale"
        subtitle="Erkenne Sponsoring-Kaufsignale (Expansion, Investition, neuer GF …). Füge einen Text ein — die KI extrahiert die Signale."
      />

      {error && <div style={errBox}>{error}</div>}
      {note && <div style={okBox}>{note}</div>}

      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <PillSelect value={selSponsor} onChange={setSelSponsor} neutral options={[{ value: '', label: `— Sponsor wählen —` }, ...sortedSponsors.map((s) => ({ value: s.id, label: orgName[s.organization_id] || '—' }))]} buttonStyle={{ minWidth: 140 }} />
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
                  placeholder="Presse-/News-/LinkedIn-Auszug einfügen…" style={{ ...input, resize: 'vertical' }} />
        <div style={{ marginTop: 10 }}>
          <button onClick={detect} disabled={busy || !selSponsor || !text.trim()}
                  style={{ ...primaryBtn, opacity: busy || !selSponsor || !text.trim() ? 0.6 : 1 }}>
            {busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} Signale erkennen
          </button>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 12px' }}>Signal-Feed</h2>
      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : signals.length === 0 ? (
        <div style={muted}>Noch keine Signale.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {signals.map((s) => (
            <div key={s.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={chip}>{TYPE_LABEL[s.signal_type] || s.signal_type}</span>
                  <span style={{ fontSize: 13.5, color: 'var(--text-strong)', fontWeight: 500 }}>{s.summary}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  {sponsorName[s.sponsor_profile_id] || '—'} · {s.source} · {new Date(s.detected_at).toLocaleDateString('de-DE')}
                </div>
              </div>
              {s.score_delta > 0 && (
                <span style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>+{s.score_delta}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const card = { border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }
const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const chip = { fontSize: 11.5, fontWeight: 700, color: PRIMARY, background: 'color-mix(in srgb, var(--wl-primary, #0A6FB0) 12%, transparent)', border: '1px solid var(--border)', padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
const okBox = { padding: '10px 14px', borderRadius: 10, background: '#D1FAE5', color: '#065F46', fontSize: 13, marginBottom: 16 }
