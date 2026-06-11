import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { getDocument, updateDocument, createDocument, textToDoc } from '../lib/contentDocuments'

const SAVE_DEBOUNCE = 900
const P = 'var(--wl-primary, rgb(49,90,231))'

if (typeof document !== 'undefined' && !document.getElementById('leadesk-editor-css')) {
  const s = document.createElement('style')
  s.id = 'leadesk-editor-css'
  s.textContent = `
    .lk-docpane .ProseMirror { outline:none; font-size:16px; line-height:1.7; color:var(--text-primary,#0f172a); }
    .lk-docpane .ProseMirror p { margin:0 0 12px; }
    .lk-docpane .ProseMirror h1 { font-size:26px; font-weight:800; margin:18px 0 10px; }
    .lk-docpane .ProseMirror h2 { font-size:21px; font-weight:700; margin:16px 0 8px; }
    .lk-docpane .ProseMirror ul, .lk-docpane .ProseMirror ol { padding-left:22px; margin:0 0 12px; }
    .lk-docpane .ProseMirror li { margin:2px 0; }
    .lk-docpane .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color:#9ca3af; float:left; height:0; pointer-events:none; }
  `
  document.head.appendChild(s)
}

const DocumentEditorPane = forwardRef(function DocumentEditorPane({ docId, teamId, brandVoiceId, onDocCreated }, ref) {
  const [title, setTitle] = useState('')
  const titleRef = useRef('')
  const [saveState, setSaveState] = useState('idle')
  const saveTimer = useRef(null)
  const loadedRef = useRef(false)
  const currentDocId = useRef(docId || null)

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: 'Schreibe oder füge Text aus dem Chat ein…' })],
    content: '',
    onUpdate: () => scheduleSave(),
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
    if (docId && docId === currentDocId.current && loadedRef.current) return // gerade selbst erstellt
    let cancelled = false
    currentDocId.current = docId || null
    loadedRef.current = false
    ;(async () => {
      if (!docId) {
        editor.commands.clearContent(); setTitle(''); titleRef.current = ''; setSaveState('idle'); loadedRef.current = true; return
      }
      const { data, error } = await getDocument(docId)
      if (cancelled) return
      if (error || !data) { editor.commands.clearContent(); setTitle(''); titleRef.current = ''; loadedRef.current = true; return }
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
    setTitle(''); titleRef.current = ''; setSaveState('idle'); loadedRef.current = true
    onDocCreated && onDocCreated(null)
  }
  useImperativeHandle(ref, () => ({ insertText, newDocument }), [editor, scheduleSave, onDocCreated])

  return (
    <div className="lk-docpane" style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 18px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Unbenanntes Dokument"
          style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', fontSize:16, fontWeight:700, color:'var(--text-primary,#0f172a)', fontFamily:'inherit' }}/>
        <SaveBadge state={saveState} />
        <button type="button" onClick={newDocument} title="Neues Dokument"
          style={{ border:'1px solid var(--border)', background:'#fff', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, cursor:'pointer', color:'var(--text-primary,#0f172a)' }}>+ Neu</button>
      </div>
      <Toolbar editor={editor} />
      <div style={{ flex:1, overflowY:'auto', padding:'18px 22px', minHeight:0 }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
})

function Toolbar({ editor }) {
  if (!editor) return null
  const c = () => editor.chain().focus()
  const Btn = ({ on, active, children, title }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={on}
      style={{ border:'1px solid var(--border)', background: active ? P : '#fff', color: active ? '#fff' : 'var(--text-primary,#0f172a)', borderRadius:7, padding:'5px 9px', fontSize:13, fontWeight:700, cursor:'pointer', minWidth:32 }}>{children}</button>
  )
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap', padding:'8px 18px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
      <Btn title="Fett" active={editor.isActive('bold')} on={() => c().toggleBold().run()}><b>B</b></Btn>
      <Btn title="Kursiv" active={editor.isActive('italic')} on={() => c().toggleItalic().run()}><i>I</i></Btn>
      <Btn title="Überschrift" active={editor.isActive('heading',{level:2})} on={() => c().toggleHeading({level:2}).run()}>H</Btn>
      <Btn title="Liste" active={editor.isActive('bulletList')} on={() => c().toggleBulletList().run()}>•</Btn>
      <Btn title="Nummerierte Liste" active={editor.isActive('orderedList')} on={() => c().toggleOrderedList().run()}>1.</Btn>
      <span style={{ width:1, background:'var(--border)', margin:'0 4px' }} />
      <Btn title="Rückgängig" on={() => c().undo().run()}>↶</Btn>
      <Btn title="Wiederholen" on={() => c().redo().run()}>↷</Btn>
    </div>
  )
}

function SaveBadge({ state }) {
  const map = { saving:{t:'Speichert…',c:'var(--text-muted,#64748b)'}, saved:{t:'✓ Gespeichert',c:'var(--success-text,#059669)'}, error:{t:'⚠ Nicht gespeichert',c:'var(--danger-text,#dc2626)'} }
  const s = map[state]
  return s ? <span style={{ fontSize:12, color:s.c, fontWeight:600 }}>{s.t}</span> : <span/>
}

export default DocumentEditorPane
