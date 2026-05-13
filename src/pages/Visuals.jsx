// src/pages/Visuals.jsx
// Content-Visuals-Werkstatt — Gemini 2.5 Flash Image ("Nano Banana") Integration.
// Generator (oben) + Library-Grid (unten).
//
// Brand-Visual-DNA wird automatisch aus der aktiven Brand Voice gezogen.

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const ASPECT_RATIOS = [
  { id: '1:1',    label: '⬜ Feed',          desc: 'Quadratisch — Standard LinkedIn-Feed', dim: 1024, w: 80, h: 80 },
  { id: '4:5',    label: '📱 Mobile-Hoch',   desc: 'Portrait — auf Handy dominant',         dim: 1024, w: 64, h: 80 },
  { id: '1.91:1', label: '🖼️ Link-Vorschau', desc: 'Quer — fuer Link-Posts',                dim: 1024, w: 96, h: 50 },
  { id: '4:1',    label: '📰 Banner',         desc: 'Breit — fuer Profil oder Newsletter',  dim: 1024, w: 120, h: 30 },
]

const P = 'var(--wl-primary, rgb(49,90,231))'

export default function Visuals({ session }) {
  const { activeTeamId } = useTeam()

  // Generator-State
  const [prompt, setPrompt]           = useState('')
  const [aspectRatio, setAspect]      = useState('1:1')
  const [variants, setVariants]       = useState(2)
  const [brandVoices, setBrandVoices] = useState([])
  const [selectedBV, setSelectedBV]   = useState(null)
  const [generating, setGenerating]   = useState(false)
  const [error, setError]             = useState('')
  const [results, setResults]         = useState([])  // last generation

  // Library-State
  const [library, setLibrary]         = useState([])
  const [libLoading, setLibLoading]   = useState(true)
  const [lightbox, setLightbox]       = useState(null)

  // Brand Voices laden
  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from('brand_voices')
      .select('id, name, is_active, visual_style_description, visual_color_palette, visual_keywords')
      .order('is_active', { ascending: false })
      .then(({ data }) => {
        setBrandVoices(data || [])
        const active = (data || []).find(bv => bv.is_active)
        if (active) setSelectedBV(active.id)
      })
  }, [session?.user?.id])

  // Library laden
  async function loadLibrary() {
    setLibLoading(true)
    const { data } = await supabase.from('visuals')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(60)
    // Signed-URLs in einem Rutsch
    const withUrls = await Promise.all((data || []).map(async (v) => {
      const { data: signed } = await supabase.storage.from('visuals').createSignedUrl(v.storage_path, 60 * 60 * 24)
      return { ...v, signed_url: signed?.signedUrl || null }
    }))
    setLibrary(withUrls)
    setLibLoading(false)
  }
  useEffect(() => { if (activeTeamId) loadLibrary() }, [activeTeamId])

  async function generate() {
    if (!prompt.trim()) { setError('Bitte einen Prompt eingeben.'); return }
    setError(''); setGenerating(true); setResults([])
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-image', {
        body: {
          prompt: prompt.trim(),
          aspectRatio,
          variants,
          brandVoiceId: selectedBV,
        }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setResults(data?.visuals || [])
      // Library im Hintergrund neu laden
      loadLibrary()
    } catch (e) {
      setError('Fehler: ' + (e.message || 'Generierung fehlgeschlagen'))
    } finally {
      setGenerating(false)
    }
  }

  function downloadImage(url, filename = 'visual.png') {
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
  }

  async function archiveVisual(id) {
    await supabase.from('visuals').update({ is_archived: true }).eq('id', id)
    setLibrary(prev => prev.filter(v => v.id !== id))
  }

  const creditsPerImage = 39
  const totalCredits = variants * creditsPerImage

  return (
    <div style={{ width:'100%', maxWidth:1100, margin:'0 auto', padding:'24px 16px 40px' }}>
      {/* Journal-Style-Header */}
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:20, color:'#30A0D0', fontFamily:'"Caveat", cursive', fontWeight:600, marginBottom:6 }}>Content · Visuals</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, letterSpacing:'-0.3px', lineHeight:1.2 }}>Deine Bilder.</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.6 }}>
          KI-Bilder im Markenstil — automatisch passend zu Brand Voice und LinkedIn-Format.
        </p>
      </div>

      {/* Generator-Card */}
      <section style={{
        background:'var(--surface,#fff)', borderRadius:14, border:'1px solid var(--border,#E5E7EB)',
        padding:'18px 20px', marginBottom:24, boxShadow:'0 1px 3px rgba(15,23,42,.04)'
      }}>
        <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', margin:'0 0 14px' }}>
          🪄 Neues Bild generieren
        </h3>

        {/* Prompt */}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="z.B. Frau am Schreibtisch, denkt nach, warmes Licht von links, moderner Büro-Hintergrund"
          rows={3}
          style={{
            width:'100%', padding:'12px 14px', borderRadius:10,
            border:'1.5px solid var(--border,#E5E7EB)', fontSize:14,
            resize:'vertical', outline:'none', boxSizing:'border-box',
            fontFamily:'inherit', marginBottom:14,
          }}
        />

        {/* Brand Voice + Aspect Ratio + Variants */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Brand Voice (für Stil)</label>
            <select value={selectedBV || ''} onChange={e => setSelectedBV(e.target.value || null)}
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid var(--border,#E5E7EB)', fontSize:13, background:'#fff', cursor:'pointer' }}>
              <option value="">— Ohne Brand-Stil —</option>
              {brandVoices.map(bv => (
                <option key={bv.id} value={bv.id}>{bv.name}{bv.is_active ? ' (aktiv)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Varianten</label>
            <input type="range" min={1} max={4} value={variants} onChange={e => setVariants(parseInt(e.target.value, 10))}
              style={{ width:'100%' }}/>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
              {variants} {variants === 1 ? 'Variante' : 'Varianten'} = {totalCredits} Credits
            </div>
          </div>
        </div>

        {/* Aspect-Ratio Chips */}
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>LinkedIn-Format</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {ASPECT_RATIOS.map(ar => (
              <button key={ar.id} onClick={() => setAspect(ar.id)}
                style={{
                  padding:'8px 14px', borderRadius:10, fontSize:13, fontWeight:600,
                  border: '1.5px solid ' + (aspectRatio === ar.id ? P : 'var(--border,#E5E7EB)'),
                  background: aspectRatio === ar.id ? 'rgba(49,90,231,0.07)' : '#fff',
                  color: aspectRatio === ar.id ? P : 'var(--text-muted)',
                  cursor:'pointer', display:'flex', alignItems:'center', gap:8,
                  transition:'all .15s',
                }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', textAlign:'left' }}>
                  <span>{ar.label}</span>
                  <span style={{ fontSize:10, opacity:.7, fontWeight:500, marginTop:1 }}>{ar.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)', borderRadius:10, color:'#b91c1c', fontSize:13 }}>
            {error}
          </div>
        )}

        {/* Generate Button */}
        <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
          <button onClick={generate} disabled={generating || !prompt.trim()}
            style={{
              padding:'12px 28px', borderRadius:10, border:'none',
              background: generating || !prompt.trim() ? '#94A3B8' : P,
              color:'#fff', fontSize:14, fontWeight:700, cursor: generating || !prompt.trim() ? 'not-allowed' : 'pointer',
              boxShadow: generating ? 'none' : '0 2px 10px rgba(49,90,231,.25)',
              display:'inline-flex', alignItems:'center', gap:8,
            }}>
            <span>{generating ? '⏳' : '🪄'}</span>
            <span>{generating ? `Generiere ${variants} ${variants === 1 ? 'Bild' : 'Bilder'}…` : `Generieren (${totalCredits} Credits)`}</span>
          </button>
        </div>
      </section>

      {/* Letzte Generation — Resultate */}
      {results.length > 0 && (
        <section style={{ marginBottom:24 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', margin:'0 0 12px' }}>
            ✨ Eben generiert
          </h3>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.min(results.length, 4)}, 1fr)`, gap:12 }}>
            {results.map(v => (
              <ResultCard key={v.id} v={v} onLightbox={() => setLightbox(v)} onDownload={() => downloadImage(v.signed_url, `${v.id}.png`)} />
            ))}
          </div>
        </section>
      )}

      {/* Library-Grid */}
      <section>
        <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', margin:'0 0 12px' }}>
          📚 Bibliothek
        </h3>
        {libLoading && (
          <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Lade…</div>
        )}
        {!libLoading && library.length === 0 && (
          <div style={{ padding:'40px 20px', textAlign:'center', background:'var(--surface)', borderRadius:14, border:'1px dashed var(--border)', color:'var(--text-muted)', fontSize:13 }}>
            Noch keine Bilder. Generiere oben dein erstes Visual.
          </div>
        )}
        {!libLoading && library.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:12 }}>
            {library.map(v => (
              <div key={v.id} onClick={() => setLightbox(v)}
                style={{ position:'relative', borderRadius:10, overflow:'hidden', background:'var(--surface)', border:'1px solid var(--border)', cursor:'pointer', aspectRatio: v.aspect_ratio === '1.91:1' ? '1.91/1' : v.aspect_ratio === '4:5' ? '4/5' : v.aspect_ratio === '4:1' ? '4/1' : '1/1' }}>
                {v.signed_url
                  ? <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                  : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:11 }}>Kein Bild</div>
                }
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
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{lightbox.aspect_ratio} · {lightbox.model}</span>
              <span style={{ flex:1 }}/>
              <button onClick={() => downloadImage(lightbox.signed_url, `${lightbox.id}.png`)} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}>⬇ Download</button>
              <button onClick={() => { archiveVisual(lightbox.id); setLightbox(null) }} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#b91c1c', cursor:'pointer', fontSize:12, fontWeight:600 }}>🗑️ Löschen</button>
              <button onClick={() => setLightbox(null)} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--text-muted)' }}>✕</button>
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
    </div>
  )
}

function ResultCard({ v, onLightbox, onDownload }) {
  const ratio = v.aspect_ratio === '1.91:1' ? '1.91/1' : v.aspect_ratio === '4:5' ? '4/5' : v.aspect_ratio === '4:1' ? '4/1' : '1/1'
  return (
    <div style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'var(--surface)', border:'1px solid var(--border)', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
      <div onClick={onLightbox} style={{ cursor:'pointer', aspectRatio: ratio }}>
        {v.signed_url
          ? <img src={v.signed_url} alt={v.prompt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:11 }}>Kein Bild</div>
        }
      </div>
      <div style={{ padding:8, display:'flex', gap:6 }}>
        <button onClick={onDownload}
          style={{ flex:1, padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
          ⬇ Download
        </button>
        <button onClick={onLightbox}
          style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
          🔍
        </button>
      </div>
    </div>
  )
}
