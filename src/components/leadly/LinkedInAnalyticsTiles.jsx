// src/components/leadly/LinkedInAnalyticsTiles.jsx
//
// „Deine Analysen" — umschaltbare Analyse-Modi fürs Startseiten-Cockpit.
//   mode='handlung'  → Handlungsbedarf (Ungelesen, offene Einladungen, Kampagnen) [team]
//   mode='trend'     → Wochen-Trend (Follower/Verbindungen/Engagement + Δ) [marke]
//   mode='content'   → Content-Wirkung (letzter Post Impressions/Reaktionen, Ø, Posts) [marke]
// Marken-Wechsler in der Legende (switchBrandVoice). Kacheln = KPI + Deep-Link.

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserPlus, Building2, Mail, Rocket, Flame, Eye, Heart, FileText, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import { useBrandVoice } from '../../context/BrandVoiceContext'

const fmt = n => (n == null ? '–' : Number(n).toLocaleString('de-DE'))

export default function LinkedInAnalyticsTiles({ mode = 'handlung' }) {
  const nav = useNavigate()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice, noBrand, brandVoices, switchBrandVoice } = useBrandVoice()
  const isCompany = activeBrandVoice?.account_type === 'company_page'
  const bvId = noBrand ? null : (activeBrandVoice?.id || null)
  const brandName = noBrand ? 'Ohne Marke' : (activeBrandVoice?.name || 'Deine Marke')

  const [d, setD] = useState(null)
  const [tick, setTick] = useState(0)
  const [brandOpen, setBrandOpen] = useState(false)
  const brandRef = React.useRef(null)

  useEffect(() => {
    if (!brandOpen) return
    const h = (e) => { if (brandRef.current && !brandRef.current.contains(e.target)) setBrandOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [brandOpen])

  useEffect(() => {
    if (!activeTeamId) { setD(null); return }
    let cancelled = false
    ;(async () => {
      const out = { follower: null, followerDelta: null, second: null, secondDelta: null, engagement: null, unread: null, campaigns: null, invitesIn: null, postsCount: null, lastImpr: null, lastLikes: null }
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
        out.postsCount = ids.length
        if (ids.length) {
          const { data: mets } = await supabase.from('content_post_metrics').select('post_id, impressions, likes, engagement_rate, measured_at').in('post_id', ids).order('measured_at', { ascending: true })
          const latestByPost = {}
          for (const m of (mets || [])) latestByPost[m.post_id] = m
          const engs = Object.values(latestByPost).map(v => v.engagement_rate).filter(x => x != null)
          if (engs.length) out.engagement = engs.reduce((a, b) => a + Number(b), 0) / engs.length
          let latest = null
          for (const m of (mets || [])) if (!latest || new Date(m.measured_at) > new Date(latest.measured_at)) latest = m
          if (latest) { out.lastImpr = latest.impressions; out.lastLikes = latest.likes }
        }
        const { data: nm } = await supabase.from('linkedin_network_metrics').select('invites_pending_in, captured_on').eq('brand_voice_id', bvId).order('captured_on', { ascending: false }).limit(1)
        if (nm && nm.length) out.invitesIn = nm[0].invites_pending_in
      }
      const [{ data: mm }, { data: cc }] = await Promise.all([
        supabase.from('linkedin_messaging_metrics').select('unipile_account_id, unread_threads, captured_on').eq('team_id', activeTeamId).order('captured_on', { ascending: false }).limit(20),
        supabase.from('la_campaigns').select('status').eq('team_id', activeTeamId),
      ])
      const byAcct = {}
      for (const r of (mm || [])) if (!(r.unipile_account_id in byAcct)) byAcct[r.unipile_account_id] = r.unread_threads
      out.unread = Object.values(byAcct).reduce((a, b) => a + (Number(b) || 0), 0)
      out.campaigns = (cc || []).filter(c => c.status === 'active').length
      if (out.invitesIn == null) {
        const { data: nmt } = await supabase.from('linkedin_network_metrics').select('unipile_account_id, invites_pending_in, captured_on').eq('team_id', activeTeamId).order('captured_on', { ascending: false }).limit(20)
        const byA = {}
        for (const r of (nmt || [])) if (!(r.unipile_account_id in byA)) byA[r.unipile_account_id] = r.invites_pending_in
        out.invitesIn = Object.values(byA).reduce((a, b) => a + (Number(b) || 0), 0)
      }
      if (!cancelled) { setD(out); setTick(t => t + 1) }
    })()
    return () => { cancelled = true }
  }, [activeTeamId, bvId, isCompany])

  const Tile = ({ icon, label, value, delta, warn, to, tone, sub }) => {
    const accent = tone === 'team' ? '#0F766E' : 'var(--wl-primary, rgb(49,90,231))'
    return (
      <button type="button" onClick={() => nav(to)} className="lk-tile-in"
        style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--surface, #fff)', border: '1px solid var(--border, #E4E7EC)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, width: '100%', position: 'relative', overflow: 'hidden' }}>
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
        {sub && <span style={{ fontSize: 10.5, color: 'var(--text-muted, #9CA3AF)', marginTop: 1 }}>{sub}</span>}
      </button>
    )
  }

  const engTxt = d?.engagement != null ? (d.engagement * 100).toFixed(1).replace('.', ',') + ' %' : '–'
  const trendSub = d?.followerDelta == null ? 'misst ab jetzt' : null

  // ── Kacheln je Modus ──
  let tiles = []
  let emptyHint = null
  if (mode === 'trend') {
    if (!bvId || noBrand) emptyHint = 'Wähle eine Marke, um Wachstum & Engagement zu sehen.'
    else {
      tiles.push({ tone: 'brand', el: <Tile icon={<Users size={15} />} label="Follower" value={fmt(d?.follower)} delta={d?.followerDelta} sub={trendSub} tone="brand" to="/wachstum" /> })
      tiles.push({ tone: 'brand', el: isCompany
        ? <Tile icon={<Building2 size={15} />} label="Mitarbeitende" value={fmt(d?.second)} tone="brand" to="/wachstum" />
        : <Tile icon={<UserPlus size={15} />} label="Verbindungen" value={fmt(d?.second)} delta={d?.secondDelta} sub={trendSub} tone="brand" to="/netzwerk-analytics" /> })
      tiles.push({ tone: 'brand', el: <Tile icon={<Flame size={15} />} label="Ø Engagement" value={engTxt} tone="brand" to="/linkedin-analytics" /> })
    }
  } else if (mode === 'content') {
    if (!bvId || noBrand) emptyHint = 'Wähle eine Marke, um die Content-Wirkung zu sehen.'
    else if (!d?.postsCount) emptyHint = `Für „${brandName}" sind noch keine veröffentlichten Posts erfasst.`
    else {
      tiles.push({ tone: 'brand', el: <Tile icon={<Eye size={15} />} label="Impressionen · letzter Post" value={fmt(d?.lastImpr)} tone="brand" to="/linkedin-analytics" /> })
      tiles.push({ tone: 'brand', el: <Tile icon={<Heart size={15} />} label="Reaktionen · letzter Post" value={fmt(d?.lastLikes)} tone="brand" to="/linkedin-analytics" /> })
      tiles.push({ tone: 'brand', el: <Tile icon={<Flame size={15} />} label="Ø Engagement" value={engTxt} tone="brand" to="/linkedin-analytics" /> })
      tiles.push({ tone: 'brand', el: <Tile icon={<FileText size={15} />} label="Posts gesamt" value={fmt(d?.postsCount)} tone="brand" to="/linkedin-analytics" /> })
    }
  } else {
    tiles.push({ tone: 'team', el: <Tile icon={<Mail size={15} />} label="Ungelesen" value={fmt(d?.unread)} warn={(d?.unread || 0) > 0} sub={(d?.unread || 0) > 0 ? 'warten auf Antwort' : null} tone="team" to="/nachrichten-analytics" /> })
    tiles.push({ tone: 'team', el: <Tile icon={<UserPlus size={15} />} label="Offene Einladungen" value={fmt(d?.invitesIn)} warn={(d?.invitesIn || 0) > 0} sub={(d?.invitesIn || 0) > 0 ? 'noch nicht angenommen' : null} tone="team" to="/netzwerk-analytics" /> })
    tiles.push({ tone: 'team', el: <Tile icon={<Rocket size={15} />} label="Aktive Kampagnen" value={fmt(d?.campaigns)} tone="team" to="/netzwerk-analytics" /> })
  }

  const isBrandMode = mode === 'trend' || mode === 'content'
  const selectable = (brandVoices || []).filter(b => b && b.id)

  return (
    <div>
      <style>{`
        @keyframes lk-tile-pop { 0% { opacity:0; transform: translateY(6px) scale(.98) } 100% { opacity:1; transform:none } }
        .lk-tile-in { animation: lk-tile-pop .34s ease both; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted, #6B7280)', fontWeight: 600, marginBottom: 8 }}>
        <Flame size={13} /> Deine Analysen
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginBottom: 9, fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted, #6B7280)' }}>
        {isBrandMode ? (
          <div ref={brandRef} style={{ position: 'relative' }}>
            <button type="button" onClick={() => setBrandOpen(o => !o)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10.5, fontWeight: 600, color: 'var(--text-strong, #374151)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--wl-primary, rgb(49,90,231))' }} />
              Marke · {brandName}
              <ChevronDown size={12} style={{ opacity: .55 }} />
            </button>
            {brandOpen && selectable.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, minWidth: 190, maxHeight: 260, overflowY: 'auto', background: '#fff', border: '1px solid var(--border,#E4E7EC)', borderRadius: 12, boxShadow: '0 12px 34px rgba(15,23,42,.15)', padding: 5, zIndex: 60 }}>
                {selectable.map(b => (
                  <button key={b.id} type="button" onClick={() => { switchBrandVoice(b.id); setBrandOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', background: b.id === bvId ? 'var(--wl-primary-tint,#EFF3FF)' : 'transparent', border: 'none', borderRadius: 8, padding: '7px 9px', fontSize: 12, fontWeight: b.id === bvId ? 700 : 500, color: 'var(--text-strong,#111827)', cursor: 'pointer' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: b.account_type === 'company_page' ? '#0F766E' : 'var(--wl-primary, rgb(49,90,231))' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: '#0F766E' }} />Team-weit</span>
        )}
      </div>

      {emptyHint ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted, #9CA3AF)', padding: '2px 2px 10px', lineHeight: 1.5 }}>{emptyHint}</div>
      ) : activeTeamId && (
        <div key={tick} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9, alignItems: 'start' }}>
          {tiles.map((t, i) => (
            <div key={i} style={{ transform: `translateY(${i % 2 === 0 ? 22 : 0}px)`, transition: 'transform .3s ease' }}>
              {t.el}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
