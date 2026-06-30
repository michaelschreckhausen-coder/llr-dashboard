// Bibliothek — fasst Dokumente, Designs und Medien auf einer Seite zusammen.
// Drei Tabs:
//   • Dokumente → Documents (embedded)
//   • Designs   → eigene Galerie mit Chat-Auswahldialog (analog Dokumente)
//   • Medien    → Visuals (kind='image', inkl. Uploads)
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, LayoutTemplate, Image as ImageIcon, MessageSquare, X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import { listTeamVisuals, signedVisualUrl, listChatsForVisual, linkVisualToChat, createEmptyDesign } from '../lib/contentVisuals'
import Documents from './Documents'
import Visuals from './Visuals'

const P = 'var(--wl-primary, rgb(49,90,231))'

const TABS = [
  { id: 'dokumente', label: 'Dokumente', Icon: FileText },
  { id: 'designs',   label: 'Designs',   Icon: LayoutTemplate },
  { id: 'medien',    label: 'Medien',    Icon: ImageIcon },
]

export default function Bibliothek({ session }) {
  const [tab, setTab] = useState('dokumente')
  const [newKind, setNewKind] = useState(null)   // 'doc' | 'design' → öffnet Chat-Auswahl
  const [designsReloadKey, setDesignsReloadKey] = useState(0)

  return (
    <div style={{ width: '100%', maxWidth: 1200, margin: '0 auto', padding: '24px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 20, color: '#30A0D0', fontFamily: '"Caveat", cursive', fontWeight: 600, marginBottom: 6 }}>Content · Bibliothek</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2 }}>Deine Bibliothek.</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.6 }}>Dokumente, Designs und Medien an einem Ort.</p>
        </div>
        {tab !== 'medien' && (
          <button onClick={() => setNewKind(tab === 'designs' ? 'design' : 'doc')}
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: 'none',
              background: P, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(49,90,231,0.22)' }}>
            <Plus size={16} strokeWidth={2.4} />{tab === 'designs' ? 'Neues Design' : 'Neues Dokument'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '4px 0 18px', borderBottom: '1px solid var(--border,#E9ECF2)' }}>
        {TABS.map(t => {
          const on = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', border: 'none',
                borderBottom: '2px solid ' + (on ? P : 'transparent'), background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? 800 : 600, color: on ? P : 'var(--text-muted,#667085)', marginBottom: -1 }}>
              <t.Icon size={16} strokeWidth={on ? 2.2 : 1.9} />{t.label}
            </button>
          )
        })}
      </div>

      <div>
        {tab === 'dokumente' && <Documents embedded />}
        {tab === 'designs' && <DesignsTab reloadKey={designsReloadKey} />}
        {tab === 'medien' && <Visuals session={session} kindFilter="image" embedded />}
      </div>

      {newKind && (
        <NewArtifactDialog kind={newKind} onClose={() => setNewKind(null)}
          onCreatedDesign={() => setDesignsReloadKey(k => k + 1)} />
      )}
    </div>
  )
}

// ─── "Neues Dokument/Design" — Chat-Auswahl: bestehender Chat ODER ohne Chat ────
function NewArtifactDialog({ kind, onClose, onCreatedDesign }) {
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const isDesign = kind === 'design'

  useEffect(() => {
    let off = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase.from('content_chats')
        .select('id, title, updated_at').eq('brand_voice_id', activeBrandVoice?.id)
        .order('updated_at', { ascending: false }).limit(100)
      if (!off) { setChats(data || []); setLoading(false) }
    })()
    return () => { off = true }
  }, [activeBrandVoice?.id])

  // Design wird sofort als Zeile angelegt (braucht storage_path); Dokument deferred via ?newdoc=1.
  async function go(chatId) {
    if (busy) return
    setBusy(true)
    if (isDesign) {
      const { data: row, error } = await createEmptyDesign({ teamId: activeTeamId, brandVoiceId: activeBrandVoice?.id || null })
      if (error || !row) { setBusy(false); alert('Design konnte nicht erstellt werden.'); return }
      onCreatedDesign && onCreatedDesign()
      navigate(chatId ? `/content-studio?chat_id=${chatId}&visual=${row.id}` : `/content-studio?visual=${row.id}`)
    } else {
      navigate(chatId ? `/content-studio?chat_id=${chatId}&newdoc=1` : `/content-studio?newdoc=1`)
    }
  }

  const filtered = chats.filter(c => { const q = search.trim().toLowerCase(); return !q || (c.title || '').toLowerCase().includes(q) })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '92vw', maxHeight: '72vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(16,24,40,0.28)', overflow: 'hidden', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '16px 16px 6px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{isDesign ? 'Neues Design' : 'Neues Dokument'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>Mit welchem Chat möchtest du starten?</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'inline-flex', flexShrink: 0 }}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 14px' }}>
          <button onClick={() => go(null)} disabled={busy}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', marginBottom: 12 }}>
            {isDesign ? <LayoutTemplate size={15} strokeWidth={2} /> : <FileText size={15} strokeWidth={2} />}Ohne Chat öffnen
          </button>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-soft,#98a2b3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 2px 6px' }}>Mit bestehendem Chat</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chats durchsuchen…"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 11px', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', marginBottom: 8 }} />
          {loading ? (
            <div style={{ padding: 14, fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>Lädt…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>Keine Chats für diese Brand.</div>
          ) : filtered.map(c => (
            <button key={c.id} onClick={() => go(c.id)} disabled={busy}
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(49,90,231,0.07)', color: P }}><MessageSquare size={15} strokeWidth={1.9} /></span>
              <span style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Unbenannter Chat'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Designs-Galerie mit Chat-Auswahldialog (analog Dokumente) ───────────────
function DesignsTab({ reloadKey = 0 } = {}) {
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const [designs, setDesigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [choose, setChoose] = useState(null)        // Design, das geöffnet wird
  const [chats, setChats] = useState([])
  const [chatsLoading, setChatsLoading] = useState(false)
  const [showOther, setShowOther] = useState(false)
  const [brandChats, setBrandChats] = useState([])
  const [chatSearch, setChatSearch] = useState('')

  const load = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true)
    const { data } = await listTeamVisuals({ teamId: activeTeamId, brandVoiceId: activeBrandVoice?.id, kind: 'design', limit: 100 })
    const withUrls = await Promise.all((data || []).map(async (v) => ({ ...v, signed_url: await signedVisualUrl(v.storage_path, 3600) })))
    setDesigns(withUrls); setLoading(false)
  }, [activeTeamId, activeBrandVoice?.id])
  useEffect(() => { load() }, [load, reloadKey])

  async function openDesign(d) {
    setChoose(d); setShowOther(false); setChatSearch(''); setBrandChats([]); setChatsLoading(true)
    const { data } = await listChatsForVisual(d.id)
    setChats(data || []); setChatsLoading(false)
  }
  async function openWith(chatId) {
    if (!choose) return
    try { await linkVisualToChat(choose.id, chatId) } catch (_e) {}
    navigate(`/content-studio?chat_id=${chatId}&visual=${choose.id}`)
  }
  function openWithoutChat() {
    if (!choose) return
    navigate(`/content-studio?visual=${choose.id}`)
  }
  async function loadBrandChats() {
    setShowOther(true)
    const { data } = await supabase.from('content_chats')
      .select('id, title, updated_at').eq('brand_voice_id', activeBrandVoice?.id)
      .order('updated_at', { ascending: false }).limit(100)
    setBrandChats(data || [])
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Deine Designs</div>
      {loading ? (
        <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>Lädt…</div>
      ) : designs.length === 0 ? (
        <div style={{ border: '1px dashed var(--border,#E9ECF2)', borderRadius: 12, padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Noch keine Designs. Öffne ein Bild in der Content-Werkstatt, um daraus ein Design zu machen.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {designs.map(d => (
            <button key={d.id} onClick={() => openDesign(d)} title={d.title || 'Design'}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 0, border: '1px solid var(--border,#E9ECF2)', borderRadius: 12, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden', textAlign: 'left' }}>
              <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#f4f6fa center/cover no-repeat' + (d.signed_url ? ` url(${d.signed_url})` : '') }} />
              <div style={{ padding: '8px 10px 10px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.title || 'Design'}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Chat-Auswahldialog — mit welchem Chat soll das Design geöffnet werden? */}
      {choose && (
        <div onClick={() => setChoose(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '92vw', maxHeight: '72vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(16,24,40,0.28)', overflow: 'hidden', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '16px 16px 6px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Mit welchem Chat öffnen?</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{choose.title || 'Design'}</div>
              </div>
              <button onClick={() => setChoose(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'inline-flex', flexShrink: 0 }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 14px' }}>
              {chatsLoading ? (
                <div style={{ padding: 14, fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>Lädt…</div>
              ) : (
                <>
                  {chats.length > 0 && !showOther && (
                    <>
                      <button onClick={() => openWith(chats[0].id)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderRadius: 10, border: 'none', background: P, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
                        <MessageSquare size={15} strokeWidth={2} /><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Zuletzt bearbeitender Chat · {chats[0].title || 'Chat'}</span>
                      </button>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-soft,#98a2b3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 2px 6px' }}>Zugeordnete Chats</div>
                      {chats.map(c => (
                        <button key={c.id} onClick={() => openWith(c.id)}
                          style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(49,90,231,0.07)', color: P }}><MessageSquare size={15} strokeWidth={1.9} /></span>
                          <span style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Unbenannter Chat'}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {chats.length === 0 && !showOther && (
                    <div style={{ padding: '4px 4px 12px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>Dieses Design ist noch keinem Chat zugeordnet.</div>
                  )}

                  {showOther && (
                    <>
                      <input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Chats durchsuchen…" autoFocus
                        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 11px', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', marginBottom: 8 }} />
                      {brandChats.filter(c => { const q = chatSearch.trim().toLowerCase(); return !q || (c.title || '').toLowerCase().includes(q) }).map(c => (
                        <button key={c.id} onClick={() => openWith(c.id)}
                          style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(49,90,231,0.07)', color: P }}><MessageSquare size={15} strokeWidth={1.9} /></span>
                          <span style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Unbenannter Chat'}</span>
                        </button>
                      ))}
                      {brandChats.length === 0 && <div style={{ padding: 12, fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>Keine Chats für diese Brand.</div>}
                    </>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {!showOther && (
                      <button onClick={loadBrandChats}
                        style={{ width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: P, fontFamily: 'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(49,90,231,0.07)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        + Anderen Chat wählen…
                      </button>
                    )}
                    {showOther && (
                      <button onClick={() => setShowOther(false)}
                        style={{ width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        ← Zurück
                      </button>
                    )}
                    <button onClick={openWithoutChat}
                      style={{ width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'inherit' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F4F6FA'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      Ohne Chat öffnen
                    </button>
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
