// Sponsoring OS — Ligen-Verwaltung (Phase 1)
// CRUD auf sponsoring.leagues (name, short_code, sort_order) + Standard-Ligen-Seed.
//
// Liest/schreibt im Schema 'sponsoring' via supabase.schema('sponsoring').
// seed_sponsoring_leagues() ist eine public-RPC (KEIN sp()).
// team_id kommt aus useTeam().activeTeamId.

import { useEffect, useState, useCallback } from 'react'
import { Trophy, Plus, Loader2, RefreshCw, Pencil, Trash2, X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')

const EMPTY_FORM = { name: '', short_code: '', sort_order: 0 }

export default function Ligen() {
  const { activeTeamId } = useTeam()
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const { data, error: e } = await sp().from('leagues')
      .select('*')
      .eq('team_id', activeTeamId)
      .order('sort_order')
      .order('name')
    if (e) { setError(e.message); setLoading(false); return }
    setLeagues(data || [])
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function seedLeagues() {
    setBusy(true); setError(null)
    const { error: e } = await supabase.rpc('seed_sponsoring_leagues')
    if (e) setError(e.message)
    await fetchAll(); setBusy(false)
  }

  async function createLeague(e) {
    e.preventDefault()
    if (!activeTeamId || !form.name.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('leagues').insert({
      team_id: activeTeamId,
      name: form.name.trim(),
      short_code: form.short_code.trim() || null,
      sort_order: Number(form.sort_order) || 0,
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setForm(EMPTY_FORM)
    await fetchAll(); setBusy(false)
  }

  function startEdit(l) {
    setEditId(l.id)
    setEditForm({ name: l.name || '', short_code: l.short_code || '', sort_order: l.sort_order ?? 0 })
  }

  function cancelEdit() {
    setEditId(null)
    setEditForm(EMPTY_FORM)
  }

  async function saveEdit(id) {
    if (!editForm.name.trim()) return
    setBusy(true); setError(null)
    const { error: e } = await sp().from('leagues')
      .update({
        name: editForm.name.trim(),
        short_code: editForm.short_code.trim() || null,
        sort_order: Number(editForm.sort_order) || 0,
      })
      .eq('id', id)
    if (e) { setError(e.message); setBusy(false); return }
    cancelEdit()
    await fetchAll(); setBusy(false)
  }

  async function deleteLeague(id) {
    if (!window.confirm('Diese Liga wirklich löschen?')) return
    setBusy(true); setError(null)
    const { error: e } = await sp().from('leagues').delete().eq('id', id)
    if (e) { setError(e.message); setBusy(false); return }
    if (editId === id) cancelEdit()
    await fetchAll(); setBusy(false)
  }

  if (!activeTeamId) {
    return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader overline="Sponsoring" title="Ligen" subtitle="Ligen werden in Rechten, Verträgen und Reporting als Filter genutzt." action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={seedLeagues} disabled={busy} style={secondaryBtn}>
            {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Standard-Ligen anlegen
          </button>
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
      <form onSubmit={createLeague} style={{
        display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr auto', gap: 10, alignItems: 'end',
        border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16, marginBottom: 22,
      }}>
        <Field label="Name">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                 placeholder="z.B. 1. Bundesliga" style={input} />
        </Field>
        <Field label="Kürzel">
          <input value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value })}
                 placeholder="z.B. BL1" style={input} />
        </Field>
        <Field label="Sortierung">
          <input type="number" value={form.sort_order}
                 onChange={(e) => setForm({ ...form, sort_order: e.target.value })} style={input} />
        </Field>
        <button type="submit" disabled={busy || !form.name.trim()} style={{ ...primaryBtn, opacity: busy || !form.name.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Anlegen
        </button>
      </form>

      {/* Ligen-Liste */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }}>
          <Loader2 size={16} className="spin" /> Lade Ligen…
        </div>
      ) : leagues.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Noch keine Ligen angelegt.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={th}>Name</th>
                <th style={th}>Kürzel</th>
                <th style={th}>Sortierung</th>
                <th style={{ ...th, textAlign: 'right' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {leagues.map((l) => {
                const isEdit = editId === l.id
                return (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>
                      {isEdit ? (
                        <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                               style={{ ...input, padding: '4px 8px' }} />
                      ) : l.name}
                    </td>
                    <td style={td}>
                      {isEdit ? (
                        <input value={editForm.short_code} onChange={(e) => setEditForm({ ...editForm, short_code: e.target.value })}
                               style={{ ...input, padding: '4px 8px' }} />
                      ) : (l.short_code || '—')}
                    </td>
                    <td style={td}>
                      {isEdit ? (
                        <input type="number" value={editForm.sort_order}
                               onChange={(e) => setEditForm({ ...editForm, sort_order: e.target.value })}
                               style={{ ...input, padding: '4px 8px', width: 90 }} />
                      ) : (l.sort_order ?? 0)}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {isEdit ? (
                          <>
                            <button onClick={() => saveEdit(l.id)} disabled={busy || !editForm.name.trim()}
                                    title="Speichern" style={{ ...iconBtn, color: '#059669' }}>
                              <Check size={15} />
                            </button>
                            <button onClick={cancelEdit} title="Abbrechen" style={iconBtn}>
                              <X size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(l)} title="Bearbeiten" style={iconBtn}>
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => deleteLeague(l.id)} title="Löschen" style={{ ...iconBtn, color: '#DC2626' }}>
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
const secondaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer',
}
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
