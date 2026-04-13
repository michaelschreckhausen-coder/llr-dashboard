import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const PLANS = ['starter','pro','enterprise']

const PLAN_COLOR = {
  starter:    { bg:'#F8FAFC', color:'#64748B', border:'#E2E8F0' },
  pro:        { bg:'#EFF6FF', color:'#2563eb', border:'#BFDBFE' },
  enterprise: { bg:'#F5F3FF', color:'#7c3aed', border:'#DDD6FE' },
}

export default function AdminTenants({ session }) {
  const navigate = useNavigate()
  const [tenants, setTenants]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(null)   // null | 'new' | tenant-object
  const [flash, setFlash]         = useState(null)
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')
  const [form, setForm]           = useState(defaultForm())

  function defaultForm() {
    return { name:'', subdomain:'', custom_domain:'', plan:'starter', is_active:true, max_users:5, max_leads:500 }
  }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending:false })
    setTenants(data || [])
    setLoading(false)
  }

  function showFlash(msg, type='ok') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  function openNew() {
    setForm(defaultForm())
    setModal('new')
  }

  function openEdit(t) {
    setForm({ name:t.name||'', subdomain:t.subdomain||'', custom_domain:t.custom_domain||'', plan:t.plan||'starter', is_active:t.is_active??true, max_users:t.max_users||5, max_leads:t.max_leads||500 })
    setModal(t)
  }

  async function saveTenant() {
    if (!form.name.trim()) { showFlash('Name ist erforderlich', 'err'); return }
    setSaving(true)
    try {
      const payload = {
        name:          form.name.trim(),
        subdomain:     form.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g,'') || null,
        custom_domain: form.custom_domain.trim() || null,
        plan:          form.plan,
        is_active:     form.is_active,
        max_users:     Number(form.max_users) || 5,
        max_leads:     Number(form.max_leads) || 500,
      }

      if (modal === 'new') {
        payload.owner_user_id = session.user.id
        const { error } = await supabase.from('tenants').insert(payload)
        if (error) throw error
        showFlash('Tenant angelegt ✓')
      } else {
        const { error } = await supabase.from('tenants').update(payload).eq('id', modal.id)
        if (error) throw error
        showFlash('Tenant gespeichert ✓')
      }
      setModal(null)
      load()
    } catch(e) {
      showFlash(e.message || 'Fehler beim Speichern', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(t) {
    await supabase.from('tenants').update({ is_active: !t.is_active }).eq('id', t.id)
    setTenants(prev => prev.map(x => x.id === t.id ? { ...x, is_active: !x.is_active } : x))
  }

  const filtered = tenants.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.subdomain||'').includes(search.toLowerCase())
  )

  const inp = { padding:'8px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box', color:'#0F172A' }
  const lbl = { display:'block', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }

  return (
    <div style={{ maxWidth:900 }}>

      {/* Flash */}
      {flash && (
        <div style={{ position:'fixed', top:16, right:24, zIndex:999, padding:'10px 20px', borderRadius:10, fontSize:13, fontWeight:600, background: flash.type==='err'?'#FEF2F2':'#ECFDF5', color: flash.type==='err'?'#dc2626':'#059669', border:`1px solid ${flash.type==='err'?'#FECACA':'#A7F3D0'}`, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
          {flash.type==='err' ? '⚠ ' : '✓ '}{flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:'#0F172A' }}>Tenant-Verwaltung</div>
          <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>{tenants.length} Tenant{tenants.length!==1?'s':''} · Whitelabel-Kunden verwalten</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Suche…"
            style={{ ...inp, width:200, padding:'7px 12px' }}/>
          <button onClick={openNew}
            style={{ padding:'8px 18px', borderRadius:8, border:'none', background:'rgb(49,90,231)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            + Neuer Tenant
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          ['Gesamt', tenants.length, '#0F172A'],
          ['Aktiv', tenants.filter(t=>t.is_active).length, '#059669'],
          ['Starter', tenants.filter(t=>t.plan==='starter').length, '#64748B'],
          ['Pro+', tenants.filter(t=>t.plan!=='starter').length, '#7c3aed'],
        ].map(([label,val,color]) => (
          <div key={label} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 16px', border:'1px solid #E5E7EB' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em' }}>{label}</div>
            <div style={{ fontSize:22, fontWeight:700, color, marginTop:4 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Tabelle */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1.5fr 100px 80px 80px 90px', padding:'10px 16px', background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', gap:8 }}>
          <div>Name</div><div>Subdomain</div><div>Custom Domain</div><div>Plan</div><div>Leads</div><div>User</div><div>Aktionen</div>
        </div>

        {loading && (
          <div style={{ padding:'32px', textAlign:'center', color:'#94A3B8', fontSize:13 }}>Lade…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding:'32px', textAlign:'center', color:'#94A3B8', fontSize:13 }}>
            {search ? 'Keine Treffer' : 'Noch keine Tenants. Lege den ersten an!'}
          </div>
        )}

        {filtered.map((t, i) => {
          const pc = PLAN_COLOR[t.plan] || PLAN_COLOR.starter
          return (
            <div key={t.id} style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1.5fr 100px 80px 80px 90px', padding:'12px 16px', borderBottom: i<filtered.length-1 ? '1px solid #F1F5F9':'none', alignItems:'center', gap:8, transition:'background 0.1s' }}
              onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'}
              onMouseLeave={e=>e.currentTarget.style.background='#fff'}>

              {/* Name + Status */}
              <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: t.is_active?'#22c55e':'#E5E7EB', flexShrink:0 }}/>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.name}</div>
                  <div style={{ fontSize:11, color:'#94A3B8', marginTop:1 }}>
                    {new Date(t.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}
                  </div>
                </div>
              </div>

              {/* Subdomain */}
              <div>
                {t.subdomain
                  ? <code style={{ fontSize:11, background:'#EEF2FF', color:'rgb(49,90,231)', padding:'2px 7px', borderRadius:4 }}>{t.subdomain}.leadesk.de</code>
                  : <span style={{ fontSize:11, color:'#CBD5E1' }}>—</span>}
              </div>

              {/* Custom Domain */}
              <div>
                {t.custom_domain
                  ? <code style={{ fontSize:11, background:'#F0FDF4', color:'#059669', padding:'2px 7px', borderRadius:4 }}>{t.custom_domain}</code>
                  : <span style={{ fontSize:11, color:'#CBD5E1' }}>—</span>}
              </div>

              {/* Plan */}
              <div>
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:99, background:pc.bg, color:pc.color, border:`1px solid ${pc.border}` }}>
                  {t.plan}
                </span>
              </div>

              {/* Max Leads */}
              <div style={{ fontSize:12, color:'#475569', fontWeight:500 }}>{(t.max_leads||0).toLocaleString('de-DE')}</div>

              {/* Max User */}
              <div style={{ fontSize:12, color:'#475569', fontWeight:500 }}>{t.max_users}</div>

              {/* Aktionen */}
              <div style={{ display:'flex', gap:5 }}>
                <button onClick={() => openEdit(t)}
                  style={{ padding:'4px 9px', borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', fontSize:11, fontWeight:600, color:'#475569', cursor:'pointer' }}>
                  ✏ Edit
                </button>
                <button onClick={() => navigate(`/admin/whitelabel?tenant=${t.id}`)}
                  title="WhiteLabel bearbeiten"
                  style={{ padding:'4px 7px', borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', fontSize:11, cursor:'pointer' }}>
                  🎨
                </button>
                <button onClick={() => toggleActive(t)}
                  title={t.is_active ? 'Deaktivieren' : 'Aktivieren'}
                  style={{ padding:'4px 7px', borderRadius:6, border:`1px solid ${t.is_active?'#FECACA':'#A7F3D0'}`, background: t.is_active?'#FEF2F2':'#ECFDF5', fontSize:11, cursor:'pointer' }}>
                  {t.is_active ? '⏸' : '▶'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Onboarding-Hinweis */}
      {!loading && tenants.length <= 1 && (
        <div style={{ marginTop:16, background:'#EFF6FF', borderRadius:10, padding:'14px 18px', border:'1px solid #BFDBFE', fontSize:12, color:'#1d4ed8', lineHeight:1.7 }}>
          <strong>So funktioniert Whitelabel:</strong><br/>
          1. Tenant anlegen (Name + Subdomain, z.B. "acme")<br/>
          2. Auf Vercel unter Domain-Settings <code style={{ background:'rgba(255,255,255,0.6)', padding:'1px 5px', borderRadius:3 }}>acme.leadesk.de</code> als Custom Domain hinzufügen<br/>
          3. Farben + Logo über 🎨 einstellen<br/>
          4. Fertig — der Kunde öffnet <code style={{ background:'rgba(255,255,255,0.6)', padding:'1px 5px', borderRadius:3 }}>acme.leadesk.de</code> und sieht sein Branding
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:900 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:28, width:520, maxWidth:'90vw', boxShadow:'0 20px 60px rgba(0,0,0,0.18)' }}>

            <div style={{ fontSize:16, fontWeight:700, color:'#0F172A', marginBottom:20 }}>
              {modal === 'new' ? '+ Neuer Tenant' : `✏ ${modal.name} bearbeiten`}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Name */}
              <div>
                <label style={lbl}>Unternehmensname *</label>
                <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  style={inp} placeholder="Acme GmbH" autoFocus/>
              </div>

              {/* Subdomain + Custom Domain */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={lbl}>Subdomain</label>
                  <div style={{ display:'flex', alignItems:'center', border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden', background:'#fff' }}>
                    <input value={form.subdomain} onChange={e=>setForm(f=>({...f,subdomain:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'')}))}
                      style={{ ...inp, border:'none', borderRadius:0, flex:1, width:'auto' }} placeholder="acme"/>
                    <span style={{ padding:'0 8px', background:'#F8FAFC', color:'#94A3B8', fontSize:11, borderLeft:'1px solid #E2E8F0', whiteSpace:'nowrap' }}>.leadesk.de</span>
                  </div>
                </div>
                <div>
                  <label style={lbl}>Custom Domain</label>
                  <input value={form.custom_domain} onChange={e=>setForm(f=>({...f,custom_domain:e.target.value}))}
                    style={inp} placeholder="crm.acme.de"/>
                </div>
              </div>

              {/* Plan */}
              <div>
                <label style={lbl}>Plan</label>
                <div style={{ display:'flex', gap:6 }}>
                  {PLANS.map(p => {
                    const pc = PLAN_COLOR[p]
                    const active = form.plan === p
                    return (
                      <button key={p} onClick={() => setForm(f=>({...f,plan:p}))}
                        style={{ flex:1, padding:'8px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', transition:'all 0.15s',
                          background: active ? pc.color : '#F8FAFC',
                          color:      active ? '#fff' : pc.color,
                          border:     `1.5px solid ${active ? pc.color : pc.border}`,
                        }}>
                        {p.charAt(0).toUpperCase()+p.slice(1)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Limits */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={lbl}>Max. Leads</label>
                  <input type="number" value={form.max_leads} onChange={e=>setForm(f=>({...f,max_leads:e.target.value}))}
                    style={inp} min="1"/>
                </div>
                <div>
                  <label style={lbl}>Max. User</label>
                  <input type="number" value={form.max_users} onChange={e=>setForm(f=>({...f,max_users:e.target.value}))}
                    style={inp} min="1"/>
                </div>
              </div>

              {/* Aktiv */}
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:13 }}>
                <input type="checkbox" checked={form.is_active} onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))}
                  style={{ width:16, height:16, accentColor:'rgb(49,90,231)', cursor:'pointer' }}/>
                <span style={{ color:'#0F172A' }}>Tenant aktiv (Kunden können sich einloggen)</span>
              </label>

              {/* DNS-Hinweis bei Custom Domain */}
              {form.custom_domain && (
                <div style={{ background:'#FFFBEB', borderRadius:8, padding:'10px 12px', border:'1px solid #FDE68A', fontSize:11, color:'#92400E', lineHeight:1.6 }}>
                  DNS-Eintrag erforderlich:<br/>
                  <code style={{ background:'rgba(255,255,255,0.7)', padding:'1px 5px', borderRadius:3 }}>CNAME {form.custom_domain} → cname.vercel-dns.com</code>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:22 }}>
              <button onClick={() => setModal(null)}
                style={{ padding:'8px 18px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', color:'#64748B', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button onClick={saveTenant} disabled={saving || !form.name.trim()}
                style={{ padding:'8px 24px', borderRadius:8, border:'none', background:(saving||!form.name.trim())?'#E5E7EB':'rgb(49,90,231)', color:'#fff', fontSize:13, fontWeight:700, cursor:(saving||!form.name.trim())?'default':'pointer' }}>
                {saving ? '⏳ Speichere…' : modal==='new' ? '+ Anlegen' : '💾 Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
