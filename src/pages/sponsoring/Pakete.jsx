// Sponsoring OS — Paket-Builder (Phase 1, Modul 4)
// Pakete anlegen, Rechte zuordnen (M:N package_rights), Paketwert aus
// v_package_value. Schema 'sponsoring', team_id aus useTeam().

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Package, Plus, Loader2, ChevronDown, ChevronRight, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')
const TIERS = ['bronze', 'silber', 'gold', 'platin', 'custom']
const fmt = (n) => `${Number(n || 0).toLocaleString('de-DE')} €`

export default function Pakete() {
  const { activeTeamId } = useTeam()
  const [packages, setPackages] = useState([])
  const [values, setValues] = useState({})       // package_id -> v_package_value
  const [rights, setRights] = useState([])
  const [pkgRights, setPkgRights] = useState({}) // package_id -> Set(right_id)
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ name: '', tier: 'bronze', price: '' })

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [pk, vv, rs, prr] = await Promise.all([
      sp().from('packages').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('v_package_value').select('*').eq('team_id', activeTeamId),
      sp().from('rights').select('id, name, list_price, category_id').eq('team_id', activeTeamId).order('name'),
      sp().from('package_rights').select('package_id, right_id').eq('team_id', activeTeamId),
    ])
    const err = pk.error || vv.error || rs.error || prr.error
    if (err) { setError(err.message); setLoading(false); return }
    setPackages(pk.data || [])
    setValues(Object.fromEntries((vv.data || []).map((v) => [v.id, v])))
    setRights(rs.data || [])
    const map = {}
    ;(prr.data || []).forEach((r) => {
      ;(map[r.package_id] ||= new Set()).add(r.right_id)
    })
    setPkgRights(map)
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function createPackage(e) {
    e.preventDefault()
    if (!activeTeamId || !form.name.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('packages').insert({
      team_id: activeTeamId,
      name: form.name.trim(),
      tier: form.tier,
      price: form.price === '' ? null : Number(form.price),
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setForm({ name: '', tier: 'bronze', price: '' })
    await fetchAll(); setBusy(false)
  }

  async function toggleRight(pkgId, rightId) {
    const has = pkgRights[pkgId]?.has(rightId)
    if (has) {
      const { error: e } = await sp().from('package_rights')
        .delete().eq('package_id', pkgId).eq('right_id', rightId)
      if (e) { setError(e.message); return }
    } else {
      const { error: e } = await sp().from('package_rights')
        .insert({ team_id: activeTeamId, package_id: pkgId, right_id: rightId })
      if (e) { setError(e.message); return }
    }
    await fetchAll()
  }

  const rightName = useMemo(() => Object.fromEntries(rights.map((r) => [r.id, r])), [rights])

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="Sponsoring"
        title="Ebene Sponsorenpyramide"
        subtitle="Definiere die Ebenen deiner Sponsorenpyramide aus deinen Rechten. Der Wert summiert die Listenpreise der enthaltenen Rechte."
      />

      {error && <div style={errBox}>{error}</div>}

      <form onSubmit={createPackage} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'end', ...card, marginBottom: 22 }}>
        <Field label="Name der Ebene"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z.B. Gold" style={input} /></Field>
        <Field label="Ebene ab Euro (€, optional)"><input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="leer = Listenwert" style={input} /></Field>
        <button type="submit" disabled={busy || !form.name.trim()} style={{ ...primaryBtn, opacity: busy || !form.name.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Anlegen
        </button>
      </form>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}><Loader2 size={16} className="spin" /> Lade Ebenen…</div>
      ) : packages.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Noch keine Ebenen.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {packages.map((p) => {
            const v = values[p.id]
            const open = expanded === p.id
            const selected = pkgRights[p.id] || new Set()
            return (
              <div key={p.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                     onClick={() => setExpanded(open ? null : p.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>{p.name}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {v?.rights_count || 0} Rechte ·{' '}
                    <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                      {p.price != null ? fmt(p.price) : fmt(v?.rights_list_total)}
                    </span>
                    {p.price == null && <span> (Listenwert)</span>}
                  </div>
                </div>

                {open && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Rechte im Paket</div>
                    {rights.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Erst Rechte anlegen (Rechte &amp; Inventar).</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {rights.map((r) => {
                          const on = selected.has(r.id)
                          return (
                            <button key={r.id} onClick={() => toggleRight(p.id, r.id)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
                                border: '1px solid ' + (on ? PRIMARY : 'var(--border)'),
                                background: on ? PRIMARY : 'var(--surface)', color: on ? '#fff' : 'var(--text-strong)',
                                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                              }}>
                              {on ? <X size={12} /> : <Plus size={12} />}
                              {r.name}{r.list_price != null ? ` · ${fmt(r.list_price)}` : ''}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
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
const chip = { fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-muted, #F1F5F9)', border: '1px solid var(--border)', padding: '2px 9px', borderRadius: 999 }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
