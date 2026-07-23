// src/components/leadly/LinkedInAnalyticsTiles.jsx
//
// „Deine Analysen" — Analyse-Übersicht fürs Startseiten-Cockpit.
// Default: TEAM-WEIT (alle Marken aggregiert). Über den Umschalter oben rechts
// lassen sich per Checkbox einzelne Marken (einzeln oder kombiniert) auswählen —
// dann werden die markenscopeden Kennzahlen gefiltert. Der Block „LinkedIn → CRM"
// bleibt team-weit (Leads/Deals tragen keine Marke).
// Alle KPIs auf einen Blick, gruppiert, mehrspaltig. Jede Kachel = Deep-Link.

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserPlus, Mail, Rocket, Flame, Eye, FileText, Send, Inbox, Handshake, Radio, Euro, Award, ChevronDown, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import { useBrandVoice } from '../../context/BrandVoiceContext'

const fmt = n => (n == null ? '–' : Number(n).toLocaleString('de-DE'))
const sumLatest = (rows, keyCol, valCol) => {
  const latest = {}
  for (const r of (rows || [])) if (!(r[keyCol] in latest)) latest[r[keyCol]] = r
  return Object.values(latest).reduce((a, r) => a + (Number(r[valCol]) || 0), 0)
}

// ── Marken-Umschalter (Mehrfachauswahl per Checkbox) ──
function BrandFilter({ brands, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const nameOf = (b) => b.name || b.brand_name || 'Marke'
  const label = selected.length === 0
    ? 'Alle Marken'
    : selected.length === 1
      ? (nameOf(brands.find(b => b.id === selected[0]) || {}) )
      : `${selected.length} Marken`
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border, #E4E7EC)', background: 'var(--surface, #fff)', fontSize: 11.5, fontWeight: 600, color: 'var(--text-strong, #374151)', cursor: 'pointer' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: selected.length === 0 ? '#0F766E' : '#315AE7' }} />
        {label}
        <ChevronDown size={13} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, minWidth: 220, maxHeight: 300, overflowY: 'auto', background: 'var(--surface, #fff)', border: '1px solid var(--border, #E4E7EC)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.12)', padding: 6 }}>
          <button type="button" onClick={() => { onChange([]); }}
            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: selected.length === 0 ? '#F1F5F9' : 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text-strong, #111827)' }}>
            <span style={{ width: 15, height: 15, borderRadius: 4, border: '1.5px solid #0F766E', background: selected.length === 0 ? '#0F766E' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {selected.length === 0 && <Check size={11} color="#fff" strokeWidth={3} />}
            </span>
            Alle Marken · team-weit
          </button>
          <div style={{ height: 1, background: 'var(--border, #EEF0F4)', margin: '5px 4px' }} />
          {brands.map(b => {
            const on = selected.includes(b.id)
            return (
              <button key={b.id} type="button" onClick={() => toggle(b.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: on ? '#EEF2FF' : 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: 'var(--text-strong, #111827)' }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${on ? '#315AE7' : '#CBD5E1'}`, background: on ? '#315AE7' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {on && <Check size={11} color="#fff" strokeWidth={3} />}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(b)}</span>
                {b.account_type === 'company_page' && <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--text-muted, #9CA3AF)', flexShrink: 0 }}>Page</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function LinkedInAnalyticsTiles() {
  const nav = useNavigate()
  const { activeTeamId } = useTeam()
  const { brandVoices } = useBrandVoice()
  const [d, setD] = useState(null)
  const [tick, setTick] = useState(0)
  const [selected, setSelected] = useState([])   // [] = team-weit
  const brands = (brandVoices || []).filter(b => b && b.id)
  const selKey = selected.slice().sort().join(',')
  const filtered = selected.length > 0

  useEffect(() => {
    if (!activeTeamId) { setD(null); return }
    let cancelled = false
    const brandIn = (q) => (filtered ? q.in('brand_voice_id', selected) : q)
    ;(async () => {
      const out = { unread: null, invitesIn: null, invitesOut: null, campaigns: null, connections: null, followers: null, posts: null, impressions: null, engagement: null, acceptanceRate: null, invitesAccepted: null, linkedinLeads: null, pipelineValue: null, wonValue: null }
      const [{ data: nm }, { data: mm }, { data: cc }, { data: posts }] = await Promise.all([
        brandIn(supabase.from('linkedin_network_metrics').select('unipile_account_id, brand_voice_id, connections_total, followers_total, invites_pending_in, invites_pending_out, captured_on').eq('team_id', activeTeamId)).order('captured_on', { ascending: false }).limit(120),
        brandIn(supabase.from('linkedin_messaging_metrics').select('unipile_account_id, brand_voice_id, unread_threads, captured_on').eq('team_id', activeTeamId)).order('captured_on', { ascending: false }).limit(60),
        brandIn(supabase.from('la_campaigns').select('status, brand_voice_id').eq('team_id', activeTeamId)),
        brandIn(supabase.from('content_posts').select('id, brand_voice_id').eq('team_id', activeTeamId).not('linkedin_social_id', 'is', null)).limit(500),
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
      const { data: inv } = await brandIn(supabase.from('linkedin_invitations').select('status, brand_voice_id').eq('team_id', activeTeamId))
      const acc = (inv || []).filter(i => i.status === 'accepted').length
      const pend = (inv || []).filter(i => i.status === 'pending').length
      out.invitesAccepted = acc
      out.acceptanceRate = (acc + pend) > 0 ? acc / (acc + pend) : null
      // Cross-Domain (immer team-weit — Leads/Deals tragen keine Marke)
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
  }, [activeTeamId, selKey])   // eslint-disable-line react-hooks/exhaustive-deps

  const Tile = ({ icon, label, value, warn, to, sub, accentColor }) => {
    const accent = accentColor || '#0F766E'
    return (
      <button type="button" onClick={() => nav(to)} className="lk-tile-in"
        style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--surface, #fff)', border: '1px solid var(--border, #E4E7EC)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, width: '100%', position: 'relative', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: warn ? '#B45309' : accent }} />
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
  const reach = (d?.impressions && d?.followers && d?.posts) ? (d.impressions / d.posts) / d.followers : null
  const reachTxt = reach == null ? '–' : (reach * 100).toFixed(0) + ' %'

  const AMBER = '#B45309', TEAL = '#0F766E', BLUE = '#315AE7', GREEN = '#059669'
  const sections = [
    { label: 'Handlungsbedarf', color: AMBER, tiles: [
      <Tile key="u"  icon={<Mail size={15} />}   label="Ungelesen"          value={fmt(d?.unread)}     warn={(d?.unread || 0) > 0}    sub={(d?.unread || 0) > 0 ? 'warten auf Antwort' : null}    to="/netzwerk-analytics" />,
      <Tile key="in" icon={<Inbox size={15} />}  label="Offene Einladungen" value={fmt(d?.invitesIn)}   warn={(d?.invitesIn || 0) > 0} sub={(d?.invitesIn || 0) > 0 ? 'noch nicht angenommen' : null} to="/netzwerk-analytics" />,
      <Tile key="k"  icon={<Rocket size={15} />} label="Aktive Kampagnen"   value={fmt(d?.campaigns)}   to="/netzwerk-analytics" />,
    ] },
    { label: 'Netzwerk', color: TEAL, tiles: [
      <Tile key="c" icon={<UserPlus size={15} />}  label="Verbindungen"          value={fmt(d?.connections)} to="/netzwerk-analytics" />,
      <Tile key="f" icon={<Users size={15} />}     label="Follower"              value={fmt(d?.followers)}   to="/netzwerk-analytics" />,
      <Tile key="o" icon={<Send size={15} />}      label="Anfragen offen (raus)" value={fmt(d?.invitesOut)}  to="/netzwerk-analytics" />,
      <Tile key="a" icon={<Handshake size={15} />} label="Annahmequote"          value={pctTxt(d?.acceptanceRate)} sub={d?.invitesAccepted != null ? `${fmt(d.invitesAccepted)} angenommen` : null} to="/netzwerk-analytics" />,
    ] },
    { label: 'Content', color: BLUE, tiles: [
      <Tile key="p" icon={<FileText size={15} />} label="Posts"               value={fmt(d?.posts)}       accentColor={BLUE} to="/linkedin-analytics" />,
      <Tile key="i" icon={<Eye size={15} />}      label="Impressionen gesamt" value={fmt(d?.impressions)} accentColor={BLUE} to="/linkedin-analytics" />,
      <Tile key="e" icon={<Flame size={15} />}    label="Ø Engagement"        value={engTxt}             accentColor={BLUE} to="/linkedin-analytics" />,
      <Tile key="r" icon={<Radio size={15} />}    label="Reichweiten-Rate"    value={reachTxt} sub="Impr. je Post / Follower" accentColor={BLUE} to="/linkedin-analytics" />,
    ] },
    { label: filtered ? 'LinkedIn → CRM · team-weit' : 'LinkedIn → CRM', color: GREEN, tiles: [
      <Tile key="ll" icon={<UserPlus size={15} />} label="Leads aus LinkedIn"    value={fmt(d?.linkedinLeads)}   accentColor={GREEN} to="/leads" />,
      <Tile key="pv" icon={<Euro size={15} />}     label="Pipeline aus LinkedIn" value={fmtEur(d?.pipelineValue)} accentColor={GREEN} to="/deals" />,
      <Tile key="wv" icon={<Award size={15} />}    label="Gewonnen aus LinkedIn" value={fmtEur(d?.wonValue)}     accentColor={GREEN} to="/deals" />,
    ] },
  ]

  const legend = filtered
    ? (selected.length === 1 ? (brands.find(b => b.id === selected[0])?.name || brands.find(b => b.id === selected[0])?.brand_name || 'Marke') : `${selected.length} Marken ausgewählt`)
    : 'Team-weit · alle Marken'

  return (
    <div>
      <style>{`
        @keyframes lk-tile-pop { 0% { opacity:0; transform: translateY(6px) scale(.98) } 100% { opacity:1; transform:none } }
        .lk-tile-in { animation: lk-tile-pop .34s ease both; }
        .lk-analys-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap:9px; align-items:start; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted, #6B7280)', fontWeight: 600 }}><Flame size={13} /> Deine Analysen</span>
        {brands.length > 0 && <BrandFilter brands={brands} selected={selected} onChange={setSelected} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted, #6B7280)' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: filtered ? '#315AE7' : '#0F766E' }} />{legend}
      </div>

      {activeTeamId && (
        <div key={tick} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
          {sections.map((s) => (
            <div key={s.label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: s.color }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: s.color }}>{s.label}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--border, #EEF0F4)' }} />
              </div>
              <div className="lk-analys-grid">
                {s.tiles.map((el, i) => <div key={i}>{el}</div>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
