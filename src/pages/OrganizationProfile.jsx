// src/pages/OrganizationProfile.jsx
// Detailseite einer Organisation — /organizations/:id
// Tabs: Übersicht · Kontakte · Deals

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useTeam } from '../context/TeamContext'
import { EMPLOYEE_RANGES, EMPLOYEE_LABEL, REVENUE_RANGES, REVENUE_LABEL } from '../constants/orgLabels'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

const STAGE_COLORS = {
  prospect:    { label: 'Interessent',  color: '#6B7280', bg: '#F3F4F6' },
  opportunity: { label: 'Qualifiziert', color: '#185FA5', bg: '#EFF6FF' },
  angebot:     { label: 'Angebot',      color: '#D97706', bg: '#FFFBEB' },
  verhandlung: { label: 'Verhandlung',  color: '#7C3AED', bg: '#F5F3FF' },
  gewonnen:    { label: 'Gewonnen',     color: '#059669', bg: '#ECFDF5' },
  verloren:    { label: 'Verloren',     color: '#DC2626', bg: '#FEF2F2' },
  kein_deal:   { label: 'Kein Deal',    color: '#9CA3AF', bg: '#F9FAFB' },
}

function fmtEur(v) { if (!v && v !== 0) return '—'; return '€' + Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0 }) }

export default function OrganizationProfile({ session }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()
  const uid = session?.user?.id

  const [org,        setOrg]        = useState(null)
  const [leads,      setLeads]      = useState([])
  const [deals,      setDeals]      = useState([])
  const [industries, setIndustries] = useState([])
  const [tab,        setTab]        = useState('overview')
  const [editing,    setEditing]    = useState(false)
  const [editForm,   setEditForm]   = useState({})
  const [saving,     setSaving]     = useState(false)
  const [loading,    setLoading]    = useState(true)
  // Add-Contact (Lead zu Organisation verknüpfen)
  const [addOpen,    setAddOpen]    = useState(false)
  const [addQuery,   setAddQuery]   = useState('')
  const [addMatches, setAddMatches] = useState([])
  const [adding,     setAdding]     = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const [{ data: orgData }, { data: leadsData }, { data: dealsData }, { data: indData }] = await Promise.all([
      supabase.from('organizations').select('*, parent:parent_organization_id(id,name)').eq('id', id).maybeSingle(),
      supabase.from('leads').select('id,first_name,last_name,email,phone,job_title,deal_stage,hs_score').eq('organization_id', id).order('last_name'),
      supabase.from('deals').select('id,title,value,stage,probability,expected_close_date').eq('organization_id', id).order('created_at', { ascending: false }),
      supabase.from('industries').select('slug,label_de').order('sort_order'),
    ])
    setOrg(orgData)
    setLeads(leadsData || [])
    setDeals(dealsData || [])
    setIndustries(indData || [])
    if (orgData) setEditForm(orgData)
    setLoading(false)
  }

  // Lead-Suche für "+ Kontakt hinzufügen" — filtert Leads der User/Team-Skope, die NICHT schon zu dieser Org gehören
  async function searchLeadsForAdd(q) {
    const trimmed = (q||'').trim()
    const base = supabase.from('leads').select('id,first_name,last_name,email,job_title,organization_id')
    const scoped = activeTeamId ? base.eq('team_id', activeTeamId) : base.eq('user_id', uid).is('team_id', null)
    let query = scoped
    if (trimmed) {
      const esc = trimmed.replace(/[%,]/g, '')
      query = query.or(`first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,email.ilike.%${esc}%`)
    }
    const { data } = await query.limit(20)
    // Nur die nicht-bereits-verknüpften Leads anzeigen
    setAddMatches((data || []).filter(l => l.organization_id !== id))
  }

  async function addContactToOrg(leadId) {
    setAdding(true)
    const { error } = await supabase.from('leads').update({ organization_id: id }).eq('id', leadId)
    setAdding(false)
    if (!error) {
      setAddOpen(false); setAddQuery(''); setAddMatches([])
      load()
    }
  }

  const industryLabel = org?.industry_slug
    ? (industries.find(i => i.slug === org.industry_slug)?.label_de || org.industry_slug)
    : null

  async function saveEdit() {
    setSaving(true)
    try {
      // ENUMs getrennt speichern — Silent-Fail-Falle
      const { employee_range, revenue_range, ...rest } = editForm
      const payload = {
        name: rest.name?.trim() || org.name,
        website: rest.website?.trim() || null,
        linkedin_company_url: rest.linkedin_company_url?.trim() || null,
        email_central: rest.email_central?.trim() || null,
        phone_central: rest.phone_central?.trim() || null,
        vat_id: rest.vat_id?.trim() || null,
        tax_id: rest.tax_id?.trim() || null,
        street: rest.street?.trim() || null,
        zip: rest.zip?.trim() || null,
        city: rest.city?.trim() || null,
        state: rest.state?.trim() || null,
        country: rest.country?.trim() || null,
        billing_street: rest.billing_street?.trim() || null,
        billing_zip: rest.billing_zip?.trim() || null,
        billing_city: rest.billing_city?.trim() || null,
        billing_state: rest.billing_state?.trim() || null,
        billing_country: rest.billing_country?.trim() || null,
        industry_slug: rest.industry_slug || null,
        notes: rest.notes?.trim() || null,
      }
      const { error: e1 } = await supabase.from('organizations').update(payload).eq('id', id)
      if (e1) throw e1
      if (employee_range !== org.employee_range) {
        await supabase.from('organizations').update({ employee_range: employee_range || null }).eq('id', id)
      }
      if (revenue_range !== org.revenue_range) {
        await supabase.from('organizations').update({ revenue_range: revenue_range || null }).eq('id', id)
      }
      await load()
      setEditing(false)
    } catch (e) {
      alert('Speichern fehlgeschlagen: ' + (e.message || e))
    } finally { setSaving(false) }
  }

  async function deleteOrg() {
    if (!window.confirm(`Organisation "${org.name}" wirklich löschen? Verknüpfungen an Kontakten und Deals werden auf leer gesetzt (nicht gelöscht).`)) return
    const { error } = await supabase.from('organizations').delete().eq('id', id)
    if (error) { alert('Löschen fehlgeschlagen: ' + error.message); return }
    navigate('/organizations')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>⏳ Lädt…</div>
  if (!org) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 15, color: '#6B7280', marginBottom: 12 }}>Organisation nicht gefunden</div>
      <button onClick={() => navigate('/organizations')} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #E4E7EC', background: 'var(--surface)', fontSize: 13, color: PRIMARY, cursor: 'pointer' }}>← Zurück zur Liste</button>
    </div>
  )

  const dealSum    = deals.reduce((s,d) => s + (Number(d.value)||0), 0)
  const wonSum     = deals.filter(d => d.stage === 'gewonnen').reduce((s,d) => s + (Number(d.value)||0), 0)
  const openDeals  = deals.filter(d => !['gewonnen','verloren'].includes(d.stage))

  const labelS = { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }
  const inputS = { width: '100%', padding: '8px 12px', border: '1.5px solid #E4E7EC', borderRadius: 9, fontSize: 13, outline: 'none', background: 'var(--surface)', color: 'var(--text-primary, #111827)' }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16 }}>
        <Link to="/organizations" style={{ fontSize: 12, color: '#6B7280', textDecoration: 'none' }}>← Organisationen</Link>
      </div>

      {/* Header */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid #E4E7EC', padding: '22px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 60, height: 60, borderRadius: 14, background: 'rgba(49,90,231,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
            🏢
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary, #111827)', margin: 0, marginBottom: 4 }}>{org.name}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: '#6B7280' }}>
              {industryLabel && <span>📊 {industryLabel}</span>}
              {org.city && <span>📍 {org.city}{org.country ? `, ${org.country}` : ''}</span>}
              {org.employee_range && <span>👥 {EMPLOYEE_LABEL[org.employee_range]}</span>}
              {org.revenue_range && <span>💰 {REVENUE_LABEL[org.revenue_range]}</span>}
              {org.parent && <span>🏛 Teil von <Link to={`/organizations/${org.parent.id}`} style={{ color: PRIMARY, textDecoration: 'none' }}>{org.parent.name}</Link></span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!editing && <button onClick={() => setEditing(true)} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #E4E7EC', background: 'var(--surface)', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>✏ Bearbeiten</button>}
            {editing && (
              <>
                <button onClick={() => { setEditing(false); setEditForm(org) }} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #E4E7EC', background: 'var(--surface)', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>Abbrechen</button>
                <button onClick={saveEdit} disabled={saving} style={{ padding: '7px 16px', borderRadius: 9, border: 'none', background: PRIMARY, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? '⏳…' : '✓ Speichern'}</button>
              </>
            )}
          </div>
        </div>

        {/* KPI-Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 18 }}>
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Kontakte</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{leads.length}</div>
          </div>
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Offene Deals</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{openDeals.length}</div>
          </div>
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pipeline gesamt</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{fmtEur(dealSum)}</div>
          </div>
          <div style={{ background: '#ECFDF5', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gewonnen</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{fmtEur(wonSum)}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1.5px solid #E4E7EC', marginBottom: 18 }}>
        {[
          { id: 'overview', label: 'Übersicht' },
          { id: 'contacts', label: `Kontakte (${leads.length})` },
          { id: 'deals',    label: `Deals (${deals.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '10px 18px', border: 'none', background: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              color: tab === t.id ? PRIMARY : '#6B7280',
              borderBottom: '2.5px solid ' + (tab === t.id ? PRIMARY : 'transparent'),
              marginBottom: -1.5 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Übersicht */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Section title="Kontakt Zentrale">
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Website"><input value={editForm.website||''} onChange={e => setEditForm(f => ({...f, website: e.target.value}))} style={inputS}/></Field>
                <Field label="LinkedIn"><input value={editForm.linkedin_company_url||''} onChange={e => setEditForm(f => ({...f, linkedin_company_url: e.target.value}))} style={inputS}/></Field>
                <Field label="E-Mail Zentrale"><input value={editForm.email_central||''} onChange={e => setEditForm(f => ({...f, email_central: e.target.value}))} style={inputS}/></Field>
                <Field label="Telefon Zentrale"><input value={editForm.phone_central||''} onChange={e => setEditForm(f => ({...f, phone_central: e.target.value}))} style={inputS}/></Field>
              </div>
            ) : (
              <KeyVal items={[
                { k: 'Website', v: org.website, href: org.website },
                { k: 'LinkedIn', v: org.linkedin_company_url, href: org.linkedin_company_url },
                { k: 'E-Mail', v: org.email_central, href: org.email_central ? `mailto:${org.email_central}` : null },
                { k: 'Telefon', v: org.phone_central, href: org.phone_central ? `tel:${org.phone_central}` : null },
              ]}/>
            )}
          </Section>

          <Section title="Identifikation">
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="USt-ID"><input value={editForm.vat_id||''} onChange={e => setEditForm(f => ({...f, vat_id: e.target.value}))} style={inputS}/></Field>
                <Field label="Steuernummer"><input value={editForm.tax_id||''} onChange={e => setEditForm(f => ({...f, tax_id: e.target.value}))} style={inputS}/></Field>
              </div>
            ) : (
              <KeyVal items={[
                { k: 'USt-ID', v: org.vat_id },
                { k: 'Steuernummer', v: org.tax_id },
              ]}/>
            )}
          </Section>

          <Section title="Adresse">
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Straße"><input value={editForm.street||''} onChange={e => setEditForm(f => ({...f, street: e.target.value}))} style={inputS}/></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8 }}>
                  <Field label="PLZ"><input value={editForm.zip||''} onChange={e => setEditForm(f => ({...f, zip: e.target.value}))} style={inputS}/></Field>
                  <Field label="Ort"><input value={editForm.city||''} onChange={e => setEditForm(f => ({...f, city: e.target.value}))} style={inputS}/></Field>
                </div>
                <Field label="Land"><input value={editForm.country||''} onChange={e => setEditForm(f => ({...f, country: e.target.value}))} style={inputS}/></Field>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                {org.street && <div>{org.street}</div>}
                {(org.zip || org.city) && <div>{[org.zip, org.city].filter(Boolean).join(' ')}</div>}
                {org.country && <div>{org.country}</div>}
                {!org.street && !org.city && !org.country && <div style={{ color: '#9CA3AF' }}>— keine Adresse —</div>}
              </div>
            )}
          </Section>

          <Section title="Rechnungsadresse">
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Straße"><input value={editForm.billing_street||''} onChange={e => setEditForm(f => ({...f, billing_street: e.target.value}))} style={inputS}/></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8 }}>
                  <Field label="PLZ"><input value={editForm.billing_zip||''} onChange={e => setEditForm(f => ({...f, billing_zip: e.target.value}))} style={inputS}/></Field>
                  <Field label="Ort"><input value={editForm.billing_city||''} onChange={e => setEditForm(f => ({...f, billing_city: e.target.value}))} style={inputS}/></Field>
                </div>
                <Field label="Land"><input value={editForm.billing_country||''} onChange={e => setEditForm(f => ({...f, billing_country: e.target.value}))} style={inputS}/></Field>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                {org.billing_street && <div>{org.billing_street}</div>}
                {(org.billing_zip || org.billing_city) && <div>{[org.billing_zip, org.billing_city].filter(Boolean).join(' ')}</div>}
                {org.billing_country && <div>{org.billing_country}</div>}
                {!org.billing_street && !org.billing_city && <div style={{ color: '#9CA3AF' }}>— identisch mit Hauptadresse —</div>}
              </div>
            )}
          </Section>

          <Section title="Kategorisierung">
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Mitarbeiteranzahl">
                  <select value={editForm.employee_range||''} onChange={e => setEditForm(f => ({...f, employee_range: e.target.value}))} style={inputS}>
                    <option value="">— keine Angabe —</option>
                    {EMPLOYEE_RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="Umsatz">
                  <select value={editForm.revenue_range||''} onChange={e => setEditForm(f => ({...f, revenue_range: e.target.value}))} style={inputS}>
                    <option value="">— keine Angabe —</option>
                    {REVENUE_RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="Branche">
                  <select value={editForm.industry_slug||''} onChange={e => setEditForm(f => ({...f, industry_slug: e.target.value}))} style={inputS}>
                    <option value="">— keine Angabe —</option>
                    {industries.map(i => <option key={i.slug} value={i.slug}>{i.label_de}</option>)}
                  </select>
                </Field>
              </div>
            ) : (
              <KeyVal items={[
                { k: 'Mitarbeiter', v: org.employee_range ? EMPLOYEE_LABEL[org.employee_range] : null },
                { k: 'Umsatz', v: org.revenue_range ? REVENUE_LABEL[org.revenue_range] : null },
                { k: 'Branche', v: industryLabel },
              ]}/>
            )}
          </Section>

          <Section title="Notizen">
            {editing ? (
              <textarea value={editForm.notes||''} onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} rows={5} style={{ ...inputS, fontFamily: 'inherit', resize: 'vertical' }}/>
            ) : (
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {org.notes || <span style={{ color: '#9CA3AF' }}>— keine Notizen —</span>}
              </div>
            )}
          </Section>

          {!editing && (
            <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
              <button onClick={deleteOrg} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #FECACA', background: 'var(--surface)', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#DC2626' }}>🗑 Organisation löschen</button>
            </div>
          )}
        </div>
      )}

      {/* Kontakte */}
      {tab === 'contacts' && (
        <>
          {/* Add-Contact Control */}
          <div style={{ marginBottom: 12 }}>
            {!addOpen ? (
              <button
                onClick={() => { setAddOpen(true); searchLeadsForAdd('') }}
                style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                + Kontakt hinzufügen
              </button>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid #E4E7EC', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={addQuery}
                    onChange={e => { setAddQuery(e.target.value); searchLeadsForAdd(e.target.value) }}
                    placeholder="Nach Name oder E-Mail suchen…"
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                  <button
                    onClick={() => { setAddOpen(false); setAddQuery(''); setAddMatches([]) }}
                    style={{ background: 'transparent', border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#6B7280', cursor: 'pointer' }}>
                    Abbrechen
                  </button>
                </div>
                {addMatches.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
                    {addMatches.map(l => (
                      <div key={l.id}
                        onClick={() => !adding && addContactToOrg(l.id)}
                        style={{ padding: '8px 12px', borderRadius: 6, cursor: adding ? 'wait' : 'pointer', background: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 10, opacity: adding ? 0.5 : 1 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                        onMouseLeave={e => e.currentTarget.style.background = '#F9FAFB'}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6B7280' }}>
                          {(l.first_name?.[0] || '') + (l.last_name?.[0] || '')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                            {[l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || '—'}
                          </div>
                          {l.job_title && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{l.job_title}</div>}
                        </div>
                        {l.organization_id && <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 600 }}>verknüpft mit anderer Org</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 4px' }}>
                    {addQuery ? 'Keine passenden Leads gefunden.' : 'Tippe um zu suchen oder lass leer für alle verfügbaren Leads.'}
                  </div>
                )}
              </div>
            )}
          </div>
          {leads.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
            Noch keine Kontakte mit dieser Organisation verknüpft.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {leads.map(l => (
              <Link key={l.id} to={`/leads/${l.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid #E4E7EC', borderRadius: 11, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#6B7280', flexShrink: 0 }}>
                    {(l.first_name?.[0] || '') + (l.last_name?.[0] || '')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                      {[l.first_name, l.last_name].filter(Boolean).join(' ') || '—'}
                    </div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>{l.job_title || '—'}</div>
                  </div>
                  {l.deal_stage && STAGE_COLORS[l.deal_stage] && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: STAGE_COLORS[l.deal_stage].bg, color: STAGE_COLORS[l.deal_stage].color }}>
                      {STAGE_COLORS[l.deal_stage].label}
                    </span>
                  )}
                  {typeof l.hs_score === 'number' && (
                    <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 700 }}>Score {l.hs_score}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
        </>
      )}

      {/* Deals */}
      {tab === 'deals' && (
        deals.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
            Noch keine Deals mit dieser Organisation verknüpft.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {deals.map(d => {
              const s = STAGE_COLORS[d.stage] || STAGE_COLORS.prospect
              return (
                <div key={d.id} onClick={() => navigate('/deals')} style={{ cursor: 'pointer', background: 'var(--surface)', border: '1px solid #E4E7EC', borderRadius: 11, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>{d.title}</div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>
                      <span style={{ padding: '1px 7px', borderRadius: 99, background: s.bg, color: s.color, fontWeight: 700 }}>{s.label}</span>
                      {d.expected_close_date && <span style={{ marginLeft: 8 }}>📅 {new Date(d.expected_close_date).toLocaleDateString('de-DE')}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{fmtEur(d.value)}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{d.probability}% WSK</div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

// ── kleine Helfer-Komponenten ─────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid #E4E7EC', borderRadius: 13, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function KeyVal({ items }) {
  const shown = items.filter(i => i.v)
  if (shown.length === 0) return <div style={{ fontSize: 12, color: '#9CA3AF' }}>— keine Angaben —</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {shown.map(i => (
        <div key={i.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
          <span style={{ color: '#6B7280', flexShrink: 0 }}>{i.k}</span>
          {i.href
            ? <a href={i.href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wl-primary, rgb(49,90,231))', textDecoration: 'none', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.v}</a>
            : <span style={{ color: 'var(--text-primary, #111827)', fontWeight: 600, textAlign: 'right' }}>{i.v}</span>}
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
