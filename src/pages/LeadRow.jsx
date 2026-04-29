
// Memoized Row-Component für Leads-Liste
// Extrahiert aus Leads.jsx — alle IDs als boolean-Props, Handler stabil via useCallback im Parent.
// So werden bei State-Änderungen nur die betroffenen Rows re-gerendert (nicht alle 200+).
//
// Desktop-Layout: 5-Spalten-Grid (40 / 1fr / 240 / 70 / 30)
//   1) Avatar — wechselt bei :hover oder isChecked zur Checkbox
//   2) Lead-Identität (Name + Position·Firma + Inline-Badges)
//   3) Stage-Pill (klickbar → Picker) + Sub-Zeile "Status · letzter Touch · Follow-up"
//   4) Score-Badge (farbcodiert nach Heat)
//   5) Action-Pfeil → öffnet 3-Punkte-Menü
//
// Mobile-Layout: unverändert (kompakte Card mit Score-Bar links).

import React, { memo } from 'react'
import { useTeam } from '../context/TeamContext'

const STAGE_LABEL = {
  kein_deal:'Neu', neu:'Neu', prospect:'Kontaktiert', kontaktiert:'Kontaktiert',
  opportunity:'Gespräch', gespraech:'Gespräch', qualifiziert:'Qualifiziert',
  angebot:'Angebot', verhandlung:'Verhandlung',
  gewonnen:'Gewonnen', verloren:'Verloren',
  stage_custom1:'Stage 1', stage_custom2:'Stage 2', stage_custom3:'Stage 3'
}

const STAGE_COLOR = {
  kein_deal:'#94a3b8', neu:'#94a3b8', prospect:'rgb(0,48,96)', kontaktiert:'rgb(0,48,96)',
  opportunity:'#8b5cf6', gespraech:'#8b5cf6', qualifiziert:'#8b5cf6',
  angebot:'#f97316', verhandlung:'#f97316',
  gewonnen:'#22c55e', verloren:'#ef4444',
}

const STAGE_PICKER_OPTIONS = [
  ['kein_deal','Neu','#94a3b8'],
  ['prospect','Kontaktiert','rgb(0,48,96)'],
  ['opportunity','Gespräch','#8b5cf6'],
  ['angebot','Angebot','#f97316'],
  ['gewonnen','Gewonnen','#22c55e'],
  ['verloren','Verloren','#ef4444'],
]

const FOLLOWUP_QUICK_OPTIONS = [
  ['Heute', 0], ['Morgen', 1], ['In 3 Tagen', 3], ['In 7 Tagen', 7], ['In 14 Tagen', 14]
]

// Status-Funnel-Farben (Lead/LQL/MQN/MQL/SQL — NICHT die Deal-Stage)
const STATUS_DOT = { Lead:'#94A3B8', LQL:'#BA7517', MQN:'#378ADD', MQL:'#639922', SQL:'#1D9E75' }

const fullName = l => ((l.first_name||'') + ' ' + (l.last_name||'')).trim() || l.name || 'Unbekannt'

function relTouch(iso) {
  if (!iso) return null
  const d = new Date(iso), now = new Date()
  const mins = Math.floor((now - d) / 60000)
  if (mins < 60) return mins <= 1 ? 'gerade eben' : `vor ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `vor ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'gestern'
  if (days < 7) return `vor ${days}t`
  if (days < 30) return `vor ${Math.floor(days/7)}w`
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'short' })
}

function fuLabel(iso) {
  const d = new Date(iso), now = new Date()
  const days = Math.round((d - now) / 86400000)
  if (days === 0) return 'heute'
  if (days === 1) return 'morgen'
  if (days === -1) return 'gestern'
  if (days < 0) return `${Math.abs(days)}t über`
  if (days < 7) return `in ${days}t`
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'short' })
}

// Score-Badge: farbcodiert nach Heat (90+ rot, 70-89 amber, 40-69 blau, <40 grau)
function scoreColors(score) {
  if (score == null) return { bg:'transparent', color:'#CBD5E1' }
  if (score >= 90) return { bg:'#FCEBEB', color:'#791F1F' }
  if (score >= 70) return { bg:'#FAEEDA', color:'#633806' }
  if (score >= 40) return { bg:'#E6F1FB', color:'#0C447C' }
  return { bg:'#F1EFE8', color:'#444441' }
}

function LeadRowImpl({
  lead,
  // Display-Booleans (nicht die IDs selbst — wichtig für memo)
  isSelected,
  isChecked,
  isHovered,
  isStagePickerOpen,
  isFuPickerOpen,
  isRowMenuOpen,
  // Context / UI
  team,
  session,
  lists,
  isMobile,
  isNotebook,
  // Handler (stabil via useCallback im Parent)
  onSelect,
  onToggleCheck,
  onHoverEnter,
  onHoverLeave,
  onToggleStagePicker,
  onStageChange,
  onToggleFuPicker,
  onFollowupSet,
  onFollowupClear,
  onToggleRowMenu,
  onLogCall,
  onToggleFavorite,
  onToggleListMembership,
  onToggleTeamShare,
  onUnshare,
  onDelete,
  onNavigateToProfile,
}) {
  const { members } = useTeam()
  const stageColor = STAGE_COLOR[lead.deal_stage] || '#94a3b8'
  const hasStage   = lead.deal_stage && lead.deal_stage !== 'kein_deal'
  const hasFollowup = !!lead.next_followup
  const followupOverdue = hasFollowup && new Date(lead.next_followup) < new Date()

  // ── MOBILE ───────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        onClick={() => onNavigateToProfile(lead.id)}
        style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--surface)', borderBottom:'1px solid #EEEFF4', cursor:'pointer', borderLeft:`3px solid ${(lead.hs_score||0)>=70?'#ef4444':(lead.hs_score||0)>=40?'#f59e0b':'#e2e8f0'}` }}>
        <div style={{ width:40, height:40, borderRadius:'50%', background:`linear-gradient(135deg,rgb(0,48,96),rgb(100,140,240))`, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:14, fontWeight:700, flexShrink:0 }}>
          {lead.first_name?.[0] || lead.name?.[0] || '?'}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {fullName(lead)}
            {lead.is_shared && team && <span style={{ marginLeft:6, fontSize:9, fontWeight:800, background:'rgba(16,185,129,0.15)', color:'#059669', borderRadius:4, padding:'1px 5px' }}>👥</span>}
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {[lead.job_title||lead.headline, lead.company].filter(Boolean).join(' · ')}
          </div>
          {lead.next_followup && (
            <div style={{ fontSize:11, color:followupOverdue?'#ef4444':'rgb(0,48,96)', marginTop:2 }}>
              📅 {new Date(lead.next_followup).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}
              {followupOverdue ? ' überfällig' : ''}
            </div>
          )}
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
          {lead.hs_score > 0 && <span style={{ fontSize:13, fontWeight:800, color:(lead.hs_score||0)>=70?'#ef4444':(lead.hs_score||0)>=40?'#f59e0b':'rgb(0,48,96)' }}>{lead.hs_score}</span>}
          {hasStage && <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:99, background:stageColor+'18', color:stageColor }}>{STAGE_LABEL[lead.deal_stage]||lead.deal_stage}</span>}
          <span style={{ fontSize:18, color:'#CBD5E1' }}>›</span>
        </div>
      </div>
    )
  }

  // ── DESKTOP ───────────────────────────────────────────────
  // Avatar/Checkbox-Tausch: Checkbox sichtbar wenn isChecked ODER isHovered
  const showCheckbox = isChecked || isHovered
  const sc = scoreColors(lead.hs_score)
  const touchAt = lead.li_last_interaction_at || lead.updated_at
  const touchLabel = relTouch(touchAt)

  return (
    <div
      onClick={e => { if (e.target.closest('[data-row-menu]') || e.target.type==='checkbox') return; onSelect(lead) }}
      onMouseEnter={() => onHoverEnter(lead.id)}
      onMouseLeave={onHoverLeave}
      style={{
        display:'grid',
        gridTemplateColumns:'40px minmax(280px, 1fr) 240px 70px 30px',
        gap: 14,
        alignItems:'center',
        padding:'12px 20px',
        cursor:'pointer',
        background: isChecked
          ? 'rgba(0,48,96,0.06)'
          : isSelected
            ? 'rgba(0,48,96,0.04)'
            : isHovered
              ? '#F9FAFB'
              : 'var(--surface)',
        borderBottom:'1px solid #EEEFF4',
        transition:'background 0.1s',
        position:'relative',
      }}>

      {/* (1) Avatar / Checkbox */}
      <div onClick={e=>e.stopPropagation()} style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
        {showCheckbox ? (
          <input type="checkbox" checked={isChecked}
            onChange={e => onToggleCheck(lead.id, e.target.checked)}
            style={{ width:18, height:18, cursor:'pointer', accentColor:'var(--wl-primary, rgb(0,48,96))' }}/>
        ) : (
          lead.avatar_url ? (
            <img src={lead.avatar_url} alt="" style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover' }}/>
          ) : (
            <div style={{ width:36, height:36, borderRadius:'50%', background:`linear-gradient(135deg, rgb(0,48,96), rgb(100,140,240))`, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:13, fontWeight:700, flexShrink:0 }}>
              {(lead.first_name?.[0] || lead.name?.[0] || '?').toUpperCase()}
            </div>
          )
        )}
      </div>

      {/* (2) Lead-Identität */}
      <div style={{ minWidth:0, paddingRight:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
          <span
            onClick={e => { e.stopPropagation(); onNavigateToProfile(lead.id) }}
            title="Profil öffnen ↗"
            style={{ fontWeight:600, fontSize:14, color:'rgb(20,20,43)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth: isNotebook ? 200 : 320, cursor:'pointer', letterSpacing:'-0.005em' }}
            onMouseEnter={e=>{ e.currentTarget.style.color='var(--wl-primary, rgb(0,48,96))'; e.currentTarget.style.textDecoration='underline' }}
            onMouseLeave={e=>{ e.currentTarget.style.color='rgb(20,20,43)'; e.currentTarget.style.textDecoration='none' }}>
            {fullName(lead)}
          </span>
          {lead.is_favorite && <span style={{ fontSize:11, flexShrink:0 }}>⭐</span>}
          {new Date(lead.created_at).toDateString() === new Date().toDateString() && (
            <span style={{ fontSize:9, fontWeight:700, background:'#E0F2FE', color:'#0369A1', borderRadius:4, padding:'1px 5px', flexShrink:0, letterSpacing:'0.03em' }}>NEU</span>
          )}
          {lead.is_shared && team && (() => {
            const owner = members?.find(m => m.user_id === lead.user_id)
            const ownerName = owner?.profile?.full_name?.split(' ')?.[0] || owner?.profile?.email?.split('@')?.[0]
            const isOwn = lead.user_id === session?.user?.id
            return (
              <span title={isOwn?`Geteilt — klicken zum Aufheben`:`Von ${ownerName||'Teammitglied'}`}
                onClick={e => { e.stopPropagation(); if(!isOwn) return; onUnshare(lead.id) }}
                style={{ fontSize:9, fontWeight:800, background:'rgba(16,185,129,0.12)', color:'#059669', borderRadius:4, padding:'1px 6px', flexShrink:0, border:'1px solid rgba(16,185,129,0.25)', cursor:isOwn?'pointer':'default' }}>
                👥 {isOwn ? team.name : (ownerName || team.name)}
              </span>
            )
          })()}
        </div>
        <div style={{ fontSize:12, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {lead.original_source_detail === 'sevDesk Import' && (
            <span style={{ fontSize:10, fontWeight:700, background:'var(--surface-muted)', color:'#185FA5', border:'1px solid #BFDBFE', borderRadius:4, padding:'1px 5px', marginRight:5 }}>sevDesk</span>
          )}
          {[lead.job_title||lead.headline, lead.company].filter(Boolean).join(' · ')}
          {!lead.job_title && !lead.headline && !lead.company && !lead.original_source_detail && <span style={{ color:'#CBD5E1' }}>—</span>}
        </div>
      </div>

      {/* (3) Stage-Pill (klickbar) + Sub-Zeile "Status · vor Xh · 📅 …" */}
      <div onClick={e=>e.stopPropagation()} style={{ position:'relative', minWidth:0 }} data-row-menu>
        <div onClick={() => onToggleStagePicker(lead.id)} style={{ cursor:'pointer', marginBottom:3 }}>
          {hasStage ? (
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:99, background:stageColor+'18', color:stageColor, whiteSpace:'nowrap', border:'1px solid '+stageColor+'30' }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:stageColor }}/>
              {STAGE_LABEL[lead.deal_stage] || lead.deal_stage}
            </span>
          ) : (
            <span style={{ fontSize:11, color:isHovered?'#94A3B8':'#CBD5E1', padding:'3px 9px', borderRadius:99, background:'transparent', border:'1px dashed '+(isHovered?'#E4E5EB':'transparent') }}>
              + Stage
            </span>
          )}
        </div>
        <div style={{ fontSize:11, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', overflow:'hidden' }}>
          {lead.status && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:STATUS_DOT[lead.status] || '#94A3B8' }}/>
              <span style={{ fontWeight:500, color:'var(--text-muted)' }}>{lead.status}</span>
            </span>
          )}
          {touchLabel && lead.status && <span style={{ color:'#CBD5E1' }}>·</span>}
          {touchLabel && <span>{touchLabel}</span>}
          {hasFollowup && <span style={{ color:'#CBD5E1' }}>·</span>}
          {hasFollowup && (
            <span
              onClick={e => { e.stopPropagation(); onToggleFuPicker(lead.id) }}
              style={{ color:followupOverdue?'#DC2626':'#185FA5', cursor:'pointer', fontWeight:500 }}>
              📅 {fuLabel(lead.next_followup)}
            </span>
          )}
          {!hasFollowup && isHovered && (
            <>
              <span style={{ color:'#CBD5E1' }}>·</span>
              <span
                onClick={e => { e.stopPropagation(); onToggleFuPicker(lead.id) }}
                style={{ color:'#94A3B8', cursor:'pointer' }}>
                + Follow-up
              </span>
            </>
          )}
        </div>

        {/* Stage-Picker */}
        {isStagePickerOpen && (
          <>
            <div onClick={e=>{ e.stopPropagation(); onToggleStagePicker(lead.id) }} style={{ position:'fixed', inset:0, zIndex:998 }}/>
            <div data-row-menu style={{ position:'absolute', left:0, top:'calc(100% + 6px)', background:'var(--surface)', borderRadius:10, boxShadow:'0 8px 32px rgba(0,0,0,0.16)', border:'1px solid var(--border)', zIndex:9999, padding:'6px', minWidth:160 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--text-soft)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6, padding:'0 6px' }}>Stage wählen</div>
              {STAGE_PICKER_OPTIONS.map(([val, label, color]) => {
                const isCurrent = (lead.deal_stage||'kein_deal')===val
                return (
                  <button key={val}
                    onClick={e => { e.stopPropagation(); onStageChange(lead.id, val, lead.deal_stage) }}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:7, border:'none', background:isCurrent?color+'18':'transparent', color:'var(--text-primary)', fontSize:12, cursor:'pointer', textAlign:'left', transition:'background 0.1s' }}
                    onMouseEnter={e=>e.currentTarget.style.background=color+'18'}
                    onMouseLeave={e=>e.currentTarget.style.background=isCurrent?color+'18':'transparent'}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0 }}/>
                    <span style={{ fontWeight:isCurrent?700:400 }}>{label}</span>
                    {isCurrent && <span style={{ marginLeft:'auto', fontSize:10, color:color }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* FU-Picker */}
        {isFuPickerOpen && (
          <>
            <div onClick={e=>{ e.stopPropagation(); onToggleFuPicker(lead.id) }} style={{ position:'fixed', inset:0, zIndex:998 }}/>
            <div data-row-menu style={{ position:'absolute', left:0, top:'calc(100% + 6px)', background:'var(--surface)', borderRadius:10, boxShadow:'0 8px 32px rgba(0,0,0,0.16)', border:'1px solid var(--border)', zIndex:9999, padding:'10px', minWidth:180 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--text-soft)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Follow-up setzen</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {FOLLOWUP_QUICK_OPTIONS.map(([label, days]) => {
                  const dt = new Date(); dt.setDate(dt.getDate()+days)
                  const iso = dt.toISOString().split('T')[0]
                  return (
                    <button key={days}
                      onClick={e => { e.stopPropagation(); onFollowupSet(lead.id, iso, label) }}
                      style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--surface-muted)', fontSize:12, fontWeight:500, cursor:'pointer', color:'var(--text-primary)', textAlign:'left' }}>
                      {label}
                    </button>
                  )
                })}
                {hasFollowup && (
                  <button
                    onClick={e => { e.stopPropagation(); onFollowupClear(lead.id) }}
                    style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #FECACA', background:'transparent', fontSize:11, fontWeight:500, cursor:'pointer', color:'#DC2626', textAlign:'left', marginTop:4 }}>
                    × Entfernen
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* (4) Score-Badge */}
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        {lead.hs_score != null ? (
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', minWidth:36, height:24, padding:'0 8px', background:sc.bg, color:sc.color, fontSize:12, fontWeight:700, borderRadius:5, fontVariantNumeric:'tabular-nums' }}>
            {lead.hs_score}
          </div>
        ) : (
          <span style={{ fontSize:12, color:'#CBD5E1' }}>—</span>
        )}
      </div>

      {/* (5) Action-Pfeil → 3-Punkte-Menü */}
      <div style={{ position:'relative', display:'flex', justifyContent:'center' }} onClick={e=>e.stopPropagation()} data-row-menu>
        <button
          data-row-menu
          onClick={e => { e.stopPropagation(); onToggleRowMenu(lead.id) }}
          aria-label="Aktionen"
          style={{ width:24, height:24, border:'none', background:'transparent', color:isRowMenuOpen?'var(--wl-primary, rgb(0,48,96))':'var(--text-soft)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, transition:'all 0.15s', opacity: isRowMenuOpen ? 1 : (isHovered ? 0.95 : 0.4), transform: isHovered ? 'translateX(2px)' : 'none' }}>
          →
        </button>

        {isRowMenuOpen && (
          <>
            <div onClick={e => { e.stopPropagation(); onToggleRowMenu(lead.id) }}
              style={{ position:'fixed', inset:0, zIndex:998 }}/>
            <div data-row-menu style={{ position:'absolute', right:0, top:34, background:'var(--surface)', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.16)', border:'1px solid var(--border)', minWidth:220, zIndex:9999, padding:'6px 0', maxHeight:480, overflowY:'auto' }}>

              <button onClick={() => onNavigateToProfile(lead.id)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                onMouseEnter={e=>e.currentTarget.style.background='#F8F9FB'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                <span style={{ width:20, textAlign:'center' }}>👤</span> Profil öffnen
              </button>

              <button onClick={() => onLogCall(lead.id)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                onMouseEnter={e=>e.currentTarget.style.background='#F8F9FB'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                <span style={{ width:20, textAlign:'center' }}>📞</span> Anruf loggen
              </button>

              <div style={{ width:'100%' }}>
                <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:'var(--text-soft)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Follow-up setzen</div>
                {FOLLOWUP_QUICK_OPTIONS.map(([label, days]) => {
                  const d = new Date(); d.setDate(d.getDate()+days)
                  const iso = d.toISOString().split('T')[0]
                  return (
                    <button key={days}
                      onClick={() => onFollowupSet(lead.id, iso, label)}
                      style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 14px 7px 28px', background:'none', border:'none', cursor:'pointer', fontSize:12, color:lead.next_followup===iso?'var(--wl-primary, rgb(0,48,96))':'rgb(20,20,43)', textAlign:'left' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F8F9FB'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                      <span>{label}</span>
                      <span style={{ fontSize:11, color:'var(--text-soft)' }}>{new Date(iso).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}</span>
                    </button>
                  )
                })}
                {lead.next_followup && (
                  <button onClick={() => onFollowupClear(lead.id)}
                    style={{ width:'100%', display:'flex', alignItems:'center', padding:'7px 14px 7px 28px', background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#DC2626', textAlign:'left' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#FEF2F2'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                    ✕ Follow-up löschen
                  </button>
                )}
              </div>

              <button onClick={() => onToggleFavorite(lead.id, !lead.is_favorite)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'rgb(20,20,43)', textAlign:'left' }}
                onMouseEnter={e=>e.currentTarget.style.background='#F8F9FB'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                <span style={{ width:20, textAlign:'center' }}>{lead.is_favorite?'⭐':'☆'}</span> {lead.is_favorite?'Aus Favoriten':'Zu Favoriten'}
              </button>

              {lists.length > 0 && (
                <>
                  <div style={{ height:1, background:'#EEEFF4', margin:'4px 0' }}/>
                  <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:'var(--text-soft)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Liste zuweisen</div>
                  {lists.map(lst => {
                    const inList = lead.lead_list_members?.some(m => m.list_id === lst.id)
                    return (
                      <button key={lst.id}
                        onClick={() => onToggleListMembership(lead.id, lst, inList)}
                        style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'7px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:inList?lst.color:'rgb(20,20,43)', textAlign:'left' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#F8F9FB'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                        <span style={{ width:8, height:8, borderRadius:'50%', background:lst.color, flexShrink:0, marginLeft:6 }}/>
                        <span style={{ flex:1 }}>{lst.name}</span>
                        {inList && <span style={{ fontSize:12 }}>✓</span>}
                      </button>
                    )
                  })}
                </>
              )}

              {(lead.linkedin_url || lead.profile_url) && (
                <>
                  <div style={{ height:1, background:'#EEEFF4', margin:'4px 0' }}/>
                  <a href={lead.linkedin_url||lead.profile_url} target="_blank" rel="noreferrer"
                    onClick={() => onToggleRowMenu(lead.id)}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#0A66C2', textDecoration:'none' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#F8F9FB'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                    <span style={{ width:20, textAlign:'center', fontWeight:900, fontSize:12 }}>in</span> LinkedIn öffnen
                  </a>
                </>
              )}

              {team && lead.user_id === session?.user?.id && (
                <>
                  <div style={{ height:1, background:'#EEEFF4', margin:'4px 0' }}/>
                  <button onClick={() => onToggleTeamShare(lead.id, lead.is_shared)}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:lead.is_shared?'#059669':'rgb(20,20,43)', textAlign:'left' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#F8F9FB'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                    <span style={{ width:20, textAlign:'center' }}>👥</span> {lead.is_shared?`Sharing aufheben`:`Mit "${team.name}" teilen`}
                  </button>
                </>
              )}

              <div style={{ height:1, background:'#EEEFF4', margin:'4px 0' }}/>
              <button onClick={() => onDelete(lead.id)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#DC2626', textAlign:'left' }}
                onMouseEnter={e=>e.currentTarget.style.background='#FEF2F2'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                <span style={{ width:20, textAlign:'center' }}>🗑</span> Lead löschen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const LeadRow = memo(LeadRowImpl)
export default LeadRow
