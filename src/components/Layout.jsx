import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const C = {
  primary:      '#315AE7',
  primaryGrad:  'linear-gradient(98deg,#6720FF 0%,#315AE7 60%,#19AEFF 100%)',
  primaryLight: '#D6DEFC',
  primaryXLight:'#EEF1FC',
  navy:         '#14142B',
  text:         '#2D2D4E',
  muted:        '#7B7EA8',
  border:       'rgba(49,90,231,0.1)',
  white:        '#FFFFFF',
  bgPage:       '#EEF1FC',
  sidebarBg:    '#FFFFFF',
  success:      '#00C49F',
  amber:        '#F59E0B',
}

// ── Micro SVG Icons ────────────────────────────────────────────────────────────
function Icon({ children, size=16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
function IcHome()      { return <Icon><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></Icon> }
function IcLeads()     { return <Icon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Icon> }
function IcConnect()   { return <Icon><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.5 12.5a19.79 19.79 0 0 1-3-8.67A2 2 0 0 1 3.55 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.87-.87a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></Icon> }
function IcPipeline()  { return <Icon><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></Icon> }
function IcReport()    { return <Icon><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></Icon> }
function IcSSI()       { return <Icon><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></Icon> }
function IcMail()      { return <Icon><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></Icon> }
function IcBrand()     { return <Icon><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></Icon> }
function IcLinkedIn()  { return <Icon><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></Icon> }
function IcRocket()    { return <Icon><path d="M9.08 9H5a2 2 0 0 0-2 2l-1 7 8-2 8 2-1-7a2 2 0 0 0-2-2h-4.08"/><path d="M12 2a5 5 0 0 0-5 5v3h10V7a5 5 0 0 0-5-5z"/><line x1="12" y1="22" x2="12" y2="13"/><path d="M8 22h8"/></Icon> }
function IcStart()     { return <Icon><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></Icon> }
function IcBell()      { return <Icon><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></Icon> }
function IcLogout()    { return <Icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Icon> }
function IcChevron({ open }) { return <Icon size={12}><polyline points={open ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}/></Icon> }

const NAV_SECTIONS = [
  {
    items: [
      { to: '/',                 icon: IcHome,      label: 'Dashboard'            },
      { to: '/getting-started',  icon: IcStart,     label: 'Erste Schritte'       },
    ]
  },
  {
    title: 'Leads & Netzwerk',
    items: [
      { to: '/leads',            icon: IcLeads,     label: 'Leads'                },
      { to: '/vernetzungen',     icon: IcConnect,   label: 'Vernetzungen'         },
    ]
  },
  {
    title: 'Sales Suite',
    items: [
      { to: '/pipeline',         icon: IcPipeline,  label: 'Pipeline'             },
      { to: '/reports',          icon: IcReport,    label: 'Reports'              },
      { to: '/ssi',              icon: IcSSI,       label: 'Social Selling Index' },
      { to: '/messages',         icon: IcMail,      label: 'Nachrichten'          },
    ]
  },
  {
    title: 'Branding',
    items: [
      { to: '/brand-voice',      icon: IcBrand,     label: 'Brand Voice'          },
      { to: '/linkedin-info',    icon: IcLinkedIn,  label: 'LinkedIn Info'        },
    ]
  },
]

// ── Sidebar NavItem ────────────────────────────────────────────────────────────
function NavItem({ to, icon: Icon, label, collapsed }) {
  return (
    <NavLink to={to} end={to === '/'} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: collapsed ? '10px 0' : '9px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 10,
          margin: '1px 8px',
          background: isActive ? C.primaryLight : 'transparent',
          color: isActive ? C.primary : C.muted,
          fontWeight: isActive ? 600 : 400,
          fontSize: 13,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          position: 'relative',
        }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F3F4FD' }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
        >
          {isActive && (
            <div style={{
              position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)',
              width: 3, height: 18, borderRadius: 2,
              background: C.primaryGrad,
            }}/>
          )}
          <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}><Icon/></span>
          {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
        </div>
      )}
    </NavLink>
  )
}

// ── Main Layout ────────────────────────────────────────────────────────────────
export default function Layout({ session, onSignOut }) {
  const [collapsed, setCollapsed]   = useState(false)
  const [user, setUser]             = useState(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (session?.user) {
      supabase.from('profiles').select('full_name,avatar_url,plan').eq('id', session.user.id).single()
        .then(({ data }) => setUser(data || {}))
    }
  }, [session])

  const displayName = user?.full_name || session?.user?.email?.split('@')[0] || 'Michael'
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const sidebarW = collapsed ? 64 : 220

  // Current page title
  const pageLabels = {
    '/': 'Dashboard', '/getting-started': 'Erste Schritte', '/leads': 'Leads',
    '/vernetzungen': 'Vernetzungen', '/pipeline': 'Pipeline', '/reports': 'Reports',
    '/ssi': 'Social Selling Index', '/messages': 'Nachrichten',
    '/brand-voice': 'Brand Voice', '/linkedin-info': 'LinkedIn Info',
    '/icp': 'Zielgruppen (ICP)',
  }
  const pageTitle = pageLabels[location.pathname] || 'Lead Radar'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bgPage, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: sidebarW, minWidth: sidebarW, maxWidth: sidebarW,
        height: '100vh', display: 'flex', flexDirection: 'column',
        background: C.sidebarBg,
        borderRight: '1px solid ' + C.border,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden', position: 'relative', zIndex: 10,
        boxShadow: '4px 0 24px rgba(49,90,231,0.06)',
      }}>

        {/* Logo Header */}
        <div style={{
          padding: '0 12px',
          height: 56,
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid ' + C.border,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            {/* Logo mark — animated gradient orb */}
            <div style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: C.primaryGrad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(103,32,255,0.35)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" fillOpacity="0.9"/>
                <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6"/>
              </svg>
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, letterSpacing: '-0.01em', lineHeight: 1.1 }}>Lead Radar</div>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 500 }}>Sales Intelligence</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.muted, padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center',
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}
          {collapsed && (
            <button onClick={() => setCollapsed(false)} style={{
              position: 'absolute', right: -12, top: 20,
              width: 22, height: 22, borderRadius: '50%',
              background: C.white, border: '1px solid ' + C.border,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.primary, boxShadow: '0 1px 4px rgba(49,90,231,0.15)',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          )}
        </div>

        {/* Nav Sections */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} style={{ marginBottom: 4 }}>
              {section.title && !collapsed && (
                <div style={{
                  fontSize: 9, fontWeight: 700, color: C.muted,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  padding: '10px 20px 4px',
                }}>
                  {section.title}
                </div>
              )}
              {section.title && collapsed && <div style={{ height: 6 }}/>}
              {!section.title && si > 0 && <div style={{ margin: '4px 16px', height: 1, background: C.border }}/>}
              {section.items.map(item => (
                <NavItem key={item.to} {...item} collapsed={collapsed}/>
              ))}
            </div>
          ))}
        </div>

        {/* Enterprise Badge */}
        {!collapsed && (
          <div style={{
            margin: '0 12px 10px',
            padding: '10px 12px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(103,32,255,0.08) 0%, rgba(49,90,231,0.05) 100%)',
            border: '1px solid rgba(103,32,255,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 7,
                background: C.primaryGrad,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>Enterprise</div>
                <div style={{ fontSize: 9, color: C.muted }}>Alle Features aktiv</div>
              </div>
            </div>
          </div>
        )}

        {/* User Footer */}
        <div style={{
          padding: collapsed ? '10px 0' : '12px',
          borderTop: '1px solid ' + C.border,
          flexShrink: 0,
        }}>
          {collapsed ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: C.primaryGrad,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: 11, fontWeight: 700,
              }}>{initials}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: C.primaryGrad,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: 12, fontWeight: 700,
              }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                <div style={{ fontSize: 10, color: C.muted }}>Admin</div>
              </div>
              <button onClick={onSignOut} title="Abmelden" style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.muted, padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center',
                flexShrink: 0,
              }}><IcLogout/></button>
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* ── TOPBAR ── */}
        <header style={{
          height: 56, flexShrink: 0,
          background: C.white,
          borderBottom: '1px solid ' + C.border,
          display: 'flex', alignItems: 'center',
          padding: '0 24px',
          gap: 12,
          boxShadow: '0 1px 8px rgba(49,90,231,0.05)',
        }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Lead Radar</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{pageTitle}</span>
          </div>

          {/* CTA Button */}
          <button style={{
            background: C.primaryGrad,
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 2px 12px rgba(103,32,255,0.3)',
            whiteSpace: 'nowrap',
          }}>
            <IcRocket size={13}/>
            Lead importieren
          </button>

          {/* Bell */}
          <button style={{
            background: 'none', border: '1px solid ' + C.border,
            borderRadius: 8, padding: 7, cursor: 'pointer',
            color: C.muted, display: 'flex', alignItems: 'center',
            position: 'relative',
          }}>
            <IcBell/>
          </button>

          {/* User pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 10px',
            background: C.primaryXLight,
            borderRadius: 10,
            cursor: 'pointer',
            border: '1px solid ' + C.primaryLight,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: C.primaryGrad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0,
            }}>{initials}</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.primary }}>{displayName}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </header>

        {/* ── PAGE CONTENT ── */}
        <main style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '24px 28px',
          background: C.bgPage,
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Outlet (re-export from react-router-dom) ──────────────────────────────────
import { Outlet } from 'react-router-dom'
