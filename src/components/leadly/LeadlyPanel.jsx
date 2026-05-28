// src/components/leadly/LeadlyPanel.jsx
//
// Slide-in Chat-Panel rechts unten (Desktop) / Full-Screen (Mobile).
// Wird vom Bubble geöffnet, kann via X geschlossen werden. Rendert das
// Briefing als Pinned-Message oben + die normale Chat-History.

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PANEL_WIDTH = 410;
const PANEL_HEIGHT = 640;

const overlayStyle = {
  position: 'fixed',
  right: 22, bottom: 22,
  width: PANEL_WIDTH, maxWidth: 'calc(100vw - 36px)',
  height: PANEL_HEIGHT, maxHeight: 'calc(100vh - 36px)',
  background: '#fff',
  borderRadius: 18,
  border: '1px solid #E4E7EC',
  boxShadow: '0 24px 64px rgba(15, 23, 42, 0.22)',
  display: 'flex', flexDirection: 'column',
  zIndex: 951,
  overflow: 'hidden',
};

const headerStyle = {
  padding: '14px 18px',
  borderBottom: '1px solid #F1F5F9',
  display: 'flex', alignItems: 'center', gap: 10,
  background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)',
  color: '#fff',
};

const headerAvatar = {
  width: 32, height: 32, borderRadius: '50%',
  background: 'rgba(255,255,255,0.2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 700,
};

const scrollAreaStyle = {
  flex: 1, overflowY: 'auto',
  padding: '14px 16px',
  display: 'flex', flexDirection: 'column', gap: 10,
  background: '#F8FAFC',
};

const inputBarStyle = {
  borderTop: '1px solid #F1F5F9',
  padding: '10px 12px',
  display: 'flex', gap: 8, alignItems: 'flex-end',
  background: '#fff',
};

const textareaStyle = {
  flex: 1,
  border: '1px solid #E4E7EC',
  borderRadius: 10,
  padding: '9px 12px',
  fontSize: 13.5,
  fontFamily: 'inherit',
  resize: 'none',
  outline: 'none',
  minHeight: 38, maxHeight: 100,
  background: '#fff',
};

const sendBtnStyle = (disabled) => ({
  padding: '9px 14px',
  borderRadius: 10,
  border: 'none',
  background: disabled ? '#CBD5E1' : '#1E3A8A',
  color: '#fff',
  fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const bubbleStyle = (role) => ({
  alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
  background: role === 'user' ? '#1E3A8A' : '#fff',
  color: role === 'user' ? '#fff' : '#111827',
  borderRadius: 14,
  padding: '10px 14px',
  fontSize: 13.5, lineHeight: 1.5,
  maxWidth: '85%',
  border: role === 'user' ? 'none' : '1px solid #E4E7EC',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

const toolCardStyle = (ok) => ({
  alignSelf: 'flex-start',
  background: ok ? '#F0FDF4' : '#FEF2F2',
  border: `1px solid ${ok ? '#BBF7D0' : '#FECACA'}`,
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 12,
  color: ok ? '#166534' : '#991B1B',
  maxWidth: '85%',
});

const briefingStyle = {
  background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
  border: '1px solid #BFDBFE',
  borderRadius: 14,
  padding: '12px 14px',
  fontSize: 13, lineHeight: 1.55,
  color: '#1E3A8A',
};

function MessageBubble({ msg, onNavigate }) {
  if (msg.role === 'tool') {
    const ok = msg.tool_result?.ok !== false;
    const summary = ok
      ? `✓ ${msg.content || 'Aktion ausgeführt'}: ${formatToolResult(msg.content, msg.tool_result?.data)}`
      : `✕ ${msg.content || 'Aktion fehlgeschlagen'}: ${msg.tool_result?.error || ''}`;
    return (
      <div style={toolCardStyle(ok)}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{ok ? 'Aktion erledigt' : 'Aktion fehlgeschlagen'}</div>
        <div>{summary}</div>
        {ok && msg.content === 'create_lead' && msg.tool_result?.data?.id && (
          <button type="button" onClick={() => onNavigate(`/leads/${msg.tool_result.data.id}`)}
            style={{ marginTop: 4, background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>
            → Kontakt öffnen
          </button>
        )}
        {ok && msg.content === 'create_deal' && msg.tool_result?.data?.id && (
          <button type="button" onClick={() => onNavigate('/deals')}
            style={{ marginTop: 4, background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>
            → Deals öffnen
          </button>
        )}
      </div>
    );
  }
  if (!msg.content) return null;
  return <div style={bubbleStyle(msg.role)}>{msg.content}</div>;
}

function formatToolResult(name, data) {
  if (!data) return '';
  if (name === 'create_lead') return `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.id;
  if (name === 'create_task') return data.title || '';
  if (name === 'create_deal') return `${data.title || ''} (${data.stage || ''})`;
  if (name === 'search_leads' && Array.isArray(data)) return `${data.length} Kontakte gefunden`;
  if (name === 'update_lead' || name === 'update_deal') return 'aktualisiert';
  return JSON.stringify(data).slice(0, 80);
}

export default function LeadlyPanel({ leadly, onClose, embedded = false }) {
  const nav = useNavigate();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [text, setText] = useState('');

  // Auto-Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [leadly.messages, leadly.isSending]);

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (!text.trim() || leadly.isSending) return;
    const value = text;
    setText('');
    leadly.sendMessage(value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const containerStyle = embedded
    ? { display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: 14, border: '1px solid #E4E7EC', overflow: 'hidden' }
    : overlayStyle;

  return (
    <div style={containerStyle} aria-label="Leadly Chat">
      <div style={headerStyle}>
        <div style={headerAvatar}>L</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Leadly</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Dein KI-Sales-Assistent</div>
        </div>
        <button type="button"
          onClick={() => leadly.clearHistory?.()}
          title="Verlauf leeren"
          style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.7, cursor: 'pointer', fontSize: 12, padding: '4px 8px' }}>
          ⟲
        </button>
        {!embedded && (
          <button type="button"
            onClick={onClose}
            aria-label="Schließen"
            style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.85, cursor: 'pointer', fontSize: 20, padding: '2px 6px', lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      <div ref={scrollRef} style={scrollAreaStyle}>
        {leadly.briefing && (
          <div style={briefingStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              📋 Heute · {new Date(leadly.briefing.briefing_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long' })}
            </div>
            {leadly.briefing.briefing_text}
          </div>
        )}
        {leadly.messages.length === 0 && !leadly.briefing && (
          <div style={{ alignSelf: 'center', textAlign: 'center', color: '#6B7280', fontSize: 12.5, padding: '32px 12px' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
            <div style={{ fontWeight: 600, color: '#111827', marginBottom: 4 }}>Hi, ich bin Leadly</div>
            <div>Sag mir, was du tun willst:<br/>„Leg Anna Müller bei Acme an" · „Was steht heute an?" · „Setz Tim auf MQN"</div>
          </div>
        )}
        {leadly.messages.map((m, i) => (
          <MessageBubble key={m.id || i} msg={m} onNavigate={nav} />
        ))}
        {leadly.isSending && (
          <div style={{ ...bubbleStyle('assistant'), opacity: 0.6 }}>
            <span style={{ animation: 'leadly-dots 1.4s infinite' }}>denkt nach…</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={inputBarStyle}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Frag Leadly oder gib eine Anweisung…"
          rows={1}
          style={textareaStyle}
          disabled={leadly.isSending}
        />
        <button type="submit" style={sendBtnStyle(leadly.isSending || !text.trim())}
          disabled={leadly.isSending || !text.trim()}>
          ↑
        </button>
      </form>
    </div>
  );
}
