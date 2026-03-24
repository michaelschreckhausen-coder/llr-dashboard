import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang, setLang, t } from '../lib/i18n'

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

export default function Settings({ session, sub, plan }) {
  const [lang, setUiLang]       = useLang()
  const [profile,  setProfile]  = useState(null)
  const [outputLang, setOutputLang] = useState('auto')
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

  useEffect(() => { load() }, [])

  /* Check for OAuth callback message in URL hash (#li_linked) */
  useEffect(() => {
    if (window.location.hash.includes('li_linked')) {
      setLiMsg({ type: 'success', text: '✅ LinkedIn erfolgreich verknüpft!' })
      window.history.replaceState(null, '', window.location.pathname)
      load()
    }
  }, [])

  async function load() {
    const { data } = await supabase
      .from('profiles').select('*, plans(name, daily_limit)').eq('id', session.user.id).single()
    setProfile(data)
    setOutputLang(data?.output_language || 'auto')

    /* Load linked OAuth identities */
    const { data: { user } } = await supabase.auth.getUser()
    const identities = user?.identities || []
    setLiIdentities(identities.filter(id => id.provider === 'linkedin_oidc'))
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
        redirectTo: window.location.origin + '/settings',
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
      setLiMsg({ type: 'success', text: '✅ LinkedIn-Verknüpfung entfernt.' })
      setLiIdentities([])
    }
  }

  async function saveSettings() {
    setSaving(true)
    await supabase.from('profiles').update({ output_language: outputLang }).eq('id', session.user.id)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
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
  const box = { background:'#fff', borderRadius:12, border:'1px solid #e8ecf0', marginBottom:16 }
  const hdr = { padding:'14px 20px', borderBottom:'1px solid #f0f0f0', fontWeight:700, fontSize:14 }
  const bdy = { padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }

  return (
    <div style={{ maxWidth:680 }}>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>{t('settings_title')}</h1>
        <div style={{ color:'#888', fontSize:14 }}>{t('settings_sub')}</div>
      </div>

      {/* ── Abo and Plan ── */}
      {sub && (
        <div style={{ background: sub.plan_id === 'pro' || sub.plan_id === 'enterprise' ? '#F5F3FF' : sub.plan_id === 'starter' ? '#EFF6FF' : '#FFF7ED', borderRadius: 14, border: '1.5px solid ' + (sub.plan_id === 'pro' || sub.plan_id === 'enterprise' ? '#DDD6FE' : sub.plan_id === 'starter' ? '#BFDBFE' : '#FDE68A'), marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: plan ? plan.color : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{plan ? plan.name : 'Free'} Plan</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {sub.max_leads === -1 ? 'Unbegrenzte Leads' : sub.max_leads + ' Leads max'} · {sub.ai_access ? 'KI-Zugang inklusive' : 'Kein KI-Zugang'}
                </div>
              </div>
            </div>
            <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: sub.status === 'active' || sub.status === 'trialing' ? '#DCFCE7' : '#FEE2E2', color: sub.status === 'active' || sub.status === 'trialing' ? '#065F46' : '#991B1B' }}>
              {sub.status === 'active' ? 'Aktiv' : sub.status === 'trialing' ? 'Trial' : sub.status === 'cancelled' ? 'Gekuendigt' : 'Abgelaufen'}
            </span>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['Leads', sub.max_leads === -1 ? 'Unbegrenzt' : 'bis ' + sub.max_leads],['Listen', sub.max_lists === -1 ? 'Unbegrenzt' : 'bis ' + sub.max_lists],['KI-Tools', sub.ai_access ? 'Inklusive' : 'Nicht verfuegbar']].map(function(item) {
              return React.createElement('div', { key: item[0], style: { padding: '7px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.07)', minWidth: 90 } },
                React.createElement('div', { style: { fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 } }, item[0]),
                React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: '#0F172A' } }, item[1])
              )
            })}
          </div>
          {(sub.plan_id === 'free' || sub.plan_id === 'starter') && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(255,255,255,0.4)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{sub.plan_id === 'free' ? 'Upgrade auf Starter oder Pro' : 'Upgrade auf Pro'}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{sub.plan_id === 'free' ? 'Mehr Leads, KI-Texte, unbegrenzte Listen' : 'Unbegrenzte Leads und voller KI-Zugang'}</div>
              </div>
              <a href="https://www.wix.com/upgrade/lead-radar" target="_blank" rel="noreferrer"
                style={{ padding: '9px 18px', borderRadius: 999, background: 'linear-gradient(135deg,#F97316,#EA6C0A)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 2px 8px rgba(249,115,22,0.35)' }}>
                Jetzt upgraden
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── Account Info ── */}
      <div style={box}>
        <div style={hdr}>{t('settings_account')}</div>
        <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#fafafa', borderRadius:8 }}>
            <div>
              <div style={{ fontSize:12, color:'#888', marginBottom:2 }}>{t('settings_email')}</div>
              <div style={{ fontSize:14, fontWeight:600 }}>{session.user.email}</div>
            </div>
          </div>
          {profile && (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#fafafa', borderRadius:8 }}>
              <div>
                <div style={{ fontSize:12, color:'#888', marginBottom:2 }}>{t('settings_plan')}</div>
                <div style={{ fontSize:14, fontWeight:600 }}>{profile.plans?.name || 'Free'}</div>
              </div>
              <div style={{ fontSize:12, color:'#888' }}>
                {profile.plans?.daily_limit === -1 ? t('settings_unlimited') : `${profile.plans?.daily_limit} ${t('settings_per_day')}`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── LinkedIn Verknüpfung ── */}
      <div style={box}>
        <div style={hdr}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <LinkedInIcon size={17} color={LI_BLUE} />
            LinkedIn-Konto verknüpfen
          </div>
        </div>
        <div style={bdy}>

          {/* Status card */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 16px', borderRadius:10,
            background: isLinkedInLinked ? '#e8f5ee' : '#f3f2ef',
            border: `1.5px solid ${isLinkedInLinked ? '#86efac' : '#e0e0e0'}`,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {/* LinkedIn logo circle */}
              <div style={{ width:40, height:40, borderRadius:'50%', background: isLinkedInLinked ? LI_BLUE : '#c9cdd2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <LinkedInIcon size={20} color="white" />
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color: isLinkedInLinked ? '#057642' : '#555' }}>
                  {isLinkedInLinked ? '✓ Verknüpft' : 'Nicht verknüpft'}
                </div>
                <div style={{ fontSize:12, color:'#888', marginTop:1 }}>
                  {isLinkedInLinked
                    ? (liIdentity?.identity_data?.email || liIdentity?.identity_data?.name || 'LinkedIn-Account verbunden')
                    : 'Verbinde dein LinkedIn-Konto für schnelleres Einloggen'}
                </div>
              </div>
            </div>

            {/* Action button */}
            {isLinkedInLinked ? (
              <button
                onClick={unlinkLinkedIn}
                disabled={liUnlinking}
                style={{
                  padding:'7px 16px', borderRadius:16, fontSize:12, fontWeight:600, cursor:'pointer',
                  border:'1.5px solid #fca5a5', background:'transparent', color:'#cc1016',
                  opacity: liUnlinking ? 0.6 : 1, whiteSpace:'nowrap', flexShrink:0,
                }}>
                {liUnlinking ? '⏳' : '🔗 Trennen'}
              </button>
            ) : (
              <button
                onClick={linkLinkedIn}
                disabled={liLinking}
                style={{
                  display:'flex', alignItems:'center', gap:7,
                  padding:'8px 16px', borderRadius:16, fontSize:12, fontWeight:700, cursor:'pointer',
                  border:'none', background: LI_BLUE, color:'white',
                  opacity: liLinking ? 0.7 : 1, whiteSpace:'nowrap', flexShrink:0,
                  transition:'background 0.2s',
                }}
                onMouseOver={e => e.currentTarget.style.background = LI_HOVER}
                onMouseOut={e => e.currentTarget.style.background = LI_BLUE}
              >
                <LinkedInIcon size={14} color="white" />
                {liLinking ? 'Weiterleitung…' : 'LinkedIn verknüpfen'}
              </button>
            )}
          </div>

          {/* Info text */}
          <div style={{ fontSize:12, color:'#888', lineHeight:1.6, padding:'0 2px' }}>
            {isLinkedInLinked
              ? 'Du kannst dich jetzt sowohl mit E-Mail/Passwort als auch mit LinkedIn anmelden. Deine Daten bleiben unverändert.'
              : 'Verknüpfe dein LinkedIn-Konto, um dich zukünftig mit einem Klick anzumelden — ohne Passwort eingeben zu müssen.'}
          </div>

          {/* Status message */}
          {liMsg && (
            <div style={{
              padding:'10px 14px', borderRadius:8, fontSize:13,
              background: liMsg.type === 'success' ? '#e6f4ee' : '#fde8e8',
              color:      liMsg.type === 'success' ? '#057642'  : '#cc1016',
              border:     `1px solid ${liMsg.type === 'success' ? '#b7dfc9' : '#f5b8b8'}`,
            }}>{liMsg.text}</div>
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

      {/* ── UI Language ── */}
      <div style={box}>
        <div style={hdr}>{t('settings_ui_lang')}</div>
        <div style={{ padding:'18px 20px' }}>
          <label style={lbl}>{t('settings_ui_lang_label')}</label>
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            {[['de','🇩🇪 Deutsch'],['en','🇬🇧 English']].map(([val, label]) => (
              <button key={val} onClick={() => handleUiLang(val)}
                style={{ flex:1, padding:'12px 16px', borderRadius:10, border:`2px solid ${lang===val ? LI_BLUE : '#dde3ea'}`, background:lang===val ? LI_BLUE : '#fff', color:lang===val ? '#fff' : '#555', fontWeight:lang===val?700:500, fontSize:15, cursor:'pointer', transition:'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize:12, color:'#aaa', marginTop:8 }}>{t('settings_ui_hint')}</div>
        </div>
      </div>

      {/* ── Output Language ── */}
      <div style={box}>
        <div style={hdr}>{t('settings_output_lang')}</div>
        <div style={{ padding:'18px 20px' }}>
          <label style={lbl}>{t('settings_output_lang_label')}</label>
          <select value={outputLang} onChange={e=>setOutputLang(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            <option value="auto">{t('settings_output_auto')}</option>
            <option value="de">{t('settings_output_de')}</option>
            <option value="en">{t('settings_output_en')}</option>
          </select>
          <div style={{ fontSize:12, color:'#aaa', marginTop:6 }}>{t('settings_output_hint')}</div>
        </div>
      </div>

      {/* ── Brand Voice hint ── */}
      <div style={{ background:'#f0f7ff', borderRadius:12, border:'1px solid #c6daf8', marginBottom:16, padding:'16px 20px', display:'flex', alignItems:'flex-start', gap:12 }}>
        <div style={{ fontSize:24, flexShrink:0 }}>🎙️</div>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:LI_BLUE, marginBottom:4 }}>{t('settings_bv_title')}</div>
          <div style={{ fontSize:13, color:'#555', lineHeight:1.5 }}>{t('settings_bv_text')}</div>
          <a href="/brand-voice" style={{ display:'inline-block', marginTop:8, fontSize:13, fontWeight:600, color:LI_BLUE, textDecoration:'none' }}>
            {t('settings_bv_link')}
          </a>
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
