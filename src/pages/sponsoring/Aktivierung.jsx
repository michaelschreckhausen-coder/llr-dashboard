// Sponsoring OS — Sponsorenaktivierung (Phase 2, Modul 6)
// Aktivierungsmassnahmen je Vertrag, Status-Board (geplant→Umsetzung→abgeschlossen→reportet).
// Schema 'sponsoring', team_id aus useTeam().

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Megaphone, Plus, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')

const STATUS = ['planned', 'in_progress', 'done', 'reported']
const STATUS_LABEL = { planned: 'Geplant', in_progress: 'In Umsetzung', done: 'Abgeschlossen', reported: 'Reportet' }
const STATUS_COLOR = { planned: '#6B7280', in_progress: '#D97706', done: '#2563EB', reported: '#059669' }
const TYPES = ['social_post', 'video', 'interview', 'hospitality', 'event', 'newsletter', 'content', 'other']
const TYPE_LABEL = { social_post: 'Social Post', video: 'Video', interview: 'Interview', hospitality: 'Hospitality', event: 'Event', newsletter: 'Newsletter', content: 'Content', other: 'Sonstiges' }

const EMPTY = { title: '', type: 'social_post', contract_id: '', scheduled_for: '', proof_url: '' }

export default function Aktivierung() {
  const { activeTeamId } = useTeam()
  const [acts, setActs] = useState([])
  const [contracts, setContracts] = useState([])
  const [sponsors, setSponsors] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY)

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [a, c, s] = await Promise.all([
      sp().from('activations').select('*').eq('team_id', activeTeamId).order('scheduled_for', { ascending: true, nullsFirst: false }),
      sp().from('contracts').select('id, sponsor_profile_id, package_id').eq('team_id', activeTeamId),
      sp().from('sponsor_profiles').select('id, name').eq('team_id', activeTeamId),
    ])
    const err = a.error || c.error || s.error
    if (err) { setError(err.message); setLoading(false); return }
    setActs(a.data || []); setContracts(c.data || []); setSponsors(s.data || [])
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const sponsorName = useMemo(() => Object.fromEntries(sponsors.map((s) => [s.id, s.name])), [sponsors])
  const contractLabel = useMemo(() => Object.fromEntries(
    contracts.map((c) => [c.id, sponsorName[c.sponsor_profile_id] || 'Vertrag']),
  ), [contracts, sponsorName])

  async function create(e) {
    e.preventDefault()
    if (!activeTeamId || !form.title.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('activations').insert({
      team_id: activeTeamId,
      title: form.title.trim(),
      type: form.type,
      contract_id: form.contract_id || null,
      scheduled_for: form.scheduled_for || null,
      proof_url: form.proof_url || null,
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setForm(EMPTY); await fetchAll(); setBusy(false)
  }

  async function move(id, status) {
    const { error: e } = await sp().from('activations')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) { setError(e.message); return }
    setActs((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
  }

  const byStatus = (st) => acts.filter((a) => a.status === st)

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <Megaphone size={26} color={PRIMARY} />
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>Aktivierung</h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', maxWidth: 660, lineHeight: 1.6 }}>
        Steuere die Aktivierung verkaufter Rechte — der häufigste Renewal-Killer ist nicht-aktiviertes Sponsoring.
      </p>

      {error && <div style={errBox}>{error}</div>}

      <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr 1fr auto', gap: 10, alignItems: 'end', ...card, marginBottom: 22 }}>
        <Field label="Maßnahme"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z.B. LinkedIn-Post zum Saisonstart" style={input} /></Field>
        <Field label="Typ">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={input}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Vertrag">
          <select value={form.contract_id} onChange={(e) => setForm({ ...form, contract_id: e.target.value })} style={input}>
            <option value="">— keiner —</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{contractLabel[c.id]}</option>)}
          </select>
        </Field>
        <Field label="Termin"><input type="date" value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} style={input} /></Field>
        <button type="submit" disabled={busy || !form.title.trim()} style={{ ...primaryBtn, opacity: busy || !form.title.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Anlegen
        </button>
      </form>

      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, alignItems: 'start' }}>
          {STATUS.map((st) => (
            <div key={st} style={{ background: 'var(--surface-muted, #F8FAFC)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, minHeight: 120 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: STATUS_COLOR[st] }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{STATUS_LABEL[st]}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {byStatus(st).length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {byStatus(st).map((a) => (
                  <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{a.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                      {TYPE_LABEL[a.type] || a.type}
                      {a.contract_id ? ` · ${contractLabel[a.contract_id] || ''}` : ''}
                      {a.scheduled_for ? ` · ${new Date(a.scheduled_for).toLocaleDateString('de-DE')}` : ''}
                    </div>
                    <select value={a.status} onChange={(e) => move(a.id, e.target.value)}
                            style={{ ...input, padding: '3px 6px', marginTop: 8, fontSize: 12, color: STATUS_COLOR[a.status], fontWeight: 600 }}>
                      {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
