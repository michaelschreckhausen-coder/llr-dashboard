impor
  useEffect(() => {
    async function loadRules() {
      const { data } = await supabase.from('lead_scoring_rules').select('*').eq('user_id', session.user.id).order('created_at')
      setScoringRules(data || [])
    }
    loadRules()
  }, [session.user.id])

  async function addRule() {
    if (!newRule.name?.trim()) return
    setSavingRule(true)
    await supabase.from('lead_scoring_rules').insert({ ...newRule, user_id: session.user.id })
    const { data } = await supabase.from('lead_scoring_rules').select('*').eq('user_id', session.user.id).order('created_at')
    setScoringRules(data || [])
    setNewRule({ name:'', field:'headline', operator:'contains', value:'', score_delta:10 })
    setSavingRule(false)
  }

  async function toggleRule(id, is_active) {
    await supabase.from('lead_scoring_rules').update({ is_active: !is_active }).eq('id', id)
    setScoringRules(r => r.map(x => x.id === id ? { ...x, is_active: !is_active } : x))
  }

  async function deleteRule(id) {
    await supabase.from('lead_scoring_rules').delete().eq('id', id)
    setScoringRules(r => r.filter(x => x.id !== id))
  }

t React, { useEffect, useState } from 'react'
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
  const [scoringRules, setScoringRules] = useState([])
  const [newRule, setNewRule] = useState({ name:'', field:'headline', operator:'contains', value:'', score_delta:10 })
  const [savingRule, setSavingRule] = useState(false)
  const [showScoring, setShowScoring] = useState(false)

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
      {/* ── Abo-Plan ── */}
      <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(15,23,42,0.05)', overflow:'hidden' }}>
        <div style={{ padding:'16px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700, fontSize:15, color:'#0F172A' }}>Abo & Plan</div>
          {sub && sub.period_end && (
            <span style={{ fontSize:11, color:'#94A3B8' }}>
              {'gültig bis ' + new Date(sub.period_end).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' })}
            </span>
          )}
        </div>

        {/* Plan-Vergleich */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:0 }}>
          {[
            {
              id:'free', name:'LinkedIn Suite Free', price:'0€', period:'/Monat',
              color:'#64748B', bg:'#F8FAFC', border:'#E2E8F0',
              features:[
                { label:'Bis zu 50 Leads', ok:true },
                { label:'10 Listen', ok:true },
                { label:'Pipeline', ok:false },
                { label:'Brand Voice', ok:false },
                { label:'Reports', ok:false },
                { label:'KI-Features', ok:false },
              ]
            },
            {
              id:'starter', name:'LinkedIn Suite Basic', price:'29€', period:'/Monat',
              color:'#0A66C2', bg:'#EFF6FF', border:'#BFDBFE', popular:true,
              wixUrl:'https://www.linkedin-consulting.com/pricing-plans/plans-pricing',
              features:[
                { label:'Bis zu 200 Leads', ok:true },
                { label:'20 Listen', ok:true },
                { label:'Pipeline', ok:true },
                { label:'Brand Voice', ok:true },
                { label:'Reports', ok:false },
                { label:'KI-Features', ok:false },
              ]
            },
            {
              id:'pro', name:'LinkedIn Suite Pro', price:'79€', period:'/Monat',
              color:'#8B5CF6', bg:'#F5F3FF', border:'#DDD6FE',
              wixUrl:'https://www.linkedin-consulting.com/pricing-plans/plans-pricing',
              features:[
                { label:'Bis zu 1000 Leads', ok:true },
                { label:'50 Listen', ok:true },
                { label:'Pipeline', ok:true },
                { label:'Brand Voice + KI', ok:true },
                { label:'Reports & Analytics', ok:true },
                { label:'KI-Features', ok:true },
              ]
            },
          ].map((p, i) => {
            const isCurrent = sub && sub.plan_id === p.id
            return (
              <div key={p.id} style={{
                padding:'24px 20px',
                borderRight: i < 2 ? '1px solid #E2E8F0' : 'none',
                background: isCurrent ? p.bg : '#fff',
                position:'relative',
                transition:'all 0.2s',
              }}>
                {p.popular && (
                  <div style={{ position:'absolute', top:12, right:12, fontSize:9, fontWeight:800, background:p.color, color:'#fff', padding:'2px 8px', borderRadius:999 }}>BELIEBT</div>
                )}
                {isCurrent && (
                  <div style={{ position:'absolute', top:12, left:12, fontSize:9, fontWeight:800, background:p.color, color:'#fff', padding:'2px 8px', borderRadius:999 }}>AKTUELL</div>
                )}

                <div style={{ marginBottom:16, marginTop:isCurrent||p.popular?16:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:p.color, marginBottom:4 }}>{p.name}</div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                    <span style={{ fontSize:28, fontWeight:900, color:'#0F172A' }}>{p.price}</span>
                    <span style={{ fontSize:12, color:'#94A3B8' }}>{p.period}</span>
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                  {p.features.map((f, fi) => (
                    <div key={fi} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color: f.ok ? '#0F172A' : '#CBD5E1' }}>
                      <span style={{ fontSize:14 }}>{f.ok ? '✓' : '✗'}</span>
                      <span style={{ fontWeight: f.ok ? 500 : 400 }}>{f.label}</span>
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div style={{ padding:'8px 0', textAlign:'center', fontSize:12, fontWeight:700, color:p.color }}>
                    ✓ Dein aktueller Plan
                  </div>
                ) : p.wixUrl ? (
                  <a href={p.wixUrl} target="_blank" rel="noreferrer"
                    style={{ display:'block', padding:'9px 0', textAlign:'center', borderRadius:999, background:p.color, color:'#fff', fontSize:12, fontWeight:700, textDecoration:'none', transition:'all 0.15s' }}>
                    Upgraden →
                  </a>
                ) : (
                  <div style={{ padding:'9px 0', textAlign:'center', fontSize:12, color:'#CBD5E1' }}>Kostenlos</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

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
      {/* ── Lead Scoring Rules ── */}
      <div style={{ marginTop:28 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:700, margin:0 }}>Lead Scoring Regeln</h2>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Regeln bestimmen automatisch den Score jedes Leads</div>
          </div>
          <button onClick={() => setShowScoring(s => !s)} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #E2E8F0', background:'#F8FAFC', fontSize:12, cursor:'pointer', fontWeight:600 }}>
            {showScoring ? 'Einklappen' : 'Verwalten'}
          </button>
        </div>

        {showScoring && (
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', overflow:'hidden' }}>
            {/* Bestehende Regeln */}
            {scoringRules.map(rule => (
              <div key={rule.id} style={{ padding:'10px 16px', borderBottom:'1px solid #F8FAFC', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1 }}>
                  <span style={{ fontSize:12, fontWeight:600 }}>{rule.name}</span>
                  <span style={{ fontSize:11, color:'#94A3B8', marginLeft:8 }}>{rule.field} {rule.operator} {rule.value}</span>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color: rule.score_delta > 0 ? '#22C55E' : '#EF4444', minWidth:30, textAlign:'right' }}>
                  {rule.score_delta > 0 ? '+' : ''}{rule.score_delta}
                </span>
                <button onClick={() => toggleRule(rule.id, rule.is_active)} style={{ padding:'3px 8px', borderRadius:6, border:'1px solid #E2E8F0', fontSize:10, cursor:'pointer', background: rule.is_active ? '#F0FDF4' : '#F8FAFC', color: rule.is_active ? '#166534' : '#94A3B8' }}>
                  {rule.is_active ? 'Aktiv' : 'Inaktiv'}
                </button>
                <button onClick={() => deleteRule(rule.id)} style={{ padding:'3px 8px', borderRadius:6, border:'1px solid #FCA5A5', background:'#FEF2F2', fontSize:10, cursor:'pointer', color:'#DC2626' }}>x</button>
              </div>
            ))}

            {/* Neue Regel */}
            <div style={{ padding:'14px 16px', background:'#F8FAFC', borderTop:'1px solid #E2E8F0' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:10, textTransform:'uppercase', letterSpacing:'.06em' }}>Neue Regel</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
                <input value={newRule.name} onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))} placeholder="Regelname" style={{ padding:'7px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:12, width:130, outline:'none' }}/>
                <select value={newRule.field} onChange={e => setNewRule(r => ({ ...r, field: e.target.value }))} style={{ padding:'7px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:12, outline:'none' }}>
                  <option value="headline">Headline</option>
                  <option value="company">Company</option>
                  <option value="location">Location</option>
                  <option value="linkedin_url">LinkedIn URL</option>
                  <option value="connection_status">Connection</option>
                </select>
                <select value={newRule.operator} onChange={e => setNewRule(r => ({ ...r, operator: e.target.value }))} style={{ padding:'7px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:12, outline:'none' }}>
                  <option value="contains">enthält</option>
                  <option value="equals">ist gleich</option>
                  <option value="not_null">ist gesetzt</option>
                </select>
                {newRule.operator !== 'not_null' && (
                  <input value={newRule.value} onChange={e => setNewRule(r => ({ ...r, value: e.target.value }))} placeholder="Wert" style={{ padding:'7px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:12, width:100, outline:'none' }}/>
                )}
                <input type="number" value={newRule.score_delta} onChange={e => setNewRule(r => ({ ...r, score_delta: parseInt(e.target.value)||0 }))} placeholder="Score" style={{ padding:'7px 10px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:12, width:70, outline:'none' }}/>
                <button onClick={addRule} disabled={savingRule || !newRule.name?.trim()} style={{ padding:'7px 16px', borderRadius:8, background:'linear-gradient(135deg,#0A66C2,#8B5CF6)', color:'#fff', border:'none', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  {savingRule ? '...' : '+ Hinzufügen'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
