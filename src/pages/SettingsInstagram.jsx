import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, RefreshCw, ExternalLink, Unlink } from 'lucide-react'
import SettingsTabs from '../components/SettingsTabs'
import { useEntitlements } from '../hooks/useEntitlements'
import {
  createConnectLink, syncConnection, disconnectAccount, getConnectionStatus,
} from '../lib/instagram'
// Hybrid-Architektur: zweiter, unabhängiger Strang für DM-Postfach + Outreach
// über Unipile. Der Graph-/Growth-Suite-Strang oben bleibt unverändert.
// Siehe docs/instagram-unipile-rebuild-konzept.md.
import {
  createUnipileConnectLink, getUnipileConnection,
  reconcileUnipileConnection, disconnectUnipile,
} from '../lib/instagramUnipile'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const IG_PINK = '#E1306C'
const C = { surface: '#fff', border: '#E4E7EC', text1: '#111827', text2: '#374151', text3: '#6B7280' }

// lucide@1.x kennt kein 'Instagram'-Glyph (Top-Fallstrick #11) → lokales Inline-SVG.
function IcInstagram({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

export default function SettingsInstagram() {
  const navigate = useNavigate()
  const { hasModule } = useEntitlements()
  const entitled = hasModule('instagram')

  const [loading, setLoading] = useState(true)
  const [conn, setConn]       = useState(null)
  const [linkOpened, setLinkOpened] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState('')

  // ── Unipile-Strang (DM-Postfach + Outreach) — unabhängig vom Graph-Strang ──
  const [uconn, setUconn]     = useState(null)
  const [ubusy, setUbusy]     = useState(false)
  const [uerr, setUerr]       = useState('')
  const [ulinkOpened, setUlinkOpened] = useState(false)

  async function load() {
    setLoading(true); setErr('')
    try {
      // Erst Cache, dann Live-Sync (falls Kunde gerade beim Partner verbunden hat).
      let c = await getConnectionStatus()
      if (!c) { try { c = await syncConnection() } catch (_) { /* defensive */ } }
      setConn(c)
    } catch (e) {
      setErr(e.message || 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
    // Unipile-Verbindung defensiv nachladen — ein Fehler hier darf den
    // Graph-Strang nicht blockieren (die beiden sind unabhängig).
    try { setUconn(await getUnipileConnection()) } catch (_) { setUconn(null) }
  }

  useEffect(() => { load() }, [])

  // Rückkehr vom Hosted-Auth (?unipile=connected): der Webhook ist der Canonical-
  // Pfad, kann aber verzögert sein → Reconcile-Fallback einmalig anstoßen.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('unipile') !== 'connected') return
    window.history.replaceState({}, '', window.location.pathname)
    setUbusy(true)
    reconcileUnipileConnection()
      .then(r => { if (r?.connection) setUconn(r.connection) })
      .catch(e => setUerr(e.message || 'Verbindung konnte nicht bestätigt werden'))
      .finally(() => setUbusy(false))
  }, [])

  async function onUConnect() {
    setUbusy(true); setUerr('')
    try {
      const d = await createUnipileConnectLink()
      const url = d?.url || d?.connect_url
      if (!url) throw new Error('Kein Connect-Link erhalten')
      window.open(url, '_blank', 'noopener,noreferrer')
      setUlinkOpened(true)
    } catch (e) { setUerr(e.message || 'Connect-Link fehlgeschlagen') }
    finally { setUbusy(false) }
  }

  async function onUCheck() {
    setUbusy(true); setUerr('')
    try {
      const r = await reconcileUnipileConnection()
      if (r?.connection) setUconn(r.connection)
      // message hat Vorrang: der fail-closed-Pfad (reconnect_needed) liefert einen
      // fertigen Klartext-Hinweis, reason ist nur ein Code.
      else setUerr(r?.message || 'Noch kein verbundenes Konto gefunden. Schließe das Verbinden im geöffneten Tab ab und prüfe erneut.')
    } catch (e) { setUerr(e.message || 'Prüfen fehlgeschlagen') }
    finally { setUbusy(false) }
  }

  async function onUDisconnect() {
    setUbusy(true); setUerr('')
    try {
      await disconnectUnipile()
      setUconn(null); setUlinkOpened(false)
    } catch (e) { setUerr(e.message || 'Trennen fehlgeschlagen') }
    finally { setUbusy(false) }
  }

  async function onConnect() {
    setBusy(true); setErr('')
    try {
      const { connect_url } = await createConnectLink()
      if (!connect_url) throw new Error('Kein Connect-Link erhalten')
      window.open(connect_url, '_blank', 'noopener,noreferrer')
      setLinkOpened(true)
    } catch (e) { setErr(e.message || 'Connect-Link fehlgeschlagen') }
    finally { setBusy(false) }
  }

  async function onCheck() {
    setBusy(true); setErr('')
    try {
      const c = await syncConnection()
      setConn(c)
      if (!c) setErr('Noch kein verbundenes Konto gefunden. Schließe das Verbinden im geöffneten Tab ab und prüfe erneut.')
    } catch (e) { setErr(e.message || 'Prüfen fehlgeschlagen') }
    finally { setBusy(false) }
  }

  async function onDisconnect() {
    setBusy(true); setErr('')
    try {
      await disconnectAccount()
      setConn(null)
      setLinkOpened(false)
    } catch (e) { setErr(e.message || 'Trennen fehlgeschlagen') }
    finally { setBusy(false) }
  }

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '22px 24px' }
  const btnPrimary = (extra = {}) => ({
    display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9,
    border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700,
    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, ...extra,
  })

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
      <SettingsTabs />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center',
          background: `linear-gradient(135deg, #F58529, ${IG_PINK}, #833AB4)`, color: '#fff',
        }}>
          <IcInstagram size={20} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: C.text1 }}>Instagram-Verbindung</h1>
          <div style={{ fontSize: 13, color: C.text3 }}>
            Zwei getrennte Verbindungen: eine für Analysen &amp; Veröffentlichen, eine für Nachrichten.
          </div>
        </div>
      </div>

      {!entitled && (
        <div style={{
          ...card, marginBottom: 16, background: '#FFF7FB', borderColor: '#F9CFE3',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1, fontSize: 14, color: C.text2 }}>
            Der Instagram-Funktionsblock ist für deinen Account noch nicht aktiviert.
            Du kannst dein Konto bereits verbinden — Analysen und Veröffentlichen
            werden sichtbar, sobald das Add-on aktiv ist.
          </div>
          <button onClick={() => navigate('/marketplace')} style={{
            padding: '9px 16px', borderRadius: 8, border: 'none', background: IG_PINK,
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Zum Marktplatz</button>
        </div>
      )}

      {err && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 10,
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13,
        }}>{err}</div>
      )}

      <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text2, margin: '0 0 10px' }}>
        Analysen &amp; Veröffentlichen
      </h2>

      {loading ? (
        <div style={{ ...card, color: C.text3 }}>Lädt …</div>
      ) : conn ? (
        // ── Verbunden ──────────────────────────────────────────────────
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
              background: '#ECFDF5', color: '#059669',
            }}><Check size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: C.text1 }}>@{conn.username || conn.ig_account_id}</div>
              <div style={{ fontSize: 13, color: C.text3 }}>
                Verbunden{conn.account_type ? ` · ${conn.account_type}` : ''}
              </div>
            </div>
            <button className="lk-btn lk-btn-ghost" onClick={onDisconnect} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Unlink size={15} /> Trennen</button>
          </div>
          {entitled && (
            <button onClick={() => navigate('/instagram')} style={btnPrimary({ marginTop: 16 })}>
              Analysen öffnen
            </button>
          )}
        </div>
      ) : (
        // ── Nicht verbunden: Connect-Link-Flow ─────────────────────────
        <div style={card}>
          <div style={{ fontSize: 14, color: C.text2, marginBottom: 16 }}>
            Verbinde dein Instagram-Konto über die Instagram Growth Suite. Es öffnet sich ein
            sicherer Onboarding-Link in einem neuen Tab. Nach dem Verbinden hier auf
            „Verbindung prüfen“ klicken.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={onConnect} disabled={busy} className="lk-btn lk-btn-primary">
              <ExternalLink size={16} /> {linkOpened ? 'Link erneut öffnen' : 'Instagram verbinden'}
            </button>
            {linkOpened && (
              <button className="lk-btn lk-btn-ghost" onClick={onCheck} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <RefreshCw size={16} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} />
                Verbindung prüfen
              </button>
            )}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ══ Nachrichten & Outreach (Unipile) ═══════════════════════════════
          Bewusst zweite, unabhängige Verbindung: der Graph-/Growth-Suite-Strang
          oben liefert Insights + Publishing, kann aber keine DMs. Unipile kann
          DMs + Outreach, aber keine Insights. Hybrid = beide parallel.
          Siehe docs/instagram-unipile-rebuild-konzept.md §5. */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text2, margin: '26px 0 10px' }}>
        Nachrichten &amp; Outreach
      </h2>

      {uerr && (
        <div style={{
          marginBottom: 12, padding: '12px 16px', borderRadius: 10,
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13,
        }}>{uerr}</div>
      )}

      {uconn && uconn.status === 'OK' ? (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
              background: '#ECFDF5', color: '#059669',
            }}><Check size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: C.text1 }}>
                @{uconn.username || uconn.unipile_account_id}
              </div>
              <div style={{ fontSize: 13, color: C.text3 }}>
                Nachrichten-Verbindung aktiv
                {uconn.last_sync_at ? ` · zuletzt synchronisiert ${new Date(uconn.last_sync_at).toLocaleString('de-DE')}` : ''}
              </div>
            </div>
            <button className="lk-btn lk-btn-ghost" onClick={onUDisconnect} disabled={ubusy}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Unlink size={15} /> Trennen
            </button>
          </div>
          {entitled && (
            <button onClick={() => navigate('/instagram/inbox')} style={btnPrimary({ marginTop: 16 })}>
              Postfach öffnen
            </button>
          )}
        </div>
      ) : uconn ? (
        // Verbindung existiert, ist aber nicht OK (CREDENTIALS/ERROR/PENDING …)
        <div style={{ ...card, borderColor: '#FDE68A', background: '#FFFBEB' }}>
          <div style={{ fontSize: 14, color: C.text2, marginBottom: 14 }}>
            Die Nachrichten-Verbindung hat den Status <strong>{uconn.status}</strong> und
            funktioniert aktuell nicht. Das passiert z.&nbsp;B. wenn das Instagram-Passwort
            geändert wurde. Verbinde das Konto neu.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={onUConnect} disabled={ubusy} className="lk-btn lk-btn-primary">
              <ExternalLink size={16} /> Neu verbinden
            </button>
            <button className="lk-btn lk-btn-ghost" onClick={onUDisconnect} disabled={ubusy}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Unlink size={15} /> Trennen
            </button>
          </div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ fontSize: 14, color: C.text2, marginBottom: 16 }}>
            Verbinde dein Instagram-Konto für das DM-Postfach. Es öffnet sich ein sicherer
            Onboarding-Link in einem neuen Tab. Nach dem Verbinden hier auf
            „Verbindung prüfen“ klicken.
            <div style={{ marginTop: 8, fontSize: 13, color: C.text3 }}>
              Hinweis: Instagram begrenzt automatisierte Aktionen (Folgen, Nachrichten an
              neue Kontakte) auf rund 100 pro Tag. Auf eingehende Nachrichten kannst du
              unbegrenzt antworten.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={onUConnect} disabled={ubusy} className="lk-btn lk-btn-primary">
              <ExternalLink size={16} /> {ulinkOpened ? 'Link erneut öffnen' : 'Für Nachrichten verbinden'}
            </button>
            {ulinkOpened && (
              <button className="lk-btn lk-btn-ghost" onClick={onUCheck} disabled={ubusy}
                style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <RefreshCw size={16} style={ubusy ? { animation: 'spin 1s linear infinite' } : undefined} />
                Verbindung prüfen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
