import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  Bold, Italic, Heading1, Heading2, List, ListOrdered, Quote, Undo2, Redo2,
  X, FilePlus2, Sparkles, Wand2, PenLine, Copy, Download, FileText,
  Send, Languages, ArrowRightToLine, CalendarPlus, Plus, Trash2, RotateCcw, ArrowDownToLine, Check, PanelRightClose, ChevronDown, Smile, Underline as UnderlineIcon, Highlighter,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  getDocument, updateDocument, createDocument, textToDoc, parseInlineMarks,
  listFlashActions, createFlashAction, deleteFlashAction,
} from '../lib/contentDocuments'
import EmojiPicker from './EmojiPicker'
import { useModel } from '../context/ModelContext'

const SAVE_DEBOUNCE = 900
const P = 'var(--wl-primary, #0A6FB0)'

// ── KI-Editor: gemeinsamer Rahmen für alle Inline-Aktionen ──────────────────
// Bewusst OHNE den schweren Post-Generierungs-Prompt (HUMAN_STYLE_GUIDE + Brand
// Voice + Memory-Korpus). Der homogenisiert und bremst die eigentliche
// Bearbeitung aus. Anker ist der markierte Text selbst; jede Aktion liefert nur
// eine konkrete AUFGABE, wrapEdit baut daraus den vollständigen Prompt.
const EDIT_SYSTEM = `Du bist ein präziser Text-Editor für professionellen deutschen LinkedIn-Content. Du bekommst einen markierten Textabschnitt und genau EINE Bearbeitungsaufgabe. Du führst nur diese Aufgabe aus.

Bevor du schreibst, überleg kurz: Was genau verlangt die Aufgabe, und woran würde man das fertige Ergebnis erkennen? Dann schreib die überarbeitete Fassung.

So arbeitest du:
- Setz die Aufgabe konsequent und deutlich sichtbar um. Ein Ergebnis, das fast wortgleich zum Original ist, ist ein Fehler. Trau dich, Wortwahl, Satzbau und Rhythmus wirklich zu verändern.
- Ändere NUR die in der Aufgabe verlangte Dimension. Kernaussage, Fakten, Zahlen und Eigennamen bleiben inhaltlich erhalten.
- Behalte die Sprache des Originals (Deutsch bleibt Deutsch), außer die Aufgabe verlangt ausdrücklich eine Übersetzung.
- Behalte die Perspektive (z. B. Ich-Form) und die Absatz- und Zeilenstruktur, außer die Aufgabe sagt etwas anderes.
- Schreib wie ein Mensch: natürlich, idiomatisch, konkret. Keine KI-Floskeln, keine aufgeblähten Übergänge, kein Marketing-Sprech, keine Meta-Kommentare.
- Gib AUSSCHLIESSLICH den fertig überarbeiteten Text zurück: kein Vorspann, keine Anführungszeichen um das Ganze, keine Erklärung, keine Alternativen.`

const wrapEdit = (task, t) => `${EDIT_SYSTEM}

AUFGABE: ${task}

MARKIERTER TEXT:
"""
${t}
"""`

// ── Eingebaute Flash-Actions ────────────────────────────────────────────────
const FLASH_ACTIONS = [
  { key:'shorter', label:'Kürzer', build:(t)=>wrapEdit('Kürze den Text spürbar, Ziel etwa 30 bis 50 Prozent kürzer. Streiche Füllwörter, Wiederholungen und Nebensächliches, fass Gedanken zusammen. Jeder verbleibende Satz muss tragen. Kernaussage und Tonfall bleiben.', t) },
  { key:'longer', label:'Länger', build:(t)=>wrapEdit('Bau den Text aus und mach ihn konkreter: ergänze ein anschauliches Detail, ein kurzes Beispiel oder eine Begründung mit echter Substanz. Kein Aufblähen mit Floskeln, kein Wiederholen des schon Gesagten. Ziel etwa 50 bis 80 Prozent länger, gleicher Tonfall.', t) },
  { key:'dusie', label:'Du/Sie wechseln', build:(t)=>wrapEdit('Wechsle die Anrede konsequent von Du zu Sie oder von Sie zu Du, inklusive Possessivpronomen, Verbformen und Grußformeln. Kommt keine direkte Anrede vor, formuliere so, dass die gewechselte Anrede natürlich auftaucht.', t) },
  { key:'nodash', label:'Gedankenstriche entfernen', build:(t)=>wrapEdit('Entferne alle Gedankenstriche (— und –). Ersetze sie kontextabhängig durch Komma, Punkt oder Doppelpunkt, sodass der Text natürlich liest. Sonst nichts verändern.', t) },
]
// Untermenü „Umschreiben" — konkrete Stil-Definitionen (nicht nur Adjektive)
const REWRITE_STYLES = [
  { key:'pro',       label:'Professioneller', how:'Mach ihn seriöser und professioneller: klare Struktur, präzise Begriffe, ruhiger souveräner Ton, keine Umgangssprache und kein Slang. Trotzdem menschlich, nicht steif oder bürokratisch.' },
  { key:'casual',    label:'Lockerer',        how:'Mach ihn deutlich lockerer und nahbarer: kürzere Sätze, direkte Ansprache, Alltagssprache statt Fachjargon, ruhig mal ein umgangssprachlicher Ausdruck. Es soll klingen wie gesprochen, nicht wie geschrieben, aber weiterhin professionell und nicht albern.' },
  { key:'happy',     label:'Fröhlicher',      how:'Mach ihn fröhlicher und positiver: optimistische Wortwahl, Leichtigkeit und Energie, Fokus aufs Positive. Ohne ins Kitschige oder Übertriebene zu kippen.' },
  { key:'factual',   label:'Sachlicher',      how:'Mach ihn sachlicher und nüchterner: Fakten statt Emotion, neutrale Formulierungen, keine wertenden Adjektive, keine Ausrufezeichen. Klar und unaufgeregt.' },
  { key:'confident', label:'Selbstbewusster', how:'Mach ihn selbstbewusster und überzeugender: klare Aussagen statt Weichmacher wie vielleicht, eigentlich oder ich glaube, aktive Verben, Haltung zeigen. Selbstbewusst, nicht arrogant.' },
  { key:'concise',   label:'Prägnanter',      how:'Mach ihn prägnanter und auf den Punkt: dieselbe Aussage in weniger, stärkeren Worten. Weg mit Umschweifen und Weichmachern. Jeder Satz ein Treffer.' },
  { key:'inspiring', label:'Inspirierender',  how:'Mach ihn inspirierender und motivierender: ein Bild oder ein Gedanke, der hängen bleibt, ein Blick nach vorn. Bewegend, aber ehrlich, keine hohlen Motivationsphrasen.' },
  { key:'empathic',  label:'Empathischer',    how:'Mach ihn empathischer und wärmer: zeig Verständnis, nimm die Perspektive des Lesers ernst, wärmere Wortwahl. Nah, aber nicht anbiedernd.' },
]
const rewriteBuild = (how) => (t) => wrapEdit(`Schreib den markierten Text stilistisch um. ${how}`, t)
// Untermenü „Emojis" — raus / rein
const EMOJI_ACTIONS = [
  { key:'emoji_out', label:'Emojis entfernen',  build:(t)=>wrapEdit('Entferne alle Emojis. Wortlaut und Tonfall bleiben sonst exakt gleich.', t) },
  { key:'emoji_in',  label:'Emojis hinzufügen', build:(t)=>wrapEdit('Füge dezente, professionelle Emojis an sinnvollen Stellen hinzu: sparsam, nicht in jede Zeile, nicht übertreiben. Der Wortlaut bleibt sonst unverändert.', t) },
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

// Persistente Markierung: hält die Text-Auswahl sichtbar, auch wenn der Editor
// den Fokus verliert (z. B. beim Tippen ins KI-Actions-Feld).
const persistSelKey = new PluginKey('lkPersistSel')
const PersistSelection = Extension.create({
  name: 'lkPersistSelection',
  addProseMirrorPlugins() {
    return [ new Plugin({
      key: persistSelKey,
      state: {
        init() { return { deco: DecorationSet.empty, range: null } },
        apply(tr, value) {
          let range = value.range
          const meta = tr.getMeta(persistSelKey)
          if (meta !== undefined) range = meta
          else if (range) range = { from: tr.mapping.map(range.from), to: tr.mapping.map(range.to) }
          let deco = DecorationSet.empty
          if (range && range.to > range.from) {
            deco = DecorationSet.create(tr.doc, [Decoration.inline(range.from, range.to, { class: 'lk-persisted-selection' })])
          }
          return { deco, range }
        },
      },
      props: { decorations(state) { return persistSelKey.getState(state).deco } },
    }) ]
  },
})
function setPersistedSelection(ed, range) {
  if (!ed || !ed.view) return
  const tr = ed.state.tr.setMeta(persistSelKey, range); tr.setMeta('addToHistory', false)
  ed.view.dispatch(tr)
}

if (typeof document !== 'undefined' && !document.getElementById('leadesk-docpane-css')) {
  const s = document.createElement('style')
  s.id = 'leadesk-docpane-css'
  s.textContent = `
    .lk-docpane .ProseMirror { outline:none; min-height:58vh; font-size:16px; line-height:1.78; color:var(--text-primary,#1d2939); overflow-wrap:break-word; word-break:break-word; }
    .lk-docpane .ProseMirror p { margin:0 0 14px; }
    .lk-docpane .ProseMirror h1 { font-size:27px; font-weight:800; margin:24px 0 12px; letter-spacing:-0.015em; }
    .lk-docpane .ProseMirror h2 { font-size:21px; font-weight:700; margin:20px 0 10px; letter-spacing:-0.01em; }
    .lk-docpane .ProseMirror h3 { font-size:18px; font-weight:700; margin:16px 0 8px; }
    .lk-docpane .ProseMirror ul, .lk-docpane .ProseMirror ol { padding-left:24px; margin:0 0 14px; }
    .lk-docpane .ProseMirror li { margin:4px 0; }
    .lk-docpane .ProseMirror blockquote { border-left:3px solid var(--border,#E6E9EF); margin:0 0 14px; padding:2px 0 2px 16px; color:var(--text-muted,#667085); }
    .lk-docpane .ProseMirror a { color:var(--wl-primary, #0A6FB0); text-decoration:underline; text-underline-offset:2px; cursor:pointer; }
    .lk-docpane .ProseMirror mark { padding:0 2px; border-radius:3px; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
    .lk-docpane .ProseMirror u { text-decoration-thickness:1px; text-underline-offset:2px; }
    .lk-docpane .ProseMirror:focus { outline:none; }
    .lk-docpane .ProseMirror .lk-persisted-selection { background:#B4D5FE; }
  `
  document.head.appendChild(s)
}

function countWords(text) { const t=(text||'').trim(); return t? t.split(/\s+/).length : 0 }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

const DocumentEditorPane = forwardRef(function DocumentEditorPane({
  docId, teamId, brandVoiceId, brandVoiceName, audienceId, companyVoiceIds = [], sourceChatId = null, editorOpen = false,
  onDocCreated, onClose, onAttachToPost, loadExistingPosts, onNewDocument, initialText = null, onInitialConsumed, onLoaded,
}, ref) {
  const { model: selectedModel } = useModel()
  const [title, setTitle] = useState('')
  const titleRef = useRef('')
  const [saveState, setSaveState] = useState('idle')
  const [bubble, setBubble] = useState(null)         // { top, bottom, left, from, to }
  const [aiBusy, setAiBusy] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [showTranslate, setShowTranslate] = useState(false)
  const [showRewrite, setShowRewrite] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [preview, setPreview] = useState(null)       // { text, from, to, build, label, sourceText }
  const [isEmpty, setIsEmpty] = useState(true)
  const [wordCount, setWordCount] = useState(0)
  const [continuing, setContinuing] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [postMenuOpen, setPostMenuOpen] = useState(false)
  const [posts, setPosts] = useState(null)
  const [postsLoading, setPostsLoading] = useState(false)
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
  const demoRef = useRef(false)   // true = Tour-Demo-Inhalt, NICHT speichern
  const currentDocId = useRef(docId || null)
  const popRef = useRef(null)
  const [popH, setPopH] = useState(0)

  function updateBubble(ed) {
    if (!ed) return
    const { from, to, empty } = ed.state.selection
    if (empty || from === to) { setBubble(null); setShowTranslate(false); setShowRewrite(false); setShowEmoji(false); setAiInstruction(''); setShowActionForm(false); return }
    try {
      const a = ed.view.coordsAtPos(from), b = ed.view.coordsAtPos(to)
      setBubble({ top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left: (a.left + b.left) / 2, from, to })
    } catch { setBubble(null) }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: false, linkOnPaste: false } }),
      Highlight.configure({ multicolor: true }),
      PersistSelection,
    ],
    content: '',
    onCreate: ({ editor }) => { setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())) },
    onUpdate: ({ editor }) => { setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); scheduleSave() },
    onSelectionUpdate: ({ editor }) => { if (!preview) updateBubble(editor) },
    onBlur: ({ editor }) => { const { from, to, empty } = editor.state.selection; if (!empty && from !== to) setPersistedSelection(editor, { from, to }) },
    onFocus: ({ editor }) => { setPersistedSelection(editor, null) },
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
    if (demoRef.current) { setSaveState('idle'); return }   // Tour-Demo: nie persistieren
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
      const { data, error } = await createDocument({ teamId, title: t, contentJson: json, contentText: text, brandVoiceId, sourceChatId })
      if (error || !data) { setSaveState('error'); console.warn('[DocPane] create:', error); return }
      currentDocId.current = data.id; titleRef.current = t; setTitle(t)
      setSaveState('saved'); onDocCreated && onDocCreated(data.id)
    }
  }, [editor, teamId, brandVoiceId, sourceChatId, onDocCreated])

  const scheduleSave = useCallback(() => {
    if (!loadedRef.current) return
    setSaveState('saving'); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(doSave, SAVE_DEBOUNCE)
  }, [doSave])

  useEffect(() => {
    if (!editor) return
    if (docId && docId === currentDocId.current && loadedRef.current) return
    let cancelled = false
    currentDocId.current = docId || null; loadedRef.current = false
    if (docId) demoRef.current = false   // echtes Dokument geladen → Demo-Modus aus
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
      try { onLoaded && onLoaded(docId) } catch (_e) {}
    })()
    return () => { cancelled = true }
  }, [docId, editor])

  // Erstbefüllung: Editor wurde leer gemountet (kein docId) und es liegt ein
  // initialer Text vor (z. B. „→ ins Dokument" aus dem Chat ohne offenes Doc).
  // Läuft NACH dem docId-Effekt (der bei !docId den Inhalt leert).
  const initialAppliedRef = useRef(false)
  useEffect(() => {
    if (!editor || docId) return
    if (initialText && !initialAppliedRef.current) {
      initialAppliedRef.current = true
      loadNewDocWithText(initialText)
      onInitialConsumed && onInitialConsumed()
    }
  }, [editor, docId, initialText])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // Auto-Fokus: neues/leeres Dokument bei offenem Editor → Cursor direkt bereit
  useEffect(() => {
    if (!editor || !editorOpen || !isEmpty) return
    const t = setTimeout(() => { try { editor.commands.focus('start') } catch {} }, 140)
    return () => clearTimeout(t)
  }, [editor, editorOpen, isEmpty])

  function onTitleChange(v) { setTitle(v); titleRef.current = v; scheduleSave() }

  function insertText(text) {
    if (!editor || !text) return
    demoRef.current = false
    const d = textToDoc(text)
    if (editor.isEmpty) editor.commands.setContent(d)
    else editor.chain().focus('end').insertContent([{ type:'paragraph' }, ...d.content]).run()
    setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); loadedRef.current = true; scheduleSave()
  }
  function newDocument() {
    demoRef.current = false
    currentDocId.current = null
    editor && editor.commands.clearContent()
    setTitle(''); titleRef.current=''; setSaveState('idle'); setIsEmpty(true); setWordCount(0); loadedRef.current = true
    onDocCreated && onDocCreated(null)
  }
  function loadNewDocWithText(text) {
    if (!editor) return
    demoRef.current = false
    currentDocId.current = null
    const d = textToDoc(text || '')
    editor.commands.setContent(d)
    setTitle(''); titleRef.current = ''
    setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText()))
    setSaveState('idle'); loadedRef.current = true
    scheduleSave()
  }
  useImperativeHandle(ref, () => ({
    insertText, newDocument, loadNewDocWithText, getText: () => (editor ? editor.getText() : ''),
    // Tour-Demo: Text laden OHNE Save (setContent emitUpdate=false → kein scheduleSave).
    demoLoadText: (text) => {
      if (!editor) return
      demoRef.current = true
      currentDocId.current = null
      editor.commands.setContent(textToDoc(text || ''), false)
      setTitle(''); titleRef.current = ''
      setIsEmpty(editor.isEmpty); setWordCount(countWords(editor.getText())); setSaveState('idle')
    },
    // Tour-Demo: Textstück markieren → Selektions-Werkzeugleiste erscheint.
    demoShowToolbar: () => {
      if (!editor) return
      try {
        const size = editor.state.doc.content.size
        const to = Math.min(Math.max(2, size - 1), 62)
        editor.chain().focus().setTextSelection({ from: 1, to }).run()
        updateBubble(editor)
      } catch (_) {}
    },
  }), [editor, scheduleSave, onDocCreated])

  // ── KI-Aufruf gegen generate (BV-Kontext via brand_voice_id) ──────────────
  async function callAi(promptText) {
    const finalPrompt = stripRef.current ? (promptText + NO_DASH_DIRECTIVE) : promptText
    const { data, error } = await supabase.functions.invoke('generate', {
      body: {
        // Inline-Edits laufen bewusst als 'raw' (kein Post-Generierungs-System-Prompt).
        // Der Editor-Rahmen steckt komplett in prompt (siehe EDIT_SYSTEM/wrapEdit).
        // Modell = global oben rechts gewaehltes (ModelContext), NICHT fest.
        type: 'raw', model: selectedModel, prompt: finalPrompt,
      },
    })
    if (error || !data?.text) throw new Error(error?.message || data?.error || 'Keine Antwort')
    let out = String(data.text).trim()
    if (stripRef.current) out = stripEmDashes(out)
    return out
  }

  function closeBubble() { if (editor) setPersistedSelection(editor, null); setBubble(null); setPreview(null); setShowTranslate(false); setShowRewrite(false); setShowEmoji(false); setAiInstruction(''); setShowActionForm(false) }

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
      setShowTranslate(false); setShowRewrite(false); setShowEmoji(false); setShowActionForm(false)
    } catch (e) { alert('KI-Aktion fehlgeschlagen: ' + (e?.message || e)) }
    finally { setAiBusy(false) }
  }

  function runCustomInstruction() {
    const instr = aiInstruction.trim(); if (!instr) return
    runAction((t) => wrapEdit(`Wende diese Anweisung sinngemäß und konsequent auf den markierten Text an: "${instr}".`, t), instr)
  }
  function runTranslate(lang) {
    runAction((t) => wrapEdit(`Übersetze den markierten Text vollständig und natürlich klingend nach ${lang.label}. Nicht wörtlich Wort für Wort, sondern so, wie es ein Muttersprachler formulieren würde.`, t), 'Übersetzen: ' + lang.label)
  }
  function runCustomAction(a) {
    runAction((t) => wrapEdit(a.prompt, t), a.label)
  }

  // ── Vorschau anwenden ─────────────────────────────────────────────────────
  function applyReplace() {
    if (!editor || !preview) return
    const { from, to, text } = preview
    const replacement = text.includes('\n') ? textToDoc(text).content : parseInlineMarks(text)
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
  // ── Popover-Positionierung ────────────────────────────────────────────────
  const VH = typeof window!=='undefined' ? window.innerHeight : 800
  const MARGIN = 12
  const estH = popH || 240                       // gemessene Höhe, sonst Schätzung
  const capH = Math.min(estH, VH - 2*MARGIN)      // nie höher als Viewport
  const spaceAbove = bubble ? bubble.top : 0
  const spaceBelow = bubble ? VH - bubble.bottom : 0
  // bevorzugt oberhalb der Auswahl, sonst unterhalb, sonst wo mehr Platz ist
  const placeBelow = bubble ? (spaceAbove < capH + MARGIN + 10 && spaceBelow >= spaceAbove) : false
  const popLeft = bubble ? clamp(bubble.left, 220, (typeof window!=='undefined'?window.innerWidth:1200) - 220) : 0
  // top so berechnen, dass das GANZE Popover im Viewport bleibt (translateY beachtet)
  let popTop = 0
  if (bubble) {
    const rawTop = placeBelow ? bubble.bottom + 10 : bubble.top - 10
    if (placeBelow) {
      // Oberkante bei rawTop → clampen [MARGIN, VH - capH - MARGIN]
      popTop = clamp(rawTop, MARGIN, VH - capH - MARGIN)
    } else {
      // Unterkante bei rawTop (translateY -100%) → clampen [capH + MARGIN, VH - MARGIN]
      popTop = clamp(rawTop, capH + MARGIN, VH - MARGIN)
    }
  }
  const popStyle = bubble ? {
    position:'fixed', left: popLeft, zIndex:120,
    top: popTop,
    transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
    width:380, maxWidth:'92vw',
    maxHeight: VH - 2*MARGIN, overflowY:'auto',
    background:'#fff', border:'1px solid var(--border,#E6E9EF)', borderRadius:14,
    boxShadow:'0 16px 40px rgba(16,24,40,0.18), 0 2px 8px rgba(16,24,40,0.06)', padding:10,
  } : {}

  // Popover-Höhe messen → für Viewport-Klemmung (verhindert abgeschnittene KI-Actions bei großer Auswahl)
  useLayoutEffect(() => {
    if (bubble && popRef.current) {
      const h = popRef.current.offsetHeight
      if (h && Math.abs(h - popH) > 1) setPopH(h)
    } else if (!bubble && popH !== 0) {
      setPopH(0)
    }
  })

  return (
    <div className="lk-docpane" style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, position:'relative', background:'var(--page-bg, #F7F8FA)' }}>
      {/* ── Fixe Kopfzeile ── */}
      <div style={{ flexShrink:0, borderBottom:'1px solid var(--border,#E9ECF2)', background:'var(--page-bg, #F7F8FA)' }}>
        {/* Zeile 1: nur Titel (volle Breite) + Wortzahl + Save */}
        <div style={{ padding:'12px 28px 6px' }}>
          <div style={{ maxWidth:780, margin:'0 auto', display:'flex', alignItems:'center', gap:10 }}>
            <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Unbenanntes Dokument" title={title || 'Unbenanntes Dokument'}
              style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', fontSize:18, fontWeight:800, letterSpacing:'-0.01em', color:'var(--text-primary,#101828)', fontFamily:'inherit', textOverflow:'ellipsis', whiteSpace:'nowrap', overflow:'hidden' }}/>
            <span style={{ fontSize:12, color:'var(--text-soft,#98a2b3)', whiteSpace:'nowrap', flexShrink:0 }}>{wordCount} {wordCount === 1 ? 'Wort' : 'Wörter'}</span>
            <SaveBadge state={saveState} />
          </div>
        </div>
        {/* Zeile 2: EINE durchgehende Leiste — Toolbar + Weiterschreiben · Übernehmen · Export (alles links) */}
        <div style={{ padding:'0 28px 12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:2, rowGap:4, padding:5, background:'var(--surface,#fff)', border:'1px solid var(--border,#E9ECF2)', borderRadius:11, flexWrap:'wrap', maxWidth:780, width:'100%', margin:'0 auto', boxSizing:'border-box' }}>
            <Toolbar editor={editor} />
            <div style={{ flex:1, minWidth:12 }} />
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={continueWriting} disabled={continuing} title="KI schreibt am Dokumentende weiter"
              style={{ display:'inline-flex', alignItems:'center', gap:5, height:30, padding:'0 9px', border:'none', borderRadius:7, background:'transparent', color: continuing ? 'var(--text-muted,#98a2b3)' : 'var(--text-muted,#475467)', fontSize:12.5, fontWeight:500, cursor: continuing ? 'default' : 'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}
              onMouseEnter={e=>{ if(!continuing) e.currentTarget.style.background='#EEF1F6' }} onMouseLeave={e=>{ e.currentTarget.style.background='transparent' }}>
              <PenLine size={15} strokeWidth={2}/>{continuing ? 'Schreibt…' : 'Weiterschreiben'}
            </button>
            {onAttachToPost && <span style={{ width:1, height:18, background:'var(--border,#E9ECF2)', margin:'0 4px' }}/>}
            {onAttachToPost && (
              <div style={{ position:'relative' }}>
                <button title="Inhalt als LinkedIn-Beitrag übernehmen"
                  onClick={async () => {
                    const text = editor ? editor.getText().trim() : ''
                    if (!text) { alert('Das Dokument ist leer.'); return }
                    const open = !postMenuOpen; setPostMenuOpen(open)
                    if (open && posts === null && loadExistingPosts) { setPostsLoading(true); const r = await loadExistingPosts(); setPosts(r || []); setPostsLoading(false) }
                  }}
                  style={{ display:'inline-flex', alignItems:'center', gap:6, height:30, padding:'0 11px', borderRadius:7, border:'none', background:'transparent', color:'var(--text-muted,#475467)', fontSize:12.5, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit' }}
                  onMouseEnter={e=>{ e.currentTarget.style.background='#EEF1F6' }} onMouseLeave={e=>{ e.currentTarget.style.background='transparent' }}>
                  <CalendarPlus size={15} strokeWidth={2}/>In Beitrag
                </button>
                {postMenuOpen && (
                  <>
                    <div onClick={() => setPostMenuOpen(false)} style={{ position:'fixed', inset:0, zIndex:80 }}/>
                    <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:81, background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:270, maxHeight:340, overflowY:'auto', padding:6 }}>
                      <button onClick={() => { const text = editor ? editor.getText().trim() : ''; if (text) onAttachToPost(text, '__new__'); setPostMenuOpen(false) }} style={{ ...MenuItem, color:P, fontWeight:700 }}>+ Als neuen Beitrag anlegen</button>
                      <div style={{ height:1, background:'var(--border)', margin:'4px 0' }}/>
                      <div style={{ padding:'6px 11px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em' }}>Zu bestehendem Beitrag</div>
                      {postsLoading && <div style={{ padding:'6px 11px', fontSize:12, color:'var(--text-muted)' }}>Lädt…</div>}
                      {!postsLoading && posts && posts.length === 0 && <div style={{ padding:'6px 11px', fontSize:12, color:'var(--text-muted)' }}>Noch keine Beiträge vorhanden</div>}
                      {!postsLoading && posts && posts.map(pp => (
                        <button key={pp.id} onClick={() => { const text = editor ? editor.getText().trim() : ''; if (text) onAttachToPost(text, pp.id); setPostMenuOpen(false) }} style={{ ...MenuItem, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={pp.title || '(ohne Titel)'}>
                          {pp.title || '(ohne Titel)'}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <span style={{ width:1, height:18, background:'var(--border,#E9ECF2)', margin:'0 4px' }}/>
            <div style={{ position:'relative' }}>
              <button type="button" onClick={() => setExportOpen(o => !o)} title="Exportieren / Kopieren"
                style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, border:'none', borderRadius:7, background:'transparent', color:'var(--text-muted,#475467)', cursor:'pointer' }}
                onMouseEnter={e=>{ e.currentTarget.style.background='#EEF1F6' }} onMouseLeave={e=>{ e.currentTarget.style.background='transparent' }}>
                <Download size={16} strokeWidth={1.75}/>
              </button>
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
          </div>
        </div>
      </div>

      {/* ── Scrollender Editor-Bereich ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px 72px', minHeight:0 }}>
        <div style={{ position:'relative', maxWidth:780, margin:'0 auto', background:'var(--surface,#fff)', border:'1px solid var(--border,#E9ECF2)',
                      borderRadius:16, boxShadow:'0 1px 2px rgba(16,24,40,0.04), 0 12px 28px rgba(16,24,40,0.04)', padding:'clamp(24px,5vw,48px) clamp(18px,5vw,56px)', boxSizing:'border-box' }}>
          <EditorContent editor={editor} />
          {isEmpty && editor && (
            <div style={{ position:'absolute', top:104, left:56, right:56 }}>
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
          <div ref={popRef} onMouseDown={e => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault() }} style={popStyle}>
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
                  <Chip onClick={() => { setShowRewrite(v => !v); setShowEmoji(false); setShowTranslate(false) }} active={showRewrite}>Umschreiben<ChevronDown size={12} strokeWidth={2.5} style={{ marginLeft:3, verticalAlign:'-2px', opacity:0.7 }}/></Chip>
                  {FLASH_ACTIONS.map(a => (
                    <Chip key={a.key} onClick={() => runAction(a.build, a.label)}>{a.label}</Chip>
                  ))}
                  <Chip onClick={() => { setShowEmoji(v => !v); setShowRewrite(false); setShowTranslate(false) }} active={showEmoji}>Emojis<ChevronDown size={12} strokeWidth={2.5} style={{ marginLeft:3, verticalAlign:'-2px', opacity:0.7 }}/></Chip>
                  <Chip onClick={() => { setShowTranslate(v => !v); setShowRewrite(false); setShowEmoji(false) }} active={showTranslate}><Languages size={12} strokeWidth={2} style={{ marginRight:4, verticalAlign:'-2px' }}/>Übersetzen</Chip>
                  {customActions.map(a => (
                    <Chip key={a.id} accent onClick={() => runCustomAction(a)}>{a.label}</Chip>
                  ))}
                  <Chip onClick={() => setShowActionForm(true)}><Plus size={12} strokeWidth={2.5} style={{ marginRight:3, verticalAlign:'-2px' }}/>Eigene</Chip>
                </div>
                {showRewrite && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:7, paddingTop:7, borderTop:'1px solid var(--border)' }}>
                    {REWRITE_STYLES.map(r => <Chip key={r.key} onClick={() => runAction(rewriteBuild(r.how), 'Umschreiben: ' + r.label)}>{r.label}</Chip>)}
                  </div>
                )}
                {showEmoji && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:7, paddingTop:7, borderTop:'1px solid var(--border)' }}>
                    {EMOJI_ACTIONS.map(a => <Chip key={a.key} onClick={() => runAction(a.build, a.label)}>{a.label}</Chip>)}
                  </div>
                )}
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
    background: active ? 'rgba(10,111,176,0.10)' : (accent ? 'rgba(10,111,176,0.06)' : '#F1F3F7'),
    border: '1px solid ' + (active||accent ? 'rgba(10,111,176,0.30)' : 'transparent'),
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

const HL_COLORS = [
  { c:'#FEF08A', label:'Gelb' },
  { c:'#BBF7D0', label:'Grün' },
  { c:'#BFDBFE', label:'Blau' },
  { c:'#FBCFE8', label:'Pink' },
  { c:'#FED7AA', label:'Orange' },
]

function Toolbar({ editor, onContinue, continuing }) {
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [hlOpen, setHlOpen] = useState(false)
  if (!editor) return null
  const c = () => editor.chain().focus()
  const Btn = ({ on, active, title, children }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={on}
      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, border:'none', borderRadius:7, background: active ? P : 'transparent', color: active ? '#fff' : 'var(--text-muted,#475467)', cursor:'pointer', flexShrink:0 }}
      onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='#EEF1F6' }} onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent' }}>
      {children}
    </button>
  )
  const Div = () => <span style={{ width:1, height:18, background:'var(--border,#E9ECF2)', margin:'0 4px', flexShrink:0 }}/>

  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:2, flexWrap:'nowrap' }}>
      <div style={{ position:'relative', display:'inline-flex' }}>
        <button type="button" title="Emoji einfügen" onMouseDown={e => e.preventDefault()} onClick={() => { setEmojiOpen(o => !o); setHlOpen(false) }}
          style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, border:'none', borderRadius:7, background: emojiOpen ? '#EEF1F6' : 'transparent', color:'var(--text-muted,#475467)', cursor:'pointer', flexShrink:0 }}
          onMouseEnter={e=>{ if(!emojiOpen) e.currentTarget.style.background='#EEF1F6' }} onMouseLeave={e=>{ if(!emojiOpen) e.currentTarget.style.background='transparent' }}>
          <Smile size={16} strokeWidth={2}/>
        </button>
        {emojiOpen && <EmojiPicker onPick={(em) => { editor.chain().focus().insertContent(em).run(); setEmojiOpen(false) }} onClose={() => setEmojiOpen(false)} />}
      </div>
      <Div/>
      <Btn title="Fett" active={editor.isActive('bold')} on={() => c().toggleBold().run()}><Bold size={16} strokeWidth={2}/></Btn>
      <Btn title="Kursiv" active={editor.isActive('italic')} on={() => c().toggleItalic().run()}><Italic size={16} strokeWidth={2}/></Btn>
      <Btn title="Unterstreichen" active={editor.isActive('underline')} on={() => c().toggleUnderline().run()}><UnderlineIcon size={16} strokeWidth={2}/></Btn>
      <Div/>
      {/* Markieren / Highlight */}
      <div style={{ position:'relative', display:'inline-flex' }}>
        <button type="button" title="Text farbig markieren" onMouseDown={e => e.preventDefault()} onClick={() => { setHlOpen(o => !o); setEmojiOpen(false) }}
          style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, border:'none', borderRadius:7, background: (hlOpen || editor.isActive('highlight')) ? (editor.isActive('highlight') ? P : '#EEF1F6') : 'transparent', color: editor.isActive('highlight') ? '#fff' : 'var(--text-muted,#475467)', cursor:'pointer', flexShrink:0 }}
          onMouseEnter={e=>{ if(!hlOpen && !editor.isActive('highlight')) e.currentTarget.style.background='#EEF1F6' }} onMouseLeave={e=>{ if(!hlOpen && !editor.isActive('highlight')) e.currentTarget.style.background='transparent' }}>
          <Highlighter size={16} strokeWidth={2}/>
        </button>
        {hlOpen && (
          <>
            <div onMouseDown={(e) => { e.preventDefault(); setHlOpen(false) }} style={{ position:'fixed', inset:0, zIndex:80 }}/>
            <div onMouseDown={e => e.preventDefault()}
              style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:81, background:'#fff', border:'1px solid var(--border,#E6E9EF)', borderRadius:11, boxShadow:'0 12px 34px rgba(16,24,40,0.16)', padding:8, display:'flex', alignItems:'center', gap:6 }}>
              {HL_COLORS.map(h => (
                <button key={h.c} type="button" title={h.label} onMouseDown={e => e.preventDefault()}
                  onClick={() => { editor.chain().focus().setHighlight({ color: h.c }).run(); setHlOpen(false) }}
                  style={{ width:24, height:24, borderRadius:6, border:'1px solid rgba(16,24,40,0.12)', background:h.c, cursor:'pointer', flexShrink:0 }}/>
              ))}
              <span style={{ width:1, height:20, background:'var(--border,#E9ECF2)', margin:'0 2px' }}/>
              <button type="button" title="Markierung entfernen" onMouseDown={e => e.preventDefault()}
                onClick={() => { editor.chain().focus().unsetHighlight().run(); setHlOpen(false) }}
                style={{ width:24, height:24, borderRadius:6, border:'1px solid var(--border,#E9ECF2)', background:'#fff', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted,#667085)', flexShrink:0 }}>
                <X size={13} strokeWidth={2}/>
              </button>
            </div>
          </>
        )}
      </div>
      <Div/>
      <Btn title="Überschrift 1" active={editor.isActive('heading',{level:1})} on={() => c().toggleHeading({level:1}).run()}><Heading1 size={16} strokeWidth={2}/></Btn>
      <Btn title="Überschrift 2" active={editor.isActive('heading',{level:2})} on={() => c().toggleHeading({level:2}).run()}><Heading2 size={16} strokeWidth={2}/></Btn>
      <Div/>
      <Btn title="Liste" active={editor.isActive('bulletList')} on={() => c().toggleBulletList().run()}><List size={16} strokeWidth={2}/></Btn>
      <Btn title="Nummerierte Liste" active={editor.isActive('orderedList')} on={() => c().toggleOrderedList().run()}><ListOrdered size={16} strokeWidth={2}/></Btn>
      <Div/>
      <Btn title="Rückgängig" on={() => c().undo().run()}><Undo2 size={16} strokeWidth={2}/></Btn>
      <Btn title="Wiederholen" on={() => c().redo().run()}><Redo2 size={16} strokeWidth={2}/></Btn>
      {onContinue && (
        <>
          <Div/>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={onContinue} disabled={continuing} title="KI schreibt am Dokumentende weiter"
            style={{ display:'inline-flex', alignItems:'center', gap:5, height:30, padding:'0 9px', border:'none', borderRadius:7, background:'transparent', color:'var(--text-muted,#475467)', fontSize:12.5, fontWeight:500, cursor: continuing ? 'default' : 'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}
            onMouseEnter={e=>{ if(!continuing) e.currentTarget.style.background='#EEF1F6' }} onMouseLeave={e=>{ e.currentTarget.style.background='transparent' }}>
            <PenLine size={15} strokeWidth={2}/>{continuing ? 'Schreibt…' : 'Weiterschreiben'}
          </button>
        </>
      )}
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
