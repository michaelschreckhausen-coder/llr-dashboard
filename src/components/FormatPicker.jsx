import { useEffect, useRef, useState } from 'react'
import { Music2, Ratio, Maximize2, ChevronDown, Check } from 'lucide-react'
import { FORMAT_CATEGORIES, freeformPreset } from '../lib/formatPresets'

// Brand-Glyphs sind in lucide-react@1.17 nicht (mehr) enthalten → lokale Inline-SVGs
// (House-Konvention: IcXxx-Inline-SVG fuer fehlende Brand-Icons, currentColor).
const BrandSvg = ({ size = 16, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{children}</svg>
)
const IcLinkedin = (p) => <BrandSvg {...p}><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3V9zm6 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.3-.02-2.96-1.8-2.96-1.8 0-2.08 1.4-2.08 2.86V21H9V9z"/></BrandSvg>
const IcFacebook = (p) => <BrandSvg {...p}><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/></BrandSvg>
const IcX = (p) => <BrandSvg {...p}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></BrandSvg>
const IcYoutube = (p) => <BrandSvg {...p}><path d="M23.5 6.2a3 3 0 0 0-2.11-2.13C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.39.52A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.11 2.13c1.89.52 9.39.52 9.39.52s7.5 0 9.39-.52a3 3 0 0 0 2.11-2.13A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"/></BrandSvg>
const IcInstagram = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/>
  </svg>
)

const ICONS = { Linkedin: IcLinkedin, Instagram: IcInstagram, Facebook: IcFacebook, Twitter: IcX, Youtube: IcYoutube, Music2, Ratio }

function RatioThumb({ w, h, active }) {
  const maxBox = 26
  const r = w / h
  const tw = r >= 1 ? maxBox : Math.round(maxBox * r)
  const th = r >= 1 ? Math.round(maxBox / r) : maxBox
  return (
    <span style={{ width: maxBox, height: maxBox, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{
        width: tw, height: th, borderRadius: 3,
        border: `1.5px solid ${active ? 'var(--wl-primary, rgb(49,90,231))' : 'var(--border, #D7DCE5)'}`,
        background: active ? 'var(--wl-primary, rgb(49,90,231))' : 'transparent', opacity: active ? 0.18 : 1,
      }} />
    </span>
  )
}

export default function FormatPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [cat, setCat] = useState('linkedin')
  const [freeW, setFreeW] = useState(value?.id === 'free' ? value.w : 1080)
  const [freeH, setFreeH] = useState(value?.id === 'free' ? value.h : 1080)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [open])

  const pick = (preset) => { onChange?.(preset); setOpen(false) }
  const applyFree = () => pick(freeformPreset(freeW, freeH))

  const activeCat = FORMAT_CATEGORIES.find((c) => c.key === cat)
  const valLabel = value ? `${value.label}${value.w ? `  ·  ${value.w}×${value.h}` : ''}` : 'Format wählen'

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 11px',
          borderRadius: 9, border: '1.5px solid var(--border, #D7DCE5)', background: 'var(--surface, #FFFFFF)',
          color: 'var(--text-primary, #1B2333)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', maxWidth: 320,
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valLabel}</span>
        <ChevronDown size={14} strokeWidth={2} style={{ opacity: 0.5, marginLeft: 2, flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 60, width: 460, display: 'flex',
          borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border, #D7DCE5)',
          background: 'var(--surface, #FFFFFF)', boxShadow: '0 12px 32px rgba(15,23,42,0.16)',
        }}>
          <div style={{ width: 158, padding: 6, background: 'var(--page-bg, #F2F4F8)', borderRight: '1px solid var(--border, #D7DCE5)' }}>
            {FORMAT_CATEGORIES.map((c) => {
              const Ic = ICONS[c.icon] || Ratio
              const on = c.key === cat
              return (
                <button key={c.key} type="button" onClick={() => setCat(c.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 34, padding: '0 10px',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, textAlign: 'left',
                    background: on ? 'var(--surface, #FFFFFF)' : 'transparent',
                    color: on ? 'var(--text-primary, #1B2333)' : 'var(--text-muted, #6B7686)',
                    fontWeight: on ? 600 : 500, boxShadow: on ? '0 1px 3px rgba(16,24,40,0.10)' : 'none',
                  }}>
                  <Ic size={16} /> {c.label}
                </button>
              )
            })}
            <button type="button" onClick={() => setCat('free')}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 34, padding: '0 10px',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, textAlign: 'left',
                background: cat === 'free' ? 'var(--surface, #FFFFFF)' : 'transparent',
                color: cat === 'free' ? 'var(--text-primary, #1B2333)' : 'var(--text-muted, #6B7686)',
                fontWeight: cat === 'free' ? 600 : 500, boxShadow: cat === 'free' ? '0 1px 3px rgba(16,24,40,0.10)' : 'none',
              }}>
              <Maximize2 size={16} /> Freiformat
            </button>
          </div>

          <div style={{ flex: 1, padding: 8, maxHeight: 360, overflowY: 'auto' }}>
            {cat === 'free' ? (
              <div style={{ padding: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #6B7686)', marginBottom: 10 }}>
                  Eigene Maße in Pixel. Die KI generiert im nächstliegenden Verhältnis, danach wird exakt zugeschnitten.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted, #6B7686)' }}>
                    Breite
                    <input type="number" min={1} value={freeW} onChange={(e) => setFreeW(e.target.value)}
                      style={{ display: 'block', width: 92, height: 34, marginTop: 4, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border, #D7DCE5)', background: 'var(--surface, #FFFFFF)', color: 'var(--text-primary, #1B2333)' }} />
                  </label>
                  <span style={{ paddingBottom: 8, color: 'var(--text-muted, #6B7686)' }}>×</span>
                  <label style={{ fontSize: 12, color: 'var(--text-muted, #6B7686)' }}>
                    Höhe
                    <input type="number" min={1} value={freeH} onChange={(e) => setFreeH(e.target.value)}
                      style={{ display: 'block', width: 92, height: 34, marginTop: 4, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border, #D7DCE5)', background: 'var(--surface, #FFFFFF)', color: 'var(--text-primary, #1B2333)' }} />
                  </label>
                </div>
                <button type="button" onClick={applyFree}
                  style={{ marginTop: 14, height: 36, padding: '0 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', background: 'var(--wl-primary, rgb(49,90,231))' }}>
                  Übernehmen
                </button>
              </div>
            ) : (
              activeCat?.presets.map((p) => {
                const on = value?.id === p.id
                return (
                  <button key={p.id} type="button" onClick={() => pick(p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, width: '100%', minHeight: 42, padding: '6px 10px',
                      border: 'none', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                      background: on ? 'color-mix(in srgb, var(--wl-primary, rgb(49,90,231)) 8%, transparent)' : 'transparent',
                    }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--page-bg, #F2F4F8)' }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                    <RatioThumb w={p.w} h={p.h} active={on} />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, color: 'var(--text-primary, #1B2333)', fontWeight: on ? 600 : 500 }}>{p.label}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted, #6B7686)' }}>{p.w}×{p.h} px · {p.ratio}</span>
                    </span>
                    {on && <Check size={16} style={{ color: 'var(--wl-primary, rgb(49,90,231))' }} />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
