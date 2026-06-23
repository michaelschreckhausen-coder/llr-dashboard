// Sponsoring OS — Branchenanalyse (Partner-Screening + Akquise-Branchen)
// Club-Website analysieren → screen-partners-Edge-Function → gefundene Partner +
// Branchen anzeigen. Plus editierbare Akquise-Branchen-Tabelle.
//
// Liest/schreibt im Schema 'sponsoring' via supabase.schema('sponsoring').
// team_id kommt aus useTeam().activeTeamId.

import { useEffect, useState, useCallback } from 'react'
import { Search, Plus, Loader2, RefreshCw, Trash2, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')

const EMPTY_IND = { industry: '', is_boom: false, fits_sport: false, open_at_club: false, note: '' }

export default function Branchenanalyse() {
  const { activeTeamId } = useTeam()
  const [screenings, setScreenings] = useState([])
  const [industries, setIndustries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [form, setForm] = useState(EMPTY_IND)

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [{ data: scr, error: sErr }, { data: inds, error: iErr }] = await Promise.all([
      sp().from('partner_screenings').select('*').eq('team_id', activeTeamId).order('run_at', { ascending: false }),
      sp().from('acquisition_industries').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
    ])
    if (sErr || iErr) { setError((sErr || iErr).message); setLoading(false); return }
    setScreenings(scr || [])
    setIndustries(inds || [])
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function runScreening(e) {
    e.preventDefault()
    if (!activeTeamId || !sourceUrl.trim()) return
    setScanBusy(true); setError(null)
    const { data, error: e2 } = await supabase.functions.invoke('screen-partners', {
      body: { team_id: activeTeamId, source_url: sourceUrl.trim() },
    })
    if (e2) { setError(e2.message); setScanBusy(false); return }
    if (data && data.ok === false) { setError(data.error || 'Analyse fehlgeschlagen.'); setScanBusy(false); return }
    setSourceUrl('')
    await fetchAll(); setScanBusy(false)
  }

  async function createIndustry(e) {
    e.preventDefault()
    if (!activeTeamId || !form.industry.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('acquisition_industries').insert({
      team_id: activeTeamId,
      industry: form.industry.trim(),
      is_boom: !!form.is_boom,
      fits_sport: !!form.fits_sport,
      open_at_club: !!form.open_at_club,
      note: form.note.trim() || null,
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setForm(EMPTY_IND)
    await fetchAll(); setBusy(false)
  }

  async function toggleIndustry(id, field, value) {
    // bewusst per-Row .eq() (kein .in()-Bulk → CHECK/silent-fail vermeiden)
    const { error: e } = await sp().from('acquisition_industries')
      .update({ [field]: value })
      .eq('id', id)
    if (e) { setError(e.message); return }
    setIndustries((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  async function updateNote(id, note) {
    const { error: e } = await sp().from('acquisition_industries')
      .update({ note: note || null })
      .eq('id', id)
    if (e) { setError(e.message); return }
    setIndustries((prev) => prev.map((r) => (r.id === id ? { ...r, note } : r)))
  }

  async function deleteIndustry(id) {
    const { error: e } = await sp().from('acquisition_industries').delete().eq('id', id)
    if (e) { setError(e.message); return }
    setIndustries((prev) => prev.filter((r) => r.id !== id))
  }

  if (!activeTeamId) {
    return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Search size={26} color={PRIMARY} />
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>
            Branchenanalyse
          </h1>
        </div>
        <button onClick={fetchAll} title="Aktualisieren" style={iconBtn}>
          <RefreshCw size={16} />
        </button>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', maxWidth: 640, lineHeight: 1.6 }}>
        Analysiere die Website eines Clubs auf bestehende Partner und relevante Branchen — und pflege deine Akquise-Zielbranchen.
      </p>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Screening starten */}
      <form onSubmit={runScreening} style={{
        display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end',
        border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16, marginBottom: 22,
      }}>
        <Field label="Club-Website-URL">
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
                 placeholder="https://www.example-club.de" style={input} />
        </Field>
        <button type="submit" disabled={scanBusy || !sourceUrl.trim()} style={{ ...primaryBtn, opacity: scanBusy || !sourceUrl.trim() ? 0.6 : 1 }}>
          {scanBusy ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Analysieren
        </button>
      </form>

      {/* Screenings-Liste */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }}>
          <Loader2 size={16} className="spin" /> Lade Analysen…
        </div>
      ) : screenings.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>Noch keine Analyse durchgeführt.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 36 }}>
          {screenings.map((s) => {
            const partners = Array.isArray(s.found_partners) ? s.found_partners : []
            const inds = Array.isArray(s.industries) ? s.industries : []
            return (
              <div key={s.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer"
                     style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: PRIMARY, textDecoration: 'none' }}>
                    {s.source_url} <ExternalLink size={13} />
                  </a>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {s.run_at ? new Date(s.run_at).toLocaleString('de-DE') : '—'}
                  </span>
                </div>

                {s.summary && (
                  <p style={{ fontSize: 13.5, color: 'var(--text-strong)', margin: '0 0 12px', lineHeight: 1.6 }}>{s.summary}</p>
                )}

                {inds.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: partners.length > 0 ? 12 : 0 }}>
                    {inds.map((ind, idx) => {
                      const label = typeof ind === 'string' ? ind : (ind?.name || ind?.industry || JSON.stringify(ind))
                      return <span key={idx} style={chip}>{label}</span>
                    })}
                  </div>
                )}

                {partners.length > 0 ? (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={th}>Partner</th>
                          <th style={th}>Branche</th>
                          <th style={th}>Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partners.map((p, idx) => {
                          const name = typeof p === 'string' ? p : (p?.name || '—')
                          const industry = typeof p === 'object' && p ? (p.industry || '—') : '—'
                          const url = typeof p === 'object' && p ? p.url : null
                          return (
                            <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{name}</td>
                              <td style={td}>{industry}</td>
                              <td style={td}>
                                {url ? (
                                  <a href={url} target="_blank" rel="noopener noreferrer"
                                     style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: PRIMARY, textDecoration: 'none' }}>
                                    Öffnen <ExternalLink size={12} />
                                  </a>
                                ) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Partner gefunden.</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Akquise-Branchen */}
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 14px', letterSpacing: '-0.01em' }}>
        Akquise-Branchen
      </h2>

      {/* Anlegen */}
      <form onSubmit={createIndustry} style={{
        display: 'grid', gridTemplateColumns: '1.4fr auto auto auto 1.4fr auto', gap: 10, alignItems: 'end',
        border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16, marginBottom: 22,
      }}>
        <Field label="Branche">
          <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}
                 placeholder="z.B. Handwerk" style={input} />
        </Field>
        <CheckField label="Boom-Branche">
          <input type="checkbox" checked={form.is_boom} onChange={(e) => setForm({ ...form, is_boom: e.target.checked })} style={checkbox} />
        </CheckField>
        <CheckField label="passt zum Sport">
          <input type="checkbox" checked={form.fits_sport} onChange={(e) => setForm({ ...form, fits_sport: e.target.checked })} style={checkbox} />
        </CheckField>
        <CheckField label="beim Club offen">
          <input type="checkbox" checked={form.open_at_club} onChange={(e) => setForm({ ...form, open_at_club: e.target.checked })} style={checkbox} />
        </CheckField>
        <Field label="Notiz">
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                 placeholder="optional" style={input} />
        </Field>
        <button type="submit" disabled={busy || !form.industry.trim()} style={{ ...primaryBtn, opacity: busy || !form.industry.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Anlegen
        </button>
      </form>

      {/* Branchen-Liste */}
      {loading ? null : industries.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Noch keine Akquise-Branchen angelegt.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={th}>Branche</th>
                <th style={{ ...th, textAlign: 'center' }}>Boom-Branche</th>
                <th style={{ ...th, textAlign: 'center' }}>passt zum Sport</th>
                <th style={{ ...th, textAlign: 'center' }}>beim Club offen</th>
                <th style={th}>Notiz</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {industries.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{r.industry}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input type="checkbox" checked={!!r.is_boom} onChange={(e) => toggleIndustry(r.id, 'is_boom', e.target.checked)} style={checkbox} />
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input type="checkbox" checked={!!r.fits_sport} onChange={(e) => toggleIndustry(r.id, 'fits_sport', e.target.checked)} style={checkbox} />
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input type="checkbox" checked={!!r.open_at_club} onChange={(e) => toggleIndustry(r.id, 'open_at_club', e.target.checked)} style={checkbox} />
                  </td>
                  <td style={td}>
                    <input defaultValue={r.note || ''}
                           onBlur={(e) => { if ((e.target.value || '') !== (r.note || '')) updateNote(r.id, e.target.value) }}
                           placeholder="—" style={{ ...input, padding: '4px 8px' }} />
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => deleteIndustry(r.id)} title="Löschen" style={iconBtn}>
                      <Trash2 size={15} />
                    </button>
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

function CheckField({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </label>
  )
}

const input = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box',
}
const checkbox = { width: 18, height: 18, accentColor: PRIMARY, cursor: 'pointer', margin: '8px 0' }
const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999,
  border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer',
}
const card = {
  border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16,
}
const chip = {
  fontSize: 12.5, fontWeight: 600, color: 'var(--text-strong)', background: 'var(--surface-muted, #F1F5F9)',
  border: '1px solid var(--border)', padding: '4px 12px', borderRadius: 999,
}
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
