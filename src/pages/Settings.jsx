import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const TONE_CHIPS = [
  ['🎯', 'Direkt und prägnant, ohne Umschweife'],
  ['📖', 'Storytelling mit persönlichen Anekdoten'],
  ['📊', 'Analytisch und datengetrieben'],
  ['💡', 'Motivierend und inspirierend'],
  ['😄', 'Humorvoll mit Selbstironie'],
  ['❓', 'Kritisch hinterfragend'],
  ['🤝', 'Empathisch und wertschätzend'],
]

export default function Settings({ session }) {
  const [profile,      setProfile]      = useState(null)
  const [toneProfile,  setToneProfile]  = useState('')
  const [outputLang,   setOutputLang]   = useState('auto')
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('profiles')
      .select('plan_id, plans(name, daily_limit, price_eur)')
      .eq('id', session.user.id).single()
    setProfile(data)

    // Load tone profile from Supabase (stored in profiles table)
    const { data: pr2 } = await supabase.from('profiles')
      .select('tone_profile, output_language').eq('id', session.user.id).single()
    setToneProfile(pr2?.tone_profile || '')
    setOutputLang(pr2?.output_language || 'auto')
  }

  async function save() {
    setSaving(true)
    await supabase.from('profiles').update({
      tone_profile: toneProfile,
      output_language: outputLang,
    }).eq('id', session.user.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const plan = profile?.plans

  return (
    <div style={{maxWidth:660}}>
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:24}}>Einstellungen</h1>

      {/* Plan info */}
      <div className="card" style={{padding:'20px 24px',marginBottom:24}}>
        <div style={{fontSize:15,fontWeight:600,marginBottom:14}}>Aktueller Plan</div>
        <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:20,fontWeight:700,color:'#0a66c2'}}>{plan?.name || 'Free'}</div>
            <div style={{fontSize:13,color:'#888',marginTop:2}}>
              {plan?.daily_limit === -1 ? 'Unlimitierte Generierungen' : `${plan?.daily_limit || 10} Generierungen / Tag`}
            </div>
          </div>
          {plan?.plan_id !== 'pro' && (
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:13,color:'#888',marginBottom:8}}>Upgrade auf Pro für unbegrenzte Nutzung</div>
              <a href="https://www.linkedin-consulting.com/upgrade" target="_blank" className="btn btn-primary">
                ⚡ Auf Pro upgraden — 9,90€/Monat
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Output language */}
      <div className="card" style={{padding:'20px 24px',marginBottom:24}}>
        <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>🌍 Sprache der generierten Texte</div>
        <div style={{fontSize:13,color:'#888',marginBottom:14}}>In welcher Sprache sollen Kommentare generiert werden?</div>
        <div style={{display:'flex',gap:10}}>
          {[['auto','🌐 Automatisch','Wie der Post'],['de','🇩🇪 Deutsch',''],['en','🇬🇧 English','']].map(([val,label,sub])=>(
            <button key={val} onClick={()=>setOutputLang(val)}
              style={{
                flex:1, padding:'10px', borderRadius:10, border:`2px solid ${outputLang===val?'#0a66c2':'#e0e0e0'}`,
                background: outputLang===val?'#0a66c2':'#fff',
                color: outputLang===val?'#fff':'#555',
                fontWeight:600, fontSize:13, cursor:'pointer',
                transition:'all 0.15s',
              }}>
              {label}
              {sub && <div style={{fontSize:11,opacity:0.8,marginTop:2}}>{sub}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Tone profile */}
      <div className="card" style={{padding:'20px 24px',marginBottom:24}}>
        <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>🎨 Persönliches Ton-Profil</div>
        <div style={{fontSize:13,color:'#888',marginBottom:14}}>
          Beschreibe deinen Schreibstil — je detaillierter, desto besser passen die KI-Kommentare zu dir.
        </div>
        <textarea value={toneProfile} onChange={e=>setToneProfile(e.target.value)}
          rows={7} style={{width:'100%',resize:'vertical'}}
          placeholder={`Beschreibe deinen LinkedIn-Schreibstil, z.B.:\n- Ich schreibe direkt und auf den Punkt\n- Ich stelle gerne Fragen um Diskussionen anzuregen\n- Mein Ton ist professionell aber menschlich\n\nOder füge Beispielsätze aus echten LinkedIn-Kommentaren ein!`}/>

        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12}}>
          {TONE_CHIPS.map(([icon, text]) => (
            <button key={text} onClick={() => setToneProfile(t => t ? t + '\n- ' + text : '- ' + text)}
              style={{padding:'5px 12px',borderRadius:16,background:'#eef4ff',border:'1.5px solid #c6d8f8',
                color:'#0a66c2',fontSize:12,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}
              onMouseEnter={e=>{e.target.style.background='#0a66c2';e.target.style.color='#fff'}}
              onMouseLeave={e=>{e.target.style.background='#eef4ff';e.target.style.color='#0a66c2'}}>
              {icon} {text.split(' ').slice(0,2).join(' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Account */}
      <div className="card" style={{padding:'20px 24px',marginBottom:24}}>
        <div style={{fontSize:15,fontWeight:600,marginBottom:14}}>👤 Konto</div>
        <div style={{fontSize:13,color:'#888',marginBottom:4}}>E-Mail</div>
        <div style={{fontSize:14,fontWeight:500,marginBottom:16}}>{session.user.email}</div>
        <button className="btn btn-danger btn-sm" onClick={async()=>{
          if(!confirm('Wirklich abmelden?')) return
          await supabase.auth.signOut()
        }}>Abmelden</button>
      </div>

      <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
        {saved && <span style={{color:'#057642',fontSize:13,alignSelf:'center'}}>✅ Gespeichert!</span>}
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '⏳ Speichere...' : '💾 Einstellungen speichern'}
        </button>
      </div>
    </div>
  )
}
