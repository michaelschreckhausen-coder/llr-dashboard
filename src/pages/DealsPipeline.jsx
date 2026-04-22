// DealsPipeline — Kanban-Ansicht über die echten Deals (deals-Tabelle)
// Teilt Datenmodell mit Deals.jsx (gleiche Liste, andere Darstellung)
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const STAGES = [
  { id: 'kein_deal',    label: 'Neu',          color: '#64748b', bg: '#F8FAFC' },
  { id: 'prospect',     label: 'Interessent',  color: '#3b82f6', bg: '#EFF6FF' },
  { id: 'opportunity',  label: 'Qualifiziert', color: '#8b5cf6', bg: '#F5F3FF' },
  { id: 'angebot',      label: 'Angebot',      color: '#f59e0b', bg: '#FFFBEB' },
  { id: 'verhandlung',  label: 'Verhandlung',  color: '#f97316', bg: '#FFF7ED' },
  { id: 'gewonnen',     label: 'Gewonnen',     color: '#10b981', bg: '#ECFDF5' },
  { id: 'verloren',     label: 'Verloren',     color: '#94a3b8', bg: '#F8FAFC' },
]

function fmtEur(v) {
  if (!v) return '—'
  return '€' + Number(v).toLocaleString('de-DE')
}
function fmtDate(d) {
  if (!d) return null
  return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day:'2-digit', month:'short' })
}
function leadName(l) {
  if (!l) return null
  const n = ((l.first_name||'') + ' ' + (l.last_name||'')).trim()
  return n || l.name || l.company || null
}

export default function DealsPipeline({ session }) {
  const { activeTeamId } = useTeam()
  const uid = session?.user?.id
  const navigate = useNavigate()
  const [deals, setDeals]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [dragOver, setDragOver]   = useState(null)
  const [dragging, setDragging]   = useState(null)

  useEffect(() => { load() /* eslint-disable-next-line */ }, [activeTeamId])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('deals')
      .select('*, leads(id,first_name,last_name,name,company), organizations(id,name)')
      .order('created_at', { ascending: false })
    if (activeTeamId) q = q.eq('team_id', activeTeamId)
    else if (uid)     q = q.eq('created_by', uid).is('team_id', null)
    const { data, error } = await q
    if (error) console.error('[DealsPipeline] load error', error)
    setDeals(data || [])
    setLoading(false)
  }

  async function moveToStage(dealId, newStage) {
    const before = deals
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: newStage } : d))
    const { error } = await supabase.from('deals').update({ stage: newStage }).eq('id', dealId)
    if (error) {
      console.error('[DealsPipeline] move error', error)
      alert('Stage-Wechsel fehlgeschlagen: ' + error.message)
      setDeals(before)
    }
  }

  const byStage  = s => deals.filter(d => (d.stage || 'kein_deal') === s)
  const stageSum = s => byStage(s).reduce((t, d) => t + (Number(d.value) || 0), 0)

  if (loading) {
    return <div style={{ padding:40, textAlign:'center', color:'#94A3B8', fontSize:13 }}>Lade Deals…</div>
  }

  return (
    <div style={{ padding:'16px 20px 24px 20px', overflowX:'auto', minHeight:'100%' }}>
      <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
        {STAGES.map(stage => {
          const stageDeals = byStage(stage.id)
          const isTarget   = dragOver === stage.id
          return (
            <div
              key={stage.id}
              onDragOver={e => { e.preventDefault(); if (dragOver !== stage.id) setDragOver(stage.id) }}
              onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(null) }}
              onDrop={e => {
                e.preventDefault()
                const dealId = e.dataTransfer.getData('dealId')
                if (dealId) {
                  const d = deals.find(x => x.id === dealId)
                  if (d && (d.stage || 'kein_deal') !== stage.id) {
                    moveToStage(dealId, stage.id)
                  }
                }
                setDragOver(null)
                setDragging(null)
              }}
              style={{
                width: 272,
                minWidth: 272,
                background: isTarget ? stage.bg : '#F8FAFC',
                borderRadius: 10,
                padding: 10,
                border: `2px dashed ${isTarget ? stage.color : 'transparent'}`,
                transition: 'background 0.15s, border-color 0.15s',
              }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'2px 4px 10px 4px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:stage.color, flexShrink:0 }}/>
                  <span style={{ fontSize:12, fontWeight:700, color:'#0F172A' }}>{stage.label}</span>
                  <span style={{ fontSize:11, color:'#94A3B8' }}>({stageDeals.length})</span>
                </div>
                <span style={{ fontSize:11, fontWeight:600, color:'#64748B' }}>{fmtEur(stageSum(stage.id))}</span>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:6, minHeight: 60 }}>
                {stageDeals.map(d => {
                  const isDragging = dragging === d.id
                  const name = leadName(d.leads)
                  const org  = d.organizations?.name
                  return (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('dealId', d.id)
                        e.dataTransfer.effectAllowed = 'move'
                        setDragging(d.id)
                      }}
                      onDragEnd={() => { setDragging(null); setDragOver(null) }}
                      onClick={() => navigate(`/deals?view=liste&deal=${d.id}`)}
                      style={{
                        background: '#fff',
                        borderRadius: 8,
                        padding: '10px 12px',
                        border: '1px solid #E5E7EB',
                        cursor: 'grab',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        opacity: isDragging ? 0.4 : 1,
                        transition: 'opacity 0.12s, box-shadow 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'}
                      title={d.title || '— kein Titel —'}
                    >
                      <div style={{ fontSize:13, fontWeight:600, color:'#0F172A', marginBottom: (name || org) ? 4 : 6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {d.title || '— kein Titel —'}
                      </div>
                      {(name || org) && (
                        <div style={{ fontSize:11, color:'#64748B', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {name || org}{name && org ? ` · ${org}` : ''}
                        </div>
                      )}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
                        <span style={{ color:d.value>0?'#059669':'#CBD5E1', fontWeight:700 }}>{fmtEur(d.value)}</span>
                        {d.expected_close_date && <span style={{ color:'#94A3B8' }}>🗓 {fmtDate(d.expected_close_date)}</span>}
                      </div>
                    </div>
                  )
                })}
                {stageDeals.length === 0 && (
                  <div style={{ fontSize:11, color:'#CBD5E1', textAlign:'center', padding:'14px 0', fontStyle:'italic' }}>
                    Keine Deals
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {deals.length === 0 && (
        <div style={{ padding:'40px 20px', textAlign:'center', color:'#94A3B8', fontSize:13 }}>
          Noch keine Deals angelegt. Wechsle zur <button onClick={() => navigate('/deals?view=liste')} style={{ background:'none', border:'none', color:'#2563eb', fontWeight:600, cursor:'pointer', padding:0, fontSize:13 }}>Liste-Ansicht</button>, um einen Deal anzulegen.
        </div>
      )}
    </div>
  )
}
