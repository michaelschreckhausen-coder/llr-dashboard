import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useResponsive } from '../hooks/useResponsive'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import BrandVoiceSwitcher from './BrandVoiceSwitcher'
import ContentIntroModal from './ContentIntroModal'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { HelpCircle } from 'lucide-react'
import BrainButton from './BrainButton'
import { useModel } from '../context/ModelContext'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { useTeam } from '../context/TeamContext'
import { setSentryUser } from '../lib/sentry'
import TeamSwitcher from './TeamSwitcher'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'
import TrialBanner from './TrialBanner'
import TimerBar from './delivery/TimerBar'
import LeadlyBubble from './leadly/LeadlyBubble'
import CreditsBar from './credits/CreditsBar'
import CreditsBanner from './credits/CreditsBanner'
import CreditsExhaustedModal from './credits/CreditsExhaustedModal'
import { detectLeadeskExtension, EXTENSION_WEBSTORE_URL } from '../lib/leadeskExtension'
import { useOnboarding } from '../hooks/useOnboarding'
import { tipForRoute, AREA_TOURS, areaForRoute } from '../lib/onboardingSteps'
import TourGuide from './onboarding/TourGuide'
import AreaTourGuide from './onboarding/AreaTourGuide'
import AreaTip from './onboarding/AreaTip'

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
function IcClock()    { return <SvgIcon><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></SvgIcon> }
function IcHome()     { return <SvgIcon><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></SvgIcon> }
function IcUsers()    { return <SvgIcon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></SvgIcon> }
function IcHeart()    { return <SvgIcon><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></SvgIcon> }
function IcInbox()    { return <SvgIcon><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></SvgIcon> }
function IcGrid()     { return <SvgIcon><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></SvgIcon> }
function IcBarChart() { return <SvgIcon><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></SvgIcon> }
function IcStar()     { return <SvgIcon><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></SvgIcon> }
function IcImage()    { return <SvgIcon><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></SvgIcon> }
function IcInstagram(){ return <SvgIcon><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></SvgIcon> }
function IcDoc()      { return <SvgIcon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></SvgIcon> }
function IcMail()     { return <SvgIcon><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></SvgIcon> }
function IcChat()     { return <SvgIcon><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></SvgIcon> }
function IcCalPen()   { return <SvgIcon><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></SvgIcon> }
function IcMic()      { return <SvgIcon><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></SvgIcon> }
function IcPersonBrand() { return <SvgIcon><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></SvgIcon> }
function IcCompanyBrand() { return <SvgIcon><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><path d="M10 22v-4h4v4"/></SvgIcon> }
function IcLinkedIn() { return <SvgIcon><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></SvgIcon> }
function IcBell()     { return <SvgIcon><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></SvgIcon> }
function IcPuzzle()   { return <SvgIcon><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 2.002c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/></SvgIcon> }
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
function IcSparkles() { return <SvgIcon><path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></SvgIcon> }
import { useEntitlements } from '../hooks/useEntitlements'
import { useAddons } from '../hooks/useAddons'
import { useTagRegistrySync } from '../hooks/useTagRegistry'
import { SIDEBAR_DIVIDER_TO_MODULE } from '../lib/modules'
import { getRequiredPermission } from '../lib/routePermissions'
import { isFlagEnabled } from '../lib/featureFlags'

function getNav(t) {
  return [
  { to: '/dashboard',       icon: IcHome,     label: t('nav.home'), tourId: 'nav-dashboard' },
  // Assistent-Nav retired (Phase 1) — Leadly lebt in der Bubble + im Dashboard-Briefing.
  { to: '/aufgaben',        icon: IcKanban,   label: t('nav.aufgaben') },

  { divider: true, label: t('nav.branding'), tourId: 'nav-branding' },
  { to: '/personal-brand',  icon: IcPersonBrand,  label: 'Personal Brand' },
  { to: '/company-brand',   icon: IcCompanyBrand, label: 'Company Brand' },
  { to: '/zielgruppen',     icon: IcTarget,   label: t('nav.zielgruppen') },
  { to: '/branding/strike2-personas', icon: IcTarget, label: 'Strike2 Zielgruppen', module: 'strike2_zielgruppen_plus' },
  { to: '/ki-sichtbarkeit', icon: IcSparkles, label: 'KI-Sichtbarkeit', addonSlug: 'auralis' },

  { divider: true, label: t('nav.sales'), tourId: 'nav-sales' },
  { to: '/organizations',   icon: IcUsers2,   label: 'Unternehmen' },
  { to: '/leads',           icon: IcUsers,    label: 'Kontakte' },
  { to: '/deals',           icon: IcBarChart, label: t('nav.deals') },
  // Aus Sponsoring in CRM verschoben; Per-Item-Gating ans Sponsoring-Addon gebunden.
  { to: '/sponsoring/angebote',  icon: IcDoc,    label: 'Angebote',  module: 'sponsoring' },
  { to: '/sponsoring/vertraege', icon: IcShield, label: 'Verträge',  module: 'sponsoring' },
  { to: '/reports',         icon: IcBarChart, label: t('nav.salesReporting') },

  // Projektumsetzung temporär ausgeblendet (2026-06-01 — kommt später zurück)
  { divider: true, label: 'LinkedIn', tourId: 'nav-linkedin' },
  { to: '/linkedin-inbox',  icon: IcInbox,    label: 'Import-Inbox' },
  { to: '/vernetzungen',    icon: IcHeart,    label: 'Vernetzung' },
  { to: '/automatisierung', icon: IcZap,      label: 'Automatisierung' },
  { to: '/messages',        icon: IcMail,     label: 'Nachrichten' },
  { to: '/ssi',             icon: IcTarget,   label: t('nav.ssiTracker') },
  { to: '/profil-checker',  icon: IcLinkedIn, label: 'Profil-Checker' },
  { to: '/profiltexte',     icon: IcLinkedIn, label: t('nav.profiltexte') },

  { divider: true, label: t('nav.content'), tourId: 'nav-content' },
  { to: '/redaktionsplan',  icon: IcCalPen,   label: t('nav.redaktionsplan') },
  { to: '/content-studio',  icon: IcStar,     label: 'Content-Werkstatt' },
  { to: '/bibliothek',      icon: IcImage,    label: 'Bibliothek' },

  // Instagram — Addon-Section. Divider-Label MUSS 'Instagram' sein, damit
  // SIDEBAR_DIVIDER_TO_MODULE die Section ohne instagram-Modul ausblendet.
  { divider: true, label: 'Instagram', tourId: 'nav-instagram' },
  { to: '/instagram',       icon: IcInstagram, label: 'Analysen' },

  // "Wissen" — gemischte Herkunft: Wissensdatenbank (branding-Modul) + Ligen/Pakete
  // (sponsoring-Addon). BEWUSST KEIN Eintrag in SIDEBAR_DIVIDER_TO_MODULE → Gating
  // läuft per-Item über item.module; die Section verschwindet via Hide-empty-Divider
  // (Layout-Filter unten), sobald 0 Items sichtbar sind. Routen unverändert.
  { divider: true, label: 'Wissen', tourId: 'nav-wissen' },
  { to: '/wissensdatenbank',       icon: IcCloud,  label: t('nav.wissensdatenbank'), module: 'branding' },
  { to: '/sponsoring/ligen',       icon: IcShield, label: 'Ligen',             module: 'sponsoring' },
  { to: '/sponsoring/pakete',      icon: IcPuzzle, label: 'Pakete',            module: 'sponsoring' },
  { to: '/sponsoring/rechte',      icon: IcGrid,   label: 'Rechte & Inventar', module: 'sponsoring' },
  { to: '/sponsoring/hospitality', icon: IcHeart,  label: 'Hospitality',       module: 'sponsoring' },

  // Sponsoring OS — Addon-Section. Divider-Label MUSS 'Sponsoring' sein, damit
  // SIDEBAR_DIVIDER_TO_MODULE die Section ohne sponsoring-Modul ausblendet.
  { divider: true, label: 'Sponsoring', tourId: 'nav-sponsoring' },
  { to: '/sponsoring',                 icon: IcRocket,        label: 'Übersicht' },
  { to: '/sponsoring/kampagnen',       icon: IcRocket,        label: 'Kampagnen' },
  { to: '/sponsoring/branchenanalyse', icon: IcTarget,        label: 'Branchenanalyse' },
  { to: '/sponsoring/mockup',          icon: IcSparkles,      label: 'Mockup-Studio' },
  { to: '/sponsoring/aktivierung',     icon: IcZap,           label: 'Aktivierung' },
  { to: '/sponsoring/ziele',           icon: IcStar,          label: 'Ziele (SOLL)' },
  { to: '/sponsoring/reporting',       icon: IcBarChart,      label: 'Reporting' },
  { to: '/sponsoring/signale',         icon: IcTarget,        label: 'Signale' },
  { to: '/sponsoring/sichtbarkeit',    icon: IcSparkles,      label: 'KI-Sichtbarkeit' },
  { to: '/sponsoring/success',         icon: IcStar,          label: 'Sponsor Success' },
  // Aus dem Menü ausgeblendet (Routen + ModuleGuard bleiben bestehen, per Direkt-URL
  // weiter erreichbar): /sponsoring/assistent + /sponsoring/linkedin-import.

  ]
}

// ─── Aktive Section bestimmen ────────────────────────────────────────────────
// Die aktive/aufgeklappte Section folgt dem Nav-ITEM, das den pathname am
// spezifischsten matcht (längster passender `to`), NICHT einem URL-Präfix.
// Sonst fängt z.B. die Sponsoring-"Übersicht" (to:'/sponsoring') auch
// /sponsoring/ligen via startsWith und würde die Section "Wissen" verdrängen,
// obwohl Ligen/Pakete als Nav-Items in "Wissen" leben.
function getActiveSectionLabel(nav, pathname) {
  let curLabel = null
  let bestLen = -1
  let bestLabel = null
  const consider = (to) => {
    if (!to) return
    if (pathname === to || pathname.startsWith(to + '/')) {
      if (to.length > bestLen) { bestLen = to.length; bestLabel = curLabel }
    }
  }
  for (const item of nav) {
    if (item.divider) { curLabel = item.label; continue }
    consider(item.to)
    if (item.subSection && Array.isArray(item.items)) item.items.forEach(s => consider(s.to))
  }
  return bestLabel
}

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ item, indent, inSection, collapsed }) {
  const loc = useLocation()
  const isActive = loc.pathname === item.to || loc.pathname.startsWith(item.to + '/')

  return (
    <NavLink to={item.to} style={{ textDecoration:'none' }} title={collapsed ? item.label : undefined}>
      {({ isActive: navActive }) => (
        <div data-tour-id={item.tourId || (item.to ? 'navlink:' + item.to : undefined)} style={{
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
function NavSection({ label, items, isAdmin, location, collapsed, isOpen, onOpen, onToggle, tourId, autoActive }) {
  const open = isOpen

  // Auto-open: NUR die Section, die den pathname am spezifischsten matcht
  // (autoActive wird zentral im Parent via getActiveSectionLabel bestimmt) — nicht
  // jede Section, deren Item-Präfix zufällig passt. Sonst öffnet /sponsoring/ligen
  // (Item in "Wissen") auch die Sponsoring-Section (to:'/sponsoring' matcht per
  // startsWith) und verdrängt "Wissen".
  useEffect(() => {
    if (autoActive) onOpen()
  }, [location.pathname, autoActive])

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
        data-tour-id={tourId || undefined}
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
  const { theme } = useTheme()
  useTagRegistrySync() // füllt den Tag-Farb-Cache app-weit (auch Detailseiten-Pills)
  const { loading: onbLoading, tourDone, tipsDismissed, markTourDone, dismissTip, contentIntroSeen, areaToursDone, markContentIntroSeen, markAreaTourDone } = useOnboarding()
  const { brandVoices: _bvAll } = useBrandVoice()
  const [showContentIntro, setShowContentIntro] = useState(false)
  const [introManual, setIntroManual] = useState(false)
  const _isContentRoute = ['/redaktionsplan','/content-studio','/bibliothek','/visuals','/media','/dokumente'].some(r => location.pathname === r || location.pathname.startsWith(r + '/'))
  useEffect(() => {
    if (false) setShowContentIntro(true) // abgelöst durch Content-Bereichstour (AREA_TOURS.content)
  }, [onbLoading, contentIntroSeen, _isContentRoute, (_bvAll||[]).length])
  const [burgerOpen, setBurgerOpen] = useState(false)
  const [openSection, setOpenSection] = useState(null)

  // ── Pro-Bereich-Touren (mehrseitig, geführt) ────────────────────────
  // Auto-Start beim ersten Betreten eines Bereichs (nach der globalen Tour,
  // nur Desktop). "Später" snoozed den Bereich, bis der User ihn verlässt und
  // wieder betritt; der ?-Button im Header startet die Tour jederzeit neu.
  const [activeAreaTour, setActiveAreaTour] = useState(null)
  const [laterArea, setLaterArea] = useState(null)
  const currentArea = areaForRoute(location.pathname)
  useEffect(() => { setLaterArea(prev => (prev && prev !== currentArea ? null : prev)) }, [currentArea])
  useEffect(() => {
    if (onbLoading || !tourDone || isMobile) return
    if (!currentArea || activeAreaTour) return
    if (areaToursDone[currentArea] || laterArea === currentArea) return
    setActiveAreaTour(currentArea)
  }, [onbLoading, tourDone, isMobile, currentArea, activeAreaTour, areaToursDone, laterArea])
  // Manueller Start einer Bereichstour (z.B. aus „Erste Schritte")
  useEffect(() => {
    const onStart = (e) => { const a = e?.detail; if (a && AREA_TOURS[a]) setActiveAreaTour(a) }
    window.addEventListener('leadesk:start-area-tour', onStart)
    return () => window.removeEventListener('leadesk:start-area-tour', onStart)
  }, [])

  // Sidebar-Collapse deaktiviert — Seitenleiste bleibt immer ausgeklappt.
  // (Einklapp-Pfeil entfernt; collapsed fest false, damit auch zuvor eingeklappte
  //  User wieder die volle Leiste sehen.)
  const [collapsed] = useState(false)
  const setCollapsed = () => {}

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
  // IDs bereits gesehener Benachrichtigungen (persistiert) → ungelesene = neue IDs.
  // Dadurch wird die Glocke wieder rot, sobald etwas NEUES auftaucht.
  const [seenNotifIds, setSeenNotifIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('leadesk.notif.seen') || '[]') } catch { return [] }
  })
  const [extInstalled, setExtInstalled] = useState(false)
  useEffect(() => {
    let cancelled = false
    let retryTimer

    async function check() {
      const det = await detectLeadeskExtension()
      if (cancelled) return
      setExtInstalled(det.installed)
      // Bei false: einmal nach 1.5s nachprobieren (für ganz späte Bridge-Inits)
      if (!det.installed) {
        retryTimer = setTimeout(() => { if (!cancelled) check() }, 1500)
      }
    }

    check()
    const onVisible = () => { if (!document.hidden) check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [globalSearch,  setGlobalSearch]  = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [allLeads,      setAllLeads]      = useState([])
  const [showMenu, setShowMenu] = useState(false)
  // isAdmin: global_role='admin' (echter Admin) ODER Staging-Env (Tester-Convenience:
  // alle Sections sichtbar zum Feature-Test). Debug-Override: localStorage 'lk_force_member'
  // schaltet den Staging-Auto-Admin NUR für den eigenen Tab ab — um Entitlement-/Sidebar-
  // Gating aus Nicht-Admin-Sicht zu smoken, ohne anderen Staging-Testern die Admin-Sicht
  // zu nehmen. (Prod-Verhalten unverändert: dort greift nur role==='admin'.)
  const _forceMember = typeof window !== 'undefined' && window.localStorage.getItem('lk_force_member') === '1'
  const isAdmin = !_forceMember && (role === 'admin' || import.meta.env.VITE_APP_ENV === 'staging')
  const { team: activeTeam, activeTeamId, allTeams, switchTeam } = useTeam()
  useEffect(() => { setSentryUser(session?.user ?? null, activeTeamId ?? null) }, [session?.user?.id, activeTeamId])
  const isDemo  = session?.user?.email === 'demo@leadesk.de'
  const { t } = useTranslation()
  const { language, setLanguage } = useLanguage()
  const NAV = getNav(t)
  // Aktive Section folgt dem spezifischsten Nav-Item, nicht dem URL-Präfix.
  const activeSecLabel = getActiveSectionLabel(NAV, location.pathname)
  const { hasModule, hasPermission, loading: entitlementsLoading, data: entData } = useEntitlements()
  // Sidebar-Gating B3: Addons mit leerem activates_modules (z.B. auralis →
  // KI-Sichtbarkeit) sind nicht in entitlements.modules → Slug-Gate via useAddons.
  const { subscribedSlugs, reload: reloadAddons } = useAddons()
  // B4 Propagation: useAddons ist per-Component (nicht Context-shared wie
  // useEntitlements). Damit ein Cancel/Activate im Marketplace auch den Slug-Gate
  // hier live aktualisiert (≤2s, ohne Reload), reloaden wir die Addons sobald sich
  // die (Context-shared) Entitlements ändern — beide refreshen beim selben Event.
  useEffect(() => { reloadAddons() }, [entData, reloadAddons])
  // Phase 5 Block 3.5: planId/PLAN_LABELS removed — were dead code (never rendered)
  // and read from stale profiles.plan_id. Plan-Anzeige laeuft jetzt ueber useEntitlements.

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
    supabase.from('profiles').select('full_name,global_role,avatar_url').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setName(data.full_name)
        if (data?.avatar_url) setUserAvatar(data.avatar_url)
      })
  }, [session])

  useEffect(() => {
    if (session?.user) loadProfile()
  }, [session])

  // Benachrichtigungen: neu laden bei Session- ODER Team-Wechsel (Bugfix: lief vorher
  // nur auf [session] und brach bei noch leerem activeTeamId ab → dauerhaft leer) +
  // leichtes Polling alle 60s, damit neue Events ohne Reload auftauchen.
  useEffect(() => {
    if (!session?.user || !activeTeamId) return
    loadNotifications(session.user.id)
    const iv = setInterval(() => loadNotifications(session.user.id), 60000)
    return () => clearInterval(iv)
  }, [session, activeTeamId])

  // Auf Profil-Updates hören (von der Profilseite gefeuert)
  useEffect(() => {
    const handler = () => loadProfile()
    window.addEventListener('leadesk_profile_updated', handler)
    return () => window.removeEventListener('leadesk_profile_updated', handler)
  }, [loadProfile])

  async function loadNotifications(uid) {
    const tid = activeTeamId
    if (!tid) return // Team noch nicht geladen — Effekt feuert erneut sobald activeTeamId da ist
    const notifs = []
    const since = new Date(Date.now()-7*24*60*60*1000).toISOString()
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    const in3 = new Date(); in3.setDate(in3.getDate()+3)
    const in3Str = in3.toISOString().split('T')[0]
    // Jede Quelle einzeln abgesichert: eine fehlende Tabelle/Spalte darf nie die
    // ganze Glocke killen.
    const src = async (fn) => { try { await fn() } catch(e) { /* still ignorieren */ } }

    // ── CRM: Neue Leads (letzte 7 Tage) ──
    await src(async () => {
      const {data} = await supabase.from('leads').select('id,first_name,last_name,name,created_at').eq('team_id',tid).gte('created_at',since).order('created_at',{ascending:false}).limit(5)
      data?.forEach(l => {
        const name = l.first_name ? `${l.first_name} ${l.last_name||''}`.trim() : (l.name||'Unbekannt')
        notifs.push({id:'l'+l.id, type:'lead', icon:'👤', title:`Neuer Lead: ${name}`, time:l.created_at})
      })
    })

    // ── CRM: Überfällige/heute Follow-ups ──
    await src(async () => {
      const {data} = await supabase.from('leads').select('id,first_name,last_name,next_followup').eq('team_id',tid).lte('next_followup',today).not('next_followup','is',null).order('next_followup',{ascending:true}).limit(5)
      data?.forEach(l => {
        const name = l.first_name ? `${l.first_name} ${l.last_name||''}`.trim() : 'Lead'
        const fd = new Date(l.next_followup)
        if (isNaN(fd.getTime())) return // kaputtes/leeres Datum überspringen
        const diff = Math.round((new Date()-fd)/86400000)
        const label = diff<=0?'Heute':diff===1?'Gestern':`vor ${diff} Tagen`
        notifs.push({id:'f'+l.id, type:'followup', icon:'📅', title:`Follow-up ${label}: ${name}`, time:l.next_followup+'T09:00:00'})
      })
    })

    // ── CRM: Aufgaben überfällig/heute/morgen ──
    await src(async () => {
      const {data} = await supabase.from('lead_tasks').select('id,title,due_date,leads(first_name,last_name)').eq('team_id',tid).eq('status','open').lte('due_date',tomorrowStr).order('due_date',{ascending:true}).limit(5)
      data?.forEach(t=>{
        const isOverdue = t.due_date < today
        const leadName = t.leads ? `${t.leads.first_name||''} ${t.leads.last_name||''}`.trim() : ''
        notifs.push({id:'t'+t.id,type:'task',icon:isOverdue?'⚠️':'📋',title:`${isOverdue?'Überfällig':'Fällig'}: ${t.title}${leadName?' · '+leadName:''}`,time:t.due_date+'T09:00:00'})
      })
    })

    // ── CRM: Deals mit anstehendem Abschluss (nächste 3 Tage / überfällig) ──
    await src(async () => {
      const {data} = await supabase.from('deals').select('id,title,stage,expected_close_date').eq('team_id',tid).lte('expected_close_date',in3Str).not('expected_close_date','is',null).not('stage','in','("gewonnen","verloren")').order('expected_close_date',{ascending:true}).limit(5)
      data?.forEach(d=>{
        const overdue = d.expected_close_date < today
        notifs.push({id:'d'+d.id,type:'deal',icon:'💼',title:`${overdue?'Abschluss überfällig':'Abschluss steht an'}: ${d.title||'Deal'}`,time:d.expected_close_date+'T09:00:00'})
      })
    })

    // ── Projektumsetzung: Projekt-Aufgaben überfällig/heute ──
    await src(async () => {
      const {data} = await supabase.from('pm_tasks').select('id,title,due_date,status').eq('team_id',tid).lte('due_date',today).not('due_date','is',null).neq('status','done').order('due_date',{ascending:true}).limit(5)
      data?.forEach(t=>{
        const overdue = t.due_date < today
        notifs.push({id:'p'+t.id,type:'pm',icon:overdue?'⚠️':'🗂️',title:`${overdue?'Projekt überfällig':'Projekt fällig'}: ${t.title||'Aufgabe'}`,time:t.due_date+'T09:00:00'})
      })
    })

    // ── LinkedIn: neue angenommene Vernetzungen (letzte 7 Tage) ──
    await src(async () => {
      const {data} = await supabase.from('linkedin_inbox').select('id,name,li_accepted_at').eq('team_id',tid).gte('li_accepted_at',since).not('li_accepted_at','is',null).order('li_accepted_at',{ascending:false}).limit(5)
      data?.forEach(c=>notifs.push({id:'c'+c.id,type:'connection',icon:'🤝',title:`Vernetzung angenommen: ${c.name||'Kontakt'}`,time:c.li_accepted_at}))
    })

    // ── Content: geplante Posts, die zur Veröffentlichung anstehen ──
    await src(async () => {
      const {data} = await supabase.from('content_posts').select('id,title,scheduled_at,status').eq('team_id',tid).eq('status','scheduled').lte('scheduled_at',tomorrowStr+'T23:59:59').not('scheduled_at','is',null).order('scheduled_at',{ascending:true}).limit(5)
      data?.forEach(p=>notifs.push({id:'cp'+p.id,type:'content',icon:'📝',title:`Post geplant: ${p.title||'Beitrag'}`,time:p.scheduled_at}))
    })

    // ── Team: offene Einladungen ──
    await src(async () => {
      const {data} = await supabase.from('invites').select('id,email,created_at').eq('status','pending').limit(3)
      data?.forEach(inv=>notifs.push({id:'i'+inv.id,type:'invite',icon:'✉️',title:'Einladung offen: '+inv.email,time:inv.created_at}))
    })

    notifs.sort((a,b)=>new Date(b.time)-new Date(a.time))
    setNotifications(notifs.slice(0,12))
  }

  useEffect(()=>{
    function h(e){if(!e.target.closest('[data-notif]')&&!e.target.closest('[data-user-menu]')){setShowNotif(false);setShowMenu(false)}}
    document.addEventListener('mousedown',h)
    return ()=>document.removeEventListener('mousedown',h)
  },[])

  // Globale Suche: Leads laden
  useEffect(() => {
    if (!session?.user?.id) return
    if (!activeTeamId) { setAllLeads([]); return }
    supabase.from('leads').select('id,first_name,last_name,name,company,job_title,hs_score,deal_stage')
      .eq('team_id', activeTeamId)
      .then(({ data }) => setAllLeads(data || []))
  }, [session, activeTeamId])

  // Leads neu laden wenn Suche geöffnet wird (damit neue Leads erscheinen)
  useEffect(() => {
    if (!searchOpen || !session?.user?.id) return
    if (!activeTeamId) { setAllLeads([]); return }
    supabase.from('leads').select('id,first_name,last_name,name,company,job_title,hs_score,deal_stage')
      .eq('team_id', activeTeamId)
      .then(({ data }) => setAllLeads(data || []))
  }, [searchOpen, activeTeamId])

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
    '/': 'Startseite', '/dashboard': 'Startseite', '/leads': 'Kontakte',
    '/vernetzungen': 'Vernetzung', '/pipeline': 'Pipeline',
    '/organizations': 'Unternehmen',
    '/reports': 'Sales Reporting', '/ssi': 'SSI Tracker',
    '/messages': 'Nachrichten', '/getting-started': 'Erste Schritte',
    '/brand-voice': 'Brand Voice', '/personal-brand': 'Personal Brand', '/company-brand': 'Company Brand', '/zielgruppen': 'Zielgruppen', '/wissensdatenbank': 'Wissensdatenbank', '/profiltexte': 'Profiltexte',
    '/ki-sichtbarkeit': 'KI-Sichtbarkeit',
    '/icp': 'Zielgruppen (ICP)',
    '/linkedin-connect': 'LinkedIn Cloud',
    '/content-studio': 'Content Studio', '/redaktionsplan': 'Redaktionsplan', '/dokumente': 'Dokumente', '/bibliothek': 'Bibliothek',
    '/settings/team': 'Team',
    '/settings': 'Einstellungen',
    '/profile': 'Mein Profil',
    '/whitelabel': 'Whitelabel',
    '/changelog': 'Changelog',
    '/admin/tenants': 'Tenant-Verwaltung',
    '/admin': 'Admin Panel',
    '/admin/users': 'Benutzerverwaltung',
    '/admin-users': 'Benutzerverwaltung',
    '/comments': 'Kommentare',
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
            }}><X size={14} strokeWidth={1.75}/></button>
          )}
        </div>

        {/* Collapse-Toggle entfernt — Seitenleiste bleibt immer ausgeklappt (Pfeil wurde nicht genutzt) */}

        {/* Team-Switcher — nur sichtbar wenn ≥2 Teams und Sidebar nicht eingeklappt */}
        <TeamSwitcher isCollapsed={isCollapsed} />

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
                sections.push({ type:'section', label: item.label, tourId: item.tourId, items: [] })
              } else {
                if (currentSection) {
                  sections[sections.length - 1].items.push(item)
                } else {
                  topItems.push(item)
                }
              }
            })

            // Block 5.4: per-Item Permission-Filter.
            //   - adminOnly + !isAdmin → ausgeblendet (existing)
            //   - entitlementsLoading → Bypass (D-A=a optimistic, kein Flash)
            //   - isAdmin → Bypass (existing)
            //   - getRequiredPermission(item.to)===null → always-on, gerendert
            //   - hasPermission(perm)===true → gerendert
            //   - sonst → herausgefiltert
            const isItemVisible = (item) => {
              if (!item) return false
              if (item.adminOnly && !isAdmin) return false
              if (!item.to) return true            // sub-section parent
              if (entitlementsLoading) return true // D-A=a Race-Schutz
              // Admin sees all sidebar items for support — DO NOT remove without
              // alternative diagnostics path (Leadesk-Admin braucht Sicht auf
              // Sponsoring/Strike2/etc. auch ohne Modul-Activation des Accounts).
              if (isAdmin) return true
              // Sidebar-Gating (Marketplace-Addons): Item nur sichtbar wenn das
              // zugehörige Addon/Modul aktiviert ist (verschwindet nach Cancel).
              //   item.module    → Modul-Gate (Addon mit activates_modules, z.B. Strike2)
              //   item.addonSlug → Slug-Gate (Addon mit leerem activates_modules, z.B. auralis)
              if (item.module && !hasModule(item.module)) return false
              if (item.addonSlug && !(subscribedSlugs?.has?.(item.addonSlug))) return false
              const perm = getRequiredPermission(item.to)
              if (perm === null) return true       // always-on
              return hasPermission(perm)
            }

            return (
              <>
                {topItems.filter(isItemVisible).map((item, i) => (
                  <NavItem key={i} item={item} collapsed={isCollapsed} />
                ))}
                {sections.map((sec, i) => {
                  // Existing Modul-Filter (Block 2 Plan-Modules-Feature):
                  // ganze Section weg wenn !hasModule. Admin/Loading sind Bypass.
                  const moduleKey = SIDEBAR_DIVIDER_TO_MODULE[sec.label]
                  let visibleItems = sec.items.filter(isItemVisible)

                  if (moduleKey && !isAdmin && !entitlementsLoading && !hasModule(moduleKey)) {
                    // Spezialfall LinkedIn-Section (2026-05-20 Restructure):
                    // Profiltexte ist nach LinkedIn gewandert, hat aber weiter
                    // die Permission 'linkedin.profile_texts'. Accounts wie
                    // SALESPLAY Webinar haben diese Permission, aber kein
                    // linkedin-Modul. Damit Profiltexte für sie erreichbar
                    // bleibt: Section anzeigen, aber NUR Profiltexte als Item.
                    if (sec.label === 'LinkedIn' && hasPermission('linkedin.profile_texts')) {
                      visibleItems = sec.items.filter(it => it.to === '/profiltexte')
                    } else {
                      return null
                    }
                  }

                  // Block 5.4: Section komplett verstecken wenn 0 Items uebrig
                  // (D-B=a), aber NICHT waehrend loading (Race-Schutz).
                  if (visibleItems.length === 0 && !entitlementsLoading) {
                    return null
                  }
                  return (
                    <NavSection
                      key={i}
                      label={sec.label}
                      tourId={sec.tourId}
                      items={visibleItems}
                      isAdmin={isAdmin}
                      location={location}
                      collapsed={isCollapsed}
                      autoActive={activeSecLabel === sec.label}
                      isOpen={openSection === sec.label}
                      onOpen={() => setOpenSection(sec.label)}
                      onToggle={() => setOpenSection(prev => prev === sec.label ? null : sec.label)}
                    />
                  )
                })}
              </>
            )
          })()}
        </nav>

        {/* Credits-Bar im Sidebar-Footer (zeigt Verbrauch + verlinkt auf /billing) */}
        <CreditsBar collapsed={isCollapsed} />

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

          {/* Mitte — Logo nur Mobile */}
          <div style={{ flex:1, display:'flex', justifyContent:'center' }}>
            {isMobile && (
              <NavLink to="/" style={{ display:'flex', alignItems:'center', textDecoration:'none', lineHeight:0 }} title="Zur Startseite">
                <img src="/Leadesk_Logo.png" alt="Leadesk" style={{ height:30, width:'auto', objectFit:'contain', cursor:'pointer' }}/>
              </NavLink>
            )}
          </div>


          {/* Brand-Voice-Switcher — nur in LinkedIn- und Content-Bereichen sichtbar.
              Branding/CRM/Projektumsetzung sind team-shared, nicht BV-scoped. */}
          {!isMobile && isBrandVoiceContext(location.pathname) && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
              <span id="bv-switcher-anchor" data-tour-id="bv-switcher" style={{ display:'inline-flex' }}><BrandVoiceSwitcher session={session} /></span>
              {false && _isContentRoute && (
                <button onClick={() => setIntroManual(true)} title="Wie funktioniert der Content-Bereich?"
                  style={{ width:38, height:38, borderRadius:11, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}>
                  <HelpCircle size={15} strokeWidth={1.9}/>
                </button>
              )}
            </span>
          )}

          {!isMobile && currentArea && AREA_TOURS[currentArea] && (
            <button onClick={() => setActiveAreaTour(currentArea)} title={'Tour: ' + AREA_TOURS[currentArea].label + ' neu starten'}
              style={{ width:38, height:38, borderRadius:11, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}>
              <HelpCircle size={15} strokeWidth={1.9}/>
            </button>
          )}

          {/* Globales Sprachmodell — Picker für alle KI-Funktionen.
              Auf /ssi ausgeblendet (reines SSI-Tracking, keine KI-Funktion). */}
          {!isMobile && location.pathname !== '/ssi' && <GlobalModelPicker/>}

          {/* Extension-Button — direkt zum Chrome Web Store */}
          <a
            href={EXTENSION_WEBSTORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={extInstalled ? 'Browser-Extension aktiv — im Web Store ansehen' : 'Browser-Extension installieren'}
            style={{ position:'relative', background:extInstalled?'rgba(34,197,94,0.12)':'var(--surface)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', border:'1px solid '+(extInstalled?'rgba(34,197,94,0.40)':'var(--border)'), cursor:'pointer', width:38, height:38, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', color: extInstalled?'rgb(22,163,74)':'var(--text-muted)', transition:'all 0.15s', textDecoration:'none' }}
            onMouseEnter={e=>{ if(!extInstalled) e.currentTarget.style.color='var(--text-primary)' }}
            onMouseLeave={e=>{ if(!extInstalled) e.currentTarget.style.color='var(--text-muted)' }}>
            <IcPuzzle/>
            {extInstalled ? (
              <span title="Extension aktiv" style={{ position:'absolute', top:6, right:6, width:9, height:9, borderRadius:'50%', background:'rgb(34,197,94)', border:'2px solid var(--bg-body)' }}/>
            ) : (
              <span title="Noch nicht installiert" style={{ position:'absolute', top:6, right:6, width:9, height:9, borderRadius:'50%', background:'var(--wl-primary, rgb(49,90,231))', border:'2px solid var(--bg-body)' }}/>
            )}
          </a>

          {/* Glocke — Pill */}
          <div style={{ position:'relative' }}>
            <button data-notif style={{ position:'relative', background: notifications.some(n=>!seenNotifIds.includes(n.id)) ? 'rgba(239,68,68,0.10)' : 'var(--surface)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', border:'1px solid '+(notifications.some(n=>!seenNotifIds.includes(n.id)) ? 'rgba(239,68,68,0.55)' : 'var(--border)'), cursor:'pointer', width:38, height:38, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', color: notifications.some(n=>!seenNotifIds.includes(n.id)) ? 'rgb(220,38,38)' : 'var(--text-muted)', transition:'all 0.15s' }}
              onClick={()=>{ setShowNotif(v=>{ const next=!v; if(next){ const ids=notifications.map(n=>n.id); setSeenNotifIds(ids); try{localStorage.setItem('leadesk.notif.seen',JSON.stringify(ids))}catch{} } return next }) }}
              onMouseEnter={e=>{ e.currentTarget.style.color='var(--text-primary)' }}
              onMouseLeave={e=>{ e.currentTarget.style.color = notifications.some(n=>!seenNotifIds.includes(n.id)) ? 'rgb(220,38,38)' : 'var(--text-muted)' }}>
              <IcBell/>
              {(() => { const u = notifications.filter(n=>!seenNotifIds.includes(n.id)).length; return u>0 ? (
                <span style={{ position:'absolute', top:-5, right:-5, minWidth:18, height:18, padding:'0 4px', boxSizing:'border-box', borderRadius:9, background:'rgb(239,68,68)', color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid var(--bg-body)', boxShadow:'0 2px 6px rgba(239,68,68,0.55)' }}>{u>9?'9+':u}</span>
              ) : null })()}
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
                        <div style={{ fontSize:11, color:'var(--text-soft)', marginTop:2 }}>{(() => { const d=new Date(n.time); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) })()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Avatar + Name Dropdown */}
            <div style={{ position:'relative' }} data-user-menu>
              <div onClick={() => setShowMenu(m => !m)}
                style={{ display:'flex', alignItems:'center', gap:8, height:38, boxSizing:'border-box', padding:'0 12px 0 4px', borderRadius:11, border:'none', background:'var(--surface)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', cursor:'pointer', userSelect:'none', transition:'all 0.18s',
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
                  {/* User-Info-Header entfernt (Name/Rolle/Enterprise — nicht funktional) */}
                  {/* Menu Items */}
                  <div style={{ padding:'6px' }}>
                    <button onClick={() => { navigate('/settings/profil'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--primary)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Einstellungen</span>
                    </button>
                    <button onClick={() => { navigate('/marketplace'); setShowMenu(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', background:'none', cursor:'pointer', fontSize:13, color:'var(--text-primary)', textAlign:'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <span style={{ width:22, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--primary)', flexShrink:0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></svg>
                      </span>
                      <span style={{ fontWeight:500 }}>Marketplace</span>
                      <span style={{ marginLeft:'auto', fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:99, background:'#FEF3C7', color:'#92400E', letterSpacing:'0.04em' }}>NEU</span>
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
                    {/* LinkedIn-Cloud-Menüpunkt ausgeblendet — Seite (/linkedin-connect) bleibt erreichbar */}
                    {/* Kanbanboards-Menüpunkt entfernt — Board-Ansicht aktuell nicht nutzbar */}
                    {/* Phase 5A: Admin sidebar section disabled. Routes deactivated.
                        Migration to admin.leadesk.de in progress.
                        See docs/architecture/PHASE_5_DISCOVERY.md / PHASE_5_DECISIONS.md */}
                    {false && isAdmin && (
                      <>
                        <div style={{ height:1, background:'#F3F4F6', margin:'4px 6px' }}/>
                        <div style={{ padding:'4px 12px 2px', fontSize:10, fontWeight:700, color:'var(--text-soft)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Admin</div>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} label="Admin Panel" onClick={() => { navigate('/admin'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>} label="─ Benutzerverwaltung" onClick={() => { navigate('/admin/users'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>} label="─ Changelog & Logs" onClick={() => { navigate('/admin-logs'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} label="─ Dokumentation" onClick={() => { navigate('/admin-docs'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>} label="Whitelabel" onClick={() => { navigate('/admin/whitelabel'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3v4M8 3v4M2 11h20"/></svg>} label="─ Tenant-Verwaltung" onClick={() => { navigate('/admin/tenants'); setShowMenu(false) }}/>
                        <MenuBtn icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>} label="─ Pläne & Module" onClick={() => { navigate('/admin/plans'); setShowMenu(false) }}/>

                      </>
                    )}
                    <div style={{ height:1, background:'#F3F4F6', margin:'4px 6px' }}/>
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
                <ContentIntroModal open={showContentIntro || introManual} onClose={() => { setShowContentIntro(false); setIntroManual(false); markContentIntroSeen() }} />
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
        <CreditsBanner />
          <main style={{ flex:1, overflowY: isMobile ? 'hidden' : 'auto', padding: isMobile ? 0 : 28, minHeight:0, display:'flex', flexDirection:'column' }}>
          {children}
        </main>
        <TimerBar />
      </div>

      {/* Globaler Leadly-Chatbot-Bubble (unten rechts, alle Seiten außer /assistant + /login) */}
      <LeadlyBubble />

      {/* Globales Credits-Exhausted-Modal (lauscht auf window-event 'leadesk:credits-exhausted') */}
      <CreditsExhaustedModal />

      {/* Onboarding: First-Run-Coachmark-Tour (anchored an Sidebar) */}
      {!onbLoading && !tourDone && <TourGuide onFinish={markTourDone} />}

      {/* Pro-Bereich-Tour (mehrseitig). Später = onClose (snooze),
          Fertig/Überspringen = onFinish (Bereich als gesehen markieren). */}
      {activeAreaTour && AREA_TOURS[activeAreaTour] && (
        <AreaTourGuide
          tour={AREA_TOURS[activeAreaTour]}
          onEnterStep={(stp) => {
            if (stp?.route && location.pathname !== stp.route) navigate(stp.route)
            const navKey = AREA_TOURS[activeAreaTour]?.navKey
            if (navKey) setOpenSection(t(navKey))
            if (stp?.event) { const ev = 'leadesk:tour-' + stp.event; window.dispatchEvent(new Event(ev)); setTimeout(() => window.dispatchEvent(new Event(ev)), 350) }
          }}
          onFinish={() => { window.dispatchEvent(new Event('leadesk:tour-demo-clear')); markAreaTourDone(activeAreaTour); setActiveAreaTour(null) }}
          onClose={() => { window.dispatchEvent(new Event('leadesk:tour-demo-clear')); setLaterArea(activeAreaTour); setActiveAreaTour(null) }}
        />
      )}

      {/* Just-in-time-Tipp beim ersten Betreten eines Bereichs — erst nach
          abgeschlossener Tour, und nur wenn für diese Route noch nicht weggeklickt. */}
      {(() => {
        if (onbLoading || !tourDone || activeAreaTour) return null
        const tip = tipForRoute(location.pathname)
        if (!tip || tipsDismissed.has(tip.key)) return null
        return <AreaTip tip={tip} onDismiss={() => dismissTip(tip.key)} />
      })()}

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

function isBrandVoiceContext(pathname) {
  // BV-Switcher sichtbar in LinkedIn-Bereich + Content-Bereich
  const bvRoutes = [
    '/profiltexte', '/vernetzungen', '/messages', '/automatisierung',
    '/redaktionsplan', '/content-studio', '/bibliothek', '/visuals', '/dokumente', '/media', '/content-reporting',
  ]
  return bvRoutes.some(r => pathname === r || pathname.startsWith(r + '/'))
}

function GlobalModelPicker() {
  const { model, setModel } = useModel()
  return <BrainButton model={model} onChange={setModel} size="small" eyebrow="KI-Modell"/>
}
