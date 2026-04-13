import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const LI_BLUE  = '#0a66c2'
const LI_HOVER = '#004182'
const BORDER   = '#e0e0e0'

function LinkedInIcon({ size = 16, color = LI_BLUE }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill={color}/>
      <path d="M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 8.48H3V21h4V8.48ZM13.32 8.48H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91l.04-1.68Z" fill="white"/>
    </svg>
  )
}

export default function Profile({ session }) {
  const [profile,         setProfile]         = useState(null)
  const [liIdentity,      setLiIdentity]      = useState(null)
  const [liMeta,          setLiMeta]          = useState(null)
  const [form,            setForm]            = useState({ full_name:'', company:'', headline:'', bio:'' })
  const [saving,          setSaving]          = useState(false)
  const [saved,           setSaved]           = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [syncing,         setSyncing]         = useState(false)
  const [msg,             setMsg]             = useState(null)
  const fileRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    // 1. Profil aus DB
    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', session.user.id).single()

    // 2. Auth-User holen – enthält identities + user_metadata
    const user = session.user

    // LinkedIn-Identity (provider kann 'linkedin_oidc' oder 'linkedin' heißen)
    const li = user?.identities?.find(
      i => i.provider === 'linkedin_oidc' || i.provider === 'linkedin'
    ) || null
    setLiIdentity(li)

    // user_metadata ist oft vollständiger als identity_data
    const meta = user?.user_metadata || {}
    setLiMeta(meta)

    // Bestes verfügbares LinkedIn-Bild
    const liPicture =
      li?.identity_data?.avatar_url ||
      li?.identity_data?.picture      ||
      meta?.avatar_url                ||
      meta?.picture                   || ''

    // Bester verfügbarer LinkedIn-Name
    const liName =
      li?.identity_data?.full_name    ||
      li?.identity_data?.name         ||
      meta?.full_name                 ||
      meta?.name                      || ''

    const merged = {
      full_name:  prof?.full_name  || liName    || '',
      company:    prof?.company    || '',
      headline:   prof?.headline   || li?.identity_data?.headline || meta?.headline || '',
      bio:        prof?.bio        || '',
      avatar_url: prof?.avatar_url || liPicture || '',
    }
    setProfile({ ...prof, ...merged })
    setForm({
      full_name: merged.full_name,
      company:   merged.company,
      headline:  merged.headline,
      bio:       merged.bio,
    })
  }

  async function save() {
    setSaving(true); setMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: form.full_name, company: form.company, headline: form.headline, bio: form.bio })
      .eq('id', session.user.id)
    setSaving(false)
    if (error) { setMsg({ type:'error', text: error.message }); return }
    setSaved(true); setTimeout(() => setSaved(false), 2500)
    setProfile(p => ({ ...p, ...form }))
  }

  /* ─────────────────────────────────────────────────
     FIX: LinkedIn Sync – alle Felder-Namen abdecken
  ───────────────────────────────────────────────── */
  async function syncFromLinkedIn() {
    if (!liIdentity && !liMeta) {
      setMsg({ type:'error', text: 'Kein LinkedIn-Account verknüpft. Bitte zuerst LinkedIn verbinden.' })
      return
    }
    setSyncing(true)
    setMsg(null)
    try {
      // Immer frischen User-Stand holen
      const { data: { user }, error: userErr } = Promise.resolve({ data: { user: session.user } })
      if (userErr) throw userErr

      const identity = user?.identities?.find(
        i => i.provider === 'linkedin_oidc' || i.provider === 'linkedin'
      )
      const id  = identity?.identity_data || {}
      const meta = user?.user_metadata    || {}

      // Alle bekannten LinkedIn-Feldnamen versuchen
      const liName =
        id.full_name  || id.name  ||
        meta.full_name || meta.name || ''

      const liHeadline =
        id.headline   || id.job_title   || id.position ||
        meta.headline || meta.job_title || meta.position || ''

      const liCompany =
        id.company    || id.organization ||
        meta.company  || meta.organization || ''

      const liPicture =
        id.avatar_url || id.picture ||
        meta.avatar_url || meta.picture || ''

      // Wenn alles leer → Fehlermeldung statt stille Nicht-Aktion
      if (!liName && !liHeadline && !liCompany && !liPicture) {
        setMsg({
          type: 'warn',
          text: 'LinkedIn hat keine zusätzlichen Profildaten übermittelt. Bitte speichere die Daten manuell.'
        })
        setSyncing(false)
        return
      }

      const newForm = {
        full_name: liName     || form.full_name,
        company:   liCompany  || form.company,
        headline:  liHeadline || form.headline,
        bio:       form.bio,
      }
      setForm(newForm)

      const update = {
        ...newForm,
        ...(liPicture ? { avatar_url: liPicture } : {}),
      }
      const { error: updateErr } = await supabase
        .from('profiles').update(update).eq('id', session.user.id)
      if (updateErr) throw updateErr

      setProfile(p => ({ ...p, ...update }))
      setMsg({ type:'success', text: 'Profildaten von LinkedIn übernommen! ✓' })
      setTimeout(() => setMsg(null), 4000)
    } catch (e) {
      setMsg({ type:'error', text: 'Fehler beim Importieren: ' + e.message })
    }
    setSyncing(false)
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setMsg({ type:'error', text: 'Max. 2 MB erlaubt.' }); return }
    setAvatarUploading(true)
    try {
      const { data: { session: sess } } = await supabase.auth.getSession()
      const userToken = sess?.access_token
      if (!userToken) { setMsg({ type:'error', text: 'Nicht eingeloggt' }); setAvatarUploading(false); return }
      const ext  = file.name.split('.').pop()
      const path = session.user.id + '.' + ext
      const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
      // Direkter Upload mit user JWT (publishable key ist kein gültiges JWT für Storage)
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': file.type || 'image/jpeg',
          'x-upsert': 'true'
        },
        body: file
      })
      if (!res.ok) { const t = await res.text(); setMsg({ type:'error', text: t }); setAvatarUploading(false); return }
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id)
      setProfile(p => ({ ...p, avatar_url: publicUrl }))
      setMsg({ type:'success', text: 'Profilbild aktualisiert!' })
      setTimeout(() => setMsg(null), 3000)
    } catch(err) {
      setMsg({ type:'error', text: err.message })
    }
    setAvatarUploading(false)
  }

  const avatarUrl   = profile?.avatar_url || liIdentity?.identity_data?.avatar_url || liMeta?.avatar_url || ''
  const displayName = profile?.full_name  || session.user.email?.split('@')[0] || 'Unbekannt'
  const initials    = (profile?.full_name || session.user.email || '?')
    .split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()

  const hasLinkedIn = !!liIdentity || !!(liMeta && Object.keys(liMeta).length > 0)

  const S = {
    page: { maxWidth: 720 },
    card: { background:'#fff', borderRadius:12, border:'1px solid ' + BORDER, marginBottom:16, overflow:'hidden' },
    hdr:  { padding:'14px 22px', borderBottom:'1px solid ' + BORDER, fontWeight:700, fontSize:14, color:'#222', display:'flex', alignItems:'center', gap:8 },
    body: { padding:'22px 22px', display:'flex', flexDirection:'column', gap:16 },
    lbl:  { display:'block', fontSize:11, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:'0.7px', marginBottom:5 },
    inp:  { width:'100%', padding:'9px 12px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:14, fontFamily:'inherit', outline:'none', transition:'border 0.15s' },
    row2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 },
    msgBox: (t) => ({
      padding:'10px 14px', borderRadius:8, fontSize:13,
      background: t==='success' ? '#e6f4ee' : t==='warn' ? '#fffbeb' : '#fde8e8',
      color:      t==='success' ? '#057642' : t==='warn' ? '#92400e' : '#cc1016',
      border: '1px solid ' + (t==='success' ? '#b7dfc9' : t==='warn' ? '#fde68a' : '#f5b8b8'),
    }),
  }

  return (
    <div style={S.page}>


      {/* Hero Card */}
      <div style={S.card}>
        <div style={{ background:'linear-gradient(135deg, #0a66c2 0%, #0077b5 60%, #00a0dc 100%)', height:100 }}/>
        <div style={{ padding:'0 22px 22px', position:'relative' }}>
          <div style={{ position:'relative', display:'inline-block', marginTop:-46 }}>
            <div
              style={{ width:84, height:84, borderRadius:'50%', border:'4px solid #fff', background:'#e8f0fb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:800, color:LI_BLUE, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.15)', cursor:'pointer', position:'relative' }}
              onClick={() => fileRef.current?.click()} title="Profilbild ändern"
            >
              {avatarUrl
                ? <img src={avatarUrl} style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none' }} />
                : initials
              }
              <div
                style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', opacity:0, transition:'opacity 0.15s', borderRadius:'50%' }}
                onMouseOver={e => e.currentTarget.style.opacity='1'}
                onMouseOut={e  => e.currentTarget.style.opacity='0'}
              >
                <span style={{ color:'white', fontSize:11, fontWeight:700 }}>{avatarUploading ? '...' : 'Foto'}</span>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={uploadAvatar}/>
          </div>
          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:20, fontWeight:800, color:'#111' }}>{displayName}</div>
            {profile?.headline && <div style={{ fontSize:14, color:'#555', marginTop:2 }}>{profile.headline}</div>}
            {profile?.company  && <div style={{ fontSize:13, color:'#888', marginTop:1 }}>Unternehmen: {profile.company}</div>}
            <div style={{ fontSize:12, color:'#aaa', marginTop:4 }}>{session.user.email}</div>
          </div>
          {hasLinkedIn && (
            <div style={{ position:'absolute', top:16, right:22, display:'flex', alignItems:'center', gap:7, padding:'6px 12px', borderRadius:16, background:'#e8f0fb', border:'1px solid #bfdbfe' }}>
              <LinkedInIcon size={14} color={LI_BLUE}/>
              <span style={{ fontSize:12, fontWeight:700, color:LI_BLUE }}>LinkedIn verknüpft</span>
            </div>
          )}
        </div>
      </div>

      {/* LinkedIn Sync Banner – immer sichtbar wenn LinkedIn verknüpft */}
      {hasLinkedIn && (
        <div style={{ background:'#f0f7ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'14px 18px', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <LinkedInIcon size={20} color={LI_BLUE}/>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:LI_BLUE }}>LinkedIn-Daten übernehmen</div>
              <div style={{ fontSize:12, color:'#555', marginTop:1 }}>Name, Headline und Profilbild automatisch von LinkedIn importieren</div>
            </div>
          </div>
          <button
            onClick={syncFromLinkedIn}
            disabled={syncing}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:16, border:'none', background: syncing ? '#94a3b8' : LI_BLUE, color:'white', fontSize:12, fontWeight:700, cursor: syncing ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', flexShrink:0, opacity: syncing ? 0.8 : 1 }}
            onMouseOver={e => { if (!syncing) e.currentTarget.style.background = LI_HOVER }}
            onMouseOut={e  => { if (!syncing) e.currentTarget.style.background = LI_BLUE  }}
          >
            <LinkedInIcon size={13} color="white"/>
            {syncing ? 'Importiere...' : 'Von LinkedIn importieren'}
          </button>
        </div>
      )}

      {/* Edit Form */}
      <div style={S.card}>
        <div style={S.hdr}>Profil bearbeiten</div>
        <div style={S.body}>
          {msg && <div style={S.msgBox(msg.type)}>{msg.text}</div>}
          <div style={S.row2}>
            <div>
              <label style={S.lbl}>Vollständiger Name</label>
              <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name:e.target.value}))} placeholder="Max Mustermann" style={S.inp}
                onFocus={e => e.target.style.borderColor=LI_BLUE} onBlur={e => e.target.style.borderColor='#dde3ea'}/>
            </div>
            <div>
              <label style={S.lbl}>Unternehmen</label>
              <input value={form.company} onChange={e => setForm(f => ({...f, company:e.target.value}))} placeholder="Firma GmbH" style={S.inp}
                onFocus={e => e.target.style.borderColor=LI_BLUE} onBlur={e => e.target.style.borderColor='#dde3ea'}/>
            </div>
          </div>
          <div>
            <label style={S.lbl}>Headline / Position</label>
            <input value={form.headline} onChange={e => setForm(f => ({...f, headline:e.target.value}))} placeholder="CEO | Founder | Marketing Manager" style={S.inp}
              onFocus={e => e.target.style.borderColor=LI_BLUE} onBlur={e => e.target.style.borderColor='#dde3ea'}/>
          </div>
          <div>
            <label style={S.lbl}>Über mich</label>
            <textarea value={form.bio} onChange={e => setForm(f => ({...f, bio:e.target.value}))} placeholder="Kurze Beschreibung über dich und deine Arbeit..." rows={4}
              style={{ ...S.inp, resize:'vertical', lineHeight:1.5 }}
              onFocus={e => e.target.style.borderColor=LI_BLUE} onBlur={e => e.target.style.borderColor='#dde3ea'}/>
          </div>
          <div style={{ fontSize:12, color:'#aaa' }}>Klicke auf dein Profilbild um ein neues Foto hochzuladen (max. 2 MB).</div>
          <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'flex-end' }}>
            {saved && <span style={{ fontSize:13, color:'#057642', fontWeight:600 }}>Gespeichert ✓</span>}
            <button onClick={save} disabled={saving}
              style={{ padding:'9px 26px', borderRadius:20, border:'none', background:'linear-gradient(135deg,#0a66c2,#0077b5)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', opacity:saving?0.7:1 }}>
              {saving ? 'Speichern...' : 'Profil speichern'}
            </button>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div style={S.card}>
        <div style={S.hdr}>Account-Informationen</div>
        <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ padding:'10px 14px', background:'#fafafa', borderRadius:8 }}>
            <div style={{ fontSize:11, color:'#aaa', marginBottom:2, textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:700 }}>E-Mail-Adresse</div>
            <div style={{ fontSize:14, fontWeight:600 }}>{session.user.email}</div>
          </div>
          <div style={{ padding:'10px 14px', background:'#fafafa', borderRadius:8 }}>
            <div style={{ fontSize:11, color:'#aaa', marginBottom:2, textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:700 }}>Mitglied seit</div>
            <div style={{ fontSize:14, fontWeight:600 }}>{new Date(session.user.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' })}</div>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:hasLinkedIn?'#e8f5ee':'#fafafa', borderRadius:8, border:'1px solid ' + (hasLinkedIn?'#86efac':BORDER) }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <LinkedInIcon size={16} color={hasLinkedIn?LI_BLUE:'#ccc'}/>
              <div>
                <div style={{ fontSize:11, color:'#aaa', marginBottom:2, textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:700 }}>LinkedIn</div>
                <div style={{ fontSize:14, fontWeight:600, color:hasLinkedIn?'#057642':'#888' }}>
                  {hasLinkedIn
                    ? 'Verknüpft – ' + (liIdentity?.identity_data?.email || liMeta?.email || 'Account verbunden')
                    : 'Nicht verknüpft'}
                </div>
              </div>
            </div>
            {!hasLinkedIn && <a href="/settings" style={{ fontSize:12, color:LI_BLUE, fontWeight:600, textDecoration:'none' }}>Verknüpfen</a>}
          </div>
        </div>
      </div>
    </div>
  )
}
