// src/components/PillSelect.jsx
// Einheitliche Einzel-Auswahl-Pille (Icon + Label + Chevron + Popover) — gleiche
// Optik/Schrift wie CompanyMultiSelect & AudienceSelect.
//
// Das Popover wird per createPortal an document.body gerendert (position:fixed),
// damit es NICHT von Karten-Containern mit overflow:hidden (z.B. SectionCard)
// abgeschnitten wird. Position wird aus der Trigger-BoundingClientRect berechnet,
// klappt bei Platzmangel nach oben und folgt Scroll/Resize.
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

const P = 'var(--wl-primary, #0A6FB0)'

export default function PillSelect({ icon: Icon, value, options = [], onChange = () => {}, placeholder = '', neutral = false, title = '', buttonStyle = {}, disabled = false }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null) // { left, top, minWidth } in Viewport-Koordinaten (position:fixed)

  // Menü relativ zum Trigger positionieren; nach oben flippen, wenn unten kein Platz ist.
  const reposition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    // Gemessene Menühöhe bevorzugen (bereits gerendert), sonst schätzen (~38px/Option, gedeckelt bei maxHeight 280).
    const menuH = menuRef.current ? menuRef.current.offsetHeight : Math.min(280, options.length * 38 + 12)
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const flipUp = (rect.bottom + menuH > window.innerHeight) && spaceAbove > spaceBelow
    setPos({
      left: rect.left,
      top: flipUp ? rect.top - menuH - 4 : rect.bottom + 4,
      minWidth: Math.max(rect.width, 200),
    })
  }, [options.length])

  // Beim Öffnen (Menü ist dann im DOM) vor dem Paint positionieren → kein Flackern.
  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, reposition])

  // Scroll (capture, damit auch Scrolls in Vorfahren zählen) + Resize → neu positionieren.
  useEffect(() => {
    if (!open) return
    const handler = () => reposition()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open, reposition])

  // Outside-Click schließt — Trigger UND Portal-Menü zählen als „innen"
  // (das Menü liegt jetzt außerhalb des Trigger-Teilbaums).
  useEffect(() => {
    function onDoc(e) {
      const t = triggerRef.current, m = menuRef.current
      if (t && t.contains(e.target)) return
      if (m && m.contains(e.target)) return
      setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const sel = options.find(o => o.value === value)
  const active = !neutral && value !== '' && value != null
  const label = sel ? sel.label : placeholder

  return (
    <div ref={triggerRef} style={{ position:'relative', display:'inline-block' }}>
      <button type="button" className="lk-dd-trigger" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)} title={title}
        style={{
          display:'inline-flex', alignItems:'center', gap:6, padding:'9px 10px', borderRadius:9, boxSizing:'border-box',
          border:'1.5px solid ' + (active ? P : 'var(--border)'),
          background: active ? 'rgba(10,111,176,0.06)' : 'var(--surface, #fff)',
          color: active ? P : 'var(--text-primary)',
          fontSize:13, fontWeight:500, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace:'nowrap', fontFamily:'inherit', ...buttonStyle,
        }}>
        {Icon && <Icon size={13} strokeWidth={1.75} style={{ flexShrink:0 }}/>}
        <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', textAlign:'left' }}>{label}</span>
        <ChevronDown size={13} strokeWidth={2} style={{ opacity:0.5, marginLeft:2, flexShrink:0 }}/>
      </button>
      {open && createPortal(
        // zIndex bewusst maximal: der Trigger sitzt teils in Modals mit Overlay-zIndex bis 2000
        // (NewTaskModal/ProjektStartenModal/BulkEditModal). Als body-Portal muss das Menü über
        // JEDEM Container liegen, in dem eine PillSelect stehen kann — sonst verschwindet es hinter dem Modal.
        <div ref={menuRef} style={{ position:'fixed', zIndex:2147483647,
          top: pos ? pos.top : 0, left: pos ? pos.left : 0, minWidth: pos ? pos.minWidth : 200,
          visibility: pos ? 'visible' : 'hidden', // erst nach berechneter Position sichtbar (kein Flackern bei 0,0)
          maxHeight:280, overflowY:'auto',
          background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 12px 32px rgba(15,23,42,0.16)', padding:6 }}>
          {options.map(o => (
            <button key={String(o.value)} className="lk-dd-opt" onClick={() => { onChange(o.value); setOpen(false) }}
              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', padding:'7px 9px', borderRadius:7,
                border:'none', background: o.value === value ? 'rgba(10,111,176,0.06)' : 'transparent', cursor:'pointer', fontSize:13, color:'var(--text-primary)', fontFamily:'inherit' }}>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis' }}>{o.label}</span>
              {o.value === value && <Check size={13} strokeWidth={3} color={P}/>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
