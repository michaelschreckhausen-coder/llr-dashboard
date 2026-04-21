// src/constants/orgLabels.js
// Labels für ENUM-Werte in der Orga-UI (IHK-Umsatzstaffelung)
// Industries kommen dynamisch aus public.industries (Lookup-Tabelle).

export const REVENUE_RANGES = [
  { id: 'bis_50k',      label: 'bis 50.000 €' },
  { id: '50k_250k',     label: '50.000 – 250.000 €' },
  { id: '250k_500k',    label: '250.000 – 500.000 €' },
  { id: '500k_1m',      label: '500.000 € – 1 Mio' },
  { id: '1m_2_5m',      label: '1 – 2,5 Mio €' },
  { id: '2_5m_5m',      label: '2,5 – 5 Mio €' },
  { id: '5m_10m',       label: '5 – 10 Mio €' },
  { id: '10m_25m',      label: '10 – 25 Mio €' },
  { id: '25m_50m',      label: '25 – 50 Mio €' },
  { id: '50m_100m',     label: '50 – 100 Mio €' },
  { id: '100m_250m',    label: '100 – 250 Mio €' },
  { id: 'ueber_250m',   label: 'mehr als 250 Mio €' },
]

export const REVENUE_LABEL = Object.fromEntries(REVENUE_RANGES.map(r => [r.id, r.label]))

export const EMPLOYEE_RANGES = [
  { id: '1',          label: 'Selbständig/Freelancer (1)' },
  { id: '2-10',       label: '2 – 10 Mitarbeitende' },
  { id: '11-50',      label: '11 – 50 Mitarbeitende' },
  { id: '51-200',     label: '51 – 200 Mitarbeitende' },
  { id: '201-500',    label: '201 – 500 Mitarbeitende' },
  { id: '501-1000',   label: '501 – 1.000 Mitarbeitende' },
  { id: '1001-5000',  label: '1.001 – 5.000 Mitarbeitende' },
  { id: '5001-10000', label: '5.001 – 10.000 Mitarbeitende' },
  { id: '10001+',     label: '10.001+ Mitarbeitende' },
]

export const EMPLOYEE_LABEL = Object.fromEntries(EMPLOYEE_RANGES.map(r => [r.id, r.label]))
