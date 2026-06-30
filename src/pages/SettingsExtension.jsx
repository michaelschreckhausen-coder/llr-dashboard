import React, { useEffect, useState } from 'react'
import { BarChart3, Handshake, MessageSquare, User } from 'lucide-react'
import SettingsTabs from '../components/SettingsTabs'
import { detectLeadeskExtension, EXTENSION_WEBSTORE_URL } from '../lib/leadeskExtension'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

const FEATURES = [
  { icon: <User size={16} strokeWidth={1.75}/>, title: 'Profile mit einem Klick als Lead', text: 'Auf jedem LinkedIn-Profil erscheint ein „In Leadesk speichern"-Button. Name, Firma, Position, Standort werden automatisch ins CRM übernommen.' },
  { icon: <BarChart3 size={16} strokeWidth={1.75}/>, title: 'SSI-Score automatisch tracken', text: 'Wenn du deinen eigenen Social Selling Index aufrufst, liest die Extension den Score und legt ihn in deine SSI-Historie.' },
  { icon: <Handshake size={16} strokeWidth={1.75}/>, title: 'Vernetzungen aus LinkedIn starten', text: 'Vernetzungsanfragen mit personalisierter Notiz direkt von der LinkedIn-Suche oder einem Profil aus — alles erscheint in deiner Pipeline.' },
  { icon: <MessageSquare size={16} strokeWidth={1.75}/>, title: 'Nachrichten-Pipeline lesbar', text: 'Antworten und neue Nachrichten landen verknüpft mit deinem Lead. Keine Doppelpflege, kein Tab-Wechsel.' },
]

export default function SettingsExtension() {
  const [status, setStatus] = useState({ checking: true, installed: false, version: null })

  useEffect(() => {
    let alive = true
    detectLeadeskExtension().then(r => {
      if (!alive) return
      setStatus({ checking: false, installed: !!r.installed, version: r.version || null })
    })
    return () => { alive = false }
  }, [])

  function reCheck() {
    setStatus(s => ({ ...s, checking: true }))
    detectLeadeskExtension().then(r => {
      setStatus({ checking: false, installed: !!r.installed, version: r.version || null })
    })
  }

  return (
    <div style={{ maxWidth:740, margin:'0 auto' }}>
      <SettingsTabs />

      {/* Status-Card */}
      <div style={{
        borderRadius:16,
        border: '1px solid '+(status.installed?'rgba(34,197,94,0.35)':'var(--border, #E5E7EB)'),
        background: status.installed ? 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))' : 'var(--surface, #fff)',
        padding:'22px 24px',
        marginBottom:24,
      }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:18, flexWrap:'wrap' }}>
          <div style={{
            width:56, height:56, borderRadius:14, flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center',
            background: status.installed ? 'rgba(34,197,94,0.18)' : 'rgba(49,90,231,0.10)',
            color: status.installed ? 'rgb(22,163,74)' : PRIMARY,
            fontSize:26,
          }}>🔌</div>
          <div style={{ flex:1, minWidth:240 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.4, color:'var(--text-soft, #6B7280)', textTransform:'uppercase', marginBottom:4 }}>
              {status.checking ? 'Status wird geprüft…' : (status.installed ? 'Aktiv' : 'Nicht installiert')}
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:'var(--text-primary, #111)', marginBottom:6 }}>
              Leadesk Browser-Extension
            </div>
            <div style={{ fontSize:13, color:'var(--text-soft, #6B7280)', lineHeight:1.55 }}>
              {status.installed
                ? <>Die Extension ist installiert{status.version && status.version !== '?' ? <> (Version <strong>{status.version}</strong>)</> : null} und mit deinem Account verknüpft. Updates kommen automatisch über den Chrome Web Store.</>
                : <>Mit der Browser-Extension importierst du LinkedIn-Profile, SSI-Scores und Vernetzungen direkt ins CRM — ohne Copy-Paste, ohne Tab-Switching.</>}
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, flexShrink:0 }}>
            <a href={EXTENSION_WEBSTORE_URL} target="_blank" rel="noopener noreferrer"
              style={{
                display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
                padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:700,
                textDecoration:'none',
                background: status.installed ? 'transparent' : PRIMARY,
                color: status.installed ? PRIMARY : '#fff',
                border: '1px solid '+(status.installed ? PRIMARY : 'transparent'),
                whiteSpace:'nowrap',
              }}>
              {status.installed ? 'Im Web Store ansehen ↗' : 'Im Chrome Web Store öffnen ↗'}
            </a>
            {!status.checking && (
              <button onClick={reCheck} style={{
                padding:'6px 12px', fontSize:11, fontWeight:600,
                background:'transparent', border:'1px solid var(--border, #E5E7EB)',
                borderRadius:8, color:'var(--text-soft, #6B7280)', cursor:'pointer',
              }}>
                Status erneut prüfen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Was die Extension kann */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.4, color:'var(--text-soft, #6B7280)', textTransform:'uppercase', marginBottom:12 }}>
          Was die Extension kann
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:12 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              padding:'16px 18px', border:'1px solid var(--border, #E5E7EB)', borderRadius:12,
              background:'var(--surface, #fff)',
            }}>
              <div style={{ fontSize:22, marginBottom:8 }}>{f.icon}</div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary, #111)', marginBottom:4 }}>{f.title}</div>
              <div style={{ fontSize:12, color:'var(--text-soft, #6B7280)', lineHeight:1.55 }}>{f.text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Browser-Kompatibilität */}
      <div style={{
        padding:'14px 18px', borderRadius:10,
        border:'1px solid var(--border, #E5E7EB)',
        background:'var(--surface-soft, #F8F9FB)',
        fontSize:12, color:'var(--text-soft, #6B7280)', lineHeight:1.6,
      }}>
        <strong style={{ color:'var(--text-primary, #111)' }}>Browser-Kompatibilität:</strong> Chrome, Edge, Brave, Arc und andere Chromium-basierte Browser. Auf Firefox + Safari läuft die Extension derzeit nicht.
      </div>
    </div>
  )
}
