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
    description: 'Brand Voice, Zielgruppen, Wissensdatenbank, Profiltexte',
    routes: ['/brand-voice', '/zielgruppen', '/wissensdatenbank', '/profiltexte', '/icp'],
    color: '#8B5CF6',
  },
  crm: {
    key:   'crm',
    label: 'CRM',
    description: 'Kontakte, Unternehmen, Deals, Pipeline, Aufgaben',
    routes: ['/leads', '/leads/:id', '/organizations', '/organizations/:id', '/deals', '/aufgaben', '/crm-enrichment', '/pipeline'],
    color: '#0A66C2',
  },
  linkedin: {
    key:   'linkedin',
    label: 'LinkedIn',
    description: 'Vernetzungen, Nachrichten, Automatisierung',
    routes: ['/vernetzungen', '/messages', '/automatisierung', '/linkedin-connect'],
    color: '#0077B5',
  },
  content: {
    key:   'content',
    label: 'Content',
    description: 'Content Studio, Redaktionsplan',
    routes: ['/content-studio', '/redaktionsplan'],
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
}

// Always-on-Routen — werden NIE per Modul gegated.
// Dazu gehören: Startseite, Assistent, Settings, Billing, Onboarding,
// alle /admin/*-Routen (separater isAdmin-Check), getting-started.
export const ALWAYS_ON_ROUTES = [
  '/',
  '/dashboard',
  '/assistant',
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
}
