// src/components/leads/LeadEditModal.jsx
//
// Lead bearbeiten — zentrales Modal das alle editierbaren Felder gruppiert
// in 4 Sektionen (Person / Unternehmen / Sales-CRM / LinkedIn-Status).
//
// Trigger: "Bearbeiten"-Button im Hero der Lead-Detail-Page.
//
// Form-State ist lokal gepuffert; Save → ein einziger UPDATE auf leads via
// onSave-Prop (mapped auf useLead.updateLead). Dirty-Tracking via Vergleich
// gegen Initial-Snapshot — verhindert unnötige DB-Writes wenn nichts geändert.
//
// Außerhalb des Modals bleiben:
// - Tags (eigener TagEditor inline + chip-Pattern)
// - Owner (eigener OwnerPicker mit Avatar-Click)
// - Status-Pill (Quick-Action via StatusPicker auf der Card)
// - Star/Favorit (Quick-Action im Hero)
// - KI-Insights (werden via Sparkles-Analyse automatisch befüllt)

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, User, Building2, TrendingUp, Link2, Info, Check, Keyboard } from 'lucide-react';

const COLORS = {
  surface:        '#fff',
  border:         '#E5E7EB',
  borderStrong:   '#D1D5DB',
  text:           '#111827',
  textSecondary:  '#6B7280',
  textTertiary:   '#9CA3AF',
  primaryBg:      '#315AE7',
  primaryFg:      '#fff',
  infoBg:         '#EEF2FF',
  infoBorder:     '#C7D2FE',
  infoText:       '#3730A3',
  bgMuted:        '#F9FAFB',
};

const RADIUS = { sm: 6, md: 8, lg: 12 };

// Felder-Whitelist: nur diese Keys werden an onSave durchgereicht.
const EDITABLE_FIELDS = [
  'first_name', 'last_name', 'job_title', 'headline',
  'email', 'phone', 'linkedin_url', 'location', 'country',
  'company', 'industry', 'company_size',
  'status', 'lead_score', 'deal_value', 'next_followup', 'source', 'notes',
  'li_connection_status', 'is_favorite',
];

const STATUS_OPTIONS = ['Lead', 'LQL', 'MQL', 'MQN', 'SQL'];
const CONNECTION_OPTIONS = [
  { value: '',                 label: 'Nicht vernetzt' },
  { value: 'angefragt',        label: 'Anfrage gesendet' },
  { value: 'verbunden',        label: 'Vernetzt' },
  { value: 'abgelehnt',        label: 'Abgelehnt' },
  { value: 'nicht_vernetzt',   label: 'Nicht vernetzt (explizit)' },
];
const COMPANY_SIZE_OPTIONS = ['', '1–10', '11–50', '51–200', '201–500', '501–1000', '1000+'];

// ─── Styles ─────────────────────────────────────────────────────────────────

const overlayStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  zIndex: 200,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '5vh 16px',
  overflowY: 'auto',
};

const dialogStyle = {
  width: '100%',
  maxWidth: 640,
  background: COLORS.surface,
  borderRadius: RADIUS.lg,
  border: `0.5px solid ${COLORS.border}`,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '90vh',
  overflow: 'hidden',
  fontFamily: 'inherit',
};

const headerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '14px 20px',
  borderBottom: `0.5px solid ${COLORS.border}`,
  background: COLORS.surface,
};

const headerTitleWrapStyle = { display: 'flex', alignItems: 'center', gap: 10 };
const avatarStyle = {
  width: 32, height: 32, borderRadius: '50%',
  background: COLORS.infoBg, color: COLORS.infoText,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 12, fontWeight: 500,
};

const closeBtnStyle = {
  background: 'transparent', border: 'none',
  padding: 6, cursor: 'pointer',
  color: COLORS.textSecondary,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: RADIUS.sm,
};

const bodyStyle = {
  padding: '18px 20px',
  overflowY: 'auto',
  flex: 1,
};

const sectionHeaderStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 11, fontWeight: 600, color: COLORS.textSecondary,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  margin: '4px 0 10px',
};

const gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 };
const fullRowStyle = { marginBottom: 10 };

const labelStyle = {
  fontSize: 12, color: COLORS.textSecondary,
  display: 'block', marginBottom: 4,
};

const inputBaseStyle = {
  width: '100%',
  height: 36,
  padding: '0 12px',
  fontSize: 13,
  fontFamily: 'inherit',
  color: COLORS.text,
  background: COLORS.surface,
  border: `0.5px solid ${COLORS.border}`,
  borderRadius: RADIUS.md,
  outline: 'none',
  boxSizing: 'border-box',
};

const textareaStyle = {
  ...inputBaseStyle,
  height: 'auto',
  minHeight: 80,
  padding: '8px 12px',
  fontFamily: 'inherit',
  lineHeight: 1.5,
  resize: 'vertical',
};

const selectStyle = { ...inputBaseStyle };

const checkboxRowStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  height: 36, padding: '0 12px',
  border: `0.5px solid ${COLORS.border}`,
  borderRadius: RADIUS.md,
  cursor: 'pointer',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};

const infoBoxStyle = {
  marginTop: 14,
  padding: '10px 12px',
  background: COLORS.infoBg,
  border: `0.5px solid ${COLORS.infoBorder}`,
  borderRadius: RADIUS.md,
  display: 'flex', alignItems: 'flex-start', gap: 8,
};

const footerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 10, padding: '12px 20px',
  borderTop: `0.5px solid ${COLORS.border}`,
  background: COLORS.bgMuted,
};

const footerHintStyle = {
  fontSize: 12, color: COLORS.textSecondary,
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const footerBtnsStyle = { display: 'flex', gap: 8 };

const secondaryBtnStyle = {
  height: 34, padding: '0 14px',
  background: COLORS.surface,
  border: `0.5px solid ${COLORS.borderStrong}`,
  borderRadius: RADIUS.md,
  fontSize: 13, color: COLORS.text,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const primaryBtnStyle = {
  height: 34, padding: '0 14px',
  background: COLORS.primaryBg,
  color: COLORS.primaryFg,
  border: 'none',
  borderRadius: RADIUS.md,
  fontSize: 13, fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontFamily: 'inherit',
};

const primaryBtnDisabledStyle = {
  ...primaryBtnStyle,
  background: COLORS.borderStrong,
  cursor: 'not-allowed',
  color: '#fff',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function initialsFor(firstName, lastName) {
  const a = (firstName || '').trim();
  const b = (lastName || '').trim();
  if (!a && !b) return '?';
  return ((a[0] || '') + (b[0] || '')).toUpperCase() || '?';
}

function buildSnapshot(lead) {
  const snap = {};
  for (const key of EDITABLE_FIELDS) {
    const v = lead?.[key];
    // Date-Type: ai_last_analysis_at, next_followup etc. — wir nehmen .toISOString().slice(0,10) für date-input
    if (key === 'next_followup' && v) {
      snap[key] = typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10);
    } else {
      snap[key] = v ?? (key === 'is_favorite' ? false : '');
    }
  }
  return snap;
}

function diffPatch(snap, current) {
  const patch = {};
  for (const key of EDITABLE_FIELDS) {
    const a = snap[key];
    const b = current[key];
    // Bei booleans: direkter Vergleich
    if (key === 'is_favorite') {
      if (!!a !== !!b) patch[key] = !!b;
      continue;
    }
    // Zahlen: parsing
    if (key === 'lead_score' || key === 'deal_value') {
      const an = a === '' || a == null ? null : Number(a);
      const bn = b === '' || b == null ? null : Number(b);
      if (an !== bn) patch[key] = bn;
      continue;
    }
    // Strings: '' und null als gleich behandeln
    const aS = a == null ? '' : String(a);
    const bS = b == null ? '' : String(b);
    if (aS !== bS) {
      patch[key] = bS === '' ? null : b;
    }
  }
  return patch;
}

// ─── Section-Wrapper-Atom ───────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label }) {
  return (
    <div style={sectionHeaderStyle}>
      <Icon size={14} /> {label}
    </div>
  );
}

function Field({ label, children, fullWidth = false }) {
  return (
    <div style={fullWidth ? fullRowStyle : null}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────────

export default function LeadEditModal({ lead, isOpen, onClose, onSave }) {
  // initialSnapshot wird nur beim Open-Transition (false→true) frisch aus dem
  // aktuellen lead-Prop gebaut — NICHT auf jeden lead-Ref-Change. Sonst:
  //   - useMemo([lead?.id]) zeigte stale-state beim 2. Open (Bug 2026-05-26-a)
  //   - useMemo([lead]) oder useEffect([isOpen, lead]) würde User-Edits
  //     überschreiben wenn Realtime-refetch während der User tippt (Bug 2026-05-26-b)
  // Lösung: wasOpenRef trackt den vorherigen isOpen-State; nur bei opening=true
  // wird buildSnapshot aufgerufen. Closure liest dabei das aktuelle lead-Prop
  // zum Transitions-Zeitpunkt.
  const initialSnapshotRef = useRef(null);
  const wasOpenRef = useRef(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const firstFieldRef = useRef(null);

  useEffect(() => {
    const opening = isOpen && !wasOpenRef.current;
    if (opening && lead) {
      const snap = buildSnapshot(lead);
      initialSnapshotRef.current = snap;
      setForm(snap);
      setError(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, lead]);

  // Autofocus auf erstes Feld beim Öffnen
  useEffect(() => {
    if (isOpen && firstFieldRef.current) {
      setTimeout(() => firstFieldRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const setField = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const patch = useMemo(() => {
    const snap = initialSnapshotRef.current;
    return snap ? diffPatch(snap, form) : {};
  }, [form]);
  const isDirty = Object.keys(patch).length > 0;

  const handleClose = useCallback(() => {
    if (isDirty) {
      if (!window.confirm('Du hast ungespeicherte Änderungen. Trotzdem schließen?')) return;
    }
    onClose?.();
  }, [isDirty, onClose]);

  const handleSave = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving(true); setError(null);
    try {
      const res = await onSave?.(patch);
      if (res?.error) throw new Error(res.error.message || 'Speichern fehlgeschlagen');
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }, [isDirty, saving, patch, onSave, onClose]);

  // Keyboard: Esc = close, Cmd/Ctrl+S = save
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); handleSave();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose, handleSave]);

  if (!isOpen || !lead) return null;

  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }} role="dialog" aria-modal="true">
      <div style={dialogStyle} onMouseDown={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={headerStyle}>
          <div style={headerTitleWrapStyle}>
            <div style={avatarStyle}>{initialsFor(lead.first_name, lead.last_name)}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>Lead bearbeiten</div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
                {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Unbenannt'}
                {lead.company && ` · ${lead.company}`}
              </div>
            </div>
          </div>
          <button type="button" style={closeBtnStyle} onClick={handleClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>

          {/* Section: Person */}
          <SectionHeader icon={User} label="Person" />
          <div style={gridStyle}>
            <Field label="Vorname">
              <input ref={firstFieldRef} type="text" style={inputBaseStyle}
                value={form.first_name || ''} onChange={setField('first_name')} placeholder="z.B. Anna" />
            </Field>
            <Field label="Nachname">
              <input type="text" style={inputBaseStyle}
                value={form.last_name || ''} onChange={setField('last_name')} placeholder="z.B. Schmidt" />
            </Field>
          </div>
          <div style={gridStyle}>
            <Field label="Position">
              <input type="text" style={inputBaseStyle}
                value={form.job_title || ''} onChange={setField('job_title')} placeholder="z.B. Head of Sales" />
            </Field>
            <Field label="LinkedIn-Headline">
              <input type="text" style={inputBaseStyle}
                value={form.headline || ''} onChange={setField('headline')} placeholder="z.B. AE @ Acme" />
            </Field>
          </div>
          <div style={gridStyle}>
            <Field label="E-Mail">
              <input type="email" style={inputBaseStyle}
                value={form.email || ''} onChange={setField('email')} placeholder="name@firma.de" />
            </Field>
            <Field label="Telefon">
              <input type="tel" style={inputBaseStyle}
                value={form.phone || ''} onChange={setField('phone')} placeholder="+49 …" />
            </Field>
          </div>
          <Field label="LinkedIn-URL" fullWidth>
            <input type="url" style={inputBaseStyle}
              value={form.linkedin_url || ''} onChange={setField('linkedin_url')}
              placeholder="https://www.linkedin.com/in/…" />
          </Field>
          <div style={gridStyle}>
            <Field label="Ort">
              <input type="text" style={inputBaseStyle}
                value={form.location || ''} onChange={setField('location')} placeholder="z.B. Berlin" />
            </Field>
            <Field label="Land">
              <input type="text" style={inputBaseStyle}
                value={form.country || ''} onChange={setField('country')} placeholder="z.B. Deutschland" />
            </Field>
          </div>

          {/* Section: Unternehmen */}
          <SectionHeader icon={Building2} label="Unternehmen" />
          <Field label="Firmenname" fullWidth>
            <input type="text" style={inputBaseStyle}
              value={form.company || ''} onChange={setField('company')} placeholder="z.B. Acme GmbH" />
          </Field>
          <div style={gridStyle}>
            <Field label="Branche">
              <input type="text" style={inputBaseStyle}
                value={form.industry || ''} onChange={setField('industry')} placeholder="z.B. SaaS" />
            </Field>
            <Field label="Unternehmensgröße">
              <select style={selectStyle} value={form.company_size || ''} onChange={setField('company_size')}>
                {COMPANY_SIZE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt || '— bitte wählen —'}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Section: Sales · CRM */}
          <SectionHeader icon={TrendingUp} label="Sales · CRM" />
          <div style={gridStyle}>
            <Field label="Status">
              <select style={selectStyle} value={form.status || 'Lead'} onChange={setField('status')}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Score (0–100)">
              <input type="number" min="0" max="100" style={inputBaseStyle}
                value={form.lead_score ?? ''} onChange={setField('lead_score')} placeholder="0" />
            </Field>
          </div>
          <div style={gridStyle}>
            <Field label="Deal-Wert (€)">
              <input type="number" min="0" step="100" style={inputBaseStyle}
                value={form.deal_value ?? ''} onChange={setField('deal_value')} placeholder="z.B. 5000" />
            </Field>
            <Field label="Nächste Aktion">
              <input type="date" style={inputBaseStyle}
                value={form.next_followup || ''} onChange={setField('next_followup')} />
            </Field>
          </div>
          <Field label="Quelle" fullWidth>
            <input type="text" style={inputBaseStyle}
              value={form.source || ''} onChange={setField('source')} placeholder="z.B. webinar, referral, extension_import" />
          </Field>
          <Field label="Beschreibung · Notizen" fullWidth>
            <textarea style={textareaStyle}
              value={form.notes || ''} onChange={setField('notes')}
              placeholder="Hintergrund, Gesprächsnotizen, Kontext …" />
          </Field>

          {/* Section: LinkedIn-Status */}
          <SectionHeader icon={Link2} label="LinkedIn-Status" />
          <div style={gridStyle}>
            <Field label="Vernetzungs-Status">
              <select style={selectStyle} value={form.li_connection_status || ''} onChange={setField('li_connection_status')}>
                {CONNECTION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Favorit">
              <label style={checkboxRowStyle}>
                <input type="checkbox" checked={!!form.is_favorite} onChange={setField('is_favorite')} />
                <span>⭐ Als Favorit markieren</span>
              </label>
            </Field>
          </div>

          {/* KI-Insights-Hinweis */}
          <div style={infoBoxStyle}>
            <Info size={14} color={COLORS.infoText} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: COLORS.infoText, lineHeight: 1.55 }}>
              <b>KI-Insights</b> (Buying Intent, Bedarf, Pain-Points, Persona, Use-Cases) werden automatisch
              durch <i>KI-Analyse starten</i> befüllt — keine manuelle Eingabe nötig.
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 12px',
              background: '#FEF2F2', border: '0.5px solid #FECACA',
              borderRadius: RADIUS.md, fontSize: 12, color: '#991B1B',
            }}>{error}</div>
          )}

        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <div style={footerHintStyle}>
            <Keyboard size={13} /> ⌘ + S speichern · Esc abbrechen
          </div>
          <div style={footerBtnsStyle}>
            <button type="button" style={secondaryBtnStyle} onClick={handleClose}>Abbrechen</button>
            <button type="button"
              style={isDirty && !saving ? primaryBtnStyle : primaryBtnDisabledStyle}
              onClick={handleSave} disabled={!isDirty || saving}>
              <Check size={14} /> {saving ? 'Speichert…' : 'Speichern'}
              {isDirty && !saving && <span style={{ fontSize: 11, opacity: 0.7 }}>({Object.keys(patch).length})</span>}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
