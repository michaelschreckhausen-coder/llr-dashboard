// src/components/LinkedInSyncModal.jsx
//
// LinkedIn-Profile-Sync Phase 1 — User-Confirm-Modal.
//
// Props:
//   - diff: Array<{ field, label, current, fresh, type: 'image'|'text' }>
//   - oidc: OIDC-Snapshot (für apply-Call mitschicken)
//   - firstSync: boolean — beim allerersten Sync alle Checkboxes default-on,
//                          ohne Modal direkt apply'en wäre auch denkbar
//                          (aktuell zeigen wir das Modal trotzdem,
//                          damit User mind. 1x weiß was passiert)
//   - onConfirm(selectedFields: string[], oidc): wird beim Klick "Übernehmen" gerufen
//   - onDismiss(): "Verwerfen" — Modal close, kein Schreiben
//
// Apply-Path: useEffect-Trigger in App.jsx invokes Edge-Function 'sync-linkedin-profile'
// mit action='apply'. Hier nur UI.

import { useEffect, useState } from 'react';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 24,
};

const modalStyle = {
  background: 'var(--bg-card, #ffffff)',
  borderRadius: 16,
  maxWidth: 540,
  width: '100%',
  maxHeight: '85vh',
  overflow: 'auto',
  boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
  border: '1px solid var(--border, #e4e4e7)',
};

const headerStyle = {
  padding: '20px 24px 12px',
  borderBottom: '1px solid var(--border, #e4e4e7)',
};

const bodyStyle = {
  padding: '16px 24px',
};

const fieldRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '14px 0',
  borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
};

const previewWrapStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flex: 1,
  flexWrap: 'wrap',
};

const previewBubble = {
  flex: '1 1 140px',
  minWidth: 140,
  padding: 8,
  border: '1px solid var(--border, #e4e4e7)',
  borderRadius: 8,
  background: 'var(--bg-subtle, #f8fafc)',
  fontSize: 13,
};

const labelStyle = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  color: 'var(--text-muted, #64748b)',
  marginBottom: 4,
};

const arrowStyle = {
  fontSize: 18,
  color: 'var(--text-muted, #94a3b8)',
  flexShrink: 0,
};

const footerStyle = {
  padding: '14px 24px 20px',
  borderTop: '1px solid var(--border, #e4e4e7)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};

const btnPrimary = {
  background: 'var(--primary)',
  color: '#ffffff',
  padding: '9px 16px',
  border: 'none',
  borderRadius: 8,
  fontWeight: 500,
  cursor: 'pointer',
  fontSize: 14,
};

const btnSecondary = {
  background: 'transparent',
  color: 'var(--text-muted, #64748b)',
  padding: '9px 16px',
  border: '1px solid var(--border, #e4e4e7)',
  borderRadius: 8,
  fontWeight: 500,
  cursor: 'pointer',
  fontSize: 14,
};

const avatarThumb = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  objectFit: 'cover',
  border: '1px solid var(--border, #e4e4e7)',
};

const avatarPlaceholder = {
  ...avatarThumb,
  background: 'var(--bg-subtle, #f1f5f9)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-muted, #94a3b8)',
  fontSize: 18,
};

export default function LinkedInSyncModal({
  diff = [],
  oidc = null,
  firstSync = false,
  onConfirm,
  onDismiss,
}) {
  // Default-Selection: IMMER nur Profilbild default-aktiv (egal ob firstSync).
  // Begründung: Avatar-Sync ist für 15 LinkedIn-User auf Prod ein klarer Win
  // (alle haben empty avatar_url, kein Custom-Upload-Risk). full_name + linkedin_url
  // bleiben default-OFF, damit ein blinder „Übernehmen"-Klick keinen Custom-Spitznamen
  // überschreibt. firstSync wird nur noch für Modal-Titel/Description genutzt.
  const [selected, setSelected] = useState(() => {
    const initial = new Set();
    for (const d of diff) {
      if (d.field === 'avatar_url') initial.add(d.field);
    }
    return initial;
  });
  const [applying, setApplying] = useState(false);

  // Escape-Key zum Schließen
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !applying) onDismiss?.() }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applying, onDismiss]);

  function toggle(field) {
    const next = new Set(selected);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    setSelected(next);
  }

  async function handleConfirm() {
    if (applying) return;
    setApplying(true);
    try {
      await onConfirm?.(Array.from(selected), oidc);
    } finally {
      setApplying(false);
    }
  }

  function renderPreview(field) {
    const f = diff.find(d => d.field === field);
    if (!f) return null;
    if (f.type === 'image') {
      return (
        <>
          <div style={previewBubble}>
            <div style={labelStyle}>Aktuell</div>
            {f.current
              ? <img src={f.current} alt="" style={avatarThumb} onError={(e) => { e.currentTarget.style.display = 'none' }} />
              : <div style={avatarPlaceholder}>?</div>}
          </div>
          <span style={arrowStyle}>→</span>
          <div style={previewBubble}>
            <div style={labelStyle}>Aus LinkedIn</div>
            <img src={f.fresh} alt="" style={avatarThumb} onError={(e) => { e.currentTarget.style.display = 'none' }} />
          </div>
        </>
      );
    }
    return (
      <>
        <div style={previewBubble}>
          <div style={labelStyle}>Aktuell</div>
          <div>{f.current || <em style={{ color: 'var(--text-muted, #94a3b8)' }}>(leer)</em>}</div>
        </div>
        <span style={arrowStyle}>→</span>
        <div style={previewBubble}>
          <div style={labelStyle}>Aus LinkedIn</div>
          <div>{f.fresh}</div>
        </div>
      </>
    );
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget && !applying) onDismiss?.() }}>
      <div style={modalStyle} role="dialog" aria-modal="true" aria-labelledby="li-sync-title">
        <div style={headerStyle}>
          <h2 id="li-sync-title" style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text, #0f172a)' }}>
            {firstSync ? 'LinkedIn-Daten in Leadesk übernehmen?' : 'LinkedIn-Profil hat sich geändert'}
          </h2>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted, #64748b)' }}>
            {firstSync
              ? 'Wähle aus, welche Daten aus deinem LinkedIn-Profil in dein Leadesk-Konto übernommen werden sollen.'
              : 'Wir haben Änderungen in deinem LinkedIn-Profil erkannt. Welche möchtest du in dein Leadesk-Profil übernehmen?'}
          </div>
        </div>

        <div style={bodyStyle}>
          {diff.map((f) => (
            <div key={f.field} style={fieldRowStyle}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0, paddingTop: 4 }}>
                <input
                  type="checkbox"
                  checked={selected.has(f.field)}
                  onChange={() => toggle(f.field)}
                  disabled={applying}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--wl-primary, #0A6FB0)' }}
                />
              </label>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text, #0f172a)', marginBottom: 8 }}>
                  {f.label}
                </div>
                <div style={previewWrapStyle}>{renderPreview(f.field)}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={footerStyle}>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>
            {selected.size > 0
              ? `${selected.size} von ${diff.length} ausgewählt`
              : 'Keine Felder ausgewählt'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btnSecondary} onClick={onDismiss} disabled={applying}>
              Verwerfen
            </button>
            <button type="button" style={btnPrimary} onClick={handleConfirm} disabled={applying || selected.size === 0}>
              {applying ? 'Übernehme …' : 'Übernehmen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
