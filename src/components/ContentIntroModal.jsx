// src/components/ContentIntroModal.jsx
// Einmaliges Intro beim ersten Betreten des Content-Bereichs (re-aufrufbar via Info-Button).
// Erklärt das Pro-Brand-Modell und lässt den User den Brand/Redaktionsplan wählen,
// mit dem er arbeiten will. Die gewählte Karte "fliegt" zum Brand-Switcher in der Topbar.
import React, { useRef } from 'react'
import { createPortal } from 'react-dom'
import { User, Building2, Sparkles, X, FileText, Brain, MessageSquare, ImageIcon } from 'lucide-react'
import { useBrandVoice } from '../context/BrandVoiceContext'

const P = 'var(--wl-primary, #0A6FB0)'

export default function ContentIntroModal({ open, onClose }) {
  const { brandVoices = [], switchBrandVoice } = useBrandVoice()
  const cardRefs = useRef({})

  if (!open) return null

  const personal = brandVoices.filter(b => b.account_type !== 'company_page')
  const company  = brandVoices.filter(b => b.account_type === 'company_page')

  function flyToSwitcher(fromEl) {
    try {
      const anchor = document.getElementById('bv-switcher-anchor')
      if (!fromEl || !anchor) return
      const a = fromEl.getBoundingClientRect()
      const b = anchor.getBoundingClientRect()
      const clone = fromEl.cloneNode(true)
      Object.assign(clone.style, {
        position:'fixed', left:a.left+'px', top:a.top+'px', width:a.width+'px', height:a.height+'px',
        margin:0, zIndex:99999, pointerEvents:'none', transition:'all .6s cubic-bezier(.4,0,.2,1)',
        boxShadow:'0 20px 50px rgba(15,23,42,0.25)', borderRadius:'12px', background:'#fff',
      })
      document.body.appendChild(clone)
      requestAnimationFrame(() => {
        const tx = (b.left + b.width/2) - (a.left + a.width/2)
        const ty = (b.top + b.height/2) - (a.top + a.height/2)
        Object.assign(clone.style, { transform:`translate(${tx}px, ${ty}px) scale(0.18)`, opacity:'0.15' })
      })
      setTimeout(() => {
        clone.remove()
        anchor.style.transition = 'transform .18s ease'
        anchor.style.transform = 'scale(1.08)'
        setTimeout(() => { anchor.style.transform = 'scale(1)' }, 220)
      }, 600)
    } catch (_) {}
  }

  function pick(bv) {
    const el = cardRefs.current[bv.id]
    flyToSwitcher(el)
    try { switchBrandVoice(bv.id) } catch (_) {}
    setTimeout(() => onClose && onClose(), 480)
  }

  const ICON = { personal: <User size={16} strokeWidth={1.75}/>, company_page: <Building2 size={16} strokeWidth={1.75}/>, other: <Sparkles size={16} strokeWidth={1.75}/> }

  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'6vh 20px 24px', overflowY:'auto' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose() }}>
      <section style={{ width:'100%', maxWidth:760, background:'#fff', borderRadius:18, boxShadow:'0 24px 64px rgba(15,23,42,0.28)', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ padding:'22px 26px 16px', position:'relative' }}>
          <button onClick={() => onClose && onClose()} aria-label="Schließen"
            style={{ position:'absolute', top:16, right:16, width:30, height:30, borderRadius:8, border:'none', background:'#F1F5F9', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}>
            <X size={16}/>
          </button>
          <div style={{ fontSize:20, fontWeight:800, color:'var(--text-primary)', marginBottom:6 }}>Mit welchem Brand möchtest du arbeiten?</div>
          <div style={{ fontSize:13.5, color:'var(--text-muted)', lineHeight:1.6, maxWidth:620 }}>
            Jeder Brand hat seinen <strong>eigenen Content-Bereich</strong> — eigener Redaktionsplan, eigenes Memory, eigene Chats &amp; Visuals.
            Wähle hier, womit du startest. Wechseln kannst du danach jederzeit oben rechts über den Brand-Umschalter.
          </div>
          <div style={{ display:'flex', gap:14, marginTop:12, flexWrap:'wrap' }}>
            {[[FileText,'Redaktionsplan'],[Brain,'Memory'],[MessageSquare,'Content-Werkstatt'],[ImageIcon,'Visuals']].map(([Ic,l],i)=>(
              <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11.5, color:'var(--text-muted)', fontWeight:600 }}>
                <Ic size={13} strokeWidth={1.75}/>{l}
              </span>
            ))}
          </div>
        </div>

        {/* Two columns */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'var(--border, #E5E7EB)', borderTop:'1px solid var(--border, #E5E7EB)' }}>
          <Column title="Personal Brands" sub="Du als Person" icon={<User size={15} strokeWidth={1.9}/>} list={personal} empty="Noch keine Personal Brand" ICON={ICON} cardRefs={cardRefs} onPick={pick} kind="personal" />
          <Column title="Company Brands" sub="Im Namen eines Unternehmens" icon={<Building2 size={15} strokeWidth={1.9}/>} list={company} empty="Noch keine Company Brand" ICON={ICON} cardRefs={cardRefs} onPick={pick} kind="company" />
        </div>
      </section>
    </div>,
    document.body
  )
}

function Column({ title, sub, icon, list, empty, ICON, cardRefs, onPick, kind }) {
  return (
    <div style={{ background:'#fff', padding:'18px 18px 22px', minHeight:200 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
        <span style={{ width:28, height:28, borderRadius:8, background: kind==='company' ? 'rgba(16,185,129,0.10)' : 'rgba(10,111,176,0.08)', display:'flex', alignItems:'center', justifyContent:'center', color: kind==='company' ? '#10B981' : P }}>{icon}</span>
        <div>
          <div style={{ fontSize:13.5, fontWeight:800, color:'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>{sub}</div>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:12 }}>
        {list.length === 0 && <div style={{ fontSize:12, color:'var(--text-muted)', fontStyle:'italic', padding:'10px 0' }}>{empty}</div>}
        {list.map(bv => (
          <button className="lk-btn lk-btn-ghost" key={bv.id} ref={el => { if (el) cardRefs.current[bv.id] = el }} onClick={() => onPick(bv)}
            style={{ display:'flex', alignItems:'center', gap:10, textAlign:'left', fontFamily:'inherit' }}
            
            >
            <span style={{ color: kind==='company'?'#10B981':P, flexShrink:0 }}>{ICON[bv.account_type] || ICON.other}</span>
            <span style={{ fontSize:13.5, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{bv.name || '(Ohne Namen)'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
