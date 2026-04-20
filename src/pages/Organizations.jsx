// src/pages/Organizations.jsx
// Listen-Ansicht aller Organisationen/Firmen + Modal "Neue Organisation"
// Orientiert sich am Deals.jsx-Pattern (KPIs, Filter, Suche, Liste, Modal)

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useTeam } from '../context/TeamContext'
import { EMPLOYEE_RANGES, EMPLOYEE_LABEL, REVENUE_RANGES, REVENUE_LABEL } from '../constants/orgLabels'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

// ── Modal "Neue / Bearbeiten" ──────────────────────────────────────────────────
function OrganizationModal({ org, industries, teamId, uid, onSave, onClose }) {
  const [form, setForm] = useState({
    name: org?.name || '',
    website: org?.website || '',
    linkedin_company_url: org?.linkedin_company_url || '',
    email_central: org?.email_central || '',
    phone_central: org?.phone_central || '',
    vat_id: org?.vat_id || '',
    tax_id: org?.tax_id || '',
    street: org?.street || '',
    zip: org?.zip || '',
    city: org?.city || '',
    state: org?.state || '',
    country: org?.country || '',
    billing_street: org?.billing_street || '',
    billing_zip: org?.billing_zip || '',
    billing_city: org?.billing_city || '',
    billing_state: org?.billing_state || '',
    billing_country: org?.billing_country || '',
    employee_range: org?.employee_range || '',
    revenue_range: org?.revenue_range || '',
    industry_slug: org?.industry_slug || '',
    notes: org?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [showBilling, setShowBilling] = useState(!!(org?.billing_street || org?.billing_zip || org?.billing_city))

  function upd(patch) { setForm(f => ({ ...f, ...patch })) }

  async function save() {
    if (!form.name.trim()) { setErr('Name ist Pflicht'); return }
    setSaving(true); setErr(null)

    // ENUMs NICHT mit anderen Feldern mischen (crm_company_size + org_revenue_range) → silent-fail-Falle
    const payloadBase = {
      name: form.name.trim(),
      website: form.website.trim() || null,
      linkedin_company_url: form.linkedin_company_url.trim() || null,
      email_central: form.email_central.trim() || null,
      phone_central: form.phone_central.trim() || null,
      vat_id: form.vat_id.trim() || null,
      tax_id: form.tax_id.trim() || null,
      street: form.street.trim() || null,
      zip: form.zip.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || null,
      billing_street: form.billing_street.trim() || null,
      billing_zip: form.billing_zip.trim() || null,
      billing_city: form.billing_city.trim() || null,
      billing_state: form.billing_state.trim() || null,
      billing_country: form.billing_country.trim() || null,
      industry_slug: form.industry_slug || null,
      notes: form.notes.trim() || null,
    }

    try {
      let orgId = org?.id
      if (org?.id) {
        // UPDATE: Basis erst
        const { error: e1 } = await supabase.from('organizations').update(payloadBase).eq('id', org.id)
        if (e1) throw e1
      } else {
        // INSERT: mit Ownership
        const insertRow = { ...payloadBase, user_id: teamId ? null : uid, team_id: teamId || null, created_by: uid }
        const { data, error: e1 } = await supabase.from('organizations').insert(insertRow).select('id').single()
        if (e1) throw e1
        orgId = data.id
      }
      // ENUMs separat speichern (Silent-Fail-Falle vermeiden)
      if (form.employee_range) {
        await supabase.from('organizations').update({ employee_range: form.employee_range }).eq('id', orgId)
      } else if (org?.employee_range) {
        await supabase.from('organizations').update({ employee_range: null }).eq('id', orgId)
      }
      if (form.revenue_range) {
        await supabase.from('organizations').update({ revenue_range: form.revenue_range }).eq('id', orgId)
      } else if (org?.revenue_range) {
        await supabase.from('organizations').update({ revenue_range: null }).eq('id', orgId)
      }
      onSave?.(orgId)
    } catch (e) {
      setErr(e.message || String(e))
    } finally { setSaving(false) }
  }

  const labelS = { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }
  const inputS = { width: '100%', padding: '8px 12px', border: '1.5px solid #E4E7EC', borderRadius: 9, fontSize: 13, outline: 'none', background: 'var(--surface)', color: 'var(--text-primary, #111827)' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{org?.id ? 'Organisation bearbeiten' : 'Neue Organisation'}</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#F3F4F6', cursor: 'pointer', fontSize: 16, color: '#6B7280' }}>×</button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Stammdaten */}
          <div>
            <div style={labelS}>Name *</div>
            <input value={form.name} onChange={e => upd({ name: e.target.value })} style={inputS} placeholder="z.B. Deutsche Bank AG"/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelS}>Website</div>
              <input value={form.website} onChange={e => upd({ website: e.target.value })} style={inputS} placeholder="https://…"/>
            </div>
            <div>
              <div style={labelS}>LinkedIn (Unternehmen)</div>
              <input value={form.linkedin_company_url} onChange={e => upd({ linkedin_company_url: e.target.value })} style={inputS} placeholder="https://linkedin.com/company/…"/>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelS}>E-Mail Zentrale</div>
              <input value={form.email_central} onChange={e => upd({ email_central: e.target.value })} style={inputS} placeholder="info@…"/>
            </div>
            <div>
              <div style={labelS}>Telefon Zentrale</div>
              <input value={form.phone_central} onChange={e => upd({ phone_central: e.target.value })} style={inputS} placeholder="+49 …"/>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelS}>USt-ID / UID</div>
              <input value={form.vat_id} onChange={e => upd({ vat_id: e.target.value })} style={inputS} placeholder="DE123456789"/>
            </div>
            <div>
              <div style={labelS}>Steuernummer</div>
              <input value={form.tax_id} onChange={e => upd({ tax_id: e.target.value })} style={inputS}/>
            </div>
          </div>

          {/* Adresse */}
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Adresse</div>
          <div>
            <div style={labelS}>Straße & Hausnr.</div>
            <input value={form.street} onChange={e => upd({ street: e.target.value })} style={inputS}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelS}>PLZ</div>
              <input value={form.zip} onChange={e => upd({ zip: e.target.value })} style={inputS}/>
            </div>
            <div>
              <div style={labelS}>Ort</div>
              <input value={form.city} onChange={e => upd({ city: e.target.value })} style={inputS}/>
            </div>
            <div>
              <div style={labelS}>Land</div>
              <input value={form.country} onChange={e => upd({ country: e.target.value })} style={inputS}/>
            </div>
          </div>

          {/* Rechnungsadresse (optional, einklappbar) */}
          <div>
            <button type="button" onClick={() => setShowBilling(v => !v)}
              style={{ background: 'none', border: 'none', color: PRIMARY, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              {showBilling ? '− ' : '+ '}Abweichende Rechnungsadresse {showBilling ? 'ausblenden' : 'hinzufügen'}
            </button>
          </div>
          {showBilling && (
            <>
              <div>
                <div style={labelS}>Rechnung — Straße & Hausnr.</div>
                <input value={form.billing_street} onChange={e => upd({ billing_street: e.target.value })} style={inputS}/>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 10 }}>
                <div>
                  <div style={labelS}>PLZ</div>
                  <input value={form.billing_zip} onChange={e => upd({ billing_zip: e.target.value })} style={inputS}/>
                </div>
                <div>
                  <div style={labelS}>Ort</div>
                  <input value={form.billing_city} onChange={e => upd({ billing_city: e.target.value })} style={inputS}/>
                </div>
                <div>
                  <div style={labelS}>Land</div>
                  <input value={form.billing_country} onChange={e => upd({ billing_country: e.target.value })} style={inputS}/>
                </div>
              </div>
            </>
          )}

          {/* Kategorisierung */}
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Kategorisierung</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelS}>Mitarbeiteranzahl</div>
              <select value={form.employee_range} onChange={e => upd({ employee_range: e.target.value })} style={inputS}>
                <option value="">— keine Angabe —</option>
                {EMPLOYEE_RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <div style={labelS}>Umsatz</div>
              <select value={form.revenue_range} onChange={e => upd({ revenue_range: e.target.value })} style={inputS}>
                <option value="">— keine Angabe —</option>
                {REVENUE_RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={labelS}>Branche</div>
            <select value={form.industry_slug} onChange={e => upd({ industry_slug: e.target.value })} style={inputS}>
              <option value="">— keine Angabe —</option>
              {industries.map(i => <option key={i.slug} value={i.slug}>{i.label_de}</option>)}
            </select>
          </div>

          {/* Notizen */}
          <div>
            <div style={labelS}>Notizen</div>
            <textarea value={form.notes} onChange={e => upd({ notes: e.target.value })} rows={3} style={{ ...inputS, fontFamily: 'inherit', resize: 'vertical' }}/>
          </div>

          {err && <div style={{ padding: '8px 12px', background: '#FEF2F2', color: '#DC2626', borderRadius: 8, fontSize: 12 }}>{err}</div>}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #E4E7EC', background: 'var(--surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Abbrechen</button>
          <button onClick={save} disabled={saving}
            style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '⏳ Speichern…' : '✓ Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hauptseite ───────────────────────────────────────────────────────────────────
export default function Organizations({ session }) {
  const navigate = useNavigate()
  const { team, activeTeamId } = useTeam()
  const uid = session?.user?.id

  const [orgs,       setOrgs]       = useState([])
  const [industries, setIndustries] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(null)   // null | 'new' | org-object
  const [filter,     setFilter]     = useState('all')
  const [search,     setSearch]     = useState('')

  useEffect(() => { loadIndustries() }, [])
  useEffect(() => { loadOrgs() }, [activeTeamId])

  async function loadIndustries() {
    const { data } = await supabase.from('industries').select('slug,label_de').order('sort_order', { ascending: true })
    setIndustries(data || [])
  }

  async function loadOrgs() {
    setLoading(true)
    let q = supabase.from('organizations')
      .select('*, leads(count), deals(count)')
      .order('name', { ascending: true })
    if (activeTeamId) q = q.eq('team_id', activeTeamId)
    else q = q.eq('user_id', uid).is('team_id', null)
    const { data } = await q
    setOrgs(data || [])
    setLoading(false)
  }

  const industryMap = Object.fromEntries(industries.map(i => [i.slug, i.label_de]))

  // Filter
  const filtered = orgs.filter(o => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || o.name?.toLowerCase().includes(q)
      || o.city?.toLowerCase().includes(q)
      || (o.industry_slug && industryMap[o.industry_slug]?.toLowerCase().includes(q))
    if (!matchSearch) return false
    if (filter === 'all') return true
    if (filter === 'with_contacts') return (o.leads?.[0]?.count ?? 0) > 0
    if (filter === 'with_deals')    return (o.deals?.[0]?.count ?? 0) > 0
    if (filter === 'orphan')        return (o.leads?.[0]?.count ?? 0) === 0 && (o.deals?.[0]?.count ?? 0) === 0
    return true
  })

  // KPIs
  const totalOrgs    = orgs.length
  const withContacts = orgs.filter(o => (o.leads?.[0]?.count ?? 0) > 0).length
  const withDeals    = orgs.filter(o => (o.deals?.[0]?.count ?? 0) > 0).length
  const uniqueIndustries = new Set(orgs.map(o => o.industry_slug).filter(Boolean)).size

  const FILTERS = [
    { id: 'all',            label: 'Alle',              count: orgs.length },
    { id: 'with_contacts',  label: 'Mit Kontakten',     count: withContacts },
    { id: 'with_deals',     label: 'Mit Deals',         count: withDeals },
    { id: 'orphan',         label: 'Ohne Verknüpfung',  count: orgs.filter(o => (o.leads?.[0]?.count ?? 0) === 0 && (o.deals?.[0]?.count ?? 0) === 0).length },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #111827)', margin: 0 }}>🏢 Organisationen</h1>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            {team ? `Team: ${team.name}` : 'Meine Organisationen'} · {totalOrgs} Firmen
          </div>
        </div>
        <button onClick={() => setModal('new')}
          style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Neue Organisation
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Organisationen',  value: totalOrgs,         color: PRIMARY,    bg: 'rgba(49,90,231,0.06)' },
          { label: 'Mit Kontakten',   value: withContacts,      color: '#0ea5e9',  bg: '#F0F9FF' },
          { label: 'Mit Deals',       value: withDeals,         color: '#059669',  bg: '#ECFDF5' },
          { label: 'Branchen',        value: uniqueIndustries,  color: '#D97706',  bg: '#FFFBEB' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: '14px 18px', border: '1px solid ' + k.color + '22' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: k.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter + Suche */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid',
                borderColor: filter === f.id ? PRIMARY : '#E5E7EB',
                background: filter === f.id ? PRIMARY : 'var(--surface)',
                color: filter === f.id ? '#fff' : '#374151',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              {f.label}
              {f.count > 0 && <span style={{ background: filter===f.id?'rgba(255,255,255,0.3)':'#F3F4F6', color: filter===f.id?'#fff':'#6B7280', borderRadius: 99, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>{f.count}</span>}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Firma, Ort, Branche…"
            style={{ padding: '7px 12px', border: '1.5px solid #E4E7EC', borderRadius: 10, fontSize: 13, outline: 'none', width: 220, background: 'var(--surface)', color: 'var(--text-primary, #111827)' }}/>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>⏳ Lade Organisationen…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Noch keine Organisationen</div>
          <div style={{ fontSize: 13 }}>Klicke "+ Neue Organisation" um die erste Firma anzulegen</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(o => {
            const leadCount = o.leads?.[0]?.count ?? 0
            const dealCount = o.deals?.[0]?.count ?? 0
            return (
              <div key={o.id}
                onClick={() => navigate(`/organizations/${o.id}`)}
                style={{ background: 'var(--surface)', border: '1.5px solid #E4E7EC', borderRadius: 13, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 14 }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#C7D2FE'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E4E7EC'}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(49,90,231,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  🏢
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #111827)', marginBottom: 4 }}>{o.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#6B7280' }}>
                    {o.industry_slug && industryMap[o.industry_slug] && <span>📊 {industryMap[o.industry_slug]}</span>}
                    {o.city && <span>📍 {o.city}{o.country ? `, ${o.country}` : ''}</span>}
                    {o.employee_range && <span>👥 {EMPLOYEE_LABEL[o.employee_range]}</span>}
                    {o.revenue_range && <span>💰 {REVENUE_LABEL[o.revenue_range]}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexShrink: 0, fontSize: 11, color: '#6B7280' }}>
                  {leadCount > 0 && <span style={{ padding: '3px 9px', borderRadius: 99, background: '#F0F9FF', color: '#0369a1', fontWeight: 700 }}>{leadCount} Kontakt{leadCount!==1?'e':''}</span>}
                  {dealCount > 0 && <span style={{ padding: '3px 9px', borderRadius: 99, background: '#ECFDF5', color: '#059669', fontWeight: 700 }}>{dealCount} Deal{dealCount!==1?'s':''}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <OrganizationModal
          org={modal === 'new' ? null : modal}
          industries={industries}
          teamId={activeTeamId}
          uid={uid}
          onSave={(orgId) => { setModal(null); loadOrgs(); if (modal === 'new' && orgId) navigate(`/organizations/${orgId}`) }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
