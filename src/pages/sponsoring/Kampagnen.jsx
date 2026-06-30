// Sponsoring OS — Kampagnen (Phase 1, Modul 4+11)
// Liste aller Kampagnen mit CRUD, Detail-Drawer mit zugeordneten campaign_leads,
// KI-Konzept-Generierung via Edge Function generate-campaign-concept + Lead-Vorschlaege.
//
// Liest/schreibt im Schema 'sponsoring' via supabase.schema('sponsoring').
// team_id kommt aus useTeam().activeTeamId. brand_voices/target_audiences im public-Schema.
// Status-Updates bewusst per-Row .eq() (kein .in()-Bulk → CHECK-Status-silent-fail vermeiden).

import { useEffect, useState, useCallback } from 'react'
import { Megaphone, Plus, Loader2, Sparkles, X, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')

// status muss zur DB-CHECK-Constraint campaigns_status_check passen: {draft,active,paused,done}
const STATUS = ['draft', 'active', 'paused', 'done']
const STATUS_LABEL = { draft: 'Entwurf', active: 'Aktiv', paused: 'Pausiert', done: 'Abgeschlossen' }
const STATUS_COLOR = { draft: '#6B7280', active: '#2563EB', paused: '#D97706', done: '#059669' }

const EMPTY_FORM = {
  title: '', industry: '', persona: '', expected_value: '', responsible: '',
  geo_scope: '', status: 'draft', brand_voice_id: '', target_audience_id: '',
}

function memberLabel(m) {
  return m?.profile?.full_name || m?.profile?.email || m?.user_id || '—'
}

// sponsor_profiles ist 1:1-Extension zu public.organizations; der Sponsorname lebt
// in organizations.name. Profile tragen organization_id; der Name wird über eine
// orgName-Map (org.id -> name) aufgelöst. Defensiver String-Fallback bleibt.
function sponsorName(p, orgName) {
  if (!p) return null
  if (orgName && p.organization_id != null) return orgName[p.organization_id] || null
  return null
}

// Name eines Lead-Vorschlags defensiv ableiten (Feld evtl. name ODER company).
function suggestionName(s) {
  if (s == null) return ''
  if (typeof s === 'string') return s
  return s.name || s.company || s.title || ''
}

export default function Kampagnen() {
  const { activeTeamId, members } = useTeam()
  const [campaigns, setCampaigns] = useState([])
  const [counts, setCounts] = useState({})   // campaign_id -> { leads, orgs, deals, value }
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [brandVoices, setBrandVoices] = useState([])
  const [audiences, setAudiences] = useState([])

  const [sel, setSel] = useState(null)        // ausgewaehlte Kampagne (Drawer)
  const [draft, setDraft] = useState({})       // editierbarer Klon der Auswahl
  const [editing, setEditing] = useState(false)
  const [leads, setLeads] = useState([])       // campaign_leads der Auswahl
  const [sponsorMap, setSponsorMap] = useState({}) // sponsor_profile_id -> profile (id, organization_id)
  const [orgName, setOrgName] = useState({})        // organization_id -> organizations.name
  const [leadName, setLeadName] = useState('')     // neuer manueller Lead-Name
  const [leadSponsorId, setLeadSponsorId] = useState('')
  const [sponsors, setSponsors] = useState([])     // sponsor_profiles fuer Picker
  const [generating, setGenerating] = useState(false)
  const [savingLead, setSavingLead] = useState(false)

  // Phase 2 (K2): bestehende CRM-Datensätze einer Kampagne zuordnen (KEINE Duplikate)
  const [allOrgs, setAllOrgs]         = useState([])   // public.organizations (Picker)
  const [allDeals, setAllDeals]       = useState([])   // public.deals (Picker)
  const [allLeads, setAllLeads]       = useState([])   // public.leads (Picker)
  const [linkedOrgs, setLinkedOrgs]   = useState([])   // campaign_organizations der Auswahl
  const [linkedDeals, setLinkedDeals] = useState([])   // campaign_deals der Auswahl
  const [pickOrg, setPickOrg]   = useState('')
  const [pickDeal, setPickDeal] = useState('')
  const [pickLead, setPickLead] = useState('')

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [
      { data: cs, error: cErr },
      { data: bvs },
      { data: tas },
    ] = await Promise.all([
      sp().from('campaigns').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      supabase.from('brand_voices').select('id,name').eq('team_id', activeTeamId).order('name', { ascending: true }),
      supabase.from('target_audiences').select('id,name').eq('team_id', activeTeamId).order('name', { ascending: true }),
    ])
    if (cErr) { setError(cErr.message); setLoading(false); return }
    setCampaigns(cs || [])
    setBrandVoices(bvs || [])
    setAudiences(tas || [])
    await loadCounts()
    setLoading(false)
  }, [activeTeamId])

  // Aggregations-Counts pro Kampagne (verknüpfte CRM-Records + Pipeline-Wert aus den Deals)
  const loadCounts = useCallback(async () => {
    if (!activeTeamId) return
    const [cl, cd, co, dv] = await Promise.all([
      sp().from('campaign_leads').select('campaign_id').eq('team_id', activeTeamId),
      sp().from('campaign_deals').select('campaign_id, deal_id').eq('team_id', activeTeamId),
      sp().from('campaign_organizations').select('campaign_id').eq('team_id', activeTeamId),
      supabase.from('deals').select('id, value').eq('team_id', activeTeamId),
    ])
    const dval = Object.fromEntries((dv.data || []).map((d) => [d.id, Number(d.value) || 0]))
    const cmap = {}
    const ensure = (id) => (cmap[id] ||= { leads: 0, orgs: 0, deals: 0, value: 0 })
    ;(cl.data || []).forEach((r) => { ensure(r.campaign_id).leads++ })
    ;(co.data || []).forEach((r) => { ensure(r.campaign_id).orgs++ })
    ;(cd.data || []).forEach((r) => { const e = ensure(r.campaign_id); e.deals++; e.value += dval[r.deal_id] || 0 })
    setCounts(cmap)
  }, [activeTeamId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const bvName = (id) => brandVoices.find((b) => b.id === id)?.name
  const taName = (id) => audiences.find((a) => a.id === id)?.name

  async function createCampaign(e) {
    e.preventDefault()
    if (!activeTeamId || !form.title.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('campaigns').insert({
      team_id: activeTeamId,
      title: form.title.trim(),
      industry: form.industry.trim() || null,
      persona: form.persona.trim() || null,
      expected_value: form.expected_value === '' ? null : Number(form.expected_value),
      responsible: form.responsible || null,
      geo_scope: form.geo_scope.trim() || null,
      status: form.status,
      brand_voice_id: form.brand_voice_id || null,
      target_audience_id: form.target_audience_id || null,
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setForm(EMPTY_FORM)
    await fetchAll(); setBusy(false)
  }

  async function updateStatus(campaignId, status) {
    // bewusst per-Row .eq() (kein .in()-Bulk → CHECK-Status-silent-fail vermeiden)
    const { error: e } = await sp().from('campaigns')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', campaignId)
    if (e) { setError(e.message); return }
    setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, status } : c)))
    if (sel?.id === campaignId) { setSel((s) => ({ ...s, status })); setDraft((d) => ({ ...d, status })) }
  }

  async function openDrawer(c) {
    setSel(c); setDraft(c); setEditing(false)
    setLeadName(''); setLeadSponsorId(''); setPickOrg(''); setPickDeal(''); setPickLead('')
    await loadLeads(c.id)
    loadSponsors(); loadCrm(); loadLinks(c.id)
  }

  function closeDrawer() {
    if (busy || generating || savingLead) return
    setSel(null); setLeads([]); setSponsorMap({}); setLinkedOrgs([]); setLinkedDeals([])
  }

  // Org-Namen für eine Liste von sponsor_profiles (Extensions mit organization_id)
  // aus public.organizations nachladen und in die orgName-Map mergen.
  const loadOrgNames = useCallback(async (profiles) => {
    const orgIds = [...new Set((profiles || []).map((p) => p.organization_id).filter(Boolean))]
    if (!orgIds.length) return
    const { data } = await supabase.from('organizations').select('id, name').in('id', orgIds)
    if (data?.length) {
      setOrgName((prev) => ({ ...prev, ...Object.fromEntries(data.map((o) => [o.id, o.name])) }))
    }
  }, [])

  const loadLeads = useCallback(async (campaignId) => {
    if (!activeTeamId) return
    const { data, error: e } = await sp().from('campaign_leads').select('*')
      .eq('team_id', activeTeamId).eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
    if (e) { setError(e.message); return }
    const rows = data || []
    setLeads(rows)
    const ids = [...new Set(rows.map((r) => r.sponsor_profile_id).filter(Boolean))]
    if (ids.length) {
      const { data: profs } = await sp().from('sponsor_profiles').select('id, organization_id').in('id', ids)
      const list = profs || []
      setSponsorMap(Object.fromEntries(list.map((p) => [p.id, p])))
      await loadOrgNames(list)
    } else {
      setSponsorMap({})
    }
  }, [activeTeamId, loadOrgNames])

  const loadSponsors = useCallback(async () => {
    if (!activeTeamId) return
    const { data } = await sp().from('sponsor_profiles').select('id, organization_id')
      .eq('team_id', activeTeamId).order('created_at', { ascending: false })
    const list = data || []
    setSponsors(list)
    await loadOrgNames(list)
  }, [activeTeamId, loadOrgNames])

  async function saveDraft() {
    if (!sel) return
    setBusy(true); setError(null)
    const patch = {
      title: draft.title?.trim() || sel.title,
      industry: (draft.industry || '').trim() || null,
      persona: (draft.persona || '').trim() || null,
      expected_value: draft.expected_value === '' || draft.expected_value == null ? null : Number(draft.expected_value),
      responsible: draft.responsible || null,
      geo_scope: (draft.geo_scope || '').trim() || null,
      brand_voice_id: draft.brand_voice_id || null,
      target_audience_id: draft.target_audience_id || null,
      updated_at: new Date().toISOString(),
    }
    const { error: e } = await sp().from('campaigns').update(patch).eq('id', sel.id)
    if (e) { setError(e.message); setBusy(false); return }
    setBusy(false); setEditing(false)
    await fetchAll()
    // Auswahl aktualisieren ohne Drawer zu schliessen
    setSel((s) => ({ ...s, ...patch }))
    setDraft((d) => ({ ...d, ...patch }))
  }

  async function deleteCampaign(c) {
    if (!window.confirm(`Kampagne „${c.title}" wirklich loeschen?`)) return
    setBusy(true); setError(null)
    const { error: e } = await sp().from('campaigns').delete().eq('id', c.id)
    if (e) { setError(e.message); setBusy(false); return }
    setBusy(false)
    if (sel?.id === c.id) closeDrawer()
    await fetchAll()
  }

  async function addManualLead() {
    if (!activeTeamId || !sel || !leadName.trim()) return
    setSavingLead(true); setError(null)
    const { error: e } = await sp().from('campaign_leads').insert({
      team_id: activeTeamId,
      campaign_id: sel.id,
      external_name: leadName.trim(),
      sponsor_profile_id: leadSponsorId || null,
      source: 'manual',
    })
    if (e) { setError(e.message); setSavingLead(false); return }
    setLeadName(''); setLeadSponsorId('')
    await loadLeads(sel.id); setSavingLead(false)
  }

  async function deleteLead(leadId) {
    setError(null)
    const { error: e } = await sp().from('campaign_leads').delete().eq('id', leadId)
    if (e) { setError(e.message); return }
    setLeads((prev) => prev.filter((l) => l.id !== leadId)); loadCounts()
  }

  // ── Phase 2 (K2): bestehende CRM-Records laden + verknüpfen ──
  const loadCrm = useCallback(async () => {
    if (!activeTeamId) return
    const [o, d, l] = await Promise.all([
      supabase.from('organizations').select('id, name').eq('team_id', activeTeamId).order('name', { ascending: true }),
      supabase.from('deals').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      supabase.from('leads').select('id, first_name, last_name, company').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
    ])
    setAllOrgs(o.data || []); setAllDeals(d.data || []); setAllLeads(l.data || [])
  }, [activeTeamId])

  const loadLinks = useCallback(async (campaignId) => {
    if (!activeTeamId) return
    const [d, o] = await Promise.all([
      sp().from('campaign_deals').select('*').eq('team_id', activeTeamId).eq('campaign_id', campaignId),
      sp().from('campaign_organizations').select('*').eq('team_id', activeTeamId).eq('campaign_id', campaignId),
    ])
    setLinkedDeals(d.data || []); setLinkedOrgs(o.data || [])
  }, [activeTeamId])

  async function addOrg() {
    if (!sel || !pickOrg) return
    const { error: e } = await sp().from('campaign_organizations')
      .insert({ team_id: activeTeamId, campaign_id: sel.id, organization_id: pickOrg })
    if (e) { setError(e.message); return }
    setPickOrg(''); await loadLinks(sel.id); loadCounts()
  }
  async function removeOrg(rowId) {
    const { error: e } = await sp().from('campaign_organizations').delete().eq('id', rowId)
    if (e) { setError(e.message); return }
    setLinkedOrgs((prev) => prev.filter((x) => x.id !== rowId)); loadCounts()
  }
  async function addDeal() {
    if (!sel || !pickDeal) return
    const { error: e } = await sp().from('campaign_deals')
      .insert({ team_id: activeTeamId, campaign_id: sel.id, deal_id: pickDeal })
    if (e) { setError(e.message); return }
    setPickDeal(''); await loadLinks(sel.id); loadCounts()
  }
  async function removeDeal(rowId) {
    const { error: e } = await sp().from('campaign_deals').delete().eq('id', rowId)
    if (e) { setError(e.message); return }
    setLinkedDeals((prev) => prev.filter((x) => x.id !== rowId)); loadCounts()
  }
  async function addExistingLead() {
    if (!sel || !pickLead) return
    const { error: e } = await sp().from('campaign_leads')
      .insert({ team_id: activeTeamId, campaign_id: sel.id, lead_id: pickLead, source: 'crm' })
    if (e) { setError(e.message); return }
    setPickLead(''); await loadLeads(sel.id)
  }

  const orgLabel  = (id) => allOrgs.find((o) => o.id === id)?.name || '—'
  const dealLabel = (id) => { const d = allDeals.find((x) => x.id === id); return d ? (d.title || d.name || 'Deal') : '—' }
  const leadLabel = (id) => { const l = allLeads.find((x) => x.id === id); return l ? (`${l.first_name || ''} ${l.last_name || ''}`.trim() || l.company || 'Kontakt') : '' }

  async function adoptSuggestion(s) {
    if (!activeTeamId || !sel) return
    const name = suggestionName(s)
    if (!name) return
    setError(null)
    const { error: e } = await sp().from('campaign_leads').insert({
      team_id: activeTeamId,
      campaign_id: sel.id,
      external_name: name,
      source: 'suggestion',
    })
    if (e) { setError(e.message); return }
    await loadLeads(sel.id)
  }

  async function generateConcept() {
    if (!sel) return
    setGenerating(true); setError(null)
    const { data, error: e } = await supabase.functions.invoke('generate-campaign-concept', {
      body: { campaign_id: sel.id },
    })
    if (e || data?.error || data?.ok === false) {
      setError(e?.message || data?.error || 'Konzept-Generierung fehlgeschlagen')
      setGenerating(false); return
    }
    // Kampagne neu laden, um persistiertes concept zu erhalten (defensiv: data.concept als Fallback)
    const { data: fresh } = await sp().from('campaigns').select('*').eq('id', sel.id).maybeSingle()
    const merged = fresh || { ...sel, concept: data?.concept }
    setSel(merged); setDraft(merged)
    setCampaigns((prev) => prev.map((c) => (c.id === merged.id ? merged : c)))
    setGenerating(false)
  }

  if (!activeTeamId) {
    return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>
  }

  const concept = sel?.concept || null
  const channels = concept?.channels
  const suggestions = Array.isArray(concept?.lead_suggestions) ? concept.lead_suggestions : []

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader overline="Sponsoring" title="Kampagnen" subtitle="Sponsoring-Kampagnen planen, KI-Konzepte generieren und passende Sponsoren als Leads zuordnen." action={<button onClick={fetchAll} title="Aktualisieren" style={iconBtn}><RefreshCw size={16} /></button>} />

      {error && <div style={errBox}>{error}</div>}

      {/* Anlegen */}
      <form onSubmit={createCampaign} style={{
        display: 'grid', gridTemplateColumns: '1.6fr 1.1fr 1.1fr 0.9fr auto', gap: 10, alignItems: 'end',
        border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16, marginBottom: 22,
      }}>
        <Field label="Titel">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                 placeholder="z.B. Trikot-Hauptsponsor 2027" style={input} />
        </Field>
        <Field label="Branche">
          <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}
                 placeholder="z.B. Handwerk" style={input} />
        </Field>
        <Field label="Persona">
          <input value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })}
                 placeholder="z.B. Geschaeftsfuehrer KMU" style={input} />
        </Field>
        <Field label="Erw. Wert (€)">
          <input type="number" min="0" step="0.01" value={form.expected_value}
                 onChange={(e) => setForm({ ...form, expected_value: e.target.value })} placeholder="0" style={input} />
        </Field>
        <button type="submit" disabled={busy || !form.title.trim()} style={{ ...primaryBtn, opacity: busy || !form.title.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Anlegen
        </button>

        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          <Field label="Verantwortlich">
            <select value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} style={input}>
              <option value="">— niemand —</option>
              {(members || []).map((m) => <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>)}
            </select>
          </Field>
          <Field label="Geo-Scope">
            <input value={form.geo_scope} onChange={(e) => setForm({ ...form, geo_scope: e.target.value })}
                   placeholder="z.B. Region Stuttgart" style={input} />
          </Field>
          <Field label="Brand Voice">
            <select value={form.brand_voice_id} onChange={(e) => setForm({ ...form, brand_voice_id: e.target.value })} style={input}>
              <option value="">— keine —</option>
              {brandVoices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Zielgruppe">
            <select value={form.target_audience_id} onChange={(e) => setForm({ ...form, target_audience_id: e.target.value })} style={input}>
              <option value="">— keine —</option>
              {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
      </form>

      {/* Liste */}
      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade Kampagnen…</div>
      ) : campaigns.length === 0 ? (
        <div style={muted}>Noch keine Kampagnen angelegt.</div>
      ) : (
        <div style={tableWrap}>
          <table style={table}>
            <thead><tr style={trHead}>
              <th style={th}>Kampagne</th><th style={th}>Branche</th><th style={th}>Persona</th>
              <th style={th}>Verknüpft</th><th style={th}>Pipeline</th>
              <th style={th}>Erw. Wert</th><th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={{ ...trBody, cursor: 'pointer' }} onClick={() => openDrawer(c)}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{c.title}</td>
                  <td style={td}>{c.industry || '—'}</td>
                  <td style={td}>{c.persona || '—'}</td>
                  <td style={td}>
                    {(() => {
                      const k = counts[c.id] || { leads: 0, orgs: 0, deals: 0 }
                      const chip = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: bg, color: fg, marginRight: 4 })
                      if (!k.leads && !k.orgs && !k.deals) return <span style={{ color: 'var(--text-muted)' }}>—</span>
                      return (
                        <span style={{ whiteSpace: 'nowrap' }}>
                          {k.leads > 0 && <span style={chip('#EFF6FF', '#1d4ed8')} title="Kontakte">{k.leads} K</span>}
                          {k.orgs > 0 && <span style={chip('#F0FDF4', '#059669')} title="Unternehmen">{k.orgs} U</span>}
                          {k.deals > 0 && <span style={chip('#FFFBEB', '#B45309')} title="Deals">{k.deals} D</span>}
                        </span>
                      )
                    })()}
                  </td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {counts[c.id]?.value ? `${Number(counts[c.id].value).toLocaleString('de-DE')} €` : '—'}
                  </td>
                  <td style={td}>{c.expected_value != null ? `${Number(c.expected_value).toLocaleString('de-DE')} €` : '—'}</td>
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    <select value={c.status || 'draft'} onChange={(e) => updateStatus(c.id, e.target.value)}
                            style={{ ...input, padding: '4px 8px', color: STATUS_COLOR[c.status] || 'var(--text-strong)', fontWeight: 600 }}>
                      {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail-Drawer */}
      {sel && (
        <div style={overlay} onClick={closeDrawer}>
          <div style={drawer} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', margin: 0 }}>{sel.title}</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => deleteCampaign(sel)} title="Loeschen" style={{ ...iconBtn, color: '#DC2626' }}><Trash2 size={16} /></button>
                <button onClick={closeDrawer} title="Schliessen" style={iconBtn}><X size={16} /></button>
              </div>
            </div>

            {/* Stammdaten / Bearbeiten */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16, background: 'var(--surface-muted, #F8FAFC)' }}>
              {!editing ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 13 }}>
                    <Meta label="Branche" value={sel.industry} />
                    <Meta label="Persona" value={sel.persona} />
                    <Meta label="Erw. Wert" value={sel.expected_value != null ? `${Number(sel.expected_value).toLocaleString('de-DE')} €` : null} />
                    <Meta label="Geo-Scope" value={sel.geo_scope} />
                    <Meta label="Verantwortlich" value={memberLabel((members || []).find((m) => m.user_id === sel.responsible))} />
                    <Meta label="Brand Voice" value={bvName(sel.brand_voice_id)} />
                    <Meta label="Zielgruppe" value={taName(sel.target_audience_id)} />
                    <Meta label="Status" value={STATUS_LABEL[sel.status] || sel.status} />
                  </div>
                  <button onClick={() => { setDraft(sel); setEditing(true) }} style={{ ...secondaryBtn, marginTop: 12 }}>Bearbeiten</button>
                </>
              ) : (
                <>
                  <Field label="Titel">
                    <input value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={input} />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Branche">
                      <input value={draft.industry || ''} onChange={(e) => setDraft({ ...draft, industry: e.target.value })} style={input} />
                    </Field>
                    <Field label="Persona">
                      <input value={draft.persona || ''} onChange={(e) => setDraft({ ...draft, persona: e.target.value })} style={input} />
                    </Field>
                    <Field label="Erw. Wert (€)">
                      <input type="number" min="0" step="0.01" value={draft.expected_value ?? ''}
                             onChange={(e) => setDraft({ ...draft, expected_value: e.target.value })} style={input} />
                    </Field>
                    <Field label="Geo-Scope">
                      <input value={draft.geo_scope || ''} onChange={(e) => setDraft({ ...draft, geo_scope: e.target.value })} style={input} />
                    </Field>
                    <Field label="Verantwortlich">
                      <select value={draft.responsible || ''} onChange={(e) => setDraft({ ...draft, responsible: e.target.value })} style={input}>
                        <option value="">— niemand —</option>
                        {(members || []).map((m) => <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>)}
                      </select>
                    </Field>
                    <Field label="Brand Voice">
                      <select value={draft.brand_voice_id || ''} onChange={(e) => setDraft({ ...draft, brand_voice_id: e.target.value })} style={input}>
                        <option value="">— keine —</option>
                        {brandVoices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Zielgruppe">
                      <select value={draft.target_audience_id || ''} onChange={(e) => setDraft({ ...draft, target_audience_id: e.target.value })} style={input}>
                        <option value="">— keine —</option>
                        {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={saveDraft} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                      {busy ? <Loader2 size={14} className="spin" /> : null} Speichern
                    </button>
                    <button onClick={() => setEditing(false)} disabled={busy} style={secondaryBtn}>Abbrechen</button>
                  </div>
                </>
              )}
            </div>

            {/* KI-Konzept */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h3 style={sectionH}>KI-Konzept</h3>
                <button onClick={generateConcept} disabled={generating} style={{ ...primaryBtn, opacity: generating ? 0.6 : 1 }}>
                  {generating ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                  {generating ? 'Generiere…' : 'KI-Konzept generieren'}
                </button>
              </div>

              {!concept ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  Noch kein Konzept. Klicke auf „KI-Konzept generieren", um Aktivierungs-Idee, Storytelling,
                  Kanaele, Outreach-Botschaft und Sponsor-Vorschlaege zu erhalten.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {concept.activation_idea && <ConceptBlock title="Aktivierungs-Idee" body={concept.activation_idea} />}
                  {concept.storytelling && <ConceptBlock title="Storytelling" body={concept.storytelling} />}
                  {channels != null && channels !== '' && (
                    <ConceptBlock title="Kanaele" body={Array.isArray(channels) ? channels.filter(Boolean).join(', ') : channels} />
                  )}
                  {concept.outreach_message && <ConceptBlock title="Outreach-Botschaft" body={concept.outreach_message} />}

                  {suggestions.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Sponsor-Vorschlaege</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {suggestions.map((s, i) => {
                          const name = suggestionName(s)
                          if (!name) return null
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: 13, color: 'var(--text-strong)' }}>{name}</span>
                              <button onClick={() => adoptSuggestion(s)} style={secondaryBtn}>
                                <UserPlus size={13} /> Uebernehmen
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Zugeordnete Leads */}
            <div>
              <h3 style={sectionH}>Zugeordnete Kontakte</h3>
              {/* Bestehenden CRM-Kontakt zuordnen (keine Duplikate) */}
              <div style={{ display: 'flex', gap: 8, margin: '10px 0 6px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="Bestehenden Kontakt zuordnen">
                    <select value={pickLead} onChange={(e) => setPickLead(e.target.value)} style={input}>
                      <option value="">— Kontakt wählen —</option>
                      {allLeads.map((l) => <option key={l.id} value={l.id}>{leadLabel(l.id)}{l.company ? ' · ' + l.company : ''}</option>)}
                    </select>
                  </Field>
                </div>
                <button onClick={addExistingLead} disabled={!pickLead} style={{ ...primaryBtn, opacity: !pickLead ? 0.6 : 1 }}><Plus size={14} /></button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>oder externen Namen erfassen (außerhalb CRM):</div>
              <div style={{ display: 'flex', gap: 8, margin: '0 0 12px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="Name">
                    <input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Sponsor-/Lead-Name" style={input} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Sponsor (optional)">
                    <select value={leadSponsorId} onChange={(e) => setLeadSponsorId(e.target.value)} style={input}>
                      <option value="">— keiner —</option>
                      {sponsors.map((p) => <option key={p.id} value={p.id}>{sponsorName(p, orgName) || p.id}</option>)}
                    </select>
                  </Field>
                </div>
                <button onClick={addManualLead} disabled={savingLead || !leadName.trim()}
                        style={{ ...primaryBtn, opacity: savingLead || !leadName.trim() ? 0.6 : 1 }}>
                  {savingLead ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                </button>
              </div>

              {leads.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Noch keine Leads zugeordnet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {leads.map((l) => {
                    const prof = l.sponsor_profile_id ? sponsorMap[l.sponsor_profile_id] : null
                    const label = sponsorName(prof, orgName) || leadLabel(l.lead_id) || l.external_name || '—'
                    return (
                      <div key={l.id} style={leadRow}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                          {l.source === 'suggestion' && <span style={tag}>KI</span>}
                        </div>
                        <button onClick={() => deleteLead(l.id)} title="Entfernen" style={{ ...iconBtnSm, color: '#DC2626' }}><Trash2 size={14} /></button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Verknüpfte Unternehmen (bestehende CRM-Datensätze) */}
            <div>
              <h3 style={sectionH}>Verknüpfte Unternehmen</h3>
              <div style={{ display: 'flex', gap: 8, margin: '10px 0 12px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="Bestehendes Unternehmen zuordnen">
                    <select value={pickOrg} onChange={(e) => setPickOrg(e.target.value)} style={input}>
                      <option value="">— Unternehmen wählen —</option>
                      {allOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </Field>
                </div>
                <button onClick={addOrg} disabled={!pickOrg} style={{ ...primaryBtn, opacity: !pickOrg ? 0.6 : 1 }}><Plus size={14} /></button>
              </div>
              {linkedOrgs.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Noch keine Unternehmen verknüpft.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {linkedOrgs.map((r) => (
                    <div key={r.id} style={leadRow}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orgLabel(r.organization_id)}</span>
                      <button onClick={() => removeOrg(r.id)} title="Entfernen" style={{ ...iconBtnSm, color: '#DC2626' }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verknüpfte Deals (bestehende CRM-Datensätze) */}
            <div>
              <h3 style={sectionH}>Verknüpfte Deals</h3>
              <div style={{ display: 'flex', gap: 8, margin: '10px 0 12px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="Bestehenden Deal zuordnen">
                    <select value={pickDeal} onChange={(e) => setPickDeal(e.target.value)} style={input}>
                      <option value="">— Deal wählen —</option>
                      {allDeals.map((d) => <option key={d.id} value={d.id}>{(d.title || d.name || 'Deal')}{d.value ? ' · ' + Number(d.value).toLocaleString('de-DE') + ' €' : ''}</option>)}
                    </select>
                  </Field>
                </div>
                <button onClick={addDeal} disabled={!pickDeal} style={{ ...primaryBtn, opacity: !pickDeal ? 0.6 : 1 }}><Plus size={14} /></button>
              </div>
              {linkedDeals.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Noch keine Deals verknüpft.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {linkedDeals.map((r) => (
                    <div key={r.id} style={leadRow}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dealLabel(r.deal_id)}</span>
                      <button onClick={() => removeDeal(r.id)} title="Entfernen" style={{ ...iconBtnSm, color: '#DC2626' }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

function Meta({ label, value }) {
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}:</span>
      <span style={{ color: 'var(--text-strong)' }}>{value || '—'}</span>
    </span>
  )
}

function ConceptBlock({ title, body }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-strong)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{String(body)}</div>
    </div>
  )
}

const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }
const iconBtnSm = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const tableWrap = { border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }
const trHead = { background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }
const trBody = { borderTop: '1px solid var(--border)' }
const th = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '10px 14px', color: 'var(--text-strong)' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }
const drawer = { width: 'min(520px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: 24, boxShadow: '-12px 0 40px rgba(0,0,0,0.18)' }
const sectionH = { fontSize: 14, fontWeight: 800, color: 'var(--text-strong)', margin: 0 }
const leadRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }
const tag = { fontSize: 10, fontWeight: 700, color: PRIMARY, background: 'var(--surface-muted, #EEF2FF)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 999 }
