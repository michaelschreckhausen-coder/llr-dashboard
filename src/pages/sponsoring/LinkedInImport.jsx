// Sponsoring OS — LinkedIn-/CSV-Import (Phase 3, Modul 12)
// Paste aus Sales Navigator / CSV → Vorschau → Bulk-Insert sponsor_profiles.
// Reiner Client-Import (RLS schützt). Schema 'sponsoring'.
//
// Erwartetes Format pro Zeile (Komma- ODER Tab-getrennt):
//   Name, Branche, Region, Website, LinkedIn-URL
// Nur "Name" ist Pflicht; weitere Spalten optional.

import { useState } from 'react'
import { Loader2, Upload, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'

// Brand-Glyph: lucide-react@1.14.0 exportiert kein 'Linkedin' (siehe
// Icon-Convention-Drift in CLAUDE.md) → lokales Inline-SVG-Fallback.
function Linkedin({ size = 24, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
}

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const sp = () => supabase.schema('sponsoring')

function parse(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.includes('\t') ? line.split('\t') : line.split(',')
    const [name, industry, region, website, linkedin_url] = parts.map((p) => (p || '').trim())
    return { name, industry: industry || null, region: region || null, website: website || null, linkedin_url: linkedin_url || null }
  }).filter((r) => r.name)
}

export default function LinkedInImport() {
  const { activeTeamId } = useTeam()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const rows = parse(text)

  async function importRows() {
    if (!activeTeamId || rows.length === 0) return
    setBusy(true); setError(null); setDone(null)
    const payload = rows.map((r) => ({ ...r, team_id: activeTeamId, status: 'lead' }))
    const { error: e } = await sp().from('sponsor_profiles').insert(payload)
    if (e) { setError(e.message); setBusy(false); return }
    setDone(rows.length); setText(''); setBusy(false)
  }

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="Sponsoring"
        title="LinkedIn-Import"
        subtitle={<>
          Füge Unternehmen aus Sales Navigator oder einer CSV ein — eine Zeile pro Sponsor, Komma- oder Tab-getrennt:
          <br /><code style={{ fontSize: 12.5 }}>Name, Branche, Region, Website, LinkedIn-URL</code>
        </>}
      />
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 20px', maxWidth: 680, lineHeight: 1.6 }}>
        Hinweis: Bei verbundenem Leadesk lässt sich stattdessen die bestehende Chrome-Extension nutzen (Sales-Navigator-Listen direkt übernehmen).
      </p>

      {error && <div style={errBox}>{error}</div>}
      {done != null && <div style={okBox}><Check size={14} style={{ verticalAlign: -2 }} /> {done} Sponsor(en) importiert.</div>}

      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
        placeholder={'Beispiel AG, Versicherung, Bayern, beispiel.de, linkedin.com/company/beispiel\nMuster GmbH, IT, NRW'}
        style={{ ...input, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{rows.length} erkannte Zeile(n)</span>
        <button onClick={importRows} disabled={busy || rows.length === 0} style={{ ...primaryBtn, opacity: busy || rows.length === 0 ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {rows.length} importieren
        </button>
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 18, border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--surface-muted, #F8FAFC)', textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={th}>Name</th><th style={th}>Branche</th><th style={th}>Region</th><th style={th}>Website</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{r.name}</td>
                  <td style={td}>{r.industry || '—'}</td>
                  <td style={td}>{r.region || '—'}</td>
                  <td style={td}>{r.website || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>… und {rows.length - 50} weitere</div>}
        </div>
      )}
    </div>
  )
}

const input = { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', width: '100%', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const th = { padding: '9px 14px', fontWeight: 600, fontSize: 12 }
const td = { padding: '9px 14px', color: 'var(--text-strong)' }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
const okBox = { padding: '10px 14px', borderRadius: 10, background: '#D1FAE5', color: '#065F46', fontSize: 13, marginBottom: 16 }
