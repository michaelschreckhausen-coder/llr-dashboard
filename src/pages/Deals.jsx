import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useTeam } from '../context/TeamContext'

const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const PRIMARY = 'rgb(49,90,231)'

const STAGES = [
  { id: 'prospect',     label: 'Interessent',  color: '#6B7280', bg: '#F3F4F6', prob: 15  },
  { id: 'opportunity',  label: 'Qualifiziert', color: '#185FA5', bg: '#EFF6FF', prob: 30  },
  { id: 'angebot',      label: 'Angebot',      color: '#D97706', bg: '#FFFBEB', prob: 50  },
  { id: 'verhandlung',  label: 'Verhandlung',  color: '#7C3AED', bg: '#F5F3FF', prob: 70  },
  { id: 'gewonnen',     label: 'Gewonnen',     color: '#059669', bg: '#ECFDF5', prob: 100 },
  { id: 'verloren',     label: 'Verloren',     color: '#DC2626', bg: '#FEF2F2', prob: 0   },
]

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s]))

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

// ── Deal-Formular Modal ────────────────────────────────────────────────────────
function DealModal({ deal, leads, teamId, uid, onSave, onClose }) {
  const [form, setForm] = useState({
    name:           deal?.name || '',
    description:    deal?.description || '',
    value:          deal?.value || '',
    stage:          deal?.stage || 'prospect',
    probability:    deal?.probability ?? 10,
    expected_close: deal?.expected_close || '',
    notes:          deal?.notes || '',
    lead_id:        deal?.lead_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) { setError('Name ist Pflichtfeld'); return }
    setSaving(true)
    const payload = {
      name:           form.name.trim(),
      description:    form.description || null,
      value:          form.value ? parseFloat(form.value) : null,
      stage:          form.stage,
      probability:    parseInt(form.probability) || 0,
      expected_close: form.expected_close || null,
      notes:          form.notes || null,
      lead_id:        form.lead_id || null,
      team_id:        teamId || null,
      created_by:     uid,
    }
    let err
    if (deal?.id) {
      const r = await supabase.from('deals').update(payload).eq('id', deal.id)
      err = r.error
    } else {
      const r = await supabase.from('deals').insert(payload).select().single()
      err = r.error
      if (!err) payload.id = r.data.id
    }
    if (err) { setError(err.message); setSaving(false); return }
    onSave()
  }

  const inp = { width: '100%', padding: '9px 11px', border: '1.5px solid #E4E7EC', borderRadius: 9, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }
  const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{deal?.id ? 'Deal bearbeiten' : 'Neuer Deal'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '8px 12px', background: '#FEF2F2', color: '#991B1B', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{error}</div>}

          {/* Name */}
          <div>
            <label style={lbl}>Deal-Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="z.B. Enterprise-Lizenz Q2" style={inp} autoFocus/>
          </div>

          {/* Lead verknüpfen */}
          <div>
            <label style={lbl}>Lead verknüpfen (optional)</label>
            <select value={form.lead_id} onChange={e => set('lead_id', e.target.value)} style={inp}>
              <option value="">— Kein Lead</option>
              {leads.map(l => (
                <option key={l.id} value={l.id}>
                  {[l.first_name, l.last_name].filter(Boolean).join(' ') || l.name || l.company || l.id.slice(0,8)}
                  {l.company ? ` · ${l.company}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Wert + Stage */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Deal-Wert (€)</label>
              <input type="number" value={form.value} onChange={e => set('value', e.target.value)} placeholder="z.B. 12000" style={inp} min="0"/>
            </div>
            <div>
              <label style={lbl}>Stage</label>
              <select value={form.stage} onChange={e => { set('stage', e.target.value); set('probability', STAGE_MAP[e.target.value]?.prob ?? 10) }} style={inp}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Wahrscheinlichkeit + Abschluss */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Wahrscheinlichkeit: {form.probability}%</label>
              <input type="range" min="0" max="100" step="5" value={form.probability} onChange={e => set('probability', e.target.value)}
                style={{ width: '100%', accentColor: PRIMARY }}/>
            </div>
            <div>
              <label style={lbl}>Abschluss geplant</label>
              <input type="date" value={form.expected_close} onChange={e => set('expected_close', e.target.value)} style={inp}/>
            </div>
          </div>

          {/* Beschreibung */}
          <div>
            <label style={lbl}>Beschreibung</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
              placeholder="Kurze Beschreibung des Deals…" style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}/>
          </div>

          {/* Notizen */}
          <div>
            <label style={lbl}>Notizen</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              placeholder="Interne Notizen, nächste Schritte…" style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}/>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #E4E7EC', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Abbrechen</button>
            <button onClick={save} disabled={saving}
              style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: saving ? '#E4E7EC' : PRIMARY, color: saving ? '#9CA3AF' : '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? '⏳ …' : deal?.id ? 'Speichern' : '+ Deal erstellen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Deal-Detail Panel ──────────────────────────────────────────────────────────
function DealDetail({ deal, uid, onEdit, onDelete, onClose, onRefresh }) {
  const [attachments, setAttachments] = useState([])
  const [uploading,   setUploading]   = useState(false)
  const [uploadErr,   setUploadErr]   = useState(null)
  const [deleting,    setDeleting]    = useState(null)
  const fileRef = useRef(null)
  const s = STAGE_MAP[deal.stage] || STAGE_MAP.prospect

  useEffect(() => { loadAttachments() }, [deal.id])

  async function loadAttachments() {
    const { data } = await supabase.from('deal_attachments').select('*').eq('deal_id', deal.id).order('created_at', { ascending: false })
    setAttachments(data || [])
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setUploadErr('Datei zu groß (max. 10 MB)'); return }
    setUploading(true)
    setUploadErr(null)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${uid}/${deal.id}/${Date.now()}.${ext}`
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/deal-attachments/${path}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': file.type, 'x-upsert': 'false' },
        body: file,
      })
      if (!res.ok) { const t = await res.text(); setUploadErr(t); setUploading(false); return }
      await supabase.from('deal_attachments').insert({
        deal_id: deal.id, uploaded_by: uid,
        name: file.name, file_path: path,
        file_size: file.size, mime_type: file.type,
      })
      await loadAttachments()
    } catch(err) { setUploadErr(err.message) }
    setUploading(false)
    e.target.value = ''
  }

  async function downloadFile(att) {
    try {
      const { data, error } = await supabase.storage.from('deal-attachments').createSignedUrl(att.file_path, 300)
      if (error) { alert('Download-Fehler: ' + error.message); return }
      if (!data?.signedUrl) { alert('Keine Download-URL erhalten'); return }
      // Sicherstellen dass die URL absolut ist
      const url = data.signedUrl.startsWith('http')
        ? data.signedUrl
        : `${SUPABASE_URL}${data.signedUrl}`
      window.open(url, '_blank')
    } catch (err) {
      alert('Download-Fehler: ' + err.message)
    }
  }

  async function deleteFile(att) {
    setDeleting(att.id)
    await supabase.storage.from('deal-attachments').remove([att.file_path])
    await supabase.from('deal_attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
    setDeleting(null)
  }

  const today = new Date().toISOString().split('T')[0]
  const isOverdue = (deal.expected_close || deal.expected_close_date) && (deal.expected_close || deal.expected_close_date) < today && deal.stage !== 'gewonnen' && deal.stage !== 'verloren'

  return (
    <div style={{ background: '#fff', border: '1px solid #E4E7EC', borderRadius: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 6 }}>{deal.title || deal.name || '—'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: s.bg, color: s.color }}>
              {s.label}
            </span>
            {deal.value && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: '#F0FDF4', color: '#059669' }}>
                {fmtEur(deal.value)}
              </span>
            )}
            {(deal.expected_close || deal.expected_close_date) && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: isOverdue ? '#FEF2F2' : '#F3F4F6', color: isOverdue ? '#DC2626' : '#6B7280' }}>
                {isOverdue ? '⚠ Überfällig · ' : '📅 '}{fmtDate(deal.expected_close || deal.expected_close_date)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onEdit} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #E4E7EC', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>✏ Bearbeiten</button>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#F3F4F6', cursor: 'pointer', fontSize: 16, color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Wahrscheinlichkeit */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Abschluss-Wahrscheinlichkeit</span><span>{deal.probability}%</span>
          </div>
          <div style={{ height: 6, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${deal.probability}%`, background: deal.stage === 'gewonnen' ? '#059669' : deal.stage === 'verloren' ? '#DC2626' : PRIMARY, borderRadius: 99 }}/>
          </div>
        </div>

        {/* Beschreibung + Notizen */}
        {deal.description && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Beschreibung</div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{deal.description}</div>
          </div>
        )}
        {deal.notes && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Notizen</div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{deal.notes}</div>
          </div>
        )}

        {/* Anhänge */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Anhänge ({attachments.length})
            </div>
            <button onClick={() => fileRef.current?.click()}
              style={{ padding: '4px 12px', borderRadius: 8, border: '1.5px dashed ' + PRIMARY, background: 'rgba(49,90,231,0.04)', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: PRIMARY }}>
              {uploading ? '⏳ Hochladen…' : '+ Datei anhängen'}
            </button>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={uploadFile}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip"/>
          </div>

          {uploadErr && <div style={{ fontSize: 11, color: '#DC2626', marginBottom: 8, padding: '6px 10px', background: '#FEF2F2', borderRadius: 6 }}>{uploadErr}</div>}

          {attachments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#CBD5E1', fontSize: 12 }}>
              Noch keine Anhänge · max. 10 MB pro Datei
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {attachments.map(att => (
                <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, border: '1px solid #F1F5F9', background: '#F9FAFB' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{fileIcon(att.mime_type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{fmtSize(att.file_size)} · {new Date(att.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</div>
                  </div>
                  <button onClick={() => downloadFile(att)}
                    style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #E4E7EC', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: PRIMARY }}>
                    ↓ Download
                  </button>
                  {att.uploaded_by === uid && (
                    <button onClick={() => deleteFile(att)} disabled={deleting === att.id}
                      style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#D1D5DB' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                      onMouseLeave={e => e.currentTarget.style.color = '#D1D5DB'}>
                      {deleting === att.id ? '⏳' : '×'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Löschen */}
        {deal.created_by === uid && (
          <button onClick={() => { if (window.confirm('Deal wirklich löschen?')) onDelete(deal.id) }}
            style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 8, border: '1px solid #FECACA', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#DC2626' }}>
            🗑 Deal löschen
          </button>
        )}
      </div>
    </div>
  )
}

// ── Hauptseite ─────────────────────────────────────────────────────────────────
export default function Deals({ session }) {
  const navigate = useNavigate()
  const { team, activeTeamId } = useTeam()
  const uid = session?.user?.id
  const [deals,     setDeals]     = useState([])
  const [leads,     setLeads]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null)  // null | 'new' | deal-object
  const [selected,  setSelected]  = useState(null)  // aktiver Deal für Detail
  const [filter,    setFilter]    = useState('all')
  const [search,    setSearch]    = useState('')

  useEffect(() => { load() }, [activeTeamId])

  async function load() {
    setLoading(true)
    // Deals laden
    let q = supabase.from('deals').select('id,title,stage,value,currency,probability,expected_close_date,description,notes,created_by,created_at,updated_at,custom_fields,lead_id,team_id,leads(id,first_name,last_name,name,company)').order('created_at', { ascending: false })
    if (activeTeamId) q = q.eq('team_id', activeTeamId)
    else q = q.eq('created_by', uid).is('team_id', null)
    const { data: d } = await q
    setDeals(d || [])

    // Leads für Verknüpfung laden
    let ql = supabase.from('leads').select('id,first_name,last_name,name,company')
    if (activeTeamId) ql = ql.eq('team_id', activeTeamId)
    else ql = ql.eq('user_id', uid).is('team_id', null)
    const { data: l } = await ql
    setLeads(l || [])
    setLoading(false)
  }

  async function deleteDeal(id) {
    await supabase.from('deals').delete().eq('id', id)
    setDeals(prev => prev.filter(d => d.id !== id))
    setSelected(null)
  }

  // Filter
  const today = new Date().toISOString().split('T')[0]
  const filtered = deals.filter(d => {
    const q = search.toLowerCase()
    const matchSearch = !q || d.name?.toLowerCase().includes(q) || d.leads?.company?.toLowerCase().includes(q)
    if (!matchSearch) return false
    if (filter === 'all') return true
    if (filter === 'offen') return !['gewonnen','verloren'].includes(d.stage)
    if (filter === 'gewonnen')  return d.stage === 'gewonnen'
    if (filter === 'verloren') return d.stage === 'verloren'
    if (filter === 'overdue') return d.expected_close && d.expected_close < today && !['gewonnen','verloren'].includes(d.stage)
    return true
  })

  // KPIs
  const open   = deals.filter(d => !['gewonnen','verloren'].includes(d.stage))
  const won    = deals.filter(d => d.stage === 'gewonnen')
  const total  = open.reduce((s,d) => s + (Number(d.value)||0), 0)
  const weighted = open.reduce((s,d) => s + (Number(d.value)||0) * (d.probability||0) / 100, 0)

  const FILTERS = [
    { id: 'all',     label: 'Alle',         count: deals.length },
    { id: 'offen',    label: 'Offen',        count: open.length },
    { id: 'gewonnen',     label: '✓ Gewonnen',   count: won.length },
    { id: 'verloren',    label: '✗ Verloren',   count: deals.filter(d=>d.stage==='lost').length },
    { id: 'overdue', label: '⚠ Überfällig', count: deals.filter(d=>d.expected_close&&d.expected_close<today&&!['gewonnen','verloren'].includes(d.stage)).length },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>Deals</h1>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            {team ? `Team: ${team.name}` : 'Meine Deals'} · {open.length} offen · {fmtEur(total)} Pipeline
          </div>
        </div>
        <button onClick={() => setModal('new')}
          style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          + Neuer Deal
        </button>
      </div>

      {/* KPI-Zeile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Pipeline Gesamt',  value: fmtEur(total),    color: PRIMARY,    bg: 'rgba(49,90,231,0.06)' },
          { label: 'Gewichtet',        value: fmtEur(weighted), color: '#7C3AED',  bg: '#F5F3FF' },
          { label: 'Gewonnene Deals',  value: won.length + ' Deals', color: '#059669', bg: '#ECFDF5' },
          { label: 'Ø Deal-Wert',      value: open.length ? fmtEur(total / open.length) : '—', color: '#D97706', bg: '#FFFBEB' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: '14px 18px', border: '1px solid ' + k.color + '22' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: k.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter + Suche */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid', borderColor: filter === f.id ? PRIMARY : '#E5E7EB', background: filter === f.id ? PRIMARY : '#fff', color: filter === f.id ? '#fff' : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              {f.label}
              {f.count > 0 && <span style={{ background: filter===f.id?'rgba(255,255,255,0.3)':'#F3F4F6', color: filter===f.id?'#fff':'#6B7280', borderRadius: 99, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>{f.count}</span>}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Deal suchen…"
            style={{ padding: '7px 12px', border: '1.5px solid #E4E7EC', borderRadius: 10, fontSize: 13, outline: 'none', width: 200 }}/>
        </div>
      </div>

      {/* Layout: Liste links, Detail rechts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        {/* Deal-Liste */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>⏳ Lade Deals…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💼</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Noch keine Deals</div>
              <div style={{ fontSize: 13 }}>Klicke "+ Neuer Deal" um deinen ersten Deal anzulegen</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(deal => {
                const s = STAGE_MAP[deal.stage] || STAGE_MAP.prospect
                const isActive = selected?.id === deal.id
                const isOvd = (deal.expected_close || deal.expected_close_date) && (deal.expected_close || deal.expected_close_date) < today && !['gewonnen','verloren'].includes(deal.stage)
                const lead = deal.leads

                return (
                  <div key={deal.id}
                    onClick={() => setSelected(isActive ? null : deal)}
                    style={{ background: '#fff', border: '1.5px solid ' + (isActive ? PRIMARY : '#E4E7EC'), borderRadius: 13, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 14 }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = '#C7D2FE' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = '#E4E7EC' }}>

                    {/* Stage-Dot */}
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>

                    {/* Inhalt */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.title || deal.name || '—'}</div>
                        {deal.value && <div style={{ fontSize: 13, fontWeight: 800, color: s.color, flexShrink: 0 }}>{fmtEur(deal.value)}</div>}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: s.bg, color: s.color }}>{s.label}</span>
                        {lead && <span style={{ fontSize: 10, color: '#6B7280' }}>👤 {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || lead.company}</span>}
                        {(deal.expected_close || deal.expected_close_date) && <span style={{ fontSize: 10, color: isOvd ? '#DC2626' : '#9CA3AF', fontWeight: isOvd ? 700 : 400 }}>{isOvd ? '⚠' : '📅'} {fmtDate(deal.expected_close || deal.expected_close_date)}</span>}
                      </div>
                    </div>

                    {/* Wahrscheinlichkeit */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{deal.probability}%</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>WSK</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail-Panel — fixed Slide-in von rechts */}
        {selected && (
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, zIndex: 400, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
            <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
              <DealDetail
                deal={selected}
                uid={uid}
                onEdit={() => setModal(selected)}
                onDelete={deleteDeal}
                onClose={() => setSelected(null)}
                onRefresh={load}
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <DealModal
          deal={modal === 'new' ? null : modal}
          leads={leads}
          teamId={activeTeamId}
          uid={uid}
          onSave={() => { setModal(null); load(); if (modal !== 'new') setSelected(null) }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
