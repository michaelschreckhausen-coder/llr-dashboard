import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ── Modal ── */
function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 20px 60px rgba(15,23,42,0.15)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700, fontSize:15, color:'#0F172A' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', width:28, height:28, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#94A3B8', fontSize:18, lineHeight:1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── Role Badge ── */
function RoleBadge({ role }) {
  const styles = {
    admin: { bg:'#FFFBEB', color:'#92400E', border:'#FDE68A', icon:'👑' },
    user:  { bg:'#EFF6FF', color:'#1D4ED8', border:'#BFDBFE', icon:'👤' },
  }
  const s = styles[role] || styles.user
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:700, background:s.bg, color:s.color, border:'1px solid '+s.border }}>
      {s.icon} {role === 'admin' ? 'Admin' : 'User'}
    </span>
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
  const [hoveredRow, setHoveredRow] = useState(null)
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
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:14, fontFamily:'Inter,sans-serif', outline:'none', transition:'border 0.15s' }

  return (
    <div>
      {/* ── Page Header ── */}
      <div style={{ marginBottom:24, display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.025em', marginBottom:4 }}>Benutzerverwaltung</h1>
          <div style={{ fontSize:14, color:'#64748B' }}>{users.length} Benutzer registriert</div>
        </div>
        <button onClick={() => setAddModal(true)}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 20px', borderRadius:999, background:'#0A66C2', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 1px 3px rgba(10,102,194,0.3)', transition:'all 0.18s', flexShrink:0 }}
          onMouseOver={e => { e.currentTarget.style.background='#0958A8'; e.currentTarget.style.transform='translateY(-1px)'; }}
          onMouseOut={e => { e.currentTarget.style.background='#0A66C2'; e.currentTarget.style.transform='translateY(0)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Benutzer hinzufügen
        </button>
      </div>

      {/* ── Flash ── */}
      {flash && (
        <div style={{ marginBottom:16, padding:'11px 16px', borderRadius:10, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8,
          background: flash.type==='error'?'#FEF2F2':'#F0FDF4',
          color:       flash.type==='error'?'#991B1B':'#065F46',
          border:      '1px solid '+(flash.type==='error'?'#FCA5A5':'#A7F3D0'),
        }}>
          {flash.type==='error' ? '⚠️' : '✓'} {flash.msg}
        </div>
      )}

      {/* ── Table Card ── */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(15,23,42,0.06)', overflow:'hidden' }}>

        {/* Column headers */}
        <div style={{ display:'grid', gridTemplateColumns:'52px 1fr 140px 120px 100px', alignItems:'center', padding:'0 20px', height:40, background:'#F8FAFC', borderBottom:'1px solid #E2E8F0' }}>
          {['', 'Name & E-Mail', 'Rolle', 'Hinzugefügt', 'Aktionen'].map((h, i) => (
            <div key={i} style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em', textAlign: i===4?'right':'left' }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding:48, textAlign:'center', color:'#94A3B8', fontSize:14 }}>⏳ Lade Benutzer…</div>
        ) : users.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'#94A3B8' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
            <div style={{ fontWeight:600, fontSize:14 }}>Keine Benutzer gefunden</div>
          </div>
        ) : users.map(user => {
          const isMe  = user.id === session.user.id
          const isHov = hoveredRow === user.id
          const initials = (user.full_name || user.email || '?').charAt(0).toUpperCase()
          return (
            <div key={user.id}
              style={{ display:'grid', gridTemplateColumns:'52px 1fr 140px 120px 100px', alignItems:'center', padding:'0 20px', minHeight:64, borderBottom:'1px solid #F1F5F9', background:isHov?'#F8FAFC':'#fff', transition:'background 0.12s' }}
              onMouseEnter={() => setHoveredRow(user.id)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {/* Avatar */}
              <div>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg, #0A66C2, #3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', boxShadow:'0 0 0 2px #fff, 0 0 0 3px #E2E8F0' }}>
                  {initials}
                </div>
              </div>

              {/* Name + email */}
              <div style={{ minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, color:'#0F172A', display:'flex', alignItems:'center', gap:7, overflow:'hidden' }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.full_name || '—'}</span>
                  {isMe && <span style={{ fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'1px 7px', borderRadius:999, border:'1px solid #BFDBFE', flexShrink:0 }}>Ich</span>}
                </div>
                <div style={{ fontSize:12, color:'#94A3B8', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</div>
              </div>

              {/* Role */}
              <div><RoleBadge role={user.role}/></div>

              {/* Date */}
              <div style={{ fontSize:12, color:'#94A3B8', fontWeight:500 }}>
                {new Date(user.created_at).toLocaleDateString('de-DE')}
              </div>

              {/* Actions */}
              <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                <button onClick={() => setEditUser(user)} title="Rolle bearbeiten"
                  style={{ width:32, height:32, borderRadius:8, border:'1px solid #E2E8F0', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#64748B', transition:'all 0.15s' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor='#0A66C2'; e.currentTarget.style.color='#0A66C2'; e.currentTarget.style.background='#EFF6FF'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor='#E2E8F0'; e.currentTarget.style.color='#64748B'; e.currentTarget.style.background='transparent'; }}
                >✏️</button>
                {!isMe && (
                  <button onClick={() => setDeleteUser(user)} title="Löschen"
                    style={{ width:32, height:32, borderRadius:8, border:'1px solid #E2E8F0', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#94A3B8', transition:'all 0.15s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor='#FCA5A5'; e.currentTarget.style.color='#EF4444'; e.currentTarget.style.background='#FEF2F2'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor='#E2E8F0'; e.currentTarget.style.color='#94A3B8'; e.currentTarget.style.background='transparent'; }}
                  >🗑</button>
                )}
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
                  {[['user','👤','User','Standard-Zugriff'],['admin','👑','Admin','Voller Zugriff inkl. Verwaltung']].map(([r,icon,label,desc]) => (
                    <label key={r} style={{ flex:1, display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', borderRadius:10, border:'2px solid '+(form.role===r?'#0A66C2':'#E2E8F0'), background:form.role===r?'#EFF6FF':'#F8FAFC', cursor:'pointer', transition:'all 0.15s' }}>
                      <input type="radio" name="role" value={r} checked={form.role===r} onChange={() => setForm(f => ({...f,role:r}))} style={{ marginTop:2, accentColor:'#0A66C2' }}/>
                      <span>
                        <div style={{ fontWeight:700, fontSize:13, color:form.role===r?'#0A66C2':'#0F172A' }}>{icon} {label}</div>
                        <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>{desc}</div>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #F1F5F9' }}>
              <button type="button" onClick={() => setAddModal(false)}
                style={{ padding:'8px 18px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button type="submit" disabled={saving || !form.email || !form.password}
                style={{ padding:'8px 20px', borderRadius:999, border:'none', background:'#0A66C2', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:(!form.email||!form.password)?0.5:1, display:'flex', alignItems:'center', gap:6 }}>
                {saving ? '⏳' : '✓ Benutzer erstellen'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── MODAL: Edit Role ── */}
      {editUser && (
        <Modal title="Rolle bearbeiten" onClose={() => setEditUser(null)} width={420}>
          <div style={{ padding:'20px 24px' }}>
            {/* User info */}
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#F8FAFC', borderRadius:10, marginBottom:20, border:'1px solid #E2E8F0' }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#0A66C2,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#fff', flexShrink:0 }}>
                {(editUser.full_name||editUser.email).charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:'#0F172A' }}>{editUser.full_name || '—'}</div>
                <div style={{ fontSize:12, color:'#94A3B8', marginTop:1 }}>{editUser.email}</div>
              </div>
              <div style={{ marginLeft:'auto' }}><RoleBadge role={editUser.role}/></div>
            </div>
            <label style={lbl}>Neue Rolle auswählen</label>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              {[['user','👤','User','Standard-Zugriff'],['admin','👑','Admin','Voller Zugriff']].map(([r,icon,label,desc]) => (
                <button key={r} onClick={() => handleSetRole(editUser.id, r)} disabled={saving || editUser.role===r}
                  style={{ flex:1, padding:'14px 12px', borderRadius:10, cursor:editUser.role===r?'default':'pointer', border:'2px solid '+(editUser.role===r?'#0A66C2':'#E2E8F0'), background:editUser.role===r?'#EFF6FF':'#F8FAFC', opacity:saving?0.5:1, transition:'all 0.15s', textAlign:'center' }}
                  onMouseOver={e => { if(editUser.role!==r) { e.currentTarget.style.borderColor='#0A66C2'; e.currentTarget.style.background='#EFF6FF'; }}}
                  onMouseOut={e => { if(editUser.role!==r) { e.currentTarget.style.borderColor='#E2E8F0'; e.currentTarget.style.background='#F8FAFC'; }}}
                >
                  <div style={{ fontSize:22, marginBottom:4 }}>{icon}</div>
                  <div style={{ fontWeight:700, fontSize:13, color:editUser.role===r?'#0A66C2':'#0F172A' }}>{label}</div>
                  <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>{desc}</div>
                  {editUser.role===r && <div style={{ fontSize:10, color:'#0A66C2', marginTop:5, fontWeight:700, background:'#DBEAFE', padding:'2px 8px', borderRadius:999, display:'inline-block' }}>✓ Aktuell</div>}
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
        <Modal title="Benutzer löschen" onClose={() => setDeleteUser(null)} width={420}>
          <div style={{ padding:'24px 24px 20px', textAlign:'center' }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'#FEF2F2', border:'1px solid #FCA5A5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 16px' }}>⚠️</div>
            <div style={{ fontWeight:800, fontSize:16, color:'#0F172A', marginBottom:8 }}>Wirklich löschen?</div>
            <div style={{ fontSize:14, color:'#64748B', lineHeight:1.6, marginBottom:16 }}>
              Der Benutzer <strong style={{ color:'#0F172A' }}>{deleteUser.email}</strong> wird dauerhaft gelöscht.<br/>
              Alle zugehörigen Daten werden ebenfalls entfernt.
            </div>
            <div style={{ padding:'10px 16px', background:'#FFF7ED', border:'1px solid #FDE68A', borderRadius:8, fontSize:12, color:'#92400E', fontWeight:600 }}>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </div>
          </div>
          <div style={{ padding:'0 24px 20px', display:'flex', justifyContent:'center', gap:10, borderTop:'1px solid #F1F5F9', paddingTop:16 }}>
            <button onClick={() => setDeleteUser(null)} style={{ padding:'9px 22px', borderRadius:999, border:'1px solid #E2E8F0', background:'transparent', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
            <button onClick={() => handleDelete(deleteUser.id)} disabled={saving}
              style={{ padding:'9px 22px', borderRadius:999, border:'none', background:'#EF4444', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.5:1, display:'flex', alignItems:'center', gap:6 }}>
              {saving ? '⏳' : '🗑 Endgültig löschen'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
