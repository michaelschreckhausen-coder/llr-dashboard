import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold, Italic, Heading1, Heading2, List, ListOrdered, Quote, Undo2, Redo2,
  X, FilePlus2, Sparkles, Wand2, PenLine, Copy, Download, FileText,
  Send, Languages, ArrowRightToLine, Plus, Trash2, RotateCcw, ArrowDownToLine, Check, Minus,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  getDocument, updateDocument, createDocument, textToDoc,
  listFlashActions, createFlashAction, deleteFlashAction,
} from '../lib/contentDocuments'

const SAVE_DEBOUNCE = 900
const P = 'var(--wl-primary, rgb(49,90,231))'

// ── Eingebaute Flash-Actions ────────────────────────────────────────────────
const FLASH_ACTIONS = [
  { key:'improve',  label:'Verbessern',      build:(t)=>`Verbessere den folgenden Text (Klarheit, Wirkung, Lesbarkeit) — gleiche Bedeutung und Sprache, in der Brand Voice. Gib NUR den überarbeiteten Text zurück, ohne Einleitung:\n\n${t}` },
  { key:'rewrite',  label:'Umschreiben',     build:(t)=>`Schreibe den folgenden Text um — gleiche Bedeutung und Sprache, in der Brand Voice. Gib NUR den überarbeiteten Text zurück, ohne Einleitung:\n\n${t}` },
  { key:'shorter',  label:'Kürzer',          build:(t)=>`Kürze den folgenden Text deutlich, ohne die Kernaussage zu verlieren. Gib NUR den gekürzten Text zurück:\n\n${t}` },
  { key:'longer',   label:'Länger',          build:(t)=>`Formuliere den folgenden Text ausführlicher und konkreter, gleiche Sprache und Brand Voice. Gib NUR den Text zurück:\n\n${t}` },
  { key:'summary',  label:'Zusammenfassen',  build:(t)=>`Fasse den folgenden Text kompakt zusammen, gleiche Sprache. Gib NUR die Zusammenfassung zurück:\n\n${t}` },
  { key:'pro',      label:'Professioneller', build:(t)=>`Formuliere den folgenden Text professioneller und seriöser, gleiche Bedeutung. Gib NUR den Text zurück:\n\n${t}` },
  { key:'casual',   label:'Lockerer',        build:(t)=>`Formuliere den folgenden Text lockerer und nahbarer, gleiche Bedeutung. Gib NUR den Text zurück:\n\n${t}` },
  { key:'dusie',    label:'Du/Sie wechseln', build:(t)=>`Wechsle die Anrede im folgenden Text (von Du zu Sie bzw. von Sie zu Du). Behalte Bedeutung und Brand Voice. Gib NUR den Text zurück:\n\n${t}` },
  { key:'nodash',   label:'Gedankenstriche entfernen', build:(t)=>`Entferne alle Gedankenstriche (— und –) aus dem folgenden Text. Ersetze sie kontextabhängig durch Komma, Punkt oder Doppelpunkt, sodass es natürlich liest. Behalte Bedeutung, Sprache und Brand Voice. Gib NUR den Text zurück, ohne Einleitung:\n\n${t}` },
]
const TRANSLATE_LANGS = [
  { code:'en', label:'Englisch' }, { code:'de', label:'Deutsch' },
  { code:'fr', label:'Französisch' }, { code:'es', label:'Spanisch' }, { code:'it', label:'Italienisch' },
]
const NO_DASH_DIRECTIVE = '\n\nWICHTIG: Verwende KEINE Gedankenstriche (— oder –). Nutze stattdessen Komma, Punkt oder Doppelpunkt.'

// Mechanischer Fallback (nur Reste) — ersetzt Gedankenstriche zwischen Wörtern durch Komma.
function stripEmDashes(s) {
  return String(s || '')
    .replace(/\s+[—–]\s+/g, ', ')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
}

if (typeof document !== 'undefined' && !document.getElementById('leadesk-docpane-css')) {
  const s = document.createElement('style')
  s.id = 'leadesk-docpane-css'
  s.textContent = `
    .lk-docpane .ProseMirror { outline:none; min-height:58vh; font-size:16px; line-height:1.78; color:var(--text-primary,#1d2939); }
    .lk-docpane .ProseMirror p { margin:0 0 14px; }
    .lk-docpane .ProseMirror h1 { font-size:27px; font-weight:800; margin:24px 0 12px; letter-spacing:-0.015em; }
    .lk-docpane .ProseMirror h2 { font-size:21px; font-weight:700; margin:20px 0 10px; letter-spacing:-0.01em; }
    .lk-docpane .ProseMirror h3 { font-size:18px; font-weight:700; margin:16px 0 8px; }
    .lk-docpane .ProseMirror ul, .lk-docpane .ProseMirror ol { padding-left:24px; margin:0 0 14px; }
    .lk-docpane .ProseMirror li { margin:4px 0; }
    .lk-docpane .ProseMirror blockquote { border-left:3px solid var(--border,#E6E9EF); margin:0 0 14px; padding:2px 0 2px 16px; color:var(--text-muted,#667085); }
    .lk-docpane .ProseMirror:focus { outline:none; }
  `
  document.head.appendChild(s)
}

function countWords(text) { const t=(text||'').trim(); return t? t.split(/\s+/).length : 0 }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

const DocumentEditorPane = forwardRef(function DocumentEditorPane({
  docId, teamId, brandVoiceId, brandVoiceName, audienceId, companyVoiceIds = [],
  onDocCreated, onClose, onAttachToPost,
}, ref) {
  const [title, setTitle] = useState('')
  const titleRef = useRef('')
  const [saveState, setSaveState] = useState('idle')
  const [bubble, setBubble] = useState(null)         // { top, bottom, left, from, to }
  const [aiBusy, setAiBusy] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [showTranslate, setShowTranslate] = useState(false)
  const [preview, setPreview] = useState(null)       // { text, from, to, build, label, sourceText }
  const [isEmpty, setIsEmpty] = useState(true)
  const [wordCount, setWordCount] = useState(0)
  const [continuing, setContinuing] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [customActions, setCustomActions] = useState([])
  const [showActionForm, setShowActionForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [savingAction, setSavingAction] = useState(false)
  const [stripDashes, setStripDashes] = useState(() => { try { return localStorage.getItem('tw_strip_dashes') === '1' } catch { return false } })
  const stripRef = useRef(stripDashes)
  useEffect(() => { stripRef.current = stripDashes; try { localStorage.setItem('tw_strip_dashes', stripDashes ? '1' : '0') } catch {} }, [stripDashes])

  const saveTimer = useRef(null)
  const loadedRef = useRef(false)
  const currentDocId = useRef(docId || null)

  function updateBubble(ed) {
    if (!ed) return
    const { from, to, empty } = ed.state.selection
    if (empty || from === to) { setBubble(null); setShowTranslate(false); setAiInstruction(''); setShowActionForm(false); return }
    try {
      const a = ed.view.coordsAtPos(from), b = ed.view.coordsAtPos(to)
      setBubble({ top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left: (a.left + b.left) / 2, from, to })
    } catch { setBubble(null) }
  }

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })],
    content: '',
    onCreate: ({ editor }) => { setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())) },
    onUpdate: ({ editor }) => { setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); scheduleSave() },
    onSelectionUpdate: ({ editor }) => { if (!preview) updateBubble(editor) },
  })

  // Custom Actions laden
  useEffect(() => {
    if (!teamId) { setCustomActions([]); return }
    let cancelled = false
    ;(async () => { const { data } = await listFlashActions(teamId); if (!cancelled) setCustomActions(data || []) })()
    return () => { cancelled = true }
  }, [teamId])

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
      setSaveState('saved'); onDocCreated && onDocCreated(data.id)
    }
  }, [editor, teamId, brandVoiceId, onDocCreated])

  const scheduleSave = useCallback(() => {
    if (!loadedRef.current) return
    setSaveState('saving'); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(doSave, SAVE_DEBOUNCE)
  }, [doSave])

  useEffect(() => {
    if (!editor) return
    if (docId && docId === currentDocId.current && loadedRef.current) return
    let cancelled = false
    currentDocId.current = docId || null; loadedRef.current = false
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
    else editor.chain().focus('end').insertContent([{ type:'paragraph' }, ...d.content]).run()
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
    const finalPrompt = stripRef.current ? (promptText + NO_DASH_DIRECTIVE) : promptText
    const { data, error } = await supabase.functions.invoke('generate', {
      body: {
        type: 'inline_edit', prompt: finalPrompt,
        brand_voice_id: brandVoiceId || undefined,
        company_voice_ids: companyVoiceIds && companyVoiceIds.length ? companyVoiceIds : undefined,
        target_audience_id: audienceId || undefined,
      },
    })
    if (error || !data?.text) throw new Error(error?.message || data?.error || 'Keine Antwort')
    let out = String(data.text).trim()
    if (stripRef.current) out = stripEmDashes(out)
    return out
  }

  function closeBubble() { setBubble(null); setPreview(null); setShowTranslate(false); setAiInstruction(''); setShowActionForm(false) }

  // Action ausführen → Vorschau erzeugen (nicht direkt anwenden)
  async function runAction(build, label) {
    if (!editor) return
    const sel = preview ? { from: preview.from, to: preview.to } : (bubble ? { from: bubble.from, to: bubble.to } : null)
    if (!sel) return
    const sourceText = preview ? preview.sourceText : editor.state.doc.textBetween(sel.from, sel.to, '\n')
    if (!sourceText.trim()) return
    setAiBusy(true)
    try {
      const out = await callAi(build(sourceText))
      setPreview({ text: out, from: sel.from, to: sel.to, build, label, sourceText })
      setShowTranslate(false); setShowActionForm(false)
    } catch (e) { alert('KI-Aktion fehlgeschlagen: ' + (e?.message || e)) }
    finally { setAiBusy(false) }
  }

  function runCustomInstruction() {
    const instr = aiInstruction.trim(); if (!instr) return
    runAction((t) => `Wende die folgende Anweisung auf den markierten Text an. Anweisung: "${instr}". Behalte Sprache und Brand Voice. Gib NUR den überarbeiteten Text zurück, ohne Einleitung:\n\n${t}`, instr)
  }
  function runTranslate(lang) {
    runAction((t) => `Übersetze den folgenden Text nach ${lang.label}. Gib NUR die Übersetzung zurück, ohne Einleitung:\n\n${t}`, 'Übersetzen: ' + lang.label)
  }
  function runCustomAction(a) {
    runAction((t) => `${a.prompt}\n\nBehalte Sprache und Brand Voice. Gib NUR den überarbeiteten Text zurück, ohne Einleitung:\n\n${t}`, a.label)
  }

  // ── Vorschau anwenden ─────────────────────────────────────────────────────
  function applyReplace() {
    if (!editor || !preview) return
    const { from, to, text } = preview
    const replacement = text.includes('\n') ? textToDoc(text).content : text
    editor.chain().focus().insertContentAt({ from, to }, replacement).run()
    afterEdit()
  }
  function applyBelow() {
    if (!editor || !preview) return
    const { to, text } = preview
    const blocks = textToDoc(text).content
    editor.chain().focus().insertContentAt(to, [{ type:'paragraph' }, ...blocks]).run()
    afterEdit()
  }
  function afterEdit() {
    setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); loadedRef.current = true; scheduleSave(); closeBubble()
  }

  // ── Weiterschreiben am Dokumentende ───────────────────────────────────────
  async function continueWriting() {
    if (!editor || continuing) return
    const ctx = editor.getText().trim()
    if (!ctx) { editor.commands.focus(); return }
    setContinuing(true)
    try {
      const out = await callAi(`Setze den folgenden Text natürlich und im gleichen Stil fort. Schreibe 1–3 sinnvolle Sätze weiter. Wiederhole den bestehenden Text NICHT. Gib NUR die Fortsetzung zurück:\n\n${ctx.slice(-4000)}`)
      const d = textToDoc(out)
      editor.chain().focus('end').insertContent([{ type:'paragraph' }, ...d.content]).run()
      setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); loadedRef.current = true; scheduleSave()
    } catch (e) { alert('Weiterschreiben fehlgeschlagen: ' + (e?.message || e)) }
    finally { setContinuing(false) }
  }

  // ── Custom Action anlegen / löschen ───────────────────────────────────────
  async function saveCustomAction() {
    const label = newLabel.trim(), prompt = newPrompt.trim()
    if (!label || !prompt || !teamId || savingAction) return
    setSavingAction(true)
    const { data, error } = await createFlashAction({ teamId, label, prompt })
    setSavingAction(false)
    if (error) { alert('Speichern fehlgeschlagen: ' + (error.message || error)); return }
    if (data) setCustomActions(prev => [...prev, data])
    setNewLabel(''); setNewPrompt(''); setShowActionForm(false)
  }
  async function removeCustomAction(id) {
    setCustomActions(prev => prev.filter(a => a.id !== id))
    await deleteFlashAction(id)
  }

  // ── Export / Kopieren ─────────────────────────────────────────────────────
  async function copyToClipboard() { if (!editor) return; try { await navigator.clipboard.writeText(editor.getText()); setExportOpen(false) } catch { alert('Kopieren nicht möglich.') } }
  function docHtml() { const t=(titleRef.current||'Unbenanntes Dokument'); return { t, body:(t?`<h1>${escapeHtml(t)}</h1>`:'')+(editor?editor.getHTML():'') } }
  function downloadWord() {
    const { t, body } = docHtml()
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${escapeHtml(t)}</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;">${body}</body></html>`
    triggerDownload(new Blob(['﻿', html], { type:'application/msword' }), safeName(t) + '.doc'); setExportOpen(false)
  }
  function downloadPdf() {
    const { t, body } = docHtml()
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
    document.body.appendChild(iframe)
    const d = iframe.contentWindow.document; d.open()
    d.write(`<html><head><title>${escapeHtml(t)}</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2939;line-height:1.6;padding:48px 56px;max-width:760px;margin:0 auto;}h1{font-size:26px;}h2{font-size:21px;}h3{font-size:18px;}blockquote{border-left:3px solid #ddd;margin:0;padding-left:16px;color:#667085;}</style></head><body>${body}</body></html>`)
    d.close(); iframe.contentWindow.focus()
    setTimeout(() => { iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 1500) }, 300)
    setExportOpen(false)
  }
  function handleAttach() {
    if (!editor || !onAttachToPost) return
    const text = editor.getText().trim(); if (!text) { alert('Das Dokument ist leer.'); return }
    onAttachToPost(text)
  }

  // ── Popover-Positionierung ────────────────────────────────────────────────
  const placeBelow = bubble ? bubble.top < 380 : false
  const popLeft = bubble ? clamp(bubble.left, 220, (typeof window!=='undefined'?window.innerWidth:1200) - 220) : 0
  const popStyle = bubble ? {
    position:'fixed', left: popLeft, zIndex:50,
    top: placeBelow ? bubble.bottom + 10 : bubble.top - 10,
    transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
    width:380, maxWidth:'92vw',
    background:'#fff', border:'1px solid var(--border,#E6E9EF)', borderRadius:14,
    boxShadow:'0 16px 40px rgba(16,24,40,0.18), 0 2px 8px rgba(16,24,40,0.06)', padding:10,
  } : {}

  return (
    <div className="lk-docpane" style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, position:'relative', background:'var(--page-bg, #F7F8FA)' }}>
      {/* ── Fixe Kopfzeile ── */}
      <div style={{ flexShrink:0, borderBottom:'1px solid var(--border,#E9ECF2)', background:'var(--page-bg, #F7F8FA)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px 12px 24px' }}>
          <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Unbenanntes Dokument"
            style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', fontSize:18, fontWeight:800, letterSpacing:'-0.01em', color:'var(--text-primary,#101828)', fontFamily:'inherit', textOverflow:'ellipsis' }}/>
          <span style={{ fontSize:12, color:'var(--text-soft,#98a2b3)', whiteSpace:'nowrap', flexShrink:0 }}>{wordCount} {wordCount === 1 ? 'Wort' : 'Wörter'}</span>
          <SaveBadge state={saveState} />
          {onAttachToPost && (
            <button onClick={handleAttach} title="Inhalt als LinkedIn-Beitrag übernehmen"
              style={{ display:'inline-flex', alignItems:'center', gap:6, height:32, padding:'0 12px', borderRadius:9, border:'1.5px solid '+P, background:'rgba(49,90,231,0.06)', color:P, fontSize:12.5, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', flexShrink:0 }}>
              <ArrowRightToLine size={14} strokeWidth={2}/>In Beitrag übernehmen
            </button>
          )}
          <div style={{ position:'relative', flexShrink:0 }}>
            <IconBtn onClick={() => setExportOpen(o => !o)} title="Exportieren / Kopieren"><Download size={16} strokeWidth={1.75}/></IconBtn>
            {exportOpen && (
              <>
                <div onClick={() => setExportOpen(false)} style={{ position:'fixed', inset:0, zIndex:80 }}/>
                <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:81, background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:212, padding:6 }}>
                  <button onClick={copyToClipboard} style={MenuItem}><Copy size={15} strokeWidth={1.75}/><span>Text kopieren</span></button>
                  <button onClick={downloadPdf} style={MenuItem}><FileText size={15} strokeWidth={1.75}/><span>Als PDF herunterladen</span></button>
                  <button onClick={downloadWord} style={MenuItem}><FileText size={15} strokeWidth={1.75}/><span>Als Word (.doc)</span></button>
                </div>
              </>
            )}
          </div>
          <IconBtn onClick={newDocument} title="Neues Dokument"><FilePlus2 size={16} strokeWidth={1.75}/></IconBtn>
          {onClose && <IconBtn onClick={onClose} title="Editor schließen"><X size={16} strokeWidth={1.75}/></IconBtn>}
        </div>
        {/* Toolbar-Zeile */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'0 20px 12px 24px', flexWrap:'wrap' }}>
          <Toolbar editor={editor} />
          <button onClick={continueWriting} disabled={continuing} title="KI schreibt am Dokumentende weiter"
            style={{ display:'inline-flex', alignItems:'center', gap:6, height:32, padding:'0 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--surface,#fff)', color: continuing ? 'var(--text-muted)' : P, fontSize:12.5, fontWeight:700, cursor: continuing ? 'default' : 'pointer', fontFamily:'inherit' }}>
            <PenLine size={14} strokeWidth={2}/>{continuing ? 'Schreibt…' : 'Weiterschreiben'}
          </button>
          <button onClick={() => setStripDashes(v => !v)} title="Gedankenstriche automatisch aus KI-Texten entfernen"
            style={{ display:'inline-flex', alignItems:'center', gap:6, height:32, padding:'0 12px', borderRadius:9, boxSizing:'border-box',
                     border:'1px solid '+(stripDashes?P:'var(--border)'), background: stripDashes?'rgba(49,90,231,0.06)':'var(--surface,#fff)', color: stripDashes?P:'var(--text-muted,#667085)', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            <Minus size={14} strokeWidth={2.5}/>Ohne Gedankenstriche{stripDashes ? ' ✓' : ''}
          </button>
        </div>
      </div>

      {/* ── Scrollender Editor-Bereich ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px 72px', minHeight:0 }}>
        <div style={{ position:'relative', maxWidth:780, margin:'0 auto', background:'var(--surface,#fff)', border:'1px solid var(--border,#E9ECF2)',
                      borderRadius:16, boxShadow:'0 1px 2px rgba(16,24,40,0.04), 0 12px 28px rgba(16,24,40,0.04)', padding:'48px 56px' }}>
          <EditorContent editor={editor} />
          {isEmpty && editor && (
            <div style={{ position:'absolute', top:46, left:56, right:56 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Starten mit</div>
              {[
                { icon:<Sparkles size={17} strokeWidth={1.9}/>, label:'Schreiben beginnen', desc:'Tippe direkt los', onClick:() => editor.commands.focus() },
                { icon:<Wand2 size={17} strokeWidth={1.9}/>,    label:'KI-Textaktionen',    desc:'Text markieren → Vorschlag prüfen → Ersetzen oder Darunter' },
                { icon:<PenLine size={17} strokeWidth={1.9}/>,  label:'Weiterschreiben',    desc:'KI führt deinen Text in der Brand Voice fort', onClick: continueWriting },
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

      {/* ── Flash-Actions-Popover ── */}
      {bubble && (
        <>
          <div onMouseDown={(e) => { e.preventDefault(); closeBubble() }} style={{ position:'fixed', inset:0, zIndex:49 }}/>
          <div onMouseDown={e => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault() }} style={popStyle}>
            {aiBusy ? (
              <div style={{ color:'var(--text-primary)', fontSize:13, padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}>
                <Sparkles size={14} className='lk-spin' style={{ color:P }}/> KI arbeitet…
              </div>
            ) : preview ? (
              // ── VORSCHAU ──
              <div>
                <div style={{ fontSize:10.5, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                  <Sparkles size={12}/> KI-Vorschlag{preview.label ? ' · ' + (preview.label.length>22?preview.label.slice(0,20)+'…':preview.label) : ''}
                </div>
                <div style={{ maxHeight:200, overflowY:'auto', whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:13.5, lineHeight:1.6, color:'var(--text-primary)', background:'#F8FAFC', border:'1px solid var(--border,#E9ECF2)', borderRadius:10, padding:'10px 12px' }}>
                  {preview.text}
                </div>
                <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
                  <button onClick={applyReplace} style={{ ...PrimaryBtn }}><Check size={13} strokeWidth={2.5}/>Ersetzen</button>
                  <button onClick={applyBelow} style={{ ...GhostBtn }}><ArrowDownToLine size={13} strokeWidth={2}/>Darunter</button>
                  <button onClick={() => runAction(preview.build, preview.label)} style={{ ...GhostBtn }}><RotateCcw size={13} strokeWidth={2}/>Neu</button>
                  <button onClick={closeBubble} style={{ ...GhostBtn, marginLeft:'auto', color:'var(--text-muted)' }}>Abbrechen</button>
                </div>
              </div>
            ) : showActionForm ? (
              // ── EIGENE ACTION ANLEGEN / VERWALTEN ──
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Eigene KI-Action</div>
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Button-Name, z. B. „Hook schärfen“"
                  style={InputStyle}/>
                <textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)} rows={3} placeholder="Anweisung an die KI, z. B. „Mach aus dem ersten Satz einen starken Hook.“"
                  style={{ ...InputStyle, resize:'none', marginTop:6 }}/>
                <div style={{ display:'flex', gap:6, marginTop:8 }}>
                  <button onClick={saveCustomAction} disabled={!newLabel.trim()||!newPrompt.trim()||savingAction} style={{ ...PrimaryBtn, opacity:(!newLabel.trim()||!newPrompt.trim())?0.5:1 }}>{savingAction?'Speichert…':'Speichern'}</button>
                  <button onClick={() => setShowActionForm(false)} style={{ ...GhostBtn }}>Zurück</button>
                </div>
                {customActions.length > 0 && (
                  <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid var(--border)' }}>
                    {customActions.map(a => (
                      <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 2px' }}>
                        <span style={{ flex:1, fontSize:12.5, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.label}</span>
                        <button onClick={() => removeCustomAction(a.id)} title="Löschen" style={{ border:'none', background:'transparent', cursor:'pointer', color:'#ef4444', padding:2, display:'inline-flex' }}><Trash2 size={14} strokeWidth={1.75}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // ── ACTION-AUSWAHL ──
              <>
                <div style={{ display:'flex', alignItems:'center', gap:6, background:'#F4F6FA', borderRadius:10, padding:'4px 4px 4px 10px', marginBottom:8 }}>
                  <Sparkles size={14} style={{ color:P, flexShrink:0 }}/>
                  <input value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runCustomInstruction() } if (e.key === 'Escape') closeBubble() }}
                    placeholder="Anweisung an die KI … z. B. „knackiger“"
                    style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', color:'var(--text-primary)', fontSize:13, fontFamily:'inherit' }}/>
                  <button onClick={runCustomInstruction} disabled={!aiInstruction.trim()}
                    style={{ width:30, height:30, flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center', border:'none', borderRadius:8, background: aiInstruction.trim() ? P : '#E4E7EC', color:'#fff', cursor: aiInstruction.trim() ? 'pointer' : 'default' }}>
                    <Send size={13} strokeWidth={2}/>
                  </button>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                  {FLASH_ACTIONS.map(a => (
                    <Chip key={a.key} onClick={() => runAction(a.build, a.label)}>{a.label}</Chip>
                  ))}
                  {customActions.map(a => (
                    <Chip key={a.id} accent onClick={() => runCustomAction(a)}>{a.label}</Chip>
                  ))}
                  <Chip onClick={() => setShowTranslate(v => !v)} active={showTranslate}><Languages size={12} strokeWidth={2} style={{ marginRight:4, verticalAlign:'-2px' }}/>Übersetzen</Chip>
                  <Chip onClick={() => setShowActionForm(true)}><Plus size={12} strokeWidth={2.5} style={{ marginRight:3, verticalAlign:'-2px' }}/>Eigene</Chip>
                </div>
                {showTranslate && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:7, paddingTop:7, borderTop:'1px solid var(--border)' }}>
                    {TRANSLATE_LANGS.map(l => <Chip key={l.code} onClick={() => runTranslate(l)}>{l.label}</Chip>)}
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

// ── Styles & kleine Komponenten ─────────────────────────────────────────────
const MenuItem = { display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px', background:'transparent', border:'none', cursor:'pointer', borderRadius:7, fontSize:13, color:'var(--text-primary)', textAlign:'left', fontFamily:'inherit' }
const PrimaryBtn = { display:'inline-flex', alignItems:'center', gap:5, height:32, padding:'0 12px', borderRadius:9, border:'none', background:P, color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }
const GhostBtn = { display:'inline-flex', alignItems:'center', gap:5, height:32, padding:'0 11px', borderRadius:9, border:'1px solid var(--border,#E9ECF2)', background:'#fff', color:'var(--text-primary)', fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }
const InputStyle = { width:'100%', boxSizing:'border-box', border:'1px solid var(--border,#E9ECF2)', borderRadius:9, padding:'8px 10px', fontSize:13, fontFamily:'inherit', outline:'none', color:'var(--text-primary)', background:'#fff' }

function Chip({ children, onClick, active, accent }) {
  const base = {
    background: active ? 'rgba(49,90,231,0.10)' : (accent ? 'rgba(49,90,231,0.06)' : '#F1F3F7'),
    border: '1px solid ' + (active||accent ? 'rgba(49,90,231,0.30)' : 'transparent'),
    color: active||accent ? P : 'var(--text-primary,#344054)',
    fontSize:12, fontWeight:600, padding:'6px 10px', borderRadius:8, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', lineHeight:1.2,
  }
  return <button onClick={onClick} style={base}
    onMouseEnter={e=>{ if(!active&&!accent) e.currentTarget.style.background='#E7EAF0' }}
    onMouseLeave={e=>{ if(!active&&!accent) e.currentTarget.style.background='#F1F3F7' }}>{children}</button>
}

function IconBtn({ onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, border:'1px solid var(--border,#E9ECF2)', background:'var(--surface,#fff)', borderRadius:9, cursor:'pointer', color:'var(--text-muted,#667085)', flexShrink:0 }}
      onMouseEnter={e=>e.currentTarget.style.background='#F1F3F7'} onMouseLeave={e=>e.currentTarget.style.background='var(--surface,#fff)'}>
      {children}
    </button>
  )
}

function Toolbar({ editor }) {
  if (!editor) return null
  const c = () => editor.chain().focus()
  const Btn = ({ on, active, title, children }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={on}
      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, border:'none', borderRadius:7, background: active ? P : 'transparent', color: active ? '#fff' : 'var(--text-muted,#475467)', cursor:'pointer' }}
      onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='#EEF1F6' }} onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent' }}>
      {children}
    </button>
  )
  const Div = () => <span style={{ width:1, height:18, background:'var(--border,#E9ECF2)', margin:'0 4px' }}/>
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:2, padding:5, background:'var(--surface,#fff)', border:'1px solid var(--border,#E9ECF2)', borderRadius:11 }}>
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
  const s = map[state]; return s ? <span style={{ fontSize:12, color:s.c, fontWeight:600, whiteSpace:'nowrap', flexShrink:0 }}>{s.t}</span> : <span/>
}

function escapeHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function safeName(s) { return (String(s || 'Dokument').replace(/[^\p{L}\p{N}\-_ ]/gu,'').trim() || 'Dokument').slice(0,60) }
function triggerDownload(blob, name) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000) }

export default DocumentEditorPane
