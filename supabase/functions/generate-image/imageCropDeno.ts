// imageCropDeno.ts — server-seitiger cover-fit Center-Crop auf exakte Ziel-px.
// imagescript wird LAZY (dynamic import im try) geladen, damit ein nicht
// ladbarer Dep NIEMALS die generate-image-EF beim Start killt. Schlimmster Fall:
// Bild ungecroppt zurueck — nie ein EF-Load-Fehler.

export async function coverCropToSize(
  bytes: Uint8Array, targetW: number, targetH: number,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  try {
    const { Image } = await import('https://deno.land/x/imagescript@1.2.17/mod.ts')
    const tW = Math.max(1, Math.round(targetW))
    const tH = Math.max(1, Math.round(targetH))
    const img = await Image.decode(bytes)
    if (img.width === tW && img.height === tH) return { bytes, mimeType: 'image/png' }

    const scale = Math.max(tW / img.width, tH / img.height) // cover
    const rW = Math.max(tW, Math.round(img.width * scale))
    const rH = Math.max(tH, Math.round(img.height * scale))
    const resized = img.resize(rW, rH)                 // return-value nutzen (mutate/new egal)
    const x = Math.floor((rW - tW) / 2)
    const y = Math.floor((rH - tH) / 2)
    const cropped = resized.crop(x, y, tW, tH)
    const out = await cropped.encode()                 // PNG
    return { bytes: out, mimeType: 'image/png' }
  } catch (_e) {
    return { bytes, mimeType: 'image/png' }            // Decode/Dep-Fehler -> Original durchreichen
  }
}
