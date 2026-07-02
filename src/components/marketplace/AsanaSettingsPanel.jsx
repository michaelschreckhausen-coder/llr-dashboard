// src/components/marketplace/AsanaSettingsPanel.jsx
//
// Asana-Einstellungen als wiederverwendbares Panel (aus IntegrationSettings.jsx
// überführt). Wird im Marketplace über das ⋮-Menü ("Einstellungen") des
// aktivierten Asana-Add-ons gerendert.
//
// WICHTIG (Abgrenzung): Dieses Panel steuert NUR die OAuth-VERBINDUNG zu Asana
// (Verbinden/Trennen). Das AKTIVIEREN/KÜNDIGEN des Add-ons selbst passiert über
// die Marketplace-Kachel (activate_addon / cancel_addon) — nicht hier.
//
// Multi-Tenant: alle Zugriffe über team_id = activeTeamId.
// Der Asana-Token erscheint NIE im Frontend — nur die Edge Functions
// asana-oauth-start / asana-oauth-disconnect werden aufgerufen.

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

export default function AsanaSettingsPanel({ onFlash }) {
  const { team, activeTeamId } = useTeam()
  const [loading, setLoading] = useState(true)
  const [conn, setConn] = useState(null)             // asana_connections-Zeile (RLS-Select)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const flash = (msg, type = 'ok') => { onFlash?.(msg, type) }

  useEffect(() => { load() }, [activeTeamId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    if (activeTeamId) {
      // RLS: nur Team-Mitglieder dürfen lesen; Token bleiben im Vault/Backend.
      const { data } = await supabase.from('asana_connections')
        .select('asana_workspace_gid, asana_workspace_name, created_at')
        .eq('team_id', activeTeamId)
        .maybeSingle()
      setConn(data || null)
    } else {
      setConn(null)
    }
    setLoading(false)
  }

  async function connect() {
    if (!activeTeamId) { flash('Kein aktives Team ausgewählt', 'err'); return }
    setConnecting(true)
    try {
      const { data, error } = await supabase.functions.invoke('asana-oauth-start', {
        body: { team_id: activeTeamId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.authorize_url) throw new Error('Keine Autorisierungs-URL erhalten')
      // Weiter zum Asana-Consent — kein setConnecting(false), da wir die Seite verlassen.
      window.location.href = data.authorize_url
    } catch (e) {
      flash(e?.message || 'Verbindung fehlgeschlagen', 'err')
      setConnecting(false)
    }
  }

  async function disconnect() {
    if (!activeTeamId) return
    setDisconnecting(true)
    try {
      const { data, error } = await supabase.functions.invoke('asana-oauth-disconnect', {
        body: { team_id: activeTeamId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setConn(null)
      flash('Asana-Verbindung getrennt')
    } catch (e) {
      flash(e?.message || 'Trennen fehlgeschlagen', 'err')
    }
    setDisconnecting(false)
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Lade Verbindungsstatus…</div>
  }

  return (
    <div>
      {/* Status-Zeile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: conn ? '#10B981' : '#9CA3AF' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: conn ? '#065F46' : '#6B7280' }}>
          {conn ? 'Verbunden' : 'Nicht verbunden'}
        </span>
      </div>

      {/* Kostenfrei-Hinweis */}
      <div style={{ background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#065F46' }}>
        Die Asana-Integration ist bis <strong>30.08.2026</strong> für alle Teams kostenfrei nutzbar.
      </div>

      {conn ? (
        <>
          <div style={{ background: 'var(--surface-muted)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, borderLeft: `3px solid ${PRIMARY}` }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
              Workspace: <strong>{conn.asana_workspace_name || conn.asana_workspace_gid}</strong>
            </div>
            {conn.created_at && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Verbunden seit {new Date(conn.created_at).toLocaleDateString('de-DE')}
              </div>
            )}
          </div>

          {team && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, background: 'var(--surface-muted)', borderRadius: 8, padding: '8px 12px' }}>
              Verbindung für Team: <strong>{team.name}</strong>
            </div>
          )}

          <button onClick={disconnect} disabled={disconnecting}
            style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid ' + (disconnecting ? '#E4E7EC' : '#DC2626'), background: 'var(--surface)', color: disconnecting ? '#9CA3AF' : '#DC2626', fontSize: 13, fontWeight: 700, cursor: disconnecting ? 'default' : 'pointer' }}>
            {disconnecting ? 'Trennen…' : 'Verbindung trennen'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
            „Trennen" widerruft nur die Asana-Verbindung. Das Add-on bleibt aktiv — Kündigen erfolgt über das ⋮-Menü der Kachel.
          </div>
        </>
      ) : (
        <>
          <div style={{ background: 'var(--surface-muted)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, borderLeft: `3px solid ${PRIMARY}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>So funktioniert die Integration</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                '1. Auf „Mit Asana verbinden" klicken — du wirst zu Asana weitergeleitet',
                '2. Den Zugriff für dein Team in Asana bestätigen',
                '3. Nach der Rückkehr steht der Status auf „Verbunden"',
                '4. Projekte & Aufgaben werden anschließend synchronisiert',
              ].map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-primary)', display: 'flex', gap: 8 }}>
                  <span style={{ color: PRIMARY, flexShrink: 0 }}>→</span>{s}
                </div>
              ))}
            </div>
          </div>

          {team && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, background: 'var(--surface-muted)', borderRadius: 8, padding: '8px 12px' }}>
              Verbindung für Team: <strong>{team.name}</strong>
            </div>
          )}

          <button onClick={connect} disabled={connecting || !activeTeamId}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: (connecting || !activeTeamId) ? '#E4E7EC' : PRIMARY, color: (connecting || !activeTeamId) ? '#9CA3AF' : '#fff', fontSize: 13, fontWeight: 700, cursor: (connecting || !activeTeamId) ? 'default' : 'pointer' }}>
            {connecting ? 'Weiterleiten…' : 'Mit Asana verbinden'}
          </button>
        </>
      )}
    </div>
  )
}
