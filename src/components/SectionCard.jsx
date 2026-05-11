// src/components/SectionCard.jsx
// Premium Section-Card mit thematischem Icon-Avatar.
// Jede Section bekommt eine "Identität" durch Gradient-Background im Themen-Farbton.
//
// Verwendung:
//   <SectionCard
//     icon="🏢"
//     color="blue"
//     title="Markenidentität"
//     subtitle="Wer ist deine Marke, wofür stehst du"
//   >
//     <Field>...</Field>
//   </SectionCard>

import React from 'react'

const COLOR_THEMES = {
  blue:   { bg: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', text: '#1E40AF', shadow: 'rgba(30, 64, 175, .12)' },
  pink:   { bg: 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)', text: '#9D174D', shadow: 'rgba(157, 23, 77, .10)' },
  purple: { bg: 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)', text: '#5B21B6', shadow: 'rgba(91, 33, 182, .12)' },
  green:  { bg: 'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)', text: '#065F46', shadow: 'rgba(6, 95, 70, .10)' },
  amber:  { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', text: '#92400E', shadow: 'rgba(146, 64, 14, .10)' },
  teal:   { bg: 'linear-gradient(135deg, #CCFBF1 0%, #99F6E4 100%)', text: '#115E59', shadow: 'rgba(17, 94, 89, .10)' },
  coral:  { bg: 'linear-gradient(135deg, #FFE4E6 0%, #FECDD3 100%)', text: '#9F1239', shadow: 'rgba(159, 18, 57, .10)' },
  brand:  { bg: 'linear-gradient(135deg, rgba(49,90,231,.18) 0%, rgba(124,58,237,.14) 100%)', text: 'rgb(49,90,231)', shadow: 'rgba(49,90,231,.16)' },
}

export default function SectionCard({ icon, color = 'blue', title, subtitle, children, padding = '22px 24px', style = {} }) {
  const theme = COLOR_THEMES[color] || COLOR_THEMES.blue
  return (
    <section style={{
      background: 'var(--surface, #fff)',
      borderRadius: 16,
      border: '1px solid var(--border, #E5E7EB)',
      marginBottom: 16,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(15,23,42,.04)',
      ...style,
    }}>
      <header style={{
        padding: '18px 22px',
        borderBottom: '1px solid var(--border-soft, #F1F5F9)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        {icon && (
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: theme.bg,
            color: theme.text,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
            boxShadow: `0 2px 8px ${theme.shadow}`,
          }}>
            {icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && (
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text-primary, rgb(20,20,43))',
              letterSpacing: '-0.15px',
              lineHeight: 1.3,
            }}>{title}</div>
          )}
          {subtitle && (
            <div style={{
              fontSize: 12.5,
              color: 'var(--text-muted, #6B7280)',
              marginTop: 3,
              lineHeight: 1.5,
            }}>{subtitle}</div>
          )}
        </div>
      </header>
      <div style={{
        padding,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>{children}</div>
    </section>
  )
}
