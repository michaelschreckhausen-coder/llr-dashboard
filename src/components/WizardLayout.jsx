// src/components/WizardLayout.jsx
// Premium-Wizard-Layout: volle Breite (920px), Sidebar mit vertikalen Steps links,
// grosser Content-Bereich rechts. Loest das "schmale Spalte in weisser Wueste"-Problem.
//
// Verwendung:
//   <WizardLayout
//     eyebrow="Branding · Schritt 1 von 3"
//     title="Neue Brand Voice mit KI"
//     subtitle="..."
//     steps={[{label:'Wer', active:true}, {label:'Stil'}, {label:'Beispiele'}]}
//     onSkip={...}
//   >
//     {step === 0 && <Step1Content/>}
//     ...
//   </WizardLayout>

import React from 'react'

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function WizardLayout({ eyebrow, title, subtitle, steps = [], currentStep = 1, onSkip, children, footer }) {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px 40px' }}>
      {/* Header */}
      <div style={{ textAlign: 'left', marginBottom: 26, maxWidth: 720 }}>
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
            fontSize: 28,
            fontWeight: 700,
            margin: 0,
            letterSpacing: '-0.4px',
            lineHeight: 1.15,
          }}>{title}</h1>
        )}
        {subtitle && (
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.6 }}>{subtitle}</p>
        )}
      </div>

      {/* Sidebar + Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 28, alignItems: 'start' }}>
        {/* Vertical Stepper */}
        <aside style={{
          position: 'sticky',
          top: 24,
          padding: '18px 14px',
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border, #E5E7EB)',
          borderRadius: 16,
          boxShadow: '0 1px 3px rgba(15,23,42,.04)',
        }}>
          <div style={{
            fontSize: 10.5,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            fontWeight: 700,
            marginBottom: 12,
            paddingLeft: 4,
          }}>Schritte</div>

          <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {steps.map((s, i) => {
              const stepNum = i + 1
              const isActive = stepNum === currentStep
              const isDone = stepNum < currentStep
              const isLast = i === steps.length - 1
              return (
                <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 10 }}>
                  {/* Connecting Line */}
                  {!isLast && (
                    <div style={{
                      position: 'absolute',
                      left: 14,
                      top: 30,
                      width: 2,
                      height: 'calc(100% - 18px)',
                      background: stepNum < currentStep ? P : '#E5E7EB',
                      borderRadius: 1,
                    }}/>
                  )}
                  {/* Step Item */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 4px',
                    borderRadius: 9,
                    background: isActive ? 'rgba(49,90,231,.06)' : 'transparent',
                    position: 'relative',
                    zIndex: 1,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: isActive ? P : isDone ? P : '#fff',
                      border: '2px solid ' + (isActive || isDone ? P : '#E5E7EB'),
                      color: isActive ? '#fff' : isDone ? '#fff' : '#9CA3AF',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11.5, fontWeight: 700,
                      transition: 'all .2s',
                      boxShadow: isActive ? '0 2px 8px rgba(49,90,231,.30)' : 'none',
                    }}>
                      {isDone ? '✓' : stepNum}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? P : isDone ? 'var(--text-primary)' : 'var(--text-muted)',
                        lineHeight: 1.3,
                      }}>{s.label}</div>
                      {s.sub && (
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>{s.sub}</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {onSkip && (
            <button
              onClick={onSkip}
              style={{
                marginTop: 18,
                width: '100%',
                padding: '8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'none',
                fontFamily: 'inherit',
                borderTop: '1px solid var(--border-soft, #F1F5F9)',
                paddingTop: 12,
              }}
              onMouseEnter={e => e.currentTarget.style.color = P}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              + Manuell erstellen
            </button>
          )}
        </aside>

        {/* Content */}
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
    </div>
  )
}
