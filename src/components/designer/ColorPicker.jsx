import { useState, useRef, useEffect } from 'react'
import { Pipette } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Canva-artiger Farb-Picker: Volltonfarbe (SV-Feld + Hue + Hex/RGB-Eingabe +
// Pipette + Swatches) und Verlauf (Farbstopps + Richtungs-Stile). Wird überall
// im Designer verwendet (Text/Füllung/Rand/Icon/Hintergrund/Stift).
// Gradient-Objekt-Form: { type:'linear', angle:<Grad>, stops:[[offset,color],...] }
// ─────────────────────────────────────────────────────────────────────────────

const P = 'var(--wl-primary, #0A6FB0)'
const TRANSPARENT_BG = 'linear-gradient(135deg, #fff 43%, #EF4444 44%, #EF4444 56%, #fff 57%)'

const STD_SWATCHES = [
  '#000000', '#475467', '#98A2B3', '#D0D5DD', '#FFFFFF',
  '#B91C1C', '#EF4444', '#F97316', '#F59E0B', '#FACC15',
  '#16A34A', '#22C55E', '#10B981', '#06B6D4', '#3B82F6',
  '#1D4ED8', '#0A6FB0', '#0A6FB0', '#D946EF', '#EC4899',
]

const clamp = (n, a, b) => Math.max(a, Math.min(b, n))

export function toHex(c) {
  if (!c) return '#ffffff'
  if (typeof c === 'string' && c.startsWith('#')) return c.length === 7 ? c : (c.length === 4
    ? '#' + c.slice(1).split('').map(x => x + x).join('') : '#ffffff')
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '')
  if (m) { const h = n => parseInt(n, 10).toString(16).padStart(2, '0'); return '#' + h(m[1]) + h(m[2]) + h(m[3]) }
  return '#ffffff'
}
function hexToRgb(hex) {
  let s = String(hex || '').trim().replace('#', '')
  if (s.length === 3) s = s.split('').map(c => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(s)) return null
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) }
}
function rgbToHex(r, g, b) { const h = n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0'); return '#' + h(r) + h(g) + h(b) }
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360 }
  return { h, s: mx === 0 ? 0 : d / mx, v: mx }
}
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}
// Nimmt #hex (3/6), rgb(r,g,b) oder "r,g,b" und gibt normalisiertes #hex oder null.
function parseColor(str) {
  const t = String(str || '').trim()
  const rgb = hexToRgb(t)
  if (rgb) return rgbToHex(rgb.r, rgb.g, rgb.b)
  const m = t.match(/(\d{1,3})\D+(\d{1,3})\D+(\d{1,3})/)
  if (m && +m[1] <= 255 && +m[2] <= 255 && +m[3] <= 255) return rgbToHex(+m[1], +m[2], +m[3])
  return null
}
// CSS-Gradient für Vorschauen. angle 0 = nach rechts (Osten) → CSS +90°.
export function gradientCss(grad) {
  if (!grad || !Array.isArray(grad.stops) || grad.stops.length < 2) return null
  const stops = grad.stops.map(s => `${s[1]} ${Math.round(s[0] * 100)}%`).join(', ')
  return `linear-gradient(${(grad.angle || 0) + 90}deg, ${stops})`
}

const swLabel = { fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '10px 2px 7px' }
const swGrid = { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7, marginBottom: 2 }

function ColorSwatch({ c, current, onPick }) {
  const on = toHex(current).toLowerCase() === toHex(c).toLowerCase()
  return (
    <button type="button" onClick={() => onPick(c)} title={c}
      style={{ width: 24, height: 24, borderRadius: 6, cursor: 'pointer', background: c,
        border: '1px solid ' + (c.toLowerCase() === '#ffffff' ? 'var(--border,#E9ECF2)' : 'rgba(0,0,0,0.10)'),
        boxShadow: on ? '0 0 0 2px var(--surface,#fff), 0 0 0 4px ' + P : 'none', outline: 'none' }} />
  )
}

// SV-Feld + Hue-Slider + Hex/RGB-Eingabe + Pipette. Lifecycle: onStart (Drag-
// Beginn) → onChange (live) → onEnd (Drag-Ende); diskrete Eingaben: alle drei.
function SolidControls({ hex, onStart, onChange, onEnd }) {
  const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 }
  const cur = rgbToHsv(rgb.r, rgb.g, rgb.b)
  const [hue, setHue] = useState(cur.h)
  const [hexText, setHexText] = useState(toHex(hex).toUpperCase())
  const svRef = useRef(null); const hueRef = useRef(null)
  const eyeSupported = typeof window !== 'undefined' && !!window.EyeDropper

  useEffect(() => {
    const r = hexToRgb(hex) || { r: 255, g: 255, b: 255 }
    const c = rgbToHsv(r.r, r.g, r.b)
    if (c.s > 0.001 && c.v > 0.001) setHue(c.h)
    setHexText(toHex(hex).toUpperCase())
  }, [hex])

  const s = cur.s, v = cur.v
  const emit = (nh, ns, nv) => { const c = hsvToRgb(nh, ns, nv); onChange(rgbToHex(c.r, c.g, c.b)) }

  const dragArea = (ref, onFrac, e) => {
    e.preventDefault(); onStart && onStart()
    const el = ref.current
    const move = ev => { const r = el.getBoundingClientRect(); onFrac(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)) }
    move(e)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onEnd && onEnd() }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const svDown = e => dragArea(svRef, (fx, fy) => emit(hue, fx, 1 - fy), e)
  const hueDown = e => dragArea(hueRef, fx => { const nh = fx * 360; setHue(nh); emit(nh, s, v) }, e)
  const commitHex = () => { const h = parseColor(hexText); if (h) { onStart && onStart(); onChange(h); onEnd && onEnd(); setHexText(h.toUpperCase()) } else setHexText(toHex(hex).toUpperCase()) }
  const pickEye = async () => { try { const r = await new window.EyeDropper().open(); if (r && r.sRGBHex) { onStart && onStart(); onChange(r.sRGBHex); onEnd && onEnd() } } catch (_e) {} }

  return (
    <div>
      <div ref={svRef} onPointerDown={svDown}
        style={{ position: 'relative', width: '100%', height: 130, borderRadius: 8, cursor: 'crosshair', touchAction: 'none',
          background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hue},100%,50%))` }}>
        <div style={{ position: 'absolute', left: `${s * 100}%`, top: `${(1 - v) * 100}%`, width: 14, height: 14, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.35)', pointerEvents: 'none' }} />
      </div>
      <div ref={hueRef} onPointerDown={hueDown}
        style={{ position: 'relative', height: 12, borderRadius: 6, marginTop: 11, cursor: 'pointer', touchAction: 'none',
          background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)' }}>
        <div style={{ position: 'absolute', left: `${(hue / 360) * 100}%`, top: '50%', width: 14, height: 14, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.35)', background: `hsl(${hue},100%,50%)`, pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 11, alignItems: 'center' }}>
        <span style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: toHex(hex), border: '1px solid var(--border,#E9ECF2)' }} />
        <input value={hexText} onChange={e => setHexText(e.target.value)} onBlur={commitHex}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitHex() } }} spellCheck={false}
          placeholder="#RRGGBB oder R,G,B"
          style={{ flex: 1, minWidth: 0, height: 30, padding: '0 9px', borderRadius: 7, border: '1px solid var(--border,#E9ECF2)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', color: 'var(--text-primary)', textTransform: 'uppercase' }} />
        {eyeSupported && (
          <button type="button" onClick={pickEye} title="Pipette – Farbe vom Bildschirm aufnehmen"
            style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 7, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted,#475467)' }}>
            <Pipette size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  )
}

// Verlauf: Farbstopps (auswählbar/löschbar) + aktive Stopp-Farbe via SolidControls
// + Richtungs-Stile. Emit über onGradient({type,angle,stops}).
function GradientControls({ gradient, cur, onStart, onEnd, onGradient, brandColors }) {
  const init = (gradient && Array.isArray(gradient.stops) && gradient.stops.length >= 2)
    ? gradient
    : { type: 'linear', angle: 0, stops: [[0, toHex(cur)], [1, toHex(cur).toLowerCase() === '#ffffff' ? '#6B7280' : '#FFFFFF']] }
  const [stops, setStops] = useState(init.stops.map(s => [s[0], s[1]]))
  const [angle, setAngle] = useState(init.angle || 0)
  const [sel, setSel] = useState(0)
  const emit = (ns, na) => onGradient({ type: 'linear', angle: na, stops: ns.map(s => [s[0], s[1]]) })
  const cssBar = (ns, na) => `linear-gradient(${(na) + 90}deg, ${ns.map(s => `${s[1]} ${Math.round(s[0] * 100)}%`).join(', ')})`

  const setStopColor = (i, c) => { const ns = stops.map((s, idx) => idx === i ? [s[0], c] : s); setStops(ns); emit(ns, angle) }
  const addStop = () => { const ns = [...stops, [0.5, '#888888']].sort((a, b) => a[0] - b[0]); setStops(ns); setSel(ns.findIndex(s => s[0] === 0.5)); onStart && onStart(); emit(ns, angle); onEnd && onEnd() }
  const removeStop = i => { if (stops.length <= 2) return; const ns = stops.filter((_, idx) => idx !== i); setStops(ns); setSel(0); onStart && onStart(); emit(ns, angle); onEnd && onEnd() }
  const setAng = a => { setAngle(a); onStart && onStart(); emit(stops, a); onEnd && onEnd() }
  const presets = [0, 45, 90, 135, 180]

  return (
    <div>
      <div style={{ height: 40, borderRadius: 8, background: cssBar(stops, angle), border: '1px solid var(--border,#E9ECF2)' }} />
      <div style={swLabel}>Verlaufsfarben</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {stops.map((s, i) => (
          <button key={i} onClick={() => setSel(i)} onDoubleClick={() => removeStop(i)}
            title={stops.length > 2 ? 'Klick: auswählen · Doppelklick: entfernen' : 'auswählen'}
            style={{ width: 26, height: 26, borderRadius: '50%', background: s[1], cursor: 'pointer', padding: 0,
              border: '2px solid ' + (sel === i ? P : 'rgba(0,0,0,0.14)'), boxShadow: sel === i ? '0 0 0 2px var(--surface,#fff)' : 'none' }} />
        ))}
        <button onClick={addStop} title="Farbe hinzufügen"
          style={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', border: '1px dashed var(--text-muted,#98A2B3)', padding: 0, position: 'relative', background: 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}>
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16, textShadow: '0 0 2px rgba(0,0,0,0.55)' }}>+</span>
        </button>
      </div>
      <div style={{ marginTop: 11 }}>
        <SolidControls hex={stops[sel] ? stops[sel][1] : '#ffffff'} onStart={onStart} onChange={c => setStopColor(sel, c)} onEnd={onEnd} />
      </div>
      {brandColors && brandColors.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
          {brandColors.slice(0, 10).map((c, i) => <ColorSwatch key={'gb' + i} c={c} current={stops[sel] ? stops[sel][1] : ''} onPick={col => setStopColor(sel, col)} />)}
        </div>
      )}
      <div style={swLabel}>Stile</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {presets.map(a => (
          <button key={a} onClick={() => setAng(a)} title={a + '°'}
            style={{ width: 46, height: 34, borderRadius: 8, cursor: 'pointer', padding: 0, border: '2px solid ' + (angle === a ? P : 'var(--border,#E9ECF2)'), background: cssBar(stops, a) }} />
        ))}
      </div>
    </div>
  )
}

export function ColorPopover({ value, gradient = null, onChange, onGradient, onStart, onEnd, brandColors = [], title = 'Farbe', size = 30, triggerContent = null, triggerStyle = null, round = false, allowNone = false, allowGradient = false }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const [tab, setTab] = useState(gradient ? 'grad' : 'solid')
  const ref = useRef(null); const btnRef = useRef(null)
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const toggle = () => {
    const willOpen = !open
    if (willOpen) {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect()
        const W = 236, H = 432
        let left = r.left
        if (left + W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - W)
        let top = r.bottom + 8
        if (top + H > window.innerHeight - 8) top = Math.max(8, r.top - H - 8)
        setPos({ top, left })
      }
      setTab(gradient ? 'grad' : 'solid')
    }
    setOpen(willOpen)
  }
  const cur = toHex(value || '#ffffff')
  const gradActive = allowGradient && !!gradient
  const solidChange = hex => { onChange && onChange(hex); if (allowGradient && gradient && onGradient) onGradient(null) }
  const pickSwatch = c => { onStart && onStart(); solidChange(c); onEnd && onEnd() }
  const triggerBg = gradActive ? gradientCss(gradient) : ((allowNone && (value === 'transparent' || !value)) ? TRANSPARENT_BG : cur)
  const tabBtn = (id, label) => (
    <button type="button" onClick={() => setTab(id)}
      style={{ flex: 1, height: 30, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
        color: tab === id ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: '2px solid ' + (tab === id ? P : 'transparent') }}>{label}</button>
  )

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {triggerContent ? (
        <button ref={btnRef} type="button" title={title} onClick={toggle} style={triggerStyle || { height: 32, padding: '0 6px', borderRadius: 8, border: '1px solid var(--border,#E9ECF2)', background: 'var(--surface,#fff)', cursor: 'pointer' }}>
          {triggerContent}
        </button>
      ) : (
        <button ref={btnRef} type="button" title={title} onClick={toggle}
          style={{ width: size, height: size, borderRadius: round ? '50%' : 8, border: '1px solid var(--border,#E9ECF2)', cursor: 'pointer', padding: 0, boxShadow: 'inset 0 0 0 2px var(--surface,#fff)', background: triggerBg }} />
      )}
      {open && pos && (
        <div style={{ position: 'fixed', zIndex: 4000, top: pos.top, left: pos.left, width: 236, maxHeight: 'min(432px, calc(100vh - 16px))', overflowY: 'auto', background: 'var(--surface,#fff)', border: '1px solid var(--border,#E9ECF2)', borderRadius: 12, boxShadow: '0 16px 44px rgba(16,24,40,0.20)', padding: 12 }}>
          {allowGradient && (
            <div style={{ display: 'flex', marginBottom: 10, borderBottom: '1px solid var(--border,#EEF1F5)' }}>
              {tabBtn('solid', 'Volltonfarbe')}{tabBtn('grad', 'Verlauf')}
            </div>
          )}
          {tab === 'solid' ? (
            <>
              <SolidControls hex={cur} onStart={onStart} onChange={solidChange} onEnd={onEnd} />
              {brandColors.length > 0 && (<><div style={swLabel}>Markenfarben</div><div style={swGrid}>{brandColors.map((c, i) => <ColorSwatch key={'b' + i} c={c} current={cur} onPick={pickSwatch} />)}</div></>)}
              <div style={swLabel}>Standardfarben</div>
              <div style={swGrid}>{STD_SWATCHES.map((c, i) => <ColorSwatch key={i} c={c} current={cur} onPick={pickSwatch} />)}</div>
              {allowNone && (
                <button type="button" onClick={() => pickSwatch('transparent')}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 9, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                    border: '1px solid ' + ((value === 'transparent' || !value) ? P : 'var(--border,#E9ECF2)'), background: (value === 'transparent' || !value) ? 'rgba(10,111,176,0.06)' : 'var(--surface,#fff)', color: 'var(--text-primary)' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: '1px solid var(--border,#E9ECF2)', background: TRANSPARENT_BG }} />
                  Keine Füllung
                </button>
              )}
            </>
          ) : (
            <GradientControls gradient={gradient} cur={cur} onStart={onStart} onEnd={onEnd} brandColors={brandColors}
              onGradient={g => { onStart && onStart(); onGradient && onGradient(g); onEnd && onEnd() }} />
          )}
        </div>
      )}
    </div>
  )
}
