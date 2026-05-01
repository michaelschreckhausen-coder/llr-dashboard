import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MODULES, MODULE_KEYS } from '../lib/modules'

/* ── SVG Icons ── */
const PlusIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const EditIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const CopyIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const TrialIcon = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>

/* ── Modal ── */
function Modal({ title, onClose, children, width = 640 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'var(--surface)', borderRadius:16, boxShadow:'0 24px 64px rgba(15,23,42,0.18)', width, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'var(--surface)', zIndex:1 }}>
          <div style={{ fontWeight:800, fontSize:15, color:'var(--text-strong)' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', width:30, height:30, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--text-muted)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── Modul-Chip (Anzeige in Liste) ── */
function ModuleChip({ moduleKey }) {
  const m = MODULES[moduleKey]
  if (!m) return null
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:700,
      background: (m.color || '#64748B') + '14',
      color: m.color || '#64748B',
      border: '1px solid ' + (m.color || '#64748B') + '33',
    }}>{m.label}</span>
  )
}

/* ── Modul-Toggle (Editor) ── */
function ModuleToggle({ moduleKey, checked, onChange }) {
  const m = MODULES[moduleKey]
  if (!m) return null
  return (
    <label style={{
      display:'flex', alignItems:'flex-start', gap:12,
      padding:'12px 14px', borderRadius:10,
      border:'1.5px solid ' + (checked ? m.color : 'var(--border)'),
      background: checked ? (m.color + '0A') : 'var(--surface)',
      cursor:'pointer', transition:'all 0.15s',
      userSelect:'none',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop:2, accentColor: m.color, cursor:'pointer', flexShrink:0 }}
      />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color: checked ? m.color : 'var(--text-strong)', marginBottom:2 }}>{m.label}</div>
        <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.5 }}>{m.description}</div>
      </div>
    </label>
  )
}

/* ── Plan-Editor (Modal-Inhalt) ── */
function PlanEditor({ plan, onClose, onSaved }) {
  const isNew = !plan?.id
  const [form, setForm] = useState(() => ({
    id:                       plan?.id || '',
    slug:                     plan?.slug || '',
    name:                     plan?.name || '',
    description:              plan?.description || '',
    price_monthly:            plan?.price_monthly ?? 0,
    price_yearly:             plan?.price_yearly ?? 0,
    max_team_members:         plan?.max_team_members ?? 1,
    max_leads:                plan?.max_leads ?? 100,
    max_brand_voices:         plan?.max_brand_voices ?? 1,
    max_ai_generations:       plan?.max_ai_generations ?? 100,
    max_vernetzungen_per_day: plan?.max_vernetzungen_per_day ?? 50,
    is_active:                plan?.is_active ?? true,
    is_trial:                 plan?.is_trial ?? false,
    trial_days:                plan?.trial_days ?? 14,
    is_default_trial:         plan?.is_default_trial ?? false,
    modules:                  Array.isArray(plan?.modules) ? plan.modules : [],
    // Legacy-Booleans werden beim Save aus modules abgeleitet (siehe save())
  }))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function toggleModule(key, on) {
    setForm(f => ({
      ...f,
      modules: on
        ? Array.from(new Set([...(f.modules || []), key]))
        : (f.modules || []).filter(m => m !== key),
    }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      // Legacy-Sync: feature_brand_voice / feature_pipeline / feature_reports / ai_access
      // werden anhand der Modul-Auswahl gesetzt — Rückwärtskompatibilität für PlanGate.
      const payload = {
        id:                       (form.id || '').trim().toLowerCase(),
        slug:                     form.slug?.trim() || null,
        name:                     form.name.trim(),
        description:              form.description?.trim() || null,
        price_monthly:            Number(form.price_monthly) || 0,
        price_yearly:             Number(form.price_yearly) || 0,
        max_team_members:         Number(form.max_team_members) || 1,
        max_leads:                Number(form.max_leads) || 100,
        max_brand_voices:         Number(form.max_brand_voices) || 1,
        max_ai_generations:       Number(form.max_ai_generations) || 100,
        max_vernetzungen_per_day: Number(form.max_vernetzungen_per_day) || 50,
        is_active:                !!form.is_active,
        is_trial:                 !!form.is_trial,
        trial_days:               form.is_trial ? (Number(form.trial_days) || 14) : null,
        is_default_trial:         !!form.is_default_trial,
        modules:                  form.modules || [],
        // Legacy-Spiegel
        feature_brand_voice:      form.modules.includes('branding'),
        feature_pipeline:         form.modules.includes('crm'),
        feature_reports:          form.modules.includes('reports'),
        ai_access:                form.modules.includes('content') || form.modules.includes('branding'),
      }

      if (!payload.id) throw new Error('Slug ist Pflicht')
      if (!payload.name) throw new Error('Name ist Pflicht')

      let res
      if (isNew) {
        res = await supabase.from('plans').insert(payload).select().maybeSingle()
      } else {
        // ID darf bei Update nicht verändert werden
        const { id, ...rest } = payload
        res = await supabase.from('plans').update(rest).eq('id', plan.id).select().maybeSingle()
      }
      if (res.error) throw res.error

      onSaved?.(res.data)
      onClose?.()
    } catch (e) {
      setError(e.message || 'Speichern fehlgeschlagen')
      setSaving(false)
    }
  }

  return (
    <div style={{ padding:'20px 24px 24px' }}>
      {error && (
        <div style={{ padding:'10px 14px', borderRadius:10, background:'#FEF2F2', color:'#991B1B', fontSize:12, marginBottom:14, border:'1px solid #FCA5A5' }}>
          {error}
        </div>
      )}

      {/* Grunddaten */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
        <Field label="Name" required>
          <input
            value={form.name}
            onChange={e => setField('name', e.target.value)}
            placeholder="z.B. LinkedIn Suite Basic"
            style={inputStyle}
          />
        </Field>
        <Field label="Slug (id)" required hint={isNew ? 'einmalig — wird nach Speichern fix' : 'kann nicht mehr geändert werden'}>
          <input
            value={form.id}
            onChange={e => setField('id', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
            placeholder="trial-branding-only"
            disabled={!isNew}
            style={{ ...inputStyle, opacity: isNew ? 1 : 0.6 }}
          />
        </Field>
      </div>

      <Field label="Beschreibung" hint="optional, wird Usern angezeigt">
        <textarea
          value={form.description}
          onChange={e => setField('description', e.target.value)}
          rows={2}
          placeholder="z.B. 14-Tage-Trial mit allen Branding-Funktionen"
          style={{ ...inputStyle, fontFamily:'inherit', resize:'vertical' }}
        />
      </Field>

      {/* Module — Kernstück */}
      <div style={{ marginTop:18 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-strong)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>
          Freigeschaltete Bereiche
        </div>
        <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:12 }}>
          User mit diesem Plan sehen nur die hier ausgewählten Bereiche in der Sidebar.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {MODULE_KEYS.map(k => (
            <ModuleToggle
              key={k}
              moduleKey={k}
              checked={form.modules.includes(k)}
              onChange={(on) => toggleModule(k, on)}
            />
          ))}
        </div>
      </div>

      {/* Trial */}
      <div style={{ marginTop:18, padding:14, borderRadius:12, background:'var(--surface-muted, #F8FAFC)', border:'1px solid var(--border)' }}>
        <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', userSelect:'none' }}>
          <input
            type="checkbox"
            checked={form.is_trial}
            onChange={e => setField('is_trial', e.target.checked)}
            style={{ accentColor: 'var(--wl-primary, rgb(49,90,231))', cursor:'pointer' }}
          />
          <span style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)' }}>Trial-Plan</span>
        </label>
        {form.is_trial && (
          <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Trial-Dauer (Tage)">
              <input
                type="number"
                min={1}
                max={365}
                value={form.trial_days}
                onChange={e => setField('trial_days', e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Default-Trial bei Sign-up?" hint="max. 1 Plan global">
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', height:40 }}>
                <input
                  type="checkbox"
                  checked={form.is_default_trial}
                  onChange={e => setField('is_default_trial', e.target.checked)}
                  style={{ accentColor: 'var(--wl-primary, rgb(49,90,231))', cursor:'pointer' }}
                />
                <span style={{ fontSize:12, color:'var(--text-muted)' }}>
                  {form.is_default_trial ? 'Ja — neue Konten starten auf diesem Plan' : 'Nein'}
                </span>
              </label>
            </Field>
          </div>
        )}
      </div>

      {/* Slug */}
      <div style={{ marginTop:14 }}>
        <Field label="URL-Slug" hint="optional, z.B. für Pricing-Page">
          <input
            value={form.slug}
            onChange={e => setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
            placeholder="z.B. branding-trial"
            style={inputStyle}
          />
        </Field>
      </div>

      {/* Preis */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:14 }}>
        <Field label="Preis monatlich (€)">
          <input
            type="number" step="0.01" min={0}
            value={form.price_monthly}
            onChange={e => setField('price_monthly', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Preis jährlich (€)">
          <input
            type="number" step="0.01" min={0}
            value={form.price_yearly}
            onChange={e => setField('price_yearly', e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      {/* Limits */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginTop:14 }}>
        <Field label="Team-Mitglieder">
          <input type="number" min={1} value={form.max_team_members} onChange={e => setField('max_team_members', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Max. Leads" hint="-1 = unbegrenzt">
          <input type="number" min={-1} value={form.max_leads} onChange={e => setField('max_leads', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Vernetzungen / Tag">
          <input type="number" min={0} value={form.max_vernetzungen_per_day} onChange={e => setField('max_vernetzungen_per_day', e.target.value)} style={inputStyle} />
        </Field>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:14 }}>
        <Field label="Brand Voices">
          <input type="number" min={0} value={form.max_brand_voices} onChange={e => setField('max_brand_voices', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="KI-Generierungen / Monat">
          <input type="number" min={0} value={form.max_ai_generations} onChange={e => setField('max_ai_generations', e.target.value)} style={inputStyle} />
        </Field>
      </div>

      {/* Lifecycle */}
      <div style={{ marginTop:14 }}>
        <Field label="Aktiv">
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', height:40 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setField('is_active', e.target.checked)}
              style={{ accentColor: 'var(--wl-primary, rgb(49,90,231))', cursor:'pointer' }}
            />
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>
              {form.is_active ? 'Plan ist sichtbar und auswählbar' : 'Plan ist deaktiviert'}
            </span>
          </label>
        </Field>
      </div>

      {/* Footer-Buttons */}
      <div style={{ marginTop:24, display:'flex', justifyContent:'flex-end', gap:10 }}>
        <button onClick={onClose} style={btnGhost}>Abbrechen</button>
        <button onClick={save} disabled={saving || !form.name || !form.id} style={btnPrimary}>
          {saving ? 'Speichert…' : isNew ? 'Plan anlegen' : 'Änderungen speichern'}
        </button>
      </div>
    </div>
  )
}

/* ── Field-Wrapper ── */
function Field({ label, required, hint, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--text-strong)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
        {label}{required && <span style={{ color:'#EF4444' }}> *</span>}
      </label>
      {children}
      {hint && <span style={{ fontSize:10, color:'var(--text-muted)' }}>{hint}</span>}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-strong)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const btnPrimary = {
  padding: '10px 20px',
  borderRadius: 999,
  background: 'var(--wl-primary, rgb(49,90,231))',
  color: '#fff',
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(49,90,231,0.25)',
}

const btnGhost = {
  padding: '10px 20px',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid var(--border)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

/* ══════════════════════════════════════
   ADMIN PLANS HAUPTSEITE
══════════════════════════════════════ */
export default function AdminPlans() {
  const [plans,    setPlans]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [editPlan, setEditPlan] = useState(null) // { ... } oder { _new: true }
  const [flash,    setFlash]    = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('price_monthly', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true })
    if (error) {
      setError(error.message)
    } else {
      setPlans(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showFlash(msg, kind = 'success') {
    setFlash({ msg, kind })
    setTimeout(() => setFlash(null), 3500)
  }

  function startNew() {
    setEditPlan({ _new: true })
  }
  function startEdit(p) {
    setEditPlan(p)
  }
  function startDuplicate(p) {
    const copy = {
      ...p,
      _new: true,
      id: '',
      slug: '',
      name: p.name + ' (Kopie)',
      is_default_trial: false,
    }
    setEditPlan(copy)
  }

  async function toggleActive(p) {
    const { error } = await supabase.from('plans').update({ is_active: !p.is_active }).eq('id', p.id)
    if (error) showFlash(error.message, 'error')
    else { showFlash(p.is_active ? 'Plan deaktiviert' : 'Plan aktiviert'); load() }
  }

  return (
    <div style={{ padding:'28px 32px', maxWidth:1200, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ fontSize:24, fontWeight:900, color:'var(--text-strong)', letterSpacing:'-0.02em', marginBottom:4 }}>
            Pläne & Module
          </div>
          <div style={{ fontSize:13, color:'var(--text-muted)' }}>
            Lege Pläne an und definiere, welche App-Bereiche pro Plan freigeschaltet sind
          </div>
        </div>
        <button onClick={startNew} style={{ ...btnPrimary, display:'inline-flex', alignItems:'center', gap:8 }}>
          <PlusIcon /> Neuer Plan
        </button>
      </div>

      {/* Flash */}
      {flash && (
        <div style={{
          padding:'10px 14px', borderRadius:10, marginBottom:14, fontSize:13, fontWeight:600,
          background: flash.kind === 'error' ? '#FEF2F2' : '#F0FDF4',
          color:      flash.kind === 'error' ? '#991B1B' : '#166534',
          border: '1px solid ' + (flash.kind === 'error' ? '#FCA5A5' : '#86EFAC'),
        }}>{flash.msg}</div>
      )}

      {/* Inhalt */}
      {loading ? (
        <div style={{ padding:60, textAlign:'center', color:'var(--text-muted)' }}>Lädt…</div>
      ) : error ? (
        <div style={{ padding:20, borderRadius:12, background:'#FEF2F2', color:'#991B1B', fontSize:13, border:'1px solid #FCA5A5' }}>
          Fehler beim Laden: {error}
        </div>
      ) : plans.length === 0 ? (
        <div style={{ padding:60, textAlign:'center', color:'var(--text-muted)', borderRadius:16, border:'2px dashed var(--border)', background:'var(--surface)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text-strong)', marginBottom:6 }}>Noch keine Pläne</div>
          <div style={{ fontSize:13, marginBottom:16 }}>Lege deinen ersten Plan an, um Module pro Account freizuschalten.</div>
          <button onClick={startNew} style={{ ...btnPrimary, display:'inline-flex', alignItems:'center', gap:8 }}>
            <PlusIcon /> Ersten Plan anlegen
          </button>
        </div>
      ) : (
        <div style={{ background:'var(--surface)', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden', boxShadow:'0 1px 3px rgba(15,23,42,0.05)' }}>
          {/* Header-Zeile */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr 1fr 100px 130px', gap:12, padding:'14px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface-muted, #F8FAFC)', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
            <div>Plan</div>
            <div>Module</div>
            <div>Trial / Preis</div>
            <div style={{ textAlign:'center' }}>Aktiv</div>
            <div style={{ textAlign:'right' }}>Aktionen</div>
          </div>

          {plans.map(p => {
            const modules = Array.isArray(p.modules) ? p.modules : []
            return (
              <div key={p.id} style={{
                display:'grid', gridTemplateColumns:'1fr 1.5fr 1fr 100px 130px', gap:12,
                padding:'16px 20px',
                borderBottom:'1px solid var(--border)',
                alignItems:'center',
                opacity: p.is_active ? 1 : 0.55,
              }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--text-strong)', marginBottom:2 }}>{p.name}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'ui-monospace, monospace' }}>{p.id}</div>
                </div>

                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {modules.length === 0
                    ? <span style={{ fontSize:11, color:'var(--text-muted)', fontStyle:'italic' }}>keine</span>
                    : modules.map(m => <ModuleChip key={m} moduleKey={m} />)
                  }
                </div>

                <div style={{ fontSize:12 }}>
                  {p.is_trial ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:5, color:'#92400E', background:'#FEF3C7', padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700, alignSelf:'flex-start' }}>
                        <TrialIcon /> Trial · {p.trial_days || '?'}d
                      </span>
                      {p.is_default_trial && (
                        <span style={{ fontSize:10, color:'var(--text-muted)' }}>Default bei Sign-up</span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color:'var(--text-strong)', fontWeight:700 }}>
                      {p.price_monthly > 0 ? Number(p.price_monthly).toLocaleString('de-DE', { style:'currency', currency:'EUR' }) + ' / Mon.' : 'kostenlos'}
                    </span>
                  )}
                </div>

                <div style={{ textAlign:'center' }}>
                  <button
                    onClick={() => toggleActive(p)}
                    title={p.is_active ? 'Deaktivieren' : 'Aktivieren'}
                    style={{
                      width:36, height:20, borderRadius:999,
                      background: p.is_active ? '#10B981' : '#CBD5E1',
                      border:'none', cursor:'pointer', position:'relative', padding:0,
                      transition:'background 0.2s',
                    }}
                  >
                    <span style={{
                      position:'absolute', top:2,
                      left: p.is_active ? 18 : 2,
                      width:16, height:16, borderRadius:'50%', background:'#fff',
                      transition:'left 0.2s',
                      boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
                    }}/>
                  </button>
                </div>

                <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                  <button onClick={() => startEdit(p)} title="Bearbeiten" style={iconBtn}><EditIcon/></button>
                  <button onClick={() => startDuplicate(p)} title="Duplizieren" style={iconBtn}><CopyIcon/></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Editor-Modal */}
      {editPlan && (
        <Modal
          title={editPlan._new ? 'Neuen Plan anlegen' : 'Plan bearbeiten: ' + (editPlan.name || editPlan.id)}
          onClose={() => setEditPlan(null)}
          width={680}
        >
          <PlanEditor
            plan={editPlan._new ? { ...editPlan, _new: undefined } : editPlan}
            onClose={() => setEditPlan(null)}
            onSaved={() => { showFlash(editPlan._new ? 'Plan angelegt' : 'Plan gespeichert'); load() }}
          />
        </Modal>
      )}
    </div>
  )
}

const iconBtn = {
  width: 32, height: 32, borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
}
