import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'

const PRIMARY = 'rgb(49,90,231)'
const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'

export default function IntegrationSettings({ session }) {
  const { team, activeTeamId } = useTeam()
  const [integ, setInteg]     = useState(null)
  const [apiKey, setApiKey]   = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [createLeads, setCreateLeads] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [flash, setFlash]     = useState(null)
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)

  const flash_ = (msg, type='ok') => { setFlash({msg,type}); setTimeout(()=>setFlash(null),5000) }

  useEffect(() => { load() }, [activeTeamId])

  async function load() {
    setLoading(true)
    const uid = session.user.id
    let iq = supabase.from('integrations')
      .select('*')
      .eq('user_id', uid)
      .eq('provider', 'sevdesk')
    if (activeTeamId) iq = iq.eq('team_id', activeTeamId)
    else iq = iq.is('team_id', null)
    const { data } = await iq.maybeSingle()

    if (data) {
      setInteg(data)
      setApiKey(data.api_key || '')
      setCreateLeads(data.settings?.create_leads_from_orders !== false)
    } else {
      setInteg(null)
      setApiKey('')
    }

    // Sync-Logs laden
    if (data?.id) {
      const { data: logData } = await supabase.from('integration_sync_log')
        .select('*')
        .eq('integration_id', data.id)
        .order('synced_at', { ascending: false })
        .limit(10)
      setLogs(logData || [])
    } else {
      setLogs([])
    }
    setLoading(false)
  }

  async function save() {
    if (!apiKey.trim()) { flash_('API-Key eingeben', 'err'); return }
    setSaving(true)
    const uid = session.user.id
    const payload = {
      user_id: uid,
      team_id: activeTeamId,
      provider: 'sevdesk',
      api_key: apiKey.trim(),
      is_active: true,
      settings: { ...(integ?.settings || {}), create_leads_from_orders: createLeads },
      updated_at: new Date().toISOString(),
    }
    const { data, error } = integ
      ? await supabase.from('integrations').update(payload).eq('id', integ.id).select().single()
      : await supabase.from('integrations').insert(payload).select().single()

    if (error) flash_(error.message, 'err')
    else { setInteg(data); flash_('✓ Einstellungen gespeichert') }
    setSaving(false)
  }

  async function toggleActive() {
    if (!integ) return
    const { error } = await supabase.from('integrations')
      .update({ is_active: !integ.is_active }).eq('id', integ.id)
    if (!error) { setInteg(p => ({ ...p, is_active: !p.is_active })); flash_(`Integration ${integ.is_active ? 'deaktiviert' : 'aktiviert'}`) }
  }

  async function syncNow() {
    if (!integ) { flash_('Erst speichern', 'err'); return }
    setSyncing(true)
    flash_('🔄 Sync läuft…')
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/sevdesk-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s?.access_token}` },
        body: JSON.stringify({ integration_id: integ.id, user_id: session.user.id, team_id: activeTeamId }),
      })
      const result = await resp.json()
      if (result.error) flash_(result.error, 'err')
      else {
        const r = result.results?.[0]
        if (r?.error) flash_(r.error, 'err')
        else flash_(`✓ Sync abgeschlossen — ${r?.recordsFound || 0} Angebote gefunden, ${r?.recordsCreated || 0} Deals angelegt, ${r?.recordsUpdated || 0} aktualisiert`)
      }
      await load()
    } catch (err) {
      flash_(err.message, 'err')
    }
    setSyncing(false)
  }

  const inp = { width:'100%', padding:'10px 12px', border:'1.5px solid #E4E7EC', borderRadius:9, fontSize:14, outline:'none', background:'#fff', boxSizing:'border-box', fontFamily:'Inter,sans-serif' }
  const card = { background:'#fff', border:'1px solid #E4E7EC', borderRadius:16, padding:'24px 28px', marginBottom:20 }

  return (
    <div style={{ maxWidth:720, margin:'0 auto', paddingBottom:60 }}>

      {flash && (
        <div style={{ position:'fixed', top:24, right:24, zIndex:9999, padding:'12px 20px', borderRadius:12, fontSize:13, fontWeight:600, background:flash.type==='err'?'#FEF2F2':'#F0FDF4', color:flash.type==='err'?'#991B1B':'#065F46', border:'1px solid '+(flash.type==='err'?'#FECACA':'#A7F3D0'), boxShadow:'0 4px 16px rgba(0,0,0,0.12)' }}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:'#111827', margin:0 }}>Integrationen</h1>
        <div style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>Verbinde externe Tools mit Leadesk</div>
      </div>

      {/* sevDesk Card */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
          {/* sevDesk Logo */}
          <div style={{ width:48, height:48, borderRadius:12, background:'#E8F4FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:22 }}>
            💼
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#111827' }}>sevDesk</div>
            <div style={{ fontSize:13, color:'#6B7280' }}>Angebote aus sevDesk automatisch als Deals importieren</div>
          </div>
          {integ && (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:integ.is_active?'#10B981':'#9CA3AF' }}/>
              <span style={{ fontSize:12, fontWeight:600, color:integ.is_active?'#065F46':'#6B7280' }}>
                {integ.is_active ? 'Aktiv' : 'Inaktiv'}
              </span>
              <button onClick={toggleActive}
                style={{ padding:'4px 10px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', color:'#374151' }}>
                {integ.is_active ? 'Deaktivieren' : 'Aktivieren'}
              </button>
            </div>
          )}
        </div>

        {/* Wie es funktioniert */}
        <div style={{ background:'#F8FAFC', borderRadius:12, padding:'14px 16px', marginBottom:20, borderLeft:`3px solid ${PRIMARY}` }}>
          <div style={{ fontSize:12, fontWeight:700, color:PRIMARY, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>So funktioniert die Integration</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {[
              '1. API-Key aus sevDesk kopieren (Einstellungen → Benutzer → API-Token)',
              '2. API-Key hier einfügen und speichern',
              '3. Sync starten — alle Angebote (orderType=AN) werden als Deals importiert',
              '4. Leads werden automatisch verknüpft wenn E-Mail oder Name übereinstimmt',
              '5. Status-Mapping: Entwurf→Prospect, Offen→Angebot, Angenommen→Gewonnen',
            ].map((s,i) => (
              <div key={i} style={{ fontSize:12, color:'#374151', display:'flex', gap:8 }}>
                <span style={{ color:PRIMARY, flexShrink:0 }}>→</span>{s}
              </div>
            ))}
          </div>
        </div>

        {/* API Key Feld */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>
            sevDesk API-Token
          </label>
          <div style={{ position:'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Dein sevDesk API-Token"
              style={{ ...inp, paddingRight:44 }}
              onFocus={e => e.target.style.borderColor = PRIMARY}
              onBlur={e => e.target.style.borderColor = '#E4E7EC'}
            />
            <button onClick={() => setShowKey(s => !s)}
              style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#9CA3AF', padding:0 }}>
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:6 }}>
            Zu finden unter: my.sevdesk.de → Einstellungen → Benutzer → API-Token anzeigen
          </div>
        </div>

        {/* Option: Leads automatisch anlegen */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px', background:'#F8FAFC', borderRadius:12, marginBottom:16, border:'1px solid #E4E7EC' }}>
          <div style={{ paddingTop:2 }}>
            <input type="checkbox" id="createLeads" checked={createLeads} onChange={e => setCreateLeads(e.target.checked)}
              style={{ width:16, height:16, accentColor:PRIMARY, cursor:'pointer' }}/>
          </div>
          <label htmlFor="createLeads" style={{ cursor:'pointer', flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#111827', marginBottom:3 }}>Neue Leads automatisch anlegen</div>
            <div style={{ fontSize:12, color:'#6B7280', lineHeight:1.5 }}>
              Wenn ein Angebot-Kontakt noch kein Lead in Leadesk ist, wird er automatisch importiert.<br/>
              Deaktivieren wenn du nur bestehende Leads mit Deals verknüpfen möchtest.
            </div>
          </label>
        </div>

        {/* Team-Info */}
        {team && (
          <div style={{ fontSize:12, color:'#6B7280', marginBottom:16, background:'#F9FAFB', borderRadius:8, padding:'8px 12px' }}>
            Integration für Team: <strong>{team.name}</strong>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={save} disabled={saving}
            style={{ padding:'10px 20px', borderRadius:10, border:'none', background:saving?'#E4E7EC':PRIMARY, color:saving?'#9CA3AF':'#fff', fontSize:13, fontWeight:700, cursor:saving?'default':'pointer' }}>
            {saving ? '⏳ Speichern…' : '💾 Speichern'}
          </button>
          {integ && (
            <button onClick={syncNow} disabled={syncing || !integ.is_active}
              style={{ padding:'10px 20px', borderRadius:10, border:'1.5px solid '+(syncing?'#E4E7EC':PRIMARY), background:'#fff', color:syncing?'#9CA3AF':PRIMARY, fontSize:13, fontWeight:700, cursor:(syncing||!integ.is_active)?'default':'pointer' }}>
              {syncing ? '⏳ Sync läuft…' : '🔄 Jetzt synchronisieren'}
            </button>
          )}
        </div>

        {/* Letzter Sync */}
        {integ?.settings?.last_synced_at && (
          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:12 }}>
            Letzter Sync: {new Date(integ.settings.last_synced_at).toLocaleString('de-DE')}
          </div>
        )}
      </div>

      {/* Sync-Log */}
      {logs.length > 0 && (
        <div style={card}>
          <div style={{ fontSize:14, fontWeight:700, color:'#374151', marginBottom:16 }}>Sync-Protokoll</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {logs.map(log => (
              <div key={log.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 12px', borderRadius:10, background:log.error?'#FEF2F2':'#F9FAFB', border:'1px solid '+(log.error?'#FECACA':'#E5E7EB') }}>
                <span style={{ fontSize:16, flexShrink:0 }}>{log.error ? '⚠' : '✓'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:log.error?'#991B1B':'#065F46', marginBottom:2 }}>
                    {new Date(log.synced_at).toLocaleString('de-DE')}
                  </div>
                  <div style={{ fontSize:11, color:'#6B7280' }}>
                    {log.records_found} gefunden · {log.records_created} angelegt · {log.records_updated} aktualisiert
                  </div>
                  {log.error && <div style={{ fontSize:11, color:'#DC2626', marginTop:4, wordBreak:'break-word' }}>{log.error}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weitere Integrationen (Platzhalter) */}
      <div style={{ ...card, opacity:0.6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🔗</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#374151' }}>Weitere Integrationen</div>
            <div style={{ fontSize:12, color:'#9CA3AF' }}>HubSpot, Salesforce, Pipedrive — demnächst verfügbar</div>
          </div>
        </div>
      </div>

    </div>
  )
}
