// src/components/designer/DesignerCanvas.jsx
// Grafik-Designer für die Content-Werkstatt (react-konva).
// Eigenständig & robust: react-konva wird lazy geladen (siehe DesignerPane.jsx Wrapper),
// alle Stage-Operationen in try/catch, damit ein Fehler nie die ganze Seite crasht.
//
// Props: { visual, teamId, onSaved, onReplaceVisual }
//   - visual: { id, storage_path, design_json?, title?, aspect_ratio? }
//   - teamId: aktives Team (für Upload-Pfad)
//   - onSaved(updatedVisual): nach dem Speichern (Render hochgeladen + design_json gespeichert)
//   - onReplaceVisual(newVisual): wenn die KI ein neues Basisbild erzeugt
//
// Ausschließlich Inline-Styles, alle Texte deutsch, Primary = var(--wl-primary).
//
// ─── KI-Masken-Compositing (Herzstück) ──────────────────────────────────────
// Es werden KEINE Edge-Function- oder DB-Änderungen gemacht. Masken werden
// rein client-seitig per Canvas-2D-Compositing umgesetzt:
//   1. Nutzer malt (Pinsel/Lasso/Rechteck) eine Maske über das Bild.
//   2. generate-image wird mask-free aufgerufen (Referenz = aktuelles Bild) und
//      liefert ein KI-editiertes Vollbild zurück.
//   3. Original + KI-Bild werden auf Pixel-Größe des Originals gebracht; dann wird
//      NUR der maskierte Bereich des KI-Bildes über das Original komponiert
//      (destination-out auf einer Masken-Ebene + source-over). So ändert sich
//      garantiert nur die Maske, der Rest bleibt 1:1 Original.
//   4. Das komponierte PNG wird über den (von generate-image neu erzeugten)
//      Visual-Datensatz hochgeladen und als neues Basisbild geladen.

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Group, Image as KImage, Rect, Circle, Ellipse, Line, Arrow, Text as KText, Path, Transformer } from 'react-konva'
import GenerationLoading from '../GenerationLoading'
import Konva from 'konva'
import {
  Type, Square as SquareIcon, Circle as CircleIcon, Minus, ArrowRight, Star as StarIcon,
  Trash2, Undo2, Redo2, Save, Download, BringToFront, SendToBack, Crop, Wand2,
  Bold, Italic, Sliders, Loader2, X, ChevronUp, ChevronDown, Brush, Lasso,
  Eraser, Pen, Pencil, Highlighter, PenTool, Image as ImageIcon, LayoutTemplate, Copy, ZoomIn, ZoomOut, Maximize2,
  Upload, Frame, Eye, EyeOff, Lock, Unlock, Layers, GripVertical, Underline,
  FlipHorizontal2, FlipVertical2, FlipHorizontal, FlipVertical, Scaling, Send, CalendarPlus, FileText, Search, Paintbrush,
  AlignLeft, AlignCenter, AlignRight, Baseline, MoveVertical,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { visualDataUrl, uploadDesignRender, updateVisual, getVisual, listTeamVisuals, signedVisualUrl, signedThumbUrl, uploadImageBlob, createImageVisual } from '../../lib/contentVisuals'
import { splitModelValue, DEFAULT_IMAGE_MODEL } from '../../lib/imageModels'
import { DESIGN_TEMPLATES } from '../../lib/designTemplates'
import { DESIGN_ASSETS, ASSET_CATEGORIES } from '../../lib/designAssets'
import { useBrandVoice } from '../../context/BrandVoiceContext'
import { listBrandFonts, loadBrandFonts } from '../../lib/brandFonts'
import { loadGoogleFont, isGoogleFont, isFontLoaded } from '../../lib/googleFonts'
import FontPicker from './FontPicker'
import { ColorPopover, toHex, gradientCss } from './ColorPicker'
import { searchIcons, searchGraphics, iconSvgUrl, iconToDataUrl, searchPhotos, photoToDataUrl } from '../../lib/stockMedia'
import {
  Palette, Sparkles, Plus as PlusIcon, Image as ImagePlus,
} from 'lucide-react'

const P = 'var(--wl-primary, rgb(49,90,231))'
const PRGB = 'rgb(49,90,231)'

// Schrift-Kombinationen: Font-Paar + abgestimmte, coole Farbpalette (hell/dunkel).
const TEXT_COMBOS = [
  { id: 'modern', label: 'Modern', kicker: 'INSIGHT', head: 'Modern & Klar', sub: 'Reduziert, präzise, zeitgemäß.',
    headFont: 'Montserrat', subFont: 'Inter', kickerFont: 'Inter', headStyle: 'bold',
    light: { head: '#0F172A', sub: '#64748B', kicker: '#4F46E5' }, dark: { head: '#F1F5F9', sub: '#CBD5E1', kicker: '#818CF8' } },
  { id: 'editorial', label: 'Editorial', kicker: 'MAGAZIN', head: 'Editorial Stil', sub: 'Serifen-Headline trifft klare Subline.',
    headFont: 'Playfair Display', subFont: 'Inter', kickerFont: 'Inter', headStyle: 'bold',
    light: { head: '#1A1A1A', sub: '#57534E', kicker: '#9F1239' }, dark: { head: '#FAFAF9', sub: '#D6D3D1', kicker: '#FB7185' } },
  { id: 'bold', label: 'Bold', kicker: 'STARK', head: 'BOLD STATEMENT', sub: 'Maximale Wirkung, klare Kante.',
    headFont: 'Anton', subFont: 'Barlow', kickerFont: 'Barlow', headStyle: 'normal',
    light: { head: '#111111', sub: '#4B5563', kicker: '#EA580C' }, dark: { head: '#FAFAFA', sub: '#D1D5DB', kicker: '#FB923C' } },
  { id: 'luxe', label: 'Luxe', kicker: 'PREMIUM', head: 'Elegant & Edel', sub: 'Ruhige Serifen für einen edlen Auftritt.',
    headFont: 'Cormorant Garamond', subFont: 'Jost', kickerFont: 'Jost', headStyle: 'bold',
    light: { head: '#14342B', sub: '#6B7A70', kicker: '#B08D57' }, dark: { head: '#ECFDF5', sub: '#A7C4B5', kicker: '#D4AF6A' } },
  { id: 'verspielt', label: 'Verspielt', kicker: 'HALLO', head: 'Verspielt', sub: 'Locker, freundlich, mit Charakter.',
    headFont: 'Pacifico', subFont: 'Quicksand', kickerFont: 'Quicksand', headStyle: 'normal',
    light: { head: '#E4572E', sub: '#4A5568', kicker: '#0D9488' }, dark: { head: '#FDBA74', sub: '#CBD5E1', kicker: '#5EEAD4' } },
  { id: 'tech', label: 'Tech', kicker: 'SYSTEM', head: 'Tech & Grotesk', sub: 'Modern, technisch, aufgeräumt.',
    headFont: 'Space Grotesk', subFont: 'DM Sans', kickerFont: 'DM Sans', headStyle: 'bold',
    light: { head: '#0B1F3A', sub: '#5B6B7B', kicker: '#2563EB' }, dark: { head: '#E0F2FE', sub: '#93A4B5', kicker: '#38BDF8' } },
  { id: 'klassisch', label: 'Klassisch', kicker: 'SEIT 1998', head: 'Klassisch & Zeitlos', sub: 'Traditionell, seriös, vertrauensvoll.',
    headFont: 'EB Garamond', subFont: 'EB Garamond', kickerFont: 'EB Garamond', headStyle: 'bold',
    light: { head: '#292524', sub: '#78716C', kicker: '#9A3412' }, dark: { head: '#FAFAF9', sub: '#D6D3D1', kicker: '#FDBA74' } },
  { id: 'statement', label: 'Statement', kicker: 'NEU', head: 'Statement Serif', sub: 'Auffällig und stilsicher zugleich.',
    headFont: 'DM Serif Display', subFont: 'DM Sans', kickerFont: 'DM Sans', headStyle: 'normal',
    light: { head: '#1E293B', sub: '#64748B', kicker: '#0D9488' }, dark: { head: '#F1F5F9', sub: '#CBD5E1', kicker: '#2DD4BF' } },
  { id: 'poster', label: 'Poster', kicker: 'EVENT', head: 'POSTER LOOK', sub: 'Condensed Headline mit ruhiger Subline.',
    headFont: 'Bebas Neue', subFont: 'Inter', kickerFont: 'Inter', headStyle: 'normal',
    light: { head: '#111827', sub: '#6B7280', kicker: '#DC2626' }, dark: { head: '#F9FAFB', sub: '#D1D5DB', kicker: '#F87171' } },
]

function isDarkBg(bg) {
  if (!bg || typeof bg !== 'string') return false
  const t = bg.trim().replace('#', '')
  let r, g, b
  if (/^[0-9a-f]{6}$/i.test(t)) { r = parseInt(t.slice(0, 2), 16); g = parseInt(t.slice(2, 4), 16); b = parseInt(t.slice(4, 6), 16) }
  else if (/^[0-9a-f]{3}$/i.test(t)) { r = parseInt(t[0] + t[0], 16); g = parseInt(t[1] + t[1], 16); b = parseInt(t[2] + t[2], 16) }
  else { const m = bg.match(/\d+(\.\d+)?/g); if (!m || m.length < 3) return false; r = +m[0]; g = +m[1]; b = +m[2] }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45
}

function rectsIntersect(a, b) {
  return !(a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y)
}

// Fill-Props für Konva: Verlauf (o.fillGrad) → lineare Gradient-Props, sonst solide
// Farbe. w/h = Objektmaße; centered=true für Ellipse (lokale Koords um 0).
function fillKonvaProps(o, w, h, centered) {
  const g = o.fillGrad
  if (g && Array.isArray(g.stops) && g.stops.length >= 2) {
    const a = ((g.angle || 0) * Math.PI) / 180
    const cx = centered ? 0 : w / 2, cy = centered ? 0 : h / 2
    const len = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) || Math.max(w, h)
    const hx = Math.cos(a) * len / 2, hy = Math.sin(a) * len / 2
    const stops = []
    g.stops.forEach(st => { stops.push(st[0], st[1]) })
    return { fillPriority: 'linear-gradient', fillLinearGradientStartPoint: { x: cx - hx, y: cy - hy }, fillLinearGradientEndPoint: { x: cx + hx, y: cy + hy }, fillLinearGradientColorStops: stops, fill: undefined }
  }
  return { fillPriority: 'color', fill: o.fill, fillLinearGradientColorStops: undefined }
}

// Pinsel-Typen fürs Zeichnen. Jeder Strich = Konva-Linie mit diesen Eigenschaften.
const BRUSHES = [
  { id: 'pen',      label: 'Stift',     Icon: Pen,         width: 5,  cap: 'round', tension: 0.4, opacity: 1,    gco: 'source-over' },
  { id: 'pencil',   label: 'Bleistift', Icon: Pencil,      width: 2,  cap: 'round', tension: 0.1, opacity: 0.85, gco: 'source-over' },
  { id: 'marker',   label: 'Marker',    Icon: Highlighter, width: 22, cap: 'round', tension: 0.4, opacity: 0.35, gco: 'multiply' },
  { id: 'brush',    label: 'Pinsel',    Icon: Brush,       width: 14, cap: 'round', tension: 0.6, opacity: 1,    gco: 'source-over' },
  { id: 'fountain', label: 'Füller',    Icon: PenTool,     width: 7,  cap: 'round', tension: 0.5, opacity: 1,    gco: 'source-over' },
  { id: 'eraser',   label: 'Radierer',  Icon: Eraser,      width: 20, cap: 'round', tension: 0,   opacity: 1,    gco: 'source-over', eraser: true },
]
const brushById = (id) => BRUSHES.find(b => b.id === id) || BRUSHES[0]
// Akzentfarbe für den "Verzerren"-Modus (nach Doppelklick): klar abgesetzt von der
// primären Auswahl-Farbe, damit der freie Transform-Modus sofort erkennbar ist.
const DISTORT_RGB = 'rgb(245,158,11)'

// ─── Bildfilter (Canva-Stil) ────────────────────────────────────────────────
// Vollständiger Satz neutraler Default-Werte. Wird an allen Lade-/Reset-Stellen
// gespreadet, damit ältere Designs ohne neue Felder sauber hydrieren.
const EMPTY_FILTERS = {
  brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0,
  warmth: 0, tint: 0, enhance: 0, noise: 0, pixelate: 0,
  grayscale: 0, sepia: 0, invert: 0, vignette: 0,
}
const _clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)
// Custom-Konva-Filter — lesen ihre Stärke aus Node-Attributen (in der Apply-Logik gesetzt).
function WarmthFilter(imageData) {
  const amt = this.getAttr('fWarmth') || 0
  if (!amt) return
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) { d[i] = _clamp255(d[i] + amt); d[i + 2] = _clamp255(d[i + 2] - amt) }
}
function TintFilter(imageData) {
  const amt = this.getAttr('fTint') || 0
  if (!amt) return
  const d = imageData.data
  // positiv → grün, negativ → magenta
  for (let i = 0; i < d.length; i += 4) { d[i + 1] = _clamp255(d[i + 1] + amt) }
}
function SepiaFilter(imageData) {
  if (!this.getAttr('fSepia')) return
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    d[i] = _clamp255(0.393 * r + 0.769 * g + 0.189 * b)
    d[i + 1] = _clamp255(0.349 * r + 0.686 * g + 0.168 * b)
    d[i + 2] = _clamp255(0.272 * r + 0.534 * g + 0.131 * b)
  }
}
function VignetteFilter(imageData) {
  const amt = this.getAttr('fVignette') || 0
  if (!amt) return
  const w = imageData.width, h = imageData.height, d = imageData.data
  const cx = w / 2, cy = h / 2, maxD = Math.sqrt(cx * cx + cy * cy)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD
      const f = 1 - amt * Math.max(0, (dist - 0.45) * 1.8)
      if (f >= 1) continue
      const i = (y * w + x) * 4
      d[i] *= f; d[i + 1] *= f; d[i + 2] *= f
    }
  }
}
// Ein-Klick-Looks (setzen mehrere Werte gleichzeitig).
const FILTER_PRESETS = [
  { id: 'original', label: 'Original', f: {} },
  { id: 'vivid',    label: 'Lebendig', f: { saturation: 1.1, contrast: 16, enhance: 0.3 } },
  { id: 'warm',     label: 'Warm',     f: { warmth: 28, saturation: 0.4 } },
  { id: 'cool',     label: 'Kühl',     f: { warmth: -26, saturation: 0.2 } },
  { id: 'matt',     label: 'Matt',     f: { contrast: -18, brightness: 0.06, saturation: -0.4 } },
  { id: 'vintage',  label: 'Vintage',  f: { sepia: 1, contrast: -6, vignette: 0.4, saturation: -0.3 } },
  { id: 'sw',       label: 'S/W',      f: { grayscale: 1, contrast: 12 } },
  { id: 'sepia',    label: 'Sepia',    f: { sepia: 1 } },
]

// Gängige Web-Fonts (inkl. der bereits genutzten Inter/Georgia/Caveat).
const FONTS = [
  'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
  'Courier New', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Caveat',
  'Impact', 'Palatino', 'Garamond', 'Lucida Sans', 'Comic Sans MS', 'Brush Script MT',
]

// ─── Text-Effekte (Stage 3) → Konva-Schatten/Stroke-Props ───────────────────
// effect: 'none' | 'shadow' | 'glow' | 'lift' | 'neon'
const TEXT_EFFECTS = [
  { id: 'none',    label: 'Keiner',     css: {} },
  { id: 'shadow',  label: 'Schatten',   css: { textShadow: '2px 3px 4px rgba(0,0,0,0.55)' } },
  { id: 'lift',    label: 'Lift',       css: { textShadow: '0 7px 9px rgba(0,0,0,0.32)' } },
  { id: 'hollow',  label: 'Hohl',       css: { color: 'transparent', WebkitTextStroke: '1.5px #111827' } },
  { id: 'outline', label: 'Umriss',     css: { WebkitTextStroke: '1px #111827' } },
  { id: 'echo',    label: 'Echo',       css: { textShadow: '4px 4px 0 rgba(17,24,39,0.32), 8px 8px 0 rgba(17,24,39,0.16)' } },
  { id: 'glow',    label: 'Glühen',     css: { textShadow: '0 0 9px rgba(49,90,231,0.9)' } },
  { id: 'neon',    label: 'Neon',       css: { color: '#39FF14', textShadow: '0 0 8px #39FF14, 0 0 14px #39FF14' } },
]
function textEffectProps(o) {
  const fs = o.fontSize || 44
  const eff = o.effect || 'none'
  if (eff === 'shadow') {
    return { shadowColor: 'rgba(0,0,0,0.55)', shadowBlur: Math.round(fs * 0.12), shadowOffsetX: Math.round(fs * 0.05), shadowOffsetY: Math.round(fs * 0.08), shadowOpacity: 1 }
  }
  if (eff === 'lift') {
    // weicher, mittiger Schatten nach unten (Objekt "schwebt").
    return { shadowColor: 'rgba(0,0,0,0.35)', shadowBlur: Math.round(fs * 0.45), shadowOffsetX: 0, shadowOffsetY: Math.round(fs * 0.18), shadowOpacity: 0.7 }
  }
  if (eff === 'glow') {
    // Schein in Textfarbe, kein Versatz.
    return { shadowColor: o.fill || '#ffffff', shadowBlur: Math.round(fs * 0.5), shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 0.95 }
  }
  if (eff === 'neon') {
    // heller Schein + farbige Kontur.
    return { shadowColor: o.fill || '#39FF14', shadowBlur: Math.round(fs * 0.7), shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 1,
      stroke: o.fill || '#39FF14', strokeWidth: Math.max(1, Math.round(fs * 0.03)) }
  }
  if (eff === 'hollow') {
    // Hohle Buchstaben: transparente Füllung + Kontur in Textfarbe.
    return { fill: 'transparent', stroke: o.fill || '#111827', strokeWidth: Math.max(1.2, Math.round(fs * 0.035)), fillAfterStrokeEnabled: true, shadowOpacity: 0 }
  }
  if (eff === 'outline') {
    // Gefüllte Buchstaben mit dunkler Kontur (Füllung liegt über der Kontur).
    return { stroke: '#111827', strokeWidth: Math.max(1, Math.round(fs * 0.03)), fillAfterStrokeEnabled: true, shadowOpacity: 0 }
  }
  if (eff === 'echo') {
    // versetzte „Echo"-Kopie über einen harten Schatten in Textfarbe.
    return { shadowColor: o.fill || '#111827', shadowBlur: 0, shadowOffsetX: Math.round(fs * 0.14), shadowOffsetY: Math.round(fs * 0.14), shadowOpacity: 0.32 }
  }
  return { shadowBlur: 0, shadowOpacity: 0, stroke: undefined, strokeWidth: 0 }
}

const HEAL_PROMPT = 'Entferne den Inhalt im markierten Bereich vollständig und fülle ihn natürlich und nahtlos passend zum Umfeld auf. Keine Artefakte, keine Kanten, fotorealistisch und stilistisch konsistent mit dem Rest des Bildes.'


let _uid = 0
// ─── Bilderrahmen (Frames): Formen zum Maskieren/Cover-Füllen von Bildern ─────
// Wie Canva „Rahmen": eine Form, in die ein Bild eingesetzt und cover-gefüllt wird.
// Collagen (Raster) und Mockups bauen auf demselben Primitiv auf.
const _fpoly = (n, rot = -90) => { const a = []; for (let i = 0; i < n; i++) { const t = (rot + i * 360 / n) * Math.PI / 180; a.push([50 + 50 * Math.cos(t), 50 + 50 * Math.sin(t)]) } return a }
const _fstar = (n = 5, rot = -90, inner = 0.45) => { const a = []; for (let i = 0; i < 2 * n; i++) { const r = (i % 2 ? 50 * inner : 50); const t = (rot + i * 180 / n) * Math.PI / 180; a.push([50 + r * Math.cos(t), 50 + r * Math.sin(t)]) } return a }
const _fsvg = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ') + ' Z'
const _fclipPts = (ctx, w, h, pts) => { ctx.beginPath(); pts.forEach((p, i) => { const x = p[0] / 100 * w, y = p[1] / 100 * h; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }); ctx.closePath() }
const _froundClip = (ctx, w, h, rr) => { const r = Math.min(rr, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.arcTo(w, 0, w, r, r); ctx.lineTo(w, h - r); ctx.arcTo(w, h, w - r, h, r); ctx.lineTo(r, h); ctx.arcTo(0, h, 0, h - r, r); ctx.lineTo(0, r); ctx.arcTo(0, 0, r, 0, r); ctx.closePath() }
const _fbez = (ctx, w, h, cmds) => { const X = v => v / 100 * w, Y = v => v / 100 * h; ctx.beginPath(); ctx.moveTo(X(cmds[0][0]), Y(cmds[0][1])); for (let i = 1; i < cmds.length; i++) { const p = cmds[i]; ctx.bezierCurveTo(X(p[0]), Y(p[1]), X(p[2]), Y(p[3]), X(p[4]), Y(p[5])) } ctx.closePath() }
const _HEART = [[50, 88], [8, 58, 0, 30, 22, 16], [40, 4, 50, 22, 50, 30], [50, 22, 60, 4, 78, 16], [100, 30, 92, 58, 50, 88]]
const _BLOB = [[50, 5], [74, 1, 97, 22, 94, 47], [91, 72, 74, 97, 48, 94], [23, 91, 4, 71, 8, 46], [12, 22, 27, 9, 50, 5]]
const FRAME_SHAPES = [
  { id: 'rect',    label: 'Rechteck',   svg: 'M1 1 H99 V99 H1 Z', clip: (c, w, h) => { c.beginPath(); c.rect(0, 0, w, h); c.closePath() } },
  { id: 'rounded', label: 'Abgerundet', svg: 'M16 1 H84 A15 15 0 0 1 99 16 V84 A15 15 0 0 1 84 99 H16 A15 15 0 0 1 1 84 V16 A15 15 0 0 1 16 1 Z', clip: (c, w, h) => _froundClip(c, w, h, Math.min(w, h) * 0.15) },
  { id: 'circle',  label: 'Kreis',      svg: 'M50 1 A49 49 0 1 0 50 99 A49 49 0 1 0 50 1 Z', clip: (c, w, h) => { c.beginPath(); c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI); c.closePath() } },
  { id: 'triangle', label: 'Dreieck',   pts: [[50, 0], [100, 100], [0, 100]] },
  { id: 'diamond', label: 'Raute',      pts: [[50, 0], [100, 50], [50, 100], [0, 50]] },
  { id: 'pentagon', label: 'Fünfeck',   pts: _fpoly(5) },
  { id: 'hexagon', label: 'Sechseck',   pts: _fpoly(6, 0) },
  { id: 'hexagon2', label: 'Sechseck 2', pts: _fpoly(6, -90) },
  { id: 'octagon', label: 'Achteck',    pts: _fpoly(8, -22.5) },
  { id: 'star',    label: 'Stern',      pts: _fstar(5) },
  { id: 'star6',   label: 'Stern 6',    pts: _fstar(6) },
  { id: 'heart',   label: 'Herz',       svg: 'M50 88 C 8 58 0 30 22 16 C 40 4 50 22 50 30 C 50 22 60 4 78 16 C 100 30 92 58 50 88 Z', clip: (c, w, h) => _fbez(c, w, h, _HEART) },
  { id: 'blob',    label: 'Blob',       svg: 'M50 5 C 74 1 97 22 94 47 C 91 72 74 97 48 94 C 23 91 4 71 8 46 C 12 22 27 9 50 5 Z', clip: (c, w, h) => _fbez(c, w, h, _BLOB) },
  { id: 'arch',    label: 'Bogen',      svg: 'M0 100 L0 50 A50 50 0 0 1 100 50 L100 100 Z', clip: (c, w, h) => { const r = w / 2; c.beginPath(); c.moveTo(0, h); c.lineTo(0, r); c.arc(w / 2, r, r, Math.PI, 0, false); c.lineTo(w, h); c.closePath() } },
]
FRAME_SHAPES.forEach(s => { if (s.pts) { s.svg = _fsvg(s.pts); s.clip = (c, w, h) => _fclipPts(c, w, h, s.pts) } })
const frameShapeById = id => FRAME_SHAPES.find(s => s.id === id) || FRAME_SHAPES[0]
// Cover-Fit: Bild füllt die Rahmen-Box komplett (kein Verzerren), zentriert.
function frameCoverFit(imgW, imgH, W, H, panX, panY) {
  const s = Math.max(W / (imgW || 1), H / (imgH || 1))
  const w = (imgW || 1) * s, h = (imgH || 1) * s
  const px = panX == null ? 0.5 : panX, py = panY == null ? 0.5 : panY
  return { x: (W - w) * px, y: (H - h) * py, width: w, height: h }
}

// ─── Collagen: Preset-Raster, die mehrere Rahmen (frames) platzieren ─────────
// cells = [x, y, w, h] als Anteil (0..1) der Collage-Box. Jede Zelle wird ein Frame.
const T = 1 / 3
const COLLAGE_LAYOUTS = [
  { id: '2h',    label: '2 nebeneinander', cells: [[0, 0, .5, 1], [.5, 0, .5, 1]] },
  { id: '2v',    label: '2 gestapelt',     cells: [[0, 0, 1, .5], [0, .5, 1, .5]] },
  { id: '3h',    label: '3 Spalten',       cells: [[0, 0, T, 1], [T, 0, T, 1], [2 * T, 0, T, 1]] },
  { id: '3v',    label: '3 Zeilen',        cells: [[0, 0, 1, T], [0, T, 1, T], [0, 2 * T, 1, T]] },
  { id: '3lbig', label: '1 groß + 2',      cells: [[0, 0, .6, 1], [.6, 0, .4, .5], [.6, .5, .4, .5]] },
  { id: '3tbig', label: '1 oben + 2',      cells: [[0, 0, 1, .6], [0, .6, .5, .4], [.5, .6, .5, .4]] },
  { id: '3rbig', label: '2 + 1 groß',      cells: [[0, 0, .4, .5], [0, .5, .4, .5], [.4, 0, .6, 1]] },
  { id: '4grid', label: '2 × 2',           cells: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]] },
  { id: '4h',    label: '4 Spalten',       cells: [[0, 0, .25, 1], [.25, 0, .25, 1], [.5, 0, .25, 1], [.75, 0, .25, 1]] },
  { id: '4lbig', label: '1 groß + 3',      cells: [[0, 0, .55, 1], [.55, 0, .45, T], [.55, T, .45, T], [.55, 2 * T, .45, T]] },
  { id: '4tbig', label: '1 oben + 3',      cells: [[0, 0, 1, .58], [0, .58, T, .42], [T, .58, T, .42], [2 * T, .58, T, .42]] },
  { id: '5mix',  label: '5er Mix',         cells: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, T, .5], [T, .5, T, .5], [2 * T, .5, T, .5]] },
  { id: '6grid', label: '3 × 2',           cells: [[0, 0, T, .5], [T, 0, T, .5], [2 * T, 0, T, .5], [0, .5, T, .5], [T, .5, T, .5], [2 * T, .5, T, .5]] },
  { id: '6h',    label: '6 Streifen',      cells: [[0, 0, 1, 1 / 6], [0, 1 / 6, 1, 1 / 6], [0, 2 / 6, 1, 1 / 6], [0, 3 / 6, 1, 1 / 6], [0, 4 / 6, 1, 1 / 6], [0, 5 / 6, 1, 1 / 6]] },
]

// ─── Mockups: Geräte-/Rahmen-Hülle um einen Bild-Screen (nutzt Frame-Prinzip) ─
// Jede Vorlage: aspect (Default-Seitenverhältnis), screen(w,h) → Screen-Rechteck,
// behind(w,h)/front(w,h) → Konva-Deko (Body/Bezel/Notch). Bild füllt den Screen (cover).
const _rectClipLocal = (ctx, w, h) => { ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.closePath() }

// ─── Perspektiv-Warp-Engine (Homographie + affines Dreiecks-Textur-Mapping) ──
// Konva kann nur affin transformieren. Für angewinkelte Mockups (Screen = belie-
// biges Viereck) rendern wir das Bild per Homographie in ein Offscreen-Canvas und
// zeigen dieses als Konva.Image. Ansatz: Einheitsquadrat→Quad-Homographie, feines
// Gitter, je Zelle zwei affin texturierte Dreiecke (perspektivisch korrekt).
function _homoUnitToQuad(q) {
  const x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y, x2 = q[2].x, y2 = q[2].y, x3 = q[3].x, y3 = q[3].y
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  let a, b, c, d, e, f, g, h
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h = 0
  } else {
    const den = dx1 * dy2 - dx2 * dy1
    g = (dx3 * dy2 - dx2 * dy3) / den
    h = (dx1 * dy3 - dx3 * dy1) / den
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0
  }
  return { a, b, c, d, e, f, g, h }
}
function _applyHomo(m, u, v) {
  const den = m.g * u + m.h * v + 1
  return { x: (m.a * u + m.b * v + m.c) / den, y: (m.d * u + m.e * v + m.f) / den }
}
// Affine Koeffizienten, die Quell-Dreieck s[] → Ziel-Dreieck d[] abbilden.
function _affineFromTri(s, d) {
  const s0 = s[0], s1 = s[1], s2 = s[2]
  const det = s0.x * (s1.y - s2.y) - s0.y * (s1.x - s2.x) + (s1.x * s2.y - s2.x * s1.y)
  if (Math.abs(det) < 1e-9) return null
  const i = 1 / det
  const m00 = (s1.y - s2.y) * i, m01 = (s2.y - s0.y) * i, m02 = (s0.y - s1.y) * i
  const m10 = (s2.x - s1.x) * i, m11 = (s0.x - s2.x) * i, m12 = (s1.x - s0.x) * i
  const m20 = (s1.x * s2.y - s2.x * s1.y) * i, m21 = (s2.x * s0.y - s0.x * s2.y) * i, m22 = (s0.x * s1.y - s1.x * s0.y) * i
  const a = m00 * d[0].x + m01 * d[1].x + m02 * d[2].x
  const b = m10 * d[0].x + m11 * d[1].x + m12 * d[2].x
  const c = m20 * d[0].x + m21 * d[1].x + m22 * d[2].x
  const dd = m00 * d[0].y + m01 * d[1].y + m02 * d[2].y
  const e = m10 * d[0].y + m11 * d[1].y + m12 * d[2].y
  const ff = m20 * d[0].y + m21 * d[1].y + m22 * d[2].y
  return { a, b, c, d: dd, e, f: ff }
}
function _drawTexTri(ctx, src, s, d) {
  const m = _affineFromTri(s, d)
  if (!m) return
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(d[0].x, d[0].y); ctx.lineTo(d[1].x, d[1].y); ctx.lineTo(d[2].x, d[2].y); ctx.closePath()
  ctx.clip()
  ctx.setTransform(m.a, m.d, m.b, m.e, m.c, m.f)
  ctx.drawImage(src, 0, 0)
  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
// Bild → Offscreen-Canvas (outW×outH·ss), perspektivisch in quad gemappt (cover, pan).
function warpImageToCanvas(img, quad, outW, outH, opts = {}) {
  const ss = opts.ss || 1
  const N = opts.grid || 14
  const cw = Math.max(1, Math.round(outW * ss)), ch = Math.max(1, Math.round(outH * ss))
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
  const ctx = cv.getContext('2d')
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  const q = quad.map(p => ({ x: p.x * ss, y: p.y * ss }))
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height
  if (!iw || !ih) return cv
  const wq = (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y)) / 2
  const hq = (Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) + Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y)) / 2
  const targetAsp = wq / Math.max(1e-6, hq)
  const panX = opts.panX == null ? 0.5 : opts.panX, panY = opts.panY == null ? 0.5 : opts.panY
  let cropW = iw, cropH = ih, cropX = 0, cropY = 0
  if (iw / ih > targetAsp) { cropW = Math.round(ih * targetAsp); cropX = Math.round((iw - cropW) * panX) }
  else { cropH = Math.round(iw / targetAsp); cropY = Math.round((ih - cropH) * panY) }
  // Quelle einmal auf den Crop zuschneiden → günstigere, saubere Quell-Koordinaten.
  const sc = document.createElement('canvas'); sc.width = Math.max(1, cropW); sc.height = Math.max(1, cropH)
  sc.getContext('2d').drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  const H = _homoUnitToQuad(q)
  const srcP = (u, v) => ({ x: u * cropW, y: v * cropH })
  for (let ix = 0; ix < N; ix++) {
    for (let iy = 0; iy < N; iy++) {
      const u0 = ix / N, u1 = (ix + 1) / N, v0 = iy / N, v1 = (iy + 1) / N
      const D00 = _applyHomo(H, u0, v0), D10 = _applyHomo(H, u1, v0), D11 = _applyHomo(H, u1, v1), D01 = _applyHomo(H, u0, v1)
      const S00 = srcP(u0, v0), S10 = srcP(u1, v0), S11 = srcP(u1, v1), S01 = srcP(u0, v1)
      _drawTexTri(ctx, sc, [S00, S10, S11], [D00, D10, D11])
      _drawTexTri(ctx, sc, [S00, S11, S01], [D00, D11, D01])
    }
  }
  return cv
}
const DEVICE_MOCKUPS = [
  {
    id: 'browser', label: 'Browser', aspect: 1.5,
    screen: (w, h) => { const tb = Math.round(h * 0.12), p = Math.max(2, Math.round(w * 0.014)); return { x: p, y: tb, w: w - 2 * p, h: h - tb - p, r: 0 } },
    behind: (w, h) => { const tb = Math.round(h * 0.12), r = Math.max(6, Math.round(w * 0.012)), dot = Math.max(3, Math.round(h * 0.02)); return [
      <Rect key="body" width={w} height={h} fill="#FFFFFF" cornerRadius={r} stroke="#E2E8F0" strokeWidth={1} />,
      <Rect key="bar" width={w} height={tb} fill="#F1F5F9" cornerRadius={[r, r, 0, 0]} />,
      <Circle key="d1" x={tb * 0.65} y={tb / 2} radius={dot} fill="#FF5F57" />,
      <Circle key="d2" x={tb * 0.65 + dot * 3} y={tb / 2} radius={dot} fill="#FEBC2E" />,
      <Circle key="d3" x={tb * 0.65 + dot * 6} y={tb / 2} radius={dot} fill="#28C840" />,
      <Rect key="addr" x={tb * 1.5} y={tb * 0.28} width={w * 0.55} height={tb * 0.44} cornerRadius={tb * 0.22} fill="#FFFFFF" stroke="#E2E8F0" strokeWidth={1} />,
    ] },
  },
  {
    id: 'phone', label: 'Smartphone', aspect: 0.5,
    screen: (w, h) => { const bez = Math.round(w * 0.05); return { x: bez, y: bez, w: w - 2 * bez, h: h - 2 * bez, r: Math.round(w * 0.1) } },
    behind: (w, h) => [<Rect key="body" width={w} height={h} fill="#0B0B0F" cornerRadius={Math.round(w * 0.16)} />],
    front: (w, h) => { const nw = w * 0.34, bez = Math.round(w * 0.05), nh = Math.max(4, h * 0.02); return [<Rect key="notch" x={(w - nw) / 2} y={bez + nh * 0.4} width={nw} height={nh * 1.6} cornerRadius={nh} fill="#0B0B0F" />] },
  },
  {
    id: 'laptop', label: 'Laptop', aspect: 1.5,
    screen: (w, h) => { const p = Math.round(w * 0.03), sh = h * 0.86; return { x: p, y: p, w: w - 2 * p, h: sh - 2 * p, r: Math.max(2, Math.round(w * 0.006)) } },
    behind: (w, h) => { const sh = h * 0.86, r = Math.max(6, Math.round(w * 0.01)); return [
      <Rect key="scr" width={w} height={sh} fill="#0B0B0F" cornerRadius={r} />,
      <Line key="base" points={[w * 0.04, sh, w * 0.96, sh, w, h, 0, h]} closed fill="#C7CDD4" />,
      <Rect key="notch" x={w * 0.44} y={sh} width={w * 0.12} height={h * 0.03} fill="#AEB6BF" cornerRadius={[0, 0, 4, 4]} />,
    ] },
  },
  {
    id: 'polaroid', label: 'Fotorahmen', aspect: 0.84,
    screen: (w, h) => { const p = Math.round(w * 0.06), s = w - 2 * p; return { x: p, y: p, w: s, h: s, r: 0 } },
    behind: (w, h) => [<Rect key="paper" width={w} height={h} fill="#FFFFFF" cornerRadius={4} shadowColor="#0f172a" shadowBlur={14} shadowOpacity={0.16} shadowOffsetY={5} />],
  },
  {
    id: 'tablet', label: 'Tablet', aspect: 0.75,
    screen: (w, h) => { const bez = Math.round(w * 0.055); return { x: bez, y: bez, w: w - 2 * bez, h: h - 2 * bez, r: Math.round(w * 0.03) } },
    behind: (w, h) => [<Rect key="body" width={w} height={h} fill="#0B0B0F" cornerRadius={Math.round(w * 0.06)} />],
  },
  {
    id: 'tablet_ls', label: 'Tablet quer', aspect: 1.33,
    screen: (w, h) => { const bez = Math.round(h * 0.055); return { x: bez, y: bez, w: w - 2 * bez, h: h - 2 * bez, r: Math.round(h * 0.03) } },
    behind: (w, h) => [<Rect key="body" width={w} height={h} fill="#0B0B0F" cornerRadius={Math.round(h * 0.06)} />],
  },
  {
    id: 'monitor', label: 'Monitor', aspect: 1.55,
    screen: (w, h) => { const p = Math.round(w * 0.02), sh = h * 0.8; return { x: p, y: p, w: w - 2 * p, h: sh - 2 * p, r: Math.max(2, Math.round(w * 0.004)) } },
    behind: (w, h) => { const sh = h * 0.8, r = Math.max(6, Math.round(w * 0.012)); return [
      <Rect key="scr" width={w} height={sh} fill="#0B0B0F" cornerRadius={r} />,
      <Rect key="neck" x={w * 0.45} y={sh} width={w * 0.1} height={h * 0.12} fill="#C7CDD4" />,
      <Rect key="base" x={w * 0.32} y={h * 0.92} width={w * 0.36} height={h * 0.05} cornerRadius={6} fill="#AEB6BF" />,
    ] },
  },
  {
    id: 'tv', label: 'TV', aspect: 1.78,
    screen: (w, h) => { const p = Math.round(w * 0.012), sh = h * 0.9; return { x: p, y: p, w: w - 2 * p, h: sh - 2 * p, r: 2 } },
    behind: (w, h) => { const sh = h * 0.9; return [
      <Rect key="scr" width={w} height={sh} fill="#0B0B0F" cornerRadius={4} />,
      <Rect key="stand" x={w * 0.44} y={sh} width={w * 0.12} height={h * 0.05} fill="#AEB6BF" />,
      <Line key="feet" points={[w * 0.3, h, w * 0.7, h]} stroke="#AEB6BF" strokeWidth={Math.max(3, h * 0.02)} lineCap="round" />,
    ] },
  },
  {
    id: 'watch', label: 'Smartwatch', aspect: 0.82,
    screen: (w, h) => { const bx = Math.round(w * 0.14), by = Math.round(h * 0.2); return { x: bx, y: by, w: w - 2 * bx, h: h - 2 * by, r: Math.round(w * 0.16) } },
    behind: (w, h) => { const bw = w * 0.34; return [
      <Rect key="bandT" x={(w - bw) / 2} y={0} width={bw} height={h * 0.24} fill="#334155" cornerRadius={6} />,
      <Rect key="bandB" x={(w - bw) / 2} y={h * 0.76} width={bw} height={h * 0.24} fill="#334155" cornerRadius={6} />,
      <Rect key="body" x={w * 0.08} y={h * 0.16} width={w * 0.84} height={h * 0.68} fill="#0B0B0F" cornerRadius={Math.round(w * 0.2)} />,
      <Rect key="crown" x={w * 0.93} y={h * 0.42} width={w * 0.05} height={h * 0.16} fill="#C7CDD4" cornerRadius={3} />,
    ] },
  },
  {
    id: 'ig_post', label: 'Instagram', aspect: 0.6,
    screen: (w, h) => { const bez = Math.round(w * 0.045), top = bez + h * 0.1, sq = w - 2 * bez; return { x: bez, y: top, w: sq, h: sq, r: 0 } },
    behind: (w, h) => { const bez = Math.round(w * 0.045), r = Math.round(w * 0.11); return [
      <Rect key="body" width={w} height={h} fill="#FFFFFF" cornerRadius={r} stroke="#0B0B0F" strokeWidth={Math.max(2, w * 0.02)} />,
      <Circle key="av" x={bez + h * 0.045} y={bez + h * 0.05} radius={h * 0.028} fill="#CBD5E1" />,
      <Rect key="name" x={bez + h * 0.09} y={bez + h * 0.038} width={w * 0.4} height={h * 0.022} cornerRadius={3} fill="#CBD5E1" />,
    ] },
    front: (w, h) => { const bez = Math.round(w * 0.045), top = bez + h * 0.1, sq = w - 2 * bez, ay = top + sq + h * 0.035; return [
      <Circle key="like" x={bez + h * 0.03} y={ay} radius={h * 0.022} fill="none" stroke="#0B0B0F" strokeWidth={2} />,
      <Circle key="cmt" x={bez + h * 0.1} y={ay} radius={h * 0.022} fill="none" stroke="#0B0B0F" strokeWidth={2} />,
      <Circle key="share" x={bez + h * 0.17} y={ay} radius={h * 0.022} fill="none" stroke="#0B0B0F" strokeWidth={2} />,
    ] },
  },
  {
    id: 'ig_story', label: 'Story', aspect: 0.5,
    screen: (w, h) => { const bez = Math.round(w * 0.05); return { x: bez, y: bez, w: w - 2 * bez, h: h - 2 * bez, r: Math.round(w * 0.1) } },
    behind: (w, h) => [<Rect key="body" width={w} height={h} fill="#0B0B0F" cornerRadius={Math.round(w * 0.16)} />],
    front: (w, h) => { const bez = Math.round(w * 0.05); return [
      <Rect key="prog" x={bez + w * 0.06} y={bez + h * 0.02} width={w - 2 * bez - w * 0.12} height={Math.max(2, h * 0.006)} cornerRadius={2} fill="rgba(255,255,255,0.75)" />,
    ] },
  },
  {
    id: 'poster', label: 'Poster', aspect: 0.7,
    screen: (w, h) => { const p = Math.round(w * 0.03); return { x: p, y: p, w: w - 2 * p, h: h - 2 * p, r: 0 } },
    behind: (w, h) => [<Rect key="frame" width={w} height={h} fill="#111827" shadowColor="#0f172a" shadowBlur={18} shadowOpacity={0.22} shadowOffsetY={8} />],
  },
  {
    id: 'billboard', label: 'Plakatwand', aspect: 1.9,
    screen: (w, h) => { const p = Math.round(w * 0.015), bh = h * 0.72; return { x: p, y: p, w: w - 2 * p, h: bh - 2 * p, r: 0 } },
    behind: (w, h) => { const bh = h * 0.72; return [
      <Rect key="board" width={w} height={bh} fill="#FFFFFF" stroke="#94A3B8" strokeWidth={Math.max(2, w * 0.008)} />,
      <Rect key="p1" x={w * 0.2} y={bh} width={w * 0.03} height={h - bh} fill="#94A3B8" />,
      <Rect key="p2" x={w * 0.77} y={bh} width={w * 0.03} height={h - bh} fill="#94A3B8" />,
    ] },
  },
  {
    id: 'card', label: 'Visitenkarte', aspect: 1.72,
    screen: (w, h) => ({ x: 0, y: 0, w, h, r: Math.round(w * 0.03) }),
    behind: (w, h) => [<Rect key="sh" width={w} height={h} cornerRadius={Math.round(w * 0.03)} fill="#fff" shadowColor="#0f172a" shadowBlur={16} shadowOpacity={0.18} shadowOffsetY={6} />],
  },
  {
    id: 'book', label: 'Buchcover', aspect: 0.68,
    screen: (w, h) => { const sp = Math.round(w * 0.06); return { x: sp, y: 0, w: w - sp, h, r: 0 } },
    behind: (w, h) => [<Rect key="sh" width={w} height={h} fill="#fff" cornerRadius={[2, 6, 6, 2]} shadowColor="#0f172a" shadowBlur={16} shadowOpacity={0.2} shadowOffsetX={6} shadowOffsetY={6} />],
    front: (w, h) => { const sp = Math.round(w * 0.06); return [<Rect key="spine" x={sp} y={0} width={Math.max(3, w * 0.015)} height={h} fill="rgba(0,0,0,0.12)" />] },
  },
  {
    id: 'frame_wall', label: 'Wandrahmen', aspect: 0.8,
    screen: (w, h) => { const fr = Math.round(w * 0.08); return { x: fr, y: fr, w: w - 2 * fr, h: h - 2 * fr, r: 0 } },
    behind: (w, h) => { const fr = Math.round(w * 0.08); return [
      <Rect key="fr" width={w} height={h} fill="#3f3f46" shadowColor="#0f172a" shadowBlur={16} shadowOpacity={0.22} shadowOffsetY={7} />,
      <Rect key="mat" x={fr * 0.5} y={fr * 0.5} width={w - fr} height={h - fr} fill="#FFFFFF" />,
    ] },
  },
  {
    id: 'tshirt', label: 'T-Shirt', aspect: 0.95,
    screen: (w, h) => ({ x: w * 0.32, y: h * 0.3, w: w * 0.36, h: h * 0.42, r: 0 }),
    behind: (w, h) => [<Line key="shirt" closed fill="#EEF2F6" stroke="#CBD5E1" strokeWidth={2}
      points={[w * 0.28, h * 0.08, w * 0.4, h * 0.02, w * 0.6, h * 0.02, w * 0.72, h * 0.08, w * 0.9, h * 0.2, w * 0.8, h * 0.34, w * 0.7, h * 0.28, w * 0.7, h, w * 0.3, h, w * 0.3, h * 0.28, w * 0.2, h * 0.34, w * 0.1, h * 0.2]} />],
  },
  {
    id: 'mug', label: 'Tasse', aspect: 1.25,
    screen: (w, h) => ({ x: w * 0.14, y: h * 0.16, w: w * 0.5, h: h * 0.68, r: 0 }),
    behind: (w, h) => [
      <Circle key="handle" x={w * 0.68} y={h * 0.5} radius={h * 0.2} fill="none" stroke="#CBD5E1" strokeWidth={Math.max(6, w * 0.05)} />,
      <Rect key="body" x={w * 0.08} y={h * 0.08} width={w * 0.6} height={h * 0.84} cornerRadius={Math.round(w * 0.03)} fill="#FFFFFF" stroke="#CBD5E1" strokeWidth={2} />,
    ],
  },
  {
    id: 'tote', label: 'Tasche', aspect: 0.85,
    screen: (w, h) => ({ x: w * 0.2, y: h * 0.34, w: w * 0.6, h: h * 0.5, r: 0 }),
    behind: (w, h) => [
      <Line key="h1" points={[w * 0.32, h * 0.24, w * 0.36, h * 0.05, w * 0.46, h * 0.05, w * 0.48, h * 0.24]} stroke="#CBD5E1" strokeWidth={Math.max(4, w * 0.02)} fill="" lineCap="round" lineJoin="round" />,
      <Line key="h2" points={[w * 0.52, h * 0.24, w * 0.54, h * 0.05, w * 0.64, h * 0.05, w * 0.68, h * 0.24]} stroke="#CBD5E1" strokeWidth={Math.max(4, w * 0.02)} fill="" lineCap="round" lineJoin="round" />,
      <Rect key="bag" x={w * 0.14} y={h * 0.22} width={w * 0.72} height={h * 0.72} fill="#F4F1EA" stroke="#CBD5E1" strokeWidth={2} cornerRadius={4} />,
    ],
  },
  {
    id: 'sticker', label: 'Sticker', aspect: 1,
    screen: (w, h) => { const b = Math.round(w * 0.08); return { x: b, y: b, w: w - 2 * b, h: h - 2 * b, r: Math.round(w * 0.12) } },
    behind: (w, h) => [<Rect key="wh" width={w} height={h} cornerRadius={Math.round(w * 0.18)} fill="#FFFFFF" shadowColor="#0f172a" shadowBlur={14} shadowOpacity={0.18} shadowOffsetY={5} />],
  },
  {
    id: 'postcard', label: 'Postkarte', aspect: 1.48,
    screen: (w, h) => ({ x: 0, y: 0, w, h, r: Math.round(w * 0.02) }),
    behind: (w, h) => [<Rect key="sh" width={w} height={h} cornerRadius={Math.round(w * 0.02)} fill="#fff" shadowColor="#0f172a" shadowBlur={16} shadowOpacity={0.18} shadowOffsetY={6} />],
  },
  // ── Perspektivische Mockups (nutzen die Warp-Engine: screenQuad statt screen) ──
  {
    id: 'phone_persp', label: 'Phone 3D', aspect: 0.62,
    screenQuad: (w, h) => [{ x: w * 0.12, y: h * 0.09 }, { x: w * 0.76, y: h * 0.17 }, { x: w * 0.76, y: h * 0.83 }, { x: w * 0.12, y: h * 0.91 }],
    behind: (w, h) => [
      <Line key="body" closed fill="#0B0B0F"
        points={[w * 0.06, h * 0.02, w * 0.82, h * 0.12, w * 0.82, h * 0.88, w * 0.06, h * 0.98]}
        shadowColor="#0f172a" shadowBlur={20} shadowOpacity={0.28} shadowOffsetX={9} shadowOffsetY={11} />,
    ],
    front: (w, h) => [
      <Line key="notch" closed fill="#0B0B0F" points={[w * 0.34, h * 0.105, w * 0.54, h * 0.13, w * 0.54, h * 0.16, w * 0.34, h * 0.135]} />,
    ],
  },
  {
    id: 'laptop_persp', label: 'Laptop 3D', aspect: 1.4,
    screenQuad: (w, h) => [{ x: w * 0.2, y: h * 0.06 }, { x: w * 0.8, y: h * 0.06 }, { x: w * 0.86, y: h * 0.62 }, { x: w * 0.14, y: h * 0.62 }],
    behind: (w, h) => [
      <Line key="bezel" closed fill="#0B0B0F" points={[w * 0.18, h * 0.03, w * 0.82, h * 0.03, w * 0.885, h * 0.655, w * 0.115, h * 0.655]} />,
    ],
    front: (w, h) => [
      <Line key="deck" closed fill="#C7CDD4" stroke="#AEB6BF" strokeWidth={1} points={[w * 0.115, h * 0.655, w * 0.885, h * 0.655, w * 0.98, h * 0.9, w * 0.02, h * 0.9]} />,
      <Line key="hinge" points={[w * 0.115, h * 0.655, w * 0.885, h * 0.655]} stroke="#8b93a0" strokeWidth={Math.max(2, h * 0.01)} />,
      <Line key="tp" closed fill="#B7BEC7" points={[w * 0.42, h * 0.77, w * 0.58, h * 0.77, w * 0.6, h * 0.85, w * 0.4, h * 0.85]} />,
    ],
  },
  {
    id: 'card_persp', label: 'Karte 3D', aspect: 1.3,
    screenQuad: (w, h) => [{ x: w * 0.1, y: h * 0.18 }, { x: w * 0.9, y: h * 0.06 }, { x: w * 0.92, y: h * 0.82 }, { x: w * 0.08, y: h * 0.94 }],
    behind: (w, h) => [
      <Line key="sh" closed fill="#0f172a" opacity={0.16} points={[w * 0.14, h * 0.24, w * 0.94, h * 0.12, w * 0.96, h * 0.88, w * 0.12, h * 1.0]} />,
    ],
  },
  {
    id: 'ereader', label: 'E-Reader', aspect: 0.72,
    screen: (w, h) => { const bez = Math.round(w * 0.06); return { x: bez, y: bez, w: w - 2 * bez, h: h * 0.86 - bez, r: 2 } },
    behind: (w, h) => [<Rect key="body" width={w} height={h} fill="#2a2f3a" cornerRadius={Math.round(w * 0.05)} />],
    front: (w, h) => [<Circle key="btn" x={w / 2} y={h * 0.93} radius={Math.max(4, w * 0.03)} fill="none" stroke="#5b6472" strokeWidth={2} />],
  },
  {
    id: 'ultrawide', label: 'Ultrawide', aspect: 2.4,
    screen: (w, h) => { const p = Math.round(w * 0.01), sh = h * 0.82; return { x: p, y: p, w: w - 2 * p, h: sh - 2 * p, r: 3 } },
    behind: (w, h) => { const sh = h * 0.82; return [
      <Rect key="scr" width={w} height={sh} fill="#0B0B0F" cornerRadius={6} />,
      <Rect key="neck" x={w * 0.46} y={sh} width={w * 0.08} height={h * 0.12} fill="#C7CDD4" />,
      <Rect key="base" x={w * 0.38} y={h * 0.94} width={w * 0.24} height={h * 0.05} cornerRadius={6} fill="#AEB6BF" />,
    ] },
  },
  {
    id: 'phone_land', label: 'Phone quer', aspect: 2.05,
    screen: (w, h) => { const bez = Math.round(h * 0.05); return { x: bez, y: bez, w: w - 2 * bez, h: h - 2 * bez, r: Math.round(h * 0.1) } },
    behind: (w, h) => [<Rect key="body" width={w} height={h} fill="#0B0B0F" cornerRadius={Math.round(h * 0.16)} />],
    front: (w, h) => { const nh = h * 0.34, bez = Math.round(h * 0.05), nw = Math.max(4, w * 0.02); return [<Rect key="notch" x={bez + nw * 0.4} y={(h - nh) / 2} width={nw * 1.6} height={nh} cornerRadius={nw} fill="#0B0B0F" />] },
  },
  {
    id: 'notebook', label: 'Notizbuch', aspect: 0.75,
    screen: (w, h) => { const p = Math.round(w * 0.06), top = h * 0.08; return { x: p + w * 0.05, y: top, w: w - 2 * p - w * 0.05, h: h - top - p, r: 2 } },
    behind: (w, h) => [<Rect key="page" width={w} height={h} fill="#FFFFFF" cornerRadius={4} stroke="#E2E8F0" strokeWidth={1} shadowColor="#0f172a" shadowBlur={12} shadowOpacity={0.14} shadowOffsetY={4} />],
    front: (w, h) => { const rings = []; for (let i = 0; i < 8; i++) { rings.push(<Circle key={'rg' + i} x={w * 0.06} y={h * 0.08 + i * (h * 0.84 / 7)} radius={Math.max(3, w * 0.016)} fill="none" stroke="#9aa4b2" strokeWidth={2} />) } return rings },
  },
  {
    id: 'rollup', label: 'Roll-Up', aspect: 0.42,
    screen: (w, h) => { const p = Math.round(w * 0.06); return { x: p, y: p, w: w - 2 * p, h: h * 0.92 - p, r: 0 } },
    behind: (w, h) => [<Rect key="ban" width={w} height={h * 0.92} fill="#FFFFFF" stroke="#E2E8F0" strokeWidth={1} shadowColor="#0f172a" shadowBlur={12} shadowOpacity={0.12} shadowOffsetY={3} />],
    front: (w, h) => [
      <Rect key="foot" x={w * 0.1} y={h * 0.92} width={w * 0.8} height={h * 0.035} cornerRadius={4} fill="#AEB6BF" />,
      <Line key="leg" points={[w * 0.5, h * 0.955, w * 0.5, h]} stroke="#AEB6BF" strokeWidth={Math.max(3, w * 0.03)} />,
    ],
  },
  {
    id: 'cd', label: 'Cover', aspect: 1,
    screen: (w, h) => ({ x: 0, y: 0, w: w * 0.82, h, r: 0 }),
    behind: (w, h) => [
      <Circle key="disc" x={w * 0.86} y={h * 0.5} radius={h * 0.42} fill="#e5e7eb" stroke="#cbd5e1" strokeWidth={1} />,
      <Circle key="hole" x={w * 0.86} y={h * 0.5} radius={h * 0.07} fill="#f4f6fa" stroke="#cbd5e1" strokeWidth={1} />,
      <Rect key="cover" width={w * 0.82} height={h} fill="#fff" shadowColor="#0f172a" shadowBlur={14} shadowOpacity={0.16} shadowOffsetX={-2} shadowOffsetY={4} />,
    ],
  },
  {
    id: 'poster_persp', label: 'Poster 3D', aspect: 0.72,
    screenQuad: (w, h) => [{ x: w * 0.09, y: h * 0.06 }, { x: w * 0.85, y: h * 0.14 }, { x: w * 0.85, y: h * 0.9 }, { x: w * 0.09, y: h * 0.95 }],
    behind: (w, h) => [<Line key="sh" closed fill="#0f172a" opacity={0.14} points={[w * 0.13, h * 0.11, w * 0.89, h * 0.19, w * 0.89, h * 0.95, w * 0.13, h * 1.0]} />],
  },
  {
    id: 'tablet_persp', label: 'Tablet 3D', aspect: 1.35,
    screenQuad: (w, h) => [{ x: w * 0.17, y: h * 0.13 }, { x: w * 0.82, y: h * 0.06 }, { x: w * 0.88, y: h * 0.88 }, { x: w * 0.23, y: h * 0.94 }],
    behind: (w, h) => [<Line key="body" closed fill="#0B0B0F" points={[w * 0.13, h * 0.09, w * 0.86, h * 0.02, w * 0.92, h * 0.95, w * 0.19, h * 1.0]} shadowColor="#0f172a" shadowBlur={20} shadowOpacity={0.25} shadowOffsetX={8} shadowOffsetY={10} />],
  },
]
const deviceById = id => DEVICE_MOCKUPS.find(d => d.id === id) || DEVICE_MOCKUPS[0]
const DEFAULT_PHOTO_QUAD = [{ u: 0.28, v: 0.28 }, { u: 0.72, v: 0.28 }, { u: 0.72, v: 0.72 }, { u: 0.28, v: 0.72 }]
// Screen-Quad eines Mockups in lokalen Koordinaten: Foto-Mockup nutzt o.quadFrac,
// perspektivische Geräte-Mockups dev.screenQuad; sonst null (Rechteck-Screen-Pfad).
function mockupQuad(o) {
  if (o.kind === 'photo') { const qf = o.quadFrac || DEFAULT_PHOTO_QUAD; return qf.map(p => ({ x: p.u * o.width, y: p.v * o.height })) }
  const dev = deviceById(o.device); return dev && dev.screenQuad ? dev.screenQuad(o.width, o.height) : null
}
function mockupPreview(id) {
  const c = '#CBD5E1', s = '#94A3B8'
  const P = { width: 28, height: 28, viewBox: '0 0 100 100' }
  switch (id) {
    case 'phone': return <svg {...P}><rect x="34" y="8" width="32" height="84" rx="9" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'browser': return <svg {...P}><rect x="8" y="24" width="84" height="56" rx="5" fill={c} stroke={s} strokeWidth="3" /><rect x="8" y="24" width="84" height="13" rx="2" fill={s} /></svg>
    case 'laptop': return <svg {...P}><rect x="18" y="22" width="64" height="42" rx="3" fill={c} stroke={s} strokeWidth="3" /><path d="M10 76 L90 76 L98 88 L2 88 Z" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'tablet': return <svg {...P}><rect x="28" y="10" width="44" height="80" rx="6" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'tablet_ls': return <svg {...P}><rect x="10" y="28" width="80" height="44" rx="6" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'monitor': return <svg {...P}><rect x="12" y="16" width="76" height="50" rx="3" fill={c} stroke={s} strokeWidth="3" /><rect x="45" y="66" width="10" height="14" fill={s} /><rect x="34" y="80" width="32" height="6" rx="2" fill={s} /></svg>
    case 'tv': return <svg {...P}><rect x="8" y="16" width="84" height="58" rx="3" fill={c} stroke={s} strokeWidth="3" /><rect x="44" y="74" width="12" height="7" fill={s} /><rect x="30" y="81" width="40" height="5" rx="2" fill={s} /></svg>
    case 'watch': return <svg {...P}><rect x="40" y="6" width="20" height="22" rx="4" fill={s} /><rect x="40" y="72" width="20" height="22" rx="4" fill={s} /><rect x="30" y="26" width="40" height="48" rx="12" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'ig_post': return <svg {...P}><rect x="30" y="8" width="40" height="84" rx="8" fill="#fff" stroke={s} strokeWidth="3" /><rect x="35" y="34" width="30" height="30" fill={c} /></svg>
    case 'ig_story': return <svg {...P}><rect x="30" y="8" width="40" height="84" rx="8" fill={c} stroke={s} strokeWidth="3" /><rect x="37" y="14" width="26" height="3" rx="1" fill="#fff" /></svg>
    case 'poster': return <svg {...P}><rect x="24" y="8" width="52" height="84" fill="#111827" /><rect x="28" y="12" width="44" height="76" fill={c} /></svg>
    case 'billboard': return <svg {...P}><rect x="8" y="20" width="84" height="42" fill={c} stroke={s} strokeWidth="3" /><rect x="26" y="62" width="5" height="24" fill={s} /><rect x="69" y="62" width="5" height="24" fill={s} /></svg>
    case 'card': return <svg {...P}><rect x="14" y="34" width="72" height="32" rx="4" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'book': return <svg {...P}><rect x="26" y="10" width="50" height="80" rx="3" fill={c} stroke={s} strokeWidth="3" /><rect x="30" y="10" width="4" height="80" fill={s} /></svg>
    case 'frame_wall': return <svg {...P}><rect x="20" y="8" width="60" height="84" fill="#3f3f46" /><rect x="27" y="15" width="46" height="70" fill="#fff" /><rect x="33" y="21" width="34" height="58" fill={c} /></svg>
    case 'tshirt': return <svg {...P}><path d="M30 18 L42 10 L58 10 L70 18 L86 30 L76 42 L70 36 L70 90 L30 90 L30 36 L24 42 L14 30 Z" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'mug': return <svg {...P}><circle cx="70" cy="50" r="16" fill="none" stroke={s} strokeWidth="6" /><rect x="16" y="26" width="52" height="48" rx="4" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'tote': return <svg {...P}><path d="M32 30 L36 12 L48 12 L50 30" fill="none" stroke={s} strokeWidth="4" /><path d="M52 30 L54 12 L66 12 L70 30" fill="none" stroke={s} strokeWidth="4" /><rect x="22" y="28" width="56" height="60" rx="3" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'sticker': return <svg {...P}><rect x="14" y="14" width="72" height="72" rx="16" fill="#fff" stroke={s} strokeWidth="3" /><rect x="24" y="24" width="52" height="52" rx="8" fill={c} /></svg>
    case 'postcard': return <svg {...P}><rect x="10" y="30" width="80" height="40" rx="3" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'phone_persp': return <svg {...P}><polygon points="30,12 66,20 66,80 30,88" fill={c} stroke={s} strokeWidth="3" strokeLinejoin="round" /></svg>
    case 'laptop_persp': return <svg {...P}><polygon points="24,16 76,16 84,60 16,60" fill={c} stroke={s} strokeWidth="3" strokeLinejoin="round" /><polygon points="16,60 84,60 94,84 6,84" fill="#E2E8F0" stroke={s} strokeWidth="3" strokeLinejoin="round" /></svg>
    case 'card_persp': return <svg {...P}><polygon points="16,26 84,14 88,78 12,90" fill={c} stroke={s} strokeWidth="3" strokeLinejoin="round" /></svg>
    case 'ereader': return <svg {...P}><rect x="30" y="8" width="40" height="84" rx="6" fill="#5b6472" /><rect x="34" y="12" width="32" height="64" rx="2" fill={c} /><circle cx="50" cy="85" r="3" fill="none" stroke="#c7cdd4" strokeWidth="2" /></svg>
    case 'ultrawide': return <svg {...P}><rect x="6" y="26" width="88" height="38" rx="3" fill={c} stroke={s} strokeWidth="3" /><rect x="44" y="64" width="12" height="10" fill={s} /><rect x="36" y="74" width="28" height="5" rx="2" fill={s} /></svg>
    case 'phone_land': return <svg {...P}><rect x="10" y="34" width="80" height="32" rx="9" fill={c} stroke={s} strokeWidth="3" /></svg>
    case 'notebook': return <svg {...P}><rect x="24" y="10" width="52" height="80" rx="3" fill="#fff" stroke={s} strokeWidth="3" /><rect x="32" y="16" width="40" height="68" fill={c} /><circle cx="28" cy="22" r="2.5" fill="none" stroke={s} strokeWidth="2" /><circle cx="28" cy="40" r="2.5" fill="none" stroke={s} strokeWidth="2" /><circle cx="28" cy="58" r="2.5" fill="none" stroke={s} strokeWidth="2" /><circle cx="28" cy="76" r="2.5" fill="none" stroke={s} strokeWidth="2" /></svg>
    case 'rollup': return <svg {...P}><rect x="30" y="6" width="40" height="76" fill={c} stroke={s} strokeWidth="3" /><rect x="34" y="82" width="32" height="5" rx="2" fill={s} /><line x1="50" y1="86" x2="50" y2="94" stroke={s} strokeWidth="3" /></svg>
    case 'cd': return <svg {...P}><circle cx="66" cy="50" r="30" fill="#e5e7eb" stroke={s} strokeWidth="2" /><circle cx="66" cy="50" r="6" fill="#fff" stroke={s} strokeWidth="2" /><rect x="14" y="20" width="52" height="60" fill="#fff" stroke={s} strokeWidth="3" /></svg>
    case 'poster_persp': return <svg {...P}><polygon points="18,14 76,22 76,80 18,86" fill={c} stroke={s} strokeWidth="3" strokeLinejoin="round" /></svg>
    case 'tablet_persp': return <svg {...P}><polygon points="20,20 78,12 84,84 26,90" fill={c} stroke={s} strokeWidth="3" strokeLinejoin="round" /></svg>
    default: return <svg {...P}><rect x="16" y="10" width="68" height="80" rx="3" fill="#fff" stroke={s} strokeWidth="3" /><rect x="24" y="18" width="52" height="52" fill={c} /></svg>
  }
}

const nextId = () => `obj_${Date.now()}_${_uid++}`

// Blob → DataURL (für PDF-Einbettung via jsPDF.addImage).
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(new Error('Konnte Bild nicht für PDF lesen.'))
    fr.readAsDataURL(blob)
  })
}

// Größen-/Format-Presets (Pixel). Werden auf bild-lose / Vorlagen-Designs angewandt.
const FORMAT_PRESETS = [
  { id: 'li_square',   label: 'LinkedIn-Post (1200×1200)', w: 1200, h: 1200 },
  { id: 'li_land',     label: 'LinkedIn Querformat (1200×627)', w: 1200, h: 627 },
  { id: 'story',       label: 'Story (1080×1920)', w: 1080, h: 1920 },
  { id: 'li_cover',    label: 'LinkedIn-Cover (1584×396)', w: 1584, h: 396 },
  { id: 'square',      label: 'Quadrat (1080×1080)', w: 1080, h: 1080 },
  { id: 'a4',          label: 'A4 (2480×3508)', w: 2480, h: 3508 },
]

const ZOOM_MIN = 0.1
const ZOOM_MAX = 8

// Rand um die Artboard (Display-px), damit Auswahlrahmen/Anfasser über den
// Seitenrand hinaus sichtbar bleiben (Stage ist größer als die Seite).
const CANVAS_PAD = 80
// Aktive Drag-Payload aus den Bibliotheks-Panels (Icon/Grafik/Foto/Upload/Medium) → Canvas-Drop.
let _designerDrag = null

export default function DesignerCanvas({ visual, teamId, onSaved, onReplaceVisual, onPagesToPost }) {
  const stageRef = useRef(null)
  const layerRef = useRef(null)
  const guideLayerRef = useRef(null)              // Smart-Guides (Hilfslinien) Layer
  const trRef = useRef(null)
  const containerRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)                   // versteckter file-input (Bild-Upload)
  const activeRef = useRef(null)                       // Root des Designers (Sichtbarkeits-Guard)

  const { activeBrandVoice } = useBrandVoice()
  const primaryImageIdRef = useRef(null)              // ID des "primären" Bild-Objekts (importiertes Visual)

  const [bgImage, setBgImage] = useState(null)        // HTMLImageElement des Basisbildes (intern für KI/Filter-Fallback)
  const [stageSize, setStageSize] = useState({ width: 600, height: 600 })
  const [scale, setScale] = useState(1)               // Auto-Anzeige-Skalierung (Bühne → Container)
  const [viewScale, setViewScale] = useState(1)       // zusätzlicher Nutzer-Zoom (1 = 100%, relativ zur Auto-Skalierung)
  const [pan, setPan] = useState({ x: 0, y: 0 })      // Pan-Versatz der Ansicht (Container-Pixel)
  const [containerW, setContainerW] = useState(700)
  // STABILE Gesamtbreite des Editor-Bereichs (Rail + Panel + Canvas). Anders als
  // containerW (nur Canvas) ändert sie sich NICHT, wenn ein Panel andockt → wird für
  // die dock/popup-Entscheidung genutzt (verhindert Schwellwert-Oszillation/Zittern).
  const [rootW, setRootW] = useState(900)
  const spaceDownRef = useRef(false)                  // Leertaste gedrückt → Pan-Modus
  const [spaceActive, setSpaceActive] = useState(false) // gespiegelt für Cursor/Render
  const panDragRef = useRef(null)                     // {startX,startY,panX,panY} während Pan-Drag
  const [isPanning, setIsPanning] = useState(false)

  const [objects, setObjects] = useState([])          // Overlay-Objekte (Text, Formen, Sticker, Bild)
  const [imgCache, setImgCache] = useState({})        // {src(DataURL/URL) -> HTMLImageElement} für type:'image'
  const [warpCache, setWarpCache] = useState({})      // {warpKey -> HTMLCanvasElement} für perspektivische Mockups
  const [selectedIds, setSelectedIds] = useState([])  // Mehrfach-Auswahl (Array von Objekt-IDs)
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null  // Abwärtskompatibel (Einzel-Selektion)
  const setSelectedId = useCallback((id) => setSelectedIds(id ? [id] : []), [])
  const [editingTextId, setEditingTextId] = useState(null)
  const copyStyleRef = useRef(null)              // Format-Painter: kopierter Stil {type, style}
  const [copyStyleActive, setCopyStyleActive] = useState(false)
  // "Verzerren"-Modus: per Doppelklick auf ein Objekt (kein Text) aktiviert. Solange
  // null, ist das Skalieren proportional (kein Verzerren); ist eine ID gesetzt, darf
  // dieses Objekt frei (nicht-proportional) skaliert werden. Rahmenfarbe + Anker-Form
  // wechseln im Verzerren-Modus.
  const [distortId, setDistortId] = useState(null)
  const [quadEditId, setQuadEditId] = useState(null)  // Foto-Mockup: aktiver Screen-Ecken-Editor
  const [marquee, setMarquee] = useState(null)        // {x,y,w,h} Rubberband in Bühnenkoordinaten
  const [marqueeHits, setMarqueeHits] = useState([])  // Ids der vom Kästchen berührten Elemente (Live-Rahmen)
  const [frameDropTarget, setFrameDropTarget] = useState(null)  // Rahmen/Mockup, über dem gerade ein Bild schwebt (Drag-to-fill)
  const marqueeStartRef = useRef(null)
  const clipboardRef = useRef([])                     // kopierte Objekte (intern)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [autosaving, setAutosaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  // Hintergrund-Füllfarbe (für Vorlagen ohne Bild)
  const [bgColor, setBgColor] = useState(null)        // null = kein Farbgrund (Bild-Modus)
  const [bgGrad, setBgGrad] = useState(null)          // optionaler Hintergrund-Verlauf {type,angle,stops}
  const [pageAiCmd, setPageAiCmd] = useState('')
  const [pageAiBusy, setPageAiBusy] = useState(false)

  // Bild-Filter (auf Bild-Objekt[e])
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS })

  // Crop-Modus
  const [cropMode, setCropMode] = useState(false)
  const [cropRect, setCropRect] = useState(null)      // {x,y,w,h} in Bühnenkoordinaten
  const cropDragRef = useRef(null)
  const [cropRatio, setCropRatio] = useState(null)   // null = frei; sonst Seitenverhältnis (w/h)
  const [penColor, setPenColor] = useState('#111827')
  const [penWidth, setPenWidth] = useState(6)
  const drawRef = useRef(null)
  const [drawPreview, setDrawPreview] = useState(null)
  const [activeBrush, setActiveBrush] = useState('pen')
  const eraseRef = useRef(false)
  const pickBrush = (id) => { const b = brushById(id); setActiveBrush(id); setPenWidth(b.width) }

  // ─── KI-Masken-Werkzeug ────────────────────────────────────────────────────
  // aiMode: 'edit' (freier Prompt) | 'heal' (Objekt entfernen) | null
  const [aiMode, setAiMode] = useState(null)
  const [maskTool, setMaskTool] = useState('brush')   // 'brush' | 'lasso' | 'rect'
  const [brushSize, setBrushSize] = useState(60)      // in Bild-Pixeln
  const [feather, setFeather] = useState(true)        // weiche Kante
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [hasMask, setHasMask] = useState(false)
  // KI-Vorschau vor dem Übernehmen: { url, objId, kind } | null
  const [aiPreview, setAiPreview] = useState(null)

  // Hintergrund-Menü
  const [bgMenuBusy, setBgMenuBusy] = useState(false)

  const [showExport, setShowExport] = useState(false)
  const [exporting, setExporting] = useState(false)
  // Design-Name (Titel) — editierbar in der Kopfleiste, erscheint in der Bibliothek
  const [designName, setDesignName] = useState(visual?.title || '')
  const nameSaveRef = useRef(null)
  const aiNamedRef = useRef(false)
  useEffect(() => { setDesignName(visual?.title || ''); aiNamedRef.current = false }, [visual?.id])
  function commitName(v) {
    setDesignName(v)
    if (nameSaveRef.current) clearTimeout(nameSaveRef.current)
    nameSaveRef.current = setTimeout(async () => {
      if (!visual?.id) return
      try { const { data } = await updateVisual(visual.id, { title: v }); onSaved && onSaved(data || { ...visual, title: v }) } catch (_e) {}
    }, 600)
  }
  // Seiten-Aktion (In Beitrag / Download) — Mehrseiten-Auswahl + Folge-Schritt
  const [pagesAction, setPagesAction] = useState(null)  // 'post' | 'download' | 'media' | null
  const [pagesStep, setPagesStep] = useState('pages')   // 'format' | 'pages' | 'post'
  const [pageSel, setPageSel] = useState({})            // { [idx]: true }
  const [pagesBusy, setPagesBusy] = useState(false)
  const [pagesMsg, setPagesMsg] = useState('')
  const [dlFormat, setDlFormat] = useState('pdf')       // 'pdf' | 'png' | 'jpg'
  const [postList, setPostList] = useState([])
  const [postLoading, setPostLoading] = useState(false)
  const [postSearch, setPostSearch] = useState('')

  // ─── Rechtsklick-Kontextmenü ───────────────────────────────────────────────
  // { x, y, objId|null } in Container-Pixeln (relativ zur Canvas-Fläche).
  const [ctxMenu, setCtxMenu] = useState(null)

  // ─── Canva-Stil: linke Werkzeug-Schiene + Panel ────────────────────────────
  // activeTool: null | 'templates' | 'elements' | 'text' | 'uploads' | 'brand' | 'ai' | 'filter'
  const [activeTool, setActiveTool] = useState(null)
  // Bug-Fix: KI-Masken-Modus IMMER verlassen, sobald man das KI-Werkzeug/Panel wechselt
  // oder schließt — sonst „klebt" das Auswahl-Overlay und man kommt nicht mehr weg.
  useEffect(() => {
    if (activeTool !== 'edit') { setAiMode(null); clearMask(); setAiPreview(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool])
  // Werkzeug-Panel schließt sich, sobald man irgendwo daneben klickt (nicht nur via X).
  useEffect(() => {
    if (!activeTool) return
    const onDocDown = (e) => {
      // Während eines KI-Bereichs-/Maskenmodus darf ein Klick auf den Canvas das
      // Panel NICHT schließen (man zeichnet ja gerade die Maske aufs Bild).
      if (aiMode) return
      const t = e.target
      if (t && t.closest && t.closest('[data-tool-ui]')) return
      // Klicks auf den Canvas-/Stage-Bereich nicht als "daneben" werten.
      if (t && t.closest && t.closest('.konvajs-content')) return
      setActiveTool(null)
    }
    document.addEventListener('mousedown', onDocDown, true)
    return () => document.removeEventListener('mousedown', onDocDown, true)
  }, [activeTool, aiMode])
  const [elementTab, setElementTab] = useState('shapes')   // shapes | icons | graphics | images
  const [uploadThumbs, setUploadThumbs] = useState([])     // diese Sitzung hochgeladene DataURLs
  const [aiCommand, setAiCommand] = useState('')           // freier KI-Befehl (mask-free)
  // Brand-Identität (Logos/Farben/Fonts) der aktiven Company Brand
  const [brandData, setBrandData] = useState(null)         // { palette, logos:[{path,url}], fonts:[{family,...}] }
  const [brandFontFamilies, setBrandFontFamilies] = useState([])
  const [fontRev, setFontRev] = useState(0)                // Redraw-Trigger nach Google-Font-Load
  const [brandLoading, setBrandLoading] = useState(false)
  // Medien-Bibliothek (Team-Bilder, brand-scoped) für den Medien-Tab
  const [mediaLib, setMediaLib] = useState([])             // [{ id, url, storage_path }]
  const [mediaLoading, setMediaLoading] = useState(false)
  const mediaLoadedRef = useRef(false)

  // ─── Runde 2: rechte Spalte (Ebenen + Eigenschaften) ──────────────────────
  const [renamingId, setRenamingId] = useState(null)           // Ebene wird gerade umbenannt
  const layerDragRef = useRef(null)                            // {id} während Drag-Reorder im Ebenen-Panel
  const [layerDragOverId, setLayerDragOverId] = useState(null) // Drop-Ziel-Hervorhebung

  // Masken-Canvas (volle Bild-Auflösung) + sichtbares Overlay-Canvas (Anzeige-Auflösung)
  const maskCanvasRef = useRef(null)                  // HTMLCanvasElement (Bild-Pixel, weiß=Maske)
  const overlayRef = useRef(null)                     // sichtbares Canvas über der Stage
  const drawingRef = useRef(false)
  const lassoPtsRef = useRef([])                      // [{x,y}] in Bild-Pixeln (Lasso)
  const rectStartRef = useRef(null)                   // {x,y} Start (rect-Masken-Modus)

  // Undo/Redo: Snapshots des kompletten Editor-Zustands
  const historyRef = useRef([])
  const futureRef = useRef([])
  const skipHistoryRef = useRef(false)
  // Pro "Interaktion" (Slider-Zug, Farbwahl…) nur EINMAL einen Snapshot ablegen.
  // Wird bei pointerup / blur via endInteraction() zurückgesetzt → 1 Zug = 1 Undo-Schritt.
  const interactionOpenRef = useRef(false)

  // Aktuelles Crop-Fenster des Basisbildes (nicht-destruktiv über Konva crop())
  const [baseCrop, setBaseCrop] = useState(null)      // {x,y,width,height} in Bild-Pixeln

  // ─── Mehrseiten-Designs (design_json v2) ────────────────────────────────────
  // Ein Design hat 1..n Seiten (gleiches Format). Die AKTIVE Seite wird in den
  // Live-States (objects/filters/baseCrop/bgColor/stageSize) bearbeitet; alle Seiten
  // (inkl. einer Kopie der aktiven) liegen in `pages`. Refs halten den aktuellen Stand
  // für Serialisierung in Autosave/Speichern/Seitenwechsel.
  const [pages, setPages] = useState([])              // [{ id, objects, filters, baseCrop, bgColor, stage, primaryImageId }]
  const [activePageIdx, setActivePageIdx] = useState(0)
  const pagesRef = useRef([])
  const activeIdxRef = useRef(0)
  useEffect(() => { pagesRef.current = pages }, [pages])
  useEffect(() => { activeIdxRef.current = activePageIdx }, [activePageIdx])

  // ─── Basisbild laden (DataURL → kein CORS-Taint beim Export) ───────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true); setLoadError(''); setSavedMsg('')
    ;(async () => {
      try {
        // Bevorzugt einen direkt mitgelieferten (gekeyten) DataURL — vermeidet einen
        // Storage-Roundtrip und garantiert, dass exakt das gekeyte Bild angezeigt wird
        // (z.B. nach "Transparent freistellen": die transparente PNG-Version, nicht das
        // rohe Magenta-Zwischenbild aus dem Storage).
        const inlineDataUrl = visual?.__dataUrl || null
        // B3/B4: Ein Design OHNE Bild (nur bgColor + objects) muss ladbar sein.
        // Kein Bildpfad? → bild-loses Design aus design_json rendern, statt abzubrechen.
        const dj = visual?.design_json
        const hasDesign = dj && typeof dj === 'object'
        // v2-Design (mehrseitig): Seiten direkt laden, keine Storage-Bild-Logik nötig.
        if (hasDesign && dj.version === 2 && Array.isArray(dj.pages) && dj.pages.length) {
          const pgs = dj.pages.map(p => ({
            id: p.id || nextId(),
            objects: Array.isArray(p.objects) ? p.objects : [],
            filters: { ...EMPTY_FILTERS, ...(p.filters || {}) },
            baseCrop: p.baseCrop || null,
            bgColor: p.bgColor || '#ffffff',
            bgGrad: p.bgGrad || null,
            stage: p.stage || { width: 1080, height: 1080 },
            primaryImageId: p.primaryImageId || null,
          }))
          const idx = Math.min(Math.max(0, dj.activePageIndex || 0), pgs.length - 1)
          setBgImage(null)
          setPages(pgs)
          setActivePageIdx(idx)
          hydrateFromPage(pgs[idx])
          setLoading(false)
          return
        }
        if (!inlineDataUrl && !visual?.storage_path) {
          if (hasDesign) {
            try {
              const w = dj.stage?.width || 1080
              const h = dj.stage?.height || 1080
              setBgImage(null)
              setBgColor(dj.bgColor || '#ffffff')
              setBgGrad(dj.bgGrad || null)
              setStageSize({ width: w, height: h })
              setBaseCrop(null)
              const objs0 = Array.isArray(dj.objects) ? dj.objects : []
              const flt0 = { ...EMPTY_FILTERS, ...(dj.filters || {}) }
              setObjects(objs0)
              setFilters(flt0)
              resetMaskCanvas(w, h)
              historyRef.current = []; futureRef.current = []
              setPages([{ id: nextId(), objects: objs0, filters: flt0, baseCrop: null, bgColor: dj.bgColor || '#ffffff', bgGrad: dj.bgGrad || null, stage: { width: w, height: h }, primaryImageId: null }])
              setActivePageIdx(0)
            } catch (_e) { /* noop */ }
            setLoading(false)
            return
          }
          setLoadError('Kein Bildpfad'); setLoading(false); return
        }
        const dataUrl = inlineDataUrl || await visualDataUrl(visual.storage_path)
        if (!dataUrl) { if (!cancelled) { setLoadError('Bild konnte nicht geladen werden'); setLoading(false) } return }
        const img = new window.Image()
        img.onload = () => {
          if (cancelled) return
          const w = img.naturalWidth || 1024
          const h = img.naturalHeight || 1024
          // WHITEBOARD-MODELL: Das importierte Bild ist KEIN Stage-Hintergrund mehr,
          // sondern ein normales image-Objekt auf einer weißen Artboard. bgImage wird
          // nur intern als Fallback-Quelle für KI/Filter behalten.
          setBgImage(img)
          setBaseCrop(null)
          // Vorhandenes Design wiederherstellen?
          let restored = false
          try {
            const dj2 = visual.design_json
            if (dj2 && typeof dj2 === 'object' && (Array.isArray(dj2.objects) || dj2.objects)) {
              let objs = Array.isArray(dj2.objects) ? dj2.objects : []
              const stW = (dj2.stage && dj2.stage.width) ? dj2.stage.width : w
              const stH = (dj2.stage && dj2.stage.height) ? dj2.stage.height : h
              // ALTES Design (Bild war Stage-Hintergrund): enthält KEIN image-Objekt mit
              // dem Basisbild → primäres Bild-Objekt synthetisieren, damit es im neuen
              // Whiteboard-Modell als normales Objekt erscheint.
              const hasPrimary = objs.some(o => o.type === 'image' && o.__primary)
              if (!hasPrimary) {
                const pid = nextId()
                primaryImageIdRef.current = pid
                const primary = { id: pid, type: 'image', __primary: true, src: dataUrl,
                  x: 0, y: 0, width: stW, height: stH, rotation: 0, opacity: 1 }
                setImgCache(prev => ({ ...prev, [dataUrl]: img }))
                objs = [primary, ...objs]
              } else {
                const p = objs.find(o => o.type === 'image' && o.__primary)
                primaryImageIdRef.current = p?.id || null
              }
              const flt = { ...EMPTY_FILTERS, ...(dj2.filters || {}) }
              setObjects(objs)
              setFilters(flt)
              if (dj2.baseCrop) setBaseCrop(dj2.baseCrop)
              setBgColor(dj2.bgColor || '#ffffff')
              setBgGrad(dj2.bgGrad || null)
              setStageSize({ width: stW, height: stH })
              setPages([{ id: nextId(), objects: objs, filters: flt, baseCrop: dj2.baseCrop || null, bgColor: dj2.bgColor || '#ffffff', bgGrad: dj2.bgGrad || null, stage: { width: stW, height: stH }, primaryImageId: primaryImageIdRef.current || null }])
              setActivePageIdx(0)
              restored = true
            }
          } catch (_e) { /* fallback: frisches Whiteboard */ }
          if (!restored) {
            // FRISCHER Import: weiße Artboard in Bildgröße + Bild als primäres Objekt.
            const pid = nextId()
            primaryImageIdRef.current = pid
            setImgCache(prev => ({ ...prev, [dataUrl]: img }))
            const objs0 = [{ id: pid, type: 'image', __primary: true, src: dataUrl,
              x: 0, y: 0, width: w, height: h, rotation: 0, opacity: 1 }]
            setObjects(objs0)
            setBgColor('#ffffff')
            setBgGrad(null)
            setStageSize({ width: w, height: h })
            setFilters({ ...EMPTY_FILTERS })
            setPages([{ id: nextId(), objects: objs0, filters: { ...EMPTY_FILTERS }, baseCrop: null, bgColor: '#ffffff', bgGrad: null, stage: { width: w, height: h }, primaryImageId: pid }])
            setActivePageIdx(0)
          }
          resetMaskCanvas(w, h)
          historyRef.current = []
          futureRef.current = []
          setLoading(false)
        }
        img.onerror = () => { if (!cancelled) { setLoadError('Bild-Dekodierung fehlgeschlagen'); setLoading(false) } }
        img.src = dataUrl
      } catch (e) {
        if (!cancelled) { setLoadError(e?.message || 'Fehler beim Laden'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visual?.id, visual?.storage_path])

  // ─── KI-Namensgenerierung (einmal pro Design ohne richtigen Namen) ──────────
  useEffect(() => {
    if (aiNamedRef.current || loading) return
    if (visual?.kind !== 'design' || !visual?.id) return
    const t = (visual?.title || '').trim()
    if (t && t !== 'Design' && t !== 'Neues Design') { aiNamedRef.current = true; return }
    aiNamedRef.current = true
    ;(async () => {
      try {
        const firstText = (objects.find(o => o.type === 'text' && (o.text || '').trim())?.text || '').slice(0, 200)
        const topic = firstText || visual?.prompt || 'Social-Media-Design'
        const { data } = await supabase.functions.invoke('generate', { body: { model: 'claude-haiku-4-5', prompt: `Gib NUR einen kurzen, prägnanten Design-Namen (max. 4 Wörter, Deutsch, ohne Anführungszeichen, keine Erklärung) für ein Social-Media-Design zu folgendem Inhalt zurück:\n\n${topic}` } })
        let name = String(data?.text || data?.content || data?.output || '').trim().replace(/^["'\s]+|["'\s.]+$/g, '').split('\n')[0].slice(0, 60)
        if (name) {
          setDesignName(name)
          try { const { data: up } = await updateVisual(visual.id, { title: name }); onSaved && onSaved(up || { ...visual, title: name }) } catch (_e) {}
        }
      } catch (_e) {}
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, visual?.id])

  // ─── Mehrseiten-Helfer ──────────────────────────────────────────────────────
  const currentStage = () => ({ width: stageSize.width, height: stageSize.height })
  function snapshotActivePage() {
    return { objects, filters, baseCrop, bgColor, bgGrad, stage: currentStage(), primaryImageId: primaryImageIdRef.current || null }
  }
  // Alle Seiten mit der aktiven Seite frisch hineinserialisiert.
  function withCommittedPages() {
    const arr = (pagesRef.current && pagesRef.current.length) ? pagesRef.current.map(p => ({ ...p })) : []
    const idx = activeIdxRef.current
    const snap = { id: (arr[idx] && arr[idx].id) || nextId(), ...snapshotActivePage() }
    if (arr.length) arr[idx] = snap; else arr.push(snap)
    return arr
  }
  function buildDesignJson() {
    return { version: 2, pages: withCommittedPages(), activePageIndex: activeIdxRef.current }
  }
  function hydrateFromPage(p) {
    if (!p) return
    setObjects(Array.isArray(p.objects) ? p.objects : [])
    setFilters({ ...EMPTY_FILTERS, ...(p.filters || {}) })
    setBaseCrop(p.baseCrop || null)
    setBgColor(p.bgColor || '#ffffff')
    setBgGrad(p.bgGrad || null)
    setStageSize(p.stage || { width: 1080, height: 1080 })
    primaryImageIdRef.current = p.primaryImageId || null
    historyRef.current = []; futureRef.current = []
    setSelectedIds([]); setDistortId(null); setQuadEditId(null)
    try { resetMaskCanvas((p.stage && p.stage.width) || 1080, (p.stage && p.stage.height) || 1080) } catch (_e) {}
  }
  function switchToPage(idx) {
    if (idx === activeIdxRef.current) return
    const arr = withCommittedPages()
    if (!arr[idx]) return
    setPages(arr); setActivePageIdx(idx); hydrateFromPage(arr[idx])
  }
  function addPage() {
    const arr = withCommittedPages()
    const blank = { id: nextId(), objects: [], filters: { ...EMPTY_FILTERS }, baseCrop: null, bgColor: '#ffffff', bgGrad: null, stage: currentStage(), primaryImageId: null }
    arr.push(blank)
    setPages(arr); setActivePageIdx(arr.length - 1); hydrateFromPage(blank)
  }
  function duplicatePage(idx) {
    const arr = withCommittedPages()
    const src = arr[idx]; if (!src) return
    const copy = JSON.parse(JSON.stringify(src))
    copy.id = nextId()
    copy.objects = (copy.objects || []).map(o => ({ ...o, id: nextId(), __primary: false }))
    copy.primaryImageId = null
    arr.splice(idx + 1, 0, copy)
    setPages(arr); setActivePageIdx(idx + 1); hydrateFromPage(copy)
  }
  function deletePage(idx) {
    if ((pagesRef.current || []).length <= 1) return
    const arr = withCommittedPages()
    arr.splice(idx, 1)
    const newIdx = Math.max(0, Math.min(idx, arr.length - 1))
    setPages(arr); setActivePageIdx(newIdx); hydrateFromPage(arr[newIdx])
  }
  function movePage(idx, dir) {
    const arr = withCommittedPages()
    const j = idx + dir
    if (j < 0 || j >= arr.length) return
    const curId = arr[activeIdxRef.current]?.id
    const [it] = arr.splice(idx, 1); arr.splice(j, 0, it)
    const newActive = arr.findIndex(p => p.id === curId)
    setPages(arr); setActivePageIdx(newActive >= 0 ? newActive : 0)
  }
  // Initialisiert pages aus dem aktuellen Live-Stand (für v1/Frisch-Import als 1 Seite).
  function initSinglePage(extra) {
    const pg = { id: nextId(), ...snapshotActivePage(), ...(extra || {}) }
    setPages([pg]); setActivePageIdx(0)
  }

  // ─── Autospeichern (Echtzeit) ──────────────────────────────────────────────
  // Jede Änderung am Design wird debounced als design_json gespeichert (ohne den
  // teuren Render-Upload — das macht nur der explizite „Speichern"-Button). So ist
  // der Bearbeitungsstand jederzeit persistent und übersteht einen Reload.
  const autosaveReadyRef = useRef(false)
  const autosaveTimerRef = useRef(null)
  // Nach Lade-Ende kurz warten, dann Autospeichern scharf schalten — verhindert,
  // dass die Hydrations-Renders (Laden eines Designs) sofort einen Save auslösen.
  useEffect(() => {
    autosaveReadyRef.current = false
    if (loading) return
    const t = setTimeout(() => { autosaveReadyRef.current = true }, 500)
    return () => clearTimeout(t)
  }, [loading, visual?.id])
  useEffect(() => {
    if (!autosaveReadyRef.current) return
    if (!visual?.id || !teamId) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        setAutosaving(true)
        const design_json = buildDesignJson()
        await updateVisual(visual.id, { design_json })
        setSavedMsg('Automatisch gespeichert')
      } catch (_e) { /* Autosave darf nie stören */ }
      finally { setAutosaving(false) }
    }, 1000)
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, filters, baseCrop, bgColor, stageSize, visual?.id, teamId])

  // ─── Anzeige-Skalierung an Container anpassen ──────────────────────────────
  useEffect(() => {
    let raf = 0
    function apply() {
      const el = containerRef.current
      if (el) {
        const w = el.clientWidth || 700
        // Nur bei spürbarer Änderung aktualisieren → verhindert ResizeObserver-
        // Rückkopplungsschleifen (Zittern) durch Sub-Pixel-/Scrollbar-Oszillation.
        setContainerW(prev => Math.abs(prev - w) > 2 ? w : prev)
      }
      // STABILE Gesamtbreite (Rail+Panel+Canvas) für die dock/popup-Entscheidung —
      // ändert sich NICHT beim Andocken eines Panels → keine Schwellwert-Oszillation.
      const root = activeRef.current
      if (root) {
        const rw = root.clientWidth || 900
        setRootW(prev => Math.abs(prev - rw) > 2 ? rw : prev)
      }
    }
    // Messung in den nächsten Frame verschieben: bricht die synchrone
    // RO→setState→Layout→RO-Schleife auf (Chrome "ResizeObserver loop").
    function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply) }
    apply()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    if (ro) { if (containerRef.current) ro.observe(containerRef.current); if (activeRef.current) ro.observe(activeRef.current) }
    window.addEventListener('resize', schedule)
    return () => { cancelAnimationFrame(raf); if (ro) ro.disconnect(); window.removeEventListener('resize', schedule) }
  }, [])

  useEffect(() => {
    const maxW = Math.max(240, containerW - 4)
    const maxH = Math.max(240, (typeof window !== 'undefined' ? window.innerHeight : 800) - 260)
    const s = Math.min(maxW / stageSize.width, maxH / stageSize.height, 1)
    setScale(s > 0 && isFinite(s) ? s : 1)
  }, [containerW, stageSize])

  // Effektive Anzeige-Skalierung = Auto-Skalierung × Nutzer-Zoom.
  // ALLE Pointer-/Overlay-Koordinaten rechnen über effScale, damit Klicks korrekt bleiben.
  const effScale = scale * viewScale

  // Bei Format-/Größenwechsel Zoom & Pan zurücksetzen (Einpassen).
  useEffect(() => { setViewScale(1); setPan({ x: 0, y: 0 }) }, [stageSize.width, stageSize.height])

  // ─── Zoom-Helfer ────────────────────────────────────────────────────────────
  const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
  // focusWrapperPt (optional): {x,y} relativ zur Top-Left-Ecke des Stage-Wrappers
  // (also in dargestellten Container-Pixeln). Beim Zoom bleibt dieser Punkt unter
  // dem Cursor. Der Wrapper ist im Container zentriert + um `pan` verschoben; beim
  // Zoom wächst/schrumpft er um seine Top-Left-Ecke. Wir kompensieren über pan:
  //   delta = (newEff/oldEff − 1)
  //   neuer Top-Left-Versatz so, dass focus*newEff an gleicher Stelle landet.
  const zoomTo = useCallback((nextViewScale, focusWrapperPt) => {
    if (scale <= 0) { setViewScale(z => clampZoom(nextViewScale)); return }
    setViewScale(prev => {
      const nv = clampZoom(nextViewScale)
      const oldEff = scale * prev
      const newEff = scale * nv
      if (focusWrapperPt && oldEff > 0) {
        const ratio = newEff / oldEff
        // Bühnen-Punkt unter Cursor (vor Zoom): focus / oldEff.
        // Nach Zoom liegt er bei focus*ratio (relativ zur Wrapper-Ecke).
        // Wrapper-Ecke verschiebt sich zusätzlich um (newDisp−oldDisp)/2 nach links/oben
        // wegen Zentrierung — das hebt sich gegen die pan-Korrektur bei symmetrischem
        // Wachstum auf, daher korrigieren wir nur die Cursor-Differenz.
        setPan(p => ({
          x: p.x - (focusWrapperPt.x * (ratio - 1)),
          y: p.y - (focusWrapperPt.y * (ratio - 1)),
        }))
      }
      return nv
    })
  }, [scale])
  const zoomIn = () => zoomTo(viewScale * 1.2)
  const zoomOut = () => zoomTo(viewScale / 1.2)
  const zoomFit = () => { setViewScale(1); setPan({ x: 0, y: 0 }) }
  const zoom100 = () => { setViewScale(scale > 0 ? 1 / scale : 1); setPan({ x: 0, y: 0 }) }

  // ─── Container: Mausrad (Cmd/Ctrl = Zoom, sonst vertikal pan) + Pan-Drag ─────
  // WICHTIG: per addEventListener({passive:false}) registriert (siehe Effekt unten),
  // damit e.preventDefault() den Browser-/Seiten-Zoom (Trackpad-Pinch = ctrl+wheel)
  // zuverlässig unterbindet. Der React-onWheel-Prop wäre passiv → Seite würde mitzoomen.
  function onContainerWheel(e) {
    const el = containerRef.current
    if (!el) return
    e.preventDefault(); e.stopPropagation()
    if (e.ctrlKey || e.metaKey) {
      // Zoom GENAU auf den Cursor. Der Stage-Wrapper ist im Container zentriert
      // (flex center) + um `pan` verschoben. Die Artboard-Top-Left liegt bei
      //   artLeft = containerMitte − dispArt/2 + pan   (das CANVAS_PAD hebt sich raus).
      // Wir halten den Bühnen-Punkt unter dem Cursor invariant.
      const rect = el.getBoundingClientRect()
      const Cx = rect.width / 2, Cy = rect.height / 2
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const oldEff = scale * viewScale
      if (!(oldEff > 0)) return
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const nv = clampZoom(viewScale * factor)
      const newEff = scale * nv
      const oldDx = stageSize.width * oldEff, oldDy = stageSize.height * oldEff
      const newDx = stageSize.width * newEff, newDy = stageSize.height * newEff
      // Bühnen-Punkt unter Cursor (vor Zoom):
      const sx = (mx - (Cx - oldDx / 2 + pan.x)) / oldEff
      const sy = (my - (Cy - oldDy / 2 + pan.y)) / oldEff
      // Neues pan, damit derselbe Punkt unter dem Cursor bleibt:
      const panX = mx - Cx + newDx / 2 - sx * newEff
      const panY = my - Cy + newDy / 2 - sy * newEff
      setViewScale(nv)
      setPan({ x: panX, y: panY })
    } else {
      // Rad allein = vertikal pan (Shift = horizontal). Verschiebt den Stage-Wrapper.
      if (e.shiftKey) setPan(p => ({ x: p.x - e.deltaY, y: p.y }))
      else setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }
  // Non-passiven Wheel-Listener registrieren (preventDefault wirkt sonst nicht →
  // Browser zoomt die ganze App). Handler-Ref wird je Render aktualisiert, damit
  // er stets die aktuellen pan/viewScale/scale-Werte sieht.
  const wheelHandlerRef = useRef(null)
  wheelHandlerRef.current = onContainerWheel
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const h = (e) => { if (wheelHandlerRef.current) wheelHandlerRef.current(e) }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])
  function onContainerMouseDown(e) {
    if (spaceDownRef.current) {
      e.preventDefault()
      panDragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
      setIsPanning(true)
      return
    }
    // Klick auf die graue Fläche NEBEN dem Artboard (nicht auf das Canvas/Stage) →
    // Auswahl + Verzerren-Modus lösen. Sonst bleibt das Element "hängen".
    if (!aiMode && !cropMode && e.target === containerRef.current) {
      if (editingTextId) commitTextEdit()
      setSelectedIds([])
      setDistortId(null)
      setQuadEditId(null)
    }
  }
  function onContainerMouseMove(e) {
    if (!panDragRef.current) return
    const d = panDragRef.current
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) })
  }
  function onContainerMouseUp() {
    if (panDragRef.current) { panDragRef.current = null; setIsPanning(false) }
  }
  // Drag&Drop auf den Canvas: (a) Bibliotheks-Element (Icon/Grafik/Foto/Upload/Medium)
  // per _designerDrag-Payload, (b) Betriebssystem-Datei. Über einem Rahmen/Mockup
  // landet das Bild direkt darin (cover-fill), sonst an der Drop-Position.
  function onContainerDragOver(e) { if (_designerDrag || (e.dataTransfer?.types && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0)) e.preventDefault() }
  function frameAtContentPoint(cx, cy) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i]
      if ((o.type !== 'frame' && o.type !== 'mockup') || o.hidden || o.locked) continue
      const x = o.x || 0, y = o.y || 0, w = o.width || 0, h = o.height || 0
      if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) return o
    }
    return null
  }
  function dropContentPoint(e) {
    const stage = stageRef.current
    if (!stage) return null
    try { stage.setPointersPositions(e.nativeEvent || e) } catch (_e) {}
    return stagePoint()
  }
  function onContainerDrop(e) {
    e.preventDefault()
    const payload = _designerDrag; _designerDrag = null
    if (payload) {
      const p = dropContentPoint(e)
      const frame = p ? frameAtContentPoint(p.x, p.y) : null
      const opts = frame ? { frameId: frame.id } : (p ? { at: { x: p.x, y: p.y } } : {})
      if (payload.k === 'dataurl' && payload.dataUrl) addImageFromDataUrl(payload.dataUrl, payload.meta || {}, opts)
      else if (payload.k === 'stock' && payload.large) { setSavedMsg('Bild wird eingefügt…'); photoToDataUrl(payload.large).then(du => { if (du) addImageFromDataUrl(du, {}, opts) }) }
      else if (payload.k === 'media' && payload.storagePath) insertMediaFromPath(payload.storagePath, opts)
      return
    }
    try {
      const file = e.dataTransfer?.files?.[0]
      if (file) onPickImageFile(file)
    } catch (_e) {}
  }

  // ─── Bild-Filter auf Bild-Objekt(e) anwenden (Konva.Filters) ───────────────
  // WHITEBOARD: Filter gelten für das/die Bild-Objekt(e). Auswahl-Logik:
  //   - genau 1 Bild-Objekt ausgewählt → nur dieses
  //   - sonst (nichts / mehreres ausgewählt) → ALLE Bild-Objekte
  // Diese Auswahl wird hier auch beim Anwenden gespiegelt.
  function filterTargetIds() {
    if (selected && selected.type === 'image') return [selected.id]
    return objects.filter(o => o.type === 'image').map(o => o.id)
  }
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const targets = new Set(filterTargetIds())
    const allImg = objects.filter(o => o.type === 'image')
    try {
      for (const o of allImg) {
        const node = stage.findOne('#' + o.id)
        if (!node) continue
        if (targets.has(o.id)) {
          const active = []
          if (filters.brightness) active.push(Konva.Filters.Brighten)
          if (filters.contrast) active.push(Konva.Filters.Contrast)
          if (filters.saturation || filters.hue || filters.grayscale) active.push(Konva.Filters.HSL)
          if (filters.grayscale) active.push(Konva.Filters.Grayscale)
          if (filters.enhance) active.push(Konva.Filters.Enhance)
          if (filters.warmth) active.push(WarmthFilter)
          if (filters.tint) active.push(TintFilter)
          if (filters.sepia) active.push(SepiaFilter)
          if (filters.invert) active.push(Konva.Filters.Invert)
          if (filters.noise) active.push(Konva.Filters.Noise)
          if (filters.blur) active.push(Konva.Filters.Blur)
          if (filters.pixelate) active.push(Konva.Filters.Pixelate)
          if (filters.vignette) active.push(VignetteFilter)
          node.filters(active)
          node.brightness(filters.brightness || 0)
          node.contrast(filters.contrast || 0)
          node.saturation(filters.saturation || 0)
          node.hue(filters.hue || 0)
          node.enhance(filters.enhance || 0)
          node.noise(filters.noise || 0)
          node.blurRadius(filters.blur || 0)
          node.pixelSize(Math.max(1, Math.round(filters.pixelate || 1)))
          // Custom-Filter-Stärken als Node-Attribute durchreichen.
          node.setAttr('fWarmth', filters.warmth || 0)
          node.setAttr('fTint', filters.tint || 0)
          node.setAttr('fSepia', filters.sepia ? 1 : 0)
          node.setAttr('fVignette', filters.vignette || 0)
          if (active.length) { node.cache() } else { node.clearCache() }
        } else {
          node.filters([]); node.clearCache()
        }
      }
      stage.getLayers().forEach(l => l.batchDraw())
    } catch (e) { /* Filter-Fehler ignorieren, Bild bleibt sichtbar */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, objects, selectedIds, baseCrop, stageSize])

  // ─── Transformer an Selektion binden ───────────────────────────────────────
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    try {
      if (!selectedIds.length || editingTextId || cropMode || aiMode) { tr.nodes([]); tr.getLayer()?.batchDraw(); return }
      const nodes = selectedIds.map(id => stage.findOne('#' + id)).filter(Boolean)
      tr.nodes(nodes)
      tr.getLayer()?.batchDraw()
    } catch (_e) { /* noop */ }
  }, [selectedIds, objects, editingTextId, cropMode, aiMode])

  // Verzerren-Modus verlassen, sobald die Auswahl wechselt (anderes/keins/mehrere
  // Objekte) — er gilt immer nur für das eine doppelgeklickte Objekt.
  useEffect(() => {
    if (distortId && !(selectedIds.length === 1 && selectedIds[0] === distortId)) setDistortId(null)
    if (quadEditId && !(selectedIds.length === 1 && selectedIds[0] === quadEditId)) setQuadEditId(null)
  }, [selectedIds, distortId, quadEditId])

  // ─── Rechtsklick: Kontextmenü öffnen ───────────────────────────────────────
  // Wir hängen den Konva-'contextmenu'-Handler an die Stage. Klick auf ein Objekt
  // wählt es (falls nötig) aus und zeigt Objekt-Aktionen; Klick auf leere Fläche
  // zeigt 'Einfügen'/'Alles auswählen'. Position relativ zur Canvas-Fläche.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const handler = (e) => {
      try {
        e.evt.preventDefault()
        if (cropMode || aiMode) return
        const cont = containerRef.current
        const rect = cont ? cont.getBoundingClientRect() : { left: 0, top: 0 }
        const x = (e.evt.clientX || 0) - rect.left
        const y = (e.evt.clientY || 0) - rect.top
        // Ziel-Objekt finden — der Klick kann auf einem Kind liegen (z.B. Bild im
        // Rahmen/Mockup), dessen Objekt-ID am Group-Vorfahren hängt → Vorfahren hochlaufen.
        let tnode = e.target
        let tgtId = tnode && tnode.attrs ? tnode.attrs.id : null
        let guard = 0
        while (tnode && tnode !== stage && guard++ < 12 && (!tgtId || tgtId === '__bg__' || tgtId === '__bgfill__' || !objects.find(o => o.id === tgtId))) {
          tnode = tnode.getParent ? tnode.getParent() : null
          tgtId = tnode && tnode.attrs ? tnode.attrs.id : null
        }
        const obj = objects.find(o => o.id === tgtId)
        if (!obj) {
          setCtxMenu({ x, y, objId: null })
        } else {
          setSelectedIds(prev => prev.includes(obj.id) ? prev : [obj.id])
          setCtxMenu({ x, y, objId: obj.id })
        }
      } catch (_e) { /* noop */ }
    }
    stage.on('contextmenu', handler)
    return () => { try { stage.off('contextmenu', handler) } catch (_e) {} }
  }, [objects, cropMode, aiMode])

  // Kontextmenü schließen bei Esc / Scroll / Fenster-Resize.
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    const onKey = (e) => { if (e.key === 'Escape') setCtxMenu(null) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  // ─── Bild-Objekte: HTMLImageElement nachladen (z.B. nach Restore) ───────────
  useEffect(() => {
    const need = new Set()
    objects.forEach(o => {
      if ((o.type === 'image' || o.type === 'frame' || o.type === 'mockup') && o.src && !imgCache[o.src]) need.add(o.src)
      if (o.type === 'mockup' && o.photoSrc && !imgCache[o.photoSrc]) need.add(o.photoSrc)
    })
    if (!need.size) return
    let cancelled = false
    need.forEach(url => {
      const img = new window.Image()
      img.onload = () => { if (!cancelled) setImgCache(prev => ({ ...prev, [url]: img })) }
      img.onerror = () => {}
      img.src = url
    })
    return () => { cancelled = true }
  }, [objects, imgCache])

  // ─── Perspektivische Mockups: gewarptes Screen-Canvas bauen/cachen ──────────
  useEffect(() => {
    const quadMocks = objects.filter(o => o.type === 'mockup' && o.src && mockupQuad(o) && imgCache[o.src])
    if (!quadMocks.length) return
    let changed = false
    const next = { ...warpCache }
    for (const o of quadMocks) {
      const key = warpKey(o)
      if (next[key]) continue
      try {
        const quad = mockupQuad(o)
        const ss = Math.max(1, Math.min(2, 1200 / Math.max(o.width || 1, o.height || 1)))
        next[key] = warpImageToCanvas(imgCache[o.src], quad, o.width, o.height, { panX: o.panX, panY: o.panY, ss, grid: 14 })
        changed = true
      } catch (_e) { /* Warp-Fehler ignorieren, Platzhalter bleibt */ }
    }
    if (changed) setWarpCache(next)
  }, [objects, imgCache, warpCache])

  // ─── History-Helfer ────────────────────────────────────────────────────────
  const snapshot = useCallback(() => ({
    objects: JSON.parse(JSON.stringify(objects)),
    filters: { ...filters },
    baseCrop: baseCrop ? { ...baseCrop } : null,
    bgColor,
    bgGrad,
    stageSize: { ...stageSize },
  }), [objects, filters, baseCrop, bgColor, bgGrad, stageSize])

  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current) return
    try {
      historyRef.current.push(snapshot())
      if (historyRef.current.length > 60) historyRef.current.shift()
      futureRef.current = []
    } catch (_e) { /* noop */ }
  }, [snapshot])

  // B6: Pro Interaktion (Slider-Zug, Color-/Number-Input) nur EINMAL snapshotten.
  // commitHistoryOnce() beim Interaktions-START (onMouseDown/onFocus/erstes onChange),
  // endInteraction() bei pointerup/blur → 1 Zug = 1 Undo-Schritt.
  const commitHistoryOnce = useCallback(() => {
    if (interactionOpenRef.current) return
    interactionOpenRef.current = true
    pushHistory()
  }, [pushHistory])
  const endInteraction = useCallback(() => { interactionOpenRef.current = false }, [])

  const applyState = (st) => {
    skipHistoryRef.current = true
    setObjects(st.objects || [])
    setFilters({ ...EMPTY_FILTERS, ...(st.filters || {}) })
    setBaseCrop(st.baseCrop || null)
    if (st.bgColor !== undefined) setBgColor(st.bgColor)
    if (st.bgGrad !== undefined) setBgGrad(st.bgGrad)
    if (st.stageSize) setStageSize(st.stageSize)
    setSelectedIds([])
    setTimeout(() => { skipHistoryRef.current = false }, 0)
  }

  const undo = useCallback(() => {
    if (!historyRef.current.length) return
    const cur = snapshot()
    const prev = historyRef.current.pop()
    futureRef.current.push(cur)
    applyState(prev)
  }, [snapshot])

  const redo = useCallback(() => {
    if (!futureRef.current.length) return
    const cur = snapshot()
    const nxt = futureRef.current.pop()
    historyRef.current.push(cur)
    applyState(nxt)
  }, [snapshot])

  // B13: Ist der Designer aktiv/sichtbar? (Stage-Container im DOM sichtbar)
  const isDesignerActive = useCallback(() => {
    const el = activeRef.current
    if (!el) return false
    try {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && el.offsetParent !== null
    } catch (_e) { return false }
  }, [])

  // Keyboard: Undo/Redo + Löschen + Duplizieren/Copy/Paste + Nudge + Esc
  // B13: nur wenn Designer aktiv UND Fokus NICHT in input/textarea/contentEditable.
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable
      if (!isDesignerActive()) return
      const mod = e.metaKey || e.ctrlKey
      // Undo/Redo dürfen auch beim Tippen NICHT in fremde Felder greifen.
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return
        e.preventDefault(); if (e.shiftKey) redo(); else undo(); return
      }
      if (mod && e.key.toLowerCase() === 'y') { if (typing) return; e.preventDefault(); redo(); return }
      if (typing || editingTextId) return
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return }
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected(); return }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelectedIds(objects.map(o => o.id)); return }
      if (e.key === 'Escape') { if (copyStyleRef.current) { copyStyleRef.current = null; setCopyStyleActive(false) } setSelectedIds([]); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault(); deleteSelected(); return
      }
      // Pfeiltasten-Nudge: 1px, Shift = 10px
      if (selectedIds.length && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        let dx = 0, dy = 0
        if (e.key === 'ArrowUp') dy = -step
        else if (e.key === 'ArrowDown') dy = step
        else if (e.key === 'ArrowLeft') dx = -step
        else if (e.key === 'ArrowRight') dx = step
        nudgeSelected(dx, dy)
        // Bei EINZEL-Auswahl: nach dem Nudge prüfen, ob eine Kante/Mitte nah an einer
        // Guide-Linie liegt → kleine Snap-Korrektur + transiente Hilfslinie. Enge
        // Toleranz (SNAP_PX/2) verhindert „Kleben“: ein weiterer Schritt entfernt das
        // Objekt wieder, da der Nudge selbst es aus der Snap-Zone heraus bewegt.
        if (selectedIds.length === 1) {
          const sid = selectedIds[0]
          // Konva-State erst nach dem React-Re-Render aktuell → im nächsten Tick lesen.
          requestAnimationFrame(() => {
            const snap = snapAfterNudge(sid, dx, dy)
            if (snap.dx || snap.dy) {
              // Delta auf den AKTUELLEN (post-nudge) State anwenden, nicht auf die
              // veraltete Closure — sonst geht der Nudge-Versatz verloren.
              setObjects(prev => prev.map(o => o.id === sid ? { ...o, x: (o.x || 0) + snap.dx, y: (o.y || 0) + snap.dy } : o))
            }
          })
        }
        return
      }
      // Leertaste → Pan-Modus aktivieren (Cursor: grab)
      if (e.code === 'Space') { e.preventDefault(); spaceDownRef.current = true; setSpaceActive(true) }
    }
    function onKeyUp(e) {
      if (e.code === 'Space') { spaceDownRef.current = false; setSpaceActive(false); panDragRef.current = null; setIsPanning(false) }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, selectedIds, editingTextId, objects, isDesignerActive])

  // Globaler pointerup/blur → laufende Interaktion (Slider/Color) abschließen.
  useEffect(() => {
    const end = () => endInteraction()
    window.addEventListener('pointerup', end)
    window.addEventListener('mouseup', end)
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('mouseup', end) }
  }, [endInteraction])

  // ─── Objekt-Mutationen ─────────────────────────────────────────────────────
  function addObject(obj) {
    pushHistory()
    const o = { id: nextId(), ...obj }
    setObjects(prev => [...prev, o])
    setSelectedId(o.id)
  }
  function updateObject(id, patch, withHistory = true) {
    if (withHistory) pushHistory()
    setObjects(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  }
  function deleteSelected() {
    if (!selectedIds.length) return
    pushHistory()
    const ids = new Set(selectedIds)
    setObjects(prev => prev.filter(o => !ids.has(o.id)))
    setSelectedIds([])
  }
  function nudgeSelected(dx, dy) {
    if (!selectedIds.length) return
    commitHistoryOnce()
    const ids = new Set(selectedIds)
    setObjects(prev => prev.map(o => ids.has(o.id) ? { ...o, x: (o.x || 0) + dx, y: (o.y || 0) + dy } : o))
  }
  // Klone der Selektion mit kleinem Offset + neuen IDs.
  function cloneObjects(srcIds, offset = 24) {
    const ids = new Set(srcIds)
    const clones = objects.filter(o => ids.has(o.id)).map(o => {
      const c = JSON.parse(JSON.stringify(o))
      c.id = nextId()
      c.x = (c.x || 0) + offset
      c.y = (c.y || 0) + offset
      return c
    })
    return clones
  }
  function duplicateSelected() {
    if (!selectedIds.length) return
    pushHistory()
    const clones = cloneObjects(selectedIds)
    setObjects(prev => [...prev, ...clones])
    setSelectedIds(clones.map(c => c.id))
  }
  // Spiegeln (horizontal/vertikal). Bilder/Icons: Pixel werden gespiegelt (robust,
  // überlebt Transforms). Andere Objekte: flipX/flipY-Flag (Scale-Sign im Render).
  function flipSelected(axis) {
    if (!selectedIds.length) return
    pushHistory()
    const ids = new Set(selectedIds)
    objects.filter(o => ids.has(o.id)).forEach(o => {
      if (o.type === 'image' && o.src && imgCache[o.src]) {
        try {
          const el = imgCache[o.src]
          const cw = el.naturalWidth || el.width || o.width || 100
          const ch = el.naturalHeight || el.height || o.height || 100
          const c = document.createElement('canvas'); c.width = cw; c.height = ch
          const ctx = c.getContext('2d')
          ctx.translate(axis === 'x' ? cw : 0, axis === 'y' ? ch : 0)
          ctx.scale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1)
          ctx.drawImage(el, 0, 0)
          const url = c.toDataURL('image/png')
          const img = new window.Image()
          img.onload = () => setImgCache(prev => ({ ...prev, [url]: img }))
          img.src = url
          updateObject(o.id, { src: url }, false)
        } catch (_e) {}
      } else {
        const key = axis === 'x' ? 'flipX' : 'flipY'
        updateObject(o.id, { [key]: !o[key] }, false)
      }
    })
  }
  function copySelected() {
    if (!selectedIds.length) return
    clipboardRef.current = objects.filter(o => selectedIds.includes(o.id)).map(o => JSON.parse(JSON.stringify(o)))
  }
  function pasteClipboard() {
    const buf = clipboardRef.current
    if (!buf || !buf.length) return
    pushHistory()
    const clones = buf.map(o => {
      const c = JSON.parse(JSON.stringify(o))
      c.id = nextId()
      c.x = (c.x || 0) + 28
      c.y = (c.y || 0) + 28
      return c
    })
    setObjects(prev => [...prev, ...clones])
    setSelectedIds(clones.map(c => c.id))
    // Folge-Paste leicht weiter versetzen
    clipboardRef.current = clones.map(c => JSON.parse(JSON.stringify(c)))
  }

  const selected = objects.find(o => o.id === selectedId) || null

  // ─── Aktives Bild-Objekt für KI / Filter / Crop ─────────────────────────────
  // Ein ausgewähltes Bild-Objekt hat Vorrang, sonst das primäre (importierte) Bild.
  const activeImageObj = useCallback(() => {
    if (selected && selected.type === 'image') return selected
    const pid = primaryImageIdRef.current
    if (pid) { const p = objects.find(o => o.id === pid); if (p) return p }
    return objects.find(o => o.type === 'image') || null
  }, [selected, objects])

  // ─── Brand-Identität (Markenkits) laden ─────────────────────────────────────
  // Company Brand → nur das EIGENE Kit (Farben, Logos, Schriften).
  // Personal Brand → die Kits ALLER Company-Brands des Teams (untereinander).
  useEffect(() => {
    let cancelled = false
    const bv = activeBrandVoice
    const bvId = bv?.id
    if (!bvId) { setBrandData(null); setBrandFontFamilies([]); return }
    setBrandLoading(true)
    const isCompany = bv?.account_type === 'company_page'
    const signLogos = async (logoPaths) => {
      const logos = []
      for (const p of (Array.isArray(logoPaths) ? logoPaths : [])) {
        try {
          const { data: s } = await supabase.storage.from('visuals').createSignedUrl(p, 60 * 60 * 24)
          if (s?.signedUrl) logos.push({ path: p, url: s.signedUrl })
        } catch (_e) {}
      }
      return logos
    }
    const kitFromRow = async (row) => ({
      id: row.id,
      name: row.name || 'Marke',
      palette: Array.isArray(row?.visual_color_palette) ? row.visual_color_palette : [],
      logos: await signLogos(row?.logo_paths),
      fonts: Array.isArray(row?.font_assets) ? row.font_assets : [],
    })
    ;(async () => {
      try {
        if (isCompany) {
          const { data: row } = await supabase.from('brand_voices')
            .select('name, logo_paths, ci_image_paths, font_assets, visual_color_palette')
            .eq('id', bvId).maybeSingle()
          if (cancelled) return
          const kit = await kitFromRow({ ...(row || {}), id: bvId })
          if (cancelled) return
          setBrandData({ palette: kit.palette, logos: kit.logos, fonts: kit.fonts })
          let families = []
          try { families = await loadBrandFonts(kit.fonts) } catch (_e) {}
          if (!cancelled) setBrandFontFamilies(families || [])
        } else {
          // Personal Brand → alle Company-Brands des Teams
          let q = supabase.from('brand_voices')
            .select('id, name, logo_paths, font_assets, visual_color_palette, account_type, team_id')
            .eq('account_type', 'company_page')
            .order('name', { ascending: true })
          if (teamId) q = q.eq('team_id', teamId)
          const { data: rows } = await q
          if (cancelled) return
          const companies = []
          for (const r of (rows || [])) { companies.push(await kitFromRow(r)) }
          if (cancelled) return
          setBrandData({ companies })
          const allFonts = companies.flatMap(c => c.fonts || [])
          let families = []
          try { families = await loadBrandFonts(allFonts) } catch (_e) {}
          if (!cancelled) setBrandFontFamilies(families || [])
        }
      } catch (_e) {
        if (!cancelled) { setBrandData(null); setBrandFontFamilies([]) }
      } finally {
        if (!cancelled) setBrandLoading(false)
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandVoice?.id, activeBrandVoice?.account_type, teamId])

  // ─── Medien-Bibliothek laden (beim Öffnen des Medien-Tabs) ──────────────────
  useEffect(() => {
    if (activeTool !== 'uploads') return
    if (mediaLoadedRef.current) return
    mediaLoadedRef.current = true
    let cancelled = false
    setMediaLoading(true)
    ;(async () => {
      try {
        const { data } = await listTeamVisuals({ teamId, brandVoiceId: activeBrandVoice?.id, limit: 80 })
        const items = (data || [])
        // Parallel + serverseitig verkleinert (statt 80 sequentielle Voll-Bild-Signaturen).
        const signed = await Promise.all(items.map(v => signedVisualUrl(v.storage_path, 3600)))
        const withUrls = items.map((v, i) => signed[i] ? { id: v.id, url: signed[i], storage_path: v.storage_path } : null).filter(Boolean)
        if (!cancelled) setMediaLib(withUrls)
      } catch (_e) { if (!cancelled) setMediaLib([]) }
      finally { if (!cancelled) setMediaLoading(false) }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, activeBrandVoice?.id, teamId])
  // Bei Brand-Wechsel Medien-Bibliothek invalidieren.
  useEffect(() => { mediaLoadedRef.current = false; setMediaLib([]) }, [activeBrandVoice?.id])

  // Stage-Center in Bühnenkoordinaten (zum Platzieren neuer Objekte)
  const center = () => {
    const cw = (baseCrop?.width || stageSize.width)
    const ch = (baseCrop?.height || stageSize.height)
    return { x: cw / 2, y: ch / 2 }
  }

  function addText() {
    const c = center()
    addObject({ type: 'text', x: c.x - 120, y: c.y - 24, text: 'Doppelklick zum Bearbeiten',
      fontSize: 44, fontFamily: 'Inter', fill: bgColor ? '#111827' : '#ffffff', fontStyle: 'normal', align: 'left', width: 360,
      rotation: 0, scaleX: 1, scaleY: 1 })
  }
  function addFrame(shapeId) {
    const c = center()
    const s = Math.round(Math.min(stageSize.width, stageSize.height) * 0.42)
    addObject({ type: 'frame', shape: shapeId, x: c.x - s / 2, y: c.y - s / 2, width: s, height: s, rotation: 0, opacity: 1 })
  }
  function addCollage(layoutId) {
    const lay = COLLAGE_LAYOUTS.find(l => l.id === layoutId); if (!lay) return
    const cw = (baseCrop?.width || stageSize.width), ch = (baseCrop?.height || stageSize.height)
    const margin = Math.round(Math.min(cw, ch) * 0.06)
    const bx = margin, by = margin, bw = cw - margin * 2, bh = ch - margin * 2
    const gap = Math.max(6, Math.round(Math.min(bw, bh) * 0.018))
    const frames = lay.cells.map(cell => ({
      id: nextId(), type: 'frame', shape: 'rect',
      x: Math.round(bx + cell[0] * bw + gap / 2),
      y: Math.round(by + cell[1] * bh + gap / 2),
      width: Math.round(cell[2] * bw - gap),
      height: Math.round(cell[3] * bh - gap),
      rotation: 0, opacity: 1,
    }))
    pushHistory()
    setObjects(prev => [...prev, ...frames])
    setSelectedIds(frames.length ? [frames[0].id] : [])
  }
  function warpKey(o) { const q = o.kind === 'photo' && o.quadFrac ? o.quadFrac.map(p => `${p.u.toFixed(3)},${p.v.toFixed(3)}`).join(';') : ''; return `${o.id}|${o.device || o.kind}|${o.src || ''}|${Math.round(o.width)}x${Math.round(o.height)}|${o.panX == null ? 0.5 : o.panX}|${o.panY == null ? 0.5 : o.panY}|${q}` }
  function setQuadCorner(id, idx, u, v) {
    setObjects(prev => prev.map(o => {
      if (o.id !== id) return o
      const qf = (o.quadFrac ? o.quadFrac.slice() : DEFAULT_PHOTO_QUAD.map(p => ({ ...p })))
      qf[idx] = { u, v }
      return { ...o, quadFrac: qf }
    }))
  }
  function addMockup(deviceId) {
    const dev = deviceById(deviceId); if (!dev) return
    const cw = (baseCrop?.width || stageSize.width), ch = (baseCrop?.height || stageSize.height)
    let w = Math.round(Math.min(cw, ch) * 0.6), h = Math.round(w / dev.aspect)
    if (h > ch * 0.9) { h = Math.round(ch * 0.9); w = Math.round(h * dev.aspect) }
    const c = center()
    addObject({ type: 'mockup', device: deviceId, x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), width: w, height: h, rotation: 0, opacity: 1 })
  }
  function addRect() {
    const c = center()
    addObject({ type: 'rect', x: c.x - 80, y: c.y - 50, width: 160, height: 100, fill: 'rgba(49,90,231,0.85)', stroke: '#ffffff', strokeWidth: 0, rotation: 0 })
  }
  function addEllipse() {
    const c = center()
    addObject({ type: 'ellipse', x: c.x, y: c.y, radiusX: 90, radiusY: 90, fill: 'rgba(48,160,208,0.85)', stroke: '#ffffff', strokeWidth: 0, rotation: 0 })
  }
  function addLine() {
    const c = center()
    addObject({ type: 'line', x: c.x - 110, y: c.y, points: [0, 0, 220, 0], stroke: '#ffffff', strokeWidth: 6, rotation: 0 })
  }
  function addArrow() {
    const c = center()
    addObject({ type: 'arrow', x: c.x - 110, y: c.y, points: [0, 0, 220, 0], stroke: '#ffffff', fill: '#ffffff', strokeWidth: 6, pointerLength: 18, pointerWidth: 18, rotation: 0 })
  }
  // Asset aus der Asset-Bibliothek einfügen: gefüllte Silhouette in Primary-Farbe.
  function addAsset(asset) {
    const c = center()
    const target = Math.min(stageSize.width, stageSize.height) * 0.42
    const sc = target / 100
    addObject({ type: 'sticker', d: asset.d, x: c.x - (50 * sc), y: c.y - (50 * sc), scaleX: sc, scaleY: sc,
      fill: PRGB, stroke: '#000000', strokeWidth: 0, rotation: 0 })
  }

  // Vorgefertigtes Text-Objekt einfügen (Textstil-Preset: Überschrift/Unterüberschrift/Fließtext).
  // Wenn ein Text-Objekt ausgewählt ist, wird stattdessen dessen Stil angepasst (kein Neueinfügen).
  const TEXT_STYLES = {
    heading:   { text: 'Überschrift', fontSize: 88, fontStyle: 'bold', fontFamily: 'Inter' },
    subheading:{ text: 'Unterüberschrift', fontSize: 52, fontStyle: 'bold', fontFamily: 'Inter' },
    body:      { text: 'Fließtext — hier deinen Inhalt schreiben.', fontSize: 34, fontStyle: 'normal', fontFamily: 'Inter' },
    kicker:    { text: 'LABEL / KICKER', fontSize: 30, fontStyle: 'bold', fontFamily: 'Inter', letterSpacing: 4 },
    quote:     { text: '„Ein starkes Zitat."', fontSize: 60, fontStyle: 'italic', fontFamily: 'Georgia' },
  }
  function addTextPreset(preset) {
    const cfg = TEXT_STYLES[preset] || TEXT_STYLES.body
    // Ausgewähltes Text-Objekt vorhanden? → nur Stil setzen.
    if (selectedIds.length === 1) {
      const sel = objects.find(o => o.id === selectedIds[0])
      if (sel && sel.type === 'text') {
        commitHistoryOnce()
        updateObject(sel.id, { fontSize: cfg.fontSize, fontStyle: cfg.fontStyle, fontFamily: cfg.fontFamily, letterSpacing: cfg.letterSpacing || 0 }, false)
        endInteraction()
        return
      }
    }
    const c = center()
    addObject({ type: 'text', x: c.x - 240, y: c.y - cfg.fontSize / 2, text: cfg.text,
      fontSize: cfg.fontSize, fontFamily: cfg.fontFamily || 'Inter', fill: bgColor ? '#111827' : '#ffffff',
      fontStyle: cfg.fontStyle, align: 'left', width: 480, letterSpacing: cfg.letterSpacing || 0, rotation: 0 })
  }

  // Schrift-Kombination einfügen: Überschrift + Subline als abgestimmtes Paar.
  function addTextCombo(combo) {
    const cfg = TEXT_COMBOS.find(x => x.id === combo) || TEXT_COMBOS[0]
    const pal = isDarkBg(bgColor) ? cfg.dark : cfg.light
    const c = center(); const x = c.x - 300, w = 600
    let y = c.y - 155
    if (cfg.kicker) {
      addObject({ type: 'text', x, y, text: cfg.kicker, fontSize: 26, fontFamily: cfg.kickerFont || 'Inter', fill: pal.kicker, fontStyle: 'bold', align: 'left', width: w, letterSpacing: 3, rotation: 0 })
      y += 42
    }
    addObject({ type: 'text', x, y, text: cfg.head, fontSize: 82, fontFamily: cfg.headFont, fill: pal.head, fontStyle: cfg.headStyle || 'bold', align: 'left', width: w, letterSpacing: 0, rotation: 0 })
    y += 112
    addObject({ type: 'text', x, y, text: cfg.sub, fontSize: 34, fontFamily: cfg.subFont, fill: pal.sub, fontStyle: 'normal', align: 'left', width: w, lineHeight: 1.3, rotation: 0 })
    try { loadGoogleFont(cfg.headFont); loadGoogleFont(cfg.subFont); if (cfg.kickerFont) loadGoogleFont(cfg.kickerFont) } catch (_e) {}
  }

  // ─── Bild-Upload als Overlay-Objekt (type:'image') ─────────────────────────
  // Dekodiert die Datei zu einer DataURL, ermittelt die natürliche Größe und legt
  // ein image-Objekt an (auf max. ~50% der Bühne skaliert). HTMLImageElement wird
  // in imgCache gehalten und beim Render an die Konva-Image-Node gereicht.
  // ─── KI für die GANZE Seite ──────────────────────────────────────────────────
  // Schickt die editierbaren Elemente (Text/Formen/Bild-Geometrie) als JSON + den
  // Befehl an die generate-Edge-Function und wendet die zurückgegebenen Änderungen
  // an — Elemente bleiben editierbar (keine Pixel-Neugenerierung der ganzen Seite).
  async function runPageAiCommand(cmd) {
    const c = String(cmd || '').trim()
    if (!c || pageAiBusy) return
    setPageAiBusy(true)
    try {
      const cw = Math.round(baseCrop?.width || stageSize.width)
      const ch = Math.round(baseCrop?.height || stageSize.height)
      const slim = objects.filter(o => !o.hidden).map(o => {
        const b = { id: o.id, type: o.type, x: Math.round(o.x || 0), y: Math.round(o.y || 0), rotation: Math.round(o.rotation || 0), opacity: o.opacity == null ? 1 : o.opacity }
        if (o.type === 'text') Object.assign(b, { text: o.text, fontSize: o.fontSize, fontFamily: o.fontFamily, fill: o.fill, fontStyle: o.fontStyle || 'normal', align: o.align || 'left', width: Math.round(o.width || 360) })
        else if (o.type === 'rect') Object.assign(b, { width: Math.round(o.width || 0), height: Math.round(o.height || 0), fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth || 0, cornerRadius: o.cornerRadius || 0 })
        else if (o.type === 'ellipse') Object.assign(b, { radiusX: Math.round(o.radiusX || 0), radiusY: Math.round(o.radiusY || 0), fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth || 0 })
        else if (o.type === 'sticker') Object.assign(b, { fill: o.fill, hinweis: 'Icon/Form – nur Farbe/Position/Größe' })
        else if (o.type === 'image') Object.assign(b, { width: Math.round(o.width || 0), height: Math.round(o.height || 0), hinweis: 'Bild – Inhalt NICHT änderbar, nur Position/Größe' })
        return b
      })
      // Marken-/Personen-Kontext für den Agenten (Name, Farben, Schriften, Stil)
      const bv = activeBrandVoice || {}
      const brandName = bv.name || ''
      const _pal = Array.isArray(bv.visual_color_palette) ? bv.visual_color_palette : []
      const _bc = (bv.brand_colors && typeof bv.brand_colors === 'object') ? bv.brand_colors : null
      const brandColors = [_bc?.primary, _bc?.secondary, _bc?.accent, ...(Array.isArray(_bc?.additional) ? _bc.additional : []), ..._pal].filter(Boolean)
      const brandFonts = (bv.brand_fonts && typeof bv.brand_fonts === 'object') ? [bv.brand_fonts.primary, bv.brand_fonts.secondary].filter(Boolean) : []
      const brandCtx = [
        brandName ? `Name der Person/Marke (verwende genau diesen, wenn der Nutzer "mein Name"/"meinem Namen"/"mich" o.Ä. meint): "${brandName}"` : '',
        brandColors.length ? `Markenfarben (bevorzugt verwenden, Hex): ${brandColors.join(', ')}` : '',
        brandFonts.length ? `Marken-Schriften: ${brandFonts.join(', ')}` : '',
        bv.visual_style_description ? `Visueller Stil: ${bv.visual_style_description}` : '',
      ].filter(Boolean).join('\n')
      // Company-Marken (echte Corporate Identity: Farben, Schriften, Logos) aus brandData.
      const companyList = Array.isArray(brandData?.companies) ? brandData.companies
        : (brandData && (brandData.palette || brandData.logos || brandData.fonts) ? [{ name: brandName || 'Marke', palette: brandData.palette, logos: brandData.logos, fonts: brandData.fonts }] : [])
      const companyCtx = (companyList || []).filter(cc => cc && (((cc.palette||[]).length) || ((cc.logos||[]).length) || ((cc.fonts||[]).length))).map(cc => {
        const pal = (cc.palette || []).slice(0, 8).join(', ')
        const fnts = (cc.fonts || []).map(f => (f && (f.family || f.name)) || (typeof f === 'string' ? f : '')).filter(Boolean).slice(0, 4).join(', ')
        return `- "${cc.name}": ${pal ? 'Farben ' + pal + '. ' : ''}${fnts ? 'Schriften ' + fnts + '. ' : ''}${(cc.logos && cc.logos.length) ? 'Logo vorhanden (mit add_logo company:"' + cc.name + '" einfügen).' : 'kein Logo hinterlegt.'}`
      }).join('\n')

      const prompt = `Du bist ein agentischer Grafik-Design-Assistent und bearbeitest eine Design-Seite (Größe ${cw}x${ch} Pixel; Koordinaten = linke obere Ecke in Pixeln, bei Ellipse ist x,y der Mittelpunkt). Aktuelle Hintergrundfarbe: ${bgColor || 'transparent'}.

Aktuelle Elemente als JSON:
${JSON.stringify(slim)}

${brandCtx ? 'Marken-Kontext (Person):\n' + brandCtx + '\n\n' : ''}${companyCtx ? 'Company-Marken (ECHTE Corporate Identity — verwende deren echte Farben/Schriften/Logos; erfinde NIEMALS Marken-Claims, Taglines oder Logo-Texte):\n' + companyCtx + '\n\n' : ''}Nutzer-Befehl: "${c}"

Setze den Befehl vollständig und gestalterisch sauber um. Du DARFST: neue Elemente hinzufügen (z.B. eine Headline), bestehende ändern, löschen, den Hintergrund ändern und das Basisbild inhaltlich bearbeiten. Achte auf Lesbarkeit, Kontrast, sinnvolle Größen/Positionen und ein sauberes Layout.

WICHTIG – LAYOUT & PASSFORM (sonst wird Text abgeschnitten):
- Halte einen Sicherheitsrand von ca. 5% der Seitengröße zu ALLEN Kanten. Kein Element darf über den Rand hinausragen oder abgeschnitten werden.
- Jedes Text-Element MUSS eine 'width' bekommen, die ab seiner x-Position bis zum rechten Sicherheitsrand passt (width ≤ ${cw} − x − Rand). Text bricht innerhalb dieser Breite um.
- Wähle 'fontSize' so, dass der GESAMTE Text vollständig in diese width UND in die Seitenhöhe passt – lieber kleiner als abgeschnitten. Für Headlines auf ${cw}×${ch}px ist fontSize ≈ 6–9% der Seitenhöhe ein guter Startwert.
- Prüfe vor der Ausgabe jede Operation gedanklich: Passt der komplette Inhalt sichtbar auf die Seite? Wenn nicht, korrigiere Größe/Position/Breite.
- Farben immer als Hex #rrggbb. Bevorzuge Marken-Farben/Schriften, wenn vorhanden.
- Bei "Headline mit meinem Namen" o.Ä.: lege EIN neues Text-Element mit dem oben genannten Namen an, mit passender width (bis zum Rand) und einer fontSize, bei der der ganze Name sichtbar bleibt.

Farb-/Lesbarkeits-Regeln (SEHR WICHTIG, sonst unlesbar):
- Text braucht klaren Kontrast zum Untergrund. Heller Untergrund → dunkler Text; dunkler Untergrund → heller Text. NIE weißen Text auf hellem Foto/Hintergrund.
- Headline auf einem Foto: ZUERST einen deckenden Balken (add_rect, Markenfarbe oder dunkel) anlegen, DANN den Text (Text-Operation NACH dem Balken); der Text sitzt auf dem Balken.
- Marken-Farben bevorzugen, aber Lesbarkeit geht IMMER vor.

Bild-Befehle nach Absicht (NICHT verwechseln — das ist wichtig):
- Reine Farb-/Ton-/Helligkeits-Anpassungen (Schwarz-Weiß, Graustufen, entsättigen, heller, dunkler, mehr/weniger Kontrast, wärmer/kühler) → IMMER set_filter (z.B. {"grayscale":1}). Das ist ein nicht-destruktiver Filter — es wird NICHTS neu generiert. NIEMALS edit_image/remove_background dafür verwenden.
- Hintergrund entfernen / freistellen → remove_background (die Person bleibt erhalten, nur der Hintergrund wird transparent).
- Inhaltliche Bildänderung (andere Szene/Objekte/Perspektive) → edit_image.
- Hintergrund durch ein NEUES (generiertes) Bild ersetzen — z.B. "generiere ein Büro im Hintergrund", "setz mich vor einen anderen Hintergrund" → replace_background mit instruction. Die Person wird per Matting freigestellt UND der neue Hintergrund generiert und dahintergelegt — Person bleibt EXAKT erhalten. NICHT edit_image, NICHT set_background-Farbe.
- Logo einer Company-Marke einfügen → add_logo mit company="<Markenname>" (+ optional corner). Nutze IMMER das echte hinterlegte Logo, erzeuge NIEMALS ein Text-/Wortmarken-Logo.
- Fotos/Bilder ins Design holen, Moodboards, Bild-Collagen („Bilder von X", „Moodboard mit …") → add_stock_image mit konkreten (am besten englischen) Suchbegriffen. Das sind ECHTE Fotos aus der Stock-Datenbank (Pexels) — NICHT edit_image/generieren. Für ein Moodboard MEHRERE add_stock_image in einem sauberen Raster (z.B. 2x2 oder 3x2, kleine Abstände, füllen die Seite), dazu passende Hintergrundfarbe (set_background) und optional eine Überschrift. Beispiel-Suchbegriffe „sommerliches Frucht-/Natur-Moodboard": "fresh summer fruit", "citrus fruit", "berries", "watermelon", "green tropical leaves", "sunny nature".
- GRUNDPRINZIP: Nutze IMMER zuerst die eingebauten Designer-Funktionen (set_filter, remove_background, replace_background, add_logo — sie erhalten die Person/nutzen echte Assets). Nur edit_image erzeugt das Basisbild generativ NEU — ausschließlich für inhaltliche Änderungen am Motiv, die keine eingebaute Funktion leisten kann.

Gib AUSSCHLIESSLICH gültiges JSON zurück (kein Markdown, keine Erklärung, KEINE Kommentare, KEINE trailing commas, alle Klammern geschlossen) – Operationen in Ausführungsreihenfolge (Balken VOR zugehörigem Text):
{"operations":[
  {"op":"add_text","text":"...","x":<int>,"y":<int>,"fontSize":<int>,"fill":"#rrggbb","fontFamily":"Inter","fontStyle":"normal|bold|italic","align":"left|center|right","width":<int>},
  {"op":"add_rect","x":<int>,"y":<int>,"width":<int>,"height":<int>,"fill":"#rrggbb","cornerRadius":<int>},
  {"op":"add_ellipse","x":<int>,"y":<int>,"radiusX":<int>,"radiusY":<int>,"fill":"#rrggbb"},
  {"op":"update","id":"<vorhandene id>","props":{ ...nur zu ändernde Felder... }},
  {"op":"delete","id":"<vorhandene id>"},
  {"op":"set_background","color":"#rrggbb"},
  {"op":"set_filter","filters":{"grayscale":"0-1","contrast":"-50..50","brightness":"-1..1","saturation":"-1..1","sepia":"0-1"}},
  {"op":"remove_background"},
  {"op":"replace_background","instruction":"Beschreibung des neuen Hintergrunds, z.B. modernes helles Büro"},
  {"op":"add_stock_image","query":"<engl. Suchbegriff, z.B. fresh summer fruit>","x":<int>,"y":<int>,"width":<int>,"height":<int>,"orientation":"square|landscape|portrait"},
  {"op":"add_logo","company":"<Company-Markenname>","corner":"top-right|top-left|bottom-right|bottom-left"},
  {"op":"edit_image","instruction":"inhaltliche Bildänderung am Motiv"}
]}
Nutze nur die für den Befehl nötigen Operationen.`
      const genCall = supabase.functions.invoke('generate', { body: { type: 'raw', model: 'claude-sonnet-4-6', prompt } })
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung – bitte erneut versuchen')), 75000))
      const { data, error } = await Promise.race([genCall, timeout])
      if (error) throw new Error(error.message || 'KI fehlgeschlagen')
      let txt = String(data?.text || data?.content || data?.output || '').trim()
      txt = txt.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim()
      const a = txt.indexOf('{'), z = txt.lastIndexOf('}')
      if (a >= 0 && z > a) txt = txt.slice(a, z + 1)
      let parsed
      try { parsed = JSON.parse(txt) }
      catch (_pe1) {
        // Häufigster Fehler: trailing commas → entfernen und erneut versuchen.
        let rep = txt.replace(/,\s*([\]}])/g, '$1')
        try { parsed = JSON.parse(rep) }
        catch (_pe2) {
          // Abgeschnittenes JSON reparieren: bis zum letzten vollständigen '}' kürzen + Array/Objekt schließen.
          try {
            const oi = rep.indexOf('"operations"')
            const arrStart = oi >= 0 ? rep.indexOf('[', oi) : -1
            const lastClose = rep.lastIndexOf('}')
            if (arrStart > 0 && lastClose > arrStart) { parsed = JSON.parse(rep.slice(0, lastClose + 1) + ']}') }
          } catch (_pe3) {}
          if (!parsed) throw new Error('Die KI-Antwort war unvollständig/ungültig — bitte den Befehl etwas einfacher oder kürzer formulieren.')
        }
      }
      const ops = Array.isArray(parsed.operations) ? parsed.operations : (Array.isArray(parsed) ? parsed : [])
      if (!ops.length) throw new Error('Keine Änderungen erhalten')
      pushHistory()
      const clamp = (v, max) => Math.max(0, Math.min(Math.round(Number(v) || 0), max))
      const margin = Math.max(24, Math.round(Math.min(cw, ch) * 0.05))
      const fitText = (o) => {
        try {
          const text = String(o.text || ''); if (!text) return o
          const fontFamily = o.fontFamily || 'Inter'; const fontStyle = o.fontStyle || 'normal'; const align = o.align || 'left'
          let fontSize = Math.max(8, Math.round(Number(o.fontSize) || 48))
          let x = Math.max(margin, Math.min(Math.round(Number(o.x) || margin), cw - margin - 40))
          let width = Math.round(Number(o.width) || (cw - x - margin)); width = Math.max(40, Math.min(width, cw - x - margin))
          const longestWord = text.split(/\s+/).sort((a, b) => b.length - a.length)[0] || text
          for (let i = 0; i < 16; i++) {
            const node = new Konva.Text({ text, fontSize, fontFamily, fontStyle, width, align, lineHeight: 1.15 }); const h = node.height()
            const wnode = new Konva.Text({ text: longestWord, fontSize, fontFamily, fontStyle }); const wordW = wnode.width()
            try { node.destroy() } catch (_e) {} try { wnode.destroy() } catch (_e) {}
            const fits = wordW <= width && (Math.round(Number(o.y) || margin) + h) <= (ch - margin)
            if (fits || fontSize <= 8) break
            fontSize = Math.max(8, Math.round(fontSize * 0.86))
          }
          const fnode = new Konva.Text({ text, fontSize, fontFamily, fontStyle, width, align, lineHeight: 1.15 }); const fh = fnode.height(); try { fnode.destroy() } catch (_e) {}
          let y = Math.max(margin, Math.min(Math.round(Number(o.y) || margin), Math.max(margin, ch - margin - fh)))
          return { ...o, x, y, width, fontSize }
        } catch (_e) { return o }
      }
      const parseHex = (h) => { try { let s=String(h||'').trim().replace('#',''); if(s.length===3) s=s.split('').map(c=>c+c).join(''); if(s.length!==6||/[^0-9a-f]/i.test(s)) return null; return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)] } catch(_e){ return null } }
      const relLum = (rgb) => { if(!rgb) return null; const a=rgb.map(v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4) }); return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2] }
      const contrastRatio = (h1,h2) => { const l1=relLum(parseHex(h1)), l2=relLum(parseHex(h2)); if(l1==null||l2==null) return 21; const hi=Math.max(l1,l2), lo=Math.min(l1,l2); return (hi+0.05)/(lo+0.05) }
      const readableOn = (bgHex) => { const l=relLum(parseHex(bgHex)); return (l==null||l>0.5) ? '#111111' : '#FFFFFF' }
      const measureTextH = (o) => { try { const n=new Konva.Text({ text:String(o.text||''), fontSize:o.fontSize||40, fontFamily:o.fontFamily||'Inter', fontStyle:o.fontStyle||'normal', width:o.width||300, lineHeight:1.15 }); const h=n.height(); try{n.destroy()}catch(_e){} return h } catch(_e){ return (o.fontSize||40)*1.3 } }
      const ebbox = (o, th) => { if(o.type==='ellipse') return { x:(o.x||0)-(o.radiusX||0), y:(o.y||0)-(o.radiusY||0), w:2*(o.radiusX||0), h:2*(o.radiusY||0) }; return { x:o.x||0, y:o.y||0, w:o.width||0, h:(o.type==='text'?(th||measureTextH(o)):(o.height||0)) } }
      const centerInside = (t, e, th) => { const tb=ebbox(t,th), eb=ebbox(e); const cx=tb.x+tb.w/2, cy=tb.y+tb.h/2; return eb.w>0 && eb.h>0 && cx>=eb.x && cx<=eb.x+eb.w && cy>=eb.y && cy<=eb.y+eb.h }

      // Wendet eine Operations-Liste rein auf ein Objekt-Array an, inkl. Passform-,
      // Kontrast-, Scrim- und Ebenen-Leitplanken. Gibt neuen Zustand zurück (keine Seiteneffekte).
      const computeApplied = (opsList, baseObjects, baseBg) => {
        let arr = baseObjects.map(o => ({ ...o })); let bg = baseBg; let imgInstr = null; let cutout = false; let fPatch = null; let replaceBg = null; const logos = []; const stockImages = []
        for (const op of opsList) {
          const t = op && op.op
          if (t === 'add_text' && op.text) { const bx = clamp(op.x, cw); arr.push(fitText({ id: nextId(), type:'text', text:String(op.text), x: bx, y: clamp(op.y, ch), fontSize: Math.max(8, Math.round(Number(op.fontSize)) || 48), fontFamily: op.fontFamily || 'Inter', fill: op.fill || '#111111', fontStyle: op.fontStyle || 'normal', align: op.align || 'left', width: Math.round(Number(op.width)) || (cw - bx - margin), rotation:0, opacity:1 })) }
          else if (t === 'add_rect') { arr.push({ id: nextId(), type:'rect', x: clamp(op.x, cw), y: clamp(op.y, ch), width: Math.min(Math.round(Number(op.width)) || 200, cw), height: Math.min(Math.round(Number(op.height)) || 120, ch), fill: op.fill || '#315AE7', stroke: op.stroke || null, strokeWidth: Math.round(Number(op.strokeWidth)) || 0, cornerRadius: Math.round(Number(op.cornerRadius)) || 0, rotation:0, opacity:1 }) }
          else if (t === 'add_ellipse') { arr.push({ id: nextId(), type:'ellipse', x: clamp(op.x, cw), y: clamp(op.y, ch), radiusX: Math.round(Number(op.radiusX)) || 80, radiusY: Math.round(Number(op.radiusY)) || 80, fill: op.fill || '#315AE7', stroke: op.stroke || null, strokeWidth: Math.round(Number(op.strokeWidth)) || 0, rotation:0, opacity:1 }) }
          else if (t === 'update' && op.id && op.props && typeof op.props === 'object') { const allow = ['text','fontSize','fontFamily','fill','fontStyle','align','width','x','y','rotation','opacity','height','stroke','strokeWidth','cornerRadius','radiusX','radiusY']; const patch = {}; allow.forEach(k => { if (op.props[k] !== undefined && op.props[k] !== null) patch[k] = op.props[k] }); if (Object.keys(patch).length) arr = arr.map(o => o.id === op.id ? { ...o, ...patch } : o) }
          else if (t === 'delete' && op.id) { arr = arr.filter(o => o.id !== op.id) }
          else if (t === 'set_background' && op.color) { bg = op.color }
          else if (t === 'set_filter' && op.filters && typeof op.filters === 'object') { const fa = ['grayscale','contrast','brightness','saturation','sepia','hue','blur','invert','vignette','warmth','enhance']; const fp = {}; fa.forEach(k => { const v = Number(op.filters[k]); if (op.filters[k] !== undefined && op.filters[k] !== null && !isNaN(v)) fp[k] = v }); if (Object.keys(fp).length) fPatch = { ...(fPatch || {}), ...fp } }
          else if (t === 'remove_background') { cutout = true }
          else if (t === 'replace_background' && op.instruction) { replaceBg = String(op.instruction) }
          else if (t === 'add_stock_image' && op.query) { stockImages.push({ query: String(op.query), x: clamp(op.x, cw), y: clamp(op.y, ch), width: Math.max(40, Math.round(Number(op.width)) || Math.round(cw * 0.42)), height: Math.max(40, Math.round(Number(op.height)) || Math.round(ch * 0.42)), orientation: op.orientation || undefined }) }
          else if (t === 'add_logo') { logos.push({ company: op.company || '', corner: op.corner || 'top-right' }) }
          else if (t === 'edit_image' && op.instruction && imgInstr === null && visual?.storage_path) { imgInstr = String(op.instruction) }
        }
        // Sicherung: reine Farb-/Ton-Befehle (schwarz-weiß) sind IMMER ein Filter, NIE eine Neu-Generierung.
        const bwIntent = /schwarz.?wei|graustuf|monochrom|black.?and.?white|entsätt/i.test(String(c || ''))
        const bgIntent = /hintergrund|background|freistell|freigestellt|ausschneid|cut.?out/i.test(String(c || ''))
        if (bwIntent) { fPatch = { ...(fPatch || {}), grayscale: 1 }; if (!bgIntent) imgInstr = null }
        arr = arr.map(o => o.type === 'text' ? fitText(o) : o)
        try {
          const nonText = arr.filter(o => o.type !== 'text'); const textEls = arr.filter(o => o.type === 'text'); const scrims = []
          const fixed = textEls.map(t2 => {
            const th = measureTextH(t2); const existingScrim = nonText.find(e => e.__scrimFor === t2.id)
            if (existingScrim) return { ...t2, fill: '#FFFFFF' }
            const behind = [...nonText].reverse().find(e => (e.type==='rect'||e.type==='image'||e.type==='ellipse') && (e.opacity==null||e.opacity>0.6) && centerInside(t2, e, th))
            let fill = t2.fill || '#111111'
            if (behind && behind.type === 'rect' && typeof behind.fill === 'string' && behind.fill.startsWith('#')) { if (contrastRatio(fill, behind.fill) < 3) fill = readableOn(behind.fill) }
            else if (behind && behind.type === 'image') { const pad = Math.round((t2.fontSize || 40) * 0.35); scrims.push({ id: nextId(), type:'rect', x: Math.max(0, (t2.x||0) - pad), y: Math.max(0, (t2.y||0) - pad), width: Math.min(cw, (t2.width||0) + pad*2), height: Math.min(ch, th + pad*2), fill: '#0f172a', cornerRadius: 12, rotation:0, opacity:0.5, __scrimFor: t2.id }); fill = '#FFFFFF' }
            else { const b = (typeof bg === 'string' && bg.startsWith('#')) ? bg : '#ffffff'; if (contrastRatio(fill, b) < 3) fill = readableOn(b) }
            return { ...t2, fill }
          })
          const rebuilt = [...nonText]; fixed.forEach(t2 => { const s = scrims.find(sc => sc.__scrimFor === t2.id); if (s) rebuilt.push(s); rebuilt.push(t2) }); arr = rebuilt
        } catch (_e) {}
        return { objects: arr, nextBg: bg, filterPatch: fPatch, imageInstruction: imgInstr, wantCutout: cutout, replaceBg, logos, stockImages }
      }

      // Vision-Prüfung (Stufe 2): rendert das Ergebnis, bildfähiges Modell begutachtet + bessert nach.
      const slimFor = (list) => list.filter(o => !o.hidden).map(o => { const b = { id:o.id, type:o.type, x:Math.round(o.x||0), y:Math.round(o.y||0) }; if (o.type==='text') Object.assign(b,{ text:o.text, fontSize:o.fontSize, fill:o.fill, align:o.align||'left', width:Math.round(o.width||360) }); else if (o.type==='rect') Object.assign(b,{ width:Math.round(o.width||0), height:Math.round(o.height||0), fill:o.fill, opacity:o.opacity==null?1:o.opacity }); else if (o.type==='ellipse') Object.assign(b,{ radiusX:Math.round(o.radiusX||0), radiusY:Math.round(o.radiusY||0), fill:o.fill }); else if (o.type==='image') Object.assign(b,{ width:Math.round(o.width||0), height:Math.round(o.height||0), hinweis:'Bild – Inhalt nicht änderbar' }); return b })
      const runVisionReview = async (userCmd, currentObjs, currentBg) => {
        try {
          if (!teamId) return ''
          await new Promise(r => setTimeout(r, 450))
          let blob; try { blob = await renderBlobOpts({ pixelRatio: 1, mimeType: 'image/png' }) } catch (_e) { return '' }
          if (!blob || blob.size > 4.8 * 1024 * 1024) return ''
          const up = await uploadImageBlob(teamId, blob); if (!up || !up.path) return ''
          const reviewPrompt = `Du bist der strenge Qualitäts-Prüfer eines Grafik-Designers und SIEHST das gerenderte Design (angehängtes Bild). Ursprünglicher Nutzer-Befehl: "${userCmd}". Seitengröße ${cw}x${ch}px.

Prüfe kritisch anhand des Bildes: (1) Ist ALLE Schrift gut lesbar (klarer Kontrast zum Untergrund) und nirgends abgeschnitten oder verdeckt? (2) Überlappen oder verdecken sich Elemente ungewollt? (3) Sitzt alles sauber (Ränder, Ausrichtung, sinnvolle Größen)? (4) Ist der Befehl erfüllt und wirkt es professionell?

Editierbare Elemente (JSON, Koordinaten = linke obere Ecke):
${JSON.stringify(slimFor(currentObjs))}

Wenn alles gut ist, antworte {"ok":true,"operations":[]}. Sonst gib gezielte KORREKTUR-Operationen zurück, die die Mängel beheben — NUR diese Typen: update (id+props), add_text, add_rect, add_ellipse, delete, set_background, set_filter. KEINE Bild-Neugenerierung. Farben als Hex #rrggbb, alles innerhalb der Seite.

Antworte AUSSCHLIESSLICH mit JSON: {"ok":<bool>,"issues":["..."],"operations":[...]}`
          const { data: rev } = await Promise.race([
            supabase.functions.invoke('generate', { body: { type:'raw', model:'claude-sonnet-4-6', prompt: reviewPrompt, referenceMediaPaths: [up.path] } }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('review-timeout')), 45000)),
          ])
          try { supabase.storage.from('visuals').remove([up.path]) } catch (_e) {}
          let rtxt = String(rev?.text || rev?.content || rev?.output || '').trim().replace(/^```(?:json)?/i,'').replace(/```\s*$/i,'').trim()
          const ra = rtxt.indexOf('{'), rz = rtxt.lastIndexOf('}'); if (ra>=0 && rz>ra) rtxt = rtxt.slice(ra, rz+1)
          const parsedRev = JSON.parse(rtxt)
          const revOps = (Array.isArray(parsedRev.operations) ? parsedRev.operations : []).filter(o => o && o.op && o.op !== 'edit_image' && o.op !== 'remove_background')
          if (!revOps.length) return 'Von der KI geprüft ✓'
          const r2 = computeApplied(revOps, currentObjs, currentBg)
          setObjects(r2.objects)
          if (r2.nextBg !== currentBg) setBgColor(r2.nextBg)
          if (r2.filterPatch) setFilters(prev => ({ ...prev, ...r2.filterPatch }))
          return 'Von der KI geprüft & nachgebessert ✓'
        } catch (_e) { return '' }
      }

      const r1 = computeApplied(ops, objects, bgColor)
      setObjects(r1.objects)
      if (r1.nextBg !== bgColor) setBgColor(r1.nextBg)
      if (r1.filterPatch) setFilters(prev => ({ ...prev, ...r1.filterPatch }))
      let opError = null
      if (r1.imageInstruction) {
        try { const nv = await callGenerateImage(`Bearbeite das Referenzbild: ${r1.imageInstruction}. Behalte Bildstil, Beleuchtung und Perspektive konsistent, fotorealistisch.`); const url = await visualDataUrl(nv.storage_path); if (url) await applyResultDirect(url, 'free') } catch (e) { opError = 'Bild-Bearbeitung fehlgeschlagen: ' + (e?.message || 'Fehler') }
      }
      if (r1.wantCutout && !r1.replaceBg) {
        // Freistellen über die EINGEBAUTE Designer-Funktion: lokales MODNet-Matting
        // (removeBackgroundLocal) — stellt das Motiv aus den ORIGINAL-Pixeln frei,
        // die Person bleibt pixelgenau erhalten (kein generatives Neu-Malen).
        try {
          const imgObj = r1.objects.find(o => o.type === 'image' && o.__primary) || r1.objects.find(o => o.type === 'image')
          const el = imgObj && imgCache[imgObj.src]
          if (!el) { opError = 'Freistellen: kein Bild im Design gefunden.' }
          else {
            setSavedMsg('Motiv wird freigestellt …')
            const { removeBackgroundLocal } = await import('../../lib/bgRemoval')
            const cutoutUrl = await removeBackgroundLocal(el, (pr) => { if (pr && pr.status === 'progress' && typeof pr.progress === 'number' && /\.onnx/i.test(pr.file || '')) setSavedMsg('Freistell-Modell wird geladen … ' + Math.round(pr.progress) + '%') })
            if (cutoutUrl) await applyResultDirect(cutoutUrl, 'bg')
          }
        } catch (e) { opError = 'Freistellen fehlgeschlagen: ' + (e?.message || 'Fehler') }
      }
      if (r1.replaceBg) {
        try { await runBackgroundReplace('replace', r1.replaceBg) } catch (e) { opError = 'Hintergrund ersetzen fehlgeschlagen: ' + (e?.message || 'Fehler') }
      }
      if (r1.logos && r1.logos.length) {
        const compList = Array.isArray(brandData?.companies) ? brandData.companies : ((brandData && brandData.logos) ? [{ name: activeBrandVoice?.name, logos: brandData.logos }] : [])
        const resolveLogo = (name) => { if (!compList.length) return null; const w = String(name || '').trim().toLowerCase(); let cm = w ? compList.find(x => { const n = String(x.name || '').toLowerCase(); return n && (n.includes(w) || w.includes(n)) }) : null; if (!cm) cm = compList.find(x => x.logos && x.logos.length); return (cm && cm.logos && cm.logos[0] && cm.logos[0].url) || null }
        for (const lr of r1.logos) { const lu = resolveLogo(lr.company); if (lu) { try { await insertLogoAt(lu, lr.corner) } catch (_e) {} } else if (!opError) opError = 'Kein Logo für „' + (lr.company || 'Marke') + '" hinterlegt.' }
      }
      if (r1.stockImages && r1.stockImages.length) {
        setSavedMsg('Stock-Bilder werden geladen …')
        let anyStock = false
        for (const si of r1.stockImages) { try { const ok = await insertStockImage(si.query, si.x, si.y, si.width, si.height, si.orientation); if (ok) anyStock = true } catch (_e) {} }
        if (!anyStock && !opError) opError = 'Keine passenden Stock-Bilder gefunden (oder Bilder-Suche nicht konfiguriert).'
      }
      setPageAiCmd('')
      let reviewNote = ''
      if (!opError && r1.objects.some(o => o.type === 'text')) { reviewNote = await runVisionReview(c, r1.objects, r1.nextBg) }
      setSavedMsg(opError || reviewNote || 'Seite mit KI bearbeitet')
    } catch (e) {
      setSavedMsg('KI-Fehler: ' + (e?.message || 'fehlgeschlagen'))
    } finally { setPageAiBusy(false) }
  }

  function addImageFromDataUrl(dataUrl, meta = {}, opts = {}) {
    if (!dataUrl) return
    const img = new window.Image()
    img.onload = () => {
      // Drop direkt in einen Rahmen/Mockup (Drag aus der Bibliothek über den Rahmen).
      if (opts.frameId) { setImgCache(prev => ({ ...prev, [dataUrl]: img })); pushHistory(); updateObject(opts.frameId, { src: dataUrl }); return }
      // Ist ein leerer Bilderrahmen ausgewählt? → Bild in den Rahmen einsetzen (cover-fill) statt neues Bild-Objekt.
      // (nur beim Klick-Einfügen, nicht wenn eine Drop-Position vorgegeben ist)
      const selFrame = (!opts.at && selectedIds.length === 1) ? objects.find(o => o.id === selectedIds[0] && (o.type === 'frame' || o.type === 'mockup')) : null
      if (selFrame) { setImgCache(prev => ({ ...prev, [dataUrl]: img })); pushHistory(); updateObject(selFrame.id, { src: dataUrl }); return }
      const nw = img.naturalWidth || 200
      const nh = img.naturalHeight || 200
      let w, h
      if (meta.isIcon || meta.isGraphic) {
        // Icons/Grafiken: feste Zielgröße (~32% der Bühne), unabhängig von der
        // (oft winzigen) SVG-Pixelgröße — sonst werden sie mikrig eingefügt.
        const target = Math.min(stageSize.width, stageSize.height) * 0.32
        const ratio = (nw && nh) ? nw / nh : 1
        if (ratio >= 1) { w = Math.round(target); h = Math.round(target / ratio) }
        else { h = Math.round(target); w = Math.round(target * ratio) }
      } else {
        const maxDim = Math.min(stageSize.width, stageSize.height) * 0.5
        const sc = Math.min(1, maxDim / Math.max(nw, nh))
        w = Math.round(nw * sc); h = Math.round(nh * sc)
      }
      const c = opts.at || center()
      setImgCache(prev => ({ ...prev, [dataUrl]: img }))
      addObject({ type: 'image', src: dataUrl, x: c.x - w / 2, y: c.y - h / 2, width: w, height: h, rotation: 0, opacity: 1,
        ...(meta.iconId ? { iconId: meta.iconId, iconColor: meta.iconColor || '#1f2937', isIcon: true } : {}) })
    }
    img.onerror = () => setSavedMsg('Bild konnte nicht geladen werden.')
    img.src = dataUrl
  }

  // Icon (als Bild-Objekt eingefügt) NACH der Auswahl umfärben: SVG mit neuer Farbe
  // neu rendern und src tauschen. Ermöglicht Farbänderung in der oberen Leiste.
  async function recolorIcon(obj, hex) {
    if (!obj?.iconId) return
    try {
      const url = await iconToDataUrl(obj.iconId, hex)
      if (!url) return
      const img = new window.Image()
      img.onload = () => {
        setImgCache(prev => ({ ...prev, [url]: img }))
        commitHistoryOnce(); updateObject(obj.id, { src: url, iconColor: hex }, false); endInteraction()
      }
      img.src = url
    } catch (_e) {}
  }
  // Bild aus der Medien-Bibliothek (Storage-Pfad) als Objekt einfügen.
  async function insertMediaFromPath(storagePath, opts = {}) {
    if (!storagePath) return
    try {
      const dataUrl = await visualDataUrl(storagePath)
      if (dataUrl) addImageFromDataUrl(dataUrl, {}, opts)
      else setSavedMsg('Medium konnte nicht geladen werden.')
    } catch (_e) { setSavedMsg('Medium konnte nicht geladen werden.') }
  }
  function onPickImageFile(file) {
    if (!file) return
    if (!/^image\//.test(file.type || '')) { setSavedMsg('Bitte eine Bilddatei wählen.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      addImageFromDataUrl(url)
      setUploadThumbs(prev => prev.includes(url) ? prev : [url, ...prev].slice(0, 24))
    }
    reader.onerror = () => setSavedMsg('Datei konnte nicht gelesen werden.')
    reader.readAsDataURL(file)
  }
  function triggerImageUpload() { try { fileInputRef.current?.click() } catch (_e) {} }

  // ─── Marke: Logo als Bild-Objekt einfügen (über Storage-URL) ────────────────
  function insertBrandLogo(url) {
    if (!url) return
    // URL → DataURL (CORS-sicher für Export). Fällt auf URL zurück, falls fetch scheitert.
    ;(async () => {
      try {
        const blob = await (await fetch(url)).blob()
        const dataUrl = await blobToDataUrl(blob)
        addImageFromDataUrl(dataUrl)
      } catch (_e) {
        addImageFromDataUrl(url)
      }
    })()
  }
  // Stock-Foto (Pexels) suchen und einfügen — für Moodboards/Collagen im Design-Agenten.
  async function insertStockImage(query, x, y, w, h, orientation) {
    try {
      const res = await searchPhotos({ query, perPage: 12, orientation })
      const photo = (res && res.photos ? res.photos : [])[0]
      if (!photo) return false
      const dataUrl = await photoToDataUrl(photo.src?.large || photo.src?.medium || photo.src?.original)
      if (!dataUrl) return false
      const img = await loadHtmlImage(dataUrl)
      setImgCache(prev => ({ ...prev, [dataUrl]: img }))
      pushHistory()
      setObjects(prev => [...prev, { id: nextId(), type: 'image', src: dataUrl, x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h), rotation: 0, opacity: 1 }])
      return true
    } catch (_e) { return false }
  }
  // Logo an einer Ecke platzieren (für den Design-Agenten: echtes Company-Logo einfügen).
  async function insertLogoAt(logoUrl, corner) {
    if (!logoUrl) return
    try {
      let dataUrl = logoUrl
      try { const blob = await (await fetch(logoUrl)).blob(); dataUrl = await blobToDataUrl(blob) } catch (_e) {}
      const img = await loadHtmlImage(dataUrl)
      const stW = stageSize.width, stH = stageSize.height
      const cwl = Math.round(baseCrop?.width || stW), chl = Math.round(baseCrop?.height || stH)
      const targetH = Math.min(stW, stH) * 0.16
      const ratio = (img.naturalWidth || 1) / (img.naturalHeight || 1)
      let w, h; if (ratio >= 1) { w = targetH * ratio; h = targetH } else { w = targetH; h = targetH / ratio }
      w = Math.round(Math.min(w, cwl * 0.5)); h = Math.round(h)
      const m = Math.max(24, Math.round(Math.min(cwl, chl) * 0.05))
      let x = m, y = m
      if (/right|rechts/i.test(corner || '')) x = cwl - w - m
      if (/bottom|unten/i.test(corner || '')) y = chl - h - m
      setImgCache(prev => ({ ...prev, [dataUrl]: img }))
      pushHistory()
      setObjects(prev => [...prev, { id: nextId(), type: 'image', src: dataUrl, x, y, width: w, height: h, rotation: 0, opacity: 1, isGraphic: true }])
    } catch (_e) {}
  }
  // Marke: Farbe anwenden — auf Füllung des ausgewählten Objekts, sonst Artboard-Bg.
  function applyBrandColor(hex) {
    if (!hex) return
    if (selectedIds.length) {
      commitHistoryOnce()
      const ids = new Set(selectedIds)
      setObjects(prev => prev.map(o => ids.has(o.id) ? { ...o, fill: hex } : o))
      endInteraction()
    } else {
      commitHistoryOnce()
      setBgColor(hex)
      endInteraction()
    }
  }
  // Marke: Schrift auf ausgewähltes Text-Objekt anwenden.
  function applyBrandFont(family) {
    if (!family) return
    if (selectedIds.length === 1) {
      const sel = objects.find(o => o.id === selectedIds[0])
      if (sel && sel.type === 'text') {
        commitHistoryOnce(); updateObject(sel.id, { fontFamily: family }, false); endInteraction()
        return
      }
    }
    // Kein Text gewählt → neues Text-Objekt mit der Schrift.
    const c = center()
    addObject({ type: 'text', x: c.x - 180, y: c.y - 30, text: 'Text', fontSize: 60, fontFamily: family,
      fill: '#111827', fontStyle: 'normal', align: 'left', width: 360, rotation: 0 })
  }

  // ─── Freier KI-Befehl (mask-frei) auf das aktive Bild ───────────────────────
  async function runFreeAiCommand(cmd) {
    const text = (cmd || '').trim()
    if (!text) { setAiError('Bitte beschreibe, was die KI tun soll.'); return }
    if (!visual?.storage_path) { setAiError('Kein Basisbild.'); return }
    if (!activeImageObj()) { setAiError('KI-Werkzeuge brauchen ein Bild im Design.'); return }
    setAiBusy(true); setAiError('')
    try {
      const prompt = `Bearbeite das Referenzbild gemäß dieser Anweisung: ${text}. Behalte Bildstil, Beleuchtung und Perspektive konsistent, fotorealistisch.`
      const aiVisual = await callGenerateImage(prompt)
      const aiUrl = await visualDataUrl(aiVisual.storage_path)
      if (aiUrl) await applyResultDirect(aiUrl, 'free')   // direkt ins Bild
    } catch (e) {
      setAiError(e?.message || 'KI-Bearbeitung fehlgeschlagen.')
    } finally {
      setAiBusy(false)
    }
  }

  // ─── Format-/Größen-Preset anwenden ─────────────────────────────────────────
  function applyFormatPreset(preset) {
    if (!preset) return
    pushHistory()
    // WHITEBOARD-MODELL: Ein Format-Preset ändert AUSSCHLIESSLICH die weiße Artboard
    // (stageSize). Bild-Objekte (inkl. dem importierten Bild) behalten ihre Größe und
    // Position und können frei innerhalb der neuen Artboard verschoben/skaliert werden.
    setStageSize({ width: preset.w, height: preset.h })
    setBaseCrop(null)
    if (!bgColor) setBgColor('#ffffff')
    setSelectedIds([])
    resetMaskCanvas(preset.w, preset.h)
    // Ein Format pro Design: Format-Änderung gilt für ALLE Seiten.
    setPages(prev => prev.map(p => ({ ...p, stage: { width: preset.w, height: preset.h } })))
  }

  // ─── Vorlagen anwenden (Start-Layout) ──────────────────────────────────────
  function applyTemplate(tpl) {
    if (!tpl) return
    pushHistory()
    const tplObjs = (tpl.objects || []).map(o => ({ id: nextId(), ...JSON.parse(JSON.stringify(o)) }))
    // WHITEBOARD: Ist bereits ein (Basis-)Bild im Design, BLEIBT es erhalten und die
    // Vorlagen-Elemente (Text/Formen) werden DARÜBER gelegt — das Bild verschwindet nie.
    const primary = objects.find(o => o.type === 'image' && o.__primary)
                  || objects.find(o => o.type === 'image')
    if (primary) {
      setObjects([primary, ...tplObjs])
    } else {
      // Leeres Design (kein Bild) → komplette Vorlage inkl. Hintergrund/Größe.
      const w = tpl.stage?.width || 1080
      const h = tpl.stage?.height || 1080
      setBgColor(tpl.background || '#ffffff')
      setStageSize({ width: w, height: h })
      setBaseCrop(null)
      setFilters({ ...EMPTY_FILTERS })
      setObjects(tplObjs)
      resetMaskCanvas(w, h)
    }
    setSelectedId(null)
    setActiveTool(null)
  }

  // Ebenen-Reihenfolge (Array-Reihenfolge = z-order)
  function reorder(dir) {
    if (!selectedId) return
    pushHistory()
    setObjects(prev => {
      const idx = prev.findIndex(o => o.id === selectedId)
      if (idx < 0) return prev
      const arr = [...prev]
      const [it] = arr.splice(idx, 1)
      if (dir === 'top') arr.push(it)
      else if (dir === 'bottom') arr.unshift(it)
      else if (dir === 'up') arr.splice(Math.min(idx + 1, arr.length), 0, it)
      else if (dir === 'down') arr.splice(Math.max(idx - 1, 0), 0, it)
      return arr
    })
  }

  // ─── Ebenen-Panel: Reorder per Drag, Sichtbarkeit/Sperre, Umbenennen ───────
  // Verschiebt das Objekt mit dragId an die Array-Position von targetId. Das
  // objects-Array ist von hinten (unten) nach vorne (oben) sortiert; das Panel
  // zeigt es umgekehrt, daher arbeiten wir hier auf den realen Array-Indizes.
  function reorderObjects(dragId, targetId, placeAfter) {
    if (!dragId || dragId === targetId) return
    pushHistory()
    setObjects(prev => {
      const arr = [...prev]
      const from = arr.findIndex(o => o.id === dragId)
      if (from < 0) return prev
      const [it] = arr.splice(from, 1)
      let to = arr.findIndex(o => o.id === targetId)
      if (to < 0) { arr.push(it); return arr }
      if (placeAfter) to += 1
      arr.splice(to, 0, it)
      return arr
    })
  }
  function toggleLayerFlag(id, flag) {
    pushHistory()
    setObjects(prev => prev.map(o => o.id === id ? { ...o, [flag]: !o[flag] } : o))
    if (flag === 'locked' || flag === 'hidden') {
      // gesperrte/ausgeblendete Ebene aus der Auswahl nehmen
      setSelectedIds(prev => prev.filter(x => x !== id))
    }
  }
  function renameLayer(id, name) {
    commitHistoryOnce()
    updateObject(id, { name: name }, false)
    endInteraction()
    setRenamingId(null)
  }

  // ─── Ausrichten / Verteilen ─────────────────────────────────────────────────
  // Bei genau 1 Objekt: relativ zur Canvas. Bei mehreren: relativ zur Auswahl-Box.
  // edge: 'left'|'hcenter'|'right'|'top'|'vcenter'|'bottom'
  function alignObjects(edge) {
    const ids = selectedIds
    if (!ids.length) return
    pushHistory()
    const cw = baseCrop?.width || stageSize.width
    const ch = baseCrop?.height || stageSize.height
    const offX = baseCrop ? baseCrop.x : 0
    const offY = baseCrop ? baseCrop.y : 0
    // Referenz-Rechteck (in Bühnenkoordinaten inkl. off).
    let refL, refT, refR, refB
    if (ids.length === 1) {
      refL = offX; refT = offY; refR = offX + cw; refB = offY + ch
    } else {
      const bs = ids.map(id => objBounds(objects.find(o => o.id === id))).filter(Boolean)
      refL = Math.min(...bs.map(b => b.x))
      refT = Math.min(...bs.map(b => b.y))
      refR = Math.max(...bs.map(b => b.x + b.w))
      refB = Math.max(...bs.map(b => b.y + b.h))
    }
    skipHistoryRef.current = true
    setObjects(prev => prev.map(o => {
      if (!ids.includes(o.id)) return o
      const b = objBounds(o)
      let dx = 0, dy = 0
      if (edge === 'left') dx = refL - b.x
      else if (edge === 'right') dx = refR - (b.x + b.w)
      else if (edge === 'hcenter') dx = (refL + refR) / 2 - (b.x + b.w / 2)
      else if (edge === 'top') dy = refT - b.y
      else if (edge === 'bottom') dy = refB - (b.y + b.h)
      else if (edge === 'vcenter') dy = (refT + refB) / 2 - (b.y + b.h / 2)
      return moveObjectBy(o, dx, dy)
    }))
    setTimeout(() => { skipHistoryRef.current = false }, 0)
  }
  // Verteilt ≥3 selektierte Objekte mit gleichen Abständen (axis: 'h' | 'v').
  function distributeObjects(axis) {
    const ids = selectedIds
    if (ids.length < 3) return
    pushHistory()
    const items = ids.map(id => ({ o: objects.find(o => o.id === id), b: objBounds(objects.find(o => o.id === id)) }))
      .filter(it => it.o && it.b)
    if (items.length < 3) return
    const isH = axis === 'h'
    // Nach Mittelpunkt sortieren
    items.sort((a, b) => (isH ? (a.b.x + a.b.w / 2) - (b.b.x + b.b.w / 2) : (a.b.y + a.b.h / 2) - (b.b.y + b.b.h / 2)))
    const first = items[0], last = items[items.length - 1]
    const firstCenter = isH ? first.b.x + first.b.w / 2 : first.b.y + first.b.h / 2
    const lastCenter = isH ? last.b.x + last.b.w / 2 : last.b.y + last.b.h / 2
    const step = (lastCenter - firstCenter) / (items.length - 1)
    const targets = new Map()
    items.forEach((it, i) => {
      const desiredCenter = firstCenter + step * i
      const curCenter = isH ? it.b.x + it.b.w / 2 : it.b.y + it.b.h / 2
      const d = desiredCenter - curCenter
      targets.set(it.o.id, isH ? { dx: d, dy: 0 } : { dx: 0, dy: d })
    })
    skipHistoryRef.current = true
    setObjects(prev => prev.map(o => {
      const t = targets.get(o.id)
      return t ? moveObjectBy(o, t.dx, t.dy) : o
    }))
    setTimeout(() => { skipHistoryRef.current = false }, 0)
  }
  // Verschiebt ein Objekt typ-korrekt um (dx,dy). Ellipsen haben x/y als Mittelpunkt,
  // Linien/Pfeile/Sticker nutzen x/y als Anker — in allen Fällen reicht x/y += d.
  function moveObjectBy(o, dx, dy) {
    if (!dx && !dy) return o
    return { ...o, x: (o.x || 0) + dx, y: (o.y || 0) + dy }
  }

  // ─── Inline-Text-Edit (Textarea-Overlay) ──────────────────────────────────
  function startTextEdit(id) {
    const obj = objects.find(o => o.id === id)
    if (!obj || obj.type !== 'text') return
    setEditingTextId(id)
    setSelectedId(id)
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) { ta.value = obj.text || ''; ta.focus(); ta.select() }
    }, 20)
  }
  function commitTextEdit() {
    const ta = textareaRef.current
    if (editingTextId && ta) updateObject(editingTextId, { text: ta.value })
    setEditingTextId(null)
  }

  // Position des Textarea-Overlays (Container-Pixel)
  function textOverlayStyle() {
    const obj = objects.find(o => o.id === editingTextId)
    if (!obj) return { display: 'none' }
    const offX = baseCrop ? baseCrop.x : 0
    const offY = baseCrop ? baseCrop.y : 0
    const rot = obj.rotation || 0
    return {
      position: 'absolute',
      top: (obj.y - offY) * effScale,
      left: (obj.x - offX) * effScale,
      width: (obj.width || 360) * effScale * (obj.scaleX || 1),
      // B1: Rotation des Objekts berücksichtigen, damit Text beim Edit nicht springt.
      transformOrigin: 'top left',
      transform: rot ? `rotate(${rot}deg)` : 'none',
      fontSize: (obj.fontSize || 44) * effScale * (obj.scaleY || 1),
      fontFamily: obj.fontFamily || 'Inter',
      lineHeight: 1.1,
      color: obj.fill || '#fff',
      background: 'rgba(0,0,0,0.35)',
      // B1: 1px-Border-Offset vermeiden → box-sizing border-box statt verschiebendem Rand.
      border: '1px dashed #fff',
      boxSizing: 'border-box',
      outline: 'none',
      resize: 'none',
      padding: 0,
      margin: 0,
      overflow: 'hidden',
      zIndex: 50,
      fontWeight: (obj.fontStyle || '').includes('bold') ? 700 : 400,
      fontStyle: (obj.fontStyle || '').includes('italic') ? 'italic' : 'normal',
      textAlign: obj.align || 'left',
    }
  }

  // ─── Masken-Canvas ──────────────────────────────────────────────────────────
  function resetMaskCanvas(w, h) {
    let c = maskCanvasRef.current
    if (!c) { c = document.createElement('canvas'); maskCanvasRef.current = c }
    c.width = Math.max(1, Math.round(w))
    c.height = Math.max(1, Math.round(h))
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    setHasMask(false)
    redrawOverlay()
  }
  function clearMask() {
    const c = maskCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    lassoPtsRef.current = []
    setHasMask(false)
    redrawOverlay()
  }
  function invertMask() {
    const c = maskCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    // Invertieren: dort wo Alpha>0 → leer, sonst → voll (über Alpha-Map)
    const img = ctx.getImageData(0, 0, c.width, c.height)
    const d = img.data
    for (let i = 3; i < d.length; i += 4) {
      const on = d[i] > 10
      if (on) { d[i] = 0 } else { d[i - 3] = 255; d[i - 2] = 255; d[i - 1] = 255; d[i] = 255 }
    }
    ctx.putImageData(img, 0, 0)
    setHasMask(true)
    redrawOverlay()
  }

  // Pinsel: weißen gefüllten Kreis in die Maske malen
  function paintBrushAt(ix, iy) {
    const c = maskCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(ix, iy, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Lasso/Rect: Polygon füllen
  function fillMaskPolygon(pts) {
    const c = maskCanvasRef.current
    if (!c || pts.length < 3) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.closePath()
    ctx.fill()
  }

  // Sichtbares Overlay neu zeichnen (Maske halbtransparent in Primary)
  function redrawOverlay() {
    const ov = overlayRef.current
    const mask = maskCanvasRef.current
    if (!ov || !mask) return
    const cw = (baseCrop?.width || stageSize.width)
    const ch = (baseCrop?.height || stageSize.height)
    const dw = Math.round(cw * effScale)
    const dh = Math.round(ch * effScale)
    if (ov.width !== dw) ov.width = dw
    if (ov.height !== dh) ov.height = dh
    const ctx = ov.getContext('2d')
    ctx.clearRect(0, 0, ov.width, ov.height)
    if (!aiMode) return
    // Maske als blaue Lasur zeichnen: erst Maske skaliert, dann tint via source-in
    ctx.save()
    const offX = baseCrop ? baseCrop.x : 0
    const offY = baseCrop ? baseCrop.y : 0
    ctx.globalAlpha = 0.45
    try {
      // Nur den sichtbaren (gecroppten) Ausschnitt der Maske ins Overlay zeichnen
      ctx.drawImage(mask, offX, offY, cw, ch, 0, 0, dw, dh)
    } catch (_e) {}
    // einfärben
    ctx.globalCompositeOperation = 'source-in'
    ctx.globalAlpha = 1
    ctx.fillStyle = PRGB
    ctx.fillRect(0, 0, dw, dh)
    ctx.restore()
    // aktive Lasso-Linie zeichnen
    if (maskTool === 'lasso' && lassoPtsRef.current.length > 1) {
      ctx.save()
      ctx.strokeStyle = PRGB
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      const p0 = lassoPtsRef.current[0]
      ctx.moveTo((p0.x - offX) * effScale, (p0.y - offY) * effScale)
      for (let i = 1; i < lassoPtsRef.current.length; i++) {
        const p = lassoPtsRef.current[i]
        ctx.lineTo((p.x - offX) * effScale, (p.y - offY) * effScale)
      }
      ctx.stroke()
      ctx.restore()
    }
  }
  // Overlay bei relevanten Änderungen neu zeichnen
  useEffect(() => { redrawOverlay() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMode, scale, viewScale, baseCrop, stageSize, maskTool])

  // Overlay-Pointer → Bild-Pixel-Koordinaten
  function overlayPoint(e) {
    const ov = overlayRef.current
    if (!ov) return null
    const rect = ov.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const px = (clientX - rect.left) / effScale + (baseCrop ? baseCrop.x : 0)
    const py = (clientY - rect.top) / effScale + (baseCrop ? baseCrop.y : 0)
    return { x: px, y: py }
  }
  function onMaskDown(e) {
    if (!aiMode) return
    e.preventDefault()
    const pt = overlayPoint(e)
    if (!pt) return
    drawingRef.current = true
    if (maskTool === 'brush') {
      paintBrushAt(pt.x, pt.y); setHasMask(true); redrawOverlay()
    } else if (maskTool === 'lasso') {
      lassoPtsRef.current = [pt]
    } else if (maskTool === 'rect') {
      rectStartRef.current = pt
    }
  }
  function onMaskMove(e) {
    if (!aiMode || !drawingRef.current) return
    const pt = overlayPoint(e)
    if (!pt) return
    if (maskTool === 'brush') {
      paintBrushAt(pt.x, pt.y); setHasMask(true); redrawOverlay()
    } else if (maskTool === 'lasso') {
      lassoPtsRef.current.push(pt); redrawOverlay()
    } else if (maskTool === 'rect') {
      // Live-Vorschau: temporär neu zeichnen (Rechteck wird erst bei mouseup gefüllt)
      drawRectPreview(rectStartRef.current, pt)
    }
  }
  function onMaskUp() {
    if (!aiMode || !drawingRef.current) { drawingRef.current = false; return }
    drawingRef.current = false
    if (maskTool === 'lasso') {
      if (lassoPtsRef.current.length >= 3) { fillMaskPolygon(lassoPtsRef.current); setHasMask(true) }
      lassoPtsRef.current = []
      redrawOverlay()
    } else if (maskTool === 'rect') {
      const s = rectStartRef.current
      const ov = overlayRef.current
      if (s && ov && ov._lastRect) {
        const r = ov._lastRect
        fillMaskPolygon([
          { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
        ])
        setHasMask(true)
      }
      rectStartRef.current = null
      if (ov) ov._lastRect = null
      redrawOverlay()
    }
  }
  function drawRectPreview(start, cur) {
    if (!start) return
    const x = Math.min(start.x, cur.x), y = Math.min(start.y, cur.y)
    const w = Math.abs(cur.x - start.x), h = Math.abs(cur.y - start.y)
    const ov = overlayRef.current
    if (ov) ov._lastRect = { x, y, w, h }
    redrawOverlay()
    // Vorschau-Rahmen über Overlay
    const ctx = ov.getContext('2d')
    const offX = baseCrop ? baseCrop.x : 0
    const offY = baseCrop ? baseCrop.y : 0
    ctx.save()
    ctx.strokeStyle = PRGB; ctx.lineWidth = 2; ctx.setLineDash([6, 4])
    ctx.strokeRect((x - offX) * effScale, (y - offY) * effScale, w * effScale, h * effScale)
    ctx.fillStyle = 'rgba(49,90,231,0.25)'
    ctx.fillRect((x - offX) * effScale, (y - offY) * effScale, w * effScale, h * effScale)
    ctx.restore()
  }

  // ─── Stage-Click (Selektion aufheben / Crop / Marquee) ──────────────────────
  // Stage-Koordinaten aus Pointer-Position (stage.scaleX = effScale).
  function stagePoint() {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    const offX = baseCrop ? baseCrop.x : 0
    const offY = baseCrop ? baseCrop.y : 0
    return { x: (pos.x - CANVAS_PAD) / effScale + offX, y: (pos.y - CANVAS_PAD) / effScale + offY }
  }
  // Objekt-Radierer: entfernt Zeichen-Striche (type 'line') nahe dem Cursor.
  function eraseStrokesAt(p) {
    const R = Math.max(8, penWidth)
    setObjects(prev => prev.filter(o => {
      if (o.type !== 'line') return true
      const pts = o.points || []
      for (let i = 0; i < pts.length; i += 2) {
        const ax = (o.x || 0) + pts[i], ay = (o.y || 0) + pts[i + 1]
        if ((ax - p.x) * (ax - p.x) + (ay - p.y) * (ay - p.y) <= R * R) return false
      }
      return true
    }))
  }
  function onStageMouseDown(e) {
    const stage = stageRef.current
    if (!stage) return
    // Pan-Modus (Leertaste) hat Vorrang — wird auf Container-Ebene behandelt.
    if (spaceDownRef.current) return
    const p = stagePoint()
    if (!p) return
    if (activeTool === 'draw') {
      if (brushById(activeBrush).eraser) { eraseRef.current = true; commitHistoryOnce(); eraseStrokesAt(p) }
      else { drawRef.current = [p]; setDrawPreview([p]) }
      return
    }
    if (cropMode) { cropDragRef.current = { x: p.x, y: p.y }; setCropRect({ x: p.x, y: p.y, w: 0, h: 0 }); return }
    // Klick auf leere Bühne → Marquee starten / Selektion lösen
    const onEmpty = e.target === stage || e.target.attrs?.id === '__bg__' || e.target.attrs?.id === '__bgfill__'
    if (onEmpty) {
      if (editingTextId) commitTextEdit()
      if (!aiMode) {
        marqueeStartRef.current = { x: p.x, y: p.y, additive: e.evt?.shiftKey }
        setMarquee({ x: p.x, y: p.y, w: 0, h: 0 })
        setMarqueeHits([])
        if (!e.evt?.shiftKey) setSelectedIds([])
      }
    }
  }
  function onStageMouseMove() {
    const p = stagePoint()
    if (!p) return
    if (activeTool === 'draw' && eraseRef.current) { eraseStrokesAt(p); return }
    if (activeTool === 'draw' && drawRef.current) { drawRef.current = [...drawRef.current, p]; setDrawPreview(drawRef.current); return }
    if (cropMode && cropDragRef.current) {
      const s = cropDragRef.current
      let w = Math.abs(p.x - s.x), h = Math.abs(p.y - s.y)
      if (cropRatio) { if (w / cropRatio >= h) h = w / cropRatio; else w = h * cropRatio }
      const x = p.x >= s.x ? s.x : s.x - w
      const y = p.y >= s.y ? s.y : s.y - h
      setCropRect({ x, y, w, h })
      return
    }
    if (marqueeStartRef.current) {
      const s = marqueeStartRef.current
      const m = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }
      setMarquee(m)
      setMarqueeHits((m.w > 2 || m.h > 2) ? objects.filter(o => rectsIntersect(objBounds(o), m)).map(o => o.id) : [])
    }
  }
  function onStageMouseUp() {
    if (eraseRef.current) { eraseRef.current = false; endInteraction(); return }
    if (drawRef.current) {
      const pts = drawRef.current; drawRef.current = null; setDrawPreview(null)
      if (pts.length >= 2) {
        const p0 = pts[0]; const flat = []; pts.forEach(pt => { flat.push(pt.x - p0.x, pt.y - p0.y) })
        const br = brushById(activeBrush)
        addObject({ type: 'line', x: p0.x, y: p0.y, points: flat, stroke: penColor, strokeWidth: penWidth, lineCap: br.cap, tension: br.tension, opacity: br.opacity, gco: br.gco, rotation: 0 })
      }
      return
    }
    cropDragRef.current = null
    // Marquee abschließen → alle Objekte, die das Rechteck berühren, selektieren.
    if (marqueeStartRef.current) {
      const m = marquee
      const additive = marqueeStartRef.current.additive
      marqueeStartRef.current = null
      setMarquee(null)
      if (m && (m.w > 4 || m.h > 4)) {
        const hits = objects.filter(o => rectsIntersect(objBounds(o), m)).map(o => o.id)
        setSelectedIds(prev => additive ? Array.from(new Set([...prev, ...hits])) : hits)
      }
      setMarqueeHits([])
    }
  }
  // Grobe Bounding-Box eines Objekts in Bühnenkoordinaten (für Marquee-Treffer).
  function objBounds(o) {
    const sx = o.scaleX || 1, sy = o.scaleY || 1
    if (o.type === 'ellipse') return { x: (o.x || 0) - (o.radiusX || 0), y: (o.y || 0) - (o.radiusY || 0), w: (o.radiusX || 0) * 2, h: (o.radiusY || 0) * 2 }
    if (o.type === 'text') return { x: o.x || 0, y: o.y || 0, w: (o.width || 360) * sx, h: (o.fontSize || 44) * 1.3 * sy }
    if (o.type === 'rect' || o.type === 'image') return { x: o.x || 0, y: o.y || 0, w: (o.width || 0) * sx, h: (o.height || 0) * sy }
    if (o.type === 'sticker') return { x: o.x || 0, y: o.y || 0, w: 100 * sx, h: 100 * sy }
    if (o.type === 'line' || o.type === 'arrow') {
      const pts = o.points || [0, 0, 0, 0]
      const xs = [], ys = []
      for (let i = 0; i < pts.length; i += 2) { xs.push(pts[i]); ys.push(pts[i + 1]) }
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
      return { x: (o.x || 0) + minX * sx, y: (o.y || 0) + minY * sy, w: (maxX - minX) * sx, h: (maxY - minY) * sy }
    }
    return { x: o.x || 0, y: o.y || 0, w: 40, h: 40 }
  }

  // WHITEBOARD: Crop schneidet das AKTIVE Bild-Objekt zu. Das Crop-Rechteck wird in
  // Bühnenkoordinaten gezogen; wir rechnen es relativ zum Bild-Objekt in dessen
  // Bildpixel um und setzen Konva-crop-Felder + neue Position/Größe auf dem Objekt.
  // Zuschnitt-Format wählen: zentriertes Rechteck mit dem Seitenverhältnis über das
  // aktive Bild legen (oder ganzes Bild bei „Frei").
  function setCropToRatio(ratio) {
    setCropRatio(ratio)
    const t = activeImageObj(); if (!t) return
    const ox = t.x || 0, oy = t.y || 0, ow = t.width || 1, oh = t.height || 1
    if (!ratio) { setCropRect({ x: ox, y: oy, w: ow, h: oh }); return }
    let w = ow, h = w / ratio
    if (h > oh) { h = oh; w = h * ratio }
    setCropRect({ x: ox + (ow - w) / 2, y: oy + (oh - h) / 2, w, h })
  }

  function applyCrop() {
    if (!cropRect || cropRect.w < 8 || cropRect.h < 8) { setCropMode(false); setCropRect(null); return }
    const target = activeImageObj()
    const el = target && imgCache[target.src]
    if (!target || !el) { setCropMode(false); setCropRect(null); return }
    pushHistory()
    // Schnittpunkt von cropRect (Bühne) mit dem Bild-Objekt-Rechteck.
    const ox = target.x || 0, oy = target.y || 0
    const ow = target.width || 1, oh = target.height || 1
    const ix0 = Math.max(cropRect.x, ox), iy0 = Math.max(cropRect.y, oy)
    const ix1 = Math.min(cropRect.x + cropRect.w, ox + ow), iy1 = Math.min(cropRect.y + cropRect.h, oy + oh)
    const cw = ix1 - ix0, ch = iy1 - iy0
    if (cw < 4 || ch < 4) { setCropMode(false); setCropRect(null); return }
    // Bisheriger Crop-Fenster-Ursprung im Bildpixel-Raum.
    const prevCx = target.cropX || 0, prevCy = target.cropY || 0
    const prevCw = target.cropWidth || el.naturalWidth || ow
    const prevCh = target.cropHeight || el.naturalHeight || oh
    const sx = prevCw / ow, sy = prevCh / oh   // Bildpixel pro Bühnen-Pixel
    const newCropX = prevCx + (ix0 - ox) * sx
    const newCropY = prevCy + (iy0 - oy) * sy
    const newCropW = cw * sx
    const newCropH = ch * sy
    updateObject(target.id, {
      x: ix0, y: iy0, width: cw, height: ch,
      cropX: newCropX, cropY: newCropY, cropWidth: newCropW, cropHeight: newCropH,
    }, false)
    setCropMode(false); setCropRect(null)
    setSelectedId(target.id)
  }
  function resetCrop() {
    const target = activeImageObj()
    if (!target) { setCropMode(false); setCropRect(null); return }
    const el = imgCache[target.src]
    pushHistory()
    const nw = el?.naturalWidth || target.width || stageSize.width
    const nh = el?.naturalHeight || target.height || stageSize.height
    updateObject(target.id, { cropX: undefined, cropY: undefined, cropWidth: undefined, cropHeight: undefined, width: nw, height: nh }, false)
    setCropMode(false); setCropRect(null)
  }

  // ─── Export / Speichern ────────────────────────────────────────────────────
  // Zentrale Render-Funktion: rendert die Stage zu einem Blob. Optionen:
  //   pixelRatio  → Auflösungs-Faktor (1/2/4)
  //   mimeType    → 'image/png' | 'image/jpeg'
  //   quality     → JPG-Qualität 0..1
  //   transparent → für PNG: Hintergrund (Farbfüllung) für den Export ausblenden,
  //                 damit das PNG einen Alpha-Kanal bekommt.
  // Die Transformer-Auswahl wird (wie zuvor) temporär entfernt und im finally
  // wiederhergestellt; bei transparent wird zusätzlich der Bg-Rect ausgeblendet.
  // Google-Fonts aus dem aktuellen Design bei Bedarf nachladen + neu zeichnen
  // (damit gespeicherte / per KI gesetzte Schriften korrekt rendern).
  useEffect(() => {
    const fams = [...new Set(objects.filter(o => o.type === 'text' && o.fontFamily).map(o => o.fontFamily))]
    const toLoad = fams.filter(f => isGoogleFont(f) && !isFontLoaded(f))
    if (!toLoad.length) return
    let alive = true
    Promise.all(toLoad.map(f => loadGoogleFont(f).catch(() => {}))).then(() => {
      if (!alive) return
      try { stageRef.current?.getLayers().forEach(l => l.batchDraw()) } catch (_e) {}
      setFontRev(r => r + 1)
    })
    return () => { alive = false }
  }, [objects])

  // Nach Auswahl im FontPicker: Schrift laden und Canvas neu zeichnen.
  async function handleFontLoad(family) {
    try { await loadGoogleFont(family) } catch (_e) {}
    try { stageRef.current?.getLayers().forEach(l => l.batchDraw()) } catch (_e) {}
    setFontRev(r => r + 1)
  }

  async function renderBlobOpts({ pixelRatio = 2, mimeType = 'image/png', quality = 0.92 } = {}) {
    const stage = stageRef.current
    if (!stage) throw new Error('Stage nicht bereit')
    try { await document.fonts.ready } catch (_e) {}
    const tr = trRef.current
    const hadNodes = tr ? tr.nodes() : []
    try { if (tr) { tr.nodes([]); tr.getLayer()?.batchDraw() } } catch (_e) {}
    let dataUrl
    try {
      try { stage.getLayers().forEach(l => l.batchDraw()) } catch (_e) {}
      // Die Stage hat exakt Artboard-Größe (dispW×dispH); ihr Canvas clippt bereits
      // alles ausserhalb der Artboard. Daher kein zusätzliches Crop nötig.
      const opts = { pixelRatio, mimeType, x: CANVAS_PAD, y: CANVAS_PAD, width: stageSize.width * effScale, height: stageSize.height * effScale }
      if (mimeType === 'image/jpeg') opts.quality = quality
      dataUrl = stage.toDataURL(opts)
    } finally {
      try { if (tr && hadNodes.length) { tr.nodes(hadNodes) } } catch (_e) {}
      try { stage.getLayers().forEach(l => l.batchDraw()) } catch (_e) {}
    }
    const res = await fetch(dataUrl)
    return await res.blob()
  }

  // Rückwärtskompatibel: opakes PNG (Save/Alt-Pfad nutzen das weiter).
  async function renderBlob(pixelRatio = 2) {
    return renderBlobOpts({ pixelRatio, mimeType: 'image/png' })
  }

  async function handleSave() {
    if (!visual?.id || !teamId) { setSavedMsg('Speichern nicht möglich (kein Team/Visual)'); return }
    setSaving(true); setSavedMsg('')
    try {
      const blob = await renderBlob(2)
      const { path, error: upErr } = await uploadDesignRender(teamId, visual.id, blob)
      if (upErr || !path) throw new Error(upErr?.message || 'Upload fehlgeschlagen')
      const design_json = buildDesignJson()
      const { data: updated, error: updErr } = await updateVisual(visual.id, { design_json, storage_path: path })
      if (updErr) throw new Error(updErr.message)
      setSavedMsg('Gespeichert ✓')
      onSaved && onSaved(updated || { ...visual, storage_path: path, design_json })
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (e) {
      setSavedMsg('Fehler: ' + (e?.message || 'Speichern fehlgeschlagen'))
    } finally {
      setSaving(false)
    }
  }

  // ─── Export (PNG / JPG / PDF) ──────────────────────────────────────────────
  // format: 'png' | 'jpg' | 'pdf', scale: 1|2|4 (→ pixelRatio). Immer opak (weiße Artboard).
  async function handleExport({ format = 'png', scale = 2 } = {}) {
    setExporting(true)
    try {
      const baseName = `leadesk-design-${visual?.id || 'export'}`
      if (format === 'pdf') {
        const blob = await renderBlobOpts({ pixelRatio: scale, mimeType: 'image/png' })
        const dataUrl = await blobToDataUrl(blob)
        const { jsPDF } = await import('jspdf')
        const w = stageSize.width, h = stageSize.height
        const orientation = w >= h ? 'landscape' : 'portrait'
        const pdf = new jsPDF({ orientation, unit: 'px', format: [w, h] })
        pdf.addImage(dataUrl, 'PNG', 0, 0, w, h)
        pdf.save(`${baseName}.pdf`)
        setShowExport(false)
        return
      }
      const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png'
      const ext = format === 'jpg' ? 'jpg' : 'png'
      const blob = await renderBlobOpts({ pixelRatio: scale, mimeType, quality: 0.92 })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseName}.${ext}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1500)
      setShowExport(false)
    } catch (e) {
      setSavedMsg('Export-Fehler: ' + (e?.message || ''))
    } finally {
      setExporting(false)
    }
  }

  // ─── Mehrseiten: Seiten als Einzelbilder rendern/speichern/exportieren ──────
  function _preloadSrcs(srcs) {
    return Promise.all((srcs || []).map(src => new Promise(res => {
      const im = new window.Image()
      im.onload = () => { setImgCache(p => ({ ...p, [src]: im })); res() }
      im.onerror = () => res()
      im.src = src
    })))
  }
  const _sleep = (ms) => new Promise(r => setTimeout(r, ms))
  // Rendert die angegebenen Seiten nacheinander zu PNG-Blobs (über die Live-Stage).
  async function renderSelectedPages(indices, { pixelRatio = 2, mimeType = 'image/png' } = {}) {
    const arr = withCommittedPages()
    const original = activeIdxRef.current
    const out = []
    for (const idx of indices) {
      const pg = arr[idx]; if (!pg) continue
      await _preloadSrcs((pg.objects || []).filter(o => o.type === 'image' && o.src).map(o => o.src))
      switchToPage(idx)
      await _sleep(480)
      try { const blob = await renderBlobOpts({ pixelRatio, mimeType }); out.push({ idx, blob }) } catch (_e) {}
    }
    switchToPage(original)
    await _sleep(150)
    return out
  }
  function selectedPageIndices() {
    const total = (pagesRef.current || []).length
    const sel = Object.keys(pageSel).filter(k => pageSel[k]).map(Number).filter(i => i >= 0 && i < total)
    return sel.length ? sel.sort((a, b) => a - b) : Array.from({ length: total }, (_, i) => i)
  }
  // Seiten-Auswahl-Helfer (Master „Alle Seiten" / Schnellwahl „Aktuelle Seite")
  const allPagesSelected = () => pages.length > 0 && pages.every((_, i) => pageSel[i])
  function toggleAllPages() {
    if (allPagesSelected()) setPageSel({})
    else { const a = {}; pages.forEach((_, i) => { a[i] = true }); setPageSel(a) }
  }
  function selectCurrentPageOnly() { setPageSel({ [activePageIdx]: true }) }
  function togglePageSel(i) { setPageSel(s => ({ ...s, [i]: !s[i] })) }

  function openPagesAction(mode) {
    setPageSel({ [activeIdxRef.current]: true })   // Standard: aktuelle Seite
    setPagesMsg(''); setPostSearch(''); setPagesAction(mode)
    setPagesStep('pages')
  }
  async function loadPostsForPicker() {
    setPostLoading(true)
    try {
      let q = supabase.from('content_posts').select('id, title, updated_at').eq('team_id', teamId).order('updated_at', { ascending: false }).limit(100)
      if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
      const { data } = await q
      setPostList(data || [])
    } catch (_e) { setPostList([]) } finally { setPostLoading(false) }
  }
  // Seiten als Bilder zu einem Beitrag (bestehend oder neu) hinzufügen.
  async function executePost(target) {   // target: postId | 'new'
    if (pagesBusy) return
    const indices = selectedPageIndices()
    if (!indices.length) return
    setPagesBusy(true); setPagesMsg('')
    try {
      let userId = null
      try { const { data } = await supabase.auth.getUser(); userId = data?.user?.id || null } catch (_e) {}
      let postId = target
      if (target === 'new') {
        const { data: post, error } = await supabase.from('content_posts').insert({
          user_id: userId, team_id: teamId, brand_voice_id: activeBrandVoice?.id || visual?.brand_voice_id || null,
          title: (designName || visual?.title || 'Design').slice(0, 120), content: '', platform: 'linkedin', status: 'draft',
        }).select().single()
        if (error || !post) throw new Error(error?.message || 'Beitrag konnte nicht erstellt werden')
        postId = post.id
      }
      const rendered = await renderSelectedPages(indices)
      let n = 0
      for (const { idx, blob } of rendered) {
        const up = await uploadImageBlob(teamId, blob); if (up.error || !up.path) continue
        const { data: row } = await createImageVisual({
          teamId, userId, brandVoiceId: activeBrandVoice?.id || visual?.brand_voice_id,
          title: `${designName || visual?.title || 'Design'} — Seite ${idx + 1}`,
          aspectRatio: visual?.aspect_ratio || '1:1', storagePath: up.path, postId,
        })
        if (row) n++
      }
      setPagesAction(null)
      setSavedMsg(n ? `${n} Seite(n) zum Beitrag hinzugefügt ✓` : 'Nichts hinzugefügt')
      setTimeout(() => setSavedMsg(''), 3000)
    } catch (e) { setPagesMsg('Fehler: ' + (e?.message || '')) }
    finally { setPagesBusy(false) }
  }
  // Ausgewählte Seiten als Einzelbilder in den Medien (Bibliothek) speichern.
  async function executeMedia() {
    if (pagesBusy) return
    const indices = selectedPageIndices()
    if (!indices.length) return
    setPagesBusy(true); setPagesMsg('')
    try {
      let userId = null
      try { const { data } = await supabase.auth.getUser(); userId = data?.user?.id || null } catch (_e) {}
      const rendered = await renderSelectedPages(indices)
      let n = 0
      for (const { idx, blob } of rendered) {
        const up = await uploadImageBlob(teamId, blob); if (up.error || !up.path) continue
        const { data: row } = await createImageVisual({
          teamId, userId, brandVoiceId: activeBrandVoice?.id || visual?.brand_voice_id,
          title: `${designName || visual?.title || 'Design'} — Seite ${idx + 1}`,
          aspectRatio: visual?.aspect_ratio || '1:1', storagePath: up.path,
        })
        if (row) n++
      }
      setPagesAction(null)
      setSavedMsg(n ? `${n} Bild(er) in Medien gespeichert ✓` : 'Nichts gespeichert')
      setTimeout(() => setSavedMsg(''), 3000)
    } catch (e) { setPagesMsg('Fehler: ' + (e?.message || '')) }
    finally { setPagesBusy(false) }
  }

  // Ausgewählte Seiten herunterladen: PDF (zusammengeführt) bzw. PNG/JPG (einzeln/ZIP).
  async function executeDownload() {
    if (pagesBusy) return
    const indices = selectedPageIndices()
    if (!indices.length) return
    setPagesBusy(true); setPagesMsg('')
    try {
      const base = (designName || visual?.title || 'design').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'design'
      const mime = dlFormat === 'jpg' ? 'image/jpeg' : 'image/png'
      const rendered = await renderSelectedPages(indices, { pixelRatio: 2, mimeType: dlFormat === 'pdf' ? 'image/png' : mime })
      if (dlFormat === 'pdf') {
        const { jsPDF } = await import('jspdf')
        let pdf = null
        for (const { idx, blob } of rendered) {
          const dataUrl = await blobToDataUrl(blob)
          const pg = pagesRef.current[idx] || {}
          const w = (pg.stage && pg.stage.width) || stageSize.width
          const h = (pg.stage && pg.stage.height) || stageSize.height
          const orient = w >= h ? 'landscape' : 'portrait'
          if (!pdf) pdf = new jsPDF({ orientation: orient, unit: 'px', format: [w, h] })
          else pdf.addPage([w, h], orient)
          pdf.addImage(dataUrl, 'PNG', 0, 0, w, h)
        }
        if (pdf) pdf.save(`${base}.pdf`)
      } else if (rendered.length === 1) {
        const url = URL.createObjectURL(rendered[0].blob)
        const a = document.createElement('a'); a.href = url; a.download = `${base}-seite-${rendered[0].idx + 1}.${dlFormat}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1500)
      } else {
        const JSZip = (await import('jszip')).default
        const zip = new JSZip()
        for (const { idx, blob } of rendered) zip.file(`${base}-seite-${idx + 1}.${dlFormat}`, blob)
        const content = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(content)
        const a = document.createElement('a'); a.href = url; a.download = `${base}.zip`
        document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1500)
      }
      setPagesAction(null)
      setSavedMsg('Heruntergeladen ✓'); setTimeout(() => setSavedMsg(''), 2500)
    } catch (e) { setPagesMsg('Download-Fehler: ' + (e?.message || '')) }
    finally { setPagesBusy(false) }
  }

  // ─── Hilfsfunktion: generate-image aufrufen, neuen Visual-Datensatz holen ───
  async function callGenerateImage(prompt, opts = {}) {
    let { model, quality } = splitModelValue(DEFAULT_IMAGE_MODEL)
    if (opts.model) { model = opts.model; quality = opts.quality || 'high' }   // z.B. gpt-image-1 fürs Freistellen
    const body = {
      prompt,
      aspectRatio: opts.aspectRatio || visual.aspect_ratio || '1:1',
      variants: 1,
      model, quality,
      parentVisualId: visual.id,
    }
    if (opts.background) body.background = opts.background   // 'transparent' → echtes Alpha-PNG (OpenAI)
    // Lokales Inpainting: nur den Crop als Inline-Referenz schicken (kein Vollbild).
    if (opts.inlineRefs && opts.inlineRefs.length) {
      body.referenceImagesInline = opts.inlineRefs
    } else if (!opts.noReference) {
      body.referenceImagePaths = [visual.storage_path]
    }
    const { data, error: fnErr } = await supabase.functions.invoke('generate-image', { body })
    if (fnErr) throw new Error(humanizeFnError(fnErr))
    if (data?.error) throw new Error(humanizeProviderError(data.error))
    const nv = (data?.visuals || [])[0]
    if (!nv) throw new Error('Kein Ergebnis erhalten — bitte erneut versuchen.')
    let full = nv
    try { const { data: fv } = await getVisual(nv.id); if (fv) full = fv } catch (_e) {}
    return full
  }

  // Lädt ein Storage-Bild als HTMLImageElement (über DataURL, CORS-sicher)
  async function loadImageEl(storagePath) {
    const dataUrl = await visualDataUrl(storagePath)
    if (!dataUrl) throw new Error('Ergebnisbild konnte nicht geladen werden.')
    return await new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Ergebnisbild-Dekodierung fehlgeschlagen.'))
      img.src = dataUrl
    })
  }

  // Lädt eine DataURL/URL als HTMLImageElement (CORS-sicher bei DataURLs).
  function loadHtmlImage(src) {
    return new Promise((resolve, reject) => {
      const im = new window.Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'))
      im.src = src
    })
  }
  // Schreibt ein Ergebnis-Bild (DataURL) in das aktive Bild-Objekt zurück.
  async function writeResultToActiveImage(dataUrl) {
    const target = activeImageObj()
    if (!target) return
    const im = await loadHtmlImage(dataUrl)
    setImgCache(prev => ({ ...prev, [dataUrl]: im }))
    updateObject(target.id, { src: dataUrl })
  }

  // ─── KI-Vorschau: Ergebnis erst zeigen, dann Übernehmen/Verwerfen ───────────
  // kind: 'mask' | 'free' | 'bg' — steuert das Aufräumen beim Übernehmen.
  function proposeResult(dataUrl, kind = 'free') {
    const target = activeImageObj()
    setAiPreview({ url: dataUrl, objId: target?.id || null, kind })
  }
  // Ergebnis SOFORT ins Bild schreiben (ohne Vorschau). Wird von allen KI-Tools
  // außer den Masken-/Bereich-Werkzeugen genutzt — dort bleibt die Vorschau.
  async function applyResultDirect(dataUrl, kind = 'free') {
    const target = activeImageObj()
    const objId = target?.id || null
    try {
      const im = await loadHtmlImage(dataUrl)
      setImgCache(prev => ({ ...prev, [dataUrl]: im }))
      if (objId) updateObject(objId, { src: dataUrl })
    } catch (_e) {}
    if (kind === 'free') setAiCommand('')
    if (kind === 'bg') { clearMask(); setAiMode(null) }
  }
  async function applyPreview() {
    if (!aiPreview) return
    const { url, objId, kind } = aiPreview
    try {
      const im = await loadHtmlImage(url)
      setImgCache(prev => ({ ...prev, [url]: im }))
      if (objId) updateObject(objId, { src: url })
    } catch (_e) {}
    setAiPreview(null)
    // Aufräumen je nach Werkzeug
    if (kind === 'mask') { clearMask(); setAiMode(null); setAiPrompt('') }
    if (kind === 'free') setAiCommand('')
    if (kind === 'bg') { clearMask(); setAiMode(null) }
  }
  function discardPreview() { setAiPreview(null) }

  // Bounding-Box der Maske in BILD-Pixeln (origEl-Auflösung). Scannt Alpha>0.
  function computeMaskBBox(W, H) {
    const m = maskCanvasRef.current
    if (!m) return null
    const mw = m.width, mh = m.height
    let data
    try { data = m.getContext('2d').getImageData(0, 0, mw, mh).data } catch (_e) { return null }
    let minX = mw, minY = mh, maxX = -1, maxY = -1
    for (let y = 0; y < mh; y++) {
      const row = y * mw
      for (let x = 0; x < mw; x++) {
        if (data[(row + x) * 4 + 3] > 10) {
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return null
    const sx = W / mw, sy = H / mh
    const x = Math.max(0, Math.floor(minX * sx))
    const y = Math.max(0, Math.floor(minY * sy))
    const w = Math.max(1, Math.ceil((maxX - minX + 1) * sx))
    const h = Math.max(1, Math.ceil((maxY - minY + 1) * sy))
    return { x, y, w, h }
  }

  // ─── KI-Masken-Edit: LOKALES INPAINTING (Crop → editieren → feathered Composite) ──
  // Photoshop-Prinzip: das Modell sieht NUR den markierten Bereich + großzügigen
  // Kontext-Rand (für Beleuchtung/Perspektive/Textur), regeneriert lokal in hoher
  // Auflösung, und der editierte Crop wird ausschließlich innerhalb der weichen Maske
  // zurückkomponiert. Der Rest des Bildes bleibt pixelgenau erhalten.
  async function runMaskedAiEdit(rawPrompt) {
    if (!visual?.storage_path) { setAiError('Kein Basisbild.'); return }
    const target = activeImageObj()
    if (!target) { setAiError('KI-Werkzeuge brauchen ein Bild im Design — füge erst ein Bild hinzu.'); return }
    if (!hasMask) { setAiError('Bitte zuerst einen Bereich markieren (Pinsel, Lasso oder Rechteck).'); return }
    const isHeal = aiMode === 'heal'
    if (!isHeal && !rawPrompt.trim()) { setAiError('Bitte beschreibe die gewünschte Änderung.'); return }
    setAiBusy(true); setAiError('')
    try {
      // 1) Original-Bild in voller Auflösung
      const origEl = (target?.src && imgCache[target.src]) || bgImage || await loadImageEl(visual.storage_path)
      const W = origEl.naturalWidth || stageSize.width
      const H = origEl.naturalHeight || stageSize.height
      // 2) Masken-Bbox + großzügiger Kontext-Rand, auf Bildgrenzen geklemmt
      const bbox = computeMaskBBox(W, H)
      if (!bbox) { setAiError('Maske ist leer.'); setAiBusy(false); return }
      const pad = Math.round(Math.max(bbox.w, bbox.h) * 0.6 + Math.min(W, H) * 0.04)
      const bx = Math.max(0, bbox.x - pad)
      const by = Math.max(0, bbox.y - pad)
      const bw = Math.min(W - bx, bbox.w + pad * 2)
      const bh = Math.min(H - by, bbox.h + pad * 2)
      // 3) Crop ausschneiden (für Modell-Effizienz auf max ~1280px Kante begrenzen)
      const MAXC = 1280
      const cropScale = Math.min(1, MAXC / Math.max(bw, bh))
      const cw = Math.max(8, Math.round(bw * cropScale))
      const ch = Math.max(8, Math.round(bh * cropScale))
      const cropCanvas = document.createElement('canvas')
      cropCanvas.width = cw; cropCanvas.height = ch
      cropCanvas.getContext('2d').drawImage(origEl, bx, by, bw, bh, 0, 0, cw, ch)
      const cropB64 = cropCanvas.toDataURL('image/png').split(',')[1]
      // 4) Eng gefasster Prompt (Photoshop-Stil: nur ändern was nötig, Rest erhalten)
      const prompt = isHeal
        ? 'Entferne das vom Nutzer gemeinte Objekt/Element in diesem Bildausschnitt vollständig und rekonstruiere realistisch den Hintergrund, der dahinter liegen würde. Übernimm Textur, Muster, Farben, Beleuchtung, Schatten und Perspektive exakt aus der direkten Umgebung, sodass keinerlei Spur des entfernten Objekts bleibt. Ändere sonst nichts. Fotorealistisch und nahtlos.'
        : `Bearbeite diesen Bildausschnitt: ${rawPrompt.trim()}. Behalte den übrigen Bildinhalt, die Komposition, Beleuchtung, Schattenrichtung, Farbstimmung, Filmkorn, Schärfe und Perspektive exakt bei, sodass sich die Änderung absolut nahtlos und fotorealistisch in das umgebende Bild einfügt. Keine sichtbaren Kanten.`
      // 5) Nur den Crop ans Modell (inline) — kein Vollbild, kein BV-Ref
      const aiVisual = await callGenerateImage(prompt, { inlineRefs: [{ mimeType: 'image/png', data: cropB64 }] })
      const aiCropEl = await loadImageEl(aiVisual.storage_path)
      // 6) Editierten Crop exakt an die Box-Position in ein Voll-Canvas setzen
      const placed = document.createElement('canvas')
      placed.width = W; placed.height = H
      placed.getContext('2d').drawImage(
        aiCropEl, 0, 0, aiCropEl.naturalWidth || cw, aiCropEl.naturalHeight || ch, bx, by, bw, bh
      )
      // 7) Nur innerhalb der (weichen) Maske übernehmen — Rest bleibt 1:1 Original
      const blob = await compositeMaskedResult(origEl, placed)
      const resultUrl = await blobToDataUrl(blob)
      proposeResult(resultUrl, 'mask')   // erst Vorschau, dann Übernehmen/Verwerfen
    } catch (e) {
      setAiError(e?.message || 'KI-Bearbeitung fehlgeschlagen. Das Bild bleibt unverändert.')
    } finally {
      setAiBusy(false)
    }
  }

  // Compositing: original zeichnen, dann KI-Bild nur in der Maske darüberlegen.
  // Beide Bilder werden auf die Original-Pixelgröße gebracht.
  async function compositeMaskedResult(origEl, aiEl) {
    const w = origEl.naturalWidth || stageSize.width
    const h = origEl.naturalHeight || stageSize.height
    const out = document.createElement('canvas')
    out.width = w; out.height = h
    const octx = out.getContext('2d')
    // a) Original als Basis
    octx.drawImage(origEl, 0, 0, w, h)
    // b) Masken-Ebene aufbauen: KI-Bild, mit Maske als Alpha-Clip (destination-in)
    const layer = document.createElement('canvas')
    layer.width = w; layer.height = h
    const lctx = layer.getContext('2d')
    lctx.drawImage(aiEl, 0, 0, w, h)
    // Maske skalieren auf Bild-Größe (falls Auflösung abweicht)
    const m = maskCanvasRef.current
    let maskSrc = m
    if (m && (m.width !== w || m.height !== h)) {
      const tmp = document.createElement('canvas')
      tmp.width = w; tmp.height = h
      const tctx = tmp.getContext('2d')
      if (feather) tctx.filter = 'blur(0px)'
      tctx.drawImage(m, 0, 0, w, h)
      maskSrc = tmp
    }
    // optional weiche Kante: Maske leicht weichzeichnen
    if (feather && maskSrc) {
      const fm = document.createElement('canvas')
      fm.width = w; fm.height = h
      const fctx = fm.getContext('2d')
      fctx.filter = `blur(${Math.max(2, Math.round(Math.min(w, h) * 0.006))}px)`
      fctx.drawImage(maskSrc, 0, 0)
      maskSrc = fm
    }
    // destination-in: KI-Bild nur dort behalten, wo Maske Alpha hat
    lctx.globalCompositeOperation = 'destination-in'
    if (maskSrc) lctx.drawImage(maskSrc, 0, 0, w, h)
    lctx.globalCompositeOperation = 'source-over'
    // c) maskierte KI-Ebene über das Original
    octx.drawImage(layer, 0, 0)
    const dataUrl = out.toDataURL('image/png')
    const res = await fetch(dataUrl)
    return await res.blob()
  }

  // Chroma-Key zu echter Alpha-Transparenz. Gemini liefert KEIN Alpha-PNG, daher
  // generieren wir einen Greenscreen und keyen client-seitig. ADAPTIV: die echte
  // Hintergrundfarbe wird aus den 4 Bildecken gesampelt (Median) — so funktioniert
  // es auch, wenn das KI-„Grün" leicht ungleichmäßig/texturiert ausfällt. Gekeyt
  // wird nach Farbabstand (weiche Kante), plus Grün-Despill an den Rändern.
  async function chromaKeyToAlpha(imgEl) {
    const w = imgEl.naturalWidth || stageSize.width
    const h = imgEl.naturalHeight || stageSize.height
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(imgEl, 0, 0, w, h)
    const id = ctx.getImageData(0, 0, w, h); const d = id.data
    // 1) Hintergrundfarbe aus Eck-Patches schätzen (Median je Kanal)
    const patch = Math.max(6, Math.round(Math.min(w, h) * 0.05))
    const rs = [], gs = [], bs = []
    const collect = (x0, y0) => {
      for (let y = y0; y < y0 + patch && y < h; y++) for (let x = x0; x < x0 + patch && x < w; x++) {
        const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2])
      }
    }
    collect(0, 0); collect(w - patch, 0); collect(0, h - patch); collect(w - patch, h - patch)
    const median = (arr) => { const a = arr.slice().sort((p, q) => p - q); return a[Math.floor(a.length / 2)] || 0 }
    const bg = [median(rs), median(gs), median(bs)]
    // 2) Keyen nach Farbabstand zur gesampelten BG-Farbe
    const INNER = 70, OUTER = 150     // <INNER voll transparent, >OUTER voll deckend
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2]
      const dist = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2)
      let a = dist <= INNER ? 0 : dist >= OUTER ? 1 : (dist - INNER) / (OUTER - INNER)
      // Grün-Despill: wo Grün beide anderen Kanäle übersteigt, auf deren Max ziehen
      if (a > 0) { const mx = Math.max(r, b); if (g > mx) d[i + 1] = mx }
      d[i + 3] = Math.round((d[i + 3] / 255) * a * 255)
    }
    ctx.putImageData(id, 0, 0)
    return c.toDataURL('image/png')
  }

  // ─── Hintergrund-Werkzeuge (volles KI-Vollbild, kein Compositing) ──────────
  async function runBackgroundReplace(mode, customPrompt) {
    if (!visual?.storage_path) { setAiError('Kein Basisbild.'); return }
    if (!activeImageObj()) { setSavedMsg('Hintergrund-KI braucht ein Bild im Design.'); return }
    setBgMenuBusy(true); setSavedMsg('')
    try {
      // Originalpixel des aktiven Bildes (volle Auflösung)
      const target = activeImageObj()
      const origEl = (target?.src && imgCache[target.src]) || bgImage || await loadImageEl(visual.storage_path)
      const W = origEl.naturalWidth || stageSize.width
      const H = origEl.naturalHeight || stageSize.height
      const onProg = (p) => {
        if (p && p.status === 'progress' && typeof p.progress === 'number' && /\.onnx/i.test(p.file || '')) {
          setSavedMsg('Freistell-Modell wird geladen … ' + Math.round(p.progress) + '%')
        }
      }

      // ── Freistellen / Ersetzen: per LOKALEM MATTING (MODNet) ──
      // Das Motiv wird per Alpha-Matte aus den ORIGINAL-Pixeln freigestellt und
      // bleibt damit pixelgenau erhalten (kein generatives Neu-Malen → kein
      // „Sims-Effekt"). Wie bei Canva/CapCut. Verarbeitung lokal im Browser.
      setSavedMsg('Motiv wird freigestellt …')
      const { removeBackgroundLocal } = await import('../../lib/bgRemoval')
      const cutoutUrl = await removeBackgroundLocal(origEl, onProg)

      if (mode === 'remove') {
        setSavedMsg('')
        await applyResultDirect(cutoutUrl, 'bg')   // transparenter Hintergrund, direkt
        return
      }

      const cutEl = await loadHtmlImage(cutoutUrl)
      const out = document.createElement('canvas')
      out.width = W; out.height = H
      const octx = out.getContext('2d')

      // mode === 'replace': neuen Hintergrund generieren (ohne Referenz, damit das
      // Modell keine Person mitmalt) und das Original-Motiv unverändert davorsetzen.
      setSavedMsg('Neuer Hintergrund wird erzeugt …')
      const bgPrompt = `Erzeuge ausschließlich einen Hintergrund / eine Szene als Bildfüllung: ${(customPrompt || '').trim()}. Keine Personen, kein Objekt im Vordergrund, keine Ränder — gleichmäßig als Hintergrund nutzbar, fotorealistisch.`
      const bgVisual = await callGenerateImage(bgPrompt, { aspectRatio: visual.aspect_ratio || '1:1', noReference: true })
      const bgEl = await loadImageEl(bgVisual.storage_path)
      // Hintergrund „cover" einpassen
      const bw = bgEl.naturalWidth || W, bh = bgEl.naturalHeight || H
      const scale = Math.max(W / bw, H / bh)
      const dw = bw * scale, dh = bh * scale
      octx.drawImage(bgEl, (W - dw) / 2, (H - dh) / 2, dw, dh)
      octx.drawImage(cutEl, 0, 0, W, H)
      setSavedMsg('')
      await applyResultDirect(out.toDataURL('image/png'), 'bg')
    } catch (e) {
      setSavedMsg('Fehler: ' + (e?.message || 'Hintergrund-Bearbeitung fehlgeschlagen'))
    } finally {
      setBgMenuBusy(false)
    }
  }


  // ─── Smart-Guides / Snapping ────────────────────────────────────────────────
  // Gängiges react-konva-Pattern: Beim Ziehen/Skalieren werden Snap-Linien aus der
  // Canvas (Kanten + Mitte) sowie aus den ANDEREN Objekten (Kanten + Mittelachsen)
  // gebildet. Liegt eine Kante/Mitte des bewegten Objekts näher als die Toleranz an
  // einer Linie, "schnappt" das Objekt darauf; die getroffene Linie wird als pinke/
  // Primary-Hilfslinie auf dem Guide-Layer gezeichnet. Beim Drag-Ende leeren wir den
  // Guide-Layer wieder. Alle Berechnungen in BÜHNEN-Koordinaten (vor effScale), die
  // Toleranz wird daher durch effScale geteilt (≈6px Bildschirm).
  const SNAP_PX = 6
  const guideTimerRef = useRef(null)
  // Hysterese für Pfeiltasten-Snap: die zuletzt getroffene Linie je Achse wird
  // „ignoriert", solange das Objekt in ihrer Toleranzzone bleibt → einmal andocken,
  // danach mit weiteren Pfeil-Drücken frei darüber hinaus (kein Kleben).
  const nudgeIgnoreRef = useRef({ x: null, y: null })

  // Liefert für die aktuelle Bühne die Snap-Linien (in Bühnenkoordinaten ohne off).
  // skipIds: IDs, die NICHT als Snap-Quelle dienen (das/die bewegte(n) Objekt(e)).
  function collectGuideLines(skipIds) {
    const skip = new Set(skipIds || [])
    const cw = baseCrop?.width || stageSize.width
    const ch = baseCrop?.height || stageSize.height
    // Canvas: linker/rechter/oberer/unterer Rand + Mitte (jeweils relativ zur Bühne,
    // ohne off — Stage-lokale 0..cw/0..ch).
    const vertical = [0, cw / 2, cw]      // x-Linien
    const horizontal = [0, ch / 2, ch]    // y-Linien
    // Rand-/Margin-Guides (wie Canva): großzügiger, konsistenter Innenabstand vom
    // Canvas-Rand. ~10% der kürzeren Seite, geklemmt auf 48..200px (Bühneneinheiten).
    const M = Math.max(48, Math.min(200, Math.round(Math.min(cw, ch) * 0.10)))
    vertical.push(M, cw - M)
    horizontal.push(M, ch - M)
    try {
      for (const o of objects) {
        if (skip.has(o.id) || o.hidden) continue
        const b = objBounds(o)
        // objBounds liefert Bühnenkoordinaten INKL. off-Versatz; auf Stage-lokal bringen.
        const bx = b.x - off.x, by = b.y - off.y
        vertical.push(bx, bx + b.w / 2, bx + b.w)
        horizontal.push(by, by + b.h / 2, by + b.h)
      }
    } catch (_e) {}
    return { vertical, horizontal }
  }

  // Zeichnet die getroffenen Hilfslinien auf den Guide-Layer (Stage-lokal, da der
  // Layer mit effScale skaliert ist).
  function drawGuides(vLines, hLines) {
    const layer = guideLayerRef.current
    if (!layer) return
    try {
      layer.destroyChildren()
      const cw = baseCrop?.width || stageSize.width
      const ch = baseCrop?.height || stageSize.height
      // Canva-typische, klar sichtbare Hilfslinien: kräftiges Magenta, durchgezogen,
      // etwas dicker — damit Ausrichtung/Andocken sofort erkennbar ist.
      const GUIDE = '#FF1F8F'
      const sw = 1.6 / effScale
      for (const x of vLines) {
        layer.add(new Konva.Line({ points: [x, -6 / effScale, x, ch + 6 / effScale], stroke: GUIDE, strokeWidth: sw, listening: false }))
      }
      for (const y of hLines) {
        layer.add(new Konva.Line({ points: [-6 / effScale, y, cw + 6 / effScale, y], stroke: GUIDE, strokeWidth: sw, listening: false }))
      }
      layer.batchDraw()
    } catch (_e) {}
  }
  function clearGuides() {
    const layer = guideLayerRef.current
    if (!layer) return
    try { layer.destroyChildren(); layer.batchDraw() } catch (_e) {}
  }

  // Live-Grad-Anzeige während des Drehens: ein kleines Badge direkt unter dem
  // (rotierten) Element auf dem Guide-Layer — kein React-Re-Render, daher flüssig.
  function drawRotationBadge(node) {
    const layer = guideLayerRef.current
    if (!layer || !node) return
    try {
      layer.destroyChildren()
      const box = node.getClientRect({ relativeTo: node.getStage() })
      const deg = Math.round((((node.rotation() || 0) % 360) + 360) % 360)
      const cx = box.x + box.width / 2
      const by = box.y + box.height + 12 / effScale
      const label = new Konva.Label({ x: cx, y: by, listening: false })
      label.add(new Konva.Tag({ fill: 'rgba(17,24,39,0.92)', cornerRadius: 5 / effScale }))
      label.add(new Konva.Text({
        text: deg + '°', fontSize: 13 / effScale, fontStyle: '700',
        fill: '#fff', padding: 6 / effScale, fontFamily: 'inherit',
      }))
      label.offsetX(label.getWidth() / 2)
      layer.add(label)
      layer.batchDraw()
    } catch (_e) {}
  }

  // Liefert die Stage-lokalen Bounding-Boxen ALLER nicht-übersprungenen, sichtbaren
  // Objekte (für Gleichabstands-Erkennung). Stage-lokal = inkl. -off-Versatz.
  function otherObjBounds(skipIds) {
    const skip = new Set(skipIds || [])
    const out = []
    try {
      for (const o of objects) {
        if (skip.has(o.id) || o.hidden) continue
        const b = objBounds(o)
        out.push({ x: b.x - off.x, y: b.y - off.y, w: b.w, h: b.h })
      }
    } catch (_e) {}
    return out
  }

  // Zeichnet (zusätzlich zu den evtl. schon vorhandenen Hilfslinien) dezente
  // Abstands-Indikatoren auf den Guide-Layer: eine dünne Linie pro Lücke mit kleinen
  // senkrechten End-Kappen, so dass zwei gleich große Lücken sichtbar werden.
  // segs: [{ axis:'h'|'v', a, b, cross }] — bei axis 'h' liegt die Lücke entlang x
  // von a..b auf Höhe cross (y); bei 'v' entlang y von a..b auf x=cross.
  function drawSpacingIndicators(segs) {
    const layer = guideLayerRef.current
    if (!layer || !segs || !segs.length) return
    try {
      const sw = 1 / effScale
      const cap = 5 / effScale   // halbe Länge der End-Kappen (Bühneneinheiten)
      for (const s of segs) {
        if (s.axis === 'h') {
          const y = s.cross
          layer.add(new Konva.Line({ points: [s.a, y, s.b, y], stroke: PRGB, strokeWidth: sw, listening: false }))
          layer.add(new Konva.Line({ points: [s.a, y - cap, s.a, y + cap], stroke: PRGB, strokeWidth: sw, listening: false }))
          layer.add(new Konva.Line({ points: [s.b, y - cap, s.b, y + cap], stroke: PRGB, strokeWidth: sw, listening: false }))
        } else {
          const x = s.cross
          layer.add(new Konva.Line({ points: [x, s.a, x, s.b], stroke: PRGB, strokeWidth: sw, listening: false }))
          layer.add(new Konva.Line({ points: [x - cap, s.a, x + cap, s.a], stroke: PRGB, strokeWidth: sw, listening: false }))
          layer.add(new Konva.Line({ points: [x - cap, s.b, x + cap, s.b], stroke: PRGB, strokeWidth: sw, listening: false }))
        }
      }
      layer.batchDraw()
    } catch (_e) {}
  }

  // Gleichabstands-Snapping (Canva-Feature). Erkennt, wenn die gezogene Node
  // GLEICH WEIT von ihren Nachbarn entfernt ist, schnappt auf diese Position und
  // liefert Indikator-Segmente zurück. Pro Achse unabhängig. Gibt
  // { dx, dy, segs } zurück (dx/dy = Korrektur in Stage-lokal, segs = Indikatoren).
  // Nur für EINZEL-Drag gedacht.
  function equalSpacingSnap(node, skipIds, lockedV, lockedH) {
    const res = { dx: 0, dy: 0, segs: [] }
    try {
      const tol = SNAP_PX / effScale
      const box = node.getClientRect({ relativeTo: node.getStage() })
      // getClientRect({relativeTo: stage}) liefert STAGE-LOKALE (unskalierte) Koordinaten.
      let bx = box.x, by = box.y
      const bw = box.width, bh = box.height
      const others = otherObjBounds(skipIds)
      if (!others.length) return res
      const cx = bx + bw / 2, cy = by + bh / 2

      // ── Horizontaler Gleichabstand (Lücken entlang x) ──────────────────────
      if (!lockedV) {
        // Nur Objekte, die sich vertikal mit der Node überlappen (= "in einer Reihe").
        const row = others.filter(o => (o.y < by + bh) && (o.y + o.h > by))
        // Nächster linker Nachbar (rechts-Kante < node.left) und rechter (left > node.right).
        let left = null, right = null
        for (const o of row) {
          if (o.x + o.w <= bx + tol) { if (!left || o.x + o.w > left.x + left.w) left = o }
          if (o.x >= bx + bw - tol) { if (!right || o.x < right.x) right = o }
        }
        let snapped = false
        if (left && right) {
          const gapL = bx - (left.x + left.w)
          const gapR = right.x - (bx + bw)
          // Zentriert zwischen beiden: gapL == gapR. Verschiebe um die halbe Differenz.
          if (Math.abs(gapL - gapR) < tol * 2) {
            const shift = (gapR - gapL) / 2   // >0 → nach rechts
            res.dx = shift; bx += shift
            const g = bx - (left.x + left.w)
            const yMid = Math.max(by, left.y, right.y) + 4 / effScale
            res.segs.push({ axis: 'h', a: left.x + left.w, b: bx, cross: yMid })
            res.segs.push({ axis: 'h', a: bx + bw, b: right.x, cross: yMid })
            snapped = true
          }
        }
        // Ketten-Erkennung: bekannte Lücke G zwischen zwei Nachbarn → gleiche Lücke G
        // zur gezogenen Node erzeugen (nur linke ODER rechte Seite verfügbar).
        if (!snapped && left && right) {
          // Lücke zwischen left und right ohne Node? (selten) — übersprungen, da Node dazwischen.
        }
        if (!snapped && left && !right) {
          // Finde ein Paar (a,b) links mit Gap G; wende G zwischen left und Node an.
          const G = findKnownGapH(row, left, tol)
          if (G != null) {
            const targetLeft = left.x + left.w + G
            const diff = targetLeft - bx
            if (Math.abs(diff) < tol) {
              res.dx = diff; bx += diff
              const yMid = Math.max(by, left.y) + 4 / effScale
              res.segs.push({ axis: 'h', a: left.x + left.w, b: bx, cross: yMid })
              snapped = true
            }
          }
        }
        if (!snapped && right && !left) {
          const G = findKnownGapH(row, right, tol)
          if (G != null) {
            const targetRight = right.x - G
            const diff = targetRight - (bx + bw)
            if (Math.abs(diff) < tol) {
              res.dx = diff; bx += diff
              const yMid = Math.max(by, right.y) + 4 / effScale
              res.segs.push({ axis: 'h', a: bx + bw, b: right.x, cross: yMid })
              snapped = true
            }
          }
        }
      }

      // ── Vertikaler Gleichabstand (Lücken entlang y) ────────────────────────
      if (!lockedH) {
        const col = others.filter(o => (o.x < bx + bw) && (o.x + o.w > bx))
        let top = null, bottom = null
        for (const o of col) {
          if (o.y + o.h <= by + tol) { if (!top || o.y + o.h > top.y + top.h) top = o }
          if (o.y >= by + bh - tol) { if (!bottom || o.y < bottom.y) bottom = o }
        }
        let snapped = false
        if (top && bottom) {
          const gapT = by - (top.y + top.h)
          const gapB = bottom.y - (by + bh)
          if (Math.abs(gapT - gapB) < tol * 2) {
            const shift = (gapB - gapT) / 2
            res.dy = shift; by += shift
            const xMid = Math.max(bx, top.x, bottom.x) + 4 / effScale
            res.segs.push({ axis: 'v', a: top.y + top.h, b: by, cross: xMid })
            res.segs.push({ axis: 'v', a: by + bh, b: bottom.y, cross: xMid })
            snapped = true
          }
        }
        if (!snapped && top && !bottom) {
          const G = findKnownGapV(col, top, tol)
          if (G != null) {
            const targetTop = top.y + top.h + G
            const diff = targetTop - by
            if (Math.abs(diff) < tol) {
              res.dy = diff; by += diff
              const xMid = Math.max(bx, top.x) + 4 / effScale
              res.segs.push({ axis: 'v', a: top.y + top.h, b: by, cross: xMid })
              snapped = true
            }
          }
        }
        if (!snapped && bottom && !top) {
          const G = findKnownGapV(col, bottom, tol)
          if (G != null) {
            const targetBottom = bottom.y - G
            const diff = targetBottom - (by + bh)
            if (Math.abs(diff) < tol) {
              res.dy = diff; by += diff
              const xMid = Math.max(bx, bottom.x) + 4 / effScale
              res.segs.push({ axis: 'v', a: by + bh, b: bottom.y, cross: xMid })
              snapped = true
            }
          }
        }
      }
    } catch (_e) { /* Gleichabstand darf nie crashen */ }
    return res
  }

  // Sucht in einer Objektreihe (horizontal überlappend) eine bekannte horizontale
  // Lücke G zwischen zwei direkt benachbarten Objekten, die NICHT 'anchor' sind,
  // und liefert sie (oder null). Liefert die erste plausible (kleinste >0) Lücke.
  function findKnownGapH(row, anchor, tol) {
    try {
      const sorted = row.filter(o => o !== anchor).slice().sort((a, b) => a.x - b.x)
      for (let i = 0; i < sorted.length - 1; i++) {
        const g = sorted[i + 1].x - (sorted[i].x + sorted[i].w)
        if (g > tol) return g
      }
    } catch (_e) {}
    return null
  }
  function findKnownGapV(col, anchor, tol) {
    try {
      const sorted = col.filter(o => o !== anchor).slice().sort((a, b) => a.y - b.y)
      for (let i = 0; i < sorted.length - 1; i++) {
        const g = sorted[i + 1].y - (sorted[i].y + sorted[i].h)
        if (g > tol) return g
      }
    } catch (_e) {}
    return null
  }

  // Snapping während des Drags einer einzelnen Node. Verschiebt die Node-Position so,
  // dass eine ihrer Snap-Kanten/Mitten an einer Guide-Linie ausgerichtet wird, und
  // zeichnet die Treffer als Hilfslinien.
  function applyDragSnap(node, skipIds) {
    if (!node) return
    try {
      const tol = SNAP_PX / effScale
      const { vertical, horizontal } = collectGuideLines(skipIds)
      // Bounding-Box der Node in Stage-lokalen Koordinaten.
      const box = node.getClientRect({ relativeTo: node.getStage() })
      // getClientRect({relativeTo: stage}) liefert bereits STAGE-LOKALE (unskalierte) Koordinaten.
      const bx = box.x, by = box.y, bw = box.width, bh = box.height
      // Kandidaten-Punkte des bewegten Objekts (links/mitte/rechts, oben/mitte/unten).
      const objV = [bx, bx + bw / 2, bx + bw]
      const objH = [by, by + bh / 2, by + bh]
      let bestV = null, bestH = null
      for (let i = 0; i < objV.length; i++) {
        for (const g of vertical) {
          const diff = Math.abs(objV[i] - g)
          if (diff < tol && (!bestV || diff < bestV.diff)) bestV = { line: g, delta: g - objV[i], diff }
        }
      }
      for (let i = 0; i < objH.length; i++) {
        for (const g of horizontal) {
          const diff = Math.abs(objH[i] - g)
          if (diff < tol && (!bestH || diff < bestH.diff)) bestH = { line: g, delta: g - objH[i], diff }
        }
      }
      const drawnV = [], drawnH = []
      if (bestV) { node.x(node.x() + bestV.delta); drawnV.push(bestV.line) }
      if (bestH) { node.y(node.y() + bestH.delta); drawnH.push(bestH.line) }
      drawGuides(drawnV, drawnH)
      // Gleichabstand nur bei EINZEL-Drag und nur für Achsen, die Kanten/Mitte-Snap
      // NICHT schon beansprucht hat (kein Konflikt). Indikatoren oben drauf zeichnen.
      if (!skipIds || skipIds.length <= 1) {
        const es = equalSpacingSnap(node, skipIds, !!bestV, !!bestH)
        if (es.dx) node.x(node.x() + es.dx)
        if (es.dy) node.y(node.y() + es.dy)
        if (es.segs && es.segs.length) drawSpacingIndicators(es.segs)
      }
    } catch (_e) { /* Snapping darf nie crashen */ }
  }

  // Snapping während des SKALIERENS einer Node über den Transformer. Die AKTIV
  // bewegten Kanten (je nach Anker) snappen an Guide-Linien; die gegenüberliegende
  // (Anker-)Kante bleibt fix. Wir berechnen die gewünschte Stage-lokale Box und
  // setzen scaleX/scaleY + x/y entsprechend. Rotierte Nodes werden übersprungen.
  function applyResizeSnap(node, anchor, skipIds) {
    if (!node) return
    try {
      // Bei Rotation würde die einfache Box-Mathematik falsch werden → kein Snap.
      if ((node.rotation() || 0) !== 0) { clearGuides(); return }
      const a = anchor || ''
      const leftActive = a.includes('left')
      const rightActive = a.includes('right')
      const topActive = a.includes('top')
      const bottomActive = a.includes('bottom')
      // 'middle-*'/'top-center'/'bottom-center' bewegen nur eine Achse — passt automatisch
      // (left/right bzw. top/bottom-Flags decken das ab; 'center' ohne Kante = inaktiv).
      const tol = SNAP_PX / effScale
      const { vertical, horizontal } = collectGuideLines(skipIds)
      const box = node.getClientRect({ relativeTo: node.getStage() })
      // getClientRect({relativeTo: stage}) liefert STAGE-LOKALE (unskalierte) Koordinaten.
      let bx = box.x, by = box.y, bw = box.width, bh = box.height
      const drawnV = [], drawnH = []

      // ── Aktive vertikale Kante(n) snappen ──────────────────────────────────
      // Linke Kante bewegt → rechte (bx+bw) bleibt fix. Umgekehrt für rechts.
      if (leftActive && !rightActive) {
        let best = null
        for (const g of vertical) { const d = Math.abs(bx - g); if (d < tol && (!best || d < best.d)) best = { g, d } }
        if (best) { const fixedRight = bx + bw; bx = best.g; bw = Math.max(1, fixedRight - bx); drawnV.push(best.g) }
      } else if (rightActive && !leftActive) {
        let best = null
        const edge = bx + bw
        for (const g of vertical) { const d = Math.abs(edge - g); if (d < tol && (!best || d < best.d)) best = { g, d } }
        if (best) { bw = Math.max(1, best.g - bx); drawnV.push(best.g) }
      }

      // ── Aktive horizontale Kante(n) snappen ────────────────────────────────
      if (topActive && !bottomActive) {
        let best = null
        for (const g of horizontal) { const d = Math.abs(by - g); if (d < tol && (!best || d < best.d)) best = { g, d } }
        if (best) { const fixedBottom = by + bh; by = best.g; bh = Math.max(1, fixedBottom - by); drawnH.push(best.g) }
      } else if (bottomActive && !topActive) {
        let best = null
        const edge = by + bh
        for (const g of horizontal) { const d = Math.abs(edge - g); if (d < tol && (!best || d < best.d)) best = { g, d } }
        if (best) { bh = Math.max(1, best.g - by); drawnH.push(best.g) }
      }

      // Gewünschte Box auf die Node anwenden. node.width()/height() sind die
      // ungeskalierten Eigenmaße; scaleX/scaleY = Zielbreite/Eigenbreite.
      if (drawnV.length || drawnH.length) {
        const nw = node.width() || 1, nh = node.height() || 1
        if (drawnV.length) { node.scaleX(bw / nw); node.x(bx) }
        if (drawnH.length) { node.scaleY(bh / nh); node.y(by) }
      }
      drawGuides(drawnV, drawnH)
    } catch (_e) { /* Resize-Snap darf nie crashen */ }
  }

  // Snapping nach einem Pfeiltasten-Nudge (kein Live-Node-Drag). Liest die aktuelle
  // Stage-lokale Box des Objekts via Konva-Node, sucht Kanten/Mitte-Snap und liefert
  // die Korrektur { dx, dy } in DESIGN-Koordinaten zurück + zeichnet die Hilfslinien.
  // Engere Toleranz (SNAP_PX/2), damit wiederholtes Drücken NICHT an einer Linie klebt.
  function snapAfterNudge(id, dx = 0, dy = 0) {
    const out = { dx: 0, dy: 0 }
    try {
      const node = stageRef.current?.findOne('#' + id)
      if (!node) return out
      if ((node.rotation() || 0) !== 0) return out
      const tol = SNAP_PX / effScale
      const { vertical, horizontal } = collectGuideLines([id])
      const box = node.getClientRect({ relativeTo: node.getStage() })
      const bx = box.x, by = box.y, bw = box.width, bh = box.height
      const drawnV = [], drawnH = []
      // Nur die tatsächlich bewegte Achse snappen (Pfeil bewegt genau eine Achse).
      if (dx !== 0) {
        const edges = [bx, bx + bw / 2, bx + bw]
        let best = null
        for (const e of edges) for (const g of vertical) { const d = Math.abs(e - g); if (d < tol && (!best || d < best.d)) best = { line: g, delta: g - e, d } }
        if (best) {
          // Schon an dieser Linie angedockt/in der Zone? → frei weiter (kein Snap).
          if (nudgeIgnoreRef.current.x !== best.line) { out.dx = best.delta; drawnV.push(best.line) }
          nudgeIgnoreRef.current.x = best.line
        } else {
          nudgeIgnoreRef.current.x = null   // Zone verlassen → wieder snap-bar
        }
      }
      if (dy !== 0) {
        const edges = [by, by + bh / 2, by + bh]
        let best = null
        for (const e of edges) for (const g of horizontal) { const d = Math.abs(e - g); if (d < tol && (!best || d < best.d)) best = { line: g, delta: g - e, d } }
        if (best) {
          if (nudgeIgnoreRef.current.y !== best.line) { out.dy = best.delta; drawnH.push(best.line) }
          nudgeIgnoreRef.current.y = best.line
        } else {
          nudgeIgnoreRef.current.y = null
        }
      }
      if (drawnV.length || drawnH.length) {
        drawGuides(drawnV, drawnH)
        // Transiente Hilfslinien nach kurzer Zeit wieder ausblenden.
        if (guideTimerRef.current) { clearTimeout(guideTimerRef.current); guideTimerRef.current = null }
        guideTimerRef.current = setTimeout(() => { clearGuides(); guideTimerRef.current = null }, 700)
      }
    } catch (_e) { /* Nudge-Snap darf nie crashen */ }
    return out
  }

  // ─── Render-Helfer für Konva-Objekte ───────────────────────────────────────
  // Live-Zuschnitt eines Bildes beim Ziehen an einem Seiten-Anker (kein Verzerren):
  // Frame-Maß folgt dem Anker, die Quell-Skalierung bleibt konstant (Basis aus
  // onTransformStart), die crop-Region wächst/schrumpft, geklemmt an die Bildgrenzen.
  function liveCropImage(node, anchor) {
    const b = cropDragRef.current
    if (!b) return
    if (anchor === 'middle-left' || anchor === 'middle-right') {
      let newW = Math.max(8, node.width() * node.scaleX())
      let cw = newW / b.sPx
      let cx = anchor === 'middle-left' ? (b.cx0 + b.cw0 - cw) : b.cx0
      if (cx < 0) { cw += cx; cx = 0 }
      if (cx + cw > b.natW) cw = b.natW - cx
      cw = Math.max(1, cw); newW = cw * b.sPx
      node.scaleX(1); node.width(newW)
      node.crop({ x: cx, y: b.cy0, width: cw, height: b.ch0 })
    } else {
      let newH = Math.max(8, node.height() * node.scaleY())
      let ch = newH / b.sPy
      let cy = anchor === 'top-center' ? (b.cy0 + b.ch0 - ch) : b.cy0
      if (cy < 0) { ch += cy; cy = 0 }
      if (cy + ch > b.natH) ch = b.natH - cy
      ch = Math.max(1, ch); newH = ch * b.sPy
      node.scaleY(1); node.height(newH)
      node.crop({ x: b.cx0, y: cy, width: b.cw0, height: ch })
    }
    try { node.getLayer()?.batchDraw() } catch (_e) {}
  }

  const off = { x: baseCrop ? baseCrop.x : 0, y: baseCrop ? baseCrop.y : 0 }

  // Doppelklick auf ein Nicht-Text-Objekt: "Verzerren"-Modus für genau dieses Objekt
  // umschalten (Rahmen wird orange, Anker werden eckig → freies, nicht-proportionales
  // Skalieren). Text behält seinen eigenen Doppelklick (Inline-Bearbeitung).
  function onObjectDblClick(o, e) {
    if (cropMode || aiMode) return
    if (!o || o.type === 'text' || o.locked) return
    try { e?.cancelBubble && (e.cancelBubble = true) } catch (_e) {}
    setSelectedIds([o.id])
    if (o.type === 'mockup' && o.kind === 'photo') { setQuadEditId(prev => (prev === o.id ? null : o.id)); return }
    setDistortId(prev => (prev === o.id ? null : o.id))
  }

  // ─── Format-Painter (Stil kopieren) ────────────────────────────────────────
  function captureStyle(o) {
    const KEYS = ['fill','stroke','strokeWidth','cornerRadius','opacity','shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY','effect','fontFamily','fontSize','fontStyle','align','lineHeight','letterSpacing','textDecoration']
    const style = {}; KEYS.forEach(k => { if (o[k] !== undefined) style[k] = o[k] })
    return { type: o.type, style }
  }
  function startCopyStyle() {
    const o = objects.find(x => x.id === selectedId); if (!o) return
    copyStyleRef.current = captureStyle(o); setCopyStyleActive(true)
  }
  function applyCopiedStyle(targetId) {
    const src = copyStyleRef.current; if (!src) return
    const target = objects.find(o => o.id === targetId); if (!target) return
    const ALLOW = {
      text:    ['fill','effect','opacity','fontFamily','fontSize','fontStyle','align','lineHeight','letterSpacing','textDecoration','shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY'],
      rect:    ['fill','stroke','strokeWidth','cornerRadius','opacity','shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY'],
      ellipse: ['fill','stroke','strokeWidth','opacity','shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY'],
      line:    ['stroke','strokeWidth','opacity'],
      arrow:   ['fill','stroke','strokeWidth','opacity'],
      sticker: ['fill','stroke','strokeWidth','opacity'],
      image:   ['opacity','cornerRadius','shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY'],
    }[target.type] || ['opacity']
    const patch = {}; ALLOW.forEach(k => { if (src.style[k] !== undefined) patch[k] = src.style[k] })
    if (Object.keys(patch).length) { commitHistoryOnce(); updateObject(targetId, patch, false); endInteraction() }
  }

  // Klick auf ein Objekt: Shift → zur Auswahl togglen, sonst Einzel-Auswahl.
  function selectFromClick(id, e) {
    if (cropMode || aiMode) return
    if (copyStyleRef.current && !e?.evt?.shiftKey) {
      applyCopiedStyle(id); copyStyleRef.current = null; setCopyStyleActive(false); setSelectedIds([id]); return
    }
    const shift = e?.evt?.shiftKey
    if (shift) {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    } else {
      // Klick auf bereits mehrfach-selektiertes Objekt: Gruppe behalten (Drag der Gruppe).
      setSelectedIds(prev => prev.includes(id) && prev.length > 1 ? prev : [id])
    }
  }

  function renderObject(o) {
    if (o.hidden) return null   // ausgeblendete Ebene: nicht rendern
    const locked = !!o.locked
    const base = {
      id: o.id,
      // Gesperrte Ebenen: nicht ziehbar, nicht selektierbar (listening aus).
      draggable: !locked && !cropMode && !aiMode && !editingTextId && !spaceActive && activeTool !== 'draw',
      listening: !locked && !spaceActive && activeTool !== 'draw',
      x: (o.x ?? 0) - off.x,
      y: (o.y ?? 0) - off.y,
      rotation: o.rotation || 0,
      opacity: o.opacity == null ? 1 : o.opacity,
      onClick: (e) => selectFromClick(o.id, e),
      onTap: (e) => selectFromClick(o.id, e),
      // Doppelklick → Verzerren-Modus umschalten (Text überschreibt das weiter unten
      // mit seiner Inline-Bearbeitung).
      onDblClick: (e) => onObjectDblClick(o, e),
      onDblTap: (e) => onObjectDblClick(o, e),
      onDragStart: () => pushHistory(),
      // Smart-Guides: während des Ziehens snappen + Hilfslinien zeigen.
      onDragMove: (e) => {
        const node = e.target
        const ids = selectedIds.includes(o.id) && selectedIds.length > 1 ? selectedIds : [o.id]
        applyDragSnap(node, ids)
        if (o.type === 'image' && ids.length === 1) {
          const cx = node.x() + off.x + (o.width || 0) / 2, cy = node.y() + off.y + (o.height || 0) / 2
          const hit = [...objects].reverse().find(t => (t.type === 'frame' || t.type === 'mockup') && t.id !== o.id && cx >= t.x && cx <= t.x + (t.width || 0) && cy >= t.y && cy <= t.y + (t.height || 0))
          setFrameDropTarget(hit ? hit.id : null)
        }
      },
      onDragEnd: (e) => {
        clearGuides()
        setFrameDropTarget(null)
        // Bei Gruppen-Drag bewegt der Transformer mehrere Nodes — jede Node hier
        // einzeln in ihren Objekt-State zurückschreiben.
        const dxNode = e.target
        const node = dxNode
        const ids = selectedIds.includes(o.id) && selectedIds.length > 1 ? selectedIds : [o.id]
        if (ids.length > 1) {
          const stage = stageRef.current
          skipHistoryRef.current = true
          ids.forEach(id => {
            const n = stage?.findOne('#' + id)
            if (n) updateObject(id, { x: n.x() + off.x, y: n.y() + off.y }, false)
          })
          setTimeout(() => { skipHistoryRef.current = false }, 0)
        } else {
          const nx = node.x() + off.x, ny = node.y() + off.y
          // Bild über einen Rahmen/Mockup fallen gelassen? → Bild einsetzen (cover), Bild-Objekt entfernen.
          if (o.type === 'image' && o.src) {
            const cx = nx + (o.width || 0) / 2, cy = ny + (o.height || 0) / 2
            const frame = [...objects].reverse().find(t => (t.type === 'frame' || t.type === 'mockup') && t.id !== o.id && cx >= t.x && cx <= t.x + (t.width || 0) && cy >= t.y && cy <= t.y + (t.height || 0))
            if (frame) {
              pushHistory()
              const srcVal = o.src
              setObjects(prev => prev.filter(p => p.id !== o.id).map(p => p.id === frame.id ? { ...p, src: srcVal } : p))
              setSelectedIds([frame.id])
              return
            }
          }
          updateObject(o.id, { x: nx, y: ny }, false)
        }
      },
      onTransformStart: () => {
        pushHistory()
        if (o.type === 'image') {
          const el = imgCache[o.src]
          const natW = (el && (el.naturalWidth || el.width)) || o.width || 1
          const natH = (el && (el.naturalHeight || el.height)) || o.height || 1
          const cw0 = o.cropWidth || natW, ch0 = o.cropHeight || natH
          cropDragRef.current = { natW, natH, cw0, ch0, cx0: o.cropX || 0, cy0: o.cropY || 0, sPx: (o.width || 1) / cw0, sPy: (o.height || 1) / ch0 }
        } else { cropDragRef.current = null }
      },
      onTransform: (e) => {
        const node = e.target
        let anchor = ''
        try { anchor = trRef.current?.getActiveAnchor() || '' } catch (_e) {}
        // Drehen: nur das Live-Grad-Badge zeichnen (kein Kanten-Snap-Overhead) → flüssig.
        if (anchor === 'rotater') { drawRotationBadge(node); return }
        // Smart-Guides auch beim Skalieren: aktive Kante(n) snappen + Hilfslinien zeigen.
        // Im proportionalen Modus (Nicht-Text, kein Verzerren) wird das achsenweise
        // Kanten-Snapping übersprungen, da es sonst das Seitenverhältnis verzerren würde.
        const _side = anchor === 'middle-left' || anchor === 'middle-right' || anchor === 'top-center' || anchor === 'bottom-center'
        if (o.type === 'image' && _side && distortId !== o.id) { liveCropImage(node, anchor); return }
        const isText = o.type === 'text'
        const singleSel = selectedIds.length === 1 && selectedIds[0] === o.id
        const proportional = singleSel && !isText && distortId !== o.id
        if (proportional) return
        applyResizeSnap(node, anchor, [o.id])
      },
      onTransformEnd: (e) => {
        clearGuides()
        const node = e.target
        const patch = { rotation: node.rotation(), x: node.x() + off.x, y: node.y() + off.y }
        if (o.type === 'text') {
          // B2: ECKEN → proportional (fontSize folgt dem gleichmäßigen Scale),
          // SEITEN (middle-left/right) → nur Breite (Umbruch). Der aktive Anker liefert
          // den zuverlässigsten Hinweis; Fallback über den Achsen-Vergleich.
          const scx = node.scaleX(), scy = node.scaleY()
          let anchor = ''
          try { anchor = trRef.current?.getActiveAnchor() || '' } catch (_e) {}
          const isSideAnchor = anchor === 'middle-left' || anchor === 'middle-right'
          const isTopBottom = anchor === 'top-center' || anchor === 'bottom-center'
          if (isSideAnchor) {
            // nur Breite ändern, fontSize bleibt
            patch.width = Math.max(20, (node.width() * scx))
          } else if (isTopBottom) {
            // vertikales Ziehen am Text: fontSize folgt scaleY
            patch.fontSize = Math.max(6, (o.fontSize || 44) * scy)
          } else {
            // Eck-Anker (oder unbekannt) → proportional: fontSize + Breite gemeinsam.
            const s = scx
            patch.fontSize = Math.max(6, (o.fontSize || 44) * s)
            patch.width = Math.max(20, (node.width() * s))
          }
          node.scaleX(1); node.scaleY(1)
        } else if (o.type === 'rect') {
          patch.width = Math.max(4, node.width() * node.scaleX())
          patch.height = Math.max(4, node.height() * node.scaleY())
          node.scaleX(1); node.scaleY(1)
        } else if (o.type === 'image') {
          let anchor = ''
          try { anchor = trRef.current?.getActiveAnchor() || '' } catch (_e) {}
          const isSide = anchor === 'middle-left' || anchor === 'middle-right' || anchor === 'top-center' || anchor === 'bottom-center'
          if (isSide && distortId !== o.id) {
            // Live-Crop hat node bereits gesetzt (Breite/Höhe + crop, scale=1) → übernehmen.
            patch.width = Math.max(8, node.width())
            patch.height = Math.max(8, node.height())
            try { const c = node.crop(); if (c) { patch.cropX = c.x; patch.cropY = c.y; patch.cropWidth = c.width; patch.cropHeight = c.height } } catch (_e) {}
          } else {
            // Ecke → ganze Größe skalieren, Crop-Region beibehalten.
            patch.width = Math.max(4, node.width() * node.scaleX())
            patch.height = Math.max(4, node.height() * node.scaleY())
            if (o.cropWidth) { patch.cropX = o.cropX || 0; patch.cropY = o.cropY || 0; patch.cropWidth = o.cropWidth; patch.cropHeight = o.cropHeight }
          }
          node.scaleX(1); node.scaleY(1)
          cropDragRef.current = null
        } else if (o.type === 'ellipse') {
          patch.radiusX = Math.max(2, (o.radiusX || 90) * node.scaleX())
          patch.radiusY = Math.max(2, (o.radiusY || 90) * node.scaleY())
          node.scaleX(1); node.scaleY(1)
        } else if (o.type === 'frame' || o.type === 'mockup') {
          patch.width = Math.max(8, (o.width || 100) * node.scaleX())
          patch.height = Math.max(8, (o.height || 100) * node.scaleY())
          node.scaleX(1); node.scaleY(1)
        } else {
          patch.scaleX = node.scaleX(); patch.scaleY = node.scaleY()
        }
        updateObject(o.id, patch, false)
      },
    }
    switch (o.type) {
      case 'text': {
        // Effekt-Props (Schatten/Glühen/Lift/Neon) haben Vorrang; ohne Effekt greift
        // optional ein manuell gesetzter Schatten (shadowBlur am Objekt).
        const effProps = (o.effect && o.effect !== 'none') ? textEffectProps(o) : {}
        return <KText key={o.id} {...base} text={o.text} fontSize={o.fontSize} fontFamily={o.fontFamily}
          {...fillKonvaProps(o, o.width || 360, (o.fontSize || 44) * 1.35, false)} fontStyle={o.fontStyle || 'normal'} align={o.align || 'left'} width={o.width || 360}
          lineHeight={o.lineHeight || 1.2} letterSpacing={o.letterSpacing || 0} textDecoration={o.textDecoration || ''}
          shadowColor={o.shadowColor} shadowBlur={o.shadowBlur || 0} shadowOffsetX={o.shadowOffsetX || 0} shadowOffsetY={o.shadowOffsetY || 0}
          {...effProps}
          visible={editingTextId !== o.id}
          onDblClick={() => startTextEdit(o.id)} onDblTap={() => startTextEdit(o.id)} />
      }
      case 'rect':
        return <Rect key={o.id} {...base} width={o.width} height={o.height} {...fillKonvaProps(o, o.width, o.height, false)} stroke={o.stroke} strokeWidth={o.strokeWidth || 0} cornerRadius={o.cornerRadius || 0} />
      case 'ellipse':
        return <Ellipse key={o.id} {...base} radiusX={o.radiusX} radiusY={o.radiusY} {...fillKonvaProps(o, 2 * (o.radiusX || 90), 2 * (o.radiusY || 90), true)} stroke={o.stroke} strokeWidth={o.strokeWidth || 0} />
      case 'line':
        return <Line key={o.id} {...base} points={o.points} stroke={o.stroke} strokeWidth={o.strokeWidth || 6} lineCap={o.lineCap || 'round'} lineJoin="round" tension={o.tension ?? 0} globalCompositeOperation={o.gco || 'source-over'} scaleX={(o.flipX ? -1 : 1) * (o.scaleX || 1)} scaleY={(o.flipY ? -1 : 1) * (o.scaleY || 1)} />
      case 'arrow':
        return <Arrow key={o.id} {...base} points={o.points} stroke={o.stroke} fill={o.fill} strokeWidth={o.strokeWidth || 6} pointerLength={o.pointerLength || 18} pointerWidth={o.pointerWidth || 18} scaleX={(o.flipX ? -1 : 1) * (o.scaleX || 1)} scaleY={(o.flipY ? -1 : 1) * (o.scaleY || 1)} />
      case 'sticker':
        return <Path key={o.id} {...base} data={o.d} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth || 0} scaleX={(o.flipX ? -1 : 1) * (o.scaleX || 1)} scaleY={(o.flipY ? -1 : 1) * (o.scaleY || 1)} />
      case 'image': {
        const el = imgCache[o.src]
        if (!el) return null   // wird nachgeladen (Effekt), dann re-render
        const cropProp = (o.cropWidth && o.cropHeight)
          ? { x: o.cropX || 0, y: o.cropY || 0, width: o.cropWidth, height: o.cropHeight }
          : undefined
        return <KImage key={o.id} {...base} image={el} width={o.width} height={o.height} crop={cropProp} />
      }
      case 'frame': {
        const shp = frameShapeById(o.shape)
        const el = o.src ? imgCache[o.src] : null
        const fit = el ? frameCoverFit(el.naturalWidth || el.width, el.naturalHeight || el.height, o.width, o.height, o.panX, o.panY) : null
        const editing = !!el && distortId === o.id
        return (
          <Group key={o.id} {...base} draggable={base.draggable && !editing} clipFunc={(ctx) => shp.clip(ctx, o.width, o.height)}>
            {el && fit
              ? <KImage image={el} x={fit.x} y={fit.y} width={fit.width} height={fit.height}
                  draggable={editing}
                  onDragStart={editing ? () => pushHistory() : undefined}
                  onDragMove={editing ? (e) => { const n = e.target; const minX = o.width - fit.width, minY = o.height - fit.height; n.x(Math.max(minX, Math.min(0, n.x()))); n.y(Math.max(minY, Math.min(0, n.y()))) } : undefined}
                  onDragEnd={editing ? (e) => { const n = e.target; const rx = o.width - fit.width, ry = o.height - fit.height; const nx = Math.max(rx, Math.min(0, n.x())), ny = Math.max(ry, Math.min(0, n.y())); updateObject(o.id, { panX: rx ? nx / rx : 0.5, panY: ry ? ny / ry : 0.5 }, false) } : undefined} />
              : (<>
                  <Rect width={o.width} height={o.height} fill="#EEF2F7" />
                  <KText text="Bild einsetzen" width={o.width} y={o.height / 2 - 9} align="center" fontSize={Math.max(11, Math.min(16, o.width * 0.06))} fill="#93A2B5" listening={false} />
                </>)}
            {editing && <Rect width={o.width} height={o.height} stroke="#315AE7" strokeWidth={2} dash={[6, 4]} listening={false} />}
            {o.id === frameDropTarget && <Rect width={o.width} height={o.height} fill="rgba(49,90,231,0.32)" listening={false} />}
          </Group>
        )
      }
      case 'mockup': {
        const dev = deviceById(o.device)
        const el = o.src ? imgCache[o.src] : null
        const mquad = mockupQuad(o)
        if (mquad) {
          const isPhoto = o.kind === 'photo'
          const bg = isPhoto && o.photoSrc ? imgCache[o.photoSrc] : null
          const editing = isPhoto && quadEditId === o.id
          const pts = mquad.flatMap(p => [p.x, p.y])
          const wc = el ? warpCache[warpKey(o)] : null
          const xs = mquad.map(p => p.x), ys = mquad.map(p => p.y)
          const qx = Math.min(...xs), qy = Math.min(...ys), qw = Math.max(...xs) - qx, qh = Math.max(...ys) - qy
          return (
            <Group key={o.id} {...base} draggable={base.draggable && !editing}>
              {isPhoto
                ? (bg ? <KImage image={bg} width={o.width} height={o.height} /> : <Rect width={o.width} height={o.height} fill="#EEF2F7" cornerRadius={6} />)
                : (dev.behind ? dev.behind(o.width, o.height) : null)}
              {el && wc
                ? <KImage image={wc} x={0} y={0} width={o.width} height={o.height} listening={false} />
                : (<>
                    {!isPhoto && <Line points={pts} closed fill="#EEF2F7" stroke="#C7D0DB" strokeWidth={1} />}
                    {isPhoto && bg && !editing && <Line points={pts} closed fill="rgba(49,90,231,0.10)" stroke="#315AE7" strokeWidth={1.5} dash={[5, 4]} listening={false} />}
                    {(!isPhoto || !bg) && <KText text={isPhoto ? 'Foto lädt…' : 'Bild einsetzen'} x={qx} y={qy + qh / 2 - 8} width={qw} align="center" fontSize={Math.max(10, Math.min(15, qw * 0.06))} fill="#93A2B5" listening={false} />}
                  </>)}
              {!isPhoto && dev.front ? dev.front(o.width, o.height) : null}
              {editing && (<>
                <Line points={pts} closed stroke="#315AE7" strokeWidth={2} dash={[6, 4]} listening={false} />
                {mquad.map((p, idx) => (
                  <Circle key={'qh' + idx} x={p.x} y={p.y} radius={8} fill="#ffffff" stroke="#315AE7" strokeWidth={2}
                    draggable
                    onDragMove={(e) => { const n = e.target; const u = Math.max(0, Math.min(1, n.x() / o.width)), v = Math.max(0, Math.min(1, n.y() / o.height)); setQuadCorner(o.id, idx, u, v) }}
                    onDragEnd={() => pushHistory()} />
                ))}
              </>)}
              {o.id === frameDropTarget && <Line points={pts} closed fill="rgba(49,90,231,0.32)" listening={false} />}
            </Group>
          )
        }
        const scr = dev.screen(o.width, o.height)
        const fit = el ? frameCoverFit(el.naturalWidth || el.width, el.naturalHeight || el.height, scr.w, scr.h, o.panX, o.panY) : null
        const mockEditing = !!el && distortId === o.id
        return (
          <Group key={o.id} {...base} draggable={base.draggable && !mockEditing}>
            {dev.behind(o.width, o.height)}
            <Group x={scr.x} y={scr.y} clipFunc={(ctx) => { if (scr.r) _froundClip(ctx, scr.w, scr.h, scr.r); else _rectClipLocal(ctx, scr.w, scr.h) }}>
              {el && fit
                ? <KImage image={el} x={fit.x} y={fit.y} width={fit.width} height={fit.height}
                    draggable={mockEditing}
                    onDragStart={mockEditing ? () => pushHistory() : undefined}
                    onDragMove={mockEditing ? (e) => { const n = e.target; const minX = scr.w - fit.width, minY = scr.h - fit.height; n.x(Math.max(minX, Math.min(0, n.x()))); n.y(Math.max(minY, Math.min(0, n.y()))) } : undefined}
                    onDragEnd={mockEditing ? (e) => { const n = e.target; const rx = scr.w - fit.width, ry = scr.h - fit.height; const nx = Math.max(rx, Math.min(0, n.x())), ny = Math.max(ry, Math.min(0, n.y())); updateObject(o.id, { panX: rx ? nx / rx : 0.5, panY: ry ? ny / ry : 0.5 }, false) } : undefined} />
                : (<>
                    <Rect width={scr.w} height={scr.h} fill="#EEF2F7" />
                    <KText text="Bild einsetzen" width={scr.w} y={scr.h / 2 - 8} align="center" fontSize={Math.max(10, Math.min(15, scr.w * 0.06))} fill="#93A2B5" listening={false} />
                  </>)}
              {mockEditing && <Rect width={scr.w} height={scr.h} stroke="#315AE7" strokeWidth={2} dash={[6, 4]} listening={false} />}
            </Group>
            {dev.front ? dev.front(o.width, o.height) : null}
            {o.id === frameDropTarget && <Rect x={scr.x} y={scr.y} width={scr.w} height={scr.h} fill="rgba(49,90,231,0.32)" listening={false} />}
          </Group>
        )
      }
      default:
        return null
    }
  }

  // ─── UI ────────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Designer konnte das Bild nicht laden</div>
        <div style={{ fontSize: 12 }}>{loadError}</div>
      </div>
    )
  }

  const dispW = stageSize.width * effScale
  const dispH = stageSize.height * effScale
  const aiActive = !!aiMode
  const zoomPct = Math.round(effScale * 100)
  // Panel docken (breite Ansicht) oder als Overlay (schmal/Split-View).
  // dock (Sidebar) vs. Popup: anhand der STABILEN Gesamtbreite, nicht der Canvas-
  // Breite (die schrumpft beim Andocken) → kein Auf/Zu-Zittern. Split-Pane → Popup,
  // Vollbild → angedockte Sidebar.
  const dockPanel = rootW >= 960
  // Schriftliste inkl. Brand-Fonts (für ContextBar-Dropdown).
  const allFonts = [...FONTS, ...brandFontFamilies.filter(f => !FONTS.includes(f))]
  const brandColors = extractBrandColors(brandData)
  // Transform-Modus der aktuellen Einzel-Auswahl bestimmen.
  //   • Text                → unverändertes Verhalten (keepRatio=false, eigene Logik)
  //   • Nicht-Text, normal   → proportional (keepRatio=true, Verzerren gesperrt)
  //   • Nicht-Text, Verzerren→ frei (keepRatio=false, orange Anker), nach Doppelklick
  const singleSelObj = selectedIds.length === 1 ? objects.find(o => o.id === selectedIds[0]) : null
  const distortActive = !!(singleSelObj && singleSelObj.type !== 'text' && distortId === singleSelObj.id)
  const lockRatio = !!(singleSelObj && singleSelObj.type !== 'text' && !distortActive)

  return (
    <div ref={activeRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Versteckter file-input für Bild-Upload */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; onPickImageFile(f); e.target.value = '' }} />
      {/* Tier 1 — globale Werkzeugleiste: links Undo/Redo + Zoom, rechts Format/Export/Speichern */}
      <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 6, padding: '9px 10px', borderBottom: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', flexShrink: 0, overflow: 'hidden' }}>
        {/* Undo / Redo */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <ToolBtn onClick={undo} title="Rückgängig (Cmd/Ctrl+Z)"><Undo2 size={15} strokeWidth={1.9} /></ToolBtn>
          <ToolBtn onClick={redo} title="Wiederholen (Cmd/Ctrl+Shift+Z)"><Redo2 size={15} strokeWidth={1.9} /></ToolBtn>
        </div>
        <div style={{ flexShrink: 0 }}><Divider /></div>
        {/* Format/Größe (links) + Design-Name (randlos, wie Dokument-Titel) — Name nimmt Restbreite */}
        <div style={{ flexShrink: 0 }}><FormatMenu onPick={applyFormatPreset} /></div>
        <input value={designName} onChange={e => commitName(e.target.value)} placeholder="Unbenanntes Design" title={designName || 'Unbenanntes Design'}
          style={{ flex: 1, minWidth: 40, border: 'none', outline: 'none', background: 'transparent', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text-primary,#101828)', fontFamily: 'inherit', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }} />

        {(autosaving || savedMsg) && (
          <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: autosaving ? 'var(--text-muted,#667085)' : (savedMsg.startsWith('Fehler') || savedMsg.startsWith('Download-Fehler') ? '#b91c1c' : '#15803d') }}>
            {autosaving && <Loader2 size={12} className="lk-spin" />}
            {autosaving ? 'Speichert…' : savedMsg}
          </span>
        )}
        <button onClick={() => openPagesAction('post')} title="In Beitrag — Seiten zu einem Beitrag hinzufügen"
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 32, borderRadius: 9, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>
          <CalendarPlus size={15} strokeWidth={1.9} />
        </button>
        <button onClick={() => openPagesAction('download')} title="Herunterladen (PDF / PNG / JPG)"
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 32, borderRadius: 9, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Download size={15} strokeWidth={1.9} />
        </button>
        <button onClick={() => openPagesAction('media')} title="Bilder in Medien speichern — einzelne oder mehrere Seiten auswählen"
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 32, borderRadius: 9, border: 'none', background: P, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(16,24,40,0.10)' }}>
          <Save size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Export-Dialog (PNG / JPG / PDF) */}
      {showExport && (
        <ExportModal onExport={handleExport} exporting={exporting} onClose={() => setShowExport(false)} />
      )}

      {/* Seiten-Dialog: Auswahl welche Seiten exportieren / als Bild speichern / zu Beitrag */}
      {pagesAction && (() => {
        const selCount = selectedPageIndices().length
        const titleTxt = pagesAction === 'post' ? 'In Beitrag' : pagesAction === 'media' ? 'In Medien speichern' : 'Herunterladen'
        // Wiederverwendbarer Seiten-Auswahl-Block (Master „Alle" + „Aktuelle" + Liste)
        const PageSelector = (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--surface-muted,#F5F7FB)', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={allPagesSelected()} onChange={toggleAllPages} style={{ width: 16, height: 16, accentColor: P, cursor: 'pointer' }} />
                Alle Seiten
              </label>
              <span style={{ width: 1, height: 18, background: 'var(--border,#E9ECF2)' }} />
              <button onClick={selectCurrentPageOnly}
                style={{ border: '1px solid var(--border,#E9ECF2)', background: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>
                Nur aktuelle Seite
              </button>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{selCount} ausgewählt</span>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2, marginBottom: 14 }}>
              {pages.map((p, i) => {
                const on = !!pageSel[i]
                return (
                  <label key={p.id || i}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 6, borderRadius: 10, cursor: 'pointer', border: '1.5px solid ' + (on ? P : 'var(--border,#E9ECF2)'), background: on ? 'rgba(49,90,231,0.05)' : '#fff' }}>
                    <input type="checkbox" checked={on} onChange={() => togglePageSel(i)} style={{ width: 16, height: 16, accentColor: P, cursor: 'pointer' }} />
                    <PageThumb page={p} active={on} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: on ? P : 'var(--text-primary)' }}>Seite {i + 1}</span>
                  </label>
                )
              })}
            </div>
          </>
        )
        return (
          <div onMouseDown={() => !pagesBusy && setPagesAction(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(16,24,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onMouseDown={e => e.stopPropagation()}
              style={{ width: 480, maxWidth: '92vw', maxHeight: '86vh', overflow: 'auto', background: 'var(--surface,#fff)', borderRadius: 14, padding: 18, boxShadow: '0 20px 60px rgba(16,24,40,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{titleTxt}</span>
                <button onClick={() => !pagesBusy && setPagesAction(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
              </div>

              {/* DOWNLOAD: Schritt 1 — Format */}
              {pagesAction === 'download' && pagesStep === 'format' && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Welches Dateiformat möchtest du herunterladen?</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {[['pdf', 'PDF', 'Alle Seiten in einer Datei'], ['png', 'PNG', 'Verlustfrei · mehrere Seiten als ZIP'], ['jpg', 'JPG', 'Kleiner · mehrere Seiten als ZIP']].map(([val, lbl, desc]) => (
                      <button key={val} onClick={() => setDlFormat(val)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: '1.5px solid ' + (dlFormat === val ? P : 'var(--border,#E9ECF2)'), background: dlFormat === val ? 'rgba(49,90,231,0.05)' : '#fff' }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid ' + (dlFormat === val ? P : 'var(--border,#C9CFDB)'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {dlFormat === val && <span style={{ width: 9, height: 9, borderRadius: '50%', background: P }} />}
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{lbl}</span>
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <SmallBtn onClick={() => setPagesStep('pages')}>Zurück</SmallBtn>
                    <PanelBtn primary disabled={pagesBusy || !selCount} onClick={executeDownload}>{pagesBusy ? 'Erstelle…' : `Herunterladen (${dlFormat.toUpperCase()})`}</PanelBtn>
                  </div>
                </>
              )}

              {/* DOWNLOAD & POST: Schritt — Seitenauswahl */}
              {pagesStep === 'pages' && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    {pagesAction === 'post' ? 'Wähle die Seiten, die als Bilder zum Beitrag hinzugefügt werden.' : pagesAction === 'media' ? 'Wähle die Seiten, die als Bilder in den Medien gespeichert werden.' : 'Wähle die Seiten, die du herunterladen möchtest.'}
                  </div>
                  {PageSelector}
                  {pagesMsg && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: pagesMsg.includes('Fehler') ? '#b91c1c' : '#15803d' }}>{pagesMsg}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span />
                    {pagesAction === 'download'
                      ? <PanelBtn primary disabled={!selCount} onClick={() => setPagesStep('format')}>Weiter</PanelBtn>
                      : pagesAction === 'media'
                      ? <PanelBtn primary disabled={pagesBusy || !selCount} onClick={executeMedia}>{pagesBusy ? 'Speichert…' : 'In Medien speichern'}</PanelBtn>
                      : <PanelBtn primary disabled={pagesBusy || !selCount} onClick={() => { setPagesStep('post'); loadPostsForPicker() }}>Weiter</PanelBtn>}
                  </div>
                </>
              )}

              {/* POST: Schritt — Beitrag wählen / neu */}
              {pagesAction === 'post' && pagesStep === 'post' && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{selCount} Seite(n) zu welchem Beitrag hinzufügen?</div>
                  <button onClick={() => executePost('new')} disabled={pagesBusy}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 12px', borderRadius: 10, cursor: pagesBusy ? 'default' : 'pointer', border: '1.5px solid ' + P, background: 'rgba(49,90,231,0.05)', marginBottom: 12 }}>
                    <PlusIcon size={18} color={P} />
                    <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: P }}>Neuen Beitrag erstellen</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>„{designName || visual?.title || 'Design'}"</span>
                    </span>
                  </button>
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={postSearch} onChange={e => setPostSearch(e.target.value)} placeholder="Bestehenden Beitrag suchen…"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 32px', borderRadius: 9, border: '1px solid var(--border,#E9ECF2)', fontSize: 13, outline: 'none' }} />
                  </div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                    {postLoading && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>Lade Beiträge…</div>}
                    {!postLoading && postList.filter(p => !postSearch || (p.title || '').toLowerCase().includes(postSearch.toLowerCase())).length === 0 &&
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>Keine Beiträge gefunden.</div>}
                    {!postLoading && postList.filter(p => !postSearch || (p.title || '').toLowerCase().includes(postSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => executePost(p.id)} disabled={pagesBusy}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '9px 10px', borderRadius: 9, cursor: pagesBusy ? 'default' : 'pointer', border: '1px solid var(--border,#E9ECF2)', background: '#fff' }}>
                        <FileText size={15} color="var(--text-muted)" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || 'Ohne Titel'}</span>
                      </button>
                    ))}
                  </div>
                  {pagesMsg && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: pagesMsg.includes('Fehler') ? '#b91c1c' : '#15803d' }}>{pagesMsg}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <SmallBtn onClick={() => setPagesStep('pages')}>Zurück</SmallBtn>
                    {pagesBusy && <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Füge hinzu…</span>}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Kontext-Leiste: Selektion / Filter / Crop / AI */}
      {selected && selectedIds.length === 1 && !cropMode && !aiActive && (
        <ContextBar selected={selected} updateObject={updateObject}
          commitHistoryOnce={commitHistoryOnce} endInteraction={endInteraction}
          reorder={reorder} deleteSelected={deleteSelected} duplicateSelected={duplicateSelected}
          onFlip={flipSelected} onCrop={() => { setCropMode(true); setCropRatio(null); setCropRect(null) }}
          onEditImage={() => setActiveTool('edit')} onOpenLayers={() => setActiveTool('layers')}
          onCopyStyle={startCopyStyle} copyStyleActive={copyStyleActive} onIconRecolor={recolorIcon}
          fonts={allFonts} brandFonts={brandFontFamilies} onFontLoad={handleFontLoad} selectedIds={selectedIds} brandColors={brandColors}
          alignObjects={alignObjects} distributeObjects={distributeObjects} />
      )}
      {selectedIds.length > 1 && !cropMode && !aiActive && (
        <MultiBar count={selectedIds.length} onDuplicate={duplicateSelected} onDelete={deleteSelected}
          updateOpacity={(v) => { const ids = new Set(selectedIds); setObjects(prev => prev.map(o => ids.has(o.id) ? { ...o, opacity: v } : o)) }}
          commitHistoryOnce={commitHistoryOnce} endInteraction={endInteraction}
          onFlip={flipSelected}
          alignObjects={alignObjects} distributeObjects={distributeObjects} />
      )}
      {/* Seite (Hintergrund) — wenn nichts ausgewählt ist: Seitenfarbe ändern */}
      {selectedIds.length === 0 && !cropMode && !aiActive && !editingTextId && (
        <div style={barStyle}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>Seite</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hintergrund</span>
          <ColorPopover value={bgColor || '#ffffff'} gradient={bgGrad || null} allowGradient brandColors={brandColors} title="Seiten-Hintergrundfarbe"
            onStart={commitHistoryOnce} onChange={(hex) => { setBgColor(hex); setBgGrad(null) }} onGradient={(g) => setBgGrad(g)} onEnd={endInteraction} />
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, maxWidth: 560 }}>
            <Sparkles size={15} strokeWidth={1.9} style={{ color: P, flexShrink: 0 }} />
            <input value={pageAiCmd} onChange={e => setPageAiCmd(e.target.value)} disabled={pageAiBusy}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runPageAiCommand(pageAiCmd) } }}
              placeholder="KI: ganze Seite bearbeiten — z.B. „mach es wärmer & die Headline größer“"
              style={{ flex: 1, minWidth: 0, height: 32, padding: '0 11px', borderRadius: 9, border: '1px solid var(--border,#E9ECF2)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: '#fff' }} />
            <SmallBtn primary disabled={pageAiBusy || !pageAiCmd.trim()} onClick={() => runPageAiCommand(pageAiCmd)}>{pageAiBusy ? 'KI…' : 'Anwenden'}</SmallBtn>
          </div>
        </div>
      )}
      {cropMode && (
        <div style={{ ...barStyle, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>Zuschneiden</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Format:</span>
          {[['Frei', null], ['Original', 'orig'], ['1:1', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16], ['3:2', 3 / 2]].map(([lbl, r]) => {
            const ratio = r === 'orig' ? (() => { const t = activeImageObj(); return t ? (t.width || 1) / (t.height || 1) : 1 })() : r
            const active = (r === null && cropRatio === null) || (typeof ratio === 'number' && Math.abs((cropRatio || 0) - ratio) < 0.001)
            return <SmallBtn key={lbl} primary={active} onClick={() => setCropToRatio(ratio)}>{lbl}</SmallBtn>
          })}
          <div style={{ flex: 1 }} />
          <SmallBtn onClick={applyCrop} primary>Anwenden</SmallBtn>
          <SmallBtn onClick={resetCrop}>Zurücksetzen</SmallBtn>
          <SmallBtn onClick={() => { setCropMode(false); setCropRect(null); setCropRatio(null) }}>Abbrechen</SmallBtn>
        </div>
      )}

      {/* KI-Masken-Hinweis (Werkzeuge stehen im KI-Panel links) */}
      {aiActive && (
        <div style={barStyle}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {aiMode === 'heal'
              ? 'Markiere das zu entfernende Objekt auf der Leinwand — die Werkzeuge findest du links im KI-Panel.'
              : 'Markiere den Bereich auf der Leinwand — Pinsel/Lasso/Rechteck und „Anwenden" findest du links im KI-Panel.'}
          </span>
          <div style={{ flex: 1 }} />
          <SmallBtn onClick={() => { setAiMode(null); setAiPrompt(''); setAiError(''); clearMask() }}>Abbrechen</SmallBtn>
        </div>
      )}

      {/* Arbeitsbereich: Werkzeug-Schiene + Panel (links) + Canvas + rechte Spalte */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
      {/* Canva-Stil: linke Werkzeug-Schiene */}
      <ToolRail active={activeTool} onSelect={(t) => setActiveTool(prev => prev === t ? null : t)} />

      {/* Werkzeug-Panel — docked (breit) oder Overlay (schmal) */}
      {activeTool && (
        <ToolPanel
          docked={dockPanel}
          tool={activeTool}
          onClose={() => setActiveTool(null)}
          penColor={penColor} setPenColor={setPenColor} penWidth={penWidth} setPenWidth={setPenWidth} onDoneDraw={() => setActiveTool(null)} brandColors={brandColors}
          activeBrush={activeBrush} onPickBrush={pickBrush}
          // Vorlagen
          onApplyTemplate={applyTemplate}
          // Elemente
          elementTab={elementTab} setElementTab={setElementTab}
          onAddRect={addRect} onAddEllipse={addEllipse} onAddLine={addLine} onAddArrow={addArrow}
          onAddFrame={addFrame}
          onAddCollage={addCollage}
          onAddMockup={addMockup}
          onAddAsset={addAsset}
          onInsertMedia={(dataUrl, meta) => addImageFromDataUrl(dataUrl, meta)}
          // Text
          onAddText={addText} onAddTextPreset={addTextPreset} onAddTextCombo={addTextCombo}
          // Uploads / Medien
          onTriggerUpload={triggerImageUpload} uploadThumbs={uploadThumbs}
          onInsertUpload={(url) => addImageFromDataUrl(url)}
          mediaLib={mediaLib} mediaLoading={mediaLoading}
          onInsertMediaItem={(storagePath) => insertMediaFromPath(storagePath)}
          // Marke
          brandData={brandData} brandLoading={brandLoading}
          onApplyBrandColor={applyBrandColor} onInsertBrandLogo={insertBrandLogo} onApplyBrandFont={applyBrandFont}
          hasSelection={selectedIds.length > 0}
          // KI
          aiMode={aiMode} setAiMode={setAiMode}
          maskTool={maskTool} setMaskTool={setMaskTool}
          brushSize={brushSize} setBrushSize={setBrushSize}
          feather={feather} setFeather={setFeather}
          aiPrompt={aiPrompt} setAiPrompt={setAiPrompt}
          aiCommand={aiCommand} setAiCommand={setAiCommand}
          aiBusy={aiBusy} aiError={aiError} bgMenuBusy={bgMenuBusy}
          hasMask={hasMask}
          onRunMaskEdit={() => aiMode === 'heal' ? runMaskedAiEdit(HEAL_PROMPT) : runMaskedAiEdit(aiPrompt)}
          onRunFreeCommand={() => runFreeAiCommand(aiCommand)}
          onBgRemove={() => runBackgroundReplace('remove')}
          onBgReplace={(txt) => runBackgroundReplace('replace', txt)}
          onClearMask={clearMask} onInvertMask={invertMask}
          setCropMode={setCropMode} setSelectedId={setSelectedId} setAiError={setAiError}
          // Filter
          filters={filters} setFilters={setFilters}
          commitHistoryOnce={commitHistoryOnce} endInteraction={endInteraction}
          filterScope={(selected && selected.type === 'image') ? 'einzeln' : 'alle'}
          filterPreviewSrc={(selected && selected.type === 'image' && selected.src) || (objects.find(o => o.type === 'image') || {}).src || null}
          // Ebenen
          objects={objects} selectedIds={selectedIds} setSelectedIds={setSelectedIds}
          reorderObjects={reorderObjects} toggleLayerFlag={toggleLayerFlag}
          renameLayer={renameLayer} renamingId={renamingId} setRenamingId={setRenamingId}
          layerDragRef={layerDragRef} layerDragOverId={layerDragOverId} setLayerDragOverId={setLayerDragOverId}
        />
      )}

      {/* Canvas-Bereich */}
      <div
        ref={containerRef}
        onMouseDown={onContainerMouseDown}
        onMouseMove={onContainerMouseMove}
        onMouseUp={onContainerMouseUp}
        onMouseLeave={onContainerMouseUp}
        onDragOver={onContainerDragOver}
        onDrop={onContainerDrop}
        style={{
          flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#EEF1F6',
          cursor: activeTool === 'draw' ? 'crosshair' : (spaceActive ? (isPanning ? 'grabbing' : 'grab') : 'default'),
        }}
      >
        {(pageAiBusy || aiBusy) && (
          <div style={{ position:'absolute', inset:0, zIndex:40, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(238,241,246,0.55)', backdropFilter:'blur(2px)', WebkitBackdropFilter:'blur(2px)' }}>
            <div style={{ width:'min(92%, 420px)', height:'min(92%, 340px)' }}>
              <GenerationLoading embedded title={aiBusy ? 'Bild wird bearbeitet' : 'KI bearbeitet die Seite'} expectedSeconds={aiBusy ? 30 : 20} />
            </div>
          </div>
        )}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <Loader2 size={16} className="lk-spin" />Bild wird geladen…
          </div>
        ) : (
          <div style={{
            position: 'relative', width: dispW + CANVAS_PAD * 2, height: dispH + CANVAS_PAD * 2,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}>
            {/* Artboard-Karte (Schatten) — eigentliche Seitenfläche, mittig im Rand. */}
            <div style={{ position: 'absolute', left: CANVAS_PAD, top: CANVAS_PAD, width: dispW, height: dispH,
              boxShadow: '0 4px 24px rgba(16,24,40,0.14)', background: '#fff' }} />
            <Stage
              ref={stageRef}
              width={dispW + CANVAS_PAD * 2}
              height={dispH + CANVAS_PAD * 2}
              x={CANVAS_PAD}
              y={CANVAS_PAD}
              scaleX={effScale}
              scaleY={effScale}
              onMouseDown={onStageMouseDown}
              onMouseMove={onStageMouseMove}
              onMouseUp={onStageMouseUp}
              onTouchStart={onStageMouseDown}
              onTouchMove={onStageMouseMove}
              onTouchEnd={onStageMouseUp}
            >
              <Layer ref={layerRef} clipX={0} clipY={0} clipWidth={stageSize.width} clipHeight={stageSize.height}>
                {/* Weiße Artboard (Whiteboard) — IMMER als Stage-Hintergrund. */}
                <Rect id="__bgfill__" x={0} y={0} width={stageSize.width} height={stageSize.height} {...fillKonvaProps({ fillGrad: bgGrad, fill: bgColor || '#ffffff' }, stageSize.width, stageSize.height, false)} listening />
                {objects.map(renderObject)}
                {/* Crop-Overlay */}
                {cropMode && cropRect && (
                  <Rect x={cropRect.x - off.x} y={cropRect.y - off.y} width={cropRect.w} height={cropRect.h}
                    stroke={PRGB} strokeWidth={2 / effScale} dash={[8 / effScale, 6 / effScale]} fill="rgba(49,90,231,0.12)" listening={false} />
                )}
                {/* Marquee (Rubberband) */}
                {marquee && (marquee.w > 1 || marquee.h > 1) && (
                  <Rect x={marquee.x - off.x} y={marquee.y - off.y} width={marquee.w} height={marquee.h}
                    stroke={PRGB} strokeWidth={1 / effScale} dash={[6 / effScale, 4 / effScale]} fill="rgba(49,90,231,0.10)" listening={false} />
                )}
                {/* Live-Rahmen: Elemente, die das Kästchen gerade berührt */}
                {marquee && marqueeHits.length > 0 && objects.filter(o => marqueeHits.includes(o.id)).map(o => {
                  const hb = objBounds(o)
                  return <Rect key={'mh-' + o.id} x={hb.x - off.x} y={hb.y - off.y} width={hb.w} height={hb.h}
                    stroke={PRGB} strokeWidth={1.5 / effScale} cornerRadius={3 / effScale} fill="rgba(49,90,231,0.06)" listening={false} />
                })}
                {drawPreview && drawPreview.length >= 2 && (
                  <Line points={drawPreview.flatMap(p => [p.x - off.x, p.y - off.y])} stroke={penColor} strokeWidth={penWidth} lineCap={brushById(activeBrush).cap} lineJoin="round" tension={brushById(activeBrush).tension} opacity={brushById(activeBrush).opacity} globalCompositeOperation={brushById(activeBrush).gco} listening={false} />
                )}
              </Layer>
              {/* Transformer auf eigenem, NICHT geclipptem Layer: Rahmen/Anfasser
                 dürfen über den Seitenrand hinaus; der Bildinhalt bleibt geclippt. */}
              <Layer>
                <Transformer ref={trRef} rotateEnabled
                  keepRatio={lockRatio}
                  anchorStroke={distortActive ? DISTORT_RGB : PRGB}
                  anchorFill="#fff"
                  anchorSize={distortActive ? 11 : 10}
                  anchorCornerRadius={distortActive ? 1 : 6}
                  borderStroke={distortActive ? DISTORT_RGB : PRGB}
                  borderStrokeWidth={distortActive ? 2 : 1.5}
                  rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                  rotationSnapTolerance={4}
                  boundBoxFunc={(oldBox, newBox) => {
                    // Nur Mindestgröße erzwingen. Ecken halten via keepRatio das Verhältnis
                    // (Element als Ganzes skalieren); Seiten-Anker ändern in Konva nur EINE
                    // Achse (Formen: Maß; Bilder: wird in onTransformEnd zu Zuschnitt).
                    if (Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8) return oldBox
                    return newBox
                  }} />
              </Layer>
              {/* Smart-Guides-Layer — IMMER oben, fängt keine Pointer. Hier zeichnet
                 drawGuides() die transienten Hilfslinien/Abstandsmarker. */}
              <Layer ref={guideLayerRef} listening={false} />
            </Stage>

            {/* Masken-Overlay (über der Stage; fängt Pointer nur im KI-Modus) */}
            <canvas
              ref={overlayRef}
              style={{
                position: 'absolute', top: CANVAS_PAD, left: CANVAS_PAD, width: dispW, height: dispH,
                pointerEvents: aiActive ? 'auto' : 'none',
                cursor: aiActive ? 'crosshair' : 'default', zIndex: 40,
              }}
              onMouseDown={onMaskDown}
              onMouseMove={onMaskMove}
              onMouseUp={onMaskUp}
              onMouseLeave={onMaskUp}
              onTouchStart={onMaskDown}
              onTouchMove={onMaskMove}
              onTouchEnd={onMaskUp}
            />

            {/* KI-Busy-Overlay */}
            {aiBusy && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                <Loader2 size={18} className="lk-spin" />KI arbeitet…
              </div>
            )}

            {/* KI-Vorschau: Ergebnis exakt über dem Bild-Objekt einblenden */}
            {aiPreview && (() => {
              const po = objects.find(o => o.id === aiPreview.objId)
              if (!po) return null
              return (
                <img src={aiPreview.url} alt="KI-Vorschau" draggable={false}
                  style={{
                    position: 'absolute',
                    top: (po.y - off.y) * effScale,
                    left: (po.x - off.x) * effScale,
                    width: (po.width || stageSize.width) * effScale * (po.scaleX || 1),
                    height: (po.height || stageSize.height) * effScale * (po.scaleY || 1),
                    transform: po.rotation ? `rotate(${po.rotation}deg)` : undefined,
                    transformOrigin: 'top left',
                    objectFit: 'fill', zIndex: 58, pointerEvents: 'none',
                    // Seitenfarbe hinterlegen, damit transparente Ergebnisse in der Vorschau
                    // korrekt aussehen (nicht das alte Bild durchscheint).
                    background: bgColor || '#ffffff',
                    boxShadow: '0 0 0 2px ' + P + ', 0 6px 24px rgba(16,24,40,0.25)',
                  }} />
              )
            })()}

            {/* Inline-Text-Edit Overlay */}
            {editingTextId && (
              <textarea
                ref={textareaRef}
                style={textOverlayStyle()}
                onBlur={commitTextEdit}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); commitTextEdit() } }}
              />
            )}
          </div>
        )}

        {/* Rechtsklick-Kontextmenü */}
        {ctxMenu && (
          <ContextMenu
            ctx={ctxMenu}
            obj={ctxMenu.objId ? objects.find(o => o.id === ctxMenu.objId) : null}
            hasClipboard={(clipboardRef.current || []).length > 0}
            containerW={containerW}
            onClose={() => setCtxMenu(null)}
            onReorder={(dir) => { reorder(dir); setCtxMenu(null) }}
            onDuplicate={() => { duplicateSelected(); setCtxMenu(null) }}
            onToggleLock={(id) => { toggleLayerFlag(id, 'locked'); setCtxMenu(null) }}
            onToggleHidden={(id) => { toggleLayerFlag(id, 'hidden'); setCtxMenu(null) }}
            onRename={(id) => { setSelectedIds([id]); setActiveTool('layers'); setRenamingId(id); setCtxMenu(null) }}
            onRemoveImage={(id) => { pushHistory(); updateObject(id, { src: null }); setCtxMenu(null) }}
            onDelete={() => { deleteSelected(); setCtxMenu(null) }}
            onPaste={() => { pasteClipboard(); setCtxMenu(null) }}
            onSelectAll={() => { setSelectedIds(objects.map(o => o.id)); setCtxMenu(null) }}
          />
        )}

        {/* KI-Vorschau-Bestätigung — schwebend unten mittig */}
        {aiPreview && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 30,
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 14px',
            borderRadius: 12, background: 'var(--surface,#fff)', border: '1px solid var(--border,#E9ECF2)',
            boxShadow: '0 6px 24px rgba(16,24,40,0.20)',
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: P }}>KI-Vorschau</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gefällt's dir?</span>
            <button onClick={discardPreview}
              style={{ height: 32, padding: '0 14px', borderRadius: 9, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Verwerfen
            </button>
            <button onClick={applyPreview}
              style={{ height: 32, padding: '0 16px', borderRadius: 9, border: 'none', background: P, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Übernehmen
            </button>
          </div>
        )}

        {/* Zoom-Steuerung — schwebend unten rechts */}
        {!loading && (
          <div style={{
            position: 'absolute', bottom: 16, right: 16, zIndex: 20,
            display: 'inline-flex', alignItems: 'center', gap: 2, padding: 3,
            borderRadius: 11, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)',
            boxShadow: '0 4px 16px rgba(16,24,40,0.14)',
          }}>
            <ToolBtn onClick={zoomOut} title="Verkleinern"><ZoomOut size={15} strokeWidth={1.9} /></ToolBtn>
            <button onClick={zoom100} title="Auf 100 %"
              style={{ minWidth: 48, height: 30, padding: '0 6px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {zoomPct}%
            </button>
            <ToolBtn onClick={zoomIn} title="Vergrößern"><ZoomIn size={15} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={zoomFit} title="Einpassen"><Maximize2 size={15} strokeWidth={1.9} /></ToolBtn>
          </div>
        )}

      </div>

      </div>

      {/* Seiten-Strip (Mehrseiten-Design) */}
      <PageStrip
        pages={pages}
        activeIdx={activePageIdx}
        onSwitch={switchToPage}
        onAdd={addPage}
        onDuplicate={duplicatePage}
        onDelete={deletePage}
      />
    </div>
  )
}

// ─── Seiten-Strip (Canva-artig, unten) ──────────────────────────────────────
const _miniBtn = { width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, borderRadius: 5 }
function PageThumb({ page, active }) {
  const W = 64
  const sw = page.stage?.width || 1080, sh = page.stage?.height || 1080
  const H = Math.max(36, Math.round(W * sh / sw))
  const sc = W / sw
  const off = page.baseCrop || { x: 0, y: 0 }
  return (
    <div style={{ position: 'relative', width: W, height: H, background: page.bgColor || '#fff', borderRadius: 6, overflow: 'hidden',
      border: '2px solid ' + (active ? P : 'var(--border,#E9ECF2)'), boxShadow: active ? '0 0 0 2px color-mix(in srgb, var(--wl-primary, rgb(49,90,231)) 25%, transparent)' : 'none' }}>
      {(page.objects || []).map((o, i) => {
        if (o.hidden) return null
        const x = ((o.x || 0) - (off.x || 0)) * sc, y = ((o.y || 0) - (off.y || 0)) * sc
        if (o.type === 'image' && o.src) return <img key={i} src={o.src} alt="" style={{ position: 'absolute', left: x, top: y, width: (o.width || 0) * sc, height: (o.height || 0) * sc, objectFit: 'fill' }} />
        if (o.type === 'text') return <div key={i} style={{ position: 'absolute', left: x, top: y, width: (o.width || 300) * sc, color: o.fill || '#111', fontSize: Math.max(4, (o.fontSize || 40) * sc), lineHeight: 1.1, overflow: 'hidden', fontWeight: (o.fontStyle || '').includes('bold') ? 700 : 400 }}>{(o.text || '').slice(0, 36)}</div>
        if (o.type === 'rect') return <div key={i} style={{ position: 'absolute', left: x, top: y, width: (o.width || 0) * sc, height: (o.height || 0) * sc, background: o.fill || 'transparent', borderRadius: (o.cornerRadius || 0) * sc }} />
        if (o.type === 'ellipse') return <div key={i} style={{ position: 'absolute', left: ((o.x || 0) - (off.x || 0) - (o.radiusX || 0)) * sc, top: ((o.y || 0) - (off.y || 0) - (o.radiusY || 0)) * sc, width: (o.radiusX || 0) * 2 * sc, height: (o.radiusY || 0) * 2 * sc, background: o.fill || 'transparent', borderRadius: '50%' }} />
        return null
      })}
    </div>
  )
}
function PageStrip({ pages, activeIdx, onSwitch, onAdd, onDuplicate, onDelete }) {
  if (!pages || pages.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 12px', borderTop: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', overflowX: 'auto', flexShrink: 0 }}>
      {pages.map((p, i) => (
        <div key={p.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <button onClick={() => onSwitch(i)} title={`Seite ${i + 1}`} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <PageThumb page={p} active={i === activeIdx} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: i === activeIdx ? P : 'var(--text-muted)', minWidth: 12, textAlign: 'center' }}>{i + 1}</span>
            {i === activeIdx && (
              <>
                <button onClick={() => onDuplicate(i)} title="Seite duplizieren" style={_miniBtn}><Copy size={12} strokeWidth={1.9} /></button>
                {pages.length > 1 && <button onClick={() => onDelete(i)} title="Seite löschen" style={_miniBtn}><Trash2 size={12} strokeWidth={1.9} /></button>}
              </>
            )}
          </div>
        </div>
      ))}
      <button onClick={onAdd} title="Seite hinzufügen"
        style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 6, border: '1px dashed var(--border,#E9ECF2)', background: 'var(--page-bg,#F7F8FA)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        <PlusIcon size={18} />
      </button>
    </div>
  )
}

// ─── Rechte Spalte: Eigenschaften (oben) + Ebenen (unten) ───────────────────
const LAYER_META = {
  text:   { label: 'Text',     Icon: Type },
  rect:   { label: 'Rechteck', Icon: SquareIcon },
  ellipse:{ label: 'Ellipse',  Icon: CircleIcon },
  line:   { label: 'Linie',    Icon: Minus },
  arrow:  { label: 'Pfeil',    Icon: ArrowRight },
  sticker:{ label: 'Form',     Icon: StarIcon },
  image:  { label: 'Bild',     Icon: ImageIcon },
}
function rpLabel(o) {
  if (o?.name) return o.name
  if (o?.type === 'text') return (o.text || 'Text').slice(0, 22) || 'Text'
  return LAYER_META[o?.type]?.label || 'Ebene'
}
// ─── Fehlertexte freundlich machen (Google-503 etc.) ────────────────────────
function humanizeFnError(fnErr) {
  const msg = fnErr?.message || ''
  if (/503|unavailable|overloaded/i.test(msg)) return 'Der Bild-Dienst ist gerade überlastet (Google 503). Bitte kurz warten und erneut versuchen. Dein Bild bleibt unverändert.'
  return msg || 'KI-Bearbeitung fehlgeschlagen.'
}
function humanizeProviderError(msg) {
  if (/503|unavailable|overloaded/i.test(String(msg))) return 'Der Bild-Dienst ist gerade überlastet (Google 503). Bitte kurz warten und erneut versuchen. Dein Bild bleibt unverändert.'
  return String(msg)
}

// ─── kleine UI-Bausteine ──────────────────────────────────────────────────────
const barStyle = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
  borderBottom: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', flexShrink: 0,
}

function Divider() {
  return <div style={{ width: 1, height: 22, background: 'var(--border,#E9ECF2)', margin: '0 2px' }} />
}

function ToolBtn({ children, onClick, title, active }) {
  return (
    <button onClick={onClick} title={title}
      style={{ width: 32, height: 32, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
        border: '1px solid ' + (active ? P : 'var(--border,#E9ECF2)'),
        background: active ? 'rgba(49,90,231,0.08)' : 'var(--surface,#fff)',
        color: active ? P : 'var(--text-muted,#475467)' }}>
      {children}
    </button>
  )
}

function SmallBtn({ children, onClick, primary, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ height: 30, padding: '0 12px', borderRadius: 8, cursor: disabled ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
        border: primary ? 'none' : '1px solid var(--border)', background: primary ? P : '#fff', color: primary ? '#fff' : 'var(--text-primary)' }}>
      {children}
    </button>
  )
}

function MenuItem({ children, onClick }) {
  return (
    <button onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'inherit' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(49,90,231,0.06)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {children}
    </button>
  )
}


// ─── Rechtsklick-Kontextmenü ────────────────────────────────────────────────
// HTML-Overlay, absolut in der Canvas-Fläche positioniert. Kippt nahe der Kante
// nach links/oben, schließt bei Klick außerhalb (Backdrop) / Esc / Scroll.
function ContextMenuItem({ children, onClick, danger }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
        padding: '7px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
        fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
        color: danger ? '#b91c1c' : 'var(--text-primary)', borderRadius: 7 }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(185,28,28,0.08)' : 'rgba(49,90,231,0.07)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {children}
    </button>
  )
}
function ContextMenuSep() {
  return <div style={{ height: 1, background: 'var(--border,#E9ECF2)', margin: '5px 8px' }} />
}
function ContextMenu({ ctx, obj, hasClipboard, containerW, onClose, onReorder, onDuplicate, onToggleLock, onToggleHidden, onRename, onDelete, onPaste, onSelectAll, onRemoveImage = () => {} }) {
  const MENU_W = 224
  const estH = obj ? 332 : 96
  // Kanten-Kippung: wenn rechts/unten kein Platz, nach links/oben öffnen.
  const flipX = ctx.x + MENU_W + 8 > (containerW || 9999)
  const left = flipX ? Math.max(4, ctx.x - MENU_W) : ctx.x
  const top = ctx.y
  const ic = { size: 15, strokeWidth: 1.9 }
  return (
    <>
      {/* Backdrop fängt Außen-Klicks (auch Rechtsklick) → schließen */}
      <div onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}
        style={{ position: 'absolute', inset: 0, zIndex: 110 }} />
      <div style={{ position: 'absolute', left, top, zIndex: 111, width: MENU_W, maxHeight: estH,
        background: 'var(--surface,#fff)', border: '1px solid var(--border,#E9ECF2)', borderRadius: 12,
        boxShadow: '0 12px 36px rgba(16,24,40,0.20)', padding: 6 }}
        onContextMenu={(e) => e.preventDefault()}>
        {obj ? (
          <>
            <ContextMenuItem onClick={() => onReorder('top')}><BringToFront {...ic} />Nach vorne</ContextMenuItem>
            <ContextMenuItem onClick={() => onReorder('up')}><ChevronUp {...ic} strokeWidth={2} />Eine Ebene nach vorne</ContextMenuItem>
            <ContextMenuItem onClick={() => onReorder('down')}><ChevronDown {...ic} strokeWidth={2} />Eine Ebene nach hinten</ContextMenuItem>
            <ContextMenuItem onClick={() => onReorder('bottom')}><SendToBack {...ic} />Nach hinten</ContextMenuItem>
            <ContextMenuSep />
            <ContextMenuItem onClick={onDuplicate}><Copy {...ic} />Duplizieren <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Strg+D</span></ContextMenuItem>
            <ContextMenuItem onClick={() => onToggleLock(obj.id)}>{obj.locked ? <Unlock {...ic} /> : <Lock {...ic} />}{obj.locked ? 'Entsperren' : 'Sperren'}</ContextMenuItem>
            <ContextMenuItem onClick={() => onToggleHidden(obj.id)}>{obj.hidden ? <Eye {...ic} /> : <EyeOff {...ic} />}{obj.hidden ? 'Einblenden' : 'Ausblenden'}</ContextMenuItem>
            <ContextMenuItem onClick={() => onRename(obj.id)}><Type {...ic} />Umbenennen</ContextMenuItem>
            {(obj.type === 'frame' || obj.type === 'mockup') && obj.src && (<>
              <ContextMenuSep />
              <ContextMenuItem onClick={() => onRemoveImage(obj.id)}><X {...ic} />Bild aus Rahmen entfernen</ContextMenuItem>
            </>)}
            <ContextMenuSep />
            <ContextMenuItem danger onClick={onDelete}><Trash2 {...ic} />{(obj.type === 'frame' || obj.type === 'mockup') ? 'Rahmen löschen' : 'Löschen'}</ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onClick={onPaste} ><Copy {...ic} />{hasClipboard ? 'Einfügen' : 'Einfügen (leer)'}</ContextMenuItem>
            <ContextMenuItem onClick={onSelectAll}><LayoutTemplate {...ic} />Alles auswählen</ContextMenuItem>
          </>
        )}
      </div>
    </>
  )
}

// ─── Export-Dialog (PNG / JPG / PDF) ────────────────────────────────────────
function ExportModal({ onExport, exporting, onClose }) {
  const [format, setFormat] = useState('png')
  const [scale, setScale] = useState(2)
  const chip = (active) => ({
    height: 32, padding: '0 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
    border: '1px solid ' + (active ? P : 'var(--border,#E9ECF2)'),
    background: active ? 'rgba(49,90,231,0.08)' : '#fff',
    color: active ? P : 'var(--text-muted,#475467)',
  })
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(16,24,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 360, maxWidth: '100%', background: '#fff', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,.22)', padding: 18, fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Exportieren</span>
          <button onClick={onClose} title="Schließen" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={16} /></button>
        </div>

        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Format</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setFormat('png')} style={chip(format === 'png')}>PNG</button>
          <button onClick={() => setFormat('jpg')} style={chip(format === 'jpg')}>JPG</button>
          <button onClick={() => setFormat('pdf')} style={chip(format === 'pdf')}>PDF</button>
        </div>

        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Auflösung</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setScale(1)} style={chip(scale === 1)}>1×</button>
          <button onClick={() => setScale(2)} style={chip(scale === 2)}>2×</button>
          <button onClick={() => setScale(4)} style={chip(scale === 4)}>4×</button>
        </div>

        {format === 'pdf' && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>PDF wird in Leinwand-Größe auf einer Seite erstellt.</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <SmallBtn onClick={onClose}>Abbrechen</SmallBtn>
          <SmallBtn primary disabled={exporting} onClick={() => onExport({ format, scale })}>
            {exporting ? 'Exportiere…' : 'Herunterladen'}
          </SmallBtn>
        </div>
      </div>
    </div>
  )
}

// Kontextuelle Eigenschaften-Leiste (Tier 2) — ersetzt die alte rechte Spalte.
// Vereint Text-/Form-Formatierung mit numerischen Eigenschaften (X/Y/Größe/
// Drehung/Deckkraft), Ausrichten/Verteilen sowie Ebenen-/Duplizieren-/Löschen-
// Aktionen in EINER sauberen, umbrechenden Leiste.
// Canva-artiges Transparenz-Icon (Schachbrett in abgerundetem Quadrat).
function TransparencyIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <defs><clipPath id="lk-transp-clip"><rect x="3" y="3" width="18" height="18" rx="3.5" /></clipPath></defs>
      <g clipPath="url(#lk-transp-clip)">
        <rect x="3" y="3" width="9" height="9" fill="currentColor" opacity="0.85" />
        <rect x="12" y="12" width="9" height="9" fill="currentColor" opacity="0.85" />
      </g>
      <rect x="3" y="3" width="18" height="18" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
// Kompaktes Dropdown für die Kontext-Leiste (Icon-Trigger + Popover).
function BarMenu({ title, trigger, width = 180, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} title={title}
        style={{ height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '0 7px',
          borderRadius: 8, border: '1px solid ' + (open ? P : 'var(--border,#E9ECF2)'), background: open ? 'rgba(49,90,231,0.08)' : 'var(--surface,#fff)',
          color: open ? P : 'var(--text-muted,#475467)', cursor: 'pointer', fontFamily: 'inherit' }}>
        {trigger}
        <ChevronDown size={12} strokeWidth={2} style={{ opacity: 0.5 }} />
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 130, minWidth: width,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 32px rgba(16,24,40,0.16)', padding: 6 }}>
          {children}
        </div>
      )}
    </div>
  )
}
function BarMenuItem({ icon, label, active, onClick }) {
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.background = '#F4F6FA' }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(49,90,231,0.08)' : 'transparent' }}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7,
        border: 'none', background: active ? 'rgba(49,90,231,0.08)' : 'transparent', cursor: 'pointer', fontSize: 13,
        color: active ? P : 'var(--text-primary)', fontFamily: 'inherit' }}>
      {icon}{label}
    </button>
  )
}

function ContextBar({
  selected, updateObject, reorder, deleteSelected, duplicateSelected,
  commitHistoryOnce, endInteraction, fonts, onFlip, onCrop, onEditImage, onOpenLayers,
  onCopyStyle, copyStyleActive = false, onIconRecolor,
  selectedIds, alignObjects, distributeObjects, brandColors = [], brandFonts = [], onFontLoad,
}) {
  const FONT_LIST = (fonts && fonts.length) ? fonts : FONTS
  const o = selected
  const isText = o.type === 'text'
  const hasFill = ['text', 'rect', 'ellipse', 'sticker'].includes(o.type)
  const hasStroke = ['rect', 'ellipse', 'line', 'arrow', 'sticker'].includes(o.type)
  const hasWH = (o.type === 'rect' || o.type === 'image')
  const isImage = o.type === 'image'
  const isRect = o.type === 'rect'
  const isEllipse = o.type === 'ellipse'
  const fontStyle = o.fontStyle || 'normal'
  const isBold = fontStyle.includes('bold')
  const isItalic = fontStyle.includes('italic')
  const isUnderline = o.textDecoration === 'underline'
  const selCount = (selectedIds || []).length

  // diskrete Aktion → 1 History-Eintrag
  const setOnce = (patch) => { commitHistoryOnce(); updateObject(o.id, patch, false); endInteraction() }
  // kontinuierliche Eingabe → History EINMAL beim Start, dann live
  const startEdit = () => commitHistoryOnce()
  const liveEdit = (patch) => updateObject(o.id, patch, false)
  const opacityPct = Math.round((o.opacity == null ? 1 : o.opacity) * 100)

  function setStyleFlag(flag) {
    let parts = []
    let b = isBold, i = isItalic
    if (flag === 'bold') b = !b
    if (flag === 'italic') i = !i
    if (b) parts.push('bold'); if (i) parts.push('italic')
    setOnce({ fontStyle: parts.join(' ') || 'normal' })
  }

  // Kompakte Zahlen-Eingabe (X/Y/B/H/Drehung)
  const numField = (label, value, onCommitVal, opts = {}) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }} title={label}>
      <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{label}</span>
      <input type="number" value={Math.round((Number(value) || 0) * 100) / 100}
        step={opts.step || 1} min={opts.min}
        onMouseDown={startEdit} onFocus={startEdit} onBlur={endInteraction}
        onChange={e => onCommitVal(parseFloat(e.target.value))}
        style={{ width: opts.w || 56, height: 30, padding: '0 6px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
    </label>
  )

  // Mini-Stepper-Button (Schriftgröße −/+)
  const stepBtn = { width: 26, height: '100%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted,#475467)', padding: 0 }
  const fs = Math.round(o.fontSize || 44)

  return (
    <div style={{ ...barStyle, flexWrap: 'nowrap', gap: 6, minWidth: 0 }}>
      {/* ── TEXT ── */}
      {isText && (
        <>
          <FontPicker value={o.fontFamily || 'Inter'} brandFonts={brandFonts}
            onPick={fam => { setOnce({ fontFamily: fam }); onFontLoad && onFontLoad(fam) }} />
          {/* Schriftgröße mit −/+ Stepper */}
          <div style={{ display: 'inline-flex', alignItems: 'center', height: 32, flexShrink: 0, border: '1px solid var(--border,#E9ECF2)', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
            <button type="button" title="Kleiner" style={stepBtn} onClick={() => setOnce({ fontSize: Math.max(6, fs - 1) })}><Minus size={13} strokeWidth={2} /></button>
            <input type="number" min={6} max={400} value={fs}
              onFocus={startEdit} onMouseDown={startEdit} onBlur={endInteraction}
              onChange={e => liveEdit({ fontSize: parseInt(e.target.value, 10) || 44 })}
              style={{ width: 38, height: '100%', border: 'none', borderLeft: '1px solid var(--border,#E9ECF2)', borderRight: '1px solid var(--border,#E9ECF2)', textAlign: 'center', fontSize: 12, fontFamily: 'inherit', outline: 'none', MozAppearance: 'textfield', boxSizing: 'border-box' }} />
            <button type="button" title="Größer" style={stepBtn} onClick={() => setOnce({ fontSize: Math.min(400, fs + 1) })}><PlusIcon size={13} strokeWidth={2} /></button>
          </div>
          {/* Textfarbe als A-Swatch */}
          <ColorPopover value={o.fill} gradient={o.fillGrad || null} allowGradient brandColors={brandColors} title="Textfarbe" onStart={startEdit} onChange={(hex) => liveEdit({ fill: hex, fillGrad: null })} onGradient={(g) => liveEdit(g ? { fillGrad: g, fill: (g.stops[0] && g.stops[0][1]) || o.fill } : { fillGrad: null })} onEnd={endInteraction}
            triggerStyle={{ width: 32, height: 32, flexShrink: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 8, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', cursor: 'pointer', padding: 0 }}
            triggerContent={<><Baseline size={15} strokeWidth={2} color="var(--text-muted,#475467)" style={{ marginBottom: -2 }} /><span style={{ width: 16, height: 3, borderRadius: 2, background: o.fillGrad ? gradientCss(o.fillGrad) : toHex(o.fill || '#000000') }} /></>} />
          <Divider />
          <ToolBtn onClick={() => setStyleFlag('bold')} active={isBold} title="Fett"><Bold size={14} strokeWidth={2.4} /></ToolBtn>
          <ToolBtn onClick={() => setStyleFlag('italic')} active={isItalic} title="Kursiv"><Italic size={14} strokeWidth={2.4} /></ToolBtn>
          <ToolBtn onClick={() => setOnce({ textDecoration: isUnderline ? '' : 'underline' })} active={isUnderline} title="Unterstrichen"><Underline size={14} strokeWidth={2.4} /></ToolBtn>
          <BarMenu title="Ausrichtung" width={150}
            trigger={(o.align === 'center') ? <AlignCenter size={15} strokeWidth={2} /> : (o.align === 'right') ? <AlignRight size={15} strokeWidth={2} /> : <AlignLeft size={15} strokeWidth={2} />}>
            <BarMenuItem icon={<AlignLeft size={15} strokeWidth={2} />} label="Links" active={(o.align || 'left') === 'left'} onClick={() => setOnce({ align: 'left' })} />
            <BarMenuItem icon={<AlignCenter size={15} strokeWidth={2} />} label="Zentriert" active={o.align === 'center'} onClick={() => setOnce({ align: 'center' })} />
            <BarMenuItem icon={<AlignRight size={15} strokeWidth={2} />} label="Rechts" active={o.align === 'right'} onClick={() => setOnce({ align: 'right' })} />
          </BarMenu>
          <BarMenu title="Abstand" width={210} trigger={<MoveVertical size={15} strokeWidth={2} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 6px' }}>
              {numField('Zeilenhöhe', o.lineHeight || 1.2, v => setOnce({ lineHeight: v || 1.2 }), { step: 0.05, min: 0.5, w: 70 })}
              {numField('Laufweite', o.letterSpacing || 0, v => setOnce({ letterSpacing: v || 0 }), { step: 0.5, w: 70 })}
            </div>
          </BarMenu>
          <BarMenu title="Effekte" width={236} trigger={<span style={{ fontSize: 12.5, fontWeight: 600 }}>Effekte</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '4px 4px 2px' }}>
              {TEXT_EFFECTS.map(ef => {
                const on = (o.effect || 'none') === ef.id
                return (
                  <button key={ef.id} type="button" onClick={() => setOnce({ effect: ef.id })} title={ef.label}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ width: '100%', height: 44, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: ef.id === 'neon' ? '#15171c' : '#F4F6FA',
                      border: '1.5px solid ' + (on ? P : 'var(--border,#E9ECF2)'),
                      boxShadow: on ? '0 0 0 2px rgba(49,90,231,0.18)' : 'none' }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: ef.id === 'neon' ? '#39FF14' : '#111827', lineHeight: 1, ...ef.css }}>Ag</span>
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 600, color: on ? P : 'var(--text-muted,#667085)' }}>{ef.label}</span>
                  </button>
                )
              })}
            </div>
          </BarMenu>
        </>
      )}

      {/* ── FORMEN: Füllung (Swatch) + Stil-Menü ── */}
      {!isText && hasFill && (
        <ColorPopover value={o.fill} gradient={o.fillGrad || null} allowGradient={o.type === 'rect' || o.type === 'ellipse'} brandColors={brandColors} title="Füllfarbe" round allowNone onStart={startEdit} onChange={(hex) => liveEdit({ fill: hex, fillGrad: null })} onGradient={(g) => liveEdit(g ? { fillGrad: g, fill: (g.stops[0] && g.stops[0][1]) || o.fill } : { fillGrad: null })} onEnd={endInteraction} size={30} />
      )}
      {!isText && (hasStroke || isRect || hasFill) && (hasStroke || isRect) && (
        <BarMenu title="Stil" width={210} trigger={<Sliders size={15} strokeWidth={2} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 6px' }}>
            {hasStroke && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>Randfarbe</span>
                <ColorPopover value={o.stroke || '#ffffff'} brandColors={brandColors} title="Randfarbe" onStart={startEdit} onChange={(hex) => liveEdit({ stroke: hex })} onEnd={endInteraction} size={28} />
              </div>
            )}
            {hasStroke && numField('Randstärke', o.strokeWidth || 0, v => setOnce({ strokeWidth: Math.max(0, v || 0) }), { min: 0, w: 70 })}
            {isRect && numField('Ecken', o.cornerRadius || 0, v => setOnce({ cornerRadius: Math.max(0, v || 0) }), { min: 0, w: 70 })}
            <button type="button" onClick={() => setOnce(o.shadowBlur ? { shadowBlur: 0 } : { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.35)', shadowOffsetX: 0, shadowOffsetY: 4 })}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 6px', borderRadius: 7, border: 'none', background: o.shadowBlur ? 'rgba(49,90,231,0.08)' : 'transparent', cursor: 'pointer', fontSize: 13, color: o.shadowBlur ? P : 'var(--text-primary)', fontFamily: 'inherit' }}>
              <Sliders size={15} strokeWidth={1.9} />Schatten {o.shadowBlur ? 'an' : 'aus'}
            </button>
          </div>
        </BarMenu>
      )}

      {/* ── BILD: Bearbeiten (Anpassen/Filter/KI) + Zuschneiden ── */}
      {isImage && o.isIcon && onIconRecolor && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>Farbe</span>
          <ColorPopover value={o.iconColor || '#1f2937'} brandColors={brandColors} title="Icon-Farbe" round onChange={(hex) => onIconRecolor(o, hex)} size={30} />
        </div>
      )}
      {isImage && !o.isIcon && onEditImage && (
        <button type="button" onClick={onEditImage} title="Bild bearbeiten (Anpassen, Filter, KI)"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: 'none',
            background: 'rgba(49,90,231,0.08)', color: P, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Wand2 size={14} strokeWidth={2} />Bearbeiten
        </button>
      )}
      {isImage && onCrop && (
        <button type="button" onClick={onCrop} title="Zuschneiden"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Crop size={14} strokeWidth={1.9} />Zuschneiden
        </button>
      )}
      {(o.type === 'frame' || o.type === 'mockup') && o.src && (
        <button type="button" onClick={() => setOnce({ src: null })} title="Bild aus dem Rahmen entfernen"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <X size={14} strokeWidth={2} />Bild entfernen
        </button>
      )}

      <Divider />

      {/* ── Spiegeln (nur Nicht-Text) ── */}
      {!isText && onFlip && (
        <BarMenu title="Spiegeln" width={200} trigger={isImage ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}><FlipHorizontal size={14} strokeWidth={1.8} />Spiegeln</span> : <FlipHorizontal size={16} strokeWidth={1.8} />}>
          <BarMenuItem icon={<FlipHorizontal size={16} strokeWidth={1.8} />} label="Horizontal spiegeln" onClick={() => onFlip('x')} />
          <BarMenuItem icon={<FlipVertical size={16} strokeWidth={1.8} />} label="Vertikal spiegeln" onClick={() => onFlip('y')} />
        </BarMenu>
      )}

      {/* ── Position: Ebenen-Reihenfolge + Ausrichten (an Seite) ── */}
      <BarMenu title="Position" width={232} trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}><Layers size={14} strokeWidth={1.9} />Position</span>}>
        <div style={{ padding: '2px 4px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-soft,#98a2b3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 6px 6px' }}>Anordnen</div>
          <BarMenuItem icon={<BringToFront size={15} strokeWidth={1.9} />} label="In den Vordergrund" onClick={() => reorder('top')} />
          <BarMenuItem icon={<ChevronUp size={15} strokeWidth={1.9} />} label="Eine Ebene nach vorne" onClick={() => reorder('up')} />
          <BarMenuItem icon={<ChevronDown size={15} strokeWidth={1.9} />} label="Eine Ebene nach hinten" onClick={() => reorder('down')} />
          <BarMenuItem icon={<SendToBack size={15} strokeWidth={1.9} />} label="In den Hintergrund" onClick={() => reorder('bottom')} />
          <div style={{ height: 1, background: 'var(--border,#E9ECF2)', margin: '6px 4px' }} />
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-soft,#98a2b3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 6px 6px' }}>An Seite ausrichten</div>
          <div style={{ display: 'flex', gap: 4, padding: '0 4px 4px' }}>
            <ToolBtn onClick={() => alignObjects('left')} title="Links"><AlignStartVertical size={14} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={() => alignObjects('hcenter')} title="Horizontal zentrieren"><AlignCenterVertical size={14} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={() => alignObjects('right')} title="Rechts"><AlignEndVertical size={14} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={() => alignObjects('top')} title="Oben"><AlignStartHorizontal size={14} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={() => alignObjects('vcenter')} title="Vertikal zentrieren"><AlignCenterHorizontal size={14} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={() => alignObjects('bottom')} title="Unten"><AlignEndHorizontal size={14} strokeWidth={1.9} /></ToolBtn>
          </div>
          {onOpenLayers && (<>
            <div style={{ height: 1, background: 'var(--border,#E9ECF2)', margin: '6px 4px' }} />
            <BarMenuItem icon={<Layers size={15} strokeWidth={1.9} />} label="Alle Ebenen verwalten" onClick={onOpenLayers} />
          </>)}
        </div>
      </BarMenu>

      {/* ── Deckkraft (Icon-Dropdown) ── */}
      <BarMenu title="Deckkraft" width={200} trigger={isImage ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}><TransparencyIcon size={14} />Deckkraft</span> : <TransparencyIcon size={15} />}>
        <div onClick={e => e.stopPropagation()} style={{ padding: '6px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}><span>Deckkraft</span><span>{opacityPct}%</span></div>
          <input type="range" min={0} max={100} step={1} value={opacityPct}
            onMouseDown={startEdit} onChange={e => liveEdit({ opacity: (parseInt(e.target.value, 10) || 0) / 100 })} onMouseUp={endInteraction}
            style={{ width: '100%', accentColor: P }} />
        </div>
      </BarMenu>

      <div style={{ flex: 1, minWidth: 8 }} />
      {onCopyStyle && (
        <ToolBtn onClick={onCopyStyle} active={copyStyleActive} title={copyStyleActive ? 'Stil kopiert — jetzt Zielelement anklicken' : 'Stil kopieren'}><Paintbrush size={14} strokeWidth={1.9} /></ToolBtn>
      )}
      <ToolBtn onClick={duplicateSelected} title="Duplizieren (Strg+D)"><Copy size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={deleteSelected} title="Löschen (Entf)"><Trash2 size={14} strokeWidth={1.9} /></ToolBtn>
    </div>
  )
}

// Leiste bei Mehrfach-Auswahl: gemeinsame Aktionen (Duplizieren, Deckkraft, Löschen).
function MultiBar({ count, onDuplicate, onDelete, updateOpacity, commitHistoryOnce, endInteraction, alignObjects, distributeObjects, onFlip }) {
  return (
    <div style={{ ...barStyle, flexWrap: 'wrap', gap: 7 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{count} Objekte ausgewählt</span>
      <Divider />
      {/* Ausrichten / Verteilen relativ zur Auswahl */}
      <ToolBtn onClick={() => alignObjects('left')} title="Links ausrichten"><AlignStartVertical size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => alignObjects('hcenter')} title="Horizontal zentrieren"><AlignCenterVertical size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => alignObjects('right')} title="Rechts ausrichten"><AlignEndVertical size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => alignObjects('top')} title="Oben ausrichten"><AlignStartHorizontal size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => alignObjects('vcenter')} title="Vertikal zentrieren"><AlignCenterHorizontal size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => alignObjects('bottom')} title="Unten ausrichten"><AlignEndHorizontal size={14} strokeWidth={1.9} /></ToolBtn>
      {count >= 3 && <ToolBtn onClick={() => distributeObjects('h')} title="Horizontal verteilen"><AlignHorizontalDistributeCenter size={14} strokeWidth={1.9} /></ToolBtn>}
      {count >= 3 && <ToolBtn onClick={() => distributeObjects('v')} title="Vertikal verteilen"><AlignVerticalDistributeCenter size={14} strokeWidth={1.9} /></ToolBtn>}
      <Divider />
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }} title="Deckkraft (alle)">
        Deckkraft
        <input type="range" min={0} max={100} step={1} defaultValue={100}
          onMouseDown={commitHistoryOnce} onChange={e => updateOpacity((parseInt(e.target.value, 10) || 0) / 100)}
          onMouseUp={endInteraction} style={{ width: 100, accentColor: P }} />
      </label>
      {onFlip && <ToolBtn onClick={() => onFlip('x')} title="Horizontal spiegeln"><FlipHorizontal2 size={14} strokeWidth={1.9} /></ToolBtn>}
      {onFlip && <ToolBtn onClick={() => onFlip('y')} title="Vertikal spiegeln"><FlipVertical2 size={14} strokeWidth={1.9} /></ToolBtn>}
      <div style={{ flex: 1 }} />
      <ToolBtn onClick={onDuplicate} title="Duplizieren (Strg+D)"><Copy size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={onDelete} title="Auswahl löschen (Entf)"><Trash2 size={14} strokeWidth={1.9} /></ToolBtn>
    </div>
  )
}

// Format-/Größen-Preset-Menü
function FormatMenu({ onPick }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <ToolBtn onClick={() => setOpen(o => !o)} active={open} title="Format / Größe"><Scaling size={15} strokeWidth={1.9} /></ToolBtn>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 81, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.12)', padding: 8, width: 260 }}>
            {FORMAT_PRESETS.map(p => (
              <MenuItem key={p.id} onClick={() => { onPick(p); setOpen(false) }}>{p.label}</MenuItem>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Slider({ label, min, max, step, value, onChange, onStart, onEnd }) {
  return (
    <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-muted)' }}>
      {label}
      <input type="range" min={min} max={max} step={step} value={value || 0}
        onMouseDown={onStart} onTouchStart={onStart} onMouseUp={onEnd} onTouchEnd={onEnd}
        onChange={e => onChange(parseFloat(e.target.value))} style={{ width: 120 }} />
    </label>
  )
}

const selStyle = { height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--text-primary)', outline: 'none' }
const lblStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 }
const colorStyle = { width: 30, height: 28, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: '#fff', cursor: 'pointer' }

// rgba/named → #hex (für <input type=color>). Fallback weiß.

// Marken-Schriften aus brandData ziehen (Company- ODER Personal-Brand-Form).
function extractBrandFonts(brandData) {
  if (!brandData) return []
  const src = Array.isArray(brandData.companies)
    ? brandData.companies.flatMap(c => c.fonts || [])
    : (brandData.fonts || [])
  const out = []; const seen = new Set()
  for (const f of src) { const fam = f?.family || f?.name; if (fam && !seen.has(fam)) { seen.add(fam); out.push(fam) } }
  return out
}
// Marken-Farben aus brandData ziehen (flach, dedupliziert).
function extractBrandColors(brandData) {
  if (!brandData) return []
  const src = Array.isArray(brandData.companies)
    ? brandData.companies.flatMap(c => c.palette || [])
    : (brandData.palette || [])
  return [...new Set(src.filter(Boolean))].slice(0, 18)
}

// ════════════════════════════════════════════════════════════════════════════
// CANVA-STIL: linke Werkzeug-Schiene + Panel
// ════════════════════════════════════════════════════════════════════════════
// Werkzeuge der linken Schiene, in sinnvolle Gruppen unterteilt:
//   1) Erstellen: Vorlagen / Elemente / Text / Uploads
//   2) Marke
//   3) Bearbeiten: KI / Filter / Ebenen
// Ein 'divider'-Eintrag erzeugt eine dezente Trennlinie zwischen den Gruppen.
const RAIL_TOOLS = [
  { id: 'elements',  label: 'Elemente', Icon: StarIcon },
  { id: 'text',      label: 'Text',     Icon: Type },
  { id: 'uploads',   label: 'Medien',   Icon: ImageIcon },
  { id: 'div1', divider: true },
  { id: 'brand',     label: 'Marke',    Icon: Palette },
  { id: 'div2', divider: true },
  { id: 'draw',      label: 'Zeichnen', Icon: Brush },
]
// Bild bearbeiten (Filter/Anpassen/KI), Ebenen & Ausrichten sind KEINE linken Tools mehr —
// sie sind ausschließlich kontextuell über die obere Leiste erreichbar (wie Canva).

function ToolRail({ active, onSelect }) {
  return (
    <div data-tool-ui style={{ width: 76, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface,#fff)',
      display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3, padding: '10px 8px', overflowY: 'auto' }}>
      {RAIL_TOOLS.map(t => {
        if (t.divider) {
          return <div key={t.id} style={{ height: 1, background: 'var(--border,#E9ECF2)', margin: '5px 6px' }} />
        }
        const on = active === t.id
        return (
          <button key={t.id} onClick={() => onSelect(t.id)} title={t.label}
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 2px',
              borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .12s',
              background: on ? 'color-mix(in srgb, var(--wl-primary, rgb(49,90,231)) 13%, transparent)' : 'transparent',
              color: on ? P : 'var(--text-muted,#475467)' }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(16,24,40,0.04)' }}
            onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
            {on && <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: P }} />}
            <t.Icon size={20} strokeWidth={on ? 2.1 : 1.9} />
            <span style={{ fontSize: 10, fontWeight: on ? 700 : 600, letterSpacing: '0.01em' }}>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Elemente-Tabs: Icons / Grafiken / Bilder (echte Stockmedia-Anbindung) ───
// Quellen siehe src/lib/stockMedia.js (Iconify für Icons/Grafiken, Pexels via
// Edge Function für Bilder). Jeder Tab hält seine eigene Suche; Einfügen geht
// über onInsert(dataUrl) → addImageFromDataUrl im DesignerCanvas-Scope.

// kleine Such-Eingabe (einheitlicher Style)
function MediaSearchInput({ value, onChange, placeholder }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
  )
}

function MediaSpinner({ label }) {
  return (
    <div style={{ minHeight: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
      <Loader2 size={20} className="lk-spin" />
      <span>{label || 'Lädt…'}</span>
    </div>
  )
}

function MediaEmpty({ label }) {
  return (
    <div style={{ minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10,
      border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 16 }}>
      {label}
    </div>
  )
}

// ─── Icons-Tab (Iconify) ─────────────────────────────────────────────────────
function IconsTab({ onInsert }) {
  const [q, setQ] = useState('')
  const [ids, setIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [color, setColor] = useState('#1f2937')
  const [inserting, setInserting] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(async () => {
      const res = await searchIcons(q, 60)
      if (alive) { setIds(res); setLoading(false) }
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  async function handlePick(id) {
    setInserting(id)
    try {
      const dataUrl = await iconToDataUrl(id, color)
      if (dataUrl) onInsert && onInsert(dataUrl, { iconId: id, isIcon: true, iconColor: color })
    } finally {
      setInserting(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <MediaSearchInput value={q} onChange={setQ} placeholder="Icons suchen…" />
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Farbe änderst du nach dem Einfügen oben in der Leiste.</div>
      {loading ? <MediaSpinner label="Suche Icons…" /> : (
        ids.length === 0 ? <MediaEmpty label="Keine Treffer." /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 8 }}>
            {ids.map(id => (
              <button key={id} onClick={() => handlePick(id)} title={id} disabled={inserting === id}
                draggable onDragStart={() => { _designerDrag = { k: 'dataurl', dataUrl: iconSvgUrl(id, color), meta: { iconId: id, iconColor: color, isIcon: true } } }} onDragEnd={() => { _designerDrag = null }}
                style={{ height: 44, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'grab', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {inserting === id
                  ? <Loader2 size={16} className="lk-spin" style={{ color: 'var(--text-muted)' }} />
                  : <img src={iconSvgUrl(id, color)} alt={id} loading="lazy" draggable={false} width={28} height={28} style={{ display: 'block', objectFit: 'contain' }} />}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ─── Grafiken-Tab (Iconify, farbige Sets) ────────────────────────────────────
function GraphicsTab({ onInsert }) {
  const [q, setQ] = useState('')
  const [ids, setIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [inserting, setInserting] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(async () => {
      const res = await searchGraphics(q, 60)
      if (alive) { setIds(res); setLoading(false) }
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  async function handlePick(id) {
    setInserting(id)
    try {
      const dataUrl = await iconToDataUrl(id) // bereits farbig → kein color-Override
      if (dataUrl) onInsert && onInsert(dataUrl, { isGraphic: true })
    } finally {
      setInserting(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <MediaSearchInput value={q} onChange={setQ} placeholder="Grafiken suchen…" />
      {loading ? <MediaSpinner label="Suche Grafiken…" /> : (
        ids.length === 0 ? <MediaEmpty label="Keine Treffer." /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 8 }}>
            {ids.map(id => (
              <button key={id} onClick={() => handlePick(id)} title={id} disabled={inserting === id}
                draggable onDragStart={() => { _designerDrag = { k: 'dataurl', dataUrl: iconSvgUrl(id), meta: { isGraphic: true } } }} onDragEnd={() => { _designerDrag = null }}
                style={{ height: 44, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'grab', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {inserting === id
                  ? <Loader2 size={16} className="lk-spin" style={{ color: 'var(--text-muted)' }} />
                  : <img src={iconSvgUrl(id)} alt={id} loading="lazy" draggable={false} width={30} height={30} style={{ display: 'block', objectFit: 'contain' }} />}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ─── Bilder-Tab (Pexels via Edge Function) ───────────────────────────────────
function ImagesTab({ onInsert }) {
  const [q, setQ] = useState('')
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [orientation, setOrientation] = useState('') // '' = Alle
  const [missingKey, setMissingKey] = useState(false)
  const [error, setError] = useState('')
  const [inserting, setInserting] = useState(null)

  const orientations = [
    { id: '', label: 'Alle' },
    { id: 'landscape', label: 'Quer' },
    { id: 'portrait', label: 'Hoch' },
    { id: 'square', label: 'Quadrat' },
  ]

  useEffect(() => {
    let alive = true
    setLoading(true); setError(''); setMissingKey(false)
    const t = setTimeout(async () => {
      const res = await searchPhotos({ query: q, perPage: 30, orientation: orientation || undefined })
      if (!alive) return
      setMissingKey(!!res.missingKey)
      setError(res.missingKey ? '' : (res.error || ''))
      setPhotos(Array.isArray(res.photos) ? res.photos : [])
      setLoading(false)
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [q, orientation])

  async function handlePick(photo) {
    setInserting(photo.id)
    try {
      const dataUrl = await photoToDataUrl(photo?.src?.large)
      if (dataUrl) onInsert && onInsert(dataUrl)
    } finally {
      setInserting(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <MediaSearchInput value={q} onChange={setQ} placeholder="Bilder suchen…" />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {orientations.map(o => (
          <button key={o.id} onClick={() => setOrientation(o.id)}
            style={{ height: 26, padding: '0 10px', borderRadius: 999, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              border: '1px solid ' + (orientation === o.id ? P : 'var(--border)'),
              background: orientation === o.id ? 'rgba(49,90,231,0.08)' : '#fff',
              color: orientation === o.id ? P : 'var(--text-muted)' }}>{o.label}</button>
        ))}
      </div>
      {missingKey ? (
        <MediaEmpty label="Bilder-Suche ist noch nicht aktiviert — Pexels-API-Key fehlt." />
      ) : error ? (
        <MediaEmpty label={error} />
      ) : loading ? (
        <MediaSpinner label="Suche Bilder…" />
      ) : photos.length === 0 ? (
        <MediaEmpty label="Keine Treffer." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
          {photos.map(p => (
            <button key={p.id} onClick={() => handlePick(p)} title={p.alt || ''} disabled={inserting === p.id}
              draggable onDragStart={() => { _designerDrag = { k: 'stock', large: p?.src?.large } }} onDragEnd={() => { _designerDrag = null }}
              style={{ border: 'none', padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'grab', background: p.avgColor || '#eef1f5', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: '100%', aspectRatio: '1 / 1', background: p.avgColor || '#eef1f5', position: 'relative' }}>
                <img src={p?.src?.tiny || p?.src?.medium} alt={p.alt || ''} loading="lazy" draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {inserting === p.id && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.6)' }}>
                    <Loader2 size={18} className="lk-spin" style={{ color: 'var(--text-muted)' }} />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Mini-Vorschau einer Vorlage (vereinfachtes Layout-Mockup) ──────────────
function TemplateThumb({ tpl }) {
  const sw = tpl.stage?.width || 1080
  const sh = tpl.stage?.height || 1080
  const W = 124, H = Math.max(60, Math.min(124, Math.round(W * sh / sw)))
  const sc = W / sw
  return (
    <div style={{ position: 'relative', width: W, height: H, borderRadius: 7, overflow: 'hidden', background: tpl.background || '#fff', border: '1px solid var(--border)' }}>
      {(tpl.objects || []).map((o, i) => {
        if (o.type === 'text') {
          return <div key={i} style={{ position: 'absolute', left: (o.x || 0) * sc, top: (o.y || 0) * sc,
            width: (o.width || 300) * sc, color: o.fill || '#111', fontSize: Math.max(5, (o.fontSize || 40) * sc),
            fontWeight: (o.fontStyle || '').includes('bold') ? 700 : 400, lineHeight: 1.1, overflow: 'hidden',
            textAlign: o.align || 'left' }}>{(o.text || '').slice(0, 40)}</div>
        }
        if (o.type === 'rect') {
          return <div key={i} style={{ position: 'absolute', left: (o.x || 0) * sc, top: (o.y || 0) * sc,
            width: (o.width || 0) * sc, height: (o.height || 0) * sc, background: o.fill || 'transparent',
            borderRadius: (o.cornerRadius || 0) * sc }} />
        }
        if (o.type === 'ellipse') {
          return <div key={i} style={{ position: 'absolute', left: ((o.x || 0) - (o.radiusX || 0)) * sc, top: ((o.y || 0) - (o.radiusY || 0)) * sc,
            width: (o.radiusX || 0) * 2 * sc, height: (o.radiusY || 0) * 2 * sc, background: o.fill || 'transparent', borderRadius: '50%' }} />
        }
        return null
      })}
    </div>
  )
}

// ─── Panel-Rahmen (docked sidebar oder Overlay-Popup) ───────────────────────
function ToolPanel(props) {
  const { docked, tool, onClose } = props
  const titleMap = { templates: 'Vorlagen', elements: 'Elemente', text: 'Text', uploads: 'Medien', brand: 'Marke', ai: 'KI-Werkzeuge', filter: 'Filter', layers: 'Ebenen', edit: 'Bild bearbeiten', draw: 'Zeichnen' }
  const frame = docked
    ? { width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface,#fff)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }
    : { position: 'absolute', left: 8, top: 8, bottom: 8, zIndex: 90, width: 300, maxWidth: 'calc(100% - 16px)', borderRadius: 12,
        border: '1px solid var(--border)', background: 'var(--surface,#fff)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 12px 40px rgba(16,24,40,0.18)' }
  return (
    <div data-tool-ui style={frame}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{titleMap[tool] || ''}</span>
        <button onClick={onClose} title="Schließen" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={16} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {tool === 'templates' && <TemplatesPanelBody {...props} />}
        {tool === 'elements' && <ElementsPanelBody {...props} />}
        {tool === 'text' && <TextPanelBody {...props} />}
        {tool === 'uploads' && <UploadsPanelBody {...props} />}
        {tool === 'brand' && <BrandPanelBody {...props} />}
        {tool === 'ai' && <AiPanelBody {...props} />}
        {tool === 'filter' && <FilterPanelBody {...props} />}
        {tool === 'edit' && <EditPanelBody {...props} />}
        {tool === 'layers' && <LayersPanelBody {...props} />}
        {tool === 'draw' && <DrawPanelBody {...props} />}
      </div>
    </div>
  )
}

function PanelBtn({ children, onClick, primary, full, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, padding: '0 12px',
        width: full ? '100%' : 'auto', borderRadius: 9, cursor: disabled ? 'wait' : 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
        border: primary ? 'none' : '1px solid var(--border)', background: primary ? P : '#fff', color: primary ? '#fff' : 'var(--text-primary)', opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  )
}
function PanelLabel({ children }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '4px 0 8px' }}>{children}</div>
}

// ─── Panel: Vorlagen ────────────────────────────────────────────────────────
function TemplatesPanelBody({ onApplyTemplate, onClose }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        Start-Layout wählen — ersetzt die Leinwand durch ein Layout mit Platzhaltern.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {DESIGN_TEMPLATES.map(t => (
          <button key={t.id} onClick={() => { onApplyTemplate(t); onClose && onClose() }} title={t.desc}
            style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 6, borderRadius: 10, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <TemplateThumb tpl={t} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Panel: Elemente (Formen / Icons / Grafiken / Bilder) ───────────────────
function ElementsPanelBody({ elementTab, setElementTab, onAddRect, onAddEllipse, onAddLine, onAddArrow, onAddAsset, onInsertMedia, onAddFrame = () => {}, onAddCollage = () => {}, onAddMockup = () => {} }) {
  const tabs = [
    { id: 'shapes', label: 'Formen' },
    { id: 'frames', label: 'Rahmen' },
    { id: 'collage', label: 'Collage' },
    { id: 'mockups', label: 'Mockups' },
    { id: 'icons', label: 'Icons' },
    { id: 'graphics', label: 'Grafiken' },
    { id: 'images', label: 'Bilder' },
  ]
  const [q, setQ] = useState('')
  const qq = q.trim().toLowerCase()
  const assetList = DESIGN_ASSETS.filter(a => !qq || a.label.toLowerCase().includes(qq) || (a.keywords || '').toLowerCase().includes(qq))
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setElementTab(t.id)}
            style={{ height: 28, padding: '0 10px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit',
              border: '1px solid ' + (elementTab === t.id ? P : 'var(--border)'),
              background: elementTab === t.id ? 'rgba(49,90,231,0.08)' : '#fff',
              color: elementTab === t.id ? P : 'var(--text-muted)' }}>{t.label}</button>
        ))}
      </div>
      {elementTab === 'shapes' && (
        <div>
          <PanelLabel>Basis-Formen</PanelLabel>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <ToolBtn onClick={onAddRect} title="Rechteck"><SquareIcon size={15} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={onAddEllipse} title="Kreis / Ellipse"><CircleIcon size={15} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={onAddLine} title="Linie"><Minus size={15} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={onAddArrow} title="Pfeil"><ArrowRight size={15} strokeWidth={1.9} /></ToolBtn>
          </div>
          <PanelLabel>Symbole & Formen</PanelLabel>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Suchen…"
            style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))', gap: 8 }}>
            {assetList.map(a => (
              <button key={a.id} onClick={() => onAddAsset(a)} title={a.label}
                style={{ height: 46, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: P }}>
                <svg width="26" height="26" viewBox="0 0 100 100"><path d={a.d} fill="currentColor" /></svg>
              </button>
            ))}
            {assetList.length === 0 && <span style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-muted)' }}>Keine Treffer.</span>}
          </div>
        </div>
      )}
      {elementTab === 'frames' && (
        <div>
          <PanelLabel>Bilderrahmen</PanelLabel>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.4 }}>Rahmen einfügen, dann auswählen und ein Bild einsetzen (Upload/Medien) — es füllt die Form (cover).</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 8 }}>
            {FRAME_SHAPES.map(s => (
              <button key={s.id} onClick={() => onAddFrame(s.id)} title={s.label}
                style={{ height: 52, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="30" height="30" viewBox="0 0 100 100"><path d={s.svg} fill="#CBD5E1" stroke="#94A3B8" strokeWidth="3" strokeLinejoin="round" /></svg>
              </button>
            ))}
          </div>
        </div>
      )}
      {elementTab === 'collage' && (
        <div>
          <PanelLabel>Collage-Layouts</PanelLabel>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.4 }}>Layout einfügen — es platziert mehrere Rahmen. Jede Zelle auswählen und ein Bild einsetzen.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 8 }}>
            {COLLAGE_LAYOUTS.map(l => (
              <button key={l.id} onClick={() => onAddCollage(l.id)} title={l.label}
                style={{ height: 58, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                <svg width="42" height="42" viewBox="0 0 100 100">
                  {l.cells.map((ce, i) => (<rect key={i} x={ce[0] * 100 + 2} y={ce[1] * 100 + 2} width={Math.max(0, ce[2] * 100 - 4)} height={Math.max(0, ce[3] * 100 - 4)} rx="3" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="2" />))}
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
      {elementTab === 'mockups' && (
        <div>
          <PanelLabel>Mockups</PanelLabel>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.4 }}>Geräte-Mockup einfügen, dann auswählen und ein Bild einsetzen — es füllt den Screen.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 8 }}>
            {DEVICE_MOCKUPS.map(d => (
              <button key={d.id} onClick={() => onAddMockup(d.id)} title={d.label}
                style={{ height: 58, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                {mockupPreview(d.id)}
                <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600 }}>{d.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {elementTab === 'icons' && <IconsTab onInsert={onInsertMedia} />}
      {elementTab === 'graphics' && <GraphicsTab onInsert={onInsertMedia} />}
      {elementTab === 'images' && <ImagesTab onInsert={onInsertMedia} />}
    </div>
  )
}

// ─── Panel: Text ────────────────────────────────────────────────────────────
function TextPanelBody({ onAddText, onAddTextPreset, onAddTextCombo, brandData, onApplyBrandFont }) {
  const brandFonts = extractBrandFonts(brandData)
  useEffect(() => { TEXT_COMBOS.forEach(c => { loadGoogleFont(c.headFont); loadGoogleFont(c.subFont) }) }, [])
  const presetCard = (sub, sample, size, weight) => (
    <button onClick={() => onAddTextPreset(sub)} style={presetBtn} title={`${sample} hinzufügen`}
      onMouseEnter={e => { e.currentTarget.style.borderColor = P; e.currentTarget.style.background = 'rgba(49,90,231,0.04)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border,#E9ECF2)'; e.currentTarget.style.background = 'var(--surface,#fff)' }}>
      <span style={{ fontSize: size, fontWeight: weight, color: 'var(--text-primary)', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sample}</span>
      <PlusIcon size={15} strokeWidth={2} style={{ color: 'var(--text-soft,#98a2b3)', flexShrink: 0 }} />
    </button>
  )
  return (
    <div>
      <PanelBtn full primary onClick={onAddText}><PlusIcon size={15} strokeWidth={2} />Textfeld hinzufügen</PanelBtn>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 2px', lineHeight: 1.45 }}>
        Schrift, Größe, Farbe und Ausrichtung erscheinen oben in der Leiste, sobald ein Textfeld ausgewählt ist.
      </div>

      <PanelLabel>Schnell hinzufügen</PanelLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {presetCard('heading', 'Überschrift', 22, 800)}
        {presetCard('subheading', 'Unterüberschrift', 15, 700)}
        {presetCard('body', 'Fließtext', 13, 400)}
        {presetCard('kicker', 'LABEL / KICKER', 11, 800)}
        {presetCard('quote', '„Zitat"', 18, 400)}
      </div>

      <PanelLabel>Schrift-Kombinationen</PanelLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {TEXT_COMBOS.map(cfg => (
          <button key={cfg.id} onClick={() => onAddTextCombo && onAddTextCombo(cfg.id)} title={`Kombination „${cfg.label}" einfügen`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '10px 11px', borderRadius: 10, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', overflow: 'hidden' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = P }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border,#E9ECF2)' }}>
            <span style={{ fontFamily: `"${cfg.headFont}", sans-serif`, fontSize: 16, fontWeight: 700, color: cfg.light.head, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{cfg.label}</span>
            <span style={{ fontFamily: `"${cfg.subFont}", sans-serif`, fontSize: 11, color: cfg.light.sub, lineHeight: 1.05 }}>Subline &amp; Text</span>
            <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
              {[cfg.light.head, cfg.light.kicker, cfg.light.sub].map((col, i) => (
                <span key={i} style={{ width: 11, height: 11, borderRadius: 3, background: col, border: '1px solid rgba(0,0,0,0.06)' }} />
              ))}
            </div>
          </button>
        ))}
      </div>

      {brandFonts.length > 0 && (
        <>
          <PanelLabel>Marken-Schriften</PanelLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {brandFonts.map((fam, i) => (
              <button key={i} onClick={() => onApplyBrandFont(fam)} title={`Text in „${fam}" hinzufügen`}
                style={{ ...presetBtn, fontFamily: fam }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = P; e.currentTarget.style.background = 'rgba(49,90,231,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border,#E9ECF2)'; e.currentTarget.style.background = 'var(--surface,#fff)' }}>
                <span style={{ fontSize: 16, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fam}</span>
                <PlusIcon size={15} strokeWidth={2} style={{ color: 'var(--text-soft,#98a2b3)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-soft,#98a2b3)', marginTop: 8, lineHeight: 1.4 }}>
            Bei ausgewähltem Text wird die Schrift direkt übernommen.
          </div>
        </>
      )}
    </div>
  )
}
const textStyleBtn = { display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'left' }
const presetBtn = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'left', transition: 'border-color .12s, background .12s' }

// ─── Panel: Uploads ─────────────────────────────────────────────────────────
function UploadsPanelBody({ onTriggerUpload, uploadThumbs, onInsertUpload, mediaLib, mediaLoading, onInsertMediaItem }) {
  return (
    <div>
      <PanelBtn full primary onClick={onTriggerUpload}><Upload size={15} strokeWidth={1.9} />Bild hochladen</PanelBtn>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0' }}>Tipp: Bilder lassen sich auch direkt auf die Leinwand ziehen.</div>
      {(uploadThumbs || []).length > 0 && (
        <>
          <PanelLabel>Diese Sitzung</PanelLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {uploadThumbs.map((u, i) => (
              <button key={i} onClick={() => onInsertUpload(u)} title="Auf die Leinwand ziehen oder klicken"
                draggable onDragStart={() => { _designerDrag = { k: 'dataurl', dataUrl: u } }} onDragEnd={() => { _designerDrag = null }}
                style={{ height: 64, borderRadius: 8, border: '1px solid var(--border)', background: `#f4f6fa center/cover no-repeat url(${u})`, cursor: 'grab' }} />
            ))}
          </div>
        </>
      )}
      <PanelLabel>Medien-Bibliothek</PanelLabel>
      {mediaLoading ? (
        <MediaSpinner label="Medien werden geladen…" />
      ) : ((mediaLib || []).length === 0 ? (
        <MediaEmpty label="Noch keine Bilder in dieser Marke. Erzeuge welche im Chat oder lade sie hoch." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {mediaLib.map((m) => (
            <button key={m.id} onClick={() => onInsertMediaItem(m.storage_path)} title="Auf die Leinwand ziehen oder klicken"
              draggable onDragStart={() => { _designerDrag = { k: 'media', storagePath: m.storage_path } }} onDragEnd={() => { _designerDrag = null }}
              style={{ height: 64, borderRadius: 8, border: '1px solid var(--border)', background: `#f4f6fa center/cover no-repeat url(${m.url})`, cursor: 'grab' }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Panel: Marke ───────────────────────────────────────────────────────────
function BrandKit({ palette, logos, fonts, onApplyBrandColor, onInsertBrandLogo, onApplyBrandFont, hasSelection }) {
  return (
    <div>
      {palette.length > 0 && (
        <>
          <PanelLabel>Farben</PanelLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {palette.map((c, i) => (
              <button key={i} onClick={() => onApplyBrandColor(c)} title={hasSelection ? `${c} auf Auswahl anwenden` : `${c} als Hintergrund`}
                style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: c, cursor: 'pointer' }} />
            ))}
          </div>
        </>
      )}
      {logos.length > 0 && (
        <>
          <PanelLabel>Logos</PanelLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
            {logos.map((l, i) => (
              <button key={i} onClick={() => onInsertBrandLogo(l.url)} title="Logo einfügen"
                style={{ height: 64, borderRadius: 8, border: '1px solid var(--border)', background: `#fff center/contain no-repeat url(${l.url})`, cursor: 'pointer' }} />
            ))}
          </div>
        </>
      )}
      {fonts.length > 0 && (
        <>
          <PanelLabel>Schriften</PanelLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fonts.map((f, i) => {
              const fam = f.family || f.name
              return (
                <button key={i} onClick={() => onApplyBrandFont(fam)} title="Schrift anwenden"
                  style={{ ...textStyleBtn, fontFamily: fam }}>{fam}</button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Panel: Marke ───────────────────────────────────────────────────────────
// Company Brand → ein Kit. Personal Brand → die Kits aller Company-Brands des Teams.
function BrandPanelBody({ brandData, brandLoading, onApplyBrandColor, onInsertBrandLogo, onApplyBrandFont, hasSelection }) {
  if (brandLoading) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Markenkits werden geladen…</div>
  const handlers = { onApplyBrandColor, onInsertBrandLogo, onApplyBrandFont, hasSelection }
  // Personal-Brand-Ansicht: mehrere Company-Kits untereinander.
  if (brandData && Array.isArray(brandData.companies)) {
    const companies = brandData.companies.filter(c => (c.palette?.length || c.logos?.length || c.fonts?.length))
    if (!companies.length) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Für die Unternehmen in diesem Team ist noch keine visuelle Identität hinterlegt. Du kannst sie im Branding-Bereich der jeweiligen Company Brand pflegen.</div>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {companies.map(c => (
          <div key={c.id}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>{c.name}</div>
            <BrandKit palette={c.palette || []} logos={c.logos || []} fonts={c.fonts || []} {...handlers} />
          </div>
        ))}
      </div>
    )
  }
  // Company-Brand-Ansicht: ein eigenes Kit.
  const palette = brandData?.palette || []
  const logos = brandData?.logos || []
  const fonts = brandData?.fonts || []
  if (!palette.length && !logos.length && !fonts.length) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Für diese Marke ist noch keine visuelle Identität hinterlegt (Farben, Logos, Schriften). Du kannst sie im Branding-Bereich pflegen.</div>
  }
  return <BrandKit palette={palette} logos={logos} fonts={fonts} {...handlers} />
}

// ─── Panel: KI ──────────────────────────────────────────────────────────────
function AiPanelBody({
  aiMode, setAiMode, maskTool, setMaskTool, brushSize, setBrushSize, feather, setFeather,
  aiPrompt, setAiPrompt, aiCommand, setAiCommand, aiBusy, aiError, bgMenuBusy, hasMask,
  onRunMaskEdit, onRunFreeCommand, onBgRemove, onBgReplace, onClearMask, onInvertMask,
  setCropMode, setSelectedId, setAiError,
}) {
  const [bgText, setBgText] = useState('')
  const startMask = (mode) => { setAiMode(mode); setCropMode(false); setSelectedId(null); setAiError && setAiError('') }
  return (
    <div>
      <PanelLabel>Schnellbefehl</PanelLabel>
      <textarea value={aiCommand} onChange={e => setAiCommand(e.target.value)} placeholder="Was soll die KI tun? z.B. mach das Bild winterlich"
        style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }} />
      <PanelBtn full primary disabled={aiBusy} onClick={onRunFreeCommand}><Sparkles size={15} strokeWidth={1.9} />{aiBusy ? 'KI arbeitet…' : 'Ausführen'}</PanelBtn>

      <PanelLabel>Bereich bearbeiten</PanelLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <PanelBtn onClick={() => startMask(aiMode === 'edit' ? null : 'edit')} primary={aiMode === 'edit'}><Wand2 size={14} strokeWidth={1.9} />Bereich</PanelBtn>
        <PanelBtn onClick={() => startMask(aiMode === 'heal' ? null : 'heal')} primary={aiMode === 'heal'}><Eraser size={14} strokeWidth={1.9} />Entfernen</PanelBtn>
      </div>
      {aiMode && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <ToolBtn onClick={() => setMaskTool('brush')} active={maskTool === 'brush'} title="Pinsel"><Brush size={14} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={() => setMaskTool('lasso')} active={maskTool === 'lasso'} title="Lasso"><Lasso size={14} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={() => setMaskTool('rect')} active={maskTool === 'rect'} title="Rechteck"><SquareIcon size={14} strokeWidth={1.9} /></ToolBtn>
          </div>
          {maskTool === 'brush' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              Pinsel<input type="range" min={10} max={300} step={2} value={brushSize} onChange={e => setBrushSize(parseInt(e.target.value, 10))} style={{ flex: 1 }} />
            </label>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
            <input type="checkbox" checked={feather} onChange={e => setFeather(e.target.checked)} />weiche Kante
          </label>
          {aiMode === 'edit' && (
            <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="z.B. mach das Hemd blau"
              style={{ width: '100%', height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }} />
          )}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <PanelBtn onClick={onClearMask}>Leeren</PanelBtn>
            <PanelBtn onClick={onInvertMask}>Invertieren</PanelBtn>
          </div>
          <PanelBtn full primary disabled={aiBusy || !hasMask} onClick={onRunMaskEdit}>{aiBusy ? 'KI arbeitet…' : (aiMode === 'heal' ? 'Entfernen' : 'Anwenden')}</PanelBtn>
        </div>
      )}

      <PanelLabel>Hintergrund</PanelLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <PanelBtn full disabled={bgMenuBusy} onClick={onBgRemove}>Hintergrund entfernen (transparent)</PanelBtn>
        <input value={bgText} onChange={e => setBgText(e.target.value)} placeholder="Neuer Hintergrund (Beschreibung)…"
          style={{ width: '100%', height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <PanelBtn full disabled={bgMenuBusy || !bgText.trim()} onClick={() => { if (bgText.trim()) { onBgReplace(bgText.trim()); setBgText('') } }}>Hintergrund ersetzen</PanelBtn>
      </div>
      {aiError && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 10 }}>{aiError}</div>}
    </div>
  )
}

// ─── Panel: Zeichnen (Freihand) ──────────────────────────────────────────────
function DrawPanelBody({ penColor, setPenColor, penWidth, setPenWidth, onDoneDraw, brandColors = [], activeBrush = 'pen', onPickBrush }) {
  const isEraser = (activeBrush || 'pen') === 'eraser'
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Zeichne frei auf der Fläche — Werkzeug wählen, Maus gedrückt halten und ziehen. Jeder Strich wird ein eigenes Element, das du danach verschieben, färben oder löschen kannst.
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 7 }}>Werkzeug</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {BRUSHES.map(b => {
          const on = (activeBrush || 'pen') === b.id
          return (
            <button key={b.id} type="button" onClick={() => onPickBrush && onPickBrush(b.id)} title={b.label}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '9px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: '1.5px solid ' + (on ? P : 'var(--border,#E9ECF2)'), background: on ? 'rgba(49,90,231,0.06)' : 'var(--surface,#fff)', color: on ? P : 'var(--text-secondary,#475467)' }}>
              <b.Icon size={18} strokeWidth={1.9} />
              <span style={{ fontSize: 11, fontWeight: on ? 700 : 600 }}>{b.label}</span>
            </button>
          )
        })}
      </div>
      {!isEraser && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>Farbe</span>
          <ColorPopover value={penColor} brandColors={brandColors} title="Stiftfarbe" round onChange={(hex) => setPenColor(hex)} size={30} />
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          <span>{isEraser ? 'Radierer-Größe' : 'Pinselstärke'}</span><span style={{ color: 'var(--text-muted)' }}>{penWidth} px</span>
        </div>
        <input type="range" min={1} max={60} step={1} value={penWidth} onChange={e => setPenWidth(parseInt(e.target.value, 10) || 1)} style={{ width: '100%', accentColor: P }} />
      </div>
      <PanelBtn full primary onClick={onDoneDraw}>Fertig</PanelBtn>
    </div>
  )
}

// ─── Panel: Bild bearbeiten (kombiniert Anpassen/Filter + KI) ────────────────
// Wird NUR kontextuell geöffnet (Bild ausgewählt → „Bearbeiten" in der oberen
// Leiste). Bündelt Filter/Anpassungen und die KI-Werkzeuge in einem Panel — wie
// Canvas „Bild bearbeiten".
function EditPanelBody(props) {
  return (
    <div>
      <AiPanelBody {...props} />
      <div style={{ height: 1, background: 'var(--border,#E9ECF2)', margin: '16px 0' }} />
      <FilterPanelBody {...props} />
    </div>
  )
}

// ─── Panel: Filter ──────────────────────────────────────────────────────────
// Konva-Filterparameter grob als CSS-Filter abbilden (für Live-Vorschau-Thumbnails).
function cssForFilter(f = {}) {
  const parts = []
  if (f.brightness) parts.push(`brightness(${(1 + f.brightness).toFixed(2)})`)
  if (f.contrast) parts.push(`contrast(${(1 + f.contrast / 100).toFixed(2)})`)
  if (f.grayscale) parts.push('grayscale(1)')
  if (f.sepia) parts.push(`sepia(${Math.min(1, f.sepia)})`)
  if (f.invert) parts.push('invert(1)')
  if (typeof f.saturation === 'number' && f.saturation) parts.push(`saturate(${Math.max(0, 1 + f.saturation * 0.5).toFixed(2)})`)
  if (f.warmth) parts.push(`sepia(${Math.min(0.5, Math.abs(f.warmth) / 120).toFixed(2)}) hue-rotate(${f.warmth > 0 ? -10 : 25}deg)`)
  if (f.blur) parts.push(`blur(${Math.min(3, f.blur / 8).toFixed(1)}px)`)
  return parts.join(' ') || 'none'
}
function FilterPanelBody({ filters, setFilters, commitHistoryOnce, endInteraction, filterScope, filterPreviewSrc }) {
  const set = (k, v) => setFilters({ ...filters, [k]: v })
  const applyPreset = (f) => { commitHistoryOnce(); setFilters({ ...EMPTY_FILTERS, ...f }); endInteraction() }
  const toggle = (k) => { commitHistoryOnce(); set(k, filters[k] ? 0 : 1); endInteraction() }
  const Toggle = ({ k, label }) => (
    <button onClick={() => toggle(k)}
      style={{ flex: 1, height: 32, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
        border: '1px solid ' + (filters[k] ? P : 'var(--border,#E9ECF2)'),
        background: filters[k] ? 'rgba(49,90,231,0.08)' : 'var(--surface,#fff)',
        color: filters[k] ? P : 'var(--text-muted,#475467)' }}>{label}</button>
  )
  return (
    <div>
      <PanelLabel>Looks</PanelLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {FILTER_PRESETS.map(p => (
          <button key={p.id} onClick={() => applyPreset(p.f)} title={p.label}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 9, overflow: 'hidden', border: '1.5px solid var(--border,#E9ECF2)', background: '#EEF1F6', display: 'block' }}>
              {filterPreviewSrc
                ? <img src={filterPreviewSrc} alt={p.label} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: cssForFilter(p.f), display: 'block' }} />
                : <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: 'var(--text-muted)', filter: cssForFilter(p.f), background: 'linear-gradient(135deg,#c7d2fe,#fbcfe8)' }} />}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted,#667085)' }}>{p.label}</span>
          </button>
        ))}
      </div>

      <PanelLabel>Anpassen</PanelLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <Slider label="Belichtung" min={-0.6} max={0.6} step={0.02} value={filters.brightness} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('brightness', v)} />
        <Slider label="Kontrast" min={-60} max={60} step={2} value={filters.contrast} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('contrast', v)} />
        <Slider label="Sättigung" min={-2} max={4} step={0.1} value={filters.saturation} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('saturation', v)} />
        <Slider label="Wärme" min={-60} max={60} step={2} value={filters.warmth} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('warmth', v)} />
        <Slider label="Farbton" min={0} max={359} step={1} value={filters.hue} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('hue', v)} />
        <Slider label="Tönung" min={-60} max={60} step={2} value={filters.tint} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('tint', v)} />
        <Slider label="Schärfe" min={0} max={1} step={0.05} value={filters.enhance} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('enhance', v)} />
        <Slider label="Weichzeichnen" min={0} max={30} step={1} value={filters.blur} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('blur', v)} />
        <Slider label="Körnung" min={0} max={1} step={0.02} value={filters.noise} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('noise', v)} />
        <Slider label="Vignette" min={0} max={1} step={0.05} value={filters.vignette} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('vignette', v)} />
        <Slider label="Verpixeln" min={0} max={24} step={1} value={filters.pixelate} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('pixelate', v)} />
      </div>

      <PanelLabel>Effekte</PanelLabel>
      <div style={{ display: 'flex', gap: 6 }}>
        <Toggle k="grayscale" label="S/W" />
        <Toggle k="sepia" label="Sepia" />
        <Toggle k="invert" label="Invertieren" />
      </div>

      <div style={{ marginTop: 16 }}>
        <PanelBtn full onClick={() => { commitHistoryOnce(); setFilters({ ...EMPTY_FILTERS }); endInteraction() }}>Alle Filter zurücksetzen</PanelBtn>
      </div>
    </div>
  )
}

// ─── Panel: Ebenen ──────────────────────────────────────────────────────────
// Ersetzt den früheren EBENEN-Abschnitt der rechten Spalte. Gleiche Logik:
// Auswahl, Drag-Reorder (reorderObjects), Auge/Schloss (toggleLayerFlag),
// Umbenennen (renameLayer / renamingId).
function LayersPanelBody({
  objects, selectedIds, setSelectedIds, reorderObjects, toggleLayerFlag,
  renameLayer, renamingId, setRenamingId, layerDragRef, layerDragOverId, setLayerDragOverId,
}) {
  const layers = [...(objects || [])].reverse()  // oberste Ebene oben
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10 }}>
        Reihenfolge per Ziehen ändern. Auge = Ein-/Ausblenden, Schloss = Sperren, Doppelklick = Umbenennen.
      </div>
      {layers.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '14px 0' }}>Noch keine Objekte. Füge Text, Formen oder Bilder hinzu.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {layers.map(layer => {
          const isSel = (selectedIds || []).includes(layer.id)
          const Meta = LAYER_META[layer.type] || LAYER_META.rect
          const Icon = Meta.Icon
          const dragOver = layerDragOverId === layer.id
          return (
            <div key={layer.id}
              draggable
              onDragStart={() => { if (layerDragRef) layerDragRef.current = layer.id }}
              onDragOver={(e) => { e.preventDefault(); setLayerDragOverId && setLayerDragOverId(layer.id) }}
              onDragLeave={() => setLayerDragOverId && setLayerDragOverId(null)}
              onDrop={(e) => { e.preventDefault(); const d = layerDragRef && layerDragRef.current; if (d && d !== layer.id) reorderObjects(d, layer.id, false); setLayerDragOverId && setLayerDragOverId(null); if (layerDragRef) layerDragRef.current = null }}
              onClick={() => setSelectedIds([layer.id])}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 9, cursor: 'pointer',
                background: isSel ? 'color-mix(in srgb, var(--wl-primary, rgb(49,90,231)) 12%, transparent)' : '#fff',
                border: dragOver ? `1px dashed ${P}` : '1px solid var(--border)', opacity: layer.hidden ? 0.5 : 1 }}>
              <GripVertical size={14} color="var(--text-muted)" style={{ cursor: 'grab', flexShrink: 0 }} />
              <Icon size={14} color={isSel ? P : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
              {renamingId === layer.id ? (
                <input autoFocus defaultValue={rpLabel(layer)}
                  onBlur={(e) => renameLayer(layer.id, e.target.value.trim() || rpLabel(layer))}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setRenamingId(null) } }}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', outline: 'none' }} />
              ) : (
                <span onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(layer.id) }}
                  style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rpLabel(layer)}</span>
              )}
              <button onClick={(e) => { e.stopPropagation(); toggleLayerFlag(layer.id, 'hidden') }} title={layer.hidden ? 'Einblenden' : 'Ausblenden'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1 }}>
                {layer.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); toggleLayerFlag(layer.id, 'locked') }} title={layer.locked ? 'Entsperren' : 'Sperren'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: layer.locked ? P : 'var(--text-muted)', display: 'flex', padding: 1 }}>
                {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
