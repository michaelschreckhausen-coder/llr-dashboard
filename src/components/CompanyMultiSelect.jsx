// src/components/CompanyMultiSelect.jsx
// Mehrfachauswahl von Company Brands (nur für Personal-Brand-Kontext).
// Der Autor schreibt in seiner eigenen Stimme als Ambassador für ein oder
// MEHRERE Unternehmen — alle gewählten Company-Kontexte fließen in die Generierung.
import React, { useState, useRef, useEffect } from 'react'
import { Building2, Check, ChevronDown } from 'lucide-react'

const P = 'var(--wl-primary, #0A6FB0)'

export default function CompanyMultiSelect({
  companies = [],            // [{id, name, brand_name}]
  value = [],                // [id, ...]
  onChange = () => {},
  label = 'Unternehmen',
  buttonStyle = {},
  iconOnly = false,
}) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [coords, setCoords] = useState(null)
  const ref = useRef(null)
  const btnRef = useRef(null)
  // Menü fixed positionieren (escaped Modal-/Aside-overflow, das sonst abschneidet).
  // Richtung automatisch: unter dem Button, außer es ist unten zu wenig Platz.
  const openMenu = () => {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) {
        const menuH = Math.min(300, 44 + companies.length * 40)
        const spaceBelow = window.innerHeight - r.bottom
        const dropUp = spaceBelow < menuH + 12 && r.top > spaceBelow
        setCoords({
          left: Math.max(8, Math.min(r.left, window.innerWidth - 240)),
          width: Math.max(220, r.width),
          ...(dropUp ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
        })
      }
    }
    setOpen(o => !o)
  }
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!companies.length) return null
  const sel = new Set(value || [])
  const count = sel.size
  const toggle = (id) => {
    const next = new Set(sel)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange([...next])
  }
  const nameOf = (v) => v.brand_name || v.name || 'Unternehmen'
  const btnLabel = count === 0 ? label : count === 1 ? nameOf(companies.find(c => c.id === [...sel][0]) || {}) : `${count} Unternehmen`

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <button ref={btnRef} type="button" onClick={openMenu}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onMouseDown={() => setHover(false)}
        title={iconOnly ? undefined : (count ? `Unternehmen: ${btnLabel}` : 'Optional: Du schreibst in deiner Stimme als Ambassador für ein oder mehrere Unternehmen')}
        style={iconOnly ? {
          display:'inline-flex', alignItems:'center', justifyContent:'center', width:34, height:34, borderRadius:9, boxSizing:'border-box',
          border:'1.5px solid ' + (count ? P : 'var(--border)'),
          background: count ? 'rgba(10,111,176,0.06)' : 'var(--surface, #fff)',
          color: count ? P : 'var(--text-primary)', cursor:'pointer', fontFamily:'inherit', flexShrink:0, position:'relative', ...buttonStyle,
        } : {
          display:'inline-flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:10, minHeight:40, boxSizing:'border-box',
          border:'1.5px solid var(--border)', background:'var(--surface, #fff)',
          color:'var(--text-primary)', fontSize:13, fontWeight:400,
          cursor:'pointer', fontFamily:'inherit', ...buttonStyle,
        }}>
        {iconOnly && <Building2 size={16} strokeWidth={1.75}/>}
        {!iconOnly && <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'left', fontSize:13 }}>{btnLabel}</span>}
        {!iconOnly && <ChevronDown size={13} strokeWidth={2} style={{ opacity:0.5, marginLeft:2, flexShrink:0 }}/>}
        {iconOnly && count > 1 && <span style={{ position:'absolute', top:-5, right:-5, minWidth:15, height:15, padding:'0 3px', borderRadius:8, background:P, color:'#fff', fontSize:9, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>{count}</span>}
      </button>
      {iconOnly && hover && !open && (
        <span style={{ position:'absolute', bottom:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)', zIndex:200, background:'#101828', color:'#fff', fontSize:11, fontWeight:600, lineHeight:1.2, padding:'4px 8px', borderRadius:6, whiteSpace:'nowrap', pointerEvents:'none', boxShadow:'0 4px 12px rgba(16,24,40,0.25)' }}>{count ? btnLabel : 'Unternehmen'}</span>
      )}
      {open && coords && (
        <div style={{
          position:'fixed', zIndex:1000, left: coords.left, width: coords.width,
          ...(coords.top != null ? { top: coords.top } : { bottom: coords.bottom }),
          minWidth:220, maxHeight:300, overflowY:'auto',
          background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 12px 32px rgba(15,23,42,0.16)', padding:6,
        }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', padding:'6px 8px 4px' }}>
            Unternehmen (Mehrfachauswahl)
          </div>
          {companies.map(c => {
            const checked = sel.has(c.id)
            return (
              <label key={c.id}
                style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 8px', borderRadius:7, cursor:'pointer', background: checked ? 'rgba(10,111,176,0.06)' : 'transparent' }}
                onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}>
                <span style={{
                  width:16, height:16, borderRadius:5, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                  border:'1.5px solid ' + (checked ? P : 'var(--border)'), background: checked ? P : '#fff',
                }}>{checked && <Check size={11} strokeWidth={3} color="#fff"/>}</span>
                <span style={{ fontSize:13, color:'var(--text-primary)' }}>{nameOf(c)}</span>
                <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} style={{ display:'none' }}/>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
