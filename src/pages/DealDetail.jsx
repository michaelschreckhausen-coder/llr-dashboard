// Deal-Detailseite — eigenständige Seite an /deals/:id (löst das frühere
// Slide-in-Drawer-Panel ab; analog zur Kontakt-Detailseite).
//
// Inhalt: Header (Titel/Stage/Wert/Termin), Wahrscheinlichkeit, Beschreibung/
// Notizen, verknüpfter Kontakt + Unternehmen, Anhänge (Upload/Download/Delete),
// Aktivitäten des verknüpften Kontakts (useLeadActivities), Bearbeiten (DealModal),
// Löschen, „Projekt starten".

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, Eye, Trash2, Pencil, Rocket, Paperclip, User, Building2,
  CalendarCheck, Phone, TrendingUp, Mail, Send, FileText, Target, CheckCircle2, Users, Link2, Package,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import { useLeadActivities } from '../hooks/useLeadActivities'
import ProjektStartenModal from '../components/ProjektStartenModal'
import { DealModal } from './Deals'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'

const STAGE_MAP = {
  prospect:    { label: 'Interessent',  color: '#6B7280', bg: '#F3F4F6' },
  opportunity: { label: 'Qualifiziert', color: '#185FA5', bg: '#EFF6FF' },
  angebot:     { label: 'Angebot',      color: '#D97706', bg: '#FFFBEB' },
  verhandlung: { label: 'Verhandlung',  color: '#003060', bg: '#F5F3FF' },
  gewonnen:    { label: 'Gewonnen',     color: '#059669', bg: '#ECFDF5' },
  verloren:    { label: 'Verloren',     color: '#DC2626', bg: '#FEF2F2' },
}

function fmtEur(v) {
  if (!v) return '—'
  return '€' + Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0 })
}
function fmtDate(d) {
  if (!d) return null
  return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
}
function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
function fileIcon(mime) {
  if (!mime) return '📎'
  if (mime.includes('pdf')) return '📄'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('csv')) return '📊'
  if (mime.includes('powerpoint') || mime.includes('presentation')) return '📋'
  if (mime.includes('image')) return '🖼'
  if (mime.includes('zip')) return '🗜'
  return '📎'
}

// Activity-Type → Icon + Farben (kompakt, gespiegelt von LeadDetail).
const ACTIVITY_VARIANTS = {
  meeting:          { bg:'#EAF3DE', fg:'#3B6D11', Icon: CalendarCheck, label:'Meeting' },
  call:             { bg:'#FAEEDA', fg:'#854F0B', Icon: Phone,         label:'Anruf' },
  score:            { bg:'#FAEEDA', fg:'#854F0B', Icon: TrendingUp,    label:'Score-Update' },
  email:            { bg:'#E6F1FB', fg:'#0C447C', Icon: Mail,          label:'E-Mail' },
  message:          { bg:'#EEEDFE', fg:'#3C3489', Icon: Send,          label:'Nachricht' },
  note:             { bg:'#F1F5F9', fg:'#475569', Icon: FileText,      label:'Notiz' },
  task:             { bg:'#FAECE7', fg:'#7C2D12', Icon: Target,        label:'Aufgabe' },
  field_changed_status:     { bg:'#FAEEDA', fg:'#854F0B', Icon: TrendingUp,  label:'Status geändert' },
  field_changed_deal_stage: { bg:'#FAEEDA', fg:'#854F0B', Icon: TrendingUp,  label:'Deal-Stage geändert' },
  field_changed_owner_id:   { bg:'#F1F5F9', fg:'#475569', Icon: Users,       label:'Owner gewechselt' },
  field_changed_lead_score: { bg:'#FAEEDA', fg:'#854F0B', Icon: TrendingUp,  label:'Score geändert' },
  task_created:             { bg:'#FAECE7', fg:'#7C2D12', Icon: Target,      label:'Aufgabe erstellt' },
  task_completed:           { bg:'#EAF3DE', fg:'#3B6D11', Icon: CheckCircle2, label:'Aufgabe erledigt' },
  connection_requested:     { bg:'#E6F1FB', fg:'#0C447C', Icon: Link2,       label:'Vernetzungsanfrage' },
  connection_responded:     { bg:'#DCFCE7', fg:'#166534', Icon: Link2,       label:'Vernetzung beantwortet' },
}
function variantFor(type) {
  return ACTIVITY_VARIANTS[type] || { bg:'#F1F5F9', fg:'#475569', Icon: FileText, label: type || 'Aktivität' }
}
function authorName(p) {
  if (!p) return null
  return p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || null
}
function payloadSummary(item) {
  const p = item.payload || {}
  if (p.old_value != null || p.new_value != null) {
    return `${p.old_value ?? '—'} → ${p.new_value ?? '—'}`
  }
  return p.title || p.subject || p.body || ''
}
function fmtActivityTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }) + ' · ' +
    d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

const labelStyle = { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }
const cardStyle = { background: 'var(--surface, #fff)', border: '1px solid #E4E7EC', borderRadius: 16, padding: '18px 20px' }

export default function DealDetail({ session }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()
  const uid = session?.user?.id

  const [deal, setDeal]       = useState(null)
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [leads, setLeads]     = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [editing, setEditing] = useState(false)
  const [showStartProjekt, setShowStartProjekt] = useState(false)

  // Anhänge
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const fileRef = useRef(null)

  const loadDeal = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('deals')
      .select('*, leads(id,first_name,last_name,name,company), organizations(id,name)')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) { setNotFound(true); setDeal(null); setProduct(null); setLoading(false); return }
    setDeal(data)
    // Verknüpftes Produkt aus der Wissensdatenbank nachladen (separate Query
    // statt PostgREST-Embed — vermeidet Embed-Silent-Fail, Felder 1:1 wie in Deals.jsx).
    if (data.product_id) {
      const { data: prod } = await supabase.from('knowledge_base')
        .select('id, name, price, product_form, product_kind')
        .eq('id', data.product_id)
        .maybeSingle()
      setProduct(prod || null)
    } else {
      setProduct(null)
    }
    setLoading(false)
  }, [id])

  const loadAttachments = useCallback(async () => {
    const { data } = await supabase.from('deal_attachments')
      .select('*').eq('deal_id', id).order('created_at', { ascending: false })
    setAttachments(data || [])
  }, [id])

  // Leads + Team-Members für das Bearbeiten-Modal (analog Deals-Liste)
  const loadModalData = useCallback(async () => {
    if (!activeTeamId) { setLeads([]); setTeamMembers([]); return }
    const { data: l } = await supabase.from('leads')
      .select('id,first_name,last_name,name,company').eq('team_id', activeTeamId)
    setLeads(l || [])
    const { data: tm } = await supabase.from('team_members')
      .select('user_id, role').eq('team_id', activeTeamId)
    const userIds = [...new Set((tm || []).map(m => m.user_id).filter(Boolean))]
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles')
        .select('id, full_name, avatar_url').in('id', userIds)
      setTeamMembers((profiles || []).map(p => {
        const parts = (p.full_name || '').trim().split(/\s+/)
        return { id: p.id, first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '', full_name: p.full_name || null, avatar_url: p.avatar_url || null }
      }))
    } else setTeamMembers([])
  }, [activeTeamId])

  useEffect(() => { loadDeal(); loadAttachments() }, [loadDeal, loadAttachments])
  useEffect(() => { loadModalData() }, [loadModalData])

  // Aktivitäten des verknüpften Kontakts
  const { items: activities, profilesById, isLoading: actLoading } = useLeadActivities(deal?.lead_id || null)

  async function uploadFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setUploadErr('Datei zu groß (max. 10 MB)'); return }
    setUploading(true)
    setUploadErr(null)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${uid}/${id}/${Date.now()}.${ext}`
      // Timeout-Guard: verhindert stummes Hängen, falls der Storage-Endpoint
      // nicht antwortet (statt Spinner-für-immer kommt eine Fehlermeldung).
      const uploadPromise = supabase.storage
        .from('deal-attachments')
        .upload(path, file, { contentType: file.type, upsert: false })
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung — Upload hat nicht geantwortet')), 45000))
      const { error: storageErr } = await Promise.race([uploadPromise, timeout])
      if (storageErr) { setUploadErr('Upload fehlgeschlagen: ' + storageErr.message); return }
      const { error: insertErr } = await supabase.from('deal_attachments').insert({
        deal_id: id, uploaded_by: uid,
        name: file.name, file_path: path,
        file_size: file.size, mime_type: file.type,
      })
      if (insertErr) { setUploadErr('Datei gespeichert, aber Eintrag fehlgeschlagen: ' + insertErr.message); return }
      await loadAttachments()
    } catch (err) {
      setUploadErr('Unerwarteter Fehler: ' + (err?.message || String(err)))
    } finally {
      setUploading(false)
      if (e?.target) e.target.value = ''
    }
  }

  async function downloadFile(att) {
    try {
      const { data: blob, error } = await supabase.storage.from('deal-attachments').download(att.file_path)
      if (error) { alert('Download-Fehler: ' + error.message); return }
      if (!blob) { alert('Keine Datei erhalten'); return }
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl; a.download = att.name
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
    } catch (err) { alert('Download-Fehler: ' + err.message) }
  }

  async function openFile(att) {
    // Fenster synchron öffnen (User-Gesture bleibt erhalten → kein Popup-Block),
    // dann Blob laden und die Object-URL setzen. Blob: ist same-origin, daher
    // blockt Chrome PDFs/Bilder nicht (vgl. Top-Fallstrick #5).
    const win = window.open('', '_blank')
    try {
      const { data: blob, error } = await supabase.storage.from('deal-attachments').download(att.file_path)
      if (error || !blob) { if (win) win.close(); alert('Öffnen fehlgeschlagen: ' + (error?.message || 'keine Datei')); return }
      const url = URL.createObjectURL(blob)
      if (win) win.location = url
      else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      if (win) win.close()
      alert('Öffnen fehlgeschlagen: ' + err.message)
    }
  }

  async function deleteFile(att) {
    setDeleting(att.id)
    await supabase.storage.from('deal-attachments').remove([att.file_path])
    await supabase.from('deal_attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
    setDeleting(null)
  }

  async function deleteDeal() {
    if (!window.confirm('Deal wirklich löschen?')) return
    await supabase.from('deals').delete().eq('id', id)
    navigate('/deals?view=liste')
  }

  if (loading) {
    return <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px', color: '#9CA3AF' }}>Lade Deal…</div>
  }
  if (notFound || !deal) {
    return (
      <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
        <button onClick={() => navigate('/deals?view=liste')} style={backBtnStyle}><ArrowLeft size={15} /> Zurück zu Deals</button>
        <div style={{ marginTop: 24, color: '#6B7280' }}>Deal nicht gefunden.</div>
      </div>
    )
  }

  const s = STAGE_MAP[deal.stage] || STAGE_MAP.prospect
  const closeDate = deal.expected_close_date || deal.expected_close
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = closeDate && closeDate < today && deal.stage !== 'gewonnen' && deal.stage !== 'verloren'
  const lead = deal.leads
  const leadName = lead ? ([lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || lead.company) : null

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <button onClick={() => navigate('/deals?view=liste')} style={backBtnStyle}><ArrowLeft size={15} /> Zurück zu Deals</button>

      {/* Seitenkopf (Standard-Layout: h1-Titel, Aktionen rechts) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, margin: '16px 0 20px' }}>
        <div style={{ minWidth: 0 }}>
          <div className="lk-eyebrow" style={{ fontSize:12, fontWeight:700, letterSpacing:'1.6px', textTransform:'uppercase', fontFamily:'Inter, sans-serif', color:'var(--primary, #003060)', marginBottom:2 }}>CRM · Deal</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2, color: '#111827' }}>{deal.title || deal.name || '—'}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: s.bg, color: s.color }}>{s.label}</span>
            {deal.value && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#F0FDF4', color: '#059669' }}>{fmtEur(deal.value)}</span>}
            {closeDate && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: isOverdue ? '#FEF2F2' : '#F3F4F6', color: isOverdue ? '#DC2626' : '#6B7280' }}>{isOverdue ? 'Überfällig · ' : ''}{fmtDate(closeDate)}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {deal.stage === 'gewonnen' && (
            <button onClick={() => setShowStartProjekt(true)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #059669', background: '#F0FDF4', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Rocket size={14} /> Projekt starten</button>
          )}
          <button className="lk-btn lk-btn-ghost" onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Pencil size={14} /> Bearbeiten</button>
        </div>
      </div>

      {/* Wahrscheinlichkeit */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span>Abschluss-Wahrscheinlichkeit</span><span>{deal.probability}%</span>
        </div>
        <div style={{ height: 7, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${deal.probability || 0}%`, background: deal.stage === 'gewonnen' ? '#059669' : deal.stage === 'verloren' ? '#DC2626' : PRIMARY, borderRadius: 99 }} />
        </div>
      </div>

      {/* Verknüpfungen */}
      {(leadName || deal.organizations?.name) && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={labelStyle}>Verknüpfung</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {leadName && (
              <button onClick={() => navigate(`/leads/${deal.lead_id}`)} style={chipBtnStyle}>
                <User size={14} /> {leadName}
              </button>
            )}
            {deal.organizations?.name && (
              <button onClick={() => navigate(`/organizations/${deal.organization_id}`)} style={chipBtnStyle}>
                <Building2 size={14} /> {deal.organizations.name}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Verknüpftes Produkt (aus der Wissensdatenbank) */}
      {product && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Package size={13} /> Verknüpftes Produkt</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{product.name}</div>
              {(() => {
                const meta = [product.product_kind, product.product_form].filter(Boolean).join(' · ')
                return meta ? <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>{meta}</div> : null
              })()}
            </div>
            {product.price && (
              <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: '#F0FDF4', color: '#059669', flexShrink: 0, whiteSpace: 'nowrap' }}>{product.price}</span>
            )}
          </div>
        </div>
      )}

      {/* Beschreibung / Notizen */}
      {(deal.description || deal.notes) && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          {deal.description && (
            <div style={{ marginBottom: deal.notes ? 14 : 0 }}>
              <div style={labelStyle}>Beschreibung</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{deal.description}</div>
            </div>
          )}
          {deal.notes && (
            <div>
              <div style={labelStyle}>Notizen</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{deal.notes}</div>
            </div>
          )}
        </div>
      )}

      {/* Anhänge */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ ...labelStyle, marginBottom: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Paperclip size={13} /> Anhänge ({attachments.length})</div>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px dashed ' + PRIMARY, background: 'rgba(10,111,176,0.04)', fontSize: 12, fontWeight: 700, cursor: uploading ? 'default' : 'pointer', color: PRIMARY }}>
            {uploading ? 'Hochladen…' : '+ Datei anhängen'}
          </button>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={uploadFile}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip" />
        </div>
        {uploadErr && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 10, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>{uploadErr}</div>}
        {attachments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '22px 0', color: '#CBD5E1', fontSize: 12 }}>Noch keine Anhänge · max. 10 MB pro Datei</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attachments.map(att => (
              <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, border: '1px solid #F1F5F9', background: '#F9FAFB' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{fileIcon(att.mime_type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</div>
                  <div style={{ fontSize: 10, color: '#9CA3AF' }}>{fmtSize(att.file_size)} · {new Date(att.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</div>
                </div>
                <button className="lk-btn lk-btn-ghost" onClick={() => openFile(att)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Eye size={13} /> Öffnen</button>
                <button className="lk-btn lk-btn-ghost" onClick={() => downloadFile(att)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Download size={13} /> Download</button>
                {att.uploaded_by === uid && (
                  <button onClick={() => deleteFile(att)} disabled={deleting === att.id} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#D1D5DB', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Aktivitäten des verknüpften Kontakts */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>Aktivitäten{leadName ? ` · ${leadName}` : ''}</div>
        {!deal.lead_id ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>Kein Kontakt verknüpft — verknüpfe einen Kontakt, um dessen Aktivitäten hier zu sehen.</div>
        ) : actLoading ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>Lade Aktivitäten…</div>
        ) : activities.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>Noch keine Aktivitäten für diesen Kontakt.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {activities.map(item => {
              const v = variantFor(item.type)
              const Icon = v.Icon
              const author = item.actor_id ? authorName(profilesById.get(item.actor_id)) : null
              const summary = payloadSummary(item)
              return (
                <div key={`${item.source}-${item.id}`} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid #F8FAFC' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: v.bg, color: v.fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={15} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                      {v.label}{item.collapsed_count > 1 ? ` (${item.collapsed_count}×)` : ''}
                    </div>
                    {summary && <div style={{ fontSize: 12, color: '#475569', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</div>}
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{fmtActivityTime(item.timestamp)}{author ? ` · ${author}` : ''}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Löschen */}
      {deal.created_by === uid && (
        <button onClick={deleteDeal} style={{ marginTop: 20, padding: '8px 14px', borderRadius: 8, border: '1px solid #FECACA', background: 'var(--surface, #fff)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#DC2626', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Trash2 size={14} /> Deal löschen
        </button>
      )}

      {/* Bearbeiten-Modal */}
      {editing && (
        <DealModal
          deal={deal}
          leads={leads}
          teamMembers={teamMembers}
          teamId={activeTeamId}
          uid={uid}
          onSave={() => { setEditing(false); loadDeal() }}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Projekt starten */}
      {showStartProjekt && (
        <ProjektStartenModal
          deal={deal}
          session={session}
          onClose={() => setShowStartProjekt(false)}
          onCreated={() => { setShowStartProjekt(false); loadDeal() }}
        />
      )}
    </div>
  )
}

const backBtnStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #E4E7EC', background: 'var(--surface, #fff)', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const chipBtnStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: '1px solid #E4E7EC', background: '#F9FAFB', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
