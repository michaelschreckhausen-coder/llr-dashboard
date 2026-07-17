import React, { useEffect, useState } from 'react'
import { Brain, Plus, Trash2, Pencil, Check, X, Sparkles, MessageSquare, User as UserIcon, Bot } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useBrandVoice } from '../context/BrandVoiceContext'
import EmptyHero from '../components/EmptyHero'

const P = 'var(--wl-primary, #0A6FB0)'

// Quelle → Label + Farbe
const SOURCE_META = {
  manual: { label: 'Selbst hinzugefügt', icon: UserIcon,       color: '#0A6FB0', bg: '#EEF4FE' },
  chat:   { label: 'Aus Chat gelernt',   icon: MessageSquare,  color: '#12B886', bg: '#EBFAF3' },
  auto:   { label: 'Automatisch gelernt',icon: Sparkles,       color: '#7A5AF8', bg: '#F2F1FE' },
  leadly: { label: 'Von Leadly',         icon: Bot,            color: '#E07B39', bg: '#FFF7F2' },
  assistant: { label: 'Von Leadly',      icon: Bot,            color: '#E07B39', bg: '#FFF7F2' },
}
const sourceMeta = (s) => SOURCE_META[s] || SOURCE_META.manual

function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '' }
}

export default function BrandMemory({ session }) {
  const { activeTeamId } = useTeam()
  const { activeBrandVoice } = useBrandVoice()
  const bv = activeBrandVoice
  const isNoBrand = !!bv?.noBrand
  const hasBrand = isNoBrand || !!bv?.id
  const brandLabel = isNoBrand ? 'Ohne Marke' : (bv?.brand_name || bv?.name || 'deine Marke')

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editText, setEditText] = useState('')

  async function load() {
    if (!activeTeamId || !hasBrand) { setItems([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('brand_memory')
      .select('id, content, source, created_at, user_id')
      .eq('team_id', activeTeamId)
      .order('created_at', { ascending: false })
    q = isNoBrand ? q.is('brand_voice_id', null).eq('no_brand', true) : q.eq('brand_voice_id', bv.id)
    const { data } = await q
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [activeTeamId, bv?.id, isNoBrand])

  async function add() {
    const content = draft.trim()
    if (!content || !activeTeamId || !hasBrand) return
    setSaving(true)
    const row = {
      team_id: activeTeamId,
      user_id: session?.user?.id || null,
      content,
      source: 'manual',
      no_brand: isNoBrand,
      brand_voice_id: isNoBrand ? null : bv.id,
    }
    const { data, error } = await supabase.from('brand_memory').insert(row).select().single()
    setSaving(false)
    if (!error && data) { setItems(p => [data, ...p]); setDraft('') }
    else if (error) alert('Konnte nicht speichern: ' + error.message)
  }

  async function saveEdit(id) {
    const content = editText.trim()
    if (!content) return
    const { error } = await supabase.from('brand_memory').update({ content }).eq('id', id)
    if (!error) { setItems(p => p.map(x => x.id === id ? { ...x, content } : x)); setEditId(null); setEditText('') }
    else alert('Konnte nicht speichern: ' + error.message)
  }

  async function remove(id) {
    if (!window.confirm('Diesen Memory-Eintrag löschen?')) return
    const { error } = await supabase.from('brand_memory').delete().eq('id', id)
    if (!error) setItems(p => p.filter(x => x.id !== id))
    else alert('Konnte nicht löschen: ' + error.message)
  }

  const cardStyle = { background: 'var(--surface,#fff)', border: '1px solid var(--border,#E6E8EF)', borderRadius: 16, boxShadow: 'var(--shadow-card, 0 10px 30px rgba(14,22,51,.06))' }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      {/* Header */}
      <div className="lk-eyebrow" style={{ marginBottom: 8 }}>Wissen</div>
      <h1 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 'clamp(1.6rem,3vw,2rem)', color: 'var(--text-primary, #0E1633)', margin: '0 0 6px' }}>
        Brand Memory
      </h1>
      <p style={{ color: 'var(--text-muted,#6A6D7A)', fontSize: 14, lineHeight: 1.6, margin: '0 0 22px', maxWidth: 640 }}>
        Das dauerhafte Gedächtnis für <b>{brandLabel}</b>. Alles hier fließt automatisch in jede Text- und Bildgenerierung dieser Marke ein — so werden die Ergebnisse mit der Zeit treffsicherer. Die KI ergänzt Erkenntnisse aus deinen Chats selbst; du kannst jederzeit eigene hinzufügen, bearbeiten oder löschen.
      </p>

      {!hasBrand ? (
        <EmptyHero title="Keine Marke ausgewählt" subtitle="Wähle oben rechts eine Marke (Brand Voice), um deren Memory zu sehen und zu pflegen." />
      ) : (
        <>
          {/* Hinzufügen */}
          <div style={{ ...cardStyle, padding: 16, marginBottom: 22 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary,#0E1633)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Brain size={15} strokeWidth={2} style={{ color: P }} /> Neue Erkenntnis merken
            </div>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
              placeholder={'z.B. „Wir nennen Kunden immer Partner, nie Klienten.“ oder „Bildstil: reduziert, viel Weißraum, keine Stockfoto-Optik.“'}
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1.5px solid var(--border,#E6E8EF)', fontSize: 13.5, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text-primary,#0E1633)' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="lk-btn lk-btn-cta" onClick={add} disabled={saving || !draft.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: (saving || !draft.trim()) ? 0.6 : 1 }}>
                <Plus size={14} /> {saving ? 'Speichere…' : 'Merken'}
              </button>
            </div>
          </div>

          {/* Liste */}
          {loading ? (
            <div style={{ color: 'var(--text-muted,#6A6D7A)', fontSize: 13, padding: 20, textAlign: 'center' }}>Lädt…</div>
          ) : items.length === 0 ? (
            <EmptyHero title="Noch keine Einträge" subtitle="Sobald du eigene Notizen hinzufügst oder mit der KI arbeitest, sammelt sich hier das Wissen über deine Marke." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map(it => {
                const m = sourceMeta(it.source)
                const Icon = m.icon
                const editing = editId === it.id
                return (
                  <div key={it.id} style={{ ...cardStyle, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editing ? (
                        <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
                          style={{ width: '100%', padding: 10, borderRadius: 9, border: '1.5px solid var(--border,#E6E8EF)', fontSize: 13.5, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text-primary,#0E1633)' }} />
                      ) : (
                        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-primary,#0E1633)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{it.content}</div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, padding: '3px 8px', borderRadius: 999 }}>
                          <Icon size={11} strokeWidth={2} /> {m.label}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted,#6A6D7A)' }}>{fmtDate(it.created_at)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {editing ? (
                        <>
                          <button className="lk-btn lk-btn-navy lk-btn-sm" onClick={() => saveEdit(it.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Speichern</button>
                          <button className="lk-btn lk-btn-ghost lk-btn-sm" onClick={() => { setEditId(null); setEditText('') }}><X size={13} /></button>
                        </>
                      ) : (
                        <>
                          <button className="lk-btn lk-btn-ghost lk-btn-sm" title="Bearbeiten" onClick={() => { setEditId(it.id); setEditText(it.content) }}><Pencil size={13} /></button>
                          <button className="lk-btn lk-btn-danger-ghost lk-btn-sm" title="Löschen" onClick={() => remove(it.id)}><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
