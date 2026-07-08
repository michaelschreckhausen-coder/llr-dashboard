// src/components/leadly/LeadlyHero.jsx
//
// Command-Center-Hero der Startseite (Phase 1 der neuen Leadly-Startseite):
// Leadly begrüßt mit Gesicht (LeadlyOrb, Favicon-Brille), Tages-Essenz aus
// dem Briefing (Typewriter), Eingabe per Text ODER Sprache, Antworten
// erscheinen INLINE auf der Startseite (nicht nur im Side-Panel), inkl.
// Bestätigungs-Guardrail (pending_action → Ausführen/Verwerfen) und Undo.
//
// Wichtig: nutzt die Leadly-Instanz des Dashboards (Prop `leadly`) — dieselbe
// Konversation, derselbe Guardrail-Flow wie im Panel. Der globale Bubble
// bleibt unangetastet (eigene Instanz, eigene Events leadly:prompt/action).
//
// Events (nur Startseite):
//   leadly:hero-prompt  { text }   → Hero engagiert + sendet inline
//   leadly:hero-action  { action } → Hero engagiert + zeigt Confirm-Karte
//
// Stimme: Azure Speech EU über bestehende speak-EF, strikt opt-in
// (Lautsprecher-Toggle, persistiert). Datenminimierung: nur Antworttext.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Mic, Square, Volume2, VolumeX, ChevronDown, ChevronUp, ArrowUp, RotateCcw } from 'lucide-react';
import { colors, radii, space } from '../../theme';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useTextToSpeech } from '../../hooks/useTextToSpeech';
import { renderMarkdown } from '../../lib/renderMarkdown';
import LeadlyOrb from './LeadlyOrb';

// ─── Kern-Essenz aus dem Briefing ableiten (client-seitig) ───────────────
function deriveEssence(briefingText) {
  if (!briefingText) return '';
  const plain = String(briefingText)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  const parts = plain.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/);
  let essence = parts.slice(0, 2).join(' ').trim();
  if (essence.length > 240) {
    const cut = essence.slice(0, 240);
    const lastSpace = cut.lastIndexOf(' ');
    essence = (lastSpace > 180 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
  }
  return essence;
}

const QUICK_CHIPS = [
  'Was steht heute an?',
  'Priorisiere meine Aufgaben',
  'Wie läuft meine Pipeline?',
  'Was sollte ich diese Woche posten?',
];

export default function LeadlyHero({ firstName, leadly, stats = {}, onOpenTasks }) {
  const [text, setText] = useState('');
  const [engaged, setEngaged] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [happyUntil, setHappyUntil] = useState(0);
  const [, forceTick] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [briefingWaited, setBriefingWaited] = useState(false);

  const containerRef = useRef(null);
  const threadRef = useRef(null);
  const engageStartRef = useRef(null);
  const spokenIdsRef = useRef(new Set());
  const mountTimeRef = useRef(Date.now());

  const tts = useTextToSpeech();

  const briefingText = leadly.briefing?.briefing_text || '';
  const essence = useMemo(() => deriveEssence(briefingText), [briefingText]);

  const engage = useCallback(() => {
    setEngaged(true);
    if (engageStartRef.current == null) engageStartRef.current = leadly.messages.length;
    leadly.markBriefingRead?.();
  }, [leadly]);

  const handleSend = useCallback((value) => {
    const v = (value || '').trim();
    if (!v) return;
    engage();
    setText('');
    leadly.sendMessage?.(v);
  }, [engage, leadly]);

  const voice = useVoiceInput({
    language: 'de-DE',
    onFinalTranscript: (t) => { const v = (t || '').trim(); if (v) handleSend(v); },
  });

  // ── Typewriter für die Essenz ──
  useEffect(() => { setTypedChars(0); }, [essence]);
  useEffect(() => {
    if (!essence || typedChars >= essence.length) return undefined;
    const id = setTimeout(() => setTypedChars(c => Math.min(essence.length, c + 3)), 24);
    return () => clearTimeout(id);
  }, [essence, typedChars]);

  // Fallback-Text, falls das Briefing nicht (rechtzeitig) kommt
  useEffect(() => {
    const id = setTimeout(() => setBriefingWaited(true), 8000);
    return () => clearTimeout(id);
  }, []);

  // ── Hero-Events von den Vorschlagskarten ──
  useEffect(() => {
    const onPrompt = (e) => {
      const t = e?.detail?.text;
      if (t) handleSend(t);
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const onAction = (e) => {
      const action = e?.detail;
      if (!action?.name) return;
      engage();
      leadly.proposeAction?.(action);
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('leadly:hero-prompt', onPrompt);
    window.addEventListener('leadly:hero-action', onAction);
    return () => {
      window.removeEventListener('leadly:hero-prompt', onPrompt);
      window.removeEventListener('leadly:hero-action', onAction);
    };
  }, [handleSend, engage, leadly]);

  // ── Sichtbare Inline-Nachrichten (nur die dieser Session) ──
  const visibleMessages = useMemo(() => {
    if (!engaged || engageStartRef.current == null) return [];
    return leadly.messages
      .slice(engageStartRef.current)
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content);
  }, [engaged, leadly.messages]);

  // Auto-Scroll ans Ende des Threads
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [visibleMessages.length, leadly.isSending, leadly.pendingActions]);

  // ── Antworten vorlesen (opt-in) ──
  useEffect(() => {
    if (tts.muted || !engaged || !visibleMessages.length) return;
    const last = visibleMessages[visibleMessages.length - 1];
    if (last.role !== 'assistant' || !last.content) return;
    if (String(last.id).startsWith('err-')) return;
    if (spokenIdsRef.current.has(last.id)) return;
    if (new Date(last.created_at).getTime() < mountTimeRef.current) return;
    spokenIdsRef.current.add(last.id);
    tts.speak(last.content);
  }, [visibleMessages, tts, engaged]);

  // ── Happy-Moment nach erfolgreicher Aktion ──
  const prevRevertableRef = useRef(null);
  useEffect(() => {
    if (leadly.revertable && leadly.revertable !== prevRevertableRef.current) {
      setHappyUntil(Date.now() + 2600);
      const id = setTimeout(() => forceTick(t => t + 1), 2700);
      prevRevertableRef.current = leadly.revertable;
      return () => clearTimeout(id);
    }
    prevRevertableRef.current = leadly.revertable;
    return undefined;
  }, [leadly.revertable]);

  // ── Orb-Zustand ableiten ──
  const orbState = voice.isRecording ? 'listening'
    : leadly.isSending ? 'thinking'
    : tts.isSpeaking ? 'speaking'
    : Date.now() < happyUntil ? 'happy'
    : 'idle';

  const submit = (e) => { e?.preventDefault?.(); handleSend(text); };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const toggleVoiceOutput = () => {
    const wasMuted = tts.muted;
    tts.toggleMuted();
    // Beim Aktivieren (User-Geste vorhanden) die Essenz einmal vorlesen
    if (wasMuted && essence) tts.speak(essence);
  };

  const now = new Date();
  const dateLabel = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = now.getHours();
  const salute = hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : 'Guten Abend';
  const { leads = 0, activeDeals = 0, overdue = 0, today = 0 } = stats;

  const essenceShown = essence ? essence.slice(0, typedChars) : '';
  const chipStyle = {
    border: `1px solid ${colors.border}`, borderRadius: radii.pill,
    padding: '6px 13px', fontSize: 12.5, background: colors.white,
    color: colors.inkMuted, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
  };
  const iconBtn = (active) => ({
    width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
    background: active ? '#EF4444' : colors.white,
    color: active ? '#fff' : colors.inkMuted,
    boxShadow: active ? 'none' : '0 1px 2px rgba(15,23,42,.06)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    animation: active ? 'leadly-hero-pulse 1.2s infinite' : 'none',
  });

  return (
    <div ref={containerRef} style={{
      background: colors.white,
      border: `1px solid ${colors.border}`,
      borderRadius: 18,
      boxShadow: '0 1px 3px rgba(15,23,42,.05)',
      padding: 'clamp(16px, 2.5vw, 26px)',
      marginBottom: space[8],
    }}>
      <style>{`
        @keyframes leadly-hero-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
          50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
        @keyframes leadly-hero-dot {
          0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; }
        }
      `}</style>

      {/* ── Kopf: Orb + Begrüßung + Essenz ── */}
      <div style={{ display: 'flex', gap: 'clamp(14px, 2.5vw, 26px)', alignItems: 'center', flexWrap: 'wrap' }}>
        <LeadlyOrb state={orbState} size={104} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: colors.inkMuted, fontWeight: 500 }}>
            <span>{dateLabel}</span>
            <span aria-hidden="true">·</span>
            <span>Leadly</span>
            <button type="button" onClick={toggleVoiceOutput}
              title={tts.muted ? 'Leadly-Stimme aktivieren (EU, opt-in)' : 'Leadly-Stimme stummschalten'}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: tts.muted ? colors.inkSoft : colors.primary, display: 'inline-flex', alignItems: 'center', padding: 2 }}>
              {tts.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          </div>
          <div style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.12, color: colors.ink, marginTop: 3 }}>
            {salute}, {firstName || 'dort'} 👋
          </div>
          <div style={{ fontSize: 15.5, lineHeight: 1.55, color: colors.ink, fontWeight: 450, marginTop: 8, maxWidth: '62ch', minHeight: 24 }}>
            {essence
              ? <>{essenceShown}{typedChars < essence.length && <span style={{ opacity: 0.4 }}>▍</span>}</>
              : briefingWaited
                ? 'Heute liegt nichts Dringendes an — frag mich einfach, womit ich helfen kann.'
                : <span style={{ color: colors.inkMuted }}>Leadly schaut sich deinen Tag an …</span>}
          </div>
        </div>
      </div>

      {/* ── Inline-Thread (erscheint nach der ersten Interaktion) ── */}
      {engaged && (visibleMessages.length > 0 || leadly.isSending || leadly.pendingActions.length > 0) && (
        <div ref={threadRef} style={{
          marginTop: space[4], maxHeight: 400, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 10,
          paddingRight: 4,
        }}>
          {visibleMessages.map((m) => m.role === 'user' ? (
            <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '78%', background: 'var(--wl-primary, var(--primary, rgb(49,90,231)))', color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '9px 14px', fontSize: 14, lineHeight: 1.5 }}>
              {m.content}
            </div>
          ) : (
            <div key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '92%', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ marginTop: 2, flexShrink: 0 }}><LeadlyOrb state="idle" size={26} /></div>
              <div style={{ background: 'var(--page-bg, #F8FAFC)', border: `1px solid ${colors.border}`, borderRadius: '4px 14px 14px 14px', padding: '10px 14px', fontSize: 14, lineHeight: 1.6, color: colors.ink, minWidth: 0 }}>
                {renderMarkdown(m.content)}
              </div>
            </div>
          ))}

          {leadly.isSending && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ flexShrink: 0 }}><LeadlyOrb state="thinking" size={26} /></div>
              <div style={{ fontSize: 13, color: colors.inkMuted }}>
                Leadly arbeitet
                <span style={{ animation: 'leadly-hero-dot 1.2s infinite 0s' }}> ·</span>
                <span style={{ animation: 'leadly-hero-dot 1.2s infinite 0.2s' }}>·</span>
                <span style={{ animation: 'leadly-hero-dot 1.2s infinite 0.4s' }}>·</span>
              </div>
            </div>
          )}

          {leadly.pendingActions.map((a) => (
            <div key={a.tool_use_id} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              background: 'var(--primary-softer, #EFF4FF)', border: `1px solid ${colors.border}`,
              borderRadius: 12, padding: '10px 14px',
            }}>
              <span style={{ fontSize: 13, color: colors.ink, flex: 1, minWidth: 180 }}>
                <strong style={{ fontWeight: 600 }}>Leadly möchte:</strong> {a.summary || a.name}
              </span>
              <button type="button" onClick={() => leadly.confirmAction?.(a)} disabled={leadly.isSending}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--wl-primary, var(--primary, rgb(49,90,231)))', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: leadly.isSending ? 0.6 : 1 }}>
                Ausführen
              </button>
              <button type="button" onClick={() => leadly.dismissActions?.()}
                style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.white, color: colors.inkMuted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                Verwerfen
              </button>
            </div>
          ))}

          {leadly.revertable && !leadly.isSending && (
            <button type="button" onClick={() => leadly.revertLast?.()}
              style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: radii.pill, border: `1px solid ${colors.border}`, background: colors.white, color: colors.inkMuted, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              <RotateCcw size={13} /> Rückgängig: {leadly.revertable.label}
            </button>
          )}
        </div>
      )}

      {/* ── Eingabeleiste: tippen oder sprechen ── */}
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
            ? (voice.liveTranscript || 'Sprich jetzt …')
            : 'Frag Leadly oder gib einen Auftrag …'}
          rows={1}
          disabled={voice.isRecording}
          style={{
            flex: 1, border: 'none', padding: '7px 2px', fontSize: 14.5,
            fontFamily: 'inherit', resize: 'none', outline: 'none',
            minHeight: 22, maxHeight: 120, background: 'transparent', color: colors.ink,
          }}
        />
        <button type="button"
          onClick={voice.isRecording ? voice.stop : voice.start}
          title={voice.isRecording ? 'Aufnahme stoppen' : 'Mit Leadly sprechen'}
          style={iconBtn(voice.isRecording)}>
          {voice.isRecording ? <Square size={14} /> : <Mic size={16} />}
        </button>
        <button type="submit" disabled={!text.trim()} aria-label="Senden"
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
            background: text.trim() ? 'var(--wl-primary, var(--primary, rgb(49,90,231)))' : '#CBD5E1',
            color: '#fff', cursor: text.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <ArrowUp size={17} />
        </button>
      </form>
      {voice.error && (
        <div style={{ marginTop: 6, fontSize: 12, color: colors.danger }}>{voice.error}</div>
      )}

      {/* ── Quick-Chips (bis zur ersten Interaktion) ── */}
      {!engaged && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: space[3] }}>
          {QUICK_CHIPS.map((c) => (
            <button key={c} type="button" style={chipStyle} onClick={() => handleSend(c)}>{c}</button>
          ))}
        </div>
      )}

      {/* ── Fuß: KPIs · Datenschutz-Hinweis · Transkript ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8, marginTop: space[4],
        fontSize: 12.5, color: colors.inkMuted,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>{leads} {leads === 1 ? 'Kontakt' : 'Kontakte'}</span>
          <span aria-hidden="true">·</span>
          <span>{activeDeals} {activeDeals === 1 ? 'Deal' : 'Deals'}</span>
          <span aria-hidden="true">·</span>
          <span style={{ color: overdue > 0 ? colors.danger : undefined }}>{overdue} überfällig</span>
          <span aria-hidden="true">·</span>
          <span>{today} heute</span>
          <button type="button" onClick={onOpenTasks}
            style={{ background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, padding: 0, marginLeft: 4, textDecoration: 'underline', textUnderlineOffset: 2 }}>
            alle Aufgaben →
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span title="Leadly läuft auf eigener EU-Infrastruktur; Stimme (Azure EU) nur wenn aktiviert.">
            Verarbeitung EU · Stimme opt-in
          </span>
          {briefingText && (
            <button type="button" onClick={() => setShowTranscript(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', padding: 0, color: colors.inkMuted, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
              {showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Tages-Briefing
            </button>
          )}
        </div>
      </div>

      {/* ── Volles Briefing (aufklappbar) ── */}
      {briefingText && showTranscript && (
        <div style={{
          marginTop: space[3], paddingTop: space[3],
          borderTop: `1px solid ${colors.border}`,
          fontSize: 14, lineHeight: 1.6, color: colors.ink,
        }}>
          {renderMarkdown(briefingText)}
        </div>
      )}
    </div>
  );
}
