// src/components/Form.jsx
// Premium-Form-Primitives fuer den Branding-Bereich.
// Konsistenter Look ueber alle Editoren, weg vom Google-Forms-Stil:
// - subtile 1.5px Borders
// - sanfter Focus-Ring (Markenblau)
// - groessere Touchziele
// - Label mit optionaler Hilfetext-Zeile
// - Field-Wrapper mit konsistentem Spacing
//
// Verwendung:
//   <Field label="Markenname" help="Wie soll deine Marke heissen?">
//     <Input value={x} onChange={setX} placeholder="..."/>
//   </Field>
//   <Field label="Mission" help="In 1-2 Saetzen">
//     <Textarea v={x} onChange={setX} rows={3}/>
//   </Field>

import React from 'react'

const P = 'var(--wl-primary, #0A6FB0)'

// ─── Card-Wrapper (Section) ────────────────────────────────────────
export function Section({ title, subtitle, children, style={}, padded=true }) {
  return (
    <section style={{
      background: 'var(--surface, #fff)',
      borderRadius: 14,
      border: '1px solid var(--border, #E5E7EB)',
      marginBottom: 16,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      ...style,
    }}>
      {(title || subtitle) && (
        <header style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-soft, #F1F5F9)',
        }}>
          {title && <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing:'-.1px' }}>{title}</div>}
          {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight:1.5 }}>{subtitle}</div>}
        </header>
      )}
      <div style={{ padding: padded ? '18px 20px' : 0 }}>{children}</div>
    </section>
  )
}

// ─── Label + Help ──────────────────────────────────────────────────
export function Field({ label, help, children, style={} }) {
  return (
    <div style={{ marginBottom: 18, ...style }}>
      {(label || help) && (
        <div style={{ marginBottom: 8 }}>
          {label && (
            <div style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--text-muted, #6B7280)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              marginBottom: 3,
            }}>{label}</div>
          )}
          {help && (
            <div style={{ fontSize: 12, color: 'var(--text-soft, #9CA3AF)', lineHeight: 1.5 }}>{help}</div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

// ─── Input ──────────────────────────────────────────────────────────
const inputBase = {
  width: '100%',
  padding: '11px 14px',
  border: '1.5px solid var(--border, #E5E7EB)',
  borderRadius: 10,
  fontSize: 13.5,
  background: 'var(--surface, #fff)',
  color: 'var(--text-primary, rgb(20,20,43))',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color .15s, box-shadow .15s',
  fontFamily: 'inherit',
}

export function Input({ value, onChange, placeholder, type='text', disabled, style={}, ...rest }) {
  const [focused, setFocused] = React.useState(false)
  const v = typeof onChange === 'function' ? value || '' : value
  return (
    <input
      type={type}
      value={v}
      disabled={disabled}
      onChange={e => onChange && onChange(typeof rest.rawEvent === 'function' ? e : e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputBase,
        borderColor: focused ? P : 'var(--border, #E5E7EB)',
        boxShadow: focused ? `0 0 0 3px rgba(10,111,176,.10)` : 'none',
        opacity: disabled ? .6 : 1,
        ...style,
      }}
      {...rest}
    />
  )
}

// ─── Textarea ───────────────────────────────────────────────────────
export function Textarea({ value, onChange, placeholder, rows=4, disabled, style={}, ...rest }) {
  const [focused, setFocused] = React.useState(false)
  return (
    <textarea
      value={value || ''}
      disabled={disabled}
      onChange={e => onChange && onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputBase,
        resize: 'vertical',
        lineHeight: 1.55,
        borderColor: focused ? P : 'var(--border, #E5E7EB)',
        boxShadow: focused ? `0 0 0 3px rgba(10,111,176,.10)` : 'none',
        opacity: disabled ? .6 : 1,
        ...style,
      }}
      {...rest}
    />
  )
}

// ─── Select ─────────────────────────────────────────────────────────
export function Select({ value, onChange, children, disabled, style={} }) {
  const [focused, setFocused] = React.useState(false)
  return (
    <select
      value={value || ''}
      disabled={disabled}
      onChange={e => onChange && onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputBase,
        appearance: 'none',
        WebkitAppearance: 'none',
        cursor: 'pointer',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' stroke='%236B7280' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 14px center',
        paddingRight: 36,
        borderColor: focused ? P : 'var(--border, #E5E7EB)',
        boxShadow: focused ? `0 0 0 3px rgba(10,111,176,.10)` : 'none',
        opacity: disabled ? .6 : 1,
        ...style,
      }}
    >
      {children}
    </select>
  )
}

// ─── Button ─────────────────────────────────────────────────────────
export function PrimaryButton({ children, onClick, disabled, loading, icon, style={}, type='button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="lk-btn lk-btn-primary"
      style={style}
    >
      {loading ? null : icon ? <span>{icon}</span> : null}
      <span>{loading ? 'Lade…' : children}</span>
    </button>
  )
}

export function SecondaryButton({ children, onClick, disabled, icon, style={}, type='button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="lk-btn lk-btn-ghost"
      style={style}
    >
      {icon && <span>{icon}</span>}
      <span>{children}</span>
    </button>
  )
}

// ─── Sticky Action Bar (Footer) ────────────────────────────────────
// Klebt am unteren Rand des Containers wenn der Inhalt lang genug ist —
// damit der Save-Button immer erreichbar bleibt.
export function ActionBar({ children, align='space-between' }) {
  return (
    <div style={{
      position: 'sticky',
      bottom: 0,
      background: 'var(--surface, #fff)',
      borderTop: '1px solid var(--border, #E5E7EB)',
      padding: '14px 20px',
      marginTop: 20,
      marginLeft: -20,
      marginRight: -20,
      marginBottom: -20,
      display: 'flex',
      gap: 10,
      justifyContent: align,
      alignItems: 'center',
      boxShadow: '0 -4px 14px rgba(15,23,42,.04)',
      zIndex: 5,
    }}>{children}</div>
  )
}

// ─── Page-Header (Journal-Style) ───────────────────────────────────
export function PageHeader({ eyebrow, title, subtitle, action, style={} }) {
  return (
    <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', ...style }}>
      <div style={{ flex: '1 1 auto', minWidth: 240 }}>
        {eyebrow && (
          <div style={{ fontSize:12, fontWeight:700, letterSpacing:'1.6px', textTransform:'uppercase', fontFamily:'Inter, sans-serif', color:'var(--primary, #003060)', marginBottom:6 }}>{eyebrow}</div>
        )}
        {title && (
          <h1 style={{
            fontSize: 26,
            fontWeight: 700,
            margin: 0,
            letterSpacing: '-0.3px',
            lineHeight: 1.2,
            color: 'var(--text-primary, rgb(20,20,43))',
          }}>{title}</h1>
        )}
        {subtitle && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.6, maxWidth: 560 }}>{subtitle}</p>
        )}
      </div>
      {action && <div style={{ flex: '0 0 auto' }}>{action}</div>}
    </div>
  )
}
