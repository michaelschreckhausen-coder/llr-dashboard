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

function AnimatedLogo({ size = 110 }) {
  const w = size
  const h = size * 0.6
  return (
    <div style={{
      width: w,
      height: h,
      position: 'relative',
      animation: 'leadesk-breath 4s ease-in-out infinite',
    }}>
      <style>{`
        @keyframes leadesk-breath {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes leadesk-glow {
          0%, 100% { filter: drop-shadow(0 6px 18px rgba(49,90,231,0.18)) drop-shadow(0 0 6px rgba(49,90,231,0.10)); }
          50% { filter: drop-shadow(0 10px 28px rgba(49,90,231,0.32)) drop-shadow(0 0 14px rgba(49,90,231,0.20)); }
        }
        .leadesk-logo-svg { animation: leadesk-glow 4s ease-in-out infinite; }
      `}</style>
      <svg viewBox="0 0 100 60" width={w} height={h} className="leadesk-logo-svg">
        <defs>
          <linearGradient id="leadesk-grad-hero" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3CB1E5"/>
            <stop offset="100%" stopColor="#0F3A8E"/>
          </linearGradient>
        </defs>
        <path d="M50 6 C18 6 6 16 6 30 C6 44 18 54 50 54 L50 6 Z" fill="url(#leadesk-grad-hero)"/>
        <path d="M50 6 C82 6 94 16 94 30 C94 44 82 54 50 54 L50 6 Z" fill="url(#leadesk-grad-hero)"/>
        <rect x="48" y="6" width="4" height="48" fill="var(--surface, #fff)"/>
        <ellipse cx="34" cy="30" rx="14" ry="20" fill="var(--surface, #fff)"/>
        <ellipse cx="66" cy="30" rx="14" ry="20" fill="var(--surface, #fff)"/>
      </svg>
    </div>
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
  logoSize = 110,
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '60px 24px 40px',
      maxWidth: 580,
      margin: '0 auto',
    }}>
      <AnimatedLogo size={logoSize}/>

      {eyebrow && (
        <div style={{
          marginTop: 28,
          fontSize: 13,
          color: P,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
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
        lineHeight: 1.2,
      }}>{title}</h1>

      <p style={{
        margin: 0,
        marginBottom: 28,
        fontSize: 14,
        color: 'var(--text-muted, #6B7280)',
        lineHeight: 1.6,
        maxWidth: 460,
      }}>{subtitle}</p>

      {primaryLabel && (
        <button
          onClick={onPrimary}
          style={{
            background: P,
            color: '#fff',
            border: 'none',
            padding: '14px 32px',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(49,90,231,.22), 0 2px 4px rgba(49,90,231,.10)',
            transition: 'transform .15s, box-shadow .15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 6px 22px rgba(49,90,231,.28), 0 3px 6px rgba(49,90,231,.14)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(49,90,231,.22), 0 2px 4px rgba(49,90,231,.10)'
          }}
        >
          {primaryLabel}
        </button>
      )}

      {secondaryLabel && (
        <button
          onClick={onSecondary}
          style={{
            marginTop: 14,
            background: 'transparent',
            color: 'var(--text-muted, #6B7280)',
            border: 'none',
            padding: '6px 12px',
            fontSize: 13,
            cursor: 'pointer',
            textDecoration: 'none',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => e.currentTarget.style.color = P}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted, #6B7280)'}
        >
          {secondaryLabel}
        </button>
      )}

      {helperText && (
        <div style={{
          marginTop: 32,
          fontSize: 11,
          color: 'var(--text-muted, #9CA3AF)',
          opacity: .7,
          maxWidth: 380,
          lineHeight: 1.5,
        }}>{helperText}</div>
      )}
    </div>
  )
}
