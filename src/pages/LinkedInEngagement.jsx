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
  ExternalLink, AlertCircle, CheckCircle2, Loader2, X, Info,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const PRIMARY = 'rgb(49,90,231)'
const PRIMARY_VAR = `var(--wl-primary, ${PRIMARY})`

const pageOuterStyle  = { background:'var(--surface-canvas, #F8FAFC)', minHeight:'100vh', padding:'24px 24px 60px' }
const pageStyle       = { width:'100%', maxWidth:1000, margin:'0 auto', display:'flex', flexDirection:'column' }
const headerRowStyle  = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, gap:12, flexWrap:'wrap' }
const titleStyle      = { fontSize:22, fontWeight:800, margin:0, color:'var(--text-strong, #111827)', display:'flex', alignItems:'center', gap:10 }
const subtitleStyle   = { fontSize:13, color:'var(--text-muted, #6B7280)', marginTop:4 }
const cardStyle       = { background:'var(--surface)', borderRadius:12, border:'1px solid var(--border, #E4E7EC)', padding:'16px 18px' }
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
  processing: { label:'Läuft',        color:'#1D4ED8', bg:'#EFF6FF', border:'#BFDBFE' },
  done:       { label:'Erledigt',     color:'#065F46', bg:'#ECFDF5', border:'#6EE7B7' },
  error:      { label:'Fehler',       color:'#991B1B', bg:'#FEF2F2', border:'#FECACA' },
  skipped:    { label:'Übersprungen', color:'#475569', bg:'#F8FAFC', border:'#E5E7EB' },
}

const EMPTY_FORM = { kind:'comment', post:'', comment_text:'', saved_comment_id:'', reaction_type:'like', scheduled_at:'' }

export default function LinkedInEngagement() {
  const { activeTeamId } = useTeam()
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

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  const load = useCallback(async () => {
    if (!activeTeamId) { setJobs([]); setLoading(false); return }
    setLoading(true)
    // Team-scoped (Fallstrick #14). RLS ist Owner-scoped; team_id-Filter zusätzlich.
    const { data, error } = await supabase
      .from('linkedin_engagement_jobs')
      .select('id, kind, post_social_id, post_url, comment_text, reaction_type, status, scheduled_at, executed_at, error, created_at')
      .eq('team_id', activeTeamId)
      .order('created_at', { ascending:false })
    if (error) { setFlash({ type:'error', text:'Jobs laden fehlgeschlagen: ' + error.message }); setJobs([]); setLoading(false); return }
    setJobs(data || [])
    setLoading(false)
  }, [activeTeamId])

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
    if (!activeTeamId) { setOwnPosts([]); return }
    const { data, error } = await supabase
      .from('content_posts')
      .select('id, title, content, linkedin_social_id, published_at')
      .eq('team_id', activeTeamId)
      .not('linkedin_social_id', 'is', null)
      .order('published_at', { ascending:false })
      .limit(50)
    if (error) { console.warn('[engagement] own posts:', error.message); setOwnPosts([]); return }
    setOwnPosts(data || [])
  }, [activeTeamId])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadSaved() }, [loadSaved])
  useEffect(() => { loadOwnPosts() }, [loadOwnPosts])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

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
      let body = null
      try { body = await error.context?.json?.() } catch { /* Body evtl. konsumiert */ }
      const status = error.context?.status
      if (status === 401) setFlash({ type:'error', text:'Nicht autorisiert — bitte neu anmelden.' })
      else if (status === 403 || body?.error === 'no_addon') setFlash({ type:'error', text:'Das Automatisierung-Addon ist nicht aktiv.', action:{ label:'Addon aktivieren', to:'/marketplace' } })
      else if (status === 409) setFlash({ type:'error', text:'Kein aktiver LinkedIn-Account verbunden.', action:{ label:'LinkedIn verbinden', to:'/settings/linkedin' } })
      else if (status === 429 || body?.rate_limited) setFlash({ type:'error', text:'Rate-Limit erreicht — bitte später erneut.' })
      else setFlash({ type:'error', text: body?.error || ('Ausführen fehlgeschlagen: ' + error.message) })
      setRunning(false); return
    }
    setFlash({ type:'success', text:`Verarbeitet: ${data?.done ?? 0} erledigt · ${data?.skipped ?? 0} übersprungen · ${data?.failed ?? 0} Fehler.` })
    setRunning(false)
    load()
  }

  const cancelJob = async (id) => {
    const { error } = await supabase.from('linkedin_engagement_jobs').delete().eq('id', id)
    if (error) { setFlash({ type:'error', text:'Abbrechen fehlgeschlagen: ' + error.message }); return }
    setJobs(j => j.filter(x => x.id !== id))
  }

  return (
    <div style={pageOuterStyle}>
      <div style={pageStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}><Zap size={22} color={PRIMARY_VAR} /> Engagement</h1>
            <div style={subtitleStyle}>Kommentare und Reaktionen auf konkrete LinkedIn-Posts planen — serverseitig ausgeführt.</div>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button style={{ ...ghostBtnStyle, opacity: running ? 0.6 : 1 }} disabled={running} onClick={runNow}>
              {running ? <Loader2 size={15} className="lk-spin" /> : <Play size={15} />} Jetzt ausführen
            </button>
            <button style={primaryBtnStyle} onClick={() => { setForm(EMPTY_FORM); setShowDialog(true) }}>
              <Plus size={15} /> Neuer Job
            </button>
          </div>
        </div>

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

        {/* Job-Liste */}
        <div style={sectionTitle}><Zap size={14} /> Geplante & ausgeführte Jobs</div>
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
                  <div style={{ width:34, height:34, borderRadius:9, background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
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
                    <label style={labelStyle}>Kommentartext</label>
                    <textarea style={{ ...inputStyle, minHeight:80, resize:'vertical' }} value={form.comment_text} onChange={e => setField('comment_text', e.target.value)} placeholder="Dein Kommentar…" />
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
