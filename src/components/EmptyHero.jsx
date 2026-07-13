// src/components/EmptyHero.jsx
// Hero-Empty-State fuer den Branding-Bereich (Brand Voice, Zielgruppen,
// Wissensdatenbank). Zentriertes Layout, animiertes Leadesk-Logo, grosser
// Primary-CTA, dezente Sekundaer-Option darunter.
//
// Props:
//   eyebrow         — kleine kursiv-Headline ueber dem Title (optional)
//   title           — Hauptueberschrift (Pflicht)
//   subtitle        — Beschreibungstext (Pflicht)
//   primaryLabel    — Text des grossen CTA-Buttons
//   onPrimary       — Click-Handler
//   secondaryLabel  — Text des dezenten Links darunter (optional)
//   onSecondary     — Click-Handler des Links (optional)
//   helperText      — Mini-Text unter den Buttons (optional)

import React from 'react'
import EmptyOrb from './EmptyOrb'

const P = 'var(--wl-primary, #0A6FB0)'

export default function EmptyHero({
  eyebrow,
  title,
  subtitle,
  primaryLabel,
  primaryTourId,
  onPrimary,
  secondaryLabel,
  onSecondary,
  helperText,
}) {
  return (
    <div style={{
      padding: '60px 24px 80px',
      textAlign: 'center',
      maxWidth: 640,
      margin: '0 auto',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <EmptyOrb size={150}/>
      </div>

      {eyebrow && (
        <div style={{ display:'flex', justifyContent:'center', marginTop:20 }}>
          <span className="lk-eyebrow">{eyebrow}</span>
        </div>
      )}

      <h1 style={{
        marginTop: eyebrow ? 6 : 24,
        marginBottom: 10,
        fontSize: 30,
        fontWeight: 800,
        color: 'var(--text-primary, #0E1633)',
        letterSpacing: '-0.6px',
        lineHeight: 1.15,
      }}>{title}</h1>

      {subtitle && (
        <p style={{
          fontSize: 14,
          color: 'var(--text-muted, #6B7280)',
          margin: 0,
          marginBottom: 28,
          lineHeight: 1.6,
        }}>{subtitle}</p>
      )}

      {primaryLabel && (
        <button
          data-tour-id={primaryTourId}
          onClick={onPrimary}
          className="lk-btn lk-btn-primary lk-btn-lg"
        >
          {primaryLabel}
        </button>
      )}

      {secondaryLabel && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={onSecondary}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #6B7280)',
              fontSize: 13,
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              fontFamily: 'inherit',
              padding: '4px 8px',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = P }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #6B7280)' }}
          >
            {secondaryLabel}
          </button>
        </div>
      )}

      {helperText && (
        <div style={{
          marginTop: 24,
          fontSize: 12,
          color: 'var(--text-soft, #9CA3AF)',
          lineHeight: 1.55,
        }}>
          {helperText}
        </div>
      )}
    </div>
  )
}
