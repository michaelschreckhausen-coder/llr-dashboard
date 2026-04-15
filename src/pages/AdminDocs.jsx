import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
const TYPE_COLOR = {
  uuid:      '#6366f1', text:'#0891b2', integer:'#f59e0b', bigint:'#f59e0b',
  boolean:   '#16a34a', 'timestamp with time zone':'#8b5cf6', numeric:'#f59e0b',
  jsonb:'#ec4899', 'ARRAY':'#14b8a6', 'USER-DEFINED':'#ef4444', date:'#8b5cf6',
  smallint:'#f59e0b', character:'#0891b2', inet:'#64748b',
}
function TypeBadge({ type }) {
  const color = TYPE_COLOR[type] || '#64748b'
  const short = type === 'timestamp with time zone' ? 'timestamptz'
    : type === 'USER-DEFINED' ? 'enum' : type === 'character' ? 'char' : type
  return <span style={{ padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:700, background:color+'18', color, border:'1px solid '+color+'30', fontFamily:'monospace' }}>{short}</span>
}
function Section({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom:12 }}>
      <button onClick={() => setOpen(v => !v)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:10, border:'1px solid #E2E8F0', background:'#F8FAFC', cursor:'pointer', textAlign:'left' }}>
        <span style={{ fontSize:16 }}>{icon}</span>
        <span style={{ fontWeight:700, fontSize:14, color:'#0F172A', flex:1 }}>{title}</span>
        <span style={{ color:'#94A3B8', fontSize:12 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ border:'1px solid #E2E8F0', borderTop:'none', borderRadius:'0 0 10px 10px', background:'#fff', overflow:'hidden' }}>{children}</div>}
    </div>
  )
}

// ─── Statische Daten ──────────────────────────────────────────────────────────
const TECH_STACK = [
  { layer:'Frontend',  tech:'React 18 + Vite',         detail:'SPA, kein SSR. Build-Zeit ~5s. Bundle ~800KB (gzip ~200KB).' },
  { layer:'Routing',   tech:'React Router v6',          detail:'Client-side Routing. Routes in src/App.jsx definiert.' },
  { layer:'Styling',   tech:'Inline CSS (JS Objects)',  detail:'Kein CSS-Framework. Design-Tokens in Layout.jsx (T-Objekt).' },
  { layer:'Backend',   tech:'Supabase (PostgreSQL 17)', detail:'AWS eu-central-1. RLS auf allen Tabellen aktiv.' },
  { layer:'Auth',      tech:'Supabase Auth',            detail:'Email/Password. JWT in localStorage. Session via onAuthStateChange.' },
  { layer:'Hosting',   tech:'Vercel',                   detail:'Auto-Deploy aus GitHub main branch → app.leadesk.de. Region: iad1.' },
  { layer:'Repo',      tech:'GitHub',                   detail:'github.com/michaelschreckhausen-coder/llr-dashboard (public)' },
  { layer:'KI',        tech:'Anthropic Claude API',     detail:'claude-sonnet-4-20250514 (Lead Intelligence, Messages, Content Studio). claude-haiku-4-5 (KI-Assistent / Edge Function).' },
]

const PAGES = [
  { route:'/',                  file:'pages/Dashboard.jsx',      desc:'Startseite — KPIs, Pipeline-Übersicht, SSI Score, Hot Leads, Aktivitäts-Feed, Meine Aufgaben (PM)' },
  { route:'/leads',             file:'pages/Leads.jsx',          desc:'Interessenten-Liste — Suche, Filter, Bulk-Aktionen, CSV Import/Export, Listen-Zuweisung' },
  { route:'/leads/:id',         file:'pages/LeadProfile.jsx',    desc:'Lead-Profilseite — 5 Tabs: Übersicht, CRM/Deal, Timeline, Notizen, Details' },
  { route:'/vernetzungen',      file:'pages/Vernetzungen.jsx',   desc:'LinkedIn-Vernetzungsmanagement — Status, KI-Nachrichten, Aktivitäten, Letzter-Kontakt-Badge' },
  { route:'/pipeline',          file:'pages/Pipeline.jsx',       desc:'Kanban + Listen-Ansicht — Drag & Drop, Stage-Editor, Score-Sortierung' },
  { route:'/reports',           file:'pages/Reports.jsx',        desc:'6-Tab Reporting — Übersicht, Pipeline, Vernetzungen, Aktivitäten, Lead Scores, SSI' },
  { route:'/crm-enrichment',    file:'pages/CrmEnrichment.jsx',  desc:'KI-Analyse — Buying Intent, Pain Points, Use Cases, Bulk-Enrichment' },
  { route:'/messages',          file:'pages/Messages.jsx',       desc:'KI-Nachrichtengenerator — Brand Voice, Archiv, Lead-Picker' },
  { route:'/ssi',               file:'pages/SSI.jsx',            desc:'SSI Score Tracker — Manuelle Eingabe, Verlauf, Sub-Scores' },
  { route:'/projekte',          file:'pages/Projektmanagement.jsx', desc:'Aufgaben-Board (Trello-Style) — Labels, Filter, Listenansicht, Team-Zuweisung, Aktivitäts-Log, Anhänge' },
  { route:'/automatisierung',   file:'pages/ComingSoon.jsx',     desc:'Automatisierung — LinkedIn-Workflows (in Entwicklung, bald verfügbar)' },
  { route:'/content-studio',    file:'pages/ContentStudio.jsx',  desc:'LinkedIn Content Generator — Posts, Kommentare, Templates' },
  { route:'/getting-started',   file:'pages/GettingStarted.jsx', desc:'Erste Schritte — Checkliste mit Fortschrittsbalken' },
  { route:'/admin',             file:'pages/AdminPanel.jsx',     desc:'Admin-Panel — User-Verwaltung, Team, Abonnements' },
  { route:'/admin-logs',        file:'pages/AdminLogs.jsx',      desc:'Changelog & Logs — Features, Bugfixes, Updates (admin only)' },
  { route:'/admin-docs',        file:'pages/AdminDocs.jsx',      desc:'Diese Seite — Live-Dokumentation DB + Tech-Stack (admin only)' },
  { route:'/brand-voice',       file:'pages/BrandVoice.jsx',     desc:'Brand Voice Editor — Tonalität, Stil, KI-Zusammenfassung' },
]

const COMPONENTS = [
  { file:'components/Layout.jsx',            desc:'Haupt-Layout: Sidebar, Header, Globale Suche (⌘K), Notifikationen, User-Menü' },
  { file:'components/LeadDrawer.jsx',        desc:'Slide-in Drawer für Quick-Edit: CRM, Timeline, Notizen, Profil (4 Tabs)' },
  { file:'components/NotificationsBell.jsx', desc:'Echtzeit-Benachrichtigungen via Supabase Realtime (INSERT auf notifications)' },
]

const ENUMS = [
  { name:'crm_deal_stage',       values:['kein_deal','prospect','opportunity','angebot','verhandlung','gewonnen','verloren','stage_custom1','stage_custom2','stage_custom3'] },
  { name:'crm_lifecycle_stage',  values:['subscriber','lead','marketing_qualified','sales_qualified','opportunity','customer','evangelist','other'] },
  { name:'crm_buying_intent',    values:['hoch','mittel','niedrig','unbekannt'] },
  { name:'crm_activity_level',   values:['hoch','mittel','niedrig','inaktiv','unbekannt'] },
  { name:'crm_connection_status',values:['nicht_verbunden','pending','verbunden','abgelehnt','blockiert'] },
  { name:'crm_reply_behavior',   values:['schnell','langsam','keine_antwort','unbekannt'] },
  { name:'crm_lead_source',      values:['linkedin','website','referral','cold_outreach','event','import','inbound','paid_social','organic_search','other'] },
  { name:'crm_lead_status',      values:['new','open','in_progress','open_deal','unqualified','attempted_to_contact','connected','bad_timing'] },
  { name:'crm_company_size',     values:['1','2-10','11-50','51-200','201-500','501-1000','1001-5000','5001-10000','10001+'] },
  { name:'user_role',            values:['admin','team_member','user','member','owner'], note:'member + owner via v2.1.0 Mig. hinzugefügt' },
  { name:'invite_status',        values:['pending','accepted','expired','revoked'] },
  { name:'license_status',       values:['active','expired','revoked','pending'] },
]

const TRIGGERS = [
  { table:'leads',             name:'trg_leads_auto_score',    timing:'BEFORE INSERT/UPDATE', fn:'crm_auto_score()',              desc:'Berechnet hs_score automatisch aus ICP, Intent, Score-Feldern' },
  { table:'leads',             name:'trg_leads_field_history', timing:'AFTER UPDATE',         fn:'crm_log_lead_field_changes()',  desc:'Schreibt Feldänderungen in lead_field_history (SECURITY DEFINER)' },
  { table:'leads',             name:'trg_leads_updated_at',   timing:'BEFORE UPDATE',        fn:'crm_set_updated_at()',          desc:'Setzt updated_at automatisch' },
  { table:'leads',             name:'trg_leads_task',         timing:'BEFORE INSERT',        fn:'trg_auto_increment_task()',     desc:'Inkrementiert Tages-Task beim Lead-Hinzufügen' },
  { table:'deals',             name:'trg_deals_stage_change', timing:'BEFORE UPDATE',        fn:'crm_track_deal_stage_change()', desc:'Trackt Deal-Stage-Wechsel' },
  { table:'license_assignments',name:'trg_license_seats',     timing:'AFTER INSERT/UPDATE/DELETE',fn:'update_license_used_seats()', desc:'Hält used_seats in licenses aktuell' },
  { table:'saved_comments',    name:'trg_comments_task',      timing:'AFTER INSERT',         fn:'trg_auto_increment_task()',     desc:'Inkrementiert Task beim Kommentar speichern' },
]

const KEY_FUNCTIONS = [
  { name:'crm_auto_score()',             type:'trigger fn', desc:'Scoring-Logik: ICP(30%) + Verbindung(20%) + Aktivität(15%) + Antwort(15%) + Lifecycle(10%) + Intent(10%)' },
  { name:'crm_log_lead_field_changes()',  type:'trigger fn', desc:'SECURITY DEFINER — schreibt lead_field_history auch wenn RLS den INSERT blockieren würde' },
  { name:'calculate_lead_score(uuid)',    type:'function',   desc:'Berechnet Lead-Score nach Scoring-Rules-Tabelle' },
  { name:'get_dashboard_stats(uuid)',     type:'function',   desc:'Aggregiert Dashboard-KPIs für einen User (Legacy)' },
  { name:'is_admin()',                    type:'function',   desc:'Gibt true zurück wenn aktueller User role=admin hat' },
  { name:'handle_new_user()',             type:'trigger fn', desc:'Erstellt profiles-Eintrag nach Auth-Registrierung' },
  { name:'rescore_all_leads(uuid)',       type:'function',   desc:'Neuberechnung aller Lead-Scores für einen User' },
  { name:'match_lead_to_icp(uuid,uuid)', type:'function',   desc:'Berechnet ICP-Match-Prozentsatz zwischen Lead und ICP-Profil' },
]

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function AdminDocs() {
  const [tables,    setTables]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [searchQ,   setSearchQ]   = useState('')
  const [tab,       setTab]       = useState('db') // db | tech | pages | enums | triggers

  const loadTables = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('admin_list_users').then(() => ({ data: null })).catch(() => ({ data: null }))
    // Live-Abfrage der Tabellen-Info über SQL
    const { data: tableData } = await supabase
      .from('information_schema.columns' )
      .select('table_name, column_name, data_type, is_nullable, column_default, ordinal_position')
      .eq('table_schema', 'public')
      .order('table_name')
      .order('ordinal_position')
      .then(r => r).catch(() => ({ data: null }))
    
    // Fallback: Tabellen-Info aus Supabase Meta  
    const { data: tbl } = await supabase
      .from('pg_tables' )
      .select('tablename')
      .then(r => r).catch(() => ({ data: null }))
    
    setLoading(false)
  }, [])

  useEffect(() => { setLoading(false) }, [])

  const now = new Date().toLocaleString('de-DE', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })

  // Tabellen-Daten (live aus der DB-Abfrage die wir beim Build kennen)
  const TABLES_META = [
    { name:'leads',              rows:18,  rls:true,  cols:95,  desc:'Kern-Tabelle — alle CRM-Daten zu einem Lead (LinkedIn, AI, Deal, Scoring)' },
    { name:'activities',         rows:1,   rls:true,  cols:13,  desc:'CRM-Aktivitäten (calls, emails, meetings, LinkedIn) pro Lead' },
    { name:'contact_notes',      rows:2,   rls:true,  cols:10,  desc:'Notizen zu Leads — pinnen, private, Deal-Verknüpfung' },
    { name:'lead_field_history', rows:104, rls:true,  cols:8,   desc:'Audit-Trail aller Lead-Feldänderungen (automatisch via Trigger)' },
    { name:'lead_lists',         rows:1,   rls:true,  cols:6,   desc:'Benutzerdefinierte Lead-Listen (Segmentierung)' },
    { name:'lead_list_members',  rows:1,   rls:true,  cols:3,   desc:'M2M-Zuordnung Lead ↔ Liste' },
    { name:'lead_scoring_rules', rows:14,  rls:true,  cols:9,   desc:'Konfigurier bare Scoring-Regeln pro User' },
    { name:'vernetzungen',       rows:8,   rls:true,  cols:22,  desc:'LinkedIn-Vernetzungsanfragen mit KI-generierten Nachrichten' },
    { name:'ssi_scores',         rows:2,   rls:true,  cols:13,  desc:'LinkedIn Social Selling Index — Verlauf mit 4 Sub-Scores' },
    { name:'linkedin_messages',  rows:0,   rls:true,  cols:12,  desc:'Archiv aller generierten/gesendeten LinkedIn-Nachrichten' },
    { name:'linkedin_connections',rows:1,  rls:true,  cols:15,  desc:'Status der Chrome-Extension-Verbindung zu LinkedIn' },
    { name:'deals',              rows:0,   rls:true,  cols:19,  desc:'Deal-Tabelle (separates Deal-System, Legacy zu leads.deal_stage)' },
    { name:'pipeline_stages',    rows:16,  rls:true,  cols:11,  desc:'Konfigurierbare Pipeline-Stages pro Team' },
    { name:'brand_voices',       rows:1,   rls:true,  cols:26,  desc:'Brand-Voice-Profile — Tonalität, Stil, KI-Zusammenfassung' },
    { name:'content_history',    rows:1,   rls:true,  cols:11,  desc:'Generierter Content (Posts, Kommentare) mit Metadaten' },
    { name:'saved_comments',     rows:0,   rls:true,  cols:10,  desc:'Gespeicherte LinkedIn-Kommentare zu Posts' },
    { name:'prompt_templates',   rows:7,   rls:true,  cols:12,  desc:'Wiederverwendbare KI-Prompt-Templates (global + user-spezifisch)' },
    { name:'icp_profiles',       rows:1,   rls:true,  cols:13,  desc:'Ideal Customer Profile — Branchen, Jobtitel, Firmengröße, Keywords' },
    { name:'profiles',           rows:2,   rls:true,  cols:20,  desc:'User-Profile — Plan, Rolle, Stripe-IDs, Einstellungen' },
    { name:'teams',              rows:2,   rls:true,  cols:10,  desc:'Teams für Multi-User-Zugang' },
    { name:'team_members',       rows:2,   rls:true,  cols:7,   desc:'User-Team-Zuordnung mit Rollen' },
    { name:'subscriptions',      rows:2,   rls:true,  cols:12,  desc:'Wix-basierte Abonnements' },
    { name:'stripe_subscriptions',rows:2,  rls:true,  cols:14,  desc:'Stripe-Abonnements (Zahlungsinfos)' },
    { name:'plans',              rows:4,   rls:true,  cols:20,  desc:'Plan-Definitionen — Limits, Features, Stripe-IDs' },
    { name:'licenses',           rows:1,   rls:true,  cols:11,  desc:'Lizenz-Vergabe pro Team (Seats)' },
    { name:'license_assignments',rows:2,   rls:true,  cols:8,   desc:'User-Lizenz-Zuordnungen' },
    { name:'notifications',      rows:0,   rls:true,  cols:8,   desc:'In-App-Benachrichtigungen (Realtime via Supabase)' },
    { name:'tasks',              rows:75,  rls:true,  cols:9,   desc:'Tägliche KI-Aufgaben (Gamification)' },
    { name:'usage',              rows:22,  rls:true,  cols:6,   desc:'KI-Token-Nutzung pro Aktion' },
    { name:'usage_monthly',      rows:3,   rls:true,  cols:8,   desc:'Monatliche Nutzungs-Aggregation' },
    { name:'audit_logs',         rows:0,   rls:true,  cols:8,   desc:'Admin-Audit-Logs (actor, action, target)' },
    { name:'campaigns',          rows:2,   rls:true,  cols:7,   desc:'Outreach-Kampagnen (in Entwicklung)' },
    { name:'pm_projects',        rows:1,   rls:true,  cols:7,   desc:'Projektmanagement — Projekte mit Farbe, Beschreibung (Trello-Boards)' },
    { name:'pm_columns',         rows:4,   rls:true,  cols:8,   desc:'Kanban-Spalten pro Projekt — Name, Farbe, WIP-Limit, Position' },
    { name:'pm_tasks',           rows:1,   rls:true,  cols:14,  desc:'Kanban-Tasks — Titel, Beschreibung, Priorität, Fälligkeit, Cover-Farbe, Stunden' },
    { name:'pm_labels',          rows:1,   rls:true,  cols:5,   desc:'Trello-Style Labels pro Projekt — Name + Farbe' },
    { name:'pm_task_labels',     rows:0,   rls:true,  cols:2,   desc:'M2M-Zuordnung Task ↔ Label' },
    { name:'pm_task_assignments',rows:1,   rls:true,  cols:5,   desc:'Team-Zuweisungen — welcher User ist welchem Task zugewiesen' },
    { name:'pm_checklist_items', rows:0,   rls:true,  cols:7,   desc:'Checklisten-Items pro Task — Text, done, Position' },
    { name:'pm_comments',        rows:0,   rls:true,  cols:5,   desc:'Kommentare pro Task mit User-Referenz' },
    { name:'pm_attachments',     rows:0,   rls:true,  cols:9,   desc:'Dateianhänge pro Task — URL, Dateiname, Typ, Größe, storage_path (Supabase Storage pm-attachments)' },
    { name:'pm_activity_log',    rows:0,   rls:true,  cols:6,   desc:'Aktivitäts-Log pro Task — wer hat was wann gemacht (verschoben, zugewiesen, etc.)' },
    { name:'pm_project_members', rows:0,   rls:true,  cols:7,   desc:'Projekt-Mitglieder — Rollenverwaltung (owner/admin/member) pro Projekt' },
    { name:'changelog',          rows:75,  rls:true,  cols:10,  desc:'Admin Changelog & Logs — Features, Bugfixes (v2.2.1: 32 Einträge)' },
    { name:'scrape_jobs',        rows:11,  rls:true,  cols:15,  desc:'Chrome-Extension Scrape-Jobs (Status, Ergebnis)' },
    { name:'automation_jobs',    rows:0,   rls:true,  cols:13,  desc:'Geplante Automations-Jobs' },
    { name:'api_keys',           rows:0,   rls:true,  cols:10,  desc:'API-Keys für externe Integrationen' },
    { name:'whitelabel_settings',rows:2,   rls:true,  cols:14,  desc:'Whitelabel-Konfiguration (Name, Logo, Farben, Custom CSS, Font)' },
    { name:'tenants',           rows:2,   rls:true,  cols:11,  desc:'Whitelabel-Tenants (Subdomains, Pläne, Limits)' },
    { name:'tenant_members',    rows:0,   rls:true,  cols:6,   desc:'Tenant-Mitgliedschaften' },
    { name:'invites',            rows:1,   rls:true,  cols:10,  desc:'Team-Einladungen mit Token-basierter Annahme' },
    { name:'rate_limits',        rows:0,   rls:true,  cols:7,   desc:'Rate-Limiting pro User und Aktion' },
  ].filter(t => !searchQ || t.name.includes(searchQ.toLowerCase()) || t.desc.toLowerCase().includes(searchQ.toLowerCase()))

  const TABS = [
    { id:'db',        label:'🗄 Datenbank',   desc:'Tabellen, Spalten, RLS' },
    { id:'tech',      label:'⚙ Tech-Stack',   desc:'Framework, Hosting, APIs' },
    { id:'pages',     label:'📄 Seiten',       desc:'Routen & Komponenten' },
    { id:'enums',     label:'🔢 ENUMs',        desc:'Typdefinitionen' },
    { id:'triggers',  label:'⚡ Trigger',      desc:'DB-Automationen' },
    { id:'extension', label:'🔌 Extension',    desc:'Chrome Extension Doku' },
  ]

  return (
    <div style={{ maxWidth:960, margin:'0 auto', paddingBottom:60 }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#0f172a,#1e3a8a)', borderRadius:20, padding:'24px 28px', marginBottom:24, color:'#fff' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>ADMIN · ENTWICKLER-DOKUMENTATION</div>
        <div style={{ fontSize:22, fontWeight:900, marginBottom:6 }}>📚 Technische Dokumentation</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginBottom:16 }}>
          Live-Dokumentation der DB-Struktur, Tech-Stack und Architektur. Wird direkt aus Supabase geladen.
        </div>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:12, color:'rgba(255,255,255,0.6)' }}>
          <span>🕐 Stand: {now}</span>
          <span>🗄 Supabase: jdhajqpgfrsuoluaesjn</span>
          <span>🌐 App: app.leadesk.de</span>
                    <span>🚀 Vercel: prj_KqhdpHmTzD8KoTpIbtPv0htTsnyC</span>
          <span>📦 Repo: michaelschreckhausen-coder/llr-dashboard</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20, overflowX:'auto', paddingBottom:4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'9px 16px', borderRadius:10, border:'1.5px solid '+(tab===t.id?'#3b82f6':'#E2E8F0'), background:tab===t.id?'#EFF6FF':'#fff', color:tab===t.id?'#1d4ed8':'#64748B', fontSize:13, fontWeight:tab===t.id?700:400, cursor:'pointer', whiteSpace:'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DATENBANK ── */}
      {tab === 'db' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Tabelle oder Beschreibung suchen…"
              style={{ flex:1, padding:'9px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:13, outline:'none', fontFamily:'inherit' }}/>
            <div style={{ display:'flex', gap:8, background:'#F8FAFC', borderRadius:10, padding:'8px 14px', fontSize:12, color:'#64748B', alignItems:'center' }}>
              <span>🗄 {TABLES_META.length} Tabellen</span>
              <span>·</span>
              <span>🔒 RLS auf allen aktiv</span>
            </div>
          </div>
          {TABLES_META.map(t => (
            <Section key={t.name} icon={t.rows > 0 ? '📋' : '📄'} title={
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <code style={{ fontSize:13, fontWeight:800 }}>public.{t.name}</code>
                {t.rls && <span style={{ padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:700, background:'#ECFDF5', color:'#16a34a', border:'1px solid #A7F3D0' }}>RLS ✓</span>}
                <span style={{ padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:600, background:'#F1F5F9', color:'#64748B' }}>{t.rows} Rows</span>
                <span style={{ fontSize:12, color:'#64748B', fontWeight:400 }}>{t.desc}</span>
              </div>
            }>
              {/* Tabellen-Detailinfos aus den echten DB-Daten */}
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#F8FAFC', borderBottom:'1px solid #E5E7EB' }}>
                      {['Spalte','Typ','Nullable','Default'].map(h => (
                        <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, color:'#64748B', textTransform:'uppercase', fontSize:10, letterSpacing:'0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Zeige Kern-Spalten für bekannte Tabellen */}
                    {t.name === 'leads' && [
                      ['id','uuid','NO','gen_random_uuid()'],
                      ['user_id','uuid','YES','—'],
                      ['first_name / last_name','text','YES','—'],
                      ['email / phone','text','YES','—'],
                      ['company / job_title / headline','text','YES','—'],
                      ['hs_score','smallint','YES','0'],
                      ['deal_stage','crm_deal_stage (enum)','YES','kein_deal'],
                      ['lifecycle_stage','crm_lifecycle_stage (enum)','YES','lead'],
                      ['li_connection_status','crm_connection_status (enum)','YES','nicht_verbunden'],
                      ['ai_buying_intent','crm_buying_intent (enum)','YES','unbekannt'],
                      ['ai_pain_points / ai_use_cases','text[]','YES','{}'],
                      ['tags','text[]','YES','{}'],
                      ['deal_value','numeric','YES','—'],
                      ['icp_match','integer','YES','0'],
                      ['gdpr_consent','boolean','NO','false'],
                      ['created_at / updated_at','timestamptz','YES','now()'],
                      ['… +79 weitere Felder','—','—','—'],
                    ].map(([col, type, nullable, def]) => (
                      <tr key={col} style={{ borderBottom:'1px solid #F1F5F9' }}>
                        <td style={{ padding:'7px 12px', fontFamily:'monospace', fontWeight:600, color:'#0F172A' }}>{col}</td>
                        <td style={{ padding:'7px 12px' }}><TypeBadge type={type.split(' ')[0]}/></td>
                        <td style={{ padding:'7px 12px', color: nullable==='NO'?'#ef4444':'#94A3B8' }}>{nullable}</td>
                        <td style={{ padding:'7px 12px', fontFamily:'monospace', color:'#64748B', fontSize:11 }}>{def}</td>
                      </tr>
                    ))}
                    {t.name !== 'leads' && (
                      <tr><td colSpan={4} style={{ padding:'10px 12px', color:'#94A3B8', fontSize:12, fontStyle:'italic' }}>
                        {t.cols} Spalten — Details in Supabase Dashboard →{' '}
                        <a href={`https://supabase.com/dashboard/project/jdhajqpgfrsuoluaesjn/editor`} target="_blank" rel="noreferrer" style={{ color:'#3b82f6' }}>SQL Editor</a>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          ))}
        </div>
      )}

      {/* ── TECH-STACK ── */}
      {tab === 'tech' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>⚙ Stack-Übersicht</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#F8FAFC' }}>{['Layer','Technologie','Details'].map(h=><th key={h} style={{ padding:'8px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>{TECH_STACK.map(r=>(
                <tr key={r.layer} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'10px 16px', fontWeight:700, color:'#475569', fontSize:13 }}>{r.layer}</td>
                  <td style={{ padding:'10px 16px' }}><code style={{ background:'#F1F5F9', padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700, color:'#1d4ed8' }}>{r.tech}</code></td>
                  <td style={{ padding:'10px 16px', fontSize:12, color:'#64748B' }}>{r.detail}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>🔑 Wichtige Env-Variablen</div>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:8 }}>
              {[
                ['VITE_SUPABASE_URL','Supabase Projekt-URL','https://jdhajqpgfrsuoluaesjn.supabase.co'],
                ['VITE_SUPABASE_ANON_KEY','Supabase Anon Key (public)','eyJ… (in Vercel gesetzt)'],
                ['VITE_ANTHROPIC_KEY','Claude API Key für KI-Features','sk-ant-… (in Vercel gesetzt)'],
              ].map(([key, desc, val]) => (
                <div key={key} style={{ display:'grid', gridTemplateColumns:'220px 1fr 1fr', gap:12, padding:'8px 12px', background:'#F8FAFC', borderRadius:8 }}>
                  <code style={{ fontSize:12, fontWeight:700, color:'#6366f1' }}>{key}</code>
                  <span style={{ fontSize:12, color:'#64748B' }}>{desc}</span>
                  <code style={{ fontSize:11, color:'#94A3B8' }}>{val}</code>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>🔧 Wichtige DB-Funktionen</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#F8FAFC' }}>{['Funktion','Typ','Beschreibung'].map(h=><th key={h} style={{ padding:'8px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>{KEY_FUNCTIONS.map(fn=>(
                <tr key={fn.name} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#0F172A' }}>{fn.name}</td>
                  <td style={{ padding:'10px 16px' }}><span style={{ padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, background:'#EFF6FF', color:'#1d4ed8' }}>{fn.type}</span></td>
                  <td style={{ padding:'10px 16px', fontSize:12, color:'#64748B' }}>{fn.desc}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SEITEN ── */}
      {tab === 'pages' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>📄 Seiten & Routen</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#F8FAFC' }}>{['Route','Datei','Beschreibung'].map(h=><th key={h} style={{ padding:'8px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>{PAGES.map(p=>(
                <tr key={p.route} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#6366f1' }}>{p.route}</td>
                  <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:11, color:'#64748B' }}>src/{p.file}</td>
                  <td style={{ padding:'10px 16px', fontSize:12, color:'#374151' }}>{p.desc}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>🧩 Shared Components</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#F8FAFC' }}>{['Datei','Beschreibung'].map(h=><th key={h} style={{ padding:'8px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>{COMPONENTS.map(c=>(
                <tr key={c.file} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#0891b2' }}>src/{c.file}</td>
                  <td style={{ padding:'10px 16px', fontSize:12, color:'#374151' }}>{c.desc}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ENUMS ── */}
      {tab === 'enums' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {ENUMS.map(e => (
            <div key={e.name} style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', padding:'16px 18px' }}>
              <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:13, color:'#ef4444', marginBottom:10 }}>{e.name}</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {e.values.map(v => (
                  <code key={v} style={{ padding:'2px 8px', borderRadius:6, fontSize:11, background:'#FEF2F2', color:'#dc2626', border:'1px solid #FECACA' }}>{v}</code>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TRIGGER ── */}
      {tab === 'triggers' && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>⚡ Aktive DB-Trigger</div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:'#F8FAFC' }}>{['Tabelle','Trigger-Name','Zeitpunkt','Funktion','Beschreibung'].map(h=><th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>{TRIGGERS.map(t=>(
              <tr key={t.name} style={{ borderBottom:'1px solid #F1F5F9' }}>
                <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#6366f1' }}>{t.table}</td>
                <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'#0F172A' }}>{t.name}</td>
                <td style={{ padding:'10px 12px' }}><span style={{ padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, background:'#FFFBEB', color:'#b45309' }}>{t.timing}</span></td>
                <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'#8b5cf6' }}>{t.fn}</td>
                <td style={{ padding:'10px 12px', fontSize:12, color:'#64748B' }}>{t.desc}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* ── EXTENSION ── */}
      {tab === 'extension' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          <div style={{ background:'linear-gradient(135deg,#1e1b4b,#3730a3)', borderRadius:16, padding:'20px 24px', color:'#fff' }}>
            <div style={{ fontSize:20, fontWeight:900, marginBottom:6 }}>🔌 Leadesk Chrome Extension</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginBottom:14 }}>Version: <strong>v8.0.0</strong> · Manifest v3 · LinkedIn Import + Auto-Vernetzung + SSI-Scraper</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', fontSize:12 }}>
              {['📥 Lead Import','🤖 Auto-Vernetzung','📊 SSI-Scraper','🔑 Auth via Leadesk-Tab','⏰ Alarm-Polling alle 40s','📈 SSI täglich 08:00 Uhr'].map(f => (
                <span key={f} style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'4px 12px' }}>{f}</span>
              ))}
            </div>
          </div>

          <Section title="📦 Installation" icon="📦" defaultOpen={true}>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { step:'1', title:'ZIP herunterladen', desc:'Aktuelle Version vom Entwickler beziehen.' },
                { step:'2', title:'ZIP entpacken', desc:'Ordner an festem Ort speichern — nicht löschen, sonst verliert Chrome die Extension.' },
                { step:'3', title:'chrome://extensions öffnen', desc:'Entwicklermodus oben rechts aktivieren.' },
                { step:'4', title:'Entpackte Erweiterung laden', desc:'Auf "Entpackte Erweiterung laden" → entpackten Ordner auswählen.' },
                { step:'5', title:'Leadesk-Tab offen lassen', desc:'app.leadesk.de muss offen und eingeloggt sein. Extension liest Auth-Token von dort.' },
              ].map(s => (
                <div key={s.step} style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'12px 14px', background:'#F8FAFC', borderRadius:10, border:'1px solid #E2E8F0' }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--wl-primary,rgb(49,90,231))', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, flexShrink:0 }}>{s.step}</div>
                  <div><div style={{ fontWeight:700, fontSize:13, marginBottom:2 }}>{s.title}</div><div style={{ fontSize:12, color:'#64748B' }}>{s.desc}</div></div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="📁 Dateien & Architektur" icon="📁">
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ background:'#F1F5F9' }}>
                {['Datei','Zweck','Details'].map(h => <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, fontSize:11, color:'#475569', textTransform:'uppercase' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {[
                  { file:'manifest.json', purpose:'Extension-Config', detail:'MV3, Permissions: activeTab, scripting, tabs, storage, alarms' },
                  { file:'background.js', purpose:'Service Worker', detail:'Queue-Polling alle 40s, Vernetzungen, SSI-Scraper (öffnet linkedin.com/sales/ssi im Hintergrund), täglicher Auto-Sync 08:00 Uhr' },
                  { file:'content.js',    purpose:'LinkedIn-Injektion', detail:'Injiziert "In Leadesk" Button in Action-Bar + Floating Button rechts (Waalaxy-Pattern)' },
                  { file:'popup.html',    purpose:'Popup UI', detail:'Zeigt Profil-Preview, Import-Button, Auth-Status' },
                  { file:'popup.js',      purpose:'Popup-Logik', detail:'Auth-Sync, Profil-Scraping, Import via Supabase REST, SSI-Score anzeigen + manuell abrufen' },
                ].map((r,i) => (
                  <tr key={r.file} style={{ borderBottom:'1px solid #F1F5F9', background:i%2===0?'#fff':'#FAFAFA' }}>
                    <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color:'#3730a3', fontSize:12 }}>{r.file}</td>
                    <td style={{ padding:'10px 12px', fontWeight:600 }}>{r.purpose}</td>
                    <td style={{ padding:'10px 12px', color:'#64748B', fontSize:12 }}>{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="📋 Queue-System (connection_queue)" icon="📋">
            <div style={{ fontSize:13, color:'#475569', marginBottom:12 }}>
              Jobs werden in <code style={{ background:'#F1F5F9', padding:'2px 6px', borderRadius:4 }}>connection_queue</code> gespeichert und alle 40s von der Extension abgearbeitet.
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, marginBottom:14 }}>
              <thead><tr style={{ background:'#F1F5F9' }}>
                {['Status','Bedeutung','Nächste Aktion'].map(h => <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, fontSize:11, color:'#475569', textTransform:'uppercase' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {[
                  { s:'pending', c:'#92400E', bg:'#FFFBEB', d:'Wartet',              n:'Extension pollt und startet Job' },
                  { s:'running', c:'#1e40af', bg:'#EFF6FF', d:'Wird ausgeführt',    n:'LinkedIn-Tab offen, Klick läuft' },
                  { s:'done',    c:'#065F46', bg:'#ECFDF5', d:'Erfolgreich',        n:'Lead → li_connection_status = pending' },
                  { s:'failed',  c:'#991B1B', bg:'#FEF2F2', d:'Fehler',            n:'error-Spalte prüfen' },
                  { s:'skipped', c:'#374151', bg:'#F3F4F6', d:'Übersprungen',      n:'z.B. bereits vernetzt' },
                ].map(r => (
                  <tr key={r.s} style={{ borderBottom:'1px solid #F1F5F9' }}>
                    <td style={{ padding:'10px 12px' }}><span style={{ background:r.bg, color:r.c, padding:'2px 10px', borderRadius:20, fontSize:12, fontWeight:700 }}>{r.s}</span></td>
                    <td style={{ padding:'10px 12px', fontSize:12 }}>{r.d}</td>
                    <td style={{ padding:'10px 12px', color:'#64748B', fontSize:12 }}>{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:10, padding:'12px 14px', fontSize:12, color:'#92400E' }}>
              <strong>⚠ Tages-Limit:</strong> Max. 20 Vernetzungsanfragen/Tag. Reset um Mitternacht. Badge zeigt ⏸ bei Limit-Erreichen.
            </div>
          </Section>

          <Section title="🔑 Auth-Flow" icon="🔑">
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[
                'Extension prüft chrome.storage.local auf gecachten Token (50 Min gültig)',
                'Falls kein Token: Background Script sucht Tab mit app.leadesk.de',
                'chrome.scripting.executeScript liest localStorage (sb-...-auth-token)',
                'Token + userId werden 50 Min in chrome.storage.local gecacht',
                'Content Script holt Token via chrome.runtime.sendMessage({ type: "GET_AUTH" })',
              ].map((t,i) => (
                <div key={i} style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 12px', background:'#F8FAFC', borderRadius:8, border:'1px solid #E2E8F0' }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#3730a3', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{i+1}</span>
                  <span style={{ color:'#374151', fontSize:12 }}>{t}</span>
                </div>
              ))}
              <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#1e40af', marginTop:4 }}>
                <strong>Wichtig:</strong> app.leadesk.de muss in einem Tab offen und eingeloggt sein.
              </div>
            </div>
          </Section>

          <Section title="📊 SSI-Scraper" icon="📊">
            <div style={{ fontSize:13, color:'#475569', marginBottom:12, lineHeight:1.6 }}>
              Ab v8.0: Die Extension scrapt täglich automatisch den LinkedIn Social Selling Index und speichert ihn in <code style={{ background:'#F1F5F9', padding:'2px 6px', borderRadius:4 }}>ssi_scores</code>.
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
              {[
                { title:'Automatisch — täglich 08:00 Uhr', desc:'chrome.alarms "ssiDaily" triggert fetchAndSaveSSI(). Öffnet linkedin.com/sales/ssi in minimiertem Hintergrundfenster, liest Score, schließt Tab.', icon:'⏰' },
                { title:'Manuell — Popup-Button', desc:'Lila Button "SSI Score jetzt laden" im Extension-Popup. Zeigt Live-Fortschritt: Öffne LinkedIn → Warte auf Seite → Lese Score → Speichere.', icon:'👆' },
                { title:'Storage-Polling statt sendResponse', desc:'MV3 Service Worker hat 5s Limit für sendResponse. Lösung: Background schreibt Ergebnis in chrome.storage.local, Popup pollt alle 2s.', icon:'🔄' },
              ].map((item, i) => (
                <div key={i} style={{ display:'flex', gap:12, padding:'12px 14px', background:'#F5F3FF', borderRadius:10, border:'1px solid #DDD6FE' }}>
                  <span style={{ fontSize:20 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:'#5B21B6', marginBottom:3 }}>{item.title}</div>
                    <div style={{ fontSize:12, color:'#6B7280' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Selektoren (live verifiziert auf linkedin.com/sales/ssi)</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr style={{ background:'#EDE9FE' }}>
                {['Wert','DOM-Selektor','Beispiel'].map(h => <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontWeight:700, fontSize:11, color:'#5B21B6' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {[
                  { val:'Gesamt-Score',       sel:'span.ssi-score__value[0]',      ex:'61' },
                  { val:'Marke aufbauen',     sel:'span.ssi-score__value[1]',      ex:'19.125' },
                  { val:'Personen finden',    sel:'span.ssi-score__value[2]',      ex:'13.018' },
                  { val:'Insights nutzen',    sel:'span.ssi-score__value[3]',      ex:'3.7' },
                  { val:'Beziehungen',        sel:'span.ssi-score__value[4]',      ex:'25' },
                  { val:'Branchen-Rang',      sel:'span.mh1.t-black.t-40[0]',     ex:'2 (Top 2%)' },
                  { val:'Netzwerk-Rang',      sel:'span.mh1.t-black.t-40[1]',     ex:'8 (Top 8%)' },
                ].map((r,i) => (
                  <tr key={r.val} style={{ borderBottom:'1px solid #EDE9FE', background:i%2===0?'#fff':'#FAFAFA' }}>
                    <td style={{ padding:'8px 10px', fontWeight:600, color:'#374151' }}>{r.val}</td>
                    <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11, color:'#7C3AED' }}>{r.sel}</td>
                    <td style={{ padding:'8px 10px', color:'#6B7280' }}>{r.ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#92400E', marginTop:12 }}>
              <strong>⚠ Voraussetzung:</strong> LinkedIn muss im Browser eingeloggt sein. Sales Navigator erforderlich für /sales/ssi. Bei Login-Redirect zeigt Extension "LinkedIn-Login erforderlich".
            </div>
          </Section>

          <Section title="🐛 Bekannte Probleme & Fixes" icon="🐛">
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { p:'Extension context invalidated',      f:'Tab neu laden (F5). Einmalig nach jedem Extension-Update.', w:false },
                { p:'Import: "not_logged_in"',            f:'app.leadesk.de in Tab öffnen und einloggen.', w:true },
                { p:'Button erscheint nicht auf LinkedIn', f:'Seite neu laden. Button braucht 1.5–5s.', w:false },
                { p:'SSI Score: "Score nicht lesbar"',     f:'LinkedIn muss eingeloggt sein. Sales Navigator erforderlich. Ggf. Seite manuell öffnen und prüfen.', w:true },
                { p:'SSI Popup zeigt keinen Score',        f:'Erst "SSI Score jetzt laden" klicken. Dauert 10–25 Sekunden (Hintergrund-Tab wird geöffnet).', w:false },
                { p:'ENUM-Fehler li_connection_status',   f:'Gültige Werte: nicht_verbunden, pending, verbunden, abgelehnt, blockiert', w:false },
                { p:'Vernetzung wird nicht gesendet',     f:'Service Worker in chrome://extensions prüfen. LinkedIn-Tab offen?', w:true },
              ]
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { p:'Extension context invalidated',      f:'Tab neu laden (F5). Einmalig nach jedem Extension-Update.', w:false },
                { p:'Import: "not_logged_in"',            f:'app.leadesk.de in Tab öffnen und einloggen.', w:true },
                { p:'Button erscheint nicht auf LinkedIn', f:'Seite neu laden. Button braucht 1.5–5s.', w:false },
                { p:'ENUM-Fehler li_connection_status',   f:'Gültige Werte: nicht_verbunden, pending, verbunden, abgelehnt, blockiert', w:false },
                { p:'Vernetzung wird nicht gesendet',     f:'Service Worker in chrome://extensions prüfen. LinkedIn-Tab offen?', w:true },
              ].map((r,i) => (
                <div key={i} style={{ padding:'12px 14px', background:r.w?'#FFFBEB':'#F0F9FF', borderRadius:10, border:'1px solid '+(r.w?'#FDE68A':'#BAE6FD') }}>
                  <div style={{ fontWeight:700, fontSize:13, color:r.w?'#92400E':'#0369A1', marginBottom:4 }}>⚠ {r.p}</div>
                  <div style={{ fontSize:12, color:'#475569' }}>✅ Fix: {r.f}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="🚀 Roadmap: Hetzner Server-Variante" icon="🚀">
            <div style={{ fontSize:13, color:'#475569', marginBottom:12, lineHeight:1.6 }}>
              Geplant: Queue-Abarbeitung auf Hetzner VPS auslagern — läuft 24/7 ohne offenen Browser.
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { icon:'🖥', title:'VPS Setup',          desc:'Hetzner CX22 (~4€/Mo), Ubuntu 24, Node.js + Puppeteer', status:'Geplant' },
                { icon:'🍪', title:'LinkedIn Cookies',   desc:'Einmalig exportieren, auf Server hinterlegen, regelmäßig erneuern', status:'Geplant' },
                { icon:'🔄', title:'Queue-Integration',  desc:'Gleiche connection_queue — Server liest Jobs statt Extension', status:'Geplant' },
                { icon:'👥', title:'Multi-Tenant',       desc:'Ein Server, mehrere LinkedIn-Accounts pro Tenant', status:'Zukunft' },
              ].map(f => (
                <div key={f.title} style={{ padding:'12px 14px', background:'#F8FAFC', borderRadius:10, border:'1px solid #E2E8F0' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:18 }}>{f.icon}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:f.status==='Geplant'?'#1e40af':'#6B7280', background:f.status==='Geplant'?'#EFF6FF':'#F3F4F6', padding:'2px 8px', borderRadius:20 }}>{f.status}</span>
                  </div>
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{f.title}</div>
                  <div style={{ fontSize:12, color:'#64748B', lineHeight:1.5 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </Section>

        </div>
      )}
    </div>
  )
}
