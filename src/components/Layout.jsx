import React, { useState, useEffect } from 'react'
import { useResponsive } from '../hooks/useResponsive'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { useTeam } from '../context/TeamContext'

// ─── Design Tokens (Waalaxy-inspired) ──────────────────────────────────────────
// Basis-Tokens (werden bei Whitelabel durch CSS-Vars überschrieben)
const T = {
  bg:       'rgb(238,241,252)',
  primary:  'var(--wl-primary, rgb(49,90,231))',
  pDark:    'rgb(35,68,180)',
  pLight:   'rgba(var(--wl-primary-rgb, 49,90,231),0.10)',
  pGlow:    'rgba(var(--wl-primary-rgb, 49,90,231),0.18)',
  white:    '#FFFFFF',
  border:   'rgba(var(--wl-primary-rgb, 49,90,231),0.12)',
  navText:  'rgb(110,114,140)',
  text:     'rgb(20,20,43)',
  sidebar:  'var(--wl-sidebar-bg, rgb(238,241,252))',
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
const NAV = [
  { to: '/dashboard',       icon: IcHome,     label: 'Startseite' },
  { to: '/assistant',       icon: IcAssistant, label: 'Assistent' },

  { divider: true, label: 'Branding' },
  { to: '/brand-voice',     icon: IcMic,      label: 'Brand Voice' },
  { to: '/zielgruppen',     icon: IcTarget,   label: 'Zielgruppen' },
  { to: '/wissensdatenbank',          icon: IcCloud,    label: 'Wissensdatenbank' },
  { to: '/linkedin-profiloptimierer', icon: IcLinkedIn, label: 'Profiloptimierer' },
  { to: '/linkedin-about',  icon: IcLinkedIn, label: 'LinkedIn Info' },
  { divider: true, label: 'Sales' },
  { to: '/leads',           icon: IcUsers,    label: 'CRM' },
  { to: '/pipeline',        icon: IcGrid,     label: 'Pipeline' },
  { to: '/crm-enrichment',  icon: IcBrain,    label: 'Lead Intelligence' },
  { subSection: true, label: 'Communication', icon: IcChat, items: [
    { to: '/vernetzungen', icon: IcHeart, label: 'Vernetzungen' },
    { to: '/messages',     icon: IcMail,  label: 'Nachrichten' },
  ]},
  { to: '/automatisierung', icon: IcZap,      label: 'Automatisierung' },
  { divider: true, label: 'Content' },
  { to: '/content-studio',  icon: IcStar,     label: 'Content Studio' },
  { to: '/redaktionsplan',  icon: IcCalPen,   label: 'Redaktionsplan' },
  { divider: true, label: 'Projektmanagement' },
  { to: '/projekte',        icon: IcKanban,   label: 'Aufgaben' },
  { divider: true, label: 'Reporting' },
  { to: '/reports',         icon: IcBarChart, label: 'Sales Reporting' },
  { to: '/ssi',             icon: IcTarget,   label: 'SSI Tracker' },
]

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ item, indent }) {
  const loc = useLocation()
  const isActive = loc.pathname === item.to || loc.pathname.startsWith(item.to + '/')

  return (
    <NavLink to={item.to} style={{ textDecoration:'none' }}>
      {({ isActive: navActive }) => (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: indent ? 8 : 12,
          padding: indent ? '7px 10px' : '10px 12px',
          borderRadius: 12,
          margin: indent ? '1px 4px' : '1px 8px',
          background: isActive ? T.white : 'transparent',
          color: isActive ? T.primary : T.navText,
          boxShadow: isActive ? '0 2px 8px rgba(49,90,231,0.1)' : 'none',
          transition: 'all 0.18s ease',
          cursor: 'pointer',
          fontWeight: isActive ? 600 : 400,
          fontSize: indent ? 13 : 14,
        }}>
          <span style={{ 
            display:'flex', alignItems:'center', justifyContent:'center',
            width: indent ? 26 : 32, height: indent ? 26 : 32, borderRadius: 8, flexShrink: 0,
            background: isActive ? T.pLight : 'transparent',
            color: isActive ? T.primary : T.navText,
            transition: 'all 0.18s ease',
          }}>
            <item.icon />
          </span>
          <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {item.label}
          </span>
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
    <div style={{ marginLeft: 8 }}>
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
      <div style={{ overflow:'hidden', maxHeight: open ? '200px' : '0px', transition:'max-height 0.3s ease' }}>
        {item.items.map((sub, i) => <NavItem key={i} item={sub} indent />)}
      </div>
    </div>
  )
}

// ─── NavSection (Accordion) ──────────────────────────────────────────────────
function NavSection({ label, items, isAdmin, location }) {
  // Auto-open wenn ein Kind aktiv ist
  const hasActive = items.some(it => {
    if (it.to) return location.pathname === it.to || location.pathname.startsWith(it.to + '/')
    if (it.subSection) return it.items.some(sub => location.pathname === sub.to || location.pathname.startsWith(sub.to + '/'))
    return false
  })
  const [open, setOpen] = useState(hasActive)

  // Wenn Route wechselt und ein Kind aktiv wird → aufklappen
  useEffect(() => {
    if (hasActive) setOpen(true)
  }, [location.pathname])

  const visibleItems = items.filter(it => !it.adminOnly || isAdmin)
  if (visibleItems.length === 0) return null

  return (
    <div>
      {/* Section Header — gleiche Optik wie NavItem */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display:'flex', alignItems:'center', gap:12,
          padding: '10px 12px', margin: '1px 8px',
          width: 'calc(100% - 16px)',
          borderRadius: 14, border: 'none', cursor: 'pointer',
          background: open ? T.white : 'transparent',
          color: open ? T.primary : T.navText,
          boxShadow: open ? '0 2px 12px rgba(49,90,231,0.13), 0 1px 3px rgba(0,0,0,0.05)' : 'none',
          transition: 'all 0.18s ease',
          fontWeight: open ? 600 : 400,
          fontSize: 14,
        }}>
        {/* Icon-Platz links — Pfeil als Icon */}
        <span style={{
          display:'flex', alignItems:'center', justifyContent:'center',
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: open ? T.pLight : 'transparent',
          color: open ? T.primary : T.navText,
          transition: 'all 0.18s ease',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
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
        maxHeight: open ? visibleItems.length * 60 + 200 + 'px' : '0px',
        transition: 'max-height 0.25s ease',
      }}>
        {visibleItems.map((item, i) => {
          if (item.subSection) {
            return <SubSection key={i} item={item} location={location} />
          }
          return <NavItem key={i} item={item} />
        })}
      </div>
    </div>
  )
}

// ─── MenuBtn helper ──────────────────────────────────────────────────────────
function MenuBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left', transition:'background 0.12s' }}
      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
      onMouseLeave={e => e.currentTarget.style.background='none'}>
      <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:22, flexShrink:0, color:'#6B7280' }}>{icon}</span>
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
  const [burgerOpen, setBurgerOpen] = useState(false)

  // Menü bei Navigation automatisch schließen
  useEffect(() => {
    setBurgerOpen(false)
  }, [location.pathname])
  const [userInitials, setUserInitials] = useState('US')
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
  const isAdmin = role === 'admin'
  const { team: activeTeam, allTeams, switchTeam } = useTeam()
  const isDemo  = session?.user?.email === 'demo@leadesk.de'
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
    '/brand-voice': 'Brand Voice', '/zielgruppen': 'Zielgruppen', '/wissensdatenbank': 'Wissensdatenbank', '/linkedin-profiloptimierer': 'LinkedIn Profiloptimierer', '/linkedin-about': 'LinkedIn Info',
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

      <aside style={{
        width: isMobile ? 280 : 230,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: T.sidebar,
        position: isMobile ? 'fixed' : 'relative',
        top: isMobile ? 0 : undefined,
        left: isMobile ? 0 : undefined,
        bottom: isMobile ? 0 : undefined,
        zIndex: isMobile ? 400 : undefined,
        transform: isMobile ? (burgerOpen ? 'translateX(0)' : 'translateX(-100%)') : undefined,
        transition: isMobile ? 'transform 0.28s cubic-bezier(0.4,0,0.2,1)' : undefined,
        boxShadow: isMobile && burgerOpen ? '4px 0 32px rgba(49,90,231,0.18)' : undefined,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>

        {/* Logo Header */}
        <div style={{
          padding: isMobile ? '16px 14px 12px' : '20px 16px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 8,
          borderBottom: isMobile ? '1px solid rgba(49,90,231,0.1)' : 'none',
        }}>
          {wl?.logo_url
            ? <img src={wl.logo_url} alt={wl.app_name||'Leadesk'} style={{ height: isMobile ? 44 : 68, width: 'auto', objectFit: 'contain', maxWidth:160 }}/>
            : <img src="/Leadesk_Logo.png" alt="Leadesk" style={{ height: isMobile ? 44 : 68, width: 'auto', objectFit: 'contain' }}/>}
          {isMobile && (
            <button onClick={() => setBurgerOpen(false)} style={{
              background:'rgba(49,90,231,0.08)', border:'none', borderRadius:99,
              width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer', color:T.primary, fontSize:18, lineHeight:1,
            }}>✕</button>
          )}
        </div>

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
                  return <NavItem key={i} item={item} />
                })}
                {sections.map((sec, i) => (
                  <NavSection
                    key={i}
                    label={sec.label}
                    items={sec.items}
                    isAdmin={isAdmin}
                    location={location}
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
          background: isMobile ? 'white' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          padding: isMobile ? '0 16px' : '10px 20px',
          flexShrink: 0,
          gap: isMobile ? 12 : 10,
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: isMobile ? '0 1px 0 rgba(49,90,231,0.08)' : 'none',
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
          <button onClick={() => setSearchOpen(true)} title="Suche (⌘K)"
            style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:99,
              border:'none', background:'#fff', color:'#94A3B8', fontSize:12, cursor:'pointer',
              fontFamily:'inherit', whiteSpace:'nowrap', fontWeight:500,
              boxShadow:'0 1px 6px rgba(49,90,231,0.10), 0 0 0 1px rgba(49,90,231,0.07)' }}>
            ─ <span style={{ color:'#6B7280' }}>Suche…</span>
            <kbd style={{ fontSize:9, background:'#EEF2FF', borderRadius:5, padding:'2px 6px', color:'var(--wl-primary, rgb(49,90,231))', fontWeight:700, fontFamily:'inherit' }}>⌘K</kbd>
          </button>

          )} {/* end !isMobile search */}

          {/* Mitte — Logo Mobile / CTA Desktop */}
          <div style={{ flex:1, display:'flex', justifyContent:'center' }}>
            {isMobile ? (
              <img src="/Leadesk_Logo.png" alt="Leadesk" style={{ height:30, width:'auto', objectFit:'contain' }}/>
            ) : (
              <button style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 22px', borderRadius:99,
                background:'var(--wl-primary, rgb(49,90,231))',
                color:'white', border:'none', cursor:'pointer', fontSize:13, fontWeight:700,
                boxShadow:'0 4px 16px rgba(49,90,231,0.36)', transition:'all 0.18s', whiteSpace:'nowrap', letterSpacing:'0.01em' }}
                onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(49,90,231,0.44)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 4px 16px rgba(49,90,231,0.36)'; }}
                onClick={() => navigate('/leads')}>
                <IcRocket/> Lead hinzufügen
              </button>
            )}
          </div>

          {/* Glocke — Pill */}
          <div style={{ position:'relative' }}>
            <button data-notif style={{ position:'relative', background:'#fff', border:'none', cursor:'pointer', width:40, height:40, borderRadius:99, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--wl-primary, rgb(49,90,231))', transition:'all 0.15s',
              boxShadow:'0 1px 6px rgba(49,90,231,0.10), 0 0 0 1px rgba(49,90,231,0.07)' }}
              onClick={()=>{setShowNotif(v=>!v);setNotifRead(true)}}
              onMouseEnter={e=>e.currentTarget.style.background='#F5F6FF'}
              onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
              <IcBell/>
              {notifications.length > 0 && !notifRead && (
                <span style={{ position:'absolute', top:7, right:7, width:7, height:7, borderRadius:'50%', background:'rgb(234,63,74)', border:'2px solid #fff' }}/>
              )}
            </button>
              {showNotif && (
                <div data-notif style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:320, background:'white', borderRadius:16, boxShadow:'0 8px 32px rgba(15,23,42,0.18)', border:'1px solid #E5E7EB', zIndex:1000, overflow:'hidden' }}>
                  <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontWeight:800, fontSize:14, color:'rgb(20,20,43)' }}>Benachrichtigungen</div>
                    {notifications.length>0 && <button onClick={()=>{setNotifications([]);setShowNotif(false)}} style={{ fontSize:11, color:'#6B7280', background:'none', border:'none', cursor:'pointer', padding:'2px 6px', borderRadius:6, fontWeight:600 }}>Alle löschen</button>}
                  </div>
                  {notifications.length===0 ? (
                    <div style={{ padding:'32px 16px', textAlign:'center', color:'#9CA3AF' }}>
                      <div style={{ fontSize:28, marginBottom:8 }}>─</div>
                      <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)' }}>Keine Benachrichtigungen</div>
                      <div style={{ fontSize:12, marginTop:4 }}>Neue Leads und Events erscheinen hier</div>
                    </div>
                  ) : notifications.map(n=>(
                    <div key={n.id} style={{ padding:'12px 16px', borderBottom:'1px solid #F9FAFB', display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e=>e.currentTarget.style.background='white'}>
                      <div style={{ fontSize:20, flexShrink:0, lineHeight:1.3 }}>{n.icon}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{n.title}</div>
                        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{new Date(n.time).toLocaleDateString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Avatar + Name Dropdown */}
            <div style={{ position:'relative' }} data-user-menu>
              <div onClick={() => setShowMenu(m => !m)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 14px 5px 5px', borderRadius:99, border:'none', background:'#fff', cursor:'pointer', userSelect:'none', transition:'all 0.18s',
                  boxShadow: showMenu ? '0 0 0 3px rgba(49,90,231,0.14), 0 1px 6px rgba(49,90,231,0.10)' : '0 1px 6px rgba(49,90,231,0.10), 0 0 0 1px rgba(49,90,231,0.07)' }}>
                <div style={{ width:30, height:30, borderRadius:99, background:'linear-gradient(135deg, var(--wl-primary, rgb(49,90,231)), rgb(119,161,243))', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, fontWeight:700, flexShrink:0, overflow:'hidden' }}>
                  {userAvatar ? <img src={userAvatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : userInitials}
                </div>
                <span style={{ fontSize:12, fontWeight:600, color:'rgb(20,20,43)', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {userName?.split(' ')[0] || 'Michael'}
                </span>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ color:'#94A3B8', transition:'transform 0.15s', transform: showMenu ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink:0 }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              {showMenu && (
                <div style={{ position:'absolute', top:'calc(100% + 10px)', right:0, width:240, background:'white', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)', border:'1px solid rgba(0,0,0,0.06)', zIndex:999, overflow:'hidden' }}>
                  {/* User Info Header */}
                  <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid #F3F4F6', background:'linear-gradient(135deg, var(--wl-primary, rgb(49,90,231)) 0%, rgb(119,161,243) 100%)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:'rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:14, fontWeight:800, flexShrink:0, overflow:'hidden' }}>
                        {userAvatar ? <img src={userAvatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:10 }}/> : userInitials}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'white', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{userName || 'Michael'}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                          <span style={{ fontSize:10, fontWeight:700, padding:'1px 8px', borderRadius:999, background:'rgba(255,255,255,0.25)', color:'white' }}>{isAdmin ? 'Admin' : 'User'}</span>
                          <span style={{ fontSize:10, color:'rgba(255,255,255,0.75)' }}>Enterprise</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Menu Items */}
                  <div style={{ padding:'6px' }}>
                    <button onClick={() => { navigate('/profile'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--wl-primary, rgb(49,90,231))', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Mein Profil</span>
                    </button>
                    <button onClick={() => { navigate('/settings'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--wl-primary, rgb(49,90,231))', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Einstellungen</span>
                    </button>
                    <button onClick={() => { navigate('/linkedin-about'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--wl-primary, rgb(49,90,231))', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Mein LinkedIn</span>
                    </button>
                    <button onClick={() => { navigate('/getting-started'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--wl-primary, rgb(49,90,231))', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Erste Schritte</span>
                    </button>
                    <button onClick={()=>{navigate('/linkedin-connect');setShowMenu(false)}}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--wl-primary, rgb(49,90,231))', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>LinkedIn Cloud</span>
                    </button>
                    {/* Team-Anzeige + Switcher */}
                    {activeTeam && (
                      <div style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #F3F4F6', background:'#F9FAFB', margin:'2px 0' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Team</div>
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
                              style={{ width:'100%', padding:'6px 8px', border:'1px solid #E5E7EB', borderRadius:6, fontSize:13, fontWeight:600, color:'rgb(20,20,43)', background:'#fff', cursor:'pointer', outline:'none' }}>
                              {allTeams.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <div style={{ fontSize:10, color:'#9CA3AF', marginTop:4 }}>Dropdown → Team wechseln</div>
                          </>
                        ) : (
                          <div>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                              <div style={{ width:24, height:24, borderRadius:6, background:'var(--wl-primary, rgb(49,90,231))', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:11, flexShrink:0 }}>
                                {activeTeam.name?.[0]?.toUpperCase()}
                              </div>
                              <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)' }}>{activeTeam.name}</div>
                            </div>
                            <button onClick={() => { navigate('/settings/team'); setShowMenu(false) }}
                              style={{ fontSize:11, color:'var(--wl-primary, rgb(49,90,231))', background:'none', border:'none', cursor:'pointer', padding:0, fontWeight:600 }}>
                              + Weiteres Team erstellen →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={()=>{navigate('/settings/team');setShowMenu(false)}}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--wl-primary, rgb(49,90,231))', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Team-Einstellungen</span>
                    </button>
                    {isAdmin && (
                      <>
                        <div style={{ height:1, background:'#F3F4F6', margin:'4px 6px' }}/>
                        <div style={{ padding:'4px 12px 2px', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Admin</div>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} label="Admin Panel" onClick={() => { navigate('/admin'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>} label="─ Benutzerverwaltung" onClick={() => { navigate('/admin/users'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>} label="─ Changelog & Logs" onClick={() => { navigate('/admin-logs'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} label="─ Dokumentation" onClick={() => { navigate('/admin-docs'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>} label="Whitelabel" onClick={() => { navigate('/admin/whitelabel'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3v4M8 3v4M2 11h20"/></svg>} label="─ Tenant-Verwaltung" onClick={() => { navigate('/admin/tenants'); setShowMenu(false) }}/>

                      </>
                    )}
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
                        <span>Demo-Modus starten</span>
                      </button>
                    )}
                    <button onClick={() => { handleLogout(); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'#DC2626', textAlign:'left', fontWeight:600 }}
                      onMouseEnter={e => e.currentTarget.style.background='#FEF2F2'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'#DC2626', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      </span>
                      <span>Abmelden</span>
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
            }} style={{ background:'rgba(255,255,255,0.25)', border:'1px solid rgba(255,255,255,0.4)', borderRadius:8, color:'white', fontSize:12, fontWeight:700, padding:'4px 14px', cursor:'pointer' }}>
              ✕ Demo beenden
            </button>
          </div>
        )}
        <main style={{ flex:1, overflowY: isMobile ? 'hidden' : 'auto', padding: isMobile ? 0 : 28, minHeight:0, display:'flex', flexDirection:'column' }}>
          {children}
        </main>
      </div>

      {/* ── Globale Suche Modal ── */}
      {searchOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', backdropFilter:'blur(4px)', zIndex:9999, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:80 }}
          onClick={() => setSearchOpen(false)}>
          <div style={{ background:'#fff', borderRadius:16, width:540, maxWidth:'92vw', boxShadow:'0 24px 64px rgba(15,23,42,0.25)', overflow:'hidden' }}
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
              <div style={{ padding:'32px', textAlign:'center', color:'#94A3B8', fontSize:13 }}>
                Kein Lead gefunden für „{globalSearch}"
              </div>
            ) : (
              <div style={{ padding:'16px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Zuletzt hinzugefügt</div>
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
                      <span style={{ fontSize:11, color:'#94A3B8', marginLeft:'auto' }}>{lead.company||''}</span>
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
