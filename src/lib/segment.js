// src/lib/segment.js
// ─────────────────────────────────────────────────────────────────────────────
// Klick-Objekterkennung („Magic Select") via SlimSAM (Segment Anything, klein).
// Läuft KOMPLETT im Browser über @huggingface/transformers — wie das Freistellen
// (bgRemoval.js / MODNet). Der Nutzer klickt auf ein Objekt im Bild, das Modell
// liefert eine pixelgenaue Maske dieses Objekts. Diese Maske wird dann von den
// KI-Werkzeugen (Bereich ändern / Objekt entfernen) verwendet.
//
// Ablauf:
//   1. prepareSegment(imgEl) — rechnet EINMAL pro Bild die (teuren) Bild-Embeddings.
//   2. segmentAt(nx, ny)     — pro Klick (schnell): Punkt → Objekt-Maske (Canvas).
//
// Lizenz: SlimSAM (Xenova/slimsam-77-uniform) = Apache-2.0 → kommerziell nutzbar.
// Datenschutz: Verarbeitung im Browser; das Bild verlässt das Gerät nicht.
// ─────────────────────────────────────────────────────────────────────────────

let _modelPromise = null

async function getModel(onProgress) {
  if (_modelPromise) return _modelPromise
  _modelPromise = (async () => {
    const t = await import('@huggingface/transformers')
    try { t.env.allowLocalModels = false } catch (_e) {}
    const model = await t.SamModel.from_pretrained('Xenova/slimsam-77-uniform', {
      dtype: 'fp32',
      progress_callback: onProgress,
    })
    const processor = await t.AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform', {
      progress_callback: onProgress,
    })
    return { t, model, processor }
  })()
  try {
    return await _modelPromise
  } catch (e) {
    _modelPromise = null   // bei Fehler erneut versuchbar
    throw e
  }
}

// Cache der Bild-Embeddings für das zuletzt vorbereitete Bild.
let _emb = null

// imgEl: HTMLImageElement | HTMLCanvasElement mit den ORIGINAL-Pixeln.
// Rechnet die Bild-Embeddings (teurer Schritt) einmalig vor.
export async function prepareSegment(imgEl, onProgress) {
  const { t, model, processor } = await getModel(onProgress)
  const W = imgEl.naturalWidth || imgEl.width
  const H = imgEl.naturalHeight || imgEl.height
  if (!W || !H) throw new Error('Bild konnte nicht gelesen werden.')

  const c = document.createElement('canvas')
  c.width = W; c.height = H
  c.getContext('2d').drawImage(imgEl, 0, 0, W, H)
  const image = await t.RawImage.fromURL(c.toDataURL('image/png'))

  const image_inputs = await processor(image)
  const image_embeddings = await model.get_image_embeddings(image_inputs)

  _emb = { t, model, processor, image_inputs, image_embeddings, W, H }
  return { W, H }
}

export function isSegmentReady() { return !!_emb }
export function resetSegment() { _emb = null }

// nx, ny: normalisierte Klickposition im Bild (0..1).
// Rückgabe: { canvas (WxH, weiße Maske auf transparent), score, W, H } oder null.
export async function segmentAt(nx, ny) {
  if (!_emb) throw new Error('Segmentierung ist noch nicht vorbereitet.')
  const { t, model, processor, image_inputs, image_embeddings, W, H } = _emb

  // Punkt in die (auf längste Kante skalierte) Modell-Auflösung bringen.
  const reshaped = image_inputs.reshaped_input_sizes[0]   // [h, w]
  const px = Math.max(0, Math.min(1, nx)) * reshaped[1]
  const py = Math.max(0, Math.min(1, ny)) * reshaped[0]
  const input_points = new t.Tensor('float32', [px, py], [1, 1, 1, 2])
  const input_labels = new t.Tensor('int64', [1n], [1, 1, 1])

  const outputs = await model({ ...image_embeddings, input_points, input_labels })
  const masks = await processor.post_process_masks(
    outputs.pred_masks, image_inputs.original_sizes, image_inputs.reshaped_input_sizes
  )

  const maskTensor = masks[0]              // dims: [1, num_masks, H, W] (bool/uint8)
  const dims = maskTensor.dims
  const mh = dims[dims.length - 2]
  const mw = dims[dims.length - 1]
  const nMasks = dims[dims.length - 3] || 1
  const mdata = maskTensor.data
  const scores = outputs.iou_scores?.data || [1]
  const N = mw * mh
  const cx = Math.max(0, Math.min(mw - 1, Math.round(nx * mw)))
  const cy = Math.max(0, Math.min(mh - 1, Math.round(ny * mh)))

  // Kandidaten (i.d.R. 3 SAM-Masken) nach Score sortieren.
  const order = Array.from({ length: nMasks }, (_, i) => i)
    .sort((a, b) => (scores[b] || 0) - (scores[a] || 0))

  // Beste Maske wählen, deren aufbereitete Fläche plausibel ist (nicht winzig,
  // nicht „halbes Bild"). So werden über-segmentierte Riesen-Masken verworfen.
  let chosen = null
  let fallback = null
  for (const mi of order) {
    const cleaned = cleanMask(mdata, mi * N, mw, mh, cx, cy)
    const frac = cleaned.area / N
    if (!fallback) fallback = { cleaned, frac, score: scores[mi] || 0 }
    if (frac >= 0.0008 && frac <= 0.8) { chosen = { cleaned, frac, score: scores[mi] || 0 }; break }
  }
  if (!chosen) chosen = fallback
  if (!chosen || chosen.frac < 0.0003 || chosen.frac > 0.95) return null

  const comp = chosen.cleaned.comp
  const out = document.createElement('canvas')
  out.width = mw; out.height = mh
  const ctx = out.getContext('2d')
  const img = ctx.createImageData(mw, mh)
  const d = img.data
  for (let i = 0; i < N; i++) {
    const j = i * 4
    d[j] = 255; d[j + 1] = 255; d[j + 2] = 255; d[j + 3] = comp[i] ? 255 : 0
  }
  ctx.putImageData(img, 0, 0)

  return { canvas: out, score: chosen.score, W: mw, H: mh }
}

// Maskenaufbereitung: aus einer rohen SAM-Maske (Ebene `plane` in `mdata`)
//   1) nur die ZUSAMMENHÄNGENDE Region am Klickpunkt behalten (entfernt weit
//      entfernte Fehl-Flächen — der Hauptgrund für „Wolken" um das Objekt),
//   2) Löcher im Objekt füllen (solide Auswahl).
// Rückgabe: { comp: Uint8Array(0/1), area }.
function cleanMask(mdata, plane, w, h, cx, cy) {
  const N = w * h
  const raw = new Uint8Array(N)
  for (let i = 0; i < N; i++) raw[i] = mdata[plane + i] ? 1 : 0

  // Startpunkt am Klick; liegt er nicht in der Maske, nächstgelegenen Treffer suchen.
  const idx = (x, y) => y * w + x
  let start = raw[idx(cx, cy)] ? idx(cx, cy) : -1
  if (start < 0) {
    const maxR = Math.round(Math.min(w, h) * 0.12)
    outer:
    for (let r = 2; r <= maxR; r += 2) {
      for (let a = 0; a < 360; a += 12) {
        const x = Math.round(cx + Math.cos(a * Math.PI / 180) * r)
        const y = Math.round(cy + Math.sin(a * Math.PI / 180) * r)
        if (x >= 0 && x < w && y >= 0 && y < h && raw[idx(x, y)]) { start = idx(x, y); break outer }
      }
    }
  }

  // Zusammenhangskomponente (4-Nachbarschaft) ab Startpunkt.
  let comp
  if (start >= 0) {
    comp = new Uint8Array(N)
    const q = new Int32Array(N); let qh = 0, qt = 0
    q[qt++] = start; comp[start] = 1
    while (qh < qt) {
      const p = q[qh++]; const x = p % w, y = (p - x) / w
      if (x > 0)     { const n = p - 1; if (raw[n] && !comp[n]) { comp[n] = 1; q[qt++] = n } }
      if (x < w - 1) { const n = p + 1; if (raw[n] && !comp[n]) { comp[n] = 1; q[qt++] = n } }
      if (y > 0)     { const n = p - w; if (raw[n] && !comp[n]) { comp[n] = 1; q[qt++] = n } }
      if (y < h - 1) { const n = p + w; if (raw[n] && !comp[n]) { comp[n] = 1; q[qt++] = n } }
    }
  } else {
    comp = raw
  }

  // Löcher füllen: Hintergrund von den Rändern fluten; alles Nicht-Erreichte ist Loch.
  const bg = new Uint8Array(N)
  const q2 = new Int32Array(N); let h2 = 0, t2 = 0
  const pushBg = (p) => { if (!comp[p] && !bg[p]) { bg[p] = 1; q2[t2++] = p } }
  for (let x = 0; x < w; x++) { pushBg(idx(x, 0)); pushBg(idx(x, h - 1)) }
  for (let y = 0; y < h; y++) { pushBg(idx(0, y)); pushBg(idx(w - 1, y)) }
  while (h2 < t2) {
    const p = q2[h2++]; const x = p % w, y = (p - x) / w
    if (x > 0)     { const n = p - 1; if (!comp[n] && !bg[n]) { bg[n] = 1; q2[t2++] = n } }
    if (x < w - 1) { const n = p + 1; if (!comp[n] && !bg[n]) { bg[n] = 1; q2[t2++] = n } }
    if (y > 0)     { const n = p - w; if (!comp[n] && !bg[n]) { bg[n] = 1; q2[t2++] = n } }
    if (y < h - 1) { const n = p + w; if (!comp[n] && !bg[n]) { bg[n] = 1; q2[t2++] = n } }
  }
  let area = 0
  for (let i = 0; i < N; i++) { if (!comp[i] && !bg[i]) comp[i] = 1; if (comp[i]) area++ }
  return { comp, area }
}
