// src/components/leadly/LeadlyLogoSlot.jsx
//
// Logo-Slot im Dashboard-Hero (ersetzt den früheren Avatar). Zeigt das vom Kunden
// hochgeladene Firmen-Logo; ist keins gesetzt, bietet er den Upload an.
//
// Speicher: team-scoped im bestehenden, kunden-schreibbaren `visuals`-Bucket unter
// `<team_id>/branding/leadly-logo.png` (RLS: erster Pfad-Ordner = Team-ID des Users,
// Migration 20260513120000). Kein DB-Schema nötig, firmenweit (team-scoped). Bild
// wird vor Upload auf PNG ≤512px normalisiert → fester Pfad, deterministisch ladbar.

import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTeam } from '../../context/TeamContext';
import { colors, radii } from '../../theme';

const LOGO_PATH = (teamId) => `${teamId}/branding/leadly-logo.png`;

// Datei → quadratisch begrenztes PNG (max 512px), als Blob
function toPngBlob(file, maxDim = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}

export default function LeadlyLogoSlot({ size = 'default' }) {
  const sm = size === 'sm';
  const { activeTeamId } = useTeam() || {};
  const [logoUrl, setLogoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const loadLogo = async () => {
    if (!activeTeamId) { setLogoUrl(null); return; }
    try {
      const { data } = await supabase.storage.from('visuals').createSignedUrl(LOGO_PATH(activeTeamId), 60 * 60 * 24);
      setLogoUrl(data?.signedUrl || null);
    } catch { setLogoUrl(null); }
  };

  useEffect(() => { loadLogo(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeTeamId]);

  const handleFile = async (file) => {
    if (!file || !activeTeamId) return;
    setError(null); setUploading(true);
    try {
      const blob = await toPngBlob(file);
      const { error: upErr } = await supabase.storage
        .from('visuals')
        .upload(LOGO_PATH(activeTeamId), blob, { upsert: true, contentType: 'image/png' });
      if (upErr) throw upErr;
      await loadLogo();
    } catch (e) {
      setError(e?.message || 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  const pick = () => fileRef.current?.click();

  const input = (
    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
      onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
  );

  // ── Kompakte Variante: kleines, quadratisches Logo (z.B. im Hero-Karten-Header) ──
  if (sm) {
    const S = 44;
    return (
      <>
        {input}
        {logoUrl ? (
          <button type="button" onClick={pick} title="Logo ändern"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={logoUrl} alt="Firmenlogo" style={{ width: S, height: S, objectFit: 'contain', display: 'block' }} />
          </button>
        ) : (
          <button type="button" onClick={pick} disabled={uploading || !activeTeamId}
            title={activeTeamId ? 'Firmenlogo hochladen' : 'Kein aktives Team'}
            style={{
              width: S, height: S, borderRadius: radii.md, flexShrink: 0,
              border: `1.5px dashed ${colors.border}`, background: colors.white,
              color: colors.inkMuted, cursor: activeTeamId ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
            {uploading
              ? <Loader2 size={16} style={{ animation: 'leadly-spin 1s linear infinite' }} />
              : <ImagePlus size={16} />}
          </button>
        )}
        <style>{`@keyframes leadly-spin { to { transform: rotate(360deg); } }`}</style>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {input}

      {logoUrl ? (
        <button type="button" onClick={pick} title="Logo ändern"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, borderRadius: radii.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={logoUrl} alt="Firmenlogo"
            style={{ width: '100%', maxWidth: 150, maxHeight: 110, objectFit: 'contain', display: 'block' }} />
        </button>
      ) : (
        <button type="button" onClick={pick} disabled={uploading || !activeTeamId}
          title={activeTeamId ? 'Firmenlogo hochladen' : 'Kein aktives Team'}
          style={{
            width: 132, height: 110, borderRadius: radii.lg,
            border: `1.5px dashed ${colors.border}`, background: colors.white,
            color: colors.inkMuted, cursor: activeTeamId ? 'pointer' : 'not-allowed',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 12, fontWeight: 500, textAlign: 'center', padding: 8,
          }}>
          {uploading
            ? <Loader2 size={20} style={{ animation: 'leadly-spin 1s linear infinite' }} />
            : <ImagePlus size={20} />}
          <span>{uploading ? 'Lädt …' : 'Logo hochladen'}</span>
        </button>
      )}
      {error && <span style={{ fontSize: 11, color: colors.danger, maxWidth: 150, textAlign: 'center' }}>{error}</span>}
      <style>{`@keyframes leadly-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
