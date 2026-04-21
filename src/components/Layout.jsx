import React, { useState, useEffect } from 'react'
import { useResponsive } from '../hooks/useResponsive'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { useTeam } from '../context/TeamContext'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'
import TrialBanner from './TrialBanner'

// ─── Design Tokens (Theme-aware, Phase Theme-1) ────────────────────────────────
// Alle Farben sind CSS-Variablen-Referenzen — sie ändern sich automatisch,
// wenn der User zwischen Light/Dark wechselt. Definiert in src/index.css.
const T = {
  bg:       'transparent',                                   // Body rendert Theme-Background
  primary:  'var(--primary)',                                // Whitelabel + Theme-respektiert
  pDark:    'var(--primary-dark)',
  pLight:   'var(--primary-soft)',
  pGlow:    'var(--primary-glow)',
  white:    'var(--surface)',                                // Solid white (Light) oder Glass (Dark)
  border:   'var(--border)',
  navText:  'var(--text-muted)',
  text:     'var(--text-primary)',
  sidebar:  'var(--sidebar-bg)',                             // Respektiert Whitelabel
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
function SvgIcon({ children, size=18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
function IcRocket()   { return <SvgIcon><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></SvgIcon> }
function IcHome()     { return <SvgIcon><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></SvgIcon> }
function IcUsers()    { return <SvgIcon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></SvgIcon> }
function IcHeart()    { return <SvgIcon><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></SvgIcon> }
function IcGrid()     { return <SvgIcon><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></SvgIcon> }
function IcBarChart() { return <SvgIcon><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></SvgIcon> }
function IcStar()     { return <SvgIcon><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></SvgIcon> }
function IcMail()     { return <SvgIcon><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></SvgIcon> }
function IcChat()     { return <SvgIcon><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></SvgIcon> }
function IcCalPen()   { return <SvgIcon><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></SvgIcon> }
function IcMic()      { return <SvgIcon><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></SvgIcon> }
function IcLinkedIn() { return <SvgIcon><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></SvgIcon> }
function IcBell()     { return <SvgIcon><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></SvgIcon> }
function IcChevron()  { return <SvgIcon size={12}><polyline points="6 9 12 15 18 9"/></SvgIcon> }
function IcLogout()   { return <SvgIcon size={15}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></SvgIcon> }
function IcCloud()    { return <SvgIcon><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></SvgIcon> }
function IcKanban()   { return <SvgIcon><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></SvgIcon> }
function IcZap()      { return <SvgIcon><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></SvgIcon> }
function IcTarget()   { return <SvgIcon><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></SvgIcon> }
function IcShield()   { return <SvgIcon><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></SvgIcon> }
function IcUsers2()   { return <SvgIcon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></SvgIcon> }
function IcKey()      { return <SvgIcon><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></SvgIcon> }
function IcBrain()    { return <SvgIcon><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-4.73A3 3 0 0 1 4 11.5 3 3 0 0 1 7 8.5a3 3 0 0 1 .1-.76A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-4.73A3 3 0 0 0 20 11.5 3 3 0 0 0 17 8.5a3 3 0 0 0-.1-.76A2.5 2.5 0 0 0 14.5 2z"/></SvgIcon> }

// ─── Navigation Structure ─────────────────────────────────────────────────────
function IcAssistant() { return <SvgIcon><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></SvgIcon> }
function IcCard() { return <SvgIcon><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></SvgIcon> }
function getNav(t) {
  return [
  { to: '/dashboard',       icon: IcHome,     label: t('nav.home') },
  { to: '/assistant',       icon: IcAssistant, label: t('nav.assistant') },

  { divider: true, label: t('nav.branding') },
  { to: '/brand-voice',     icon: IcMic,      label: t('nav.brandVoice') },
  { to: '/zielgruppen',     icon: IcTarget,   label: t('nav.zielgruppen') },
  { to: '/wissensdatenbank',          icon: IcCloud,    label: t('nav.wissensdatenbank') },
  { to: '/profiltexte',     icon: IcLinkedIn, label: t('nav.profiltexte') },
  { divider: true, label: t('nav.sales') },
  { to: '/leads',           icon: IcUsers,    label: t('nav.crm') },
  { to: '/aufgaben',        icon: IcKanban,   label: t('nav.aufgaben') },
  { to: '/deals',           icon: IcBarChart,    label: t('nav.deals') },
  { to: '/organizations',   icon: IcUsers2,      label: 'Organisationen' },
  { to: '/pipeline',        icon: IcGrid,     label: t('nav.pipeline') },
  { to: '/crm-enrichment',  icon: IcBrain,    label: t('nav.leadIntelligence') },
  { subSection: true, label: t('nav.communication'), icon: IcChat, items: [
    { to: '/vernetzungen', icon: IcHeart, label: t('nav.vernetzungen') },
    { to: '/messages',     icon: IcMail,  label: t('nav.nachrichten') },
  ]},
  { to: '/automatisierung', icon: IcZap,      label: t('nav.automatisierung') },
  { divider: true, label: t('nav.content') },
  { to: '/content-studio',  icon: IcStar,     label: t('nav.contentStudio') },
  { to: '/redaktionsplan',  icon: IcCalPen,   label: t('nav.redaktionsplan') },

  { divider: true, label: t('nav.reporting') },
  { to: '/reports',         icon: IcBarChart, label: t('nav.salesReporting') },
  { to: '/ssi',             icon: IcTarget,   label: t('nav.ssiTracker') },

  { divider: true, label: 'Konto' },
  { to: '/billing',         icon: IcCard,     label: 'Abrechnung' },
  ]
}

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ item, indent, inSection, collapsed }) {
  const loc = useLocation()
  const isActive = loc.pathname === item.to || loc.pathname.startsWith(item.to + '/')

  return (
    <NavLink to={item.to} style={{ textDecoration:'none' }} title={collapsed ? item.label : undefined}>
      {({ isActive: navActive }) => (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : (indent ? 8 : 12),
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '10px 0' : (indent ? '7px 10px' : (inSection ? '9px 12px 9px 20px' : '10px 12px')),
          borderRadius: 10,
          margin: collapsed ? '1px 8px' : (indent ? '1px 4px' : (inSection ? '1px 4px' : '1px 8px')),
          background: isActive ? T.pLight : 'transparent',
          color: isActive ? T.primary : T.navText,
          transition: 'all 0.18s ease',
          cursor: 'pointer',
          fontWeight: isActive ? 500 : 400,
          fontSize: (indent || inSection) ? 13 : 14,
          letterSpacing: '-0.005em',
        }}>
          <span style={{
            display:'flex', alignItems:'center', justifyContent:'center',
            width: indent ? 22 : 24, height: indent ? 22 : 24, flexShrink: 0,
            color: isActive ? T.primary : T.navText,
            transition: 'all 0.18s ease',
          }}>
            <item.icon />
          </span>
          {!collapsed && (
            <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {item.label}
            </span>
          )}
        </div>
      )}
    </NavLink>
  )
}

// ─── SubSection (verschachteltes Accordion unter NavSection) ─────────────────
function SubSection({ item, location }) {
  const hasActive = item.items.some(it => location.pathname === it.to || location.pathname.startsWith(it.to + '/'))
  const [open, setOpen] = useState(hasActive)
  useEffect(() => { if (hasActive) setOpen(true) }, [location.pathname])
  return (
    <div style={{ marginLeft: 12 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: 'calc(100% - 8px)', display:'flex', alignItems:'center', gap:10,
        padding: '8px 12px', margin: '1px 0', borderRadius: 10, border:'none',
        cursor:'pointer', background: open ? T.pLight : 'transparent',
        color: open ? T.primary : T.navText, fontSize:13, fontWeight: open ? 600 : 400,
        transition:'all 0.15s',
      }}>
        <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:8, background:'transparent', color: open ? T.primary : T.navText, flexShrink:0 }}>
          <item.icon />
        </span>
        <span style={{ flex:1, textAlign:'left' }}>{item.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition:'transform 0.2s', flexShrink:0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div style={{ overflow:'hidden', maxHeight: open ? '200px' : '0px', transition:'max-height 0.3s ease', marginLeft: 13 }}>
        {item.items.map((sub, i) => <NavItem key={i} item={sub} indent />)}
      </div>
    </div>
  )
}

// ─── NavSection (Accordion, collapsed: flat mit Divider) ─────────────────────
function NavSection({ label, items, isAdmin, location, collapsed, isOpen, onOpen, onToggle }) {
  // Auto-open wenn ein Kind aktiv ist
  const hasActive = items.some(it => {
    if (it.to) return location.pathname === it.to || location.pathname.startsWith(it.to + '/')
    if (it.subSection) return it.items.some(sub => location.pathname === sub.to || location.pathname.startsWith(sub.to + '/'))
    return false
  })
  const open = isOpen

  // Wenn Route wechselt und ein Kind aktiv wird → aufklappen
  useEffect(() => {
    if (hasActive) onOpen()
  }, [location.pathname])

  const visibleItems = items.filter(it => !it.adminOnly || isAdmin)
  if (visibleItems.length === 0) return null

  // ── Collapsed-Modus: Sections werden ganz ausgeblendet ─────────────────────
  // Im Icon-Rail sollen nur die Haupt-NavItems sichtbar sein (Startseite, Assistent).
  // Sub-Items in Sections (CRM, Pipeline, Aufgaben, etc.) erreicht der User ueber
  // den Hover-Expand oder indem er die Sidebar ueber den Toggle wieder aufklappt.
  if (collapsed) {
    return null
  }

  return (
    <div>
      {/* Section Header — gleiche Optik wie NavItem */}
      <button
        onClick={() => onToggle()}
        style={{
          width: 'calc(100% - 16px)', display:'flex', alignItems:'center', gap:12,
          padding: '10px 12px', margin: '1px 8px',
          borderRadius: 10, border: 'none', cursor: 'pointer',
          background: open ? T.pLight : 'transparent',
          color: open ? T.primary : T.navText,
          transition: 'all 0.18s ease',
          fontWeight: open ? 500 : 400,
          fontSize: 14,
          letterSpacing: '-0.005em',
          fontFamily: 'inherit',
        }}>
        {/* Icon-Platz links — Pfeil als Icon */}
        <span style={{
          display:'flex', alignItems:'center', justifyContent:'center',
          width: 24, height: 24, flexShrink: 0,
          color: open ? T.primary : T.navText,
          transition: 'all 0.18s ease',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition:'transform 0.22s ease' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
        {/* Label */}
        <span style={{ flex:1, textAlign:'left', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {label}
        </span>
      </button>

      {/* Items — animated */}
      <div style={{
        overflow: 'hidden',
        marginLeft: 16,
        maxHeight: open ? visibleItems.length * 60 + 200 + 'px' : '0px',
        transition: 'max-height 0.25s ease',
      }}>
        {visibleItems.map((item, i) => {
          if (item.subSection) {
            return <SubSection key={i} item={item} location={location} />
          }
          return <NavItem key={i} item={item} inSection />
        })}
      </div>
    </div>
  )
}

// ─── MenuBtn helper ──────────────────────────────────────────────────────────
function MenuBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left', transition:'background 0.12s' }}
      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background='none'}>
      <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:22, flexShrink:0, color:'var(--text-muted)' }}>{icon}</span>
      <span style={{ fontWeight:500 }}>{label}</span>
    </button>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function Layout({ session, role, onLogout, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobile } = useResponsive()
  const { wl } = useTenant()
  const { theme, preference, setPreference } = useTheme()
  const [burgerOpen, setBurgerOpen] = useState(false)
  const [openSection, setOpenSection] = useState(null)

  // Sidebar-Collapse (Desktop only, persisted in localStorage)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('leadesk.sidebar.collapsed') === '1' }
    catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('leadesk.sidebar.collapsed', collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  // Hover-Expand (Waalaxy-Pattern): Sidebar bleibt bei 68px Icon-Rail;
  // bei Maus-Hover klappt sie als Overlay auf 230px auf (position:absolute),
  // ohne den Main-Content zu verschieben. 150ms enter-delay + 200ms leave-delay
  // gegen Flicker bei schnellem Ueberfliegen.
  const [hovering, setHovering] = useState(false)
  const hoverTimerRef = React.useRef(null)
  const handleSidebarEnter = React.useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => setHovering(true), 150)
  }, [])
  const handleSidebarLeave = React.useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => setHovering(false), 200)
  }, [])

  // Im Mobile-Modus ist Collapse irrelevant (da eh per Burger gesteuert).
  // isCollapsed = Icon-Rail aktiv (kein Hover).
  // isHoverOverlay = collapsed true, aber hover triggered temporaere Expansion.
  const isCollapsed = !isMobile && collapsed && !hovering
  const isHoverOverlay = !isMobile && collapsed && hovering

  // Menü bei Navigation automatisch schließen
  useEffect(() => {
    setBurgerOpen(false)
  }, [location.pathname])
  const [userInitials, setUserInitials] = useState('US')
  const [userAvatar,   setUserAvatar]   = useState('')
  const [userName, setUserName] = useState('')
  const [notifications, setNotifications] = useState([])
  const [showNotif, setShowNotif] = useState(false)
  const [notifRead, setNotifRead] = useState(false)
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [globalSearch,  setGlobalSearch]  = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [allLeads,      setAllLeads]      = useState([])
  const [showMenu, setShowMenu] = useState(false)
  const [planId, setPlanId] = useState('free')
  const isAdmin = role === 'admin' || import.meta.env.VITE_APP_ENV === 'staging' || import.meta.env.VITE_APP_ENV === 'staging'
  const { team: activeTeam, allTeams, switchTeam } = useTeam()
  const isDemo  = session?.user?.email === 'demo@leadesk.de'
  const { t } = useTranslation()
  const { language, setLanguage } = useLanguage()
  const NAV = getNav(t)
  const PLAN_LABELS = {
    free: { label: 'LinkedIn Suite Free', sub: 'Basis-Funktionen' },
    starter: { label: 'LinkedIn Suite Basic', sub: 'Erweiterte Funktionen' },
    pro: { label: 'LinkedIn Suite Pro', sub: 'Alle Funktionen aktiv' },
    enterprise: { label: 'Enterprise', sub: 'Alle Funktionen aktiv' },
  }

  useEffect(() => {
    function closeMenu(e) {
      if (!e.target.closest('[data-user-menu]')) setShowMenu(false)
    }
    if (showMenu) document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [showMenu])

  // Profil-Daten laden (auch nach manuellem Update refreshen)
  const loadProfile = React.useCallback(() => {
    if (!session?.user) return
    const email = session.user.email || ''
    const meta  = session.user.user_metadata || {}
    const fallbackName = meta.full_name || meta.name || email.split('@')[0] || 'User'
    const setName = (n) => {
      const name = email === 'demo@leadesk.de' ? 'Demo Nutzer' : n
      setUserName(name)
      const parts = name.trim().split(' ')
      setUserInitials(parts.length >= 2
        ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
        : name.substring(0,2).toUpperCase()
      )
    }
    setName(fallbackName)
    supabase.from('profiles').select('full_name,plan_id,global_role,avatar_url').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setName(data.full_name)
        if (data?.plan_id) setPlanId(data.plan_id)
        if (data?.avatar_url) setUserAvatar(data.avatar_url)
      })
  }, [session])

  useEffect(() => {
    if (session?.user) {
      loadProfile()
      loadNotifications(session.user.id)
    }
  }, [session])

  // Auf Profil-Updates hören (von der Profilseite gefeuert)
  useEffect(() => {
    const handler = () => loadProfile()
    window.addEventListener('leadesk_profile_updated', handler)
    return () => window.removeEventListener('leadesk_profile_updated', handler)
  }, [loadProfile])

  async function loadNotifications(uid) {
    const notifs = []
    const since = new Date(Date.now()-7*24*60*60*1000).toISOString()
    const today = new Date().toISOString().split('T')[0]

    // Neue Leads (letzte 7 Tage)
    const {data:leads} = await supabase.from('leads').select('id,first_name,last_name,name,created_at').eq('user_id',uid).gte('created_at',since).order('created_at',{ascending:false}).limit(3)
    if(leads?.length) leads.forEach(l => {
      const name = l.first_name ? `${l.first_name} ${l.last_name||''}`.trim() : (l.name||'Unbekannt')
      notifs.push({id:'l'+l.id, type:'lead', icon:'👤', title:`Neuer Lead: ${name}`, time:l.created_at})
    })

    // Überfällige Follow-ups (heute und früher)
    const {data:followups} = await supabase.from('leads').select('id,first_name,last_name,next_followup').eq('user_id',uid).lte('next_followup',today).not('next_followup','is',null).order('next_followup',{ascending:true}).limit(3)
    if(followups?.length) followups.forEach(l => {
      const name = l.first_name ? `${l.first_name} ${l.last_name||''}`.trim() : 'Lead'
      const d = new Date(l.next_followup)
      const diff = Math.round((new Date()-d)/86400000)
      const label = diff===0?'Heute':diff===1?'Gestern':`vor ${diff} Tagen`
      notifs.push({id:'f'+l.id, type:'followup', icon:'📅', title:`Follow-up ${label}: ${name}`, time:l.next_followup+'T09:00:00'})
    })

    // Einladungen offen
    const {data:invites} = await supabase.from('invites').select('id,email,created_at').eq('status','pending').limit(2)
    if(invites?.length) invites.forEach(inv=>notifs.push({id:'i'+inv.id,type:'invite',icon:'✉️',title:'Einladung offen: '+inv.email,time:inv.created_at}))
    // CRM-Aufgaben: überfällige + heute fällig
    try {
      const today = new Date().toISOString().split('T')[0]
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1)
      const tomorrowStr = tomorrow.toISOString().split('T')[0]
      let tq = supabase.from('lead_tasks').select('id,title,due_date,leads(first_name,last_name)').eq('status','open').lte('due_date',tomorrowStr).order('due_date',{ascending:true}).limit(5)
      const tid = localStorage.getItem('leadesk_active_team_id')
      if (tid) tq = tq.eq('team_id', tid)
      const {data:tasks} = await tq
      if(tasks?.length) tasks.forEach(t=>{
        const isOverdue = t.due_date < today
        const leadName = t.leads ? `${t.leads.first_name||''} ${t.leads.last_name||''}`.trim() : ''
        notifs.push({id:'t'+t.id,type:'task',icon:isOverdue?'⚠':'📋',title:`${isOverdue?'Überfällig':'Fällig'}: ${t.title}${leadName?' · '+leadName:''}`,time:t.due_date+'T09:00:00'})
      })
    } catch(e) {}

    notifs.sort((a,b)=>new Date(b.time)-new Date(a.time))
    setNotifications(notifs.slice(0,8))
  }

  useEffect(()=>{
    function h(e){if(!e.target.closest('[data-notif]')&&!e.target.closest('[data-user-menu]')){setShowNotif(false);setShowMenu(false)}}
    document.addEventListener('mousedown',h)
    return ()=>document.removeEventListener('mousedown',h)
  },[])

  // Globale Suche: Leads laden
  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from('leads').select('id,first_name,last_name,name,company,job_title,hs_score,deal_stage')
      .eq('user_id', session.user.id)
      .then(({ data }) => setAllLeads(data || []))
  }, [session])

  // Leads neu laden wenn Suche geöffnet wird (damit neue Leads erscheinen)
  useEffect(() => {
    if (!searchOpen || !session?.user?.id) return
    supabase.from('leads').select('id,first_name,last_name,name,company,job_title,hs_score,deal_stage')
      .eq('user_id', session.user.id)
      .then(({ data }) => setAllLeads(data || []))
  }, [searchOpen])

  // Globale Suche: Cmd+K Shortcut
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(v => !v); setGlobalSearch('') }
      if (e.key === 'Escape') { setSearchOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Globale Suche: Filter
  useEffect(() => {
    if (!globalSearch.trim()) { setSearchResults([]); return }
    const q = globalSearch.toLowerCase()
    setSearchResults(allLeads.filter(l => {
      const n = ((l.first_name||'')+' '+(l.last_name||'')).trim() || l.name || ''
      return n.toLowerCase().includes(q) ||
        (l.company||'').toLowerCase().includes(q) ||
        (l.job_title||l.headline||'').toLowerCase().includes(q) ||
        (l.email||'').toLowerCase().includes(q)
    }).slice(0, 8))
  }, [globalSearch, allLeads])

  async function handleLogout() {
    await supabase.auth.signOut()
    if (onLogout) onLogout()
  }

  // Current page title
  const pageTitles = {
    '/': 'Startseite', '/dashboard': 'Startseite', '/leads': 'CRM',
    '/vernetzungen': 'Vernetzungen', '/pipeline': 'Pipeline',
    '/reports': 'Sales Reporting', '/ssi': 'SSI Tracker',
    '/messages': 'Nachrichten', '/getting-started': 'Erste Schritte',
    '/brand-voice': 'Brand Voice', '/zielgruppen': 'Zielgruppen', '/wissensdatenbank': 'Wissensdatenbank', '/profiltexte': 'Profiltexte',
    '/icp': 'Zielgruppen (ICP)',
    '/linkedin-connect': 'LinkedIn Cloud',
    '/content-studio': 'Content Studio', '/redaktionsplan': 'Redaktionsplan',
    '/settings/team': 'Team',
    '/settings': 'Einstellungen',
    '/profile': 'Mein Profil',
    '/whitelabel': 'Whitelabel',
    '/changelog': 'Changelog',
    '/admin/tenants': 'Tenant-Verwaltung',
    '/changelog': 'Changelog',
    '/admin': 'Admin Panel',
    '/admin/users': 'Benutzerverwaltung',
    '/admin-users': 'Benutzerverwaltung',
    '/comments': 'Kommentare',
    '/icp': 'Zielgruppen',
  }
  const currentTitle = Object.entries(pageTitles).find(([path]) =>
    location.pathname === path || location.pathname.startsWith(path + '/')
  )?.[1] || 'Leadesk'

  return (
    <div style={{ display:'flex', height:'100vh', background: T.bg, overflow:'hidden', fontFamily:'"Helvetica Neue", Inter, sans-serif' }}>

      {/* ── SIDEBAR ── */}
      {/* ── MOBILE: Burger Overlay ── */}
      {isMobile && burgerOpen && (
        <div onClick={() => setBurgerOpen(false)} style={{
          position:'fixed', inset:0, zIndex:300,
          background:'rgba(15,23,42,0.5)', backdropFilter:'blur(3px)'
        }}/>
      )}

      <aside
        onMouseEnter={!isMobile && collapsed ? handleSidebarEnter : undefined}
        onMouseLeave={!isMobile && collapsed ? handleSidebarLeave : undefined}
        style={{
        width: isMobile ? 280 : (isHoverOverlay ? 230 : (collapsed ? 68 : 230)),
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: T.sidebar,
        borderRight: `1px solid ${T.border}`,
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        position: isMobile ? 'fixed' : (isHoverOverlay ? 'absolute' : 'relative'),
        top: (isMobile || isHoverOverlay) ? 0 : undefined,
        left: (isMobile || isHoverOverlay) ? 0 : undefined,
        bottom: (isMobile || isHoverOverlay) ? 0 : undefined,
        zIndex: isMobile ? 400 : (isHoverOverlay ? 150 : undefined),
        transform: isMobile ? (burgerOpen ? 'translateX(0)' : 'translateX(-100%)') : undefined,
        transition: isMobile
          ? 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
          : 'width 0.22s cubic-bezier(0.4,0,0.2,1), box-shadow 0.22s ease',
        boxShadow: isMobile && burgerOpen
          ? '4px 0 32px rgba(0,0,0,0.40)'
          : (isHoverOverlay ? '8px 0 40px rgba(0,0,0,0.25), 2px 0 8px rgba(0,0,0,0.12)' : undefined),
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>

        {/* Logo Header */}
        <div style={{
          padding: isMobile
            ? '16px 14px 12px'
            : (isCollapsed ? '18px 10px 14px' : '20px 16px 16px'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          gap: 10,
          marginBottom: 8,
          borderBottom: isMobile ? '1px solid rgba(0,48,96,0.1)' : 'none',
          position: 'relative',
        }}>
          <NavLink to="/" onClick={() => isMobile && setBurgerOpen(false)} style={{ display:'flex', alignItems:'center', textDecoration:'none', lineHeight:0 }} title="Zur Startseite">
            {isCollapsed && !isMobile ? (
              // Collapsed: nur Favicon (quadratisch)
              <img
                src="/Leadesk_Favicon (1).png"
                alt="Leadesk"
                style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 8, cursor:'pointer' }}
              />
            ) : (
              wl?.logo_url
                ? <img src={wl.logo_url} alt={wl.app_name||'Leadesk'} style={{ height: isMobile ? 44 : 68, width: 'auto', objectFit: 'contain', maxWidth:160, cursor:'pointer' }}/>
                : <img src="/Leadesk_Logo.png" alt="Leadesk" style={{ height: isMobile ? 44 : 68, width: 'auto', objectFit: 'contain', cursor:'pointer' }}/>
            )}
          </NavLink>
          {isMobile && (
            <button onClick={() => setBurgerOpen(false)} style={{
              background:'var(--surface)', border:'none', borderRadius:99,
              width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer', color:T.primary, fontSize:18, lineHeight:1,
            }}>✕</button>
          )}
        </div>

        {/* Collapse-Toggle — Desktop only, als Pill am oberen Rand direkt unter Logo */}
        {!isMobile && (
          <button
            onClick={() => setCollapsed(v => !v)}
            title={isCollapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
            style={{
              alignSelf: isCollapsed ? 'center' : 'flex-end',
              margin: isCollapsed ? '0 auto 8px' : '0 12px 8px auto',
              width: 28, height: 28, borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: T.white,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.navText,
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = T.primary; e.currentTarget.style.borderColor = T.primary }}
            onMouseLeave={e => { e.currentTarget.style.color = T.navText; e.currentTarget.style.borderColor = T.border }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.22s ease' }}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}

        {/* Nav Items — Accordion */}
        <nav style={{ flex: 1, paddingBottom: 12 }}>
          {/* Top-level items (kein divider) */}
          {(() => {
            const sections = []
            let currentSection = null
            let topItems = []

            NAV.forEach(item => {
              if (item.divider) {
                if (currentSection) {
                  sections.push({ type:'section', label: currentSection.label, items: [] })
                }
                currentSection = item
                sections.push({ type:'section', label: item.label, items: [] })
              } else {
                if (currentSection) {
                  sections[sections.length - 1].items.push(item)
                } else {
                  topItems.push(item)
                }
              }
            })

            return (
              <>
                {topItems.map((item, i) => {
                  if (item.adminOnly && !isAdmin) return null
                  return <NavItem key={i} item={item} collapsed={isCollapsed} />
                })}
                {sections.map((sec, i) => (
                  <NavSection
                    key={i}
                    label={sec.label}
                    items={sec.items}
                    isAdmin={isAdmin}
                    location={location}
                    collapsed={isCollapsed}
                    isOpen={openSection === sec.label}
                    onOpen={() => setOpenSection(sec.label)}
                    onToggle={() => setOpenSection(prev => prev === sec.label ? null : sec.label)}
                  />
                ))}
              </>
            )
          })()}
        </nav>




      </aside>

      {/* ── MAIN AREA ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* TOP BAR */}
        <header style={{
          height: isMobile ? 56 : 68,
          background: isMobile ? 'var(--surface)' : 'transparent',
          backdropFilter: isMobile ? 'var(--glass-blur)' : 'none',
          WebkitBackdropFilter: isMobile ? 'var(--glass-blur)' : 'none',
          borderBottom: isMobile ? `1px solid ${T.border}` : 'none',
          display: 'flex',
          alignItems: 'center',
          padding: isMobile ? '0 16px' : '10px 20px',
          flexShrink: 0,
          gap: isMobile ? 12 : 10,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          {/* Mobile: Burger Button links */}
          {isMobile && (
            <button onClick={() => setBurgerOpen(v => !v)} style={{
              background:'none', border:'none', cursor:'pointer', padding:'6px',
              display:'flex', flexDirection:'column', gap:5, justifyContent:'center', alignItems:'center', flexShrink:0,
            }}>
              <span style={{ display:'block', width:22, height:2, background:T.primary, borderRadius:2 }}/>
              <span style={{ display:'block', width:22, height:2, background:T.primary, borderRadius:2 }}/>
              <span style={{ display:'block', width:22, height:2, background:T.primary, borderRadius:2 }}/>
            </button>
          )}
          {/* Suche — links, Pill — auf Mobile ausgeblendet */}
          {!isMobile && (
          <button onClick={() => setSearchOpen(true)} title={t('header.searchShortcut')}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:99,
              border:`1px solid ${T.border}`, background:'var(--surface-muted)',
              backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
              color:'var(--text-muted)', fontSize:12, cursor:'pointer',
              fontFamily:'inherit', whiteSpace:'nowrap', fontWeight:500,
              transition:'all 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            ─ <span>{t('header.search')}</span>
            <kbd style={{ fontSize:9, background:'var(--surface)', borderRadius:5, padding:'2px 6px', color:'var(--text-primary)', fontWeight:700, fontFamily:'inherit' }}>⌘K</kbd>
          </button>

          )} {/* end !isMobile search */}

          {/* Mitte — Logo Mobile / CTA Desktop */}
          <div style={{ flex:1, display:'flex', justifyContent:'center' }}>
            {isMobile ? (
              <NavLink to="/" style={{ display:'flex', alignItems:'center', textDecoration:'none', lineHeight:0 }} title="Zur Startseite">
                <img src="/Leadesk_Logo.png" alt="Leadesk" style={{ height:30, width:'auto', objectFit:'contain', cursor:'pointer' }}/>
              </NavLink>
            ) : (
              <button style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 22px', borderRadius:99,
                background:'var(--wl-primary, rgb(0,48,96))',
                color:'white', border:'none', cursor:'pointer', fontSize:13, fontWeight:700,
                boxShadow:'0 4px 16px rgba(48,160,208,0.35)', transition:'all 0.18s', whiteSpace:'nowrap', letterSpacing:'0.01em' }}
                onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(48,160,208,0.50)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 4px 16px rgba(48,160,208,0.35)'; }}
                onClick={() => navigate('/leads')}>
                <IcRocket/> Lead hinzufügen
              </button>
            )}
          </div>

          {/* Theme-Toggle — 3-Zustand: System → Light → Dark → System */}
          {!isMobile && (
            <button
              onClick={() => {
                const next = preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system'
                setPreference(next)
              }}
              title={
                preference === 'system' ? 'Theme: System (folgt OS-Einstellung)'
                : preference === 'light' ? 'Theme: Light'
                : 'Theme: Dark'
              }
              style={{
                background: 'var(--surface)',
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                width: 40, height: 40, borderRadius: 99,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              {preference === 'system' ? (
                /* Monitor/System Icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <path d="M8 21h8M12 17v4"/>
                </svg>
              ) : preference === 'light' ? (
                /* Sun Icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                </svg>
              ) : (
                /* Moon Icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          )}

          {/* Glocke — Pill */}
          <div style={{ position:'relative' }}>
            <button data-notif style={{ position:'relative', background:'var(--surface)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', border:'1px solid var(--border)', cursor:'pointer', width:40, height:40, borderRadius:99, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', transition:'all 0.15s' }}
              onClick={()=>{setShowNotif(v=>!v);setNotifRead(true)}}
              onMouseEnter={e=>{ e.currentTarget.style.color='var(--text-primary)' }}
              onMouseLeave={e=>{ e.currentTarget.style.color='var(--text-muted)' }}>
              <IcBell/>
              {notifications.length > 0 && !notifRead && (
                <span style={{ position:'absolute', top:7, right:7, width:8, height:8, borderRadius:'50%', background:'rgb(239,68,68)', border:'2px solid var(--bg-body)' }}/>
              )}
            </button>
              {showNotif && (
                <div data-notif style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:320, background:'var(--surface-glass-strong)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', borderRadius:16, boxShadow:'0 8px 32px rgba(15,23,42,0.18)', border:'1px solid var(--border)', zIndex:1000, overflow:'hidden' }}>
                  <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--surface)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontWeight:800, fontSize:14, color:'var(--text-primary)' }}>Benachrichtigungen</div>
                    {notifications.length>0 && <button onClick={()=>{setNotifications([]);setShowNotif(false)}} style={{ fontSize:11, color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', padding:'2px 6px', borderRadius:6, fontWeight:600 }}>Alle löschen</button>}
                  </div>
                  {notifications.length===0 ? (
                    <div style={{ padding:'32px 16px', textAlign:'center', color:'var(--text-soft)' }}>
                      <div style={{ fontSize:28, marginBottom:8 }}>─</div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>Keine Benachrichtigungen</div>
                      <div style={{ fontSize:12, marginTop:4 }}>Neue Leads und Events erscheinen hier</div>
                    </div>
                  ) : notifications.map(n=>(
                    <div key={n.id} style={{ padding:'12px 16px', borderBottom:'1px solid var(--surface)', display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e=>e.currentTarget.style.background='white'}>
                      <div style={{ fontSize:20, flexShrink:0, lineHeight:1.3 }}>{n.icon}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{n.title}</div>
                        <div style={{ fontSize:11, color:'var(--text-soft)', marginTop:2 }}>{new Date(n.time).toLocaleDateString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Avatar + Name Dropdown */}
            <div style={{ position:'relative' }} data-user-menu>
              <div onClick={() => setShowMenu(m => !m)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 14px 5px 5px', borderRadius:99, border:'none', background:'var(--surface)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', cursor:'pointer', userSelect:'none', transition:'all 0.18s',
                  boxShadow: showMenu ? '0 0 0 3px rgba(48,160,208,0.40), 0 1px 6px var(--border)' : '0 1px 6px var(--border), 0 0 0 1px var(--surface)' }}>
                <div style={{ width:30, height:30, borderRadius:99, background:'linear-gradient(135deg, var(--wl-primary, rgb(0,48,96)), rgb(48,160,208))', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, fontWeight:700, flexShrink:0, overflow:'hidden' }}>
                  {userAvatar ? <img src={userAvatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : userInitials}
                </div>
                <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {userName?.split(' ')[0] || 'Michael'}
                </span>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ color:'var(--text-soft)', transition:'transform 0.15s', transform: showMenu ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink:0 }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              {showMenu && (
                <div style={{ position:'absolute', top:'calc(100% + 10px)', right:0, width:240, background:'var(--surface-glass-strong)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)', border:'1px solid rgba(0,0,0,0.06)', zIndex:999, overflow:'hidden' }}>
                  {/* User Info Header */}
                  <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--surface)', background:'linear-gradient(135deg, var(--wl-primary, rgb(0,48,96)) 0%, rgb(48,160,208) 100%)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:'var(--text-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:14, fontWeight:800, flexShrink:0, overflow:'hidden' }}>
                        {userAvatar ? <img src={userAvatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:10 }}/> : userInitials}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'white', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{userName || 'Michael'}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                          <span style={{ fontSize:10, fontWeight:700, padding:'1px 8px', borderRadius:999, background:'var(--text-soft)', color:'white' }}>{isAdmin ? 'Admin' : 'User'}</span>
                          <span style={{ fontSize:10, color:'var(--text-primary)' }}>Enterprise</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Menu Items */}
                  <div style={{ padding:'6px' }}>
                    <button onClick={() => { navigate('/profile'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--primary)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Mein Profil</span>
                    </button>
                    <button onClick={() => { navigate('/settings'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--primary)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Einstellungen</span>
                    </button>
                    <button onClick={() => { navigate('/integrations'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--primary)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="7" height="7" rx="1"/><rect x="15" y="7" width="7" height="7" rx="1"/><path d="M9 10.5h6"/><path d="M12 7V3"/><path d="M12 21v-4"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Integrationen</span>
                    </button>
                    <button onClick={() => { navigate('/profiltexte'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--primary)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Mein LinkedIn</span>
                    </button>
                    <button onClick={() => { navigate('/getting-started'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--primary)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Erste Schritte</span>
                    </button>
                    <button onClick={()=>{navigate('/linkedin-connect');setShowMenu(false)}}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--primary)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>LinkedIn Cloud</span>
                    </button>
                    <button onClick={()=>{navigate('/projekte');setShowMenu(false)}}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--primary)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Kanbanboards</span>
                    </button>
                    {/* Team-Anzeige + Switcher */}
                    {activeTeam && (
                      <div style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #F3F4F6', background:'var(--surface-muted)', margin:'2px 0' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--text-soft)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Team</div>
                        {allTeams?.length > 1 ? (
                          <>
                            <select
                              value={activeTeam.id}
                              onChange={async e => {
                                localStorage.setItem('leadesk_active_team_id', e.target.value)
                                await switchTeam(e.target.value)
                                setShowMenu(false)
                                window.location.href = '/leads'
                              }}
                              style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13, fontWeight:600, color:'var(--text-primary)', background:'var(--surface)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', cursor:'pointer', outline:'none' }}>
                              {allTeams.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <div style={{ fontSize:10, color:'var(--text-soft)', marginTop:4 }}>Dropdown → Team wechseln</div>
                          </>
                        ) : (
                          <div>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                              <div style={{ width:24, height:24, borderRadius:6, background:'var(--wl-primary, rgb(0,48,96))', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:11, flexShrink:0 }}>
                                {activeTeam.name?.[0]?.toUpperCase()}
                              </div>
                              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{activeTeam.name}</div>
                            </div>
                            <button onClick={() => { navigate('/settings/team'); setShowMenu(false) }}
                              style={{ fontSize:11, color: 'var(--primary)', background:'none', border:'none', cursor:'pointer', padding:0, fontWeight:600 }}>
                              + Weiteres Team erstellen →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={()=>{navigate('/settings/team');setShowMenu(false)}}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--primary)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Team-Einstellungen</span>
                    </button>
                    {isAdmin && (
                      <>
                        <div style={{ height:1, background:'#F3F4F6', margin:'4px 6px' }}/>
                        <div style={{ padding:'4px 12px 2px', fontSize:10, fontWeight:700, color:'var(--text-soft)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Admin</div>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} label="Admin Panel" onClick={() => { navigate('/admin'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>} label="─ Benutzerverwaltung" onClick={() => { navigate('/admin/users'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>} label="─ Changelog & Logs" onClick={() => { navigate('/admin-logs'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} label="─ Dokumentation" onClick={() => { navigate('/admin-docs'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>} label="Whitelabel" onClick={() => { navigate('/admin/whitelabel'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3v4M8 3v4M2 11h20"/></svg>} label="─ Tenant-Verwaltung" onClick={() => { navigate('/admin/tenants'); setShowMenu(false) }}/>

                      </>
                    )}
                    <div style={{ height:1, background:'#F3F4F6', margin:'4px 6px' }}/>
                    <div style={{ padding:'6px 12px 4px', fontSize:10, fontWeight:700, color:'var(--text-soft)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{t('common.language')}</div>
                    <div style={{ display:'flex', gap:6, padding:'4px 12px 8px' }}>
                      {['de','en'].map(lang => (
                        <button key={lang} onClick={() => setLanguage(lang)}
                          style={{ flex:1, padding:'6px 10px', borderRadius:8, border:'1.5px solid '+(language===lang?'var(--wl-primary,rgb(0,48,96))':'#E5E7EB'), background:language===lang?'var(--wl-primary,rgb(0,48,96))':'#fff', color:language===lang?'#fff':'#374151', fontSize:12, fontWeight:language===lang?700:400, cursor:'pointer' }}>
                          {lang === 'de' ? '🇩🇪 DE' : '🇬🇧 EN'}
                        </button>
                      ))}
                    </div>
                    <div style={{ height:1, background:'#F3F4F6', margin:'4px 6px' }}/>
                    {/* Demo-Switch Button */}
                    {!isDemo && (
                      <button onClick={async () => {
                        const { error } = await supabase.auth.signInWithPassword({ email:'demo@leadesk.de', password:'Demo1234!' })
                        if (!error) localStorage.setItem('llr_onboarding_done', '1')
                        setShowMenu(false)
                        navigate('/dashboard')
                      }} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'#f97316', textAlign:'left', fontWeight:600 }}
                        onMouseEnter={e => e.currentTarget.style.background='#FFF7ED'}
                        onMouseLeave={e => e.currentTarget.style.background='none'}>
                        <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'#f97316', flexShrink:0 }}>🎬</span>
                        <span>{t('header.switchToDemo')}</span>
                      </button>
                    )}
                    <button onClick={() => { handleLogout(); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'#DC2626', textAlign:'left', fontWeight:600 }}
                      onMouseEnter={e => e.currentTarget.style.background='#FEF2F2'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'#DC2626', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      </span>
                      <span>{t('common.logout')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

        </header>

                {/* PAGE CONTENT */}
        {/* Demo-Modus Banner */}
        {isDemo && (
          <div style={{ background:'linear-gradient(135deg,#f97316,#ef4444)', color:'white', padding:'8px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, fontSize:13, fontWeight:600 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:16 }}>🎬</span>
              <span>Demo-Modus — Du siehst Musterdaten. Alle Features sind voll funktionsfähig.</span>
            </div>
            <button onClick={async () => {
              await supabase.auth.signOut()
            }} style={{ background:'var(--text-soft)', border:'1px solid var(--text-soft)', borderRadius:8, color:'white', fontSize:12, fontWeight:700, padding:'4px 14px', cursor:'pointer' }}>
              ✕ Demo beenden
            </button>
          </div>
        )}
        <TrialBanner />
          <main style={{ flex:1, overflowY: isMobile ? 'hidden' : 'auto', padding: isMobile ? 0 : 28, minHeight:0, display:'flex', flexDirection:'column' }}>
          {children}
        </main>
      </div>

      {/* ── Globale Suche Modal ── */}
      {searchOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', backdropFilter:'blur(4px)', zIndex:9999, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:80 }}
          onClick={() => setSearchOpen(false)}>
          <div style={{ background:'var(--surface)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', borderRadius:16, width:540, maxWidth:'92vw', boxShadow:'0 24px 64px rgba(15,23,42,0.25)', overflow:'hidden' }}
            onClick={e => e.stopPropagation()}>
            {/* Input */}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderBottom:'1px solid #F1F5F9' }}>
              <span style={{ fontSize:16 }}>─</span>
              <input autoFocus value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
                placeholder="Lead suchen: Name, Firma…"
                style={{ flex:1, border:'none', outline:'none', fontSize:15, fontFamily:'inherit', color:'#0F172A' }}/>
              <kbd onClick={() => setSearchOpen(false)}
                style={{ fontSize:11, background:'#F1F5F9', borderRadius:6, padding:'2px 7px', color:'#64748B', cursor:'pointer' }}>ESC</kbd>
            </div>
            {/* Results */}
            {searchResults.length > 0 ? (
              <div style={{ maxHeight:360, overflowY:'auto' }}>
                {searchResults.map(lead => {
                  const name = ((lead.first_name||'')+' '+(lead.last_name||'')).trim() || lead.name || 'Unbekannt'
                  const score = lead.hs_score || 0
                  const scoreColor = score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#94A3B8'
                  return (
                    <div key={lead.id}
                      onClick={() => { navigate(`/leads/${lead.id}`); setSearchOpen(false); setGlobalSearch('') }}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid #F8FAFC' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:13, flexShrink:0 }}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:13, color:'#0F172A' }}>{name}</div>
                        <div style={{ fontSize:11, color:'#64748B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {lead.job_title||''}{lead.company?' · '+lead.company:''}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2, flexShrink:0 }}>
                        {score > 0 && <span style={{ fontSize:11, fontWeight:800, color:scoreColor }}>Score {score}</span>}
                        {lead.ai_buying_intent === 'hoch' && <span style={{ fontSize:9, fontWeight:700, color:'#ef4444', background:'#FEF2F2', padding:'1px 5px', borderRadius:4 }}>─ Heiß</span>}
                        {lead.deal_stage && lead.deal_stage !== 'kein_deal' && <span style={{ fontSize:9, color:'#8b5cf6', fontWeight:600 }}>{lead.deal_stage}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : globalSearch.trim() ? (
              <div style={{ padding:'32px', textAlign:'center', color:'var(--text-soft)', fontSize:13 }}>
                Kein Lead gefunden für „{globalSearch}"
              </div>
            ) : (
              <div style={{ padding:'16px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-soft)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Zuletzt hinzugefügt</div>
                {allLeads.slice(0,5).map(lead => {
                  const name = ((lead.first_name||'')+' '+(lead.last_name||'')).trim() || lead.name || 'Unbekannt'
                  return (
                    <div key={lead.id}
                      onClick={() => { navigate(`/leads/${lead.id}`); setSearchOpen(false) }}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'8px', borderRadius:8, cursor:'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <span style={{ fontSize:13 }}>─</span>
                      <span style={{ fontSize:13, color:'#374151', fontWeight:500 }}>{name}</span>
                      <span style={{ fontSize:11, color:'var(--text-soft)', marginLeft:'auto' }}>{lead.company||''}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


