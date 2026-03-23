import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Settings({ session }) {
  const [profile,    setProfile]    = useState(null)
  const [outputLang, setOutputLang] = useState('auto')
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)

  // Password change
  const [pwCurrent,  setPwCurrent]  = useState('')
  const [pwNew,      setPwNew]      = useState('')
  const [pwConfirm,  setPwConfirm]  = useState('')
  const [pwSaving,   setPwSaving]   = useState(false)
  const [pwMsg,      setPwMsg]      = useState(null) // {type:'success'|'error', text}

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('profiles')
      .select('*, plans(name, daily_limit)')
      .eq('id', session.user.id)
      .single()
    setProfile(data)
    setOutputLang(data?.output_language || 'auto')
  }

  async function saveSettings() {
    setSaving(true)
    await supabase.from('profiles').update({ output_language: outputLang }).eq('id', session.user.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function changePassword() {
    setPwMsg(null)
    if (!pwNew || pwNew.length < 8) {
      setPwMsg({ type:'error', text:'Passwort muss mindestens 8 Zeichen lang sein.' }); return
    }
    if (pwNew !== pwConfirm) {
      setPwMsg({ type:'error', text:'Passwörter stimmen nicht überein.' }); return
    }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwNew })
    setPwSaving(false)
    if (error) {
      setPwMsg({ type:'error', text: error.message })
    } else {
      setPwMsg({ type:'success', text:'Passwort erfolgreich geändert!' })
      setPwCurrent(''); setPwNew(''); setPwConfirm('')
    }
  }

  const inpStyle = { width:'100%', padding:'9px 12px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:13, boxSizing:'border-box', fontFamily:'inherit' }
  const lblStyle = { display:'block', fontSize:12, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }

  return (
    <div style={{ maxWidth:680 }}>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Einstellungen</h1>
        <div style={{ color:'#888', fontSize:14 }}>Account & Präferenzen verwalten</div>
      </div>

      {/* Account Info */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e8ecf0', marginBottom:16 }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #f0f0f0', fontWeight:700, fontSize:14 }}>
          👤 Account
        </div>
        <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#fafafa', borderRadius:8 }}>
            <div>
              <div style={{ fontSize:12, color:'#888', marginBottom:2 }}>E-Mail</div>
              <div style={{ fontSize:14, fontWeight:600 }}>{session.user.email}</div>
            </div>
          </div>
          {profile && (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#fafafa', borderRadius:8 }}>
              <div>
                <div style={{ fontSize:12, color:'#888', marginBottom:2 }}>Plan</div>
                <div style={{ fontSize:14, fontWeight:600 }}>{profile.plans?.name || 'Free'}</div>
              </div>
              <div style={{ fontSize:12, color:'#888' }}>
                {profile.plans?.daily_limit === -1 ? 'Unbegrenzt' : `${profile.plans?.daily_limit} Kommentare/Tag`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Password Change */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e8ecf0', marginBottom:16 }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #f0f0f0', fontWeight:700, fontSize:14 }}>
          🔒 Passwort ändern
        </div>
        <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={lblStyle}>Neues Passwort</label>
            <input
              type="password"
              value={pwNew}
              onChange={e => setPwNew(e.target.value)}
              placeholder="Mindestens 8 Zeichen"
              style={inpStyle}
            />
          </div>
          <div>
            <label style={lblStyle}>Neues Passwort bestätigen</label>
            <input
              type="password"
              value={pwConfirm}
              onChange={e => setPwConfirm(e.target.value)}
              placeholder="Passwort wiederholen"
              style={inpStyle}
            />
          </div>

          {pwMsg && (
            <div style={{
              padding:'10px 14px', borderRadius:8, fontSize:13,
              background: pwMsg.type === 'success' ? '#e6f4ee' : '#fde8e8',
              color:      pwMsg.type === 'success' ? '#057642'  : '#cc1016',
              border:     `1px solid ${pwMsg.type === 'success' ? '#b7dfcb' : '#f5b8b8'}`
            }}>
              {pwMsg.type === 'success' ? '✅ ' : '❌ '}{pwMsg.text}
            </div>
          )}

          <button
            onClick={changePassword}
            disabled={pwSaving || !pwNew || !pwConfirm}
            style={{ padding:'9px 22px', borderRadius:20, background:'linear-gradient(135deg,#0a66c2,#0077b5)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', alignSelf:'flex-start', opacity: (!pwNew || !pwConfirm) ? 0.5 : 1 }}
          >
            {pwSaving ? '⏳ Speichere...' : '🔒 Passwort ändern'}
          </button>
        </div>
      </div>

      {/* Output Language */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e8ecf0', marginBottom:16 }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #f0f0f0', fontWeight:700, fontSize:14 }}>
          🌍 Ausgabesprache
        </div>
        <div style={{ padding:'18px 20px' }}>
          <label style={lblStyle}>Sprache der generierten Kommentare</label>
          <select
            value={outputLang}
            onChange={e => setOutputLang(e.target.value)}
            style={{ ...inpStyle, cursor:'pointer' }}
          >
            <option value="auto">🤖 Automatisch (Sprache des Posts)</option>
            <option value="de">🇩🇪 Immer Deutsch</option>
            <option value="en">🇬🇧 Immer Englisch</option>
          </select>
          <div style={{ fontSize:12, color:'#aaa', marginTop:6 }}>
            Bei "Automatisch" erkennt die KI die Sprache des Posts und antwortet in derselben Sprache.
          </div>
        </div>
      </div>

      {/* Brand Voice Hinweis */}
      <div style={{ background:'#f0f7ff', borderRadius:12, border:'1px solid #c6daf8', marginBottom:16, padding:'16px 20px', display:'flex', alignItems:'flex-start', gap:12 }}>
        <div style={{ fontSize:24, flexShrink:0 }}>🎙️</div>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:'#0a66c2', marginBottom:4 }}>Kommunikationsstil in Brand Voice</div>
          <div style={{ fontSize:13, color:'#555', lineHeight:1.5 }}>
            Dein persönlicher Kommunikationsstil wird jetzt über <strong>Brand Voice</strong> gesteuert. Dort kannst du Tonalität, Sprache, Dos &amp; Don'ts und eine KI-Summary definieren die automatisch in jeden Kommentar eingebaut wird.
          </div>
          <a href="/brand-voice" style={{ display:'inline-block', marginTop:8, fontSize:13, fontWeight:600, color:'#0a66c2', textDecoration:'none' }}>
            → Brand Voice öffnen
          </a>
        </div>
      </div>

      {/* Save */}
      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12 }}>
        {saved && <span style={{ color:'#057642', fontSize:13, fontWeight:600 }}>✅ Gespeichert!</span>}
        <button
          onClick={saveSettings}
          disabled={saving}
          style={{ padding:'9px 24px', borderRadius:20, background:'linear-gradient(135deg,#0a66c2,#0077b5)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}
        >
          {saving ? '⏳ Speichere...' : '💾 Einstellungen speichern'}
        </button>
      </div>
    </div>
  )
}
