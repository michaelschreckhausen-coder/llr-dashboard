import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useSubscription } from './lib/useSubscription'
import Login         from './pages/Login'
import Dashboard     from './pages/Dashboard'
import Leads         from './pages/Leads'
import Settings      from './pages/Settings'
import Billing       from './pages/Billing'
import BrandVoice    from './pages/BrandVoice'
import Zielgruppen      from './pages/Zielgruppen'
import Wissensdatenbank          from './pages/Wissensdatenbank'
import Automatisierung  from './pages/Automatisierung'
import AdminUsers    from './pages/AdminUsers'
import WhiteLabel    from './pages/WhiteLabel'
import Profile       from './pages/Profile'
import Aufgaben      from './pages/Aufgaben'
import IntegrationSettings from './pages/IntegrationSettings'
import Deals         from './pages/Deals'
import DealsContainer from './pages/DealsContainer'
import Organizations from './pages/Organizations'
import OrganizationProfile from './pages/OrganizationProfile'
import Profiltexte      from './pages/Profiltexte'
import LinkedInConnect  from './pages/LinkedInConnect'
import AdminPanel      from './pages/AdminPanel'
import TeamSettings    from './pages/TeamSettings'
import SettingsKonto   from './pages/SettingsKonto'
import Pipeline      from './pages/Pipeline'
import Vernetzungen  from './pages/Vernetzungen'
import Reports       from './pages/Reports'
import ICP           from './pages/ICP'
import ContentStudio      from './pages/ContentStudio'
import Redaktionsplan    from './pages/Redaktionsplan'
import Onboarding      from './pages/Onboarding'
import GettingStarted  from './pages/GettingStarted'
import SSI            from './pages/SSI'
import Messages       from './pages/Messages'
import CrmEnrichment from './pages/CrmEnrichment'
import LeadProfile   from './pages/LeadProfile'
import AdminLogs     from './pages/AdminLogs'
import Projektmanagement from './pages/Projektmanagement'
import ProjektDetail   from './pages/ProjektDetail'
import Zeiterfassung   from './pages/Zeiterfassung'
import Register      from './pages/Register'
import AdminDocs     from './pages/AdminDocs'
import AdminTenants  from './pages/AdminTenants'
import Assistant     from './pages/Assistant'
import Changelog     from './pages/Changelog'
import Layout        from './components/Layout'
import { TenantProvider } from './context/TenantContext'
import { TeamProvider } from './context/TeamContext'
import { AccountProvider } from './context/AccountContext'
import { LanguageProvider } from './context/LanguageContext'
import { ThemeProvider } from './context/ThemeContext'

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
  const [accountStatus, setAccountStatus] = useState('active')
  const { sub, plan, loading: subLoading } = useSubscription(session)

  useEffect(function() {
    supabase.auth.getSession().then(function(res) {
      if (res.error) {
        console.warn('Session error, clearing storage:', res.error.message)
        supabase.auth.signOut()
        setSession(null)
        return
      }
      setSession(res.data.session)
      if (res.data.session) fetchRole()
    })
    var listener = supabase.auth.onAuthStateChange(function(event, s) {
      if (event === 'TOKEN_REFRESHED') return
      setSession(s)
      if (s) fetchRole(); else setRole(null)
    })
    return function() { listener.data.subscription.unsubscribe() }
  }, [])

  async function fetchRole() {
    var result = await supabase.rpc('get_my_role')
    setRole(result.data || 'user')
    // account_status prüfen
    var { data: profile } = await supabase.from('profiles').select('account_status').single()
    if (profile) setAccountStatus(profile.account_status || 'active')
  }

  if (session === undefined) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#94A3B8', fontSize:14, gap:10 }}>Laden...</div>
  }
  if (!session) {
    if (window.location.pathname === '/register') return <Register />
    return <Login />
  }
  // Konto wartet auf Freigabe
  if (accountStatus === 'pending') {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4f8' }}>
        <div style={{ background:'#fff', borderRadius:18, boxShadow:'0 8px 40px rgba(0,0,0,0.1)', width:460, maxWidth:'95vw', padding:'40px 36px', textAlign:'center' }}>
          <div style={{ fontSize:56, marginBottom:16 }}>⏳</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#0F172A', marginBottom:10 }}>Konto wird aktiviert</div>
          <div style={{ fontSize:14, color:'#64748B', lineHeight:1.7, marginBottom:24 }}>
            Dein Konto wurde erfolgreich erstellt und wartet auf Freigabe durch einen Administrator.<br/><br/>
            Du wirst per E-Mail benachrichtigt sobald dein Zugang aktiviert wurde.
          </div>
          <div style={{ background:'#FEF3C7', borderRadius:12, padding:'14px 18px', marginBottom:24, border:'1px solid #FDE68A', fontSize:13, color:'#92400E' }}>
            📧 Bitte kontaktiere deinen Administrator, um die Freischaltung zu beschleunigen.
          </div>
          <button onClick={() => supabase.auth.signOut()} style={{ padding:'10px 24px', borderRadius:999, border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Abmelden
          </button>
        </div>
      </div>
    )
  }

  return (
    <ThemeProvider session={session}>
    <TenantProvider>
    <Routes>
      {/* Onboarding — fullscreen, keine Sidebar */}
      <Route path="/onboarding" element={<Onboarding session={session} />} />

      {/* Alle anderen Routen — mit Sidebar */}
      <Route path="*" element={
        <LanguageProvider userId={session?.user?.id}>
        <TeamProvider session={session}>
        <AccountProvider session={session}>
        <Layout session={session} role={role} sub={sub} plan={plan}>
          <Routes>
            <Route path="/" element={<HomeRoute session={session} sub={sub} />} />
            <Route path="/dashboard" element={<Dashboard session={session} sub={sub} />} />
            <Route path="/getting-started" element={<GettingStarted />} />
                <Route path="/automatisierung" element={<Automatisierung session={session} />} />
                <Route path="/projekte" element={<Projektmanagement session={session} />} />
                <Route path="/projekte/:id" element={<ProjektDetail session={session} />} />
                <Route path="/zeiten" element={<Zeiterfassung session={session} />} />
            <Route path="/ssi" element={<SSI session={session} />} />
            <Route path="/messages" element={<Messages session={session} />} />
            <Route path="/leads" element={<Leads session={session} sub={sub} />} />
            <Route path="/comments" element={<ComingSoon title="Kommentare" />} />
            <Route path="/vernetzungen" element={<Vernetzungen session={session} />} />
            <Route path="/pipeline" element={<Navigate to="/deals?view=pipeline" replace />} />
            <Route path="/brand-voice" element={
              <PlanGate allowed={sub && sub.feature_brand_voice} requiredPlan="starter" featureName="Brand Voice">
                <BrandVoice session={session} sub={sub} />
              </PlanGate>
            } />
            <Route path="/zielgruppen" element={<Zielgruppen session={session} />} />
            <Route path="/wissensdatenbank" element={<Wissensdatenbank session={session} />} />
            <Route path="/linkedin-connect" element={<LinkedInConnect session={session}/>}/>
              <Route path="/admin" element={<AdminPanel session={session} />} />
              <Route path="/settings/team" element={<TeamSettings session={session} />} />
            <Route path="/profiltexte" element={
              <KiGate sub={sub}>
                <Profiltexte session={session} />
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
            <Route path="/redaktionsplan" element={<Redaktionsplan session={session} />} />
            <Route path="/content-studio" element={
              <KiGate sub={sub}>
                <ContentStudio session={session} sub={sub} />
              </KiGate>
            } />
            <Route path="/settings" element={<Navigate to="/settings/profil" replace />} />
            <Route path="/settings/profil" element={<Settings session={session} sub={sub} plan={plan} />} />
            <Route path="/settings/konto" element={<SettingsKonto />} />
              <Route path="/billing" element={<Billing />} />
            <Route path="/profile"  element={<Profile session={session} />} />
            <Route path="/aufgaben" element={<Aufgaben session={session} />} />
            <Route path="/integrations" element={<IntegrationSettings session={session} />} />
            <Route path="/deals"    element={<DealsContainer session={session} />} />
            <Route path="/organizations"     element={<Organizations session={session} />} />
            <Route path="/organizations/:id" element={<OrganizationProfile session={session} />} />
            {<Route path="/admin/users"      element={role === 'admin' ? <AdminUsers session={session} /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} />}
            {<Route path="/admin/whitelabel" element={role === 'admin' ? <WhiteLabel /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} />}
            {<Route path="/admin/tenants"    element={role === 'admin' ? <AdminTenants session={session} /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} />}
            <Route path="/assistant" element={<Assistant session={session} />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/admin-docs" element={role === 'admin' ? <AdminDocs /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} />
            <Route path="/admin-logs" element={role === 'admin' ? <AdminLogs /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} />
            <Route path="/crm-enrichment" element={<CrmEnrichment session={session} />} />
            <Route path="/leads/:id"      element={<LeadProfile session={session} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
        </AccountProvider>
        </TeamProvider>
        </LanguageProvider>
      } />
    </Routes>
  </TenantProvider>
  </ThemeProvider>
  )
}
