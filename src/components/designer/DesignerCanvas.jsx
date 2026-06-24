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
import { DESIGN_ASSETS, ASSET_CATEGORIES } from '../../lib/designAssets'
import { useBrandVoice } from '../../context/BrandVoiceContext'
import { listBrandFonts, loadBrandFonts } from '../../lib/brandFonts'
import { searchIcons, searchGraphics, iconSvgUrl, iconToDataUrl, searchPhotos, photoToDataUrl } from '../../lib/stockMedia'
import {
  Palette, Sparkles, Plus as PlusIcon, Image as ImagePlus,
} from 'lucide-react'

const P = 'var(--wl-primary, rgb(49,90,231))'
const PRGB = 'rgb(49,90,231)'

// Gängige Web-Fonts (inkl. der bereits genutzten Inter/Georgia/Caveat).
const FONTS = [
  'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
  'Courier New', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Caveat',
  'Impact', 'Palatino', 'Garamond', 'Lucida Sans', 'Comic Sans MS', 'Brush Script MT',
]

// ─── Text-Effekte (Stage 3) → Konva-Schatten/Stroke-Props ───────────────────
// effect: 'none' | 'shadow' | 'glow' | 'lift' | 'neon'
const TEXT_EFFECTS = [
  { id: 'none',   label: 'Kein Effekt' },
  { id: 'shadow', label: 'Schatten' },
  { id: 'lift',   label: 'Lift' },
  { id: 'glow',   label: 'Glühen' },
  { id: 'neon',   label: 'Neon' },
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
  return { shadowBlur: 0, shadowOpacity: 0 }
}

const HEAL_PROMPT = 'Entferne den Inhalt im markierten Bereich vollständig und fülle ihn natürlich und nahtlos passend zum Umfeld auf. Keine Artefakte, keine Kanten, fotorealistisch und stilistisch konsistent mit dem Rest des Bildes.'


let _uid = 0
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

export default function DesignerCanvas({ visual, teamId, onSaved, onReplaceVisual }) {
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

  // Bild-Filter (auf Bild-Objekt[e])
  const [filters, setFilters] = useState({ brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: 0 })

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

  const [showExport, setShowExport] = useState(false)
  const [exporting, setExporting] = useState(false)

  // ─── Rechtsklick-Kontextmenü ───────────────────────────────────────────────
  // { x, y, objId|null } in Container-Pixeln (relativ zur Canvas-Fläche).
  const [ctxMenu, setCtxMenu] = useState(null)

  // ─── Canva-Stil: linke Werkzeug-Schiene + Panel ────────────────────────────
  // activeTool: null | 'templates' | 'elements' | 'text' | 'uploads' | 'brand' | 'ai' | 'filter'
  const [activeTool, setActiveTool] = useState(null)
  const [elementTab, setElementTab] = useState('shapes')   // shapes | icons | graphics | images
  const [uploadThumbs, setUploadThumbs] = useState([])     // diese Sitzung hochgeladene DataURLs
  const [aiCommand, setAiCommand] = useState('')           // freier KI-Befehl (mask-free)
  // Brand-Identität (Logos/Farben/Fonts) der aktiven Company Brand
  const [brandData, setBrandData] = useState(null)         // { palette, logos:[{path,url}], fonts:[{family,...}] }
  const [brandFontFamilies, setBrandFontFamilies] = useState([])
  const [brandLoading, setBrandLoading] = useState(false)

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
              setObjects(objs)
              if (dj2.filters) setFilters({ brightness:0, contrast:0, saturation:0, blur:0, grayscale:0, ...dj2.filters })
              if (dj2.baseCrop) setBaseCrop(dj2.baseCrop)
              setBgColor(dj2.bgColor || '#ffffff')
              setStageSize({ width: stW, height: stH })
              restored = true
            }
          } catch (_e) { /* fallback: frisches Whiteboard */ }
          if (!restored) {
            // FRISCHER Import: weiße Artboard in Bildgröße + Bild als primäres Objekt.
            const pid = nextId()
            primaryImageIdRef.current = pid
            setImgCache(prev => ({ ...prev, [dataUrl]: img }))
            setObjects([{ id: pid, type: 'image', __primary: true, src: dataUrl,
              x: 0, y: 0, width: w, height: h, rotation: 0, opacity: 1 }])
            setBgColor('#ffffff')
            setStageSize({ width: w, height: h })
            setFilters({ brightness:0, contrast:0, saturation:0, blur:0, grayscale:0 })
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
          if (filters.saturation || filters.grayscale) active.push(Konva.Filters.HSL)
          if (filters.grayscale) active.push(Konva.Filters.Grayscale)
          if (filters.blur) active.push(Konva.Filters.Blur)
          node.filters(active)
          node.brightness(filters.brightness || 0)
          node.contrast(filters.contrast || 0)
          node.saturation(filters.saturation || 0)
          node.blurRadius(filters.blur || 0)
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
        const tgtId = e.target && e.target.attrs ? e.target.attrs.id : null
        const onEmpty = e.target === stage || tgtId === '__bg__' || tgtId === '__bgfill__' || !tgtId
        if (onEmpty) {
          setCtxMenu({ x, y, objId: null })
        } else {
          const obj = objects.find(o => o.id === tgtId)
          if (!obj) { setCtxMenu({ x, y, objId: null }); return }
          // Objekt auswählen, falls nicht bereits Teil der Selektion.
          setSelectedIds(prev => prev.includes(tgtId) ? prev : [tgtId])
          setCtxMenu({ x, y, objId: tgtId })
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

  // ─── Aktives Bild-Objekt für KI / Filter / Crop ─────────────────────────────
  // Ein ausgewähltes Bild-Objekt hat Vorrang, sonst das primäre (importierte) Bild.
  const activeImageObj = useCallback(() => {
    if (selected && selected.type === 'image') return selected
    const pid = primaryImageIdRef.current
    if (pid) { const p = objects.find(o => o.id === pid); if (p) return p }
    return objects.find(o => o.type === 'image') || null
  }, [selected, objects])

  // ─── Brand-Identität laden (Farben, Logos, Schriften) ──────────────────────
  useEffect(() => {
    let cancelled = false
    const bvId = activeBrandVoice?.id
    if (!bvId) { setBrandData(null); setBrandFontFamilies([]); return }
    setBrandLoading(true)
    ;(async () => {
      try {
        const { data: row } = await supabase
          .from('brand_voices')
          .select('logo_paths, ci_image_paths, font_assets, visual_color_palette')
          .eq('id', bvId).maybeSingle()
        if (cancelled) return
        const palette = Array.isArray(row?.visual_color_palette) ? row.visual_color_palette
          : (Array.isArray(activeBrandVoice?.visual_color_palette) ? activeBrandVoice.visual_color_palette : [])
        const logoPaths = Array.isArray(row?.logo_paths) ? row.logo_paths : []
        // Logos liegen im 'visuals'-Bucket (signierte URLs, wie in Media.jsx).
        const logos = []
        for (const p of logoPaths) {
          try {
            const { data: s } = await supabase.storage.from('visuals').createSignedUrl(p, 60 * 60 * 24)
            if (s?.signedUrl) logos.push({ path: p, url: s.signedUrl })
          } catch (_e) {}
        }
        const fonts = Array.isArray(row?.font_assets) ? row.font_assets : []
        let families = []
        try { families = await loadBrandFonts(fonts) } catch (_e) {}
        if (cancelled) return
        setBrandData({ palette, logos, fonts })
        setBrandFontFamilies(families || [])
      } catch (_e) {
        if (!cancelled) { setBrandData(null); setBrandFontFamilies([]) }
      } finally {
        if (!cancelled) setBrandLoading(false)
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandVoice?.id])

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
  // Asset aus der Asset-Bibliothek einfügen: gefüllte Silhouette in Primary-Farbe.
  function addAsset(asset) {
    const c = center()
    const target = Math.min(stageSize.width, stageSize.height) * 0.25
    const sc = target / 100
    addObject({ type: 'sticker', d: asset.d, x: c.x - (50 * sc), y: c.y - (50 * sc), scaleX: sc, scaleY: sc,
      fill: PRGB, stroke: '#000000', strokeWidth: 0, rotation: 0 })
  }

  // Vorgefertigtes Text-Objekt einfügen (Textstil-Preset: Überschrift/Unterüberschrift/Fließtext).
  // Wenn ein Text-Objekt ausgewählt ist, wird stattdessen dessen Stil angepasst (kein Neueinfügen).
  function addTextPreset(preset) {
    const styles = {
      heading:   { text: 'Überschrift', fontSize: 88, fontStyle: 'bold' },
      subheading:{ text: 'Unterüberschrift', fontSize: 52, fontStyle: 'bold' },
      body:      { text: 'Fließtext — hier deinen Inhalt schreiben.', fontSize: 34, fontStyle: 'normal' },
    }
    const cfg = styles[preset] || styles.body
    // Ausgewähltes Text-Objekt vorhanden? → nur Stil setzen.
    if (selectedIds.length === 1) {
      const sel = objects.find(o => o.id === selectedIds[0])
      if (sel && sel.type === 'text') {
        commitHistoryOnce()
        updateObject(sel.id, { fontSize: cfg.fontSize, fontStyle: cfg.fontStyle }, false)
        endInteraction()
        return
      }
    }
    const c = center()
    addObject({ type: 'text', x: c.x - 240, y: c.y - cfg.fontSize / 2, text: cfg.text,
      fontSize: cfg.fontSize, fontFamily: 'Inter', fill: bgColor ? '#111827' : '#ffffff',
      fontStyle: cfg.fontStyle, align: 'left', width: 480, rotation: 0 })
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
      if (aiUrl) await writeResultToActiveImage(aiUrl)
      setAiCommand('')
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
    setActiveTool(null)
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

  // WHITEBOARD: Crop schneidet das AKTIVE Bild-Objekt zu. Das Crop-Rechteck wird in
  // Bühnenkoordinaten gezogen; wir rechnen es relativ zum Bild-Objekt in dessen
  // Bildpixel um und setzen Konva-crop-Felder + neue Position/Größe auf dem Objekt.
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
  async function renderBlobOpts({ pixelRatio = 2, mimeType = 'image/png', quality = 0.92 } = {}) {
    const stage = stageRef.current
    if (!stage) throw new Error('Stage nicht bereit')
    const tr = trRef.current
    const hadNodes = tr ? tr.nodes() : []
    try { if (tr) { tr.nodes([]); tr.getLayer()?.batchDraw() } } catch (_e) {}
    let dataUrl
    try {
      try { stage.getLayers().forEach(l => l.batchDraw()) } catch (_e) {}
      // Die Stage hat exakt Artboard-Größe (dispW×dispH); ihr Canvas clippt bereits
      // alles ausserhalb der Artboard. Daher kein zusätzliches Crop nötig.
      const opts = { pixelRatio, mimeType }
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

  // ─── KI-Masken-Edit (Compositing) ──────────────────────────────────────────
  async function runMaskedAiEdit(rawPrompt) {
    if (!visual?.storage_path) { setAiError('Kein Basisbild.'); return }
    if (!activeImageObj()) { setAiError('KI-Werkzeuge brauchen ein Bild im Design — füge erst ein Bild hinzu.'); return }
    if (!hasMask) { setAiError('Bitte zuerst einen Bereich markieren (Pinsel, Lasso oder Rechteck).'); return }
    if (!rawPrompt.trim()) { setAiError('Bitte beschreibe die gewünschte Änderung.'); return }
    setAiBusy(true); setAiError('')
    try {
      const prompt = `Bearbeite das Referenzbild. ${rawPrompt.trim()} Behalte Bildstil, Beleuchtung und Perspektive konsistent, fotorealistisch.`
      // 1) KI-Vollbild holen
      const aiVisual = await callGenerateImage(prompt)
      // 2) Original (aktives Bild-Objekt) + KI-Bild als Elemente laden
      const target = activeImageObj()
      const origEl = (target?.src && imgCache[target.src]) || bgImage || await loadImageEl(visual.storage_path)
      const aiEl = await loadImageEl(aiVisual.storage_path)
      // 3) Compositing: nur Maske aus dem KI-Bild übernehmen
      const blob = await compositeMaskedResult(origEl, aiEl)
      // 4) Ergebnis als DataURL ins aktive Bild-Objekt zurückschreiben (kein Remount)
      const resultUrl = await blobToDataUrl(blob)
      setAiMode(null); setAiPrompt(''); clearMask()
      await writeResultToActiveImage(resultUrl)
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
    if (!activeImageObj()) { setSavedMsg('Hintergrund-KI braucht ein Bild im Design.'); return }
    setBgMenuBusy(true); setSavedMsg('')
    try {
      const prompt = mode === 'white'
        ? 'Stelle das Hauptmotiv sauber frei und setze es vor einen reinen, gleichmäßig weißen Hintergrund. Das Hauptmotiv bleibt exakt unverändert (Form, Farbe, Details). Saubere Kanten, kein Schlagschatten.'
        : `Ersetze NUR den Hintergrund des Bildes durch: ${(customPrompt || '').trim()}. Das Hauptmotiv im Vordergrund bleibt exakt erhalten (Position, Form, Beleuchtung am Motiv konsistent). Realistische Integration des neuen Hintergrunds.`
      const aiVisual = await callGenerateImage(prompt)
      const aiUrl = await visualDataUrl(aiVisual.storage_path)
      setAiMode(null); clearMask()
      if (aiUrl) await writeResultToActiveImage(aiUrl)
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
      case 'text': {
        // Effekt-Props (Schatten/Glühen/Lift/Neon) haben Vorrang; ohne Effekt greift
        // optional ein manuell gesetzter Schatten (shadowBlur am Objekt).
        const effProps = (o.effect && o.effect !== 'none') ? textEffectProps(o) : {}
        return <KText key={o.id} {...base} text={o.text} fontSize={o.fontSize} fontFamily={o.fontFamily}
          fill={o.fill} fontStyle={o.fontStyle || 'normal'} align={o.align || 'left'} width={o.width || 360}
          lineHeight={o.lineHeight || 1.2} letterSpacing={o.letterSpacing || 0} textDecoration={o.textDecoration || ''}
          shadowColor={o.shadowColor} shadowBlur={o.shadowBlur || 0} shadowOffsetX={o.shadowOffsetX || 0} shadowOffsetY={o.shadowOffsetY || 0}
          {...effProps}
          visible={editingTextId !== o.id}
          onDblClick={() => startTextEdit(o.id)} onDblTap={() => startTextEdit(o.id)} />
      }
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
        const cropProp = (o.cropWidth && o.cropHeight)
          ? { x: o.cropX || 0, y: o.cropY || 0, width: o.cropWidth, height: o.cropHeight }
          : undefined
        return <KImage key={o.id} {...base} image={el} width={o.width} height={o.height} crop={cropProp} />
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
  const dockPanel = containerW >= 720
  // Schriftliste inkl. Brand-Fonts (für ContextBar-Dropdown).
  const allFonts = [...FONTS, ...brandFontFamilies.filter(f => !FONTS.includes(f))]

  return (
    <div ref={activeRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Versteckter file-input für Bild-Upload */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; onPickImageFile(f); e.target.value = '' }} />
      {/* Tier 1 — globale Werkzeugleiste: links Undo/Redo + Zoom, rechts Format/Export/Speichern */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', flexShrink: 0 }}>
        {/* Undo / Redo */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ToolBtn onClick={undo} title="Rückgängig (Cmd/Ctrl+Z)"><Undo2 size={15} strokeWidth={1.9} /></ToolBtn>
          <ToolBtn onClick={redo} title="Wiederholen (Cmd/Ctrl+Shift+Z)"><Redo2 size={15} strokeWidth={1.9} /></ToolBtn>
        </div>
        <Divider />
        {/* Zoom als kompaktes Segment */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 10, border: '1px solid var(--border,#E9ECF2)', background: 'var(--page-bg,#F7F8FA)' }}>
          <ToolBtn onClick={zoomOut} title="Verkleinern"><ZoomOut size={15} strokeWidth={1.9} /></ToolBtn>
          <button onClick={zoom100} title="Auf 100 %"
            style={{ minWidth: 50, height: 30, padding: '0 6px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {zoomPct}%
          </button>
          <ToolBtn onClick={zoomIn} title="Vergrößern"><ZoomIn size={15} strokeWidth={1.9} /></ToolBtn>
          <ToolBtn onClick={zoomFit} title="Einpassen"><Maximize2 size={15} strokeWidth={1.9} /></ToolBtn>
        </div>

        <div style={{ flex: 1 }} />

        {savedMsg && <span style={{ fontSize: 12, fontWeight: 600, color: savedMsg.startsWith('Fehler') || savedMsg.startsWith('Download-Fehler') ? '#b91c1c' : '#15803d' }}>{savedMsg}</span>}
        <FormatMenu onPick={applyFormatPreset} />
        <ToolBtn onClick={() => setShowExport(true)} active={showExport} title="Exportieren (PNG / JPG / PDF)"><Download size={15} strokeWidth={1.9} /></ToolBtn>
        <Divider />
        <button onClick={handleSave} disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 16px', borderRadius: 9, border: 'none', background: P, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(16,24,40,0.10)' }}>
          {saving ? <Loader2 size={14} className="lk-spin" /> : <Save size={14} strokeWidth={2} />}Speichern
        </button>
      </div>

      {/* Export-Dialog (PNG / JPG / PDF) */}
      {showExport && (
        <ExportModal onExport={handleExport} exporting={exporting} onClose={() => setShowExport(false)} />
      )}

      {/* Kontext-Leiste: Selektion / Filter / Crop / AI */}
      {selected && selectedIds.length === 1 && !cropMode && !aiActive && (
        <ContextBar selected={selected} updateObject={updateObject}
          commitHistoryOnce={commitHistoryOnce} endInteraction={endInteraction}
          reorder={reorder} deleteSelected={deleteSelected} duplicateSelected={duplicateSelected}
          fonts={allFonts} selectedIds={selectedIds}
          alignObjects={alignObjects} distributeObjects={distributeObjects} />
      )}
      {selectedIds.length > 1 && !cropMode && !aiActive && (
        <MultiBar count={selectedIds.length} onDuplicate={duplicateSelected} onDelete={deleteSelected}
          updateOpacity={(v) => { const ids = new Set(selectedIds); setObjects(prev => prev.map(o => ids.has(o.id) ? { ...o, opacity: v } : o)) }}
          commitHistoryOnce={commitHistoryOnce} endInteraction={endInteraction}
          alignObjects={alignObjects} distributeObjects={distributeObjects} />
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
          // Vorlagen
          onApplyTemplate={applyTemplate}
          // Elemente
          elementTab={elementTab} setElementTab={setElementTab}
          onAddRect={addRect} onAddEllipse={addEllipse} onAddLine={addLine} onAddArrow={addArrow}
          onAddAsset={addAsset}
          onInsertMedia={(dataUrl) => addImageFromDataUrl(dataUrl)}
          // Text
          onAddText={addText} onAddTextPreset={addTextPreset}
          // Uploads
          onTriggerUpload={triggerImageUpload} uploadThumbs={uploadThumbs}
          onInsertUpload={(url) => addImageFromDataUrl(url)}
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
          onBgWhite={() => runBackgroundReplace('white')}
          onBgReplace={(txt) => runBackgroundReplace('replace', txt)}
          onClearMask={clearMask} onInvertMask={invertMask}
          setCropMode={setCropMode} setSelectedId={setSelectedId} setAiError={setAiError}
          // Filter
          filters={filters} setFilters={setFilters}
          commitHistoryOnce={commitHistoryOnce} endInteraction={endInteraction}
          filterScope={(selected && selected.type === 'image') ? 'einzeln' : 'alle'}
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
            // Weiße Artboard (Whiteboard-Modell).
            background: '#fff',
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
                {/* Weiße Artboard (Whiteboard) — IMMER als Stage-Hintergrund. */}
                <Rect id="__bgfill__" x={0} y={0} width={stageSize.width} height={stageSize.height} fill={bgColor || '#ffffff'} listening />
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
            onDelete={() => { deleteSelected(); setCtxMenu(null) }}
            onPaste={() => { pasteClipboard(); setCtxMenu(null) }}
            onSelectAll={() => { setSelectedIds(objects.map(o => o.id)); setCtxMenu(null) }}
          />
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

      </div>

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
function ContextMenu({ ctx, obj, hasClipboard, containerW, onClose, onReorder, onDuplicate, onToggleLock, onToggleHidden, onRename, onDelete, onPaste, onSelectAll }) {
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
            <ContextMenuSep />
            <ContextMenuItem danger onClick={onDelete}><Trash2 {...ic} />Löschen</ContextMenuItem>
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
function ContextBar({
  selected, updateObject, reorder, deleteSelected, duplicateSelected,
  commitHistoryOnce, endInteraction, fonts,
  selectedIds, alignObjects, distributeObjects,
}) {
  const FONT_LIST = (fonts && fonts.length) ? fonts : FONTS
  const o = selected
  const isText = o.type === 'text'
  const hasFill = ['text', 'rect', 'ellipse', 'sticker'].includes(o.type)
  const hasStroke = ['rect', 'ellipse', 'line', 'arrow', 'sticker'].includes(o.type)
  const hasWH = (o.type === 'rect' || o.type === 'image')
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
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={label}>
      <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{label}</span>
      <input type="number" value={Math.round((Number(value) || 0) * 100) / 100}
        step={opts.step || 1} min={opts.min}
        onMouseDown={startEdit} onFocus={startEdit} onBlur={endInteraction}
        onChange={e => onCommitVal(parseFloat(e.target.value))}
        style={{ width: opts.w || 56, height: 30, padding: '0 6px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
    </label>
  )

  return (
    <div style={{ ...barStyle, flexWrap: 'wrap', gap: 7 }}>
      {/* ── Text-Formatierung ── */}
      {isText && (
        <>
          <select value={o.fontFamily || 'Inter'} onChange={e => setOnce({ fontFamily: e.target.value })} style={{ ...selStyle, minWidth: 116 }}>
            {FONT_LIST.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <input type="number" min={6} max={400} value={Math.round(o.fontSize || 44)}
            onFocus={startEdit} onMouseDown={startEdit} onBlur={endInteraction}
            onChange={e => liveEdit({ fontSize: parseInt(e.target.value, 10) || 44 })}
            style={{ ...selStyle, width: 60 }} title="Schriftgröße" />
          <ToolBtn onClick={() => setStyleFlag('bold')} active={isBold} title="Fett"><Bold size={14} strokeWidth={2.2} /></ToolBtn>
          <ToolBtn onClick={() => setStyleFlag('italic')} active={isItalic} title="Kursiv"><Italic size={14} strokeWidth={2.2} /></ToolBtn>
          <ToolBtn onClick={() => setOnce({ textDecoration: isUnderline ? '' : 'underline' })} active={isUnderline} title="Unterstrichen"><Underline size={14} strokeWidth={2.2} /></ToolBtn>
          <select value={o.align || 'left'} onChange={e => setOnce({ align: e.target.value })} style={selStyle} title="Textausrichtung">
            <option value="left">Links</option><option value="center">Zentriert</option><option value="right">Rechts</option>
          </select>
          <select value={o.effect || 'none'} onChange={e => setOnce({ effect: e.target.value })} style={selStyle} title="Texteffekt">
            {TEXT_EFFECTS.map(ef => <option key={ef.id} value={ef.id}>{ef.label}</option>)}
          </select>
          <Divider />
        </>
      )}

      {/* ── Füllung / Rand / Eckenradius / Schatten ── */}
      {hasFill && (
        <label style={lblStyle} title="Füllfarbe">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Füllung</span>
          <input type="color" value={toHex(o.fill)} onMouseDown={startEdit} onFocus={startEdit}
            onChange={e => liveEdit({ fill: e.target.value })} onBlur={endInteraction} style={colorStyle} />
        </label>
      )}
      {hasStroke && (
        <>
          <label style={lblStyle} title="Randfarbe">
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rand</span>
            <input type="color" value={toHex(o.stroke || '#ffffff')} onMouseDown={startEdit} onFocus={startEdit}
              onChange={e => liveEdit({ stroke: e.target.value })} onBlur={endInteraction} style={colorStyle} />
          </label>
          {numField('Stärke', o.strokeWidth || 0, v => setOnce({ strokeWidth: Math.max(0, v || 0) }), { min: 0, w: 50 })}
        </>
      )}
      {o.type === 'rect' && numField('Ecken', o.cornerRadius || 0, v => setOnce({ cornerRadius: Math.max(0, v || 0) }), { min: 0, w: 50 })}
      {(hasFill || hasStroke) && (
        <ToolBtn onClick={() => setOnce(o.shadowBlur ? { shadowBlur: 0 } : { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.35)', shadowOffsetX: 0, shadowOffsetY: 4 })} active={!!o.shadowBlur} title={o.shadowBlur ? 'Schatten aus' : 'Schatten an'}>
            <Sliders size={14} strokeWidth={1.9} />
        </ToolBtn>
      )}

      {/* ── Text-Feinheiten ── */}
      {isText && (
        <>
          {numField('Zeilenh.', o.lineHeight || 1.2, v => setOnce({ lineHeight: v || 1.2 }), { step: 0.05, min: 0.5, w: 52 })}
          {numField('Laufw.', o.letterSpacing || 0, v => setOnce({ letterSpacing: v || 0 }), { step: 0.5, w: 50 })}
        </>
      )}

      <Divider />

      {/* ── Position / Größe / Drehung ── */}
      {numField('X', o.x, v => setOnce({ x: v || 0 }))}
      {numField('Y', o.y, v => setOnce({ y: v || 0 }))}
      {hasWH && numField('B', o.width, v => setOnce({ width: Math.max(1, v || 1) }), { min: 1 })}
      {hasWH && numField('H', o.height, v => setOnce({ height: Math.max(1, v || 1) }), { min: 1 })}
      {isEllipse && numField('rX', o.radiusX, v => setOnce({ radiusX: Math.max(1, v || 1) }), { min: 1 })}
      {isEllipse && numField('rY', o.radiusY, v => setOnce({ radiusY: Math.max(1, v || 1) }), { min: 1 })}
      {numField('Drehung°', o.rotation, v => setOnce({ rotation: v || 0 }), { w: 60 })}

      {/* ── Deckkraft ── */}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }} title="Deckkraft">
        Deckkraft
        <input type="range" min={0} max={100} step={1} value={opacityPct}
          onMouseDown={startEdit} onChange={e => liveEdit({ opacity: (parseInt(e.target.value, 10) || 0) / 100 })} onMouseUp={endInteraction} style={{ width: 80, accentColor: P }} />
        <span style={{ width: 30, textAlign: 'right' }}>{opacityPct}%</span>
      </label>

      <Divider />

      {/* ── Ausrichten / Verteilen ── */}
      <ToolBtn onClick={() => alignObjects('left')} title="Links ausrichten"><AlignStartVertical size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => alignObjects('hcenter')} title="Horizontal zentrieren"><AlignCenterVertical size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => alignObjects('right')} title="Rechts ausrichten"><AlignEndVertical size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => alignObjects('top')} title="Oben ausrichten"><AlignStartHorizontal size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => alignObjects('vcenter')} title="Vertikal zentrieren"><AlignCenterHorizontal size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => alignObjects('bottom')} title="Unten ausrichten"><AlignEndHorizontal size={14} strokeWidth={1.9} /></ToolBtn>
      {selCount >= 3 && <ToolBtn onClick={() => distributeObjects('h')} title="Horizontal verteilen"><AlignHorizontalDistributeCenter size={14} strokeWidth={1.9} /></ToolBtn>}
      {selCount >= 3 && <ToolBtn onClick={() => distributeObjects('v')} title="Vertikal verteilen"><AlignVerticalDistributeCenter size={14} strokeWidth={1.9} /></ToolBtn>}

      <Divider />

      {/* ── Ebene / Duplizieren / Löschen ── */}
      <ToolBtn onClick={() => reorder('top')} title="Nach ganz vorne"><BringToFront size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => reorder('up')} title="Eine Ebene nach vorne"><ChevronUp size={14} strokeWidth={2} /></ToolBtn>
      <ToolBtn onClick={() => reorder('down')} title="Eine Ebene nach hinten"><ChevronDown size={14} strokeWidth={2} /></ToolBtn>
      <ToolBtn onClick={() => reorder('bottom')} title="Nach ganz hinten"><SendToBack size={14} strokeWidth={1.9} /></ToolBtn>
      <div style={{ flex: 1 }} />
      <ToolBtn onClick={duplicateSelected} title="Duplizieren (Strg+D)"><Copy size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={deleteSelected} title="Löschen (Entf)"><Trash2 size={14} strokeWidth={1.9} /></ToolBtn>
    </div>
  )
}

// Leiste bei Mehrfach-Auswahl: gemeinsame Aktionen (Duplizieren, Deckkraft, Löschen).
function MultiBar({ count, onDuplicate, onDelete, updateOpacity, commitHistoryOnce, endInteraction, alignObjects, distributeObjects }) {
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
      <ToolBtn onClick={() => setOpen(o => !o)} active={open} title="Format / Größe"><Frame size={15} strokeWidth={1.9} /></ToolBtn>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 81, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.12)', padding: 8, width: 260 }}>
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

// ════════════════════════════════════════════════════════════════════════════
// CANVA-STIL: linke Werkzeug-Schiene + Panel
// ════════════════════════════════════════════════════════════════════════════
// Werkzeuge der linken Schiene, in sinnvolle Gruppen unterteilt:
//   1) Erstellen: Vorlagen / Elemente / Text / Uploads
//   2) Marke
//   3) Bearbeiten: KI / Filter / Ebenen
// Ein 'divider'-Eintrag erzeugt eine dezente Trennlinie zwischen den Gruppen.
const RAIL_TOOLS = [
  { id: 'templates', label: 'Vorlagen', Icon: LayoutTemplate },
  { id: 'elements',  label: 'Elemente', Icon: StarIcon },
  { id: 'text',      label: 'Text',     Icon: Type },
  { id: 'uploads',   label: 'Uploads',  Icon: Upload },
  { id: 'div1', divider: true },
  { id: 'brand',     label: 'Marke',    Icon: Palette },
  { id: 'div2', divider: true },
  { id: 'ai',        label: 'KI',       Icon: Wand2 },
  { id: 'filter',    label: 'Filter',   Icon: Sliders },
  { id: 'layers',    label: 'Ebenen',   Icon: Layers },
]

function ToolRail({ active, onSelect }) {
  return (
    <div style={{ width: 76, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface,#fff)',
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
      if (dataUrl) onInsert && onInsert(dataUrl)
    } finally {
      setInserting(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <MediaSearchInput value={q} onChange={setQ} placeholder="Icons suchen…" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Farbe</span>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} title="Icon-Farbe"
          style={{ width: 30, height: 26, padding: 0, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: '#fff' }} />
      </div>
      {loading ? <MediaSpinner label="Suche Icons…" /> : (
        ids.length === 0 ? <MediaEmpty label="Keine Treffer." /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 8 }}>
            {ids.map(id => (
              <button key={id} onClick={() => handlePick(id)} title={id} disabled={inserting === id}
                style={{ height: 44, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {inserting === id
                  ? <Loader2 size={16} className="lk-spin" style={{ color: 'var(--text-muted)' }} />
                  : <img src={iconSvgUrl(id, color)} alt={id} loading="lazy" width={28} height={28} style={{ display: 'block', objectFit: 'contain' }} />}
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
      if (dataUrl) onInsert && onInsert(dataUrl)
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
                style={{ height: 44, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {inserting === id
                  ? <Loader2 size={16} className="lk-spin" style={{ color: 'var(--text-muted)' }} />
                  : <img src={iconSvgUrl(id)} alt={id} loading="lazy" width={30} height={30} style={{ display: 'block', objectFit: 'contain' }} />}
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
              style={{ border: 'none', padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: p.avgColor || '#eef1f5', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: '100%', aspectRatio: '1 / 1', background: p.avgColor || '#eef1f5', position: 'relative' }}>
                <img src={p?.src?.tiny || p?.src?.medium} alt={p.alt || ''} loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {inserting === p.id && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.6)' }}>
                    <Loader2 size={18} className="lk-spin" style={{ color: 'var(--text-muted)' }} />
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9, lineHeight: 1.2, color: 'var(--text-muted)', padding: '2px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: '#fff', textAlign: 'left' }}>
                Foto: {p.photographer || 'Pexels'} / Pexels
              </span>
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
  const titleMap = { templates: 'Vorlagen', elements: 'Elemente', text: 'Text', uploads: 'Uploads', brand: 'Marke', ai: 'KI-Werkzeuge', filter: 'Filter', layers: 'Ebenen' }
  const frame = docked
    ? { width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface,#fff)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }
    : { position: 'absolute', left: 8, top: 8, bottom: 8, zIndex: 90, width: 300, maxWidth: 'calc(100% - 16px)', borderRadius: 12,
        border: '1px solid var(--border)', background: 'var(--surface,#fff)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 12px 40px rgba(16,24,40,0.18)' }
  return (
    <div style={frame}>
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
        {tool === 'layers' && <LayersPanelBody {...props} />}
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
function ElementsPanelBody({ elementTab, setElementTab, onAddRect, onAddEllipse, onAddLine, onAddArrow, onAddAsset, onInsertMedia }) {
  const tabs = [
    { id: 'shapes', label: 'Formen' },
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
      {elementTab === 'icons' && <IconsTab onInsert={onInsertMedia} />}
      {elementTab === 'graphics' && <GraphicsTab onInsert={onInsertMedia} />}
      {elementTab === 'images' && <ImagesTab onInsert={onInsertMedia} />}
    </div>
  )
}

// ─── Panel: Text ────────────────────────────────────────────────────────────
function TextPanelBody({ onAddText, onAddTextPreset }) {
  return (
    <div>
      <PanelBtn full primary onClick={onAddText}><PlusIcon size={15} strokeWidth={2} />Textfeld hinzufügen</PanelBtn>
      <PanelLabel>Textstile</PanelLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => onAddTextPreset('heading')} style={textStyleBtn}><span style={{ fontSize: 20, fontWeight: 800 }}>Überschrift</span></button>
        <button onClick={() => onAddTextPreset('subheading')} style={textStyleBtn}><span style={{ fontSize: 15, fontWeight: 700 }}>Unterüberschrift</span></button>
        <button onClick={() => onAddTextPreset('body')} style={textStyleBtn}><span style={{ fontSize: 12.5, fontWeight: 400 }}>Fließtext</span></button>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8 }}>Bei ausgewähltem Text wird dessen Stil gesetzt.</div>
    </div>
  )
}
const textStyleBtn = { display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'left' }

// ─── Panel: Uploads ─────────────────────────────────────────────────────────
function UploadsPanelBody({ onTriggerUpload, uploadThumbs, onInsertUpload }) {
  return (
    <div>
      <PanelBtn full primary onClick={onTriggerUpload}><Upload size={15} strokeWidth={1.9} />Bild hochladen</PanelBtn>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0' }}>Tipp: Bilder lassen sich auch direkt auf die Leinwand ziehen.</div>
      {(uploadThumbs || []).length > 0 && (
        <>
          <PanelLabel>Diese Sitzung</PanelLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {uploadThumbs.map((u, i) => (
              <button key={i} onClick={() => onInsertUpload(u)} title="Einfügen"
                style={{ height: 64, borderRadius: 8, border: '1px solid var(--border)', background: `#f4f6fa center/cover no-repeat url(${u})`, cursor: 'pointer' }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Panel: Marke ───────────────────────────────────────────────────────────
function BrandPanelBody({ brandData, brandLoading, onApplyBrandColor, onInsertBrandLogo, onApplyBrandFont, hasSelection }) {
  if (brandLoading) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Marken-Identität wird geladen…</div>
  const palette = brandData?.palette || []
  const logos = brandData?.logos || []
  const fonts = brandData?.fonts || []
  const empty = !palette.length && !logos.length && !fonts.length
  if (empty) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Für diese Marke ist noch keine visuelle Identität hinterlegt (Farben, Logos, Schriften). Du kannst sie im Branding-Bereich pflegen.</div>
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

// ─── Panel: KI ──────────────────────────────────────────────────────────────
function AiPanelBody({
  aiMode, setAiMode, maskTool, setMaskTool, brushSize, setBrushSize, feather, setFeather,
  aiPrompt, setAiPrompt, aiCommand, setAiCommand, aiBusy, aiError, bgMenuBusy, hasMask,
  onRunMaskEdit, onRunFreeCommand, onBgWhite, onBgReplace, onClearMask, onInvertMask,
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
        <PanelBtn full disabled={bgMenuBusy} onClick={onBgWhite}>Weißer Hintergrund</PanelBtn>
        <input value={bgText} onChange={e => setBgText(e.target.value)} placeholder="Neuer Hintergrund (Beschreibung)…"
          style={{ width: '100%', height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <PanelBtn full disabled={bgMenuBusy || !bgText.trim()} onClick={() => { if (bgText.trim()) { onBgReplace(bgText.trim()); setBgText('') } }}>Hintergrund ersetzen</PanelBtn>
      </div>
      {aiError && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 10 }}>{aiError}</div>}
    </div>
  )
}

// ─── Panel: Filter ──────────────────────────────────────────────────────────
function FilterPanelBody({ filters, setFilters, commitHistoryOnce, endInteraction, filterScope }) {
  const set = (k, v) => setFilters({ ...filters, [k]: v })
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 12 }}>
        Filter gelten {filterScope === 'einzeln' ? 'für das ausgewählte Bild.' : 'für alle Bild-Ebenen (nichts ausgewählt).'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Slider label="Helligkeit" min={-0.6} max={0.6} step={0.02} value={filters.brightness} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('brightness', v)} />
        <Slider label="Kontrast" min={-60} max={60} step={2} value={filters.contrast} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('contrast', v)} />
        <Slider label="Sättigung" min={-2} max={4} step={0.1} value={filters.saturation} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('saturation', v)} />
        <Slider label="Weichzeichnen" min={0} max={30} step={1} value={filters.blur} onStart={commitHistoryOnce} onEnd={endInteraction} onChange={v => set('blur', v)} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={!!filters.grayscale} onChange={e => { commitHistoryOnce(); set('grayscale', e.target.checked ? 1 : 0); endInteraction() }} />Graustufen
        </label>
      </div>
      <div style={{ marginTop: 14 }}>
        <PanelBtn full onClick={() => { commitHistoryOnce(); setFilters({ brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: 0 }); endInteraction() }}>Filter zurücksetzen</PanelBtn>
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
