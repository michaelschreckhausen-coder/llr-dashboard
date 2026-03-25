import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useSubscription } from './lib/useSubscription'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Settings from './pages/Settings'
import BrandVoice from './pages/BrandVoice'
import AdminUsers from './pages/AdminUsers'
import Profile from './pages/Profile'
import LinkedInAbout from './pages/LinkedInAbout'
import Layout from './components/Layout'

/* ── Feature Gate: KI nur ab Pro ── */
function KiGate({ sub, children }) {
  if (sub && sub.ai_access) return children
  return React.createElement('div', {
    style: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:16, textAlign:'center', padding:24 }
  },
    React.createElement('div', { style: { fontSize:48 } }, '🔒'),
    React.createElement('div', { style: { fontSize:22, fontWeight:800, color:'#0F172A', marginBottom:4 } }, 'KI-Feature gesperrt'),
    React.createElement('div', { style: { fontSize:14, color:'#64748B', maxWidth:380, lineHeight:1.6 } },
      'Dieses Feature ist ab dem Pro-Plan verfuegbar. Upgrade jetzt um KI-generierte LinkedIn-Texte zu nutzen.'
    ),
    React.createElement('a', {
      href: '/settings',
      style: { marginTop:8, padding:'10px 24px', borderRadius:999, background:'linear-gradient(135deg,#F97316,#EA6C0A)', color:'#fff', fontSize:14, fontWeight:700, textDecoration:'none', boxShadow:'0 2px 8px rgba(249,115,22,0.35)' }
    }, 'Jetzt upgraden')
  )
}

/* ── Coming Soon ── */
function ComingSoon({ title }) {
  return React.createElement('div', {
    style: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:16, textAlign:'center', padding:24 }
  },
    React.createElement('div', { style: { fontSize:48 } }, '🚧'),
    React.createElement('div', { style: { fontSize:22, fontWeight:800, color:'#0F172A', marginBottom:4 } }, title + ' — Demnächst verfügbar'),
    React.createElement('div', { style: { fontSize:14, color:'#64748B', maxWidth:380, lineHeight:1.6 } },
      'Diese Funktion wird gerade entwickelt und ist bald verfügbar.'
    )
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [role, setRole] = useState(null)
  const { sub, plan, loading: subLoading } = useSubscription(session)

  useEffect(function() {
    supabase.auth.getSession().then(function(res) {
      setSession(res.data.session)
      if (res.data.session) fetchRole()
    })
    var listener = supabase.auth.onAuthStateChange(function(_, s) {
      setSession(s)
      if (s) fetchRole(); else setRole(null)
    })
    return function() { listener.data.subscription.unsubscribe() }
  }, [])

  async function fetchRole() {
    var result = await supabase.rpc('get_my_role')
    setRole(result.data || 'user')
  }

  if (session === undefined || (session && role === null))
    return React.createElement('div', { style: { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#94A3B8', fontSize:14, gap:10 } }, 'Laden...')
  if (!session) return React.createElement(Login, null)

  return React.createElement(Layout, { session, role, sub, plan },
    React.createElement(Routes, null,
      React.createElement(Route, { path:'/', element: React.createElement(Dashboard, { session, sub }) }),
      React.createElement(Route, { path:'/leads', element: React.createElement(Leads, { session, sub }) }),
      React.createElement(Route, { path:'/comments', element: React.createElement(ComingSoon, { title: 'Kommentare' }) }),
      React.createElement(Route, { path:'/brand-voice', element: React.createElement(BrandVoice, { session, sub }) }),
      React.createElement(Route, { path:'/linkedin-about',
        element: React.createElement(KiGate, { sub },
          React.createElement(LinkedInAbout, { session, sub })
        )
      }),
      React.createElement(Route, { path:'/settings', element: React.createElement(Settings, { session, sub, plan }) }),
      React.createElement(Route, { path:'/profile', element: React.createElement(Profile, { session }) }),
      role === 'admin' ? React.createElement(Route, { path:'/admin/users', element: React.createElement(AdminUsers, { session }) }) : null,
      React.createElement(Route, { path:'*', element: React.createElement(Navigate, { to:'/', replace:true }) })
    )
  )
}
