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
  Eraser, Image as ImageIcon, LayoutTemplate, Copy, ZoomIn, ZoomOut, Maximize2,
  Upload, Frame, Eye, EyeOff, Lock, Unlock, Layers, GripVertical, Underline,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
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

// KI-Schritt für "Transparent freistellen": Motiv vor reinem Greenscreen-Hintergrund.
// Grün ist der Standard-Chroma-Key, weil Haut-, Rot- und Pinktöne weit von Grün
// entfernt liegen und damit NICHT mitgekeyt werden (Magenta wäre für Personen/rote
// Motive schlecht). Wird anschließend client-seitig adaptiv (gesampelte Eckfarbe)
// zu Alpha gekeyt.
const CHROMA_PROMPT = 'Stelle das Hauptmotiv exakt und unverändert frei und platziere es auf einem absolut gleichmäßigen, reinen Vollflächen-Greenscreen-Hintergrund in der Farbe Chroma-Grün (Hex #00FF00, reines RGB 0,255,0). Scharfe, saubere Motivkanten. Das Motiv selbst darf KEINE grünen Flächen enthalten. Kein Schlagschatten, kein Verlauf, keine Textur im Hintergrund — nur exakt #00FF00.'

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

export default function DesignerCanvas({ visual, teamId, onSaved, onReplaceVisual }) {
  const stageRef = useRef(null)
  const layerRef = useRef(null)
  const guideLayerRef = useRef(null)              // Smart-Guides (Hilfslinien) Layer
  const trRef = useRef(null)
  const containerRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)                   // versteckter file-input (Bild-Upload)
  const activeRef = useRef(null)                       // Root des Designers (Sichtbarkeits-Guard)

  const [bgImage, setBgImage] = useState(null)        // HTMLImageElement des Basisbildes
  const [stageSize, setStageSize] = useState({ width: 600, height: 600 })
  const [scale, setScale] = useState(1)               // Auto-Anzeige-Skalierung (Bühne → Container)
  const [viewScale, setViewScale] = useState(1)       // zusätzlicher Nutzer-Zoom (1 = 100%, relativ zur Auto-Skalierung)
  const [pan, setPan] = useState({ x: 0, y: 0 })      // Pan-Versatz der Ansicht (Container-Pixel)
  const [containerW, setContainerW] = useState(700)
  const spaceDownRef = useRef(false)                  // Leertaste gedrückt → Pan-Modus
  const [spaceActive, setSpaceActive] = useState(false) // gespiegelt für Cursor/Render
  const panDragRef = useRef(null)                     // {startX,startY,panX,panY} während Pan-Drag
  const [isPanning, setIsPanning] = useState(false)

  const [objects, setObjects] = useState([])          // Overlay-Objekte (Text, Formen, Sticker, Bild)
  const [imgCache, setImgCache] = useState({})        // {src(DataURL/URL) -> HTMLImageElement} für type:'image'
  const [selectedIds, setSelectedIds] = useState([])  // Mehrfach-Auswahl (Array von Objekt-IDs)
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null  // Abwärtskompatibel (Einzel-Selektion)
  const setSelectedId = useCallback((id) => setSelectedIds(id ? [id] : []), [])
  const [editingTextId, setEditingTextId] = useState(null)
  const [marquee, setMarquee] = useState(null)        // {x,y,w,h} Rubberband in Bühnenkoordinaten
  const marqueeStartRef = useRef(null)
  const clipboardRef = useRef([])                     // kopierte Objekte (intern)
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

  // ─── Runde 2: rechte Spalte (Ebenen + Eigenschaften) ──────────────────────
  const [showRightPanel, setShowRightPanel] = useState(true)   // rechte Spalte ein/aus
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
        if (!inlineDataUrl && !visual?.storage_path) {
          if (hasDesign) {
            try {
              const w = dj.stage?.width || 1080
              const h = dj.stage?.height || 1080
              setBgImage(null)
              setBgColor(dj.bgColor || '#ffffff')
              setStageSize({ width: w, height: h })
              setBaseCrop(null)
              setObjects(Array.isArray(dj.objects) ? dj.objects : [])
              setFilters({ brightness:0, contrast:0, saturation:0, blur:0, grayscale:0, ...(dj.filters || {}) })
              setIsTransparent(false)
              resetMaskCanvas(w, h)
              historyRef.current = []; futureRef.current = []
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
            const dj2 = visual.design_json
            if (dj2 && typeof dj2 === 'object' && (Array.isArray(dj2.objects) || dj2.objects)) {
              setObjects(Array.isArray(dj2.objects) ? dj2.objects : [])
              if (dj2.filters) setFilters({ brightness:0, contrast:0, saturation:0, blur:0, grayscale:0, ...dj2.filters })
              if (dj2.baseCrop) setBaseCrop(dj2.baseCrop)
              // B3/B4: bgColor + stage (stageSize) zurücklesen. bgColor null lassen,
              // wenn ein echtes Bild vorhanden ist (Bild-Modus), sonst Farbgrund setzen.
              if (dj2.bgColor) setBgColor(dj2.bgColor)
              if (dj2.stage && dj2.stage.width && dj2.stage.height) {
                setStageSize({ width: dj2.stage.width, height: dj2.stage.height })
              }
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
  function onContainerWheel(e) {
    const el = containerRef.current
    if (!el) return
    if (e.ctrlKey || e.metaKey) {
      // Zoom zum Cursor: Container-relative Position des Cursors ermitteln.
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      // Cursor-Position relativ zur Top-Left-Ecke des Stage-Wrappers (vor Zoom).
      // Wrapper-Top-Left in Container-Pixeln = Container-Mitte − dispW/2 + pan.
      const wrapLeft = rect.width / 2 - dispW / 2 + pan.x
      const wrapTop = rect.height / 2 - dispH / 2 + pan.y
      const cx = e.clientX - rect.left - wrapLeft
      const cy = e.clientY - rect.top - wrapTop
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      zoomTo(viewScale * factor, { x: cx, y: cy })
    } else {
      // Rad allein = vertikal pan (Shift = horizontal). Verschiebt den Stage-Wrapper.
      e.preventDefault()
      if (e.shiftKey) setPan(p => ({ x: p.x - e.deltaY, y: p.y }))
      else setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }
  function onContainerMouseDown(e) {
    if (!spaceDownRef.current) return
    e.preventDefault()
    panDragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    setIsPanning(true)
  }
  function onContainerMouseMove(e) {
    if (!panDragRef.current) return
    const d = panDragRef.current
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) })
  }
  function onContainerMouseUp() {
    if (panDragRef.current) { panDragRef.current = null; setIsPanning(false) }
  }
  // Drag&Drop eines Bildes auf den Canvas → als image-Objekt einfügen.
  function onContainerDragOver(e) { e.preventDefault() }
  function onContainerDrop(e) {
    e.preventDefault()
    try {
      const file = e.dataTransfer?.files?.[0]
      if (file) onPickImageFile(file)
    } catch (_e) {}
  }

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
      if (!selectedIds.length || editingTextId || cropMode || aiMode) { tr.nodes([]); tr.getLayer()?.batchDraw(); return }
      const nodes = selectedIds.map(id => stage.findOne('#' + id)).filter(Boolean)
      tr.nodes(nodes)
      tr.getLayer()?.batchDraw()
    } catch (_e) { /* noop */ }
  }, [selectedIds, objects, editingTextId, cropMode, aiMode])

  // ─── Bild-Objekte: HTMLImageElement nachladen (z.B. nach Restore) ───────────
  useEffect(() => {
    const missing = objects.filter(o => o.type === 'image' && o.src && !imgCache[o.src])
    if (!missing.length) return
    let cancelled = false
    missing.forEach(o => {
      const img = new window.Image()
      img.onload = () => { if (!cancelled) setImgCache(prev => ({ ...prev, [o.src]: img })) }
      img.onerror = () => {}
      img.src = o.src
    })
    return () => { cancelled = true }
  }, [objects, imgCache])

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
    setFilters({ brightness:0, contrast:0, saturation:0, blur:0, grayscale:0, ...(st.filters || {}) })
    setBaseCrop(st.baseCrop || null)
    if (st.bgColor !== undefined) setBgColor(st.bgColor)
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
      if (e.key === 'Escape') { setSelectedIds([]); return }
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

  // ─── Bild-Upload als Overlay-Objekt (type:'image') ─────────────────────────
  // Dekodiert die Datei zu einer DataURL, ermittelt die natürliche Größe und legt
  // ein image-Objekt an (auf max. ~50% der Bühne skaliert). HTMLImageElement wird
  // in imgCache gehalten und beim Render an die Konva-Image-Node gereicht.
  function addImageFromDataUrl(dataUrl) {
    if (!dataUrl) return
    const img = new window.Image()
    img.onload = () => {
      const nw = img.naturalWidth || 200
      const nh = img.naturalHeight || 200
      const maxDim = Math.min(stageSize.width, stageSize.height) * 0.5
      const sc = Math.min(1, maxDim / Math.max(nw, nh))
      const w = Math.round(nw * sc), h = Math.round(nh * sc)
      const c = center()
      setImgCache(prev => ({ ...prev, [dataUrl]: img }))
      addObject({ type: 'image', src: dataUrl, x: c.x - w / 2, y: c.y - h / 2, width: w, height: h, rotation: 0, opacity: 1 })
    }
    img.onerror = () => setSavedMsg('Bild konnte nicht geladen werden.')
    img.src = dataUrl
  }
  function onPickImageFile(file) {
    if (!file) return
    if (!/^image\//.test(file.type || '')) { setSavedMsg('Bitte eine Bilddatei wählen.'); return }
    const reader = new FileReader()
    reader.onload = () => addImageFromDataUrl(String(reader.result || ''))
    reader.onerror = () => setSavedMsg('Datei konnte nicht gelesen werden.')
    reader.readAsDataURL(file)
  }
  function triggerImageUpload() { try { fileInputRef.current?.click() } catch (_e) {} }

  // ─── Format-/Größen-Preset anwenden ─────────────────────────────────────────
  function applyFormatPreset(preset) {
    if (!preset) return
    pushHistory()
    if (bgImage && !bgColor) {
      // Bei vorhandenem Bild: nur die Bühne (Zeichenfläche) ändern, Bild bleibt als
      // Hintergrund. Hinweis an den Nutzer, dass das Bild ggf. nicht passt.
      setStageSize({ width: preset.w, height: preset.h })
      setBaseCrop(null)
      setSavedMsg('Format gesetzt — Bild ggf. neu positionieren/zuschneiden.')
      setTimeout(() => setSavedMsg(''), 2500)
    } else {
      // Bild-loses / Vorlagen-Design: Bühne direkt setzen, Farbgrund sicherstellen.
      setStageSize({ width: preset.w, height: preset.h })
      setBaseCrop(null)
      if (!bgColor) setBgColor('#ffffff')
    }
    setSelectedIds([])
    resetMaskCanvas(preset.w, preset.h)
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
    return { x: pos.x / effScale + offX, y: pos.y / effScale + offY }
  }
  function onStageMouseDown(e) {
    const stage = stageRef.current
    if (!stage) return
    // Pan-Modus (Leertaste) hat Vorrang — wird auf Container-Ebene behandelt.
    if (spaceDownRef.current) return
    const p = stagePoint()
    if (!p) return
    if (cropMode) { cropDragRef.current = { x: p.x, y: p.y }; setCropRect({ x: p.x, y: p.y, w: 0, h: 0 }); return }
    // Klick auf leere Bühne → Marquee starten / Selektion lösen
    const onEmpty = e.target === stage || e.target.attrs?.id === '__bg__' || e.target.attrs?.id === '__bgfill__'
    if (onEmpty) {
      if (editingTextId) commitTextEdit()
      if (!aiMode) {
        marqueeStartRef.current = { x: p.x, y: p.y, additive: e.evt?.shiftKey }
        setMarquee({ x: p.x, y: p.y, w: 0, h: 0 })
        if (!e.evt?.shiftKey) setSelectedIds([])
      }
    }
  }
  function onStageMouseMove() {
    const p = stagePoint()
    if (!p) return
    if (cropMode && cropDragRef.current) {
      const s = cropDragRef.current
      setCropRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
      return
    }
    if (marqueeStartRef.current) {
      const s = marqueeStartRef.current
      setMarquee({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
    }
  }
  function onStageMouseUp() {
    cropDragRef.current = null
    // Marquee abschließen → alle Objekte, deren Mittelpunkt im Rechteck liegt, selektieren.
    if (marqueeStartRef.current) {
      const m = marquee
      const additive = marqueeStartRef.current.additive
      marqueeStartRef.current = null
      setMarquee(null)
      if (m && (m.w > 4 || m.h > 4)) {
        const hits = objects.filter(o => {
          const b = objBounds(o)
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2
          return cx >= m.x && cx <= m.x + m.w && cy >= m.y && cy <= m.y + m.h
        }).map(o => o.id)
        setSelectedIds(prev => additive ? Array.from(new Set([...prev, ...hits])) : hits)
      }
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
      const sw = 1 / effScale
      for (const x of vLines) {
        layer.add(new Konva.Line({ points: [x, -4 / effScale, x, ch + 4 / effScale], stroke: PRGB, strokeWidth: sw, dash: [4 / effScale, 4 / effScale], listening: false }))
      }
      for (const y of hLines) {
        layer.add(new Konva.Line({ points: [-4 / effScale, y, cw + 4 / effScale, y], stroke: PRGB, strokeWidth: sw, dash: [4 / effScale, 4 / effScale], listening: false }))
      }
      layer.batchDraw()
    } catch (_e) {}
  }
  function clearGuides() {
    const layer = guideLayerRef.current
    if (!layer) return
    try { layer.destroyChildren(); layer.batchDraw() } catch (_e) {}
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
      const sx = effScale, sy = effScale
      // getClientRect liefert in PIXELN (skaliert) → zurück auf Stage-lokal teilen.
      const bx = box.x / sx, by = box.y / sy, bw = box.width / sx, bh = box.height / sy
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
    } catch (_e) { /* Snapping darf nie crashen */ }
  }

  // ─── Render-Helfer für Konva-Objekte ───────────────────────────────────────
  const off = { x: baseCrop ? baseCrop.x : 0, y: baseCrop ? baseCrop.y : 0 }

  // Klick auf ein Objekt: Shift → zur Auswahl togglen, sonst Einzel-Auswahl.
  function selectFromClick(id, e) {
    if (cropMode || aiMode) return
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
      draggable: !locked && !cropMode && !aiMode && !editingTextId && !spaceActive,
      listening: !locked && !spaceActive,
      x: (o.x ?? 0) - off.x,
      y: (o.y ?? 0) - off.y,
      rotation: o.rotation || 0,
      opacity: o.opacity == null ? 1 : o.opacity,
      onClick: (e) => selectFromClick(o.id, e),
      onTap: (e) => selectFromClick(o.id, e),
      onDragStart: () => pushHistory(),
      // Smart-Guides: während des Ziehens snappen + Hilfslinien zeigen.
      onDragMove: (e) => {
        const node = e.target
        const ids = selectedIds.includes(o.id) && selectedIds.length > 1 ? selectedIds : [o.id]
        applyDragSnap(node, ids)
      },
      onDragEnd: (e) => {
        clearGuides()
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
          updateObject(o.id, { x: node.x() + off.x, y: node.y() + off.y }, false)
        }
      },
      onTransformStart: () => pushHistory(),
      onTransform: (e) => {
        // Smart-Guides auch beim Skalieren zeigen (Snap der Bounding-Box-Kanten).
        const node = e.target
        try {
          const { vertical, horizontal } = collectGuideLines([o.id])
          const tol = SNAP_PX / effScale
          const box = node.getClientRect({ relativeTo: node.getStage() })
          const sx = effScale
          const bx = box.x / sx, by = box.y / sx, bw = box.width / sx, bh = box.height / sx
          const objV = [bx, bx + bw / 2, bx + bw]
          const objH = [by, by + bh / 2, by + bh]
          const drawnV = [], drawnH = []
          for (const v of objV) for (const g of vertical) if (Math.abs(v - g) < tol) { drawnV.push(g); break }
          for (const h of objH) for (const g of horizontal) if (Math.abs(h - g) < tol) { drawnH.push(g); break }
          drawGuides(drawnV, drawnH)
        } catch (_e) {}
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
      case 'image': {
        const el = imgCache[o.src]
        if (!el) return null   // wird nachgeladen (Effekt), dann re-render
        return <KImage key={o.id} {...base} image={el} width={o.width} height={o.height} />
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

  return (
    <div ref={activeRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Versteckter file-input für Bild-Upload */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; onPickImageFile(f); e.target.value = '' }} />
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
        <ToolBtn onClick={triggerImageUpload} title="Eigenes Bild einfügen (Logo, Foto)"><Upload size={15} strokeWidth={1.9} /></ToolBtn>
        <FormatMenu onPick={applyFormatPreset} />
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
        <ContextBar selected={selected} updateObject={updateObject}
          commitHistoryOnce={commitHistoryOnce} endInteraction={endInteraction}
          reorder={reorder} deleteSelected={deleteSelected} />
      )}
      {selectedIds.length > 1 && !cropMode && !aiActive && (
        <MultiBar count={selectedIds.length} onDuplicate={duplicateSelected} onDelete={deleteSelected}
          updateOpacity={(v) => { const ids = new Set(selectedIds); setObjects(prev => prev.map(o => ids.has(o.id) ? { ...o, opacity: v } : o)) }}
          commitHistoryOnce={commitHistoryOnce} endInteraction={endInteraction} />
      )}
      {showFilters && !aiActive && (
        <FilterBar filters={filters} setFilters={setFilters}
          commitHistoryOnce={commitHistoryOnce} endInteraction={endInteraction} />
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

      {/* Arbeitsbereich: Canvas (links) + rechte Spalte (Ebenen/Eigenschaften) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
      {/* Canvas-Bereich */}
      <div
        ref={containerRef}
        onWheel={onContainerWheel}
        onMouseDown={onContainerMouseDown}
        onMouseMove={onContainerMouseMove}
        onMouseUp={onContainerMouseUp}
        onMouseLeave={onContainerMouseUp}
        onDragOver={onContainerDragOver}
        onDrop={onContainerDrop}
        style={{
          flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#EEF1F6',
          cursor: spaceActive ? (isPanning ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <Loader2 size={16} className="lk-spin" />Bild wird geladen…
          </div>
        ) : (
          <div style={{
            position: 'relative', width: dispW, height: dispH,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
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
              scaleX={effScale}
              scaleY={effScale}
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
                    stroke={PRGB} strokeWidth={2 / effScale} dash={[8 / effScale, 6 / effScale]} fill="rgba(49,90,231,0.12)" listening={false} />
                )}
                {/* Marquee (Rubberband) */}
                {marquee && (marquee.w > 1 || marquee.h > 1) && (
                  <Rect x={marquee.x - off.x} y={marquee.y - off.y} width={marquee.w} height={marquee.h}
                    stroke={PRGB} strokeWidth={1 / effScale} dash={[6 / effScale, 4 / effScale]} fill="rgba(49,90,231,0.10)" listening={false} />
                )}
                <Transformer ref={trRef} rotateEnabled keepRatio={false}
                  rotationSnaps={[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345]}
                  rotationSnapTolerance={7}
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

        {/* Zoom-Steuerung (unten rechts) */}
        {!loading && (
          <div style={{
            position: 'absolute', right: 14, bottom: 14, zIndex: 70,
            display: 'inline-flex', alignItems: 'center', gap: 2, padding: 4,
            background: 'var(--surface,#fff)', border: '1px solid var(--border,#E9ECF2)',
            borderRadius: 10, boxShadow: '0 4px 16px rgba(16,24,40,0.12)',
          }}>
            <ToolBtn onClick={zoomOut} title="Verkleinern"><ZoomOut size={15} strokeWidth={1.9} /></ToolBtn>
            <button onClick={zoom100} title="100 %"
              style={{ minWidth: 52, height: 32, padding: '0 6px', borderRadius: 8, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {zoomPct}%
            </button>
            <ToolBtn onClick={zoomIn} title="Vergrößern"><ZoomIn size={15} strokeWidth={1.9} /></ToolBtn>
            <Divider />
            <ToolBtn onClick={zoomFit} title="Einpassen"><Maximize2 size={15} strokeWidth={1.9} /></ToolBtn>
          </div>
        )}

        {/* Ein-/Ausklappen der rechten Spalte */}
        {!loading && !showRightPanel && (
          <button onClick={() => setShowRightPanel(true)} title="Ebenen & Eigenschaften"
            style={{ position: 'absolute', right: 14, top: 14, zIndex: 70, width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', color: 'var(--text-muted,#475467)', cursor: 'pointer', boxShadow: '0 4px 16px rgba(16,24,40,0.12)' }}>
            <Layers size={16} strokeWidth={1.9} />
          </button>
        )}
      </div>

      {/* Rechte Spalte: Eigenschaften (oben) + Ebenen (darunter) */}
      {!loading && showRightPanel && (
        <RightPanel
          objects={objects}
          selectedIds={selectedIds}
          selected={selected}
          stageSize={stageSize}
          baseCrop={baseCrop}
          bgColor={bgColor}
          setSelectedIds={setSelectedIds}
          updateObject={updateObject}
          commitHistoryOnce={commitHistoryOnce}
          endInteraction={endInteraction}
          reorderObjects={reorderObjects}
          toggleLayerFlag={toggleLayerFlag}
          renameLayer={renameLayer}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          layerDragRef={layerDragRef}
          layerDragOverId={layerDragOverId}
          setLayerDragOverId={setLayerDragOverId}
          alignObjects={alignObjects}
          distributeObjects={distributeObjects}
          onClose={() => setShowRightPanel(false)}
        />
      )}
      </div>
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
function RpSection({ title, children }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}
function RpNum({ label, value, onChange, onCommit, step = 1, min, max }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
      <input type="number" value={Math.round((Number(value) || 0) * 100) / 100} step={step} min={min} max={max}
        onMouseDown={onCommit} onFocus={onCommit}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', padding: '5px 7px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
    </label>
  )
}
function RpColor({ label, value, onChange, onCommit }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: 'var(--text-primary)' }}>
      <span>{label}</span>
      <input type="color" value={toHexColor(value)} onMouseDown={onCommit} onChange={e => onChange(e.target.value)}
        style={{ width: 30, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer' }} />
    </label>
  )
}
function toHexColor(c) {
  if (typeof c !== 'string') return '#000000'
  if (c.startsWith('#')) return c.length === 7 ? c : '#000000'
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const [r, g, b] = m[1].split(',').map(s => parseInt(s.trim(), 10))
    if ([r, g, b].every(n => !isNaN(n))) return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
  }
  return '#000000'
}
function AlignBtn({ Icon, title, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
      <Icon size={15} strokeWidth={1.9} />
    </button>
  )
}

function RightPanel({
  objects, selectedIds, selected, stageSize, baseCrop, bgColor,
  setSelectedIds, updateObject, commitHistoryOnce, endInteraction,
  reorderObjects, toggleLayerFlag, renameLayer, renamingId, setRenamingId,
  layerDragRef, layerDragOverId, setLayerDragOverId, alignObjects, distributeObjects, onClose,
}) {
  const P = 'var(--wl-primary, rgb(49,90,231))'
  const multi = (selectedIds || []).length > 1
  const o = selected
  const commit = () => { try { commitHistoryOnce && commitHistoryOnce() } catch (_e) {} }
  const set = (patch) => { commit(); updateObject(o.id, patch, false) }
  const layers = [...(objects || [])].reverse()  // oberste Ebene oben

  return (
    <div style={{ width: 248, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--surface, #fff)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>Design</span>
        <button onClick={onClose} title="Panel schließen" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={16} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Ausrichten / Verteilen */}
        {(selectedIds || []).length >= 1 && (
          <RpSection title="Ausrichten">
            <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
              <AlignBtn Icon={AlignStartVertical} title="Links" onClick={() => alignObjects('left')} />
              <AlignBtn Icon={AlignCenterVertical} title="Horizontal zentrieren" onClick={() => alignObjects('hcenter')} />
              <AlignBtn Icon={AlignEndVertical} title="Rechts" onClick={() => alignObjects('right')} />
              <AlignBtn Icon={AlignStartHorizontal} title="Oben" onClick={() => alignObjects('top')} />
              <AlignBtn Icon={AlignCenterHorizontal} title="Vertikal zentrieren" onClick={() => alignObjects('vcenter')} />
              <AlignBtn Icon={AlignEndHorizontal} title="Unten" onClick={() => alignObjects('bottom')} />
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <AlignBtn Icon={AlignHorizontalDistributeCenter} title="Horizontal verteilen (≥3)" onClick={() => distributeObjects('h')} disabled={(selectedIds || []).length < 3} />
              <AlignBtn Icon={AlignVerticalDistributeCenter} title="Vertikal verteilen (≥3)" onClick={() => distributeObjects('v')} disabled={(selectedIds || []).length < 3} />
            </div>
          </RpSection>
        )}

        {/* Eigenschaften (genau 1 Objekt) */}
        {o && !multi && (
          <RpSection title="Eigenschaften">
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <RpNum label="X" value={o.x} onCommit={commit} onChange={v => set({ x: v })} />
              <RpNum label="Y" value={o.y} onCommit={commit} onChange={v => set({ y: v })} />
            </div>
            {(o.type === 'rect' || o.type === 'image') && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <RpNum label="Breite" value={o.width} min={1} onCommit={commit} onChange={v => set({ width: Math.max(1, v) })} />
                <RpNum label="Höhe" value={o.height} min={1} onCommit={commit} onChange={v => set({ height: Math.max(1, v) })} />
              </div>
            )}
            {o.type === 'ellipse' && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <RpNum label="Radius X" value={o.radiusX} min={1} onCommit={commit} onChange={v => set({ radiusX: Math.max(1, v) })} />
                <RpNum label="Radius Y" value={o.radiusY} min={1} onCommit={commit} onChange={v => set({ radiusY: Math.max(1, v) })} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <RpNum label="Drehung°" value={o.rotation} onCommit={commit} onChange={v => set({ rotation: v })} />
              {o.type === 'text' && <RpNum label="Größe" value={o.fontSize} min={4} onCommit={commit} onChange={v => set({ fontSize: Math.max(4, v) })} />}
            </div>
            {/* Deckkraft */}
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Deckkraft {Math.round((o.opacity == null ? 1 : o.opacity) * 100)}%</span>
              <input type="range" min={0} max={1} step={0.01} value={o.opacity == null ? 1 : o.opacity}
                onMouseDown={commit} onChange={e => set({ opacity: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: P }} />
            </label>
            {/* Farben */}
            {('fill' in o) && <div style={{ marginBottom: 7 }}><RpColor label="Füllung" value={o.fill} onCommit={commit} onChange={v => set({ fill: v })} /></div>}
            {(o.type === 'rect' || o.type === 'ellipse' || o.type === 'line' || o.type === 'arrow') && (
              <>
                <div style={{ marginBottom: 7 }}><RpColor label="Rand" value={o.stroke || '#ffffff'} onCommit={commit} onChange={v => set({ stroke: v })} /></div>
                <div style={{ marginBottom: 8 }}><RpNum label="Randstärke" value={o.strokeWidth || 0} min={0} onCommit={commit} onChange={v => set({ strokeWidth: Math.max(0, v) })} /></div>
              </>
            )}
            {o.type === 'rect' && <div style={{ marginBottom: 8 }}><RpNum label="Eckenradius" value={o.cornerRadius || 0} min={0} onCommit={commit} onChange={v => set({ cornerRadius: Math.max(0, v) })} /></div>}
            {/* Text-Feinheiten */}
            {o.type === 'text' && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <RpNum label="Zeilenhöhe" value={o.lineHeight || 1.2} step={0.05} min={0.5} onCommit={commit} onChange={v => set({ lineHeight: v })} />
                  <RpNum label="Laufweite" value={o.letterSpacing || 0} step={0.5} onCommit={commit} onChange={v => set({ letterSpacing: v })} />
                </div>
                <button onClick={() => set({ textDecoration: o.textDecoration === 'underline' ? '' : 'underline' })}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: o.textDecoration === 'underline' ? P : '#fff', color: o.textDecoration === 'underline' ? '#fff' : 'var(--text-primary)', cursor: 'pointer', fontSize: 12, marginBottom: 8 }}>
                  <Underline size={14} /> Unterstrichen
                </button>
              </>
            )}
            {/* Schatten */}
            <button onClick={() => set(o.shadowBlur ? { shadowBlur: 0 } : { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.35)', shadowOffsetX: 0, shadowOffsetY: 4 })}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: o.shadowBlur ? P : '#fff', color: o.shadowBlur ? '#fff' : 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
              Schatten {o.shadowBlur ? 'an' : 'aus'}
            </button>
          </RpSection>
        )}
        {multi && (
          <RpSection title="Auswahl">
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedIds.length} Objekte ausgewählt. Ausrichten/Verteilen oben.</div>
          </RpSection>
        )}

        {/* Ebenen */}
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Layers size={12} /> Ebenen</div>
          {layers.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Noch keine Objekte. Füge Text, Formen oder Bilder hinzu.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 7, cursor: 'pointer',
                    background: isSel ? 'color-mix(in srgb, var(--wl-primary, rgb(49,90,231)) 12%, transparent)' : 'transparent',
                    border: dragOver ? `1px dashed ${P}` : '1px solid transparent', opacity: layer.hidden ? 0.5 : 1 }}>
                  <GripVertical size={13} color="var(--text-muted)" style={{ cursor: 'grab', flexShrink: 0 }} />
                  <Icon size={13} color={isSel ? P : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
                  {renamingId === layer.id ? (
                    <input autoFocus defaultValue={rpLabel(layer)}
                      onBlur={(e) => renameLayer(layer.id, e.target.value.trim() || rpLabel(layer))}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setRenamingId(null) } }}
                      onClick={e => e.stopPropagation()}
                      style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '2px 5px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'inherit', outline: 'none' }} />
                  ) : (
                    <span onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(layer.id) }}
                      style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rpLabel(layer)}</span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); toggleLayerFlag(layer.id, 'hidden') }} title={layer.hidden ? 'Einblenden' : 'Ausblenden'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1 }}>
                    {layer.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); toggleLayerFlag(layer.id, 'locked') }} title={layer.locked ? 'Entsperren' : 'Sperren'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: layer.locked ? P : 'var(--text-muted)', display: 'flex', padding: 1 }}>
                    {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
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

function ContextBar({ selected, updateObject, reorder, deleteSelected, commitHistoryOnce, endInteraction }) {
  const isText = selected.type === 'text'
  const hasFill = ['text', 'rect', 'ellipse', 'sticker'].includes(selected.type)
  const hasStroke = ['rect', 'ellipse', 'line', 'arrow', 'sticker'].includes(selected.type)
  const fontStyle = selected.fontStyle || 'normal'
  const isBold = fontStyle.includes('bold')
  const isItalic = fontStyle.includes('italic')
  // B6: diskrete Aktion → 1 History-Eintrag, dann ohne weiteres pushHistory anwenden.
  const setOnce = (patch) => { commitHistoryOnce(); updateObject(selected.id, patch, false); endInteraction() }
  // B6: kontinuierliche Eingabe (Slider/Color/Number) → History EINMAL beim Start
  // (onMouseDown/onFocus), während des Ziehens NUR updateObject(false).
  const startEdit = () => commitHistoryOnce()
  const liveEdit = (patch) => updateObject(selected.id, patch, false)
  const opacityPct = Math.round((selected.opacity == null ? 1 : selected.opacity) * 100)
  function setStyleFlag(flag) {
    let parts = []
    let b = isBold, i = isItalic
    if (flag === 'bold') b = !b
    if (flag === 'italic') i = !i
    if (b) parts.push('bold'); if (i) parts.push('italic')
    setOnce({ fontStyle: parts.join(' ') || 'normal' })
  }
  return (
    <div style={{ ...barStyle, flexWrap: 'wrap' }}>
      {isText && (
        <>
          <select value={selected.fontFamily || 'Inter'} onChange={e => setOnce({ fontFamily: e.target.value })}
            style={selStyle}>
            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <input type="number" min={6} max={400} value={Math.round(selected.fontSize || 44)}
            onFocus={startEdit} onMouseDown={startEdit} onBlur={endInteraction}
            onChange={e => liveEdit({ fontSize: parseInt(e.target.value, 10) || 44 })}
            style={{ ...selStyle, width: 64 }} title="Schriftgröße" />
          <ToolBtn onClick={() => setStyleFlag('bold')} active={isBold} title="Fett"><Bold size={14} strokeWidth={2.2} /></ToolBtn>
          <ToolBtn onClick={() => setStyleFlag('italic')} active={isItalic} title="Kursiv"><Italic size={14} strokeWidth={2.2} /></ToolBtn>
          <select value={selected.align || 'left'} onChange={e => setOnce({ align: e.target.value })} style={selStyle} title="Ausrichtung">
            <option value="left">Links</option><option value="center">Zentriert</option><option value="right">Rechts</option>
          </select>
        </>
      )}
      {hasFill && (
        <label style={lblStyle} title="Füllfarbe">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Füllung</span>
          <input type="color" value={toHex(selected.fill)} onMouseDown={startEdit} onFocus={startEdit}
            onChange={e => liveEdit({ fill: e.target.value })} onBlur={endInteraction} style={colorStyle} />
        </label>
      )}
      {hasStroke && (
        <>
          <label style={lblStyle} title="Randfarbe">
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rand</span>
            <input type="color" value={toHex(selected.stroke || '#ffffff')} onMouseDown={startEdit} onFocus={startEdit}
              onChange={e => liveEdit({ stroke: e.target.value })} onBlur={endInteraction} style={colorStyle} />
          </label>
          <input type="number" min={0} max={60} value={selected.strokeWidth || 0}
            onFocus={startEdit} onMouseDown={startEdit} onBlur={endInteraction}
            onChange={e => liveEdit({ strokeWidth: parseInt(e.target.value, 10) || 0 })}
            style={{ ...selStyle, width: 56 }} title="Randstärke" />
        </>
      )}
      {/* Deckkraft (alle Objekt-Typen) */}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }} title="Deckkraft">
        Deckkraft
        <input type="range" min={0} max={100} step={1} value={opacityPct}
          onMouseDown={startEdit} onChange={e => liveEdit({ opacity: (parseInt(e.target.value, 10) || 0) / 100 })} style={{ width: 90 }} />
        <span style={{ width: 30, textAlign: 'right' }}>{opacityPct}%</span>
      </label>
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

// Leiste bei Mehrfach-Auswahl: gemeinsame Aktionen (Duplizieren, Deckkraft, Löschen).
function MultiBar({ count, onDuplicate, onDelete, updateOpacity, commitHistoryOnce, endInteraction }) {
  return (
    <div style={{ ...barStyle, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{count} Objekte ausgewählt</span>
      <Divider />
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }} title="Deckkraft (alle)">
        Deckkraft
        <input type="range" min={0} max={100} step={1} defaultValue={100}
          onMouseDown={commitHistoryOnce} onChange={e => updateOpacity((parseInt(e.target.value, 10) || 0) / 100)}
          onMouseUp={endInteraction} style={{ width: 110 }} />
      </label>
      <Divider />
      <SmallBtn onClick={onDuplicate}>Duplizieren</SmallBtn>
      <div style={{ flex: 1 }} />
      <ToolBtn onClick={onDelete} title="Auswahl löschen (Entf)"><Trash2 size={14} strokeWidth={1.9} /></ToolBtn>
    </div>
  )
}

// Format-/Größen-Preset-Menü
function FormatMenu({ onPick }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <ToolBtn onClick={() => setOpen(o => !o)} active={open} title="Format / Größe"><Frame size={15} strokeWidth={1.9} /></ToolBtn>
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

function FilterBar({ filters, setFilters, commitHistoryOnce, endInteraction }) {
  // B6: pushHistory EINMAL beim Start des Slider-Zugs (onMouseDown), danach nur setFilters.
  const set = (k, v) => setFilters({ ...filters, [k]: v })
  return (
    <div style={{ ...barStyle, flexWrap: 'wrap', gap: 14 }}>
      <Slider label="Helligkeit" min={-0.6} max={0.6} step={0.02} value={filters.brightness} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('brightness', v)} />
      <Slider label="Kontrast" min={-60} max={60} step={2} value={filters.contrast} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('contrast', v)} />
      <Slider label="Sättigung" min={-2} max={4} step={0.1} value={filters.saturation} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('saturation', v)} />
      <Slider label="Weichzeichnen" min={0} max={30} step={1} value={filters.blur} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('blur', v)} />
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
        <input type="checkbox" checked={!!filters.grayscale} onChange={e => { commitHistoryOnce(); set('grayscale', e.target.checked ? 1 : 0); endInteraction() }} />Graustufen
      </label>
      <SmallBtn onClick={() => { commitHistoryOnce(); setFilters({ brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: 0 }); endInteraction() }}>Filter zurücksetzen</SmallBtn>
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
