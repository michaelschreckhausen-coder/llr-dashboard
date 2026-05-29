// src/lib/imageResize.js
// Pre-Upload Resize via Canvas — verhindert Storage-Service-Hangs bei großen Bildern.
// Plus: viel kleinere Files = schnellerer Upload + kein Server-Side-Image-Transform-Trigger.

/**
 * Skaliert eine Image-File auf max edge-Größe und re-encodiert als JPEG (oder PNG bei transparency).
 * @param {File} file - Original-File aus File-Input
 * @param {number} maxEdge - Maximale Kante (Default 1500px)
 * @param {number} quality - JPEG-Quality 0.0-1.0 (Default 0.85)
 * @returns {Promise<File>} resized File (Type image/jpeg oder image/png)
 */
export async function resizeImageBeforeUpload(file, maxEdge = 1500, quality = 0.85) {
  if (!file || !file.type?.startsWith('image/')) return file
  // Schon klein genug? Skip resize.
  if (file.size < 500 * 1024) return file

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Bild konnte nicht dekodiert werden'))
      img.onload = () => {
        try {
          const { width, height } = img
          const longestEdge = Math.max(width, height)
          if (longestEdge <= maxEdge) {
            resolve(file)
            return
          }
          const scale = maxEdge / longestEdge
          const targetW = Math.round(width * scale)
          const targetH = Math.round(height * scale)
          const canvas = document.createElement('canvas')
          canvas.width = targetW
          canvas.height = targetH
          const ctx = canvas.getContext('2d')
          if (!ctx) { reject(new Error('Canvas-Context nicht verfügbar')); return }
          // White background falls JPEG-output von transparentem PNG
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, targetW, targetH)
          ctx.drawImage(img, 0, 0, targetW, targetH)
          // Bei PNG mit alpha: behalte PNG, sonst JPEG
          const hasAlpha = file.type === 'image/png'
          const outType = hasAlpha ? 'image/png' : 'image/jpeg'
          const ext = hasAlpha ? 'png' : 'jpg'
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error('Canvas-Encoding fehlgeschlagen')); return }
            const newName = file.name.replace(/\.[^.]+$/, '') + '-resized.' + ext
            const newFile = new File([blob], newName, { type: outType })
            resolve(newFile)
          }, outType, hasAlpha ? undefined : quality)
        } catch (e) {
          reject(e)
        }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
