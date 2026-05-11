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
  // Verwendet das echte Original-Favicon-PNG fuer pixel-perfect Look.
  // Animation: clip-path inset reveals - erst Mittelstrich vertikal (Mitte hoch+runter),
  // dann linke Haelfte enthuellt sich, dann rechte Haelfte.
  // Logo-Aspekt: 1.628:1 (gemessen aus dem Original-PNG, das 2048x2048 ist mit Logo
  // bei ca. 2032x1248px im Inneren).
  const w = size
  const h = Math.round(size / 1.628)

  // Mittelstrich-Position im Original-PNG:
  // Logo bounds x=[8, 2040] -> width 2032; Mittelstrich x=[944, 1108] -> 164px wide
  // Centered: from 46.1% to 54.1% of logo width
  // Mit dem PNG-Padding (8px transparent links und 8px rechts), ist Mittelstrich
  // bei ~46% - 54% des Gesamt-Image. Wir verwenden 46/54 als clip-Werte.
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
        @keyframes lg-reveal {
          /* Phase 1 (0-30%): Mittelstrich waechst vertikal aus der Mitte
             clip-path inset args: top right bottom left.
             - left/right = 46% laesst x=[46%, 54%] sichtbar (= Mittelstrich-Breite)
             - top/bottom animieren von 50% (Punkt in Mitte) zu 0% (volle Hoehe) */
          0%   { clip-path: inset(50% 46% 50% 46%); }
          30%  { clip-path: inset(0%  46% 0%  46%); }
          /* Phase 2 (30-65%): Linker Bogen enthuellt -- left inset 46% -> 0% */
          65%  { clip-path: inset(0%  46% 0%  0%);  }
          /* Phase 3 (65-100%): Rechter Bogen enthuellt -- right inset 46% -> 0% */
          100% { clip-path: inset(0%  0%  0%  0%);  }
        }
        @keyframes lg-glow {
          0%, 100% { opacity: 0; transform: scale(.88); }
          50%      { opacity: .55; transform: scale(1.05); }
        }
        @keyframes lg-breath {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.03); }
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
          animation: lg-glow 4s ease-in-out 2.2s infinite;
          pointer-events: none;
          z-index: 0;
        }

        .lg-img-wrap {
          position: relative;
          z-index: 1;
          animation: lg-breath 4.5s ease-in-out 2.4s infinite;
          will-change: transform;
          filter: drop-shadow(0 8px 22px rgba(49, 90, 231, 0.18));
          transition: filter .25s ease-out;
        }
        .lg-img-wrap:hover {
          filter: drop-shadow(0 14px 32px rgba(49, 90, 231, 0.32));
        }
        .lg-img {
          width: ${w}px;
          height: auto;
          display: block;
          clip-path: inset(50% 46% 50% 46%);
          animation: lg-reveal 2.3s cubic-bezier(.5,.05,.3,1) 0.3s forwards;
        }
      `}</style>

      <div className="lg-glow"/>
      <div className="lg-img-wrap">
        <img
          src="/Leadesk_Favicon (1).png"
          alt="Leadesk"
          className="lg-img"
          draggable={false}
        />
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
