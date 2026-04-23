import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const PRIMARY = 'var(--wl-primary, rgb(49,90,231))'

/**
 * ProjektStartenModal
 * ─────────────────────
 * Wiederverwendbares Modal, das aus einem (idealerweise gewonnenen) Deal
 * ein neues Projekt anlegt. Prüft vorher, ob bereits ein aktives Projekt
 * für den Deal existiert.
 *
 * Props:
 *   deal       — Deal-Objekt (mit id, title, value, currency, lead_id)
 *   lead       — optionales Lead-Objekt (first_name, last_name, company)
 *   session    — Supabase-Session (für user_id)
 *   onClose    — Callback beim Schließen
 *   onCreated  — Callback(project) nach erfolgreicher Erstellung
 */
export default function ProjektStartenModal({ deal, lead, session, onClose, onCreated }) {
  const navigate = useNavigate()
  const { activeTeamId } = useTeam()

  const [existing, setExisting]   = useState(null) // falls schon ein Projekt existiert
  const [checking, setChecking]   = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState(null)

  const today = new Date().toISOString().slice(0, 10)
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  const [form, setForm] = useState({
    name:          deal?.title || '',
    description:   '',
    start_date:    today,
    due_date:      in30Days,
    budget_amount: deal?.value || '',
    currency:      deal?.currency || 'EUR',
    budget_hours:  '',
    hourly_rate:   ''
  })

  // ─── Prüfen ob schon ein aktives Projekt existiert ─────────────────────
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!deal?.id || !activeTeamId) { setChecking(false); return }
      const { data, error: qErr } = await supabase
        .from('pm_projects')
        .select('id, name, status')
        .eq('deal_id', deal.id)
        .eq('team_id', activeTeamId)
        .neq('status', 'archived')
        .maybeSingle()
      if (cancelled) return
      if (qErr) { setError(qErr.message); setChecking(false); return }
      setExisting(data || null)
      setChecking(false)
    }
    check()
    return () => { cancelled = true }
  }, [deal?.id, activeTeamId])

  async function handleCreate() {
    if (!form.name.trim()) { setError('Projektname ist erforderlich.'); return }
    if (!activeTeamId)     { setError('Kein aktives Team — bitte Seite neu laden.'); return }
    if (!session?.user?.id) { setError('Nicht eingeloggt.'); return }

    setSaving(true); setError(null)

    // 1. Projekt anlegen
    const { data: project, error: pErr } = await supabase
      .from('pm_projects')
      .insert({
        user_id:       session.user.id,
        team_id:       activeTeamId,
        deal_id:       deal?.id || null,
        lead_id:       lead?.id || deal?.lead_id || null,
        name:          form.name.trim(),
        description:   form.description.trim() || null,
        color:         '#0A66C2',
        status:        'active',
        start_date:    form.start_date || null,
        due_date:      form.due_date || null,
        budget_amount: form.budget_amount ? Number(form.budget_amount) : null,
        budget_hours:  form.budget_hours ? Number(form.budget_hours) : null,
        hourly_rate:   form.hourly_rate ? Number(form.hourly_rate) : null,
        currency:      form.currency || 'EUR',
        is_billable:   true
      })
      .select()
      .single()

    if (pErr) {
      setError('Fehler beim Anlegen: ' + pErr.message)
      setSaving(false)
      return
    }

    // 2. Default-Spalten anlegen (3x: Zu tun / In Bearbeitung / Erledigt)
    const defaultColumns = [
      { name: 'Zu tun',         position: 0, color: '#64748B' },
      { name: 'In Bearbeitung', position: 1, color: '#0A66C2' },
      { name: 'Erledigt',       position: 2, color: '#059669' }
    ]

    const { error: cErr } = await supabase
      .from('pm_columns')
      .insert(defaultColumns.map(c => ({
        ...c,
        project_id: project.id,
        team_id:    activeTeamId,
        user_id:    session.user.id
      })))

    if (cErr) {
      // Projekt ist trotzdem da — nur Spalten fehlen. Nicht abbrechen, aber loggen.
      console.warn('Spalten-Anlage fehlgeschlagen:', cErr.message)
    }

    // 3. Activity-Log (best-effort, nicht kritisch)
    await supabase.from('pm_activity_log').insert({
      project_id: project.id,
      user_id:    session.user.id,
      action:     'project_created',
      detail:     deal ? `Aus Deal "${deal.title}" erstellt` : 'Projekt erstellt'
    }).then(() => {}, () => {}) // silently ignore

    setSaving(false)

    if (onCreated) onCreated(project)
    navigate(`/projekte/${project.id}`)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────────
  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(15,23,42,0.55)',
      backdropFilter:'blur(4px)', display:'flex', alignItems:'center',
      justifyContent:'center', zIndex:2000, padding:16
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--surface)', borderRadius:20, width:'100%', maxWidth:560,
        maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.2)'
      }}>

        {/* Header */}
        <div style={{
          padding:'20px 26px', borderBottom:'1px solid #F1F5F9',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          position:'sticky', top:0, background:'var(--surface)', zIndex:1,
          borderRadius:'20px 20px 0 0'
        }}>
          <div>
            <div style={{fontSize:18, fontWeight:800, color:'var(--text-strong)'}}>
              🚀 Projekt starten
            </div>
            {deal && (
              <div style={{fontSize:12, color:'var(--text-muted)', marginTop:3}}>
                Aus Deal: <strong>{deal.title}</strong>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background:'none', border:'none', cursor:'pointer',
            fontSize:24, color:'var(--text-muted)', padding:0, lineHeight:1
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{padding:'22px 26px'}}>

          {checking && (
            <div style={{padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:13}}>
              Prüfe Projekt-Status…
            </div>
          )}

          {!checking && existing && (
            <div style={{
              background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:12,
              padding:'16px 18px', marginBottom:14
            }}>
              <div style={{fontSize:14, fontWeight:700, color:'#92400E', marginBottom:6}}>
                ⚠ Es existiert bereits ein aktives Projekt für diesen Deal
              </div>
              <div style={{fontSize:12, color:'#92400E', marginBottom:12}}>
                „{existing.name}" (Status: {existing.status})
              </div>
              <button onClick={() => { onClose?.(); navigate(`/projekte/${existing.id}`) }}
                style={btnPrimaryStyle}>
                → Zum bestehenden Projekt
              </button>
            </div>
          )}

          {!checking && !existing && (
            <>
              {error && (
                <div style={{
                  background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8,
                  padding:'10px 12px', marginBottom:14, fontSize:13, color:'#B91C1C'
                }}>
                  {error}
                </div>
              )}

              <Field label="Projektname *">
                <input type="text" value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="z.B. Webdesign für Kunde ABC"
                  style={inpStyle} autoFocus />
              </Field>

              <Field label="Beschreibung (optional)">
                <textarea value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  rows={2} placeholder="Kurze Zusammenfassung des Projekts…"
                  style={{...inpStyle, resize:'vertical', minHeight:50}} />
              </Field>

              <div style={{display:'flex', gap:10}}>
                <Field label="Startdatum" flex>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm({...form, start_date: e.target.value})}
                    style={inpStyle} />
                </Field>
                <Field label="Enddatum" flex>
                  <input type="date" value={form.due_date}
                    onChange={e => setForm({...form, due_date: e.target.value})}
                    style={inpStyle} />
                </Field>
              </div>

              <div style={{display:'flex', gap:10}}>
                <Field label="Honorar" flex>
                  <div style={{display:'flex', gap:4}}>
                    <input type="number" value={form.budget_amount}
                      onChange={e => setForm({...form, budget_amount: e.target.value})}
                      placeholder="0" min={0} step={100}
                      style={{...inpStyle, flex:1}} />
                    <select value={form.currency}
                      onChange={e => setForm({...form, currency: e.target.value})}
                      style={{...inpStyle, width:70}}>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="CHF">CHF</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </Field>
                <Field label="Zeitbudget (h)" flex>
                  <input type="number" value={form.budget_hours}
                    onChange={e => setForm({...form, budget_hours: e.target.value})}
                    placeholder="z.B. 40" min={0} step={1}
                    style={inpStyle} />
                </Field>
              </div>

              <Field label="Stundensatz (optional)">
                <input type="number" value={form.hourly_rate}
                  onChange={e => setForm({...form, hourly_rate: e.target.value})}
                  placeholder="z.B. 120 — für Billability-Rechnungen"
                  min={0} step={10}
                  style={inpStyle} />
              </Field>
            </>
          )}
        </div>

        {/* Footer */}
        {!checking && !existing && (
          <div style={{
            padding:'14px 26px', borderTop:'1px solid #F1F5F9',
            display:'flex', justifyContent:'flex-end', gap:10,
            position:'sticky', bottom:0, background:'var(--surface)',
            borderRadius:'0 0 20px 20px'
          }}>
            <button onClick={onClose} disabled={saving} style={btnSecondaryStyle}>
              Abbrechen
            </button>
            <button onClick={handleCreate} disabled={saving || !form.name.trim()}
              style={{...btnPrimaryStyle, opacity: saving ? 0.6 : 1}}>
              {saving ? 'Erstelle…' : '🚀 Projekt anlegen'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Hilfs-Komponenten ──────────────────────────────────────────────────────────────
function Field({ label, children, flex }) {
  return (
    <div style={{marginBottom:14, flex: flex ? 1 : 'none'}}>
      <label style={{
        display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)',
        marginBottom:5, textTransform:'uppercase', letterSpacing:0.3
      }}>{label}</label>
      {children}
    </div>
  )
}

const inpStyle = {
  width:'100%', padding:'8px 12px', borderRadius:8,
  border:'1.5px solid #E2E8F0', fontSize:14, fontFamily:'inherit',
  color:'var(--text-primary)', background:'#fff', boxSizing:'border-box'
}

const btnPrimaryStyle = {
  padding:'9px 18px', borderRadius:8, border:'none',
  background:PRIMARY, color:'#fff',
  fontSize:13, fontWeight:700, cursor:'pointer'
}

const btnSecondaryStyle = {
  padding:'9px 18px', borderRadius:8, border:'1px solid #CBD5E1',
  background:'#fff', color:'var(--text-primary)',
  fontSize:13, fontWeight:600, cursor:'pointer'
}
