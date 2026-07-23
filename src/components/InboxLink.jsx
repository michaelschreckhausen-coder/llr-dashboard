import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'

// Kompakter Header-Button: öffnet die LinkedIn-Import-Inbox und zeigt die Anzahl
// offener (review_status='new') Einträge. Genutzt in Vernetzungen / Nachrichten /
// Automatisierung, damit die Inbox aus dem LinkedIn-Workflow erreichbar ist.
export default function InboxLink({ style }) {
  const { activeTeamId } = useTeam() || {}
  const { activeBrandVoice } = useBrandVoice() || {}
  const navigate = useNavigate()
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true
    const bvId = activeBrandVoice?.id || null
    // Brand-scoped: zählt die Kontakte der aktiven Marke (Ziel /linkedin-inbox ist ebenfalls brand-scoped).
    if (!bvId) { setCount(0); return undefined }
    supabase
      .from('linkedin_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('brand_voice_id', bvId)
      .eq('review_status', 'new')
      .neq('source', 'unipile_relations') // Netzwerk-Zeilen (1.-Grad-Relations) gehören in den „Netzwerk"-Tab, nicht in die Kontakte-Zahl
      .then(({ count }) => { if (active) setCount(count || 0) })
    return () => { active = false }
  }, [activeBrandVoice?.id])

  return (
    <button className="lk-btn lk-btn-ghost"
      onClick={() => navigate('/linkedin-inbox')}
      title="LinkedIn Kontakte öffnen"
      style={{ display:'inline-flex', alignItems:'center', gap:6, ...style }}
    >
      <Inbox size={15} /> LinkedIn Kontakte
      {count > 0 && (
        <span style={{ background:'var(--primary)', color:'#fff', borderRadius:99, padding:'1px 7px', fontSize:11, fontWeight:700 }}>{count}</span>
      )}
    </button>
  )
}
