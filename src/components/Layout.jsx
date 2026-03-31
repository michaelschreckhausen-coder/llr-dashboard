import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { loadWhiteLabelSettings, DEFAULT_WL } from '../lib/whitelabel'

const PRIMARY = '#5B4FD8'
const PRIMARY_LIGHT = '#EDE9FE'
const PRIMARY_DARK = '#4338CA'
const BG_PAGE = '#F0EFFD'
const BG_SIDEBAR = '#FFFFFF'
const BG_SIDEBAR_HEADER = PRIMARY
const TEXT_NAV = '#6B7280'
const TEXT_NAV_ACTIVE = PRIMARY
const BORDER = '#E5E7EB'

function IconHome() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>) }
function IconLeads() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>) }
function IconConnect() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>) }
function IconPipeline() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>) }
function IconReports() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>) }
function IconSSI() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>) }
function IconMail() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>) }
function IconBrand() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>) }
function IconLinkedIn() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>) }
function IconStart() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>) }
function IconChevron({ open }) { return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>) }
function IconMenu() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>) }
function IconBell() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>) }
function IconLogout() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>) }

const SECTIONS = [
  {
    items: [
      { to: '/getting-started', icon: IconStart,    label: 'Erste Schritte' },
      { to: '/dashboard',       icon: IconHome,     label: 'Dashboard' },
    ]
  },
  {
    label: 'Sales Suite',
    items: [
      { to: '/leads',       icon: IconLeads,    label: 'Leads' },
      { to: '/vernetzungen', icon: IconConnect, label: 'Vernetzungen' },
      { to: '/pipeline',    icon: IconPipeline, label: 'Pipeline' },
      { to: '/reports',     icon: IconReports,  label: 'Reports' },
      { to: '/ssi',         icon: IconSSI,      label: 'Social Selling Index' },
      { to: '/messages',    icon: IconMail,     label: 'Nachrichten' },
    ]
  },
  {
    label: 'Branding Suite',
    items: [
      { to: '/brand-voice',   icon: IconBrand,    label: 'Brand Voice' },
      { to: '/linkedin-info', icon: IconLinkedIn, label: 'LinkedIn Info' },
    ]
  },
]

export default function Layout({ session, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [wl, setWl] = useState(DEFAULT_WL)
  const [collapsed, setCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState({ 'Sales Suite': true, 'Branding Suite': true })
  const userName = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'User'
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  useEffect(() => {
    loadWhiteLabelSettings(session?.user?.id).then(s => s && setWl(s))
  }, [session])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function toggleSection(label) {
    setOpenSections(s => ({ ...s, [label]: !s[label] }))
  }

  const pageTitle = SECTIONS.flatMap(s => s.items).find(i => location.pathname.startsWith(i.to))?.label || 'Lead Radar'
  const parentSection = SECTIONS.find(s => s.items?.some(i => location.pathname.startsWith(i.to)))?.label || ''

  const sidebarW = collapsed ? 64 : 220

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background: BG_PAGE, fontFamily:'Inter,system-ui,sans-serif' }}>

      {/* ── Top Bar ── */}
      <div style={{ height:52, background:'#fff', borderBottom:'2px solid '+PRIMARY, display:'flex', alignItems:'center', paddingLeft: sidebarW+16, paddingRight:20, gap:12, flexShrink:0, transition:'padding-left 0.25s', position:'fixed', top:0, left:0, right:0, zIndex:100, boxSizing:'border-box' }}>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:13, color:TEXT_NAV }}>Lead Radar</span>
          {parentSection && <><span style={{ color:BORDER, fontSize:13 }}>/</span><span style={{ fontSize:13, color:TEXT_NAV }}>{parentSection}</span></>}
          <span style={{ color:BORDER, fontSize:13 }}>/</span>
          <span style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{pageTitle}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ background:PRIMARY_LIGHT, color:PRIMARY, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:999 }}>Enterprise</span>
          <button style={{ background:'none', border:'1px solid '+BORDER, borderRadius:8, padding:'6px 8px', cursor:'pointer', color:TEXT_NAV, display:'flex', alignItems:'center' }}>
            <IconBell/>
          </button>
          <div style={{ width:32, height:32, borderRadius:'50%', background:PRIMARY, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
            {userInitials}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, marginTop:52, minHeight:0 }}>

        {/* ── Sidebar ── */}
        <div style={{ width:sidebarW, flexShrink:0, background:BG_SIDEBAR, borderRight:'1px solid '+BORDER, display:'flex', flexDirection:'column', position:'fixed', top:52, bottom:0, left:0, transition:'width 0.25s', zIndex:90, overflow:'hidden' }}>

          {/* Sidebar Header */}
          <div style={{ background:PRIMARY, padding: collapsed ? '14px 0' : '14px 16px', display:'flex', alignItems:'center', gap:10, flexShrink:0, justifyContent: collapsed ? 'center' : 'space-between', minHeight:56 }}>
            {!collapsed && (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:28, height:28, borderRadius:7, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ color:'#fff', fontSize:11, fontWeight:700 }}>LR</span>
                </div>
                <span style={{ color:'#fff', fontSize:13, fontWeight:700, whiteSpace:'nowrap' }}>Lead Radar</span>
              </div>
            )}
            <button onClick={() => setCollapsed(c => !c)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, padding:'5px 6px', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', flexShrink:0 }}>
              <IconMenu/>
            </button>
          </div>

          {/* Nav */}
          <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding: collapsed ? '8px 0' : '8px 0' }}>
            {SECTIONS.map((section, si) => (
              <div key={si}>
                {section.label && !collapsed && (
                  <button onClick={() => toggleSection(section.label)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px 4px', background:'none', border:'none', cursor:'pointer' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>{section.label}</span>
                    <IconChevron open={openSections[section.label]}/>
                  </button>
                )}
                {(!section.label || !collapsed) && (openSections[section.label] !== false || !section.label) && section.items.map(item => {
                  const active = location.pathname === item.to || (item.to !== '/dashboard' && item.to !== '/getting-started' && location.pathname.startsWith(item.to))
                  return (
                    <NavLink key={item.to} to={item.to} style={{ display:'flex', alignItems:'center', gap:10, padding: collapsed ? '10px 0' : '8px 12px', margin: collapsed ? '1px 6px' : '1px 8px', borderRadius:8, textDecoration:'none', background: active ? (collapsed ? PRIMARY_LIGHT : '#fff') : 'transparent', color: active ? TEXT_NAV_ACTIVE : TEXT_NAV, boxShadow: active && !collapsed ? '0 1px 4px rgba(91,79,216,0.12)' : 'none', transition:'all 0.15s', justifyContent: collapsed ? 'center' : 'flex-start', fontWeight: active ? 600 : 400 }}
                      onMouseEnter={e => { if(!active) e.currentTarget.style.background='#F9F8FF' }}
                      onMouseLeave={e => { if(!active) e.currentTarget.style.background='transparent' }}>
                      <span style={{ flexShrink:0, display:'flex', alignItems:'center', color: active ? PRIMARY : TEXT_NAV }}>
                        <item.icon/>
                      </span>
                      {!collapsed && <span style={{ fontSize:13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</span>}
                    </NavLink>
                  )
                })}
                {si < SECTIONS.length-1 && !collapsed && (
                  <div style={{ height:1, background:BORDER, margin:'6px 16px' }}/>
                )}
              </div>
            ))}
          </div>

          {/* Bottom: User */}
          <div style={{ borderTop:'1px solid '+BORDER, padding: collapsed ? '10px 0' : '10px 12px', flexShrink:0 }}>
            {!collapsed ? (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:30, height:30, borderRadius:'50%', background:PRIMARY, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700, flexShrink:0 }}>{userInitials}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{userName}</div>
                  <div style={{ fontSize:10, color:TEXT_NAV }}>Admin</div>
                </div>
                <button onClick={handleLogout} title="Abmelden" style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', padding:4, display:'flex', alignItems:'center', borderRadius:5 }}>
                  <IconLogout/>
                </button>
              </div>
            ) : (
              <div style={{ display:'flex', justifyContent:'center' }}>
                <button onClick={handleLogout} title="Abmelden" style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', padding:6, display:'flex', alignItems:'center' }}>
                  <IconLogout/>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Main Content ── */}
        <div style={{ flex:1, marginLeft:sidebarW, transition:'margin-left 0.25s', display:'flex', flexDirection:'column', minHeight:0, minWidth:0 }}>
          <div style={{ flex:1, overflowY:'auto', padding:'24px 28px', minHeight:0 }}>
            {children}
          </div>
        </div>

      </div>
    </div>
  )
}
