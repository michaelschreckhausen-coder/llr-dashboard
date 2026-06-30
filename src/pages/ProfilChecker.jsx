import React, { useState } from 'react'
import { Check, X, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { checkOwnLinkedInProfile } from '../lib/leadeskExtension'

const P = 'var(--wl-primary, rgb(49,90,231))'
const has = v => !!(v && String(v).trim())

// Aus den gescrapten Profildaten die Checkliste bauen.
function buildChecks(p) {
  return [
    { label: 'Header-Banner',            ok: !!p.has_banner,                 hint: 'Lade ein Banner hoch, das zeigt, wofür du stehst — kostenlose Werbefläche.' },
    { label: 'Profilbild',               ok: !!p.has_photo || has(p.avatar_url), hint: 'Ein professionelles, freundliches Profilfoto schafft Vertrauen.' },
    { label: 'Profilslogan (Headline)',  ok: has(p.headline),                hint: 'Nutze die Headline für deinen Nutzen/Positionierung, nicht nur den Jobtitel.' },
    { label: 'Berufsbezeichnung',        ok: has(p.job_title),               hint: 'Aktuelle Position eintragen.' },
    { label: 'Info-Box (Über mich)',     ok: has(p.li_about_summary),        hint: 'Eine Info-Box mit Story + klarem Angebot erhöht die Conversion deutlich.' },
    { label: 'Berufserfahrung',          ok: has(p.li_experience_summary),   hint: 'Mindestens die aktuelle Station mit Beschreibung pflegen.' },
    { label: 'Ausbildung',               ok: has(p.li_education_summary),    hint: 'Ausbildung/Studium ergänzen — wirkt seriöser.' },
    { label: 'Kenntnisse & Fähigkeiten', ok: has(p.li_skills_summary),       hint: 'Relevante Skills hinzufügen — verbessert Auffindbarkeit & Matching.' },
    { label: 'Aktivität / Beiträge',     ok: has(p.li_activity_summary),     hint: 'Regelmäßig posten erhöht Reichweite und Profil-Besuche.' },
  ]
}

function Donut({ percent = 0, size = 120, color = P }) {
  const r = size / 2 - 8, circ = 2 * Math.PI * r, dash = circ * Math.min(1, Math.max(0, percent / 100))
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#EEF1F5" strokeWidth={10} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10} strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-strong, #111827)', lineHeight: 1 }}>{Math.round(percent)}%</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>vollständig</div>
      </div>
    </div>
  )
}

function ratingFor(score) {
  if (score >= 85) return { label: 'Sehr gut', color: '#059669', bg: '#ECFDF5' }
  if (score >= 65) return { label: 'Solide',   color: '#2563eb', bg: '#EFF6FF' }
  if (score >= 40) return { label: 'Ausbaufähig', color: '#D97706', bg: '#FFFBEB' }
  return { label: 'Unvollständig', color: '#DC2626', bg: '#FEF2F2' }
}

export default function ProfilChecker() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [profile, setProfile] = useState(null)

  async function run() {
    setLoading(true); setError(null)
    try {
      const res = await checkOwnLinkedInProfile()
      if (res.error) { setError(res.error); setLoading(false); return }
      const p = res.profile || res
      if (!p || (!p.name && !p.headline)) { setError('Konnte dein Profil nicht auslesen. Bist du auf LinkedIn eingeloggt?'); setLoading(false); return }
      setProfile(p)
    } catch (e) {
      setError(e.message || 'Profil-Check fehlgeschlagen')
    }
    setLoading(false)
  }

  const checks = profile ? buildChecks(profile) : []
  const passed = checks.filter(c => c.ok).length
  const score  = checks.length ? Math.round(passed / checks.length * 100) : 0
  const rating = ratingFor(score)

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="LinkedIn · Profil-Checker"
        title="Profil-Checker"
        subtitle="Prüft dein LinkedIn-Profil auf Vollständigkeit — Banner, Foto, Slogan, Info-Box, Erfahrung und mehr — und gibt dir eine Bewertung mit konkreten Tipps."
        action={
          <button onClick={run} disabled={loading}
            style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: P, color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {loading ? <Loader2 size={15} className="lk-spin" /> : (profile ? <RefreshCw size={15} /> : <Sparkles size={15} />)}
            {loading ? 'Prüfe…' : (profile ? 'Erneut prüfen' : 'Profil prüfen')}
          </button>
        }
      />

      {loading && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          <Loader2 size={22} className="lk-spin" style={{ color: P }} />
          <div style={{ marginTop: 10 }}>Dein Profil wird geprüft — es öffnet sich kurz ein LinkedIn-Tab und schließt sich wieder.</div>
        </div>
      )}

      {error && !loading && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {!loading && !error && !profile && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '36px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>Bereit, dein Profil zu prüfen?</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: '52ch', margin: '0 auto 18px', lineHeight: 1.6 }}>
            Klick auf „Profil prüfen". Die Leadesk-Extension öffnet kurz dein eigenes LinkedIn-Profil, liest die wichtigsten Bereiche aus und bewertet die Vollständigkeit.
          </div>
          <button onClick={run} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: P, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} /> Profil prüfen
          </button>
        </div>
      )}

      {!loading && profile && (
        <>
          {/* Score-Karte */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <Donut percent={score} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{profile.name || 'Dein Profil'}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong)' }}>{rating.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: rating.color, background: rating.bg, borderRadius: 99, padding: '2px 10px' }}>{passed}/{checks.length} erfüllt</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {score >= 85 ? 'Stark — dein Profil ist nahezu vollständig.' : score >= 65 ? 'Gute Basis. Mit den offenen Punkten holst du mehr raus.' : 'Da ist noch Luft nach oben — die offenen Punkte unten lohnen sich.'}
              </div>
            </div>
          </div>

          {/* Checkliste */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            {checks.map((c, i) => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--border-soft, #F1F5F9)' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.ok ? '#ECFDF5' : '#FEF2F2', color: c.ok ? '#059669' : '#DC2626' }}>
                  {c.ok ? <Check size={15} strokeWidth={2.5} /> : <X size={15} strokeWidth={2.5} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{c.label}</div>
                  {!c.ok && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>{c.hint}</div>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.ok ? '#059669' : '#DC2626', flexShrink: 0, marginTop: 3 }}>{c.ok ? 'Vorhanden' : 'Fehlt'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
