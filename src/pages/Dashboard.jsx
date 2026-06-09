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

import React from 'react'
import { Brain } from 'lucide-react';
import TaskSourceIcon from '../components/TaskSourceIcon'
import { useNavigate } from 'react-router-dom';
import { colors, radii, shadows, space, motion, typography } from '../theme';
import { useDashboardData } from '../hooks/useDashboardData';
import { TASK_SOURCES } from '../lib/taskSources';

// ─── Helpers ─────────────────────────────────────────────────────────────
const leadName = (l) => (`${l.first_name || ''} ${l.last_name || ''}`.trim() || l.name || '—');
const fmtEUR = (val) => val >= 1000
  ? `€${Math.round(val / 1000)}k`
  : `€${(val || 0).toLocaleString('de-DE')}`;

const DASHBOARD_TASK_LIMIT = 6;

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

// ─── Hauptkomponente ─────────────────────────────────────────────────────
export default function Dashboard({ session }) {
  const nav = useNavigate();
  const data = useDashboardData({ session });

  const {
    leads, ssi, firstName,
    isLoading,
    hotLeads, overdueTasks, todayTasks,
    activeDeals, wonDeals, lostDeals,
    pipelineValue, wonValue, winRate,
    connectedCount, hasSSI,
  } = data;

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: colors.inkSoft, fontSize: 14 }}>
        Dashboard wird geladen…
      </div>
    );
  }

  const now = new Date();
  // Tages-Aufgaben aus ALLEN Quellen — Überfällige zuerst, dann Heute
  const dayTasks = [...overdueTasks, ...todayTasks];
  const totalDayTasks = dayTasks.length;
  const dayTasksTop = dayTasks.slice(0, DASHBOARD_TASK_LIMIT);
  const dayTasksMore = totalDayTasks - dayTasksTop.length;
  const hasDayTasks = totalDayTasks > 0;
  const totalOverdue = overdueTasks.length;
  const hasHot = hotLeads.length > 0;
  const hotLeadsTop = hotLeads.slice(0, 4);

  return (
    <div>
      {/* Tag-Überschrift */}
      <div style={{ marginBottom: space[12] }}>
        <div style={{
          fontSize: 13, color: colors.inkMuted, fontWeight: 500,
          marginBottom: space[2],
        }}>
          {now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div style={{
          fontSize: 'clamp(34px, 4.5vw, 48px)',
          fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.05,
          color: colors.ink,
        }}>
          Hallo {firstName || 'dort'} —<br/>
          das ist dein <span className="highlight-word">Tag</span>.
        </div>
        <div style={{ fontSize: 14, color: colors.inkMuted, marginTop: space[3] }}>
          {leads.length} {leads.length === 1 ? 'Kontakt' : 'Kontakte'}
          {' · '}
          {activeDeals.length} {activeDeals.length === 1 ? 'Deal aktiv' : 'Deals aktiv'}
          {' · '}
          {totalOverdue} überfällig
          {' · '}
          {todayTasks.length} heute fällig
          {' · '}
          <button onClick={() => nav('/aufgaben')}
            style={{ background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer', fontSize: 14, fontWeight: 500, padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 }}>
            alle Aufgaben →
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative', paddingLeft: space[8] }}>
        {/* Vertikale Linie */}
        <div style={{
          position: 'absolute',
          left: 10, top: 12, bottom: 60,
          width: 2,
          background: `linear-gradient(to bottom, ${colors.primary} 0%, ${colors.border} 100%)`,
          pointerEvents: 'none',
        }}/>

        {/* BLOCK 1: Morgens — Aufgaben für den Tag (überfällig + heute fällig) */}
        {hasDayTasks && (
          <div style={block}>
            <div style={dot(totalOverdue > 0 ? 'urgent' : 'default')}/>
            <div style={timeMarker}>
              {totalOverdue > 0 ? 'Morgens — überfällig & heute' : 'Morgens — dein Tag'}
            </div>
            <div style={heading}>
              {totalOverdue > 0
                ? (totalOverdue === 1
                    ? 'Eine Aufgabe wartet zu lange.'
                    : `${totalOverdue} Aufgaben warten zu lange.`)
                : (totalDayTasks === 1
                    ? 'Eine Aufgabe steht heute an.'
                    : `${totalDayTasks} Aufgaben stehen heute an.`)
              }
            </div>
            <div style={bodyText}>
              {totalOverdue > 0
                ? 'Je länger du wartest, desto kälter wird der Thread. Hol dir die wichtigsten Aufgaben jetzt zurück.'
                : 'Dein Tagesplan — aus allen Modulen zusammengeführt. Klick auf eine Karte, um die Quelle zu öffnen.'}
            </div>

            <div style={{ display: 'grid', gap: space[3] }}>
              {dayTasksTop.map(t => {
                const cfg = TASK_SOURCES[t.source];
                const isOverdueItem = t.due_date && t.due_date < now.toISOString().split('T')[0];
                const days = t.due_date ? Math.round((now - new Date(t.due_date + 'T12:00:00')) / 86400000) : 0;
                const dueLabel = isOverdueItem
                  ? `${days} Tag${days === 1 ? '' : 'e'} überfällig`
                  : 'heute fällig';
                const dueColor  = isOverdueItem ? '#991B1B' : '#92400E';
                const dueBg     = isOverdueItem ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.18)';
                const cardBg    = isOverdueItem ? colors.dangerSoft : colors.white;
                const cardBorder= isOverdueItem ? colors.danger : colors.border;
                return (
                  <div key={t.id}
                    onClick={() => t.href && nav(t.href)}
                    style={{ ...card, background: cardBg, borderColor: cardBorder }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: dueColor, background: dueBg, padding: '2px 10px', borderRadius: radii.pill, letterSpacing: '-0.005em' }}>
                            {dueLabel}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: radii.pill, background: cfg.bg, color: cfg.color, border: '1px solid ' + cfg.border, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            <TaskSourceIcon name={cfg.iconName}/> {cfg.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 500, color: colors.ink, lineHeight: 1.3 }}>{t.title}</div>
                        {(t.description || t.related?.leadName) && (
                          <div style={{ fontSize: 13, color: colors.inkMuted, marginTop: 2 }}>
                            {t.related?.leadName
                              ? `${t.related.leadName}${t.related?.leadCompany ? ` · ${t.related.leadCompany}` : ''}`
                              : t.description}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: colors.primary, fontWeight: 500, whiteSpace: 'nowrap' }}>Öffnen →</div>
                    </div>
                  </div>
                );
              })}

              {dayTasksMore > 0 && (
                <button onClick={() => nav('/aufgaben')}
                  style={{
                    background: 'transparent', border: `1px dashed ${colors.borderStrong}`,
                    borderRadius: radii.lg, padding: '10px 18px',
                    color: colors.primary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    textAlign: 'center', letterSpacing: '-0.005em',
                  }}>
                  …weitere {dayTasksMore} {dayTasksMore === 1 ? 'Aufgabe' : 'Aufgaben'} — alle ansehen →
                </button>
              )}
            </div>
          </div>
        )}

        {/* BLOCK 2: Vormittags — Hot Leads ODER Empty-State */}
        {hasHot ? (
          <div style={block}>
            <div style={dot('default')}/>
            <div style={timeMarker}>Vormittags — fokussiert</div>
            <div style={heading}>
              {hotLeadsTop.length === 1 ? 'Ein heißer Lead ist reif.' : `${hotLeadsTop.length} heiße Leads sind reif.`}
            </div>
            <div style={bodyText}>
              Score über 70. Diese Kontakte haben klare Signale gesendet — jetzt ist der Moment, den nächsten Schritt zu machen.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: space[3] }}>
              {hotLeadsTop.map(l => {
                const score = l.hs_score || l.lead_score || 0;
                const scoreColor = score >= 85 ? colors.danger : colors.warm;
                const scoreBg = score >= 85 ? colors.dangerSoft : colors.warmSoft;
                return (
                  <div key={l.id}
                    onClick={() => nav(`/leads/${l.id}`)}
                    style={card}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = colors.primary; e.currentTarget.style.boxShadow = shadows.sm }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.boxShadow = 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[2] }}>
                      <div style={{ width: 40, height: 40, borderRadius: radii.pill, background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentBlue})`, color: colors.onPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                        {(l.first_name?.[0] || '') + (l.last_name?.[0] || '') || (l.name?.[0] || '?')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {leadName(l)}
                        </div>
                        {(l.job_title || l.company) && (
                          <div style={{ fontSize: 12, color: colors.inkMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {[l.job_title, l.company].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: scoreColor, background: scoreBg, padding: '4px 10px', borderRadius: radii.pill, flexShrink: 0 }}>
                        {score}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={block}>
            <div style={dot('default')}/>
            <div style={timeMarker}>Vormittags — fokussiert</div>
            <div style={heading}>Keine heißen Leads aktuell.</div>
            <div style={bodyText}>
              Sobald Leads mit Score ≥ 70 auftauchen, erscheinen sie hier. In der Zwischenzeit: Pflegst du deine Pipeline?
            </div>
            <button onClick={() => nav('/leads')}
              style={{ padding: '9px 18px', borderRadius: radii.pill, border: `1px solid ${colors.borderStrong}`, background: colors.white, color: colors.ink, fontSize: 13, fontWeight: 500, cursor: 'pointer', letterSpacing: '-0.005em' }}>
              Alle Kontakte öffnen →
            </button>
          </div>
        )}

        {/* BLOCK 3: Mittags — Assistent */}
        <div style={block}>
          <div style={dot('default')}/>
          <div style={timeMarker}>Mittags — frag den Assistenten</div>
          <div style={heading}>Unklar wo anfangen? Lass die KI priorisieren.</div>
          <div style={bodyText}>
            Der Assistent kennt deine Leads, deine Markenstimme und deine Deals.<br/>
            Stell ihm eine Frage — er antwortet mit konkreten Empfehlungen.
          </div>
          <div style={{
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentBlue})`,
            borderRadius: radii.lg,
            padding: '24px 28px',
            color: colors.onPrimary,
          }}>
            <div style={{
              display: 'inline-block',
              fontSize: 11, fontWeight: 600,
              background: 'rgba(255,255,255,0.18)',
              padding: '4px 12px', borderRadius: radii.pill,
              marginBottom: space[3], letterSpacing: '-0.005em',
            }}>
              <span style={{display:"inline-flex",alignItems:"center",gap:6}}><Brain size={12} strokeWidth={1.75}/>Trainiert auf deine Daten</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: space[4], lineHeight: 1.4, letterSpacing: '-0.015em' }}>
              „Welche Deals sollte ich diese Woche prioritär angehen?"
            </div>
            <button onClick={() => nav('/assistent')}
              style={{
                padding: '9px 18px', borderRadius: radii.pill, border: 'none',
                background: colors.white, color: colors.primary,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                letterSpacing: '-0.005em',
              }}>
              Assistent öffnen →
            </button>
          </div>
        </div>

        {/* BLOCK 4: Nachmittags — Kontext (KPIs) */}
        <div style={block}>
          <div style={dot('default')}/>
          <div style={timeMarker}>Nachmittags — Kontext</div>
          <div style={heading}>Wo stehst du heute?</div>
          <div style={bodyText}>
            Dein Momentum auf einen Blick — Pipeline, Win Rate{hasSSI ? ', SSI' : ''} und Kontakte. Keine Ablenkung, nur die Zahlen die zählen.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: space[3] }}>
            {/* Pipeline-Wert */}
            <div onClick={() => nav('/deals')}
              style={{ ...card, display: 'flex', flexDirection: 'column' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = colors.primary; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.transform = 'translateY(0)' }}>
              <div style={{ fontSize: 11, color: colors.inkMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: space[2] }}>Pipeline Wert</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: colors.primary, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {fmtEUR(pipelineValue)}
              </div>
              <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: space[1] }}>
                {activeDeals.length} {activeDeals.length === 1 ? 'Deal aktiv' : 'Deals aktiv'}
              </div>
            </div>

            {/* Win-Rate */}
            <div onClick={() => nav('/reports')}
              style={{ ...card, display: 'flex', flexDirection: 'column' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = colors.primary; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.transform = 'translateY(0)' }}>
              <div style={{ fontSize: 11, color: colors.inkMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: space[2] }}>Win Rate</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: colors.success, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {winRate}%
              </div>
              <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: space[1] }}>
                {wonDeals.length} gewonnen · {lostDeals.length} verloren
              </div>
            </div>

            {/* SSI — nur wenn Daten vorhanden */}
            {hasSSI && (
              <div onClick={() => nav('/ssi')}
                style={{ ...card, display: 'flex', flexDirection: 'column' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = colors.primary; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.transform = 'translateY(0)' }}>
                <div style={{ fontSize: 11, color: colors.inkMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: space[2] }}>SSI · LinkedIn</div>
                <div style={{ fontSize: 28, fontWeight: 600, color: colors.primary, letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {Math.round(ssi.total_score)}
                </div>
                <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: space[1] }}>von 100 Punkten</div>
              </div>
            )}

            {/* Kontakte gesamt */}
            <div onClick={() => nav('/leads')}
              style={{ ...card, display: 'flex', flexDirection: 'column' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = colors.primary; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.transform = 'translateY(0)' }}>
              <div style={{ fontSize: 11, color: colors.inkMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: space[2] }}>Kontakte gesamt</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: colors.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {leads.length}
              </div>
              <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: space[1] }}>
                {connectedCount} vernetzt
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
