import React, { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang, t } from '../lib/i18n'

const NAV_ITEMS = [
  { to: '/',            icon: DashIcon,    key: 'nav_dashboard',  label: 'Dashboard' },
  { to: '/leads',       icon: LeadsIcon,   key: 'nav_leads',      label: 'Leads' },
  { to: '/comments',    icon: ChatIcon,    key: 'nav_comments',   label: 'Kommentare' },
  { to: '/brand-voice', icon: VoiceIcon,   key: 'nav_brand_voice',label: 'Brand Voice' },
  { to: '/settings',    icon: SettingsIcon,key: 'nav_settings',   label: 'Einstellungen' },
]

/* ── Minimal SVG Icons ── */
function DashIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
}
function LeadsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function ChatIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
}
function VoiceIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
}
function SettingsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
}
function AdminIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function LogoutIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
}

export default function Layout({ children, session, role }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [lang]    = useLang()
  const isAdmin   = role === 'admin'
  const [collapsed, setCollapsed] = useState(false)

  const logout = async () => { await supabase.auth.signOut(); navigate('/') }

  const emailPrefix = session?.user?.email?.split('@')[0] || 'User'
  const initials    = emailPrefix.substring(0, 2).toUpperCase()

  const sidebarW = collapsed ? 64 : 240

  const navLinkStyle = ({ isActive }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: collapsed ? 0 : 10,
    padding: collapsed ? '10px 0' : '9px 14px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 8,
    marginBottom: 2,
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: isActive ? 600 : 500,
    color: isActive ? '#0A66C2' : '#475569',
    background: isActive ? '#EFF6FF' : 'transparent',
    transition: 'all 0.15s',
    position: 'relative',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    borderLeft: isActive ? '3px solid #0A66C2' : '3px solid transparent',
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: sidebarW,
        flexShrink: 0,
        background: '#FFFFFF',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, bottom: 0, left: 0,
        zIndex: 100,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        boxShadow: '1px 0 0 var(--border)',
      }}>

        {/* Logo + Collapse */}
        <div style={{
          padding: collapsed ? '20px 0' : '18px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          minHeight: 64,
        }}>
          {!collapsed && (
            <NavLink to="/" style={{ textDecoration:'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 7,
                  background: 'linear-gradient(135deg, #0A66C2, #3B82F6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                    <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>Lead Radar</div>
                  <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, marginTop: -1 }}>Sales Intelligence</div>
                </div>
              </div>
            </NavLink>
          )}

          {collapsed && (
            <div style={{ width:30, height:30, borderRadius:7, background:'linear-gradient(135deg,#0A66C2,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </div>
          )}

          {!collapsed && (
            <button onClick={() => setCollapsed(true)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', padding:4, borderRadius:6, display:'flex', alignItems:'center' }}
              title="Sidebar einklappen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
          )}

          {collapsed && (
            <div style={{ position:'absolute', bottom: 0, left:0, right:0, display:'flex', justifyContent:'center', padding:'8px 0', borderTop:'1px solid var(--border)' }}>
            </div>
          )}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <button onClick={() => setCollapsed(false)}
            style={{ margin:'8px auto', background:'none', border:'1px solid var(--border)', cursor:'pointer', color:'#94A3B8', padding:'6px 8px', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}
            title="Sidebar ausklappen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        )}

        {/* Main Nav */}
        <nav style={{ flex: 1, padding: collapsed ? '8px 8px' : '10px 10px', overflowY: 'auto', overflowX: 'hidden' }}>

          {!collapsed && (
            <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.09em', padding:'4px 14px 8px' }}>
              Navigation
            </div>
          )}

          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} style={navLinkStyle} title={collapsed ? item.label : ''}>
                <span style={{ flexShrink: 0, opacity: 0.85 }}><Icon /></span>
                {!collapsed && <span>{t(item.key)}</span>}
              </NavLink>
            )
          })}

          {/* Admin section */}
          {isAdmin && (
            <>
              {!collapsed && (
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.09em', padding:'16px 14px 8px', borderTop:'1px solid var(--border)', marginTop:8 }}>
                  Admin
                </div>
              )}
              {collapsed && <div style={{ height:1, background:'var(--border)', margin:'8px 0' }}/>}
              <NavLink to="/admin/users" style={navLinkStyle} title={collapsed ? 'Benutzerverwaltung' : ''}>
                <span style={{ flexShrink:0, opacity:0.85 }}><AdminIcon /></span>
                {!collapsed && <span>Benutzerverwaltung</span>}
              </NavLink>
            </>
          )}
        </nav>

        {/* Bottom: Profile + Logout */}
        <div style={{ borderTop: '1px solid var(--border)', padding: collapsed ? '10px 8px' : '10px 10px' }}>

          {/* Profile link */}
          <NavLink to="/profile" style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '8px 0' : '8px 12px',
            borderRadius: 8,
            textDecoration: 'none',
            background: isActive ? '#EFF6FF' : 'transparent',
            transition: 'background 0.15s',
            marginBottom: 6,
          })}>
            {/* Avatar */}
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #0A66C2, #3B82F6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: 'white',
              flexShrink: 0, boxShadow: '0 0 0 2px white, 0 0 0 3px #E2E8F0',
            }}>
              {initials}
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {emailPrefix}
                </div>
                <div style={{ marginTop: 1 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                    background: isAdmin ? '#FFFBEB' : '#EFF6FF',
                    color: isAdmin ? '#92400E' : '#1D4ED8',
                    border: '1px solid ' + (isAdmin ? '#FDE68A' : '#BFDBFE'),
                  }}>
                    {isAdmin ? 'Admin' : 'User'}
                  </span>
                </div>
              </div>
            )}
          </NavLink>

          {/* Logout */}
          <button onClick={logout} title={collapsed ? 'Abmelden' : ''}
            style={{
              width: '100%', display:'flex', alignItems:'center', justifyContent: collapsed ? 'center' : 'flex-start',
              gap: collapsed ? 0 : 8, padding: collapsed ? '8px 0' : '8px 12px',
              background: 'none', border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 12, fontWeight: 600, color: '#64748B', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor='#EF4444'; e.currentTarget.style.color='#EF4444'; e.currentTarget.style.background='#FEF2F2'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='#64748B'; e.currentTarget.style.background='none'; }}
          >
            <LogoutIcon />
            {!collapsed && t('nav_logout')}
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{
        marginLeft: sidebarW,
        flex: 1,
        minWidth: 0,
        transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Top bar */}
        <div style={{
          background: '#FFFFFF',
          borderBottom: '1px solid var(--border)',
          padding: '0 32px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: '0 1px 0 var(--border)',
        }}>
          {/* Breadcrumb / page title */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:13, color:'#94A3B8' }}>Lead Radar</span>
            <span style={{ color:'#CBD5E1', fontSize:13 }}>/</span>
            <span style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>
              {location.pathname === '/' ? 'Dashboard'
                : location.pathname === '/leads' ? 'Leads'
                : location.pathname === '/comments' ? 'Kommentare'
                : location.pathname === '/brand-voice' ? 'Brand Voice'
                : location.pathname === '/settings' ? 'Einstellungen'
                : location.pathname === '/profile' ? 'Mein Profil'
                : location.pathname === '/admin/users' ? 'Benutzerverwaltung'
                : 'Seite'}
            </span>
          </div>

          {/* Right: actions */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* LinkedIn badge */}
            <div style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'4px 12px', borderRadius:999,
              background:'#EFF6FF', border:'1px solid #BFDBFE',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#0A66C2">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
              </svg>
              <span style={{ fontSize:11, fontWeight:700, color:'#1D4ED8' }}>Sales Suite</span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ padding: '28px 32px', maxWidth: 1280 }}>
          {children}
        </div>
      </main>
    </div>
  )
}
