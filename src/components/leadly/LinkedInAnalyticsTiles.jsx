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

  const Tile = ({ icon, label, value, delta, warn, to }) => (
    <button type="button" onClick={() => nav(to)} className="lk-tile-in"
      style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--surface, #fff)', border: '1px solid var(--border, #E4E7EC)', borderRadius: 12, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <span style={{ color: warn ? '#B45309' : 'var(--primary, rgb(49,90,231))', display: 'inline-flex' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-muted, #6B7280)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: warn ? '#B45309' : 'var(--text-strong, #111827)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {delta != null && delta !== 0 && (
        <span style={{ fontSize: 11, fontWeight: 700, color: delta > 0 ? '#059669' : '#DC2626' }}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</span>
      )}
    </button>
  )

  const Label = ({ text, tone }) => (
    <span style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
      color: tone === 'team' ? '#0F766E' : 'var(--wl-primary, rgb(49,90,231))',
      background: tone === 'team' ? '#E7F6F2' : 'var(--wl-primary-tint, #EAF0FF)',
      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', display: 'inline-block',
    }}>{text}</span>
  )

  // Zeilen aufbauen (Label + Kacheln je Ebene), dann im Bogen staffeln
  const rows = []
  const brandTiles = []
  if (bvId && !noBrand) {
    if (show.includes('follower')) brandTiles.push(<Tile key="fol" icon={<Users size={16} />} label="Follower" value={fmt(d?.follower)} delta={d?.followerDelta} to="/wachstum" />)
    if (show.includes('second')) brandTiles.push(isCompany
      ? <Tile key="sec" icon={<Building2 size={16} />} label="Mitarbeitende" value={fmt(d?.second)} to="/wachstum" />
      : <Tile key="sec" icon={<UserPlus size={16} />} label="Verbindungen" value={fmt(d?.second)} delta={d?.secondDelta} to="/netzwerk-analytics" />)
    if (show.includes('engagement')) brandTiles.push(<Tile key="eng" icon={<Flame size={16} />} label="Ø Engagement" value={d?.engagement != null ? (d.engagement * 100).toFixed(1).replace('.', ',') + ' %' : '–'} to="/linkedin-analytics" />)
  }
  const teamTiles = []
  if (show.includes('unread')) teamTiles.push(<Tile key="unr" icon={<Mail size={16} />} label="Ungelesen" value={fmt(d?.unread)} warn={(d?.unread || 0) > 0} to="/nachrichten-analytics" />)
  if (show.includes('campaigns')) teamTiles.push(<Tile key="cmp" icon={<Rocket size={16} />} label="Kampagnen aktiv" value={fmt(d?.campaigns)} to="/netzwerk-analytics" />)

  if (brandTiles.length) { rows.push({ label: `Marke · ${brandName}`, tone: 'brand' }); brandTiles.forEach(t => rows.push({ tile: t })) }
  if (teamTiles.length) { rows.push({ label: 'Team', tone: 'team' }); teamTiles.forEach(t => rows.push({ tile: t })) }

  const off = (i) => (arc ? Math.min(i * 15, 58) : 0)

  return (
    <div>
      <style>{`
        @keyframes lk-tile-pop { 0% { opacity:0; transform: translateY(6px) scale(.98) } 100% { opacity:1; transform:none } }
        .lk-tile-in { animation: lk-tile-pop .34s ease both; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted, #6B7280)', fontWeight: 600, marginBottom: 10 }}>
        <Flame size={13} /> Deine Analysen
      </div>
      {(noBrand || !bvId) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted, #9CA3AF)', padding: '2px 2px 10px', lineHeight: 1.5 }}>
          Wähle oben eine Marke, um Follower & Engagement zu sehen.
        </div>
      )}
      {activeTeamId && (
        <div key={tick} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          {rows.map((r, i) => r.label ? (
            <div key={`l${i}`} style={{ transform: `translateX(${off(i)}px)`, marginTop: i === 0 ? 0 : 4, transition: 'transform .25s ease' }}>
              <Label text={r.label} tone={r.tone} />
            </div>
          ) : (
            <div key={`t${i}`} style={{ transform: `translateX(${off(i)}px)`, width: arc ? 232 : '100%', maxWidth: '100%', transition: 'transform .25s ease' }}>
              {r.tile}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
