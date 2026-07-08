// src/components/leadly/LeadlyOrb.jsx
//
// Leadlys Gesicht (Phase 1, Command-Center-Startseite): abstrakter Orb,
// der das Leadesk-Favicon als Brille trägt — zwei Gläser, ein Steg, die
// Augen blinzeln dahinter. 100 % client-seitig (CSS/SVG, kein externes
// Asset, kein Dienst) → ISO-27001-konform, keine neuen Datenflüsse.
//
// Zustände (prop `state`):
//   idle       ruhiges Morphen + Blinzeln
//   listening  schnellere Morphs + Puls-Ring (Sprachaufnahme läuft)
//   thinking   leichtes Schrumpfen + Spinner-Bogen (Leadly arbeitet)
//   speaking   Mund bewegt sich (TTS-Wiedergabe läuft)
//   happy      Lächeln + fröhliches Wippen (Aktion erledigt)
//
// Farbe folgt dem Theme-Primary (Whitelabel-fähig via CSS-Variable).
// Upgrade-Pfad Phase 2: gleiche Zustands-API, Rendering via Rive.

import React from 'react';

export default function LeadlyOrb({ state = 'idle', size = 96 }) {
  const s = size;
  const primary = 'var(--wl-primary, var(--primary, rgb(49,90,231)))';
  const fast = state === 'listening';
  const glassW = Math.round(s * 0.52);
  const glassH = Math.round(glassW * 0.56);
  const eyeW = Math.max(4, Math.round(s * 0.055));
  const eyeH = Math.max(8, Math.round(s * 0.115));

  return (
    <div aria-hidden="true" style={{ position: 'relative', width: s, height: s, flexShrink: 0 }}>
      <style>{`
        @keyframes lkorb-morph {
          0%, 100% { border-radius: 44% 56% 52% 48% / 50% 46% 54% 50%; transform: rotate(0deg); }
          50% { border-radius: 56% 44% 48% 52% / 46% 54% 46% 54%; transform: rotate(7deg); }
        }
        @keyframes lkorb-blink {
          0%, 92%, 100% { transform: translateY(-50%) scaleY(1); }
          95% { transform: translateY(-50%) scaleY(0.12); }
        }
        @keyframes lkorb-ring {
          0% { transform: scale(0.92); opacity: 0.4; }
          100% { transform: scale(1.22); opacity: 0; }
        }
        @keyframes lkorb-spin { to { transform: rotate(360deg); } }
        @keyframes lkorb-talk {
          0%, 100% { height: ${Math.max(3, Math.round(s * 0.04))}px; width: ${Math.round(s * 0.16)}px; }
          50% { height: ${Math.round(s * 0.1)}px; width: ${Math.round(s * 0.12)}px; }
        }
        @keyframes lkorb-bob {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
          50% { transform: translate(-50%, -52%) rotate(-2deg); }
        }
      `}</style>

      {state === 'listening' && (
        <div style={{
          position: 'absolute', inset: -4, borderRadius: '50%',
          border: `2.5px solid ${primary}`,
          animation: 'lkorb-ring 1.3s ease-out infinite',
        }} />
      )}

      <div style={{
        position: 'absolute', inset: 0, background: primary, opacity: 0.13,
        borderRadius: '44% 56% 52% 48% / 50% 46% 54% 50%',
        animation: `lkorb-morph ${fast ? '2s' : '7s'} ease-in-out infinite`,
      }} />
      {state === 'thinking' ? (
        <div style={{
          position: 'absolute', inset: Math.round(s * 0.1), borderRadius: '50%',
          border: '3px solid transparent', borderTopColor: primary, opacity: 0.7,
          animation: 'lkorb-spin 1.4s linear infinite',
        }} />
      ) : (
        <div style={{
          position: 'absolute', inset: Math.round(s * 0.09), background: primary, opacity: 0.22,
          borderRadius: '52% 48% 46% 54% / 48% 54% 46% 52%',
          animation: `lkorb-morph ${fast ? '1.6s' : '5s'} ease-in-out infinite reverse`,
        }} />
      )}

      <div style={{
        position: 'absolute', inset: Math.round(s * 0.2), borderRadius: '50%',
        background: primary,
        transform: state === 'thinking' ? 'scale(0.94)' : state === 'speaking' ? 'scale(1.04)' : 'scale(1)',
        transition: 'transform 0.4s ease',
      }}>
        <div style={{
          position: 'absolute', top: '42%', left: '50%',
          width: glassW, height: glassH,
          transform: 'translate(-50%, -50%)',
          animation: state === 'happy' ? 'lkorb-bob 1.2s ease-in-out infinite' : 'lkorb-bob 6s ease-in-out infinite',
        }}>
          <svg viewBox="0 0 190 108" width={glassW} height={glassH} style={{ display: 'block' }}>
            <path d="M54 8 H136 A46 46 0 0 1 136 100 H54 A46 46 0 0 1 54 8 Z"
              fill="none" stroke="#fff" strokeWidth="15" />
            <rect x="87" y="8" width="16" height="92" fill="#fff" />
          </svg>
          <div style={{
            position: 'absolute', top: '50%', left: '22%',
            width: eyeW, height: eyeH, borderRadius: eyeW,
            background: '#fff', transform: 'translateY(-50%)',
            animation: 'lkorb-blink 4.5s infinite',
          }} />
          <div style={{
            position: 'absolute', top: '50%', right: '22%',
            width: eyeW, height: eyeH, borderRadius: eyeW,
            background: '#fff', transform: 'translateY(-50%)',
            animation: 'lkorb-blink 4.5s infinite 0.05s',
          }} />
        </div>

        {state === 'happy' ? (
          <div style={{
            position: 'absolute', bottom: '14%', left: '50%', transform: 'translateX(-50%)',
            width: Math.round(s * 0.2), height: Math.round(s * 0.09),
            borderRadius: `0 0 ${Math.round(s * 0.12)}px ${Math.round(s * 0.12)}px`,
            background: '#fff', opacity: 0.95,
          }} />
        ) : (
          <div style={{
            position: 'absolute', bottom: '15%', left: '50%', transform: 'translateX(-50%)',
            width: Math.round(s * 0.16), height: Math.max(3, Math.round(s * 0.04)),
            borderRadius: 4, background: '#fff', opacity: 0.9,
            animation: state === 'speaking' ? 'lkorb-talk 0.3s ease-in-out infinite' : 'none',
          }} />
        )}
      </div>
    </div>
  );
}
