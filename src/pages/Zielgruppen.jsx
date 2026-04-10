import React from 'react'

export default function Zielgruppen() {
  return (
    <div style={{ maxWidth: 640, margin: '60px auto', textAlign: 'center', padding: '0 24px' }}>

      {/* Icon */}
      <div style={{ fontSize: 64, marginBottom: 24 }}>🎯</div>

      {/* Headline */}
      <div style={{ fontSize: 26, fontWeight: 900, color: 'rgb(20,20,43)', marginBottom: 12 }}>
        Zielgruppen
      </div>

      {/* Badge */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 99, background: 'linear-gradient(135deg,rgb(49,90,231),#8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 24 }}>
        ✨ Demnächst verfügbar
      </div>

      {/* Description */}
      <div style={{ fontSize: 15, color: 'rgb(110,114,140)', lineHeight: 1.7, marginBottom: 32, maxWidth: 480, margin: '0 auto 32px' }}>
        Definiere deine Ideal Customer Profiles, erstelle Zielgruppen-Personas
        und lass die KI deine LinkedIn-Strategie darauf ausrichten.
      </div>

      {/* Feature-Vorschau Karten */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 480, margin: '0 auto', textAlign: 'left' }}>
        {[
          { icon: '🧑‍💼', title: 'ICP definieren', desc: 'Ideal Customer Profile mit Branche, Größe, Rolle' },
          { icon: '🎭', title: 'Personas erstellen', desc: 'Kundenpersönlichkeiten für zielgenaue Ansprache' },
          { icon: '📊', title: 'Zielgruppen-Analyse', desc: 'Welche Leads passen am besten zu deinem ICP?' },
          { icon: '🤖', title: 'KI-Nachrichten', desc: 'Automatisch auf Zielgruppe zugeschnittene Inhalte' },
        ].map(f => (
          <div key={f.title} style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{f.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgb(20,20,43)', marginBottom: 4 }}>{f.title}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

    </div>
  )
}
