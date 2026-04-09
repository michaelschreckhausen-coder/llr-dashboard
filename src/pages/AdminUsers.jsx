import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ── SVG Icons ── */
const PlusIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const EditIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const TrashIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const ShieldIcon= () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const UserIcon  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const WarnIcon  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
const PlanIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>

/* ── Plan config ── */
const PLAN_CONFIG = {
  free:       { label: 'LinkedIn Suite Free',  color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1', desc: '50 Leads, 10 Listen' },
  starter:    { label: 'LinkedIn Suite Basic', color: '#0A66C2', bg: '#EFF6FF', border: '#BFDBFE', desc: '200 Leads, Pipeline, Brand Voice' },
  pro:        { label: 'LinkedIn Suite Pro',   color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', desc: '1000 Leads, alles inklusive' },
  enterprise: { label: 'Enterprise',           color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', desc: 'Unbegrenzt, alles inklusive' },
}

/* ── Modal ── */
function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:'#0F172A' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', width:30, height:30, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#94A3B8' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── PlanBadge ── */
function PlanBadge({ planId }) {
  const cfg = PLAN_CONFIG[planId] || PLAN_CONFIG.free
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:700, background:cfg.bg, color:cfg.color, border:'1px solid '+cfg.border }}>
      <PlanIcon /> {cfg.label}
    </span>
  )
}

/* ── RoleBadge ── */
function RoleBadge({ role }) {
  const isAdmin = role === 'admin'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:700, background:isAdmin?'#FFFBEB':'#EFF6FF', color:isAdmin?'#92400E':'#1D4ED8', border:'1px solid '+(isAdmin?'#FDE68A':'#BFDBFE') }}>
      {isAdmin ? <ShieldIcon/> : <UserIcon/>} {isAdmin ? 'Admin' : 'User'}
    </span>
  )
}

/* ── IconBtn ── */
function IconBtn({ onClick, title, danger, disabled, children }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ width:32, height:32, borderRadius:8, border:'1px solid '+(hov?(danger?'#FCA5A5':'#BFDBFE'):'#E2E8F0'), background:hov?(danger?'#FEF2F2':'#EFF6FF'):'transparent', cursor:disabled?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:hov?(danger?'#EF4444':'#0A66C2'):'#64748B', transition:'all 0.15s', opacity:disabled?0.4:1 }}
      onMouseOver={() => setHov(true)} onMouseOut={() => setHov(false)}>
      {children}
    </button>
  )
}

/* ══════════════════════════════════════
   ADMIN USERS HAUPTSEITE
══════════════════════════════════════ */
export default function AdminUsers({ session }) {
  const [users,       setUsers]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [flash,       setFlash]       = useState(null)
  const [addModal,    setAddModal]    = useState(false)
  const [editUser,    setEditUser]    = useState(null)
  const [deleteUser,  setDeleteUser]  = useState(null)
  const [planUser,    setPlanUser]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [selectedPlan,setSelectedPlan]= useState('free')
  const [crmDeleteUser, setCrmDeleteUser] = useState(null)
  const [crmDeleteOpts, setCrmDeleteOpts] = useState({ leads:true, activities:true, notes:true, history:true })
  const [crmDeleteResult, setCrmDeleteResult] = useState(null)
  const [form,        setForm]        = useState({ email:'', password:'', full_name:'', role:'user', plan_id:'free' })
  const [activeTab,   setActiveTab]   = useState('all')  // all | pending
  const [pendingUsers,setPendingUsers] = useState([])
  const [licenseUser, setLicenseUser] = useState(null)
  const [licenseForm, setLicenseForm] = useState({ plan_id:'starter', valid_days:365 })

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    const [{ data, error }, { data: pd }] = await Promise.all([
      supabase.rpc('admin_list_users'),
      supabase.rpc('admin_list_pending_users')
    ])
    if (error) showFlash(error.message, 'error')
    else setUsers(data || [])
    setPendingUsers(pd || [])
    setLoading(false)
  }

  function showFlash(msg, type = 'success') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  const [showPw, setShowPw] = useState(false)

  async function handleAddUser(e) {
    e.preventDefault()
    if (!form.email || !form.password) return showFlash('E-Mail und Passwort sind Pflichtfelder.', 'error')
    if (form.password.length < 8) return showFlash('Passwort muss mindestens 8 Zeichen haben.', 'error')
    setSaving(true)
    const { data, error } = await supabase.rpc('admin_create_user', {
      p_email: form.email.trim().toLowerCase(),
      p_password: form.password,
      p_full_name: form.full_name.trim(),
      p_role: form.role
    })
    setSaving(false)
    if (error) {
      const msg = error.message.includes('already exists')
        ? 'Diese E-Mail-Adresse ist bereits registriert.'
        : error.message.includes('Not authorized')
        ? 'Keine Berechtigung. Nur Admins dürfen Benutzer anlegen.'
        : 'Fehler: ' + error.message
      showFlash(msg, 'error')
      return
    }
    // Plan zuweisen wenn nicht Free
    if (form.plan_id !== 'free' && data) {
      await supabase.rpc('upsert_subscription', { p_email:form.email.trim().toLowerCase(), p_plan_id:form.plan_id, p_status:'active', p_wix_order:null, p_wix_plan:null, p_wix_member:null, p_period_end:null })
    }
    showFlash('✅ Benutzer ' + form.email + ' erfolgreich angelegt' + (form.plan_id !== 'free' ? ' mit ' + PLAN_CONFIG[form.plan_id].label : '') + '!')
    setAddModal(false)
    setShowPw(false)
    setForm({ email:'', password:'', full_name:'', role:'user', plan_id:'free' })
    loadUsers()
  }

  async function handleSetRole(userId, newRole) {
    setSaving(true)
    const { error } = await supabase.rpc('admin_set_role', { target_user_id:userId, new_role:newRole })
    setSaving(false)
    if (error) { showFlash(error.message, 'error'); return }
    showFlash('Rolle aktualisiert.')
    setEditUser(null)
    loadUsers()
  }

  async function handleSetPlan(email, planId) {
    setSaving(true)
    const { error } = await supabase.rpc('upsert_subscription', { p_email:email, p_plan_id:planId, p_status:'active', p_wix_order:null, p_wix_plan:null, p_wix_member:null, p_period_end:null })
    setSaving(false)
    if (error) { showFlash(error.message, 'error'); return }
    showFlash('Plan fuer ' + email + ' auf ' + PLAN_CONFIG[planId].label + ' gesetzt.')
    setPlanUser(null)
    loadUsers()
  }

  async function handleGrantLicense(userId) {
    setSaving(true)
    const { error } = await supabase.rpc('admin_grant_license', {
      p_user_id: userId,
      p_plan_id: licenseForm.plan_id,
      p_valid_days: parseInt(licenseForm.valid_days)
    })
    setSaving(false)
    if (error) { showFlash(error.message, 'error'); return }
    showFlash('✅ Lizenz erfolgreich vergeben!')
    setLicenseUser(null)
    loadUsers()
  }

  async function handleDelete(userId) {
    setSaving(true)
    const { error } = await supabase.rpc('admin_delete_user', { target_user_id:userId })
    setSaving(false)
    if (error) { showFlash(error.message, 'error'); setDeleteUser(null); return }
    showFlash('Benutzer geloescht.')
    setDeleteUser(null)
    loadUsers()
  }

  async function handleCrmDelete(userId) {
    setSaving(true)
    setCrmDeleteResult(null)
    const counts = { deleted: {}, errors: [] }

    // Zähle vorher die Datensätze
    const tables = []
    if (crmDeleteOpts.history)    tables.push({ t:'lead_field_history', join:'lead_id', via:'leads', viaField:'user_id' })
    if (crmDeleteOpts.activities) tables.push({ t:'activities',         direct:'user_id' })
    if (crmDeleteOpts.notes)      tables.push({ t:'contact_notes',      direct:'user_id' })
    if (crmDeleteOpts.leads)      tables.push({ t:'leads',              direct:'user_id' })

    for (const tbl of tables) {
      try {
        let query
        if (tbl.direct) {
          // Zählen
          const { count } = await supabase.from(tbl.t).select('*', { count:'exact', head:true }).eq(tbl.direct, userId)
          counts.deleted[tbl.t] = count || 0
          // Löschen
          const { error } = await supabase.from(tbl.t).delete().eq(tbl.direct, userId)
          if (error) counts.errors.push(`${tbl.t}: ${error.message}`)
        } else if (tbl.via) {
          // Erst Lead-IDs holen, dann darüber löschen
          const { data: leadIds } = await supabase.from(tbl.via).select('id').eq(tbl.viaField, userId)
          if (leadIds && leadIds.length > 0) {
            const ids = leadIds.map(l => l.id)
            const { count } = await supabase.from(tbl.t).select('*', { count:'exact', head:true }).in(tbl.join, ids)
            counts.deleted[tbl.t] = count || 0
            const { error } = await supabase.from(tbl.t).delete().in(tbl.join, ids)
            if (error) counts.errors.push(`${tbl.t}: ${error.message}`)
          } else {
            counts.deleted[tbl.t] = 0
          }
        }
      } catch(e) {
        counts.errors.push(`${tbl.t}: ${e.message}`)
      }
    }

    setSaving(false)
    setCrmDeleteResult(counts)
    if (counts.errors.length === 0) {
      showFlash(`CRM-Daten gelöscht: ${Object.values(counts.deleted).reduce((s,v)=>s+v,0)} Einträge entfernt.`)
    }
  }

  const lbl = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:14, fontFamily:'Inter,sans-serif', outline:'none', background:'#fff' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24, maxWidth:1000 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.025em', marginBottom:4 }}>Benutzerverwaltung</h1>
          <div style={{ fontSize:14, color:'#64748B' }}>{users.length} Benutzer registriert</div>
        </div>
        <button onClick={() => setAddModal(true)} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 20px', borderRadius:999, background:'#0A66C2', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
            <PlusIcon/> Benutzer hinzufuegen
        </button>
      </div>

          {/* Flash */}
          {flash && (
            <div style={{ padding:'12px 16px', borderRadius:10, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, background:flash.type==='error'?'#FEF2F2':'#F0FDF4', color:flash.type==='error'?'#991B1B':'#065F46', border:'1px solid '+(flash.type==='error'?'#FCA5A5':'#A7F3D0') }}>
              {flash.msg}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:'flex', gap:4, background:'#F8FAFC', borderRadius:12, padding:4, border:'1px solid #E2E8F0', width:'fit-content' }}>
            {[['all','Alle Nutzer',users.length],['pending','⏳ Ausstehend',pendingUsers.length]].map(([id,label,count]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                style={{ padding:'7px 16px', borderRadius:9, border:'none', fontSize:13, fontWeight:700, cursor:'pointer',
                  background:activeTab===id?'#fff':'transparent',
                  color:activeTab===id?(id==='pending'?'#D97706':'#0A66C2'):'#64748B',
                  boxShadow:activeTab===id?'0 1px 4px rgba(0,0,0,0.08)':'none' }}>
                {label} {count > 0 && <span style={{ marginLeft:4, background:id==='pending'?'#FEF3C7':'#EFF6FF', color:id==='pending'?'#D97706':'#0A66C2', borderRadius:99, padding:'1px 7px', fontSize:11 }}>{count}</span>}
              </button>
            ))}
          </div>

          {/* Pending Users Tab */}
          {activeTab === 'pending' && (
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #FDE68A', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', background:'#FFFBEB', borderBottom:'1px solid #FDE68A', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:18 }}>⏳</span>
                <div>
                  <div style={{ fontWeight:800, fontSize:14, color:'#92400E' }}>Ausstehende Aktivierungen</div>
                  <div style={{ fontSize:12, color:'#B45309' }}>Diese Nutzer haben sich registriert und warten auf eine Lizenz.</div>
                </div>
              </div>
              {pendingUsers.length === 0 ? (
                <div style={{ padding:40, textAlign:'center', color:'#94A3B8', fontSize:14 }}>✅ Keine ausstehenden Aktivierungen</div>
              ) : pendingUsers.map((user, idx) => (
                <div key={user.id} style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 20px', borderBottom:idx<pendingUsers.length-1?'1px solid #FEF9EC':'none',
                  background:idx%2===0?'#FFFDF5':'#fff' }}>
                  <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#F59E0B,#D97706)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>
                    {(user.full_name||user.email||'?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#0F172A' }}>{user.full_name||'—'}</div>
                    <div style={{ fontSize:12, color:'#94A3B8' }}>{user.email} · Registriert: {new Date(user.created_at).toLocaleDateString('de-DE')}</div>
                  </div>
                  <button onClick={() => { setLicenseUser(user); setLicenseForm({ plan_id:'starter', valid_days:365 }) }}
                    style={{ padding:'8px 18px', borderRadius:999, background:'#D97706', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                    🔑 Lizenz vergeben
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          {activeTab === 'all' && (
          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(15,23,42,0.06)', overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'56px 1fr 130px 120px 120px 90px', alignItems:'center', padding:'0 20px', height:42, background:'#F8FAFC', borderBottom:'1px solid #E2E8F0' }}>
              {['', 'Name & E-Mail', 'Rolle', 'Plan', 'Mitglied seit', 'Aktionen'].map((h, i) => (
                <div key={i} style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.09em', textAlign:i===5?'right':'left' }}>{h}</div>
              ))}
            </div>
            {loading ? (
              <div style={{ padding:56, textAlign:'center', color:'#94A3B8', fontSize:14 }}>⏳ Lade Benutzer…</div>
            ) : users.length === 0 ? (
              <div style={{ padding:56, textAlign:'center' }}>
                <div style={{ fontWeight:700, fontSize:14, color:'#475569' }}>Keine Benutzer gefunden</div>
              </div>
            ) : users.map((user, idx) => {
              const isMe = user.id === session.user.id
              const initials = (user.full_name || user.email || '?').substring(0, 2).toUpperCase()
              const avatarColors = ['#0A66C2','#10B981','#F59E0B','#8B5CF6','#EC4899','#0891B2']
              const bg = avatarColors[idx % avatarColors.length]
              const planId = user.plan_id || 'free'
              return (
                <div key={user.id} style={{ display:'grid', gridTemplateColumns:'56px 1fr 130px 120px 120px 90px', alignItems:'center', padding:'0 20px', minHeight:68, borderBottom:idx < users.length-1?'1px solid #F1F5F9':'none' }}
                  onMouseOver={e => e.currentTarget.style.background='#F8FAFC'}
                  onMouseOut={e => e.currentTarget.style.background='#fff'}>
                  <div>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,'+bg+','+bg+'CC)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>
                      {initials}
                    </div>
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#0F172A', display:'flex', alignItems:'center', gap:7 }}>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.full_name || '—'}</span>
                      {isMe && <span style={{ fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'1px 8px', borderRadius:999, border:'1px solid #BFDBFE', flexShrink:0 }}>Ich</span>}
                    </div>
                    <div style={{ fontSize:12, color:'#94A3B8', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</div>
                  </div>
                  <div><RoleBadge role={user.role}/></div>
                  <div>
                    <button onClick={() => { setPlanUser(user); setSelectedPlan(planId) }}
                      style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:700, background:PLAN_CONFIG[planId].bg, color:PLAN_CONFIG[planId].color, border:'1.5px dashed '+PLAN_CONFIG[planId].border, cursor:'pointer' }}
                      onMouseOver={e => { e.currentTarget.style.borderStyle='solid' }}
                      onMouseOut={e => { e.currentTarget.style.borderStyle='dashed' }}>
                      <PlanIcon/> {PLAN_CONFIG[planId].label}
                    </button>
                  </div>
                  <div style={{ fontSize:12, color:'#94A3B8', fontWeight:500 }}>
                    {new Date(user.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'short', year:'numeric' })}
                  </div>
                  <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                    <IconBtn onClick={() => setEditUser(user)} title="Rolle bearbeiten"><EditIcon/></IconBtn>
                    <IconBtn onClick={() => { setPlanUser(user); setSelectedPlan(planId) }} title="Plan bearbeiten"><PlanIcon/></IconBtn>
                    <IconBtn onClick={() => { setCrmDeleteUser(user); setCrmDeleteOpts({leads:true,activities:true,notes:true,history:true}); setCrmDeleteResult(null) }} title="CRM-Daten löschen" danger>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="9" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="15" y1="10" x2="15" y2="10"/></svg>
                    </IconBtn>
                    {!isMe && <IconBtn onClick={() => setDeleteUser(user)} title="Account löschen" danger><TrashIcon/></IconBtn>}
                  </div>
                </div>
              )
            })}
          </div>

          )}

          {/* Modal: Lizenz vergeben */}
          {licenseUser && (
            <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={() => setLicenseUser(null)}>
              <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width:460, maxWidth:'95vw' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding:'18px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontWeight:800, fontSize:15, color:'#0F172A' }}>🔑 Lizenz vergeben</div>
                  <button onClick={() => setLicenseUser(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:20 }}>×</button>
                </div>
                <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 16px', border:'1px solid #E2E8F0' }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#0F172A' }}>{licenseUser.full_name||'—'}</div>
                    <div style={{ fontSize:12, color:'#94A3B8' }}>{licenseUser.email}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Plan auswählen</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {[['free','Free','Basis-Zugang','#64748B'],['starter','Starter','200 Leads, Pipeline','#0A66C2'],['pro','Pro','1000 Leads, alles','#8B5CF6'],['enterprise','Enterprise','Unbegrenzt','#F59E0B']].map(([id,label,desc,color]) => (
                        <button key={id} onClick={() => setLicenseForm(f => ({...f, plan_id:id}))}
                          style={{ padding:'12px 14px', borderRadius:10, border:'2px solid '+(licenseForm.plan_id===id?color:'#E2E8F0'), background:licenseForm.plan_id===id?color+'15':'#F8FAFC', textAlign:'left', cursor:'pointer' }}>
                          <div style={{ fontWeight:700, fontSize:13, color:licenseForm.plan_id===id?color:'#0F172A' }}>{label}</div>
                          <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Laufzeit</div>
                    <div style={{ display:'flex', gap:8 }}>
                      {[[30,'30 Tage'],[90,'90 Tage'],[365,'1 Jahr'],[730,'2 Jahre']].map(([days,label]) => (
                        <button key={days} onClick={() => setLicenseForm(f => ({...f, valid_days:days}))}
                          style={{ flex:1, padding:'8px 4px', borderRadius:8, border:'1.5px solid '+(licenseForm.valid_days===days?'#0A66C2':'#E2E8F0'), background:licenseForm.valid_days===days?'#EFF6FF':'#F8FAFC', fontSize:12, fontWeight:700, color:licenseForm.valid_days===days?'#0A66C2':'#64748B', cursor:'pointer' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
                  <button onClick={() => setLicenseUser(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
                  <button onClick={() => handleGrantLicense(licenseUser.id)} disabled={saving}
                    style={{ padding:'8px 22px', borderRadius:999, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.6:1 }}>
                    {saving ? '⏳' : '✅ Lizenz aktivieren'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: Plan */}
          {planUser && (
            <Modal title="Abo-Plan anpassen" onClose={() => setPlanUser(null)} width={500}>
              <div style={{ padding:'20px 24px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#F8FAFC', borderRadius:10, marginBottom:20, border:'1px solid #E2E8F0' }}>
                  <div style={{ width:42, height:42, borderRadius:'50%', background:'linear-gradient(135deg,#0A66C2,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#fff', flexShrink:0 }}>
                    {(planUser.full_name||planUser.email||'?').substring(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#0F172A' }}>{planUser.full_name || '—'}</div>
                    <div style={{ fontSize:12, color:'#94A3B8', marginTop:1 }}>{planUser.email}</div>
                  </div>
                  <PlanBadge planId={planUser.plan_id || 'free'} />
                </div>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Plan auswaehlen</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {Object.entries(PLAN_CONFIG).map(([id, cfg]) => {
                    const isSelected = selectedPlan === id
                    const isCurrent = planUser.plan_id === id
                    return (
                      <button key={id} onClick={() => setSelectedPlan(id)}
                        style={{ padding:'14px 16px', borderRadius:12, cursor:'pointer', border:'2px solid '+(isSelected?cfg.color:cfg.border), background:isSelected?cfg.bg:'#FAFAFA', textAlign:'left', position:'relative' }}
                        onMouseOver={e => { if(!isSelected) e.currentTarget.style.borderColor=cfg.color }}
                        onMouseOut={e => { if(!isSelected) e.currentTarget.style.borderColor=cfg.border }}>
                        {isCurrent && <div style={{ position:'absolute', top:8, right:8, fontSize:9, fontWeight:700, background:cfg.color, color:'#fff', padding:'1px 7px', borderRadius:999 }}>AKTUELL</div>}
                        <div style={{ fontWeight:800, fontSize:14, color:isSelected?cfg.color:'#0F172A', marginBottom:4 }}>{cfg.label}</div>
                        <div style={{ fontSize:11, color:'#64748B' }}>{cfg.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #F1F5F9' }}>
                <div style={{ fontSize:12, color:'#94A3B8' }}>Aenderung ist sofort wirksam</div>
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => setPlanUser(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
                  <button onClick={() => handleSetPlan(planUser.email, selectedPlan)} disabled={saving || selectedPlan === (planUser.plan_id||'free')}
                    style={{ padding:'8px 20px', borderRadius:999, border:'none', background:selectedPlan===(planUser.plan_id||'free')?'#E2E8F0':PLAN_CONFIG[selectedPlan].color, color:selectedPlan===(planUser.plan_id||'free')?'#94A3B8':'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.6:1 }}>
                    {saving ? '⏳' : 'Plan speichern'}
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {/* Modal: Add User */}
          {addModal && (
            <Modal title="👤 Neuen Benutzer anlegen" onClose={() => { setAddModal(false); setShowPw(false); setForm({ email:'', password:'', full_name:'', role:'user' }) }}>
              <form onSubmit={handleAddUser}>
                <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
                  <div>
                    <label style={lbl}>Vollstaendiger Name</label>
                    <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name:e.target.value}))} style={inp} placeholder="Max Mustermann"/>
                  </div>
                  <div>
                    <label style={lbl}>E-Mail *</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email:e.target.value}))} style={inp} placeholder="benutzer@firma.de" required/>
                  </div>
                  <div>
                    <label style={lbl}>Passwort *</label>
                    <div style={{ display:'flex', gap:8 }}>
                      <div style={{ position:'relative', flex:1 }}>
                        <input type={showPw?'text':'password'} value={form.password}
                          onChange={e => setForm(f => ({...f, password:e.target.value}))}
                          style={{...inp, paddingRight:40}} placeholder="Mindestens 8 Zeichen" required minLength={8}/>
                        <button type="button" onClick={() => setShowPw(v => !v)}
                          style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#64748B', fontSize:15 }}>
                          {showPw ? '🙈' : '👁'}
                        </button>
                      </div>
                      <button type="button"
                        onClick={() => {
                          const pw = Math.random().toString(36).slice(-4) + Math.random().toString(36).toUpperCase().slice(-4) + '!'
                          setForm(f => ({...f, password:pw}))
                          setShowPw(true)
                        }}
                        title="Sicheres Passwort generieren"
                        style={{ padding:'0 12px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'#F8FAFC', color:'#475569', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                        🎲 Generieren
                      </button>
                    </div>
                    {form.password && (
                      <div style={{ marginTop:6, display:'flex', gap:4, alignItems:'center' }}>
                        {[1,2,3,4].map(i => (
                          <div key={i} style={{ flex:1, height:3, borderRadius:99, background:
                            form.password.length < 8 ? (i<=1?'#EF4444':'#E2E8F0') :
                            form.password.length < 12 ? (i<=2?'#F59E0B':'#E2E8F0') :
                            form.password.length < 16 ? (i<=3?'#3B82F6':'#E2E8F0') : '#22c55e'
                          }}/>
                        ))}
                        <span style={{ fontSize:10, color:'#94A3B8', whiteSpace:'nowrap' }}>
                          {form.password.length < 8 ? 'Zu kurz' : form.password.length < 12 ? 'Schwach' : form.password.length < 16 ? 'Mittel' : 'Stark'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={lbl}>Rolle</label>
                    <div style={{ display:'flex', gap:10, marginTop:6 }}>
                      {[['user','User','Standard-Zugriff'],['admin','Admin','Voller Zugriff']].map(([r,label,desc]) => (
                        <label key={r} style={{ flex:1, display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', borderRadius:10, border:'2px solid '+(form.role===r?'#0A66C2':'#E2E8F0'), background:form.role===r?'#EFF6FF':'#F8FAFC', cursor:'pointer' }}>
                          <input type="radio" name="role" value={r} checked={form.role===r} onChange={() => setForm(f => ({...f,role:r}))} style={{ marginTop:2 }}/>
                          <span>
                            <div style={{ fontWeight:700, fontSize:13, color:form.role===r?'#0A66C2':'#0F172A' }}>{label}</div>
                            <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>{desc}</div>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
                  <button type="button" onClick={() => setAddModal(false)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
                  <button type="submit" disabled={saving||!form.email||!form.password} style={{ padding:'8px 20px', borderRadius:999, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:(!form.email||!form.password)?0.5:1 }}>
                    {saving ? '⏳' : 'Benutzer erstellen'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {/* Modal: Edit Role */}
          {editUser && (
            <Modal title="Rolle bearbeiten" onClose={() => setEditUser(null)} width={420}>
              <div style={{ padding:'20px 24px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#F8FAFC', borderRadius:10, marginBottom:20, border:'1px solid #E2E8F0' }}>
                  <div style={{ width:42, height:42, borderRadius:'50%', background:'linear-gradient(135deg,#0A66C2,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#fff', flexShrink:0 }}>
                    {(editUser.full_name||editUser.email).substring(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#0F172A' }}>{editUser.full_name||'—'}</div>
                    <div style={{ fontSize:12, color:'#94A3B8', marginTop:1 }}>{editUser.email}</div>
                  </div>
                  <RoleBadge role={editUser.role}/>
                </div>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Neue Rolle auswaehlen</div>
                <div style={{ display:'flex', gap:10 }}>
                  {[['user','User','Standard-Zugriff'],['admin','Admin','Voller Zugriff']].map(([r,label,desc]) => (
                    <button key={r} onClick={() => handleSetRole(editUser.id, r)} disabled={saving||editUser.role===r}
                      style={{ flex:1, padding:'16px 12px', borderRadius:12, cursor:editUser.role===r?'default':'pointer', border:'2px solid '+(editUser.role===r?'#0A66C2':'#E2E8F0'), background:editUser.role===r?'#EFF6FF':'#F8FAFC', opacity:saving?0.5:1, textAlign:'center' }}>
                      <div style={{ fontWeight:700, fontSize:13, color:editUser.role===r?'#0A66C2':'#0F172A' }}>{label}</div>
                      <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>{desc}</div>
                      {editUser.role===r && <div style={{ fontSize:10, color:'#0A66C2', marginTop:6, fontWeight:700 }}>Aktuell</div>}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ padding:'10px 24px 18px', textAlign:'right', borderTop:'1px solid #F1F5F9' }}>
                <button onClick={() => setEditUser(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Schliessen</button>
              </div>
            </Modal>
          )}

          {/* Modal: Delete */}
          {deleteUser && (
            <Modal title="Benutzer loeschen" onClose={() => setDeleteUser(null)} width={440}>
              <div style={{ padding:'28px 28px 20px', textAlign:'center' }}>
                <div style={{ width:60, height:60, borderRadius:'50%', background:'#FEF2F2', border:'1.5px solid #FCA5A5', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', color:'#EF4444' }}>
                  <WarnIcon/>
                </div>
                <div style={{ fontWeight:800, fontSize:17, color:'#0F172A', marginBottom:8 }}>Wirklich loeschen?</div>
                <div style={{ fontSize:14, color:'#64748B', lineHeight:1.65, marginBottom:18 }}>
                  Der Benutzer <strong style={{ color:'#0F172A' }}>{deleteUser.email}</strong> wird dauerhaft geloescht.
                </div>
              </div>
              <div style={{ padding:'0 28px 24px', display:'flex', justifyContent:'center', gap:10, borderTop:'1px solid #F1F5F9', paddingTop:16 }}>
                <button onClick={() => setDeleteUser(null)} style={{ padding:'9px 22px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
                <button onClick={() => handleDelete(deleteUser.id)} disabled={saving}
                  style={{ padding:'9px 22px', borderRadius:999, border:'none', background:'#EF4444', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.5:1, display:'flex', alignItems:'center', gap:7 }}>
                  {saving ? '⏳' : <><TrashIcon/> Endgueltig loeschen</>}
                </button>
              </div>
            </Modal>
          )}

          {/* ── CRM-Daten Lösch-Modal ── */}
          {crmDeleteUser && (
            <Modal title="CRM-Daten löschen" onClose={() => { setCrmDeleteUser(null); setCrmDeleteResult(null) }} width={500}>
              <div style={{ padding:'20px 24px' }}>

                {/* User Info */}
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#FFF7F7', borderRadius:10, marginBottom:20, border:'1px solid #FCA5A5' }}>
                  <div style={{ width:42, height:42, borderRadius:'50%', background:'linear-gradient(135deg,#EF4444,#F87171)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#fff', flexShrink:0 }}>
                    {(crmDeleteUser.full_name||crmDeleteUser.email||'?').substring(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:'#0F172A' }}>{crmDeleteUser.full_name || '—'}</div>
                    <div style={{ fontSize:12, color:'#94A3B8' }}>{crmDeleteUser.email}</div>
                  </div>
                </div>

                {/* Warnung */}
                <div style={{ display:'flex', gap:10, padding:'10px 14px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, marginBottom:20 }}>
                  <span style={{ fontSize:16 }}>⚠️</span>
                  <div style={{ fontSize:12, color:'#92400E', lineHeight:1.5 }}>
                    Diese Aktion löscht unwiderruflich alle ausgewählten CRM-Daten dieses Benutzers. Der Account bleibt erhalten.
                  </div>
                </div>

                {/* Checkboxen */}
                <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:12 }}>Was soll gelöscht werden?</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                  {[
                    { key:'leads',      label:'Leads & Interessenten',  desc:'Alle Lead-Datensätze mit CRM-Feldern, Scores, AI-Daten', icon:'👤', color:'#EF4444' },
                    { key:'activities', label:'Aktivitäten (Timeline)', desc:'Alle Calls, Meetings, E-Mails, LinkedIn-Aktivitäten',    icon:'📋', color:'#3B82F6' },
                    { key:'notes',      label:'Notizen',                desc:'Alle Kontakt-Notizen aus dem Notizen-Tab',               icon:'📝', color:'#8B5CF6' },
                    { key:'history',    label:'Feld-Verlauf (Audit)',   desc:'Alle CRM-Änderungshistorie (lead_field_history)',        icon:'🔍', color:'#64748B' },
                  ].map(({ key, label, desc, icon, color }) => (
                    <label key={key} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 14px', borderRadius:10, border:'1.5px solid '+(crmDeleteOpts[key]?color+'40':'#E2E8F0'), background:crmDeleteOpts[key]?color+'08':'#FAFAFA', cursor:'pointer' }}>
                      <input type="checkbox" checked={crmDeleteOpts[key]}
                        onChange={e => setCrmDeleteOpts(o => ({ ...o, [key]: e.target.checked }))}
                        style={{ marginTop:2, accentColor:color, width:16, height:16, flexShrink:0 }}/>
                      <div>
                        <div style={{ fontWeight:700, fontSize:13, color:'#0F172A' }}>{icon} {label}</div>
                        <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Ergebnis nach Ausführung */}
                {crmDeleteResult && (
                  <div style={{ padding:'12px 16px', background: crmDeleteResult.errors.length > 0 ? '#FEF2F2' : '#F0FDF4', border:'1px solid '+(crmDeleteResult.errors.length>0?'#FCA5A5':'#86EFAC'), borderRadius:8, marginBottom:16 }}>
                    <div style={{ fontWeight:700, fontSize:13, marginBottom:8, color: crmDeleteResult.errors.length>0?'#991B1B':'#166534' }}>
                      {crmDeleteResult.errors.length > 0 ? '❌ Teilweise Fehler' : '✅ Erfolgreich gelöscht'}
                    </div>
                    {Object.entries(crmDeleteResult.deleted).map(([t, n]) => (
                      <div key={t} style={{ fontSize:12, color:'#374151', display:'flex', justifyContent:'space-between' }}>
                        <span>{t}</span><strong>{n} Einträge</strong>
                      </div>
                    ))}
                    {crmDeleteResult.errors.map((e, i) => (
                      <div key={i} style={{ fontSize:11, color:'#EF4444', marginTop:4 }}>{e}</div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ padding:'0 24px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #F1F5F9', paddingTop:16 }}>
                <button onClick={() => { setCrmDeleteUser(null); setCrmDeleteResult(null) }}
                  style={{ padding:'9px 22px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  {crmDeleteResult ? 'Schließen' : 'Abbrechen'}
                </button>
                {!crmDeleteResult && (
                  <button
                    onClick={() => handleCrmDelete(crmDeleteUser.id)}
                    disabled={saving || !Object.values(crmDeleteOpts).some(Boolean)}
                    style={{ padding:'9px 22px', borderRadius:999, border:'none', background: saving||!Object.values(crmDeleteOpts).some(Boolean) ? '#CBD5E1' : '#EF4444', color:'#fff', fontSize:13, fontWeight:700, cursor: saving||!Object.values(crmDeleteOpts).some(Boolean)?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:7 }}>
                    {saving ? '⏳ Lösche...' : <><TrashIcon/> CRM-Daten löschen</>}
                  </button>
                )}
              </div>
            </Modal>
          )}
    </div>
  )
}
