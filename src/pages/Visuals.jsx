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
import { BarChart3, BookOpen, Calendar, Camera, Check, CheckCircle2, Eye, FileText, Image as ImageIcon, Lightbulb, Loader2, MessageSquare, Pencil, Pin, Plus, Repeat, Search, Sparkles, Target, Trash2, UserCircle2, Wand2, X, XCircle, Zap, Shuffle, Star } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sharedBrandVoiceIds, scopeContentByTeamOrSharedBV } from '../lib/teamShares'
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
  const [uploadingRef, setUploadingRef] = useState(false)
  const [useBVRefs, setUseBVRefs]      = useState(true)
  const [generating, setGenerating]    = useState(false)
  const [error, setError]              = useState('')
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
        .select('id, title, content, brand_voice_id')
        .eq('id', post_id).maybeSingle()
      if (!p) return
      setLinkedPost(p)
      // Modus auf 'post' setzen + Default-Template realistic
      setMode('post')
      setActiveTemplateId('realistic')
      const seed = [p.title, p.content].filter(Boolean).join('\n\n').trim()
      setPostText(seed)
    })()
  }, [searchParams])

  // ?edit=<visual_id> aus URL: Edit-Modal automatisch öffnen
  // (z.B. aus dem PostModal-Hover „Bild bearbeiten" Button)
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    ;(async () => {
      const { data: v, error } = await supabase.from('visuals').select('*').eq('id', editId).maybeSingle()
      if (error || !v) { console.warn('[visuals-edit-param]', error); return }
      const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24)
      setEditModal({ ...v, signed_url: signed?.signedUrl || null })
      setEditPrompt('')
      setEditAspect(v.aspect_ratio || '1:1')
      // Param wieder entfernen damit Reload nicht erneut öffnet
      const next = new URLSearchParams(searchParams)
      next.delete('edit')
      setSearchParams(next, { replace: true })
    })()
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
    setError('')
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
          if (fnErr) throw fnErr
          if (data?.error) throw new Error(data.error)
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
        if (fnErr) throw fnErr
        if (data?.error) throw new Error(data.error)
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
      if (fnErr) throw fnErr
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
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Visuals</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Bilder.</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
          KI-Bilder im Markenstil — automatisch passend zu Brand Voice und Format.
        </p>
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

      {/* Generator-Card */}
      <section style={{
        background:'var(--surface,#fff)', borderRadius:14, border:'1px solid var(--border,#E5E7EB)',
        padding:'18px 20px', marginBottom:24, boxShadow:'0 1px 3px rgba(15,23,42,.04)'
      }}>

        {/* ── 0) Mode-Switch: Bild zu Beitrag vs Eigenstaendig ────────── */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', gap:6, padding:5, background:'#F1F5F9', borderRadius:12, alignSelf:'flex-start', width:'fit-content' }}>
            {[
              { id: 'post',       label: 'Bild zu Beitrag', desc: 'Bild passend zu einem Beitragstext', icon: <Pin size={16} strokeWidth={1.75} /> },
              { id: 'standalone', label: 'Freihand',  desc: 'Bild ohne Beitragsbezug', icon: <ImageIcon size={16} strokeWidth={1.75} /> },
            ].map(m => {
              const isActive = m.id === mode
              return (
                <button key={m.id} type="button" onClick={() => setMode(m.id)}
                  title={m.desc}
                  style={{
                    padding:'8px 16px', borderRadius:9, border:'none', fontSize:13, fontWeight:700, cursor:'pointer',
                    background: isActive ? 'var(--surface)' : 'transparent',
                    color: isActive ? P : '#64748B',
                    boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    transition:'all 0.15s',
                  }}>
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Beitragstext-Feld (nur im Post-Modus) ─────────────────────── */}
        {mode === 'post' && (
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>
              Beitragstext
            </label>
            <textarea
              value={postText}
              onChange={e => setPostText(e.target.value)}
              placeholder="Beitragstext einfuegen oder vom Redaktionsplan vorbefuellt lassen"
              rows={4}
              style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--border,#E5E7EB)', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', resize:'vertical', outline:'none' }}/>
          </div>
        )}

        {/* ── 1) Template-Strip ───────────────────────────────────────────── */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:8 }}>
            {mode === 'post' ? 'Bild-Stil' : 'Vorlage'}
          </label>
          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4, scrollbarWidth:'thin' }}>
            {TEMPLATES.map(t => {
              const isActive = t.id === activeTemplateId
              return (
                <button key={t.id} onClick={() => setActiveTemplateId(t.id)}
                  title={t.desc}
                  style={{
                    flexShrink:0, minWidth:108, padding:'10px 12px', borderRadius:10,
                    border:'1.5px solid ' + (isActive ? P : 'var(--border,#E5E7EB)'),
                    background: isActive ? 'rgba(49,90,231,0.06)' : '#fff',
                    color: isActive ? P : 'var(--text-primary)',
                    cursor:'pointer', textAlign:'center',
                    transition:'all .15s', display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                  }}>
                  <span style={{ fontSize:18 }}>{t.icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, lineHeight:1.2, whiteSpace:'nowrap' }}>{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── 2) Eingabe-Card (switched per Template) ─────────────────────── */}
        <div style={{ marginBottom:14 }}>
          {activeTemplate.id === 'freetext' ? (
            <textarea
              value={templateFields.freetext || ''}
              onChange={e => setTemplateFields(p => ({ ...p, freetext: e.target.value }))}
              placeholder="z.B. Frau am Schreibtisch, denkt nach, warmes Licht von links, moderner Büro-Hintergrund"
              rows={3}
              style={{
                width:'100%', padding:'12px 14px', borderRadius:10,
                border:'1.5px solid var(--border,#E5E7EB)', fontSize:14,
                resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit',
              }}
            />
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:10 }}>
              {activeTemplate.fields.map(f => (
                <div key={f.name}>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:5 }}>
                    {f.label}{f.required ? ' *' : ''}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea value={templateFields[f.name] || ''}
                      onChange={e => setTemplateFields(p => ({ ...p, [f.name]: e.target.value }))}
                      placeholder={f.placeholder} rows={f.rows || 2}
                      style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--border,#E5E7EB)', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', resize:'vertical', outline:'none' }}/>
                  ) : (
                    <input value={templateFields[f.name] || ''}
                      onChange={e => setTemplateFields(p => ({ ...p, [f.name]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--border,#E5E7EB)', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}/>
                  )}
                </div>
              ))}
              {/* Sub-Style-Picker fuer Post-Image-Template */}
              {activeTemplate.isPostImage && (
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:8 }}>
                    Bild-Stil
                  </label>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {POST_IMAGE_STYLES.map(st => {
                      const isActive = (templateFields.style || 'realistic') === st.id
                      return (
                        <button key={st.id} type="button"
                          onClick={() => setTemplateFields(p => ({ ...p, style: st.id }))}
                          title={st.desc}
                          style={{
                            display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                            padding:'10px 14px', borderRadius:10, cursor:'pointer',
                            background: isActive ? 'rgba(49,90,231,0.06)' : '#fff',
                            border: '1.5px solid ' + (isActive ? P : 'var(--border,#E5E7EB)'),
                            fontFamily:'inherit', minWidth:110,
                          }}>
                          <span style={{ fontSize:20, lineHeight:1 }}>{st.icon}</span>
                          <span style={{ fontSize:11, fontWeight:700, color: isActive ? P : 'var(--text-primary)' }}>{st.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 3) Referenz-Zeile: BV-Toggle + Custom-Pile ──────────────────── */}
        <div style={{ marginBottom:16, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          {/* BV-Refs Toggle */}
          <button onClick={() => setUseBVRefs(!useBVRefs)}
            disabled={!activeBrandVoice}
            title={activeBrandVoice ? 'Brand-Voice-Referenzbilder (Personen + CI) automatisch verwenden' : 'Aktiviere eine Brand Voice in der Topbar'}
            style={{
              display:'inline-flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10,
              border:'1.5px solid ' + (useBVRefs && activeBrandVoice ? P : 'var(--border,#E5E7EB)'),
              background: useBVRefs && activeBrandVoice ? 'rgba(49,90,231,0.06)' : '#fff',
              color: !activeBrandVoice ? 'var(--text-muted)' : (useBVRefs ? P : 'var(--text-primary)'),
              cursor: activeBrandVoice ? 'pointer' : 'not-allowed', fontSize:12, fontWeight:600,
              opacity: activeBrandVoice ? 1 : 0.5,
            }}>
            <span style={{
              display:'inline-block', width:30, height:18, borderRadius:10, position:'relative',
              background: useBVRefs && activeBrandVoice ? P : '#CBD5E1', transition:'background .15s',
            }}>
              <span style={{
                position:'absolute', top:2, left: useBVRefs && activeBrandVoice ? 14 : 2,
                width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left .15s',
                boxShadow:'0 1px 2px rgba(0,0,0,.2)',
              }}/>
            </span>
            <span>Brand-Voice-Bilder verwenden</span>
          </button>

          {/* Company Brands (Ambassador) — CI der Unternehmen zusätzlich nutzen, Mehrfachauswahl */}
          {companyVoices.length > 0 && activeBrandVoice?.account_type !== 'company_page' && (
            <CompanyMultiSelect companies={companyVoices} value={companyVoiceIds} onChange={setCompanyVoiceIds} />
          )}

          {/* Custom References */}
          <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:200 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              Zusätzlich:
            </span>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
              {referenceFiles.map((r, i) => (
                <div key={i} style={{ position:'relative', width:42, height:42 }}>
                  <img src={r.previewUrl} alt="ref" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:6, border:'1px solid var(--border)' }}/>
                  <button type="button" onClick={() => removeReference(i)}
                    style={{ position:'absolute', top:-5, right:-5, width:16, height:16, borderRadius:'50%', border:'none', background:'#ef4444', color:'#fff', fontSize:9, fontWeight:700, cursor:'pointer', lineHeight:1 }}><X size={14} strokeWidth={1.75}/></button>
                </div>
              ))}
              {referenceFiles.length < 8 && (
                <label style={{ width:42, height:42, borderRadius:6, border:'1.5px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor: uploadingRef ? 'wait' : 'pointer', fontSize:14, color:'var(--text-muted)', background:'#FAFAFA' }}>
                  {uploadingRef ? <Loader2 size={16} className="lk-spin" /> : <Plus size={16} />}
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => addReferenceFiles(e.target.files)} style={{ display:'none' }}/>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom:14, padding:'10px 14px', background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)', borderRadius:10, color:'#b91c1c', fontSize:13 }}>
            {error}
          </div>
        )}

        {/* ── 4) Action-Row: Format · Anzahl · Modell · Generate ──────────── */}
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {/* Format */}
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Format</span>
            <FormatPicker value={formatPreset} onChange={handleFormatChange} />
          </div>

          {/* Anzahl */}
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {activeTemplate.isCarousel ? 'Slides' : 'Anzahl'}
            </span>
            <select value={variants} onChange={e => setVariants(parseInt(e.target.value, 10))}
              style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid var(--border,#E5E7EB)', fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer', minWidth:80 }}>
              {(activeTemplate.isCarousel ? [2,3,4,5,6,7,8,9,10] : [1,2,3,4]).map(n => (
                <option key={n} value={n}>{n}{activeTemplate.isCarousel ? ' Slides' : (n === 1 ? ' Bild' : ' Bilder')}</option>
              ))}
            </select>
          </div>

          {/* Modell */}
          <div style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 220px', minWidth:220 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Modell</span>
            <select value={modelValue} onChange={e => setModelValue(e.target.value)}
              style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid var(--border,#E5E7EB)', fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer', width:'100%' }}>
              <optgroup label="OpenAI">
                {MODELS.filter(m => m.provider === 'OpenAI').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </optgroup>
              <optgroup label="Google Gemini">
                {MODELS.filter(m => m.provider === 'Google').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </optgroup>
            </select>
          </div>

          {/* Generate-Button */}
          <div style={{ display:'flex', flexDirection:'column', gap:3, alignItems:'stretch' }}>
            <span style={{ fontSize:10, fontWeight:700, color:'transparent' }}>·</span>
            <button onClick={generate} disabled={!canGenerate}
              style={{
                padding:'9px 22px', borderRadius:8, border:'none',
                background: !canGenerate ? '#94A3B8' : P,
                color:'#fff', fontSize:13, fontWeight:700,
                cursor: !canGenerate ? 'not-allowed' : 'pointer',
                boxShadow: generating ? 'none' : '0 2px 10px rgba(49,90,231,.25)',
                display:'inline-flex', alignItems:'center', gap:6,
              }}>
              <span style={{ display:'inline-flex' }}>{generating ? <Loader2 size={14} className="lk-spin" /> : <Wand2 size={14} />}</span>
              <span>{generating ? 'Generiere…' : 'Generieren'}</span>
            </button>
          </div>
        </div>

        {modelValue.endsWith('|high') && (
          <div style={{ marginTop:8, fontSize:11, color:'var(--text-muted)' }}>
            Premium-Generation kann bis 90s dauern.
          </div>
        )}
      </section>

      {/* Lade-Animation während der Generierung */}
      {generating && <GenerationLoading premium={modelValue.endsWith('|high')} />}

      {/* Letzte Generation */}
      {results.length > 0 && (
        <section style={{ marginBottom:24 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', margin:'0 0 12px' }}>
            Eben generiert
          </h3>
          {/* Quick-Toast wenn an linkedPost angeheftet wurde */}
          {linkedPostId && attachConfirm && !attachModal && (
            <div style={{ padding:'10px 14px', marginBottom:12, borderRadius:10, background:'#F0FDF4', border:'1px solid #BBF7D0', color:'#166534', fontSize:13, fontWeight:600 }}>
              {attachConfirm}
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.min(results.length, 4)}, 1fr)`, gap:12 }}>
            {results.map(v => (
              <ResultCard key={v.id} v={v}
                attachLabel={linkedPostId ? 'Diesem Beitrag hinzufügen' : undefined}
                onLightbox={() => setLightbox(v)}
                onDownload={() => downloadImage(v)}
                onEdit={() => { setEditModal(v); setEditPrompt(''); setEditAspect(v.aspect_ratio || '1:1'); setEditModelValue(modelValue) }}
                onAttachToPost={() => linkedPostId ? quickAttachToLinkedPost(v) : openAttachModal(v)} />
            ))}
          </div>
        </section>
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
            Noch keine Bilder. Generiere oben dein erstes Visual.
          </div>
        )}
        {!libLoading && library.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:12 }}>
            {library.map(v => (
              <div key={v.id} onClick={() => setLightbox(v)}
                style={{
                  position:'relative', borderRadius:10, overflow:'hidden', background:'var(--surface)',
                  border:'1px solid ' + (v.is_favorite ? '#F59E0B' : 'var(--border)'),
                  cursor:'pointer',
                  aspectRatio: aspectToCss(v.aspect_ratio),
                }}>
                {v.signed_url
                  ? <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                  : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:11 }}>Kein Bild</div>
                }
                <button onClick={e => { e.stopPropagation(); toggleFavorite(v.id, v.is_favorite) }}
                  title={v.is_favorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
                  style={{ position:'absolute', top:6, right:6, width:28, height:28, borderRadius:'50%', border:'none', background: v.is_favorite ? '#F59E0B' : 'rgba(0,0,0,0.5)', color:'#fff', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, boxShadow:'0 1px 4px rgba(0,0,0,.3)' }}>
                  <Star size={14} strokeWidth={1.75} fill={v.is_favorite ? 'currentColor' : 'none'}/>
                </button>
                <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'6px 8px', background:'linear-gradient(0deg, rgba(0,0,0,0.6), transparent)', color:'#fff', fontSize:10, lineHeight:1.3, maxHeight:42, overflow:'hidden' }}>
                  {v.prompt}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Lightbox */}
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
              <button onClick={() => { setEditModal(lightbox); setEditPrompt(''); setEditAspect(lightbox.aspect_ratio || '1:1'); setEditModelValue(modelValue); setLightbox(null) }} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}><Pencil size={12} strokeWidth={1.75} style={{ marginRight:6 }} />Bearbeiten</button>
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

      {/* Edit-Modal */}
      {editModal && (
        <div onClick={e => e.target === e.currentTarget && setEditModal(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:100 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:680, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <h3 style={{ fontSize:18, fontWeight:700, color:'rgb(20,20,43)', margin:0 }}>Bild bearbeiten</h3>
                <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0' }}>Beschreibe was geändert werden soll — das KI-Modell editiert das Original mit deinem Prompt.</p>
              </div>
              <button onClick={() => setEditModal(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text-muted)' }}><X size={14} strokeWidth={1.75}/></button>
            </div>
            {editModal.signed_url && (
              <img src={editModal.signed_url} alt={editModal.prompt} style={{ width:'100%', maxHeight:280, objectFit:'contain', borderRadius:10, marginBottom:14, background:'#F8FAFC' }}/>
            )}
            <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:5 }}>Aspect-Ratio</label>
            <select value={editAspect} onChange={e => setEditAspect(e.target.value)}
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, marginBottom:12, background:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
              {ASPECT_RATIOS.map(ar => (
                <option key={ar.id} value={ar.id}>{ar.label} · {ar.desc}{ar.id === editModal.aspect_ratio ? ' (Original)' : ''}</option>
              ))}
            </select>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:5 }}>Was soll geändert werden?</label>
            <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} rows={3}
              placeholder='z.B. "ändere Hintergrund zu einer Konferenz-Bühne" oder "füge eine Brille hinzu"'
              style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:9, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', resize:'vertical', outline:'none' }}/>
            {/* Modell-Selector + Action-Buttons */}
            <div style={{ display:'flex', gap:8, alignItems:'flex-end', marginTop:14, flexWrap:'wrap' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:3, flex:'1 1 200px', minWidth:180 }}>
                <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Modell für die Bearbeitung</span>
                <select value={editModelValue} onChange={e => setEditModelValue(e.target.value)}
                  style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer', width:'100%' }}>
                  <optgroup label="OpenAI">
                    {MODELS.filter(m => m.provider === 'OpenAI').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </optgroup>
                  <optgroup label="Google Gemini">
                    {MODELS.filter(m => m.provider === 'Google').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </optgroup>
                </select>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <button onClick={() => setEditModal(null)}
                  style={{ padding:'9px 16px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                  Abbrechen
                </button>
                <button onClick={editVisual} disabled={editing || (!editPrompt.trim() && editAspect === editModal.aspect_ratio)}
                  style={{ padding:'9px 16px', borderRadius:8, border:'none', background: editing || (!editPrompt.trim() && editAspect === editModal.aspect_ratio) ? '#CBD5E1' : P, color:'#fff', cursor: editing || (!editPrompt.trim() && editAspect === editModal.aspect_ratio) ? 'wait' : 'pointer', fontSize:13, fontWeight:700 }}>
                  {editing ? 'Bearbeite…' : 'Bearbeiten'}
                </button>
              </div>
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

function ResultCard({ v, onLightbox, onDownload, onEdit, onAttachToPost, attachLabel }) {
  return (
    <div style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'var(--surface)', border:'1px solid var(--border)', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
      <div onClick={onLightbox} style={{ cursor:'pointer', aspectRatio: aspectToCss(v.aspect_ratio) }}>
        {v.signed_url
          ? <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:11 }}>Kein Bild</div>
        }
      </div>
      <div style={{ padding:8, display:'flex', flexDirection:'column', gap:6 }}>
        {onAttachToPost && (
          <button onClick={onAttachToPost}
            style={{ padding:'6px 10px', borderRadius:7, border:'none', background:'var(--wl-primary, rgb(49,90,231))', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:4 }}>
            {attachLabel || 'Zu Beitrag'}
          </button>
        )}
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={onDownload}
            style={{ flex:1, padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
            ⬇ Download
          </button>
          {onEdit && (
            <button onClick={onEdit} title="Bearbeiten"
              style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
              <Pencil size={14} strokeWidth={1.75} />
            </button>
          )}
          <button onClick={onLightbox} title="Vollbild"
            style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
            <Search size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  )
}
