// src/components/MemoryConsentModal.jsx
// Onboarding-Modal — fragt einmal bei erster Content-Generation nach Memory-Opt-In.
// Zeigt sich automatisch wenn user_preferences.memory_enabled === null.

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { setMemoryEnabled } from '../lib/contentMemory'

const P = 'var(--wl-primary, #0A6FB0)'

export default function MemoryConsentModal({ session, onClose }) {
  const [saving, setSaving] = useState(false)

  async function decide(enabled) {
    setSaving(true)
    await setMemoryEnabled(session.user.id, enabled)
    setSaving(false)
    onClose && onClose(enabled)
  }

  return (
    <div onClick={() => decide(false)}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'var(--surface)', borderRadius:16, maxWidth:540, width:'100%', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ padding:'24px 28px 18px', background:'linear-gradient(135deg, rgba(10,111,176,.08), rgba(0,48,96,.06))' }}>
          <div style={{ fontSize:42, marginBottom:10 }}>🧠</div>
          <h2 style={{ fontSize:22, fontWeight:700, color:'rgb(20,20,43)', margin:0, lineHeight:1.25 }}>
            Soll Leadesk von deinem Schreiben lernen?
          </h2>
          <p style={{ fontSize:14, color:'var(--text-muted)', margin:'10px 0 0', lineHeight:1.6 }}>
            Wenn du zustimmst, merkt sich Leadesk anonymisiert welche Texte
            du behältst, welche du umschreibst, und welche Posts gut performen.
            Daraus werden deine zukünftigen KI-Texte immer mehr nach <em>dir</em> klingen
            statt generisch.
          </p>
        </div>
        <div style={{ padding:'18px 28px', background:'#F8FAFC', borderTop:'1px solid var(--border)' }}>
          <div style={{ fontSize:13, color:'var(--text-primary)', lineHeight:1.7 }}>
            <strong style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:8 }}>Was gespeichert wird</strong>
            <ul style={{ margin:0, paddingLeft:18 }}>
              <li>Deine Prompts + die KI-Outputs</li>
              <li>Welche Variante du gepickt hast</li>
              <li>Was du an der KI-Version geändert hast (Diff-Ratio)</li>
              <li>Performance deiner Posts (kommt mit Analytics)</li>
            </ul>
            <p style={{ marginTop:10, fontSize:12, color:'var(--text-muted)' }}>
              Alle Daten team-scoped, niemand außerhalb deines Teams sieht sie. Jederzeit in den Einstellungen deaktivierbar.
            </p>
          </div>
        </div>
        <div style={{ padding:'18px 28px', display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={() => decide(false)} disabled={saving}
            style={{ padding:'10px 18px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor: saving ? 'wait' : 'pointer' }}>
            Nein, danke
          </button>
          <button className="lk-btn lk-btn-primary" onClick={() => decide(true)} disabled={saving}
            >
            {saving ? 'Speichere…' : 'Ja, lern von mir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Hook zum Verwenden in Pages ───────────────────────────────────────────
export function useMemoryConsent(session) {
  const [needsConsent, setNeedsConsent] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false
    supabase
      .from('user_preferences')
      .select('memory_enabled')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        // NULL = noch nicht gefragt → show modal
        setNeedsConsent(data?.memory_enabled === null || data?.memory_enabled === undefined)
        setChecked(true)
      })
    return () => { cancelled = true }
  }, [session?.user?.id])

  return {
    needsConsent: needsConsent && checked,
    dismiss: () => setNeedsConsent(false),
  }
}
