// src/components/leadly/LinkedInAnalyticsTiles.jsx
//
// „Deine Analysen" — TEAM-WEITE Analyse-Übersicht fürs Startseiten-Cockpit.
// Das team-übergreifende Gegenstück zu den brand-scoped Analyse-Seiten:
// bündelt die wichtigsten Kennzahlen aller Bereiche über ALLE Marken/Profile des Teams.
//   mode='handlung' → Handlungsbedarf (Ungelesen, offene Einladungen, aktive Kampagnen)
//   mode='netzwerk' → Netzwerk (Verbindungen, Follower, offene Anfragen raus)
//   mode='content'  → Content (Posts, Impressionen, Ø Engagement)
// Jede Kachel = KPI + Deep-Link in den passenden Analyse-Bereich.

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserPlus, Mail, Rocket, Flame, Eye, FileText, Send, Inbox, Handshake, Radio, Euro, Award } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'

const fmt = n => (n == null ? '–' : Number(n).toLocaleString('de-DE'))
const sumLatest = (rows, keyCol, valCol) => {
  const latest = {}
  for (const r of (rows || [])) if (!(r[keyCol] in latest)) latest[r[keyCol]] = r
  return Object.values(latest).reduce((a, r) => a + (Number(r[valCol]) || 0), 0)
}

export default function LinkedInAnalyticsTiles({ mode = 'handlung', control = null }) {
  const nav = useNavigate()
  const { activeTeamId } = useTeam()
  const [d, setD] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!activeTeamId) { setD(null); return }
    let cancelled = false
    ;(async () => {
      const out = { unread: null, invitesIn: null, invitesOut: null, campaigns: null, connections: null, followers: null, posts: null, impressions: null, engagement: null, acceptanceRate: null, invitesAccepted: null, linkedinLeads: null, pipelineValue: null, wonValue: null }
      const [{ data: nm }, { data: mm }, { data: cc }, { data: posts }] = await Promise.all([
        supabase.from('linkedin_network_metrics').select('unipile_account_id, connections_total, followers_total, invites_pending_in, invites_pending_out, captured_on').eq('team_id', activeTeamId).order('captured_on', { ascending: false }).limit(80),
        supabase.from('linkedin_messaging_metrics').select('unipile_account_id, unread_threads, captured_on').eq('team_id', activeTeamId).order('captured_on', { ascending: false }).limit(40),
        supabase.from('la_campaigns').select('status').eq('team_id', activeTeamId),
        supabase.from('content_posts').select('id').eq('team_id', activeTeamId).not('linkedin_social_id', 'is', null).limit(500),
      ])
      out.connections = sumLatest(nm, 'unipile_account_id', 'connections_total')
      out.followers   = sumLatest(nm, 'unipile_account_id', 'followers_total')
      out.invitesIn   = sumLatest(nm, 'unipile_account_id', 'invites_pending_in')
      out.invitesOut  = sumLatest(nm, 'unipile_account_id', 'invites_pending_out')
      out.unread      = sumLatest(mm, 'unipile_account_id', 'unread_threads')
      out.campaigns   = (cc || []).filter(c => c.status === 'active').length
      const ids = (posts || []).map(p => p.id)
      out.posts = ids.length
      if (ids.length) {
        const { data: mets } = await supabase.from('content_post_metrics').select('post_id, impressions, engagement_rate, measured_at').in('post_id', ids).order('measured_at', { ascending: true })
        const latest = {}
        for (const m of (mets || [])) latest[m.post_id] = m
        const vals = Object.values(latest)
        out.impressions = vals.reduce((a, m) => a + (Number(m.impressions) || 0), 0)
        const engs = vals.map(m => m.engagement_rate).filter(x => x != null)
        if (engs.length) out.engagement = engs.reduce((a, b) => a + Number(b), 0) / engs.length
      }
      // Vernetzungs-Annahmequote (aus gesendeten Einladungen)
      const { data: inv } = await supabase.from('linkedin_invitations').select('status').eq('team_id', activeTeamId)
      const acc = (inv || []).filter(i => i.status === 'accepted').length
      const pend = (inv || []).filter(i => i.status === 'pending').length
      out.invitesAccepted = acc
      out.acceptanceRate = (acc + pend) > 0 ? acc / (acc + pend) : null
      // Cross-Domain: Leads aus LinkedIn + Pipeline/Won-Wert der zugehörigen Deals
      const LI_SOURCES = ['post_engagement', 'linkedin', 'sales_nav', 'linkedin_search', 'extension_import']
      const { data: liLeads } = await supabase.from('leads').select('id').eq('team_id', activeTeamId).in('source', LI_SOURCES)
      const liIds = (liLeads || []).map(l => l.id)
      out.linkedinLeads = liIds.length
      if (liIds.length) {
        const { data: dls } = await supabase.from('deals').select('value, stage').eq('team_id', activeTeamId).in('lead_id', liIds)
        out.pipelineValue = (dls || []).filter(d => d.stage !== 'gewonnen' && d.stage !== 'verloren').reduce((a, d) => a + (Number(d.value) || 0), 0)
        out.wonValue = (dls || []).filter(d => d.stage === 'gewonnen').reduce((a, d) => a + (Number(d.value) || 0), 0)
      }
      if (!cancelled) { setD(out); setTick(t => t + 1) }
    })()
    return () => { cancelled = true }
  }, [activeTeamId])

  const Tile = ({ icon, label, value, warn, to, sub }) => {
    const accent = '#0F766E'
    return (
      <button type="button" onClick={() => nav(to)} className="lk-tile-in"
        style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--surface, #fff)', border: '1px solid var(--border, #E4E7EC)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, width: '100%', position: 'relative', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-muted, #6B7280)' }}>
          <span style={{ color: warn ? '#B45309' : accent, display: 'inline-flex' }}>{icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </span>
        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: warn ? '#B45309' : 'var(--text-strong, #111827)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</span>
        {sub && <span style={{ fontSize: 10.5, color: 'var(--text-muted, #9CA3AF)', marginTop: 1 }}>{sub}</span>}
      </button>
    )
  }

  const engTxt = d?.engagement != null ? (d.engagement * 100).toFixed(1).replace('.', ',') + ' %' : '–'
  const fmtEur = n => (n == null ? '–' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €')
  const pctTxt = n => (n == null ? '–' : (n * 100).toFixed(0) + ' %')
  // Reichweiten-Rate = Ø Impressionen pro Post / Follower
  const reach = (d?.impressions && d?.followers && d?.posts) ? (d.impressions / d.posts) / d.followers : null
  const reachTxt = reach == null ? '–' : (reach * 100).toFixed(0) + ' %'

  let tiles = []
  if (mode === 'netzwerk') {
    tiles = [
      <Tile key="c" icon={<UserPlus size={15} />} label="Verbindungen" value={fmt(d?.connections)} to="/netzwerk-analytics" />,
      <Tile key="f" icon={<Users size={15} />} label="Follower" value={fmt(d?.followers)} to="/netzwerk-analytics" />,
      <Tile key="o" icon={<Send size={15} />} label="Anfragen offen (raus)" value={fmt(d?.invitesOut)} to="/netzwerk-analytics" />,
      <Tile key="a" icon={<Handshake size={15} />} label="Annahmequote" value={pctTxt(d?.acceptanceRate)} sub={d?.invitesAccepted != null ? `${fmt(d.invitesAccepted)} angenommen` : null} to="/netzwerk-analytics" />,
    ]
  } else if (mode === 'content') {
    tiles = [
      <Tile key="p" icon={<FileText size={15} />} label="Posts" value={fmt(d?.posts)} to="/linkedin-analytics" />,
      <Tile key="i" icon={<Eye size={15} />} label="Impressionen gesamt" value={fmt(d?.impressions)} to="/linkedin-analytics" />,
      <Tile key="e" icon={<Flame size={15} />} label="Ø Engagement" value={engTxt} to="/linkedin-analytics" />,
      <Tile key="r" icon={<Radio size={15} />} label="Reichweiten-Rate" value={reachTxt} sub="Impr. je Post / Follower" to="/linkedin-analytics" />,
    ]
  } else if (mode === 'roi') {
    tiles = [
      <Tile key="ll" icon={<UserPlus size={15} />} label="Leads aus LinkedIn" value={fmt(d?.linkedinLeads)} to="/leads" />,
      <Tile key="pv" icon={<Euro size={15} />} label="Pipeline aus LinkedIn" value={fmtEur(d?.pipelineValue)} to="/deals" />,
      <Tile key="wv" icon={<Award size={15} />} label="Gewonnen aus LinkedIn" value={fmtEur(d?.wonValue)} to="/deals" />,
    ]
  } else {
    tiles = [
      <Tile key="u" icon={<Mail size={15} />} label="Ungelesen" value={fmt(d?.unread)} warn={(d?.unread || 0) > 0} sub={(d?.unread || 0) > 0 ? 'warten auf Antwort' : null} to="/nachrichten-analytics" />,
      <Tile key="in" icon={<Inbox size={15} />} label="Offene Einladungen" value={fmt(d?.invitesIn)} warn={(d?.invitesIn || 0) > 0} sub={(d?.invitesIn || 0) > 0 ? 'noch nicht angenommen' : null} to="/netzwerk-analytics" />,
      <Tile key="k" icon={<Rocket size={15} />} label="Aktive Kampagnen" value={fmt(d?.campaigns)} to="/netzwerk-analytics" />,
    ]
  }

  return (
    <div>
      <style>{`
        @keyframes lk-tile-pop { 0% { opacity:0; transform: translateY(6px) scale(.98) } 100% { opacity:1; transform:none } }
        .lk-tile-in { animation: lk-tile-pop .34s ease both; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted, #6B7280)', fontWeight: 600 }}><Flame size={13} /> Deine Analysen</span>
        {control}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 9, fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted, #6B7280)' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: '#0F766E' }} />Team-weit · alle Marken
      </div>

      {activeTeamId && (
        <div key={tick} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9, alignItems: 'start' }}>
          {tiles.map((el, i) => <div key={i}>{el}</div>)}
        </div>
      )}
    </div>
  )
}
