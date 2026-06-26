// src/components/leadly/LeadlyStage.jsx
//
// Inkrement 1A der "Leadly bekommt ein Gesicht"-Initiative (Konzept
// Leadly_Gesicht_Konzept.md). Ersetzt den textlastigen Dashboard-Hero
// durch eine "Bühne": Leadlys Gesicht groß + gesprochene Kern-Essenz
// des Tages-Briefings + Eingabeleiste (sprechen ODER tippen).
//
// Scope 1A (reines Frontend, EU-safe, kein Live-Lip-Sync, kein TTS):
//   - Idle-Loop-Video aus public/ (Gradient-Avatar-Fallback wenn nicht da)
//   - Kern-Essenz client-seitig aus dem Briefing abgeleitet (kein Extra-Call)
//   - Voller Briefing-Text wandert hinter "Transkript einblenden"
//   - Eingabe (Text + Mikro) dispatcht das bestehende leadly:prompt-Event
//     → LeadlyBubble öffnet das Panel + sendet → Guardrail bleibt intakt
//
// Echtzeit-Voice (TTS, sprechende Antwort) = Inkrement 1B.
// Live-Lip-Sync-Avatar = Phase 2.

import React, { useMemo, useState } from 'react';
import { Mic, Square, ChevronDown, ChevronUp } from 'lucide-react';
import { colors, radii, space } from '../../theme';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { renderMarkdown } from '../../lib/renderMarkdown';

const LEADLY_GRADIENT = 'linear-gradient(135deg, #1E3A8A, #3B82F6)';

// Idle-Asset: sobald die Datei in public/ liegt, wird sie geladen; sonst
// fällt onError sauber auf den Gradient-Avatar zurück.
const IDLE_VIDEO = '/leadly-idle.mp4';
const IDLE_POSTER = '/leadly-poster.jpg';

// ─── Kern-Essenz aus dem Briefing ableiten (client-seitig, fallback-first) ──
// Markdown wird entschärft, dann die ersten 1–2 Sätze als gesprochene Essenz.
function deriveEssence(briefingText) {
  if (!briefingText) return '';
  const plain = String(briefingText)
    .replace(/```[\s\S]*?```/g, ' ')     // Code-Fences
    .replace(/[#>*_`~|-]+/g, ' ')          // Markdown-Marker
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')    // Links → Text
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  // Satz-Ende = . ! ? gefolgt von Leerzeichen + Großbuchstabe (oder Text-Ende).
  // Verhindert Splits an Datums-/Zahlen-Punkten wie "29." oder "z. B.".
  const parts = plain.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/);
  let essence = parts.slice(0, 2).join(' ').trim();
  if (essence.length > 240) {
    const cut = essence.slice(0, 240);
    const lastSpace = cut.lastIndexOf(' ');
    essence = (lastSpace > 180 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
  }
  return essence;
}

// dispatcht in den bestehenden Leadly-Flow (Bubble öffnet Panel + sendet)
const askLeadly = (text) =>
  window.dispatchEvent(new CustomEvent('leadly:prompt', { detail: { text } }));

export default function LeadlyStage({
  firstName,
  briefingText = '',
  isBriefingLoading = false,
  stats = {},
  onOpenTasks,
}) {
  const [text, setText] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [videoOk, setVideoOk] = useState(true);

  const voice = useVoiceInput({
    language: 'de-DE',
    onFinalTranscript: (t) => {
      const transcript = (t || '').trim();
      if (transcript) askLeadly(transcript);
    },
  });

  const essence = useMemo(() => deriveEssence(briefingText), [briefingText]);

  const submit = (e) => {
    e?.preventDefault?.();
    const value = text.trim();
    if (!value) return;
    setText('');
    askLeadly(value);
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const now = new Date();
  const { leads = 0, activeDeals = 0, overdue = 0, today = 0 } = stats;

  return (
    <div style={{
      display: 'flex', gap: space[6], alignItems: 'stretch',
      flexWrap: 'wrap', marginBottom: space[8],
    }}>
      {/* ── Bühne links: Leadlys Gesicht ── */}
      <div style={{
        flex: '0 0 240px', minWidth: 200, maxWidth: 280,
        borderRadius: radii.lg, overflow: 'hidden',
        background: LEADLY_GRADIENT,
        position: 'relative', aspectRatio: '3 / 4',
        boxShadow: '0 18px 44px rgba(15, 23, 42, 0.18)',
      }}>
        {videoOk ? (
          <video
            src={IDLE_VIDEO}
            poster={IDLE_POSTER}
            autoPlay muted loop playsInline
            onError={() => setVideoOk(false)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          // Gradient-Avatar-Fallback bis das Idle-Loop-Video in public/ liegt
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 96, height: 96, borderRadius: '50%',
              background: 'rgba(255,255,255,0.16)',
              border: '2px solid rgba(255,255,255,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 44, fontWeight: 800, letterSpacing: -2,
              animation: 'leadly-stage-breathe 3.6s ease-in-out infinite',
            }}>L</div>
          </div>
        )}
        {/* Name-Badge unten */}
        <div style={{
          position: 'absolute', left: 12, bottom: 12,
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(6px)',
          borderRadius: radii.pill || 999, padding: '5px 11px 5px 8px',
          color: '#fff',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 0 3px rgba(52,211,153,0.25)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>Leadly</span>
        </div>
      </div>

      {/* ── Gespräch rechts ── */}
      <div style={{ flex: '1 1 360px', minWidth: 300, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, color: colors.inkMuted, fontWeight: 500, marginBottom: space[1] }}>
          {now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div style={{
          fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 600,
          letterSpacing: '-0.03em', lineHeight: 1.1, color: colors.ink,
          marginBottom: space[3],
        }}>
          Hallo {firstName || 'dort'} 👋
        </div>

        {/* Gesprochene Kern-Essenz */}
        <div style={{
          fontSize: 17, lineHeight: 1.5, color: colors.ink,
          fontWeight: 500, maxWidth: '54ch',
        }}>
          {isBriefingLoading && !essence
            ? <span style={{ color: colors.inkMuted }}>Leadly schaut sich deinen Tag an …</span>
            : (essence || 'Heute liegt nichts Dringendes an — frag mich, womit ich helfen kann.')}
        </div>

        {/* Transkript-Toggle (voller Briefing-Text) */}
        {briefingText && (
          <div style={{ marginTop: space[3] }}>
            <button type="button" onClick={() => setShowTranscript(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'transparent', border: 'none', padding: 0,
                color: colors.primary, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              {showTranscript ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              {showTranscript ? 'Transkript ausblenden' : 'Transkript einblenden'}
            </button>
            {showTranscript && (
              <div style={{
                marginTop: space[2], background: colors.white,
                border: `1px solid ${colors.border}`, borderRadius: radii.lg,
                padding: '14px 18px', fontSize: 14.5, lineHeight: 1.6, color: colors.ink,
              }}>
                {renderMarkdown(briefingText)}
              </div>
            )}
          </div>
        )}

        {/* Eingabeleiste — sprechen oder tippen */}
        <form onSubmit={submit} style={{
          marginTop: space[4],
          display: 'flex', gap: 8, alignItems: 'flex-end',
          border: `1.5px solid ${colors.border}`, borderRadius: 14,
          background: colors.white, padding: '8px 8px 8px 14px',
          boxShadow: '0 1px 3px rgba(15,23,42,.04)',
        }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={voice.isRecording
              ? (voice.mode === 'web' ? (voice.liveTranscript || 'Sprich jetzt…') : 'Nehme auf…')
              : 'Sprich mit Leadly oder tippe…'}
            rows={1}
            disabled={voice.isRecording}
            style={{
              flex: 1, border: 'none', padding: '8px 4px', fontSize: 15,
              fontFamily: 'inherit', resize: 'none', outline: 'none',
              minHeight: 24, maxHeight: 120, background: 'transparent', color: colors.ink,
            }}
          />
          <button type="button"
            onClick={voice.isRecording ? voice.stop : voice.start}
            title={voice.isRecording ? 'Aufnahme stoppen' : 'Sprach-Eingabe'}
            style={{
              width: 40, height: 40, borderRadius: 10, border: 'none', flexShrink: 0,
              background: voice.isRecording ? '#EF4444' : '#F1F5F9',
              color: voice.isRecording ? '#fff' : '#475569',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: voice.isRecording ? 'leadly-pulse 1.2s infinite' : 'none',
            }}>
            {voice.isRecording ? <Square size={16} /> : <Mic size={18} />}
          </button>
          <button type="submit" disabled={!text.trim()}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none', flexShrink: 0,
              background: text.trim() ? LEADLY_GRADIENT : '#CBD5E1', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'not-allowed',
            }}>
            ↑
          </button>
        </form>
        {voice.error && (
          <div style={{ marginTop: 6, fontSize: 12, color: colors.danger }}>{voice.error}</div>
        )}

        {/* Schlanke KPI-Zeile */}
        <div style={{ fontSize: 13, color: colors.inkMuted, marginTop: space[4] }}>
          {leads} {leads === 1 ? 'Kontakt' : 'Kontakte'}
          {' · '}{activeDeals} {activeDeals === 1 ? 'Deal aktiv' : 'Deals aktiv'}
          {' · '}{overdue} überfällig
          {' · '}{today} heute fällig
          {' · '}
          <button type="button" onClick={onOpenTasks}
            style={{ background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 }}>
            alle Aufgaben →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes leadly-stage-breathe {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        @keyframes leadly-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
          50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}
