// src/pages/LinkedInSuche.jsx
//
// Feature 1 — LinkedIn-Suche / Prospecting (Frontend).
// Gespeicherte Suchen (linkedin_searches) anlegen und ausführen. Das Ausführen
// ruft ausschließlich die Edge Function `unipile-search` via
// supabase.functions.invoke auf (keine hardcoded URL). Treffer importiert der
// Worker als leads (source='linkedin_search'); diese Page schreibt selbst keine
// Leads, nur die Such-Definitionen.
//
// Backend-Anschluss: unipile_accounts (status='OK') über getUnipileConnection,
// Addon-Gate 'automation'. Fehlercodes der EF: 403 no_addon, 409 kein OK-Account,
// 429 Rate-Limit.

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Play, Trash2, Save, Users, Building2,
  ExternalLink, AlertCircle, CheckCircle2, Loader2, UserPlus, Check, MapPin,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

// Avatar mit Initialen-Fallback (Muster wie LinkedInInbox.jsx).
const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 2)
function Avatar({ name, avatar_url, size = 40 }) {
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#0891b2']
  const bg = colors[(name || '').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} loading="lazy" decoding="async" style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
  return <div style={{ width:size, height:size, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:size*0.36, flexShrink:0 }}>{initials(name)}</div>
}

// ─── Tokens (Alignment mit Automatisierung.jsx / Leads.jsx) ────────────────
const PRIMARY = 'rgb(49,90,231)'
const PRIMARY_VAR = `var(--wl-primary, ${PRIMARY})`

const pageOuterStyle  = { background:'var(--surface-canvas, #F8FAFC)', minHeight:'100vh', padding:'24px 24px 60px' }
const pageStyle       = { width:'100%', maxWidth:1100, margin:'0 auto', display:'flex', flexDirection:'column' }
const headerRowStyle  = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, gap:12, flexWrap:'wrap' }
const titleStyle      = { fontSize:22, fontWeight:800, margin:0, color:'var(--text-strong, #111827)', display:'flex', alignItems:'center', gap:10 }
const subtitleStyle   = { fontSize:13, color:'var(--text-muted, #6B7280)', marginTop:4 }
const cardStyle       = { background:'var(--surface)', borderRadius:12, border:'1px solid var(--border, #E4E7EC)', padding:'18px 20px' }
const inputStyle      = { padding:'8px 12px', borderRadius:8, border:'1.5px solid #E4E7EC', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'inherit', background:'var(--surface)' }
const labelStyle      = { display:'block', fontSize:10, fontWeight:700, color:'var(--text-muted, #6B7280)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }
const primaryBtnStyle = { padding:'9px 18px', background:PRIMARY_VAR, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
const ghostBtnStyle   = { padding:'7px 12px', background:'var(--surface)', color:'#374151', border:'1.5px solid #E4E7EC', borderRadius:10, fontSize:12, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
const sectionTitle    = { fontSize:12, fontWeight:700, color:'var(--text-strong, #111827)', marginBottom:10, display:'flex', alignItems:'center', gap:6 }
const gridStyle       = { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12 }

// api/category — Werte exakt aus den CHECK-Constraints der Migration.
// Recruiter ist im CHECK erlaubt, wird aber bewusst NICHT angezeigt (evtl. nicht
// in der Unipile-Subscription lizenziert).
const API_OPTIONS = [
  { value:'classic',         label:'LinkedIn Classic' },
  { value:'sales_navigator', label:'Sales Navigator' },
]
const CATEGORY_OPTIONS = [
  { value:'people',  label:'Personen' },
  { value:'company', label:'Unternehmen' },
]

const EMPTY_FORM = {
  name:'', api:'classic', category:'people',
  keywords:'', location:'', company:'', industry:'',
  search_url:'', auto_import_leads:true, target_list_id:'',
}

export default function LinkedInSuche() {
  const { activeTeamId } = useTeam()
  const navigate = useNavigate()

  const [uid, setUid]             = useState(null)
  const [searches, setSearches]   = useState([])
  const [leadLists, setLeadLists] = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [runningId, setRunningId] = useState(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [flash, setFlash]         = useState(null)      // { type:'error'|'success', text, action?:{label,to} }
  const [lastResult, setLastResult] = useState(null)    // { found, imported, cursor }
  const [results, setResults]     = useState(null)      // { searchId, searchName, items:[], truncated:bool }
  const [importState, setImportState] = useState({})    // linkedin_url -> { state:'idle'|'importing'|'done'|'exists', leadId? }
  const [bulkRunning, setBulkRunning] = useState(false)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  const fetchSearches = useCallback(async () => {
    setLoading(true)
    // RLS: linkedin_searches ist user_id = auth.uid()-gescoped → nur eigene Suchen.
    const { data, error } = await supabase
      .from('linkedin_searches')
      .select('*')
      .order('created_at', { ascending:false })
    if (error) { setFlash({ type:'error', text:'Suchen laden fehlgeschlagen: ' + error.message }); setSearches([]); setLoading(false); return }
    setSearches(data || [])
    setLoading(false)
  }, [])

  const fetchLeadLists = useCallback(async () => {
    // Team-Listen (oder Solo-Listen ohne Team) für das optionale Ziel-Dropdown.
    let q = supabase.from('lead_lists').select('id,name,color').order('created_at', { ascending:false })
    if (activeTeamId) q = q.eq('team_id', activeTeamId)
    else if (uid)     q = q.eq('user_id', uid).is('team_id', null)
    else { setLeadLists([]); return }
    const { data, error } = await q
    if (error) { console.warn('[linkedin-suche] lead_lists:', error.message); setLeadLists([]); return }
    setLeadLists(data || [])
  }, [activeTeamId, uid])

  useEffect(() => { fetchSearches() }, [fetchSearches])
  useEffect(() => { fetchLeadLists() }, [fetchLeadLists])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const saveSearch = async () => {
    if (!form.name.trim()) { setFlash({ type:'error', text:'Bitte einen Namen für die Suche vergeben.' }); return }
    if (!form.keywords.trim() && !form.search_url.trim()) {
      setFlash({ type:'error', text:'Bitte Keywords oder eine gespeicherte Such-URL angeben.' }); return
    }
    setSaving(true)
    // params bündelt die Freitext-Filter; leere Felder weglassen.
    const params = {}
    if (form.keywords.trim()) params.keywords = form.keywords.trim()
    if (form.location.trim()) params.location = form.location.trim()
    if (form.company.trim())  params.company  = form.company.trim()
    if (form.industry.trim()) params.industry = form.industry.trim()

    const { error } = await supabase.from('linkedin_searches').insert({
      user_id: uid,
      team_id: activeTeamId,                 // Multi-Tenant: team_id bei jedem Insert (CLAUDE.md)
      name: form.name.trim(),
      api: form.api,
      category: form.category,
      params,
      search_url: form.search_url.trim() || null,
      auto_import_leads: form.auto_import_leads,
      target_list_id: form.target_list_id || null,
    })
    if (error) { setFlash({ type:'error', text:'Speichern fehlgeschlagen: ' + error.message }); setSaving(false); return }  // Fallstrick #12
    setFlash({ type:'success', text:'Suche gespeichert.' })
    setForm(EMPTY_FORM)
    setSaving(false)
    fetchSearches()
  }

  const runSearch = async (search) => {
    setRunningId(search.id)
    setLastResult(null)
    setResults(null)
    setImportState({})
    setFlash(null)
    const { data, error } = await supabase.functions.invoke('unipile-search', { body: { search_id: search.id } })
    if (error) {
      // functions.invoke legt den non-2xx-Body in error.context (Response) ab (Muster wie LinkedInInbox.jsx).
      let body = null
      try { body = await error.context?.json?.() } catch { /* Body evtl. schon konsumiert / kein JSON */ }
      const status = error.context?.status
      if (status === 403 || body?.error === 'no_addon') {
        setFlash({ type:'error', text:'Das Automatisierung-Addon ist nicht aktiv.', action:{ label:'Addon aktivieren', to:'/marketplace' } })
      } else if (status === 409) {
        setFlash({ type:'error', text:'Kein aktiver LinkedIn-Account verbunden.', action:{ label:'LinkedIn verbinden', to:'/settings/linkedin' } })
      } else if (status === 429 || body?.rate_limited) {
        setFlash({ type:'error', text:'LinkedIn-Rate-Limit erreicht — bitte später erneut versuchen.' })
      } else {
        setFlash({ type:'error', text: body?.error || ('Suche fehlgeschlagen: ' + error.message) })
      }
      setRunningId(null)
      return
    }
    setLastResult(data)   // { ok, found, imported, cursor }
    const items = Array.isArray(data?.items) ? data.items : []
    setResults({ searchId: search.id, searchName: search.name, items, truncated: !!data?.preview_truncated })
    setFlash({ type:'success', text:`${data?.found ?? 0} Treffer gefunden, ${data?.imported ?? 0} als Leads importiert.` })
    setRunningId(null)
    fetchSearches()       // aktualisierte results_imported / status / last_run_at

    // Batch-Dedupe: bereits im CRM vorhandene Treffer in einer Query markieren
    // (statt N Einzelqueries). Dedupe-Schlüssel = leads(user_id, linkedin_url).
    const urls = [...new Set(items.map(it => it.linkedin_url).filter(Boolean))]
    if (uid && urls.length) {
      const { data: existing, error: dErr } = await supabase
        .from('leads').select('id,linkedin_url').eq('user_id', uid).in('linkedin_url', urls)
      if (dErr) { console.warn('[linkedin-suche] dedupe-batch:', dErr.message); return }
      if (existing?.length) {
        setImportState(prev => {
          const next = { ...prev }
          for (const row of existing) next[row.linkedin_url] = { state:'exists', leadId: row.id }
          return next
        })
      }
    }
  }

  // Einen Treffer selektiv als Lead übernehmen (mit Einzel-Dedupe-Guard vor Insert).
  // Gibt true zurück, wenn der Treffer danach im CRM ist (neu oder bereits vorhanden).
  const importLead = async (item) => {
    const url = item.linkedin_url
    const cur = url ? importState[url]?.state : null
    if (cur === 'done' || cur === 'exists' || cur === 'importing') return true
    if (url) setImportState(prev => ({ ...prev, [url]: { state:'importing' } }))

    // Dedupe-Guard direkt vor dem Insert (Race-Schutz zusätzlich zum Batch-Check).
    if (uid && url) {
      const { data: existing, error: dErr } = await supabase
        .from('leads').select('id').eq('user_id', uid).eq('linkedin_url', url).maybeSingle()
      if (dErr) { console.warn('[linkedin-suche] dedupe:', dErr.message) }
      if (existing?.id) { setImportState(prev => ({ ...prev, [url]: { state:'exists', leadId: existing.id } })); return true }
    }

    const leadRow = {
      user_id: uid,
      team_id: activeTeamId,               // Multi-Tenant: team_id bei jedem Insert (CLAUDE.md)
      name: item.name || 'Unbekannt',
      first_name: item.first_name ?? null,
      last_name: item.last_name ?? null,
      headline: item.headline ?? null,
      company: item.company ?? null,
      job_title: item.job_title ?? null,
      location: item.location ?? null,
      linkedin_url: url ?? null,
      profile_url: url ?? null,
      avatar_url: item.avatar_url ?? null,
      status: 'Lead',                      // Fallstrick #2: gültiger Lead-Status (Einzel-Insert, kein .in()-Bulk)
      source: 'linkedin_search',
      lead_source: 'linkedin',
    }
    const { data: inserted, error } = await supabase.from('leads').insert(leadRow).select('id').maybeSingle()
    if (error) {   // Fallstrick #12
      console.warn('[linkedin-suche] lead insert:', error.message)
      if (url) setImportState(prev => ({ ...prev, [url]: { state:'idle' } }))
      setFlash({ type:'error', text:'Übernehmen fehlgeschlagen: ' + error.message })
      return false
    }
    if (url) setImportState(prev => ({ ...prev, [url]: { state:'done', leadId: inserted?.id } }))
    return true
  }

  const importAll = async () => {
    if (!results?.items?.length) return
    setBulkRunning(true)
    let ok = 0
    for (const item of results.items) {
      const url = item.linkedin_url
      const st = url ? importState[url]?.state : null
      if (st === 'done' || st === 'exists') { ok++; continue }
      const res = await importLead(item)
      if (res) ok++
    }
    setBulkRunning(false)
    setFlash({ type:'success', text:`${ok}/${results.items.length} Treffer im CRM.` })
  }

  const deleteSearch = async (id) => {
    const { error } = await supabase.from('linkedin_searches').delete().eq('id', id)
    if (error) { setFlash({ type:'error', text:'Löschen fehlgeschlagen: ' + error.message }); return }
    setSearches(s => s.filter(x => x.id !== id))
  }

  const apiLabel = v => (API_OPTIONS.find(o => o.value === v)?.label || v)
  const catLabel = v => (CATEGORY_OPTIONS.find(o => o.value === v)?.label || v)

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}><Search size={22} color={PRIMARY_VAR} /> LinkedIn-Suche</h1>
            <div style={subtitleStyle}>Gespeicherte Suchen anlegen und ausführen — Treffer landen automatisch als Leads im CRM.</div>
          </div>
        </div>

        {/* Flash */}
        {flash && (
          <div style={{
            display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'10px 14px', borderRadius:10, fontSize:13, fontWeight:600,
            background: flash.type === 'error' ? '#FEF2F2' : '#F0FDF4',
            color:      flash.type === 'error' ? '#B91C1C' : '#15803D',
            border: `1px solid ${flash.type === 'error' ? '#FECACA' : '#BBF7D0'}`,
          }}>
            {flash.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span style={{ flex:1 }}>{flash.text}</span>
            {flash.action && (
              <button onClick={() => navigate(flash.action.to)} style={{ ...ghostBtnStyle, padding:'5px 10px' }}>
                {flash.action.label} <ExternalLink size={13} />
              </button>
            )}
          </div>
        )}

        {/* Formular: neue Suche */}
        <div style={{ ...cardStyle, marginBottom:20 }}>
          <div style={sectionTitle}><Plus size={14} /> Neue Suche</div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Name der Suche</label>
                <input style={inputStyle} value={form.name} onChange={e => setField('name', e.target.value)} placeholder="z. B. CTOs in München" />
              </div>
              <div>
                <label style={labelStyle}>Quelle</label>
                <select style={inputStyle} value={form.api} onChange={e => setField('api', e.target.value)}>
                  {API_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Kategorie</label>
                <select style={inputStyle} value={form.category} onChange={e => setField('category', e.target.value)}>
                  {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {form.category === 'company' && (
              <div style={{ fontSize:12, color:'#B45309', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'8px 12px' }}>
                Hinweis: Bei der Kategorie „Unternehmen" werden Treffer nur gezählt, aber <strong>nicht als Leads importiert</strong> — der automatische Lead-Import gilt nur für Personen-Treffer.
              </div>
            )}

            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Keywords</label>
                <input style={inputStyle} value={form.keywords} onChange={e => setField('keywords', e.target.value)} placeholder="z. B. Softwareentwickler" />
              </div>
              <div>
                <label style={labelStyle}>Ort (optional)</label>
                <input style={inputStyle} value={form.location} onChange={e => setField('location', e.target.value)} placeholder="z. B. Berlin" />
              </div>
              <div>
                <label style={labelStyle}>Firma (optional)</label>
                <input style={inputStyle} value={form.company} onChange={e => setField('company', e.target.value)} placeholder="z. B. SAP" />
              </div>
              <div>
                <label style={labelStyle}>Branche (optional)</label>
                <input style={inputStyle} value={form.industry} onChange={e => setField('industry', e.target.value)} placeholder="z. B. IT & Services" />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Alternativ: gespeicherte LinkedIn-/Sales-Navigator-URL (optional)</label>
              <input style={inputStyle} value={form.search_url} onChange={e => setField('search_url', e.target.value)} placeholder="https://www.linkedin.com/search/results/…" />
              <div style={{ fontSize:11, color:'var(--text-muted, #6B7280)', marginTop:4 }}>Wenn gesetzt, hat die URL Vorrang vor den Keyword-Filtern.</div>
            </div>

            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Ziel-Liste (optional)</label>
                <select style={inputStyle} value={form.target_list_id} onChange={e => setField('target_list_id', e.target.value)}>
                  <option value="">— keine —</option>
                  {leadLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', alignItems:'flex-end' }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#374151', cursor:'pointer', paddingBottom:8 }}>
                  <input type="checkbox" checked={form.auto_import_leads} onChange={e => setField('auto_import_leads', e.target.checked)} />
                  Treffer automatisch als Leads importieren
                </label>
              </div>
            </div>

            <div>
              <button style={{ ...primaryBtnStyle, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={saveSearch}>
                {saving ? <Loader2 size={15} className="lk-spin" /> : <Save size={15} />} Suche speichern
              </button>
            </div>
          </div>
        </div>

        {/* Letztes Ergebnis */}
        {lastResult && (
          <div style={{ ...cardStyle, marginBottom:20, borderColor:'#BBF7D0', background:'#F0FDF4' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#15803D' }}>
              Letzter Lauf: {lastResult.found ?? 0} Treffer · {lastResult.imported ?? 0} importiert
            </div>
          </div>
        )}

        {/* Gespeicherte Suchen */}
        <div style={sectionTitle}><Search size={14} /> Gespeicherte Suchen</div>
        {loading ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)' }}>
            <Loader2 size={18} className="lk-spin" /> Lädt…
          </div>
        ) : searches.length === 0 ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13 }}>
            Noch keine gespeicherten Suchen. Lege oben deine erste Suche an.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {searches.map(s => (
              <div key={s.id} style={{ ...cardStyle, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <div style={{ width:38, height:38, borderRadius:10, background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {s.category === 'company' ? <Building2 size={18} color={PRIMARY_VAR} /> : <Users size={18} color={PRIMARY_VAR} />}
                </div>
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--text-strong, #111827)' }}>{s.name}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted, #6B7280)', marginTop:2 }}>
                    {apiLabel(s.api)} · {catLabel(s.category)}
                    {typeof s.results_imported === 'number' ? ` · ${s.results_imported} importiert` : ''}
                    {s.last_run_at ? ` · zuletzt ${new Date(s.last_run_at).toLocaleString('de-DE')}` : ''}
                  </div>
                  {s.last_error && <div style={{ fontSize:12, color:'#B91C1C', marginTop:2 }}>{s.last_error}</div>}
                </div>
                <span style={{
                  fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
                  background: s.status === 'running' ? '#FEF3C7' : s.status === 'error' ? '#FEE2E2' : s.status === 'done' ? '#DCFCE7' : '#F3F4F6',
                  color:      s.status === 'running' ? '#92400E' : s.status === 'error' ? '#B91C1C' : s.status === 'done' ? '#15803D' : '#6B7280',
                }}>{s.status || 'idle'}</span>
                <button
                  style={{ ...primaryBtnStyle, opacity: runningId === s.id ? 0.6 : 1 }}
                  disabled={runningId === s.id}
                  onClick={() => runSearch(s)}
                >
                  {runningId === s.id ? <Loader2 size={15} className="lk-spin" /> : <Play size={15} />} Ausführen
                </button>
                <button style={{ ...ghostBtnStyle, color:'#B91C1C', borderColor:'#FECACA' }} onClick={() => deleteSearch(s.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Ergebnis-Panel (Phase 1.5) — Treffer anzeigen + selektiv übernehmen */}
        {results && (
          <div style={{ marginTop:24 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:10, flexWrap:'wrap' }}>
              <div style={sectionTitle}><Users size={14} /> Ergebnisse für „{results.searchName}"</div>
              {results.items.length > 0 && (
                <button style={{ ...primaryBtnStyle, opacity: bulkRunning ? 0.6 : 1 }} disabled={bulkRunning} onClick={importAll}>
                  {bulkRunning ? <Loader2 size={15} className="lk-spin" /> : <UserPlus size={15} />} Alle übernehmen
                </button>
              )}
            </div>

            {results.truncated && (
              <div style={{ fontSize:12, color:'#B45309', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'8px 12px', marginBottom:10 }}>
                Nur die ersten 100 Treffer werden angezeigt.
              </div>
            )}

            {results.items.length === 0 ? (
              <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13 }}>
                Keine Treffer zum Anzeigen.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {results.items.map((it, idx) => {
                  const st = it.linkedin_url ? importState[it.linkedin_url] : null
                  const state = st?.state || 'idle'
                  return (
                    <div key={(it.linkedin_url || 'x') + idx} style={{ ...cardStyle, padding:'12px 16px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                      <Avatar name={it.name} avatar_url={it.avatar_url} />
                      <div style={{ flex:1, minWidth:200 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--text-strong, #111827)' }}>{it.name || 'Unbekannt'}</div>
                        {(it.headline || it.job_title) && (
                          <div style={{ fontSize:12, color:'var(--text-muted, #6B7280)', marginTop:2 }}>
                            {it.headline || it.job_title}{it.company ? ` · ${it.company}` : ''}
                          </div>
                        )}
                        {it.location && (
                          <div style={{ fontSize:12, color:'var(--text-muted, #6B7280)', marginTop:2, display:'flex', alignItems:'center', gap:4 }}>
                            <MapPin size={12} /> {it.location}
                          </div>
                        )}
                      </div>
                      {it.linkedin_url && (
                        <a href={it.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ ...ghostBtnStyle, textDecoration:'none' }}>
                          Profil öffnen <ExternalLink size={13} />
                        </a>
                      )}
                      {state === 'exists' ? (
                        st?.leadId
                          ? <button style={{ ...ghostBtnStyle, color:'#15803D', borderColor:'#BBF7D0' }} onClick={() => navigate(`/leads/${st.leadId}`)}>bereits im CRM <ExternalLink size={13} /></button>
                          : <span style={{ ...ghostBtnStyle, color:'#15803D', borderColor:'#BBF7D0', cursor:'default' }}>bereits im CRM</span>
                      ) : state === 'done' ? (
                        <span style={{ ...ghostBtnStyle, color:'#15803D', borderColor:'#BBF7D0', cursor:'default' }}><Check size={14} /> übernommen</span>
                      ) : (
                        <button style={{ ...primaryBtnStyle, opacity: state === 'importing' ? 0.6 : 1 }} disabled={state === 'importing'} onClick={() => importLead(it)}>
                          {state === 'importing' ? <Loader2 size={15} className="lk-spin" /> : <UserPlus size={15} />} Als Lead übernehmen
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
