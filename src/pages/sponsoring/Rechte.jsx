// Sponsoring OS — Rechte- & Inventar-Management (Phase 1, Modul 2+3)
// Kategorien + Rechte-Liste mit Auslastung (v_inventory_load), Anlegen,
// Status-Edit (per .eq(), nie .in()-Bulk → silent-fail-Schutz).
//
// Liest/schreibt im Schema 'sponsoring' via supabase.schema('sponsoring').
// team_id kommt aus useTeam().activeTeamId.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Layers, Plus, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')

const STATUS = ['free', 'reserved', 'offered', 'sold', 'expired']
const STATUS_LABEL = {
  free: 'Frei', reserved: 'Reserviert', offered: 'Angeboten', sold: 'Verkauft', expired: 'Abgelaufen',
}
const STATUS_COLOR = {
  free: '#059669', reserved: '#D97706', offered: '#2563EB', sold: '#7C3AED', expired: '#6B7280',
}

const UNITS = ['Stück', 'Meter', 'Minute', 'Pauschal']

const EMPTY_FORM = { name: '', category_id: '', list_price: '', total_slots: 1, status: 'free', unit: '', unit_price: '', league_id: '' }

export default function Rechte() {
  const { activeTeamId } = useTeam()
  const [categories, setCategories] = useState([])
  const [leagues, setLeagues] = useState([])
  const [rights, setRights] = useState([])
  const [load, setLoad] = useState({})       // right_id -> v_inventory_load row
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [leagueFilter, setLeagueFilter] = useState('')   // '' = alle, 'none' = ohne Liga, sonst league_id

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [{ data: cats, error: cErr }, { data: lgs, error: gErr }, { data: rs, error: rErr }, { data: ld, error: lErr }] = await Promise.all([
      sp().from('rights_categories').select('*').eq('team_id', activeTeamId).order('sort_order'),
      sp().from('leagues').select('id,name').eq('team_id', activeTeamId).order('sort_order'),
      sp().from('rights').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('v_inventory_load').select('*').eq('team_id', activeTeamId),
    ])
    if (cErr || gErr || rErr || lErr) { setError((cErr || gErr || rErr || lErr).message); setLoading(false); return }
    setCategories(cats || [])
    setLeagues(lgs || [])
    setRights(rs || [])
    setLoad(Object.fromEntries((ld || []).map((r) => [r.id, r])))
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const catName = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  )

  const leagueName = useMemo(
    () => Object.fromEntries(leagues.map((l) => [l.id, l.name])),
    [leagues]
  )

  const visibleRights = useMemo(() => {
    if (!leagueFilter) return rights
    if (leagueFilter === 'none') return rights.filter((r) => !r.league_id)
    return rights.filter((r) => r.league_id === leagueFilter)
  }, [rights, leagueFilter])

  async function seedCategories() {
    setBusy(true); setError(null)
    const { error: e } = await supabase.rpc('seed_sponsoring_categories')
    if (e) setError(e.message)
    await fetchAll(); setBusy(false)
  }

  async function createRight(e) {
    e.preventDefault()
    if (!activeTeamId || !form.name.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('rights').insert({
      team_id: activeTeamId,
      name: form.name.trim(),
      category_id: form.category_id || null,
      list_price: form.list_price === '' ? null : Number(form.list_price),
      total_slots: Number(form.total_slots) || 0,
      status: form.status,
      unit: form.unit || null,
      unit_price: form.unit_price === '' ? null : Number(form.unit_price),
      league_id: form.league_id || null,
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setForm(EMPTY_FORM)
    await fetchAll(); setBusy(false)
  }

  async function updateStatus(rightId, status) {
    // bewusst per-Row .eq() (kein .in()-Bulk → CHECK-Status-silent-fail vermeiden)
    const { error: e } = await sp().from('rights')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', rightId)
    if (e) { setError(e.message); return }
    setRights((prev) => prev.map((r) => (r.id === rightId ? { ...r, status } : r)))
  }

  if (!activeTeamId) {
    return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Layers size={26} color={PRIMARY} />
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>
            Rechte & Inventar
          </h1>
        </div>
        <button onClick={fetchAll} title="Aktualisieren" style={iconBtn}>
          <RefreshCw size={16} />
        </button>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', maxWidth: 640, lineHeight: 1.6 }}>
        Verwalte vermarktbare Rechte (Stadion, Trikot, Hospitality, Digital …) inkl. Inventar-Slots und Auslastung.
      </p>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Kategorien */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {categories.map((c) => (
            <span key={c.id} style={chip}>{c.name}</span>
          ))}
          {categories.length === 0 && (
            <button onClick={seedCategories} disabled={busy} style={secondaryBtn}>
              {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Standard-Kategorien anlegen
            </button>
          )}
        </div>
      </div>

      {/* Anlegen */}
      <form onSubmit={createRight} style={{
        display: 'grid', gridTemplateColumns: '2fr 1.3fr 1fr 0.8fr auto', gap: 10, alignItems: 'end',
        border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16, marginBottom: 22,
      }}>
        <Field label="Name">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                 placeholder="z.B. LED Bande" style={input} />
        </Field>
        <Field label="Kategorie">
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} style={input}>
            <option value="">— keine —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Listenpreis (€)">
          <input type="number" min="0" step="0.01" value={form.list_price}
                 onChange={(e) => setForm({ ...form, list_price: e.target.value })} placeholder="0" style={input} />
        </Field>
        <Field label="Slots">
          <input type="number" min="0" value={form.total_slots}
                 onChange={(e) => setForm({ ...form, total_slots: e.target.value })} style={input} />
        </Field>
        <button type="submit" disabled={busy || !form.name.trim()} style={{ ...primaryBtn, opacity: busy || !form.name.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Anlegen
        </button>

        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr', gap: 10 }}>
          <Field label="Einheit">
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={input}>
              <option value="">— keine —</option>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Preis je Einheit (€)">
            <input type="number" min="0" step="0.01" value={form.unit_price}
                   onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="0" style={input} />
          </Field>
          <Field label="Liga">
            <select value={form.league_id} onChange={(e) => setForm({ ...form, league_id: e.target.value })} style={input}>
              <option value="">— keine —</option>
              {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        </div>
      </form>

      {/* Liga-Filter */}
      {leagues.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Liga:</span>
          <select value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)}
                  style={{ ...input, width: 'auto', minWidth: 180 }}>
            <option value="">Alle</option>
            <option value="none">Ohne Liga</option>
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {/* Rechte-Liste */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }}>
          <Loader2 size={16} className="spin" /> Lade Rechte…
        </div>
      ) : visibleRights.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {rights.length === 0 ? 'Noch keine Rechte angelegt.' : 'Keine Rechte für diese Liga.'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={th}>Recht</th>
                <th style={th}>Kategorie</th>
                <th style={th}>Liga</th>
                <th style={th}>Listenpreis</th>
                <th style={th}>Einheit / Preis</th>
                <th style={th}>Auslastung</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleRights.map((r) => {
                const l = load[r.id]
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{r.name}</td>
                    <td style={td}>{catName[r.category_id] || '—'}</td>
                    <td style={td}>{leagueName[r.league_id] || '—'}</td>
                    <td style={td}>{r.list_price != null ? `${Number(r.list_price).toLocaleString('de-DE')} €` : '—'}</td>
                    <td style={td}>
                      {r.unit
                        ? `${r.unit_price != null ? `${Number(r.unit_price).toLocaleString('de-DE')} €` : '—'} / ${r.unit}`
                        : '—'}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 90, height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ width: `${l?.utilization_pct || 0}%`, height: '100%', background: PRIMARY }} />
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {l ? `${l.sold_slots}/${l.total_slots}` : `0/${r.total_slots}`}
                        </span>
                      </div>
                    </td>
                    <td style={td}>
                      <select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)}
                              style={{ ...input, padding: '4px 8px', color: STATUS_COLOR[r.status], fontWeight: 600 }}>
                        {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
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
const secondaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer',
}
const chip = {
  fontSize: 12.5, fontWeight: 600, color: 'var(--text-strong)', background: 'var(--surface-muted, #F1F5F9)',
  border: '1px solid var(--border)', padding: '4px 12px', borderRadius: 999,
}
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
