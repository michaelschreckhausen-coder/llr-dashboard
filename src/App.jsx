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
import WhiteLabel  from './pages/WhiteLabel'
import Profile from './pages/Profile'
import LinkedInAbout from './pages/LinkedInAbout'
import Pipeline from './pages/Pipeline'
import Vernetzungen from './pages/Vernetzungen'
import Reports from './pages/Reports'
import ICP from './pages/ICP'
import ContentStudio from './pages/ContentStudio'
import Layout from './components/Layout'
import Onboarding from './pages/Onboarding'
// WhiteLabel wird direkt in Layout.jsx geladen

/* ââ Plan-Gate: zeigt Upgrade-Screen wenn Feature nicht freigeschaltet ââ */
function PlanGate({ allowed, requiredPlan, featureName, children }) {
  if (allowed) return children
  const planLabels = { starter:'LinkedIn Suite Basic', pro:'LinkedIn Suite Pro', enterprise:'Enterprise' }
  const planColors = { starter:'#0A66C2', pro:'#8B5CF6', enterprise:'#F59E0B' }
  const color = planColors[requiredPlan] || '#0A66C2'
  return React.createElement('div', {
    style: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:16, textAlign:'center', padding:32 }
  },
    React.createElement('div', { style:{ fontSize:56 } }, 'ð'),
    React.createElement('div', { style:{ fontSize:22, fontWeight:800, color:'#0F172A', marginBottom:4 } }, featureName + ' nicht verfÃ¼gbar'),
    React.createElement('div', { style:{ fontSize:14, color:'#64748B', maxWidth:420, lineHeight:1.65 } },
      'Dieses Feature ist ab dem ' + (planLabels[requiredPlan]||requiredPlan) + ' verfÃ¼gbar. Upgrade jetzt um vollen Zugang zu erhalten.'
    ),
    React.createElement('div', { style:{ display:'flex', gap:12, marginTop:8, flexWrap:'wrap', justifyContent:'center' } },
      React.createElement('a', {
        href:'/settings',
        style:{ padding:'10px 24px', borderRadius:999, background:'linear-gradient(135deg,'+color+','+color+'CC)', color:'#fff', fontSize:14, fontWeight:700, textDecoration:'none', boxShadow:'0 2px 8px '+color+'44' }
      }, 'ð Jetzt upgraden'),
      React.createElement('a', {
        href:'/settings',
        style:{ padding:'10px 24px', borderRadius:999, border:'1px solid #E2E8F0', background:'#fff', color:'#64748B', fontSize:14, fontWeight:600, textDecoration:'none' }
      }, 'PlÃ¤ne vergleichen')
    )
  )
}

/* ââ KI-Gate (nur AI-Feature) ââ */
function KiGate({ sub, children }) {
  return React.createElement(PlanGate, { allowed:sub&&sub.ai_access, requiredPlan:'pro', featureName:'KI-Features' }, children)
}

/* ââ Coming Soon ââ */
function ComingSoon({ title }) {
  return React.createElement('div', {
    style:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:16, textAlign:'center', padding:24 }
  },
    React.createElement('div', { style:{ fontSize:48 } }, 'ð§'),
    React.createElement('div', { style:{ fontSize:22, fontWeight:800, color:'#0F172A', marginBottom:4 } }, title + ' â DemnÃ¤chst verfÃ¼gbar'),
    React.createElement('div', { style:{ fontSize:14, color:'#64748B', maxWidth:380, lineHeight:1.6 } },
      'Diese Funktion wird gerade entwickelt und ist bald verfÃ¼gbar.'
    )
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [role,    setRole]    = useState(null)
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
    return React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#94A3B8', fontSize:14, gap:10 } }, 'Laden...')
  if (!session) return React.createElement(Login, null)

  return React.createElement(Layout, { session, role, sub, plan },
    React.createElement(Routes, null,
      React.createElement(Route, { path:'/', element: localStorage.getItem('llr_onboarding_done') ? React.createElement(Dashboard, { session, sub }) : React.createElement(Navigate, { to:'/onboarding', replace:true }) }),
      React.createElement(Route, { path:'/onboarding', element: React.createElement(Onboarding, { session }) }),
      React.createElement(Route, { path:'/dashboard', element: React.createElement(Dashboard, { session, sub }) }),
      React.createElement(Route, { path:'/leads', element: React.createElement(Leads, { session, sub }) }),
      React.createElement(Route, { path:'/comments', element: React.createElement(ComingSoon, { title:'Kommentare' }) }),

      // Pipeline â ab Basic
      React.createElement(Route, { path:'/vernetzungen', element: React.createElement(Vernetzungen, { session }) }),
      React.createElement(Route, { path:'/pipeline',
        element: React.createElement(PlanGate, { allowed: sub && sub.feature_pipeline, requiredPlan:'starter', featureName:'Pipeline' },
          React.createElement(Pipeline, { session })
        )
      }),

      // Brand Voice â ab Basic
      React.createElement(Route, { path:'/brand-voice',
        element: React.createElement(PlanGate, { allowed: sub && sub.feature_brand_voice, requiredPlan:'starter', featureName:'Brand Voice' },
          React.createElement(BrandVoice, { session, sub })
        )
      }),

      // LinkedIn Info (KI) â ab Pro
      React.createElement(Route, { path:'/linkedin-about',
        element: React.createElement(KiGate, { sub },
          React.createElement(LinkedInAbout, { session, sub })
        )
      }),

      // Reports â ab Pro
      React.createElement(Route, { path:'/reports',
        element: React.createElement(PlanGate, { allowed: sub && sub.feature_reports, requiredPlan:'pro', featureName:'Reports' },
          React.createElement(Reports, { session })
        )
      }),

      // Content Studio â ab Pro (KI)
      React.createElement(Route, { path:'/icp',
        element: React.createElement(PlanGate, { allowed: sub && sub.feature_brand_voice, requiredPlan:'starter', featureName:'ICP Profiles' },
          React.createElement(ICP, { session })
        )
      }),
      React.createElement(Route, { path:'/content-studio', element:
        React.createElement(KiGate, { sub },
          React.createElement(ContentStudio, { session, sub })
        )
      }),
      React.createElement(Route, { path:'/settings', element: React.createElement(Settings, { session, sub, plan }) }),
      React.createElement(Route, { path:'/profile',  element: React.createElement(Profile, { session }) }),
      role==='admin' ? React.createElement(Route, { path:'/admin/users', element: React.createElement(AdminUsers, { session }) }) : null,
      role==='admin' ? React.createElement(Route, { path:'/admin/whitelabel', element: React.createElement(WhiteLabel, {}) }) : null,
      React.createElement(Route, { path:'*', element: React.createElement(Navigate, { to:'/', replace:true }) })
    )
  )
}
