import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Deals from './Deals'
import Pipeline from './Pipeline'

const VIEWS = [
  { id: 'liste',    label: 'Liste',    icon: '📋' },
  { id: 'pipeline', label: 'Pipeline', icon: '📊' },
]

const LS_KEY = 'deals.view'

export default function DealsContainer({ session }) {
  const location = useLocation()
  const navigate = useNavigate()
  const urlView  = new URLSearchParams(location.search).get('view')
  const initial  = (urlView === 'liste' || urlView === 'pipeline')
    ? urlView
    : (localStorage.getItem(LS_KEY) || 'liste')
  const [view, setView] = useState(initial)

  // Persist choice + sync URL
  useEffect(() => {
    localStorage.setItem(LS_KEY, view)
    if (urlView !== view) {
      const p = new URLSearchParams(location.search)
      p.set('view', view)
      navigate(`${location.pathname}?${p.toString()}`, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // Keep local state in sync if URL changes externally (back/forward)
  useEffect(() => {
    if (urlView && (urlView === 'liste' || urlView === 'pipeline') && urlView !== view) {
      setView(urlView)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlView])

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      {/* View-Switcher */}
      <div style={{ display:'flex', gap:6, padding:'14px 24px 0 24px', background:'transparent', flexShrink:0 }}>
        {VIEWS.map(v => {
          const active = view === v.id
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              style={{
                padding:'7px 14px',
                borderRadius:8,
                border:`1.5px solid ${active ? 'var(--wl-primary, rgb(49,90,231))' : '#E5E7EB'}`,
                background: active ? 'var(--wl-primary, rgb(49,90,231))' : '#fff',
                color: active ? '#fff' : '#475569',
                fontSize:13,
                fontWeight:600,
                cursor:'pointer',
                transition:'all 0.15s',
                display:'inline-flex',
                alignItems:'center',
                gap:6,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F8FAFC' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = '#fff' }}
            >
              <span>{v.icon}</span>
              <span>{v.label}</span>
            </button>
          )
        })}
      </div>

      {/* Ausgewählte Ansicht */}
      <div style={{ flex:1, minHeight:0 }}>
        {view === 'pipeline'
          ? <Pipeline session={session} />
          : <Deals session={session} />}
      </div>
    </div>
  )
}
