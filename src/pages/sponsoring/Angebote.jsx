// Sponsoring OS — Angebote (Phase 1, Modul 4) + schlanke Sponsor-Verwaltung
// Sponsor anlegen, Angebot aus Paket + Rabatt erzeugen, Status pflegen.
// total_price = (Paket-Fixpreis | Listenwert) * (1 - Rabatt). Schema 'sponsoring'.
//
// Phase 5 (additiv):
//  - Cash/Barter-Split: total_price = value_cash + value_barter (abgeleitet).
//  - Einzelrechte ins Angebot (offer_rights) inkl. Auslastung aus v_inventory_load.
//  - Sponsor optional mit Leadesk-deal_id/lead_id verknuepfen (lose Refs).
//  - "Als PDF an Lead senden": STUB — echte PDF via Delivery-Unterbau folgt (P5).

import { Fragment, useEffect, useMemo, useState, useCallback } from 'react'
import { FileText, Plus, Loader2, UserPlus, ListPlus, Trash2, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')
const fmt = (n) => `${Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €`

const OFFER_STATUS = ['draft', 'sent', 'negotiation', 'accepted', 'declined']
const OFFER_LABEL = { draft: 'Entwurf', sent: 'Versendet', negotiation: 'Verhandlung', accepted: 'Angenommen', declined: 'Abgelehnt' }
const OFFER_COLOR = { draft: '#6B7280', sent: '#2563EB', negotiation: '#D97706', accepted: '#059669', declined: '#DC2626' }

// Defensiv: v_inventory_load-Spalten sind nicht garantiert stabil. Wir lesen die
// View per select('*') und mappen nur Felder die wir kennen (free_slots,
// utilization_pct, total_slots, sold_slots). Unbekannte Schemas → graceful null.
function inventoryLabel(row) {
  if (!row) return null
  const parts = []
  if (row.free_slots != null && row.total_slots != null) {
    parts.push(`${row.free_slots}/${row.total_slots} frei`)
  } else if (row.free_slots != null) {
    parts.push(`${row.free_slots} frei`)
  }
  if (row.utilization_pct != null) parts.push(`${row.utilization_pct}% ausgelastet`)
  return parts.length ? parts.join(' · ') : null
}

export default function Angebote() {
  const { activeTeamId } = useTeam()
  const [sponsors, setSponsors] = useState([])
  const [orgs, setOrgs] = useState([])
  const [packages, setPackages] = useState([])
  const [pkgValue, setPkgValue] = useState({})
  const [offers, setOffers] = useState([])
  const [rights, setRights] = useState([])
  const [inventory, setInventory] = useState({})   // right_id -> v_inventory_load row (defensiv)
  const [offerRights, setOfferRights] = useState({}) // offer_id -> [offer_rights rows]
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)        // Hinweis-Toast (z.B. PDF-Stub)
  const [sponsorForm, setSponsorForm] = useState({ name: '', industry: '', deal_id: '', lead_id: '' })
  const [offerForm, setOfferForm] = useState({ sponsor_profile_id: '', package_id: '', discount_pct: 0 })
  // Cash/Barter-Split — beide werden gespeichert, total_price = Summe (abgeleitet).
  const [valueCash, setValueCash] = useState('')
  const [valueBarter, setValueBarter] = useState('')
  // Einzelrecht-Picker je Angebot: offer_id -> { right_id, qty, unit_price }
  const [rightDraft, setRightDraft] = useState({})

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [spn, org, pk, vv, off, rts, inv, ofr] = await Promise.all([
      // sponsor_profiles ist 1:1-Extension zu public.organizations; Name lebt in organizations.name.
      sp().from('sponsor_profiles').select('id, organization_id').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      supabase.from('organizations').select('id, name').eq('team_id', activeTeamId),
      sp().from('packages').select('*').eq('team_id', activeTeamId).order('name'),
      sp().from('v_package_value').select('*').eq('team_id', activeTeamId),
      sp().from('offers').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('rights').select('id,name,unit,unit_price,list_price').eq('team_id', activeTeamId).order('name'),
      sp().from('v_inventory_load').select('*').eq('team_id', activeTeamId),
      sp().from('offer_rights').select('*').eq('team_id', activeTeamId),
    ])
    const err = spn.error || org.error || pk.error || vv.error || off.error || rts.error || inv.error || ofr.error
    if (err) { setError(err.message); setLoading(false); return }
    setSponsors(spn.data || [])
    setOrgs(org.data || [])
    setPackages(pk.data || [])
    setPkgValue(Object.fromEntries((vv.data || []).map((v) => [v.id, v])))
    setOffers(off.data || [])
    setRights(rts.data || [])
    setInventory(Object.fromEntries((inv.data || []).map((r) => [r.id, r])))
    const grouped = {}
    for (const r of ofr.data || []) { (grouped[r.offer_id] = grouped[r.offer_id] || []).push(r) }
    setOfferRights(grouped)
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Sponsorname aus organizations.name; gekeyt auf sponsor_profile_id (ext.id),
  // damit bestehende sponsorName[*.sponsor_profile_id]-Lookups unverändert greifen.
  const sponsorName = useMemo(() => {
    const orgName = Object.fromEntries(orgs.map((o) => [o.id, o.name]))
    return Object.fromEntries(sponsors.map((s) => [s.id, orgName[s.organization_id]]))
  }, [sponsors, orgs])
  const packageName = useMemo(() => Object.fromEntries(packages.map((p) => [p.id, p.name])), [packages])
  const rightName = useMemo(() => Object.fromEntries(rights.map((r) => [r.id, r])), [rights])

  // Cash/Barter-Regel: Gesamtsumme = value_cash + value_barter (abgeleitet/readonly).
  const offerTotal = useMemo(
    () => (Number(valueCash) || 0) + (Number(valueBarter) || 0),
    [valueCash, valueBarter]
  )

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

  // Komfort: bei Paket-/Rabatt-Wechsel den Paketwert als Cash vorbefuellen, solange
  // der User cash/barter noch nicht selbst angefasst hat (beide leer).
  useEffect(() => {
    if (valueCash === '' && valueBarter === '' && offerForm.package_id) {
      const v = Math.round(previewTotal * 100) / 100
      if (v > 0) setValueCash(String(v))
    }
  }, [previewTotal, offerForm.package_id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createSponsor(e) {
    e.preventDefault()
    if (!activeTeamId || !sponsorForm.name.trim()) return
    setBusy(true); setError(null)
    // Sponsor = Unternehmen (1:1-Extension): erst public.organizations anlegen,
    // dann die Extension via Helper-RPC (setzt organization_id NOT NULL korrekt).
    const { data: org, error: eOrg } = await supabase.from('organizations')
      .insert({ name: sponsorForm.name.trim(), team_id: activeTeamId }).select('id').single()
    if (eOrg) { setError(eOrg.message); setBusy(false); return }
    const { data: ext, error: eExt } = await supabase.rpc('get_or_create_sponsor_profile', { p_organization_id: org.id })
    if (eExt) { setError(eExt.message); setBusy(false); return }
    // Optionale Extension-Felder nachsetzen (industry bleibt Extension; deal_id/lead_id lose Refs).
    const patch = {}
    if (sponsorForm.industry) patch.industry = sponsorForm.industry
    if (sponsorForm.deal_id.trim()) patch.deal_id = sponsorForm.deal_id.trim()
    if (sponsorForm.lead_id.trim()) patch.lead_id = sponsorForm.lead_id.trim()
    const extId = Array.isArray(ext) ? ext[0]?.id : ext?.id
    if (extId && Object.keys(patch).length) {
      const { error: e3 } = await sp().from('sponsor_profiles').update(patch).eq('id', extId)
      if (e3) { setError(e3.message); setBusy(false); return }
    }
    setSponsorForm({ name: '', industry: '', deal_id: '', lead_id: '' })
    await fetchAll(); setBusy(false)
  }

  async function createOffer(e) {
    e.preventDefault()
    if (!activeTeamId || !offerForm.sponsor_profile_id || !offerForm.package_id) return
    setBusy(true); setError(null)
    // Cash/Barter-Regel: beide setzen, total_price = Summe (abgeleitet).
    const cash = Math.round((Number(valueCash) || 0) * 100) / 100
    const barter = Math.round((Number(valueBarter) || 0) * 100) / 100
    const total = Math.round((cash + barter) * 100) / 100
    const { error: e2 } = await sp().from('offers').insert({
      team_id: activeTeamId,
      sponsor_profile_id: offerForm.sponsor_profile_id,
      package_id: offerForm.package_id,
      discount_pct: Number(offerForm.discount_pct) || 0,
      value_cash: cash,
      value_barter: barter,
      total_price: total,
      status: 'draft',
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setOfferForm({ sponsor_profile_id: '', package_id: '', discount_pct: 0 })
    setValueCash(''); setValueBarter('')
    await fetchAll(); setBusy(false)
  }

  // Einzelrecht ins Angebot einpflegen. unit_price = Snapshot vom Recht (editierbar).
  async function addOfferRight(offerId) {
    const draft = rightDraft[offerId]
    if (!activeTeamId || !draft || !draft.right_id) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('offer_rights').insert({
      team_id: activeTeamId,
      offer_id: offerId,
      right_id: draft.right_id,
      qty: Math.max(1, Number(draft.qty) || 1),
      unit_price: draft.unit_price === '' || draft.unit_price == null ? null : Number(draft.unit_price),
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setRightDraft((prev) => ({ ...prev, [offerId]: { right_id: '', qty: 1, unit_price: '' } }))
    await fetchAll(); setBusy(false)
  }

  async function removeOfferRight(rowId) {
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('offer_rights').delete().eq('id', rowId)
    if (e2) { setError(e2.message); setBusy(false); return }
    await fetchAll(); setBusy(false)
  }

  // Snapshot-Preis vom gewaehlten Recht vorbefuellen (unit_price, sonst list_price).
  function pickRight(offerId, rightId) {
    const r = rightName[rightId]
    const snap = r ? (r.unit_price != null ? r.unit_price : r.list_price) : null
    setRightDraft((prev) => ({
      ...prev,
      [offerId]: { right_id: rightId, qty: prev[offerId]?.qty || 1, unit_price: snap != null ? String(snap) : '' },
    }))
  }

  // PDF-Versand an Lead — STUB. Echte PDF-Erzeugung ueber den Delivery-Unterbau
  // ist hier (Phase 5) NICHT verdrahtet. Button bleibt funktional, bricht nichts.
  async function sendPdfToLead(offer) {
    // TODO P5-Followup: echte PDF via Delivery-Unterbau + Versand an Lead
    setNotice('PDF-Versand folgt (Delivery-Unterbau)')
    setTimeout(() => setNotice(null), 4000)
  }

  async function updateOfferStatus(offerId, status) {
    const { error: e } = await sp().from('offers')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', offerId)
    if (e) { setError(e.message); return }
    setOffers((prev) => prev.map((o) => (o.id === offerId ? { ...o, status } : o)))
  }

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="Sponsoring"
        title="Angebote"
        subtitle="Lege Sponsoren an und erstelle Angebote aus deinen Paketen inkl. Rabatt."
      />

      {error && <div style={errBox}>{error}</div>}
      {notice && <div style={noticeBox}>{notice}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginBottom: 26, alignItems: 'start' }}>
        {/* Sponsor anlegen */}
        <form onSubmit={createSponsor} style={card}>
          <div style={cardTitle}><UserPlus size={16} color={PRIMARY} /> Sponsor anlegen</div>
          <Field label="Name"><input value={sponsorForm.name} onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })} placeholder="Firma GmbH" style={input} /></Field>
          <Field label="Branche (optional)"><input value={sponsorForm.industry} onChange={(e) => setSponsorForm({ ...sponsorForm, industry: e.target.value })} style={input} /></Field>
          <Field label="Leadesk-Deal-ID (optional)"><input value={sponsorForm.deal_id} onChange={(e) => setSponsorForm({ ...sponsorForm, deal_id: e.target.value })} placeholder="Deal aufgreifen — UUID" style={input} /></Field>
          <Field label="Leadesk-Lead-ID (optional)"><input value={sponsorForm.lead_id} onChange={(e) => setSponsorForm({ ...sponsorForm, lead_id: e.target.value })} placeholder="Lead verknüpfen — UUID" style={input} /></Field>
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
                {sponsors.map((s) => <option key={s.id} value={s.id}>{sponsorName[s.id] || '—'}</option>)}
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
            <Field label="Paket-Listenwert">
              <div style={{ ...input, display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                {fmt(previewTotal)}
              </div>
            </Field>
            <Field label="Cash-Wert (€)">
              <input type="number" min="0" step="0.01" value={valueCash}
                     onChange={(e) => setValueCash(e.target.value)} placeholder="0" style={input} />
            </Field>
            <Field label="Barter-Wert (€)">
              <input type="number" min="0" step="0.01" value={valueBarter}
                     onChange={(e) => setValueBarter(e.target.value)} placeholder="0" style={input} />
            </Field>
            <Field label="Gesamt (Cash + Barter)">
              <div style={{ ...input, display: 'flex', alignItems: 'center', fontWeight: 700, color: 'var(--text-strong)' }}>
                {fmt(offerTotal)}
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
                <th style={th}>Sponsor</th><th style={th}>Paket</th><th style={th}>Rabatt</th><th style={th}>Summe (Cash/Barter)</th><th style={th}>Status</th><th style={th}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => {
                const draft = rightDraft[o.id] || { right_id: '', qty: 1, unit_price: '' }
                const rows = offerRights[o.id] || []
                return (
                <Fragment key={o.id}>
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{sponsorName[o.sponsor_profile_id] || '—'}</td>
                  <td style={td}>{packageName[o.package_id] || '—'}</td>
                  <td style={td}>{o.discount_pct ? `${o.discount_pct}%` : '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {fmt(o.total_price)}
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-muted)' }}>
                      {fmt(o.value_cash)} Cash · {fmt(o.value_barter)} Barter
                    </div>
                  </td>
                  <td style={td}>
                    <select value={o.status} onChange={(e) => updateOfferStatus(o.id, e.target.value)}
                            style={{ ...input, padding: '4px 8px', color: OFFER_COLOR[o.status], fontWeight: 600 }}>
                      {OFFER_STATUS.map((s) => <option key={s} value={s}>{OFFER_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    <button type="button" onClick={() => sendPdfToLead(o)} style={ghostBtn} title="PDF an Lead senden (Delivery-Unterbau folgt)">
                      <Send size={13} /> Als PDF
                    </button>
                  </td>
                </tr>
                <tr style={{ borderTop: '1px dashed var(--border)', background: 'var(--surface-muted, #F8FAFC)' }}>
                  <td colSpan={6} style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>
                      <ListPlus size={14} color={PRIMARY} /> Einzelrechte im Angebot
                    </div>
                    {rows.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                        {rows.map((r) => {
                          const inv = inventory[r.right_id]
                          const invLbl = inventoryLabel(inv)
                          return (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-strong)', minWidth: 160 }}>
                                {rightName[r.right_id]?.name || '—'}
                              </span>
                              <span style={{ color: 'var(--text-muted)' }}>{r.qty}× · {fmt(r.unit_price)}/Einh.</span>
                              <span style={{ fontWeight: 600 }}>{fmt((Number(r.unit_price) || 0) * (Number(r.qty) || 0))}</span>
                              {invLbl && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>· {invLbl}</span>}
                              <button type="button" onClick={() => removeOfferRight(r.id)} style={{ ...ghostBtn, marginLeft: 'auto', padding: '3px 8px' }} title="Entfernen">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: '2 1 200px' }}>
                        <div style={miniLabel}>Recht</div>
                        <select value={draft.right_id} onChange={(e) => pickRight(o.id, e.target.value)} style={{ ...input, padding: '6px 8px' }}>
                          <option value="">— wählen —</option>
                          {rights.map((r) => {
                            const invLbl = inventoryLabel(inventory[r.id])
                            return <option key={r.id} value={r.id}>{r.name}{invLbl ? ` (${invLbl})` : ''}</option>
                          })}
                        </select>
                      </div>
                      <div style={{ flex: '0 0 80px' }}>
                        <div style={miniLabel}>Menge</div>
                        <input type="number" min="1" step="1" value={draft.qty}
                               onChange={(e) => setRightDraft((p) => ({ ...p, [o.id]: { ...draft, qty: e.target.value } }))}
                               style={{ ...input, padding: '6px 8px' }} />
                      </div>
                      <div style={{ flex: '0 0 120px' }}>
                        <div style={miniLabel}>Preis/Einh. (€)</div>
                        <input type="number" min="0" step="0.01" value={draft.unit_price}
                               onChange={(e) => setRightDraft((p) => ({ ...p, [o.id]: { ...draft, unit_price: e.target.value } }))}
                               style={{ ...input, padding: '6px 8px' }} />
                      </div>
                      <button type="button" disabled={busy || !draft.right_id} onClick={() => addOfferRight(o.id)}
                              style={{ ...primaryBtn, padding: '7px 12px', opacity: busy || !draft.right_id ? 0.6 : 1 }}>
                        <Plus size={13} /> Hinzufügen
                      </button>
                    </div>
                  </td>
                </tr>
                </Fragment>
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

const card = { border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }
const cardTitle = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }
const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
const noticeBox = { padding: '10px 14px', borderRadius: 10, background: '#DBEAFE', color: '#1E3A8A', fontSize: 13, marginBottom: 16 }
const ghostBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
const miniLabel = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3 }
