// PermissionGuard (Phase 5 Block 5.4)
//
// Zentraler Catch-All-Wrapper inside Layout. Liest aktuellen Pfad via
// useLocation, schlaegt Permission via getRequiredPermission() nach,
// rendert children oder redirected zu /billing.
//
// Decisions:
//   D-A=a (Loading-State optimistisch):
//     Waehrend useEntitlements() noch laedt (loading=true) → children
//     rendern. Page-Components muessen weiterhin defensiv mit "data===null"
//     umgehen. Flash-of-Content ist akzeptiert. Begruendung: matcht
//     existing Sidebar-Filter-Pattern in Layout.jsx (Z644-647) seit
//     Block 3.6 v2 — kein Hold-back gegenueber Existing-Verhalten.
//
//   D-D=b (/assistant gated):
//     Mapped via routePermissions.js → 'assistant.basic'. Alle 5 Plaene
//     haben den Key heute, Effekt = effective always-on, aber future-
//     proof falls kuenftiger Plan ohne Assistant.
//
// Race-Schutz (kritisch nach Block 3.6 v1 Whitescreen-Vorfall):
//   PermissionGuard rendert NIEMALS Navigate-Redirect waehrend
//   loading=true. EntitlementsProvider (Block 3.6 v2) liefert
//   loading=true bis erste RPC-Antwort, dann false. Erst nach loading
//   greift hasPermission().
//
// Fail-Open vs Fail-Closed:
//   - Unbekannte Routes (kein Eintrag in routePermissions) → render
//     children (fail-open). NotFound ('*' → /) regelt.
//   - Bekannte Routes ohne Permission → Navigate to /billing replace
//     (fail-closed mit Upgrade-CTA-Target).

import { Navigate, useLocation } from 'react-router-dom'
import { useEntitlements } from '../hooks/useEntitlements'
import { getRequiredPermission } from '../lib/routePermissions'

export default function PermissionGuard({ children }) {
  const location = useLocation()
  const { hasPermission, loading } = useEntitlements()

  const required = getRequiredPermission(location.pathname)

  // Always-on / unbekannte Route → kein Guard.
  if (required === null) return children

  // D-A=a: optimistisch waehrend loading. Race-Schutz kritisch.
  if (loading) return children

  // hasPermission greift jetzt definitiv (loading=false).
  if (hasPermission(required)) return children

  // Denied: Navigate-Redirect zu /billing als Upgrade-Target (D-C=η).
  // replace=true verhindert History-Spam beim wiederholten Direct-Access.
  return <Navigate to="/settings/konto" replace />
}
