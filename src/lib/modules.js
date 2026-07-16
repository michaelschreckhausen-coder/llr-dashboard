// Module-Konstanten — zentrale Definition der App-Bereiche, die per Plan
// freischaltbar sind. Reihenfolge entspricht der Sidebar-Anordnung.
//
// WICHTIG: Die Keys müssen 1:1 mit den erlaubten Werten in der CHECK-
// Constraint von public.plans.modules übereinstimmen (Migration
// 20260502100000_plans_modules.sql).

export const MODULE_KEYS = ['branding', 'crm', 'linkedin', 'content', 'delivery', 'reports']

export const MODULES = {
  branding: {
    key:   'branding',
    label: 'Branding',
    description: 'Brand Voice, Zielgruppen, Wissensdatenbank',
    routes: ['/brand-voice', '/zielgruppen', '/wissensdatenbank', '/icp', '/ki-sichtbarkeit'],
    color: '#0A6FB0',
  },
  crm: {
    key:   'crm',
    label: 'CRM',
    description: 'Kontakte, Unternehmen, Deals, Pipeline',
    routes: ['/leads', '/leads/:id', '/organizations', '/organizations/:id', '/deals', '/pipeline'],
    color: '#0A66C2',
  },
  linkedin: {
    key:   'linkedin',
    label: 'LinkedIn',
    description: 'Vernetzungen, Nachrichten, Automatisierung, Profiltexte, Profil-Checker',
    routes: ['/vernetzungen', '/messages', '/automatisierung', '/linkedin-connect', '/profiltexte', '/profil-checker', '/linkedin-suche', '/linkedin-netzwerk', '/linkedin-analytics', '/linkedin-engagement'],
    color: '#0077B5',
  },
  content: {
    key:   'content',
    label: 'Content',
    description: 'Content Studio, Redaktionsplan',
    routes: ['/content-studio', '/redaktionsplan', '/dokumente'],
    color: '#10B981',
  },
  delivery: {
    key:   'delivery',
    label: 'Projektumsetzung',
    description: 'Projekte, Zeiterfassung, Kanban-Board',
    routes: ['/projekte', '/projekte/:id', '/zeiten'],
    color: '#F59E0B',
  },
  reports: {
    key:   'reports',
    label: 'Reports',
    description: 'Sales-Reports, SSI-Tracker',
    routes: ['/reports', '/ssi'],
    color: '#EC4899',
  },
  // Addon-Modul (kein Plan-Modul) — freigeschaltet via account_addons → get_my_entitlements().modules
  instagram: {
    key:   'instagram',
    label: 'Instagram',
    description: 'Instagram-Analysen und Veröffentlichung aus dem Redaktionsplan',
    routes: ['/instagram'],
    color: '#E1306C',
  },
  // Addon-Modul (kein Plan-Modul) — freigeschaltet via account_addons → get_my_entitlements().modules
  sponsoring: {
    key:   'sponsoring',
    label: 'Sponsoring OS',
    description: 'Sponsoren, Rechte/Inventar, Angebote, Verträge, Aktivierung, KI-Sichtbarkeit',
    routes: [
      '/sponsoring', '/sponsoring/rechte', '/sponsoring/pakete',
      '/sponsoring/angebote', '/sponsoring/vertraege', '/sponsoring/aktivierung',
      '/sponsoring/hospitality', '/sponsoring/reporting', '/sponsoring/signale',
      '/sponsoring/sichtbarkeit', '/sponsoring/success', '/sponsoring/assistent',
      '/sponsoring/linkedin-import',
      '/sponsoring/ligen', '/sponsoring/kampagnen', '/sponsoring/branchenanalyse',
      '/sponsoring/mockup', '/sponsoring/ziele',
    ],
    color: '#E11D48',
  },
}

// Always-on-Routen — werden NIE per Modul gegated.
// Dazu gehören: Startseite, Assistent, Settings, Billing, Onboarding,
// alle /admin/*-Routen (separater isAdmin-Check), getting-started.
export const ALWAYS_ON_ROUTES = [
  '/',
  '/dashboard',
  '/assistant',
  '/aufgaben',           // Hub aggregiert über alle Module — always-on
  '/settings',
  '/settings/profil',
  '/settings/team',
  '/settings/konto',
  '/profile',
  '/billing',
  '/onboarding',
  '/getting-started',
  '/changelog',
  '/integrations',
  '/marketplace',
  '/upgrade',
]

// Sidebar-Divider-Label → Modul-Key Mapping. Genutzt um in Layout.jsx
// Sidebar-Gruppen modul-basiert auszublenden.
export const SIDEBAR_DIVIDER_TO_MODULE = {
  'Branding':         'branding',
  'CRM':              'crm',
  'Sales':            'crm',         // Legacy-Label
  'LinkedIn':         'linkedin',
  'Content':          'content',
  'Projektumsetzung': 'delivery',
  'Reporting':        'reports',
  'Instagram':        'instagram',
  'Sponsoring':       'sponsoring',
}
