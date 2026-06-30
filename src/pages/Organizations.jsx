// src/pages/Organizations.jsx
// Listen-Ansicht aller Organisationen/Firmen + Modal "Neue Organisation"
// Orientiert sich am Deals.jsx-Pattern (KPIs, Filter, Suche, Liste, Modal)

import React, { useState, useEffect } from 'react'
import { Building2, Users, BarChart3, Layers, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useTeam } from '../context/TeamContext'
import { useEntitlements } from '../hooks/useEntitlements'
import SponsorPipelineList from '../components/SponsorPipelineList'
import PageHeader from '../components/PageHeader'
import TabBar from '../components/TabBar'
import { EMPLOYEE_RANGES, EMPLOYEE_LABEL, REVENUE_RANGES, REVENUE_LABEL } from '../constants/orgLabels'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const P = PRIMARY

/* ── Reports-Stil Diagramm-Komponenten (gespiegelt aus Vernetzungen.jsx) ── */
const RC = { surface:'var(--surface, #fff)', border:'#E4E7EC', text1:'var(--text-strong, #111827)', text2:'#374151', text3:'#6B7280' }
const fmt = new Intl.NumberFormat('de-DE')

function KpiCard({ label, value, sub, color, Icon }) {
  return (
    <div style={{ background:RC.surface, border:`1px solid ${RC.border}`, borderRadius:14, padding:'14px 16px', display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:10, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</span>
        {Icon && <Icon size={14} color={color}/>}
      </div>
      <div style={{ fontSize:22, fontWeight:800, color:RC.text1, fontVariantNumeric:'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:RC.text3 }}>{sub}</div>}
    </div>
  )
}

function Panel({ title, action, children }) {
  return (
    <div style={{ background:RC.surface, border:`1px solid ${RC.border}`, borderRadius:14, padding:18, marginBottom:16 }}>
      {title && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:RC.text1, margin:0 }}>{title}</h3>{action}
        </div>
      )}
      {children}
    </div>
  )
}

function BarRow({ label, count, total, color=P }) {
  const pct = total > 0 ? Math.round((count/total)*100) : 0
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
        <span style={{ fontSize:13, color:RC.text2, fontWeight:500 }}>{label}</span>
        <span style={{ fontSize:12, color:RC.text3, fontVariantNumeric:'tabular-nums' }}><strong style={{ color:RC.text1 }}>{fmt.format(count)}</strong>{total>0 && <> · {pct}%</>}</span>
      </div>
      <div style={{ height:6, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, transition:'width 0.3s' }}/>
      </div>
    </div>
  )
}

function EmptyBars({ text }) {
  return <div style={{ fontSize:12, color:RC.text3, padding:'8px 0' }}>{text}</div>
}

// ── Modal "Neue / Bearbeiten" ──────────────────────────────────────────────────
function OrganizationModal({ org, industries, teamId, uid, onSave, onClose }) {
  const [form, setForm] = useState({
    name: org?.name || '',
    // Bei Neuanlage Ersteller als Owner vorbelegen; beim Bearbeiten den
    // bestehenden Owner übernehmen (kann leer sein).
    owner_id: org ? (org.owner_id || '') : (uid || ''),
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

  // Team-Members für Owner-Select (2-step Query — PostgREST-Embed
  // profile:profiles(...) failed silent auf Hetzner, siehe Top-Fallstrick #14).
  const [teamMembers, setTeamMembers] = useState([])
  useEffect(() => {
    if (!teamId) { setTeamMembers([]); return }
    let cancelled = false
    ;(async () => {
      const { data: tm } = await supabase.from('team_members').select('user_id').eq('team_id', teamId)
      if (cancelled) return
      const userIds = [...new Set((tm || []).map(m => m.user_id).filter(Boolean))]
      if (userIds.length === 0) { setTeamMembers([]); return }
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
      if (!cancelled) setTeamMembers(profiles || [])
    })()
    return () => { cancelled = true }
  }, [teamId])

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
      owner_id: form.owner_id || null,
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
          <div style={{ fontSize: 16, fontWeight: 800 }}>{org?.id ? 'Unternehmen bearbeiten' : 'Neues Unternehmen'}</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#F3F4F6', cursor: 'pointer', fontSize: 16, color: '#6B7280' }}>×</button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Stammdaten */}
          <div>
            <div style={labelS}>Name *</div>
            <input value={form.name} onChange={e => upd({ name: e.target.value })} style={inputS} placeholder="z.B. Deutsche Bank AG"/>
          </div>
          <div>
            <div style={labelS}>Owner</div>
            <select value={form.owner_id || ''} onChange={e => upd({ owner_id: e.target.value || null })} style={inputS}>
              <option value="">— Kein Owner —</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {(m.full_name || m.id.slice(0, 8))}{m.id === uid ? ' (du)' : ''}
                </option>
              ))}
            </select>
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
            {saving ? 'Speichern…' : 'Speichern'}
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
  const { hasModule } = useEntitlements()
  const sponsoringActive = hasModule('sponsoring')
  const uid = session?.user?.id

  const [orgs,       setOrgs]       = useState([])
  const [industries, setIndustries] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(null)   // null | 'new' | org-object
  const [filter,     setFilter]     = useState('all')
  const [ownerFilter, setOwnerFilter] = useState(null) // null = alle
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState(() => new Set()) // org-ids für Sponsor-Bulk
  const [bulkMarking, setBulkMarking] = useState(false)

  const toggleSelect = (orgId) => setSelected(prev => {
    const next = new Set(prev)
    next.has(orgId) ? next.delete(orgId) : next.add(orgId)
    return next
  })
  // Bulk Sponsor-Markierung — RPC setzt je Org einzeln (kein .in()-Bulk).
  async function bulkMarkSponsor(isSponsor) {
    const ids = [...selected]
    if (ids.length === 0) return
    setBulkMarking(true)
    const { error } = await supabase.rpc('mark_sponsors', { p_org_ids: ids, p_is_sponsor: isSponsor })
    setBulkMarking(false)
    if (error) { alert('Markierung fehlgeschlagen: ' + error.message); return }
    setSelected(new Set())
  }

  useEffect(() => { loadIndustries() }, [])
  useEffect(() => { loadOrgs() }, [activeTeamId])
  useEffect(() => { loadTeamMembers() }, [activeTeamId])
  // Deep-Link aus dem alten /sponsoring/sponsoren-Redirect: ?view=sponsoren
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('view') === 'sponsoren') setFilter('sponsoren')
  }, [])

  async function loadTeamMembers() {
    if (!activeTeamId) { setTeamMembers([]); return }
    const { data: tm } = await supabase.from('team_members')
      .select('user_id, role').eq('team_id', activeTeamId)
    const userIds = [...new Set((tm || []).map(m => m.user_id).filter(Boolean))]
    if (userIds.length === 0) { setTeamMembers([]); return }
    const { data: profiles } = await supabase.from('profiles')
      .select('id, full_name, avatar_url').in('id', userIds)
    const mapped = (profiles || []).map(p => ({
      id: p.id,
      full_name: p.full_name || '',
      first_name: (p.full_name || '').trim().split(/\s+/)[0] || '',
      avatar_url: p.avatar_url || null,
    }))
    setTeamMembers(mapped)
  }

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
    // Owner-Filter (orthogonal zum Status-Filter)
    if (ownerFilter && o.owner_id !== ownerFilter) return false
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

  // ── Diagramm-Daten (Reports-Stil, gespiegelt aus Vernetzungen.jsx) ──
  // Branchen-Verteilung: Top-Branchen nach Anzahl Unternehmen
  const industryStats = Object.entries(
    orgs.reduce((acc, o) => { if (o.industry_slug) acc[o.industry_slug] = (acc[o.industry_slug] || 0) + 1; return acc }, {})
  )
    .map(([slug, count]) => ({ label: industryMap[slug] || slug, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7)
  // Größenverteilung: nach Mitarbeiter-Range (in definierter Reihenfolge)
  const employeeStats = EMPLOYEE_RANGES
    .map(r => ({ label: EMPLOYEE_LABEL[r.id], count: orgs.filter(o => o.employee_range === r.id).length }))
    .filter(s => s.count > 0)
  // Umsatz-Verteilung: nach Umsatz-Range (in definierter Reihenfolge)
  const revenueStats = REVENUE_RANGES
    .map(r => ({ label: REVENUE_LABEL[r.id], count: orgs.filter(o => o.revenue_range === r.id).length }))
    .filter(s => s.count > 0)
  const orphanCount = orgs.filter(o => (o.leads?.[0]?.count ?? 0) === 0 && (o.deals?.[0]?.count ?? 0) === 0).length

  const TABS = [
    { v: 'all',           label: `Alle (${orgs.length})`,           color: 'brand' },
    { v: 'with_contacts', label: `Mit Kontakten (${withContacts})`, color: 'blue'  },
    { v: 'with_deals',    label: `Mit Deals (${withDeals})`,        color: 'green' },
    { v: 'orphan',        label: `Ohne Verknüpfung (${orphanCount})`, color: 'amber' },
    // Addon-gegated: Sponsoring-Pipeline-Sicht (Unternehmen mit Sponsoring-Extension)
    ...(sponsoringActive ? [{ v: 'sponsoren', label: 'Sponsoren', color: 'purple' }] : []),
  ]

  // CSV-Export der aktuell gefilterten Unternehmen
  function exportCsv() {
    const rows = [['Name','Branche','Ort','Land','Mitarbeiter','Umsatz','Kontakte','Deals']]
    filtered.forEach(o => rows.push([
      o.name || '', o.industry_slug ? (industryMap[o.industry_slug] || '') : '', o.city || '', o.country || '',
      o.employee_range ? EMPLOYEE_LABEL[o.employee_range] : '', o.revenue_range ? REVENUE_LABEL[o.revenue_range] : '',
      o.leads?.[0]?.count ?? 0, o.deals?.[0]?.count ?? 0,
    ]))
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,﻿'+encodeURIComponent(csv); a.download=`unternehmen-${new Date().toISOString().substring(0,10)}.csv`; a.click()
  }

  const headerAction = (
    <button onClick={() => setModal('new')}
      style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      + Neues Unternehmen
    </button>
  )

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="CRM · Unternehmen"
        title="Unternehmen"
        subtitle={`${team ? `Team: ${team.name}` : 'Meine Unternehmen'} · Firmen verwalten, mit Kontakten und Deals verknüpfen und nach Branche, Größe und Umsatz auswerten.`}
        action={headerAction}
      />

      {/* KPI-Karten (Reports-Stil) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Unternehmen"   value={totalOrgs}        color={PRIMARY}   Icon={Building2}/>
        <KpiCard label="Mit Kontakten" value={withContacts}     color="#0ea5e9"   Icon={Users}/>
        <KpiCard label="Mit Deals"     value={withDeals}        color="#059669"   Icon={BarChart3}/>
        <KpiCard label="Branchen"      value={uniqueIndustries} color="#D97706"   Icon={Layers}/>
      </div>

      {/* Diagramme (Reports-Stil) — Branche groß + Größe daneben, Umsatz darunter */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Panel title="Verteilung nach Branche">
          {industryStats.length > 0
            ? industryStats.map(s => <BarRow key={s.label} label={s.label} count={s.count} total={totalOrgs} color="#0C447C"/>)
            : <EmptyBars text="Noch keine Branchen erfasst."/>}
        </Panel>
        <Panel title="Größenverteilung">
          {employeeStats.length > 0
            ? employeeStats.map(s => <BarRow key={s.label} label={s.label} count={s.count} total={totalOrgs} color="#185FA5"/>)
            : <EmptyBars text="Keine Angaben zur Mitarbeiterzahl."/>}
        </Panel>
      </div>
      <Panel title="Umsatz-Verteilung">
        {revenueStats.length > 0
          ? revenueStats.map(s => <BarRow key={s.label} label={s.label} count={s.count} total={totalOrgs} color="#059669"/>)
          : <EmptyBars text="Keine Umsatzangaben erfasst."/>}
      </Panel>

      {/* Tabs */}
      <TabBar tabs={TABS} active={filter} onChange={setFilter} style={{ marginBottom: 14 }}/>

      {/* Toolbar: Owner-Filter + Suche + CSV */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {teamMembers.length > 0 && (
          <select value={ownerFilter || ''} onChange={e => setOwnerFilter(e.target.value || null)}
            style={{ padding: '9px 12px', border: '1.5px solid ' + (ownerFilter ? PRIMARY : '#E2E8F0'), borderRadius: 10, fontSize: 13, outline: 'none', background: 'var(--surface)', color: 'var(--text-primary, #111827)', cursor: 'pointer' }}>
            <option value="">Alle Owner</option>
            {teamMembers.map(m => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.first_name || m.id.slice(0,8)}
                {m.id === uid ? ' (du)' : ''}
              </option>
            ))}
          </select>
        )}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Firma, Ort oder Branche suchen…"
          style={{ flex: 1, minWidth: 180, padding: '9px 14px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: 'var(--surface)', color: 'var(--text-primary, #111827)' }}/>
        <button onClick={exportCsv}
          style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid #E2E8F0', background: 'var(--surface-muted)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Download size={13} strokeWidth={1.75}/>CSV
        </button>
      </div>

      {/* Sponsor-Bulk-Action-Bar (addon-gegated, bei Auswahl) */}
      {sponsoringActive && selected.size > 0 && filter !== 'sponsoren' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'rgba(49,90,231,0.06)', border: '1px solid ' + PRIMARY + '33' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: PRIMARY }}>{selected.size} ausgewählt</span>
          <button onClick={() => bulkMarkSponsor(true)} disabled={bulkMarking}
            style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: PRIMARY, color: '#fff', fontSize: 12, fontWeight: 700, cursor: bulkMarking ? 'wait' : 'pointer', opacity: bulkMarking ? 0.6 : 1 }}>★ Als Sponsor markieren</button>
          <button onClick={() => bulkMarkSponsor(false)} disabled={bulkMarking}
            style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #E4E7EC', background: 'var(--surface)', color: '#6B7280', fontSize: 12, fontWeight: 700, cursor: bulkMarking ? 'wait' : 'pointer', opacity: bulkMarking ? 0.6 : 1 }}>Sponsor entfernen</button>
          <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 9, border: 'none', background: 'transparent', color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Auswahl aufheben</button>
        </div>
      )}

      {/* Liste */}
      {filter === 'sponsoren' && sponsoringActive ? (
        <SponsorPipelineList />
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>Lade Unternehmen…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Noch keine Unternehmen</div>
          <div style={{ fontSize: 13 }}>Klicke "+ Neues Unternehmen" um das erste Unternehmen anzulegen</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(o => {
            const leadCount = o.leads?.[0]?.count ?? 0
            const dealCount = o.deals?.[0]?.count ?? 0
            return (
              <div key={o.id}
                onClick={() => navigate(`/organizations/${o.id}`)}
                style={{ background: 'var(--surface)', border: '1px solid #E8EDF2', borderRadius: 12, padding: '14px 18px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 14 }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#C7D2FE'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E8EDF2'}>
                {sponsoringActive && (
                  <input type="checkbox" checked={selected.has(o.id)}
                    onClick={e => e.stopPropagation()} onChange={() => toggleSelect(o.id)}
                    title="Für Sponsor-Markierung auswählen"
                    style={{ width: 17, height: 17, accentColor: PRIMARY, cursor: 'pointer', flexShrink: 0 }} />
                )}
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(49,90,231,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  🏢
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #111827)', marginBottom: 4 }}>{o.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#6B7280' }}>
                    {o.industry_slug && industryMap[o.industry_slug] && <span>{industryMap[o.industry_slug]}</span>}
                    {o.city && <span>{o.city}{o.country ? `, ${o.country}` : ''}</span>}
                    {o.employee_range && <span>{EMPLOYEE_LABEL[o.employee_range]}</span>}
                    {o.revenue_range && <span>{REVENUE_LABEL[o.revenue_range]}</span>}
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
