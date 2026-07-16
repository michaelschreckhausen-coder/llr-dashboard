import React, { useEffect, useState, useCallback } from 'react'
import { Loader2, Search, Users, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn-Netzwerk — das eigene 1st-degree-Netzwerk als Nachschlagewerk.
//
// Bewusst KEINE Triage-Surface: keine Übernehmen/Verwerfen-Aktionen, kein
// review_status. Das Netzwerk ist ein Fakt, keine Aufgabe. Wer daraus einen
// Lead machen will, geht über „LinkedIn Kontakte" (die Inbox).
//
// Quelle: public.linkedin_network, befüllt von import-unipile-relations
// (stündlicher Cron, gestaffelt per Hash-Stunde, Addon-Gate 'automation').
//
// Team-Scoping: expliziter team_id-Filter — RLS allein reicht bei Multi-Team-
// Membership nicht (Top-Fallstrick #14).
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const fullName = r => ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || r.name || 'Unbekannt'
const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 2)

function Avatar({ name, avatar_url, size = 40 }) {
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#0891b2']
  const bg = colors[(name || '').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} loading="lazy" decoding="async" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>{initials(name)}</div>
}

export default function LinkedInNetzwerk() {
  const { activeTeamId } = useTeam()

  const [rows, setRows]       = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState(null)
  const [q, setQ]             = useState('')
  const [dq, setDq]           = useState('')          // debounced
  const [page, setPage]       = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [okAccount, setOkAccount] = useState(undefined) // undefined=lädt · null=keiner · string

  // Debounce der Suche — sonst eine Query pro Tastenanschlag.
  useEffect(() => {
    const t = setTimeout(() => { setDq(q.trim()); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id
      if (!uid || cancelled) return
      supabase.from('unipile_accounts').select('unipile_account_id').eq('user_id', uid).eq('status', 'OK').limit(1)
        .then(({ data: a }) => { if (!cancelled) setOkAccount(a?.[0]?.unipile_account_id || null) })
    })
    return () => { cancelled = true }
  }, [])

  const load = useCallback(async () => {
    if (!activeTeamId) { setRows([]); setTotal(0); setLoading(false); return }
    setLoading(true); setErr(null)

    // Server-side Pagination + count — die Tabelle kann pro Team mehrere tausend
    // Rows haben. Kein clientseitiges .limit(N) mit stiller Kappung.
    let query = supabase
      .from('linkedin_network')
      .select('id, provider_id, linkedin_url, public_id, name, first_name, last_name, headline, job_title, company, location, avatar_url, imported_at, last_seen_at', { count: 'exact' })
      .eq('team_id', activeTeamId)

    if (dq) {
      const esc = dq.replace(/[%,()]/g, ' ')
      query = query.or(`name.ilike.%${esc}%,company.ilike.%${esc}%,headline.ilike.%${esc}%,job_title.ilike.%${esc}%`)
    }

    const from = page * PAGE_SIZE
    const { data, error, count } = await query
      .order('imported_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) { setErr(error.message); setRows([]); setLoading(false); return }
    setRows(data || [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [activeTeamId, dq, page])

  useEffect(() => { load() }, [load])

  const runSync = async () => {
    if (!okAccount) return
    setSyncing(true); setSyncMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('import-unipile-relations', {
        body: { unipile_account_id: okAccount },
      })
      if (error || data?.error) {
        setSyncMsg({ ok: false, text: 'Sync fehlgeschlagen: ' + (data?.error || error?.message || 'unbekannter Fehler') })
      } else {
        const n = (data?.inserted || 0) + (data?.updated || 0)
        setSyncMsg({ ok: true, text: `${n} Kontakt${n === 1 ? '' : 'e'} synchronisiert${data?.more_available ? ' — weitere folgen beim nächsten Lauf.' : '.'}` })
        setPage(0); load()
      }
    } catch (e) {
      setSyncMsg({ ok: false, text: 'Sync fehlgeschlagen: ' + (e?.message || e) })
    }
    setSyncing(false)
  }

  const pages = Math.ceil(total / PAGE_SIZE)
  const shownFrom = total === 0 ? 0 : page * PAGE_SIZE + 1
  const shownTo   = Math.min((page + 1) * PAGE_SIZE, total)

  const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }
  const btn  = { padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Kopf ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={22} style={{ color: 'var(--wl-primary, rgb(49,90,231))' }} />
            Netzwerk
          </h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
            Deine LinkedIn-Kontakte ersten Grades. Wird automatisch synchronisiert — hier passiert kein Outreach.
          </p>
        </div>
        {okAccount && (
          <button onClick={runSync} disabled={syncing} style={{ ...btn, opacity: syncing ? 0.6 : 1 }}>
            {syncing ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            {syncing ? 'Synchronisiert…' : 'Jetzt synchronisieren'}
          </button>
        )}
      </div>

      {syncMsg && (
        <div style={{ ...card, padding: '10px 14px', marginBottom: 14, fontSize: 14, borderColor: syncMsg.ok ? '#bbf7d0' : '#fecaca', background: syncMsg.ok ? '#f0fdf4' : '#fef2f2', color: syncMsg.ok ? '#166534' : '#991b1b' }}>
          {syncMsg.text}
        </div>
      )}

      {/* ── Suche ── */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Name, Unternehmen, Position durchsuchen…"
          style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* ── Zähler ── */}
      {!loading && !err && (
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
          {total === 0 ? 'Keine Kontakte' : `${shownFrom}–${shownTo} von ${total.toLocaleString('de-DE')}`}
          {dq && total > 0 && ' (gefiltert)'}
        </div>
      )}

      {/* ── Zustände ── */}
      {err && (
        <div style={{ ...card, padding: 16, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 14, display: 'flex', gap: 10 }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <div>Laden fehlgeschlagen: {err}</div>
        </div>
      )}

      {loading && (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: '#6b7280' }}>
          <Loader2 size={22} className="spin" />
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div style={{ ...card, padding: 40, textAlign: 'center' }}>
          <Users size={30} style={{ color: '#d1d5db' }} />
          <div style={{ fontWeight: 700, marginTop: 10, fontSize: 15 }}>
            {dq ? 'Keine Treffer' : 'Noch kein Netzwerk importiert'}
          </div>
          <p style={{ color: '#6b7280', fontSize: 14, margin: '6px 0 0' }}>
            {dq
              ? 'Andere Suchbegriffe probieren.'
              : okAccount === null
                ? 'Verbinde zuerst deinen LinkedIn-Account unter „Einstellungen → LinkedIn".'
                : 'Der Sync läuft automatisch. Du kannst ihn oben auch manuell anstoßen.'}
          </p>
        </div>
      )}

      {/* ── Liste ── */}
      {!loading && !err && rows.length > 0 && (
        <div style={{ ...card, overflow: 'hidden' }}>
          {rows.map((r, i) => {
            const n = fullName(r)
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid #f3f4f6' }}>
                <Avatar name={n} avatar_url={r.avatar_url} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</div>
                  <div style={{ color: '#6b7280', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.headline || [r.job_title, r.company].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                {r.location && (
                  <div style={{ color: '#9ca3af', fontSize: 12, flexShrink: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.location}
                  </div>
                )}
                {r.linkedin_url && (
                  <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer"
                     title="LinkedIn-Profil öffnen"
                     style={{ ...btn, padding: '6px 10px', flexShrink: 0, color: '#374151', textDecoration: 'none' }}>
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && !err && pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  style={{ ...btn, opacity: page === 0 ? 0.45 : 1, cursor: page === 0 ? 'default' : 'pointer' }}>
            Zurück
          </button>
          <span style={{ fontSize: 13, color: '#6b7280' }}>Seite {page + 1} von {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                  style={{ ...btn, opacity: page >= pages - 1 ? 0.45 : 1, cursor: page >= pages - 1 ? 'default' : 'pointer' }}>
            Weiter
          </button>
        </div>
      )}
    </div>
  )
}
