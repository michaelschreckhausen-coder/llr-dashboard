// src/hooks/useVoiceInput.js
//
// Voice-Input für Leadly. Zwei Modi:
//
//   mode='web'     → Web Speech API (browser-nativ, gratis, Live-Transcript)
//                    Chrome/Edge/Safari unterstützen das voll, Firefox teilweise.
//
//   mode='whisper' → MediaRecorder + Audio-Upload an Edge-Function 'transcribe'
//                    (OpenAI Whisper, präziser für Lärm/Akzent, kostet ~$0.006/min).
//
// Public API:
//   const v = useVoiceInput({ language: 'de-DE', onFinalTranscript })
//   v.supportsWeb       Boolean: SpeechRecognition im Browser verfügbar
//   v.isRecording       Boolean
//   v.mode              'web' | 'whisper'
//   v.setMode(mode)
//   v.liveTranscript    String — Interim/Final Transcript (web), nach Stop bei whisper
//   v.error             String | null
//   v.start()           Startet Recording im aktuellen Modus
//   v.stop()            Stoppt + sendet Final-Transcript an onFinalTranscript
//   v.cancel()          Stop ohne Submit

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Browser-Detection für Web Speech API (vendor-prefixes)
function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useVoiceInput({ language = 'de-DE', onFinalTranscript } = {}) {
  const [mode, setMode] = useState(() => {
    try { return window.localStorage?.getItem('leadly_voice_mode') || 'web'; }
    catch { return 'web'; }
  });
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState(null);

  const SR = getSpeechRecognition();
  const supportsWeb = !!SR;

  // Refs für aktive Instanzen
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const cancelledRef = useRef(false);

  // Mode persistieren
  useEffect(() => {
    try { window.localStorage?.setItem('leadly_voice_mode', mode); } catch {}
  }, [mode]);

  // Cleanup bei Unmount
  useEffect(() => () => {
    try { recognitionRef.current?.abort?.(); } catch {}
    try { mediaRecorderRef.current?.stop?.(); } catch {}
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
  }, []);

  // ─── Web Speech ──────────────────────────────────────────────────────
  const startWeb = useCallback(() => {
    if (!SR) {
      setError('Web Speech wird in diesem Browser nicht unterstützt. Wechsel zu Präzise (Whisper).');
      return;
    }
    setError(null);
    setLiveTranscript('');
    cancelledRef.current = false;
    const rec = new SR();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let final = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      setLiveTranscript((final + ' ' + interim).trim());
    };
    rec.onerror = (e) => {
      // 'no-speech' und 'aborted' sind harmlos — kein roter Fehler
      if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(`Spracherkennung-Fehler: ${e.error}`);
      }
    };
    rec.onend = () => {
      setIsRecording(false);
      if (!cancelledRef.current && final.trim()) {
        onFinalTranscript?.(final.trim());
      }
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      setIsRecording(true);
    } catch (e) {
      setError(`Start fehlgeschlagen: ${e?.message || e}`);
    }
  }, [SR, language, onFinalTranscript]);

  const stopWeb = useCallback(() => {
    try { recognitionRef.current?.stop?.(); } catch {}
  }, []);

  // ─── Whisper (MediaRecorder + Edge Function) ─────────────────────────
  const startWhisper = useCallback(async () => {
    setError(null);
    setLiveTranscript('');
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Codec-Wahl: Browser nehmen meist webm/opus
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        // Stream cleanup
        try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
        streamRef.current = null;
        setIsRecording(false);
        if (cancelledRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 1000) {
          setError('Aufnahme zu kurz oder kein Audio aufgenommen.');
          return;
        }
        // Upload an transcribe-Edge-Function
        setLiveTranscript('Transkribiere…');
        try {
          const form = new FormData();
          form.append('audio', blob, `recording.${(rec.mimeType || 'webm').split('/')[1].split(';')[0]}`);
          form.append('language', language.split('-')[0]); // 'de-DE' → 'de'

          const { data: { session } } = await supabase.auth.getSession();
          const accessToken = session?.access_token;
          if (!accessToken) throw new Error('Nicht eingeloggt.');

          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: form,
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Whisper ${res.status}: ${errText.slice(0, 120)}`);
          }
          const { text } = await res.json();
          setLiveTranscript(text || '');
          if (text?.trim()) onFinalTranscript?.(text.trim());
        } catch (e) {
          setError(`Whisper fehlgeschlagen: ${e?.message || e}`);
        }
      };
      rec.start();
      mediaRecorderRef.current = rec;
      setIsRecording(true);
    } catch (e) {
      setError(`Mikrofon-Zugriff verweigert oder nicht verfügbar: ${e?.message || e}`);
    }
  }, [language, onFinalTranscript]);

  const stopWhisper = useCallback(() => {
    try { mediaRecorderRef.current?.stop?.(); } catch {}
  }, []);

  // ─── Public API ──────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (mode === 'web') startWeb();
    else startWhisper();
  }, [mode, startWeb, startWhisper]);

  const stop = useCallback(() => {
    if (mode === 'web') stopWeb();
    else stopWhisper();
  }, [mode, stopWeb, stopWhisper]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
    setLiveTranscript('');
  }, [stop]);

  return {
    mode, setMode,
    supportsWeb,
    isRecording,
    liveTranscript,
    error,
    start, stop, cancel,
  };
}
