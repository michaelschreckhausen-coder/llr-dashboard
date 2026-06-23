// src/pages/Visuals.jsx
// Content-Visuals-Werkstatt — Multi-Provider Bild-Generierung
//
// Neues Layout (2026-05-28):
//   1) Template-Strip oben (Freitext, Statistik, Realistisches Bild, Carousel,
//      Event-Announcement, Statement, Personal-Brand, Before/After)
//      Klick wechselt die Eingabe inline — kein Popup.
//   2) Eingabe-Card mit dynamisch wechselnden Feldern
//   3) Referenz-Zeile: BV-Refs ON/OFF Toggle + Custom-Refs Pile
//   4) Action-Row: Format ▼ · Anzahl ▼ · Modell ▼ · Generieren
//
// Brand-Visual-DNA wird automatisch aus der aktiven Brand Voice gezogen.

import React, { useState, useEffect, useRef } from 'react'
import GenerationLoading from '../components/GenerationLoading'
import CompanyMultiSelect from '../components/CompanyMultiSelect'
import { BarChart3, BookOpen, Calendar, Camera, Check, CheckCircle2, Eye, FileText, Image as ImageIcon, Lightbulb, Loader2, MessageSquare, Pencil, Pin, Plus, Repeat, Search, Sparkles, Target, Trash2, Upload, UserCircle2, Wand2, X, XCircle, Zap, Shuffle, Star } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sharedBrandVoiceIds, scopeContentByTeamOrSharedBV } from '../lib/teamShares'

// Liest die echte Fehlermeldung aus einer Edge-Function-Antwort (statt generischem
// "Edge Function returned a non-2xx status code").
async function fnErrMsg(fnErr) {
  try {
    const c = fnErr?.context
    if (c && typeof c.clone === 'function') {
      try { const j = await c.clone().json(); if (j?.error) return j.error } catch (_) {}
      try { const t = await c.clone().text(); if (t) return t.slice(0, 300) } catch (_) {}
    }
  } catch (_) {}
  return fnErr?.message || 'Generierung fehlgeschlagen'
}

import { resizeImageBeforeUpload } from '../lib/imageResize'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import FormatPicker from '../components/FormatPicker'
import { PRESET_BY_ID, DEFAULT_PRESET_ID } from '../lib/formatPresets'

const P = 'var(--wl-primary, rgb(49,90,231))'

// ─── Aspect-Ratios (Neuroflash-Style: normale Foto-Ratios) ──────────────────
const ASPECT_RATIOS = [
  { id: '1:1',  label: '1:1',  desc: 'Quadrat' },
  { id: '3:2',  label: '3:2',  desc: 'Klassisch quer' },
  { id: '2:3',  label: '2:3',  desc: 'Klassisch hoch' },
  { id: '4:3',  label: '4:3',  desc: 'TV / Print quer' },
  { id: '3:4',  label: '3:4',  desc: 'TV / Print hoch' },
  { id: '5:4',  label: '5:4',  desc: 'Large-Format quer' },
  { id: '4:5',  label: '4:5',  desc: 'Portrait (LinkedIn-mobil)' },
  { id: '21:9', label: '21:9', desc: 'Ultrabreit' },
  { id: '16:9', label: '16:9', desc: 'Widescreen' },
  { id: '9:16', label: '9:16', desc: 'Vertikal (Story)' },
]

// ─── Templates ──────────────────────────────────────────────────────────────
// 'freetext' ist der Default — keine Felder, klassische Textarea.
// Bei Carousel bestimmt der "Anzahl"-Dropdown später die Slide-Anzahl.
const TEMPLATES = [
  {
    id: 'freetext',
    label: 'Freitext',
    icon: <Pencil size={18} strokeWidth={1.75} />,
    desc: 'Beschreibe das Bild komplett selbst',
    defaultAspect: '1:1',
    fields: [],
    buildPrompt: (f) => (f.freetext || '').trim(),
  },
  {
    id: 'realistic',
    label: 'Realistisches Bild',
    icon: <Camera size={18} strokeWidth={1.75} />,
    desc: 'Foto-realistische Szene',
    defaultAspect: '3:2',
    fields: [
      { name: 'subject', label: 'Motiv / Szene', type: 'textarea', placeholder: 'z.B. "Frau am Schreibtisch in modernem Büro, denkt nach, warmes Licht von links"', required: true },
      { name: 'mood',    label: 'Stimmung (optional)', placeholder: 'z.B. "professionell, konzentriert, einladend"' },
    ],
    buildPrompt: (f, bv) => `Photorealistisches Bild. ${f.subject || ''}${f.mood ? ' Stimmung: ' + f.mood + '.' : ''} Stil: ${bv?.visual_style_description || 'professionell, modern, hochwertig'}. Photographic quality, natural lighting, sharp focus.`,
  },
  {
    id: 'stats',
    label: 'Statistik',
    icon: <BarChart3 size={18} strokeWidth={1.75} />,
    desc: 'Eine Zahl mit Kontext',
    defaultAspect: '1:1',
    fields: [
      { name: 'number',  label: 'Die Hauptzahl', placeholder: 'z.B. 87%, 3,2x, €1.4M', required: true },
      { name: 'context', label: 'Kontext (kurz)', type: 'textarea', placeholder: 'z.B. "der B2B-Käufer recherchieren online vor dem ersten Sales-Call"', required: true },
    ],
    buildPrompt: (f, bv) => `Stats-Visualization für LinkedIn. Sehr großes prominentes Element: "${f.number || ''}". Darunter klein und ergänzend: "${f.context || ''}". Visueller Stil: ${bv?.visual_style_description || 'datenfokussiert, professionell, modern'}. Format: starke Hierarchie, Zahl dominiert, klar lesbar.`,
  },
  {
    id: 'carousel',
    label: 'Carousel',
    icon: <Target size={18} strokeWidth={1.75} />,
    desc: 'Mehrere Slides — Anzahl unten festlegen',
    defaultAspect: '4:5',
    isCarousel: true,
    fields: [
      { name: 'title', label: 'Carousel-Titel', placeholder: 'z.B. "5 Tipps für besseres LinkedIn-Marketing"', required: true },
      { name: 'hook',  label: 'Hook / Untertitel', type: 'textarea', placeholder: 'Optional — Spannungsaufbau zum Weiter-Swipen' },
    ],
    // Pro Variante leicht abgewandelter Prompt — slideIndex/total kommt aus generate()
    buildPrompt: (f, bv, slideIndex, total) => {
      const title = f.title || ''
      const hook  = f.hook  || ''
      if (slideIndex === 0) {
        return `Erste Slide eines LinkedIn-Carousels (Hero-Slide). Sehr großer auffälliger Titel: "${title}"${hook ? `\nUntertitel kleiner: "${hook}"` : ''}. Visueller Stil: ${bv?.visual_style_description || 'modern, professionell, neugierig machend'}. Format: starker visueller Hook der zum Weiter-Swipen einlädt, klare Hierarchie, mobile-optimiert.`
      }
      return `Slide ${slideIndex + 1} von ${total} eines LinkedIn-Carousels zum Thema "${title}". Visueller Stil konsistent zum Hero-Slide: ${bv?.visual_style_description || 'modern, professionell'}. Diese Slide vermittelt einen Inhalts-Punkt im Carousel — passender Bildinhalt zum Thema, gleiche Designsprache.`
    },
  },
  {
    id: 'event',
    label: 'Event-Announcement',
    icon: <Calendar size={18} strokeWidth={1.75} />,
    desc: 'Webinar, Veranstaltung, Launch',
    defaultAspect: '1:1',
    fields: [
      { name: 'event_title', label: 'Event-Titel', placeholder: 'z.B. "Live-Webinar: KI im B2B-Vertrieb"', required: true },
      { name: 'date_time',   label: 'Datum + Uhrzeit', placeholder: 'z.B. "Do, 5. Juni · 18:00"', required: true },
      { name: 'context',     label: 'Kurzbeschreibung', type: 'textarea', placeholder: 'Worum geht es?' },
    ],
    buildPrompt: (f, bv) => `Event-Announcement-Bild für LinkedIn. Event-Titel groß: "${f.event_title || ''}". Datum/Zeit prominent: "${f.date_time || ''}"${f.context ? `. Kontext: ${f.context}` : ''}. Visueller Stil: ${bv?.visual_style_description || 'einladend, professionell, klar'}. Format: Eyecatcher, sofortige Erkennbarkeit dass es ein Event ist.`,
  },
  {
    id: 'statement',
    label: 'Statement',
    icon: <MessageSquare size={18} strokeWidth={1.75} />,
    desc: 'Zitat-Karte im Brand-Stil',
    defaultAspect: '1:1',
    fields: [
      { name: 'quote',  label: 'Statement / Zitat', type: 'textarea', placeholder: 'Der Satz, der im Bild steht...', required: true },
      { name: 'author', label: 'Autor (optional)',  placeholder: 'Wer hat es gesagt?' },
    ],
    buildPrompt: (f, bv) => `Elegante Zitat-Karte für LinkedIn. Im Bild groß und gut lesbar: "${f.quote || ''}"${f.author ? `\nAttribution: ${f.author}` : ''}. Visueller Stil: ${bv?.visual_style_description || 'professionell, modern, klare Typografie'}. Format: hochwertige Typografie, brand-passend, minimal aber wirkungsvoll. KEIN Logo oder zusätzliche Elemente — nur Text und Hintergrund.`,
  },
  {
    id: 'portrait',
    label: 'Personal-Brand-Portrait',
    icon: <UserCircle2 size={18} strokeWidth={1.75} />,
    desc: 'Du in einer Szene (BV-Refs empfohlen)',
    defaultAspect: '1:1',
    fields: [
      { name: 'scene', label: 'Szenerie', type: 'textarea', placeholder: 'z.B. "auf einer Konferenz-Bühne präsentierend"', required: true },
      { name: 'mood',  label: 'Stimmung', placeholder: 'z.B. selbstbewusst, professionell, dynamisch' },
    ],
    buildPrompt: (f, bv) => `Personal-Branding-Portrait. Die Person aus den Reference-Bildern wird abgebildet. Szenerie: ${f.scene || ''}. Stimmung: ${f.mood || 'selbstbewusst, professionell'}. Format: photorealistisch, hochwertig, LinkedIn-ready, Kopf+Schultern oder Halbtotale.`,
  },
  {
    id: 'before_after',
    label: 'Before / After',
    icon: <Shuffle size={18} strokeWidth={1.75} />,
    desc: 'Vergleich vorher / nachher',
    defaultAspect: '1:1',
    fields: [
      { name: 'before', label: 'Vorher / Problem',  type: 'textarea', placeholder: 'z.B. "Cold-Outreach: 2% Response-Rate"', required: true },
      { name: 'after',  label: 'Nachher / Lösung',  type: 'textarea', placeholder: 'z.B. "Mit Brand-Voice-Personalisierung: 18%"', required: true },
    ],
    buildPrompt: (f, bv) => `Before/After-Vergleichsbild für LinkedIn. Format Split-Screen oder klare Gegenüberstellung. Links/Oben (Vorher): "${f.before || ''}". Rechts/Unten (Nachher): "${f.after || ''}". Visueller Stil: ${bv?.visual_style_description || 'klarer Kontrast, professionell'}. Format: dramatischer Vergleich, sofort verständlich.`,
  },
]

const MODELS = [
  { value: 'gpt-image-1-mini|low',                       label: 'GPT Image Mini — schnell',           provider: 'OpenAI' },
  { value: 'gpt-image-1|medium',                         label: 'GPT Image — Standard',              provider: 'OpenAI' },
  { value: 'gpt-image-1|high',                           label: 'GPT Image — Premium',               provider: 'OpenAI' },
  { value: 'gemini-2.5-flash-image|medium',              label: 'Nano Banana — schnell',             provider: 'Google' },
  { value: 'gemini-3.1-flash-image-preview|medium',      label: 'Nano Banana 2 — neuere Version',    provider: 'Google' },
  { value: 'gemini-3-pro-image-preview|medium',          label: 'Nano Banana Pro — beste Qualität',  provider: 'Google' },
]

// OpenAI ehrt nur 1:1 / 3:2 / 2:3 echt; bei anderen Ratios automatisch auf Nano Banana.
const OPENAI_FAITHFUL = new Set(['1:1', '3:2', '2:3'])
const NANO_BANANA = 'gemini-2.5-flash-image|medium'

// ─── Hauptkomponente ────────────────────────────────────────────────────────
export default function Visuals({ session }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice, brandVoices } = useBrandVoice()
  const companyVoices = (brandVoices || []).filter(v => v.account_type === 'company_page')
  const [companyVoiceIds, setCompanyVoiceIds] = useState([])

  // Template-State (welches Template ist aktiv?)
  const [activeTemplateId, setActiveTemplateId] = useState('freetext')
  const activeTemplate = TEMPLATES.find(t => t.id === activeTemplateId) || TEMPLATES[0]
  const [templateFields, setTemplateFields] = useState({})

  // Generator-State
  const [formatPreset, setFormatPreset] = useState(PRESET_BY_ID[DEFAULT_PRESET_ID])
  const [variants, setVariants]        = useState(1)
  const [modelValue, setModelValue]    = useState('gpt-image-1-mini|low')
  const [referenceFiles, setReferenceFiles] = useState([])
  const refFileInputRef = useRef(null)
  const [refMenuOpen, setRefMenuOpen] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [pickerItems, setPickerItems] = useState([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [uploadingRef, setUploadingRef] = useState(false)
  const [useBVRefs, setUseBVRefs]      = useState(true)
  const [generating, setGenerating]    = useState(false)
  const [error, setError]              = useState('')
  const [notice, setNotice]            = useState('')
  const [results, setResults]          = useState([])

  // Edit-Modal-State
  const [editModal, setEditModal] = useState(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [editAspect, setEditAspect] = useState('1:1')
  const [editModelValue, setEditModelValue] = useState('gpt-image-1|medium')
  const [editing, setEditing] = useState(false)

  // "Zu Post hinzufügen"-Modal
  const [attachModal, setAttachModal] = useState(null)   // visual-object
  const [attachPosts, setAttachPosts] = useState([])
  const [attachLoading, setAttachLoading] = useState(false)
  const [attachSearch, setAttachSearch] = useState('')
  const [attachConfirm, setAttachConfirm] = useState('') // success-toast

  // Library-State
  const [library, setLibrary]        = useState([])
  const [libLoading, setLibLoading]  = useState(true)
  const [lightbox, setLightbox]      = useState(null)
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryShowAllBVs, setLibraryShowAllBVs] = useState(false)
  const [libraryFavOnly, setLibraryFavOnly] = useState(false)

  // Linked-Post-State (Closed-Loop mit Redaktionsplan)
  const [linkedPostId, setLinkedPostId] = useState(null)
  const [linkedPost, setLinkedPost] = useState(null)
  const [mode, setMode] = useState('standalone') // 'standalone' | 'post'
  const [postText, setPostText] = useState('')   // Beitragstext fuer Post-Modus

  function handleFormatChange(preset) {
    setFormatPreset(preset)
    if (!OPENAI_FAITHFUL.has(preset.ratio) && modelValue.startsWith('gpt-image')) {
      setModelValue(NANO_BANANA)
    }
  }

  // Template-Wechsel: nur Felder reset. Format ist jetzt unabhängig (FormatPicker).
  useEffect(() => {
    setTemplateFields({})
  }, [activeTemplateId])

  // ?post_id=<post_id> aus URL: Pre-Fill aus dem Beitrag (Closed-Loop)
  useEffect(() => {
    const post_id = searchParams.get('post_id')
    if (!post_id) return
    setLinkedPostId(post_id)
    ;(async () => {
      const { data: p } = await supabase.from('content_posts')
        .select('id, title, content, brand_voice_id, company_voice_ids, company_voice_id')
        .eq('id', post_id).maybeSingle()
      if (!p) return
      setLinkedPost(p)
      setCompanyVoiceIds(p.company_voice_ids || (p.company_voice_id ? [p.company_voice_id] : []))
      // Modus auf 'post' setzen + Default-Template realistic
      setMode('post')
      setActiveTemplateId('realistic')
      const seed = [p.title, p.content].filter(Boolean).join('\n\n').trim()
      setPostText(seed)
    })()
  }, [searchParams])

  // ?doc_id=<id> aus URL: Dokumenttext als Referenz in den Beitragstext (Doku → Visual)
  useEffect(() => {
    const doc_id = searchParams.get('doc_id')
    if (!doc_id) return
    ;(async () => {
      const { data: d } = await supabase.from('content_documents')
        .select('id, title, content_text')
        .eq('id', doc_id).maybeSingle()
      if (!d) return
      setMode('post')
      setActiveTemplateId('realistic')
      const seed = [d.title, d.content_text].filter(Boolean).join('\n\n').trim()
      setPostText(seed)
    })()
  }, [searchParams])

  // ?edit=<visual_id> aus URL: Bild-Bearbeitung passiert jetzt in der
  // Content-Werkstatt (Designer). Wir leiten direkt dorthin um.
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    navigate('/content-studio?visual=' + editId, { replace: true })
  }, [searchParams])

  // ─── Reference-Upload ─────────────────────────────────────────────────────
  async function uploadReference(file) {
    if (!file || !activeTeamId) return null
    if (file.size > 20 * 1024 * 1024) { alert('Datei zu groß (max 20 MB)'); return null }
    setUploadingRef(true)
    try {
      try { file = await resizeImageBeforeUpload(file, 1500, 0.85) } catch (e) { console.warn('[ref-resize]', e.message) }
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const safeExt = ['png','jpg','jpeg','webp'].includes(ext) ? ext : 'png'
      const path = `${activeTeamId}/references/${crypto.randomUUID()}.${safeExt}`
      const { error: upErr } = await supabase.storage.from('visuals').upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) { alert('Upload fehlgeschlagen: ' + upErr.message); return null }
      return { previewUrl: URL.createObjectURL(file), path }
    } finally {
      setUploadingRef(false)
    }
  }

  async function addReferenceFiles(files) {
    const arr = Array.from(files || [])
    const remaining = 8 - referenceFiles.length
    if (remaining <= 0) { alert('Max 8 zusätzliche Referenzbilder'); return }
    const uploaded = []
    for (const f of arr.slice(0, remaining)) {
      const r = await uploadReference(f)
      if (r) uploaded.push(r)
    }
    setReferenceFiles(prev => [...prev, ...uploaded])
  }
  function removeReference(i) { setReferenceFiles(prev => prev.filter((_, idx) => idx !== i)) }

  async function openMediaPicker() {
    setMediaPickerOpen(true); setPickerLoading(true)
    const _sharedBv = await sharedBrandVoiceIds(activeTeamId)
    let q = scopeContentByTeamOrSharedBV(supabase.from('visuals').select('*'), activeTeamId, _sharedBv)
      .eq('is_archived', false)
      .or('media_type.is.null,media_type.eq.image')
      .order('created_at', { ascending: false })
      .limit(120)
    if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
    const { data } = await q
    const withUrls = await Promise.all((data || []).map(async (v) => {
      const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24)
      return { ...v, signed_url: signed?.signedUrl || null }
    }))
    setPickerItems(withUrls); setPickerLoading(false)
  }
  function addFromMedia(item) {
    if (!item?.storage_path) return
    if (referenceFiles.some(r => r.path === item.storage_path)) return
    if (referenceFiles.length >= 8) { alert('Max 8 zusätzliche Referenzbilder'); return }
    setReferenceFiles(prev => [...prev, { previewUrl: item.signed_url, path: item.storage_path }])
  }

  // ─── Library ──────────────────────────────────────────────────────────────
  // Nur AI-generierte Bilder (kein model='upload', kein media_type='video|document').
  // Uploads liegen separat auf /media.
  async function loadLibrary() {
    setLibLoading(true)
    const _sharedBv = await sharedBrandVoiceIds(activeTeamId)
    let q = scopeContentByTeamOrSharedBV(supabase.from('visuals').select('*'), activeTeamId, _sharedBv)
      .eq('is_archived', false)
      .neq('model', 'upload')
      .or('media_type.is.null,media_type.eq.image')
      .order('is_favorite', { ascending: false })
      .order('created_at',  { ascending: false })
      .limit(100)
    if (activeBrandVoice?.id && !libraryShowAllBVs) q = q.eq('brand_voice_id', activeBrandVoice.id)
    if (libraryFavOnly) q = q.eq('is_favorite', true)
    if (librarySearch.trim()) q = q.ilike('prompt', '%' + librarySearch.trim() + '%')
    const { data } = await q
    const withUrls = await Promise.all((data || []).map(async (v) => {
      const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24)
      return { ...v, signed_url: signed?.signedUrl || null }
    }))
    setLibrary(withUrls); setLibLoading(false)
  }
  useEffect(() => { if (activeTeamId) loadLibrary() }, [activeTeamId, activeBrandVoice?.id, libraryShowAllBVs, libraryFavOnly, librarySearch])

  // ─── Prompt-Validation ────────────────────────────────────────────────────
  // Prefix fuer Post-Mode: prepended an alle Template-Prompts.
  function postModePrefix() {
    if (mode !== 'post' || !postText.trim()) return ''
    return 'Bild fuer einen LinkedIn-Beitrag mit dem Inhalt: ' + postText.trim() + '\n\n'
  }
  function buildResolvedPrompts() {
    // Im Post-Modus braucht's einen Beitragstext
    if (mode === 'post' && !postText.trim()) {
      return { error: 'Bitte Beitragstext eingeben.' }
    }
    const prefix = postModePrefix()

    // Freitext → einfach das Textarea-Feld
    if (activeTemplate.id === 'freetext') {
      const text = (templateFields.freetext || '').trim()
      if (!text) return { error: 'Bitte beschreibe das Bild im Eingabefeld.' }
      const full = prefix + text
      return { prompts: [full], firstPrompt: full }
    }
    // Required-Felder pruefen (nur im standalone-Modus; im Post-Modus reicht postText)
    if (mode === 'standalone') {
      const missing = activeTemplate.fields.filter(f => f.required && !(templateFields[f.name] || '').trim())
      if (missing.length) return { error: 'Bitte ausfuellen: ' + missing.map(f => f.label).join(', ') }
    }

    if (activeTemplate.isCarousel) {
      // Pro Slide einzelnen Prompt
      const total = variants
      const prompts = Array.from({ length: total }, (_, i) => prefix + activeTemplate.buildPrompt(templateFields, activeBrandVoice, i, total))
      return { prompts, firstPrompt: prompts[0] }
    }

    // Alle anderen Templates: alle Varianten kriegen denselben Prompt
    const p = prefix + activeTemplate.buildPrompt(templateFields, activeBrandVoice)
    return { prompts: [p], firstPrompt: p }
  }

  // ─── Generate ─────────────────────────────────────────────────────────────
  async function generate() {
    setError(''); setNotice('')
    const built = buildResolvedPrompts()
    if (built.error) { setError(built.error); return }
    setGenerating(true); setResults([])
    try {
      const [model, quality] = modelValue.split('|')
      const allResults = []
      // Carousel: variants Anzahl × einzelne Calls mit individuellem Prompt
      // Sonst: 1 Call mit variants=N (Edge Function macht den Loop)
      if (activeTemplate.isCarousel) {
        for (let i = 0; i < built.prompts.length; i++) {
          const { data, error: fnErr } = await supabase.functions.invoke('generate-image', {
            body: {
              prompt: built.prompts[i],
              aspectRatio: formatPreset.ratio,
              targetWidth: formatPreset.w,
              targetHeight: formatPreset.h,
              variants: 1,
              brandVoiceId: activeBrandVoice?.id || null,
              companyVoiceIds: companyVoiceIds,
              model, quality,
              useBrandVoiceRefs: useBVRefs,
              referenceImagePaths: referenceFiles.map(r => r.path),
              carouselSlideIndex: i,
              carouselTotal: built.prompts.length,
            }
          })
          if (fnErr) throw new Error(await fnErrMsg(fnErr))
          if (data?.error) throw new Error(data.error)
          if (data?.notice) setNotice(data.notice)
          allResults.push(...(data?.visuals || []))
        }
      } else {
        const { data, error: fnErr } = await supabase.functions.invoke('generate-image', {
          body: {
            prompt: built.firstPrompt,
            aspectRatio: formatPreset.ratio,
            targetWidth: formatPreset.w,
            targetHeight: formatPreset.h,
            variants,
            brandVoiceId: activeBrandVoice?.id || null,
            companyVoiceIds: companyVoiceIds,
            model, quality,
            useBrandVoiceRefs: useBVRefs,
            referenceImagePaths: referenceFiles.map(r => r.path),
          }
        })
        if (fnErr) throw new Error(await fnErrMsg(fnErr))
        if (data?.error) throw new Error(data.error)
        if (data?.notice) setNotice(data.notice)
        allResults.push(...(data?.visuals || []))
      }
      setResults(allResults)
      setReferenceFiles([])
      loadLibrary()
    } catch (e) {
      setError('Fehler: ' + (e.message || 'Generierung fehlgeschlagen'))
    } finally {
      setGenerating(false)
    }
  }

  // ─── Edit ─────────────────────────────────────────────────────────────────
  async function editVisual() {
    if (!editModal) return
    if (!editPrompt.trim() && editAspect === editModal.aspect_ratio) return
    setEditing(true)
    try {
      const [model, quality] = editModelValue.split('|')
      const isOutpaint = editAspect !== editModal.aspect_ratio
      const effPrompt = isOutpaint
        ? `Erweitere das Referenzbild auf das neue Aspect-Ratio ${editAspect}. Fülle die neuen Bildbereiche stilistisch konsistent zum Original. ${editPrompt.trim()}`
        : editPrompt.trim()
      const { data, error: fnErr } = await supabase.functions.invoke('generate-image', {
        body: {
          prompt: effPrompt,
          aspectRatio: editAspect,
          variants: 1,
          brandVoiceId: activeBrandVoice?.id || null,
          companyVoiceIds: companyVoiceIds,
          model, quality,
          useBrandVoiceRefs: useBVRefs,
          referenceImagePaths: [editModal.storage_path],
          parentVisualId: editModal.id,
        }
      })
      if (fnErr) throw new Error(await fnErrMsg(fnErr))
      if (data?.error) throw new Error(data.error)
      loadLibrary(); setEditModal(null); setEditPrompt('')
    } catch (e) {
      alert('Edit fehlgeschlagen: ' + (e.message || 'Unbekannt'))
    } finally {
      setEditing(false)
    }
  }

  // Download via Blob: signed URLs sind cross-origin, das download-Attribut
  // wird vom Browser ignoriert → Bild öffnet sich statt downzuloaden.
  // Lösung: über supabase.storage.download() einen lokalen Blob holen.
  async function downloadImage(visual) {
    try {
      const path = visual?.storage_path
      if (!path) { alert('Kein Storage-Pfad'); return }
      const { data: blob, error } = await supabase.storage.from('visuals').download(path)
      if (error || !blob) { alert('Download fehlgeschlagen: ' + (error?.message || '')); return }
      const ext = (path.split('.').pop() || 'png').toLowerCase()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leadesk-visual-${visual.id}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (e) {
      alert('Download-Fehler: ' + (e.message || ''))
    }
  }
  async function toggleFavorite(id, cur) {
    await supabase.from('visuals').update({ is_favorite: !cur }).eq('id', id)
    setLibrary(prev => prev.map(v => v.id === id ? { ...v, is_favorite: !cur } : v))
  }
  async function archiveVisual(id) {
    await supabase.from('visuals').update({ is_archived: true }).eq('id', id)
    setLibrary(prev => prev.filter(v => v.id !== id))
  }

  // ─── "Zu Post hinzufügen" — Picker laden ──────────────────────────────────
  // Wenn von Redaktionsplan kommend → direkt am linkedPost anhängen, kein Modal
  async function quickAttachToLinkedPost(visual) {
    if (!linkedPostId) { openAttachModal(visual); return }
    const { count } = await supabase
      .from('content_post_visuals')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', linkedPostId)
    const { error } = await supabase.from('content_post_visuals').insert({
      post_id: linkedPostId,
      visual_id: visual.id,
      team_id: activeTeamId,
      position: count || 0,
      created_by: session?.user?.id,
    })
    if (error && !String(error.message).includes('duplicate')) {
      alert('Fehler beim Zuordnen: ' + error.message); return
    }
    // Cover-Visual setzen wenn noch keins
    if (linkedPost && !linkedPost.visual_id) {
      await supabase.from('content_posts').update({ visual_id: visual.id }).eq('id', linkedPostId)
    }
    setAttachConfirm('Bild zugeordnet — zurück zum Beitrag…')
    setTimeout(() => {
      setAttachConfirm('')
      navigate('/redaktionsplan?open=' + linkedPostId)
    }, 900)
  }

  async function openAttachModal(visual) {
    setAttachModal(visual)
    setAttachConfirm('')
    setAttachLoading(true)
    let q = supabase.from('content_posts')
      .select('id, title, content, status, scheduled_at, visual_id, brand_voice_id, created_at')
      .neq('status', 'published')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at',   { ascending: false })
      .limit(80)
    if (activeBrandVoice?.id) q = q.eq('brand_voice_id', activeBrandVoice.id)
    const { data, error } = await q
    if (error) { console.warn('[attach-posts]', error); setAttachPosts([]); setAttachLoading(false); return }
    setAttachPosts(data || [])
    setAttachLoading(false)
  }

  async function attachVisualToPost(post) {
    if (!attachModal) return
    // Junction-Eintrag anlegen (idempotent dank UNIQUE(post_id, visual_id))
    // Position = aktuelle Anzahl Visuals des Posts (an Ende anhängen)
    const { count } = await supabase
      .from('content_post_visuals')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id)
    const teamId = post.team_id || activeTeamId
    const { error } = await supabase.from('content_post_visuals').insert({
      post_id: post.id,
      visual_id: attachModal.id,
      team_id: teamId,
      position: count || 0,
      created_by: session?.user?.id,
    })
    if (error && !String(error.message).includes('duplicate')) {
      alert('Fehler beim Zuordnen: ' + error.message); return
    }
    // Wenn der Post noch kein Cover-Visual hatte → als visual_id setzen
    if (!post.visual_id) {
      await supabase.from('content_posts')
        .update({ visual_id: attachModal.id })
        .eq('id', post.id)
    }
    setAttachConfirm(`Bild zugeordnet — zurück zum Beitrag…`)
    setAttachPosts(prev => prev.map(p => p.id === post.id ? { ...p, visual_id: p.visual_id || attachModal.id } : p))
    setTimeout(() => {
      setAttachModal(null); setAttachConfirm('')
      navigate('/redaktionsplan?open=' + post.id)
    }, 1100)
  }

  const filteredAttachPosts = (attachPosts || []).filter(p => {
    if (!attachSearch.trim()) return true
    const s = attachSearch.trim().toLowerCase()
    return (p.title || '').toLowerCase().includes(s) || (p.content || '').toLowerCase().includes(s)
  })

  // ─── "Neuen Beitrag mit Bild anlegen" ─────────────────────────────────────
  async function createPostWithVisual(visual) {
    if (!visual?.id) return
    if (!activeBrandVoice?.id) { alert('Keine aktive Brand Voice — bitte oben rechts auswählen.'); return }
    if (!activeTeamId)         { alert('Kein Team aktiv'); return }
    const { data: post, error } = await supabase.from('content_posts').insert({
      user_id: session?.user?.id,
      team_id: activeTeamId,
      brand_voice_id: activeBrandVoice.id,
      title: (visual.prompt || 'Neuer Beitrag mit Bild').slice(0, 80),
      content: '',
      platform: 'linkedin',
      status: 'idee',
      workspace: 'personal',
      visual_id: visual.id,  // Cover-Visual-Pointer
    }).select().single()
    if (error) { alert('Erstellen fehlgeschlagen: ' + error.message); return }
    // Junction-Eintrag (für Multi-Visual-UI)
    await supabase.from('content_post_visuals').insert({
      post_id: post.id,
      visual_id: visual.id,
      team_id: activeTeamId,
      position: 0,
      created_by: session?.user?.id,
    })
    setAttachConfirm('Neuer Beitrag angelegt — wird gleich geöffnet…')
    setTimeout(() => {
      setAttachModal(null); setAttachConfirm('')
      navigate('/redaktionsplan?open=' + post.id)
    }, 1100)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const canGenerate = !generating && (
    mode === 'post'
      ? postText.trim().length > 0
      : activeTemplate.id === 'freetext'
        ? (templateFields.freetext || '').trim().length > 0
        : activeTemplate.fields.filter(f => f.required).every(f => (templateFields[f.name] || '').trim())
  )

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Header */}
      <div style={{ marginBottom:22, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Visuals</div>
          <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Bilder.</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
            Deine Galerie aller KI-Bilder. Erstellen und Bearbeiten passiert jetzt in der Content-Werkstatt.
          </p>
        </div>
        <button onClick={() => navigate('/content-studio')}
          style={{ padding:'10px 16px', borderRadius:10, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', display:'inline-flex', alignItems:'center', gap:7, boxShadow:'0 2px 10px rgba(49,90,231,.18)' }}>
          <Sparkles size={15} strokeWidth={1.9}/>Neues Bild erstellen
        </button>
      </div>

      {/* Linked-Post-Banner (Closed-Loop mit Redaktionsplan) */}
      {linkedPostId && linkedPost && (
        <div style={{ padding:'10px 14px', marginBottom:16, borderRadius:10, background:'rgba(49,90,231,0.06)', border:'1px solid rgba(49,90,231,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
            <Pin size={16} strokeWidth={1.75} style={{ color:'var(--wl-primary, rgb(49,90,231))' }} />
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:700, color: P, textTransform:'uppercase', letterSpacing:'0.05em' }}>Aus dem Redaktionsplan</div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {linkedPost.title || '(ohne Titel)'}
              </div>
            </div>
          </div>
          <button onClick={() => navigate('/redaktionsplan?open=' + linkedPostId)}
            style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
            ← Zurück zum Beitrag
          </button>
        </div>
      )}


      {/* Library */}
      <section>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:12 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', margin:0 }}>
            Bibliothek
          </h3>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <input type="text" value={librarySearch} onChange={e => setLibrarySearch(e.target.value)}
              placeholder="Prompt durchsuchen…"
              style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:12, fontFamily:'inherit', outline:'none', minWidth:200 }}/>
            <button onClick={() => setLibraryFavOnly(!libraryFavOnly)}
              style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid ' + (libraryFavOnly ? '#F59E0B' : 'var(--border)'), background: libraryFavOnly ? '#FFFBEB' : '#fff', color: libraryFavOnly ? '#92400E' : 'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Star size={13} strokeWidth={1.75}/>Favoriten</span>
            </button>
            <button onClick={() => setLibraryShowAllBVs(!libraryShowAllBVs)}
              style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid ' + (libraryShowAllBVs ? P : 'var(--border)'), background: libraryShowAllBVs ? 'rgba(49,90,231,0.06)' : '#fff', color: libraryShowAllBVs ? P : 'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              {libraryShowAllBVs ? 'Alle BVs' : '' + (activeBrandVoice?.name?.slice(0,20) || 'Aktive BV')}
            </button>
          </div>
        </div>
        {libLoading && <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Lade…</div>}
        {!libLoading && library.length === 0 && (
          <div style={{ padding:'40px 20px', textAlign:'center', background:'var(--surface)', borderRadius:14, border:'1px dashed var(--border)', color:'var(--text-muted)', fontSize:13 }}>
            Noch keine Bilder. Erstelle dein erstes Bild in der Content-Werkstatt.
            <div style={{ marginTop:12 }}>
              <button onClick={() => navigate('/content-studio')}
                style={{ padding:'8px 16px', borderRadius:9, border:'none', background:P, color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 }}>
                <Sparkles size={14} strokeWidth={1.9}/>Zur Content-Werkstatt
              </button>
            </div>
          </div>
        )}
        {!libLoading && library.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px, 1fr))', gap:14 }}>
            {library.map(v => (
              <GalleryCard key={v.id} v={v}
                onOpenStudio={() => navigate('/content-studio?visual=' + v.id)}
                onLightbox={() => setLightbox(v)}
                onDownload={() => downloadImage(v)}
                onToggleFav={() => toggleFavorite(v.id, v.is_favorite)}
                onDelete={() => { if (window.confirm('Dieses Bild wirklich löschen?')) archiveVisual(v.id) }} />
            ))}
          </div>
        )}
      </section>

      {/* Lightbox */}
      {mediaPickerOpen && (
        <div onClick={() => setMediaPickerOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(2px)', zIndex:1200, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'8vh' }}>
          <div onClick={e => e.stopPropagation()} style={{ width:640, maxWidth:'94vw', maxHeight:'78vh', display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(16,24,40,0.28)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px 10px' }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'var(--text-primary)' }}>Aus Medien wählen</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Bilder dieser Brand als zusätzliche Referenz · {referenceFiles.length}/8 gewählt</div>
              </div>
              <button onClick={() => setMediaPickerOpen(false)} style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', padding:4, display:'inline-flex' }}><X size={18}/></button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'4px 16px 16px' }}>
              {pickerLoading && <div style={{ padding:30, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Lädt…</div>}
              {!pickerLoading && pickerItems.length === 0 && <div style={{ padding:30, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Keine Bilder in den Medien dieser Brand.</div>}
              {!pickerLoading && pickerItems.length > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:10 }}>
                  {pickerItems.map(v => {
                    const added = referenceFiles.some(r => r.path === v.storage_path)
                    return (
                      <button key={v.id} type="button" onClick={() => addFromMedia(v)} disabled={added || referenceFiles.length >= 8}
                        style={{ position:'relative', padding:0, border:'2px solid '+(added?P:'transparent'), borderRadius:10, overflow:'hidden', cursor:(added||referenceFiles.length>=8)?'default':'pointer', background:'#000', aspectRatio:'1/1', opacity:(referenceFiles.length>=8&&!added)?0.5:1 }}>
                        {v.signed_url && <img src={v.signed_url} alt={v.prompt||''} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>}
                        {added && <div style={{ position:'absolute', inset:0, background:'rgba(49,90,231,0.30)', display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ width:26, height:26, borderRadius:'50%', background:P, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}><Check size={15} strokeWidth={3}/></span></div>}
                        <span style={{ position:'absolute', top:5, left:5, padding:'1px 6px', background: v.model==='upload'?'rgba(0,0,0,0.6)':'rgba(49,90,231,0.92)', color:'#fff', fontSize:8.5, fontWeight:700, borderRadius:4, textTransform:'uppercase' }}>{v.model==='upload'?'Upload':'Generiert'}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ padding:'10px 18px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end' }}>
              <button onClick={() => setMediaPickerOpen(false)} style={{ padding:'8px 16px', borderRadius:9, border:'none', background:P, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>Fertig</button>
            </div>
          </div>
        </div>
      )}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:16, maxWidth:'min(95vw, 900px)', maxHeight:'95vh', overflow:'auto', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{lightbox.aspect_ratio} · {lightbox.model}</span>
              <span style={{ flex:1, minWidth:8 }}/>
              <button onClick={() => { openAttachModal(lightbox); setLightbox(null) }}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background: P, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6, boxShadow:'0 2px 6px rgba(49,90,231,.25)' }}>
                📅 Zu Beitrag hinzufügen
              </button>
              <button onClick={() => downloadImage(lightbox)} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}>⬇ Download</button>
              <button onClick={() => { navigate('/content-studio?visual=' + lightbox.id); setLightbox(null) }} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}><Pencil size={12} strokeWidth={1.75} style={{ marginRight:6 }} />In Content-Werkstatt öffnen</button>
              <button onClick={() => { archiveVisual(lightbox.id); setLightbox(null) }} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#b91c1c', cursor:'pointer', fontSize:12, fontWeight:600 }}><Trash2 size={12} strokeWidth={1.75} style={{ marginRight:6 }} />Löschen</button>
              <button onClick={() => setLightbox(null)} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--text-muted)' }}><X size={14} strokeWidth={1.75}/></button>
            </div>
            {lightbox.signed_url && (
              <img src={lightbox.signed_url} alt={lightbox.prompt} style={{ maxWidth:'100%', maxHeight:'70vh', display:'block', margin:'0 auto' }}/>
            )}
            <div style={{ padding:'14px 18px', background:'#F8FAFC' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Prompt</div>
              <div style={{ fontSize:13, color:'rgb(20,20,43)', lineHeight:1.6 }}>{lightbox.prompt}</div>
              {lightbox.resolved_prompt && lightbox.resolved_prompt !== lightbox.prompt && (
                <details style={{ marginTop:10 }}>
                  <summary style={{ fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>Voll-Prompt anzeigen</summary>
                  <pre style={{ marginTop:6, padding:10, background:'#fff', borderRadius:6, fontSize:11, whiteSpace:'pre-wrap', fontFamily:'inherit', color:'var(--text-muted)' }}>{lightbox.resolved_prompt}</pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* "Zu Post hinzufügen"-Modal */}
      {attachModal && (
        <div onClick={e => e.target === e.currentTarget && setAttachModal(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:120 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:720, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexShrink:0 }}>
              <div>
                <h3 style={{ fontSize:18, fontWeight:700, color:'rgb(20,20,43)', margin:0 }}>Bild zu Beitrag hinzufügen</h3>
                <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0' }}>
                  Wähle einen Beitrag aus dem Redaktionsplan — das Bild wird als Visual zugeordnet.
                  {activeBrandVoice ? ` Beiträge der BV: ${activeBrandVoice.name}.` : ''}
                </p>
              </div>
              <button onClick={() => setAttachModal(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-muted)' }}><X size={14} strokeWidth={1.75}/></button>
            </div>

            {/* Preview-Strip mit Mini-Bild des Visuals */}
            <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, padding:'10px 12px', background:'#F8FAFC', borderRadius:10, flexShrink:0 }}>
              {attachModal.signed_url && (
                <img src={attachModal.signed_url} alt="visual" style={{ width:48, height:48, objectFit:'cover', borderRadius:6, border:'1px solid var(--border)' }}/>
              )}
              <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4, flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, color:'var(--text-primary)', marginBottom:2 }}>Ausgewähltes Bild</div>
                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{attachModal.prompt}</div>
              </div>
            </div>

            {/* "Neuer Beitrag mit diesem Bild" — prominente Sekundär-Option */}
            <button onClick={() => createPostWithVisual(attachModal)}
              style={{
                width:'100%', padding:'12px 14px', marginBottom:10, borderRadius:10,
                border:'1.5px dashed ' + P, background:'rgba(49,90,231,0.04)',
                color: P, fontSize:13, fontWeight:700, cursor:'pointer',
                display:'flex', alignItems:'center', gap:8, justifyContent:'center', flexShrink:0,
              }}>
              Neuen Beitrag mit diesem Bild anlegen
            </button>

            {/* Separator */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexShrink:0 }}>
              <div style={{ flex:1, height:1, background:'var(--border)' }}/>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>oder zu bestehendem Beitrag</span>
              <div style={{ flex:1, height:1, background:'var(--border)' }}/>
            </div>

            {/* Search */}
            <input type="text" value={attachSearch} onChange={e => setAttachSearch(e.target.value)}
              placeholder="Beitrag suchen (Titel oder Content)…"
              style={{ padding:'9px 12px', border:'1.5px solid var(--border)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', marginBottom:10, flexShrink:0 }}/>

            {/* Confirm-Toast */}
            {attachConfirm && (
              <div style={{ marginBottom:10, padding:'10px 14px', background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:9, color:'#065F46', fontSize:13, fontWeight:600, flexShrink:0 }}>
                {attachConfirm}
              </div>
            )}

            {/* Posts-Liste (scrollable) */}
            <div style={{ overflowY:'auto', flex:1, minHeight:0, marginRight:-8, paddingRight:8 }}>
              {attachLoading && (
                <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Lade Beiträge…</div>
              )}
              {!attachLoading && filteredAttachPosts.length === 0 && (
                <div style={{ padding:'32px 20px', textAlign:'center', background:'var(--surface)', borderRadius:10, border:'1px dashed var(--border)', color:'var(--text-muted)', fontSize:13 }}>
                  {attachSearch.trim() ? 'Keine Beiträge mit diesem Suchbegriff.' : 'Keine offenen Beiträge gefunden. Erstelle einen Beitrag im Redaktionsplan.'}
                </div>
              )}
              {!attachLoading && filteredAttachPosts.map(p => {
                const isAlreadyAttached = p.visual_id === attachModal.id
                const hasOtherVisual    = p.visual_id && p.visual_id !== attachModal.id
                const statusLabels = { idee:'Idee', draft:'Entwurf', in_review:'Review', approved:'Approved', scheduled:'Geplant', failed:'Fehler' }
                return (
                  <button key={p.id} onClick={() => attachVisualToPost(p)}
                    disabled={isAlreadyAttached}
                    style={{
                      width:'100%', textAlign:'left', padding:'12px 14px', marginBottom:8, borderRadius:10,
                      border:'1.5px solid ' + (isAlreadyAttached ? '#6EE7B7' : 'var(--border)'),
                      background: isAlreadyAttached ? '#ECFDF5' : '#fff',
                      cursor: isAlreadyAttached ? 'default' : 'pointer',
                      display:'flex', gap:12, alignItems:'flex-start', transition:'all .12s',
                    }}
                    onMouseEnter={e => { if (!isAlreadyAttached) e.currentTarget.style.borderColor = P }}
                    onMouseLeave={e => { if (!isAlreadyAttached) e.currentTarget.style.borderColor = 'var(--border)' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', padding:'2px 8px', background:'#F1F5F9', borderRadius:6 }}>{statusLabels[p.status] || p.status}</span>
                        {p.scheduled_at && (
                          <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                            {new Date(p.scheduled_at).toLocaleDateString('de-DE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                          </span>
                        )}
                        {hasOtherVisual && (
                          <span style={{ fontSize:10, color:'#0891B2', background:'#CFFAFE', padding:'2px 6px', borderRadius:5, fontWeight:600 }} title="Wird als zusätzliches Carousel-Bild hinzugefügt">hat schon Bild(er)</span>
                        )}
                        {isAlreadyAttached && (
                          <span style={{ fontSize:10, color:'#065F46', background:'#D1FAE5', padding:'2px 6px', borderRadius:5, fontWeight:600 }}>Cover-Bild</span>
                        )}
                      </div>
                      <div style={{ fontSize:14, fontWeight:600, color:'rgb(20,20,43)', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {p.title || '(ohne Titel)'}
                      </div>
                      <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                        {p.content?.slice(0, 180) || '(kein Content)'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)', flexShrink:0 }}>
              <button onClick={() => setAttachModal(null)}
                style={{ padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Aspect-Ratio CSS-Helfer für Library-Grid
function aspectToCss(ar) {
  const map = {
    '1:1':'1/1', '3:2':'3/2', '2:3':'2/3', '4:3':'4/3', '3:4':'3/4',
    '5:4':'5/4', '4:5':'4/5', '21:9':'21/9', '16:9':'16/9', '9:16':'9/16',
    // Legacy
    '1.91:1':'1.91/1', '4:1':'4/1',
  }
  return map[ar] || '1/1'
}

// ─── Galerie-Karte ──────────────────────────────────────────────────────────
function GalleryCard({ v, onOpenStudio, onLightbox, onDownload, onToggleFav, onDelete }) {
  const [hover, setHover] = useState(false)
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'var(--surface)',
        border:'1px solid ' + (v.is_favorite ? '#F59E0B' : 'var(--border)'), boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
      <div onClick={onLightbox} style={{ cursor:'pointer', aspectRatio: aspectToCss(v.aspect_ratio), background:'#0b0b0b' }}>
        {v.signed_url
          ? <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:11 }}>Kein Bild</div>
        }
      </div>

      {/* Favorit (immer sichtbar) */}
      <button onClick={e => { e.stopPropagation(); onToggleFav() }}
        title={v.is_favorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
        style={{ position:'absolute', top:6, right:6, width:28, height:28, borderRadius:'50%', border:'none', background: v.is_favorite ? '#F59E0B' : 'rgba(0,0,0,0.5)', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 4px rgba(0,0,0,.3)' }}>
        <Star size={14} strokeWidth={1.75} fill={v.is_favorite ? 'currentColor' : 'none'}/>
      </button>

      {/* Hover-Overlay mit Aktionen */}
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:8, gap:6,
        background:'linear-gradient(0deg, rgba(0,0,0,0.72), rgba(0,0,0,0.05) 55%, transparent)',
        opacity: hover ? 1 : 0, transition:'opacity 0.15s', pointerEvents: hover ? 'auto' : 'none' }}>
        <div style={{ color:'#fff', fontSize:10.5, lineHeight:1.35, maxHeight:42, overflow:'hidden', marginBottom:2 }}>{v.prompt}</div>
        <button onClick={e => { e.stopPropagation(); onOpenStudio() }}
          style={{ padding:'7px 10px', borderRadius:8, border:'none', background:P, color:'#fff', fontSize:11.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
          <Pencil size={12} strokeWidth={1.9}/>In Content-Werkstatt öffnen
        </button>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={e => { e.stopPropagation(); onDownload() }} title="Herunterladen"
            style={{ flex:1, padding:'6px 10px', borderRadius:8, border:'none', background:'rgba(255,255,255,0.92)', color:'#111', fontSize:11.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5 }}>
            <Upload size={13} strokeWidth={1.9} style={{ transform:'rotate(180deg)' }}/>Download
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} title="Löschen"
            style={{ padding:'6px 10px', borderRadius:8, border:'none', background:'rgba(254,242,242,0.95)', color:'#b91c1c', fontSize:11.5, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
            <Trash2 size={13} strokeWidth={1.9}/>
          </button>
        </div>
      </div>
    </div>
  )
}
