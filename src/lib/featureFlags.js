// src/lib/featureFlags.js
//
// Simple localStorage-backed feature-flags für Staged-Rollouts.
//
// Toggle via Browser-Console:
//   window.__lk_features.leadsV2 = true
//   → persistiert in localStorage, Refresh nötig damit React es liest
//
// Oder direkt:
//   localStorage.setItem('lk_features.leadsV2', 'true')
//   location.reload()
//
// Aktuell registrierte Flags: 'leadsV2'.

const PREFIX = 'lk_features.'

export function isFlagEnabled(name) {
  try {
    return localStorage.getItem(PREFIX + name) === 'true'
  } catch {
    return false
  }
}

// Browser-only side-effect: mountet einen mutierenden Mirror auf window
// damit dev-toggles ohne import aus der Console gehen.
if (typeof window !== 'undefined') {
  const initial = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) {
        initial[k.slice(PREFIX.length)] = localStorage.getItem(k) === 'true'
      }
    }
  } catch {}

  window.__lk_features = new Proxy(initial, {
    set(obj, key, value) {
      const v = !!value
      obj[key] = v
      try {
        if (v) localStorage.setItem(PREFIX + key, 'true')
        else localStorage.removeItem(PREFIX + key)
      } catch {}
      // eslint-disable-next-line no-console
      console.log(`[featureFlags] ${String(key)}=${v}. Refresh page to apply.`)
      return true
    },
  })
}
