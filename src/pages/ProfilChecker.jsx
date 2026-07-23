import React, { useState, useEffect, useCallback } from 'react'
import { Check, X, Loader2, RefreshCw, Sparkles, Clock } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { checkOwnLinkedInProfile } from '../lib/leadeskExtension'

const P = 'var(--wl-primary, #0A6FB0)'
const has = v => !!(v && String(v).trim())

// Check-Definitionen: Label, Hinweis und Prüf-Funktion auf den gescrapten Profildaten.
const CHECK_DEFS = [
  { label: 'Header-Banner',            hint: 'Lade ein Banner hoch, das zeigt, wofür du stehst — kostenlose Werbefläche.', get: p => !!p.has_banner },
  { label: 'Profilbild',               hint: 'Ein professionelles, freundliches Profilfoto schafft Vertrauen.', get: p => !!p.has_photo || has(p.avatar_url) },
  { label: 'Profilslogan (Headline)',  hint: 'Nutze die Headline für deinen Nutzen/Positionierung, nicht nur den Jobtitel.', get: p => has(p.headline) },
  { label: 'Berufsbezeichnung',        hint: 'Aktuelle Position eintragen.', get: p => has(p.job_title) },
  { label: 'Info-Box (Über mich)',     hint: 'Eine Info-Box mit Story + klarem Angebot erhöht die Conversion deutlich.', get: p => has(p.li_about_summary) },
  { label: 'Berufserfahrung',          hint: 'Mindestens die aktuelle Station mit Beschreibung pflegen.', get: p => has(p.li_experience_summary) },
  { label: 'Ausbildung',               hint: 'Ausbildung/Studium ergänzen — wirkt seriöser.', get: p => has(p.li_education_summary) },
  { label: 'Kenntnisse & Fähigkeiten', hint: 'Relevante Skills hinzufügen — verbessert Auffindbarkeit & Matching.', get: p => has(p.li_skills_summary) },
  { label: 'Aktivität / Beiträge',     hint: 'Regelmäßig posten erhöht Reichweite und Profil-Besuche.', get: p => has(p.li_activity_summary) },
]
const HINT_BY_LABEL = Object.fromEntries(CHECK_DEFS.map(d => [d.label, d.hint]))

function resultFromProfile(p) {
  const checks = CHECK_DEFS.map(d => ({ label: d.label, hint: d.hint, ok: !!d.get(p) }))
  const passed = checks.filter(c => c.ok).length
  return { name: p.name || 'Dein Profil', checks, passed, total: checks.length, score: Math.round(passed / checks.length * 100), created_at: new Date().toISOString() }
}
function resultFromRow(row) {
  const checks = (row.results || []).map(c => ({ label: c.label, ok: !!c.ok, hint: HINT_BY_LABEL[c.label] }))
  const total = row.total || checks.length || CHECK_DEFS.length
  const passed = row.passed != null ? row.passed : checks.filter(c => c.ok).length
  return { name: row.profile_name || 'Profil', checks, passed, total, score: row.score != null ? row.score : Math.round(passed / total * 100), created_at: row.created_at }
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
const fmtDate = d => { try { return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const scoreColor = s => s >= 85 ? '#059669' : s >= 65 ? '#2563eb' : s >= 40 ? '#D97706' : '#DC2626'

export default function ProfilChecker({ session }) {
  const { activeTeamId } = useTeam() || {}
  const { activeBrandVoice, noBrand } = useBrandVoice() || {}
  const userId = session?.user?.id
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [result, setResult]   = useState(null)
  const [history, setHistory] = useState([])
  const [viewingId, setViewingId] = useState(null) // welche Verlaufs-Analyse gerade angezeigt wird

  const loadHistory = useCallback(async () => {
    if (!userId) { setHistory([]); return }
    try {
      // Brand-scoped: bei aktiver Marke NUR nach brand_voice_id filtern (RLS = Marken-Zugriff,
      // pc_brand) → geteilte Marke ist für berechtigte Kollegen sichtbar. Ohne Marke: eigene.
      let q = supabase
        .from('profile_checks')
        .select('id,profile_name,score,passed,total,results,created_at')
      const bvId = noBrand ? null : (activeBrandVoice?.id || null)
      q = bvId
        ? q.eq('brand_voice_id', bvId)
        : q.eq('user_id', userId).is('brand_voice_id', null)
      const { data } = await q
        .order('created_at', { ascending: false })
        .limit(20)
      setHistory(data || [])
    } catch (_) { /* Tabelle evtl. noch nicht migriert — Verlauf bleibt leer */ }
  }, [activeTeamId, userId, activeBrandVoice?.id, noBrand])

  useEffect(() => { loadHistory() }, [loadHistory])

  async function run() {
    setLoading(true); setError(null); setViewingId(null)
    try {
      const res = await checkOwnLinkedInProfile()
      if (res.error) { setError(res.error); setLoading(false); return }
      const p = res.profile || res
      if (!p || (!p.name && !p.headline)) { setError('Konnte dein Profil nicht auslesen. Bist du auf LinkedIn eingeloggt?'); setLoading(false); return }
      const r = resultFromProfile(p)
      setResult(r)
      // In der DB merken (nicht-fatal, falls Migration fehlt)
      try {
        await supabase.from('profile_checks').insert({
          team_id: activeTeamId || null,
          brand_voice_id: (noBrand ? null : (activeBrandVoice?.id || null)),
          profile_name: r.name, score: r.score, passed: r.passed, total: r.total,
          results: r.checks.map(c => ({ label: c.label, ok: c.ok })),
        })
        loadHistory()
      } catch (_) {}
    } catch (e) {
      setError(e.message || 'Profil-Check fehlgeschlagen')
    }
    setLoading(false)
  }

  function viewHistory(row) {
    setResult(resultFromRow(row)); setViewingId(row.id); setError(null)
  }

  const rating = result ? ratingFor(result.score) : null

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="LinkedIn · Profil-Checker"
        title="Profil-Checker"
        subtitle="Prüft dein LinkedIn-Profil auf Vollständigkeit — Banner, Foto, Slogan, Info-Box, Erfahrung und mehr — und merkt sich deine früheren Analysen."
        action={
          <button className="lk-btn lk-btn-primary" onClick={run} disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {loading ? <Loader2 size={15} className="lk-spin" /> : (result ? <RefreshCw size={15} /> : <Sparkles size={15} />)}
            {loading ? 'Prüfe…' : (result ? 'Erneut prüfen' : 'Profil prüfen')}
          </button>
        }
      />

      {loading && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-card)', padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
          <Loader2 size={22} className="lk-spin" style={{ color: P }} />
          <div style={{ marginTop: 10 }}>Dein Profil wird geprüft — es öffnet sich kurz ein LinkedIn-Tab und schließt sich wieder.</div>
        </div>
      )}

      {error && !loading && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!loading && !error && !result && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-card)', padding: '36px 28px', textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>Bereit, dein Profil zu prüfen?</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: '52ch', margin: '0 auto 18px', lineHeight: 1.6 }}>
            Klick auf „Profil prüfen". Die Leadesk-Extension öffnet kurz dein eigenes LinkedIn-Profil, liest die wichtigsten Bereiche aus und bewertet die Vollständigkeit.
          </div>
          <button className="lk-btn lk-btn-primary" onClick={run} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} /> Profil prüfen
          </button>
        </div>
      )}

      {!loading && result && (
        <>
          {/* Score-Karte */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <Donut percent={result.score} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                {result.name}{viewingId ? ' · ' + fmtDate(result.created_at) : ''}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong)' }}>{rating.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: rating.color, background: rating.bg, borderRadius: 99, padding: '2px 10px' }}>{result.passed}/{result.total} erfüllt</span>
                {viewingId && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface-muted)', borderRadius: 99, padding: '2px 10px' }}>frühere Analyse</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {result.score >= 85 ? 'Stark — dein Profil ist nahezu vollständig.' : result.score >= 65 ? 'Gute Basis. Mit den offenen Punkten holst du mehr raus.' : 'Da ist noch Luft nach oben — die offenen Punkte unten lohnen sich.'}
              </div>
            </div>
          </div>

          {/* Checkliste */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
            {result.checks.map((c, i) => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--border-soft, #F1F5F9)' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.ok ? '#ECFDF5' : '#FEF2F2', color: c.ok ? '#059669' : '#DC2626' }}>
                  {c.ok ? <Check size={15} strokeWidth={2.5} /> : <X size={15} strokeWidth={2.5} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{c.label}</div>
                  {!c.ok && c.hint && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>{c.hint}</div>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.ok ? '#059669' : '#DC2626', flexShrink: 0, marginTop: 3 }}>{c.ok ? 'Vorhanden' : 'Fehlt'}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Verlauf früherer Analysen */}
      {history.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>
            <Clock size={15} strokeWidth={2} /> Frühere Analysen
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map(row => (
              <button key={row.id} onClick={() => viewHistory(row)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 10, border: '1px solid ' + (viewingId === row.id ? P : 'var(--border-soft, #F1F5F9)'), background: viewingId === row.id ? 'rgba(10,111,176,0.05)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left', width: '100%', font: 'inherit' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(row.score), minWidth: 44 }}>{row.score}%</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.profile_name || 'Profil'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.passed}/{row.total}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(row.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
