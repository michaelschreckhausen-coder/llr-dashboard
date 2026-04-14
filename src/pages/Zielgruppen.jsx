import React, { useEffect, useState } from 'react'
import { useTeam } from '../context/TeamContext'
import { supabase } from '../lib/supabase'

const P = 'var(--wl-primary, rgb(49,90,231))'

const DECISION_LEVELS = ['C-Level / Geschäftsführung','VP / Director','Head of / Abteilungsleitung','Mid-Management / Teamlead','Fachkraft / Spezialist','Freelancer / Selbstständig']
const COMPANY_SIZES = ['1-10 (Startup)','11-50 (Klein)','51-200 (Mittel)','201-1000 (Groß)','1000+ (Enterprise)','Egal']

const E0 = {name:'',is_active:true,job_titles:'',industries:'',company_size:'',decision_level:'',region:'',pain_points:'',needs_goals:'',topics_interests:'',trigger_events:'',outreach_tips:'',ai_summary:''}

// ─── Helper-Komponenten ────────────────────────────────────────────────────────
const In = ({v,fn,ph,style={}}) => <input value={v||''} onChange={e=>fn(e.target.value)} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none',...style}}/>
const Tx = ({v,fn,r=3,ph}) => <textarea value={v||''} onChange={e=>fn(e.target.value)} rows={r} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,resize:'vertical',boxSizing:'border-box',outline:'none'}}/>
const Lb = ({l,h}) => <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}}>{l}</div>{h&&<div style={{fontSize:11,color:'#aaa',marginBottom:4}}>{h}</div>}</div>
const Sc = ({t,ch}) => <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8ecf0',marginBottom:14}}><div style={{padding:'11px 16px',borderBottom:'1px solid #f0f0f0',fontWeight:700,fontSize:13}}>{t}</div><div style={{padding:'15px 16px',display:'flex',flexDirection:'column',gap:11}}>{ch}</div></div>
const Dd = ({v,fn,opts,ph}) => <select value={v||''} onChange={e=>fn(e.target.value)} style={{width:'100%',padding:'8px 11px',border:'1.5px solid #dde3ea',borderRadius:8,fontSize:13,background:'#fff',outline:'none'}}>{ph&&<option value="">{ph}</option>}{opts.map(o=><option key={o} value={o}>{o}</option>)}</select>

// ─── KI-Schnellstart für Zielgruppen ──────────────────────────────────────────
function QuickSetup({ session, onDone, onSkip }) {
  const [description, setDesc] = useState('')
  const [generating, setGen] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    if (!description.trim()) { setError('Bitte beschreibe deine Zielgruppe.'); return }
    setGen(true); setError('')
    try {
      const prompt = [
        'Erstelle ein LinkedIn-Zielgruppenprofil für B2B. Antworte NUR mit einem JSON-Objekt, ohne Kommentar.',
        '', '## Beschreibung der Zielgruppe:', description,
        '', '## Erwartetes JSON-Format:',
        JSON.stringify({
          name:'Name der Zielgruppe',
          job_titles:'Komma-getrennte Job-Titel',
          industries:'Komma-getrennte Branchen',
          company_size:'Unternehmensgröße',
          decision_level:'Entscheidungsebene',
          region:'Region/Markt',
          pain_points:'- Pain Point 1\n- Pain Point 2\n- Pain Point 3',
          needs_goals:'- Bedürfnis/Ziel 1\n- Bedürfnis/Ziel 2\n- Bedürfnis/Ziel 3',
          topics_interests:'Komma-getrennte Themen',
          trigger_events:'- Trigger 1\n- Trigger 2\n- Trigger 3',
          outreach_tips:'- Tipp 1\n- Tipp 2\n- Tipp 3',
          ai_summary:'100-150 Wörter Zusammenfassung für KI-Kontext'
        })
      ].join('\n')

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
        body: { type:'target_audience', prompt, userId: session.user.id }
      })
      if (fnErr) throw fnErr

      const text = fnData?.text || fnData?.result || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Kein JSON in der Antwort')
      const result = JSON.parse(jsonMatch[0])

      const audience = { ...E0, ...result, user_id: session.user.id }
      const { data: saved, error: saveErr } = await supabase.from('target_audiences').insert(audience).select().single()
      if (saveErr) throw saveErr
      onDone(saved)
    } catch (err) {
      setError(err.message || 'Fehler bei der Generierung')
    } finally { setGen(false) }
  }

  return (
    <div style={{ maxWidth:560, margin:'0 auto', padding:'24px 0' }}>
      <div style={{ textAlign:'center', marginBottom:24 }}>
        <div style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>🎯 Zielgruppe mit KI erstellen</div>
        <div style={{ fontSize:13, color:'#888' }}>Beschreibe deine Wunsch-Zielgruppe — KI erstellt das vollständige Profil</div>
      </div>
      <Sc t="Zielgruppe beschreiben" ch={<>
        <Lb l="Beschreibung" h="Wer sind die Menschen, die du auf LinkedIn erreichen willst?"/>
        <Tx v={description} fn={setDesc} r={5} ph="z.B. Marketing-Entscheider im DACH-Raum, die für B2B-SaaS-Unternehmen arbeiten und nach besseren Lead-Generierungs-Strategien suchen. Unternehmensgröße 50-500 Mitarbeiter."/>
        {error && <div style={{ color:'#e53e3e', fontSize:12 }}>{error}</div>}
        <button onClick={generate} disabled={generating} style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', opacity:generating?.6:1 }}>
          {generating ? '⏳ KI generiert...' : '🎯 Zielgruppe generieren'}
        </button>
      </>}/>
      <div style={{ textAlign:'center', marginTop:12 }}>
        <button onClick={onSkip} style={{ background:'none', border:'none', color:'#888', cursor:'pointer', fontSize:12, textDecoration:'underline' }}>+ Manuell erstellen</button>
      </div>
    </div>
  )
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function Zielgruppen({ session }) {
  const { team } = useTeam()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')
  const [edit, setEdit] = useState(null)
  const [tab, setTab] = useState('grundlagen')
  const [genSummary, setGenSummary] = useState(false)

  useEffect(() => { load() }, [session])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('target_audiences').select('*')
      .or(`user_id.eq.${session.user.id},is_shared.eq.true`)
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  async function save() {
    const { id, created_at, ...rest } = edit
    rest.updated_at = new Date().toISOString()
    if (id) {
      await supabase.from('target_audiences').update(rest).eq('id', id)
    } else {
      rest.user_id = session.user.id
      const { data } = await supabase.from('target_audiences').insert(rest).select().single()
      if (data) setEdit(data)
    }
    load()
  }

  async function remove(id) {
    if (!confirm('Zielgruppe wirklich löschen?')) return
    await supabase.from('target_audiences').delete().eq('id', id)
    load()
  }

  async function activate(id) {
    await supabase.from('target_audiences').update({ is_active: false }).eq('user_id', session.user.id)
    await supabase.from('target_audiences').update({ is_active: true }).eq('id', id)
    load()
  }

  async function generateSummary() {
    if (!edit) return
    setGenSummary(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate', {
        body: { type:'target_audience_summary', prompt: JSON.stringify(edit), userId: session.user.id }
      })
      if (!error && data) {
        const text = data.text || data.result || ''
        setEdit(prev => ({ ...prev, ai_summary: text }))
      }
    } catch(e) { console.error(e) }
    setGenSummary(false)
  }

  function u(field, val) { setEdit(prev => ({...prev, [field]:val})) }

  const tabBtn = (key, label) => (
    <button key={key} onClick={()=>setTab(key)}
      style={{ padding:'8px 16px', fontSize:13, fontWeight:tab===key?700:400, color:tab===key?P:'#888', background:'none', border:'none', borderBottom:tab===key?`2.5px solid ${P}`:'2.5px solid transparent', cursor:'pointer' }}>
      {label}
    </button>
  )

  // ─── List View ──────────────────────────────────────
  if (view === 'list') return (
    <div style={{ maxWidth:840, margin:'0 auto', padding:'20px 16px' }}>
      <div style={{ display:'flex', justifyContent:'center', gap:12, marginBottom:24 }}>
        <button onClick={()=>setView('wizard')} style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' }}>🎯 KI-Schnellstart</button>
        <button onClick={()=>{ setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('grundlagen') }}
          style={{ padding:'10px 24px', background:'#fff', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:14, cursor:'pointer' }}>+ Manuell erstellen</button>
      </div>

      {loading ? <div style={{textAlign:'center',color:'#888'}}>Laden...</div> : items.length === 0 ? (
        <div style={{ textAlign:'center', color:'#888', padding:40 }}>Noch keine Zielgruppe erstellt. Starte mit dem KI-Schnellstart!</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {items.map(v => (
            <div key={v.id} style={{ background:'#fff', borderRadius:12, border: v.is_active ? `2px solid ${P}` : '1.5px solid #e8ecf0', padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:16, fontWeight:700 }}>{v.name || 'Neue Zielgruppe'}</span>
                    {v.is_active && <span style={{ fontSize:10, background:'#e8f5e9', color:'#2e7d32', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>✓ Aktiv</span>}
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6 }}>
                    {v.job_titles && <span style={{ fontSize:11, color:'#666', background:'#f5f5f5', padding:'2px 8px', borderRadius:6 }}>👤 {v.job_titles.slice(0,60)}{v.job_titles.length>60?'…':''}</span>}
                    {v.industries && <span style={{ fontSize:11, color:'#666', background:'#f5f5f5', padding:'2px 8px', borderRadius:6 }}>🏢 {v.industries.slice(0,40)}{v.industries.length>40?'…':''}</span>}
                    {v.region && <span style={{ fontSize:11, color:'#666', background:'#f5f5f5', padding:'2px 8px', borderRadius:6 }}>📍 {v.region}</span>}
                    {v.decision_level && <span style={{ fontSize:11, color:'#666', background:'#f5f5f5', padding:'2px 8px', borderRadius:6 }}>📊 {v.decision_level}</span>}
                  </div>
                  {v.ai_summary && <div style={{ fontSize:12, color:'#666', lineHeight:1.4 }}>{v.ai_summary.slice(0,150)}{v.ai_summary.length>150?'…':''}</div>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginLeft:12 }}>
                  <button onClick={()=>{ setEdit(v); setView('editor'); setTab('grundlagen') }} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #dde3ea', background:'#fff', fontSize:12, cursor:'pointer' }}>Bearbeiten</button>
                  {!v.is_active && <button onClick={()=>activate(v.id)} style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${P}`, background:'rgba(49,90,231,0.08)', color:P, fontSize:12, cursor:'pointer' }}>Aktivieren</button>}
                  <button onClick={()=>remove(v.id)} style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#991B1B', fontSize:12, cursor:'pointer' }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ─── Wizard View ────────────────────────────────────
  if (view === 'wizard') return (
    <QuickSetup session={session} onDone={(saved) => { load(); setEdit(saved); setView('editor'); setTab('grundlagen') }} onSkip={() => { setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('grundlagen') }}/>
  )

  // ─── Editor View ────────────────────────────────────
  if (!edit) return null

  return (
    <div style={{ maxWidth:840, margin:'0 auto', padding:'20px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer' }}>←</button>
        <span style={{ fontSize:18, fontWeight:700 }}>Zielgruppe bearbeiten</span>
        <span style={{ fontSize:12, color:'#888' }}>Definiere dein LinkedIn-Zielpublikum</span>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <input value={edit.name||''} onChange={e=>u('name',e.target.value)} placeholder="Zielgruppen-Name"
          style={{ flex:1, padding:'10px 14px', border:'1.5px solid #dde3ea', borderRadius:8, fontSize:15, fontWeight:600 }}/>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#666' }}>
          <input type="checkbox" checked={edit.is_active} onChange={e=>u('is_active',e.target.checked)}/> Aktiv
        </label>
      </div>

      <div style={{ display:'flex', gap:0, borderBottom:'1.5px solid #eee', marginBottom:16 }}>
        {tabBtn('grundlagen','Grundlagen')}
        {tabBtn('herausforderungen','Herausforderungen')}
        {tabBtn('linkedin','LinkedIn-Kontext')}
        {tabBtn('summary','AI Summary')}
      </div>

      {/* ── Tab: Grundlagen ──────────────────────────── */}
      {tab==='grundlagen' && <>
        <Sc t="Berufliches Profil" ch={<>
          <Lb l="Job-Titel & Rollen" h="Welche Positionen hat deine Zielgruppe?"/>
          <Tx v={edit.job_titles} fn={v=>u('job_titles',v)} r={2} ph="z.B. Head of Marketing, CMO, Marketing Manager, Growth Lead"/>
          <Lb l="Branchen" h="In welchen Branchen arbeitet deine Zielgruppe?"/>
          <Tx v={edit.industries} fn={v=>u('industries',v)} r={2} ph="z.B. SaaS, E-Commerce, FinTech, Beratung"/>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1 }}>
              <Lb l="Unternehmensgröße"/>
              <Dd v={edit.company_size} fn={v=>u('company_size',v)} opts={COMPANY_SIZES} ph="Größe wählen..."/>
            </div>
            <div style={{ flex:1 }}>
              <Lb l="Entscheidungsebene"/>
              <Dd v={edit.decision_level} fn={v=>u('decision_level',v)} opts={DECISION_LEVELS} ph="Ebene wählen..."/>
            </div>
          </div>
          <Lb l="Region / Markt"/>
          <In v={edit.region} fn={v=>u('region',v)} ph="z.B. DACH, Deutschland, Europa"/>
        </>}/>
      </>}

      {/* ── Tab: Herausforderungen ───────────────────── */}
      {tab==='herausforderungen' && <>
        <Sc t="Pain Points" ch={<>
          <Lb l="Probleme & Herausforderungen" h="Welche Probleme beschäftigen diese Zielgruppe?"/>
          <Tx v={edit.pain_points} fn={v=>u('pain_points',v)} r={5} ph="- Schwierigkeit, qualifizierte Leads zu generieren&#10;- Hoher CPL bei bezahlten Kampagnen&#10;- Mangelnde Sichtbarkeit der Marke&#10;- Keine klare Content-Strategie"/>
        </>}/>
        <Sc t="Bedürfnisse & Ziele" ch={<>
          <Lb l="Was will diese Zielgruppe erreichen?" h="Prioritäten, Erwartungen, Wünsche"/>
          <Tx v={edit.needs_goals} fn={v=>u('needs_goals',v)} r={5} ph="- Mehr qualifizierte Inbound-Leads&#10;- Thought Leadership aufbauen&#10;- ROI-messbare Marketing-Strategie&#10;- Bessere Sales-Marketing-Alignment"/>
        </>}/>
      </>}

      {/* ── Tab: LinkedIn-Kontext ────────────────────── */}
      {tab==='linkedin' && <>
        <Sc t="Themen & Interessen" ch={<>
          <Lb l="Welche Themen bewegen diese Zielgruppe auf LinkedIn?" h="Content-Themen, Trends, Diskussionen"/>
          <Tx v={edit.topics_interests} fn={v=>u('topics_interests',v)} r={3} ph="z.B. B2B Marketing, Lead Generation, Account-Based Marketing, Marketing Automation, Content Marketing"/>
        </>}/>
        <Sc t="Trigger-Events" ch={<>
          <Lb l="Wann ist diese Zielgruppe besonders ansprechbar?" h="Karriere-Events, Unternehmensentwicklungen, Marktveränderungen"/>
          <Tx v={edit.trigger_events} fn={v=>u('trigger_events',v)} r={4} ph="- Neuer Job / Beförderung&#10;- Firmenwachstum / Funding-Runde&#10;- Neues Quartal / Budget-Planung&#10;- Konferenz-Teilnahme&#10;- Veröffentlichung eines LinkedIn-Posts"/>
        </>}/>
        <Sc t="Ansprache-Tipps" ch={<>
          <Lb l="Wie spricht man diese Zielgruppe am besten an?" h="Kommunikationsstil, Dos & Don'ts für den Erstkontakt"/>
          <Tx v={edit.outreach_tips} fn={v=>u('outreach_tips',v)} r={4} ph="- Auf konkrete Herausforderungen eingehen&#10;- Keine generischen Pitches&#10;- Gemeinsame Connections erwähnen&#10;- Wert bieten vor dem Fragen"/>
        </>}/>
      </>}

      {/* ── Tab: AI Summary ──────────────────────────── */}
      {tab==='summary' && <>
        <Sc t="Zielgruppen-Summary" ch={<>
          <Lb l="AI Summary" h="Wird als Kontext in KI-Generierungen verwendet"/>
          {edit.ai_summary ? (
            <Tx v={edit.ai_summary} fn={v=>u('ai_summary',v)} r={6}/>
          ) : (
            <div style={{ color:'#F59E0B', fontSize:11, fontWeight:600 }}>⚠️ Noch keine KI-Summary — generiere eine für bessere Ergebnisse</div>
          )}
          <button onClick={generateSummary} disabled={genSummary} style={{ padding:'8px 16px', background:'#7C3AED', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', opacity:genSummary?.6:1 }}>
            {genSummary ? '⏳ Generiert...' : '🔄 Summary generieren'}
          </button>
        </>}/>
      </>}

      <div style={{ display:'flex', justifyContent:'space-between', marginTop:20, paddingBottom:20 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ padding:'10px 24px', background:'none', border:'none', fontSize:14, cursor:'pointer', color:'#888' }}>Abbrechen</button>
        <button onClick={save} style={{ padding:'10px 28px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' }}>
          💾 Zielgruppe speichern
        </button>
      </div>
    </div>
  )
}
