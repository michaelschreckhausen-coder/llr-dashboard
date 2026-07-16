import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { NavigationTimer } from './lib/useTabPersistedState'
import { supabase, IS_SUPPORT_TAB } from './lib/supabase'
import { decodeJwt, clearImpersonationSession } from './lib/impersonation'
import { captureRefFromUrl } from './lib/affiliateTracking'
import Login         from './pages/Login'
import MfaChallenge  from './components/MfaChallenge'
import SupportSession from './pages/SupportSession'
import ImpersonationBanner from './components/ImpersonationBanner'
import LinkedInCallback from './pages/auth/LinkedInCallback'
import Unsubscribe   from './pages/Unsubscribe'
import SettingsNotifications from './pages/SettingsNotifications'
import Dashboard     from './pages/Dashboard'
import Leads         from './pages/Leads'
import LeadDetail    from './pages/LeadDetail'
import LeadProfile   from './pages/LeadProfile'
import LeadsImports  from './pages/LeadsImports'
import { isFlagEnabled } from './lib/featureFlags' // installs window.__lk_features proxy + flag API
import Settings      from './pages/Settings'
import BrandVoice    from './pages/BrandVoice'
import Zielgruppen      from './pages/Zielgruppen'
import Strike2Personas  from './pages/Strike2Personas'
import Strike2PersonaWizard from './pages/Strike2PersonaWizard'
import Strike2PersonaIdeas from './pages/Strike2PersonaIdeas'
import Wissensdatenbank          from './pages/Wissensdatenbank'
import BrandMemory             from './pages/BrandMemory'
import Automatisierung  from './pages/Automatisierung'
import AdminUsers    from './pages/AdminUsers'
import WhiteLabel    from './pages/WhiteLabel'
import Aufgaben      from './pages/Aufgaben'
import IntegrationSettings from './pages/IntegrationSettings'
import AsanaCallback from './pages/auth/AsanaCallback'
import Marketplace from './pages/Marketplace'
import Deals         from './pages/Deals'
import DealsContainer from './pages/DealsContainer'
import DealDetail     from './pages/DealDetail'
import Organizations from './pages/Organizations'
import OrganizationProfile from './pages/OrganizationProfile'
import Profiltexte      from './pages/Profiltexte'
import Auralis          from './pages/Auralis'
import LinkedInConnect  from './pages/LinkedInConnect'
import AdminPanel      from './pages/AdminPanel'
import TeamSettings    from './pages/TeamSettings'
import SettingsKonto   from './pages/SettingsKonto'
import SettingsLinkedIn from './pages/SettingsLinkedIn'
import { BrandVoiceProvider } from './context/BrandVoiceContext'
import SettingsMemory  from './pages/SettingsMemory'
import SettingsExtension from './pages/SettingsExtension'
import SettingsAffiliate from './pages/SettingsAffiliate'
import SettingsInstagram from './pages/SettingsInstagram'
import Instagram         from './pages/Instagram'
import Pipeline      from './pages/Pipeline'
import Vernetzungen  from './pages/Vernetzungen'
import ProfilChecker from './pages/ProfilChecker'
import LinkedInInbox from './pages/LinkedInInbox'
import LinkedInNetzwerk from './pages/LinkedInNetzwerk'
import LinkedInAutomationNeu from './pages/LinkedInAutomationNeu'
import LinkedInSuche from './pages/LinkedInSuche'
import LinkedInAnalytics from './pages/LinkedInAnalytics'
import LinkedInEngagement from './pages/LinkedInEngagement'
import Reports       from './pages/Reports'
import ICP           from './pages/ICP'
import ContentStudio      from './pages/ContentStudio'
import Visuals            from './pages/Visuals'
import Media              from './pages/Media'
import Bibliothek         from './pages/Bibliothek'
import Redaktionsplan    from './pages/Redaktionsplan'
import GettingStarted  from './pages/GettingStarted'
import Documents      from './pages/Documents'
import SSI            from './pages/SSI'
import Messages       from './pages/Messages'
import CompanyBrandGate from './components/CompanyBrandGate'
import AdminLogs     from './pages/AdminLogs'
import Projektmanagement from './pages/Projektmanagement'
import ProjektDetail   from './pages/ProjektDetail'
import Zeiterfassung   from './pages/Zeiterfassung'
import Register      from './pages/Register'
import AdminDocs     from './pages/AdminDocs'
import AdminTenants  from './pages/AdminTenants'
import AdminPlans    from './pages/AdminPlans'
import Changelog     from './pages/Changelog'
import SponsoringHome from './pages/sponsoring/SponsoringHome'
import Rechte         from './pages/sponsoring/Rechte'
import Pakete         from './pages/sponsoring/Pakete'
import Angebote       from './pages/sponsoring/Angebote'
import Vertraege      from './pages/sponsoring/Vertraege'
import Aktivierung    from './pages/sponsoring/Aktivierung'
import Hospitality    from './pages/sponsoring/Hospitality'
import SpReporting    from './pages/sponsoring/Reporting'        // Alias: 'Reports' ist belegt
import Signale        from './pages/sponsoring/Signale'
import Sichtbarkeit   from './pages/sponsoring/Sichtbarkeit'
import SponsorSuccess from './pages/sponsoring/SponsorSuccess'
import SpAssistent    from './pages/sponsoring/Assistent'        // Alias: 'Assistant' ist belegt
import LinkedInImport from './pages/sponsoring/LinkedInImport'
import Ligen          from './pages/sponsoring/Ligen'
import Kampagnen      from './pages/sponsoring/Kampagnen'
import Branchenanalyse from './pages/sponsoring/Branchenanalyse'
import MockupStudio   from './pages/sponsoring/MockupStudio'
import Ziele          from './pages/sponsoring/Ziele'
import Layout        from './components/Layout'
import ModuleGuard   from './components/ModuleGuard'
import PermissionGuard from './components/PermissionGuard'
import LinkedInSyncModal from './components/LinkedInSyncModal'
import { TenantProvider } from './context/TenantContext'
import { TeamProvider } from './context/TeamContext'
import { AccountProvider } from './context/AccountContext'
import { LanguageProvider } from './context/LanguageContext'
import { EntitlementsProvider } from './context/EntitlementsContext'
import { ModelProvider } from './context/ModelContext'
import { ThemeProvider } from './context/ThemeContext'

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

function BillingRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/settings/konto${search}`} replace />
}

function HomeRoute({ session }) {
  return <Dashboard session={session} />
}

// PR 5 Cutover-Übergang: preserved /leads-v2/:id Bookmarks redirecten
// auf /leads/:id (id-preserving). Entfernen in PR 6 nach 7d Prod-Smoke.
function LeadV2DetailRedirect() {
  const { id } = useParams()
  return <Navigate to={`/leads/${id}`} replace />
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [role,    setRole]    = useState(null)
  const [accountStatus, setAccountStatus] = useState('active')
  // 2FA-Gate: true wenn Session da, aber Assurance-Level erst aal1 und ein
  // verifizierter TOTP-Factor existiert (nextLevel === 'aal2').
  const [mfaRequired, setMfaRequired] = useState(false)
  // LinkedIn-Profile-Sync Phase 1: { diff, oidc, firstSync } | null
  const [liSync,  setLiSync]  = useState(null)

  // Affiliate-Tracking (Phase 2): ?ref-Capture einmal beim Mount, route-unabhängig.
  // Best-effort, blockiert nie (captureRefFromUrl ist try/catch-gekapselt).
  useEffect(() => { captureRefFromUrl() }, [])
  // useLocation bindet App.jsx an react-router-State → re-rendert bei Link-Navigation.
  // Vorher: window.location.pathname-Check unten greift nicht, weil App nicht re-rendert
  // → /register-Link mountete <Login /> bis manueller Reload (Bug entdeckt 2026-05-17).
  const location = useLocation()

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
      if (IS_SUPPORT_TAB) { try { console.debug('[imp] onAuthStateChange · ' + event + ' · has_session=' + !!s + ' · is_imp=' + (!!decodeJwt(s?.access_token || '')?.app_metadata?.is_impersonation)) } catch { /* noop */ } }
      if (event === 'TOKEN_REFRESHED') return
      setSession(s)
      if (s) fetchRole(); else setRole(null)
    })
    return function() { listener.data.subscription.unsubscribe() }
  }, [])

  // 2FA-Assurance-Level prüfen, sobald sich die Session ändert.
  // Degradiert sicher: wirft die API (z.B. MFA serverseitig aus) → kein Gate.
  useEffect(function() {
    if (!session) { setMfaRequired(false); return }
    // BEWUSSTER MFA-Bypass NUR bei Impersonation: die Support-Session (is_impersonation-Claim) ist serverseitig
    // via Staff-Auth + Grund + Audit autorisiert; ein Kunden-TOTP-Challenge ist für Support strukturell unmöglich
    // (Support kennt den Kunden-Authenticator nicht). Greift ausschließlich bei is_impersonation===true →
    // schwächt MFA für echte Kunden-Logins NICHT.
    var impClaims = decodeJwt(session.access_token || '')
    if (impClaims && impClaims.app_metadata && impClaims.app_metadata.is_impersonation === true) { setMfaRequired(false); return }
    var cancelled = false
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(function(res) {
      if (cancelled) return
      var d = res && res.data
      setMfaRequired(!!d && d.currentLevel === 'aal1' && d.nextLevel === 'aal2')
    }).catch(function() { if (!cancelled) setMfaRequired(false) })
    return function() { cancelled = true }
  }, [session])

  async function recheckMfa() {
    try {
      var res = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      var d = res && res.data
      setMfaRequired(!(d && d.currentLevel === 'aal2'))
    } catch (e) { setMfaRequired(false) }
  }

  async function fetchRole() {
    // Phase 5A: get_my_role removed, all /admin routes deactivated.
    // Migration to admin.leadesk.de in progress.
    // See docs/architecture/PHASE_5_DISCOVERY.md / PHASE_5_DECISIONS.md
    // var result = await supabase.rpc('get_my_role')
    // setRole(result.data || 'user')
    setRole('user')
    // account_status prüfen
    var { data: profile } = await supabase.from('profiles').select('account_status').single()
    if (profile) setAccountStatus(profile.account_status || 'active')
  }

  // LinkedIn-Profile-Sync Phase 1: bei jedem Session-Wechsel (Login, ggf. App-Mount mit
  // bestehender Session) check'en ob das LinkedIn-Profil neue Daten hat.
  // Edge-Function macht selbst das Throttling per Hash-Vergleich, daher kein
  // Time-Throttle nötig. Wenn linkedin_oidc-Identity nicht verlinkt → no-op silent.
  useEffect(function() {
    if (!session?.user?.id) { setLiSync(null); return; }
    ;(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('sync-linkedin-profile', {
          body: { action: 'check' },
        })
        if (error) {
          console.warn('[linkedin-sync] check failed:', error.message)
          return
        }
        if (!data?.hasChanges) return
        setLiSync({ diff: data.diff || [], oidc: data.oidc || null, firstSync: !!data.firstSync })
      } catch (e) {
        console.warn('[linkedin-sync] check exception:', e?.message)
      }
    })()
  }, [session?.user?.id])

  async function applyLiSync(selectedFields, oidc) {
    try {
      const { error } = await supabase.functions.invoke('sync-linkedin-profile', {
        body: { action: 'apply', fields: selectedFields, oidc },
      })
      if (error) console.error('[linkedin-sync] apply failed:', error.message)
    } finally {
      setLiSync(null)
      // Layout + Settings horchen auf dieses Event und re-fetchen avatar_url etc.
      // Layout horcht historisch auf snake_case 'leadesk_profile_updated' — beide feuern
      // damit alle Consumer aktualisiert werden.
      window.dispatchEvent(new CustomEvent('leadesk:profile-updated'))
      window.dispatchEvent(new CustomEvent('leadesk_profile_updated'))
    }
  }

  function dismissLiSync() {
    // Trotz dismiss: linkedin_data_raw + last_synced_at mit aktuellem OIDC-Snapshot
    // schreiben → nächster check ist no-op solange LinkedIn-Daten gleich bleiben.
    // Ohne dismiss-Apply käme das Modal sonst beim nächsten Login wieder.
    if (liSync?.oidc) {
      supabase.functions.invoke('sync-linkedin-profile', {
        body: { action: 'apply', fields: [], oidc: liSync.oidc },
      }).catch(() => {})
    }
    setLiSync(null)
  }

  // Sprint L.9 — Public Unsubscribe-Page muss VOR Auth-Gate erreichbar sein
  // (User klickt Footer-Link in lifecycle/marketing-Mail ohne eingeloggt zu sein).
  if (location.pathname === '/unsubscribe') {
    return <Unsubscribe />
  }

  if (session === undefined) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#94A3B8', fontSize:14, gap:10 }}>Laden...</div>
  }
  if (!session) {
    // Support-Impersonation-Handoff: setzt selbst die (isolierte) Kundensession, muss also ohne Session rendern.
    if (location.pathname === '/support-session') return <SupportSession />
    if (location.pathname === '/register') return <Register />
    return <Login />
  }
  // FAIL-CLOSED Support-Tab-Guard: der Support-Tab darf AUSSCHLIESSLICH eine Impersonation-Session halten.
  // Falls hier (trotz sessionStorage-Isolation) je eine Nicht-Impersonation-Session landet (eigene/fremde),
  // NIEMALS das Konto ohne Banner rendern → Slot räumen, lokal ausloggen, klaren Hinweis zeigen.
  if (IS_SUPPORT_TAB && !decodeJwt(session.access_token || '')?.app_metadata?.is_impersonation) {
    try { console.debug('[imp] fail-closed guard FIRED · session ohne is_impersonation → Slot räumen + logout') } catch { /* noop */ }
    clearImpersonationSession()
    supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12, fontFamily:'system-ui', padding:24, textAlign:'center' }}>
        <div style={{ fontSize:40 }}>🛟</div>
        <div style={{ fontWeight:700, color:'#0F172A' }}>Support-Session ungültig oder beendet</div>
        <div style={{ color:'#64748B', fontSize:14, maxWidth:420 }}>Dieser Support-Tab hält keine gültige Impersonation-Session. Bitte den Support-Modus erneut aus der Admin-App starten.</div>
      </div>
    )
  }
  // 2FA-Gate: Session existiert, aber Schritt 2 (TOTP-Code) steht noch aus.
  if (mfaRequired) {
    return <MfaChallenge onVerified={recheckMfa} />
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
    <NavigationTimer />
    <ImpersonationBanner session={session} />
    <Routes>
      {/* Onboarding — fullscreen, keine Sidebar */}
      <Route path="/onboarding" element={<Navigate to="/dashboard" replace />} />

      {/* LinkedIn OAuth-Callback — fullscreen, keine Sidebar */}
      <Route path="/auth/linkedin/callback" element={<LinkedInCallback />} />

      {/* Alle anderen Routen — mit Sidebar */}
      <Route path="*" element={
        <LanguageProvider userId={session?.user?.id}>
        <TeamProvider session={session}>
      <BrandVoiceProvider session={session}>
        <AccountProvider session={session}>
        <EntitlementsProvider session={session}>
        <ModelProvider session={session}>
        <Layout session={session} role={role}>
          <PermissionGuard>
          <Routes>
            <Route path="/" element={<HomeRoute session={session} />} />
            <Route path="/dashboard" element={<Dashboard session={session} />} />
            <Route path="/getting-started" element={<GettingStarted />} />
            <Route path="/dokumente" element={<Documents />} />
                <Route path="/automatisierung" element={<Automatisierung session={session} />} />
                <Route path="/projekte" element={<Projektmanagement session={session} />} />
                <Route path="/projekte/:id" element={<ProjektDetail session={session} />} />
                <Route path="/zeiten" element={<Zeiterfassung session={session} />} />
            <Route path="/ssi" element={<CompanyBrandGate feature="ssi"><SSI session={session} /></CompanyBrandGate>} />
            <Route path="/messages" element={<CompanyBrandGate feature="nachrichten"><Messages session={session} /></CompanyBrandGate>} />
            <Route path="/leads" element={<Leads session={session} />} />
            <Route path="/leads-v2" element={<Navigate to="/leads" replace />} />
            <Route path="/leads-v2/:id" element={<LeadV2DetailRedirect />} />
            <Route path="/comments" element={<ComingSoon title="Kommentare" />} />
            <Route path="/vernetzungen" element={<CompanyBrandGate feature="vernetzungen"><Vernetzungen session={session} /></CompanyBrandGate>} />
            <Route path="/profil-checker" element={<ModuleGuard module="linkedin"><ProfilChecker session={session} /></ModuleGuard>} />
            <Route path="/linkedin-inbox" element={<ModuleGuard module="linkedin"><LinkedInInbox session={session} /></ModuleGuard>} />
            <Route path="/linkedin-netzwerk" element={<ModuleGuard module="linkedin"><LinkedInNetzwerk session={session} /></ModuleGuard>} />
            <Route path="/linkedin-suche" element={<ModuleGuard module="linkedin"><LinkedInSuche session={session} /></ModuleGuard>} />
            <Route path="/linkedin-analytics" element={<ModuleGuard module="linkedin"><LinkedInAnalytics session={session} /></ModuleGuard>} />
            <Route path="/linkedin-engagement" element={<ModuleGuard module="linkedin"><LinkedInEngagement session={session} /></ModuleGuard>} />
            {/* 3c-Flip: V2 (la_*) ist Default für alle. Not-Aus per User: localStorage lk_features.linkedinAutomationV2Disabled=true */}
            {(!isFlagEnabled('linkedinAutomationV2Disabled')) && (
              <Route path="/automatisierung-neu" element={<ModuleGuard module="linkedin"><LinkedInAutomationNeu session={session} /></ModuleGuard>} />
            )}
            <Route path="/pipeline" element={<Navigate to="/deals?view=pipeline" replace />} />
            <Route path="/brand-voice" element={<Navigate to="/personal-brand" replace />} />
            <Route path="/personal-brand" element={
              <ModuleGuard module="branding">
                <BrandVoice session={session} brandType="personal" />
              </ModuleGuard>
            } />
            <Route path="/company-brand" element={
              <ModuleGuard module="branding">
                <BrandVoice session={session} brandType="company_page" />
              </ModuleGuard>
            } />
            <Route path="/zielgruppen" element={<Zielgruppen session={session} />} />
            <Route path="/branding/strike2-personas" element={<Strike2Personas session={session} />} />
            <Route path="/branding/strike2-personas/:id/ideen" element={<Strike2PersonaIdeas session={session} />} />
            <Route path="/branding/strike2-personas/:id" element={<Strike2PersonaWizard session={session} />} />
            <Route path="/wissensdatenbank" element={<Wissensdatenbank session={session} />} />
            <Route path="/brand-memory" element={<BrandMemory session={session} />} />
            <Route path="/ki-sichtbarkeit" element={
              <ModuleGuard module="branding">
                <Auralis session={session} />
              </ModuleGuard>
            } />
            <Route path="/linkedin-connect" element={<LinkedInConnect session={session}/>}/>
              {/* Phase 5A: Admin route disabled — migration to admin.leadesk.de. See docs/architecture/PHASE_5_*.md */}
              {/* <Route path="/admin" element={<AdminPanel session={session} />} /> */}
              <Route path="/settings/team" element={<TeamSettings session={session} />} />
            <Route path="/profiltexte" element={
              <ModuleGuard module="linkedin">
                <Profiltexte session={session} />
              </ModuleGuard>
            } />
            <Route path="/reports" element={
              <ModuleGuard module="reports">
                <Reports session={session} />
              </ModuleGuard>
            } />
            <Route path="/icp" element={
              <ModuleGuard module="branding">
                <ICP session={session} />
              </ModuleGuard>
            } />
            <Route path="/redaktionsplan" element={<Redaktionsplan session={session} />} />
            <Route path="/visuals" element={
              <ModuleGuard module="content">
                <Visuals session={session} />
              </ModuleGuard>
            } />
            <Route path="/content-studio" element={
              <ModuleGuard module="content">
                <ContentStudio session={session} />
              </ModuleGuard>
            } />
            <Route path="/media" element={
              <ModuleGuard module="content">
                <Media session={session} />
              </ModuleGuard>
            } />
            <Route path="/bibliothek" element={
              <ModuleGuard module="content">
                <Bibliothek session={session} />
              </ModuleGuard>
            } />
            <Route path="/settings" element={<Navigate to="/settings/profil" replace />} />
            <Route path="/settings/profil" element={<Settings session={session} />} />
            <Route path="/settings/linkedin" element={<SettingsLinkedIn session={session} />} />
            <Route path="/settings/konto" element={<SettingsKonto session={session} />} />
            <Route path="/settings/memory" element={<SettingsMemory session={session} />} />
            <Route path="/settings/extension" element={<SettingsExtension session={session} />} />
            <Route path="/settings/notifications" element={<SettingsNotifications session={session} />} />
            <Route path="/settings/affiliate" element={<SettingsAffiliate session={session} />} />
            <Route path="/settings/instagram" element={<SettingsInstagram session={session} />} />
              <Route path="/billing" element={<BillingRedirect />} />
            {/* /profile in /settings/profil integriert (Dopplungen entfernt) — Redirect für Alt-Links/Bookmarks */}
            <Route path="/profile"  element={<Navigate to="/settings/profil" replace />} />
            <Route path="/aufgaben" element={<Aufgaben session={session} />} />
            <Route path="/integrations" element={<IntegrationSettings session={session} />} />
            <Route path="/integrations/asana/callback" element={<AsanaCallback />} />
            <Route path="/marketplace"  element={<Marketplace />} />
            <Route path="/deals"    element={<DealsContainer session={session} />} />
            <Route path="/deals/:id" element={<DealDetail session={session} />} />
            <Route path="/organizations"     element={<Organizations session={session} />} />
            <Route path="/organizations/:id" element={<OrganizationProfile session={session} />} />
            {/* Phase 5A: Admin routes disabled — migration to admin.leadesk.de. See docs/architecture/PHASE_5_*.md */}
            {/* <Route path="/admin/users"      element={role === 'admin' ? <AdminUsers session={session} /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} /> */}
            {/* <Route path="/admin/whitelabel" element={role === 'admin' ? <WhiteLabel /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} /> */}
            {/* <Route path="/admin/tenants"    element={role === 'admin' ? <AdminTenants session={session} /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} /> */}
            {/* <Route path="/admin/plans"      element={role === 'admin' ? <AdminPlans /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} /> */}
            {/* Assistent-Seite retired (Phase 1) — Leadly-Bubble ist die Assistenz-Surface. */}
            <Route path="/assistant" element={<Navigate to="/dashboard" replace />} />
            <Route path="/changelog" element={<Changelog />} />
            {/* Phase 5A: Admin routes disabled — migration to admin.leadesk.de. See docs/architecture/PHASE_5_*.md */}
            {/* <Route path="/admin-docs" element={role === 'admin' ? <AdminDocs /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} /> */}
            {/* <Route path="/admin-logs" element={role === 'admin' ? <AdminLogs /> : role === null ? <div style={{padding:48,textAlign:'center',color:'#94A3B8'}}>Lädt…</div> : <Navigate to="/" replace />} /> */}
            <Route path="/leads/new"      element={<LeadProfile session={session} />} />
            <Route path="/leads/imports"  element={<LeadsImports session={session} />} />
            <Route path="/leads/:id"      element={<LeadDetail session={session} />} />

            {/* Instagram — Addon-Modul, gated über account_addons → modules[]='instagram' */}
            <Route path="/instagram" element={<ModuleGuard module="instagram"><Instagram /></ModuleGuard>} />

            {/* Sponsoring OS — Addon-Modul, gated über account_addons → modules[]='sponsoring' */}
            <Route path="/sponsoring"               element={<ModuleGuard module="sponsoring"><SponsoringHome /></ModuleGuard>} />
            {/* „Sponsoren" lebt jetzt als Sicht im CRM-Unternehmen — Redirect für alte Bookmarks */}
            <Route path="/sponsoring/sponsoren"     element={<Navigate to="/organizations?view=sponsoren" replace />} />
            <Route path="/sponsoring/rechte"        element={<ModuleGuard module="sponsoring"><Rechte /></ModuleGuard>} />
            <Route path="/sponsoring/pakete"        element={<ModuleGuard module="sponsoring"><Pakete /></ModuleGuard>} />
            <Route path="/sponsoring/angebote"      element={<ModuleGuard module="sponsoring"><Angebote /></ModuleGuard>} />
            <Route path="/sponsoring/vertraege"     element={<ModuleGuard module="sponsoring"><Vertraege /></ModuleGuard>} />
            <Route path="/sponsoring/aktivierung"   element={<ModuleGuard module="sponsoring"><Aktivierung /></ModuleGuard>} />
            <Route path="/sponsoring/hospitality"   element={<ModuleGuard module="sponsoring"><Hospitality /></ModuleGuard>} />
            <Route path="/sponsoring/reporting"     element={<ModuleGuard module="sponsoring"><SpReporting /></ModuleGuard>} />
            <Route path="/sponsoring/signale"       element={<ModuleGuard module="sponsoring"><Signale /></ModuleGuard>} />
            <Route path="/sponsoring/sichtbarkeit"  element={<ModuleGuard module="sponsoring"><Sichtbarkeit /></ModuleGuard>} />
            <Route path="/sponsoring/success"       element={<ModuleGuard module="sponsoring"><SponsorSuccess /></ModuleGuard>} />
            <Route path="/sponsoring/assistent"     element={<ModuleGuard module="sponsoring"><SpAssistent /></ModuleGuard>} />
            <Route path="/sponsoring/linkedin-import" element={<ModuleGuard module="sponsoring"><LinkedInImport /></ModuleGuard>} />
            <Route path="/sponsoring/ligen"          element={<ModuleGuard module="sponsoring"><Ligen /></ModuleGuard>} />
            <Route path="/sponsoring/kampagnen"      element={<ModuleGuard module="sponsoring"><Kampagnen /></ModuleGuard>} />
            <Route path="/sponsoring/branchenanalyse" element={<ModuleGuard module="sponsoring"><Branchenanalyse /></ModuleGuard>} />
            <Route path="/sponsoring/mockup"         element={<ModuleGuard module="sponsoring"><MockupStudio /></ModuleGuard>} />
            <Route path="/sponsoring/ziele"          element={<ModuleGuard module="sponsoring"><Ziele /></ModuleGuard>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </PermissionGuard>
        </Layout>
        </ModelProvider>
        </EntitlementsProvider>
        </AccountProvider>
        </BrandVoiceProvider>
      </TeamProvider>
        </LanguageProvider>
      } />
    </Routes>
  </TenantProvider>
  {liSync && (
    <LinkedInSyncModal
      diff={liSync.diff}
      oidc={liSync.oidc}
      firstSync={liSync.firstSync}
      onConfirm={applyLiSync}
      onDismiss={dismissLiSync}
    />
  )}
  </ThemeProvider>
  )
}
