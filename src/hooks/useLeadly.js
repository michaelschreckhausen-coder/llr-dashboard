// src/hooks/useLeadly.js
//
// Globaler Chat-Hook für den Leadly-Assistenten.
//
// Architektur:
//   - localStorage (key: leadly_messages_<userId>) für sofortigen Render
//     beim Page-Mount (kein FOUC, kein DB-Latency-Schmerz)
//   - DB-Sync im Hintergrund: jede neue Message wird nach localStorage-Insert
//     auch in assistant_messages persistiert
//   - Realtime-Subscription auf assistant_messages.user_id für Multi-Device-
//     Sync (User schreibt am Desktop, sieht's auf Mobile)
//   - Briefing-Slot: separate getter für assistant_briefings (Today's row)
//
// Public API:
//   const { messages, isSending, sendMessage, briefing, fetchBriefing,
//           clearHistory, unreadCount } = useLeadly()

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';

const LOCAL_KEY = (uid) => `leadly_messages_${uid}`;
const LOCAL_BRIEFING_READ_KEY = (uid) => `leadly_briefing_read_${uid}`;

function loadLocal(uid) {
  try {
    const raw = window.localStorage?.getItem(LOCAL_KEY(uid));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocal(uid, messages) {
  try { window.localStorage?.setItem(LOCAL_KEY(uid), JSON.stringify(messages)); } catch {}
}

export function useLeadly() {
  const { activeTeamId } = useTeam() || {};
  const [uid, setUid] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [briefing, setBriefing] = useState(null); // { briefing_text, context, briefing_date, read_at }
  const [briefingReadLocal, setBriefingReadLocal] = useState(false);
  const mountedRef = useRef(true);

  // uid einmalig holen
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUid(data?.user?.id || null);
    });
    return () => { mounted = false; };
  }, []);

  // Initial: localStorage + DB-Hydration parallel
  useEffect(() => {
    if (!uid) return;
    mountedRef.current = true;

    // 1) Sofort aus localStorage
    setMessages(loadLocal(uid));
    setBriefingReadLocal(window.localStorage?.getItem(LOCAL_BRIEFING_READ_KEY(uid)) === '1');

    // 2) Im Hintergrund: DB-Hydration (letzte 100 Messages)
    (async () => {
      const { data, error } = await supabase
        .from('assistant_messages')
        .select('id, role, content, tool_calls, tool_use_id, tool_result, metadata, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: true })
        .limit(200);
      if (!mountedRef.current) return;
      if (error) {
        console.warn('[useLeadly] hydration error:', error.message);
        return;
      }
      // Merge: lokal hat ggf. ungespeicherte optimistic items, DB ist Source-of-Truth
      // für persistente Messages. Wenn DB Items hat die lokal nicht da sind → übernehmen.
      const dbIds = new Set((data || []).map(m => m.id));
      const local = loadLocal(uid);
      const optimistic = local.filter(m => !m.id || m.id.startsWith('opt-'));
      const merged = [...(data || []), ...optimistic];
      setMessages(merged);
      saveLocal(uid, merged);
    })();

    // 3) Realtime für Multi-Device-Sync
    const channel = supabase
      .channel(`assistant_messages_${uid}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'assistant_messages', filter: `user_id=eq.${uid}` },
        (payload) => {
          if (!mountedRef.current) return;
          setMessages(prev => {
            // Vermeiden Duplikate (gleiche id schon im State)
            if (prev.some(m => m.id === payload.new.id)) return prev;
            const next = [...prev, payload.new];
            saveLocal(uid, next);
            return next;
          });
        })
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [uid]);

  // Briefing abrufen / generieren
  const fetchBriefing = useCallback(async () => {
    if (!uid) return null;
    const today = new Date().toISOString().split('T')[0];
    // 1) Existiert schon? (per RLS direkt lesbar)
    const { data: existing } = await supabase
      .from('assistant_briefings')
      .select('briefing_text, context_json, briefing_date, read_at')
      .eq('user_id', uid)
      .eq('briefing_date', today)
      .maybeSingle();
    if (existing) {
      setBriefing(existing);
      return existing;
    }
    // 2) Neu generieren via Edge-Function (mode=briefing)
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return null;
    const { data: fnData, error: fnErr } = await supabase.functions.invoke('leadly', {
      body: { mode: 'briefing', team_id: activeTeamId || null },
    });
    if (fnErr) {
      console.warn('[useLeadly] briefing fetch failed:', fnErr.message);
      return null;
    }
    // 3) Persistieren — Edge-Function schreibt via service-role nicht direkt,
    // sondern wir tun's hier vom Frontend (RLS-konform da user_id=auth.uid).
    // ABER: assistant_briefings hat keine INSERT-Policy für authenticated.
    // Daher: wir lassen die Edge-Function das Einfügen machen via service-role.
    // Hier nur das Result rendern:
    const built = { briefing_text: fnData.briefing_text, context_json: fnData.context, briefing_date: today, read_at: null };
    setBriefing(built);
    return built;
  }, [uid, activeTeamId]);

  // Briefing als gelesen markieren (localStorage — DB-Update kommt automatisch
  // wenn assistant_briefings.read_at gepflegt wird, aktuell nur clientseitig)
  const markBriefingRead = useCallback(() => {
    if (!uid) return;
    setBriefingReadLocal(true);
    try { window.localStorage?.setItem(LOCAL_BRIEFING_READ_KEY(uid), '1'); } catch {}
  }, [uid]);

  // sendMessage: lokal-optimistic + Edge-Function + DB-Persist + State-Sync
  const sendMessage = useCallback(async (text) => {
    if (!uid || !text?.trim()) return;
    setIsSending(true);

    const userMsg = {
      id: `opt-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      created_at: new Date().toISOString(),
    };
    // Optimistic local insert
    setMessages(prev => {
      const next = [...prev, userMsg];
      saveLocal(uid, next);
      return next;
    });

    try {
      // Edge-Function call mit den letzten ~30 Messages als Context
      const recent = [...messages.slice(-30), userMsg].map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_use_id: m.tool_use_id,
        tool_result: m.tool_result,
      }));

      const { data, error } = await supabase.functions.invoke('leadly', {
        body: { mode: 'chat', messages: recent, team_id: activeTeamId || null },
      });

      if (error) throw error;

      // User-Msg in DB persistieren (mit echter UUID)
      const { data: savedUser } = await supabase.from('assistant_messages').insert({
        user_id: uid, team_id: activeTeamId || null,
        role: 'user', content: text.trim(),
      }).select('id, role, content, created_at').single();

      // Tool-Results (wenn vorhanden) als 'tool'-Rows persistieren
      const toolResults = data.tool_results || [];
      const savedTools = [];
      for (const tr of toolResults) {
        const { data: savedTr } = await supabase.from('assistant_messages').insert({
          user_id: uid, team_id: activeTeamId || null,
          role: 'tool',
          content: tr.name,
          tool_use_id: tr.tool_use_id,
          tool_result: tr.output,
        }).select('id, role, content, tool_use_id, tool_result, created_at').single();
        if (savedTr) savedTools.push(savedTr);
      }

      // Assistant-Reply persistieren
      const reply = data.reply;
      let savedAssistant = null;
      if (reply) {
        const { data: sa } = await supabase.from('assistant_messages').insert({
          user_id: uid, team_id: activeTeamId || null,
          role: 'assistant',
          content: reply.content || null,
          tool_calls: reply.tool_calls || null,
          metadata: { model: data.model, finish_reason: data.finish_reason, iterations: data.iterations },
        }).select('id, role, content, tool_calls, metadata, created_at').single();
        savedAssistant = sa;
      }

      // State: optimistic user-msg ersetzen + tools + assistant anhängen
      setMessages(prev => {
        const withoutOpt = prev.filter(m => m.id !== userMsg.id);
        const additions = [];
        if (savedUser) additions.push(savedUser);
        additions.push(...savedTools);
        if (savedAssistant) additions.push(savedAssistant);
        const next = [...withoutOpt, ...additions];
        saveLocal(uid, next);
        return next;
      });
    } catch (e) {
      console.warn('[useLeadly] sendMessage failed:', e?.message || e);
      // Fehlernachricht als Assistant-Msg ins UI (nicht persistiert)
      setMessages(prev => {
        const next = [...prev, {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Leadly konnte gerade nicht antworten. Versuch es bitte gleich nochmal.',
          metadata: { error: e?.message || 'unknown' },
          created_at: new Date().toISOString(),
        }];
        saveLocal(uid, next);
        return next;
      });
    } finally {
      setIsSending(false);
    }
  }, [uid, activeTeamId, messages]);

  // Verlauf leeren (lokal + DB)
  const clearHistory = useCallback(async () => {
    if (!uid) return;
    setMessages([]);
    saveLocal(uid, []);
    await supabase.from('assistant_messages').delete().eq('user_id', uid);
  }, [uid]);

  // unreadCount: aktuell vereinfacht — 1 wenn Briefing existiert und noch nicht
  // lokal als read markiert (DB-read_at-Tracking könnte später folgen).
  const unreadCount = useMemo(() => {
    if (!briefing) return 0;
    return briefingReadLocal ? 0 : 1;
  }, [briefing, briefingReadLocal]);

  return useMemo(() => ({
    uid,
    messages,
    isSending,
    sendMessage,
    clearHistory,
    briefing,
    fetchBriefing,
    markBriefingRead,
    unreadCount,
  }), [uid, messages, isSending, sendMessage, clearHistory, briefing, fetchBriefing, markBriefingRead, unreadCount]);
}
