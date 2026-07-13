// src/components/PillSelect.jsx
// Einheitliche Einzel-Auswahl-Pille (Icon + Label + Chevron + Popover) — gleiche
// Optik/Schrift wie CompanyMultiSelect & AudienceSelect.
import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

const P = 'var(--wl-primary, #0A6FB0)'

export default function PillSelect({ icon: Icon, value, options = [], onChange = () => {}, placeholder = '', neutral = false, title = '', buttonStyle = {} }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const sel = options.find(o => o.value === value)
  const active = !neutral && value !== '' && value != null
  const label = sel ? sel.label : placeholder

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <button type="button" className="lk-dd-trigger" onClick={() => setOpen(o => !o)} title={title}
        style={{
          display:'inline-flex', alignItems:'center', gap:6, padding:'9px 10px', borderRadius:9, boxSizing:'border-box',
          border:'1.5px solid ' + (active ? P : 'var(--border)'),
          background: active ? 'rgba(10,111,176,0.06)' : 'var(--surface, #fff)',
          color: active ? P : 'var(--text-primary)',
          fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', ...buttonStyle,
        }}>
        {Icon && <Icon size={13} strokeWidth={1.75} style={{ flexShrink:0 }}/>}
        <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', textAlign:'left' }}>{label}</span>
        <ChevronDown size={13} strokeWidth={2} style={{ opacity:0.5, marginLeft:2, flexShrink:0 }}/>
      </button>
      {open && (
        <div style={{ position:'absolute', zIndex:60, top:'calc(100% + 4px)', left:0, minWidth:200, maxHeight:280, overflowY:'auto',
          background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 12px 32px rgba(15,23,42,0.16)', padding:6 }}>
          {options.map(o => (
            <button key={String(o.value)} className="lk-dd-opt" onClick={() => { onChange(o.value); setOpen(false) }}
              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', padding:'7px 9px', borderRadius:7,
                border:'none', background: o.value === value ? 'rgba(10,111,176,0.06)' : 'transparent', cursor:'pointer', fontSize:13, color:'var(--text-primary)', fontFamily:'inherit' }}>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis' }}>{o.label}</span>
              {o.value === value && <Check size={13} strokeWidth={3} color={P}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
