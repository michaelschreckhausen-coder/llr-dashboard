// src/components/CompanyMultiSelect.jsx
// Mehrfachauswahl von Company Brands (nur für Personal-Brand-Kontext).
// Der Autor schreibt in seiner eigenen Stimme als Ambassador für ein oder
// MEHRERE Unternehmen — alle gewählten Company-Kontexte fließen in die Generierung.
import React, { useState, useRef, useEffect } from 'react'
import { Building2, Check, ChevronDown } from 'lucide-react'

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function CompanyMultiSelect({
  companies = [],            // [{id, name, brand_name}]
  value = [],                // [id, ...]
  onChange = () => {},
  label = 'Unternehmen',
  buttonStyle = {},
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
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
      <button type="button" onClick={() => setOpen(o => !o)}
        title="Optional: Du schreibst in deiner Stimme als Ambassador für ein oder mehrere Unternehmen"
        style={{
          display:'inline-flex', alignItems:'center', gap:6, padding:'7px 10px', borderRadius:9,
          border:'1.5px solid ' + (count ? P : 'var(--border)'),
          background: count ? 'rgba(49,90,231,0.06)' : 'var(--surface, #fff)',
          color: count ? P : 'var(--text-primary)', fontSize:12, fontWeight:500,
          cursor:'pointer', fontFamily:'inherit', maxWidth:190, ...buttonStyle,
        }}>
        <Building2 size={13} strokeWidth={1.75}/><span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', textAlign:'left' }}>{btnLabel}</span>
        <ChevronDown size={13} strokeWidth={2} style={{ opacity:0.5, marginLeft:2, flexShrink:0 }}/>
      </button>
      {open && (
        <div style={{
          position:'absolute', zIndex:60, top:'calc(100% + 4px)', left:0, minWidth:220, maxHeight:280, overflowY:'auto',
          background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 12px 32px rgba(15,23,42,0.16)', padding:6,
        }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', padding:'6px 8px 4px' }}>
            Unternehmen (Mehrfachauswahl)
          </div>
          {companies.map(c => {
            const checked = sel.has(c.id)
            return (
              <label key={c.id}
                style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 8px', borderRadius:7, cursor:'pointer', background: checked ? 'rgba(49,90,231,0.06)' : 'transparent' }}
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
