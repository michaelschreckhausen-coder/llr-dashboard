// src/components/leadly/LinkedInAnalyticsTiles.jsx
//
// „Deine Analysen" — kompakte Klick-Kacheln fürs Startseiten-Cockpit.
// Liest die Snapshot-Tabellen (brand- + team-scoped), keine Unipile-Calls.
//   Gruppiert nach Ebene mit Kontext-Label: „Marke · <Name>" vs „Team".
//   arc=true → Kacheln staffeln sich in einem Bogen zum Orb hin.
//   view schaltet, welche Kacheln sichtbar sind.

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserPlus, Building2, Mail, Rocket, Flame } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import { useBrandVoice } from '../../context/BrandVoiceContext'

const fmt = n => (n == null ? '–' : Number(n).toLocaleString('de-DE'))

export default function LinkedInAnalyticsTiles({ arc = false, view = 'linkedin' }) {
  const nav = useNavigate()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice, noBrand } = useBrandVoice()
  const isCompany = activeBrandVoice?.account_type === 'company_page'
  const bvId = noBrand ? null : (activeBrandVoice?.id || null)
  const brandName = activeBrandVoice?.name || 'Deine Marke'

  const VIEWS = {
    linkedin: ['follower', 'second', 'unread', 'campaigns'],
    wachstum: ['follower', 'second'],
    content: ['engagement', 'follower'],
    netzwerk: ['second', 'unread', 'campaigns'],
  }
  const show = VIEWS[view] || VIEWS.linkedin

  const [d, setD] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!activeTeamId) { setD(null); return }
    let cancelled = false
    ;(async () => {
      const out = { follower: null, followerDelta: null, second: null, secondDelta: null, engagement: null, unread: null, campaigns: null }
      if (bvId) {
        const tbl = isCompany ? 'linkedin_page_metrics' : 'linkedin_profile_metrics'
        const selCols = isCompany ? 'followers_count, employee_count, captured_on' : 'follower_count, connections_count, captured_on'
        const { data: rows } = await supabase.from(tbl).select(selCols).eq('brand_voice_id', bvId).order('captured_on', { ascending: true }).limit(30)
        const list = rows || []
        const last = list[list.length - 1], first = list[0]
        if (isCompany) {
          out.follower = last?.followers_count ?? null
          out.second = last?.employee_count ?? null
          if (last && first && last.followers_count != null && first.followers_count != null) out.followerDelta = last.followers_count - first.followers_count
        } else {
          out.follower = last?.follower_count ?? null
          out.second = last?.connections_count ?? null
          if (last && first && last.follower_count != null && first.follower_count != null) out.followerDelta = last.follower_count - first.follower_count
          if (last && first && last.connections_count != null && first.connections_count != null) out.secondDelta = last.connections_count - first.connections_count
        }
        const { data: posts } = await supabase.from('content_posts').select('id').eq('team_id', activeTeamId).eq('brand_voice_id', bvId).not('linkedin_social_id', 'is', null).limit(200)
        const ids = (posts || []).map(p => p.id)
        if (ids.length) {
          const { data: mets } = await supabase.from('content_post_metrics').select('post_id, engagement_rate, measured_at').in('post_id', ids).order('measured_at', { ascending: true })
          const latest = {}
          for (const m of (mets || [])) if (m.engagement_rate != null) latest[m.post_id] = m.engagement_rate
          const vals = Object.values(latest)
          if (vals.length) out.engagement = vals.reduce((a, b) => a + b, 0) / vals.length
        }
      }
      const [{ data: mm }, { data: cc }] = await Promise.all([
        supabase.from('linkedin_messaging_metrics').select('unipile_account_id, unread_threads, captured_on').eq('team_id', activeTeamId).order('captured_on', { ascending: false }).limit(20),
        supabase.from('la_campaigns').select('status').eq('team_id', activeTeamId),
      ])
      const byAcct = {}
      for (const r of (mm || [])) if (!(r.unipile_account_id in byAcct)) byAcct[r.unipile_account_id] = r.unread_threads
      out.unread = Object.values(byAcct).reduce((a, b) => a + (Number(b) || 0), 0)
      out.campaigns = (cc || []).filter(c => c.status === 'active').length
      if (!cancelled) { setD(out); setTick(t => t + 1) }
    })()
    return () => { cancelled = true }
  }, [activeTeamId, bvId, isCompany])


  const Tile = ({ icon, label, value, delta, warn, to, tone }) => {
    const accent = tone === 'team' ? '#0F766E' : 'var(--wl-primary, rgb(49,90,231))'
    return (
      <button type="button" onClick={() => nav(to)} className="lk-tile-in"
        style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--surface, #fff)', border: '1px solid var(--border, #E4E7EC)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5, width: '100%', position: 'relative', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-muted, #6B7280)' }}>
          <span style={{ color: warn ? '#B45309' : accent, display: 'inline-flex' }}>{icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: warn ? '#B45309' : 'var(--text-strong, #111827)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</span>
          {delta != null && delta !== 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: delta > 0 ? '#059669' : '#DC2626' }}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</span>
          )}
        </span>
      </button>
    )
  }

  // ── Kacheln (flach, mit Ebenen-Ton) ──
  const tiles = []
  if (bvId && !noBrand) {
    if (show.includes('follower')) tiles.push({ tone: 'brand', el: <Tile icon={<Users size={15} />} label="Follower" value={fmt(d?.follower)} delta={d?.followerDelta} tone="brand" to="/wachstum" /> })
    if (show.includes('second')) tiles.push({ tone: 'brand', el: isCompany
      ? <Tile icon={<Building2 size={15} />} label="Mitarbeitende" value={fmt(d?.second)} tone="brand" to="/wachstum" />
      : <Tile icon={<UserPlus size={15} />} label="Verbindungen" value={fmt(d?.second)} delta={d?.secondDelta} tone="brand" to="/netzwerk-analytics" /> })
    if (show.includes('engagement')) tiles.push({ tone: 'brand', el: <Tile icon={<Flame size={15} />} label="Ø Engagement" value={d?.engagement != null ? (d.engagement * 100).toFixed(1).replace('.', ',') + ' %' : '–'} tone="brand" to="/linkedin-analytics" /> })
  }
  if (show.includes('unread')) tiles.push({ tone: 'team', el: <Tile icon={<Mail size={15} />} label="Ungelesen" value={fmt(d?.unread)} warn={(d?.unread || 0) > 0} tone="team" to="/nachrichten-analytics" /> })
  if (show.includes('campaigns')) tiles.push({ tone: 'team', el: <Tile icon={<Rocket size={15} />} label="Kampagnen" value={fmt(d?.campaigns)} tone="team" to="/netzwerk-analytics" /> })

  const hasBrand = tiles.some(t => t.tone === 'brand')
  const hasTeam = tiles.some(t => t.tone === 'team')

  return (
    <div>
      <style>{`
        @keyframes lk-tile-pop { 0% { opacity:0; transform: translateY(6px) scale(.98) } 100% { opacity:1; transform:none } }
        .lk-tile-in { animation: lk-tile-pop .34s ease both; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted, #6B7280)', fontWeight: 600, marginBottom: 8 }}>
        <Flame size={13} /> Deine Analysen
      </div>

      {(noBrand || !bvId) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted, #9CA3AF)', padding: '2px 2px 10px', lineHeight: 1.5 }}>
          Wähle oben eine Marke, um Follower & Engagement zu sehen.
        </div>
      )}

      {activeTeamId && (hasBrand || hasTeam) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 9, fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted, #6B7280)' }}>
          {hasBrand && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--wl-primary, rgb(49,90,231))' }} />Marke · {brandName}</span>}
          {hasTeam && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: '#0F766E' }} />Team</span>}
        </div>
      )}

      {activeTeamId && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9, alignItems: 'start' }}>
          {tiles.map((t, i) => (
            <div key={i} style={{ transform: `translateY(${i % 2 === 1 ? 22 : 0}px)`, transition: 'transform .3s ease' }}>
              {t.el}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
