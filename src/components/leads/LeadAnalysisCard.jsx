// src/components/leads/LeadAnalysisCard.jsx
//
// Backlog #4 — Render-Component für die Sparkles-KI-Analyse pro Lead.
//
// Erhält das parsed analysis-Objekt aus leads.ai_last_analysis (jsonb-Spalte
// die durch die Edge-Function analyze-lead gesetzt wird).
//
// Schema:
//   {
//     model, generated_at,
//     score:            { value, reasoning[], delta },
//     next_best_action: { title, detail },
//     pain_points:      [...],
//     persona:          "...",
//     outreach_draft:   { channel, subject, body }
//   }
//
// Phase 1 ist read-only — User-Confirm-Buttons (Score übernehmen, Pain-Points
// übernehmen) sind explizit Phase 2 und nicht hier. Heute nur Display +
// Outreach-Body-Copy-to-Clipboard.

import React, { useState } from 'react';
import { Sparkles, Copy, Check, RefreshCw, X, Target, TrendingUp, Mail, Link2, Send, ArrowRight } from 'lucide-react';

const COLORS = {
  bg:           '#EEEDFE',
  border:       '#C7C5FB',
  text:         '#3C3489',
  textMuted:    '#6B6890',
  scoreBg:      '#fff',
  scoreBorder:  '#C7C5FB',
  paintPillBg:  '#fff',
  paintPillText:'#3C3489',
};

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 16,
  background: COLORS.bg,
  border: `0.5px solid ${COLORS.border}`,
  borderRadius: 12,
  marginBottom: 18,
  fontSize: 13,
  color: COLORS.text,
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const titleStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontWeight: 600,
  fontSize: 13,
};

const metaStyle = {
  fontSize: 11,
  color: COLORS.textMuted,
};

const sectionStyle = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
};

const sectionIconStyle = {
  width: 28,
  height: 28,
  borderRadius: 8,
  background: COLORS.scoreBg,
  border: `0.5px solid ${COLORS.scoreBorder}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const sectionBodyStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const sectionLabelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: COLORS.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
};

const sectionTextStyle = {
  fontSize: 13,
  color: COLORS.text,
  lineHeight: 1.5,
};

const scoreBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 9px',
  background: COLORS.scoreBg,
  border: `0.5px solid ${COLORS.scoreBorder}`,
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.text,
};

const pillStyle = {
  display: 'inline-block',
  padding: '3px 9px',
  background: COLORS.paintPillBg,
  border: `0.5px solid ${COLORS.scoreBorder}`,
  borderRadius: 999,
  fontSize: 12,
  color: COLORS.paintPillText,
  marginRight: 6,
  marginBottom: 4,
};

const outreachBoxStyle = {
  marginTop: 4,
  padding: 10,
  background: COLORS.scoreBg,
  border: `0.5px solid ${COLORS.scoreBorder}`,
  borderRadius: 8,
  fontSize: 12.5,
  color: COLORS.text,
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5,
};

const iconBtnStyle = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 5,
  borderRadius: 6,
  color: COLORS.textMuted,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
};

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h}h`;
  const d = Math.round(h / 24);
  return `vor ${d}d`;
}

export default function LeadAnalysisCard({ analysis, isReanalyzing, onReanalyze, onDismiss, onUseOutreach }) {
  const [copied, setCopied] = useState(false);

  if (!analysis) return null;

  const score = analysis.score || {};
  const nba   = analysis.next_best_action || {};
  const pains = Array.isArray(analysis.pain_points) ? analysis.pain_points : [];
  const persona = analysis.persona || '';
  const outreach = analysis.outreach_draft || {};

  const copyOutreach = async () => {
    try {
      await navigator.clipboard.writeText(outreach.body || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.alert('Konnte nicht in Zwischenablage kopieren.');
    }
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={titleStyle}>
          <Sparkles size={16} />
          <span>KI-Analyse</span>
          {analysis.generated_at && (
            <span style={metaStyle}>· {timeAgo(analysis.generated_at)} · {analysis.model}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {onReanalyze && (
            <button type="button" style={iconBtnStyle} onClick={onReanalyze} disabled={isReanalyzing}
              title="Neu analysieren">
              <RefreshCw size={13} style={{ animation: isReanalyzing ? 'spin 1s linear infinite' : 'none' }} />
              {isReanalyzing ? 'Analysiere…' : 'Neu'}
            </button>
          )}
          {onDismiss && (
            <button type="button" style={iconBtnStyle} onClick={onDismiss} title="Schließen">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Score */}
      {score.value != null && (
        <div style={sectionStyle}>
          <div style={sectionIconStyle}><TrendingUp size={14} /></div>
          <div style={sectionBodyStyle}>
            <div style={sectionLabelStyle}>Score-Vorschlag</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={scoreBadgeStyle}>{score.value} / 100</span>
              {score.delta && <span style={{ fontSize: 12, color: COLORS.textMuted }}>{score.delta}</span>}
            </div>
            {Array.isArray(score.reasoning) && score.reasoning.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12.5, color: COLORS.text, lineHeight: 1.55 }}>
                {score.reasoning.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Next Best Action */}
      {nba.title && (
        <div style={sectionStyle}>
          <div style={sectionIconStyle}><Target size={14} /></div>
          <div style={sectionBodyStyle}>
            <div style={sectionLabelStyle}>Next Best Action</div>
            <div style={{ ...sectionTextStyle, fontWeight: 500 }}>{nba.title}</div>
            {nba.detail && <div style={{ ...sectionTextStyle, color: COLORS.textMuted }}>{nba.detail}</div>}
          </div>
        </div>
      )}

      {/* Pain Points + Persona */}
      {(pains.length > 0 || persona) && (
        <div style={sectionStyle}>
          <div style={sectionIconStyle}><Sparkles size={14} /></div>
          <div style={sectionBodyStyle}>
            <div style={sectionLabelStyle}>Pain-Points & Persona</div>
            {pains.length > 0 && (
              <div>
                {pains.map((p, i) => <span key={i} style={pillStyle}>{p}</span>)}
              </div>
            )}
            {persona && <div style={{ ...sectionTextStyle, color: COLORS.textMuted }}>{persona}</div>}
          </div>
        </div>
      )}

      {/* Outreach Draft */}
      {outreach.body && (
        <div style={sectionStyle}>
          <div style={sectionIconStyle}>
            {outreach.channel === 'email' ? <Mail size={14} /> : <Link2 size={14} />}
          </div>
          <div style={sectionBodyStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={sectionLabelStyle}>
                Outreach-Entwurf · {outreach.channel === 'email' ? 'Email' : 'LinkedIn'}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {onUseOutreach && (
                  <button type="button" style={iconBtnStyle}
                    onClick={() => onUseOutreach(outreach)}
                    title="Outreach-Entwurf im Nachrichten-Composer öffnen">
                    <Send size={13} /> Im Composer öffnen
                  </button>
                )}
                <button type="button" style={iconBtnStyle} onClick={copyOutreach}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Kopiert' : 'Kopieren'}
                </button>
              </div>
            </div>
            {outreach.subject && (
              <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.text }}>
                Betreff: {outreach.subject}
              </div>
            )}
            <div style={outreachBoxStyle}>{outreach.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty-State-Variante ────────────────────────────────────────────────────
// Wird im Übersicht-Tab gerendert wenn lead.ai_last_analysis IS NULL.
// Prominenter CTA — der User soll die Sparkles-Funktion auf den ersten Blick
// erkennen statt sie nur als kleines Icon oben rechts zu finden.

const emptyCardStyle = {
  ...cardStyle,
  padding: '22px 24px',
  background: 'linear-gradient(135deg, #EEEDFE 0%, #F4F1FE 100%)',
};

const emptyCtaBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 18px',
  background: COLORS.text,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  alignSelf: 'flex-start',
};

const emptyCtaBtnDisabledStyle = {
  ...emptyCtaBtnStyle,
  opacity: 0.6,
  cursor: 'wait',
};

const emptyBulletStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: COLORS.text,
  lineHeight: 1.55,
};

export function LeadAnalysisEmptyCard({ onAnalyze, isAnalyzing }) {
  return (
    <div style={emptyCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: COLORS.text, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={20} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>KI-Analyse für diesen Lead</div>
          <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 }}>
            In ~5 Sekunden: Score-Vorschlag, Next Best Action, Pain-Points + fertiger Outreach-Entwurf.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <div style={emptyBulletStyle}><TrendingUp size={14} style={{ color: COLORS.textMuted }} /> <span><strong style={{ fontWeight: 600 }}>Score 1-100</strong> mit drei begründenden Punkten</span></div>
        <div style={emptyBulletStyle}><Target size={14} style={{ color: COLORS.textMuted }} /> <span><strong style={{ fontWeight: 600 }}>Next Best Action</strong> — konkrete Empfehlung was als nächstes</span></div>
        <div style={emptyBulletStyle}><Sparkles size={14} style={{ color: COLORS.textMuted }} /> <span><strong style={{ fontWeight: 600 }}>Pain-Points + Persona</strong> aus LinkedIn-Daten + Notizen</span></div>
        <div style={emptyBulletStyle}><Mail size={14} style={{ color: COLORS.textMuted }} /> <span><strong style={{ fontWeight: 600 }}>Outreach-Entwurf</strong> in Sekunden — LinkedIn-DM oder E-Mail</span></div>
      </div>

      <button type="button"
        onClick={onAnalyze} disabled={isAnalyzing}
        style={isAnalyzing ? emptyCtaBtnDisabledStyle : emptyCtaBtnStyle}>
        <Sparkles size={16} />
        {isAnalyzing ? 'Analysiere…' : 'KI-Analyse starten'}
        {!isAnalyzing && <ArrowRight size={14} />}
      </button>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: -4 }}>
        Modell: Claude Sonnet 4.6 · max 1× pro 24h · ~2 Cent
      </div>
    </div>
  );
}
