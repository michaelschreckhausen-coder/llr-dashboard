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
  // 3-Layer-Animation auf dem echten Original-Favicon-PNG:
  // - Layer 1 (Mittelstrich): clip-path inset(0 46% 0 46%) -> nur Mittelstrich-Bereich.
  //   Animation: scaleY 0 -> 1.05 -> 1 (Pop-Overshoot) ab 0.2s
  // - Layer 2 (Linker Bogen): clip-path inset(0 54% 0 0) -> nur linke Haelfte.
  //   Animation: fade-in + slide von rechts (Mitte) nach links, ab 0.7s
  // - Layer 3 (Rechter Bogen): clip-path inset(0 0 0 54%) -> nur rechte Haelfte.
  //   Animation: fade-in + slide von links (Mitte) nach rechts, ab 0.85s
  // Logo-Aspekt 1.628:1.
  const w = size
  const h = Math.round(size / 1.628)

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
        @keyframes lg-mid-pop {
          0%   { transform: scaleY(0); }
          60%  { transform: scaleY(1.08); }
          80%  { transform: scaleY(0.97); }
          100% { transform: scaleY(1); }
        }
        @keyframes lg-left-in {
          0%   { opacity: 0; transform: translateX(18px) scale(.92); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes lg-right-in {
          0%   { opacity: 0; transform: translateX(-18px) scale(.92); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes lg-glow {
          0%, 100% { opacity: 0; transform: scale(.88); }
          50%      { opacity: .55; transform: scale(1.05); }
        }
        @keyframes lg-breath {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.025); }
        }

        .lg-glow {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 78%;
          height: 65%;
          border-radius: 999px;
          background: radial-gradient(ellipse at center, rgba(49,90,231,0.30) 0%, rgba(60,177,229,0.18) 35%, rgba(255,255,255,0) 70%);
          opacity: 0;
          animation: lg-glow 4.5s ease-in-out 2.3s infinite;
          pointer-events: none;
          z-index: 0;
        }

        .lg-stack {
          position: relative;
          width: ${w}px;
          height: ${h}px;
          z-index: 1;
          filter: drop-shadow(0 8px 22px rgba(49, 90, 231, 0.18));
          animation: lg-breath 5s ease-in-out 2.5s infinite;
          will-change: transform;
          transition: filter .25s ease-out;
        }
        .lg-stack:hover {
          filter: drop-shadow(0 14px 32px rgba(49, 90, 231, 0.32));
        }

        .lg-layer {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          background-image: url("/Leadesk_Favicon (1).png");
          background-size: 100% 100%;
          background-repeat: no-repeat;
          background-position: center;
          will-change: transform, opacity;
        }
        .lg-mid {
          clip-path: inset(0 46% 0 46%);
          transform: scaleY(0);
          transform-origin: 50% 50%;
          animation: lg-mid-pop 0.7s cubic-bezier(.5,.05,.3,1) 0.2s forwards;
        }
        .lg-left {
          clip-path: inset(0 54% 0 0);
          opacity: 0;
          transform: translateX(18px) scale(.92);
          animation: lg-left-in 0.65s cubic-bezier(.25,.85,.35,1) 0.75s forwards;
        }
        .lg-right {
          clip-path: inset(0 0 0 54%);
          opacity: 0;
          transform: translateX(-18px) scale(.92);
          animation: lg-right-in 0.65s cubic-bezier(.25,.85,.35,1) 0.9s forwards;
        }
      `}</style>

      <div className="lg-glow"/>
      <div className="lg-stack">
        <div className="lg-layer lg-mid"/>
        <div className="lg-layer lg-left"/>
        <div className="lg-layer lg-right"/>
      </div>
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
