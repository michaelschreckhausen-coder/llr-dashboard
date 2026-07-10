// src/components/EmptyOrb.jsx
// Website-getreue Pulsing-Rings-Animation für leere Screens (statt fettem Favicon).
// Drei konzentrische, pulsierende CI-Ringe um den bobbenden Gradient-Mark.
// Styles/Keyframes liegen global in index.css (.lk-orb / lk-ripple / lk-bob).
//
// Props:
//   size — Gesamtdurchmesser in px (Default 150)

import React from 'react'

export default function EmptyOrb({ size = 150, style }) {
  const scale = size / 150
  return (
    <div className="lk-orb" style={{ width: size, height: size, ...(style || {}) }} aria-hidden="true">
      <span className="lk-orb__ring" />
      <span className="lk-orb__ring" />
      <span className="lk-orb__ring" />
      <img
        className="lk-orb__mark"
        src="/favicon.svg"
        alt=""
        draggable={false}
        style={{ width: 82 * scale }}
      />
    </div>
  )
}
