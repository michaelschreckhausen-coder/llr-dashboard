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
import LeadlyLogoSlot from './LeadlyLogoSlot';

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
  const dateLabel = now.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });

  return (
    <div style={{
      background: colors.white,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.xl || 18,
      boxShadow: '0 1px 3px rgba(15,23,42,.05)',
      padding: '20px 22px',
      marginBottom: space[8],
    }}>
      {/* ── Kopf: Logo + Begrüßung + Datum ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: space[4] }}>
        <LeadlyLogoSlot size="sm" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: colors.ink, lineHeight: 1.2 }}>
            Hallo {firstName || 'dort'} 👋
          </div>
          <div style={{ fontSize: 12.5, color: colors.inkMuted, marginTop: 1 }}>{dateLabel}</div>
        </div>
      </div>

      {/* ── Tages-Essenz (Fokus) ── */}
      <div style={{ fontSize: 18, lineHeight: 1.5, color: colors.ink, fontWeight: 500, maxWidth: '58ch' }}>
        {isBriefingLoading && !essence
          ? <span style={{ color: colors.inkMuted }}>Leadly schaut sich deinen Tag an …</span>
          : (essence || 'Heute liegt nichts Dringendes an — frag mich, womit ich helfen kann.')}
      </div>

      {/* ── Eingabeleiste — sprechen oder tippen (volle Kartenbreite) ── */}
      <form onSubmit={submit} style={{
        marginTop: space[4],
        display: 'flex', gap: 6, alignItems: 'center',
        border: `1px solid ${colors.border}`, borderRadius: 12,
        background: 'var(--page-bg, #F8FAFC)', padding: '5px 5px 5px 14px',
      }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={voice.isRecording
            ? ((voice.mode === 'web' || voice.mode === 'azure') ? (voice.liveTranscript || 'Sprich jetzt…') : 'Nehme auf…')
            : 'Sprich mit Leadly oder tippe…'}
          rows={1}
          disabled={voice.isRecording}
          style={{
            flex: 1, border: 'none', padding: '6px 2px', fontSize: 14.5,
            fontFamily: 'inherit', resize: 'none', outline: 'none',
            minHeight: 22, maxHeight: 120, background: 'transparent', color: colors.ink,
          }}
        />
        <button type="button"
          onClick={voice.isRecording ? voice.stop : voice.start}
          title={voice.isRecording ? 'Aufnahme stoppen' : 'Sprach-Eingabe'}
          style={{
            width: 34, height: 34, borderRadius: 9, border: 'none', flexShrink: 0,
            background: voice.isRecording ? '#EF4444' : colors.white,
            color: voice.isRecording ? '#fff' : '#475569',
            boxShadow: voice.isRecording ? 'none' : '0 1px 2px rgba(15,23,42,.06)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: voice.isRecording ? 'leadly-pulse 1.2s infinite' : 'none',
          }}>
          {voice.isRecording ? <Square size={14} /> : <Mic size={16} />}
        </button>
        <button type="submit" disabled={!text.trim()}
          style={{
            width: 34, height: 34, borderRadius: 9, border: 'none', flexShrink: 0,
            background: text.trim() ? LEADLY_GRADIENT : '#CBD5E1', color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          ↑
        </button>
      </form>
      {voice.error && (
        <div style={{ marginTop: 6, fontSize: 12, color: colors.danger }}>{voice.error}</div>
      )}

      {/* ── Fuß: KPI-Zeile links · Transkript-Link rechts ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8, marginTop: space[4],
        fontSize: 13, color: colors.inkMuted,
      }}>
        <div>
          {leads} {leads === 1 ? 'Kontakt' : 'Kontakte'}
          {' · '}{activeDeals} {activeDeals === 1 ? 'Deal' : 'Deals'}
          {' · '}{overdue} überfällig
          {' · '}{today} heute
          {'  '}
          <button type="button" onClick={onOpenTasks}
            style={{ background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0, marginLeft: 4, textDecoration: 'underline', textUnderlineOffset: 2 }}>
            alle Aufgaben →
          </button>
        </div>
        {briefingText && (
          <button type="button" onClick={() => setShowTranscript(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'transparent', border: 'none', padding: 0,
              color: colors.inkMuted, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
            }}>
            {showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showTranscript ? 'Transkript ausblenden' : 'Transkript'}
          </button>
        )}
      </div>

      {/* ── Transkript (voller Briefing-Text), in der Karte aufklappbar ── */}
      {briefingText && showTranscript && (
        <div style={{
          marginTop: space[3], paddingTop: space[3],
          borderTop: `1px solid ${colors.border}`,
          fontSize: 14, lineHeight: 1.6, color: colors.ink,
        }}>
          {renderMarkdown(briefingText)}
        </div>
      )}

      <style>{`
        @keyframes leadly-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
          50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}
