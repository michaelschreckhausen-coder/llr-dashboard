// src/components/NewTaskModal.jsx
//
// Standalone-Modal für "Neue Aufgabe"-Create — verwendet auf /aufgaben.
//
// Full-Form: Title (Pflicht) + Kontakt-Picker (optional, FK lead_tasks.lead_id
// ist seit Migration 20260528104100 NULL-able) + Datum + Priorität +
// Beschreibung + Zuweisung.
//
// Submit-Pfad: direkter supabase.insert into lead_tasks. Caller's onSaved-
// Callback triggert refetch der Liste (Aufgaben.jsx hat eh Realtime-
// Subscription die das ohnehin tut, aber direct call = sofortige UI-Reaktion).
//
// Props:
//   activeTeamId  — String | null
//   uid           — current user id
//   members       — Array<{ user_id, profile }> für Zuweisungs-Dropdown
//   onClose       — Modal schließen
//   onSaved(task) — nach erfolgreichem Insert, mit der neuen Row

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import LeadPicker from './LeadPicker';

const PRIMARY = 'rgb(49,90,231)';

const PRIORITIES = [
  { value: 'low',    label: 'Niedrig' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'Hoch' },
];

// ─── Styles ──────────────────────────────────────────────────────────────
const backdropStyle = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
  backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 2000, padding: 16,
};
const cardStyle = {
  background: '#fff', borderRadius: 16, padding: 0,
  width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto',
  boxShadow: '0 24px 64px rgba(15,23,42,0.2)',
};
const headerStyle = {
  padding: '18px 22px', borderBottom: '0.5px solid rgba(0,0,0,0.06)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};
const bodyStyle = { padding: '18px 22px', display: 'grid', gap: 14 };
const footerStyle = {
  padding: '14px 22px', borderTop: '0.5px solid rgba(0,0,0,0.06)',
  display: 'flex', justifyContent: 'flex-end', gap: 8,
};
const labelStyle = {
  fontSize: 11, fontWeight: 600, color: '#374151',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  display: 'block', marginBottom: 5,
};
const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 14,
  border: '1.5px solid #E4E7EC', borderRadius: 8, outline: 'none',
  boxSizing: 'border-box',
};
const textareaStyle = { ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' };
const selectStyle = { ...inputStyle, cursor: 'pointer', appearance: 'auto' };
const row2Style = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const btnGhostStyle = {
  padding: '8px 14px', fontSize: 13, fontWeight: 600,
  background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8,
  cursor: 'pointer',
};
const btnPrimaryStyle = {
  padding: '8px 16px', fontSize: 13, fontWeight: 600,
  background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8,
  cursor: 'pointer',
};
const errStyle = {
  background: '#FEE2E2', color: '#7F1D1D',
  borderRadius: 8, padding: '8px 12px', fontSize: 12,
};

export default function NewTaskModal({ activeTeamId, uid, members, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '',
    lead_id: null,
    lead_display: '',
    due_date: '',
    priority: 'normal',
    description: '',
    assigned_to: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Escape schließt Modal
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, busy]);

  const submit = async (e) => {
    e?.preventDefault?.();
    const title = (form.title || '').trim();
    if (!title) { setErr('Titel ist Pflicht.'); return; }
    if (!uid)   { setErr('Session noch nicht geladen — kurz warten.'); return; }

    setBusy(true);
    setErr(null);

    const payload = {
      title,
      lead_id:     form.lead_id || null,                       // optional dank Migration 20260528104100
      team_id:     activeTeamId || null,
      created_by:  uid,
      description: (form.description || '').trim() || null,
      due_date:    form.due_date || null,
      priority:    form.priority || 'normal',
      assigned_to: form.assigned_to || null,
      status:      'open',
    };

    const { data, error } = await supabase
      .from('lead_tasks')
      .insert(payload)
      .select('*, leads(id, first_name, last_name, name, company, avatar_url)')
      .single();

    setBusy(false);

    if (error) {
      setErr(error.message);
      return;
    }
    onSaved?.(data);
    onClose();
  };

  return (
    <div style={backdropStyle} onClick={busy ? undefined : onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Neue Aufgabe</div>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, fontSize: 18 }}
            aria-label="Schließen">
            ×
          </button>
        </div>

        <form onSubmit={submit}>
          <div style={bodyStyle}>
            {err && <div style={errStyle}>{err}</div>}

            <div>
              <label style={labelStyle} htmlFor="task-title">Titel</label>
              <input id="task-title" autoFocus type="text"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="z.B. Demo-Call mit Sandra vereinbaren"
                style={inputStyle} maxLength={200} disabled={busy} />
            </div>

            <div>
              <label style={labelStyle}>Kontakt <span style={{ color: '#9CA3AF', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <LeadPicker
                value={form.lead_id}
                valueName={form.lead_display}
                onChange={(leadId, display) => setForm(f => ({ ...f, lead_id: leadId, lead_display: display || '' }))}
                placeholder="Kontakt suchen (optional)…"
                disabled={busy}
              />
            </div>

            <div style={row2Style}>
              <div>
                <label style={labelStyle} htmlFor="task-due">Fällig am</label>
                <input id="task-due" type="date"
                  value={form.due_date}
                  onChange={(e) => set('due_date', e.target.value)}
                  style={inputStyle} disabled={busy} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="task-prio">Priorität</label>
                <select id="task-prio"
                  value={form.priority}
                  onChange={(e) => set('priority', e.target.value)}
                  style={selectStyle} disabled={busy}>
                  {PRIORITIES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle} htmlFor="task-assignee">Zugewiesen an</label>
              <select id="task-assignee"
                value={form.assigned_to}
                onChange={(e) => set('assigned_to', e.target.value)}
                style={selectStyle} disabled={busy}>
                <option value="">— Niemand —</option>
                {(members || []).map(m => {
                  const name = m.profile?.full_name
                    || `${m.profile?.first_name || ''} ${m.profile?.last_name || ''}`.trim()
                    || m.profile?.email
                    || m.user_id?.slice(0, 8);
                  return (
                    <option key={m.user_id} value={m.user_id}>
                      {name}{m.user_id === uid ? ' (du)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label style={labelStyle} htmlFor="task-desc">Beschreibung <span style={{ color: '#9CA3AF', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <textarea id="task-desc"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Details, Kontext, Notizen…"
                style={textareaStyle} maxLength={2000} disabled={busy} />
            </div>
          </div>

          <div style={footerStyle}>
            <button type="button" style={btnGhostStyle} onClick={onClose} disabled={busy}>
              Abbrechen
            </button>
            <button type="submit" style={btnPrimaryStyle} disabled={busy || !form.title.trim()}>
              {busy ? 'Speichere…' : 'Aufgabe anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
