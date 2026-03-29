import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_FILTER = [
  { key: 'all',       label: 'Alle' },
  { key: 'connected', label: 'Vernetzt' },
  { key: 'pending',   label: 'Ausstehend' },
  { key: 'none',      label: 'Nicht vernetzt' },
  { key: 'declined',  label: 'Abgelehnt' },
]

const CONN_STYLE = {
  connected: { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', label: '✓ Vernetzt' },
  pending:   { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A', label: '⏳ Ausstehend' },
  none:      { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0', label: '— Kein Kontakt' },
  declined:  { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA', label: '✕ Abgelehnt' },
}

const LEAD_STATUS_STYLE = {
  Lead: { bg:'#F1F5F9', color:'#475569' },
  LQL:  { bg:'#EFF6FF', color:'#1D4ED8' },
  MQN:  { bg:'#F5F3FF', color:'#6D28D9' },
  MQL:  { bg:'#FFFBEB', color:'#B45309' },
  SQL:  { bg:'#F0FDF4', color:'#15803D' },
}

function initials(n) {
  if (!n) return '?'
  return n.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 2)
}

export default function Vernetzungen() {
  const [leads, setLeads]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('leads')
        .select('id,first_name,last_name,name,job_title,headline,company,location,linkedin_url,avatar_url,email,phone,connection_status,connection_sent_at,connected_at,connection_note,connection_message,lead_score,icp_match,pipeline_stage,status,created_at')
        .eq('user_id', user.id)
        .order('connected_at', { ascending: false, nullsFirst: false })
      if (!error) setLeads(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const fullName = l =>
    ((l.first_name || '') + ' ' + (l.last_name || '')).trim() || l.name || 'Unbekannt'

  const filtered = leads.filter(l => {
    const matchFilter = filter === 'all' || l.connection_status === filter
    const matchSearch = !search ||
      fullName(l).toLowerCase().includes(search.toLowerCase()) ||
      (l.company || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.job_title || l.headline || '').toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const stats = {
    connected: leads.filter(l => l.connection_status === 'connected').length,
    pending:   leads.filter(l => l.connection_status === 'pending').length,
    none:      leads.filter(l => !l.connection_status || l.connection_status === 'none').length,
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ color:'#64748B', fontSize:14 }}>Lade Vernetzungen…</div>
    </div>
  )

  return (
    <div style={{ padding:'32px 40px', maxWidth:1100, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:700, color:'#0F172A', margin:0 }}>Vernetzungen</h1>
          <p style={{ fontSize:14, color:'#64748B', marginTop:4 }}>Alle LinkedIn-Kontakte aus deinem CRM</p>
        </div>
        {/* Stats */}
        <div style={{ display:'flex', gap:12 }}>
          {[
            { label:'Vernetzt',    val:stats.connected, color:'#15803D', bg:'#F0FDF4' },
            { label:'Ausstehend',  val:stats.pending,   color:'#B45309', bg:'#FFFBEB' },
            { label:'Kein Kontakt',val:stats.none,      color:'#64748B', bg:'#F8FAFC' },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.color}30`, borderRadius:10, padding:'8px 16px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:11, color:s.color, fontWeight:500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter + Suche */}
      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Name, Firma oder Jobtitel suchen…"
          style={{ flex:1, padding:'9px 14px', borderRadius:8, border:'1px solid #E2E8F0', fontSize:14, outline:'none', color:'#0F172A' }}
        />
        <div style={{ display:'flex', gap:6 }}>
          {STATUS_FILTER.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding:'7px 14px', borderRadius:8, border:'1px solid',
              borderColor: filter === f.key ? '#3B82F6' : '#E2E8F0',
              background:  filter === f.key ? '#EFF6FF' : '#fff',
              color:       filter === f.key ? '#1D4ED8' : '#64748B',
              fontSize:13, fontWeight: filter === f.key ? 600 : 400, cursor:'pointer'
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:'60px 0', color:'#94A3B8', fontSize:14 }}>
            Keine Vernetzungen gefunden.
          </div>
        )}
        {filtered.map(lead => {
          const conn  = CONN_STYLE[lead.connection_status || 'none']
          const lstat = LEAD_STATUS_STYLE[lead.status] || LEAD_STATUS_STYLE.Lead
          const name  = fullName(lead)
          const isOpen = selected === lead.id
          return (
            <div key={lead.id}
              onClick={() => setSelected(isOpen ? null : lead.id)}
              style={{ background:'#fff', border:'1px solid #E8EDF2', borderRadius:12,
                       padding:'16px 20px', cursor:'pointer', transition:'box-shadow .15s',
                       boxShadow: isOpen ? '0 4px 16px rgba(0,0,0,.08)' : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                {/* Avatar */}
                {lead.avatar_url
                  ? <img src={lead.avatar_url} alt={name}
                      style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                  : <div style={{ width:44, height:44, borderRadius:'50%', background:'#6366F1',
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  color:'#fff', fontSize:15, fontWeight:700, flexShrink:0 }}>
                      {initials(name)}
                    </div>
                }
                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontWeight:600, fontSize:15, color:'#0F172A' }}>{name}</span>
                    {lead.linkedin_url && (
                      <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize:11, color:'#0A66C2', textDecoration:'none', fontWeight:500 }}>
                        LinkedIn ↗
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize:13, color:'#64748B', marginTop:2 }}>
                    {lead.job_title || lead.headline || '—'}
                    {lead.company && <span style={{ color:'#94A3B8' }}> · {lead.company}</span>}
                  </div>
                </div>
                {/* Badges */}
                <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                  {/* Lead-Status */}
                  <span style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:6,
                                 background:lstat.bg, color:lstat.color }}>
                    {lead.status || 'Lead'}
                  </span>
                  {/* Vernetzungsstatus */}
                  <span style={{ fontSize:12, fontWeight:500, padding:'4px 10px', borderRadius:8,
                                 background:conn.bg, color:conn.color, border:`1px solid ${conn.border}` }}>
                    {conn.label}
                  </span>
                  {/* Score */}
                  {(lead.lead_score || 0) > 0 && (
                    <span style={{ fontSize:11, color:'#64748B', fontWeight:500 }}>
                      Score: {lead.lead_score}
                    </span>
                  )}
                  {/* Datum */}
                  {lead.connected_at && (
                    <span style={{ fontSize:11, color:'#94A3B8' }}>
                      {new Date(lead.connected_at).toLocaleDateString('de-DE')}
                    </span>
                  )}
                </div>
              </div>

              {/* Ausgeklapptes Detail */}
              {isOpen && (
                <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid #F1F5F9',
                              display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                  {[
                    { label:'E-Mail',       val: lead.email },
                    { label:'Telefon',      val: lead.phone },
                    { label:'Standort',     val: lead.location },
                    { label:'Firma',        val: lead.company },
                    { label:'Pipeline',     val: lead.pipeline_stage || '—' },
                    { label:'ICP Match',    val: lead.icp_match != null ? lead.icp_match + '%' : '—' },
                    { label:'Notiz',        val: lead.connection_note },
                    { label:'Nachricht',    val: lead.connection_message },
                    { label:'Kontakt seit', val: lead.connection_sent_at ? new Date(lead.connection_sent_at).toLocaleDateString('de-DE') : '—' },
                  ].filter(f => f.val).map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize:11, color:'#94A3B8', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</div>
                      <div style={{ fontSize:13, color:'#1E293B', marginTop:2 }}>{f.val}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
