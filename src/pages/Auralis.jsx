// src/pages/Auralis.jsx
//
// KI-Sichtbarkeit (Auralis) — Branding-Bereich. Marketplace-Add-on 'auralis'.
//
// Misst über Auralis, wie gut der eigene Name/das eigene Thema in KI-Antworten
// (Claude, GPT, Gemini, Mistral) gefunden wird — plus Wettbewerber-Vergleich.
// Alle Daten laufen über die Edge-Function 'auralis-proxy' (zentraler Key
// server-seitig, Sub-Account pro Team).
//
// Drei Zustände:
//   1. Add-on nicht abonniert        → Marketplace-Upsell (wie sevDesk)
//   2. Abonniert, nicht eingerichtet → Onboarding (Name + Thema)
//   3. Eingerichtet                  → Scores + Wettbewerber

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Sparkles, Trash2, RefreshCw, Plus, TrendingUp, Target, Award, Zap } from 'lucide-react'
import { useAddons } from '../hooks/useAddons'
import { useAuralis } from '../hooks/useAuralis'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'

const SCORE_META = [
  { key: 'aura',               label: 'Aura',               Icon: Sparkles,  hint: 'Gesamt-Sichtbarkeit in der KI' },
  { key: 'geo',                label: 'GEO',                Icon: Globe,     hint: 'Generative Engine Optimization' },
  { key: 'thought_leadership', label: 'Thought Leadership', Icon: Award,     hint: 'Wahrnehmung als Vordenker:in' },
  { key: 'digital_authority',  label: 'Digitale Autorität', Icon: TrendingUp,hint: 'Etablierte Online-Autorität' },
]

function scoreColor(v) {
  if (v == null) return '#9CA3AF'
  if (v >= 70) return '#059669'
  if (v >= 40) return '#D97706'
  return '#DC2626'
}

// ── Styles ──────────────────────────────────────────────────────────────────
const page   = { padding: '0 0 60px' }
const card    = { background: 'var(--surface)', border: '1px solid var(--border, #E4E7EC)', borderRadius: 16, padding: '24px 28px', marginBottom: 20 }
const h1Style = { fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', margin: 0 }
const subStyle = { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }
const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--border, #E4E7EC)', borderRadius: 9, fontSize: 14, outline: 'none', background: 'var(--surface)', boxSizing: 'border-box' }
const btnPrimary = (busy) => ({ padding: '10px 20px', borderRadius: 10, border: 'none', background: busy ? '#E4E7EC' : 'var(--primary)', color: busy ? '#9CA3AF' : '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' })
const btnGhost = (color = PRIMARY) => ({ padding: '8px 14px', borderRadius: 9, border: `1.5px solid ${color}`, background: 'var(--surface)', color, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' })

export default function Auralis() {
  const navigate = useNavigate()
  const { subscribedSlugs, isLoading: addonsLoading } = useAddons()
  const hasAddon = subscribedSlugs?.has?.('auralis') || false

  const {
    status, scores, competitors, loading, error,
    provision, loadScores, analyzeSelf, updateTopic,
    loadCompetitors, addCompetitor, removeCompetitor, analyzeCompetitor,
  } = useAuralis()

  const [flash, setFlash] = useState(null)
  const flash_ = (msg, type = 'ok') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 5000) }

  // Onboarding-Form
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [provisioning, setProvisioning] = useState(false)

  // Analyse-/Wettbewerber-Busy-States
  const [analyzing, setAnalyzing] = useState(false)
  const [noReport, setNoReport] = useState(false)
  const [compName, setCompName] = useState('')
  const [compTopics, setCompTopics] = useState('')
  const [compBusy, setCompBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState(null) // competitor_id in Arbeit

  // Thema-Inline-Edit
  const [editingTopic, setEditingTopic] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')
  const [savingTopic, setSavingTopic] = useState(false)

  const provisioned = Boolean(status?.provisioned)

  // Nach Einrichtung: Scores + Wettbewerber laden
  useEffect(() => {
    if (!provisioned) return
    let cancelled = false
    ;(async () => {
      const r = await loadScores()
      if (!cancelled && !r.ok && r.code === 'NO_REPORT') setNoReport(true)
      loadCompetitors()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provisioned])

  const onProvision = async () => {
    if (!name.trim() || !topic.trim()) { flash_('Bitte Name und Thema angeben.', 'err'); return }
    setProvisioning(true)
    const r = await provision({ full_name: name.trim(), topic_query: topic.trim(), language: 'de' })
    setProvisioning(false)
    if (!r.ok) { flash_(r.error || 'Einrichtung fehlgeschlagen.', 'err'); return }
    flash_('Eingerichtet. Starte die erste Analyse, um deine Scores zu sehen.')
  }

  const onAnalyzeSelf = async () => {
    setAnalyzing(true)
    flash_('Analyse läuft (~10–30 Sek)…')
    const r = await analyzeSelf()
    setAnalyzing(false)
    if (!r.ok) { flash_(r.error || 'Analyse fehlgeschlagen.', 'err'); return }
    setNoReport(false)
    flash_('Analyse abgeschlossen.')
  }

  const onStartEditTopic = () => { setTopicDraft(status?.topic_query || ''); setEditingTopic(true) }
  const onSaveTopic = async () => {
    const q = topicDraft.trim()
    if (!q) { flash_('Bitte ein Thema angeben.', 'err'); return }
    if (q === status?.topic_query) { setEditingTopic(false); return }
    setSavingTopic(true)
    const r = await updateTopic(q)
    setSavingTopic(false)
    if (!r.ok) { flash_(r.error || 'Thema konnte nicht geändert werden.', 'err'); return }
    setEditingTopic(false)
    setNoReport(true)
    flash_('Thema geändert. Starte eine Analyse für neue Scores.')
  }

  const onAddCompetitor = async () => {
    if (!compName.trim()) { flash_('Name des Wettbewerbers angeben.', 'err'); return }
    setCompBusy(true)
    const topics = compTopics.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10)
    const r = await addCompetitor({ name: compName.trim(), topics, language: status?.language || 'de' })
    setCompBusy(false)
    if (!r.ok) { flash_(r.error || 'Anlegen fehlgeschlagen.', 'err'); return }
    setCompName(''); setCompTopics('')
    flash_('Wettbewerber angelegt. Klicke „Analysieren" für einen Score.')
  }

  const onAnalyzeCompetitor = async (id) => {
    setRowBusy(id)
    const r = await analyzeCompetitor(id)
    setRowBusy(null)
    flash_(r.ok ? 'Wettbewerber analysiert.' : (r.error || 'Analyse fehlgeschlagen.'), r.ok ? 'ok' : 'err')
  }

  const onRemoveCompetitor = async (id) => {
    setRowBusy(id)
    const r = await removeCompetitor(id)
    setRowBusy(null)
    if (!r.ok) flash_(r.error || 'Löschen fehlgeschlagen.', 'err')
  }

  const summary = scores?.summary

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={page}>
      {flash && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, background: flash.type === 'err' ? '#FEF2F2' : '#F0FDF4', color: flash.type === 'err' ? '#991B1B' : '#065F46', border: '1px solid ' + (flash.type === 'err' ? '#FECACA' : '#A7F3D0'), boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxWidth: 360 }}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(99,102,241,0.10)', color: '#0A6FB0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Globe size={26} />
        </div>
        <div>
          <h1 style={h1Style}>KI-Sichtbarkeit</h1>
          <div style={subStyle}>Wie gut wirst du in ChatGPT, Claude &amp; Co. gefunden? — powered by Auralis</div>
        </div>
      </div>

      {/* Zustand 1: Add-on nicht abonniert */}
      {!addonsLoading && !hasAddon && (
        <div style={{ ...card, background: '#FFF7ED', border: '1px solid #FED7AA' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>🛒</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#9A3412', marginBottom: 4 }}>KI-Sichtbarkeit ist ein Marketplace-Add-on</div>
              <div style={{ fontSize: 13, color: '#7C2D12', lineHeight: 1.55, marginBottom: 14 }}>
                Schalte das Add-on für 9&nbsp;€/Monat frei und sieh, wie gut du und dein Thema in den großen
                KI-Modellen auffindbar sind — inklusive Wettbewerber-Vergleich, direkt hier im Branding-Bereich.
              </div>
              <button type="button" onClick={() => navigate('/marketplace?addon_focus=auralis')} style={btnPrimary(false)}>
                Zum Marketplace →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ab hier: Add-on aktiv */}
      {hasAddon && (
        <>
          {/* Lade-/Fehlerzustand des Hooks */}
          {loading && <div style={{ ...card, color: 'var(--text-muted)' }}>Lade KI-Sichtbarkeit…</div>}

          {!loading && error && error.code !== 'NOT_PROVISIONED' && (
            <div style={{ ...card, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
              {error.error || 'Fehler beim Laden.'}
            </div>
          )}

          {/* Zustand 2: Onboarding (abonniert, nicht eingerichtet) */}
          {!loading && !provisioned && (!error || error.code === 'NOT_PROVISIONED' || error.code === 'ERROR') && (
            <div style={card}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>Einrichtung</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 18 }}>
                Wir legen für dein Team ein Auralis-Profil an. Auralis fragt KI-Modelle zu deinem Namen und
                deinem Thema ab. Dein Thema kannst du später jederzeit anpassen — den Namen bitte sorgfältig wählen,
                er lässt sich nachträglich nicht ändern.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Dein Name (oder Marke)</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Max Mustermann" style={inp} />
                </div>
                <div>
                  <label style={labelStyle}>Dein Thema</label>
                  <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="z.B. B2B-Vertrieb auf LinkedIn" style={inp} />
                </div>
              </div>
              <button type="button" data-tour-id="auralis-activate" onClick={onProvision} disabled={provisioning} style={btnPrimary(provisioning)}>
                {provisioning ? 'Wird eingerichtet…' : 'KI-Sichtbarkeit aktivieren'}
              </button>
            </div>
          )}

          {/* Zustand 3: Eingerichtet */}
          {!loading && provisioned && (
            <>
              {/* Profil-Zeile + Analyse-Button */}
              <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{status.full_name}</div>
                  {editingTopic ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <input
                        value={topicDraft}
                        onChange={(e) => setTopicDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onSaveTopic(); if (e.key === 'Escape') setEditingTopic(false) }}
                        placeholder="Dein Thema"
                        autoFocus
                        style={{ ...inp, width: 'auto', flex: '1 1 220px', padding: '7px 10px' }}
                      />
                      <button type="button" onClick={onSaveTopic} disabled={savingTopic} style={{ ...btnGhost(), padding: '7px 12px' }}>
                        {savingTopic ? 'Speichern…' : 'Speichern'}
                      </button>
                      <button type="button" onClick={() => setEditingTopic(false)} disabled={savingTopic} style={{ ...btnGhost('#6B7280'), padding: '7px 12px' }}>
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      Thema: <strong>{status.topic_query}</strong>
                      <button type="button" onClick={onStartEditTopic} title="Thema ändern"
                        style={{ marginLeft: 8, background: 'none', border: 'none', color: PRIMARY, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}>
                        Bearbeiten
                      </button>
                      {summary ? <div style={{ marginTop: 2 }}>{summary}</div> : null}
                    </div>
                  )}
                </div>
                <button type="button" onClick={onAnalyzeSelf} disabled={analyzing} style={{ ...btnPrimary(analyzing), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <RefreshCw size={15} />{analyzing ? 'Analyse läuft…' : 'Jetzt analysieren'}
                </button>
              </div>

              {/* Scores */}
              {noReport && !scores && (
                <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Noch keine Analyse vorhanden. Klicke oben auf <strong>„Jetzt analysieren"</strong>, um deine ersten Scores zu erhalten (dauert ~10–30 Sek).
                </div>
              )}

              {scores && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
                    {SCORE_META.map(({ key, label, Icon, hint }) => {
                      const s = scores[key] || {}
                      const v = s.value
                      const col = scoreColor(v)
                      return (
                        <div key={key} style={{ ...card, margin: 0, padding: '18px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <Icon size={16} color={col} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{label}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                            <span style={{ fontSize: 30, fontWeight: 800, color: col }}>{v ?? '—'}</span>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>/100</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 99, background: '#F1F5F9', marginTop: 8, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, v || 0))}%`, background: col, borderRadius: 99 }} />
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{s.band || hint}</div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Kennzahlen-Zeile */}
                  <div style={{ ...card, display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                    <Metric label="Erwähnungsrate" value={scores.mention_rate != null ? `${scores.mention_rate}%` : '—'} />
                    <Metric label="Ø Position" value={scores.average_position != null ? scores.average_position : '—'} />
                    <Metric label="Modelle" value={(scores.providers_used || []).length || (scores.per_model || []).length || '—'} />
                    <Metric label="Letzte Analyse" value={scores.queried_at ? new Date(scores.queried_at).toLocaleDateString('de-DE') : '—'} />
                  </div>
                </>
              )}

              {/* Wettbewerber */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Target size={18} color={PRIMARY} />
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>Wettbewerber</div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· KI-Sichtbarkeit im Vergleich</span>
                </div>

                {/* Add-Form */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: competitors.length ? 18 : 4 }}>
                  <input value={compName} onChange={e => setCompName(e.target.value)} placeholder="Name des Wettbewerbers" style={{ ...inp, flex: '1 1 200px', width: 'auto' }} />
                  <input value={compTopics} onChange={e => setCompTopics(e.target.value)} placeholder="Themen, kommagetrennt (optional)" style={{ ...inp, flex: '1 1 220px', width: 'auto' }} />
                  <button type="button" onClick={onAddCompetitor} disabled={compBusy} style={{ ...btnPrimary(compBusy), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={15} />{compBusy ? 'Lege an…' : 'Hinzufügen'}
                  </button>
                </div>

                {competitors.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
                    Noch keine Wettbewerber. Füge oben jemanden hinzu, um die KI-Sichtbarkeit zu vergleichen.
                  </div>
                )}

                {competitors.map((c) => {
                  const busy = rowBusy === c.id
                  const col = scoreColor(c.last_score)
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 11, border: '1px solid var(--border, #E4E7EC)', marginBottom: 8, background: 'var(--surface)' }}>
                      <div style={{ width: 44, textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: col }}>{c.last_score ?? '—'}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(c.topics || []).join(' · ') || 'Keine Themen'}
                          {c.last_analyzed_at ? <> · zuletzt {new Date(c.last_analyzed_at).toLocaleDateString('de-DE')}</> : <> · noch nicht analysiert</>}
                        </div>
                      </div>
                      <button type="button" onClick={() => onAnalyzeCompetitor(c.id)} disabled={busy} style={{ ...btnGhost(), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Zap size={13} />{busy ? '…' : 'Analysieren'}
                      </button>
                      <button type="button" onClick={() => onRemoveCompetitor(c.id)} disabled={busy} title="Entfernen" style={{ ...btnGhost('#DC2626'), padding: '8px 10px' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong)', marginTop: 3 }}>{value}</div>
    </div>
  )
}
