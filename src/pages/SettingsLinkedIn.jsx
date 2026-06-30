// src/pages/SettingsLinkedIn.jsx
//
// Zentraler LinkedIn-Hub (/settings/linkedin) — Phase 1 des LinkedIn-Integrations-Konzepts
// (docs/architecture/linkedin-integration-concept.md).
//
// Bündelt die DREI technisch verschiedenen LinkedIn-Verbindungen an einem Ort, nach Zweck benannt:
//   1. Anmelden          — LinkedIn-OIDC über GoTrue (linkIdentity). Inline connect/disconnect.
//   2. Veröffentlichen   — Posts-API-OAuth pro Brand Voice (linkedin_oauth_tokens). Status + Trennen
//                          inline; Verbinden/Verwalten deep-linkt nach /personal-brand (getunter
//                          OAuth-Rückpfad).
//   3. Automatisieren    — Chrome-Extension (linkedin_connections). Status + Trennen inline;
//                          Verbinden/Sync deep-linkt nach /linkedin-connect.

import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authRedirect } from '../lib/authRedirect'
import SettingsTabs from '../components/SettingsTabs'

const P = 'var(--wl-primary, rgb(49,90,231))'
const LI_BLUE = '#0a66c2'

function LinkedInGlyph({ size = 20, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
      <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
    </svg>
  )
}

const box  = { background: 'var(--surface)', borderRadius: 14, border: '1px solid #E4E7EC', marginBottom: 16, overflow: 'hidden' }
const hdr  = { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid #EEF1F5' }
const bdy  = { padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }
const iconWrap = (bg) => ({ width: 40, height: 40, borderRadius: 11, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 })

function StatusPill({ connected, labelOn = 'Verbunden', labelOff = 'Nicht verbunden' }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 20, padding: '5px 12px',
      background: connected ? '#F0FDF4' : 'var(--surface-muted)', border: `1px solid ${connected ? '#A7F3D0' : 'var(--border)'}` }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#10B981' : '#9CA3AF' }} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: connected ? '#065F46' : 'var(--text-muted)' }}>{connected ? labelOn : labelOff}</span>
    </div>
  )
}

const btnPrimary = { padding: '8px 16px', borderRadius: 9, border: 'none', background: P, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const btnGhost   = { padding: '8px 14px', borderRadius: 9, border: '1px solid #E4E7EC', background: 'var(--surface)', color: '#374151', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const btnDanger  = { padding: '8px 14px', borderRadius: 9, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const subText    = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }

export default function SettingsLinkedIn({ session }) {
  const navigate = useNavigate()
  const uid = session?.user?.id

  const [identities, setIdentities] = useState([])   // Login (linkedin_oidc)
  const [liLinking, setLiLinking]   = useState(false)
  const [liUnlinking, setLiUnlinking] = useState(false)
  const [brandVoices, setBrandVoices] = useState([]) // Publishing (pro BV)
  const [connectedBvIds, setConnectedBvIds] = useState(() => new Set())
  const [extConn, setExtConn]       = useState(null)  // Automation (Extension)
  const [loading, setLoading]       = useState(true)
  const [msg, setMsg]               = useState(null)

  const flash = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000) }

  const load = useCallback(async () => {
    setLoading(true)
    // 1. Login-Identities — IMMER frisch via getUser (session-Prop ist nach Link stale)
    const { data: userData } = await supabase.auth.getUser()
    setIdentities((userData?.user?.identities || []).filter(i => i.provider === 'linkedin_oidc'))

    // 2. Publishing — Brand Voices + welche haben ein Posts-API-Token
    const { data: bvs } = await supabase.from('brand_voices').select('id, name').eq('user_id', uid).order('name', { ascending: true })
    setBrandVoices(bvs || [])
    const bvIds = (bvs || []).map(b => b.id)
    if (bvIds.length) {
      const { data: toks } = await supabase.from('linkedin_oauth_tokens').select('brand_voice_id').in('brand_voice_id', bvIds)
      setConnectedBvIds(new Set((toks || []).map(t => t.brand_voice_id)))
    } else {
      setConnectedBvIds(new Set())
    }

    // 3. Automation — Extension-Verbindung
    const { data: ext } = await supabase.from('linkedin_connections').select('*').eq('user_id', uid).maybeSingle()
    setExtConn(ext)
    setLoading(false)
  }, [uid])

  useEffect(() => { load() }, [load])

  // OAuth-Callback (Login) — nach linkIdentity-Redirect zurück: Identity per getUser verifizieren.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const isCb = window.location.hash.includes('access_token') || params.get('linked') || params.get('error')
    if (!isCb) return
    window.history.replaceState(null, '', window.location.pathname)
    ;(async () => {
      try {
        await supabase.auth.refreshSession()
        const { data: ud } = await supabase.auth.getUser()
        const li = (ud?.user?.identities || []).filter(i => i.provider === 'linkedin_oidc')
        setIdentities(li)
        if (li.length) flash('LinkedIn erfolgreich verknüpft!')
        else if (params.get('error')) flash('LinkedIn-Verknüpfung fehlgeschlagen: ' + decodeURIComponent(params.get('error')), 'error')
        else flash('LinkedIn-Verknüpfung konnte nicht abgeschlossen werden (oft: andere E-Mail im LinkedIn-Profil als im Account).', 'error')
      } catch (e) { flash('Status konnte nicht verifiziert werden: ' + (e?.message || String(e)), 'error') }
    })()
  }, [])

  // ── Login: verbinden / trennen ──
  async function linkLogin() {
    setLiLinking(true)
    const { error } = await supabase.auth.linkIdentity({
      provider: 'linkedin_oidc',
      options: { redirectTo: authRedirect('/settings/linkedin?linked=success'), scopes: 'openid profile email' },
    })
    if (error) { flash(error.message, 'error'); setLiLinking(false) }
    // Bei Erfolg: Redirect zu LinkedIn
  }
  async function unlinkLogin() {
    const ident = identities[0]
    if (!ident) return
    if (!confirm('LinkedIn-Anmeldung trennen?')) return
    setLiUnlinking(true)
    const { error } = await supabase.auth.unlinkIdentity(ident)
    setLiUnlinking(false)
    if (error) flash(error.message, 'error')
    else { setIdentities([]); flash('LinkedIn-Anmeldung getrennt.') }
  }

  // ── Publishing: Token trennen (pro BV) ──
  async function disconnectPublish(bvId) {
    if (!confirm('Veröffentlichungs-Verbindung für diese Marke trennen?')) return
    const { error } = await supabase.from('linkedin_oauth_tokens').delete().eq('brand_voice_id', bvId)
    if (error) { flash(error.message, 'error'); return }
    setConnectedBvIds(prev => { const n = new Set(prev); n.delete(bvId); return n })
    flash('Veröffentlichungs-Verbindung getrennt.')
  }

  // ── Automation: Extension trennen ──
  async function disconnectExtension() {
    if (!confirm('LinkedIn-Automatisierung trennen?')) return
    const { error } = await supabase.from('linkedin_connections').update({ status: 'disconnected' }).eq('user_id', uid)
    if (error) { flash(error.message, 'error'); return }
    setExtConn(c => c ? { ...c, status: 'disconnected' } : c)
    flash('Automatisierung getrennt.')
  }

  const loginConnected = identities.length > 0
  const loginIdent = identities[0]
  const publishCount = connectedBvIds.size
  const extConnected = extConn && extConn.status === 'connected'

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '8px 0 40px' }}>
      <SettingsTabs />

      <div style={{ ...subText, marginBottom: 16 }}>
        Drei voneinander unabhängige LinkedIn-Verbindungen — aktiviere nur, was du brauchst. Jede schaltet etwas anderes frei.
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: '11px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: msg.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: msg.type === 'error' ? '#991B1B' : '#065F46',
          border: '1px solid ' + (msg.type === 'error' ? '#FCA5A5' : '#A7F3D0') }}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Lädt…</div>
      ) : (
        <>
          {/* ── 1. ANMELDEN ── */}
          <div style={box}>
            <div style={hdr}>
              <div style={iconWrap('linear-gradient(135deg,#0a66c2,#378fe9)')}><LinkedInGlyph /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong, #111827)' }}>Mit LinkedIn anmelden</div>
                <div style={subText}>Schnell einloggen mit LinkedIn statt Passwort. Übernimmt Name &amp; Profilbild.</div>
              </div>
              <StatusPill connected={loginConnected} />
            </div>
            <div style={bdy}>
              {loginConnected ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={subText}>Verbunden{loginIdent?.identity_data?.email ? ' · ' + loginIdent.identity_data.email : ''}. Du kannst dich mit E-Mail/Passwort <strong>oder</strong> LinkedIn anmelden.</div>
                  <button style={btnDanger} onClick={unlinkLogin} disabled={liUnlinking}>{liUnlinking ? '…' : 'Trennen'}</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={subText}>Schaltet <strong>nur die Anmeldung</strong> frei — kein Posten, keine Automatisierung.</div>
                  <button style={btnPrimary} onClick={linkLogin} disabled={liLinking}>{liLinking ? 'Weiterleitung…' : 'Mit LinkedIn verbinden'}</button>
                </div>
              )}
            </div>
          </div>

          {/* ── 2. VERÖFFENTLICHEN ── */}
          <div style={box}>
            <div style={hdr}>
              <div style={iconWrap('linear-gradient(135deg,#7C3AED,#a855f7)')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong, #111827)' }}>Veröffentlichen über LinkedIn</div>
                <div style={subText}>Beiträge direkt aus dem Redaktionsplan posten. <strong>Pro Marke</strong> (Personal/Company) je eine Verbindung.</div>
              </div>
              <StatusPill connected={publishCount > 0} labelOn={`${publishCount} verbunden`} />
            </div>
            <div style={bdy}>
              {brandVoices.length === 0 ? (
                <div style={subText}>Noch keine Brand Voice angelegt. Lege zuerst eine Marke an, dann kannst du sie fürs Veröffentlichen verbinden.</div>
              ) : (
                brandVoices.map(bv => {
                  const on = connectedBvIds.has(bv.id)
                  return (
                    <div key={bv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#10B981' : '#CBD5E1', flexShrink: 0 }} />
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bv.name || 'Unbenannte Marke'}</span>
                      </div>
                      {on
                        ? <button style={btnDanger} onClick={() => disconnectPublish(bv.id)}>Trennen</button>
                        : <button style={btnGhost} onClick={() => navigate('/personal-brand')} title="Verbinden im Marken-Editor (OAuth)">Verbinden →</button>}
                    </div>
                  )
                })
              )}
              <div style={{ ...subText, fontSize: 11.5 }}>Postet über die offizielle LinkedIn-API. Das Verbinden läuft pro Marke im Marken-Editor.</div>
            </div>
          </div>

          {/* ── 3. AUTOMATISIEREN ── */}
          <div style={box}>
            <div style={hdr}>
              <div style={iconWrap('linear-gradient(135deg,#059669,#10B981)')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong, #111827)' }}>Automatisieren &amp; Importieren</div>
                <div style={subText}>Vernetzen, Nachrichten, Kontakte-Import &amp; Sales-Navigator — über die Leadesk Chrome-Extension.</div>
              </div>
              <StatusPill connected={extConnected} />
            </div>
            <div style={bdy}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={subText}>
                  {extConnected
                    ? <>Verbunden{extConn?.profile_name ? ' als ' + extConn.profile_name : ''}. Läuft über deine im Browser eingeloggte LinkedIn-Session.</>
                    : <>Benötigt die Leadesk Chrome-Extension. Verbinden &amp; Synchronisieren läuft auf der Extension-Seite.</>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={btnGhost} onClick={() => navigate('/linkedin-connect')}>{extConnected ? 'Verwalten' : 'Einrichten →'}</button>
                  {extConnected && <button style={btnDanger} onClick={disconnectExtension}>Trennen</button>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
