// src/pages/ContentStudio.jsx
// Text-Werkstatt v2 — Clean Hero + einklappbare Sidebar + Plus-Menü + Loading.
//
// State-Machine:
//   - viewMode = 'clean' wenn keine Messages UND kein Chat geladen → Hero/Banner + zentrales Eingabefeld
//   - viewMode = 'chat'  wenn Chat aktiv (Messages geladen oder gesendet) → klassisches Chat-Layout
//
// Sidebar:
//   - Standard eingeklappt
//   - Toggle-Button oben links bleibt sichtbar
//   - Beim ersten Send im Clean-Modus → Sidebar klappt automatisch auf

import React, { useState, useEffect, useRef } from 'react'
import { Pencil, Pin, BookOpen, Target, Send, Loader2, Globe, Plus, FileText, ChevronLeft, ChevronRight, X, Mic, Square, Image as ImageIcon, Download, Sparkles, Wand2, FilePlus2, Brush, MessageSquare, CalendarPlus, Maximize2, Minimize2 } from 'lucide-react'
import { useVoiceInput } from '../hooks/useVoiceInput'
import CompanyMultiSelect from '../components/CompanyMultiSelect'
import AudienceSelect from '../components/AudienceSelect'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sharedEntityIds, scopeByTeamOrShared } from '../lib/teamShares'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import DocumentEditorPane from '../components/DocumentEditorPane'
import { listDocumentsForChat, listDocuments, addDocumentToChat, listChatsForDocument } from '../lib/contentDocuments'
import DesignerPane from '../components/designer/DesignerPane'
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL, splitModelValue, imageModelLabel, ASPECT_PRESETS, DEFAULT_ASPECT } from '../lib/imageModels'
import { listVisualsForChat, linkVisualToChat, getVisual, signedVisualUrl, downloadVisualBlob, visualDataUrl, uploadImageBlob, listTeamVisuals, listChatsForVisual } from '../lib/contentVisuals'

const P = 'var(--wl-primary, rgb(49,90,231))'
const ACCENT = '#30A0D0'

// Minimal inline-Markdown-Parser: **bold**, *italic*. Lässt Listen/Linebreaks
// dem whiteSpace:pre-wrap unten.
function parseInline(text) {
  if (!text) return text
  const parts = []
  const regex = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*)/g
  let last = 0
  let m, key = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2]) parts.push(<strong key={'b' + (key++)}>{m[2]}</strong>)
    else if (m[3]) parts.push(<em key={'i' + (key++)}>{m[3]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : text
}

// ─── Markdown-light Render: Beitragstext als Card extrahieren ───────────────
function renderMessageContent(content) {
  if (!content) return null
  const parts = []
  const regex = /<beitragstext>([\s\S]*?)<\/beitragstext>/gi
  let lastIdx = 0
  let m, key = 0
  while ((m = regex.exec(content)) !== null) {
    if (m.index > lastIdx) parts.push(<TextSpan key={`t${key++}`} text={content.slice(lastIdx, m.index)} />)
    parts.push(<PostExtractCard key={`p${key++}`} text={m[1].trim()} />)
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < content.length) parts.push(<TextSpan key={`t${key++}`} text={content.slice(lastIdx)} />)
  if (parts.length === 0) return <TextSpan text={content} />
  return parts
}

function TextSpan({ text }) {
  return (
    <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:14, lineHeight:1.6, color:'var(--text-primary)' }}>
      {parseInline(text)}
    </div>
  )
}

function PostExtractCard({ text }) {
  return (
    <div data-tour-id="cs-post-card" style={{
      margin:'10px 0', padding:'14px 16px',
      background:'#F8FAFC', border:'1.5px solid rgba(49,90,231,0.25)', borderRadius:11, position:'relative',
    }}>
      <div style={{ fontSize:11, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>
        📋 Beitragstext
      </div>
      <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:14, lineHeight:1.6, color:'var(--text-primary)' }}>
        {parseInline(text)}
      </div>
    </div>
  )
}

function SourcesList({ sources }) {
  if (!sources?.length) return null
  return (
    <div style={{ marginTop:8, padding:'8px 12px', background:'#F1F5F9', borderRadius:8, fontSize:11 }}>
      <div style={{ fontWeight:700, color:'var(--text-muted)', marginBottom:4 }}>Quellen</div>
      {sources.map((s, i) => (
        <div key={i} style={{ marginBottom:2 }}>
          <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color:P, textDecoration:'none' }}>
            {s.title || s.url}
          </a>
        </div>
      ))}
    </div>
  )
}

// ─── Typing-Indicator ──────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'12px 14px', background:'#fff', border:'1px solid var(--border)', borderRadius:12, width:'fit-content' }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background: P, animation: 'tw-blink 1.4s infinite ease-in-out', animationDelay:'0s' }}/>
      <span style={{ width:7, height:7, borderRadius:'50%', background: P, animation: 'tw-blink 1.4s infinite ease-in-out', animationDelay:'0.2s' }}/>
      <span style={{ width:7, height:7, borderRadius:'50%', background: P, animation: 'tw-blink 1.4s infinite ease-in-out', animationDelay:'0.4s' }}/>
      <style>{`@keyframes tw-blink { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }`}</style>
    </div>
  )
}

// Zielgruppen-Referenz dekodieren: 's2:<uuid>' = Strike2-Persona, sonst normale Zielgruppe.
function splitAudienceRef(v) {
  if (typeof v === 'string' && v.startsWith('s2:')) return { target_audience_id: null, strike2_persona_id: v.slice(3) }
  return { target_audience_id: v || null, strike2_persona_id: null }
}

// ─── Hauptkomponente ────────────────────────────────────────────────────────
export default function ContentStudio({ session }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice, brandVoices } = useBrandVoice()

  // Sidebar State (persistiert)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('tw_sidebar_open') === '1' } catch { return false }
  })
  useEffect(() => { try { localStorage.setItem('tw_sidebar_open', sidebarOpen ? '1' : '0') } catch {} }, [sidebarOpen])

  // Chat-Listen-State
  const [chats, setChats] = useState([])
  const [chatsLoading, setChatsLoading] = useState(true)
  const [activeChatId, setActiveChatId] = useState(null)
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  // Eingabe-State
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [audiences, setAudiences] = useState([])
  const [selectedAudienceId, setSelectedAudienceId] = useState('')
  const [selectedCompanyVoiceIds, setSelectedCompanyVoiceIds] = useState([])
  const [knowledgeBase, setKnowledgeBase] = useState([])
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState([])
  const [plusOpen, setPlusOpen] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [error, setError] = useState('')

  // Linked Post
  const [linkedPost, setLinkedPost] = useState(null)

  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const editorRef = useRef(null)
  const docParam = searchParams.get('doc')
  const [editorOpen, setEditorOpen] = useState(!!docParam)
  // Neues Dokument: Editor mounten (auch ohne docParam) + Text nach Mount laden.
  const [newDocActive, setNewDocActive] = useState(false)
  const [pendingDocText, setPendingDocText] = useState(null)
  const editorOpenRef = useRef(editorOpen)
  useEffect(() => { editorOpenRef.current = editorOpen }, [editorOpen])
  const csRootRef = useRef(null)
  // Eingeklappt: das 24px-rechts-Padding der umgebenden App-Shell (MAIN) entfernen,
  // damit die ausziehbare Splitscreen-Karte bündig am echten Bildschirmrand sitzt.
  useEffect(() => {
    const main = csRootRef.current?.closest('main')
    if (!main) return
    // Shell-CSS setzt padding-right per !important -> mit 'important' überschreiben.
    // Immer (auch ausgeklappt), damit die Splitscreen-Karte/Pane bündig am Rand sitzt.
    main.style.setProperty('padding-right', '0px', 'important')
    return () => { main.style.removeProperty('padding-right') }
  }, [])

  // (Splitscreen-Steuerung: feste Zustände via Pfeil-Buttons, siehe unten)
  const [useEditorContext, setUseEditorContext] = useState(false)
  const [chatDocs, setChatDocs] = useState([])
  const [demoRailDocs, setDemoRailDocs] = useState(null) // Tour-Demo: rechte Dokument-Leiste mit Beispiel-Dokumenten

  // ─── Content-Werkstatt v2: Bilder / Designer ──────────────────────────────
  const visualParam = searchParams.get('visual')
  const [splitMode, setSplitMode] = useState(visualParam ? 'design' : 'doc')   // 'doc' | 'design'
  // paneView leitet die 3 Fullscreen-Zustände ab (Chat | Split | Suite)
  const [paneView, setPaneView] = useState('split')                            // 'chat' | 'split' | 'suite'
  const [panePct, setPanePct] = useState(52)   // Split-Breite der Pane in % (ziehbar)
  // Echte linke Kante der Pane messen, damit Switcher + Steuerung exakt anliegen
  // (in jedem Zustand: Split UND Vollbild — der schmale Chat-Streifen verschiebt sie).
  const rightOpen = editorOpen                                                  // Kompat: rechtes Panel offen?
  // Visual-Composer (In-Chat-Bildgenerierung)
  const [visualMode, setVisualMode] = useState(false)
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL)
  const [imageAspect, setImageAspect] = useState(DEFAULT_ASPECT)
  const [forceNewImage, setForceNewImage] = useState(false)
  // Bild<->Chat-Leiste + aktives Designer-Bild
  const [chatVisuals, setChatVisuals] = useState([])
  const [activeVisual, setActiveVisual] = useState(null)
  const visualParamHandledRef = useRef(false)

  // "Öffnen"-Picker für leeres Dokument/Design: zuerst Element wählen, dann Chat.
  const [openPicker, setOpenPicker] = useState(null)   // { type:'design'|'doc' } | null
  const [pickerStep, setPickerStep] = useState('item') // 'item' | 'chat'
  const [pickerItems, setPickerItems] = useState([])
  const [pickerItem, setPickerItem] = useState(null)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerChats, setPickerChats] = useState([])
  const [pickerShowOther, setPickerShowOther] = useState(false)
  const [pickerBrandChats, setPickerBrandChats] = useState([])
  const [pickerSearch, setPickerSearch] = useState('')

  useEffect(() => { if (docParam) { setEditorOpen(true); setSidebarOpen(false); setSplitMode('doc'); setNewDocActive(false) } }, [docParam])

  // ─── Brand-Wechsel: Content-Werkstatt komplett zurücksetzen ─────────────────
  // Bilder, Design-Projekte, Dokumente und Chats sind strikt brand-scoped. Beim
  // Wechsel der Brand Voice (oben) darf NICHTS vom alten Brand stehen bleiben:
  // Editor/Designer schließen, Visual-/Doc-/Chat-State leeren, URL-Parameter
  // (chat_id/post_id/doc/visual) entfernen → zurück auf den Start-Chat-Screen.
  const prevBrandRef = useRef(activeBrandVoice?.id || null)
  useEffect(() => {
    const id = activeBrandVoice?.id || null
    if (prevBrandRef.current === id) return            // kein echter Wechsel
    const had = prevBrandRef.current                    // vorheriger Brand (null = Erst-Laden)
    prevBrandRef.current = id
    if (!had) return                                    // Erst-Initialisierung → nicht resetten
    setEditorOpen(false); setVisualMode(false); setForceNewImage(false)
    setNewDocActive(false); setPendingDocText(null)
    setSplitMode('doc'); setPaneView('split'); setSidebarOpen(false)
    setActiveChatId(null); setActiveChat(null); setMessages([]); setLinkedPost(null)
    setChatDocs([]); setDemoRailDocs(null); setChatVisuals([]); setActiveVisual(null)
    setSelectedCompanyVoiceIds([]); setSelectedAudienceId(''); setSelectedKnowledgeIds([])
    setInput(''); setError('')
    visualParamHandledRef.current = false
    try { navigate('/content-studio', { replace: true }) } catch (_e) {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandVoice?.id])

  // ─── State-Restore beim Laden/Refresh ───────────────────────────────────────
  // Der komplette Arbeitsstand (Pane-Ansicht, Doc/Designer, geöffnetes Bild, Chat)
  // wird pro Brand in localStorage gehalten und beim erneuten Laden EXAKT wieder-
  // hergestellt — egal ob Split- oder Vollbild. Läuft genau EINMAL pro Seitenladen
  // (nicht beim Brand-Wechsel, der bewusst auf den Start-Screen zurücksetzt).
  const restoredRef = useRef(false)
  const SESSION_KEY = 'tw_designer_session_v1'
  useEffect(() => {
    if (restoredRef.current) return
    const bid = activeBrandVoice?.id
    if (!bid) return                                  // auf Brand warten
    restoredRef.current = true
    // Deep-Link (?visual=/?chat_id=/?doc=) hat Vorrang vor der gespeicherten Sitzung.
    if (visualParam || searchParams.get('chat_id') || searchParams.get('post_id') || docParam) return
    let sess = null
    try { sess = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { sess = null }
    if (!sess || sess.brandId !== bid) return
    ;(async () => {
      // Dokumente/Designs gehören IMMER zu einem Chat (gleiche Zuordnungslogik).
      // Ohne zugeordneten Chat wird KEIN Dokument/Design wiederhergestellt → leerer
      // Chat startet immer mit leerem Dokument UND leerem Designer.
      if (!sess.chatId) return
      try { await openChat(sess.chatId) } catch (_e) {}
      if (sess.editorOpen && sess.splitMode === 'design' && sess.visualId) {
        try {
          const { data: v } = await getVisual(sess.visualId)
          if (v) { setActiveVisual(v); setSplitMode('design'); setSidebarOpen(false); setEditorOpen(true) }
        } catch (_e) {}
      } else if (sess.editorOpen && sess.splitMode === 'doc') {
        setSplitMode('doc'); setEditorOpen(true)
      }
      if (sess.paneView) setPaneView(sess.paneView)
      if (typeof sess.panePct === 'number') setPanePct(sess.panePct)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandVoice?.id])

  // Arbeitsstand pro Brand laufend (in Echtzeit) sichern.
  useEffect(() => {
    if (!restoredRef.current) return
    const bid = activeBrandVoice?.id
    if (!bid) return
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        brandId: bid, visualId: activeVisual?.id || null, chatId: activeChatId || null,
        paneView, panePct, splitMode, editorOpen,
      }))
    } catch (_e) {}
  }, [activeBrandVoice?.id, activeVisual?.id, activeChatId, paneView, panePct, splitMode, editorOpen])
  // Onboarding-Tour-Hooks: Dokumentansicht öffnen + Demo (Beispiel-Chat → ins
  // Dokument → KI-Werkzeugleiste). Alles rein lokal, kein LLM-Call, kein DB-Save.
  useEffect(() => {
    const DEMO_POST = [
      'Die meisten Vertriebsteams verwechseln Aktivität mit Fortschritt.',
      '50 Nachrichten am Tag, 3 Antworten, 0 Termine. Das Problem ist selten die Menge, sondern die Relevanz.',
      'Was den Unterschied macht:',
      '1. Erst zuhören, dann pitchen. Die ersten zwei Nachrichten verkaufen nichts.',
      '2. Jede Nachricht auf ein echtes Signal beziehen, nicht nur auf den Namen.',
      '3. Lieber 10 durchdachte Kontakte als 100 Copy-Paste-Anfragen.',
      'Reichweite ist kein Zufall, sondern das Ergebnis von Relevanz.',
      'Wie misst du, ob eine Vertriebsaktivität wirklich etwas bringt?',
    ].join('\n\n')
    const openEditor  = () => { setEditorOpen(true); setSidebarOpen(false) }
    const closeEditor = () => setEditorOpen(false)
    const demoChat = () => {
      setSidebarOpen(false)
      const now = new Date().toISOString()
      setMessages([
        { id:'tour-demo-u', role:'user', content:'Schreib einen LinkedIn-Beitrag darüber, dass Aktivität im Vertrieb nicht gleich Fortschritt ist.', metadata:{}, created_at:now },
        { id:'tour-demo-a', role:'assistant', content:'Klar, hier ist ein Vorschlag für deinen LinkedIn-Beitrag:\n\n<beitragstext>' + DEMO_POST + '</beitragstext>\n\nMagst du ihn so übernehmen, oder soll ich Ton oder Länge anpassen?', metadata:{ beitragstext: DEMO_POST }, created_at:now },
      ])
    }
    const demoInsert  = () => { setSidebarOpen(false); setEditorOpen(true); setTimeout(() => editorRef.current?.demoLoadText?.(DEMO_POST), 80) }
    const demoToolbar = () => { setEditorOpen(true); setTimeout(() => editorRef.current?.demoShowToolbar?.(), 160) }
    const demoRail = () => {
      setSidebarOpen(false); setEditorOpen(true)
      const t = new Date().toISOString()
      setDemoRailDocs([
        { id:'tour-doc-1', title:'Aktivität ≠ Fortschritt (Hauptbeitrag)', updated_at:t },
        { id:'tour-doc-2', title:'Variante: kürzer & pointierter', updated_at:t },
        { id:'tour-doc-3', title:'Hook-Sammlung zum Thema', updated_at:t },
      ])
    }
    const demoClear   = () => { setMessages([]); setEditorOpen(false); setDemoRailDocs(null) }
    const evs = [['open-editor',openEditor],['close-editor',closeEditor],['demo-chat',demoChat],['demo-insert',demoInsert],['demo-toolbar',demoToolbar],['demo-rail',demoRail],['demo-clear',demoClear]]
    evs.forEach(([k,fn]) => window.addEventListener('leadesk:tour-'+k, fn))
    return () => evs.forEach(([k,fn]) => window.removeEventListener('leadesk:tour-'+k, fn))
  }, [])

  // ─── ViewMode: clean wenn kein Chat aktiv und keine Messages ──────────────
  const viewMode = (activeChatId || messages.length > 0) ? 'chat' : 'clean'

  // ─── Chats laden für aktive BV ────────────────────────────────────────────
  async function loadChats() {
    if (!activeBrandVoice?.id) { setChats([]); setChatsLoading(false); return }
    setChatsLoading(true)
    const { data } = await supabase.from('content_chats')
      .select('id, title, post_id, updated_at')
      .eq('brand_voice_id', activeBrandVoice.id)
      .order('updated_at', { ascending: false })
      .limit(100)
    setChats(data || [])
    setChatsLoading(false)
  }
  useEffect(() => { loadChats() }, [activeBrandVoice?.id])

  // ─── Audiences + Knowledge Base laden ─────────────────────────────────────
  useEffect(() => {
    if (!activeBrandVoice?.id) return
    ;(async () => {
      const [_taShared, _kbShared] = await Promise.all([
        sharedEntityIds('target_audiences', activeTeamId),
        sharedEntityIds('knowledge_base', activeTeamId),
      ])
      const [audRes, kbRes] = await Promise.all([
        scopeByTeamOrShared(supabase.from('target_audiences').select('id, name'), activeTeamId, _taShared)
          .order('name', { ascending: true }),
        scopeByTeamOrShared(supabase.from('knowledge_base').select('id, name, category'), activeTeamId, _kbShared)
          .order('updated_at', { ascending: false }),
      ])
      let s2list = []
      if (activeTeamId) {
        const { data: s2 } = await supabase.from('strike2_personas')
          .select('id, name, antworten, persona_grunddaten, status')
          .eq('team_id', activeTeamId)
          .order('updated_at', { ascending: false })
        s2list = (s2 || [])
          .filter(p => p && ((p.antworten && Object.keys(p.antworten).length > 0) || (p.persona_grunddaten && Object.keys(p.persona_grunddaten).length > 1)))
          .map(p => ({ id: 's2:' + p.id, name: p.name || 'Strike2 Zielgruppe', kind: 'strike2' }))
      }
      setAudiences([...(audRes.data || []), ...s2list])
      setKnowledgeBase(kbRes.data || [])
    })()
  }, [activeBrandVoice?.id, activeTeamId])

  // ─── URL-Param-Handler ────────────────────────────────────────────────────
  useEffect(() => {
    const cId = searchParams.get('chat_id')
    const pId = searchParams.get('post_id')
    const genImage = searchParams.get('gen') === 'image'
    if (cId) {
      // Wenn die URL-Aenderung aus sendMessage kommt (neu erstellter Chat dessen
      // ID wir gerade gesetzt haben), NICHT openChat triggern — sonst ueberschreibt
      // openChat die optimistisch gesetzte User-Bubble + Typing-Indicator mit dem
      // leeren DB-Stand (DB hat die User-Nachricht erst nach der Edge-Function).
      if (cId !== activeChatId) openChat(cId)
      return
    }
    if (pId) { handlePostIdFlow(pId, genImage); return }
    // Kein Param → leerer Clean-State
    setActiveChatId(null); setActiveChat(null); setMessages([]); setLinkedPost(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, activeBrandVoice?.id])

  async function handlePostIdFlow(postId, genImage = false) {
    const { data: post } = await supabase.from('content_posts')
      .select('id, title, content, brand_voice_id, text_werkstatt_chat_id, company_voice_ids, company_voice_id')
      .eq('id', postId).maybeSingle()
    if (!post) return
    setLinkedPost(post)
    if (genImage) setVisualMode(true)
    // Wenn schon ein Chat existiert → öffne ihn (Sidebar geht auf für Chat-View)
    if (post.text_werkstatt_chat_id) {
      setSidebarOpen(true)
      openChat(post.text_werkstatt_chat_id)
      if (genImage) setInput('Erstelle ein passendes Bild zu diesem Beitrag.')
      return
    }
    // Sonst: Clean-View mit Standard-Input — Company-Auswahl vom Beitrag übernehmen
    setActiveChatId(null); setActiveChat(null); setMessages([])
    setSelectedCompanyVoiceIds(post.company_voice_ids || (post.company_voice_id ? [post.company_voice_id] : []))
    if (genImage) {
      setInput('Erstelle ein passendes Bild zu diesem Beitrag.')
    } else if ((post.content || '').trim()) {
      setInput('Bitte verbessere den Text des angehängten Beitrags.')
    } else {
      setInput('Bitte schreibe einen Text für den angehängten Beitrag.')
    }
  }

  async function loadChatDocs(chatId) {
    const id = chatId || activeChatId
    if (!id) { setChatDocs([]); return }
    const { data } = await listDocumentsForChat(id)
    setChatDocs(data || [])
  }
  // Bei Chatwechsel: Dokumente des Chats laden + offenes Dokument abgleichen.
  // Gehört das offene Dokument NICHT zum neuen Chat → letztes Dokument dieses Chats
  // zeigen (recency), oder einklappen wenn der Chat kein Dokument hat.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!activeChatId) { setChatDocs([]); return }
      const { data } = await listDocumentsForChat(activeChatId)
      if (cancelled) return
      const docs = data || []
      setChatDocs(docs)
      const cur = new URLSearchParams(window.location.search).get('doc')
      if (cur && !docs.some(d => d.id === cur)) {
        const n = new URLSearchParams(window.location.search)
        if (editorOpenRef.current && docs.length) {
          n.set('doc', docs[0].id); setSearchParams(n, { replace: true })
        } else {
          n.delete('doc'); setSearchParams(n, { replace: true })
          if (editorOpenRef.current && !docs.length) setEditorOpen(false)
        }
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId])

  function selectDoc(id) {
    if (!id) return
    if (activeChatId) addDocumentToChat(id, activeChatId)  // Aktualität (last_opened_at) bumpen
    const n = new URLSearchParams(searchParams); n.set('doc', id); setSearchParams(n, { replace: true })
    setEditorOpen(true); setSidebarOpen(false)
  }
  function openNewDoc() {
    setEditorOpen(true); setSidebarOpen(false)
    editorRef.current?.newDocument?.()
    const n = new URLSearchParams(searchParams); n.delete('doc'); setSearchParams(n, { replace: true })
  }
  async function addExistingDoc(docId) {
    if (!docId || !activeChatId) return
    await addDocumentToChat(docId, activeChatId)
    await loadChatDocs(activeChatId)
    selectDoc(docId)
  }

  // ─── Bilder eines Chats laden (für VisualRail) ────────────────────────────
  async function loadChatVisuals(chatId) {
    const id = chatId || activeChatId
    if (!id) { setChatVisuals([]); return [] }
    const { data } = await listVisualsForChat(id)
    const list = data || []
    // Signierte Thumbnail-URLs ergänzen
    const withUrls = await Promise.all(list.map(async (v) => ({ ...v, signed_url: await signedVisualUrl(v.storage_path, 3600) })))
    setChatVisuals(withUrls)
    return withUrls
  }
  useEffect(() => { loadChatVisuals(activeChatId) /* eslint-disable-next-line */ }, [activeChatId])

  // Letztes Bild im Chat (für Folge-Edit-Logik) — chatVisuals ist nach Aktualität sortiert.
  function lastChatVisual() { return chatVisuals && chatVisuals.length ? chatVisuals[0] : null }

  // Aus einem Bild ein neues Design erstellen (Bild = Seite 1). Bilder bleiben Bilder
  // (in den Medien); erst beim "In Design einfügen" entsteht ein mehrseitiges Design.
  async function createDesignFromImage(v) {
    try {
      const dataUrl = await visualDataUrl(v.storage_path)
      if (!dataUrl) return null
      const dims = await new Promise(res => {
        const im = new Image()
        im.onload = () => res({ w: im.naturalWidth || 1080, h: im.naturalHeight || 1080 })
        im.onerror = () => res({ w: 1080, h: 1080 })
        im.src = dataUrl
      })
      const rid = () => Math.random().toString(36).slice(2, 10)
      const pid = 'o' + rid()
      const page = {
        id: 'p' + rid(),
        objects: [{ id: pid, type: 'image', __primary: true, src: dataUrl, x: 0, y: 0, width: dims.w, height: dims.h, rotation: 0, opacity: 1 }],
        filters: {}, baseCrop: null, bgColor: '#ffffff', stage: { width: dims.w, height: dims.h }, primaryImageId: pid,
      }
      const design_json = { version: 2, pages: [page], activePageIndex: 0 }
      let userId = null
      try { const { data } = await supabase.auth.getUser(); userId = data?.user?.id || null } catch (_e) {}
      const { data: row, error } = await supabase.from('visuals').insert({
        user_id: userId, team_id: activeTeamId, brand_voice_id: activeBrandVoice?.id || v.brand_voice_id || null,
        kind: 'design', media_type: 'image', title: v.title || 'Design', aspect_ratio: v.aspect_ratio || '1:1',
        prompt: v.prompt || 'Design', storage_path: v.storage_path, design_json,
      }).select().single()
      if (error) return null
      return row
    } catch (_e) { return null }
  }

  // Designer öffnen. Ein Bild wird zuerst in ein neues Design verpackt; ein Design
  // wird direkt geöffnet.
  async function openVisualInDesigner(visualOrId, { assignToChat = true } = {}) {
    let v = visualOrId
    if (typeof visualOrId === 'string') { const { data } = await getVisual(visualOrId); v = data }
    if (!v) return
    let design = v
    if (v.kind !== 'design') {
      design = await createDesignFromImage(v)
      if (!design) { setError('Design konnte nicht erstellt werden.'); return }
    }
    if (assignToChat && activeChatId) { try { await linkVisualToChat(design.id, activeChatId) } catch (_e) {} ; loadChatVisuals(activeChatId) }
    setActiveVisual(design)
    setSplitMode('design')
    setSidebarOpen(false)
    if (!editorOpen) { setEditorOpen(true); setPaneView('split') }
  }

  // Leeres Design anlegen + öffnen (für "Neues Design" in der Rail).
  async function createEmptyDesign() {
    try {
      const rid = () => Math.random().toString(36).slice(2, 10)
      const page = { id: 'p' + rid(), objects: [], filters: {}, baseCrop: null, bgColor: '#ffffff', stage: { width: 1080, height: 1080 }, primaryImageId: null }
      const design_json = { version: 2, pages: [page], activePageIndex: 0 }
      let userId = null
      try { const { data } = await supabase.auth.getUser(); userId = data?.user?.id || null } catch (_e) {}
      // Platzhalter-Render (1x1 weiß) als storage_path (NOT NULL) — wird beim Speichern ersetzt.
      const blob = await (await fetch('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')).blob()
      const up = await uploadImageBlob(activeTeamId, blob)
      if (up.error || !up.path) { setError('Design konnte nicht erstellt werden.'); return }
      const { data: row, error } = await supabase.from('visuals').insert({
        user_id: userId, team_id: activeTeamId, brand_voice_id: activeBrandVoice?.id || null,
        kind: 'design', media_type: 'image', title: 'Neues Design', aspect_ratio: '1:1',
        prompt: 'Design', storage_path: up.path, design_json,
      }).select().single()
      if (error || !row) { setError('Design konnte nicht erstellt werden.'); return }
      if (activeChatId) { try { await linkVisualToChat(row.id, activeChatId) } catch (_e) {} ; loadChatVisuals(activeChatId) }
      setActiveVisual(row); setSplitMode('design'); setSidebarOpen(false)
      if (!editorOpen) { setEditorOpen(true); setPaneView('split') }
    } catch (_e) { setError('Design konnte nicht erstellt werden.') }
  }

  // ─── "Öffnen"-Picker (leeres Dokument/Design): Element wählen → Chat wählen ──
  async function startOpenPicker(type) {
    setOpenPicker({ type }); setPickerStep('item'); setPickerItem(null)
    setPickerChats([]); setPickerShowOther(false); setPickerBrandChats([]); setPickerSearch('')
    setPickerItems([]); setPickerLoading(true)
    try {
      if (type === 'design') {
        const { data } = await listTeamVisuals({ teamId: activeTeamId, brandVoiceId: activeBrandVoice?.id, kind: 'design', limit: 100 })
        const withUrls = await Promise.all((data || []).map(async (v) => ({ ...v, signed_url: await signedVisualUrl(v.storage_path, 3600) })))
        setPickerItems(withUrls)
      } else {
        const { data } = await listDocuments(activeTeamId, activeBrandVoice?.id)
        setPickerItems(data || [])
      }
    } catch (_e) { setPickerItems([]) }
    finally { setPickerLoading(false) }
  }
  async function pickerSelectItem(item) {
    setPickerItem(item); setPickerStep('chat'); setPickerShowOther(false); setPickerSearch(''); setPickerLoading(true)
    try {
      const { data } = openPicker?.type === 'design' ? await listChatsForVisual(item.id) : await listChatsForDocument(item.id)
      setPickerChats(data || [])
    } catch (_e) { setPickerChats([]) }
    finally { setPickerLoading(false) }
  }
  async function pickerOpenWith(chatId) {
    if (!pickerItem || !openPicker) return
    const isDesign = openPicker.type === 'design'
    try {
      if (isDesign) await linkVisualToChat(pickerItem.id, chatId)
      else await addDocumentToChat(pickerItem.id, chatId)
    } catch (_e) {}
    const key = isDesign ? 'visual' : 'doc'
    setOpenPicker(null)
    navigate(`/content-studio?chat_id=${chatId}&${key}=${pickerItem.id}`)
  }
  function pickerOpenWithout() {
    if (!pickerItem || !openPicker) return
    const key = openPicker.type === 'design' ? 'visual' : 'doc'
    setOpenPicker(null)
    navigate(`/content-studio?${key}=${pickerItem.id}`)
  }
  async function pickerLoadBrandChats() {
    setPickerShowOther(true)
    const { data } = await supabase.from('content_chats')
      .select('id, title, updated_at').eq('brand_voice_id', activeBrandVoice?.id)
      .order('updated_at', { ascending: false }).limit(100)
    setPickerBrandChats(data || [])
  }

  // ?visual=<id> aus URL (z.B. aus der Galerie): Bild laden + Designer öffnen.
  useEffect(() => {
    if (!visualParam || visualParamHandledRef.current) return
    visualParamHandledRef.current = true
    ;(async () => {
      const { data: v } = await getVisual(visualParam)
      if (!v) return
      // Param entfernen, damit Reload nicht erneut triggert
      const n = new URLSearchParams(window.location.search); n.delete('visual'); setSearchParams(n, { replace: true })
      // Falls noch kein Chat aktiv → in den aktiven (oder ohne) Chat hängen, sobald vorhanden
      await openVisualInDesigner(v, { assignToChat: !!activeChatId })
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualParam, activeChatId])

  async function openChat(chatId) {
    setActiveChatId(chatId)
    setNewDocActive(false); setPendingDocText(null)
    setMessages([]); setMessagesLoading(true)
    const { data: c } = await supabase.from('content_chats').select('*').eq('id', chatId).maybeSingle()
    setActiveChat(c)
    setSelectedAudienceId(c?.strike2_persona_id ? 's2:' + c.strike2_persona_id : (c?.target_audience_id || ''))
    setSelectedCompanyVoiceIds(c?.company_voice_ids || (c?.company_voice_id ? [c.company_voice_id] : []))
    if (c?.post_id) {
      const { data: p } = await supabase.from('content_posts').select('id, title').eq('id', c.post_id).maybeSingle()
      setLinkedPost(p || null)
    } else {
      setLinkedPost(null)
    }
    const { data: msgs } = await supabase.from('content_chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending:true })
    setMessages(msgs || [])
    setMessagesLoading(false)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
  }

  function newChat() {
    setActiveChatId(null); setActiveChat(null); setMessages([])
    setInput(''); setAttachments([]); setSelectedKnowledgeIds([])
    setLinkedPost(null); setError('')
    const next = new URLSearchParams(searchParams)
    next.delete('chat_id'); next.delete('post_id')
    setSearchParams(next, { replace:true })
  }

  // ─── Senden ───────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || sending) return
    if (!activeBrandVoice?.id) { setError('Keine aktive Brand Voice'); return }
    setSending(true); setError('')
    const userMsgText = input.trim()
    const wasClean = viewMode === 'clean'

    // Wenn Sidebar zu war und wir im Clean-Modus senden → aufklappen
    if (wasClean && !sidebarOpen && !editorOpen) setSidebarOpen(true)

    // Chat im Frontend anlegen wenn neu
    let chatIdForSend = activeChatId
    if (!chatIdForSend) {
      const { data: newChat, error: chatErr } = await supabase.from('content_chats').insert({
        brand_voice_id: activeBrandVoice.id,
        team_id: activeTeamId,
        created_by: session.user.id,
        ...splitAudienceRef(selectedAudienceId),
        company_voice_id: selectedCompanyVoiceIds[0] || null, company_voice_ids: selectedCompanyVoiceIds,
        post_id: linkedPost?.id || activeChat?.post_id || null,
        title: 'Neuer Chat', // Platzhalter — Edge-Function generiert nach 1. Antwort einen intelligenten Titel
      }).select().single()
      if (chatErr) {
        setError('Chat-Erstellung fehlgeschlagen: ' + chatErr.message)
        setSending(false); return
      }
      chatIdForSend = newChat.id
      // Offenes Dokument an den neuen Chat binden (vor State-Update → Reconciliation findet es)
      const openDocId = new URLSearchParams(window.location.search).get('doc')
      if (openDocId) { try { await addDocumentToChat(openDocId, newChat.id) } catch (_e) {} }
      setActiveChatId(newChat.id)
      setActiveChat(newChat)
      setChats(prev => [newChat, ...prev])
      if (newChat.post_id) {
        await supabase.from('content_posts').update({ text_werkstatt_chat_id: newChat.id })
          .eq('id', newChat.post_id).is('text_werkstatt_chat_id', null)
      }
      const next = new URLSearchParams(searchParams)
      next.set('chat_id', newChat.id); next.delete('post_id')
      setSearchParams(next, { replace:true })
    }

    // User-Bubble optimistisch
    const tempUser = { id:'temp-' + Date.now(), role:'user', content:userMsgText, metadata:{}, created_at:new Date().toISOString() }
    setMessages(prev => [...prev, tempUser])
    setInput('')
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }), 30)

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('text-werkstatt-chat', {
        body: {
          chat_id: chatIdForSend,
          brand_voice_id: activeBrandVoice.id,
          post_id: linkedPost?.id || activeChat?.post_id || undefined,
          target_audience_id: splitAudienceRef(selectedAudienceId).target_audience_id || undefined,
          strike2_persona_id: splitAudienceRef(selectedAudienceId).strike2_persona_id || undefined,
          company_voice_id: selectedCompanyVoiceIds[0] || null, company_voice_ids: selectedCompanyVoiceIds,
          user_message: userMsgText,
          knowledge_resource_ids: selectedKnowledgeIds,
          use_web_search: useWebSearch,
          document_context: (useEditorContext && editorOpen) ? (editorRef.current?.getText?.() || undefined) : undefined,
          attachments,
        },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)

      const { data: msgs } = await supabase.from('content_chat_messages')
        .select('*').eq('chat_id', data.chat_id).order('created_at', { ascending:true })
      setMessages(msgs || [])
      loadChats()
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
    } catch (e) {
      setError('Fehler: ' + (e?.message || String(e)))
    } finally {
      setSending(false)
    }
  }

  // ─── In-Chat-Bildgenerierung ──────────────────────────────────────────────
  async function sendVisualMessage() {
    if (!input.trim() || sending) return
    if (!activeBrandVoice?.id) { setError('Keine aktive Brand Voice'); return }
    setSending(true); setError('')
    const prompt = input.trim()
    const wasClean = viewMode === 'clean'
    if (wasClean && !sidebarOpen && !editorOpen) setSidebarOpen(true)

    // Chat anlegen wenn neu (gleiche Logik wie sendMessage)
    let chatIdForSend = activeChatId
    if (!chatIdForSend) {
      const { data: nc, error: chatErr } = await supabase.from('content_chats').insert({
        brand_voice_id: activeBrandVoice.id,
        team_id: activeTeamId,
        created_by: session.user.id,
        ...splitAudienceRef(selectedAudienceId),
        company_voice_id: selectedCompanyVoiceIds[0] || null, company_voice_ids: selectedCompanyVoiceIds,
        post_id: linkedPost?.id || activeChat?.post_id || null,
        title: 'Neuer Chat',
      }).select().single()
      if (chatErr) { setError('Chat-Erstellung fehlgeschlagen: ' + chatErr.message); setSending(false); return }
      chatIdForSend = nc.id
      setActiveChatId(nc.id); setActiveChat(nc); setChats(prev => [nc, ...prev])
      const next = new URLSearchParams(searchParams); next.set('chat_id', nc.id); next.delete('post_id'); setSearchParams(next, { replace:true })
    }

    // User-Nachricht speichern + optimistisch anzeigen
    const tempUser = { id:'temp-' + Date.now(), role:'user', content:prompt, metadata:{}, created_at:new Date().toISOString() }
    setMessages(prev => [...prev, tempUser])
    setInput('')
    try { await supabase.from('content_chat_messages').insert({ chat_id: chatIdForSend, role:'user', content: prompt, metadata: { type:'image_request' } }) } catch (_e) {}
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }), 30)

    // Folge-Edit-Logik: letztes Bild im Chat als Referenz, außer „Neues Bild" aktiv
    const prevVisual = !forceNewImage ? lastChatVisual() : null
    const { model, quality } = splitModelValue(imageModel)
    // Mit Redaktionsplan-Beitrag verknüpft → Beitragstext als Bild-Kontext mitgeben
    // (nur Erstgenerierung, nicht bei iterativen Edits auf ein bestehendes Bild).
    let promptForGen = prompt
    if (!prevVisual && linkedPost?.content && linkedPost.content.trim()) {
      promptForGen = `Erstelle ein Bild, das visuell zu diesem LinkedIn-Beitrag passt.\nBeitrag-Titel: "${linkedPost.title || ''}"\nBeitrag-Text:\n${linkedPost.content.trim()}\n\nKonkreter Bildwunsch: ${prompt}`
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-image', {
        body: {
          prompt: promptForGen,
          model, quality,
          aspectRatio: prevVisual?.aspect_ratio || imageAspect,
          variants: 1,
          brandVoiceId: activeBrandVoice?.id || null,
          companyVoiceIds: selectedCompanyVoiceIds,
          parentVisualId: prevVisual?.id || undefined,
          referenceImagePaths: prevVisual?.storage_path ? [prevVisual.storage_path] : [],
        },
      })
      if (fnErr) throw new Error(fnErr.message || 'Bildgenerierung fehlgeschlagen')
      if (data?.error) throw new Error(data.error)
      const visual = (data?.visuals || [])[0]
      if (!visual) throw new Error('Kein Bild erhalten')

      // Bild dem Chat zuordnen
      await linkVisualToChat(visual.id, chatIdForSend)
      // Assistant-Bild-Nachricht persistieren (content = JSON-Marker, metadata = strukturiert)
      const imgMeta = { type:'image', visual_id: visual.id, storage_path: visual.storage_path, prompt, edited: !!prevVisual }
      const markerContent = JSON.stringify(imgMeta)
      try {
        await supabase.from('content_chat_messages').insert({ chat_id: chatIdForSend, role:'assistant', content: markerContent, metadata: imgMeta })
      } catch (_e) {}
      if (data?.notice) setError(data.notice)

      // Verlauf frisch laden (zeigt User-Frage + Bild-Antwort)
      const { data: msgs } = await supabase.from('content_chat_messages').select('*').eq('chat_id', chatIdForSend).order('created_at', { ascending:true })
      setMessages(msgs || [])
      setForceNewImage(false)
      await loadChatVisuals(chatIdForSend)
      loadChats()
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }), 60)
    } catch (e) {
      setError('Bild-Fehler: ' + (e?.message || String(e)))
    } finally {
      setSending(false)
    }
  }

  // Einheitlicher Senden-Dispatcher: im Visual-Modus → Bild, sonst → Text.
  function handleSend() { return visualMode ? sendVisualMessage() : sendMessage() }

  // Bild herunterladen (Blob → kein Cross-Origin-Problem)
  async function downloadVisual(storagePath, id) {
    try {
      const blob = await downloadVisualBlob(storagePath)
      if (!blob) { setError('Download fehlgeschlagen'); return }
      const ext = (storagePath.split('.').pop() || 'png').toLowerCase()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `leadesk-visual-${id || 'bild'}.${ext}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (e) { setError('Download-Fehler: ' + (e?.message || '')) }
  }

  // Bestehende Beiträge der aktiven Brand laden (für „zu bestehendem Beitrag")
  async function loadExistingPosts() {
    if (!activeBrandVoice?.id) return []
    const { data } = await supabase.from('content_posts')
      .select('id, title, status, updated_at')
      .eq('brand_voice_id', activeBrandVoice.id)
      .order('updated_at', { ascending: false }).limit(50)
    return data || []
  }

  // ─── Beitragstext → Beitrag attachen ──────────────────────────────────────
  async function attachToPost(beitragstext, postId) {
    const forceNew = postId === '__new__'
    const targetId = forceNew ? null : (postId || linkedPost?.id || activeChat?.post_id)
    if (!targetId) {
      if (!activeBrandVoice?.id) { alert('Keine aktive Brand Voice'); return }
      if (!activeTeamId) { alert('Kein Team aktiv'); return }
      const title = beitragstext.split('\n')[0].slice(0, 80) || 'Neuer Beitrag'
      const { data: post, error } = await supabase.from('content_posts').insert({
        user_id: session.user.id, team_id: activeTeamId,
        brand_voice_id: activeBrandVoice.id, title, content: beitragstext,
        platform: 'linkedin', status: 'draft',
        text_werkstatt_chat_id: activeChatId,
      }).select().single()
      if (error) { alert('Erstellen fehlgeschlagen: ' + error.message); return }
      await supabase.from('content_chats').update({ post_id: post.id }).eq('id', activeChatId)
      navigate('/redaktionsplan?open=' + post.id)
      return
    }
    await supabase.from('content_posts').update({
      content: beitragstext, text_werkstatt_chat_id: activeChatId,
    }).eq('id', targetId)
    if (!activeChat?.post_id) {
      await supabase.from('content_chats').update({ post_id: targetId }).eq('id', activeChatId)
    }
    navigate('/redaktionsplan?open=' + targetId)
  }

  // ─── Bild → Beitrag zuordnen (bestehend oder neu) ─────────────────────────
  // Hängt das Bild als Visual an einen Beitrag (visuals.post_id). Bei fehlender
  // visual_id (Alt-Nachrichten) wird ein Visual-Datensatz aus dem storage_path angelegt.
  async function attachImageToPost(meta, postId) {
    try {
      let userId = null
      try { const { data } = await supabase.auth.getUser(); userId = data?.user?.id || null } catch (_e) {}
      let pid = postId
      if (postId === '__new__') {
        if (!activeBrandVoice?.id || !activeTeamId) { setError('Keine aktive Brand Voice / Team'); return false }
        const title = (meta.prompt || 'Bild').split('\n')[0].slice(0, 80) || 'Neuer Beitrag'
        const { data: post, error } = await supabase.from('content_posts').insert({
          user_id: userId, team_id: activeTeamId, brand_voice_id: activeBrandVoice.id,
          title, content: '', platform: 'linkedin', status: 'draft',
        }).select().single()
        if (error || !post) { setError('Beitrag konnte nicht erstellt werden'); return false }
        pid = post.id
      }
      if (meta.visual_id) {
        const { error } = await supabase.from('visuals').update({ post_id: pid }).eq('id', meta.visual_id)
        if (error) { setError('Zuordnung fehlgeschlagen: ' + error.message); return false }
      } else {
        const { error } = await supabase.from('visuals').insert({
          user_id: userId, team_id: activeTeamId, brand_voice_id: activeBrandVoice?.id || null,
          kind: 'image', media_type: 'image', title: (meta.prompt || 'Bild').slice(0, 120),
          aspect_ratio: '1:1', prompt: meta.prompt || 'Bild', storage_path: meta.storage_path, post_id: pid,
        })
        if (error) { setError('Zuordnung fehlgeschlagen: ' + error.message); return false }
      }
      return true
    } catch (_e) { setError('Zuordnung fehlgeschlagen'); return false }
  }

  // ─── Datei-Handling ───────────────────────────────────────────────────────
  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    const out = []
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { alert(f.name + ': max 10 MB'); continue }
      const buf = await f.arrayBuffer()
      let bin = ''
      const arr = new Uint8Array(buf)
      for (let i = 0; i < arr.byteLength; i++) bin += String.fromCharCode(arr[i])
      const base64 = btoa(bin)
      out.push({ name:f.name, type:f.type, size:f.size, base64 })
    }
    setAttachments(prev => [...prev, ...out])
    setPlusOpen(false)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div ref={csRootRef} style={{ display:'flex', position:'relative', height:'100%', minHeight:0, overflow:'hidden', background:'var(--page-bg, #F7F8FA)' }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside style={{ width:264, borderRight:'1px solid var(--border,#E9ECF2)', background:'var(--page-bg, #F7F8FA)', display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'14px 12px 10px', display:'flex', gap:8 }}>
            <button onClick={() => setSidebarOpen(false)} title="Sidebar einklappen"
              style={{ width:36, height:36, display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:9, border:'1px solid var(--border)', background:'var(--surface,#fff)', fontSize:14, cursor:'pointer', color:'var(--text-muted,#667085)' }}>☰</button>
            <button onClick={newChat}
              style={{ flex:1, height:36, padding:'0 12px', borderRadius:9, border:'none', background:P, color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <Pencil size={13} strokeWidth={2}/>Neuer Chat
            </button>
          </div>
          <div style={{ padding:'8px 16px 6px', fontSize:10.5, fontWeight:700, color:'var(--text-soft,#98a2b3)', textTransform:'uppercase', letterSpacing:'0.07em', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {activeBrandVoice?.name || 'Chats'}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'2px 10px 12px' }}>
            {chatsLoading && <div style={{ padding:'12px 8px', fontSize:12, color:'var(--text-muted)' }}>Lade…</div>}
            {!chatsLoading && chats.length === 0 && <div style={{ padding:'14px 8px', fontSize:12, color:'var(--text-muted)', lineHeight:1.5 }}>Noch keine Chats für diese Brand Voice.</div>}
            {chats.map(c => {
              const active = c.id === activeChatId
              return (
                <button key={c.id} onClick={() => { const n = new URLSearchParams(searchParams); n.set('chat_id', c.id); n.delete('post_id'); setSearchParams(n) }}
                  style={{
                    width:'100%', textAlign:'left', padding:'9px 11px', borderRadius:9, border:'none', cursor:'pointer', marginBottom:3,
                    background: active ? 'var(--surface,#fff)' : 'transparent',
                    boxShadow: active ? '0 1px 2px rgba(16,24,40,0.06)' : 'none',
                    color: active ? 'var(--text-primary,#101828)' : 'var(--text-muted,#475467)',
                    fontSize:12.5, lineHeight:1.4, fontWeight: active ? 700 : 500, fontFamily:'inherit',
                    display:'flex', alignItems:'center', gap:7, overflow:'hidden',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(16,24,40,0.04)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  title={c.title}>
                  {c.post_id && <Pin size={11} strokeWidth={1.75} style={{ flexShrink:0, color:P }}/>}
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.title}</span>
                </button>
              )
            })}
          </div>
        </aside>
      )}

      {/* Main */}
      <main style={{
          flexGrow: (editorOpen && (paneView === 'suite' || paneView === 'page')) ? 0 : 1,
          flexShrink: 1,
          flexBasis: !editorOpen ? '100%' : ((paneView === 'suite' || paneView === 'page') ? '0%' : '48%'),
          display: (editorOpen && (paneView === 'suite' || paneView === 'page')) ? 'none' : 'flex',
          minWidth:0, overflow:'hidden',
          opacity: (editorOpen && (paneView === 'suite' || paneView === 'page')) ? 0 : 1,
          pointerEvents: (editorOpen && (paneView === 'suite' || paneView === 'page')) ? 'none' : 'auto',
          flexDirection:'column', position:'relative',
          transition:'opacity 0.2s ease' }}>
        {/* Floating Sidebar-Toggle wenn zu */}
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} title="Sidebar öffnen"
            style={{ position:'absolute', top:14, left:14, zIndex:10, padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', fontSize:14, cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
            ☰
          </button>
        )}

        {viewMode === 'clean' ? (
          // === CLEAN VIEW ===
          <CleanView
            linkedPost={linkedPost}
            activeBrandVoice={activeBrandVoice}
            input={input} setInput={setInput}
            sending={sending}
            attachments={attachments} setAttachments={setAttachments}
            plusOpen={plusOpen} setPlusOpen={setPlusOpen}
            knowledgeBase={knowledgeBase}
            selectedKnowledgeIds={selectedKnowledgeIds} setSelectedKnowledgeIds={setSelectedKnowledgeIds}
            audiences={audiences} selectedAudienceId={selectedAudienceId} setSelectedAudienceId={setSelectedAudienceId}
            companyVoices={(brandVoices||[]).filter(v => v.account_type === 'company_page')}
            showCompanyPicker={activeBrandVoice?.account_type !== 'company_page'}
            selectedCompanyVoiceIds={selectedCompanyVoiceIds} setSelectedCompanyVoiceIds={setSelectedCompanyVoiceIds}
            useWebSearch={useWebSearch} setUseWebSearch={setUseWebSearch} editorOpen={editorOpen} useEditorContext={useEditorContext} setUseEditorContext={setUseEditorContext}
            visualMode={visualMode} setVisualMode={setVisualMode}
            imageModel={imageModel} setImageModel={setImageModel}
            imageAspect={imageAspect} setImageAspect={setImageAspect}
            forceNewImage={forceNewImage} setForceNewImage={setForceNewImage}
            hasChatVisuals={chatVisuals.length > 0}
            handleFiles={handleFiles}
            fileInputRef={fileInputRef}
            sendMessage={handleSend}
            navigate={navigate}
          />
        ) : (
          // === CHAT VIEW ===
          <ChatView
            linkedPost={linkedPost}
            messages={messages}
            messagesLoading={messagesLoading}
            sending={sending}
            messagesEndRef={messagesEndRef}
            attachToPost={attachToPost}
            loadExistingPosts={loadExistingPosts}
            onInsertToDoc={(text, mode) => {
              setSidebarOpen(false); setEditorOpen(true); setSplitMode('doc'); setPaneView('split')
              // Editor schon gemountet (Doc offen) → direkt schreiben.
              if (editorRef.current) {
                if (mode === 'append') editorRef.current.insertText?.(text)
                else editorRef.current.loadNewDocWithText?.(text)
                return
              }
              // Kein Dokument offen → Editor leer mounten und Text nach Mount laden.
              setPendingDocText(text); setNewDocActive(true)
            }}
            onOpenInDesigner={(meta) => openVisualInDesigner(meta.visual_id || { storage_path: meta.storage_path, prompt: meta.prompt, aspect_ratio: meta.aspect_ratio, kind: 'image' }, { assignToChat: !!activeChatId })}
            onDownloadVisual={(meta) => downloadVisual(meta.storage_path, meta.visual_id)}
            onImageToPost={attachImageToPost}
            signedVisualUrlFn={signedVisualUrl}
            hasOpenDoc={editorOpen && !!docParam}
            input={input} setInput={setInput}
            attachments={attachments} setAttachments={setAttachments}
            plusOpen={plusOpen} setPlusOpen={setPlusOpen}
            knowledgeBase={knowledgeBase}
            selectedKnowledgeIds={selectedKnowledgeIds} setSelectedKnowledgeIds={setSelectedKnowledgeIds}
            audiences={audiences} selectedAudienceId={selectedAudienceId} setSelectedAudienceId={setSelectedAudienceId}
            companyVoices={(brandVoices||[]).filter(v => v.account_type === 'company_page')}
            showCompanyPicker={activeBrandVoice?.account_type !== 'company_page'}
            selectedCompanyVoiceIds={selectedCompanyVoiceIds} setSelectedCompanyVoiceIds={setSelectedCompanyVoiceIds}
            useWebSearch={useWebSearch} setUseWebSearch={setUseWebSearch} editorOpen={editorOpen} useEditorContext={useEditorContext} setUseEditorContext={setUseEditorContext}
            visualMode={visualMode} setVisualMode={setVisualMode}
            imageModel={imageModel} setImageModel={setImageModel}
            imageAspect={imageAspect} setImageAspect={setImageAspect}
            forceNewImage={forceNewImage} setForceNewImage={setForceNewImage}
            hasChatVisuals={chatVisuals.length > 0}
            handleFiles={handleFiles}
            fileInputRef={fileInputRef}
            sendMessage={handleSend}
            navigate={navigate}
            error={error}
          />
        )}

        {/* Globaler hidden file input — wird vom Plus-Menü getriggert */}
        <input ref={fileInputRef} type="file" multiple style={{ display:'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}/>
      </main>

      {/* RECHTS: Suite (Dokument-Editor ⇄ Designer) — animiert via flex-basis */}
      {(() => {
        const page = editorOpen && paneView === 'page'
        const basis = !editorOpen ? '0%' : ((paneView === 'suite' || page) ? '100%' : '52%')
        return (
      <section data-tour-id="cs-doc-pane" style={{ display:'flex', flexDirection:'column', flexGrow:0, flexShrink:1, flexBasis: basis, minWidth:0, overflow:'hidden',
        ...(page
          ? { position:'fixed', inset:0, zIndex:1000, margin:0, border:'none', borderRadius:0, boxShadow:'none', background:'var(--surface,#fff)' }
          : { marginTop: editorOpen ? 16 : 0, marginBottom: editorOpen ? 16 : 0,
              border: editorOpen ? '1px solid var(--border,#E9ECF2)' : 'none', borderRight: 'none',
              borderRadius: editorOpen ? '16px 0 0 16px' : 0,
              boxShadow: editorOpen ? '-5px 0 13px rgba(16,24,40,0.07), 0 0 12px rgba(16,24,40,0.05)' : 'none',
              background: editorOpen ? 'var(--surface,#fff)' : 'var(--page-bg, #F7F8FA)' }) }}>
        <div style={{ display:'flex', flex:1, minHeight:0 }}>
          {splitMode === 'design' ? (
            <>
              <div style={{ flex:1, minWidth:0, height:'100%' }}>
                {!activeVisual ? (
                  <EmptyOpenPane type="design" onOpen={() => startOpenPicker('design')} onNew={() => createEmptyDesign()} />
                ) : (
                <DesignerPane
                  visual={activeVisual}
                  teamId={activeTeamId}
                  onSaved={(uv) => { setActiveVisual(uv); loadChatVisuals(activeChatId) }}
                  onReplaceVisual={(nv) => openVisualInDesigner(nv, { assignToChat: !!activeChatId })}
                  onPagesToPost={async (created) => {
                    const postId = linkedPost?.id || activeChat?.post_id || null
                    for (const v of (created || [])) {
                      try { if (activeChatId) await linkVisualToChat(v.id, activeChatId) } catch (_e) {}
                      try { if (postId) await supabase.from('visuals').update({ post_id: postId }).eq('id', v.id) } catch (_e) {}
                    }
                    loadChatVisuals(activeChatId)
                  }}
                />
                )}
              </div>
              {activeChatId && (
                <VisualRail visuals={chatVisuals.filter(v => v.kind === 'design')} activeVisualId={activeVisual?.id}
                  onSelect={(v) => openVisualInDesigner(v, { assignToChat:false })}
                  onNew={() => createEmptyDesign()} />
              )}
            </>
          ) : (
            <>
              <div style={{ flex:1, minWidth:0, height:'100%' }}>
                {!docParam && !demoRailDocs && !newDocActive ? (
                  <EmptyOpenPane type="doc" onOpen={() => startOpenPicker('doc')} onNew={openNewDoc} />
                ) : (
                <DocumentEditorPane
                  ref={editorRef}
                  docId={docParam}
                  initialText={(!docParam && newDocActive) ? pendingDocText : null}
                  onInitialConsumed={() => setPendingDocText(null)}
                  editorOpen={editorOpen && splitMode === 'doc'}
                  teamId={activeTeamId}
                  brandVoiceId={activeBrandVoice?.id}
                  brandVoiceName={activeBrandVoice?.name}
                  audienceId={selectedAudienceId}
                  companyVoiceIds={selectedCompanyVoiceIds}
                  sourceChatId={activeChatId}
                  onAttachToPost={(text) => attachToPost(text, linkedPost?.id || activeChat?.post_id)}
                  onDocCreated={(id) => {
                    const n = new URLSearchParams(searchParams)
                    if (id) n.set('doc', id); else n.delete('doc')
                    setSearchParams(n, { replace: true })
                    loadChatDocs(activeChatId)
                  }}
                  onNewDocument={openNewDoc}
                  onClose={() => setEditorOpen(false)}
                />
                )}
              </div>
              {(demoRailDocs || (activeChatId && chatDocs.length > 0)) && (
                <DocTabsRail docs={demoRailDocs || chatDocs} activeDocId={demoRailDocs ? 'tour-doc-1' : docParam} chatId={activeChatId} teamId={activeTeamId} brandVoiceId={activeBrandVoice?.id} onSelect={demoRailDocs ? () => {} : selectDoc} onNew={demoRailDocs ? () => {} : openNewDoc} onAddExisting={demoRailDocs ? () => {} : addExistingDoc} />
              )}
            </>
          )}
        </div>
      </section>
      )})()}

      {/* Splitscreen-Steuerung: feste Zustände (Split / Vollbild / Seiten-Vollbild)
          per Buttons + einheitlicher Dokument/Designer-Switcher (oben, anliegend). */}
      {(() => {
        const suite = editorOpen && paneView === 'suite'
        const page  = editorOpen && paneView === 'page'
        const openTo = (mode) => {
          if (mode) setSplitMode(mode)
          if (!editorOpenRef.current) { setEditorOpen(true); setPaneView('split'); setSidebarOpen(false) }
          const m = mode || splitMode
          if (m === 'doc' && !docParam && activeChatId && chatDocs.length) {
            const last = chatDocs[0]
            if (last) { const n = new URLSearchParams(searchParams); n.set('doc', last.id); setSearchParams(n, { replace: true }) }
          }
        }
        const swBtn = (active) => ({ width:46, height:50, display:'inline-flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer',
          background: active ? 'rgba(49,90,231,0.08)' : 'transparent', color: active ? 'var(--wl-primary, rgb(49,90,231))' : 'var(--text-secondary,#475569)' })
        const swCard = { display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--surface,#fff)',
          border:'1px solid var(--border,#E9ECF2)', borderRight:'none', borderRadius:'10px 0 0 10px', boxShadow:'-2px 0 8px rgba(16,24,40,0.08)' }
        const Switcher = ({ rounded } = {}) => (
          <div style={{ ...swCard, ...(rounded ? { borderRight:'1px solid var(--border,#E9ECF2)', borderRadius:10 } : {}) }}>
            <button onClick={() => openTo('doc')} title="Dokument" style={swBtn(splitMode === 'doc')}><FileText size={18} strokeWidth={1.9}/></button>
            <div style={{ height:1, background:'var(--border,#E9ECF2)' }}/>
            <button onClick={() => openTo('design')} title="Designer" style={swBtn(splitMode === 'design')}><Brush size={18} strokeWidth={1.9}/></button>
          </div>
        )
        const ctrlBtn = { width:42, height:42, display:'inline-flex', alignItems:'center', justifyContent:'center', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary,#475569)' }
        const scriptHint = { fontFamily:"'Segoe Script','Bradley Hand','Brush Script MT','Comic Sans MS',cursive", fontStyle:'italic', fontSize:16, fontWeight:600, color:'var(--wl-primary, rgb(49,90,231))', whiteSpace:'nowrap', lineHeight:1 }
        const CurvedArrow = () => (
          <svg width="34" height="24" viewBox="0 0 34 24" fill="none" style={{ color:'var(--wl-primary, rgb(49,90,231))', flexShrink:0 }} aria-hidden="true">
            <path d="M3 5 C 14 3, 25 7, 30 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
            <path d="M23 14.5 L 31 15 L 27 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        )
        return (
          <>
            {/* SEITEN-VOLLBILD aktiv: schwebender Switcher + Verlassen-Button */}
            {page && (
              <>
                <div style={{ position:'fixed', top:16, left:16, zIndex:1001 }}><Switcher rounded/></div>
                <button onClick={() => setPaneView('split')} title="Seiten-Vollbild verlassen"
                  style={{ position:'fixed', top:16, right:16, zIndex:1001, width:40, height:40, display:'inline-flex', alignItems:'center', justifyContent:'center',
                    borderRadius:10, border:'1px solid var(--border,#E9ECF2)', background:'var(--surface,#fff)', cursor:'pointer', color:'var(--text-secondary,#475569)', boxShadow:'0 2px 10px rgba(16,24,40,0.12)' }}>
                  <Minimize2 size={18} strokeWidth={2}/>
                </button>
              </>
            )}
            {/* Eingeklappt: Pull-out-Kasten (Klick öffnet) + Labels + Switcher */}
            {!editorOpen && (
              <>
                <div onClick={() => openTo(null)} title="Splitscreen öffnen"
                  style={{ position:'absolute', top:0, bottom:0, right:-176, width:212, zIndex:49,
                    background:'var(--surface,#fff)', border:'1px solid var(--border,#E9ECF2)', borderRight:'none', borderRadius:'16px 0 0 16px',
                    boxShadow:'-6px 0 18px rgba(16,24,40,0.07)', cursor:'pointer', padding:0, display:'flex', alignItems:'center', justifyContent:'flex-start' }}>
                  <span style={{ width:4, height:42, marginLeft:13, borderRadius:3, background:'var(--border,#D7DCE5)' }}/>
                </div>
                <div style={{ position:'absolute', top:44, right:36, zIndex:50, display:'flex', alignItems:'flex-start', gap:10, pointerEvents:'none' }}>
                  <div style={{ display:'flex', flexDirection:'column' }}>
                    <div style={{ height:50, display:'flex', alignItems:'center', justifyContent:'flex-end', gap:7 }}><span style={scriptHint}>ins Dokument</span><CurvedArrow/></div>
                    <div style={{ height:1 }}/>
                    <div style={{ height:50, display:'flex', alignItems:'center', justifyContent:'flex-end', gap:7 }}><span style={scriptHint}>zum Designer</span><CurvedArrow/></div>
                  </div>
                  <div style={{ pointerEvents:'auto' }}><Switcher/></div>
                </div>
              </>
            )}
            {/* Ausgeklappt (Split/Vollbild): Switcher oben + Ansicht-Steuerung mittig */}
            {editorOpen && !page && (
              <>
                <div style={{ position:'absolute', zIndex:50, ...(suite ? { top:16, left:16 } : { top:44, right:'52%' }) }}>
                  <Switcher/>
                </div>
                <div style={{ position:'absolute', zIndex:50, display:'flex', flexDirection:'column', overflow:'hidden',
                    background:'var(--surface,#fff)', border:'1px solid var(--border,#E9ECF2)', borderRadius:10, boxShadow:'0 2px 10px rgba(16,24,40,0.10)',
                    ...(suite ? { top:16, right:16 } : { top:'50%', right:'52%', transform:'translate(50%,-50%)' }) }}>
                  {suite ? (
                    <button onClick={() => setPaneView('split')} title="Splitscreen" style={ctrlBtn}><ChevronRight size={18} strokeWidth={2}/></button>
                  ) : (
                    <button onClick={() => setPaneView('suite')} title="Vollbild" style={ctrlBtn}><ChevronLeft size={18} strokeWidth={2}/></button>
                  )}
                  <div style={{ height:1, background:'var(--border,#E9ECF2)' }}/>
                  <button onClick={() => setPaneView('page')} title="Seiten-Vollbild" style={ctrlBtn}><Maximize2 size={17} strokeWidth={2}/></button>
                  <div style={{ height:1, background:'var(--border,#E9ECF2)' }}/>
                  <button onClick={() => { setEditorOpen(false); setPaneView('split') }} title="Einklappen" style={ctrlBtn}><ChevronRight size={18} strokeWidth={2}/></button>
                </div>
              </>
            )}
          </>
        )
      })()}

      {/* "Öffnen"-Picker: zuerst Dokument/Design wählen, dann Chat (oder ohne) */}
      {openPicker && (
        <div onClick={() => setOpenPicker(null)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(2px)', zIndex:500, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'10vh' }}>
          <div onClick={e => e.stopPropagation()} style={{ width:520, maxWidth:'94vw', maxHeight:'78vh', display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(16,24,40,0.28)', overflow:'hidden', textAlign:'left' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, padding:'16px 16px 8px' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:800, color:'var(--text-primary)' }}>
                  {pickerStep === 'item'
                    ? (openPicker.type === 'design' ? 'Welches Design öffnen?' : 'Welches Dokument öffnen?')
                    : 'Mit welchem Chat öffnen?'}
                </div>
                {pickerStep === 'chat' && <div style={{ fontSize:12.5, color:'var(--text-muted)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pickerItem?.title || (openPicker.type === 'design' ? 'Design' : 'Dokument')}</div>}
              </div>
              <button onClick={() => setOpenPicker(null)} style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', padding:4, display:'inline-flex', flexShrink:0 }}><X size={18}/></button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px 14px 14px' }}>
              {pickerLoading ? (
                <div style={{ padding:18, fontSize:12.5, color:'var(--text-muted)', textAlign:'center' }}>Lädt…</div>
              ) : pickerStep === 'item' ? (
                pickerItems.length === 0 ? (
                  <div style={{ padding:'8px 4px 14px', fontSize:12.5, color:'var(--text-muted)', lineHeight:1.5 }}>
                    {openPicker.type === 'design' ? 'Noch keine Designs für diese Brand.' : 'Noch keine Dokumente für diese Brand.'}
                  </div>
                ) : openPicker.type === 'design' ? (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px,1fr))', gap:10 }}>
                    {pickerItems.map(it => (
                      <button key={it.id} onClick={() => pickerSelectItem(it)} title={it.title || 'Design'}
                        style={{ display:'flex', flexDirection:'column', gap:5, padding:0, border:'1px solid var(--border,#E9ECF2)', borderRadius:10, background:'#fff', cursor:'pointer', fontFamily:'inherit', overflow:'hidden', textAlign:'left' }}>
                        <div style={{ width:'100%', aspectRatio:'1 / 1', background:'#f4f6fa center/cover no-repeat' + (it.signed_url ? ` url(${it.signed_url})` : '') }}/>
                        <div style={{ padding:'7px 9px 9px', fontSize:12, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.title || 'Design'}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {pickerItems.map(it => (
                      <button key={it.id} onClick={() => pickerSelectItem(it)}
                        style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10, padding:'10px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        <span style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(49,90,231,0.07)', color:'var(--wl-primary, rgb(49,90,231))' }}><FileText size={15} strokeWidth={1.9}/></span>
                        <span style={{ minWidth:0, flex:1, fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.title || 'Unbenanntes Dokument'}</span>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <>
                  {pickerChats.length > 0 && !pickerShowOther && (
                    <>
                      <button onClick={() => pickerOpenWith(pickerChats[0].id)}
                        style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'11px 12px', borderRadius:10, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
                        <MessageSquare size={15} strokeWidth={2}/><span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Letzter Chat · {pickerChats[0].title || 'Chat'}</span>
                      </button>
                      <div style={{ fontSize:10.5, fontWeight:700, color:'var(--text-soft,#98a2b3)', textTransform:'uppercase', letterSpacing:'0.06em', padding:'2px 2px 6px' }}>Zugeordnete Chats</div>
                      {pickerChats.map(c => (
                        <button key={c.id} onClick={() => pickerOpenWith(c.id)}
                          style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit' }}
                          onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <span style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(49,90,231,0.07)', color:'var(--wl-primary, rgb(49,90,231))' }}><MessageSquare size={15} strokeWidth={1.9}/></span>
                          <span style={{ minWidth:0, flex:1, fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.title || 'Unbenannter Chat'}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {pickerChats.length === 0 && !pickerShowOther && (
                    <div style={{ padding:'4px 4px 12px', fontSize:12.5, color:'var(--text-muted)', lineHeight:1.5 }}>Noch keinem Chat zugeordnet.</div>
                  )}
                  {pickerShowOther && (
                    <>
                      <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Chats durchsuchen…" autoFocus
                        style={{ width:'100%', boxSizing:'border-box', border:'1px solid var(--border)', borderRadius:9, padding:'8px 11px', fontSize:13, outline:'none', fontFamily:'inherit', color:'var(--text-primary)', marginBottom:8 }}/>
                      {pickerBrandChats.filter(c => { const q=pickerSearch.trim().toLowerCase(); return !q || (c.title||'').toLowerCase().includes(q) }).map(c => (
                        <button key={c.id} onClick={() => pickerOpenWith(c.id)}
                          style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit' }}
                          onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <span style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(49,90,231,0.07)', color:'var(--wl-primary, rgb(49,90,231))' }}><MessageSquare size={15} strokeWidth={1.9}/></span>
                          <span style={{ minWidth:0, flex:1, fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.title || 'Unbenannter Chat'}</span>
                        </button>
                      ))}
                      {pickerBrandChats.length === 0 && <div style={{ padding:12, fontSize:12.5, color:'var(--text-muted)', textAlign:'center' }}>Keine Chats für diese Brand.</div>}
                    </>
                  )}
                  <div style={{ borderTop:'1px solid var(--border)', marginTop:10, paddingTop:10, display:'flex', flexDirection:'column', gap:4 }}>
                    {!pickerShowOther
                      ? <button onClick={pickerLoadBrandChats} style={{ width:'100%', textAlign:'left', padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--wl-primary, rgb(49,90,231))', fontFamily:'inherit' }} onMouseEnter={e => e.currentTarget.style.background='rgba(49,90,231,0.07)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>+ Anderen Chat wählen…</button>
                      : <button onClick={() => setPickerShowOther(false)} style={{ width:'100%', textAlign:'left', padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--text-muted)', fontFamily:'inherit' }} onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>← Zurück</button>
                    }
                    <button onClick={pickerOpenWithout} style={{ width:'100%', textAlign:'left', padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--text-muted)', fontFamily:'inherit' }} onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>Ohne Chat öffnen</button>
                    <button onClick={() => { setPickerStep('item'); setPickerItem(null) }} style={{ width:'100%', textAlign:'left', padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', fontSize:12.5, fontWeight:600, color:'var(--text-soft,#98a2b3)', fontFamily:'inherit' }} onMouseEnter={e => e.currentTarget.style.background='#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>← Anderes {openPicker.type === 'design' ? 'Design' : 'Dokument'} wählen</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const edgeBtn = {
  display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:40, padding:0, zIndex:40,
  borderRadius:10, border:'1px solid var(--border,#E9ECF2)', background:'var(--surface,#fff)', cursor:'pointer',
  color:'var(--text-secondary,#475569)', boxShadow:'0 2px 8px rgba(16,24,40,0.10)',
}
// Halbe Hälfte des Segment-Bedienelements am Splitscreen-Strich (ohne eigenen Rahmen/Schatten).
const segBtn = {
  display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:40, padding:0,
  border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary,#475569)',
}

// ─── CLEAN VIEW (Hero oder Post-Banner + zentrales Eingabefeld) ──────────────
function CleanView({
  linkedPost, activeBrandVoice,
  input, setInput, sending,
  attachments, setAttachments,
  plusOpen, setPlusOpen,
  knowledgeBase, selectedKnowledgeIds, setSelectedKnowledgeIds,
  audiences, selectedAudienceId, setSelectedAudienceId,
  companyVoices = [], showCompanyPicker = false, selectedCompanyVoiceIds = [], setSelectedCompanyVoiceIds = () => {},
  useWebSearch, setUseWebSearch, editorOpen = false, useEditorContext = false, setUseEditorContext = () => {},
  visualMode = false, setVisualMode = () => {}, imageModel, setImageModel = () => {}, imageAspect, setImageAspect = () => {},
  forceNewImage = false, setForceNewImage = () => {}, hasChatVisuals = false,
  handleFiles, fileInputRef, sendMessage, navigate,
}) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 24px', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:680 }}>
        {linkedPost ? (
          // Banner statt Hero wenn aus Post heraus
          <div style={{
            marginBottom:24, padding:'14px 18px',
            background:'rgba(49,90,231,0.06)', border:'1.5px solid rgba(49,90,231,0.20)', borderRadius:12,
            display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
          }}>
            <Pin size={18} strokeWidth={1.75} style={{ color:'var(--wl-primary, rgb(49,90,231))' }}/>
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ fontSize:10, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.05em' }}>Kontext aus dem Redaktionsplan</div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{linkedPost.title || '(ohne Titel)'}</div>
            </div>
            <button onClick={() => navigate('/redaktionsplan?open=' + linkedPost.id)}
              style={{ padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              ← Zurück zum Beitrag
            </button>
          </div>
        ) : (
          // Hero (aufgeräumt)
          <div style={{ textAlign:'center', marginBottom:26 }}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}>
              <img src="/Leadesk_Favicon (1).png" alt="Leadesk" width={54} height={54} style={{ display:'block', opacity:0.95 }}/>
            </div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:'-0.02em', lineHeight:1.2, color:'var(--text-primary)' }}>Content-Werkstatt</h1>
            <p style={{ fontSize:13.5, color:'var(--text-muted)', margin:'8px auto 0', lineHeight:1.6, maxWidth:460 }}>
              Schreib Beiträge und erstelle Bilder — alles in einem Chat, in der Brand Voice von <strong>{activeBrandVoice?.name || '—'}</strong>.
            </p>
          </div>
        )}

        <ChatInput
          input={input} setInput={setInput} sending={sending}
          attachments={attachments} setAttachments={setAttachments}
          plusOpen={plusOpen} setPlusOpen={setPlusOpen}
          knowledgeBase={knowledgeBase} selectedKnowledgeIds={selectedKnowledgeIds} setSelectedKnowledgeIds={setSelectedKnowledgeIds}
          audiences={audiences} selectedAudienceId={selectedAudienceId} setSelectedAudienceId={setSelectedAudienceId}
          companyVoices={companyVoices} showCompanyPicker={showCompanyPicker}
          selectedCompanyVoiceIds={selectedCompanyVoiceIds} setSelectedCompanyVoiceIds={setSelectedCompanyVoiceIds}
          useWebSearch={useWebSearch} setUseWebSearch={setUseWebSearch} editorOpen={editorOpen} useEditorContext={useEditorContext} setUseEditorContext={setUseEditorContext}
          visualMode={visualMode} setVisualMode={setVisualMode}
          imageModel={imageModel} setImageModel={setImageModel} imageAspect={imageAspect} setImageAspect={setImageAspect}
          forceNewImage={forceNewImage} setForceNewImage={setForceNewImage} hasChatVisuals={hasChatVisuals}
          handleFiles={handleFiles} fileInputRef={fileInputRef}
          sendMessage={sendMessage}
          enabled={!!activeBrandVoice?.id}
        />
      </div>
    </div>
  )
}

// ─── CHAT VIEW (klassisches Layout) ─────────────────────────────────────────
function ChatView({
  linkedPost, messages, messagesLoading, sending, messagesEndRef, attachToPost, loadExistingPosts,
  onInsertToDoc, onOpenInDesigner, onDownloadVisual, onImageToPost, signedVisualUrlFn,
  input, setInput,
  attachments, setAttachments,
  plusOpen, setPlusOpen,
  knowledgeBase, selectedKnowledgeIds, setSelectedKnowledgeIds,
  audiences, selectedAudienceId, setSelectedAudienceId,
  companyVoices = [], showCompanyPicker = false, selectedCompanyVoiceIds = [], setSelectedCompanyVoiceIds = () => {},
  useWebSearch, setUseWebSearch, editorOpen = false, useEditorContext = false, setUseEditorContext = () => {},
  visualMode = false, setVisualMode = () => {}, imageModel, setImageModel = () => {}, imageAspect, setImageAspect = () => {},
  forceNewImage = false, setForceNewImage = () => {}, hasChatVisuals = false,
  handleFiles, fileInputRef, sendMessage, navigate, error, hasOpenDoc = false,
}) {
  return (
    <>
      {/* Banner wenn aus Post */}
      {linkedPost && (
        <div style={{ padding:'10px 18px 10px 52px', borderBottom:'1px solid var(--border)', background:'rgba(49,90,231,0.05)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', flexShrink:0 }}>
          <Pin size={14} strokeWidth={1.75} style={{ color:'var(--wl-primary, rgb(49,90,231))' }}/>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:10, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.05em' }}>Kontext aus dem Redaktionsplan</div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{linkedPost.title || '(ohne Titel)'}</div>
          </div>
          <button onClick={() => navigate('/redaktionsplan?open=' + linkedPost.id)}
            style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            ← Zurück zum Beitrag
          </button>
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto', padding:'24px 24px 12px' }}>
        <div style={{ maxWidth:780, margin:'0 auto', display:'flex', flexDirection:'column', gap:18 }}>
          {messagesLoading && <div style={{ textAlign:'center', padding:30, fontSize:12, color:'var(--text-muted)' }}>Lade Verlauf…</div>}
          {messages.map(m => (
            <MessageBubble key={m.id} msg={m} onAttachToPost={attachToPost} loadExistingPosts={loadExistingPosts} onInsertToDoc={onInsertToDoc} linkedPostId={linkedPost?.id} hasOpenDoc={hasOpenDoc}
              onOpenInDesigner={onOpenInDesigner} onDownloadVisual={onDownloadVisual} onImageToPost={onImageToPost} signedVisualUrlFn={signedVisualUrlFn} />
          ))}
          {/* Loading-Indicator wenn letzter Turn user war */}
          {sending && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
            <div style={{ alignSelf:'flex-start' }}>
              {visualMode
                ? <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'12px 14px', background:'#fff', border:'1px solid var(--border)', borderRadius:12, fontSize:13, color:'var(--text-muted)' }}><Loader2 size={15} className='lk-spin'/>Bild wird erstellt…</div>
                : <TypingIndicator />}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {error && (
        <div style={{ padding:'8px 24px', background:'rgba(220,38,38,.08)', borderTop:'1px solid rgba(220,38,38,.2)', color:'#b91c1c', fontSize:12, flexShrink:0 }}>
          {error}
        </div>
      )}

      <div style={{ background:'transparent', padding:'6px 24px 18px', flexShrink:0 }}>
        <div style={{ maxWidth:780, margin:'0 auto' }}>
          <ChatInput
            input={input} setInput={setInput} sending={sending}
            attachments={attachments} setAttachments={setAttachments}
            plusOpen={plusOpen} setPlusOpen={setPlusOpen}
            knowledgeBase={knowledgeBase} selectedKnowledgeIds={selectedKnowledgeIds} setSelectedKnowledgeIds={setSelectedKnowledgeIds}
            audiences={audiences} selectedAudienceId={selectedAudienceId} setSelectedAudienceId={setSelectedAudienceId}
            companyVoices={companyVoices} showCompanyPicker={showCompanyPicker}
            selectedCompanyVoiceIds={selectedCompanyVoiceIds} setSelectedCompanyVoiceIds={setSelectedCompanyVoiceIds}
            useWebSearch={useWebSearch} setUseWebSearch={setUseWebSearch} editorOpen={editorOpen} useEditorContext={useEditorContext} setUseEditorContext={setUseEditorContext}
            visualMode={visualMode} setVisualMode={setVisualMode}
            imageModel={imageModel} setImageModel={setImageModel} imageAspect={imageAspect} setImageAspect={setImageAspect}
            forceNewImage={forceNewImage} setForceNewImage={setForceNewImage} hasChatVisuals={hasChatVisuals}
            handleFiles={handleFiles} fileInputRef={fileInputRef}
            sendMessage={sendMessage}
            enabled={true}
          />
        </div>
      </div>
    </>
  )
}

// ─── ChatInput-Komponente (wird sowohl in Clean als auch Chat genutzt) ──────
// Sofort-Tooltip (ohne die ~1-2s Verzögerung des nativen title-Attributs).
function Tip({ label, children, side = 'top' }) {
  const [show, setShow] = useState(false)
  if (!label) return children
  return (
    <span style={{ position:'relative', display:'inline-flex' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onMouseDown={() => setShow(false)}>
      {children}
      {show && (
        <span style={{ position:'absolute', left:'50%', transform:'translateX(-50%)',
          ...(side === 'bottom' ? { top:'calc(100% + 6px)' } : { bottom:'calc(100% + 6px)' }),
          zIndex:200, background:'#101828', color:'#fff', fontSize:11, fontWeight:600, lineHeight:1.2,
          padding:'4px 8px', borderRadius:6, whiteSpace:'nowrap', pointerEvents:'none',
          boxShadow:'0 4px 12px rgba(16,24,40,0.25)' }}>{label}</span>
      )}
    </span>
  )
}

function ChatInput({
  input, setInput, sending,
  attachments, setAttachments,
  plusOpen, setPlusOpen,
  knowledgeBase, selectedKnowledgeIds, setSelectedKnowledgeIds,
  audiences, selectedAudienceId, setSelectedAudienceId,
  companyVoices = [], showCompanyPicker = false, selectedCompanyVoiceIds = [], setSelectedCompanyVoiceIds = () => {},
  useWebSearch, setUseWebSearch, editorOpen = false, useEditorContext = false, setUseEditorContext = () => {},
  visualMode = false, setVisualMode = () => {}, imageModel = DEFAULT_IMAGE_MODEL, setImageModel = () => {},
  imageAspect = DEFAULT_ASPECT, setImageAspect = () => {}, forceNewImage = false, setForceNewImage = () => {}, hasChatVisuals = false,
  handleFiles, fileInputRef, sendMessage, enabled,
}) {
  const voice = useVoiceInput({
    language: 'de-DE',
    onFinalTranscript: (t) => {
      const tr = (t || '').trim()
      if (!tr) return
      setInput(prev => (prev && !prev.endsWith(' ') ? prev + ' ' : (prev || '')) + tr)
    },
  })
  return (
    <div data-tour-id="cs-composer" style={{ border:'1.5px solid var(--border)', borderRadius:14, background:'#fff', padding:'12px 14px 10px', boxShadow:'0 1px 3px rgba(15,23,42,.04)' }}>
      {/* Attachment-Strip */}
      {attachments.length > 0 && (
        <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
          {attachments.map((a, i) => (
            <div key={i} style={{ padding:'4px 8px', borderRadius:6, background:'#F1F5F9', fontSize:11, display:'flex', alignItems:'center', gap:6 }}>
              📎 {a.name.length > 24 ? a.name.slice(0,22) + '…' : a.name}
              <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:'#999' }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Knowledge-Selected-Strip */}
      {selectedKnowledgeIds.length > 0 && (
        <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
          {selectedKnowledgeIds.map(id => {
            const k = knowledgeBase.find(x => x.id === id)
            return (
              <div key={id} style={{ padding:'4px 8px', borderRadius:6, background:'#EFF6FF', fontSize:11, color: P, display:'flex', alignItems:'center', gap:6, fontWeight:600 }}>
                <span style={{display:'inline-flex',alignItems:'center',gap:4}}><BookOpen size={11} strokeWidth={1.75}/>{k?.name || id.slice(0,8)}</span>
                <button onClick={() => setSelectedKnowledgeIds(prev => prev.filter(x => x !== id))}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:0, color: P }}>×</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Textarea */}
      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) { e.preventDefault(); sendMessage() } }}
        placeholder={!enabled ? 'Wähle erst oben eine Brand Voice…' : (visualMode ? ((hasChatVisuals && !forceNewImage) ? 'Was soll am Bild geändert werden? (z.B. „mach den Hintergrund blau“)' : 'Beschreibe das Bild, das erstellt werden soll…') : 'Was möchtest du schreiben? (Enter zum Senden · Shift+Enter für Absatz)')}
        disabled={!enabled}
        rows={3}
        style={{ width:'100%', padding:'4px 4px 8px', border:'none', fontSize:14, fontFamily:'inherit', resize:'none', outline:'none', background:'transparent', boxSizing:'border-box' }}/>

      {/* Bottom Toolbar — Zeile 1 einzeilig; Visual-Optionen (Format + Modell) erscheinen in Zeile 2 */}
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'nowrap', flex:1, minWidth:0, overflow:'visible' }}>
          {/* Plus-Button: Datei + Wissen */}
          <div style={{ position:'relative', flexShrink:0 }}>
            <Tip label="Datei oder Wissen hinzufügen"><button onClick={() => setPlusOpen(o => !o)}
              style={{ ...IconBtn(plusOpen), width:34, padding:0, justifyContent:'center', gap:0 }}>
              <Plus size={16} strokeWidth={2}/>
            </button></Tip>
            {plusOpen && (
              <>
                <div onClick={() => setPlusOpen(false)} style={{ position:'fixed', inset:0, zIndex:80 }}/>
                <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:0, zIndex:81, background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:260, padding:6 }}>
                  <button onClick={() => { setPlusOpen(false); fileInputRef.current?.click() }}
                    style={PlusItem}>
                    <span style={{ fontSize:16 }}>📎</span>
                    <span>Datei hochladen</span>
                  </button>
                  <div style={{ height:1, background:'var(--border)', margin:'4px 0' }}/>
                  <div style={{ padding:'8px 10px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' }}>
                    Aus Wissensdatenbank
                  </div>
                  {knowledgeBase.length === 0 && <div style={{ padding:'4px 10px 8px', fontSize:12, color:'var(--text-muted)' }}>Noch keine Einträge</div>}
                  <div style={{ maxHeight:200, overflowY:'auto' }}>
                    {knowledgeBase.map(k => {
                      const checked = selectedKnowledgeIds.includes(k.id)
                      return (
                        <label key={k.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', cursor:'pointer', fontSize:12, color:'var(--text-primary)' }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => setSelectedKnowledgeIds(prev => checked ? prev.filter(x => x !== k.id) : [...prev, k.id])}/>
                          <span style={{display:'inline-flex',alignItems:'center',gap:6}}><BookOpen size={12} strokeWidth={1.75}/>{k.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Für Zielgruppe (Icon) */}
          <span data-tour-id="cs-audience-select" style={{ display:'inline-flex', flexShrink:0 }}><AudienceSelect audiences={audiences} value={selectedAudienceId} onChange={setSelectedAudienceId} iconOnly /></span>

          {/* Company Brand (Ambassador, Icon) — nur bei Personal-Brand-Kontext */}
          {showCompanyPicker && companyVoices.length > 0 && (
            <span data-tour-id="cs-company-select" style={{ display:'inline-flex', flexShrink:0 }}><CompanyMultiSelect companies={companyVoices} value={selectedCompanyVoiceIds} onChange={setSelectedCompanyVoiceIds} iconOnly /></span>
          )}

          {/* Web-Suche */}
          <Tip label="Web-Suche aktivieren"><button data-tour-id="cs-websearch" onClick={() => setUseWebSearch(v => !v)}
            style={{ ...IconBtn(useWebSearch), width:34, padding:0, justifyContent:'center', gap:0 }}>
            <Globe size={16} strokeWidth={1.75}/>
          </button></Tip>

          {/* Visual-Modus: Bild im Chat erstellen (Format + Modell erscheinen in Zeile 2) */}
          <Tip label="Bild im Chat erstellen"><button data-tour-id="cs-visual" onClick={() => setVisualMode(v => !v)}
            style={{ ...IconBtn(visualMode), width:34, padding:0, justifyContent:'center', gap:0 }}>
            <ImageIcon size={16} strokeWidth={1.75}/>
          </button></Tip>
          {/* Editor-Kontext (nur wenn Dokument-Editor offen) */}
          {editorOpen && (
            <Tip label="Dokument-Inhalt als Kontext für die KI nutzen"><button onClick={() => setUseEditorContext(v => !v)}
              style={{ ...IconBtn(useEditorContext), width:34, padding:0, justifyContent:'center', gap:0 }}>
              <FileText size={16} strokeWidth={1.75}/>
            </button></Tip>
          )}
        </div>

        {/* Mikrofon + Senden (rechts) */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Tip label={voice.isRecording ? 'Aufnahme stoppen' : 'Spracheingabe'}><button type="button" onClick={voice.isRecording ? voice.stop : voice.start}
            disabled={!enabled}
            style={{ ...IconBtn(voice.isRecording), width:34, padding:0, justifyContent:'center', gap:0,
              ...(voice.isRecording ? { background:'#FEE2E2', color:'#DC2626', borderColor:'#FECACA' } : {}),
              cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5 }}>
            {voice.isRecording ? <Square size={14} strokeWidth={2}/> : <Mic size={16} strokeWidth={1.9}/>}
          </button></Tip>
          <button onClick={sendMessage} disabled={!input.trim() || sending || !enabled}
            style={{
              padding:'8px 14px', borderRadius:9, border:'none',
              background: (!input.trim() || sending || !enabled) ? '#CBD5E1' : P,
              color:'#fff', fontSize:14, fontWeight:700,
              cursor: (!input.trim() || sending) ? 'not-allowed' : 'pointer',
              minWidth:44, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:4,
            }}>
            {sending ? <Loader2 size={14} className='lk-spin'/> : <Send size={14} strokeWidth={1.75}/>}
          </button>
        </div>
      </div>

      {/* Zeile 2 — Bild-Optionen (nur im Visual-Modus): Modell + Format + „Neues Bild" */}
      {visualMode && (
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <select value={imageModel} onChange={e => setImageModel(e.target.value)} title="Bildmodell"
            style={{ height:32, padding:'0 8px', borderRadius:9, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-primary)', fontSize:12, fontWeight:600, fontFamily:'inherit', cursor:'pointer', outline:'none', maxWidth:200 }}>
            {IMAGE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select value={imageAspect} onChange={e => setImageAspect(e.target.value)} title="Format / Seitenverhältnis"
            style={{ height:32, padding:'0 8px', borderRadius:9, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-primary)', fontSize:12, fontWeight:600, fontFamily:'inherit', cursor:'pointer', outline:'none' }}
            disabled={hasChatVisuals && !forceNewImage}>
            {ASPECT_PRESETS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {hasChatVisuals && (
            <Tip label={forceNewImage ? 'Neues, unabhängiges Bild' : 'Folge-Bearbeitung des letzten Bildes'}><button onClick={() => setForceNewImage(v => !v)}
              style={{ ...IconBtn(forceNewImage), height:32, padding:'0 10px', gap:6 }}>
              <FilePlus2 size={14} strokeWidth={1.75}/>Neues Bild
            </button></Tip>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

const PlusItem = {
  display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px',
  background:'transparent', border:'none', cursor:'pointer', borderRadius:7,
  fontSize:13, color:'var(--text-primary)', textAlign:'left', fontFamily:'inherit',
}

function IconBtn(active) {
  return {
    height:34, padding:'0 12px', borderRadius:9, boxSizing:'border-box',
    border: '1.5px solid ' + (active ? P : 'var(--border)'),
    background: active ? 'rgba(49,90,231,0.06)' : '#fff',
    color: active ? P : 'var(--text-primary)',
    fontSize:12.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', lineHeight:1,
    display:'inline-flex', alignItems:'center', gap:6, fontFamily:'inherit', flexShrink:0,
  }
}

// ─── MessageBubble ─────────────────────────────────────────────────────────
// Bild-Nachricht erkennen: entweder metadata.type==='image' oder content ist ein
// JSON-Marker {"type":"image",...}. Gibt {visual_id, storage_path, prompt} zurück.
function parseImageMessage(msg) {
  const meta = msg.metadata || {}
  if (meta.type === 'image' && meta.storage_path) return { visual_id: meta.visual_id, storage_path: meta.storage_path, prompt: meta.prompt }
  if (typeof msg.content === 'string' && msg.content.trim().startsWith('{')) {
    try { const j = JSON.parse(msg.content); if (j && j.type === 'image' && j.storage_path) return { visual_id: j.visual_id, storage_path: j.storage_path, prompt: j.prompt } } catch (_e) {}
  }
  return null
}

function ImageBubble({ meta, onOpenInDesigner, onDownloadVisual, onImageToPost, loadExistingPosts, signedVisualUrlFn }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  const [postMenuOpen, setPostMenuOpen] = useState(false)
  const [posts, setPosts] = useState(null)
  const [postsLoading, setPostsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  useEffect(() => {
    let cancelled = false
    setUrl(null); setErr(false)
    ;(async () => {
      try { const u = signedVisualUrlFn ? await signedVisualUrlFn(meta.storage_path, 3600) : null; if (!cancelled) { if (u) setUrl(u); else setErr(true) } }
      catch { if (!cancelled) setErr(true) }
    })()
    return () => { cancelled = true }
  }, [meta.storage_path])
  async function openPostMenu() {
    if (postMenuOpen) { setPostMenuOpen(false); return }
    setPostMenuOpen(true)
    if (posts === null && loadExistingPosts) {
      setPostsLoading(true)
      try { setPosts(await loadExistingPosts()) } catch { setPosts([]) } finally { setPostsLoading(false) }
    }
  }
  async function pick(postId) {
    setPostMenuOpen(false); setBusy(true)
    const ok = onImageToPost ? await onImageToPost(meta, postId) : false
    setBusy(false)
    if (ok) { setDone(true); setTimeout(() => setDone(false), 2600) }
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:8 }}>
      <div style={{ padding:8, background:'#fff', border:'1px solid var(--border)', borderRadius:12, maxWidth:360 }}>
        {err ? (
          <div style={{ padding:'30px 24px', fontSize:12, color:'var(--text-muted)' }}>Bild konnte nicht geladen werden.</div>
        ) : url ? (
          <img src={url} alt={meta.prompt || 'Generiertes Bild'} style={{ display:'block', maxWidth:'100%', borderRadius:8 }} />
        ) : (
          <div style={{ width:240, height:240, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}><Loader2 size={18} className='lk-spin'/></div>
        )}
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <Tip label="In den Designer öffnen"><button onClick={() => onOpenInDesigner && onOpenInDesigner(meta)}
          style={{ width:34, height:34, padding:0, justifyContent:'center', borderRadius:8, border:'none', background:P, color:'#fff', cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
          <Brush size={15} strokeWidth={1.9}/>
        </button></Tip>
        <div style={{ position:'relative' }}>
          <Tip label={done ? 'Zum Beitrag hinzugefügt ✓' : 'In Beitrag'}><button onClick={openPostMenu} disabled={busy}
            style={{ width:34, height:34, padding:0, justifyContent:'center', borderRadius:8, border:'1.5px solid '+(done?'#15803d':P), background:done?'rgba(21,128,61,0.10)':'rgba(49,90,231,0.06)', color:done?'#15803d':P, cursor:busy?'default':'pointer', display:'inline-flex', alignItems:'center' }}>
            {busy ? <Loader2 size={15} className="lk-spin"/> : <CalendarPlus size={15} strokeWidth={1.9}/>}
          </button></Tip>
          {postMenuOpen && (
            <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:0, zIndex:40, width:260, maxHeight:280, overflowY:'auto', background:'var(--surface,#fff)', border:'1px solid var(--border,#E9ECF2)', borderRadius:10, boxShadow:'0 12px 32px rgba(16,24,40,0.16)', padding:6 }}>
              <button onClick={() => pick('__new__')} style={{ ...ibMenuItem, color:P, fontWeight:700 }}>+ Als neuen Beitrag anlegen</button>
              <div style={{ height:1, background:'var(--border,#E9ECF2)', margin:'4px 0' }} />
              {postsLoading && <div style={{ padding:'8px 10px', fontSize:12, color:'var(--text-muted)' }}>Lade Beiträge…</div>}
              {!postsLoading && (posts || []).length === 0 && <div style={{ padding:'8px 10px', fontSize:12, color:'var(--text-muted)' }}>Keine bestehenden Beiträge.</div>}
              {!postsLoading && (posts || []).map(p => (
                <button key={p.id} onClick={() => pick(p.id)} title={p.title || '(ohne Titel)'}
                  style={{ ...ibMenuItem, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {p.title || '(ohne Titel)'}
                </button>
              ))}
            </div>
          )}
        </div>
        <Tip label="Herunterladen"><button onClick={() => onDownloadVisual && onDownloadVisual(meta)}
          style={{ width:34, height:34, padding:0, justifyContent:'center', borderRadius:8, border:'1.5px solid '+P, background:'rgba(49,90,231,0.06)', color:P, cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
          <Download size={15} strokeWidth={1.9}/>
        </button></Tip>
      </div>
    </div>
  )
}

function MessageBubble({ msg, onAttachToPost, loadExistingPosts, onInsertToDoc, linkedPostId, hasOpenDoc = false, onOpenInDesigner, onDownloadVisual, onImageToPost, signedVisualUrlFn }) {
  const isUser = msg.role === 'user'
  const [menuOpen, setMenuOpen] = useState(false)
  const [postMenuOpen, setPostMenuOpen] = useState(false)
  const [posts, setPosts] = useState(null)
  const [postsLoading, setPostsLoading] = useState(false)
  const meta = msg.metadata || {}
  const beitragstext = meta.beitragstext
  const sources = meta.sources || []

  // Bild-Nachricht → eigene Bubble (Vorschau + Designer/Download)
  const imageMeta = !isUser ? parseImageMessage(msg) : null
  if (imageMeta) {
    return <ImageBubble meta={imageMeta} onOpenInDesigner={onOpenInDesigner} onDownloadVisual={onDownloadVisual} onImageToPost={onImageToPost} loadExistingPosts={loadExistingPosts} signedVisualUrlFn={signedVisualUrlFn} />
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap:6 }}>
      <div style={{
        maxWidth:'92%', padding:'12px 14px', borderRadius:12,
        background: isUser ? P : '#fff',
        color: isUser ? '#fff' : 'var(--text-primary)',
        border: isUser ? 'none' : '1px solid var(--border)',
        fontSize:14, lineHeight:1.6, wordBreak:'break-word',
      }}>
        {isUser ? <div style={{ whiteSpace:'pre-wrap' }}>{msg.content}</div> : renderMessageContent(msg.content)}
        {!isUser && sources?.length > 0 && <SourcesList sources={sources} />}
      </div>
      {!isUser && beitragstext && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <div style={{ position:'relative' }}>
            <Tip label="Ins Dokument"><button data-tour-id="cs-insert-doc" onClick={() => { if (hasOpenDoc) setMenuOpen(o => !o); else onInsertToDoc && onInsertToDoc(beitragstext, 'new') }}
              style={{ width:34, height:34, padding:0, justifyContent:'center', borderRadius:8, border:'none', background:P, color:'#fff', cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
              <FileText size={15} strokeWidth={1.9}/>
            </button></Tip>
            {menuOpen && hasOpenDoc && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position:'fixed', inset:0, zIndex:80 }}/>
                <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:0, zIndex:81, background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:230, padding:6 }}>
                  <button onClick={() => { onInsertToDoc(beitragstext, 'append'); setMenuOpen(false) }} style={ibMenuItem}>Ins aktuelle Dokument</button>
                  <button onClick={() => { onInsertToDoc(beitragstext, 'new'); setMenuOpen(false) }} style={ibMenuItem}>Als neues Dokument</button>
                </div>
              </>
            )}
          </div>
          <div data-tour-id="cs-attach-post" style={{ position:'relative' }}>
            <Tip label="In Beitrag übernehmen"><button onClick={async () => {
                const open = !postMenuOpen; setPostMenuOpen(open)
                if (open && posts === null && loadExistingPosts) { setPostsLoading(true); const r = await loadExistingPosts(); setPosts(r || []); setPostsLoading(false) }
              }}
              style={{ width:34, height:34, padding:0, justifyContent:'center', borderRadius:8, border:'1.5px solid ' + P, background:'rgba(49,90,231,0.06)', color:P, cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
              <CalendarPlus size={15} strokeWidth={1.9}/>
            </button></Tip>
            {postMenuOpen && (
              <>
                <div onClick={() => setPostMenuOpen(false)} style={{ position:'fixed', inset:0, zIndex:80 }}/>
                <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:0, zIndex:81, background:'#fff', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.12)', minWidth:270, maxHeight:340, overflowY:'auto', padding:6 }}>
                  <button onClick={() => { onAttachToPost(beitragstext, '__new__'); setPostMenuOpen(false) }} style={ibMenuItem}>+ Als neuen Beitrag anlegen</button>
                  <div style={{ height:1, background:'var(--border)', margin:'4px 0' }}/>
                  <div style={{ padding:'6px 11px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em' }}>Zu bestehendem Beitrag</div>
                  {postsLoading && <div style={{ padding:'6px 11px', fontSize:12, color:'var(--text-muted)' }}>Lädt…</div>}
                  {!postsLoading && posts && posts.length === 0 && <div style={{ padding:'6px 11px', fontSize:12, color:'var(--text-muted)' }}>Noch keine Beiträge vorhanden</div>}
                  {!postsLoading && posts && posts.map(pp => (
                    <button key={pp.id} onClick={() => { onAttachToPost(beitragstext, pp.id); setPostMenuOpen(false) }} style={{ ...ibMenuItem, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={pp.title || '(ohne Titel)'}>
                      {pp.title || '(ohne Titel)'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const ibMenuItem = {
  display:'block', width:'100%', textAlign:'left', padding:'9px 11px', borderRadius:7,
  border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:600,
  color:'var(--text-primary)', fontFamily:'inherit',
}

// ─── Dokument-Tabs (rechte Leiste, pro Chat) ────────────────────────────────
function fmtDocDate(d) {
  const v = d.updated_at || d.created_at
  if (!v) return ''
  try { return new Date(v).toLocaleString('de-DE', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) } catch { return '' }
}
function DocTabsRail({ docs = [], activeDocId, chatId, teamId, brandVoiceId, onSelect = () => {}, onNew = () => {}, onAddExisting = () => {} }) {
  const [hover, setHover] = useState(null) // { id, top, left, title, date }
  const [pickerOpen, setPickerOpen] = useState(false)
  const [allDocs, setAllDocs] = useState([])
  const [allLoading, setAllLoading] = useState(false)
  const [search, setSearch] = useState('')

  async function openPicker() {
    setPickerOpen(true); setSearch(''); setAllLoading(true)
    const { data } = await listDocuments(teamId, brandVoiceId)
    setAllDocs(data || []); setAllLoading(false)
  }
  const filtered = allDocs.filter(d => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (d.title || '').toLowerCase().includes(q) || (d.content_text || '').toLowerCase().includes(q)
  })

  return (
    <aside data-tour-id="cs-doc-tabs" style={{ width:48, flexShrink:0, borderLeft:'1px solid var(--border,#E9ECF2)', background:'var(--page-bg, #F7F8FA)',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:7, padding:'14px 0', overflowY:'auto' }}>
      <div title="Dokumente in diesem Chat — ein Chat kann mehrere Dokumente haben" style={{ fontSize:8.5, fontWeight:800, color:'var(--text-soft,#98a2b3)', textTransform:'uppercase', letterSpacing:'0.03em', textAlign:'center', lineHeight:1.1, paddingBottom:2 }}>Docs</div>
      {docs.map((d, i) => {
        const active = d.id === activeDocId
        return (
          <button key={d.id} onClick={() => onSelect(d.id)}
            onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setHover({ id:d.id, top: r.top + r.height/2, left: r.left, title: d.title || 'Unbenanntes Dokument', date: fmtDocDate(d) }) }}
            onMouseLeave={() => setHover(h => (h && h.id === d.id) ? null : h)}
            style={{ position:'relative', width:34, height:34, borderRadius:9, flexShrink:0, cursor:'pointer',
              border:'1px solid ' + (active ? P : 'var(--border,#E9ECF2)'),
              background: active ? 'rgba(49,90,231,0.10)' : 'var(--surface,#fff)',
              color: active ? P : 'var(--text-muted,#667085)',
              display:'flex', alignItems:'center', justifyContent:'center', boxShadow: active ? '0 1px 3px rgba(49,90,231,0.18)' : 'none' }}>
            <FileText size={16} strokeWidth={1.9}/>
            <span style={{ position:'absolute', bottom:-1, right:-1, fontSize:9, fontWeight:800, color: active ? P : 'var(--text-soft,#98a2b3)', background:'var(--page-bg,#F7F8FA)', borderRadius:4, padding:'0 2px', lineHeight:1.3 }}>{i + 1}</span>
          </button>
        )
      })}
      <button onClick={openPicker} title="Dokument hinzufügen"
        style={{ width:34, height:34, borderRadius:9, flexShrink:0, cursor:'pointer', border:'1px dashed var(--border,#D7DCE5)', background:'transparent',
          color:'var(--text-muted,#667085)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Plus size={16} strokeWidth={2}/>
      </button>

      {hover && (
        <div style={{ position:'fixed', top: hover.top, left: hover.left - 10, transform:'translate(-100%, -50%)', zIndex:200, pointerEvents:'none',
          background:'#101828', color:'#fff', borderRadius:9, padding:'8px 11px', maxWidth:260, boxShadow:'0 10px 28px rgba(16,24,40,0.30)' }}>
          <div style={{ fontSize:12.5, fontWeight:700, lineHeight:1.35, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{hover.title}</div>
          {hover.date && <div style={{ fontSize:11, color:'#cbd5e1', marginTop:3, whiteSpace:'nowrap' }}>Zuletzt geändert: {hover.date}</div>}
        </div>
      )}

      {pickerOpen && (
        <div onClick={() => setPickerOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(2px)', zIndex:400, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'10vh' }}>
          <div onClick={e => e.stopPropagation()} style={{ width:460, maxWidth:'92vw', maxHeight:'72vh', display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(16,24,40,0.28)', overflow:'hidden', textAlign:'left' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px 10px' }}>
              <div style={{ fontSize:15, fontWeight:800, color:'var(--text-primary)' }}>Dokument hinzufügen</div>
              <button onClick={() => setPickerOpen(false)} style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', padding:4, display:'inline-flex' }}><X size={18}/></button>
            </div>
            <div style={{ padding:'0 16px 12px' }}>
              <button onClick={() => { setPickerOpen(false); onNew() }}
                style={{ width:'100%', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7, height:38, borderRadius:10, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                <Plus size={16} strokeWidth={2.2}/>Neues Dokument
              </button>
            </div>
            <div style={{ padding:'0 16px 8px', fontSize:10.5, fontWeight:700, color:'var(--text-soft,#98a2b3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Oder bestehendes hinzufügen</div>
            <div style={{ padding:'0 16px 10px' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Dokumente durchsuchen…" autoFocus
                style={{ width:'100%', boxSizing:'border-box', border:'1px solid var(--border)', borderRadius:9, padding:'8px 11px', fontSize:13, outline:'none', fontFamily:'inherit', color:'var(--text-primary)' }}/>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'0 10px 12px' }}>
              {allLoading && <div style={{ padding:14, fontSize:12.5, color:'var(--text-muted)', textAlign:'center' }}>Lädt…</div>}
              {!allLoading && filtered.length === 0 && <div style={{ padding:14, fontSize:12.5, color:'var(--text-muted)', textAlign:'center' }}>Keine Dokumente gefunden.</div>}
              {!allLoading && filtered.map(d => {
                const already = docs.some(x => x.id === d.id)
                return (
                  <button key={d.id} disabled={already} onClick={() => { if (!already) { setPickerOpen(false); onAddExisting(d.id) } }}
                    title={already ? 'Bereits in diesem Chat' : (d.title || 'Unbenanntes Dokument')}
                    style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:9, border:'none', background:'transparent', cursor: already ? 'default' : 'pointer', opacity: already ? 0.45 : 1, fontFamily:'inherit' }}
                    onMouseEnter={e => { if (!already) e.currentTarget.style.background='#F4F6FA' }}
                    onMouseLeave={e => { e.currentTarget.style.background='transparent' }}>
                    <span style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(49,90,231,0.07)', color:P }}><FileText size={15} strokeWidth={1.9}/></span>
                    <span style={{ minWidth:0, flex:1 }}>
                      <span style={{ display:'block', fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.title || 'Unbenanntes Dokument'}</span>
                      <span style={{ display:'block', fontSize:11, color:'var(--text-soft,#98a2b3)', marginTop:1 }}>{already ? 'Bereits hinzugefügt' : fmtDocDate(d)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

// ─── Leerer Pane (kein Dokument/Design offen) → zentral öffnen/neu ───────────
function EmptyOpenPane({ type, onOpen, onNew }) {
  const P = 'var(--wl-primary, rgb(49,90,231))'
  const label = type === 'design' ? 'Design' : 'Dokument'
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>Kein {label} geöffnet</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 300, lineHeight: 1.5 }}>
        Öffne ein bestehendes {label} und ordne es einem Chat zu — oder erstelle ein neues.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <button onClick={onOpen}
          style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: P, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(49,90,231,.18)' }}>
          {label} öffnen
        </button>
        <button onClick={onNew}
          style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border,#E9ECF2)', background: '#fff', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Neues {label}
        </button>
      </div>
    </div>
  )
}

// ─── Bild-Leiste (rechte Leiste im Designer-Modus, pro Chat) ────────────────
function VisualRail({ visuals = [], activeVisualId, onSelect = () => {}, onNew = () => {} }) {
  return (
    <aside style={{ width:56, flexShrink:0, borderLeft:'1px solid var(--border,#E9ECF2)', background:'var(--page-bg, #F7F8FA)',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:7, padding:'14px 0', overflowY:'auto' }}>
      <div title="Designs in diesem Chat" style={{ fontSize:8.5, fontWeight:800, color:'var(--text-soft,#98a2b3)', textTransform:'uppercase', letterSpacing:'0.03em', textAlign:'center', lineHeight:1.1, paddingBottom:2 }}>Designs</div>
      {visuals.length === 0 && (
        <div style={{ fontSize:9, color:'var(--text-soft,#98a2b3)', textAlign:'center', padding:'0 4px', lineHeight:1.3 }}>noch keine</div>
      )}
      {visuals.map((v) => {
        const active = v.id === activeVisualId
        return (
          <button key={v.id} onClick={() => onSelect(v)} title={v.title || v.prompt || 'Design'}
            style={{ position:'relative', width:42, height:42, borderRadius:9, flexShrink:0, cursor:'pointer', overflow:'hidden', padding:0,
              border:'2px solid ' + (active ? P : 'var(--border,#E9ECF2)'),
              background:'#fff', boxShadow: active ? '0 1px 3px rgba(49,90,231,0.25)' : 'none' }}>
            {v.signed_url
              ? <img src={v.signed_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
              : <span style={{ display:'flex', width:'100%', height:'100%', alignItems:'center', justifyContent:'center', color:'var(--text-soft,#98a2b3)' }}><ImageIcon size={16} strokeWidth={1.8}/></span>}
          </button>
        )
      })}
      <button onClick={onNew} title="Neues Design erstellen"
        style={{ width:42, height:42, borderRadius:9, flexShrink:0, cursor:'pointer', border:'1px dashed var(--border,#D7DCE5)', background:'transparent',
          color:'var(--text-muted,#667085)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Plus size={16} strokeWidth={2}/>
      </button>
    </aside>
  )
}
