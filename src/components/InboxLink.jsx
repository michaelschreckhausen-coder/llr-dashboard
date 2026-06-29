import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

// Kompakter Header-Button: öffnet die LinkedIn-Import-Inbox und zeigt die Anzahl
// offener (review_status='new') Einträge. Genutzt in Vernetzungen / Nachrichten /
// Automatisierung, damit die Inbox aus dem LinkedIn-Workflow erreichbar ist.
export default function InboxLink({ style }) {
  const { activeTeamId } = useTeam() || {}
  const navigate = useNavigate()
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true
    if (!activeTeamId) { setCount(0); return undefined }
    supabase
      .from('linkedin_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', activeTeamId)
      .eq('review_status', 'new')
      .then(({ count }) => { if (active) setCount(count || 0) })
    return () => { active = false }
  }, [activeTeamId])

  return (
    <button
      onClick={() => navigate('/linkedin-inbox')}
      title="Import-Inbox öffnen"
      style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 12px', background:'var(--surface)', color:'#374151', border:'1.5px solid #E4E7EC', borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', ...style }}
    >
      <Inbox size={15} /> Import-Inbox
      {count > 0 && (
        <span style={{ background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', borderRadius:99, padding:'1px 7px', fontSize:11, fontWeight:700 }}>{count}</span>
      )}
    </button>
  )
}
