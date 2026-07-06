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

  // Beste der (i.d.R. 3) Masken per IoU-Score wählen.
  const scores = outputs.iou_scores?.data || [1]
  let best = 0
  for (let i = 1; i < nMasks && i < scores.length; i++) if (scores[i] > scores[best]) best = i
  const plane = best * mh * mw

  // Maske in ein WxH-Canvas malen (weiß, sonst transparent).
  const out = document.createElement('canvas')
  out.width = mw; out.height = mh
  const ctx = out.getContext('2d')
  const img = ctx.createImageData(mw, mh)
  const d = img.data
  for (let i = 0; i < mh * mw; i++) {
    const on = mdata[plane + i] ? 255 : 0
    const j = i * 4
    d[j] = 255; d[j + 1] = 255; d[j + 2] = 255; d[j + 3] = on
  }
  ctx.putImageData(img, 0, 0)

  return { canvas: out, score: scores[best] || 0, W: mw, H: mh }
}
