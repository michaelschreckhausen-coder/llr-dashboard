import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SN = {
  sidebar:    '#1d2226',
  blue:       '#0073b1',
  active:     '#0a66c2',
  bg:         '#f3f2ef',
  border:     '#e0e0e0',
  white:      '#ffffff',
  textPrimary:'#000000e6',
  textMuted:  '#666666',
  red:        '#cc1016',
  green:      '#057642',
}

const ROLE_STYLE = {
  admin: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  user:  { bg: '#e8f0fb', color: '#0a66c2', border: '#bfdbfe' },
}

function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={onClose}>
      <div style={{ background:SN.white, borderRadius:10, boxShadow:'0 8px 40px rgba(0,0,0,0.2)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding:'16px 22px', borderBottom:'1px solid '+SN.border, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700, fontSize:15, color:SN.textPrimary }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, color:'#888', cursor:'pointer', lineHeight:1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function AdminUsers({ session }) {
  const [users,      setUsers]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')
  const [addModal,   setAddModal]   = useState(false)
  const [editUser,   setEditUser]   = useState(null)
  const [deleteUser, setDeleteUser] = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [hoveredRow, setHoveredRow] = useState(null)

  // Add form state
  const [form, setForm] = useState({ email:'', password:'', full_name:'', role:'user' })

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true); setError('')
    const { data, error: err } = await supabase.rpc('admin_list_users')
    if (err) setError(err.message)
    else setUsers(data || [])
    setLoading(false)
  }

  function flash(msg, isError = false) {
    if (isError) setError(msg); else setSuccess(msg)
    setTimeout(() => { setError(''); setSuccess('') }, 3500)
  }

  async function handleAddUser(e) {
    e.preventDefault()
    if (!form.email || !form.password) return flash('E-Mail und Passwort sind Pflichtfelder.', true)
    setSaving(true)
    const { error: err } = await supabase.rpc('admin_create_user', {
      p_email:     form.email,
      p_password:  form.password,
      p_full_name: form.full_name,
      p_role:      form.role,
    })
    setSaving(false)
    if (err) { flash(err.message, true); return }
    flash('Benutzer erfolgreich erstellt.')
    setAddModal(false)
    setForm({ email:'', password:'', full_name:'', role:'user' })
    loadUsers()
  }

  async function handleSetRole(userId, newRole) {
    setSaving(true)
    const { error: err } = await supabase.rpc('admin_set_role', { target_user_id: userId, new_role: newRole })
    setSaving(false)
    if (err) { flash(err.message, true); return }
    flash('Rolle aktualisiert.')
    setEditUser(null)
    loadUsers()
  }

  async function handleDelete(userId) {
    setSaving(true)
    const { error: err } = await supabase.rpc('admin_delete_user', { target_user_id: userId })
    setSaving(false)
    if (err) { flash(err.message, true); setDeleteUser(null); return }
    flash('Benutzer gelöscht.')
    setDeleteUser(null)
    loadUsers()
  }

  const S = {
    page:       { padding:'0', background:SN.bg, minHeight:'100vh' },
    header:     { background:SN.sidebar, padding:'0 28px', minHeight:56, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 },
    headerTitle:{ fontSize:15, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:10 },
    addBtn:     { background:SN.blue, color:'#fff', border:'none', borderRadius:20, fontSize:13, fontWeight:600, padding:'8px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:6 },
    card:       { background:SN.white, borderRadius:10, boxShadow:'0 2px 12px rgba(0,0,0,0.07)', margin:'24px 28px', overflow:'hidden' },
    colHeader:  { display:'flex', alignItems:'center', padding:'0 20px', height:36, background:'#f3f2ef', borderBottom:'2px solid '+SN.border },
    colTxt:     { fontSize:10, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'0.9px' },
    row:        (h) => ({ display:'flex', alignItems:'center', padding:'0 20px', minHeight:64, borderBottom:'1px solid '+SN.border, background:h?'#f9fafb':SN.white, transition:'background 0.1s' }),
    avatarPH:   (name) => ({ width:40, height:40, borderRadius:'50%', background:'#e8f0fb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:SN.active, flexShrink:0, border:'2px solid '+SN.border }),
    badge:      (r) => ({ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:12, fontSize:11, fontWeight:700, background:ROLE_STYLE[r]?.bg, color:ROLE_STYLE[r]?.color, border:'1px solid '+(ROLE_STYLE[r]?.border||SN.border) }),
    actionBtn:  (danger) => ({ background:'transparent', border:'1.5px solid '+(danger?'#fca5a5':SN.border), color:danger?SN.red:'#555', borderRadius:'50%', width:30, height:30, padding:0, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, cursor:'pointer', transition:'all 0.15s' }),
    label:      { display:'block', fontSize:11, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:'0.7px', marginBottom:5 },
    input:      { width:'100%', border:'1.5px solid #c9cdd2', borderRadius:6, padding:'8px 12px', fontSize:14, outline:'none' },
  }

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={S.header}>
        <div style={S.headerTitle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Benutzerverwaltung
          <span style={{ fontSize:12, color:'#8b949e', fontWeight:400 }}>({users.length} Benutzer)</span>
        </div>
        <button style={S.addBtn} onClick={() => setAddModal(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Benutzer hinzufügen
        </button>
      </div>

      {/* Notifications */}
      {error   && <div style={{ margin:'16px 28px 0', padding:'10px 16px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, color:SN.red, fontSize:13, fontWeight:600 }}>⚠️ {error}</div>}
      {success && <div style={{ margin:'16px 28px 0', padding:'10px 16px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, color:SN.green, fontSize:13, fontWeight:600 }}>✓ {success}</div>}

      {/* User table */}
      <div style={S.card}>
        {/* Column headers */}
        <div style={S.colHeader}>
          <div style={{ width:52, flexShrink:0 }} />
          <div style={{ flex:1, ...S.colTxt }}>Name & E-Mail</div>
          <div style={{ width:130, flexShrink:0, ...S.colTxt }}>Rolle</div>
          <div style={{ width:120, flexShrink:0, ...S.colTxt }}>Hinzugefügt</div>
          <div style={{ width:100, flexShrink:0, ...S.colTxt, textAlign:'right' }}>Aktionen</div>
        </div>

        {loading ? (
          <div style={{ padding:48, textAlign:'center', color:'#aaa' }}>⏳ Lade Benutzer…</div>
        ) : users.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'#aaa' }}>Keine Benutzer gefunden.</div>
        ) : users.map(user => {
          const isMe = user.id === session.user.id
          const isHov = hoveredRow === user.id
          const initials = (user.full_name || user.email || '?').charAt(0).toUpperCase()
          return (
            <div key={user.id} style={S.row(isHov)}
              onMouseEnter={() => setHoveredRow(user.id)}
              onMouseLeave={() => setHoveredRow(null)}>

              {/* Avatar */}
              <div style={{ width:52, flexShrink:0 }}>
                <div style={S.avatarPH(user.full_name)}>{initials}</div>
              </div>

              {/* Name + Email */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, color:SN.textPrimary, display:'flex', alignItems:'center', gap:8 }}>
                  {user.full_name || '—'}
                  {isMe && <span style={{ fontSize:10, fontWeight:700, background:'#e8f0fb', color:SN.active, padding:'2px 7px', borderRadius:10 }}>Ich</span>}
                </div>
                <div style={{ fontSize:12, color:SN.textMuted, marginTop:1 }}>{user.email}</div>
              </div>

              {/* Role badge */}
              <div style={{ width:130, flexShrink:0 }}>
                <span style={S.badge(user.role)}>
                  {user.role === 'admin' ? '👑 Admin' : '👤 User'}
                </span>
              </div>

              {/* Date */}
              <div style={{ width:120, flexShrink:0, fontSize:12, color:'#aaa' }}>
                {new Date(user.created_at).toLocaleDateString('de-DE')}
              </div>

              {/* Actions */}
              <div style={{ width:100, flexShrink:0, display:'flex', gap:5, justifyContent:'flex-end' }}>
                <button style={S.actionBtn(false)} title="Rolle bearbeiten"
                  onClick={() => setEditUser(user)}>✏️</button>
                {!isMe && (
                  <button style={S.actionBtn(true)} title="Benutzer löschen"
                    onClick={() => setDeleteUser(user)}>🗑</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── MODAL: Add User ── */}
      {addModal && (
        <Modal title="+ Neuer Benutzer" onClose={() => { setAddModal(false); setForm({ email:'', password:'', full_name:'', role:'user' }) }}>
          <form onSubmit={handleAddUser}>
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={S.label}>Name</label>
                <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name:e.target.value}))}
                  style={S.input} placeholder="Vor- und Nachname" />
              </div>
              <div>
                <label style={S.label}>E-Mail *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email:e.target.value}))}
                  style={S.input} placeholder="benutzer@firma.de" required />
              </div>
              <div>
                <label style={S.label}>Passwort *</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password:e.target.value}))}
                  style={S.input} placeholder="Mindestens 8 Zeichen" required minLength={8} />
              </div>
              <div>
                <label style={S.label}>Rolle</label>
                <div style={{ display:'flex', gap:10, marginTop:4 }}>
                  {['user','admin'].map(r => (
                    <label key={r} style={{
                      flex:1, display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                      borderRadius:8, border:'2px solid '+(form.role===r?SN.active:SN.border),
                      background:form.role===r?'#e8f0fb':SN.white, cursor:'pointer', transition:'all 0.15s'
                    }}>
                      <input type="radio" name="role" value={r} checked={form.role===r}
                        onChange={() => setForm(f => ({...f,role:r}))} style={{ accentColor:SN.active }} />
                      <span>
                        <div style={{ fontWeight:700, fontSize:13, color:form.role===r?SN.active:SN.textPrimary }}>
                          {r === 'admin' ? '👑 Admin' : '👤 User'}
                        </div>
                        <div style={{ fontSize:11, color:SN.textMuted, marginTop:1 }}>
                          {r === 'admin' ? 'Voller Zugriff inkl. Verwaltung' : 'Standard-Zugriff'}
                        </div>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding:'10px 22px 18px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid '+SN.border }}>
              <button type="button" className="btn btn-secondary" onClick={() => setAddModal(false)}>Abbrechen</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !form.email || !form.password}>
                {saving ? '⏳' : '+ Benutzer erstellen'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── MODAL: Edit Role ── */}
      {editUser && (
        <Modal title="Rolle bearbeiten" onClose={() => setEditUser(null)} width={400}>
          <div style={{ padding:'20px 22px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#f9fafb', borderRadius:8, marginBottom:20 }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:'#e8f0fb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:SN.active }}>
                {(editUser.full_name || editUser.email).charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:14 }}>{editUser.full_name || '—'}</div>
                <div style={{ fontSize:12, color:SN.textMuted }}>{editUser.email}</div>
              </div>
            </div>
            <label style={S.label}>Rolle auswählen</label>
            <div style={{ display:'flex', gap:10, marginTop:6 }}>
              {['user','admin'].map(r => (
                <button key={r} onClick={() => handleSetRole(editUser.id, r)} disabled={saving || editUser.role === r}
                  style={{
                    flex:1, padding:'12px 10px', borderRadius:8, cursor:editUser.role===r?'default':'pointer',
                    border:'2px solid '+(editUser.role===r?SN.active:SN.border),
                    background:editUser.role===r?'#e8f0fb':SN.white,
                    opacity:saving?0.6:1, transition:'all 0.15s',
                  }}>
                  <div style={{ fontSize:18, marginBottom:4 }}>{r==='admin'?'👑':'👤'}</div>
                  <div style={{ fontWeight:700, fontSize:13, color:editUser.role===r?SN.active:SN.textPrimary }}>{r==='admin'?'Admin':'User'}</div>
                  <div style={{ fontSize:11, color:SN.textMuted, marginTop:2 }}>{r==='admin'?'Voller Zugriff':'Standard'}</div>
                  {editUser.role===r && <div style={{ fontSize:10, color:SN.active, marginTop:4, fontWeight:700 }}>✓ Aktuell</div>}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding:'10px 22px 16px', textAlign:'right', borderTop:'1px solid '+SN.border }}>
            <button className="btn btn-secondary" onClick={() => setEditUser(null)}>Schließen</button>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Confirm Delete ── */}
      {deleteUser && (
        <Modal title="Benutzer löschen" onClose={() => setDeleteUser(null)} width={400}>
          <div style={{ padding:'20px 22px' }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
              <div style={{ fontWeight:700, fontSize:15, color:SN.textPrimary, marginBottom:8 }}>
                Wirklich löschen?
              </div>
              <div style={{ fontSize:13, color:SN.textMuted, lineHeight:1.6 }}>
                Der Benutzer <strong>{deleteUser.email}</strong> wird dauerhaft gelöscht.<br/>
                Alle zugehörigen Daten (Leads, Kommentare) werden ebenfalls entfernt.
              </div>
            </div>
            <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#991b1b' }}>
              ⚠️ Diese Aktion kann nicht rückgängig gemacht werden.
            </div>
          </div>
          <div style={{ padding:'10px 22px 16px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid '+SN.border }}>
            <button className="btn btn-secondary" onClick={() => setDeleteUser(null)}>Abbrechen</button>
            <button className="btn btn-danger" onClick={() => handleDelete(deleteUser.id)} disabled={saving}
              style={{ background:SN.red, color:'#fff', border:'none', borderRadius:20, padding:'8px 18px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
              {saving ? '⏳' : '🗑 Endgültig löschen'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
