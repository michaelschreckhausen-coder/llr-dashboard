// Sponsoring OS — Branchenanalyse (Partner-Screening + Akquise-Branchen)
// Club-Website analysieren → screen-partners-Edge-Function → gefundene Partner +
// Branchen anzeigen. Plus editierbare Akquise-Branchen-Tabelle.
//
// Liest/schreibt im Schema 'sponsoring' via supabase.schema('sponsoring').
// team_id kommt aus useTeam().activeTeamId.

import PillSelect from '../../components/PillSelect'
import { Fragment, useEffect, useMemo, useState, useCallback } from 'react'
import { Search, Plus, Loader2, RefreshCw, Trash2, ExternalLink, Wand2, Building2, Sparkles, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'
import GenerationLoading from '../../components/GenerationLoading'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const sp = () => supabase.schema('sponsoring')

const EMPTY_IND = { industry: '', is_boom: false, fits_sport: false, open_at_club: false, note: '' }

const REGIONS = ['regional', 'national', 'international']
const REGION_LABEL = { regional: 'Regional', national: 'National', international: 'International' }
const REGION_PROMPT = { regional: 'regionaler', national: 'nationaler', international: 'internationaler' }

// JSON-Array aus einer LLM-Antwort defensiv extrahieren (Code-Fences/Vorrede tolerieren).
function parseJsonArray(text) {
  if (!text) return []
  let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []
  try { const arr = JSON.parse(t.slice(start, end + 1)); return Array.isArray(arr) ? arr : [] } catch { return [] }
}

export default function Branchenanalyse() {
  const { activeTeamId } = useTeam()
  const [screenings, setScreenings] = useState([])
  const [industries, setIndustries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const [adoptBusy, setAdoptBusy] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [form, setForm] = useState(EMPTY_IND)
  // B-Block
  const [targets, setTargets] = useState([])           // target_companies (B3/B4)
  const [campaigns, setCampaigns] = useState([])        // sponsoring.campaigns (B4)
  const [conceptBusy, setConceptBusy] = useState(null)  // acquisition_industries.id (B2)
  const [expanded, setExpanded] = useState({})          // industryId -> Konzept aufgeklappt
  const [tgt, setTgt] = useState({ industry: '', region: 'regional' }) // B3-Formular
  const [tgtBusy, setTgtBusy] = useState(false)
  const [prefillBusy, setPrefillBusy] = useState(false) // B1 KI-Vorbefüllung
  const [adoptCoBusy, setAdoptCoBusy] = useState(null)   // target_companies.id (B4)

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [scr, inds, tc, camp] = await Promise.all([
      sp().from('partner_screenings').select('*').eq('team_id', activeTeamId).order('run_at', { ascending: false }),
      sp().from('acquisition_industries').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('target_companies').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('campaigns').select('id, name').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
    ])
    const err = scr.error || inds.error || tc.error || camp.error
    if (err) { setError(err.message); setLoading(false); return }
    setScreenings(scr.data || [])
    setIndustries(inds.data || [])
    setTargets(tc.data || [])
    setCampaigns(camp.data || [])
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
    if (e2) {
      // Server-Message aus dem Response-Body durchreichen (supabase-js zeigt sonst
      // nur die generische "non-2xx"-Meldung). FunctionsHttpError.context = Response.
      let msg = e2.message
      try { const body = await e2.context?.json?.(); if (body?.error) msg = body.error } catch { /* keep generic */ }
      setError(msg); setScanBusy(false); return
    }
    if (data && data.ok === false) { setError(data.error || 'Analyse fehlgeschlagen.'); setScanBusy(false); return }
    setSourceUrl('')
    await fetchAll(); setScanBusy(false)
  }

  // Branchen aus einem Screening in die Akquise-Branchen übernehmen.
  // Per-Item-Insert (kein .in()-Bulk); idempotent via unique (team_id, industry):
  // Unique-Violation (23505) = bereits vorhanden → überspringen, kein Fehler.
  async function adoptIndustries(labels, note) {
    if (!activeTeamId) return
    const clean = []
    const seen = new Set()
    for (const raw of labels) {
      const lbl = (raw || '').trim()
      if (!lbl) continue
      const k = lbl.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k); clean.push(lbl)
    }
    if (clean.length === 0) return
    setAdoptBusy(true); setError(null); setNotice(null)
    let added = 0, skipped = 0
    for (const industry of clean) {
      const { error: e } = await sp().from('acquisition_industries').insert({
        team_id: activeTeamId,
        industry,
        is_boom: false,
        fits_sport: false,
        open_at_club: false, // Default false (DB-Default ist true) — Produktentscheidung offen
        note: note || null,
      })
      if (e) {
        if (e.code === '23505') { skipped++; continue } // bereits vorhanden
        setError(e.message); setAdoptBusy(false); await fetchAll(); return
      }
      added++
    }
    await fetchAll()
    setAdoptBusy(false)
    setNotice(`${added} übernommen${skipped ? `, ${skipped} schon vorhanden` : ''}.`)
  }

  async function deleteScreening(id) {
    if (!window.confirm('Diese Analyse wirklich löschen?')) return
    setError(null); setNotice(null)
    const { error: e } = await sp().from('partner_screenings').delete().eq('id', id)
    if (e) { setError(e.message); return }
    setScreenings((prev) => prev.filter((s) => s.id !== id))
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

  // ── B1: typische Sport-/Boom-Branchen per KI vorbefüllen ──────────────────
  async function prefillIndustries() {
    if (!activeTeamId) return
    setPrefillBusy(true); setError(null); setNotice(null)
    const prompt = 'Nenne 12 Branchen, die im Sport-Sponsoring (B2B) typischerweise als Sponsoren auftreten oder aktuell wirtschaftlich besonders stark sind ("Boom-Branchen"). '
      + 'Antworte AUSSCHLIESSLICH als JSON-Array, jedes Element { "industry": string (kurz, Deutsch), "is_boom": boolean (true wenn aktuelle Boom-Branche) }. Keine Vorrede, kein Markdown.'
    const { data, error: e } = await supabase.functions.invoke('generate', { body: { prompt } })
    if (e) { setError(e.message || 'KI-Aufruf fehlgeschlagen.'); setPrefillBusy(false); return }
    const arr = parseJsonArray(data?.text || data?.content || data?.output)
    let added = 0, skipped = 0
    for (const it of arr) {
      const industry = (it?.industry || '').trim()
      if (!industry) continue
      const { error: ie } = await sp().from('acquisition_industries').insert({
        team_id: activeTeamId, industry, is_boom: !!it?.is_boom, fits_sport: true, open_at_club: true, note: null,
      })
      if (ie) { if (ie.code === '23505') { skipped++; continue } setError(ie.message); break }
      added++
    }
    await fetchAll(); setPrefillBusy(false)
    setNotice(`${added} Branche(n) vorgeschlagen${skipped ? `, ${skipped} schon vorhanden` : ''}.`)
  }

  // ── B2: KI-Aktivierungskonzept je Branche (generate-EF injiziert Brand Voice/Zielgruppe serverseitig) ──
  async function generateConcept(row) {
    setConceptBusy(row.id); setError(null)
    const prompt = `Du bist Sponsoring-Berater im Sport. Entwickle ein konkretes Aktivierungskonzept für ein Sponsoring mit einem Unternehmen aus der Branche "${row.industry}". `
      + 'Berücksichtige Brand Voice, Zielgruppe und Wissensdatenbank. Gib 4–6 konkrete, umsetzbare Aktivierungsideen als kurze Stichpunkte (je 1 Satz, mit "- " beginnend), auf Deutsch, ohne Vorrede und ohne Überschrift.'
    const { data, error: e } = await supabase.functions.invoke('generate', { body: { prompt } })
    if (e) { setError(e.message || 'KI-Aufruf fehlgeschlagen.'); setConceptBusy(null); return }
    const text = String(data?.text || data?.content || data?.output || '').trim()
    if (!text) { setError('Keine KI-Antwort erhalten.'); setConceptBusy(null); return }
    const { error: ue } = await sp().from('acquisition_industries').update({ activation_concept: text }).eq('id', row.id)
    if (ue) { setError(ue.message); setConceptBusy(null); return }
    setIndustries((prev) => prev.map((r) => (r.id === row.id ? { ...r, activation_concept: text } : r)))
    setExpanded((prev) => ({ ...prev, [row.id]: true }))
    setConceptBusy(null)
  }

  // ── B3: KI-Zielunternehmen je Branche + Region ────────────────────────────
  async function findCompanies(e) {
    e.preventDefault()
    if (!activeTeamId || !tgt.industry.trim()) return
    setTgtBusy(true); setError(null); setNotice(null)
    const prompt = `Nenne 8 real existierende Unternehmen aus der Branche "${tgt.industry.trim()}" mit ${REGION_PROMPT[tgt.region]} Ausrichtung, die als Sponsoring-Partner für einen Sportverein interessant sind. `
      + 'Antworte AUSSCHLIESSLICH als JSON-Array, jedes Element { "name": string, "rationale": string (max 12 Wörter, warum passend), "website": string oder null }. Keine Vorrede, kein Markdown.'
    const { data, error: e2 } = await supabase.functions.invoke('generate', { body: { prompt } })
    if (e2) { setError(e2.message || 'KI-Aufruf fehlgeschlagen.'); setTgtBusy(false); return }
    const arr = parseJsonArray(data?.text || data?.content || data?.output)
    if (arr.length === 0) { setError('Keine verwertbaren Vorschläge erhalten.'); setTgtBusy(false); return }
    let added = 0
    for (const c of arr) {
      const name = (c?.name || '').trim()
      if (!name) continue
      const { error: ie } = await sp().from('target_companies').insert({
        team_id: activeTeamId, industry: tgt.industry.trim(), region: tgt.region,
        name, rationale: (c?.rationale || '').trim() || null,
        website: (c?.website && String(c.website).trim()) || null, status: 'vorschlag',
      })
      if (!ie) added++
    }
    await fetchAll(); setTgtBusy(false)
    setNotice(`${added} Zielunternehmen vorgeschlagen.`)
  }

  // ── B4: Vorschlag als echtes Unternehmen übernehmen ───────────────────────
  async function adoptCompany(tc) {
    setAdoptCoBusy(tc.id); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: org, error: oe } = await supabase.from('organizations').insert({
      name: tc.name, user_id: activeTeamId ? null : user?.id, team_id: activeTeamId || null, created_by: user?.id,
    }).select('id').single()
    if (oe || !org) { setError(oe?.message || 'Unternehmen konnte nicht angelegt werden.'); setAdoptCoBusy(null); return }
    const { error: ue } = await sp().from('target_companies').update({ status: 'uebernommen', organization_id: org.id }).eq('id', tc.id)
    if (ue) { setError(ue.message); setAdoptCoBusy(null); return }
    setTargets((prev) => prev.map((r) => (r.id === tc.id ? { ...r, status: 'uebernommen', organization_id: org.id } : r)))
    setAdoptCoBusy(null)
  }

  // B4: übernommenes Unternehmen einer Kampagne zuordnen (campaign_organizations, n:m auf echtem Datensatz)
  async function assignCampaign(tc, campaignId) {
    if (!campaignId || !tc.organization_id) return
    setError(null)
    const { error: ce } = await sp().from('campaign_organizations').insert({
      team_id: activeTeamId, campaign_id: campaignId, organization_id: tc.organization_id,
    })
    if (ce && ce.code !== '23505') { setError(ce.message); return }
    const { error: ue } = await sp().from('target_companies').update({ campaign_id: campaignId }).eq('id', tc.id)
    if (ue) { setError(ue.message); return }
    setTargets((prev) => prev.map((r) => (r.id === tc.id ? { ...r, campaign_id: campaignId } : r)))
    setNotice('Unternehmen der Kampagne zugeordnet.')
  }

  async function dismissCompany(tc) {
    setError(null)
    const { error: e } = await sp().from('target_companies').delete().eq('id', tc.id)
    if (e) { setError(e.message); return }
    setTargets((prev) => prev.filter((r) => r.id !== tc.id))
  }

  const chancenCount = useMemo(() => industries.filter((r) => r.open_at_club).length, [industries])

  if (!activeTeamId) {
    return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      {/* Branding-Generierungs-Animation (Vollbild-Overlay) während die screen-partners-EF läuft */}
      {scanBusy && <GenerationLoading title="Club-Website wird analysiert" expectedSeconds={25} />}
      <PageHeader overline="Sponsoring" title="Branchenanalyse" subtitle="Analysiere die Website eines Clubs auf bestehende Partner und relevante Branchen — und pflege deine Akquise-Zielbranchen." action={
        <button onClick={fetchAll} title="Aktualisieren" style={iconBtn}>
          <RefreshCw size={16} />
        </button>
      } />

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', fontSize: 13, marginBottom: 16 }}>
          {notice}
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {s.run_at ? new Date(s.run_at).toLocaleString('de-DE') : '—'}
                    </span>
                    <button onClick={() => deleteScreening(s.id)} title="Analyse löschen" style={iconBtnSm}>
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>

                {s.summary && (
                  <p style={{ fontSize: 13.5, color: 'var(--text-strong)', margin: '0 0 12px', lineHeight: 1.6 }}>{s.summary}</p>
                )}

                {inds.length > 0 && (() => {
                  const note = noteForScreening(s)
                  const labels = inds.map(indLabel).filter(Boolean)
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: partners.length > 0 ? 12 : 0 }}>
                      {inds.map((ind, idx) => {
                        const label = indLabel(ind)
                        if (!label) return null
                        const count = (ind && typeof ind === 'object' && typeof ind.count === 'number') ? ind.count : null
                        return (
                          <button key={idx} type="button" disabled={adoptBusy}
                            onClick={() => adoptIndustries([label], note)}
                            title={`„${label}" in Akquise-Branchen übernehmen`}
                            style={{ ...chipBtn, opacity: adoptBusy ? 0.6 : 1 }}>
                            <Plus size={12} /> {label}{count ? ` (${count})` : ''}
                          </button>
                        )
                      })}
                      {labels.length > 0 && (
                        <button type="button" disabled={adoptBusy}
                          onClick={() => adoptIndustries(labels, note)}
                          title="Alle Branchen dieser Analyse in Akquise-Branchen übernehmen"
                          style={{ ...primaryBtn, padding: '5px 12px', fontSize: 12, opacity: adoptBusy ? 0.6 : 1 }}>
                          {adoptBusy ? <Loader2 size={12} className="spin" /> : <Plus size={12} />} Alle Branchen übernehmen
                        </button>
                      )}
                    </div>
                  )
                })()}

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>
          Akquise-Branchen
        </h2>
        <button type="button" onClick={prefillIndustries} disabled={prefillBusy}
          title="Typische Sport- und Boom-Branchen per KI vorschlagen"
          style={{ ...primaryBtn, padding: '7px 14px', fontSize: 12.5, opacity: prefillBusy ? 0.6 : 1 }}>
          {prefillBusy ? <Loader2 size={13} className="spin" /> : <Wand2 size={13} />} Typische Branchen vorschlagen
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
        Stelle sport-relevante und Boom-Branchen den beim Club besetzten Branchen gegenüber.
        {industries.length > 0 && <> Aktuell <strong style={{ color: PRIMARY }}>{chancenCount}</strong> Branche(n) als Chance markiert („beim Club offen").</>}
        {' '}Pro Branche kannst du ein KI-Aktivierungskonzept erzeugen.
      </p>

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
                <Fragment key={r.id}>
                <tr style={{ borderTop: '1px solid var(--border)' }}>
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
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => (r.activation_concept ? setExpanded((p) => ({ ...p, [r.id]: !p[r.id] })) : generateConcept(r))}
                            disabled={conceptBusy === r.id}
                            title={r.activation_concept ? 'Aktivierungskonzept anzeigen' : 'KI-Aktivierungskonzept erzeugen'}
                            style={{ ...iconBtn, marginRight: 6, color: r.activation_concept ? PRIMARY : 'var(--text-muted)' }}>
                      {conceptBusy === r.id ? <Loader2 size={15} className="spin" /> : (r.activation_concept ? <ChevronDown size={15} style={{ transform: expanded[r.id] ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} /> : <Sparkles size={15} />)}
                    </button>
                    <button onClick={() => deleteIndustry(r.id)} title="Löschen" style={iconBtn}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
                {r.activation_concept && expanded[r.id] && (
                  <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-muted, #F8FAFC)' }}>
                    <td colSpan={6} style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: PRIMARY, marginBottom: 6 }}>
                        <Sparkles size={13} /> KI-Aktivierungskonzept
                        <button type="button" onClick={() => generateConcept(r)} disabled={conceptBusy === r.id}
                          title="Neu generieren" style={{ ...iconBtnSm, marginLeft: 4 }}>
                          {conceptBusy === r.id ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
                        </button>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-strong)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{r.activation_concept}</div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── B3/B4: Zielunternehmen (KI) ─────────────────────────────────── */}
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', margin: '36px 0 6px', letterSpacing: '-0.01em' }}>
        Zielunternehmen <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>(KI-Vorschläge)</span>
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
        Lass dir je Branche und Region passende Unternehmen vorschlagen. Übernommene Unternehmen landen als echter
        CRM-Datensatz (keine Duplikate beim erneuten Übernehmen vermeiden — prüfe vorab) und lassen sich einer Kampagne zuordnen.
      </p>

      <form onSubmit={findCompanies} style={{
        display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: 10, alignItems: 'end',
        border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16, marginBottom: 18,
      }}>
        <Field label="Branche">
          <input list="acq-industries" value={tgt.industry} onChange={(e) => setTgt({ ...tgt, industry: e.target.value })}
                 placeholder="z.B. Handwerk" style={input} />
          <datalist id="acq-industries">
            {industries.map((r) => <option key={r.id} value={r.industry} />)}
          </datalist>
        </Field>
        <Field label="Region">
          <PillSelect value={tgt.region} onChange={v => setTgt({ ...tgt, region: v })} neutral options={[...REGIONS.map((rg) => ({ value: rg, label: REGION_LABEL[rg] }))]} buttonStyle={{ minWidth: 140 }} />
        </Field>
        <button type="submit" disabled={tgtBusy || !tgt.industry.trim()} style={{ ...primaryBtn, opacity: tgtBusy || !tgt.industry.trim() ? 0.6 : 1 }}>
          {tgtBusy ? <Loader2 size={14} className="spin" /> : <Building2 size={14} />} Vorschläge holen
        </button>
      </form>

      {targets.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Noch keine Zielunternehmen vorgeschlagen.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {targets.map((tc) => {
            const adopted = tc.status === 'uebernommen'
            const campaignName = campaigns.find((c) => c.id === tc.campaign_id)?.name
            return (
              <div key={tc.id} style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-strong)' }}>{tc.name}</span>
                    <span style={{ ...badge }}>{REGION_LABEL[tc.region] || tc.region}</span>
                    {tc.industry && <span style={{ ...badge, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{tc.industry}</span>}
                    {adopted && <span style={{ ...badge, background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }}>übernommen</span>}
                  </div>
                  {tc.rationale && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{tc.rationale}</div>}
                  {tc.website && (
                    <a href={/^https?:\/\//.test(tc.website) ? tc.website : `https://${tc.website}`} target="_blank" rel="noopener noreferrer"
                       style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: PRIMARY, textDecoration: 'none', marginTop: 4 }}>
                      {tc.website} <ExternalLink size={12} />
                    </a>
                  )}
                  {adopted && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Kampagne:</span>
                      <PillSelect value={tc.campaign_id || ''} onChange={v => assignCampaign(tc, v)} neutral options={[{ value: '', label: campaigns.length ? '— zuordnen —' : '— keine Kampagnen —' }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} buttonStyle={{ minWidth: 140 }} />
                      {campaignName && <span style={{ fontSize: 12, color: '#065F46', fontWeight: 600 }}>→ {campaignName}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {!adopted && (
                    <button type="button" onClick={() => adoptCompany(tc)} disabled={adoptCoBusy === tc.id}
                            style={{ ...primaryBtn, padding: '6px 12px', fontSize: 12, opacity: adoptCoBusy === tc.id ? 0.6 : 1 }}>
                      {adoptCoBusy === tc.id ? <Loader2 size={12} className="spin" /> : <Plus size={12} />} Übernehmen
                    </button>
                  )}
                  <button type="button" onClick={() => dismissCompany(tc)} title="Vorschlag entfernen" style={iconBtnSm}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Branchen-Label aus einem industries-Eintrag ziehen ({industry,count} | {name} | string).
// JSON.stringify-Fallback bewusst NICHT als Branche übernehmen → null.
function indLabel(ind) {
  if (typeof ind === 'string') return ind.trim() || null
  if (ind && typeof ind === 'object') return (ind.industry || ind.name || '').trim() || null
  return null
}

function noteForScreening(s) {
  try {
    const host = new URL(s.source_url).hostname.replace(/^www\./, '')
    return host ? `aus Analyse ${host}` : 'aus Analyse'
  } catch { return 'aus Analyse' }
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
  border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
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
const badge = {
  fontSize: 11, fontWeight: 700, color: '#3730A3', background: '#EAF6FC',
  padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
}
const chipBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600,
  color: 'var(--text-strong)', background: 'var(--surface-muted, #F1F5F9)',
  border: '1px solid var(--border)', padding: '4px 10px 4px 8px', borderRadius: 999, cursor: 'pointer',
}
const iconBtnSm = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer',
}
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
