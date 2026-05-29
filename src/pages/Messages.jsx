// src/pages/Messages.jsx
// Wartungs-Placeholder — temporär aktiv während des Messages-Redesigns.
//
// Hintergrund: linkedin_messages-Tabelle wurde von Legacy-Schema (recipient_*, message_text,
// message_type, rating) auf Conversation-Schema (team_id, lead_id, direction, content,
// is_ai_generated, brand_voice_id) umgestellt. Das Legacy-Frontend (583 Zeilen Generator+Archiv)
// würde mit "column does not exist" crashen. Statt defensive Guards in dead-code einzubauen,
// wird die Page hier neutralisiert bis das Redesign (ContentStudio-Pattern, 3 Nachrichtentypen
// Vernetzung/First Message/Sales Pitch) fertig ist.
//
// Vorheriger Code: siehe git history, commit unmittelbar vor diesem Placeholder.

import React from 'react'

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function Messages({ session }) {
  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Journal-Header (konsistent mit ContentStudio-Pattern) */}
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>
          LinkedIn · Nachricht
        </div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2, color:'var(--text-primary, rgb(20,20,43))' }}>
          Die Nachrichten-Werkstatt wird umgebaut.
        </h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6, maxWidth:560 }}>
          Wir bauen die Nachrichten-Generierung gerade neu — mit drei Typen (Vernetzung, First Message, Sales Pitch),
          Lead-Auswahl aus dem CRM und Zielgruppen-Anreicherung.
        </p>
      </div>

      {/* Info-Card */}
      <div style={{
        background:'var(--surface)',
        border:'1px solid var(--border)',
        borderRadius:14,
        padding:'28px 28px',
      }}>
        <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', marginBottom:10 }}>
          Was du in der Zwischenzeit tun kannst
        </div>
        <ul style={{ margin:'0 0 18px', paddingLeft:18, fontSize:13, color:'var(--text-muted)', lineHeight:1.7 }}>
          <li>LinkedIn-<strong>Posts</strong> generierst du wie gewohnt im <a href="/content-studio" style={{ color:P, fontWeight:600 }}>Content Studio</a>.</li>
          <li><strong>Vernetzungen</strong> startest du weiterhin aus der <a href="/vernetzungen" style={{ color:P, fontWeight:600 }}>Vernetzungs-Liste</a> oder aus einem <a href="/leads" style={{ color:P, fontWeight:600 }}>Lead-Profil</a>.</li>
          <li>Bestehende Vernetzungs-Kampagnen laufen unverändert in der <a href="/automatisierung" style={{ color:P, fontWeight:600 }}>Automatisierung</a> weiter.</li>
        </ul>

        <div style={{
          marginTop:18,
          padding:'12px 14px',
          background:'rgb(238,241,252)',
          borderRadius:9,
          fontSize:12,
          color:'#475569',
          lineHeight:1.55,
        }}>
          <strong style={{ color:'rgb(20,20,43)' }}>Hinweis:</strong> Die Tabelle für gespeicherte
          Nachrichten wurde gerade auf ein neues Schema migriert. Die neue Page kommt in den nächsten
          Tagen und bringt direkte Lead-Verknüpfung, Brand-Voice- und Zielgruppen-Auswahl und einen
          Aktivitäts-Feed pro Lead.
        </div>
      </div>
    </div>
  )
}
