// src/components/designer/DesignerCanvas.jsx
// Grafik-Designer für die Content-Werkstatt (react-konva).
// Eigenständig & robust: react-konva wird lazy geladen (siehe DesignerPane.jsx Wrapper),
// alle Stage-Operationen in try/catch, damit ein Fehler nie die ganze Seite crasht.
//
// Props: { visual, teamId, onSaved, onReplaceVisual }
//   - visual: { id, storage_path, design_json?, title?, aspect_ratio? }
//   - teamId: aktives Team (für Upload-Pfad)
//   - onSaved(updatedVisual): nach dem Speichern (Render hochgeladen + design_json gespeichert)
//   - onReplaceVisual(newVisual): wenn die KI-Retusche ein neues Basisbild erzeugt
//
// Ausschließlich Inline-Styles, alle Texte deutsch, Primary = var(--wl-primary).

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Image as KImage, Rect, Circle, Ellipse, Line, Arrow, Text as KText, Path, Transformer } from 'react-konva'
import Konva from 'konva'
import {
  Type, Square as SquareIcon, Circle as CircleIcon, Minus, ArrowRight, Star as StarIcon,
  Trash2, Undo2, Redo2, Save, Download, BringToFront, SendToBack, Crop, Wand2,
  Bold, Italic, Sliders, Loader2, X, ChevronUp, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { visualDataUrl, uploadDesignRender, updateVisual, getVisual, linkVisualToChat } from '../../lib/contentVisuals'
import { splitModelValue, DEFAULT_IMAGE_MODEL } from '../../lib/imageModels'

const P = 'var(--wl-primary, rgb(49,90,231))'
const PRGB = 'rgb(49,90,231)'

const FONTS = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Caveat']

// Einfache Sticker als SVG-Pfad-Daten (auf 100×100 normiert) — Phase-1-Set.
const STICKERS = [
  { id: 'star',  label: 'Stern',  d: 'M50 5 L61 39 L97 39 L68 61 L79 95 L50 73 L21 95 L32 61 L3 39 L39 39 Z' },
  { id: 'heart', label: 'Herz',   d: 'M50 88 C50 88 8 60 8 33 C8 18 20 10 32 10 C41 10 47 16 50 22 C53 16 59 10 68 10 C80 10 92 18 92 33 C92 60 50 88 50 88 Z' },
  { id: 'check', label: 'Haken',  d: 'M20 52 L42 75 L82 22' },
  { id: 'badge', label: 'Plakette', d: 'M50 5 L62 18 L80 14 L80 33 L95 45 L82 58 L86 77 L67 78 L50 92 L33 78 L14 77 L18 58 L5 45 L20 33 L20 14 L38 18 Z' },
]

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

  // Bild-Filter (auf Basisbild)
  const [filters, setFilters] = useState({ brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: 0 })
  const [showFilters, setShowFilters] = useState(false)

  // Crop-Modus
  const [cropMode, setCropMode] = useState(false)
  const [cropRect, setCropRect] = useState(null)      // {x,y,w,h} in Bühnenkoordinaten
  const cropDragRef = useRef(null)

  // KI-Retusche
  const [aiMode, setAiMode] = useState(false)
  const [aiRect, setAiRect] = useState(null)
  const aiDragRef = useRef(null)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')

  // Undo/Redo: Snapshots des kompletten Editor-Zustands (objects + filters + base meta)
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
        if (!visual?.storage_path) { setLoadError('Kein Bildpfad'); setLoading(false); return }
        const dataUrl = await visualDataUrl(visual.storage_path)
        if (!dataUrl) { if (!cancelled) { setLoadError('Bild konnte nicht geladen werden'); setLoading(false) } return }
        const img = new window.Image()
        img.onload = () => {
          if (cancelled) return
          const w = img.naturalWidth || 1024
          const h = img.naturalHeight || 1024
          setBgImage(img)
          setStageSize({ width: w, height: h })
          setBaseCrop(null)
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
  }), [objects, filters, baseCrop])

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
      fontSize: 44, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'normal', align: 'left', width: 360,
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

  // ─── Stage-Click (Selektion aufheben / Crop / AI-Rect zeichnen) ────────────
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
    if (aiMode) { aiDragRef.current = { x: sx, y: sy }; setAiRect({ x: sx, y: sy, w: 0, h: 0 }); return }
    // Klick auf leere Bühne → Selektion lösen
    if (e.target === stage || e.target.attrs?.id === '__bg__') {
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
    if (aiMode && aiDragRef.current) {
      const s = aiDragRef.current
      setAiRect({ x: Math.min(s.x, sx), y: Math.min(s.y, sy), w: Math.abs(sx - s.x), h: Math.abs(sy - s.y) })
    }
  }
  function onStageMouseUp() {
    cropDragRef.current = null
    aiDragRef.current = null
  }

  function applyCrop() {
    if (!cropRect || cropRect.w < 8 || cropRect.h < 8) { setCropMode(false); setCropRect(null); return }
    pushHistory()
    // cropRect liegt in Bühnenkoordinaten (= Bild-Pixel des aktuellen Ausschnitts).
    // baseCrop wird in absoluten Original-Pixeln gespeichert: bestehenden Offset addieren.
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
    // Transformer + Overlays kurz ausblenden für sauberen Export
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
      const design_json = { version: 1, objects, filters, baseCrop, stage: { width: stageSize.width, height: stageSize.height } }
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

  // ─── KI-Retusche (mask-free über Referenzbild + Region-Prompt) ─────────────
  function regionDescription(r) {
    if (!r) return ''
    const cw = stageSize.width, ch = stageSize.height
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2
    const vert = cy < ch * 0.34 ? 'im oberen' : cy > ch * 0.66 ? 'im unteren' : 'im mittleren'
    const horiz = cx < cw * 0.34 ? 'linken' : cx > cw * 0.66 ? 'rechten' : 'zentralen'
    return `${vert} ${horiz} Bereich des Bildes`
  }
  async function runAiEdit() {
    if (!aiPrompt.trim()) { setAiError('Bitte beschreibe die gewünschte Änderung.'); return }
    if (!visual?.storage_path) { setAiError('Kein Basisbild.'); return }
    setAiBusy(true); setAiError('')
    try {
      const region = aiRect && aiRect.w > 8 ? ` Ändere gezielt ${regionDescription(aiRect)}.` : ''
      const prompt = `Bearbeite das Referenzbild. ${aiPrompt.trim()}${region} Behalte den Rest des Bildes unverändert, fotorealistisch und stilistisch konsistent.`
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
      if (fnErr) throw new Error(fnErr.message || 'KI-Retusche fehlgeschlagen')
      if (data?.error) throw new Error(data.error)
      const nv = (data?.visuals || [])[0]
      if (!nv) throw new Error('Kein Ergebnis erhalten')
      // Vollen Datensatz nachladen (für aspect_ratio etc.)
      let full = nv
      try { const { data: fv } = await getVisual(nv.id); if (fv) full = fv } catch (_e) {}
      setAiMode(false); setAiRect(null); setAiPrompt('')
      onReplaceVisual && onReplaceVisual(full)
    } catch (e) {
      setAiError(e?.message || 'KI-Retusche fehlgeschlagen')
    } finally {
      setAiBusy(false)
    }
  }

  // ─── Render-Helfer für Konva-Objekte ───────────────────────────────────────
  // Position relativ zur aktuellen (gecroppten) Bühne
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Werkzeugleiste */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', flexShrink: 0 }}>
        <ToolBtn onClick={addText} title="Text"><Type size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={addRect} title="Rechteck"><SquareIcon size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={addEllipse} title="Kreis / Ellipse"><CircleIcon size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={addLine} title="Linie"><Minus size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={addArrow} title="Pfeil"><ArrowRight size={15} strokeWidth={1.9} /></ToolBtn>
        <StickerMenu onPick={addSticker} />
        <Divider />
        <ToolBtn onClick={() => setShowFilters(s => !s)} active={showFilters} title="Bild-Filter"><Sliders size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={() => { setCropMode(m => !m); setAiMode(false); setSelectedId(null); setCropRect(null) }} active={cropMode} title="Zuschneiden"><Crop size={15} strokeWidth={1.9} /></ToolBtn>
        <ToolBtn onClick={() => { setAiMode(m => !m); setCropMode(false); setSelectedId(null); setAiRect(null); setAiError('') }} active={aiMode} title="KI-Retusche"><Wand2 size={15} strokeWidth={1.9} /></ToolBtn>
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

      {/* Kontext-Leiste: Selektion / Filter / Crop / AI */}
      {selected && !cropMode && !aiMode && (
        <ContextBar selected={selected} updateObject={updateObject} reorder={reorder} deleteSelected={deleteSelected} />
      )}
      {showFilters && (
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
      {aiMode && (
        <div style={{ ...barStyle, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: '100%' }}>Optional einen Bereich markieren, dann beschreiben, was geändert werden soll (mask-free).</span>
          <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="z.B. ersetze den Himmel durch einen Sonnenuntergang"
            style={{ flex: 1, minWidth: 220, height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit' }} />
          <SmallBtn onClick={runAiEdit} primary disabled={aiBusy}>{aiBusy ? 'KI arbeitet…' : 'Anwenden'}</SmallBtn>
          <SmallBtn onClick={() => { setAiMode(false); setAiRect(null); setAiPrompt(''); setAiError('') }}>Abbrechen</SmallBtn>
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
          <div style={{ position: 'relative', width: dispW, height: dispH, boxShadow: '0 4px 24px rgba(16,24,40,0.14)', background: '#fff' }}>
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
                {bgImage && (
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
                {/* AI-Region-Overlay */}
                {aiMode && aiRect && (
                  <Rect x={aiRect.x - off.x} y={aiRect.y - off.y} width={aiRect.w} height={aiRect.h}
                    stroke="#7c3aed" strokeWidth={2 / scale} dash={[8 / scale, 6 / scale]} fill="rgba(124,58,237,0.14)" listening={false} />
                )}
                <Transformer ref={trRef} rotateEnabled keepRatio={false}
                  boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 8) ? oldBox : newBox} />
              </Layer>
            </Stage>

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
      <ToolBtn onClick={() => reorder('top')} title="Nach ganz vorne"><BringToFront size={14} strokeWidth={1.9} /></ToolBtn>
      <ToolBtn onClick={() => reorder('up')} title="Eine Ebene nach vorne"><ChevronUp size={14} strokeWidth={2} /></ToolBtn>
      <ToolBtn onClick={() => reorder('down')} title="Eine Ebene nach hinten"><ChevronDown size={14} strokeWidth={2} /></ToolBtn>
      <ToolBtn onClick={() => reorder('bottom')} title="Nach ganz hinten"><SendToBack size={14} strokeWidth={1.9} /></ToolBtn>
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
