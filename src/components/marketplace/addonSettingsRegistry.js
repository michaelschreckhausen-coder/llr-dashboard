// src/components/marketplace/addonSettingsRegistry.js
//
// Generische Registry: Add-on-Slug → Settings-Komponente.
//
// Ein Add-on erhält im ⋮-Menü ("Add-on verwalten") den Eintrag „Einstellungen",
// sobald für seinen Slug hier eine Komponente registriert ist. Die Komponente
// wird von der Marketplace-Page in einem Modal gerendert und bekommt die Props
// { addon, onFlash, onClose }.
//
// Add-ons OHNE Eintrag (z. B. Instagram) behalten ihr bisheriges Menü
// unverändert (nur „Kündigen" bzw. „Abonnement verwalten").

import AsanaSettingsPanel from './AsanaSettingsPanel'

export const ADDON_SETTINGS_COMPONENTS = {
  'asana-integration': AsanaSettingsPanel,
}

export function getAddonSettingsComponent(slug) {
  return (slug && ADDON_SETTINGS_COMPONENTS[slug]) || null
}
