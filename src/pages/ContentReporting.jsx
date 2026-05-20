// src/pages/ContentReporting.jsx
// Content Reporting — Performance der veröffentlichten LinkedIn-Posts pro Brand Voice.
// Datenquelle: content_post_metrics (gespeist von der Extension oder LinkedIn-API).
//
// Skeleton-Page — zeigt KPIs, Top-Posts und Verlauf. Daten kommen sobald
// Auto-Publishing live ist und die Extension Metriken zurückschreibt.

import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'

export default function ContentReporting({ session }) {
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState([])
  const [stats, setStats] = useState({ total: 0, totalImpressions: 0, totalLikes: 0, totalComments: 0, avgEngagement: 0 })

  const load = useCallback(async () => {
    if (!activeTeamId) { setLoading(false); return }
    setLoading(true)
    try {
      // Posts in den letzten 90 Tagen — gefiltert nach Brand Voice wenn aktiv
      let q = supabase.from('content_posts')
        .select('id, title, content, status, published_at, brand_voice_id, content_post_metrics(impressions, likes, comments_count, reshares, engagement_rate, measured_at, days_since_publish)')
        .eq('team_id', activeTeamId)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(50)
      if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
      const { data } = await q
      const list = data || []

      // Aggregiere die jüngste Metrik pro Post
      const enriched = list.map(p => {
        const metrics = (p.content_post_metrics || []).slice().sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at))[0] || null
        return { ...p, metrics }
      })

      const totals = enriched.reduce((acc, p) => {
        if (!p.metrics) return acc
        acc.totalImpressions += p.metrics.impressions || 0
        acc.totalLikes       += p.metrics.likes || 0
        acc.totalComments    += p.metrics.comments_count || 0
        acc.withMetrics      += 1
        acc.engagementSum    += Number(p.metrics.engagement_rate || 0)
        return acc
      }, { totalImpressions: 0, totalLikes: 0, totalComments: 0, withMetrics: 0, engagementSum: 0 })

      setPosts(enriched)
      setStats({
        total: enriched.length,
        totalImpressions: totals.totalImpressions,
        totalLikes: totals.totalLikes,
        totalComments: totals.totalComments,
        avgEngagement: totals.withMetrics > 0 ? (totals.engagementSum / totals.withMetrics) : 0,
      })
    } finally {
      setLoading(false)
    }
  }, [activeTeamId, activeBrandVoice?.id])

  useEffect(() => { load() }, [load])

  const P = 'var(--wl-primary, rgb(49,90,231))'

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Journal-Header */}
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Reporting</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Was performt?</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6, maxWidth:560 }}>
          Reichweite, Interaktionen und Engagement deiner veröffentlichten LinkedIn-Posts. Pro Brand Voice gefiltert.
        </p>
      </div>

      {/* KPI-Karten */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:24 }}>
        <KpiCard icon="📊" label="Posts" val={stats.total} loading={loading} />
        <KpiCard icon="👁️" label="Impressionen" val={stats.totalImpressions.toLocaleString('de-DE')} loading={loading} />
        <KpiCard icon="❤️" label="Likes" val={stats.totalLikes.toLocaleString('de-DE')} loading={loading} />
        <KpiCard icon="💬" label="Kommentare" val={stats.totalComments.toLocaleString('de-DE')} loading={loading} />
      </div>

      {/* Post-Liste */}
      <section style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontWeight:700, fontSize:14 }}>Veröffentlichte Posts</div>
          {activeBrandVoice && <div style={{ fontSize:11, color:'var(--text-muted)' }}>Gefiltert auf: {activeBrandVoice.name}</div>}
        </div>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Lade Posts …</div>
        ) : posts.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--text-muted)' }}>
            <div style={{ fontSize:30, marginBottom:10 }}>📭</div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>Noch keine veröffentlichten Posts</div>
            <div style={{ fontSize:12, marginTop:4 }}>Sobald du LinkedIn-Posts mit Leadesk veröffentlichst, erscheinen die Metriken hier.</div>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#F8FAFC', fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700 }}>Post</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, width:120 }}>Impr.</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, width:80 }}>Likes</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, width:90 }}>Komm.</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, width:90 }}>Engmt.</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, width:130 }}>Veröffentlicht</th>
              </tr>
            </thead>
            <tbody>
              {posts.map(p => (
                <tr key={p.id} style={{ borderTop:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'12px 14px', maxWidth:380 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'rgb(20,20,43)', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical' }}>{p.title || '(Ohne Titel)'}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical' }}>{(p.content || '').slice(0, 100)}</div>
                  </td>
                  <td style={{ padding:'12px 14px', textAlign:'right', fontSize:13 }}>{p.metrics?.impressions != null ? p.metrics.impressions.toLocaleString('de-DE') : '—'}</td>
                  <td style={{ padding:'12px 14px', textAlign:'right', fontSize:13 }}>{p.metrics?.likes != null ? p.metrics.likes.toLocaleString('de-DE') : '—'}</td>
                  <td style={{ padding:'12px 14px', textAlign:'right', fontSize:13 }}>{p.metrics?.comments_count != null ? p.metrics.comments_count.toLocaleString('de-DE') : '—'}</td>
                  <td style={{ padding:'12px 14px', textAlign:'right', fontSize:13 }}>{p.metrics?.engagement_rate != null ? (Number(p.metrics.engagement_rate) * 100).toFixed(1) + '%' : '—'}</td>
                  <td style={{ padding:'12px 14px', fontSize:12, color:'var(--text-muted)' }}>{p.published_at ? new Date(p.published_at).toLocaleDateString('de-DE') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Hinweis-Card */}
      <div style={{ marginTop:18, padding:'12px 16px', background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:10, fontSize:12, color:'#075985', lineHeight:1.5 }}>
        🔌 <strong>Metriken-Sync:</strong> Die Daten kommen aus der Chrome-Extension oder LinkedIn-API. Beim ersten Setup dauert es ~24h bis Metriken auflaufen. Posts ohne Metriken zeigen "—".
      </div>
    </div>
  )
}

function KpiCard({ icon, label, val, loading }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
      <div style={{ fontSize:22, marginBottom:4 }}>{icon}</div>
      <div style={{ fontSize:22, fontWeight:800, color:'rgb(20,20,43)', lineHeight:1 }}>
        {loading ? '…' : val}
      </div>
      <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, marginTop:4 }}>{label}</div>
    </div>
  )
}
