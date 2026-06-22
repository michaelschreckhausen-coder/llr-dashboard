// src/pages/Assistant.jsx
//
// Leadly-Vollbild im Text-Werkstatt-Look: einklappbare Chat-Liste links
// (gespeicherte Konversationen), aktiver Chat rechts. Standardmäßig ist die
// Liste eingeklappt → man startet mit einem cleanen Chatfenster. Nutzt denselben
// useLeadly-Hook wie der globale Bubble (assistant_conversations persistiert).

import React, { useEffect, useState } from 'react';
import LeadlyPanel from '../components/leadly/LeadlyPanel';
import { useLeadly } from '../hooks/useLeadly';
import { Pencil, MessageSquare, Trash2 } from 'lucide-react';

const P = 'var(--wl-primary, rgb(49,90,231))';
const SIDEBAR_KEY = 'leadly_sidebar_open';

export default function Assistant() {
  const leadly = useLeadly({ autoOpenLatest: false });
  const { conversations, activeConversationId, isLoadingConversations } = leadly;
  const [pendingDelete, setPendingDelete] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => { try { localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? '1' : '0'); } catch {} }, [sidebarOpen]);
  useEffect(() => { setPendingDelete(null); }, [activeConversationId]);

  const activeConv = conversations.find(c => c.id === activeConversationId);

  return (
    <div style={{
      display: 'flex', position: 'relative', height: 'calc(100vh - 120px)', minHeight: 0,
      overflow: 'hidden', background: 'var(--page-bg, #F7F8FA)',
      borderRadius: 14, border: '1px solid var(--border, #E9ECF2)',
    }}>
      {/* Sidebar: Chat-Liste (einklappbar) */}
      {sidebarOpen && (
        <aside style={{ width: 264, borderRight: '1px solid var(--border,#E9ECF2)', background: 'var(--page-bg, #F7F8FA)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '14px 12px 10px', display: 'flex', gap: 8 }}>
            <button onClick={() => setSidebarOpen(false)} title="Liste einklappen"
              style={{ width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface,#fff)', fontSize: 15, cursor: 'pointer', color: 'var(--text-muted,#667085)', flexShrink: 0 }}>☰</button>
            <button onClick={() => leadly.newConversation()}
              style={{ flex: 1, height: 38, padding: '0 12px', borderRadius: 9, border: 'none', background: P, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
              <Pencil size={13} strokeWidth={2} />Neuer Chat
            </button>
          </div>
          <div style={{ padding: '8px 16px 6px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-soft,#98a2b3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Gespeicherte Chats
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '2px 10px 12px' }}>
            {isLoadingConversations && <div style={{ padding: '12px 8px', fontSize: 12, color: 'var(--text-muted)' }}>Lade…</div>}
            {!isLoadingConversations && conversations.length === 0 && (
              <div style={{ padding: '14px 8px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Noch keine Chats. Starte oben einen neuen.
              </div>
            )}
            {conversations.map(c => {
              const active = c.id === activeConversationId;
              return (
                <div key={c.id} style={{ position: 'relative', marginBottom: 3 }}>
                  <button onClick={() => leadly.selectConversation(c.id)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '9px 30px 9px 11px', borderRadius: 9, border: 'none', cursor: 'pointer',
                      background: active ? 'var(--surface,#fff)' : 'transparent',
                      boxShadow: active ? '0 1px 2px rgba(16,24,40,0.06)' : 'none',
                      color: active ? 'var(--text-primary,#101828)' : 'var(--text-muted,#475467)',
                      fontSize: 12.5, lineHeight: 1.4, fontWeight: active ? 700 : 500, fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(16,24,40,0.04)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                    title={c.title}>
                    <MessageSquare size={12} strokeWidth={1.75} style={{ flexShrink: 0, opacity: 0.7 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Chat'}</span>
                  </button>
                  {pendingDelete === c.id ? (
                    <button onClick={() => { leadly.deleteConversation(c.id); setPendingDelete(null); }}
                      title="Wirklich löschen"
                      style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', border: 'none', background: '#FEE2E2', color: '#B91C1C', borderRadius: 6, padding: '3px 7px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>
                      Löschen?
                    </button>
                  ) : (
                    <button onClick={() => setPendingDelete(c.id)}
                      title="Chat löschen"
                      style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-soft,#98a2b3)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Main: aktiver Chat */}
      <main style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--page-bg, #F8FAFC)' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border,#F1F5F9)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'var(--surface,#fff)' }}>
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} title="Gespeicherte Chats anzeigen"
              style={{ width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface,#fff)', fontSize: 15, cursor: 'pointer', color: 'var(--text-muted,#667085)', flexShrink: 0 }}>☰</button>
          )}
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>L</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary,#111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeConv?.title || 'Neuer Chat'}
            </div>
            <div style={{ fontSize: 11, color: '#6B7280' }}>Leadly · dein KI-Assistent</div>
          </div>
          <button onClick={() => leadly.newConversation()} title="Neuer Chat"
            style={{ marginLeft: 'auto', height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface,#fff)', color: 'var(--text-muted,#475467)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, fontFamily: 'inherit' }}>
            <Pencil size={13} strokeWidth={1.9} />Neuer Chat
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <LeadlyPanel leadly={leadly} embedded={true} hideHeader={true} onClose={() => {}} />
        </div>
      </main>
    </div>
  );
}
