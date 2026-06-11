import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { getDocument, updateDocument } from '../lib/contentDocuments'

const SAVE_DEBOUNCE = 900

// .ProseMirror-Styling + Placeholder einmalig injizieren (Inline-Styles können kein ::before)
if (typeof document !== 'undefined' && !document.getElementById('leadesk-editor-css')) {
  const s = document.createElement('style')
  s.id = 'leadesk-editor-css'
  s.textContent = `
    .lk-doc .ProseMirror { outline:none; min-height:420px; font-size:16px; line-height:1.7; color:var(--text-primary,#0f172a); }
    .lk-doc .ProseMirror p { margin:0 0 12px; }
    .lk-doc .ProseMirror h1 { font-size:26px; font-weight:800; margin:18px 0 10px; }
    .lk-doc .ProseMirror h2 { font-size:21px; font-weight:700; margin:16px 0 8px; }
    .lk-doc .ProseMirror ul, .lk-doc .ProseMirror ol { padding-left:22px; margin:0 0 12px; }
    .lk-doc .ProseMirror li { margin:2px 0; }
    .lk-doc .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder); color:#9ca3af; float:left; height:0; pointer-events:none;
    }
  `
  document.head.appendChild(s)
}

export default function DocumentEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const titleRef = useRef('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saveState, setSaveState] = useState('idle') // idle|saving|saved|error
  const saveTimer = useRef(null)
  const loadedRef = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Schreibe oder füge deinen Text ein…' }),
    ],
    content: '',
    onUpdate: () => scheduleSave(),
  })

  useEffect(() => {
    if (!editor) return
    let cancelled = false
    ;(async () => {
      setLoading(true); loadedRef.current = false
      const { data, error } = await getDocument(id)
      if (cancelled) return
      if (error || !data) { setNotFound(true); setLoading(false); return }
      setTitle(data.title || ''); titleRef.current = data.title || ''
      const json = data.content_json
      if (json && typeof json === 'object' && Object.keys(json).length) editor.commands.setContent(json)
      else editor.commands.clearContent()
      loadedRef.current = true; setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id, editor])

  const doSave = useCallback(async () => {
    if (!editor || !loadedRef.current) return
    setSaveState('saving')
    const { error } = await updateDocument(id, {
      title: titleRef.current.trim() || 'Unbenanntes Dokument',
      content_json: editor.getJSON(),
      content_text: editor.getText(),
    })
    setSaveState(error ? 'error' : 'saved')
  }, [editor, id])

  const scheduleSave = useCallback(() => {
    if (!loadedRef.current) return
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(doSave, SAVE_DEBOUNCE)
  }, [doSave])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  function onTitleChange(v) { setTitle(v); titleRef.current = v; scheduleSave() }

  if (notFound) {
    return (
      <div style={{ padding: 40, maxWidth: 760, margin: '0 auto' }}>
        <BackLink onClick={() => navigate('/dokumente')} />
        <div style={{ marginTop: 20, color: 'var(--text-muted,#64748b)' }}>Dokument nicht gefunden.</div>
      </div>
    )
  }

  return (
    <div className="lk-doc" style={{ maxWidth: 820, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16 }}>
        <BackLink onClick={() => navigate('/dokumente')} />
        <SaveBadge state={saveState} />
      </div>

      <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Titel"
        style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:28, fontWeight:800,
                 color:'var(--text-primary,#0f172a)', padding:'4px 0', marginBottom:8, fontFamily:'inherit' }}/>

      <Toolbar editor={editor} />

      <div style={{ background:'var(--surface,#fff)', border:'1px solid var(--border,#e5e7eb)', borderRadius:12, padding:'20px 22px', marginTop:12 }}>
        {loading ? <div style={{ color:'var(--text-muted,#64748b)', fontSize:14 }}>Lädt…</div> : <EditorContent editor={editor} />}
      </div>
    </div>
  )
}

function Toolbar({ editor }) {
  if (!editor) return null
  const c = () => editor.chain().focus()
  const Btn = ({ on, active, children, title }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={on}
      style={{ border:'1px solid var(--border,#e5e7eb)', background: active ? 'var(--primary,#315AE7)' : '#fff',
               color: active ? '#fff' : 'var(--text-primary,#0f172a)', borderRadius:8, padding:'6px 10px',
               fontSize:13, fontWeight:700, cursor:'pointer', minWidth:34 }}>{children}</button>
  )
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
      <Btn title="Fett" active={editor.isActive('bold')} on={() => c().toggleBold().run()}><b>B</b></Btn>
      <Btn title="Kursiv" active={editor.isActive('italic')} on={() => c().toggleItalic().run()}><i>I</i></Btn>
      <Btn title="Überschrift" active={editor.isActive('heading',{level:2})} on={() => c().toggleHeading({level:2}).run()}>H</Btn>
      <Btn title="Liste" active={editor.isActive('bulletList')} on={() => c().toggleBulletList().run()}>•</Btn>
      <Btn title="Nummerierte Liste" active={editor.isActive('orderedList')} on={() => c().toggleOrderedList().run()}>1.</Btn>
      <span style={{ width:1, background:'var(--border,#e5e7eb)', margin:'0 4px' }} />
      <Btn title="Rückgängig" on={() => c().undo().run()}>↶</Btn>
      <Btn title="Wiederholen" on={() => c().redo().run()}>↷</Btn>
    </div>
  )
}

function BackLink({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted,#64748b)', fontSize:13, fontWeight:600, padding:0 }}>
      ← Dokumente
    </button>
  )
}

function SaveBadge({ state }) {
  const map = {
    saving: { t:'Speichert…',          c:'var(--text-muted,#64748b)' },
    saved:  { t:'✓ Gespeichert',        c:'var(--success-text,#059669)' },
    error:  { t:'⚠ Nicht gespeichert',  c:'var(--danger-text,#dc2626)' },
  }
  const s = map[state]
  return s ? <span style={{ fontSize:12, color:s.c, fontWeight:600 }}>{s.t}</span> : <span/>
}
