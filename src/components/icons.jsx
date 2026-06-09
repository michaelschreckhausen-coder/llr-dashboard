// Eigene Icon-Komponenten fuer Symbole, die lucide-react v0.383 nicht
// exportiert (Markenzeichen-Entfernung in lucide-react seit 0.343).

import React from 'react'

export function LinkedinIcon({ size = 16, strokeWidth = 1.75, color = 'currentColor', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
      <rect x="2" y="9" width="4" height="12"/>
      <circle cx="4" cy="4" r="2"/>
    </svg>
  )
}
