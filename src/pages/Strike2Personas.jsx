// Strike2Personas — Liste der Strike2-Personas (Phase 2, /branding/strike2-personas).
// Addon-Gate (sales-nav-Pattern), Liste + Status-Pills + Empty-State. Der
// "Neue Persona"-Button ist ein Phase-3-Stub (Wizard kommt dann). Bearbeiten
// ebenso (Detail/Wizard = Phase 3).
import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useStrike2Personas } from '../hooks/useStrike2Personas'
import { useAddons } from '../hooks/useAddons'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const ADDON_SLUG = 'strike2-zielgruppen-plus'

const STATUS = {
  draft:       { label: 'Entwurf',        bg: '#F1F5F9', fg: '#475569' },
  in_progress: { label: 'In Arbeit',      bg: '#DBEAFE', fg: '#1E40AF' },
  review:      { label: 'Review',         bg: '#FEF3C7', fg: '#92400E' },
  completed:   { label: 'Fertig',         bg: '#D1FAE5', fg: '#065F46' },
  archived:    { label: 'Archiviert',     bg: '#F1F5F9', fg: '#94A3B8' },
}
const GEN_STATUS = {
  running: { label: 'KI generiert…', fg: '#1E40AF' },
  failed:  { label: 'Generierung fehlgeschlagen', fg: '#7F1D1D' },
  done:    { label: '70 Ideen erzeugt', fg: '#065F46' },
}

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('de-DE', { dateStyle: 'medium' }) } catch (e) { return s }
}

function StatusPill({ status }) {
  const c = STATUS[status] || { label: status, bg: '#F1F5F9', fg: '#475569' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 999, background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

export default function Strike2Personas() {
  const navigate = useNavigate()
  const { activeTeamId, team } = useTeam() || {}
  const { subscribedSlugs, isLoading: addonsLoading } = useAddons()
  const { personas, isLoading } = useStrike2Personas()
  const hasAddon = subscribedSlugs?.has?.(ADDON_SLUG) || false
  const [creating, setCreating] = useState(false)

  const createPersona = async () => {
    if (creating) return
    const accountId = team?.account_id
    if (!activeTeamId || !accountId) { alert('Strike2-Personas brauchen ein aktives Team.'); return }
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('strike2_personas')
      .insert({ name: 'Neue Persona', user_id: user?.id, team_id: activeTeamId, account_id: accountId, status: 'draft', current_step: 0 })
      .select('id').single()
    setCreating(false)
    if (error || !data) { alert('Anlegen fehlgeschlagen: ' + (error?.message || '')); return }
    navigate(`/branding/strike2-personas/${data.id}?step=0`)
  }

  // Gate: Addon muss aktiviert sein (Marketplace). Bis dahin Upsell.
  if (!addonsLoading && !hasAddon) {
    return (
      <div style={{ padding: '24px 28px', maxWidth: 560, margin: '0 auto' }}>
        <div style={{ border: '1px solid #FED7AA', background: '#FFF7ED', borderRadius: 14, padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🎯</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 10px' }}>Strike2 Zielgruppen-Plus aktivieren</h1>
          <p style={{ fontSize: 14, color: '#9A3412', lineHeight: 1.6, margin: '0 0 8px' }}>
            B2B-Personas nach dem Schuster-Modell® durch alle 7 Funnel-Phasen, plus 70 KI-generierte
            Content-Ideen für deinen Redaktionsplan.
          </p>
          <p style={{ fontSize: 13, color: '#C2410C', margin: '0 0 22px' }}>Kostenfrei bis 31. August 2026.</p>
          <Link to="/marketplace" style={{ display: 'inline-block', background: '#F97316', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 14, padding: '11px 22px', borderRadius: 10 }}>
            Im Marketplace aktivieren →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Strike2 Personas</h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
            B2B-Personas nach dem Schuster-Modell® + Empathischer Funnel®.
          </p>
        </div>
        <button
          type="button" onClick={createPersona} disabled={creating}
          style={{ border: 'none', background: '#F97316', color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: creating ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: creating ? 0.6 : 1 }}>
          {creating ? 'Lege an…' : '⚡ Neue Persona'}
        </button>
      </div>

      {isLoading ? (
        <div style={{ fontSize: 13, color: '#94A3B8', padding: '40px 0', textAlign: 'center' }}>Lädt…</div>
      ) : personas.length === 0 ? (
        <div style={{ border: '1px dashed #FED7AA', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: '#9A3412' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🎯</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8, color: '#7C2D12' }}>Noch keine Strike2-Personas</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Der geführte 8-Schritte-Wizard zum Anlegen deiner ersten Persona kommt in Kürze.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {personas.map((p) => {
            const gen = GEN_STATUS[p.generation_status]
            return (
              <div key={p.id} style={{ border: '0.5px solid #E2E8F0', borderRadius: 12, padding: 16, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                    <StatusPill status={p.status} />
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>
                    Schritt {p.current_step ?? 0}/8 · angelegt {fmtDate(p.created_at)}
                    {gen ? <span style={{ color: gen.fg, marginLeft: 8 }}>· {gen.label}</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
                  {p.generation_status === 'done' && (
                    <Link to={`/branding/strike2-personas/${p.id}/ideen`}
                      style={{ fontSize: 12, fontWeight: 600, color: '#9A3412', textDecoration: 'none' }}>
                      Ideen →
                    </Link>
                  )}
                  <Link to={`/branding/strike2-personas/${p.id}?step=${p.current_step ?? 0}`}
                    style={{ fontSize: 12, fontWeight: 500, color: PRIMARY, textDecoration: 'none' }}>
                    Bearbeiten →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
