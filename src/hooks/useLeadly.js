// src/hooks/useLeadly.js
//
// Chat-Hook für den Leadly-Assistenten — jetzt konversations-fähig
// (mehrere gespeicherte Chats wie in der Text-Werkstatt).
//
// Architektur:
//   - assistant_conversations: pro Chat eine Zeile (user-scoped)
//   - assistant_messages.conversation_id: Nachrichten gehören zu einem Chat
//   - Beim Mount: Konversationsliste laden, jüngsten Chat aktiv setzen.
//     Der globale Bubble nutzt denselben Hook → zeigt den jüngsten Chat;
//     die Assistent-Seite rendert zusätzlich die Liste + Wechsel/Neu/Löschen.
//   - Realtime auf assistant_messages.user_id (Multi-Device), client-seitig
//     auf den aktiven Chat gefiltert.
//
// Public API:
//   { uid, conversations, activeConversationId, isLoadingConversations,
//     selectConversation, newConversation, deleteConversation,
//     messages, isSending, sendMessage, clearHistory,
//     briefing, fetchBriefing, markBriefingRead, unreadCount }

import { useEffect, useState, useCallback, useMemo, useRef, useId } from 'react';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';

const LOCAL_BRIEFING_READ_KEY = (uid) => `leadly_briefing_read_${uid}`;
const MSG_COLS = 'id, role, content, tool_calls, tool_use_id, tool_result, metadata, created_at, conversation_id';

export function useLeadly({ autoOpenLatest = true } = {}) {
  const { activeTeamId } = useTeam() || {};
  const [uid, setUid] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  // Guardrail: vom EF zurückgegebene, bestätigungspflichtige Schreib-Aktionen.
  const [pendingActions, setPendingActions] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [briefingReadLocal, setBriefingReadLocal] = useState(false);
  const mountedRef = useRef(true);
  const activeConvRef = useRef(null);
  const instanceId = useId().replace(/:/g, '');

  useEffect(() => { activeConvRef.current = activeConversationId; }, [activeConversationId]);

  // uid einmalig holen
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => { if (mounted) setUid(data?.user?.id || null); });
    return () => { mounted = false; };
  }, []);

  // Konversationen laden + jüngsten aktiv setzen + Realtime
  useEffect(() => {
    if (!uid) return;
    mountedRef.current = true;
    setBriefingReadLocal(window.localStorage?.getItem(LOCAL_BRIEFING_READ_KEY(uid)) === '1');

    (async () => {
      setIsLoadingConversations(true);
      // TEAM-ISOLATION: nur Chats des aktiven Teams laden; bei Team-Wechsel zurücksetzen,
      // damit niemals ein Chat (oder dessen Daten) eines anderen Teams sichtbar bleibt.
      setActiveConversationId(null);
      setMessages([]);
      let cq = supabase.from('assistant_conversations')
        .select('id, title, created_at, updated_at')
        .eq('user_id', uid);
      cq = activeTeamId ? cq.eq('team_id', activeTeamId) : cq.is('team_id', null);
      const { data: convs, error } = await cq.order('updated_at', { ascending: false }).limit(100);
      if (!mountedRef.current) return;
      if (error) { console.warn('[useLeadly] conversations load:', error.message); setIsLoadingConversations(false); return; }
      const list = convs || [];
      setConversations(list);
      setIsLoadingConversations(false);
      if (autoOpenLatest) setActiveConversationId(list[0]?.id || null);
    })();

    const channel = supabase
      .channel(`assistant_messages_${uid}_${instanceId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'assistant_messages', filter: `user_id=eq.${uid}` },
        (payload) => {
          if (!mountedRef.current) return;
          if (payload.new.conversation_id !== activeConvRef.current) return;
          setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        })
      .subscribe();

    return () => { mountedRef.current = false; supabase.removeChannel(channel); };
  }, [uid, instanceId, autoOpenLatest, activeTeamId]);

  // Nachrichten des aktiven Chats laden
  useEffect(() => {
    if (!uid) return;
    if (!activeConversationId) { setMessages([]); return; }
    let m = true;
    (async () => {
      const { data, error } = await supabase
        .from('assistant_messages')
        .select(MSG_COLS)
        .eq('conversation_id', activeConversationId)
        .order('created_at', { ascending: true })
        .limit(400);
      if (!m || !mountedRef.current) return;
      if (error) { console.warn('[useLeadly] messages load:', error.message); return; }
      setMessages(data || []);
    })();
    return () => { m = false; };
  }, [uid, activeConversationId]);

  const refreshConversations = useCallback(async () => {
    if (!uid) return;
    let rq = supabase.from('assistant_conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', uid);
    rq = activeTeamId ? rq.eq('team_id', activeTeamId) : rq.is('team_id', null);
    const { data } = await rq.order('updated_at', { ascending: false }).limit(100);
    if (mountedRef.current) setConversations(data || []);
  }, [uid, activeTeamId]);

  const selectConversation = useCallback((id) => {
    setActiveConversationId(id);
    setMessages([]);
    setPendingActions([]);
  }, []);

  // Neuer Chat: noch nicht persistiert (wird beim ersten Senden angelegt)
  const newConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setPendingActions([]);
  }, []);

  const deleteConversation = useCallback(async (id) => {
    if (!uid || !id) return;
    await supabase.from('assistant_conversations').delete().eq('id', id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvRef.current === id) {
      setMessages([]);
      setActiveConversationId(prevActive => {
        const rest = conversations.filter(c => c.id !== id);
        return rest[0]?.id || null;
      });
    }
  }, [uid, conversations]);

  // Briefing abrufen / generieren
  const fetchBriefing = useCallback(async () => {
    if (!uid) return null;
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('assistant_briefings')
      .select('briefing_text, context_json, briefing_date, read_at')
      .eq('user_id', uid).eq('briefing_date', today).maybeSingle();
    if (existing) { setBriefing(existing); return existing; }
    const { data: fnData, error: fnErr } = await supabase.functions.invoke('leadly', {
      body: { mode: 'briefing', team_id: activeTeamId || null },
    });
    if (fnErr) { console.warn('[useLeadly] briefing fetch failed:', fnErr.message); return null; }
    const built = { briefing_text: fnData.briefing_text, context_json: fnData.context, briefing_date: today, read_at: null };
    setBriefing(built);
    return built;
  }, [uid, activeTeamId]);

  const markBriefingRead = useCallback(() => {
    if (!uid) return;
    setBriefingReadLocal(true);
    try { window.localStorage?.setItem(LOCAL_BRIEFING_READ_KEY(uid), '1'); } catch {}
  }, [uid]);

  // sendMessage: legt bei Bedarf einen Chat an, persistiert mit conversation_id
  const sendMessage = useCallback(async (text, attachments = []) => {
    const trimmed = (text || '').trim();
    const atts = Array.isArray(attachments) ? attachments.filter(a => a && a.base64 && a.type) : [];
    if (!uid || (!trimmed && atts.length === 0)) return;
    setIsSending(true);
    setPendingActions([]); // neue Eingabe verwirft offene Vorschläge
    const effectiveText = trimmed || 'Bitte sieh dir meinen Anhang an.';

    // Chat sicherstellen (lazy anlegen)
    let convId = activeConvRef.current;
    if (!convId) {
      const title = (trimmed || 'Anhang').slice(0, 60) || 'Neuer Chat';
      const { data: c } = await supabase.from('assistant_conversations')
        .insert({ user_id: uid, team_id: activeTeamId || null, title })
        .select('id, title, created_at, updated_at').single();
      if (c) {
        convId = c.id;
        activeConvRef.current = c.id;
        setActiveConversationId(c.id);
        setConversations(prev => [c, ...prev]);
      }
    }

    const userMsg = {
      id: `opt-${Date.now()}`, role: 'user', content: trimmed,
      attachments: atts.map(a => ({ name: a.name, type: a.type, isImage: a.type.startsWith('image/'), base64: a.base64 })),
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const recent = [
        ...messages.slice(-30)
          .filter(m => (m.role === 'user' && m.content) || (m.role === 'assistant' && m.content))
          .map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: effectiveText },
      ];

      const { data, error } = await supabase.functions.invoke('leadly', {
        body: {
          mode: 'chat', messages: recent, team_id: activeTeamId || null,
          attachments: atts.map(a => ({ name: a.name, type: a.type, base64: a.base64 })),
        },
      });
      if (error) throw error;

      const { data: savedUser } = await supabase.from('assistant_messages').insert({
        user_id: uid, team_id: activeTeamId || null, conversation_id: convId,
        role: 'user', content: trimmed || (atts.length ? '📎 Anhang' : ''),
      }).select(MSG_COLS).single();

      const toolResults = data.tool_results || [];
      const savedTools = [];
      for (const tr of toolResults) {
        const { data: savedTr } = await supabase.from('assistant_messages').insert({
          user_id: uid, team_id: activeTeamId || null, conversation_id: convId,
          role: 'tool', content: tr.name, tool_use_id: tr.tool_use_id, tool_result: tr.output,
        }).select(MSG_COLS).single();
        if (savedTr) savedTools.push(savedTr);
      }

      const reply = data.reply;
      let savedAssistant = null;
      if (reply) {
        const { data: sa } = await supabase.from('assistant_messages').insert({
          user_id: uid, team_id: activeTeamId || null, conversation_id: convId,
          role: 'assistant', content: reply.content || null, tool_calls: reply.tool_calls || null,
          metadata: { model: data.model, finish_reason: data.finish_reason, iterations: data.iterations },
        }).select(MSG_COLS).single();
        savedAssistant = sa;
      }

      setMessages(prev => {
        const withoutOpt = prev.filter(m => m.id !== userMsg.id);
        const additions = [];
        if (savedUser) additions.push(userMsg.attachments?.length ? { ...savedUser, attachments: userMsg.attachments } : savedUser);
        additions.push(...savedTools);
        if (savedAssistant) additions.push(savedAssistant);
        return [...withoutOpt, ...additions];
      });

      // Guardrail: bestätigungspflichtige Schreib-Aktionen anzeigen (nicht ausgeführt).
      if (data.requires_confirmation && Array.isArray(data.pending_actions) && data.pending_actions.length) {
        setPendingActions(data.pending_actions.map(a => ({ ...a, conversation_id: convId })));
      }

      // Chat-Reihenfolge aktualisieren (updated_at) + Liste neu sortieren
      await supabase.from('assistant_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
      refreshConversations();
    } catch (e) {
      console.warn('[useLeadly] sendMessage failed:', e?.message || e);
      setMessages(prev => ([...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: 'Leadly konnte gerade nicht antworten. Versuch es bitte gleich nochmal.',
        metadata: { error: e?.message || 'unknown' }, created_at: new Date().toISOString(),
      }]));
    } finally {
      setIsSending(false);
    }
  }, [uid, activeTeamId, messages, refreshConversations]);

  // confirmAction: führt eine zuvor vorgeschlagene Schreib-Aktion nach User-Freigabe aus.
  const confirmAction = useCallback(async (action) => {
    if (!uid || !action || !action.name) return;
    const convId = action.conversation_id || activeConvRef.current;
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('leadly', {
        body: { mode: 'chat', confirmed_action: { name: action.name, input: action.input || {} }, team_id: activeTeamId || null },
      });
      if (error) throw error;
      setPendingActions(prev => prev.filter(a => a.tool_use_id !== action.tool_use_id));
      if (convId) {
        const savedTools = [];
        for (const tr of (data.tool_results || [])) {
          const { data: savedTr } = await supabase.from('assistant_messages').insert({
            user_id: uid, team_id: activeTeamId || null, conversation_id: convId,
            role: 'tool', content: tr.name, tool_use_id: tr.tool_use_id, tool_result: tr.output,
          }).select(MSG_COLS).single();
          if (savedTr) savedTools.push(savedTr);
        }
        let savedAssistant = null;
        if (data.reply) {
          const { data: sa } = await supabase.from('assistant_messages').insert({
            user_id: uid, team_id: activeTeamId || null, conversation_id: convId,
            role: 'assistant', content: data.reply.content || null,
            metadata: { model: data.model, finish_reason: data.finish_reason, confirmed: true },
          }).select(MSG_COLS).single();
          savedAssistant = sa;
        }
        setMessages(prev => {
          const have = new Set(prev.map(m => m.id));
          const add = [...savedTools, ...(savedAssistant ? [savedAssistant] : [])].filter(m => m && !have.has(m.id));
          return [...prev, ...add];
        });
        await supabase.from('assistant_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
        refreshConversations();
      }
    } catch (e) {
      console.warn('[useLeadly] confirmAction failed:', e?.message || e);
      setMessages(prev => ([...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: 'Die Aktion konnte nicht ausgeführt werden. Versuch es bitte nochmal.',
        metadata: { error: e?.message || 'unknown' }, created_at: new Date().toISOString(),
      }]));
    } finally {
      setIsSending(false);
    }
  }, [uid, activeTeamId, refreshConversations]);

  const dismissActions = useCallback(() => setPendingActions([]), []);

  // clearHistory: startet einen neuen Chat (nicht destruktiv — alte Chats bleiben)
  const clearHistory = useCallback(() => { newConversation(); }, [newConversation]);

  const unreadCount = useMemo(() => {
    if (!briefing) return 0;
    return briefingReadLocal ? 0 : 1;
  }, [briefing, briefingReadLocal]);

  return useMemo(() => ({
    uid,
    conversations, activeConversationId, isLoadingConversations,
    selectConversation, newConversation, deleteConversation,
    messages, isSending, sendMessage, clearHistory,
    pendingActions, confirmAction, dismissActions,
    briefing, fetchBriefing, markBriefingRead, unreadCount,
  }), [uid, conversations, activeConversationId, isLoadingConversations, selectConversation, newConversation, deleteConversation, messages, isSending, sendMessage, clearHistory, pendingActions, confirmAction, dismissActions, briefing, fetchBriefing, markBriefingRead, unreadCount]);
}
