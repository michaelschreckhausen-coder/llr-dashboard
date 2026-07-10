// src/pages/Dashboard.jsx
//
// Command-Center-Startseite (Phase 1, Juli 2026):
//   - LeadlyHero: Leadly begrüßt mit Gesicht (Orb + Favicon-Brille),
//     Tages-Essenz, Eingabe per Text/Sprache, Antworten INLINE + Guardrail
//   - „Leadlys Plan für heute": LLM-priorisierte Vorschlagskarten (B2.1)
//     mit Prio-Nummer + „Alle durchgehen"-Handoff an den Hero
//
// Datenquelle: useDashboardData-Hook.
//   - Pipeline-Werte aus der deals-Tabelle (Top-Fallstrick #15)
//   - team-scoped + Solo-Fallback (Top-Fallstrick #14)

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { colors, radii, shadows, space, motion, typography } from '../theme';
import { useDashboardData } from '../hooks/useDashboardData';
import { useLeadly } from '../hooks/useLeadly';
import { detectLeadeskExtension } from '../lib/leadeskExtension';
import LeadlyHero from '../components/leadly/LeadlyHero';

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
  'deal':      { key: 'deal',      label: 'Deal',      color: '#003060', bg: '#F5F3FF' },
  'aufgabe':   { key: 'aufgabe',   label: 'Aufgabe',   color: '#B45309', bg: '#FFFBEB' },
  'content':   { key: 'content',   label: 'Content',   color: '#0F766E', bg: '#F0FDFA' },
};
// Task-Quelle → Bereich (für Task-basierte Karten)
const SUGGESTION_AREAS = {
  lead_followup:       AREA_META['follow-up'],
  deal_followup:       AREA_META['deal'],
  lead_task:           AREA_META['aufgabe'],
  pm_task:             AREA_META['aufgabe'],
  stale_lead:          AREA_META['kontakt'],
  linkedin_unanswered: AREA_META['kontakt'],
  content_post:        AREA_META['content'],
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
    case 'content_post':        return `Hilf mir, den Redaktionsplan-Beitrag „${t.title}" weiterzubringen (${t.description || 'Entwurf'}). Mach mir einen konkreten Vorschlag — gern direkt mit Textentwurf.`;
    default:                    return `Hilf mir mit: „${t.title}".`;
  }
}

// ─── Hauptkomponente ─────────────────────────────────────────────────────
export default function Dashboard({ session }) {
  const nav = useNavigate();
  const data = useDashboardData({ session });
  const leadly = useLeadly({ autoOpenLatest: false });
  const hasLoadedOnceRef = useRef(false);
  useEffect(() => { leadly.fetchBriefing?.(); }, [leadly.fetchBriefing]);

  // Affiliate-Discovery-Banner: nur wenn (noch) kein Affiliate + nicht dismissed.
  const [affBanner, setAffBanner] = useState(false);
  useEffect(() => {
    if (localStorage.getItem('lk_aff_banner_dismissed')) return;
    supabase.from('affiliates').select('id').maybeSingle().then(({ data: a }) => { if (!a) setAffBanner(true); });
  }, []);

  // Extension-Update-Hinweis: admin-gesteuert (system_banners), nur bei fehlender/zu alter Extension.
  const [extBanner, setExtBanner] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: b } = await supabase.from('system_banners').select('*').eq('key', 'extension_update').maybeSingle();
        if (cancelled || !b || !b.enabled) return;
        if (localStorage.getItem('lk_ext_banner_dismissed') === (b.min_version || '')) return; // pro Mindestversion ausblendbar
        const det = await detectLeadeskExtension();
        const cmp = (a, c) => {
          const pa = String(a || '0').split('.').map(n => parseInt(n) || 0);
          const pc = String(c || '0').split('.').map(n => parseInt(n) || 0);
          for (let i = 0; i < Math.max(pa.length, pc.length); i++) { const d = (pa[i] || 0) - (pc[i] || 0); if (d) return d; }
          return 0;
        };
        const needs = !det.installed || (b.min_version && cmp(det.version, b.min_version) < 0);
        if (!cancelled && needs) setExtBanner(b);
      } catch (_) { /* Tabelle evtl. noch nicht migriert — kein Banner */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const {
    leads, ssi, firstName,
    tasks,
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
      title: t.title,
      reason: suggestionReason(t) || (t.source === 'content_post' ? t.description : ''),
      href: t.href, prompt: suggestionPrompt(t),
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
  // Content/Redaktionsplan: heute fällige/überfällige Posts zuerst, dann
  // liegengebliebene unterminierte Entwürfe (aus dem vollen Task-Hub).
  // Substanz-Filter für unterminierte Entwürfe: Platzhalter-/Tipp-Titel
  // („(ohne Titel)", „asdfasf") gehören nicht in „Leadlys Plan für heute".
  const hasSubstance = (t) => {
    const title = (t.title || '').trim();
    if (!title || title === '(ohne Titel)') return false;
    return title.length >= 15 || (title.includes(' ') && title.length >= 8);
  };
  const _allTasks = tasks || [];
  const dueContent = dayTasks.filter(t => t.source === 'content_post');
  const stuckContent = _allTasks.filter(t => t.source === 'content_post' && !t.due_date && hasSubstance(t));
  const contentCards = [...dueContent, ...stuckContent].slice(0, SUG_CAP).map(taskCard);
  const suggestions = [...followupCards, ...kontaktCards, ...dealCards, ...contentCards, ...aufgabeCards];
  // Inline-Handoff an den LeadlyHero (Startseiten-Chat statt Side-Panel).
  const askLeadly = (text) => window.dispatchEvent(new CustomEvent('leadly:hero-prompt', { detail: { text } }));
  const takeAction = (action) => window.dispatchEvent(new CustomEvent('leadly:hero-action', { detail: action }));

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
    supabase.functions.invoke('generate', { body: { type: 'leadly_suggestion_rank', prompt } })
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
  // Loading-Screen NUR beim Erstload: useDashboardData refetcht alle 60s und
  // setzt isLoading erneut — ein early-return würde dann den kompletten Baum
  // (inkl. LeadlyHero-Inline-Chat) unmounten und allen State verlieren.
  if (!isLoading) hasLoadedOnceRef.current = true;
  if (isLoading && !hasLoadedOnceRef.current) {
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
      {extBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
          padding: '12px 16px', marginBottom: space[6], fontSize: 13, color: '#991B1B',
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: 'block', marginBottom: 2 }}>{extBanner.title || 'Wichtiges Extension-Update'}</strong>
            <span style={{ color: '#7F1D1D', lineHeight: 1.5 }}>{extBanner.message}</span>
          </div>
          {extBanner.cta_url && (
            <a href={extBanner.cta_url} target="_blank" rel="noopener noreferrer"
              style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 8, background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {extBanner.cta_label || 'Jetzt installieren'}
            </a>
          )}
          <button onClick={() => { localStorage.setItem('lk_ext_banner_dismissed', extBanner.min_version || '1'); setExtBanner(null); }}
            style={{ flexShrink: 0, border: 'none', background: 'transparent', color: '#991B1B', cursor: 'pointer', fontSize: 15, fontWeight: 700 }} aria-label="Ausblenden">✕</button>
        </div>
      )}
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
      {/* Leadly-Hero — Gesicht + Essenz + Eingabe + Inline-Antworten */}
      <LeadlyHero
        firstName={firstName}
        leadly={leadly}
        stats={{
          leads: (leads || []).length,
          activeDeals: _deals.length,
          overdue: totalOverdue,
          today: _today.length,
        }}
        onOpenTasks={() => nav('/aufgaben')}
      />
      <div>

        {/* Leadlys Plan für heute — priorisierte, übernehmbare Aktionen */}
        <div style={{ marginTop: space[5] }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: space[3] }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Leadlys Plan für heute
            </div>
            {suggestions.length >= 3 && (
              <button type="button"
                onClick={() => askLeadly(
                  `Hier ist mein heutiger Plan:\n${displayedSuggestions.map((s, i) => `${i + 1}. [${s.area.label}] ${s.title}${s.reason ? ` (${s.reason})` : ''}`).join('\n')}\nGeh ihn mit mir durch: Womit starte ich am besten, und welche Schritte kannst du direkt für mich vorbereiten?`
                )}
                style={{ padding: '5px 12px', borderRadius: radii.pill, border: `1px solid ${colors.border}`, background: colors.white, color: colors.inkMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Alle mit Leadly durchgehen
              </button>
            )}
          </div>
          {suggestions.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: space[3] }}>
              {displayedSuggestions.map((s, idx) => (
                <div key={s.id} style={{ background: colors.white, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: s.area.color, background: s.area.bg, padding: '2px 8px', borderRadius: radii.pill }}>{idx + 1} · {s.area.label}</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, lineHeight: 1.35 }}>{s.title}</div>
                  {s.reason && <div style={{ fontSize: 12, color: colors.inkMuted }}>{s.reason}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                    <button className="lk-btn lk-btn-primary" onClick={() => (s.action ? takeAction(s.action) : askLeadly(s.prompt))}
                      >
                      {s.action ? 'Erledigen' : 'Mit Leadly angehen'}
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
          ) : (
            <div style={{
              background: colors.white, border: `1px solid ${colors.border}`,
              borderRadius: radii.lg, padding: '20px 22px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden="true">✨</span> Leadly hat gerade nichts vorzuschlagen
              </div>
              <div style={{ fontSize: 13, color: colors.inkMuted, lineHeight: 1.5, maxWidth: '60ch' }}>
                Aktuell stehen keine offenen Follow-ups, heißen Kontakte, aktiven Deals oder überfälligen Aufgaben an. Sobald sich etwas ergibt, erscheinen hier konkrete Vorschläge.
              </div>
              <button onClick={() => askLeadly('Was kann ich heute im Vertrieb sinnvoll angehen?')}
                style={{ alignSelf: 'flex-start', marginTop: 4, padding: '7px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.white, color: colors.inkMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Leadly fragen
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
