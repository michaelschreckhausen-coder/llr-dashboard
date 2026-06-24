// src/components/leadly/LeadlyBubble.jsx
//
// Globaler Floating-Chatbot-Bubble unten rechts, klickbar → öffnet das
// LeadlyPanel (Slide-in). In Layout.jsx eingehängt — auf allen Seiten
// sichtbar (außer /assistant, das die Full-Screen-Variante ist).
//
// Verhalten:
//   - Beim ersten Mount: Briefing für heute laden (RLS-konform user_id-scope)
//   - Wenn Briefing neu (read_at = null) UND noch nicht lokal markiert: Badge "1"
//   - Beim Auto-Open: Briefing als erste Bot-Message im Panel anzeigen

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLeadly } from '../../hooks/useLeadly';
import LeadlyPanel from './LeadlyPanel';

const BUBBLE_SIZE = 56;

const bubbleStyle = (open) => ({
  position: 'fixed',
  right: 22, bottom: 22,
  width: BUBBLE_SIZE, height: BUBBLE_SIZE, borderRadius: '50%',
  background: open ? '#fff' : 'linear-gradient(135deg, #1E3A8A, #3B82F6)',
  color: open ? '#1E3A8A' : '#fff',
  border: open ? '1.5px solid #E4E7EC' : 'none',
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 22, fontWeight: 700,
  cursor: 'pointer',
  zIndex: 950,
  transition: 'transform 0.16s ease, background 0.16s ease',
  userSelect: 'none',
});

const badgeStyle = {
  position: 'absolute', top: -2, right: -2,
  background: '#EF4444', color: '#fff',
  minWidth: 18, height: 18, borderRadius: 9,
  padding: '0 5px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11, fontWeight: 700,
  border: '2px solid #fff',
  lineHeight: 1,
};

export default function LeadlyBubble() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const leadly = useLeadly();

  // Bubble vor Login verstecken (/login, /signup, etc). /assistant ist retired
  // (→ Redirect auf /dashboard), die Bubble ist überall die einzige Leadly-Surface.
  const hidePaths = ['/login', '/signup', '/reset-password', '/auth/callback'];
  const hidden = hidePaths.some(p => location.pathname.startsWith(p));

  // Briefing 1× pro Tag/Session anstoßen (sobald uid bekannt)
  useEffect(() => {
    if (!leadly.uid) return;
    // Vermeide doppelte Calls innerhalb derselben Session
    const sessionKey = `leadly_briefing_session_${leadly.uid}`;
    if (window.sessionStorage?.getItem(sessionKey) === '1') return;
    window.sessionStorage?.setItem(sessionKey, '1');
    leadly.fetchBriefing?.();
  }, [leadly.uid]);

  // Dashboard-Briefing-Karten (und andere Surfaces) können eine Aktion an Leadly
  // übergeben: öffnet die Bubble + sendet den Prompt. Schreib-Tools laufen dann
  // durch die Bestätigungs-Guardrail (pending_action → Übernehmen).
  useEffect(() => {
    const onPrompt = (e) => {
      const text = e?.detail?.text;
      setOpen(true);
      leadly.markBriefingRead?.();
      if (text) leadly.sendMessage?.(text);
    };
    window.addEventListener('leadly:prompt', onPrompt);
    return () => window.removeEventListener('leadly:prompt', onPrompt);
  }, [leadly]);

  if (hidden) return null;

  const handleOpen = () => {
    setOpen(true);
    leadly.markBriefingRead?.();
  };

  return (
    <>
      {!open && (
        <button type="button"
          onClick={handleOpen}
          style={bubbleStyle(false)}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          aria-label="Leadly öffnen">
          <span style={{ fontFamily: 'sans-serif', letterSpacing: -1 }}>L</span>
          {leadly.unreadCount > 0 && (
            <span style={badgeStyle}>{leadly.unreadCount}</span>
          )}
        </button>
      )}
      {open && (
        <LeadlyPanel
          leadly={leadly}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
