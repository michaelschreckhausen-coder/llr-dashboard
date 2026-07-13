import PillSelect from '../components/PillSelect'
import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authRedirect } from '../lib/authRedirect'
import { useLang, setLang, t } from '../lib/i18n'
import { useTheme } from '../context/ThemeContext'
import { useEntitlements } from '../hooks/useEntitlements'
import SettingsTabs from '../components/SettingsTabs'
import MfaSetup from '../components/MfaSetup'

const LI_BLUE  = '#0a66c2'
const LI_HOVER = '#004182'

/* ── LinkedIn "in" Logo SVG ── */
function LinkedInIcon({ size = 18, color = 'white' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="4" fill={color} fillOpacity="0.15"/>
      <path d="M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 8.48H3V21h4V8.48ZM13.32 8.48H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91l.04-1.68Z"/>
    </svg>
  )
}

export default function Settings({ session }) {
  const navigate = useNavigate()
  // Plan account-zentrisch aus Entitlements (NICHT aus profile.plan_id-Embed — Legacy, unzuverlässig).
  const { planName: entPlanName, accountStatus: entStatus, isTrial, trialDaysLeft } = useEntitlements()
  const [lang, setUiLang]       = useLang()
  const [profile,  setProfile]  = useState(null)
  const [outputLang, setOutputLang] = useState('auto')

  /* Profil-Stammdaten (aus der früheren /profile-Seite integriert) */
  const [form, setForm]         = useState({ full_name: '', company: '', headline: '', bio: '' })
  const [profSaving, setProfSaving] = useState(false)
  const [profMsg,    setProfMsg]    = useState(null)
  const [avatarUpl,  setAvatarUpl]  = useState(false)
  const [newEmail,   setNewEmail]   = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg,   setEmailMsg]   = useState(null)
  const fileRef = useRef(null)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [pwNew,    setPwNew]    = useState('')
  const [pwConfirm,setPwConfirm]= useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg,    setPwMsg]    = useState(null)

  /* LinkedIn link state */
  const [liIdentities, setLiIdentities] = useState([])
  const [liLinking,    setLiLinking]    = useState(false)
  const [liUnlinking,  setLiUnlinking]  = useState(false)
  const [liMsg,        setLiMsg]        = useState(null)

  /* Daily-Task-Digest Opt-Out (Sprint Daily-Digest, 2026-06-05). UI-Sinn ist
     "eingeschaltet"; DB-Spalte ist opted_out_daily_digest (inverse). Default
     wenn keine Row in user_email_preferences → enabled=true (opt-out-Modell). */
  const [digestEnabled, setDigestEnabled] = useState(true)
  const [digestSaving,  setDigestSaving]  = useState(false)
  const [digestMsg,     setDigestMsg]     = useState(null)

  const { preference, setPreference } = useTheme()

  useEffect(() => { load() }, [])

  // Re-Fetch wenn LinkedIn-Profile-Sync gerade Felder geändert hat
  useEffect(() => {
    const onProfileUpdated = () => { load() }
    window.addEventListener('leadesk:profile-updated', onProfileUpdated)
    window.addEventListener('leadesk_profile_updated', onProfileUpdated)
    return () => {
      window.removeEventListener('leadesk:profile-updated', onProfileUpdated)
      window.removeEventListener('leadesk_profile_updated', onProfileUpdated)
    }
  }, [])

  /* Check for OAuth callback (hash- oder query-param) und fresh-fetch der identities.
     GoTrue redirected nach linkIdentity zurück — der Callback kann success ODER
     failure sein. Wir verifizieren via getUser() ob linkedin_oidc tatsächlich in
     identities[] gelandet ist statt blind "verknüpft" zu zeigen.

     Häufigste Failure-Ursache: Email-Mismatch zwischen LinkedIn-Profil-Email und
     Leadesk-Account-Email — GoTrue rejected den Link silent (kein expliziter
     error-Param in der Redirect-URL). */
  useEffect(() => {
    const hash = window.location.hash || ''
    const search = window.location.search || ''
    const params = new URLSearchParams(search)
    // GoTrue-Error-Params bei OAuth-Failure
    const oauthError = params.get('error') || params.get('error_description')
    const isCallback =
      hash.includes('access_token') ||
      hash.includes('li_linked') ||
      hash.includes('identity_link') ||
      search.includes('linked=success') ||
      search.includes('linked=true') ||
      oauthError
    if (!isCallback) return

    window.history.replaceState(null, '', window.location.pathname)

    // IMMER zuerst per Server-Roundtrip verifizieren ob die Identity da ist.
    // Identity-Vorhandensein gewinnt gegen einen stale `?error=`-Param —
    // sonst zeigt eine alte Failed-Callback-URL den Banner falsch, obwohl
    // die Verknüpfung inzwischen (z.B. via DB-Identity-Transfer oder
    // zweitem Versuch) funktioniert hat.
    ;(async () => {
      try {
        await supabase.auth.refreshSession()
        const { data: userData } = await supabase.auth.getUser()
        const identities = userData?.user?.identities || []
        const liIdent = identities.find(id => id.provider === 'linkedin_oidc')

        if (liIdent) {
          // Identity da → Success. oauthError-Param ignorieren (stale URL)
          setLiIdentities([liIdent])
          setLiMsg({ type: 'success', text: 'LinkedIn erfolgreich verknüpft!' })
        } else if (oauthError) {
          // Identity fehlt UND expliziter GoTrue-Error → Error mit Reason
          setLiMsg({
            type: 'error',
            text: 'LinkedIn-Verknüpfung fehlgeschlagen: ' + decodeURIComponent(oauthError),
          })
        } else {
          // Identity fehlt + kein expliziter Error → Silent-Failure.
          // Häufigster Grund: Email-Mismatch zwischen LinkedIn-Profil-Email
          // und Leadesk-Account. GoTrue rejected ohne expliziten error-Param.
          setLiMsg({
            type: 'error',
            text: 'LinkedIn-Verknüpfung konnte nicht abgeschlossen werden. ' +
                  'Häufigster Grund: die Email-Adresse deines LinkedIn-Profils ' +
                  'unterscheidet sich von deiner Leadesk-Account-Email. ' +
                  'Bitte Account-Settings überprüfen oder Support kontaktieren.',
          })
        }

        // Profile-Daten unabhängig nachladen
        const { data: prof } = await supabase
          .from('profiles').select('*, plans(name, daily_limit),default_ai_model')
          .eq('id', session.user.id).single()
        setProfile(prof)
        setOutputLang(prof?.output_language || 'auto')
      } catch (e) {
        setLiMsg({
          type: 'error',
          text: 'Verknüpfung-Status konnte nicht verifiziert werden: ' + (e?.message || String(e)),
        })
      }
    })()
  }, [])

  async function load() {
    const { data } = await supabase
      .from('profiles').select('*, plans(name, daily_limit),default_ai_model').eq('id', session.user.id).single()
    setProfile(data)
    setOutputLang(data?.output_language || 'auto')
    if (data) setForm({ full_name: data.full_name || '', company: data.company || '', headline: data.headline || '', bio: data.bio || '' })

    /* Load linked OAuth identities — IMMER frisch via getUser, nicht aus dem stale session-Prop.
       Nach linkIdentity-Redirect ist session.user.identities noch von vor dem Link. */
    const { data: userData } = await supabase.auth.getUser()
    const identities = userData?.user?.identities || []
    setLiIdentities(identities.filter(id => id.provider === 'linkedin_oidc'))

    /* Daily-Digest-Opt-Out laden. Falls Row fehlt → enabled=true (default). */
    const { data: prefs } = await supabase
      .from('user_email_preferences')
      .select('opted_out_daily_digest')
      .eq('user_id', session.user.id)
      .maybeSingle()
    setDigestEnabled(!prefs?.opted_out_daily_digest)
  }

  async function toggleDailyDigest(nextEnabled) {
    setDigestSaving(true)
    setDigestMsg(null)
    const { error } = await supabase
      .from('user_email_preferences')
      .upsert(
        { user_id: session.user.id, opted_out_daily_digest: !nextEnabled, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    setDigestSaving(false)
    if (error) {
      setDigestMsg({ type: 'error', text: error.message })
      // UI nicht persistieren bei Fehler — Toggle bleibt visuell beim letzten erfolgreichen Stand
      return
    }
    setDigestEnabled(nextEnabled)
    setDigestMsg({ type: 'success', text: nextEnabled
      ? 'Tägliche Aufgaben-Mail aktiviert'
      : 'Tägliche Aufgaben-Mail deaktiviert'
    })
    setTimeout(() => setDigestMsg(null), 3000)
  }

  const isLinkedInLinked = liIdentities.length > 0
  const liIdentity = liIdentities[0]

  /* ── Link LinkedIn to existing account ── */
  async function linkLinkedIn() {
    setLiLinking(true)
    setLiMsg(null)
    const { error } = await supabase.auth.linkIdentity({
      provider: 'linkedin_oidc',
      options: {
        redirectTo: authRedirect('/settings/profil?linked=success'),
        scopes: 'openid profile email',
      },
    })
    if (error) {
      setLiMsg({ type: 'error', text: error.message })
      setLiLinking(false)
    }
    // On success: browser redirects to LinkedIn, then back — liLinking stays true
  }

  /* ── Unlink LinkedIn from account ── */
  async function unlinkLinkedIn() {
    if (!liIdentity) return
    if (!confirm('LinkedIn-Verknüpfung wirklich entfernen?')) return
    setLiUnlinking(true)
    setLiMsg(null)
    const { error } = await supabase.auth.unlinkIdentity(liIdentity)
    setLiUnlinking(false)
    if (error) {
      setLiMsg({ type: 'error', text: error.message })
    } else {
      setLiMsg({ type: 'success', text: 'LinkedIn-Verknüpfung entfernt.' })
      setLiIdentities([])
    }
  }

  async function saveSettings() {
    setSaving(true)
    await supabase.from('profiles').update({ output_language: outputLang }).eq('id', session.user.id)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  /* ── Profil-Stammdaten speichern (aus /profile integriert) ── */
  async function saveProfile() {
    setProfSaving(true); setProfMsg(null)
    const { error } = await supabase.from('profiles')
      .update({ full_name: form.full_name, company: form.company, headline: form.headline, bio: form.bio, updated_at: new Date().toISOString() })
      .eq('id', session.user.id)
    if (error) { setProfMsg({ type:'error', text: error.message }) }
    else {
      // Auth-Metadaten synchronisieren, damit Header-Name sofort aktuell ist
      await supabase.auth.updateUser({ data: { full_name: form.full_name } })
      setProfile(p => ({ ...(p || {}), ...form }))
      setProfMsg({ type:'success', text: 'Profil gespeichert' })
      window.dispatchEvent(new CustomEvent('leadesk_profile_updated'))
      setTimeout(() => setProfMsg(null), 3000)
    }
    setProfSaving(false)
  }

  /* ── Avatar-Upload via Supabase-Storage-Client (env-sicher, kein hardcoded URL) ── */
  async function uploadAvatar(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 3 * 1024 * 1024) { setProfMsg({ type:'error', text:'Bild zu groß (max. 3 MB)' }); return }
    setAvatarUpl(true); setProfMsg(null)
    try {
      const ext = file.name.split('.').pop()
      const path = `${session.user.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) { setProfMsg({ type:'error', text: upErr.message }); setAvatarUpl(false); return }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id)
      setProfile(p => ({ ...(p || {}), avatar_url: publicUrl }))
      setProfMsg({ type:'success', text: 'Profilbild aktualisiert' })
      window.dispatchEvent(new CustomEvent('leadesk_profile_updated'))
      setTimeout(() => setProfMsg(null), 3000)
    } catch (err) { setProfMsg({ type:'error', text: err.message }) }
    setAvatarUpl(false)
    if (e?.target) e.target.value = ''
  }

  /* ── E-Mail-Adresse ändern (aus /profile integriert) ── */
  async function changeEmail() {
    if (!newEmail || !newEmail.includes('@')) { setEmailMsg({ type:'error', text:'Gültige E-Mail eingeben' }); return }
    setEmailSaving(true); setEmailMsg(null)
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) setEmailMsg({ type:'error', text: error.message })
    else { setEmailMsg({ type:'success', text:'Bestätigungsmail gesendet — bitte neue E-Mail verifizieren' }); setNewEmail('') }
    setEmailSaving(false)
  }

  async function changePassword() {
    setPwMsg(null)
    if (!pwNew || pwNew.length < 8) { setPwMsg({ type:'error', text: t('settings_pw_short') }); return }
    if (pwNew !== pwConfirm) { setPwMsg({ type:'error', text: t('settings_pw_mismatch') }); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwNew })
    setPwSaving(false)
    if (error) { setPwMsg({ type:'error', text: error.message }) }
    else { setPwMsg({ type:'success', text: t('settings_pw_ok') }); setPwNew(''); setPwConfirm('') }
  }

  function handleUiLang(l) { setLang(l); setUiLang(l) }

  /* ── Shared styles ── */
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:13, boxSizing:'border-box', fontFamily:'inherit' }
  const lbl = { display:'block', fontSize:12, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }
  const box = { background:'var(--surface)', borderRadius:14, border:'1px solid #E4E7EC', marginBottom:16 }
  const hdr = { padding:'14px 20px', borderBottom:'1px solid #EEF1F5', fontWeight:700, fontSize:14 }
  const bdy = { padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'8px 0 40px' }}>
      <SettingsTabs />

      {/* ── Account Info ── */}
      <div style={box}>
        <div style={hdr}>{t('settings_account')}</div>
        <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:12 }}>
          {/* Avatar + Name Card — Avatar ist klickbar zum Hochladen (aus /profile integriert) */}
          <div style={{ display:'flex', alignItems:'center', gap:16, padding:'12px 14px', background:'#fafafa', borderRadius:8 }}>
            <div
              onClick={() => fileRef.current?.click()}
              title="Profilbild ändern"
              style={{
                position:'relative', width:56, height:56, borderRadius:'50%', overflow:'hidden', flexShrink:0,
                background: profile?.avatar_url ? 'transparent' : 'linear-gradient(135deg,#3b82f6,#6366f1)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'#fff', fontSize:20, fontWeight:600, cursor:'pointer',
              }}>
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                (profile?.full_name || session.user.email || '?').slice(0,1).toUpperCase()
              )}
              <div
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}
                style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', opacity:0, transition:'opacity 0.2s', fontSize:10, fontWeight:700 }}>
                {avatarUpl ? '⏳' : 'Ändern'}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={uploadAvatar} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:15, fontWeight:600, color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {profile?.full_name || session.user.email}
              </div>
              <div style={{ fontSize:12, color:'#888', marginTop:2 }}>
                {profile?.linkedin_data_last_synced_at
                  ? 'LinkedIn-Daten zuletzt synct: ' + new Date(profile.linkedin_data_last_synced_at).toLocaleString('de-DE')
                  : 'Klicke auf das Bild, um dein Profilbild zu ändern'}
              </div>
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#fafafa', borderRadius:8 }}>
            <div>
              <div style={{ fontSize:12, color:'#888', marginBottom:2 }}>{t('settings_email')}</div>
              <div style={{ fontSize:14, fontWeight:600 }}>{session.user.email}</div>
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#fafafa', borderRadius:8 }}>
            <div>
              <div style={{ fontSize:12, color:'#888', marginBottom:2 }}>{t('settings_plan')}</div>
              <div style={{ fontSize:14, fontWeight:600 }}>{entPlanName || 'Free'}</div>
            </div>
            <div style={{ fontSize:12, color:'#888' }}>
              {isTrial && trialDaysLeft != null
                ? `Trial · ${trialDaysLeft} Tag${trialDaysLeft === 1 ? '' : 'e'}`
                : (entStatus ? (entStatus === 'active' ? 'aktiv' : entStatus) : '')}
            </div>
          </div>
        </div>
      </div>

      {/* ── Persönliche Daten (aus /profile integriert) ── */}
      <div style={box}>
        <div style={hdr}>Persönliche Daten</div>
        <div style={bdy}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <label style={lbl}>Vollständiger Name</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Max Mustermann" style={inp}/>
            </div>
            <div>
              <label style={lbl}>Unternehmen</label>
              <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Firma GmbH" style={inp}/>
            </div>
          </div>
          <div>
            <label style={lbl}>Position / Headline</label>
            <input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} placeholder="CEO | Founder | Sales Manager" style={inp}/>
          </div>
          {profMsg && (
            <div style={{ padding:'10px 14px', borderRadius:8, fontSize:13, background: profMsg.type==='success' ? '#e6f4ee' : '#fde8e8', color: profMsg.type==='success' ? '#057642' : '#cc1016', border:`1px solid ${profMsg.type==='success' ? '#b7dfcb' : '#f5b8b8'}` }}>{profMsg.text}</div>
          )}
          <button onClick={saveProfile} disabled={profSaving}
            style={{ padding:'9px 22px', borderRadius:20, background:'linear-gradient(135deg,#0a66c2,#0077b5)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', alignSelf:'flex-start', opacity: profSaving ? 0.6 : 1 }}>
            {profSaving ? 'Speichern…' : 'Profil speichern'}
          </button>
        </div>
      </div>

      {/* ── E-Mail ändern (aus /profile integriert) ── */}
      <div style={box}>
        <div style={hdr}>E-Mail-Adresse ändern</div>
        <div style={bdy}>
          <div style={{ fontSize:12, color:'#888', lineHeight:1.5 }}>
            Aktuelle E-Mail: <strong>{session.user.email}</strong>. Nach der Änderung erhältst du eine Bestätigungsmail an die neue Adresse.
          </div>
          <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:200 }}>
              <label style={lbl}>Neue E-Mail-Adresse</label>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="neue@email.de" style={inp}
                onKeyDown={e => e.key === 'Enter' && changeEmail()}/>
            </div>
            <button onClick={changeEmail} disabled={emailSaving || !newEmail}
              style={{ padding:'9px 22px', borderRadius:20, background:'linear-gradient(135deg,#0a66c2,#0077b5)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', opacity:(emailSaving || !newEmail) ? 0.5 : 1 }}>
              {emailSaving ? '…' : 'E-Mail ändern'}
            </button>
          </div>
          {emailMsg && (
            <div style={{ padding:'10px 14px', borderRadius:8, fontSize:13, background: emailMsg.type==='success' ? '#e6f4ee' : '#fde8e8', color: emailMsg.type==='success' ? '#057642' : '#cc1016', border:`1px solid ${emailMsg.type==='success' ? '#b7dfcb' : '#f5b8b8'}` }}>{emailMsg.text}</div>
          )}
        </div>
      </div>

      {/* ── LinkedIn → zentraler Hub (Phase 2: aus Profil ausgelagert) ── */}
      <div style={box}>
        <div style={hdr}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <LinkedInIcon size={17} color={LI_BLUE} />
            LinkedIn-Verbindungen
          </div>
        </div>
        <div style={bdy}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <div style={{ fontSize:13, color:'#555', lineHeight:1.6 }}>
              Anmelden, Veröffentlichen und Automatisieren sind jetzt im eigenen Tab <strong>„LinkedIn"</strong> gebündelt — dort entscheidest du je Funktion, was du verbinden möchtest.
            </div>
            <button onClick={() => navigate('/settings/linkedin')}
              style={{ padding:'9px 16px', borderRadius:10, border:'none', background: LI_BLUE, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
              Zu den LinkedIn-Verbindungen →
            </button>
          </div>
        </div>
      </div>

      {/* ── E-Mail-Benachrichtigungen ── */}
      <div style={box}>
        <div style={hdr}>E-Mail-Benachrichtigungen</div>
        <div style={bdy}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#0f172a', marginBottom:4 }}>
                Tägliches Aufgaben-Digest
              </div>
              <div style={{ fontSize:12, color:'#888', lineHeight:1.5 }}>
                Jeden Morgen um 7 Uhr eine E-Mail mit deinen überfälligen + heute fälligen Aufgaben. Skip wenn keine Aufgabe offen.
              </div>
            </div>
            {/* Switch-Toggle */}
            <button
              type="button"
              onClick={() => toggleDailyDigest(!digestEnabled)}
              disabled={digestSaving}
              aria-pressed={digestEnabled}
              style={{
                position:'relative', width:46, height:26, borderRadius:13,
                border:'none', flexShrink:0,
                background: digestEnabled ? LI_BLUE : '#cbd5e1',
                cursor: digestSaving ? 'wait' : 'pointer',
                transition:'background 0.15s',
                opacity: digestSaving ? 0.6 : 1,
                padding:0,
              }}
            >
              <span style={{
                position:'absolute', top:3, left: digestEnabled ? 23 : 3,
                width:20, height:20, borderRadius:'50%', background:'#fff',
                boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
                transition:'left 0.15s',
              }}/>
            </button>
          </div>
          {digestMsg && (
            <div style={{
              padding:'10px 14px', borderRadius:8, fontSize:13,
              background: digestMsg.type === 'success' ? '#e6f4ee' : '#fde8e8',
              color:      digestMsg.type === 'success' ? '#057642'  : '#cc1016',
              border:     `1px solid ${digestMsg.type === 'success' ? '#b7dfc9' : '#f5b8b8'}`,
            }}>{digestMsg.text}</div>
          )}
        </div>
      </div>

      {/* ── Passwort ändern ── */}
      <div style={box}>
        <div style={hdr}>{t('settings_pw')}</div>
        <div style={bdy}>
          <div>
            <label style={lbl}>{t('settings_pw_new')}</label>
            <input type="password" value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder={t('settings_pw_min')} style={inp}/>
          </div>
          <div>
            <label style={lbl}>{t('settings_pw_confirm')}</label>
            <input type="password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} placeholder={t('settings_pw_repeat')} style={inp}/>
          </div>
          {pwMsg && (
            <div style={{ padding:'10px 14px', borderRadius:8, fontSize:13, background: pwMsg.type==='success' ? '#e6f4ee' : '#fde8e8', color: pwMsg.type==='success' ? '#057642' : '#cc1016', border: `1px solid ${pwMsg.type==='success' ? '#b7dfcb' : '#f5b8b8'}` }}>
              {pwMsg.text}
            </div>
          )}
          <button onClick={changePassword} disabled={pwSaving||!pwNew||!pwConfirm}
            style={{ padding:'9px 22px', borderRadius:20, background:'linear-gradient(135deg,#0a66c2,#0077b5)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', alignSelf:'flex-start', opacity:(!pwNew||!pwConfirm)?0.5:1 }}>
            {pwSaving ? t('settings_pw_saving') : t('settings_pw_btn')}
          </button>
        </div>
      </div>

      {/* ── Zwei-Faktor-Authentifizierung (TOTP) ── */}
      <MfaSetup />

      {/* ── UI Language ── */}
      <div style={box}>
        <div style={hdr}>{t('settings_ui_lang')}</div>
        <div style={{ padding:'18px 20px' }}>
          <label style={lbl}>{t('settings_ui_lang_label')}</label>
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            {[['de','Deutsch'],['en','English']].map(([val, label]) => (
              <button key={val} onClick={() => handleUiLang(val)}
                style={{ flex:1, padding:'12px 16px', borderRadius:10, border:`2px solid ${lang===val ? LI_BLUE : '#dde3ea'}`, background:lang===val ? LI_BLUE : '#fff', color:lang===val ? '#fff' : '#555', fontWeight:lang===val?700:500, fontSize:15, cursor:'pointer', transition:'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize:12, color:'#aaa', marginTop:8 }}>{t('settings_ui_hint')}</div>
        </div>
      </div>

      {/* ── Theme / Darstellung ── */}
      <div style={box}>
        <div style={hdr}>Darstellung</div>
        <div style={{ padding:'18px 20px' }}>
          <label style={lbl}>Farbmodus</label>
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            {[['system','System'],['light','Hell'],['dark','Dunkel']].map(([val, label]) => (
              <button key={val} onClick={() => setPreference(val)}
                style={{ flex:1, padding:'12px 16px', borderRadius:10, border:`2px solid ${preference===val ? LI_BLUE : '#dde3ea'}`, background:preference===val ? LI_BLUE : '#fff', color:preference===val ? '#fff' : '#555', fontWeight:preference===val?700:500, fontSize:15, cursor:'pointer', transition:'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize:12, color:'#aaa', marginTop:8 }}>System übernimmt die OS-Einstellung deines Geräts. Dark-Mode reduziert Helligkeit in dunklen Umgebungen.</div>
        </div>
      </div>

      {/* ── Output Language ── */}
      <div style={box}>
        <div style={hdr}>{t('settings_output_lang')}</div>
        <div style={{ padding:'18px 20px' }}>
          <label style={lbl}>{t('settings_output_lang_label')}</label>
          <PillSelect value={outputLang} onChange={setOutputLang} neutral options={[{ value: 'auto', label: t('settings_output_auto') }, { value: 'de', label: t('settings_output_de') }, { value: 'en', label: t('settings_output_en') }]} buttonStyle={{ minWidth: 140 }} />
          <div style={{ fontSize:12, color:'#aaa', marginTop:6 }}>{t('settings_output_hint')}</div>

        </div>
      </div>

      {/* ── Save ── */}
      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12 }}>
        {saved && <span style={{ color:'#057642', fontSize:13, fontWeight:600 }}>{t('settings_saved')}</span>}
        <button onClick={saveSettings} disabled={saving}
          style={{ padding:'9px 24px', borderRadius:20, background:'linear-gradient(135deg,#0a66c2,#0077b5)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          {saving ? t('settings_saving') : t('settings_save')}
        </button>
      </div>
    </div>
  )
}
