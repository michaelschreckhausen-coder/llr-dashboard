// Sponsoring OS — Sponsorenaktivierung (Phase 2, Modul 6)
// Aktivierungsmassnahmen je Vertrag, Status-Board (geplant→Umsetzung→abgeschlossen→reportet).
// Schema 'sponsoring', team_id aus useTeam().

import PillSelect from '../../components/PillSelect'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { Megaphone, Plus, Loader2, ListChecks, Image as ImageIcon, Trash2, Upload, Wand2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const sp = () => supabase.schema('sponsoring')
const ACTIVATION_BUCKET = 'sponsoring-activation'

const TPL_EMPTY = { title: '', category_id: '', right_id: '', sort_order: 0 }

const STATUS = ['planned', 'in_progress', 'done', 'reported']
const STATUS_LABEL = { planned: 'Geplant', in_progress: 'In Umsetzung', done: 'Abgeschlossen', reported: 'Reportet' }
const STATUS_COLOR = { planned: '#6B7280', in_progress: '#D97706', done: '#2563EB', reported: '#059669' }
const TYPES = ['social_post', 'video', 'interview', 'hospitality', 'event', 'newsletter', 'content', 'other']
const TYPE_LABEL = { social_post: 'Social Post', video: 'Video', interview: 'Interview', hospitality: 'Hospitality', event: 'Event', newsletter: 'Newsletter', content: 'Content', other: 'Sonstiges' }

const EMPTY = { title: '', type: 'social_post', contract_id: '', scheduled_for: '', proof_url: '', responsible: '', contact_id: '' }

export default function Aktivierung() {
  const { activeTeamId, members = [] } = useTeam()
  const [acts, setActs] = useState([])
  const [contracts, setContracts] = useState([])
  const [sponsors, setSponsors] = useState([])
  const [orgs, setOrgs] = useState([])
  const [leads, setLeads] = useState([])
  const [categories, setCategories] = useState([])
  const [rights, setRights] = useState([])
  const [templates, setTemplates] = useState([])
  const [attachments, setAttachments] = useState([])      // activation_attachments rows
  const [attUrls, setAttUrls] = useState({})              // attachment.id -> signed url
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [tplForm, setTplForm] = useState(TPL_EMPTY)       // Vorlagen-CRUD
  const [tplBusy, setTplBusy] = useState(false)
  const [applyContractId, setApplyContractId] = useState('')  // Vertrag für RPC
  const [applyBusy, setApplyBusy] = useState(false)
  const [applyMsg, setApplyMsg] = useState(null)
  const [uploadBusy, setUploadBusy] = useState(null)      // activation_id currently uploading

  const signed = useCallback(async (path) => {
    if (!path) return null
    const { data } = await supabase.storage.from(ACTIVATION_BUCKET).createSignedUrl(path, 3600)
    return data?.signedUrl || null
  }, [])

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [a, c, s, o, cat, r, tpl, att, ld] = await Promise.all([
      sp().from('activations').select('*').eq('team_id', activeTeamId).order('scheduled_for', { ascending: true, nullsFirst: false }),
      sp().from('contracts').select('id, sponsor_profile_id, package_id').eq('team_id', activeTeamId),
      sp().from('sponsor_profiles').select('id, organization_id').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      supabase.from('organizations').select('id, name').eq('team_id', activeTeamId),
      sp().from('rights_categories').select('id, name').eq('team_id', activeTeamId).order('sort_order', { ascending: true }),
      sp().from('rights').select('id, name, category_id').eq('team_id', activeTeamId).order('name', { ascending: true }),
      sp().from('activation_templates').select('*').eq('team_id', activeTeamId).order('sort_order', { ascending: true }),
      sp().from('activation_attachments').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: true }),
      supabase.from('leads').select('id, first_name, last_name, company, organization_id').eq('team_id', activeTeamId),
    ])
    const err = a.error || c.error || s.error || o.error || cat.error || r.error || tpl.error || att.error || ld.error
    if (err) { setError(err.message); setLoading(false); return }
    setActs(a.data || []); setContracts(c.data || []); setSponsors(s.data || []); setOrgs(o.data || [])
    setCategories(cat.data || []); setRights(r.data || []); setTemplates(tpl.data || [])
    setAttachments(att.data || []); setLeads(ld.data || [])

    // Signed-URLs defensiv parallel auflösen (Bucket privat → Anzeige via signedUrl)
    const pairs = await Promise.all((att.data || []).map(async (x) => [x.id, await signed(x.storage_path)]))
    setAttUrls(Object.fromEntries(pairs))
    setLoading(false)
  }, [activeTeamId, signed])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Sponsor-Name kommt aus organizations.name (sponsor_profiles ist 1:1-Extension).
  const orgName = useMemo(() => Object.fromEntries(orgs.map((o) => [o.id, o.name])), [orgs])
  const sponsorName = useMemo(
    () => Object.fromEntries(sponsors.map((s) => [s.id, orgName[s.organization_id] || '—'])),
    [sponsors, orgName],
  )
  const contractLabel = useMemo(() => Object.fromEntries(
    contracts.map((c) => [c.id, sponsorName[c.sponsor_profile_id] || 'Vertrag']),
  ), [contracts, sponsorName])
  const categoryName = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories])
  const rightName = useMemo(() => Object.fromEntries(rights.map((r) => [r.id, r.name])), [rights])
  // A3: Verantwortlicher (Team-Mitglied) + Ansprechpartner (Org-Kontakt)
  const memberName = useMemo(
    () => Object.fromEntries(members.map((m) => [m.user_id, m.profile?.full_name || m.profile?.email || (m.user_id || '').slice(0, 8)])),
    [members],
  )
  const leadName = useMemo(
    () => Object.fromEntries(leads.map((l) => [l.id, `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.company || 'Kontakt'])),
    [leads],
  )
  // Org des im Anlage-Formular gewählten Vertrags → Ansprechpartner-Auswahl darauf filtern
  const formContractOrgId = useMemo(() => {
    const c = contracts.find((x) => x.id === form.contract_id)
    if (!c) return null
    const s = sponsors.find((x) => x.id === c.sponsor_profile_id)
    return s?.organization_id || null
  }, [form.contract_id, contracts, sponsors])
  const contactOptions = useMemo(
    () => (formContractOrgId ? leads.filter((l) => l.organization_id === formContractOrgId) : []),
    [leads, formContractOrgId],
  )
  const attByActivation = useMemo(() => {
    const m = {}
    for (const x of attachments) (m[x.activation_id] = m[x.activation_id] || []).push(x)
    return m
  }, [attachments])
  // Rechte gefiltert auf die im Vorlagen-Formular gewählte Kategorie (optional)
  const tplRightOptions = useMemo(
    () => (tplForm.category_id ? rights.filter((r) => r.category_id === tplForm.category_id) : rights),
    [rights, tplForm.category_id],
  )

  async function create(e) {
    e.preventDefault()
    if (!activeTeamId || !form.title.trim()) return
    setBusy(true); setError(null)
    const { error: e2 } = await sp().from('activations').insert({
      team_id: activeTeamId,
      title: form.title.trim(),
      type: form.type,
      contract_id: form.contract_id || null,
      scheduled_for: form.scheduled_for || null,
      proof_url: form.proof_url || null,
      responsible: form.responsible || null,
      contact_id: form.contact_id || null,
    })
    if (e2) { setError(e2.message); setBusy(false); return }
    setForm(EMPTY); await fetchAll(); setBusy(false)
  }

  async function move(id, status) {
    const { error: e } = await sp().from('activations')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) { setError(e.message); return }
    setActs((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
  }

  // ---- Aktivierungs-Vorlagen (activation_templates) CRUD --------------------
  async function createTemplate(e) {
    e.preventDefault()
    if (!activeTeamId || !tplForm.title.trim()) return
    setTplBusy(true); setError(null)
    const { error: e2 } = await sp().from('activation_templates').insert({
      team_id: activeTeamId,
      title: tplForm.title.trim(),
      category_id: tplForm.category_id || null,
      right_id: tplForm.right_id || null,
      sort_order: Number(tplForm.sort_order) || 0,
    })
    if (e2) { setError(e2.message); setTplBusy(false); return }
    setTplForm(TPL_EMPTY); await fetchAll(); setTplBusy(false)
  }

  async function deleteTemplate(id) {
    const { error: e } = await sp().from('activation_templates').delete().eq('id', id)
    if (e) { setError(e.message); return }
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  // ---- Standardaufgaben aus Vorlagen anlegen (RPC) --------------------------
  async function applyTemplates() {
    if (!applyContractId) return
    setApplyBusy(true); setError(null); setApplyMsg(null)
    const { data, error: e } = await supabase.rpc('apply_activation_templates', { p_contract_id: applyContractId })
    if (e) { setError(e.message); setApplyBusy(false); return }
    setApplyMsg(`${data ?? 0} Standardaufgabe(n) angelegt.`)
    await fetchAll()
    setApplyBusy(false)
  }

  // ---- Bild-Nachweis je Aufgabe (Storage privat → signedUrl) ----------------
  async function uploadProof(activationId, file) {
    if (!activeTeamId || !file) return
    setUploadBusy(activationId); setError(null)
    try {
      // STORAGE-REGEL: Pfad MUSS mit `${activeTeamId}/` beginnen (RLS-Gate).
      const path = `${activeTeamId}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from(ACTIVATION_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) { setError('Upload fehlgeschlagen: ' + upErr.message); return }
      const { data: row, error: insErr } = await sp().from('activation_attachments').insert({
        team_id: activeTeamId,
        activation_id: activationId,
        storage_path: path,
        caption: file.name,
      }).select('*').single()
      if (insErr || !row) { setError(insErr?.message || 'Anhang konnte nicht gespeichert werden.'); return }
      const url = await signed(path)
      setAttachments((prev) => [...prev, row])
      setAttUrls((prev) => ({ ...prev, [row.id]: url }))
    } finally {
      setUploadBusy(null)
    }
  }

  async function deleteAttachment(att) {
    setError(null)
    await supabase.storage.from(ACTIVATION_BUCKET).remove([att.storage_path])
    const { error: e } = await sp().from('activation_attachments').delete().eq('id', att.id)
    if (e) { setError(e.message); return }
    setAttachments((prev) => prev.filter((x) => x.id !== att.id))
    setAttUrls((prev) => { const n = { ...prev }; delete n[att.id]; return n })
  }

  const byStatus = (st) => acts.filter((a) => a.status === st)

  if (!activeTeamId) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader
        overline="Sponsoring"
        title="Aktivierung"
        subtitle="Steuere die Aktivierung verkaufter Rechte — der häufigste Renewal-Killer ist nicht-aktiviertes Sponsoring."
      />

      {error && <div style={errBox}>{error}</div>}

      <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr 1fr 1.4fr 1.4fr', gap: 10, alignItems: 'end', ...card, marginBottom: 22 }}>
        <Field label="Maßnahme"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z.B. LinkedIn-Post zum Saisonstart" style={input} /></Field>
        <Field label="Typ">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={input}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Vertrag">
          <select value={form.contract_id} onChange={(e) => setForm({ ...form, contract_id: e.target.value, contact_id: '' })} style={input}>
            <option value="">— keiner —</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{contractLabel[c.id]}</option>)}
          </select>
        </Field>
        <Field label="Termin"><input type="date" value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} style={input} /></Field>
        <Field label="Verantwortlich">
          <select value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} style={input}>
            <option value="">— niemand —</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName[m.user_id]}</option>)}
          </select>
        </Field>
        <Field label="Ansprechpartner">
          <select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })} style={input} disabled={!formContractOrgId}>
            <option value="">{formContractOrgId ? '— keiner —' : '— erst Vertrag wählen —'}</option>
            {contactOptions.map((l) => <option key={l.id} value={l.id}>{leadName[l.id]}</option>)}
          </select>
        </Field>
        <button type="submit" disabled={busy || !form.title.trim()} style={{ ...primaryBtn, gridColumn: '1 / -1', justifySelf: 'end', opacity: busy || !form.title.trim() ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Anlegen
        </button>
      </form>

      {/* Standardaufgaben aus Vorlagen für einen Vertrag materialisieren */}
      <div style={{ ...card, marginBottom: 22, display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap' }}>
        <Field label="Vertrag (Standardaufgaben)">
          <select value={applyContractId} onChange={(e) => { setApplyContractId(e.target.value); setApplyMsg(null) }} style={{ ...input, minWidth: 220 }}>
            <option value="">— Vertrag wählen —</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{contractLabel[c.id]}</option>)}
          </select>
        </Field>
        <button type="button" onClick={applyTemplates} disabled={applyBusy || !applyContractId}
                style={{ ...primaryBtn, opacity: applyBusy || !applyContractId ? 0.6 : 1 }}>
          {applyBusy ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />} Standardaufgaben anlegen
        </button>
        {applyMsg && <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>{applyMsg}</span>}
      </div>

      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, alignItems: 'start' }}>
          {STATUS.map((st) => (
            <div key={st} style={{ background: 'var(--surface-muted, #F8FAFC)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, minHeight: 120 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: STATUS_COLOR[st] }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{STATUS_LABEL[st]}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {byStatus(st).length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {byStatus(st).map((a) => (
                  <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{a.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                      {TYPE_LABEL[a.type] || a.type}
                      {a.contract_id ? ` · ${contractLabel[a.contract_id] || ''}` : ''}
                      {a.scheduled_for ? ` · ${new Date(a.scheduled_for).toLocaleDateString('de-DE')}` : ''}
                    </div>
                    {a.right_id ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Recht: {rightName[a.right_id] || '—'}
                      </div>
                    ) : null}
                    {a.contact_id ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Ansprechpartner: {leadName[a.contact_id] || '—'}
                      </div>
                    ) : null}
                    {a.responsible ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Verantwortlich: {memberName[a.responsible] || '—'}
                      </div>
                    ) : null}
                    <PillSelect value={a.status} onChange={v => move(a.id, v)} neutral options={[...STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} buttonStyle={{ minWidth: 140 }} />

                    {/* Nachweis-Bilder (Bucket privat → signedUrl-Thumbnails) */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {(attByActivation[a.id] || []).map((att) => (
                        <div key={att.id} style={{ position: 'relative' }}>
                          {attUrls[att.id] ? (
                            <img src={attUrls[att.id]} alt={att.caption || 'Nachweis'} title={att.caption || ''}
                                 style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                          ) : (
                            <div style={{ width: 48, height: 48, borderRadius: 6, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                              <ImageIcon size={16} />
                            </div>
                          )}
                          <button type="button" onClick={() => deleteAttachment(att)} title="Nachweis löschen"
                                  style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 999, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <label style={{ ...subtleBtn, marginTop: 8, opacity: uploadBusy === a.id ? 0.6 : 1, cursor: uploadBusy === a.id ? 'default' : 'pointer' }}>
                      {uploadBusy === a.id ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}
                      Nachweis
                      <input type="file" accept="image/*" disabled={uploadBusy === a.id}
                             onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProof(a.id, f); e.target.value = '' }}
                             style={{ display: 'none' }} />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Aktivierungs-Vorlagen (activation_templates) -------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '34px 0 6px' }}>
        <ListChecks size={20} color={PRIMARY} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>Aktivierungs-Vorlagen</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', maxWidth: 660, lineHeight: 1.6 }}>
        Standardaufgaben je Rechte-Kategorie (z.B. Trikotbrust: Logo abstimmen + Liga-Freigabe). Beim Vertrag per „Standardaufgaben anlegen" als Aufgaben materialisiert.
      </p>

      <form onSubmit={createTemplate} style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1.3fr 0.8fr auto', gap: 10, alignItems: 'end', ...card, marginBottom: 16 }}>
        <Field label="Aufgabe"><input value={tplForm.title} onChange={(e) => setTplForm({ ...tplForm, title: e.target.value })} placeholder="z.B. Logo mit Sponsor abstimmen" style={input} /></Field>
        <Field label="Kategorie">
          <select value={tplForm.category_id} onChange={(e) => setTplForm({ ...tplForm, category_id: e.target.value, right_id: '' })} style={input}>
            <option value="">— alle —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Recht (optional)">
          <select value={tplForm.right_id} onChange={(e) => setTplForm({ ...tplForm, right_id: e.target.value })} style={input}>
            <option value="">— keins —</option>
            {tplRightOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Reihenfolge"><input type="number" value={tplForm.sort_order} onChange={(e) => setTplForm({ ...tplForm, sort_order: e.target.value })} style={input} /></Field>
        <button type="submit" disabled={tplBusy || !tplForm.title.trim()} style={{ ...primaryBtn, opacity: tplBusy || !tplForm.title.trim() ? 0.6 : 1 }}>
          {tplBusy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Anlegen
        </button>
      </form>

      {templates.length === 0 ? (
        <div style={muted}>Noch keine Vorlagen.</div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {templates.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 28, textAlign: 'right' }}>{t.sort_order}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', flex: 1 }}>{t.title}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {t.right_id ? (rightName[t.right_id] || 'Recht') : (t.category_id ? (categoryName[t.category_id] || 'Kategorie') : 'alle')}
              </span>
              <button type="button" onClick={() => deleteTemplate(t.id)} title="Vorlage löschen" style={iconDelBtn}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

const card = { border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }
const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
const subtleBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }
const iconDelBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: '#DC2626', cursor: 'pointer', padding: 0 }
