// Deals v2 — PDF Blob-Download, expected_close_date, Slide-in Panel
import { useTranslation } from 'react-i18next'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTeam } from '../context/TeamContext'
import { useResponsive } from '../hooks/useResponsive'
import OrganizationPicker from '../components/OrganizationPicker'
import PageHeader from '../components/PageHeader'
import { ChevronUp, ChevronDown } from 'lucide-react'

const PRIMARY = '#0A6FB0'

const STAGES = [
  { id: 'prospect',     label: 'Interessent',  color: '#6B7280', bg: '#F3F4F6', prob: 15  },
  { id: 'opportunity',  label: 'Qualifiziert', color: '#185FA5', bg: '#EFF6FF', prob: 30  },
  { id: 'angebot',      label: 'Angebot',      color: '#D97706', bg: '#FFFBEB', prob: 50  },
  { id: 'verhandlung',  label: 'Verhandlung',  color: '#003060', bg: '#F5F3FF', prob: 70  },
  { id: 'gewonnen',     label: 'Gewonnen',     color: '#059669', bg: '#ECFDF5', prob: 100 },
  { id: 'verloren',     label: 'Verloren',     color: '#DC2626', bg: '#FEF2F2', prob: 0   },
]

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s]))

function fmtEur(v) {
  if (!v) return '—'
  return '€' + Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0 })
}
function fmtDate(d) {
  if (!d) return null
  return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
}

/* ── Reports-Stil Design-Komponenten (gespiegelt aus Organizations/Vernetzungen) ── */
const RC = { surface:'var(--surface, #fff)', border:'#E4E7EC', text1:'var(--text-strong, #111827)', text2:'#374151', text3:'#6B7280' }
const PV = 'var(--wl-primary, #0A6FB0)'

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{ background:RC.surface, border:`1px solid ${RC.border}`, borderRadius:16, padding:'14px 16px', display:'flex', flexDirection:'column', gap:4, boxShadow:'var(--shadow-card)' }}>
      <span style={{ fontSize:10, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</span>
      <div style={{ fontSize:22, fontWeight:800, color:RC.text1, fontVariantNumeric:'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:RC.text3 }}>{sub}</div>}
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div style={{ background:RC.surface, border:`1px solid ${RC.border}`, borderRadius:16, padding:'18px 20px', marginBottom:16, boxShadow:'var(--shadow-card)' }}>
      {title && <div style={{ fontSize:14, fontWeight:700, color:RC.text1, margin:'0 0 14px' }}>{title}</div>}
      {children}
    </div>
  )
}

function BarRow({ label, count, total, value, color=PV }) {
  const pct = total > 0 ? Math.round((count/total)*100) : 0
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
        <span style={{ fontSize:13, color:RC.text2, fontWeight:500 }}>{label}</span>
        <span style={{ fontSize:12, color:RC.text3, fontVariantNumeric:'tabular-nums' }}><strong style={{ color:RC.text1 }}>{count}</strong>{value ? ` · ${value}` : (total>0 ? ` · ${pct}%` : '')}</span>
      </div>
      <div style={{ height:6, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, transition:'width 0.3s' }}/>
      </div>
    </div>
  )
}

const scriptHintStyle = { fontFamily:'Inter, sans-serif', fontSize:13, fontWeight:600, color:'var(--wl-primary, #0A6FB0)', whiteSpace:'nowrap', lineHeight:1 }
function CurvedArrow() {
  return (
    <svg width="34" height="24" viewBox="0 0 34 24" fill="none" style={{ color:'var(--wl-primary, #0A6FB0)', flexShrink:0 }} aria-hidden="true">
      <path d="M3 5 C 14 3, 25 7, 30 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M23 14.5 L 31 15 L 27 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

// ── Deal-Formular Modal ────────────────────────────────────────────────────────
export function DealModal({ deal, leads, teamMembers = [], teamId, uid, onSave, onClose }) {
  const { t } = useTranslation()
  const { isMobile } = useResponsive()
  const [form, setForm] = useState({
    title:          deal?.title || deal?.name || '',
    description:    deal?.description || '',
    value:          deal?.value || '',
    stage:          deal?.stage || 'prospect',
    probability:    deal?.probability ?? 10,
    expected_close_date: deal?.expected_close_date || '',
    lead_id:        deal?.lead_id || '',
    organization_id:   deal?.organization_id || null,
    organization_name: deal?.organizations?.name || '',
    owner_id:       deal?.owner_id || '',
    product_id:     deal?.product_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Produkte aus der Wissensdatenbank (Kategorie 'produkt') für die Verknüpfung.
  const [products, setProducts] = useState([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // strict team_id - sonst kein KB-Query (Hardening 2026-06-11)
      if (!teamId) { setProducts([]); return }
      const { data, error } = await supabase.from('knowledge_base')
        .select('id, name, price, product_form, product_kind')
        .eq('category', 'produkt')
        .eq('team_id', teamId)
        .order('name')
      if (cancelled) return
      if (error) { console.warn('[DealModal] products load failed:', error.message); return }
      setProducts(data || [])
    })()
    return () => { cancelled = true }
  }, [teamId])

  async function save() {
    if (!form.title?.trim()) { setError('Name ist Pflichtfeld'); return }
    setSaving(true)

    // Nur Felder die tatsächlich in der deals-Tabelle existieren
    const basePayload = {
      title:               form.title?.trim() || '',
      description:         form.description || null,
      value:               form.value ? parseFloat(form.value) : null,
      stage:               form.stage,
      probability:         parseInt(form.probability) || 0,
      expected_close_date: form.expected_close_date || null,
      lead_id:             form.lead_id || null,
      organization_id:     form.organization_id || null,
      owner_id:            form.owner_id || null,
      product_id:          form.product_id || null,
    }

    let err
    if (deal?.id) {
      // Update: kein created_by, kein team_id
      const r = await supabase.from('deals').update({
        ...basePayload,
        updated_at: new Date().toISOString(),
      }).eq('id', deal.id)
      err = r.error
    } else {
      // Insert: created_by + team_id mitgeben
      const r = await supabase.from('deals').insert({
        ...basePayload,
        team_id:    teamId || null,
        created_by: uid,
      }).select().single()
      err = r.error
      if (!err) basePayload.id = r.data.id
    }
    if (err) { setError(err.message); setSaving(false); return }
    onSave()
  }

  const inp = { width: '100%', padding: '9px 11px', border: '1.5px solid #E4E7EC', borderRadius: 9, fontSize: 13, outline: 'none', background: 'var(--surface)', boxSizing: 'border-box' }
  const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{deal?.id ? 'Deal bearbeiten' : 'Neuer Deal'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '8px 12px', background: '#FEF2F2', color: '#991B1B', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{error}</div>}

          {/* Name */}
          <div>
            <label style={lbl}>Deal-Name *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="z.B. Enterprise-Lizenz Q2" style={inp} autoFocus/>
          </div>

          {/* Lead verknüpfen */}
          <div>
            <label style={lbl}>Lead verknüpfen (optional)</label>
            <select value={form.lead_id} onChange={e => set('lead_id', e.target.value)} style={inp}>
              <option value="">— Kein Lead</option>
              {leads.map(l => (
                <option key={l.id} value={l.id}>
                  {[l.first_name, l.last_name].filter(Boolean).join(' ') || l.name || l.company || l.id.slice(0,8)}
                  {l.company ? ` · ${l.company}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Organisation verknüpfen */}
          <div>
            <label style={lbl}>Organisation (optional)</label>
            <OrganizationPicker
              value={form.organization_id}
              valueName={form.organization_name}
              onChange={(orgId, orgName) => { set('organization_id', orgId); set('organization_name', orgName || '') }}
              placeholder="Firma suchen oder neu anlegen…"
            />
          </div>

          {/* Owner */}
          <div>
            <label style={lbl}>Owner (optional)</label>
            <select value={form.owner_id} onChange={e => set('owner_id', e.target.value)} style={inp}>
              <option value="">— Kein Owner —</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name || `${m.first_name||''} ${m.last_name||''}`.trim() || m.id.slice(0,8)}
                  {m.id === uid ? ' (du)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Produkt aus Wissensdatenbank */}
          <div>
            <label style={lbl}>Produkt (optional)</label>
            <select value={form.product_id} onChange={e => set('product_id', e.target.value)} style={inp}>
              <option value="">— Kein Produkt</option>
              {products.map(p => {
                const meta = [p.product_kind, p.product_form, p.price].filter(Boolean).join(' · ')
                return (
                  <option key={p.id} value={p.id}>
                    {p.name}{meta ? ` (${meta})` : ''}
                  </option>
                )
              })}
            </select>
            {products.length === 0 && (
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                Noch keine Produkte — in der Wissensdatenbank unter Kategorie „Produkt / Service" anlegen.
              </div>
            )}
          </div>

          {/* Wert + Stage */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Deal-Wert (€)</label>
              <input type="number" value={form.value} onChange={e => set('value', e.target.value)} placeholder="z.B. 12000" style={inp} min="0"/>
            </div>
            <div>
              <label style={lbl}>Stage</label>
              <select value={form.stage} onChange={e => { set('stage', e.target.value); set('probability', STAGE_MAP[e.target.value]?.prob ?? 10) }} style={inp}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Wahrscheinlichkeit + Abschluss */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Wahrscheinlichkeit: {form.probability}%</label>
              <input type="range" min="0" max="100" step="5" value={form.probability} onChange={e => set('probability', e.target.value)}
                style={{ width: '100%', accentColor: PRIMARY }}/>
            </div>
            <div>
              <label style={lbl}>Abschluss geplant</label>
              <input type="date" value={form.expected_close_date} onChange={e => set('expected_close_date', e.target.value)} style={inp}/>
            </div>
          </div>

          {/* Beschreibung */}
          <div>
            <label style={lbl}>Beschreibung / Notizen</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
              placeholder="Kurze Beschreibung, nächste Schritte, interne Notizen…" style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}/>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="lk-btn lk-btn-ghost" onClick={onClose} >{t('common.cancel')}</button>
            <button className="lk-btn lk-btn-cta" onClick={save} disabled={saving}
              >
              {saving ? '…' : deal?.id ? 'Speichern' : '+ Deal erstellen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Hauptseite ─────────────────────────────────────────────────────────────────
export default function Deals({ session }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { team, activeTeamId } = useTeam()
  const uid = session?.user?.id
  const [deals,     setDeals]     = useState([])
  const [leads,     setLeads]     = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null)  // null | 'new' | deal-object
  const [filter,    setFilter]    = useState('all')
  const [ownerFilter, setOwnerFilter] = useState(null)
  const [search,    setSearch]    = useState('')
  const [showDash, setShowDash] = useState(() => { try { return localStorage.getItem('leadesk_deals_dashboard') !== '0' } catch { return true } })
  const toggleDash = () => setShowDash(v => { const n = !v; try { localStorage.setItem('leadesk_deals_dashboard', n ? '1' : '0') } catch {} return n })
  const [searchParams] = useSearchParams()

  useEffect(() => { load() }, [activeTeamId])

  // 2026-06-02: Deep-Link aus Aufgaben-Hub. /deals?open=<deal-id> öffnet die
  // eigenständige Deal-Detailseite (früher: Slide-in-Drawer).
  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId) navigate(`/deals/${openId}`, { replace: true })
  }, [searchParams, navigate])

  async function load() {
    setLoading(true)
    // Hardening 2026-06-11: STRICT team_id-Filter (vorher created_by-Fallback -> Cross-Team-Leak
    // bei Multi-Team-Membership). Wenn kein aktives Team => leere Liste.
    if (!activeTeamId) { setDeals([]); setLoading(false); return }
    const { data: d } = await supabase.from('deals')
      .select('*, leads(id,first_name,last_name,company), organizations(id,name)')
      .eq('team_id', activeTeamId)
      .order('created_at', { ascending: false })
    setDeals(d || [])

    // Leads fuer Verknuepfung laden - strict team_id (Hardening 2026-06-11)
    const { data: l } = await supabase.from('leads')
      .select('id,first_name,last_name,name,company')
      .eq('team_id', activeTeamId)
    setLeads(l || [])

    // Team-Members für Owner-Picker (2-step Query — Top-Fallstrick #14)
    if (activeTeamId) {
      const { data: tm } = await supabase.from('team_members')
        .select('user_id, role').eq('team_id', activeTeamId)
      const userIds = [...new Set((tm || []).map(m => m.user_id).filter(Boolean))]
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles')
          .select('id, full_name, avatar_url').in('id', userIds)
        const mapped = (profiles || []).map(p => {
          const parts = (p.full_name || '').trim().split(/\s+/)
          return {
            id: p.id,
            first_name: parts[0] || '',
            last_name: parts.slice(1).join(' ') || '',
            full_name: p.full_name || null,
            avatar_url: p.avatar_url || null,
          }
        })
        setTeamMembers(mapped)
      } else setTeamMembers([])
    } else setTeamMembers([])

    setLoading(false)
  }

  // Filter
  const today = new Date().toISOString().split('T')[0]
  const filtered = deals.filter(d => {
    const q = search.toLowerCase()
    const matchSearch = !q || d.name?.toLowerCase().includes(q) || d.leads?.company?.toLowerCase().includes(q) || d.organizations?.name?.toLowerCase().includes(q)
    if (!matchSearch) return false
    // Owner-Filter orthogonal zum Status-Filter
    if (ownerFilter && d.owner_id !== ownerFilter) return false
    if (filter === 'all') return true
    if (filter === 'offen') return !['gewonnen','verloren'].includes(d.stage)
    if (filter === 'gewonnen')  return d.stage === 'gewonnen'
    if (filter === 'verloren') return d.stage === 'verloren'
    if (filter === 'overdue') return (d.expected_close_date||d.expected_close) && (d.expected_close_date||d.expected_close) < today && !['gewonnen','verloren'].includes(d.stage)
    return true
  })

  // KPIs
  const open   = deals.filter(d => !['gewonnen','verloren'].includes(d.stage))
  const won    = deals.filter(d => d.stage === 'gewonnen')
  const total  = open.reduce((s,d) => s + (Number(d.value)||0), 0)
  const weighted = open.reduce((s,d) => s + (Number(d.value)||0) * (d.probability||0) / 100, 0)
  const wonValue = won.reduce((s,d) => s + (Number(d.value)||0), 0)

  const FILTERS = [
    { id: 'all',     label: 'Alle',         count: deals.length },
    { id: 'offen',    label: 'Offen',        count: open.length },
    { id: 'gewonnen',     label: 'Gewonnen',   count: won.length },
    { id: 'verloren',    label: 'Verloren',   count: deals.filter(d=>d.stage==='verloren').length },
    { id: 'overdue', label: 'Überfällig', count: deals.filter(d=>(d.expected_close_date||d.expected_close)&&(d.expected_close_date||d.expected_close)<today&&!['gewonnen','verloren'].includes(d.stage)).length },
  ]

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="CRM · Deals"
        title="Deals"
        subtitle={`${team ? `Team: ${team.name}` : 'Meine Deals'} · ${open.length} offen · ${fmtEur(total)} Pipeline. Verkaufschancen nach Phase verfolgen, gewichten und abschließen.`}
        action={
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:7, pointerEvents:'none' }} aria-hidden="true">
              <span style={scriptHintStyle}>Auf und zuklappen</span>
              <CurvedArrow/>
            </div>
            <button className="lk-btn lk-btn-ghost" onClick={toggleDash} title={showDash ? 'Dashboard ausblenden' : 'Dashboard einblenden'}
              style={{ display:'inline-flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>
              {showDash ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}Dashboard
            </button>
            <button className="lk-btn lk-btn-cta" onClick={() => setModal('new')}
              style={{ whiteSpace:'nowrap' }}>
              + Neuer Deal
            </button>
          </div>
        }
      />

      {showDash && (
        <>
          {/* KPI-Karten (Reports-Stil) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            <KpiCard label="Pipeline Gesamt" value={fmtEur(total)}    color={PRIMARY}  sub={`${open.length} offen`}/>
            <KpiCard label="Gewichtet"       value={fmtEur(weighted)} color="#003060"/>
            <KpiCard label="Gewonnen"        value={fmtEur(wonValue)} color="#059669"  sub={`${won.length} Deals`}/>
            <KpiCard label="Ø Deal-Wert"     value={open.length ? fmtEur(total / open.length) : '—'} color="#D97706"/>
          </div>

          {/* Diagramm (Reports-Stil): Verteilung nach Phase */}
          <Panel title="Verteilung nach Phase">
            {deals.length > 0
              ? STAGES.map(st => {
                  const ds = deals.filter(d => d.stage === st.id)
                  if (!ds.length) return null
                  const val = ds.reduce((s, d) => s + (Number(d.value) || 0), 0)
                  return <BarRow key={st.id} label={st.label} count={ds.length} total={deals.length} value={fmtEur(val)} color={st.color}/>
                })
              : <div style={{ fontSize: 12, color: RC.text3, padding: '8px 0' }}>Noch keine Deals erfasst.</div>}
          </Panel>
        </>
      )}

      {/* Filter + Suche */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid', borderColor: filter === f.id ? PRIMARY : '#E5E7EB', background: filter === f.id ? PRIMARY : '#fff', color: filter === f.id ? '#fff' : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              {f.label}
              {f.count > 0 && <span style={{ background: filter===f.id?'rgba(255,255,255,0.3)':'#F3F4F6', color: filter===f.id?'#fff':'#6B7280', borderRadius: 99, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>{f.count}</span>}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {teamMembers.length > 0 && (
            <select value={ownerFilter || ''} onChange={e => setOwnerFilter(e.target.value || null)}
              style={{ padding: '7px 12px', border: '1.5px solid ' + (ownerFilter ? PRIMARY : '#E4E7EC'), borderRadius: 10, fontSize: 13, outline: 'none', background: 'var(--surface)', color: 'var(--text-primary, #111827)', cursor: 'pointer' }}>
              <option value="">Alle Owner</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name || `${m.first_name||''} ${m.last_name||''}`.trim() || m.id.slice(0,8)}
                  {m.id === uid ? ' (du)' : ''}
                </option>
              ))}
            </select>
          )}
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Deal suchen…"
              style={{ padding: '7px 12px', border: '1.5px solid #E4E7EC', borderRadius: 10, fontSize: 13, outline: 'none', width: 200 }}/>
          </div>
        </div>
      </div>

      {/* Deal-Liste (Klick öffnet die eigenständige Detailseite /deals/:id) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        {/* Deal-Liste */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>Lade Deals…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💼</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Noch keine Deals</div>
              <div style={{ fontSize: 13 }}>Klicke "+ Neuer Deal" um deinen ersten Deal anzulegen</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(deal => {
                const s = STAGE_MAP[deal.stage] || STAGE_MAP.prospect
                const isOvd = (deal.expected_close || deal.expected_close_date) && (deal.expected_close || deal.expected_close_date) < today && !['gewonnen','verloren'].includes(deal.stage)
                const lead = deal.leads

                return (
                  <div key={deal.id}
                    onClick={() => navigate(`/deals/${deal.id}`)}
                    style={{ background: 'var(--surface)', border: '1.5px solid #E4E7EC', borderRadius: 13, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 14 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#C7D2FE' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4E7EC' }}>

                    {/* Stage-Dot */}
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>

                    {/* Inhalt */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.title || deal.name || '—'}</div>
                        {deal.value && <div style={{ fontSize: 13, fontWeight: 800, color: s.color, flexShrink: 0 }}>{fmtEur(deal.value)}</div>}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: s.bg, color: s.color }}>{s.label}</span>
                        {lead && <span style={{ fontSize: 10, color: '#6B7280' }}>{[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || lead.company}</span>}
                        {deal.organizations?.name && <span style={{ fontSize: 10, color: '#6B7280' }}>{deal.organizations.name}</span>}
                        {(deal.expected_close || deal.expected_close_date) && <span style={{ fontSize: 10, color: isOvd ? '#DC2626' : '#9CA3AF', fontWeight: isOvd ? 700 : 400 }}>{isOvd ? '⚠' : '📅'} {fmtDate(deal.expected_close || deal.expected_close_date)}</span>}
                      </div>
                    </div>

                    {/* Wahrscheinlichkeit */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{deal.probability}%</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>WSK</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <DealModal
          deal={modal === 'new' ? null : modal}
          leads={leads}
          teamMembers={teamMembers}
          teamId={activeTeamId}
          uid={uid}
          onSave={() => { setModal(null); load() }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
