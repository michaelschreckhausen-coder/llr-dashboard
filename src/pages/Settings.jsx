import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang, setLang, t } from '../lib/i18n'

export default function Settings({ session }) {
  const [lang, setUiLang] = useLang()
  const [profile,    setProfile]    = useState(null)
  const [outputLang, setOutputLang] = useState('auto')
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [pwNew,      setPwNew]      = useState('')
  const [pwConfirm,  setPwConfirm]  = useState('')
  const [pwSaving,   setPwSaving]   = useState(false)
  const [pwMsg,      setPwMsg]      = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('profiles').select('*, plans(name, daily_limit)').eq('id', session.user.id).single()
    setProfile(data)
    setOutputLang(data?.output_language || 'auto')
  }

  async function saveSettings() {
    setSaving(true)
    await supabase.from('profiles').update({ output_language: outputLang }).eq('id', session.user.id)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function changePassword() {
    setPwMsg(null)
    if (!pwNew || pwNew.length < 8) { setPwMsg({ type:'error', text: t('settings_pw_short') }); return }
    if (pwNew !== pwConfirm)         { setPwMsg({ type:'error', text: t('settings_pw_mismatch') }); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwNew })
    setPwSaving(false)
    if (error) { setPwMsg({ type:'error', text: error.message }) }
    else { setPwMsg({ type:'success', text: t('settings_pw_ok') }); setPwNew(''); setPwConfirm('') }
  }

  function handleUiLang(l) { setLang(l); setUiLang(l) }

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

      {/* Account */}
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

      {/* Password */}
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
            <div style={{ padding:'10px 14px', borderRadius:8, fontSize:13,
              background: pwMsg.type==='success' ? '#e6f4ee' : '#fde8e8',
              color:      pwMsg.type==='success' ? '#057642' : '#cc1016',
              border:     `1px solid ${pwMsg.type==='success' ? '#b7dfcb' : '#f5b8b8'}` }}>
              {pwMsg.text}
            </div>
          )}
          <button onClick={changePassword} disabled={pwSaving||!pwNew||!pwConfirm}
            style={{ padding:'9px 22px', borderRadius:20, background:'linear-gradient(135deg,#0a66c2,#0077b5)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', alignSelf:'flex-start', opacity:(!pwNew||!pwConfirm)?0.5:1 }}>
            {pwSaving ? t('settings_pw_saving') : t('settings_pw_btn')}
          </button>
        </div>
      </div>

      {/* UI Language */}
      <div style={box}>
        <div style={hdr}>{t('settings_ui_lang')}</div>
        <div style={{ padding:'18px 20px' }}>
          <label style={lbl}>{t('settings_ui_lang_label')}</label>
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            {[['de','🇩🇪 Deutsch'],['en','🇬🇧 English']].map(([val, label]) => (
              <button key={val} onClick={() => handleUiLang(val)}
                style={{ flex:1, padding:'12px 16px', borderRadius:10,
                  border: `2px solid ${lang===val ? '#0a66c2' : '#dde3ea'}`,
                  background: lang===val ? '#0a66c2' : '#fff',
                  color:      lang===val ? '#fff'    : '#555',
                  fontWeight: lang===val ? 700 : 500, fontSize:15, cursor:'pointer', transition:'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize:12, color:'#aaa', marginTop:8 }}>{t('settings_ui_hint')}</div>
        </div>
      </div>

      {/* Output Language */}
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

      {/* Brand Voice hint */}
      <div style={{ background:'#f0f7ff', borderRadius:12, border:'1px solid #c6daf8', marginBottom:16, padding:'16px 20px', display:'flex', alignItems:'flex-start', gap:12 }}>
        <div style={{ fontSize:24, flexShrink:0 }}>🎙️</div>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:'#0a66c2', marginBottom:4 }}>{t('settings_bv_title')}</div>
          <div style={{ fontSize:13, color:'#555', lineHeight:1.5 }}>{t('settings_bv_text')}</div>
          <a href="/brand-voice" style={{ display:'inline-block', marginTop:8, fontSize:13, fontWeight:600, color:'#0a66c2', textDecoration:'none' }}>
            {t('settings_bv_link')}
          </a>
        </div>
      </div>

      {/* Save */}
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
