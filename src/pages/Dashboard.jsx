// src/pages/Dashboard.jsx
//
// Tagesreise-Layout (Morgens / Vormittags / Mittags / Nachmittags).
// Single-Path — keine Widget-Grid-Alternative mehr (Legacy-Code archiviert
// in src/pages/_archive/DashboardWidgetsLegacy.jsx, wird später für die
// geplante /cockpit-Surface wiederverwendet).
//
// Datenquelle: useDashboardData-Hook.
//   - Pipeline-Werte aus der deals-Tabelle (Top-Fallstrick #15)
//   - team-scoped + Solo-Fallback (Top-Fallstrick #14)
//   - SSI conditional: nur rendern wenn Daten vorhanden
//
// Refactored 2026-05-29 (1539 → ~480 LOC).

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { colors, radii, shadows, space, motion, typography } from '../theme';
import { useDashboardData } from '../hooks/useDashboardData';
import { useLeadly } from '../hooks/useLeadly';

// ─── Helpers ─────────────────────────────────────────────────────────────
const leadName = (l) => (`${l.first_name || ''} ${l.last_name || ''}`.trim() || l.name || '—');
const fmtEUR = (val) => val >= 1000
  ? `€${Math.round(val / 1000)}k`
  : `€${(val || 0).toLocaleString('de-DE')}`;

// ─── Inline-Styles (re-used aus altem Tagesreise-Code) ───────────────────
const block = { position: 'relative', marginBottom: space[12] };
const dot = (variant) => {
  const palette = {
    default: { bg: colors.white,   border: colors.primary },
    done:    { bg: colors.primary, border: colors.primary },
    urgent:  { bg: colors.danger,  border: colors.danger },
  }[variant] || { bg: colors.white, border: colors.primary };
  return {
    position: 'absolute', left: -28, top: 8,
    width: 14, height: 14, borderRadius: radii.pill,
    background: palette.bg, border: `2px solid ${palette.border}`,
    zIndex: 1,
  };
};
const timeMarker = {
  fontFamily: typography.fontHandwritten,
  fontWeight: 600, fontSize: 22,
  color: colors.accentBlue,
  lineHeight: 1, marginBottom: space[1],
};
const heading = {
  fontSize: 26, fontWeight: 600,
  letterSpacing: '-0.025em', lineHeight: 1.15,
  color: colors.ink, marginBottom: space[3],
};
const bodyText = {
  fontSize: 15, color: colors.inkMuted, lineHeight: 1.6,
  marginBottom: space[5], maxWidth: '60ch',
};
const card = {
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.lg,
  padding: '18px 22px',
  transition: `all ${motion.base}`,
  cursor: 'pointer',
};

// ─── Leadly-Vorschläge: 4 Prozessbereiche ────────────────────────────────
const AREA_META = {
  'follow-up': { key: 'follow-up', label: 'Follow-up', color: '#0369A1', bg: '#F0F9FF' },
  'kontakt':   { key: 'kontakt',   label: 'Kontakt',   color: '#047857', bg: '#ECFDF5' },
  'deal':      { key: 'deal',      label: 'Deal',      color: '#7C3AED', bg: '#F5F3FF' },
  'aufgabe':   { key: 'aufgabe',   label: 'Aufgabe',   color: '#B45309', bg: '#FFFBEB' },
};
// Task-Quelle → Bereich (für Task-basierte Karten)
const SUGGESTION_AREAS = {
  lead_followup:       AREA_META['follow-up'],
  deal_followup:       AREA_META['deal'],
  lead_task:           AREA_META['aufgabe'],
  pm_task:             AREA_META['aufgabe'],
  stale_lead:          AREA_META['kontakt'],
  linkedin_unanswered: AREA_META['kontakt'],
};

function suggestionReason(t) {
  if (!t.due_date) return '';
  const today = new Date().toISOString().split('T')[0];
  if (t.due_date < today) {
    const days = Math.round((new Date(today) - new Date(t.due_date)) / 86400000);
    return `überfällig seit ${days} Tag${days === 1 ? '' : 'en'}`;
  }
  if (t.due_date === today) return 'heute fällig';
  return '';
}

// Prompt, der beim "Übernehmen" an Leadly geht. Entwurf/lesend → Leadly antwortet
// direkt; schreibend → Leadly schlägt vor + Bestätigungs-Guardrail greift.
function suggestionPrompt(t) {
  const who = t.related?.leadName ? `${t.related.leadName}${t.related.company ? ` (${t.related.company})` : ''}` : null;
  switch (t.source) {
    case 'lead_followup':       return `Entwirf ein Follow-up für ${who || 'diesen Kontakt'}. Der Kontakt ist fällig — halte es kurz und konkret.`;
    case 'deal_followup':       return `Was ist der nächste sinnvolle Schritt für den Deal „${t.title}"? Mach mir einen konkreten Vorschlag.`;
    case 'lead_task':
    case 'pm_task':             return `Hilf mir, diese Aufgabe abzuarbeiten: „${t.title}". Schlag konkrete nächste Schritte vor.`;
    case 'stale_lead':          return `Der Kontakt ${who || 'dieser Lead'} ist seit einer Weile inaktiv. Wie reaktiviere/anreichere ich ihn am besten?`;
    case 'linkedin_unanswered': return `Entwirf eine Antwort auf die offene LinkedIn-Nachricht von ${who || 'diesem Kontakt'}.`;
    default:                    return `Hilf mir mit: „${t.title}".`;
  }
}

// ─── Hauptkomponente ─────────────────────────────────────────────────────
export default function Dashboard({ session }) {
  const nav = useNavigate();
  const data = useDashboardData({ session });
  const leadly = useLeadly({ autoOpenLatest: false });
  useEffect(() => { leadly.fetchBriefing?.(); }, [leadly.fetchBriefing]);

  // Affiliate-Discovery-Banner: nur wenn (noch) kein Affiliate + nicht dismissed.
  const [affBanner, setAffBanner] = useState(false);
  useEffect(() => {
    if (localStorage.getItem('lk_aff_banner_dismissed')) return;
    supabase.from('affiliates').select('id').maybeSingle().then(({ data: a }) => { if (!a) setAffBanner(true); });
  }, []);

  const {
    leads, ssi, firstName,
    isLoading,
    hotLeads, overdueTasks, todayTasks,
    activeDeals, wonDeals, lostDeals,
    pipelineValue, wonValue, winRate,
    connectedCount, hasSSI,
  } = data;

  // ⚠️ ALLE Hooks + abgeleitete Werte VOR jedem early-return — sonst React #310
  // (bedingte Hook-Anzahl). Quell-Arrays defensiv (|| []), da sie im Loading-State
  // leer/undefined sein können.
  const _overdue = overdueTasks || [];
  const _today = todayTasks || [];
  const _hot = hotLeads || [];
  const _deals = activeDeals || [];
  const dayTasks = [..._overdue, ..._today];

  // Leadly-Vorschläge: je Bereich aus der besten Quelle (Cap je Bereich → kein Überlauf).
  const SUG_CAP = 2;
  const taskCard = (t, i) => {
    const card = {
      id: t.id || `${t.source}-${i}`, area: SUGGESTION_AREAS[t.source],
      title: t.title, reason: suggestionReason(t), href: t.href, prompt: suggestionPrompt(t),
    };
    // lead_task → strukturierter Handoff mit echter task_id (id ist als "lead_task:<uuid>" geprefixt).
    if (t.source === 'lead_task' && typeof t.id === 'string' && t.id.startsWith('lead_task:')) {
      card.action = { name: 'complete_task', input: { task_id: t.id.slice('lead_task:'.length) }, summary: `Aufgabe als erledigt markieren: ${t.title}` };
    }
    return card;
  };
  const followupCards = dayTasks.filter(t => t.source === 'lead_followup').slice(0, SUG_CAP).map(taskCard);
  const kontaktCards = _hot.slice(0, SUG_CAP).map((l, i) => ({
    id: `lead-${l.id || i}`, area: AREA_META.kontakt, title: leadName(l),
    reason: `Score ${l.hs_score || l.lead_score || 0}${l.company ? ' · ' + l.company : ''}`,
    href: `/leads/${l.id}`,
    prompt: `Was ist der nächste sinnvolle Schritt mit ${leadName(l)}${l.company ? ` (${l.company})` : ''}? Schlag konkret vor — ggf. anreichern.`,
  }));
  const dealCards = [..._deals]
    .sort((a, b) => (a.expected_close_date || '9999').localeCompare(b.expected_close_date || '9999'))
    .slice(0, SUG_CAP).map((d, i) => ({
      id: `deal-${d.id || i}`, area: AREA_META.deal, title: d.title || 'Deal',
      reason: [d.stage, d.value ? fmtEUR(Number(d.value)) : null].filter(Boolean).join(' · '),
      href: `/deals?open=${d.id}`,
      prompt: `Was ist der nächste Schritt für den Deal „${d.title || 'Deal'}"? Mach mir einen konkreten Vorschlag.`,
    }));
  const aufgabeCards = _overdue
    .filter(t => t.source === 'lead_task' || t.source === 'pm_task')
    .slice(0, SUG_CAP).map(taskCard);
  const suggestions = [...followupCards, ...kontaktCards, ...dealCards, ...aufgabeCards];
  const briefingText = leadly.briefing?.briefing_text || '';
  const askLeadly = (text) => window.dispatchEvent(new CustomEvent('leadly:prompt', { detail: { text } }));
  const takeAction = (action) => window.dispatchEvent(new CustomEvent('leadly:action', { detail: action }));

  // B2.1 — LLM-Priorisierung/Begründung der Vorschläge über die bestehende generate-EF.
  // Rein lesend; bei Fehler/Parse-Problem greift der Regel-Fallback → Dashboard nie leer.
  const sugSig = suggestions.map(s => s.id).join('|');
  const [aiRank, setAiRank] = useState(null); // null = noch nicht / Fallback; Map id→{prio,grund}
  useEffect(() => {
    if (!sugSig) { setAiRank(null); return; }
    let cancelled = false;
    const cacheKey = `leadly_sug_rank_${new Date().toISOString().slice(0, 10)}_${sugSig}`;
    try { const c = sessionStorage.getItem(cacheKey); if (c) { setAiRank(new Map(JSON.parse(c))); return; } } catch { /* ignore */ }
    const payload = suggestions.map(s => ({ id: s.id, bereich: s.area.label, titel: s.title, info: s.reason }));
    const prompt =
      'Du bist Leadly, ein Sales-Assistent. Hier sind Vorschlags-Kandidaten für heute als JSON:\n'
      + JSON.stringify(payload)
      + '\n\nPriorisiere die wichtigsten für den Vertrieb heute. Antworte AUSSCHLIESSLICH mit einem JSON-Array '
      + '(keine Code-Fences): [{"id":"<id aus der Liste>","prio":<1=höchste Priorität, aufsteigend>,'
      + '"grund":"<knappe Begründung, max 1 kurzer Satz, Deutsch>"}]. Nutze nur IDs aus der Liste.';
    supabase.functions.invoke('generate', { body: { type: 'leadly_suggestion_rank', prompt, model: 'claude-haiku-4-5' } })
      .then(({ data, error }) => {
        if (cancelled || error || !data?.text) return;
        const m = String(data.text).match(/\[[\s\S]*\]/);
        if (!m) return;
        let arr; try { arr = JSON.parse(m[0]); } catch { return; }
        if (!Array.isArray(arr) || !arr.length) return;
        const entries = arr.filter(a => a && a.id != null).map(a => [String(a.id), { prio: Number(a.prio) || 99, grund: typeof a.grund === 'string' ? a.grund : null }]);
        if (!entries.length) return;
        try { sessionStorage.setItem(cacheKey, JSON.stringify(entries)); } catch { /* ignore */ }
        if (!cancelled) setAiRank(new Map(entries));
      })
      .catch(() => { /* Fallback bleibt aktiv */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugSig]);

  // Angezeigte Vorschläge: LLM-Reihenfolge/Begründung wenn vorhanden, sonst Regel-Logik.
  const displayedSuggestions = aiRank
    ? suggestions
        .map(s => ({ ...s, reason: aiRank.get(String(s.id))?.grund || s.reason, _prio: aiRank.get(String(s.id))?.prio ?? 99 }))
        .sort((a, b) => a._prio - b._prio)
    : suggestions;

  // ── Ab hier early-return erlaubt (keine Hooks mehr darunter) ──
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: colors.inkSoft, fontSize: 14 }}>
        Dashboard wird geladen…
      </div>
    );
  }

  const now = new Date();
  const totalOverdue = _overdue.length;

  return (
    <div>
      {affBanner && (
        <div onClick={() => nav('/settings/affiliate')} style={{
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
          padding: '10px 14px', marginBottom: space[6], fontSize: 13, color: '#92400E',
        }}>
          <span>💡 <strong>Wusstest du?</strong> Empfiehl Leadesk weiter und verdiene 20 % Provision für 12 Monate — <span style={{ textDecoration: 'underline' }}>Mehr erfahren →</span></span>
          <button onClick={(e) => { e.stopPropagation(); localStorage.setItem('lk_aff_banner_dismissed', '1'); setAffBanner(false); }}
            style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#92400E', cursor: 'pointer', fontSize: 15, fontWeight: 700 }} aria-label="Ausblenden">✕</button>
        </div>
      )}
      {/* Begrüßung — schlicht, ohne Karte */}
      <div style={{ marginBottom: space[6] }}>
        <div style={{ fontSize: 13, color: colors.inkMuted, fontWeight: 500, marginBottom: space[1] }}>
          {now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1, color: colors.ink }}>
          Hallo {firstName || 'dort'} 👋
        </div>
      </div>
      <div>

        {/* Leadly-Vorschläge — übernehmbare Aktionen in den 4 Bereichen */}
        {suggestions.length > 0 && (
          <div style={{ marginTop: space[5] }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: space[3] }}>
              Leadly schlägt vor
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: space[3] }}>
              {displayedSuggestions.map((s) => (
                <div key={s.id} style={{ background: colors.white, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: s.area.color, background: s.area.bg, padding: '2px 8px', borderRadius: radii.pill }}>{s.area.label}</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, lineHeight: 1.35 }}>{s.title}</div>
                  {s.reason && <div style={{ fontSize: 12, color: colors.inkMuted }}>{s.reason}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                    <button onClick={() => (s.action ? takeAction(s.action) : askLeadly(s.prompt))}
                      style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: colors.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Übernehmen
                    </button>
                    {s.href && (
                      <button onClick={() => nav(s.href)}
                        style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.white, color: colors.inkMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Öffnen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
