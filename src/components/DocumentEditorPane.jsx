import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold, Italic, Heading1, Heading2, List, ListOrdered, Quote, Undo2, Redo2,
  X, FilePlus2, Sparkles, Wand2, MessageSquare, Copy, Download, FileText,
  Send, Languages, PenLine, ArrowRightToLine, Check,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getDocument, updateDocument, createDocument, textToDoc } from '../lib/contentDocuments'

const SAVE_DEBOUNCE = 900
const P = 'var(--wl-primary, rgb(49,90,231))'

// ── Flash Actions (Befehlspalette auf der Markierung) ───────────────────────
// Alle laufen über die generate-Edge-Function MIT brand_voice_id → echter
// Brand-Voice-Kontext (System-Prompt wird serverseitig aus der BV gebaut).
const FLASH_ACTIONS = [
  { key:'improve',  label:'Verbessern',      prompt:(t)=>`Verbessere den folgenden Text (Klarheit, Wirkung, Lesbarkeit) — gleiche Bedeutung und Sprache, in der Brand Voice. Gib NUR den überarbeiteten Text zurück, ohne Einleitung:\n\n${t}` },
  { key:'rewrite',  label:'Umschreiben',     prompt:(t)=>`Schreibe den folgenden Text um — gleiche Bedeutung und Sprache, in der Brand Voice. Gib NUR den überarbeiteten Text zurück, ohne Einleitung:\n\n${t}` },
  { key:'shorter',  label:'Kürzer',          prompt:(t)=>`Kürze den folgenden Text deutlich, ohne die Kernaussage zu verlieren. Gib NUR den gekürzten Text zurück:\n\n${t}` },
  { key:'longer',   label:'Länger',          prompt:(t)=>`Formuliere den folgenden Text ausführlicher und konkreter, gleiche Sprache und Brand Voice. Gib NUR den Text zurück:\n\n${t}` },
  { key:'summary',  label:'Zusammenfassen',  prompt:(t)=>`Fasse den folgenden Text kompakt zusammen, gleiche Sprache. Gib NUR die Zusammenfassung zurück:\n\n${t}` },
  { key:'pro',      label:'Professioneller', prompt:(t)=>`Formuliere den folgenden Text professioneller und seriöser, gleiche Bedeutung. Gib NUR den Text zurück:\n\n${t}` },
  { key:'casual',   label:'Lockerer',        prompt:(t)=>`Formuliere den folgenden Text lockerer und nahbarer, gleiche Bedeutung. Gib NUR den Text zurück:\n\n${t}` },
  { key:'dusie',    label:'Du/Sie wechseln', prompt:(t)=>`Wechsle die Anrede im folgenden Text (von Du zu Sie bzw. von Sie zu Du). Behalte Bedeutung und Brand Voice. Gib NUR den Text zurück:\n\n${t}` },
]
const TRANSLATE_LANGS = [
  { code:'en', label:'Englisch' }, { code:'de', label:'Deutsch' },
  { code:'fr', label:'Französisch' }, { code:'es', label:'Spanisch' },
  { code:'it', label:'Italienisch' },
]

if (typeof document !== 'undefined' && !document.getElementById('leadesk-docpane-css')) {
  const s = document.createElement('style')
  s.id = 'leadesk-docpane-css'
  s.textContent = `
    .lk-docpane .ProseMirror { outline:none; min-height:56vh; font-size:16px; line-height:1.75; color:var(--text-primary,#1d2939); }
    .lk-docpane .ProseMirror p { margin:0 0 14px; }
    .lk-docpane .ProseMirror h1 { font-size:28px; font-weight:800; margin:22px 0 12px; letter-spacing:-0.01em; }
    .lk-docpane .ProseMirror h2 { font-size:22px; font-weight:700; margin:18px 0 10px; letter-spacing:-0.01em; }
    .lk-docpane .ProseMirror h3 { font-size:18px; font-weight:700; margin:16px 0 8px; }
    .lk-docpane .ProseMirror ul, .lk-docpane .ProseMirror ol { padding-left:24px; margin:0 0 14px; }
    .lk-docpane .ProseMirror li { margin:4px 0; }
    .lk-docpane .ProseMirror blockquote { border-left:3px solid var(--border,#E6E9EF); margin:0 0 14px; padding:2px 0 2px 16px; color:var(--text-muted,#667085); }
  `
  document.head.appendChild(s)
}

function countWords(text) {
  const t = (text || '').trim()
  return t ? t.split(/\s+/).length : 0
}

const DocumentEditorPane = forwardRef(function DocumentEditorPane({
  docId, teamId, brandVoiceId, brandVoiceName, audienceId, companyVoiceIds = [],
  onDocCreated, onClose, onAttachToPost,
}, ref) {
  const [title, setTitle] = useState('')
  const titleRef = useRef('')
  const [saveState, setSaveState] = useState('idle')
  const [bubble, setBubble] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [showTranslate, setShowTranslate] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const [wordCount, setWordCount] = useState(0)
  const [continuing, setContinuing] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const saveTimer = useRef(null)
  const loadedRef = useRef(false)
  const currentDocId = useRef(docId || null)

  function updateBubble(ed) {
    if (!ed) return
    const { from, to, empty } = ed.state.selection
    if (empty || from === to) { setBubble(null); setShowTranslate(false); setAiInstruction(''); return }
    try {
      const a = ed.view.coordsAtPos(from), b = ed.view.coordsAtPos(to)
      setBubble({ top: Math.min(a.top, b.top), left: (a.left + b.left) / 2, from, to })
    } catch { setBubble(null) }
  }

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })],
    content: '',
    onCreate: ({ editor }) => { setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())) },
    onUpdate: ({ editor }) => { setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); scheduleSave() },
    onSelectionUpdate: ({ editor }) => updateBubble(editor),
  })

  const doSave = useCallback(async () => {
    if (!editor || !loadedRef.current) return
    const json = editor.getJSON(), text = editor.getText()
    if (!currentDocId.current && editor.isEmpty && !text.trim()) { setSaveState('idle'); return }
    setSaveState('saving')
    if (currentDocId.current) {
      const { error } = await updateDocument(currentDocId.current, {
        title: titleRef.current.trim() || 'Unbenanntes Dokument', content_json: json, content_text: text,
      })
      setSaveState(error ? 'error' : 'saved')
    } else {
      const t = titleRef.current.trim() || (text.split('\n').find(l => l.trim()) || 'Unbenanntes Dokument').slice(0, 80)
      const { data, error } = await createDocument({ teamId, title: t, contentJson: json, contentText: text, brandVoiceId })
      if (error || !data) { setSaveState('error'); console.warn('[DocPane] create:', error); return }
      currentDocId.current = data.id; titleRef.current = t; setTitle(t)
      setSaveState('saved')
      onDocCreated && onDocCreated(data.id)
    }
  }, [editor, teamId, brandVoiceId, onDocCreated])

  const scheduleSave = useCallback(() => {
    if (!loadedRef.current) return
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(doSave, SAVE_DEBOUNCE)
  }, [doSave])

  useEffect(() => {
    if (!editor) return
    if (docId && docId === currentDocId.current && loadedRef.current) return
    let cancelled = false
    currentDocId.current = docId || null
    loadedRef.current = false
    ;(async () => {
      if (!docId) { editor.commands.clearContent(); setTitle(''); titleRef.current=''; setSaveState('idle'); setIsEmpty(true); setWordCount(0); loadedRef.current=true; return }
      const { data, error } = await getDocument(docId)
      if (cancelled) return
      if (error || !data) { editor.commands.clearContent(); setTitle(''); titleRef.current=''; setIsEmpty(true); loadedRef.current=true; return }
      setTitle(data.title || ''); titleRef.current = data.title || ''
      const json = data.content_json
      if (json && typeof json === 'object' && Object.keys(json).length) editor.commands.setContent(json)
      else editor.commands.clearContent()
      setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); setSaveState('saved'); loadedRef.current = true
    })()
    return () => { cancelled = true }
  }, [docId, editor])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  function onTitleChange(v) { setTitle(v); titleRef.current = v; scheduleSave() }

  function insertText(text) {
    if (!editor || !text) return
    const d = textToDoc(text)
    if (editor.isEmpty) editor.commands.setContent(d)
    else editor.chain().focus('end').insertContent(d.content).run()
    setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); loadedRef.current = true; scheduleSave()
  }
  function newDocument() {
    currentDocId.current = null
    editor && editor.commands.clearContent()
    setTitle(''); titleRef.current=''; setSaveState('idle'); setIsEmpty(true); setWordCount(0); loadedRef.current = true
    onDocCreated && onDocCreated(null)
  }
  useImperativeHandle(ref, () => ({ insertText, newDocument }), [editor, scheduleSave, onDocCreated])

  // ── KI-Aufruf gegen generate (BV-Kontext via brand_voice_id) ──────────────
  async function callAi(promptText) {
    const { data, error } = await supabase.functions.invoke('generate', {
      body: {
        type: 'inline_edit',
        prompt: promptText,
        brand_voice_id: brandVoiceId || undefined,
        company_voice_ids: companyVoiceIds && companyVoiceIds.length ? companyVoiceIds : undefined,
        target_audience_id: audienceId || undefined,
      },
    })
    if (error || !data?.text) throw new Error(error?.message || data?.error || 'Keine Antwort')
    return String(data.text).trim()
  }

  function closeBubble() { setBubble(null); setShowTranslate(false); setAiInstruction('') }

  async function runOnSelection(promptText) {
    if (!editor || !bubble) return
    const { from, to } = bubble
    const text = editor.state.doc.textBetween(from, to, '\n')
    if (!text.trim()) return
    setAiBusy(true)
    try {
      const out = await callAi(promptText(text))
      const d = textToDoc(out)
      editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, d.content).run()
      setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); loadedRef.current = true; scheduleSave()
      closeBubble()
    } catch (e) { alert('KI-Aktion fehlgeschlagen: ' + (e?.message || e)) }
    finally { setAiBusy(false) }
  }

  function runPreset(action) { runOnSelection(action.prompt) }
  function runTranslate(lang) { runOnSelection((t) => `Übersetze den folgenden Text nach ${lang.label}. Gib NUR die Übersetzung zurück, ohne Einleitung:\n\n${t}`) }
  function runCustom() {
    const instr = aiInstruction.trim()
    if (!instr) return
    runOnSelection((t) => `Wende die folgende Anweisung auf den markierten Text an. Anweisung: "${instr}". Behalte die Sprache und die Brand Voice. Gib NUR den überarbeiteten Text zurück, ohne Einleitung:\n\n${t}`)
  }

  // ── Weiterschreiben am Dokumentende ───────────────────────────────────────
  async function continueWriting() {
    if (!editor || continuing) return
    const ctx = editor.getText().trim()
    if (!ctx) { editor.commands.focus(); return }
    setContinuing(true)
    try {
      const out = await callAi(`Setze den folgenden Text natürlich und im gleichen Stil fort. Schreibe 1–3 sinnvolle Sätze weiter. Wiederhole den bestehenden Text NICHT. Gib NUR die Fortsetzung zurück:\n\n${ctx.slice(-4000)}`)
      const d = textToDoc(' ' + out)
      editor.chain().focus('end').insertContent(d.content).run()
      setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); loadedRef.current = true; scheduleSave()
    } catch (e) { alert('Weiterschreiben fehlgeschlagen: ' + (e?.message || e)) }
    finally { setContinuing(false) }
  }

  // ── Export / Kopieren ─────────────────────────────────────────────────────
  async function copyToClipboard() {
    if (!editor) return
    try { await navigator.clipboard.writeText(editor.getText()); setExportOpen(false) }
    catch { alert('Kopieren nicht möglich.') }
  }
  function docHtml() {
    const t = (titleRef.current || 'Unbenanntes Dokument')
    return { t, body: (t ? `<h1>${escapeHtml(t)}</h1>` : '') + (editor ? editor.getHTML() : '') }
  }
  function downloadWord() {
    const { t, body } = docHtml()
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${escapeHtml(t)}</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;">${body}</body></html>`
    const blob = new Blob(['﻿', html], { type: 'application/msword' })
    triggerDownload(blob, safeName(t) + '.doc'); setExportOpen(false)
  }
  function downloadPdf() {
    const { t, body } = docHtml()
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
    document.body.appendChild(iframe)
    const d = iframe.contentWindow.document
    d.open()
    d.write(`<html><head><title>${escapeHtml(t)}</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2939;line-height:1.6;padding:48px 56px;max-width:760px;margin:0 auto;}h1{font-size:26px;}h2{font-size:21px;}h3{font-size:18px;}blockquote{border-left:3px solid #ddd;margin:0;padding-left:16px;color:#667085;}</style></head><body>${body}</body></html>`)
    d.close()
    iframe.contentWindow.focus()
    setTimeout(() => { iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 1500) }, 300)
    setExportOpen(false)
  }

  function handleAttach() {
    if (!editor || !onAttachToPost) return
    const text = editor.getText().trim()
    if (!text) { alert('Das Dokument ist leer.'); return }
    onAttachToPost(text)
  }

  return (
    <div className="lk-docpane" style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, position:'relative', background:'var(--page-bg, #F4F6FA)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'16px 28px 10px', flexShrink:0 }}>
        <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Unbenanntes Dokument"
          style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', fontSize:20, fontWeight:800, letterSpacing:'-0.01em', color:'var(--text-primary,#101828)', fontFamily:'inherit' }}/>
        <span style={{ fontSize:12, color:'var(--text-soft,#98a2b3)', whiteSpace:'nowrap' }}>{wordCount} {wordCount === 1 ? 'Wort' : 'Wörter'}</span>
        <SaveBadge state={saveState} />

        {/* Export-Menü */}
        <div style={{ position:'relative' }}>
          <IconBtn onClick={() => setExportOpen(o => !o)} title="Exportieren / Kopieren"><Download size={16} strokeWidth={1.75}/></IconBtn>
          {exportOpen && (
            <>
              <div onClick={() => setExportOpen(false)} style={{ position:'fixed', inset:0, zIndex:80 }}/>
              <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:81, background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:210, padding:6 }}>
                <button onClick={copyToClipboard} style={MenuItem}><Copy size={15} strokeWidth={1.75}/><span>Text kopieren</span></button>
                <button onClick={downloadPdf} style={MenuItem}><FileText size={15} strokeWidth={1.75}/><span>Als PDF herunterladen</span></button>
                <button onClick={downloadWord} style={MenuItem}><FileText size={15} strokeWidth={1.75}/><span>Als Word (.doc)</span></button>
              </div>
            </>
          )}
        </div>

        {onAttachToPost && (
          <button onClick={handleAttach} title="Inhalt als LinkedIn-Beitrag übernehmen"
            style={{ display:'inline-flex', alignItems:'center', gap:6, height:32, padding:'0 12px', borderRadius:9, border:'1.5px solid '+P, background:'rgba(49,90,231,0.06)', color:P, fontSize:12.5, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit' }}>
            <ArrowRightToLine size={14} strokeWidth={2}/>In Beitrag übernehmen
          </button>
        )}
        <IconBtn onClick={newDocument} title="Neues Dokument"><FilePlus2 size={16} strokeWidth={1.75}/></IconBtn>
        {onClose && <IconBtn onClick={onClose} title="Editor schließen"><X size={16} strokeWidth={1.75}/></IconBtn>}
      </div>

      {/* Toolbar */}
      <div style={{ maxWidth:820, width:'100%', margin:'0 auto', padding:'0 28px', flexShrink:0, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <Toolbar editor={editor} />
        <button onClick={continueWriting} disabled={continuing} title="KI schreibt am Dokumentende weiter"
          style={{ display:'inline-flex', alignItems:'center', gap:6, height:32, padding:'0 12px', borderRadius:9, border:'1.5px solid var(--border)', background:'#fff', color: continuing ? 'var(--text-muted)' : P, fontSize:12.5, fontWeight:700, cursor: continuing ? 'default' : 'pointer', fontFamily:'inherit' }}>
          <PenLine size={14} strokeWidth={2}/>{continuing ? 'Schreibt…' : 'Weiterschreiben'}
        </button>
      </div>

      {/* Editor-Fläche */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 28px 64px', minHeight:0 }}>
        <div style={{ position:'relative', maxWidth:820, margin:'0 auto', background:'var(--surface,#fff)', border:'1px solid var(--border,#E6E9EF)',
                      borderRadius:16, boxShadow:'0 1px 3px rgba(16,24,40,0.06), 0 14px 30px rgba(16,24,40,0.05)', padding:'48px 56px' }}>
          <EditorContent editor={editor} />
          {isEmpty && editor && (
            <div style={{ position:'absolute', top:46, left:56, right:56 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Starten mit</div>
              {[
                { icon:<Sparkles size={17} strokeWidth={1.9}/>, label:'Schreiben beginnen', desc:'Tippe direkt los', onClick:() => editor.commands.focus() },
                { icon:<Wand2 size={17} strokeWidth={1.9}/>,    label:'KI-Textaktionen',    desc:'Text markieren → Verbessern · Umschreiben · eigene Anweisung' },
                { icon:<PenLine size={17} strokeWidth={1.9}/>,  label:'Weiterschreiben',    desc:'KI führt deinen Text in der Brand Voice fort', onClick: continueWriting },
                { icon:<MessageSquare size={17} strokeWidth={1.9}/>, label:'Aus dem Chat',  desc:'Rechts generieren → „→ ins Dokument"' },
              ].map((r, i) => (
                <div key={i} onClick={r.onClick}
                  style={{ display:'flex', alignItems:'center', gap:13, padding:'11px 12px', borderRadius:11, cursor: r.onClick ? 'pointer' : 'default', userSelect:'none' }}
                  onMouseEnter={e => { if (r.onClick) e.currentTarget.style.background = '#F4F6FA' }}
                  onMouseLeave={e => { if (r.onClick) e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ color:P, display:'inline-flex', flexShrink:0 }}>{r.icon}</span>
                  <span style={{ fontSize:14 }}>
                    <span style={{ fontWeight:700, color:'#1d2939' }}>{r.label}</span>
                    <span style={{ color:'#98a2b3' }}> · {r.desc}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Flash-Actions-Popover auf der Markierung */}
      {bubble && (
        <>
          <div onMouseDown={(e) => { e.preventDefault(); closeBubble() }} style={{ position:'fixed', inset:0, zIndex:49 }}/>
          <div onMouseDown={e => { if (e.target.tagName !== 'INPUT') e.preventDefault() }}
            style={{ position:'fixed', top: Math.max(bubble.top - 12, 70), left: bubble.left, transform:'translate(-50%, -100%)', zIndex:50,
                     width:340, maxWidth:'90vw', background:'#101828', borderRadius:12, boxShadow:'0 12px 32px rgba(16,24,40,0.34)', padding:8 }}>
            {aiBusy ? (
              <div style={{ color:'#fff', fontSize:13, padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}>
                <Sparkles size={14} className='lk-spin'/> KI arbeitet…
              </div>
            ) : (
              <>
                {/* Freitext-Anweisung */}
                <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.08)', borderRadius:9, padding:'4px 4px 4px 10px', marginBottom:8 }}>
                  <Sparkles size={14} style={{ color:'#A5B4FC', flexShrink:0 }}/>
                  <input value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runCustom() } if (e.key === 'Escape') closeBubble() }}
                    placeholder="Anweisung an die KI … z. B. „knackiger“"
                    style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', color:'#fff', fontSize:13, fontFamily:'inherit' }}/>
                  <button onClick={runCustom} disabled={!aiInstruction.trim()}
                    style={{ width:30, height:30, flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center', border:'none', borderRadius:7, background: aiInstruction.trim() ? P : 'rgba(255,255,255,0.12)', color:'#fff', cursor: aiInstruction.trim() ? 'pointer' : 'default' }}>
                    <Send size={13} strokeWidth={2}/>
                  </button>
                </div>
                {/* Presets */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {FLASH_ACTIONS.map(a => (
                    <button key={a.key} onClick={() => runPreset(a)} style={ChipBtn}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.16)'}
                      onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}>{a.label}</button>
                  ))}
                  <button onClick={() => setShowTranslate(v => !v)} style={{ ...ChipBtn, background: showTranslate ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)', display:'inline-flex', alignItems:'center', gap:5 }}>
                    <Languages size={12} strokeWidth={2}/>Übersetzen
                  </button>
                </div>
                {showTranslate && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6, paddingTop:6, borderTop:'1px solid rgba(255,255,255,0.10)' }}>
                    {TRANSLATE_LANGS.map(l => (
                      <button key={l.code} onClick={() => runTranslate(l)} style={ChipBtn}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.16)'}
                        onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}>{l.label}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
})

const MenuItem = {
  display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px',
  background:'transparent', border:'none', cursor:'pointer', borderRadius:7,
  fontSize:13, color:'var(--text-primary)', textAlign:'left', fontFamily:'inherit',
}
const ChipBtn = {
  background:'rgba(255,255,255,0.06)', border:'none', color:'#fff', fontSize:12, fontWeight:600,
  padding:'6px 10px', borderRadius:7, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit',
}

function escapeHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function safeName(s) { return (String(s || 'Dokument').replace(/[^\p{L}\p{N}\-_ ]/gu,'').trim() || 'Dokument').slice(0,60) }
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function IconBtn({ onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, border:'1px solid var(--border,#E6E9EF)',
               background:'var(--surface,#fff)', borderRadius:9, cursor:'pointer', color:'var(--text-muted,#667085)' }}
      onMouseEnter={e=>e.currentTarget.style.background='#F1F3F7'}
      onMouseLeave={e=>e.currentTarget.style.background='var(--surface,#fff)'}>
      {children}
    </button>
  )
}

function Toolbar({ editor }) {
  if (!editor) return null
  const c = () => editor.chain().focus()
  const Btn = ({ on, active, title, children }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={on}
      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, border:'none', borderRadius:7,
               background: active ? P : 'transparent', color: active ? '#fff' : 'var(--text-muted,#475467)', cursor:'pointer' }}
      onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='#EEF1F6' }}
      onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent' }}>
      {children}
    </button>
  )
  const Div = () => <span style={{ width:1, height:18, background:'var(--border,#E6E9EF)', margin:'0 4px' }}/>
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:2, padding:5, background:'var(--surface,#fff)',
                  border:'1px solid var(--border,#E6E9EF)', borderRadius:11, boxShadow:'0 1px 2px rgba(16,24,40,0.04)' }}>
      <Btn title="Fett" active={editor.isActive('bold')} on={() => c().toggleBold().run()}><Bold size={16} strokeWidth={2}/></Btn>
      <Btn title="Kursiv" active={editor.isActive('italic')} on={() => c().toggleItalic().run()}><Italic size={16} strokeWidth={2}/></Btn>
      <Div/>
      <Btn title="Überschrift 1" active={editor.isActive('heading',{level:1})} on={() => c().toggleHeading({level:1}).run()}><Heading1 size={16} strokeWidth={2}/></Btn>
      <Btn title="Überschrift 2" active={editor.isActive('heading',{level:2})} on={() => c().toggleHeading({level:2}).run()}><Heading2 size={16} strokeWidth={2}/></Btn>
      <Btn title="Zitat" active={editor.isActive('blockquote')} on={() => c().toggleBlockquote().run()}><Quote size={16} strokeWidth={2}/></Btn>
      <Div/>
      <Btn title="Liste" active={editor.isActive('bulletList')} on={() => c().toggleBulletList().run()}><List size={16} strokeWidth={2}/></Btn>
      <Btn title="Nummerierte Liste" active={editor.isActive('orderedList')} on={() => c().toggleOrderedList().run()}><ListOrdered size={16} strokeWidth={2}/></Btn>
      <Div/>
      <Btn title="Rückgängig" on={() => c().undo().run()}><Undo2 size={16} strokeWidth={2}/></Btn>
      <Btn title="Wiederholen" on={() => c().redo().run()}><Redo2 size={16} strokeWidth={2}/></Btn>
    </div>
  )
}

function SaveBadge({ state }) {
  const map = { saving:{t:'Speichert…',c:'var(--text-muted,#667085)'}, saved:{t:'✓ Gespeichert',c:'var(--success-text,#067647)'}, error:{t:'⚠ Nicht gespeichert',c:'var(--danger-text,#d92d20)'} }
  const s = map[state]
  return s ? <span style={{ fontSize:12, color:s.c, fontWeight:600, whiteSpace:'nowrap' }}>{s.t}</span> : <span/>
}

export default DocumentEditorPane
