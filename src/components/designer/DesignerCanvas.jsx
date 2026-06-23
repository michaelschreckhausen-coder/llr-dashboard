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
import { Stage, Layer, Image as KImage, Rect, Circle, Ellipse, Line, Arrow, Text as KText, Path, Transformer } from 'react-konva'
import Konva from 'konva'
import {
  Type, Square as SquareIcon, Circle as CircleIcon, Minus, ArrowRight, Star as StarIcon,
  Trash2, Undo2, Redo2, Save, Download, BringToFront, SendToBack, Crop, Wand2,
  Bold, Italic, Sliders, Loader2, X, ChevronUp, ChevronDown, Brush, Lasso,
  Eraser, Image as ImageIcon, LayoutTemplate,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { visualDataUrl, uploadDesignRender, updateVisual, getVisual } from '../../lib/contentVisuals'
import { splitModelValue, DEFAULT_IMAGE_MODEL } from '../../lib/imageModels'
import { DESIGN_TEMPLATES } from '../../lib/designTemplates'

const P = 'var(--wl-primary, rgb(49,90,231))'
const PRGB = 'rgb(49,90,231)'

// ~10 gängige Web-Fonts (inkl. der bereits genutzten Inter/Georgia/Caveat).
const FONTS = [
  'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
  'Courier New', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Caveat',
]

// Einfache Sticker als SVG-Pfad-Daten (auf 100×100 normiert) — Phase-1-Set.
const STICKERS = [
  { id: 'star',  label: 'Stern',  d: 'M50 5 L61 39 L97 39 L68 61 L79 95 L50 73 L21 95 L32 61 L3 39 L39 39 Z' },
  { id: 'heart', label: 'Herz',   d: 'M50 88 C50 88 8 60 8 33 C8 18 20 10 32 10 C41 10 47 16 50 22 C53 16 59 10 68 10 C80 10 92 18 92 33 C92 60 50 88 50 88 Z' },
  { id: 'check', label: 'Haken',  d: 'M20 52 L42 75 L82 22' },
  { id: 'badge', label: 'Plakette', d: 'M50 5 L62 18 L80 14 L80 33 L95 45 L82 58 L86 77 L67 78 L50 92 L33 78 L14 77 L18 58 L5 45 L20 33 L20 14 L38 18 Z' },
]

const HEAL_PROMPT = 'Entferne den Inhalt im markierten Bereich vollständig und fülle ihn natürlich und nahtlos passend zum Umfeld auf. Keine Artefakte, keine Kanten, fotorealistisch und stilistisch konsistent mit dem Rest des Bildes.'

// KI-Schritt für "Transparent freistellen": Motiv vor reinem Magenta-Vollflächen-
// Hintergrund. Magenta (#FF00FF) wird anschließend client-seitig zu Alpha gekeyt.
const CHROMA_PROMPT = 'Stelle das Hauptmotiv exakt und unverändert frei und platziere es auf einem absolut gleichmäßigen, reinen Vollflächen-Hintergrund in der Farbe Magenta (Hex #FF00FF, reines RGB 255,0,255). Scharfe, saubere Motivkanten. Das Motiv selbst darf KEINE magentafarbenen oder pinken Flächen enthalten. Kein Schlagschatten, kein Verlauf, keine Textur im Hintergrund — nur exakt #FF00FF.'

// ─── Client-seitiges Chroma-Keying: Magenta → Alpha ─────────────────────────
// Wandelt ImageData (RGBA) in-place um, sodass Magenta-Hintergrund transparent
// wird, mit weichem Kanten-Übergang (Soft-Edge) und Despill (entfernt pinken
// Farbsaum an den Motivkanten). Schwellen sind als Konstanten gewählt, die zu
// sauberen Ergebnissen bei reinem #FF00FF-Hintergrund führen.
//
//  keyScore  = "wie magenta ist dieses Pixel" in [0..1]
//              hoch, wenn G niedrig UND R,B hoch
//  INNER/OUTER definieren die lineare Soft-Edge-Rampe:
//    keyScore >= OUTER  → voll transparent (Hintergrund)
//    keyScore <= INNER  → voll opak (Motiv)
//    dazwischen         → linear interpolierter Alpha-Übergang
//  SPILL = Stärke der Magenta-Entsättigung an Misch-/Kantenpixeln
function chromaKeyToAlpha(imageData) {
  // ADAPTIV: Die KI liefert nicht zwingend exakt #FF00FF, sondern oft ein
  // abweichendes Magenta/Pink (z.B. niedrigerer Blau-Anteil). Statt fest auf
  // #FF00FF zu keyen, sampeln wir die TATSÄCHLICHE Hintergrundfarbe aus den vier
  // Bildecken (dort ist garantiert Hintergrund) und keyen dann nach Farbabstand
  // zu dieser gesampelten Farbe. Robust gegen jeden Magenta-/Pink-Ton.
  const d = imageData.data
  const W = imageData.width, H = imageData.height
  // 1) Hintergrundfarbe = Median je Kanal über vier Eck-Patches (robust gegen Ausreißer).
  const patch = Math.max(4, Math.min(10, Math.floor(Math.min(W, H) / 40)))
  const sr = [], sg = [], sb = []
  const addPatch = (x0, y0) => {
    for (let y = y0; y < y0 + patch && y < H; y++) {
      for (let x = x0; x < x0 + patch && x < W; x++) {
        const idx = (y * W + x) * 4
        sr.push(d[idx]); sg.push(d[idx + 1]); sb.push(d[idx + 2])
      }
    }
  }
  addPatch(0, 0); addPatch(W - patch, 0); addPatch(0, H - patch); addPatch(W - patch, H - patch)
  const median = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0 }
  const bgR = median(sr), bgG = median(sg), bgB = median(sb)
  // 2) Distanz-Schwellen (euklidisch im RGB). dist klein → Hintergrund (Alpha 0),
  //    dist groß → Motiv (Alpha 255), dazwischen weiche Kante.
  const INNER = 70    // dist <= INNER → sicher Hintergrund
  const OUTER = 140   // dist >= OUTER → sicher Motiv
  const span = OUTER - INNER
  const SPILL = 0.6   // Despill: an Kantenpixeln den Hintergrund-Farbstich rausziehen
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2]
    const dr = r - bgR, dg = g - bgG, db = b - bgB
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    let a
    if (dist <= INNER) a = 0
    else if (dist >= OUTER) a = 255
    else a = Math.round(255 * (dist - INNER) / span)
    // Despill an teil-transparenten Kantenpixeln: Pixel von der Hintergrundfarbe
    // wegziehen, damit kein farbiger Saum bleibt.
    if (a > 0 && a < 255) {
      r = Math.max(0, Math.min(255, r + dr * SPILL))
      g = Math.max(0, Math.min(255, g + dg * SPILL))
      b = Math.max(0, Math.min(255, b + db * SPILL))
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a
  }
  return imageData
}

// Erzeugt ein kleines Schachbrett-Muster als DataURL (für transparenz-Anzeige).
function makeCheckerDataUrl(cell = 10) {
  const c = document.createElement('canvas')
  c.width = cell * 2; c.height = cell * 2
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cell * 2, cell * 2)
  ctx.fillStyle = '#d9dee6'
  ctx.fillRect(0, 0, cell, cell)
  ctx.fillRect(cell, cell, cell, cell)
  return c.toDataURL('image/png')
}
const CHECKER_URL = (() => { try { return makeCheckerDataUrl(10) } catch (_e) { return '' } })()

let _uid = 0
const nextId = () => `obj_${Date.now()}_${_uid++}`

export default function DesignerCanvas({ visual, teamId, onSaved, onReplaceVisual }) {
  const stageRef = useRef(null)
  const layerRef = useRef(null)
  const trRef = useRef(null)
  const containerRef = useRef(null)
  const textareaRef = useRef(null)

  const [bgImage, setBgImage] = useState(null)        // HTMLImageElement des Basisbildes
  const [stageSize, setStageSize] = useState({ width: 600, height: 600 })
  const [scale, setScale] = useState(1)               // Anzeige-Skalierung (Bühne → Container)
  const [containerW, setContainerW] = useState(700)

  const [objects, setObjects] = useState([])          // Overlay-Objekte (Text, Formen, Sticker)
  const [selectedId, setSelectedId] = useState(null)
  const [editingTextId, setEditingTextId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  // Hintergrund-Füllfarbe (für Vorlagen ohne Bild)
  const [bgColor, setBgColor] = useState(null)        // null = kein Farbgrund (Bild-Modus)

  // Bild-Filter (auf Basisbild)
  const [filters, setFilters] = useState({ brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: 0 })
  const [showFilters, setShowFilters] = useState(false)

  // Crop-Modus
  const [cropMode, setCropMode] = useState(false)
  const [cropRect, setCropRect] = useState(null)      // {x,y,w,h} in Bühnenkoordinaten
  const cropDragRef = useRef(null)

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

  // Hintergrund-Menü
  const [bgMenuBusy, setBgMenuBusy] = useState(false)
  // Transparenz: true sobald ein freigestelltes (Alpha-)PNG als Basisbild geladen ist.
  // Steuert das Schachbrett-Muster hinter der Bild-Ebene.
  const [isTransparent, setIsTransparent] = useState(false)

  // Vorlagen-Panel
  const [showTemplates, setShowTemplates] = useState(false)

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

  // Aktuelles Crop-Fenster des Basisbildes (nicht-destruktiv über Konva crop())
  const [baseCrop, setBaseCrop] = useState(null)      // {x,y,width,height} in Bild-Pixeln

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
        if (!inlineDataUrl && !visual?.storage_path) { setLoadError('Kein Bildpfad'); setLoading(false); return }
        const dataUrl = inlineDataUrl || await visualDataUrl(visual.storage_path)
        if (!dataUrl) { if (!cancelled) { setLoadError('Bild konnte nicht geladen werden'); setLoading(false) } return }
        const img = new window.Image()
        img.onload = () => {
          if (cancelled) return
          const w = img.naturalWidth || 1024
          const h = img.naturalHeight || 1024
          setBgImage(img)
          setBgColor(null)
          setStageSize({ width: w, height: h })
          setBaseCrop(null)
          // Transparenz erkennen → Schachbrett-Hintergrund zeigen.
          // Stichproben-Check (Ecken + Mitte der Ränder), günstig & ausreichend.
          // Bei explizit transparent geliefertem Bild (__isTransparent) überspringen
          // wir die Auto-Detektion und vertrauen dem Flag.
          if (visual?.__isTransparent) {
            setIsTransparent(true)
          } else try {
            const tc = document.createElement('canvas')
            const tw = Math.min(64, w), th = Math.min(64, h)
            tc.width = tw; tc.height = th
            const tctx = tc.getContext('2d')
            tctx.drawImage(img, 0, 0, tw, th)
            const td = tctx.getImageData(0, 0, tw, th).data
            let hasAlpha = false
            for (let p = 3; p < td.length; p += 4) { if (td[p] < 250) { hasAlpha = true; break } }
            setIsTransparent(hasAlpha)
          } catch (_e) { /* CORS o.ä. — Schachbrett bleibt aus */ }
          // Vorhandenes Design wiederherstellen?
          let restored = false
          try {
            const dj = visual.design_json
            if (dj && typeof dj === 'object' && (Array.isArray(dj.objects) || dj.objects)) {
              setObjects(Array.isArray(dj.objects) ? dj.objects : [])
              if (dj.filters) setFilters({ brightness:0, contrast:0, saturation:0, blur:0, grayscale:0, ...dj.filters })
              if (dj.baseCrop) setBaseCrop(dj.baseCrop)
              restored = true
            }
          } catch (_e) { /* fallback: nur Flachbild */ }
          if (!restored) { setObjects([]); setFilters({ brightness:0, contrast:0, saturation:0, blur:0, grayscale:0 }) }
          // Masken-Canvas in Bild-Auflösung anlegen
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

  // ─── Anzeige-Skalierung an Container anpassen ──────────────────────────────
  useEffect(() => {
    function measure() {
      const el = containerRef.current
      if (!el) return
      const w = el.clientWidth || 700
      setContainerW(w)
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro && containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', measure)
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  useEffect(() => {
    const maxW = Math.max(240, containerW - 4)
    const maxH = Math.max(240, (typeof window !== 'undefined' ? window.innerHeight : 800) - 260)
    const s = Math.min(maxW / stageSize.width, maxH / stageSize.height, 1)
    setScale(s > 0 && isFinite(s) ? s : 1)
  }, [containerW, stageSize])

  // ─── Bild-Filter auf Basisbild anwenden (Konva.Filters) ────────────────────
  const bgNodeRef = useRef(null)
  useEffect(() => {
    const node = bgNodeRef.current
    if (!node || !bgImage) return
    try {
      const active = []
      if (filters.brightness) active.push(Konva.Filters.Brighten)
      if (filters.contrast) active.push(Konva.Filters.Contrast)
      if (filters.saturation || filters.grayscale) active.push(Konva.Filters.HSL)
      if (filters.grayscale) active.push(Konva.Filters.Grayscale)
      if (filters.blur) active.push(Konva.Filters.Blur)
      node.filters(active)
      node.brightness(filters.brightness || 0)
      node.contrast(filters.contrast || 0)
      node.saturation((filters.saturation || 0))
      node.blurRadius(filters.blur || 0)
      node.cache()
      node.getLayer()?.batchDraw()
    } catch (e) { /* Filter-Fehler ignorieren, Bild bleibt sichtbar */ }
  }, [filters, bgImage, baseCrop, stageSize])

  // ─── Transformer an Selektion binden ───────────────────────────────────────
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    try {
      if (!selectedId || editingTextId || cropMode || aiMode) { tr.nodes([]); tr.getLayer()?.batchDraw(); return }
      const node = stage.findOne('#' + selectedId)
      if (node) { tr.nodes([node]); tr.getLayer()?.batchDraw() }
      else { tr.nodes([]) }
    } catch (_e) { /* noop */ }
  }, [selectedId, objects, editingTextId, cropMode, aiMode])

  // ─── History-Helfer ────────────────────────────────────────────────────────
  const snapshot = useCallback(() => ({
    objects: JSON.parse(JSON.stringify(objects)),
    filters: { ...filters },
    baseCrop: baseCrop ? { ...baseCrop } : null,
    bgColor,
    stageSize: { ...stageSize },
  }), [objects, filters, baseCrop, bgColor, stageSize])

  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current) return
    try {
      historyRef.current.push(snapshot())
      if (historyRef.current.length > 60) historyRef.current.shift()
      futureRef.current = []
    } catch (_e) { /* noop */ }
  }, [snapshot])

  const applyState = (st) => {
    skipHistoryRef.current = true
    setObjects(st.objects || [])
    setFilters({ brightness:0, contrast:0, saturation:0, blur:0, grayscale:0, ...(st.filters || {}) })
    setBaseCrop(st.baseCrop || null)
    if (st.bgColor !== undefined) setBgColor(st.bgColor)
    if (st.stageSize) setStageSize(st.stageSize)
    setSelectedId(null)
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

  // Keyboard: Undo/Redo + Löschen
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !typing && !editingTextId) {
        e.preventDefault(); deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, selectedId, editingTextId])

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
    if (!selectedId) return
    pushHistory()
    setObjects(prev => prev.filter(o => o.id !== selectedId))
    setSelectedId(null)
  }

  const selected = objects.find(o => o.id === selectedId) || null

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
  function addSticker(st) {
    const c = center()
    const target = Math.min(stageSize.width, stageSize.height) * 0.25
    const sc = target / 100
    addObject({ type: 'sticker', d: st.d, x: c.x - (50 * sc), y: c.y - (50 * sc), scaleX: sc, scaleY: sc,
      fill: st.id === 'check' ? 'rgba(0,0,0,0)' : '#FFD43B', stroke: st.id === 'check' ? '#22c55e' : '#000000',
      strokeWidth: st.id === 'check' ? 12 : 0, rotation: 0 })
  }

  // ─── Vorlagen anwenden (Start-Layout) ──────────────────────────────────────
  function applyTemplate(tpl) {
    if (!tpl) return
    pushHistory()
    const w = tpl.stage?.width || 1080
    const h = tpl.stage?.height || 1080
    setBgColor(tpl.background || '#ffffff')
    setStageSize({ width: w, height: h })
    setBaseCrop(null)
    setFilters({ brightness:0, contrast:0, saturation:0, blur:0, grayscale:0 })
    const objs = (tpl.objects || []).map(o => ({ id: nextId(), ...JSON.parse(JSON.stringify(o)) }))
    setObjects(objs)
    setSelectedId(null)
    setShowTemplates(false)
    // Maske passend zur neuen Bühne neu anlegen
    resetMaskCanvas(w, h)
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
    return {
      position: 'absolute',
      top: (obj.y - offY) * scale,
      left: (obj.x - offX) * scale,
      width: (obj.width || 360) * scale * (obj.scaleX || 1),
      transformOrigin: 'top left',
      fontSize: (obj.fontSize || 44) * scale * (obj.scaleY || 1),
      fontFamily: obj.fontFamily || 'Inter',
      lineHeight: 1.1,
      color: obj.fill || '#fff',
      background: 'rgba(0,0,0,0.35)',
      border: '1px dashed #fff',
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
    const dw = Math.round(cw * scale)
    const dh = Math.round(ch * scale)
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
      ctx.moveTo((p0.x - offX) * scale, (p0.y - offY) * scale)
      for (let i = 1; i < lassoPtsRef.current.length; i++) {
        const p = lassoPtsRef.current[i]
        ctx.lineTo((p.x - offX) * scale, (p.y - offY) * scale)
      }
      ctx.stroke()
      ctx.restore()
    }
  }
  // Overlay bei relevanten Änderungen neu zeichnen
  useEffect(() => { redrawOverlay() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMode, scale, baseCrop, stageSize, maskTool])

  // Overlay-Pointer → Bild-Pixel-Koordinaten
  function overlayPoint(e) {
    const ov = overlayRef.current
    if (!ov) return null
    const rect = ov.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const px = (clientX - rect.left) / scale + (baseCrop ? baseCrop.x : 0)
    const py = (clientY - rect.top) / scale + (baseCrop ? baseCrop.y : 0)
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
    ctx.strokeRect((x - offX) * scale, (y - offY) * scale, w * scale, h * scale)
    ctx.fillStyle = 'rgba(49,90,231,0.25)'
    ctx.fillRect((x - offX) * scale, (y - offY) * scale, w * scale, h * scale)
    ctx.restore()
  }

  // ─── Stage-Click (Selektion aufheben / Crop) ────────────────────────────────
  function onStageMouseDown(e) {
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const offX = baseCrop ? baseCrop.x : 0
    const offY = baseCrop ? baseCrop.y : 0
    const sx = pos.x / scale + offX
    const sy = pos.y / scale + offY
    if (cropMode) { cropDragRef.current = { x: sx, y: sy }; setCropRect({ x: sx, y: sy, w: 0, h: 0 }); return }
    // Klick auf leere Bühne → Selektion lösen
    if (e.target === stage || e.target.attrs?.id === '__bg__' || e.target.attrs?.id === '__bgfill__') {
      setSelectedId(null)
      if (editingTextId) commitTextEdit()
    }
  }
  function onStageMouseMove() {
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const offX = baseCrop ? baseCrop.x : 0
    const offY = baseCrop ? baseCrop.y : 0
    const sx = pos.x / scale + offX
    const sy = pos.y / scale + offY
    if (cropMode && cropDragRef.current) {
      const s = cropDragRef.current
      setCropRect({ x: Math.min(s.x, sx), y: Math.min(s.y, sy), w: Math.abs(sx - s.x), h: Math.abs(sy - s.y) })
    }
  }
  function onStageMouseUp() {
    cropDragRef.current = null
  }

  function applyCrop() {
    if (!cropRect || cropRect.w < 8 || cropRect.h < 8) { setCropMode(false); setCropRect(null); return }
    pushHistory()
    const nx = (baseCrop ? baseCrop.x : 0) + cropRect.x
    const ny = (baseCrop ? baseCrop.y : 0) + cropRect.y
    setBaseCrop({ x: nx, y: ny, width: cropRect.w, height: cropRect.h })
    setStageSize({ width: cropRect.w, height: cropRect.h })
    setCropMode(false); setCropRect(null)
    setSelectedId(null)
  }
  function resetCrop() {
    if (!bgImage) return
    pushHistory()
    setBaseCrop(null)
    setStageSize({ width: bgImage.naturalWidth, height: bgImage.naturalHeight })
    setCropMode(false); setCropRect(null)
  }

  // ─── Export / Speichern ────────────────────────────────────────────────────
  async function renderBlob(pixelRatio = 2) {
    const stage = stageRef.current
    if (!stage) throw new Error('Stage nicht bereit')
    const tr = trRef.current
    const hadNodes = tr ? tr.nodes() : []
    try { if (tr) { tr.nodes([]); tr.getLayer()?.batchDraw() } } catch (_e) {}
    let dataUrl
    try {
      dataUrl = stage.toDataURL({ pixelRatio, mimeType: 'image/png' })
    } finally {
      try { if (tr && hadNodes.length) { tr.nodes(hadNodes); tr.getLayer()?.batchDraw() } } catch (_e) {}
    }
    const res = await fetch(dataUrl)
    return await res.blob()
  }

  async function handleSave() {
    if (!visual?.id || !teamId) { setSavedMsg('Speichern nicht möglich (kein Team/Visual)'); return }
    setSaving(true); setSavedMsg('')
    try {
      const blob = await renderBlob(2)
      const { path, error: upErr } = await uploadDesignRender(teamId, visual.id, blob)
      if (upErr || !path) throw new Error(upErr?.message || 'Upload fehlgeschlagen')
      const design_json = { version: 1, objects, filters, baseCrop, bgColor, stage: { width: stageSize.width, height: stageSize.height } }
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

  async function handleDownloadPng() {
    try {
      const blob = await renderBlob(2)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leadesk-design-${visual?.id || 'export'}.png`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (e) {
      setSavedMsg('Download-Fehler: ' + (e?.message || ''))
    }
  }

  // ─── Hilfsfunktion: generate-image aufrufen, neuen Visual-Datensatz holen ───
  async function callGenerateImage(prompt) {
    const { model, quality } = splitModelValue(DEFAULT_IMAGE_MODEL)
    const { data, error: fnErr } = await supabase.functions.invoke('generate-image', {
      body: {
        prompt,
        aspectRatio: visual.aspect_ratio || '1:1',
        variants: 1,
        model, quality,
        referenceImagePaths: [visual.storage_path],
        parentVisualId: visual.id,
      },
    })
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

  // ─── KI-Masken-Edit (Compositing) ──────────────────────────────────────────
  async function runMaskedAiEdit(rawPrompt) {
    if (!visual?.storage_path) { setAiError('Kein Basisbild.'); return }
    if (bgColor) { setAiError('KI-Werkzeuge brauchen ein Bild — diese Vorlage hat noch keins. Erst ein Bild im Chat erzeugen.'); return }
    if (!hasMask) { setAiError('Bitte zuerst einen Bereich markieren (Pinsel, Lasso oder Rechteck).'); return }
    if (!rawPrompt.trim()) { setAiError('Bitte beschreibe die gewünschte Änderung.'); return }
    setAiBusy(true); setAiError('')
    try {
      const prompt = `Bearbeite das Referenzbild. ${rawPrompt.trim()} Behalte Bildstil, Beleuchtung und Perspektive konsistent, fotorealistisch.`
      // 1) KI-Vollbild holen
      const aiVisual = await callGenerateImage(prompt)
      // 2) Original + KI-Bild als Elemente laden
      const origEl = bgImage || await loadImageEl(visual.storage_path)
      const aiEl = await loadImageEl(aiVisual.storage_path)
      // 3) Compositing: nur Maske aus dem KI-Bild übernehmen
      const blob = await compositeMaskedResult(origEl, aiEl)
      // 4) Komponiertes Bild über den neuen Visual-Datensatz hochladen
      const { path, error: upErr } = await uploadDesignRender(teamId, aiVisual.id, blob)
      if (upErr || !path) throw new Error(upErr?.message || 'Upload des Ergebnisses fehlgeschlagen.')
      const { data: updated } = await updateVisual(aiVisual.id, { storage_path: path })
      // 5) Als neues Basisbild übernehmen
      setAiMode(null); setAiPrompt(''); clearMask()
      onReplaceVisual && onReplaceVisual(updated || { ...aiVisual, storage_path: path })
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

  // ─── Hintergrund-Werkzeuge (volles KI-Vollbild, kein Compositing) ──────────
  async function runBackgroundReplace(mode, customPrompt) {
    if (!visual?.storage_path) { setAiError('Kein Basisbild.'); return }
    if (bgColor) { setSavedMsg('Hintergrund-KI braucht ein Bild — diese Vorlage hat noch keins.'); return }
    setBgMenuBusy(true); setSavedMsg('')
    try {
      const prompt = mode === 'white'
        ? 'Stelle das Hauptmotiv sauber frei und setze es vor einen reinen, gleichmäßig weißen Hintergrund. Das Hauptmotiv bleibt exakt unverändert (Form, Farbe, Details). Saubere Kanten, kein Schlagschatten.'
        : `Ersetze NUR den Hintergrund des Bildes durch: ${(customPrompt || '').trim()}. Das Hauptmotiv im Vordergrund bleibt exakt erhalten (Position, Form, Beleuchtung am Motiv konsistent). Realistische Integration des neuen Hintergrunds.`
      const aiVisual = await callGenerateImage(prompt)
      setAiMode(null); clearMask()
      onReplaceVisual && onReplaceVisual(aiVisual)
    } catch (e) {
      setSavedMsg('Fehler: ' + (e?.message || 'Hintergrund-Bearbeitung fehlgeschlagen'))
    } finally {
      setBgMenuBusy(false)
    }
  }

  // ─── Transparent freistellen (KI-Chroma-Key + client-seitiges Keying) ───────
  // 1) generate-image setzt Motiv vor reines Magenta (#FF00FF).
  // 2) Ergebnisbild laden → Offscreen-Canvas → ImageData.
  // 3) chromaKeyToAlpha() ersetzt Magenta durch Alpha (Soft-Edge + Despill).
  // 4) Das transparente PNG wird SOFORT & rein LOKAL als neues Basisbild gesetzt
  //    (bgImage), unabhängig von einem Eltern-Round-Trip. Persistenz erfolgt separat.
  //
  // ── Warum die Anzeige lokal sein MUSS ──────────────────────────────────────
  // Früher wurde das gekeyte Bild via onReplaceVisual an ContentStudio gereicht.
  // Das löste über DesignerPane `key={visual.id}` (neue Visual-ID) einen REMOUNT
  // aus; die neue Instanz lud dann erneut über storage_path/__dataUrl — und zeigte
  // in der Praxis wieder das rohe Magenta-Bild (Round-Trip/Caching/State-Neuaufbau
  // verlor die transiente Transparenz). Lösung: Wir setzen das gekeyte DataURL
  // direkt in den lokalen bgImage-State dieser bereits gemounteten Instanz und
  // lösen KEINEN Remount aus. Persistenz überschreibt den AKTUELLEN Visual-Datensatz
  // (visual.id bleibt → kein key-Wechsel → kein Remount), damit Rail/DB konsistent
  // werden, ohne die lokale Anzeige zu zerstören.
  async function runTransparentCutout() {
    if (!visual?.storage_path) { setSavedMsg('Kein Basisbild.'); return }
    if (bgColor) { setSavedMsg('Transparent freistellen braucht ein Bild — diese Vorlage hat noch keins.'); return }
    setBgMenuBusy(true); setSavedMsg('')
    try {
      // 1) KI-Bild mit Magenta-Hintergrund holen
      const aiVisual = await callGenerateImage(CHROMA_PROMPT)
      // 2) Ergebnis als Bild-Element laden und auf Canvas zeichnen
      const aiEl = await loadImageEl(aiVisual.storage_path)
      const w = aiEl.naturalWidth || stageSize.width
      const h = aiEl.naturalHeight || stageSize.height
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      const ctx = cv.getContext('2d')
      ctx.drawImage(aiEl, 0, 0, w, h)
      // 3) Client-seitiges Keying: Magenta → Alpha
      const imgData = ctx.getImageData(0, 0, w, h)
      chromaKeyToAlpha(imgData)
      ctx.putImageData(imgData, 0, 0)
      const keyedDataUrl = cv.toDataURL('image/png')

      // 4) ANZEIGE: das gekeyte PNG SOFORT & LOKAL als Basisbild laden.
      //    Wir warten, bis das HTMLImageElement dekodiert ist, und setzen es dann
      //    in genau den bgImage-State, aus dem die Konva-KImage-Ebene rendert.
      //    Damit ist die transparente Version unmittelbar sichtbar (Schachbrett),
      //    ohne onReplaceVisual und ohne Remount.
      await new Promise((resolve) => {
        const timg = new window.Image()
        timg.onload = () => {
          try {
            const tw = timg.naturalWidth || w
            const th = timg.naturalHeight || h
            pushHistory()
            setBgImage(timg)
            setBgColor(null)
            setBaseCrop(null)
            setStageSize({ width: tw, height: th })
            setIsTransparent(true)   // Schachbrett-Hintergrund erzwingen
            setAiMode(null); clearMask()
            resetMaskCanvas(tw, th)
          } catch (_e) { /* noop */ }
          resolve()
        }
        timg.onerror = () => resolve()
        timg.src = keyedDataUrl
      })

      // 5) PERSISTENZ (anzeige-irrelevant, ohne Remount):
      //    Transparentes PNG hochladen und den AKTUELLEN Visual-Datensatz (visual.id)
      //    auf den transparenten Pfad aktualisieren. visual.id bleibt unverändert →
      //    DesignerPane behält key={visual.id} → KEIN Remount → die oben gesetzte
      //    lokale Transparenz-Anzeige bleibt erhalten. Der frisch von generate-image
      //    erzeugte aiVisual-Datensatz (rohes Magenta) wird NICHT zum Basisbild.
      try {
        const blob = await (await fetch(keyedDataUrl)).blob()
        const { path, error: upErr } = await uploadDesignRender(teamId, visual.id, blob)
        if (!upErr && path) {
          const { data: updated } = await updateVisual(visual.id, { storage_path: path })
          // Rail/Parent leise aktualisieren — id bleibt gleich, daher kein Remount.
          // __isTransparent mitgeben, damit ein späterer (manueller) Reload das
          // Schachbrett wieder erkennt.
          const merged = { ...(updated || visual), storage_path: path, __isTransparent: true }
          onSaved && onSaved(merged)
        } else {
          setSavedMsg('Freistellen angezeigt, aber Speichern fehlgeschlagen: ' + (upErr?.message || ''))
          setTimeout(() => setSavedMsg(''), 3500)
        }
      } catch (persistErr) {
        // Anzeige ist bereits transparent; Persistenz-Fehler nur dezent melden.
        setSavedMsg('Freistellen angezeigt, aber Speichern fehlgeschlagen.')
        setTimeout(() => setSavedMsg(''), 3500)
      }
    } catch (e) {
      setSavedMsg('Fehler: ' + humanizeProviderError(e?.message || 'Freistellen fehlgeschlagen — das Bild bleibt unverändert.'))
    } finally {
      setBgMenuBusy(false)
    }
  }

  // ─── Render-Helfer für Konva-Objekte ───────────────────────────────────────
  const off = { x: baseCrop ? baseCrop.x : 0, y: baseCrop ? baseCrop.y : 0 }

  function renderObject(o) {
    const base = {
      id: o.id,
      draggable: !cropMode && !aiMode && !editingTextId,
      x: (o.x ?? 0) - off.x,
      y: (o.y ?? 0) - off.y,
      rotation: o.rotation || 0,
      onClick: () => { if (!cropMode && !aiMode) setSelectedId(o.id) },
      onTap: () => { if (!cropMode && !aiMode) setSelectedId(o.id) },
      onDragStart: () => pushHistory(),
      onDragEnd: (e) => updateObject(o.id, { x: e.target.x() + off.x, y: e.target.y() + off.y }, false),
      onTransformStart: () => pushHistory(),
      onTransformEnd: (e) => {
        const node = e.target
        const patch = { rotation: node.rotation(), x: node.x() + off.x, y: node.y() + off.y }
        if (o.type === 'text') {
          patch.width = Math.max(20, (node.width() * node.scaleX()))
          patch.fontSize = Math.max(6, (o.fontSize || 44) * node.scaleY())
          node.scaleX(1); node.scaleY(1)
        } else if (o.type === 'rect') {
          patch.width = Math.max(4, node.width() * node.scaleX())
          patch.height = Math.max(4, node.height() * node.scaleY())
          node.scaleX(1); node.scaleY(1)
        } else if (o.type === 'ellipse') {
          patch.radiusX = Math.max(2, (o.radiusX || 90) * node.scaleX())
          patch.radiusY = Math.max(2, (o.radiusY || 90) * node.scaleY())
          node.scaleX(1); node.scaleY(1)
        } else {
          patch.scaleX = node.scaleX(); patch.scaleY = node.scaleY()
        }
        updateObject(o.id, patch, false)
      },
    }
    switch (o.type) {
      case 'text':
        return <KText key={o.id} {...base} text={o.text} fontSize={o.fontSize} fontFamily={o.fontFamily}
          fill={o.fill} fontStyle={o.fontStyle || 'normal'} align={o.align || 'left'} width={o.width || 360}
          visible={editingTextId !== o.id}
          onDblClick={() => startTextEdit(o.id)} onDblTap={() => startTextEdit(o.id)} />
      case 'rect':
        return <Rect key={o.id} {...base} width={o.width} height={o.height} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth || 0} cornerRadius={o.cornerRadius || 0} />
      case 'ellipse':
        return <Ellipse key={o.id} {...base} radiusX={o.radiusX} radiusY={o.radiusY} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth || 0} />
      case 'line':
        return <Line key={o.id} {...base} points={o.points} stroke={o.stroke} strokeWidth={o.strokeWidth || 6} lineCap="round" scaleX={o.scaleX || 1} scaleY={o.scaleY || 1} />
      case 'arrow':
        return <Arrow key={o.id} {...base} points={o.points} stroke={o.stroke} fill={o.fill} strokeWidth={o.strokeWidth || 6} pointerLength={o.pointerLength || 18} pointerWidth={o.pointerWidth || 18} scaleX={o.scaleX || 1} scaleY={o.scaleY || 1} />
      case 'sticker':
        return <Path key={o.id} {...base} data={o.d} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth || 0} scaleX={o.scaleX || 1} scaleY={o.scaleY || 1} />
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

  const dispW = stageSize.width * scale
  const dispH = stageSize.height * scale
  const aiActive = !!aiMode

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Werkzeugleiste */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', flexShrink: 0 }}>
        <ToolBtn onClick={() => setShowTemplates(s => !s)} active={showTemplates} title="Vorlagen"><LayoutTemplate size={15} strokeWidth={1.9} /></ToolBtn>
        <Divider />
        <ToolBtn onClick={addText} title="Text"><Type size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={addRect} title="Rechteck"><SquareIcon size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={addEllipse} title="Kreis / Ellipse"><CircleIcon size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={addLine} title="Linie"><Minus size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={addArrow} title="Pfeil"><ArrowRight size={15} strokeWidth={1.9} /></ToolBtn>
        <StickerMenu onPick={addSticker} />
        <Divider />
        <ToolBtn onClick={() => setShowFilters(s => !s)} active={showFilters} title="Bild-Filter"><Sliders size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={() => { setCropMode(m => !m); setAiMode(null); setSelectedId(null); setCropRect(null) }} active={cropMode} title="Zuschneiden"><Crop size={15} strokeWidth={1.9} /></ToolBtn>
        <Divider />
        <ToolBtn onClick={() => { setAiMode(m => m === 'edit' ? null : 'edit'); setCropMode(false); setSelectedId(null); setAiError(''); setShowTemplates(false) }} active={aiMode === 'edit'} title="KI-Bereich bearbeiten"><Wand2 size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={() => { setAiMode(m => m === 'heal' ? null : 'heal'); setCropMode(false); setSelectedId(null); setAiError(''); setShowTemplates(false) }} active={aiMode === 'heal'} title="Objekt entfernen / Retuschieren"><Eraser size={15} strokeWidth={1.9} /></ToolBtn>
        <BackgroundMenu busy={bgMenuBusy} disabled={!!bgColor} onWhite={() => runBackgroundReplace('white')} onReplace={(txt) => runBackgroundReplace('replace', txt)} onTransparent={() => runTransparentCutout()} />
        <Divider />
        <ToolBtn onClick={undo} title="Rückgängig (Cmd/Ctrl+Z)"><Undo2 size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={redo} title="Wiederholen (Cmd/Ctrl+Shift+Z)"><Redo2 size={15} strokeWidth={1.9} /></ToolBtn>
        <div style={{ flex: 1 }} />
        {savedMsg && <span style={{ fontSize: 12, fontWeight: 600, color: savedMsg.startsWith('Fehler') || savedMsg.startsWith('Download-Fehler') ? '#b91c1c' : '#15803d' }}>{savedMsg}</span>}
        <ToolBtn onClick={handleDownloadPng} title="Als PNG herunterladen"><Download size={15} strokeWidth={1.9} /></ToolBtn>
        <button onClick={handleSave} disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: P, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          {saving ? <Loader2 size={14} className="lk-spin" /> : <Save size={14} strokeWidth={2} />}Speichern
        </button>
      </div>

      {/* Vorlagen-Panel */}
      {showTemplates && (
        <TemplatePanel onApply={applyTemplate} onClose={() => setShowTemplates(false)} />
      )}

      {/* Kontext-Leiste: Selektion / Filter / Crop / AI */}
      {selected && !cropMode && !aiActive && (
        <ContextBar selected={selected} updateObject={updateObject} reorder={reorder} deleteSelected={deleteSelected} />
      )}
      {showFilters && !aiActive && (
        <FilterBar filters={filters} setFilters={(f) => { pushHistory(); setFilters(f) }} />
      )}
      {cropMode && (
        <div style={barStyle}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Rechteck über den gewünschten Bildausschnitt ziehen.</span>
          <div style={{ flex: 1 }} />
          <SmallBtn onClick={applyCrop} primary>Zuschnitt anwenden</SmallBtn>
          <SmallBtn onClick={resetCrop}>Zurücksetzen</SmallBtn>
          <SmallBtn onClick={() => { setCropMode(false); setCropRect(null) }}>Abbrechen</SmallBtn>
        </div>
      )}

      {/* KI-Masken-Leiste */}
      {aiActive && (
        <div style={{ ...barStyle, flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: '100%' }}>
            {aiMode === 'heal'
              ? 'Markiere das zu entfernende Objekt — die Stelle wird passend zum Umfeld aufgefüllt. Nur der markierte Bereich ändert sich.'
              : 'Markiere den Bereich, der geändert werden soll, und beschreibe die Änderung. Nur der markierte Bereich wird ersetzt.'}
          </span>
          {/* Werkzeug-Auswahl */}
          <div style={{ display: 'inline-flex', gap: 4 }}>
            <ToolBtn onClick={() => setMaskTool('brush')} active={maskTool === 'brush'} title="Pinsel"><Brush size={14} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={() => setMaskTool('lasso')} active={maskTool === 'lasso'} title="Lasso"><Lasso size={14} strokeWidth={1.9} /></ToolBtn>
            <ToolBtn onClick={() => setMaskTool('rect')} active={maskTool === 'rect'} title="Rechteck"><SquareIcon size={14} strokeWidth={1.9} /></ToolBtn>
          </div>
          {maskTool === 'brush' && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              Pinsel
              <input type="range" min={10} max={300} step={2} value={brushSize} onChange={e => setBrushSize(parseInt(e.target.value, 10))} style={{ width: 90 }} />
            </label>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={feather} onChange={e => setFeather(e.target.checked)} />weiche Kante
          </label>
          <SmallBtn onClick={clearMask}>Maske leeren</SmallBtn>
          <SmallBtn onClick={invertMask}>Invertieren</SmallBtn>
          {aiMode === 'edit' && (
            <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="z.B. mach das Hemd blau / füge eine Brille hinzu"
              style={{ flex: 1, minWidth: 220, height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit' }} />
          )}
          <div style={{ flex: aiMode === 'edit' ? 0 : 1 }} />
          <SmallBtn onClick={() => aiMode === 'heal' ? runMaskedAiEdit(HEAL_PROMPT) : runMaskedAiEdit(aiPrompt)} primary disabled={aiBusy}>
            {aiBusy ? 'KI arbeitet…' : (aiMode === 'heal' ? 'Entfernen' : 'Anwenden')}
          </SmallBtn>
          <SmallBtn onClick={() => { setAiMode(null); setAiPrompt(''); setAiError(''); clearMask() }}>Abbrechen</SmallBtn>
          {aiError && <span style={{ width: '100%', fontSize: 12, color: '#b91c1c' }}>{aiError}</span>}
        </div>
      )}

      {/* Canvas-Bereich */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#EEF1F6' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <Loader2 size={16} className="lk-spin" />Bild wird geladen…
          </div>
        ) : (
          <div style={{
            position: 'relative', width: dispW, height: dispH,
            boxShadow: '0 4px 24px rgba(16,24,40,0.14)',
            // Bei transparentem Basisbild ein Schachbrett-Muster zeigen, damit die
            // Transparenz sichtbar ist; sonst weißer Grund.
            background: (isTransparent && !bgColor && CHECKER_URL)
              ? `url(${CHECKER_URL})`
              : '#fff',
            backgroundRepeat: 'repeat',
          }}>
            <Stage
              ref={stageRef}
              width={dispW}
              height={dispH}
              scaleX={scale}
              scaleY={scale}
              onMouseDown={onStageMouseDown}
              onMouseMove={onStageMouseMove}
              onMouseUp={onStageMouseUp}
              onTouchStart={onStageMouseDown}
              onTouchMove={onStageMouseMove}
              onTouchEnd={onStageMouseUp}
            >
              <Layer ref={layerRef}>
                {bgColor && (
                  <Rect id="__bgfill__" x={0} y={0} width={stageSize.width} height={stageSize.height} fill={bgColor} listening />
                )}
                {bgImage && !bgColor && (
                  <KImage
                    ref={bgNodeRef}
                    id="__bg__"
                    image={bgImage}
                    x={0}
                    y={0}
                    width={stageSize.width}
                    height={stageSize.height}
                    crop={baseCrop ? { x: baseCrop.x, y: baseCrop.y, width: baseCrop.width, height: baseCrop.height } : undefined}
                    listening
                  />
                )}
                {objects.map(renderObject)}
                {/* Crop-Overlay */}
                {cropMode && cropRect && (
                  <Rect x={cropRect.x - off.x} y={cropRect.y - off.y} width={cropRect.w} height={cropRect.h}
                    stroke={PRGB} strokeWidth={2 / scale} dash={[8 / scale, 6 / scale]} fill="rgba(49,90,231,0.12)" listening={false} />
                )}
                <Transformer ref={trRef} rotateEnabled keepRatio={false}
                  boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 8) ? oldBox : newBox} />
              </Layer>
            </Stage>

            {/* Masken-Overlay (über der Stage; fängt Pointer nur im KI-Modus) */}
            <canvas
              ref={overlayRef}
              style={{
                position: 'absolute', top: 0, left: 0, width: dispW, height: dispH,
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
                <Loader2 size={18} className="lk-spin" />KI bearbeitet den markierten Bereich…
              </div>
            )}

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
      </div>
    </div>
  )
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
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
  borderBottom: '1px solid var(--border,#E9ECF2)', background: 'var(--page-bg,#F7F8FA)', flexShrink: 0,
}

function Divider() {
  return <div style={{ width: 1, height: 22, background: 'var(--border,#E9ECF2)', margin: '0 2px' }} />
}

function ToolBtn({ children, onClick, title, active }) {
  return (
    <button onClick={onClick} title={title}
      style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
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

// ─── Hintergrund-Menü ──────────────────────────────────────────────────────────
function BackgroundMenu({ onWhite, onReplace, onTransparent, busy, disabled }) {
  const [open, setOpen] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [txt, setTxt] = useState('')
  return (
    <div style={{ position: 'relative' }}>
      <ToolBtn onClick={() => { if (disabled) return; setOpen(o => !o) }} active={open} title="Hintergrund (KI)"><ImageIcon size={15} strokeWidth={1.9} /></ToolBtn>
      {open && (
        <>
          <div onClick={() => { setOpen(false); setShowInput(false) }} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 81, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.12)', padding: 8, width: 280 }}>
            {busy && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={14} className="lk-spin" />KI arbeitet…</div>}
            {!busy && !showInput && (
              <>
                <MenuItem onClick={() => { onWhite(); setOpen(false) }}>Freistellen (weißer Hintergrund)</MenuItem>
                <MenuItem onClick={() => { onTransparent(); setOpen(false) }}>Transparent freistellen (PNG)</MenuItem>
                <MenuItem onClick={() => setShowInput(true)}>Hintergrund ersetzen…</MenuItem>
              </>
            )}
            {!busy && showInput && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea value={txt} onChange={e => setTxt(e.target.value)} placeholder="z.B. modernes Büro, unscharf, warmes Licht"
                  style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <SmallBtn onClick={() => { setShowInput(false); setTxt('') }}>Zurück</SmallBtn>
                  <SmallBtn primary disabled={!txt.trim()} onClick={() => { if (txt.trim()) { onReplace(txt.trim()); setOpen(false); setShowInput(false); setTxt('') } }}>Ersetzen</SmallBtn>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
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

// ─── Vorlagen-Panel ─────────────────────────────────────────────────────────────
function TemplatePanel({ onApply, onClose }) {
  return (
    <div style={{ ...barStyle, flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: '100%' }}>
        Start-Layout wählen — ersetzt die aktuelle Leinwand durch ein farbiges Layout mit Platzhaltern, die du füllst.
      </span>
      {DESIGN_TEMPLATES.map(t => (
        <button key={t.id} onClick={() => onApply(t)} title={t.desc}
          style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', minWidth: 140 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{t.label}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.desc}</span>
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <SmallBtn onClick={onClose}>Schließen</SmallBtn>
    </div>
  )
}

function StickerMenu({ onPick }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <ToolBtn onClick={() => setOpen(o => !o)} active={open} title="Symbole / Sticker"><StarIcon size={15} strokeWidth={1.9} /></ToolBtn>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 81, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.12)', padding: 8, display: 'flex', gap: 6 }}>
            {STICKERS.map(st => (
              <button key={st.id} onClick={() => { onPick(st); setOpen(false) }} title={st.label}
                style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 100 100">
                  <path d={st.d} fill={st.id === 'check' ? 'none' : '#FFD43B'} stroke={st.id === 'check' ? '#22c55e' : '#000'} strokeWidth={st.id === 'check' ? 10 : 0} />
                </svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ContextBar({ selected, updateObject, reorder, deleteSelected }) {
  const isText = selected.type === 'text'
  const hasFill = ['text', 'rect', 'ellipse', 'sticker'].includes(selected.type)
  const hasStroke = ['rect', 'ellipse', 'line', 'arrow', 'sticker'].includes(selected.type)
  const fontStyle = selected.fontStyle || 'normal'
  const isBold = fontStyle.includes('bold')
  const isItalic = fontStyle.includes('italic')
  function setStyleFlag(flag) {
    let parts = []
    let b = isBold, i = isItalic
    if (flag === 'bold') b = !b
    if (flag === 'italic') i = !i
    if (b) parts.push('bold'); if (i) parts.push('italic')
    updateObject(selected.id, { fontStyle: parts.join(' ') || 'normal' })
  }
  return (
    <div style={{ ...barStyle, flexWrap: 'wrap' }}>
      {isText && (
        <>
          <select value={selected.fontFamily || 'Inter'} onChange={e => updateObject(selected.id, { fontFamily: e.target.value })}
            style={selStyle}>
            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <input type="number" min={6} max={400} value={Math.round(selected.fontSize || 44)} onChange={e => updateObject(selected.id, { fontSize: parseInt(e.target.value, 10) || 44 })}
            style={{ ...selStyle, width: 64 }} title="Schriftgröße" />
          <ToolBtn onClick={() => setStyleFlag('bold')} active={isBold} title="Fett"><Bold size={14} strokeWidth={2.2} /></ToolBtn>
          <ToolBtn onClick={() => setStyleFlag('italic')} active={isItalic} title="Kursiv"><Italic size={14} strokeWidth={2.2} /></ToolBtn>
          <select value={selected.align || 'left'} onChange={e => updateObject(selected.id, { align: e.target.value })} style={selStyle} title="Ausrichtung">
            <option value="left">Links</option><option value="center">Zentriert</option><option value="right">Rechts</option>
          </select>
        </>
      )}
      {hasFill && (
        <label style={lblStyle} title="Füllfarbe">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Füllung</span>
          <input type="color" value={toHex(selected.fill)} onChange={e => updateObject(selected.id, { fill: e.target.value })} style={colorStyle} />
        </label>
      )}
      {hasStroke && (
        <>
          <label style={lblStyle} title="Randfarbe">
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rand</span>
            <input type="color" value={toHex(selected.stroke || '#ffffff')} onChange={e => updateObject(selected.id, { stroke: e.target.value })} style={colorStyle} />
          </label>
          <input type="number" min={0} max={60} value={selected.strokeWidth || 0} onChange={e => updateObject(selected.id, { strokeWidth: parseInt(e.target.value, 10) || 0 })}
            style={{ ...selStyle, width: 56 }} title="Randstärke" />
        </>
      )}
      <Divider />
      <ToolBtn onClick={() => reorder('top')} title="Nach ganz vorne (vor Motiv)"><BringToFront size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => reorder('up')} title="Eine Ebene nach vorne"><ChevronUp size={14} strokeWidth={2} /></ToolBtn>
      <ToolBtn onClick={() => reorder('down')} title="Eine Ebene nach hinten"><ChevronDown size={14} strokeWidth={2} /></ToolBtn>
      <ToolBtn onClick={() => reorder('bottom')} title="Nach ganz hinten (hinter Motiv)"><SendToBack size={14} strokeWidth={1.9} /></ToolBtn>
      <div style={{ flex: 1 }} />
      <ToolBtn onClick={deleteSelected} title="Löschen (Entf)"><Trash2 size={14} strokeWidth={1.9} /></ToolBtn>
    </div>
  )
}

function FilterBar({ filters, setFilters }) {
  const set = (k, v) => setFilters({ ...filters, [k]: v })
  return (
    <div style={{ ...barStyle, flexWrap: 'wrap', gap: 14 }}>
      <Slider label="Helligkeit" min={-0.6} max={0.6} step={0.02} value={filters.brightness} onChange={v => set('brightness', v)} />
      <Slider label="Kontrast" min={-60} max={60} step={2} value={filters.contrast} onChange={v => set('contrast', v)} />
      <Slider label="Sättigung" min={-2} max={4} step={0.1} value={filters.saturation} onChange={v => set('saturation', v)} />
      <Slider label="Weichzeichnen" min={0} max={30} step={1} value={filters.blur} onChange={v => set('blur', v)} />
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
        <input type="checkbox" checked={!!filters.grayscale} onChange={e => set('grayscale', e.target.checked ? 1 : 0)} />Graustufen
      </label>
      <SmallBtn onClick={() => setFilters({ brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: 0 })}>Filter zurücksetzen</SmallBtn>
    </div>
  )
}

function Slider({ label, min, max, step, value, onChange }) {
  return (
    <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-muted)' }}>
      {label}
      <input type="range" min={min} max={max} step={step} value={value || 0} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: 120 }} />
    </label>
  )
}

const selStyle = { height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--text-primary)', outline: 'none' }
const lblStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 }
const colorStyle = { width: 30, height: 28, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: '#fff', cursor: 'pointer' }

// rgba/named → #hex (für <input type=color>). Fallback weiß.
function toHex(c) {
  if (!c) return '#ffffff'
  if (typeof c === 'string' && c.startsWith('#')) return c.length === 7 ? c : '#ffffff'
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '')
  if (m) {
    const h = (n) => parseInt(n, 10).toString(16).padStart(2, '0')
    return '#' + h(m[1]) + h(m[2]) + h(m[3])
  }
  return '#ffffff'
}
