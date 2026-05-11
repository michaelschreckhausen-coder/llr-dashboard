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
  // Echtes Favicon-PNG aus /public/. Wir wrappen es in zwei Layer:
  // 1) Aussen ein Glow-Ring mit Pulse-Animation (sanfter blauer Schein, wandert auf/ab)
  // 2) Innen das eigentliche Logo mit Breath-Scale + leichter Hover-Lift
  const logoSize = size
  return (
    <div style={{
      position: 'relative',
      width: logoSize + 80,
      height: Math.round(logoSize * 0.62) + 80,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <style>{`
        @keyframes leadesk-breath {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes leadesk-glow {
          0%, 100% {
            opacity: 0.45;
            transform: scale(0.92);
          }
          50% {
            opacity: 0.85;
            transform: scale(1.08);
          }
        }
        @keyframes leadesk-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .leadesk-logo-img {
          animation: leadesk-breath 4s ease-in-out infinite;
          transition: transform .25s ease-out, filter .25s ease-out;
          filter: drop-shadow(0 8px 22px rgba(49, 90, 231, 0.18));
          will-change: transform;
        }
        .leadesk-logo-img:hover {
          transform: scale(1.07) translateY(-2px);
          filter: drop-shadow(0 14px 32px rgba(49, 90, 231, 0.32));
        }
        .leadesk-logo-glow {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 78%;
          height: 78%;
          border-radius: 999px;
          background: radial-gradient(ellipse at center, rgba(49,90,231,0.30) 0%, rgba(60,177,229,0.18) 35%, rgba(255,255,255,0) 70%);
          animation: leadesk-glow 4s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }
      `}</style>
      <div className="leadesk-logo-glow"/>
      <img
        src="/Leadesk_Favicon (1).png"
        alt="Leadesk"
        className="leadesk-logo-img"
        style={{
          width: logoSize,
          height: 'auto',
          position: 'relative',
          zIndex: 1,
        }}
      />
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
  logoSize = 130,
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
