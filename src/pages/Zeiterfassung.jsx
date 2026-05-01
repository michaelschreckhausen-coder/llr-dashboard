// src/pages/Zeiterfassung.jsx
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTeam } from '../context/TeamContext'
import TimeEntryQuickAdd from '../components/delivery/TimeEntryQuickAdd'

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function startOfWeekMonday(date) {
  const d = new Date(date)
  const day = d.getDay() // 0=So, 1=Mo
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d }
function fmtISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
function fmtHumanDate(date) {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
function secondsToHHMM(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}
function secondsToHoursDecimal(seconds) {
  return (seconds / 3600).toFixed(2).replace('.', ',')
}

export default function Zeiterfassung() {
  const { activeTeamId } = useTeam()
  const [weekAnchor, setWeekAnchor] = useState(new Date())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [error, setError] = useState(null)

  const weekStart = useMemo(() => startOfWeekMonday(weekAnchor), [weekAnchor])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const loadEntries = async () => {
    if (!activeTeamId) return
    setLoading(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setEntries([]); return }
      const { data, error: err } = await supabase
        .from('pm_time_entries')
        .select(`
          id, project_id, task_id, activity_type_id,
          started_at, ended_at, duration_seconds, entry_date,
          description, is_billable, hourly_rate_cents, is_invoiced,
          pm_projects(id, name),
          pm_tasks(id, title),
          pm_activity_types(id, name, color)
        `)
        .eq('user_id', user.id)
        .gte('entry_date', fmtISODate(weekStart))
        .lte('entry_date', fmtISODate(weekEnd))
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: true })

      if (err) throw err
      setEntries(data || [])
    } catch (err) {
      setError(err.message || 'Laden fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadEntries() /* eslint-disable-next-line */ }, [activeTeamId, weekStart.getTime()])

  // Gruppieren: (project_id, task_id, activity_type_id) -> Zeile
  const rows = useMemo(() => {
    const map = new Map()
    for (const e of entries) {
      const key = `${e.project_id}|${e.task_id || 'noTask'}|${e.activity_type_id || 'noActivity'}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          project: e.pm_projects,
          task: e.pm_tasks,
          activity: e.pm_activity_types,
          isBillable: e.is_billable,
          byDay: {},
          totalSeconds: 0,
        })
      }
      const r = map.get(key)
      r.byDay[e.entry_date] = (r.byDay[e.entry_date] || 0) + (e.duration_seconds || 0)
      r.totalSeconds += (e.duration_seconds || 0)
    }
    return Array.from(map.values()).sort((a, b) => {
      const an = a.project?.name || ''
      const bn = b.project?.name || ''
      return an.localeCompare(bn, 'de')
    })
  }, [entries])

  const dailyTotals = useMemo(() => {
    const totals = {}
    for (const e of entries) {
      totals[e.entry_date] = (totals[e.entry_date] || 0) + (e.duration_seconds || 0)
    }
    return totals
  }, [entries])

  const weekTotalSeconds = useMemo(
    () => Object.values(dailyTotals).reduce((a, b) => a + b, 0),
    [dailyTotals]
  )
  const billableSeconds = useMemo(
    () => entries.filter(e => e.is_billable).reduce((a, e) => a + (e.duration_seconds || 0), 0),
    [entries]
  )
  const billabilityPct = weekTotalSeconds === 0 ? 0 : Math.round((billableSeconds / weekTotalSeconds) * 100)

  const isCurrentWeek = useMemo(() => {
    const tw = startOfWeekMonday(new Date())
    return tw.getTime() === weekStart.getTime()
  }, [weekStart])

  return (
    <div style={{ padding: 24, paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Zeiterfassung</h1>
          <div style={{ fontSize: 13, color: 'rgb(107,114,128)', marginTop: 4 }}>
            {fmtHumanDate(weekStart)} – {fmtHumanDate(weekEnd)}.{weekEnd.getFullYear()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setWeekAnchor(addDays(weekStart, -7))} style={navBtn}>‹ Vorher</button>
          <button
            onClick={() => setWeekAnchor(new Date())}
            disabled={isCurrentWeek}
            style={{ ...navBtn, opacity: isCurrentWeek ? 0.5 : 1 }}
          >
            Heute
          </button>
          <button onClick={() => setWeekAnchor(addDays(weekStart, 7))} style={navBtn}>Nächste ›</button>
          <button
            onClick={() => setQuickAddOpen(true)}
            style={{
              padding: '8px 14px', backgroundColor: 'var(--wl-primary, rgb(49,90,231))', color: 'white',
              border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginLeft: 8,
            }}
          >
            + Zeit nachtragen
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Kpi label="Wochensumme" value={`${secondsToHoursDecimal(weekTotalSeconds)} h`} />
        <Kpi label="Abrechenbar" value={`${secondsToHoursDecimal(billableSeconds)} h`} />
        <Kpi label="Billability" value={`${billabilityPct} %`} />
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid rgb(229,231,235)', borderRadius: 8, backgroundColor: 'white' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880, fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: 'rgb(249,250,251)', borderBottom: '1px solid rgb(229,231,235)' }}>
              <th style={{ ...thStyle, textAlign: 'left', minWidth: 280 }}>Projekt / Task / Tätigkeit</th>
              {weekDays.map((d, i) => (
                <th key={i} style={{ ...thStyle, minWidth: 70 }}>
                  <div>{DAYS[i]}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, color: 'rgb(107,114,128)' }}>{fmtHumanDate(d)}</div>
                </th>
              ))}
              <th style={{ ...thStyle, minWidth: 70, backgroundColor: 'rgb(243,244,246)' }}>Σ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'rgb(107,114,128)' }}>Lädt…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'rgb(107,114,128)' }}>
                Keine Einträge in dieser Woche.
              </td></tr>
            ) : rows.map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid rgb(243,244,246)' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500 }}>{row.project?.name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'rgb(107,114,128)', marginTop: 2 }}>
                    {row.task?.title || 'Ohne Task'}
                    {row.activity?.name && (
                      <span style={{
                        marginLeft: 6, padding: '1px 6px', borderRadius: 3,
                        backgroundColor: row.activity.color || 'rgb(229,231,235)',
                        color: 'white', fontSize: 10, fontWeight: 500,
                      }}>
                        {row.activity.name}
                      </span>
                    )}
                    {!row.isBillable && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'rgb(107,114,128)' }}>· nicht abrechenbar</span>
                    )}
                  </div>
                </td>
                {weekDays.map((d, i) => {
                  const seconds = row.byDay[fmtISODate(d)] || 0
                  return (
                    <td key={i} style={{ ...tdStyle, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      {seconds > 0 ? secondsToHHMM(seconds) : <span style={{ color: 'rgb(209,213,219)' }}>·</span>}
                    </td>
                  )
                })}
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, backgroundColor: 'rgb(249,250,251)', fontVariantNumeric: 'tabular-nums' }}>
                  {secondsToHHMM(row.totalSeconds)}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: 'rgb(243,244,246)', fontWeight: 600 }}>
                <td style={tdStyle}>Tagessumme</td>
                {weekDays.map((d, i) => (
                  <td key={i} style={{ ...tdStyle, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {secondsToHHMM(dailyTotals[fmtISODate(d)] || 0) || <span style={{ color: 'rgb(209,213,219)' }}>·</span>}
                  </td>
                ))}
                <td style={{ ...tdStyle, textAlign: 'center', backgroundColor: 'rgb(229,231,235)', fontVariantNumeric: 'tabular-nums' }}>
                  {secondsToHHMM(weekTotalSeconds)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <TimeEntryQuickAdd
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={() => loadEntries()}
      />
    </div>
  )
}

const navBtn = {
  padding: '6px 12px', backgroundColor: 'white',
  border: '1px solid rgb(209,213,219)', borderRadius: 4,
  fontSize: 13, cursor: 'pointer',
}
const thStyle = { padding: '10px 8px', fontSize: 12, fontWeight: 600, textAlign: 'center', color: 'rgb(55,65,81)' }
const tdStyle = { padding: '10px 8px', verticalAlign: 'top' }

function Kpi({ label, value }) {
  return (
    <div style={{ padding: '10px 16px', backgroundColor: 'white', border: '1px solid rgb(229,231,235)', borderRadius: 6, minWidth: 140 }}>
      <div style={{ fontSize: 11, color: 'rgb(107,114,128)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}
