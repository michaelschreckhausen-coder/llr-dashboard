import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, Loader2, UserPlus, Building2, Inbox as InboxIcon, Plus, ListChecks, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useInboxLists } from '../hooks/useInboxLists'

// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn-Import-Inbox — Triage-Queue VOR dem CRM.
// Importierte Kontakte (linkedin_inbox) werden hier gesichtet, in Listen
// (inbox_lists) gruppiert und per 1-Klick in echte CRM-Leads überführt.
// Listen = reine Auswahl-Sammlungen (später in der Automatisierung als Zielgruppe
// wählbar) — KEIN Outreach-Start hier.
// ─────────────────────────────────────────────────────────────────────────────

const fullName = r => ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || r.name || 'Unbekannt'
const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 2)

// Freundliche Sales-Nav-Import-Fehler aus dem EF-Error-Body (functions.invoke legt ihn in error.context ab).
function friendlyImportError(body, raw) {
  const t = body?.unipile_type || ''
  const e = body?.error || ''
  if (t.includes('feature_not_subscribed')) return 'Dieser LinkedIn-Account hat kein Sales-Navigator-Abo — der Sales-Navigator-Import ist damit nicht möglich.'
  if (body?.unipile_status === 404 || t.includes('resource_not_found') || e === 'unipile_account not found' || e === 'inbox_list nicht gefunden')
    return 'LinkedIn-Account nicht (mehr) verbunden — bitte unter „Einstellungen → LinkedIn" neu verbinden.'
  if (body?.unipile_status === 401 || t.includes('disconnected') || t.includes('invalid_credentials') || t.includes('unauthorized'))
    return 'Die LinkedIn-Verbindung ist abgelaufen — bitte neu verbinden.'
  if (e === 'keine Berechtigung für diese Liste') return 'Keine Berechtigung für die gewählte Liste.'
  if (e === 'Auth erforderlich für inbox_list_id') return 'Sitzung abgelaufen — bitte neu anmelden.'
  if (body?.detail) return 'Import fehlgeschlagen: ' + body.detail
  if (e) return 'Import fehlgeschlagen: ' + e
  return 'Import fehlgeschlagen (' + (raw?.message || 'unbekannter Fehler') + ').'
}

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
  // Inbox-Listen (reine Auswahl-Sammlungen — die einzige Gruppierung auf dieser Seite)
  const { lists, membersByList, createList, addToList, renameList, deleteList } = useInboxLists({ activeTeamId })
  const [listOpen, setListOpen]     = useState(false)
  const [deleteBulkModal, setDeleteBulkModal] = useState(null) // { ids, count, refs:{count,campaigns}, checking }
  const [listFilter, setListFilter] = useState('all')        // 'all' | list_id
  const [showNewList, setShowNewList] = useState(false)      // Inline-Create in der „Nach Liste"-Zeile
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
  const [editingListId, setEditingListId] = useState(null)   // Inline-Rename am Chip
  const [editListName, setEditListName]   = useState('')
  const [deleteListModal, setDeleteListModal] = useState(null) // { list, refs:[campaignName], checking }

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
    let createdListId = null   // nur die HIER neu angelegte Liste → bei Fehler zurückrollen
    try {
      if (impListMode === 'new') {
        const name = impNewList.trim()
        if (!name) { setImportErr('Bitte einen Namen für die neue Liste eingeben.'); setImporting(false); return }
        // Dedupe: gleichnamige Liste wiederverwenden statt Duplikat anzulegen
        const dupe = lists.find(l => (l.name || '').trim().toLowerCase() === name.toLowerCase())
        if (dupe) { listId = dupe.id }
        else {
          const r = await createList(name, '#30A0D0')
          listId = r?.id ?? r?.data?.id ?? (Array.isArray(r?.data) ? r.data[0]?.id : null)
          if (!listId) { setImportErr('Liste anlegen fehlgeschlagen.'); setImporting(false); return }
          createdListId = listId
        }
      } else if (impListMode !== 'none') {
        listId = impListMode
      }
      const { data, error } = await supabase.functions.invoke('import-unipile-salesnav', {
        body: { unipile_account_id: okAccount, search: { url: impUrl.trim() }, ...(listId ? { inbox_list_id: listId } : {}) },
      })
      if (error || data?.error) {
        if (createdListId) { await supabase.from('inbox_lists').delete().eq('id', createdListId) } // leere Liste zurückrollen
        let body = data?.error ? data : null
        if (!body && error) { try { body = await error.context?.json?.() } catch { /* konsumiert / kein JSON */ } }
        setImportErr(friendlyImportError(body, error)); setImporting(false); return
      }
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
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { load() }, [load])

  const displayed = rows.filter(r => {
    if (listFilter !== 'all') {
      const set = membersByList.get(listFilter)
      if (!set || !set.has(r.id)) return false
    }
    return true
  })
  const visible = displayed.slice(0, visibleCount)
  const hasMore = visibleCount < displayed.length

  // Beim Filter-/Team-Wechsel wieder auf die erste Seite zurücksetzen.
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [listFilter, activeTeamId])

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
    // crm_lead-Rows sind bereits CRM → aus dem Bulk-Übernehmen ausklammern (no-op).
    const ids = [...selected].filter(id => (rows.find(r => r.id === id)?.source) !== 'crm_lead')
    if (!ids.length) {
      setMsg({ text: 'Ausgewählte Kontakte stammen bereits aus dem CRM.' }); return
    }
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

  // Bulk-Löschen = HARD DELETE aus linkedin_inbox (irreversibel). Guard: prüfen, ob
  // Kontakte in Listen aktiver la_-Kampagnen hängen (informativ; kein FK-Bruch, da
  // la_enrollments/la_jobs keinen FK auf linkedin_inbox haben; inbox_list_members cascadet).
  const openBulkDelete = async () => {
    const ids = [...selected]; if (!ids.length) return
    setDeleteBulkModal({ ids, count: ids.length, refs: { count: 0, campaigns: [] }, checking: true })
    let refs = { count: 0, campaigns: [] }
    try {
      const { data } = await supabase.rpc('inbox_active_campaign_refs', { p_inbox_ids: ids })
      if (data) refs = { count: data.count || 0, campaigns: Array.isArray(data.campaigns) ? data.campaigns : [] }
    } catch { /* la_* evtl. nicht sichtbar → keine Refs annehmen */ }
    setDeleteBulkModal(m => (m ? { ...m, refs, checking: false } : m))
  }
  const confirmBulkDelete = async () => {
    const ids = deleteBulkModal?.ids || []
    if (!ids.length) { setDeleteBulkModal(null); return }
    setBusy(true); setMsg(null)
    // HARD DELETE — inbox_list_members cascadet via FK (ON DELETE CASCADE).
    const { error } = await supabase.from('linkedin_inbox').delete().in('id', ids)
    setBusy(false); setDeleteBulkModal(null)
    if (error) { setMsg({ text: 'Löschen fehlgeschlagen: ' + error.message }); return }
    removeRows(ids)
    setMsg({ text: `${ids.length} Kontakt(e) endgültig gelöscht.` })
  }

  // Liste anlegen ODER gleichnamige Team-Liste wiederverwenden (Dedup, case-insensitiv).
  // createList (useInboxLists) schreibt team-scoped in inbox_lists (RLS + GRANT vorhanden).
  const createOrReuseList = async (name, color) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return { error: new Error('Name fehlt') }
    const dupe = lists.find(l => (l.name || '').trim().toLowerCase() === trimmed.toLowerCase())
    if (dupe) return { data: dupe, reused: true }
    return await createList(trimmed, color)
  }

  // Standalone „+ Neue Liste" (ohne Kontakt-Zuweisung) aus der „Nach Liste"-Zeile.
  const createStandaloneList = async () => {
    const name = newListName.trim()
    if (!name) return
    setCreatingList(true)
    const { data, error, reused } = await createOrReuseList(name, '#30A0D0')
    setCreatingList(false)
    if (error) { setMsg({ text: 'Liste anlegen fehlgeschlagen: ' + error.message }); return }
    setShowNewList(false); setNewListName('')
    setMsg({ text: reused ? `Liste „${data.name}" existiert bereits.` : `Liste „${data.name}" angelegt.` })
  }

  // Liste umbenennen (inline am Chip) — Team-Check via RLS, Dedup gegen gleichnamige Team-Liste.
  const startRename = (l) => { setEditingListId(l.id); setEditListName(l.name || '') }
  const saveRename = async () => {
    const l = lists.find(x => x.id === editingListId)
    const name = editListName.trim()
    if (!l) { setEditingListId(null); return }
    if (!name || name === l.name) { setEditingListId(null); return }
    const dupe = lists.find(x => x.id !== l.id && (x.name || '').trim().toLowerCase() === name.toLowerCase())
    if (dupe) { setMsg({ text: `Es gibt bereits eine Liste „${dupe.name}".` }); return }
    const { error } = await renameList(l.id, name)
    if (error) { setMsg({ text: 'Umbenennen fehlgeschlagen: ' + error.message }); return }
    setEditingListId(null)
    setMsg({ text: `Liste umbenannt in „${name}".` })
  }

  // Löschen vorbereiten: prüfen, ob eine la_audience (kind='list') die Liste als Zielgruppe nutzt.
  const openDeleteList = async (l) => {
    setDeleteListModal({ list: l, refs: [], checking: true })
    let refs = []
    try {
      const { data: auds } = await supabase.from('la_audiences').select('id')
        .eq('team_id', activeTeamId).eq('kind', 'list').eq('query->>list_id', l.id)
      const audIds = (auds || []).map(a => a.id)
      if (audIds.length) {
        const { data: camps } = await supabase.from('la_campaigns').select('name').in('audience_id', audIds)
        refs = [...new Set((camps || []).map(c => c.name).filter(Boolean))]
      }
    } catch { /* la_* evtl. nicht sichtbar → keine Referenz annehmen */ }
    setDeleteListModal(m => (m && m.list.id === l.id ? { ...m, refs, checking: false } : m))
  }
  const confirmDeleteList = async () => {
    const l = deleteListModal?.list
    if (!l) return
    const { error } = await deleteList(l.id)
    setDeleteListModal(null)
    if (error) { setMsg({ text: 'Löschen fehlgeschlagen: ' + error.message }); return }
    if (listFilter === l.id) setListFilter('all')
    setMsg({ text: `Liste „${l.name}" gelöscht — die Kontakte bleiben in deinen LinkedIn Kontakten.` })
  }

  // Zu Liste = reine Auswahl-Sammlung.
  const assignToList = async ({ listId, newName, color }) => {
    const ids = [...selected]; if (!ids.length) return
    setBusy(true); setMsg(null)
    let lid = listId
    let lName = ''
    if (!lid && newName && newName.trim()) {
      const { data: created, error: cErr } = await createOrReuseList(newName.trim(), color)
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
  const miniBtn = { background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {importOpen && (
        <div onClick={() => !importing && setImportOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, width: 520, maxWidth: '94vw', padding: 24, boxShadow: '0 24px 64px rgba(15,23,42,0.25)' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: text, marginBottom: 4 }}>Sales-Navigator-Suche importieren</div>
            <p style={{ fontSize: 13, color: muted, margin: '0 0 16px', lineHeight: 1.5 }}>Füge die URL einer Sales-Navigator-Personensuche ein — die Treffer landen in deinen LinkedIn Kontakten (optional direkt in einer Liste).</p>

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
                  <button className="lk-btn lk-btn-primary" onClick={runSalesNavImport} disabled={importing || !impUrl.trim()} style={{ opacity: (importing || !impUrl.trim()) ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
        <div className="lk-eyebrow" style={{ fontSize:12, fontWeight:700, letterSpacing:'1.6px', textTransform:'uppercase', fontFamily:'Inter, sans-serif', color:'var(--primary, #003060)', marginBottom:6 }}>LinkedIn · Kontakte</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2, color: 'var(--text-primary, rgb(20,20,43))' }}>Deine LinkedIn Kontakte.</h1>
          {!loading && <span style={{ background: primary, color: '#fff', borderRadius: 99, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>{rows.length}</span>}
          <button className="lk-btn lk-btn-primary" onClick={() => { setImportErr(null); setImportOpen(true) }}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Sales-Navigator-Suche importieren
          </button>
        </div>
        <p style={{ fontSize: 13, color: muted, margin: '8px 0 0', lineHeight: 1.6, maxWidth: 600 }}>
          Aus LinkedIn importierte Kontakte — noch keine CRM-Kontakte. Nach Listen sichten und per Klick ins CRM übernehmen.
        </p>
      </div>

      {/* Listen-Filterleiste (reine Auswahl-Sammlungen) — inkl. „+ Neue Liste" */}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: muted, marginRight: 2 }}>Nach Liste:</span>
          <span style={chip(listFilter === 'all')} onClick={() => setListFilter('all')}>Alle</span>
          {lists.map(l => {
            const set = membersByList.get(l.id)
            const cnt = set ? rows.reduce((n, r) => n + (set.has(r.id) ? 1 : 0), 0) : 0
            if (editingListId === l.id) {
              return (
                <span key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input autoFocus value={editListName} onChange={e => setEditListName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingListId(null) }}
                    style={{ padding: '5px 10px', borderRadius: 99, border: `1.5px solid ${primary}`, fontSize: 13, background: card, color: text, outline: 'none', width: 140 }} />
                  <button onClick={saveRename} title="Speichern" style={{ ...miniBtn, color: primary }}><Check size={14} /></button>
                  <button onClick={() => setEditingListId(null)} title="Abbrechen" style={{ ...miniBtn, color: muted }}><X size={14} /></button>
                </span>
              )
            }
            const active = listFilter === l.id
            return (
              <span key={l.id} style={{ ...chip(active), cursor: 'default', paddingRight: 8 }}>
                <span onClick={() => setListFilter(l.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <ListChecks size={13} /> {l.name} <b>{cnt}</b>
                </span>
                <button onClick={() => startRename(l)} title="Umbenennen" style={{ ...miniBtn, color: active ? primary : muted, marginLeft: 2 }}><Pencil size={12} /></button>
                <button onClick={() => openDeleteList(l)} title="Löschen" style={{ ...miniBtn, color: active ? primary : muted }}><Trash2 size={12} /></button>
              </span>
            )
          })}
          {!showNewList ? (
            <span style={{ ...chip(false), color: primary, borderStyle: 'dashed' }} onClick={() => setShowNewList(true)}>
              <Plus size={13} /> Neue Liste
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                autoFocus value={newListName} onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createStandaloneList(); if (e.key === 'Escape') { setShowNewList(false); setNewListName('') } }}
                placeholder="Listenname" disabled={creatingList}
                style={{ padding: '5px 10px', borderRadius: 99, border: `1.5px solid ${primary}`, fontSize: 13, background: card, color: text, outline: 'none', width: 150 }} />
              <button className="lk-btn lk-btn-primary" onClick={createStandaloneList} disabled={creatingList || !newListName.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: newListName.trim() ? 1 : 0.6 }}>
                {creatingList ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Anlegen
              </button>
              <button onClick={() => { setShowNewList(false); setNewListName('') }} title="Abbrechen"
                style={{ background: 'none', border: `1px solid ${border}`, borderRadius: 99, padding: 5, color: muted, cursor: 'pointer', display: 'inline-flex' }}>
                <X size={13} />
              </button>
            </span>
          )}
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
            <button className="lk-btn lk-btn-primary" onClick={promoteSelected} disabled={busy || selected.size === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {busy ? <Loader2 size={15} className="spin" /> : <UserPlus size={15} />} In CRM übernehmen{selected.size ? ` (${selected.size})` : ''}
            </button>
            <button onClick={openBulkDelete} disabled={busy || selected.size === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: card, color: selected.size ? '#DC2626' : muted, border: `1.5px solid ${selected.size ? '#FECACA' : border}`, borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: selected.size ? 'pointer' : 'default' }}>
              <Trash2 size={15} /> Löschen{selected.size ? ` (${selected.size})` : ''}
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
            const isFromCrm = row.source === 'crm_lead'   // stammt aus CRM-Lead → schon CRM
            return (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: card, border: `1px solid ${sel ? primary : border}`, borderRadius: 12, padding: '12px 16px' }}>
                <input type="checkbox" checked={sel} onChange={() => toggle(row.id)} style={{ flexShrink: 0 }} />
                <Avatar name={fullName(row)} avatar_url={row.avatar_url} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: text, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(row)}</span>
                    {inCrm && <span style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FCD34D', borderRadius: 99, padding: '1px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>bereits im CRM</span>}
                  </div>
                  <div style={{ color: muted, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.headline || row.job_title || '—'}{row.company ? <> · <Building2 size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {row.company}</> : null}
                  </div>
                </div>
                {isFromCrm ? (
                  <span title="Stammt aus einem CRM-Kontakt" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: muted, fontSize: 12, fontWeight: 600, flexShrink: 0, padding: '8px 6px' }}>
                    <Check size={14} /> aus CRM
                  </span>
                ) : (
                  <button className="lk-btn lk-btn-primary" onClick={() => promoteOne(row)} disabled={busy} title={inCrm ? 'Mit bestehendem CRM-Kontakt zusammenführen' : 'Als CRM-Kontakt übernehmen'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <Check size={14} /> {inCrm ? 'Zusammenführen' : 'In CRM übernehmen'}
                  </button>
                )}
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

      {listOpen && (
        <ListModal
          lists={lists}
          count={selected.size}
          busy={busy}
          onClose={() => setListOpen(false)}
          onConfirm={assignToList}
        />
      )}

      {deleteBulkModal && (
        <div onClick={() => !busy && setDeleteBulkModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 480, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Trash2 size={18} style={{ color: '#DC2626' }} />
              <div style={{ fontWeight: 800, fontSize: 17, color: text }}>{deleteBulkModal.count} Kontakt(e) löschen?</div>
            </div>
            <p style={{ fontSize: 13.5, color: text, margin: '0 0 12px', lineHeight: 1.5 }}>
              Die Kontakte werden <b>endgültig aus „LinkedIn Kontakte" gelöscht</b> — inklusive ihrer Listen-Zuordnungen. Das kann <b>nicht rückgängig</b> gemacht werden.
            </p>
            {deleteBulkModal.count >= 100 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Das sind <b>{deleteBulkModal.count} Kontakte</b> auf einmal — bitte sicherstellen, dass die Auswahl stimmt.</span>
              </div>
            )}
            {deleteBulkModal.checking ? (
              <div style={{ fontSize: 12.5, color: muted, marginBottom: 12 }}>Prüfe Verwendung in Kampagnen…</div>
            ) : deleteBulkModal.refs.count > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span><b>{deleteBulkModal.refs.count} Kontakt(e) sind in aktiven Kampagnen</b>{deleteBulkModal.refs.campaigns.length ? ` (${deleteBulkModal.refs.campaigns.map(n => `„${n}"`).join(', ')})` : ''}. Bereits gestartete Kampagnen laufen weiter (sie haben die Kontakte schon übernommen) — hier verschwinden sie nur aus „LinkedIn Kontakte" und den Listen.</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={() => setDeleteBulkModal(null)} disabled={busy} style={{ border: `1px solid ${border}`, background: 'var(--surface)', color: muted, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Abbrechen</button>
              <button onClick={confirmBulkDelete} disabled={busy || deleteBulkModal.checking} style={{ border: 'none', background: '#DC2626', color: '#fff', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: (busy || deleteBulkModal.checking) ? 'not-allowed' : 'pointer', opacity: (busy || deleteBulkModal.checking) ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busy ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />} Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteListModal && (
        <div onClick={() => setDeleteListModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Trash2 size={18} style={{ color: '#DC2626' }} />
              <div style={{ fontWeight: 800, fontSize: 17, color: text }}>Liste löschen?</div>
            </div>
            <p style={{ fontSize: 13.5, color: text, margin: '0 0 12px', lineHeight: 1.5 }}>
              „<b>{deleteListModal.list.name}</b>" wird gelöscht. Die zugeordneten <b>Kontakte bleiben</b> in deinen LinkedIn Kontakten — nur die Listen-Zuordnung geht weg.
            </p>
            {deleteListModal.checking ? (
              <div style={{ fontSize: 12.5, color: muted, marginBottom: 14 }}>Prüfe Verwendung…</div>
            ) : deleteListModal.refs.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Wird von {deleteListModal.refs.length === 1 ? 'Kampagne' : 'Kampagnen'} <b>{deleteListModal.refs.map(n => `„${n}"`).join(', ')}</b> als Zielgruppe genutzt. Nach dem Löschen läuft diese Zielgruppe leer.</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={() => setDeleteListModal(null)} style={{ border: `1px solid ${border}`, background: 'var(--surface)', color: muted, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Abbrechen</button>
              <button onClick={confirmDeleteList} disabled={deleteListModal.checking} style={{ border: 'none', background: '#DC2626', color: '#fff', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: deleteListModal.checking ? 'not-allowed' : 'pointer', opacity: deleteListModal.checking ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={14} /> Liste löschen
              </button>
            </div>
          </div>
        </div>
      )}
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
          <button className="lk-btn lk-btn-primary" onClick={() => setMode('existing')} disabled={!lists.length}
            style={{ flex: 1 }}>Bestehende</button>
          <button className="lk-btn lk-btn-primary" onClick={() => setMode('new')}
            style={{ flex: 1 }}>Neue Liste</button>
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
          <button className="lk-btn lk-btn-primary"
            onClick={() => onConfirm(mode === 'existing' ? { listId } : { newName, color })}
            disabled={busy || (mode === 'existing' ? !listId : !newName.trim())}
            style={{ flex: 1.4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Hinzufügen
          </button>
        </div>
      </div>
    </div>
  )
}
