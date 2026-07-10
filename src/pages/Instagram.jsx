import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, UserPlus, Image as IcImage,
  Eye, Heart, MessageCircle, Bookmark, ExternalLink, RefreshCw,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { getConnectionStatus, getAnalytics, listLeads } from '../lib/instagram'

// lucide@1.x kennt kein 'Instagram'-Glyph (Top-Fallstrick #11) → lokales Inline-SVG.
function IcInstagram({ size = 22, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const IG_PINK = '#E1306C'
const C = {
  surface: '#ffffff', border: '#E4E7EC', text1: '#111827',
  text2: '#374151', text3: '#6B7280', canvas: '#F8FAFC',
}

const BREAKDOWNS = [
  { key: 'age',     label: 'Alter' },
  { key: 'gender',  label: 'Geschlecht' },
  { key: 'country', label: 'Land' },
  { key: 'city',    label: 'Stadt' },
]

function fmt(n) {
  if (n == null) return '–'
  return new Intl.NumberFormat('de-DE').format(n)
}
function fmtDate(s) {
  if (!s) return '–'
  try { return new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch (_) { return s }
}

function KpiCard({ icon, label, value }) {
  return (
    <div style={{
      flex: '1 1 160px', background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text3, fontSize: 12, fontWeight: 600 }}>
        {icon}{label}
      </div>
      <div style={{ marginTop: 8, fontSize: 26, fontWeight: 800, color: C.text1 }}>{value}</div>
    </div>
  )
}

export default function Instagram() {
  const navigate = useNavigate()
  const [phase, setPhase]   = useState('loading') // loading | disconnected | ready | error
  const [conn, setConn]     = useState(null)
  const [detail, setDetail] = useState(null)
  const [leads, setLeads]   = useState([])
  const [err, setErr]       = useState('')
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    setErr('')
    try {
      const c = await getConnectionStatus()
      if (!c) { setPhase('disconnected'); return }
      setConn(c)
      const d = await getAnalytics()
      setDetail(d)
      // Leads defensiv — Fehler hier sollen die Analyse nicht blockieren.
      try { setLeads(await listLeads()) } catch (_) { setLeads([]) }
      setPhase('ready')
    } catch (e) {
      setErr(e.message || 'Fehler beim Laden')
      setPhase('error')
    }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() {
    setRefreshing(true)
    try {
      const d = await getAnalytics()
      setDetail(d)
      try { setLeads(await listLeads()) } catch (_) { /* leads optional */ }
    } catch (e) { setErr(e.message || 'Fehler beim Aktualisieren') }
    finally { setRefreshing(false) }
  }

  const snap  = detail?.latest_snapshot || {}
  const posts = detail?.posts || []
  const demos = detail?.demographics || []

  const demoGroups = useMemo(() => {
    const groups = {}
    for (const d of demos) {
      if (!groups[d.breakdown_type]) groups[d.breakdown_type] = []
      groups[d.breakdown_type].push({ category: d.category, value: Number(d.value) || 0 })
    }
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => b.value - a.value)
      groups[k] = groups[k].slice(0, 8)
    }
    return groups
  }, [demos])

  // ── Header (immer) ──────────────────────────────────────────────────
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center',
        background: `linear-gradient(135deg, #F58529, ${IG_PINK}, #833AB4)`, color: '#fff',
      }}>
        <IcInstagram size={22} strokeWidth={2} />
      </div>
      <div style={{ flex: 1 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text1 }}>Instagram</h1>
        {conn && (
          <div style={{ fontSize: 13, color: C.text3 }}>
            @{conn.username || conn.ig_account_id} · {conn.account_type || 'Konto'}
          </div>
        )}
      </div>
      {phase === 'ready' && (
        <button onClick={onRefresh} disabled={refreshing} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
          borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff',
          color: C.text2, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          <RefreshCw size={15} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
          Aktualisieren
        </button>
      )}
    </div>
  )

  function shell(children) {
    return <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>{header}{children}</div>
  }

  if (phase === 'loading') {
    return shell(<div style={{ color: C.text3, padding: 48, textAlign: 'center' }}>Lädt …</div>)
  }

  if (phase === 'disconnected') {
    return shell(
      <div style={{
        background: C.surface, border: `1px dashed ${C.border}`, borderRadius: 16,
        padding: '40px 28px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text1, marginBottom: 8 }}>
          Noch kein Instagram-Konto verbunden
        </div>
        <div style={{ color: C.text3, fontSize: 14, maxWidth: 460, margin: '0 auto 20px' }}>
          Verbinde dein Instagram-Konto in den Einstellungen, um Analysen zu sehen und
          Beiträge direkt aus dem Redaktionsplan zu veröffentlichen.
        </div>
        <button className="lk-btn lk-btn-primary" onClick={() => navigate('/settings/instagram')} >
          Instagram verbinden
        </button>
      </div>
    )
  }

  if (phase === 'error') {
    return shell(
      <div style={{
        background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12,
        padding: '18px 20px', color: '#991B1B', fontSize: 14,
      }}>
        {err || 'Es ist ein Fehler aufgetreten.'}
        <button onClick={load} style={{
          marginLeft: 12, padding: '4px 12px', borderRadius: 7, border: '1px solid #FECACA',
          background: '#fff', color: '#991B1B', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>Erneut versuchen</button>
      </div>
    )
  }

  // ── ready ───────────────────────────────────────────────────────────
  return shell(
    <>
      {/* KPI-Reihe */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <KpiCard icon={<Users size={15} />}     label="Follower"   value={fmt(snap.followers_count)} />
        <KpiCard icon={<UserPlus size={15} />}  label="Folgt"      value={fmt(snap.follows_count)} />
        <KpiCard icon={<IcImage size={15} />}   label="Beiträge"   value={fmt(snap.media_count)} />
        <KpiCard icon={<Eye size={15} />}       label="Reichweite" value={fmt(snap.reach)} />
      </div>

      {/* Demografie */}
      {demos.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text2, margin: '0 0 12px' }}>Zielgruppe</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {BREAKDOWNS.filter(b => demoGroups[b.key]?.length).map(b => (
              <div key={b.key} style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text2, marginBottom: 10 }}>{b.label}</div>
                <ResponsiveContainer width="100%" height={Math.max(120, demoGroups[b.key].length * 30)}>
                  <BarChart data={demoGroups[b.key]} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="category" width={90}
                      tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => `${v}%`} cursor={{ fill: '#00000008' }} />
                    <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                      {demoGroups[b.key].map((_, i) => <Cell key={i} fill={IG_PINK} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Posts */}
      <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text2, margin: '0 0 12px' }}>
        Beiträge {posts.length > 0 && <span style={{ color: C.text3, fontWeight: 500 }}>({posts.length})</span>}
      </h2>
      {posts.length === 0 ? (
        <div style={{ color: C.text3, fontSize: 14, padding: '16px 0' }}>Keine Beiträge vorhanden.</div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.canvas, color: C.text3, textAlign: 'left' }}>
                <th style={th}>Beitrag</th>
                <th style={thNum}><Heart size={13} /></th>
                <th style={thNum}><MessageCircle size={13} /></th>
                <th style={thNum}><Bookmark size={13} /></th>
                <th style={thNum}><Eye size={13} /></th>
                <th style={th}>Datum</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p, i) => (
                <tr key={p.ig_media_id || i} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: C.text2, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      {p.media_type || 'POST'}
                    </div>
                    <div style={{ color: C.text2, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.caption || '—'}
                    </div>
                  </td>
                  <td style={tdNum}>{fmt(p.like_count)}</td>
                  <td style={tdNum}>{fmt(p.comments_count)}</td>
                  <td style={tdNum}>{fmt(p.saved)}</td>
                  <td style={tdNum}>{fmt(p.reach)}</td>
                  <td style={td}>{fmtDate(p.posted_at)}</td>
                  <td style={td}>
                    {p.permalink && (
                      <a href={p.permalink} target="_blank" rel="noopener noreferrer"
                        style={{ color: PRIMARY, display: 'inline-flex' }}>
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Instagram-Leads */}
      {leads.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text2, margin: '0 0 12px' }}>
            Leads <span style={{ color: C.text3, fontWeight: 500 }}>({leads.length})</span>
          </h2>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.canvas, color: C.text3, textAlign: 'left' }}>
                  <th style={th}>Name</th>
                  <th style={th}>Kontakt</th>
                  <th style={th}>Status</th>
                  <th style={th}>Eingegangen</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l, i) => (
                  <tr key={l.id || i} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: C.text1 }}>{l.full_name || '—'}</div>
                      {l.notes && <div style={{ fontSize: 12, color: C.text3, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.notes}</div>}
                    </td>
                    <td style={td}>
                      <div>{l.email || '—'}</div>
                      <div style={{ fontSize: 12, color: C.text3 }}>{l.phone || ''}</div>
                    </td>
                    <td style={td}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
                        background: (LEAD_STATUS[l.status]?.c || '#94A3B8') + '22',
                        color: LEAD_STATUS[l.status]?.c || '#475569',
                      }}>{LEAD_STATUS[l.status]?.l || l.status || '—'}</span>
                    </td>
                    <td style={td}>{fmtDate(l.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

const LEAD_STATUS = {
  new:       { l: 'Neu',          c: '#2563EB' },
  contacted: { l: 'Kontaktiert',  c: '#D97706' },
  qualified: { l: 'Qualifiziert', c: '#059669' },
  lost:      { l: 'Verloren',     c: '#DC2626' },
}

const th    = { padding: '10px 14px', fontWeight: 600, fontSize: 12 }
const thNum = { ...th, textAlign: 'center', width: 56 }
const td    = { padding: '10px 14px', color: C.text2, verticalAlign: 'top' }
const tdNum = { ...td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }
