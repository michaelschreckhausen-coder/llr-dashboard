import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, Loader2, UserPlus, Building2, Inbox as InboxIcon, Megaphone, Plus, ListChecks } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useInboxLists } from '../hooks/useInboxLists'

// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn-Import-Inbox — Triage-Queue VOR dem CRM.
// Importierte Kontakte (linkedin_inbox) werden hier gesichtet, nach Outreach-
// Kampagnen gruppiert und per 1-Klick in echte CRM-Leads überführt.
// Kampagnen-Zuordnung = reine Gruppierung (automation_campaign_leads.inbox_id),
// KEIN Auto-Start von Outreach (das passiert bewusst im Automatisierung-Modul).
// ─────────────────────────────────────────────────────────────────────────────

const fullName = r => ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || r.name || 'Unbekannt'
const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 2)

function Avatar({ name, avatar_url, size = 44 }) {
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#0891b2']
  const bg = colors[(name || '').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} loading="lazy" decoding="async" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>{initials(name)}</div>
}

export default function LinkedInInbox() {
  const { activeTeamId } = useTeam()
  const navigate = useNavigate()

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(() => new Set())
  const [existing, setExisting] = useState(() => new Set())  // inbox.id bereits aktiv im CRM
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState(null)             // { text, leadId? }
  const [uid, setUid]           = useState(null)

  // Kampagnen-Gruppierung
  const [campaigns, setCampaigns] = useState([])             // [{id, name}]
  const [memById, setMemById]     = useState(() => new Map())// inbox_id → [campaign_id]
  const [filter, setFilter]       = useState('all')          // 'all' | 'none' | campaign_id
  const [assignOpen, setAssignOpen] = useState(false)

  // Inbox-Listen (reine Auswahl-Sammlungen, getrennt von Kampagnen)
  const { lists, membersByList, createList, addToList } = useInboxLists({ activeTeamId })
  const [listOpen, setListOpen]     = useState(false)
  const [listFilter, setListFilter] = useState('all')        // 'all' | list_id

  // Sales-Navigator-Import (Unipile) → Import-Inbox, optional direkt in eine Liste
  const [importOpen, setImportOpen] = useState(false)
  const [okAccount, setOkAccount]   = useState(undefined)    // undefined=lädt · null=keiner · string=account_id
  const [impUrl, setImpUrl]         = useState('')
  const [impListMode, setImpListMode] = useState('none')     // 'none' | 'new' | list_id
  const [impNewList, setImpNewList] = useState('')
  const [importing, setImporting]   = useState(false)
  const [importErr, setImportErr]   = useState(null)

  // Progressives Rendern — nur PAGE_SIZE Karten gleichzeitig im DOM, Rest per Infinite-Scroll.
  const PAGE_SIZE = 25
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  // Verbundenen Unipile-Account des Users laden (Status OK) — für den Sales-Nav-Import.
  useEffect(() => {
    if (!uid) return
    supabase.from('unipile_accounts').select('unipile_account_id').eq('user_id', uid).eq('status', 'OK').limit(1)
      .then(({ data }) => setOkAccount(data?.[0]?.unipile_account_id || null))
  }, [uid])

  const runSalesNavImport = async () => {
    setImportErr(null)
    if (!okAccount) { setImportErr('Kein verbundener LinkedIn-Account.'); return }
    if (!impUrl.trim()) { setImportErr('Bitte eine Sales-Navigator-Such-URL eingeben.'); return }
    setImporting(true)
    let listId = null
    try {
      if (impListMode === 'new') {
        if (!impNewList.trim()) { setImportErr('Bitte einen Namen für die neue Liste eingeben.'); setImporting(false); return }
        const r = await createList(impNewList.trim(), '#30A0D0')
        listId = r?.id ?? r?.data?.id ?? (Array.isArray(r?.data) ? r.data[0]?.id : null)
        if (!listId) { setImportErr('Liste anlegen fehlgeschlagen.'); setImporting(false); return }
      } else if (impListMode !== 'none') {
        listId = impListMode
      }
      const { data, error } = await supabase.functions.invoke('import-unipile-salesnav', {
        body: { unipile_account_id: okAccount, search: { url: impUrl.trim() }, ...(listId ? { inbox_list_id: listId } : {}) },
      })
      if (error || data?.error) { setImportErr('Import fehlgeschlagen: ' + (data?.error || error?.message || 'unbekannt')); setImporting(false); return }
      const n = (data?.inserted || 0) + (data?.updated || 0)
      setImporting(false); setImportOpen(false); setImpUrl(''); setImpListMode('none'); setImpNewList('')
      setMsg({ text: `${n} Kontakt${n === 1 ? '' : 'e'} importiert${listId ? ' + der Liste zugeordnet' : ''}.` })
      load()
    } catch (e) { setImportErr('Import fehlgeschlagen: ' + (e?.message || e)); setImporting(false) }
  }

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

    // "bereits im CRM"-Badge via sales_nav_id-Match gegen aktive leads.
    const snIds = list.map(r => r.sales_nav_id).filter(Boolean)
    const hit = new Set()
    if (snIds.length) {
      const { data: leadHits } = await supabase
        .from('leads').select('sales_nav_id').eq('team_id', activeTeamId).eq('archived', false).in('sales_nav_id', snIds)
      const snSet = new Set((leadHits || []).map(l => l.sales_nav_id).filter(Boolean))
      for (const r of list) if (r.sales_nav_id && snSet.has(r.sales_nav_id)) hit.add(r.id)
    }
    setExisting(hit)

    // Kampagnen + Mitgliedschaften (Outreach-Kampagnen, user-scoped via RLS).
    const [{ data: camps }, { data: acl }] = await Promise.all([
      supabase.from('automation_campaigns').select('id, name').order('created_at', { ascending: false }),
      list.length
        ? supabase.from('automation_campaign_leads').select('inbox_id, campaign_id').in('inbox_id', list.map(r => r.id))
        : Promise.resolve({ data: [] }),
    ])
    setCampaigns(camps || [])
    const m = new Map()
    for (const r of (acl || [])) {
      if (!r.inbox_id) continue
      const arr = m.get(r.inbox_id) || []
      arr.push(r.campaign_id)
      m.set(r.inbox_id, arr)
    }
    setMemById(m)
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { load() }, [load])

  const campName = id => (campaigns.find(c => c.id === id) || {}).name || 'Kampagne'
  // Counts pro Kampagne (nur geladene Inbox-Rows) + "Ohne Kampagne"
  const campCounts = new Map()
  let noneCount = 0
  for (const r of rows) {
    const cs = memById.get(r.id)
    if (cs && cs.length) cs.forEach(cid => campCounts.set(cid, (campCounts.get(cid) || 0) + 1))
    else noneCount++
  }
  const filterCampaigns = campaigns.filter(c => (campCounts.get(c.id) || 0) > 0)

  const displayed = rows.filter(r => {
    // Kampagnen-Filter
    if (filter !== 'all') {
      const cs = memById.get(r.id) || []
      if (filter === 'none' ? cs.length !== 0 : !cs.includes(filter)) return false
    }
    // Listen-Filter (zusätzliche Einschränkung)
    if (listFilter !== 'all') {
      const set = membersByList.get(listFilter)
      if (!set || !set.has(r.id)) return false
    }
    return true
  })
  const visible = displayed.slice(0, visibleCount)
  const hasMore = visibleCount < displayed.length

  // Beim Filter-/Team-Wechsel wieder auf die erste Seite zurücksetzen.
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [filter, listFilter, activeTeamId])

  // Infinite-Scroll: sobald der Sentinel in den Viewport kommt, 25 weitere anhängen.
  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisibleCount(c => Math.min(c + PAGE_SIZE, displayed.length))
      }
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, displayed.length])

  const toggle = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = displayed.length > 0 && displayed.every(r => selected.has(r.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(displayed.map(r => r.id)))

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
    const ids = [...selected]; if (!ids.length) return
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

  // Zuordnen = nur Gruppierung (Mitgliedschaft), KEIN Outreach-Start.
  const assign = async ({ campaignId, newName }) => {
    const ids = [...selected]; if (!ids.length) return
    setBusy(true); setMsg(null)
    let cid = campaignId
    let cName = campaignId ? campName(campaignId) : ''
    if (!cid && newName && newName.trim()) {
      const { data: created, error: cErr } = await supabase
        .from('automation_campaigns').insert({ user_id: uid, name: newName.trim() }).select('id, name').single()
      if (cErr) { setBusy(false); setMsg({ text: 'Kampagne anlegen fehlgeschlagen: ' + cErr.message }); return }
      cid = created.id; cName = created.name
      setCampaigns(prev => [created, ...prev])
    }
    if (!cid) { setBusy(false); return }
    // nur Kontakte, die noch nicht in dieser Kampagne sind
    const toAdd = ids.filter(id => !(memById.get(id) || []).includes(cid))
    if (!toAdd.length) { setBusy(false); setAssignOpen(false); setMsg({ text: 'Alle ausgewählten sind bereits in dieser Kampagne.' }); return }
    const ins = toAdd.map(inbox_id => ({ campaign_id: cid, inbox_id, user_id: uid, status: 'queued', current_step: 0 }))
    const { error } = await supabase.from('automation_campaign_leads').insert(ins)
    setBusy(false); setAssignOpen(false)
    if (error) { setMsg({ text: 'Zuordnen fehlgeschlagen: ' + error.message }); return }
    setMemById(prev => {
      const n = new Map(prev)
      toAdd.forEach(id => n.set(id, [...(n.get(id) || []), cid]))
      return n
    })
    setSelected(new Set())
    setMsg({ text: `${toAdd.length} Kontakt(e) zu „${cName || 'Kampagne'}" hinzugefügt (nur gruppiert — kein Outreach gestartet).` })
  }

  // Zu Liste = reine Auswahl-Sammlung (getrennt von Kampagnen/Outreach).
  const assignToList = async ({ listId, newName, color }) => {
    const ids = [...selected]; if (!ids.length) return
    setBusy(true); setMsg(null)
    let lid = listId
    let lName = ''
    if (!lid && newName && newName.trim()) {
      const { data: created, error: cErr } = await createList(newName.trim(), color)
      if (cErr || !created) { setBusy(false); setMsg({ text: 'Liste anlegen fehlgeschlagen: ' + (cErr?.message || '') }); return }
      lid = created.id; lName = created.name
    } else if (lid) {
      lName = (lists.find(l => l.id === lid) || {}).name || 'Liste'
    }
    if (!lid) { setBusy(false); return }
    const { error } = await addToList(lid, ids)
    setBusy(false); setListOpen(false)
    if (error) { setMsg({ text: 'Zu Liste hinzufügen fehlgeschlagen: ' + error.message }); return }
    setSelected(new Set())
    setMsg({ text: `${ids.length} Kontakt(e) zu „${lName || 'Liste'}" hinzugefügt.` })
  }

  const card = 'var(--surface)', border = 'var(--border)', text = 'var(--text-primary)', muted = 'var(--text-muted)', primary = 'var(--primary)'
  const chip = (active) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${active ? primary : border}`, background: active ? 'var(--primary-soft)' : card, color: active ? primary : muted })

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {importOpen && (
        <div onClick={() => !importing && setImportOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, width: 520, maxWidth: '94vw', padding: 24, boxShadow: '0 24px 64px rgba(15,23,42,0.25)' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: text, marginBottom: 4 }}>Sales-Navigator-Suche importieren</div>
            <p style={{ fontSize: 13, color: muted, margin: '0 0 16px', lineHeight: 1.5 }}>Füge die URL einer Sales-Navigator-Personensuche ein — die Treffer landen in deiner Import-Inbox (optional direkt in einer Liste).</p>

            {okAccount === undefined ? (
              <div style={{ color: muted, fontSize: 14, padding: '12px 0' }}>Lade LinkedIn-Verbindung…</div>
            ) : okAccount === null ? (
              <div style={{ background: 'var(--primary-soft)', border: `1px solid ${border}`, borderRadius: 10, padding: 16, fontSize: 14, color: text, lineHeight: 1.5 }}>
                Kein verbundener LinkedIn-Account.{' '}
                <button onClick={() => navigate('/settings/linkedin')} style={{ background: 'none', border: 'none', color: primary, fontWeight: 700, cursor: 'pointer', fontSize: 14, padding: 0 }}>LinkedIn zuerst verbinden →</button>
              </div>
            ) : (
              <>
                <label style={{ fontSize: 12, fontWeight: 700, color: muted }}>Sales-Navigator-Such-URL</label>
                <textarea value={impUrl} onChange={e => setImpUrl(e.target.value)} rows={2} placeholder="https://www.linkedin.com/sales/search/people?query=…"
                  style={{ width: '100%', marginTop: 6, padding: 10, border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: 'var(--surface)', color: text, boxSizing: 'border-box', resize: 'vertical' }} />
                {impUrl.trim() && !/linkedin\.com\/sales\/search\/people/i.test(impUrl) && (
                  <div style={{ fontSize: 12, color: '#B45309', marginTop: 4 }}>⚠ Sieht nicht nach einer Sales-Navigator-Personensuche aus — Import wird trotzdem versucht.</div>
                )}

                <label style={{ fontSize: 12, fontWeight: 700, color: muted, display: 'block', marginTop: 14 }}>In Liste (optional)</label>
                <select value={impListMode} onChange={e => setImpListMode(e.target.value)}
                  style={{ width: '100%', marginTop: 6, padding: 9, border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: text, boxSizing: 'border-box' }}>
                  <option value="none">— keine Liste —</option>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  <option value="new">+ Neue Liste anlegen…</option>
                </select>
                {impListMode === 'new' && (
                  <input value={impNewList} onChange={e => setImpNewList(e.target.value)} placeholder="Name der neuen Liste"
                    style={{ width: '100%', marginTop: 8, padding: 9, border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: text, boxSizing: 'border-box' }} />
                )}

                {importErr && <div style={{ fontSize: 13, color: '#B91C1C', marginTop: 12 }}>{importErr}</div>}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                  <button onClick={() => setImportOpen(false)} disabled={importing} style={{ border: `1px solid ${border}`, background: card, color: muted, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Abbrechen</button>
                  <button onClick={runSalesNavImport} disabled={importing || !impUrl.trim()} style={{ border: 'none', background: primary, color: '#fff', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: importing ? 'not-allowed' : 'pointer', opacity: (importing || !impUrl.trim()) ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {importing ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Importiere…</> : 'Importieren'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Journal-Header (analog /messages, /automatisierung) */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 20, color: '#30A0D0', fontFamily: '"Caveat", cursive', fontWeight: 600, marginBottom: 6 }}>LinkedIn · Import-Inbox</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2, color: 'var(--text-primary, rgb(20,20,43))' }}>Deine Import-Inbox.</h1>
          {!loading && <span style={{ background: primary, color: '#fff', borderRadius: 99, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>{rows.length}</span>}
          <button onClick={() => { setImportErr(null); setImportOpen(true) }}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: primary, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={15} /> Sales-Navigator-Suche importieren
          </button>
        </div>
        <p style={{ fontSize: 13, color: muted, margin: '8px 0 0', lineHeight: 1.6, maxWidth: 600 }}>
          Aus LinkedIn importierte Kontakte — noch keine CRM-Kontakte. Nach Kampagnen sortieren, sichten und per Klick ins CRM übernehmen.
        </p>
      </div>

      {/* Kampagnen-Filterleiste */}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={chip(filter === 'all')} onClick={() => setFilter('all')}>Alle <b>{rows.length}</b></span>
          {filterCampaigns.map(c => (
            <span key={c.id} style={chip(filter === c.id)} onClick={() => setFilter(c.id)}>
              <Megaphone size={13} /> {c.name} <b>{campCounts.get(c.id)}</b>
            </span>
          ))}
          {noneCount > 0 && <span style={chip(filter === 'none')} onClick={() => setFilter('none')}>Ohne Kampagne <b>{noneCount}</b></span>}
        </div>
      )}

      {/* Listen-Filterleiste (reine Auswahl-Sammlungen) */}
      {!loading && rows.length > 0 && lists.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: muted, marginRight: 2 }}>Nach Liste:</span>
          <span style={chip(listFilter === 'all')} onClick={() => setListFilter('all')}>Alle</span>
          {lists.map(l => {
            const set = membersByList.get(l.id)
            const cnt = set ? rows.reduce((n, r) => n + (set.has(r.id) ? 1 : 0), 0) : 0
            return (
              <span key={l.id} style={chip(listFilter === l.id)} onClick={() => setListFilter(l.id)}>
                <ListChecks size={13} /> {l.name} <b>{cnt}</b>
              </span>
            )
          })}
        </div>
      )}

      {msg && (
        <div style={{ background: 'var(--primary-soft)', border: `1px solid ${border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: text, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{msg.text}</span>
          {msg.leadId && <button onClick={() => navigate('/leads/' + msg.leadId)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: primary, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Öffnen →</button>}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Alle auswählen
          </label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => setListOpen(true)} disabled={busy || selected.size === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: card, color: selected.size ? primary : muted, border: `1.5px solid ${selected.size ? primary : border}`, borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: selected.size ? 'pointer' : 'default' }}>
              <ListChecks size={15} /> Zu Liste{selected.size ? ` (${selected.size})` : ''}
            </button>
            <button onClick={() => setAssignOpen(true)} disabled={busy || selected.size === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: card, color: selected.size ? primary : muted, border: `1.5px solid ${selected.size ? primary : border}`, borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: selected.size ? 'pointer' : 'default' }}>
              <Megaphone size={15} /> Zu Kampagne{selected.size ? ` (${selected.size})` : ''}
            </button>
            <button onClick={promoteSelected} disabled={busy || selected.size === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: selected.size ? primary : 'var(--border)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: selected.size ? 'pointer' : 'default' }}>
              {busy ? <Loader2 size={15} className="spin" /> : <UserPlus size={15} />} Übernehmen{selected.size ? ` (${selected.size})` : ''}
            </button>
          </div>
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
          {visible.map(row => {
            const sel = selected.has(row.id)
            const inCrm = existing.has(row.id)
            const memberOf = memById.get(row.id) || []
            return (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: card, border: `1px solid ${sel ? primary : border}`, borderRadius: 12, padding: '12px 16px' }}>
                <input type="checkbox" checked={sel} onChange={() => toggle(row.id)} style={{ flexShrink: 0 }} />
                <Avatar name={fullName(row)} avatar_url={row.avatar_url} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: text, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(row)}</span>
                    {inCrm && <span style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FCD34D', borderRadius: 99, padding: '1px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>bereits im CRM</span>}
                    {memberOf.map(cid => (
                      <span key={cid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--primary-soft)', color: primary, borderRadius: 99, padding: '1px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <Megaphone size={10} /> {campName(cid)}
                      </span>
                    ))}
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

          {/* Infinite-Scroll-Sentinel + Fallback-Button */}
          {hasMore && (
            <div ref={sentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 0 4px' }}>
              <Loader2 size={20} className="spin" style={{ color: muted }} />
              <button onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, displayed.length))}
                style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: muted, cursor: 'pointer' }}>
                Mehr laden
              </button>
            </div>
          )}
          {displayed.length > 0 && (
            <div style={{ textAlign: 'center', fontSize: 12, color: muted, padding: '8px 0 2px' }}>
              {Math.min(visibleCount, displayed.length)} von {displayed.length} angezeigt
            </div>
          )}
        </div>
      )}

      {assignOpen && (
        <AssignModal
          campaigns={campaigns}
          count={selected.size}
          busy={busy}
          onClose={() => setAssignOpen(false)}
          onConfirm={assign}
        />
      )}

      {listOpen && (
        <ListModal
          lists={lists}
          count={selected.size}
          busy={busy}
          onClose={() => setListOpen(false)}
          onConfirm={assignToList}
        />
      )}
    </div>
  )
}

function AssignModal({ campaigns, count, busy, onClose, onConfirm }) {
  const [mode, setMode] = useState(campaigns.length ? 'existing' : 'new')
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || '')
  const [newName, setNewName] = useState('')
  const primary = 'var(--primary)', border = 'var(--border)', text = 'var(--text-primary)', muted = 'var(--text-muted)'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: text, marginBottom: 4 }}>{count} Kontakt(e) zu Kampagne</div>
        <div style={{ fontSize: 13, color: muted, marginBottom: 18 }}>Nur Gruppierung — startet keinen Outreach. Das Losschicken machst du im Automatisierung-Modul.</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setMode('existing')} disabled={!campaigns.length}
            style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: `1.5px solid ${mode === 'existing' ? primary : border}`, background: mode === 'existing' ? 'var(--primary-soft)' : 'var(--surface)', color: mode === 'existing' ? primary : muted, fontWeight: 700, fontSize: 13, cursor: campaigns.length ? 'pointer' : 'default' }}>Bestehende</button>
          <button onClick={() => setMode('new')}
            style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: `1.5px solid ${mode === 'new' ? primary : border}`, background: mode === 'new' ? 'var(--primary-soft)' : 'var(--surface)', color: mode === 'new' ? primary : muted, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Neue Kampagne</button>
        </div>

        {mode === 'existing' ? (
          <select value={campaignId} onChange={e => setCampaignId(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${border}`, fontSize: 14, background: 'var(--surface)', color: text, outline: 'none' }}>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Kampagnenname (z.B. Q3 Kaltakquise)"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${border}`, fontSize: 14, background: 'var(--surface)', color: text, outline: 'none' }} />
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${border}`, background: 'var(--surface)', color: muted, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Abbrechen</button>
          <button
            onClick={() => onConfirm(mode === 'existing' ? { campaignId } : { newName })}
            disabled={busy || (mode === 'existing' ? !campaignId : !newName.trim())}
            style={{ flex: 1.4, padding: '10px 0', borderRadius: 10, border: 'none', background: primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Hinzufügen
          </button>
        </div>
      </div>
    </div>
  )
}

function ListModal({ lists, count, busy, onClose, onConfirm }) {
  const [mode, setMode] = useState(lists.length ? 'existing' : 'new')
  const [listId, setListId] = useState(lists[0]?.id || '')
  const [newName, setNewName] = useState('')
  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#0891b2']
  const [color, setColor] = useState(COLORS[0])
  const primary = 'var(--primary)', border = 'var(--border)', text = 'var(--text-primary)', muted = 'var(--text-muted)'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: text, marginBottom: 4 }}>{count} Kontakt(e) zu Liste</div>
        <div style={{ fontSize: 13, color: muted, marginBottom: 18 }}>Reine Auswahl-Sammlung — später in Automatisierung und Vernetzung auswählbar. Startet keinen Outreach.</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setMode('existing')} disabled={!lists.length}
            style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: `1.5px solid ${mode === 'existing' ? primary : border}`, background: mode === 'existing' ? 'var(--primary-soft)' : 'var(--surface)', color: mode === 'existing' ? primary : muted, fontWeight: 700, fontSize: 13, cursor: lists.length ? 'pointer' : 'default' }}>Bestehende</button>
          <button onClick={() => setMode('new')}
            style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: `1.5px solid ${mode === 'new' ? primary : border}`, background: mode === 'new' ? 'var(--primary-soft)' : 'var(--surface)', color: mode === 'new' ? primary : muted, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Neue Liste</button>
        </div>

        {mode === 'existing' ? (
          <select value={listId} onChange={e => setListId(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${border}`, fontSize: 14, background: 'var(--surface)', color: text, outline: 'none' }}>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        ) : (
          <>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Listenname (z.B. Q3 Follow-up)"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${border}`, fontSize: 14, background: 'var(--surface)', color: text, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: muted, fontWeight: 600 }}>Farbe:</span>
              {COLORS.map(c => (
                <span key={c} onClick={() => setColor(c)} title="Farbe wählen"
                  style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid var(--text-primary)' : '2px solid transparent' }} />
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${border}`, background: 'var(--surface)', color: muted, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Abbrechen</button>
          <button
            onClick={() => onConfirm(mode === 'existing' ? { listId } : { newName, color })}
            disabled={busy || (mode === 'existing' ? !listId : !newName.trim())}
            style={{ flex: 1.4, padding: '10px 0', borderRadius: 10, border: 'none', background: primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Hinzufügen
          </button>
        </div>
      </div>
    </div>
  )
}
