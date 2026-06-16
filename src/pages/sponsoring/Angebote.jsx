// Sponsoring OS — Angebote (Phase 1, Modul 4) + schlanke Sponsor-Verwaltung
// Sponsor anlegen, Angebot aus Paket + Rabatt erzeugen, Status pflegen.
// total_price = (Paket-Fixpreis | Listenwert) * (1 - Rabatt). Schema 'sponsoring'.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { FileText, Plus, Loader2, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')
const fmt = (n) => `${Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €`

const OFFER_STATUS = ['draft', 'sent', 'negotiation', 'accepted', 'declined']
const OFFER_LABEL = { draft: 'Entwurf', sent: 'Versendet', negotiation: 'Verhandlung', accepted: 'Angenommen', declined: 'Abgelehnt' }
const OFFER_COLOR = { draft: '#6B7280', sent: '#2563EB', negotiation: '#D97706', accepted: '#059669', declined: '#DC2626' }

export default function Angebote() {
  const { activeTeamId } = useTeam()
  const [sponsors, setSponsors] = useState([])
  const [packages, setPackages] = useState([])
  const [pkgValue, setPkgValue] = useState({})
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sponsorForm, setSponsorForm] = useState({ name: '', industry: '' })
  const [offerForm, setOfferForm] = useState({ sponsor_profile_id: '', package_id: '', discount_pct: 0 })

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [spn, pk, vv, off] = await Promise.all([
      sp().from('sponsor_profiles').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('packages').select('*').eq('team_id', activeTeamId).order('name'),
      sp().from('v_package_value').select('*').eq('team_id', activeTeamId),
      sp().from('offers').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
    ])
    const err = spn.error || pk.error || vv.error || off.error
    if (err) { setError(err.message); setLoading(false); return }
    setSponsors(spn.data || [])
    setPackages(pk.data || [])
    setPkgValue(Object.fromEntries((vv.data || []).map((v) => [v.id, v])))
    setOffers(off.data || [])
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const sponsorName = useMemo(() => Object.fromEntries(sponsors.map((s) => [s.id, s.name])), [sponsors])
  const packageName = useMemo(() => Object.fromEntries(packages.map((p) => [p.id, p.name])), [packages])

  function packageBase(pkgId) {
    const p = packages.find((x) => x.id === pkgId)
    if (!p) return 0
    return p.price != null ? Number(p.price) : Number(pkgValue[pkgId]?.rights_list_total || 0)
  }

  const previewTotal = useMemo(() => {
    const base = packageBase(offerForm.package_id)
    const d = Number(offerForm.discount_pct) || 0
    return base * (1 - d / 100)
  }, [offerForm, packages, pkgValue])

  async function createSponsor(e) {
    e.preventDefault()
    if (!activeTeamId || !sponsorForm.name.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('sponsor_profiles').insert({
      team_id: activeTeamId, name: sponsorForm.name.trim(), industry: sponsorForm.industry || null,
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setSponsorForm({ name: '', industry: '' })
    await fetchAll(); setBusy(false)
  }

  async function createOffer(e) {
    e.preventDefault()
    if (!activeTeamId || !offerForm.sponsor_profile_id || !offerForm.package_id) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('offers').insert({
      team_id: activeTeamId,
      sponsor_profile_id: offerForm.sponsor_profile_id,
      package_id: offerForm.package_id,
      discount_pct: Number(offerForm.discount_pct) || 0,
      total_price: Math.round(previewTotal * 100) / 100,
      status: 'draft',
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setOfferForm({ sponsor_profile_id: '', package_id: '', discount_pct: 0 })
    await fetchAll(); setBusy(false)
  }

  async function updateOfferStatus(offerId, status) {
    const { error: e } = await sp().from('offers')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', offerId)
    if (e) { setError(e.message); return }
    setOffers((prev) => prev.map((o) => (o.id === offerId ? { ...o, status } : o)))
  }

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ padding: 32, maxWidth: 1050, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <FileText size={26} color={PRIMARY} />
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>Angebote</h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', maxWidth: 640, lineHeight: 1.6 }}>
        Lege Sponsoren an und erstelle Angebote aus deinen Paketen inkl. Rabatt.
      </p>

      {error && <div style={errBox}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginBottom: 26, alignItems: 'start' }}>
        {/* Sponsor anlegen */}
        <form onSubmit={createSponsor} style={card}>
          <div style={cardTitle}><UserPlus size={16} color={PRIMARY} /> Sponsor anlegen</div>
          <Field label="Name"><input value={sponsorForm.name} onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })} placeholder="Firma GmbH" style={input} /></Field>
          <Field label="Branche (optional)"><input value={sponsorForm.industry} onChange={(e) => setSponsorForm({ ...sponsorForm, industry: e.target.value })} style={input} /></Field>
          <button type="submit" disabled={busy || !sponsorForm.name.trim()} style={{ ...primaryBtn, marginTop: 10, opacity: busy || !sponsorForm.name.trim() ? 0.6 : 1 }}>
            {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Sponsor anlegen
          </button>
        </form>

        {/* Angebot erstellen */}
        <form onSubmit={createOffer} style={card}>
          <div style={cardTitle}><FileText size={16} color={PRIMARY} /> Angebot erstellen</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Sponsor">
              <select value={offerForm.sponsor_profile_id} onChange={(e) => setOfferForm({ ...offerForm, sponsor_profile_id: e.target.value })} style={input}>
                <option value="">— wählen —</option>
                {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Paket">
              <select value={offerForm.package_id} onChange={(e) => setOfferForm({ ...offerForm, package_id: e.target.value })} style={input}>
                <option value="">— wählen —</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Rabatt (%)">
              <input type="number" min="0" max="100" step="1" value={offerForm.discount_pct}
                     onChange={(e) => setOfferForm({ ...offerForm, discount_pct: e.target.value })} style={input} />
            </Field>
            <Field label="Angebotssumme">
              <div style={{ ...input, display: 'flex', alignItems: 'center', fontWeight: 700, color: 'var(--text-strong)' }}>
                {fmt(previewTotal)}
              </div>
            </Field>
          </div>
          <button type="submit" disabled={busy || !offerForm.sponsor_profile_id || !offerForm.package_id}
                  style={{ ...primaryBtn, marginTop: 12, opacity: busy || !offerForm.sponsor_profile_id || !offerForm.package_id ? 0.6 : 1 }}>
            {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Angebot erstellen
          </button>
        </form>
      </div>

      {/* Angebots-Liste */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 12px' }}>Angebote</h2>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : offers.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Noch keine Angebote.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={th}>Sponsor</th><th style={th}>Paket</th><th style={th}>Rabatt</th><th style={th}>Summe</th><th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{sponsorName[o.sponsor_profile_id] || '—'}</td>
                  <td style={td}>{packageName[o.package_id] || '—'}</td>
                  <td style={td}>{o.discount_pct ? `${o.discount_pct}%` : '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(o.total_price)}</td>
                  <td style={td}>
                    <select value={o.status} onChange={(e) => updateOfferStatus(o.id, e.target.value)}
                            style={{ ...input, padding: '4px 8px', color: OFFER_COLOR[o.status], fontWeight: 600 }}>
                      {OFFER_STATUS.map((s) => <option key={s} value={s}>{OFFER_LABEL[s]}</option>)}
                    </select>
                  </td>
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

const card = { border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }
const cardTitle = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }
const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
