// Route-Permission-Map (Phase 5 Block 5.4)
//
// Zentral: welche Route braucht welche Permission aus PERMISSIONS_REGISTRY?
// Wird von PermissionGuard.jsx (App.jsx-Wrapper) und Layout.jsx (Sidebar-
// Filter) gelesen — single source of truth.
//
// Decisions Block 5.4:
//   D-A=a: Loading-State optimistisch (PermissionGuard rendert children
//          waehrend entitlements laden, kein Flash-Redirect).
//   D-B=a: Sidebar-Section hidden bei 0 sichtbaren Sub-Items.
//   D-C=a: Inline-Plan-Wrapper auf /brand-voice /reports /icp /profiltexte
//          /content-studio wurden via Hotfixes (PR #44, #45) und Block 5.7a
//          durch ModuleGuard ersetzt — Cleanup vollstaendig.
//   D-D=b: /assistant ist permission-gated via 'assistant.basic'
//          (alle 5 Plaene haben den Key heute, Effekt = always-on,
//          aber future-proof falls kuenftiger Plan ohne Assistant).
//
// 25 Permissions (siehe src/lib/permissions.js) decken 23 Routes ab.
// Nicht-gemappte Permission-Keys (Block-5.5/5.7-Scope):
//   - core.whitelabel    → keine Route in App.jsx (admin-Feature)
//   - core.multi_account → keine Route in App.jsx (admin-Feature)
//
// Always-on: Routes die jeder eingeloggte User braucht, unabhaengig vom
// Plan (Defense per D2: /billing als Upgrade-Target erreichbar muss).

// Always-on Set: feste Liste, kein Magic-Marker.
const ALWAYS_ON = new Set([
  '/',
  '/dashboard',
  '/getting-started',
  '/onboarding',
  '/billing',
  '/settings',
  '/settings/profil',
  '/settings/konto',
  '/profile',
  '/changelog',
  '/comments',
  '/pipeline',          // Redirect-only zu /deals?view=pipeline
])

// Path → Permission-Key. Pfade die als Prefix matchen (z.B. /leads/:id)
// werden via getRequiredPermission per startsWith aufgeloest.
const ROUTE_PERMISSIONS = {
  '/brand-voice':      'branding.voice',
  '/zielgruppen':      'branding.audiences',
  '/wissensdatenbank': 'branding.knowledge',
  '/profiltexte':      'linkedin.profile_texts',
  '/icp':              'branding.icp',
  '/leads':            'crm.contacts',
  '/organizations':    'crm.organizations',
  '/deals':            'crm.deals',
  '/aufgaben':         'crm.tasks',
  '/vernetzungen':     'linkedin.connections',
  '/linkedin-connect': 'linkedin.connections',
  '/messages':         'linkedin.messages',
  '/automatisierung':  'linkedin.automation',
  '/content-studio':   'content.studio',
  '/redaktionsplan':   'content.calendar',
  '/projekte':         'delivery.projects',
  '/zeiten':           'delivery.time_tracking',
  '/reports':          'reports.sales',
  '/ssi':              'linkedin.ssi_tracker',
  '/integrations':     'core.integrations',
  '/settings/team':    'core.team_management',
  '/assistant':        'assistant.basic',
}

/**
 * Gibt den fuer die Route benoetigten Permission-Key zurueck.
 * @param {string} pathname - location.pathname
 * @returns {string|null} - Permission-Key (z.B. 'crm.deals') oder null
 *                          fuer always-on / unbekannte Routes.
 */
export function getRequiredPermission(pathname) {
  if (!pathname || typeof pathname !== 'string') return null
  if (ALWAYS_ON.has(pathname)) return null
  if (ROUTE_PERMISSIONS[pathname]) return ROUTE_PERMISSIONS[pathname]

  // Prefix-Match fuer Detail-Routes: /leads/:id, /organizations/:id,
  // /projekte/:id, /settings/team/* (kein /settings-prefix-collapse, weil
  // ALWAYS_ON-Lookup oben schon gegriffen haette).
  for (const prefix in ROUTE_PERMISSIONS) {
    if (pathname.startsWith(prefix + '/')) {
      return ROUTE_PERMISSIONS[prefix]
    }
  }

  // Unbekannte Route: kein Guard. NotFound-Route ('*' → /) regelt.
  return null
}

// Convenience: Set aller gemappten Pfade (fuer Sidebar-Filter ohne erneut
// die Map iterieren zu muessen).
export { ALWAYS_ON, ROUTE_PERMISSIONS }
