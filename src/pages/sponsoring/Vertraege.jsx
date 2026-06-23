// Sponsoring OS — Vertragsmanagement (Phase 1, Modul 5)
// Offene Angebote -> Vertrag (RPC accept_offer, bucht Inventar). Vertragsliste
// mit Laufzeit/Status. Schema 'sponsoring', team_id aus useTeam().

import { useEffect, useMemo, useState, useCallback } from 'react'
import { ScrollText, Loader2, ArrowRight, X, Pencil, FileDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')
const fmt = (n) => `${Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €`
const dateStr = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—')

const CTR_STATUS = ['active', 'expiring', 'renewed', 'churned', 'expired']
const CTR_LABEL = { active: 'Aktiv', expiring: 'Läuft aus', renewed: 'Verlängert', churned: 'Gekündigt', expired: 'Abgelaufen' }
const CTR_COLOR = { active: '#059669', expiring: '#D97706', renewed: '#2563EB', churned: '#DC2626', expired: '#6B7280' }

// Angebote, die noch in einen Vertrag wandern können
const OPEN_OFFER = ['draft', 'sent', 'negotiation']

// Edit-Form-Defaults für die Zusatzfelder (Phase 5).
const EMPTY_EDIT = {
  invoice_date: '', auto_renew: false, auto_renew_date: '',
  league_id: '', value_cash: 0, value_barter: 0, industry: '',
}

// CASH/BARTER-REGEL: total_price ist IMMER die abgeleitete Summe.
const sumCashBarter = (cash, barter) => (Number(cash) || 0) + (Number(barter) || 0)

export default function Vertraege() {
  const { activeTeamId } = useTeam()
  const [offers, setOffers] = useState([])
  const [contracts, setContracts] = useState([])
  const [sponsors, setSponsors] = useState([])
  const [packages, setPackages] = useState([])
  const [leagues, setLeagues] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [convert, setConvert] = useState(null)  // offer being converted
  const [cf, setCf] = useState({ starts_on: '', ends_on: '', notice_period_days: 90 })
  const [edit, setEdit] = useState(null)        // contract being edited
  const [ef, setEf] = useState(EMPTY_EDIT)      // edit-form state
  const [exportC, setExportC] = useState(null)  // contract being exported
  const [leagueFilter, setLeagueFilter] = useState('') // '' = alle

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [off, ctr, spn, pk, lg, tpl] = await Promise.all([
      sp().from('offers').select('*').eq('team_id', activeTeamId).in('status', OPEN_OFFER).order('created_at', { ascending: false }),
      sp().from('contracts').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('sponsor_profiles').select('id, name').eq('team_id', activeTeamId),
      sp().from('packages').select('id, name').eq('team_id', activeTeamId),
      sp().from('leagues').select('id, name').eq('team_id', activeTeamId).order('sort_order', { ascending: true }),
      sp().from('contract_templates').select('*').eq('team_id', activeTeamId).order('is_default', { ascending: false }),
    ])
    const err = off.error || ctr.error || spn.error || pk.error || lg.error || tpl.error
    if (err) { setError(err.message); setLoading(false); return }
    setOffers(off.data || [])
    setContracts(ctr.data || [])
    setSponsors(spn.data || [])
    setPackages(pk.data || [])
    setLeagues(lg.data || [])
    setTemplates(tpl.data || [])
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const sponsorName = useMemo(() => Object.fromEntries(sponsors.map((s) => [s.id, s.name])), [sponsors])
  const packageName = useMemo(() => Object.fromEntries(packages.map((p) => [p.id, p.name])), [packages])
  const leagueName = useMemo(() => Object.fromEntries(leagues.map((l) => [l.id, l.name])), [leagues])

  // Liga-Filter auf die Vertragsliste (rein clientseitig, bewahrt fetchAll).
  const visibleContracts = useMemo(() => (
    leagueFilter ? contracts.filter((c) => (c.league_id || '') === leagueFilter) : contracts
  ), [contracts, leagueFilter])

  async function doConvert(e) {
    e.preventDefault()
    if (!convert) return
    setBusy(true); setError(null)
    const { error: e2 } = await supabase.rpc('accept_offer', {
      p_offer_id: convert.id,
      p_starts_on: cf.starts_on || null,
      p_ends_on: cf.ends_on || null,
      p_notice_period_days: Number(cf.notice_period_days) || null,
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setConvert(null)
    setCf({ starts_on: '', ends_on: '', notice_period_days: 90 })
    await fetchAll(); setBusy(false)
  }

  async function updateStatus(id, status) {
    const { error: e } = await sp().from('contracts')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) { setError(e.message); return }
    setContracts((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
  }

  // --- Phase 5: Zusatzfelder bearbeiten ---------------------------------------
  function openEdit(c) {
    setEdit(c)
    setEf({
      invoice_date: c.invoice_date || '',
      auto_renew: !!c.auto_renew,
      auto_renew_date: c.auto_renew_date || '',
      league_id: c.league_id || '',
      value_cash: c.value_cash != null ? c.value_cash : (c.total_price || 0),
      value_barter: c.value_barter != null ? c.value_barter : 0,
      industry: c.industry || '',
    })
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!edit) return
    setBusy(true); setError(null)
    const cash = Number(ef.value_cash) || 0
    const barter = Number(ef.value_barter) || 0
    // CASH/BARTER-REGEL: Summe wird abgeleitet, nicht unabhängig editiert.
    const patch = {
      invoice_date: ef.invoice_date || null,
      auto_renew: !!ef.auto_renew,
      auto_renew_date: ef.auto_renew ? (ef.auto_renew_date || null) : null,
      league_id: ef.league_id || null,
      value_cash: cash,
      value_barter: barter,
      total_price: sumCashBarter(cash, barter),
      industry: ef.industry || null,
      updated_at: new Date().toISOString(),
    }
    // CHECK/per-Row Update über .eq('id', id) (kein .in()-Bundle — Top-Fallstrick #1).
    const { error: e2 } = await sp().from('contracts').update(patch).eq('id', edit.id)
    if (e2) { setError(e2.message); setBusy(false); return }
    setContracts((prev) => prev.map((c) => (c.id === edit.id ? { ...c, ...patch } : c)))
    setEdit(null); setEf(EMPTY_EDIT); setBusy(false)
  }

  // --- Phase 5: Word-Export via Vorlage ---------------------------------------
  function runExport(template) {
    if (!exportC || !template) return
    const c = exportC
    const filled = fillTemplate(template.body_text || '', c, {
      sponsor: sponsorName[c.sponsor_profile_id] || '',
      paket: packageName[c.package_id] || '',
      liga: leagueName[c.league_id] || '',
    })
    // TODO P5-Followup: echte .docx via Delivery-Unterbau. Hier funktionierender
    // Client-Download als .doc (application/msword nimmt HTML-Body an).
    const html = `<html><head><meta charset="utf-8"></head><body><pre style="font-family:Calibri,Arial,sans-serif;white-space:pre-wrap;">${escapeHtml(filled)}</pre></body></html>`
    const blob = new Blob([html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const safeName = (sponsorName[c.sponsor_profile_id] || 'Vertrag').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim() || 'Vertrag'
    const a = document.createElement('a')
    a.href = url; a.download = `${safeName}.doc`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    setExportC(null)
  }

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <ScrollText size={26} color={PRIMARY} />
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>Verträge</h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', maxWidth: 640, lineHeight: 1.6 }}>
        Wandle angenommene Angebote in Verträge — das bucht automatisch die enthaltenen Rechte als verkauft.
      </p>

      {error && <div style={errBox}>{error}</div>}

      {/* Offene Angebote */}
      <h2 style={h2}>Offene Angebote</h2>
      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : offers.length === 0 ? (
        <div style={{ ...muted, marginBottom: 28 }}>Keine offenen Angebote.</div>
      ) : (
        <div style={{ ...tableWrap, marginBottom: 28 }}>
          <table style={table}>
            <thead><tr style={trHead}>
              <th style={th}>Sponsor</th><th style={th}>Paket</th><th style={th}>Summe</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} style={trBody}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{sponsorName[o.sponsor_profile_id] || '—'}</td>
                  <td style={td}>{packageName[o.package_id] || '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(o.total_price)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => setConvert(o)} style={primaryBtn}>
                      In Vertrag wandeln <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Verträge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={h2}>Verträge</h2>
        {leagues.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Liga
            <select value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)}
                    style={{ ...input, width: 'auto', padding: '6px 8px' }}>
              <option value="">Alle Ligen</option>
              {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {loading ? null : contracts.length === 0 ? (
        <div style={muted}>Noch keine Verträge.</div>
      ) : visibleContracts.length === 0 ? (
        <div style={muted}>Keine Verträge für diese Liga.</div>
      ) : (
        <div style={tableWrap}>
          <table style={table}>
            <thead><tr style={trHead}>
              <th style={th}>Sponsor</th><th style={th}>Paket</th><th style={th}>Summe</th><th style={th}>Cash / Barter</th><th style={th}>Rechnungsdatum</th><th style={th}>Liga</th><th style={th}>Laufzeit</th><th style={th}>Kündigungsfrist</th><th style={th}>Status</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {visibleContracts.map((c) => (
                <tr key={c.id} style={trBody}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{sponsorName[c.sponsor_profile_id] || '—'}</td>
                  <td style={td}>{packageName[c.package_id] || '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(c.total_price)}</td>
                  <td style={{ ...td, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(c.value_cash)} / {fmt(c.value_barter)}</td>
                  <td style={td}>{dateStr(c.invoice_date)}</td>
                  <td style={td}>{leagueName[c.league_id] || '—'}</td>
                  <td style={td}>{dateStr(c.starts_on)} – {dateStr(c.ends_on)}</td>
                  <td style={td}>{c.notice_period_days ? `${c.notice_period_days} Tage` : '—'}</td>
                  <td style={td}>
                    <select value={c.status} onChange={(e) => updateStatus(c.id, e.target.value)}
                            style={{ ...input, padding: '4px 8px', color: CTR_COLOR[c.status], fontWeight: 600 }}>
                      {CTR_STATUS.map((s) => <option key={s} value={s}>{CTR_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(c)} style={ghostBtn} title="Bearbeiten"><Pencil size={14} /></button>
                    <button onClick={() => setExportC(c)} style={{ ...ghostBtn, marginLeft: 6 }} title="Word-Export"><FileDown size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Convert-Modal */}
      {convert && (
        <div style={overlay} onClick={() => !busy && setConvert(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={doConvert} style={modal}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>Vertrag erstellen</div>
              <button type="button" onClick={() => setConvert(null)} style={iconBtn}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
              {sponsorName[convert.sponsor_profile_id]} · {packageName[convert.package_id]} · {fmt(convert.total_price)}
            </div>
            <Field label="Beginn"><input type="date" value={cf.starts_on} onChange={(e) => setCf({ ...cf, starts_on: e.target.value })} style={input} /></Field>
            <Field label="Ende"><input type="date" value={cf.ends_on} onChange={(e) => setCf({ ...cf, ends_on: e.target.value })} style={input} /></Field>
            <Field label="Kündigungsfrist (Tage)"><input type="number" min="0" value={cf.notice_period_days} onChange={(e) => setCf({ ...cf, notice_period_days: e.target.value })} style={input} /></Field>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, marginTop: 12, justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={14} className="spin" /> : null} Vertrag anlegen &amp; Inventar buchen
            </button>
          </form>
        </div>
      )}

      {/* Edit-Modal: Zusatzfelder (Phase 5) */}
      {edit && (
        <div style={overlay} onClick={() => !busy && setEdit(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={saveEdit} style={modal}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>Vertrag bearbeiten</div>
              <button type="button" onClick={() => setEdit(null)} style={iconBtn}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
              {sponsorName[edit.sponsor_profile_id]} · {packageName[edit.package_id]}
            </div>

            <Field label="Rechnungsdatum">
              <input type="date" value={ef.invoice_date} onChange={(e) => setEf({ ...ef, invoice_date: e.target.value })} style={input} />
            </Field>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, color: 'var(--text-strong)' }}>
              <input type="checkbox" checked={ef.auto_renew} onChange={(e) => setEf({ ...ef, auto_renew: e.target.checked })} />
              Automatische Verlängerung
            </label>
            {ef.auto_renew && (
              <Field label="Verlängerungs-/Stichtag">
                <input type="date" value={ef.auto_renew_date} onChange={(e) => setEf({ ...ef, auto_renew_date: e.target.value })} style={input} />
              </Field>
            )}

            <Field label="Liga">
              <select value={ef.league_id} onChange={(e) => setEf({ ...ef, league_id: e.target.value })} style={input}>
                <option value="">— keine —</option>
                {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Field label="Wert Cash (€)">
                  <input type="number" min="0" step="0.01" value={ef.value_cash} onChange={(e) => setEf({ ...ef, value_cash: e.target.value })} style={input} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Wert Barter (€)">
                  <input type="number" min="0" step="0.01" value={ef.value_barter} onChange={(e) => setEf({ ...ef, value_barter: e.target.value })} style={input} />
                </Field>
              </div>
            </div>
            {/* Summe wird abgeleitet (Cash + Barter), nicht unabhängig editiert. */}
            <Field label="Gesamtsumme (abgeleitet)">
              <input type="text" readOnly value={fmt(sumCashBarter(ef.value_cash, ef.value_barter))}
                     style={{ ...input, background: 'var(--surface-muted, #F8FAFC)', color: 'var(--text-muted)' }} />
            </Field>

            <Field label="Branche">
              <input type="text" value={ef.industry} onChange={(e) => setEf({ ...ef, industry: e.target.value })} style={input} placeholder="z.B. Finanzen, Handel …" />
            </Field>

            <button type="submit" disabled={busy} style={{ ...primaryBtn, marginTop: 14, justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={14} className="spin" /> : null} Speichern
            </button>
          </form>
        </div>
      )}

      {/* Word-Export-Modal: Vorlage wählen + Download */}
      {exportC && (
        <div style={overlay} onClick={() => setExportC(null)}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>Word-Export</div>
              <button type="button" onClick={() => setExportC(null)} style={iconBtn}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
              {sponsorName[exportC.sponsor_profile_id]} · {packageName[exportC.package_id]}
            </div>
            {templates.length === 0 ? (
              <div style={{ ...muted, fontSize: 13 }}>
                Keine Vorlagen vorhanden. Lege zuerst eine Vertragsvorlage an.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map((t) => (
                  <button key={t.id} onClick={() => runExport(t)} style={templateBtn}>
                    <FileDown size={15} />
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                    {t.is_default && <span style={defaultBadge}>Standard</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// {{platzhalter}} -> Vertragsfeld. Simpler String-Replace (case-insensitiv auf
// den Key). resolved überschreibt Roh-Felder (z.B. sponsor-Name statt UUID).
function fillTemplate(body, c, resolved) {
  const map = {
    sponsor: resolved.sponsor,
    paket: resolved.paket,
    liga: resolved.liga,
    summe: fmt(c.total_price),
    value_cash: fmt(c.value_cash),
    value_barter: fmt(c.value_barter),
    cash: fmt(c.value_cash),
    barter: fmt(c.value_barter),
    rechnungsdatum: dateStr(c.invoice_date),
    invoice_date: dateStr(c.invoice_date),
    laufzeit_von: dateStr(c.starts_on),
    laufzeit_bis: dateStr(c.ends_on),
    kuendigungsfrist: c.notice_period_days ? `${c.notice_period_days} Tage` : '',
    branche: c.industry || '',
    industry: c.industry || '',
    auto_renew_date: dateStr(c.auto_renew_date),
    verlaengerung: dateStr(c.auto_renew_date),
  }
  return body.replace(/\{\{\s*([\w]+)\s*\}\}/g, (full, key) => {
    const v = map[String(key).toLowerCase()]
    return v != null ? String(v) : full
  })
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }
const ghostBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }
const templateBtn = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, cursor: 'pointer', textAlign: 'left' }
const defaultBadge = { marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: PRIMARY, background: 'rgba(49,90,231,0.1)', padding: '2px 8px', borderRadius: 999 }
const h2 = { fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 12px' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const tableWrap = { border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }
const trHead = { background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }
const trBody = { borderTop: '1px solid var(--border)' }
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }
const modal = { width: 'min(440px, 100%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }
