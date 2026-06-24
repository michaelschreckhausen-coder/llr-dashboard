// Bibliothek — fasst Dokumente, Designs und Medien auf einer Seite zusammen.
// Drei Tabs/Kästen, die die bestehenden Views wiederverwenden:
//   • Dokumente → Documents
//   • Designs   → Visuals (kind='design')
//   • Medien    → Visuals (kind='image', inkl. Uploads)
import React, { useState } from 'react'
import { FileText, LayoutTemplate, Image as ImageIcon } from 'lucide-react'
import Documents from './Documents'
import Visuals from './Visuals'

const P = 'var(--wl-primary, rgb(49,90,231))'

const TABS = [
  { id: 'designs',   label: 'Designs',   Icon: LayoutTemplate },
  { id: 'medien',    label: 'Medien',    Icon: ImageIcon },
  { id: 'dokumente', label: 'Dokumente', Icon: FileText },
]

export default function Bibliothek({ session }) {
  const [tab, setTab] = useState('designs')
  return (
    <div style={{ padding: '0' }}>
      <div style={{ padding: '0 0 4px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: P, letterSpacing: '0.01em' }}>Content</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '2px 0 4px', color: 'var(--text-primary)' }}>Bibliothek</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Deine Dokumente, Designs und Medien an einem Ort.</div>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '16px 0 8px', borderBottom: '1px solid var(--border,#E9ECF2)' }}>
        {TABS.map(t => {
          const on = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', border: 'none',
                borderBottom: '2px solid ' + (on ? P : 'transparent'), background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? 800 : 600, color: on ? P : 'var(--text-muted,#667085)', marginBottom: -1 }}>
              <t.Icon size={16} strokeWidth={on ? 2.2 : 1.9} />{t.label}
            </button>
          )
        })}
      </div>

      <div>
        {tab === 'designs' && <Visuals session={session} kindFilter="design" embedded />}
        {tab === 'medien' && <Visuals session={session} kindFilter="image" embedded />}
        {tab === 'dokumente' && <Documents embedded />}
      </div>
    </div>
  )
}
