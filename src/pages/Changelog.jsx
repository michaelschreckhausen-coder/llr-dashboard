import React, { useState } from 'react'

const RELEASES = [
  {
    version: 'v0.9',
    date: '13. April 2026',
    label: 'KI-Assistent & Whitelabel',
    color: '#7c3aed',
    badge: 'Neu',
    entries: [
      {
        cat: 'Neu',
        icon: '🤖',
        items: [
          'KI-Assistent (/assistant) — Chat-Interface wie GPT, antwortet auf Deutsch mit deinen Lead-Daten',
          'Assistent kennt alle Leads: Telefonnummern, Deal-Werte, Follow-ups, Stages, Scores',
          'Vorschlags-Chips für häufige Fragen + "Neues Gespräch"-Button',
          'Sicher: Anthropic Claude Haiku über Supabase Edge Function — kein API-Key im Browser',
          'Dashboard: KI-Assistent-Widget mit Schnellzugriff + Live-Daten',
        ]
      },
      {
        cat: 'Whitelabel',
        icon: '🎨',
        items: [
          'Multi-Tenant System: Kunden bekommen eigene Subdomain (acme.leadesk.de)',
          'Whitelabel-Settings: Logo, App-Name, Favicon, Primärfarbe, Sidebar-Farbe, Custom CSS',
          'Live-Vorschau beim Bearbeiten + sofortiger Sidebar-Update nach Speichern',
          'Super-Admin Tenant-Verwaltung (/admin/tenants): Anlegen, Bearbeiten, Aktivieren',
          '134 Primärfarben auf CSS-Variablen umgestellt — komplettes Farb-Theming',
          'SALESPLAY-Tenant mit eigenem Logo + Farbschema (schwarz/grau)',
        ]
      },
      {
        cat: 'Fixes',
        icon: '🔧',
        items: [
          'RLS-Policies für whitelabel_settings repariert (INSERT/UPDATE fehlgeschlagen)',
          'WhiteLabel lädt Settings jetzt per tenant_id statt Subdomain-Umweg',
          'Admin-Routen warten auf Role-Load statt vorzeitigem Redirect',
          'Assistent: Messages-Format für Anthropic API korrigiert (user-first)',
          'Edge Function Auth: SERVICE_ROLE_KEY statt ANON_KEY (JWT-Fehler behoben)',
        ]
      },
    ]
  },
  {
    version: 'v0.8',
    date: '12. April 2026',
    label: 'LeadDrawer Redesign & UX',
    color: 'rgb(49,90,231)',
    badge: null,
    entries: [
      {
        cat: 'LeadDrawer',
        icon: '📋',
        items: [
          'Komplett neu designt: Heller Header statt dunklem Gradient',
          '3 Tabs (statt 4): Übersicht · Aktivität · Profil',
          '3 KPI-Kacheln im Header: Score, Stage, Deal-Wert',
          '4 Quick-Actions: 📞 Anruf / 📅 Follow-up / ✏ Notiz / ↗ Profil',
          'Follow-up Schnellauswahl: Heute / Morgen / 3 / 7 / 14 Tage',
          'Deal-Details nur Speichern wenn Änderungen (formDirty)',
          'Notizen + Aktivitäten löschbar mit 🗑-Button',
        ]
      },
      {
        cat: 'Leads',
        icon: '👥',
        items: [
          'Neues Grid-Layout: Avatar-Spalte, Stage-Pills, Score-Balken',
          'Custom Listen-Dropdown + Custom Sortier-Dropdown',
          '···-Aktionsmenü: Anruf / Follow-up / Favorit / Liste / Team / Löschen',
          'Follow-up: relative Zeitanzeige (Heute, Morgen, in 3T, ⚠ überfällig)',
          'Hover-State auf Zeilen + indeterminate Checkbox-State',
          'Suche, Filter-Chips (🔥 Hot / 💼 Pipeline / ⭐ Favoriten)',
        ]
      },
      {
        cat: 'Umbenennung',
        icon: '✏️',
        items: [
          '"HubSpot Score" → "Leadesk Score" überall',
          '"CRM Enrichment" → "Lead Intelligence" (Menü + Seite)',
        ]
      },
    ]
  },
  {
    version: 'v0.7',
    date: '9.–10. April 2026',
    label: 'Team-Sharing & Mobile',
    color: '#059669',
    badge: null,
    entries: [
      {
        cat: 'Team-Features',
        icon: '👥',
        items: [
          'Team-Sharing: Leads mit Team teilen — 👥 Button im LeadDrawer',
          'TeamContext + useTeam() Hook überall verfügbar',
          'Team-Widget im Dashboard: Mitglieder + geteilte Leads',
          'TeamSettings: Geteilt-Tab mit Übersicht aller geteilten Leads',
        ]
      },
      {
        cat: 'Mobile',
        icon: '📱',
        items: [
          'Burger-Menü für iPhone / kleine Bildschirme',
          'Leads + Pipeline mobiloptimiert',
          'Sidebar kollabiert auf Mobile automatisch',
        ]
      },
      {
        cat: 'Pipeline',
        icon: '📊',
        items: [
          '7-Stage Kanban mit Drag & Drop zwischen Spalten',
          'Listen-View als Alternative',
          'Deal-Wahrscheinlichkeit pro Stage, gewichteter Gesamtwert',
          'Dashboard Wochenziele editierbar',
        ]
      },
    ]
  },
  {
    version: 'v0.6',
    date: '2. April 2026',
    label: 'Fundament & Kernfeatures',
    color: '#64748B',
    badge: null,
    entries: [
      {
        cat: 'Features',
        icon: '⚙️',
        items: [
          'app.leadesk.de live (Vercel + Supabase)',
          'Dashboard mit anpassbaren Widgets',
          'Leads-Tabelle mit CSV-Import',
          'Pipeline Kanban-Board',
          'Vernetzungen mit Batch-Messaging',
          'Reports (6 Tabs: Funnel, Score, Follow-up, Stage, Intent, Aktivität)',
          'Brand Voice + Content Studio',
          'SSI Tracker mit Chart',
          'Admin-Panel: Benutzerverwaltung, Lizenzen, Logs',
          'LinkedIn Profiloptimierer (KI)',
          'Notifications-System',
        ]
      },
    ]
  },
]

const CAT_COLORS = {
  'Neu':         { bg: '#EEF2FF', color: 'rgb(49,90,231)', border: '#C7D2FE' },
  'Whitelabel':  { bg: '#F5F3FF', color: '#7c3aed',        border: '#DDD6FE' },
  'Fixes':       { bg: '#FFF7ED', color: '#EA580C',        border: '#FED7AA' },
  'LeadDrawer':  { bg: '#EFF6FF', color: 'rgb(49,90,231)', border: '#BFDBFE' },
  'Leads':       { bg: '#F0FDF4', color: '#059669',        border: '#A7F3D0' },
  'Umbenennung': { bg: '#F8FAFC', color: '#64748B',        border: '#E2E8F0' },
  'Team-Features':{ bg: '#F0FDF4', color: '#059669',       border: '#A7F3D0' },
  'Mobile':      { bg: '#FFF7ED', color: '#EA580C',        border: '#FED7AA' },
  'Pipeline':    { bg: '#EEF2FF', color: 'rgb(49,90,231)', border: '#C7D2FE' },
  'Features':    { bg: '#F8FAFC', color: '#475569',        border: '#E2E8F0' },
}

export default function Changelog() {
  const [expanded, setExpanded] = useState({ 'v0.9': true, 'v0.8': true })

  function toggle(v) {
    setExpanded(p => ({ ...p, [v]: !p[v] }))
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', paddingBottom: 64 }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
          Changelog
        </div>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
          Release-History von Leadesk — alle Features, Fixes und Verbesserungen
        </div>
      </div>

      {/* Releases */}
      {RELEASES.map((rel, ri) => (
        <div key={rel.version} style={{ marginBottom: 24 }}>

          {/* Release Header */}
          <div
            onClick={() => toggle(rel.version)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: expanded[rel.version] ? 14 : 0, cursor: 'pointer', padding: '12px 16px', background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow='none'}
          >
            {/* Version pill */}
            <div style={{ padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 800, background: rel.color, color: '#fff', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              {rel.version}
            </div>

            {/* Label + date */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                {rel.label}
                {rel.badge && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', letterSpacing: '0.05em' }}>
                    {rel.badge}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{rel.date}</div>
            </div>

            {/* Expand arrow */}
            <div style={{ fontSize: 16, color: '#94A3B8', transform: expanded[rel.version] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>›</div>
          </div>

          {/* Entries */}
          {expanded[rel.version] && (
            <div style={{ paddingLeft: 16, borderLeft: `3px solid ${rel.color}20`, marginLeft: 8 }}>
              {rel.entries.map((section, si) => {
                const cc = CAT_COLORS[section.cat] || CAT_COLORS['Features']
                return (
                  <div key={si} style={{ marginBottom: si < rel.entries.length - 1 ? 16 : 0, marginTop: 14 }}>
                    {/* Category */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>{section.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: cc.bg, color: cc.color, border: `1px solid ${cc.border}`, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        {section.cat}
                      </span>
                    </div>

                    {/* Items */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {section.items.map((item, ii) => (
                        <div key={ii} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                          <span style={{ color: '#94A3B8', flexShrink: 0, marginTop: 1 }}>–</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}

      {/* Footer */}
      <div style={{ marginTop: 32, padding: '14px 18px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12, color: '#64748B', textAlign: 'center' }}>
        Leadesk wird aktiv weiterentwickelt · GitHub: michaelschreckhausen-coder/llr-dashboard
      </div>
    </div>
  )
}
