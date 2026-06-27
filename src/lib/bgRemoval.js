// src/lib/bgRemoval.js
// ─────────────────────────────────────────────────────────────────────────────
// Lokales Hintergrund-Entfernen via IMAGE-MATTING (MODNet, Apache-2.0) im Browser.
//
// WICHTIG: Das ist KEIN generatives Modell. Es sagt pro Pixel eine Alpha-Deckkraft
// (0..1) voraus und wir wenden dieses Matte auf die ORIGINAL-Pixel an. Das Motiv
// bleibt damit 1:1 erhalten — genau wie bei Canva/CapCut. (Frühere generative
// Ansätze haben das Bild neu gemalt → Motiv verändert sich. Das ist hier behoben.)
//
// Lizenz: MODNet (Xenova/modnet) = Apache-2.0 → kommerziell nutzbar.
// Datenschutz: Verarbeitung passiert komplett im Browser; das Bild verlässt das
// Gerät nicht. Nur die Modellgewichte werden einmalig vom HF-CDN geladen (gecacht).
// ─────────────────────────────────────────────────────────────────────────────

let _modelPromise = null

async function getModel(onProgress) {
  if (_modelPromise) return _modelPromise
  _modelPromise = (async () => {
    const t = await import('@huggingface/transformers')
    try { t.env.allowLocalModels = false } catch (_e) {}
    const model = await t.AutoModel.from_pretrained('Xenova/modnet', {
      dtype: 'fp32',
      progress_callback: onProgress,
    })
    const processor = await t.AutoProcessor.from_pretrained('Xenova/modnet', {
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

// imgEl: HTMLImageElement | HTMLCanvasElement mit den Originalpixeln.
// Rückgabe: DataURL (PNG) mit ECHTEM Alpha-Kanal (transparenter Hintergrund).
export async function removeBackgroundLocal(imgEl, onProgress) {
  const { t, model, processor } = await getModel(onProgress)
  const W = imgEl.naturalWidth || imgEl.width
  const H = imgEl.naturalHeight || imgEl.height
  if (!W || !H) throw new Error('Bild konnte nicht gelesen werden.')

  // Original in ein Canvas → DataURL → RawImage (CORS-sicher, volle Auflösung)
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = W; srcCanvas.height = H
  srcCanvas.getContext('2d').drawImage(imgEl, 0, 0, W, H)
  const image = await t.RawImage.fromURL(srcCanvas.toDataURL('image/png'))

  // Vorverarbeiten + Alpha-Matte vorhersagen
  const { pixel_values } = await processor(image)
  const { output } = await model({ input: pixel_values })

  // Matte auf Originalgröße bringen (1 Kanal, 0..255)
  const mask = await t.RawImage
    .fromTensor(output[0].mul(255).to('uint8'))
    .resize(W, H)

  // Alpha auf die ORIGINAL-Pixel anwenden
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const octx = out.getContext('2d')
  octx.drawImage(imgEl, 0, 0, W, H)
  const px = octx.getImageData(0, 0, W, H)
  const md = mask.data
  const ch = Math.max(1, Math.round(md.length / (W * H)))   // i.d.R. 1
  for (let i = 0, n = W * H; i < n; i++) {
    px.data[i * 4 + 3] = md[i * ch]
  }
  octx.putImageData(px, 0, 0)
  return out.toDataURL('image/png')
}
