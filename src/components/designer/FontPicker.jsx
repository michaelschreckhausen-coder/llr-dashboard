import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Search, Check, ChevronDown, X } from 'lucide-react'
import {
  GOOGLE_FONTS, FEATURED_FONTS, SYSTEM_FONTS, CAT_LABEL,
  fontsInCategory, loadFontPreview,
} from '../../lib/googleFonts'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'
const ROW = 38
const LIST_H = 344

const ALL_FAMILIES = GOOGLE_FONTS.map(x => x.family)

function dedupe(arr) {
  const seen = new Set(); const out = []
  for (const f of arr) { const k = (f || '').toLowerCase(); if (!f || seen.has(k)) continue; seen.add(k); out.push(f) }
  return out
}

// Einzelne Vorschau-Zeile: lädt die Schrift (nur Namens-Zeichen) und zeigt den
// Namen dann in seiner eigenen Schrift.
function FontRow({ family, top, active, onPick }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    loadFontPreview(family).then(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [family])
  return (
    <button type="button" onClick={() => onPick(family)} title={family}
      style={{
        position: 'absolute', top, left: 6, right: 6, height: ROW - 4,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '0 12px', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
        background: active ? 'rgba(49,90,231,0.09)' : 'transparent',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-hover,#F4F6FA)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      <span style={{
        fontFamily: ready ? `"${family}", sans-serif` : 'inherit',
        fontSize: 17, lineHeight: 1, color: 'var(--text-primary,#111827)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{family}</span>
      {active && <Check size={15} strokeWidth={2.5} style={{ color: PRIMARY, flexShrink: 0 }} />}
    </button>
  )
}

export default function FontPicker({ value, onPick, brandFonts = [] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('featured')
  const [scrollTop, setScrollTop] = useState(0)
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const listRef = useRef(null)

  const current = value || 'Inter'
  useEffect(() => { loadFontPreview(current) }, [current])

  const chips = useMemo(() => {
    const c = [['featured', 'Empfohlen']]
    if (brandFonts.length) c.push(['brand', 'Marke'])
    c.push(['s', 'Sans'], ['r', 'Serif'], ['d', 'Display'], ['h', 'Handschrift'], ['m', 'Mono'])
    return c
  }, [brandFonts])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      const pool = [...brandFonts, ...SYSTEM_FONTS, ...ALL_FAMILIES]
      return dedupe(pool).filter(f => f.toLowerCase().includes(q))
    }
    if (cat === 'brand') return dedupe(brandFonts)
    if (cat === 'featured') return dedupe([...brandFonts, ...SYSTEM_FONTS, ...FEATURED_FONTS])
    return fontsInCategory(cat)
  }, [query, cat, brandFonts])

  const openPanel = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const w = 300
      let left = r.left
      if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w
      let top = r.bottom + 6
      if (top + LIST_H + 96 > window.innerHeight - 8) top = Math.max(8, r.top - LIST_H - 96)
      setPos({ top, left: Math.max(8, left) })
    }
    setQuery(''); setCat('featured'); setScrollTop(0); setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const pick = useCallback((family) => { onPick && onPick(family); setOpen(false) }, [onPick])

  // Virtualisierung
  const total = items.length
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW) - 5)
  const endIdx = Math.min(total, Math.ceil((scrollTop + LIST_H) / ROW) + 5)
  const slice = []
  for (let i = startIdx; i < endIdx; i++) slice.push(items[i])

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : openPanel())} title="Schriftart"
        style={{
          height: 32, minWidth: 116, maxWidth: 150, flexShrink: 0, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '0 9px',
          borderRadius: 9, border: '1px solid var(--border,#E9ECF2)', background: '#fff',
          cursor: 'pointer', color: 'var(--text-primary)', fontSize: 12.5,
        }}>
        <span style={{ fontFamily: `"${current}", sans-serif`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current}</span>
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
      </button>

      {open && pos && (
        <div ref={panelRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, width: 300, zIndex: 4000,
          background: '#fff', border: '1px solid var(--border,#E9ECF2)', borderRadius: 12,
          boxShadow: '0 12px 40px rgba(16,24,40,0.18)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Suche */}
          <div style={{ padding: 10, borderBottom: '1px solid var(--border,#EEF1F5)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 9, opacity: 0.5 }} />
              <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setScrollTop(0); if (listRef.current) listRef.current.scrollTop = 0 }}
                placeholder="Schriftart suchen…"
                style={{
                  width: '100%', height: 32, padding: '0 30px 0 30px', boxSizing: 'border-box',
                  borderRadius: 8, border: '1px solid var(--border,#E9ECF2)', fontSize: 13,
                  fontFamily: 'inherit', outline: 'none', color: 'var(--text-primary)',
                }} />
              {query && <button type="button" onClick={() => { setQuery(''); if (listRef.current) listRef.current.scrollTop = 0 }}
                style={{ position: 'absolute', right: 6, top: 6, width: 20, height: 20, border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.5 }}><X size={13} /></button>}
            </div>
          </div>

          {/* Kategorie-Chips */}
          {!query && (
            <div style={{ display: 'flex', gap: 5, padding: '8px 10px', overflowX: 'auto', borderBottom: '1px solid var(--border,#EEF1F5)', flexShrink: 0 }}>
              {chips.map(([id, label]) => (
                <button key={id} type="button" onClick={() => { setCat(id); setScrollTop(0); if (listRef.current) listRef.current.scrollTop = 0 }}
                  style={{
                    flexShrink: 0, height: 26, padding: '0 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
                    border: '1px solid ' + (cat === id ? 'transparent' : 'var(--border,#E9ECF2)'),
                    background: cat === id ? PRIMARY : '#fff', color: cat === id ? '#fff' : 'var(--text-secondary,#475467)',
                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}>{label}</button>
              ))}
            </div>
          )}

          {/* Liste (virtualisiert) */}
          <div ref={listRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
            style={{ height: LIST_H, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
            {total === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted,#98A2B3)', fontSize: 13 }}>Keine Schriftart gefunden.</div>
            ) : (
              <div style={{ height: total * ROW, position: 'relative' }}>
                {slice.map((family, i) => (
                  <FontRow key={family} family={family} top={(startIdx + i) * ROW}
                    active={family === current} onPick={pick} />
                ))}
              </div>
            )}
          </div>

          {/* Fuß: Anzahl */}
          <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border,#EEF1F5)', fontSize: 11, color: 'var(--text-muted,#98A2B3)', flexShrink: 0 }}>
            {query ? `${total} Treffer` : (cat === 'featured' ? 'Empfohlen · über 1500 Schriften per Suche/Kategorie' : `${total} Schriften`)}
          </div>
        </div>
      )}
    </>
  )
}
