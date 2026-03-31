import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useSubscription } from './lib/useSubscription'
import Login         from './pages/Login'
import Dashboard     from './pages/Dashboard'
import Leads         from './pages/Leads'
import Settings      from './pages/Settings'
import BrandVoice    from './pages/BrandVoice'
import AdminUsers    from './pages/AdminUsers'
import WhiteLabel    from './pages/WhiteLabel'
import Profile       from './pages/Profile'
import LinkedInAbout    from './pages/LinkedInAbout'
import LinkedInConnect  from './pages/LinkedInConnect'
import Pipeline      from './pages/Pipeline'
import Vernetzungen  from './pages/Vernetzungen'
import Reports       from './pages/Reports'
import ICP           from './pages/ICP'
import ContentStudio from './pages/ContentStudio'
import Onboarding      from './pages/Onboarding'
import GettingStarted  from './pages/GettingStarted'
import SSI            from './pages/SSI'
import Messages       from './pages/Messages'
import Layout        from './components/Layout'

function PlanGate({ allowed, requiredPlan, featureName, children }) {
  if (allowed) return children
  const planLabels = { starter:'LinkedIn Suite Basic', pro:'LinkedIn Suite Pro', enterprise:'Enterprise' }
  const color = { starter:'#0A66C2', pro:'#8B5CF6', enterprise:'#F59E0B' }[requiredPlan] || '#0A66C2'
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:16, textAlign:'center', padding:32 }}>
      <div style={{ fontSize:56 }}>🔒</div>
      <div style={{ fontSize:22, fontWeight:800, color:'#0F172A', marginBottom:4 }}>{featureName} nicht verfügbar</div>
      <div style={{ fontSize:14, color:'#64748B', maxWidth:420, lineHeight:1.65 }}>
        Dieses Feature ist ab dem {planLabels[requiredPlan]||requiredPlan} verfügbar.
      </div>
      <div style={{ display:'flex', gap:12, marginTop:8, flexWrap:'wrap', justifyContent:'center' }}>
        <a href="/settings" style={{ padding:'10px 24px', borderRadius:999, background:'linear-gradient(135deg,'+color+','+color+'CC)', color:'#fff', fontSize:14, fontWeight:700, textDecoration:'none' }}>
          🚀 Jetzt upgraden
        </a>
        <a href="/settings" style={{ padding:'10px 24px', borderRadius:999, border:'1px solid #E2E8F0', background:'#fff', color:'#64748B', fontSize:14, fontWeight:600, textDecoration:'none' }}>
          Pläne vergleichen
        </a>
      </div>
    </div>
  )
}

function KiGate({ sub, children }) {
  return <PlanGate allowed={sub && sub.ai_access} requiredPlan="pro" featureName="KI-Features">{children}</PlanGate>
}

function ComingSoon({ title }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:16, textAlign:'center', padding:24 }}>
      <div style={{ fontSize:48 }}>🚧</div>
      <div style={{ fontSize:22, fontWeight:800, color:'#0F172A', marginBottom:4 }}>{title} — Demnächst verfügbar</div>
      <div style={{ fontSize:14, color:'#64748B', maxWidth:380, lineHeight:1.6 }}>
        Diese Funktion wird gerade entwickelt und ist bald verfügbar.
      </div>
    </div>
  )
}

function HomeRoute({ session, sub }) {
  const done = localStorage.getItem('llr_onboarding_done')
  if (!done) return <Navigate to="/onboarding" replace />
  return <Dashboard session={session} sub={sub} />
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

  if (session === undefined || subLoading) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#94A3B8', fontSize:14, gap:10 }}>Laden...</div>
  }
  if (!session) return <Login />

  return (
    <Routes>
      {/* Onboarding — fullscreen, keine Sidebar */}
      <Route path="/onboarding" element={<Onboarding session={session} />} />

      {/* Alle anderen Routen — mit Sidebar */}
      <Route path="*" element={
        <Layout session={session} role={role} sub={sub} plan={plan}>
          <Routes>
            <Route path="/" element={<HomeRoute session={session} sub={sub} />} />
            <Route path="/dashboard" element={<Dashboard session={session} sub={sub} />} />
            <Route path="/getting-started" element={<GettingStarted />} />
            <Route path="/ssi" element={<SSI session={session} />} />
            <Route path="/messages" element={<Messages session={session} />} />
            <Route path="/leads" element={<Leads session={session} sub={sub} />} />
            <Route path="/comments" element={<ComingSoon title="Kommentare" />} />
            <Route path="/vernetzungen" element={<Vernetzungen session={session} />} />
            <Route path="/pipeline" element={
              <PlanGate allowed={sub && sub.feature_pipeline} requiredPlan="starter" featureName="Pipeline">
                <Pipeline session={session} />
              </PlanGate>
            } />
            <Route path="/brand-voice" element={
              <PlanGate allowed={sub && sub.feature_brand_voice} requiredPlan="starter" featureName="Brand Voice">
                <BrandVoice session={session} sub={sub} />
              </PlanGate>
            } />
            <Route path="/linkedin-connect" element={<LinkedInConnect session={session}/>}/>
              <Route path="/linkedin-about" element={
              <KiGate sub={sub}>
                <LinkedInAbout session={session} sub={sub} />
              </KiGate>
            } />
            <Route path="/reports" element={
              <PlanGate allowed={sub && sub.feature_reports} requiredPlan="pro" featureName="Reports">
                <Reports session={session} />
              </PlanGate>
            } />
            <Route path="/icp" element={
              <PlanGate allowed={sub && sub.feature_brand_voice} requiredPlan="starter" featureName="ICP Profiles">
                <ICP session={session} />
              </PlanGate>
            } />
            <Route path="/content-studio" element={
              <KiGate sub={sub}>
                <ContentStudio session={session} sub={sub} />
              </KiGate>
            } />
            <Route path="/settings" element={<Settings session={session} sub={sub} plan={plan} />} />
            <Route path="/profile"  element={<Profile session={session} />} />
            {role === 'admin' && <Route path="/admin/users"      element={<AdminUsers session={session} />} />}
            {role === 'admin' && <Route path="/admin/whitelabel" element={<WhiteLabel />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}
