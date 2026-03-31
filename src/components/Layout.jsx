import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang, t } from '../lib/i18n'
import { loadWhiteLabelSettings, DEFAULT_WL } from '../lib/whitelabel'

/* ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Nav Icons ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ */
const DashIcon    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
const LeadsIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
const ChatIcon    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const PenIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
const HandshakeIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z"/><path d="m9 13 3 3 3-3"/></svg>
const VoiceIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
const AboutIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const SettingsIcon= () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
const AdminIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const LogoutIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
const LinkedInIcon= () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="currentColor"/><path d="M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 8.48H3V21h4V8.48ZM13.32 8.48H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91l.04-1.68Z" fill="white"/></svg>

/* ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Nav items ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ */
const RocketIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1-1.5 2.5 0 3.5s3 .5 4.5-1.5L12 16l-3.5-3.5-4 4z"/><path d="m12 16 4-4"/><path d="m9 12 4-4"/><path d="M14.5 3.5C17 3.5 20.5 4 20.5 9.5c-1 3-3 5-6 6L9 12l3-3c1-3 3-5 5.5-5.5z"/><circle cx="17" cy="7" r="1" fill="currentColor"/></svg>

const NAV_ITEMS = [
  { to:'/getting-started', icon:RocketIcon, label:'Erste Schritte' },
  { to:'/',                icon:DashIcon,   label:'Dashboard' },
]

const DISABLED_ITEMS = [
  { to:'/comments', icon:ChatIcon, label:'Kommentare', reason:'DemnÃÂÃÂ¤chst' },
]

const SALES_ITEMS = [
  { to:'/leads',        icon:LeadsIcon,     label:'Leads',        active:true },
  { to:'/vernetzungen', icon:HandshakeIcon, label:'Vernetzungen', active:true },
  { to:'/pipeline',     icon:DashIcon,      label:'Pipeline',     active:true },
  { to:'/reports',      icon:DashIcon,      label:'Reports',      active:true },
]

const STRATEGIE_ITEMS = [
  { to:'/icp', icon:LeadsIcon, label:'Zielgruppen (ICP)', active:true },
]

const AI_ITEMS = [
  { to:'/brand-voice',    icon:VoiceIcon, label:'Brand Voice' },
  { to:'/linkedin-about', icon:AboutIcon, label:'LinkedIn Info',  badge:'KI' },
  { to:'/content-studio', icon:PenIcon,   label:'Content Studio', badge:'KI', active:true },
]

const BOTTOM_ITEMS = [
  { to:'/settings',       icon:SettingsIcon, label:'Einstellungen' },
]

/* ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Page title map ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ */
const PAGE_TITLES = {
  '/':               'Dashboard',
  '/leads':          'Leads',
  '/comments':       'Kommentare',
  '/brand-voice':    'Brand Voice',
  '/linkedin-about':  'LinkedIn Info schreiben',
  '/linkedin-slogan': 'Profil Slogan erstellen',
  '/settings':       'Einstellungen',
  '/profile':        'Mein Profil',
  '/admin/users':    'Benutzerverwaltung',
  '/admin/whitelabel': 'WhiteLabel',
  '/pipeline':       'Pipeline',
  '/reports':        'Reports',
  '/icp':           'Zielgruppen (ICP)',
  '/vernetzungen':   'Vernetzungen',
  '/content-studio': 'Content Studio',
}

export default function Layout({ children, session, role, sub, plan }) {
  const navigate   = useNavigate()
  const location   = useLocation()
  const [lang]     = useLang()
  const isAdmin    = role === 'admin'
  const [collapsed,setCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState({ strategie: true, sales: true, branding: true })
  const toggleSection = (key) => setOpenSections(s => ({...s, [key]: !s[key]}))
  const [wl, setWl] = useState(DEFAULT_WL)
  useEffect(() => { loadWhiteLabelSettings().then(setWl) }, [])

  const logout = async () => { await supabase.auth.signOut(); navigate('/') }

  const emailPrefix = session?.user?.email?.split('@')[0] || 'User'
  const initials    = emailPrefix.substring(0, 2).toUpperCase()
  const pageTitle   = PAGE_TITLES[location.pathname] || 'Lead Radar'
  const sidebarW    = collapsed ? 64 : 240

  const navStyle = ({ isActive }) => ({
    display: 'flex', alignItems: 'center',
    gap: collapsed ? 0 : 9,
    justifyContent: collapsed ? 'center' : 'flex-start',
    padding: collapsed ? '10px 0' : '9px 13px',
    borderRadius: 8, marginBottom: 2,
    textDecoration: 'none', fontSize: 13,
    fontWeight: isActive ? 700 : 500,
    color: isActive ? (wl.primary_color||'#0A66C2') : '#475569',
    background: isActive ? (wl.primary_color||'#0A66C2')+'15' : 'transparent',
    borderLeft: isActive ? '3px solid '+(wl.primary_color||'#0A66C2') : '3px solid transparent',
    transition: 'all 0.15s', position: 'relative',
    whiteSpace: 'nowrap', overflow: 'hidden',
  })

  const renderNavItem = ({ to, icon: Icon, label, badge }, end = false) => (
    <NavLink key={to} to={to} end={end} style={navStyle} title={collapsed ? label : ''}>
      <span style={{ flexShrink: 0, opacity: 0.85, display:'flex' }}><Icon /></span>
      {!collapsed && (
        <>
          <span style={{ flex: 1 }}>{label}</span>
          {badge && (
            <span style={{ fontSize: 9, fontWeight: 800, background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)', color: '#fff', padding: '1px 6px', borderRadius: 999, letterSpacing: '0.05em', flexShrink: 0 }}>
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg, #F1F5F9)' }}>

      {/* ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ SIDEBAR ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ */}
      <aside style={{
        width: sidebarW, flexShrink: 0,
        background: wl.sidebar_bg || '#FFFFFF', borderRight: '1px solid #E2E8F0',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 100,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>

        {/* ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Logo ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ */}
        <div style={{ padding: collapsed ? '18px 0' : '16px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', minHeight: 60 }}>
          {!collapsed ? (
            <>
              <NavLink to="/" style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:9 }}>
                <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,'+(wl.primary_color||'#0A66C2')+','+(wl.primary_color||'#3B82F6')+'99)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', lineHeight:1.2 }}>{wl.app_name || 'Lead Radar'}</div>
                  <div style={{ fontSize:10, color:'#94A3B8', fontWeight:500 }}>Sales Intelligence</div>
                </div>
              </NavLink>
              <button onClick={() => setCollapsed(true)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', padding:4, borderRadius:6, display:'flex', alignItems:'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              </button>
            </>
          ) : (
            <button onClick={() => setCollapsed(false)} style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,'+(wl.primary_color||'#0A66C2')+','+(wl.primary_color||'#3B82F6')+'99)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </button>
          )}
        </div>

        {/* ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Nav ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ */}
        <nav style={{ flex:1, padding: collapsed ? '8px' : '10px 10px', overflowY:'auto', overflowX:'hidden', display:'flex', flexDirection:'column' }}>

          {/* Main items */}
          {!collapsed && <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.09em', padding:'4px 13px 8px' }}>Navigation</div>}
          {NAV_ITEMS.map(item => renderNavItem(item, item.to === '/'))}


          {/* ── STRATEGIE SUITE ── */}
          <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>
          {!collapsed && (
            <button onClick={() => toggleSection('strategie')} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px 2px', marginTop:0, width:'100%', background:'none', border:'none', cursor:'pointer' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontSize:9, fontWeight:700, color:'#94A3B8', letterSpacing:'0.1em', textTransform:'uppercase', flex:1, textAlign:'left' }}>Strategie Suite</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" style={{ transition:'transform 0.2s', transform: openSections.strategie ? 'rotate(0deg)' : 'rotate(-90deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          )}
          {(!collapsed && openSections.strategie) && STRATEGIE_ITEMS.map(function(item) {
            if (!item.active) return null;
            return React.createElement(NavLink, {
              key: item.to, to: item.to,
              style: function(p) { return { display:'flex', alignItems:'center', gap:9, padding:'9px 13px', borderRadius:8, fontWeight: p.isActive ? 700 : 500, fontSize:13, color: p.isActive ? (wl.primary_color||'#0A66C2') : '#475569', background: p.isActive ? (wl.primary_color||'#0A66C2')+'15' : 'transparent', textDecoration:'none', transition:'all 0.15s', marginBottom:2, borderLeft: p.isActive ? '3px solid '+(wl.primary_color||'#0A66C2') : '3px solid transparent', whiteSpace:'nowrap', overflow:'hidden' } }
            },
              React.createElement(item.icon, null),
              React.createElement('span', null, item.label)
            )
          })}

          {/* ── SALES SUITE ── */}
          <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>
          {!collapsed && (
            <button onClick={() => toggleSection('sales')} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px 2px', marginTop:0, width:'100%', background:'none', border:'none', cursor:'pointer' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
              <span style={{ fontSize:9, fontWeight:700, color:'#94A3B8', letterSpacing:'0.1em', textTransform:'uppercase', flex:1, textAlign:'left' }}>Sales Suite</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" style={{ transition:'transform 0.2s', transform: openSections.sales ? 'rotate(0deg)' : 'rotate(-90deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          )}
          {(!collapsed && openSections.sales) && SALES_ITEMS.map(function(item) {
            if (item.active) {
              return React.createElement(NavLink, {
                key: item.to, to: item.to,
                style: function(p) { return { display:'flex', alignItems:'center', gap:9, padding:'9px 13px', borderRadius:8, fontWeight: p.isActive ? 700 : 500, fontSize:13, color: p.isActive ? (wl.primary_color||'#0A66C2') : '#475569', background: p.isActive ? (wl.primary_color||'#0A66C2')+'15' : 'transparent', textDecoration:'none', transition:'all 0.15s', marginBottom:2, borderLeft: p.isActive ? '3px solid '+(wl.primary_color||'#0A66C2') : '3px solid transparent', whiteSpace:'nowrap', overflow:'hidden' } }
              },
                React.createElement(item.icon, null),
                React.createElement('span', null, item.label)
              )
            }
            return React.createElement('div', {
              key: item.to,
              title: 'Demnächst verfügbar',
              style: { display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, color:'#CBD5E1', cursor:'not-allowed', opacity:0.55 }
            },
              React.createElement(item.icon, null),
              React.createElement('span', { style:{ fontSize:13, fontWeight:500 } }, item.label),
              React.createElement('span', { style:{ marginLeft:'auto', fontSize:9, fontWeight:700, background:'#F1F5F9', color:'#94A3B8', padding:'1px 7px', borderRadius:999, border:'1px solid #E2E8F0' } }, 'Bald')
            )
          })}

          {/* ── BRANDING SUITE ── */}
          <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>
          {!collapsed && (
            <button onClick={() => toggleSection('branding')} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px 2px', marginTop:0, width:'100%', background:'none', border:'none', cursor:'pointer' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
              <span style={{ fontSize:9, fontWeight:700, color:'#94A3B8', letterSpacing:'0.1em', textTransform:'uppercase', flex:1, textAlign:'left' }}>Branding Suite</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" style={{ transition:'transform 0.2s', transform: openSections.branding ? 'rotate(0deg)' : 'rotate(-90deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          )}
          {(!collapsed && openSections.branding) && AI_ITEMS.map(item => renderNavItem(item))}


          {/* Settings */}
          <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>
          {BOTTOM_ITEMS.map(item => renderNavItem(item))}

          {/* Admin */}
        {isAdmin && (
          <>
            <div style={{ height:1, background:'#F1F5F9', margin:'4px 0' }}/>
            {!collapsed && <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.09em', padding:'4px 13px 8px' }}>Admin</div>}
            <NavLink to="/admin/users" style={navStyle} title={collapsed ? 'Benutzerverwaltung' : ''}>
              <span style={{ flexShrink:0, display:'flex' }}><AdminIcon/></span>
              {!collapsed && <span style={{ flex:1 }}>Benutzerverwaltung</span>}
            </NavLink>
            <NavLink to="/admin/whitelabel" style={navStyle} title={collapsed ? 'WhiteLabel' : ''}>
              <span style={{ flexShrink:0, display:'flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 12h1M20 12h1M12 3v1M12 20v1M5.64 5.64l.71.71M17.66 17.66l.71.71M5.64 18.36l.71-.71M17.66 6.34l.71-.71"/></svg>
              </span>
              {!collapsed && <span style={{ flex:1 }}>WhiteLabel</span>}
            </NavLink>
          </>
        )}
        </nav>

        {/* ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Profile + Logout ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ */}
        <div style={{ borderTop:'1px solid #E2E8F0', padding: collapsed ? '10px 8px' : '10px 10px' }}>
          <NavLink to="/profile" style={({ isActive }) => ({
            display:'flex', alignItems:'center',
            gap: collapsed ? 0 : 9,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '8px 0' : '8px 11px',
            borderRadius:8, textDecoration:'none',
            background: isActive ? (wl.primary_color||'#0A66C2')+'15' : 'transparent',
            transition:'background 0.15s', marginBottom:6,
          })}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,'+(wl.primary_color||'#0A66C2')+','+(wl.primary_color||'#3B82F6')+'99)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'white', flexShrink:0, boxShadow:'0 0 0 2px white, 0 0 0 3px #E2E8F0' }}>
              {initials}
            </div>
            {!collapsed && (
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{emailPrefix}</div>
                <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:999, background:isAdmin?'#FFFBEB':'#EFF6FF', color:isAdmin?'#92400E':'#1D4ED8', border:'1px solid '+(isAdmin?'#FDE68A':'#BFDBFE') }}>
                  {isAdmin ? 'Admin' : 'User'}
                </span>
              </div>
            )}
          </NavLink>

          <button onClick={logout} title={collapsed ? 'Abmelden' : ''}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: collapsed ? 0 : 8, padding: collapsed ? '8px 0' : '8px 11px', background:'none', border:'1px solid #E2E8F0', borderRadius:8, fontSize:12, fontWeight:600, color:'#64748B', cursor:'pointer', transition:'all 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.borderColor='#FCA5A5'; e.currentTarget.style.color='#EF4444'; e.currentTarget.style.background='#FEF2F2'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor='#E2E8F0'; e.currentTarget.style.color='#64748B'; e.currentTarget.style.background='none'; }}>
            <LogoutIcon/>
            {!collapsed && t('nav_logout')}
          </button>
          {/* Plan Badge */}
          {!collapsed && plan && React.createElement('a', {
            href: '/settings',
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 8, padding: '7px 11px', borderRadius: 8,
              background: plan.bg || '#F1F5F9',
              border: '1px solid ' + (plan.color || '#94A3B8') + '33',
              textDecoration: 'none', transition: 'all 0.15s'
            }
          },
            React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: plan.color || '#64748B' } }, plan.name || 'Free'),
            plan.id === 'free' && React.createElement('span', {
              style: { fontSize: 9, fontWeight: 700, color: '#0A66C2', background: '#EFF6FF', padding: '1px 7px', borderRadius: 999, border: '1px solid #BFDBFE' }
            }, 'Upgrade')
          )}
        </div>
      </aside>

      {/* ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ MAIN ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ */}
      <main style={{ marginLeft: sidebarW, flex:1, minWidth:0, transition:'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)' }}>

        {/* Top bar */}
        <div style={{ background:'#FFFFFF', borderBottom:'1px solid #E2E8F0', padding:'0 32px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:13, color:'#94A3B8' }}>Lead Radar</span>
            <span style={{ color:'#CBD5E1', fontSize:13 }}>/</span>
            <span style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>{pageTitle}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 12px', borderRadius:999, background:'#EFF6FF', border:'1px solid #BFDBFE', color:'#0A66C2' }}>
              <LinkedInIcon/>
              <span style={{ fontSize:11, fontWeight:700 }}>Sales Suite</span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ padding:'28px 32px', maxWidth:1280 }}>
          {children}
        </div>
      </main>
    </div>
  )
}
