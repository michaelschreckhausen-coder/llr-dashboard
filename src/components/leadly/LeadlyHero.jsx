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
function cleanupMd(s) {
  return String(s || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~|]+/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveEssence(briefingText, contextJson) {
  // 1. Bevorzugt: dediziertes Essenz-Feld aus der Briefing-EF
  const fromEF = contextJson?.essence;
  if (fromEF && String(fromEF).trim()) return String(fromEF).trim();
  // 2. Fallback: „Mein Tipp"-Zeile des Briefings (handlungsorientierter Satz)
  const tip = String(briefingText || '').match(/Tipp:?\*{0,2}\s*([^\n]+)/i);
  if (tip && tip[1] && cleanupMd(tip[1]).length > 20) {
    const t = cleanupMd(tip[1]);
    return t.length > 220 ? t.slice(0, 220).trimEnd() + '…' : t;
  }
  // 3. Letzter Fallback: erste Sätze (ohne Begrüßungs-Boilerplate)
  if (!briefingText) return '';
  const plain = String(briefingText)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  let parts = plain.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/);
  // Begrüßungs-/Boilerplate-Sätze überspringen ("Guten Morgen!", "Hier dein
  // Überblick …") — die Begrüßung spricht schon der Hero selbst.
  const boiler = /^(guten\s+(morgen|tag|abend)|hallo|hi|hey|servus|moin)\b|^hier\s+(ist\s+)?dein\s+(überblick|briefing)/i;
  while (parts.length > 1 && boiler.test(parts[0].trim())) parts = parts.slice(1);
  // Falls der erste Satz Gruß + Doppelpunkt-Einleitung kombiniert
  // ("Guten Morgen! Hier dein Überblick für heute: Du hast …") → Teil nach ":" behalten.
  if (boiler.test(parts[0]?.trim() || '') && parts[0].includes(':')) {
    parts[0] = parts[0].slice(parts[0].indexOf(':') + 1).trim();
  }
  let essence = parts.slice(0, 2).join(' ').trim();
  if (essence) essence = essence.charAt(0).toUpperCase() + essence.slice(1);
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

export default function LeadlyHero({ firstName, leadly, stats = {}, onOpenTasks, layout = 'classic', analyticsSlot = null, planSlot = null, leftControl = null, rightControl = null }) {
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

  // Stimme ist OPT-IN: Wenn der User noch nie eine Wahl getroffen hat
  // (kein localStorage-Key), einmalig auf stumm initialisieren.
  const ttsInitRef = useRef(false);
  useEffect(() => {
    if (ttsInitRef.current) return;
    ttsInitRef.current = true;
    try {
      if (window.localStorage?.getItem('leadly_tts_muted') == null && !tts.muted) {
        tts.toggleMuted();
      }
    } catch { /* ignore */ }
  }, [tts]);

  const briefingText = leadly.briefing?.briefing_text || '';
  const briefingCtx = leadly.briefing?.context_json || null;
  const essence = useMemo(() => deriveEssence(briefingText, briefingCtx), [briefingText, briefingCtx]);

  const engage = useCallback(() => {
    setEngaged(true);
    if (engageStartRef.current == null) engageStartRef.current = leadly.messages.length;
    leadly.markBriefingRead?.();
  }, [leadly]);

  // Während des Sendens die eigene Nachricht stabil anzeigen: useLeadly ersetzt
  // die optimistische Message zwischenzeitlich durch den DB-Load der lazy
  // angelegten Konversation (Panel-Verhalten) — der Hero überbrückt das hier.
  const [pendingUserText, setPendingUserText] = useState(null);

  const handleSend = useCallback((value) => {
    const v = (value || '').trim();
    if (!v) return;
    engage();
    setText('');
    setPendingUserText(v);
    leadly.sendMessage?.(v);
  }, [engage, leadly]);

  const voice = useVoiceInput({
    language: 'de-DE',
    onFinalTranscript: (t) => { const v = (t || '').trim(); if (v) handleSend(v); },
  });

  // ── Typewriter für die Essenz — nur beim ERSTEN Besuch des Tages ──
  const typedKey = `leadly_essence_typed_${leadly.briefing?.briefing_date || new Date().toISOString().slice(0, 10)}`;
  const alreadyTypedToday = (() => { try { return window.localStorage?.getItem(typedKey) === '1'; } catch { return false; } })();
  useEffect(() => { setTypedChars(alreadyTypedToday && essence ? essence.length : 0); }, [essence, alreadyTypedToday]);
  useEffect(() => {
    if (!essence || typedChars >= essence.length) {
      if (essence && typedChars >= essence.length) { try { window.localStorage?.setItem(typedKey, '1'); } catch { /* ignore */ } }
      return undefined;
    }
    const id = setTimeout(() => setTypedChars(c => Math.min(essence.length, c + 3)), 24);
    return () => clearTimeout(id);
  }, [essence, typedChars, typedKey]);

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

  // Synthetische User-Bubble erst auflösen, wenn die PERSISTIERTE Nachricht da
  // ist (die optimistische 'opt-…'-Message wird vom Conversation-Load kurzzeitig
  // weggewischt — sie zählt deshalb nicht als Ablösung).
  const hasPersistedUserMsg = !!pendingUserText && visibleMessages.some(
    m => m.role === 'user' && m.content === pendingUserText && !String(m.id).startsWith('opt-')
  );
  const pendingUserShown = !!pendingUserText && !hasPersistedUserMsg;
  useEffect(() => {
    if (pendingUserText && hasPersistedUserMsg) setPendingUserText(null);
  }, [pendingUserText, hasPersistedUserMsg]);

  // Auto-Scroll ans Ende des Threads
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [visibleMessages.length, leadly.isSending, leadly.pendingActions, pendingUserShown]);

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

  const isCockpit = layout === 'cockpit';
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    // Desktop-Default (Wide): nur bei ECHT gemessener kleiner Breite auf Schmal wechseln.
    const check = () => {
      const w = window.innerWidth || document.documentElement.clientWidth || 0;
      setIsNarrow(w > 0 && w < 900);
    };
    check();
    const t = setTimeout(check, 300);
    window.addEventListener('resize', check);
    return () => { clearTimeout(t); window.removeEventListener('resize', check); };
  }, []);

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
      position: 'relative',
      background: colors.white,
      border: `1px solid ${colors.border}`,
      borderRadius: 18,
      boxShadow: '0 1px 3px rgba(15,23,42,.05)',
      padding: isCockpit ? 'clamp(60px, 3.6vw, 66px) clamp(16px, 2.5vw, 26px) clamp(16px, 2.5vw, 26px)' : 'clamp(16px, 2.5vw, 26px)',
      marginTop: isCockpit ? 66 : 0,
      marginBottom: space[8],
    }}>
      {isCockpit && (
        <>
          <div style={{ position: 'absolute', top: -68, left: '50%', transform: 'translateX(-50%)', width: 142, height: 71, background: colors.white, borderTop: `1px solid ${colors.border}`, borderLeft: `1px solid ${colors.border}`, borderRight: `1px solid ${colors.border}`, borderRadius: '71px 71px 0 0', zIndex: 1 }} />
          <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>
            <LeadlyOrb state={orbState} size={124} />
          </div>
          {leftControl && (
            <div style={{ position: 'absolute', top: 13, right: 'calc(50% + 82px)', zIndex: 5 }}>{leftControl}</div>
          )}
          {rightControl && (
            <div style={{ position: 'absolute', top: 13, left: 'calc(50% + 82px)', zIndex: 5 }}>{rightControl}</div>
          )}
        </>
      )}
      <style>{`
        @keyframes leadly-hero-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
          50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
        @keyframes leadly-hero-dot {
          0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; }
        }
      `}</style>

      {/* ── Kopf: Orb + Begrüßung (+ Cockpit-Slots) ── */}
      {(() => {
        const greetingCore = (
          <>
            <div style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.12, color: colors.ink, marginTop: 3 }}>
              {salute}, {firstName || 'dort'} 👋
            </div>
            <div style={{ fontSize: 15.5, lineHeight: 1.55, color: colors.ink, fontWeight: 450, marginTop: 8, maxWidth: '62ch', minHeight: 24 }}>
              {essence
                ? <>{essenceShown}{typedChars < essence.length && <span style={{ opacity: 0.4 }}>▍</span>}</>
                : briefingWaited
                  ? 'Heute liegt nichts Dringendes an — frag mich einfach, womit ich helfen kann.'
                  : <span style={{ color: colors.inkMuted }}>Leadly schaut sich deinen Tag an …</span>}
            </div>
          </>
        );
        if (isCockpit) {
          return (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, color: colors.inkMuted, fontWeight: 500 }}>{dateLabel}</div>
              <div style={{ maxWidth: 520, margin: '4px auto 0' }}>{greetingCore}</div>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', gap: 'clamp(14px, 2.5vw, 26px)', alignItems: 'center', flexWrap: 'wrap' }}>
            <LeadlyOrb state={orbState} size={104} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: colors.inkMuted, fontWeight: 500 }}>
                <span>{dateLabel}</span>
              </div>
              {greetingCore}
            </div>
          </div>
        );
      })()}

      {/* ── Inline-Thread (erscheint nach der ersten Interaktion) ── */}
      {engaged && (visibleMessages.length > 0 || pendingUserShown || leadly.isSending || leadly.pendingActions.length > 0) && (
        <div ref={threadRef} style={{
          marginTop: space[4], maxHeight: 400, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 10,
          paddingRight: 4,
        }}>
          {visibleMessages
            .filter(m => !(pendingUserShown && m.role === 'user' && m.content === pendingUserText && String(m.id).startsWith('opt-')))
            .map((m) => m.role === 'user' ? (
            <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '78%', background: 'var(--wl-primary, var(--primary, #0A6FB0))', color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '9px 14px', fontSize: 14, lineHeight: 1.5 }}>
              {m.content}
            </div>
          ) : (
            <div key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '92%', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ marginTop: 2, flexShrink: 0 }}><LeadlyOrb state="idle" size={26} /></div>
              <div style={{ background: colors.cream, border: `1px solid ${colors.border}`, borderRadius: '4px 14px 14px 14px', padding: '10px 14px', fontSize: 14, lineHeight: 1.6, color: colors.ink, minWidth: 0 }}>
                {renderMarkdown(m.content)}
              </div>
            </div>
          ))}

          {pendingUserShown && (
            <div style={{ alignSelf: 'flex-end', maxWidth: '78%', background: 'var(--wl-primary, var(--primary, #0A6FB0))', color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '9px 14px', fontSize: 14, lineHeight: 1.5 }}>
              {pendingUserText}
            </div>
          )}

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
              <button className="lk-btn lk-btn-primary" type="button" onClick={() => leadly.confirmAction?.(a)} disabled={leadly.isSending}
                style={{ opacity: leadly.isSending ? 0.6 : 1 }}>
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
        background: colors.cream, padding: '5px 5px 5px 14px',
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
        <button type="button" onClick={toggleVoiceOutput}
          title={tts.muted ? 'Leadly-Stimme aktivieren (liest Antworten vor · EU, opt-in)' : 'Leadly-Stimme stummschalten'}
          style={{ ...iconBtn(false), color: tts.muted ? colors.inkSoft : colors.primary }}>
          {tts.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button type="button"
          onClick={voice.isRecording ? voice.stop : voice.start}
          title={voice.isRecording ? 'Aufnahme stoppen' : 'Mit Leadly sprechen'}
          style={iconBtn(voice.isRecording)}>
          {voice.isRecording ? <Square size={14} /> : <Mic size={16} />}
        </button>
        <button type="submit" disabled={!text.trim()} aria-label="Senden"
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            border: text.trim() ? 'none' : `1px solid ${colors.border}`,
            background: text.trim() ? 'var(--wl-primary, var(--primary, #0A6FB0))' : 'transparent',
            color: text.trim() ? '#fff' : colors.inkSoft,
            cursor: text.trim() ? 'pointer' : 'not-allowed',
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
          {(() => {
            const stats2 = [
              leads > 0 && `${leads} ${leads === 1 ? 'Kontakt' : 'Kontakte'}`,
              activeDeals > 0 && `${activeDeals} ${activeDeals === 1 ? 'Deal' : 'Deals'}`,
              overdue > 0 && `${overdue} überfällig`,
              today > 0 && `${today} heute`,
            ].filter(Boolean);
            if (!stats2.length) return <span style={{ color: colors.inkSoft }}>Noch keine offenen Aufgaben</span>;
            return stats2.map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && <span aria-hidden="true">·</span>}
                <span style={{ color: s.includes('überfällig') ? colors.danger : undefined }}>{s}</span>
              </React.Fragment>
            ));
          })()}
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
              {showTranscript ? 'Briefing ausblenden' : 'Ganzes Briefing anzeigen'}
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
