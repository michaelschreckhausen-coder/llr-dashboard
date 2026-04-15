import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const PRIMARY = 'rgb(49,90,231)'

export default function Profile({ session }) {
  const [profile,     setProfile]     = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [flash,       setFlash]       = useState(null)
  const [avatarUpl,   setAvatarUpl]   = useState(false)
  const [pwSaving,    setPwSaving]    = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const fileRef = useRef(null)
  const [form, setForm] = useState({ full_name: '', company: '', headline: '', bio: '' })
  const [pw, setPw]     = useState({ next: '', confirm: '' })
  const [pwShow, setPwShow] = useState({ next: false, confirm: false })
  const [newEmail, setNewEmail] = useState('')

  const flash_ = (msg, type = 'ok') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 4000) }

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    if (data) { setProfile(data); setForm({ full_name: data.full_name || '', company: data.company || '', headline: data.headline || '', bio: data.bio || '' }) }
  }

  async function saveProfile() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: form.full_name, company: form.company, headline: form.headline, bio: form.bio, updated_at: new Date().toISOString() }).eq('id', session.user.id)
    if (error) { flash_(error.message, 'err') }
    else {
      // Auth-Metadaten synchronisieren damit Header-Name sofort aktuell ist
      await supabase.auth.updateUser({ data: { full_name: form.full_name } })
      flash_('✓ Profil gespeichert')
      setProfile(p => ({ ...p, ...form }))
      window.dispatchEvent(new CustomEvent('leadesk_profile_updated'))
    }
    setSaving(false)
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 3 * 1024 * 1024) { flash_('Bild zu groß (max. 3 MB)', 'err'); return }
    setAvatarUpl(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${session.user.id}/avatar.${ext}`
      const { data: { session: s } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${s?.access_token}`, 'Content-Type': file.type, 'x-upsert': 'true' }, body: file,
      })
      if (!res.ok) { flash_(await res.text(), 'err'); setAvatarUpl(false); return }
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id)
      setProfile(p => ({ ...p, avatar_url: publicUrl }))
      flash_('✓ Profilbild aktualisiert')
      window.dispatchEvent(new CustomEvent('leadesk_profile_updated'))
    } catch (err) { flash_(err.message, 'err') }
    setAvatarUpl(false)
  }

  async function changePassword() {
    if (!pw.next) { flash_('Neues Passwort eingeben', 'err'); return }
    if (pw.next !== pw.confirm) { flash_('Passwörter stimmen nicht überein', 'err'); return }
    if (pw.next.length < 8) { flash_('Mindestens 8 Zeichen', 'err'); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pw.next })
    if (error) flash_(error.message, 'err')
    else { flash_('✓ Passwort geändert'); setPw({ next: '', confirm: '' }) }
    setPwSaving(false)
  }

  async function changeEmail() {
    if (!newEmail || !newEmail.includes('@')) { flash_('Gültige E-Mail eingeben', 'err'); return }
    setEmailSaving(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) flash_(error.message, 'err')
    else { flash_('✓ Bestätigungsmail gesendet — bitte E-Mail verifizieren'); setNewEmail('') }
    setEmailSaving(false)
  }

  const avatarUrl   = profile?.avatar_url || ''
  const displayName = profile?.full_name || session.user.email?.split('@')[0] || '?'
  const initials    = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const email       = session.user.email || ''

  const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid #E4E7EC', borderRadius: 9, fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box', fontFamily: 'Inter,sans-serif', transition: 'border-color 0.15s' }
  const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }
  const card = { background: '#fff', border: '1px solid #E4E7EC', borderRadius: 16, padding: '28px 32px', marginBottom: 20 }

  const Btn = ({ loading, text, onClick, disabled }) => (
    <button onClick={onClick} disabled={loading || disabled}
      style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: (loading || disabled) ? '#E4E7EC' : PRIMARY, color: (loading || disabled) ? '#9CA3AF' : '#fff', fontSize: 13, fontWeight: 700, cursor: (loading || disabled) ? 'default' : 'pointer' }}>
      {loading ? '⏳ …' : text}
    </button>
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 0 60px' }}>

      {flash && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, background: flash.type === 'err' ? '#FEF2F2' : '#F0FDF4', color: flash.type === 'err' ? '#991B1B' : '#065F46', border: '1px solid ' + (flash.type === 'err' ? '#FECACA' : '#A7F3D0'), boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div onClick={() => fileRef.current?.click()}
            style={{ width: 88, height: 88, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', border: '3px solid #E4E7EC', position: 'relative', background: '#F3F4F6' }}>
            {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : (
              <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${PRIMARY}, #818CF8)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 800 }}>{initials}</div>
            )}
            <div className="avatar-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{avatarUpl ? '⏳' : '📷 Ändern'}</span>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 4 }}>{displayName}</div>
          <div style={{ fontSize: 14, color: '#6B7280', marginBottom: profile?.headline ? 4 : 0 }}>{email}</div>
          {profile?.headline && <div style={{ fontSize: 13, color: '#9CA3AF' }}>{profile.headline}</div>}
        </div>
        <div style={{ fontSize: 11, color: '#CBD5E1', textAlign: 'right', flexShrink: 0, lineHeight: 1.5 }}>Klicke auf das Bild<br/>um es zu ändern</div>
      </div>

      {/* Persönliche Daten */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Persönliche Daten</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={lbl}>Vollständiger Name</label>
            <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Max Mustermann" style={inp}
              onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = '#E4E7EC'}/>
          </div>
          <div>
            <label style={lbl}>Unternehmen</label>
            <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Firma GmbH" style={inp}
              onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = '#E4E7EC'}/>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Position / Headline</label>
          <input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} placeholder="CEO | Founder | Sales Manager" style={inp}
            onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = '#E4E7EC'}/>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Über mich</label>
          <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Kurze Beschreibung…" rows={4}
            style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }}
            onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = '#E4E7EC'}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn loading={saving} text="💾 Profil speichern" onClick={saveProfile}/>
        </div>
      </div>

      {/* E-Mail */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>E-Mail ändern</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
          Aktuelle E-Mail: <strong>{email}</strong><br/>
          Nach der Änderung erhältst du eine Bestätigungsmail an die neue Adresse.
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Neue E-Mail-Adresse</label>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="neue@email.de" style={inp}
              onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = '#E4E7EC'}
              onKeyDown={e => e.key === 'Enter' && changeEmail()}/>
          </div>
          <Btn loading={emailSaving} text="E-Mail ändern" onClick={changeEmail} disabled={!newEmail}/>
        </div>
      </div>

      {/* Passwort */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Passwort ändern</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>Mindestens 8 Zeichen.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
          {[{ key: 'next', label: 'Neues Passwort' }, { key: 'confirm', label: 'Passwort bestätigen' }].map(({ key, label }) => (
            <div key={key}>
              <label style={lbl}>{label}</label>
              <div style={{ position: 'relative' }}>
                <input type={pwShow[key] ? 'text' : 'password'} value={pw[key]} onChange={e => setPw(p => ({ ...p, [key]: e.target.value }))}
                  placeholder="••••••••" style={{ ...inp, paddingRight: 44 }}
                  onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = '#E4E7EC'}
                  onKeyDown={e => e.key === 'Enter' && changePassword()}/>
                <button onClick={() => setPwShow(s => ({ ...s, [key]: !s[key] }))}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9CA3AF', padding: 0, lineHeight: 1 }}>
                  {pwShow[key] ? '🙈' : '👁'}
                </button>
              </div>
            </div>
          ))}
        </div>
        {/* Stärke-Anzeige */}
        {pw.next && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ height: 4, background: '#F3F4F6', borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', borderRadius: 99, transition: 'width 0.3s, background 0.3s', width: pw.next.length < 6 ? '25%' : pw.next.length < 10 ? '60%' : '100%', background: pw.next.length < 6 ? '#EF4444' : pw.next.length < 10 ? '#F59E0B' : '#10B981' }}/>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: pw.next.length < 6 ? '#EF4444' : pw.next.length < 10 ? '#F59E0B' : '#10B981' }}>
              {pw.next.length < 6 ? 'Zu kurz' : pw.next.length < 10 ? 'Mittel' : 'Stark ✓'}
            </div>
          </div>
        )}
        {pw.confirm && pw.next !== pw.confirm && (
          <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 12, fontWeight: 600 }}>⚠ Passwörter stimmen nicht überein</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn loading={pwSaving} text="🔐 Passwort ändern" onClick={changePassword} disabled={!pw.next || pw.next !== pw.confirm || pw.next.length < 8}/>
        </div>
      </div>

      {/* Konto-Infos */}
      <div style={{ ...card, background: '#F9FAFB' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Konto-Informationen</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'User-ID',       value: session.user.id },
            { label: 'Mitglied seit', value: new Date(session.user.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) },
            { label: 'Plan',          value: profile?.plan_id || 'free' },
            { label: 'Status',        value: profile?.account_status || 'aktiv' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, color: '#374151', wordBreak: 'break-all' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
