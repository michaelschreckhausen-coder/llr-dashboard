import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const nav = [
  { to:'/',            icon:'📊', label:'Dashboard'    },
  { to:'/leads',       icon:'👥', label:'Leads'         },
  { to:'/comments',    icon:'💬', label:'Kommentare'    },
  { to:'/brand-voice', icon:'🎙️', label:'Brand Voice'   },
  { to:'/settings',    icon:'⚙️', label:'Einstellungen' },
]

export default function Layout({ children, session }) {
  const navigate = useNavigate()
  const logout = async () => { await supabase.auth.signOut(); navigate('/') }
  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <aside style={{ width:220, background:'#fff', borderRight:'1px solid #eee', display:'flex', flexDirection:'column', position:'fixed', top:0, bottom:0, left:0, zIndex:100 }}>
        <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid #f0f0f0' }}>
          <div style={{ fontSize:18, fontWeight:800, color:'#0a66c2' }}>✨ Lead Radar</div>
          <div style={{ fontSize:11, color:'#888', marginTop:2 }}>LinkedIn Sales Suite</div>
        </div>
        <nav style={{ flex:1, padding:'10px 8px' }}>
          {nav.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to==='/'} style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10,
              padding:'9px 14px', borderRadius:8, marginBottom:2,
              textDecoration:'none', fontSize:14, fontWeight:500,
              color: isActive ? '#0a66c2' : '#555',
              background: isActive ? '#e8f0fb' : 'transparent',
              transition:'all 0.15s',
            })}>
              <span style={{ fontSize:16 }}>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding:'12px 16px', borderTop:'1px solid #f0f0f0' }}>
          <div style={{ fontSize:12, color:'#888', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {session?.user?.email}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={logout} style={{ width:'100%', justifyContent:'center' }}>
            Abmelden
          </button>
        </div>
      </aside>
      <main style={{ marginLeft:220, flex:1, padding:'28px 32px', maxWidth:1200 }}>
        {children}
      </main>
    </div>
  )
}
