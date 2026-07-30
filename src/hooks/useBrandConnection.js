// useBrandConnection — zentraler Verbindungs-Status der AKTIVEN Marke.
// Quelle: RPC get_brand_connection_caps (SECURITY DEFINER, has_brand_access-Gate).
//  connected = personal: eigener OK-unipile_account | company_page: org gesetzt + acting-Account OK.
// Wird vom LinkedInConnectionGate genutzt, um profil-erhobene Daten auszublenden,
// wenn das Profil getrennt ist (Daten bleiben in der DB, kommen beim Reconnect zurueck).
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useBrandVoice } from '../context/BrandVoiceContext'

const EMPTY = { loading: false, connected: false, caps: {}, accountType: 'personal', orgConnected: false, status: null }

export function useBrandConnection() {
  const { activeBrandVoice } = useBrandVoice()
  const bvId = activeBrandVoice?.id || null
  const [state, setState] = useState({ ...EMPTY, loading: true })

  useEffect(() => {
    let cancel = false
    if (!bvId) { setState({ ...EMPTY }); return }
    setState(s => ({ ...s, loading: true }))
    ;(async () => {
      const { data, error } = await supabase.rpc('get_brand_connection_caps', { p_brand_voice_id: bvId })
      if (cancel) return
      if (error || !data || data.error) {
        setState({ ...EMPTY, accountType: activeBrandVoice?.account_type || 'personal' })
        return
      }
      setState({
        loading: false,
        connected: !!data.connected,
        caps: data.caps || {},
        accountType: data.account_type || 'personal',
        orgConnected: !!data.org_connected,
        status: data.status || null,
      })
    })()
    return () => { cancel = true }
  }, [bvId]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}

export default useBrandConnection
