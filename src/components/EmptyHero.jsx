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

const P = 'var(--wl-primary, rgb(49,90,231))'

function AnimatedLogo({ size = 130 }) {
  // Einfach das Favicon-PNG ohne Animationen.
  return (
    <img
      src="/Leadesk_Favicon (1).png"
      alt="Leadesk"
      width={size}
      height={Math.round(size / 1.628)}
      draggable={false}
      style={{ display: 'block', userSelect: 'none' }}
    />
  )
}
export default function EmptyHero({
  eyebrow,
  title,
  subtitle,
  primaryLabel,
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
        <AnimatedLogo size={130}/>
      </div>

      {eyebrow && (
        <div style={{
          marginTop: 28,
          fontSize: 20,
          color: '#30A0D0',
          fontFamily: '"Caveat", cursive',
          fontWeight: 600,
          letterSpacing: '.2px',
        }}>
          {eyebrow}
        </div>
      )}

      <h1 style={{
        marginTop: eyebrow ? 6 : 24,
        marginBottom: 10,
        fontSize: 26,
        fontWeight: 700,
        color: 'var(--text-primary, rgb(20,20,43))',
        letterSpacing: '-0.4px',
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
          onClick={onPrimary}
          style={{
            padding: '13px 32px',
            background: P,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 14.5,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(49,90,231,.28), 0 1px 2px rgba(49,90,231,.18)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'inherit',
            transition: 'transform .12s, box-shadow .12s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 8px 22px rgba(49,90,231,.36), 0 2px 4px rgba(49,90,231,.22)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(49,90,231,.28), 0 1px 2px rgba(49,90,231,.18)'
          }}
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
