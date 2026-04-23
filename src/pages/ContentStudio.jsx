import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ModelSelector, { useDefaultModel } from '../components/ModelSelector'

const SparkIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
const CopyIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const ImproveIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
const RefreshIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.01-5.37"/></svg>
const VoiceIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
const HistoryIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>

function up1(f) {
  let s = 'Erstelle einen LinkedIn Post.' + ' Thema: ' + f.topic + '. Zielgruppe: ' + f.audience + '. Ziel: ' + f.goal
  if (f.insight) s += ' Key Insight: ' + f.insight
  s += ' Struktur: 1. HOOK (1-2 Zeilen Aufmerksamkeit) 2. HAUPTTEIL (Mehrwert, max 3 Punkte) 3. CTA. 150-250 Woerter, Zeilenumbrueche fuer Lesbarkeit.'
  return s
}
function up2(f) { return 'Thought Leadership Post. These: ' + f.topic + '. Argument: ' + f.argument + '. Zielgruppe: ' + f.audience + '. Struktur: Provokante Eroeffnung, 2-3 Argumente, Gegenmeinung, starkes Fazit + CTA. 180-250 Woerter.' }
function up3(f) { return 'Storytelling Post. Situation: ' + f.situation + '. Erkenntnis: ' + f.learning + '. Relevanz: ' + f.relevance + '. Struktur: Einstieg, Konflikt, Erkenntnis, Takeaway, CTA. 150-200 Woerter.' }
function up4(f) { return 'LinkedIn Karussell ' + (f.slides || 5) + ' Slides. Thema: ' + f.topic + '. Zielgruppe: ' + f.audience + '. Slide 1: Cover. Slides 2-' + (parseInt(f.slides || 5) - 1) + ': Ueberschrift + 2-3 Zeilen. Letzter Slide: CTA.' }
function up5(f) { return 'Verbessere in Brand Voice. ' + (f.improve_goal ? 'Ziel: ' + f.improve_goal + '. ' : '') + 'ORIGINAL: --- ' + f.original_text + ' --- Nur den verbesserten Text.' }

const TEMPLATES = [
  { id: 'linkedin_post', label: 'LinkedIn Post', icon: '📝', description: 'Aufmerksamkeitsstarker B2B-Post',
    fields: [{key:'topic',label:'Thema',placeholder:'z.B. KI im Vertrieb'},{key:'audience',label:'Zielgruppe',placeholder:'z.B. B2B Sales Manager DACH'},{key:'goal',label:'Ziel',placeholder:'z.B. Leads generieren'},{key:'insight',label:'Key Insight (optional)',placeholder:'z.B. Persoenliche Erfahrung'}],
    userPrompt: up1 },
  { id: 'thought_leadership', label: 'Thought Leadership', icon: '🧠', description: 'Positioniere dich als Experte',
    fields: [{key:'topic',label:'These',placeholder:'z.B. Cold Calls sind tot'},{key:'argument',label:'Hauptargument',placeholder:'3 Gruende...'},{key:'audience',label:'Zielgruppe',placeholder:'Vertriebsleiter'}],
    userPrompt: up2 },
  { id: 'storytelling', label: 'Storytelling', icon: '📖', description: 'Geschichte mit Mehrwert',
    fields: [{key:'situation',label:'Situation',placeholder:'Ich habe...'},{key:'learning',label:'Erkenntnis',placeholder:'Was gelernt?'},{key:'relevance',label:'Relevanz',placeholder:'Warum wichtig?'}],
    userPrompt: up3 },
  { id: 'carousel', label: 'Karussell-Text', icon: '🎠', description: 'LinkedIn Karussell',
    fields: [{key:'topic',label:'Thema',placeholder:'5 LinkedIn-Fehler'},{key:'slides',label:'Anzahl Slides',placeholder:'5',type:'number'},{key:'audience',label:'Zielgruppe',placeholder:'B2B Founder'}],
    userPrompt: up4 },
  { id: 'improve', label: '✨ Text verbessern', icon: '✨', description: 'Text in Brand Voice umschreiben',
    fields: [{key:'original_text',label:'Original-Text',placeholder:'Fuege deinen Text ein...',multiline:true},{key:'improve_goal',label:'Ziel (optional)',placeholder:'Staerkerer Hook, kuerzere Saetze'}],
    userPrompt: up5 },
]

function buildSystemPrompt(bv, ignoreBV) {
  if (ignoreBV || !bv) return 'Du bist LinkedIn B2B Experte. Professionell, klar, praegnant. Keine generischen Floskeln. Auf Deutsch.'
  const parts = [
    bv.ai_summary || '',
    bv.personality ? 'Persoenlichkeit: ' + bv.personality : '',
    bv.tone_attributes && bv.tone_attributes.length ? 'Ton: ' + bv.tone_attributes.join(', ') : '',
    bv.formality === 'du' ? 'Ansprache: Du-Form' : bv.formality === 'sie' ? 'Ansprache: Sie-Form' : '',
    bv.word_choice ? 'Wortwahl: ' + bv.word_choice : '',
    bv.sentence_style ? 'Satzstruktur: ' + bv.sentence_style : '',
    bv.dos ? 'DO: ' + bv.dos : '',
    bv.donts ? 'DONT: ' + bv.donts : '',
    bv.target_audience ? 'Zielgruppe: ' + bv.target_audience : '',
  ].filter(Boolean).join(' | ')
  return 'Du bist LinkedIn Ghostwriter. BRAND VOICE (VERPFLICHTEND): ' + parts + ' Exakt diese Wortwahl, Satzstruktur und Tonalitaet. Kein generischer AI-Stil. Auf Deutsch.'
}

function BrandVoiceBanner({ bv, loading, ignoreBV, onToggle }) {
  if (loading) return <div style={{padding:'11px 16px',borderRadius:10,background:'rgb(238,241,252)',border:'1px solid var(--border)',marginBottom:18,fontSize:12,color:'var(--text-muted)'}}>Laedt Brand Voice...</div>
  if (!bv) return (
    <div style={{padding:'12px 16px',borderRadius:10,background:'#FFFBEB',border:'1px solid #FDE68A',marginBottom:18}}>
      <span style={{fontSize:13,fontWeight:700,color:'#92400E'}}>Keine Brand Voice aktiv - </span>
      <a href="/brand-voice" style={{color:'var(--wl-primary, rgb(49,90,231))',fontWeight:700}}>Brand Voice erstellen</a>
    </div>
  )
  return (
    <div style={{padding:'12px 16px',borderRadius:10,background:ignoreBV?'rgb(238,241,252)':'#F0FDF4',border:'1px solid '+(ignoreBV?'#E5E7EB':'#BBF7D0'),marginBottom:18,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <VoiceIcon/>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:ignoreBV?'#475569':'#166534'}}>
            {ignoreBV ? 'Brand Voice deaktiviert' : 'Brand Voice aktiv: ' + bv.name}
          </div>
          <div style={{fontSize:11,color:ignoreBV?'#94A3B8':'#059669'}}>
            {ignoreBV ? 'Standard B2B-Stil' : 'Content wird in deiner Brand Voice generiert'}
          </div>
        </div>
      </div>
      <div onClick={onToggle} style={{width:36,height:20,borderRadius:999,background:ignoreBV?'#E5E7EB':'#22C55E',position:'relative',cursor:'pointer',flexShrink:0}}>
        <div style={{width:16,height:16,borderRadius:'50%',background:'var(--surface)',position:'absolute',top:2,left:ignoreBV?2:18,boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
      </div>
    </div>
  )
}

export default function ContentStudio({ session }) {
  const [activeTemplate, setActiveTemplate] = useState(TEMPLATES[0])
  const [fields, setFields]     = useState({})
  const [result, setResult]     = useState('')
  const [generating, setGen]    = useState(false)
  const [selectedModel, setSelectedModel] = useDefaultModel(session)
  const [improving, setImp]     = useState(false)
  const [copied, setCopied]     = useState(false)
  const [brandVoice, setBV]     = useState(null)
  const [bvLoad, setBvLoad]     = useState(true)
  const [ignoreBV, setIgnoreBV] = useState(false)
  const [history, setHistory]   = useState([])
  const [showHist, setShowHist] = useState(false)
  const [flash, setFlash]       = useState(null)

  const loadBV = useCallback(async () => {
    setBvLoad(true)
    const { data } = await supabase.from('brand_voices').select('*').eq('user_id', session.user.id).eq('is_active', true).single()
    setBV(data || null)
    setBvLoad(false)
  }, [session.user.id])

  const loadHist = useCallback(async () => {
    const { data } = await supabase.from('content_history').select('*').eq('user_id', session.user.id).order('created_at', {ascending:false}).limit(20)
    setHistory(data || [])
  }, [session.user.id])

  useEffect(() => { loadBV(); loadHist() }, [loadBV, loadHist])

  async function generate() {
    const req = activeTemplate.fields.filter(f => !['insight','improve_goal'].includes(f.key))
    const miss = req.find(f => !fields[f.key] || !fields[f.key].trim())
    if (miss) { showFlash('Bitte "' + miss.label + '" ausfuellen', 'error'); return }
    setGen(true); setResult('')
    try {
      const { data: d } = await supabase.functions.invoke('generate', { body: { type: 'content_studio', systemPrompt: buildSystemPrompt(brandVoice, ignoreBV), prompt: activeTemplate.userPrompt(fields), template: activeTemplate.id, model: selectedModel } })
      const text = d.text || d.content || d.comment || d.about || ''
      if (text) {
        setResult(text)
        await supabase.from('content_history').insert({ user_id: session.user.id, template_id: activeTemplate.id, template_label: activeTemplate.label, input_fields: fields, generated_text: text, brand_voice_id: brandVoice ? brandVoice.id : null, brand_voice_snapshot: ignoreBV ? null : (brandVoice ? brandVoice.ai_summary : null), ignored_brand_voice: ignoreBV })
        loadHist()
      } else showFlash('Fehler: ' + (d.error || 'Unbekannt'), 'error')
    } catch(e) { showFlash('Fehler: ' + e.message, 'error') }
    setGen(false)
  }

  async function improve() {
    if (!result.trim() || !brandVoice) { showFlash(result.trim() ? 'Keine Brand Voice' : 'Kein Text', 'error'); return }
    setImp(true)
    try {
      const { data: d } = await supabase.functions.invoke('generate', { body: { type: 'content_studio', systemPrompt: buildSystemPrompt(brandVoice, false), prompt: 'Schreibe in Brand Voice um. Behalte Kernbotschaft. ORIGINAL: --- ' + result + ' --- Nur den verbesserten Text.', template: 'improve', model: selectedModel } })
      const text = d.text || d.content || d.comment || d.about || ''
      if (text) { setResult(text); showFlash('Text verbessert!') }
    } catch(e) { showFlash('Fehler: ' + e.message, 'error') }
    setImp(false)
  }

  const copy = () => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2500) }
  const showFlash = (msg, type) => { setFlash({msg, type: type || 'success'}); setTimeout(() => setFlash(null), 4000) }
  const selTpl = (tpl) => { setActiveTemplate(tpl); setFields({}); setResult('') }
  const inp = {width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:9,fontSize:13,fontFamily:'inherit',boxSizing:'border-box',outline:'none'}

  return (
    <div style={{maxWidth:1100}}>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:24}}>
        <button onClick={() => setShowHist(!showHist)} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',fontSize:12,fontWeight:600,color:'#475569',cursor:'pointer'}}>
          <HistoryIcon/> Verlauf ({history.length})
        </button>
      </div>

      <BrandVoiceBanner bv={brandVoice} loading={bvLoad} ignoreBV={ignoreBV} onToggle={() => setIgnoreBV(!ignoreBV)}/>

      {flash && (
        <div style={{padding:'10px 16px',borderRadius:9,marginBottom:16,fontSize:13,fontWeight:600,background:flash.type==='error'?'#FEF2F2':'#F0FDF4',color:flash.type==='error'?'#991B1B':'#166534',border:'1px solid '+(flash.type==='error'?'#FCA5A5':'#BBF7D0')}}>
          {flash.type === 'error' ? 'Fehler: ' : 'OK: '}{flash.msg}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:20}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Template waehlen</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {TEMPLATES.map(tpl => (
              <button key={tpl.id} onClick={() => selTpl(tpl)} style={{padding:'11px 14px',borderRadius:10,textAlign:'left',cursor:'pointer',border:activeTemplate.id===tpl.id?'2px solid rgb(49,90,231)':'1.5px solid #E2E8F0',background:activeTemplate.id===tpl.id?'rgba(49,90,231,0.08)':'#fff'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:16}}>{tpl.icon}</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:activeTemplate.id===tpl.id?'var(--wl-primary, rgb(49,90,231))':'rgb(20,20,43)'}}>{tpl.label}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:1}}>{tpl.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{background:'var(--surface)',borderRadius:14,border:'1px solid var(--border)',padding:'20px 22px'}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:20}}>{activeTemplate.icon}</span>{activeTemplate.label}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {activeTemplate.fields.map(field => (
                <div key={field.key}>
                  <label style={{fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:5}}>{field.label}</label>
                  {field.multiline
                    ? <textarea value={fields[field.key]||''} onChange={e => setFields(f => ({...f,[field.key]:e.target.value}))} placeholder={field.placeholder} rows={5} style={{...inp,resize:'vertical',lineHeight:1.6}}/>
                    : <input type={field.type||'text'} value={fields[field.key]||''} onChange={e => setFields(f => ({...f,[field.key]:e.target.value}))} placeholder={field.placeholder} style={inp}/>
                  }
                </div>
              ))}
            </div>
            <button onClick={generate} disabled={generating} style={{marginTop:18,width:'100%',padding:'12px',borderRadius:999,border:'none',background:generating?'#94A3B8':'linear-gradient(135deg,rgb(49,90,231),#8B5CF6)',color:'#fff',fontSize:14,fontWeight:700,cursor:generating?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {generating ? 'Generiere...' : <><SparkIcon/> Jetzt generieren</>}
            </button>
          </div>

          {result && (
            <div style={{background:'var(--surface)',borderRadius:14,border:'1px solid var(--border)',overflow:'hidden'}}>
              <div style={{padding:'12px 16px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#FAFAFA'}}>
                <div style={{fontWeight:700,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
                  Generierter Text
                  {brandVoice && !ignoreBV && <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999,background:'rgba(49,90,231,0.08)',color:'var(--wl-primary, rgb(49,90,231))',border:'1px solid #BFDBFE'}}>Brand Voice</span>}
                </div>
                <div style={{display:'flex',gap:7}}>
                  {brandVoice && !ignoreBV && (
                    <button onClick={improve} disabled={improving} style={{padding:'5px 12px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#7C3AED,#A855F7)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                      <ImproveIcon/>{improving ? 'Verbessere...' : 'Improve with Brand Voice'}
                    </button>
                  )}
                  <button onClick={generate} disabled={generating} style={{padding:'5px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',color:'#475569',fontSize:11,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                    <RefreshIcon/> Neu
                  </button>
                  <button onClick={copy} style={{padding:'5px 12px',borderRadius:8,border:'1px solid '+(copied?'#BBF7D0':'#E5E7EB'),background:copied?'#F0FDF4':'#fff',color:copied?'#166534':'#475569',fontSize:11,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                    <CopyIcon/>{copied ? 'Kopiert!' : 'Kopieren'}
                  </button>
                </div>
              </div>
              <div style={{padding:'18px 20px'}}>
                <textarea value={result} onChange={e => setResult(e.target.value)} style={{width:'100%',minHeight:240,border:'none',outline:'none',fontSize:14,lineHeight:1.7,fontFamily:'inherit',resize:'vertical',color:'rgb(20,20,43)',background:'transparent',boxSizing:'border-box'}}/>
              </div>
              <div style={{padding:'8px 16px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:11,color:'var(--text-muted)'}}>{result.split(' ').length} Woerter - {result.length} Zeichen</span>
                <button onClick={copy} style={{fontSize:11,color:'var(--wl-primary, rgb(49,90,231))',fontWeight:700,background:'none',border:'none',cursor:'pointer'}}>Fuer LinkedIn kopieren</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showHist && (
        <div style={{marginTop:24,background:'var(--surface)',borderRadius:14,border:'1px solid var(--border)',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #F1F5F9',fontWeight:700,fontSize:14}}>Verlauf</div>
          {history.length === 0
            ? <div style={{padding:32,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Noch keine Texte generiert</div>
            : <div style={{maxHeight:480,overflowY:'auto'}}>
                {history.map(h => (
                  <div key={h.id} style={{padding:'14px 18px',borderBottom:'1px solid #F8FAFC',cursor:'pointer'}} onClick={() => { setResult(h.generated_text); setShowHist(false) }}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:999,background:'rgba(49,90,231,0.08)',color:'var(--wl-primary, rgb(49,90,231))'}}>{h.template_label}</span>
                      <span style={{fontSize:11,color:'var(--text-muted)'}}>{new Date(h.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                    <div style={{fontSize:13,color:'#475569',lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{h.generated_text}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}
    </div>
  )
}
