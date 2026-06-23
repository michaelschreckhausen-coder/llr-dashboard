// Sponsoring OS — SOLL-Ziele (Phase 1)
// SOLL-Eingabe-Grid für sponsoring.targets (season, category, settlement, league_id, target_amount)
// mit Inline-Edit des Betrags + Anlegen-Zeile + Season-Filter.
//
// Liest/schreibt im Schema 'sponsoring' via supabase.schema('sponsoring').
// Ligen-Select aus sponsoring.leagues. team_id kommt aus useTeam().activeTeamId.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Target, Plus, Loader2, RefreshCw, Pencil, Trash2, X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')

const CATEGORY = ['werbeleistung', 'hospitality']
const CATEGORY_LABEL = { werbeleistung: 'Werbeleistung', hospitality: 'Hospitality' }
const SETTLEMENT = ['cash', 'barter']
const SETTLEMENT_LABEL = { cash: 'Cash', barter: 'Barter' }

const EMPTY_FORM = { season: '', category: 'werbeleistung', settlement: 'cash', league_id: '', target_amount: '' }

const fmtEur = (v) =>
  v == null || v === '' ? '—' : `${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`

export default function Ziele() {
  const { activeTeamId } = useTeam()
  const [targets, setTargets] = useState([])
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [seasonFilter, setSeasonFilter] = useState('')
  const [editId, setEditId] = useState(null)
  const [editAmount, setEditAmount] = useState('')

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [{ data: ts, error: tErr }, { data: lg, error: lErr }] = await Promise.all([
      sp().from('targets').select('*').eq('team_id', activeTeamId).order('season', { ascending: false }).order('created_at'),
      sp().from('leagues').select('id,name').eq('team_id', activeTeamId).order('sort_order').order('name'),
    ])
    if (tErr || lErr) { setError((tErr || lErr).message); setLoading(false); return }
    setTargets(ts || [])
    setLeagues(lg || [])
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const leagueName = useMemo(
    () => Object.fromEntries(leagues.map((l) => [l.id, l.name])),
    [leagues]
  )

  const seasons = useMemo(
    () => Array.from(new Set(targets.map((t) => t.season).filter(Boolean))).sort().reverse(),
    [targets]
  )

  const visibleTargets = useMemo(
    () => (seasonFilter ? targets.filter((t) => t.season === seasonFilter) : targets),
    [targets, seasonFilter]
  )

  async function createTarget(e) {
    e.preventDefault()
    if (!activeTeamId || !form.season.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('targets').insert({
      team_id: activeTeamId,
      season: form.season.trim(),
      category: form.category,
      settlement: form.settlement,
      league_id: form.league_id || null,
      target_amount: form.target_amount === '' ? null : Number(form.target_amount),
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setForm({ ...EMPTY_FORM, season: form.season })
    await fetchAll(); setBusy(false)
  }

  function startEdit(t) {
    setEditId(t.id)
    setEditAmount(t.target_amount == null ? '' : String(t.target_amount))
  }

  function cancelEdit() {
    setEditId(null)
    setEditAmount('')
  }

  async function saveAmount(id) {
    setBusy(true); setError(null)
    const { error: e } = await sp().from('targets')
      .update({
        target_amount: editAmount === '' ? null : Number(editAmount),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (e) { setError(e.message); setBusy(false); return }
    cancelEdit()
    await fetchAll(); setBusy(false)
  }

  // category / settlement sind CHECK-Felder → bewusst per-Row .eq() (kein .in()-Bulk).
  async function updateField(id, field, value) {
    const { error: e } = await sp().from('targets')
      .update({ [field]: value })
      .eq('id', id)
    if (e) { setError(e.message); return }
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)))
  }

  async function deleteTarget(id) {
    if (!window.confirm('Dieses Ziel wirklich löschen?')) return
    setBusy(true); setError(null)
    const { error: e } = await sp().from('targets').delete().eq('id', id)
    if (e) { setError(e.message); setBusy(false); return }
    if (editId === id) cancelEdit()
    await fetchAll(); setBusy(false)
  }

  if (!activeTeamId) {
    return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader overline="Sponsoring" title="SOLL-Ziele" subtitle="SOLL-Vorgaben pro Saison, Kategorie, Abwicklung und Liga. Diese Ziele dienen als Vergleichsbasis im Reporting." action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {seasons.length > 0 && (
            <select value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)} style={{ ...input, width: 'auto' }}>
              <option value="">Alle Saisons</option>
              {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button onClick={fetchAll} title="Aktualisieren" style={iconBtn}>
            <RefreshCw size={16} />
          </button>
        </div>
      } />

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Anlegen */}
      <form onSubmit={createTarget} style={{
        display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1.3fr 1fr auto', gap: 10, alignItems: 'end',
        border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16, marginBottom: 22,
      }}>
        <Field label="Saison">
          <input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })}
                 placeholder="z.B. 2026/27" style={input} />
        </Field>
        <Field label="Kategorie">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={input}>
            {CATEGORY.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="Abwicklung">
          <select value={form.settlement} onChange={(e) => setForm({ ...form, settlement: e.target.value })} style={input}>
            {SETTLEMENT.map((s) => <option key={s} value={s}>{SETTLEMENT_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Liga">
          <select value={form.league_id} onChange={(e) => setForm({ ...form, league_id: e.target.value })} style={input}>
            <option value="">— Alle / keine —</option>
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="SOLL-Betrag (€)">
          <input type="number" min="0" step="0.01" value={form.target_amount}
                 onChange={(e) => setForm({ ...form, target_amount: e.target.value })} placeholder="0" style={input} />
        </Field>
        <button type="submit" disabled={busy || !form.season.trim()} style={{ ...primaryBtn, opacity: busy || !form.season.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Anlegen
        </button>
      </form>

      {/* Ziele-Grid */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }}>
          <Loader2 size={16} className="spin" /> Lade Ziele…
        </div>
      ) : visibleTargets.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {seasonFilter ? 'Keine Ziele für diese Saison.' : 'Noch keine Ziele angelegt.'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={th}>Saison</th>
                <th style={th}>Kategorie</th>
                <th style={th}>Abwicklung</th>
                <th style={th}>Liga</th>
                <th style={{ ...th, textAlign: 'right' }}>SOLL-Betrag</th>
                <th style={{ ...th, textAlign: 'right' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {visibleTargets.map((t) => {
                const isEdit = editId === t.id
                return (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{t.season}</td>
                    <td style={td}>
                      <select value={t.category} onChange={(e) => updateField(t.id, 'category', e.target.value)}
                              style={{ ...input, padding: '4px 8px' }}>
                        {CATEGORY.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={t.settlement} onChange={(e) => updateField(t.id, 'settlement', e.target.value)}
                              style={{ ...input, padding: '4px 8px' }}>
                        {SETTLEMENT.map((s) => <option key={s} value={s}>{SETTLEMENT_LABEL[s]}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={t.league_id || ''} onChange={(e) => updateField(t.id, 'league_id', e.target.value || null)}
                              style={{ ...input, padding: '4px 8px' }}>
                        <option value="">— Alle / keine —</option>
                        {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        {t.league_id && !leagueName[t.league_id] && (
                          <option value={t.league_id}>{t.league_id}</option>
                        )}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {isEdit ? (
                        <input type="number" min="0" step="0.01" value={editAmount} autoFocus
                               onChange={(e) => setEditAmount(e.target.value)}
                               onKeyDown={(e) => { if (e.key === 'Enter') saveAmount(t.id); if (e.key === 'Escape') cancelEdit() }}
                               style={{ ...input, padding: '4px 8px', width: 120, textAlign: 'right' }} />
                      ) : (
                        <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{fmtEur(t.target_amount)}</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {isEdit ? (
                          <>
                            <button onClick={() => saveAmount(t.id)} disabled={busy}
                                    title="Speichern" style={{ ...iconBtn, color: '#059669' }}>
                              <Check size={15} />
                            </button>
                            <button onClick={cancelEdit} title="Abbrechen" style={iconBtn}>
                              <X size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(t)} title="Betrag bearbeiten" style={iconBtn}>
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => deleteTarget(t.id)} title="Löschen" style={{ ...iconBtn, color: '#DC2626' }}>
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
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

const input = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box',
}
const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999,
  border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer',
}
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
