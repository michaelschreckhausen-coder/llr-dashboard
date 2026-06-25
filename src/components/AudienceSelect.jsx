// src/components/AudienceSelect.jsx
// Einzel-Auswahl "Für Zielgruppe" als Button+Popover — gleiche Pille/Innenabstand
// wie CompanyMultiSelect & Web-Suche (natives <select> orientiert sich sonst an
// der längsten Option und wird dadurch unnötig breit).
import React, { useState, useRef, useEffect } from 'react'
import { Target, Check, ChevronDown } from 'lucide-react'

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function AudienceSelect({ audiences = [], value = '', onChange = () => {}, label = 'Zielgruppe', buttonStyle = {}, iconOnly = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const sel = audiences.find(a => a.id === value)
  const active = !!value
  const btnLabel = sel ? sel.name : label

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)} title={sel ? `Zielgruppe: ${sel.name}` : 'Zielgruppe für die Generierung'}
        style={iconOnly ? {
          display:'inline-flex', alignItems:'center', justifyContent:'center', width:34, height:34, borderRadius:9, boxSizing:'border-box',
          border:'1.5px solid ' + (active ? P : 'var(--border)'),
          background: active ? 'rgba(49,90,231,0.06)' : '#fff',
          color: active ? P : 'var(--text-primary)', cursor:'pointer', fontFamily:'inherit', flexShrink:0, ...buttonStyle,
        } : {
          display:'inline-flex', alignItems:'center', gap:6, height:34, padding:'0 12px', borderRadius:9, boxSizing:'border-box',
          border:'1.5px solid ' + (active ? P : 'var(--border)'),
          background: active ? 'rgba(49,90,231,0.06)' : '#fff',
          color: active ? P : 'var(--text-primary)',
          fontSize:12.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', maxWidth:190, ...buttonStyle,
        }}>
        <Target size={iconOnly ? 16 : 13} strokeWidth={1.75}/>
        {!iconOnly && <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', textAlign:'left' }}>{btnLabel}</span>}
        {!iconOnly && <ChevronDown size={13} strokeWidth={2} style={{ opacity:0.5, marginLeft:2, flexShrink:0 }}/>}
      </button>
      {open && (
        <div style={{ position:'absolute', zIndex:60, bottom:'calc(100% + 6px)', left:0, minWidth:220, maxHeight:280, overflowY:'auto',
          background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 12px 32px rgba(15,23,42,0.16)', padding:6 }}>
          <button onClick={() => { onChange(''); setOpen(false) }} style={item(!value)}>Keine Zielgruppe</button>
          {audiences.filter(a => a.kind !== 'strike2').map(a => (
            <button key={a.id} onClick={() => { onChange(a.id); setOpen(false) }} style={item(a.id === value)}>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis' }}>{a.name}</span>
              {a.id === value && <Check size={13} strokeWidth={3} color={P}/>}
            </button>
          ))}
          {audiences.some(a => a.kind === 'strike2') && (
            <>
              <div style={{ height:1, background:'var(--border)', margin:'5px 4px' }}/>
              <div style={{ padding:'4px 9px 5px', fontSize:9.5, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'#C2410C' }}>Strike2 Zielgruppen</div>
              {audiences.filter(a => a.kind === 'strike2').map(a => (
                <button key={a.id} onClick={() => { onChange(a.id); setOpen(false) }} style={item(a.id === value)}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:'#F97316', flexShrink:0 }}/>
                  <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis' }}>{a.name}</span>
                  {a.id === value && <Check size={13} strokeWidth={3} color={P}/>}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function item(active) {
  return { display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', padding:'7px 9px', borderRadius:7,
    border:'none', background: active ? 'rgba(49,90,231,0.06)' : 'transparent', cursor:'pointer', fontSize:13, color:'var(--text-primary)', fontFamily:'inherit' }
}
