import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const P = 'rgb(49,90,231)'

const TRIGGER_OPTIONS = [
  { id:'score_above_70',   label:'Lead Score ≥ 70',          icon:'🔥', desc:'Wenn ein Lead Hot wird' },
  { id:'new_lead',         label:'Neuer Lead hinzugefügt',    icon:'👤', desc:'Wenn ein Lead erstellt wird' },
  { id:'followup_overdue', label:'Follow-up überfällig',      icon:'📅', desc:'Wenn das Follow-up-Datum verstrichen ist' },
  { id:'connected',        label:'LinkedIn-Verbindung',       icon:'🤝', desc:'Wenn ein Lead sich vernetzt' },
  { id:'stage_changed',    label:'Pipeline-Stage geändert',   icon:'📊', desc:'Wenn ein Lead eine Stage wechselt' },
  { id:'no_activity_7d',   label:'7 Tage keine Aktivität',    icon:'😴', desc:'Wenn kein Kontakt seit 7 Tagen' },
]

const ACTION_OPTIONS = [
  { id:'set_followup_3d',  label:'Follow-up in 3 Tagen',      icon:'📅' },
  { id:'set_followup_7d',  label:'Follow-up in 7 Tagen',      icon:'📅' },
  { id:'tag_hot',          label:'Tag "Hot" setzen',           icon:'🔥' },
  { id:'notify',           label:'Benachrichtigung senden',    icon:'🔔' },
  { id:'move_pipeline',    label:'In Pipeline verschieben',    icon:'💼' },
]

const DEFAULT_RULES = [
  { id:'r1', active:true,  trigger:'score_above_70',   action:'set_followup_3d', name:'Hot Lead → Follow-up', runs:0 },
  { id:'r2', active:true,  trigger:'followup_overdue', action:'notify',          name:'Überfälliges Follow-up → Alert', runs:0 },
  { id:'r3', active:false, trigger:'no_activity_7d',   action:'set_followup_7d', name:'Inaktiver Lead → Reaktivierung', runs:0 },
]

export default function Automatisierung({ session }) {
  const nav = useNavigate()
  const [rules, setRules] = useState(DEFAULT_RULES)
  const [showNew, setShowNew] = useState(false)
  const [newRule, setNewRule] = useState({ name:'', trigger:'score_above_70', action:'set_followup_3d' })
  const [leads, setLeads] = useState([])
  const [stats, setStats] = useState({ hot:0, overdue:0, inactive:0, newToday:0 })

  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from('leads').select('id,hs_score,next_followup,li_connection_status,updated_at,created_at,deal_stage').eq('user_id', session.user.id)
      .then(({ data }) => {
        const l = data || []
        setLeads(l)
        setStats({
          hot: l.filter(x => (x.hs_score||0) >= 70).length,
          overdue: l.filter(x => x.next_followup && new Date(x.next_followup) < new Date()).length,
          inactive: l.filter(x => (Date.now()-new Date(x.updated_at||x.created_at)) > 7*86400000).length,
          newToday: l.filter(x => new Date(x.created_at).toDateString()===new Date().toDateString()).length,
        })
      })
  }, [session])

  function addRule() {
    if (!newRule.name) return
    const r = { id: 'r'+Date.now(), active:true, ...newRule, runs:0 }
    setRules(prev => [...prev, r])
    setNewRule({ name:'', trigger:'score_above_70', action:'set_followup_3d' })
    setShowNew(false)
  }

  function toggleRule(id) {
    setRules(prev => prev.map(r => r.id===id ? {...r, active:!r.active} : r))
  }

  function deleteRule(id) {
    setRules(prev => prev.filter(r => r.id!==id))
  }

  const getTrigger = id => TRIGGER_OPTIONS.find(t=>t.id===id)
  const getAction  = id => ACTION_OPTIONS.find(a=>a.id===id)

  const inp = { padding:'8px 12px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' }

  return (
    <div style={{ maxWidth:860, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, color:'rgb(20,20,43)', margin:0 }}>⚡ Automatisierung</h1>
          <div style={{ fontSize:13, color:'#64748B', marginTop:6 }}>Wenn-Dann-Regeln für deinen Sales-Workflow</div>
        </div>
        <button onClick={() => setShowNew(true)}
          style={{ padding:'9px 18px', borderRadius:10, border:'none', background:P, color:'white', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 3px 10px rgba(49,90,231,0.3)' }}>
          + Neue Regel
        </button>
      </div>

      {/* Live Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label:'Hot Leads', val:stats.hot, icon:'🔥', color:'#ef4444', bg:'#FEF2F2', link:'/leads' },
          { label:'Follow-ups fällig', val:stats.overdue, icon:'📅', color:'#f59e0b', bg:'#FFFBEB', link:'/leads' },
          { label:'Inaktiv >7 Tage', val:stats.inactive, icon:'😴', color:'#94A3B8', bg:'#F8FAFC', link:'/leads' },
          { label:'Neue Leads heute', val:stats.newToday, icon:'👤', color:'#22c55e', bg:'#F0FDF4', link:'/leads' },
        ].map(s => (
          <div key={s.label} onClick={() => nav(s.link)} style={{ background:s.bg, borderRadius:14, border:`1px solid ${s.color}22`, padding:'14px 16px', cursor:'pointer', transition:'transform 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'}
            onMouseLeave={e=>e.currentTarget.style.transform=''}>
            <div style={{ fontSize:22, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:11, color:'#64748B', fontWeight:600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Regeln */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>
          Aktive Regeln ({rules.filter(r=>r.active).length}/{rules.length})
        </div>
        {rules.map(rule => {
          const t = getTrigger(rule.trigger)
          const a = getAction(rule.action)
          return (
            <div key={rule.id} style={{ background:'white', borderRadius:14, border:`1.5px solid ${rule.active?P+'33':'#E5E7EB'}`, padding:'16px 20px', marginBottom:10,
              opacity: rule.active ? 1 : 0.6, transition:'all 0.15s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                {/* Toggle */}
                <div onClick={() => toggleRule(rule.id)}
                  style={{ width:44, height:24, borderRadius:99, background:rule.active?P:'#E5E7EB', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:2, left:rule.active?20:2, width:20, height:20, borderRadius:'50%', background:'white', transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
                </div>

                {/* Regel-Inhalt */}
                <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'rgb(20,20,43)' }}>{rule.name}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:P, background:'rgba(49,90,231,0.1)', padding:'2px 8px', borderRadius:99 }}>
                      WENN {t?.icon} {t?.label}
                    </span>
                    <span style={{ fontSize:11, color:'#94A3B8' }}>→</span>
                    <span style={{ fontSize:11, fontWeight:700, color:'#22c55e', background:'#F0FDF4', padding:'2px 8px', borderRadius:99 }}>
                      DANN {a?.icon} {a?.label}
                    </span>
                  </div>
                </div>

                {/* Status */}
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  <span style={{ fontSize:11, color:'#94A3B8' }}>{rule.runs}x ausgeführt</span>
                  <span style={{ fontSize:11, fontWeight:700, color:rule.active?'#22c55e':'#94A3B8',
                    background:rule.active?'#F0FDF4':'#F8FAFC', padding:'2px 8px', borderRadius:99 }}>
                    {rule.active ? '● Aktiv' : '○ Pause'}
                  </span>
                  <button onClick={() => deleteRule(rule.id)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', fontSize:16, padding:'2px 6px', borderRadius:6 }}
                    onMouseEnter={e=>e.currentTarget.style.color='#ef4444'}
                    onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}>✕</button>
                </div>
              </div>
            </div>
          )
        })}
        {rules.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8', background:'white', borderRadius:14, border:'1px solid #E5E7EB' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>⚡</div>
            <div style={{ fontWeight:700, color:'#64748B' }}>Keine Regeln definiert</div>
            <div style={{ fontSize:12, marginTop:4 }}>Erstelle deine erste Wenn-Dann-Regel</div>
          </div>
        )}
      </div>

      {/* Neue Regel Modal */}
      {showNew && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}
          onClick={e => e.target===e.currentTarget && setShowNew(false)}>
          <div style={{ background:'white', borderRadius:20, padding:28, width:520, maxWidth:'95vw', boxShadow:'0 24px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'rgb(20,20,43)', marginBottom:20 }}>⚡ Neue Automatisierungsregel</div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }}>Regelname</label>
              <input value={newRule.name} onChange={e=>setNewRule(r=>({...r,name:e.target.value}))} placeholder="z.B. Hot Lead Sofort-Follow-up" style={inp}/>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }}>WENN (Auslöser)</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {TRIGGER_OPTIONS.map(t => (
                  <div key={t.id} onClick={() => setNewRule(r=>({...r,trigger:t.id}))}
                    style={{ padding:'10px 12px', borderRadius:10, border:`1.5px solid ${newRule.trigger===t.id?P:'#E5E7EB'}`, background:newRule.trigger===t.id?'rgba(49,90,231,0.06)':'#F8FAFC', cursor:'pointer' }}>
                    <div style={{ fontSize:16, marginBottom:4 }}>{t.icon}</div>
                    <div style={{ fontSize:12, fontWeight:600, color:newRule.trigger===t.id?P:'rgb(20,20,43)' }}>{t.label}</div>
                    <div style={{ fontSize:10, color:'#94A3B8', marginTop:2 }}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }}>DANN (Aktion)</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {ACTION_OPTIONS.map(a => (
                  <div key={a.id} onClick={() => setNewRule(r=>({...r,action:a.id}))}
                    style={{ padding:'8px 14px', borderRadius:10, border:`1.5px solid ${newRule.action===a.id?'#22c55e':'#E5E7EB'}`, background:newRule.action===a.id?'#F0FDF4':'#F8FAFC', cursor:'pointer', fontSize:12, fontWeight:600, color:newRule.action===a.id?'#16a34a':'#475569' }}>
                    {a.icon} {a.label}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowNew(false)} style={{ flex:1, padding:'10px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#F8FAFC', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
              <button onClick={addRule} disabled={!newRule.name} style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background:newRule.name?P:'#E5E7EB', color:newRule.name?'white':'#94A3B8', fontSize:13, fontWeight:700, cursor:newRule.name?'pointer':'not-allowed', boxShadow:newRule.name?'0 3px 10px rgba(49,90,231,0.3)':'none' }}>
                ✓ Regel erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div style={{ background:'linear-gradient(135deg,rgba(49,90,231,0.05),rgba(129,140,248,0.05))', borderRadius:14, border:'1px solid rgba(49,90,231,0.12)', padding:'16px 20px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:P, marginBottom:8 }}>💡 Wie funktioniert Automatisierung?</div>
        <div style={{ fontSize:12, color:'#475569', lineHeight:1.7 }}>
          Regeln werden täglich automatisch ausgewertet. Wenn eine Bedingung erfüllt ist, wird die definierte Aktion ausgeführt.
          Aktiviere oder deaktiviere Regeln per Toggle. Alle Aktionen werden im Activity-Log des jeweiligen Leads gespeichert.
        </div>
      </div>
    </div>
  )
}
