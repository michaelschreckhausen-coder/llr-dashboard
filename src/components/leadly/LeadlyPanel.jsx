// src/components/leadly/LeadlyPanel.jsx
//
// Slide-in Chat-Panel rechts unten (Desktop) / Full-Screen (Mobile).
// Wird vom Bubble geöffnet, kann via X geschlossen werden. Rendert das
// Briefing als Pinned-Message oben + die normale Chat-History.

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { Plus, Mic, Square, FileText, CalendarDays, Sparkles, MessageSquare, Pencil } from 'lucide-react';

const PANEL_WIDTH = 410;
const PANEL_HEIGHT = 640;
const PRIMARY = 'var(--wl-primary, rgb(49,90,231))';

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
  padding: '20px 16px 8px',
  background: 'var(--page-bg, #F8FAFC)',
  display: 'flex', flexDirection: 'column',
};

const scrollInnerStyle = {
  maxWidth: 780, margin: '0 auto', width: '100%',
  display: 'flex', flexDirection: 'column', gap: 16,
};

const inputBarStyle = {
  margin: '10px auto 14px',
  maxWidth: 760,
  width: 'calc(100% - 28px)',
  boxSizing: 'border-box',
  border: '1.5px solid var(--border, #E4E7EC)',
  borderRadius: 14,
  background: '#fff',
  padding: '8px 8px 8px 12px',
  display: 'flex', gap: 8, alignItems: 'flex-end',
  boxShadow: '0 1px 3px rgba(15,23,42,.04)',
};

const textareaStyle = {
  flex: 1,
  border: 'none',
  padding: '8px 4px',
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'none',
  outline: 'none',
  minHeight: 24, maxHeight: 120,
  background: 'transparent',
};

const sendBtnStyle = (disabled) => ({
  padding: '9px 14px',
  borderRadius: 10,
  border: 'none',
  background: disabled ? '#CBD5E1' : PRIMARY,
  color: '#fff',
  fontSize: 13, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const bubbleStyle = (role) => ({
  alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
  background: role === 'user' ? PRIMARY : '#fff',
  color: role === 'user' ? '#fff' : 'var(--text-primary, #101828)',
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 14, lineHeight: 1.6,
  maxWidth: '92%',
  border: role === 'user' ? 'none' : '1px solid var(--border, #E4E7EC)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

const toolCardStyle = (ok) => ({
  alignSelf: 'flex-start',
  background: ok ? '#F6FBF8' : '#FEF2F2',
  border: `1px solid ${ok ? '#D1FAE5' : '#FECACA'}`,
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 12,
  color: ok ? '#166534' : '#991B1B',
  maxWidth: '92%',
});

const briefingStyle = {
  alignSelf: 'stretch',
  background: '#fff',
  border: '1px solid var(--border, #E4E7EC)',
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 13, lineHeight: 1.55,
  color: 'var(--text-primary, #101828)',
};

// Mini-Markdown-Renderer (Fett, Überschriften, Listen, Tabellen, Trennlinien) für
// Assistenten-Nachrichten — keine externe Lib nötig.
function renderInline(text, kp) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((seg, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(seg);
    return m ? <strong key={kp + '-' + i}>{m[1]}</strong> : <span key={kp + '-' + i}>{seg}</span>;
  });
}
function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = []; let i = 0, key = 0; let listBuf = null;
  const flushList = () => {
    if (!listBuf) return;
    const Tag = listBuf.ordered ? 'ol' : 'ul';
    out.push(<Tag key={'l' + (key++)} style={{ margin: '4px 0', paddingLeft: 20 }}>
      {listBuf.items.map((it, j) => <li key={j} style={{ margin: '2px 0' }}>{renderInline(it, 'li' + key + j)}</li>)}
    </Tag>);
    listBuf = null;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList(); const tbl = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { tbl.push(lines[i]); i++; }
      const rows = tbl.filter(r => !/^\s*\|[\s|:-]+\|\s*$/.test(r))
        .map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      if (rows.length) out.push(
        <table key={'t' + (key++)} style={{ borderCollapse: 'collapse', margin: '6px 0', fontSize: 13 }}><tbody>
          {rows.map((cells, ri) => <tr key={ri}>{cells.map((c, ci) => <td key={ci} style={{ border: '1px solid #E4E7EC', padding: '4px 8px', verticalAlign: 'top' }}>{renderInline(c, 't' + ri + ci)}</td>)}</tr>)}
        </tbody></table>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flushList(); out.push(<div key={'h' + (key++)} style={{ fontWeight: 700, fontSize: 14, margin: '8px 0 2px' }}>{renderInline(h[2], 'h' + key)}</div>); i++; continue; }
    if (/^\s*---+\s*$/.test(line)) { flushList(); out.push(<hr key={'hr' + (key++)} style={{ border: 'none', borderTop: '1px solid #E4E7EC', margin: '8px 0' }} />); i++; continue; }
    const li = /^\s*[-*]\s+(.*)$/.exec(line); const oli = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (li || oli) {
      const ordered = !!oli;
      if (!listBuf || listBuf.ordered !== ordered) { flushList(); listBuf = { ordered, items: [] }; }
      listBuf.items.push(li ? li[1] : oli[1]); i++; continue;
    }
    if (line.trim() === '') { flushList(); i++; continue; }
    flushList(); out.push(<div key={'p' + (key++)} style={{ margin: '3px 0' }}>{renderInline(line, 'p' + key)}</div>); i++;
  }
  flushList(); return out;
}

const TOOL_LABELS = {
  create_lead: 'Kontakt angelegt', create_task: 'Aufgabe angelegt', create_deal: 'Deal angelegt',
  update_lead: 'Kontakt aktualisiert', update_deal: 'Deal aktualisiert', update_organization: 'Unternehmen aktualisiert',
  search_leads: 'Kontakte durchsucht', remember_preference: 'Notiz gemerkt', forget_preference: 'Notiz gelöscht',
  get_account_overview: 'Account-Überblick abgerufen', get_brands: 'Brands abgerufen', list_audiences: 'Zielgruppen abgerufen',
  list_knowledge: 'Wissensdatenbank abgerufen', list_posts: 'Beiträge abgerufen', get_ssi: 'SSI abgerufen',
  list_connections: 'Vernetzungen abgerufen', get_brand_memory: 'Brand-Memory gelesen', add_brand_memory: 'Brand-Memory ergänzt',
  diagnose_publishing: 'Veröffentlichungen geprüft', get_credit_status: 'Credit-Stand geprüft',
  get_connection_status: 'LinkedIn-Verbindung geprüft', report_problem: 'Support-Ticket erstellt',
};

function MessageBubble({ msg, onNavigate }) {
  if (msg.role === 'tool') {
    const ok = msg.tool_result?.ok !== false;
    const label = TOOL_LABELS[msg.content] || 'Aktion ausgeführt';
    const extra = ok ? formatToolResult(msg.content, msg.tool_result?.data) : '';
    const summary = ok ? (extra ? `${label} · ${extra}` : label) : (msg.tool_result?.error || 'Fehler');
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
  if (msg.role === 'user') {
    const atts = msg.attachments || [];
    if (!msg.content && atts.length === 0) return null;
    return (
      <div style={bubbleStyle(msg.role)}>
        {atts.length > 0 && <AttachmentList items={atts} />}
        {msg.content && <div style={atts.length ? { marginTop: 6 } : undefined}>{msg.content}</div>}
      </div>
    );
  }
  if (!msg.content) return null;
  return <div style={{ ...bubbleStyle(msg.role), whiteSpace: 'normal' }}>{renderMarkdown(msg.content)}</div>;
}

function AttachmentList({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((a, i) => (
        a.isImage ? (
          <img key={i} src={`data:${a.type};base64,${a.base64}`} alt={a.name || 'Bild'}
            style={{ maxWidth: 150, maxHeight: 150, borderRadius: 8, border: '1px solid rgba(255,255,255,0.4)', objectFit: 'cover' }} />
        ) : (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.18)', borderRadius: 8,
            padding: '5px 9px', fontSize: 12, maxWidth: 200,
          }}>
            <FileText size={14} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || 'Datei'}</span>
          </div>
        )
      ))}
    </div>
  );
}

function formatToolResult(name, data) {
  if (!data) return '';
  if (name === 'create_lead') return `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.id;
  if (name === 'create_task') return data.title || '';
  if (name === 'create_deal') return `${data.title || ''} (${data.stage || ''})`;
  if (name === 'search_leads' && Array.isArray(data)) return `${data.length} Kontakte gefunden`;
  if (name === 'update_lead' || name === 'update_deal') return 'aktualisiert';
  return '';
}

function TypingDots() {
  return (
    <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px', background: '#fff', border: '1px solid var(--border, #E4E7EC)', borderRadius: 12, width: 'fit-content' }}>
      {[0, 0.2, 0.4].map((d, i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: PRIMARY, animation: 'tw-blink 1.4s infinite ease-in-out', animationDelay: d + 's' }} />
      ))}
      <style>{`@keyframes tw-blink { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }`}</style>
    </div>
  );
}

const convItemBase = { width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 };
const convItem = (active) => ({ ...convItemBase, background: active ? '#EFF3FF' : 'transparent', color: active ? PRIMARY : 'var(--text-muted, #475467)', fontWeight: active ? 700 : 500 });
const convItemNew = { ...convItemBase, background: PRIMARY, color: '#fff', fontWeight: 700, textAlign: 'center' };

export default function LeadlyPanel({ leadly, onClose, embedded = false, hideHeader = false }) {
  const nav = useNavigate();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [text, setText] = useState('');
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [convMenuOpen, setConvMenuOpen] = useState(false);
  const fileInputRef = useRef(null);

  // Datei(en) einlesen → base64. Bilder + PDFs bevorzugt, max 5 Anhänge / 8 MB.
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const read = (file) => new Promise((resolve) => {
      if (file.size > 8 * 1024 * 1024) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        resolve({ name: file.name, type: file.type || 'application/octet-stream', isImage: (file.type || '').startsWith('image/'), base64 });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    const results = (await Promise.all(files.map(read))).filter(Boolean);
    setAttachments(prev => [...prev, ...results].slice(0, 5));
  };

  const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  // Voice-Input: nach Stop wird der Transcript DIREKT gesendet (Auto-Send).
  // Wenn der User bereits Text im Textarea hat, wird er mit dem Transcript
  // kombiniert + zusammen gesendet. Beide Modi (Web Speech / Whisper)
  // verhalten sich identisch.
  const voice = useVoiceInput({
    language: 'de-DE',
    onFinalTranscript: (t) => {
      const transcript = t.trim();
      if (!transcript) return;
      // Bestehenden Text (vom Tippen) mit Voice-Transcript kombinieren
      const existing = text.trim();
      const sep = existing && !existing.endsWith(' ') ? ' ' : '';
      const combined = existing + sep + transcript;
      setText('');
      leadly.sendMessage(combined);
    },
  });

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
    if (leadly.isSending) return;
    if (!text.trim() && attachments.length === 0) return;
    const value = text;
    const atts = attachments;
    setText('');
    setAttachments([]);
    leadly.sendMessage(value, atts);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isEmpty = leadly.messages.length === 0 && !leadly.briefing && !leadly.isSending;
  const bodyStyle = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', ...(isEmpty ? { justifyContent: 'center' } : {}) };

  const containerStyle = embedded
    ? (hideHeader
        ? { display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', overflow: 'hidden' }
        : { display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: 14, border: '1px solid #E4E7EC', overflow: 'hidden' })
    : overlayStyle;

  return (
    <div style={containerStyle} aria-label="Leadly Chat">
      {!hideHeader && (
      <div style={headerStyle}>
        <div style={headerAvatar}>L</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Leadly</div>
            <span style={{
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.22)',
              color: '#fff',
              padding: '2px 7px', borderRadius: 4,
              lineHeight: 1.2,
            }}>Beta</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Dein KI-Assistent</div>
        </div>
        {Array.isArray(leadly.conversations) && (
          <button type="button"
            onClick={() => setConvMenuOpen(v => !v)}
            title="Gespeicherte Chats"
            style={{ background: convMenuOpen ? 'rgba(255,255,255,0.18)' : 'none', border: 'none', color: '#fff', opacity: 0.9, cursor: 'pointer', padding: '5px 7px', borderRadius: 7, display: 'inline-flex' }}>
            <MessageSquare size={16} strokeWidth={1.9} />
          </button>
        )}
        <button type="button"
          onClick={() => { leadly.newConversation ? leadly.newConversation() : leadly.clearHistory?.(); }}
          title="Neuer Chat"
          style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.85, cursor: 'pointer', padding: '5px 7px', borderRadius: 7, display: 'inline-flex' }}>
          <Pencil size={15} strokeWidth={1.9} />
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
      )}

      {!hideHeader && convMenuOpen && Array.isArray(leadly.conversations) && (
        <div style={{ borderBottom: '1px solid var(--border,#E4E7EC)', background: '#fff', maxHeight: 240, overflowY: 'auto', padding: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => { leadly.newConversation?.(); setConvMenuOpen(false); }} style={convItemNew}>+ Neuer Chat</button>
          <div style={{ height: 6 }} />
          {leadly.conversations.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: '#94A3B8' }}>Noch keine gespeicherten Chats.</div>}
          {leadly.conversations.map(c => (
            <button key={c.id} type="button" onClick={() => { leadly.selectConversation?.(c.id); setConvMenuOpen(false); }} style={convItem(c.id === leadly.activeConversationId)} title={c.title || 'Chat'}>
              {c.title || 'Chat'}
            </button>
          ))}
        </div>
      )}

      <div style={bodyStyle}>
      <div ref={scrollRef} style={{ ...scrollAreaStyle, flex: isEmpty ? '0 0 auto' : 1 }}>
        <div style={{ ...scrollInnerStyle, margin: '0 auto' }}>
        {leadly.briefing && (
          <div style={briefingStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <CalendarDays size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} />Heute · {new Date(leadly.briefing.briefing_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long' })}
            </div>
            {leadly.briefing.briefing_text}
          </div>
        )}
        {leadly.messages.length === 0 && !leadly.briefing && (
          <div style={{ alignSelf: 'center', textAlign: 'center', color: 'var(--text-muted, #6B7280)', fontSize: 13, padding: '8px 12px', maxWidth: 440 }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Sparkles size={34} color={PRIMARY} /></div>
            <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', color: 'var(--text-primary, #101828)', marginBottom: 8 }}>Hi, ich bin Leadly</div>
            <div style={{ lineHeight: 1.6 }}>Sag mir, was du tun willst — z. B. „Leg Anna Müller bei Acme an", „Was steht heute an?" oder „Setz Tim auf MQN".</div>
          </div>
        )}
        {leadly.messages.map((m, i) => (
          <MessageBubble key={m.id || i} msg={m} onNavigate={nav} />
        ))}
        {leadly.isSending && <TypingDots />}
        </div>
      </div>

      {voice.error && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: '#991B1B', background: '#FEE2E2', borderTop: '1px solid #FECACA' }}>
          {voice.error}
        </div>
      )}

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 12px 0', background: '#fff' }}>
          {attachments.map((a, i) => (
            <div key={i} style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
              background: '#F1F5F9', border: '1px solid #E4E7EC', borderRadius: 8,
              padding: a.isImage ? 4 : '6px 9px', fontSize: 12, maxWidth: 180,
            }}>
              {a.isImage
                ? <img src={`data:${a.type};base64,${a.base64}`} alt={a.name} style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'cover' }} />
                : <><FileText size={14} style={{ flexShrink: 0 }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span></>}
              <button type="button" onClick={() => removeAttachment(i)} title="Entfernen"
                style={{
                  position: 'absolute', top: -7, right: -7, width: 18, height: 18, borderRadius: '50%',
                  border: 'none', background: '#475569', color: '#fff', cursor: 'pointer',
                  fontSize: 12, lineHeight: '18px', padding: 0, textAlign: 'center',
                }}>×</button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} style={inputBarStyle}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        {/* Anhang-Button */}
        <button type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Bild oder Dokument anhängen"
          disabled={leadly.isSending || attachments.length >= 5}
          style={{
            width: 38, height: 38, borderRadius: 10, border: 'none',
            background: '#F1F5F9', color: '#475569', flexShrink: 0,
            cursor: (leadly.isSending || attachments.length >= 5) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
          }}>
          <Plus size={19} />
        </button>

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={voice.isRecording
            ? (voice.mode === 'web' ? (voice.liveTranscript || 'Sprich jetzt…') : 'Nehme auf…')
            : 'Frag Leadly oder gib eine Anweisung…'}
          rows={1}
          style={textareaStyle}
          disabled={leadly.isSending || voice.isRecording}
        />
        {/* Mikrofon-Button mit Mode-Toggle (Long-Press) */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button type="button"
            onClick={voice.isRecording ? voice.stop : voice.start}
            onContextMenu={(e) => { e.preventDefault(); setVoiceMenuOpen(v => !v); }}
            title={voice.isRecording
              ? 'Aufnahme stoppen'
              : `Sprach-Eingabe (${voice.mode === 'web' ? 'Schnell' : 'Präzise'}) — Rechtsklick für Modus`}
            disabled={leadly.isSending}
            style={{
              width: 38, height: 38, borderRadius: 10, border: 'none',
              background: voice.isRecording ? '#EF4444' : '#F1F5F9',
              color: voice.isRecording ? '#fff' : '#475569',
              cursor: leadly.isSending ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
              transition: 'background 0.15s',
              animation: voice.isRecording ? 'leadly-pulse 1.2s infinite' : 'none',
            }}>
            {voice.isRecording ? <Square size={15} /> : <Mic size={17} />}
          </button>
          {voiceMenuOpen && (
            <div style={{
              position: 'absolute', bottom: '110%', left: 0,
              background: '#fff', border: '1px solid #E4E7EC', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(15,23,42,0.14)',
              padding: 4, minWidth: 200, zIndex: 10,
            }}>
              <button type="button"
                onClick={() => { voice.setMode('web'); setVoiceMenuOpen(false); }}
                disabled={!voice.supportsWeb}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 7, border: 'none',
                  background: voice.mode === 'web' ? '#EFF6FF' : 'transparent',
                  cursor: voice.supportsWeb ? 'pointer' : 'not-allowed',
                  opacity: voice.supportsWeb ? 1 : 0.5,
                  fontSize: 12.5,
                }}>
                <div style={{ fontWeight: 600 }}>{voice.mode === 'web' ? '' : ''}Schnell · Web Speech</div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>
                  {voice.supportsWeb ? 'Browser-nativ, live, gratis' : 'In diesem Browser nicht verfügbar'}
                </div>
              </button>
              <button type="button"
                onClick={() => { voice.setMode('whisper'); setVoiceMenuOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 7, border: 'none',
                  background: voice.mode === 'whisper' ? '#EFF6FF' : 'transparent',
                  cursor: 'pointer', fontSize: 12.5, marginTop: 2,
                }}>
                <div style={{ fontWeight: 600 }}>{voice.mode === 'whisper' ? '' : ''}Präzise · Whisper</div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>OpenAI, besser bei Lärm/Akzent</div>
              </button>
            </div>
          )}
        </div>
        <button type="submit" style={sendBtnStyle(leadly.isSending || (!text.trim() && attachments.length === 0))}
          disabled={leadly.isSending || (!text.trim() && attachments.length === 0)}>
          ↑
        </button>
      </form>
      </div>
    </div>
  );
}
