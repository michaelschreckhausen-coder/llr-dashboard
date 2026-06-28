import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, Loader2, UserPlus, Building2, Inbox as InboxIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn-Import-Inbox — Triage-Queue VOR dem CRM.
// Importierte Kontakte (Sales-Nav-Sync → public.linkedin_inbox) werden hier
// gesichtet und per 1-Klick in echte CRM-Leads überführt (promote_inbox_contact).
// ─────────────────────────────────────────────────────────────────────────────

const fullName = r => ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || r.name || 'Unbekannt'
const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 2)
const cleanUrl = u => (u || '').split('?')[0].replace(/\/$/, '')

function Avatar({ name, avatar_url, size = 44 }) {
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#0891b2']
  const bg = colors[(name || '').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>{initials(name)}</div>
}

export default function LinkedInInbox() {
  const { activeTeamId } = useTeam()
  const navigate = useNavigate()

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(() => new Set())
  const [existing, setExisting] = useState(() => new Set()) // inbox.id, die bereits aktiv im CRM liegen
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState(null) // { text, leadId? }

  const load = useCallback(async () => {
    if (!activeTeamId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('linkedin_inbox')
      .select('id, source, sales_nav_id, linkedin_url, name, first_name, last_name, headline, job_title, company, location, avatar_url, imported_at')
      .eq('team_id', activeTeamId)
      .eq('review_status', 'new')
      .order('imported_at', { ascending: false })
      .limit(500)

    if (error) { setMsg({ text: 'Laden fehlgeschlagen: ' + error.message }); setRows([]); setLoading(false); return }
    const list = data || []
    setRows(list)
    setSelected(new Set())

    // "bereits im CRM"-Badge (nur UI-Hinweis): gegen aktive leads via sales_nav_id
    // matchen. Bewusst nur sales_nav_id (simple Tokens) statt .or() mit URLs —
    // URLs enthalten :/ und brechen den PostgREST-Filter. Der Server-Dedup im
    // promote_inbox_contact-RPC deckt linkedin_url ohnehin robust ab.
    const snIds = list.map(r => r.sales_nav_id).filter(Boolean)
    const hit = new Set()
    if (snIds.length) {
      const { data: leadHits } = await supabase
        .from('leads')
        .select('sales_nav_id')
        .eq('team_id', activeTeamId)
        .eq('archived', false)
        .in('sales_nav_id', snIds)
      const snSet = new Set((leadHits || []).map(l => l.sales_nav_id).filter(Boolean))
      for (const r of list) {
        if (r.sales_nav_id && snSet.has(r.sales_nav_id)) hit.add(r.id)
      }
    }
    setExisting(hit)
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { load() }, [load])

  const toggle = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const allSelected = rows.length > 0 && selected.size === rows.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))

  const removeRows = ids => {
    const drop = new Set(ids)
    setRows(prev => prev.filter(r => !drop.has(r.id)))
    setSelected(prev => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n })
  }

  const promoteOne = async (row) => {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('promote_inbox_contact', { p_inbox_id: row.id })
    setBusy(false)
    if (error) { setMsg({ text: 'Übernehmen fehlgeschlagen: ' + error.message }); return }
    removeRows([row.id])
    setMsg({ text: `„${fullName(row)}" ist jetzt ein CRM-Kontakt.`, leadId: data })
  }

  const promoteSelected = async () => {
    const ids = [...selected]
    if (!ids.length) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('promote_inbox_contacts', { p_inbox_ids: ids })
    setBusy(false)
    if (error) { setMsg({ text: 'Bulk-Übernehmen fehlgeschlagen: ' + error.message }); return }
    const okIds = (data || []).filter(r => r.ok).map(r => r.inbox_id)
    const failed = (data || []).filter(r => !r.ok).length
    removeRows(okIds.length ? okIds : ids)
    setMsg({ text: `${okIds.length} Kontakt(e) übernommen${failed ? `, ${failed} fehlgeschlagen` : ''}.` })
  }

  const dismiss = async (row) => {
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('linkedin_inbox').update({ review_status: 'dismissed' }).eq('id', row.id)
    setBusy(false)
    if (error) { setMsg({ text: 'Verwerfen fehlgeschlagen: ' + error.message }); return }
    removeRows([row.id])
  }

  const card = 'var(--surface)', border = 'var(--border)', text = 'var(--text-primary)', muted = 'var(--text-muted)', primary = 'var(--primary)'

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 20px 80px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <InboxIcon size={22} style={{ color: primary }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: text, margin: 0 }}>Import-Inbox</h1>
        {!loading && <span style={{ background: primary, color: '#fff', borderRadius: 99, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>{rows.length}</span>}
      </div>
      <p style={{ color: muted, fontSize: 14, margin: '0 0 20px' }}>
        Aus LinkedIn importierte Kontakte — noch keine CRM-Kontakte. Sichten und per Klick ins CRM übernehmen.
      </p>

      {msg && (
        <div style={{ background: 'var(--primary-soft)', border: `1px solid ${border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: text, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{msg.text}</span>
          {msg.leadId && <button onClick={() => navigate('/leads/' + msg.leadId)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: primary, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Öffnen →</button>}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Alle auswählen
          </label>
          <button
            onClick={promoteSelected}
            disabled={busy || selected.size === 0}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, background: selected.size ? primary : 'var(--border)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: selected.size ? 'pointer' : 'default' }}>
            {busy ? <Loader2 size={15} className="spin" /> : <UserPlus size={15} />} Ausgewählte übernehmen{selected.size ? ` (${selected.size})` : ''}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: muted }}><Loader2 size={26} className="spin" /></div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: muted }}>
          <InboxIcon size={40} style={{ opacity: 0.4 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: text, marginTop: 12 }}>Inbox ist leer</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>Neue LinkedIn-Importe landen hier zur Sichtung.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(row => {
            const sel = selected.has(row.id)
            const inCrm = existing.has(row.id)
            return (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: card, border: `1px solid ${sel ? primary : border}`, borderRadius: 12, padding: '12px 16px' }}>
                <input type="checkbox" checked={sel} onChange={() => toggle(row.id)} style={{ flexShrink: 0 }} />
                <Avatar name={fullName(row)} avatar_url={row.avatar_url} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, color: text, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(row)}</span>
                    {inCrm && <span style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FCD34D', borderRadius: 99, padding: '1px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>bereits im CRM</span>}
                  </div>
                  <div style={{ color: muted, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.headline || row.job_title || '—'}{row.company ? <> · <Building2 size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {row.company}</> : null}
                  </div>
                </div>
                <button onClick={() => promoteOne(row)} disabled={busy} title={inCrm ? 'Mit bestehendem CRM-Kontakt zusammenführen' : 'Als CRM-Kontakt übernehmen'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: primary, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
                  <Check size={14} /> {inCrm ? 'Zusammenführen' : 'Übernehmen'}
                </button>
                <button onClick={() => dismiss(row)} disabled={busy} title="Verwerfen"
                  style={{ display: 'inline-flex', alignItems: 'center', background: 'none', color: muted, border: `1px solid ${border}`, borderRadius: 8, padding: 8, cursor: 'pointer', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
