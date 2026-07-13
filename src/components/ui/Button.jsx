// src/components/ui/Button.jsx
// EINE zentrale, CI-konforme Button-Komponente. Ersetzt die dutzenden
// Ad-hoc-Inline-Button-Stile im ganzen Tool.
//
// Varianten:
//   cta    — Marken-Verlauf, NUR für den einen Haupt-CTA je Ansicht
//   navy   — solides CI-Navy (Standard für primäre Aktionen)
//   ghost  — weiß + Border, Hover→Cyan (sekundär)
//   danger — Rot (löschen/destruktiv)
// Größen: 'sm' | 'md' (default) | 'lg'
// Styling kommt aus .lk-btn* in index.css (inkl. echter :hover-States).

import React from 'react'

export default function Button({
  variant = 'navy',
  size = 'md',
  as: Tag = 'button',
  className = '',
  style,
  children,
  ...rest
}) {
  const cls = [
    'lk-btn',
    `lk-btn-${variant}`,
    size === 'lg' ? 'lk-btn-lg' : size === 'sm' ? 'lk-btn-sm' : '',
    className,
  ].filter(Boolean).join(' ')
  return (
    <Tag className={cls} style={style} {...rest}>
      {children}
    </Tag>
  )
}
