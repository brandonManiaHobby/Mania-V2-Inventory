import { toDateKey, parseLocalDate } from '../data'

// SHARED — date range selector. Returns {from,to} keys. Covers V1's ranges
// incl all-time ("Historic"). Reused across all analytics screens.
export const RANGES = [
  { k: '7d', label: '7 days' },
  { k: '30d', label: '30 days' },
  { k: 'mtd', label: 'This month' },
  { k: 'qtd', label: 'Quarter' },
  { k: 'ytd', label: 'Year' },
  { k: 'all', label: 'All time' },
]

export function rangeDates(k) {
  const today = new Date()
  const end = toDateKey(today)
  const d = new Date(today)
  if (k === '7d') { d.setDate(d.getDate() - 6); return { from: toDateKey(d), to: end } }
  if (k === '30d') { d.setDate(d.getDate() - 29); return { from: toDateKey(d), to: end } }
  if (k === 'mtd') return { from: toDateKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: end }
  if (k === 'qtd') { const q = Math.floor(today.getMonth() / 3) * 3; return { from: toDateKey(new Date(today.getFullYear(), q, 1)), to: end } }
  if (k === 'ytd') return { from: toDateKey(new Date(today.getFullYear(), 0, 1)), to: end }
  return { from: '2000-01-01', to: end } // all
}

export default function RangePicker({ value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: '#f0efec', borderRadius: 999, flexWrap: 'wrap' }}>
      {RANGES.map((r) => (
        <button key={r.k} onClick={() => onChange(r.k)}
          style={{ padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12,
            fontWeight: value === r.k ? 700 : 400, background: value === r.k ? '#fff' : 'transparent' }}>
          {r.label}
        </button>
      ))}
    </div>
  )
}
