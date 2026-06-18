// src/components/BrandVoiceSwitcher.jsx
// Topbar-Dropdown: zeigt aktive Brand Voice + erlaubt Wechsel.

import React, { useState, useRef, useEffect } from 'react'
import { User, Building2, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { supabase } from '../lib/supabase'

const ACCOUNT_ICONS = { personal: <User size={14} strokeWidth={1.75}/>, company_page: <Building2 size={14} strokeWidth={1.75}/>, other: <Sparkles size={14} strokeWidth={1.75}/> }
const ACCOUNT_LABELS = { personal: 'Personal Brand', company_page: 'Company Brand', other: 'Sonstiges' }

export default function BrandVoiceSwitcher({ session, compact = false }) {
  const { activeBrandVoice, brandVoices, loading, switchBrandVoice } = useBrandVoice()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (loading) return null
  if (!brandVoices.length) {
    return (
      <button onClick={() => navigate('/personal-brand')}
        style={{ padding:'6px 14px', borderRadius:9, border:'1.5px dashed var(--border)', background:'transparent',
          color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
        + Brand anlegen
      </button>
    )
  }

  const own  = brandVoices.filter(bv => bv.user_id === session?.user?.id)
  const team = brandVoices.filter(bv => bv.user_id !== session?.user?.id && bv.is_shared)

  const activeIcon = ACCOUNT_ICONS[activeBrandVoice?.account_type] || <Sparkles size={14} strokeWidth={1.75}/>
  const activeName = activeBrandVoice?.name || 'Brand Voice'

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          display:'inline-flex', alignItems:'center', gap:8,
          height: 38, boxSizing: 'border-box',
          padding: compact ? '0 12px' : '0 14px',
          borderRadius: 11,
          border:'1px solid var(--border)',
          background:'var(--surface)',
          fontSize: compact ? 12 : 13,
          fontWeight: 600,
          color:'var(--text-primary)',
          cursor:'pointer',
          maxWidth: 280,
          whiteSpace:'nowrap',
          overflow:'hidden',
          textOverflow:'ellipsis',
        }}>
        <span style={{ fontSize: compact ? 14 : 16 }}>{activeIcon}</span>
        <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{activeName}</span>
        <span style={{ marginLeft:2, opacity:.5, fontSize:10 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:200,
          minWidth: 320, maxWidth: 400,
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 12px 36px rgba(15,23,42,0.12)',
          padding: 6,
          maxHeight: '70vh', overflowY: 'auto',
        }}>
          {own.length > 0 && (
            <>
              <div style={{ padding:'8px 12px 4px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                Meine Auftritte
              </div>
              {own.map(bv => <BVItem key={bv.id} bv={bv} active={activeBrandVoice?.id === bv.id} onPick={() => { switchBrandVoice(bv.id); setOpen(false) }}/>)}
            </>
          )}
          {team.length > 0 && (
            <>
              <div style={{ padding:'10px 12px 4px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', borderTop:'1px solid var(--border-soft, #F1F5F9)', marginTop:4 }}>
                Vom Team geteilt
              </div>
              {team.map(bv => <BVItem key={bv.id} bv={bv} active={activeBrandVoice?.id === bv.id} onPick={() => { switchBrandVoice(bv.id); setOpen(false) }}/>)}
            </>
          )}
          <div style={{ borderTop:'1px solid var(--border-soft, #F1F5F9)', marginTop:6, padding:6 }}>
            <button onClick={() => { setOpen(false); navigate('/personal-brand') }}
              style={{ width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8, border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--wl-primary, rgb(49,90,231))' }}>
              + Neue Personal Brand
            </button>
            <button onClick={() => { setOpen(false); navigate('/company-brand') }}
              style={{ width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8, border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--wl-primary, rgb(49,90,231))' }}>
              + Neue Company Brand
            </button>
            <button onClick={() => { setOpen(false); navigate('/personal-brand') }}
              style={{ width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8, border:'none', background:'transparent', cursor:'pointer', fontSize:12, color:'var(--text-muted)' }}>
              ⚙ Brands verwalten
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BVItem({ bv, active, onPick }) {
  const icon = ACCOUNT_ICONS[bv.account_type] || '✨'
  const typeLabel = ACCOUNT_LABELS[bv.account_type] || ''
  return (
    <button onClick={onPick}
      style={{
        width:'100%', textAlign:'left',
        display:'flex', alignItems:'center', gap:10,
        padding:'9px 12px', borderRadius:9,
        border:'none',
        background: active ? 'rgba(49,90,231,0.07)' : 'transparent',
        cursor:'pointer',
        transition:'background .12s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F8FAFC' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      <span style={{ fontSize:18 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight: active ? 700 : 600, color: active ? 'var(--wl-primary, rgb(49,90,231))' : 'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {bv.name || '(Ohne Namen)'}
        </div>
        <div style={{ fontSize:10, color:'var(--text-muted)' }}>
          {typeLabel}{bv.is_shared ? ' · geteilt' : ''}
        </div>
      </div>
      {active && <span style={{ color:'var(--wl-primary, rgb(49,90,231))', fontSize:14 }}>✓</span>}
    </button>
  )
}
