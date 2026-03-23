import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ── SVG Icons ── */
const PlusIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const EditIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const TrashIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const ShieldIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const UserIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const WarnIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>

/* ── Modal ── */
function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto', animation:'fadeInUp 0.2s ease-out' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:'#0F172A', letterSpacing:'-0.01em' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', width:30, height:30, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#94A3B8', transition:'all 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.background='#F1F5F9'; e.currentTarget.style.color='#475569'; }}
            onMouseOut={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='#94A3B8'; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── Role Badge ── */
function RoleBadge({ role }) {
  const isAdmin = role === 'admin'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:700, letterSpacing:'0.02em', background:isAdmin?'#FFFBEB':'#EFF6FF', color:isAdmin?'#92400E':'#1D4ED8', border:'1px solid '+(isAdmin?'#FDE68A':'#BFDBFE') }}>
      {isAdmin ? <ShieldIcon/> : <UserIcon/>}
      {isAdmin ? 'Admin' : 'User'}
    </span>
  )
}

/* ── Icon Button ── */
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

export default function AdminUsers({ session }) {
  const [users,      setUsers]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [flash,      setFlash]      = useState(null)
  const [addModal,   setAddModal]   = useState(false)
  const [editUser,   setEditUser]   = useState(null)
  const [deleteUser, setDeleteUser] = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [form,       setForm]       = useState({ email:'', password:'', full_name:'', role:'user' })

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_users')
    if (error) showFlash(error.message, 'error')
    else setUsers(data || [])
    setLoading(false)
  }

  function showFlash(msg, type = 'success') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  async function handleAddUser(e) {
    e.preventDefault()
    if (!form.email || !form.password) return showFlash('E-Mail und Passwort sind Pflichtfelder.', 'error')
    setSaving(true)
    const { error } = await supabase.rpc('admin_create_user', { p_email:form.email, p_password:form.password, p_full_name:form.full_name, p_role:form.role })
    setSaving(false)
    if (error) { showFlash(error.message, 'error'); return }
    showFlash('Benutzer erfolgreich erstellt.')
    setAddModal(false)
    setForm({ email:'', password:'', full_name:'', role:'user' })
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

  async function handleDelete(userId) {
    setSaving(true)
    const { error } = await supabase.rpc('admin_delete_user', { target_user_id:userId })
    setSaving(false)
    if (error) { showFlash(error.message, 'error'); setDeleteUser(null); return }
    showFlash('Benutzer gelöscht.')
    setDeleteUser(null)
    loadUsers()
  }

  const lbl = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:14, fontFamily:'Inter,sans-serif', outline:'none', transition:'border 0.15s', background:'#fff' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24, maxWidth:960 }}>

      {/* ── Page Header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.025em', marginBottom:4 }}>Benutzerverwaltung</h1>
          <div style={{ fontSize:14, color:'#64748B', display:'flex', alignItems:'center', gap:6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {users.length} Benutzer registriert
          </div>
        </div>
        <button onClick={() => setAddModal(true)}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 20px', borderRadius:999, background:'#0A66C2', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 1px 3px rgba(10,102,194,0.3)', transition:'all 0.18s', flexShrink:0 }}
          onMouseOver={e => { e.currentTarget.style.background='#0958A8'; e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(10,102,194,0.35)'; }}
          onMouseOut={e => { e.currentTarget.style.background='#0A66C2'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 1px 3px rgba(10,102,194,0.3)'; }}>
          <PlusIcon/> Benutzer hinzufügen
        </button>
      </div>

      {/* ── Flash notification ── */}
      {flash && (
        <div style={{ padding:'12px 16px', borderRadius:10, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, background:flash.type==='error'?'#FEF2F2':'#F0FDF4', color:flash.type==='error'?'#991B1B':'#065F46', border:'1px solid '+(flash.type==='error'?'#FCA5A5':'#A7F3D0'), boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
          {flash.type === 'error'
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          }
          {flash.msg}
        </div>
      )}

      {/* ── Users Table ── */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(15,23,42,0.06)', overflow:'hidden' }}>

        {/* Table header */}
        <div style={{ display:'grid', gridTemplateColumns:'56px 1fr 150px 130px 90px', alignItems:'center', padding:'0 24px', height:42, background:'#F8FAFC', borderBottom:'1px solid #E2E8F0' }}>
          {['', 'Name & E-Mail', 'Rolle', 'Mitglied seit', 'Aktionen'].map((h, i) => (
            <div key={i} style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.09em', textAlign:i===4?'right':'left' }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding:56, textAlign:'center', color:'#94A3B8', fontSize:14 }}>
            <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
            Lade Benutzer…
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding:56, textAlign:'center' }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div style={{ fontWeight:700, fontSize:14, color:'#475569' }}>Keine Benutzer gefunden</div>
          </div>
        ) : users.map((user, idx) => {
          const isMe = user.id === session.user.id
          const initials = (user.full_name || user.email || '?').substring(0, 2).toUpperCase()
          const avatarColors = ['#0A66C2','#10B981','#F59E0B','#8B5CF6','#EC4899','#0891B2']
          const bg = avatarColors[idx % avatarColors.length]
          return (
            <div key={user.id}
              style={{ display:'grid', gridTemplateColumns:'56px 1fr 150px 130px 90px', alignItems:'center', padding:'0 24px', minHeight:68, borderBottom: idx < users.length-1 ? '1px solid #F1F5F9' : 'none', transition:'background 0.12s' }}
              onMouseOver={e => e.currentTarget.style.background='#F8FAFC'}
              onMouseOut={e => e.currentTarget.style.background='#fff'}>

              {/* Avatar */}
              <div>
                <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg, '+bg+', '+bg+'CC)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', boxShadow:'0 0 0 2px #fff, 0 0 0 3px '+bg+'44' }}>
                  {initials}
                </div>
              </div>

              {/* Name + Email */}
              <div style={{ minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, color:'#0F172A', display:'flex', alignItems:'center', gap:7, overflow:'hidden' }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.full_name || '—'}</span>
                  {isMe && <span style={{ fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'1px 8px', borderRadius:999, border:'1px solid #BFDBFE', flexShrink:0 }}>Ich</span>}
                </div>
                <div style={{ fontSize:12, color:'#94A3B8', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</div>
              </div>

              {/* Role */}
              <div><RoleBadge role={user.role}/></div>

              {/* Date */}
              <div style={{ fontSize:12, color:'#94A3B8', fontWeight:500 }}>
                {new Date(user.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'short', year:'numeric' })}
              </div>

              {/* Actions */}
              <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                <IconBtn onClick={() => setEditUser(user)} title="Rolle bearbeiten"><EditIcon/></IconBtn>
                {!isMe && <IconBtn onClick={() => setDeleteUser(user)} title="Benutzer löschen" danger><TrashIcon/></IconBtn>}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── MODAL: Add User ── */}
      {addModal && (
        <Modal title="Neuen Benutzer anlegen" onClose={() => { setAddModal(false); setForm({ email:'', password:'', full_name:'', role:'user' }) }}>
          <form onSubmit={handleAddUser}>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={lbl}>Vollständiger Name</label>
                <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name:e.target.value}))} style={inp} placeholder="Max Mustermann"
                  onFocus={e => e.target.style.borderColor='#0A66C2'} onBlur={e => e.target.style.borderColor='#E2E8F0'}/>
              </div>
              <div>
                <label style={lbl}>E-Mail *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email:e.target.value}))} style={inp} placeholder="benutzer@firma.de" required
                  onFocus={e => e.target.style.borderColor='#0A66C2'} onBlur={e => e.target.style.borderColor='#E2E8F0'}/>
              </div>
              <div>
                <label style={lbl}>Passwort *</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password:e.target.value}))} style={inp} placeholder="Mindestens 8 Zeichen" required minLength={8}
                  onFocus={e => e.target.style.borderColor='#0A66C2'} onBlur={e => e.target.style.borderColor='#E2E8F0'}/>
              </div>
              <div>
                <label style={lbl}>Rolle</label>
                <div style={{ display:'flex', gap:10, marginTop:6 }}>
                  {[['user', <UserIcon/>, 'User', 'Standard-Zugriff'], ['admin', <ShieldIcon/>, 'Admin', 'Voller Zugriff']].map(([r, icon, label, desc]) => (
                    <label key={r} style={{ flex:1, display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', borderRadius:10, border:'2px solid '+(form.role===r?'#0A66C2':'#E2E8F0'), background:form.role===r?'#EFF6FF':'#F8FAFC', cursor:'pointer', transition:'all 0.15s' }}>
                      <input type="radio" name="role" value={r} checked={form.role===r} onChange={() => setForm(f => ({...f,role:r}))} style={{ marginTop:2, accentColor:'#0A66C2' }}/>
                      <span>
                        <div style={{ fontWeight:700, fontSize:13, color:form.role===r?'#0A66C2':'#0F172A', display:'flex', alignItems:'center', gap:5 }}>{icon} {label}</div>
                        <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>{desc}</div>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
              <button type="button" onClick={() => setAddModal(false)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button type="submit" disabled={saving || !form.email || !form.password} style={{ padding:'8px 20px', borderRadius:999, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:(!form.email||!form.password)?0.5:1, display:'flex', alignItems:'center', gap:7 }}>
                {saving ? '⏳' : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Benutzer erstellen</>}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── MODAL: Edit Role ── */}
      {editUser && (
        <Modal title="Rolle bearbeiten" onClose={() => setEditUser(null)} width={420}>
          <div style={{ padding:'20px 24px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#F8FAFC', borderRadius:10, marginBottom:20, border:'1px solid #E2E8F0' }}>
              <div style={{ width:42, height:42, borderRadius:'50%', background:'linear-gradient(135deg,#0A66C2,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#fff', flexShrink:0 }}>
                {(editUser.full_name||editUser.email).substring(0,2).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{editUser.full_name || '—'}</div>
                <div style={{ fontSize:12, color:'#94A3B8', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{editUser.email}</div>
              </div>
              <RoleBadge role={editUser.role}/>
            </div>
            <label style={lbl}>Neue Rolle auswählen</label>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              {[['user', <UserIcon/>, 'User', 'Standard-Zugriff'], ['admin', <ShieldIcon/>, 'Admin', 'Voller Zugriff']].map(([r, icon, label, desc]) => (
                <button key={r} onClick={() => handleSetRole(editUser.id, r)} disabled={saving || editUser.role===r}
                  style={{ flex:1, padding:'16px 12px', borderRadius:12, cursor:editUser.role===r?'default':'pointer', border:'2px solid '+(editUser.role===r?'#0A66C2':'#E2E8F0'), background:editUser.role===r?'#EFF6FF':'#F8FAFC', opacity:saving?0.5:1, transition:'all 0.18s', textAlign:'center' }}
                  onMouseOver={e => { if(editUser.role!==r) { e.currentTarget.style.borderColor='#0A66C2'; e.currentTarget.style.background='#EFF6FF'; }}}
                  onMouseOut={e => { if(editUser.role!==r) { e.currentTarget.style.borderColor='#E2E8F0'; e.currentTarget.style.background='#F8FAFC'; }}}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:editUser.role===r?'#DBEAFE':'#E2E8F0', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 8px', color:editUser.role===r?'#1D4ED8':'#64748B' }}>
                    {icon}
                  </div>
                  <div style={{ fontWeight:700, fontSize:13, color:editUser.role===r?'#0A66C2':'#0F172A' }}>{label}</div>
                  <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>{desc}</div>
                  {editUser.role===r && <div style={{ fontSize:10, color:'#0A66C2', marginTop:6, fontWeight:700, background:'#DBEAFE', padding:'2px 8px', borderRadius:999, display:'inline-block' }}>Aktuell</div>}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding:'10px 24px 18px', textAlign:'right', borderTop:'1px solid #F1F5F9' }}>
            <button onClick={() => setEditUser(null)} style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Schließen</button>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Delete Confirm ── */}
      {deleteUser && (
        <Modal title="Benutzer löschen" onClose={() => setDeleteUser(null)} width={440}>
          <div style={{ padding:'28px 28px 20px', textAlign:'center' }}>
            <div style={{ width:60, height:60, borderRadius:'50%', background:'#FEF2F2', border:'1.5px solid #FCA5A5', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', color:'#EF4444' }}>
              <WarnIcon/>
            </div>
            <div style={{ fontWeight:800, fontSize:17, color:'#0F172A', marginBottom:8, letterSpacing:'-0.01em' }}>Wirklich löschen?</div>
            <div style={{ fontSize:14, color:'#64748B', lineHeight:1.65, marginBottom:18 }}>
              Der Benutzer <strong style={{ color:'#0F172A' }}>{deleteUser.email}</strong> wird dauerhaft gelöscht.<br/>
              Alle zugehörigen Daten werden ebenfalls entfernt.
            </div>
            <div style={{ padding:'11px 16px', background:'#FFF7ED', border:'1px solid #FDE68A', borderRadius:8, fontSize:12, color:'#92400E', fontWeight:600, display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </div>
          </div>
          <div style={{ padding:'0 28px 24px', display:'flex', justifyContent:'center', gap:10, borderTop:'1px solid #F1F5F9', paddingTop:16 }}>
            <button onClick={() => setDeleteUser(null)} style={{ padding:'9px 22px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            <button onClick={() => handleDelete(deleteUser.id)} disabled={saving}
              style={{ padding:'9px 22px', borderRadius:999, border:'none', background:'#EF4444', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.5:1, display:'flex', alignItems:'center', gap:7, boxShadow:'0 1px 3px rgba(239,68,68,0.3)' }}>
              {saving ? '⏳' : <><TrashIcon/> Endgültig löschen</>}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
