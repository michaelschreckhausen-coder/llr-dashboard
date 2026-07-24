// src/components/ReconnectLinkedInModal.jsx
//
// Globaler Hinweis für Bestandsnutzer nach dem Unipile-Cutover: Marken, deren alte
// LinkedIn-Verbindung getrennt wurde (brand_voices.linkedin_reconnect_required=true),
// müssen einmal neu über Unipile verbunden werden. „Nicht jetzt" = für diese Sitzung
// schließen (erscheint beim nächsten Öffnen wieder), „Jetzt neu verbinden" = direkt in
// den Verbindungs-Flow der betroffenen Marke.
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

export default function ReconnectLinkedInModal() {
  const { activeTeamId } = useTeam()
  const nav = useNavigate()
  const [pending, setPending] = useState(null)   // { id, name, account_type }
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!activeTeamId || dismissed) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('brand_voices')
        .select('id, name, brand_name, account_type')
        .eq('linkedin_reconnect_required', true)
        .limit(1)
      if (!cancelled) setPending((data && data[0]) || null)
    })()
    return () => { cancelled = true }
  }, [activeTeamId, dismissed])

  if (!pending || dismissed) return null
  const name = pending.name || pending.brand_name || 'deine Marke'
  const route = pending.account_type === 'company_page' ? '/company-brand' : '/personal-brand'

  return (
    <div onClick={() => setDismissed(true)}
      style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(3px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'var(--surface,#fff)', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.22)', width:460, maxWidth:'92vw', padding:26 }}>
        <div style={{ fontSize:18, fontWeight:800, color:'var(--text-strong,#111827)', marginBottom:10 }}>LinkedIn neu verbinden</div>
        <p style={{ fontSize:13.5, color:'#334155', lineHeight:1.6, margin:'0 0 18px' }}>
          Wir haben die LinkedIn-Anbindung umgebaut — sie läuft jetzt vollständig serverseitig (Analyse, Nachrichten, Vernetzung & Content), ohne Browser-Extension. Deshalb muss das LinkedIn-Profil deiner Marke <strong>{name}</strong> einmal neu verbunden werden. Es dauert nur einen Moment.
        </p>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
          <button className="lk-btn lk-btn-ghost" type="button" onClick={() => setDismissed(true)}>Nicht jetzt</button>
          <button className="lk-btn lk-btn-cta" type="button" onClick={() => { setDismissed(true); nav(`${route}?connect_bv=${pending.id}`) }}>Jetzt neu verbinden</button>
        </div>
      </div>
    </div>
  )
}
