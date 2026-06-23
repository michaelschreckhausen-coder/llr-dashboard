// Sponsoring OS — Sponsoren-CRM + KI-Fit-Score (Phase 1, Modul 1+10)
// Liste mit fit_score-Badge, Anlegen, Detail-Drawer (editierbare CRM-Felder,
// read-only KI-Score, "KI-Score berechnen" via Edge Function score-sponsor).

import { useEffect, useState, useCallback } from 'react'
import { Building2, Plus, Loader2, Sparkles, X, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')

const STATUS = ['lead', 'contacted', 'qualified', 'offer', 'negotiation', 'won', 'lost']
const STATUS_LABEL = { lead: 'Lead', contacted: 'Kontaktiert', qualified: 'Qualifiziert', offer: 'Angebot', negotiation: 'Verhandlung', won: 'Gewonnen', lost: 'Verloren' }

const EDIT_FIELDS = [
  ['industry', 'Branche'], ['revenue_class', 'Umsatzklasse'], ['employee_count', 'Mitarbeiterzahl', 'number'],
  ['marketing_budget_class', 'Marketingbudget'], ['sport_affinity', 'Sport-Affinität'], ['region', 'Region'],
  ['website', 'Website'], ['linkedin_url', 'LinkedIn'],
]

function scoreColor(s) {
  if (s == null) return 'var(--text-muted)'
  if (s >= 70) return '#059669'
  if (s >= 40) return '#D97706'
  return '#DC2626'
}

export default function Sponsoren() {
  const { activeTeamId } = useTeam()
  const [sponsors, setSponsors] = useState([])
  const [stages, setStages] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState(null)
  const [newName, setNewName] = useState('')
  const [sel, setSel] = useState(null)     // ausgewählter Sponsor (Drawer)
  const [draft, setDraft] = useState({})

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [{ data, error: e }, { data: st, error: stErr }] = await Promise.all([
      sp().from('sponsor_profiles').select('*')
        .eq('team_id', activeTeamId).order('fit_score', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
      sp().from('sales_cycle_stages').select('*').eq('team_id', activeTeamId).order('stage'),
    ])
    if (e || stErr) { setError((e || stErr).message); setLoading(false); return }
    setSponsors(data || []); setStages(st || []); setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const stageLabel = (n) => {
    const s = stages.find((x) => x.stage === n)
    return s ? `${s.stage} · ${s.label}` : (n != null ? String(n) : '—')
  }

  async function seedCycle() {
    setSeeding(true); setError(null)
    const { error: e } = await supabase.rpc('seed_sponsoring_cycle')
    if (e) { setError(e.message); setSeeding(false); return }
    await fetchAll(); setSeeding(false)
  }

  function openDrawer(s) { setSel(s); setDraft(s) }

  async function createSponsor(e) {
    e.preventDefault()
    if (!activeTeamId || !newName.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('sponsor_profiles').insert({ team_id: activeTeamId, name: newName.trim() })
    if (e2) { setError(e2.message); setBusy(false); return }
    setNewName(''); await fetchAll(); setBusy(false)
  }

  async function saveDraft() {
    setBusy(true); setError(null)
    const patch = {
      name: draft.name, status: draft.status, notes: draft.notes || null,
      employee_count: draft.employee_count === '' || draft.employee_count == null ? null : Number(draft.employee_count),
      expected_value: draft.expected_value === '' || draft.expected_value == null ? null : Number(draft.expected_value),
      updated_at: new Date().toISOString(),
    }
    for (const [k] of EDIT_FIELDS) if (k !== 'employee_count') patch[k] = draft[k] || null
    const { error: e } = await sp().from('sponsor_profiles').update(patch).eq('id', sel.id)
    if (e) { setError(e.message); setBusy(false); return }
    // cycle_stage als einzelnes Feld separat per-Row updaten (kein Bundle → Silent-Fail-Schutz)
    const cs = draft.cycle_stage === '' || draft.cycle_stage == null ? null : Number(draft.cycle_stage)
    if (cs !== (sel.cycle_stage ?? null)) {
      const { error: e2 } = await sp().from('sponsor_profiles').update({ cycle_stage: cs }).eq('id', sel.id)
      if (e2) { setError(e2.message); setBusy(false); return }
    }
    setBusy(false); setSel(null); await fetchAll()
  }

  async function runScore() {
    setScoring(true); setError(null)
    const { data, error: e } = await supabase.functions.invoke('score-sponsor', {
      body: { sponsor_profile_id: sel.id },
    })
    if (e || data?.error) { setError(e?.message || data?.error); setScoring(false); return }
    setDraft((d) => ({ ...d, fit_score: data.score, fit_score_reasoning: { reasoning: data.reasoning } }))
    setScoring(false); await fetchAll()
  }

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Building2 size={26} color={PRIMARY} />
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>Sponsoren</h1>
        </div>
        <button onClick={fetchAll} title="Aktualisieren" style={iconBtn}><RefreshCw size={16} /></button>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', maxWidth: 640, lineHeight: 1.6 }}>
        Potenzielle und aktive Sponsoren mit KI-Fit-Score. Höchste Fit-Scores zuerst.
      </p>

      {error && <div style={errBox}>{error}</div>}

      <form onSubmit={createSponsor} style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Sponsor-Name" style={{ ...input, maxWidth: 320 }} />
        <button type="submit" disabled={busy || !newName.trim()} style={{ ...primaryBtn, opacity: busy || !newName.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Sponsor anlegen
        </button>
        {stages.length === 0 && (
          <button type="button" onClick={seedCycle} disabled={seeding} style={{ ...secondaryBtn, opacity: seeding ? 0.6 : 1 }}>
            {seeding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Standard-Zyklus anlegen
          </button>
        )}
      </form>

      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : sponsors.length === 0 ? (
        <div style={muted}>Noch keine Sponsoren.</div>
      ) : (
        <div style={tableWrap}>
          <table style={table}>
            <thead><tr style={trHead}>
              <th style={th}>Sponsor</th><th style={th}>Branche</th><th style={th}>Status</th><th style={th}>Zyklus</th><th style={th}>Erw. Wert</th><th style={th}>Fit-Score</th>
            </tr></thead>
            <tbody>
              {sponsors.map((s) => (
                <tr key={s.id} style={{ ...trBody, cursor: 'pointer' }} onClick={() => openDrawer(s)}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{s.name}</td>
                  <td style={td}>{s.industry || '—'}</td>
                  <td style={td}>{STATUS_LABEL[s.status] || s.status}</td>
                  <td style={td}>{stageLabel(s.cycle_stage)}</td>
                  <td style={td}>{s.expected_value != null ? `${Number(s.expected_value).toLocaleString('de-DE')} €` : '—'}</td>
                  <td style={td}>
                    <span style={{ fontWeight: 800, color: scoreColor(s.fit_score) }}>
                      {s.fit_score != null ? s.fit_score : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail-Drawer */}
      {sel && (
        <div style={overlay} onClick={() => !busy && !scoring && setSel(null)}>
          <div style={drawer} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <input value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                     style={{ ...input, fontSize: 17, fontWeight: 700, maxWidth: 280 }} />
              <button onClick={() => setSel(null)} style={iconBtn}><X size={16} /></button>
            </div>

            {/* KI-Score Block */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16, background: 'var(--surface-muted, #F8FAFC)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: scoreColor(draft.fit_score) }}>
                    {draft.fit_score != null ? draft.fit_score : '–'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ 100 Fit-Score</span>
                </div>
                <button onClick={runScore} disabled={scoring} style={{ ...primaryBtn, opacity: scoring ? 0.6 : 1 }}>
                  {scoring ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                  {scoring ? 'Bewerte…' : 'KI-Score berechnen'}
                </button>
              </div>
              {draft.fit_score_reasoning?.reasoning && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.55 }}>
                  {draft.fit_score_reasoning.reasoning}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                KI-autoritativ — nicht manuell editierbar.
              </div>
            </div>

            <Field label="Status">
              <select value={draft.status || 'lead'} onChange={(e) => setDraft({ ...draft, status: e.target.value })} style={input}>
                {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Vertriebszyklus">
                {stages.length === 0 ? (
                  <button type="button" onClick={seedCycle} disabled={seeding} style={{ ...secondaryBtn, width: '100%', justifyContent: 'center', opacity: seeding ? 0.6 : 1 }}>
                    {seeding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Standard-Zyklus anlegen
                  </button>
                ) : (
                  <select value={draft.cycle_stage ?? ''} onChange={(e) => setDraft({ ...draft, cycle_stage: e.target.value })} style={input}>
                    {draft.cycle_stage == null && <option value="">— keine —</option>}
                    {stages.map((s) => <option key={s.id} value={s.stage}>{s.stage} · {s.label}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Erwarteter Wert (€)">
                <input type="number" min="0" step="0.01" value={draft.expected_value ?? ''}
                       onChange={(e) => setDraft({ ...draft, expected_value: e.target.value })} placeholder="0" style={input} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {EDIT_FIELDS.map(([key, label, type]) => (
                <Field key={key} label={label}>
                  <input type={type || 'text'} value={draft[key] ?? ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} style={input} />
                </Field>
              ))}
            </div>

            <Field label="Notizen">
              <textarea value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3} style={{ ...input, resize: 'vertical' }} />
            </Field>

            <button onClick={saveDraft} disabled={busy} style={{ ...primaryBtn, marginTop: 14, width: '100%', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={14} className="spin" /> : null} Speichern
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const tableWrap = { border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }
const trHead = { background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }
const trBody = { borderTop: '1px solid var(--border)' }
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }
const drawer = { width: 'min(480px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: 24, boxShadow: '-12px 0 40px rgba(0,0,0,0.18)' }
