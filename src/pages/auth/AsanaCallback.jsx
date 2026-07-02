// src/pages/auth/AsanaCallback.jsx
//
// Asana-Integration Phase 1: OAuth-Callback-Landing-Page.
//
// Asana leitet nach dem Consent hierher:
//   /integrations/asana/callback?code=...&state=...
//
// Wir extrahieren code + state, rufen die asana-oauth-callback-Edge-Function
// (state wirkt als CSRF-Token, daher kein JWT nötig) und navigieren dann
// zurück zum Marketplace mit ?asana_connected=1 bzw. ?asana_error=...
// (Marketplace öffnet daraufhin das Asana-Settings-Panel mit neuem Status).

import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function AsanaCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('processing')
  const [errorMsg, setErrorMsg] = useState('')
  const [workspace, setWorkspace] = useState('')

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const errorParam = params.get('error')
    const errorDesc = params.get('error_description')

    if (errorParam) {
      setStatus('error')
      setErrorMsg(errorDesc || errorParam)
      setTimeout(() => navigate('/marketplace?asana_error=' + encodeURIComponent(errorDesc || errorParam), { replace: true }), 2500)
      return
    }
    if (!code || !state) {
      setStatus('error')
      setErrorMsg('Ungültiger Callback (code oder state fehlt)')
      setTimeout(() => navigate('/marketplace?asana_error=invalid_callback', { replace: true }), 2500)
      return
    }

    ;(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('asana-oauth-callback', {
          body: { code, state },
        })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        if (!data?.ok) throw new Error('Unerwartete Antwort')
        setWorkspace(data.workspace?.name || '')
        setStatus('success')
        setTimeout(() => navigate('/marketplace?asana_connected=1', { replace: true }), 1500)
      } catch (e) {
        const msg = e?.message || 'Unbekannter Fehler beim OAuth-Callback'
        setStatus('error')
        setErrorMsg(msg)
        setTimeout(() => navigate('/marketplace?asana_error=' + encodeURIComponent(msg), { replace: true }), 3500)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight:'70vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ maxWidth:420, width:'100%', textAlign:'center', padding:'32px 28px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, boxShadow:'0 4px 20px rgba(0,0,0,.05)' }}>
        {status === 'processing' && (
          <>
            <div style={{ fontSize:42, marginBottom:14 }}>🗂️</div>
            <div style={{ fontSize:18, fontWeight:700, color:'rgb(20,20,43)', marginBottom:8 }}>Asana wird verbunden …</div>
            <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.5 }}>
              Wir tauschen den Authorization-Code gegen einen Token. Dauert nur ein paar Sekunden.
            </div>
            <div style={{ marginTop:18, display:'inline-block', width:36, height:36, border:'4px solid #E2E8F0', borderTopColor: P, borderRadius:'50%', animation:'asanaCallbackSpin 0.9s linear infinite' }}/>
            <style>{'@keyframes asanaCallbackSpin { to { transform: rotate(360deg); } }'}</style>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ fontSize:42, marginBottom:14 }}>✅</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#166534', marginBottom:8 }}>Asana verbunden{workspace ? ' — ' + workspace : ''}</div>
            <div style={{ fontSize:13, color:'var(--text-muted)' }}>Du wirst zurück zum Marketplace gebracht …</div>
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
