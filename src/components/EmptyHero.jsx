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
  const h = Math.round(size * 0.62)
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
        @keyframes lg-draw {
          to { stroke-dashoffset: 0; }
        }
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

        .lg-stroke {
          fill: none;
          stroke-linejoin: round;
        }

        /* 1) Mittelstrich — gefuelltes rect, waechst von Mitte aus vertikal */
        .lg-mid {
          transform: scaleY(0);
          transform-origin: 100px 60px;
          transform-box: fill-box;
          animation: lg-grow-y 0.6s cubic-bezier(.45,.1,.3,1.4) 0.3s forwards;
        }
        /* 2) Linker Bogen — stroke-draw von rechts (Mitte) nach links */
        .lg-left {
          stroke-dasharray: 280;
          stroke-dashoffset: 280;
          animation: lg-draw 0.8s cubic-bezier(.45,.1,.25,1) 1.0s forwards;
        }
        /* 3) Rechter Bogen — analog, leicht versetzt */
        .lg-right {
          stroke-dasharray: 280;
          stroke-dashoffset: 280;
          animation: lg-draw 0.8s cubic-bezier(.45,.1,.25,1) 1.15s forwards;
        }
      `}</style>

      <div className="lg-glow"/>

      <svg
        className="lg-svg"
        viewBox="0 0 200 120"
        width={w}
        height={h}
        aria-label="Leadesk"
        role="img"
      >
        <defs>
          <linearGradient id="lg-grad" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%"   stopColor="#3CB1E5"/>
            <stop offset="55%"  stopColor="#1A6FA8"/>
            <stop offset="100%" stopColor="#0D4D7F"/>
          </linearGradient>
          <linearGradient id="lg-grad-left" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%"   stopColor="#3CB1E5"/>
            <stop offset="100%" stopColor="#1A6FA8"/>
          </linearGradient>
          <linearGradient id="lg-grad-right" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%"   stopColor="#1A6FA8"/>
            <stop offset="100%" stopColor="#0D4D7F"/>
          </linearGradient>
        </defs>

        {/* 1) Mittelstrich — gefuelltes rounded-rect, zeichnet sich von Mitte aus aus */}
        <rect
          className="lg-mid"
          x="92" y="8" width="16" height="104" rx="8"
          fill="url(#lg-grad)"
        />

        {/* 2) Linker Bogen — D-foermig, neben dem Mittelstrich */}
        <path
          className="lg-stroke lg-left"
          d="M 92 16 C 30 16, 10 42, 10 60 S 30 104, 92 104"
          stroke="url(#lg-grad-left)"
          strokeWidth="16"
          fill="none"
          strokeLinecap="round"
        />

        {/* 3) Rechter Bogen — D-foermig gespiegelt, neben dem Mittelstrich */}
        <path
          className="lg-stroke lg-right"
          d="M 108 16 C 170 16, 190 42, 190 60 S 170 104, 108 104"
          stroke="url(#lg-grad-right)"
          strokeWidth="16"
          fill="none"
          strokeLinecap="round"
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
