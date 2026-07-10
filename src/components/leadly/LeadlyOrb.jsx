// src/components/leadly/LeadlyOrb.jsx
//
// Leadlys Gesicht (v2 „Buddy", Juli 2026): illustrierter Charakter als
// Inline-SVG — Kopf mit Verlauf + Glanzlicht, Favicon-Brille als
// Markenzeichen, Sales-Headset mit Mikro, Schultern mit Kragen.
// 100 % client-seitig (kein Asset, kein Dienst) → ISO-27001-konform.
//
// Zustände (prop `state`):
//   idle       sanftes Schweben + Blinzeln, Lächeln
//   listening  Puls-Ring + aufmerksame Brauen (Sprachaufnahme läuft)
//   thinking   Brauen schräg, kleiner Mund, Blick leicht oben
//   speaking   Mund öffnet/schließt im Loop (TTS läuft)
//   happy      breites offenes Lächeln + Wangen + fröhliches Wippen
//
// Augen folgen dem Mauszeiger (rAF-gedrosselt, direkte Style-Updates ohne
// Re-Render; Blick-Offset auf dem <g>-Wrapper, Blinzeln als scaleY-Animation
// auf dem inneren Element — keine transform-Kollision).
//
// Upgrade-Pfad Phase 2: gleiche Zustands-API, Rendering via Rive.

import React, { useEffect, useId, useRef } from 'react';

export default function LeadlyOrb({ state = 'idle', size = 96 }) {
  const s = size;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const wrapRef = useRef(null);
  const eyeLRef = useRef(null);
  const eyeRRef = useRef(null);

  // ── Augen folgen dem Mauszeiger (Offsets in viewBox-Einheiten, 512er-Raum) ──
  useEffect(() => {
    let raf = 0;
    let lastX = null;
    let lastY = null;

    const apply = () => {
      raf = 0;
      const wrap = wrapRef.current;
      if (!wrap || lastX == null) return;
      const r = wrap.getBoundingClientRect();
      if (!r.width) return;
      const dx = lastX - (r.left + r.width / 2);
      const dy = lastY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const strength = Math.min(1, dist / 140);
      // viewBox-Einheiten (512er-Raum): 26/16 Einheiten ≈ 5/3 px bei 104px-Größe
      const px = (dx / dist) * 26 * strength;
      const py = (dy / dist) * 16 * strength;
      const t = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`;
      if (eyeLRef.current) eyeLRef.current.style.transform = t;
      if (eyeRRef.current) eyeRRef.current.style.transform = t;
    };

    const onMove = (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const speaking = state === 'speaking';
  const thinking = state === 'thinking';
  const happy = state === 'happy';
  const listening = state === 'listening';
  // Unter 48px: Kopf-only — Körper/Headset/Brauen sind bei Mini-Größen
  // (z.B. 26px-Avatar im Chat-Thread) nicht mehr lesbar.
  const compact = s < 48;

  if (compact) {
    return (
      <div ref={wrapRef} aria-hidden="true" style={{ position: 'relative', width: s, height: s, flexShrink: 0 }}>
        <svg viewBox="0 0 512 512" width={s} height={s} style={{ display: 'block' }}>
          <defs>
            <radialGradient id={`lkbh${uid}`} cx="38%" cy="30%" r="85%">
              <stop offset="0%" stopColor="#5B8CFF" />
              <stop offset="45%" stopColor="#3563E9" />
              <stop offset="100%" stopColor="#1B2F7A" />
            </radialGradient>
          </defs>
          <circle cx="256" cy="256" r="240" fill={`url(#lkbh${uid})`} />
          <path d="M 178 190 H 334 A 82 82 0 0 1 334 354 H 178 A 82 82 0 0 1 178 190 Z"
            fill="none" stroke="#FFFFFF" strokeWidth="34" />
          <rect x="240" y="190" width="32" height="164" fill="#FFFFFF" />
          <g ref={eyeLRef}><rect x="196" y="238" width="34" height="68" rx="17" fill="#FFFFFF" /></g>
          <g ref={eyeRRef}><rect x="282" y="238" width="34" height="68" rx="17" fill="#FFFFFF" /></g>
          <path d="M 210 408 Q 256 446 302 408" fill="none" stroke="#FFFFFF" strokeWidth="22" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // CSS-transform überschreibt in SVG das transform-Attribut → Grundrotation
  // der Brauen hier mitführen (fill-box, Rotation ums eigene Zentrum).
  const browBase = { transformBox: 'fill-box', transformOrigin: 'center', transition: 'transform 0.25s ease' };
  const browL = thinking ? 'translateY(-14px) rotate(-16deg)' : listening ? 'translateY(-12px) rotate(-7deg)' : 'rotate(-7deg)';
  const browR = thinking ? 'translateY(4px) rotate(9deg)' : listening ? 'translateY(-12px) rotate(7deg)' : 'rotate(7deg)';

  return (
    <div ref={wrapRef} aria-hidden="true" style={{ position: 'relative', width: s, height: s, flexShrink: 0 }}>
      <style>{`
        @keyframes lkb-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-${Math.max(1, Math.round(s * 0.02))}px); } }
        @keyframes lkb-bob { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-${Math.max(2, Math.round(s * 0.035))}px) rotate(-2deg); } }
        @keyframes lkb-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.12); } }
        @keyframes lkb-ring { 0% { transform: scale(0.94); opacity: 0.4; } 100% { transform: scale(1.18); opacity: 0; } }
        @keyframes lkb-talk { 0%, 100% { transform: scaleY(0.25); } 50% { transform: scaleY(1); } }
      `}</style>

      {listening && (
        <div style={{
          position: 'absolute', inset: -4, borderRadius: '50%',
          border: `2.5px solid var(--wl-primary, var(--primary, #0A6FB0))`,
          animation: 'lkb-ring 1.3s ease-out infinite',
        }} />
      )}

      <svg viewBox="0 0 512 512" width={s} height={s}
        style={{ display: 'block', animation: `${happy ? 'lkb-bob 1.1s' : 'lkb-float 4.5s'} ease-in-out infinite` }}>
        <defs>
          <radialGradient id={`lkbh${uid}`} cx="38%" cy="30%" r="85%">
            <stop offset="0%" stopColor="#5B8CFF" />
            <stop offset="45%" stopColor="#3563E9" />
            <stop offset="100%" stopColor="#1B2F7A" />
          </radialGradient>
          <linearGradient id={`lkbb${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2E56D4" />
            <stop offset="100%" stopColor="#1B2F7A" />
          </linearGradient>
          <linearGradient id={`lkbg${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#DFE9FF" />
          </linearGradient>
        </defs>

        {/* Bodenschatten + Körper mit Kragen */}
        <ellipse cx="256" cy="478" rx="150" ry="16" fill="#0B1F4E" opacity="0.16" />
        <path d="M 128 470 Q 128 392 256 392 Q 384 392 384 470 Z" fill={`url(#lkbb${uid})`} />
        <path d="M 226 392 L 256 424 L 286 392 Q 256 404 226 392 Z" fill="#FFFFFF" opacity="0.9" />

        {/* Kopf */}
        <circle cx="256" cy="228" r="152" fill={`url(#lkbh${uid})`} />
        <ellipse cx="192" cy="134" rx="62" ry="36" fill="#FFFFFF" opacity="0.2" transform="rotate(-18 192 134)" />

        {/* Headset: Bügel, Ohrpolster, Mikrofonarm */}
        <path d="M 122 196 A 138 138 0 0 1 390 196" fill="none" stroke="#E9EFFB" strokeWidth="20" strokeLinecap="round" />
        <rect x="96" y="180" width="34" height="62" rx="16" fill="#E9EFFB" />
        <rect x="382" y="180" width="34" height="62" rx="16" fill="#E9EFFB" />
        <path d="M 113 244 Q 118 320 190 330" fill="none" stroke="#E9EFFB" strokeWidth="11" strokeLinecap="round" />
        <circle cx="196" cy="331" r="15" fill="#E9EFFB" />
        <circle cx="196" cy="331" r="7" fill="#3563E9" />

        {/* Augenbrauen */}
        <rect x="170" y="140" width="38" height="10" rx="5" fill="#FFFFFF"
          style={{ ...browBase, transform: browL }} />
        <rect x="304" y="140" width="38" height="10" rx="5" fill="#FFFFFF"
          style={{ ...browBase, transform: browR }} />

        {/* Favicon-Brille */}
        <path d="M 210 164 H 302 A 51 51 0 0 1 302 266 H 210 A 51 51 0 0 1 210 164 Z"
          fill="none" stroke={`url(#lkbg${uid})`} strokeWidth="22" />
        <rect x="246" y="164" width="20" height="102" fill={`url(#lkbg${uid})`} />

        {/* Augen: äußeres <g> = Blickrichtung, inneres <rect> = Blinzeln */}
        <g ref={eyeLRef} style={{ transition: 'transform 0.06s linear' }}>
          <rect x="194" y={thinking ? 188 : 193} width="22" height="44" rx="11" fill="#FFFFFF"
            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'lkb-blink 4.5s infinite' }} />
        </g>
        <g ref={eyeRRef} style={{ transition: 'transform 0.06s linear' }}>
          <rect x="296" y={thinking ? 188 : 193} width="22" height="44" rx="11" fill="#FFFFFF"
            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'lkb-blink 4.5s infinite 0.05s' }} />
        </g>

        {/* Wangen */}
        <ellipse cx="152" cy="292" rx="21" ry="12" fill="#8FB0FF" opacity={happy ? 0.85 : 0.55} style={{ transition: 'opacity 0.3s' }} />
        <ellipse cx="360" cy="292" rx="21" ry="12" fill="#8FB0FF" opacity={happy ? 0.85 : 0.55} style={{ transition: 'opacity 0.3s' }} />

        {/* Mund: Lächeln (idle/denken) · offener Mund (sprechen/freuen) */}
        {speaking ? (
          <ellipse cx="256" cy="322" rx="26" ry="20" fill="#FFFFFF"
            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'lkb-talk 0.32s ease-in-out infinite' }} />
        ) : happy ? (
          <path d="M 218 306 Q 256 352 294 306 Q 256 322 218 306 Z" fill="#FFFFFF" />
        ) : (
          <path d={thinking ? 'M 240 318 Q 256 328 272 318' : 'M 226 310 Q 256 340 286 310'}
            fill="none" stroke="#FFFFFF" strokeWidth="13" strokeLinecap="round"
            style={{ transition: 'd 0.25s ease' }} />
        )}
      </svg>
    </div>
  );
}
