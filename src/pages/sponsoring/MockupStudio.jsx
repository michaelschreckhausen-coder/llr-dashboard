// Sponsoring OS — Mockup-Studio (Stadion-Vorlagen + KI-Mockup-Generierung)
// Drei Blöcke: Stadion-Vorlagen (Upload + Liste), Mockup erstellen (Vorlage +
// Sponsor + Logo → Edge Function generate-mockup), Ergebnisse (Status + Bild).
//
// Liest/schreibt im Schema 'sponsoring' via supabase.schema('sponsoring').
// team_id kommt aus useTeam().activeTeamId.
//
// STORAGE-REGEL: jeder Pfad beginnt mit `${activeTeamId}/` (erste Ordnerebene =
// team_id), sonst greift die RLS nicht. Buckets sind PRIVATE → Anzeige via
// createSignedUrl(path, 3600).

import PillSelect from '../../components/PillSelect'
import { useEffect, useState, useCallback } from 'react'
import { ImagePlus, Plus, Loader2, RefreshCw, Upload, Wand2, Building2, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTeam } from '../../context/TeamContext'
import PageHeader from '../../components/PageHeader'

const PRIMARY = 'var(--wl-primary, #0A6FB0)'
const sp = () => supabase.schema('sponsoring')

const BUCKET_STADIUM = 'sponsoring-stadium'
const BUCKET_MOCKUPS = 'sponsoring-mockups'

const STATUS_LABEL = { pending: 'In Arbeit', done: 'Fertig', failed: 'Fehlgeschlagen' }
const STATUS_COLOR = { pending: '#D97706', done: '#059669', failed: '#DC2626' }

const EMPTY_TPL = { name: '', placement: '' }
const EMPTY_MOCK = { stadium_template_id: '', sponsor_profile_id: '' }

export default function MockupStudio() {
  const { activeTeamId } = useTeam()
  const [templates, setTemplates] = useState([])
  const [tplUrls, setTplUrls] = useState({})       // template.id -> signedUrl
  const [sponsors, setSponsors] = useState([])
  const [orgs, setOrgs] = useState([])
  const [mockups, setMockups] = useState([])
  const [mockUrls, setMockUrls] = useState({})     // mockup.id -> signedUrl
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [tplForm, setTplForm] = useState(EMPTY_TPL)
  const [tplFile, setTplFile] = useState(null)
  const [tplBusy, setTplBusy] = useState(false)

  const [mockForm, setMockForm] = useState(EMPTY_MOCK)
  const [logoFile, setLogoFile] = useState(null)
  const [mockBusy, setMockBusy] = useState(false)

  const signed = useCallback(async (bucket, path) => {
    if (!path) return null
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
    return data?.signedUrl || null
  }, [])

  const fetchAll = useCallback(async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    const [{ data: tpls, error: tErr }, { data: sps, error: sErr }, { data: mks, error: mErr }, { data: orgRows, error: oErr }] = await Promise.all([
      sp().from('stadium_templates').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('sponsor_profiles').select('id, organization_id').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      sp().from('mockups').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
      supabase.from('organizations').select('id, name').eq('team_id', activeTeamId),
    ])
    if (tErr || sErr || mErr || oErr) { setError((tErr || sErr || mErr || oErr).message); setLoading(false); return }
    setTemplates(tpls || [])
    setSponsors(sps || [])
    setMockups(mks || [])
    setOrgs(orgRows || [])

    // Signed-URLs defensiv parallel auflösen
    const tplPairs = await Promise.all((tpls || []).map(async (t) => [t.id, await signed(BUCKET_STADIUM, t.storage_path)]))
    setTplUrls(Object.fromEntries(tplPairs))
    const mockPairs = await Promise.all(
      (mks || []).filter((m) => m.status === 'done' && m.result_path).map(async (m) => [m.id, await signed(BUCKET_MOCKUPS, m.result_path)])
    )
    setMockUrls(Object.fromEntries(mockPairs))
    setLoading(false)
  }, [activeTeamId, signed])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function createTemplate(e) {
    e.preventDefault()
    if (!activeTeamId || !tplForm.name.trim() || !tplFile) return
    setTplBusy(true); setError(null)
    try {
      const path = `${activeTeamId}/${Date.now()}-${tplFile.name}`
      const { error: upErr } = await supabase.storage.from(BUCKET_STADIUM)
        .upload(path, tplFile, { contentType: tplFile.type, upsert: false })
      if (upErr) { setError('Upload fehlgeschlagen: ' + upErr.message); setTplBusy(false); return }
      const { error: insErr } = await sp().from('stadium_templates').insert({
        team_id: activeTeamId,
        name: tplForm.name.trim(),
        placement: tplForm.placement.trim() || null,
        storage_path: path,
      })
      if (insErr) { setError(insErr.message); setTplBusy(false); return }
      setTplForm(EMPTY_TPL); setTplFile(null)
      await fetchAll()
    } finally {
      setTplBusy(false)
    }
  }

  async function deleteTemplate(t) {
    if (!window.confirm(`Vorlage „${t.name}" wirklich löschen?`)) return
    // Erst Storage-Datei entfernen (best effort), dann DB-Row.
    if (t.storage_path) {
      await supabase.storage.from(BUCKET_STADIUM).remove([t.storage_path])
    }
    const { error: delErr } = await sp().from('stadium_templates').delete().eq('id', t.id)
    if (delErr) { setError(delErr.message); return }
    setTemplates((prev) => prev.filter((x) => x.id !== t.id))
  }

  async function createMockup(e) {
    e.preventDefault()
    if (!activeTeamId || !mockForm.stadium_template_id || !logoFile) return
    setMockBusy(true); setError(null)
    try {
      const path = `${activeTeamId}/${Date.now()}-${logoFile.name}`
      const { error: upErr } = await supabase.storage.from(BUCKET_MOCKUPS)
        .upload(path, logoFile, { contentType: logoFile.type, upsert: false })
      if (upErr) { setError('Logo-Upload fehlgeschlagen: ' + upErr.message); setMockBusy(false); return }

      const { data: inserted, error: insErr } = await sp().from('mockups').insert({
        team_id: activeTeamId,
        stadium_template_id: mockForm.stadium_template_id,
        sponsor_profile_id: mockForm.sponsor_profile_id || null,
        logo_path: path,
        status: 'pending',
      }).select('id').single()
      if (insErr || !inserted) { setError(insErr?.message || 'Mockup konnte nicht angelegt werden.'); setMockBusy(false); return }

      const { data, error: fnErr } = await supabase.functions.invoke('generate-mockup', {
        body: { mockup_id: inserted.id },
      })
      if (fnErr || data?.error) {
        setError(fnErr?.message || data?.error || 'Bildgenerierung fehlgeschlagen.')
      }
      setMockForm(EMPTY_MOCK); setLogoFile(null)
      await fetchAll()
    } finally {
      setMockBusy(false)
    }
  }

  if (!activeTeamId) {
    return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Kein aktives Team.</div>
  }

  const tplName = (id) => templates.find((t) => t.id === id)?.name || '—'
  // Sponsor-Name kommt aus organizations.name (sponsor_profiles ist 1:1-Extension).
  const orgNameOf = (orgId) => orgs.find((o) => o.id === orgId)?.name || null
  const sponsorName = (id) => {
    const s = sponsors.find((x) => x.id === id)
    return s ? orgNameOf(s.organization_id) : null
  }
  // Sponsoren clientseitig alphabetisch nach aufgelöstem Org-Namen sortieren (vorher .order('name')).
  const sortedSponsors = [...sponsors].sort(
    (a, b) => (orgNameOf(a.organization_id) || '').localeCompare(orgNameOf(b.organization_id) || ''),
  )

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 40px' }}>
      <PageHeader overline="Sponsoring" title="Mockup-Studio" subtitle="Lade Stadion-Vorlagen hoch und generiere per KI realistische Sponsor-Mockups (Logo auf LED-Bande, Trikot, Hospitality …)." action={
        <button onClick={fetchAll} title="Aktualisieren" style={iconBtn}>
          <RefreshCw size={16} />
        </button>
      } />

      {error && (
        <div style={errBox}>{error}</div>
      )}

      {/* ─── Block 1: Stadion-Vorlagen ─────────────────────────────────────── */}
      <h2 style={sectionTitle}>Stadion-Vorlagen</h2>

      <form onSubmit={createTemplate} style={formCard}>
        <Field label="Name">
          <input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                 placeholder="z.B. Heimstadion Nordtribüne" style={input} />
        </Field>
        <Field label="Platzierung">
          <input value={tplForm.placement} onChange={(e) => setTplForm({ ...tplForm, placement: e.target.value })}
                 placeholder="z.B. LED-Bande" style={input} />
        </Field>
        <Field label="Bild">
          <label style={fileBtn}>
            <Upload size={14} /> {tplFile ? tplFile.name : 'Datei wählen'}
            <input type="file" accept="image/*" onChange={(e) => setTplFile(e.target.files?.[0] || null)}
                   style={{ display: 'none' }} />
          </label>
        </Field>
        <button type="submit" disabled={tplBusy || !tplForm.name.trim() || !tplFile}
                style={{ ...primaryBtn, opacity: tplBusy || !tplForm.name.trim() || !tplFile ? 0.6 : 1 }}>
          {tplBusy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Vorlage anlegen
        </button>
      </form>

      {loading ? (
        <div style={muted}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : templates.length === 0 ? (
        <div style={muted}>Noch keine Stadion-Vorlagen.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ ...tileCard, position: 'relative' }}>
              <button type="button" onClick={() => deleteTemplate(t)} title="Vorlage löschen"
                style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(15,23,42,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={14} />
              </button>
              <div style={thumbBox}>
                {tplUrls[t.id] ? (
                  <img src={tplUrls[t.id]} alt={t.name} style={thumbImg} />
                ) : (
                  <ImagePlus size={28} color="var(--text-muted)" />
                )}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 13.5 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t.placement || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Block 2: Mockup erstellen ─────────────────────────────────────── */}
      <h2 style={sectionTitle}>Mockup erstellen</h2>

      <form onSubmit={createMockup} style={formCard}>
        <Field label="Stadion-Vorlage">
          <select value={mockForm.stadium_template_id}
                  onChange={(e) => setMockForm({ ...mockForm, stadium_template_id: e.target.value })} style={input}>
            <option value="">— wählen —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.placement ? ` · ${t.placement}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Sponsor (optional)">
          <PillSelect value={mockForm.sponsor_profile_id} onChange={v => setMockForm({ ...mockForm, sponsor_profile_id: v })} neutral options={[{ value: '', label: `— keiner —` }, ...sortedSponsors.map((s) => ({ value: s.id, label: orgNameOf(s.organization_id) || '—' }))]} buttonStyle={{ minWidth: 140 }} />
        </Field>
        <Field label="Sponsor-Logo">
          <label style={fileBtn}>
            <Upload size={14} /> {logoFile ? logoFile.name : 'Logo wählen'}
            <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                   style={{ display: 'none' }} />
          </label>
        </Field>
        <button type="submit" disabled={mockBusy || !mockForm.stadium_template_id || !logoFile}
                className="lk-btn lk-btn-navy" style={{ opacity: mockBusy || !mockForm.stadium_template_id || !logoFile ? 0.6 : 1 }}>
          {mockBusy ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />}
          {mockBusy ? 'Generiere…' : 'Mockup generieren'}
        </button>
      </form>
      {mockBusy && (
        <div style={{ ...muted, marginTop: -12, marginBottom: 28 }}>
          <Loader2 size={14} className="spin" /> Bildgenerierung läuft — das kann einen Moment dauern.
        </div>
      )}

      {/* ─── Block 3: Ergebnisse ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Ergebnisse</h2>
        <button onClick={fetchAll} className="lk-btn lk-btn-ghost">
          <RefreshCw size={14} /> Neu laden
        </button>
      </div>

      {loading ? (
        <div style={{ ...muted, marginTop: 14 }}><Loader2 size={16} className="spin" /> Lade…</div>
      ) : mockups.length === 0 ? (
        <div style={{ ...muted, marginTop: 14 }}>Noch keine Mockups erstellt.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginTop: 16 }}>
          {mockups.map((m) => {
            const sName = sponsorName(m.sponsor_profile_id)
            return (
              <div key={m.id} style={tileCard}>
                <div style={{ ...thumbBox, minHeight: 160 }}>
                  {m.status === 'done' && mockUrls[m.id] ? (
                    <img src={mockUrls[m.id]} alt="Mockup" style={thumbImg} />
                  ) : m.status === 'failed' ? (
                    <div style={{ padding: 16, fontSize: 12.5, color: '#991B1B', textAlign: 'center', lineHeight: 1.5 }}>
                      {m.error || 'Generierung fehlgeschlagen.'}
                    </div>
                  ) : m.status === 'done' ? (
                    <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
                      Bild nicht verfügbar.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                      <Loader2 size={16} className="spin" /> In Arbeit…
                    </div>
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 13 }}>
                      {tplName(m.stadium_template_id)}
                    </span>
                    <span style={{ ...badge, color: STATUS_COLOR[m.status] || 'var(--text-muted)',
                                   background: (STATUS_COLOR[m.status] || '#888') + '1A' }}>
                      {STATUS_LABEL[m.status] || m.status}
                    </span>
                  </div>
                  {sName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      <Building2 size={12} /> {sName}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
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

const input = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13.5, width: '100%', boxSizing: 'border-box',
}
const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999,
  border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}
const secondaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer',
}
const fileBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8,
  border: '1px dashed var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 13,
  cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const formCard = {
  display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1.2fr auto', gap: 12, alignItems: 'end',
  border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16, marginBottom: 22,
}
const tileCard = {
  border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)',
}
const thumbBox = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 130,
  background: 'var(--surface-muted, #F8FAFC)', borderBottom: '1px solid var(--border)',
}
const thumbImg = { width: '100%', height: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }
const badge = { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap' }
const sectionTitle = { fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 14px' }
const muted = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14, marginBottom: 22 }
const errBox = { padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13, marginBottom: 16 }
