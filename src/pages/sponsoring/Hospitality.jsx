// Sponsoring OS — Hospitality-Management (Phase 2, Modul 7)
// Assets (Logen/Business-Seats/VIP/Events) + Gästeverwaltung mit Check-in/No-Show.
// Auslastung & No-Show-Rate aus v_hospitality_load. Schema 'sponsoring'.

import { useEffect, useState, useCallback } from 'react'
import { Ticket, Plus, Loader2, UserPlus, Check, UserX } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')

const TYPES = ['vip_card', 'business_seat', 'loge', 'event']
const TYPE_LABEL = { vip_card: 'VIP-Karte', business_seat: 'Business Seat', loge: 'Loge', event: 'Event' }

export default function Hospitality() {
  const { activeTeamId } = useTeam()
  const [assets, setAssets] = useState([])
  const [load, setLoad] = useState({})
  const [guests, setGuests] = useState({})    // asset_id -> guests[]
  const [open, setOpen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [aForm, setAForm] = useState({ name: '', type: 'loge', capacity: 0, event_date: '' })
  const [guestName, setGuestName] = useState('')

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [a, v] = await Promise.all([
      sp().from('hospitality_assets').select('*').eq('team_id', activeTeamId).order('event_date', { ascending: true, nullsFirst: false }),
      sp().from('v_hospitality_load').select('*').eq('team_id', activeTeamId),
    ])
    if (a.error || v.error) { setError((a.error || v.error).message); setLoading(false); return }
    setAssets(a.data || [])
    setLoad(Object.fromEntries((v.data || []).map((r) => [r.id, r])))
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const loadGuests = useCallback(async (assetId) => {
    const { data, error: e } = await sp().from('hospitality_guests').select('*').eq('asset_id', assetId).order('created_at')
    if (e) { setError(e.message); return }
    setGuests((g) => ({ ...g, [assetId]: data || [] }))
  }, [])

  function toggleOpen(id) {
    const nx = open === id ? null : id
    setOpen(nx)
    if (nx && !guests[nx]) loadGuests(nx)
  }

  async function createAsset(e) {
    e.preventDefault()
    if (!activeTeamId || !aForm.name.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('hospitality_assets').insert({
      team_id: activeTeamId, name: aForm.name.trim(), type: aForm.type,
      capacity: Number(aForm.capacity) || 0, event_date: aForm.event_date || null,
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setAForm({ name: '', type: 'loge', capacity: 0, event_date: '' })
    await fetchAll(); setBusy(false)
  }

  async function addGuest(assetId) {
    if (!guestName.trim()) return
    const { error: e } = await sp().from('hospitality_guests')
      .insert({ team_id: activeTeamId, asset_id: assetId, guest_name: guestName.trim(), invited: true })
    if (e) { setError(e.message); return }
    setGuestName(''); await loadGuests(assetId); await fetchAll()
  }

  async function patchGuest(assetId, guest, patch) {
    const { error: e } = await sp().from('hospitality_guests').update(patch).eq('id', guest.id)
    if (e) { setError(e.message); return }
    await loadGuests(assetId); await fetchAll()
  }

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <Ticket size={26} color={PRIMARY} />
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>Hospitality</h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', maxWidth: 660, lineHeight: 1.6 }}>
        Verwalte Logen, Business-Seats und VIP-Kontingente inkl. Gästeliste, Check-in und No-Show-Quote.
      </p>

      {error && <div style={errBox}>{error}</div>}

      <form onSubmit={createAsset} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 1fr auto', gap: 10, alignItems: 'end', ...card, marginBottom: 22 }}>
        <Field label="Name"><input value={aForm.name} onChange={(e) => setAForm({ ...aForm, name: e.target.value })} placeholder="z.B. Loge Nord" style={input} /></Field>
        <Field label="Typ">
          <select value={aForm.type} onChange={(e) => setAForm({ ...aForm, type: e.target.value })} style={input}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Kapazität"><input type="number" min="0" value={aForm.capacity} onChange={(e) => setAForm({ ...aForm, capacity: e.target.value })} style={input} /></Field>
        <Field label="Event-Datum"><input type="date" value={aForm.event_date} onChange={(e) => setAForm({ ...aForm, event_date: e.target.value })} style={input} /></Field>
        <button type="submit" disabled={busy || !aForm.name.trim()} style={{ ...primaryBtn, opacity: busy || !aForm.name.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Anlegen
        </button>
      </form>

      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : assets.length === 0 ? (
        <div style={muted}>Noch keine Hospitality-Assets.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {assets.map((a) => {
            const l = load[a.id]
            const isOpen = open === a.id
            return (
              <div key={a.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => toggleOpen(a.id)}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {TYPE_LABEL[a.type] || a.type}{a.event_date ? ` · ${new Date(a.event_date).toLocaleDateString('de-DE')}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                    <Stat label="Belegt" value={`${l?.guests || 0}/${a.capacity}`} />
                    <Stat label="Check-in" value={l?.checked_in || 0} />
                    <Stat label="No-Show" value={l?.no_show_rate != null ? `${l.no_show_rate}%` : '—'} color={l?.no_show_rate > 20 ? '#DC2626' : undefined} />
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Gastname"
                             onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest(a.id) } }} style={{ ...input, maxWidth: 260 }} />
                      <button onClick={() => addGuest(a.id)} style={secondaryBtn}><UserPlus size={14} /> Gast hinzufügen</button>
                    </div>
                    {(guests[a.id] || []).length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Noch keine Gäste.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(guests[a.id] || []).map((g) => (
                          <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>{g.guest_name}</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Toggle active={g.checked_in} color="#059669" icon={Check} label="Check-in"
                                      onClick={() => patchGuest(a.id, g, { checked_in: !g.checked_in, no_show: false })} />
                              <Toggle active={g.no_show} color="#DC2626" icon={UserX} label="No-Show"
                                      onClick={() => patchGuest(a.id, g, { no_show: !g.no_show, checked_in: false })} />
                            </div>
                          </div>
                        ))}
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

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: color || 'var(--text-strong)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

function Toggle({ active, color, icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} title={label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999,
      border: '1px solid ' + (active ? color : 'var(--border)'),
      background: active ? color : 'var(--surface)', color: active ? '#fff' : 'var(--text-muted)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
    }}>
      <Icon size={12} /> {label}
    </button>
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
const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
