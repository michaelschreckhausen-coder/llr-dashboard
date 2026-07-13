// Permission-Registry (Phase 5 Block 5.1)
//
// Single Source of Truth fuer alle 26 Permission-Keys, gruppiert nach 8 Modulen.
// Wird in spaeteren Sub-Phasen verwendet:
//   - 5.4 ProtectedRoute: requiredPermission-Prop matched gegen ALL_PERMISSION_KEYS
//   - 5.5 Plan-Editor in admin.leadesk.de: Permission-Matrix-Editor rendert
//         Module-Gruppen via PERMISSIONS_REGISTRY
//   - 5.3 useEntitlements: hasPermission() lookup
//
// WICHTIG: Diese Konstanten muessen 1:1 mit den Werten in plans.permissions
// (DB-side) uebereinstimmen. Migration 20260504201508_block_5_1_*.sql hat
// existing Plaene mit Initial-Matrix befuellt.
//
// Total: 26 Permissions, 8 Modul-Gruppen.

export const PERMISSIONS_REGISTRY = {
  branding: {
    label: 'Branding',
    description: 'Brand Voice, Zielgruppen, Wissensbasis, ICP',
    color: '#0A6FB0',
    permissions: {
      voice:     { label: 'Brand Voice',  description: 'KI-Content in der Markenstimme' },
      audiences: { label: 'Zielgruppen',  description: 'Target-Audience-Profile' },
      knowledge: { label: 'Wissensbasis', description: 'Knowledge-Base & Dokumente' },
      icp:       { label: 'ICP-Profile',  description: 'Ideal-Customer-Profile' },
    },
  },
  crm: {
    label: 'CRM',
    description: 'Kontakte, Unternehmen, Deals, Aufgaben, Anreicherung',
    color: '#0A66C2',
    permissions: {
      contacts:      { label: 'Kontakte',           description: 'Lead-/Contact-Verwaltung' },
      organizations: { label: 'Unternehmen',        description: 'Account-/Company-Verwaltung' },
      deals:         { label: 'Deals & Pipeline',   description: 'Deals, Stages, Kanban-View' },
      tasks:         { label: 'Aufgaben',           description: 'Lead-bezogene Tasks' },
      enrichment:    { label: 'Lead-Anreicherung',  description: 'Automatische Daten-Anreicherung (Premium)' },
    },
  },
  linkedin: {
    label: 'LinkedIn',
    description: 'SSI-Tracker, Profiltexte, Profil-Checker, Vernetzungen, Nachrichten, Automatisierung',
    color: '#0077B5',
    permissions: {
      ssi_tracker:   { label: 'SSI-Tracker',     description: 'Social-Selling-Index-Monitoring' },
      profile_texts: { label: 'Profiltexte',     description: 'LinkedIn-Profilslogan, Info-Box, Position' },
      profil_checker:{ label: 'Profil-Checker',  description: 'LinkedIn-Profil-Analyse' },
      connections:   { label: 'Vernetzungen',    description: 'LinkedIn-Connection-Verwaltung' },
      messages:      { label: 'Nachrichten',     description: 'LinkedIn-Messaging' },
      automation:    { label: 'Automatisierung', description: 'Automatisierte Sequenzen (Premium)' },
      cloud:         { label: 'LinkedIn-Cloud',  description: 'Cloud-Sync der LinkedIn-Daten' },
    },
  },
  content: {
    label: 'Content',
    description: 'Content-Studio und Redaktionsplan',
    color: '#10B981',
    permissions: {
      studio:   { label: 'Content-Studio',  description: 'KI-Content-Generation' },
      calendar: { label: 'Redaktionsplan',  description: 'Content-Kalender (Premium)' },
    },
  },
  delivery: {
    label: 'Projektumsetzung',
    description: 'Projekte und Zeiterfassung',
    color: '#F59E0B',
    permissions: {
      projects:      { label: 'Projekte',       description: 'Projekt- und Kanban-Verwaltung' },
      time_tracking: { label: 'Zeiterfassung',  description: 'Zeit-Eintraege auf Projekten' },
    },
  },
  reports: {
    label: 'Reports',
    description: 'Sales-Reports',
    color: '#EC4899',
    permissions: {
      sales: { label: 'Sales-Reports', description: 'Activity- und Conversion-Reports' },
    },
  },
  core: {
    label: 'Core',
    description: 'Plattform-Features',
    color: '#64748B',
    permissions: {
      integrations:    { label: 'Integrationen',     description: 'Externe API-Anbindungen' },
      team_management: { label: 'Team-Verwaltung',   description: 'Member-Invites und -Rollen' },
      whitelabel:      { label: 'Whitelabel',        description: 'Eigene Domain & Branding (Premium)' },
      multi_account:   { label: 'Multi-Account',     description: 'Mehrere Accounts pro User (Premium)' },
    },
  },
  assistant: {
    label: 'Assistent',
    description: 'KI-Assistent',
    color: '#3B82F6',
    permissions: {
      basic: { label: 'KI-Assistent', description: 'Basis-Chat mit Marken-Kontext' },
    },
  },
}

// Flat key-list ('module.permission') aus Registry — single source of truth
// fuer Validation und Editor-Iteration.
export const ALL_PERMISSION_KEYS = Object.entries(PERMISSIONS_REGISTRY)
  .flatMap(([modul, group]) =>
    Object.keys(group.permissions).map((sub) => `${modul}.${sub}`)
  )

// Convenience: Module-Order fuer UI-Sortierung im Editor.
export const PERMISSION_MODULES_ORDER = [
  'branding', 'crm', 'linkedin', 'content',
  'delivery', 'reports', 'core', 'assistant',
]

// Sanity-Check: total = 25 (Initial-Matrix-Soll).
// Wirft beim Modul-Import wenn die Konstanten nicht zur Migration matchen.
if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test') {
  if (ALL_PERMISSION_KEYS.length !== 26) {
    // eslint-disable-next-line no-console
    console.warn(
      `[permissions.js] expected 26 keys, got ${ALL_PERMISSION_KEYS.length}. ` +
      `If intentional, update Migration 20260504201508 + this assertion.`
    )
  }
}
