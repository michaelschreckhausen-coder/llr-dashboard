// src/hooks/useTextToSpeech.js
//
// TTS-Wiedergabe für Leadly (Inkrement 1B). Schickt Antworttext an die
// speak-Edge-Function (Azure Speech, EU-Region) und spielt das mp3 ab.
// Nur Antworttext geht raus — Datenminimierung.
//
// Public API:
//   const tts = useTextToSpeech()
//   tts.muted          Boolean (persistiert in localStorage)
//   tts.toggleMuted()
//   tts.isSpeaking     Boolean
//   tts.error          String | null
//   tts.speak(text)    spielt Text vor (no-op wenn muted/leer)
//   tts.stop()         stoppt laufende Wiedergabe

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const MUTE_KEY = 'leadly_tts_muted';
const MAX_CHARS = 3000;

// Markdown → vorlesbarer Klartext (clientseitig, EF strippt defensiv nochmal)
function toSpeakable(raw) {
  return String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^\s*[#>]+\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useTextToSpeech() {
  const [muted, setMuted] = useState(() => {
    try { return window.localStorage?.getItem(MUTE_KEY) === '1'; } catch { return false; }
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState(null);

  const audioRef = useRef(null);
  const urlRef = useRef(null);
  const reqIdRef = useRef(0);

  const cleanupAudio = useCallback(() => {
    try { audioRef.current?.pause?.(); } catch { /* ignore */ }
    if (urlRef.current) { try { URL.revokeObjectURL(urlRef.current); } catch { /* ignore */ } urlRef.current = null; }
    audioRef.current = null;
  }, []);

  const stop = useCallback(() => {
    reqIdRef.current += 1; // invalidiert laufende speak()-Antwort
    cleanupAudio();
    setIsSpeaking(false);
  }, [cleanupAudio]);

  useEffect(() => () => { stop(); }, [stop]);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try { window.localStorage?.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      if (next) stop(); // beim Stummschalten laufende Wiedergabe beenden
      return next;
    });
  }, [stop]);

  const speak = useCallback(async (rawText) => {
    if (muted) return;
    const text = toSpeakable(rawText).slice(0, MAX_CHARS);
    if (!text) return;

    // vorherige Wiedergabe beenden, neue Request-ID vergeben
    reqIdRef.current += 1;
    const myId = reqIdRef.current;
    cleanupAudio();
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) return; // nicht eingeloggt → still ignorieren

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/speak`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (myId !== reqIdRef.current) return; // zwischenzeitlich gestoppt/überholt
      if (!res.ok) {
        let msg = `speak ${res.status}`;
        try { const j = await res.json(); msg = j?.error || msg; } catch { /* ignore */ }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      if (myId !== reqIdRef.current) return;

      const objUrl = URL.createObjectURL(blob);
      urlRef.current = objUrl;
      const audio = new Audio(objUrl);
      audioRef.current = audio;
      audio.onended = () => { if (myId === reqIdRef.current) { setIsSpeaking(false); cleanupAudio(); } };
      audio.onerror = () => { if (myId === reqIdRef.current) { setIsSpeaking(false); cleanupAudio(); } };
      setIsSpeaking(true);
      try {
        await audio.play();
      } catch {
        // Browser-Autoplay-Block (kein User-Gesture im Call-Stack) → leise scheitern,
        // keine rote Fehlermeldung. Nächste gesture-nahe Wiedergabe klappt.
        if (myId === reqIdRef.current) { setIsSpeaking(false); cleanupAudio(); }
      }
    } catch (e) {
      if (myId === reqIdRef.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [muted, cleanupAudio]);

  return { muted, toggleMuted, isSpeaking, error, speak, stop };
}
