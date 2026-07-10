// Strike2PersonaIdeas — Ideen-Inbox einer Persona (Phase 5a).
// Zeigt die generierten Ideen nach Funnel-Phase gruppiert; je Idee "→ In
// Redaktionsplan" (INSERT content_posts status='idee', Provenance in metadata +
// tags, kein Migration-Bedarf). Übernommene Ideen: dimmed + "Im Redaktionsplan ✓".
import React, { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAddons } from '../hooks/useAddons'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { STRIKE2_STEPS } from '../lib/strike2QuestionsCatalog'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const S2 = '#F97316'
const ADDON_SLUG = 'strike2-zielgruppen-plus'
const PHASE_ORDER = ['PER', 'INF', 'BEF', 'EVA', 'BEW', 'KEN-ABS', 'IMP-RUC']
const PHASE_TITLE = Object.fromEntries(STRIKE2_STEPS.map(s => [s.tag, s.title]))

function mapPlatform() { return 'linkedin' } // Leadesk LinkedIn-zentriert; content_type lebt in tags+metadata

export default function Strike2PersonaIdeas() {
  const { id } = useParams()
  const { subscribedSlugs, isLoading: addonsLoading } = useAddons()
  const { activeBrandVoice, brandVoices } = useBrandVoice() || {}
  // Redaktionsplan filtert per .in('brand_voice_id', selectedBVIds): Posts ohne BV
  // fallen aus dem Board → übernommene Ideen brauchen eine BV (aktive, sonst erste).
  const bvId = activeBrandVoice?.id || brandVoices?.[0]?.id || null
  const hasAddon = subscribedSlugs?.has?.(ADDON_SLUG) || false
  const [persona, setPersona] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyIdx, setBusyIdx] = useState(null)
  const [bulk, setBulk] = useState(false)
  const [feedback, setFeedback] = useState(null) // {type:'error'|'ok', msg} — In-DOM statt alert (Chrome-MCP-sichtbar)

  useEffect(() => {
    let m = true
    supabase.from('strike2_personas')
      .select('id, name, team_id, generated_ideas, generation_status')
      .eq('id', id).maybeSingle()
      .then(({ data }) => { if (m) { setPersona(data || null); setLoading(false) } })
    return () => { m = false }
  }, [id])

  const ideas = Array.isArray(persona?.generated_ideas) ? persona.generated_ideas : []

  const uebernehmen = useCallback(async (ideaIdx) => {
    const p = persona
    const idea = p.generated_ideas[ideaIdx]
    if (!idea || idea.taken_at) return null
    const { data: { user } } = await supabase.auth.getUser()
    // BV-Auflösung: Hook (auf /branding oft leer) → harter Fallback, der die
    // BrandVoiceContext-Priorität spiegelt, damit der Post in der AKTIVEN User-BV
    // landet (= worauf der Redaktionsplan-Filter defaulted), nicht der ältesten:
    //   1) user_preferences.active_brand_voice_id  2) eigene aktive Team-BV
    //   3) eigene Team-BV  4) irgendeine Team-BV. Ohne BV → Abbruch mit Hinweis.
    let resolvedBvId = bvId
    if (!resolvedBvId) {
      const { data: pref } = await supabase.from('user_preferences')
        .select('active_brand_voice_id').eq('user_id', user?.id).maybeSingle()
      resolvedBvId = pref?.active_brand_voice_id || null
    }
    if (!resolvedBvId) {
      const { data: bvs } = await supabase.from('brand_voices')
        .select('id, user_id, is_active').eq('team_id', p.team_id)
      const list = bvs || []
      const pick = list.find(b => b.user_id === user?.id && b.is_active)
        || list.find(b => b.user_id === user?.id)
        || list.find(b => b.is_active)
        || list[0]
      resolvedBvId = pick?.id || null
    }
    if (!resolvedBvId) {
      setFeedback({ type: 'error', msg: 'Keine Brand Voice im Team gefunden — der Post würde im Redaktionsplan ausgeblendet. Bitte erst eine Brand Voice anlegen, dann erneut übernehmen.' })
      return null
    }
    const payload = {
      user_id: user?.id, team_id: p.team_id, brand_voice_id: resolvedBvId, workspace: 'personal', platform: mapPlatform(),
      status: 'idee', title: idea.title, hook: idea.hook,
      content: (idea.hook ? idea.hook + '\n\n' : '') + (idea.beschreibung || ''),
      topic: idea.title,
      tags: ['strike2', idea.phase_tag, idea.content_type].filter(Boolean),
      metadata: { source: 'strike2', persona_id: p.id, phase_tag: idea.phase_tag, content_type: idea.content_type, target_format: idea.target_format, idea_index: ideaIdx },
    }
    const { data: newPost, error } = await supabase.from('content_posts').insert(payload).select('id').single()
    if (error || !newPost) {
      setFeedback({ type: 'error', msg: `Übernehmen fehlgeschlagen: ${error?.message || 'unbekannter Fehler'}` })
      return null
    }
    const updated = [...p.generated_ideas]
    updated[ideaIdx] = { ...updated[ideaIdx], taken_at: new Date().toISOString(), post_id: newPost.id }
    await supabase.from('strike2_personas').update({ generated_ideas: updated }).eq('id', p.id)
    setPersona({ ...p, generated_ideas: updated })
    setFeedback({ type: 'ok', msg: `„${idea.title}" in den Redaktionsplan übernommen.` })
    return newPost.id
  }, [persona, bvId])

  const uebernehmenOne = async (idx) => {
    setBusyIdx(idx); await uebernehmen(idx); setBusyIdx(null)
  }
  const uebernehmenAlle = async () => {
    setBulk(true)
    for (let i = 0; i < (persona?.generated_ideas || []).length; i++) {
      if (!persona.generated_ideas[i].taken_at) { setBusyIdx(i); await uebernehmen(i) }
    }
    setBusyIdx(null); setBulk(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Lädt…</div>
  if (!addonsLoading && !hasAddon) {
    return <div style={{ padding: '40px 28px', textAlign: 'center' }}><Link to="/marketplace" style={{ color: S2 }}>Strike2 Zielgruppen-Plus im Marketplace aktivieren →</Link></div>
  }
  if (!persona) return <div style={{ padding: '40px 28px', textAlign: 'center' }}><p style={{ color: '#64748B' }}>Zielgruppe nicht gefunden.</p><Link to="/branding/strike2-personas" style={{ color: PRIMARY }}>← Übersicht</Link></div>

  const takenCount = ideas.filter(i => i.taken_at).length
  const openCount = ideas.length - takenCount

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <Link to="/branding/strike2-personas" style={{ fontSize: 13, color: '#64748B', textDecoration: 'none' }}>← Übersicht</Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, margin: '12px 0 22px' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Ideen — {persona.name}</h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{ideas.length} Content-Ideen · {takenCount} im Redaktionsplan · {openCount} offen</p>
        </div>
        {openCount > 0 && (
          <button type="button" onClick={uebernehmenAlle} disabled={bulk}
            style={{ border: 'none', background: bulk ? '#CBD5E1' : S2, color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: bulk ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
            {bulk ? 'Übernehme…' : `Alle ${openCount} übernehmen`}
          </button>
        )}
      </div>

      {feedback && (
        <div style={{ borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, lineHeight: 1.5, wordBreak: 'break-word',
          background: feedback.type === 'error' ? '#FEF2F2' : '#ECFDF5', color: feedback.type === 'error' ? '#991B1B' : '#065F46',
          border: `1px solid ${feedback.type === 'error' ? '#FECACA' : '#A7F3D0'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>{feedback.type === 'error' ? '⚠ ' : '✓ '}{feedback.msg}</span>
            <button type="button" onClick={() => setFeedback(null)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontWeight: 600 }}>✕</button>
          </div>
        </div>
      )}

      {ideas.length === 0 ? (
        <div style={{ border: '1px dashed #FED7AA', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: '#9A3412', fontSize: 13.5 }}>
          Noch keine Ideen generiert. <Link to={`/branding/strike2-personas/${id}?step=8`} style={{ color: S2 }}>Zum Wizard →</Link>
        </div>
      ) : (
        PHASE_ORDER.filter(tag => ideas.some(i => i.phase_tag === tag)).map(tag => (
          <div key={tag} style={{ marginBottom: 26 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 999, background: '#FFF7ED', color: '#9A3412', marginBottom: 12 }}>
              {tag} · {PHASE_TITLE[tag] || tag}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ideas.map((idea, idx) => ({ idea, idx })).filter(x => x.idea.phase_tag === tag).map(({ idea, idx }) => {
                const taken = !!idea.taken_at
                return (
                  <div key={idx} style={{ border: '1.5px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--surface)', opacity: taken ? 0.6 : 1, borderColor: taken ? '#CBD5E1' : 'var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{idea.title}</div>
                        {idea.hook ? <div style={{ fontSize: 12.5, color: '#475569', fontStyle: 'italic', marginBottom: 4 }}>„{idea.hook}"</div> : null}
                        {idea.beschreibung ? <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.5 }}>{idea.beschreibung}</div> : null}
                        {idea.target_format ? <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>Format: {idea.target_format}</div> : null}
                      </div>
                      {taken ? (
                        <Link to="/redaktionsplan" title="Im Redaktionsplan ansehen"
                          style={{ fontSize: 12, fontWeight: 600, color: '#065F46', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          Im Redaktionsplan ✓
                        </Link>
                      ) : (
                        <button type="button" onClick={() => uebernehmenOne(idx)} disabled={busyIdx === idx || bulk}
                          style={{ border: 'none', background: PRIMARY, color: '#fff', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (busyIdx === idx || bulk) ? 0.6 : 1 }}>
                          {busyIdx === idx ? '…' : '→ In Redaktionsplan'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
