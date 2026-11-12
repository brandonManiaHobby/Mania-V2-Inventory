import { toDateKey } from '../data'

// SHARED — date range selector. Returns {from,to} keys. Mirrors V1's dashboard
// ranges (week blocks Mon–Sun, months, YTD, lifetime) plus custom dates.
export const RANGES = [
  { k: 'thisweek', label: 'This week' },
  { k: 'lastweek', label: 'Last week' },
  { k: '2weeks', label: '2 weeks' },
  { k: '1month', label: '1 month' },
  { k: '3months', label: '3 months' },
  { k: 'ytd', label: 'Year to date' },
  { k: 'all', label: 'Lifetime' },
  { k: 'custom', label: 'Custom' },
]

const mondayOf = (d) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x }

export function rangeDates(k, cFrom, cTo) {
  const today = new Date()
  const end = toDateKey(today)
  if (k === 'thisweek') return { from: toDateKey(mondayOf(today)), to: end }
  if (k === 'lastweek') { const m = mondayOf(today); const s = new Date(m); s.setDate(s.getDate() - 7); const e = new Date(m); e.setDate(e.getDate() - 1); return { from: toDateKey(s), to: toDateKey(e) } }
  if (k === '2weeks') { const m = mondayOf(today); m.setDate(m.getDate() - 7); return { from: toDateKey(m), to: end } }
  if (k === '1month') { const d = new Date(today); d.setMonth(d.getMonth() - 1); return { from: toDateKey(d), to: end } }
  if (k === '3months') { const d = new Date(today); d.setMonth(d.getMonth() - 3); return { from: toDateKey(d), to: end } }
  if (k === 'ytd') return { from: toDateKey(new Date(today.getFullYear(), 0, 1)), to: end }
  if (k === 'custom') return { from: cFrom || toDateKey(mondayOf(today)), to: cTo || end }
  return { from: '2000-01-01', to: end } // all / lifetime
}

export const rangeLabelOf = (k) => (RANGES.find((r) => r.k === k) || {}).label || k

export default function RangePicker({ value, onChange, cFrom, cTo, onCustom }) {
  const chip = (active) => ({ padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: active ? 700 : 400, background: active ? '#fff' : 'transparent' })
  const dateInput = { padding: '5px 8px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit', fontSize: 12, background: 'var(--card)', color: 'var(--ink)' }
  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999, flexWrap: 'wrap' }}>
        {RANGES.map((r) => (
          <button key={r.k} onClick={() => onChange(r.k)} style={chip(value === r.k)}>{r.label}</button>
        ))}
      </div>
      {value === 'custom' && onCustom && (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="date" style={dateInput} value={cFrom || ''} max={cTo || undefined} onChange={(e) => onCustom(e.target.value, cTo)} />
          <span className="note">to</span>
          <input type="date" style={dateInput} value={cTo || ''} min={cFrom || undefined} onChange={(e) => onCustom(cFrom, e.target.value)} />
        </span>
      )}
    </div>
  )
}
