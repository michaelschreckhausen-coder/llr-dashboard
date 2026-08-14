// src/pages/LinkedInEngagement.jsx
//
// Feature 3 — LinkedIn Engagement (Auto-Kommentar / Reaktion), post-scoped.
// Legt Engagement-Jobs in linkedin_engagement_jobs an (kind=comment|reaction auf
// einen konkreten Post). Der Worker `unipile-engagement` führt sie serverseitig
// aus (konservative Tageslimits pro kind). Nur via supabase.functions.invoke.
//
// Hard Rules: Inline-Styles, var(--wl-primary,…), Deutsch, Hooks oben,
// invoke ohne URL, error überall geprüft (Fallstrick #12), team_id bei Insert.

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, Plus, Play, Trash2, MessageSquare, Heart, Clock, Send,
  ExternalLink, AlertCircle, CheckCircle2, Loader2, X, Info, Sparkles, Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { useModel } from '../context/ModelContext'
import { mapEfError } from '../lib/efError'

const PRIMARY = 'rgb(49,90,231)'
const PRIMARY_VAR = `var(--wl-primary, ${PRIMARY})`

const pageOuterStyle  = { background:'transparent', minHeight:'100vh', padding:'24px 16px 60px' }
const pageStyle       = { width:'100%', maxWidth:1068, margin:'0 auto', display:'flex', flexDirection:'column' }
const headerRowStyle  = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, gap:12, flexWrap:'wrap' }
const titleStyle      = { fontSize:22, fontWeight:800, margin:0, color:'var(--text-strong, #111827)', display:'flex', alignItems:'center', gap:10 }
const subtitleStyle   = { fontSize:13, color:'var(--text-muted, #6B7280)', marginTop:4 }
const cardStyle       = { background:'var(--surface)', borderRadius:16, border:'1px solid var(--border, #E4E7EC)', boxShadow:'var(--shadow-card)', padding:'18px 20px' }
const inputStyle      = { padding:'8px 12px', borderRadius:8, border:'1.5px solid #E4E7EC', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'inherit', background:'var(--surface)' }
const labelStyle      = { display:'block', fontSize:10, fontWeight:700, color:'var(--text-muted, #6B7280)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }
const primaryBtnStyle = { padding:'9px 18px', background:PRIMARY_VAR, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
const ghostBtnStyle   = { padding:'7px 12px', background:'var(--surface)', color:'#374151', border:'1.5px solid #E4E7EC', borderRadius:10, fontSize:12, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }
const sectionTitle    = { fontSize:12, fontWeight:700, color:'var(--text-strong, #111827)', marginBottom:10, display:'flex', alignItems:'center', gap:6 }

const REACTION_OPTIONS = [
  { value:'like',       label:'👍 Gefällt mir' },
  { value:'celebrate',  label:'👏 Glückwunsch' },
  { value:'support',    label:'🤝 Unterstützung' },
  { value:'love',       label:'❤️ Interessant' },
  { value:'insightful', label:'💡 Aufschlussreich' },
  { value:'funny',      label:'😄 Lustig' },
]
const MAX_COMMENTS_PER_DAY = 40
const MAX_REACTIONS_PER_DAY = 80

const STATUS_CFG = {
  pending:    { label:'Geplant',      color:'#92400E', bg:'#FFFBEB', border:'#FCD34D' },
  processing: { label:'Läuft',        color:'#003060', bg:'#EEF4FE', border:'#CFE0F5' },
  done:       { label:'Erledigt',     color:'#039855', bg:'#EBFAF3', border:'#12B886' },
  error:      { label:'Fehler',       color:'#991B1B', bg:'#FEF2F2', border:'#FECACA' },
  skipped:    { label:'Übersprungen', color:'#475569', bg:'#F8FAFC', border:'#E5E7EB' },
}

const EMPTY_FORM = { kind:'comment', post:'', comment_text:'', saved_comment_id:'', reaction_type:'like', scheduled_at:'' }

export default function LinkedInEngagement() {
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const { model: selectedModel } = useModel()
  const navigate = useNavigate()

  const [uid, setUid]                 = useState(null)
  const [jobs, setJobs]               = useState([])
  const [savedComments, setSaved]     = useState([])
  const [ownPosts, setOwnPosts]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [running, setRunning]         = useState(false)
  const [showDialog, setShowDialog]   = useState(false)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)
  const [flash, setFlash]             = useState(null)
  const [suggesting, setSuggesting]   = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [suggestReaction, setSuggestReaction] = useState(null)
  const [opps, setOpps]               = useState([])
  const [oppsLoading, setOppsLoading] = useState(true)
  const [trackers, setTrackers]       = useState([])
  const [lists, setLists]             = useState([])
  const [showTrackerDialog, setShowTrackerDialog] = useState(false)
  const [trackerForm, setTrackerForm] = useState({ kind:'list', list_id:'', name:'', keywords:'', auto_mode:'review' })
  const [regenId, setRegenId]         = useState(null)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  const load = useCallback(async () => {
    // Brand-scoped: Engagement läuft aus dem Profil der aktiven Marke.
    const bvId = activeBrandVoice?.id || null
    if (!activeTeamId || !bvId) { setJobs([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('linkedin_engagement_jobs')
      .select('id, kind, post_social_id, post_url, comment_text, reaction_type, status, scheduled_at, executed_at, error, created_at')
      .eq('brand_voice_id', bvId)
      .order('created_at', { ascending:false })
    if (error) { setFlash({ type:'error', text:'Jobs laden fehlgeschlagen: ' + error.message }); setJobs([]); setLoading(false); return }
    setJobs(data || [])
    setLoading(false)
  }, [activeTeamId, activeBrandVoice?.id])

  const loadSaved = useCallback(async () => {
    if (!uid) { setSaved([]); return }
    const { data, error } = await supabase
      .from('saved_comments')
      .select('id, comment_text')
      .eq('user_id', uid)
      .order('created_at', { ascending:false })
      .limit(100)
    if (error) { console.warn('[engagement] saved_comments:', error.message); setSaved([]); return }
    setSaved(data || [])
  }, [uid])

  // Eigene veröffentlichte Posts (mit social_id) — team-scoped (Fallstrick #14).
  const loadOwnPosts = useCallback(async () => {
    const bvId = activeBrandVoice?.id || null
    if (!activeTeamId || !bvId) { setOwnPosts([]); return }
    const { data, error } = await supabase
      .from('content_posts')
      .select('id, title, content, linkedin_social_id, published_at')
      .eq('brand_voice_id', bvId)
      .not('linkedin_social_id', 'is', null)
      .order('published_at', { ascending:false })
      .limit(50)
    if (error) { console.warn('[engagement] own posts:', error.message); setOwnPosts([]); return }
    setOwnPosts(data || [])
  }, [activeTeamId, activeBrandVoice?.id])

  const loadOpps = useCallback(async () => {
    const bvId = activeBrandVoice?.id || null
    if (!activeTeamId || !bvId) { setOpps([]); setOppsLoading(false); return }
    setOppsLoading(true)
    const { data, error } = await supabase.from('engagement_opportunities')
      .select('*').eq('brand_voice_id', bvId).eq('status', 'new').order('created_at', { ascending:false }).limit(50)
    if (error) { console.warn('[engagement] opps:', error.message); setOpps([]); setOppsLoading(false); return }
    setOpps(data || []); setOppsLoading(false)
  }, [activeTeamId, activeBrandVoice?.id])

  const loadTrackers = useCallback(async () => {
    const bvId = activeBrandVoice?.id || null
    if (!bvId) { setTrackers([]); return }
    const { data, error } = await supabase.from('engagement_trackers')
      .select('*').eq('brand_voice_id', bvId).order('created_at', { ascending:false })
    if (error) { console.warn('[engagement] trackers:', error.message); setTrackers([]); return }
    setTrackers(data || [])
  }, [activeBrandVoice?.id])

  const loadLists = useCallback(async () => {
    if (!activeTeamId) { setLists([]); return }
    const { data, error } = await supabase.from('inbox_lists')
      .select('id, name, kind').eq('team_id', activeTeamId).order('name', { ascending:true })
    if (error) { console.warn('[engagement] lists:', error.message); setLists([]); return }
    setLists(data || [])
  }, [activeTeamId])

  useEffect(() => { loadOpps() }, [loadOpps])
  useEffect(() => { loadTrackers() }, [loadTrackers])
  useEffect(() => { loadLists() }, [loadLists])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadSaved() }, [loadSaved])
  useEffect(() => { loadOwnPosts() }, [loadOwnPosts])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Weg 2: Engagement-Feed-Aktionen ──
  const engageComment = async (o, text) => {
    const { error } = await supabase.from('linkedin_engagement_jobs').insert({
      user_id: uid, team_id: activeTeamId, brand_voice_id: activeBrandVoice?.id || null,
      kind:'comment', comment_text: text, post_social_id: o.post_social_id, status:'pending', scheduled_at: new Date().toISOString(),
    })
    if (error) { setFlash({ type:'error', text:'Kommentar planen fehlgeschlagen: ' + error.message }); return }
    await supabase.from('engagement_opportunities').update({ status:'done', acted_at: new Date().toISOString() }).eq('id', o.id)
    setOpps(prev => prev.filter(x => x.id !== o.id))
    setFlash({ type:'success', text:'Kommentar eingeplant.' }); load()
  }
  const engageReaction = async (o) => {
    const { error } = await supabase.from('linkedin_engagement_jobs').insert({
      user_id: uid, team_id: activeTeamId, brand_voice_id: activeBrandVoice?.id || null,
      kind:'reaction', reaction_type: o.suggested_reaction || 'like', post_social_id: o.post_social_id, status:'pending', scheduled_at: new Date().toISOString(),
    })
    if (error) { setFlash({ type:'error', text:'Reaktion planen fehlgeschlagen: ' + error.message }); return }
    setFlash({ type:'success', text:'Reaktion eingeplant.' }); load()
  }
  const dismissOpp = async (o) => {
    await supabase.from('engagement_opportunities').update({ status:'dismissed' }).eq('id', o.id)
    setOpps(prev => prev.filter(x => x.id !== o.id))
  }
  const regenerateOpp = async (o) => {
    if (!activeBrandVoice?.id) { setFlash({ type:'error', text:'Keine aktive Marke.' }); return }
    setRegenId(o.id)
    try {
      const prompt =
'Du kommentierst als die oben definierte Person auf einen FREMDEN LinkedIn-Beitrag. Konkret, mit Mehrwert, in der Brand Voice, kein generisches Lob.\n\nBeitrag:\n"""\n' + (o.post_text || '').slice(0, 1800) + '\n"""\n\n' +
'Schreibe 3 kurze Kommentar-Varianten (je 1-3 Sätze, Deutsch) und schlage eine Reaktion vor (like|celebrate|support|love|insightful|funny). Antworte NUR mit JSON: {"reaction":"like","comments":["…","…","…"]}'
      const { data: gen, error: genErr } = await supabase.functions.invoke('generate', {
        body: { type:'engagement_comment', prompt, brand_voice_id: activeBrandVoice.id, model: selectedModel, userId: uid }
      })
      if (genErr) { const m = await mapEfError(genErr); setFlash({ type:'error', text:m.text, action:m.action }); setRegenId(null); return }
      const rawTxt = gen?.text || gen?.result || ''
      let parsed=null; try { const mm=rawTxt.replace(/```json|```/g,'').match(/\{[\s\S]*\}/); parsed=JSON.parse(mm?mm[0]:rawTxt) } catch(_e){}
      const comments = Array.isArray(parsed?.comments) ? parsed.comments.map(c=>(c||'').toString().trim()).filter(Boolean).slice(0,3) : []
      await supabase.from('engagement_opportunities').update({ suggested_comments: comments, suggested_reaction: parsed?.reaction || null }).eq('id', o.id)
      setOpps(prev => prev.map(x => x.id===o.id ? { ...x, suggested_comments: comments, suggested_reaction: parsed?.reaction || null } : x))
    } catch (e) { setFlash({ type:'error', text:'Generierung fehlgeschlagen: ' + (e?.message||e) }) }
    setRegenId(null)
  }
  const createTracker = async () => {
    if (!activeBrandVoice?.id) { setFlash({ type:'error', text:'Keine aktive Marke gewählt.' }); return }
    const isKw = trackerForm.kind === 'keyword'
    if (isKw && !(trackerForm.keywords || '').trim()) { setFlash({ type:'error', text:'Bitte Keywords eingeben.' }); return }
    if (!isKw && !trackerForm.list_id) { setFlash({ type:'error', text:'Bitte eine Liste wählen.' }); return }
    const defName = isKw ? (trackerForm.keywords || '').trim() : (lists.find(l => l.id === trackerForm.list_id)?.name || 'Liste')
    const { error } = await supabase.from('engagement_trackers').insert({
      team_id: activeTeamId, user_id: uid, brand_voice_id: activeBrandVoice.id,
      kind: trackerForm.kind, list_id: isKw ? null : trackerForm.list_id, keywords: isKw ? trackerForm.keywords.trim() : null,
      name: (trackerForm.name || '').trim() || defName, auto_mode: trackerForm.auto_mode, active: true,
    })
    if (error) { setFlash({ type:'error', text:'Tracker anlegen fehlgeschlagen: ' + error.message }); return }
    setShowTrackerDialog(false); setTrackerForm({ kind:'list', list_id:'', name:'', keywords:'', auto_mode:'review' })
    setFlash({ type:'success', text:'Tracker angelegt — neue Posts erscheinen im Feed.' }); loadTrackers()
  }
  const toggleTracker = async (t) => { await supabase.from('engagement_trackers').update({ active: !t.active }).eq('id', t.id); loadTrackers() }
  const deleteTracker = async (t) => { await supabase.from('engagement_trackers').delete().eq('id', t.id); loadTrackers() }

  const createJob = async () => {
    if (!form.post.trim()) { setFlash({ type:'error', text:'Bitte Post-URL oder activity-URN angeben.' }); return }
    if (form.kind === 'comment' && !form.comment_text.trim() && !form.saved_comment_id) {
      setFlash({ type:'error', text:'Bitte einen Kommentartext eingeben oder eine Vorlage wählen.' }); return
    }
    setSaving(true)
    const isUrn = form.post.trim().startsWith('urn:')
    const row = {
      user_id: uid,
      team_id: activeTeamId,               // Multi-Tenant: team_id bei jedem Insert
      brand_voice_id: activeBrandVoice?.id || null,   // Brand-scoped (Trigger füllt sonst nach)
      kind: form.kind,
      post_social_id: isUrn ? form.post.trim() : null,
      post_url: isUrn ? null : form.post.trim(),
      status: 'pending',
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : new Date().toISOString(),
    }
    if (form.kind === 'comment') {
      row.comment_text = form.comment_text.trim() || null
      row.saved_comment_id = form.saved_comment_id || null
    } else {
      row.reaction_type = form.reaction_type || 'like'
    }
    const { error } = await supabase.from('linkedin_engagement_jobs').insert(row)
    if (error) { setFlash({ type:'error', text:'Job anlegen fehlgeschlagen: ' + error.message }); setSaving(false); return }  // Fallstrick #12
    setFlash({ type:'success', text:'Engagement-Job geplant.' })
    setForm(EMPTY_FORM)
    setShowDialog(false)
    setSaving(false)
    load()
  }

  const runNow = async () => {
    setRunning(true); setFlash(null)
    const { data, error } = await supabase.functions.invoke('unipile-engagement', { body: {} })
    if (error) {
      const m = await mapEfError(error)   // P3 Schritt 4: zentraler Mapper (403→Upgrade, 401→Sitzung, 409/429/…)
      setFlash({ type:'error', text: m.text, action: m.action })
      setRunning(false); return
    }
    setFlash({ type:'success', text:`Verarbeitet: ${data?.done ?? 0} erledigt · ${data?.skipped ?? 0} übersprungen · ${data?.failed ?? 0} Fehler.` })
    setRunning(false)
    load()
  }

  // KI-Kommentarvorschläge (Weg 1): Post via Unipile lesen -> generate (Markenstimme + gewähltes Modell).
  const suggestComments = async () => {
    if (!form.post.trim()) { setFlash({ type:'error', text:'Bitte zuerst die Post-URL angeben.' }); return }
    if (!activeBrandVoice?.id) { setFlash({ type:'error', text:'Keine aktive Marke gewählt (oben rechts).' }); return }
    setSuggesting(true); setFlash(null); setSuggestions([]); setSuggestReaction(null)
    try {
      const { data: read, error: readErr } = await supabase.functions.invoke('unipile-engagement-read', {
        body: { post: form.post.trim(), brand_voice_id: activeBrandVoice.id }
      })
      if (readErr) { const m = await mapEfError(readErr); setFlash({ type:'error', text: m.text, action: m.action }); setSuggesting(false); return }
      if (!read?.ok || !(read.text || '').trim()) { setFlash({ type:'error', text:'Post konnte nicht gelesen werden (leer oder nicht zugänglich).' }); setSuggesting(false); return }
      const authorLine = read.author_name ? ('Autor: ' + read.author_name + (read.is_company ? ' (Unternehmen)' : '') + '\n') : ''
      const prompt =
'Du kommentierst als die oben definierte Person auf einen FREMDEN LinkedIn-Beitrag. Ziel: sichtbar, sympathisch und fachlich anschlussfähig sein — echtes Engagement, kein generisches Lob.\n\n' +
authorLine + 'Beitrag:\n"""\n' + (read.text || '').slice(0, 1800) + '\n"""\n\n' +
'Schreibe 3 kurze, unterschiedliche Kommentar-Varianten (je 1-3 Sätze, Deutsch):\n' +
'- konkret auf einen Inhalt des Beitrags eingehen (ein Detail aufgreifen), niemals nur "Toller Beitrag".\n' +
'- Mehrwert bieten: eigene Erfahrung, eine präzise Frage, eine ergänzende Perspektive oder klare Zustimmung mit Begründung.\n' +
'- natürlich und menschlich in der Brand Voice; keine Hashtags, keine Emoji-Flut, kein Verkaufspitch.\n' +
'Schlage außerdem eine passende Reaktion vor (einer von: like, celebrate, support, love, insightful, funny).\n\n' +
'Antworte NUR mit JSON (kein Markdown):\n{"reaction":"like","comments":["…","…","…"]}'
      const { data: gen, error: genErr } = await supabase.functions.invoke('generate', {
        body: { type:'engagement_comment', prompt, brand_voice_id: activeBrandVoice.id, model: selectedModel, userId: uid }
      })
      if (genErr) { const m = await mapEfError(genErr); setFlash({ type:'error', text: m.text, action: m.action }); setSuggesting(false); return }
      const rawTxt = gen?.text || gen?.result || ''
      let parsed = null
      try { const mm = rawTxt.replace(/```json|```/g, '').match(/\{[\s\S]*\}/); parsed = JSON.parse(mm ? mm[0] : rawTxt) } catch (_e) { /* Parse-Fallback unten */ }
      const comments = Array.isArray(parsed?.comments) ? parsed.comments.map(c => (c || '').toString().trim()).filter(Boolean).slice(0, 3) : []
      if (!comments.length) { setFlash({ type:'error', text:'Keine verwertbaren Vorschläge — bitte erneut versuchen.' }); setSuggesting(false); return }
      setSuggestions(comments)
      if (parsed?.reaction) setSuggestReaction(parsed.reaction)
      // robuste social_id gleich übernehmen (falls URL eingegeben wurde)
      if (read.social_id && !form.post.trim().startsWith('urn:')) setField('post', read.social_id)
    } catch (e) {
      setFlash({ type:'error', text:'Vorschläge fehlgeschlagen: ' + (e?.message || e) })
    }
    setSuggesting(false)
  }

  const cancelJob = async (id) => {
    const { error } = await supabase.from('linkedin_engagement_jobs').delete().eq('id', id)
    if (error) { setFlash({ type:'error', text:'Abbrechen fehlgeschlagen: ' + error.message }); return }
    setJobs(j => j.filter(x => x.id !== id))
  }

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <PageHeader
          overline="LinkedIn · Engagement"
          title="Engagement"
          subtitle="Kommentare und Reaktionen auf konkrete LinkedIn-Posts planen — serverseitig ausgeführt."
          action={(
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button className="lk-btn lk-btn-ghost" style={{ opacity: running ? 0.6 : 1 }} disabled={running} onClick={runNow}>
                {running ? <Loader2 size={15} className="lk-spin" /> : <Play size={15} />} Jetzt ausführen
              </button>
              <button className="lk-btn lk-btn-navy" onClick={() => { setForm(EMPTY_FORM); setSuggestions([]); setSuggestReaction(null); setShowDialog(true) }}>
                <Plus size={15} /> Neuer Job
              </button>
            </div>
          )}
        />

        {/* Compliance-Hinweis + Tageslimits */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:16, padding:'10px 14px', borderRadius:10, fontSize:12.5,
          background:'#FFFBEB', border:'1px solid #FDE68A', color:'#92400E' }}>
          <Info size={16} style={{ flexShrink:0, marginTop:1 }} />
          <span>
            Auto-Engagement ist gegenüber LinkedIn sensibel — bitte verantwortungsvoll und sparsam nutzen.
            Tageslimits pro Konto: <strong>{MAX_COMMENTS_PER_DAY} Kommentare</strong> und <strong>{MAX_REACTIONS_PER_DAY} Reaktionen</strong>.
            Bei Überschreitung geht ein Job auf „Übersprungen" — ohne Account-Risiko.
          </span>
        </div>

        {flash && (
          <div style={{
            display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'10px 14px', borderRadius:10, fontSize:13, fontWeight:600,
            background: flash.type === 'error' ? '#FEF2F2' : '#EBFAF3',
            color:      flash.type === 'error' ? '#B91C1C' : '#039855',
            border: `1px solid ${flash.type === 'error' ? '#FECACA' : '#C7EFDC'}`,
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

        {/* ── Engagement-Feed (Weg 2) ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div className="lk-eyebrow" style={{ margin:0 }}>Engagement-Feed</div>
          <span style={{ fontSize:11.5, color:'var(--text-muted, #6B7280)' }}>{opps.length} offen</span>
        </div>
        {oppsLoading ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', marginBottom:22 }}><Loader2 size={16} className="lk-spin" /> Lädt…</div>
        ) : opps.length === 0 ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13, padding:'24px 20px', marginBottom:22 }}>
            Noch keine Engagement-Chancen. Lege unten einen Tracker aus einer Liste an — sobald eine getrackte Person postet, erscheint hier ein Vorschlag.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:26 }}>
            {opps.map(o => (
              <div key={o.id} style={{ ...cardStyle, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:8 }}>
                  <div style={{ fontSize:13.5, fontWeight:700, color:'var(--text-strong, #111827)' }}>{o.actor_name || 'Profil'}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {o.post_url && <a href={o.post_url} target="_blank" rel="noreferrer" style={{ fontSize:11.5, color:PRIMARY_VAR, display:'inline-flex', alignItems:'center', gap:3, textDecoration:'none' }}>Post ansehen <ExternalLink size={12} /></a>}
                    <span style={{ fontSize:11, color:'var(--text-muted, #6B7280)' }}>{o.post_at ? new Date(o.post_at).toLocaleDateString('de-DE') : ''}</span>
                  </div>
                </div>
                {o.post_text && <div style={{ fontSize:12.5, color:'var(--text-soft, #4B5563)', lineHeight:1.45, marginBottom:10 }}>{o.post_text.slice(0, 240)}{o.post_text.length > 240 ? '…' : ''}</div>}
                {(Array.isArray(o.suggested_comments) && o.suggested_comments.length > 0) ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
                    <div style={{ fontSize:11, color:'var(--text-muted, #6B7280)' }}>Kommentar-Vorschläge — klicken zum Einplanen:</div>
                    {o.suggested_comments.map((c, i) => (
                      <button key={i} type="button" onClick={() => engageComment(o, c)}
                        style={{ textAlign:'left', padding:'8px 10px', borderRadius:8, border:'1px solid #E4E7EC', background:'#F8FAFC', cursor:'pointer', fontSize:12.5, color:'#374151', lineHeight:1.45, fontFamily:'inherit' }}
                        title="Diesen Kommentar einplanen">{c}</button>
                    ))}
                  </div>
                ) : (
                  <button type="button" onClick={() => regenerateOpp(o)} disabled={regenId === o.id} style={{ ...ghostBtnStyle, marginBottom:8 }}>
                    {regenId === o.id ? <Loader2 size={13} className="lk-spin" /> : <Sparkles size={13} />} Vorschläge generieren
                  </button>
                )}
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <button onClick={() => engageReaction(o)} style={ghostBtnStyle} title="Reaktion einplanen">
                    <Heart size={13} /> Reaktion{o.suggested_reaction ? ` (${(REACTION_OPTIONS.find(r => r.value === o.suggested_reaction)?.label) || o.suggested_reaction})` : ''}
                  </button>
                  <button onClick={() => dismissOpp(o)} style={{ ...ghostBtnStyle, color:'#B91C1C', borderColor:'#FECACA' }} title="Verwerfen"><X size={13} /> Verwerfen</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Getrackte Listen (Weg 2) ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div className="lk-eyebrow" style={{ margin:0 }}>Getrackte Listen</div>
          <button className="lk-btn lk-btn-ghost" onClick={() => { setTrackerForm({ kind:'list', list_id:'', name:'', keywords:'', auto_mode:'review' }); setShowTrackerDialog(true) }}><Plus size={14} /> Neuer Tracker</button>
        </div>
        {trackers.length === 0 ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13, padding:'20px', marginBottom:26 }}>
            Kein Tracker aktiv. Wähle eine Liste aus Netzwerk/Prospects — Leadly beobachtet die Profile und schlägt Engagement vor, sobald sie posten.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:26 }}>
            {trackers.map(t => {
              const AUTO = { review:'Nur Vorschlag', react:'Auto-Reaktion', full:'Voll-Automatik' }
              return (
                <div key={t.id} style={{ ...cardStyle, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', opacity: t.active ? 1 : 0.6 }}>
                  <div style={{ width:34, height:34, borderRadius:9, background:'#EEF4FE', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{t.kind === 'keyword' ? <Sparkles size={16} color={PRIMARY_VAR} /> : <Users size={16} color={PRIMARY_VAR} />}</div>
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:'var(--text-strong, #111827)' }}>{t.name}</div>
                    <div style={{ fontSize:11.5, color:'var(--text-muted, #6B7280)', marginTop:2 }}>
                      {t.kind === 'keyword' ? `Keywords: ${t.keywords || '—'}` : `Liste: ${(lists.find(l => l.id === t.list_id)?.name) || '—'}`} · {AUTO[t.auto_mode] || t.auto_mode}{t.last_polled_at ? ` · zuletzt geprüft ${new Date(t.last_polled_at).toLocaleString('de-DE')}` : ' · noch nicht geprüft'}
                    </div>
                  </div>
                  <button onClick={() => toggleTracker(t)} style={ghostBtnStyle}>{t.active ? 'Aktiv' : 'Pausiert'}</button>
                  <button onClick={() => deleteTracker(t)} style={{ ...ghostBtnStyle, color:'#B91C1C', borderColor:'#FECACA' }} title="Löschen"><Trash2 size={14} /></button>
                </div>
              )
            })}
          </div>
        )}

        {/* Job-Liste */}
        <div className="lk-eyebrow">Geplante & ausgeführte Jobs</div>
        {loading ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)' }}>
            <Loader2 size={18} className="lk-spin" /> Lädt…
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ ...cardStyle, textAlign:'center', color:'var(--text-muted, #6B7280)', fontSize:13, padding:'32px 20px' }}>
            Noch keine Engagement-Jobs. Lege oben rechts deinen ersten Job an.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {jobs.map(j => {
              const st = STATUS_CFG[j.status] || STATUS_CFG.pending
              const target = j.post_social_id || j.post_url || '—'
              return (
                <div key={j.id} style={{ ...cardStyle, padding:'12px 16px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                  <div style={{ width:34, height:34, borderRadius:9, background:'#EEF4FE', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {j.kind === 'comment' ? <MessageSquare size={16} color={PRIMARY_VAR} /> : <Heart size={16} color={PRIMARY_VAR} />}
                  </div>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:'var(--text-strong, #111827)' }}>
                      {j.kind === 'comment' ? 'Kommentar' : `Reaktion (${(REACTION_OPTIONS.find(o => o.value === j.reaction_type)?.label) || j.reaction_type})`}
                    </div>
                    {j.kind === 'comment' && j.comment_text && (
                      <div style={{ fontSize:12, color:'var(--text-soft, #4B5563)', marginTop:2, fontStyle:'italic' }}>„{j.comment_text}"</div>
                    )}
                    <div style={{ fontSize:11.5, color:'var(--text-muted, #6B7280)', marginTop:2, display:'inline-flex', alignItems:'center', gap:4, wordBreak:'break-all' }}>
                      <Clock size={11} /> {j.scheduled_at ? new Date(j.scheduled_at).toLocaleString('de-DE') : '—'} · {target}
                    </div>
                    {j.status === 'error' && j.error && <div style={{ fontSize:11.5, color:'#B91C1C', marginTop:2 }}>{j.error}</div>}
                    {j.status === 'skipped' && <div style={{ fontSize:11.5, color:'#6B7280', marginTop:2 }}>Übersprungen (Tageslimit erreicht)</div>}
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:st.bg, color:st.color, border:`1px solid ${st.border}` }}>{st.label}</span>
                  {j.status !== 'processing' && j.status !== 'done' && (
                    <button style={{ ...ghostBtnStyle, color:'#B91C1C', borderColor:'#FECACA' }} onClick={() => cancelJob(j.id)} title="Abbrechen">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tracker-Dialog (Weg 2) */}
      {showTrackerDialog && (
        <div onClick={() => setShowTrackerDialog(false)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width:'100%', maxWidth:480 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong, #111827)' }}>Neuer Tracker</div>
              <button onClick={() => setShowTrackerDialog(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280' }}><X size={18} /></button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={labelStyle}>Quelle</label>
                <div style={{ display:'inline-flex', background:'#F3F4F6', borderRadius:10, padding:3, gap:2 }}>
                  {[{ v:'list', l:'Liste' }, { v:'keyword', l:'Keywords' }].map(o => (
                    <button key={o.v} type="button" onClick={() => setTrackerForm(f => ({ ...f, kind:o.v }))}
                      style={{ height:32, padding:'0 14px', fontSize:13, border:'none', borderRadius:8, cursor:'pointer', fontWeight:600,
                        background: trackerForm.kind === o.v ? 'var(--surface)' : 'transparent', color: trackerForm.kind === o.v ? '#111827' : '#6B7280', boxShadow: trackerForm.kind === o.v ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>{o.l}</button>
                  ))}
                </div>
              </div>
              {trackerForm.kind === 'keyword' ? (
                <div>
                  <label style={labelStyle}>Keywords / Thema</label>
                  <input style={inputStyle} value={trackerForm.keywords} onChange={e => setTrackerForm(f => ({ ...f, keywords: e.target.value }))} placeholder="z. B. Leadgenerierung LinkedIn" />
                  <div style={{ fontSize:11, color:'var(--text-muted, #6B7280)', marginTop:4 }}>Findet frische Beiträge (letzte Woche) zu diesen Begriffen — auch von Menschen, die du noch nicht kennst.</div>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>Liste (Netzwerk / Prospects)</label>
                  <select style={inputStyle} value={trackerForm.list_id} onChange={e => setTrackerForm(f => ({ ...f, list_id: e.target.value }))}>
                    <option value="">— Liste wählen —</option>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}{l.kind ? ` (${l.kind})` : ''}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={labelStyle}>Name (optional)</label>
                <input style={inputStyle} value={trackerForm.name} onChange={e => setTrackerForm(f => ({ ...f, name: e.target.value }))} placeholder="z. B. Ziel-Accounts Q3" />
              </div>
              <div>
                <label style={labelStyle}>Modus</label>
                <select style={inputStyle} value={trackerForm.auto_mode} onChange={e => setTrackerForm(f => ({ ...f, auto_mode: e.target.value }))}>
                  <option value="review">Nur Vorschlag (du bestätigst)</option>
                  <option value="react">Auto-Reaktion + Kommentarvorschlag</option>
                  <option value="full">Voll-Automatik (Reaktion + Kommentar)</option>
                </select>
                <div style={{ fontSize:11, color:'var(--text-muted, #6B7280)', marginTop:4 }}>Empfohlen: „Nur Vorschlag". Automatik nutzt die Tageslimits und ist gegenüber LinkedIn sensibler.</div>
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button style={ghostBtnStyle} onClick={() => setShowTrackerDialog(false)}>Abbrechen</button>
                <button style={primaryBtnStyle} onClick={createTracker}><Send size={15} /> Tracker anlegen</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job-Erstellungs-Dialog */}
      {showDialog && (
        <div onClick={() => setShowDialog(false)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong, #111827)' }}>Neuer Engagement-Job</div>
              <button onClick={() => setShowDialog(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280' }}><X size={18} /></button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={labelStyle}>Art</label>
                <div style={{ display:'inline-flex', background:'#F3F4F6', borderRadius:10, padding:3, gap:2 }}>
                  {[{ v:'comment', l:'Kommentar', I:MessageSquare }, { v:'reaction', l:'Reaktion', I:Heart }].map(o => (
                    <button key={o.v} onClick={() => setField('kind', o.v)}
                      style={{ height:32, padding:'0 14px', fontSize:13, border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, display:'inline-flex', alignItems:'center', gap:6,
                        background: form.kind === o.v ? 'var(--surface)' : 'transparent', color: form.kind === o.v ? '#111827' : '#6B7280', boxShadow: form.kind === o.v ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>
                      <o.I size={14} /> {o.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Post (URL oder urn:li:activity:…)</label>
                <input style={inputStyle} value={form.post} onChange={e => setField('post', e.target.value)} placeholder="https://www.linkedin.com/feed/update/urn:li:activity:…" />
                {ownPosts.length > 0 && (
                  <div style={{ marginTop:8 }}>
                    <label style={{ ...labelStyle, marginBottom:4 }}>… oder eigenen veröffentlichten Post wählen</label>
                    <select style={inputStyle} value="" onChange={e => { if (e.target.value) setField('post', e.target.value) }}>
                      <option value="">— eigener Post —</option>
                      {ownPosts.map(p => (
                        <option key={p.id} value={p.linkedin_social_id}>
                          {(p.title?.trim() || (p.content || '').slice(0, 60) || 'Beitrag')}{p.published_at ? ` · ${new Date(p.published_at).toLocaleDateString('de-DE')}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {form.kind === 'comment' ? (
                <>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                      <label style={{ ...labelStyle, marginBottom:0 }}>Kommentartext</label>
                      <button type="button" onClick={suggestComments} disabled={suggesting || !form.post.trim()}
                        style={{ ...ghostBtnStyle, padding:'5px 10px', opacity: (suggesting || !form.post.trim()) ? 0.55 : 1 }}
                        title={!form.post.trim() ? 'Zuerst Post-URL eingeben' : 'Leadly liest den Post und schlägt Kommentare vor'}>
                        {suggesting ? <Loader2 size={13} className="lk-spin" /> : <Sparkles size={13} />} Mit Leadly vorschlagen
                      </button>
                    </div>
                    <textarea style={{ ...inputStyle, minHeight:80, resize:'vertical' }} value={form.comment_text} onChange={e => setField('comment_text', e.target.value)} placeholder="Dein Kommentar… oder oben mit Leadly vorschlagen lassen" />
                    {suggestions.length > 0 && (
                      <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
                        <div style={{ fontSize:11, color:'var(--text-muted, #6B7280)' }}>Vorschläge — klicken zum Übernehmen:</div>
                        {suggestions.map((c, i) => (
                          <button key={i} type="button" onClick={() => { setField('comment_text', c); setField('saved_comment_id', '') }}
                            style={{ textAlign:'left', padding:'8px 10px', borderRadius:8, border:`1px solid ${form.comment_text === c ? PRIMARY_VAR : '#E4E7EC'}`, background: form.comment_text === c ? '#EEF4FE' : '#F8FAFC', cursor:'pointer', fontSize:12.5, color:'#374151', lineHeight:1.45, fontFamily:'inherit' }}>
                            {c}
                          </button>
                        ))}
                        {suggestReaction && (
                          <div style={{ fontSize:11.5, color:'var(--text-muted, #6B7280)' }}>
                            Vorgeschlagene Reaktion: <strong>{(REACTION_OPTIONS.find(o => o.value === suggestReaction)?.label) || suggestReaction}</strong>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {savedComments.length > 0 && (
                    <div>
                      <label style={labelStyle}>… oder Vorlage aus der Kommentar-Bibliothek</label>
                      <select style={inputStyle} value={form.saved_comment_id} onChange={e => setField('saved_comment_id', e.target.value)}>
                        <option value="">— keine —</option>
                        {savedComments.map(sc => <option key={sc.id} value={sc.id}>{(sc.comment_text || '').slice(0, 70)}</option>)}
                      </select>
                      <div style={{ fontSize:11, color:'var(--text-muted, #6B7280)', marginTop:4 }}>Bei Nutzung einer Vorlage wird der Freitext ignoriert.</div>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label style={labelStyle}>Reaktionstyp</label>
                  <select style={inputStyle} value={form.reaction_type} onChange={e => setField('reaction_type', e.target.value)}>
                    {REACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={labelStyle}>Zeitpunkt (optional — leer = sofort einplanen)</label>
                <input type="datetime-local" style={inputStyle} value={form.scheduled_at} onChange={e => setField('scheduled_at', e.target.value)} />
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:4 }}>
                <button style={ghostBtnStyle} onClick={() => setShowDialog(false)}>Abbrechen</button>
                <button style={{ ...primaryBtnStyle, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={createJob}>
                  {saving ? <Loader2 size={15} className="lk-spin" /> : <Send size={15} />} Job planen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
