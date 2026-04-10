import React, { useState } from 'react'

const ARTICLES = [
  {
    cat: 'LinkedIn Strategie', icon: '💼',
    items: [
      { title: 'Das perfekte LinkedIn-Profil', time: '5 Min', tags:['Profil','SEO'], content: 'Dein LinkedIn-Profil ist deine digitale Visitenkarte. Die wichtigsten Elemente:\n\n**Headline**: Nicht nur Jobtitel, sondern dein Nutzenversprechen. Statt "Sales Manager" → "Helfe B2B-Unternehmen, LinkedIn als Sales-Kanal zu nutzen".\n\n**About-Sektion**: Spreche direkt deinen Wunschkunden an. Erkläre welches Problem du löst und wie.\n\n**Featured Section**: Zeige Social Proof — Case Studies, Artikel, Empfehlungen.\n\n**Keywords**: Nutze relevante Begriffe damit du in der Suche gefunden wirst.' },
      { title: 'Social Selling Index (SSI) verbessern', time: '8 Min', tags:['SSI','Score'], content: 'Der SSI misst 4 Bereiche (je 0-25 Punkte):\n\n**1. Marke aufbauen (25 Pkt)**: Vollständiges Profil, regelmäßige Beiträge, Profilbesuche\n\n**2. Personen finden (25 Pkt)**: Suche nach Entscheidern, erweiterte Filter nutzen\n\n**3. Insights teilen (25 Pkt)**: Kommentare, Teilen, eigene Inhalte\n\n**4. Beziehungen aufbauen (25 Pkt)**: Nachrichten, Antwortrate, Netzwerkwachstum\n\n💡 Ziel: SSI ≥ 70 für effektives Social Selling.' },
      { title: 'Vernetzungsanfragen die angenommen werden', time: '6 Min', tags:['Vernetzung','Messaging'], content: 'Die Formel für eine erfolgreiche Vernetzungsanfrage:\n\n1. **Personalisierung**: Erwähne etwas Spezifisches (Artikel, gemeinsame Kontakte, Unternehmen)\n2. **Kurz halten**: Max. 2-3 Sätze\n3. **Kein Pitch**: Keine sofortige Verkaufsnachricht\n4. **Gemeinsamer Nenner**: Gruppe, Event, Interesse\n\n✅ Beispiel: "Hallo [Name], ich habe deinen Artikel über [Thema] gelesen und fand den Punkt über [X] sehr interessant. Würde mich freuen, mich zu vernetzen!"' },
    ]
  },
  {
    cat: 'Sales & CRM', icon: '📊',
    items: [
      { title: 'Lead Scoring richtig einsetzen', time: '7 Min', tags:['Scoring','CRM'], content: 'Der Leadesk Score berechnet sich aus:\n\n- **+30 Punkte**: Hohes Kaufinteresse (KI-Analyse)\n- **+20 Punkte**: LinkedIn-Verbindung bestätigt\n- **+15 Punkte**: Mittleres Kaufinteresse\n- **+10 Punkte**: In Pipeline / Need detected\n- **+5 Punkte**: Follow-up geplant\n\n**Score-Interpretation**:\n- 🔥 ≥ 70: Hot Lead — sofort handeln\n- ⚡ 40-69: Warm Lead — nurturing\n- ❄️ < 40: Cold Lead — regelmäßig melden\n\n💡 Tipp: Priorisiere täglich die Top-5 Hot Leads für persönliche Follow-ups.' },
      { title: 'Follow-up Strategie für B2B', time: '10 Min', tags:['Follow-up','Pipeline'], content: 'Studien zeigen: 80% der Deals erfordern 5+ Follow-ups, aber 44% der Verkäufer geben nach dem ersten auf.\n\n**Die 5-Touch Follow-up Sequenz**:\n1. Tag 1: Persönliche Vernetzungsnachricht\n2. Tag 3: Mehrwert teilen (Artikel, Tipp)\n3. Tag 7: Direkte Anfrage (Call/Meeting)\n4. Tag 14: Anderer Ansatz (LinkedIn Kommentar)\n5. Tag 21: Letzte Nachricht mit klarem CTA\n\n**Timing**: Di-Do, 8-10 Uhr oder 17-19 Uhr zeigen die höchsten Öffnungsraten.' },
      { title: 'Deal-Stages optimal nutzen', time: '5 Min', tags:['Pipeline','CRM'], content: 'Die 7 Deal-Stages in Leadesk:\n\n**Neu**: Kein Kontakt initiiert\n**Kontaktiert**: Erste Nachricht gesendet\n**Gespräch**: Aktive Kommunikation\n**Qualifiziert**: Bedarf bestätigt\n**Angebot**: Preisangebot/Proposal gesendet\n**Gewonnen**: Deal abgeschlossen 🎉\n**Verloren**: Deal nicht zustande gekommen\n\n💡 Best Practice: Setze für jede Stage einen Deal-Wert. Nur so kann Leadesk deinen gewichteten Pipeline-Wert korrekt berechnen.' },
    ]
  },
  {
    cat: 'Content & Posting', icon: '✍️',
    items: [
      { title: 'LinkedIn Algorithmus 2025', time: '8 Min', tags:['Content','Reichweite'], content: 'Der LinkedIn-Algorithmus bevorzugt:\n\n1. **Native Inhalte**: Texte direkt auf LinkedIn > Links zu externen Seiten\n2. **Engagement in den ersten 60 Min**: Je mehr Reaktionen kurz nach dem Post, desto mehr Reichweite\n3. **Kommentare > Likes**: Ein Kommentar bringt ~4x mehr Reichweite als ein Like\n4. **Konsistenz**: 3-5x pro Woche posten\n5. **Hooks**: Die ersten 2 Zeilen entscheiden ob jemand "Mehr" klickt\n\n**Beste Posting-Zeiten**: Di/Mi/Do 8-9 Uhr und 17-18 Uhr' },
      { title: 'Die 5 erfolgreichsten Post-Formate', time: '6 Min', tags:['Content','Formate'], content: '**1. Story-Posts**: Persönliche Erfahrung → Lerning → Takeaway\n**2. Listen-Posts**: "5 Dinge die ich gelernt habe…"\n**3. Kontroverse Meinung**: "Unpopular Opinion:…"\n**4. Behind-the-Scenes**: Einblick in deinen Arbeitsalltag\n**5. Milestone-Posts**: Erfolge feiern und teilen\n\n**Struktur eines viralen Posts**:\n- 🎯 Hook (Zeile 1-2)\n- 📖 Story/Content (Mitte)\n- 💡 Takeaway (Ende)\n- ❓ Call-to-Action (Frage ans Netzwerk)' },
    ]
  },
]

export default function Wissensdatenbank() {
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState(null)
  const [openArticle, setOpenArticle] = useState(null)

  const filtered = ARTICLES.map(cat => ({
    ...cat,
    items: cat.items.filter(a =>
      (!selectedCat || cat.cat === selectedCat) &&
      (!search || a.title.toLowerCase().includes(search.toLowerCase()) || a.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
    )
  })).filter(cat => cat.items.length > 0)

  const P = 'rgb(49,90,231)'

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'rgb(20,20,43)', margin: 0 }}>📚 Wissensdatenbank</h1>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>LinkedIn & Sales Best Practices für deinen Erfolg</div>
      </div>

      {/* Suche + Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Artikel suchen…"
          style={{ flex: 1, minWidth: 200, padding: '9px 14px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}/>
        {ARTICLES.map(cat => (
          <button key={cat.cat} onClick={() => setSelectedCat(selectedCat === cat.cat ? null : cat.cat)}
            style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              borderColor: selectedCat === cat.cat ? P : '#E2E8F0',
              background: selectedCat === cat.cat ? 'rgba(49,90,231,0.08)' : '#fff',
              color: selectedCat === cat.cat ? P : '#475569' }}>
            {cat.icon} {cat.cat}
          </button>
        ))}
      </div>

      {/* Artikel */}
      {filtered.map(cat => (
        <div key={cat.cat} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {cat.icon} {cat.cat}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {cat.items.map(article => (
              <div key={article.title} onClick={() => setOpenArticle(openArticle?.title === article.title ? null : article)}
                style={{ background: 'white', borderRadius: 14, border: `1.5px solid ${openArticle?.title === article.title ? P : '#E5E7EB'}`,
                  padding: '16px 18px', cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: openArticle?.title === article.title ? `0 0 0 3px rgba(49,90,231,0.1)` : '0 1px 3px rgba(0,0,0,0.05)' }}
                onMouseEnter={e => { if (openArticle?.title !== article.title) e.currentTarget.style.borderColor = '#C7D2FE' }}
                onMouseLeave={e => { if (openArticle?.title !== article.title) e.currentTarget.style.borderColor = '#E5E7EB' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'rgb(20,20,43)', lineHeight: 1.3, flex: 1 }}>{article.title}</div>
                  <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0, marginLeft: 8 }}>⏱ {article.time}</span>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {article.tags.map(t => (
                    <span key={t} style={{ fontSize: 10, fontWeight: 600, color: P, background: 'rgba(49,90,231,0.08)', padding: '2px 7px', borderRadius: 99 }}>{t}</span>
                  ))}
                </div>
                {openArticle?.title === article.title && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F1F5F9' }}>
                    {article.content.split('\n').map((line, i) => {
                      if (!line.trim()) return <div key={i} style={{ height: 8 }}/>
                      const bold = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                      return <div key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: bold }}/>
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
          <div style={{ fontWeight: 700, color: '#64748B', fontSize: 16 }}>Keine Artikel gefunden</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Versuche einen anderen Suchbegriff</div>
        </div>
      )}
    </div>
  )
}
