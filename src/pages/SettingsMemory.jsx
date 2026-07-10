// src/pages/SettingsMemory.jsx
// Memory-Settings: Opt-In-Toggle + "Was Leadesk gelernt hat"-Insight

import React, { useState, useEffect } from 'react'
import { Brain, Lock, PenLine, Pencil, Pin, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import SettingsTabs from '../components/SettingsTabs'
import { useTeam } from '../context/TeamContext'

const P = 'var(--wl-primary, #0A6FB0)'

export default function SettingsMemory({ session }) {
  const { activeTeamId } = useTeam()
  const [memEnabled, setMemEnabled] = useState(null) // null=unknown, true/false
  const [consentedAt, setConsentedAt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState({ generations: 0, edits: 0, picked: 0, brainstorms: 0 })
  const [topVariants, setTopVariants] = useState([])
  const [loading, setLoading] = useState(true)
  // Leadly-Lernmodus (privat / account / global)
  const [leadlyScope, setLeadlyScope] = useState(null)
  const [savingScope, setSavingScope] = useState(false)

  useEffect(() => {
    if (!session?.user?.id) return
    supabase
      .from('user_preferences')
      .select('memory_enabled, memory_consented_at, leadly_learning_scope')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setMemEnabled(data?.memory_enabled ?? null)
        setConsentedAt(data?.memory_consented_at || null)
        setLeadlyScope(data?.leadly_learning_scope || 'account')
      })
  }, [session?.user?.id])

  async function updateLeadlyScope(newScope) {
    if (!session?.user?.id || savingScope || newScope === leadlyScope) return
    setSavingScope(true)
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: session.user.id, leadly_learning_scope: newScope, updated_at: new Date().toISOString() },
              { onConflict: 'user_id' })
    setSavingScope(false)
    if (!error) setLeadlyScope(newScope)
    else console.warn('[SettingsMemory] update scope failed:', error.message)
  }

  useEffect(() => {
    if (!activeTeamId) return
    Promise.all([
      supabase.from('content_generations').select('id', { count: 'exact', head: true }).eq('team_id', activeTeamId),
      supabase.from('content_edits').select('id', { count: 'exact', head: true }).eq('team_id', activeTeamId),
      supabase.from('content_generations').select('id', { count: 'exact', head: true }).eq('team_id', activeTeamId).not('picked_variant_index', 'is', null),
      supabase.from('content_generations').select('id', { count: 'exact', head: true }).eq('team_id', activeTeamId).eq('kind', 'brainstorm'),
      supabase.from('content_generations').select('variants, picked_variant_index, kind, created_at').eq('team_id', activeTeamId).not('picked_variant_index', 'is', null).order('created_at', { ascending: false }).limit(5),
    ]).then(([gen, ed, pick, bs, top]) => {
      setStats({
        generations: gen.count || 0,
        edits: ed.count || 0,
        picked: pick.count || 0,
        brainstorms: bs.count || 0,
      })
      setTopVariants((top.data || []).map(g => {
        const v = g.variants?.[g.picked_variant_index]
        return { kind: g.kind, text: typeof v === 'string' ? v : (v?.text || JSON.stringify(v)).slice(0, 200), date: g.created_at }
      }))
      setLoading(false)
    })
  }, [activeTeamId])

  async function toggleMemory(enabled) {
    setSaving(true)
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: session.user.id,
        memory_enabled: enabled,
        memory_consented_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    setSaving(false)
    if (!error) {
      setMemEnabled(enabled)
      setConsentedAt(new Date().toISOString())
    }
  }

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto' }}>
      <SettingsTabs />

      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Memory & Personalisierung</div>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0, color:'rgb(20,20,43)' }}>Was Leadesk über dich gelernt hat</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
          Wenn aktiviert, merkt sich Leadesk wie du schreibst, welche Texte du behältst und welche du umschreibst — und macht zukünftige KI-Texte schrittweise mehr nach dir und weniger generisch.
        </p>
      </div>

      {/* Toggle */}
      <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', padding:'18px 22px', marginBottom:22, display:'flex', alignItems:'center', justifyContent:'space-between', gap:18 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)' }}>
            {memEnabled === true && 'Memory ist aktiv'}
            {memEnabled === false && '○ Memory ist deaktiviert'}
            {memEnabled === null && 'Noch nicht entschieden'}
          </div>
          {consentedAt && (
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
              Zuletzt geändert: {new Date(consentedAt).toLocaleString('de-DE')}
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => toggleMemory(false)} disabled={saving || memEnabled === false}
            style={{ padding:'9px 18px', borderRadius:9, border:'1px solid var(--border)', background: memEnabled === false ? '#F1F5F9' : 'transparent', color: memEnabled === false ? 'var(--text-primary)' : 'var(--text-muted)', fontSize:13, fontWeight:600, cursor: saving ? 'wait' : 'pointer' }}>
            Deaktivieren
          </button>
          <button onClick={() => toggleMemory(true)} disabled={saving || memEnabled === true}
            style={{ padding:'9px 22px', borderRadius:9, border:'none', background: memEnabled === true ? '#10B981' : P, color:'#fff', fontSize:13, fontWeight:700, cursor: saving ? 'wait' : 'pointer', boxShadow: memEnabled === true ? '0 2px 10px rgba(16,185,129,.25)' : '0 2px 10px rgba(10,111,176,.25)' }}>
            {memEnabled === true ? 'Aktiviert' : 'Aktivieren'}
          </button>
        </div>
      </div>

      {/* Leadly-Lernmodus */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Leadly-Lernmodus</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'rgb(20,20,43)' }}>Auf welcher Wissensbasis arbeitet Leadly für dich?</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 14px', lineHeight: 1.6 }}>
          Du entscheidest, ob Leadly nur aus deinen eigenen Konversationen lernt oder zusätzlich aus dem geteilten Wissen deines Teams.
          Diese Einstellung lässt sich jederzeit ändern und gilt nur für dich persönlich.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            { id: 'privat',  icon: <Lock size={16} strokeWidth={1.75}/>, title: 'Privat', desc: 'Leadly lernt ausschließlich aus deinen eigenen Konversationen. Nichts wird ans Team weitergegeben.' },
            { id: 'account', icon: <Users size={16} strokeWidth={1.75}/>, title: 'Team-Account', desc: 'Zusätzlich lernt Leadly aus geteilten Mustern deines Account-Teams. Patterns werden erst ab 3 beitragenden Mitgliedern aktiv (k-Anonymität).' },
            { id: 'global',  icon: '🌍', title: 'Leadesk-Community', desc: 'Zusätzlich anonymisierte Patterns aller Leadesk-Accounts. (Aktivierung in Phase 2 — derzeit gleichbedeutend mit Team-Account.)' },
          ].map(opt => {
            const active = leadlyScope === opt.id
            return (
              <button key={opt.id} onClick={() => updateLeadlyScope(opt.id)} disabled={savingScope}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: active ? `1.5px solid ${P}` : '1px solid var(--border)',
                  background: active ? 'rgba(10,111,176,0.04)' : 'var(--surface)',
                  cursor: savingScope ? 'wait' : 'pointer',
                  transition: 'all 0.15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 22 }}>{opt.icon}</div>
                  {active && <div style={{ fontSize: 11, fontWeight: 700, color: P, background: 'rgba(10,111,176,0.1)', padding: '2px 9px', borderRadius: 99 }}>Aktiv</div>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'rgb(20,20,43)', marginBottom: 4 }}>{opt.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{opt.desc}</div>
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, fontStyle: 'italic' }}>
          Datenschutz: bei „Team-Account" werden Konversations-Summaries vektorisiert und account-scoped gespeichert. Patterns sind erst ab 3 verschiedenen Beiträgern für andere Team-Mitglieder sichtbar.
        </div>
      </div>

      {/* Stats */}
      <div className="col-4" style={{ gap:10, marginBottom:22 }}>
        <StatCard icon={<PenLine size={18} strokeWidth={1.75}/>} label="KI-Generations" val={stats.generations} />
        <StatCard icon={<Pin size={18} strokeWidth={1.75}/>} label="Behalten" val={stats.picked} />
        <StatCard icon={<Brain size={18} strokeWidth={1.75}/>} label="Brainstorm-Sessions" val={stats.brainstorms} />
        <StatCard icon={<Pencil size={18} strokeWidth={1.75}/>} label="Edits gelernt" val={stats.edits} />
      </div>

      {/* Top-picked (was die KI sich gemerkt hat) */}
      <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', padding:'18px 22px' }}>
        <h3 style={{ fontSize:14, fontWeight:700, color:'rgb(20,20,43)', margin:'0 0 14px' }}>
          📚 Aus diesen letzten Picks lernt die KI gerade
        </h3>
        {loading && <div style={{ color:'var(--text-muted)', fontSize:13 }}>Lädt…</div>}
        {!loading && topVariants.length === 0 && (
          <div style={{ fontSize:13, color:'var(--text-muted)', fontStyle:'italic', padding:'24px 0', textAlign:'center' }}>
            Noch keine Picks. Sobald du im Content-Studio oder Brainstorm Texte behältst, erscheinen sie hier.
          </div>
        )}
        {topVariants.map((v, i) => (
          <div key={i} style={{ padding:'10px 14px', background:'#F8FAFC', borderRadius:8, borderLeft:'3px solid rgba(10,111,176,0.3)', marginBottom:8 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {v.kind} · {new Date(v.date).toLocaleDateString('de-DE')}
            </div>
            <div style={{ fontSize:13, color:'rgb(20,20,43)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{v.text}</div>
          </div>
        ))}
      </div>

      {/* Privacy-Hinweis */}
      <div style={{ marginTop:20, padding:'12px 16px', background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:10, fontSize:12, color:'#075985', lineHeight:1.6 }}>
        🔒 <strong>Datenschutz:</strong> Alle Memory-Daten sind team-scoped (Row-Level-Security). Niemand außerhalb deines Teams sieht sie. Jederzeit deaktivierbar — bestehende Einträge bleiben aber gespeichert (Löschung kann per Mail an support@leadesk.de angefordert werden).
      </div>
    </div>
  )
}

function StatCard({ icon, label, val }) {
  return (
    <div style={{ padding:'14px 16px', background:'var(--surface)', borderRadius:12, border:'1px solid var(--border)' }}>
      <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
      <div style={{ fontSize:22, fontWeight:800, color:'rgb(20,20,43)', lineHeight:1 }}>{val}</div>
      <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, marginTop:4 }}>{label}</div>
    </div>
  )
}
