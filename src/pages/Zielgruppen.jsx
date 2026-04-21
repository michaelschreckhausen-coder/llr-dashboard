import React, { useEffect, useState } from 'react'
import { useTeam } from '../context/TeamContext'
import { supabase } from '../lib/supabase'
import KnowledgeImporter from '../components/KnowledgeImporter'

const P = 'var(--wl-primary, rgb(49,90,231))'

const DECISION_LEVELS = ['C-Level / Geschäftsführung','VP / Director','Head of / Abteilungsleitung','Mid-Management / Teamlead','Fachkraft / Spezialist','Freelancer / Selbstständig']
const COMPANY_SIZES = ['1-10 (Startup)','11-50 (Klein)','51-200 (Mittel)','201-1000 (Groß)','1000+ (Enterprise)','Egal']

const E0 = {name:'',is_active:true,job_titles:'',industries:'',company_size:'',decision_level:'',region:'',pain_points:'',needs_goals:'',topics_interests:'',trigger_events:'',outreach_tips:'',ai_summary:'',hobbies:'',imported_context:'',file_name:'',file_url:'',file_type:'',source_url:'',linkedin_template_url:''}

const In = ({v,fn,ph,style={}}) => <input value={v||''} onChange={e=>fn(e.target.value)} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid var(--border)',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none',background:'var(--surface)',color:'var(--text-primary)',...style}}/>
const Tx = ({v,fn,r=3,ph}) => <textarea value={v||''} onChange={e=>fn(e.target.value)} rows={r} placeholder={ph} style={{width:'100%',padding:'8px 11px',border:'1.5px solid var(--border)',borderRadius:8,fontSize:13,resize:'vertical',boxSizing:'border-box',outline:'none',background:'var(--surface)',color:'var(--text-primary)'}}/>
const Lb = ({l,h}) => <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3}}>{l}</div>{h&&<div style={{fontSize:11,color:'var(--text-soft)',marginBottom:4}}>{h}</div>}</div>
const Sc = ({t,ch}) => <div style={{background:'var(--surface)',borderRadius:12,border:'1px solid var(--border)',marginBottom:14}}><div style={{padding:'11px 16px',borderBottom:'1px solid var(--border-soft)',fontWeight:700,fontSize:13,color:'var(--text-primary)'}}>{t}</div><div style={{padding:'15px 16px',display:'flex',flexDirection:'column',gap:11}}>{ch}</div></div>

// ─── KI-Schnellstart für Zielgruppen (erweitert) ──────────────────────────────
function QuickSetup({ session, onDone, onSkip }) {
  const [position, setPosition] = useState('')
  const [needs, setNeeds] = useState('')
  const [painPoints, setPainPoints] = useState('')
  const [hobbies, setHobbies] = useState('')
  const [importData, setImportData] = useState({file_name:'',file_url:'',file_type:'',source_url:'',linkedin_template_url:''})
  const [importedText, setImportedText] = useState('')
  const [generating, setGen] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    if (!position.trim() && !needs.trim() && !painPoints.trim() && !importedText && !importData.linkedin_template_url) {
      setError('Bitte mindestens ein Feld ausfüllen (Position, Bedürfnisse, Pain Points oder Kontext-Import).')
      return
    }
    setGen(true); setError('')
    try {
      const prompt = [
        'Erstelle ein LinkedIn-Zielgruppenprofil für B2B. Antworte NUR mit einem JSON-Objekt, ohne Kommentar.',
        '',
        '## Angaben zur Zielgruppe:',
        position ? 'Position / Rolle: ' + position : '',
        needs ? 'Bedürfnisse / Ziele: ' + needs : '',
        painPoints ? 'Pain Points: ' + painPoints : '',
        hobbies ? 'Hobbies / Interessen: ' + hobbies : '',
        importData.linkedin_template_url ? 'LinkedIn-Profil (Vorlage): ' + importData.linkedin_template_url : '',
        '',
        importedText ? '## Importierter Kontext:\n' + importedText.slice(0, 8000) : '',
        '',
        '## Erwartetes JSON-Format:',
        JSON.stringify({
          name:'Name der Zielgruppe (kurz)',
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
          hobbies:'Komma-getrennte Hobbies/Interessen außerhalb des Berufs',
          ai_summary:'100-150 Wörter Zusammenfassung für KI-Kontext'
        })
      ].filter(Boolean).join('\n')

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate', {
        body: { type:'target_audience', prompt, userId: session.user.id }
      })
      if (fnErr) throw fnErr

      const text = fnData?.text || fnData?.result || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Kein JSON in der Antwort')
      const result = JSON.parse(jsonMatch[0])

      const audience = {
        ...E0,
        ...result,
        ...importData,
        imported_context: importedText || '',
        user_id: session.user.id
      }
      const { data: saved, error: saveErr } = await supabase.from('target_audiences').insert(audience).select().single()
      if (saveErr) throw saveErr
      onDone(saved)
    } catch (err) {
      setError(err.message || 'Fehler bei der Generierung')
    } finally { setGen(false) }
  }

  function handleMetaChange(updates) { setImportData(prev => ({ ...prev, ...updates })) }
  function handleContentExtracted(text) { setImportedText(prev => prev ? (prev + '\n\n---\n\n' + text) : text) }

  return (
    <div style={{ maxWidth:720, margin:'0 auto', padding:'24px 0' }}>
      <div style={{ textAlign:'center', marginBottom:24 }}>
        <div style={{ fontSize:20, fontWeight:700, marginBottom:4, color:'var(--text-primary)' }}>🎯 Zielgruppe mit KI erstellen</div>
        <div style={{ fontSize:13, color:'var(--text-muted)' }}>Beschreibe deine Wunsch-Zielgruppe — KI erstellt das vollständige Profil</div>
      </div>

      <Sc t="👤 Wer ist deine Zielgruppe?" ch={<>
        <Lb l="Position / Rolle" h="Welche Position hat deine Zielgruppe im Unternehmen?"/>
        <In v={position} fn={setPosition} ph="z.B. Head of Marketing, CMO, Marketing Manager"/>
        <Lb l="Bedürfnisse / Ziele" h="Was will diese Zielgruppe erreichen?"/>
        <Tx v={needs} fn={setNeeds} r={3} ph="z.B. mehr qualifizierte Inbound-Leads, Thought Leadership aufbauen, ROI-messbare Marketing-Strategie"/>
        <Lb l="Pain Points" h="Welche Probleme und Herausforderungen beschäftigen sie?"/>
        <Tx v={painPoints} fn={setPainPoints} r={3} ph="z.B. schwache Lead-Qualität, hoher CPL, fehlende Sichtbarkeit, keine klare Content-Strategie"/>
        <Lb l="Hobbies / Interessen (optional)" h="Hilft der KI, authentische Hooks zu finden"/>
        <In v={hobbies} fn={setHobbies} ph="z.B. Bergsteigen, Slow-Food, Philosophie-Podcasts"/>
      </>}/>

      <Sc t="📥 Zusätzlicher Kontext (optional)" ch={<>
        <Lb l="Datei, Website oder LinkedIn-Profil als Vorlage"
            h="Lade Research-Dokumente hoch, importiere eine Website oder gib das LinkedIn-Profil einer idealen Person der Zielgruppe an"/>
        <KnowledgeImporter
          session={session}
          storagePrefix="audience"
          showLinkedIn={true}
          current={{...importData, id:'wizard'}}
          onMetaChange={handleMetaChange}
          onContentExtracted={handleContentExtracted}
          disabled={generating}
        />
        {importedText && (
          <div style={{ fontSize:11, color:'var(--success-text)', background:'var(--success-soft)', padding:'6px 10px', borderRadius:6 }}>
            ✓ {importedText.length.toLocaleString()} Zeichen Kontext importiert — fließen in KI-Generierung ein
          </div>
        )}
      </>}/>

      {error && <div style={{ color:'var(--danger)', fontSize:12, marginBottom:12 }}>{error}</div>}

      <div style={{ display:'flex', justifyContent:'center', gap:12 }}>
        <button onClick={generate} disabled={generating} style={{ padding:'12px 28px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:generating?'not-allowed':'pointer', opacity:generating?.6:1 }}>
          {generating ? '⏳ KI generiert...' : '🎯 Zielgruppe generieren'}
        </button>
        <button onClick={onSkip} disabled={generating} style={{ padding:'12px 20px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, fontSize:14, color:'var(--text-muted)', cursor:generating?'not-allowed':'pointer' }}>
          Manuell erstellen
        </button>
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
      await supabase.from('target_audiences').insert(rest)
    }
    await load()
    setView('list')
    setEdit(null)
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
  function uMulti(updates) { setEdit(prev => ({...prev, ...updates})) }

  const tabBtn = (key, label) => (
    <button key={key} onClick={()=>setTab(key)}
      style={{ padding:'8px 16px', fontSize:13, fontWeight:tab===key?700:400, color:tab===key?P:'var(--text-muted)', background:'none', border:'none', borderBottom:tab===key?`2.5px solid ${P}`:'2.5px solid transparent', cursor:'pointer' }}>
      {label}
    </button>
  )

  if (view === 'list') return (
    <div style={{ maxWidth:840, margin:'0 auto', padding:'20px 16px' }}>
      <div style={{ display:'flex', justifyContent:'center', gap:12, marginBottom:24 }}>
        <button onClick={()=>setView('wizard')} style={{ padding:'10px 24px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' }}>🎯 KI-Schnellstart</button>
        <button onClick={()=>{ setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('grundlagen') }}
          style={{ padding:'10px 24px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, fontSize:14, cursor:'pointer', color:'var(--text-primary)' }}>+ Manuell erstellen</button>
      </div>

      {loading ? <div style={{textAlign:'center',color:'var(--text-muted)'}}>Laden...</div> : items.length === 0 ? (
        <div style={{ textAlign:'center', color:'var(--text-muted)', padding:40 }}>Noch keine Zielgruppe erstellt. Starte mit dem KI-Schnellstart!</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {items.map(v => (
            <div key={v.id} style={{ background:'var(--surface)', borderRadius:12, border: v.is_active ? `2px solid ${P}` : '1.5px solid var(--border)', padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)' }}>{v.name || 'Neue Zielgruppe'}</span>
                    {v.is_active && <span style={{ fontSize:10, background:'var(--success-soft)', color:'var(--success-text)', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>✓ Aktiv</span>}
                    {v.linkedin_template_url && <span style={{ fontSize:10, background:'#ede9fe', color:'#6d28d9', padding:'2px 8px', borderRadius:10 }}>💼 LinkedIn</span>}
                    {v.source_url && <span style={{ fontSize:10, background:'#e0f2fe', color:'#0369a1', padding:'2px 8px', borderRadius:10 }}>🔗 URL</span>}
                    {v.file_name && <span style={{ fontSize:10, background:'#fef3c7', color:'#92400e', padding:'2px 8px', borderRadius:10 }}>📎 Datei</span>}
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6 }}>
                    {v.job_titles && <span style={{ fontSize:11, color:'var(--text-muted)', background:'var(--surface-muted)', padding:'2px 8px', borderRadius:6 }}>👤 {v.job_titles.slice(0,60)}{v.job_titles.length>60?'…':''}</span>}
                    {v.industries && <span style={{ fontSize:11, color:'var(--text-muted)', background:'var(--surface-muted)', padding:'2px 8px', borderRadius:6 }}>🏢 {v.industries.slice(0,40)}{v.industries.length>40?'…':''}</span>}
                    {v.region && <span style={{ fontSize:11, color:'var(--text-muted)', background:'var(--surface-muted)', padding:'2px 8px', borderRadius:6 }}>📍 {v.region}</span>}
                    {v.decision_level && <span style={{ fontSize:11, color:'var(--text-muted)', background:'var(--surface-muted)', padding:'2px 8px', borderRadius:6 }}>📊 {v.decision_level}</span>}
                  </div>
                  {v.ai_summary && <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4 }}>{v.ai_summary.slice(0,150)}{v.ai_summary.length>150?'…':''}</div>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginLeft:12 }}>
                  <button onClick={()=>{ setEdit(v); setView('editor'); setTab('grundlagen') }} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid var(--border)', background:'var(--surface)', fontSize:12, cursor:'pointer', color:'var(--text-primary)' }}>Bearbeiten</button>
                  {!v.is_active && <button onClick={()=>activate(v.id)} style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${P}`, background:'var(--primary-soft)', color:P, fontSize:12, cursor:'pointer' }}>Aktivieren</button>}
                  <button onClick={()=>remove(v.id)} style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'var(--danger-soft)', color:'var(--danger-text)', fontSize:12, cursor:'pointer' }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (view === 'wizard') return (
    <QuickSetup session={session} onDone={(saved) => { load(); setEdit(saved); setView('editor'); setTab('grundlagen') }} onSkip={() => { setEdit({...E0, user_id:session.user.id}); setView('editor'); setTab('grundlagen') }}/>
  )

  if (!edit) return null

  return (
    <div style={{ maxWidth:840, margin:'0 auto', padding:'20px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--text-primary)' }}>←</button>
        <span style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)' }}>Zielgruppe bearbeiten</span>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>Definiere dein LinkedIn-Zielpublikum</span>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <input value={edit.name||''} onChange={e=>u('name',e.target.value)} placeholder="Zielgruppen-Name"
          style={{ flex:1, padding:'10px 14px', border:'1.5px solid var(--border)', borderRadius:8, fontSize:15, fontWeight:600, background:'var(--surface)', color:'var(--text-primary)' }}/>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-muted)' }}>
          <input type="checkbox" checked={edit.is_active} onChange={e=>u('is_active',e.target.checked)}/> Aktiv
        </label>
      </div>

      <div style={{ display:'flex', gap:0, borderBottom:'1.5px solid var(--border-soft)', marginBottom:16, flexWrap:'wrap' }}>
        {tabBtn('grundlagen','Grundlagen')}
        {tabBtn('herausforderungen','Herausforderungen')}
        {tabBtn('linkedin','LinkedIn-Kontext')}
        {!edit?.id && tabBtn('import','Kontext-Import')}
        {tabBtn('summary','AI Summary')}
      </div>

      {tab==='grundlagen' && <>
        <Sc t="Berufliches Profil" ch={<>
          <Lb l="Job-Titel & Rollen" h="Welche Positionen hat deine Zielgruppe?"/>
          <Tx v={edit.job_titles} fn={v=>u('job_titles',v)} r={2} ph="z.B. Head of Marketing, CMO, Marketing Manager, Growth Lead"/>
          <Lb l="Branchen" h="In welchen Branchen arbeitet deine Zielgruppe?"/>
          <Tx v={edit.industries} fn={v=>u('industries',v)} r={2} ph="z.B. SaaS, E-Commerce, FinTech, Beratung"/>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1 }}>
              <Lb l="Unternehmensgröße"/>
              <In v={edit.company_size} fn={v=>u('company_size',v)} ph="z.B. 50-500 MA, Mittelstand, Enterprise"/>
            </div>
            <div style={{ flex:1 }}>
              <Lb l="Entscheidungsebene"/>
              <In v={edit.decision_level} fn={v=>u('decision_level',v)} ph="z.B. C-Level, VP, Director, Manager"/>
            </div>
          </div>
          <Lb l="Region / Markt"/>
          <In v={edit.region} fn={v=>u('region',v)} ph="z.B. DACH, Deutschland, Europa"/>
          <Lb l="Hobbies / Interessen (optional)" h="Hilft der KI, authentische Hooks zu finden"/>
          <In v={edit.hobbies} fn={v=>u('hobbies',v)} ph="z.B. Bergsteigen, Slow-Food, Philosophie-Podcasts"/>
        </>}/>
      </>}

      {tab==='herausforderungen' && <>
        <Sc t="Pain Points" ch={<>
          <Lb l="Probleme & Herausforderungen" h="Welche Probleme beschäftigen diese Zielgruppe?"/>
          <Tx v={edit.pain_points} fn={v=>u('pain_points',v)} r={5} ph="- Schwierigkeit, qualifizierte Leads zu generieren&#10;- Hoher CPL bei bezahlten Kampagnen&#10;- Mangelnde Sichtbarkeit der Marke&#10;- Keine klare Content-Strategie"/>
        </>}/>
        <Sc t="Bedürfnisse & Ziele" ch={<>
          <Lb l="Was will diese Zielgruppe erreichen?" h="Prioritäten, Erwartungen, Wünsche"/>
          <Tx v={edit.needs_goals} fn={v=>u('needs_goals',v)} r={5} ph="- Mehr qualifizierte Inbound-Leads&#10;- Thought Leadership aufbauen&#10;- ROI-messbare Marketing-Strategie"/>
        </>}/>
      </>}

      {tab==='linkedin' && <>
        <Sc t="Themen & Interessen" ch={<>
          <Lb l="Welche Themen bewegen diese Zielgruppe auf LinkedIn?" h="Content-Themen, Trends, Diskussionen"/>
          <Tx v={edit.topics_interests} fn={v=>u('topics_interests',v)} r={3} ph="z.B. B2B Marketing, Lead Generation, Account-Based Marketing, Marketing Automation, Content Marketing"/>
        </>}/>
        <Sc t="Trigger-Events" ch={<>
          <Lb l="Wann ist diese Zielgruppe besonders ansprechbar?" h="Karriere-Events, Unternehmensentwicklungen, Marktveränderungen"/>
          <Tx v={edit.trigger_events} fn={v=>u('trigger_events',v)} r={4} ph="- Neuer Job / Beförderung&#10;- Firmenwachstum / Funding-Runde&#10;- Neues Quartal / Budget-Planung"/>
        </>}/>
        <Sc t="Ansprache-Tipps" ch={<>
          <Lb l="Wie spricht man diese Zielgruppe am besten an?" h="Kommunikationsstil, Dos & Don'ts für den Erstkontakt"/>
          <Tx v={edit.outreach_tips} fn={v=>u('outreach_tips',v)} r={4} ph="- Auf konkrete Herausforderungen eingehen&#10;- Keine generischen Pitches&#10;- Gemeinsame Connections erwähnen"/>
        </>}/>
      </>}

      {tab==='import' && !edit?.id && <>
        <Sc t="📥 Kontext importieren" ch={<>
          <Lb l="Datei, Website oder LinkedIn-Profil" h="Lade Research-Dokumente hoch, importiere eine Website oder gib das LinkedIn-Profil einer idealen Person an"/>
          <KnowledgeImporter
            session={session}
            storagePrefix="audience"
            showLinkedIn={true}
            current={edit}
            onMetaChange={uMulti}
            onContentExtracted={(text) => u('imported_context', (edit.imported_context ? edit.imported_context+'\n\n---\n\n' : '')+text)}
          />
        </>}/>
        <Sc t="Importierter Kontext" ch={<>
          <Lb l="Extrahierter Text" h="Fließt automatisch in KI-Generierungen ein"/>
          <Tx v={edit.imported_context} fn={v=>u('imported_context',v)} r={10} ph="Noch kein Kontext importiert. Datei hochladen oder URL angeben..."/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text-soft)'}}>
            <span>{(edit.imported_context||'').length.toLocaleString()} Zeichen</span>
          </div>
        </>}/>
      </>}

      {tab==='summary' && <>
        <Sc t="Zielgruppen-Summary" ch={<>
          <Lb l="AI Summary" h="Wird als Kontext in KI-Generierungen verwendet"/>
          {edit.ai_summary ? (
            <Tx v={edit.ai_summary} fn={v=>u('ai_summary',v)} r={6}/>
          ) : (
            <div style={{ color:'var(--warm)', fontSize:11, fontWeight:600 }}>⚠️ Noch keine KI-Summary — generiere eine für bessere Ergebnisse</div>
          )}
          <button onClick={generateSummary} disabled={genSummary} style={{ padding:'8px 16px', background:'#7C3AED', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', opacity:genSummary?.6:1 }}>
            {genSummary ? '⏳ Generiert...' : '🔄 Summary generieren'}
          </button>
        </>}/>
      </>}

      <div style={{ display:'flex', justifyContent:'space-between', marginTop:20, paddingBottom:20 }}>
        <button onClick={()=>{ setView('list'); setEdit(null) }} style={{ padding:'10px 24px', background:'none', border:'none', fontSize:14, cursor:'pointer', color:'var(--text-muted)' }}>Abbrechen</button>
        <button onClick={save} style={{ padding:'10px 28px', background:P, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' }}>
          💾 Zielgruppe speichern
        </button>
      </div>
    </div>
  )
}
