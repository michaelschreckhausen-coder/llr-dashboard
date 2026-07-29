// OffeneAnfragen.jsx — Offene LinkedIn-Vernetzungsanfragen verwalten (Unipile-Janitor).
// Aus der aufgeloesten Vernetzungs-Seite nach „Netzwerk & Dialog" verlagert (P4/P5, 29.07.2026).
// Brand-scoped (aktive Marke). „Jetzt abgleichen" ruft unipile-invitations-sync
// (Reconcile accepted + Auto-Withdraw). Auto-Zurueckziehen persistiert in
// user_preferences.linkedin_withdraw_after_days (0 = aus). uid holt die Komponente selbst.
import React, { useState, useEffect, useCallback } from 'react'
import { UserCheck, Loader2, RefreshCw, ExternalLink, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { useNavigate } from 'react-router-dom'

const P = 'var(--wl-primary, rgb(49,90,231))'
const RC = { surface:'var(--surface, #fff)', border:'#E4E7EC', text1:'var(--text-strong, #111827)', text2:'#374151', text3:'#6B7280' }
const INV_STATUS = {
  pending:   { label:'Offen',          color:'#92400E', bg:'#FFFBEB', border:'#FCD34D' },
  accepted:  { label:'Angenommen',     color:'#065F46', bg:'#ECFDF5', border:'#6EE7B7' },
  withdrawn: { label:'Zurückgezogen',  color:'#475569', bg:'#F8FAFC', border:'#E5E7EB' },
  expired:   { label:'Abgelaufen',     color:'#991B1B', bg:'#FEF2F2', border:'#FECACA' },
  error:     { label:'Fehler',         color:'#991B1B', bg:'#FEF2F2', border:'#FECACA' },
}
function inviteAge(sentAt) {
  if (!sentAt) return '—'
  const d = Math.floor((Date.now() - new Date(sentAt).getTime()) / 86400000)
  return d <= 0 ? 'heute' : d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`
}

export default function OffeneAnfragen() {
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const [uid, setUid] = useState(null)
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [flash, setFlash]       = useState(null)
  const [withdrawDays, setWithdrawDays] = useState('')

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  const load = useCallback(async () => {
    const bvId = activeBrandVoice?.id || null
    if (!activeTeamId || !bvId) { setInvitations([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('linkedin_invitations')
      .select('id, invitation_id, invitee_name, invitee_url, lead_id, status, sent_at, responded_at, withdrawn_at')
      .eq('brand_voice_id', bvId)
      .order('sent_at', { ascending:false, nullsFirst:false })
    if (error) { setFlash({ type:'error', text:'Anfragen laden fehlgeschlagen: ' + error.message }); setInvitations([]); setLoading(false); return }
    setInvitations(data || [])
    setLoading(false)
    if (uid) {
      const { data: pref } = await supabase.from('user_preferences')
        .select('linkedin_withdraw_after_days').eq('user_id', uid).maybeSingle()
      if (pref?.linkedin_withdraw_after_days != null) setWithdrawDays(String(pref.linkedin_withdraw_after_days))
    }
  }, [activeTeamId, activeBrandVoice?.id, uid])
  useEffect(() => { load() }, [load])

  const sync = async () => {
    setSyncing(true); setFlash(null)
    const { data, error } = await supabase.functions.invoke('unipile-invitations-sync', { body: { user_id: uid } })
    if (error) {
      let body = null
      try { body = await error.context?.json?.() } catch { /* noop */ }
      const status = error.context?.status
      if (status === 409) setFlash({ type:'error', text:'Kein aktiver LinkedIn-Account verbunden.', action:{ label:'LinkedIn verbinden', to:'/personal-brand' } })
      else if (status === 429 || body?.rate_limited) setFlash({ type:'error', text:'Rate-Limit erreicht — bitte später erneut.' })
      else setFlash({ type:'error', text: body?.error || ('Abgleich fehlgeschlagen: ' + error.message) })
      setSyncing(false); return
    }
    setFlash({ type:'success', text:`Abgeglichen: ${data?.synced ?? 0} gespiegelt · ${data?.accepted ?? 0} angenommen · ${data?.withdrawn ?? 0} zurückgezogen.` })
    setSyncing(false); load()
  }

  const saveWithdraw = async (val) => {
    setWithdrawDays(val)
    if (!uid) return
    const n = val === '' ? null : Math.max(0, parseInt(val, 10) || 0)
    const { error } = await supabase.from('user_preferences')
      .upsert({ user_id: uid, linkedin_withdraw_after_days: n }, { onConflict: 'user_id' })
    if (error) setFlash({ type:'error', text:'Einstellung speichern fehlgeschlagen: ' + error.message })
  }

  const pending  = invitations.filter(i => i.status === 'pending')
  const accepted = invitations.filter(i => i.status === 'accepted')
  const notAccepted = invitations.filter(i => i.status === 'withdrawn' || i.status === 'expired')
  const denom = pending.length + accepted.length
  const acceptRate = denom > 0 ? Math.round((accepted.length / denom) * 100) : 0

  const cardStyle = { background:RC.surface, border:`1px solid ${RC.border}`, borderRadius:16, boxShadow:'var(--shadow-card)', padding:'18px 20px' }
  const btnPrimary = { padding:'8px 14px', background:'var(--primary)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }

  return (
    <div style={cardStyle}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:12 }}>
        <div style={{ fontSize:14, fontWeight:800, color:RC.text1, display:'flex', alignItems:'center', gap:8 }}>
          <UserCheck size={16} color={P}/> Vernetzungsanfragen
        </div>
        <button onClick={sync} disabled={syncing} style={{ ...btnPrimary, opacity: syncing ? 0.6 : 1 }}>
          {syncing ? <Loader2 size={14} className="lk-spin"/> : <RefreshCw size={14}/>} Jetzt abgleichen
        </button>
      </div>

      {flash && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, padding:'9px 12px', borderRadius:10, fontSize:12.5, fontWeight:600,
          background: flash.type==='error' ? '#FEF2F2' : '#ECFDF5', border:'1px solid '+(flash.type==='error'?'#FECACA':'#A7F3D0'),
          color: flash.type==='error' ? '#991B1B' : '#065F46' }}>
          <span style={{ flex:1 }}>{flash.text}</span>
          {flash.action && (
            <button onClick={() => navigate(flash.action.to)} style={{ padding:'4px 10px', background:'#fff', border:`1px solid ${RC.border}`, borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4 }}>
              {flash.action.label} <ExternalLink size={12}/>
            </button>
          )}
        </div>
      )}

      <div style={{ display:'flex', gap:14, flexWrap:'wrap', alignItems:'center', marginBottom:14 }}>
        <div><span style={{ fontSize:22, fontWeight:800, color:RC.text1 }}>{pending.length}</span> <span style={{ fontSize:12, color:RC.text3 }}>offen</span></div>
        <div><span style={{ fontSize:22, fontWeight:800, color:RC.text1 }}>{accepted.length}</span> <span style={{ fontSize:12, color:RC.text3 }}>angenommen</span></div>
        <div><span style={{ fontSize:22, fontWeight:800, color: acceptRate>=50?'#059669':acceptRate>=25?'#D97706':'#DC2626' }}>{acceptRate}%</span> <span style={{ fontSize:12, color:RC.text3 }}>Akzeptanzrate</span></div>
        <div style={{ flex:1 }}/>
        <label style={{ fontSize:12, color:RC.text2, display:'inline-flex', alignItems:'center', gap:6 }}>
          Automatisch zurückziehen nach
          <input type="number" min="0" value={withdrawDays} placeholder="21" onChange={e => saveWithdraw(e.target.value)}
            style={{ width:64, padding:'6px 8px', border:`1px solid ${RC.border}`, borderRadius:8, fontSize:13, textAlign:'center' }}/>
          Tagen <span style={{ color:RC.text3 }}>(0 = aus)</span>
        </label>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', color:RC.text3, fontSize:13, padding:'16px 0' }}><Loader2 size={16} className="lk-spin"/> Lädt…</div>
      ) : pending.length === 0 ? (
        <div style={{ textAlign:'center', color:RC.text3, fontSize:13, padding:'16px 0' }}>Keine offenen Vernetzungsanfragen.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {pending.map(inv => {
            const st = INV_STATUS[inv.status] || INV_STATUS.pending
            return (
              <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', padding:'10px 12px', border:`1px solid ${RC.border}`, borderRadius:10 }}>
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ fontSize:13.5, fontWeight:700, color:RC.text1 }}>{inv.invitee_name || 'Unbekannt'}</div>
                  <div style={{ fontSize:11.5, color:RC.text3, marginTop:2, display:'inline-flex', alignItems:'center', gap:4 }}>
                    <Clock size={11}/> gesendet {inviteAge(inv.sent_at)}
                  </div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, background:st.bg, color:st.color, border:`1px solid ${st.border}` }}>{st.label}</span>
                {inv.lead_id && (
                  <button onClick={() => navigate(`/leads/${inv.lead_id}`)} style={{ padding:'6px 10px', background:'#fff', border:`1px solid ${RC.border}`, borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4 }}>
                    im CRM <ExternalLink size={12}/>
                  </button>
                )}
                {inv.invitee_url && (
                  <a href={inv.invitee_url} target="_blank" rel="noopener noreferrer" style={{ padding:'6px 10px', background:'#fff', border:`1px solid ${RC.border}`, borderRadius:8, fontSize:12, fontWeight:600, textDecoration:'none', color:RC.text2, display:'inline-flex', alignItems:'center', gap:4 }}>
                    Profil <ExternalLink size={12}/>
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
      {notAccepted.length > 0 && (
        <div style={{ marginTop:18 }}>
          <div style={{ fontSize:13, fontWeight:800, color:RC.text1, marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
            <Clock size={15} color={RC.text3}/> Nicht angenommen ({notAccepted.length})
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {notAccepted.slice(0,20).map(inv => {
              const st = INV_STATUS[inv.status] || INV_STATUS.expired
              return (
                <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', padding:'10px 12px', border:`1px solid ${RC.border}`, borderRadius:10, opacity:0.85 }}>
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:RC.text1 }}>{inv.invitee_name || 'Unbekannt'}</div>
                    <div style={{ fontSize:11.5, color:RC.text3, marginTop:2 }}>gesendet {inviteAge(inv.sent_at)}</div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, background:st.bg, color:st.color, border:`1px solid ${st.border}` }}>{st.label}</span>
                  {inv.invitee_url && <a href={inv.invitee_url} target="_blank" rel="noopener noreferrer" style={{ padding:'6px 10px', background:'#fff', border:`1px solid ${RC.border}`, borderRadius:8, fontSize:12, fontWeight:600, textDecoration:'none', color:RC.text2, display:'inline-flex', alignItems:'center', gap:4 }}>Profil <ExternalLink size={12}/></a>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
