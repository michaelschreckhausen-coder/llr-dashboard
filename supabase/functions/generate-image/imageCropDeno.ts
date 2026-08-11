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


export async function trimUniformBorder(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  try {
    const { Image } = await import('https://deno.land/x/imagescript@1.2.17/mod.ts')
    const img = await Image.decode(bytes)
    const W = img.width, H = img.height
    const bmp: Uint8Array = img.bitmap
    const NEAR = 244
    const white = (i: number) => (bmp[i+3] > 250 && bmp[i] >= NEAR && bmp[i+1] >= NEAR && bmp[i+2] >= NEAR)
    const rowWhite = (y: number) => { let nw = 0; for (let x = 0; x < W; x++) { if (!white((y*W+x)*4)) { if (++nw > W*0.02) return false } } return true }
    const colWhite = (x: number, y0: number, y1: number) => { let nw = 0; const span = (y1-y0+1); for (let y = y0; y <= y1; y++) { if (!white((y*W+x)*4)) { if (++nw > span*0.02) return false } } return true }
    let top = 0, bottom = H-1, left = 0, right = W-1
    while (top < bottom && rowWhite(top)) top++
    while (bottom > top && rowWhite(bottom)) bottom--
    while (left < right && colWhite(left, top, bottom)) left++
    while (right > left && colWhite(right, top, bottom)) right--
    const cw = right-left+1, ch = bottom-top+1
    const trimmedEnough = (cw <= W*0.985 || ch <= H*0.985), notTooMuch = (cw >= W*0.5 && ch >= H*0.5)
    if (!trimmedEnough || !notTooMuch || cw < 8 || ch < 8) return { bytes, mimeType: 'image/png' }
    const cropped = img.crop(left, top, cw, ch)
    return { bytes: await cropped.encode(), mimeType: 'image/png' }
  } catch (_e) { return { bytes, mimeType: 'image/png' } }
}
