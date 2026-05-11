// src/components/WizardLayout.jsx
// Premium-Wizard-Layout: GLEICHE Breite wie alle anderen Branding-Pages.
// Horizontal-Stepper oben (Pills) statt Sidebar links, damit der Content
// die volle 1100px-Breite bekommt - exakt wie List/Editor.
//
// Verwendung:
//   <WizardLayout
//     eyebrow="Branding · Schritt 1 von 3"
//     title="Neue Brand Voice mit KI"
//     subtitle="..."
//     steps={[{label:'Wer'}, {label:'Stil'}, {label:'Beispiele'}]}
//     currentStep={1}
//     onSkip={...}
//   >
//     {step === 0 && <Step1Content/>}
//     ...
//   </WizardLayout>

import React from 'react'

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function WizardLayout({ eyebrow, title, subtitle, steps = [], currentStep = 1, onSkip, children, footer }) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      {/* Header */}
      <div style={{ textAlign: 'left', marginBottom: 18, maxWidth: 720 }}>
        {eyebrow && (
          <div style={{
            fontSize: 13,
            color: P,
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontStyle: 'italic',
            marginBottom: 6,
          }}>{eyebrow}</div>
        )}
        {title && (
          <h1 style={{
            fontSize: 26,
            fontWeight: 700,
            margin: 0,
            letterSpacing: '-0.3px',
            lineHeight: 1.2,
          }}>{title}</h1>
        )}
        {subtitle && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.6 }}>{subtitle}</p>
        )}
      </div>

      {/* Horizontal-Stepper (Pills + Connectors) */}
      {steps.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          marginBottom: 22,
          padding: '14px 18px',
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border, #E5E7EB)',
          borderRadius: 14,
          boxShadow: '0 1px 3px rgba(15,23,42,.04)',
          flexWrap: 'wrap',
        }}>
          {steps.map((s, i) => {
            const stepNum = i + 1
            const isActive = stepNum === currentStep
            const isDone = stepNum < currentStep
            const isLast = i === steps.length - 1
            return (
              <React.Fragment key={i}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '4px 12px 4px 4px',
                  borderRadius: 24,
                  background: isActive ? 'rgba(49,90,231,.08)' : 'transparent',
                  transition: 'all .2s',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: isActive ? P : isDone ? P : '#fff',
                    border: '2px solid ' + (isActive || isDone ? P : '#E5E7EB'),
                    color: isActive ? '#fff' : isDone ? '#fff' : '#9CA3AF',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11.5, fontWeight: 700,
                    boxShadow: isActive ? '0 2px 8px rgba(49,90,231,.30)' : 'none',
                  }}>
                    {isDone ? '✓' : stepNum}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? P : isDone ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}>{s.label}</span>
                    {s.sub && (
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{s.sub}</span>
                    )}
                  </div>
                </div>

                {!isLast && (
                  <div style={{
                    flex: 1,
                    minWidth: 24,
                    height: 2,
                    background: stepNum < currentStep ? P : 'var(--border, #E5E7EB)',
                    margin: '0 8px',
                    borderRadius: 1,
                  }}/>
                )}
              </React.Fragment>
            )
          })}

          {onSkip && (
            <button
              onClick={onSkip}
              style={{
                marginLeft: 'auto',
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--border, #E5E7EB)',
                borderRadius: 8,
                color: 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = P; e.currentTarget.style.borderColor = P }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border, #E5E7EB)' }}
            >
              + Manuell erstellen
            </button>
          )}
        </div>
      )}

      {/* Content - VOLLE Breite */}
      <main style={{ minWidth: 0 }}>
        {children}
        {footer && (
          <div style={{
            position: 'sticky',
            bottom: 0,
            background: 'var(--surface, #fff)',
            borderTop: '1.5px solid var(--border, #E5E7EB)',
            padding: '14px 0',
            marginTop: 20,
            display: 'flex',
            gap: 10,
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 -4px 14px rgba(15,23,42,.05)',
            zIndex: 5,
          }}>
            {footer}
          </div>
        )}
      </main>
    </div>
  )
}
