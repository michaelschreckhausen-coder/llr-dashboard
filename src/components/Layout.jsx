import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang, t } from '../lib/i18n'

export default function Layout({ children, session, role }) {
  const navigate = useNavigate()
  const [lang] = useLang()
  const isAdmin = role === 'admin'

  const nav = [
    { to:'/',            icon:'📊', key:'nav_dashboard' },
    { to:'/leads',       icon:'👥', key:'nav_leads' },
    { to:'/comments',    icon:'💬', key:'nav_comments' },
    { to:'/brand-voice', icon:'🎙️', key:'nav_brand_voice' },
    { to:'/settings',    icon:'⚙️', key:'nav_settings' },
  ]

  const logout = async () => { await supabase.auth.signOut(); navigate('/') }

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <aside style={{
        width:220, background:'#fff', borderRight:'1px solid #eee',
        display:'flex', flexDirection:'column',
        position:'fixed', top:0, bottom:0, left:0, zIndex:100,
      }}>
        {/* Logo */}
        <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid #f0f0f0' }}>
          <div style={{ fontSize:18, fontWeight:800, color:'#0a66c2' }}>✨ Lead Radar</div>
          <div style={{ fontSize:11, color:'#888', marginTop:2 }}>LinkedIn Sales Suite</div>
        </div>

        {/* Main nav */}
        <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
          {nav.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to==='/'} style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
              borderRadius:8, marginBottom:2, textDecoration:'none', fontSize:14,
              fontWeight:500, color:isActive?'#0a66c2':'#555',
              background:isActive?'#e8f0fb':'transparent', transition:'all 0.15s',
            })}>
              <span style={{ fontSize:16 }}>{n.icon}</span>
              {t(n.key)}
            </NavLink>
          ))}

          {/* Admin section */}
          {isAdmin && (
            <>
              <div style={{
                margin:'16px 14px 8px', fontSize:10, fontWeight:700, color:'#bbb',
                textTransform:'uppercase', letterSpacing:'1px',
                borderTop:'1px solid #f0f0f0', paddingTop:14,
              }}>Administration</div>
              <NavLink to="/admin/users" style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
                borderRadius:8, marginBottom:2, textDecoration:'none', fontSize:14,
                fontWeight:600, color:isActive?'#92400e':'#555',
                background:isActive?'#fef3c7':'transparent', transition:'all 0.15s',
              })}>
                <span style={{ fontSize:16 }}>👑</span>
                Benutzerverwaltung
              </NavLink>
            </>
          )}
        </nav>

        {/* Bottom: profile + role + email + logout */}
        <div style={{ borderTop:'1px solid #f0f0f0' }}>
          {/* Profile link */}
          <NavLink to="/profile" style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap:10,
            padding:'12px 16px', textDecoration:'none',
            background: isActive ? '#e8f0fb' : 'transparent',
            transition:'background 0.15s',
          })}>
            {/* Avatar circle */}
            <div style={{
              width:36, height:36, borderRadius:'50%',
              background:'#0a66c2', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:13, fontWeight:800, color:'white', flexShrink:0,
              overflow:'hidden',
            }}>
              {(session?.user?.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#222', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {session?.user?.email?.split('@')[0]}
              </div>
              <div style={{ fontSize:10, marginTop:1 }}>
                <span style={{
                  fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:10,
                  background:isAdmin?'#fef3c7':'#e8f0fb',
                  color:isAdmin?'#92400e':'#0a66c2',
                  border:'1px solid ' + (isAdmin?'#fcd34d':'#bfdbfe'),
                }}>
                  {isAdmin ? '👑 Admin' : '👤 User'}
                </span>
              </div>
            </div>
          </NavLink>
          <div style={{ padding:'0 16px 14px' }}>
            <button className="btn btn-secondary btn-sm" onClick={logout}
              style={{ width:'100%', justifyContent:'center' }}>
              {t('nav_logout')}
            </button>
          </div>
        </div>
      </aside>

      <main style={{ marginLeft:220, flex:1, padding:'28px 32px', maxWidth:1200 }}>
        {children}
      </main>
    </div>
  )
}
