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
  // SVG-Rekonstruktion des Favicons mit Stroke-Draw-Animation:
  // 1) Mittelstrich wird zuerst vertikal gezeichnet
  // 2) Linker D-Bogen wird gezeichnet
  // 3) Rechter D-Bogen wird gezeichnet
  // Danach: subtiles Pulsieren via Glow-Ring + Logo-Breath
  const w = size
  const h = Math.round(size * 0.5)
  return (
    <div style={{
      position: 'relative',
      width: w + 80,
      height: h + 80,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <style>{`
        @keyframes lg-glow {
          0%, 100% { opacity: 0; transform: scale(.88); }
          50%      { opacity: .55; transform: scale(1.05); }
        }
        @keyframes lg-breath {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.03); }
        }
        @keyframes lg-shimmer {
          0%   { filter: drop-shadow(0 4px 14px rgba(49,90,231,0.18)); }
          50%  { filter: drop-shadow(0 10px 26px rgba(49,90,231,0.32)); }
          100% { filter: drop-shadow(0 4px 14px rgba(49,90,231,0.18)); }
        }

        .lg-glow {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 78%;
          height: 78%;
          border-radius: 999px;
          background: radial-gradient(ellipse at center, rgba(49,90,231,0.30) 0%, rgba(60,177,229,0.18) 35%, rgba(255,255,255,0) 70%);
          opacity: 0;
          animation: lg-glow 4s ease-in-out 2.4s infinite;
          pointer-events: none;
          z-index: 0;
        }

        .lg-svg {
          position: relative;
          z-index: 1;
          animation: lg-shimmer 4s ease-in-out 2.4s infinite, lg-breath 4.5s ease-in-out 2.6s infinite;
          will-change: transform, filter;
        }
        .lg-svg:hover {
          animation-play-state: paused;
        }

        @keyframes lg-grow-y {
          0%   { transform: scaleY(0); }
          70%  { transform: scaleY(1.08); }
          100% { transform: scaleY(1); }
        }
        @keyframes lg-reveal-right-to-left {
          from { clip-path: inset(0 0 0 100%); }
          to   { clip-path: inset(0 0 0 0); }
        }
        @keyframes lg-reveal-left-to-right {
          from { clip-path: inset(0 100% 0 0); }
          to   { clip-path: inset(0 0 0 0); }
        }

        /* 1) Linker D-Ring — wird von rechts (Mitte) nach links enthuellt */
        .lg-left {
          clip-path: inset(0 0 0 100%);
          animation: lg-reveal-right-to-left 0.75s cubic-bezier(.4,.1,.25,1) 1.0s forwards;
        }
        /* 2) Rechter D-Ring — analog, von links (Mitte) nach rechts */
        .lg-right {
          clip-path: inset(0 100% 0 0);
          animation: lg-reveal-left-to-right 0.75s cubic-bezier(.4,.1,.25,1) 1.15s forwards;
        }
        /* 3) Mittelstrich — gefuelltes rect, waechst vertikal mit Pop-Overshoot.
           Animation startet ZUERST (0.3s delay), Boegen kommen danach. */
        .lg-mid {
          transform: scaleY(0);
          transform-origin: 160px 100px;
          transform-box: fill-box;
          animation: lg-grow-y 0.6s cubic-bezier(.45,.1,.3,1.4) 0.3s forwards;
        }
      `}</style>

      <div className="lg-glow"/>

      <svg
        className="lg-svg"
        viewBox="0 0 320 180"
        width={w}
        height={h}
        aria-label="Leadesk"
        role="img"
      >
        <defs>
          {/* Linker Bogen: hell-tuerkis aussen -> mittel-blau am Mittelstrich, leichter diagonaler 3D-Effekt */}
          <linearGradient id="lg-grad-left" x1="0%" y1="40%" x2="100%" y2="60%">
            <stop offset="0%"   stopColor="#5BC4F1"/>
            <stop offset="35%"  stopColor="#3CB1E5"/>
            <stop offset="100%" stopColor="#1A6FA8"/>
          </linearGradient>
          {/* Mittelstrich: durchgehend dunkel-blau, subtiler vertikaler Verlauf */}
          <linearGradient id="lg-grad-mid" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#1A6FA8"/>
            <stop offset="50%"  stopColor="#0F4F7A"/>
            <stop offset="100%" stopColor="#0B4068"/>
          </linearGradient>
          {/* Rechter Bogen: mittel-blau am Mittelstrich -> dunkel-navy aussen */}
          <linearGradient id="lg-grad-right" x1="0%" y1="40%" x2="100%" y2="60%">
            <stop offset="0%"   stopColor="#1A6FA8"/>
            <stop offset="50%"  stopColor="#0F4F7A"/>
            <stop offset="100%" stopColor="#073550"/>
          </linearGradient>
        </defs>

        {/* 1) Linke D-Form mit Wand-Dicke 32: outer pill (CW) + inner D-hole (CCW), evenodd */}
        <path
          className="lg-left"
          fillRule="evenodd"
          fill="url(#lg-grad-left)"
          d="M 96 20 H 144 V 180 H 96 A 80 80 0 0 1 96 20 Z
             M 96 52 A 48 48 0 0 0 96 148 H 144 V 52 H 96 Z"
        />

        {/* 2) Rechte D-Form gespiegelt */}
        <path
          className="lg-right"
          fillRule="evenodd"
          fill="url(#lg-grad-right)"
          d="M 224 20 H 176 V 180 H 224 A 80 80 0 0 0 224 20 Z
             M 224 52 A 48 48 0 0 1 224 148 H 176 V 52 H 224 Z"
        />

        {/* 3) Mittelstrich (Wand-Dicke 32) — OBEN in z-order */}
        <rect
          className="lg-mid"
          x="144" y="20" width="32" height="160"
          fill="url(#lg-grad-mid)"
        />
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
