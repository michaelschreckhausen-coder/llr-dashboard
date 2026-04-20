import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY = {
  name: '', industries: '', job_titles: '', company_sizes: '',
  locations: '', keywords: '', pain_points: '', is_default: false
}
const a2s = a => Array.isArray(a) ? a.join(', ') : (a || '')
const ta  = s => s ? s.split(',').map(t => t.trim()).filter(Boolean) : []

function TagInput({ label, value, onChange, placeholder }) {
  const [v, setV] = useState('')
  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : []
  const add = () => {
    if (!v.trim()) return
    onChange([...tags, v.trim()].join(', '))
    setV('')
  }
  const rm = i => onChange(tags.filter((_, j) => j !== i).join(', '))
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '7px 10px', border: '1.5px solid #E2E8F0', borderRadius: 9, minHeight: 38, background: 'var(--surface)' }}>
        {tags.map((t, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', background: '#EFF6FF', color: '#0A66C2', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
            {t}
            <span onClick={() => rm(i)} style={{ cursor: 'pointer', marginLeft: 3, fontWeight: 800 }}>x</span>
          </span>
        ))}
        <input
          value={v}
          onChange={e => setV(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          placeholder={tags.length === 0 ? placeholder : '+ add'}
          style={{ border: 'none', outline: 'none', fontSize: 12, minWidth: 80, flex: 1, background: 'transparent' }}
        />
      </div>
    </div>
  )
}

export default function ICP({ session }) {
  const [icps, setIcps]       = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('icp_profiles').select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
    setIcps(data || [])
  }, [session.user.id])

  useEffect(() => { load() }, [load])

  const sf = k => w => setForm(f => ({ ...f, [k]: w }))

  async function save() {
    if (!form.name?.trim()) return
    setSaving(true)
    const p = {
      ...form,
      user_id: session.user.id,
      industries:    ta(form.industries),
      job_titles:    ta(form.job_titles),
      company_sizes: ta(form.company_sizes),
      locations:     ta(form.locations),
      keywords:      ta(form.keywords),
    }
    if (editing === 'new') await supabase.from('icp_profiles').insert(p)
    else await supabase.from('icp_profiles').update(p).eq('id', editing.id)
    await load()
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); setEditing(null) }, 1500)
  }

  async function setDefault(id) {
    await supabase.from('icp_profiles').update({ is_default: false }).eq('user_id', session.user.id)
    await supabase.from('icp_profiles').update({ is_default: true }).eq('id', id)
    load()
  }

  async function del(id) {
    if (!window.confirm('ICP loeschen?')) return
    await supabase.from('icp_profiles').delete().eq('id', id)
    load()
  }

  const inp = { width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }

  if (editing !== null) {
    return (
      <div style={{ maxWidth: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>
            &#8592;
          </button>
          <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>
            {editing === 'new' ? 'Neues ICP' : 'ICP bearbeiten'}
          </h1>
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid #E2E8F0', padding: '22px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Name *</label>
            <input value={form.name} onChange={e => sf('name')(e.target.value)} placeholder="z.B. DACH B2B Entscheider" style={inp} />
          </div>
          <TagInput label="Branchen"             value={form.industries}    onChange={sf('industries')}    placeholder="SaaS, Marketing" />
          <TagInput label="Job-Titel"            value={form.job_titles}    onChange={sf('job_titles')}    placeholder="CEO, CMO, VP" />
          <TagInput label="Unternehmensgroessen" value={form.company_sizes} onChange={sf('company_sizes')} placeholder="startup, smb" />
          <TagInput label="Standorte"            value={form.locations}     onChange={sf('locations')}     placeholder="Deutschland, DACH" />
          <TagInput label="Keywords"             value={form.keywords}      onChange={sf('keywords')}      placeholder="B2B, LinkedIn" />
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Pain Points</label>
            <textarea value={form.pain_points || ''} onChange={e => sf('pain_points')(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 20 }}>
            <input type="checkbox" checked={form.is_default || false} onChange={e => sf('is_default')(e.target.checked)} />
            Als Standard-ICP verwenden
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0' }}>
          <button onClick={() => setEditing(null)} style={{ padding: '8px 18px', borderRadius: 18, background: '#F1F5F9', border: 'none', fontSize: 13, cursor: 'pointer' }}>
            Abbrechen
          </button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {saved && <span style={{ color: '#057642', fontSize: 13, fontWeight: 600 }}>Gespeichert!</span>}
            <button onClick={save} disabled={saving || !form.name?.trim()} style={{ padding: '9px 24px', borderRadius: 18, background: 'linear-gradient(135deg,#0A66C2,#8B5CF6)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Zielgruppen (ICP)</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>Ideal Customer Profiles fuer automatisches Lead Scoring</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setEditing('new') }}
          style={{ padding: '9px 18px', borderRadius: 9, background: 'linear-gradient(135deg,#0A66C2,#8B5CF6)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + Neues ICP
        </button>
      </div>

      {icps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', background: 'var(--surface)', borderRadius: 14, border: '2px dashed #E2E8F0' }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>&#127919;</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 7 }}>Noch kein ICP</div>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>Erstelle ein ICP um Lead Scoring zu aktivieren.</p>
          <button
            onClick={() => { setForm(EMPTY); setEditing('new') }}
            style={{ padding: '10px 24px', borderRadius: 18, background: 'linear-gradient(135deg,#0A66C2,#8B5CF6)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            ICP erstellen
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {icps.map(icp => (
            <div key={icp.id} style={{ background: 'var(--surface)', borderRadius: 12, border: icp.is_default ? '2px solid #0A66C2' : '1.5px solid #E2E8F0', padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{icp.name}</span>
                    {icp.is_default && (
                      <span style={{ padding: '2px 9px', borderRadius: 9, fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#0A66C2' }}>Standard</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {(icp.job_titles  || []).slice(0, 4).map(t => <span key={t} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, background: '#F0FDF4', color: '#166534' }}>{t}</span>)}
                    {(icp.industries  || []).slice(0, 4).map(t => <span key={t} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, background: '#EFF6FF', color: '#0A66C2' }}>{t}</span>)}
                    {(icp.locations   || []).slice(0, 3).map(t => <span key={t} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, background: '#FFFBEB', color: '#92400E' }}>{t}</span>)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 14, flexWrap: 'wrap' }}>
                  {!icp.is_default && (
                    <button onClick={() => setDefault(icp.id)} style={{ padding: '6px 11px', borderRadius: 7, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 11, cursor: 'pointer', color: '#475569' }}>
                      Aktivieren
                    </button>
                  )}
                  <button
                    onClick={() => { setForm({ ...icp, industries: a2s(icp.industries), job_titles: a2s(icp.job_titles), company_sizes: a2s(icp.company_sizes), locations: a2s(icp.locations), keywords: a2s(icp.keywords) }); setEditing(icp) }}
                    style={{ padding: '6px 11px', borderRadius: 7, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 11, cursor: 'pointer', color: '#475569' }}
                  >
                    Bearbeiten
                  </button>
                  <button onClick={() => del(icp.id)} style={{ padding: '6px 11px', borderRadius: 7, border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 11, cursor: 'pointer', color: '#DC2626' }}>
                    x
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
