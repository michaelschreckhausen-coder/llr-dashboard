// src/pages/LinkedInSuche.jsx
//
// Feature 1 — LinkedIn-Suche / Prospecting (Frontend).
// Gespeicherte Suchen (linkedin_searches) anlegen und ausführen. Das Ausführen
// ruft ausschließlich die Edge Function `unipile-search` via
// supabase.functions.invoke auf (keine hardcoded URL). Personen-Treffer landen
// in der Import-Inbox (linkedin_inbox) — NICHT im CRM. Prozess-Vereinheitlichung
// 2026-07: eine Listen-Quelle (inbox_lists). Optionale Ziel-Liste = Import-Inbox-Liste.
// Von dort werden Kontakte in Listen gepflegt und in der Automatisierung als
// Zielgruppe gewählt. Diese Page schreibt selbst keine Kontakte, nur Such-Definitionen.
//
// Backend-Anschluss: unipile_accounts (status='OK') über getUnipileConnection,
// Addon-Gate 'extra_linkedin_connection'. Fehlercodes der EF: 403 no_addon, 409 kein OK-Account,
// 429 Rate-Limit.

import PillSelect from '../components/PillSelect'
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Play, Trash2, Save, Users, Building2,
  ExternalLink, AlertCircle, CheckCircle2, Loader2, MapPin, Inbox as InboxIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { mapEfError } from '../lib/efError'
import { validateSearchUrl } from '../lib/linkedinSearchUrl'

// Avatar mit Initialen-Fallback (Muster wie LinkedInInbox.jsx).
const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 2)
function Avatar({ name, avatar_url, size = 40 }) {
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#0891b2']
  const bg = colors[(name || '').charCodeAt(0) % colors.length]
  if (avatar_url) return <img src={avatar_url} alt={name} loading="lazy" decoding="async" style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
  return <div style={{ width:size, height:size, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:size*0.36, flexShrink:0 }}>{initials(name)}</div>
}

// ─── Tokens (Alignment mit Automatisierung.jsx / Leads.jsx) ────────────────
const PRIMARY = '#0A6FB0'
const PRIMARY_VAR = `var(--wl-primary, ${PRIMARY})`

const pageOuterStyle  = { background:'var(--surface-canvas, #F8FAFC)', minHeight:'100vh', padding:'24px 24px 60px' }
const pageStyle       = { width:'100%', maxWidth:1100, margin:'0 auto', display:'flex', flexDirection:'column' }
const headerRowStyle  = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, gap:12, flexWrap:'wrap' }
const titleStyle      = { fontSize:22, fontWeight:800, margin:0, color:'var(--text-strong, #111827)', display:'flex', alignItems:'center', gap:10 }
const subtitleStyle   = { fontSize:13, color:'var(--text-muted, #6B7280)', marginTop:4 }
const cardStyle       = { background:'var(--surface)', borderRadius:12, border:'1px solid var(--border, #E4E7EC)', padding:'18px 20px' }
const inputStyle      = { padding:'8px 12px', borderRadius:8, border:'1.5px solid #E4E7EC', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'inherit', background:'var(--surface)' }
const labelStyle      = { display:'block', fontSize:10, fontWeight:700, color:'var(--text-muted, #6B7280)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }
const primaryBtnStyle = { padding:'9px 18px', background:'var(--primary)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
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
  person_name:'', keywords:'', location:'', company:'', industry:'',
  search_url:'', target_list_id:'',
}

export default function LinkedInSuche() {
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const navigate = useNavigate()

  const [uid, setUid]             = useState(null)
  const [searches, setSearches]   = useState([])
  const [inboxLists, setInboxLists] = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [runningId, setRunningId] = useState(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [flash, setFlash]         = useState(null)      // { type:'error'|'success', text, action?:{label,to} }
  const [lastResult, setLastResult] = useState(null)    // { found, imported, cursor }
  const [results, setResults]     = useState(null)      // { searchId, searchName, items:[], truncated:bool, category }
  const [selected, setSelected]   = useState(() => new Set())  // Vorschau-Auswahl (Indizes)
  const [importing, setImporting] = useState(false)
  const [liveQ, setLiveQ]         = useState('')
  const [liveResults, setLiveResults] = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveSel, setLiveSel]     = useState(() => new Set())
  const [liveImporting, setLiveImporting] = useState(false)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  const fetchSearches = useCallback(async () => {
    setLoading(true)
    // Brand-scoped: Suchen gehören zum Profil der aktiven Marke.
    const bvId = activeBrandVoice?.id || null
    if (!bvId) { setSearches([]); setLoading(false); return }
    const { data, error } = await supabase
      .from('linkedin_searches')
      .select('*')
      .eq('brand_voice_id', bvId)
      .order('created_at', { ascending:false })
    if (error) { setFlash({ type:'error', text:'Suchen laden fehlgeschlagen: ' + error.message }); setSearches([]); setLoading(false); return }
    setSearches(data || [])
    setLoading(false)
  }, [activeBrandVoice?.id])

  const fetchInboxLists = useCallback(async () => {
    // Import-Inbox-Listen (kanonische Quelle) für das optionale Ziel-Dropdown.
    // Team-gescopet mit Solo-Fallback (Top-Fallstrick #14), analog useInboxLists.
    let q = supabase.from('inbox_lists').select('id,name,color').order('created_at', { ascending:true })
    if (activeTeamId) q = q.eq('team_id', activeTeamId)
    else if (uid)     q = q.eq('user_id', uid).is('team_id', null)
    else { setInboxLists([]); return }
    const { data, error } = await q
    if (error) { console.warn('[linkedin-suche] inbox_lists:', error.message); setInboxLists([]); return }
    setInboxLists(data || [])
  }, [activeTeamId, uid])

  useEffect(() => { fetchSearches() }, [fetchSearches])
  useEffect(() => { fetchInboxLists() }, [fetchInboxLists])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const saveSearch = async () => {
    if (!form.name.trim()) { setFlash({ type:'error', text:'Bitte einen Namen für die Suche vergeben.' }); return }
    if (!form.person_name.trim() && !form.keywords.trim() && !form.search_url.trim()) {
      setFlash({ type:'error', text:'Bitte einen Namen, Keywords oder eine gespeicherte Such-URL angeben.' }); return
    }
    // Positive Allowlist: eine hinterlegte URL muss eine echte Such-Ergebnis-URL sein
    // (kein Profil-Link). Gleiche Logik wie im EF (autoritativ) — siehe lib/linkedinSearchUrl.
    const _urlCheck = validateSearchUrl(form.search_url)
    if (!_urlCheck.ok) { setFlash({ type:'error', text: _urlCheck.message }); return }
    setSaving(true)
    // params bündelt die Freitext-Filter; leere Felder weglassen.
    const params = {}
    // LinkedIn-Classic hat keinen eigenen Namens-Filter — Name fliesst in die Keyword-Suche (kombiniert).
    const _kw = [form.person_name.trim(), form.keywords.trim()].filter(Boolean).join(' ')
    if (_kw) params.keywords = _kw
    if (form.location.trim()) params.location = form.location.trim()
    if (form.company.trim())  params.company  = form.company.trim()
    if (form.industry.trim()) params.industry = form.industry.trim()

    const { error } = await supabase.from('linkedin_searches').insert({
      user_id: uid,
      team_id: activeTeamId,                 // Multi-Tenant: team_id bei jedem Insert (CLAUDE.md)
      brand_voice_id: activeBrandVoice?.id || null,   // Brand-scoped (Trigger füllt sonst nach)
      name: form.name.trim(),
      api: form.api,
      category: form.category,
      params,
      search_url: form.search_url.trim() || null,
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
    setFlash(null)
    const { data, error } = await supabase.functions.invoke('unipile-search', { body: { search_id: search.id, brand_voice_id: activeBrandVoice?.id || null, mode: 'search' } })
    if (error) {
      // P3 Schritt 4: zentraler EF-Status→Mensch-Mapper (403→Upgrade, 401→Sitzung, 409→keine
      // Verbindung, 429→Rate-Limit, sonst lesbar) — eine Stelle statt pro-Seite-Blöcke.
      const m = await mapEfError(error)
      setFlash({ type:'error', text: m.text, action: m.action })
      setRunningId(null)
      return
    }
    setLastResult(data)   // { ok, found, imported, cursor }
    const items = Array.isArray(data?.items) ? data.items : []
    setResults({ searchId: search.id, searchName: search.name, items, truncated: !!data?.preview_truncated, category: search.category, targetListId: search.target_list_id || null, imported: false })
    const isPeople = search.category === 'people'
    // Personen-Treffer standardmäßig alle vorausgewählt (schneller Bulk-Add).
    setSelected(new Set(isPeople ? items.map((_, i) => i) : []))
    setFlash({
      type:'success',
      text: isPeople
        ? `${data?.found ?? 0} Treffer gefunden — unten auswählen und zu den Kontakten hinzufügen.`
        : `${data?.found ?? 0} Unternehmens-Treffer gefunden (nur Personen können übernommen werden).`,
    })
    setRunningId(null)
    fetchSearches()       // aktualisierte results_imported / status / last_run_at
  }

  const toggleSel = (i) => setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })

  const addSelectedToContacts = async () => {
    if (!results) return
    const chosen = results.items.filter((_, i) => selected.has(i))
    if (!chosen.length) { setFlash({ type:'error', text:'Bitte mindestens einen Treffer auswählen.' }); return }
    setImporting(true); setFlash(null)
    const { data, error } = await supabase.functions.invoke('unipile-search', {
      body: { mode: 'import', search_id: results.searchId, items: chosen, brand_voice_id: activeBrandVoice?.id || null },
    })
    if (error) { const m = await mapEfError(error); setFlash({ type:'error', text:m.text, action:m.action }); setImporting(false); return }
    setImporting(false)
    setResults(r => r ? { ...r, imported: true } : r)
    const already = Math.max(0, (data?.requested ?? chosen.length) - (data?.imported ?? 0))
    setFlash({
      type:'success',
      text: `${data?.imported ?? 0} neu zu den Kontakten hinzugefügt${already > 0 ? ` (${already} bereits vorhanden)` : ''}.`,
      action: { label:'Zu den Kontakten', to:'/linkedin-inbox' },
    })
    fetchSearches()
  }

  const deleteSearch = async (id) => {
    const { error } = await supabase.from('linkedin_searches').delete().eq('id', id)
    if (error) { setFlash({ type:'error', text:'Löschen fehlgeschlagen: ' + error.message }); return }
    setSearches(s => s.filter(x => x.id !== id))
  }

  // Live-Schnellsuche: direkt auf LinkedIn suchen (unipile-people-search) und Treffer sofort zu Prospects hinzufuegen.
  useEffect(() => {
    const q = liveQ.trim()
    if (q.length < 2) { setLiveResults(null); setLiveLoading(false); return }
    let cancel = false; setLiveLoading(true)
    const t = setTimeout(async () => {
      const { data } = await supabase.functions.invoke('unipile-people-search', { body: { brand_voice_id: activeBrandVoice?.id || null, query: q } })
      if (cancel) return
      setLiveResults((data && data.items) || []); setLiveSel(new Set()); setLiveLoading(false)
    }, 450)
    return () => { cancel = true; clearTimeout(t) }
  }, [liveQ, activeBrandVoice?.id]) // eslint-disable-line

  const addLiveToProspects = async () => {
    if (!liveResults) return
    const chosen = liveResults.filter((_, i) => liveSel.has(i)).map(r => ({ name: r.name, provider_id: r.provider_id || null, linkedin_url: r.url || null, headline: r.headline || null, avatar_url: r.avatar_url || null }))
    if (!chosen.length) return
    setLiveImporting(true); setFlash(null)
    const { data, error } = await supabase.functions.invoke('unipile-search', { body: { mode: 'import', items: chosen, brand_voice_id: activeBrandVoice?.id || null } })
    setLiveImporting(false)
    if (error || data?.error) { setFlash({ type:'error', text:'Hinzufuegen fehlgeschlagen: ' + (data?.error || error?.message || '') }); return }
    const already = Math.max(0, (data?.requested ?? chosen.length) - (data?.imported ?? 0))
    setFlash({ type:'success', text:`${data?.imported ?? 0} zu Prospects hinzugefuegt${already>0?` (${already} bereits vorhanden)`:''}.`, action:{ label:'Zu Prospects', to:'/linkedin-inbox' } })
    setLiveSel(new Set())
  }

  const apiLabel = v => (API_OPTIONS.find(o => o.value === v)?.label || v)
  const catLabel = v => (CATEGORY_OPTIONS.find(o => o.value === v)?.label || v)

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}><Search size={22} color={PRIMARY_VAR} /> LinkedIn-Suche</h1>
            <div style={subtitleStyle}>Gespeicherte Suchen anlegen und ausführen — Personen-Treffer landen in den Kontakten (nicht im CRM).</div>
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
              <button onClick={() => navigate(flash.action.to)} className="lk-btn lk-btn-ghost" style={{ padding:'5px 10px' }}>
                {flash.action.label} <ExternalLink size={13} />
              </button>
            )}
          </div>
        )}

        {/* Live-Schnellsuche */}
        <div style={{ ...cardStyle, marginBottom:20 }}>
          <div style={sectionTitle}><Search size={14} /> Schnellsuche (Live)</div>
          <div style={{ fontSize:12, color:'var(--text-muted, #6B7280)', margin:'0 0 12px' }}>Direkt auf LinkedIn suchen und Treffer sofort zu deinen Prospects hinzufuegen.</div>
          <input style={inputStyle} value={liveQ} onChange={e => setLiveQ(e.target.value)} placeholder="Name oder Keyword (z. B. Marketing Berlin)…" />
          {liveLoading && <div style={{ marginTop:12, color:'var(--text-muted, #6B7280)', fontSize:13, display:'flex', alignItems:'center', gap:8 }}><Loader2 size={15} className="lk-spin" /> Suche laeuft…</div>}
          {liveResults && !liveLoading && (liveResults.length === 0 ? (
            <div style={{ marginTop:12, fontSize:13, color:'var(--text-muted, #6B7280)' }}>Keine Treffer.</div>
          ) : (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:8, margin:'14px 0 10px', flexWrap:'wrap' }}>
                <button className="lk-btn lk-btn-ghost" onClick={() => setLiveSel(liveSel.size === liveResults.length ? new Set() : new Set(liveResults.map((_, i) => i)))}>{liveSel.size === liveResults.length ? 'Keine' : 'Alle'} auswaehlen</button>
                <button className="lk-btn lk-btn-navy" disabled={liveImporting || liveSel.size === 0} onClick={addLiveToProspects}>{liveImporting ? <Loader2 size={15} className="lk-spin" /> : <InboxIcon size={14} />} {liveSel.size} zu Prospects hinzufuegen</button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:308, overflowY:'auto', paddingRight:4 }}>
                {liveResults.map((it, idx) => (
                  <div key={(it.provider_id || it.url || 'x') + idx} style={{ ...cardStyle, padding:'12px 16px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                    <Avatar name={it.name} avatar_url={it.avatar_url} />
                    <div style={{ flex:1, minWidth:200 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--text-strong, #111827)' }}>{it.name || 'Unbekannt'}</div>
                      {it.headline && <div style={{ fontSize:12, color:'var(--text-muted, #6B7280)', marginTop:2 }}>{it.headline}</div>}
                    </div>
                    {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" className="lk-btn lk-btn-ghost" style={{ textDecoration:'none' }}>Profil oeffnen <ExternalLink size={13} /></a>}
                    <label style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-muted, #6B7280)', cursor:'pointer', userSelect:'none' }}>
                      <input type="checkbox" checked={liveSel.has(idx)} onChange={() => setLiveSel(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })} /> auswaehlen
                    </label>
                  </div>
                ))}
              </div>
            </>
          ))}
        </div>

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
                <PillSelect value={form.api} onChange={v => setField('api', v)} neutral options={[...API_OPTIONS.map((o) => ({ value: o.value, label: o.label }))]} buttonStyle={{ minWidth: 140 }} />
              </div>
              <div>
                <label style={labelStyle}>Kategorie</label>
                <PillSelect value={form.category} onChange={v => setField('category', v)} neutral options={[...CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))]} buttonStyle={{ minWidth: 140 }} />
              </div>
            </div>

            {form.category === 'company' && (
              <div style={{ fontSize:12, color:'#B45309', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'8px 12px' }}>
                Hinweis: Bei der Kategorie „Unternehmen" werden Treffer nur gezählt, aber <strong>nicht importiert</strong> — nur Personen-Treffer landen in den Kontakten.
              </div>
            )}

            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Keywords</label>
                <input style={inputStyle} value={form.keywords} onChange={e => setField('keywords', e.target.value)} placeholder="z. B. Softwareentwickler" />
              </div>
              {form.category === 'people' && (
                <div>
                  <label style={labelStyle}>Name (optional)</label>
                  <input style={inputStyle} value={form.person_name} onChange={e => setField('person_name', e.target.value)} placeholder="z. B. Max Mustermann" />
                </div>
              )}
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

            <div>
              <label style={labelStyle}>Ziel-Liste in den Kontakten (optional)</label>
              <PillSelect value={form.target_list_id} onChange={v => setField('target_list_id', v)} neutral options={[{ value: '', label: `— keine (nur in die Inbox) —` }, ...inboxLists.map((l) => ({ value: l.id, label: l.name }))]} buttonStyle={{ minWidth: 140 }} />
              <div style={{ fontSize:11, color:'var(--text-muted, #6B7280)', marginTop:4 }}>
                Personen-Treffer werden dieser Liste zugeordnet — dieselbe Liste wählst du später in der Automatisierung als Zielgruppe.
              </div>
            </div>

            <div>
              <button className="lk-btn lk-btn-navy" style={{ opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={saveSearch}>
                {saving ? <Loader2 size={15} className="lk-spin" /> : <Save size={15} />} Suche speichern
              </button>
            </div>
          </div>
        </div>

        {/* Letztes Ergebnis */}
        {lastResult && (
          <div style={{ ...cardStyle, marginBottom:20, borderColor:'#BBF7D0', background:'#F0FDF4' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#15803D' }}>
              Letzter Lauf: {lastResult.found ?? 0} Treffer · {lastResult.imported ?? 0} neu in den Kontakten
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
                  className="lk-btn lk-btn-navy" style={{ opacity: runningId === s.id ? 0.6 : 1 }}
                  disabled={runningId === s.id}
                  onClick={() => runSearch(s)}
                >
                  {runningId === s.id ? <Loader2 size={15} className="lk-spin" /> : <Play size={15} />} Ausführen
                </button>
                <button className="lk-btn lk-btn-ghost" style={{ color:'#B91C1C', borderColor:'#FECACA' }} onClick={() => deleteSearch(s.id)}>
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
              {results.category === 'people' && (
                results.imported ? (
                  <button className="lk-btn lk-btn-ghost" onClick={() => navigate('/linkedin-inbox')}>
                    <InboxIcon size={14} /> Zu den Kontakten
                  </button>
                ) : results.items.length > 0 ? (
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <button className="lk-btn lk-btn-ghost" onClick={() => setSelected(selected.size === results.items.length ? new Set() : new Set(results.items.map((_, i) => i)))}>
                      {selected.size === results.items.length ? 'Keine' : 'Alle'} auswählen
                    </button>
                    <button className="lk-btn lk-btn-navy" disabled={importing || selected.size === 0} onClick={addSelectedToContacts}>
                      {importing ? <Loader2 size={15} className="lk-spin" /> : <InboxIcon size={14} />} {selected.size} zu Kontakten hinzufügen
                    </button>
                  </div>
                ) : null
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
                        <a href={it.linkedin_url} target="_blank" rel="noopener noreferrer" className="lk-btn lk-btn-ghost" style={{ textDecoration:'none' }}>
                          Profil öffnen <ExternalLink size={13} />
                        </a>
                      )}
                      {results.category === 'people' && (
                        results.imported ? (
                          <span className="lk-btn lk-btn-ghost" style={{ color:'#15803D', borderColor:'#BBF7D0', cursor:'default' }}>
                            <InboxIcon size={14} /> hinzugefügt
                          </span>
                        ) : (
                          <label style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-muted, #6B7280)', cursor:'pointer', userSelect:'none' }}>
                            <input type="checkbox" checked={selected.has(idx)} onChange={() => toggleSel(idx)} /> auswählen
                          </label>
                        )
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
