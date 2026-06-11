import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, Heading2, List, ListOrdered, Undo2, Redo2, X, FilePlus2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getDocument, updateDocument, createDocument, textToDoc } from '../lib/contentDocuments'

const SAVE_DEBOUNCE = 900
const P = 'var(--wl-primary, rgb(49,90,231))'

const AI_ACTIONS = [
  { key:'rewrite', label:'Umschreiben',     prompt:(t)=>`Schreibe den folgenden Text um — gleiche Bedeutung und Sprache, in der Brand Voice. Gib NUR den überarbeiteten Text zurück, ohne Einleitung:\n\n${t}` },
  { key:'shorter', label:'Kürzer',          prompt:(t)=>`Kürze den folgenden Text deutlich, ohne die Kernaussage zu verlieren. Gib NUR den gekürzten Text zurück:\n\n${t}` },
  { key:'longer',  label:'Länger',          prompt:(t)=>`Formuliere den folgenden Text ausführlicher und konkreter, gleiche Sprache und Brand Voice. Gib NUR den Text zurück:\n\n${t}` },
  { key:'pro',     label:'Professioneller', prompt:(t)=>`Formuliere den folgenden Text professioneller und seriöser, gleiche Bedeutung. Gib NUR den Text zurück:\n\n${t}` },
  { key:'casual',  label:'Lockerer',        prompt:(t)=>`Formuliere den folgenden Text lockerer und nahbarer, gleiche Bedeutung. Gib NUR den Text zurück:\n\n${t}` },
]

if (typeof document !== 'undefined' && !document.getElementById('leadesk-editor-css')) {
  const s = document.createElement('style')
  s.id = 'leadesk-editor-css'
  s.textContent = `
    .lk-docpane .ProseMirror { outline:none; min-height:56vh; font-size:16px; line-height:1.75; color:var(--text-primary,#1d2939); }
    .lk-docpane .ProseMirror p { margin:0 0 14px; }
    .lk-docpane .ProseMirror h1 { font-size:28px; font-weight:800; margin:22px 0 12px; letter-spacing:-0.01em; }
    .lk-docpane .ProseMirror h2 { font-size:22px; font-weight:700; margin:18px 0 10px; letter-spacing:-0.01em; }
    .lk-docpane .ProseMirror ul, .lk-docpane .ProseMirror ol { padding-left:24px; margin:0 0 14px; }
    .lk-docpane .ProseMirror li { margin:4px 0; }
    .lk-docpane .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color:#98a2b3; float:left; height:0; pointer-events:none; }
  `
  document.head.appendChild(s)
}

const DocumentEditorPane = forwardRef(function DocumentEditorPane({ docId, teamId, brandVoiceId, onDocCreated, onClose }, ref) {
  const [title, setTitle] = useState('')
  const titleRef = useRef('')
  const [saveState, setSaveState] = useState('idle')
  const [bubble, setBubble] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const saveTimer = useRef(null)
  const loadedRef = useRef(false)
  const currentDocId = useRef(docId || null)

  function updateBubble(ed) {
    if (!ed) return
    const { from, to, empty } = ed.state.selection
    if (empty || from === to) { setBubble(null); return }
    try {
      const a = ed.view.coordsAtPos(from), b = ed.view.coordsAtPos(to)
      setBubble({ top: Math.min(a.top, b.top), left: (a.left + b.left) / 2, from, to })
    } catch { setBubble(null) }
  }

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: 'Schreibe oder füge Text aus dem Chat ein…' })],
    content: '',
    onUpdate: () => scheduleSave(),
    onSelectionUpdate: ({ editor }) => updateBubble(editor),
    onBlur: () => setTimeout(() => setBubble(null), 150),
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
      if (!docId) { editor.commands.clearContent(); setTitle(''); titleRef.current=''; setSaveState('idle'); loadedRef.current=true; return }
      const { data, error } = await getDocument(docId)
      if (cancelled) return
      if (error || !data) { editor.commands.clearContent(); setTitle(''); titleRef.current=''; loadedRef.current=true; return }
      setTitle(data.title || ''); titleRef.current = data.title || ''
      const json = data.content_json
      if (json && typeof json === 'object' && Object.keys(json).length) editor.commands.setContent(json)
      else editor.commands.clearContent()
      setSaveState('saved'); loadedRef.current = true
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
    loadedRef.current = true
    scheduleSave()
  }
  function newDocument() {
    currentDocId.current = null
    editor && editor.commands.clearContent()
    setTitle(''); titleRef.current=''; setSaveState('idle'); loadedRef.current = true
    onDocCreated && onDocCreated(null)
  }
  useImperativeHandle(ref, () => ({ insertText, newDocument }), [editor, scheduleSave, onDocCreated])

  async function runAction(action) {
    if (!editor) return
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, '\n')
    if (!text.trim()) return
    setAiBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate', { body: { type: 'inline_edit', prompt: action.prompt(text) } })
      if (error || !data?.text) { alert('KI-Aktion fehlgeschlagen: ' + (error?.message || data?.error || 'Keine Antwort')); return }
      const d = textToDoc(String(data.text).trim())
      editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, d.content).run()
      setBubble(null); loadedRef.current = true; scheduleSave()
    } finally { setAiBusy(false) }
  }

  return (
    <div className="lk-docpane" style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, position:'relative', background:'var(--page-bg, #F4F6FA)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 28px 10px', flexShrink:0 }}>
        <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Unbenanntes Dokument"
          style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', fontSize:20, fontWeight:800, letterSpacing:'-0.01em', color:'var(--text-primary,#101828)', fontFamily:'inherit' }}/>
        <SaveBadge state={saveState} />
        <IconBtn onClick={newDocument} title="Neues Dokument"><FilePlus2 size={16} strokeWidth={1.75}/></IconBtn>
        {onClose && <IconBtn onClick={onClose} title="Editor schließen"><X size={16} strokeWidth={1.75}/></IconBtn>}
      </div>

      {/* Toolbar */}
      <div style={{ maxWidth:820, width:'100%', margin:'0 auto', padding:'0 28px', flexShrink:0 }}>
        <Toolbar editor={editor} />
      </div>

      {/* Canvas mit Dokument-Blatt */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 28px 64px', minHeight:0 }}>
        <div style={{ maxWidth:820, margin:'0 auto', background:'var(--surface,#fff)', border:'1px solid var(--border,#E6E9EF)',
                      borderRadius:16, boxShadow:'0 1px 3px rgba(16,24,40,0.06), 0 14px 30px rgba(16,24,40,0.05)', padding:'48px 56px' }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* KI-Inline-Bubble */}
      {bubble && (
        <div onMouseDown={e => e.preventDefault()}
          style={{ position:'fixed', top: bubble.top - 48, left: bubble.left, transform:'translateX(-50%)', zIndex:50,
                   display:'flex', gap:2, padding:5, background:'#101828', borderRadius:11, boxShadow:'0 8px 24px rgba(16,24,40,0.28)' }}>
          {aiBusy ? (
            <span style={{ color:'#fff', fontSize:12.5, padding:'6px 12px' }}>KI arbeitet…</span>
          ) : AI_ACTIONS.map(a => (
            <button key={a.key} onClick={() => runAction(a)}
              style={{ background:'transparent', border:'none', color:'#fff', fontSize:12.5, fontWeight:600, padding:'6px 10px', borderRadius:7, cursor:'pointer', whiteSpace:'nowrap' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.14)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

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
      <Btn title="Überschrift" active={editor.isActive('heading',{level:2})} on={() => c().toggleHeading({level:2}).run()}><Heading2 size={16} strokeWidth={2}/></Btn>
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
