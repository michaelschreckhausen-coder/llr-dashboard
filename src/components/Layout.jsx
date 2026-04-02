import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Design Tokens (Waalaxy-inspired) ──────────────────────────────────────────
const T = {
  bg:       'rgb(238,241,252)',
  primary:  'rgb(49,90,231)',
  pDark:    'rgb(35,68,180)',
  pLight:   'rgba(49,90,231,0.10)',
  pGlow:    'rgba(49,90,231,0.18)',
  white:    '#FFFFFF',
  border:   'rgba(49,90,231,0.12)',
  navText:  'rgb(110,114,140)',
  text:     'rgb(20,20,43)',
  sidebar:  'rgb(238,241,252)',
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
function IcMic()      { return <SvgIcon><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></SvgIcon> }
function IcLinkedIn() { return <SvgIcon><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></SvgIcon> }
function IcBell()     { return <SvgIcon><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></SvgIcon> }
function IcChevron()  { return <SvgIcon size={12}><polyline points="6 9 12 15 18 9"/></SvgIcon> }
function IcLogout()   { return <SvgIcon size={15}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></SvgIcon> }
function IcCloud()    { return <SvgIcon><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></SvgIcon> }
function IcTarget()   { return <SvgIcon><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></SvgIcon> }
function IcShield()   { return <SvgIcon><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></SvgIcon> }
function IcUsers2()   { return <SvgIcon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></SvgIcon> }
function IcKey()      { return <SvgIcon><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></SvgIcon> }

// ─── Navigation Structure ─────────────────────────────────────────────────────
const NAV = [
  { to: '/dashboard',       icon: IcHome,     label: 'Startseite' },
  { to: '/getting-started', icon: IcRocket,   label: 'Erste Schritte' },
  { to: '/settings/team',   icon: IcUsers2,   label: 'Team',           adminOnly: true },
  { divider: true, label: 'Sales' },
  { to: '/leads',           icon: IcUsers,    label: 'Interessenten' },
  { to: '/vernetzungen',    icon: IcHeart,    label: 'Vernetzungen' },
  { to: '/pipeline',        icon: IcGrid,     label: 'Pipeline' },
  { to: '/reports',         icon: IcBarChart, label: 'Reports' },
  { to: '/ssi',             icon: IcTarget,   label: 'SSI Tracker' },
  { to: '/messages',        icon: IcMail,     label: 'Nachrichten' },
  { divider: true, label: 'Branding' },
  { to: '/brand-voice',     icon: IcMic,      label: 'Brand Voice' },
  { to: '/linkedin-about',   icon: IcLinkedIn, label: 'LinkedIn Info' },
  { to: '/content-studio',  icon: IcStar,     label: 'Content Studio' },
]

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ item }) {
  const loc = useLocation()
  const isActive = loc.pathname === item.to || loc.pathname.startsWith(item.to + '/')

  return (
    <NavLink to={item.to} style={{ textDecoration:'none' }}>
      {({ isActive: navActive }) => (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          borderRadius: 14,
          margin: '1px 8px',
          background: isActive ? T.white : 'transparent',
          color: isActive ? T.primary : T.navText,
          boxShadow: isActive ? '0 2px 12px rgba(49,90,231,0.13), 0 1px 3px rgba(0,0,0,0.05)' : 'none',
          transition: 'all 0.18s ease',
          cursor: 'pointer',
          fontWeight: isActive ? 600 : 400,
          fontSize: 14,
        }}>
          <span style={{ 
            display:'flex', alignItems:'center', justifyContent:'center',
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
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
  const [userInitials, setUserInitials] = useState('US')
  const [userName, setUserName] = useState('')
  const [notifications, setNotifications] = useState([])
  const [showNotif, setShowNotif] = useState(false)
  const [notifRead, setNotifRead] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [planId, setPlanId] = useState('free')
  const isAdmin = role === 'admin'
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

  useEffect(() => {
    if (session?.user) {
      const email = session.user.email || ''
      const meta = session.user.user_metadata || {}
      const name = meta.full_name || meta.name || email.split('@')[0] || 'User'
      setUserName(name)
      const parts = name.split(' ')
      setUserInitials(parts.length >= 2
        ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
        : name.substring(0,2).toUpperCase()
      )
      // Lade Plan aus Profil
      supabase.from('profiles').select('plan_id,global_role').eq('id', session.user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.plan_id) setPlanId(data.plan_id)
          if (data?.global_role) {}
        })
      loadNotifications(session.user.id)
    }
  }, [session])

  async function loadNotifications(uid) {
    const notifs = []
    const since = new Date(Date.now()-7*24*60*60*1000).toISOString()
    const {data:leads} = await supabase.from('leads').select('id,name,created_at').eq('user_id',uid).gte('created_at',since).order('created_at',{ascending:false}).limit(3)
    if(leads?.length) leads.forEach(l=>notifs.push({id:'l'+l.id,type:'lead',icon:'👤',title:'Neuer Lead: '+(l.name||'Unbekannt'),time:l.created_at}))
    const {data:invites} = await supabase.from('invites').select('id,email,created_at').eq('status','pending').limit(3)
    if(invites?.length) invites.forEach(inv=>notifs.push({id:'i'+inv.id,type:'invite',icon:'✉️',title:'Einladung offen: '+inv.email,time:inv.created_at}))
    notifs.sort((a,b)=>new Date(b.time)-new Date(a.time))
    setNotifications(notifs.slice(0,8))
  }

  useEffect(()=>{
    function h(e){if(!e.target.closest('[data-notif]')&&!e.target.closest('[data-user-menu]')){setShowNotif(false);setShowMenu(false)}}
    document.addEventListener('mousedown',h)
    return ()=>document.removeEventListener('mousedown',h)
  },[])

  async function handleLogout() {
    await supabase.auth.signOut()
    if (onLogout) onLogout()
  }

  // Current page title
  const pageTitles = {
    '/': 'Startseite', '/dashboard': 'Startseite', '/leads': 'Interessenten',
    '/vernetzungen': 'Vernetzungen', '/pipeline': 'Pipeline',
    '/reports': 'Reports', '/ssi': 'SSI Tracker',
    '/messages': 'Nachrichten', '/getting-started': 'Erste Schritte',
    '/brand-voice': 'Brand Voice', '/linkedin-about': 'LinkedIn Info',
    '/icp': 'Zielgruppen (ICP)',
    '/linkedin-connect': 'LinkedIn Cloud',
    '/content-studio': 'Content Studio',
    '/settings/team': 'Team',
    '/settings': 'Einstellungen',
    '/profile': 'Mein Profil',
    '/whitelabel': 'Whitelabel',
    '/admin': 'Admin Panel',
    '/admin-users': 'Benutzerverwaltung',
    '/comments': 'Kommentare',
    '/icp': 'Zielgruppen',
  }
  const currentTitle = Object.entries(pageTitles).find(([path]) =>
    location.pathname === path || location.pathname.startsWith(path + '/')
  )?.[1] || 'Lead Radar'

  return (
    <div style={{ display:'flex', height:'100vh', background: T.bg, overflow:'hidden', fontFamily:'"Helvetica Neue", Inter, sans-serif' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: 230,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: T.sidebar,
        position: 'relative',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>

        {/* Logo Header */}
        <div style={{
          padding: '20px 16px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'linear-gradient(135deg, rgb(49,90,231) 0%, rgb(119,161,243) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 4px 12px rgba(49,90,231,0.35)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" stroke="white" strokeWidth="0.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: '-0.02em', lineHeight: 1 }}>Lead Radar</div>
            <div style={{ fontSize: 10, color: T.navText, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 1 }}>Sales Intelligence</div>
          </div>
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, paddingBottom: 12 }}>
          {NAV.map((item, i) => {
            if (item.adminOnly && !isAdmin) return null
            if (item.divider) return (
              <div key={i} style={{ margin: '10px 20px 4px', display:'flex', alignItems:'center', gap: 8 }}>
                <div style={{ flex:1, height:1, background: T.border }}/>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.navText, textTransform:'uppercase', letterSpacing:'0.08em', whiteSpace:'nowrap' }}>{item.label}</span>
                <div style={{ flex:1, height:1, background: T.border }}/>
              </div>
            )
            return <NavItem key={i} item={item} />
          })}
        </nav>

        {/* Enterprise Badge */}
        <div style={{ margin: '0 12px 10px', padding: '10px 12px', borderRadius: 14, background: 'linear-gradient(135deg, rgb(49,90,231) 0%, rgb(119,161,243) 100%)', position: 'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-20, right:-20, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.1)' }}/>
          <div style={{ position:'absolute', bottom:-30, left:-10, width:70, height:70, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
          <div style={{ position:'relative', zIndex:1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'white', marginBottom: 2 }}>{PLAN_LABELS[planId]?.label || 'LinkedIn Suite'}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>{PLAN_LABELS[planId]?.sub || 'Basis-Funktionen'}</div>
          </div>
        </div>

        {/* User + Logout */}
        <div style={{ padding: '10px 12px 16px', borderTop: '1px solid ' + T.border, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg, rgb(49,90,231), rgb(119,161,243))', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'white', fontSize:12, fontWeight:700 }}>
            {userInitials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:T.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{userName || 'michael'}</div>
            <div style={{ fontSize:10, color:T.navText }}>Admin</div>
          </div>
          <button onClick={handleLogout} title="Abmelden" style={{ background:'none', border:'none', cursor:'pointer', color:T.navText, padding:4, borderRadius:8, display:'flex', alignItems:'center', transition:'color 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.color='rgb(234,63,74)'}
            onMouseLeave={e=>e.currentTarget.style.color=T.navText}>
            <IcLogout/>
          </button>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* TOP BAR */}
        <header style={{
          height: 60,
          background: T.white,
          borderBottom: '1px solid ' + T.border,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 16,
          flexShrink: 0,
          boxShadow: '0 1px 0 rgba(49,90,231,0.08)',
        }}>
          {/* Page title */}
          <div style={{ flex:1 }}>
            <h1 style={{ margin:0, fontSize:18, fontWeight:800, color:T.text, letterSpacing:'-0.02em', lineHeight:1 }}>
              {currentTitle}
            </h1>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* Primary CTA */}
            <button style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 12,
              background: 'linear-gradient(135deg, rgb(49,90,231) 0%, rgb(100,140,240) 100%)',
              color: 'white', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, boxShadow: '0 4px 14px rgba(49,90,231,0.35)',
              transition: 'all 0.2s',
            }}
              onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(49,90,231,0.45)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 4px 14px rgba(49,90,231,0.35)'; }}
              onClick={() => navigate('/leads')}>
              <IcRocket/>
              Lead hinzufuegen
            </button>

            {/* Notification Bell */}
            <button data-notif style={{ position:'relative', background:T.pLight, border:'none', cursor:'pointer', width:38, height:38, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color:T.primary, transition:'background 0.15s' }}
              onClick={()=>{setShowNotif(v=>!v);setNotifRead(true)}}
              onMouseEnter={e=>e.currentTarget.style.background=T.pGlow}
              onMouseLeave={e=>e.currentTarget.style.background=T.pLight}>
              <IcBell/>
              {notifications.length > 0 && !notifRead && (
                <span style={{ position:'absolute', top:6, right:6, width:8, height:8, borderRadius:'50%', background:'rgb(234,63,74)', border:'2px solid '+T.white }}/>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotif && (
              <div data-notif style={{ position:'absolute', top:50, right:56, width:320, background:'white', borderRadius:16, boxShadow:'0 8px 32px rgba(15,23,42,0.18)', border:'1px solid #E5E7EB', zIndex:1000, overflow:'hidden' }}>
                <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontWeight:800, fontSize:14, color:'rgb(20,20,43)' }}>Benachrichtigungen</div>
                  {notifications.length>0 && <button onClick={()=>{setNotifications([]);setShowNotif(false)}} style={{ fontSize:11, color:'#6B7280', background:'none', border:'none', cursor:'pointer', padding:'2px 6px', borderRadius:6, fontWeight:600 }}>Alle löschen</button>}
                </div>
                {notifications.length===0 ? (
                  <div style={{ padding:'32px 16px', textAlign:'center', color:'#9CA3AF' }}>
                    <div style={{ fontSize:28, marginBottom:8 }}>🔔</div>
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

            {/* Avatar + Dropdown Menu */}
            <div style={{ position:'relative' }} data-user-menu>
              <div onClick={() => setShowMenu(m => !m)}
                style={{ width:38, height:38, borderRadius:12, background:'linear-gradient(135deg, rgb(49,90,231), rgb(119,161,243))', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(49,90,231,0.25)', userSelect:'none', transition:'transform 0.15s', transform: showMenu ? 'scale(0.95)' : 'scale(1)' }}>
                {userInitials}
              </div>
              {showMenu && (
                <div style={{ position:'absolute', top:'calc(100% + 10px)', right:0, width:240, background:'white', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)', border:'1px solid rgba(0,0,0,0.06)', zIndex:999, overflow:'hidden' }}>
                  {/* User Info Header */}
                  <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid #F3F4F6', background:'linear-gradient(135deg, rgb(49,90,231) 0%, rgb(119,161,243) 100%)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:'rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:14, fontWeight:800, flexShrink:0 }}>
                        {userInitials}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'white', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{userName || 'michael'}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                          <span style={{ fontSize:10, fontWeight:700, padding:'1px 8px', borderRadius:999, background:'rgba(255,255,255,0.25)', color:'white' }}>{isAdmin ? 'Admin' : 'User'}</span>
                          <span style={{ fontSize:10, color:'rgba(255,255,255,0.75)' }}>Enterprise</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Menu Items */}
                  <div style={{ padding:'6px' }}>
                    <button onClick={() => { navigate('/getting-started'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'rgb(49,90,231)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Mein Profil</span>
                    </button>
                    <button onClick={() => { navigate('/settings'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'rgb(49,90,231)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Einstellungen</span>
                    </button>
                    <button onClick={() => { navigate('/linkedin-about'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'rgb(49,90,231)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Mein LinkedIn</span>
                    </button>
                    <button onClick={() => { navigate('/getting-started'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'rgb(49,90,231)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Erste Schritte</span>
                    </button>
                    <button onClick={()=>{navigate('/linkedin-connect');setShowMenu(false)}}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F5F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color:'rgb(49,90,231)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>LinkedIn Cloud</span>
                    </button>
                    {/* Divider */}
                    {isAdmin && (
                      <>
                        <div style={{ height:1, background:'#F3F4F6', margin:'4px 6px' }}/>
                        <div style={{ padding:'4px 12px 2px', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Admin</div>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} label="Admin Panel" onClick={() => { navigate('/admin'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>} label="Whitelabel" onClick={() => { navigate('/admin/whitelabel'); setShowMenu(false) }}/>
                      </>
                    )}
                    <div style={{ height:1, background:'#F3F4F6', margin:'4px 6px' }}/>
                    {/* Logout */}
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
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main style={{ flex:1, overflowY:'auto', padding:28, minHeight:0 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
