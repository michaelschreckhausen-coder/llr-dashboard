// src/pages/auth/LinkedInCallback.jsx
//
// Phase 1a: OAuth-Callback-Landing-Page
//
// LinkedIn redirected hierher nach Authorize:
//   /auth/linkedin/callback?code=AQT...&state=abc...
//
// Wir extrahieren code + state, rufen die linkedin-oauth-callback-Edge-Function
// und navigieren dann zurück zur Brand-Voice-Seite mit ?li_connected=<bv_id>
// oder ?li_error=...

import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const P = 'var(--wl-primary, #0A6FB0)'

export default function LinkedInCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('processing')
  const [errorMsg, setErrorMsg] = useState('')
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const errorParam = params.get('error')
    const errorDesc = params.get('error_description')

    if (errorParam) {
      setStatus('error')
      setErrorMsg(errorDesc || errorParam)
      setTimeout(() => navigate('/brand-voice?li_error=' + encodeURIComponent(errorDesc || errorParam), { replace: true }), 2500)
      return
    }
    if (!code || !state) {
      setStatus('error')
      setErrorMsg('Ungültiger Callback (code oder state fehlt)')
      setTimeout(() => navigate('/brand-voice?li_error=invalid_callback', { replace: true }), 2500)
      return
    }

    ;(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('linkedin-oauth-callback', {
          body: { code, state },
        })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        if (!data?.success || !data?.connection) throw new Error('Unerwartete Antwort')
        setDisplayName(data.connection.display_name || '')
        setStatus('success')
        const bvId = data.connection.brand_voice_id
        setTimeout(() => navigate('/brand-voice?li_connected=' + bvId, { replace: true }), 1500)
      } catch (e) {
        const msg = e?.message || 'Unbekannter Fehler beim OAuth-Callback'
        setStatus('error')
        setErrorMsg(msg)
        setTimeout(() => navigate('/brand-voice?li_error=' + encodeURIComponent(msg), { replace: true }), 3500)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight:'70vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ maxWidth:420, width:'100%', textAlign:'center', padding:'32px 28px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, boxShadow:'var(--shadow-card)' }}>
        {status === 'processing' && (
          <>
            <div style={{ fontSize:42, marginBottom:14 }}>🔗</div>
            <div style={{ fontSize:18, fontWeight:700, color:'rgb(20,20,43)', marginBottom:8 }}>LinkedIn wird verbunden …</div>
            <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.5 }}>
              Wir tauschen den Authorization-Code gegen einen Token. Dauert nur ein paar Sekunden.
            </div>
            <div style={{ marginTop:18, display:'inline-block', width:36, height:36, border:'4px solid #E2E8F0', borderTopColor: P, borderRadius:'50%', animation:'liCallbackSpin 0.9s linear infinite' }}/>
            <style>{'@keyframes liCallbackSpin { to { transform: rotate(360deg); } }'}</style>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ fontSize:42, marginBottom:14 }}>✅</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#166534', marginBottom:8 }}>LinkedIn verbunden{displayName ? ' — ' + displayName : ''}</div>
            <div style={{ fontSize:13, color:'var(--text-muted)' }}>Du wirst zurück zur Brand Voice gebracht …</div>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize:42, marginBottom:14 }}>⚠️</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#991B1B', marginBottom:8 }}>Verbindung fehlgeschlagen</div>
            <div style={{ fontSize:13, color:'#991B1B', background:'#FEF2F2', border:'1px solid #FCA5A5', padding:'10px 14px', borderRadius:8, marginTop:10 }}>{errorMsg}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:12 }}>Du wirst gleich zurückgeleitet …</div>
          </>
        )}
      </div>
    </div>
  )
}
