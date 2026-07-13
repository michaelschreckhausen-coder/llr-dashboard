// LeadsImports — Sales-Nav-Import-Historie (Phase 6, Route /leads/imports).
// Read-only Job-Monitor: Liste der sales_nav_import_jobs (team-gescopet via Hook),
// Status-Pill + Progress-Bar + Detail-Modal. Realtime + 5s-Fallback-Polling.
// Hinweis: Re-Try einzelner Failed-Leads ist NICHT implementiert — das Schema
// speichert nur failed_leads (Count), keine Failed-URL-Liste. Stattdessen:
// source_url als Link → User kann die Suche erneut in der Extension starten.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useImportJobs } from '../hooks/useImportJobs'
import { useAddons } from '../hooks/useAddons'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const ADDON_SLUG = 'sales-nav-sync'

const JOB_STATUS = {
  queued:    { label: 'In Warteschlange', bg: '#FEF3C7', fg: '#92400E' },
  running:   { label: 'Läuft',            bg: '#DBEAFE', fg: '#1E40AF' },
  paused:    { label: 'Pausiert',         bg: '#FEF3C7', fg: '#92400E' },
  done:      { label: 'Abgeschlossen',    bg: '#D1FAE5', fg: '#065F46' },
  failed:    { label: 'Fehler',           bg: '#FEE2E2', fg: '#7F1D1D' },
  cancelled: { label: 'Abgebrochen',      bg: '#F1F5F9', fg: '#475569' },
}
const SOURCE_LABEL = {
  saved_search: 'Gespeicherte Suche',
  single: 'Einzel-Import',
  list: 'Lead-Liste',
}

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) } catch (e) { return s }
}

function StatusPill({ status }) {
  const cfg = JOB_STATUS[status] || { label: status, bg: '#F1F5F9', fg: '#475569' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 999, background: cfg.bg, color: cfg.fg, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function ProgressBar({ processed, total, failed, status }) {
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0
  const barColor = status === 'failed' ? '#EF4444' : status === 'done' ? '#10B981' : PRIMARY
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 6, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: barColor, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
        {processed} / {total} verarbeitet{failed > 0 ? ` · ${failed} Fehler` : ''}
      </div>
    </div>
  )
}

function JobDetailModal({ job, onClose }) {
  if (!job) return null
  const cfg = JOB_STATUS[job.status] || {}
  const rows = [
    ['Status', cfg.label || job.status],
    ['Quelle', SOURCE_LABEL[job.source_type] || job.source_type],
    ['Gesamt', job.total_leads],
    ['Verarbeitet', job.processed_leads],
    ['Fehler', job.failed_leads],
    ['Erstellt', fmtDate(job.created_at)],
    ['Aktualisiert', fmtDate(job.updated_at)],
  ]
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,0.18)', width: 460, maxWidth: '95vw', maxHeight: '85vh', overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Import-Job</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer', color: '#64748B', lineHeight: 1 }} aria-label="Schließen">×</button>
        </div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '7px 0', color: '#64748B', width: 120 }}>{k}</td>
                <td style={{ padding: '7px 0', fontWeight: 500 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {job.error_message && (
          <div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: '#FEE2E2', color: '#7F1D1D', fontSize: 12, whiteSpace: 'pre-wrap' }}>{job.error_message}</div>
        )}
        {job.rate_limit_until && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#92400E' }}>Rate-Limit bis {fmtDate(job.rate_limit_until)}</div>
        )}
        {job.source_url && (
          <a href={job.source_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 16, fontSize: 13, color: PRIMARY, fontWeight: 500, textDecoration: 'none' }}>
            Suche in Sales Navigator öffnen ↗
          </a>
        )}
        {job.failed_leads > 0 && (
          <div style={{ marginTop: 14, fontSize: 12, color: '#64748B' }}>
            Erneuter Import: die Suche oben öffnen und in der Chrome-Extension neu starten.
            <br />(Einzel-Lead-Re-Try folgt in einem späteren Update.)
          </div>
        )}
      </div>
    </div>
  )
}

function JobCard({ job, onDetails }) {
  return (
    <div style={{ border: '0.5px solid #E2E8F0', borderRadius: 12, padding: 16, background: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <StatusPill status={job.status} />
            <span style={{ fontSize: 12, color: '#64748B' }}>{SOURCE_LABEL[job.source_type] || job.source_type}</span>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{fmtDate(job.created_at)}</div>
        </div>
        <button className="lk-btn lk-btn-ghost" onClick={() => onDetails(job)} style={{ whiteSpace: 'nowrap' }}>
          Details
        </button>
      </div>
      <ProgressBar processed={job.processed_leads} total={job.total_leads} failed={job.failed_leads} status={job.status} />
    </div>
  )
}

export default function LeadsImports() {
  const { subscribedSlugs, isLoading: addonsLoading } = useAddons()
  const { jobs, isLoading } = useImportJobs()
  const [detail, setDetail] = useState(null)
  const hasAddon = subscribedSlugs?.has?.(ADDON_SLUG) || false

  // Gate: Sales-Nav-Sync muss aktiviert sein (Marketplace). Bis dahin Upsell.
  if (!addonsLoading && !hasAddon) {
    return (
      <div style={{ padding: '24px 28px', maxWidth: 560, margin: '0 auto' }}>
        <div style={{ border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: 14, padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🎁</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 10px' }}>Sales Navigator Sync aktivieren</h1>
          <p style={{ fontSize: 14, color: '#92400E', lineHeight: 1.6, margin: '0 0 8px' }}>
            Importiere komplette Sales-Navigator-Suchen mit einem Klick — bis zu 500 Leads in
            wenigen Sekunden. Plus Single-Lead-Import direkt aus Sales-Nav-Profilen.
          </p>
          <p style={{ fontSize: 13, color: '#B45309', margin: '0 0 22px' }}>Kostenfrei bis 31. August 2026.</p>
          <Link to="/marketplace" style={{ display: 'inline-block', background: PRIMARY, color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 14, padding: '11px 22px', borderRadius: 10 }}>
            Im Marketplace aktivieren →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Import-Historie</h1>
      <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 22px' }}>
        Sales-Navigator-Importe deines Teams. Laufende Jobs aktualisieren sich automatisch.
      </p>

      {isLoading ? (
        <div style={{ fontSize: 13, color: '#94A3B8', padding: '40px 0', textAlign: 'center' }}>Lädt…</div>
      ) : jobs.length === 0 ? (
        <div style={{ border: '1px dashed #CBD5E1', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: '#64748B' }}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8, color: '#334155' }}>Noch keine Sales-Nav-Importe</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Starte einen Import aus der Chrome-Extension auf einer Sales-Navigator-Seite
            (Lead-Detail für einzelne Kontakte oder eine gespeicherte Suche für Bulk).
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {jobs.map((j) => <JobCard key={j.id} job={j} onDetails={setDetail} />)}
        </div>
      )}

      <JobDetailModal job={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
